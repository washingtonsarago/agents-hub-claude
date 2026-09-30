'use strict';
// stages — the gate runs at more than one moment, and each moment can only ask
// what its evidence supports.
//
// v1 ran the reviewer once: on the diff, just before the commit. That is the
// most expensive place to discover that an item was never buildable, because
// the code already exists by then. These are the other moments:
//
//   scope      before a line is written. Evidence: the projected file list and
//              the limitations the analyze phase declared. The question worth
//              asking here is honesty — "does the data model support this at
//              all?" — because a no costs nothing yet.
//   change     the original gate. Evidence: the worktree diff. All rules.
//   reconcile  after every branch exists, before any PR. Evidence: files two
//              items both created. The byte-compare already fails divergent
//              copies; the reviewer is here for the duplication byte-compare
//              cannot see — the same subsystem built twice under two names.
//
// A stage never invents a rule. It selects from the same core set, and the
// selection is bounded by evidence: asking `suite` at scope stage would be
// asking the reviewer to judge a test run that has not happened.

// Findings are built by the rule engine's own constructor, so a stage finding
// is indistinguishable in shape from a change-stage one: same id scheme, same
// fields, same schema. A stage adds moments, never a second finding format.
const { finding } = require('./rules');

const STAGES = Object.freeze({
  scope: Object.freeze({
    id: 'scope',
    needsDiff: false,
    inputFlag: 'projection',
    // `secret` and `suite` are absent on purpose: there is no diff to scan and
    // no suite to have run. Claiming to check them here would be theatre.
    rules: Object.freeze(['honesty', 'ownership', 'scope', 'project-context']),
    question: 'Judge the PROJECTED scope of this item before any code exists. The evidence is a projection, not a diff. Ask: does the data model support what the item promises, or is a limitation being left undeclared? Does the projection stay inside the item\'s allowed paths and budget? Does it plan to create a file another item owns? A blocker here means replan or split — it costs nothing, because nothing is written yet.',
  }),
  change: Object.freeze({
    id: 'change',
    needsDiff: true,
    inputFlag: null,
    rules: null, // all rules in the set
    question: 'Judge the diff against the base ref. This is the last step before the commit.',
  }),
  reconcile: Object.freeze({
    id: 'reconcile',
    needsDiff: false,
    inputFlag: 'reconcile-report',
    // Divergence is already a machine failure upstream. The reviewer is here
    // for semantic duplication and for parity between two copies.
    rules: Object.freeze(['honesty', 'ownership', 'wiring', 'rule-parity', 'project-context']),
    question: 'Judge the batch before any PR is opened. The evidence is the set of files created by more than one item. Byte-identical copies already passed the mechanical check; your question is the one it cannot answer: did two items build the SAME subsystem under different names, or duplicate a validation that can now diverge? Name the pair.',
  }),
});

const STAGE_IDS = Object.freeze(Object.keys(STAGES));

class StageError extends Error {
  constructor(message) { super(message); this.name = 'StageError'; }
}

function resolveStage(id) {
  const key = id || 'change';
  if (!STAGE_IDS.includes(key)) throw new StageError(`--stage must be one of ${STAGE_IDS.join('|')}`);
  return STAGES[key];
}

// Rules the stage may evaluate, out of the set the profile produced. A profile
// rule is included when the stage takes all rules (change), or when it is a
// machine pattern rule and the stage has a diff to match against.
function rulesForStage(stage, ruleSet) {
  const all = [...ruleSet.rules.values()];
  if (stage.rules === null) return all;
  return all.filter(r => stage.rules.includes(r.id));
}

// ---- projection (stage: scope) ----------------------------------------------

function validateProjection(p) {
  if (!p || typeof p !== 'object') throw new StageError('projection must be an object');
  if (p.schemaVersion !== 1) throw new StageError('projection schemaVersion must be 1');
  if (typeof p.restatement !== 'string' || !p.restatement.trim()) {
    throw new StageError('projection.restatement must be a non-empty sentence');
  }
  if (!Array.isArray(p.projectedFiles)) throw new StageError('projection.projectedFiles must be an array');
  for (const f of p.projectedFiles) {
    if (!f || typeof f.path !== 'string' || !f.path) throw new StageError('each projected file needs a path');
    if (!['create', 'modify', 'delete'].includes(f.action)) {
      throw new StageError(`projected file ${f.path}: action must be create|modify|delete`);
    }
  }
  if (p.declaredLimitations && !Array.isArray(p.declaredLimitations)) {
    throw new StageError('projection.declaredLimitations must be an array');
  }
  return p;
}

// Budget and ownership are checkable before a line exists — that is the whole
// point of the scope gate. The projection's own line estimates are the
// evidence, and they are the item's claim, so a finding says so.
function evaluateProjection({ projection, item, manifest, budget, allowedPaths, matchesAny }) {
  const findings = [];
  const files = projection.projectedFiles;
  const estLines = files.reduce((n, f) => n + (Number.isInteger(f.estimatedLines) ? f.estimatedLines : 0), 0);

  if (budget && Number.isInteger(budget.maxFiles) && files.length > budget.maxFiles) {
    findings.push(finding('scope', 'blocker', null, null,
      `the projection touches ${files.length} files, over the item budget of ${budget.maxFiles}`,
      `projected: ${files.map(f => f.path).slice(0, 12).join(', ')}${files.length > 12 ? ` (+${files.length - 12} more)` : ''}`,
      { remedy: 'split the item; do not stretch the budget' }));
  }
  if (budget && Number.isInteger(budget.maxLines) && estLines > budget.maxLines) {
    findings.push(finding('scope', 'blocker', null, null,
      `the projection estimates ${estLines} lines, over the item budget of ${budget.maxLines}`,
      'line counts are the item\'s own estimate, taken from the projection',
      { remedy: 'split the item into two with separate budgets' }));
  }
  if (Array.isArray(allowedPaths) && allowedPaths.length) {
    for (const f of files) {
      if (!matchesAny(allowedPaths, f.path)) {
        findings.push(finding('scope', 'blocker', f.path, null,
          `the projection plans to ${f.action} a file outside the item's declared paths`,
          `allowed: ${allowedPaths.join(', ')}`,
          { remedy: 'declare the path in the manifest, or leave the file to the item that owns it' }));
      }
    }
  }
  if (manifest && manifest.ownership) {
    for (const f of files) {
      if (f.action !== 'create') continue;
      const owner = manifest.ownership[f.path];
      if (owner && owner !== item) {
        findings.push(finding('ownership', 'blocker', f.path, null,
          `the projection plans to create a file the manifest assigns to "${owner}"`,
          `ownership[${f.path}] = ${owner}, this item is ${item}`,
          { remedy: `consume the file ${owner} produces; do not create a second version` }));
      }
    }
  }
  return { findings, projectedFileCount: files.length, projectedLines: estLines };
}

// ---- reconcile report (stage: reconcile) ------------------------------------

function validateReconcileReport(r) {
  if (!r || typeof r !== 'object') throw new StageError('reconcile report must be an object');
  if (r.schemaVersion !== 1) throw new StageError('reconcile report schemaVersion must be 1');
  if (!Array.isArray(r.collisions)) throw new StageError('reconcile report collisions must be an array');
  return r;
}

// The mechanical half already fails a batch on divergence. What is left for the
// machine here is ownership: a collision on a file with a declared owner means
// somebody who does not own it created it anyway.
function evaluateReconcile({ report, manifest }) {
  const findings = [];
  for (const c of report.collisions) {
    const owner = c.owner || (manifest && manifest.ownership ? manifest.ownership[c.path] : null);
    if (owner) {
      const intruders = (c.items || []).filter(k => k !== owner);
      if (intruders.length) {
        findings.push(finding('ownership', 'blocker', c.path, null,
          `"${c.path}" is owned by ${owner} but was also created by ${intruders.join(', ')}`,
          c.diverging ? 'the copies diverge' : 'the copies are byte-identical, which still means it was built twice',
          { remedy: `let ${owner} produce it; the others consume it` }));
      }
    }
  }
  return {
    findings,
    collisionCount: report.collisions.length,
    divergingCount: report.divergingCount || 0,
    identicalCount: report.identicalCount || 0,
  };
}

module.exports = {
  STAGES, STAGE_IDS, StageError,
  resolveStage, rulesForStage,
  validateProjection, evaluateProjection,
  validateReconcileReport, evaluateReconcile,
};
