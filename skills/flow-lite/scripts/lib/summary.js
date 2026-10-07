'use strict';
// summary — the closing block of every /flow-lite run.
//
// Rules, all enforced here:
//   1. measured and estimated never merge: a total is printed only when every
//      contributing phase was measured from the same kind of source;
//      otherwise the total is `inconclusive` and the reason is printed;
//   2. the source and its limit sit next to the number;
//   3. what was not instrumented appears under "Not measured" with the cause,
//      never as a figure;
//   4. the "measures tool usage, not productivity" caveat is mandatory;
//   5. stdout and files (run-summary.json, run-summary.md) carry the same data.

const fs = require('fs');
const path = require('path');

const CAVEAT = 'This data measures tool usage, not productivity.';

function fmtInt(n) { return n === null || n === undefined ? '—' : Number(n).toLocaleString('en-US'); }

function fmtDur(ms) {
  if (ms === null || ms === undefined) return '—';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}min ${String(sec).padStart(2, '0')}s`;
  if (m) return `${m}min ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

function sumTokens(phases) {
  const measured = phases.filter(p => p.tokens && p.tokens.status === 'measured');
  const unmeasured = phases.filter(p => !p.tokens || p.tokens.status !== 'measured');
  if (!phases.length) return { status: 'not-measured', cause: 'no phases recorded' };
  if (unmeasured.length) {
    // `inconclusive` means a source was configured and failed to answer;
    // `not-measured` means nothing was instrumented. They are not the same
    // gap and are never printed as the same word.
    const causes = [...new Set(unmeasured.map(p => (p.tokens && p.tokens.cause) || 'unknown'))];
    const anyInconclusive = unmeasured.some(p => p.tokens && p.tokens.status === 'inconclusive');
    return { status: anyInconclusive ? 'inconclusive' : 'not-measured', cause: `${unmeasured.length} of ${phases.length} phase(s) not measured: ${causes.join('; ')}` };
  }
  const sources = [...new Set(measured.map(p => p.tokens.source))];
  return {
    status: 'measured',
    tokensIn: measured.reduce((n, p) => n + p.tokens.tokensIn, 0),
    tokensOut: measured.reduce((n, p) => n + p.tokens.tokensOut, 0),
    source: sources.join(' + '),
    subagentTokensIncluded: measured.every(p => p.tokens.subagentTokensIncluded === true),
  };
}

function build(ledger, telemetry) {
  const endedMs = ledger.endedMs || Date.now();
  const closed = ledger.phases.filter(p => p.endedMs !== null);
  const open = ledger.phases.filter(p => p.endedMs === null);
  const items = Object.values(ledger.items);

  const byPhaseName = new Map();
  for (const p of closed) {
    if (!byPhaseName.has(p.phase)) byPhaseName.set(p.phase, []);
    byPhaseName.get(p.phase).push(p);
  }
  const byPhase = [...byPhaseName.entries()].map(([phase, ps]) => ({
    phase,
    durationMs: ps.reduce((n, p) => n + p.durationMs, 0),
    tokens: sumTokens(ps),
    count: ps.length,
  }));

  const byItem = items.map(it => {
    const ps = closed.filter(p => p.item === it.key);
    return {
      key: it.key,
      durationMs: ps.reduce((n, p) => n + p.durationMs, 0),
      tokens: sumTokens(ps),
      iterations: it.iterations,
      outcome: it.outcome,
      verdict: it.verdict,
      exitCode: it.exitCode,
      stopPhase: it.stopPhase,
      blockersByRule: it.blockersByRule || {},
      overridesByRule: it.overridesByRule || {},
    };
  }).sort((a, b) => (b.tokens.tokensIn || 0) + (b.tokens.tokensOut || 0) - ((a.tokens.tokensIn || 0) + (a.tokens.tokensOut || 0)) || b.durationMs - a.durationMs);

  const byIteration = [];
  const iterKeys = new Map();
  for (const p of closed) {
    const k = `${p.item}#${p.iteration}`;
    if (!iterKeys.has(k)) iterKeys.set(k, { item: p.item, iteration: p.iteration, phases: [] });
    iterKeys.get(k).phases.push(p);
  }
  for (const v of iterKeys.values()) byIteration.push({ item: v.item, iteration: v.iteration, durationMs: v.phases.reduce((n, p) => n + p.durationMs, 0), tokens: sumTokens(v.phases) });

  const notMeasured = ['remote CI time (outside this process)'];
  if (open.length) notMeasured.push(`${open.length} phase(s) never closed: ${open.map(p => `${p.item}/${p.phase}`).join(', ')}`);
  const totals = sumTokens(closed);
  if (totals.status === 'measured' && !totals.subagentTokensIncluded) notMeasured.push('subagent tokens (token source does not include delegated work)');
  if (totals.status !== 'measured') notMeasured.push(`tokens: ${totals.cause}`);

  const count = o => items.filter(i => i.outcome === o).length;
  return {
    schemaVersion: 1,
    command: 'flow-lite',
    batch: {
      id: ledger.batch,
      status: ledger.status,
      reason: ledger.reason,
      reportOnly: ledger.reportOnly,
      profile: ledger.profile,
      baseRef: ledger.baseRef,
      items: items.length,
      itemsPlanned: ledger.itemsPlanned,
      committed: count('committed'),
      blocked: count('blocked'),
      aborted: count('aborted'),
      inconclusive: count('inconclusive'),
      skipped: count('skipped'),
    },
    startedAt: ledger.startedAt,
    endedAt: ledger.endedAt || new Date(endedMs).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    elapsedMs: endedMs - ledger.startedMs,
    elapsedSource: 'wall clock, this process (ledger timestamps)',
    tokens: totals,
    byPhase,
    byItem,
    byIteration,
    notMeasured,
    telemetry: telemetry || { status: 'not-run', detail: 'summary built without telemetry step' },
    caveat: CAVEAT,
  };
}

function tokCell(t) {
  if (t.status === 'measured') return fmtInt(t.tokensIn + t.tokensOut);
  if (t.status === 'inconclusive') return 'inconclusive';
  return '—';
}

function renderBlock(s) {
  const L = [];
  const rule = '─'.repeat(61);
  L.push(`─── /flow-lite · run summary ${'─'.repeat(31)}`);
  L.push(`Batch:           ${s.batch.id} · ${s.batch.items} items · ${s.batch.committed} committed · ${s.batch.blocked} blocked · ${s.batch.aborted} aborted · ${s.batch.inconclusive} inconclusive · status ${s.batch.status}${s.batch.reason ? ` (${s.batch.reason})` : ''}`);
  L.push(`Elapsed:         ${fmtDur(s.elapsedMs)}  (${s.elapsedSource})`);
  if (s.tokens.status === 'measured') {
    L.push(`Tokens:          in ${fmtInt(s.tokens.tokensIn)} · out ${fmtInt(s.tokens.tokensOut)} · total ${fmtInt(s.tokens.tokensIn + s.tokens.tokensOut)}`);
    L.push(`Source:          ${s.tokens.source} (measured)`);
  } else {
    L.push(`Tokens:          ${s.tokens.status === 'inconclusive' ? 'inconclusive' : 'not measured'}`);
    L.push(`Source:          ${s.tokens.cause}`);
  }
  L.push('');
  L.push(`${'By phase'.padEnd(25)}${'tokens'.padEnd(14)}time`);
  for (const p of s.byPhase) {
    L.push(`  ${p.phase.padEnd(23)}${tokCell(p.tokens).padEnd(14)}${fmtDur(p.durationMs)}`);
  }
  L.push('');
  L.push(`${'By item (top 5)'.padEnd(25)}${'tokens'.padEnd(14)}${'time'.padEnd(13)}${'iterations'.padEnd(13)}outcome`);
  for (const it of s.byItem.slice(0, 5)) {
    L.push(`  ${it.key.padEnd(23)}${tokCell(it.tokens).padEnd(14)}${fmtDur(it.durationMs).padEnd(13)}${String(it.iterations).padEnd(13)}${it.outcome || 'open'}${it.verdict ? ` (${it.verdict}, exit ${it.exitCode})` : ''}${it.stopPhase ? ` stop@${it.stopPhase}` : ''}`);
  }
  if (s.byIteration.some(i => i.iteration > 1)) {
    L.push('');
    L.push(`${'By iteration'.padEnd(25)}${'tokens'.padEnd(14)}time`);
    for (const i of s.byIteration) {
      L.push(`  ${`${i.item} #${i.iteration}`.padEnd(23)}${tokCell(i.tokens).padEnd(14)}${fmtDur(i.durationMs)}`);
    }
  }
  L.push('');
  L.push(`Not measured:    ${s.notMeasured[0] || '—'}`);
  for (const n of s.notMeasured.slice(1)) L.push(`                 ${n}`);
  const t = s.telemetry;
  L.push(`Telemetry:       ${t.status}${t.endpoint ? ` → ${t.endpoint}` : ''}${t.eventId ? ` · event ${t.eventId}` : ''}${t.detail ? ` · ${t.detail}` : ''}${t.provenance ? ` · ${t.provenance}` : ''}`);
  L.push(`Caveat:          ${s.caveat}`);
  L.push(rule);
  return L.join('\n');
}

function renderMarkdown(s) {
  return ['# /flow-lite run summary', '', '```', renderBlock(s), '```', '', `_${s.caveat}_`, ''].join('\n');
}

function write(out, s) {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'run-summary.json'), JSON.stringify(s, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'run-summary.md'), renderMarkdown(s));
}

module.exports = { build, renderBlock, renderMarkdown, write, sumTokens, CAVEAT, fmtDur };
