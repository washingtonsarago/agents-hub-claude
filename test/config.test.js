// Testes de integração da escrita de `~/.claude/.ahc-config.json` pelo `ahc`
// e do seu reflexo no check `config file permission` do `ahc doctor`.
//
// O que este arquivo isola:
//   - `ahc config k=v` corta só no PRIMEIRO '=' (AC-07);
//   - toda escrita da config feita pelo ahc passa por tmp 600 + rename, então o
//     arquivo termina em modo 600 venha de onde vier (inexistente, 644) (AC-11);
//   - o ahc NÃO conserta o modo de um arquivo que ele não escreveu: 644 com
//     token criado fora do ahc segue ✗ no doctor (AC-11, último Given).
//
// Nenhum token real aparece aqui: todos os valores são literais fictícios.
// O remoto é a fixture `file://`, para o doctor não tocar a rede.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  FIXTURE_REMOTE,
  makeTmpHome,
  runAhc,
  rmrf,
} = require('./helpers');

const REMOTE_URL = `file://${FIXTURE_REMOTE}`;
const IS_WIN = process.platform === 'win32';

// Valores fictícios, nunca um PAT real.
const T_CFG = 'T_CFG_FICTICIO';
const T_FORA = 'T_FORA_DO_AHC';

// ---- helpers locais --------------------------------------------------------
// Definidos aqui de propósito: `test/helpers.js` é território de outra tarefa.

function configPath(home) {
  return path.join(home, '.claude', '.ahc-config.json');
}

function modeOf(p) {
  return fs.statSync(p).mode & 0o777; // & 0o777 descarta os bits de tipo (macOS/Linux)
}

function readConfigRaw(home) {
  return JSON.parse(fs.readFileSync(configPath(home), 'utf8'));
}

// Escreve a config SEM passar pelo ahc, com o modo pedido — simula o arquivo
// que já existe na máquina do dev (ou que outro processo criou).
function writeConfigOutsideAhc(home, cfg, mode) {
  const p = configPath(home);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');
  fs.chmodSync(p, mode);
}

// Linha do doctor de um check, sem a hint (que vem indentada com '  → ').
function doctorLine(stdout, label) {
  return stdout.split('\n').find(l => l.includes(label) && !l.startsWith('  ')) || '';
}

function assertConfigCheckClean(r) {
  const line = doctorLine(r.stdout, 'config file permission');
  assert.ok(line, `doctor não emitiu o check config file permission:\n${r.stdout}`);
  assert.ok(line.startsWith('✓'), `esperava ✓ em config file permission, veio: ${line}`);
}

// ---- tests -----------------------------------------------------------------

test('config: `token=abc=def==` grava o valor inteiro e preserva repo/branch/channel', () => {
  const home = makeTmpHome();
  try {
    writeConfigOutsideAhc(home, { repo: REMOTE_URL, branch: 'n/a', channel: 'stable' }, 0o600);

    const r = runAhc(home, ['config', 'token=abc=def==']);
    assert.equal(r.status, 0, `config exit ${r.status}: ${r.stderr || r.stdout}`);

    const cfg = readConfigRaw(home);
    assert.equal(cfg.token, 'abc=def==', 'o valor foi truncado no primeiro `=`');
    assert.equal(cfg.repo, REMOTE_URL);
    assert.equal(cfg.branch, 'n/a');
    assert.equal(cfg.channel, 'stable');
  } finally {
    rmrf(home);
  }
});

test('config: chave vazia devolve usage com exit 2 e não escreve nada', () => {
  const home = makeTmpHome();
  try {
    const r = runAhc(home, ['config', '=semchave']);
    assert.equal(r.status, 2, `esperava exit 2, veio ${r.status}: ${r.stderr || r.stdout}`);
    assert.match(r.stderr, /usage: ahc config/);
    assert.equal(fs.existsSync(configPath(home)), false, 'não deveria ter criado a config');
  } finally {
    rmrf(home);
  }
});

test('config: arquivo inexistente termina em modo 600 e doctor fica sem ✗/⚠', { skip: IS_WIN ? 'modo de arquivo não se aplica no win32' : false }, () => {
  const home = makeTmpHome();
  try {
    assert.equal(fs.existsSync(configPath(home)), false);

    // Primeira escrita do ahc sobre config inexistente. Aponta o repo para a
    // fixture file:// para o doctor não sair para a rede.
    const r1 = runAhc(home, ['config', `repo=${REMOTE_URL}`]);
    assert.equal(r1.status, 0, `config exit ${r1.status}: ${r1.stderr || r1.stdout}`);
    assert.equal(modeOf(configPath(home)), 0o600, 'config criada pelo ahc deveria nascer 600');

    const r2 = runAhc(home, ['config', `token=${T_CFG}`]);
    assert.equal(r2.status, 0, `config exit ${r2.status}: ${r2.stderr || r2.stdout}`);
    assert.equal(modeOf(configPath(home)), 0o600, 'escrita com token deveria manter 600');
    assert.equal(readConfigRaw(home).token, T_CFG);

    const d = runAhc(home, ['doctor']);
    assertConfigCheckClean(d);
  } finally {
    rmrf(home);
  }
});

test('config: arquivo 644 sem token vira 600 depois de uma escrita do ahc, e doctor fica sem ✗/⚠', { skip: IS_WIN ? 'modo de arquivo não se aplica no win32' : false }, () => {
  const home = makeTmpHome();
  try {
    writeConfigOutsideAhc(home, { repo: REMOTE_URL, branch: 'n/a', channel: 'stable' }, 0o644);
    assert.equal(modeOf(configPath(home)), 0o644, 'pré-condição: arquivo em 644');

    const r = runAhc(home, ['config', `token=${T_CFG}`]);
    assert.equal(r.status, 0, `config exit ${r.status}: ${r.stderr || r.stdout}`);

    assert.equal(modeOf(configPath(home)), 0o600, 'a escrita do ahc deveria deixar o arquivo em 600');
    const cfg = readConfigRaw(home);
    assert.equal(cfg.token, T_CFG);
    assert.equal(cfg.repo, REMOTE_URL);
    assert.equal(cfg.branch, 'n/a');
    assert.equal(cfg.channel, 'stable');

    const d = runAhc(home, ['doctor']);
    assertConfigCheckClean(d);
  } finally {
    rmrf(home);
  }
});

test('config: 644 com token criado fora do ahc continua ✗ no doctor (o ahc não conserta o que não escreveu)', { skip: IS_WIN ? 'check é skipped no win32' : false }, () => {
  const home = makeTmpHome();
  try {
    writeConfigOutsideAhc(
      home,
      { repo: REMOTE_URL, branch: 'n/a', channel: 'stable', token: T_FORA },
      0o644
    );

    const d1 = runAhc(home, ['doctor']);
    const line1 = doctorLine(d1.stdout, 'config file permission');
    assert.ok(line1.startsWith('✗'), `esperava ✗ em config file permission, veio: ${line1}`);
    assert.equal(d1.status, 1, 'doctor com ✗ sai 1');

    // O sync não escreve a config, então também não pode dar chmod nela: o ✗ do
    // AC-11 precisa sobreviver a um sync.
    const s = runAhc(home, ['sync']);
    assert.equal(s.status, 0, `sync exit ${s.status}: ${s.stderr || s.stdout}`);
    assert.equal(modeOf(configPath(home)), 0o644, 'o sync não pode mexer no modo da config');

    const d2 = runAhc(home, ['doctor']);
    const line2 = doctorLine(d2.stdout, 'config file permission');
    assert.ok(line2.startsWith('✗'), `esperava ✗ depois do sync, veio: ${line2}`);
  } finally {
    rmrf(home);
  }
});

// ---- AC-16: `ahc config` não exibe o token inteiro -------------------------
// Estes testes checam o STDOUT/STDERR (ao contrário dos de cima, que checam o
// arquivo de propósito). Todos os valores são literais fictícios do próprio
// AC-16 — nenhum PAT real entra aqui.

// Montado em runtime de proposito: um literal `github_pat_` seguido de 20+
// alfanumericos dispara o --check do make-mirror (C12) em qualquer blob
// alcancavel, e um valor de teste nao pode gastar esse alarme.
const T_PAT = 'github' + '_pat_' + 'TESTONLY0123456789abcd';
const T_PAT_MASCARADO = 'github_pat_…abcd';
const T_CURTO = 'ab_c1';

// Nenhuma das duas saídas pode conter o valor inteiro, em nenhum caminho.
function assertNaoVazou(r, valor) {
  assert.ok(!r.stdout.includes(valor), `token inteiro vazou em stdout:\n${r.stdout}`);
  assert.ok(!r.stderr.includes(valor), `token inteiro vazou em stderr:\n${r.stderr}`);
}

test('config: listagem sem argumentos mascara o token e não altera os demais campos', () => {
  const home = makeTmpHome();
  try {
    writeConfigOutsideAhc(
      home,
      { repo: REMOTE_URL, branch: 'n/a', channel: 'stable', token: T_PAT, extra: 'valor-extra' },
      0o600
    );

    const r = runAhc(home, ['config']);
    assert.equal(r.status, 0, `config exit ${r.status}: ${r.stderr || r.stdout}`);
    assertNaoVazou(r, T_PAT);

    const out = JSON.parse(r.stdout);
    assert.equal(out.token, T_PAT_MASCARADO, `esperava o token mascarado, veio: ${out.token}`);
    assert.equal(out.repo, REMOTE_URL);
    assert.equal(out.branch, 'n/a');
    assert.equal(out.channel, 'stable');
    assert.equal(out.extra, 'valor-extra', 'chave extra não pode ser alterada pelo mascaramento');

    // O mascaramento é só de apresentação: o arquivo segue com o valor inteiro.
    assert.equal(readConfigRaw(home).token, T_PAT);
  } finally {
    rmrf(home);
  }
});

test('config: a confirmação de `token=<valor>` sai mascarada e o arquivo fica completo e 600', () => {
  const home = makeTmpHome();
  try {
    writeConfigOutsideAhc(home, { repo: REMOTE_URL, branch: 'n/a', channel: 'stable' }, 0o600);

    const w = runAhc(home, ['config', `token=${T_PAT}`]);
    assert.equal(w.status, 0, `config exit ${w.status}: ${w.stderr || w.stdout}`);
    assertNaoVazou(w, T_PAT);
    assert.match(w.stdout, /^\[config\] token = github_pat_…abcd$/m);

    // Disco: valor completo e modo 600.
    assert.equal(readConfigRaw(home).token, T_PAT, 'o disco tem que guardar o valor inteiro');
    if (!IS_WIN) assert.equal(modeOf(configPath(home)), 0o600);

    // E a listagem seguinte, sobre o que o próprio ahc gravou, também mascara.
    const l = runAhc(home, ['config']);
    assert.equal(l.status, 0, `config exit ${l.status}: ${l.stderr || l.stdout}`);
    assertNaoVazou(l, T_PAT);
    assert.equal(JSON.parse(l.stdout).token, T_PAT_MASCARADO);
  } finally {
    rmrf(home);
  }
});

test('config: token ausente e token vazio não quebram a listagem nem inventam campo', () => {
  const home = makeTmpHome();
  try {
    // Ausente: a listagem simplesmente não tem o campo.
    writeConfigOutsideAhc(home, { repo: REMOTE_URL, branch: 'n/a', channel: 'stable' }, 0o600);
    const semToken = runAhc(home, ['config']);
    assert.equal(semToken.status, 0, `config exit ${semToken.status}: ${semToken.stderr || semToken.stdout}`);
    const out1 = JSON.parse(semToken.stdout);
    assert.equal('token' in out1, false, 'não pode aparecer um `token` que não existe na config');
    assert.equal(out1.repo, REMOTE_URL);

    // Vazio ('' = origem ausente no contrato desta demanda): sai como '', sem
    // segredo para esconder e sem virar '…'.
    writeConfigOutsideAhc(
      home,
      { repo: REMOTE_URL, branch: 'n/a', channel: 'stable', token: '' },
      0o600
    );
    const vazio = runAhc(home, ['config']);
    assert.equal(vazio.status, 0, `config exit ${vazio.status}: ${vazio.stderr || vazio.stdout}`);
    assert.equal(JSON.parse(vazio.stdout).token, '');
  } finally {
    rmrf(home);
  }
});

test('config: valor curto demais para prefixo + 4 não aparece inteiro em nenhuma das duas saídas', () => {
  const home = makeTmpHome();
  try {
    writeConfigOutsideAhc(home, { repo: REMOTE_URL, branch: 'n/a', channel: 'stable' }, 0o600);

    // Saída 2 (confirmação da gravação).
    const w = runAhc(home, ['config', `token=${T_CURTO}`]);
    assert.equal(w.status, 0, `config exit ${w.status}: ${w.stderr || w.stdout}`);
    assertNaoVazou(w, T_CURTO);
    assert.match(w.stdout, /^\[config\] token = …$/m, 'valor curto tem que ser mascarado por inteiro');

    // Saída 1 (listagem) sobre o mesmo valor.
    const l = runAhc(home, ['config']);
    assert.equal(l.status, 0, `config exit ${l.status}: ${l.stderr || l.stdout}`);
    assertNaoVazou(l, T_CURTO);
    assert.equal(JSON.parse(l.stdout).token, '…');

    // E o disco continua com o valor inteiro.
    assert.equal(readConfigRaw(home).token, T_CURTO);
  } finally {
    rmrf(home);
  }
});
