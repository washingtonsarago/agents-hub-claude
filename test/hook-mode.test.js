// T7 da demanda 001-ahc-pat-auth — modo hook do `ahc sync`.
//
// O hook `SessionStart` roda `ahc sync --quiet --timeout=5` sem terminal. Todos
// os testes deste arquivo rodam o CLI com **stdin fechado** (`stdio: ['ignore',
// …]`) e com a CB do `baselineEnv` — que, entre outras coisas, **remove
// `GIT_TERMINAL_PROMPT` do ambiente**: o AC-14 exige que nada peça usuário ou
// senha mesmo sem a variável, e um teste que a definisse provaria a variável, e
// não o código.
//
// Cobre:
//   - AC-05: sync do hook sem terminal — sucesso, cascata com recusa e recusa
//     total, sempre sem esperar input e sem tocar nos artefatos na falha;
//   - AC-14 (linhas `--quiet`): a tabela inteira via `sync --quiet --timeout=5`,
//     com a ordem das credenciais apresentadas e o exit code preservado;
//   - §5 "Saídas novas": a linha de aviso da cascata, que sai por `console.log`
//     e **ignora o `--quiet`** de propósito (o stdout do hook chega ao contexto
//     do Claude), e a linha de todas recusadas, em stderr, com exit 0 no
//     `--quiet` e 1 sem ele.
//
// Todos os valores de credencial são fictícios e literais. Nenhum token real é
// lido, escrito ou impresso, e nenhum teste toca a rede: só o harness em
// loopback.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  startAuthRemote,
  makeBareHub,
  publishAgentVersion,
  makeTmpHome,
  writeConfig,
  readLock,
  baselineEnv,
  installCredHelper,
  sha256,
  runAhc,
  rmrf,
} = require('./helpers');

const T_ENV = 'T_ENV';
const T_CFG = 'T_CFG';
const T_EMBUTIDO = 'T_EMBUTIDO';
const C_DEV = 'C_DEV';
const T_SETUP = 'T_SETUP';
const SECRET_OF = { env: T_ENV, config: T_CFG, embutido: T_EMBUTIDO, git: C_DEV };
const ALL_SECRETS = [T_ENV, T_CFG, T_EMBUTIDO, C_DEV, T_SETUP];

// Rótulos do §5, iguais aos do `install.sh` e aos dos ⚠ do doctor.
const LABEL_OF = {
  env: 'env (AHC_GITHUB_TOKEN)',
  config: 'config (token em ~/.claude/.ahc-config.json)',
  embutido: 'embutido',
  git: 'credencial git',
};

// O comando exato do hook `SessionStart`.
const HOOK_ARGS = ['sync', '--quiet', '--timeout=5'];

// ---- setup -----------------------------------------------------------------

async function withRemote(t, accepted) {
  const remote = await startAuthRemote({ accepted });
  t.after(() => remote.close());
  const hub = makeBareHub(remote);
  t.after(() => hub.cleanup());
  return { remote, hub };
}

function makeHome(t, hub, opts = {}) {
  const home = makeTmpHome();
  t.after(() => rmrf(home));
  const cfg = { repo: hub.repo, branch: hub.branch, channel: 'stable' };
  if (opts.configToken !== undefined) cfg.token = opts.configToken;
  writeConfig(home, cfg);
  if (opts.credHelper) installCredHelper(home);
  return home;
}

function envFor(home, remote, opts = {}) {
  return baselineEnv(home, {
    baseURL: remote.baseURL,
    embeddedToken: opts.embeddedToken !== undefined ? opts.embeddedToken : '',
    ...(opts.envToken !== undefined ? { envToken: opts.envToken } : {}),
  });
}

// **stdin fechado**: o hook roda sem terminal, e um CLI que espere input aqui
// trava a sessão do dev em vez de falhar.
function ahcNoTTY(home, args, env) {
  return runAhc(home, args, {
    env,
    cwd: env.PWD,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
  });
}

function cachePath(home, repo) {
  return path.join(home, '.claude', '.ahc-cache', repo.replace(/[^a-zA-Z0-9._-]/g, '_'));
}

function agentFile(home, name = 'test-agent') {
  return path.join(home, '.claude', 'agents', `${name}.md`);
}

function snapshotArtifacts(home) {
  const out = {};
  for (const dir of ['agents', 'commands', 'skills', 'autonomous']) {
    const root = path.join(home, '.claude', dir);
    const walk = (p, rel) => {
      if (!fs.existsSync(p)) return;
      for (const e of fs.readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const child = path.join(p, e.name);
        const childRel = `${rel}/${e.name}`;
        if (e.isDirectory()) walk(child, childRel);
        else out[childRel] = sha256(fs.readFileSync(child, 'utf8'));
      }
    };
    walk(root, dir);
  }
  const lockFile = path.join(home, '.claude', '.ahc-lock.json');
  out['.ahc-lock.json'] = fs.existsSync(lockFile) ? fs.readFileSync(lockFile, 'utf8') : null;
  return out;
}

function assertNoSecretLeak(r) {
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  for (const secret of ALL_SECRETS) {
    assert.ok(!out.includes(secret), `o valor ${secret} vazou para a saída`);
    const basic = Buffer.from(`x-access-token:${secret}`).toString('base64');
    assert.ok(!out.includes(basic), `o base64 de ${secret} vazou para a saída`);
  }
}

// Nada pode ter ficado esperando input: nem morto pelo timeout do teste, nem
// com um prompt de usuário/senha na saída.
function assertNoPrompt(r) {
  assert.equal(r.signal, null, 'o comando foi morto por timeout — algo esperou input');
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  assert.ok(!/Username|Password for/i.test(out), `algo pediu usuário ou senha:\n${out}`);
}

// Cache já clonado, com um token de setup que não participa das tabelas.
function installBaseline(t, remote, hub, opts = {}) {
  const home = makeHome(t, hub, opts);
  const setupEnv = baselineEnv(home, { baseURL: remote.baseURL, envToken: T_SETUP, embeddedToken: '' });
  const r = ahcNoTTY(home, ['sync'], setupEnv);
  assert.equal(r.status, 0, `setup do cache deveria sair 0: ${r.stderr}`);
  assert.ok(fs.existsSync(path.join(cachePath(home, hub.repo), '.git')), 'o setup deveria ter clonado o cache');
  remote.clearAuthLog();
  return home;
}

// A linha de aviso da cascata, tal como o dev a vê no stdout do hook.
function avisoLine(stdout) {
  return (stdout || '').split('\n').find((l) => l.startsWith('[ahc] aviso:')) || null;
}

function expectedAviso(autenticou, recusadas) {
  return `[ahc] aviso: hub autenticado via ${LABEL_OF[autenticou]}; ` +
    `origem(ns) recusada(s): ${recusadas.map((id) => LABEL_OF[id]).join(', ')}. Rode \`ahc doctor\`.`;
}

// A linha de todas recusadas, em stderr.
function recusadaLine(stderr) {
  return (stderr || '').split('\n').find((l) => l.startsWith('[ahc] acesso ao hub recusado')) || null;
}

function expectedRecusada(labels) {
  return `[ahc] acesso ao hub recusado por todas as origens (${labels})` +
    ' — mantendo o cache local. Rode `ahc doctor`.';
}

// ---- AC-05: o sync do hook, sem terminal -----------------------------------

test('AC-05: `sync --quiet --timeout=5` com stdin fechado aplica as atualizações', async (t) => {
  // CB pura: nenhum credential helper, nenhum env, nenhum token na config — só
  // o embutido, que é o caso do dev do one-liner.
  const { remote, hub } = await withRemote(t, [T_EMBUTIDO, T_SETUP]);
  const home = installBaseline(t, remote, hub);

  const published = publishAgentVersion(hub, { version: '1.1.0' });
  const env = envFor(home, remote, { embeddedToken: T_EMBUTIDO });

  const r = ahcNoTTY(home, HOOK_ARGS, env);

  assert.equal(r.status, 0, `o sync do hook deveria sair 0: ${r.stdout}\n${r.stderr}`);
  assertNoPrompt(r);
  assert.equal(fs.readFileSync(agentFile(home), 'utf8'), published.body, 'o agent novo foi gravado');
  assert.equal(readLock(home).agents['test-agent'].version, '1.1.0', 'o lock registra a versão nova');
  assert.deepEqual(remote.presentedSecrets(), [T_EMBUTIDO], 'autenticou pelo embutido');
  // `--quiet` continua valendo para o resto: só a linha de aviso o ignora, e
  // aqui não houve recusa nenhuma.
  assert.equal(r.stdout.trim(), '', `o modo quiet não pode imprimir o relatório:\n${r.stdout}`);
  assertNoSecretLeak(r);
});

test('AC-05: sem nenhuma recusa, o hook não imprime aviso nenhum', async (t) => {
  const { remote, hub } = await withRemote(t, [T_ENV, T_SETUP]);
  const home = installBaseline(t, remote, hub);
  publishAgentVersion(hub, { version: '1.2.0' });

  const env = envFor(home, remote, { envToken: T_ENV, embeddedToken: T_EMBUTIDO });
  const r = ahcNoTTY(home, HOOK_ARGS, env);

  assert.equal(r.status, 0, `deveria sair 0: ${r.stderr}`);
  assert.equal(avisoLine(r.stdout), null, 'a primeira origem autenticou: não há o que avisar');
  assert.equal(r.stdout.trim(), '', 'nada além do aviso pode escapar do --quiet');
});

// ---- AC-14 pelo comando do hook --------------------------------------------

const AC14 = [
  {
    rotulo: 'env recusada, config autentica',
    env: T_ENV, config: T_CFG, credHelper: false,
    aceita: [T_CFG], resultado: 'sucesso', autenticou: 'config', recusadas: ['env'],
  },
  {
    rotulo: 'config recusada, embutido autentica',
    env: undefined, config: T_CFG, credHelper: false,
    aceita: [T_EMBUTIDO], resultado: 'sucesso', autenticou: 'embutido', recusadas: ['config'],
  },
  {
    rotulo: 'env e config recusadas, embutido autentica',
    env: T_ENV, config: T_CFG, credHelper: false,
    aceita: [T_EMBUTIDO], resultado: 'sucesso', autenticou: 'embutido', recusadas: ['env', 'config'],
  },
  {
    rotulo: 'embutido recusado, credencial git autentica',
    env: undefined, config: undefined, credHelper: true,
    aceita: [C_DEV], resultado: 'sucesso', autenticou: 'git', recusadas: ['embutido'],
  },
  {
    rotulo: 'env, config e embutido recusados, credencial git autentica',
    env: T_ENV, config: T_CFG, credHelper: true,
    aceita: [C_DEV], resultado: 'sucesso', autenticou: 'git', recusadas: ['env', 'config', 'embutido'],
  },
  {
    rotulo: 'só embutido disponível e recusado, sem credencial git',
    env: undefined, config: undefined, credHelper: false,
    aceita: [], resultado: 'falha', autenticou: null, recusadas: ['embutido'],
    // A rodada `git` foi tentada mas não tinha nada a apresentar.
    origens: 'embutido, credencial git: nenhuma configurada',
  },
  {
    rotulo: 'todas as origens recusadas, com credencial git',
    env: T_ENV, config: T_CFG, credHelper: true,
    aceita: [], resultado: 'falha', autenticou: null, recusadas: ['env', 'config', 'embutido', 'git'],
    origens: 'env (AHC_GITHUB_TOKEN), config (token em ~/.claude/.ahc-config.json), embutido, credencial git',
  },
];

for (const row of AC14) {
  test(`AC-14 (--quiet): ${row.rotulo} → ${row.resultado}`, async (t) => {
    const { remote, hub } = await withRemote(t, [T_SETUP]);
    const home = installBaseline(t, remote, hub, {
      configToken: row.config,
      credHelper: row.credHelper,
    });

    const published = publishAgentVersion(hub, { version: '1.1.0' });
    const before = snapshotArtifacts(home);
    remote.setAccepted(row.aceita);

    const env = envFor(home, remote, { envToken: row.env, embeddedToken: T_EMBUTIDO });
    const r = ahcNoTTY(home, HOOK_ARGS, env);

    assertNoPrompt(r);
    assertNoSecretLeak(r);
    assert.deepEqual(
      remote.presentedSecrets(),
      [
        ...row.recusadas.map((id) => SECRET_OF[id]),
        ...(row.autenticou ? [SECRET_OF[row.autenticou]] : []),
      ],
      'credenciais apresentadas, em ordem, e nada depois da que autenticou'
    );

    if (row.resultado === 'sucesso') {
      assert.equal(r.status, 0, `sucesso esperado, saiu ${r.status}: ${r.stdout}\n${r.stderr}`);
      assert.equal(fs.readFileSync(agentFile(home), 'utf8'), published.body, 'o agent novo foi gravado');
      assert.equal(readLock(home).agents['test-agent'].version, '1.1.0', 'o lock registra a versão nova');
      // A linha de aviso ignora o `--quiet`: é ela que leva a recusa ao dev.
      assert.equal(
        avisoLine(r.stdout),
        expectedAviso(row.autenticou, row.recusadas),
        'linha de aviso da cascata, literal'
      );
      assert.equal(
        r.stdout.trim(), expectedAviso(row.autenticou, row.recusadas),
        'só a linha de aviso escapa do --quiet'
      );
    } else {
      // Exit 0 preservado: o hook não pode derrubar a sessão do dev.
      assert.equal(r.status, 0, `o --quiet preserva o exit 0 na falha, saiu ${r.status}: ${r.stderr}`);
      assert.equal(avisoLine(r.stdout), null, 'não houve origem que autenticasse: nada a avisar');
      assert.equal(
        recusadaLine(r.stderr), expectedRecusada(row.origens),
        'linha de todas recusadas, literal'
      );
      assert.deepEqual(
        snapshotArtifacts(home), before,
        'na falha, artefatos instalados e lock ficam idênticos aos de antes'
      );
    }
  });
}

// ---- exit code: `--quiet` → 0, sem `--quiet` → 1 ---------------------------

test('T7: todas recusadas — `--quiet` sai 0 e o mesmo sync sem `--quiet` sai 1', async (t) => {
  const { remote, hub } = await withRemote(t, [T_SETUP]);
  const home = installBaseline(t, remote, hub);
  const before = snapshotArtifacts(home);
  remote.setAccepted([]);

  const env = envFor(home, remote, { embeddedToken: T_EMBUTIDO });
  const esperado = expectedRecusada('embutido, credencial git: nenhuma configurada');

  const quiet = ahcNoTTY(home, HOOK_ARGS, env);
  assert.equal(quiet.status, 0, `--quiet preserva o exit 0: saiu ${quiet.status}`);
  assert.equal(recusadaLine(quiet.stderr), esperado);
  assertNoPrompt(quiet);

  remote.clearAuthLog();
  const loud = ahcNoTTY(home, ['sync'], env);
  assert.equal(loud.status, 1, `sem --quiet a falha é visível: saiu ${loud.status}`);
  assert.equal(recusadaLine(loud.stderr), esperado, 'a mesma linha nos dois modos');
  assertNoPrompt(loud);

  assert.deepEqual(snapshotArtifacts(home), before, 'nenhum dos dois pode mexer nos artefatos');
  assertNoSecretLeak(quiet);
  assertNoSecretLeak(loud);
});

// ---- a mesma linha de aviso no `list` --------------------------------------

test('T7: `list` também avisa a origem recusada (§5 cobre sync e list)', async (t) => {
  const { remote, hub } = await withRemote(t, [T_SETUP]);
  const home = installBaseline(t, remote, hub, { configToken: T_CFG });
  remote.setAccepted([T_EMBUTIDO]);

  const env = envFor(home, remote, { embeddedToken: T_EMBUTIDO });
  const r = ahcNoTTY(home, ['list'], env);

  assert.equal(r.status, 0, `list deveria sair 0: ${r.stderr}`);
  assert.equal(avisoLine(r.stdout), expectedAviso('embutido', ['config']));
  assertNoPrompt(r);
  assertNoSecretLeak(r);
});
