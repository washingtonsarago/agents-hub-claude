#!/usr/bin/env node
// regen-manifest — keep manifest.json in sync with agents/ + commands/ + skills/
//
// Behavior:
//   - Scans agents/*.md, commands/*.md (single-file categories) and
//     skills/<name>/** (multi-file category — each top-level dir is one skill).
//   - For each existing entry: if any file's sha256 differs from manifest,
//     update sha(s) and bump patch version. Description left untouched.
//   - For each new file/skill: adds entry at v1.0.0 with description from
//     SKILL.md / agent-frontmatter (first sentence before the first \n).
//   - For each missing entry (in manifest but not in fs): removes it.
//   - Sets updated_at to today's ISO date (UTC) only when content actually
//     changed; otherwise preserves the existing value to avoid daily churn.
//   - Output is sorted alphabetically by name within each category.
//
// Flags:
//   --check          exit 1 if manifest would change (CI-mode); don't write.
//   --dry-run        print what would change; don't write.
//   --bump=<level>   patch (default) | minor | major. Applied to all changed.
//
// Zero deps. Run from repo root: node scripts/regen-manifest.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = process.cwd();
const MANIFEST_PATH = path.join(REPO_ROOT, 'manifest.json');
const SKILLS_DIR = path.join(REPO_ROOT, 'skills');
const CATEGORIES = [
  { key: 'agents', dir: 'agents', manifestKey: 'agents' },
  { key: 'commands', dir: 'commands', manifestKey: 'commands' },
];

const ARGS = process.argv.slice(2);
const FLAGS = {
  check: ARGS.includes('--check'),
  dryRun: ARGS.includes('--dry-run'),
  bump: (ARGS.find(a => a.startsWith('--bump=')) || '--bump=patch').split('=')[1],
};
if (!['patch', 'minor', 'major'].includes(FLAGS.bump)) {
  console.error(`invalid --bump=${FLAGS.bump}; use patch | minor | major`);
  process.exit(2);
}

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function bumpVersion(v, level) {
  const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return '1.0.0';
  let [, maj, min, pat] = m;
  if (level === 'major') return `${+maj + 1}.0.0`;
  if (level === 'minor') return `${maj}.${+min + 1}.0`;
  return `${maj}.${min}.${+pat + 1}`;
}

function extractDescription(text) {
  // Frontmatter description -> first sentence before \n; fallback to filename.
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return '';
  const fm = m[1];
  const dm = fm.match(/^description:\s*("([^"\\]|\\.)*"|.+)$/m);
  if (!dm) return '';
  let raw = dm[1].trim();
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try { raw = JSON.parse(raw); } catch { raw = raw.slice(1, -1); }
  }
  // Take everything before the first explicit newline marker
  const firstLine = raw.split(/\\n|\n/)[0].trim();
  // Cap length so descriptions stay scannable in the manifest
  return firstLine.slice(0, 160);
}

function scanCategory(cat) {
  const dirPath = path.join(REPO_ROOT, cat.dir);
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(f => {
      const full = path.join(dirPath, f);
      const buf = fs.readFileSync(full);
      const text = buf.toString('utf8');
      return {
        name: f.replace(/\.md$/, ''),
        path: `${cat.dir}/${f}`,
        sha256: sha256(buf),
        description: extractDescription(text),
      };
    });
}

function walkFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue; // skip .DS_Store, dotfiles
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walkFiles(full));
    else if (entry.isFile()) result.push(full);
  }
  return result;
}

function scanSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(entry => {
      const skillDir = path.join(SKILLS_DIR, entry.name);
      const files = walkFiles(skillDir).sort();
      const skillFiles = files.map(absPath => {
        const buf = fs.readFileSync(absPath);
        const rel = path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
        return { path: rel, sha256: sha256(buf) };
      });
      const skillMd = path.join(skillDir, 'SKILL.md');
      let description = '';
      if (fs.existsSync(skillMd)) {
        description = extractDescription(fs.readFileSync(skillMd, 'utf8'));
      }
      return { name: entry.name, files: skillFiles, description };
    });
}

function reconcileSkills(currentManifest) {
  const fsItems = scanSkills();
  const manifestItems = currentManifest.skills || [];
  const byName = new Map(manifestItems.map(it => [it.name, it]));
  const result = [];
  const changes = [];

  for (const fsItem of fsItems) {
    const existing = byName.get(fsItem.name);
    if (!existing) {
      result.push({
        name: fsItem.name,
        version: '1.0.0',
        scope: 'user',
        description: fsItem.description || `(no description) — please edit manifest`,
        files: fsItem.files,
      });
      changes.push({ kind: 'added', name: fsItem.name, version: '1.0.0' });
    } else {
      const existingFiles = existing.files || [];
      const filesChanged =
        fsItem.files.length !== existingFiles.length ||
        fsItem.files.some(f => {
          const e = existingFiles.find(ef => ef.path === f.path);
          return !e || e.sha256 !== f.sha256;
        });
      if (filesChanged) {
        const newVersion = bumpVersion(existing.version, FLAGS.bump);
        result.push({
          ...existing,
          version: newVersion,
          files: fsItem.files,
        });
        changes.push({ kind: 'updated', name: fsItem.name, from: existing.version, to: newVersion });
      } else {
        result.push(existing);
      }
    }
    byName.delete(fsItem.name);
  }

  for (const orphan of byName.keys()) {
    changes.push({ kind: 'removed', name: orphan });
  }

  return { items: result, changes };
}

function reconcileCategory(cat, currentManifest) {
  const fsItems = scanCategory(cat);
  const manifestItems = currentManifest[cat.manifestKey] || [];
  const byName = new Map(manifestItems.map(it => [it.name, it]));
  const result = [];
  const changes = [];

  for (const fsItem of fsItems) {
    const existing = byName.get(fsItem.name);
    if (!existing) {
      result.push({
        name: fsItem.name,
        version: '1.0.0',
        path: fsItem.path,
        sha256: fsItem.sha256,
        scope: 'user',
        description: fsItem.description || `(no description) — please edit manifest`,
      });
      changes.push({ kind: 'added', name: fsItem.name, version: '1.0.0' });
    } else if (existing.sha256 !== fsItem.sha256) {
      const newVersion = bumpVersion(existing.version, FLAGS.bump);
      result.push({
        ...existing,
        version: newVersion,
        path: fsItem.path,
        sha256: fsItem.sha256,
      });
      changes.push({
        kind: 'updated', name: fsItem.name,
        from: existing.version, to: newVersion,
      });
    } else {
      result.push(existing);
    }
    byName.delete(fsItem.name);
  }

  for (const orphan of byName.keys()) {
    changes.push({ kind: 'removed', name: orphan });
  }

  return { items: result, changes };
}

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`manifest not found at ${MANIFEST_PATH}`);
    process.exit(2);
  }
  const current = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const next = {
    version: current.version || 1,
    channel: current.channel || 'stable',
    updated_at: current.updated_at,
    repo: current.repo,
  };

  let totalChanges = 0;
  for (const cat of CATEGORIES) {
    const { items, changes } = reconcileCategory(cat, current);
    next[cat.manifestKey] = items;
    if (changes.length) {
      console.log(`\n${cat.key.toUpperCase()}:`);
      for (const c of changes) {
        if (c.kind === 'added')   console.log(`  + ${c.name} @ ${c.version}`);
        if (c.kind === 'updated') console.log(`  ~ ${c.name} ${c.from} → ${c.to}`);
        if (c.kind === 'removed') console.log(`  - ${c.name}`);
      }
      totalChanges += changes.length;
    }
  }

  const skillsResult = reconcileSkills(current);
  next.skills = skillsResult.items;
  if (skillsResult.changes.length) {
    console.log(`\nSKILLS:`);
    for (const c of skillsResult.changes) {
      if (c.kind === 'added')   console.log(`  + ${c.name} @ ${c.version}`);
      if (c.kind === 'updated') console.log(`  ~ ${c.name} ${c.from} → ${c.to}`);
      if (c.kind === 'removed') console.log(`  - ${c.name}`);
    }
    totalChanges += skillsResult.changes.length;
  }

  if (totalChanges === 0) {
    console.log('manifest is up to date — no changes');
    process.exit(0);
  }

  next.updated_at = todayUTC();

  if (FLAGS.check) {
    console.error(`\n[check] manifest would change (${totalChanges} updates) — run \`node scripts/regen-manifest.js\` and commit`);
    process.exit(1);
  }

  if (FLAGS.dryRun) {
    console.log(`\n[dry-run] ${totalChanges} change(s) — not writing`);
    process.exit(0);
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(next, null, 2) + '\n');
  console.log(`\n[ok] manifest written (${totalChanges} change(s)) — updated_at=${next.updated_at}`);
}

try { main(); }
catch (e) { console.error(`[error] ${e.message}`); process.exit(2); }
