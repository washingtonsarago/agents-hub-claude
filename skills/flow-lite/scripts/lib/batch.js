'use strict';
// batch — the three batch-level controls of /flow-lite.
//
//   validateManifest  the ownership manifest is well-formed: unique keys,
//                     every owner is an item, dependsOn points at items.
//   mergeOrder        topological order over dependsOn; a cycle fails the
//                     batch before any worktree exists.
//   reconcile         across all item branches at once: files created by
//                     more than one item, and whether their content diverges.
//                     Each PR looks mergeable alone; the cost only surfaces at
//                     the first merge, so this runs before any PR is opened.
//
// Git access goes through the change-reviewer read-only executor: this file
// cannot reach a write subcommand either.

const path = require('path');
const { git, GitCommandError } = require('../../../change-reviewer/scripts/lib/git-readonly');

class ManifestError extends Error {
  constructor(message) { super(message); this.name = 'ManifestError'; }
}

function validateManifest(m) {
  const errors = [];
  if (!m || typeof m !== 'object') return ['manifest must be an object'];
  if (m.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!Array.isArray(m.items) || !m.items.length) errors.push('items must be a non-empty array');
  const keys = new Set();
  for (const [i, it] of (m.items || []).entries()) {
    if (!it || typeof it.key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(it.key)) { errors.push(`items[${i}].key must be a string like ABC-123`); continue; }
    if (keys.has(it.key)) errors.push(`duplicate item key ${it.key}`);
    keys.add(it.key);
    if (it.dependsOn !== undefined && !Array.isArray(it.dependsOn)) errors.push(`items[${i}].dependsOn must be an array`);
    if (it.budget !== undefined) {
      for (const k of ['maxFiles', 'maxLines']) {
        if (it.budget[k] !== undefined && (!Number.isInteger(it.budget[k]) || it.budget[k] < 0)) errors.push(`items[${i}].budget.${k} must be a non-negative integer`);
      }
    }
    if (it.allowedPaths !== undefined && !(Array.isArray(it.allowedPaths) && it.allowedPaths.every(s => typeof s === 'string'))) errors.push(`items[${i}].allowedPaths must be an array of globs`);
  }
  for (const it of m.items || []) {
    for (const d of it.dependsOn || []) {
      if (!keys.has(d)) errors.push(`item ${it.key} depends on unknown item ${d}`);
      if (d === it.key) errors.push(`item ${it.key} depends on itself`);
    }
  }
  if (m.ownership !== undefined) {
    if (!m.ownership || typeof m.ownership !== 'object' || Array.isArray(m.ownership)) errors.push('ownership must be an object { "<path>": "<item key>" }');
    else {
      for (const [p, owner] of Object.entries(m.ownership)) {
        if (typeof owner !== 'string' || !keys.has(owner)) errors.push(`ownership["${p}"] = "${owner}" is not an item of this batch`);
        if (p.startsWith('/') || p.includes('\\')) errors.push(`ownership path "${p}" must be repository-relative with forward slashes`);
      }
    }
  }
  return errors;
}

// Kahn's algorithm. Returns { order, cycle } where cycle lists the keys that
// could not be ordered (a cycle or nodes depending on one).
function mergeOrder(m) {
  const items = m.items;
  const indeg = new Map(items.map(i => [i.key, 0]));
  const out = new Map(items.map(i => [i.key, []]));
  for (const it of items) {
    for (const d of it.dependsOn || []) {
      indeg.set(it.key, indeg.get(it.key) + 1);
      out.get(d).push(it.key);
    }
  }
  const ready = items.map(i => i.key).filter(k => indeg.get(k) === 0).sort();
  const order = [];
  while (ready.length) {
    const k = ready.shift();
    order.push(k);
    for (const n of out.get(k).sort()) {
      indeg.set(n, indeg.get(n) - 1);
      if (indeg.get(n) === 0) { ready.push(n); ready.sort(); }
    }
  }
  const cycle = items.map(i => i.key).filter(k => !order.includes(k)).sort();
  return { order, cycle };
}

function branchFor(item, template) {
  if (item.branch) return item.branch;
  return (template || 'feat/{key}').replace('{key}', item.key.toLowerCase());
}

function createdFiles(repo, baseRef, branch) {
  let out;
  try {
    out = git(repo, ['diff', '--name-only', '--diff-filter=A', '--no-renames', '-z', `${baseRef}...${branch}`]);
  } catch (e) {
    if (e instanceof GitCommandError) throw new ManifestError(`cannot diff ${baseRef}...${branch}: ${e.stderr || e.message}`);
    throw e;
  }
  return out.split('\0').filter(Boolean);
}

function blobId(repo, branch, filePath) {
  try { return git(repo, ['rev-parse', '--verify', '--quiet', `${branch}:${filePath}`]).trim(); } catch { return null; }
}

// Returns { items: [{key, branch, created}], collisions: [{path, items, blobs, diverging}], divergingCount }
function reconcile({ repo, baseRef, manifest, branchTemplate }) {
  const byPath = new Map();
  const items = [];
  for (const it of manifest.items) {
    const branch = branchFor(it, branchTemplate);
    const created = createdFiles(repo, baseRef, branch);
    items.push({ key: it.key, branch, created: created.length });
    for (const p of created) {
      if (!byPath.has(p)) byPath.set(p, []);
      byPath.get(p).push({ key: it.key, branch });
    }
  }
  const collisions = [];
  for (const [p, creators] of [...byPath.entries()].sort()) {
    if (creators.length < 2) continue;
    const blobs = creators.map(c => ({ key: c.key, blob: blobId(repo, c.branch, p) }));
    const distinct = new Set(blobs.map(b => b.blob));
    const owner = manifest.ownership && manifest.ownership[p] ? manifest.ownership[p] : null;
    collisions.push({
      path: p,
      items: creators.map(c => c.key),
      owner,
      diverging: distinct.size > 1,
      blobs: blobs.map(b => ({ key: b.key, blob: b.blob ? b.blob.slice(0, 12) : null })),
    });
  }
  return {
    schemaVersion: 1,
    baseRef,
    items,
    collisions,
    divergingCount: collisions.filter(c => c.diverging).length,
    identicalCount: collisions.filter(c => !c.diverging).length,
  };
}

module.exports = { validateManifest, mergeOrder, reconcile, branchFor, ManifestError };
