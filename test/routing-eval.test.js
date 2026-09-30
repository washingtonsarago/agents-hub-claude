// Parte determinística do eval de roteamento (scripts/routing-eval/).
//
// O que roda aqui: leitura do evalset e de agents/ com fs, e as funções puras
// de lib/evalset.js, lib/args.js, lib/guard.js, lib/agents.js e
// lib/report.js. O que NUNCA roda aqui: o modelo. Este arquivo não importa o
// módulo que abre processo nem o run.js; a chamada ao `claude` tem custo
// real, não é determinística e fica fora da CI. Por isso este arquivo também
// não cita, nem em comentário, as palavras que o grep do AC-11 procura.
//
// A guarda que importa para o hub: todo agent de agents/ precisa de casos
// `clear` e `boundary` no evalset. Um agent novo sem casos deixa a CI
// vermelha até alguém medir se ele colide com os existentes.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const EVAL = path.join(REPO_ROOT, 'scripts', 'routing-eval');
const { validateEvalset, KINDS, GAP_AGENTS } = require(path.join(EVAL, 'lib', 'evalset.js'));
const { buildArgs, FORBIDDEN_FLAGS } = require(path.join(EVAL, 'lib', 'args.js'));
const { checkInit, routeFrom, costFrom } = require(path.join(EVAL, 'lib', 'guard.js'));
const { buildAgents, PROMPT_STUB } = require(path.join(EVAL, 'lib', 'agents.js'));
const { summarize, serializeRound, formatReport } = require(path.join(EVAL, 'lib', 'report.js'));

function agentNames() {
  return fs.readdirSync(path.join(REPO_ROOT, 'agents')).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, '')).sort();
}
function evalset() { return JSON.parse(fs.readFileSync(path.join(EVAL, 'evalset.json'), 'utf8')); }

// ---- o evalset versionado ------------------------------------------------------

test('routing-eval: the versioned evalset satisfies every invariant against agents/', () => {
  const errors = validateEvalset(evalset(), agentNames());
  assert.deepEqual(errors, [], errors.join('\n'));
});

test('routing-eval: every agent in agents/ has at least one clear and one boundary case', () => {
  const cases = evalset();
  for (const name of agentNames()) {
    for (const kind of ['clear', 'boundary']) {
      assert.ok(cases.some(c => c.kind === kind && c.expect.includes(name)), `agent "${name}" has no "${kind}" case in scripts/routing-eval/evalset.json`);
    }
  }
});

test('routing-eval: the evalset keeps the 73 reference cases, ids unique, kinds in the closed set', () => {
  const cases = evalset();
  assert.ok(cases.length >= 73, `evalset shrank to ${cases.length}`);
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length);
  for (const c of cases) assert.ok(KINDS.includes(c.kind), `${c.id}: ${c.kind}`);
  assert.deepEqual([...KINDS].sort(), ['boundary', 'clear', 'gap', 'nostack', 'overlap']);
  assert.deepEqual([...GAP_AGENTS].sort(), ['claude', 'general-purpose']);
});

// ---- validateEvalset rejeita cada violação ---------------------------------------

const AGENTS = ['alpha-agent', 'beta-agent'];
const good = () => [
  { id: 'a-1', kind: 'clear', expect: ['alpha-agent'], prompt: 'p' },
  { id: 'a-2', kind: 'boundary', expect: ['alpha-agent'], prompt: 'p' },
  { id: 'b-1', kind: 'clear', expect: ['beta-agent'], prompt: 'p' },
  { id: 'b-2', kind: 'boundary', expect: ['beta-agent'], prompt: 'p' },
  { id: 'g-1', kind: 'gap', expect: ['general-purpose', 'claude'], prompt: 'p' },
];

test('validateEvalset: accepts a well-formed synthetic set', () => {
  assert.deepEqual(validateEvalset(good(), AGENTS), []);
});

test('validateEvalset: an agent added to agents/ without cases fails', () => {
  const errors = validateEvalset(good(), [...AGENTS, 'new-agent']);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /agent "new-agent": no "clear" case/);
  assert.match(errors[1], /agent "new-agent": no "boundary" case/);
});

test('validateEvalset: rejects duplicate id, unknown kind, empty expect, unknown agent and a missing boundary', () => {
  const cases = good();
  cases.push({ ...cases[0] });
  assert.match(validateEvalset(cases, AGENTS).join('\n'), /case "a-1": duplicate id/);
  assert.match(validateEvalset([...good(), { id: 'x', kind: 'hard', expect: ['alpha-agent'], prompt: 'p' }], AGENTS).join('\n'), /kind must be one of/);
  assert.match(validateEvalset([...good(), { id: 'x', kind: 'gap', expect: [], prompt: 'p' }], AGENTS).join('\n'), /expect must be a non-empty array/);
  assert.match(validateEvalset([...good(), { id: 'x', kind: 'gap', expect: ['ghost-agent'], prompt: 'p' }], AGENTS).join('\n'), /expect "ghost-agent" is neither an agent/);
  assert.match(validateEvalset(good().filter(c => c.id !== 'b-2'), AGENTS).join('\n'), /agent "beta-agent": no "boundary" case/);
  assert.match(validateEvalset([...good(), { id: '', kind: 'gap', expect: ['claude'], prompt: 'p' }], AGENTS).join('\n'), /id must be a non-empty string/);
  assert.deepEqual(validateEvalset('nope', AGENTS), ['evalset must be a JSON array']);
});

test('validateEvalset: NONE (the model did not delegate) is accepted only in nostack cases', () => {
  assert.deepEqual(validateEvalset([...good(), { id: 'n-1', kind: 'nostack', expect: ['general-purpose', 'NONE'], prompt: 'p' }], AGENTS), []);
  for (const kind of ['gap', 'clear', 'boundary', 'overlap']) {
    const errors = validateEvalset([...good(), { id: 'n-1', kind, expect: ['NONE'], prompt: 'p' }], AGENTS);
    assert.equal(errors.length, 1, `${kind}: ${errors.join('\n')}`);
    assert.match(errors[0], new RegExp(`case "n-1": expect "NONE" is only allowed in kind nostack \\(got "${kind}"\\)`));
  }
});

test('validateEvalset: coverage can be relaxed for a cut-down --cases set, structure cannot', () => {
  const cut = good().slice(0, 1);
  assert.deepEqual(validateEvalset(cut, AGENTS, { requireCoverage: false }), []);
  assert.ok(validateEvalset([{ id: 'x', kind: 'nope', expect: ['alpha-agent'], prompt: 'p' }], AGENTS, { requireCoverage: false }).length);
});

// ---- argv fechado (C9) -----------------------------------------------------------

test('C9: buildArgs always restricts tools, settings, MCP and session persistence', () => {
  const argv = buildArgs({ prompt: 'faça o deploy no ECS', model: 'opus', agentsJson: '{"a":{"description":"d","prompt":"p"}}' });
  const at = f => argv.indexOf(f);
  assert.equal(argv[at('--tools') + 1], 'Agent');
  assert.ok(at('--setting-sources') >= 0);
  assert.strictEqual(argv[at('--setting-sources') + 1], '', '--setting-sources is followed by an empty string as its own element');
  assert.ok(argv.includes('--strict-mcp-config'));
  assert.ok(argv.includes('--no-session-persistence'));
  assert.equal(argv[at('--model') + 1], 'opus');
  assert.equal(argv[0], '-p');
  assert.match(argv[1], /sem executá-la você mesmo/);
  assert.match(argv[1], /faça o deploy no ECS/);
  for (const f of ['--mcp-config', '--settings', '--add-dir', '--allowedTools', '--dangerously-skip-permissions', '--permission-mode']) {
    assert.ok(!argv.includes(f), `${f} must never be passed`);
    assert.ok(FORBIDDEN_FLAGS.includes(f));
  }
  assert.ok(!argv.some(a => /bypassPermissions/.test(a)));
});

test('C9: buildArgs refuses to build without prompt, model or agents', () => {
  assert.throws(() => buildArgs({ model: 'opus', agentsJson: '{}' }), TypeError);
  assert.throws(() => buildArgs({ prompt: 'p', agentsJson: '{}' }), TypeError);
  assert.throws(() => buildArgs({ prompt: 'p', model: 'opus' }), TypeError);
});

// ---- guarda do ambiente efetivo (C10) -------------------------------------------

test('C10: checkInit accepts only Agent/Task and no MCP servers', () => {
  const init = extra => ({ type: 'system', subtype: 'init', tools: ['Agent'], mcp_servers: [], ...extra });
  assert.deepEqual(checkInit(init()), { ok: true, reason: null });
  assert.equal(checkInit(init({ tools: ['Task'] })).ok, true);
  assert.equal(checkInit(init({ mcp_servers: undefined })).ok, true);
  assert.match(checkInit(init({ tools: ['Agent', 'Bash'] })).reason, /unexpected tools: Bash/);
  assert.match(checkInit(init({ tools: ['Agent', 'Read', 'Write'] })).reason, /Read, Write/);
  assert.match(checkInit(init({ mcp_servers: [{ name: 'github', status: 'connected' }] })).reason, /MCP servers present/);
  assert.equal(checkInit(init({ tools: undefined })).ok, false, 'no tools list is not proof of no tools');
  assert.equal(checkInit({ type: 'assistant' }).ok, false);
});

test('C10: routeFrom reads the first Agent/Task tool_use; costFrom reports only a measured cost', () => {
  const ev = content => ({ type: 'assistant', message: { content } });
  assert.equal(routeFrom(ev([{ type: 'text', text: 'x' }, { type: 'tool_use', name: 'Agent', input: { subagent_type: 'postgres-dba' } }])), 'postgres-dba');
  assert.equal(routeFrom(ev([{ type: 'tool_use', name: 'Task', input: {} }])), 'general-purpose');
  assert.equal(routeFrom(ev([{ type: 'tool_use', name: 'Bash', input: { command: 'rm -rf /' } }])), null);
  assert.equal(routeFrom({ type: 'result' }), null);
  assert.equal(costFrom({ type: 'result', total_cost_usd: 0.0123 }), 0.0123);
  assert.equal(costFrom({ type: 'result' }), null);
  assert.equal(costFrom({ type: 'assistant', total_cost_usd: 1 }), null);
});

// ---- agents montados só com description + stub (C11) -----------------------------

test('C11: buildAgents keeps exactly description and a stub prompt, whatever the frontmatter carries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'routing-eval-agents-'));
  try {
    fs.writeFileSync(path.join(dir, 'risky-agent.md'), [
      '---',
      'name: risky-agent',
      'description: "Use for X. Examples:\\n\\n- user: \\"faça X\\" → launch risky-agent."',
      'model: opus',
      'tools: Bash, Write',
      'permissionMode: bypassPermissions',
      'mcpServers: github',
      'hooks: {"PreToolUse": []}',
      '---',
      '',
      '# Body that must not travel',
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'plain-agent.md'), '---\nname: plain-agent\ndescription: Plain one.\nmodel: sonnet\n---\nbody\n');
    const agents = buildAgents(dir);
    assert.deepEqual(Object.keys(agents).sort(), ['plain-agent', 'risky-agent']);
    for (const a of Object.values(agents)) assert.deepEqual(Object.keys(a).sort(), ['description', 'prompt']);
    assert.equal(agents['risky-agent'].description, 'Use for X. Examples:\n\n- user: "faça X" → launch risky-agent.');
    assert.equal(agents['risky-agent'].prompt, PROMPT_STUB);
    assert.equal(agents['plain-agent'].description, 'Plain one.');
    assert.doesNotMatch(JSON.stringify(agents), /Bash|bypassPermissions|github|PreToolUse|Body that must not travel/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('C11: buildAgents over the real agents/ yields one entry per file', () => {
  const agents = buildAgents(path.join(REPO_ROOT, 'agents'));
  assert.deepEqual(Object.keys(agents).sort(), agentNames());
  for (const a of Object.values(agents)) assert.ok(a.description.length > 0);
});

// ---- agregação e saída (C12 e AC-10) ---------------------------------------------

const row = (id, kind, ok, extra = {}) => ({ id, kind, expect: ['x'], prompt: 'p', got: ok ? 'x' : 'y', ok, cost: null, ...extra });

test('summarize: a case wrong in every round is systematic and exits 1', () => {
  const r1 = [row('a', 'clear', true), row('b', 'overlap', false), row('c', 'gap', false)];
  const r2 = [row('a', 'clear', true), row('b', 'overlap', false), row('c', 'gap', true)];
  const s = summarize([r1, r2], { min: 1 });
  assert.deepEqual(s.systematic, ['b'], 'c erred once: noise, not systematic');
  assert.equal(s.exitCode, 1);
  assert.deepEqual(s.perRound[0].byKind, { clear: { ok: 1, total: 1 }, gap: { ok: 0, total: 1 }, overlap: { ok: 0, total: 1 } });
  assert.equal(s.perRound[1].correct, 2);
});

test('summarize: below --min in any round exits 1; all good exits 0', () => {
  const good = [row('a', 'clear', true), row('b', 'boundary', true)];
  const one = [row('a', 'clear', true), row('b', 'boundary', false)];
  assert.equal(summarize([good, one], { min: 2 }).exitCode, 1);
  assert.equal(summarize([good, one], { min: 2 }).belowMin, true);
  assert.equal(summarize([good, good], { min: 2 }).exitCode, 0);
  assert.equal(summarize([good, one], { min: 1 }).exitCode, 0);
});

test('summarize: ENV_UNSAFE exits 2; TIMEOUT and ERR are listed apart and count as errors', () => {
  const r = [row('a', 'clear', false, { got: 'ENV_UNSAFE' }), row('b', 'clear', false, { got: 'TIMEOUT' })];
  const s = summarize([r], {});
  assert.equal(s.exitCode, 2);
  assert.deepEqual(s.failures.map(f => f.got), ['ENV_UNSAFE', 'TIMEOUT']);
  const t = summarize([[row('a', 'clear', false, { got: 'ERR' })]], {});
  assert.equal(t.exitCode, 1, 'an ERR in the only round is a systematic miss');
  assert.match(formatReport(t), /falhas de execução: r1:a=ERR/);
});

test('summarize: cost is reported only when every call measured it, never estimated', () => {
  const measured = [row('a', 'clear', true, { cost: 0.5 }), row('b', 'clear', true, { cost: 0.25 })];
  const partial = [row('a', 'clear', true, { cost: 0.5 }), row('b', 'clear', true)];
  assert.deepEqual(summarize([measured]).cost, { measured: true, usd: 0.75 });
  assert.deepEqual(summarize([partial]).cost, { measured: false, missing: 1, calls: 2 });
  assert.match(formatReport(summarize([partial])), /custo: não medido \(1 de 2 chamadas sem custo no stream\)/);
  assert.match(formatReport(summarize([measured])), /custo: US\$ 0\.7500 \(medido no stream\)/);
});

test('formatReport: prints per-round totals by kind, the systematic list and the output paths', () => {
  const r = [row('a', 'clear', true), row('b', 'overlap', false)];
  const txt = formatReport(summarize([r, r], { min: 0 }), ['/tmp/round-1.json', '/tmp/round-2.json']);
  assert.match(txt, /rodada 1: 1\/2 {2}\(clear 1\/1 · overlap 0\/1\)/);
  assert.match(txt, /erros sistemáticos \(errados em todas as rodadas\): b/);
  assert.match(txt, /saída: \/tmp\/round-2\.json/);
  assert.match(txt, /exit 1/);
});

test('C12: the round JSON carries only the allowlisted fields', () => {
  const raw = [{ ...row('a', 'clear', true), reason: 'x', stream: '{"type":"system","cwd":"/Users/me"}', stderr: 'token=abc', session_id: 's' }];
  const out = JSON.parse(serializeRound(raw));
  assert.deepEqual(Object.keys(out[0]).sort(), ['cost', 'expect', 'got', 'id', 'kind', 'ok', 'prompt']);
  assert.doesNotMatch(serializeRound(raw), /stream|stderr|token=abc|session_id|\/Users\/me/);
});
