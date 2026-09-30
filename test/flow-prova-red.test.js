// C2 da demanda 006 — PROVA DE RED verificável no gate da VERIFY (AC-07, AC-08).
//
// O que isola: o bloco `### Phase 4 — VERIFY` e a §8 do template em
// `commands/flow.md`, mais os exit gates das Phases 2 e 5, que a 006 só pode
// tocar por acréscimo.
//
// O gate da Phase 4 é a garantia que a 003 inteira protege por hash. Aqui o
// idioma é o mesmo do `DEFINE_INPUTS_ADDITION` da 003: tirando o acréscimo, o
// texto volta byte a byte ao da BASE, e o acréscimo também fica pinado.
//
// PROVA DE RED (forma da D3):
//   git show d78e998:commands/flow.md > "$TMPDIR/base-flow.md"
//   FLOW_MD_UNDER_TEST="$TMPDIR/base-flow.md" node --test test/flow-prova-red.test.js
// Esperado: AC-07 e AC-08 vermelhos (a BASE não tem a linha de RED proof nem os
// acréscimos das Phases 2 e 5).
const test = require('node:test');
const assert = require('node:assert');
const {
  H, readFlow, flowBlock, templateSection, lineStartingWith, has, sha256, ESCAPE_HATCH,
  PHASE4_SHA256, PHASE4_EXIT_GATE, RED_PROOF_LINE, MOBILE_QA_LINE,
} = require('./support/flow-texts');

// RED_PROOF_LINE (a linha nova da Phase 4, D2/D3), PHASE4_SHA256 e
// PHASE4_EXIT_GATE (da 003) vêm de `test/support/flow-texts.js`.

// MOBILE_QA_LINE: acréscimo posterior à 006 (007 §5 D2, mesma regra da 006
// D2), pinado inteiro em `test/flow-mobile-qa.test.js`. Sai do hash por linha
// inteira, como a RED proof: uma linha mobile reescrita pesa no hash.

const PHASE5_EXIT_GATE_BASE = '**Exit gate:** no BLOCKERs.';
const PHASE5_ADDITION = '; no missing lens (verdict `INCOMPLETE` is not green, in every lane)';

// As três condições do exit gate da Phase 2 na BASE, e o único acréscimo.
const PHASE2_GATE_BASE = [
  '- Tasks are atomic and ordered by dependency; maintainability + scalability acceptable.',
  "- **NFR impact does not jeopardize the GOAL metric** (e.g. a latency KR isn't undercut by the design).",
  '- **Sensitive surface flagged** for `security-specialist` if the change touches: auth, authz, session, secrets, PII, payments, file upload/download, deserialization, raw SQL, shell exec, multi-tenant isolation, or a new external integration / trust boundary.',
];
const PHASE2_GATE_ADDITION = '- **UX consult recorded** in §5 when the UX trigger fired.';

const TRACE_HEADER = '| AC | Test file | Prova de RED (ref · comando · saída) | Status |';

test('AC-07 — o gate da VERIFY exige PROVA DE RED que um terceiro reproduz', () => {
  const flow = readFlow();
  const verify = flowBlock(flow, H.verify);

  // A linha vale em toda faixa e fica logo depois do exit gate da BASE.
  const line = lineStartingWith(verify, '**RED proof (every lane):**');
  assert.equal(line, RED_PROOF_LINE, 'a linha de RED proof da Phase 4 mudou');
  const lines = verify.split('\n');
  assert.equal(
    lines.indexOf(RED_PROOF_LINE),
    lines.indexOf(PHASE4_EXIT_GATE) + 1,
    'a RED proof não vem logo depois do exit gate da Phase 4'
  );
  assert.doesNotMatch(line, ESCAPE_HATCH, 'a RED proof ganhou válvula de escape');

  // A §8 do template ganha a coluna da evidência, no lugar da tabela antiga.
  const s8 = templateSection(flow, '## 8. QA plan');
  assert.equal(lineStartingWith(s8, '| AC | Test file |'), TRACE_HEADER, 'a tabela AC traceability não tem a coluna de PROVA DE RED');
});

test('AC-08 — (negativo) nenhum gate existente fica mais fraco', () => {
  const flow = readFlow();
  const verify = flowBlock(flow, H.verify);

  assert.equal(lineStartingWith(verify, '**Exit gate:**'), PHASE4_EXIT_GATE, 'o exit gate da Phase 4 mudou');
  assert.ok(
    PHASE4_EXIT_GATE.includes('every AC has at least one automated test that **fails without the change**'),
    'o literal pinado deixou de exigir teste que falha sem a mudança'
  );

  // Puramente aditivo: tirar o acréscimo (exatamente uma vez) devolve a BASE.
  const lines = verify.split('\n');
  assert.equal(lines.filter((l) => l === RED_PROOF_LINE).length, 1, 'o acréscimo da Phase 4 não aparece exatamente uma vez');
  assert.equal(lines.filter((l) => l === MOBILE_QA_LINE).length, 1, 'a linha mobile da Phase 4 não aparece exatamente uma vez');
  assert.equal(
    sha256(lines.filter((l) => l !== RED_PROOF_LINE && l !== MOBILE_QA_LINE).join('\n')),
    PHASE4_SHA256,
    'sem o acréscimo, o bloco da Phase 4 não volta ao da BASE'
  );

  // Phase 5: "no BLOCKERs" continua, e o acréscimo sai limpo.
  const gate5 = lineStartingWith(flowBlock(flow, H.review), '**Exit gate:**');
  assert.ok(gate5.includes(PHASE5_ADDITION), 'o exit gate da Phase 5 não tem o acréscimo da lente faltante');
  assert.equal(gate5.replace(PHASE5_ADDITION, ''), PHASE5_EXIT_GATE_BASE, 'o exit gate da Phase 5 não é puramente aditivo');

  // Phase 2: as três condições da BASE, na ordem, mais só o bullet de UX.
  const plan = flowBlock(flow, H.plan).split('\n');
  const start = plan.indexOf('**Exit gate:**');
  assert.notEqual(start, -1, 'o exit gate da Phase 2 sumiu');
  const bullets = [];
  for (let i = start + 1; i < plan.length && plan[i].startsWith('- '); i++) bullets.push(plan[i]);
  assert.deepEqual(bullets, [...PHASE2_GATE_BASE, PHASE2_GATE_ADDITION], 'o exit gate da Phase 2 não é o da BASE mais o bullet de UX');
});
