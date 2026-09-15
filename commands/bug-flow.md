# Bug Flow

You orchestrate a bug from "report" to "fix merged with regression test". You don't implement — you diagnose, route, and gate.

## Context
$ARGUMENTS

## Mission

Move a bug through triage → root cause → fix → regression test → security review (if relevant) → commit, with explicit gates between phases. Every fix ships with a regression test that **fails before the fix and passes after**. No exception.

## Pre-flight (mandatory)

1. **Load project memory.** Invoke `project-memory-keeper` for a context load. If `.claude/memory/{business,architecture,guidelines}.md` is missing, ask the user to run `/bootstrap-project` first and stop.
2. **Confirm the report.** Restate the symptom in one sentence. Get reproduction steps, expected vs actual, environment, and (if available) stack trace / log / request ID. Do not move on with hand-waved repro.
3. **Allocate the demand ID.** Pick the next `NNN` and create `docs/todo/<NNN>-<kebab-name>/bug.md` from the template below.

## Phase chain

### Phase 1 — Triage & isolation

**Owner:** you (orchestrator) with stack-aware help if needed.
**Action:**
- Reproduce locally if possible. If not reproducible, document the gap explicitly.
- Locate the suspect file(s) and line(s). Read the surrounding code, not just the failing line.
- Capture initial hypotheses and rule-outs.
**Exit gate:** repro is documented (or marked "non-reproducible — needs more data"). Suspect surface is named.

### Phase 2 — Root Cause Analysis

**Agent — pick by stack:**
- Go → `go-senior-engineer`
- .NET → `dotnet-backend-architect`
- React/frontend → `senior-react-developer`
- Postgres / DB → `postgres-dba`
- Infra / pipeline → `aws-devops-engineer`
- Cross-service / integration → `integration-architect`

**Inputs:** repro, stack trace, suspect files, recent diffs in the area (`git log`, `git blame`).
**Produces:** in `bug.md` — Root Cause section with the specific defect (not a symptom), the minimal evidence chain, and the affected files/lines.
**Exit gate:** the root cause is **specific** ("`internal/cache/cache.go:142` — non-atomic compare-and-swap under contention"), not vague ("concurrency issue").
**Memory side-effect:** if the bug is an instance of a class already in `guidelines.md` (banned anti-pattern) → flag the regression. If it's a new class → handoff to `project-memory-keeper` after fix to add the anti-pattern.

### Phase 3 — Severity & impact

**Owner:** you.
**Classify:**
- **S1 — Critical:** prod down, data loss, security breach, money at risk. Hotfix path.
- **S2 — High:** core flow broken for many users; reliable workaround missing.
- **S3 — Medium:** non-core flow broken or degraded; workaround exists.
- **S4 — Low:** cosmetic / edge case / no user-visible impact.

**Sensitive surface check:** if the bug is in or near auth, authz, secrets, PII, payments, file handling, deserialization, raw SQL, multi-tenant isolation → **flag for security review in Phase 6 (mandatory)**.

### Phase 4 — Fix

**Agent:** same stack-specific dev as Phase 2.
**Branch:** `fix/<kebab-name>` (or `fix/<NNN>-<kebab-name>`).
**Inputs:** RCA, `guidelines.md` (so the fix follows the project's idiom — no introducing a new pattern just because).
**Produces:** the smallest correct change that addresses the root cause, plus a **regression test that fails before the fix and passes after** (write the test first whenever feasible).
**Exit gate:**
- Root cause is addressed (not just the symptom).
- Regression test exists and toggles correctly when the fix is reverted.
- No drive-by refactors mixed in. If cleanup is warranted, file a separate task.

### Phase 5 — QA / regression

**Agent:** `go-sdet-backend` (Go), `cypress-qa-analyst` (frontend/E2E), or both.
**Action:**
- Validate the regression test catches the bug.
- Add adjacent tests if the RCA suggests a class of inputs (boundary, fuzz, race) is undertested.
- Smoke-test the surrounding area for collateral.
**Exit gate:** all tests green; the new regression test is part of the default run.

### Phase 6 — Security gate (mandatory when the "Sensitive surface check" in Phase 3 flagged anything)

**Agent:** `security-specialist`.
**Action:** audit the diff specifically for the sensitive surface flagged in Phase 3.
**Exit gate:** **APPROVE** or **APPROVE WITH MITIGATIONS** (recorded in `architecture.md`). **BLOCK** loops to Phase 4.

### Phase 7 — Review

**Command:** `/code-review`.
**Exit gate:** no BLOCKERs.

### Phase 8 — Memory sync

**Agent:** `project-memory-keeper`.
**Action:**
- If the bug is a new class of vuln → record in `guidelines.md` (the anti-pattern + the correct idiom + a link to the test that prevents recurrence).
- If the bug exposed a wrong NFR / threat / control → update `architecture.md`.
- If a domain-rule misunderstanding caused the bug → update `business.md`.

### Phase 9 — Commit & close

**Command:** `/smart-commit` (`fix:` type, scope inferred from touched modules).
**Action:** move `docs/todo/<NNN>-<kebab-name>/` → `docs/done/<NNN>-<kebab-name>/`. For S1, also: update CHANGELOG and post a one-paragraph incident summary to the team's on-call / incident channel (the channel name lives in `.claude/memory/architecture.md` under "Operations" — ask the user if absent).
**Output:** final summary table.

## `bug.md` template (write this on pre-flight)

```markdown
<!-- demand: NNN-<kebab-name> -->
<!-- created: YYYY-MM-DD -->
<!-- severity: S1|S2|S3|S4 -->
# Bug: <human title>

## 1. Report
**Reporter:**
**Environment:** prod | staging | dev
**First seen:** YYYY-MM-DD
**Symptom (one sentence):**
**Frequency / blast radius:**

## 2. Reproduction
**Steps:**
1.
2.
**Expected:**
**Actual:**
**Evidence:** (stack trace, log line, request ID, screenshot path)

## 3. Root Cause Analysis _(filled in Phase 2)_
**Suspect file(s):** path:line
**Defect:** (specific — not "concurrency issue", but the exact mis-step)
**Why it wasn't caught:** (test gap, missing assertion, untested input class)
**Hypotheses ruled out:**

## 4. Severity & impact _(filled in Phase 3)_
**Severity:** S1 | S2 | S3 | S4
**Users affected:**
**Workaround available:** yes / no — describe
**Sensitive surface flag:**
- [ ] Auth / AuthZ
- [ ] Secrets / PII
- [ ] Payments
- [ ] File handling / deserialization
- [ ] Raw SQL / shell exec
- [ ] Multi-tenant isolation
- [ ] None

## 5. Fix _(filled in Phase 4)_
**Approach:**
**Files changed:**
**Regression test:** path/to/test — fails before fix, passes after

## 6. Definition of Done
- [ ] Repro no longer reproduces
- [ ] Regression test added and passing
- [ ] No collateral broken
- [ ] Security verdict APPROVE (if Phase 6 ran)
- [ ] Memory updated (if new vuln class / NFR / domain learning)
- [ ] CHANGELOG entry (if S1 or S2)
```

## Rules

- **Specific RCA or no fix.** "Concurrency issue" is not a root cause; "non-atomic CAS at `cache.go:142` under N≥2 writers" is.
- **Regression test mandatory.** No fix merges without a test that pins the bug.
- **No drive-by refactors.** A bug fix is one change. Cleanup goes through `/feature-flow` or its own task.
- **S1 fast path:** Phases 1 → 2 → 4 → 5 → 6 (if applicable) → 7 (mandatory, but abbreviated to BLOCKERs only) → 9. Phase 3 was implicit — the act of declaring S1 already classified severity. Phase 8 (memory sync) follows within 24h post-merge — do not block the fix on it, but do not skip it.
- **Stop on BLOCK.** Security or review BLOCK halts the flow; loop back to Phase 4 with the specific finding.

## Output (after each phase)

```
[NNN-<name>] Phase X — <Agent/Command> — <PASS|BLOCK>
  Produced: <artifacts>
  Next: Phase X+1
```

## Output (final)

```
[NNN-<name>] DONE — branch: fix/<kebab-name> — severity: SX
  RCA:        <one sentence>
  Files:      N changed
  Tests:      regression added at <path>
  Security:   APPROVE | n/a
  Memory:     <files updated, or "no new learning">
  Follow-ups: ...
```
