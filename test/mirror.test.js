// Integration tests for `scripts/make-mirror.js`.
//
// O espelho é o canal de instalação de quem está fora da org. Um slug que escapa
// aqui manda o usuário externo sincronizar de um repo que ele não acessa — falha
// silenciosa, na máquina de outra pessoa. Por isso o transform é testado, não
// revisado no olho.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPO_ROOT, makeTmpRepo, rmrf } = require('./helpers');

const SCRIPT = path.join(REPO_ROOT, 'scripts', 'make-mirror.js');
const OWNER = 'someone-else';

function run(cwd, args, env = {}) {
  return spawnSync('node', [SCRIPT, ...args], {
    cwd, encoding: 'utf8', timeout: 30000, env: { ...process.env, ...env },
  });
}

// O marcador e o valor fictício são montados em runtime: nenhum literal
// `AHC-EMBEDDED-TOKEN` com valor nem prefixo de PAT entra na árvore do canônico —
// o próprio `--check` acusaria este arquivo como segredo no histórico.
const MARK = 'AHC-EMBEDDED' + '-TOKEN';
// Fictício. Tem o formato de um fine-grained real (prefixo + 82 caracteres) só para
// exercitar as duas regras do --check: a do marcador e a do padrão de PAT solto.
const T_EMBUTIDO = 'github' + '_pat_' + 'T_EMBUTIDO' + '0'.repeat(72);
const ahcTokenLine = (v) => `const EMBEDDED_TOKEN = '${v}'; // ${MARK}`;
const shTokenLine = (v) => `AHC_EMBEDDED_TOKEN='${v}' # ${MARK}`;

// Repo mínimo com só o que o transform toca. `token` é o valor que entra nos dois
// marcadores — '' reproduz a árvore do canônico antes do T14.
function makeRepo(token = '') {
  const dir = makeTmpRepo();
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.githooks'), { recursive: true });

  fs.writeFileSync(path.join(dir, 'install.sh'),
    'REPO="${AHC_REPO:-EMS-NCTECH/agents-hub-claude}"\n' + shTokenLine(token) + '\n');
  fs.writeFileSync(path.join(dir, 'bin', 'ahc'),
    "const DEFAULT_CONFIG = { repo: 'EMS-NCTECH/agents-hub-claude' };\n" + ahcTokenLine(token) + '\n');
  fs.writeFileSync(path.join(dir, 'README.md'), [
    '# agents-hub-claude',
    '',
    'Usados pela engenharia da EMS-NCTECH. O repo é INTERNAL na org EMS-NCTECH.',
    '',
    'gh repo clone EMS-NCTECH/agents-hub-claude ahc-boot',
    '',
    '- `origin.test.js` — todo slug aponta pra `EMS-NCTECH`.',
    '- `sync.test.js` — install fresco.',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'manifest.json'),
    JSON.stringify({ version: 1, repo: 'EMS-NCTECH/agents-hub-claude', agents: [] }, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'test', 'origin.test.js'), '// guard\n');
  fs.writeFileSync(path.join(dir, '.githooks', 'pre-push'), '#!/usr/bin/env bash\n');
  return dir;
}

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

test('mirror: --apply reescreve os slugs dos arquivos de instalação', () => {
  const dir = makeRepo();
  try {
    const r = run(dir, [`--owner=${OWNER}`, '--apply']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(read(dir, 'install.sh'), new RegExp(`${OWNER}/agents-hub-claude`));
    assert.match(read(dir, 'bin/ahc'), new RegExp(`${OWNER}/agents-hub-claude`));
    assert.equal(JSON.parse(read(dir, 'manifest.json')).repo, `${OWNER}/agents-hub-claude`);
  } finally { rmrf(dir); }
});

test('mirror: preserva menções em prosa ao owner canônico', () => {
  const dir = makeRepo();
  try {
    run(dir, [`--owner=${OWNER}`, '--apply']);
    const readme = read(dir, 'README.md');
    // Trocar o nome da org na prosa foi o que quebrou as frases do espelho antigo
    // ("O repo é INTERNAL na org ,"). Só slug muda.
    assert.match(readme, /engenharia da EMS-NCTECH/);
    assert.match(readme, /INTERNAL na org EMS-NCTECH/);
    assert.doesNotMatch(readme, new RegExp(`engenharia da ${OWNER}`));
  } finally { rmrf(dir); }
});

test('mirror: não sobra slug canônico no que a máquina lê', () => {
  const dir = makeRepo();
  try {
    run(dir, [`--owner=${OWNER}`, '--apply']);
    for (const rel of ['install.sh', 'bin/ahc']) {
      assert.doesNotMatch(read(dir, rel), /EMS-NCTECH\/agents-hub-claude/,
        `${rel} ainda manda o usuário externo sincronizar do repo canônico`);
    }
  } finally { rmrf(dir); }
});

test('mirror: comandos de clone do README apontam pro espelho', () => {
  const dir = makeRepo();
  try {
    run(dir, [`--owner=${OWNER}`, '--apply']);
    const readme = read(dir, 'README.md');
    assert.match(readme, new RegExp(`gh repo clone ${OWNER}/agents-hub-claude`));
    // A única referência canônica que sobra é a do aviso, apontando pra onde
    // contribuir — informativa, não executável.
    const canonical = [...readme.matchAll(/EMS-NCTECH\/agents-hub-claude/g)];
    assert.equal(canonical.length, 2, 'só o link do aviso (texto + href)');
  } finally { rmrf(dir); }
});

test('mirror: remove as travas que só valem no canônico', () => {
  const dir = makeRepo();
  try {
    run(dir, [`--owner=${OWNER}`, '--apply']);
    assert.equal(fs.existsSync(path.join(dir, 'test/origin.test.js')), false,
      'origin.test.js falharia contra o próprio install.sh do espelho');
    assert.equal(fs.existsSync(path.join(dir, '.githooks/pre-push')), false,
      'pre-push bloquearia o push pro espelho');
  } finally { rmrf(dir); }
});

test('mirror: README ganha o aviso e perde a linha do teste removido', () => {
  const dir = makeRepo();
  try {
    run(dir, [`--owner=${OWNER}`, '--apply']);
    const readme = read(dir, 'README.md');
    assert.match(readme, /Cópia de distribuição externa/);
    assert.doesNotMatch(readme, /`origin\.test\.js`/, 'descreveria um arquivo que não existe mais');
    assert.match(readme, /`sync\.test\.js`/, 'as outras linhas da lista continuam');
  } finally { rmrf(dir); }
});

test('mirror: --apply é idempotente', () => {
  const dir = makeRepo();
  try {
    run(dir, [`--owner=${OWNER}`, '--apply']);
    const first = read(dir, 'README.md');
    const r = run(dir, [`--owner=${OWNER}`, '--apply']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /nada a fazer/);
    assert.equal(read(dir, 'README.md'), first, 'o aviso não pode ser inserido duas vezes');
  } finally { rmrf(dir); }
});

test('mirror: --check falha em tree não transformada e passa na transformada', () => {
  const dir = makeRepo();
  try {
    let r = run(dir, [`--owner=${OWNER}`, '--check']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /NÃO está transformada/);

    run(dir, [`--owner=${OWNER}`, '--apply']);
    r = run(dir, [`--owner=${OWNER}`, '--check']);
    assert.equal(r.status, 0, r.stderr);
  } finally { rmrf(dir); }
});

test('mirror: recusa gerar espelho com o owner canônico', () => {
  const dir = makeRepo();
  try {
    const r = run(dir, ['--owner=EMS-NCTECH', '--apply']);
    assert.equal(r.status, 2);
    assert.match(read(dir, 'install.sh'), /EMS-NCTECH\/agents-hub-claude/, 'nada pode ter sido escrito');
  } finally { rmrf(dir); }
});

test('mirror: exige --owner', () => {
  const dir = makeRepo();
  try {
    const r = run(dir, ['--apply']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /uso:/);
  } finally { rmrf(dir); }
});

// --- T12 / C12: o PAT da org não sai da org numa cópia manual ------------------
//
// O token embutido é um PAT cujo dono dos recursos é a EMS-NCTECH. O espelho vive
// em outro owner: se o valor viajar na cópia, o segredo da org sai dela. Esvaziar
// só a árvore não basta — o espelho sai de uma branch derivada, então o commit que
// gravou o valor (T14) iria junto no histórico.

function gitIn(dir, args) {
  const r = spawnSync('git', args, {
    cwd: dir, encoding: 'utf8', timeout: 30000,
    // HOME próprio: o ~/.gitconfig de quem roda os testes não entra na fixture.
    env: {
      ...process.env, HOME: dir, GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'ahc test', GIT_AUTHOR_EMAIL: 'test@localhost',
      GIT_COMMITTER_NAME: 'ahc test', GIT_COMMITTER_EMAIL: 'test@localhost',
    },
  });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

// Fixture do C12: commit 1 traz o valor nos dois marcadores, commit 2 esvazia.
// É a forma do repo depois do T14 + um "conserto" só na árvore.
function makeGitRepoWithTokenInHistory() {
  const dir = makeRepo(T_EMBUTIDO);
  gitIn(dir, ['-c', 'init.defaultBranch=main', 'init', '-q']);
  gitIn(dir, ['add', '-A']);
  gitIn(dir, ['commit', '-q', '-m', 'commit 1: token embutido gravado']);

  for (const [rel, line] of [['install.sh', shTokenLine('')], ['bin/ahc', ahcTokenLine('')]]) {
    const p = path.join(dir, rel);
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/^.*AHC-EMBEDDED-TOKEN.*$/m, line));
  }
  gitIn(dir, ['add', '-A']);
  gitIn(dir, ['commit', '-q', '-m', 'commit 2: marcadores esvaziados na arvore']);
  return dir;
}

function filesOf(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) filesOf(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

test('mirror: --apply esvazia o valor do token embutido nos dois marcadores', () => {
  const dir = makeRepo(T_EMBUTIDO);
  try {
    const r = run(dir, [`--owner=${OWNER}`, '--apply']);
    assert.equal(r.status, 0, r.stderr);
    // Linha byte a byte igual à do canônico com literal vazio — o
    // `embedded-token.test.js` do espelho continua exigindo marcador único e
    // literais idênticos nos dois arquivos.
    const lineOf = (rel) => read(dir, rel).split('\n').find((l) => l.includes(MARK));
    assert.equal(lineOf('bin/ahc'), ahcTokenLine(''));
    assert.equal(lineOf('install.sh'), shTokenLine(''));
  } finally { rmrf(dir); }
});

test('mirror: nenhum arquivo da cópia contém o valor do token', () => {
  const dir = makeRepo(T_EMBUTIDO);
  try {
    run(dir, [`--owner=${OWNER}`, '--apply']);
    for (const p of filesOf(dir)) {
      assert.ok(!fs.readFileSync(p, 'utf8').includes(T_EMBUTIDO),
        `${path.relative(dir, p)} leva o PAT da org pra fora dela`);
    }
  } finally { rmrf(dir); }
});

test('mirror: --check falha se um marcador tiver valor', () => {
  const dir = makeRepo(T_EMBUTIDO);
  try {
    // Tree já transformada em tudo menos no token: o --check tem que reprovar
    // por causa do marcador, sozinho.
    run(dir, [`--owner=${OWNER}`, '--apply']);
    fs.writeFileSync(path.join(dir, 'bin', 'ahc'),
      read(dir, 'bin/ahc').replace(ahcTokenLine(''), ahcTokenLine(T_EMBUTIDO)));

    const r = run(dir, [`--owner=${OWNER}`, '--check']);
    assert.notEqual(r.status, 0, 'espelho com token não pode passar no --check');
    assert.match(r.stderr, /token embutido com valor/);
    assert.ok(!r.stderr.includes(T_EMBUTIDO) && !r.stdout.includes(T_EMBUTIDO),
      'o --check não pode ecoar o valor que ele está acusando');
  } finally { rmrf(dir); }
});

test('mirror: --check varre o histórico alcançável, não só a árvore', () => {
  const dir = makeGitRepoWithTokenInHistory();
  try {
    // A árvore de trabalho já está limpa...
    assert.ok(read(dir, 'bin/ahc').includes(ahcTokenLine('')));
    assert.ok(read(dir, 'install.sh').includes(shTokenLine('')));
    // ...e mesmo assim o valor está a um `git log` de distância.
    const r = run(dir, [`--owner=${OWNER}`, '--check'], { HOME: dir });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /histórico alcançável/);
    assert.match(r.stderr, /marcador AHC-EMBEDDED-TOKEN com valor/);
    assert.ok(!r.stderr.includes(T_EMBUTIDO), 'nem no relato o valor aparece');
  } finally { rmrf(dir); }
});

test('mirror: --check acusa PAT fora dos marcadores no histórico', () => {
  // O marcador é o caminho previsto, não o único: um valor colado num doc ou numa
  // fixture sai da org do mesmo jeito. Aqui o commit 2 apaga o arquivo — só o
  // histórico denuncia.
  const dir = makeRepo();
  try {
    gitIn(dir, ['-c', 'init.defaultBranch=main', 'init', '-q']);
    fs.writeFileSync(path.join(dir, 'NOTA.md'), `token de teste: ${T_EMBUTIDO}\n`);
    gitIn(dir, ['add', '-A']);
    gitIn(dir, ['commit', '-q', '-m', 'commit 1: valor colado num doc']);
    fs.rmSync(path.join(dir, 'NOTA.md'));
    gitIn(dir, ['add', '-A']);
    gitIn(dir, ['commit', '-q', '-m', 'commit 2: arquivo removido da arvore']);

    const r = run(dir, [`--owner=${OWNER}`, '--check'], { HOME: dir });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /padrão de PAT fine-grained/);
    assert.ok(!r.stderr.includes(T_EMBUTIDO));
  } finally { rmrf(dir); }
});

test('mirror: --apply sai como commit órfão e o valor não sobrevive no histórico', () => {
  const dir = makeGitRepoWithTokenInHistory();
  try {
    const r = run(dir, [`--owner=${OWNER}`, '--apply'], { HOME: dir });
    assert.equal(r.status, 0, r.stderr);

    assert.equal(gitIn(dir, ['rev-list', '--count', '--all']).trim(), '1',
      'a cópia tem que sair com um único commit, sem o histórico do canônico');
    assert.ok(!gitIn(dir, ['log', '--all', '-p']).includes(T_EMBUTIDO),
      'o commit que gravou o token ainda é alcançável na cópia');

    assert.ok(read(dir, 'bin/ahc').includes(ahcTokenLine('')));
    assert.ok(read(dir, 'install.sh').includes(shTokenLine('')));

    const c = run(dir, [`--owner=${OWNER}`, '--check'], { HOME: dir });
    assert.equal(c.status, 0, c.stderr);
  } finally { rmrf(dir); }
});
