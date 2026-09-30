#!/usr/bin/env node
'use strict';
// gate — command-line entry of the change-reviewer gate mode.
//
// Subcommands:
//   diff        read the worktree change as JSON (phase 2)
//   state-hash  print only the worktree state hash
//   prepare     diff + context discovery + machine rules → gate-context.json
//   finalize    re-hash + agent findings + overrides → gate.json, gate.md, exit code
//   run         prepare + finalize with machine rules only (report-only adoption, CI smoke)
//
// Exit codes (the gate contract; /flow-lite decides on these alone):
//   0  cleared
//   1  blocker
//   2  bad usage / invalid input
//   3  missing configuration or credential (profile, tracker command)
//   4  inconclusive — could not look (fail-closed)
//
// Zero deps. Node >= 18.

const fs = require('fs');
const path = require('path');
const { readDiff, readStateHash, WorktreeUnreadableError, InvalidBaseRefError, DEFAULT_MAX_PATCH_BYTES } = require('./lib/diff-reader');
const { GitReadOnlyError } = require('./lib/git-readonly');
const gate = require('./lib/gate-run');
const { ProfileError } = require('./lib/profile');
const { TrackerConfigError } = require('./lib/tracker');
const { SchemaError } = require('./lib/schema');
const { StageError } = require('./lib/stages');

const EXIT = gate.EXIT;

function usage() {
  return [
    'usage:',
    '  gate.js diff       --worktree <path> --base-ref <ref> [--max-patch-bytes N] [--out <file>]',
    '  gate.js state-hash --worktree <path> --base-ref <ref>',
    '  gate.js prepare    --worktree <path> --base-ref <ref> --item <key> --out <dir>',
    '                     [--manifest <file>] [--suite-result <file>] [--profile <path|name>]',
    '                     [--workspace-root <path>] [--iteration N] [--max-patch-bytes N] [--report-only]',
    '  gate.js finalize   --context <dir>/gate-context.json [--agent-findings <file>] [--overrides <file>]',
    '                     [--out <dir>] [--format json,md] [--report-only]',
    '  gate.js run        (same flags as prepare) [--overrides <file>] [--format json,md]',
    '',
    'stages (--stage, default change):',
    '  scope      before any code exists — needs --projection <file>',
    '  change     the worktree diff, last step before the commit',
    '  reconcile  files created by more than one item — needs --reconcile-report <file>',
    '',
    'exit codes: 0 cleared · 1 blocker · 2 bad usage · 3 missing config/credential · 4 inconclusive',
  ].join('\n');
}

const BOOLEAN_FLAGS = new Set(['report-only', 'help']);

function parseArgs(argv) {
  const out = { cmd: argv[0] || null, flags: {} };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new InvalidBaseRefError(`unexpected argument: ${a}`);
    const eq = a.indexOf('=');
    let key;
    let val;
    if (eq > 0) {
      key = a.slice(2, eq);
      val = a.slice(eq + 1);
    } else {
      key = a.slice(2);
      if (BOOLEAN_FLAGS.has(key)) { out.flags[key] = true; continue; }
      val = argv[i + 1];
      if (val === undefined || val.startsWith('--')) throw new InvalidBaseRefError(`--${key} requires a value`);
      i++;
    }
    out.flags[key] = val;
  }
  return out;
}

function requireFlag(flags, name) {
  if (!flags[name]) throw new InvalidBaseRefError(`--${name} is required`);
  return flags[name];
}

function intFlag(flags, name, fallback) {
  if (flags[name] === undefined) return fallback;
  const n = Number(flags[name]);
  if (!Number.isInteger(n) || n < 0) throw new InvalidBaseRefError(`--${name} must be a non-negative integer`);
  return n;
}

function gateOpts(flags) {
  return {
    worktree: path.resolve(requireFlag(flags, 'worktree')),
    baseRef: requireFlag(flags, 'base-ref'),
    item: requireFlag(flags, 'item'),
    out: path.resolve(requireFlag(flags, 'out')),
    manifest: flags.manifest ? path.resolve(flags.manifest) : null,
    suiteResult: flags['suite-result'] ? path.resolve(flags['suite-result']) : null,
    profile: flags.profile || null,
    workspaceRoot: flags['workspace-root'] ? path.resolve(flags['workspace-root']) : null,
    stage: flags.stage || 'change',
    projection: flags.projection ? path.resolve(flags.projection) : null,
    reconcileReport: flags['reconcile-report'] ? path.resolve(flags['reconcile-report']) : null,
    iteration: intFlag(flags, 'iteration', 1),
    maxPatchBytes: intFlag(flags, 'max-patch-bytes', undefined),
    reportOnly: Boolean(flags['report-only']),
    format: flags.format || 'json,md',
    overrides: flags.overrides ? path.resolve(flags.overrides) : null,
    agentFindings: flags['agent-findings'] ? path.resolve(flags['agent-findings']) : null,
  };
}

function main(argv) {
  const { cmd, flags } = parseArgs(argv);
  if (!cmd || cmd === 'help' || flags.help) {
    process.stdout.write(usage() + '\n');
    return EXIT.OK;
  }
  if (cmd === 'diff') {
    const result = readDiff({
      worktree: path.resolve(requireFlag(flags, 'worktree')),
      baseRef: requireFlag(flags, 'base-ref'),
      maxPatchBytes: intFlag(flags, 'max-patch-bytes', DEFAULT_MAX_PATCH_BYTES),
    });
    const json = JSON.stringify(result, null, 2) + '\n';
    if (flags.out) {
      const outPath = path.resolve(flags.out);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, json);
    } else {
      process.stdout.write(json);
    }
    return EXIT.OK;
  }
  if (cmd === 'state-hash') {
    process.stdout.write(readStateHash({ worktree: path.resolve(requireFlag(flags, 'worktree')), baseRef: requireFlag(flags, 'base-ref') }) + '\n');
    return EXIT.OK;
  }
  if (cmd === 'prepare') {
    const doc = gate.prepare(gateOpts(flags));
    const subjectSize = doc.diff
      ? `${doc.diff.files.length} file(s)`
      : doc.stage === 'scope'
        ? `${doc.subject.projectedFileCount} projected file(s), ~${doc.subject.projectedLines} line(s)`
        : `${doc.subject.collisionCount} collision(s)`;
    process.stdout.write(`[gate] prepared ${doc.item} at stage ${doc.stage}: ${subjectSize}, ${doc.machineFindings.length} machine finding(s), ` +
      `${doc.context.filesRead.length} context file(s) → ${path.join(doc.out, 'gate-context.json')}\n`);
    if (doc.missingRequiredCapabilities.length) {
      process.stdout.write(`[gate] required capabilities unavailable: ${doc.missingRequiredCapabilities.join(', ')} (finalize will be inconclusive)\n`);
    }
    return EXIT.OK;
  }
  if (cmd === 'finalize') {
    const r = gate.finalize({
      context: path.resolve(requireFlag(flags, 'context')),
      out: flags.out ? path.resolve(flags.out) : null,
      format: flags.format || 'json,md',
      reportOnly: Boolean(flags['report-only']),
      overrides: flags.overrides ? path.resolve(flags.overrides) : null,
      agentFindings: flags['agent-findings'] ? path.resolve(flags['agent-findings']) : null,
      allowMachineOnly: Boolean(flags['report-only']),
    });
    process.stdout.write(gate.summaryLine(r) + '\n');
    return r.exitCode;
  }
  if (cmd === 'run') {
    const r = gate.run(gateOpts(flags));
    process.stdout.write(gate.summaryLine(r) + '\n');
    return r.exitCode;
  }
  throw new InvalidBaseRefError(`unknown subcommand: ${cmd}`);
}

if (require.main === module) {
  let code;
  try {
    code = main(process.argv.slice(2));
  } catch (e) {
    if (e instanceof InvalidBaseRefError || e instanceof StageError) {
      process.stderr.write(`[gate] invalid input: ${e.message}\n${usage()}\n`);
      code = EXIT.USAGE;
    } else if (e instanceof ProfileError || e instanceof TrackerConfigError) {
      process.stderr.write(`[gate] missing configuration: ${e.message}\n`);
      code = EXIT.CONFIG;
    } else if (e instanceof WorktreeUnreadableError) {
      process.stderr.write(`[gate] inconclusive: ${e.message}\n`);
      code = EXIT.INCONCLUSIVE;
    } else if (e instanceof GitReadOnlyError) {
      process.stderr.write(`[gate] inconclusive: read-only violation: ${e.message}\n`);
      code = EXIT.INCONCLUSIVE;
    } else if (e instanceof SchemaError) {
      process.stderr.write(`[gate] inconclusive: ${e.message}\n`);
      code = EXIT.INCONCLUSIVE;
    } else {
      process.stderr.write(`[gate] inconclusive: ${e.stack || e.message}\n`);
      code = EXIT.INCONCLUSIVE;
    }
  }
  process.exit(code);
}

module.exports = { EXIT, main, parseArgs };
