// Testes do `skills/session-cost/scripts/otlp-telemetry.sh` (destinos devanalyze e datadog).
//
// Rede e Keychain ficam de fora. O `managed-block` roda o script inteiro, que
// é offline; o merge do settings e o helper são extraídos do script e rodados
// contra arquivos temporários.
//
//   - o bloco das managed settings não carrega credencial e força as flags de
//     conteúdo em "0";
//   - o devanalyze segue o contrato da demanda 005: http/json, eventos em
//     /ingest/logs, delta explícito, sem atributos de recurso; --no-logs desliga
//     os eventos sem deixar o exporter cair em localhost:4318;
//   - install preserva o prometheus, desliga flag de conteúdo ligada e avisa,
//     é idempotente, e o uninstall devolve o settings original;
//   - outro destino OTLP faz o install abortar sem escrever; --force troca, e o
//     uninstall volta ao estado de antes do PRIMEIRO install;
//   - --token-only não mexe em endpoint (eles vêm das managed settings);
//   - o helper devolve JSON válido nos dois destinos.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'skills', 'session-cost', 'scripts', 'otlp-telemetry.sh');
const SRC = fs.readFileSync(SCRIPT, 'utf8');
const [, PROFILE_PY, MERGE_PY] = SRC.split("<<'PY'\n").map(s => s.split('\nPY\n')[0]);
const CONTENT = ['OTEL_LOG_USER_PROMPTS', 'OTEL_LOG_ASSISTANT_RESPONSES', 'OTEL_LOG_TOOL_DETAILS',
  'OTEL_LOG_TOOL_CONTENT', 'OTEL_LOG_RAW_API_BODIES', 'OTEL_LOG_MANAGED_SETTINGS'];

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'otlp-telemetry-')); }

function managedBlock(...args) {
  const r = spawnSync('bash', [SCRIPT, 'managed-block', ...args], { encoding: 'utf8', env: { ...process.env, HOME: tmpdir() } });
  assert.strictEqual(r.status, 0, r.stderr);
  return JSON.parse(r.stdout).env;
}

function profile(dest, { logs = '', attrs = '' } = {}) {
  const metrics = dest === 'datadog' ? 'https://otlp.us3.datadoghq.com/v1/metrics' : 'https://devanalyze.io/api/v1/ai-usage/claude-code/ingest';
  const proto = dest === 'datadog' ? 'http/protobuf' : 'http/json';
  const r = spawnSync('python3', ['-', dest, metrics, logs, proto, attrs, `/h/otel-headers-${dest}.sh`], { input: PROFILE_PY, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout.trim();
}

function merge(mode, t, prof = '{}', { force = '0', tokenOnly = '0' } = {}) {
  return spawnSync('python3', ['-'], {
    input: MERGE_PY, encoding: 'utf8',
    env: { ...process.env, MODE: mode, SETTINGS_PATH: t.settings, STATE_PATH: t.state, PROFILE: prof, FORCE: force, TOKEN_ONLY: tokenOnly },
  });
}

function files() {
  const d = tmpdir();
  return { settings: path.join(d, 'settings.json'), state: path.join(d, 'state.json') };
}
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));

const ORIGINAL = {
  model: 'opus',
  env: { CLAUDE_CODE_ENABLE_TELEMETRY: '1', OTEL_METRICS_EXPORTER: 'prometheus', OTEL_METRIC_EXPORT_INTERVAL: '10000' },
};

function managedBlockRaw(...args) {
  return spawnSync('bash', [SCRIPT, 'managed-block', ...args], { encoding: 'utf8', env: { ...process.env, HOME: tmpdir() } });
}

test('managed-block devanalyze segue o contrato da 005, sem credencial e com conteúdo em 0', () => {
  const env = managedBlock('devanalyze');
  assert.strictEqual(env.OTEL_EXPORTER_OTLP_PROTOCOL, 'http/json');
  assert.strictEqual(env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT, 'https://devanalyze.io/api/v1/ai-usage/claude-code/ingest');
  assert.strictEqual(env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT, 'https://devanalyze.io/api/v1/ai-usage/claude-code/ingest/logs');
  assert.strictEqual(env.OTEL_LOGS_EXPORTER, 'otlp');
  assert.strictEqual(env.OTEL_METRICS_EXPORTER, 'otlp,prometheus');
  assert.strictEqual(env.OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE, 'delta');
  assert.strictEqual(env.OTEL_METRICS_INCLUDE_ACCOUNT_UUID, 'true');
  assert.strictEqual(env.OTEL_LOGS_EXPORT_INTERVAL, '30000', 'cota de 4000 POSTs/min de logs por org');
  assert.ok(!('OTEL_EXPORTER_OTLP_ENDPOINT' in env), 'o SDK acrescentaria /v1/* ao endpoint genérico');
  assert.ok(!('OTEL_RESOURCE_ATTRIBUTES' in env));
  for (const k of CONTENT) assert.strictEqual(env[k], '0', k);
  assert.ok(!JSON.stringify(env).match(/HEADERS|Bearer/), 'credencial não entra no bloco');
});

test('devanalyze ignora --team com aviso; --no-logs desliga eventos; datadog mantém --team', () => {
  const r = managedBlockRaw('devanalyze', '--team', 'mobile');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stderr, /ignora --team/);
  assert.ok(!('OTEL_RESOURCE_ATTRIBUTES' in JSON.parse(r.stdout).env));

  const nl = managedBlock('devanalyze', '--no-logs');
  assert.ok(!('OTEL_LOGS_EXPORTER' in nl) && !('OTEL_EXPORTER_OTLP_LOGS_ENDPOINT' in nl) && !('OTEL_LOGS_EXPORT_INTERVAL' in nl));

  const dd = managedBlock('datadog', '--site', 'us3.datadoghq.com', '--team', 'mobile');
  assert.strictEqual(dd.OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE, 'delta');
  assert.strictEqual(dd.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT, 'https://otlp.us3.datadoghq.com/v1/logs');
  assert.strictEqual(dd.OTEL_RESOURCE_ATTRIBUTES, 'team.id=mobile');
});

test('install desliga conteúdo ligado e avisa, preserva o resto, é idempotente e o uninstall restaura', () => {
  const t = files();
  const orig = { ...ORIGINAL, env: { ...ORIGINAL.env, OTEL_LOG_USER_PROMPTS: '1' } };
  fs.writeFileSync(t.settings, JSON.stringify(orig));
  const prof = profile('devanalyze');
  const r = merge('install', t, prof);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /OTEL_LOG_USER_PROMPTS estava ligado/);
  const s = read(t.settings);
  assert.strictEqual(s.model, 'opus');
  assert.strictEqual(s.env.OTEL_METRICS_EXPORTER, 'otlp,prometheus');
  assert.strictEqual(s.env.OTEL_METRIC_EXPORT_INTERVAL, '10000');
  assert.strictEqual(s.otelHeadersHelper, '/h/otel-headers-devanalyze.sh');
  for (const k of CONTENT) assert.strictEqual(s.env[k], '0', k);

  const first = fs.readFileSync(t.settings, 'utf8');
  assert.strictEqual(merge('install', t, prof).status, 0);
  assert.strictEqual(fs.readFileSync(t.settings, 'utf8'), first);
  assert.strictEqual(merge('uninstall', t).status, 0);
  assert.deepStrictEqual(read(t.settings), orig);
});

test('outro destino aborta sem escrever; --force troca; uninstall volta ao original', () => {
  const t = files();
  fs.writeFileSync(t.settings, JSON.stringify(ORIGINAL));
  assert.strictEqual(merge('install', t, profile('datadog')).status, 0);
  const afterDatadog = fs.readFileSync(t.settings, 'utf8');

  const r = merge('install', t, profile('devanalyze'));
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /outro destino OTLP/);
  assert.strictEqual(fs.readFileSync(t.settings, 'utf8'), afterDatadog);

  assert.strictEqual(merge('install', t, profile('devanalyze'), { force: '1' }).status, 0);
  const s = read(t.settings);
  assert.strictEqual(s.env.OTEL_EXPORTER_OTLP_PROTOCOL, 'http/json');
  assert.ok(!('OTEL_EXPORTER_OTLP_LOGS_ENDPOINT' in s.env), 'endpoint de logs do Datadog não pode sobrar');
  assert.strictEqual(merge('uninstall', t).status, 0);
  assert.deepStrictEqual(read(t.settings), ORIGINAL);
});

test('header de outro destino não aparece na mensagem de conflito', () => {
  const t = files();
  const other = { env: { OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector.exemplo', OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Bearer segredo' } };
  fs.writeFileSync(t.settings, JSON.stringify(other));
  const r = merge('install', t, profile('devanalyze'));
  assert.notStrictEqual(r.status, 0);
  assert.ok(!r.stderr.includes('segredo'));
  assert.deepStrictEqual(read(t.settings), other);
});

test('--token-only só põe o helper e as flags de conteúdo, sem endpoints', () => {
  const t = files();
  fs.writeFileSync(t.settings, JSON.stringify(ORIGINAL));
  assert.strictEqual(merge('install', t, profile('devanalyze'), { tokenOnly: '1' }).status, 0);
  const s = read(t.settings);
  assert.strictEqual(s.otelHeadersHelper, '/h/otel-headers-devanalyze.sh');
  assert.strictEqual(s.env.OTEL_METRICS_EXPORTER, 'prometheus');
  assert.ok(!Object.keys(s.env).some(k => k.startsWith('OTEL_EXPORTER_OTLP')));
  for (const k of CONTENT) assert.strictEqual(s.env[k], '0', k);
  assert.strictEqual(merge('uninstall', t).status, 0);
  assert.deepStrictEqual(read(t.settings), ORIGINAL);
});

test('--base-url aceita http só em localhost (DevAnalyze local)', () => {
  const ok = managedBlock('devanalyze', '--base-url', 'http://127.0.0.1:8000');
  assert.strictEqual(ok.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT, 'http://127.0.0.1:8000/api/v1/ai-usage/claude-code/ingest/logs');
  for (const url of ['http://devanalyze.io', 'http://127.0.0.1.evil.com']) {
    const r = managedBlockRaw('devanalyze', '--base-url', url);
    assert.notStrictEqual(r.status, 0, url);
    assert.match(r.stderr, /precisa ser https/);
  }
});

test('install recusa token do DevAnalyze fora de 32–256 ASCII imprimíveis antes de tocar rede ou settings', () => {
  for (const tok of ['curto123', 'a'.repeat(257), 'com espaço'.padEnd(40, 'x')]) {
    const home = tmpdir();
    const settings = path.join(home, 'settings.json');
    const r = spawnSync('bash', [SCRIPT, 'install', 'devanalyze', '--settings', settings],
      { encoding: 'utf8', input: '', env: { ...process.env, HOME: home, OTLP_TOKEN: tok } });
    assert.notStrictEqual(r.status, 0, tok);
    assert.match(r.stderr, /32–256 caracteres/);
    assert.ok(!fs.existsSync(settings));
  }
});

test('managed-block --embed-token põe o Bearer no bloco e recusa rodar dentro do Claude Code', () => {
  // OTLP_TOKEN sempre definido: sem ele o script leria o Keychain real da máquina.
  const tok = 'A'.repeat(20) + '_-' + 'b'.repeat(21);
  const env = { ...process.env, HOME: tmpdir(), OTLP_TOKEN: tok };
  delete env.CLAUDECODE;
  const r = spawnSync('bash', [SCRIPT, 'managed-block', 'devanalyze', '--embed-token'], { encoding: 'utf8', env });
  assert.strictEqual(r.status, 0, r.stderr);
  const e = JSON.parse(r.stdout).env;
  // Espaço literal, como no exemplo oficial; validado com o Claude Code 2.1.292 contra receptor local.
  assert.strictEqual(e.OTEL_EXPORTER_OTLP_HEADERS, `Authorization=Bearer ${tok}`);
  assert.strictEqual(e.OTEL_LOG_USER_PROMPTS, '0');

  const dd = spawnSync('bash', [SCRIPT, 'managed-block', 'datadog', '--embed-token'],
    { encoding: 'utf8', env: { ...env, OTLP_TOKEN: '0123456789abcdef0123456789abcdef' } });
  assert.strictEqual(JSON.parse(dd.stdout).env.OTEL_EXPORTER_OTLP_HEADERS, 'dd-api-key=0123456789abcdef0123456789abcdef');

  const inside = spawnSync('bash', [SCRIPT, 'managed-block', 'devanalyze', '--embed-token'],
    { encoding: 'utf8', env: { ...env, CLAUDECODE: '1' } });
  assert.notStrictEqual(inside.status, 0);
  assert.strictEqual(inside.stdout, '', 'o token não pode sair no transcript');
  assert.match(inside.stderr, /não roda dentro do Claude Code/);

  const bad = spawnSync('bash', [SCRIPT, 'managed-block', 'devanalyze', '--embed-token'], { encoding: 'utf8', env: { ...env, OTLP_TOKEN: 'curto' } });
  assert.notStrictEqual(bad.status, 0);
  assert.strictEqual(bad.stdout, '');
});

test('formato do token: aceita os válidos e recusa os inválidos (inclusive no regex do macOS)', () => {
  // O caso positivo faltava: {32,256} estoura o limite de 255 do regex BSD e
  // recusava QUALQUER token no macOS, e só os casos negativos eram testados.
  const fn = SRC.match(/^key_check_format\(\) \{[\s\S]*?^\}/m)[0];
  const check = (dest, tok) => spawnSync('bash', ['-c', `die(){ exit 1; }; DEST=${dest}; ${fn}\nkey_check_format "$1"`, '_', tok]).status === 0;
  for (const tok of ['A'.repeat(43), 'a"b\\c%s$d-' + '0'.repeat(30), 'x'.repeat(32), 'x'.repeat(256)]) assert.ok(check('devanalyze', tok), tok);
  for (const tok of ['x'.repeat(31), 'x'.repeat(257), 'com espaço' + 'x'.repeat(30), 'açaí' + 'x'.repeat(30)]) assert.ok(!check('devanalyze', tok), tok);
  assert.ok(check('datadog', '0123456789abcdef0123456789abcdef'));
  assert.ok(!check('datadog', '0123456789abcdef0123456789abcde'));
  assert.ok(!check('datadog', '79aba79c-0000-0000-0000-000000000000'));
});

test('o helper devolve JSON válido nos dois destinos', () => {
  const fn = SRC.match(/^install_helper\(\) \{[\s\S]*?^\}/m)[0];
  for (const [dest, check, token] of [
    ['devanalyze', h => assert.strictEqual(h.Authorization, 'Bearer tok_abc123')],
    // Imprimível inclui " e \, que quebrariam o JSON sem escape.
    ['devanalyze', h => assert.strictEqual(h.Authorization, 'Bearer a"b\\c%s$d'), 'a"b\\c%s$d'],
    ['datadog', h => { assert.strictEqual(h['dd-api-key'], 'tok_abc123'); assert.deepStrictEqual(JSON.parse(h['dd-otel-metric-config']), { resource_attributes_as_tags: true }); }],
  ]) {
    const home = tmpdir();
    fs.mkdirSync(path.join(home, '.config', 'claude-otlp'), { recursive: true });
    fs.writeFileSync(path.join(home, '.config', 'claude-otlp', dest), `${token || 'tok_abc123'}\n`);
    const helper = path.join(home, 'h.sh');
    const env = { ...process.env, HOME: home, OS: 'Linux', DEST: dest, HELPER: helper, KC_SERVICE: 'x' };
    const gen = spawnSync('bash', ['-c', `${fn}\ninstall_helper`], { env, encoding: 'utf8' });
    assert.strictEqual(gen.status, 0, gen.stderr);
    const out = spawnSync('sh', [helper], { env, encoding: 'utf8' });
    assert.strictEqual(out.status, 0, out.stderr);
    check(JSON.parse(out.stdout));
  }
});
