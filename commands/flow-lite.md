# Flow Lite (batch of items, gate before every commit)

You orchestrate the implementation of a **batch of work items** with bounded scope per
item, mandatory honesty and a reviewer gate that runs **before** each commit. You delegate
implementation to the stack agent; you never implement yourself. `/flow-lite` is not less
rigor than `/flow`: it is **less volume with more rigor**.

## Context
$ARGUMENTS

## Why this command exists

The `/flow` experiment produced two failure modes: **inflation** (twice the production
code, three times the tests, subsystems duplicated in diverging versions, red CI) and
**silent dishonesty** (shipping as complete what the data model does not support). Every
control below targets one of the two. Do not skip a control to save time; the controls are
the deliverable.

## Tools you call

Scripts are distributed by `ahc sync`; paths below are the same on every machine.

| Purpose | Command |
|---|---|
| Gate, machine half | `node ~/.claude/skills/change-reviewer/scripts/gate.js <prepare|finalize|run|diff>` |
| Gate, judgement half | the `change-reviewer` agent (Agent tool), gate mode |
| Batch, ledger, summary, telemetry | `node ~/.claude/skills/flow-lite/scripts/flow-lite.js <manifest|order|reconcile|ledger|summary|telemetry>` |
| Alerts and the stall watchdog | `node ~/.claude/skills/flow-lite/scripts/flow-lite.js <notify|watch>` |
| Isolated worktree per item | `ahc worktree <branch>` |
| Token measurement | `~/.claude/skills/session-cost/scripts/otel-cost.js` (source A) via the ledger |

Set `OUT` to the run directory, `<repo>/.flow-lite/<batch-id>/`. Every artifact of the run
lands there.

## Pre-flight (mandatory, in this order)

1. **Load project context.** Read the target repository's `CLAUDE.md` cascade yourself
   (the gate will do it again, deterministically). If `.claude/memory/` exists, load it via
   `project-memory-keeper`. Note the verification command the project uses for its suite.
2. **Profile.** Resolve the profile the gate will use: `--profile` from the arguments, else
   `<repo>/.change-reviewer.json`, else the legacy `<repo>/.emstech-reviewer.json`, else
   `default`. Say which one; if the gate warns that both files exist, repeat the warning. A team on its **first
   run must use `--report-only`**; refuse to run in blocking mode for a repository whose
   `.flow-lite/` has no previous run unless the user says so explicitly.
3. **Telemetry notice.** Run `flow-lite.js telemetry --notice`. If it prints
   `awaiting-acknowledgment`, show the notice text to the user verbatim and wait for an
   explicit yes, then run `flow-lite.js telemetry --ack`. A "no" means run with
   `--no-telemetry`; never argue, never degrade the run. If it prints `disabled` or
   `not-configured`, continue.
4. **Ledger.** `flow-lite.js ledger init --out $OUT --batch <id> --base-ref <ref>
   --profile <name@version>`. From here on every phase is timed through the ledger; the
   summary at the end is derived from it, including when the run fails.
5. **Token source.** Run `otel-setup.js --check --json` from the `session-cost` skill.
   `live` → pass `--otel-cost ~/.claude/skills/session-cost/scripts/otel-cost.js` to every
   `ledger phase-start/phase-end`, so tokens per phase are measured including subagents.
   Anything else → omit the flag; the summary will print tokens as **not measured** with
   the cause. Never type a token figure yourself.

## Batch level

```
Item selection → ownership manifest → merge order → fan-out (one worktree per item)
  → [per-item pipeline] → reconciliation → open PRs in the declared order → run summary
```

### 1. Item selection

Take the item keys from the arguments or the tracker adapter of the profile. For each item,
record key, one-line intent, and the **budget** (files, lines) it will be held to. Default
budgets come from the profile; tighten them per item when the item is small. Write the
result to `$OUT/manifest.json`:

```json
{
  "schemaVersion": 1,
  "batch": "<id>",
  "items": [
    { "key": "ABC-1", "intent": "...", "dependsOn": [], "budget": { "maxFiles": 8, "maxLines": 250 }, "allowedPaths": ["src/billing/**", "tests/billing/**"] }
  ],
  "ownership": {}
}
```

### 2. Ownership manifest

**Before any code is written**, list every file more than one item could plausibly touch
(shared models, DI registrations, migrations index, route tables, shared test fixtures) and
assign each a **single owner** under `ownership`. Non-owners consume; they do not recreate.
Show the manifest to the user and get a yes. Then `flow-lite.js manifest validate
--manifest $OUT/manifest.json` (exit 2 stops the run with the reason).

### 3. Merge order

`flow-lite.js order --manifest $OUT/manifest.json` prints the topological order. A cycle
fails the batch here, before any worktree exists. Record the order.

### 4. Fan-out

For each item, in order: `ahc worktree <branch>` where `<branch>` is
`feat/<key-lowercase>` unless the profile's `branchTemplate` says otherwise. Record
`key → branch → path` in the manifest (`items[].branch`, `items[].worktree`). Items with
no dependency between them may run their pipelines in parallel sessions; items that depend
on another wait for that item's commit.

### 5. Per-item pipeline

Run it inside the item's worktree. Every phase is wrapped:

```
flow-lite.js ledger phase-start --out $OUT --item <key> --phase <phase> [--iteration N] [--otel-cost <script>]
... phase work ...
flow-lite.js ledger phase-end   --out $OUT --item <key> --phase <phase> [--iteration N] [--otel-cost <script>] --status ok|blocked|aborted|inconclusive
```

Phases and their stop points:

| Phase | Agent / tool | Stop point |
|---|---|---|
| `scope` | you | Restate the item in one sentence and list the files it should touch. |
| `analyze` | stack agent, read-only brief | Confirm which files exist, what consumes them, what the data model supports. **If the item needs data the model does not have, write that down now** as a declared limitation; it must reach the PR body and the agent's `declaredLimitations`. |
| `scope gate` | `gate.js --stage scope` → `change-reviewer` → `gate.js finalize` | **The reviewer judges the projection, not you.** Write `$OUT/<key>/projection.json` (`restatement`, `projectedFiles` with `action` and `estimatedLines`, `declaredLimitations`) and run the gate at stage `scope`. Over budget, outside the declared paths, or creating a file another item owns → exit `1`: **stop, propose a split, write nothing**. Record `--stop-phase scope` and continue with the next item. See below. |
| `plan` | stack agent | Atomic steps, each mapped to a file in the allowed paths. No new subsystems. |
| `implement` | stack agent | Code plus the minimum tests that fail without the change. Brief the agent with the ownership manifest: files owned by another item are **consumed, never created**. |
| `suite` | stack agent or you | Run the project's verification command from `CLAUDE.md`, or the profile's. Write `$OUT/<key>/suite-result.json`: `{ "schemaVersion": 1, "status": "passed|failed|not-run", "failed": [{ "name", "message" }], "command" }`. Never write `passed` for a suite you did not run. |
| `gate` | `gate.js prepare` → `change-reviewer` agent → `gate.js finalize` | See below. |
| `commit` | `/smart-commit` conventions | Only on exit `0`. |
| `push` | git | Only after the commit. |

### 5b. The scope gate (the cheapest place to be told no)

The reviewer runs **three times** in a batch, and this is the first. Judging the
projection before a line exists is where a "the data model does not support this" costs
nothing — at the commit gate the same finding costs the whole implementation.

```sh
node gate.js run --worktree <path> --base-ref <ref> --item <key> \
  --out $OUT/<key>/scope-gate --stage scope --projection $OUT/<key>/projection.json \
  --manifest $OUT/manifest.json [--profile <p>] [--report-only]
```

Dispatch the `change-reviewer` agent between `prepare` and `finalize` exactly as in the
change gate; the brief carries the stage's own question. The stage offers only the rules
its evidence supports — `honesty`, `ownership`, `scope`, `project-context`. It cannot ask
`suite` or `secret`, because no suite has run and there is no diff to scan.

**The state hash is the teeth here.** `finalize` re-reads the worktree: if it moved while
the scope was being judged, the exit code is `4` and the reason says code was written
before the scope gate cleared it. Do not start implementing during this review.

### 6. The gate (last step before the commit)

```sh
node gate.js prepare --worktree <path> --base-ref <ref> --item <key> --out $OUT/<key>/gate-<iteration> \
  --manifest $OUT/manifest.json --suite-result $OUT/<key>/suite-result.json [--profile <p>] --iteration <n> [--report-only]
```

Then dispatch the `change-reviewer` agent (Agent tool) in **gate mode** with exactly two
facts: the path of `gate-context.json` and the path where it must write
`agent-findings.json`. Do not paste the diff into the brief; the context file carries it.

```sh
node gate.js finalize --context $OUT/<key>/gate-<n>/gate-context.json --agent-findings $OUT/<key>/gate-<n>/agent-findings.json [--overrides <file>] [--report-only]
```

**Decide on the exit code alone:**

| Exit | Meaning | What you do |
|---|---|---|
| `0` | cleared | commit, with the trailers from `gate.json.commitTrailers` |
| `1` | blocker | remediation loop (below) |
| `2` | bad input | abort the item, `--stop-phase gate`, report the stderr line |
| `3` | missing configuration or credential | abort the item, tell the user what is missing |
| `4` | inconclusive | **no commit**. One sentence naming the cause from `gate.json.inconclusiveReason`. |

`gate.md` is for the human; attach it to the PR body. `gate.json` is for you.

### 7. Remediation loop

On exit `1`, hand `gate.json` findings back to the stack agent with the instruction to fix
**only** the blockers listed, then rerun `suite` and the **whole** gate as a fresh
iteration (`--iteration n+1`). Fixing one blocker can create another. The cap is
`profile.remediation.maxIterations` (default **2**). When the cap is exceeded: stop, do
not commit, open the PR **flagged blocked** with the findings in the body (see 9).

**The reviewer never fixes.** If the agent proposes an edit, discard it. The scripts
re-hash the worktree at finalize and return `4` if anything moved during the review.

### 8. Overrides

There is no "skip the gate". There is "accept this blocker, for this reason", per finding.
When the user decides to accept a specific blocker, write
`$OUT/<key>/overrides.json`:

```json
[{ "findingId": "scope-001", "by": "<name>", "at": "<UTC ISO>", "justification": "<why, at least 10 characters>" }]
```

and rerun `finalize` with `--overrides`. The override lands in the commit as a
`Gate-Override` trailer and in the PR body as a mandatory review item. When the profile
lists the finding's rule under `overrideRequiresSecondApprover`, the PR body says so; the
second pair of eyes happens in the PR, where it is real and traceable.

### 9. Commit, push, PR

Commit message: Conventional Commits, the item key in the subject, body from the item's
intent, then the trailers: every line of `gate.json.commitTrailers`, then
`Co-Authored-By` for the assistant. Push the branch.

Do **not** open PRs yet: reconciliation comes first.

### 10. Reconciliation (before any PR)

```sh
node flow-lite.js reconcile --worktree <repo> --base-ref <ref> --manifest $OUT/manifest.json --out $OUT
```

Exit `1` means at least one file was **created by more than one item with diverging
content**. Each PR would look mergeable alone; the cost surfaces at the first merge. **Fail
the batch here**: report the collisions from `$OUT/reconcile.json`, open no PR, and end
with the run summary. Identical content in two items is reported but does not fail.

Then run the reviewer over the same report — the **third** and last gate of the batch:

```sh
node gate.js run --worktree <repo> --base-ref <ref> --item BATCH \
  --out $OUT/reconcile-gate --stage reconcile --reconcile-report $OUT/reconcile.json \
  --manifest $OUT/manifest.json [--profile <p>] [--report-only]
```

The byte-compare above answers "are these the same bytes?". This stage asks what it
cannot: **did two items build the same subsystem under different names, or duplicate a
validation that can now diverge?** Two files that never collide by path are exactly how
duplicated subsystems get through. Exit `1` fails the batch like any other blocker — before
any PR exists.

### 11. Open PRs in the declared order

For each item in merge order: `gh pr create` with base = the ref (or the previous item's
branch when `dependsOn` says so), body = intent, declared limitations, the `gate.md`,
overrides as a checklist, and, for items that hit the iteration cap, the title prefix
`[BLOCKED]` and the blockers first. No auto-merge, no approval, no closing.

Record each item: `flow-lite.js ledger item-end --out $OUT --item <key> --outcome
committed|blocked|aborted|inconclusive --verdict <v> --exit-code <n> [--stop-phase <p>]
--gate-json <last gate.json>`.

Once the PRs are open, dispatch `change-reviewer` in **`pr` mode**, one comment per PR,
updated in place. This is the asynchronous half of the agent and the only gate that runs
after the batch ends; it never blocks a commit, because there is nothing left to block.

## Reaching the human (mandatory at every stop point)

A batch is unattended by design — you start it and go do something else. That only works
if the run can reach you. Raise an alert at **each of the three stop points**, and never
instead of the normal report:

```sh
node flow-lite.js notify --event needs-input --item <key> --message "<one line>"
node flow-lite.js notify --event blocked     --item <key> --message "<one line>"
```

| Moment | Event |
|---|---|
| Scope gate says split, or an override needs a decision | `needs-input` |
| Telemetry notice is awaiting a yes (pre-flight step 3) | `needs-input` |
| Blocker survived the remediation cap; the PR will be `[BLOCKED]` | `blocked` |
| Exit `2`, `3` or `4` aborted an item | `failed` |
| Batch finished | `done` |

**And start the watchdog right after `ledger init`, in the background:**

```sh
node flow-lite.js watch --out $OUT --stall-after 600 &
```

It is the only thing that can report the failure you cannot: a run that stopped moving.
A wedged orchestrator writes nothing, so something outside it has to read the clock. The
watchdog alerts once per phase left open past the threshold, and exits on its own when the
ledger stops saying `running`.

Alerts go to stderr, the terminal bell and the OS notifier — **never to stdout**, which
carries the run-summary block. Off with `--no-notify` or `FLOW_LITE_NOTIFY=off`; off by
default in CI. A notification that fails never fails the run.

## Run summary (mandatory, every run, including failed ones)

The **last** thing you do, on every path (batch failed, item aborted, gate blocked, user
stopped you):

```sh
node flow-lite.js ledger batch-end --out $OUT --status completed|failed [--reason "..."]
node flow-lite.js summary --out $OUT [--no-telemetry]
```

It prints the closing block (tokens and time by batch, item, phase and iteration; the
telemetry line; the "measures tool usage, not productivity" caveat) and writes
`run-summary.json` and `run-summary.md`. Paste the block as your final message. If the
script itself fails, say so in one line and still end the run; never reconstruct the
numbers by hand.

## Rules

- **Never write code yourself.** Delegate to the stack agent with a bounded brief.
- **Bounded scope per item.** Over budget means split, not stretch.
- **Declared beats inferred.** A limitation written in the PR and in `declaredLimitations`
  is a shipped result. An inference is a blocker.
- **Consume, do not recreate.** The ownership manifest is law for every brief you write.
- **The gate decides on its exit code; you do not re-litigate it.** A `question` in the
  report is not a reason to hold the commit.
- **Fail-closed on 4.** No commit on inconclusive, ever, whatever the reason.
- **Measured, never estimated.** Tokens and time come from the ledger and the scripts.
- **Telemetry never blocks.** `--no-telemetry`, `CHANGE_REVIEWER_TELEMETRY=off` or the legacy `EMSTECH_TELEMETRY=off` changes nothing
  else about the run.
- **v1 non-goals**: auto-merge, auto-approval, closing PRs, automatic conflict resolution,
  applying DDL anywhere, decomposing items in the tracker without a human, per-person
  metrics.

## Output (per item)

```
[<key>] <phase> — <agent/tool> — <OK|BLOCKED|ABORTED|INCONCLUSIVE>
  Gate:        exit <n> · <b> blocker · <m> major · <q> question · iteration <i>/<cap>
  Limitations: <declared, or none>
  Next:        <phase or "commit">
```

## Output (final)

The run-summary block printed by `flow-lite.js summary`, verbatim.
