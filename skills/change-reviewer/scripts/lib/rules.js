'use strict';
// rules — the core rule registry and the mechanical evaluators.
//
// Two kinds of rule live here:
//   - `machine` rules are evaluated by these scripts from the diff, the
//     ownership manifest, the suite result and the discovered context;
//   - `agent` rules need reading comprehension and are judged by the
//     change-reviewer agent, whose findings come back as JSON and are
//     validated before they count.
//
// `structural` rules cannot be disabled, suppressed or lowered by any input
// (profile, CLAUDE.md, memory). The maintainers of this core decide what is
// structural; the boundary is enforced by tests, not by convention.

const { matchesAny } = require('./glob');

const SEVERITIES = Object.freeze(['question', 'major', 'blocker']);
const SEVERITY_RANK = Object.freeze({ question: 0, major: 1, blocker: 2 });

const CORE_RULES = Object.freeze([
  { id: 'honesty', severity: 'blocker', evaluator: 'agent', structural: true,
    description: 'The diff infers data the model does not support without declaring the limitation in the PR and in the response payload.' },
  { id: 'ownership', severity: 'blocker', evaluator: 'machine', structural: true,
    description: 'The diff creates a file the ownership manifest assigns to another item.' },
  { id: 'wiring', severity: 'blocker', evaluator: 'agent', structural: false,
    description: 'A new public symbol has no consumer outside its own tests.' },
  { id: 'rule-parity', severity: 'blocker', evaluator: 'agent', structural: false,
    description: 'The same validation exists in two places that can diverge.' },
  { id: 'suite', severity: 'blocker', evaluator: 'machine', structural: true,
    description: 'The reported suite result has a failure.' },
  { id: 'scope', severity: 'blocker', evaluator: 'machine', structural: false,
    description: 'The diff exceeds the item budget or builds outside the item\'s declared paths.' },
  { id: 'secret', severity: 'blocker', evaluator: 'machine', structural: true,
    description: 'A credential, token or private key appears in the diff.' },
  { id: 'project-context', severity: 'blocker', evaluator: 'both', structural: false,
    description: 'A blocking directive from the project\'s CLAUDE.md was violated.' },
]);

const CORE_RULE_IDS = Object.freeze(CORE_RULES.map(r => r.id));
const STRUCTURAL_RULE_IDS = Object.freeze(CORE_RULES.filter(r => r.structural).map(r => r.id));

// Patterns are applied to ADDED lines only. Each has an id so a finding can
// say what shape matched without echoing the secret.
const DEFAULT_SECRET_PATTERNS = Object.freeze([
  { id: 'private-key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/ },
  { id: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
  { id: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { id: 'generic-assignment', re: /\b(?:api[_-]?key|secret|token|passwd|password)\b\s*[:=]\s*["'][^"'\s]{12,}["']/i },
]);

// Compiles a profile's rule additions on top of the core. A profile may add
// rules and raise severities; it may never lower a core severity, mark a core
// rule non-structural, or redefine a core rule.
function buildRuleSet(profile) {
  const rules = new Map(CORE_RULES.map(r => [r.id, { ...r }]));
  const rejected = [];
  for (const pr of (profile && profile.rules) || []) {
    if (rules.has(pr.id)) {
      rejected.push({ source: 'profile', reason: `profile attempted to redefine core rule "${pr.id}"`, excerpt: JSON.stringify(pr).slice(0, 200) });
      continue;
    }
    if (!SEVERITIES.includes(pr.severity)) {
      rejected.push({ source: 'profile', reason: `profile rule "${pr.id}" has invalid severity "${pr.severity}"`, excerpt: JSON.stringify(pr).slice(0, 200) });
      continue;
    }
    rules.set(pr.id, {
      id: pr.id,
      severity: pr.severity,
      evaluator: pr.pattern ? 'machine' : 'agent',
      structural: Boolean(pr.structural),
      description: pr.description || '',
      pattern: pr.pattern || null,
      paths: pr.paths || null,
      origin: 'profile',
    });
  }
  for (const [id, sev] of Object.entries((profile && profile.severity) || {})) {
    const r = rules.get(id);
    if (!r) { rejected.push({ source: 'profile', reason: `severity set for unknown rule "${id}"` }); continue; }
    if (!SEVERITIES.includes(sev)) { rejected.push({ source: 'profile', reason: `invalid severity "${sev}" for rule "${id}"` }); continue; }
    if (SEVERITY_RANK[sev] < SEVERITY_RANK[r.severity]) {
      rejected.push({ source: 'profile', reason: `profile attempted to lower severity of rule "${id}" from ${r.severity} to ${sev}` });
      continue;
    }
    r.severity = sev;
  }
  return { rules, rejected };
}

function addedLines(patch) {
  const out = [];
  if (!patch) return out;
  let newLine = 0;
  for (const raw of patch.split('\n')) {
    const m = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (m) { newLine = Number(m[1]); continue; }
    if (raw.startsWith('+++') || raw.startsWith('---')) continue;
    if (raw.startsWith('+')) { out.push({ line: newLine, text: raw.slice(1) }); newLine++; }
    else if (raw.startsWith('-')) { /* removed */ }
    else if (raw.startsWith('\\')) { /* no newline marker */ }
    else newLine++;
  }
  return out;
}

let seq = 0;
function fid(rule) { seq++; return `${rule}-${String(seq).padStart(3, '0')}`; }
function resetIds() { seq = 0; }

function finding(rule, severity, file, line, summary, evidence, extra = {}) {
  return { id: fid(rule), rule, severity, file, line, summary, evidence, confirmed: true, ...extra };
}

// ---- machine evaluators ----------------------------------------------------

function evalOwnership({ diff, item, manifest }) {
  if (!manifest || !manifest.ownership) return [];
  const out = [];
  for (const f of diff.files) {
    if (f.status !== 'A') continue;
    const owner = manifest.ownership[f.path];
    if (owner && owner !== item) {
      out.push(finding('ownership', 'blocker', f.path, 1,
        `File is owned by item ${owner}; this item (${item}) must consume it, not create it`,
        `ownership manifest assigns ${f.path} to ${owner}`));
    }
  }
  return out;
}

function evalSuite({ suiteResult }) {
  if (!suiteResult) return [];
  const out = [];
  if (suiteResult.status === 'failed') {
    const failures = Array.isArray(suiteResult.failed) && suiteResult.failed.length
      ? suiteResult.failed
      : [{ name: '(unnamed)', message: 'suite reported status=failed without details' }];
    for (const t of failures) {
      out.push(finding('suite', 'blocker', t.file || null, t.line || null,
        `Test failed: ${t.name}`, String(t.message || '').slice(0, 500)));
    }
  } else if (suiteResult.status === 'not-run') {
    out.push({ ...finding('suite', 'question', null, null,
      'Suite result says the suite was not run', suiteResult.reason || 'no reason given'), confirmed: false });
  }
  return out;
}

function evalSecret({ diff, patterns }) {
  const pats = (patterns && patterns.length) ? patterns : DEFAULT_SECRET_PATTERNS;
  const out = [];
  for (const f of diff.files) {
    if (!f.patch) continue;
    for (const { line, text } of addedLines(f.patch)) {
      for (const p of pats) {
        if (p.re.test(text)) {
          out.push(finding('secret', 'blocker', f.path, line,
            `Possible credential in diff (${p.id})`,
            `an added line matches the ${p.id} pattern; content withheld from this report`));
          break;
        }
      }
    }
  }
  return out;
}

function evalScope({ diff, budget, allowedPaths }) {
  const out = [];
  if (budget) {
    if (Number.isInteger(budget.maxFiles) && diff.files.length > budget.maxFiles) {
      out.push(finding('scope', 'blocker', null, null,
        `Diff touches ${diff.files.length} files; item budget is ${budget.maxFiles}`,
        `files=${diff.files.length} maxFiles=${budget.maxFiles}`));
    }
    const lines = diff.totals.additions + diff.totals.deletions;
    if (Number.isInteger(budget.maxLines) && lines > budget.maxLines) {
      out.push(finding('scope', 'blocker', null, null,
        `Diff changes ${lines} lines; item budget is ${budget.maxLines}`,
        `additions=${diff.totals.additions} deletions=${diff.totals.deletions} maxLines=${budget.maxLines}`));
    }
  }
  if (allowedPaths && allowedPaths.length) {
    for (const f of diff.files) {
      if (!matchesAny(allowedPaths, f.path)) {
        out.push(finding('scope', 'blocker', f.path, 1,
          'File is outside the paths the item declared',
          `allowedPaths=${allowedPaths.join(', ')}`));
      }
    }
  }
  return out;
}

// Prohibitions and pattern rules coming from CLAUDE.md (via context) and
// from the profile (rules with `pattern`).
function evalPatterns({ diff, context, ruleSet }) {
  const out = [];
  const checks = [];
  for (const p of (context && context.prohibitions) || []) {
    if (p.pattern) checks.push({ rule: 'project-context', severity: 'blocker', id: p.id, re: safeRegExp(p.pattern), paths: p.paths, description: p.description });
  }
  for (const r of (context && context.rules) || []) {
    if (r.pattern) checks.push({ rule: 'project-context', severity: r.severity || 'major', id: r.id, re: safeRegExp(r.pattern), paths: r.paths, description: r.description });
  }
  for (const r of ruleSet.rules.values()) {
    if (r.origin === 'profile' && r.pattern) checks.push({ rule: r.id, severity: r.severity, id: r.id, re: safeRegExp(r.pattern), paths: r.paths, description: r.description });
  }
  for (const c of checks) {
    if (!c.re) continue;
    for (const f of diff.files) {
      if (!f.patch) continue;
      if (c.paths && c.paths.length && !matchesAny(c.paths, f.path)) continue;
      for (const { line, text } of addedLines(f.patch)) {
        if (c.re.test(text)) {
          out.push(finding(c.rule, c.severity, f.path, line,
            c.description || `Directive "${c.id}" violated`, `directive ${c.id} matched an added line`, { directive: c.id }));
          break;
        }
      }
    }
  }
  return out;
}

function safeRegExp(src) {
  try { return new RegExp(src); } catch { return null; }
}

// Applies context effects to a list of findings:
//   - scope exceptions remove paths from evaluation entirely;
//   - conventions suppress findings of NON-structural rules on their paths;
//   - sensitive paths raise a confirmed major to blocker.
function applyContext(findings, context, ruleSet) {
  const kept = [];
  const suppressed = [];
  for (let f of findings) {
    if (f.file && matchesAny(context.scopeExceptions, f.file)) {
      suppressed.push({ id: f.id, rule: f.rule, reason: 'scope exception' });
      continue;
    }
    const conv = (context.conventions || []).find(c =>
      (c.suppresses || []).includes(f.rule) &&
      (!c.paths || !c.paths.length || (f.file && matchesAny(c.paths, f.file))));
    if (conv) {
      const rule = ruleSet.rules.get(f.rule);
      if (rule && rule.structural) {
        // Recorded by context discovery as an ignored directive; keep the finding.
      } else {
        suppressed.push({ id: f.id, rule: f.rule, reason: `convention ${conv.id}` });
        continue;
      }
    }
    if (f.confirmed && f.severity === 'major' && f.file && matchesAny(context.sensitivePaths, f.file)) {
      f = { ...f, severity: 'blocker', raisedBy: 'sensitive-path' };
    }
    kept.push(f);
  }
  return { findings: kept, suppressed };
}

function evaluateMachineRules({ diff, item, manifest, suiteResult, context, ruleSet, budget, allowedPaths, secretPatterns }) {
  resetIds();
  const all = [
    ...evalOwnership({ diff, item, manifest }),
    ...evalSuite({ suiteResult }),
    ...evalSecret({ diff, patterns: secretPatterns }),
    ...evalScope({ diff, budget, allowedPaths }),
    ...evalPatterns({ diff, context, ruleSet }),
  ];
  return applyContext(all, context, ruleSet);
}

module.exports = {
  SEVERITIES,
  SEVERITY_RANK,
  CORE_RULES,
  CORE_RULE_IDS,
  STRUCTURAL_RULE_IDS,
  DEFAULT_SECRET_PATTERNS,
  buildRuleSet,
  addedLines,
  finding,
  evaluateMachineRules,
  applyContext,
  evalOwnership,
  evalSuite,
  evalSecret,
  evalScope,
  evalPatterns,
};
