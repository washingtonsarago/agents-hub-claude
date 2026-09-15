// Integration tests for `bin/ahc sync` and friends.
// Spawns the real CLI under a tmp HOME pointing at the fixture remote (file://).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  FIXTURE_REMOTE,
  makeTmpHome,
  writeConfig,
  readLock,
  writeLock,
  runAhc,
  rmrf,
} = require('./helpers');

const REMOTE_URL = `file://${FIXTURE_REMOTE}`;

// ---- helpers ---------------------------------------------------------------

function freshHome() {
  const home = makeTmpHome();
  writeConfig(home, { repo: REMOTE_URL, branch: 'n/a', channel: 'stable' });
  return home;
}

function listSkillFiles(home) {
  const root = path.join(home, '.claude', 'skills', 'test-skill');
  if (!fs.existsSync(root)) return [];
  const out = [];
  function walk(dir, rel = '') {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(full, r);
      else if (e.isFile()) out.push(r);
    }
  }
  walk(root);
  return out.sort();
}

// ---- tests -----------------------------------------------------------------

test('sync: fresh install — adds agent + command + multi-file skill', () => {
  const home = freshHome();
  try {
    const r = runAhc(home, ['sync']);
    assert.equal(r.status, 0, `sync exit ${r.status}: ${r.stderr || r.stdout}`);

    // Files written
    assert.ok(fs.existsSync(path.join(home, '.claude/agents/test-agent.md')),
      'agent file should exist');
    assert.ok(fs.existsSync(path.join(home, '.claude/commands/test-command.md')),
      'command file should exist');
    assert.deepEqual(listSkillFiles(home),
      ['SKILL.md', 'templates/helper.py'],
      'skill should have all 2 files');

    // Lock contains all three categories
    const lock = readLock(home);
    assert.equal(lock.agents['test-agent'].version, '1.0.0');
    assert.equal(lock.commands['test-command'].version, '1.0.0');
    assert.equal(lock.skills['test-skill'].version, '1.0.0');
    assert.equal(Object.keys(lock.skills['test-skill'].files).length, 2);
  } finally { rmrf(home); }
});

test('sync: idempotent — re-running with no changes is a no-op', () => {
  const home = freshHome();
  try {
    runAhc(home, ['sync']);
    const r2 = runAhc(home, ['sync']);
    assert.equal(r2.status, 0);
    assert.match(r2.stdout, /skipped:4/, 'all 4 fixture items should be skipped');
  } finally { rmrf(home); }
});

test('sync: detects per-file hash mismatch in skill (refuses to write)', () => {
  const home = freshHome();
  try {
    // Tamper with the lock so the skill appears stale, then mutate the
    // manifest sha to something wrong → next sync should refuse the file
    // and NOT touch the local skill.
    const localCfg = path.join(home, '.claude', '.ahc-config.json');
    // Repoint at a one-off "broken" remote: copy the fixture, edit manifest.
    const brokenRemote = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ahc-broken-'));
    require('./helpers').copyTree(FIXTURE_REMOTE, brokenRemote);
    const m = JSON.parse(fs.readFileSync(path.join(brokenRemote, 'manifest.json'), 'utf8'));
    // Wrong sha for one of the skill's files
    m.skills[0].files[1].sha256 = 'deadbeef'.repeat(8);
    m.skills[0].version = '1.0.1'; // bump so cache miss triggers re-download
    fs.writeFileSync(path.join(brokenRemote, 'manifest.json'), JSON.stringify(m));
    fs.writeFileSync(localCfg, JSON.stringify({
      repo: `file://${brokenRemote}`, branch: 'n/a', channel: 'stable',
    }));

    const r = runAhc(home, ['sync']);
    // sync exits 0 overall but printed an error, and the local helper.py
    // should remain at the original sha (or be missing because the install
    // is fresh). Either way the skill version in lock should NOT be 1.0.1.
    const lock = readLock(home);
    assert.notEqual(lock.skills['test-skill']?.version, '1.0.1',
      'skill must not be promoted to bad version on hash mismatch');
    assert.match(r.stderr + r.stdout, /hash mismatch/i,
      'must report hash mismatch');

    rmrf(brokenRemote);
  } finally { rmrf(home); }
});

test('sync: pin holds the version, unpin releases it', () => {
  const home = freshHome();
  try {
    runAhc(home, ['sync']);
    const r1 = runAhc(home, ['pin', 'test-agent@9.9.9']);
    assert.equal(r1.status, 0);

    // Now bump the manifest to a new agent version locally in a fresh remote
    // and re-point. The pin should keep the local at 1.0.0.
    const newRemote = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ahc-new-'));
    require('./helpers').copyTree(FIXTURE_REMOTE, newRemote);
    const m = JSON.parse(fs.readFileSync(path.join(newRemote, 'manifest.json'), 'utf8'));
    m.agents[0].version = '2.0.0';
    fs.writeFileSync(path.join(newRemote, 'manifest.json'), JSON.stringify(m));
    writeConfig(home, { repo: `file://${newRemote}`, branch: 'n/a', channel: 'stable' });

    const r2 = runAhc(home, ['sync']);
    assert.equal(r2.status, 0);
    assert.match(r2.stdout + r2.stderr, /pinned/, 'should report pinned');

    const lock = readLock(home);
    assert.equal(lock.agents['test-agent'].version, '1.0.0', 'must stay on pinned local version');

    // Unpin: must allow the update on next sync
    const r3 = runAhc(home, ['unpin', 'test-agent']);
    assert.equal(r3.status, 0);

    rmrf(newRemote);
  } finally { rmrf(home); }
});

test('sync: lock from older ahc (no skills field) is upgraded transparently', () => {
  const home = freshHome();
  try {
    // Simulate an older lock file that doesn't know about skills.
    writeLock(home, {
      agents: {}, commands: {}, pins: {},
      // intentionally NO `skills` key
    });
    const r = runAhc(home, ['sync']);
    assert.equal(r.status, 0, `sync should succeed with old lock: ${r.stderr}`);

    const lock = readLock(home);
    assert.ok(lock.skills, 'lock should now have skills key');
    assert.ok(lock.skills['test-skill'], 'skill should be installed');
  } finally { rmrf(home); }
});

test('list: shows all 3 categories with status indicators', () => {
  const home = freshHome();
  try {
    runAhc(home, ['sync']);
    const r = runAhc(home, ['list']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /AGENTS/, 'should show AGENTS section');
    assert.match(r.stdout, /COMMANDS/, 'should show COMMANDS section');
    assert.match(r.stdout, /SKILLS/, 'should show SKILLS section');
    assert.match(r.stdout, /test-agent/, 'should list test-agent');
    assert.match(r.stdout, /test-skill\s+local:1\.0\.0/, 'skill in sync should show version');
    assert.match(r.stdout, /\(2 files\)/, 'should show file count for skill');
  } finally { rmrf(home); }
});

test('config: get and set persist to ~/.claude/.ahc-config.json', () => {
  const home = freshHome();
  try {
    const r1 = runAhc(home, ['config', 'channel=beta']);
    assert.equal(r1.status, 0);
    const r2 = runAhc(home, ['config']);
    assert.equal(r2.status, 0);
    assert.match(r2.stdout, /"channel": "beta"/);
  } finally { rmrf(home); }
});
