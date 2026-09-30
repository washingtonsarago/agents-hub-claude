'use strict';
// schema — validation of the machine-readable contracts.
//
// Hand-written (zero deps) but mirrors skills/change-reviewer/schema/*.json,
// which is the human-readable contract. The one constraint that matters most
// is enforced here and tested: a finding with confirmed: false cannot carry
// severity blocker. In a gate a false positive costs stopped work, so what
// the agent could not confirm is a question, and a question never blocks.

const { SEVERITIES, SEVERITY_RANK } = require('./rules');

const VERDICTS = Object.freeze(['pass', 'blocked', 'inconclusive']);

class SchemaError extends Error {
  constructor(errors) {
    super(`schema validation failed:\n  - ${errors.join('\n  - ')}`);
    this.name = 'SchemaError';
    this.errors = errors;
  }
}

function isStr(x) { return typeof x === 'string'; }
function isInt(x) { return Number.isInteger(x); }

function validateFinding(f, where, knownRules) {
  const e = [];
  if (!f || typeof f !== 'object') return [`${where}: finding must be an object`];
  if (!isStr(f.id) || !f.id) e.push(`${where}.id: required string`);
  if (!isStr(f.rule) || !f.rule) e.push(`${where}.rule: required string`);
  else if (knownRules && !knownRules.has(f.rule)) e.push(`${where}.rule: unknown rule "${f.rule}"`);
  if (!SEVERITIES.includes(f.severity)) e.push(`${where}.severity: must be one of ${SEVERITIES.join('|')}`);
  if (f.file !== null && f.file !== undefined && !isStr(f.file)) e.push(`${where}.file: string or null`);
  if (f.line !== null && f.line !== undefined && !isInt(f.line)) e.push(`${where}.line: integer or null`);
  if (!isStr(f.summary) || !f.summary) e.push(`${where}.summary: required string`);
  if (!isStr(f.evidence)) e.push(`${where}.evidence: required string`);
  if (typeof f.confirmed !== 'boolean') e.push(`${where}.confirmed: required boolean`);
  if (f.confirmed === false && f.severity === 'blocker') {
    e.push(`${where}: confirmed=false cannot carry severity=blocker (unconfirmed findings are questions)`);
  }
  return e;
}

// Findings produced by the agent. Tolerant on extra fields, strict on the
// contract. Unconfirmed findings are downgraded to question ONLY when
// `normalize` is requested; validation itself rejects them.
function validateAgentFindings(doc, { knownRules = null } = {}) {
  const e = [];
  if (!doc || typeof doc !== 'object') return new SchemaError(['agent findings must be an object']);
  if (doc.schemaVersion !== 1) e.push('schemaVersion: must be 1');
  if (!Array.isArray(doc.findings)) e.push('findings: must be an array');
  else doc.findings.forEach((f, i) => e.push(...validateFinding(f, `findings[${i}]`, knownRules)));
  if (doc.positives !== undefined && !(Array.isArray(doc.positives) && doc.positives.every(isStr))) e.push('positives: array of strings');
  if (doc.declaredLimitations !== undefined && !(Array.isArray(doc.declaredLimitations) && doc.declaredLimitations.every(isStr))) e.push('declaredLimitations: array of strings');
  return e.length ? new SchemaError(e) : null;
}

function validateGateResult(doc) {
  const e = [];
  if (!doc || typeof doc !== 'object') return new SchemaError(['gate result must be an object']);
  if (doc.schemaVersion !== 1) e.push('schemaVersion: must be 1');
  if (!VERDICTS.includes(doc.verdict)) e.push(`verdict: must be one of ${VERDICTS.join('|')}`);
  if (!isInt(doc.exitCode) || doc.exitCode < 0 || doc.exitCode > 4) e.push('exitCode: integer 0..4');
  if (!isStr(doc.item)) e.push('item: string');
  if (!isStr(doc.baseRef)) e.push('baseRef: string');
  if (!isStr(doc.diffSha)) e.push('diffSha: string');
  if (!isStr(doc.profile)) e.push('profile: string (name@version)');
  if (!isStr(doc.generatedAt) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(doc.generatedAt)) e.push('generatedAt: UTC timestamp YYYY-MM-DDTHH:MM:SSZ');
  if (!doc.context || typeof doc.context !== 'object') e.push('context: object');
  else {
    if (!Array.isArray(doc.context.filesRead)) e.push('context.filesRead: array');
    if (!Array.isArray(doc.context.directivesApplied)) e.push('context.directivesApplied: array');
    if (!Array.isArray(doc.context.directivesIgnored)) e.push('context.directivesIgnored: array');
  }
  if (!doc.capabilities || typeof doc.capabilities !== 'object') e.push('capabilities: object');
  else {
    for (const k of ['manifest', 'suiteResult']) if (!['present', 'absent'].includes(doc.capabilities[k])) e.push(`capabilities.${k}: present|absent`);
    if (!['reachable', 'unreachable', 'not-configured'].includes(doc.capabilities.tracker)) e.push('capabilities.tracker: reachable|unreachable|not-configured');
    if (!['full', 'partial', 'not-applicable'].includes(doc.capabilities.diffCoverage)) e.push('capabilities.diffCoverage: full|partial|not-applicable');
    if (!['present', 'absent'].includes(doc.capabilities.agentReview)) e.push('capabilities.agentReview: present|absent');
  }
  if (!doc.stateHash || !isStr(doc.stateHash.before) || (doc.stateHash.after !== null && !isStr(doc.stateHash.after))) e.push('stateHash: { before: string, after: string|null }');
  if (!Array.isArray(doc.findings)) e.push('findings: array');
  else doc.findings.forEach((f, i) => e.push(...validateFinding(f, `findings[${i}]`)));
  if (!Array.isArray(doc.overrides)) e.push('overrides: array');
  if (!doc.metrics || !isInt(doc.metrics.durationMs) || !isInt(doc.metrics.filesReviewed) || !isInt(doc.metrics.iteration)) e.push('metrics: { durationMs, filesReviewed, iteration } integers');
  return e.length ? new SchemaError(e) : null;
}

function validateOverrides(list, findings, profile) {
  const e = [];
  if (!Array.isArray(list)) return new SchemaError(['overrides must be an array']);
  const byId = new Map(findings.map(f => [f.id, f]));
  list.forEach((o, i) => {
    const w = `overrides[${i}]`;
    if (!o || typeof o !== 'object') { e.push(`${w}: object`); return; }
    if (!isStr(o.findingId) || !o.findingId) e.push(`${w}.findingId: required`);
    else if (!byId.has(o.findingId)) e.push(`${w}.findingId: no finding "${o.findingId}" in this run`);
    if (!isStr(o.by) || !o.by) e.push(`${w}.by: required (who accepted the blocker)`);
    if (!isStr(o.at) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(o.at)) e.push(`${w}.at: UTC timestamp required`);
    if (!isStr(o.justification) || o.justification.trim().length < 10) e.push(`${w}.justification: at least 10 characters`);
    if (o.global === true || o.rule) e.push(`${w}: overrides are per finding; a global or per-rule override is not accepted`);
  });
  return e.length ? new SchemaError(e) : null;
}

module.exports = { VERDICTS, SchemaError, validateFinding, validateAgentFindings, validateGateResult, validateOverrides, SEVERITY_RANK };
