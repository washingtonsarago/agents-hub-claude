// Autoteste do harness do remoto autenticado (T2 de 001-ahc-pat-auth).
// Não exercita nenhum código de feature: prova só que a infraestrutura de que
// os ACs 02–06, 08–10, 12, 14 e 15 dependem se comporta como o contrato diz —
// recusa credencial desconhecida, aceita a conhecida, troca de credencial com o
// servidor no ar, registra os `Authorization` em ordem e serve git de verdade.
//
// Todos os valores de credencial aqui são fictícios e literais. Nenhum token
// real é lido, escrito ou impresso.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  startAuthRemote,
  makeBareHub,
  publishAgentVersion,
  makeTmpHome,
  baselineEnv,
  installCredHelper,
  isolatedGitEnv,
  rmrf,
} = require('./helpers');

// ---- injeção por invocação (o mesmo contrato que o T6 vai implementar) ------

function basic(user, secret) {
  return `Basic ${Buffer.from(`${user}:${secret}`).toString('base64')}`;
}

// Rodada de token: header com escopo da URL completa, helpers do dev anulados,
// sem redirect. É o contrato do §5 + C1/C2 do task.md.
function tokenGitEnv(home, url, token) {
  return {
    ...isolatedGitEnv(home),
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
    GIT_CONFIG_COUNT: '3',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
    GIT_CONFIG_KEY_1: `http.${url}.extraHeader`,
    GIT_CONFIG_VALUE_1: `Authorization: ${basic('x-access-token', token)}`,
    GIT_CONFIG_KEY_2: `http.${url}.followRedirects`,
    GIT_CONFIG_VALUE_2: 'false',
  };
}

// Rodada `git`: sem header, helpers do dev intactos, não interativo.
function devGitEnv(home) {
  return { ...isolatedGitEnv(home), GIT_ASKPASS: '', SSH_ASKPASS: '' };
}

function lsRemote(env, url) {
  return spawnSync('git', ['ls-remote', url], {
    env,
    encoding: 'utf8',
    timeout: 20000,
    input: '',
  });
}

async function withRemote(t, accepted) {
  const remote = await startAuthRemote({ accepted });
  // Registrado antes de qualquer outra coisa: se makeBareHub estourar, o
  // servidor filho ainda é fechado e nenhum processo fica órfão.
  t.after(() => remote.close());
  const hub = makeBareHub(remote);
  t.after(() => hub.cleanup());
  return { remote, hub };
}

// ---- requisito de versão do git --------------------------------------------

test('harness: git do ambiente é >= 2.31 (requisito de autenticação por token)', () => {
  const r = spawnSync('git', ['--version'], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'git --version deveria sair 0');
  const m = /git version (\d+)\.(\d+)/.exec(r.stdout);
  assert.ok(m, `saída inesperada de git --version: ${r.stdout}`);
  const [major, minor] = [Number(m[1]), Number(m[2])];
  assert.ok(
    major > 2 || (major === 2 && minor >= 31),
    `git ${major}.${minor} < 2.31 — a injeção por GIT_CONFIG_COUNT precisa de 2.31+`
  );
});

// ---- condição de baseline (CB) ---------------------------------------------

test('harness: baselineEnv reproduz a condição de baseline do task.md', (t) => {
  const home = makeTmpHome();
  t.after(() => rmrf(home));

  const env = baselineEnv(home, { baseURL: 'http://127.0.0.1:1234' });

  assert.equal(env.HOME, home);
  assert.ok(!('AHC_GITHUB_TOKEN' in env), 'AHC_GITHUB_TOKEN não pode estar no ambiente');
  assert.ok(
    !('GIT_TERMINAL_PROMPT' in env),
    'GIT_TERMINAL_PROMPT precisa ficar AUSENTE: o AC-14 exige que nada peça input mesmo sem ela'
  );
  assert.equal(env.GIT_CONFIG_NOSYSTEM, '1', 'sem a credencial do config de sistema');
  assert.equal(env.AHC_TEST_GIT_BASE_URL, 'http://127.0.0.1:1234');
  for (const key of ['XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME']) {
    assert.ok(env[key].startsWith(home), `${key} deve ficar dentro do HOME temporário`);
    assert.ok(fs.existsSync(env[key]), `${key} deve existir`);
  }
  assert.ok(env.PWD.startsWith(home) && fs.existsSync(env.PWD), 'cwd neutro dentro do HOME');
  assert.equal(
    baselineEnv(home, { envToken: 'T_ENV' }).AHC_GITHUB_TOKEN,
    'T_ENV',
    'a origem env é opt-in explícito do teste'
  );
});

// ---- recusa / aceitação ----------------------------------------------------

test('harness: recusa token desconhecido, sem prompt e sem vazar o repo', async (t) => {
  const { remote, hub } = await withRemote(t, ['T_EMBUTIDO']);
  const home = makeTmpHome();
  t.after(() => rmrf(home));

  const r = lsRemote(tokenGitEnv(home, hub.url, 'T_DESCONHECIDO'), hub.url);

  assert.notEqual(r.status, 0, 'ls-remote com token desconhecido deveria falhar');
  assert.ok(
    /Authentication failed|could not read Username|403|401/i.test(r.stderr),
    `stderr inesperado: ${r.stderr}`
  );
  assert.ok(!/refs\/heads\/main/.test(r.stdout), 'nenhuma ref pode vazar numa recusa');
  assert.deepEqual(
    remote.presentedSecrets(),
    ['T_DESCONHECIDO'],
    'o remoto deve registrar a credencial recusada'
  );
});

test('harness: aceita o token conhecido e serve as refs', async (t) => {
  const { remote, hub } = await withRemote(t, ['T_EMBUTIDO']);
  const home = makeTmpHome();
  t.after(() => rmrf(home));

  const r = lsRemote(tokenGitEnv(home, hub.url, 'T_EMBUTIDO'), hub.url);

  assert.equal(r.status, 0, `ls-remote deveria sair 0: ${r.stderr}`);
  assert.match(r.stdout, /refs\/heads\/main/);
  assert.deepEqual(remote.presentedSecrets(), ['T_EMBUTIDO']);
  assert.deepEqual(remote.presentedUsers(), ['x-access-token']);
});

// ---- log de Authorization --------------------------------------------------

test('harness: registra os Authorization em ordem, e só os que trazem credencial', async (t) => {
  const { remote, hub } = await withRemote(t, ['T_EMBUTIDO']);
  const home = makeTmpHome();
  t.after(() => rmrf(home));

  // Requisição anônima (rodada `git` sem credencial): não entra no log.
  const anon = lsRemote(devGitEnv(home), hub.url);
  assert.notEqual(anon.status, 0, 'sem credencial o remoto deve recusar');
  assert.deepEqual(remote.authHeaders(), [], 'a requisição anônima não pode entrar no log');

  // Cascata: duas recusadas e a terceira autentica.
  for (const token of ['T_ENV', 'T_CFG', 'T_EMBUTIDO']) {
    lsRemote(tokenGitEnv(home, hub.url, token), hub.url);
  }

  assert.deepEqual(
    remote.presentedSecrets(),
    ['T_ENV', 'T_CFG', 'T_EMBUTIDO'],
    'a ordem do log é o que o AC-14 compara'
  );

  remote.clearAuthLog();
  assert.deepEqual(remote.authHeaders(), []);
});

// ---- troca de credenciais com o servidor no ar (AC-08) ---------------------

test('harness: trocar as credenciais aceitas vale já na próxima requisição', async (t) => {
  const { remote, hub } = await withRemote(t, ['T_OLD']);
  const home = makeTmpHome();
  t.after(() => rmrf(home));

  assert.equal(lsRemote(tokenGitEnv(home, hub.url, 'T_OLD'), hub.url).status, 0);

  remote.setAccepted(['T_NEW']);

  assert.notEqual(
    lsRemote(tokenGitEnv(home, hub.url, 'T_OLD'), hub.url).status,
    0,
    'T_OLD passou a ser recusado'
  );
  assert.equal(
    lsRemote(tokenGitEnv(home, hub.url, 'T_NEW'), hub.url).status,
    0,
    'T_NEW passou a ser aceito'
  );
  assert.deepEqual(remote.presentedSecrets(), ['T_OLD', 'T_OLD', 'T_NEW']);
});

// ---- credential helper simulado (C_DEV) ------------------------------------

test('harness: o credential helper simulado entrega C_DEV na rodada `git`', async (t) => {
  const { remote, hub } = await withRemote(t, ['C_DEV']);
  const home = makeTmpHome();
  t.after(() => rmrf(home));
  installCredHelper(home);

  const r = lsRemote(devGitEnv(home), hub.url);

  assert.equal(r.status, 0, `ls-remote com C_DEV deveria sair 0: ${r.stderr}`);
  assert.match(r.stdout, /refs\/heads\/main/);
  assert.deepEqual(remote.presentedSecrets(), ['C_DEV']);
  assert.deepEqual(remote.presentedUsers(), ['dev']);
});

// ---- o remoto serve git de verdade (POST upload-pack, corpo gzipado) -------

test('harness: clone --depth=1 autenticado traz a árvore do hub', async (t) => {
  const { remote, hub } = await withRemote(t, ['T_EMBUTIDO']);
  const home = makeTmpHome();
  const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-clone-')), 'cache');
  t.after(() => { rmrf(home); rmrf(path.dirname(dest)); });

  const r = spawnSync(
    'git',
    ['clone', '--depth=1', '--branch', hub.branch, '-q', hub.url, dest],
    { env: tokenGitEnv(home, hub.url, 'T_EMBUTIDO'), encoding: 'utf8', timeout: 30000, input: '' }
  );

  assert.equal(r.status, 0, `clone deveria sair 0: ${r.stderr}`);
  assert.ok(fs.existsSync(path.join(dest, 'manifest.json')), 'manifest.json no cache');
  assert.ok(fs.existsSync(path.join(dest, 'bin', 'ahc')), 'bin/ahc no cache (o install.sh copia daí)');
  assert.ok(fs.existsSync(path.join(dest, 'agents', 'test-agent.md')), 'fixture no cache');
  assert.ok(remote.presentedSecrets().length >= 1, 'o clone apresentou credencial');
});

test('harness: publishAgentVersion publica versão nova visível por fetch', async (t) => {
  const { hub } = await withRemote(t, ['T_EMBUTIDO']);
  const home = makeTmpHome();
  const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-clone-')), 'cache');
  t.after(() => { rmrf(home); rmrf(path.dirname(dest)); });

  const env = tokenGitEnv(home, hub.url, 'T_EMBUTIDO');
  assert.equal(
    spawnSync('git', ['clone', '--depth=1', '--branch', hub.branch, '-q', hub.url, dest],
      { env, encoding: 'utf8', timeout: 30000, input: '' }).status,
    0
  );
  const before = JSON.parse(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8'));
  assert.equal(before.agents[0].version, '1.0.0');

  const published = publishAgentVersion(hub, { version: '1.2.0' });

  const fetched = spawnSync(
    'git',
    ['-C', dest, 'fetch', '--depth=1', '-q', hub.url, `refs/heads/${hub.branch}`],
    { env, encoding: 'utf8', timeout: 30000, input: '' }
  );
  assert.equal(fetched.status, 0, `fetch deveria sair 0: ${fetched.stderr}`);
  assert.equal(
    spawnSync('git', ['-C', dest, 'reset', '--hard', '-q', 'FETCH_HEAD'],
      { env, encoding: 'utf8', timeout: 30000, input: '' }).status,
    0
  );

  const after = JSON.parse(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8'));
  assert.equal(after.agents[0].version, '1.2.0');
  assert.equal(after.agents[0].sha256, published.sha256);
  assert.equal(
    fs.readFileSync(path.join(dest, 'agents', 'test-agent.md'), 'utf8'),
    published.body,
    'o conteúdo publicado bate com o sha do manifest'
  );
});
