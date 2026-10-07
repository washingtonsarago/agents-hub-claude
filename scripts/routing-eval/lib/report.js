'use strict';
// report — agrega as RODADAS, decide o exit code e serializa a saída. Puro.
//
// ERRO SISTEMÁTICO = caso errado em TODAS as rodadas. É o critério que separa
// descrição ruim de ruído do modelo: um caso que erra 1 de 2 é ruído; um que
// erra 2 de 2 é a description mandando o pedido para o agent errado.
//
// Custo é medido ou não aparece (business.md: custo reportado é medido, nunca
// estimado). O route mata o processo no 1º tool_use, antes do evento que traz
// o custo, então na prática quase toda chamada volta sem ele.

const { KINDS } = require('./evalset');

// Campos que vão para o JSON de cada rodada, e nenhum outro: nada do stream
// bruto, do init nem do stderr do filho chega ao disco (C12).
const ROUND_FIELDS = Object.freeze(['id', 'kind', 'expect', 'prompt', 'got', 'ok', 'cost']);

function serializeRound(results) {
  const rows = results.map(r => {
    const o = {};
    for (const k of ROUND_FIELDS) o[k] = r[k] === undefined ? null : r[k];
    return o;
  });
  return JSON.stringify(rows, null, 1) + '\n';
}

const FAILURE_GOTS = Object.freeze(['TIMEOUT', 'ERR', 'ENV_UNSAFE']);

function summarize(rounds, { min = 0 } = {}) {
  const perRound = rounds.map((res, idx) => {
    const byKind = {};
    for (const k of KINDS) {
      const s = res.filter(r => r.kind === k);
      if (s.length) byKind[k] = { ok: s.filter(r => r.ok).length, total: s.length };
    }
    return { round: idx + 1, correct: res.filter(r => r.ok).length, total: res.length, byKind };
  });
  const ids = rounds.length ? rounds[0].map(r => r.id) : [];
  const systematic = rounds.length
    ? ids.filter(id => rounds.every(res => { const r = res.find(x => x.id === id); return r && !r.ok; }))
    : [];
  const failures = [];
  for (const [idx, res] of rounds.entries()) {
    for (const r of res) if (FAILURE_GOTS.includes(r.got)) failures.push({ round: idx + 1, id: r.id, got: r.got });
  }
  const all = rounds.flat();
  const withCost = all.filter(r => typeof r.cost === 'number');
  const cost = all.length && withCost.length === all.length
    ? { measured: true, usd: withCost.reduce((n, r) => n + r.cost, 0) }
    : { measured: false, missing: all.length - withCost.length, calls: all.length };
  const envUnsafe = failures.some(f => f.got === 'ENV_UNSAFE');
  const belowMin = perRound.some(r => r.correct < min);
  const exitCode = envUnsafe ? 2 : (systematic.length || belowMin) ? 1 : 0;
  return { perRound, systematic, failures, cost, belowMin, envUnsafe, min, exitCode };
}

function formatReport(summary, outFiles = []) {
  const L = [];
  for (const r of summary.perRound) {
    const kinds = Object.entries(r.byKind).map(([k, v]) => `${k} ${v.ok}/${v.total}`).join(' · ');
    L.push(`rodada ${r.round}: ${r.correct}/${r.total}  (${kinds})`);
  }
  L.push(`erros sistemáticos (errados em todas as rodadas): ${summary.systematic.length ? summary.systematic.join(', ') : 'nenhum'}`);
  if (summary.failures.length) L.push(`falhas de execução: ${summary.failures.map(f => `r${f.round}:${f.id}=${f.got}`).join(', ')}`);
  if (summary.envUnsafe) L.push('ENV_UNSAFE: o init do claude trouxe ferramenta ou MCP fora do permitido; nenhum resultado desta execução vale');
  if (summary.belowMin) L.push(`abaixo do limiar --min ${summary.min} em ao menos uma rodada`);
  L.push(summary.cost.measured
    ? `custo: US$ ${summary.cost.usd.toFixed(4)} (medido no stream)`
    : `custo: não medido (${summary.cost.missing} de ${summary.cost.calls} chamadas sem custo no stream)`);
  for (const f of outFiles) L.push(`saída: ${f}`);
  L.push(`exit ${summary.exitCode}`);
  return L.join('\n') + '\n';
}

module.exports = { summarize, serializeRound, formatReport, ROUND_FIELDS };
