#!/usr/bin/env node
// setup-dev-settings — ajustes do ~/.claude/settings.json do dev para o hub.
//
// Mac, Windows e Linux: Node puro, zero deps (o mesmo runtime do `ahc`).
//
// O que aplica:
//   1. permissions.allow com os scripts do hub que o /flow-lite chama dezenas
//      de vezes por run (gate, ledger, medição de tokens). Cada regra libera SÓ
//      aquele script, com qualquer argumento; `node` em geral continua pedindo.
//   2. `"async": true` nos hooks do iTerm2 (`cc-status`), se existirem (só Mac).
//      Cada chamada leva ~300 ms e, síncrona, roda antes E depois de cada
//      ferramenta. Assíncrona, o status da aba atualiza igual, sem travar o
//      Claude.
//
// Uso:
//   node setup-dev-settings.js              # mostra o plano, não escreve nada
//   node setup-dev-settings.js --apply      # aplica (com backup e validação)
//   node setup-dev-settings.js --undo       # volta ao backup feito pelo --apply
//   node setup-dev-settings.js --settings <arquivo>   # outro settings (teste, WSL)
//   --json                                  # saída em JSON
//
// Exit: 0 ok (inclusive "nada a fazer") · 1 erro · 2 settings ilegível (não mexe).

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const HUB_PERMISSIONS = [
  'Bash(node ~/.claude/skills/change-reviewer/scripts/gate.js:*)',
  'Bash(node ~/.claude/skills/flow-lite/scripts/flow-lite.js:*)',
  'Bash(node ~/.claude/skills/session-cost/scripts/otel-cost.js:*)',
  'Bash(bash ~/.claude/skills/session-cost/scripts/otlp-telemetry.sh check:*)',
];
const BACKUP_SUFFIX = '.bak-dev-settings';

function parseArgs(argv) {
  const a = { apply: false, undo: false, json: false, settings: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') a.apply = true;
    else if (argv[i] === '--undo') a.undo = true;
    else if (argv[i] === '--json') a.json = true;
    else if (argv[i] === '--settings') a.settings = argv[++i];
    else if (argv[i] === '-h' || argv[i] === '--help') { a.help = true; }
    else { a.bad = argv[i]; }
  }
  return a;
}

const isItermStatus = cmd => typeof cmd === 'string' && /(^|[\\/])cc-status$/.test(cmd.trim());

// Calcula o que mudaria, sem efeito colateral.
function plan(settings) {
  const allow = (settings.permissions && settings.permissions.allow) || [];
  const permissions = HUB_PERMISSIONS.filter(p => !allow.includes(p));
  const hooks = [];
  for (const [event, groups] of Object.entries(settings.hooks || {})) {
    (groups || []).forEach((g, gi) => (g.hooks || []).forEach((h, hi) => {
      if (h.type === 'command' && isItermStatus(h.command) && h.async !== true) hooks.push({ event, gi, hi });
    }));
  }
  return { permissions, hooks };
}

function applyPlan(settings, p) {
  if (p.permissions.length) {
    settings.permissions = settings.permissions || {};
    settings.permissions.allow = settings.permissions.allow || [];
    settings.permissions.allow.push(...p.permissions);
  }
  for (const { event, gi, hi } of p.hooks) settings.hooks[event][gi].hooks[hi].async = true;
  return settings;
}

function writeAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  JSON.parse(fs.readFileSync(tmp, 'utf8'));
  fs.renameSync(tmp, file);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.bad) {
    const src = fs.readFileSync(__filename, 'utf8').split('\n');
    console.log(src.slice(1, 22).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
    return args.bad ? 1 : 0;
  }
  const file = args.settings || path.join(os.homedir(), '.claude', 'settings.json');
  const backup = file + BACKUP_SUFFIX;
  const out = msg => { if (!args.json) console.log(msg); };

  if (args.undo) {
    if (!fs.existsSync(backup)) { console.error(`sem backup em ${backup}: nada a desfazer`); return 1; }
    fs.copyFileSync(backup, file);
    fs.unlinkSync(backup);
    if (args.json) console.log(JSON.stringify({ undone: true, settings: file }));
    else out(`✔ restaurado de ${backup}`);
    return 0;
  }

  let settings = {};
  if (fs.existsSync(file)) {
    try {
      settings = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('não é um objeto JSON');
    } catch (e) {
      console.error(`settings ilegível (${file}): ${e.message} — não mexi em nada`);
      return 2;
    }
  }

  const p = plan(settings);
  const nothing = !p.permissions.length && !p.hooks.length;
  if (args.json) {
    console.log(JSON.stringify({ settings: file, applied: args.apply && !nothing, permissions: p.permissions,
      asyncHooks: p.hooks.map(h => h.event) }));
  } else {
    out(`settings: ${file}`);
    if (nothing) out('✔ nada a fazer: já está ajustado');
    p.permissions.forEach(x => out(`  + permissão ${x}`));
    p.hooks.forEach(h => out(`  ~ hook ${h.event}: cc-status passa a async`));
  }
  if (nothing || !args.apply) {
    if (!nothing && !args.json) out('\n(nada foi escrito; rode com --apply para aplicar)');
    return 0;
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Só o primeiro --apply guarda o original: o --undo volta ao estado de antes do script.
  if (fs.existsSync(file) && !fs.existsSync(backup)) fs.copyFileSync(file, backup);
  writeAtomic(file, applyPlan(settings, p));
  out(`\n✔ aplicado. Backup: ${fs.existsSync(backup) ? backup : '(não havia settings)'}`);
  out('  Vale para sessões novas do Claude Code. Para desfazer: --undo');
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { plan, applyPlan, HUB_PERMISSIONS, isItermStatus };
