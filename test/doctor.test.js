// Integration tests for `ahc doctor`. Spawns the CLI against a tmp HOME
// pointing at the file:// fixture remote (so the git-auth and CLI-version
// checks short-circuit to "skipped (local fixture)" rather than hitting the
// network). Each test isolates one check by making the rest pass.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  FIXTURE_REMOTE,
  makeTmpHome,
  writeConfig,
  writeLock,
  runAhc,
  rmrf,
} = require('./helpers');

const REMOTE_URL = `file://${FIXTURE_REMOTE}`;

function freshHome() {
  const home = makeTmpHome();
  writeConfig(home, { repo: REMOTE_URL, branch: 'n/a', channel: 'stable' });
  return home;
}

function writeSettings(home, obj) {
  fs.writeFileSync(
    path.join(home, '.claude', 'settings.json'),
    JSON.stringify(obj, null, 2)
  );
}

function validHookSettings() {
  return {
    hooks: {
      SessionStart: [
        { matcher: '*', hooks: [{ type: 'command', command: '/usr/local/bin/ahc sync --quiet' }] },
      ],
    },
  };
}

function validLock() {
  return {
    agents: { 'test-agent': { version: '1.0.0', sha256: 'abc', path: '/tmp/test-agent.md' } },
    commands: {},
    skills: {},
    pins: {},
  };
}

// ---- tests -----------------------------------------------------------------

test('doctor: clean env returns exit 0 with all checks ok or warn', () => {
  const home = freshHome();
  try {
    writeSettings(home, validHookSettings());
    writeLock(home, validLock());

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 0, `expected 0, got ${r.status}: ${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /ahc doctor/);
    assert.match(r.stdout, /SessionStart hook configured/);
    assert.match(r.stdout, /lock file valid/);
    assert.match(r.stdout, /git auth.*local fixture/);
  } finally { rmrf(home); }
});

test('doctor: missing settings.json → warn, still exit 0', () => {
  const home = freshHome();
  try {
    writeLock(home, validLock());
    // No settings.json written.

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 0, `expected warn-only, got status ${r.status}`);
    assert.match(r.stdout, /⚠ SessionStart hook/);
    assert.match(r.stdout, /settings\.json missing/);
  } finally { rmrf(home); }
});

test('doctor: malformed settings.json → fail, exit 1', () => {
  const home = freshHome();
  try {
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{ broken json');
    writeLock(home, validLock());

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /✗ SessionStart hook/);
    assert.match(r.stdout, /not valid JSON/);
  } finally { rmrf(home); }
});

test('doctor: settings.json without ahc sync hook → fail, exit 1', () => {
  const home = freshHome();
  try {
    writeSettings(home, { hooks: { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo hi' }] }] } });
    writeLock(home, validLock());

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /no `ahc sync` hook found/);
  } finally { rmrf(home); }
});

test('doctor: missing lock → warn, still exit 0', () => {
  const home = freshHome();
  try {
    writeSettings(home, validHookSettings());
    // No lock file.

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /⚠ lock file/);
    assert.match(r.stdout, /not present yet/);
  } finally { rmrf(home); }
});

test('doctor: malformed lock → fail, exit 1', () => {
  const home = freshHome();
  try {
    writeSettings(home, validHookSettings());
    fs.writeFileSync(path.join(home, '.claude', '.ahc-lock.json'), '{ no good');

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /✗ lock file/);
    assert.match(r.stdout, /not valid JSON/);
  } finally { rmrf(home); }
});

test('doctor: empty lock → warn (suggests sync)', () => {
  const home = freshHome();
  try {
    writeSettings(home, validHookSettings());
    writeLock(home, { agents: {}, commands: {}, skills: {}, pins: {} });

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /⚠ lock file/);
    assert.match(r.stdout, /empty/);
  } finally { rmrf(home); }
});

test('doctor: world-readable config WITHOUT token → warn (preventive)', { skip: process.platform === 'win32' }, () => {
  const home = freshHome();
  try {
    writeSettings(home, validHookSettings());
    writeLock(home, validLock());
    // freshHome() already wrote the config; tighten it then loosen.
    fs.chmodSync(path.join(home, '.claude', '.ahc-config.json'), 0o644);

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 0, `expected warn-only, got ${r.status}: ${r.stdout}`);
    assert.match(r.stdout, /⚠ config file permission/);
    assert.match(r.stdout, /preventive/);
  } finally { rmrf(home); }
});

test('doctor: world-readable config WITH token → fail, exit 1', { skip: process.platform === 'win32' }, () => {
  const home = freshHome();
  try {
    writeSettings(home, validHookSettings());
    writeLock(home, validLock());
    writeConfig(home, { repo: REMOTE_URL, branch: 'n/a', channel: 'stable', token: 'ghp_fake_token_for_test' });
    fs.chmodSync(path.join(home, '.claude', '.ahc-config.json'), 0o644);

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /✗ config file permission/);
    assert.match(r.stdout, /token present/);
  } finally { rmrf(home); }
});

test('doctor: 0600 config → ok', { skip: process.platform === 'win32' }, () => {
  const home = freshHome();
  try {
    writeSettings(home, validHookSettings());
    writeLock(home, validLock());
    fs.chmodSync(path.join(home, '.claude', '.ahc-config.json'), 0o600);

    const r = runAhc(home, ['doctor']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /✓ config file permission/);
    assert.match(r.stdout, /mode 600/);
  } finally { rmrf(home); }
});
