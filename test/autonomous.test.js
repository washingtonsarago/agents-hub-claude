// Integration tests for the `autonomous/` category: validator invariants,
// regen side-channel fields, CLI distribution and `ahc autonomous list`.
//
// These specs describe agents that run unattended, so most of what is asserted
// here is a safety rail rather than a style rule.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  FIXTURE_REMOTE,
  makeMinimalRepo,
  makeTmpHome,
  writeConfig,
  readLock,
  runAhc,
  runRegen,
  runValidator,
  patchManifest,
  rmrf,
} = require('./helpers');

const SPEC = 'autonomous/test-autonomous.md';

function patchSpec(repo, replacer) {
  const p = path.join(repo, SPEC);
  fs.writeFileSync(p, replacer(fs.readFileSync(p, 'utf8')));
}

// ---- validator -------------------------------------------------------------

test('autonomous: clean fixture passes the validator', () => {
  const repo = makeMinimalRepo();
  try {
    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 0, `expected pass: ${r.stdout}\n${r.stderr}`);
  } finally { rmrf(repo); }
});

test('autonomous: mode write without approved_by is rejected', () => {
  const repo = makeMinimalRepo();
  try {
    patchSpec(repo, t => t.replace(/^mode: read-only$/m, 'mode: write'));
    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1, 'unattended write must not pass unreviewed');
    assert.match(r.stdout, /mode: write requires an explicit `approved_by/);
  } finally { rmrf(repo); }
});

test('autonomous: mode write with approved_by is accepted', () => {
  const repo = makeMinimalRepo();
  try {
    patchSpec(repo, t =>
      t.replace(/^mode: read-only$/m, 'mode: write\napproved_by: Washington Sarago'));
    // sha changed — refresh the manifest so only the mode rule is under test
    runRegen(repo);
    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 0, `expected pass: ${r.stdout}`);
  } finally { rmrf(repo); }
});

test('autonomous: catches a cron that is not 5 fields', () => {
  const repo = makeMinimalRepo();
  try {
    patchSpec(repo, t => t.replace(/^schedule: .*$/m, 'schedule: 7 12 * *'));
    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /schedule must be a 5-field cron/);
  } finally { rmrf(repo); }
});

test('autonomous: catches an invalid mode value', () => {
  const repo = makeMinimalRepo();
  try {
    patchSpec(repo, t => t.replace(/^mode: read-only$/m, 'mode: yolo'));
    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /mode must be read-only\|write/);
  } finally { rmrf(repo); }
});

test('autonomous: catches a malformed routine_id', () => {
  const repo = makeMinimalRepo();
  try {
    patchSpec(repo, t => t.replace(/^routine_id:$/m, 'routine_id: not-a-routine'));
    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /routine_id must look like trig_/);
  } finally { rmrf(repo); }
});

test('autonomous: catches a repo that is not org/repo', () => {
  const repo = makeMinimalRepo();
  try {
    patchSpec(repo, t => t.replace(/^repo: .*$/m, 'repo: justaname'));
    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /repo must be in org\/repo form/);
  } finally { rmrf(repo); }
});

test('autonomous: catches a spec missing from the manifest', () => {
  const repo = makeMinimalRepo();
  try {
    patchManifest(repo, m => { m.autonomous = []; });
    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /not registered in manifest\.autonomous/);
  } finally { rmrf(repo); }
});

test('autonomous: a hub with no specs needs no manifest.autonomous key', () => {
  const repo = makeMinimalRepo();
  try {
    fs.rmSync(path.join(repo, 'autonomous'), { recursive: true, force: true });
    patchManifest(repo, m => { delete m.autonomous; });
    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 0, `older manifests must still validate: ${r.stdout}`);
  } finally { rmrf(repo); }
});

test('autonomous: specs on disk with no manifest key is an error', () => {
  const repo = makeMinimalRepo();
  try {
    patchManifest(repo, m => { delete m.autonomous; });
    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /manifest\.autonomous is missing/);
  } finally { rmrf(repo); }
});

// ---- regen -----------------------------------------------------------------

test('autonomous: regen surfaces schedule and mode in the manifest', () => {
  const repo = makeMinimalRepo();
  try {
    const r = runRegen(repo);
    assert.equal(r.status, 0);
    const m = JSON.parse(fs.readFileSync(path.join(repo, 'manifest.json'), 'utf8'));
    const entry = m.autonomous.find(e => e.name === 'test-autonomous');
    assert.equal(entry.schedule, '7 12 * * 1-5');
    assert.equal(entry.mode, 'read-only');
    assert.equal(entry.routine_id, undefined, 'unarmed spec must not carry an id');
  } finally { rmrf(repo); }
});

test('autonomous: regen drops a routine_id removed from the spec', () => {
  const repo = makeMinimalRepo();
  try {
    // Arm it, then disarm it — the manifest must not keep claiming it runs.
    patchSpec(repo, t => t.replace(/^routine_id:$/m, 'routine_id: trig_01ABCdef'));
    runRegen(repo);
    let m = JSON.parse(fs.readFileSync(path.join(repo, 'manifest.json'), 'utf8'));
    assert.equal(m.autonomous[0].routine_id, 'trig_01ABCdef', 'precondition: armed');

    patchSpec(repo, t => t.replace(/^routine_id: trig_01ABCdef$/m, 'routine_id:'));
    runRegen(repo);
    m = JSON.parse(fs.readFileSync(path.join(repo, 'manifest.json'), 'utf8'));
    assert.equal(m.autonomous[0].routine_id, undefined,
      'stale routine_id would report a disarmed agent as still running');
  } finally { rmrf(repo); }
});

// ---- CLI -------------------------------------------------------------------

test('autonomous: sync distributes specs to ~/.claude/autonomous/', () => {
  const home = makeTmpHome();
  try {
    writeConfig(home, { repo: `file://${FIXTURE_REMOTE}`, branch: 'n/a', channel: 'stable' });
    const r = runAhc(home, ['sync']);
    assert.equal(r.status, 0, `sync exit ${r.status}: ${r.stderr || r.stdout}`);
    assert.ok(fs.existsSync(path.join(home, '.claude/autonomous/test-autonomous.md')),
      'autonomous spec should be installed');
    assert.equal(readLock(home).autonomous['test-autonomous'].version, '1.0.0');
  } finally { rmrf(home); }
});

test('autonomous: `ahc autonomous list` separates armed from spec-only', () => {
  const home = makeTmpHome();
  try {
    writeConfig(home, { repo: `file://${FIXTURE_REMOTE}`, branch: 'n/a', channel: 'stable' });
    runAhc(home, ['sync']);

    let r = runAhc(home, ['autonomous', 'list']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /so spec\s+test-autonomous/);
    assert.match(r.stdout, /0 armado\(s\), 1 so especificacao/);

    // Arm it locally and re-read.
    const p = path.join(home, '.claude/autonomous/test-autonomous.md');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8')
      .replace(/^routine_id:$/m, 'routine_id: trig_01ABCdef'));

    r = runAhc(home, ['autonomous', 'list']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /armado\s+test-autonomous/);
    assert.match(r.stdout, /claude\.ai\/code\/routines\/trig_01ABCdef/);
    assert.match(r.stdout, /1 armado\(s\), 0 so especificacao/);
  } finally { rmrf(home); }
});

test('autonomous: unknown subcommand exits non-zero', () => {
  const home = makeTmpHome();
  try {
    writeConfig(home, { repo: `file://${FIXTURE_REMOTE}`, branch: 'n/a', channel: 'stable' });
    const r = runAhc(home, ['autonomous', 'destroy']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unknown subcommand/);
  } finally { rmrf(home); }
});
