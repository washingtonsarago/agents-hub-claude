// T6 da demanda 001-ahc-pat-auth — cascata de origens de credencial.
//
// Cobre:
//   - AC-06: precedência (qual token é apresentado PRIMEIRO), para `sync` e `list`;
//   - AC-14: tabela completa da cascata — resultado, ordem do log de
//     `Authorization` no harness, nada apresentado depois da origem que
//     autenticou, e artefatos + lock idênticos no caso de falha;
//   - AC-08: T_OLD → T_NEW por env e por config sobre o MESMO cache, e depois
//     sem variável de ambiente (premissa F3: nada é persistido);
//   - AC-04: versão nova gravada, lock atualizado e `list` correto;
//   - controles C1 (escopo da URL completa), C2 (sem redirect), C3 (nada de
//     token para host reescrito por `insteadOf`), C4 (classificação fechada,
//     por teste unitário), C8 (fetchURL nunca recebe Authorization) e C14
//     (verificação sha256 preservada no refactor).
//
// Todos os valores de credencial são fictícios e literais (T_ENV, T_CFG,
// T_EMBUTIDO, C_DEV, T_OLD, T_NEW, T_SETUP). Nenhum token real é lido, escrito
// ou impresso, e nenhum teste toca a rede: só o harness em loopback.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const {
  AHC_BIN,
  startAuthRemote,
  makeBareHub,
  publishAgentVersion,
  makeTmpHome,
  writeConfig,
  readLock,
  baselineEnv,
  installCredHelper,
  isolatedGitEnv,
  sha256,
  git,
  runAhc,
  rmrf,
} = require('./helpers');

// Valores fictícios. `T_SETUP` existe só para montar o cache antes de a linha
// da tabela valer — ele nunca aparece em nenhuma asserção de ordem.
const T_ENV = 'T_ENV';
const T_CFG = 'T_CFG';
const T_EMBUTIDO = 'T_EMBUTIDO';
const C_DEV = 'C_DEV';
const T_SETUP = 'T_SETUP';
const SECRET_OF = { env: T_ENV, config: T_CFG, embutido: T_EMBUTIDO, git: C_DEV };
const ALL_SECRETS = [T_ENV, T_CFG, T_EMBUTIDO, C_DEV, T_SETUP, 'T_OLD', 'T_NEW'];

// ---- setup compartilhado ---------------------------------------------------

async function withRemote(t, accepted) {
  const remote = await startAuthRemote({ accepted });
  // Registrado antes do hub: se makeBareHub estourar, o filho ainda é fechado.
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
    baseURL: opts.baseURL || remote.baseURL,
    // A origem "embutido" no teste é sempre o literal fictício: o marcador de
    // `bin/ahc` entra no BUILD vazio e nenhum teste lê o valor real.
    embeddedToken: opts.embeddedToken !== undefined ? opts.embeddedToken : '',
    ...(opts.envToken !== undefined ? { envToken: opts.envToken } : {}),
    extra: opts.extra,
  });
}

// `cwd` neutro: no hook SessionStart o ahc roda dentro do projeto aberto, e
// nenhum teste pode depender do repo deste checkout.
function ahc(home, args, env, opts = {}) {
  return runAhc(home, args, {
    env,
    cwd: env.PWD,
    input: '',
    timeout: opts.timeout || 60000,
  });
}

function cachePath(home, repo) {
  return path.join(home, '.claude', '.ahc-cache', repo.replace(/[^a-zA-Z0-9._-]/g, '_'));
}

function agentFile(home, name = 'test-agent') {
  return path.join(home, '.claude', 'agents', `${name}.md`);
}

// Estado instalado, para o AC-14 provar que uma falha não mexe em nada.
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

// C9, aplicado a todas as linhas da tabela: nem o valor nem o base64 do
// `x-access-token:<valor>` pode sair em stdout ou stderr.
function assertNoSecretLeak(r) {
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  for (const secret of ALL_SECRETS) {
    assert.ok(!out.includes(secret), `o valor ${secret} vazou para a saída`);
    const basic = Buffer.from(`x-access-token:${secret}`).toString('base64');
    assert.ok(!out.includes(basic), `o base64 de ${secret} vazou para a saída`);
  }
}

// Instala o hub com um token de setup que não participa da tabela, deixando o
// cache já clonado — a condição "hub instalado" do AC-14.
function installBaseline(t, remote, hub, opts = {}) {
  const home = makeHome(t, hub, opts);
  const setupEnv = baselineEnv(home, { baseURL: remote.baseURL, envToken: T_SETUP, embeddedToken: '' });
  const r = ahc(home, ['sync'], setupEnv);
  assert.equal(r.status, 0, `setup do cache deveria sair 0: ${r.stderr}`);
  assert.ok(fs.existsSync(path.join(cachePath(home, hub.repo), '.git')), 'o setup deveria ter clonado o cache');
  remote.clearAuthLog();
  return home;
}

// ---- AC-06: precedência ----------------------------------------------------

const AC06 = [
  { env: T_ENV, config: T_CFG, apresentado: T_ENV, rotulo: 'env + config → env' },
  { env: T_ENV, config: undefined, apresentado: T_ENV, rotulo: 'env sem config → env' },
  { env: undefined, config: T_CFG, apresentado: T_CFG, rotulo: 'só config → config' },
  { env: undefined, config: undefined, apresentado: T_EMBUTIDO, rotulo: 'nenhuma das duas → embutido' },
  { env: '', config: T_CFG, apresentado: T_CFG, rotulo: 'env vazia não é origem → config' },
  { env: undefined, config: '', apresentado: T_EMBUTIDO, rotulo: 'config vazia não é origem → embutido' },
];

for (const row of AC06) {
  test(`AC-06: ${row.rotulo} (sync e list)`, async (t) => {
    // Todas as origens aceitas: o que este AC prova é qual token vai PRIMEIRO.
    const { remote, hub } = await withRemote(t, [T_ENV, T_CFG, T_EMBUTIDO]);
    const home = makeHome(t, hub, { configToken: row.config });
    const env = envFor(home, remote, { envToken: row.env, embeddedToken: T_EMBUTIDO });

    const s = ahc(home, ['sync'], env);
    assert.equal(s.status, 0, `sync deveria sair 0: ${s.stderr}`);
    assert.deepEqual(remote.presentedSecrets(), [row.apresentado], 'token apresentado pelo sync');
    assert.deepEqual(remote.presentedUsers(), ['x-access-token'], 'usuário fixo das rodadas de token');
    assertNoSecretLeak(s);

    remote.clearAuthLog();
    const l = ahc(home, ['list'], env);
    assert.equal(l.status, 0, `list deveria sair 0: ${l.stderr}`);
    assert.deepEqual(remote.presentedSecrets(), [row.apresentado], 'token apresentado pelo list');
    assertNoSecretLeak(l);
  });
}

// ---- AC-14: cascata até uma origem autenticar ------------------------------

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
  },
  {
    rotulo: 'todas as origens recusadas, com credencial git',
    env: T_ENV, config: T_CFG, credHelper: true,
    aceita: [], resultado: 'falha', autenticou: null, recusadas: ['env', 'config', 'embutido', 'git'],
  },
];

for (const row of AC14) {
  test(`AC-14: ${row.rotulo} → ${row.resultado}`, async (t) => {
    // O token de setup entra na lista aceita só para montar o cache; ele sai
    // antes de a linha valer.
    const { remote, hub } = await withRemote(t, [T_SETUP]);
    const home = installBaseline(t, remote, hub, {
      configToken: row.config,
      credHelper: row.credHelper,
    });

    const published = publishAgentVersion(hub, { version: '1.1.0' });
    const before = snapshotArtifacts(home);
    remote.setAccepted(row.aceita);

    const env = envFor(home, remote, { envToken: row.env, embeddedToken: T_EMBUTIDO });
    const r = ahc(home, ['sync'], env);

    // Ordem: as recusadas na ordem da cascata, seguidas da que autenticou.
    const esperado = [
      ...row.recusadas.map((id) => SECRET_OF[id]),
      ...(row.autenticou ? [SECRET_OF[row.autenticou]] : []),
    ];
    assert.deepEqual(
      remote.presentedSecrets(), esperado,
      'credenciais apresentadas, em ordem, e nada depois da que autenticou'
    );
    assertNoSecretLeak(r);

    if (row.resultado === 'sucesso') {
      assert.equal(r.status, 0, `sucesso esperado, saiu ${r.status}: ${r.stderr}`);
      assert.equal(fs.readFileSync(agentFile(home), 'utf8'), published.body, 'o agent novo foi gravado');
      assert.equal(readLock(home).agents['test-agent'].version, '1.1.0', 'o lock registra a versão nova');
    } else {
      assert.notEqual(r.status, 0, 'falha não pode sair 0');
      // Texto literal do §5, entregue pelo T7 (antes era o genérico
      // "offline or unreachable", que não dizia que o acesso foi recusado).
      assert.match(
        r.stderr,
        /\[ahc\] acesso ao hub recusado por todas as origens \(.*\) — mantendo o cache local\. Rode `ahc doctor`\./
      );
      assert.deepEqual(
        snapshotArtifacts(home), before,
        'na falha, artefatos instalados e lock ficam idênticos aos de antes'
      );
      // Nenhuma espera por input, mesmo com stdin fechado e sem
      // GIT_TERMINAL_PROMPT no ambiente (baselineEnv remove a variável).
      assert.equal(r.signal, null, 'o sync não pode ter sido morto por timeout do teste');
      assert.ok(!/Username|Password for/i.test(r.stdout || ''), 'nada pode ter pedido usuário ou senha');
    }
  });
}

test('AC-14: a origem que autentica é a reportada em `refused` (nenhuma posterior é tentada)', async (t) => {
  // Guarda contra a regressão mais sutil da cascata: seguir tentando depois do
  // sucesso. O harness aceita TUDO; se alguma origem posterior fosse
  // apresentada, ela apareceria no log.
  const { remote, hub } = await withRemote(t, [T_ENV, T_CFG, T_EMBUTIDO, C_DEV, T_SETUP]);
  const home = installBaseline(t, remote, hub, { configToken: T_CFG, credHelper: true });

  const env = envFor(home, remote, { envToken: T_ENV, embeddedToken: T_EMBUTIDO });
  const r = ahc(home, ['sync'], env);

  assert.equal(r.status, 0, `sync deveria sair 0: ${r.stderr}`);
  assert.deepEqual(remote.presentedSecrets(), [T_ENV], 'só a primeira origem foi apresentada');
});

// ---- AC-08: troca de token sobre o MESMO cache (premissa F3) ---------------

test('AC-08: T_OLD → T_NEW por env e depois por config, sobre o mesmo cache', async (t) => {
  const { remote, hub } = await withRemote(t, ['T_OLD']);
  const home = makeHome(t, hub);

  // 1. cache clonado com T_OLD.
  const oldEnv = envFor(home, remote, { envToken: 'T_OLD' });
  assert.equal(ahc(home, ['sync'], oldEnv).status, 0, 'o clone com T_OLD deveria passar');
  const cache = cachePath(home, hub.repo);
  const cacheInode = fs.statSync(path.join(cache, '.git')).ino;
  assert.equal(readLock(home).agents['test-agent'].version, '1.0.0');

  // 2. o hub passa a recusar T_OLD e a aceitar só T_NEW; o dev informa T_NEW
  //    por env, sem apagar o cache e sem reinstalar.
  const p1 = publishAgentVersion(hub, { version: '1.1.0' });
  remote.setAccepted(['T_NEW']);
  remote.clearAuthLog();
  const newEnv = envFor(home, remote, { envToken: 'T_NEW' });
  const r1 = ahc(home, ['sync'], newEnv);
  assert.equal(r1.status, 0, `sync com T_NEW por env deveria sair 0: ${r1.stderr}`);
  assert.deepEqual(remote.presentedSecrets(), ['T_NEW']);
  assert.equal(readLock(home).agents['test-agent'].version, '1.1.0');
  assert.equal(fs.readFileSync(agentFile(home), 'utf8'), p1.body);
  assert.equal(
    fs.statSync(path.join(cache, '.git')).ino, cacheInode,
    'o cache é o mesmo: a troca de token não exigiu novo clone'
  );

  // 3. o mesmo por config, sem variável de ambiente.
  const semEnv = envFor(home, remote);
  const cfgWrite = ahc(home, ['config', 'token=T_NEW'], semEnv);
  assert.equal(cfgWrite.status, 0, `ahc config deveria sair 0: ${cfgWrite.stderr}`);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(home, '.claude', '.ahc-config.json'), 'utf8')).token,
    'T_NEW'
  );

  const p2 = publishAgentVersion(hub, { version: '1.2.0' });
  remote.clearAuthLog();
  const r2 = ahc(home, ['sync'], semEnv);
  assert.equal(r2.status, 0, `sync com T_NEW por config deveria sair 0: ${r2.stderr}`);
  assert.deepEqual(remote.presentedSecrets(), ['T_NEW']);
  assert.equal(readLock(home).agents['test-agent'].version, '1.2.0');
  assert.equal(fs.readFileSync(agentFile(home), 'utf8'), p2.body);

  // 4. e os próximos sync/list, ainda sem variável de ambiente, seguem verdes.
  const p3 = publishAgentVersion(hub, { version: '1.3.0' });
  remote.clearAuthLog();
  const r3 = ahc(home, ['sync'], semEnv);
  assert.equal(r3.status, 0, `o sync seguinte deveria sair 0: ${r3.stderr}`);
  assert.equal(readLock(home).agents['test-agent'].version, '1.3.0');
  assert.equal(fs.readFileSync(agentFile(home), 'utf8'), p3.body);
  const l = ahc(home, ['list'], semEnv);
  assert.equal(l.status, 0, `o list seguinte deveria sair 0: ${l.stderr}`);
  assert.match(l.stdout, /test-agent\s+local:1\.3\.0\s+remote:1\.3\.0/);
  assertNoSecretLeak(r3);
  assertNoSecretLeak(l);
});

// ---- AC-04: sync e list em cache existente, sem credencial git -------------

test('AC-04: sync em cache existente grava a versão nova, atualiza o lock e o list mostra', async (t) => {
  // Condição de baseline pura: nenhum credential helper, nenhum env, nenhum
  // token na config — só o embutido, que é o caso do dev do one-liner.
  const { remote, hub } = await withRemote(t, [T_EMBUTIDO]);
  const home = makeHome(t, hub);
  const env = envFor(home, remote, { embeddedToken: T_EMBUTIDO });

  assert.equal(ahc(home, ['sync'], env).status, 0, 'primeiro sync (clone)');
  assert.equal(readLock(home).agents['test-agent'].version, '1.0.0');

  const published = publishAgentVersion(hub, { version: '2.0.0' });
  remote.clearAuthLog();
  const r = ahc(home, ['sync'], env);

  assert.equal(r.status, 0, `sync deveria sair 0: ${r.stderr}`);
  assert.deepEqual(remote.presentedSecrets(), [T_EMBUTIDO], 'autenticou pelo embutido');
  assert.equal(fs.readFileSync(agentFile(home), 'utf8'), published.body);
  assert.equal(readLock(home).agents['test-agent'].version, '2.0.0');

  const l = ahc(home, ['list'], env);
  assert.equal(l.status, 0, `list deveria sair 0: ${l.stderr}`);
  assert.match(l.stdout, /test-agent\s+local:2\.0\.0\s+remote:2\.0\.0/);
});

// ---- C1: escopo da URL completa -------------------------------------------

test('C1: chave com escopo do dev não vence a injeção nem troca a origem da rodada', async (t) => {
  const { remote, hub } = await withRemote(t, [C_DEV]);
  const home = makeHome(t, hub, { configToken: T_CFG, credHelper: true });

  // O dev tem um header com escopo de base E um credential helper com escopo
  // de URL (o formato que o `gh auth setup-git` grava). Sem o escopo da URL
  // completa nas nossas chaves, as rodadas de token apresentariam C_DEV e a
  // ordem e os rótulos do AC-14 ficariam falsos.
  const gitEnv = isolatedGitEnv(home);
  const devBasic = Buffer.from(`dev:${C_DEV}`).toString('base64');
  git(['config', '--global', `http.${remote.baseURL}/.extraHeader`, `Authorization: Basic ${devBasic}`], { env: gitEnv });
  git(['config', '--global', `credential.${remote.baseURL}.helper`, require('./helpers').CRED_HELPER], { env: gitEnv });

  const env = envFor(home, remote, { envToken: T_ENV, embeddedToken: T_EMBUTIDO });
  const r = ahc(home, ['sync'], env);

  assert.equal(r.status, 0, `a credencial do dev deveria autenticar no fim: ${r.stderr}`);
  assert.deepEqual(
    remote.presentedSecrets(),
    [T_ENV, T_CFG, T_EMBUTIDO, C_DEV],
    'as rodadas de token apresentam só o token da origem; a rodada git apresenta C_DEV'
  );
  assert.deepEqual(
    remote.presentedUsers().slice(0, 3),
    ['x-access-token', 'x-access-token', 'x-access-token'],
    'as três primeiras rodadas são de token, não do helper do dev'
  );
});

// ---- C3: nada de token para host reescrito por insteadOf -------------------

test('C3: host reescrito por insteadOf não recebe nenhum token da cascata', async (t) => {
  const { remote: rewritten } = await withRemote(t, []); // servidor B
  const { remote, hub } = await withRemote(t, []);       // servidor A (a base)

  const home = makeHome(t, hub, { configToken: T_CFG });
  git(['config', '--global', `url.${rewritten.baseURL}/.insteadOf`, `${remote.baseURL}/`], {
    env: isolatedGitEnv(home),
  });

  const env = envFor(home, remote, { envToken: T_ENV, embeddedToken: T_EMBUTIDO });
  const r = ahc(home, ['sync'], env);

  assert.notEqual(r.status, 0, 'o repo não existe no host B: o sync falha');
  assert.deepEqual(
    rewritten.authHeaders(), [],
    'o host reescrito não pode receber nenhum Authorization (C3/E4b)'
  );
  assert.deepEqual(remote.authHeaders(), [], 'e a base nem chegou a ser contatada');
  assertNoSecretLeak(r);
});

// ---- C2: sem seguir redirect nas rodadas de token -------------------------

// Servidor mínimo que responde 302 para outro host e registra o que recebeu.
// Processo filho pelo mesmo motivo do harness: `runAhc` usa spawnSync e
// bloquearia um servidor no processo de teste.
function startRedirectServer(t, target) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-redirect-'));
  const logFile = path.join(dir, 'authorization.log');
  fs.writeFileSync(logFile, '');
  const code = `
    const http = require('http');
    const fs = require('fs');
    const target = process.env.REDIRECT_TARGET;
    const log = process.env.REDIRECT_LOG;
    const s = http.createServer((req, res) => {
      if (req.headers.authorization) fs.appendFileSync(log, req.headers.authorization.trim() + '\\n');
      req.resume();
      res.writeHead(302, { Location: target + req.url });
      res.end();
    });
    s.listen(0, '127.0.0.1', () => process.stdout.write(JSON.stringify({ port: s.address().port }) + '\\n'));
  `;
  const child = spawn(process.execPath, ['-e', code], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH, REDIRECT_TARGET: target, REDIRECT_LOG: logFile },
  });
  t.after(() => { try { child.kill('SIGKILL'); } catch { /* já morreu */ } rmrf(dir); });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('redirect server não subiu')); }, 10000);
    let buf = '';
    child.stdout.on('data', (c) => {
      buf += c.toString();
      if (!buf.includes('\n')) return;
      clearTimeout(timer);
      const { port } = JSON.parse(buf.slice(0, buf.indexOf('\n')));
      resolve({
        baseURL: `http://127.0.0.1:${port}`,
        authHeaders: () => fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean),
      });
    });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

test('C2: um 302 não leva o token ao host de destino e não avança a cascata', async (t) => {
  const { remote, hub } = await withRemote(t, [T_ENV, T_CFG, T_EMBUTIDO]);
  const redirector = await startRedirectServer(t, remote.baseURL);

  const home = makeHome(t, hub, { configToken: T_CFG });
  // A base é o redirecionador; ele manda para o harness real.
  const env = envFor(home, remote, {
    baseURL: redirector.baseURL,
    envToken: T_ENV,
    embeddedToken: T_EMBUTIDO,
  });

  const r = ahc(home, ['sync'], env);

  assert.notEqual(r.status, 0, 'com redirect recusado o sync falha');
  assert.match(r.stderr, /redirect recusado/, 'a classe da falha é `redirect`, não recusa de credencial');
  assert.deepEqual(
    remote.authHeaders(), [],
    'o host de destino do redirect não pode receber nenhuma requisição com Authorization'
  );
  assert.equal(
    redirector.authHeaders().length, 1,
    'a cascata para na hora: só a primeira origem foi apresentada'
  );
  assertNoSecretLeak(r);
});

// ---- C8: token só no modo git ---------------------------------------------

test('C8: repo em modo http (fetchURL) nunca recebe Authorization', async (t) => {
  const { remote } = await withRemote(t, [T_ENV, T_CFG, T_EMBUTIDO]);
  const home = makeTmpHome();
  t.after(() => rmrf(home));
  // `http://…` sai do modo git e vai por `fetchURL` — o caminho das fixtures
  // (AC-13). Nenhum token pode acompanhar essas requisições.
  writeConfig(home, { repo: `${remote.baseURL}/`, branch: 'main', channel: 'stable', token: T_CFG });

  const env = baselineEnv(home, {
    baseURL: remote.baseURL,
    envToken: T_ENV,
    embeddedToken: T_EMBUTIDO,
  });
  const r = ahc(home, ['sync'], env);

  assert.notEqual(r.status, 0, 'o harness exige credencial e nenhuma é enviada por fetchURL');
  assert.match(r.stderr, /HTTP 401/, 'a requisição chegou ao harness e voltou 401 — sem Authorization');
  assert.deepEqual(remote.authHeaders(), [], 'o harness não registrou nenhum Authorization');
  assertNoSecretLeak(r);
});

// ---- C14: integridade preservada no refactor ------------------------------

test('C14: sha256 divergente do manifest não é gravado, qualquer que seja a origem', async (t) => {
  const { remote, hub } = await withRemote(t, [T_EMBUTIDO]);
  const home = makeHome(t, hub);
  const env = envFor(home, remote, { embeddedToken: T_EMBUTIDO });

  assert.equal(ahc(home, ['sync'], env).status, 0, 'primeiro sync (clone)');
  const instalado = fs.readFileSync(agentFile(home), 'utf8');
  const lockAntes = readLock(home).agents['test-agent'];

  // O hub publica um agent cujo conteúdo diverge do sha do manifest.
  const rel = 'agents/test-agent.md';
  fs.writeFileSync(path.join(hub.workDir, rel), 'conteudo adulterado no transporte\n');
  const manifestPath = path.join(hub.workDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const entry = manifest.agents.find((a) => a.name === 'test-agent');
  entry.version = '9.9.9';
  entry.sha256 = sha256('o conteudo que o manifest promete\n');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  git(['-C', hub.workDir, 'add', '-A'], { env: hub.env });
  git(['-C', hub.workDir, 'commit', '-q', '-m', 'agent divergente do manifest'], { env: hub.env });
  git(['-C', hub.workDir, 'push', '-q', hub.barePath, `HEAD:refs/heads/${hub.branch}`], { env: hub.env });

  remote.clearAuthLog();
  const r = ahc(home, ['sync'], env);

  assert.deepEqual(remote.presentedSecrets(), [T_EMBUTIDO], 'autenticou pelo embutido');
  assert.match(r.stderr, /hash mismatch/, 'a verificação sha256 continua valendo depois do refactor');
  assert.equal(fs.readFileSync(agentFile(home), 'utf8'), instalado, 'o arquivo não pode ser sobrescrito');
  assert.deepEqual(readLock(home).agents['test-agent'], lockAntes, 'o lock do item não muda');
});

// ---- C4: classificação fechada, por teste unitário ------------------------

const ahcModule = require(AHC_BIN);

function gitError(stderr) {
  const e = new Error('Command failed: git');
  e.status = 128;
  e.stderr = Buffer.from(stderr);
  return e;
}

test('C4: `remote: Authentication failed` seguido de erro de conexão é rede', () => {
  // A linha `remote:` é texto do servidor. Se ela contasse, um servidor que
  // devolve esse texto antes de a conexão cair faria a cascata avançar e
  // apresentar todas as origens numa falha que é de rede.
  const e = gitError(
    "remote: Authentication failed for 'http://127.0.0.1:1/o/r.git'\n" +
    "fatal: unable to access 'http://127.0.0.1:1/o/r.git': Failed to connect to 127.0.0.1 port 1: Connection refused\n"
  );
  for (const round of ['token', 'git']) {
    const c = ahcModule.classifyGitFailure(e, round);
    assert.equal(c.kind, 'network', `rodada ${round}: deveria ser rede`);
    assert.equal(c.advance, false, 'rede não avança a cascata');
  }
});

test('C4: texto arbitrário é desconhecido e não avança', () => {
  const c = ahcModule.classifyGitFailure(gitError('fatal: alguma coisa que ninguém previu\n'), 'token');
  assert.equal(c.kind, 'unknown');
  assert.equal(c.advance, false, 'desconhecido não avança a cascata');
});

test('C4: stderr sem nenhuma linha fatal:/error: também é desconhecido', () => {
  const c = ahcModule.classifyGitFailure(gitError('remote: Authentication failed\nwarning: algo\n'), 'token');
  assert.equal(c.kind, 'unknown');
  assert.equal(c.advance, false);
});

const C4_AVANCA = [
  ['401 sem credencial utilizável', "fatal: could not read Username for 'http://h': terminal prompts disabled", 'refused', 'unavailable'],
  ['401 com credencial', "fatal: Authentication failed for 'http://h/o/r.git'", 'refused', 'refused'],
  ['403 do GitHub', "fatal: unable to access 'http://h/o/r.git': The requested URL returned error: 403", 'refused', 'refused'],
  ['403 sem leitura do repo', 'error: Write access to repository not granted.', 'refused', 'refused'],
  ['404', "fatal: repository 'http://h/o/r.git' not found", 'refused', 'notfound'],
];

for (const [rotulo, linha, kindToken, kindGit] of C4_AVANCA) {
  test(`C4: ${rotulo} — recusa na rodada de token, ${kindGit} na rodada git`, () => {
    const token = ahcModule.classifyGitFailure(gitError(`${linha}\n`), 'token');
    assert.equal(token.kind, kindToken);
    assert.equal(token.advance, true, 'recusa de auth avança a cascata');
    const dev = ahcModule.classifyGitFailure(gitError(`${linha}\n`), 'git');
    assert.equal(dev.kind, kindGit);
    assert.equal(dev.advance, false, 'a rodada git é a última: nada avança depois dela');
  });
}

const C4_PARA = [
  ['redirect', "fatal: unable to access 'http://h/o/r.git': The requested URL returned error: 302", 'redirect'],
  ['DNS', "fatal: unable to access 'http://h/o/r.git': Could not resolve host: h", 'network'],
  ['TLS', "fatal: unable to access 'https://h/o/r.git': SSL certificate problem: self signed certificate", 'network'],
];

for (const [rotulo, linha, kind] of C4_PARA) {
  test(`C4: ${rotulo} não avança a cascata`, () => {
    const c = ahcModule.classifyGitFailure(gitError(`${linha}\n`), 'token');
    assert.equal(c.kind, kind);
    assert.equal(c.advance, false);
  });
}

test('C4: morto pelo teto de relógio do ahc conta como rede', () => {
  const e = new Error('spawnSync git ETIMEDOUT');
  e.killed = true;
  e.signal = 'SIGTERM';
  assert.equal(ahcModule.classifyGitFailure(e, 'token').kind, 'network');
});

// ---- T6b: branch inexistente tem linha própria na classificação ------------
//
// Achado do E1 contra o GitHub real (2026-09-15): `branch` inexistente responde
// `fatal: couldn't find remote ref refs/heads/<branch>`, forma que a tabela do
// §5 não previa. Caía em `unknown` — parava a cascata, que é o certo (não é
// falha de credencial), mas entregava ao dev "falha não classificada".

const C4_NOREF = [
  ['fetch (forma medida no E1)', "fatal: couldn't find remote ref refs/heads/nao-existe"],
  // Mesmo diagnóstico pelo outro caminho do gitRefresh: o clone do cache novo.
  ['clone', 'fatal: Remote branch nao-existe not found in upstream origin'],
];

for (const [rotulo, linha] of C4_NOREF) {
  test(`T6b: branch inexistente no ${rotulo} é 'noref' e não avança a cascata`, () => {
    for (const round of ['token', 'git']) {
      const c = ahcModule.classifyGitFailure(gitError(`${linha}\n`), round);
      assert.equal(c.kind, 'noref', `rodada ${round}: deveria ser noref, não o balde unknown`);
      assert.equal(
        c.advance, false,
        'a credencial autenticou — apresentar as seguintes só repetiria a mesma resposta'
      );
      assert.equal(c.detail, linha, 'o detalhe preserva a linha do git');
    }
  });
}

test('T6b: a mensagem ao dev diz que a branch não existe no repo', () => {
  const c = ahcModule.classifyGitFailure(
    gitError("fatal: couldn't find remote ref refs/heads/nao-existe\n"), 'token'
  );
  assert.equal(
    ahcModule.accessWhat(c),
    "a branch não existe no repo (fatal: couldn't find remote ref refs/heads/nao-existe)"
  );
  // Guarda do que motivou o T6b: a mensagem antiga não explicava nada.
  assert.doesNotMatch(ahcModule.accessWhat(c), /não classificada/);
});

test('T6b: sync sobre cache existente com branch inexistente — mensagem e cascata parada', async (t) => {
  const { remote, hub } = await withRemote(t, [T_ENV, T_SETUP]);
  const home = installBaseline(t, remote, hub, { configToken: T_CFG });
  // O cache está clonado na branch boa; só a config passa a apontar para uma
  // branch que não existe no remoto (o nome é válido para o git).
  writeConfig(home, { repo: hub.repo, branch: 'nao-existe', channel: 'stable', token: T_CFG });

  const env = envFor(home, remote, { envToken: T_ENV, embeddedToken: T_EMBUTIDO });
  const r = ahc(home, ['sync'], env);

  assert.notEqual(r.status, 0, 'branch inexistente não pode sair 0');
  assert.match(r.stderr, /a branch não existe no repo/, 'a mensagem nomeia o que houve');
  assert.match(r.stderr, new RegExp(`${hub.repo}@nao-existe`), 'e diz qual repo@branch');
  assert.doesNotMatch(r.stderr, /recusado por todas as origens/, 'não é falha de credencial');
  assert.deepEqual(
    remote.presentedSecrets(), [T_ENV],
    'a origem autenticou: nenhuma origem seguinte é apresentada'
  );
  assertNoSecretLeak(r);
});

test('T6b: clone inicial com branch inexistente também explica a branch', async (t) => {
  const { remote, hub } = await withRemote(t, [T_EMBUTIDO]);
  const home = makeHome(t, hub);
  writeConfig(home, { repo: hub.repo, branch: 'nao-existe', channel: 'stable' });

  const env = envFor(home, remote, { embeddedToken: T_EMBUTIDO });
  const r = ahc(home, ['sync'], env);

  assert.notEqual(r.status, 0, 'branch inexistente não pode sair 0');
  assert.match(r.stderr, /a branch não existe no repo/);
  assert.deepEqual(remote.presentedSecrets(), [T_EMBUTIDO], 'sem avançar para a credencial git');
  assertNoSecretLeak(r);
});

test('T6b: list e doctor renderizam a mesma causa, com a dica da branch', async (t) => {
  const { remote, hub } = await withRemote(t, [T_EMBUTIDO, T_SETUP]);
  const home = installBaseline(t, remote, hub);
  writeConfig(home, { repo: hub.repo, branch: 'nao-existe', channel: 'stable' });
  const env = envFor(home, remote, { embeddedToken: T_EMBUTIDO });

  // `list` tolera hub inalcançável (exit 0), mas não pode ficar mudo sobre o
  // motivo de a coluna `remote:` vir vazia.
  const l = ahc(home, ['list'], env);
  assert.equal(l.status, 0, `list segue mostrando o local: ${l.stderr}`);
  assert.match(l.stderr, /a branch não existe no repo/);
  assertNoSecretLeak(l);

  const d = ahc(home, ['doctor'], env);
  assert.equal(d.status, 1, `doctor deveria sair 1: ${d.stdout}\n${d.stderr}`);
  assert.match(
    d.stdout,
    new RegExp(`^✗ git auth — ${hub.repo}@nao-existe: a branch não existe no repo \\(.*\\); outras origens não tentadas$`, 'm'),
    `faltou o ✗ com a causa:\n${d.stdout}`
  );
  assert.match(
    d.stdout,
    /^ {2}→ Confira o nome da branch no repo e corrija com `ahc config branch=<branch>`$/m,
    `faltou a dica da branch:\n${d.stdout}`
  );
  assertNoSecretLeak(d);
});

// ---- credentialSources: ordem e origens vazias -----------------------------

test('credentialSources: ordem env → config → embutido → git, sem as vazias', () => {
  const antes = process.env.AHC_GITHUB_TOKEN;
  try {
    process.env.AHC_GITHUB_TOKEN = T_ENV;
    assert.deepEqual(
      ahcModule.credentialSources({ token: T_CFG }).map((s) => s.id),
      ['env', 'config', 'git'],
      'o embutido deste checkout está vazio: origem ausente'
    );
    process.env.AHC_GITHUB_TOKEN = '';
    assert.deepEqual(ahcModule.credentialSources({ token: T_CFG }).map((s) => s.id), ['config', 'git']);
    delete process.env.AHC_GITHUB_TOKEN;
    assert.deepEqual(ahcModule.credentialSources({ token: '' }).map((s) => s.id), ['git']);
    assert.deepEqual(ahcModule.credentialSources({}).map((s) => s.id), ['git']);
    // C11: token que não é string não vira origem.
    assert.deepEqual(ahcModule.credentialSources({ token: 123 }).map((s) => s.id), ['git']);
    assert.deepEqual(ahcModule.credentialSources({ token: { a: 1 } }).map((s) => s.id), ['git']);
  } finally {
    if (antes === undefined) delete process.env.AHC_GITHUB_TOKEN;
    else process.env.AHC_GITHUB_TOKEN = antes;
  }
});

test('tokenConfigEntries: escopo da URL completa, reset do helper e followRedirects=false', () => {
  const url = 'https://github.com/EMS-NCTECH/agents-hub-claude.git';
  const entries = ahcModule.tokenConfigEntries(url, 'T_X');
  assert.deepEqual(entries.map(([k]) => k), [
    'credential.helper',
    `http.${url}.extraHeader`,
    `http.${url}.extraHeader`,
    `http.${url}.followRedirects`,
  ]);
  assert.equal(entries[0][1], '', 'o reset do credential.helper é genérico de propósito (E3b)');
  assert.equal(entries[1][1], '', 'o primeiro extraHeader zera a lista multi-valorada do dev');
  assert.equal(
    entries[2][1],
    `Authorization: Basic ${Buffer.from('x-access-token:T_X').toString('base64')}`
  );
  assert.equal(entries[3][1], 'false');
  assert.ok(
    !entries.some(([k]) => k === 'http.extraHeader' || k === 'http.followRedirects'),
    'nenhuma chave http genérica: ela acompanharia a URL reescrita por insteadOf (C3)'
  );
});
