// C4 da demanda 006 — teto de 3 passagens por gate (AC-11, AC-12).
//
// O que isola: o bullet `Pass ceiling` em `## Rules` e a tabela de passagens
// da §8 do template, em `commands/flow.md`.
//
// O teto transforma a convenção anti-loop de `docs/FLOWS.md` em regra do
// command. O AC-12 é o negativo que importa: estourar o teto nunca vira
// aprovação — o modo de falha de um teto é justamente "passou do limite, então
// aceita como está".
//
// PROVA DE RED (forma da D3):
//   git show d78e998:commands/flow.md > "$TMPDIR/base-flow.md"
//   FLOW_MD_UNDER_TEST="$TMPDIR/base-flow.md" node --test test/flow-teto.test.js
// Esperado: AC-11 e AC-12 vermelhos.
const test = require('node:test');
const assert = require('node:assert');
const {
  H, readFlow, flowBlock, templateSection, lineStartingWith, has, ESCAPE_HATCH,
} = require('./support/flow-texts');

const CEILING_PREFIX = '- **Pass ceiling: 3 per gate.**';
const RULE_STOP = '- **Stop the chain on BLOCK or No-go.** Surface the blocking finding, propose the smallest path to green, ask the user to confirm before retrying.';
const PASSES_HEADER = '| Gate | n/3 | Achado | O que mudou |';

function ceiling(flow) {
  return lineStartingWith(flowBlock(flow, H.rules), CEILING_PREFIX);
}

test('AC-11 — teto de 3 passagens por gate, com escalonamento', () => {
  const flow = readFlow();
  const rule = ceiling(flow);

  has(rule, 'VERIFY (BUILD↔VERIFY) and REVIEW (REVIEW→BUILD) each get 3 passes', 'o teto não vale para cada um dos dois gates');
  has(rule, 'log each one in §8 **Passagens** (gate, finding, what changed)', 'as passagens não são registradas');
  has(rule, 'On the 3rd pass without green, stop', 'o flow não para na 3ª passagem');
  has(rule, 'escalate to the user with the finding that does not close, the 3 attempts and what changed in each', 'o escalonamento não traz achado, tentativas e mudanças');
  // Semântica de `docs/FLOWS.md`: volta que sobe de fase zera; NEEDS DISCUSSION não conta.
  has(rule, 'A loop-back to PLAN or earlier resets the count', 'volta a PLAN não zera a contagem');
  has(rule, '`NEEDS DISCUSSION` does not consume a pass', 'NEEDS DISCUSSION consome passagem');
  // O teto conta tentativas; não torna o loop automático.
  has(rule, "Every retry still needs the user's confirmation", 'o teto dispensou a confirmação do usuário');
  has(rule, 'never makes the loop automatic', 'o teto torna o loop automático');
  assert.equal(lineStartingWith(flowBlock(flow, H.rules), '- **Stop the chain'), RULE_STOP, 'a regra de confirmação antes de retentar mudou');

  const s8 = templateSection(flow, '## 8. QA plan');
  lineStartingWith(s8, '**Passagens:**');
  assert.equal(lineStartingWith(s8, '| Gate |'), PASSES_HEADER, 'a tabela de passagens da §8 mudou');
});

test('AC-12 — (negativo) estourar o teto nunca vira aprovação', () => {
  const rule = ceiling(readFlow());

  has(rule, 'set the phase to `bloqueada`', 'o estouro não marca a fase como bloqueada');
  has(rule, 'never advances to the next phase', 'o estouro avança de fase');
  has(rule, 'never ships', 'o estouro faz SHIP');
  has(rule, 'never marks the gate green or the phase `concluída`', 'o estouro marca verde ou concluída');
  has(rule, 'only an explicit user decision, recorded in `task.md`, changes that', 'a saída do estouro não exige decisão registrada do usuário');
  assert.doesNotMatch(rule, ESCAPE_HATCH, 'o teto ganhou válvula de escape');
  assert.doesNotMatch(rule, /accept(ed|ing)? (it )?(with|as)|caveat|ressalva/i, 'o teto autoriza aceitar com ressalva');
});
