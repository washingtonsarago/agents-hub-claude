'use strict';
// evalset — invariantes do evalset de roteamento. Puro: sem processo filho,
// sem rede, sem fs. É o que a CI roda (test/routing-eval.test.js) e o que o
// run.js checa antes de gastar uma chamada de modelo.
//
// A regra que importa para quem adiciona agent: todo agent em agents/ precisa
// de ao menos um caso `clear` e um `boundary` que o esperam. Sem isso, um
// agent novo entra no hub sem ninguém medir se ele colide com os existentes —
// e a colisão só aparece quando alguém nota o agent errado trabalhando.

const KINDS = Object.freeze(['clear', 'boundary', 'gap', 'overlap', 'nostack']);

// Quando nenhum especialista do hub cobre o pedido, o roteamento certo é cair
// no agent genérico do Claude Code. Não são arquivos de agents/.
const GAP_AGENTS = Object.freeze(['general-purpose', 'claude']);

// `NONE` é o que o route devolve quando o modelo responde sem delegar. Só é
// resposta certa num pedido sem stack (`nostack`): ali, perguntar a stack em
// vez de escolher um especialista no chute é comportamento aceitável (decisão
// do lead após o VERIFY da 004). Em qualquer outro kind, não delegar é erro de
// roteamento, e aceitar `NONE` no rótulo esconderia exatamente o que o eval
// mede — por isso é rejeitado na validação, não só desencorajado.
const NO_DELEGATION = 'NONE';
const NO_DELEGATION_KINDS = Object.freeze(['nostack']);

// Devolve a lista de erros (vazia = válido).
//   cases       array lido do evalset.json
//   agentNames  stems de agents/*.md
//   opts.requireCoverage  exige clear + boundary por agent. Desligável só
//                         para um evalset recortado passado por --cases.
function validateEvalset(cases, agentNames, { requireCoverage = true } = {}) {
  const errors = [];
  if (!Array.isArray(cases)) return ['evalset must be a JSON array'];
  const known = new Set([...agentNames, ...GAP_AGENTS]);
  const seen = new Set();
  cases.forEach((c, i) => {
    const where = c && typeof c.id === 'string' && c.id ? `case "${c.id}"` : `case #${i}`;
    if (!c || typeof c !== 'object') { errors.push(`${where}: must be an object`); return; }
    if (typeof c.id !== 'string' || !c.id) errors.push(`${where}: id must be a non-empty string`);
    else if (seen.has(c.id)) errors.push(`${where}: duplicate id`);
    else seen.add(c.id);
    if (!KINDS.includes(c.kind)) errors.push(`${where}: kind must be one of ${KINDS.join('|')} (got "${c.kind}")`);
    if (typeof c.prompt !== 'string' || !c.prompt.trim()) errors.push(`${where}: prompt must be a non-empty string`);
    if (!Array.isArray(c.expect) || !c.expect.length) errors.push(`${where}: expect must be a non-empty array`);
    else for (const e of c.expect) {
      if (e === NO_DELEGATION) {
        if (!NO_DELEGATION_KINDS.includes(c.kind)) errors.push(`${where}: expect "${NO_DELEGATION}" is only allowed in kind ${NO_DELEGATION_KINDS.join('|')} (got "${c.kind}")`);
      } else if (!known.has(e)) errors.push(`${where}: expect "${e}" is neither an agent in agents/ nor ${GAP_AGENTS.join('|')}`);
    }
  });
  if (requireCoverage) {
    for (const name of agentNames) {
      for (const kind of ['clear', 'boundary']) {
        const n = cases.filter(c => c && c.kind === kind && Array.isArray(c.expect) && c.expect.includes(name)).length;
        if (!n) errors.push(`agent "${name}": no "${kind}" case expects it — add one to scripts/routing-eval/evalset.json`);
      }
    }
  }
  return errors;
}

module.exports = { validateEvalset, KINDS, GAP_AGENTS, NO_DELEGATION, NO_DELEGATION_KINDS };
