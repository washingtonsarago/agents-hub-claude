'use strict';
// profile — everything team-specific enters the reviewer through here.
//
// The core knows no organisation, tracker key, stack or machine path. A
// profile is a JSON file resolved in this order:
//   1. --profile <path>
//   2. <worktree>/.change-reviewer.json  → { "profile": "<path or name>" }
//   3. <worktree>/<LEGACY_PROFILE_FILE>   (the pre-rename name, see legacy.js)
//   4. profiles/default.json shipped with this skill
// A name (no slash, no extension) refers to profiles/<name>.json.
//
// Steps 2 and 3 are one choice, not a merge: when the new file exists the
// legacy one is not read at all, even if the new file has no `profile` key
// (that falls to default, as it always did) or is invalid JSON (ProfileError,
// fail-closed, without trying the legacy file). A repo that created the new
// file meant the new file. Having both is reported, never silently resolved:
// the legacy file may point at a stricter profile that is now ignored.

const fs = require('fs');
const path = require('path');
const { LEGACY_PROFILE_FILE } = require('./legacy');

const PROFILES_DIR = path.join(__dirname, '..', '..', 'profiles');
const CAPABILITIES = Object.freeze(['manifest', 'suiteResult', 'tracker', 'diffCoverage']);

class ProfileError extends Error {
  constructor(message) { super(message); this.name = 'ProfileError'; }
}

const DEFAULTS = Object.freeze({
  schemaVersion: 1,
  name: 'default',
  version: '1.0.0',
  locale: 'en',
  requiredCapabilities: [],
  remediation: { maxIterations: 2 },
  budget: { maxFiles: 20, maxLines: 600, maxPatchBytes: 400000 },
  rules: [],
  severity: {},
  overrideRequiresSecondApprover: [],
  secretPatterns: [],
  tracker: { adapter: 'none' },
});

const PROFILE_FILE = '.change-reviewer.json';

// Returns { path, warnings }. `warnings` carries text for the operator; it is
// never part of gate.json or gate.md (their format is out of scope).
function resolveProfile(worktree, explicit) {
  if (explicit) return { path: byNameOrPath(explicit, worktree), warnings: [] };
  const warnings = [];
  const current = path.join(worktree, PROFILE_FILE);
  const legacy = path.join(worktree, LEGACY_PROFILE_FILE);
  const hasCurrent = fs.existsSync(current);
  const hasLegacy = fs.existsSync(legacy);
  const chosenName = hasCurrent ? PROFILE_FILE : hasLegacy ? LEGACY_PROFILE_FILE : null;
  let resolved = path.join(PROFILES_DIR, 'default.json');
  if (chosenName) {
    const chosen = hasCurrent ? current : legacy;
    let cfg;
    try { cfg = JSON.parse(fs.readFileSync(chosen, 'utf8')); } catch (e) {
      throw new ProfileError(`${chosenName} is not valid JSON: ${e.message}`);
    }
    if (cfg && cfg.profile) resolved = byNameOrPath(String(cfg.profile), worktree);
  }
  if (hasCurrent && hasLegacy) {
    warnings.push(`both ${PROFILE_FILE} and ${LEGACY_PROFILE_FILE} (legacy) exist; using ${PROFILE_FILE} → profile ${resolved}; the legacy file was ignored`);
  }
  return { path: resolved, warnings };
}

function resolveProfilePath(worktree, explicit) {
  return resolveProfile(worktree, explicit).path;
}

function byNameOrPath(ref, worktree) {
  if (/^[A-Za-z0-9_-]+$/.test(ref)) return path.join(PROFILES_DIR, `${ref}.json`);
  return path.resolve(worktree, ref);
}

function loadProfile({ worktree, profilePath = null }) {
  const { path: p, warnings } = resolveProfile(worktree, profilePath);
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch {
    throw new ProfileError(`profile not found: ${p}`);
  }
  let obj;
  try { obj = JSON.parse(raw); } catch (e) {
    throw new ProfileError(`profile is not valid JSON (${p}): ${e.message}`);
  }
  const prof = {
    ...DEFAULTS,
    ...obj,
    remediation: { ...DEFAULTS.remediation, ...(obj.remediation || {}) },
    budget: { ...DEFAULTS.budget, ...(obj.budget || {}) },
    tracker: { ...DEFAULTS.tracker, ...(obj.tracker || {}) },
    path: p,
  };
  // Not enumerable: the profile object is copied field by field into
  // gate-context.json, and a resolution note must never reach the verdict.
  Object.defineProperty(prof, 'warnings', { value: warnings, enumerable: false });
  validateProfile(prof);
  prof.secretPatterns = (prof.secretPatterns || []).map((s, i) => {
    try { return { id: `profile-${i + 1}`, re: new RegExp(s) }; } catch (e) {
      throw new ProfileError(`secretPatterns[${i}] is not a valid regular expression: ${e.message}`);
    }
  });
  return prof;
}

function validateProfile(p) {
  if (p.schemaVersion !== 1) throw new ProfileError(`unsupported profile schemaVersion ${p.schemaVersion}`);
  if (typeof p.name !== 'string' || !p.name) throw new ProfileError('profile.name is required');
  if (typeof p.version !== 'string' || !p.version) throw new ProfileError('profile.version is required');
  if (!Array.isArray(p.requiredCapabilities)) throw new ProfileError('profile.requiredCapabilities must be an array');
  for (const c of p.requiredCapabilities) {
    if (!CAPABILITIES.includes(c)) throw new ProfileError(`unknown required capability "${c}"`);
  }
  if (!Number.isInteger(p.remediation.maxIterations) || p.remediation.maxIterations < 0) {
    throw new ProfileError('profile.remediation.maxIterations must be a non-negative integer');
  }
  for (const k of ['maxFiles', 'maxLines', 'maxPatchBytes']) {
    if (p.budget[k] !== null && (!Number.isInteger(p.budget[k]) || p.budget[k] < 0)) {
      throw new ProfileError(`profile.budget.${k} must be a non-negative integer or null`);
    }
  }
  if (!Array.isArray(p.rules)) throw new ProfileError('profile.rules must be an array');
  if (!Array.isArray(p.overrideRequiresSecondApprover)) throw new ProfileError('profile.overrideRequiresSecondApprover must be an array');
  if (!['none', 'fixture', 'command'].includes(p.tracker.adapter)) {
    throw new ProfileError(`profile.tracker.adapter must be none|fixture|command (got "${p.tracker.adapter}")`);
  }
}

module.exports = { loadProfile, resolveProfile, resolveProfilePath, PROFILE_FILE, validateProfile, ProfileError, PROFILES_DIR, CAPABILITIES, DEFAULTS };
