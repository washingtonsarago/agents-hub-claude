// Integration tests for `scripts/regen-manifest.js`.
// Each test builds a self-contained tmp repo (copy of the fixture),
// mutates it, and asserts the script reports/writes the right thing.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  makeMinimalRepo,
  runRegen,
  patchManifest,
  rmrf,
} = require('./helpers');

function readManifest(repo) {
  return JSON.parse(fs.readFileSync(path.join(repo, 'manifest.json'), 'utf8'));
}

test('regen: clean repo reports no changes', () => {
  const repo = makeMinimalRepo();
  try {
    const r = runRegen(repo);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /up to date/, `expected "up to date": ${r.stdout}`);
  } finally { rmrf(repo); }
});

test('regen: edit an agent → bumps patch and updates sha', () => {
  const repo = makeMinimalRepo();
  try {
    const before = readManifest(repo);
    const oldVer = before.agents[0].version;
    const oldSha = before.agents[0].sha256;

    // Mutate the file content
    fs.appendFileSync(path.join(repo, 'agents/test-agent.md'), '\n<!-- mutated -->\n');

    const r = runRegen(repo);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /test-agent.*1\.0\.0.*1\.0\.1/);

    const after = readManifest(repo);
    assert.notEqual(after.agents[0].sha256, oldSha, 'sha should change');
    assert.equal(after.agents[0].version, '1.0.1', 'patch should bump');
  } finally { rmrf(repo); }
});

test('regen: --check exits 1 when manifest is out of sync', () => {
  const repo = makeMinimalRepo();
  try {
    fs.appendFileSync(path.join(repo, 'commands/test-command.md'), '\nDRIFT\n');
    const r = runRegen(repo, ['--check']);
    assert.equal(r.status, 1, 'should exit 1 on drift');
    assert.match(r.stderr + r.stdout, /would change|drift|update/i);

    // Manifest must NOT have been written
    const after = readManifest(repo);
    assert.equal(after.commands[0].version, '1.0.0', 'no bump in --check mode');
  } finally { rmrf(repo); }
});

test('regen: --dry-run reports changes but does not write', () => {
  const repo = makeMinimalRepo();
  try {
    fs.appendFileSync(path.join(repo, 'agents/test-agent.md'), '\nx\n');
    const r = runRegen(repo, ['--dry-run']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /dry-run/);

    const after = readManifest(repo);
    assert.equal(after.agents[0].version, '1.0.0', 'dry-run must not bump');
  } finally { rmrf(repo); }
});

test('regen: new agent is added at v1.0.0 with description from frontmatter', () => {
  const repo = makeMinimalRepo();
  try {
    fs.writeFileSync(path.join(repo, 'agents/brand-new.md'),
`---
name: brand-new
description: "Hot new agent for tests."
model: sonnet
color: green
---

# Brand New
body
`);
    const r = runRegen(repo);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\+ brand-new @ 1\.0\.0/);

    const after = readManifest(repo);
    const entry = after.agents.find(a => a.name === 'brand-new');
    assert.ok(entry, 'new agent should be registered');
    assert.equal(entry.version, '1.0.0');
    assert.equal(entry.description, 'Hot new agent for tests.');
  } finally { rmrf(repo); }
});

test('regen: removed file → entry deleted from manifest', () => {
  const repo = makeMinimalRepo();
  try {
    fs.unlinkSync(path.join(repo, 'commands/test-command.md'));
    const r = runRegen(repo);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /- test-command/);

    const after = readManifest(repo);
    assert.equal(after.commands.length, 0, 'orphan must be removed');
  } finally { rmrf(repo); }
});

test('regen: skill — change one auxiliary file bumps the whole skill version', () => {
  const repo = makeMinimalRepo();
  try {
    fs.appendFileSync(
      path.join(repo, 'skills/test-skill/templates/helper.py'),
      '\n# touched\n'
    );
    const r = runRegen(repo);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /test-skill.*1\.0\.0.*1\.0\.1/);

    const after = readManifest(repo);
    assert.equal(after.skills[0].version, '1.0.1');
  } finally { rmrf(repo); }
});

test('regen: dotfiles inside skill (.DS_Store) are ignored', () => {
  const repo = makeMinimalRepo();
  try {
    fs.writeFileSync(
      path.join(repo, 'skills/test-skill/.DS_Store'),
      'macOS metadata garbage'
    );
    const r = runRegen(repo);
    assert.equal(r.status, 0);
    // Should report no changes: the dotfile must be skipped
    assert.match(r.stdout, /up to date/);
  } finally { rmrf(repo); }
});

test('regen: --bump=minor bumps minor on changed entries', () => {
  const repo = makeMinimalRepo();
  try {
    fs.appendFileSync(path.join(repo, 'agents/test-agent.md'), '\nx\n');
    const r = runRegen(repo, ['--bump=minor']);
    assert.equal(r.status, 0);

    const after = readManifest(repo);
    assert.equal(after.agents[0].version, '1.1.0', 'minor should bump');
  } finally { rmrf(repo); }
});

test('regen: rejects invalid --bump value', () => {
  const repo = makeMinimalRepo();
  try {
    const r = runRegen(repo, ['--bump=yolo']);
    assert.notEqual(r.status, 0, 'must reject invalid bump');
    assert.match(r.stderr, /invalid --bump/i);
  } finally { rmrf(repo); }
});
