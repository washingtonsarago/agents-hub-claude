#!/usr/bin/env node
// session-cost — soma tokens e calcula custo de uma sessão do Claude Code a
// partir do transcript JSONL que o próprio Claude Code grava em
// ~/.claude/projects/<projeto>/<session-id>.jsonl
//
// Existe porque o modelo não tem acesso programático ao próprio consumo. O
// número tem que sair do disco, não da cabeça dele — um custo "estimado de
// memória" é exatamente a fraude de conclusão falsa que o /veredito caça.
//
// LIMITE CONHECIDO E NÃO CONTORNÁVEL AQUI:
//   Tokens de subagent NÃO entram nesta conta. Verificado em 2026-08-17 sobre
//   96 transcripts: 435 despachos de subagent (Task/Agent) e ZERO linhas com
//   `isSidechain`. O Claude Code (v2.x) não grava o consumo do subagent no
//   transcript da sessão principal. Em comandos que delegam (/flow,
//   /code-review, /feature-flow, /bug-flow, /incident-response) a maior parte
//   do gasto está justamente aí. Trate este número como **custo de
//   orquestração**, nunca como total da sessão. Para o total, use o /cost
//   nativo do Claude Code.
//
// Uso:
//   node scripts/session-cost.js                      # sessão mais recente do cwd
//   node scripts/session-cost.js --since 2026-08-17T14:00:00Z
//   node scripts/session-cost.js --file <caminho.jsonl>
//   node scripts/session-cost.js --json
//
// Zero deps. Node >= 18.

const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================
// Tabela de preços — US$ por milhão de tokens (input / output)
// ------------------------------------------------------------
// CONFERIDA EM 2026-08-17. Preço muda: reconfira em
// https://platform.claude.com/docs/en/pricing antes de usar como número
// oficial (fatura, cobrança de cliente, business case).
//
// Derivados, conforme a documentação de prompt caching:
//   leitura de cache      = 0.10x do input
//   escrita de cache 5min = 1.25x do input
//   escrita de cache 1h   = 2.00x do input
// Tokens de thinking são cobrados como output e já vêm somados em
// output_tokens — não somar de novo.
// ============================================================
const PRICING_VERIFIED_ON = '2026-08-17';
const PRICES = {
  'claude-fable-5':   { in: 10, out: 50 },
  'claude-mythos-5':  { in: 10, out: 50 },
  'claude-opus-5':    { in: 5,  out: 25 },
  'claude-opus-4-8':  { in: 5,  out: 25 },
  'claude-opus-4-7':  { in: 5,  out: 25 },
  'claude-opus-4-6':  { in: 5,  out: 25 },
  'claude-sonnet-5':  { in: 3,  out: 15 },
  'claude-sonnet-4-6':{ in: 3,  out: 15 },
  'claude-haiku-4-5': { in: 1,  out: 5  },
};
const WEB_SEARCH_PER_1K = 10; // US$ por 1.000 buscas

const CACHE_READ_MULT = 0.10;
const CACHE_WRITE_5M_MULT = 1.25;
const CACHE_WRITE_1H_MULT = 2.00;

function parseArgs(argv) {
  const a = { since: null, file: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--since') a.since = argv[++i];
    else if (argv[i] === '--file') a.file = argv[++i];
    else if (argv[i] === '--json') a.json = true;
  }
  return a;
}

// O Claude Code deriva o nome da pasta do cwd trocando '/' e '.' por '-'.
function projectDir(cwd) {
  return path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[/.]/g, '-'));
}

function newestTranscript(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ p: path.join(dir, f), m: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return files.length ? files[0].p : null;
}

function collect(file, since) {
  const sinceMs = since ? Date.parse(since) : null;
  if (since && Number.isNaN(sinceMs)) {
    throw new Error(`--since inválido: ${since} (use ISO 8601, ex: 2026-08-17T14:00:00Z)`);
  }

  const byModel = new Map();
  let messages = 0, subagentDispatches = 0, webSearches = 0;
  let firstTs = null, lastTs = null;

  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }

    // Despachos de subagent: contamos para poder DECLARAR o que ficou de fora.
    const content = o.message && o.message.content;
    if (Array.isArray(content)) {
      for (const b of content) {
        if (b.type === 'tool_use' && (b.name === 'Task' || b.name === 'Agent')) subagentDispatches++;
      }
    }

    const u = o.message && o.message.usage;
    if (!u) continue;
    if (sinceMs && o.timestamp && Date.parse(o.timestamp) < sinceMs) continue;

    const model = (o.message.model || 'unknown');
    if (model === '<synthetic>') continue; // não é chamada de API real

    if (o.timestamp) {
      if (!firstTs || o.timestamp < firstTs) firstTs = o.timestamp;
      if (!lastTs || o.timestamp > lastTs) lastTs = o.timestamp;
    }

    if (!byModel.has(model)) {
      byModel.set(model, {
        messages: 0, input: 0, output: 0, thinking: 0,
        cacheRead: 0, write5m: 0, write1h: 0,
      });
    }
    const m = byModel.get(model);
    m.messages++;
    messages++;
    m.input     += u.input_tokens || 0;
    m.output    += u.output_tokens || 0;
    m.thinking  += (u.output_tokens_details && u.output_tokens_details.thinking_tokens) || 0;
    m.cacheRead += u.cache_read_input_tokens || 0;

    // cache_creation vem quebrado por TTL — e o multiplicador difere (1.25x vs
    // 2x). Somar só cache_creation_input_tokens e assumir 5min subfatura em 60%
    // quando a sessão usa TTL de 1h.
    const cc = u.cache_creation;
    if (cc && (cc.ephemeral_1h_input_tokens || cc.ephemeral_5m_input_tokens)) {
      m.write1h += cc.ephemeral_1h_input_tokens || 0;
      m.write5m += cc.ephemeral_5m_input_tokens || 0;
    } else {
      m.write5m += u.cache_creation_input_tokens || 0; // fallback conservador
    }

    const st = u.server_tool_use;
    if (st) webSearches += st.web_search_requests || 0;
  }

  return { byModel, messages, subagentDispatches, webSearches, firstTs, lastTs };
}

function price(model, m) {
  const p = PRICES[model];
  if (!p) return { total: null, unknownModel: true };
  const inputCost     = (m.input     / 1e6) * p.in;
  const outputCost    = (m.output    / 1e6) * p.out;
  const cacheReadCost = (m.cacheRead / 1e6) * p.in * CACHE_READ_MULT;
  const write5mCost   = (m.write5m   / 1e6) * p.in * CACHE_WRITE_5M_MULT;
  const write1hCost   = (m.write1h   / 1e6) * p.in * CACHE_WRITE_1H_MULT;
  return {
    inputCost, outputCost, cacheReadCost, write5mCost, write1hCost,
    total: inputCost + outputCost + cacheReadCost + write5mCost + write1hCost,
    unknownModel: false,
  };
}

function fmt(n) { return n.toLocaleString('pt-BR'); }
function usd(n) { return '$' + n.toFixed(4); }

function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args.file || newestTranscript(projectDir(process.cwd()));

  if (!file || !fs.existsSync(file)) {
    console.error('[session-cost] transcript não encontrado.');
    console.error('  Procurado em: ' + projectDir(process.cwd()));
    console.error('  Passe --file <caminho.jsonl> explicitamente.');
    process.exit(1);
  }

  const r = collect(file, args.since);
  const rows = [];
  let grand = 0, unknown = [];

  for (const [model, m] of r.byModel) {
    const c = price(model, m);
    if (c.unknownModel) { unknown.push(model); continue; }
    grand += c.total;
    rows.push({ model, m, c });
  }
  const webCost = (r.webSearches / 1000) * WEB_SEARCH_PER_1K;
  grand += webCost;

  if (args.json) {
    console.log(JSON.stringify({
      transcript: file,
      since: args.since,
      pricing_verified_on: PRICING_VERIFIED_ON,
      messages: r.messages,
      subagent_dispatches: r.subagentDispatches,
      subagent_tokens_included: false,
      web_searches: r.webSearches,
      models: rows.map(x => ({ model: x.model, tokens: x.m, cost_usd: x.c })),
      total_usd: grand,
    }, null, 2));
    return;
  }

  const tot = rows.reduce((a, x) => ({
    input: a.input + x.m.input, output: a.output + x.m.output,
    thinking: a.thinking + x.m.thinking, cacheRead: a.cacheRead + x.m.cacheRead,
    write5m: a.write5m + x.m.write5m, write1h: a.write1h + x.m.write1h,
  }), { input: 0, output: 0, thinking: 0, cacheRead: 0, write5m: 0, write1h: 0 });

  console.log('');
  console.log('Custo de orquestração' + (args.since ? ` (desde ${args.since})` : ' (sessão inteira)'));
  console.log('─'.repeat(62));
  console.log(`  Input não-cacheado   ${fmt(tot.input).padStart(12)} tok`);
  console.log(`  Leitura de cache     ${fmt(tot.cacheRead).padStart(12)} tok   (0,10x)`);
  console.log(`  Escrita de cache 5m  ${fmt(tot.write5m).padStart(12)} tok   (1,25x)`);
  console.log(`  Escrita de cache 1h  ${fmt(tot.write1h).padStart(12)} tok   (2,00x)`);
  console.log(`  Output               ${fmt(tot.output).padStart(12)} tok   (inclui ${fmt(tot.thinking)} de thinking)`);
  if (r.webSearches) console.log(`  Buscas web           ${fmt(r.webSearches).padStart(12)} req`);
  console.log('─'.repeat(62));

  for (const { model, c } of rows) {
    console.log(`  ${model.padEnd(20)} ${usd(c.total)}`);
  }
  if (r.webSearches) console.log(`  ${'web_search'.padEnd(20)} ${usd(webCost)}`);
  console.log(`  ${'TOTAL'.padEnd(20)} ${usd(grand)}`);
  console.log('');
  console.log(`  ${r.messages} chamadas de API · preços conferidos em ${PRICING_VERIFIED_ON}`);

  if (r.subagentDispatches > 0) {
    console.log('');
    console.log(`  ⚠️  ${r.subagentDispatches} subagent(s) despachado(s) — o consumo deles NÃO está acima.`);
    console.log('      O Claude Code não grava tokens de subagent no transcript.');
    console.log('      Em comandos que delegam, o gasto real é substancialmente maior.');
    console.log('      Para o total da sessão use o /cost nativo.');
  }
  if (unknown.length) {
    console.log('');
    console.log(`  ⚠️  modelo sem preço na tabela, excluído do total: ${unknown.join(', ')}`);
  }
  console.log('');
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('[session-cost] ' + e.message); process.exit(1); }
}

module.exports = { collect, price, PRICES, PRICING_VERIFIED_ON };
