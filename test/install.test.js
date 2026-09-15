// Testes de integração do `install.sh` real (T9 de 001-ahc-pat-auth).
//
// O que este arquivo isola:
//   - AC-15: reinstalar (rodar o one-liner de novo) preserva o `token` já
//     gravado na config e as chaves que o instalador não conhece, e atualiza
//     `repo`, `branch` e `channel` para os valores desta execução;
//   - a parte do instalador do AC-11 / C11: toda config escrita pelo
//     instalador termina em modo 600 — inclusive sob `umask 000` — e o
//     `ahc doctor` não reporta ✗ nem ⚠ em `config file permission`;
//     config com JSON inválido não é sobrescrita e o instalador sai ≠ 0;
//   - a parte do AC-03 que cabe no T9: a primeira sync deixou de ter
//     `|| true`, então uma sync que falha faz o instalador sair ≠ 0 e **não**
//     imprimir `[ahc] done`.
//
// E o T10 acrescentou a cascata de origens em bash:
//   - AC-02: HOME limpo, sem nenhuma credencial git, com o remoto aceitando
//     **só** o token embutido — a instalação tem que terminar completa;
//   - AC-03: com todas as origens recusadas, o instalador sai ≠ 0, não imprime
//     `[ahc] done` e diz que o acesso foi recusado;
//   - AC-14: a tabela da cascata aplicada ao `install.sh`, com a ordem do log
//     de `Authorization` no harness **idêntica** à do `ahc sync`, e os mesmos
//     rótulos de origem na mensagem de falha.
//
// E o T10b fechou os dois controles do §7 que tinham ficado sem prova:
//   - C4: o locale de quem instala não chega ao git e não muda a
//     classificação da falha;
//   - C5: `GIT_DIR`/`GIT_WORK_TREE` herdados não fazem o instalador tocar o
//     repo de trabalho do dev.
//
// Nenhum token real aparece: todos os valores de credencial são literais
// fictícios e o único remoto é o harness em 127.0.0.1.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  startAuthRemote,
  makeBareHub,
  publishAgentVersion,
  makeTmpHome,
  baselineEnv,
  installCredHelper,
  runInstall,
  runAhc,
  git,
  rmrf,
  CRED_HELPER,
} = require('./helpers');

// Valores fictícios, nunca um PAT real.
const C_DEV = 'C_DEV';
const T_CFG = 'T_CFG_FICTICIO';

// Os mesmos literais de `test/auth-cascade.test.js` (`SECRET_OF`): a paridade
// entre a cascata em bash e a do `bin/ahc` é comparada por estes valores.
const SECRET_OF = { env: 'T_ENV', config: 'T_CFG', embutido: 'T_EMBUTIDO', git: C_DEV };
const T_EMBUTIDO = SECRET_OF.embutido;
const ALL_SECRETS = [SECRET_OF.env, SECRET_OF.config, T_EMBUTIDO, C_DEV, T_CFG];

const IS_WIN = process.platform === 'win32';

let remote;
let hub;

test.before(async () => {
  remote = await startAuthRemote({ accepted: [C_DEV] });
  hub = makeBareHub(remote);
});

test.after(async () => {
  if (hub) hub.cleanup();
  if (remote) await remote.close();
});

// ---- helpers locais --------------------------------------------------------
// Definidos aqui de propósito: `test/helpers.js` é território de outra tarefa.

function configPath(home) {
  return path.join(home, '.claude', '.ahc-config.json');
}

function modeOf(p) {
  return fs.statSync(p).mode & 0o777; // & 0o777 descarta os bits de tipo
}

function readConfig(home) {
  return JSON.parse(fs.readFileSync(configPath(home), 'utf8'));
}

// Escreve a config SEM passar pelo ahc nem pelo instalador — é o arquivo que
// já está na máquina do dev quando ele roda o one-liner de novo.
function seedConfig(home, cfg, mode) {
  const p = configPath(home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof cfg === 'string' ? cfg : JSON.stringify(cfg, null, 2) + '\n');
  if (!IS_WIN) fs.chmodSync(p, mode);
}

// HOME temporário já com a credencial git do dev (C_DEV) disponível: é assim
// que o clone do instalador chega ao harness enquanto a cascata em bash (T10)
// não existe.
function makeHomeWithCred(t) {
  const home = makeTmpHome();
  t.after(() => rmrf(home));
  installCredHelper(home, { username: 'dev' });
  return home;
}

function install(home, opts = {}) {
  const r = runInstall(home, {
    baseURL: remote.baseURL,
    repo: opts.repo || hub.repo,
    branch: opts.branch || hub.branch,
    ...opts,
  });
  return { r, out: `${r.stdout || ''}${r.stderr || ''}` };
}

function doctorConfigLine(home) {
  const r = runAhc(home, ['doctor'], {
    env: baselineEnv(home, { baseURL: remote.baseURL }),
    input: '',
    timeout: 30000,
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const line = out
    .split('\n')
    .find((l) => l.includes('config file permission') && !l.startsWith('  '));
  assert.ok(line, `o doctor não reportou o check 'config file permission':\n${out}`);
  return line;
}

function assertConfigCheckClean(home) {
  const line = doctorConfigLine(home);
  assert.ok(
    !line.includes('✗') && !line.includes('⚠'),
    `'config file permission' deveria estar limpo, veio: ${line}`
  );
}

// Publica um commit arbitrário no hub bare (usado para quebrar o manifest).
function publishRaw(targetHub, rel, content, message) {
  const p = path.join(targetHub.workDir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  git(['-C', targetHub.workDir, 'add', '-A'], { env: targetHub.env });
  git(['-C', targetHub.workDir, 'commit', '-q', '-m', message], { env: targetHub.env });
  git(
    ['-C', targetHub.workDir, 'push', '-q', targetHub.barePath, `HEAD:refs/heads/${targetHub.branch}`],
    { env: targetHub.env }
  );
}

// ---- AC-15 — reinstalação mantém o token da config -------------------------

test('AC-15: reinstalar preserva o token e as chaves desconhecidas, e atualiza repo/branch/channel', (t) => {
  const home = makeHomeWithCred(t);

  // Given: config com token, modo 600 e repo/branch/channel DIFERENTES dos que
  // o instalador vai gravar. A chave extra representa o que uma versão futura
  // do ahc (ou o próprio dev) tenha escrito ali.
  seedConfig(
    home,
    {
      repo: 'EMS-NCTECH/repo-antigo',
      branch: 'branch-antiga',
      channel: 'beta',
      token: T_CFG,
      preferencia_futura: 'preservar',
    },
    0o600
  );

  // When: o one-liner da wiki roda de novo.
  const { r, out } = install(home);
  assert.equal(r.status, 0, `install.sh deveria sair 0:\n${out}`);
  assert.match(out, /\[ahc\] done/, `faltou a linha de conclusão:\n${out}`);

  // Then: o token continua lá...
  const cfg = readConfig(home);
  assert.equal(cfg.token, T_CFG, 'o token da config foi perdido na reinstalação');
  assert.equal(cfg.preferencia_futura, 'preservar', 'chave desconhecida foi descartada no merge');

  // ...e repo/branch/channel passaram a ser os desta execução.
  assert.equal(cfg.repo, hub.repo);
  assert.equal(cfg.branch, hub.branch);
  assert.equal(cfg.channel, 'stable');

  // E o arquivo continua com modo 600.
  if (!IS_WIN) assert.equal(modeOf(configPath(home)), 0o600, 'a config deveria terminar em 600');

  // E o doctor não contradiz o instalador.
  assertConfigCheckClean(home);
});

// ---- AC-11 / C11 — permissão da config escrita pelo instalador -------------

test('AC-11: config criada do zero pelo instalador termina em 600 e o doctor fica limpo', (t) => {
  const home = makeHomeWithCred(t);
  assert.ok(!fs.existsSync(configPath(home)), 'o HOME de teste deveria começar sem config');

  const { r, out } = install(home);
  assert.equal(r.status, 0, `install.sh deveria sair 0:\n${out}`);

  const cfg = readConfig(home);
  assert.equal(cfg.repo, hub.repo);
  assert.equal(cfg.branch, hub.branch);
  assert.equal(cfg.channel, 'stable');

  if (!IS_WIN) assert.equal(modeOf(configPath(home)), 0o600);
  assertConfigCheckClean(home);
});

test('C11: com umask 000 a config escrita pelo instalador ainda termina em 600', { skip: IS_WIN }, (t) => {
  const home = makeHomeWithCred(t);
  seedConfig(home, { repo: 'EMS-NCTECH/repo-antigo', branch: 'x', channel: 'beta', token: T_CFG }, 0o600);

  const previous = process.umask(0o000);
  let result;
  try {
    result = install(home);
  } finally {
    process.umask(previous);
  }

  assert.equal(result.r.status, 0, `install.sh deveria sair 0:\n${result.out}`);
  assert.equal(readConfig(home).token, T_CFG);
  assert.equal(
    modeOf(configPath(home)),
    0o600,
    'o umask do dev não pode afrouxar o modo final da config'
  );
  assertConfigCheckClean(home);
});

test('C11: config com JSON inválido não é sobrescrita e o instalador sai ≠ 0', (t) => {
  const home = makeHomeWithCred(t);
  const invalid = '{ "token": "' + T_CFG + '", "branch": ';
  seedConfig(home, invalid, 0o600);

  const { r, out } = install(home);

  assert.notEqual(r.status, 0, `install.sh deveria falhar com config inválida:\n${out}`);
  assert.doesNotMatch(out, /\[ahc\] done/, 'não pode reportar conclusão com a config intacta e inválida');
  assert.match(out, /não é JSON válido/, `faltou a instrução ao dev:\n${out}`);
  assert.equal(
    fs.readFileSync(configPath(home), 'utf8'),
    invalid,
    'a config inválida deveria ficar byte a byte igual (apagá-la levaria o token junto)'
  );
});

// ---- Preflight de versão do git --------------------------------------------

test('preflight: git abaixo de 2.31 aborta antes de escrever qualquer coisa', (t) => {
  const home = makeTmpHome();
  t.after(() => rmrf(home));

  // Shim que se declara 2.30.2 e grita se for usado para qualquer outra coisa:
  // o preflight tem que barrar antes do primeiro comando de git de verdade.
  const shimDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ahc-test-gitshim-'));
  t.after(() => rmrf(shimDir));
  const shim = path.join(shimDir, 'git');
  fs.writeFileSync(
    shim,
    '#!/usr/bin/env bash\n' +
      'if [ "${1:-}" = "--version" ]; then echo "git version 2.30.2"; exit 0; fi\n' +
      'echo "shim: o instalador não podia ter chamado git $*" >&2\n' +
      'exit 97\n'
  );
  fs.chmodSync(shim, 0o755);

  const env = baselineEnv(home, {
    baseURL: remote.baseURL,
    extra: { PATH: `${shimDir}${path.delimiter}${process.env.PATH}` },
  });
  const r = runInstall(home, { env, repo: hub.repo, branch: hub.branch });
  const out = `${r.stdout || ''}${r.stderr || ''}`;

  assert.notEqual(r.status, 0, `o instalador deveria recusar git 2.30.2:\n${out}`);
  assert.match(out, /git >= 2\.31/, `a mensagem deveria dizer a versão exigida:\n${out}`);
  assert.match(out, /2\.30\.2/, `a mensagem deveria dizer a versão encontrada:\n${out}`);
  assert.doesNotMatch(out, /\[ahc\] done/, 'não pode reportar conclusão');
  assert.doesNotMatch(out, /shim: o instalador/, 'nenhum git de verdade podia ter rodado');

  assert.ok(!fs.existsSync(path.join(home, '.local', 'bin', 'ahc')), 'não podia ter instalado o CLI');
  assert.ok(!fs.existsSync(configPath(home)), 'não podia ter escrito a config');
  assert.ok(!fs.existsSync(path.join(home, '.claude', '.ahc-cache')), 'não podia ter criado o cache');
});

// ---- AC-03 (parte do T9) — sync que falha não vira sucesso -----------------

test('AC-03: primeira sync que falha ⇒ exit ≠ 0 e nenhuma linha de conclusão', async (t) => {
  // Hub separado, para não contaminar o hub bom dos demais testes. O manifest
  // quebrado faz o `ahc sync` real falhar DEPOIS do clone: é exatamente o
  // ponto que o `|| true` escondia.
  const brokenHub = makeBareHub(remote, { repo: 'EMS-NCTECH/agents-hub-quebrado' });
  t.after(() => brokenHub.cleanup());
  publishRaw(brokenHub, 'manifest.json', '{ "version": ', 'manifest quebrado');

  const home = makeHomeWithCred(t);
  const { r, out } = install(home, { repo: brokenHub.repo, branch: brokenHub.branch });

  assert.notEqual(r.status, 0, `install.sh deveria propagar a falha da sync:\n${out}`);
  assert.doesNotMatch(out, /\[ahc\] done/, `a linha de conclusão não pode sair com a sync falhando:\n${out}`);
  assert.match(out, /primeira sincroniza/i, `faltou dizer que a sync falhou:\n${out}`);

  // O clone e a cópia do CLI foram bem-sucedidos — o que falhou foi a sync,
  // e não uma etapa anterior. Sem isto o teste passaria por qualquer motivo.
  const binDir = path.join(home, '.local', 'bin');
  assert.ok(fs.existsSync(path.join(binDir, 'ahc')), `o CLI deveria ter sido instalado antes da sync:\n${out}`);
  assert.match(out, /\[ahc\] running first sync/, `a sync deveria ter sido tentada:\n${out}`);
});

// ===========================================================================
// T10 — cascata de origens em bash
// ===========================================================================

// ---- helpers da cascata ----------------------------------------------------

// Remoto e hub exclusivos do teste: a lista de credenciais aceitas muda por
// linha da tabela e não pode vazar para os testes vizinhos.
async function withRemote(t, accepted) {
  const ownRemote = await startAuthRemote({ accepted });
  t.after(() => ownRemote.close());
  const ownHub = makeBareHub(ownRemote);
  t.after(() => ownHub.cleanup());
  return { remote: ownRemote, hub: ownHub };
}

// HOME na condição de baseline (CB): sem credencial git, sem config, sem
// `AHC_GITHUB_TOKEN`. `credHelper` e `configToken` acrescentam origens.
function makeCascadeHome(t, opts = {}) {
  const home = makeTmpHome();
  t.after(() => rmrf(home));
  if (opts.credHelper) installCredHelper(home, { username: 'dev' });
  if (opts.configToken !== undefined) {
    // Config "de antes": repo/branch propositalmente diferentes dos que o
    // instalador vai gravar, para o token ser a única coisa que sobrevive.
    seedConfig(
      home,
      { repo: 'EMS-NCTECH/repo-antigo', branch: 'branch-antiga', channel: 'beta', token: opts.configToken },
      0o600
    );
  }
  return home;
}

function cascadeEnv(home, ownRemote, opts = {}) {
  return baselineEnv(home, {
    baseURL: ownRemote.baseURL,
    // O marcador `AHC-EMBEDDED-TOKEN` entra no BUILD vazio; a origem
    // "embutido" nos testes é sempre este literal fictício.
    embeddedToken: opts.embeddedToken !== undefined ? opts.embeddedToken : T_EMBUTIDO,
    ...(opts.envToken !== undefined ? { envToken: opts.envToken } : {}),
  });
}

function runCascadeInstall(home, ownRemote, ownHub, opts = {}) {
  const r = runInstall(home, {
    env: cascadeEnv(home, ownRemote, opts),
    repo: ownHub.repo,
    branch: ownHub.branch,
    timeout: 90000,
  });
  return { r, out: `${r.stdout || ''}${r.stderr || ''}` };
}

// C9: nenhum valor de token, nem o base64 de `x-access-token:<valor>`, pode
// aparecer na saída do instalador.
function assertNoSecretLeak(out) {
  for (const secret of ALL_SECRETS) {
    const basic = Buffer.from(`x-access-token:${secret}`).toString('base64');
    assert.ok(!out.includes(basic), `o base64 de ${secret} vazou para a saída do instalador`);
  }
  assert.ok(
    !/Authorization: Basic [A-Za-z0-9+/=]/.test(out),
    `um header Authorization completo vazou para a saída:\n${out}`
  );
}

function assertNoPrompt(r, out) {
  assert.equal(r.signal, null, 'o instalador não pode ter sido morto por timeout do teste');
  assert.ok(!/Username for|Password for/i.test(out), `nada pode ter pedido usuário ou senha:\n${out}`);
}

// A lista de rótulos entre parênteses da mensagem "recusado por todas as
// origens". É o que compara instalador e `ahc sync`.
// Leitura com contagem de parênteses: os próprios rótulos têm parênteses
// (`env (AHC_GITHUB_TOKEN)`), e o `sync` ainda embrulha a mensagem em outro par.
// Nem um regex guloso nem um preguiçoso acertam os dois lados.
function refusedLabels(out) {
  const marca = 'recusado por todas as origens (';
  const i = out.indexOf(marca);
  if (i === -1) return null;
  let depth = 1;
  let acc = '';
  for (let j = i + marca.length; j < out.length; j += 1) {
    const ch = out[j];
    if (ch === '\n') return null;
    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) return acc;
    }
    acc += ch;
  }
  return null;
}

// ---- AC-02 — instalação completa só com o token embutido -------------------

test('AC-02: HOME limpo, remoto aceitando só T_EMBUTIDO ⇒ instalação completa sem credencial git', async (t) => {
  const { remote: own, hub: ownHub } = await withRemote(t, [T_EMBUTIDO]);
  // CB estrita: sem credential helper, sem config prévia, sem AHC_GITHUB_TOKEN.
  const home = makeCascadeHome(t);
  assert.ok(!fs.existsSync(configPath(home)), 'o HOME do AC-02 tem que começar sem config');

  const { r, out } = runCascadeInstall(home, own, ownHub);

  assert.equal(r.status, 0, `install.sh deveria sair 0 só com o embutido:\n${out}`);
  assert.match(out, /\[ahc\] done/, `faltou a linha de conclusão:\n${out}`);
  assertNoPrompt(r, out);
  assertNoSecretLeak(out);

  // Só o embutido foi apresentado — uma vez pelo clone do instalador, uma vez
  // pela primeira sync (que é o `bin/ahc` refazendo a mesma cascata).
  assert.deepEqual(
    own.presentedSecrets(), [T_EMBUTIDO, T_EMBUTIDO],
    'a única origem disponível tinha que ser o embutido, no clone e na sync'
  );
  assert.deepEqual(
    own.presentedUsers(), ['x-access-token', 'x-access-token'],
    'usuário fixo das rodadas de token'
  );

  // Mesmo estado final do AC-01: CLI, hook e lock.
  const cli = path.join(home, '.local', 'bin', 'ahc');
  assert.ok(fs.existsSync(cli), `o CLI deveria ter sido instalado:\n${out}`);
  assert.ok((fs.statSync(cli).mode & 0o111) !== 0, 'o CLI deveria estar executável');

  const settings = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));
  assert.ok(
    JSON.stringify(settings.hooks.SessionStart).includes('ahc sync'),
    `faltou o hook SessionStart:\n${JSON.stringify(settings, null, 2)}`
  );

  const lock = JSON.parse(fs.readFileSync(path.join(home, '.claude', '.ahc-lock.json'), 'utf8'));
  assert.ok(Object.keys(lock.agents).length > 0, 'o lock deveria listar os artefatos do manifest');
  assert.ok(
    fs.existsSync(path.join(home, '.claude', 'agents', 'test-agent.md')),
    'o agent do manifest deveria ter sido instalado'
  );

  const cfg = readConfig(home);
  assert.equal(cfg.repo, ownHub.repo);
  assert.equal(cfg.branch, ownHub.branch);
});

// ---- AC-03 — nenhum sucesso falso quando todas as origens são recusadas ----

test('AC-03: todas as origens recusadas ⇒ exit ≠ 0, sem `[ahc] done`, com a mensagem do §5', async (t) => {
  // O remoto não aceita nada.
  const { remote: own, hub: ownHub } = await withRemote(t, []);
  const home = makeCascadeHome(t, { configToken: SECRET_OF.config, credHelper: true });

  const { r, out } = runCascadeInstall(home, own, ownHub, { envToken: SECRET_OF.env });

  assert.notEqual(r.status, 0, `o instalador não pode sair 0 com o hub recusando tudo:\n${out}`);
  assert.doesNotMatch(out, /\[ahc\] done/, `não pode imprimir a conclusão:\n${out}`);
  assertNoPrompt(r, out);
  assertNoSecretLeak(out);

  // Texto literal do §5.
  assert.match(
    out,
    /\[ahc\] ERRO: acesso ao hub recusado por todas as origens \(.*\)\. Informe um token com AHC_GITHUB_TOKEN=<token> ou copie o comando atualizado da wiki\./,
    `faltou a mensagem literal de todas as origens recusadas:\n${out}`
  );
  assert.equal(
    refusedLabels(out),
    'env (AHC_GITHUB_TOKEN), config (token em ~/.claude/.ahc-config.json), embutido, credencial git',
    'rótulos das origens recusadas'
  );

  // Não pode ter deixado meia instalação para trás.
  assert.ok(!fs.existsSync(path.join(home, '.local', 'bin', 'ahc')), 'não podia ter instalado o CLI');
  assert.ok(
    !fs.existsSync(path.join(home, '.claude', '.ahc-lock.json')),
    'não podia ter escrito o lock'
  );
});

test('AC-03: sem credencial git, a origem `git` aparece como "nenhuma configurada"', async (t) => {
  const { remote: own, hub: ownHub } = await withRemote(t, []);
  const home = makeCascadeHome(t); // CB pura: só o embutido existe

  const { r, out } = runCascadeInstall(home, own, ownHub);

  assert.notEqual(r.status, 0, `o instalador deveria falhar:\n${out}`);
  assert.doesNotMatch(out, /\[ahc\] done/);
  assertNoPrompt(r, out);
  assert.equal(
    refusedLabels(out),
    'embutido, credencial git: nenhuma configurada',
    'a rodada `git` foi tentada mas não apresentou credencial — não conta como recusada'
  );
  assert.deepEqual(own.presentedSecrets(), [T_EMBUTIDO], 'só o embutido chegou a ser apresentado');
});

test('AC-03: uma origem aceita ⇒ o instalador NÃO falha (o caso é o do AC-14)', async (t) => {
  const { remote: own, hub: ownHub } = await withRemote(t, [SECRET_OF.config]);
  const home = makeCascadeHome(t, { configToken: SECRET_OF.config });

  const { r, out } = runCascadeInstall(home, own, ownHub, { envToken: SECRET_OF.env });

  assert.equal(r.status, 0, `com a config aceita o instalador tem que concluir:\n${out}`);
  assert.match(out, /\[ahc\] done/, `faltou a conclusão:\n${out}`);
  assert.doesNotMatch(out, /recusado por todas as origens/, 'não é o caso de falha');
  assert.match(
    out,
    /\[ahc\] aviso: hub autenticado via config \(token em ~\/\.claude\/\.ahc-config\.json\); origem\(ns\) recusada\(s\): env \(AHC_GITHUB_TOKEN\)\./,
    `faltou o aviso da origem recusada:\n${out}`
  );
  assertNoSecretLeak(out);
});

// ---- AC-14 — a tabela da cascata aplicada ao install.sh --------------------

// Mesma tabela de `test/auth-cascade.test.js`. O que muda é o sujeito: lá o
// `ahc sync`, aqui o `install.sh`.
const AC14 = [
  {
    rotulo: 'env recusada, config autentica',
    env: SECRET_OF.env, config: SECRET_OF.config, credHelper: false,
    aceita: [SECRET_OF.config], resultado: 'sucesso', autenticou: 'config', recusadas: ['env'],
  },
  {
    rotulo: 'config recusada, embutido autentica',
    env: undefined, config: SECRET_OF.config, credHelper: false,
    aceita: [T_EMBUTIDO], resultado: 'sucesso', autenticou: 'embutido', recusadas: ['config'],
  },
  {
    rotulo: 'env e config recusadas, embutido autentica',
    env: SECRET_OF.env, config: SECRET_OF.config, credHelper: false,
    aceita: [T_EMBUTIDO], resultado: 'sucesso', autenticou: 'embutido', recusadas: ['env', 'config'],
  },
  {
    rotulo: 'embutido recusado, credencial git autentica',
    env: undefined, config: undefined, credHelper: true,
    aceita: [C_DEV], resultado: 'sucesso', autenticou: 'git', recusadas: ['embutido'],
  },
  {
    rotulo: 'env, config e embutido recusados, credencial git autentica',
    env: SECRET_OF.env, config: SECRET_OF.config, credHelper: true,
    aceita: [C_DEV], resultado: 'sucesso', autenticou: 'git', recusadas: ['env', 'config', 'embutido'],
  },
  {
    rotulo: 'só embutido disponível e recusado, sem credencial git',
    env: undefined, config: undefined, credHelper: false,
    aceita: [], resultado: 'falha', autenticou: null, recusadas: ['embutido'],
  },
  {
    rotulo: 'todas as origens recusadas, com credencial git',
    env: SECRET_OF.env, config: SECRET_OF.config, credHelper: true,
    aceita: [], resultado: 'falha', autenticou: null, recusadas: ['env', 'config', 'embutido', 'git'],
  },
];

for (const row of AC14) {
  test(`AC-14 (install.sh): ${row.rotulo} → ${row.resultado}`, async (t) => {
    const { remote: own, hub: ownHub } = await withRemote(t, row.aceita);
    const home = makeCascadeHome(t, { configToken: row.config, credHelper: row.credHelper });

    const { r, out } = runCascadeInstall(home, own, ownHub, { envToken: row.env });

    // A ordem esperada de UMA passada da cascata: as recusadas na ordem fixa,
    // seguidas da que autenticou. Nenhuma origem posterior é apresentada.
    const umaPassada = [
      ...row.recusadas.map((id) => SECRET_OF[id]),
      ...(row.autenticou ? [SECRET_OF[row.autenticou]] : []),
    ];
    const secrets = own.presentedSecrets();
    assertNoSecretLeak(out);
    assertNoPrompt(r, out);

    if (row.resultado === 'sucesso') {
      assert.equal(r.status, 0, `sucesso esperado, saiu ${r.status}:\n${out}`);
      assert.match(out, /\[ahc\] done/, `faltou a conclusão:\n${out}`);

      // Duas passadas no mesmo run: a primeira é o clone do `install.sh`
      // (cascata em bash), a segunda é a primeira sync (cascata do `bin/ahc`).
      // Compará-las é a prova de paridade in situ exigida pelo AC-14.
      assert.deepEqual(
        secrets, [...umaPassada, ...umaPassada],
        'credenciais apresentadas, em ordem, pelo clone do instalador e pela primeira sync'
      );
      assert.deepEqual(
        secrets.slice(0, umaPassada.length),
        secrets.slice(umaPassada.length),
        'a ordem da cascata em bash tem que ser idêntica à do `ahc sync`'
      );

      // Instalação de fato completa.
      assert.ok(fs.existsSync(path.join(home, '.local', 'bin', 'ahc')), 'o CLI deveria existir');
      const lock = JSON.parse(fs.readFileSync(path.join(home, '.claude', '.ahc-lock.json'), 'utf8'));
      assert.ok(Object.keys(lock.agents).length > 0, 'o lock deveria listar os artefatos');
      if (row.config !== undefined) {
        assert.equal(readConfig(home).token, row.config, 'o token da config tem que sobreviver ao merge');
      }
    } else {
      assert.notEqual(r.status, 0, `falha esperada, saiu 0:\n${out}`);
      assert.doesNotMatch(out, /\[ahc\] done/, `a conclusão não pode sair:\n${out}`);
      // Falha: o instalador para antes da sync, então há só uma passada.
      assert.deepEqual(secrets, umaPassada, 'credenciais apresentadas, em ordem, até a última origem');
      assert.match(out, /recusado por todas as origens/, `faltou a mensagem de recusa:\n${out}`);
      assert.ok(!fs.existsSync(path.join(home, '.local', 'bin', 'ahc')), 'não podia ter instalado o CLI');
    }
  });
}

test('AC-14 (install.sh): reinstalação usa `fetch` pela URL explícita e refaz a cascata', async (t) => {
  const { remote: own, hub: ownHub } = await withRemote(t, [T_EMBUTIDO]);
  const home = makeCascadeHome(t);

  // 1ª execução: clone.
  const primeira = runCascadeInstall(home, own, ownHub);
  assert.equal(primeira.r.status, 0, `o primeiro install deveria passar:\n${primeira.out}`);

  // O hub publica uma versão nova, e o `origin` do cache é envenenado: se o
  // instalador buscasse por `origin` em vez da URL explícita, o fetch iria
  // parar num host inexistente (ou levaria credencial na userinfo).
  const publicado = publishAgentVersion(ownHub, { version: '1.2.0' });
  const cache = path.join(home, '.claude', '.ahc-cache', ownHub.repo.replace(/[^a-zA-Z0-9._-]/g, '_'));
  git(['-C', cache, 'remote', 'set-url', 'origin', 'http://127.0.0.1:1/origem-envenenada.git'], {
    home,
  });

  own.clearAuthLog();

  // 2ª execução: `fetch`, com a env agora oferecendo uma origem recusada antes
  // do embutido — a cascata tem que valer também no caminho do fetch.
  const segunda = runCascadeInstall(home, own, ownHub, { envToken: SECRET_OF.env });
  assert.equal(segunda.r.status, 0, `a reinstalação deveria passar:\n${segunda.out}`);
  assert.match(segunda.out, /\[ahc\] updating cache at/, `deveria ter entrado no ramo do fetch:\n${segunda.out}`);
  assert.match(segunda.out, /\[ahc\] done/);
  assertNoSecretLeak(segunda.out);

  const umaPassada = [SECRET_OF.env, T_EMBUTIDO];
  assert.deepEqual(
    own.presentedSecrets(), [...umaPassada, ...umaPassada],
    'cascata do fetch (bash) e da sync (bin/ahc), na mesma ordem'
  );

  assert.equal(
    fs.readFileSync(path.join(home, '.claude', 'agents', `${publicado.name}.md`), 'utf8'),
    publicado.body,
    'o fetch pela URL explícita trouxe a versão nova'
  );
});

// ---- Paridade explícita com o `ahc sync` -----------------------------------

const PARIDADE = [
  {
    rotulo: 'só o embutido disponível',
    env: undefined, config: undefined, credHelper: false,
    esperado: 'embutido, credencial git: nenhuma configurada',
  },
  {
    rotulo: 'env, config, embutido e credencial git',
    env: SECRET_OF.env, config: SECRET_OF.config, credHelper: true,
    esperado: 'env (AHC_GITHUB_TOKEN), config (token em ~/.claude/.ahc-config.json), embutido, credencial git',
  },
];

for (const caso of PARIDADE) {
  test(`AC-14 (paridade): rótulos e ordem do install.sh == os do \`ahc sync\` — ${caso.rotulo}`, async (t) => {
    // O remoto começa aceitando tudo, só para montar um HOME já instalado.
    const aceitaTudo = [SECRET_OF.env, SECRET_OF.config, T_EMBUTIDO, C_DEV];
    const { remote: own, hub: ownHub } = await withRemote(t, aceitaTudo);

    // HOME A — instalado e com cache clonado; depois o hub recusa tudo e é o
    // `ahc sync` (cascata do bin/ahc, sobre `fetch`) que fala.
    const homeA = makeCascadeHome(t, { configToken: caso.config, credHelper: caso.credHelper });
    const bootstrap = runCascadeInstall(homeA, own, ownHub, { envToken: caso.env });
    assert.equal(bootstrap.r.status, 0, `bootstrap do HOME A deveria passar:\n${bootstrap.out}`);

    own.setAccepted([]);
    own.clearAuthLog();
    const sync = runAhc(homeA, ['sync'], {
      env: cascadeEnv(homeA, own, { envToken: caso.env }),
      cwd: cascadeEnv(homeA, own, { envToken: caso.env }).PWD,
      input: '',
      timeout: 60000,
    });
    const syncOut = `${sync.stdout || ''}${sync.stderr || ''}`;
    const ordemSync = own.presentedSecrets();

    // HOME B — do zero, com o hub já recusando tudo: é a cascata em bash,
    // sobre `clone`.
    own.clearAuthLog();
    const homeB = makeCascadeHome(t, { configToken: caso.config, credHelper: caso.credHelper });
    const { r, out } = runCascadeInstall(homeB, own, ownHub, { envToken: caso.env });
    const ordemInstall = own.presentedSecrets();

    assert.notEqual(sync.status, 0, `o sync deveria falhar com tudo recusado:\n${syncOut}`);
    assert.notEqual(r.status, 0, `o instalador deveria falhar com tudo recusado:\n${out}`);

    assert.deepEqual(
      ordemInstall, ordemSync,
      'a ordem das credenciais apresentadas tem que ser a mesma no install.sh e no `ahc sync`'
    );
    assert.equal(refusedLabels(out), caso.esperado, 'rótulos do install.sh');
    assert.equal(refusedLabels(syncOut), caso.esperado, 'rótulos do `ahc sync`');
    assert.equal(
      refusedLabels(out), refusedLabels(syncOut),
      'os rótulos das origens têm que ser os mesmos nos dois'
    );
  });
}

// ---- C1 / C3 — escopo da URL completa nas chaves de injeção ----------------

test('C1: chave `http.<base>.extraheader` do dev não vence a injeção com escopo da URL', async (t) => {
  const { remote: own, hub: ownHub } = await withRemote(t, [T_EMBUTIDO]);
  const home = makeCascadeHome(t);

  // O HOME do dev traz as duas armadilhas do §7 (E1 e E3b): um extraheader com
  // escopo da base e um credential helper com escopo de URL.
  const devBasic = Buffer.from(`dev:${C_DEV}`).toString('base64');
  const gitEnvHome = { ...baselineEnv(home, {}), HOME: home, GIT_CONFIG_NOSYSTEM: '1' };
  git(['config', '--global', `http.${own.baseURL}/.extraheader`, `Authorization: Basic ${devBasic}`], {
    env: gitEnvHome,
  });
  installCredHelper(home, { username: 'dev' });
  git(['config', '--global', `credential.${own.baseURL}/.helper`, CRED_HELPER], { env: gitEnvHome });

  const { r, out } = runCascadeInstall(home, own, ownHub);

  assert.equal(r.status, 0, `o embutido deveria autenticar:\n${out}`);
  assert.deepEqual(
    own.presentedSecrets(), [T_EMBUTIDO, T_EMBUTIDO],
    'a rodada do embutido tem que apresentar o embutido, não a credencial do dev'
  );
  assert.ok(
    !own.presentedSecrets().includes(C_DEV),
    'a credencial do dev não pode ser apresentada numa rodada rotulada como embutido'
  );
});

test('C3: nenhum token vai para o host reescrito por `insteadOf`', async (t) => {
  const { remote: own, hub: ownHub } = await withRemote(t, [T_EMBUTIDO, SECRET_OF.env, SECRET_OF.config]);
  // Servidor B: nunca deve receber um `Authorization` com token nenhum.
  const outro = await startAuthRemote({ accepted: [T_EMBUTIDO, SECRET_OF.env, SECRET_OF.config, C_DEV] });
  t.after(() => outro.close());

  const home = makeCascadeHome(t, { configToken: SECRET_OF.config });
  const gitEnvHome = { ...baselineEnv(home, {}), HOME: home, GIT_CONFIG_NOSYSTEM: '1' };
  git(['config', '--global', `url.${outro.baseURL}/.insteadOf`, `${own.baseURL}/`], { env: gitEnvHome });

  const { r, out } = runCascadeInstall(home, own, ownHub, { envToken: SECRET_OF.env });

  assert.notEqual(r.status, 0, `o clone vai para B, que não tem o repo — tem que falhar:\n${out}`);
  assert.deepEqual(
    outro.presentedSecrets(), [],
    'o host reescrito por insteadOf não pode receber nenhum token da cascata'
  );
  assert.deepEqual(own.presentedSecrets(), [], 'o host original nem chegou a ser contactado');
  assertNoSecretLeak(out);
});

// ---- Validação de REPO / BRANCH (pré-requisito da montagem da URL) ---------

const REFS_INVALIDAS = [
  { rotulo: 'repo com `;`', repo: 'EMS-NCTECH/hub;touch marcador', branch: 'main', re: /repo inválido/ },
  { rotulo: 'repo com `$(...)`', repo: 'EMS-NCTECH/$(touch marcador)', branch: 'main', re: /repo inválido/ },
  { rotulo: 'repo sem barra', repo: 'agents-hub-claude', branch: 'main', re: /repo inválido/ },
  { rotulo: 'branch começando com `-`', repo: 'EMS-NCTECH/agents-hub-claude', branch: '--upload-pack=touch', re: /branch inválida/ },
  { rotulo: 'branch recusada pelo check-ref-format', repo: 'EMS-NCTECH/agents-hub-claude', branch: 'a..b', re: /branch inválida/ },
];

for (const caso of REFS_INVALIDAS) {
  test(`validação: ${caso.rotulo} é recusado sem rede e sem rastro`, async (t) => {
    const { remote: own } = await withRemote(t, [T_EMBUTIDO]);
    const home = makeCascadeHome(t);

    const r = runInstall(home, {
      env: cascadeEnv(home, own),
      repo: caso.repo,
      branch: caso.branch,
      timeout: 30000,
    });
    const out = `${r.stdout || ''}${r.stderr || ''}`;

    assert.notEqual(r.status, 0, `deveria recusar:\n${out}`);
    assert.match(out, caso.re, `mensagem esperada:\n${out}`);
    assert.doesNotMatch(out, /\[ahc\] done/);
    assert.deepEqual(own.presentedSecrets(), [], 'nenhuma requisição podia ter chegado ao remoto');
    assert.ok(!fs.existsSync(path.join(home, '.claude', '.ahc-cache')), 'não podia ter criado o cache');
    assert.ok(!fs.existsSync(configPath(home)), 'não podia ter escrito a config');
    assert.ok(!fs.existsSync(path.join(home, '.cwd', 'marcador')), 'nada podia ter sido executado');
  });
}

// ---- C6 — GIT_CONFIG_COUNT herdado ----------------------------------------

test('C6: GIT_CONFIG_COUNT herdado inválido aborta antes de qualquer git', async (t) => {
  const { remote: own, hub: ownHub } = await withRemote(t, [T_EMBUTIDO]);
  const home = makeCascadeHome(t);

  const env = cascadeEnv(home, own);
  const marcador = path.join(home, 'marcador-git-config-count');
  // No bash, `$((VAR + 0))` EXECUTA um `$(...)` contido na variável.
  env.GIT_CONFIG_COUNT = `x[$(touch ${marcador})]`;

  const r = runInstall(home, { env, repo: ownHub.repo, branch: ownHub.branch, timeout: 30000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;

  assert.notEqual(r.status, 0, `deveria abortar:\n${out}`);
  assert.match(out, /GIT_CONFIG_COUNT/, `faltou nomear a variável:\n${out}`);
  assert.ok(!fs.existsSync(marcador), 'o valor da variável não podia ter sido executado');
  assert.deepEqual(own.presentedSecrets(), [], 'nenhum git podia ter rodado');
  assert.doesNotMatch(out, /\[ahc\] done/);
});

// ===========================================================================
// T10b — provas dos controles C4 e C5 que ficaram sem cobertura
// ===========================================================================

// ---- C4 — a classificação não pode depender do locale de quem instala -----
//
// O controle é `export LC_ALL=C` + `export LANGUAGE=C` dentro do subshell de
// `ahc_git()`. Provar isso só pela mensagem do git seria vácuo numa máquina
// cujo git foi compilado sem gettext (o Apple Git, por exemplo): sem tradução
// instalada, tirar o controle não mudaria nada e o teste passaria à toa. Por
// isso há duas provas complementares:
//   1. o env que **chega** ao git, observado por um shim no PATH — sempre
//      verificável e independente da tradução existir nesta máquina;
//   2. um git que **traduz** fora do locale C (o cenário do §7: Git for
//      Windows, distro com gettext), simulado por outro shim.
// Os dois shims são bash; no Windows os testes são pulados com motivo.

// Locales de teste, em ordem de preferência. Nenhum instalado ⇒ o teste ponta
// a ponta é pulado com motivo explícito, nunca passa por omissão.
const LOCALES_CANDIDATOS = [
  'pt_BR.UTF-8', 'pt_BR.utf8', 'pt_BR',
  'fr_FR.UTF-8', 'de_DE.UTF-8', 'es_ES.UTF-8', 'zh_CN.UTF-8', 'ja_JP.UTF-8',
];

function localeTraduzidoDisponivel() {
  const r = spawnSync('locale', ['-a'], { encoding: 'utf8', timeout: 10000 });
  if (r.status !== 0 || !r.stdout) return null;
  const disponiveis = new Map(
    r.stdout.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => [l.toLowerCase(), l])
  );
  for (const c of LOCALES_CANDIDATOS) {
    const achado = disponiveis.get(c.toLowerCase());
    if (achado) return achado;
  }
  return null;
}

function gitReal() {
  const r = spawnSync('which', ['git'], { encoding: 'utf8', timeout: 10000 });
  const p = ((r.stdout || '').trim().split('\n')[0] || '').trim();
  return p && fs.existsSync(p) ? p : null;
}

// Só diagnóstico: o git desta máquina traduz mensagens neste locale?
function gitTraduzNoLocale(binGit, locale) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-locale-probe-'));
  try {
    const base = { PATH: process.env.PATH, HOME: dir, GIT_CONFIG_NOSYSTEM: '1' };
    const args = ['rev-parse', '--verify', 'HEAD'];
    const emC = spawnSync(binGit, args, {
      cwd: dir, encoding: 'utf8', timeout: 10000,
      env: { ...base, LC_ALL: 'C', LANGUAGE: 'C' },
    });
    const noLocale = spawnSync(binGit, args, {
      cwd: dir, encoding: 'utf8', timeout: 10000,
      env: { ...base, LC_ALL: locale, LANG: locale, LANGUAGE: locale.split('.')[0] },
    });
    return (emC.stderr || '') !== (noLocale.stderr || '');
  } finally {
    rmrf(dir);
  }
}

// Shim de `git` que registra o locale de cada invocação e repassa ao git real.
// Transparente: não muda saída nem código de saída.
function shimQueRegistraLocale(t, binGit) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-locale-shim-'));
  t.after(() => rmrf(dir));
  const log = path.join(dir, 'locale.log');
  fs.writeFileSync(log, '');
  const shim = path.join(dir, 'git');
  fs.writeFileSync(
    shim,
    '#!/usr/bin/env bash\n' +
      "printf 'LC_ALL=%s\\tLANGUAGE=%s\\tLANG=%s\\targv=%s\\n' " +
      '"${LC_ALL-<unset>}" "${LANGUAGE-<unset>}" "${LANG-<unset>}" "$*" ' +
      `>> ${JSON.stringify(log)}\n` +
      `exec ${JSON.stringify(binGit)} "$@"\n`
  );
  fs.chmodSync(shim, 0o755);
  return {
    PATH: `${dir}${path.delimiter}${process.env.PATH}`,
    limpar() { fs.writeFileSync(log, ''); },
    linhas() { return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean); },
  };
}

// Shim de `git` que simula um binário com mensagens traduzidas: fora do locale
// C, `clone`/`fetch`/`ls-remote` falham com um `fatal:` em português, que
// nenhuma regra de classificação reconhece. Dentro de C, repassa ao git real —
// inclusive no `--version` do preflight e no `check-ref-format`.
function shimQueTraduz(t, binGit) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-i18n-shim-'));
  t.after(() => rmrf(dir));
  const shim = path.join(dir, 'git');
  fs.writeFileSync(
    shim,
    '#!/usr/bin/env bash\n' +
      'loc="${LC_ALL:-${LANGUAGE:-${LANG:-C}}}"\n' +
      'case "$loc" in\n' +
      '  C|POSIX|C.UTF-8) ;;\n' +
      '  *)\n' +
      '    for a in "$@"; do\n' +
      '      case "$a" in\n' +
      '        clone|fetch|ls-remote)\n' +
      '          echo "fatal: nao foi possivel acessar: a autenticacao falhou" >&2\n' +
      '          exit 128\n' +
      '          ;;\n' +
      '      esac\n' +
      '    done\n' +
      '    ;;\n' +
      'esac\n' +
      `exec ${JSON.stringify(binGit)} "$@"\n`
  );
  fs.chmodSync(shim, 0o755);
  return { PATH: `${dir}${path.delimiter}${process.env.PATH}` };
}

function envDeLocale(locale) {
  return {
    LANG: locale,
    LC_ALL: locale,
    LC_MESSAGES: locale,
    LANGUAGE: locale.split('.')[0],
  };
}

// Igual ao `cascadeEnv`, mas com `extra` (PATH do shim, variáveis de locale,
// GIT_DIR herdado) por cima da condição de baseline.
function cascadeEnvCom(home, ownRemote, opts = {}) {
  return baselineEnv(home, {
    baseURL: ownRemote.baseURL,
    embeddedToken: opts.embeddedToken !== undefined ? opts.embeddedToken : T_EMBUTIDO,
    ...(opts.envToken !== undefined ? { envToken: opts.envToken } : {}),
    extra: opts.extra || {},
  });
}

function instalarCom(home, ownHub, env) {
  const r = runInstall(home, { env, repo: ownHub.repo, branch: ownHub.branch, timeout: 90000 });
  return { r, out: `${r.stdout || ''}${r.stderr || ''}` };
}

test('C4 (install.sh): locale traduzido no ambiente não muda a classificação da falha', async (t) => {
  if (IS_WIN) { t.skip('shim de PATH em bash: não aplicável no Windows'); return; }
  const binGit = gitReal();
  if (!binGit) { t.skip('`which git` não resolveu um binário: sem como instalar o shim'); return; }
  const locale = localeTraduzidoDisponivel();
  if (!locale) {
    t.skip(
      'nenhum locale traduzido instalado nesta máquina (`locale -a` não lista ' +
      `${LOCALES_CANDIDATOS.join(', ')}): o C4 não pode ser exercido ponta a ponta aqui`
    );
    return;
  }
  t.diagnostic(
    `locale usado: ${locale}; o git desta máquina traduz mensagens nele: ` +
    `${gitTraduzNoLocale(binGit, locale) ? 'sim' : 'não (a prova fica sendo o env observado no shim)'}`
  );

  // Remoto que recusa tudo: as quatro origens são exercitadas e a mensagem
  // final carrega a classificação de cada uma.
  const { remote: own, hub: ownHub } = await withRemote(t, []);
  const home = makeCascadeHome(t, { configToken: SECRET_OF.config, credHelper: true });
  const shim = shimQueRegistraLocale(t, binGit);

  // Baseline: ambiente da CB, já em C. Falha ⇒ não instala nada, então o HOME
  // volta ao mesmo estado e a segunda execução é comparável byte a byte.
  const base = instalarCom(home, ownHub, cascadeEnvCom(home, own, {
    envToken: SECRET_OF.env, extra: { PATH: shim.PATH },
  }));
  assert.notEqual(base.r.status, 0, `o remoto recusa tudo, o instalador tem de falhar:\n${base.out}`);
  assert.match(base.out, /recusado por todas as origens/, `baseline classificado:\n${base.out}`);

  own.clearAuthLog();
  shim.limpar();

  // Mesmo cenário, com o dev num locale traduzido.
  const traduzido = instalarCom(home, ownHub, cascadeEnvCom(home, own, {
    envToken: SECRET_OF.env, extra: { PATH: shim.PATH, ...envDeLocale(locale) },
  }));

  assert.equal(traduzido.r.status, base.r.status, 'o exit não pode depender do locale de quem instala');
  assert.equal(
    traduzido.r.stderr, base.r.stderr,
    'a classificação e a mensagem têm de ser idênticas às do baseline em C'
  );
  assert.equal(traduzido.r.stdout, base.r.stdout, 'stdout também não pode depender do locale');
  assert.equal(
    refusedLabels(traduzido.out),
    'env (AHC_GITHUB_TOKEN), config (token em ~/.claude/.ahc-config.json), embutido, credencial git',
    'as quatro origens continuam sendo classificadas como recusadas'
  );
  assertNoSecretLeak(traduzido.out);
  assertNoPrompt(traduzido.r, traduzido.out);

  // A prova direta do controle: o que chegou ao git.
  const linhas = shim.linhas();
  assert.ok(linhas.length > 0, 'o shim de git tem de ter sido invocado pelo instalador');
  assert.ok(
    linhas.some((l) => /\targv=(-C \S+ )?(clone|fetch)\b/.test(l)),
    `o instalador tem de ter chegado a um clone/fetch:\n${linhas.join('\n')}`
  );
  for (const linha of linhas) {
    const [lcAll, language, , argv] = linha.split('\t');
    // O `git --version` do preflight roda fora do `ahc_git()` de propósito
    // (só lê a versão do binário, não fala com o hub e não classifica nada).
    if (argv === 'argv=--version') continue;
    assert.equal(lcAll, 'LC_ALL=C', `o locale de quem instala vazou para o git: ${linha}`);
    assert.equal(language, 'LANGUAGE=C', `o LANGUAGE de quem instala vazou para o git: ${linha}`);
  }
});

test('C4 (install.sh): git que traduz fora do locale C não engana a classificação', async (t) => {
  if (IS_WIN) { t.skip('shim de PATH em bash: não aplicável no Windows'); return; }
  const binGit = gitReal();
  if (!binGit) { t.skip('`which git` não resolveu um binário: sem como instalar o shim'); return; }

  const { remote: own, hub: ownHub } = await withRemote(t, []);
  const home = makeCascadeHome(t, { configToken: SECRET_OF.config, credHelper: true });
  const shim = shimQueTraduz(t, binGit);

  const { r, out } = instalarCom(home, ownHub, cascadeEnvCom(home, own, {
    envToken: SECRET_OF.env,
    extra: { PATH: shim.PATH, ...envDeLocale('pt_BR.UTF-8') },
  }));

  assert.notEqual(r.status, 0, `o remoto recusa tudo:\n${out}`);
  assert.doesNotMatch(out, /\[ahc\] done/);
  assertNoPrompt(r, out);
  assertNoSecretLeak(out);

  // Se o locale de quem instala chegasse ao git, o shim responderia em
  // português, a classe viraria `desconhecido` e a cascata pararia na primeira
  // origem — sem apresentar nenhuma credencial ao harness.
  assert.match(
    out, /recusado por todas as origens/,
    `a classificação tem de continuar reconhecendo o 401 do harness:\n${out}`
  );
  assert.doesNotMatch(out, /falha não classificada/, `nenhuma origem podia cair em "desconhecido":\n${out}`);
  assert.doesNotMatch(out, /autenticacao falhou/, `o ramo traduzido do shim não podia ter sido acionado:\n${out}`);
  assert.equal(
    refusedLabels(out),
    'env (AHC_GITHUB_TOKEN), config (token em ~/.claude/.ahc-config.json), embutido, credencial git'
  );
  assert.deepEqual(
    own.presentedSecrets(),
    [SECRET_OF.env, SECRET_OF.config, T_EMBUTIDO, C_DEV],
    'as quatro origens chegaram ao harness pelo git real: o shim não interceptou nenhuma rodada'
  );
});

// ---- C5 — GIT_DIR/GIT_WORK_TREE herdados não podem tocar o repo do dev ----
//
// Análogo ao teste homônimo de `test/git-refresh.test.js`, mas para o
// instalador: a limpeza correspondente é o `unset` de $AHC_GIT_LOCAL_ENV_VARS
// dentro do subshell de `ahc_git()`. Sem ela, o `reset --hard FETCH_HEAD` do
// caminho de fetch — e já o `clone` — agiriam no repo apontado pelas
// variáveis, não no cache.

test('C5 (install.sh): GIT_DIR/GIT_WORK_TREE herdados não tocam o repo de trabalho do dev', async (t) => {
  const { remote: own, hub: ownHub } = await withRemote(t, [T_EMBUTIDO]);
  const home = makeCascadeHome(t);

  // Repo do dev, com uma alteração não commitada — o que um `reset --hard`
  // solto destruiria.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-devrepo-'));
  t.after(() => rmrf(work));
  const gitHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-devhome-'));
  t.after(() => rmrf(gitHome));
  const file = path.join(work, 'trabalho.txt');
  git(['init', '-q', '-b', 'main', work], { home: gitHome });
  fs.writeFileSync(file, 'commitado\n');
  git(['-C', work, 'add', '-A'], { home: gitHome });
  git(['-C', work, 'commit', '-q', '-m', 'base'], { home: gitHome });
  fs.writeFileSync(file, 'trabalho não commitado\n');

  const headAntes = git(['-C', work, 'rev-parse', 'HEAD'], { home: gitHome }).stdout.trim();
  const statusAntes = git(['-C', work, 'status', '--porcelain'], { home: gitHome }).stdout;
  const conteudoAntes = fs.readFileSync(file, 'utf8');

  const { r, out } = instalarCom(home, ownHub, cascadeEnvCom(home, own, {
    extra: { GIT_DIR: path.join(work, '.git'), GIT_WORK_TREE: work },
  }));

  // Sem isto o teste passaria por qualquer motivo: o repo do dev fica intacto
  // porque o instalador não o enxerga, não porque o instalador não rodou.
  assert.equal(r.status, 0, `o instalador deveria concluir mesmo com GIT_DIR herdado:\n${out}`);
  assert.match(out, /\[ahc\] done/, `faltou a linha de conclusão:\n${out}`);
  assert.ok(fs.existsSync(path.join(home, '.local', 'bin', 'ahc')), 'o CLI deveria ter sido instalado');
  const cache = path.join(home, '.claude', '.ahc-cache', ownHub.repo.replace(/[^a-zA-Z0-9._-]/g, '_'));
  assert.ok(
    fs.existsSync(path.join(cache, 'manifest.json')),
    `o cache do hub é que tinha de receber o clone:\n${out}`
  );
  assert.deepEqual(
    own.presentedSecrets(), [T_EMBUTIDO, T_EMBUTIDO],
    'clone do instalador + primeira sync, ambos pelo embutido'
  );

  // E o repo do dev, byte a byte igual ao que era antes.
  assert.equal(
    fs.readFileSync(file, 'utf8'), conteudoAntes,
    'o arquivo não commitado do dev não pode ser tocado'
  );
  assert.equal(git(['-C', work, 'rev-parse', 'HEAD'], { home: gitHome }).stdout.trim(), headAntes, 'HEAD do dev');
  assert.equal(
    git(['-C', work, 'status', '--porcelain'], { home: gitHome }).stdout, statusAntes,
    '`git status --porcelain` do dev'
  );
  assert.ok(
    !fs.existsSync(path.join(work, 'manifest.json')),
    'nada do hub pode ter sido escrito na árvore de trabalho do dev'
  );
});
