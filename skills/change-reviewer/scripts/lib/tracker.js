'use strict';
// tracker — optional work-item lookup, declared by the profile.
//
// Adapters:
//   none     the profile does not use a tracker → capability "not-configured"
//   fixture  a JSON file: { "items": { "<key>": { ... } } } → for tests and
//            for teams that export their tracker to a file
//   command  an executable that receives the item key as its last argument
//            and prints JSON to stdout → any tracker, no vendor code here
//
// Reachability is a capability, not a verdict: the gate reports it, and only
// a profile that lists "tracker" under requiredCapabilities turns
// "unreachable" into exit 4. Knocking out every team's commits because one
// tracker is down is how a tool gets uninstalled in its first week.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

class TrackerConfigError extends Error {
  constructor(message) { super(message); this.name = 'TrackerConfigError'; }
}

function lookup({ profile, worktree, item }) {
  const t = profile.tracker || { adapter: 'none' };
  if (t.adapter === 'none') return { status: 'not-configured', adapter: 'none', item: null, detail: null };

  if (t.adapter === 'fixture') {
    if (!t.path) throw new TrackerConfigError('tracker.adapter=fixture requires tracker.path');
    const p = path.resolve(worktree, t.path);
    let doc;
    try { doc = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {
      return { status: 'unreachable', adapter: 'fixture', item: null, detail: `fixture unreadable: ${e.message}` };
    }
    const found = doc && doc.items && doc.items[item] ? doc.items[item] : null;
    return { status: 'reachable', adapter: 'fixture', item: found, detail: found ? null : `item ${item} not in fixture` };
  }

  if (t.adapter === 'command') {
    if (!Array.isArray(t.command) || !t.command.length) throw new TrackerConfigError('tracker.adapter=command requires tracker.command: [exe, ...args]');
    try {
      const out = execFileSync(t.command[0], [...t.command.slice(1), item], {
        cwd: worktree, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        timeout: Number.isInteger(t.timeoutMs) ? t.timeoutMs : 10000,
        env: { ...process.env },
      });
      let parsed = null;
      try { parsed = JSON.parse(out); } catch { /* non-JSON output still proves reachability */ }
      return { status: 'reachable', adapter: 'command', item: parsed, detail: parsed ? null : 'command output was not JSON' };
    } catch (e) {
      if (e && e.code === 'ENOENT') throw new TrackerConfigError(`tracker command not found: ${t.command[0]}`);
      return { status: 'unreachable', adapter: 'command', item: null, detail: (e && e.stderr ? String(e.stderr) : String(e.message || e)).trim().slice(0, 300) };
    }
  }
  throw new TrackerConfigError(`unknown tracker adapter "${t.adapter}"`);
}

module.exports = { lookup, TrackerConfigError };
