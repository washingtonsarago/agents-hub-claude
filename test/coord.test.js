// Integration tests for `ahc coord` / `ahc worktree` — coordenação de sessões
// concorrentes no mesmo checkout.
//
// A filosofia sob teste: nada nunca bloqueia. O janitor só remove lock
// provadamente órfão (idade + nenhum processo dono + tamanho zero); a presença
// só avisa; o guard sai 0 sempre. Falso positivo aqui corrompe git ou destrói
// a confiança no mecanismo — por isso os casos "NÃO deve" importam mais que os
// "deve".
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { AHC_BIN, makeTmpRepo, rmrf } = require('./helpers');

function makeGitRepo() {
  const dir = makeTmpRepo();
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t',
    'commit', '--allow-empty', '-qm', 'init'], { cwd: dir });
  return dir;
}

function runAhcIn(dir, args, opts = {}) {
  return spawnSync('node', [AHC_BIN, ...args], {
    cwd: dir, encoding: 'utf8', timeout: 15000, ...opts,
  });
}

function setAge(p, minutesAgo) {
  const t = (Date.now() - minutesAgo * 60 * 1000) / 1000;
  fs.utimesSync(p, t, t);
}

function sessionsDir(repo) { return path.join(repo, '.git', 'ahc-sessions'); }

// Planta uma presença de outra "sessão". pid 1 (launchd/init) está sempre vivo
// — kill(1,0) devolve EPERM, que o mecanismo trata como vivo.
function plantSession(repo, pid, beatMsAgo = 0) {
  fs.mkdirSync(sessionsDir(repo), { recursive: true });
  const beat = new Date(Date.now() - beatMsAgo).toISOString();
  fs.writeFileSync(path.join(sessionsDir(repo), `${pid}.json`), JSON.stringify({
    pid, started_at: beat, last_beat: beat, branch_at_start: 'main', warned: {},
  }) + '\n');
}

// ---- janitor ---------------------------------------------------------------

test('coord: janitor remove index.lock de 0 byte com 31 minutos', () => {
  const repo = makeGitRepo();
  try {
    const lock = path.join(repo, '.git', 'index.lock');
    fs.writeFileSync(lock, '');
    setAge(lock, 31);
    const r = runAhcIn(repo, ['coord', 'janitor']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.existsSync(lock), false, 'lock órfão de 0 byte deveria sair');
    assert.match(r.stdout, /\[removed\]/);
  } finally { rmrf(repo); }
});

test('coord: janitor NÃO toca lock recém-criado', () => {
  const repo = makeGitRepo();
  try {
    const lock = path.join(repo, '.git', 'index.lock');
    fs.writeFileSync(lock, '');
    const r = runAhcIn(repo, ['coord', 'janitor']);
    assert.equal(r.status, 0);
    assert.ok(fs.existsSync(lock), 'lock fresco pode ser operação legítima em curso');
    assert.match(r.stdout, /nenhum lock suspeito/);
  } finally { rmrf(repo); }
});

test('coord: lock não-vazio com 31min vira aviso, não remoção', () => {
  const repo = makeGitRepo();
  try {
    const lock = path.join(repo, '.git', 'index.lock');
    fs.writeFileSync(lock, 'conteudo parcial do indice');
    setAge(lock, 31);
    const r = runAhcIn(repo, ['coord', 'janitor']);
    assert.equal(r.status, 0);
    assert.ok(fs.existsSync(lock), 'lock não-vazio <24h pode ser crash no meio da escrita');
    assert.match(r.stdout, /Provável lock órfão/);
    assert.match(r.stdout, /rm .*index\.lock/);
  } finally { rmrf(repo); }
});

test('coord: lock não-vazio com mais de 24h é removido', () => {
  const repo = makeGitRepo();
  try {
    const lock = path.join(repo, '.git', 'index.lock');
    fs.writeFileSync(lock, 'conteudo');
    setAge(lock, 25 * 60);
    const r = runAhcIn(repo, ['coord', 'janitor']);
    assert.equal(r.status, 0);
    assert.equal(fs.existsSync(lock), false);
  } finally { rmrf(repo); }
});

// ---- presença --------------------------------------------------------------

test('coord: register cria presença e avisa sobre outra sessão viva', () => {
  const repo = makeGitRepo();
  try {
    plantSession(repo, 1);
    const r = runAhcIn(repo, ['coord', 'register']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /outra sessão Claude Code ativa/);
    assert.match(r.stdout, /ahc worktree/);
    const files = fs.readdirSync(sessionsDir(repo)).filter(f => f.endsWith('.json'));
    assert.equal(files.length, 2, 'presença própria + a plantada');
  } finally { rmrf(repo); }
});

test('coord: register em checkout solitário fica em silêncio', () => {
  const repo = makeGitRepo();
  try {
    const r = runAhcIn(repo, ['coord', 'register']);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', 'zero fricção pra quem tem uma sessão só');
  } finally { rmrf(repo); }
});

test('coord: sessão morta é coletada pelo próximo register', () => {
  const repo = makeGitRepo();
  try {
    plantSession(repo, 99999999); // PID inexistente
    runAhcIn(repo, ['coord', 'register']);
    const pids = fs.readdirSync(sessionsDir(repo)).filter(f => f.endsWith('.json'));
    assert.ok(!pids.includes('99999999.json'), 'zumbi deveria ter sido coletado');
  } finally { rmrf(repo); }
});

test('coord: heartbeat velho demais conta como morto mesmo com PID vivo', () => {
  const repo = makeGitRepo();
  try {
    plantSession(repo, 1, 13 * 60 * 60 * 1000); // pid vivo, beat de 13h
    const r = runAhcIn(repo, ['coord', 'register']);
    assert.doesNotMatch(r.stdout, /outra sessão/, 'beat >12h = reuso de PID plausível; não avisa');
  } finally { rmrf(repo); }
});

// ---- guard -----------------------------------------------------------------

function guard(repo, command) {
  return runAhcIn(repo, ['coord', 'guard'], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
  });
}

test('coord: guard avisa em git de escrita com outra sessão viva', () => {
  const repo = makeGitRepo();
  try {
    plantSession(repo, 1);
    const r = guard(repo, 'git commit -m "x"');
    assert.equal(r.status, 0, 'guard NUNCA bloqueia — sempre exit 0');
    assert.match(r.stdout, /outra sessão Claude Code ativa/);
  } finally { rmrf(repo); }
});

test('coord: guard fica mudo em git de leitura', () => {
  const repo = makeGitRepo();
  try {
    plantSession(repo, 1);
    for (const cmd of ['git status', 'git log --oneline -5', 'git diff', 'ls -la']) {
      const r = guard(repo, cmd);
      assert.equal(r.status, 0);
      assert.equal(r.stdout.trim(), '', `"${cmd}" é leitura — interferir seria ruído`);
    }
  } finally { rmrf(repo); }
});

test('coord: guard destaca comandos que mudam o working tree alheio', () => {
  const repo = makeGitRepo();
  try {
    plantSession(repo, 1);
    const r = guard(repo, 'git checkout main');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /muda o working tree/);
  } finally { rmrf(repo); }
});

test('coord: guard deduplica — segundo aviso da mesma classe em 15min é suprimido', () => {
  const repo = makeGitRepo();
  try {
    plantSession(repo, 1);
    const r1 = guard(repo, 'git commit -m "a"');
    assert.match(r1.stdout, /outra sessão/);
    const r2 = guard(repo, 'git add .');
    assert.equal(r2.stdout.trim(), '', 'aviso repetido treina o leitor a ignorar');
  } finally { rmrf(repo); }
});

test('coord: guard sem outra sessão é invisível', () => {
  const repo = makeGitRepo();
  try {
    const r = guard(repo, 'git commit -m "x"');
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '');
  } finally { rmrf(repo); }
});

// ---- kill switch -----------------------------------------------------------

test('coord: off silencia tudo e on religa', () => {
  const repo = makeGitRepo();
  try {
    plantSession(repo, 1);
    runAhcIn(repo, ['coord', 'off']);
    const r = runAhcIn(repo, ['coord', 'register']);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', 'kill switch tem que calar o mecanismo inteiro');
    const st = runAhcIn(repo, ['coord', 'status']);
    assert.match(st.stdout, /OFF/);
    runAhcIn(repo, ['coord', 'on']);
    const r2 = runAhcIn(repo, ['coord', 'register']);
    assert.match(r2.stdout, /outra sessão/);
  } finally { rmrf(repo); }
});

test('coord: variável AHC_COORD=off também desliga', () => {
  const repo = makeGitRepo();
  try {
    plantSession(repo, 1);
    const r = runAhcIn(repo, ['coord', 'register'], {
      env: { ...process.env, AHC_COORD: 'off' },
    });
    assert.equal(r.stdout.trim(), '');
  } finally { rmrf(repo); }
});

// ---- worktree --------------------------------------------------------------

test('worktree: cria worktree com branch nova e copia ambiente', () => {
  const repo = makeGitRepo();
  try {
    fs.writeFileSync(path.join(repo, '.env'), 'X=1\n');
    const r = runAhcIn(repo, ['worktree', 'feat-x']);
    assert.equal(r.status, 0, r.stderr);
    const target = path.join(path.dirname(repo), `${path.basename(repo)}.wt`, 'feat-x');
    assert.ok(fs.existsSync(target), 'worktree deveria existir');
    const head = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: target, encoding: 'utf8' }).stdout.trim();
    assert.equal(head, 'feat-x');
    assert.ok(fs.existsSync(path.join(target, '.env')), '.env acompanha a worktree');
    assert.match(r.stdout, /cd .*feat-x && claude/);
    rmrf(path.dirname(target));
  } finally { rmrf(repo); }
});

test('worktree: sessões em worktrees distintas não se veem', () => {
  const repo = makeGitRepo();
  try {
    plantSession(repo, 1); // sessão viva no checkout principal
    runAhcIn(repo, ['worktree', 'feat-y']);
    const target = path.join(path.dirname(repo), `${path.basename(repo)}.wt`, 'feat-y');
    // registrar na worktree não deve ver a sessão do checkout principal
    const r = runAhcIn(target, ['coord', 'register']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), '',
      'presença é por gitdir de worktree — migrar compra silêncio');
    rmrf(path.dirname(target));
  } finally { rmrf(repo); }
});
