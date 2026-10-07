'use strict';
// ledger — the run record every summary is derived from.
//
// The orchestrator (a model) is a bad clock and a worse token counter. So the
// ledger stamps wall-clock time itself, and it measures tokens only through
// an external source it can name: the `otel-cost.js` script of the
// session-cost skill (snapshot at phase start, report at phase end). When the
// source is missing or fails, the phase is recorded as `inconclusive` with the
// cause. Nothing here ever estimates.
//
// File: <out>/ledger.json. Append-only in spirit: entries are added, never
// rewritten, except to close the one they open.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PHASES = Object.freeze(['scope', 'analyze', 'scope-gate', 'plan', 'implement', 'suite', 'gate', 'commit', 'push', 'reconcile', 'pr', 'other']);
const OUTCOMES = Object.freeze(['committed', 'blocked', 'aborted', 'inconclusive', 'skipped']);

class LedgerError extends Error {
  constructor(message) { super(message); this.name = 'LedgerError'; }
}

function utcNow() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
function ledgerPath(out) { return path.join(out, 'ledger.json'); }

function load(out) {
  const p = ledgerPath(out);
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch { throw new LedgerError(`ledger not found: ${p} (run \`ledger init\` first)`); }
  try { return JSON.parse(raw); } catch (e) { throw new LedgerError(`ledger is not valid JSON: ${e.message}`); }
}

function save(out, doc) {
  fs.mkdirSync(out, { recursive: true });
  const p = ledgerPath(out);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

function init({ out, batch, baseRef = null, profile = null, reportOnly = false, itemsPlanned = null }) {
  if (!batch) throw new LedgerError('--batch is required');
  const doc = {
    schemaVersion: 1,
    batch,
    baseRef,
    profile,
    reportOnly: Boolean(reportOnly),
    itemsPlanned: Number.isInteger(itemsPlanned) ? itemsPlanned : null,
    startedAt: utcNow(),
    startedMs: Date.now(),
    endedAt: null,
    endedMs: null,
    status: 'running',
    reason: null,
    phases: [],
    items: {},
  };
  save(out, doc);
  return doc;
}

// ---- token measurement through otel-cost.js --------------------------------

function runOtel(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 15000 });
  if (r.error) return { ok: false, cause: r.error.message };
  if (r.status !== 0) return { ok: false, cause: (r.stderr || r.stdout || `exit ${r.status}`).split('\n').find(Boolean) || `exit ${r.status}` };
  return { ok: true, stdout: r.stdout };
}

function snapshotTokens(script, snapPath) {
  if (!script) return { status: 'not-measured', cause: 'no token source configured (pass --otel-cost <script>)' };
  if (!fs.existsSync(script)) return { status: 'inconclusive', cause: `token source script not found: ${script}` };
  const r = runOtel(script, ['snapshot']);
  if (!r.ok) return { status: 'inconclusive', cause: r.cause };
  fs.mkdirSync(path.dirname(snapPath), { recursive: true });
  fs.writeFileSync(snapPath, r.stdout);
  return { status: 'snapshot', path: snapPath };
}

function reportTokens(script, snapPath) {
  const r = runOtel(script, ['report', '--since', snapPath, '--json']);
  if (!r.ok) return { status: 'inconclusive', cause: r.cause };
  let j;
  try { j = JSON.parse(r.stdout); } catch (e) { return { status: 'inconclusive', cause: `token source printed non-JSON: ${e.message}` }; }
  const b = j.buckets || {};
  const sum = (bucket, keys) => keys.reduce((n, k) => n + ((bucket && bucket.tokens && bucket.tokens[k]) || 0), 0);
  const orch = b.orquestrador || b.orchestrator || {};
  const sub = b.subagent || {};
  return {
    status: 'measured',
    source: 'otel-cost.js (Claude Code OpenTelemetry counters; includes subagents)',
    tokensIn: sum(orch, ['input', 'cacheRead', 'cacheCreation']) + sum(sub, ['input', 'cacheRead', 'cacheCreation']),
    tokensOut: sum(orch, ['output']) + sum(sub, ['output']),
    subagentTokensIncluded: true,
  };
}

// ---- phases -----------------------------------------------------------------

function phaseStart({ out, item, phase, iteration = 1, otelCost = null }) {
  const doc = load(out);
  if (!item) throw new LedgerError('--item is required');
  if (!PHASES.includes(phase)) throw new LedgerError(`--phase must be one of ${PHASES.join('|')}`);
  const open = doc.phases.find(p => p.item === item && p.phase === phase && p.iteration === iteration && p.endedMs === null);
  if (open) throw new LedgerError(`phase ${phase} of ${item} (iteration ${iteration}) is already open`);
  const entry = {
    item, phase, iteration,
    startedAt: utcNow(), startedMs: Date.now(), endedAt: null, endedMs: null, durationMs: null,
    status: null,
    tokens: { status: 'not-measured', cause: 'phase still open' },
    snapshot: null,
  };
  if (otelCost) {
    const snap = snapshotTokens(otelCost, path.join(out, 'otel', `${item}-${phase}-${iteration}.json`));
    if (snap.status === 'snapshot') entry.snapshot = snap.path;
    else entry.tokens = { status: snap.status, cause: snap.cause };
  } else {
    entry.tokens = { status: 'not-measured', cause: 'no token source configured (pass --otel-cost <script>)' };
  }
  doc.items[item] = doc.items[item] || { key: item, outcome: null, verdict: null, exitCode: null, stopPhase: null, iterations: 0, blockersByRule: {}, overridesByRule: {}, endedAt: null };
  doc.items[item].iterations = Math.max(doc.items[item].iterations, iteration);
  doc.phases.push(entry);
  save(out, doc);
  return entry;
}

function phaseEnd({ out, item, phase, iteration = 1, status = 'ok', otelCost = null, tokensIn = null, tokensOut = null, tokensSource = null }) {
  const doc = load(out);
  const entry = doc.phases.find(p => p.item === item && p.phase === phase && p.iteration === iteration && p.endedMs === null);
  if (!entry) throw new LedgerError(`no open phase ${phase} for ${item} (iteration ${iteration})`);
  if (!['ok', 'blocked', 'aborted', 'inconclusive'].includes(status)) throw new LedgerError('--status must be ok|blocked|aborted|inconclusive');
  entry.endedAt = utcNow();
  entry.endedMs = Date.now();
  entry.durationMs = entry.endedMs - entry.startedMs;
  entry.status = status;
  if (Number.isInteger(tokensIn) && Number.isInteger(tokensOut)) {
    // Explicit figures are accepted only with a named source; "measured" is
    // what the tool printed, and the caller must say which tool.
    if (!tokensSource) throw new LedgerError('--tokens-source is required when passing token figures');
    entry.tokens = { status: 'measured', source: tokensSource, tokensIn, tokensOut, subagentTokensIncluded: null };
  } else if (entry.snapshot && otelCost) {
    entry.tokens = reportTokens(otelCost, entry.snapshot);
  } else if (entry.snapshot && !otelCost) {
    entry.tokens = { status: 'inconclusive', cause: 'snapshot taken at start but --otel-cost not passed at end' };
  } else if (entry.tokens.status === 'not-measured' && entry.tokens.cause === 'phase still open') {
    entry.tokens = { status: 'not-measured', cause: 'no token source configured (pass --otel-cost <script>)' };
  }
  save(out, doc);
  return entry;
}

function readGateCounts(gateJsonPath) {
  const counts = { blockersByRule: {}, overridesByRule: {}, verdict: null, exitCode: null };
  if (!gateJsonPath) return counts;
  let g;
  try { g = JSON.parse(fs.readFileSync(gateJsonPath, 'utf8')); } catch { return counts; }
  for (const f of g.findings || []) {
    if (f.severity === 'blocker' && f.confirmed) counts.blockersByRule[f.rule] = (counts.blockersByRule[f.rule] || 0) + 1;
  }
  for (const o of g.overrides || []) counts.overridesByRule[o.rule] = (counts.overridesByRule[o.rule] || 0) + 1;
  counts.verdict = g.verdict || null;
  counts.exitCode = Number.isInteger(g.exitCode) ? g.exitCode : null;
  return counts;
}

function itemEnd({ out, item, outcome, verdict = null, exitCode = null, stopPhase = null, gateJson = null }) {
  const doc = load(out);
  if (!OUTCOMES.includes(outcome)) throw new LedgerError(`--outcome must be one of ${OUTCOMES.join('|')}`);
  const it = doc.items[item] || { key: item, outcome: null, verdict: null, exitCode: null, stopPhase: null, iterations: 0, blockersByRule: {}, overridesByRule: {}, endedAt: null };
  const counts = readGateCounts(gateJson);
  it.outcome = outcome;
  it.verdict = verdict || counts.verdict;
  it.exitCode = Number.isInteger(exitCode) ? exitCode : counts.exitCode;
  it.stopPhase = stopPhase;
  it.blockersByRule = counts.blockersByRule;
  it.overridesByRule = counts.overridesByRule;
  it.endedAt = utcNow();
  doc.items[item] = it;
  save(out, doc);
  return it;
}

function batchEnd({ out, status, reason = null }) {
  const doc = load(out);
  if (!['completed', 'failed'].includes(status)) throw new LedgerError('--status must be completed|failed');
  doc.status = status;
  doc.reason = reason;
  doc.endedAt = utcNow();
  doc.endedMs = Date.now();
  save(out, doc);
  return doc;
}

module.exports = { PHASES, OUTCOMES, LedgerError, ledgerPath, load, save, init, phaseStart, phaseEnd, itemEnd, batchEnd, readGateCounts, reportTokens, snapshotTokens };
