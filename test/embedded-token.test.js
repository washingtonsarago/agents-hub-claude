// Contrato do token embutido + modo de teste (T3 de 001-ahc-pat-auth).
//
// Isola duas invariantes que nenhum review pega de olho:
//   1. o marcador do token embutido aparece **uma única vez** em cada arquivo
//      (bin/ahc e install.sh) e os dois literais são **idênticos** — é o que
//      permite ao orquestrador gravar o valor na última tarefa sem que uma das
//      pontas fique para trás, e ao make-mirror esvaziar as duas;
//   2. o override de base `AHC_TEST_GIT_BASE_URL` só vale em loopback literal.
//      Fora disso é ignorado com aviso e o CLI volta a `https://github.com`, de
//      forma que nenhum token da cascata chegue a um host de terceiro.
//
// Todos os valores de token aqui são fictícios e montados em tempo de execução
// por concatenação: nenhum literal de credencial entra no repositório, e o
// teste nunca lê arquivo de credencial do usuário. Nenhuma requisição sai para
// a rede real — o fallback a github.com é neutralizado com um proxy morto em
// 127.0.0.1:1, e o único servidor no ar é o harness local.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  REPO_ROOT,
  DEFAULT_HUB_REPO,
  startAuthRemote,
  makeBareHub,
  makeTmpHome,
  baselineEnv,
  installCredHelper,
  writeConfig,
  runAhc,
  rmrf,
} = require('./helpers');

// ---- leitura dos marcadores ------------------------------------------------

// O nome do marcador é montado aqui para que este arquivo não conte como uma
// segunda ocorrência caso alguém rode o grep na árvore inteira.
const MARKER = ['AHC', 'EMBEDDED', 'TOKEN'].join('-');

const FILES = {
  'bin/ahc': new RegExp(`^const EMBEDDED_TOKEN = '([^']*)'; // ${MARKER}$`, 'm'),
  'install.sh': new RegExp(`^AHC_EMBEDDED_TOKEN='([^']*)' # ${MARKER}$`, 'm'),
};

// Formato aceito para o literal: vazio (origem indisponível, estado do BUILD)
// ou um PAT fine-grained. Um `ghp_`/`gho_` é um clássico de escopo amplo e não
// pode ser distribuído no código — C13 do threat model.
const FINE_GRAINED_RE = /^github_pat_[A-Za-z0-9_]+$/;

function countMarkers(text) {
  return text.split(MARKER).length - 1;
}

// Roda o contrato inteiro contra uma árvore (o repo, ou uma cópia temporária).
// Lança em qualquer violação, para poder ser usado tanto no caminho feliz
// quanto nos `assert.throws` das cópias adulteradas.
function checkEmbeddedTokenContract(root) {
  const literals = {};
  for (const [rel, re] of Object.entries(FILES)) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    const n = countMarkers(text);
    assert.equal(n, 1, `${rel}: o marcador ${MARKER} deve aparecer exatamente 1 vez (achei ${n})`);
    const m = re.exec(text);
    assert.ok(m, `${rel}: linha do marcador fora do formato exigido pelo task.md §5`);
    literals[rel] = m[1];
  }
  const [a, b] = Object.keys(FILES);
  assert.equal(
    literals[a],
    literals[b],
    `o literal embutido de ${a} e o de ${b} precisam ser idênticos`
  );
  const value = literals[a];
  assert.ok(
    value === '' || FINE_GRAINED_RE.test(value),
    `o literal embutido precisa ser vazio ou um PAT fine-grained (github_pat_…)`
  );
  return value;
}

// Cópia descartável só com os dois arquivos, com o literal trocado. Nunca toca
// a árvore do repositório.
function treeWithLiterals(ahcValue, shValue) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-embedded-'));
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  const subs = [
    ['bin/ahc', `const EMBEDDED_TOKEN = '';`, `const EMBEDDED_TOKEN = '${ahcValue}';`],
    ['install.sh', `AHC_EMBEDDED_TOKEN=''`, `AHC_EMBEDDED_TOKEN='${shValue}'`],
  ];
  for (const [rel, from, to] of subs) {
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.ok(text.includes(from), `${rel}: não achei a linha do marcador para a cópia de teste`);
    fs.writeFileSync(path.join(dir, rel), text.replace(from, to));
  }
  return dir;
}

test('marcador único em cada arquivo, literais idênticos e no formato aceito', () => {
  const value = checkEmbeddedTokenContract(REPO_ROOT);
  // Guarda do BUILD: nenhuma tarefa antes da última pode gravar valor.
  assert.equal(value, '', 'o BUILD entra com o literal vazio; o valor é gravado só na T14');
});

test('o contrato também passa com o literal preenchido', () => {
  // Fictício, montado em runtime: nada com cara de credencial fica no repo.
  const fake = 'github_pat_' + 'T'.repeat(22) + '_EMBUTIDO';
  const dir = treeWithLiterals(fake, fake);
  try {
    assert.equal(checkEmbeddedTokenContract(dir), fake);
  } finally {
    rmrf(dir);
  }
});

test('o contrato falha se os dois literais divergirem', () => {
  const dir = treeWithLiterals('github_pat_' + 'T_EMBUTIDO_A', 'github_pat_' + 'T_EMBUTIDO_B');
  try {
    assert.throws(() => checkEmbeddedTokenContract(dir), /idênticos/);
  } finally {
    rmrf(dir);
  }
});

test('o contrato falha com um PAT clássico no lugar do fine-grained', () => {
  const classic = 'ghp_' + 'T'.repeat(20) + 'EMBUTIDO';
  const dir = treeWithLiterals(classic, classic);
  try {
    assert.throws(() => checkEmbeddedTokenContract(dir), /fine-grained/);
  } finally {
    rmrf(dir);
  }
});

test('o contrato falha se o marcador aparecer duas vezes', () => {
  const dir = treeWithLiterals('', '');
  try {
    const p = path.join(dir, 'bin', 'ahc');
    fs.appendFileSync(p, `\n// const EMBEDDED_TOKEN = ''; // ${MARKER}\n`);
    assert.throws(() => checkEmbeddedTokenContract(dir), /exatamente 1 vez/);
  } finally {
    rmrf(dir);
  }
});

test('install.sh e bin/ahc barram o mesmo conjunto de bases no guard', () => {
  const ahc = fs.readFileSync(path.join(REPO_ROOT, 'bin', 'ahc'), 'utf8');
  const sh = fs.readFileSync(path.join(REPO_ROOT, 'install.sh'), 'utf8');
  // O mesmo regex, escrito no dialeto de cada linguagem. `localhost` fica de
  // fora dos dois: nome de host depende de resolução (C7).
  assert.ok(
    /\^http:\\\/\\\/\(127\\\.0\\\.0\\\.1\|\\\[::1\\\]\):\[0-9\]\{1,5\}\$/.test(ahc),
    'bin/ahc: regex do guard de loopback fora do contrato'
  );
  assert.ok(
    sh.includes("'^http://(127\\.0\\.0\\.1|\\[::1\\]):[0-9]{1,5}$'"),
    'install.sh: regex do guard de loopback fora do contrato'
  );
  for (const text of [ahc, sh]) {
    assert.ok(!/localhost/.test(text.split('\n').filter((l) => l.includes('127.0.0.1')).join('\n')),
      'nenhum dos guards pode aceitar nome de host');
  }
});

// ---- guard de loopback, contra o harness -----------------------------------

let remote;
let hub;

test.before(async () => {
  remote = await startAuthRemote({ accepted: ['C_DEV'] });
  hub = makeBareHub(remote);
});

test.after(async () => {
  if (hub) hub.cleanup();
  if (remote) await remote.close();
});

// Proxy morto: se o guard funcionar, o CLI cai para `https://github.com` e a
// tentativa morre em connection refused, sem tocar a rede real.
const DEAD_PROXY = 'http://127.0.0.1:1';

function syncWithBase(base, opts = {}) {
  const home = makeTmpHome();
  writeConfig(home, { repo: DEFAULT_HUB_REPO, branch: 'main', channel: 'stable' });
  installCredHelper(home);
  const env = baselineEnv(home, {
    baseURL: base,
    extra: {
      GIT_TERMINAL_PROMPT: '0',
      ...(opts.proxy === false
        ? {}
        : { HTTPS_PROXY: DEAD_PROXY, https_proxy: DEAD_PROXY, NO_PROXY: '', no_proxy: '' }),
      // Um token de teste solto no ambiente: sem base válida ele não pode
      // virar credencial para lugar nenhum.
      AHC_TEST_EMBEDDED_TOKEN: 'T_EMBUTIDO',
    },
  });
  const r = runAhc(home, ['sync', '--timeout=5'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
  });
  return { home, r, out: `${r.stdout || ''}${r.stderr || ''}` };
}

// Os três casos nomeados no T3, mais os três do C7, mais duas variantes que
// apontam para a **porta viva do harness**: sem elas, "nenhuma requisição
// chegou" seria verdade por acidente (a porta 1 não escuta nada).
function rejectedBases() {
  return [
    'http://127.0.0.1:1@evil.test',
    'https://127.0.0.1:1',
    'http://10.0.0.1:1',
    'http://localhost:1',
    'http://127.0.0.1:1/x',
    'http://127.0.0.1:1#@evil.test',
    `http://evil.test@127.0.0.1:${remote.port}`,
    `https://127.0.0.1:${remote.port}`,
    `http://localhost:${remote.port}`,
  ];
}

test('base fora do loopback literal é ignorada, com aviso, e nada chega ao harness', async (t) => {
  for (const base of rejectedBases()) {
    await t.test(base, () => {
      remote.clearAuthLog();
      const { home, r, out } = syncWithBase(base);
      try {
        assert.notEqual(r.status, 0, 'o sync deveria falhar: o fallback é github.com por um proxy morto');
        assert.match(out, /AHC_TEST_GIT_BASE_URL ignorada/, 'faltou o aviso em stderr');
        assert.match(out, /https:\/\/github\.com\//, 'o fallback deveria ser github.com');
        assert.ok(
          !out.includes(`:${remote.port}`),
          `o CLI não pode ter usado a base recusada (${base}):\n${out}`
        );
        assert.deepEqual(
          remote.presentedSecrets(),
          [],
          `o harness recebeu credencial com a base recusada ${base}`
        );
      } finally {
        rmrf(home);
      }
    });
  }
});

test('base em loopback literal é aceita, anunciada em stderr e usada de fato', () => {
  remote.clearAuthLog();
  const { home, r, out } = syncWithBase(remote.baseURL, { proxy: false });
  try {
    assert.equal(r.status, 0, `sync deveria passar contra o harness:\n${out}`);
    assert.ok(out.includes(`[ahc] modo de teste: base ${remote.baseURL}`), 'faltou a linha de modo de teste');
    assert.ok(!/https:\/\/github\.com\//.test(out), 'com override válido nada deve ir para o github.com');
    // Com a cascata da T6 no lugar, o `AHC_TEST_EMBEDDED_TOKEN` do ambiente
    // vira a origem "embutido" (a base é válida) e é apresentado primeiro; o
    // harness só aceita C_DEV, então a rodada seguinte, a da credencial git,
    // é que autentica. O que esta linha prova é que a base do harness foi
    // realmente usada — e, de quebra, que o token de teste só vai ao loopback.
    assert.deepEqual(remote.presentedSecrets(), ['T_EMBUTIDO', 'C_DEV']);
    assert.ok(
      fs.existsSync(path.join(home, '.claude', 'agents', 'test-agent.md')),
      'o sync pelo harness deveria ter instalado a fixture'
    );
  } finally {
    rmrf(home);
  }
});
