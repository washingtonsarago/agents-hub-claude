// Consistência da demanda 006 (AC-21, AC-23, AC-25, AC-27) e as guardas de
// orçamento da §5.5.
//
// O que isola: saídas e template de `commands/flow.md`, a cadeia de fases que a
// 003 fixou, a relocação do protocolo de peer para `skills/flow-playbook/` (D1)
// e o idioma do texto novo.
//
// A D1 moveu o protocolo de peer para fora do prompt carregado em toda
// invocação, byte a byte. O sha pinado é a prova de que nenhuma regra foi
// reescrita no caminho: o texto é o das linhas 39–150 da BASE.
//
// PROVA DE RED (forma da D3):
//   git show d78e998:commands/flow.md > "$TMPDIR/base-flow.md"
//   git show d78e998:commands/code-review.md > "$TMPDIR/base-cr.md"
//   FLOW_MD_UNDER_TEST="$TMPDIR/base-flow.md" CODE_REVIEW_MD_UNDER_TEST="$TMPDIR/base-cr.md" \
//     FLOW_PLAYBOOK_DIR_UNDER_TEST="$TMPDIR/sem-playbook" node --test test/flow-consistencia.test.js
// Esperado: AC-21, AC-23, AC-25 e AC-27 vermelhos. As duas guardas também
// ficam vermelhas na BASE (o playbook não existe), mas não são prova de AC.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const {
  H, CODE_REVIEW_PATH, readFlow, readCodeReview, readPlaybook, playbookPath,
  flowBlock, crBlock, templateSection, lineStartingWith, has, sha256,
  PT_STOPWORDS, PT_DIACRITICS, withoutCodeSpans, inventedSlashCommands,
} = require('./support/flow-texts');

// Da BASE (d78e998), conferidos ao escrever o teste.
const OPENING =
  'You orchestrate a change end-to-end through the squad across **seven numbered phases** — `GOAL → DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP` — **plus two interstitial ones: Phase 0.5 TRIAGE, which always runs, and Phase 2.5 Threat modeling, which is conditional**. You do not implement — you delegate, gate, and synthesize. Every phase ties back to the **GOAL metric**: that traceability is the point of this command.';
const PHASE_HEADINGS = [
  '### Phase 0 — GOAL (Discovery)',
  '### Phase 0.5 — TRIAGE (Prompt clarity)',
  '### Phase 1 — DEFINE (Spec / PO)',
  '### Phase 2 — PLAN (Architecture)',
  '### Phase 2.5 — Threat modeling (Security, conditional)',
  '### Phase 3 — BUILD (stack-aware Dev)',
  '### Phase 4 — VERIFY (QA/SDET + Security gate)',
  '### Phase 5 — REVIEW',
  '### Phase 6 — SHIP',
];
const TRIAGE_SHA256 = '367567e47595818c9b690af69d32113fa446234e785b18e0156a241da9137502';
const PHASES_LINE = '  Phases:    GOAL ✅  DEFINE ✅  PLAN ✅  (SEC ➖)  BUILD ✅  VERIFY ✅  REVIEW ✅  SHIP ✅';

// D1: o bloco de peer, do heading ao fim, com `trimEnd()`.
const PEERS_HEADING = '## Peer sessions — what they add, and what they must never do';
const PEERS_SHA256 = 'e8f907c4a49852085c382ff2149a5b84fb165cd32ebe4af7924e2ea1697e82ad';
const PEERS_POINTER = '`~/.claude/skills/flow-playbook/peers.md`';
const LANE_POINTER = '`~/.claude/skills/flow-playbook/trivial-lane.md`';

// §5.5: orçamentos que a 006 impõe como guarda, não como AC.
const LANE_MAX_BYTES = 3500;
const CODE_REVIEW_MAX_BYTES = 13500;

test('AC-21 — template e saídas refletem faixa e status', () => {
  const flow = readFlow();
  const s0 = templateSection(flow, '## 0. GOAL');
  lineStartingWith(s0, '**Faixa:**');
  lineStartingWith(s0, '**Status por fase:**');

  const perPhase = flowBlock(flow, H.outPhase);
  lineStartingWith(perPhase, '  Faixa: <padrão|trivial> · Status: <status> · Passagem: <n>/3');

  const final = flowBlock(flow, H.outFinal);
  lineStartingWith(final, '  Faixa:     <padrão|trivial>');
  const legend = lineStartingWith(final, '  legend:');
  has(legend, '◇ collapsed (trivial lane)', 'a legenda não distingue fase colapsada');
  has(legend, '➖ skipped (not triggered)', 'a legenda perdeu o ➖');

  // `➖` continua só na SEC: a linha Phases é a da BASE.
  assert.equal(lineStartingWith(final, '  Phases:'), PHASES_LINE, 'a linha Phases mudou');
  has(
    readPlaybook('trivial-lane.md'),
    'In the final output GOAL, DEFINE and PLAN show `◇`; `➖` stays reserved for SEC.',
    'o playbook não diz como a faixa trivial aparece na saída final'
  );
});

test('AC-23 — a faixa é modo, não fase; TRIAGE e DEFINE da 003 intactos', () => {
  const flow = readFlow();
  const lines = flow.split('\n');

  // Modo: heading de nível 2 fora da cadeia, nenhuma fase nova.
  assert.ok(lines.includes(H.trivial), `sem o heading ${H.trivial}`);
  assert.deepEqual(lines.filter((l) => /^### Phase /.test(l)), PHASE_HEADINGS, 'a cadeia de fases mudou');
  // Por conteúdo, não por posição: uma linha a mais no topo não é regressão.
  assert.deepEqual(lines.filter((l) => l.startsWith('You orchestrate a change')), [OPENING], 'a linha de abertura mudou');

  // A TRIAGE não sabe da faixa e não pontua tamanho: bloco byte a byte.
  const triage = flowBlock(flow, H.triage);
  assert.doesNotMatch(triage, /trivial|faixa|lane/i, 'a TRIAGE menciona a faixa');
  assert.equal(sha256(triage), TRIAGE_SHA256, 'o bloco da TRIAGE mudou');

  // Nenhum slash command novo no texto da faixa.
  for (const [where, text] of [['flow.md', flowBlock(flow, H.trivial)], ['trivial-lane.md', readPlaybook('trivial-lane.md')]]) {
    assert.deepEqual(inventedSlashCommands(text), [], `sintaxe nova em ${where}`);
  }
});

test('AC-25 — orçamento: o texto condicional mora no playbook, lido sob demanda', () => {
  const flow = readFlow();

  // Protocolo de peer relocado byte a byte.
  const peers = readPlaybook('peers.md');
  const start = peers.indexOf(PEERS_HEADING);
  assert.notEqual(start, -1, 'peers.md não tem o heading do protocolo de peer');
  assert.equal(sha256(peers.slice(start).trimEnd()), PEERS_SHA256, 'o protocolo de peer não foi relocado byte a byte');
  assert.ok(!flow.split('\n').includes(PEERS_HEADING), 'o protocolo de peer continua no flow.md');

  // O flow.md aponta para onde a regra passou a viver, com fail-closed.
  const pre = flowBlock(flow, H.preflight);
  has(pre, `read ${PEERS_POINTER}`, 'o pre-flight não aponta para peers.md');
  has(pre, 'Unreadable playbook → consult no peer and record the reason in §9', 'peers.md ilegível não tem fail-closed');
  has(flowBlock(flow, H.trivial), LANE_POINTER, 'a faixa não aponta para trivial-lane.md');
  assert.ok(!flow.includes('See the peer rules above'), 'o flow.md ainda remete a regras de peer "acima"');

  // Skill inerte: sem invocação pelo modelo e sem slash command (D1, AC-23).
  const skill = readPlaybook('SKILL.md');
  const fm = /^---\n([\s\S]*?)\n---/.exec(skill);
  assert.ok(fm, 'SKILL.md sem frontmatter');
  for (const l of ['name: flow-playbook', 'disable-model-invocation: true', 'user-invocable: false']) {
    assert.ok(fm[1].split('\n').includes(l), `SKILL.md sem ${l}`);
  }
});

test('AC-27 — idioma: instrução nova em inglês, campos lidos pelo usuário em PT-BR', () => {
  const flow = readFlow();
  const cr = readCodeReview();
  const plan = flowBlock(flow, H.plan);
  const step2 = crBlock(cr, H.crStep2);
  const step4 = crBlock(cr, H.crStep4);

  // O texto instrucional que a 006 acrescenta, sem os literais entre crases.
  const instructional = [
    ['flow.md §Trivial lane', flowBlock(flow, H.trivial)],
    ['flow.md Resume', lineStartingWith(flowBlock(flow, H.preflight), '0. **Resume, never restart.**')],
    ['flow.md Pick the lane', lineStartingWith(flowBlock(flow, H.preflight), '5. **Pick the lane.**')],
    ['flow.md Reads', lineStartingWith(flowBlock(flow, H.review), '**Reads:**')],
    ['flow.md UX consult', lineStartingWith(plan, '**UX consult (conditional, inside this phase):**')],
    ['flow.md RED proof', lineStartingWith(flowBlock(flow, H.verify), '**RED proof (every lane):**')],
    ['flow.md Pass ceiling', lineStartingWith(flowBlock(flow, H.rules), '- **Pass ceiling: 3 per gate.**')],
    ['flow.md Resumed flow', lineStartingWith(flowBlock(flow, H.cost), '**Resumed flow:**')],
    ['code-review Missing lens', lineStartingWith(step4, '**Missing lens.**')],
    ['code-review verificação', step4.slice(step4.indexOf('7. **Adversarial verification'))],
    ['code-review Not a UX trigger', lineStartingWith(step2, '- **Not a UX trigger:**')],
    ['code-review Single-reviewer', lineStartingWith(step2, '**Single-reviewer mode.**')],
    ['trivial-lane.md', readPlaybook('trivial-lane.md')],
  ];
  for (const [where, text] of instructional) {
    const bare = withoutCodeSpans(text).replace(/\*\*(Faixa|Status por fase|Passagens|UX consult|UX):?\*\*/g, '');
    const pt = [...new Set((bare.match(PT_STOPWORDS) || []).map((w) => w.toLowerCase()))];
    assert.deepEqual(pt, [], `instrução em PT-BR em ${where}: ${JSON.stringify(pt)}`);
    const accents = [...new Set(bare.match(PT_DIACRITICS) || [])];
    assert.deepEqual(accents, [], `diacrítico PT em ${where}: ${JSON.stringify(accents)}`);
  }

  // O que o usuário lê: campos do template e seções do relatório em PT-BR.
  has(lineStartingWith(templateSection(flow, '## 0. GOAL'), '**Faixa:**'), 'decidida no pre-flight, antes da GOAL', 'o campo de faixa não está em PT-BR');
  has(templateSection(flow, '## 0. GOAL'), 'concluída · bloqueada · não se aplica', 'os status não estão em PT-BR');
  has(templateSection(flow, '## 8. QA plan'), 'Prova de RED (ref · comando · saída)', 'a coluna de RED não está em PT-BR');
  const step5 = crBlock(cr, H.crStep5);
  lineStartingWith(step5, '## Lentes faltantes');
  lineStartingWith(step5, '## Achados refutados');
});

// ---------------------------------------------------------------------------
// Guardas de orçamento — NÃO são AC (§5.5 da 006). Mesmo raciocínio do T9 da
// 003: `code-review.md` é carregado inteiro em toda REVIEW, e `trivial-lane.md`
// em toda faixa trivial, então cada byte é custo fixo. Quem estoura volta ao
// PLAN; não afrouxa a asserção. O `flow.md` segue sob o T9 da 003 (470 / 33.000).
// ---------------------------------------------------------------------------

test('§5.5 — orçamento de `skills/flow-playbook/trivial-lane.md`', () => {
  const p = playbookPath('trivial-lane.md');
  assert.ok(fs.existsSync(p), `playbook ausente: ${p}`);
  const bytes = fs.statSync(p).size;
  assert.ok(bytes <= LANE_MAX_BYTES, `trivial-lane.md tem ${bytes} bytes, teto ${LANE_MAX_BYTES} — volta ao PLAN`);
});

test('§5.5 — orçamento de `commands/code-review.md`', () => {
  const bytes = fs.statSync(CODE_REVIEW_PATH).size;
  assert.ok(bytes <= CODE_REVIEW_MAX_BYTES, `code-review.md tem ${bytes} bytes, teto ${CODE_REVIEW_MAX_BYTES} — volta ao PLAN`);
});
