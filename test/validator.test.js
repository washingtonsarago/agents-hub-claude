// Integration tests for `scripts/validate-artifacts.js`.
// Builds a tmp repo (copy of fixture), introduces a specific defect,
// asserts the validator catches it.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  makeMinimalRepo,
  runValidator,
  patchManifest,
  sha256OfFile,
  rmrf,
} = require('./helpers');

test('validator: clean fixture passes', () => {
  const repo = makeMinimalRepo();
  try {
    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 0, `expected pass: ${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /OK/);
  } finally { rmrf(repo); }
});

test('validator: catches missing required frontmatter field (model)', () => {
  const repo = makeMinimalRepo();
  try {
    const p = path.join(repo, 'agents/test-agent.md');
    const txt = fs.readFileSync(p, 'utf8').replace(/^model:.*$/m, '');
    fs.writeFileSync(p, txt);

    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /missing required field: model/);
  } finally { rmrf(repo); }
});

test('validator: catches name/filename mismatch', () => {
  const repo = makeMinimalRepo();
  try {
    const p = path.join(repo, 'agents/test-agent.md');
    const txt = fs.readFileSync(p, 'utf8').replace(/^name: test-agent$/m, 'name: wrong-name');
    fs.writeFileSync(p, txt);

    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /name "wrong-name" must match filename stem "test-agent"/);
  } finally { rmrf(repo); }
});

test('validator: catches broken JSON in description', () => {
  const repo = makeMinimalRepo();
  try {
    const p = path.join(repo, 'agents/test-agent.md');
    // Open quote, no close quote → invalid JSON
    const txt = fs.readFileSync(p, 'utf8').replace(/^description:.*$/m, 'description: "broken \\u quote');
    fs.writeFileSync(p, txt);

    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /description.*not a valid JSON string/);
  } finally { rmrf(repo); }
});

test('validator: catches invalid model value', () => {
  const repo = makeMinimalRepo();
  try {
    const p = path.join(repo, 'agents/test-agent.md');
    const txt = fs.readFileSync(p, 'utf8').replace(/^model: sonnet$/m, 'model: gpt-4');
    fs.writeFileSync(p, txt);

    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /model must be opus\|sonnet\|haiku/);
  } finally { rmrf(repo); }
});

test('validator: catches invalid tier value', () => {
  const repo = makeMinimalRepo();
  try {
    const p = path.join(repo, 'agents/test-agent.md');
    const txt = fs.readFileSync(p, 'utf8').replace(/^tier: speed$/m, 'tier: lightning');
    fs.writeFileSync(p, txt);

    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /tier must be reasoning\|speed/);
  } finally { rmrf(repo); }
});

test('validator: --strict turns missing tier into an error', () => {
  const repo = makeMinimalRepo();
  try {
    const p = path.join(repo, 'agents/test-agent.md');
    const txt = fs.readFileSync(p, 'utf8').replace(/^tier:.*\n?/m, '');
    fs.writeFileSync(p, txt);
    // Update manifest sha so we isolate the tier-only behavior from sha drift.
    patchManifest(repo, m => { m.agents[0].sha256 = sha256OfFile(p); });

    // Without --strict: should still pass (warning only)
    const r1 = runValidator(repo, ['--quiet']);
    assert.equal(r1.status, 0,
      `tier missing should be a warning without --strict. stdout:\n${r1.stdout}\nstderr:\n${r1.stderr}`);

    // With --strict: must fail
    const r2 = runValidator(repo, ['--quiet', '--strict']);
    assert.equal(r2.status, 1);
    assert.match(r2.stdout, /tier is required in --strict mode/);
  } finally { rmrf(repo); }
});

test('validator: catches invalid team value', () => {
  const repo = makeMinimalRepo();
  try {
    const p = path.join(repo, 'agents/test-agent.md');
    const txt = fs.readFileSync(p, 'utf8').replace(/^team: backend$/m, 'team: notarealteam');
    fs.writeFileSync(p, txt);

    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /team must be one of/);
  } finally { rmrf(repo); }
});

test('validator: --strict turns missing team into an error', () => {
  const repo = makeMinimalRepo();
  try {
    const p = path.join(repo, 'agents/test-agent.md');
    const txt = fs.readFileSync(p, 'utf8').replace(/^team:.*\n?/m, '');
    fs.writeFileSync(p, txt);
    patchManifest(repo, m => { m.agents[0].sha256 = sha256OfFile(p); });

    // Without --strict: passes (warning only)
    const r1 = runValidator(repo, ['--quiet']);
    assert.equal(r1.status, 0,
      `team missing should be a warning without --strict. stdout:\n${r1.stdout}\nstderr:\n${r1.stderr}`);

    // With --strict: fails with team-specific error
    const r2 = runValidator(repo, ['--quiet', '--strict']);
    assert.equal(r2.status, 1);
    assert.match(r2.stdout, /team is required in --strict mode/);
  } finally { rmrf(repo); }
});

test('validator: catches sha256 drift', () => {
  const repo = makeMinimalRepo();
  try {
    fs.appendFileSync(path.join(repo, 'agents/test-agent.md'), '\n<!-- drift -->\n');
    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /\[sha256\]/);
  } finally { rmrf(repo); }
});

test('validator: catches manifest entry pointing at missing file', () => {
  const repo = makeMinimalRepo();
  try {
    fs.unlinkSync(path.join(repo, 'agents/test-agent.md'));
    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /file agents\/test-agent\.md does not exist/);
  } finally { rmrf(repo); }
});

test('validator: catches orphan file (in fs but not in manifest)', () => {
  const repo = makeMinimalRepo();
  try {
    fs.writeFileSync(path.join(repo, 'agents/orphan.md'),
`---
name: orphan
description: "Not in the manifest."
model: sonnet
color: gray
tier: speed
---

body
`);
    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /not registered in manifest\.agents/);
  } finally { rmrf(repo); }
});

test('validator: catches skill aux file present on disk but absent from manifest', () => {
  const repo = makeMinimalRepo();
  try {
    fs.writeFileSync(path.join(repo, 'skills/test-skill/templates/extra.py'), '# extra');
    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /extra\.py.*absent from manifest/);
  } finally { rmrf(repo); }
});

test('validator: catches skill name mismatch with directory name', () => {
  const repo = makeMinimalRepo();
  try {
    const p = path.join(repo, 'skills/test-skill/SKILL.md');
    const txt = fs.readFileSync(p, 'utf8').replace(/^name: test-skill$/m, 'name: wrong');
    fs.writeFileSync(p, txt);

    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /name "wrong" must match directory name "test-skill"/);
  } finally { rmrf(repo); }
});

test('validator: catches malformed manifest (invalid JSON)', () => {
  const repo = makeMinimalRepo();
  try {
    fs.writeFileSync(path.join(repo, 'manifest.json'), '{ this is not json');
    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /not valid JSON/);
  } finally { rmrf(repo); }
});

test('validator: catches invalid updated_at format', () => {
  const repo = makeMinimalRepo();
  try {
    patchManifest(repo, m => { m.updated_at = '02/05/2026'; });
    const r = runValidator(repo, ['--quiet']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /updated_at must be YYYY-MM-DD/);
  } finally { rmrf(repo); }
});
