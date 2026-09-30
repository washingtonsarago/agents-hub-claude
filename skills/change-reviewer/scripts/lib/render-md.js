'use strict';
// render-md — the human-readable gate report.
//
// Written together with gate.json from the same result object; never derived
// from the JSON at read time. Three inherited rules:
//   1. every finding cites file and line when it has them;
//   2. "What's good" appears whenever there is something good;
//   3. no pile of nits on a result that has a blocker: majors and questions
//      are counted, not listed, until the blockers are gone.
// Timestamps are UTC, always.

const SUPPORTED_LOCALES = Object.freeze(['en']);

function loc(f) {
  if (f.file && f.line != null) return `\`${f.file}:${f.line}\``;
  if (f.file) return `\`${f.file}\``;
  return '_(no file)_';
}

function renderFinding(f) {
  const tags = [];
  if (f.overridden) tags.push('overridden');
  if (!f.confirmed) tags.push('unconfirmed');
  if (f.raisedBy) tags.push(`raised by ${f.raisedBy}`);
  const tag = tags.length ? ` _(${tags.join(', ')})_` : '';
  return [
    `### [${f.severity.toUpperCase()}] ${f.summary}${tag}`,
    `**Rule:** \`${f.rule}\` · **Id:** \`${f.id}\` · **Where:** ${loc(f)}`,
    `**Evidence:** ${f.evidence || '_none given_'}`,
    '',
  ].join('\n');
}

function renderGateMarkdown(r) {
  const localeNote = SUPPORTED_LOCALES.includes(r.locale) ? '' : `\n> Locale \`${r.locale}\` is not available in this version; rendered in English.\n`;
  const blockers = r.findings.filter(f => f.severity === 'blocker' && !f.overridden);
  const majors = r.findings.filter(f => f.severity === 'major' && !f.overridden);
  const questions = r.findings.filter(f => f.severity === 'question' && !f.overridden);
  const overridden = r.findings.filter(f => f.overridden);
  const hasBlocker = blockers.length > 0;

  const lines = [];
  lines.push(`# change-reviewer gate — ${r.item}`);
  lines.push('');
  lines.push(`## Verdict: ${r.verdict.toUpperCase()}${r.mode === 'report-only' ? ' (report-only: exit code forced to 0)' : ''}`);
  if (r.inconclusiveReason) lines.push(`\n**Inconclusive because:** ${r.inconclusiveReason}`);
  lines.push('');
  lines.push(`**Exit code:** ${r.exitCode} · **Profile:** \`${r.profile}\` · **Base ref:** \`${r.baseRef}\` · **Diff:** \`${r.diffSha}\` · **Iteration:** ${r.metrics.iteration}`);
  lines.push(`**Generated:** ${r.generatedAt} (UTC) · **Files reviewed:** ${r.metrics.filesReviewed} · **Duration:** ${r.metrics.durationMs} ms`);
  if (localeNote) lines.push(localeNote);
  lines.push('');

  lines.push(`## Blockers (${blockers.length})`);
  lines.push('');
  if (!blockers.length) lines.push('_None._\n');
  for (const f of blockers) lines.push(renderFinding(f));

  if (hasBlocker) {
    lines.push('## Majors and questions');
    lines.push('');
    lines.push(`_${majors.length} major(s) and ${questions.length} question(s) withheld until the blockers above are resolved. They are listed in gate.json._`);
    lines.push('');
  } else {
    lines.push(`## Majors (${majors.length})`);
    lines.push('');
    if (!majors.length) lines.push('_None._\n');
    for (const f of majors) lines.push(renderFinding(f));
    lines.push(`## Questions (${questions.length})`);
    lines.push('');
    if (!questions.length) lines.push('_None._\n');
    for (const f of questions) lines.push(renderFinding(f));
  }

  if (overridden.length) {
    lines.push(`## Overrides (${overridden.length}) — mandatory review items in the PR`);
    lines.push('');
    for (const f of overridden) {
      const o = r.overrides.find(x => x.findingId === f.id);
      lines.push(`- \`${f.id}\` (\`${f.rule}\`) at ${loc(f)} — accepted by **${o.by}** at ${o.at}: ${o.justification}${o.requiresSecondApprover ? ' — **requires a second approver in the PR**' : ''}`);
    }
    lines.push('');
  }

  if (r.positives && r.positives.length) {
    lines.push("## What's good");
    lines.push('');
    for (const p of r.positives) lines.push(`- ${p}`);
    lines.push('');
  }

  if (r.declaredLimitations && r.declaredLimitations.length) {
    lines.push('## Declared limitations');
    lines.push('');
    for (const p of r.declaredLimitations) lines.push(`- ${p}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`**Context files read:** ${r.context.filesRead.length ? r.context.filesRead.map(x => `\`${x}\``).join(', ') : '_none found_'}`);
  lines.push(`**Directives applied:** ${r.context.directivesApplied.length ? r.context.directivesApplied.map(x => `\`${x}\``).join(', ') : '_none_'}`);
  if (r.context.directivesIgnored.length) {
    lines.push(`**Directives ignored (${r.context.directivesIgnored.length}):**`);
    for (const d of r.context.directivesIgnored) lines.push(`- \`${d.source}\`: ${d.reason}${d.excerpt ? ` — \`${d.excerpt.replace(/`/g, "'")}\`` : ''}`);
  } else {
    lines.push('**Directives ignored:** _none_');
  }
  const caps = r.capabilities;
  const absent = [];
  if (caps.manifest === 'absent') absent.push('ownership manifest absent');
  if (caps.suiteResult === 'absent') absent.push('suite result absent');
  if (caps.tracker !== 'reachable') absent.push(`tracker ${caps.tracker}`);
  if (caps.diffCoverage === 'partial') absent.push(`diff coverage partial (${caps.filesOmitted} file(s) not evaluated)`);
  if (caps.agentReview === 'absent') absent.push('agent review absent (machine rules only)');
  lines.push(`**Absent capabilities:** ${absent.length ? absent.join(' · ') : '_none — full review_'}`);
  if (r.suppressed && r.suppressed.length) lines.push(`**Suppressed by context:** ${r.suppressed.length} finding(s)`);
  lines.push(`**State hash:** before \`${r.stateHash.before.slice(0, 12)}\` · after \`${r.stateHash.after ? r.stateHash.after.slice(0, 12) : 'n/a'}\``);
  lines.push('');
  return lines.join('\n');
}

module.exports = { renderGateMarkdown, SUPPORTED_LOCALES };
