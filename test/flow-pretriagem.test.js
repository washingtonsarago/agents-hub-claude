// Invariantes de conteúdo do `### Phase 0.5 — TRIAGE (Prompt clarity)` em
// `commands/flow.md` (demanda 003-flow-pretriagem, AC-01…AC-08 da §3).
//
// O que este arquivo isola: o *texto* de um prompt, não código executável. Não
// há neste repo harness que rode o orquestrador e observe a nota, então todo AC
// aqui é predicado determinístico sobre o **conteúdo do artefato**.
//
// Por que nenhuma asserção toca em `git`: diff é propriedade de **um PR**, não
// do artefato. Um predicado sobre `git diff origin/main` fica verde só na
// janela entre o push e o merge — depois do merge a BASE passa a conter a
// mudança e o teste vira vermelho sem nada ter quebrado, convidando o próximo
// dev a "consertar" a asserção. Fora isso, `origin/main` nem sempre existe na
// CI (`actions/checkout@v4` sem `fetch-depth`), e uma allowlist de arquivos
// tocados congela o repo inteiro: qualquer demanda em voo passa a reprovar a
// suíte da 003. O que estes AC defendem é do conteúdo, e conteúdo não caduca no
// merge: bloco da Phase 4 intacto, linhas da Phase 1 preservadas, nenhuma
// sintaxe nova inventada. O que é escopo de PR (lista de arquivos tocados,
// "nenhum artefato novo", a nota que a 003 gravou no próprio `task.md`) é
// evidência de PR e vive na §8 do `task.md`, não aqui.
//
// Um `test()` por AC, nomeado com o AC que prova. Referências de invariância
// são **literais pinados** conferidos contra `origin/main` no momento da
// escrita — não recalculados em tempo de teste.
//
// Prova do gate da Phase 4 (cada AC falha sem a mudança):
//   git show origin/main:commands/flow.md > /tmp/base-flow.md
//   FLOW_MD_UNDER_TEST=/tmp/base-flow.md node --test test/flow-pretriagem.test.js
// Como agora tudo depende só do arquivo sob teste, o seam cobre **todas** as
// asserções — inclusive as de AC-04/05/07, que antes liam o git do worktree e
// ficavam vermelhas por acidente. Esperado: os 8 casos de AC vermelhos, e o
// teste de orçamento verde (ele é guarda de regressão, não prova da mudança).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REPO_ROOT } = require('./helpers');
// Pinos compartilhados com `test/flow-prova-red.test.js` (006): um valor só.
const {
  PHASE4_SHA256, PHASE4_EXIT_GATE, RED_PROOF_LINE, MOBILE_QA_LINE, ESCAPE_HATCH_003: ESCAPE_HATCH,
} = require('./support/flow-texts');

const FLOW_REL = 'commands/flow.md';

const TRIAGE_HEADING = '### Phase 0.5 — TRIAGE (Prompt clarity)';
const GOAL_HEADING = '### Phase 0 — GOAL (Discovery)';
const DEFINE_HEADING = '### Phase 1 — DEFINE (Spec / PO)';
const VERIFY_HEADING = '### Phase 4 — VERIFY (QA/SDET + Security gate)';
const TEMPLATE_HEADING = '## `task.md` template (write this on Phase 0/1)';

// A rubrica, como a SEÇÃO a define. O número 4 é cruzado com o literal "four
// justifications" do exit gate: tirar um eixo passa a contradizer o texto.
const AXES = ['A1 Deliverable', 'A2 Mechanism', 'A3 Done', 'A4 Stability'];
const NUMBER_WORD = { 3: 'three', 4: 'four', 5: 'five', 6: 'six' };

// --- Literais pinados (AC-04 / AC-05) --------------------------------------
// Conferidos contra `git show origin/main:commands/flow.md` ao escrever o teste.
// O bloco da Phase 4 sai desta mudança byte a byte idêntico ao da BASE; as
// linhas de **Produces:** e **Exit gate:** da Phase 1 idem; a de **Inputs:** da
// Phase 1 é a única linha que a 003 modifica, e só por acréscimo.
// PHASE4_SHA256 e PHASE4_EXIT_GATE vêm de `test/support/flow-texts.js`, com o
// valor da 003 inalterado.
// Acréscimos permitidos ao bloco da Phase 4 depois da 003 (006 §5 D2). O pino
// acima NÃO muda: o hash é calculado sem as linhas destes prefixos, então
// tirar o acréscimo continua devolvendo o bloco da BASE byte a byte — o mesmo
// idioma do DEFINE_INPUTS_ADDITION logo abaixo. Esta é a justificativa
// explícita que `commands/code-review.md` exige de teste alterado: a garantia
// não afrouxa, e o conteúdo do acréscimo fica pinado em
// `test/flow-prova-red.test.js` (AC-07/AC-08 da 006).
// Linhas inteiras, não prefixos: uma RED proof reescrita tem de pesar no hash.
// 007 §5 D2: a mesma regra da 006 D2 para a linha mobile da lista "pick by
// stack"; o pino não muda, e a linha é pinada inteira em
// `test/flow-mobile-qa.test.js` (AC-07 da 007).
const PHASE4_ADDITIONS = [RED_PROOF_LINE, MOBILE_QA_LINE];
const PHASE4_PRODUCES =
  '**Produces:** integration / E2E / fuzz tests as appropriate, a traceability matrix (AC → test), and confirmation that the **GOAL metric is observable** (the instrumentation from Phase 3 emits and is queryable).';
const DEFINE_PRODUCES =
  '**Produces:** in `task.md` — Description (problem + business value), user segment, INVEST stories, Acceptance Criteria in Gherkin, Out of scope, and the **GOAL-metric linkage** (which AC, when satisfied, move the metric).';
const DEFINE_EXIT_GATE =
  '**Exit gate:** AC are testable, scope is bounded, no business-rule conflict with `business.md`, and **at least one AC traces to the GOAL metric**.';
// A linha de Inputs da Phase 1 **antes** da 003, e o único acréscimo permitido.
const DEFINE_INPUTS_BASE = '**Inputs:** the Phase 0 brief, `business.md`.';
const DEFINE_INPUTS_ADDITION = '**the Phase 0.5 score recorded in §0**, ';

const TEMPLATE_FIELD = '**Pré-triagem (Phase 0.5):** NOTA <n>/10 — <acima|abaixo> do corte (> 6)';

// Slash commands que já existem no hub. Um token de comando na SEÇÃO que não
// esteja aqui é sintaxe nova — o que o AC-07 proíbe.
const KNOWN_SLASH_COMMANDS = new Set([
  '/flow', '/feature-flow', '/bug-flow', '/discovery', '/code-review', '/veredito',
  '/smart-commit', '/bootstrap-project', '/memory-query', '/autonomo', '/session-cost',
  '/cost', '/tech-debt', '/db-audit', '/api-contract', '/arch-design', '/jira-story',
  '/incident-response', '/onboard-dev', '/clear', '/compact',
]);

// Stopwords PT-BR de alta frequência que não existem em inglês. Predicado
// invertido de propósito: proibir uma lista fechada de palavras "suspeitas"
// deixaria passar qualquer instrução traduzida que não usasse justo aquelas.
// `do`, `no`, `a`, `e`, `se` ficam **fora** porque são palavras inglesas.
const PT_STOPWORDS = /\b(de|da|dos|das|para|com|que|uma|pelo|pela|sobre|entre|cada|quando|onde|não|são|ser|foi|pelos|pelas|seu|sua)\b/gi;

// Segundo predicado de idioma, ortográfico: a parte instrucional não usa hoje
// **nenhum** diacrítico PT (conjunto vazio, conferido). PT-BR técnico passa em
// volta de qualquer lista de stopwords — inclusive traduzindo a definição de um
// eixo, que é a instrução que o modelo lê para pontuar — mas dificilmente passa
// sem acentuar. O TEMPLATE fica fora: é outro bloco, e é PT-BR por contrato.
const PT_DIACRITICS = /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/g;

// As 5 entradas literais de SUP-EXEC, na ordem em que a definição as enumera.
const SUP_EXEC_ENTRIES = ['bin/ahc', 'scripts/', 'install.sh', 'mcp/', 'test/'];

// Vocabulário de válvula de escape. Um mutante não precisa **remover** a regra:
// basta preservá-la e acrescentar uma saída ("unless the PO prefers otherwise",
// "ignore when in a hurry"). Provar ausência de contradição em prosa é
// impossível; fechar o vocabulário barato não é. Nenhuma destas palavras
// aparece hoje nas células críticas.
// `may` entra inteiro (não só `may waive`): "though you may apply the ceiling
// anyway" neutraliza a linha do `SCORE ≤ 6` sem usar nenhuma das outras
// palavras. A seção não usa `may` hoje em lugar nenhum — conferido —, então
// fechar o modal todo não custa nada e tira a saída mais barata.
// ESCAPE_HATCH é o `ESCAPE_HATCH_003` de `test/support/flow-texts.js`, mesmo valor.

// --- Orçamento de tamanho (T9 / §5.4) --------------------------------------
// Linhagem do número, para que a próxima ampliação seja visivelmente a segunda:
//   • teto original do PLAN .......... 452 linhas / 31.875 bytes
//   • ampliado no loop-back da Phase 4 a 470 linhas / 33.000 bytes, porque o
//     gate de segurança exigiu três cláusulas (M1/M2/M3) que não cabiam
//   • consumido hoje ................. 449 linhas / 32.798 bytes
const BUDGET_MAX_LINES = 470;
const BUDGET_MAX_BYTES = 33000;

// O arquivo sob teste. O seam existe só para a prova do gate descrita no
// cabeçalho — execuções normais leem a working tree.
const FLOW_PATH = process.env.FLOW_MD_UNDER_TEST || path.join(REPO_ROOT, FLOW_REL);

function readFlow() {
  return fs.readFileSync(FLOW_PATH, 'utf8');
}

// Um bloco `### ` / `## `: do heading até (sem incluir) o próximo.
// Fence-aware: o template do `task.md` é um bloco cercado cheio de `##` que são
// conteúdo, não estrutura.
function block(text, heading) {
  const lines = text.split('\n');
  const start = lines.indexOf(heading);
  assert.notEqual(start, -1, `heading não encontrado em ${FLOW_PATH}: ${heading}`);
  let end = lines.length;
  let fenced = false;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^```/.test(lines[i])) { fenced = !fenced; continue; }
    if (!fenced && /^#{2,3} /.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

// Uma linha de tabela markdown, achada por regex sobre a primeira célula.
// A unicidade é parte do predicado: prende a frase à célula certa, em vez de
// deixá-la casar em qualquer ponto da seção.
function tableRow(text, re) {
  const rows = text.split('\n').filter((l) => l.startsWith('|') && re.test(l));
  assert.equal(rows.length, 1, `esperava 1 linha de tabela casando ${re}, achei ${rows.length}`);
  return rows[0];
}

// Uma linha específica, pelo seu prefixo — mesma lógica de ancoragem.
function lineStartingWith(text, prefix) {
  const found = text.split('\n').filter((l) => l.startsWith(prefix));
  assert.equal(found.length, 1, `esperava 1 linha começando com ${JSON.stringify(prefix)}, achei ${found.length}`);
  return found[0];
}

function sectionOf(text) {
  return block(text, TRIAGE_HEADING);
}

// Os eixos como a rubrica publicada os declara.
function rubricAxes(sec) {
  return sec
    .split('\n')
    .filter((l) => /^\|\s*\*\*A\d+ \w+\*\*/.test(l))
    .map((l) => /\*\*(A\d+ \w+)\*\*/.exec(l)[1]);
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Todos os `.md` sob um diretório de artefato (skills/ é aninhado).
function mdFilesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const child = path.join(dir, e.name);
    if (e.isDirectory()) return mdFilesUnder(child);
    return e.isFile() && e.name.endsWith('.md') ? [child] : [];
  });
}

// ---------------------------------------------------------------------------

test('AC-01 — a pré-triagem existe como etapa nomeada entre GOAL e DEFINE, com rubrica de eixos', () => {
  const flow = readFlow();

  // Posição: o heading novo fica entre Phase 0 e Phase 1, sem nada no meio.
  const headings = flow.split('\n').filter((l) => /^### Phase /.test(l));
  const i = headings.indexOf(TRIAGE_HEADING);
  assert.notEqual(i, -1, `sem o heading da pré-triagem: ${TRIAGE_HEADING}`);
  assert.equal(headings[i - 1], GOAL_HEADING, 'a pré-triagem não vem logo depois do GOAL');
  assert.equal(headings[i + 1], DEFINE_HEADING, 'a pré-triagem não vem logo antes do DEFINE');

  const sec = sectionOf(flow);

  // A pré-triagem **sempre roda**. Se ela for pulável, os outros sete AC ficam
  // sem população: a métrica GOAL deixa de ser observável e o AC-02 vira
  // retórica. Duas âncoras, porque a demanda declara isso em dois lugares.
  const runs = lineStartingWith(sec, '**Runs:**');
  assert.match(runs, /always, between GOAL and DEFINE/, 'a seção não declara que a pré-triagem sempre roda entre GOAL e DEFINE');
  assert.match(runs, /unlike Phase 2\.5, never skipped/, 'a seção não declara que, ao contrário da Phase 2.5, ela nunca é pulada');

  const opening = flow.split('\n')[2];
  assert.match(opening, /Phase 0\.5 TRIAGE, which always runs/, 'a abertura do comando não declara a Phase 0.5 como etapa que sempre roda');
  assert.match(opening, /Phase 2\.5 Threat modeling, which is conditional/, 'a abertura perdeu o contraste com a Phase 2.5 condicional');

  // RUBRICA: piso do contrato do AC-01 (≥ 3 eixos nomeados) e, logo abaixo, o
  // pino da implementação (exatamente estes 4). Contagem livre deixaria remover
  // um eixo sem ninguém ver — e o exit gate fala em "four".
  const axes = rubricAxes(sec);
  assert.ok(axes.length >= 3, 'a rubrica precisa de no mínimo 3 eixos nomeados');
  assert.deepEqual(axes, AXES, 'os eixos da rubrica mudaram');

  // Escala, extraída como número: um `match` de substring casaria dentro de
  // `1–100`, e com escala 1–100 o corte `> 6` deixa de significar qualquer
  // coisa — praticamente toda demanda passaria a cair acima dele.
  const scoring = lineStartingWith(sec, '**Scores the prompt, not the problem.**');
  const scale = /Score each axis (\d+)–(\d+)/.exec(scoring);
  assert.ok(scale, 'a escala não está declarada no parágrafo de pontuação');
  assert.deepEqual([Number(scale[1]), Number(scale[2])], [1, 10], `escala declarada ${scale[1]}–${scale[2]}, esperada 1–10`);

  const produced = /a SCORE \((\d+)–(\d+)\)/.exec(lineStartingWith(sec, '**Produces:**'));
  assert.ok(produced, 'a linha **Produces:** não declara a escala do SCORE');
  assert.deepEqual([Number(produced[1]), Number(produced[2])], [1, 10], 'a escala do **Produces:** não é 1–10');
  assert.match(scoring, /Never score how complex the work is/, 'complexidade não é excluída em texto');
  assert.match(scoring, /how many files change/, 'tamanho não é excluído em texto');
  assert.match(scoring, /whether it touches auth or secrets, or how risky it is/, 'criticidade não é excluída em texto');

  // Agregação, veto e `Cite or cap` — extraindo os números, não casando prosa.
  // Pela §5.4, o `Cite or cap` é a única mitigação da Premissa #2 (a nota é
  // auto-atribuída por quem se beneficia dela): sem asserção, some sem ruído.
  const score = lineStartingWith(sec, '**SCORE** =');
  assert.match(score, /`floor\(mean\(A1\.\.A4\)\)`/, 'a agregação não é floor(mean(A1..A4))');

  const veto = /veto: any axis ≤ (\d+) caps SCORE at (\d+)/.exec(score);
  assert.ok(veto, 'a regra de veto sumiu da linha do SCORE');
  assert.equal(Number(veto[1]), 4, `veto dispara em eixo ≤ ${veto[1]}, esperado 4`);
  assert.equal(Number(veto[2]), 6, `veto limita a SCORE ${veto[2]}, esperado 6`);

  const cite = /an uncited axis scores \*\*at most (\d+)\*\*/.exec(score);
  assert.ok(cite, 'a cláusula `Cite or cap` sumiu da linha do SCORE');
  assert.equal(Number(cite[1]), 5, `eixo sem citação vale até ${cite[1]}, esperado 5`);
  assert.match(score, /each axis justification names one artifact/, '`Cite or cap` não exige citar artefato');

  // Válvula de escape: a regra pode sobreviver ao mutante e ser neutralizada
  // por acréscimo ("veto … (ignore when in a hurry)").
  assert.doesNotMatch(score, ESCAPE_HATCH, 'a linha do SCORE ganhou válvula de escape');
  assert.doesNotMatch(runs, ESCAPE_HATCH, 'a cláusula **Runs:** ganhou válvula de escape');

  // O CORTE existe como ramificação declarada — as duas linhas da tabela, uma
  // cada. É isso que prova `> 6`, não um /> 6/ solto na seção.
  tableRow(sec, /^\|\s*\*\*SCORE (≤|<=) 6\*\*\s*\|/);
  tableRow(sec, /^\|\s*\*\*SCORE > 6\*\*\s*\|/);
});

test('AC-02 — NOTA e justificativa por eixo gravadas no `task.md`', () => {
  const flow = readFlow();
  const sec = sectionOf(flow);
  const template = block(flow, TEMPLATE_HEADING);
  const axes = rubricAxes(sec);

  // O TEMPLATE ganha o campo de pré-triagem, com a NOTA e o corte.
  assert.equal(
    lineStartingWith(template, '**Pré-triagem (Phase 0.5):**'),
    TEMPLATE_FIELD,
    'o campo de pré-triagem do TEMPLATE mudou'
  );

  // …e UMA linha de justificativa por eixo, não uma justificativa agregada.
  const templateAxisLines = template.split('\n').filter((l) => /^- A\d+ \w+ <n>:/.test(l));
  assert.deepEqual(
    templateAxisLines.map((l) => /^- (A\d+ \w+) <n>:/.exec(l)[1]),
    axes,
    'as linhas de justificativa do TEMPLATE não batem com os eixos da rubrica'
  );

  // A gravação é obrigatória, o DEFINE não inicia sem ela, e o texto do exit
  // gate concorda em número com a rubrica ("four" ↔ 4 eixos).
  const exitGate = lineStartingWith(sec, '**Exit gate:**');
  assert.match(exitGate, /DEFINE does not start without them/, 'a seção não trava o DEFINE sem a nota');
  assert.match(
    exitGate,
    new RegExp(`the ${NUMBER_WORD[axes.length]} justifications recorded there`),
    `o exit gate não fala em ${NUMBER_WORD[axes.length]} justificativas, com ${axes.length} eixos na rubrica`
  );
  assert.match(
    lineStartingWith(sec, '**Produces:**'),
    /one justification line per axis, in `task\.md` section 0/,
    'a seção não produz uma justificativa por eixo na §0'
  );
  assert.doesNotMatch(exitGate, ESCAPE_HATCH, 'o exit gate da seção ganhou válvula de escape');

  // O bloco do DEFINE referencia a NOTA gravada em seus **Inputs:**.
  const defineInputs = lineStartingWith(block(flow, DEFINE_HEADING), '**Inputs:**');
  assert.match(defineInputs, /Phase 0\.5 score recorded in §0/, 'os Inputs do DEFINE não referenciam a NOTA');
});

test('AC-03 — NOTA > 6 enxuga o DEFINE com teto numérico, não com adjetivo', () => {
  const row = tableRow(sectionOf(readFlow()), /^\|\s*\*\*SCORE > 6\*\*\s*\|/);

  // O teto é número — e **todos** os tetos declarados na célula têm de ser 10.
  // Com `.exec()` o primeiro número ganhava e um segundo teto maior na mesma
  // célula passava batido ("≤ 10 AC … i.e. the real ceiling is ≤ 40 AC"). Esse
  // é o AC que produz a métrica GOAL, e enterrar a instrução em texto é o modo
  // de falha que a própria §5.4 declara.
  const ceilings = [...row.matchAll(/(?:≤|<=) ?(\d+) AC/g)].map((m) => Number(m[1]));
  assert.ok(ceilings.length >= 1, 'o teto não está escrito como número de AC');
  assert.deepEqual(ceilings, [10], `tetos declarados na célula: ${JSON.stringify(ceilings)}, esperado só [10]`);
  assert.doesNotMatch(row, ESCAPE_HATCH, 'o teto de AC ganhou válvula de escape');

  assert.match(row, /group related scenarios/, 'a seção não instrui agrupar cenários');
  assert.match(row, /objective inspection/, 'a seção não permite inspeção objetiva no lugar de Gherkin item a item');
  assert.match(
    row,
    /stays verifiable by a deterministic command or a binary-predicate inspection/,
    'a seção não mantém a exigência de AC verificável'
  );

  // Inspeção substitui a prosa Gherkin, nunca o teste por trás dela.
  assert.match(row, /still bound by the Phase 4 exit gate/, 'AC por inspeção não fica preso ao gate da Phase 4');
  assert.match(row, /inspection replaces Gherkin prose, never the test behind it/, 'a seção não separa prosa de prova');

  // Dois tipos ficam fora do teto e nunca são agrupados.
  assert.match(row, /an AC carrying a control required by Phase 2\.5/, 'controle da Phase 2.5 não está fora do teto');
  assert.match(row, /an AC covering a negative or abuse case/, 'caso de abuso não está fora do teto');
});

test('AC-04 — menos AC, não AC mais frouxo: o gate da VERIFY fica intacto', () => {
  const flow = readFlow();
  const verify = block(flow, VERIFY_HEADING);

  // A garantia é o bloco da Phase 4 intacto. Hash pinado pega qualquer edição;
  // os literais dizem QUAL garantia quebrou quando o hash acusa.
  assert.equal(
    lineStartingWith(verify, '**Exit gate:**'),
    PHASE4_EXIT_GATE,
    'o exit gate da Phase 4 mudou — ele é a cláusula que a 003 não pode afrouxar'
  );
  assert.match(
    PHASE4_EXIT_GATE,
    /every AC has at least one automated test that \*\*fails without the change\*\*/,
    'o literal pinado deixou de exigir teste que falha sem a mudança'
  );
  assert.equal(
    lineStartingWith(verify, '**Produces:**'),
    PHASE4_PRODUCES,
    'a linha **Produces:** da Phase 4 (matriz de rastreabilidade AC → test) mudou'
  );
  // Cada acréscimo da 006 aparece no máximo uma vez: uma segunda linha com o
  // mesmo prefixo seria texto novo escondido do hash.
  const verifyLines = verify.split('\n');
  for (const addition of PHASE4_ADDITIONS) {
    assert.ok(
      verifyLines.filter((l) => l === addition).length <= 1,
      `o acréscimo ${addition} aparece mais de uma vez no bloco da Phase 4`
    );
  }
  const verifyBase = verifyLines.filter((l) => !PHASE4_ADDITIONS.includes(l)).join('\n');
  assert.equal(
    sha256(verifyBase),
    PHASE4_SHA256,
    'o bloco `### Phase 4 — VERIFY`, sem os acréscimos da 006 §5 D2, mudou (sha256 pinado contra origin/main no momento da escrita)'
  );

  // E a SEÇÃO afirma que o teto corta quantidade, não rigor — na célula certa.
  const row = tableRow(sectionOf(flow), /^\|\s*\*\*SCORE > 6\*\*\s*\|/);
  assert.match(row, /Fewer AC, never looser AC/, 'a seção não afirma que o rigor não afrouxa');
  assert.match(row, /the Phase 4 exit gate is untouched/, 'a seção não declara o gate da Phase 4 intacto');
  assert.match(row, /each surviving AC still needs an automated test that fails without the change/, 'a seção não repete a exigência de teste que falha sem a mudança');
});

test('AC-05 — não-regressão: NOTA ≤ 6 roda exatamente o fluxo de hoje', () => {
  const flow = readFlow();
  const define = block(flow, DEFINE_HEADING);

  // **Produces:** e **Exit gate:** do DEFINE conservados byte a byte.
  assert.equal(lineStartingWith(define, '**Produces:**'), DEFINE_PRODUCES, 'a linha **Produces:** do DEFINE mudou');
  assert.equal(lineStartingWith(define, '**Exit gate:**'), DEFINE_EXIT_GATE, 'a linha **Exit gate:** do DEFINE mudou');

  // A única linha que a 003 modifica: o texto original tem de estar preservado
  // e o acréscimo tem de ser exatamente a referência à NOTA — tirar o
  // acréscimo devolve a linha da BASE, caractere a caractere.
  const inputs = lineStartingWith(define, '**Inputs:**');
  assert.ok(inputs.includes(DEFINE_INPUTS_ADDITION), 'os Inputs do DEFINE não acrescentam a NOTA');
  assert.equal(
    inputs.replace(DEFINE_INPUTS_ADDITION, ''),
    DEFINE_INPUTS_BASE,
    'os Inputs do DEFINE não preservam o texto original — o acréscimo não é puramente aditivo'
  );

  // A SEÇÃO diz explicitamente que ≤ 6 segue o fluxo atual.
  const row = tableRow(sectionOf(flow), /^\|\s*\*\*SCORE (≤|<=) 6\*\*\s*\|/);
  assert.match(row, /Nothing changes/, 'a seção não diz que nada muda abaixo do corte');
  assert.match(row, /no AC ceiling/, 'a seção não isenta a nota baixa do teto de AC');
  assert.match(row, /no mandatory grouping/, 'a seção não isenta a nota baixa do agrupamento');
  assert.match(row, /no performance block/, 'a seção não isenta a nota baixa do bloco de performance');
  assert.doesNotMatch(row, ESCAPE_HATCH, 'a linha do `SCORE ≤ 6` ganhou válvula de escape');
});

test('AC-06 — bloco de performance só com NOTA > 6 _e_ superfície executável', () => {
  const sec = sectionOf(readFlow());
  const row = tableRow(sec, /^\|\s*\*\*SCORE > 6 _and_ executable surface\*\*/);

  // SUP-EXEC definida pela lista literal das 5 entradas — recortando a
  // **enumeração**, não varrendo a célula inteira. `test/` e `install.sh`
  // reaparecem adiante na mesma célula, então um `includes` na linha toda
  // sobrevivia a removê-los da lista: a demanda cujo objeto é `test/` deixaria
  // de ser SUP-EXEC e a cláusula de qualificação ficaria órfã.
  const enumeration = /touches (.*?)\. `test\/` qualifies only/.exec(row);
  assert.ok(enumeration, 'não achei a enumeração de superfície executável na célula');
  const entries = [...enumeration[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  assert.deepEqual(entries, SUP_EXEC_ENTRIES, 'a enumeração de superfície executável mudou');

  // `test/` só conta quando é OBJETO da mudança. Sem isso a conjunção degenera:
  // o gate da Phase 4 obriga toda demanda acima do corte a mexer em `test/`.
  assert.match(row, /`test\/` qualifies only when the change is the \*\*object\*\*/, '`test/` não está qualificado como objeto da mudança');
  assert.match(row, /never when a test exists only to \*\*prove\*\* the change/, 'o teste que só prova a mudança não está excluído de SUP-EXEC');

  // A condição é conjunção — e o efeito é aditivo ao teto, não alternativo.
  assert.match(row, /\*\*SCORE > 6 _and_ executable surface\*\*/, 'a condição não está escrita como conjunção');
  assert.match(row, /PLAN also adds a performance block/, 'o bloco de performance não é aditivo ao teto');
  assert.match(row, /\*\*with a number\*\*/, 'o bloco de performance não exige número');
  assert.match(row, /startup time|bytes loaded per invocation|runtime of the touched command/, 'a seção não diz o que medir');

  // Medição não-mutante: nada que escreva no `~/.claude` real do dev.
  assert.match(row, /never invokes anything that writes into the dev's real `~\/\.claude`/, 'a medição não proíbe escrever no ~/.claude real');
  assert.match(row, /throwaway `HOME`/, 'a medição não exige HOME descartável para o que muta');

  // CORTE + demanda só de conteúdo (.md) → nenhum bloco de performance.
  assert.match(row, /content-only \(`\.md`\) → \*\*no performance block\*\*/, 'a exclusão de demanda só `.md` não está escrita');

  // Guarda contra a leitura alternativa: a linha do `SCORE > 6` simples não
  // menciona performance, então performance depende mesmo da conjunção.
  const cutRow = tableRow(sec, /^\|\s*\*\*SCORE > 6\*\*\s*\|/);
  assert.doesNotMatch(cutRow, /performance/i, 'o efeito de performance vazou para a linha sem superfície executável');

  assert.doesNotMatch(row, ESCAPE_HATCH, 'a linha da conjunção ganhou válvula de escape');
});

test('AC-07 — a pré-triagem não inventa sintaxe nem vaza para os outros orquestradores', () => {
  const flow = readFlow();
  const sec = sectionOf(flow);

  // Nenhum slash command novo. A crase é opcional de propósito: o arquivo
  // escreve comando entre crases na maioria das ocorrências, e uma regex que
  // exigisse espaço antes da barra deixaria passar `` `/pretriagem` ``.
  // O que é conhecido sai por allowlist explícita, não por acidente de
  // pontuação — `bin/ahc` e `test/helpers.js` não casam porque a barra vem
  // precedida de letra, não de espaço/crase/parêntese.
  // A classe de prefixo é invertida: em vez de enumerar delimitadores (espaço,
  // crase, parêntese) — que deixava passar `—/pretriagem`, `"/pretriagem"` e
  // aspas em geral — exige-se que o caractere antes da barra **não** seja de
  // caminho. Maiúscula e comando curto entram: `/Pretriagem` e `/pt` são
  // sintaxe nova igual. `bin/ahc`, `test/helpers.js` e `~/.claude` não casam
  // porque a barra vem precedida de caractere de caminho.
  const candidates = [...sec.matchAll(/(^|[^A-Za-z0-9._~/-])\/([A-Za-z][A-Za-z0-9-]*)/gm)]
    .map((m) => `/${m[2]}`);
  const invented = [...new Set(candidates)].filter((c) => !KNOWN_SLASH_COMMANDS.has(c.toLowerCase()));
  assert.deepEqual(invented, [], `sintaxe nova declarada na seção: ${JSON.stringify(invented)}`);

  // A pré-triagem é etapa interna do `/flow`: decisão do lead (§4) de não
  // entrar em `/feature-flow` nem `/bug-flow`.
  // A pré-triagem é etapa interna do `/flow`: decisão do lead (§4). Varre os
  // quatro diretórios de artefato, não dois arquivos — colar a seção em
  // `commands/discovery.md` passava batido. O predicado mira a ETAPA, não a
  // palavra: `bug-flow.md` tem uma `### Phase 1 — Triage & isolation` própria,
  // anterior a esta demanda, e casar /TRIAGE/ solto acusaria texto legítimo.
  const siblings = ['commands', 'agents', 'skills', 'autonomous']
    .flatMap((d) => mdFilesUnder(path.join(REPO_ROOT, d)))
    .filter((p) => p !== path.join(REPO_ROOT, FLOW_REL));

  // Piso de sanidade: se um caminho mudar, a varredura vazia não pode passar
  // por "nenhuma violação encontrada".
  assert.ok(siblings.length >= 40, `varri só ${siblings.length} artefatos — a varredura silenciou`);

  const leaked = siblings.filter((p) =>
    /Phase 0\.5|pré-triagem|TRIAGE \(Prompt clarity\)/i.test(fs.readFileSync(p, 'utf8'))
  );
  assert.deepEqual(
    leaked.map((p) => path.relative(REPO_ROOT, p)),
    [],
    'a pré-triagem vazou para outro artefato — ela é etapa interna do /flow (§4)'
  );
});

test('AC-08 — idioma conforme `guidelines.md` §Idioma', () => {
  const flow = readFlow();
  const sec = sectionOf(flow);

  // Instruções ao orquestrador em inglês, como o resto do ARQUIVO.
  for (const label of ['**Runs:**', '**Inputs:**', '**Produces:**', '**Exit gate:**']) {
    assert.ok(sec.includes(label), `a seção não usa o rótulo em inglês ${label}`);
  }
  const pt = sec.match(PT_STOPWORDS) || [];
  assert.deepEqual(
    [...new Set(pt.map((w) => w.toLowerCase()))],
    [],
    `instrução em PT-BR na parte que é prompt: ${JSON.stringify([...new Set(pt)])}`
  );

  // Segundo predicado, ortográfico: PT-BR técnico passa em volta de qualquer
  // lista de stopwords — a tradução da definição de um eixo da rubrica passava,
  // e é justamente a instrução que o modelo lê para pontuar. Acento é mais
  // difícil de evitar do que stopword.
  const accents = sec.match(PT_DIACRITICS) || [];
  assert.deepEqual(
    [...new Set(accents)],
    [],
    `diacrítico PT na parte instrucional (que é prompt, logo inglês): ${JSON.stringify([...new Set(accents)])}`
  );

  // O que o usuário lê — os campos acrescentados ao TEMPLATE — em PT-BR.
  const template = block(flow, TEMPLATE_HEADING);
  assert.equal(lineStartingWith(template, '**Pré-triagem (Phase 0.5):**'), TEMPLATE_FIELD, 'o campo do TEMPLATE não está em PT-BR');
  const axisLines = template.split('\n').filter((l) => /^- A\d+ \w+ <n>:/.test(l));
  assert.match(axisLines.join('\n'), /<justificativa, citando um artefato>/, 'as linhas por eixo não estão em PT-BR');
});

// ---------------------------------------------------------------------------
// Guarda de regressão — NÃO é um AC.
//
// Por que existe: `commands/flow.md` é prompt carregado **inteiro em toda
// invocação do `/flow`**, então cada byte novo é custo fixo pago em toda
// execução — inclusive nas demandas com NOTA ≤ 6, que por decisão do lead não
// recebem benefício nenhum. O orçamento é proxy de concisão: o modo de falha
// declarado na §5.4 não é "o arquivo ficou grande", é "a instrução do teto
// `≤ 10` ficou enterrada em texto e o orquestrador não a aplica" — o que passa
// despercebido em qualquer `grep`, mas não em `fs.statSync`.
//
// Este teste **passa contra `origin/main`** (a BASE tem 420 linhas / 28.675
// bytes), e isso está certo: ele é guarda de crescimento silencioso, não prova
// da mudança. Só os oito testes de AC acima é que precisam ficar vermelhos sem
// a mudança. Não o "conserte" achando que é um teste quebrado.
// ---------------------------------------------------------------------------

test('T9/§5.4 — orçamento de tamanho de `commands/flow.md`', () => {
  const buf = fs.readFileSync(FLOW_PATH);
  const bytes = buf.length;
  const lines = buf.toString('utf8').split('\n').length - 1;
  const volta = 'o teto é decisão de PLAN (§5.4): quem estoura volta ao PLAN, não afrouxa esta asserção';

  assert.ok(
    lines <= BUDGET_MAX_LINES,
    `commands/flow.md tem ${lines} linhas, teto ${BUDGET_MAX_LINES} — ${volta}`
  );
  assert.ok(
    bytes <= BUDGET_MAX_BYTES,
    `commands/flow.md tem ${bytes} bytes, teto ${BUDGET_MAX_BYTES} — ${volta}`
  );
});
