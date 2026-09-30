// C6 da demanda 006 — UX quando a mudança altera interface visível
// (AC-17…AC-20).
//
// O que isola: a consulta de UX dentro da Phase 2 e o template da §5 em
// `commands/flow.md`, as linhas de UI do Step 2 de `commands/code-review.md` e o
// revisor único do playbook da faixa trivial.
//
// O gatilho é por caminho e dispara por padrão (fail-closed): quem quer que ele
// não dispare cita, por arquivo, por que o render não muda. O AC-20 é o outro
// lado — refatoração sem mudança visível não paga a consulta, para que UX não
// vire custo fixo.
//
// PROVA DE RED (forma da D3):
//   git show d78e998:commands/flow.md > "$TMPDIR/base-flow.md"
//   git show d78e998:commands/code-review.md > "$TMPDIR/base-cr.md"
//   FLOW_MD_UNDER_TEST="$TMPDIR/base-flow.md" CODE_REVIEW_MD_UNDER_TEST="$TMPDIR/base-cr.md" \
//     FLOW_PLAYBOOK_DIR_UNDER_TEST="$TMPDIR/sem-playbook" node --test test/flow-ux.test.js
// Esperado: os 4 casos vermelhos.
const test = require('node:test');
const assert = require('node:assert');
const {
  H, readFlow, readCodeReview, readPlaybook, flowBlock, crBlock, templateSection,
  lineStartingWith, tableRow, has, ESCAPE_HATCH,
  UI_WEB_GLOBS, UI_MOBILE_GLOBS, UI_OTHER_FILES,
} = require('./support/flow-texts');

const UX_PREFIX = '**UX consult (conditional, inside this phase):**';
// A lista do gatilho, na ordem do flow.md: globs web, globs mobile, e o resto.
const UI_TRIGGER = `${[...UI_WEB_GLOBS, ...UI_MOBILE_GLOBS].join(', ')}, ${UI_OTHER_FILES}`;
const TEMPLATE_UX = '**UX:** <dispara|não dispara> — <telas/componentes (path)> | <por que nada visível muda (path:line)>';
const TEMPLATE_UX_CONSULT = '**UX consult:** <ux-designer-web|ux-designer-mobile> — fluxo · estados (vazio/erro/carregando) · a11y';
// Seções do template citadas por número no `flow.md` (§6, §8, §11): nada renumera.
const TEMPLATE_SECTIONS = ['## 0.', '## 1.', '## 2.', '## 3.', '## 4.', '## 5.', '## 6.', '## 7.', '## 8.', '## 9.', '## 10.', '## 11.'];

function uxLine(flow) {
  return lineStartingWith(flowBlock(flow, H.plan), UX_PREFIX);
}

test('AC-17 — gatilho de UX objetivo, citado e roteado por plataforma', () => {
  const flow = readFlow();
  const ux = uxLine(flow);

  has(ux, UI_TRIGGER, 'o gatilho do flow.md diverge da lista compartilhada');
  // Fail-closed: dispara por padrão; só não dispara com citação por arquivo.
  has(ux, 'It fires by default', 'o gatilho não é fail-closed');
  has(ux, 'it stays off for a file only when §5 cites, per file with `path:line`, why nothing visible changes', 'o não-disparo não exige citação por arquivo');
  // Roteamento fixo.
  has(ux, 'web (React, Vue, Svelte, HTML/CSS outside React Native) → `ux-designer-web`', 'web não vai para ux-designer-web');
  has(ux, '`*.dart`, React Native or native UI → `ux-designer-mobile`', 'Dart/RN não vai para ux-designer-mobile');
  has(ux, 'both platforms → both', 'as duas plataformas não chamam os dois');
  has(ux, 'the affected screens/components (`path`)', 'as telas afetadas não são citadas por caminho');
  assert.doesNotMatch(ux, ESCAPE_HATCH, 'o gatilho de UX ganhou válvula de escape');

  assert.equal(lineStartingWith(templateSection(flow, '## 5. Implementation guide'), '**UX:**'), TEMPLATE_UX, 'o campo UX da §5 mudou');
});

test('AC-18 — consulta de UX no PLAN, antes do BUILD', () => {
  const flow = readFlow();
  const ux = uxLine(flow);

  has(ux, 'defines flow, states (empty, error, loading) and accessibility **before** BUILD', 'a consulta não cobre fluxo, estados e a11y antes do BUILD');
  has(ux, 'recorded in **UX consult:** in §5', 'a consulta não é registrada na §5');
  has(ux, 'The trivial lane has no UX consult in PLAN.', 'a faixa trivial ainda consulta UX no PLAN');
  lineStartingWith(flowBlock(flow, H.plan), '- **UX consult recorded** in §5 when the UX trigger fired.');

  // Registro num lugar previsto do template, sem renumerar seção.
  const tpl = flowBlock(flow, H.template);
  assert.equal(lineStartingWith(templateSection(flow, '## 5. Implementation guide'), '**UX consult:**'), TEMPLATE_UX_CONSULT, 'o campo UX consult da §5 mudou');
  assert.deepEqual(
    tpl.split('\n').filter((l) => /^## \d+\./.test(l)).map((l) => /^## \d+\./.exec(l)[0]),
    TEMPLATE_SECTIONS,
    'as seções do template foram renumeradas'
  );

  // A consulta vive dentro da Phase 2: nenhum heading de UX.
  assert.deepEqual(flow.split('\n').filter((l) => /^#{2,3} .*\bUX\b/.test(l)), [], 'a consulta de UX virou seção própria');
  has(readPlaybook('trivial-lane.md'), 'No UX consult here.', 'o PLAN colapsado da faixa trivial consulta UX');
});

test('AC-19 — lente de UX/a11y no `/code-review` para diff de UI', () => {
  const step2 = crBlock(readCodeReview(), H.crStep2);

  const web = tableRow(step2, /^\| \*\*UI visible — web\*\* \|/);
  has(web, '`ux-designer-web`', 'a lente web não despacha ux-designer-web');
  // A MESMA lista do flow.md: globs web, tema/tokens, imagem/fonte e copy.
  has(web, UI_WEB_GLOBS.join(', '), 'a lente web diverge dos globs do flow.md');
  has(web, UI_OTHER_FILES, 'a lente web não cobre tema, asset/fonte ou copy');
  has(web, 'accessibility', 'a lente web não cobre acessibilidade');

  const mobile = tableRow(step2, /^\| \*\*UI visible — mobile\*\* \|/);
  has(mobile, '`ux-designer-mobile`', 'a lente mobile não despacha ux-designer-mobile');
  for (const g of UI_MOBILE_GLOBS) has(mobile, g, 'a lente mobile não cobre Dart');
  has(mobile, 'those theme, asset and copy files on mobile', 'a lente mobile não cobre tema, asset e copy');
  has(mobile, 'React Native components', 'a lente mobile não cobre React Native');
  has(mobile, 'accessibility', 'a lente mobile não cobre acessibilidade');

  // Sem lente dupla: o senior-product-designer fica só com copy sem mudança visual.
  assert.deepEqual(step2.split('\n').filter((l) => l.startsWith('| **UI/UX** |')), [], 'a linha UI/UX antiga continua');
  const copy = tableRow(step2, /`senior-product-designer`/);
  has(copy, 'no visual change, only when no UI visible lens fired', 'o senior-product-designer duplica a lente de UX');

  // Cabe no teto de 6 revisores.
  has(lineStartingWith(step2, '- Cap the parallel pool at **6 reviewers**'), 'UX lenses count toward the cap', 'a lente de UX fica fora do teto de 6');
});

test('AC-20 — (negativo) sem UI visível não há UX; na faixa trivial, UX é o revisor único', () => {
  const flow = readFlow();
  const ux = uxLine(flow);
  has(ux, 'Not a trigger: a front-end refactor with no visible change (hook, API call, typing)', 'o flow.md não nomeia o não-gatilho');
  has(ux, 'a file extension alone never fires it once that citation exists', 'o flow.md dispara UX só pela extensão');

  const step2 = crBlock(readCodeReview(), H.crStep2);
  const not = lineStartingWith(step2, '- **Not a UX trigger:**');
  has(not, 'a front-end refactor with no visible change (hook, API call, typing)', 'o code-review não nomeia o não-gatilho');
  has(not, 'A file extension alone (`.tsx`, `.jsx`, `.dart`) never fires a UX lens when the change cites that the render does not change', 'o code-review dispara UX só pela extensão');
  // Fail-closed também fora do /flow: sem a citação, a lente dispara.
  has(not, 'Without that citation in the diff or `task.md` (also outside `/flow`), the UX lens fires.', 'o code-review fora do /flow deixa de disparar UX sem citação');
  assert.doesNotMatch(not, ESCAPE_HATCH, 'o não-gatilho de UX ganhou válvula de escape');

  // Na faixa trivial, UX ocupa a vaga do revisor único; sem UI, nenhum UX.
  const lane = readPlaybook('trivial-lane.md');
  has(lane, 'The single reviewer is the platform UX agent (`ux-designer-web` or `ux-designer-mobile`) when the diff changes visible UI', 'o revisor único não é o UX com UI visível');
  has(lane, 'no UX agent is dispatched', 'a faixa trivial despacha UX sem UI visível');
  has(lane, 'The count stays at 4 either way.', 'a conta de obrigatórios muda com UX');
});
