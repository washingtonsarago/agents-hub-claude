// C1 da demanda 006 — faixa trivial do `/flow` (AC-01…AC-06 da §3).
//
// O que isola: o texto do `/flow` (`commands/flow.md`) e o playbook da faixa
// (`skills/flow-playbook/trivial-lane.md`), lido sob demanda pela D1 da §5.
// Não há harness que rode o orquestrador, então todo AC é predicado
// determinístico sobre o conteúdo, com os literais da §5.3 pinados.
//
// A faixa é o ponto em que um atalho barato vira buraco de segurança: por isso
// os AC-05 e AC-06 são negativos e fecham o vocabulário de válvula de escape.
//
// PROVA DE RED (forma da D3): rodar contra a BASE, pelo seam.
//   git show d78e998:commands/flow.md > "$TMPDIR/base-flow.md"
//   FLOW_MD_UNDER_TEST="$TMPDIR/base-flow.md" FLOW_PLAYBOOK_DIR_UNDER_TEST="$TMPDIR/sem-playbook" \
//     node --test test/flow-faixa-trivial.test.js
// Esperado: os 6 casos vermelhos (a BASE não tem a seção nem o playbook).
const test = require('node:test');
const assert = require('node:assert');
const {
  H, readFlow, readPlaybook, flowBlock, block, templateSection,
  lineStartingWith, tableRow, paragraphWith, has, sha256, ESCAPE_HATCH,
} = require('./support/flow-texts');

const LANE = 'trivial-lane.md';
// A frase que decidia a faixa depois da TRIAGE, de `e76b1bd:commands/flow.md:192`
// (trocada no loop-back da VERIFY), e o trecho que o AC-01 nega.
const OLD_LANE_DECISION = 'Decide the lane after TRIAGE and before DEFINE, and record it in §0 **Faixa**.';
const OLD_LANE_DECISION_SHA256 = '8f9b616599389905ea18521610bdf229593dfac0f0a1328f255ac223f5495dda';
const OLD_LANE_NEGATED = 'after TRIAGE and before DEFINE';
const FIELD_FAIXA = '**Faixa:** <padrão|trivial> — decidida no pre-flight, antes da GOAL';
// A regra única do sync de memória no SHIP (loop-back da VERIFY, passagem 2):
// escrita igual no flow.md e no playbook, para o sync não virar 5º obrigatório.
const SHIP_SYNC_BASE =
  '- `project-memory-keeper` finalizes updates across `business.md` / `architecture.md` / `guidelines.md` / ADRs / READMEs based on what actually shipped (not what was planned).';
const SHIP_EXIT_GATE_BASE = '**Exit gate:** commits created, memory synced, GOAL baseline recorded, demand moved to `done/`.';
const SHIP_EXIT_GATE_ADDITION = ' In the trivial lane only, a cited `nada a sincronizar` counts as memory synced.';
const MEMORY_RULE =
  'only when the shipped change alters something the memory describes, decided with a citation; otherwise §10 records `nada a sincronizar: <citação>` and no subagent runs';
const F_LINES = [
  '- F1 Produção ≤ 1 arquivo: <citação>',
  '- F2 Superfície sensível nenhuma: <citação>',
  '- F3 Contrato nenhum: <citação>',
  '- F4 AC ≤ 3: <citação>',
  '- F5 ADR nenhum: <citação>',
];

// Regras da BASE que a faixa não pode reescrever (AC-02, AC-06).
const RULE_NEVER_SKIP = '- **Never skip a phase to "save time".** The gates are the value.';
const RULE_GOAL = "- **GOAL is not optional.** If Phase 0 can't produce a measurable metric with a baseline, stop — you're not ready to build. Every later gate references it.";
const PHASE4_THEN_ALWAYS =
  '**Then, always:** `security-specialist` runs the security gate. If Phase 2.5 produced a STRIDE table, validate the required controls actually landed in the diff. Otherwise, run a fast pass on the touched files (secret scan + OWASP-relevant checks).';

// Frase que dispensa, pula ou torna opcional o security gate, nas duas ordens.
const WAIVES_SECURITY_GATE =
  /(skip|waive|drop|omit|optional|dispens)[^.\n]*security gate|security gate[^.\n]*(optional|skipped|waived|not required|dropped)/i;

test('AC-01 — entrada na faixa trivial por critério objetivo e citado', () => {
  const flow = readFlow();
  const sec = flowBlock(flow, H.trivial);

  // Os cinco critérios, conjuntivos, cada um com o seu conteúdo — não basta
  // haver cinco bullets, cada um tem de dizer o que a §3 pede.
  const f1 = lineStartingWith(sec, '- **F1**');
  has(f1, 'at most 1 production file', 'F1 não limita a 1 arquivo de produção');
  has(f1, 'the test that proves the change', 'F1 não exclui da conta o teste que prova a mudança');
  has(f1, '`manifest.json`', 'F1 não exclui da conta o arquivo gerado por script');
  has(lineStartingWith(sec, '- **F2**'), 'no sensitive surface', 'F2 não exclui superfície sensível');
  const f3 = lineStartingWith(sec, '- **F3**');
  for (const c of ['no new or changed contract', 'endpoint', 'payload', 'shared schema', 'published package']) {
    has(f3, c, 'F3 não enumera o contrato');
  }
  has(lineStartingWith(sec, '- **F4**'), 'at most 3 AC', 'F4 não limita a 3 AC');
  has(lineStartingWith(sec, '- **F5**'), 'no ADR', 'F5 não exclui ADR');
  has(sec, 'needs all five criteria', 'os critérios não são conjuntivos');

  // Cite-or-cap, no espírito da TRIAGE: citação por critério, e critério sem
  // citação cai para a faixa padrão (fail-closed, guidelines.md:38).
  has(sec, 'each with one citation (a path, a `path:line` or a verifiable absence)', 'critério não exige citação');
  const failClosed = paragraphWith(sec, 'An uncited criterion counts as not met');
  has(failClosed, 'the flow runs the standard lane', 'critério sem citação não devolve à faixa padrão');
  assert.doesNotMatch(failClosed, ESCAPE_HATCH, 'o fail-closed da citação ganhou válvula de escape');

  // Decisão no pre-flight, antes da Phase 0: decidir depois da TRIAGE deixava o
  // /discovery (PO + architect) rodar antes, e o AC-03 ficava inexecutável.
  has(sec, 'Decide the lane in pre-flight step 5, before Phase 0, and record it in §0 **Faixa**', 'a decisão de faixa não é anterior à Phase 0');
  // O literal negado é da frase real que a 006 trocou (sha pinado): sem isso,
  // um typo nele faria o !includes passar sem provar nada.
  assert.equal(sha256(OLD_LANE_DECISION), OLD_LANE_DECISION_SHA256, 'a frase antiga pinada mudou');
  has(OLD_LANE_DECISION, OLD_LANE_NEGATED, 'o literal negado não é da frase antiga');
  assert.ok(!flow.includes(OLD_LANE_NEGATED), 'a faixa ainda é decidida depois da TRIAGE');
  const pick = lineStartingWith(flowBlock(flow, H.preflight), '5. **Pick the lane.**');
  for (const c of [
    'Before Phase 0, evaluate F1–F5',
    'from the request and the predicted diff',
    'In the trivial lane Phase 0 is the one-line GOAL, without `/discovery`',
    'TRIAGE still always runs, and any later phase can take the change out of the lane',
    // TRIAGE abaixo do corte tira da faixa (loop-back da REVIEW, passagem 3).
    'a TRIAGE SCORE ≤ 6 (below the cut) takes it out, too',
  ]) has(pick, c, 'o pre-flight não decide a faixa antes da GOAL');
  assert.doesNotMatch(pick, ESCAPE_HATCH, 'a decisão da faixa ganhou válvula de escape');
  has(lineStartingWith(flowBlock(flow, H.goal), '**Trivial lane:**'), 'no `/discovery`', 'a Phase 0 da faixa trivial ainda chama /discovery');
  const s0 = templateSection(flow, '## 0. GOAL');
  assert.equal(lineStartingWith(s0, '**Faixa:**'), FIELD_FAIXA, 'o campo de faixa da §0 mudou');
  assert.deepEqual(s0.split('\n').filter((l) => /^- F\d /.test(l)), F_LINES, 'as linhas F1–F5 da §0 mudaram');
});

test('AC-02 — as 8 fases presentes e colapsadas, nenhuma pulada', () => {
  const flow = readFlow();
  has(
    flowBlock(flow, H.trivial),
    'the same eight phases (GOAL, TRIAGE, DEFINE, PLAN, BUILD, VERIFY, REVIEW, SHIP), collapsed, never skipped',
    'a seção não declara as 8 fases colapsadas'
  );

  // A forma colapsada de cada fase, uma linha de tabela por fase no playbook.
  const lane = readPlaybook(LANE);
  const row = (name) => tableRow(lane, new RegExp(`^\\| ${name} \\|`));
  const goal = row('GOAL');
  has(goal, 'One line in §0', 'GOAL não é de uma linha');
  has(goal, 'metric, baseline (with source) and target', 'GOAL colapsado perdeu métrica, baseline com fonte ou alvo');
  has(goal, 'No `/discovery`', 'GOAL colapsado ainda chama /discovery');
  has(row('TRIAGE'), 'Runs as written', 'TRIAGE deixou de rodar como hoje');
  has(row('TRIAGE'), 'a SCORE ≤ 6, or an F criterion it drops, leaves the lane', 'a TRIAGE abaixo do corte não tira da faixa');
  has(row('DEFINE \\+ PLAN'), 'written by the orchestrator, no subagent', 'DEFINE/PLAN colapsados usam subagent');
  has(row('BUILD'), 'The stack dev', 'BUILD não é do dev da stack');
  has(row('VERIFY'), 'The same Phase 4 exit gate, RED proof included', 'VERIFY colapsada não tem o mesmo gate');
  has(row('REVIEW'), 'exactly 1 reviewer', 'REVIEW colapsada não tem 1 revisor');
  row('SHIP');

  // As duas regras da BASE seguem no arquivo, com o mesmo texto.
  const rules = flowBlock(flow, H.rules);
  assert.equal(lineStartingWith(rules, '- **Never skip a phase'), RULE_NEVER_SKIP, 'a regra "Never skip a phase" mudou');
  assert.equal(lineStartingWith(rules, '- **GOAL is not optional.**'), RULE_GOAL, 'a regra "GOAL is not optional" mudou');
});

test('AC-03 — na faixa trivial, no máximo 4 subagents obrigatórios', () => {
  const lane = readPlaybook(LANE);
  const sec = block(lane, '## Mandatory subagents (a run without findings): 4', LANE);

  // A contagem declarada no heading bate com a enumeração, e fica ≤ 4.
  const items = sec.split('\n').filter((l) => /^\d+\. /.test(l));
  assert.equal(items.length, 4, `a faixa trivial enumera ${items.length} obrigatórios; o heading declara 4 (teto)`);

  const list = items.join('\n');
  has(list, 'The stack dev — BUILD', 'o dev da stack não é obrigatório');
  has(list, '`security-specialist` — the VERIFY security gate', 'o security gate não é obrigatório');
  has(list, 'One reviewer — REVIEW', 'o revisor único não é obrigatório');
  assert.doesNotMatch(list, /senior-product-owner|system-architect/, 'PO ou architect entrou entre os obrigatórios');
  has(sec, '`senior-product-owner` and `system-architect` are never mandatory here', 'a seção não exclui PO e architect');
  // O revisor único nunca é o system-architect, que no /code-review sempre dispara.
  has(sec, 'The single reviewer is never `system-architect`.', 'o revisor único pode ser o system-architect');
  has(sec, 'the stack lens the production file fires', 'o revisor único não é a lente de stack');

  // Sync de memória: uma regra só, igual nos dois lugares, condicional.
  // Só na faixa trivial: na padrão o sync e o exit gate do SHIP ficam os da
  // BASE, incondicionais (AC-08: nenhum gate existente fica mais fraco).
  const ship = flowBlock(readFlow(), H.ship);
  has(lineStartingWith(ship, '- **Trivial lane only:**'), MEMORY_RULE, 'o SHIP do flow.md não tem a regra condicional de sync da faixa trivial');
  has(ship, 'The standard lane always syncs.', 'a faixa padrão perdeu o sync incondicional');
  lineStartingWith(ship, SHIP_SYNC_BASE);
  const gate = lineStartingWith(ship, '**Exit gate:**');
  assert.ok(gate.startsWith(SHIP_EXIT_GATE_BASE), 'o exit gate do SHIP não começa pelo texto da BASE');
  assert.equal(gate.replace(SHIP_EXIT_GATE_ADDITION, ''), SHIP_EXIT_GATE_BASE, 'o exit gate do SHIP não é puramente aditivo');
  has(sec, MEMORY_RULE, 'o playbook diverge da regra de sync do flow.md');

  // O que é condicional é declarado como tal e fica fora da conta.
  const cond = paragraphWith(sec, 'Conditional, outside the count:');
  has(cond, 'adversarial verification', 'a verificação adversarial não está fora da conta');
  has(cond, 're-dispatches after a loop', 'o re-despacho de loop não está fora da conta');
});

test('AC-04 — saída da faixa quando algo a invalida no meio', () => {
  const lane = readPlaybook(LANE);
  const sec = block(lane, '## Leaving the lane', LANE);

  has(sec, 'When, in any phase, an F criterion stops holding', 'a saída não vale em qualquer fase');
  for (const c of ['a 2nd production file', 'a sensitive surface', 'a contract', 'a 4th AC', 'an ADR']) {
    has(sec, c, 'a saída não enumera o critério que pode cair');
  }
  has(sec, 'Record in §0 the criterion that fell, with a citation, and the phase where it fell', 'a saída não registra critério, citação e fase');
  has(sec, 'Resume in the standard lane from Phase 1 DEFINE', 'a saída não retoma do DEFINE na faixa padrão');
  has(sec, 'DEFINE and PLAN are redone by the standard-lane subagents', 'DEFINE e PLAN não são refeitos pelos subagents da faixa padrão');
  has(sec, 'meets the Phase 0 exit gate (named metric, baseline with source, target with date)', 'a GOAL de uma linha não passa pelo gate da Phase 0');
  has(sec, 'go back to Phase 0 with `/discovery`', 'a GOAL insuficiente não volta ao /discovery');
  has(sec, 'Never return to the trivial lane in the same flow.', 'a volta à faixa trivial não está proibida');
  assert.doesNotMatch(sec, ESCAPE_HATCH, 'a saída da faixa ganhou válvula de escape');

  // O `flow.md` manda ler o playbook, e playbook ilegível não abre a faixa.
  const flowSec = flowBlock(readFlow(), H.trivial);
  has(flowSec, 'read `~/.claude/skills/flow-playbook/trivial-lane.md`', 'o flow.md não aponta para o playbook da faixa');
  has(flowSec, 'Unreadable playbook → standard lane', 'playbook ilegível não cai na faixa padrão');

  // A saída mora no flow.md: com o playbook ilegível no meio do flow, o texto
  // dela não pode depender do playbook.
  const exit = paragraphWith(flowSec, '**Leaving the lane**');
  for (const c of [
    'the playbook turns unreadable mid-flow',
    'TRIAGE scores ≤ 6',
    'record in §0 the cause, with a citation, and the phase',
    'resume in the standard lane from Phase 1 DEFINE, with DEFINE and PLAN redone by the standard-lane subagents',
    'keep the one-line GOAL only if it meets the Phase 0 exit gate, otherwise rerun Phase 0 with `/discovery`',
    'Never return to the trivial lane in the same flow.',
  ]) has(exit, c, 'a saída da faixa não está escrita no flow.md');
  assert.doesNotMatch(exit, ESCAPE_HATCH, 'a saída no flow.md ganhou válvula de escape');
});

test('AC-05 — (negativo) superfície sensível nunca entra na faixa trivial', () => {
  const sec = flowBlock(readFlow(), H.trivial);
  const p = paragraphWith(sec, 'A sensitive surface excludes the trivial lane, always');
  has(p, 'at entry and mid-flow', 'a exclusão não vale na entrada e no meio do flow');
  has(p, "even at the user's explicit request", 'pedido do usuário ainda põe superfície sensível na faixa');
  has(p, 'Phase 2.5 then runs per its trigger', 'a Phase 2.5 não roda quando a faixa é excluída');
  assert.doesNotMatch(p, ESCAPE_HATCH, 'a exclusão por superfície sensível ganhou válvula de escape');
  has(lineStartingWith(sec, '- **F2**'), 'the Phase 2 list or any §6 box', 'F2 não usa a definição de superfície sensível');

  const lane = readPlaybook(LANE);
  const again = paragraphWith(lane, 'A sensitive surface excludes the trivial lane, always');
  assert.doesNotMatch(again, ESCAPE_HATCH, 'a exclusão no playbook ganhou válvula de escape');
});

test('AC-06 — (negativo) a faixa trivial nunca remove o security gate', () => {
  const flow = readFlow();
  const sec = flowBlock(flow, H.trivial);
  const p = paragraphWith(sec, 'The security gate runs in every lane');
  for (const c of ['`security-specialist`', 'VERIFY', 'secret scan', 'OWASP']) {
    has(p, c, 'a seção não manda rodar o security gate na VERIFY');
  }

  assert.equal(
    lineStartingWith(flowBlock(flow, H.verify), '**Then, always:**'),
    PHASE4_THEN_ALWAYS,
    'a linha **Then, always:** da Phase 4 mudou'
  );

  const lane = readPlaybook(LANE);
  has(tableRow(lane, /^\| VERIFY \|/), '`security-specialist` runs the security gate', 'a VERIFY colapsada perdeu o security gate');
  for (const [where, text] of [['flow.md', sec], [LANE, lane]]) {
    assert.doesNotMatch(text, WAIVES_SECURITY_GATE, `${where} dispensa ou torna opcional o security gate`);
  }
});
