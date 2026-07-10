# Flow (GOAL → SHIP)

You orchestrate a change end-to-end through the squad across **seven named phases**: `GOAL → DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP`. You do not implement — you delegate, gate, and synthesize. Every phase ties back to the **GOAL metric**: that traceability is the point of this command.

This is the phase-labeled orchestrator. It prepends a **GOAL** stage (the north-star metric) to the delivery chain so nothing gets built without a measurable outcome to trace it to. It supersedes `/feature-flow`, which runs the same delivery chain without the GOAL anchor.

## Context
$ARGUMENTS

## Mission

Take an idea from "why are we doing this" to "merged, measured change" by routing it through the right agents in the right order, with an explicit gate between each phase. Nothing skips. Nothing duplicates work another agent already produced. Every downstream artifact references the **GOAL metric** — if a phase can't tie back to it, that's a signal to stop and re-scope.

## Pre-flight (mandatory)

1. **Load project memory.** Invoke `project-memory-keeper` for a context load. If `.claude/memory/{business,architecture,guidelines}.md` is missing, ask the user to run `/bootstrap-project` first and stop.
2. **Confirm intent.** Restate the idea in one sentence and confirm with the user before spending tokens on the chain. Surface ambiguity early.
3. **Allocate the demand ID.** Pick the next `NNN` (3-digit, zero-padded) by scanning `docs/todo/` and `docs/done/`. Create `docs/todo/<NNN>-<kebab-name>/task.md` from the template below.

## Phase chain

Run phases in order. Each phase has an entry contract, a designated agent/command, and an **exit gate**. Do not advance past a gate that is not green. The **GOAL metric** established in Phase 0 is the thread — carry it forward into every phase's brief.

### Phase 0 — GOAL (North-Star)

**Command:** `/goal`
**Inputs:** the user intent, `business.md`.
**Produces:** a north-star at `docs/goals/<slug>.md` — one **Objective**, 2–4 **Key Results** each with a **baseline + target**, **guardrails** (what must not get worse), and **non-goals**.
**Exit gate:** exactly one objective; every KR has a named baseline (value + source) and a target + date, or is explicitly marked `[baseline unknown → measure first]`; at least one counter-metric present. If the *problem itself* is unvalidated, run `/discovery` first, then return here.
**Carry-forward:** copy the Objective + KRs into `task.md` section 0 as the **GOAL** — this is the anchor every later phase must reference.
**Memory side-effect:** none yet; the goal is strategy, not a system change.

> The GOAL phase is what separates this from a plain delivery chain: if you can't state the objective and its KR baselines, you're not ready to spec.

### Phase 1 — DEFINE (Spec / PO)

**Agent:** `senior-product-owner`
**Inputs:** the Phase 0 brief, `business.md`.
**Produces:** in `task.md` — Description (problem + business value), user segment, INVEST stories, Acceptance Criteria in Gherkin, Out of scope, and the **GOAL-metric linkage** (which AC, when satisfied, move the metric).
**Exit gate:** AC are testable, scope is bounded, no business-rule conflict with `business.md`, and **at least one AC traces to the GOAL metric**.
**Memory side-effect:** if a new domain rule emerges → handoff to `project-memory-keeper` to update `business.md`.

### Phase 2 — PLAN (Architecture)

**Agent:** `system-architect`. For integration-heavy work also consult `integration-architect`. For DB-heavy work also consult `postgres-dba`.
**Inputs:** Phase 0 + 1 output, `architecture.md`.
**Produces:** in `task.md` — Implementation guide (components touched, new contracts, data flow, NFR impact), trade-offs considered, recommended approach, and a **decomposition into small, atomic, independently verifiable tasks** (each mappable to AC). ADR if a structural decision is made.
**Exit gate:**
- Tasks are atomic and ordered by dependency; maintainability + scalability acceptable.
- **NFR impact does not jeopardize the GOAL metric** (e.g. a latency KR isn't undercut by the design).
- **Sensitive surface flagged** for `security-specialist` if the change touches: auth, authz, session, secrets, PII, payments, file upload/download, deserialization, raw SQL, shell exec, multi-tenant isolation, or a new external integration / trust boundary.
**Memory side-effect:** ADR + update to `architecture.md` (decisions log, integrations, threat models if applicable).

### Phase 2.5 — Threat modeling (Security, conditional)

**Agent:** `security-specialist`
**Trigger:** Phase 2 flagged a sensitive surface. **Mandatory** when the change crosses a trust boundary.
**Inputs:** Phase 2 design, `architecture.md` (existing controls).
**Produces:** STRIDE table + a "Required controls" list appended to `task.md`'s Security section.
**Exit gate:** required controls are concrete and assigned to the BUILD phase.

### Phase 3 — BUILD (stack-aware Dev)

**Agent — pick by detected stack** (read `architecture.md` and the manifests):
- Go → `go-senior-engineer`
- .NET → `dotnet-backend-architect`
- Node/TypeScript → `nodejs-backend-architect`
- Python → `python-engineer`
- React/frontend → `senior-react-developer`
- Postgres-heavy work → `postgres-dba` (alongside the dev agent)
- Infra/IaC → `aws-devops-engineer`

**Branch:** `feat/<kebab-name>` (or `feat/<NNN>-<kebab-name>` if the team prefixes with the demand ID).
**Inputs:** Phase 1 + 2 (+ 2.5) outputs, `guidelines.md` for in-repo conventions.
**Produces:** code + unit tests, **one atomic slice at a time**, following the conventions actually in use (verified against `guidelines.md`). Instrument the **GOAL metric** if it isn't already measurable in prod (event, counter, timer).
**Exit gate:** all AC items are checkable in the diff; lint + unit tests pass locally; the GOAL metric is instrumented or already observable.
**Memory side-effect:** if a new pattern is introduced or a convention learned → handoff to `project-memory-keeper` for `guidelines.md`.

### Phase 4 — VERIFY (QA/SDET + Security gate)

**Agent — pick by stack:**
- Go services → `go-sdet-backend`
- Frontend / E2E → `cypress-qa-analyst`
- Both, when the change spans front + back.

**Inputs:** Phase 3 diff + AC.
**Produces:** integration / E2E / fuzz tests as appropriate, a traceability matrix (AC → test), and confirmation that the **GOAL metric is observable** (the instrumentation from Phase 3 emits and is queryable).
**Then, always:** `security-specialist` runs the security gate. If Phase 2.5 produced a STRIDE table, validate the required controls actually landed in the diff. Otherwise, run a fast pass on the touched files (secret scan + OWASP-relevant checks).
**Exit gate:** every AC has at least one automated test that **fails without the change**; the GOAL metric emits; security verdict is **APPROVE** or **APPROVE WITH MITIGATIONS** (mitigations recorded in `architecture.md`). **BLOCK** halts the flow until BUILD loops back.

### Phase 5 — REVIEW

**Command:** `/code-review`
**Inputs:** the full diff vs main.
**Exit gate:** no BLOCKERs.

### Phase 6 — SHIP

**Command:** `/smart-commit` (one or more conventional commits), then close-out.
**Actions:**
- `project-memory-keeper` finalizes updates across `business.md` / `architecture.md` / `guidelines.md` / ADRs / READMEs based on what actually shipped (not what was planned).
- Record the **GOAL metric baseline** in `task.md` section 0 (the value at ship time) so the outcome can be measured post-release.
- Move `docs/todo/<NNN>-<kebab-name>/` → `docs/done/<NNN>-<kebab-name>/`.
**Exit gate:** commits created, memory synced, GOAL baseline recorded, demand moved to `done/`.
**Output:** final summary table — phases passed, files changed, ADRs created, AC coverage, security verdict, GOAL metric + baseline, follow-ups.

## `task.md` template (write this on Phase 0/1)

```markdown
<!-- demand: NNN-<kebab-name> -->
<!-- created: YYYY-MM-DD -->
# Change: <human title>

## 0. GOAL _(from /goal — the anchor for every phase)_
**North-star:** docs/goals/<slug>.md
**Objective (why):**
**Key Results:**
| # | KR | Baseline (source) | Target | By | @ship |
|---|---|---|---|---|---|
| KR1 | <metric> | <value> (<source>) | <value> | <date> | _(Phase 6)_ |
**Guardrails:** <what must not get worse>
**Non-goals:** <what this deliberately ignores>

## 1. Description _(DEFINE — PO)_
**Problem:**
**Business value:**
**User segment:**

## 2. User stories (INVEST)
- As a [segment], I want [capability], so that [outcome].

## 3. Acceptance criteria (Gherkin)
- [ ] Scenario: ...
  - Given ... / When ... / Then ...
  - _Moves GOAL metric?_ yes/no — how

## 4. Out of scope
- ...

## 5. Implementation guide _(PLAN — Architect)_
**Components touched:**
**New contracts:**
**Data flow:**
**NFR impact (latency / throughput / availability / cost):**
**Does NFR impact the GOAL metric?**
**Atomic tasks (ordered):**
- [ ] T1 ... (AC: ...)
- [ ] T2 ...
**Trade-offs considered:**
**Recommended approach:**
**ADRs created:** ADR-NNNN, ...

## 6. Sensitive surface _(PLAN → triggers Security)_
- [ ] Auth / AuthZ  · [ ] Secrets  · [ ] PII  · [ ] Payments
- [ ] File upload/download  · [ ] Deserialization  · [ ] Raw SQL / shell exec
- [ ] Multi-tenant isolation  · [ ] New external integration / trust boundary

## 7. Security _(filled if section 6 has any check)_
**STRIDE:**
| Asset | Threat | Likelihood | Impact | Existing control | Gap |

**Required controls (must ship in BUILD):**
- [ ] ...

## 8. QA plan _(VERIFY)_
**Test pyramid:** Unit / Integration / E2E / Fuzz
**GOAL metric observable?** yes/no — query/dashboard
**AC traceability:**
| AC | Test file | Status |

## 9. Done
- [ ] Code merged
- [ ] All AC tests green
- [ ] GOAL metric instrumented & observable
- [ ] Security verdict: APPROVE
- [ ] Memory synced
- [ ] GOAL baseline recorded at ship
```

## Rules

- **Never skip a phase to "save time".** The gates are the value.
- **GOAL is not optional.** If Phase 0 can't produce a measurable metric with a baseline, stop — you're not ready to build. Every later gate references it.
- **Never write code yourself.** Delegate to the stack-specific dev.
- **Always read `guidelines.md` before delegating to a dev** — pass the relevant conventions in the brief so the dev doesn't re-derive them.
- **Stop the chain on BLOCK or No-go.** Surface the blocking finding, propose the smallest path to green, ask the user to confirm before retrying.
- **Use existing slash commands and agents — don't reinvent.** This command is glue, not new behavior.
- **Token economy:** prefer Speed-tier agents (`tier: speed`) for routine implementation and Reasoning-tier agents (`tier: reasoning`) for GOAL, design, security, and architecture. Frontmatter is the source of truth — don't pin to model names.

## Output (after each phase)

```
[NNN-<name>] <PHASE> — <Agent/Command> — <PASS|BLOCK|NO-GO>
  Produced: <artifacts>
  GOAL metric: <name> — still traceable? yes/no
  Memory updated: <files>
  Next: <PHASE+1> — <Agent/Command>
```

## Output (final)

```
[NNN-<name>] SHIPPED — branch: feat/<kebab-name>
  Phases:    GOAL ✅  DEFINE ✅  PLAN ✅  (SEC ➖)  BUILD ✅  VERIFY ✅  REVIEW ✅  SHIP ✅
  GOAL:      <metric> — baseline <x> → target <y> by <date> (baseline@ship: <z>)
  Files:     N created, M modified
  ADRs:      ADR-NNNN
  AC:        N/N covered
  Security:  APPROVE | APPROVE WITH MITIGATIONS
  Follow-ups: ...
  legend:    ✅ pass · ➖ skipped (not triggered) · ❌ blocked
```
