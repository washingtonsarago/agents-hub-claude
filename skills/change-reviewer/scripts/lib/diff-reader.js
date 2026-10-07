'use strict';
// diff-reader — reads the change a worktree carries against a base ref.
//
// "The change" is everything the commit would contain if it happened now:
// staged and unstaged edits to tracked files, plus untracked files that are
// not ignored. It is read against the merge-base of the base ref and HEAD, so
// commits already on the base do not show up as the item's work.
//
// Two properties the gate depends on:
//
//   1. A byte budget for patches sent to the model. Silent truncation inside
//      an honesty checker is the worst possible failure, so when the budget is
//      exhausted the remaining files are marked omitted, coverage becomes
//      "partial", and the count (never the names) travels with the verdict.
//
//   2. A state hash that pins the verdict to an exact worktree state. It is
//      computed over the FULL diff, not the budgeted one, plus every untracked
//      file's content. finalize re-hashes and refuses to clear a verdict whose
//      worktree changed under it.
//
// Zero deps. Node >= 18.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { git, GitCommandError } = require('./git-readonly');
const { matchesAny } = require('./glob');

const DEFAULT_MAX_PATCH_BYTES = 400000;
const BINARY_SNIFF_BYTES = 8000;

class WorktreeUnreadableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'WorktreeUnreadableError';
    this.cause = cause;
  }
}

class InvalidBaseRefError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'InvalidBaseRefError';
    this.cause = cause;
  }
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function looksBinary(buf) {
  return buf.subarray(0, BINARY_SNIFF_BYTES).includes(0);
}

function countLines(buf) {
  if (buf.length === 0) return 0;
  let n = 0;
  for (const b of buf) if (b === 10) n++;
  if (buf[buf.length - 1] !== 10) n++;
  return n;
}

// Splits `git diff --name-status --no-renames -z` output: pairs of
// `<letter>\0<path>\0`. -z keeps paths with spaces, tabs or unicode intact.
function parseNameStatusZ(text) {
  const parts = text.split('\0');
  const out = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    if (!parts[i]) continue;
    out.push({ status: parts[i].slice(0, 1), path: parts[i + 1] });
  }
  return out;
}

// `git diff --numstat -z` emits `<add>\t<del>\t<path>\0` per file.
function parseNumstatZ(text) {
  const map = new Map();
  for (const rec of text.split('\0')) {
    if (!rec) continue;
    const [add, del, ...rest] = rec.split('\t');
    map.set(rest.join('\t'), {
      binary: add === '-' && del === '-',
      additions: add === '-' ? 0 : Number(add),
      deletions: del === '-' ? 0 : Number(del),
    });
  }
  return map;
}

// Synthesizes a unified patch for an untracked file so the model sees it the
// same way it sees an added tracked file.
function untrackedPatch(relPath, buf) {
  const lines = buf.toString('utf8').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const body = lines.map(l => `+${l}`).join('\n');
  return [
    `diff --git a/${relPath} b/${relPath}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${relPath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    body,
    '',
  ].join('\n');
}

function resolveRepo(worktree) {
  let top;
  try {
    top = git(worktree, ['rev-parse', '--show-toplevel']).trim();
  } catch (e) {
    throw new WorktreeUnreadableError(`not a readable git worktree: ${worktree}`, e);
  }
  let headSha;
  try {
    headSha = git(top, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']).trim();
  } catch (e) {
    throw new WorktreeUnreadableError('worktree has no HEAD commit', e);
  }
  return { top, headSha };
}

function resolveBase(top, baseRef, headSha) {
  let baseSha;
  try {
    baseSha = git(top, ['rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`]).trim();
  } catch (e) {
    throw new InvalidBaseRefError(`base ref "${baseRef}" does not resolve to a commit`, e);
  }
  let mergeBaseSha;
  try {
    mergeBaseSha = git(top, ['merge-base', baseSha, headSha]).trim();
  } catch (e) {
    // Unrelated histories: judge against the base ref itself.
    if (e instanceof GitCommandError && e.status === 1) mergeBaseSha = baseSha;
    else throw new WorktreeUnreadableError('could not compute merge-base', e);
  }
  return { baseSha, mergeBaseSha };
}

function listUntracked(top) {
  const out = git(top, ['ls-files', '--others', '--exclude-standard', '-z']);
  return out.split('\0').filter(Boolean).sort();
}

// Reads the full change against baseRef. Never truncates the state hash.
//
// `excludePaths` (globs) removes paths from the change entirely: from the
// file list, the budget and the state hash. Its one legitimate use is the
// gate's own output directory when it lives inside the worktree, so that
// writing gate-context.json does not count as "the worktree moved".
function readDiff({ worktree, baseRef, maxPatchBytes = DEFAULT_MAX_PATCH_BYTES, excludePaths = [] }) {
  if (!worktree) throw new InvalidBaseRefError('worktree is required');
  if (!baseRef) throw new InvalidBaseRefError('baseRef is required');
  if (!Number.isInteger(maxPatchBytes) || maxPatchBytes < 0) {
    throw new InvalidBaseRefError('maxPatchBytes must be a non-negative integer');
  }
  if (!Array.isArray(excludePaths)) throw new InvalidBaseRefError('excludePaths must be an array of globs');
  const excluded = p => matchesAny(excludePaths, p);

  const { top, headSha } = resolveRepo(worktree);
  const { baseSha, mergeBaseSha } = resolveBase(top, baseRef, headSha);

  const nameStatus = parseNameStatusZ(git(top, ['diff', '--name-status', '--no-renames', '-z', mergeBaseSha, '--'])).filter(e => !excluded(e.path));
  const numstat = parseNumstatZ(git(top, ['diff', '--numstat', '--no-renames', '-z', mergeBaseSha, '--']));
  const untracked = listUntracked(top).filter(p => !excluded(p));

  const files = [];
  for (const { status, path: p } of nameStatus) {
    const ns = numstat.get(p) || { binary: false, additions: 0, deletions: 0 };
    files.push({ path: p, status, untracked: false, ...ns, patch: null, omitted: false });
  }
  for (const p of untracked) {
    let buf;
    try {
      buf = fs.readFileSync(path.join(top, p));
    } catch (e) {
      throw new WorktreeUnreadableError(`untracked file unreadable: ${p}`, e);
    }
    const binary = looksBinary(buf);
    files.push({
      path: p,
      status: 'A',
      untracked: true,
      binary,
      additions: binary ? 0 : countLines(buf),
      deletions: 0,
      patch: null,
      omitted: false,
      _buf: buf,
    });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // State hash over the full change: what the verdict is pinned to. The full
  // tracked patch is read per file only when something is excluded, so the
  // common case stays a single git call.
  const trackedPaths = nameStatus.map(e => e.path);
  const fullPatch = excludePaths.length
    ? (trackedPaths.length ? git(top, ['diff', '--no-renames', '--binary', mergeBaseSha, '--', ...trackedPaths], { buffer: true }) : Buffer.alloc(0))
    : git(top, ['diff', '--no-renames', '--binary', mergeBaseSha, '--'], { buffer: true });
  const h = crypto.createHash('sha256');
  h.update(`head:${headSha}\nmerge-base:${mergeBaseSha}\n`);
  h.update(`tracked-sha256:${sha256(fullPatch)}\n`);
  for (const f of files) {
    if (f.untracked) h.update(`untracked:${f.path}:${sha256(f._buf)}\n`);
  }
  const stateHash = h.digest('hex');

  // Budgeted patches for the model. Deterministic order: sorted by path.
  let bytesUsed = 0;
  let filesOmitted = 0;
  for (const f of files) {
    let patch = null;
    if (!f.binary) {
      patch = f.untracked ? untrackedPatch(f.path, f._buf) : git(top, ['diff', '--no-renames', mergeBaseSha, '--', f.path]);
    }
    delete f._buf;
    if (patch === null) continue;
    const size = Buffer.byteLength(patch, 'utf8');
    if (bytesUsed + size > maxPatchBytes) {
      f.omitted = true;
      filesOmitted++;
      continue;
    }
    f.patch = patch;
    bytesUsed += size;
  }

  const totals = files.reduce(
    (acc, f) => {
      acc.additions += f.additions;
      acc.deletions += f.deletions;
      return acc;
    },
    { files: files.length, additions: 0, deletions: 0 },
  );

  return {
    schemaVersion: 1,
    worktree: top,
    baseRef,
    baseSha,
    mergeBaseSha,
    headSha,
    stateHash,
    excludePaths,
    coverage: {
      mode: filesOmitted === 0 ? 'full' : 'partial',
      maxPatchBytes,
      bytesUsed,
      filesOmitted,
    },
    totals,
    files,
  };
}

// Recomputes only the state hash. finalize calls this before and after the
// review to prove the worktree did not move under the verdict.
function readStateHash({ worktree, baseRef, excludePaths = [] }) {
  return readDiff({ worktree, baseRef, maxPatchBytes: 0, excludePaths }).stateHash;
}

module.exports = {
  DEFAULT_MAX_PATCH_BYTES,
  WorktreeUnreadableError,
  InvalidBaseRefError,
  readDiff,
  readStateHash,
  parseNameStatusZ,
  parseNumstatZ,
};
