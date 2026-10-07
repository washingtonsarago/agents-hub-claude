// C5 da demanda 006 — `/code-review` fail-closed e verificação adversarial
// (AC-13…AC-16), mais a ligação com o gate da REVIEW do `/flow` (AC-14).
//
// O que isola: os Steps 4 e 5 de `commands/code-review.md`, o exit gate da
// Phase 5 de `commands/flow.md` e o revisor único do playbook da faixa trivial.
//
// Antes da 006 o veredito agregava só quem devolveu: um revisor que falhava
// sumia da conta e o resultado podia sair APPROVED sem a lente dele. Os
// predicados abaixo prendem a precedência do veredito à ordem dos bullets,
// porque é a ordem que o orquestrador lê.
//
// PROVA DE RED (forma da D3):
//   git show d78e998:commands/code-review.md > "$TMPDIR/base-cr.md"
//   git show d78e998:commands/flow.md > "$TMPDIR/base-flow.md"
//   CODE_REVIEW_MD_UNDER_TEST="$TMPDIR/base-cr.md" FLOW_MD_UNDER_TEST="$TMPDIR/base-flow.md" \
//     FLOW_PLAYBOOK_DIR_UNDER_TEST="$TMPDIR/sem-playbook" node --test test/code-review-fail-closed.test.js
// Esperado: os 4 casos vermelhos.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers');
const {
  H, readFlow, readCodeReview, readPlaybook, flowBlock, crBlock, block,
  lineStartingWith, tableRow, has, ESCAPE_HATCH,
} = require('./support/flow-texts');

const MISSING_LENS =
  '**Missing lens.** A dispatched reviewer that failed, timed out, or returned output without a valid `verdict:` line is a missing lens.';
const PHASE5_EXIT_GATE = '**Exit gate:** no BLOCKERs; no missing lens (verdict `INCOMPLETE` is not green, in every lane).';
const VERIFY_PREFIX = '7. **Adversarial verification (BLOCKER/WARNING only).**';

// O item 7 e os seus sub-bullets, até o fim do Step 4.
function verification(cr) {
  const lines = crBlock(cr, H.crStep4).split('\n');
  const start = lines.findIndex((l) => l.startsWith(VERIFY_PREFIX));
  assert.notEqual(start, -1, `o Step 4 não tem o item ${VERIFY_PREFIX}`);
  const out = [lines[start]];
  for (let i = start + 1; i < lines.length && lines[i].startsWith('   - '); i++) out.push(lines[i]);
  return out.join('\n');
}

test('AC-13 — revisor faltante nunca vira APPROVE limpo', () => {
  const cr = readCodeReview();
  const step4 = crBlock(cr, H.crStep4);
  has(step4, MISSING_LENS, 'o Step 4 não define lente faltante');

  // Precedência: CHANGES REQUESTED > INCOMPLETE > NEEDS DISCUSSION > aprovados.
  const verdicts = step4.split('\n').filter((l) => /^ {3}- .*→ overall \*\*/.test(l));
  const idx = (label) => verdicts.findIndex((l) => l.includes(`→ overall **${label}**`));
  // Cada rótulo existe antes de comparar posições: -1 < n passaria calado.
  for (const label of ['CHANGES REQUESTED', 'INCOMPLETE', 'NEEDS DISCUSSION', 'APPROVED WITH COMMENTS', 'APPROVED']) {
    assert.notEqual(idx(label), -1, `o veredito geral não tem ${label}`);
  }
  const incomplete = verdicts[idx('INCOMPLETE')];
  assert.ok(incomplete, 'o veredito geral não tem INCOMPLETE');
  has(incomplete, 'Any missing lens', 'INCOMPLETE não dispara com lente faltante');
  has(incomplete, 'never APPROVED nor APPROVED WITH COMMENTS', 'lente faltante ainda pode aprovar');
  has(incomplete, 'when every reviewer is missing', 'INCOMPLETE não cobre todos os revisores faltando');
  assert.ok(idx('CHANGES REQUESTED') < idx('INCOMPLETE'), 'INCOMPLETE vem antes de CHANGES REQUESTED');
  assert.ok(idx('INCOMPLETE') < idx('NEEDS DISCUSSION'), 'NEEDS DISCUSSION vem antes de INCOMPLETE');
  assert.ok(idx('NEEDS DISCUSSION') < idx('APPROVED WITH COMMENTS'), 'a ordem dos aprovados mudou');
  has(verdicts[idx('NEEDS DISCUSSION')], 'no missing lens', 'NEEDS DISCUSSION não exclui lente faltante');

  // O caminho cosmético também é fail-closed.
  const step2 = crBlock(cr, H.crStep2);
  has(lineStartingWith(step2, '- If the diff is purely cosmetic'), 'a missing `system-architect` there is still `INCOMPLETE`', 'o caminho cosmético aprova sem o revisor');

  // O relatório nomeia cada lente faltante e o motivo.
  const step5 = crBlock(cr, H.crStep5);
  has(lineStartingWith(step5, '## Veredicto:'), 'INCOMPLETE', 'o relatório não prevê o veredito INCOMPLETE');
  lineStartingWith(step5, '## Lentes faltantes');
  has(step5, '- <reviewer>: <falhou | timeout | saída fora do formato>', 'o relatório não nomeia lente faltante e motivo');
});

test('AC-14 — a REVIEW do `/flow` não fica verde com revisão incompleta', () => {
  assert.equal(
    lineStartingWith(flowBlock(readFlow(), H.review), '**Exit gate:**'),
    PHASE5_EXIT_GATE,
    'o exit gate da Phase 5 não barra lente faltante'
  );
  has(
    readPlaybook('trivial-lane.md'),
    'A failing single reviewer is a missing lens: verdict `INCOMPLETE`, and REVIEW does not pass.',
    'o revisor único da faixa trivial não segue a regra da lente faltante'
  );
  // O gate lê o veredito recalculado depois da verificação.
  has(
    lineStartingWith(flowBlock(readFlow(), H.review), '**Reads:**'),
    'the verdict recomputed after the adversarial verification',
    'a Phase 5 não lê o veredito recalculado'
  );

  // --single-reviewer só vale com a faixa trivial registrada e a VERIFY
  // concluída, e nunca com system-architect; fora disso, modo completo.
  const single = lineStartingWith(crBlock(readCodeReview(), H.crStep2), '**Single-reviewer mode.**');
  for (const c of [
    "holds only when the demand's `task.md`",
    'records **Faixa:** `trivial` and VERIFY `concluída`',
    '`<agent>` is not `system-architect`',
    'otherwise, or with that `task.md` missing or unreadable, the flag is void and the full mode runs',
    // Só depois de a VERIFY ter passado de fato, não só de estar marcada.
    'VERIFY `concluída` with `Evidência` citing **APPROVE** or **APPROVE WITH MITIGATIONS**',
  ]) has(single, c, 'o modo revisor único vale fora da faixa trivial');
  assert.doesNotMatch(single, ESCAPE_HATCH, 'o modo revisor único ganhou válvula de escape');
  has(tableRow(readPlaybook('trivial-lane.md'), /^\| REVIEW \|/), 'plus the path of this `task.md`', 'a faixa trivial não passa o task.md ao /code-review');
});

test('AC-15 — BLOCKER e WARNING passam por verificação adversarial; INFO não', () => {
  const cr = readCodeReview();
  const v = verification(cr);

  has(v, 'try to refute each BLOCKER and WARNING against the code at its cited `file:line`', 'a verificação não tenta refutar contra o código');
  has(v, 'INFO is not verified (cost)', 'a verificação não exclui INFO');
  has(v, '`confirmado | refutado | inconclusivo`', 'a verificação não fixa os três resultados');
  // Custo com teto fixo (D5): no máximo 2 despachos, zero sem achado.
  has(v, 'Dispatch at most 2 fresh agents in parallel, none when there is no BLOCKER/WARNING', 'a verificação não tem teto de despacho');
  has(v, 'goes to `## Achados refutados` with that evidence, never dropped silently', 'achado refutado some em silêncio');
  // O veredito é recalculado sobre o que sobrou, e é esse que a Phase 5 lê.
  has(v, 'Then recompute item 6 on what remains', 'o veredito não é recalculado depois da verificação');
  has(v, 'The report and `/flow` Phase 5 read this recomputed verdict.', 'o relatório e a Phase 5 não leem o veredito recalculado');

  // A seção existe no relatório, e a verificação vem depois do veredito da
  // agregação, sem renumerar o Step 5.
  lineStartingWith(crBlock(cr, H.crStep5), '## Achados refutados');
  const items = crBlock(cr, H.crStep4).split('\n').filter((l) => /^\d+\. /.test(l));
  const idx6 = items.findIndex((l) => l.startsWith('6. **Decide the overall verdict**'));
  assert.notEqual(idx6, -1, 'o Step 4 não tem o item 6 da agregação');
  assert.equal(
    items.findIndex((l) => l.startsWith(VERIFY_PREFIX)),
    idx6 + 1,
    'a verificação não é o item seguinte à agregação'
  );

  // O recálculo só aprova com pelo menos um BLOCKER, todos refutados, e sem
  // WARNING bloqueante de pé; o caso vazio fica CHANGES_REQUESTED (fail-closed).
  const recompute = v.split('\n').find((l) => l.startsWith('   - Then recompute item 6'));
  assert.ok(recompute, 'o recálculo sumiu');
  for (const c of [
    'counts as `APPROVED_WITH_COMMENTS` only when it raised at least one BLOCKER, all `refutado`',
    'and no `confirmado` or `inconclusivo` WARNING its reviewer called blocking',
    'otherwise it stays `CHANGES_REQUESTED`',
  ]) has(recompute, c, 'o recálculo aprova sem as três condições');
  assert.doesNotMatch(recompute, ESCAPE_HATCH, 'o recálculo ganhou válvula de escape');
});

test('AC-16 — (negativo) a verificação nunca rebaixa sem prova', () => {
  const v = verification(readCodeReview());

  has(v, '`refutado` needs the `path:line` evidence that refutes it', 'refutar não exige evidência citada');
  has(v, '`inconclusivo` keeps the finding at its original severity', 'inconclusivo não mantém a severidade');
  has(v, 'a failed or timed-out verifier, or unreadable output keeps the finding at its original severity (fail-closed)', 'falha do verificador derruba o achado');
  has(v, 'A finding absent from the verifier', 'achado omitido pelo verificador não é mantido');
  has(v, 'Verification never lowers a severity', 'a verificação pode rebaixar severidade');
  // Concordância de quem levantou: categoria Security OU levantado pelo
  // security-specialist, pedida a todo "raised by"; sem ele, o BLOCKER fica.
  const sec = v.split('\n').find((l) => l.includes('is `refutado` only when every reviewer that raised it'));
  assert.ok(sec, 'BLOCKER de segurança cai sem a concordância de quem o levantou');
  for (const c of [
    'A BLOCKER of category Security, or raised by `security-specialist`',
    '(each "raised by" after dedupe) also agrees via `SendMessage`',
    'a raiser unavailable (as in single-reviewer mode), no agreement or no reply keeps it',
  ]) has(sec, c, 'a concordância para refutar BLOCKER de segurança afrouxou');
  has(v, 'is refuted only when the explicit justification is in the diff', 'o BLOCKER de teste acomodado pode ser refutado sem justificativa no diff');
  assert.doesNotMatch(v, ESCAPE_HATCH, 'a verificação ganhou válvula de escape');
});

// Os outros orquestradores que chamam o `/code-review` herdam o fail-closed:
// sem isto, `INCOMPLETE` passaria no gate deles por não ter BLOCKER.
const OTHER_FLOW_REVIEW_GATE = '**Exit gate:** no BLOCKERs; no missing lens (`INCOMPLETE` is not green).';

test('AC-14 — `/feature-flow` e `/bug-flow` não ficam verdes com revisão incompleta', () => {
  for (const [name, heading] of [['feature-flow.md', '### Phase 7 — Review'], ['bug-flow.md', '### Phase 7 — Review']]) {
    const file = path.join(REPO_ROOT, 'commands', name);
    const text = fs.readFileSync(file, 'utf8');
    const review = block(text, heading, file);
    has(review, '`/code-review`', `${name}: a fase de review não usa o /code-review`);
    assert.equal(lineStartingWith(review, '**Exit gate:**'), OTHER_FLOW_REVIEW_GATE, `${name}: o gate da review aceita INCOMPLETE`);
  }
});
