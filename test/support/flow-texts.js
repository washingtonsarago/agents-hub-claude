// Leitura e recorte dos textos que a demanda 006 fixa: `commands/flow.md`,
// `commands/code-review.md` e o playbook `skills/flow-playbook/`.
//
// Por que um módulo compartilhado: os sete arquivos de teste da 006 leem os
// mesmos três artefatos, e o modo de falha que a §5.6 da 006 declara é "literal
// divergente entre texto e teste". Um recorte de bloco por arquivo de teste é
// sete chances de recortar diferente.
//
// Por que seams por variável de ambiente, e não `git`: a PROVA DE RED da 006
// roda cada teste contra o arquivo da BASE (`git show d78e998:<path>` salvo num
// arquivo temporário). O teste em si nunca chama `git` — diff é propriedade de
// um PR, não do artefato (`guidelines.md` §Anti-patterns, lição da 003).
//   FLOW_MD_UNDER_TEST            → commands/flow.md (o mesmo seam da 003)
//   CODE_REVIEW_MD_UNDER_TEST     → commands/code-review.md
//   FLOW_PLAYBOOK_DIR_UNDER_TEST  → skills/flow-playbook/
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REPO_ROOT } = require('../helpers');

const FLOW_PATH = process.env.FLOW_MD_UNDER_TEST || path.join(REPO_ROOT, 'commands', 'flow.md');
const CODE_REVIEW_PATH =
  process.env.CODE_REVIEW_MD_UNDER_TEST || path.join(REPO_ROOT, 'commands', 'code-review.md');
const PLAYBOOK_DIR =
  process.env.FLOW_PLAYBOOK_DIR_UNDER_TEST || path.join(REPO_ROOT, 'skills', 'flow-playbook');

// Headings que os testes usam para recortar. Um lugar só: se o texto renomear
// um heading, todos os testes quebram juntos, e não um por vez.
const H = {
  preflight: '## Pre-flight (mandatory)',
  phaseChain: '## Phase chain',
  goal: '### Phase 0 — GOAL (Discovery)',
  triage: '### Phase 0.5 — TRIAGE (Prompt clarity)',
  plan: '### Phase 2 — PLAN (Architecture)',
  verify: '### Phase 4 — VERIFY (QA/SDET + Security gate)',
  review: '### Phase 5 — REVIEW',
  ship: '### Phase 6 — SHIP',
  cost: '### Cost accounting (Phase 6, mandatory)',
  trivial: '## Trivial lane (a mode, not a phase)',
  template: '## `task.md` template (write this on Phase 0/1)',
  rules: '## Rules',
  outPhase: '## Output (after each phase)',
  outFinal: '## Output (final)',
  crStep2: '### Step 2 — Classify the diff and select reviewers',
  crStep4: '### Step 4 — Aggregate, dedupe, prioritize',
  crStep5: '### Step 5 — Final unified report',
};

function readFlow() {
  return fs.readFileSync(FLOW_PATH, 'utf8');
}

function readCodeReview() {
  return fs.readFileSync(CODE_REVIEW_PATH, 'utf8');
}

// Arquivo ausente vira asserção legível, não ENOENT: na BASE o playbook não
// existe, e a saída vermelha da PROVA DE RED tem de nomear o que falta.
function playbookPath(name) {
  return path.join(PLAYBOOK_DIR, name);
}

function readPlaybook(name) {
  const p = playbookPath(name);
  assert.ok(fs.existsSync(p), `playbook ausente: ${p}`);
  return fs.readFileSync(p, 'utf8');
}

// Um bloco `## ` / `### `: do heading até (sem incluir) o próximo. Fence-aware,
// como o da 003: o template do `task.md` é um bloco cercado cheio de `##` que
// são conteúdo, não estrutura.
function block(text, heading, where = 'texto sob teste') {
  const lines = text.split('\n');
  const start = lines.indexOf(heading);
  assert.notEqual(start, -1, `heading não encontrado em ${where}: ${heading}`);
  let end = lines.length;
  let fenced = false;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^```/.test(lines[i])) { fenced = !fenced; continue; }
    if (!fenced && /^#{2,3} /.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

function flowBlock(flow, heading) {
  return block(flow, heading, FLOW_PATH);
}

function crBlock(cr, heading) {
  return block(cr, heading, CODE_REVIEW_PATH);
}

// Uma seção `## N. …` DENTRO do template cercado do `task.md`: do heading até
// o próximo `## `. Aqui não há fence a pular — o recorte já é o miolo do fence.
function templateSection(flow, prefix) {
  const lines = flowBlock(flow, H.template).split('\n');
  const start = lines.findIndex((l) => l.startsWith(prefix));
  assert.notEqual(start, -1, `seção do template não encontrada: ${prefix}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i]) || /^```/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

// Linha única pelo prefixo. A unicidade é parte do predicado: prende a frase
// ao lugar certo, em vez de deixá-la casar em qualquer ponto.
function lineStartingWith(text, prefix) {
  const found = text.split('\n').filter((l) => l.startsWith(prefix));
  assert.equal(found.length, 1, `esperava 1 linha começando com ${JSON.stringify(prefix)}, achei ${found.length}`);
  return found[0];
}

function tableRow(text, re) {
  const rows = text.split('\n').filter((l) => l.startsWith('|') && re.test(l));
  assert.equal(rows.length, 1, `esperava 1 linha de tabela casando ${re}, achei ${rows.length}`);
  return rows[0];
}

// Parágrafo (separado por linha em branco) que contém o literal. A regra de
// "nenhuma válvula de escape no mesmo parágrafo" (AC-05) precisa desse recorte.
function paragraphWith(text, literal) {
  const found = text.split(/\n\s*\n/).filter((p) => p.includes(literal));
  assert.equal(found.length, 1, `esperava 1 parágrafo com ${JSON.stringify(literal)}, achei ${found.length}`);
  return found[0];
}

function has(text, literal, msg) {
  assert.ok(text.includes(literal), `${msg} — literal ausente: ${JSON.stringify(literal)}`);
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Vocabulário de válvula de escape da 003, usado por `test/flow-pretriagem.test.js`.
// Mora aqui para a 006 derivar dele em vez de copiar: uma cópia diverge em
// silêncio. O valor é o da 003, sem mudança.
const ESCAPE_HATCH_003 =
  /\bunless\b|\bmay\b|at the lead's discretion|at your discretion|\boptional(ly)?\b|\bignore\b|skip it|if you prefer|feel free/i;

// A 006 acrescenta os termos que o AC-05 dela nomeia ("except", "at the user's
// discretion", "a critério"). Mesmo raciocínio da 003: provar ausência de
// contradição em prosa é impossível, fechar o vocabulário barato não é.
const ESCAPE_HATCH = new RegExp(
  `${ESCAPE_HATCH_003.source}|\\bexcept\\b|at the user's discretion|\\ba crit[eé]rio\\b`,
  'i'
);

// Phase 4 da BASE (003): hash do bloco e exit gate, pinados contra origin/main
// quando a 003 foi escrita. Lidos por `flow-pretriagem` e `flow-prova-red`:
// um valor só, para os dois testes nunca pinarem Phase 4s diferentes.
const PHASE4_SHA256 = '3563b9ee5773a77d45bc3aaf9d7a2040d7304d31e864fbac1e0b605110c31e54';
const PHASE4_EXIT_GATE =
  '**Exit gate:** every AC has at least one automated test that **fails without the change**; the GOAL metric emits; security verdict is **APPROVE** or **APPROVE WITH MITIGATIONS** (mitigations recorded in `architecture.md`). **BLOCK** halts the flow until BUILD loops back.';
// O único acréscimo da 006 ao bloco (§5 D2), inteiro. O hash da BASE é
// calculado sem ESTA linha, nunca sem "qualquer linha com o prefixo": filtrar
// por prefixo deixaria uma linha de RED proof reescrita sumir do hash.
const RED_PROOF_LINE =
  '**RED proof (every lane):** for each AC, §8 records the ref without the change (a sha reachable from main), the exact command, and the excerpt of the red output that names the test. An AC without that record leaves this gate not green; "fails without the change" asserted without evidence does not count.';
// O acréscimo da 007 à lista "pick by stack" (007 §5 D2, mesma regra da 006
// D2), inteiro: sai do hash da BASE só esta linha, nunca "qualquer linha com o
// prefixo", para uma linha mobile reescrita pesar no hash.
const MOBILE_QA_LINE =
  '- Mobile (Flutter/React Native/native) → `mobile-qa-analyst`: the mobile route of the Phase 2 UX consult (`*.dart`, React Native or native UI), by stack only; the visible-UI condition does not apply. Mobile wins over Frontend / E2E only for a file both match (a React Native or mobile file), even when the test is E2E; a change that spans web and mobile dispatches `cypress-qa-analyst` and `mobile-qa-analyst`; mobile + Go dispatches both. A flow marked `NÃO EXECUTADO` is not RED proof.';

// Gatilho de UI: a MESMA lista em `flow.md` (Phase 2, consulta de UX) e em
// `code-review.md` (Step 2, lentes de UI). Duas listas à mão divergem.
const UI_WEB_GLOBS = ['`*.tsx`', '`*.jsx`', '`*.vue`', '`*.svelte`', '`*.html`', '`*.css`', '`*.scss`', '`*.less`'];
const UI_MOBILE_GLOBS = ['`*.dart`'];
const UI_OTHER_FILES = 'a theme/token/style file, an image or font asset, or displayed strings/copy';

// Idioma (AC-27): mesmos dois predicados da 003. O texto entre crases sai antes
// do teste, porque é ali que vivem os literais PT-BR que o usuário lê (campos
// do `task.md`, rótulos do relatório) citados dentro da instrução em inglês.
const PT_STOPWORDS = /\b(de|da|dos|das|para|com|que|uma|pelo|pela|sobre|entre|cada|quando|onde|não|são|ser|foi|pelos|pelas|seu|sua)\b/gi;
const PT_DIACRITICS = /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/g;

function withoutCodeSpans(text) {
  return text.replace(/`[^`\n]*`/g, '');
}

// Slash commands que já existem no hub (lista da 003). Token de comando fora
// desta lista num texto novo é sintaxe nova, que o AC-23 proíbe.
const KNOWN_SLASH_COMMANDS = new Set([
  '/flow', '/feature-flow', '/bug-flow', '/discovery', '/code-review', '/veredito',
  '/smart-commit', '/bootstrap-project', '/memory-query', '/autonomo', '/session-cost',
  '/cost', '/tech-debt', '/db-audit', '/api-contract', '/arch-design', '/jira-story',
  '/incident-response', '/onboard-dev', '/clear', '/compact',
]);

function inventedSlashCommands(text) {
  const candidates = [...text.matchAll(/(^|[^A-Za-z0-9._~/-])\/([A-Za-z][A-Za-z0-9-]*)/gm)].map((m) => `/${m[2]}`);
  return [...new Set(candidates)].filter((c) => !KNOWN_SLASH_COMMANDS.has(c.toLowerCase()));
}

module.exports = {
  FLOW_PATH, CODE_REVIEW_PATH, PLAYBOOK_DIR, H,
  readFlow, readCodeReview, readPlaybook, playbookPath,
  block, flowBlock, crBlock, templateSection,
  lineStartingWith, tableRow, paragraphWith, has, sha256,
  ESCAPE_HATCH, ESCAPE_HATCH_003, PHASE4_SHA256, PHASE4_EXIT_GATE, RED_PROOF_LINE, MOBILE_QA_LINE,
  UI_WEB_GLOBS, UI_MOBILE_GLOBS, UI_OTHER_FILES, PT_STOPWORDS, PT_DIACRITICS, withoutCodeSpans, inventedSlashCommands,
};
