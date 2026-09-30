# /flow-lite adoption telemetry — what is collected, and what is never done with it

This is the first-run notice `flow-lite.js telemetry --notice` prints, and the one-page
description of the collection. They are the same text on purpose.

## What is collected

At the end of a `/flow-lite` run, one event is derived from the `run-summary.json` you
receive, with **fewer fields, never more**. You can see it before it leaves the machine
(`flow-lite.js telemetry --dry-run --out <run dir>`) and after
(`flow-lite.js telemetry --show-last`). The two are byte-for-byte the same payload.

| Dimension | What travels | Purpose |
|---|---|---|
| Identity | a pseudonymous id: sha256 of your git e-mail with an org-wide salt; a hash of the repository URL | count **how many** people and repositories use the tool |
| Context | profile name and version, agent version, hash of the base ref, whether `--report-only` was on | where and how it is used |
| Volume | items per batch, iterations (total, max, median) | how much |
| Usage shape | overrides by rule id, stop phases, exit codes | how the controls are exercised |
| Outcome | verdict counts, blockers by rule id, inconclusive rate | whether the gate helps |
| Cost | elapsed time and tokens by phase, with the measurement source status | capacity planning |

The event schema is version-controlled at `skills/flow-lite/schema/adoption-event.schema.json`.
A new field requires a pull request.

## What is never collected

Code, diffs, file excerpts, **file paths**, work-item keys, titles or descriptions, finding
text, `CLAUDE.md` content, branch names, credentials. Rule ids travel (`wiring`,
`honesty`); prose never does. File paths look harmless and are not: `src/Billing/ClientX/`
leaks business structure and sometimes a customer name.

## Where it goes and who reads it

The endpoint comes from configuration (`~/.claude/.change-reviewer/config.json`; a machine
that only has the legacy directory `~/.claude/.emstech-reviewer/` keeps using its legacy
config), from `CHANGE_REVIEWER_TELEMETRY_ENDPOINT` (or the legacy `EMSTECH_TELEMETRY_ENDPOINT`),
or from the same OTLP receiver your organisation already uses for Claude Code cost metrics.
**A clone with no endpoint configured sends nothing anywhere.** Headers only travel to the
endpoint of the same source: the `headers` of a `config.json` go only to that config's
endpoint, `OTEL_EXPORTER_OTLP_HEADERS` only to the OTEL endpoint, and an endpoint from an
environment variable or `--endpoint` gets no authentication header at all. The run summary
and `--notice` print which state directory and which endpoint source are in use. Transport is OTLP/HTTP, asynchronous
and fail-open: the run never waits on it, never fails because of it, and never slows down
for it. Offline runs are spooled locally, at most 50 events or 7 days, then silently
discarded.

The stream is read by whoever maintains the tool, to answer three questions: how many
people use it, at what volume, and in what shape.

Events carry `service.name = change-reviewer` since 2026-09-29; before that date the same
events carried the legacy `service.name = emstech-reviewer`. A query over the whole period
must join both values. The content of the event did not change with the name.

## Data-use boundary

- The distinct-user count is **a number**, not a list, and never a leaderboard.
- **No per-person dashboard**, and no "how many times was X blocked" metric.
- Agent metrics (confirmed-finding rate, override rate by rule, inconclusive rate, cost)
  and team metrics (blockers by rule, recurrence) live in separate dashboards.
- **Aggregation floor: no slice covering fewer than 5 people is ever rendered.** The
  reference aggregator (`flow-lite.js telemetry --aggregate`) implements the floor;
  a dashboard that does not is out of policy.

**Honest limit of the pseudonym.** With few repositories and small teams, the tuple
`id + repository + timestamp` identifies a person in practice, hash or no hash. The real
protection is the boundary above and the floor, not the hash. Without an org-wide salt
the id is per machine (`idScope: "machine"`), which counts machines, not people; the event
says so rather than pretending.

## How to turn it off

Any of these, at any time, with no other effect on the run:

```
flow-lite.js summary --no-telemetry
CHANGE_REVIEWER_TELEMETRY=off
EMSTECH_TELEMETRY=off                (legacy name, still honoured)
"enabled": false   in ~/.claude/.change-reviewer/config.json
"enabled": false   in ~/.claude/.emstech-reviewer/config.json   (legacy directory, still honoured)
```

Any one source that says off wins, and no source turns it back on: an opt-out made under
the legacy name (legacy variable or legacy directory) keeps working after the rename, and a
`config.json` that cannot be parsed counts as off. `telemetry --flush` checks the opt-out
before reading the spool.

`flow-lite.js telemetry --purge` deletes the local spool and the last-sent record from every
state directory it knows (new, legacy and the ones set by `CHANGE_REVIEWER_HOME` or the
legacy `EMSTECH_REVIEWER_HOME`).

## Acknowledgment

The run proceeds only after this notice has been acknowledged once on this machine:
`flow-lite.js telemetry --ack`. Until then, nothing is sent.
