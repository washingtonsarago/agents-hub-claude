#!/usr/bin/env node
// regen-manifest — keep manifest.json in sync with agents/ + commands/ +
// autonomous/ + skills/
//
// Behavior:
//   - Scans agents/*.md, commands/*.md, autonomous/*.md (single-file categories)
//     and skills/<name>/** (multi-file category — each top-level dir is one skill).
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
  { key: 'autonomous', dir: 'autonomous', manifestKey: 'autonomous' },
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

function extractFrontmatterField(text, field) {
  const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const re = new RegExp(`^${field}:\\s*(.+)$`, 'm');
  const m = fmMatch[1].match(re);
  return m ? m[1].trim() : null;
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
      const entry = {
        name: f.replace(/\.md$/, ''),
        path: `${cat.dir}/${f}`,
        sha256: sha256(buf),
        description: extractDescription(text),
      };
      // Only agents carry a team bucket today.
      if (cat.dir === 'agents') {
        const team = extractFrontmatterField(text, 'team');
        if (team) entry.team = team;
      }
      // Autonomous specs surface schedule/mode/armed-state in the manifest so
      // `ahc autonomous list` can answer "what runs when" without reading files.
      if (cat.dir === 'autonomous') {
        for (const field of ['schedule', 'mode', 'routine_id']) {
          const v = extractFrontmatterField(text, field);
          if (v) entry[field] = v;
        }
      }
      return entry;
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

// Side-channel fields are copied from frontmatter when present. When one is
// REMOVED from the .md, the spread of the old manifest entry would keep the
// stale value — so drop it explicitly. Matters most for routine_id: a leftover
// id makes `ahc autonomous list` report a disarmed agent as still running.
const SIDE_CHANNEL_FIELDS = ['team', 'schedule', 'mode', 'routine_id'];

function clearDropped(entry, fsItem) {
  for (const field of SIDE_CHANNEL_FIELDS) {
    if (!fsItem[field]) delete entry[field];
  }
  return entry;
}

function reconcileCategory(cat, currentManifest) {
  const fsItems = scanCategory(cat);
  const manifestItems = currentManifest[cat.manifestKey] || [];
  const byName = new Map(manifestItems.map(it => [it.name, it]));
  const result = [];
  const changes = [];

  for (const fsItem of fsItems) {
    const existing = byName.get(fsItem.name);
    // Side-channel fields propagated from frontmatter regardless of sha drift
    // (so renaming a team in the .md doesn't require a version bump).
    const sideChannel = {};
    if (fsItem.team) sideChannel.team = fsItem.team;
    for (const field of ['schedule', 'mode', 'routine_id']) {
      if (fsItem[field]) sideChannel[field] = fsItem[field];
    }

    if (!existing) {
      result.push({
        name: fsItem.name,
        version: '1.0.0',
        path: fsItem.path,
        sha256: fsItem.sha256,
        scope: 'user',
        description: fsItem.description || `(no description) — please edit manifest`,
        ...sideChannel,
      });
      changes.push({ kind: 'added', name: fsItem.name, version: '1.0.0' });
    } else if (existing.sha256 !== fsItem.sha256) {
      const newVersion = bumpVersion(existing.version, FLAGS.bump);
      result.push({
        ...existing,
        version: newVersion,
        path: fsItem.path,
        sha256: fsItem.sha256,
        ...sideChannel,
      });
      result[result.length - 1] = clearDropped(result[result.length - 1], fsItem);
      changes.push({
        kind: 'updated', name: fsItem.name,
        from: existing.version, to: newVersion,
      });
    } else {
      result.push(clearDropped({ ...existing, ...sideChannel }, fsItem));
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
    // Don't materialize an empty key a repo never had — a hub without any
    // autonomous agent should keep a manifest that looks exactly as before.
    if (!items.length && current[cat.manifestKey] === undefined) continue;
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

  // Detect metadata-only drift (e.g., team field backfill without sha change).
  // Compare serialized forms without `updated_at` so we don't trip on the date stamp.
  const stripDate = (m) => { const c = { ...m }; delete c.updated_at; return JSON.stringify(c); };
  const metadataDrift = stripDate(next) !== stripDate(current);

  if (totalChanges === 0 && !metadataDrift) {
    console.log('manifest is up to date — no changes');
    process.exit(0);
  }

  if (totalChanges === 0 && metadataDrift) {
    console.log('manifest metadata drift detected (e.g., team field) — refreshing without version bump');
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
