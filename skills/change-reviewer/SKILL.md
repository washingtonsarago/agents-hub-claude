---
name: change-reviewer
description: Deterministic half of the change-reviewer gate. Use when a command needs to read a worktree's change against a base ref through a read-only git executor, pin a verdict to a worktree state hash, or (in later phases) run the rule engine, validate gate findings, write gate.json and gate.md and emit run telemetry. Never modifies the worktree it reads. Pairs with the change-reviewer agent and the /flow-lite command.
---

# change-reviewer (scripts)

The scripts in this skill are the part of the reviewer that must be **provably** read-only
and **deterministic**: exit codes, JSON shape and the state hash come from here, never from
a model's judgement. The `change-reviewer` agent judges; these scripts read, validate and
decide the exit code.

Installed by `ahc sync` at `~/.claude/skills/change-reviewer/scripts/`.

## Read-only by construction

Every git call goes through `scripts/lib/git-readonly.js`. Its subcommand table contains
only `diff`, `rev-parse`, `ls-files`, `show`, `log`, `status`, `merge-base`, `cat-file` and
`rev-list`. `checkout`, `reset`, `pull`, `rebase`, `merge`, `commit`, `add`, `stash` and
`push` are not rejected at run time: they are absent, so no code path reaches them.
Options that redirect output to disk or re-point git at another repository (`--output`,
`-o`, `--git-dir`, `--work-tree`, `-c`, `-C`) are refused before anything is spawned.

## `gate.js diff`

```sh
node ~/.claude/skills/change-reviewer/scripts/gate.js diff \
  --worktree <path> --base-ref <ref> [--max-patch-bytes N] [--out <file>]
```

Reads the change the worktree carries against the merge-base of `<ref>` and `HEAD`:
staged and unstaged edits plus untracked, non-ignored files. Output is JSON:

| Field | Meaning |
|---|---|
| `baseSha`, `mergeBaseSha`, `headSha` | the refs the change was read against |
| `stateHash` | sha256 over the **full** diff and every untracked file; pins the verdict to this exact worktree state |
| `coverage.mode` | `full`, or `partial` when the patch byte budget ran out |
| `coverage.filesOmitted` | how many files carry no patch because of the budget. A count, never names |
| `files[]` | `path`, `status` (`A`/`M`/`D`), `untracked`, `binary`, `additions`, `deletions`, `patch` or `null`, `omitted` |

The budget (`--max-patch-bytes`, default 400000) bounds what is sent to the model. It
never bounds the state hash. A verdict over `coverage.mode: partial` is not the same
verdict as one over `full`; later phases surface that as `capabilities.diffCoverage`.

## `gate.js state-hash`

Prints only the state hash. `finalize` (later phase) calls this before and after the review
and records both in `gate.json`; a mismatch means the worktree moved during the review and
the verdict is not issued.

## Stages (`--stage`, default `change`)

The gate runs at three moments of `/flow-lite`, and each is bounded by the evidence it has.
A stage selects from the same core rule set; it never invents one.

| Stage | Extra input | Rules it may ask | Why it exists |
|---|---|---|---|
| `scope` | `--projection <file>` | `honesty` `ownership` `scope` `project-context` | Judges the projected file list before a line is written. The cheapest place to be told the data model does not support the item. `suite` and `secret` are unreachable here: no suite has run, no diff exists. |
| `change` | — | all | The original gate: the worktree diff, last step before the commit. |
| `reconcile` | `--reconcile-report <file>` | `honesty` `ownership` `wiring` `rule-parity` `project-context` | Judges the files two items both created, before any PR. The mechanical byte-compare already failed divergent copies; this asks about duplication it cannot see. |

Every stage still pins its verdict to the worktree state hash. At `scope` that is the
sharper check of the two: if the worktree moved while the projection was being judged,
`finalize` returns `4` and says code was written before the scope gate cleared it.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | ok |
| `2` | bad usage or invalid input (unknown flag, base ref that does not resolve) |
| `4` | inconclusive: the worktree, its HEAD or its diff could not be read. Fail-closed |

Codes `1` (blocker) and `3` (missing configuration or credential) are reserved for the
rule engine and finalize.
