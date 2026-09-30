'use strict';
// agents — monta o objeto do --agents a partir de agents/*.md, em memória, a
// cada execução. Nenhum snapshot fica versionado: o eval mede as descriptions
// da árvore em que roda, e um agents.json commitado mediria a de ontem.
//
// Cada agent sai com exatamente duas chaves: `description` (o que o roteador
// lê) e um `prompt` stub. Todo o resto do frontmatter é descartado — `tools`,
// `model`, `permissionMode`, `mcpServers`, `hooks` —, porque passá-lo adiante
// daria ao agent montado capacidade de agir na máquina de quem roda (C11). O
// corpo também fica de fora: o eval mede escolha, não execução.

const fs = require('fs');
const path = require('path');

const PROMPT_STUB = '(corpo omitido no eval de roteamento)';

function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const fm = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const k = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (k) { key = k[1]; fm[key] = k[2]; } else if (key) fm[key] += '\n' + line;
  }
  return fm;
}

function decodeDescription(raw) {
  const d = String(raw || '').trim();
  return d.startsWith('"') ? JSON.parse(d) : d;
}

function buildAgents(agentsDir) {
  const out = {};
  for (const f of fs.readdirSync(agentsDir).filter(x => x.endsWith('.md')).sort()) {
    const fm = parseFrontmatter(fs.readFileSync(path.join(agentsDir, f), 'utf8'));
    if (!fm || !fm.name || !fm.description) throw new Error(`agents/${f}: frontmatter without name or description`);
    out[fm.name] = { description: decodeDescription(fm.description), prompt: PROMPT_STUB };
  }
  return out;
}

module.exports = { buildAgents, parseFrontmatter, PROMPT_STUB };
