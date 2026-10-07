// Testes do `skills/flow-lite/scripts/setup-dev-settings.js`.
//
// Roda o script de verdade contra settings temporários (--settings), sem tocar
// no ~/.claude do dev:
//   - sem --apply só mostra o plano e não escreve;
//   - --apply libera os scripts do hub, põe async só nos hooks do iTerm2 (com
//     caminho Unix ou Windows) e preserva todo o resto; segunda vez é no-op;
//   - --undo devolve o settings original byte a byte;
//   - settings ilegível sai 2 sem escrever; settings inexistente é criado.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'skills', 'flow-lite', 'scripts', 'setup-dev-settings.js');
const { HUB_PERMISSIONS } = require(SCRIPT);

const run = (file, ...args) => spawnSync(process.execPath, [SCRIPT, '--settings', file, ...args], { encoding: 'utf8' });
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dev-settings-')), 'settings.json');

const ORIGINAL = {
  model: 'opus',
  env: { CLAUDE_CODE_ENABLE_TELEMETRY: '1' },
  permissions: { allow: ['WebFetch(domain:example.com)'] },
  hooks: {
    PreToolUse: [{ hooks: [{ type: 'command', command: '/Users/dev/.config/iterm2/cc-status' }] }],
    Stop: [
      { hooks: [{ type: 'command', command: 'afplay /System/Library/Sounds/Glass.aiff', async: true }] },
      { hooks: [{ type: 'command', command: 'C:\\Users\\dev\\iterm2\\cc-status' }] },
    ],
    SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: '/Users/dev/.local/bin/ahc sync --quiet --timeout=5' }] }],
  },
};

test('sem --apply mostra o plano e não escreve', () => {
  const file = tmpFile();
  fs.writeFileSync(file, JSON.stringify(ORIGINAL));
  const before = fs.readFileSync(file, 'utf8');
  const r = run(file, '--json');
  assert.strictEqual(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.applied, false);
  assert.deepStrictEqual(out.permissions, HUB_PERMISSIONS);
  assert.deepStrictEqual(out.asyncHooks.sort(), ['PreToolUse', 'Stop']);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before);
});

test('--apply libera os scripts, põe async só no cc-status, preserva o resto e é idempotente', () => {
  const file = tmpFile();
  fs.writeFileSync(file, JSON.stringify(ORIGINAL));
  assert.strictEqual(run(file, '--apply').status, 0);
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(s.model, 'opus');
  assert.deepStrictEqual(s.env, ORIGINAL.env);
  assert.deepStrictEqual(s.permissions.allow, ['WebFetch(domain:example.com)', ...HUB_PERMISSIONS]);
  assert.strictEqual(s.hooks.PreToolUse[0].hooks[0].async, true);
  assert.strictEqual(s.hooks.Stop[1].hooks[0].async, true, 'caminho Windows');
  assert.deepStrictEqual(s.hooks.SessionStart, ORIGINAL.hooks.SessionStart, 'ahc sync continua síncrono');
  assert.deepStrictEqual(s.hooks.Stop[0], ORIGINAL.hooks.Stop[0]);

  const after = fs.readFileSync(file, 'utf8');
  const again = run(file, '--apply');
  assert.strictEqual(again.status, 0);
  assert.match(again.stdout, /nada a fazer/);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), after);
});

test('--undo devolve o original byte a byte', () => {
  const file = tmpFile();
  const raw = JSON.stringify(ORIGINAL, null, 4);
  fs.writeFileSync(file, raw);
  assert.strictEqual(run(file, '--apply').status, 0);
  assert.strictEqual(run(file, '--apply').status, 0);
  assert.strictEqual(run(file, '--undo').status, 0);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), raw);
  assert.notStrictEqual(run(file, '--undo').status, 0, 'sem backup, nada a desfazer');
});

test('settings ilegível sai 2 sem escrever; inexistente é criado', () => {
  const bad = tmpFile();
  fs.writeFileSync(bad, '{ quebrado');
  const r = run(bad, '--apply');
  assert.strictEqual(r.status, 2);
  assert.strictEqual(fs.readFileSync(bad, 'utf8'), '{ quebrado');

  const missing = tmpFile();
  assert.strictEqual(run(missing, '--apply').status, 0);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(missing, 'utf8')).permissions.allow, HUB_PERMISSIONS);
});
