// Integration tests for orphan pruning in `ahc sync`.
//
// Um item retirado do manifest precisa sair da máquina. Enquanto o sync não
// removia nada, um command removido do hub continuava instalado em todo mundo
// que já o tinha — e command não é inerte: o /goal, retirado justamente por
// sombrear o slash command nativo de mesmo nome, seguiu sombreando por um mês
// depois de ter sido revertido no repo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  FIXTURE_REMOTE,
  makeTmpHome,
  writeConfig,
  readLock,
  writeLock,
  runAhc,
  rmrf,
} = require('./helpers');

const REMOTE_URL = `file://${FIXTURE_REMOTE}`;

function freshHome() {
  const home = makeTmpHome();
  writeConfig(home, { repo: REMOTE_URL, branch: 'n/a', channel: 'stable' });
  return home;
}

// Instala um item que o manifest remoto não conhece, como se tivesse vindo de
// uma versão anterior do hub.
function plantOrphanCommand(home, name = 'goal') {
  const dir = path.join(home, '.claude', 'commands');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${name}.md`);
  fs.writeFileSync(p, '# orphan\n');
  const lock = readLock(home) || { agents: {}, commands: {}, skills: {}, pins: {} };
  lock.commands = lock.commands || {};
  lock.commands[name] = { version: '1.0.0', sha256: 'deadbeef', path: p };
  writeLock(home, lock);
  return p;
}

function plantOrphanSkill(home, name = 'ghost-skill') {
  const root = path.join(home, '.claude', 'skills', name);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'SKILL.md'), '# ghost\n');
  const lock = readLock(home) || { agents: {}, commands: {}, skills: {}, pins: {} };
  lock.skills = lock.skills || {};
  lock.skills[name] = { version: '1.0.0', files: { 'SKILL.md': 'deadbeef' } };
  writeLock(home, lock);
  return root;
}

// Agent retirado do manifest. O rename de um agent (ex.: o reviewer do
// /flow-lite) deixa agent e skill de mesmo nome órfãos ao mesmo tempo; sem
// esta poda, os dois reviewers ficariam no roster disputando o mesmo pedido.
function plantOrphanAgent(home, name = 'ghost-agent') {
  const dir = path.join(home, '.claude', 'agents');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${name}.md`);
  fs.writeFileSync(p, '# orphan agent\n');
  const lock = readLock(home) || { agents: {}, commands: {}, skills: {}, pins: {} };
  lock.agents = lock.agents || {};
  lock.agents[name] = { version: '1.0.0', sha256: 'deadbeef', path: p };
  writeLock(home, lock);
  return p;
}

test('prune: command que saiu do manifest é removido do disco e do lock', () => {
  const home = freshHome();
  try {
    runAhc(home, ['sync']);
    const orphan = plantOrphanCommand(home);
    assert.ok(fs.existsSync(orphan), 'precondição: órfão instalado');

    const r = runAhc(home, ['sync']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.existsSync(orphan), false, 'arquivo órfão deveria ter sido apagado');
    assert.equal(readLock(home).commands.goal, undefined, 'entrada órfã deveria sair do lock');
    assert.match(r.stdout, /\[removed\] command goal/);
    assert.match(r.stdout, /removed:1/);
  } finally { rmrf(home); }
});

test('prune: skill que saiu do manifest tem o diretório removido', () => {
  const home = freshHome();
  try {
    runAhc(home, ['sync']);
    const root = plantOrphanSkill(home);

    const r = runAhc(home, ['sync']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.existsSync(root), false, 'diretório da skill órfã deveria sumir');
    assert.equal(readLock(home).skills['ghost-skill'], undefined);
    assert.match(r.stdout, /\[removed\] skill ghost-skill/);
  } finally { rmrf(home); }
});

test('prune: agent e skill de mesmo nome que saíram do manifest são removidos juntos', () => {
  const home = freshHome();
  try {
    runAhc(home, ['sync']);
    const agent = plantOrphanAgent(home);
    const skill = plantOrphanSkill(home, 'ghost-agent');
    assert.ok(fs.existsSync(agent), 'precondição: agent órfão instalado');

    const r = runAhc(home, ['sync']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.existsSync(agent), false, 'arquivo do agent órfão deveria ter sido apagado');
    assert.equal(fs.existsSync(skill), false, 'diretório da skill órfã deveria sumir');
    const lock = readLock(home);
    assert.equal(lock.agents['ghost-agent'], undefined, 'agent órfão deveria sair do lock');
    assert.equal(lock.skills['ghost-agent'], undefined, 'skill órfã deveria sair do lock');
    assert.match(r.stdout, /\[removed\] agent ghost-agent/);
    assert.match(r.stdout, /\[removed\] skill ghost-agent/);
    // O que continua no manifest segue instalado: a poda não leva o vizinho.
    assert.ok(lock.agents['test-agent'], 'agent do manifest deveria continuar no lock');
    assert.ok(fs.existsSync(path.join(home, '.claude', 'agents', 'test-agent.md')));
  } finally { rmrf(home); }
});

test('prune: agent pinado sobrevive mesmo saindo do manifest', () => {
  const home = freshHome();
  try {
    runAhc(home, ['sync']);
    const agent = plantOrphanAgent(home);
    const skill = plantOrphanSkill(home, 'ghost-agent');
    const lock = readLock(home);
    lock.pins = { 'ghost-agent': '1.0.0' };
    writeLock(home, lock);

    const r = runAhc(home, ['sync']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(agent), 'pin é decisão explícita do dev; o sync não a desfaz');
    assert.ok(fs.existsSync(skill), 'o pin vale pelo nome, então a skill homônima também fica');
    assert.ok(readLock(home).agents['ghost-agent'], 'entrada do lock deveria permanecer');
    assert.match(r.stdout, /\[pinned\]\s+agent ghost-agent/);
    assert.doesNotMatch(r.stdout, /\[removed\] agent ghost-agent/);
  } finally { rmrf(home); }
});

test('prune: item pinado sobrevive mesmo saindo do manifest', () => {
  const home = freshHome();
  try {
    runAhc(home, ['sync']);
    const orphan = plantOrphanCommand(home);
    const lock = readLock(home);
    lock.pins = { goal: '1.0.0' };
    writeLock(home, lock);

    const r = runAhc(home, ['sync']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(orphan), 'pin é decisão explícita do dev; o sync não a desfaz');
    assert.ok(readLock(home).commands.goal, 'entrada do lock deveria permanecer');
    assert.match(r.stdout, /está pinado — mantido/);
  } finally { rmrf(home); }
});

test('prune: arquivo que o ahc não instalou não é tocado', () => {
  const home = freshHome();
  try {
    runAhc(home, ['sync']);
    // Escrito à mão pelo dev: nunca entrou no lock.
    const mine = path.join(home, '.claude', 'commands', 'meu-comando.md');
    fs.writeFileSync(mine, '# local\n');

    const r = runAhc(home, ['sync']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(mine), 'o sync só pode apagar o que ele mesmo instalou');
    assert.match(r.stdout, /removed:0/);
  } finally { rmrf(home); }
});

test('prune: sync sem órfãos não remove nada', () => {
  const home = freshHome();
  try {
    runAhc(home, ['sync']);
    const r = runAhc(home, ['sync']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /removed:0/);
    assert.doesNotMatch(r.stdout, /\[removed\]/);
  } finally { rmrf(home); }
});

test('prune: entrada órfã no lock sem arquivo em disco é limpa mesmo assim', () => {
  const home = freshHome();
  try {
    runAhc(home, ['sync']);
    const orphan = plantOrphanCommand(home);
    fs.rmSync(orphan);

    const r = runAhc(home, ['sync']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readLock(home).commands.goal, undefined, 'lock não pode ficar com fantasma');
    assert.match(r.stdout, /removed:1/);
  } finally { rmrf(home); }
});
