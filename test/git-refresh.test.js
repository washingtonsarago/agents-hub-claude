// T5 da demanda 001-ahc-pat-auth — `gitRefresh` seguro, só com a rodada `git`.
//
// Cobre o que o §5 e os controles C4/C5/C6/C9 exigem do caminho da credencial
// do próprio dev (AC-12 caminho de credencial, AC-13):
//   - `sync` e `list` contra o remoto autenticado com o credential helper C_DEV;
//   - `GIT_ASKPASS` apontando para um script que dorme 100s não trava a chamada;
//   - `repo` com `;` ou `$(...)` e `branch` começando com `-` são rejeitados
//     antes de qualquer rede;
//   - `GIT_CONFIG_COUNT` herdado inválido aborta sem rodar git (C6) e um
//     herdado válido é respeitado (as chaves do ahc são acrescentadas);
//   - `GIT_DIR`/`GIT_WORK_TREE` herdados não fazem o `reset --hard` agir no
//     repo de trabalho do dev (C5);
//   - o `fetch` usa a URL explícita, não o `origin` gravado no cache;
//   - o locale do dev (`LANG`/`LC_ALL`/`LANGUAGE` traduzidos) não chega ao git
//     e não muda a classificação da falha (C4, T10b).
//
// A cascata de origens de token é o T6 e não é exercitada aqui.
// Todos os valores de credencial são fictícios e literais (C_DEV, T_OUTRO).
// Nenhum token real é lido, escrito ou impresso.
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
  writeConfig,
  readLock,
  baselineEnv,
  installCredHelper,
  isolatedGitEnv,
  git,
  runAhc,
  rmrf,
} = require('./helpers');

// ---- setup compartilhado ---------------------------------------------------

async function withRemote(t, accepted) {
  const remote = await startAuthRemote({ accepted });
  // Registrado antes do hub: se makeBareHub estourar, o filho ainda é fechado.
  t.after(() => remote.close());
  const hub = makeBareHub(remote);
  t.after(() => hub.cleanup());
  return { remote, hub };
}

// HOME na condição de baseline, config apontando para o hub do harness.
function makeHome(t, hub, opts = {}) {
  const home = makeTmpHome();
  t.after(() => rmrf(home));
  writeConfig(home, {
    repo: opts.repo !== undefined ? opts.repo : hub.repo,
    branch: opts.branch !== undefined ? opts.branch : hub.branch,
    channel: 'stable',
  });
  if (opts.credHelper !== false) installCredHelper(home);
  return home;
}

function envFor(home, remote, extra) {
  return baselineEnv(home, { baseURL: remote.baseURL, extra });
}

// `cwd` neutro de propósito: no hook SessionStart o ahc roda dentro do projeto
// aberto, e nenhum teste pode depender do repo deste checkout.
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

// ---- sync e list pelo caminho da credencial do dev (AC-12) -----------------

test('sync: autentica com o credential helper do dev e instala os artefatos', async (t) => {
  const { remote, hub } = await withRemote(t, ['C_DEV']);
  const home = makeHome(t, hub);

  const r = ahc(home, ['sync'], envFor(home, remote));

  assert.equal(r.status, 0, `sync deveria sair 0: ${r.stderr}`);
  assert.match(r.stdout, /\[ahc\] sync ok/);
  assert.ok(
    fs.existsSync(path.join(home, '.claude', 'agents', 'test-agent.md')),
    'o agent do manifest deveria ter sido instalado'
  );
  assert.ok(
    fs.existsSync(path.join(home, '.claude', 'commands', 'test-command.md')),
    'o command do manifest deveria ter sido instalado'
  );
  assert.ok(
    fs.existsSync(path.join(home, '.claude', 'skills', 'test-skill', 'SKILL.md')),
    'a skill do manifest deveria ter sido instalada'
  );
  assert.equal(readLock(home).agents['test-agent'].version, '1.0.0');
  assert.deepEqual(
    remote.presentedSecrets(),
    ['C_DEV'],
    'a única credencial apresentada é a do dev (nenhuma rodada de token no T5)'
  );
  assert.deepEqual(remote.presentedUsers(), ['dev']);
});

test('list: usa o mesmo caminho e mostra a versão remota', async (t) => {
  const { remote, hub } = await withRemote(t, ['C_DEV']);
  const home = makeHome(t, hub);

  const r = ahc(home, ['list'], envFor(home, remote));

  assert.equal(r.status, 0, `list deveria sair 0: ${r.stderr}`);
  assert.match(r.stdout, new RegExp(`repo: ${hub.repo}@${hub.branch}`));
  assert.match(r.stdout, /test-agent\s+local:-\s+remote:1\.0\.0/);
  assert.ok(remote.presentedSecrets().includes('C_DEV'), 'list também autenticou como o dev');
});

test('sync: o segundo sync usa fetch e traz a versão nova publicada', async (t) => {
  const { remote, hub } = await withRemote(t, ['C_DEV']);
  const home = makeHome(t, hub);
  const env = envFor(home, remote);

  assert.equal(ahc(home, ['sync'], env).status, 0);
  assert.ok(fs.existsSync(path.join(cachePath(home, hub.repo), '.git')), 'o clone criou o cache');

  const published = publishAgentVersion(hub, { version: '1.1.0' });
  const r = ahc(home, ['sync'], env);

  assert.equal(r.status, 0, `segundo sync deveria sair 0: ${r.stderr}`);
  assert.equal(readLock(home).agents['test-agent'].version, '1.1.0');
  assert.equal(
    fs.readFileSync(path.join(home, '.claude', 'agents', 'test-agent.md'), 'utf8'),
    published.body
  );
});

// ---- URL explícita: o `origin` do cache não é a fonte de verdade -----------

test('sync: o fetch usa a URL explícita, e não o `origin` gravado no cache', async (t) => {
  const { remote, hub } = await withRemote(t, ['C_DEV']);
  const home = makeHome(t, hub);
  const env = envFor(home, remote);

  assert.equal(ahc(home, ['sync'], env).status, 0, 'primeiro sync (clone)');

  // Um `origin` herdado de uma instalação antiga, com credencial na userinfo e
  // apontando para uma porta morta. Se o fetch usasse `origin`, este sync
  // falharia com erro de conexão.
  const cache = cachePath(home, hub.repo);
  git(['-C', cache, 'remote', 'set-url', 'origin', 'http://antigo:C_ANTIGO@127.0.0.1:1/errado.git'], {
    env: isolatedGitEnv(home),
  });

  const published = publishAgentVersion(hub, { version: '1.2.0' });
  const r = ahc(home, ['sync'], env);

  assert.equal(r.status, 0, `sync deveria ignorar o origin podre: ${r.stderr}`);
  assert.equal(readLock(home).agents['test-agent'].version, '1.2.0');
  assert.equal(
    fs.readFileSync(path.join(home, '.claude', 'agents', 'test-agent.md'), 'utf8'),
    published.body
  );
  assert.equal(
    git(['-C', cache, 'remote', 'get-url', 'origin'], { env: isolatedGitEnv(home) }).stdout.trim(),
    'http://antigo:C_ANTIGO@127.0.0.1:1/errado.git',
    'o ahc não reescreve o remoto do dev; ele simplesmente não o usa'
  );
});

// ---- não interatividade: askpass não pode segurar a chamada ---------------

test('sync: GIT_ASKPASS que dorme 100s não trava nem é executado', async (t) => {
  // Nenhuma credencial aceita e nenhum helper: é exatamente o estado em que o
  // git tentaria o askpass antes de desistir.
  const { remote, hub } = await withRemote(t, ['T_OUTRO']);
  const home = makeHome(t, hub, { credHelper: false });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-askpass-'));
  t.after(() => rmrf(dir));
  const marker = path.join(dir, 'askpass-foi-executado');
  const script = path.join(dir, 'askpass.sh');
  fs.writeFileSync(script, `#!/bin/sh\ntouch ${JSON.stringify(marker)}\nsleep 100\necho nao-deveria\n`);
  fs.chmodSync(script, 0o755);

  const started = Date.now();
  const r = ahc(home, ['sync'], envFor(home, remote, {
    GIT_ASKPASS: script,
    SSH_ASKPASS: script,
    SSH_ASKPASS_REQUIRE: 'force',
    DISPLAY: ':0',
  }), { timeout: 45000 });
  const elapsed = Date.now() - started;

  assert.equal(r.signal, null, 'o sync não pode ter sido morto por timeout do teste');
  assert.notEqual(r.status, 0, 'sem credencial utilizável o sync falha');
  assert.ok(!fs.existsSync(marker), 'o askpass do dev não pode ser executado pelo ahc');
  assert.ok(elapsed < 40000, `o sync demorou ${elapsed}ms — algo ficou esperando input`);
  assert.match(r.stderr, /offline or unreachable|nenhuma configurada/);
  assert.deepEqual(remote.presentedSecrets(), [], 'nenhuma credencial foi apresentada');
});

// ---- classificação: rede não é recusa de credencial ----------------------

test('sync: remoto fora do ar é classificado como rede, sem confundir com recusa', async (t) => {
  const { remote, hub } = await withRemote(t, ['C_DEV']);
  const home = makeHome(t, hub);
  const env = envFor(home, remote);

  assert.equal(ahc(home, ['sync'], env).status, 0, 'primeiro sync (clone) com o remoto no ar');

  // A partir daqui a porta não tem ninguém escutando: connection refused.
  await remote.close();

  const started = Date.now();
  const r = ahc(home, ['sync'], env);
  const elapsed = Date.now() - started;

  assert.notEqual(r.status, 0, 'hub inalcançável falha');
  assert.match(r.stderr, /rede\/timeout/, 'a falha é de rede, não de credencial');
  assert.ok(
    !/recusad|nenhuma configurada/i.test(r.stderr),
    'erro de conexão não pode ser lido como recusa de credencial (C4)'
  );
  assert.ok(elapsed < 20000, `demorou ${elapsed}ms — o teto de relógio não agiu`);
  // Cache preservado: o AC-05 exige que os artefatos já instalados fiquem.
  assert.ok(fs.existsSync(path.join(home, '.claude', 'agents', 'test-agent.md')));
});

// ---- validação de repo/branch antes de qualquer rede ----------------------

for (const [rotulo, repo] of [
  ['ponto e vírgula', 'EMS-NCTECH/agents-hub-claude; touch pwned'],
  ['substituição de comando', '$(touch pwned)/agents-hub-claude'],
  ['crase', '`touch pwned`/hub'],
  ['sem owner', 'agents-hub-claude'],
  ['começando com hífen', '--upload-pack=touch/pwned'],
]) {
  test(`sync: repo com ${rotulo} é rejeitado sem nenhuma requisição`, async (t) => {
    const { remote, hub } = await withRemote(t, ['C_DEV']);
    const home = makeHome(t, hub, { repo });
    const env = envFor(home, remote);
    const pwned = path.join(env.PWD, 'pwned');

    const r = ahc(home, ['sync'], env);

    assert.notEqual(r.status, 0, 'repo inválido não pode sair 0');
    assert.match(r.stderr, /repo inválido/);
    assert.ok(!fs.existsSync(pwned), 'nada pode ser executado a partir do valor do config');
    assert.deepEqual(remote.authHeaders(), [], 'o harness não pode ter recebido requisição');
    assert.ok(
      !fs.existsSync(path.join(home, '.claude', '.ahc-cache')),
      'nem o diretório de cache do repo inválido deveria surgir'
    );
  });
}

for (const [rotulo, branch] of [
  ['começando com hífen', '-x'],
  ['opção do git', '--upload-pack=touch pwned'],
  ['com espaço', 'main branch'],
  ['com ..', 'ma..in'],
  ['vazia', ''],
]) {
  test(`sync: branch ${rotulo} é rejeitada sem nenhuma requisição`, async (t) => {
    const { remote, hub } = await withRemote(t, ['C_DEV']);
    const home = makeHome(t, hub, { branch });
    const env = envFor(home, remote);

    const r = ahc(home, ['sync'], env);

    assert.notEqual(r.status, 0, 'branch inválida não pode sair 0');
    assert.match(r.stderr, /branch inválida/);
    assert.ok(!fs.existsSync(path.join(env.PWD, 'pwned')));
    assert.deepEqual(remote.authHeaders(), [], 'o harness não pode ter recebido requisição');
  });
}

test('list: config inválida também falha, em vez de mostrar só o local', async (t) => {
  const { remote, hub } = await withRemote(t, ['C_DEV']);
  const home = makeHome(t, hub, { repo: 'owner/repo; touch pwned' });

  const r = ahc(home, ['list'], envFor(home, remote));

  assert.notEqual(r.status, 0, 'list com config quebrada não pode sair 0');
  assert.match(r.stderr, /repo inválido/);
  assert.deepEqual(remote.authHeaders(), []);
});

// ---- C6: GIT_CONFIG_COUNT herdado ----------------------------------------

test('C6: GIT_CONFIG_COUNT herdado inválido aborta antes de rodar o git', async (t) => {
  const { remote, hub } = await withRemote(t, ['C_DEV']);
  const home = makeHome(t, hub);
  const env = envFor(home, remote);
  const marker = path.join(env.PWD, 'config-count-pwned');
  env.GIT_CONFIG_COUNT = `x[$(touch ${marker})]`;

  const r = ahc(home, ['sync'], env);

  assert.notEqual(r.status, 0, 'GIT_CONFIG_COUNT inválido não pode sair 0');
  // A mensagem é do ahc, não do git: deixar o git reclamar de "bogus count"
  // significaria ter passado o valor adiante e tratado a falha como rede.
  assert.match(r.stderr, /GIT_CONFIG_COUNT herdado do ambiente é inválido/);
  assert.ok(
    !/offline or unreachable/.test(r.stderr),
    'config quebrada do ambiente não pode ser confundida com hub inalcançável'
  );
  assert.ok(!fs.existsSync(marker), 'nada do valor herdado pode ser executado');
  assert.ok(
    !r.stderr.includes('$(touch'),
    'o valor herdado não pode ser ecoado de volta'
  );
  assert.deepEqual(remote.authHeaders(), [], 'nenhum git rodou, logo nenhuma requisição');
});

test('C6: GIT_CONFIG_COUNT herdado válido é respeitado (as chaves do ahc são acrescentadas)', async (t) => {
  const { remote, hub } = await withRemote(t, ['C_DEV']);
  const home = makeHome(t, hub);
  const env = envFor(home, remote);
  // A entrada herdada anula o credential helper do dev. Se o ahc sobrescrevesse
  // o índice 0 com as próprias chaves, o helper voltaria a valer e o sync
  // passaria — é exatamente essa regressão que este teste trava.
  env.GIT_CONFIG_COUNT = '1';
  env.GIT_CONFIG_KEY_0 = 'credential.helper';
  env.GIT_CONFIG_VALUE_0 = '';

  const r = ahc(home, ['sync'], env);

  assert.notEqual(r.status, 0, 'com o helper anulado pela config herdada, o sync falha');
  assert.deepEqual(
    remote.presentedSecrets(),
    [],
    'a entrada herdada no índice 0 continuou valendo: nenhuma credencial foi apresentada'
  );
});

// ---- C5: env do git saneado ----------------------------------------------

test('C5: GIT_DIR/GIT_WORK_TREE herdados não tocam o repo de trabalho do dev', async (t) => {
  const { remote, hub } = await withRemote(t, ['C_DEV']);
  const home = makeHome(t, hub);

  // Repo do dev, com uma alteração não commitada — o que um `reset --hard`
  // solto destruiria.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-devrepo-'));
  t.after(() => rmrf(work));
  const gitHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-devhome-'));
  t.after(() => rmrf(gitHome));
  const gitEnv = isolatedGitEnv(gitHome);
  const file = path.join(work, 'trabalho.txt');
  git(['init', '-q', '-b', 'main', work], { env: gitEnv });
  fs.writeFileSync(file, 'commitado\n');
  git(['-C', work, 'add', '-A'], { env: gitEnv });
  git(['-C', work, 'commit', '-q', '-m', 'base'], { env: gitEnv });
  fs.writeFileSync(file, 'trabalho não commitado\n');

  const headBefore = git(['-C', work, 'rev-parse', 'HEAD'], { env: gitEnv }).stdout.trim();
  const statusBefore = git(['-C', work, 'status', '--porcelain'], { env: gitEnv }).stdout;

  const r = ahc(home, ['sync'], envFor(home, remote, {
    GIT_DIR: path.join(work, '.git'),
    GIT_WORK_TREE: work,
  }));

  assert.equal(r.status, 0, `sync deveria sair 0 mesmo com GIT_DIR herdado: ${r.stderr}`);
  assert.equal(
    fs.readFileSync(file, 'utf8'),
    'trabalho não commitado\n',
    'o arquivo não commitado do dev não pode ser tocado'
  );
  assert.equal(git(['-C', work, 'rev-parse', 'HEAD'], { env: gitEnv }).stdout.trim(), headBefore);
  assert.equal(git(['-C', work, 'status', '--porcelain'], { env: gitEnv }).stdout, statusBefore);
  assert.ok(
    fs.existsSync(path.join(cachePath(home, hub.repo), 'manifest.json')),
    'o cache do hub é que recebeu o clone'
  );
});

// ---- C4: o locale do dev não pode mudar a classificação -------------------
//
// O controle é `LC_ALL=C` + `LANGUAGE=C` fixados por invocação em `gitEnv()`.
// Provar isso só pela mensagem do git seria vácuo numa máquina cujo git foi
// compilado sem gettext (o caso do Apple Git, por exemplo): sem tradução
// instalada, tirar o controle não mudaria nada e o teste passaria à toa.
// Então há duas provas complementares:
//   1. o env que **chega** ao git, observado por um shim no PATH — sempre
//      verificável, e falha na hora se o `LC_ALL=C` sumir;
//   2. um git que **traduz** fora do locale C (o cenário do §7: Git for
//      Windows, distro com gettext), simulado por outro shim — prova que a
//      classificação continua a mesma mesmo com o dev num locale traduzido.
// Os dois testes usam bash; no Windows são pulados com motivo.

const IS_WIN = process.platform === 'win32';

// Locales de teste, em ordem de preferência. O primeiro que `locale -a` listar
// vence. Nenhum instalado ⇒ o teste ponta a ponta é pulado com motivo, nunca
// passa por omissão.
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

// O git desta máquina traduz mensagens neste locale? Só diagnóstico: a prova
// do controle não depende da resposta (é para isso que existe o shim).
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

// Shim de `git` no PATH que registra o locale de cada invocação e repassa ao
// git real. Transparente: não muda nem a saída nem o código de saída.
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
// nenhuma regra de classificação reconhece. Dentro de C, repassa ao git real.
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

test('C4: locale traduzido no ambiente do dev não muda a classificação do `ahc sync`', async (t) => {
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

  // Remoto que recusa a credencial do dev: falha classificada e determinística.
  const { remote, hub } = await withRemote(t, ['T_OUTRO']);
  const home = makeHome(t, hub);
  const shim = shimQueRegistraLocale(t, binGit);

  // Baseline: o ambiente da CB, já em C.
  const base = ahc(home, ['sync'], envFor(home, remote, { PATH: shim.PATH }));
  assert.notEqual(base.status, 0, 'o remoto recusa a credencial do dev, o sync tem de falhar');
  assert.match(
    base.stderr, /recusado por todas as origens \(credencial git\)/,
    `a falha do baseline tem de ser classificada como recusa:\n${base.stderr}`
  );

  shim.limpar();

  // Mesmo cenário, com o dev num locale traduzido.
  const traduzido = ahc(home, ['sync'], envFor(home, remote, { PATH: shim.PATH, ...envDeLocale(locale) }));

  assert.equal(traduzido.status, base.status, 'o exit não pode depender do locale do dev');
  assert.equal(
    traduzido.stderr, base.stderr,
    'a classificação e a mensagem têm de ser idênticas às do baseline em C'
  );
  assert.equal(traduzido.stdout, base.stdout, 'stdout também não pode depender do locale');

  // A prova direta do controle: o que chegou ao git.
  const linhas = shim.linhas();
  assert.ok(linhas.length > 0, 'o shim de git tem de ter sido invocado pelo ahc');
  assert.ok(
    linhas.some((l) => /\targv=(-C \S+ )?(clone|fetch)\b/.test(l)),
    `o ahc tem de ter chegado a um clone/fetch:\n${linhas.join('\n')}`
  );
  for (const linha of linhas) {
    const [lcAll, language] = linha.split('\t');
    assert.equal(lcAll, 'LC_ALL=C', `o locale do dev vazou para o git: ${linha}`);
    assert.equal(language, 'LANGUAGE=C', `o LANGUAGE do dev vazou para o git: ${linha}`);
  }
});

test('C4: git que traduz fora do locale C não engana a classificação do `ahc sync`', async (t) => {
  if (IS_WIN) { t.skip('shim de PATH em bash: não aplicável no Windows'); return; }
  const binGit = gitReal();
  if (!binGit) { t.skip('`which git` não resolveu um binário: sem como instalar o shim'); return; }

  const { remote, hub } = await withRemote(t, ['T_OUTRO']);
  const home = makeHome(t, hub);
  const shim = shimQueTraduz(t, binGit);

  const r = ahc(home, ['sync'], envFor(home, remote, {
    PATH: shim.PATH,
    ...envDeLocale('pt_BR.UTF-8'),
  }));

  assert.notEqual(r.status, 0, 'o remoto recusa a credencial do dev');
  assert.match(
    r.stderr, /recusado por todas as origens \(credencial git\)/,
    `o 401 do harness tem de continuar sendo "recusado" com o dev em pt_BR:\n${r.stderr}`
  );
  assert.doesNotMatch(
    r.stderr, /falha não classificada/,
    `a falha não pode cair em "desconhecido" por causa do locale:\n${r.stderr}`
  );
  assert.doesNotMatch(
    r.stderr, /autenticacao falhou/,
    `o ramo traduzido do shim não podia ter sido acionado:\n${r.stderr}`
  );
  assert.deepEqual(
    remote.presentedSecrets(), ['C_DEV'],
    'o git real chegou ao harness: o shim não interceptou a rodada'
  );
});

// ---- C9: nada de credencial nas saídas ------------------------------------

test('C9: a credencial do dev não aparece em stdout nem em stderr', async (t) => {
  const { remote, hub } = await withRemote(t, ['C_DEV']);
  const home = makeHome(t, hub);
  const env = envFor(home, remote, {
    // Trace ligado e redação desligada: o ahc tem de sanear isso sozinho.
    GIT_TRACE: '1',
    GIT_TRACE_CURL: '1',
    GIT_CURL_VERBOSE: '1',
    GIT_TRACE_REDACT: '0',
  });

  const ok = ahc(home, ['sync'], env);
  assert.equal(ok.status, 0, `sync deveria sair 0: ${ok.stderr}`);

  remote.setAccepted(['T_OUTRO']);
  const ko = ahc(home, ['sync'], env);
  assert.notEqual(ko.status, 0, 'com a credencial recusada o sync falha');

  const saidas = `${ok.stdout}${ok.stderr}${ko.stdout}${ko.stderr}`;
  const b64 = Buffer.from('dev:C_DEV').toString('base64');
  assert.ok(!saidas.includes('C_DEV'), 'a credencial do dev não pode sair em nenhum canal');
  assert.ok(!saidas.includes(b64), 'nem o base64 do Basic');
  assert.ok(!/Authorization: Basic \S/.test(saidas), 'nenhum header de auth em claro');
});

// ---- nenhum shell no caminho ---------------------------------------------

test('bin/ahc: gitRefresh não usa execSync nem monta comando por interpolação', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'ahc'), 'utf8');
  const start = src.indexOf('function gitRefresh(');
  assert.ok(start !== -1, 'gitRefresh deveria existir');
  const body = src.slice(start, src.indexOf('\n}\n', start));
  assert.ok(!/execSync\s*\(/.test(body), 'gitRefresh não pode voltar a usar execSync');
  assert.ok(/runGit\(/.test(body), 'gitRefresh executa git por execFileSync (runGit)');
  assert.ok(
    !/git\s+(clone|fetch|reset)/.test(body),
    'nenhum comando git montado como string'
  );
});

test('bin/ahc: o teto de relógio do fetch é max(3 × timeout, 15s)', () => {
  const r = spawnSync(process.execPath, ['--check', path.join(__dirname, '..', 'bin', 'ahc')], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `bin/ahc deveria passar no node --check: ${r.stderr}`);
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'ahc'), 'utf8');
  assert.match(src, /Math\.max\(3 \* FLAGS\.timeout, 15000\)/);
  assert.match(src, /const cloneTimeout = 120000;/);
});
