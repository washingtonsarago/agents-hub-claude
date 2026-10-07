// Tests for the alerting half of flow-lite: the one-shot notification raised
// at a stop point, and the watchdog that notices the run stopped moving.
//
// Nothing here is allowed to spawn a real notifier or ring a real bell on the
// machine running the suite, so every unit test injects a fake `spawnFn` and a
// fake stream. The CLI tests run the real binary but with FLOW_LITE_NOTIFY=off
// or a stream nobody reads, and assert on the JSON record instead of on sound.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { rmrf } = require('./helpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const FLOW = path.join(REPO_ROOT, 'skills', 'flow-lite', 'scripts', 'flow-lite.js');
const notify = require(path.join(REPO_ROOT, 'skills', 'flow-lite', 'scripts', 'lib', 'notify.js'));

function fakeStream() {
  const chunks = [];
  return { chunks, write(s) { chunks.push(String(s)); return true; }, text() { return chunks.join(''); } };
}

function fakeSpawn() {
  const calls = [];
  const fn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return { unref() {}, on() {} };
  };
  fn.calls = calls;
  return fn;
}

function tmpdir(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

function writeLedger(out, doc) {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'ledger.json'), JSON.stringify(doc, null, 2) + '\n');
}

function ledgerWith(phases, status = 'running') {
  return { schemaVersion: 1, batch: 'B-1', status, phases, items: {} };
}

// ---------------------------------------------------------------- off switch

test('the off switch: explicit flag beats env, env beats the CI default', () => {
  assert.equal(notify.isEnabled({ env: {}, noNotify: true }).enabled, false);
  assert.equal(notify.isEnabled({ env: { FLOW_LITE_NOTIFY: 'off' } }).enabled, false);
  assert.equal(notify.isEnabled({ env: { FLOW_LITE_NOTIFY: '0' } }).enabled, false);

  // Nobody watches a runner's desktop, so CI is off unless forced.
  assert.equal(notify.isEnabled({ env: { CI: 'true' } }).enabled, false);
  assert.equal(notify.isEnabled({ env: { CI: 'true', FLOW_LITE_NOTIFY: 'on' } }).enabled, true);

  // And --no-notify wins even over an explicit on.
  assert.equal(notify.isEnabled({ env: { FLOW_LITE_NOTIFY: 'on' }, noNotify: true }).enabled, false);
  assert.equal(notify.isEnabled({ env: {} }).enabled, true);
});

test('a disabled notification is recorded as skipped and spawns nothing', () => {
  const spawnFn = fakeSpawn();
  const stream = fakeStream();
  const r = notify.notify({ event: 'blocked', item: 'ABC-1', message: 'x', noNotify: true, stream, spawnFn, env: {} });
  assert.equal(r.skipped, '--no-notify');
  assert.deepEqual(r.delivered, []);
  assert.equal(spawnFn.calls.length, 0);
  assert.equal(stream.text(), '', 'a disabled notifier writes nothing at all');
});

// ------------------------------------------------------- the stdout boundary

test('alerts never touch stdout, because stdout carries the run-summary block', () => {
  const out = tmpdir('flowlite-notify-');
  try {
    // The real binary, with stdout and stderr captured separately.
    const r = spawnSync('node', [FLOW, 'notify', '--event', 'needs-input', '--item', 'ABC-1', '--message', 'split?'], {
      encoding: 'utf8', timeout: 20000, env: { ...process.env, FLOW_LITE_NOTIFY: 'on' },
    });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '', 'stdout must stay empty without --json');
    assert.match(r.stderr, /NEEDS YOUR ANSWER/);
    assert.match(r.stderr, /ABC-1/);

    // With --json the record goes to stdout, and the banner still goes to stderr.
    const j = spawnSync('node', [FLOW, 'notify', '--event', 'done', '--json'], {
      encoding: 'utf8', timeout: 20000, env: { ...process.env, FLOW_LITE_NOTIFY: 'off' },
    });
    assert.equal(j.status, 0);
    const rec = JSON.parse(j.stdout);
    assert.equal(rec.event, 'done');
    assert.equal(rec.skipped, 'FLOW_LITE_NOTIFY=off');
  } finally { rmrf(out); }
});

// ------------------------------------------------------------- fail-open rule

test('a notifier that throws never fails the call', () => {
  const stream = fakeStream();
  const exploding = () => { throw new Error('no such binary'); };
  const r = notify.notify({ event: 'stalled', item: 'ABC-2', message: 'stuck', stream, spawnFn: exploding, env: {} });
  assert.ok(r.delivered.includes('stderr'), 'the banner still went out');
  assert.ok(r.delivered.includes('bell'));
  assert.ok(!r.delivered.includes('os'), 'the OS channel is reported as undelivered, not thrown');
});

test('an unknown event is a usage error, not a silent no-op', () => {
  assert.throws(() => notify.notify({ event: 'explode' }), /must be one of/);
  const r = spawnSync('node', [FLOW, 'notify', '--event', 'explode'], { encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 2);
});

// ------------------------------------------------------------ argv, not shell

test('the OS command passes text as argv elements, so a title cannot inject a command', () => {
  const nasty = 'item"; rm -rf /; echo "';
  for (const platform of ['darwin', 'win32', 'linux']) {
    const { cmd, args } = notify.osCommand({ platform, title: nasty, message: nasty, urgency: 'critical' });
    assert.ok(typeof cmd === 'string' && cmd.length > 0);
    assert.ok(Array.isArray(args), `${platform} must produce an argv array`);
    // No element is a concatenated shell line: the payload is carried whole,
    // inside one element, never spliced into a command string.
    for (const a of args) assert.equal(typeof a, 'string');
  }
  // darwin embeds the text in AppleScript, so it must be JSON-quoted there.
  const mac = notify.osCommand({ platform: 'darwin', title: nasty, message: nasty, urgency: 'critical' });
  assert.ok(mac.args[1].includes(JSON.stringify(nasty)), 'AppleScript strings are quoted, not interpolated raw');
});

test('urgency changes the alert, and the bell count carries it when the OS channel is absent', () => {
  assert.equal(notify.EVENTS['done'].bell, 1);
  assert.equal(notify.EVENTS['needs-input'].bell, 2);
  assert.equal(notify.EVENTS['blocked'].bell, 3);
  assert.equal(notify.EVENTS['stalled'].bell, 3);

  const stream = fakeStream();
  notify.notify({ event: 'blocked', message: 'm', stream, spawnFn: fakeSpawn(), env: {} });
  const bells = (stream.text().match(/\u0007/g) || []).length;
  assert.equal(bells, 3, 'a blocker rings three times');
});

// --------------------------------------------------------------- stall detect

test('findStalls reports only phases still open past the threshold', () => {
  const now = 1_000_000;
  const led = ledgerWith([
    { item: 'A', phase: 'implement', iteration: 1, startedMs: now - 700_000, endedMs: null },
    { item: 'B', phase: 'suite', iteration: 1, startedMs: now - 10_000, endedMs: null },
    { item: 'C', phase: 'gate', iteration: 1, startedMs: now - 900_000, endedMs: now - 800_000 },
  ]);
  const stalls = notify.findStalls({ ledger: led, stallAfterMs: 600_000, now });
  assert.equal(stalls.length, 1, 'only the long-open one');
  assert.equal(stalls[0].item, 'A');
  assert.equal(stalls[0].phase, 'implement');

  // A closed phase is never a stall, however long it took.
  assert.equal(notify.findStalls({ ledger: led, stallAfterMs: 1, now }).filter(s => s.item === 'C').length, 0);
});

test('sweep alerts once per phase, and remembers across restarts', () => {
  const out = tmpdir('flowlite-watch-');
  try {
    const now = 2_000_000;
    writeLedger(out, ledgerWith([
      { item: 'A', phase: 'implement', iteration: 1, startedMs: now - 700_000, endedMs: null },
    ]));
    const stream = fakeStream();
    const spawnFn = fakeSpawn();

    const first = notify.sweep({ out, stallAfterMs: 600_000, now, stream, spawnFn, env: {} });
    assert.equal(first.alerts.length, 1);
    assert.equal(first.running, true);

    // Same stall, a second sweep: a bell every 30 seconds trains people to
    // ignore bells, so it must not fire again.
    const second = notify.sweep({ out, stallAfterMs: 600_000, now: now + 60_000, stream, spawnFn, env: {} });
    assert.equal(second.alerts.length, 0, 'no repeat for a stall already reported');

    // State survives a fresh process reading the same directory.
    const third = notify.sweep({ out, stallAfterMs: 600_000, now: now + 120_000, stream, spawnFn, env: {} });
    assert.equal(third.alerts.length, 0);
    assert.ok(fs.existsSync(path.join(out, 'notify-state.json')));
  } finally { rmrf(out); }
});

test('sweep stops claiming the run is live once the ledger is closed', () => {
  const out = tmpdir('flowlite-watch-');
  try {
    writeLedger(out, ledgerWith([], 'completed'));
    const r = notify.sweep({ out, stallAfterMs: 1, now: Date.now(), stream: fakeStream(), spawnFn: fakeSpawn(), env: {} });
    assert.equal(r.running, false);
    assert.deepEqual(r.alerts, []);
  } finally { rmrf(out); }
});

test('an unreadable ledger is reported as a cause, never as "nothing is wrong"', () => {
  const out = tmpdir('flowlite-watch-');
  try {
    const r = notify.sweep({ out, stallAfterMs: 1, now: Date.now(), stream: fakeStream(), spawnFn: fakeSpawn(), env: {} });
    assert.equal(r.running, false);
    assert.match(r.cause, /ledger unreadable/);

    // And the CLI turns that into exit 4 — could not look.
    const cli = spawnSync('node', [FLOW, 'watch', '--out', out, '--once'], { encoding: 'utf8', timeout: 20000, env: { ...process.env, FLOW_LITE_NOTIFY: 'off' } });
    assert.equal(cli.status, 4);
  } finally { rmrf(out); }
});

test('watch --once reports the stall it found and exits without looping', () => {
  const out = tmpdir('flowlite-watch-');
  try {
    writeLedger(out, ledgerWith([
      { item: 'ABC-9', phase: 'gate', iteration: 2, startedMs: Date.now() - 900_000, endedMs: null },
    ]));
    const r = spawnSync('node', [FLOW, 'watch', '--out', out, '--stall-after', '600', '--once', '--json'], {
      encoding: 'utf8', timeout: 20000, env: { ...process.env, FLOW_LITE_NOTIFY: 'off' },
    });
    assert.equal(r.status, 0);
    const doc = JSON.parse(r.stdout);
    assert.equal(doc.alerts.length, 1);
    assert.equal(doc.alerts[0].item, 'ABC-9');
    assert.equal(doc.alerts[0].phase, 'gate');
    assert.equal(doc.alerts[0].iteration, 2);
  } finally { rmrf(out); }
});

test('humanDuration stays readable at every scale a phase can reach', () => {
  assert.equal(notify.humanDuration(45_000), '45s');
  assert.equal(notify.humanDuration(600_000), '10m');
  assert.equal(notify.humanDuration(630_000), '10m 30s');
  assert.equal(notify.humanDuration(7_200_000), '2h 0m');
});
