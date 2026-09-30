---
name: flow-lite
description: Deterministic half of the /flow-lite command. Use when the command needs to validate an ownership manifest, compute the merge order of a batch, reconcile files created by more than one item across branches, record phase timings and measured tokens in the run ledger, print the mandatory run-summary block, or handle adoption telemetry (notice, ack, dry-run, show-last, purge, aggregate with the 5-people floor). Pairs with the change-reviewer skill and agent.
---

# flow-lite (scripts)

`scripts/flow-lite.js` is what the `/flow-lite` command calls for everything that must be
deterministic: batch controls, the run ledger, the closing summary and the adoption event.
Installed by `ahc sync` at `~/.claude/skills/flow-lite/scripts/`. Git access goes through
the read-only executor of the `change-reviewer` skill, so this skill cannot write to a
repository either.

## Batch controls

| Command | What it enforces | Exit |
|---|---|---|
| `manifest validate --manifest <file>` | unique keys, owners are items, dependsOn resolves | 2 on error |
| `order --manifest <file>` | topological merge order; **a cycle fails the batch** | 1 on cycle |
| `reconcile --worktree <repo> --base-ref <ref> --manifest <file> [--out <dir>]` | files created by more than one item; **diverging content fails the batch before any PR** | 1 on divergence |

Ownership manifest shape:

```json
{ "schemaVersion": 1, "batch": "<id>",
  "items": [{ "key": "ABC-1", "dependsOn": [], "budget": { "maxFiles": 8, "maxLines": 250 }, "allowedPaths": ["src/**"], "branch": "feat/abc-1" }],
  "ownership": { "src/shared/Model.cs": "ABC-1" } }
```

## Ledger and summary

```
ledger init        --out <dir> --batch <id> [--base-ref <ref>] [--profile name@version] [--report-only]
ledger phase-start --out <dir> --item <key> --phase <phase> [--iteration N] [--otel-cost <otel-cost.js>]
ledger phase-end   --out <dir> --item <key> --phase <phase> [--iteration N] [--otel-cost <otel-cost.js>] --status ok|blocked|aborted|inconclusive
ledger item-end    --out <dir> --item <key> --outcome committed|blocked|aborted|inconclusive|skipped [--gate-json <gate.json>]
ledger batch-end   --out <dir> --status completed|failed [--reason <text>]
summary            --out <dir> [--no-telemetry] [--dry-run] [--endpoint <url>]
```

Wall-clock time is stamped by the script. Tokens are measured **only** through
`otel-cost.js` from the `session-cost` skill (snapshot at phase start, report at phase end,
subagents included). Without it, or when it fails, the phase reads `not-measured` or
`inconclusive` with the cause, and the total is `inconclusive`. Nothing is estimated.
`summary` always prints the block and writes `run-summary.json` and `run-summary.md`,
including on failed runs, and ends with the mandatory caveat: the data measures tool usage,
not productivity.

## Alerts and the stall watchdog

A batch is unattended by design, so the run has to be able to reach the human.

```
notify --event needs-input|blocked|stalled|failed|done [--item <key>] [--message <text>]
watch  --out <dir> [--stall-after 600] [--interval 30] [--once]
```

`notify` is the one-shot alert the orchestrator raises at a stop point. `watch` is the only
thing that can report the failure the run cannot report itself: a phase left open past the
threshold, because a wedged orchestrator writes nothing and something outside it has to
read the clock. It alerts once per phase and exits when the ledger stops saying `running`.

Three channels: a stderr banner, the terminal bell (one ring for `done`, three for a
blocker or a stall), and the OS notifier — `osascript` on macOS, `notify-send` on Linux,
a beep on Windows. Every external call is spawned detached and unref'd, so a notifier that
hangs cannot hold the run open, and **nothing is ever written to stdout**, which carries
the run-summary block. A failed notification is recorded and swallowed: an exit code never
depends on whether a sound played. Off with `--no-notify` or `FLOW_LITE_NOTIFY=off`, and
off by default under `CI` unless `FLOW_LITE_NOTIFY=on`.

## Telemetry

See [TELEMETRY.md](TELEMETRY.md), which is also the first-run notice. Commands:
`telemetry --notice | --ack | --dry-run --out <dir> | --show-last | --purge | --flush |
--aggregate <events.ndjson> [--min-people 5]`. Off switches: `--no-telemetry`,
`CHANGE_REVIEWER_TELEMETRY=off` (the legacy `EMSTECH_TELEMETRY=off` still works),
`"enabled": false` in the config of any state directory, new or legacy. Any source that
says off wins. Empty endpoint sends nothing.
