#!/usr/bin/env node
// otel-setup — detecta (e opcionalmente liga) a telemetria OpenTelemetry do
// Claude Code, que é o que permite medir custo INCLUINDO subagents.
//
// Por que é um script e não instrução em prosa no command: escrever no
// settings.json do usuário é ação com efeito colateral fora do escopo da
// tarefa. Fazendo aqui, a operação é determinística, idempotente, faz backup,
// valida o JSON antes e depois, e mexe em exatamente três chaves. Um command
// pedindo pro modelo "editar o settings" faz nenhuma dessas coisas.
//
// DOIS DESTINOS, e eles não competem:
//
//   prometheus  → http://localhost:9464/metrics. Local, pull, NÃO sai da
//                 máquina. É o que o otel-cost.js lê para medir ESTA sessão.
//   otlp        → push para um collector remoto. É o que permite agregação da
//                 organização (adoção, custo por time, por skill, por MCP).
//
// O exporter aceita lista separada por vírgula (`otlp,prometheus`), então
// ligar o remoto NÃO custa a medição local. Preferir sempre os dois.
//
// ⚠️  Apontar o otlp para um collector remoto faz `user_email`,
//     `user_account_id` e `organization_id` saírem da máquina do dev. Isso é
//     decisão de POLÍTICA, não técnica — ver SKILL.md, seção "Sobre os labels".
//     O script exige --otlp explícito; nunca liga destino remoto sozinho.
//
// Uso:
//   node scripts/otel-setup.js --check                  # diagnóstico; não escreve
//   node scripts/otel-setup.js --check --json
//   node scripts/otel-setup.js --enable                 # local (prometheus)
//   node scripts/otel-setup.js --enable --otlp https://collector.exemplo/v1/metrics
//   node scripts/otel-setup.js --enable --otlp <url> --headers "Authorization=Bearer x"
//   node scripts/otel-setup.js --enable --otlp <url> --no-local   # só remoto
//   node scripts/otel-setup.js --enable --file /tmp/settings.json # teste
//
// Exit codes de --check:
//   0  fonte local disponível agora (endpoint prometheus responde)
//   1  configurado, endpoint local mudo            → falta reiniciar
//   2  não configurado
//   3  settings.json ilegível/inválido             → não mexer, avisar humano
//   4  telemetria ativa, mas SÓ remota (otlp)      → sem medição local de sessão
//
// Zero deps.

const fs = require('fs');
const os = require('os');
const path = require('path');

const WANTED = {
  CLAUDE_CODE_ENABLE_TELEMETRY: '1',
  OTEL_METRICS_EXPORTER: 'prometheus',
  OTEL_METRIC_EXPORT_INTERVAL: '10000',
};
const ENDPOINT = process.env.OTEL_PROM_ENDPOINT || 'http://localhost:9464/metrics';

function parseArgs(argv) {
  const a = {
    check: false, enable: false, json: false, file: null,
    otlp: null, headers: null, noLocal: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') a.check = true;
    else if (argv[i] === '--enable') a.enable = true;
    else if (argv[i] === '--json') a.json = true;
    else if (argv[i] === '--file') a.file = argv[++i];
    else if (argv[i] === '--otlp') a.otlp = argv[++i];
    else if (argv[i] === '--headers') a.headers = argv[++i];
    else if (argv[i] === '--no-local') a.noLocal = true;
  }
  if (!a.check && !a.enable) a.check = true;
  return a;
}

const settingsPath = override => override || path.join(os.homedir(), '.claude', 'settings.json');

function readSettings(file) {
  if (!fs.existsSync(file)) return { ok: true, missing: true, data: {} };
  const raw = fs.readFileSync(file, 'utf8');
  try {
    const data = JSON.parse(raw);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, error: 'settings.json não é um objeto JSON' };
    }
    return { ok: true, missing: false, data, raw };
  } catch (e) {
    return { ok: false, error: `settings.json não é JSON válido: ${e.message}` };
  }
}

// "otlp,prometheus" → ['otlp','prometheus']. Vazio/none → [].
function parseExporters(v) {
  if (!v) return [];
  return String(v).split(',').map(s => s.trim()).filter(s => s && s !== 'none');
}

function configured(data) {
  const env = data.env || {};
  const missing = Object.keys(WANTED).filter(k => {
    // O intervalo de export é conveniência, não requisito: sua ausência não
    // torna a telemetria inoperante, então não conta como "não configurado".
    if (k === 'OTEL_METRIC_EXPORT_INTERVAL') return false;
    // Qualquer exporter serve para "está configurado"; QUAL exporter é uma
    // pergunta separada, respondida por parseExporters. Exigir exatamente
    // 'prometheus' faria uma config remota válida parecer quebrada.
    if (k === 'OTEL_METRICS_EXPORTER') return parseExporters(env[k]).length === 0;
    return env[k] !== WANTED[k];
  });
  return { done: missing.length === 0, missing };
}

// Precedência por CHAVE entre o ambiente do processo e o settings.json.
//
// Duas fontes existem e nenhuma é completa sozinha:
//
//   - O settings.json do usuário: visível, mas NÃO contém a política da
//     organização (server-managed settings vivem no servidor, e um
//     managed-settings.json via MDM fica fora do HOME).
//   - O ambiente deste processo: enxerga a política, mas só as chaves que o
//     Claude Code repassa ao subprocesso. Medido em campo (2026-08-25):
//     CLAUDE_CODE_ENABLE_TELEMETRY chega; OTEL_METRICS_EXPORTER não — ele é
//     aplicado dentro do processo do CLI e não é herdado aqui.
//
// Escolher uma fonte inteira erra nos dois sentidos: só o arquivo não vê
// política; só o ambiente não vê o exporter. Merge por chave, ambiente
// primeiro — o mesmo modelo que o Claude Code usa para o bloco `env` de
// managed settings.
const DETECT_KEYS = [
  'CLAUDE_CODE_ENABLE_TELEMETRY',
  'OTEL_METRICS_EXPORTER',
  'OTEL_EXPORTER_OTLP_METRICS_ENDPOINT',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
];

function effectiveEnv(fileEnv) {
  const env = {}, from = {};
  for (const k of DETECT_KEYS) {
    const fromProc = process.env[k];
    if (fromProc != null && fromProc !== '') { env[k] = fromProc; from[k] = 'ambiente'; }
    else if (fileEnv && fileEnv[k] != null && fileEnv[k] !== '') { env[k] = fileEnv[k]; from[k] = 'settings.json'; }
  }
  return { env, from };
}

async function endpointLive() {
  try {
    const r = await fetch(ENDPOINT, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch { return false; }
}

// Monta o env desejado. Preserva o que já existe: ligar o remoto não derruba o
// prometheus local, e vice-versa — os dois exporters convivem na mesma lista.
function desiredEnv(currentEnv, args) {
  const env = { ...currentEnv };
  env.CLAUDE_CODE_ENABLE_TELEMETRY = '1';
  if (!env.OTEL_METRIC_EXPORT_INTERVAL) {
    env.OTEL_METRIC_EXPORT_INTERVAL = WANTED.OTEL_METRIC_EXPORT_INTERVAL;
  }

  const have = new Set(parseExporters(env.OTEL_METRICS_EXPORTER));
  if (args.otlp) {
    have.add('otlp');
    if (args.noLocal) have.delete('prometheus');
    else have.add('prometheus');
    env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT = args.otlp;
    env.OTEL_EXPORTER_OTLP_PROTOCOL = env.OTEL_EXPORTER_OTLP_PROTOCOL || 'http/protobuf';
    if (args.headers) env.OTEL_EXPORTER_OTLP_HEADERS = args.headers;
  } else {
    have.add('prometheus');
  }
  // Ordem estável: destino remoto primeiro, para o diff do settings não
  // oscilar entre runs.
  env.OTEL_METRICS_EXPORTER = ['otlp', 'prometheus'].filter(e => have.has(e)).join(',');
  return env;
}

function enable(file, args = {}) {
  const s = readSettings(file);
  if (!s.ok) return { ok: false, error: s.error };

  const currentEnv = s.data.env || {};
  const next = { ...s.data, env: desiredEnv(currentEnv, args) };

  // Nada a fazer se o env resultante for idêntico ao atual.
  const changedKeys = Object.keys(next.env).filter(k => currentEnv[k] !== next.env[k]);
  if (changedKeys.length === 0) return { ok: true, changed: false, note: 'já estava configurado' };

  const text = JSON.stringify(next, null, 2) + '\n';
  // Falha antes de tocar o disco se o resultado não reparsear.
  try { JSON.parse(text); } catch (e) { return { ok: false, error: `resultado inválido: ${e.message}` }; }

  let backup = null;
  if (!s.missing) {
    backup = `${file}.bak-${Date.now()}`;
    fs.copyFileSync(file, backup);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, file); // troca atômica: nunca deixa settings.json truncado

  return { ok: true, changed: true, backup, added: changedKeys, exporters: next.env.OTEL_METRICS_EXPORTER };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = settingsPath(args.file);

  if (args.enable) {
    if (args.headers && !args.otlp) {
      console.error('[otel-setup] --headers só faz sentido com --otlp.');
      process.exit(3);
    }
    if (args.noLocal && !args.otlp) {
      console.error('[otel-setup] --no-local removeria o único destino. Use com --otlp.');
      process.exit(3);
    }
    const r = enable(file, args);
    if (!r.ok) { console.error('[otel-setup] ' + r.error); process.exit(3); }
    if (!r.changed) { console.log('[otel-setup] telemetria já configurada — nada a fazer.'); return; }
    console.log('[otel-setup] telemetria ligada em ' + file);
    console.log('             exporters: ' + r.exporters);
    if (r.backup) console.log('             backup: ' + r.backup);
    if (args.otlp) {
      console.log('');
      console.log('  ⚠️  Destino REMOTO configurado: ' + args.otlp);
      console.log('      user_email, user_account_id e organization_id passam a sair');
      console.log('      desta máquina. Confirme que isso está acordado com o time.');
    }
    console.log('');
    console.log('  ⚠️  Só vale no próximo start — env vars são lidas na inicialização.');
    if (!args.noLocal) console.log('      Reinicie o Claude Code para o endpoint subir em ' + ENDPOINT);
    return;
  }

  // --check
  const s = readSettings(file);
  const fileEnv = (s.ok && s.data.env) || {};
  const { env: eff, from } = effectiveEnv(fileEnv);

  // Só é erro fatal se o arquivo está quebrado E o ambiente não salva a detecção.
  if (!s.ok && !eff.CLAUDE_CODE_ENABLE_TELEMETRY) {
    if (args.json) console.log(JSON.stringify({ status: 'invalid', error: s.error }, null, 2));
    else console.error('[otel-setup] ' + s.error + '\n  Não vou escrever num arquivo que não consigo ler. Corrija à mão.');
    process.exit(3);
  }

  const on = eff.CLAUDE_CODE_ENABLE_TELEMETRY === '1';
  const exporters = parseExporters(eff.OTEL_METRICS_EXPORTER);
  const otlpEndpoint = eff.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || eff.OTEL_EXPORTER_OTLP_ENDPOINT || null;
  const hasLocal = exporters.includes('prometheus');
  const live = on && hasLocal ? await endpointLive() : false;

  let status;
  if (!on) status = 'not-configured';
  else if (live) status = 'live';
  else if (!hasLocal) status = 'remote-only';
  else status = 'needs-restart';

  // Se a política ligou a telemetria mas o exporter não aparece em lugar nenhum,
  // dizer "não configurado" seria mentira — o CLI está exportando para algum
  // lugar que este processo não enxerga.
  const opaque = on && exporters.length === 0;
  const sources = [...new Set(Object.values(from))].join(' + ') || 'nenhuma';

  if (args.json) {
    console.log(JSON.stringify({
      status, opaque, sources, settings: file, endpoint: ENDPOINT,
      exporters, otlp_endpoint: otlpEndpoint,
      resolved_from: from,
    }, null, 2));
  } else if (status === 'live') {
    console.log('[otel-setup] ✓ telemetria ativa — ' + ENDPOINT + ' respondendo.');
    console.log('             config resolvida de: ' + sources);
    console.log('             custo com subagent disponível via otel-cost.js');
    if (otlpEndpoint) console.log('             também exportando para: ' + otlpEndpoint);
  } else if (status === 'remote-only' && opaque) {
    console.log('[otel-setup] telemetria LIGADA, mas não sei para onde ela vai.');
    console.log('             CLAUDE_CODE_ENABLE_TELEMETRY=1 veio de: ' + (from.CLAUDE_CODE_ENABLE_TELEMETRY || '?'));
    console.log('             Nenhum OTEL_METRICS_EXPORTER visível no ambiente nem no settings.');
    console.log('');
    console.log('             Provável política da organização (server-managed settings):');
    console.log('             o CLI aplica o exporter internamente e não o repassa a');
    console.log('             subprocessos. Rode `claude` e use /status para ver a origem.');
    console.log('');
    console.log('             Para medição local desta sessão, adicione o exporter prometheus:');
    console.log('               node scripts/otel-setup.js --enable');
  } else if (status === 'remote-only') {
    console.log('[otel-setup] telemetria ativa, mas SÓ com destino remoto (otlp).');
    console.log('             config resolvida de: ' + sources);
    if (otlpEndpoint) console.log('             destino: ' + otlpEndpoint);
    console.log('');
    console.log('             Sem exporter prometheus local o otel-cost.js não tem o que ler.');
    console.log('             Use session-cost.js (transcript) — lembrando que ele NÃO');
    console.log('             enxerga consumo de subagent — ou adicione o exporter local:');
    console.log('               node scripts/otel-setup.js --enable   (os dois convivem)');
  } else if (status === 'needs-restart') {
    console.log('[otel-setup] telemetria configurada, endpoint local mudo.');
    console.log('             config resolvida de: ' + sources);
    console.log('             Reinicie o Claude Code para ativar.');
  } else {
    console.log('[otel-setup] telemetria não configurada.');
    console.log('             Sem ela, o custo medido cobre só o orquestrador —');
    console.log('             o consumo dos subagents fica de fora.');
    console.log('');
    console.log('             Para ligar:  node scripts/otel-setup.js --enable');
  }

  process.exit(
    status === 'live' ? 0 :
    status === 'needs-restart' ? 1 :
    status === 'not-configured' ? 2 : 4
  );
}

if (require.main === module) {
  main().catch(e => { console.error('[otel-setup] ' + e.message); process.exit(3); });
}

module.exports = { configured, enable, readSettings, parseExporters, desiredEnv, effectiveEnv, DETECT_KEYS, WANTED };
