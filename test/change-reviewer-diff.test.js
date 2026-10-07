// Integration tests for the change-reviewer read-only diff reader
// (skills/change-reviewer/scripts/gate.js diff | state-hash).
//
// What is isolated here: a throwaway git repository per test, so the reader is
// exercised against real git output rather than fixtures. The allowlist tests
// call the library directly because the property under test is that a write
// subcommand fails BEFORE a process is spawned.
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
const readonly = require(path.join(SCRIPTS, 'lib', 'git-readonly.js'));
const reader = require(path.join(SCRIPTS, 'lib', 'diff-reader.js'));

function sh(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// A repo with `main` holding one commit and a feature branch checked out.
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'change-reviewer-diff-'));
  sh(dir, ['init', '-q', '-b', 'main']);
  sh(dir, ['config', 'user.email', 't@example.invalid']);
  sh(dir, ['config', 'user.name', 'test']);
  sh(dir, ['config', 'core.autocrlf', 'false']);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\n');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'keep\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'ignored.log\n');
  sh(dir, ['add', '.']);
  sh(dir, ['commit', '-q', '-m', 'base']);
  sh(dir, ['checkout', '-q', '-b', 'feat/x']);
  return dir;
}

function runGate(args, opts = {}) {
  return spawnSync('node', [GATE, ...args], { encoding: 'utf8', timeout: 20000, ...opts });
}

// ---- allowlist: structural, not behavioural -------------------------------

test('git-readonly: write subcommands are absent from the allowlist', () => {
  for (const sub of ['checkout', 'reset', 'pull', 'rebase', 'merge', 'commit', 'add', 'stash', 'push', 'worktree', 'clean', 'rm', 'mv', 'apply', 'am', 'cherry-pick', 'revert', 'switch', 'restore', 'fetch', 'clone', 'init', 'update-ref', 'symbolic-ref', 'reflog', 'gc', 'prune', 'filter-branch', 'submodule', 'notes', 'tag', 'branch', 'config']) {
    assert.ok(!readonly.ALLOWED_SUBCOMMANDS.includes(sub), `${sub} must not be reachable`);
  }
  assert.ok(Object.isFrozen(readonly.ALLOWED_SUBCOMMANDS), 'allowlist must be frozen');
});

test('git-readonly: a write subcommand throws before any process is spawned', () => {
  // A cwd that does not exist: if execFileSync ran we would see ENOENT, not
  // GitReadOnlyError. The error class proves the check happened first.
  const nowhere = path.join(os.tmpdir(), 'does-not-exist-' + Date.now());
  for (const sub of ['checkout', 'reset', 'pull', 'rebase', 'merge']) {
    assert.throws(
      () => readonly.git(nowhere, [sub, '--hard']),
      err => err instanceof readonly.GitReadOnlyError && /not in the read-only allowlist/.test(err.message),
      `${sub} must be refused structurally`,
    );
  }
});

test('git-readonly: output-redirecting and repo-repointing options are refused', () => {
  const nowhere = path.join(os.tmpdir(), 'does-not-exist-' + Date.now());
  const cases = [
    ['diff', '--output=/tmp/x'],
    ['diff', '--output', '/tmp/x'],
    ['diff', '-o', '/tmp/x'],
    ['log', '--git-dir=/elsewhere/.git'],
    ['status', '--work-tree=/elsewhere'],
    ['diff', '-c', 'core.hooksPath=/x'],
    ['show', '-C', '/elsewhere'],
  ];
  for (const args of cases) {
    assert.throws(
      () => readonly.git(nowhere, args),
      err => err instanceof readonly.GitReadOnlyError,
      `git ${args.join(' ')} must be refused`,
    );
  }
});

test('git-readonly: an allowed subcommand runs and a failing one surfaces GitCommandError', () => {
  const repo = makeRepo();
  try {
    const head = readonly.git(repo, ['rev-parse', 'HEAD']).trim();
    assert.match(head, /^[0-9a-f]{40}$/);
    assert.throws(
      () => readonly.git(repo, ['rev-parse', '--verify', '--quiet', 'no-such-ref^{commit}']),
      err => err instanceof readonly.GitCommandError && err.status === 1,
    );
  } finally { rmrf(repo); }
});

// ---- diff reader -----------------------------------------------------------

test('diff: reads modified, deleted, staged and untracked files against the merge-base', () => {
  const repo = makeRepo();
  try {
    fs.writeFileSync(path.join(repo, 'a.txt'), 'one\nTWO\nthree\n'); // modified, unstaged
    fs.unlinkSync(path.join(repo, 'b.txt'));                           // deleted
    fs.writeFileSync(path.join(repo, 'c.txt'), 'new staged\n');
    sh(repo, ['add', 'c.txt']);                                        // added, staged
    fs.mkdirSync(path.join(repo, 'src'));
    fs.writeFileSync(path.join(repo, 'src', 'd.txt'), 'untracked\nfile');  // untracked, no trailing newline
    fs.writeFileSync(path.join(repo, 'ignored.log'), 'noise');        // ignored: must not appear

    const r = runGate(['diff', '--worktree', repo, '--base-ref', 'main']);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);

    assert.equal(out.schemaVersion, 1);
    assert.equal(out.baseRef, 'main');
    assert.equal(out.baseSha, out.mergeBaseSha, 'feature branch has no commits, merge-base is main');
    assert.equal(out.coverage.mode, 'full');
    assert.equal(out.coverage.filesOmitted, 0);

    const byPath = Object.fromEntries(out.files.map(f => [f.path, f]));
    assert.deepEqual(Object.keys(byPath).sort(), ['a.txt', 'b.txt', 'c.txt', 'src/d.txt']);

    assert.equal(byPath['a.txt'].status, 'M');
    assert.equal(byPath['a.txt'].additions, 2);
    assert.equal(byPath['a.txt'].deletions, 1);
    assert.match(byPath['a.txt'].patch, /^-two$/m);
    assert.match(byPath['a.txt'].patch, /^\+TWO$/m);

    assert.equal(byPath['b.txt'].status, 'D');
    assert.equal(byPath['b.txt'].deletions, 1);

    assert.equal(byPath['c.txt'].status, 'A');
    assert.equal(byPath['c.txt'].untracked, false);

    assert.equal(byPath['src/d.txt'].status, 'A');
    assert.equal(byPath['src/d.txt'].untracked, true);
    assert.equal(byPath['src/d.txt'].additions, 2);
    assert.match(byPath['src/d.txt'].patch, /^\+\+\+ b\/src\/d\.txt$/m);
    assert.match(byPath['src/d.txt'].patch, /^\+untracked$/m);
    assert.match(byPath['src/d.txt'].patch, /^\+file$/m);

    assert.deepEqual(out.totals, { files: 4, additions: 5, deletions: 2 });
  } finally { rmrf(repo); }
});

test('diff: commits already on the base ref are not counted as the change', () => {
  const repo = makeRepo();
  try {
    // Feature commit, then main moves ahead independently.
    fs.writeFileSync(path.join(repo, 'feat.txt'), 'feature\n');
    sh(repo, ['add', 'feat.txt']);
    sh(repo, ['commit', '-q', '-m', 'feat']);
    sh(repo, ['checkout', '-q', 'main']);
    fs.writeFileSync(path.join(repo, 'main-only.txt'), 'main moved\n');
    sh(repo, ['add', 'main-only.txt']);
    sh(repo, ['commit', '-q', '-m', 'main moves']);
    sh(repo, ['checkout', '-q', 'feat/x']);

    const out = JSON.parse(runGate(['diff', '--worktree', repo, '--base-ref', 'main']).stdout);
    assert.notEqual(out.baseSha, out.mergeBaseSha);
    assert.deepEqual(out.files.map(f => f.path), ['feat.txt'], 'main-only.txt must not appear');
  } finally { rmrf(repo); }
});

test('diff: --max-patch-bytes marks omitted files and declares partial coverage, counts only', () => {
  const repo = makeRepo();
  try {
    fs.writeFileSync(path.join(repo, 'a.txt'), 'x'.repeat(50) + '\n');
    fs.writeFileSync(path.join(repo, 'big.txt'), ('line\n').repeat(500));
    const full = JSON.parse(runGate(['diff', '--worktree', repo, '--base-ref', 'main']).stdout);
    assert.equal(full.coverage.mode, 'full');

    const budget = Buffer.byteLength(full.files.find(f => f.path === 'a.txt').patch) + 10;
    const partial = JSON.parse(runGate(['diff', '--worktree', repo, '--base-ref', 'main', '--max-patch-bytes', String(budget)]).stdout);
    assert.equal(partial.coverage.mode, 'partial');
    assert.equal(partial.coverage.filesOmitted, 1);
    assert.ok(partial.coverage.bytesUsed <= budget);
    const big = partial.files.find(f => f.path === 'big.txt');
    assert.equal(big.omitted, true);
    assert.equal(big.patch, null);
    assert.equal(big.additions, 500, 'stats survive omission; only the patch is withheld');
    assert.equal(partial.files.find(f => f.path === 'a.txt').omitted, false);

    // The budget never bounds the state hash.
    assert.equal(partial.stateHash, full.stateHash);
  } finally { rmrf(repo); }
});

test('diff: binary files carry no patch and do not consume the budget', () => {
  const repo = makeRepo();
  try {
    fs.writeFileSync(path.join(repo, 'blob.bin'), Buffer.from([0, 1, 2, 3, 0, 255]));
    const out = JSON.parse(runGate(['diff', '--worktree', repo, '--base-ref', 'main']).stdout);
    const bin = out.files.find(f => f.path === 'blob.bin');
    assert.equal(bin.binary, true);
    assert.equal(bin.patch, null);
    assert.equal(bin.omitted, false);
    assert.equal(out.coverage.mode, 'full');
    assert.equal(out.coverage.bytesUsed, 0);
  } finally { rmrf(repo); }
});

test('diff: reading never modifies the worktree, index or HEAD', () => {
  const repo = makeRepo();
  try {
    fs.writeFileSync(path.join(repo, 'a.txt'), 'changed\n');
    fs.writeFileSync(path.join(repo, 'n.txt'), 'untracked\n');
    const before = {
      head: sh(repo, ['rev-parse', 'HEAD']),
      status: sh(repo, ['status', '--porcelain']),
      index: sh(repo, ['write-tree']),
    };
    assert.equal(runGate(['diff', '--worktree', repo, '--base-ref', 'main']).status, 0);
    assert.equal(runGate(['state-hash', '--worktree', repo, '--base-ref', 'main']).status, 0);
    const after = {
      head: sh(repo, ['rev-parse', 'HEAD']),
      status: sh(repo, ['status', '--porcelain']),
      index: sh(repo, ['write-tree']),
    };
    assert.deepEqual(after, before);
  } finally { rmrf(repo); }
});

test('diff: --out writes the JSON to a file and keeps stdout empty', () => {
  const repo = makeRepo();
  try {
    const outFile = path.join(repo, '.gate-out', 'nested', 'diff.json');
    const r = runGate(['diff', '--worktree', repo, '--base-ref', 'main', '--out', outFile]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
    const parsed = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    assert.equal(parsed.baseRef, 'main');
  } finally { rmrf(repo); }
});

// ---- state hash ------------------------------------------------------------

test('state-hash: stable across reads, changes with any edit, staged or untracked', () => {
  const repo = makeRepo();
  try {
    const h = () => runGate(['state-hash', '--worktree', repo, '--base-ref', 'main']).stdout.trim();
    const h0 = h();
    assert.match(h0, /^[0-9a-f]{64}$/);
    assert.equal(h(), h0, 'same state, same hash');

    fs.writeFileSync(path.join(repo, 'a.txt'), 'one\ntwo\nthree\n');
    const h1 = h();
    assert.notEqual(h1, h0, 'unstaged edit changes the hash');

    sh(repo, ['add', 'a.txt']);
    assert.equal(h(), h1, 'staging the same content does not change what would be committed');

    fs.writeFileSync(path.join(repo, 'new.txt'), 'u\n');
    const h2 = h();
    assert.notEqual(h2, h1, 'a new untracked file changes the hash');

    fs.writeFileSync(path.join(repo, 'new.txt'), 'v\n');
    assert.notEqual(h(), h2, 'editing an untracked file changes the hash');
  } finally { rmrf(repo); }
});

test('state-hash: library readStateHash equals the diff stateHash', () => {
  const repo = makeRepo();
  try {
    fs.writeFileSync(path.join(repo, 'a.txt'), 'edit\n');
    const full = reader.readDiff({ worktree: repo, baseRef: 'main' });
    assert.equal(reader.readStateHash({ worktree: repo, baseRef: 'main' }), full.stateHash);
  } finally { rmrf(repo); }
});

// ---- exit codes ------------------------------------------------------------

test('exit 2: missing flags, unknown subcommand, unresolvable base ref, bad budget', () => {
  const repo = makeRepo();
  try {
    let r = runGate(['diff', '--worktree', repo]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--base-ref is required/);

    r = runGate(['frobnicate']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown subcommand/);

    r = runGate(['diff', '--worktree', repo, '--base-ref', 'no/such/ref']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /does not resolve to a commit/);

    r = runGate(['diff', '--worktree', repo, '--base-ref', 'main', '--max-patch-bytes', '-5']);
    assert.equal(r.status, 2);

    r = runGate(['diff', '--worktree', repo, '--base-ref', 'main', 'stray']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unexpected argument/);
  } finally { rmrf(repo); }
});

test('exit 4: a directory that is not a git worktree is inconclusive, never cleared', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'change-reviewer-notgit-'));
  try {
    // GIT_CEILING_DIRECTORIES stops discovery from climbing into an enclosing repo.
    const r = runGate(['diff', '--worktree', dir, '--base-ref', 'main'], {
      env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(dir) },
    });
    assert.equal(r.status, 4);
    assert.match(r.stderr, /inconclusive: not a readable git worktree/);
    assert.equal(r.stdout, '');
  } finally { rmrf(dir); }
});

test('exit 4: a repository without a HEAD commit is inconclusive', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'change-reviewer-empty-'));
  try {
    sh(dir, ['init', '-q', '-b', 'main']);
    const r = runGate(['diff', '--worktree', dir, '--base-ref', 'main']);
    assert.equal(r.status, 4);
    assert.match(r.stderr, /inconclusive: worktree has no HEAD commit/);
  } finally { rmrf(dir); }
});

test('help: no arguments prints usage and exits 0', () => {
  const r = runGate([]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /gate\.js diff\s+--worktree/);
});
