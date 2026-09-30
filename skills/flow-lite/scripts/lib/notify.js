'use strict';
// notify — tells the human when the run needs them, and when it stopped moving.
//
// A long batch is unattended by design: the point of /flow-lite is that you
// start it and go do something else. That only works if the run can reach you
// when it hits one of its three stop points, or when it stops moving at all.
//
// Three rules govern everything here:
//
//   1. **Never block the run.** Every external call is spawned detached and
//      unref'd. A notifier that hangs is strictly worse than no notifier.
//   2. **Never write to stdout.** stdout carries the run-summary block, which
//      is parsed. Alerts go to stderr and to the OS.
//   3. **Fail open, and say so.** A notification that could not be delivered is
//      recorded in the returned record and swallowed. The exit code of a run
//      never depends on whether a sound played.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Events the pipeline can raise. `bell` is how many terminal bells to send:
// the count is the signal when the OS channel is unavailable (a headless
// session over ssh gets one beep for "done", three for "you need to come back").
const EVENTS = Object.freeze({
  'needs-input': { bell: 2, urgency: 'critical', label: 'needs your answer' },
  'blocked': { bell: 3, urgency: 'critical', label: 'blocked' },
  'stalled': { bell: 3, urgency: 'critical', label: 'stalled' },
  'failed': { bell: 3, urgency: 'critical', label: 'failed' },
  'done': { bell: 1, urgency: 'normal', label: 'done' },
});

const EVENT_NAMES = Object.freeze(Object.keys(EVENTS));

class NotifyError extends Error {
  constructor(message) { super(message); this.name = 'NotifyError'; }
}

// ---- the off switch ---------------------------------------------------------

// Order matters: an explicit flag beats the environment, and the environment
// beats the CI default. CI is off by default because nobody is watching a
// runner's desktop, and a notifier there is a spawn that can only cost time.
function isEnabled({ env = process.env, noNotify = false } = {}) {
  if (noNotify) return { enabled: false, reason: '--no-notify' };
  const raw = String(env.FLOW_LITE_NOTIFY || '').trim().toLowerCase();
  if (raw === 'off' || raw === '0' || raw === 'false' || raw === 'no') {
    return { enabled: false, reason: 'FLOW_LITE_NOTIFY=off' };
  }
  const on = raw === 'on' || raw === '1' || raw === 'true' || raw === 'yes';
  if (on) return { enabled: true, reason: 'FLOW_LITE_NOTIFY=on' };
  if (env.CI && String(env.CI).toLowerCase() !== 'false') {
    return { enabled: false, reason: 'CI (set FLOW_LITE_NOTIFY=on to force)' };
  }
  return { enabled: true, reason: 'default' };
}

// ---- channel 1: the terminal bell -------------------------------------------

function ringBell(times, stream) {
  const s = stream || process.stderr;
  try {
    s.write('\u0007'.repeat(Math.max(1, times)));
    return { ok: true };
  } catch (e) {
    return { ok: false, cause: e.message };
  }
}

// ---- channel 2: the operating system ----------------------------------------

// One command per platform, chosen for being present on a stock install. We do
// not shell out through a string: every argument is passed as an argv element,
// so a title carrying a quote or a semicolon cannot become a command.
function osCommand({ platform, title, message, urgency }) {
  if (platform === 'darwin') {
    const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)} sound name "Ping"`;
    return { cmd: 'osascript', args: ['-e', script] };
  }
  if (platform === 'win32') {
    // Two beeps of different pitch carry urgency without needing a toast
    // framework, which is not installed by default on Windows.
    const tone = urgency === 'critical' ? '[console]::beep(880,200);[console]::beep(660,300)' : '[console]::beep(660,180)';
    return { cmd: 'powershell', args: ['-NoProfile', '-NonInteractive', '-Command', tone] };
  }
  // Linux and the BSDs: notify-send is part of libnotify and ships with every
  // desktop. On a headless box it simply fails, and the bell already rang.
  return {
    cmd: 'notify-send',
    args: ['-u', urgency === 'critical' ? 'critical' : 'normal', '-a', 'flow-lite', title, message],
  };
}

// Detached + unref'd + stdio ignored: the child cannot hold the run open, and
// cannot write into the run's output. We never wait for it, so we never learn
// whether it worked — which is the correct trade for something cosmetic.
function osNotify({ platform = process.platform, title, message, urgency, spawnFn = spawn } = {}) {
  const { cmd, args } = osCommand({ platform, title, message, urgency });
  try {
    const child = spawnFn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
    if (child && typeof child.unref === 'function') child.unref();
    if (child && typeof child.on === 'function') child.on('error', () => {});
    return { ok: true, cmd };
  } catch (e) {
    return { ok: false, cmd, cause: e.message };
  }
}

// ---- the entry point --------------------------------------------------------

function notify({
  event,
  title = null,
  message = '',
  batch = null,
  item = null,
  env = process.env,
  noNotify = false,
  platform = process.platform,
  stream = process.stderr,
  spawnFn = spawn,
} = {}) {
  if (!EVENT_NAMES.includes(event)) {
    throw new NotifyError(`--event must be one of ${EVENT_NAMES.join('|')}`);
  }
  const spec = EVENTS[event];
  const head = title || `flow-lite ${spec.label}${item ? ` — ${item}` : ''}`;
  const record = {
    event,
    at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    batch, item,
    title: head,
    message: String(message || ''),
    delivered: [],
    skipped: null,
  };

  const gate = isEnabled({ env, noNotify });
  if (!gate.enabled) {
    record.skipped = gate.reason;
    return record;
  }

  // The stderr banner is the channel that always works, including in a pipe,
  // a tmux pane nobody is looking at, and a transcript read later.
  try {
    stream.write(`\n[flow-lite] ${spec.label.toUpperCase()}${item ? ` · ${item}` : ''}${record.message ? ` — ${record.message}` : ''}\n`);
    record.delivered.push('stderr');
  } catch { /* a closed stderr is not a reason to fail a run */ }

  if (ringBell(spec.bell, stream).ok) record.delivered.push('bell');
  if (osNotify({ platform, title: head, message: record.message, urgency: spec.urgency, spawnFn }).ok) {
    record.delivered.push('os');
  }
  return record;
}

// ---- stall detection --------------------------------------------------------

// A stalled run is one whose ledger has a phase still open past the threshold.
// It is the only failure the run cannot report itself: a crashed or wedged
// orchestrator writes nothing, so something outside it has to look at the clock.
function findStalls({ ledger, stallAfterMs, now = Date.now() }) {
  if (!ledger || !Array.isArray(ledger.phases)) return [];
  return ledger.phases
    .filter(p => p.endedMs === null && typeof p.startedMs === 'number' && (now - p.startedMs) >= stallAfterMs)
    .map(p => ({
      item: p.item,
      phase: p.phase,
      iteration: p.iteration,
      openForMs: now - p.startedMs,
      key: `${p.item}::${p.phase}::${p.iteration}`,
    }));
}

function statePath(out) { return path.join(out, 'notify-state.json'); }

function loadState(out) {
  try { return JSON.parse(fs.readFileSync(statePath(out), 'utf8')); } catch { return { notified: [] }; }
}

function saveState(out, state) {
  try {
    fs.mkdirSync(out, { recursive: true });
    const p = statePath(out);
    fs.writeFileSync(p + '.tmp', JSON.stringify(state, null, 2) + '\n');
    fs.renameSync(p + '.tmp', p);
  } catch { /* losing the state only risks a duplicate alert */ }
}

function humanDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${s % 60 ? ` ${s % 60}s` : ''}`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// One sweep. Returns the alerts it raised, so a caller can loop or run `--once`.
// Each (item, phase, iteration) alerts at most once per run, because a stalled
// phase stays stalled and a bell every 30 seconds trains people to ignore it.
function sweep({ out, stallAfterMs, now = Date.now(), env = process.env, noNotify = false, platform = process.platform, stream = process.stderr, spawnFn = spawn }) {
  let ledger;
  try { ledger = JSON.parse(fs.readFileSync(path.join(out, 'ledger.json'), 'utf8')); } catch (e) {
    return { running: false, alerts: [], cause: `ledger unreadable: ${e.message}` };
  }
  const state = loadState(out);
  const seen = new Set(state.notified || []);
  const alerts = [];
  for (const stall of findStalls({ ledger, stallAfterMs, now })) {
    if (seen.has(stall.key)) continue;
    seen.add(stall.key);
    alerts.push(stall);
    notify({
      event: 'stalled',
      item: stall.item,
      batch: ledger.batch,
      message: `phase \`${stall.phase}\` open for ${humanDuration(stall.openForMs)} with no result — it may be waiting on you, or wedged`,
      env, noNotify, platform, stream, spawnFn,
    });
  }
  if (alerts.length) saveState(out, { notified: [...seen] });
  return { running: ledger.status === 'running', alerts, batch: ledger.batch };
}

module.exports = {
  EVENTS, EVENT_NAMES, NotifyError,
  isEnabled, ringBell, osCommand, osNotify, notify,
  findStalls, sweep, humanDuration,
};
