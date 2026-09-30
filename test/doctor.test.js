// Integration tests for `ahc doctor`. Spawns the CLI against a tmp HOME
// pointing at the file:// fixture remote (so the git-auth and CLI-version
// checks short-circuit to "skipped (local fixture)" rather than hitting the
// network). Each test isolates one check by making the rest pass.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  FIXTURE_REMOTE,
  makeTmpHome,
  writeConfig,
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

function writeSettings(home, obj) {
  fs.writeFileSync(
    path.join(home, '.claude', 'settings.json'),
    JSON.stringify(obj, null, 2)
  );
}

function validHookSettings() {
  return {
    hooks: {
      SessionStart: [
        { matcher: '*', hooks: [{ type: 'command', command: '/usr/local/bin/ahc sync --quiet' }] },
      ],
    },
  };
}

function validLock() {
  return {
    agents: { 'test-agent': { version: '1.0.0', sha256: 'abc', path: '/tmp/test-agent.md' } },
    commands: {},
    skills: {},
    pins: {},
  };
}

// ---- tests -----------------------------------------------------------------

test('doctor: clean env returns exit 0 with all checks ok or warn', () => {
  const home = freshHome();
  try {
    writeSettings(home, validHookSettings());
    writeLock(home, validLock());

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 0, `expected 0, got ${r.status}: ${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /ahc doctor/);
    assert.match(r.stdout, /SessionStart hook configured/);
    assert.match(r.stdout, /lock file valid/);
    assert.match(r.stdout, /git auth.*local fixture/);
  } finally { rmrf(home); }
});

test('doctor: missing settings.json → warn, still exit 0', () => {
  const home = freshHome();
  try {
    writeLock(home, validLock());
    // No settings.json written.

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 0, `expected warn-only, got status ${r.status}`);
    assert.match(r.stdout, /⚠ SessionStart hook/);
    assert.match(r.stdout, /settings\.json missing/);
  } finally { rmrf(home); }
});

test('doctor: malformed settings.json → fail, exit 1', () => {
  const home = freshHome();
  try {
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{ broken json');
    writeLock(home, validLock());

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /✗ SessionStart hook/);
    assert.match(r.stdout, /not valid JSON/);
  } finally { rmrf(home); }
});

test('doctor: settings.json without ahc sync hook → fail, exit 1', () => {
  const home = freshHome();
  try {
    writeSettings(home, { hooks: { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo hi' }] }] } });
    writeLock(home, validLock());

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /no `ahc sync` hook found/);
  } finally { rmrf(home); }
});

test('doctor: missing lock → warn, still exit 0', () => {
  const home = freshHome();
  try {
    writeSettings(home, validHookSettings());
    // No lock file.

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /⚠ lock file/);
    assert.match(r.stdout, /not present yet/);
  } finally { rmrf(home); }
});

test('doctor: malformed lock → fail, exit 1', () => {
  const home = freshHome();
  try {
    writeSettings(home, validHookSettings());
    fs.writeFileSync(path.join(home, '.claude', '.ahc-lock.json'), '{ no good');

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /✗ lock file/);
    assert.match(r.stdout, /not valid JSON/);
  } finally { rmrf(home); }
});

test('doctor: empty lock → warn (suggests sync)', () => {
  const home = freshHome();
  try {
    writeSettings(home, validHookSettings());
    writeLock(home, { agents: {}, commands: {}, skills: {}, pins: {} });

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /⚠ lock file/);
    assert.match(r.stdout, /empty/);
  } finally { rmrf(home); }
});

test('doctor: world-readable config WITHOUT token → warn (preventive)', { skip: process.platform === 'win32' }, () => {
  const home = freshHome();
  try {
    writeSettings(home, validHookSettings());
    writeLock(home, validLock());
    // freshHome() already wrote the config; tighten it then loosen.
    fs.chmodSync(path.join(home, '.claude', '.ahc-config.json'), 0o644);

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 0, `expected warn-only, got ${r.status}: ${r.stdout}`);
    assert.match(r.stdout, /⚠ config file permission/);
    assert.match(r.stdout, /preventive/);
  } finally { rmrf(home); }
});

test('doctor: world-readable config WITH token → fail, exit 1', { skip: process.platform === 'win32' }, () => {
  const home = freshHome();
  try {
    writeSettings(home, validHookSettings());
    writeLock(home, validLock());
    writeConfig(home, { repo: REMOTE_URL, branch: 'n/a', channel: 'stable', token: 'ghp_fake_token_for_test' });
    fs.chmodSync(path.join(home, '.claude', '.ahc-config.json'), 0o644);

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /✗ config file permission/);
    assert.match(r.stdout, /token present/);
  } finally { rmrf(home); }
});

test('doctor: 0600 config → ok', { skip: process.platform === 'win32' }, () => {
  const home = freshHome();
  try {
    writeSettings(home, validHookSettings());
    writeLock(home, validLock());
    fs.chmodSync(path.join(home, '.claude', '.ahc-config.json'), 0o600);

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /✓ config file permission/);
    assert.match(r.stdout, /mode 600/);
  } finally { rmrf(home); }
});

// ---------------------------------------------------------------------------
// T8 da demanda 001-ahc-pat-auth — doctor sobre a cascata de credenciais.
//
// Cobre AC-09, AC-10 (cenários A e B, as 3 linhas de cada tabela), a coluna
// `doctor` do AC-06 e a dívida que o T5 deixou aberta: o check de `git auth`
// montava `git ls-remote` por string com `execSync`, interpolando a URL
// derivada do `repo` do config — um `repo` com aspas virava comando de shell.
//
// Todos os valores de credencial são fictícios e literais (T_ENV, T_CFG,
// T_EMBUTIDO, C_DEV). Nenhum token real é lido, escrito ou impresso, e nenhum
// teste toca a rede: só o harness em loopback.
const {
  startAuthRemote,
  makeBareHub,
  baselineEnv,
  installCredHelper,
} = require('./helpers');

const T_ENV = 'T_ENV';
const T_CFG = 'T_CFG';
const T_EMBUTIDO = 'T_EMBUTIDO';
const C_DEV = 'C_DEV';
const ALL_SECRETS = [T_ENV, T_CFG, T_EMBUTIDO, C_DEV];

const LABEL = {
  env: 'env (AHC_GITHUB_TOKEN)',
  config: 'config (token em ~/.claude/.ahc-config.json)',
  embutido: 'embutido',
  git: 'credencial git',
};
const SECRET_OF = { env: T_ENV, config: T_CFG, embutido: T_EMBUTIDO, git: C_DEV };

async function withRemote(t, accepted) {
  const remote = await startAuthRemote({ accepted });
  // Registrado antes do hub: se makeBareHub estourar, o filho ainda é fechado.
  t.after(() => remote.close());
  const hub = makeBareHub(remote);
  t.after(() => hub.cleanup());
  return { remote, hub };
}

// HOME na condição de baseline (CB), apontando para o hub do harness, com o
// hook e a config em 600 — o resto do doctor precisa estar verde para que o
// exit code medido seja o do check de `git auth`.
function hubHome(t, hub, opts = {}) {
  const home = makeTmpHome();
  t.after(() => rmrf(home));
  const cfg = {
    repo: opts.repo !== undefined ? opts.repo : hub.repo,
    branch: opts.branch !== undefined ? opts.branch : hub.branch,
    channel: 'stable',
  };
  if (opts.configToken !== undefined) cfg.token = opts.configToken;
  writeConfig(home, cfg);
  fs.chmodSync(path.join(home, '.claude', '.ahc-config.json'), 0o600);
  writeSettings(home, validHookSettings());
  if (opts.credHelper) installCredHelper(home);
  return home;
}

function hubEnv(home, remote, opts = {}) {
  return baselineEnv(home, {
    baseURL: remote.baseURL,
    // A origem "embutido" nos testes é sempre este literal fictício: o marcador
    // de `bin/ahc` entra no BUILD vazio e nenhum teste lê o valor real.
    embeddedToken: opts.embeddedToken !== undefined ? opts.embeddedToken : '',
    ...(opts.envToken !== undefined ? { envToken: opts.envToken } : {}),
    extra: opts.extra,
  });
}

// `cwd` neutro: no hook SessionStart o ahc roda dentro do projeto aberto, e
// nenhum teste pode depender do repo deste checkout.
function ahc(home, args, env, opts = {}) {
  return runAhc(home, args, { env, cwd: env.PWD, input: '', timeout: opts.timeout || 60000 });
}

// As linhas de `git auth` (✓/⚠/✗) com as respectivas dicas, na ordem impressa.
function gitAuthBlock(stdout) {
  const lines = (stdout || '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^[✓⚠✗] git auth/.test(lines[i])) continue;
    out.push(lines[i]);
    if (lines[i + 1] && lines[i + 1].startsWith('  → ')) out.push(lines[i + 1]);
  }
  return out.join('\n');
}

function failLines(stdout) {
  return (stdout || '').split('\n').filter((l) => l.startsWith('✗ '));
}

// C9: nem o valor nem o base64 do `x-access-token:<valor>` pode sair.
function assertNoSecretLeak(r) {
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  for (const secret of ALL_SECRETS) {
    assert.ok(!out.includes(secret), `o valor ${secret} vazou para a saída`);
    const basic = Buffer.from(`x-access-token:${secret}`).toString('base64');
    assert.ok(!out.includes(basic), `o base64 de ${secret} vazou para a saída`);
  }
}

// ---- AC-09: doctor verde sem credencial git --------------------------------

test('AC-09: doctor verde sem credencial git, nomeando a origem que autenticou', async (t) => {
  const { remote, hub } = await withRemote(t, [T_EMBUTIDO]);
  const home = hubHome(t, hub);
  const env = hubEnv(home, remote, { embeddedToken: T_EMBUTIDO });

  // "hub instalado como no AC-02": cache clonado e lock válido.
  const s = ahc(home, ['sync'], env);
  assert.equal(s.status, 0, `sync de preparação deveria sair 0: ${s.stderr}`);
  remote.clearAuthLog();

  const r = ahc(home, ['doctor'], env);

  assert.equal(r.status, 0, `doctor deveria sair 0: ${r.stdout}\n${r.stderr}`);
  assert.deepEqual(failLines(r.stdout), [], 'nenhum check ✗');
  assert.match(
    r.stdout,
    new RegExp(`^✓ git auth \\(${hub.repo}@${hub.branch} reachable via embutido\\)$`, 'm')
  );
  assert.ok(
    !/origem recusada/.test(r.stdout),
    'com a primeira origem disponível autenticando não há ⚠ de origem recusada'
  );
  assert.match(r.stdout, /^✓ ahc CLI up to date/m);
  assert.ok(
    !/could not compare with remote/.test(r.stdout),
    'o check de versão do CLI reaproveita o cache da cascata'
  );
  assert.match(r.stdout, /^✓ git version \(\d+\.\d+/m);
  assertNoSecretLeak(r);
});

// ---- uma cascata só, reaproveitada pelo check da versão do CLI -------------

test('doctor: uma cascata só — a credencial é apresentada uma única vez', async (t) => {
  const { remote, hub } = await withRemote(t, [T_EMBUTIDO]);
  const home = hubHome(t, hub);
  const env = hubEnv(home, remote, { embeddedToken: T_EMBUTIDO });

  const s = ahc(home, ['sync'], env);
  assert.equal(s.status, 0, `sync de preparação deveria sair 0: ${s.stderr}`);
  remote.clearAuthLog();

  const r = ahc(home, ['doctor'], env);

  assert.equal(r.status, 0, `doctor deveria sair 0: ${r.stdout}\n${r.stderr}`);
  // O check de `git auth` e o de versão do CLI precisam do mesmo cache. Duas
  // entradas aqui significariam duas cascatas no mesmo doctor.
  assert.deepEqual(
    remote.presentedSecrets(), [T_EMBUTIDO],
    'a cascata do doctor roda uma vez só e o check do CLI reusa o cache'
  );
  assert.match(r.stdout, /^✓ ahc CLI up to date/m);
});

// ---- AC-10, cenário A: todas as origens disponíveis recusadas --------------

const AC10_A = [
  {
    rotulo: 'só embutido disponível',
    envToken: undefined, configToken: undefined, credHelper: false,
    origens: 'embutido, credencial git: nenhuma configurada',
    apresentadas: ['embutido'],
  },
  {
    rotulo: 'env, config e embutido',
    envToken: T_ENV, configToken: T_CFG, credHelper: false,
    origens: 'env, config, embutido, credencial git: nenhuma configurada',
    apresentadas: ['env', 'config', 'embutido'],
  },
  {
    rotulo: 'env, config, embutido e credencial git',
    envToken: T_ENV, configToken: T_CFG, credHelper: true,
    origens: 'env, config, embutido, credencial git',
    apresentadas: ['env', 'config', 'embutido', 'git'],
  },
];

for (const row of AC10_A) {
  test(`AC-10 A: ${row.rotulo} — todas recusadas → ✗ com a lista de origens`, async (t) => {
    const { remote, hub } = await withRemote(t, []); // o remoto recusa tudo
    const home = hubHome(t, hub, { configToken: row.configToken, credHelper: row.credHelper });
    const env = hubEnv(home, remote, { envToken: row.envToken, embeddedToken: T_EMBUTIDO });

    const r = ahc(home, ['doctor'], env);

    assert.equal(r.status, 1, `doctor deveria sair 1: ${r.stdout}\n${r.stderr}`);
    assert.equal(
      gitAuthBlock(r.stdout),
      `✗ git auth — ${hub.repo}@${hub.branch}: acesso recusado por todas as origens (${row.origens})\n` +
      '  → Informe um token válido: `export AHC_GITHUB_TOKEN=<token>` ou `ahc config token=<token>`. ' +
      'Com conta na org: `gh auth login && gh auth setup-git`'
    );
    // A dica não pode depender só do `gh`: o dev sem credencial git é
    // exatamente quem esta demanda atende.
    assert.match(gitAuthBlock(r.stdout), /AHC_GITHUB_TOKEN=<token>/);
    assert.match(gitAuthBlock(r.stdout), /ahc config token=<token>/);
    assert.deepEqual(
      remote.presentedSecrets(), row.apresentadas.map((id) => SECRET_OF[id]),
      'cada origem disponível foi apresentada uma vez, na ordem da cascata'
    );
    assertNoSecretLeak(r);
  });
}

// ---- AC-10, cenário B: origem recusada, a seguinte autentica ---------------

const AC10_B = [
  {
    rotulo: 'env recusada, config autentica',
    envToken: T_ENV, configToken: T_CFG, credHelper: false,
    aceita: [T_CFG], autenticou: 'config', recusadas: ['env'],
  },
  {
    rotulo: 'config recusada, embutido autentica',
    envToken: undefined, configToken: T_CFG, credHelper: false,
    aceita: [T_EMBUTIDO], autenticou: 'embutido', recusadas: ['config'],
  },
  {
    rotulo: 'embutido recusado, credencial git autentica',
    envToken: undefined, configToken: undefined, credHelper: true,
    aceita: [C_DEV], autenticou: 'git', recusadas: ['embutido'],
  },
];

const HINT_OF = {
  env: '  → Atualize ou remova a variável: `unset AHC_GITHUB_TOKEN`',
  config: '  → Informe outro token com `ahc config token=<novo>` ou remova o campo `token`',
  embutido: '  → Token embutido vencido ou revogado: rode de novo o one-liner da wiki, ' +
    'ou informe um token por AHC_GITHUB_TOKEN / `ahc config token=<novo>`',
};

for (const row of AC10_B) {
  test(`AC-10 B: ${row.rotulo} — ✓ com ⚠ por origem recusada e exit 0`, async (t) => {
    const { remote, hub } = await withRemote(t, row.aceita);
    const home = hubHome(t, hub, { configToken: row.configToken, credHelper: row.credHelper });
    const env = hubEnv(home, remote, { envToken: row.envToken, embeddedToken: T_EMBUTIDO });

    const r = ahc(home, ['doctor'], env);

    // ⚠ não altera o exit code: o acesso funciona e o sync segue verde (AC-12).
    assert.equal(r.status, 0, `doctor deveria sair 0: ${r.stdout}\n${r.stderr}`);
    assert.deepEqual(failLines(r.stdout), [], 'nenhum check ✗');
    const esperado = [
      `✓ git auth (${hub.repo}@${hub.branch} reachable via ${LABEL[row.autenticou]})`,
      ...row.recusadas.flatMap((id) => [`⚠ git auth: origem recusada — ${LABEL[id]}`, HINT_OF[id]]),
    ].join('\n');
    assert.equal(gitAuthBlock(r.stdout), esperado);
    assert.deepEqual(
      remote.presentedSecrets(),
      [...row.recusadas.map((id) => SECRET_OF[id]), SECRET_OF[row.autenticou]],
      'as recusadas na ordem da cascata, seguidas da que autenticou'
    );
    assertNoSecretLeak(r);
  });
}

// ---- AC-06: coluna `doctor` da tabela de precedência -----------------------

const AC06 = [
  { env: T_ENV, config: T_CFG, origem: 'env', rotulo: 'env + config → env' },
  { env: T_ENV, config: undefined, origem: 'env', rotulo: 'env sem config → env' },
  { env: undefined, config: T_CFG, origem: 'config', rotulo: 'só config → config' },
  { env: undefined, config: undefined, origem: 'embutido', rotulo: 'nenhuma das duas → embutido' },
  { env: '', config: T_CFG, origem: 'config', rotulo: 'env vazia não é origem → config' },
  { env: undefined, config: '', origem: 'embutido', rotulo: 'config vazia não é origem → embutido' },
];

for (const row of AC06) {
  test(`AC-06 (doctor): ${row.rotulo}`, async (t) => {
    // Todas as origens aceitas: o que este AC prova é qual token vai PRIMEIRO.
    const { remote, hub } = await withRemote(t, [T_ENV, T_CFG, T_EMBUTIDO]);
    const home = hubHome(t, hub, { configToken: row.config });
    const env = hubEnv(home, remote, { envToken: row.env, embeddedToken: T_EMBUTIDO });

    const r = ahc(home, ['doctor'], env);

    assert.equal(r.status, 0, `doctor deveria sair 0: ${r.stdout}\n${r.stderr}`);
    assert.deepEqual(
      remote.presentedSecrets(), [SECRET_OF[row.origem]],
      'token apresentado pelo doctor'
    );
    assert.deepEqual(remote.presentedUsers(), ['x-access-token'], 'usuário fixo das rodadas de token');
    assert.equal(
      gitAuthBlock(r.stdout),
      `✓ git auth (${hub.repo}@${hub.branch} reachable via ${LABEL[row.origem]})`
    );
    assertNoSecretLeak(r);
  });
}

// ---- rede não avança a cascata --------------------------------------------

test('doctor: rede/timeout não avança a cascata e diz que as outras origens não foram tentadas', async (t) => {
  const { remote, hub } = await withRemote(t, [T_EMBUTIDO]);
  const home = hubHome(t, hub, { configToken: T_CFG });
  const env = hubEnv(home, remote, { envToken: T_ENV, embeddedToken: T_EMBUTIDO });
  // Porta fechada em loopback: conexão recusada na primeira origem.
  await remote.close();

  const r = ahc(home, ['doctor'], env);

  assert.equal(r.status, 1, `doctor deveria sair 1: ${r.stdout}\n${r.stderr}`);
  assert.match(
    gitAuthBlock(r.stdout),
    new RegExp(`^✗ git auth — ${hub.repo}@${hub.branch}: rede/timeout \\(.+\\); outras origens não tentadas$`)
  );
  assert.ok(
    !/acesso recusado por todas as origens/.test(r.stdout),
    'erro de conexão não pode ser lido como recusa de credencial (C4)'
  );
  assertNoSecretLeak(r);
});

// ---- check novo: versão do git --------------------------------------------

test('doctor: git abaixo de 2.31 vira ✗ com a linha do §5', async (t) => {
  const { remote, hub } = await withRemote(t, [T_EMBUTIDO]);
  const home = hubHome(t, hub);
  // Shim que só mente na versão e repassa todo o resto ao git real — sem isso
  // não haveria como exercitar o requisito numa máquina com git novo.
  const realGit = require('child_process')
    .spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  const shimDir = path.join(home, '.shim');
  fs.mkdirSync(shimDir, { recursive: true });
  const shim = path.join(shimDir, 'git');
  fs.writeFileSync(
    shim,
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "git version 2.25.1"; exit 0; fi\nexec ${realGit} "$@"\n`
  );
  fs.chmodSync(shim, 0o755);

  const env = hubEnv(home, remote, { embeddedToken: T_EMBUTIDO });
  env.PATH = `${shimDir}:${env.PATH}`;

  const r = ahc(home, ['doctor'], env);

  assert.equal(r.status, 1, `doctor deveria sair 1: ${r.stdout}\n${r.stderr}`);
  assert.match(
    r.stdout,
    /^✗ git version — 2\.25\.1 < 2\.31 \(necessário para autenticar por token\)$/m
  );
  // O check é só do doctor: o acesso em si continua sendo avaliado.
  assert.match(r.stdout, new RegExp(`^✓ git auth \\(${hub.repo}@${hub.branch} reachable via embutido\\)$`, 'm'));
});

// ---- o check de `git auth` não passa mais pelo shell -----------------------

test('doctor: repo com aspas e metacaracteres não executa nada (sem shell no check de git auth)', async (t) => {
  const { remote, hub } = await withRemote(t, [T_EMBUTIDO]);
  // Com o `git ls-remote --exit-code "${url}" "${branch}"` por string que o T5
  // deixou para trás, este valor fecharia as aspas da URL e o `touch` rodaria.
  const home = hubHome(t, hub, { repo: 'EMS-NCTECH/agents-hub-claude"; touch pwned; echo "' });
  const env = hubEnv(home, remote, { embeddedToken: T_EMBUTIDO });
  const pwned = path.join(env.PWD, 'pwned');

  const r = ahc(home, ['doctor'], env);

  assert.ok(!fs.existsSync(pwned), 'nada pode ser executado a partir do valor do config');
  assert.deepEqual(remote.authHeaders(), [], 'o harness não pode ter recebido requisição');
  assert.equal(r.status, 1, `doctor deveria sair 1: ${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^✗ git auth — configuração inválida do hub$/m);
  assert.match(r.stdout, /^ {2}→ repo inválido em/m);
  assert.ok(
    !fs.existsSync(path.join(home, '.claude', '.ahc-cache')),
    'nem o diretório de cache do repo inválido deveria surgir'
  );
});

test('doctor: branch com metacaracteres também é rejeitada antes de qualquer rede', async (t) => {
  const { remote, hub } = await withRemote(t, [T_EMBUTIDO]);
  const home = hubHome(t, hub, { branch: 'main"; touch pwned-branch; echo "' });
  const env = hubEnv(home, remote, { embeddedToken: T_EMBUTIDO });
  const pwned = path.join(env.PWD, 'pwned-branch');

  const r = ahc(home, ['doctor'], env);

  assert.ok(!fs.existsSync(pwned), 'nada pode ser executado a partir do valor do config');
  assert.deepEqual(remote.authHeaders(), []);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^ {2}→ branch inválida em/m);
});
