'use strict';
// args — o argv do `claude -p` de cada caso. Puro, e por isso testável na CI.
//
// O eval pede ao modelo que DELEGUE a tarefa, e o caso `aws-1` pede um deploy
// no ECS: se o processo filho tivesse ferramentas, ele poderia executar o
// pedido com as credenciais de quem roda o eval. O argv fecha isso:
//   --tools Agent            a única ferramenta disponível é delegar
//   --setting-sources ""     nenhum settings.json (hooks, allow rules, env)
//   --strict-mcp-config      nenhum servidor MCP além dos passados (nenhum)
//   --no-session-persistence a sessão não fica gravada em ~/.claude/projects
// E nunca: bypass de permissão, --mcp-config, --settings, --add-dir ou
// --allowedTools. O teste do argv trava as duas listas (C9).

const REQUIRED_FLAGS = Object.freeze(['--tools', '--setting-sources', '--strict-mcp-config', '--no-session-persistence']);
const FORBIDDEN_FLAGS = Object.freeze([
  '--mcp-config', '--settings', '--add-dir', '--allowedTools', '--allowed-tools',
  '--dangerously-skip-permissions', '--permission-mode',
]);

const WRAP = p => `Delegue esta tarefa ao subagent mais apropriado, sem executá-la você mesmo:\n\n${p}`;

function buildArgs({ prompt, model, agentsJson }) {
  if (typeof prompt !== 'string' || !prompt) throw new TypeError('prompt is required');
  if (typeof model !== 'string' || !model) throw new TypeError('model is required');
  if (typeof agentsJson !== 'string' || !agentsJson) throw new TypeError('agentsJson is required');
  return [
    '-p', WRAP(prompt),
    '--model', model,
    '--agents', agentsJson,
    '--tools', 'Agent',
    '--setting-sources', '',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--output-format', 'stream-json',
    '--verbose',
  ];
}

module.exports = { buildArgs, WRAP, REQUIRED_FLAGS, FORBIDDEN_FLAGS };
