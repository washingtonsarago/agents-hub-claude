# Adopting `/flow-lite` and the change-reviewer gate

For a team that has never run the gate. Ten minutes, three steps, and one rule that is
not negotiable: **the first run is `--report-only`.**

## What you get

`/flow-lite` implements a batch of work items with a stack agent, under three controls:
a **budget per item** (over budget means split, not stretch), a **reviewer gate before
every commit** (exit code decides, only confirmed blockers block), and **batch
reconciliation** (files created by more than one item with diverging content fail the batch
before any PR exists). `change-reviewer` is the reviewer: one agent, `gate` mode before
the commit and `pr` mode on open pull requests.

## Step 1 — report-only, mandatory

Run the gate on a change you already know, with blocking off:

```sh
node ~/.claude/skills/change-reviewer/scripts/gate.js run \
  --worktree . --base-ref origin/main --item TRIAL-1 --out .flow-lite/trial --report-only
```

Read `.flow-lite/trial/gate.md`. In report-only the verdict is real but the exit code is
forced to `0`. You are looking for two things:

1. **Findings that contradict a decision your team made on purpose.** Those belong in
   your `CLAUDE.md` (next step), not in an override.
2. **Absent capabilities in the footer.** No manifest, no suite result, tracker not
   configured: each one narrows what the gate can see, and each is declared, never hidden.

`/flow-lite` refuses to run in blocking mode for a repository that has no previous
`.flow-lite/` run unless you say so explicitly.

## Step 2 — write down what your project decided

The gate reads your `CLAUDE.md` cascade (touched directory → repository root → workspace
root; `CLAUDE.local.md` may only tighten; `.claude/memory/*.md` contributes conventions and
scope exceptions only) **before** evaluating any rule. Machine-readable directives go in a
fenced block:

````markdown
```change-reviewer
{
  "conventions": [{ "id": "validators-in-two-layers", "description": "Client and server validators are generated from one schema", "suppresses": ["rule-parity"], "paths": ["src/api/**"] }],
  "prohibitions": [{ "id": "no-raw-sql", "description": "Raw SQL is forbidden in billing", "pattern": "ExecuteSqlRaw", "paths": ["src/billing/**"] }],
  "rules": [{ "id": "no-todo", "severity": "major", "pattern": "TODO", "description": "No TODO left behind" }],
  "sensitivePaths": ["src/billing/**"],
  "scopeExceptions": ["generated/**"],
  "verification": { "suite": "dotnet test", "lint": "dotnet format --verify-no-changes" }
}
```
````

| Category | Effect |
|---|---|
| `conventions` | suppress findings of **non-structural** rules on the given paths |
| `rules` | add a check (a regex on added lines) at the severity you choose |
| `prohibitions` | a blocker even without a core rule |
| `sensitivePaths` | a confirmed `major` under the path becomes a `blocker` |
| `scopeExceptions` | paths removed from evaluation |
| `verification` | how the pipeline runs your suite and linters |

What `CLAUDE.md` **cannot** do, and the report says so when it tries: disable the gate or a
structural rule (`honesty`, `ownership`, `suite`, `secret`), downgrade a blocker, grant an
automatic override, change exit codes or output, or tell the reviewer not to report
something. `CLAUDE.md` is input data, not an instruction to the agent. Otherwise the easiest
way to pass the gate would be editing it in the same commit.

## Step 3 — a profile, if the default does not fit

Everything team-specific enters through a profile. Start from
`profiles/default.json`; `profiles/regulated.json` shows a stricter one (tracker required,
domain rules, second approver for overrides of some rules). Point your repository at it:

```json
// .change-reviewer.json at the repository root
{ "profile": "path/to/your-team.json" }
```

A repository adopted before the rename keeps working unchanged:
the legacy `.emstech-reviewer.json` is still read when `.change-reviewer.json` does not exist,
and a legacy ` ```emstech-reviewer ` block in `CLAUDE.md` is parsed exactly like the new tag. If
both profile files exist, the new one wins and the gate says on stderr that the legacy file
was ignored.

A profile may **add** rules and **raise** severities. It may never lower a core severity,
redefine a core rule, or make a structural rule optional; a test in the hub enforces that
boundary. If something your team needs does not fit the profile format, the core is wrong:
open an issue, do not hardcode.

## Exit codes, once more

| Code | Meaning | `/flow-lite` does |
|---|---|---|
| `0` | cleared | commits |
| `1` | blocker | remediation loop, cap 2 by default |
| `2` | bad usage or invalid input | aborts the item |
| `3` | missing configuration or credential | aborts the item |
| `4` | inconclusive, could not look | **no commit**, one sentence naming the cause |

`4` is fail-closed on purpose. The diff, the worktree or `CLAUDE.md` being unreadable is
always `4`. A tracker being down is `4` only when your profile lists `tracker` under
`requiredCapabilities`.

## Overrides

Per finding, never global, never "skip the gate":

```json
[{ "findingId": "scope-001", "by": "your name", "at": "2026-09-17T15:00:00Z", "justification": "three files agreed with the PO for this item" }]
```

The override lands in the commit as a `Gate-Override` trailer and in the PR body as a
mandatory review item. When the profile lists the rule under
`overrideRequiresSecondApprover`, the PR says so: the second pair of eyes happens in the
PR, where it is real and traceable, not in a name pasted at commit time.

## Telemetry

`/flow-lite` prints a run summary for you at the end of every run (tokens and time by
phase, item and iteration, measured or declared not measured). Separately, one adoption
event derived from that summary, identifiers and counts only, can be sent to your
organisation's OTLP receiver. Read [flow-lite/TELEMETRY.md](../flow-lite/TELEMETRY.md):
it is the first-run notice, the data-use boundary and the off switch, in one page.
