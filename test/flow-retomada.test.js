// C3 da demanda 006 — status por fase no `task.md` e retomada (AC-09, AC-10).
//
// O que isola: o template do `task.md`, o pre-flight, a abertura de
// `## Phase chain` e o Cost accounting de `commands/flow.md`.
//
// O status é protocolo entre fases, como a pré-triagem: o literal do template é
// a fonte (lição de `guidelines.md` §Triage protocol). Por isso a tabela é
// pinada linha a linha, e a retomada é fail-closed — `concluída` sem evidência
// conta como não concluída.
//
// PROVA DE RED (forma da D3):
//   git show d78e998:commands/flow.md > "$TMPDIR/base-flow.md"
//   FLOW_MD_UNDER_TEST="$TMPDIR/base-flow.md" node --test test/flow-retomada.test.js
// Esperado: AC-09 e AC-10 vermelhos.
const test = require('node:test');
const assert = require('node:assert');
const {
  H, readFlow, flowBlock, templateSection, lineStartingWith, has, ESCAPE_HATCH,
} = require('./support/flow-texts');

const STATUS_FIELD = '**Status por fase:**';
const STATUS_HEADER = '| Fase | Status | Data | Evidência |';
const PHASES = ['GOAL', 'TRIAGE', 'DEFINE', 'PLAN', '2.5', 'BUILD', 'VERIFY', 'REVIEW', 'SHIP'];
const STATUS_LEGEND = '_Status: pendente · em andamento · concluída · bloqueada · não se aplica (só 2.5)_';

test('AC-09 — o `task.md` registra o status de cada fase', () => {
  const flow = readFlow();
  const s0 = templateSection(flow, '## 0. GOAL');

  lineStartingWith(s0, STATUS_FIELD);
  assert.equal(lineStartingWith(s0, '| Fase |'), STATUS_HEADER, 'o cabeçalho da tabela de status mudou');

  // Uma linha por fase, as 9, na ordem da cadeia — e nenhuma a mais.
  const rows = s0.split('\n').filter((l) => /^\| [^-|]/.test(l) && !l.startsWith('| Fase |'));
  assert.deepEqual(rows.map((r) => r.split('|')[1].trim()), PHASES, 'as fases da tabela de status mudaram');
  for (const r of rows) assert.match(r, /^\| [^|]+ \| pendente \|/, `a fase não nasce pendente: ${r}`);
  assert.equal(lineStartingWith(s0, '_Status:'), STATUS_LEGEND, 'os valores fechados de status mudaram');

  // A atualização é regra única na abertura da cadeia, com a data; `não se
  // aplica` só na 2.5.
  const chain = flowBlock(flow, H.phaseChain);
  has(chain, "On every gate, update that phase's row in **Status por fase** (§0) with the date and its evidence", 'a cadeia não manda atualizar o status em cada gate');
  has(chain, '`não se aplica` is valid only for 2.5 when it did not fire', '`não se aplica` não está restrito à 2.5');
});

test('AC-10 — retomada pela primeira fase não concluída, sem refazer as concluídas', () => {
  const flow = readFlow();
  const pre = flowBlock(flow, H.preflight);

  // É o passo 0: vem antes de alocar ID e de carimbar o Início.
  const resume = lineStartingWith(pre, '0. **Resume, never restart.**');
  const lines = pre.split('\n');
  assert.ok(
    lines.indexOf(resume) < lines.findIndex((l) => l.startsWith('3. **Allocate the demand ID.**')),
    'a retomada não vem antes da alocação do NNN'
  );
  for (const c of [
    'names an existing demand (`NNN` or `docs/todo/NNN-*/`)',
    'skip steps 3, 3b and 5',
    'never re-pick the lane',
    'never allocate a new `NNN`',
    'never re-stamp `Início` in §11',
    'Resume at the first row of **Status por fase** (§0) whose status is not `concluída`',
    'a `concluída` phase is never re-run',
    // Fail-closed: status sem evidência não vale.
    'A `concluída` row whose `Evidência` is empty, or points at an empty section, counts as not completed',
    // A evidência prova gate VERDE (loop-back da REVIEW, passagem 3): citar um
    // BLOCK ou um CHANGES REQUESTED não conclui a fase.
    '`Evidência` must prove a green gate',
    'VERIFY cites a `security-specialist` verdict of **APPROVE** or **APPROVE WITH MITIGATIONS**',
    'REVIEW cites the recomputed `/code-review` verdict **APPROVED** or **APPROVED WITH COMMENTS**',
    'any other verdict counts as not completed',
    'A loop-back to an earlier phase resets the affected downstream rows to `pendente`',
  ]) {
    has(resume, c, 'a retomada perdeu uma cláusula');
  }
  assert.doesNotMatch(resume, ESCAPE_HATCH, 'a retomada ganhou válvula de escape');

  // Custo de flow retomado declara a fronteira; nunca soma por estimativa.
  const cost = lineStartingWith(flowBlock(flow, H.cost), '**Resumed flow:**');
  has(cost, '`Início` keeps its original stamp', 'o Início original não é preservado');
  has(cost, 'the source covers only the session(s) it measured', 'o custo não declara a fronteira da fonte');
  has(cost, 'never add sessions up by estimate', 'o custo retomado não proíbe somar por estimativa');
});
