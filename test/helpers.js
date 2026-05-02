// Shared test helpers — zero-dep.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const FIXTURE_REMOTE = path.join(__dirname, 'fixtures', 'remote');
const AHC_BIN = path.join(REPO_ROOT, 'bin', 'ahc');
const REGEN_SCRIPT = path.join(REPO_ROOT, 'scripts', 'regen-manifest.js');
const VALIDATOR = path.join(REPO_ROOT, 'scripts', 'validate-artifacts.js');

function makeTmpHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-home-'));
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  return dir;
}

function makeTmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahc-test-repo-'));
  return dir;
}

// Copy a directory tree (no symlinks expected in fixtures).
function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyTree(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

function writeConfig(home, cfg) {
  fs.writeFileSync(
    path.join(home, '.claude', '.ahc-config.json'),
    JSON.stringify(cfg, null, 2)
  );
}

function readLock(home) {
  const p = path.join(home, '.claude', '.ahc-lock.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeLock(home, lock) {
  fs.writeFileSync(
    path.join(home, '.claude', '.ahc-lock.json'),
    JSON.stringify(lock, null, 2) + '\n'
  );
}

function sha256OfFile(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

// Run ahc CLI under a tmp HOME pointing at a file:// remote.
function runAhc(home, args, opts = {}) {
  return spawnSync('node', [AHC_BIN, ...args], {
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home, // for git-bash on Windows in the future
    },
    encoding: 'utf8',
    timeout: 15000,
    ...opts,
  });
}

// Run regen-manifest.js with cwd set to a given repo root.
function runRegen(repoCwd, args = []) {
  return spawnSync('node', [REGEN_SCRIPT, ...args], {
    cwd: repoCwd,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env },
  });
}

// Run validate-artifacts.js with cwd set to a given repo root.
function runValidator(repoCwd, args = []) {
  return spawnSync('node', [VALIDATOR, ...args], {
    cwd: repoCwd,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env },
  });
}

// Build a self-contained tmp repo containing only what regen/validator need
// (manifest + agents/commands/skills directories), copied from the fixture.
function makeMinimalRepo() {
  const dir = makeTmpRepo();
  copyTree(FIXTURE_REMOTE, dir);
  // The fixture imports the script paths from REPO_ROOT — we run scripts via
  // absolute paths but cwd to this dir. Manifest lives at <dir>/manifest.json.
  return dir;
}

// Mutate the manifest in place.
function patchManifest(repoDir, mutator) {
  const p = path.join(repoDir, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  mutator(m);
  fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
}

function rmrf(p) {
  if (!p) return;
  fs.rmSync(p, { recursive: true, force: true });
}

module.exports = {
  REPO_ROOT,
  FIXTURE_REMOTE,
  AHC_BIN,
  REGEN_SCRIPT,
  VALIDATOR,
  makeTmpHome,
  makeTmpRepo,
  makeMinimalRepo,
  copyTree,
  writeConfig,
  readLock,
  writeLock,
  sha256OfFile,
  runAhc,
  runRegen,
  runValidator,
  patchManifest,
  rmrf,
};
