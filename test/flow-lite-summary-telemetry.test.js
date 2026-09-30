// Integration tests for the flow-lite ledger, the mandatory run summary and
// the adoption telemetry guarantees.
//
// What is isolated here: a throwaway run directory and a throwaway HOME per
// test (the state directory defaults live under it), with every telemetry
// variable of both name families removed from the inherited environment. A
// dev with an opt-out on their own machine must not change this suite's
// result, and the suite must never touch their ~/.claude. Token measurement
// uses a fake otel-cost.js that prints fixed figures, so "measured" means
// "what the tool printed" and nothing else.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const { rmrf } = require('./helpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const FLOW = path.join(REPO_ROOT, 'skills', 'flow-lite', 'scripts', 'flow-lite.js');
const telemetry = require(path.join(REPO_ROOT, 'skills', 'flow-lite', 'scripts', 'lib', 'telemetry.js'));

function write(dir, rel, content) { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); return p; }
function writeJSON(dir, rel, obj) { return write(dir, rel, JSON.stringify(obj, null, 2) + '\n'); }
function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// Pre-rename names, pinned here rather than imported from legacy.js so a
// wrong value there fails these tests instead of agreeing with them.
const LEGACY_HOME = 'EMSTECH_REVIEWER_HOME'; // legacy
const LEGACY_OFF = 'EMSTECH_TELEMETRY'; // legacy
const LEGACY_ENDPOINT = 'EMSTECH_TELEMETRY_ENDPOINT'; // legacy
const LEGACY_SYNC = 'EMSTECH_TELEMETRY_SYNC'; // legacy
const LEGACY_DIR = '.emstech-reviewer'; // legacy
const TELEMETRY_ENV = [
  'CHANGE_REVIEWER_HOME', 'CHANGE_REVIEWER_TELEMETRY', 'CHANGE_REVIEWER_TELEMETRY_ENDPOINT', 'CHANGE_REVIEWER_TELEMETRY_SYNC',
  LEGACY_HOME, LEGACY_OFF, LEGACY_ENDPOINT, LEGACY_SYNC,
  'OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_LOGS_ENDPOINT', 'OTEL_EXPORTER_OTLP_HEADERS',
];

// `home` is both HOME and, unless stateOverride is false, the state
// directory (CHANGE_REVIEWER_HOME). With stateOverride false the state
// resolves to the defaults under HOME, which is what the compat cases need.
function makeEnv(extra = {}, { stateOverride = true } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-home-'));
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  for (const k of TELEMETRY_ENV) delete env[k];
  if (stateOverride) env.CHANGE_REVIEWER_HOME = home;
  return { home, env: { ...env, ...extra } };
}
function newDefault(home) { return path.join(home, '.claude', '.change-reviewer'); }
function legacyDefault(home) { return path.join(home, '.claude', LEGACY_DIR); } // legacy

function run(args, env) { return spawnSync('node', [FLOW, ...args], { encoding: 'utf8', timeout: 30000, env }); }

// A stand-in for session-cost's otel-cost.js: `snapshot` prints a marker,
// `report --since <f> --json` prints fixed buckets in its real shape.
function fakeOtel(dir, { failReport = false } = {}) {
  return write(dir, 'fake-otel-cost.js', `
const cmd = process.argv[2];
if (cmd === 'snapshot') { process.stdout.write(JSON.stringify([{ name: 'claude_code.token.usage', labels: {}, value: 1 }])); process.exit(0); }
if (cmd === 'report') {
  if (${failReport ? 'true' : 'false'}) { process.stderr.write('endpoint respondeu, mas nenhuma série encontrada\\n'); process.exit(1); }
  process.stdout.write(JSON.stringify({ buckets: {
    orquestrador: { tokens: { input: 1000, output: 100, cacheRead: 500, cacheCreation: 50 }, cost: 0.1 },
    subagent:     { tokens: { input: 3000, output: 300 }, cost: 0.3 } } }));
  process.exit(0);
}
process.exit(2);
`);
}

// Drives a small but complete run through the ledger.
function seedRun(out, env, { otel = null, fail = false } = {}) {
  const o = otel ? ['--otel-cost', otel] : [];
  assert.equal(run(['ledger', 'init', '--out', out, '--batch', 'batch-7', '--base-ref', 'origin/main', '--profile', 'default@1.0.0', '--items', '2'], env).status, 0);
  for (const phase of ['scope', 'implement', 'gate']) {
    assert.equal(run(['ledger', 'phase-start', '--out', out, '--item', 'ABC-1', '--phase', phase, ...o], env).status, 0);
    assert.equal(run(['ledger', 'phase-end', '--out', out, '--item', 'ABC-1', '--phase', phase, '--status', phase === 'gate' ? 'blocked' : 'ok', ...o], env).status, 0);
  }
  assert.equal(run(['ledger', 'phase-start', '--out', out, '--item', 'ABC-1', '--phase', 'gate', '--iteration', '2', ...o], env).status, 0);
  assert.equal(run(['ledger', 'phase-end', '--out', out, '--item', 'ABC-1', '--phase', 'gate', '--iteration', '2', ...o], env).status, 0);
  const gate = writeJSON(out, 'ABC-1/gate.json', { verdict: 'pass', exitCode: 0, findings: [{ rule: 'wiring', severity: 'blocker', confirmed: true }, { rule: 'scope', severity: 'blocker', confirmed: true, overridden: true }], overrides: [{ rule: 'scope' }] });
  assert.equal(run(['ledger', 'item-end', '--out', out, '--item', 'ABC-1', '--outcome', 'committed', '--gate-json', gate], env).status, 0);
  assert.equal(run(['ledger', 'phase-start', '--out', out, '--item', 'XYZ-2', '--phase', 'scope', ...o], env).status, 0);
  assert.equal(run(['ledger', 'phase-end', '--out', out, '--item', 'XYZ-2', '--phase', 'scope', '--status', 'aborted', ...o], env).status, 0);
  assert.equal(run(['ledger', 'item-end', '--out', out, '--item', 'XYZ-2', '--outcome', 'aborted', '--stop-phase', 'scope-gate', '--exit-code', '2'], env).status, 0);
  assert.equal(run(['ledger', 'batch-end', '--out', out, '--status', fail ? 'failed' : 'completed', ...(fail ? ['--reason', 'reconciliation found 1 diverging file'] : [])], env).status, 0);
}

// ---- ledger + summary --------------------------------------------------------

test('summary: block and files are produced on a FAILED run too, with tokens honestly not measured', () => {
  const { home, env } = makeEnv();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-run-'));
  try {
    seedRun(out, env, { fail: true });
    const r = run(['summary', '--out', out, '--no-telemetry'], env);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /─── \/flow-lite · run summary/);
    assert.match(r.stdout, /Batch:\s+batch-7 · 2 items · 1 committed · 0 blocked · 1 aborted · 0 inconclusive · status failed \(reconciliation found 1 diverging file\)/);
    assert.match(r.stdout, /Elapsed:\s+\d+s\s+\(wall clock/);
    assert.match(r.stdout, /Tokens:\s+not measured/);
    assert.match(r.stdout, /Source:\s+\d+ of \d+ phase\(s\) not measured: no token source configured/);
    assert.match(r.stdout, /By phase/);
    assert.match(r.stdout, /^\s+gate\s+—\s+\d+s$/m);
    assert.match(r.stdout, /By iteration/);
    assert.match(r.stdout, /ABC-1 #2/);
    assert.match(r.stdout, /Not measured:\s+remote CI time \(outside this process\)/);
    assert.match(r.stdout, /Telemetry:\s+disabled \(--no-telemetry\)/);
    assert.match(r.stdout, /Caveat:\s+This data measures tool usage, not productivity\./);
    const json = readJSON(path.join(out, 'run-summary.json'));
    assert.equal(json.batch.status, 'failed');
    assert.equal(json.tokens.status, 'not-measured');
    assert.equal(json.caveat, 'This data measures tool usage, not productivity.');
    const abc = json.byItem.find(i => i.key === 'ABC-1');
    assert.equal(abc.iterations, 2);
    assert.deepEqual(abc.blockersByRule, { wiring: 1, scope: 1 });
    assert.deepEqual(abc.overridesByRule, { scope: 1 });
    assert.ok(fs.existsSync(path.join(out, 'run-summary.md')));
    assert.match(fs.readFileSync(path.join(out, 'run-summary.md'), 'utf8'), /run summary/);
  } finally { rmrf(out); rmrf(home); }
});

test('ledger: tokens are measured only through the otel-cost script and include subagents; a failing source is inconclusive with its cause', () => {
  const { home, env } = makeEnv();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-run-'));
  try {
    const otel = fakeOtel(out);
    seedRun(out, env, { otel });
    const r = run(['summary', '--out', out, '--no-telemetry'], env);
    assert.equal(r.status, 0, r.stderr);
    // per phase: in = 1000+500+50+3000 = 4550, out = 100+300 = 400; 5 phases closed
    assert.match(r.stdout, /Tokens:\s+in 22,750 · out 2,000 · total 24,750/);
    assert.match(r.stdout, /Source:\s+otel-cost\.js \(Claude Code OpenTelemetry counters; includes subagents\) \(measured\)/);
    assert.match(r.stdout, /^\s+gate\s+9,900\s+\d+s$/m, 'gate ran twice');
    const json = readJSON(path.join(out, 'run-summary.json'));
    assert.equal(json.tokens.status, 'measured');
    assert.equal(json.tokens.subagentTokensIncluded, true);
    assert.ok(!json.notMeasured.some(n => /subagent/.test(n)));

    // A source that fails at report time: inconclusive, never a number.
    const out2 = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-run-'));
    try {
      const bad = fakeOtel(out2, { failReport: true });
      assert.equal(run(['ledger', 'init', '--out', out2, '--batch', 'b'], env).status, 0);
      assert.equal(run(['ledger', 'phase-start', '--out', out2, '--item', 'A', '--phase', 'scope', '--otel-cost', bad], env).status, 0);
      const e = run(['ledger', 'phase-end', '--out', out2, '--item', 'A', '--phase', 'scope', '--otel-cost', bad], env);
      assert.equal(e.status, 0, e.stderr);
      assert.match(e.stdout, /tokens inconclusive: endpoint respondeu, mas nenhuma série encontrada/);
      // Explicit figures without a named source are refused.
      assert.equal(run(['ledger', 'phase-start', '--out', out2, '--item', 'A', '--phase', 'plan'], env).status, 0);
      const f = run(['ledger', 'phase-end', '--out', out2, '--item', 'A', '--phase', 'plan', '--tokens-in', '10', '--tokens-out', '2'], env);
      assert.equal(f.status, 2);
      assert.match(f.stderr, /--tokens-source is required/);
    } finally { rmrf(out2); }
  } finally { rmrf(out); rmrf(home); }
});

test('ledger: opening a phase twice or closing an unopened one is an error, not silent data', () => {
  const { home, env } = makeEnv();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-run-'));
  try {
    assert.equal(run(['ledger', 'init', '--out', out, '--batch', 'b'], env).status, 0);
    assert.equal(run(['ledger', 'phase-start', '--out', out, '--item', 'A', '--phase', 'scope'], env).status, 0);
    let r = run(['ledger', 'phase-start', '--out', out, '--item', 'A', '--phase', 'scope'], env);
    assert.equal(r.status, 2); assert.match(r.stderr, /already open/);
    r = run(['ledger', 'phase-end', '--out', out, '--item', 'A', '--phase', 'implement'], env);
    assert.equal(r.status, 2); assert.match(r.stderr, /no open phase implement/);
    r = run(['ledger', 'phase-start', '--out', out, '--item', 'A', '--phase', 'dance'], env);
    assert.equal(r.status, 2); assert.match(r.stderr, /--phase must be one of/);
    // Summary on a ledger with an open phase says so under Not measured.
    r = run(['summary', '--out', out, '--no-telemetry'], env);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /1 phase\(s\) never closed: A\/scope/);
  } finally { rmrf(out); rmrf(home); }
});

// ---- telemetry guarantees -------------------------------------------------------

test('telemetry: event carries identifiers and counts only — no item keys, paths, branch names or finding text', () => {
  const { home, env } = makeEnv();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-run-'));
  try {
    seedRun(out, env);
    const r = run(['telemetry', '--dry-run', '--out', out], env);
    assert.equal(r.status, 0, r.stderr);
    const ev = JSON.parse(r.stdout);
    const text = r.stdout;
    assert.equal(ev.schemaVersion, 1);
    assert.equal(ev.command, 'flow-lite');
    assert.ok(!text.includes('ABC-1') && !text.includes('XYZ-2'), 'item keys never travel');
    assert.ok(!text.includes('origin/main'), 'branch names never travel');
    assert.ok(!/gate\.json|\.flow-lite|\/tmp|\\\\/.test(text), 'paths never travel');
    assert.deepEqual(ev.outcome.blockersByRule, { wiring: 1, scope: 1 });
    assert.deepEqual(ev.usage.overridesByRule, { scope: 1 });
    assert.deepEqual(ev.usage.stopPhases, { 'scope-gate': 1 });
    assert.deepEqual(ev.usage.exitCodes, { '0': 1, '2': 1 });
    assert.equal(ev.volume.items, 2);
    assert.equal(ev.volume.iterationsMax, 2);
    assert.equal(ev.identity.idScope, 'machine', 'no org salt configured → declared per-machine');
    assert.match(ev.identity.userId, /^[0-9a-f]{32}$/);
    assert.equal(ev.cost.tokensStatus, 'not-measured');
    assert.equal(ev.cost.tokensIn, null);
    // Schema allowlist: every top-level key is declared in the versioned schema.
    const schema = readJSON(path.join(REPO_ROOT, 'skills', 'flow-lite', 'schema', 'adoption-event.schema.json'));
    for (const k of Object.keys(ev)) assert.ok(schema.properties[k], `event key "${k}" is not in adoption-event.schema.json`);
    for (const k of schema.required) assert.ok(k in ev, `schema requires "${k}"`);
    for (const section of ['identity', 'context', 'volume', 'usage', 'outcome', 'cost']) {
      for (const k of Object.keys(ev[section])) assert.ok(schema.properties[section].properties[k], `event key "${section}.${k}" is not in the schema`);
    }
  } finally { rmrf(out); rmrf(home); }
});

test('telemetry: --no-telemetry and the legacy EMSTECH_TELEMETRY=off change neither the summary, the exit code nor the duration class', () => {
  const { home, env } = makeEnv();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-run-'));
  try {
    seedRun(out, env);
    const strip = s => { const j = readJSON(path.join(out, 'run-summary.json')); delete j.telemetry; return j; };
    const t0 = Date.now();
    const a = run(['summary', '--out', out, '--no-telemetry'], env);
    const ta = Date.now() - t0;
    const A = strip();
    const t1 = Date.now();
    const b = run(['summary', '--out', out], { ...env, [LEGACY_OFF]: 'off' });
    const tb = Date.now() - t1;
    const B = strip();
    const t2 = Date.now();
    // Enabled, endpoint configured but unreachable (nothing listens on port 9): must still be fail-open.
    const c = run(['summary', '--out', out, '--endpoint', 'http://127.0.0.1:9/v1/logs'], env);
    const tc = Date.now() - t2;
    const C = strip();
    assert.equal(a.status, 0); assert.equal(b.status, 0); assert.equal(c.status, 0);
    assert.match(b.stdout, /Telemetry:\s+disabled \(EMSTECH_TELEMETRY=off\)/); // legacy
    assert.match(c.stdout, /Telemetry:\s+(queued|spooled|awaiting-acknowledgment)/);
    for (const j of [A, B, C]) { delete j.endedAt; delete j.elapsedMs; }
    assert.deepEqual(A, B);
    assert.deepEqual(A, C);
    assert.ok(Math.max(ta, tb, tc) < 15000, `summary must stay fast: ${ta} ${tb} ${tc} ms`);
    assert.ok(!fs.existsSync(path.join(home, 'spool')) || fs.readdirSync(path.join(home, 'spool')).length <= 1, 'disabled runs never spool');
  } finally { rmrf(out); rmrf(home); }
});

test('telemetry: nothing is sent before acknowledgment, and nothing at all with an empty endpoint', () => {
  const { home, env } = makeEnv();
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-run-'));
  try {
    seedRun(out, env);
    let r = run(['telemetry', '--notice'], env);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^not-configured/);
    r = run(['summary', '--out', out], env);
    assert.match(r.stdout, /Telemetry:\s+not-configured .*nothing sent anywhere/);
    assert.ok(!fs.existsSync(path.join(home, 'spool')), 'no spool without an endpoint');

    r = run(['telemetry', '--notice', '--endpoint', 'http://127.0.0.1:9/v1/logs'], env);
    assert.match(r.stdout, /^awaiting-acknowledgment/);
    assert.match(r.stdout, /What is collected/);
    assert.match(r.stdout, /Aggregation floor: no slice covering fewer than 5 people/);
    r = run(['summary', '--out', out, '--endpoint', 'http://127.0.0.1:9/v1/logs'], env);
    assert.match(r.stdout, /Telemetry:\s+awaiting-acknowledgment/);
    assert.ok(!fs.existsSync(path.join(home, 'spool')), 'no spool before acknowledgment');

    r = run(['telemetry', '--ack'], env);
    assert.equal(r.status, 0);
    assert.ok(fs.existsSync(path.join(home, 'telemetry-ack.json')));
    r = run(['telemetry', '--notice', '--endpoint', 'http://127.0.0.1:9/v1/logs'], env);
    assert.match(r.stdout, /^acknowledged/);
    r = run(['telemetry', '--show-last'], env);
    assert.match(r.stdout, /no event has been sent from this machine/);
  } finally { rmrf(out); rmrf(home); }
});

// A receiver in its own process: spawnSync in the test would block an in-process
// server's event loop and every send would time out. It prints its port, then
// appends each request as one JSON line to the file it was given.
function startReceiver(logFile) {
  const script = `
const http = require('http'); const fs = require('fs');
const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; });
  req.on('end', () => { fs.appendFileSync(process.argv[1], JSON.stringify({ url: req.url, headers: req.headers, body: b }) + '\\n'); res.writeHead(200); res.end('{}'); }); });
srv.listen(0, '127.0.0.1', () => { process.stdout.write(String(srv.address().port) + '\\n'); });
setTimeout(() => process.exit(0), 20000);`;
  const { spawn } = require('child_process');
  const child = spawn(process.execPath, ['-e', script, logFile], { stdio: ['ignore', 'pipe', 'ignore'] });
  return new Promise(resolve => {
    child.stdout.once('data', d => resolve({ child, port: Number(String(d).trim()) }));
  });
}

test('telemetry: payload sent equals --dry-run output byte for byte; --show-last returns it; --purge clears', async () => {
  const { home, env } = makeEnv({ CHANGE_REVIEWER_TELEMETRY_SYNC: '1' });
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-run-'));
  const logFile = path.join(out, 'received.ndjson');
  const { child, port } = await startReceiver(logFile);
  const endpoint = `http://127.0.0.1:${port}/v1/logs`;
  try {
    seedRun(out, env);
    run(['telemetry', '--ack'], env);
    writeJSON(home, 'config.json', { endpoint, headers: { Authorization: 'Bearer test-token' }, salt: 'org-salt' });
    const s = run(['summary', '--out', out], env);
    assert.equal(s.status, 0, s.stderr);
    assert.match(s.stdout, /Telemetry:\s+sent → http:\/\/127\.0\.0\.1:\d+\/v1\/logs · event [0-9a-f-]{36} · 1 event\(s\) sent synchronously/);
    const written = fs.readFileSync(path.join(out, 'adoption-event.json'), 'utf8');
    const received = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    assert.equal(received.length, 1, 'receiver got exactly one event');
    const env0 = JSON.parse(received[0].body);
    const body = env0.resourceLogs[0].scopeLogs[0].logRecords[0].body.stringValue;
    assert.equal(body, written, 'wire body == adoption-event.json byte for byte');
    assert.equal(received[0].headers.authorization, 'Bearer test-token');
    // Exactly these two resource attributes: nothing about the state
    // directory, its source or the legacy names rides along (C6).
    assert.deepEqual(env0.resourceLogs[0].resource.attributes.map(a => [a.key, a.value.stringValue]),
      [['service.name', 'change-reviewer'], ['service.version', telemetry.envelope(written).resourceLogs[0].resource.attributes[1].value.stringValue]]);
    assert.doesNotMatch(received[0].body, /legacy|emstech|change-reviewer\/|\.claude/i); // legacy
    const attrs = Object.fromEntries(env0.resourceLogs[0].scopeLogs[0].logRecords[0].attributes.map(a => [a.key, a.value]));
    assert.equal(attrs['event'].stringValue, 'flow-lite.run');
    assert.equal(attrs['identity.idScope'].stringValue, 'org', 'org salt configured');

    const last = run(['telemetry', '--show-last'], env);
    assert.equal(last.stdout, written, '--show-last == what was sent');
    const ev = JSON.parse(written);
    const dry = JSON.parse(run(['telemetry', '--dry-run', '--out', out], env).stdout);
    delete ev.eventId; delete dry.eventId;
    assert.deepEqual(dry, ev, '--dry-run derives the identical payload (modulo the fresh event id)');
    assert.equal(fs.readdirSync(path.join(home, 'spool')).length, 0, 'spool drained after send');

    const p = run(['telemetry', '--purge'], env);
    assert.equal(p.status, 0);
    assert.ok(!fs.existsSync(path.join(home, 'last-event.json')));
    assert.match(run(['telemetry', '--show-last'], env).stdout, /no event has been sent/);
  } finally {
    child.kill();
    rmrf(out); rmrf(home);
  }
});

test('telemetry: spool is bounded and unreachable endpoints keep events for the next run', async () => {
  const { home } = makeEnv();
  const saved = process.env.CHANGE_REVIEWER_HOME;
  process.env.CHANGE_REVIEWER_HOME = home;
  try {
    fs.mkdirSync(path.join(home, 'spool'), { recursive: true });
    const now = Date.now();
    for (let i = 0; i < telemetry.SPOOL_MAX_FILES + 5; i++) fs.writeFileSync(path.join(home, 'spool', `${now - i}-e${i}.json`), '{}\n');
    fs.writeFileSync(path.join(home, 'spool', `${now - telemetry.SPOOL_MAX_AGE_MS - 1000}-old.json`), '{}\n');
    telemetry.spoolTrim();
    const left = fs.readdirSync(path.join(home, 'spool'));
    assert.equal(left.length, telemetry.SPOOL_MAX_FILES);
    assert.ok(!left.some(f => f.endsWith('-old.json')), 'expired event discarded');
    const r = await telemetry.flushSpool({ endpoint: 'http://127.0.0.1:9/v1/logs', headers: {} });
    assert.equal(r.sent, 0);
    assert.equal(r.failed, telemetry.SPOOL_MAX_FILES);
    assert.ok(r.cause);
  } finally {
    if (saved === undefined) delete process.env.CHANGE_REVIEWER_HOME; else process.env.CHANGE_REVIEWER_HOME = saved;
    rmrf(home);
  }
});

test('telemetry: aggregation floor never renders a slice under N people, and the total is suppressed too when small', () => {
  const ev = (user, profile, blocked = 0) => JSON.stringify({ identity: { userId: user }, context: { profileName: profile }, outcome: { committed: 1, blocked, inconclusive: 0, blockersByRule: blocked ? { wiring: blocked } : {} } });
  const lines = [
    ...['u1', 'u2', 'u3', 'u4', 'u5', 'u1'].map(u => ev(u, 'default', 1)),
    ...['u6', 'u7'].map(u => ev(u, 'regulated', 3)),
  ];
  const r = telemetry.aggregate(lines, { by: 'context.profileName', minPeople: 5 });
  assert.equal(r.events, 8);
  assert.equal(r.distinctPeopleTotal, 7);
  assert.equal(r.slices.length, 1);
  assert.equal(r.slices[0]['context.profileName'], 'default');
  assert.equal(r.slices[0].distinctPeople, 5);
  assert.deepEqual(r.slices[0].blockersByRule, { wiring: 6 });
  assert.equal(r.slicesSuppressed, 1, 'regulated (2 people) is suppressed, not rounded');
  assert.ok(!JSON.stringify(r).includes('u6'), 'no user id ever appears in an aggregate');
  const small = telemetry.aggregate(lines.slice(0, 3), { minPeople: 5 });
  assert.equal(small.distinctPeopleTotal, '< 5 (suppressed)');
  assert.equal(small.slices.length, 0);
});

// ---- rename compatibility and the controls of task 004 §7.2 (C1–C6) ----------
//
// The shape of every case: a receiver that records requests, an acknowledged
// machine, an endpoint the event WOULD go to, and one opt-out source. The
// only acceptable outcome of an opt-out is zero requests, no spool and no
// last-event anywhere.

function received(logFile) {
  if (!fs.existsSync(logFile)) return [];
  return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}
function spoolFiles(dir) {
  const sp = path.join(dir, 'spool');
  return fs.existsSync(sp) ? fs.readdirSync(sp) : [];
}
function assertNothingLeft(dirs, logFile, label) {
  assert.equal(received(logFile).length, 0, `${label}: nothing may reach the receiver`);
  for (const d of dirs) {
    assert.deepEqual(spoolFiles(d), [], `${label}: nothing spooled in ${d}`);
    assert.ok(!fs.existsSync(path.join(d, 'last-event.json')), `${label}: no last-event in ${d}`);
  }
}
function ack(dir) { writeJSON(dir, 'telemetry-ack.json', { acknowledgedAt: '2026-09-01T00:00:00Z', noticeVersion: 1 }); }

test('compat (AC-05): legacy config.json with enabled=false and no new directory → nothing sent, nothing spooled', async () => {
  const { home, env } = makeEnv({ CHANGE_REVIEWER_TELEMETRY_SYNC: '1' }, { stateOverride: false });
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-run-'));
  const logFile = path.join(out, 'received.ndjson');
  const { child, port } = await startReceiver(logFile);
  try {
    seedRun(out, env);
    const legacyDir = legacyDefault(home); // legacy
    ack(legacyDir);
    writeJSON(legacyDir, 'config.json', { enabled: false, endpoint: `http://127.0.0.1:${port}/v1/logs` });
    const r = run(['summary', '--out', out], env);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Telemetry:\s+disabled \(config\.json enabled=false at .*\[default \(legacy\)\]\)/);
    assertNothingLeft([legacyDir, newDefault(home)], logFile, 'legacy opt-out');
    assert.ok(!fs.existsSync(newDefault(home)), 'nothing is created under the new name either');
  } finally { child.kill(); rmrf(out); rmrf(home); }
});

test('compat (AC-05): an acknowledgment recorded in the legacy directory still counts, the notice does not come back', () => {
  const { home, env } = makeEnv({}, { stateOverride: false });
  try {
    ack(legacyDefault(home)); // legacy
    const r = run(['telemetry', '--notice', '--endpoint', 'http://127.0.0.1:9/v1/logs'], env);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^acknowledged/);
    assert.doesNotMatch(r.stdout, /What is collected/);
    // Also with the new directory present and without its own ack.
    fs.mkdirSync(newDefault(home), { recursive: true });
    assert.match(run(['telemetry', '--notice', '--endpoint', 'http://127.0.0.1:9/v1/logs'], env).stdout, /^acknowledged/);
  } finally { rmrf(home); }
});

test('C1: opt-out is a union and fail-closed — no source turns it back on', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-run-'));
  const logFile = path.join(out, 'received.ndjson');
  const { child, port } = await startReceiver(logFile);
  const endpoint = `http://127.0.0.1:${port}/v1/logs`;
  const cases = [
    {
      label: 'legacy default enabled=false + new default enabled=true',
      setup: home => {
        writeJSON(legacyDefault(home), 'config.json', { enabled: false }); // legacy
        ack(newDefault(home));
        writeJSON(newDefault(home), 'config.json', { enabled: true, endpoint });
      },
      opts: { stateOverride: false },
      expect: /disabled \(config\.json enabled=false at .*\[default \(legacy\)\]\)/,
    },
    {
      label: 'legacy env off + new env on',
      extra: { [LEGACY_OFF]: 'off', CHANGE_REVIEWER_TELEMETRY: 'on' },
      setup: home => { ack(home); writeJSON(home, 'config.json', { endpoint }); },
      expect: /disabled \(EMSTECH_TELEMETRY=off\)/, // legacy
    },
    {
      label: 'new env off, case and spaces ignored',
      extra: { CHANGE_REVIEWER_TELEMETRY: ' OFF ' },
      setup: home => { ack(home); writeJSON(home, 'config.json', { endpoint }); },
      expect: /disabled \(CHANGE_REVIEWER_TELEMETRY=off\)/,
    },
    {
      label: 'legacy home override enabled=false + new home override defined',
      setup: (home, env) => {
        const legacyHome = path.join(home, 'legacy-home'); // legacy
        writeJSON(legacyHome, 'config.json', { enabled: false });
        env[LEGACY_HOME] = legacyHome;
        ack(home); writeJSON(home, 'config.json', { enabled: true, endpoint });
      },
      expect: /disabled \(config\.json enabled=false at .*legacy-home \[EMSTECH_REVIEWER_HOME \(legacy\)\]\)/, // legacy
    },
    {
      label: 'config.json that does not parse',
      setup: home => { ack(home); write(home, 'config.json', '{ "enabled": fal'); },
      args: ['--endpoint', endpoint],
      expect: /disabled \(config\.json unreadable at .*treated as opt-out\)/,
    },
    {
      label: 'unparseable config.json in a candidate other than the resolved one',
      setup: home => { write(legacyDefault(home), 'config.json', 'not json'); ack(home); writeJSON(home, 'config.json', { endpoint }); }, // legacy
      expect: /disabled \(config\.json unreadable at .*\[default \(legacy\)\]/,
    },
  ];
  try {
    for (const c of cases) {
      const { home, env } = makeEnv({ CHANGE_REVIEWER_TELEMETRY_SYNC: '1', ...(c.extra || {}) }, c.opts || {});
      const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-run-'));
      try {
        seedRun(runDir, env);
        c.setup(home, env);
        const r = run(['summary', '--out', runDir, ...(c.args || [])], env);
        assert.equal(r.status, 0, `${c.label}: ${r.stderr}`);
        assert.match(r.stdout, c.expect, c.label);
        const dirs = [home, newDefault(home), legacyDefault(home)]; // legacy
        if (env[LEGACY_HOME]) dirs.push(env[LEGACY_HOME]);
        assertNothingLeft(dirs, logFile, c.label);
        // --flush and --notice agree with the summary.
        assert.match(run(['telemetry', '--flush', '--endpoint', endpoint], env).stdout, /^disabled .*nothing sent, spool untouched/, c.label);
        assert.match(run(['telemetry', '--notice'], env).stdout, /^disabled /, c.label);
        assert.equal(received(logFile).length, 0, `${c.label}: flush sent nothing`);
      } finally { rmrf(runDir); rmrf(home); }
    }
  } finally { child.kill(); rmrf(out); }
});

test('C2: --flush checks the opt-out before reading the spool', async () => {
  const { home, env } = makeEnv({ [LEGACY_OFF]: 'off' });
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-run-'));
  const logFile = path.join(out, 'received.ndjson');
  const { child, port } = await startReceiver(logFile);
  try {
    // An event left behind by a failed send, before the dev switched off.
    write(home, `spool/${Date.now()}-left.json`, '{"schemaVersion":1}\n');
    const r = run(['telemetry', '--flush', '--endpoint', `http://127.0.0.1:${port}/v1/logs`], env);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /disabled \(EMSTECH_TELEMETRY=off\): nothing sent, spool untouched/); // legacy
    assert.equal(received(logFile).length, 0);
    assert.equal(spoolFiles(home).length, 1, 'spool intact');
  } finally { child.kill(); rmrf(out); rmrf(home); }
});

test('C3: resolveTransport keeps endpoint and headers from the same source', () => {
  const auth = { Authorization: 'Bearer from-config' };
  const otel = { OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Bearer from-otel' };
  const T = telemetry.resolveTransport;
  // --endpoint: never any auth header, whatever config and env hold.
  assert.deepEqual(T({ override: 'http://x/v1/logs', cfg: { endpoint: 'http://cfg', headers: auth }, env: otel }), { endpoint: 'http://x/v1/logs', headers: {}, source: '--endpoint' });
  // config.json endpoint → that config's headers, labelled with the state source.
  assert.deepEqual(T({ cfg: { endpoint: 'http://cfg', headers: auth }, stateSource: 'default (legacy)', env: otel }), { endpoint: 'http://cfg', headers: auth, source: 'config.json [default (legacy)]' });
  // env endpoints (new and legacy) → no headers, neither config's nor OTEL's.
  assert.deepEqual(T({ cfg: { headers: auth }, env: { ...otel, CHANGE_REVIEWER_TELEMETRY_ENDPOINT: 'http://new' } }), { endpoint: 'http://new', headers: {}, source: 'CHANGE_REVIEWER_TELEMETRY_ENDPOINT' });
  assert.deepEqual(T({ cfg: { headers: auth }, env: { ...otel, [LEGACY_ENDPOINT]: 'http://old' } }), { endpoint: 'http://old', headers: {}, source: 'EMSTECH_TELEMETRY_ENDPOINT (legacy)' }); // legacy
  assert.equal(T({ env: { CHANGE_REVIEWER_TELEMETRY_ENDPOINT: 'http://new', [LEGACY_ENDPOINT]: 'http://old' } }).endpoint, 'http://new', 'new env wins over legacy'); // legacy
  // OTEL endpoint → OTEL headers only, never config's.
  assert.deepEqual(T({ cfg: { headers: auth }, env: { ...otel, OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel/' } }), { endpoint: 'http://otel/v1/logs', headers: { Authorization: 'Bearer from-otel' }, source: 'OTEL_EXPORTER_OTLP_ENDPOINT' });
  assert.deepEqual(T({ env: { ...otel, OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: 'http://logs' } }).headers, { Authorization: 'Bearer from-otel' });
  assert.deepEqual(T({ env: {} }), { endpoint: '', headers: {}, source: 'none' });
  // Background flush: no endpoint in argv unless the user gave one.
  assert.deepEqual(telemetry.backgroundArgs('/s.js'), ['/s.js', 'telemetry', '--flush']);
  assert.deepEqual(telemetry.backgroundArgs('/s.js', { endpointOverride: 'http://u' }), ['/s.js', 'telemetry', '--flush', '--endpoint', 'http://u']);
});

test('C3: on the wire, headers never reach an endpoint from another source; the background child resolves its own transport', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-run-'));
  const logFile = path.join(out, 'received.ndjson');
  const { child, port } = await startReceiver(logFile);
  const endpoint = `http://127.0.0.1:${port}/v1/logs`;
  const cases = [
    {
      label: 'config headers × endpoint from env',
      extra: { CHANGE_REVIEWER_TELEMETRY_ENDPOINT: endpoint, OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Bearer from-otel' },
      setup: home => { ack(home); writeJSON(home, 'config.json', { headers: { Authorization: 'Bearer from-config' } }); },
    },
    {
      label: 'legacy directory headers × new directory endpoint',
      opts: { stateOverride: false },
      setup: home => {
        writeJSON(legacyDefault(home), 'config.json', { headers: { Authorization: 'Bearer from-legacy' } }); // legacy
        ack(newDefault(home)); writeJSON(newDefault(home), 'config.json', { endpoint });
      },
    },
  ];
  try {
    for (const c of cases) {
      const { home, env } = makeEnv({ CHANGE_REVIEWER_TELEMETRY_SYNC: '1', ...(c.extra || {}) }, c.opts || {});
      const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-run-'));
      try {
        seedRun(runDir, env);
        c.setup(home);
        const before = received(logFile).length;
        const r = run(['summary', '--out', runDir], env);
        assert.match(r.stdout, /Telemetry:\s+sent/, `${c.label}: ${r.stdout}`);
        const got = received(logFile).slice(before);
        assert.equal(got.length, 1, c.label);
        assert.equal(got[0].headers.authorization, undefined, `${c.label}: no auth header crossed sources`);
      } finally { rmrf(runDir); rmrf(home); }
    }

    // Background flush (no SYNC): the child must find config headers by
    // itself. With the endpoint passed through argv it would be "--endpoint"
    // and would carry no headers.
    const { home, env } = makeEnv();
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-run-'));
    try {
      seedRun(runDir, env);
      ack(home); writeJSON(home, 'config.json', { endpoint, headers: { Authorization: 'Bearer same-source' } });
      const before = received(logFile).length;
      const r = run(['summary', '--out', runDir], env);
      assert.match(r.stdout, /Telemetry:\s+queued/, r.stdout);
      let got = [];
      for (let i = 0; i < 100 && !got.length; i++) { await new Promise(res => setTimeout(res, 50)); got = received(logFile).slice(before); }
      assert.equal(got.length, 1, 'background child sent the event');
      assert.equal(got[0].headers.authorization, 'Bearer same-source');
    } finally { rmrf(runDir); rmrf(home); }
  } finally { child.kill(); rmrf(out); }
});

test('C4: the summary line and --notice show where state and endpoint come from', () => {
  const cases = [
    { expect: /state .* \[CHANGE_REVIEWER_HOME\]/, make: () => makeEnv() },
    { expect: /state .*legacy-home \[EMSTECH_REVIEWER_HOME \(legacy\)\]/, make: () => { // legacy
      const r = makeEnv({}, { stateOverride: false }); r.env[LEGACY_HOME] = path.join(r.home, 'legacy-home'); return r; } }, // legacy
    { expect: /state .*\.change-reviewer \[default\]/, make: () => makeEnv({}, { stateOverride: false }) },
    { expect: /state .*\.emstech-reviewer \[default \(legacy\)\]/, make: () => { // legacy
      const r = makeEnv({}, { stateOverride: false }); fs.mkdirSync(legacyDefault(r.home), { recursive: true }); return r; } }, // legacy
  ];
  for (const c of cases) {
    const { home, env } = c.make();
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-run-'));
    try {
      seedRun(out, env);
      const s = run(['summary', '--out', out, '--endpoint', 'http://127.0.0.1:9/v1/logs'], env);
      const line = s.stdout.split('\n').find(l => l.startsWith('Telemetry:'));
      assert.match(line, c.expect);
      assert.match(line, /endpoint source --endpoint/);
      const n = run(['telemetry', '--notice'], { ...env, CHANGE_REVIEWER_TELEMETRY_ENDPOINT: 'http://127.0.0.1:9/v1/logs' });
      assert.match(n.stdout, c.expect);
      assert.match(n.stdout, /endpoint source CHANGE_REVIEWER_TELEMETRY_ENDPOINT/);
      // Disabled runs say it too.
      assert.match(run(['summary', '--out', out, '--no-telemetry'], env).stdout, c.expect);
    } finally { rmrf(out); rmrf(home); }
  }
});

test('C5: --purge clears spool and last-event from every candidate state directory', () => {
  const { home, env } = makeEnv({}, { stateOverride: false });
  try {
    const overrideNew = path.join(home, 'override-new');
    const overrideLegacy = path.join(home, 'override-legacy'); // legacy
    const dirs = [newDefault(home), legacyDefault(home), overrideNew, overrideLegacy]; // legacy
    for (const d of dirs) {
      write(d, `spool/${Date.now()}-e.json`, '{}\n');
      write(d, 'last-event.json', '{}\n');
    }
    const r = run(['telemetry', '--purge'], { ...env, CHANGE_REVIEWER_HOME: overrideNew, [LEGACY_HOME]: overrideLegacy });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /purged 4 spooled event\(s\) and the last-sent record \(4 file\(s\)\) from 4 candidate state directories/);
    for (const d of dirs) {
      assert.deepEqual(spoolFiles(d), [], `spool left in ${d}`);
      assert.ok(!fs.existsSync(path.join(d, 'last-event.json')), `last-event left in ${d}`);
    }
  } finally { rmrf(home); }
});

// Leaf paths of the event derived from seedRun, generated with the code of
// the BASE (before the rename). A new field — a state source, a directory, a
// "legacy" flag — changes this list and fails here.
const BASE_EVENT_LEAVES = ['agentVersion', 'command', 'context.profileName', 'context.profileVersion', 'context.reportOnly', 'context.targetRefId', 'cost.byPhase.gate.durationMs', 'cost.byPhase.gate.tokensIn', 'cost.byPhase.gate.tokensOut', 'cost.byPhase.implement.durationMs', 'cost.byPhase.implement.tokensIn', 'cost.byPhase.implement.tokensOut', 'cost.byPhase.scope.durationMs', 'cost.byPhase.scope.tokensIn', 'cost.byPhase.scope.tokensOut', 'cost.elapsedMs', 'cost.tokensIn', 'cost.tokensOut', 'cost.tokensStatus', 'eventId', 'identity.idScope', 'identity.repoId', 'identity.userId', 'occurredAt', 'outcome.aborted', 'outcome.blocked', 'outcome.blockersByRule.scope', 'outcome.blockersByRule.wiring', 'outcome.committed', 'outcome.inconclusive', 'outcome.inconclusiveRate', 'outcome.status', 'outcome.verdicts.pass', 'schemaVersion', 'usage.exitCodes.0', 'usage.exitCodes.2', 'usage.overridesByRule.scope', 'usage.stopPhases.scope-gate', 'volume.items', 'volume.itemsPlanned', 'volume.iterationsMax', 'volume.iterationsMedian', 'volume.iterationsTotal'];

test('C6: the event allowlist is frozen — same leaf paths as the BASE, whatever state source is in use', () => {
  const leaves = (o, p = '', acc = []) => {
    for (const [k, v] of Object.entries(o)) {
      const key = p ? `${p}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) leaves(v, key, acc); else acc.push(key);
    }
    return acc;
  };
  for (const legacyState of [false, true]) {
    const { home, env } = makeEnv({}, { stateOverride: false });
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-run-'));
    try {
      if (legacyState) writeJSON(legacyDefault(home), 'config.json', { salt: 'org-salt' }); // legacy
      seedRun(out, env);
      const r = run(['telemetry', '--dry-run', '--out', out], env);
      assert.equal(r.status, 0, r.stderr);
      assert.deepEqual(leaves(JSON.parse(r.stdout)).sort(), BASE_EVENT_LEAVES);
      assert.doesNotMatch(r.stdout, /legacy|emstech|change-reviewer|\.claude|default \(/i); // legacy
    } finally { rmrf(out); rmrf(home); }
  }
});

test('C13: the first-run notice names the opt-out under both names, both config paths and the header rule; NOTICE_VERSION stays 1', () => {
  const { home, env } = makeEnv();
  try {
    const r = run(['telemetry', '--notice', '--endpoint', 'http://127.0.0.1:9/v1/logs'], env);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^awaiting-acknowledgment/);
    assert.match(r.stdout, /CHANGE_REVIEWER_TELEMETRY=off/);
    assert.match(r.stdout, /EMSTECH_TELEMETRY=off/); // legacy
    assert.match(r.stdout, /~\/\.claude\/\.change-reviewer\/config\.json/);
    assert.match(r.stdout, /~\/\.claude\/\.emstech-reviewer\/config\.json/); // legacy
    assert.match(r.stdout, /Headers only travel to the\s+endpoint of the same source/);
    // The notice changed names, not what is collected: bumping would re-show
    // it to everyone who already acknowledged.
    assert.equal(telemetry.NOTICE_VERSION, 1);
  } finally { rmrf(home); }
});
