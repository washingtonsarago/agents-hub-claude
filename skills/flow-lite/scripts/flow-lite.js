#!/usr/bin/env node
'use strict';
// flow-lite — deterministic half of the /flow-lite command.
//
//   manifest validate   ownership manifest is well-formed
//   order               merge order over dependsOn; a cycle fails the batch
//   reconcile           files created by more than one item, diverging or not
//   ledger ...          run record: init, phase-start, phase-end, item-end, batch-end
//   summary             run-summary block + run-summary.{json,md} + telemetry step
//   telemetry ...       --notice, --ack, --dry-run, --show-last, --purge, --flush, --aggregate
//
// Exit codes: 0 ok · 1 control failed (cycle, diverging collision) · 2 bad
// usage or invalid input · 4 could not read. The summary step never fails the
// run because of telemetry.
//
// Zero deps. Node >= 18.

const fs = require('fs');
const path = require('path');
const batch = require('./lib/batch');
const ledger = require('./lib/ledger');
const summary = require('./lib/summary');
const telemetry = require('./lib/telemetry');
const notifier = require('./lib/notify');

const EXIT = Object.freeze({ OK: 0, FAILED: 1, USAGE: 2, UNREADABLE: 4 });
const NOTICE_PATH = path.join(__dirname, '..', 'TELEMETRY.md');

class UsageError extends Error {
  constructor(message) { super(message); this.name = 'UsageError'; }
}

const BOOLEAN_FLAGS = new Set(['no-telemetry', 'dry-run', 'show-last', 'purge', 'notice', 'ack', 'flush', 'help', 'report-only', 'json', 'no-notify', 'once']);

function usage() {
  return [
    'usage:',
    '  flow-lite.js manifest validate --manifest <file>',
    '  flow-lite.js order --manifest <file>',
    '  flow-lite.js reconcile --worktree <repo> --base-ref <ref> --manifest <file> [--branch-template "feat/{key}"] [--out <dir>]',
    '  flow-lite.js ledger init --out <dir> --batch <id> [--base-ref <ref>] [--profile name@version] [--items N] [--report-only]',
    '  flow-lite.js ledger phase-start --out <dir> --item <key> --phase <phase> [--iteration N] [--otel-cost <script>]',
    '  flow-lite.js ledger phase-end   --out <dir> --item <key> --phase <phase> [--iteration N] [--otel-cost <script>] [--status ok|blocked|aborted|inconclusive]',
    '                                  [--tokens-in N --tokens-out N --tokens-source <text>]',
    '  flow-lite.js ledger item-end    --out <dir> --item <key> --outcome committed|blocked|aborted|inconclusive|skipped [--verdict v] [--exit-code N] [--stop-phase p] [--gate-json <file>]',
    '  flow-lite.js ledger batch-end   --out <dir> --status completed|failed [--reason <text>]',
    '  flow-lite.js summary --out <dir> [--no-telemetry] [--dry-run] [--endpoint <url>] [--repo <path>]',
    '  flow-lite.js telemetry --notice | --ack | --show-last | --purge | --dry-run --out <dir> | --flush [--endpoint <url>]',
    '  flow-lite.js telemetry --aggregate <events.ndjson> [--by context.profileName] [--min-people 5]',
    '  flow-lite.js notify --event <event> [--item <key>] [--message <text>] [--no-notify]',
    '  flow-lite.js watch  --out <dir> [--stall-after 600] [--interval 30] [--once] [--no-notify]',
    '',
    `phases: ${ledger.PHASES.join(' ')}`,
    `notify events: ${notifier.EVENT_NAMES.join(' ')} · off with --no-notify or FLOW_LITE_NOTIFY=off`,
    'exit codes: 0 ok · 1 control failed · 2 bad usage/invalid input · 4 could not read',
  ].join('\n');
}

function parseArgs(argv) {
  const out = { cmd: argv[0] || null, sub: null, flags: {} };
  let i = 1;
  if (argv[1] && !argv[1].startsWith('--')) { out.sub = argv[1]; i = 2; }
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new UsageError(`unexpected argument: ${a}`);
    const eq = a.indexOf('=');
    let key;
    let val;
    if (eq > 0) { key = a.slice(2, eq); val = a.slice(eq + 1); }
    else {
      key = a.slice(2);
      const next = argv[i + 1];
      if (BOOLEAN_FLAGS.has(key) && (next === undefined || next.startsWith('--'))) { out.flags[key] = true; continue; }
      if (BOOLEAN_FLAGS.has(key) && key !== 'dry-run' && key !== 'aggregate') { out.flags[key] = true; continue; }
      if (next === undefined || next.startsWith('--')) throw new UsageError(`--${key} requires a value`);
      val = next; i++;
    }
    out.flags[key] = val;
  }
  return out;
}

function req(flags, name) {
  if (flags[name] === undefined || flags[name] === true) throw new UsageError(`--${name} is required`);
  return flags[name];
}
function intFlag(flags, name, fallback) {
  if (flags[name] === undefined) return fallback;
  const n = Number(flags[name]);
  if (!Number.isInteger(n) || n < 0) throw new UsageError(`--${name} must be a non-negative integer`);
  return n;
}
function readJSON(p, what) {
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch (e) { throw new UsageError(`${what} not readable: ${p} (${e.message})`); }
  try { return JSON.parse(raw); } catch (e) { throw new UsageError(`${what} is not valid JSON: ${e.message}`); }
}
function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}
function noticeText() {
  try { return fs.readFileSync(NOTICE_PATH, 'utf8'); } catch { return '(notice text missing: TELEMETRY.md not found next to this skill)'; }
}

// ---- telemetry step used by `summary` ---------------------------------------

async function telemetryStep({ out, s, flags, repo }) {
  // Computed before anything else so even a disabled run says which state
  // directory and which endpoint source it would have used.
  const provenance = telemetry.provenance(flags.endpoint || null);
  const disabled = telemetry.isDisabled({ noTelemetry: Boolean(flags['no-telemetry']) });
  if (disabled) return { status: disabled, endpoint: null, eventId: null, detail: 'nothing derived, nothing stored, nothing sent', provenance };
  const cfg = telemetry.loadConfig();
  const { endpoint, headers, source } = telemetry.currentTransport(flags.endpoint || null);
  const event = telemetry.derive(s, { cfg, repo });
  const bytes = telemetry.canonical(event);
  fs.writeFileSync(path.join(out, 'adoption-event.json'), bytes);
  if (flags['dry-run']) return { status: 'dry-run', endpoint: endpoint || null, eventId: event.eventId, detail: `payload written to adoption-event.json (endpoint source: ${source}); not sent`, provenance };
  if (!endpoint) return { status: 'not-configured', endpoint: null, eventId: event.eventId, detail: 'no endpoint configured; nothing sent anywhere (payload kept in adoption-event.json)', provenance };
  if (!telemetry.acknowledged()) return { status: 'awaiting-acknowledgment', endpoint, eventId: event.eventId, detail: 'first-run notice not acknowledged on this machine; not sent. Run `flow-lite.js telemetry --notice` then `--ack`', provenance };
  const spooled = telemetry.spoolWrite(bytes, event.eventId);
  // CHANGE_REVIEWER_TELEMETRY_SYNC=1 (or the legacy variable) sends before
  // returning (CI runners that exit right after the summary). Still
  // fail-open: a failure leaves the event in the spool and the run unaffected.
  if (telemetry.syncRequested()) {
    const r = await telemetry.flushSpool({ endpoint, headers });
    return r.failed
      ? { status: 'spooled', endpoint, eventId: event.eventId, detail: `send failed (${r.cause}); ${r.failed} event(s) kept in spool for the next run`, provenance }
      : { status: 'sent', endpoint, eventId: event.eventId, detail: `${r.sent} event(s) sent synchronously (${telemetry.ENV.sync}=1)`, provenance };
  }
  const started = telemetry.flushInBackground(__filename, { endpointOverride: flags.endpoint || null });
  return {
    status: started ? 'queued' : 'spooled',
    endpoint,
    eventId: event.eventId,
    detail: started ? `spooled at ${path.basename(spooled)}; background flush started (fail-open, ${telemetry.SPOOL_MAX_FILES} files / 7 days retention)` : 'background flush could not start; will retry on the next run',
    provenance,
  };
}

async function main(argv) {
  const { cmd, sub, flags } = parseArgs(argv);
  if (!cmd || cmd === 'help' || flags.help) { process.stdout.write(usage() + '\n'); return EXIT.OK; }

  if (cmd === 'manifest') {
    if (sub !== 'validate') throw new UsageError('usage: manifest validate --manifest <file>');
    const m = readJSON(path.resolve(req(flags, 'manifest')), 'manifest');
    const errors = batch.validateManifest(m);
    if (errors.length) { process.stderr.write(`[flow-lite] manifest invalid:\n  - ${errors.join('\n  - ')}\n`); return EXIT.USAGE; }
    process.stdout.write(`[flow-lite] manifest ok: ${m.items.length} item(s), ${Object.keys(m.ownership || {}).length} owned path(s)\n`);
    return EXIT.OK;
  }

  if (cmd === 'order') {
    const m = readJSON(path.resolve(req(flags, 'manifest')), 'manifest');
    const errors = batch.validateManifest(m);
    if (errors.length) { process.stderr.write(`[flow-lite] manifest invalid:\n  - ${errors.join('\n  - ')}\n`); return EXIT.USAGE; }
    const r = batch.mergeOrder(m);
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    if (r.cycle.length) { process.stderr.write(`[flow-lite] dependency cycle among: ${r.cycle.join(', ')} — batch failed before any worktree was created\n`); return EXIT.FAILED; }
    return EXIT.OK;
  }

  if (cmd === 'reconcile') {
    const repo = path.resolve(req(flags, 'worktree'));
    const m = readJSON(path.resolve(req(flags, 'manifest')), 'manifest');
    const errors = batch.validateManifest(m);
    if (errors.length) { process.stderr.write(`[flow-lite] manifest invalid:\n  - ${errors.join('\n  - ')}\n`); return EXIT.USAGE; }
    const r = batch.reconcile({ repo, baseRef: req(flags, 'base-ref'), manifest: m, branchTemplate: flags['branch-template'] || null });
    if (flags.out) writeJSON(path.join(path.resolve(flags.out), 'reconcile.json'), r);
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    if (r.divergingCount) {
      process.stderr.write(`[flow-lite] ${r.divergingCount} file(s) created by more than one item with diverging content — batch failed, no PR opened\n`);
      return EXIT.FAILED;
    }
    return EXIT.OK;
  }

  if (cmd === 'ledger') {
    const out = path.resolve(req(flags, 'out'));
    if (sub === 'init') {
      ledger.init({ out, batch: req(flags, 'batch'), baseRef: flags['base-ref'] || null, profile: flags.profile || null, reportOnly: Boolean(flags['report-only']), itemsPlanned: intFlag(flags, 'items', null) });
      process.stdout.write(`[flow-lite] ledger started: ${ledger.ledgerPath(out)}\n`);
      return EXIT.OK;
    }
    if (sub === 'phase-start') {
      const e = ledger.phaseStart({ out, item: req(flags, 'item'), phase: req(flags, 'phase'), iteration: intFlag(flags, 'iteration', 1), otelCost: flags['otel-cost'] ? path.resolve(flags['otel-cost']) : null });
      process.stdout.write(`[flow-lite] ${e.item}/${e.phase}#${e.iteration} started ${e.startedAt}${e.snapshot ? ' (token snapshot taken)' : ` (tokens ${e.tokens.status}: ${e.tokens.cause})`}\n`);
      return EXIT.OK;
    }
    if (sub === 'phase-end') {
      const e = ledger.phaseEnd({
        out, item: req(flags, 'item'), phase: req(flags, 'phase'), iteration: intFlag(flags, 'iteration', 1),
        status: flags.status || 'ok', otelCost: flags['otel-cost'] ? path.resolve(flags['otel-cost']) : null,
        tokensIn: intFlag(flags, 'tokens-in', null), tokensOut: intFlag(flags, 'tokens-out', null), tokensSource: flags['tokens-source'] || null,
      });
      const tok = e.tokens.status === 'measured' ? `in ${e.tokens.tokensIn} · out ${e.tokens.tokensOut} (${e.tokens.source})` : `${e.tokens.status}: ${e.tokens.cause}`;
      process.stdout.write(`[flow-lite] ${e.item}/${e.phase}#${e.iteration} ${e.status} in ${summary.fmtDur(e.durationMs)} · tokens ${tok}\n`);
      return EXIT.OK;
    }
    if (sub === 'item-end') {
      const it = ledger.itemEnd({ out, item: req(flags, 'item'), outcome: req(flags, 'outcome'), verdict: flags.verdict || null, exitCode: intFlag(flags, 'exit-code', null), stopPhase: flags['stop-phase'] || null, gateJson: flags['gate-json'] ? path.resolve(flags['gate-json']) : null });
      process.stdout.write(`[flow-lite] ${it.key}: ${it.outcome}${it.verdict ? ` (${it.verdict}, exit ${it.exitCode})` : ''}${it.stopPhase ? ` stop@${it.stopPhase}` : ''}\n`);
      return EXIT.OK;
    }
    if (sub === 'batch-end') {
      const d = ledger.batchEnd({ out, status: req(flags, 'status'), reason: flags.reason || null });
      process.stdout.write(`[flow-lite] batch ${d.batch}: ${d.status}${d.reason ? ` (${d.reason})` : ''}\n`);
      return EXIT.OK;
    }
    throw new UsageError('ledger subcommand must be init|phase-start|phase-end|item-end|batch-end');
  }

  if (cmd === 'summary') {
    const out = path.resolve(req(flags, 'out'));
    const doc = ledger.load(out);
    // Build once, then the telemetry step derives from THIS object: what the
    // user sees is what is sent, fewer fields never more.
    const s0 = summary.build(doc, null);
    let t;
    try { t = await telemetryStep({ out, s: s0, flags, repo: flags.repo || null }); }
    catch (e) { t = { status: 'failed', endpoint: null, eventId: null, detail: `telemetry step failed (run unaffected): ${e.message}` }; }
    const s = { ...s0, telemetry: t };
    summary.write(out, s);
    process.stdout.write(summary.renderBlock(s) + '\n');
    return EXIT.OK;
  }

  // A one-shot alert, raised by the orchestrator at a stop point: the budget
  // overflow that needs a split decision, the blocker that survived the
  // remediation cap, the telemetry notice awaiting a yes.
  if (cmd === 'notify') {
    const record = notifier.notify({
      event: req(flags, 'event'),
      item: flags.item || null,
      batch: flags.batch || null,
      message: flags.message || '',
      noNotify: Boolean(flags['no-notify']),
    });
    if (flags.json) process.stdout.write(JSON.stringify(record, null, 2) + '\n');
    return EXIT.OK;
  }

  // The watchdog. The orchestrator cannot report that it stopped moving, so
  // this reads the clock from outside and alerts on a phase left open.
  if (cmd === 'watch') {
    const out = path.resolve(req(flags, 'out'));
    const stallAfterMs = intFlag(flags, 'stall-after', 600) * 1000;
    const intervalMs = intFlag(flags, 'interval', 30) * 1000;
    const opts = { out, stallAfterMs, noNotify: Boolean(flags['no-notify']) };
    if (flags.once) {
      const r = notifier.sweep(opts);
      if (flags.json) process.stdout.write(JSON.stringify(r, null, 2) + '\n');
      return r.cause ? EXIT.UNREADABLE : EXIT.OK;
    }
    // Polls until the ledger stops saying `running`. Never fails the run: a
    // watchdog that kills the thing it watches is worse than no watchdog.
    for (;;) {
      const r = notifier.sweep(opts);
      if (r.cause) { process.stderr.write(`[flow-lite] watch: ${r.cause}\n`); return EXIT.UNREADABLE; }
      if (!r.running) {
        process.stderr.write('[flow-lite] watch: run is no longer running — stopping\n');
        return EXIT.OK;
      }
      await new Promise(res => setTimeout(res, intervalMs));
    }
  }

  if (cmd === 'telemetry') {
    if (flags.notice) {
      const disabled = telemetry.isDisabled({ noTelemetry: Boolean(flags['no-telemetry']) });
      const { endpoint } = telemetry.currentTransport(flags.endpoint || null);
      let state = 'awaiting-acknowledgment';
      if (disabled) state = disabled;
      else if (!endpoint) state = 'not-configured';
      else if (telemetry.acknowledged()) state = 'acknowledged';
      process.stdout.write(`${state}\n`);
      process.stdout.write(`${telemetry.provenance(flags.endpoint || null)}\n`);
      if (state === 'awaiting-acknowledgment') process.stdout.write('\n' + noticeText() + '\n');
      return EXIT.OK;
    }
    if (flags.ack) {
      const a = telemetry.acknowledge();
      process.stdout.write(`acknowledged at ${a.acknowledgedAt} (notice v${a.noticeVersion}) → ${telemetry.ackPath()}\n`);
      return EXIT.OK;
    }
    if (flags['show-last']) {
      let bytes;
      try { bytes = fs.readFileSync(telemetry.lastPath(), 'utf8'); } catch { process.stdout.write('no event has been sent from this machine\n'); return EXIT.OK; }
      process.stdout.write(bytes);
      return EXIT.OK;
    }
    if (flags.purge) {
      const r = telemetry.purge();
      process.stdout.write(`purged ${r.spoolRemoved} spooled event(s) and the last-sent record (${r.lastEventFiles} file(s)) from ${r.dirs.length} candidate state director${r.dirs.length === 1 ? 'y' : 'ies'}\n`);
      return EXIT.OK;
    }
    if (flags['dry-run']) {
      const out = path.resolve(req(flags, 'out'));
      const doc = ledger.load(out);
      const s = summary.build(doc, null);
      const cfg = telemetry.loadConfig();
      const event = telemetry.derive(s, { cfg, repo: flags.repo || null });
      process.stdout.write(telemetry.canonical(event));
      return EXIT.OK;
    }
    if (flags.flush) {
      // The opt-out is checked before the spool is even read: an event left
      // over from a failed send must not leave after the dev switched off.
      // The background child comes through here too.
      const disabled = telemetry.isDisabled({ noTelemetry: Boolean(flags['no-telemetry']) });
      if (disabled) { process.stdout.write(`${disabled}: nothing sent, spool untouched\n`); return EXIT.OK; }
      const { endpoint, headers } = telemetry.currentTransport(flags.endpoint || null);
      if (!endpoint) { process.stdout.write('not-configured: nothing sent\n'); return EXIT.OK; }
      const r = await telemetry.flushSpool({ endpoint, headers });
      process.stdout.write(`flushed ${r.sent} event(s)${r.failed ? `, ${r.failed} left in spool (${r.cause})` : ''}\n`);
      return EXIT.OK;
    }
    if (flags.aggregate) {
      const lines = fs.readFileSync(path.resolve(flags.aggregate), 'utf8').split('\n');
      const r = telemetry.aggregate(lines, { by: flags.by || 'context.profileName', minPeople: intFlag(flags, 'min-people', telemetry.MIN_PEOPLE_DEFAULT) });
      process.stdout.write(JSON.stringify(r, null, 2) + '\n');
      return EXIT.OK;
    }
    throw new UsageError('telemetry needs one of --notice, --ack, --show-last, --purge, --dry-run, --flush, --aggregate');
  }

  throw new UsageError(`unknown command: ${cmd}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).then(code => process.exit(code)).catch(e => {
    if (e instanceof UsageError || e instanceof batch.ManifestError || e instanceof ledger.LedgerError || e instanceof notifier.NotifyError) {
      process.stderr.write(`[flow-lite] ${e.message}\n`);
      process.exit(EXIT.USAGE);
    }
    process.stderr.write(`[flow-lite] ${e.stack || e.message}\n`);
    process.exit(EXIT.UNREADABLE);
  });
}

module.exports = { EXIT, main, parseArgs };
