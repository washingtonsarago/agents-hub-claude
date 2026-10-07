// Invariantes de conteúdo de `agents/mobile-qa-analyst.md` (demanda
// 007-mobile-qa-maestro): AC-03, a parte estática de AC-04 e AC-05, AC-06 e os
// controles SC-01…SC-13 da §7.2 que são literal verificável no texto do agent.
//
// O que este arquivo isola: o *texto* de um prompt. Não há harness que rode o
// agent contra um dispositivo, então todo caso aqui é predicado determinístico
// sobre o conteúdo do artefato. O que depende de modelo (AC-01, AC-02, a metade
// comportamental do AC-04) e o que é comando de uma vez só (`validate-artifacts
// --strict` do AC-05) ficam na §8 do `task.md`, não aqui.
//
// Fonte dos literais: §5.2, §5.2.1 e §5.3 do `task.md` da 007, com a §7.2
// PREVALECENDO onde divergir (decisão do lead após a Phase 2.5). Exemplo
// concreto da precedência: a §5.2.1 item 4 ainda deixava `curl … | bash`
// rotulado "unverified"; o SC-01 tira o pipe do arquivo inteiro, então o teste
// do AC-06 ("pipe só depois de brew/sha256") é substituído pelo do SC-01, que é
// estritamente mais rígido. SC-04 não está aqui: é entrada no `architecture.md`
// (risco residual aceito), conferida por inspeção na VERIFY.
//
// Por que nenhuma asserção toca em `git`: diff é propriedade de um PR, não do
// artefato (`guidelines.md` §Anti-patterns, lição da 003). O seam
// `MOBILE_QA_MD_UNDER_TEST` aponta para outro arquivo; a PROVA DE RED da 007
// roda com ele apontando para um caminho inexistente (na BASE o agent não
// existe), e cada caso tem de ficar vermelho com mensagem legível, não ENOENT:
//   MOBILE_QA_MD_UNDER_TEST=$T/ausente.md node --test test/mobile-qa-analyst.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers');
const { PT_STOPWORDS, PT_DIACRITICS, withoutCodeSpans } = require('./support/flow-texts');

const AGENT_PATH =
  process.env.MOBILE_QA_MD_UNDER_TEST || path.join(REPO_ROOT, 'agents', 'mobile-qa-analyst.md');
const EVALSET_PATH = path.join(REPO_ROOT, 'scripts', 'routing-eval', 'evalset.json');

// Headings na ordem da tabela "Corpo" da §5.2. A ordem faz parte do contrato
// ("headings nesta ordem"): é o molde dos QA do hub mais as seções de Maestro.
const H = {
  title: '# Mobile QA Analyst',
  mission: '## Mission',
  memory: '## Memory discipline',
  principles: '## Core principles',
  standards: '## Maestro standards',
  selectors: '## Selectors by stack',
  notTool: '## When Maestro is not the tool',
  device: '## Device check and not-executed status',
  limits: '## Known limitations',
  install: '## Installing Maestro',
  workflow: '## Workflow',
  matrix: '## Traceability matrix (AC → flow)',
  boundaries: '## Boundaries',
  collab: '## Collaboration protocol',
  output: '## Output standards',
  anti: '## Anti-patterns',
};

// O token de NÃO EXECUTADO que a §5.2 fixa: caixa alta e sempre entre crases,
// o mesmo no agent, no `flow.md` e no `trivial-lane.md`, para um `grep` achar os três.
const NOT_EXECUTED = '`NÃO EXECUTADO`';

// --- Literais pinados (§5.3 e §7.2) ----------------------------------------
const AC04_CHECK = 'Check for a device before running';
const AC04_NO_DEVICE =
  'Without a device, write the flow, mark it `NÃO EXECUTADO` with the cause, and report no result.';
const AC04_NOT_RED =
  'A flow marked `NÃO EXECUTADO` is not RED proof and does not close the Phase 4 gate.';
const AC04_ANTI = 'Declaring a test green, passed or approved without execution output.';
const NEVER_INSTALL =
  'Never install Maestro, an Android SDK, Xcode components or a device driver unless the user explicitly asks';
const BOUNDARY_LINES = [
  '- **`cypress-qa-analyst`:** web apps, and PWAs or sites in the phone browser. A WebView inside a native app is ours.',
  '- **`ux-designer-mobile`:** experience, flow and accessibility. We consume identifiers and request the missing ones.',
  '- **`flutter-dart-engineer`** (or the BUILD stack dev when it is not installed): unit, widget and `integration_test` next to the code, and adding `Semantics(identifier:)`.',
];
const MATRIX_HEADER = '| AC | Flow file | Platform | Status |';
const SC02_WRONG_CASK =
  'If `brew list --cask maestro` finds a cask, a different product is installed: tell the user and do not uninstall it.';
const SC03_CI = 'In CI, pin the version, verify the checksum and read credentials from the CI secret store.';
const SC06_CLOUD =
  'Never run `maestro cloud` or `maestro login`, upload an app or flow, or pass an API key to Maestro Cloud unless the user explicitly asks.';
const SC07_CREDS =
  'Credentials come from the shell environment or the CI secret store, never typed on the command line or committed; keep `.env` in `.gitignore`.';
const SC08_ARTIFACTS =
  'Screenshots, recordings and logs in `~/.maestro/tests/` hold what the app showed and typed: never commit them or attach them outside the team.';
const SC09_TEST_ACCOUNTS = 'Run flows only with test accounts and fictitious data against a non-production backend.';
const SC10_FLOWS_ARE_CODE =
  'Flows are code: read every `runScript`, `evalScript` and `http` call before running a flow you did not write.';
const SC11_PHYSICAL = 'Prefer an emulator or simulator; if the only device is a physical phone, ask before running.';
const SC13_EVIDENCE = 'Every `executado` status cites the exact command and its exit code.';
const NO_ANALYTICS = 'MAESTRO_CLI_NO_ANALYTICS=true';

// --- Leitura e recorte -----------------------------------------------------

// Arquivo ausente vira asserção legível: a PROVA DE RED roda contra a BASE,
// onde o agent não existe, e a saída vermelha tem de nomear o que falta.
function readAgent() {
  assert.ok(fs.existsSync(AGENT_PATH), `agent ausente: ${AGENT_PATH}`);
  return fs.readFileSync(AGENT_PATH, 'utf8');
}

function splitFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, 'frontmatter (--- … ---) ausente');
  return { fm: m[1], body: text.slice(m[0].length) };
}

// Seção `## `: do heading até o próximo `## `. Corta só no nível 2, de
// propósito: um `###` dentro de `## Installing Maestro` é subdivisão da mesma
// seção, e cortar nele esconderia o `shasum` do predicado de ordem do SC-03.
// Fence-aware porque um bloco de código pode ter `#` de comentário de shell.
function section(text, heading) {
  const lines = text.split('\n');
  const start = lines.indexOf(heading);
  assert.notEqual(start, -1, `heading ausente: ${heading}`);
  let end = lines.length;
  let fenced = false;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^```/.test(lines[i])) { fenced = !fenced; continue; }
    if (!fenced && /^#{1,2} /.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

// Blocos cercados, com a linguagem do fence. SC-05 e SC-07 falam de "bloco de
// código" (§7.2), e o SC-07 distingue os `yaml`.
function fencedBlocks(text) {
  const blocks = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^```\s*([\w-]*)/);
    if (m && !cur) { cur = { lang: m[1].toLowerCase(), lines: [] }; continue; }
    if (m && cur) { blocks.push(cur); cur = null; continue; }
    if (cur) cur.lines.push(line);
  }
  return blocks;
}

function withoutFences(text) {
  return text.replace(/^```[\s\S]*?^```/gm, '');
}

function has(text, literal, where) {
  assert.ok(text.includes(literal), `literal ausente em ${where}: ${JSON.stringify(literal)}`);
}

// "Token X só em linha que contém Y" (SC-01, SC-06, SC-11): devolve as linhas
// que violam, para a mensagem vermelha apontar a linha, não só o token.
function linesWithout(text, tokenRe, guardRe) {
  return text.split('\n').filter((l) => tokenRe.test(l) && !guardRe.test(l));
}

// --- AC-05 (parte estática): frontmatter e description ---------------------

test('AC-05 — frontmatter: name, model×tier, team qa e color no molde dos QA', () => {
  const { fm } = splitFrontmatter(readAgent());
  const lines = fm.split('\n');
  // sonnet×speed é o par dos dois QA do hub (MODELS_BY_TIER.speed em
  // `scripts/validate-artifacts.js`); team qa é o bucket deles.
  for (const l of ['name: mobile-qa-analyst', 'model: sonnet', 'tier: speed', 'team: qa', 'color: orange']) {
    assert.ok(lines.includes(l), `linha de frontmatter ausente: ${l}`);
  }
});

test('AC-05 — description: L1, escopo, exclusão, exemplos PT-BR, ≤ 1.200 e sem prompt do evalset', () => {
  const { fm } = splitFrontmatter(readAgent());
  const raw = fm.split('\n').find((l) => l.startsWith('description: '));
  assert.ok(raw, 'campo description ausente');
  const quoted = raw.slice('description: '.length).trim();
  assert.ok(quoted.startsWith('"'), 'description não é string JSON numa linha física');
  const desc = JSON.parse(quoted);

  assert.ok(desc.length <= 1200, `description com ${desc.length} caracteres decodificados (> 1.200)`);
  assert.ok(desc.startsWith('Use when'), 'description não começa em inglês com "Use when"');
  // O `regen-manifest` corta a L1 em 160: frase completa antes do corte (lição da 002).
  const l1 = desc.split('\n')[0];
  assert.ok(l1.length <= 160, `L1 com ${l1.length} caracteres (> 160)`);
  assert.ok(l1.endsWith('.'), 'L1 não termina em "."');
  for (const lit of ['Maestro', 'Flutter', 'React Native', 'cypress-qa-analyst', 'ux-designer-mobile']) {
    has(desc, lit, 'description');
  }

  // Exemplos: o pedido do usuário é o que o dev digita, e o dev digita em PT-BR.
  // Stopword OU diacrítico: os mesmos dois predicados de idioma da 003/006.
  const userLines = desc.split('\n').filter((l) => l.includes('user: "'));
  const ptUser = userLines.filter((l) => {
    const quotedUser = l.slice(l.indexOf('user: "'));
    return new RegExp(PT_STOPWORDS.source, 'i').test(quotedUser) || new RegExp(PT_DIACRITICS.source).test(quotedUser);
  });
  assert.ok(ptUser.length >= 2, `esperava ≥ 2 exemplos user: "…" em PT-BR, achei ${ptUser.length}`);

  // O eval mede generalização: um prompt copiado para a description é o
  // roteador lendo a resposta. O evalset é lido em tempo de teste, então os
  // casos novos da 007 (T3) entram na checagem sem editar este arquivo.
  const evalset = JSON.parse(fs.readFileSync(EVALSET_PATH, 'utf8'));
  const copied = evalset.filter((c) => c.prompt && desc.includes(c.prompt)).map((c) => c.id);
  assert.deepEqual(copied, [], `prompt do evalset copiado na description: ${copied.join(', ')}`);
});

// --- AC-03 -----------------------------------------------------------------

test('AC-03 — corpo: headings do molde QA + seções Maestro, nesta ordem', () => {
  const { body } = splitFrontmatter(readAgent());
  const lines = body.split('\n');
  let last = -1;
  for (const h of Object.values(H)) {
    const i = lines.indexOf(h);
    assert.notEqual(i, -1, `heading ausente: ${h}`);
    assert.ok(i > last, `heading fora de ordem: ${h}`);
    last = i;
  }
  has(section(body, H.memory), 'project-memory-keeper', H.memory);
});

test('AC-03 — corpo em inglês: sem stopword nem diacrítico PT fora de code span e bloco de código', () => {
  const { body } = splitFrontmatter(readAgent());
  // Code spans saem pela regra da §5.2 (os rótulos PT-BR de status vivem entre
  // crases). Blocos cercados também saem: são flow YAML e shell, artefato
  // executável com dado fictício (possivelmente PT-BR), não instrução ao modelo.
  const bare = withoutCodeSpans(withoutFences(body));
  const pt = [...new Set((bare.match(PT_STOPWORDS) || []).map((w) => w.toLowerCase()))];
  assert.deepEqual(pt, [], `instrução em PT-BR no corpo: ${JSON.stringify(pt)}`);
  const accents = [...new Set(bare.match(PT_DIACRITICS) || [])];
  assert.deepEqual(accents, [], `diacrítico PT no corpo: ${JSON.stringify(accents)}`);
});

test('AC-03 — Maestro como ferramenta: flows YAML, maestro test e espera embutida', () => {
  const { body } = splitFrontmatter(readAgent());
  has(body, 'Maestro', 'corpo');
  const principles = section(body, H.principles);
  for (const lit of ['assertVisible', 'extendedWaitUntil', 'sleep', 'launchApp', 'clearState']) has(principles, lit, H.principles);
  const std = section(body, H.standards);
  for (const lit of ['appId', 'launchApp', 'tapOn', 'inputText', 'assertVisible', 'runFlow', 'maestro test', '.maestro/', '${']) {
    has(std, lit, H.standards);
  }
  // O exemplo mostra o seletor estável na forma mapa (`tapOn:` + `id:`), e não
  // só seletor por texto, que quebra com qualquer mudança de copy (REVIEW 007,
  // passagem 2).
  const yamlLines = fencedBlocks(std).filter((b) => b.lang === 'yaml' || b.lang === 'yml').flatMap((b) => b.lines);
  const byId = yamlLines.some((l, i) => /^- tapOn:\s*$/.test(l) && /^\s+id:\s*\S/.test(yamlLines[i + 1] || ''));
  assert.ok(byId, 'o flow de exemplo não tem `tapOn:` com `id:` num bloco yaml');
});

test('AC-03 — seletor por stack e a limitação do Key no Flutter', () => {
  const sel = section(splitFrontmatter(readAgent()).body, H.selectors);
  for (const lit of [
    'Semantics(identifier:)', 'Flutter 3.19', 'Maestro does not see a Flutter `Key`',
    'testID', 'resource-id', 'accessibilityIdentifier',
  ]) has(sel, lit, H.selectors);
});

test('AC-03 — fallback para integration_test/Patrol, escrito por quem escreve o código', () => {
  const sec = section(splitFrontmatter(readAgent()).body, H.notTool);
  for (const lit of ['integration_test', 'Patrol', 'flutter-dart-engineer']) has(sec, lit, H.notTool);
});

test('AC-03 — limitações conhecidas da doc oficial', () => {
  const sec = section(splitFrontmatter(readAgent()).body, H.limits);
  for (const lit of [
    'iOS runs on the simulator only', 'ASCII only on Android', 'WebView',
    'https://docs.maestro.dev/extra-materials/troubleshooting/known-issues.md',
  ]) has(sec, lit, H.limits);
});

test('AC-03 — matriz AC → flow com cabeçalho e status pinados', () => {
  const sec = section(splitFrontmatter(readAgent()).body, H.matrix);
  assert.ok(sec.split('\n').includes(MATRIX_HEADER), `cabeçalho da matriz ausente: ${MATRIX_HEADER}`);
  for (const lit of ['`executado: passou`', '`executado: falhou`', '`NÃO EXECUTADO: <causa>`']) has(sec, lit, H.matrix);
});

test('AC-03 — fronteiras: as três linhas exatas', () => {
  const lines = section(splitFrontmatter(readAgent()).body, H.boundaries).split('\n');
  for (const l of BOUNDARY_LINES) assert.ok(lines.includes(l), `linha de fronteira ausente: ${l}`);
});

test('AC-03 — literal de NÃO EXECUTADO no corpo, sempre entre crases', () => {
  const { body } = splitFrontmatter(readAgent());
  has(body, NOT_EXECUTED, 'corpo');
  // Fora de crase o token vira prosa PT-BR e o grep dos três arquivos perde a garantia.
  const bare = withoutCodeSpans(withoutFences(body));
  assert.ok(!bare.includes('NÃO EXECUTADO'), 'NÃO EXECUTADO fora de crases no corpo');
});

// --- AC-04 (parte estática) ------------------------------------------------

test('AC-04 — nunca verde sem execução: checar dispositivo, NÃO EXECUTADO, não é RED', () => {
  const { body } = splitFrontmatter(readAgent());
  const dev = section(body, H.device);
  for (const lit of [AC04_CHECK, AC04_NO_DEVICE, AC04_NOT_RED, 'adb devices', 'xcrun simctl list devices booted']) {
    has(dev, lit, H.device);
  }
  has(section(body, H.anti), AC04_ANTI, H.anti);
  // Workflow: a checagem de dispositivo vem antes do rodar-ou-marcar. Regex e
  // não literal porque a §5.2 descreve a sequência, não fixa a frase.
  const wf = section(body, H.workflow);
  const iDevice = wf.search(/\bdevice\b/i);
  const iNotExec = wf.indexOf(NOT_EXECUTED);
  assert.ok(iDevice !== -1 && iNotExec !== -1 && iDevice < iNotExec, 'Workflow não checa dispositivo antes de marcar NÃO EXECUTADO');
});

// --- AC-06 + controles SC da §7.2 ------------------------------------------

test('AC-06 — instalação verificável primeiro, e o agent não instala por conta própria', () => {
  const inst = section(splitFrontmatter(readAgent()).body, H.install);
  // Ordem da §5.2.1: pré-requisito Java, depois Homebrew qualificado, depois
  // download pinado com checksum.
  const order = ['java -version', 'brew install mobile-dev-inc/tap/maestro', 'shasum -a 256 -c'];
  let last = -1;
  for (const lit of order) {
    const i = inst.indexOf(lit);
    assert.notEqual(i, -1, `literal ausente em ${H.install}: ${lit}`);
    assert.ok(i > last, `fora de ordem em ${H.install}: ${lit}`);
    last = i;
  }
  has(inst, NEVER_INSTALL, H.install);
});

test('SC-01 — nenhum pipe para shell; get.maestro.mobile.dev só em linha "Do not use"', () => {
  const text = readAgent();
  const piped = text.split('\n').filter((l) => /\|\s*(ba|z)?sh\b/.test(l));
  assert.deepEqual(piped, [], 'pipe para shell no agent');
  const script = linesWithout(text, /get\.maestro\.mobile\.dev/, /Do not use/);
  assert.deepEqual(script, [], 'get.maestro.mobile.dev fora de linha "Do not use"');
});

test('SC-02 — só a forma qualificada do Homebrew, com conferência pós-instalação', () => {
  const text = readAgent();
  const inst = section(splitFrontmatter(text).body, H.install);
  for (const lit of ['brew tap mobile-dev-inc/tap', 'brew install mobile-dev-inc/tap/maestro', 'maestro --version', SC02_WRONG_CASK]) {
    has(inst, lit, H.install);
  }
  // A forma curta instala um cask sem relação (runmaestro.ai), confirmado na 2.5.
  assert.ok(!/brew install\s+maestro\b/.test(text), 'forma curta `brew install maestro` presente no agent');
});

test('SC-03 — download com versão pinada e checksum antes de descompactar; nunca releases/latest', () => {
  const text = readAgent();
  const inst = section(splitFrontmatter(text).body, H.install);
  has(inst, 'releases/download/cli-', H.install);
  has(inst, SC03_CI, H.install);
  assert.ok(!text.includes('releases/latest'), '`releases/latest` presente no agent');
  const iSum = inst.indexOf('shasum -a 256 -c');
  const iUnzip = inst.indexOf('unzip');
  assert.ok(iSum !== -1 && iUnzip !== -1 && iSum < iUnzip, '`shasum -a 256 -c` não vem antes de `unzip` na seção');
});

test('SC-05 — analytics desligado: na instalação e em toda linha de código com maestro test', () => {
  const text = readAgent();
  has(section(splitFrontmatter(text).body, H.install), NO_ANALYTICS, H.install);
  const bad = fencedBlocks(text)
    .flatMap((b) => b.lines)
    .filter((l) => l.includes('maestro test') && !l.includes(NO_ANALYTICS));
  assert.deepEqual(bad, [], `linha de bloco de código com \`maestro test\` sem ${NO_ANALYTICS}`);
});

test('SC-06 — nada vai ao Maestro Cloud sem pedido', () => {
  const text = readAgent();
  has(section(splitFrontmatter(text).body, H.anti), SC06_CLOUD, H.anti);
  const bad = linesWithout(text, /maestro cloud|maestro login|action-maestro-cloud|--api-key|MAESTRO_CLOUD_API_KEY/, /Never/);
  assert.deepEqual(bad, [], 'token de Maestro Cloud fora de linha com "Never"');
});

test('SC-07 — credencial só por variável; nenhum segredo literal em YAML nem em -e', () => {
  const text = readAgent();
  has(section(splitFrontmatter(text).body, H.standards), SC07_CREDS, H.standards);
  const blocks = fencedBlocks(text);
  // `-e NOME=valor` digitado vai para o histórico do shell e o log de CI.
  const literalE = blocks.flatMap((b) => b.lines).flatMap((l) =>
    [...l.matchAll(/(?:^|\s)-e\s+\w+=(\S*)/g)].filter((m) => !/^"?\$/.test(m[1])).map(() => l)
  );
  assert.deepEqual(literalE, [], '`-e NOME=` com valor literal em bloco de código');
  const SECRET_NAME = /(password|senha|token|secret|api[_-]?key)/i;
  const SECRET_LITERAL = /(password|senha|token|secret|api[_-]?key)\w*\s*:\s*["']?[^$\s"'{]/i;
  for (const b of blocks.filter((x) => x.lang === 'yaml' || x.lang === 'yml')) {
    const lit = b.lines.filter((l) => SECRET_LITERAL.test(l));
    assert.deepEqual(lit, [], 'segredo literal em bloco yaml');
    // Leitura da §7.2 "todo inputText com esses nomes no mesmo bloco usa ${":
    // num bloco que fala de credencial, o `inputText` é onde a senha seria
    // digitada, e `id: password` + `inputText: "abc123"` escapa do regex acima.
    if (b.lines.some((l) => SECRET_NAME.test(l))) {
      const typed = b.lines.filter((l) => /inputText:/.test(l) && !l.includes('${'));
      assert.deepEqual(typed, [], '`inputText` sem `${` em bloco yaml com credencial');
    }
  }
});

test('SC-08 — artefatos de execução não saem do time', () => {
  has(section(splitFrontmatter(readAgent()).body, H.standards), SC08_ARTIFACTS, H.standards);
});

test('SC-09 — só conta de teste e dado fictício, contra backend não produtivo', () => {
  has(section(splitFrontmatter(readAgent()).body, H.principles), SC09_TEST_ACCOUNTS, H.principles);
});

test('SC-10 — flow é código: ler runScript/evalScript/http antes de rodar', () => {
  has(section(splitFrontmatter(readAgent()).body, H.standards), SC10_FLOWS_ARE_CODE, H.standards);
});

test('SC-11 — emulador/simulador primeiro; destrutivo só em linha que pergunta', () => {
  const text = readAgent();
  has(section(splitFrontmatter(text).body, H.device), SC11_PHYSICAL, H.device);
  // `\bask` e não `ask` cru: substring casaria "task" e "mask", e a guarda
  // viraria enfeite. Casa ask/asks/asking, que é o que a §7.2 quer dizer.
  const bad = linesWithout(text, /adb uninstall|pm clear|simctl erase|clearKeychain/, /\bask/i);
  assert.deepEqual(bad, [], 'comando destrutivo fora de linha que manda perguntar');
});

test('SC-12 — sem sudo, e a frase de não instalar continua pinada', () => {
  const text = readAgent();
  assert.ok(!/\bsudo\b/.test(text), '`sudo` presente no agent');
  has(text, NEVER_INSTALL, 'agent');
});

test('SC-13 — "executado" exige comando e exit code', () => {
  has(section(splitFrontmatter(readAgent()).body, H.matrix), SC13_EVIDENCE, H.matrix);
});
