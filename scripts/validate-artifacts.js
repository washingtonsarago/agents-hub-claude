#!/usr/bin/env node
// validate-artifacts — content + manifest validator for agents/, commands/, skills/.
//
// Catches what regen-manifest.js does NOT catch: invariants of the artifacts
// themselves (frontmatter shape, name/filename match, tier value sanity,
// description JSON validity, manifest path existence, sha drift, orphan files).
//
// Exits 0 when all checks pass, 1 when any check fails. Always prints a final
// summary. Designed to run in CI and locally before commits.
//
// Flags:
//   --strict    also requires `tier` and `team` fields on every agent (warnings become errors)
//   --quiet     only print errors (no per-check tick)
//
// Zero deps. Run from repo root: node scripts/validate-artifacts.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = process.cwd();
const MANIFEST_PATH = path.join(REPO_ROOT, 'manifest.json');
const AGENTS_DIR = path.join(REPO_ROOT, 'agents');
const COMMANDS_DIR = path.join(REPO_ROOT, 'commands');
const SKILLS_DIR = path.join(REPO_ROOT, 'skills');

const ARGS = process.argv.slice(2);
const STRICT = ARGS.includes('--strict');
const QUIET = ARGS.includes('--quiet');

const VALID_TEAMS = [
  'backend',
  'frontend',
  'data',
  'devops',
  'integration',
  'architecture',
  'security',
  'qa',
  'product',
  'docs',
  'meta',
];

const errors = [];
const warnings = [];

function fail(label, msg) { errors.push(`[${label}] ${msg}`); }
function warn(label, msg) { warnings.push(`[${label}] ${msg}`); }
function tick(msg) { if (!QUIET) console.log(`  ok  ${msg}`); }
function step(msg) { if (!QUIET) console.log(`\n${msg}`); }

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function parseFrontmatter(text, who) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) {
    fail(who, 'missing frontmatter (--- ... ---)');
    return null;
  }
  const fm = m[1];
  const fields = {};
  // Capture either "key: \"...\"" or "key: bare value" (single-line).
  // Multi-line strings are not supported here — the project convention keeps
  // descriptions one-line (JSON-escaped \n inside the quoted string is fine).
  for (const line of fm.split('\n')) {
    const lm = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (!lm) continue;
    fields[lm[1]] = lm[2].trim();
  }
  return fields;
}

function decodeMaybeQuoted(raw) {
  // Returns { ok, value, error }.
  if (raw == null) return { ok: false, error: 'missing' };
  raw = raw.trim();
  if (raw.startsWith('"')) {
    try {
      return { ok: true, value: JSON.parse(raw) };
    } catch (e) {
      return { ok: false, error: `not a valid JSON string: ${e.message}` };
    }
  }
  return { ok: true, value: raw };
}

function listFiles(dir, ext = '.md') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(ext)).sort();
}

function walkSkillFiles(skillDir) {
  const out = [];
  function walk(d, rel = '') {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(full, r);
      else if (e.isFile()) out.push({ abs: full, rel: r });
    }
  }
  walk(skillDir);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

// ============================================================
// 1. Manifest exists and is valid JSON
// ============================================================
step('1. manifest.json');
if (!fs.existsSync(MANIFEST_PATH)) {
  fail('manifest', 'manifest.json not found at repo root');
  finishAndExit();
}
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  tick('manifest.json parses as JSON');
} catch (e) {
  fail('manifest', `manifest.json is not valid JSON: ${e.message}`);
  finishAndExit();
}
for (const k of ['agents', 'commands', 'skills']) {
  if (!Array.isArray(manifest[k])) {
    fail('manifest', `manifest.${k} must be an array (got ${typeof manifest[k]})`);
  }
}
if (manifest.updated_at && !/^\d{4}-\d{2}-\d{2}$/.test(manifest.updated_at)) {
  fail('manifest', `updated_at must be YYYY-MM-DD (got "${manifest.updated_at}")`);
}

const manifestNames = {
  agents: new Set((manifest.agents || []).map(it => it.name)),
  commands: new Set((manifest.commands || []).map(it => it.name)),
  skills: new Set((manifest.skills || []).map(it => it.name)),
};

// ============================================================
// 2. Each agent .md is well-formed and matches manifest
// ============================================================
step('2. agents/');
const agentFiles = listFiles(AGENTS_DIR);
for (const file of agentFiles) {
  const stem = file.replace(/\.md$/, '');
  const fm = parseFrontmatter(fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8'), `agents/${file}`);
  if (!fm) continue;

  if (!fm.name) fail(`agents/${file}`, 'frontmatter missing required field: name');
  else if (fm.name !== stem) fail(`agents/${file}`, `frontmatter name "${fm.name}" must match filename stem "${stem}"`);

  if (!fm.description) fail(`agents/${file}`, 'frontmatter missing required field: description');
  else {
    const dec = decodeMaybeQuoted(fm.description);
    if (!dec.ok) fail(`agents/${file}`, `description: ${dec.error}`);
  }

  if (!fm.model) fail(`agents/${file}`, 'frontmatter missing required field: model');
  else if (!['opus', 'sonnet', 'haiku'].includes(fm.model)) {
    fail(`agents/${file}`, `model must be opus|sonnet|haiku (got "${fm.model}")`);
  }

  if (fm.tier) {
    if (!['reasoning', 'speed'].includes(fm.tier)) {
      fail(`agents/${file}`, `tier must be reasoning|speed when present (got "${fm.tier}")`);
    }
  } else if (STRICT) {
    fail(`agents/${file}`, 'tier is required in --strict mode');
  } else {
    warn(`agents/${file}`, 'tier missing — recommended (reasoning|speed)');
  }

  if (fm.team) {
    if (!VALID_TEAMS.includes(fm.team)) {
      fail(`agents/${file}`, `team must be one of ${VALID_TEAMS.join('|')} (got "${fm.team}")`);
    }
  } else if (STRICT) {
    fail(`agents/${file}`, 'team is required in --strict mode');
  } else {
    warn(`agents/${file}`, `team missing — recommended (${VALID_TEAMS.join('|')})`);
  }

  // Cross-ref with manifest
  if (!manifestNames.agents.has(stem)) {
    fail(`agents/${file}`, `not registered in manifest.agents (run scripts/regen-manifest.js)`);
  }
  tick(`agents/${file}`);
}

// Manifest entries with no file
for (const it of manifest.agents || []) {
  if (!agentFiles.includes(`${it.name}.md`)) {
    fail('manifest.agents', `${it.name}: file ${it.path} does not exist`);
  }
}

// ============================================================
// 3. Each command .md exists; manifest cross-ref
// ============================================================
step('3. commands/');
const commandFiles = listFiles(COMMANDS_DIR);
for (const file of commandFiles) {
  const stem = file.replace(/\.md$/, '');
  if (!manifestNames.commands.has(stem)) {
    fail(`commands/${file}`, 'not registered in manifest.commands (run scripts/regen-manifest.js)');
  }
  tick(`commands/${file}`);
}
for (const it of manifest.commands || []) {
  if (!commandFiles.includes(`${it.name}.md`)) {
    fail('manifest.commands', `${it.name}: file ${it.path} does not exist`);
  }
}

// ============================================================
// 4. Each skill has SKILL.md with frontmatter + manifest cross-ref
// ============================================================
step('4. skills/');
const skillDirs = fs.existsSync(SKILLS_DIR)
  ? fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name)
      .sort()
  : [];

for (const name of skillDirs) {
  const skillRoot = path.join(SKILLS_DIR, name);
  const skillMd = path.join(skillRoot, 'SKILL.md');
  if (!fs.existsSync(skillMd)) {
    fail(`skills/${name}`, 'missing SKILL.md');
    continue;
  }
  const fm = parseFrontmatter(fs.readFileSync(skillMd, 'utf8'), `skills/${name}/SKILL.md`);
  if (!fm) continue;
  if (!fm.name) fail(`skills/${name}`, 'SKILL.md frontmatter missing: name');
  else if (fm.name !== name) fail(`skills/${name}`, `frontmatter name "${fm.name}" must match directory name "${name}"`);
  if (!fm.description) fail(`skills/${name}`, 'SKILL.md frontmatter missing: description');

  if (!manifestNames.skills.has(name)) {
    fail(`skills/${name}`, 'not registered in manifest.skills (run scripts/regen-manifest.js)');
  }
  tick(`skills/${name}`);
}
for (const it of manifest.skills || []) {
  if (!skillDirs.includes(it.name)) {
    fail('manifest.skills', `${it.name}: directory skills/${it.name}/ does not exist`);
  }
}

// ============================================================
// 5. sha256 in manifest matches every file (agents/commands single, skills multi)
// ============================================================
step('5. sha256 integrity');
for (const it of manifest.agents || []) {
  const p = path.join(REPO_ROOT, it.path);
  if (!fs.existsSync(p)) continue; // already reported above
  const got = sha256(fs.readFileSync(p));
  if (got !== it.sha256) {
    fail('sha256', `${it.path}: manifest=${it.sha256.slice(0, 12)}.. file=${got.slice(0, 12)}..`);
  }
}
for (const it of manifest.commands || []) {
  const p = path.join(REPO_ROOT, it.path);
  if (!fs.existsSync(p)) continue;
  const got = sha256(fs.readFileSync(p));
  if (got !== it.sha256) {
    fail('sha256', `${it.path}: manifest=${it.sha256.slice(0, 12)}.. file=${got.slice(0, 12)}..`);
  }
}
for (const it of manifest.skills || []) {
  // For each manifest file: check sha
  for (const f of it.files || []) {
    const p = path.join(REPO_ROOT, f.path);
    if (!fs.existsSync(p)) {
      fail('sha256', `${f.path}: file does not exist (skill ${it.name})`);
      continue;
    }
    const got = sha256(fs.readFileSync(p));
    if (got !== f.sha256) {
      fail('sha256', `${f.path}: manifest=${f.sha256.slice(0, 12)}.. file=${got.slice(0, 12)}..`);
    }
  }
  // And: any file in skills/<name>/** that the manifest is missing
  if (skillDirs.includes(it.name)) {
    const fsFiles = walkSkillFiles(path.join(SKILLS_DIR, it.name)).map(f => `skills/${it.name}/${f.rel}`);
    const manifestFiles = (it.files || []).map(f => f.path);
    for (const ff of fsFiles) {
      if (!manifestFiles.includes(ff)) {
        fail('skills', `${ff}: file present on disk but absent from manifest.skills["${it.name}"].files (run regen)`);
      }
    }
  }
}
tick('all sha256 verified');

// ============================================================
// summary + exit
// ============================================================
function finishAndExit() {
  const w = warnings.length, e = errors.length;
  console.log(`\n${'─'.repeat(60)}`);
  if (w) {
    console.log(`\n${w} warning(s):`);
    for (const m of warnings) console.log(`  ! ${m}`);
  }
  if (e) {
    console.log(`\n${e} error(s):`);
    for (const m of errors) console.log(`  ✗ ${m}`);
    console.log(`\n[validate] FAIL — ${e} error(s), ${w} warning(s)`);
    process.exit(1);
  }
  console.log(`\n[validate] OK — 0 errors, ${w} warning(s)`);
  process.exit(0);
}

finishAndExit();
