#!/usr/bin/env node
// otel-cost — lê os contadores OpenTelemetry que o próprio Claude Code expõe e
// reporta tokens e custo, SEPARANDO orquestrador de subagent.
//
// Por que existe, se já temos session-cost.js: o transcript JSONL não registra
// consumo de subagent (verificado 2026-08-17: 435 despachos, 0 isSidechain).
// A telemetria registra — o contador claude_code.token.usage carrega o label
// `query_source` com valores main | subagent | auxiliary. Além disso o próprio
// Claude Code calcula o custo (claude_code.cost.usage), então aqui não há
// tabela de preços pra envelhecer.
//
// Pré-requisito (uma vez, exige reiniciar o Claude Code):
//   ~/.claude/settings.json → env: {
//     "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
//     "OTEL_METRICS_EXPORTER": "prometheus"
//   }
//   O exporter passa a servir http://localhost:9464/metrics
//
// Contadores são CUMULATIVOS desde o start do processo. Para medir uma janela
// (uma fase, um /flow inteiro) tire um snapshot no começo e compare no fim.
//
// Uso:
//   node scripts/otel-cost.js snapshot > /tmp/flow-start.json
//   node scripts/otel-cost.js report --since /tmp/flow-start.json
//   node scripts/otel-cost.js report                 # total desde o start
//   node scripts/otel-cost.js report --fixture f.txt # teste offline
//   node scripts/otel-cost.js report --json
//
// Zero deps.

const fs = require('fs');
const os = require('os');
const path = require('path');

const ENDPOINT = process.env.OTEL_PROM_ENDPOINT || 'http://localhost:9464/metrics';

function parseArgs(argv) {
  const a = { cmd: argv[0] || 'report', since: null, fixture: null, json: false, session: null, anySession: false };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--since') a.since = argv[++i];
    else if (argv[i] === '--fixture') a.fixture = argv[++i];
    else if (argv[i] === '--session') a.session = argv[++i];
    else if (argv[i] === '--any-session') a.anySession = true;
    else if (argv[i] === '--json') a.json = true;
  }
  return a;
}

// A porta 9464 é única por máquina: só UM processo do Claude Code consegue
// bindá-la. Com várias sessões abertas, quem chegou primeiro serve o endpoint —
// e as métricas dele são de OUTRA sessão. Ler isso como se fosse o custo desta
// é reportar um número certo sobre a coisa errada. Por isso filtramos pelo
// label session_id, e falhamos alto quando não bate.
//
// O id da sessão atual sai do nome do transcript mais recente do projeto — o
// mesmo caminho que session-cost.js usa.
function currentSessionId() {
  const dir = path.join(os.homedir(), '.claude', 'projects', process.cwd().replace(/[/.]/g, '-'));
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir)
    .filter(x => x.endsWith('.jsonl'))
    .map(x => ({ n: x, m: fs.statSync(path.join(dir, x)).mtimeMs }))
    .sort((a, b) => b.m - a.m)[0];
  return f ? f.n.replace(/\.jsonl$/, '') : null;
}

// Formato de exposição Prometheus:
//   nome{label="v",outro="w"} 123.4
// O exporter OTEL mangla `claude_code.token.usage` (unidade tokens) para algo
// como claude_code_token_usage_tokens_total. Como o sufixo exato varia por
// versão do exporter, casamos por SUBSTRING da família em vez de nome exato —
// um nome fixo quebraria silenciosamente numa atualização.
function parseProm(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const m = l.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(-?[\d.eE+]+|NaN)$/);
    if (!m) continue;
    const [, name, rawLabels, rawValue] = m;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    const labels = {};
    if (rawLabels) {
      for (const pair of rawLabels.slice(1, -1).matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g)) {
        labels[pair[1]] = pair[2].replace(/\\(.)/g, '$1');
      }
    }
    out.push({ name, labels, value });
  }
  return out;
}

function fetchMetrics(fixture) {
  if (fixture) return Promise.resolve(fs.readFileSync(fixture, 'utf8'));
  return fetch(ENDPOINT, { signal: AbortSignal.timeout(4000) })
    .then(r => {
      if (!r.ok) throw new Error(`endpoint respondeu ${r.status}`);
      return r.text();
    })
    .catch(e => {
      throw new Error(
        `não consegui ler ${ENDPOINT} (${e.message}).\n` +
        '  A telemetria está ligada em ~/.claude/settings.json mas as env vars\n' +
        '  só são lidas no start — reinicie o Claude Code. Se já reiniciou,\n' +
        '  rode `claude --debug` para ver erros do exporter.'
      );
    });
}

// Chave estável por série, para o diff entre snapshots.
const keyOf = s => s.name + '|' + Object.keys(s.labels).sort().map(k => `${k}=${s.labels[k]}`).join(',');

function aggregate(series, baseline) {
  const base = new Map((baseline || []).map(s => [keyOf(s), s.value]));
  const tokens = {}; // query_source -> type -> tokens
  const cost = {};   // query_source -> USD
  const models = new Set();
  let sawToken = false, sawCost = false;

  for (const s of series) {
    const delta = s.value - (base.get(keyOf(s)) || 0);
    if (delta <= 0) continue;

    const src = s.labels.query_source || 'unknown';
    if (s.name.includes('token_usage')) {
      sawToken = true;
      const t = s.labels.type || 'unknown';
      (tokens[src] ||= {});
      tokens[src][t] = (tokens[src][t] || 0) + delta;
      if (s.labels.model) models.add(s.labels.model);
    } else if (s.name.includes('cost_usage')) {
      sawCost = true;
      cost[src] = (cost[src] || 0) + delta;
    }
  }
  return { tokens, cost, models: [...models], sawToken, sawCost };
}

// O label é "main" | "subagent" | "auxiliary"; agrupamos auxiliary junto do
// orquestrador porque é overhead da sessão, não trabalho delegado.
const bucket = src => (src === 'subagent' ? 'subagent' : 'orquestrador');

function fmt(n) { return Math.round(n).toLocaleString('pt-BR'); }
function usd(n) { return '$' + n.toFixed(4); }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = await fetchMetrics(args.fixture);
  let series = parseProm(text);

  // Guarda de atribuição: as métricas do endpoint podem pertencer a outra
  // sessão do Claude Code (ver comentário em currentSessionId).
  const seen = [...new Set(series.map(s => s.labels.session_id).filter(Boolean))];
  let sessionId = null;
  if (!args.anySession && seen.length) {
    sessionId = args.session || currentSessionId();
    if (!sessionId) {
      throw new Error(
        'não consegui determinar o id desta sessão para filtrar as métricas.\n' +
        `  O endpoint serve: ${seen.join(', ')}\n` +
        '  Passe --session <id>, ou --any-session para aceitar o que vier.'
      );
    }
    if (!seen.includes(sessionId)) {
      throw new Error(
        'o endpoint NÃO está servindo esta sessão.\n' +
        `  Esta sessão: ${sessionId}\n` +
        `  No endpoint: ${seen.join(', ')}\n` +
        '  A porta 9464 é única por máquina — outra sessão do Claude Code a\n' +
        '  segurou primeiro. Os números dela não são os seus; reportá-los seria\n' +
        '  um custo certo sobre a sessão errada.\n' +
        '  Use a fonte transcript (session-cost.js), ou --any-session se você\n' +
        '  realmente quer o custo daquela outra sessão.'
      );
    }
    series = series.filter(s => !s.labels.session_id || s.labels.session_id === sessionId);
  }

  if (args.cmd === 'snapshot') {
    process.stdout.write(JSON.stringify(series));
    return;
  }

  let baseline = null;
  if (args.since) {
    if (!fs.existsSync(args.since)) throw new Error(`snapshot não encontrado: ${args.since}`);
    baseline = JSON.parse(fs.readFileSync(args.since, 'utf8'));
  }

  const r = aggregate(series, baseline);

  if (!r.sawToken && !r.sawCost) {
    throw new Error(
      'endpoint respondeu, mas nenhuma série de token/custo encontrada.\n' +
      '  Contadores só aparecem depois da primeira chamada de API da sessão.'
    );
  }

  const byBucket = { orquestrador: { tokens: {}, cost: 0 }, subagent: { tokens: {}, cost: 0 } };
  for (const [src, types] of Object.entries(r.tokens)) {
    const b = byBucket[bucket(src)];
    for (const [t, v] of Object.entries(types)) b.tokens[t] = (b.tokens[t] || 0) + v;
  }
  for (const [src, v] of Object.entries(r.cost)) byBucket[bucket(src)].cost += v;

  const total = byBucket.orquestrador.cost + byBucket.subagent.cost;

  if (args.json) {
    console.log(JSON.stringify({
      window: args.since ? `desde ${args.since}` : 'sessão inteira',
      session_id: sessionId || '(não filtrado)',
      subagent_tokens_included: true,
      models: r.models,
      buckets: byBucket,
      total_usd: total,
      cost_source: r.sawCost ? 'claude_code.cost.usage (calculado pelo Claude Code)' : 'indisponível',
    }, null, 2));
    return;
  }

  const TYPES = ['input', 'output', 'cacheRead', 'cacheCreation'];
  console.log('');
  console.log('Custo' + (args.since ? ' (janela medida)' : ' (sessão inteira)'));
  console.log('─'.repeat(64));
  console.log(`  ${''.padEnd(16)}${'orquestrador'.padStart(15)}${'subagent'.padStart(15)}${'total'.padStart(15)}`);
  for (const t of TYPES) {
    const o = byBucket.orquestrador.tokens[t] || 0;
    const s = byBucket.subagent.tokens[t] || 0;
    if (!o && !s) continue;
    console.log(`  ${t.padEnd(16)}${fmt(o).padStart(15)}${fmt(s).padStart(15)}${fmt(o + s).padStart(15)}`);
  }
  console.log('─'.repeat(64));
  console.log(`  ${'custo'.padEnd(16)}${usd(byBucket.orquestrador.cost).padStart(15)}${usd(byBucket.subagent.cost).padStart(15)}${usd(total).padStart(15)}`);
  console.log('');
  if (r.models.length) console.log(`  modelos: ${r.models.join(', ')}`);
  if (!r.sawCost) {
    console.log('  ⚠️  série de custo ausente — só tokens acima; use session-cost.js para preço');
  } else {
    console.log('  custo calculado pelo próprio Claude Code (não por tabela de preços local)');
  }
  console.log('');
}

if (require.main === module) {
  main().catch(e => { console.error('[otel-cost] ' + e.message); process.exit(1); });
}

module.exports = { parseProm, aggregate, bucket };
