# Feature Flow

> **See also `/flow`** — the phase-labeled evolution of this command (GOAL → DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP). It prepends a **GOAL** stage that anchors every phase to a measurable metric. Prefer `/flow` for new work; keep `/feature-flow` for the delivery chain without the goal anchor.

You orchestrate a new feature end-to-end through the squad. You do not implement — you delegate, gate, and synthesize.

## Context
$ARGUMENTS

## Mission

Take a feature idea from "intent" to "merged change" by routing it through the right agents in the right order, with explicit gates between phases. Nothing skips. Nothing duplicates work that an agent already produced.

## Pre-flight (mandatory)

1. **Load project memory.** Invoke `project-memory-keeper` for a context load. If `.claude/memory/{business,architecture,guidelines}.md` is missing, ask the user to run `/bootstrap-project` first and stop.
2. **Confirm intent.** Restate the feature in one sentence and confirm with the user before spending tokens on the chain. Surface ambiguity early.
3. **Allocate the demand ID.** Pick the next `NNN` (3-digit, zero-padded) by scanning `docs/todo/` and `docs/done/`. Create `docs/todo/<NNN>-<kebab-name>/task.md` from the template below.

## Phase chain

Run phases in order. Each phase has an entry contract, an exit gate, and a designated agent. Do not advance past a gate that is not green.

### Phase 1 — Refinement (PO)

**Agent:** `senior-product-owner`
**Inputs:** the user intent, `business.md`.
**Produces:** in `task.md` — Description (problem + business value), User segment, INVEST stories, Acceptance Criteria in Gherkin, Out of scope, Success metric.
**Exit gate:** AC are testable, scope is bounded, no business-rule conflict with `business.md`.
**Memory side-effect:** if a new domain rule emerges → handoff to `project-memory-keeper` to update `business.md`.

### Phase 2 — Architectural feasibility (Architect)

**Agent:** `system-architect`. For integration-heavy work also consult `integration-architect`. For DB-heavy work also consult `postgres-dba`.
**Inputs:** Phase 1 output, `architecture.md`.
**Produces:** in `task.md` — Implementation guide (components touched, new contracts, data flow, NFR impact), Trade-offs considered, Recommended approach. ADR if a structural decision is made.
**Exit gate:**
- Maintainability + scalability acceptable.
- **Sensitive surface flagged** for `security-specialist` if the feature touches: auth, authz, session, secrets, PII, payments, file upload/download, deserialization, raw SQL, shell exec, multi-tenant isolation, or a new external integration / trust boundary.
**Memory side-effect:** ADR + update to `architecture.md` (decisions log, integrations, threat models if applicable).

### Phase 3 — Threat modeling (Security, conditional)

**Agent:** `security-specialist`
**Trigger:** Phase 2 flagged a sensitive surface. **Mandatory** when the change crosses a trust boundary.
**Inputs:** Phase 2 design, `architecture.md` (existing controls).
**Produces:** STRIDE table + a "Required controls" list appended to `task.md`'s Security section.
**Exit gate:** required controls are concrete and assigned to the implementation phase.

### Phase 4 — Implementation (stack-aware Dev)

**Agent — pick by detected stack** (read `architecture.md` and the manifests):
- Go → `go-senior-engineer`
- .NET → `dotnet-backend-architect`
- React/frontend → `senior-react-developer`
- Postgres-heavy work → `postgres-dba` (alongside the dev agent)
- Infra/IaC → `aws-devops-engineer`

**Branch:** `feat/<kebab-name>` (or `feat/<NNN>-<kebab-name>` if the team prefixes with the demand ID).
**Inputs:** Phase 1 + 2 + 3 outputs, `guidelines.md` for in-repo conventions.
**Produces:** code + unit tests, following the conventions actually in use (verified against `guidelines.md`).
**Exit gate:** all AC items are checkable in the diff; lint + unit tests pass locally.
**Memory side-effect:** if a new pattern is introduced or a convention learned → handoff to `project-memory-keeper` for `guidelines.md`.

### Phase 5 — Quality (QA + SDET)

**Agent — pick by stack:**
- Go services → `go-sdet-backend`
- Frontend / E2E → `cypress-qa-analyst`
- Both, when the feature spans front + back.

**Inputs:** Phase 4 diff + AC.
**Produces:** integration / E2E / fuzz tests as appropriate, traceability matrix (AC → test).
**Exit gate:** every AC has at least one automated test that fails without the change. Sensitive-surface findings re-handed to Phase 6.

### Phase 6 — Security gate (Security)

**Agent:** `security-specialist`
**Always runs.** If Phase 3 produced a STRIDE table, validate that the required controls actually landed in the diff. Otherwise, run a fast pass on the diff (secret scan + OWASP-relevant checks on the touched files only).
**Produces:** verdict per the agent's standard format.
**Exit gate:** **APPROVE** or **APPROVE WITH MITIGATIONS** (mitigations recorded in `architecture.md`). **BLOCK** halts the flow until the dev phase loops back.

### Phase 7 — Review

**Command:** `/code-review`
**Inputs:** the full diff vs main.
**Exit gate:** no BLOCKERs.

### Phase 8 — Memory sync

**Agent:** `project-memory-keeper`
**Action:** finalize updates across `business.md` / `architecture.md` / `guidelines.md` / ADRs / READMEs based on what actually shipped (not what was planned).

### Phase 9 — Commit & close

**Command:** `/smart-commit` (one or more conventional commits).
**Action:** move `docs/todo/<NNN>-<kebab-name>/` → `docs/done/<NNN>-<kebab-name>/`.
**Output:** final summary table — phases passed, files changed, ADRs created, AC coverage, security verdict, follow-ups.

## `task.md` template (write this on Phase 1)

```markdown
<!-- demand: NNN-<kebab-name> -->
<!-- created: YYYY-MM-DD -->
# Feature: <human title>

## 1. Description
**Problem:**
**Business value:**
**User segment:**

## 2. User stories (INVEST)
- As a [segment], I want [capability], so that [outcome].
- ...

## 3. Acceptance criteria (Gherkin)
- [ ] Scenario: ...
  - Given ...
  - When ...
  - Then ...

## 4. Out of scope
- ...

## 5. Success metric
**Leading:** ...
**Lagging:** ...

## 6. Implementation guide _(filled by Architect)_
**Components touched:**
**New contracts:**
**Data flow:**
**NFR impact (latency / throughput / availability / cost):**
**Trade-offs considered:**
**Recommended approach:**
**ADRs created:** ADR-NNNN, ...

## 7. Sensitive surface _(filled by Architect → triggers Security)_
- [ ] Auth / AuthZ
- [ ] Secrets
- [ ] PII
- [ ] Payments
- [ ] File upload/download
- [ ] Deserialization
- [ ] Raw SQL / shell exec
- [ ] Multi-tenant isolation
- [ ] New external integration / trust boundary

## 8. Security _(filled by Security if section 7 has any check)_
**STRIDE:**
| Asset | Threat | Likelihood | Impact | Existing control | Gap |

**Required controls (must ship in Phase 4):**
- [ ] ...

## 9. QA plan _(filled by QA in Phase 5)_
**Test pyramid:**
- Unit: ...
- Integration: ...
- E2E: ...
- Fuzz: ...

**AC traceability:**
| AC | Test file | Status |

## 10. Done
- [ ] Code merged
- [ ] All AC tests green
- [ ] Security verdict: APPROVE
- [ ] Memory synced
- [ ] CHANGELOG updated (if applicable)
```

## Rules

- **Never skip a phase to "save time".** The gates are the value.
- **Never write code yourself.** Delegate to the stack-specific dev.
- **Always read `guidelines.md` before delegating to a dev** — pass the relevant conventions in the brief so the dev doesn't re-derive them.
- **Stop the chain on BLOCK.** Surface the blocking finding, propose the smallest path to green, ask the user to confirm before retrying.
- **Use existing slash commands and agents — don't reinvent.** This command is glue, not new behavior.
- **Token economy:** prefer Speed-tier agents (`tier: speed` no frontmatter) for routine implementation and Reasoning-tier agents (`tier: reasoning`) for design, security, and architecture. The frontmatter is the source of truth — don't pin to specific model names.

## Output (after each phase)

```
[NNN-<name>] Phase X — <Agent/Command> — <PASS|BLOCK>
  Produced: <artifacts>
  Memory updated: <files>
  Next: Phase X+1 — <Agent/Command>
```

## Output (final)

```
[NNN-<name>] DONE — branch: feat/<kebab-name>
  Phases:    1 ✅  2 ✅  3 ➖  4 ✅  5 ✅  6 ✅  7 ✅  8 ✅  9 ✅
  Files:     N created, M modified
  ADRs:      ADR-NNNN
  AC:        N/N covered
  Security:  APPROVE | APPROVE WITH MITIGATIONS
  Follow-ups: ...
  legend:    ✅ pass · ➖ skipped (not triggered) · ❌ blocked
```
