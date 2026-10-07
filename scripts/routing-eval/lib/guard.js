'use strict';
// guard — leitura pura do stream-json do `claude -p`: a checagem do ambiente
// efetivo e a extração do roteamento. Separado de route.js para a CI testar
// com eventos sintéticos sem abrir processo.
//
// O argv (args.js) diz o que PEDIMOS; o evento system/init diz o que o
// processo RECEBEU. Se uma versão do CLI ignorar --setting-sources, ou um
// agent montado herdar ferramentas, é aqui que aparece: qualquer ferramenta
// além de Agent/Task, ou qualquer servidor MCP, aborta a chamada antes do
// primeiro tool_use (C10).

const ALLOWED_TOOLS = Object.freeze(['Agent', 'Task']);

function checkInit(event) {
  if (!event || event.type !== 'system' || event.subtype !== 'init') return { ok: false, reason: 'not a system/init event' };
  if (!Array.isArray(event.tools)) return { ok: false, reason: 'init carries no tools list' };
  const extra = event.tools.filter(t => !ALLOWED_TOOLS.includes(t));
  if (extra.length) return { ok: false, reason: `unexpected tools: ${extra.join(', ')}` };
  if (event.mcp_servers !== undefined && (!Array.isArray(event.mcp_servers) || event.mcp_servers.length)) {
    return { ok: false, reason: 'MCP servers present' };
  }
  return { ok: true, reason: null };
}

// O subagent escolhido, se o evento for o 1º Agent/Task tool_use; senão null.
function routeFrom(event) {
  if (!event || event.type !== 'assistant' || !event.message) return null;
  for (const c of event.message.content || []) {
    if (c && c.type === 'tool_use' && ALLOWED_TOOLS.includes(c.name)) return (c.input && c.input.subagent_type) || 'general-purpose';
  }
  return null;
}

// Custo só quando o stream o traz (evento result). Nunca estimado.
function costFrom(event) {
  return event && event.type === 'result' && typeof event.total_cost_usd === 'number' ? event.total_cost_usd : null;
}

module.exports = { checkInit, routeFrom, costFrom, ALLOWED_TOOLS };
