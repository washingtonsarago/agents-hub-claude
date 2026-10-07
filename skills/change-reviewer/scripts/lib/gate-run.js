'use strict';
// gate-run — prepare → (agent judges) → finalize.
//
// prepare  reads the diff, discovers context, evaluates the machine rules,
//          checks capabilities and writes gate-context.json: everything the
//          agent needs, plus the state hash the verdict will be pinned to.
// finalize re-hashes the worktree, validates the agent's findings against
//          the schema, applies overrides, decides verdict and exit code, and
//          writes gate.json and gate.md together from one result object.
// run      prepare + finalize with no agent findings (machine rules only).
//          Used for --report-only adoption and for CI smoke checks.
//
// Exit code contract: 0 cleared · 1 blocker · 2 bad input · 3 missing config
// or credential · 4 inconclusive. 4 is fail-closed on purpose.

const fs = require('fs');
const path = require('path');
const { readDiff, readStateHash, WorktreeUnreadableError, InvalidBaseRefError } = require('./diff-reader');
const { discoverContext } = require('./context');
const { loadProfile, ProfileError } = require('./profile');
const { buildRuleSet, evaluateMachineRules, applyContext, CORE_RULES } = require('./rules');
const { validateAgentFindings, validateOverrides, validateGateResult, SchemaError } = require('./schema');
const { renderGateMarkdown } = require('./render-md');
const { matchesAny } = require('./glob');
const stages = require('./stages');
const tracker = require('./tracker');

const EXIT = Object.freeze({ OK: 0, BLOCKER: 1, USAGE: 2, CONFIG: 3, INCONCLUSIVE: 4 });

function utcNow() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }

function readJSON(p, what) {
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch (e) { throw new InvalidBaseRefError(`${what} not readable: ${p} (${e.message})`); }
  try { return JSON.parse(raw); } catch (e) { throw new InvalidBaseRefError(`${what} is not valid JSON: ${p} (${e.message})`); }
}

function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

function validateManifest(m) {
  if (!m || typeof m !== 'object') throw new InvalidBaseRefError('ownership manifest must be an object');
  if (m.schemaVersion !== 1) throw new InvalidBaseRefError('ownership manifest schemaVersion must be 1');
  if (!Array.isArray(m.items)) throw new InvalidBaseRefError('ownership manifest items must be an array');
  if (m.ownership && typeof m.ownership !== 'object') throw new InvalidBaseRefError('ownership manifest ownership must be an object');
  return m;
}

function validateSuite(s) {
  if (!s || typeof s !== 'object') throw new InvalidBaseRefError('suite result must be an object');
  if (!['passed', 'failed', 'not-run'].includes(s.status)) throw new InvalidBaseRefError('suite result status must be passed|failed|not-run');
  return s;
}

// ---- prepare ----------------------------------------------------------------

function prepare(opts) {
  const startedAt = Date.now();
  const worktree = path.resolve(opts.worktree);
  const out = path.resolve(opts.out);
  const item = opts.item;
  if (!item) throw new InvalidBaseRefError('--item is required');

  const profile = loadProfile({ worktree, profilePath: opts.profile || null });
  // stderr, not gate.json: the operator must see that a legacy profile file
  // was shadowed (it may name a stricter profile), and the verdict format
  // stays the same.
  for (const w of profile.warnings || []) process.stderr.write(`[gate] warning: ${w}\n`);
  const manifest = opts.manifest ? validateManifest(readJSON(opts.manifest, 'ownership manifest')) : null;
  const suiteResult = opts.suiteResult ? validateSuite(readJSON(opts.suiteResult, 'suite result')) : null;
  const itemSpec = manifest ? (manifest.items.find(i => i.key === item) || null) : null;
  const budget = (itemSpec && itemSpec.budget) ? { ...profile.budget, ...itemSpec.budget } : profile.budget;
  const maxPatchBytes = Number.isInteger(opts.maxPatchBytes) ? opts.maxPatchBytes : budget.maxPatchBytes;

  // The gate's own output directory must not count as part of the change.
  const excludePaths = [];
  const outRel = path.relative(worktree, out).split(path.sep).join('/');
  if (outRel && !outRel.startsWith('..') && !path.isAbsolute(outRel)) excludePaths.push(outRel, `${outRel}/**`);

  // Which moment of the pipeline is this? The stage decides what evidence
  // exists, and therefore which rules may honestly be asked.
  const stage = stages.resolveStage(opts.stage);

  // Every stage pins its verdict to the worktree, even the ones that do not
  // read a diff. At scope stage that is the sharper check of the two: nothing
  // should be written while the scope is being judged, and a moved hash at
  // finalize proves somebody started coding anyway.
  let diff = null;
  let subject = null;
  let touchedPaths = [];

  // Read with a zero patch budget when the stage does not need the diff: the
  // state hash and the head sha still come back, and no patch bytes are read.
  const worktreeState = readDiff({
    worktree, baseRef: opts.baseRef,
    maxPatchBytes: stage.needsDiff ? maxPatchBytes : 0,
    excludePaths,
  });
  const stateHash = worktreeState.stateHash;
  const headSha = worktreeState.headSha;
  if (stage.needsDiff) {
    diff = worktreeState;
    touchedPaths = diff.files.map(f => f.path);
  }

  if (stage.id === 'scope') {
    if (!opts.projection) throw new InvalidBaseRefError('--projection <file> is required at stage scope');
    subject = stages.validateProjection(readJSON(opts.projection, 'projection'));
    touchedPaths = subject.projectedFiles.map(f => f.path);
  } else if (stage.id === 'reconcile') {
    if (!opts.reconcileReport) throw new InvalidBaseRefError('--reconcile-report <file> is required at stage reconcile');
    subject = stages.validateReconcileReport(readJSON(opts.reconcileReport, 'reconcile report'));
    touchedPaths = subject.collisions.map(c => c.path);
  }

  const context = discoverContext({
    worktree,
    touchedPaths,
    workspaceRoot: opts.workspaceRoot || null,
  });
  const ruleSet = buildRuleSet(profile);
  context.directivesIgnored.push(...ruleSet.rejected);

  let machine;
  if (stage.id === 'change') {
    machine = evaluateMachineRules({
      diff, item, manifest, suiteResult, context, ruleSet,
      budget, allowedPaths: itemSpec ? itemSpec.allowedPaths : null,
      secretPatterns: profile.secretPatterns.length ? [...profile.secretPatterns, ...require('./rules').DEFAULT_SECRET_PATTERNS] : null,
    });
  } else if (stage.id === 'scope') {
    const r = stages.evaluateProjection({
      projection: subject, item, manifest, budget,
      allowedPaths: itemSpec ? itemSpec.allowedPaths : null,
      matchesAny,
    });
    machine = { findings: r.findings, suppressed: [] };
    subject = { ...subject, projectedFileCount: r.projectedFileCount, projectedLines: r.projectedLines };
  } else {
    const r = stages.evaluateReconcile({ report: subject, manifest });
    machine = { findings: r.findings, suppressed: [] };
    subject = { ...subject, collisionCount: r.collisionCount };
  }

  const trk = tracker.lookup({ profile, worktree, item });

  const capabilities = {
    manifest: manifest ? 'present' : 'absent',
    suiteResult: suiteResult ? 'present' : 'absent',
    tracker: trk.status,
    // A stage without a diff declares that plainly rather than reporting a
    // coverage it never measured.
    diffCoverage: diff ? diff.coverage.mode : 'not-applicable',
    filesOmitted: diff ? diff.coverage.filesOmitted : 0,
    agentReview: 'absent',
  };
  const missingRequired = missingCapabilities(profile, capabilities, stage);

  const rulesForAgent = stages.rulesForStage(stage, ruleSet)
    .filter(r => r.evaluator === 'agent' || r.evaluator === 'both')
    .map(r => ({ id: r.id, severity: r.severity, structural: r.structural, description: r.description }));

  const doc = {
    schemaVersion: 1,
    preparedAt: utcNow(),
    item,
    baseRef: opts.baseRef,
    worktree,
    out,
    mode: opts.reportOnly ? 'report-only' : 'gate',
    stage: stage.id,
    iteration: Number.isInteger(opts.iteration) ? opts.iteration : 1,
    profile: {
      name: profile.name, version: profile.version, path: profile.path, locale: profile.locale,
      requiredCapabilities: profile.requiredCapabilities,
      maxIterations: profile.remediation.maxIterations,
      overrideRequiresSecondApprover: profile.overrideRequiresSecondApprover,
    },
    itemSpec,
    budget,
    tracker: trk,
    capabilities,
    missingRequiredCapabilities: missingRequired,
    stateHashBefore: stateHash,
    headSha,
    excludePaths,
    diff,
    subject,
    context,
    ruleSet: { rules: [...ruleSet.rules.values()], rejected: ruleSet.rejected },
    machineFindings: machine.findings,
    suppressed: machine.suppressed,
    agentBrief: {
      stage: stage.id,
      question: stage.question,
      rules: rulesForAgent,
      conventions: context.conventions,
      prose: context.prose,
      sensitivePaths: context.sensitivePaths,
      scopeExceptions: context.scopeExceptions,
      verification: context.verification,
      trackerItem: trk.item,
      declaredLimitationsRequired: true,
      outputSchema: 'skills/change-reviewer/schema/agent-findings.schema.json',
    },
    metrics: { prepareMs: Date.now() - startedAt },
  };
  writeJSON(path.join(out, 'gate-context.json'), doc);
  return doc;
}

function missingCapabilities(profile, caps, stage = null) {
  const missing = [];
  const hasDiff = !stage || stage.needsDiff;
  for (const c of profile.requiredCapabilities || []) {
    if (c === 'manifest' && caps.manifest !== 'present') missing.push('manifest');
    // A suite result cannot be required before the suite has run. Demanding it
    // at scope stage would make the earliest, cheapest gate unreachable.
    if (c === 'suiteResult' && hasDiff && caps.suiteResult !== 'present') missing.push('suiteResult');
    if (c === 'tracker' && caps.tracker !== 'reachable') missing.push('tracker');
    if (c === 'diffCoverage' && hasDiff && caps.diffCoverage !== 'full') missing.push('diffCoverage');
  }
  return missing;
}

// ---- finalize ---------------------------------------------------------------

function renumber(findings, startAt) {
  let n = startAt;
  return findings.map(f => ({ ...f, id: `${f.rule}-${String(++n).padStart(3, '0')}` }));
}

function finalize(opts) {
  const t0 = Date.now();
  const ctx = readJSON(opts.context, 'gate context');
  if (ctx.schemaVersion !== 1 || !ctx.stateHashBefore) throw new InvalidBaseRefError('gate context is not a prepare() output');
  const out = path.resolve(opts.out || ctx.out);
  const mode = opts.reportOnly ? 'report-only' : ctx.mode;
  const profileLabel = `${ctx.profile.name}@${ctx.profile.version}`;
  const ruleSet = { rules: new Map(ctx.ruleSet.rules.map(r => [r.id, r])) };

  let inconclusiveReason = null;
  let stateAfter = null;
  try {
    stateAfter = readStateHash({
      worktree: ctx.worktree,
      baseRef: ctx.baseRef,
      excludePaths: ctx.excludePaths || (ctx.diff && ctx.diff.excludePaths) || [],
    });
  } catch (e) {
    inconclusiveReason = `could not re-read the worktree at finalize: ${e.message}`;
  }
  if (!inconclusiveReason && stateAfter !== ctx.stateHashBefore) {
    // At stage `scope` this is the sharpest signal the gate has: the worktree
    // moved while the projection was being judged, which means somebody
    // started writing the code the gate had not cleared yet.
    inconclusiveReason = ctx.stage === 'scope'
      ? 'the worktree changed while the scope was being judged: code was written before the scope gate cleared it'
      : 'worktree changed between prepare and finalize; the verdict would not describe the state being committed';
  }

  let findings = [...ctx.machineFindings];
  let suppressed = [...ctx.suppressed];
  let positives = [];
  let declaredLimitations = [];
  const capabilities = { ...ctx.capabilities, agentReview: 'absent' };

  if (opts.agentFindings) {
    const agentDoc = readJSON(opts.agentFindings, 'agent findings');
    const err = validateAgentFindings(agentDoc, { knownRules: new Set(ruleSet.rules.keys()) });
    if (err) {
      inconclusiveReason = inconclusiveReason || `agent findings rejected by schema: ${err.errors.join('; ')}`;
    } else {
      const applied = applyContext(renumber(agentDoc.findings, findings.length), ctx.context, ruleSet);
      findings = findings.concat(applied.findings);
      suppressed = suppressed.concat(applied.suppressed);
      positives = agentDoc.positives || [];
      declaredLimitations = agentDoc.declaredLimitations || [];
      capabilities.agentReview = 'present';
    }
  }

  // Overrides: per finding, never global.
  let overrides = [];
  if (opts.overrides) {
    const list = readJSON(opts.overrides, 'overrides');
    const err = validateOverrides(list, findings, ctx.profile);
    if (err) throw new InvalidBaseRefError(err.message);
    const needsSecond = new Set(ctx.profile.overrideRequiresSecondApprover || []);
    overrides = list.map(o => {
      const f = findings.find(x => x.id === o.findingId);
      return { findingId: o.findingId, rule: f.rule, by: o.by, at: o.at, justification: o.justification, requiresSecondApprover: needsSecond.has(f.rule) };
    });
    const ov = new Set(overrides.map(o => o.findingId));
    findings = findings.map(f => (ov.has(f.id) ? { ...f, overridden: true } : f));
  }

  const missing = missingCapabilities({ requiredCapabilities: ctx.profile.requiredCapabilities }, capabilities);
  if (!inconclusiveReason && missing.length) {
    inconclusiveReason = `required capabilities unavailable: ${missing.join(', ')}`;
  }
  if (!inconclusiveReason && ctx.mode === 'gate' && capabilities.agentReview === 'absent' && !opts.allowMachineOnly) {
    inconclusiveReason = 'no agent findings were provided; gate mode requires the reviewer agent (use run/--report-only for machine rules only)';
  }

  const blockers = findings.filter(f => f.severity === 'blocker' && f.confirmed && !f.overridden);
  let verdict;
  let exitCode;
  if (inconclusiveReason) { verdict = 'inconclusive'; exitCode = EXIT.INCONCLUSIVE; }
  else if (blockers.length) { verdict = 'blocked'; exitCode = EXIT.BLOCKER; }
  else { verdict = 'pass'; exitCode = EXIT.OK; }
  if (mode === 'report-only' && exitCode !== EXIT.INCONCLUSIVE) exitCode = EXIT.OK;

  const result = {
    schemaVersion: 1,
    verdict,
    exitCode,
    mode,
    inconclusiveReason,
    item: ctx.item,
    baseRef: ctx.baseRef,
    stage: ctx.stage || 'change',
    diffSha: (ctx.headSha || (ctx.diff && ctx.diff.headSha) || '').slice(0, 7),
    profile: profileLabel,
    locale: ctx.profile.locale,
    generatedAt: utcNow(),
    context: {
      filesRead: ctx.context.filesRead,
      directivesApplied: ctx.context.directivesApplied,
      directivesIgnored: ctx.context.directivesIgnored,
    },
    capabilities,
    stateHash: { before: ctx.stateHashBefore, after: stateAfter },
    findings,
    suppressed,
    overrides,
    positives,
    declaredLimitations,
    commitTrailers: trailers({ verdict, profileLabel, diffSha: (ctx.headSha || (ctx.diff && ctx.diff.headSha) || '').slice(0, 7), overrides, findings }),
    metrics: {
      durationMs: (ctx.metrics && ctx.metrics.prepareMs ? ctx.metrics.prepareMs : 0) + (Date.now() - t0),
      filesReviewed: ctx.diff ? ctx.diff.files.length : 0,
      iteration: ctx.iteration,
    },
  };
  const schemaErr = validateGateResult(result);
  if (schemaErr) throw schemaErr; // a bug in this file, never a user error

  const formats = String(opts.format || 'json,md').split(',').map(s => s.trim()).filter(Boolean);
  if (formats.includes('json')) writeJSON(path.join(out, 'gate.json'), result);
  if (formats.includes('md')) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'gate.md'), renderGateMarkdown(result));
  }
  return result;
}

function trailers({ verdict, profileLabel, diffSha, overrides, findings }) {
  const t = [`Gate-Verdict: ${verdict} (${profileLabel}, diff ${diffSha})`];
  for (const o of overrides) {
    const f = findings.find(x => x.id === o.findingId);
    t.push(`Gate-Override: ${o.findingId} [${f ? f.rule : '?'}] by ${o.by} at ${o.at}: ${o.justification.replace(/\s+/g, ' ')}`);
  }
  return t;
}

function run(opts) {
  const ctx = prepare(opts);
  return finalize({
    context: path.join(ctx.out, 'gate-context.json'),
    out: ctx.out,
    format: opts.format,
    reportOnly: opts.reportOnly,
    overrides: opts.overrides,
    agentFindings: opts.agentFindings,
    allowMachineOnly: true,
  });
}

function summaryLine(r) {
  const b = r.findings.filter(f => f.severity === 'blocker' && f.confirmed && !f.overridden).length;
  const m = r.findings.filter(f => f.severity === 'major' && !f.overridden).length;
  const q = r.findings.filter(f => f.severity === 'question' && !f.overridden).length;
  const extra = r.inconclusiveReason ? ` — ${r.inconclusiveReason}` : '';
  return `[gate] ${r.item}: ${r.verdict} (exit ${r.exitCode}${r.mode === 'report-only' ? ', report-only' : ''}) · ${b} blocker · ${m} major · ${q} question · ${r.overrides.length} override · profile ${r.profile}${extra}`;
}

module.exports = { EXIT, prepare, finalize, run, summaryLine, missingCapabilities, CORE_RULES, ProfileError, SchemaError, WorktreeUnreadableError, InvalidBaseRefError };
