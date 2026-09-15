// T11 da demanda 001-ahc-pat-auth — guarda de regressão do dev que JÁ tem
// credencial git e instalação funcionando (AC-12).
//
// O cenário não é "instala do zero": é a máquina dos mais de 50 devs ativos no
// dia em que eles atualizam o `ahc`. Por isso o estado inicial é montado à mão,
// como o ahc ANTERIOR o teria deixado:
//   - cache criado por um `git clone` simples da URL do harness (clone
//     completo, com `origin`, sem `--depth`), que é o layout que o ahc antigo
//     produzia — ele não sabia apontar para loopback nem falava de cascata;
//   - artefatos e lock escritos a partir desse cache, sem nunca rodar o ahc
//     novo antes da janela de asserção;
//   - um item pinado no lock;
//   - um arquivo escrito à mão em `~/.claude/agents/`, que nunca entrou no lock;
//   - a credencial do dev (C_DEV) atrás de um credential helper mais um store
//     em `~/.git-credentials`.
//
// Dois casos, os dois do AC-12:
//   1. o remoto aceita T_EMBUTIDO — o embutido passa a ser tentado antes da
//      credencial git e autentica;
//   2. o remoto aceita só C_DEV — o embutido é recusado e a credencial do
//      próprio dev autentica, com ⚠ e exit 0 (AC-10 cenário B).
//
// Em ambos: `sync`, `list` e `doctor` com exit 0, pin respeitado, arquivo
// manual intacto e a configuração git global do dev (sha256 de `~/.gitconfig`
// e do store do helper) idêntica antes e depois.
//
// Todos os valores de credencial são fictícios e literais (T_EMBUTIDO, C_DEV).
// Nenhum token real é lido, escrito ou impresso, e nada aqui toca a rede: só o
// harness em loopback.
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
  writeLock,
  readLock,
  sha256OfFile,
  baselineEnv,
  installCredHelper,
  git,
  runAhc,
  rmrf,
} = require('./helpers');

// Valores fictícios.
const T_EMBUTIDO = 'T_EMBUTIDO';
const C_DEV = 'C_DEV';
const ALL_SECRETS = [T_EMBUTIDO, C_DEV];

const PINNED_ITEM = 'test-agent';
const PINNED_VERSION = '1.0.0';
const REMOTE_VERSION = '1.1.0';
// O arquivo que o dev escreveu à mão: não está no manifest, nunca entrou no
// lock, e por isso o `pruneOrphans` não pode encostar nele.
const HANDWRITTEN = 'agente-do-dev.md';
const HANDWRITTEN_BODY = [
  '---',
  'name: agente-do-dev',
  'description: escrito à mão pelo dev, fora do hub',
  '---',
  '',
  'Este arquivo nunca passou pelo ahc. Ele tem que sobreviver a tudo.',
  '',
].join('\n');

// ---------------------------------------------------------------------------
// Montagem do cenário
// ---------------------------------------------------------------------------

function ahc(home, args, env) {
  return runAhc(home, args, { env, cwd: env.PWD, input: '', timeout: 60000 });
}

function claude(home, ...rest) {
  return path.join(home, '.claude', ...rest);
}

function cachePath(home, repo) {
  return claude(home, '.ahc-cache', repo.replace(/[^a-zA-Z0-9._-]/g, '_'));
}

// C_DEV do jeito que um dev real a tem: um helper que responde `get` (papel do
// osxkeychain / GCM / `gh auth setup-git`) e um store em arquivo. O store existe
// porque é o que um `erase` disparado por um 401 destruiria — é justamente essa
// a regressão que o sha256 do T11 vigia.
function installDevCredential(home, remote) {
  installCredHelper(home);
  git(['config', '--global', '--add', 'credential.helper', 'store'], { home });
  const store = path.join(home, '.git-credentials');
  fs.writeFileSync(store, `http://dev:${C_DEV}@127.0.0.1:${remote.port}\n`, { mode: 0o600 });
  return store;
}

// O cache do ahc ANTERIOR: `git clone` simples da URL, autenticado pela
// credencial do dev. Clone completo (sem `--depth`), com `origin` configurado —
// exatamente o que o ahc novo vai encontrar na máquina dos 50+ devs.
function clonePreviousCache(home, hub) {
  const cache = cachePath(home, hub.repo);
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  git(['clone', '-q', hub.url, cache], { home });
  assert.ok(fs.existsSync(path.join(cache, '.git')), 'o clone simples deveria ter criado o cache');
  return cache;
}

// Artefatos e lock como o ahc anterior os teria deixado, lidos do cache recém
// clonado. Feito à mão de propósito: rodar o ahc novo aqui contaminaria o
// estado "de antes" que o teste compara.
function installFromCache(home, cache) {
  const manifest = JSON.parse(fs.readFileSync(path.join(cache, 'manifest.json'), 'utf8'));
  const lock = { agents: {}, commands: {}, autonomous: {}, skills: {}, pins: {} };

  for (const key of ['agents', 'commands', 'autonomous']) {
    for (const item of manifest[key] || []) {
      const target = claude(home, key, `${item.name}.md`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(cache, item.path), target);
      lock[key][item.name] = { version: item.version, sha256: item.sha256, path: target };
    }
  }
  for (const item of manifest.skills || []) {
    const files = {};
    for (const f of item.files || []) {
      const rel = f.path.replace(new RegExp(`^skills/${item.name}/`), '');
      const target = claude(home, 'skills', item.name, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(cache, f.path), target);
      files[rel] = f.sha256;
    }
    lock.skills[item.name] = { version: item.version, files };
  }

  lock.manifest_version = manifest.version;
  lock.last_sync = new Date().toISOString();
  return { manifest, lock };
}

// Hook `SessionStart` já configurado: é uma instalação existente, não um HOME
// virgem. Sem isso o doctor marcaria ✗ em `SessionStart hook`.
function writeSettings(home) {
  fs.writeFileSync(
    claude(home, 'settings.json'),
    JSON.stringify({
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: 'ahc sync --quiet --timeout=5' }] },
        ],
      },
    }, null, 2) + '\n'
  );
}

// Monta a máquina do dev inteira e devolve o que as asserções precisam.
async function setupDevMachine(t, accepted) {
  const remote = await startAuthRemote({ accepted });
  t.after(() => remote.close());
  const hub = makeBareHub(remote);
  t.after(() => hub.cleanup());

  const home = makeTmpHome();
  t.after(() => rmrf(home));

  const store = installDevCredential(home, remote);

  // Config do dev: sem `token` e sem AHC_GITHUB_TOKEN (AC-12). 600 para que o
  // check `config file permission` do doctor não vire ruído no ⚠ do embutido.
  writeConfig(home, { repo: hub.repo, branch: hub.branch, channel: 'stable' });
  fs.chmodSync(claude(home, '.ahc-config.json'), 0o600);
  writeSettings(home);

  const cache = clonePreviousCache(home, hub);
  const { lock } = installFromCache(home, cache);

  // O pin: decisão explícita do dev, que o sync não pode desfazer.
  lock.pins[PINNED_ITEM] = PINNED_VERSION;
  writeLock(home, lock);

  const pinnedFile = claude(home, 'agents', `${PINNED_ITEM}.md`);
  const pinnedBody = fs.readFileSync(pinnedFile, 'utf8');

  const handwrittenFile = claude(home, 'agents', HANDWRITTEN);
  fs.writeFileSync(handwrittenFile, HANDWRITTEN_BODY);

  // O hub anda para a frente: sem isso o sync não teria nada a fazer e o pin
  // seria respeitado por omissão.
  publishAgentVersion(hub, { name: PINNED_ITEM, version: REMOTE_VERSION });

  const env = baselineEnv(home, { baseURL: remote.baseURL, embeddedToken: T_EMBUTIDO });

  return {
    remote, hub, home, cache, store, env,
    pinnedFile, pinnedBody, handwrittenFile,
    gitconfig: path.join(home, '.gitconfig'),
    cacheInode: fs.statSync(path.join(cache, '.git')).ino,
  };
}

// ---------------------------------------------------------------------------
// Asserções compartilhadas
// ---------------------------------------------------------------------------

function out(r) {
  return `${r.stdout || ''}\n${r.stderr || ''}`;
}

// C9: nem o valor, nem o base64 do `x-access-token:<valor>` pode sair.
function assertNoSecretLeak(r, rotulo) {
  const s = out(r);
  for (const secret of ALL_SECRETS) {
    assert.ok(!s.includes(secret), `${rotulo}: o valor ${secret} vazou para a saída`);
    const basic = Buffer.from(`x-access-token:${secret}`).toString('base64');
    assert.ok(!s.includes(basic), `${rotulo}: o base64 de ${secret} vazou para a saída`);
  }
}

function assertNoPrompt(r, rotulo) {
  assert.equal(r.signal, null, `${rotulo}: não pode ter sido morto por timeout do teste`);
  assert.ok(!/Username|Password for/i.test(out(r)), `${rotulo}: nada pode ter pedido usuário ou senha`);
}

function assertOk(r, rotulo) {
  assert.equal(r.status, 0, `${rotulo} deveria sair 0: ${r.stderr}`);
  assertNoPrompt(r, rotulo);
  assertNoSecretLeak(r, rotulo);
}

// ---------------------------------------------------------------------------
// Os dois casos do AC-12
// ---------------------------------------------------------------------------

const CASOS = [
  {
    rotulo: 'remoto aceita T_EMBUTIDO',
    accepted: [T_EMBUTIDO, C_DEV],
    // O embutido é tentado antes da credencial git e autentica: a credencial do
    // dev nem chega a ser apresentada.
    secrets: [T_EMBUTIDO],
    users: ['x-access-token'],
    autenticou: 'embutido',
    recusadas: [],
  },
  {
    rotulo: 'remoto aceita só C_DEV',
    accepted: [C_DEV],
    // Embutido recusado → cascata avança para a credencial do próprio dev.
    secrets: [T_EMBUTIDO, C_DEV],
    users: ['x-access-token', 'dev'],
    autenticou: 'credencial git',
    recusadas: ['embutido'],
  },
];

for (const caso of CASOS) {
  test(`AC-12: dev com credencial git e instalação existente — ${caso.rotulo}`, async (t) => {
    const s = await setupDevMachine(t, caso.accepted);
    const { remote, home, env } = s;

    const gitconfigAntes = sha256OfFile(s.gitconfig);
    const storeAntes = sha256OfFile(s.store);
    const manualAntes = fs.readFileSync(s.handwrittenFile, 'utf8');

    // ---- sync ---------------------------------------------------------
    remote.clearAuthLog();
    const sync = ahc(home, ['sync'], env);
    assertOk(sync, 'sync');
    assert.deepEqual(remote.presentedSecrets(), caso.secrets, 'credenciais apresentadas pelo sync, em ordem');
    assert.deepEqual(remote.presentedUsers(), caso.users, 'usuários das rodadas do sync');

    // O pin segurou: o item não foi atualizado, e o sync disse por quê.
    assert.match(
      sync.stdout,
      new RegExp(`\\[pinned\\]\\s+agent ${PINNED_ITEM} @ ${PINNED_VERSION} \\(remote ${REMOTE_VERSION}\\)`),
      'o sync deveria reportar o item pinado'
    );
    assert.match(sync.stdout, /\[ahc\] sync ok — .*pinned:1/, 'o resumo do sync deveria contar 1 pinado');
    assert.ok(!/\[removed\]/.test(sync.stdout), 'nada podia ter sido removido');

    // Aviso da cascata (T7): só existe quando alguma origem foi recusada.
    if (caso.recusadas.length) {
      assert.match(
        sync.stdout,
        /\[ahc\] aviso: hub autenticado via credencial git; origem\(ns\) recusada\(s\): embutido\./,
        'o sync deveria avisar que o embutido foi recusado'
      );
    } else {
      assert.ok(!/origem\(ns\) recusada/.test(sync.stdout), 'sem origem recusada, não pode haver aviso');
    }

    // ---- list ---------------------------------------------------------
    remote.clearAuthLog();
    const list = ahc(home, ['list'], env);
    assertOk(list, 'list');
    assert.deepEqual(remote.presentedSecrets(), caso.secrets, 'credenciais apresentadas pelo list, em ordem');
    assert.match(
      list.stdout,
      new RegExp(`${PINNED_ITEM}\\s+local:${PINNED_VERSION}\\s+remote:${REMOTE_VERSION} \\[pin:${PINNED_VERSION}\\]`),
      'o list deveria mostrar o pin e a versão nova do remoto'
    );

    // ---- doctor -------------------------------------------------------
    remote.clearAuthLog();
    const doctor = ahc(home, ['doctor'], env);
    assertOk(doctor, 'doctor');
    assert.deepEqual(remote.presentedSecrets(), caso.secrets, 'credenciais apresentadas pelo doctor, em ordem');
    assert.match(
      doctor.stdout,
      new RegExp(`✓ git auth \\(${s.hub.repo}@${s.hub.branch} reachable via ${caso.autenticou}`),
      'o doctor deveria nomear a origem que autenticou'
    );
    // `^✗ ` em multiline: só as linhas de check. A linha `Summary:` cita o
    // símbolo mesmo quando a contagem é zero.
    assert.ok(
      !/^✗ /m.test(doctor.stdout),
      `o doctor não pode ter nenhum ✗:\n${doctor.stdout}`
    );
    assert.match(doctor.stdout, /\nSummary: \d+ ✓ · \d+ ⚠ · 0 ✗/, 'o doctor deveria resumir zero ✗');
    if (caso.recusadas.length) {
      // AC-10 cenário B: ⚠ do embutido, sem mudar o exit code.
      assert.match(
        doctor.stdout,
        /⚠ git auth: origem recusada — embutido/,
        'o doctor deveria emitir ⚠ para o embutido recusado'
      );
    } else {
      assert.ok(
        !/origem recusada/.test(doctor.stdout),
        'sem origem recusada, o doctor não pode emitir o ⚠'
      );
    }

    // ---- estado do dev, depois dos três comandos ----------------------
    // Pin respeitado: arquivo e lock continuam na versão pinada.
    assert.equal(fs.readFileSync(s.pinnedFile, 'utf8'), s.pinnedBody, 'o item pinado não podia ter sido reescrito');
    const lock = readLock(home);
    assert.equal(lock.agents[PINNED_ITEM].version, PINNED_VERSION, 'o lock continua na versão pinada');
    assert.equal(lock.pins[PINNED_ITEM], PINNED_VERSION, 'o pin continua no lock');

    // Arquivo escrito à mão: intacto.
    assert.ok(fs.existsSync(s.handwrittenFile), 'o arquivo escrito à mão não podia ter sido apagado');
    assert.equal(fs.readFileSync(s.handwrittenFile, 'utf8'), manualAntes, 'o arquivo escrito à mão não podia ter mudado');

    // Nada de reinstalar nem apagar o cache: é o mesmo `.git` do clone antigo.
    assert.equal(
      fs.statSync(path.join(s.cache, '.git')).ino, s.cacheInode,
      'o cache do ahc anterior foi reaproveitado, não reclonado'
    );

    // A configuração git global do dev fica idêntica à de antes.
    assert.equal(sha256OfFile(s.gitconfig), gitconfigAntes, '~/.gitconfig não pode ter sido reescrito pelo ahc');
    assert.equal(sha256OfFile(s.store), storeAntes, 'o store do credential helper não pode ter sido tocado');

    // E nada de credencial persistida no cache (§7: nem `extraheader` nem
    // userinfo na URL do remoto).
    const cacheConfig = fs.readFileSync(path.join(s.cache, '.git', 'config'), 'utf8');
    assert.ok(!/extraheader/i.test(cacheConfig), 'o .git/config do cache não pode ganhar extraheader');
    assert.ok(!/@127\.0\.0\.1/.test(cacheConfig), 'o .git/config do cache não pode ganhar userinfo na URL');
    for (const secret of ALL_SECRETS) {
      assert.ok(!cacheConfig.includes(secret), `o .git/config do cache guardou ${secret}`);
    }
  });
}
