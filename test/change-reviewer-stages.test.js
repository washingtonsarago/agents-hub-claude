// Tests for the gate running at more than one moment of the pipeline.
//
// v1 asked the reviewer one question, on the diff, just before the commit.
// These cover the two other moments: `scope`, before a line is written, and
// `reconcile`, after every branch exists and before any PR. The rule that ties
// them together is that a stage may only ask what its evidence supports — so
// `suite` and `secret` are unreachable at scope stage, and a stage that never
// read a diff says `not-applicable` instead of reporting a coverage.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const { rmrf } = require('./helpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPTS = path.join(REPO_ROOT, 'skills', 'change-reviewer', 'scripts');
const GATE = path.join(SCRIPTS, 'gate.js');
const stages = require(path.join(SCRIPTS, 'lib', 'stages.js'));

function sh(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function write(dir, rel, content) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}
function writeJSON(dir, rel, obj) { return write(dir, rel, JSON.stringify(obj, null, 2) + '\n'); }
function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'change-reviewer-stage-'));
  sh(dir, ['init', '-q', '-b', 'main']);
  sh(dir, ['config', 'user.email', 't@example.invalid']);
  sh(dir, ['config', 'user.name', 'test']);
  sh(dir, ['config', 'core.autocrlf', 'false']);
  write(dir, 'src/app.js', 'module.exports = 1;\n');
  sh(dir, ['add', '.']);
  sh(dir, ['commit', '-q', '-m', 'base']);
  sh(dir, ['checkout', '-q', '-b', 'feat/x']);
  return dir;
}

function runGate(args) { return spawnSync('node', [GATE, ...args], { encoding: 'utf8', timeout: 30000 }); }

const MANIFEST = {
  schemaVersion: 1,
  items: [{ key: 'ITEM-1', allowedPaths: ['src/**'], budget: { maxFiles: 3, maxLines: 120 } }],
  ownership: { 'src/shared/contract.ts': 'ITEM-2' },
};

function projection(extra = {}) {
  return {
    schemaVersion: 1,
    item: 'ITEM-1',
    restatement: 'Add a price field to the order summary.',
    projectedFiles: [{ path: 'src/order.js', action: 'modify', estimatedLines: 20 }],
    declaredLimitations: [],
    ...extra,
  };
}

// ------------------------------------------------------------- stage plumbing

test('a stage only offers the rules its evidence supports', () => {
  // Nothing has run at scope stage, so there is no suite to judge and no diff
  // to scan for secrets. Offering those rules would be theatre.
  assert.ok(!stages.STAGES.scope.rules.includes('suite'));
  assert.ok(!stages.STAGES.scope.rules.includes('secret'));
  assert.ok(stages.STAGES.scope.rules.includes('honesty'), 'honesty is cheapest here');
  assert.ok(stages.STAGES.scope.rules.includes('ownership'));

  // The change stage keeps every rule: `null` means "the whole set".
  assert.equal(stages.STAGES.change.rules, null);

  // Reconcile is about duplication across branches, not about a test run.
  assert.ok(!stages.STAGES.reconcile.rules.includes('suite'));
  assert.ok(stages.STAGES.reconcile.rules.includes('rule-parity'));

  assert.throws(() => stages.resolveStage('whenever'), /must be one of/);
  assert.equal(stages.resolveStage().id, 'change', 'the default stays the original gate');
});

test('an unknown stage is bad input (exit 2), not a silent fallback to change', () => {
  const repo = makeRepo();
  try {
    const r = runGate(['prepare', '--worktree', repo, '--base-ref', 'main', '--item', 'ITEM-1',
      '--out', path.join(repo, '.gate'), '--stage', 'whenever']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /stage must be one of/);
  } finally { rmrf(repo); }
});

// ------------------------------------------------------------- stage: scope

test('scope stage: a projection over the item budget blocks before any code exists', () => {
  const repo = makeRepo();
  try {
    const out = path.join(repo, '.gate');
    const m = writeJSON(repo, 'manifest.json', MANIFEST);
    const p = writeJSON(repo, 'projection.json', projection({
      projectedFiles: [
        { path: 'src/a.js', action: 'create', estimatedLines: 60 },
        { path: 'src/b.js', action: 'create', estimatedLines: 60 },
        { path: 'src/c.js', action: 'create', estimatedLines: 60 },
        { path: 'src/d.js', action: 'create', estimatedLines: 60 },
      ],
    }));
    const r = runGate(['run', '--worktree', repo, '--base-ref', 'main', '--item', 'ITEM-1',
      '--out', out, '--stage', 'scope', '--projection', p, '--manifest', m]);
    assert.equal(r.status, 1, 'over budget is a blocker');
    const g = readJSON(path.join(out, 'gate.json'));
    const ids = g.findings.map(f => f.rule);
    assert.ok(ids.includes('scope'));
    const texts = g.findings.map(f => f.summary).join(' | ');
    assert.match(texts, /4 files, over the item budget of 3/);
    assert.match(texts, /240 lines, over the item budget of 120/);
  } finally { rmrf(repo); }
});

test('scope stage: planning to create a file another item owns blocks', () => {
  const repo = makeRepo();
  try {
    const out = path.join(repo, '.gate');
    const m = writeJSON(repo, 'manifest.json', MANIFEST);
    const p = writeJSON(repo, 'projection.json', projection({
      projectedFiles: [{ path: 'src/shared/contract.ts', action: 'create', estimatedLines: 10 }],
    }));
    const r = runGate(['run', '--worktree', repo, '--base-ref', 'main', '--item', 'ITEM-1',
      '--out', out, '--stage', 'scope', '--projection', p, '--manifest', m]);
    assert.equal(r.status, 1);
    const g = readJSON(path.join(out, 'gate.json'));
    const own = g.findings.find(f => f.rule === 'ownership');
    assert.ok(own, 'ownership is checkable before the file exists');
    assert.match(own.summary, /assigns to "ITEM-2"/);
    assert.match(own.remedy, /consume/);
  } finally { rmrf(repo); }
});

test('scope stage: a projection inside the budget and the owned paths clears', () => {
  const repo = makeRepo();
  try {
    const out = path.join(repo, '.gate');
    const m = writeJSON(repo, 'manifest.json', MANIFEST);
    const p = writeJSON(repo, 'projection.json', projection());
    const r = runGate(['run', '--worktree', repo, '--base-ref', 'main', '--item', 'ITEM-1',
      '--out', out, '--stage', 'scope', '--projection', p, '--manifest', m]);
    assert.equal(r.status, 0);
    const g = readJSON(path.join(out, 'gate.json'));
    assert.equal(g.stage, 'scope');
    // It never read a diff, and says so rather than reporting a coverage.
    assert.equal(g.capabilities.diffCoverage, 'not-applicable');
  } finally { rmrf(repo); }
});

test('scope stage: code written while the scope is judged makes it inconclusive, never cleared', () => {
  const repo = makeRepo();
  try {
    const out = path.join(repo, '.gate');
    const m = writeJSON(repo, 'manifest.json', MANIFEST);
    const p = writeJSON(repo, 'projection.json', projection());
    const prep = runGate(['prepare', '--worktree', repo, '--base-ref', 'main', '--item', 'ITEM-1',
      '--out', out, '--stage', 'scope', '--projection', p, '--manifest', m]);
    assert.equal(prep.status, 0);

    // Somebody starts coding before the gate cleared the scope.
    write(repo, 'src/order.js', 'module.exports = { price: 1 };\n');

    const fin = runGate(['finalize', '--context', path.join(out, 'gate-context.json')]);
    assert.equal(fin.status, 4, 'fail-closed');
    const g = readJSON(path.join(out, 'gate.json'));
    assert.match(g.inconclusiveReason, /code was written before the scope gate cleared it/);
  } finally { rmrf(repo); }
});

test('scope stage: a malformed projection is bad input, not a cleared gate', () => {
  const repo = makeRepo();
  try {
    const out = path.join(repo, '.gate');
    const bad = writeJSON(repo, 'projection.json', { schemaVersion: 1, projectedFiles: [] });
    const r = runGate(['run', '--worktree', repo, '--base-ref', 'main', '--item', 'ITEM-1',
      '--out', out, '--stage', 'scope', '--projection', bad]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /restatement/);

    // And forgetting the file entirely is also exit 2, never a pass.
    const missing = runGate(['run', '--worktree', repo, '--base-ref', 'main', '--item', 'ITEM-1',
      '--out', out, '--stage', 'scope']);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /--projection/);
  } finally { rmrf(repo); }
});

// --------------------------------------------------------- stage: reconcile

test('reconcile stage: a file created by a non-owner blocks, even byte-identical', () => {
  const repo = makeRepo();
  try {
    const out = path.join(repo, '.gate');
    const m = writeJSON(repo, 'manifest.json', MANIFEST);
    const rep = writeJSON(repo, 'reconcile.json', {
      schemaVersion: 1,
      baseRef: 'main',
      items: [{ key: 'ITEM-1', branch: 'feat/a', created: 1 }, { key: 'ITEM-2', branch: 'feat/b', created: 1 }],
      collisions: [{
        path: 'src/shared/contract.ts',
        items: ['ITEM-1', 'ITEM-2'],
        owner: 'ITEM-2',
        diverging: false,
        blobs: [{ key: 'ITEM-1', blob: 'aaaaaaaaaaaa' }, { key: 'ITEM-2', blob: 'aaaaaaaaaaaa' }],
      }],
      divergingCount: 0,
      identicalCount: 1,
    });
    const r = runGate(['run', '--worktree', repo, '--base-ref', 'main', '--item', 'BATCH',
      '--out', out, '--stage', 'reconcile', '--reconcile-report', rep, '--manifest', m]);
    assert.equal(r.status, 1);
    const g = readJSON(path.join(out, 'gate.json'));
    const own = g.findings.find(f => f.rule === 'ownership');
    assert.ok(own);
    assert.match(own.summary, /owned by ITEM-2 but was also created by ITEM-1/);
    // Identical copies still mean it was built twice — that is the inflation
    // the byte-compare alone reports as "fine".
    assert.match(own.evidence, /byte-identical, which still means it was built twice/);
  } finally { rmrf(repo); }
});

test('reconcile stage: no collisions clears, and the agent is still asked the duplication question', () => {
  const repo = makeRepo();
  try {
    const out = path.join(repo, '.gate');
    const rep = writeJSON(repo, 'reconcile.json', {
      schemaVersion: 1, baseRef: 'main', items: [], collisions: [], divergingCount: 0, identicalCount: 0,
    });
    const r = runGate(['prepare', '--worktree', repo, '--base-ref', 'main', '--item', 'BATCH',
      '--out', out, '--stage', 'reconcile', '--reconcile-report', rep]);
    assert.equal(r.status, 0);
    const ctx = readJSON(path.join(out, 'gate-context.json'));
    assert.equal(ctx.stage, 'reconcile');
    assert.equal(ctx.agentBrief.stage, 'reconcile');
    assert.match(ctx.agentBrief.question, /SAME subsystem under different names/);
    // The rules offered to the agent are the stage's, not the whole set.
    const offered = ctx.agentBrief.rules.map(r2 => r2.id);
    assert.ok(!offered.includes('suite'));
    assert.ok(!offered.includes('secret'));
  } finally { rmrf(repo); }
});

// ------------------------------------------------------- the brief per stage

test('each stage briefs the agent with its own question and its own rule list', () => {
  const repo = makeRepo();
  try {
    const out = path.join(repo, '.gate');
    const p = writeJSON(repo, 'projection.json', projection());

    runGate(['prepare', '--worktree', repo, '--base-ref', 'main', '--item', 'ITEM-1',
      '--out', out, '--stage', 'scope', '--projection', p]);
    const scopeCtx = readJSON(path.join(out, 'gate-context.json'));
    assert.match(scopeCtx.agentBrief.question, /before any code exists/);
    assert.match(scopeCtx.agentBrief.question, /costs nothing, because nothing is written yet/);

    runGate(['prepare', '--worktree', repo, '--base-ref', 'main', '--item', 'ITEM-1', '--out', out]);
    const changeCtx = readJSON(path.join(out, 'gate-context.json'));
    assert.equal(changeCtx.stage, 'change', 'omitting --stage keeps the original behaviour');
    assert.match(changeCtx.agentBrief.question, /last step before the commit/);
    assert.ok(changeCtx.diff, 'the change stage still carries a real diff');
  } finally { rmrf(repo); }
});
