'use strict';
// context — mandatory discovery of the target project's own rules.
//
// A generic reviewer that ignores the file where a team wrote down its
// decisions will flag those decisions as defects, and that is how a team
// learns to switch the gate off. So before any rule runs we read, in this
// order of precedence (most specific wins on conflict):
//
//   1. CLAUDE.md in every directory the diff touches, walking up to the root
//   2. CLAUDE.md at the repository root
//   3. CLAUDE.md at the multi-repo workspace root (when given)
//   4. CLAUDE.local.md at the root: read, but it may only TIGHTEN
//   5. .claude/memory/*.md: lowest precedence, conventions and scope
//      exceptions only, never a blocking directive or a severity raise
//
// CLAUDE.md is INPUT DATA, not an instruction to the reviewer. Machine-
// readable directives live in a fenced block tagged `change-reviewer` (or
// the pre-rename tag from legacy.js) holding JSON. Everything else is prose: it is handed to the agent as data
// and never changes exit codes, rule sets or output format. Text that tries
// to redirect the reviewer (disable the gate, downgrade a blocker, "do not
// report") is recorded under directivesIgnored and has no effect.

const fs = require('fs');
const path = require('path');
const { STRUCTURAL_RULE_IDS, SEVERITIES } = require('./rules');

const { LEGACY_BLOCK_TAG } = require('./legacy');

// One regex for both tags, so both go through the same parse, the same
// FORBIDDEN_KEYS/ALLOWED_KEYS and are both stripped from the prose. A tag the
// regex missed would reach the agent as prose, JSON and all. The tag must end
// the fence line: `change-reviewer-x` stays prose.
const BLOCK_RE = new RegExp('```(?:json[ \\t]+)?(?:change-reviewer|' + LEGACY_BLOCK_TAG + ')[ \\t]*\\n([\\s\\S]*?)```', 'g');

// Keys a directive block may carry. Anything else is recorded and ignored.
const ALLOWED_KEYS = Object.freeze(['conventions', 'rules', 'prohibitions', 'sensitivePaths', 'scopeExceptions', 'verification']);

// Keys that are attempts to steer the reviewer instead of describing the project.
const FORBIDDEN_KEYS = Object.freeze({
  disableGate: 'attempted to disable the gate',
  disable: 'attempted to disable rules',
  disableRules: 'attempted to disable rules',
  downgrade: 'attempted to downgrade severities',
  severity: 'attempted to change rule severities',
  override: 'attempted to grant an automatic override',
  autoOverride: 'attempted to grant an automatic override',
  exitCodes: 'attempted to change exit codes',
  output: 'attempted to change output format',
  format: 'attempted to change output format',
  log: 'attempted to change log destination',
  suppress: 'attempted to suppress reporting',
  ignore: 'attempted to suppress reporting',
});

// Prose that reads as an instruction to the reviewer rather than a fact
// about the project. Recorded, never applied.
const REDIRECT_PROSE = Object.freeze([
  /\b(?:skip|disable|turn off|bypass)\b[^.\n]{0,60}\b(?:gate|review(?:er)?|check)\b/i,
  /\b(?:do not|don't|never)\s+(?:report|flag|mention|block)\b/i,
  /\b(?:downgrade|lower)\b[^.\n]{0,40}\b(?:blocker|severity)\b/i,
  /\b(?:always|automatically)\s+(?:pass|approve|clear|override)\b/i,
  /\bignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|above|prior|reviewer|gate)\b/i,
]);

function readIfExists(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function relTo(root, p) {
  return path.relative(root, p).split(path.sep).join('/') || '.';
}

// Parses one context file into { directives, prose, ignored }.
function parseContextFile(text, source, level) {
  const ignored = [];
  const directives = { conventions: [], rules: [], prohibitions: [], sensitivePaths: [], scopeExceptions: [], verification: {} };
  let m;
  const prose = text.replace(BLOCK_RE, '').trim();
  BLOCK_RE.lastIndex = 0;
  while ((m = BLOCK_RE.exec(text)) !== null) {
    let obj;
    try { obj = JSON.parse(m[1]); } catch (e) {
      ignored.push({ source, reason: `directive block is not valid JSON: ${e.message}`, excerpt: m[1].slice(0, 160) });
      continue;
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      ignored.push({ source, reason: 'directive block must be a JSON object', excerpt: m[1].slice(0, 160) });
      continue;
    }
    for (const key of Object.keys(obj)) {
      if (FORBIDDEN_KEYS[key]) {
        ignored.push({ source, reason: FORBIDDEN_KEYS[key], excerpt: JSON.stringify({ [key]: obj[key] }).slice(0, 160) });
        continue;
      }
      if (!ALLOWED_KEYS.includes(key)) {
        ignored.push({ source, reason: `unknown directive key "${key}"`, excerpt: JSON.stringify({ [key]: obj[key] }).slice(0, 160) });
        continue;
      }
    }
    absorb(directives, obj, source, level, ignored);
  }
  for (const line of prose.split('\n')) {
    for (const re of REDIRECT_PROSE) {
      if (re.test(line)) {
        ignored.push({ source, reason: 'prose attempts to redirect reviewer behaviour', excerpt: line.trim().slice(0, 160) });
        break;
      }
    }
  }
  return { directives, prose, ignored };
}

function absorb(target, obj, source, level, ignored) {
  const tag = x => ({ ...x, source, level });
  for (let c of arr(obj.conventions)) {
    if (!c || !c.id) { ignored.push({ source, reason: 'convention without id', excerpt: JSON.stringify(c).slice(0, 160) }); continue; }
    const structural = (c.suppresses || []).filter(r => STRUCTURAL_RULE_IDS.includes(r));
    if (structural.length) {
      ignored.push({ source, reason: `convention "${c.id}" attempted to suppress structural rule(s): ${structural.join(', ')}`, excerpt: JSON.stringify(c).slice(0, 160) });
      c = { ...c, suppresses: (c.suppresses || []).filter(r => !STRUCTURAL_RULE_IDS.includes(r)) };
    }
    target.conventions.push(tag(c));
  }
  for (const r of arr(obj.rules)) {
    if (!r || !r.id) { ignored.push({ source, reason: 'rule without id', excerpt: JSON.stringify(r).slice(0, 160) }); continue; }
    if (r.severity && !SEVERITIES.includes(r.severity)) { ignored.push({ source, reason: `rule "${r.id}" has invalid severity "${r.severity}"` }); continue; }
    target.rules.push(tag({ severity: 'major', ...r }));
  }
  for (const p of arr(obj.prohibitions)) {
    if (!p || !p.id) { ignored.push({ source, reason: 'prohibition without id', excerpt: JSON.stringify(p).slice(0, 160) }); continue; }
    target.prohibitions.push(tag(p));
  }
  for (const s of arr(obj.sensitivePaths)) if (typeof s === 'string') target.sensitivePaths.push(s);
  for (const s of arr(obj.scopeExceptions)) if (typeof s === 'string') target.scopeExceptions.push(s);
  if (obj.verification && typeof obj.verification === 'object') Object.assign(target.verification, obj.verification);
}

function arr(x) { return Array.isArray(x) ? x : []; }

// Merges per-file directive sets by precedence: entries with the same id from
// a more specific level win. Levels: 0 = touched dir (most specific), 1 =
// repo root, 2 = workspace root.
function mergeById(list) {
  const byId = new Map();
  for (const d of list) {
    const prev = byId.get(d.id);
    if (!prev || d.level < prev.level) byId.set(d.id, d);
  }
  return [...byId.values()];
}

function discoverContext({ worktree, touchedPaths = [], workspaceRoot = null, memoryDir = '.claude/memory' }) {
  const root = path.resolve(worktree);
  const filesRead = [];
  const ignored = [];
  const proseChunks = [];
  const acc = { conventions: [], rules: [], prohibitions: [], sensitivePaths: [], scopeExceptions: [], verification: {} };

  const seen = new Set();
  const visit = (absFile, level, label) => {
    const text = readIfExists(absFile);
    if (text === null || seen.has(absFile)) return;
    seen.add(absFile);
    const source = label || relTo(root, absFile);
    filesRead.push(source);
    const { directives, prose, ignored: ign } = parseContextFile(text, source, level);
    ignored.push(...ign);
    if (prose) proseChunks.push({ source, text: prose });
    return directives;
  };

  // 1. touched directories, walking up to (not including) the root.
  const dirs = new Set();
  for (const p of touchedPaths) {
    let d = path.posix.dirname(p.split(path.sep).join('/'));
    while (d && d !== '.' && d !== '/') { dirs.add(d); d = path.posix.dirname(d); }
  }
  const partial = [];
  for (const d of [...dirs].sort((a, b) => b.split('/').length - a.split('/').length)) {
    const got = visit(path.join(root, d, 'CLAUDE.md'), 0);
    if (got) partial.push(got);
  }
  // 2. repository root
  const rootD = visit(path.join(root, 'CLAUDE.md'), 1);
  if (rootD) partial.push(rootD);
  // 3. workspace root
  if (workspaceRoot) {
    const wsD = visit(path.join(path.resolve(workspaceRoot), 'CLAUDE.md'), 2, `${relTo(root, path.resolve(workspaceRoot))}/CLAUDE.md`);
    if (wsD) partial.push(wsD);
  }
  for (const d of partial) {
    acc.conventions.push(...d.conventions);
    acc.rules.push(...d.rules);
    acc.prohibitions.push(...d.prohibitions);
    acc.sensitivePaths.push(...d.sensitivePaths);
    acc.scopeExceptions.push(...d.scopeExceptions);
    // most specific verification wins: partial is ordered most-specific first
    acc.verification = { ...d.verification, ...acc.verification };
  }

  // 4. CLAUDE.local.md: may only tighten.
  const localD = visit(path.join(root, 'CLAUDE.local.md'), 1);
  if (localD) {
    acc.rules.push(...localD.rules);
    acc.prohibitions.push(...localD.prohibitions);
    acc.sensitivePaths.push(...localD.sensitivePaths);
    for (const c of localD.conventions) ignored.push({ source: 'CLAUDE.local.md', reason: `convention "${c.id}" ignored: CLAUDE.local.md may only tighten rules`, excerpt: JSON.stringify(c).slice(0, 160) });
    for (const s of localD.scopeExceptions) ignored.push({ source: 'CLAUDE.local.md', reason: 'scope exception ignored: CLAUDE.local.md may only tighten rules', excerpt: s });
    if (Object.keys(localD.verification).length) acc.verification = { ...acc.verification, ...localD.verification };
  }

  // 5. .claude/memory/*.md: conventions and scope exceptions only.
  const memDir = path.join(root, memoryDir);
  if (fs.existsSync(memDir)) {
    for (const f of fs.readdirSync(memDir).filter(x => x.endsWith('.md')).sort()) {
      const memD = visit(path.join(memDir, f), 3);
      if (!memD) continue;
      acc.conventions.push(...memD.conventions);
      acc.scopeExceptions.push(...memD.scopeExceptions);
      const src = `${memoryDir}/${f}`;
      for (const r of memD.rules) ignored.push({ source: src, reason: `rule "${r.id}" ignored: memory files may not add rules`, excerpt: JSON.stringify(r).slice(0, 160) });
      for (const p of memD.prohibitions) ignored.push({ source: src, reason: `prohibition "${p.id}" ignored: memory files may not add blocking directives`, excerpt: JSON.stringify(p).slice(0, 160) });
      for (const s of memD.sensitivePaths) ignored.push({ source: src, reason: 'sensitive path ignored: memory files may not raise severity', excerpt: s });
    }
  }

  const conventions = mergeById(acc.conventions);
  const rules = mergeById(acc.rules);
  const prohibitions = mergeById(acc.prohibitions);
  const directivesApplied = [
    ...conventions.map(c => c.id),
    ...rules.map(r => r.id),
    ...prohibitions.map(p => p.id),
  ];

  return {
    filesRead,
    directivesApplied,
    directivesIgnored: ignored,
    conventions,
    rules,
    prohibitions,
    sensitivePaths: [...new Set(acc.sensitivePaths)],
    scopeExceptions: [...new Set(acc.scopeExceptions)],
    verification: acc.verification,
    prose: proseChunks,
  };
}

module.exports = { discoverContext, parseContextFile, ALLOWED_KEYS, FORBIDDEN_KEYS };
