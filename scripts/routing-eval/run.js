#!/usr/bin/env node
'use strict';
// run — eval de roteamento dos agents do hub: para cada caso do evalset,
// pergunta ao `claude -p` qual subagent ele escolhe, com só os agents de
// agents/ desta árvore disponíveis.
//
//   node scripts/routing-eval/run.js --rounds 2 --model opus --min 71 \
//     [--conc 4] [--out <dir>] [--cases <evalset.json>] [--timeout-ms 150000]
//
// Custo real e resultado não determinístico: NUNCA roda na CI. Quem adiciona
// ou muda um agent roda 2 rodadas antes do PR e cola a saída no PR. A parte
// determinística (invariantes do evalset, argv, guard, agregação) é testada
// em test/routing-eval.test.js sem chamar o modelo.
//
// Exit: 0 ok · 1 erro sistemático ou rodada abaixo de --min · 2 uso inválido,
// evalset inválido ou ENV_UNSAFE · 3 `claude` ausente no PATH.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildAgents } = require('./lib/agents');
const { validateEvalset } = require('./lib/evalset');
const { summarize, serializeRound, formatReport } = require('./lib/report');
const { route } = require('./lib/route');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_CASES = path.join(__dirname, 'evalset.json');

function usage(msg) {
  if (msg) process.stderr.write(`[routing-eval] ${msg}\n`);
  process.stderr.write('uso: node scripts/routing-eval/run.js [--rounds 2] [--model opus] [--min 0] [--conc 4] [--out <dir>] [--cases <evalset.json>] [--timeout-ms 150000]\n');
  return 2;
}

function parseArgs(argv) {
  const o = { rounds: 2, model: 'opus', min: 0, conc: 4, out: null, cases: DEFAULT_CASES, timeoutMs: 150000 };
  const ints = { '--rounds': 'rounds', '--min': 'min', '--conc': 'conc', '--timeout-ms': 'timeoutMs' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (ints[a]) {
      if (!/^\d+$/.test(v || '')) throw new Error(`${a} needs a non-negative integer`);
      o[ints[a]] = Number(v); i++;
    } else if (a === '--model' || a === '--out' || a === '--cases') {
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a value`);
      o[a.slice(2)] = v; i++;
    } else throw new Error(`unknown argument ${a}`);
  }
  if (o.rounds < 1) throw new Error('--rounds must be >= 1');
  if (o.conc < 1) throw new Error('--conc must be >= 1');
  return o;
}

async function runRound(cases, opts, agentsJson, n) {
  const res = [];
  let i = 0;
  await Promise.all(Array.from({ length: opts.conc }, async () => {
    while (i < cases.length) {
      const c = cases[i++];
      const r = await route({ prompt: c.prompt, model: opts.model, agentsJson, timeoutMs: opts.timeoutMs });
      const row = { id: c.id, kind: c.kind, expect: c.expect, prompt: c.prompt, got: r.got, cost: r.cost, ok: c.expect.includes(r.got) };
      res.push(row);
      process.stderr.write(`r${n} ${row.ok ? '✓' : '✗'} ${row.id} -> ${row.got}${r.reason ? ` (${r.reason})` : ''}\n`);
    }
  }));
  const order = new Map(cases.map((c, k) => [c.id, k]));
  return res.sort((a, b) => order.get(a.id) - order.get(b.id));
}

async function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { return usage(e.message); }

  let cases;
  try { cases = JSON.parse(fs.readFileSync(opts.cases, 'utf8')); } catch (e) { return usage(`evalset not readable: ${e.message}`); }
  const agents = buildAgents(path.join(REPO_ROOT, 'agents'));
  // Recorte por --cases (ex.: medir só os IDs da BASE) não precisa cobrir
  // todos os agents; o evalset padrão precisa.
  const errors = validateEvalset(cases, Object.keys(agents), { requireCoverage: path.resolve(opts.cases) === DEFAULT_CASES });
  if (errors.length) { process.stderr.write(`[routing-eval] evalset inválido:\n  - ${errors.join('\n  - ')}\n`); return 2; }

  const probe = spawnSync('claude', ['--version'], { stdio: 'ignore' });
  if (probe.error) { process.stderr.write('[routing-eval] `claude` não encontrado no PATH\n'); return 3; }

  const out = opts.out ? path.resolve(opts.out) : fs.mkdtempSync(path.join(os.tmpdir(), 'routing-eval-out-'));
  fs.mkdirSync(out, { recursive: true });
  const agentsJson = JSON.stringify(agents);
  const rounds = [];
  const files = [];
  for (let n = 1; n <= opts.rounds; n++) {
    const res = await runRound(cases, opts, agentsJson, n);
    rounds.push(res);
    const f = path.join(out, `round-${n}-${opts.model}.json`);
    fs.writeFileSync(f, serializeRound(res));
    files.push(f);
    // ENV_UNSAFE invalida a execução inteira: não gastar outra rodada.
    if (res.some(r => r.got === 'ENV_UNSAFE')) break;
  }
  const summary = summarize(rounds, { min: opts.min });
  process.stdout.write(`modelo ${opts.model} · ${cases.length} casos · ${rounds.length} rodada(s)\n`);
  process.stdout.write(formatReport(summary, files));
  return summary.exitCode;
}

main(process.argv.slice(2)).then(code => process.exit(code), e => {
  process.stderr.write(`[routing-eval] ${e.stack || e.message}\n`);
  process.exit(2);
});
