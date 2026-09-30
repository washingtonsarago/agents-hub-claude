'use strict';
// telemetry — the adoption event: derived from run-summary.json, fewer
// fields never more, sent asynchronously and fail-open over OTLP/HTTP (JSON).
//
// Guarantees implemented here, not promised:
//   1. first-run notice: nothing is sent until `telemetry --ack` recorded an
//      acknowledgment on this machine;
//   2. --dry-run prints the exact bytes that would be sent; --show-last prints
//      the exact bytes last sent;
//   3. --no-telemetry / CHANGE_REVIEWER_TELEMETRY=off (or the legacy variable
//      in legacy.js) skip everything and change nothing else (tested);
//   4. empty endpoint → nothing is written to the network, ever;
//   5. opt-out is a union: any source that says off wins, none turns it back
//      on, and an unreadable config.json counts as off (tested);
//   6. auth headers only travel to the endpoint of the same source (tested).
//
// The event carries identifiers and counts, never content: no paths, no item
// keys, no branch names, no finding text, no CLAUDE.md content. The allowlist
// is the `derive()` function; a new field requires a PR that changes it and
// schema/adoption-event.schema.json together.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { spawn, execFileSync } = require('child_process');
const { AGENT_VERSION } = require('../../../change-reviewer/scripts/lib/version');
const legacy = require('../../../change-reviewer/scripts/lib/legacy');

const SPOOL_MAX_FILES = 50;
const SPOOL_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const SEND_TIMEOUT_MS = 5000;
const MIN_PEOPLE_DEFAULT = 5;
const SERVICE_NAME = 'change-reviewer';

// Current names. The pre-rename ones live only in legacy.js; the precedence
// between the two families is the table in task 004 §5.2.
const ENV = Object.freeze({
  home: 'CHANGE_REVIEWER_HOME',
  telemetry: 'CHANGE_REVIEWER_TELEMETRY',
  endpoint: 'CHANGE_REVIEWER_TELEMETRY_ENDPOINT',
  sync: 'CHANGE_REVIEWER_TELEMETRY_SYNC',
});
const STATE_DIR_NAME = '.change-reviewer';

// ---- state directory ------------------------------------------------------------
//
// Configuration: the new name wins whole, the legacy one is a fallback, never
// mixed field by field. A dev who only has the legacy directory keeps writing
// to it: nothing is moved or migrated in their home.

function defaultDir() { return path.join(os.homedir(), '.claude', STATE_DIR_NAME); }
function legacyDefaultDir() { return path.join(os.homedir(), '.claude', legacy.LEGACY_STATE_DIR); }

// Every place a state directory may be, in precedence order, with the label
// shown to the user. Existence is checked by the callers.
function candidates() {
  const list = [];
  if (process.env[ENV.home]) list.push({ dir: process.env[ENV.home], source: ENV.home });
  if (process.env[legacy.LEGACY_ENV_HOME]) list.push({ dir: process.env[legacy.LEGACY_ENV_HOME], source: `${legacy.LEGACY_ENV_HOME} (legacy)` });
  list.push({ dir: defaultDir(), source: 'default' });
  list.push({ dir: legacyDefaultDir(), source: 'default (legacy)' });
  return list;
}

// CHANGE_REVIEWER_HOME → legacy env → new default if it exists → legacy
// default if it exists → new default (created on first write).
function resolveStateDir() {
  const env = process.env;
  if (env[ENV.home]) return { dir: env[ENV.home], source: ENV.home };
  if (env[legacy.LEGACY_ENV_HOME]) return { dir: env[legacy.LEGACY_ENV_HOME], source: `${legacy.LEGACY_ENV_HOME} (legacy)` };
  if (fs.existsSync(defaultDir())) return { dir: defaultDir(), source: 'default' };
  if (fs.existsSync(legacyDefaultDir())) return { dir: legacyDefaultDir(), source: 'default (legacy)' };
  return { dir: defaultDir(), source: 'default' };
}

function stateDir() { return resolveStateDir().dir; }
function configPath() { return path.join(stateDir(), 'config.json'); }
function ackPath() { return path.join(stateDir(), 'telemetry-ack.json'); }
function lastPath() { return path.join(stateDir(), 'last-event.json'); }
function spoolDir() { return path.join(stateDir(), 'spool'); }

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

function loadConfig() {
  return { endpoint: '', headers: {}, salt: '', enabled: true, ...readJSON(configPath(), {}) };
}

function parseHeaders(s) {
  const out = {};
  for (const kv of String(s || '').split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) out[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  return out;
}

// ---- transport: endpoint and headers from ONE source ---------------------------
//
// Headers may carry the collector credential, so they never cross sources:
//   --endpoint / *_TELEMETRY_ENDPOINT → no auth headers at all
//   config.json of the resolved dir   → that config's headers
//   OTEL_EXPORTER_OTLP_*_ENDPOINT     → OTEL_EXPORTER_OTLP_HEADERS
// Before this, config headers went to an endpoint from env, and OTEL headers
// went to an endpoint that was not the OTEL one. Pure: everything comes in by
// argument, so the matrix is testable without touching the environment.
function resolveTransport({ override = null, cfg = {}, stateSource = 'default', env = process.env } = {}) {
  if (override) return { endpoint: override, headers: {}, source: '--endpoint' };
  if (cfg.endpoint) {
    const h = cfg.headers && typeof cfg.headers === 'object' && !Array.isArray(cfg.headers) ? cfg.headers : {};
    return { endpoint: cfg.endpoint, headers: { ...h }, source: `config.json [${stateSource}]` };
  }
  if (env[ENV.endpoint]) return { endpoint: env[ENV.endpoint], headers: {}, source: ENV.endpoint };
  if (env[legacy.LEGACY_ENV_ENDPOINT]) return { endpoint: env[legacy.LEGACY_ENV_ENDPOINT], headers: {}, source: `${legacy.LEGACY_ENV_ENDPOINT} (legacy)` };
  const otelHeaders = () => parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS);
  if (env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT) return { endpoint: env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT, headers: otelHeaders(), source: 'OTEL_EXPORTER_OTLP_LOGS_ENDPOINT' };
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) return { endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '') + '/v1/logs', headers: otelHeaders(), source: 'OTEL_EXPORTER_OTLP_ENDPOINT' };
  return { endpoint: '', headers: {}, source: 'none' };
}

// The transport for this machine right now: the resolved state dir's config
// plus the environment.
function currentTransport(override) {
  const st = resolveStateDir();
  return resolveTransport({ override, cfg: loadConfig(), stateSource: st.source });
}

// One line for the run summary and --notice: where state is read from and
// where the endpoint came from. It is the only way to notice that a repo's
// .claude/settings.json pointed either somewhere else.
function provenance(override) {
  const st = resolveStateDir();
  return `state ${st.dir} [${st.source}] · endpoint source ${currentTransport(override).source}`;
}

// ---- opt-out ---------------------------------------------------------------------
//
// Union, fail-closed: any source that says off wins, and nothing turns it back
// on. Every candidate directory is read, not only the resolved one — a rename
// must never re-enable telemetry that was switched off under the old name. A
// config.json that exists but does not parse counts as off: a corrupted
// opt-out is still an opt-out.
function isDisabled({ noTelemetry }) {
  if (noTelemetry) return 'disabled (--no-telemetry)';
  for (const name of [ENV.telemetry, legacy.LEGACY_ENV_TELEMETRY]) {
    if (String(process.env[name] || '').trim().toLowerCase() === 'off') return `disabled (${name}=off)`;
  }
  const seen = new Set();
  for (const c of candidates()) {
    const p = path.join(c.dir, 'config.json');
    if (seen.has(p)) continue;
    seen.add(p);
    if (!fs.existsSync(p)) continue;
    let cfg;
    try { cfg = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {
      return `disabled (config.json unreadable at ${c.dir} [${c.source}], treated as opt-out)`;
    }
    if (cfg && cfg.enabled === false) return `disabled (config.json enabled=false at ${c.dir} [${c.source}])`;
  }
  return null;
}

function syncRequested() {
  return process.env[ENV.sync] === '1' || process.env[legacy.LEGACY_ENV_SYNC] === '1';
}

// An acknowledgment recorded under the legacy default directory still counts:
// the notice describes what is collected, and that did not change with the
// rename. NOTICE_VERSION is therefore not bumped.
function acknowledged() {
  for (const dir of new Set([stateDir(), legacyDefaultDir()])) {
    const a = readJSON(path.join(dir, 'telemetry-ack.json'), null);
    if (a && a.acknowledgedAt) return true;
  }
  return false;
}

function acknowledge() {
  const doc = { acknowledgedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), noticeVersion: NOTICE_VERSION, machine: hash('machine', os.hostname()) };
  writeJSON(ackPath(), doc);
  return doc;
}

// ---- pseudonymous identity ---------------------------------------------------

function hash(salt, value) {
  return crypto.createHash('sha256').update(`${salt}\n${value}`).digest('hex').slice(0, 32);
}

// The org-wide salt makes the id stable across machines of the same person.
// Without it the id is per machine and the event says so: a per-machine id
// counts machines, not people, and pretending otherwise would be a lie in the
// denominator.
function identity(cfg, repo) {
  const salt = cfg.salt || '';
  let who = '';
  try { who = execFileSync('git', ['config', '--get', 'user.email'], { cwd: repo || process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* fall through */ }
  if (!who) who = os.userInfo().username;
  let remote = '';
  try { remote = execFileSync('git', ['config', '--get', 'remote.origin.url'], { cwd: repo || process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* fall through */ }
  remote = remote.replace(/\.git$/, '').replace(/^https?:\/\/[^@]*@/, 'https://').toLowerCase();
  const effectiveSalt = salt || `machine:${os.hostname()}`;
  return {
    userId: hash(effectiveSalt, who),
    repoId: remote ? hash(effectiveSalt, remote) : null,
    idScope: salt ? 'org' : 'machine',
  };
}

// ---- derivation (the allowlist) ---------------------------------------------

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mergeCounts(target, src) {
  for (const [k, v] of Object.entries(src || {})) target[k] = (target[k] || 0) + v;
  return target;
}

function derive(summary, { cfg, repo, eventId = null, occurredAt = null }) {
  const id = identity(cfg, repo);
  const items = summary.byItem || [];
  const blockersByRule = {};
  const overridesByRule = {};
  const stopPhases = {};
  const exitCodes = {};
  const verdicts = {};
  for (const it of items) {
    mergeCounts(blockersByRule, it.blockersByRule);
    mergeCounts(overridesByRule, it.overridesByRule);
    if (it.stopPhase) stopPhases[it.stopPhase] = (stopPhases[it.stopPhase] || 0) + 1;
    if (Number.isInteger(it.exitCode)) exitCodes[String(it.exitCode)] = (exitCodes[String(it.exitCode)] || 0) + 1;
    if (it.verdict) verdicts[it.verdict] = (verdicts[it.verdict] || 0) + 1;
  }
  const byPhase = {};
  for (const p of summary.byPhase || []) {
    byPhase[p.phase] = {
      durationMs: p.durationMs,
      tokensIn: p.tokens.status === 'measured' ? p.tokens.tokensIn : null,
      tokensOut: p.tokens.status === 'measured' ? p.tokens.tokensOut : null,
    };
  }
  const profile = String(summary.batch.profile || 'default@1.0.0');
  const at = profile.lastIndexOf('@');
  return {
    schemaVersion: 1,
    eventId: eventId || crypto.randomUUID(),
    occurredAt: occurredAt || summary.endedAt,
    command: 'flow-lite',
    agentVersion: AGENT_VERSION,
    identity: { userId: id.userId, repoId: id.repoId, idScope: id.idScope },
    context: {
      profileName: at > 0 ? profile.slice(0, at) : profile,
      profileVersion: at > 0 ? profile.slice(at + 1) : null,
      targetRefId: summary.batch.baseRef ? hash(cfg.salt || `machine:${os.hostname()}`, summary.batch.baseRef) : null,
      reportOnly: Boolean(summary.batch.reportOnly),
    },
    volume: {
      items: summary.batch.items,
      itemsPlanned: summary.batch.itemsPlanned,
      iterationsTotal: items.reduce((n, i) => n + (i.iterations || 0), 0),
      iterationsMax: items.reduce((n, i) => Math.max(n, i.iterations || 0), 0),
      iterationsMedian: median(items.map(i => i.iterations || 0)),
    },
    usage: { overridesByRule, stopPhases, exitCodes },
    outcome: {
      status: summary.batch.status,
      committed: summary.batch.committed,
      blocked: summary.batch.blocked,
      aborted: summary.batch.aborted,
      inconclusive: summary.batch.inconclusive,
      verdicts,
      blockersByRule,
      inconclusiveRate: items.length ? summary.batch.inconclusive / items.length : null,
    },
    cost: {
      elapsedMs: summary.elapsedMs,
      tokensStatus: summary.tokens.status,
      tokensIn: summary.tokens.status === 'measured' ? summary.tokens.tokensIn : null,
      tokensOut: summary.tokens.status === 'measured' ? summary.tokens.tokensOut : null,
      byPhase,
    },
  };
}

// Canonical bytes: this exact string is what --dry-run prints, what the spool
// stores, what --show-last prints and what goes on the wire as the log body.
function canonical(event) { return JSON.stringify(event, null, 2) + '\n'; }

// ---- OTLP/HTTP JSON envelope -------------------------------------------------

function flatten(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else if (typeof v === 'number') out.push({ key, value: Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v } });
    else if (typeof v === 'boolean') out.push({ key, value: { boolValue: v } });
    else out.push({ key, value: { stringValue: String(v) } });
  }
  return out;
}

function envelope(eventBytes) {
  const event = JSON.parse(eventBytes);
  const nanos = String(BigInt(Date.parse(event.occurredAt || new Date().toISOString())) * 1000000n);
  return {
    resourceLogs: [{
      resource: { attributes: [{ key: 'service.name', value: { stringValue: SERVICE_NAME } }, { key: 'service.version', value: { stringValue: AGENT_VERSION } }] },
      scopeLogs: [{
        scope: { name: 'flow-lite', version: AGENT_VERSION },
        logRecords: [{
          timeUnixNano: nanos,
          severityText: 'INFO',
          body: { stringValue: eventBytes },
          attributes: flatten({ event: 'flow-lite.run', ...event }, '', []),
        }],
      }],
    }],
  };
}

// ---- spool ------------------------------------------------------------------

function spoolWrite(eventBytes, eventId) {
  fs.mkdirSync(spoolDir(), { recursive: true });
  const p = path.join(spoolDir(), `${Date.now()}-${eventId}.json`);
  fs.writeFileSync(p, eventBytes);
  spoolTrim();
  return p;
}

function spoolList() {
  if (!fs.existsSync(spoolDir())) return [];
  return fs.readdirSync(spoolDir()).filter(f => f.endsWith('.json')).sort().map(f => path.join(spoolDir(), f));
}

// Bounded: drop by age, then by count (oldest first). Silent by design.
function spoolTrim() {
  const now = Date.now();
  const files = spoolList();
  for (const f of files) {
    const ts = Number(path.basename(f).split('-')[0]);
    if (Number.isFinite(ts) && now - ts > SPOOL_MAX_AGE_MS) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
  }
  const rest = spoolList();
  for (const f of rest.slice(0, Math.max(0, rest.length - SPOOL_MAX_FILES))) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
}

// The right to erase cannot depend on which name the dev used: spool and
// last-event go from every candidate directory that exists.
function purge() {
  let n = 0;
  let lastRemoved = 0;
  const dirs = new Set(candidates().map(c => c.dir));
  for (const dir of dirs) {
    const sp = path.join(dir, 'spool');
    if (fs.existsSync(sp)) {
      n += fs.readdirSync(sp).filter(f => f.endsWith('.json')).length;
      try { fs.rmSync(sp, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    const last = path.join(dir, 'last-event.json');
    if (fs.existsSync(last)) { try { fs.unlinkSync(last); lastRemoved++; } catch { /* ignore */ } }
  }
  return { spoolRemoved: n, lastEventRemoved: true, lastEventFiles: lastRemoved, dirs: [...dirs] };
}

// ---- send -------------------------------------------------------------------

function post(endpoint, headers, body) {
  return new Promise(resolve => {
    let url;
    try { url = new URL(endpoint); } catch (e) { return resolve({ ok: false, cause: `invalid endpoint: ${e.message}` }); }
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...headers },
      timeout: SEND_TIMEOUT_MS,
    }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300 ? { ok: true, status: res.statusCode } : { ok: false, cause: `HTTP ${res.statusCode}` }));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', e => resolve({ ok: false, cause: e.message }));
    req.end(body);
  });
}

// Sends every spooled event, oldest first. Stops at the first failure so
// order is preserved. Returns { sent, failed, cause }.
async function flushSpool({ endpoint, headers }) {
  let sent = 0;
  for (const f of spoolList()) {
    const bytes = fs.readFileSync(f, 'utf8');
    const r = await post(endpoint, headers, JSON.stringify(envelope(bytes)));
    if (!r.ok) return { sent, failed: spoolList().length, cause: r.cause };
    fs.writeFileSync(lastPath(), bytes);
    try { fs.unlinkSync(f); } catch { /* ignore */ }
    sent++;
  }
  return { sent, failed: 0, cause: null };
}

// argv of the background flush. No endpoint unless the user passed one: the
// child resolves the transport itself, so headers stay tied to their source
// and no endpoint shows up in `ps`.
function backgroundArgs(scriptPath, { endpointOverride = null } = {}) {
  const args = [scriptPath, 'telemetry', '--flush'];
  if (endpointOverride) args.push('--endpoint', endpointOverride);
  return args;
}

// Detached, fail-open background flush: the run never waits on it.
function flushInBackground(scriptPath, { endpointOverride = null } = {}) {
  try {
    const child = spawn(process.execPath, backgroundArgs(scriptPath, { endpointOverride }), {
      detached: true, stdio: 'ignore', env: { ...process.env }, windowsHide: true,
    });
    child.unref();
    return true;
  } catch { return false; }
}

// ---- aggregation floor --------------------------------------------------------

// Reference aggregator for whoever builds the dashboard later: a slice that
// covers fewer than minPeople distinct userIds is never rendered. Takes NDJSON
// events (one per line) and a grouping field path (e.g. "context.profileName").
function aggregate(lines, { by = 'context.profileName', minPeople = MIN_PEOPLE_DEFAULT } = {}) {
  const get = (o, p) => p.split('.').reduce((x, k) => (x && x[k] !== undefined ? x[k] : null), o);
  const groups = new Map();
  let total = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    total++;
    const key = String(get(e, by));
    if (!groups.has(key)) groups.set(key, { key, runs: 0, users: new Set(), committed: 0, blocked: 0, inconclusive: 0, blockersByRule: {} });
    const g = groups.get(key);
    g.runs++;
    g.users.add(get(e, 'identity.userId'));
    g.committed += get(e, 'outcome.committed') || 0;
    g.blocked += get(e, 'outcome.blocked') || 0;
    g.inconclusive += get(e, 'outcome.inconclusive') || 0;
    mergeCounts(g.blockersByRule, get(e, 'outcome.blockersByRule') || {});
  }
  const allUsers = new Set();
  for (const g of groups.values()) for (const u of g.users) allUsers.add(u);
  const rendered = [];
  let suppressed = 0;
  for (const g of [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    if (g.users.size < minPeople) { suppressed++; continue; }
    rendered.push({ [by]: g.key, runs: g.runs, distinctPeople: g.users.size, committed: g.committed, blocked: g.blocked, inconclusive: g.inconclusive, blockersByRule: g.blockersByRule });
  }
  return {
    events: total,
    distinctPeopleTotal: allUsers.size >= minPeople ? allUsers.size : `< ${minPeople} (suppressed)`,
    minPeople,
    slices: rendered,
    slicesSuppressed: suppressed,
    boundary: 'Counts only. No per-person slice exists; a slice under the floor is suppressed, not rounded.',
  };
}

const NOTICE_VERSION = 1;

module.exports = {
  NOTICE_VERSION, SPOOL_MAX_FILES, SPOOL_MAX_AGE_MS, MIN_PEOPLE_DEFAULT, SERVICE_NAME, ENV,
  stateDir, resolveStateDir, candidates, configPath, ackPath, lastPath, spoolDir,
  loadConfig, parseHeaders, resolveTransport, currentTransport, provenance,
  isDisabled, syncRequested, acknowledged, acknowledge,
  identity, derive, canonical, envelope,
  spoolWrite, spoolList, spoolTrim, purge, post, flushSpool, backgroundArgs, flushInBackground, aggregate,
};
