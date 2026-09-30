// `/flow` roteando mobile para o `mobile-qa-analyst` (demanda 007, AC-07 e
// AC-08 da §3).
//
// O que isola: a linha nova da lista "pick by stack" da Phase 4 de
// `commands/flow.md` e a célula VERIFY de `skills/flow-playbook/trivial-lane.md`.
// É prompt, então todo AC é predicado determinístico sobre o texto, no molde da
// 006 (seams de `test/support/flow-texts.js`, nenhum `git`).
//
// Por que o predicado mobile é EXTRAÍDO da Phase 2, e não copiado aqui: a 006
// definiu a rota mobile uma vez, na consulta de UX. Se a 007 pinasse uma cópia,
// uma mudança futura do predicado na Phase 2 deixaria as duas regras
// divergirem caladas. Extraindo em tempo de teste, a divergência quebra a
// suíte (007 §5.3).
//
// PROVA DE RED (forma da 006 D3): rodar contra a BASE pelos seams.
//   git show <BASE>:commands/flow.md > "$TMPDIR/base-flow.md"
//   mkdir -p "$TMPDIR/pb" && git show <BASE>:skills/flow-playbook/trivial-lane.md > "$TMPDIR/pb/trivial-lane.md"
//   FLOW_MD_UNDER_TEST="$TMPDIR/base-flow.md" FLOW_PLAYBOOK_DIR_UNDER_TEST="$TMPDIR/pb" \
//     node --test test/flow-mobile-qa.test.js
// Esperado: AC-07 e AC-08 vermelhos (a BASE não tem a linha nem a célula nova).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const {
  H, FLOW_PATH, readFlow, readPlaybook, playbookPath, flowBlock, block,
  lineStartingWith, tableRow, has, sha256, ESCAPE_HATCH,
  PHASE4_SHA256, RED_PROOF_LINE, MOBILE_QA_LINE,
  PT_STOPWORDS, PT_DIACRITICS, withoutCodeSpans,
} = require('./support/flow-texts');

// 007 §5.4, inteira; vive em `test/support/flow-texts.js`, junto do pino da
// Phase 4, para o hash e este teste nunca pinarem linhas diferentes.
const MOBILE_LINE = MOBILE_QA_LINE;
const MOBILE_PREFIX = '- Mobile (Flutter/React Native/native) → `mobile-qa-analyst`';
const FRONTEND_LINE = '- Frontend / E2E → `cypress-qa-analyst`';
const BOTH_PREFIX = '- Both, when';

// Os acréscimos da 006 e da 007 ao bloco da Phase 4, por linha inteira: uma
// linha reescrita que mantenha o prefixo tem de pesar no hash.
const PHASE4_ADDITIONS = [RED_PROOF_LINE, MOBILE_QA_LINE];

// 007 §5.5: a célula VERIFY da faixa trivial.
const VERIFY_CELL = [
  'No QA agent, `mobile-qa-analyst` included',
  'the RED proof of a mobile change is the test the stack dev wrote in BUILD',
  'a flow marked `NÃO EXECUTADO` is never RED proof',
];

// Tetos que a 007 não pode subir (003 T9, 006 §5.5).
const FLOW_MAX_BYTES = 33000;
const FLOW_MAX_LINES = 470;
const LANE_MAX_BYTES = 3500;

// O predicado mobile como a Phase 2 o escreve: o trecho entre o último `; `
// antes da seta e a seta para `ux-designer-mobile`.
function mobilePredicate(flow) {
  const ux = lineStartingWith(flowBlock(flow, H.plan), '**UX consult (conditional, inside this phase):**');
  const m = /; ([^;]*?) → `ux-designer-mobile`/.exec(ux);
  assert.ok(m, 'a Phase 2 não tem a rota mobile da consulta de UX');
  return m[1];
}

test('AC-07 — linha mobile na Phase 4, aditiva e com o predicado mobile da C6', () => {
  const flow = readFlow();
  const verify = flowBlock(flow, H.verify);
  const lines = verify.split('\n');

  // A linha inteira, uma vez, entre Frontend / E2E e Both.
  assert.equal(lineStartingWith(verify, MOBILE_PREFIX), MOBILE_LINE, 'a linha mobile da Phase 4 mudou');
  const i = lines.indexOf(MOBILE_LINE);
  assert.equal(lines[i - 1], FRONTEND_LINE, 'a linha mobile não vem logo depois de Frontend / E2E');
  assert.ok(lines[i + 1].startsWith(BOTH_PREFIX), 'a linha mobile não vem logo antes de Both');

  // Mesmo predicado da C6, pelo literal atual da Phase 2.
  const predicate = mobilePredicate(flow);
  has(MOBILE_LINE, `(${predicate})`, 'a linha mobile não usa o predicado mobile da Phase 2');

  // Por stack, sem a condição de UI visível; mobile vence E2E; mobile + Go = os dois.
  has(MOBILE_LINE, 'by stack only; the visible-UI condition does not apply', 'a escolha do QA mobile depende de UI visível');
  // O "wins" vale só no caso ambíguo; web + mobile despacha os dois QAs, como a
  // Phase 2 despacha as duas UX (C6 da 006) — REVIEW 007, passagem 2.
  has(MOBILE_LINE, 'Mobile wins over Frontend / E2E only for a file both match (a React Native or mobile file), even when the test is E2E', 'mobile vence Frontend / E2E fora do caso ambíguo');
  has(MOBILE_LINE, 'a change that spans web and mobile dispatches `cypress-qa-analyst` and `mobile-qa-analyst`', 'web + mobile não despacha os dois QAs');
  has(flowBlock(flow, H.plan), 'both platforms → both', 'a Phase 2 deixou de despachar as duas UX');
  has(MOBILE_LINE, 'mobile + Go dispatches both', 'mobile + Go não despacha os dois');
  has(MOBILE_LINE, 'A flow marked `NÃO EXECUTADO` is not RED proof.', 'flow não executado conta como prova de RED (SC-13)');
  assert.doesNotMatch(MOBILE_LINE, ESCAPE_HATCH, 'a linha mobile ganhou válvula de escape');

  // Puramente aditiva: sem os acréscimos, o bloco volta ao da BASE da 003.
  assert.equal(
    sha256(lines.filter((l) => !PHASE4_ADDITIONS.includes(l)).join('\n')),
    PHASE4_SHA256,
    'sem os acréscimos, o bloco da Phase 4 não volta ao da BASE'
  );

  // Idioma (AC-27 da 006): instrução em inglês fora dos code spans.
  const bare = withoutCodeSpans(MOBILE_LINE);
  assert.deepEqual(bare.match(PT_STOPWORDS) || [], [], 'stopword PT na linha mobile');
  assert.deepEqual(bare.match(PT_DIACRITICS) || [], [], 'diacrítico PT na linha mobile');
});

test('AC-08 — (negativo) faixa trivial: o QA mobile não é despachado e a conta segue ≤ 4', () => {
  const lane = readPlaybook('trivial-lane.md');
  const cell = tableRow(lane, /^\| VERIFY \|/);
  for (const c of VERIFY_CELL) has(cell, c, 'a célula VERIFY da faixa trivial não barra o QA mobile');
  has(cell, 'The same Phase 4 exit gate, RED proof included', 'a VERIFY colapsada perdeu o gate da 006');
  assert.doesNotMatch(cell, ESCAPE_HATCH, 'a célula VERIFY ganhou válvula de escape');

  // A lista de obrigatórios não ganha vaga.
  const mandatory = block(lane, '## Mandatory subagents (a run without findings): 4', 'trivial-lane.md');
  const items = mandatory.split('\n').filter((l) => /^\d+\. /.test(l));
  assert.equal(items.length, 4, `a faixa trivial enumera ${items.length} obrigatórios`);
  assert.doesNotMatch(items.join('\n'), /mobile-qa-analyst|cypress-qa-analyst/, 'um QA entrou entre os obrigatórios');

  // Nenhum teto sobe nesta demanda.
  const buf = fs.readFileSync(FLOW_PATH);
  assert.ok(buf.length <= FLOW_MAX_BYTES, `flow.md tem ${buf.length} bytes, teto ${FLOW_MAX_BYTES}`);
  const lines = buf.toString('utf8').split('\n').length - 1;
  assert.ok(lines <= FLOW_MAX_LINES, `flow.md tem ${lines} linhas, teto ${FLOW_MAX_LINES}`);
  const laneBytes = fs.statSync(playbookPath('trivial-lane.md')).size;
  assert.ok(laneBytes <= LANE_MAX_BYTES, `trivial-lane.md tem ${laneBytes} bytes, teto ${LANE_MAX_BYTES}`);
});
