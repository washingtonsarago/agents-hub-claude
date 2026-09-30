// Integration tests for the flow-lite batch controls: ownership manifest
// validation, merge order (cycle fails), and cross-branch reconciliation
// (diverging collisions fail before any PR).
//
// What is isolated here: a throwaway git repository per test with one branch
// per item, built with plain git so reconcile is exercised against real refs.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const { rmrf } = require('./helpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const FLOW = path.join(REPO_ROOT, 'skills', 'flow-lite', 'scripts', 'flow-lite.js');
const batch = require(path.join(REPO_ROOT, 'skills', 'flow-lite', 'scripts', 'lib', 'batch.js'));

function sh(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function write(dir, rel, content) { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); return p; }
function writeJSON(dir, rel, obj) { return write(dir, rel, JSON.stringify(obj, null, 2) + '\n'); }
function run(args, opts = {}) { return spawnSync('node', [FLOW, ...args], { encoding: 'utf8', timeout: 30000, ...opts }); }

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-batch-'));
  sh(dir, ['init', '-q', '-b', 'main']);
  sh(dir, ['config', 'user.email', 't@example.invalid']);
  sh(dir, ['config', 'user.name', 'test']);
  sh(dir, ['config', 'core.autocrlf', 'false']);
  write(dir, 'README.md', 'base\n');
  sh(dir, ['add', '.']);
  sh(dir, ['commit', '-q', '-m', 'base']);
  return dir;
}

// Creates a branch from main with the given files committed.
function branchWith(repo, branch, files) {
  sh(repo, ['checkout', '-q', 'main']);
  sh(repo, ['checkout', '-q', '-b', branch]);
  for (const [rel, content] of Object.entries(files)) write(repo, rel, content);
  sh(repo, ['add', '.']);
  sh(repo, ['commit', '-q', '-m', branch]);
  sh(repo, ['checkout', '-q', 'main']);
}

const MANIFEST = (items, ownership = {}) => ({ schemaVersion: 1, batch: 'b1', items, ownership });

test('manifest: validation catches duplicate keys, unknown owners, unknown and self dependencies', () => {
  const errors = batch.validateManifest(MANIFEST(
    [{ key: 'A-1', dependsOn: ['A-1', 'Z-9'] }, { key: 'A-1' }, { key: 'bad key' }],
    { 'src/x.js': 'NOPE', '/abs/path': 'A-1' },
  ));
  const text = errors.join('\n');
  assert.match(text, /duplicate item key A-1/);
  assert.match(text, /depends on unknown item Z-9/);
  assert.match(text, /depends on itself/);
  assert.match(text, /items\[2\].key must be a string/);
  assert.match(text, /"NOPE" is not an item of this batch/);
  assert.match(text, /must be repository-relative/);
  assert.deepEqual(batch.validateManifest(MANIFEST([{ key: 'A-1' }, { key: 'A-2', dependsOn: ['A-1'] }], { 'src/x.js': 'A-1' })), []);
});

test('manifest validate CLI: exit 2 with the reasons, exit 0 with a count', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-m-'));
  try {
    const bad = writeJSON(dir, 'bad.json', MANIFEST([{ key: 'A-1' }], { 'a.js': 'B-2' }));
    let r = run(['manifest', 'validate', '--manifest', bad]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /"B-2" is not an item/);
    const ok = writeJSON(dir, 'ok.json', MANIFEST([{ key: 'A-1' }], { 'a.js': 'A-1' }));
    r = run(['manifest', 'validate', '--manifest', ok]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /1 item\(s\), 1 owned path\(s\)/);
  } finally { rmrf(dir); }
});

test('order: topological order respects dependsOn; a cycle fails the batch with exit 1', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowlite-o-'));
  try {
    const ok = writeJSON(dir, 'ok.json', MANIFEST([{ key: 'C-3', dependsOn: ['B-2'] }, { key: 'A-1' }, { key: 'B-2', dependsOn: ['A-1'] }, { key: 'D-4' }]));
    let r = run(['order', '--manifest', ok]);
    assert.equal(r.status, 0, r.stderr);
    // Ready items are taken alphabetically, so B-2 (ready after A-1) precedes D-4.
    assert.deepEqual(JSON.parse(r.stdout), { order: ['A-1', 'B-2', 'C-3', 'D-4'], cycle: [] });

    const cyc = writeJSON(dir, 'cyc.json', MANIFEST([{ key: 'A-1', dependsOn: ['B-2'] }, { key: 'B-2', dependsOn: ['A-1'] }, { key: 'C-3' }]));
    r = run(['order', '--manifest', cyc]);
    assert.equal(r.status, 1);
    assert.deepEqual(JSON.parse(r.stdout), { order: ['C-3'], cycle: ['A-1', 'B-2'] });
    assert.match(r.stderr, /dependency cycle among: A-1, B-2/);
  } finally { rmrf(dir); }
});

test('reconcile: identical duplicates are reported but pass; diverging duplicates fail with exit 1', () => {
  const repo = makeRepo();
  try {
    branchWith(repo, 'feat/a-1', { 'src/a.js': 'a\n', 'src/shared/model.js': 'same content\n', 'src/shared/dto.js': 'version from A\n' });
    branchWith(repo, 'feat/b-2', { 'src/b.js': 'b\n', 'src/shared/model.js': 'same content\n', 'src/shared/dto.js': 'version from B\n' });
    branchWith(repo, 'feat/c-3', { 'src/c.js': 'c\n' });
    const manifest = writeJSON(repo, '.flow-lite/manifest.json', MANIFEST([{ key: 'A-1' }, { key: 'B-2' }, { key: 'C-3' }], { 'src/shared/dto.js': 'A-1' }));
    const r = run(['reconcile', '--worktree', repo, '--base-ref', 'main', '--manifest', manifest, '--out', path.join(repo, '.flow-lite')]);
    assert.equal(r.status, 1, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.divergingCount, 1);
    assert.equal(out.identicalCount, 1);
    const dto = out.collisions.find(c => c.path === 'src/shared/dto.js');
    assert.equal(dto.diverging, true);
    assert.deepEqual(dto.items, ['A-1', 'B-2']);
    assert.equal(dto.owner, 'A-1');
    const model = out.collisions.find(c => c.path === 'src/shared/model.js');
    assert.equal(model.diverging, false);
    assert.match(r.stderr, /1 file\(s\) created by more than one item with diverging content/);
    assert.ok(fs.existsSync(path.join(repo, '.flow-lite', 'reconcile.json')));

    // Fix B to consume A's version → batch passes.
    sh(repo, ['checkout', '-q', 'feat/b-2']);
    write(repo, 'src/shared/dto.js', 'version from A\n');
    sh(repo, ['commit', '-q', '-am', 'consume']);
    sh(repo, ['checkout', '-q', 'main']);
    const r2 = run(['reconcile', '--worktree', repo, '--base-ref', 'main', '--manifest', manifest]);
    assert.equal(r2.status, 0, r2.stderr);
    assert.equal(JSON.parse(r2.stdout).divergingCount, 0);
  } finally { rmrf(repo); }
});

test('reconcile: a missing item branch is invalid input (exit 2), and the branch template is honoured', () => {
  const repo = makeRepo();
  try {
    branchWith(repo, 'item/x-1', { 'x.js': 'x\n' });
    const manifest = writeJSON(repo, '.flow-lite/manifest.json', MANIFEST([{ key: 'X-1' }]));
    let r = run(['reconcile', '--worktree', repo, '--base-ref', 'main', '--manifest', manifest]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /cannot diff main\.\.\.feat\/x-1/);
    r = run(['reconcile', '--worktree', repo, '--base-ref', 'main', '--manifest', manifest, '--branch-template', 'item/{key}']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).items[0].created, 1);
  } finally { rmrf(repo); }
});
