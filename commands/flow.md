# Flow (GOAL → SHIP)

You orchestrate a change end-to-end through the squad across **seven numbered phases** — `GOAL → DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP` — **plus two interstitial ones: Phase 0.5 TRIAGE, which always runs, and Phase 2.5 Threat modeling, which is conditional**. You do not implement — you delegate, gate, and synthesize. Every phase ties back to the **GOAL metric**: that traceability is the point of this command.

This is the phase-labeled orchestrator. It prepends a **GOAL** stage (the north-star metric) to the delivery chain so nothing gets built without a measurable outcome to trace it to. It supersedes `/feature-flow`, which runs the same delivery chain without the GOAL anchor.

## Context
$ARGUMENTS

## Mission

Take an idea from "why are we doing this" to "merged, measured change" by routing it through the right agents in the right order, with an explicit gate between each phase. Nothing skips. Nothing duplicates work another agent already produced. Every downstream artifact references the **GOAL metric** — if a phase can't tie back to it, that's a signal to stop and re-scope.

## Pre-flight (mandatory)

0. **Resume, never restart.** When `$ARGUMENTS` names an existing demand (`NNN` or `docs/todo/NNN-*/`), skip steps 3, 3b and 5: never allocate a new `NNN`, never re-stamp `Início` in §11, never re-pick the lane. Resume at the first row of **Status por fase** (§0) whose status is not `concluída`; a `concluída` phase is never re-run. A `concluída` row whose `Evidência` is empty, or points at an empty section, counts as not completed. `Evidência` must prove a green gate: VERIFY cites a `security-specialist` verdict of **APPROVE** or **APPROVE WITH MITIGATIONS**; REVIEW cites the recomputed `/code-review` verdict **APPROVED** or **APPROVED WITH COMMENTS**; any other verdict counts as not completed. A loop-back to an earlier phase resets the affected downstream rows to `pendente`.
1. **Load project memory.** Invoke `project-memory-keeper` for a context load. If `.claude/memory/{business,architecture,guidelines}.md` is missing, ask the user to run `/bootstrap-project` first and stop.
2. **Confirm intent.** Restate the idea in one sentence and confirm with the user before spending tokens on the chain. Surface ambiguity early.
3. **Allocate the demand ID.** Pick the next `NNN` (3-digit, zero-padded) by scanning `docs/todo/` and `docs/done/`. Create `docs/todo/<NNN>-<kebab-name>/task.md` from the template below.
3b. **Stamp the start time.** Run `date -u +%Y-%m-%dT%H:%M:%SZ` and record it in `task.md` section 11 as `Início`. Every later cost figure is scoped to this instant — without it you'd be reporting the whole session, including work that predates the flow.

3c. **Check the cost-measurement source.** Run `node ~/.claude/skills/session-cost/scripts/otel-setup.js --check --json` and branch on `status`. This never blocks the flow.

| `status` | What it means | Do |
|---|---|---|
| `live` | Telemetry on, endpoint answering | Take the OTEL snapshot (source A) and record `Fonte: OTEL` in §11 |
| `needs-restart` | Configured, but env vars load at startup | Use source B this run; note that OTEL is available from the next session |
| `not-configured` | No telemetry on this machine | **Offer once, then move on** (below) |
| `invalid` (exit 3) | `settings.json` unreadable | Report it and use source B. Never write to a file you can't parse |

On `not-configured`, tell the user what they lose and what fixes it, then **wait for an explicit yes before running `--enable`**:

> *Telemetria não está ligada nesta máquina. Sem ela o custo do flow cobre só o orquestrador — o consumo dos subagents (BUILD, VERIFY, REVIEW) fica de fora. Posso ligar? São 3 env vars em `~/.claude/settings.json`, com backup, e passa a valer no próximo start do Claude Code. Quer que eu ligue?*

**Never run `--enable` without that yes.** `~/.claude/settings.json` is the dev's global config, not an artifact of this task — writing to it uninvited is the unauthorized-action fraud `/veredito` exists to catch. If they decline, or don't answer, proceed with source B and don't ask again during this flow.

**Enabling does not help the run that enables it.** The env vars are read at startup, so the current flow still measures with source B. Say that plainly rather than implying the number is about to improve.
4. **Discover peer sessions (optional).** Run `ListAgents`, group the rows by repo, and pick **one** session per repo this change touches. If there are no peers, skip every peer step below — the chain runs unchanged. If there is one, read `~/.claude/skills/flow-playbook/peers.md` and follow it (peer handshake, hard rules), recording the result in `task.md` section 9. Unreadable playbook → consult no peer and record the reason in §9; a peer never gates a phase.
5. **Pick the lane.** Before Phase 0, evaluate F1–F5 (see Trivial lane) from the request and the predicted diff, and record §0 **Faixa** with one citation per criterion. In the trivial lane Phase 0 is the one-line GOAL, without `/discovery`. TRIAGE still always runs, and any later phase can take the change out of the lane; a TRIAGE SCORE ≤ 6 (below the cut) takes it out, too.

## Phase chain

Run phases in order. Each phase has an entry contract, a designated agent/command, and an **exit gate**. Do not advance past a gate that is not green. The **GOAL metric** established in Phase 0 is the thread — carry it forward into every phase's brief. On every gate, update that phase's row in **Status por fase** (§0) with the date and its evidence; `não se aplica` is valid only for 2.5 when it did not fire.

### Phase 0 — GOAL (Discovery)

**Command:** `/discovery`
**Inputs:** the user intent, `business.md`.
**Produces:** a discovery brief at `docs/discovery/<slug>.md` — Problem Statement, affected users, JTBD outcome, and a **success metric with baseline + target**, ending in a **Go / No-go / Learn-more** recommendation.
**Exit gate:** recommendation is **Go**, and the success metric is concrete (named metric, baseline value + source, target + date). A **No-go** stops the flow; **Learn-more** pauses it until the flagged experiments run.
**Carry-forward:** copy the success metric into `task.md` section 0 as the **GOAL metric** — this is the anchor every later phase must reference.
**Memory side-effect:** none yet; discovery is exploratory.
**Trivial lane:** one line in §0 (metric, baseline with source, target), no `/discovery`.

> The GOAL phase is what separates this from a plain delivery chain: if you can't state the measurable outcome and its baseline, you're not ready to spec.

### Phase 0.5 — TRIAGE (Prompt clarity)

**Runs:** always, between GOAL and DEFINE — unlike Phase 2.5, never skipped.
**Inputs:** the demand's opening prompt, as it arrived.
**Produces:** a SCORE (1–10) and one justification line per axis, in `task.md` section 0.
**Exit gate:** SCORE and the four justifications recorded there. **DEFINE does not start without them.**

**Scores the prompt, not the problem.** Never score how complex the work is, how many files change, how long it takes, whether it touches auth or secrets, or how risky it is. A large, critical demand asked for maturely scores 10; a typo fix asked for vaguely scores 3. Score each axis 1–10, reading the prompt **as it arrived** — before any clarification you went on to ask.

| Axis | 1–3 | between | 9–10 |
|---|---|---|---|
| **A1 Deliverable** — does it say what will exist at the end? | a problem or a wish | a capability or a directory; the file set is open | the exact path(s) |
| **A2 Mechanism** — is the named mechanism checkable against this repo today? | none, or contradicted by the repo | named, but a primitive or a parameter is unverified | named, every primitive already exists |
| **A3 Done** — can you write the exit condition without asking the requester? | adjectives only ("better", "faster") | derivable from the repo's gates, or pending a fact | stated, or fully fixed by those gates |
| **A4 Stability** — does it commit to one path? | it asks you to choose the direction | ≥2 paths open, or one path plus a preference | one path |

**SCORE** = `floor(mean(A1..A4))`, then **veto: any axis ≤ 4 caps SCORE at 6.** **Cite or cap:** each axis justification names one artifact — a path, a `path:line`, or its verifiable absence; an uncited axis scores **at most 5**, since the score is self-assigned by whoever pays the token bill.

| Branch | Effect |
|---|---|
| **SCORE ≤ 6** | Nothing changes. DEFINE runs exactly as written below — no AC ceiling, no mandatory grouping, no performance block. |
| **SCORE > 6** | DEFINE writes **≤ 10 AC** in section 3: group related scenarios into one AC, and verify by objective inspection where item-by-item Gherkin adds nothing. Every AC, grouped or not, stays verifiable by a deterministic command or a binary-predicate inspection, and an AC verified by inspection is still bound by the Phase 4 exit gate — inspection replaces Gherkin prose, never the test behind it. Two kinds are outside the ceiling and are never grouped: an AC carrying a control required by Phase 2.5, and an AC covering a negative or abuse case. **Fewer AC, never looser AC — the Phase 4 exit gate is untouched:** each surviving AC still needs an automated test that fails without the change. |
| **SCORE > 6 _and_ executable surface** — the predicted diff touches `bin/ahc`, `scripts/`, `install.sh`, `mcp/` or `test/`. `test/` qualifies only when the change is the **object** — what a test asserts, the harness, suite runtime — and never when a test exists only to **prove** the change, which Phase 4 requires of every demand | PLAN also adds a performance block **with a number**: a budget or a measurement for what the change sits on the hot path of — startup time, bytes loaded per invocation, or runtime of the touched command. A measurement never invokes anything that writes into the dev's real `~/.claude` — `install.sh` and `ahc sync` both do. Read-only invocations (`bin/ahc --version`, `node --test`) are safe as they stand; anything mutating is measured under a throwaway `HOME`, the way `test/helpers.js` already builds one. A budget is always an acceptable substitute. Above the cut but content-only (`.md`) → **no performance block**; the ceiling is the only effect. |

### Phase 1 — DEFINE (Spec / PO)

**Agent:** `senior-product-owner`
**Inputs:** the Phase 0 brief, **the Phase 0.5 score recorded in §0**, `business.md`.
**Produces:** in `task.md` — Description (problem + business value), user segment, INVEST stories, Acceptance Criteria in Gherkin, Out of scope, and the **GOAL-metric linkage** (which AC, when satisfied, move the metric).
**Exit gate:** AC are testable, scope is bounded, no business-rule conflict with `business.md`, and **at least one AC traces to the GOAL metric**.
**Memory side-effect:** if a new domain rule emerges → handoff to `project-memory-keeper` to update `business.md`.

### Phase 2 — PLAN (Architecture)

**Agent:** `system-architect`. For integration-heavy work also consult `integration-architect`. For DB-heavy work also consult `postgres-dba`.
**Inputs:** Phase 0 + 1 output, `architecture.md`.
**Produces:** in `task.md` — Implementation guide (components touched, new contracts, data flow, NFR impact), trade-offs considered, recommended approach, and a **decomposition into small, atomic, independently verifiable tasks** (each mappable to AC). ADR if a structural decision is made.
**UX consult (conditional, inside this phase):** the UX trigger fires when the plan touches a UI file: `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.html`, `*.css`, `*.scss`, `*.less`, `*.dart`, a theme/token/style file, an image or font asset, or displayed strings/copy. It fires by default; it stays off for a file only when §5 cites, per file with `path:line`, why nothing visible changes. Not a trigger: a front-end refactor with no visible change (hook, API call, typing); a file extension alone never fires it once that citation exists. Route: web (React, Vue, Svelte, HTML/CSS outside React Native) → `ux-designer-web`; `*.dart`, React Native or native UI → `ux-designer-mobile`; both platforms → both. The architect fills **UX:** in §5 with the affected screens/components (`path`), and the UX agent defines flow, states (empty, error, loading) and accessibility **before** BUILD, recorded in **UX consult:** in §5. The trivial lane has no UX consult in PLAN.
**Exit gate:**
- Tasks are atomic and ordered by dependency; maintainability + scalability acceptable.
- **NFR impact does not jeopardize the GOAL metric** (e.g. a latency KR isn't undercut by the design).
- **Sensitive surface flagged** for `security-specialist` if the change touches: auth, authz, session, secrets, PII, payments, file upload/download, deserialization, raw SQL, shell exec, multi-tenant isolation, or a new external integration / trust boundary.
- **UX consult recorded** in §5 when the UX trigger fired.
**Peer consult (conditional):** if the design changes a contract another repo consumes — an endpoint, an event payload, a shared schema, a published package — and a peer session is open in that repo, ask it to check the design against what that repo *actually* consumes today. This is where a peer beats a subagent: the architect is inferring, the peer can read.

> `SendMessage` → `{"to": "<peer>", "message": "Estou mudando <contrato exato> em <repo>. Responda a partir de origin/main — não da sua working tree; rode git fetch antes se precisar. O que consome isso hoje e quais campos são obrigatórios? Cite o ref e o sha curto que você leu, mais arquivo e linha. Não altere nada."}`

Record the answer in `task.md` section 9. A contradiction here is worth a re-scope **before** BUILD — it is far cheaper than discovering it in VERIFY.
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
- Mobile (Flutter/React Native/native) → `mobile-qa-analyst`: the mobile route of the Phase 2 UX consult (`*.dart`, React Native or native UI), by stack only; the visible-UI condition does not apply. Mobile wins over Frontend / E2E only for a file both match (a React Native or mobile file), even when the test is E2E; a change that spans web and mobile dispatches `cypress-qa-analyst` and `mobile-qa-analyst`; mobile + Go dispatches both. A flow marked `NÃO EXECUTADO` is not RED proof.
- Both, when the change spans front + back.

**Inputs:** Phase 3 diff + AC.
**Produces:** integration / E2E / fuzz tests as appropriate, a traceability matrix (AC → test), and confirmation that the **GOAL metric is observable** (the instrumentation from Phase 3 emits and is queryable).
**Then, always:** `security-specialist` runs the security gate. If Phase 2.5 produced a STRIDE table, validate the required controls actually landed in the diff. Otherwise, run a fast pass on the touched files (secret scan + OWASP-relevant checks).
**Peer consult (conditional):** if Phase 2 flagged a cross-repo contract, ask that repo's peer session to confirm the shipped diff doesn't break it — now against real code, not a design sketch. Advisory: a silent peer does not hold the gate, but a peer reporting breakage is a finding that belongs in the record before SHIP.
**Exit gate:** every AC has at least one automated test that **fails without the change**; the GOAL metric emits; security verdict is **APPROVE** or **APPROVE WITH MITIGATIONS** (mitigations recorded in `architecture.md`). **BLOCK** halts the flow until BUILD loops back.
**RED proof (every lane):** for each AC, §8 records the ref without the change (a sha reachable from main), the exact command, and the excerpt of the red output that names the test. An AC without that record leaves this gate not green; "fails without the change" asserted without evidence does not count.

### Phase 5 — REVIEW

**Command:** `/code-review`
**Inputs:** the full diff vs main.
**Exit gate:** no BLOCKERs; no missing lens (verdict `INCOMPLETE` is not green, in every lane).
**Reads:** the verdict recomputed after the adversarial verification (`/code-review` Step 4, item 7), never the one before it.

### Phase 6 — SHIP

**Command:** `/smart-commit` (one or more conventional commits), then close-out.
**Actions:**
- `project-memory-keeper` finalizes updates across `business.md` / `architecture.md` / `guidelines.md` / ADRs / READMEs based on what actually shipped (not what was planned).
- **Trivial lane only:** the memory sync runs only when the shipped change alters something the memory describes, decided with a citation; otherwise §10 records `nada a sincronizar: <citação>` and no subagent runs. The standard lane always syncs.
- Record the **GOAL metric baseline** in `task.md` section 0 (the value at ship time) so the outcome can be measured post-release.
- **Notify affected peers.** If a cross-repo contract shipped, tell each peer session in an affected repo what changed and where, so their context reflects reality instead of a stale assumption. Notification only — do not ask them to adapt their code; that is their repo's own flow.
- Move `docs/todo/<NNN>-<kebab-name>/` → `docs/done/<NNN>-<kebab-name>/`.
**Exit gate:** commits created, memory synced, GOAL baseline recorded, demand moved to `done/`. In the trivial lane only, a cited `nada a sincronizar` counts as memory synced.
**Output:** final summary table — phases passed, files changed, ADRs created, AC coverage, security verdict, GOAL metric + baseline, cost, follow-ups.

### Cost accounting (Phase 6, mandatory)

Measure it — never estimate. **Cost reporting degrades; it never blocks the flow.** Try the sources in order and always say which one produced the number.

**Resumed flow:** `Início` keeps its original stamp, and the source covers only the session(s) it measured. Say so next to the number; never add sessions up by estimate.

The scripts ship in the `session-cost` skill, so `ahc sync` puts them at the same path on every machine: `~/.claude/skills/session-cost/scripts/`.

**Source A — OpenTelemetry (complete, includes subagents).** Available when telemetry is on *for that machine* (step 3c). Snapshot in pre-flight, diff at SHIP:

```sh
node ~/.claude/skills/session-cost/scripts/otel-cost.js snapshot > "$TMPDIR/flow-<NNN>.json"
node ~/.claude/skills/session-cost/scripts/otel-cost.js report --since "$TMPDIR/flow-<NNN>.json"
```

`claude_code.token.usage` carries a `query_source` label (`main` / `subagent` / `auxiliary`), so this splits orchestrator from delegated work, and the cost comes from Claude Code's own `claude_code.cost.usage` — no local price table to rot.

**Source B — session transcript (orchestrator only).** Always available, no setup:

```sh
node ~/.claude/skills/session-cost/scripts/session-cost.js --since <Início from task.md §11>
```

**Source C — none.** If the skill isn't installed (`ahc sync` never ran on this machine), report `custo: não medido` and point at `/cost`. Do not guess a number.

**Two constraints that are not optional:**

1. **Report the figure the tool printed, never one you derived.** An "estimated" cost is a fabricated cost — the fraud `/veredito` exists to catch.
2. **Name the source and its boundary in the same breath as the number.** With source B the delegated work — BUILD, VERIFY, REVIEW, i.e. most of the spend — is *not* in the figure: Claude Code does not record subagent usage in the transcript (verified 2026-08-17 across 96 transcripts: 435 subagent dispatches, zero `isSidechain` records). So source B reads *"$X de orquestração, N subagents não contabilizados, `/cost` pro total"*, never *"o flow custou $X"*.

> The `session-cost` skill carries the full reporting contract and can also be invoked on its own ("quanto custou essa sessão?"). This command is a caller, not a second copy of the rules — when they disagree, the skill wins.

## Trivial lane (a mode, not a phase)

A mode for small changes: the same eight phases (GOAL, TRIAGE, DEFINE, PLAN, BUILD, VERIFY, REVIEW, SHIP), collapsed, never skipped. Decide the lane in pre-flight step 5, before Phase 0, and record it in §0 **Faixa**. The trivial lane needs all five criteria, each with one citation (a path, a `path:line` or a verifiable absence) on its F line:
- **F1** the predicted diff changes at most 1 production file; the test that proves the change and script-generated files such as `manifest.json` do not count;
- **F2** no sensitive surface (the Phase 2 list or any §6 box);
- **F3** no new or changed contract (endpoint, payload, shared schema, published package);
- **F4** at most 3 AC;
- **F5** no ADR.

An uncited criterion counts as not met, and the flow runs the standard lane.

A sensitive surface excludes the trivial lane, always: at entry and mid-flow, even at the user's explicit request. Phase 2.5 then runs per its trigger.

The security gate runs in every lane: `security-specialist` on VERIFY (secret scan + OWASP-relevant checks on the touched files), as in Phase 4.

In the trivial lane, read `~/.claude/skills/flow-playbook/trivial-lane.md` and follow it: collapsed phases, the 4 mandatory subagents, leaving the lane. Unreadable playbook → standard lane, with `faixa trivial indisponível: playbook ausente` in §0.

**Leaving the lane** (an F criterion falls in any phase, TRIAGE scores ≤ 6, or the playbook turns unreadable mid-flow): record in §0 the cause, with a citation, and the phase; resume in the standard lane from Phase 1 DEFINE, with DEFINE and PLAN redone by the standard-lane subagents; keep the one-line GOAL only if it meets the Phase 0 exit gate, otherwise rerun Phase 0 with `/discovery`. Never return to the trivial lane in the same flow.

## `task.md` template (write this on Phase 0/1)

```markdown
<!-- demand: NNN-<kebab-name> -->
<!-- created: YYYY-MM-DD -->
# Change: <human title>

## 0. GOAL _(from /discovery — the anchor for every phase)_
**Discovery brief:** docs/discovery/<slug>.md
**Objective (why):**
**Success metric:** <name>
**Baseline:** <value> (source: <where>)  →  **Target:** <goal> by <date>
**Baseline at ship:** _(filled in Phase 6)_
**Recommendation:** Go
**Pré-triagem (Phase 0.5):** NOTA <n>/10 — <acima|abaixo> do corte (> 6)
- A1 Deliverable <n>: <justificativa, citando um artefato>
- A2 Mechanism <n>: <idem>
- A3 Done <n>: <idem>
- A4 Stability <n>: <idem>
**Faixa:** <padrão|trivial> — decidida no pre-flight, antes da GOAL
- F1 Produção ≤ 1 arquivo: <citação>
- F2 Superfície sensível nenhuma: <citação>
- F3 Contrato nenhum: <citação>
- F4 AC ≤ 3: <citação>
- F5 ADR nenhum: <citação>

**Status por fase:**
| Fase | Status | Data | Evidência |
|---|---|---|---|
| GOAL | pendente | | |
| TRIAGE | pendente | | |
| DEFINE | pendente | | |
| PLAN | pendente | | |
| 2.5 | pendente | | |
| BUILD | pendente | | |
| VERIFY | pendente | | |
| REVIEW | pendente | | |
| SHIP | pendente | | |
_Status: pendente · em andamento · concluída · bloqueada · não se aplica (só 2.5)_

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
**UX:** <dispara|não dispara> — <telas/componentes (path)> | <por que nada visível muda (path:line)>
**UX consult:** <ux-designer-web|ux-designer-mobile> — fluxo · estados (vazio/erro/carregando) · a11y

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
| AC | Test file | Prova de RED (ref · comando · saída) | Status |

**Passagens:**
| Gate | n/3 | Achado | O que mudou |

## 9. Cross-repo peer consults _(optional — only when another repo is touched)_
| Phase | Peer session | Repo | Ref lido | Pergunta | Resposta (arquivo:linha) | Mudou o plano? |
|---|---|---|---|---|---|---|
| PLAN | | | `origin/main@` | | | |

**Handshake** _(uma linha por sessão consultada, preenchida no pre-flight)_
| Sessão | remote | branch | head | dirty | origin_main_fresh |
|---|---|---|---|:--:|:--:|
| | | | | | |

_Sem sessão aberta num repo afetado → deixe vazio. Não é gate._
_Resposta sem ref e sha é resposta sobre a working tree do colega: peça de novo, ancorada._
_Sessão sem handshake → "sem handshake"; o que ela disser não entra como evidência._

## 10. Done
- [ ] Code merged
- [ ] Custo de orquestração medido e registrado (§11)
- [ ] All AC tests green
- [ ] GOAL metric instrumented & observable
- [ ] Security verdict: APPROVE
- [ ] Memory synced (só na faixa trivial: ou `nada a sincronizar: <citação>`)
- [ ] GOAL baseline recorded at ship
- [ ] Affected peer repos notified (if any)

## 11. Custo _(SHIP — medido, não estimado)_
**Início:** <ISO 8601 UTC, carimbado no pre-flight>
**Fonte:** OTEL (inclui subagent) | transcript (só orquestrador) | não medido
**Comando:** <o comando exato que produziu o número>

_Fonte `transcript` mede só o orquestrador — ver nota no fim desta seção._

| | |
|---|---|
| Custo de orquestração | $0.0000 |
| Chamadas de API | N |
| Output (inclui thinking) | N tok |
| Leitura de cache | N tok |
| Escrita de cache | N tok |
| Subagents despachados | N — **consumo não incluído acima** |

_O número acima é só o orquestrador. O Claude Code não grava tokens de subagent
no transcript, e é neles que está a maior parte do gasto num flow. Total real da
sessão: `/cost` nativo._
```

## Rules

- **Never skip a phase to "save time".** The gates are the value.
- **GOAL is not optional.** If Phase 0 can't produce a measurable metric with a baseline, stop — you're not ready to build. Every later gate references it.
- **Never write code yourself.** Delegate to the stack-specific dev.
- **Always read `guidelines.md` before delegating to a dev** — pass the relevant conventions in the brief so the dev doesn't re-derive them.
- **Stop the chain on BLOCK or No-go.** Surface the blocking finding, propose the smallest path to green, ask the user to confirm before retrying.
- **Use existing slash commands and agents — don't reinvent.** This command is glue, not new behavior.
- **Delegate to a subagent by default; reach for a peer session only for cross-repo ground truth.** A peer is not a faster subagent — it is the only way to read a repo you don't have. Everything else, delegate.
- **Never route blocked work through a peer.** See the hard rules in `~/.claude/skills/flow-playbook/peers.md`; this is the one that turns a convenience into a permission bypass.
- **Pass ceiling: 3 per gate.** VERIFY (BUILD↔VERIFY) and REVIEW (REVIEW→BUILD) each get 3 passes; log each one in §8 **Passagens** (gate, finding, what changed). On the 3rd pass without green, stop: set the phase to `bloqueada` and escalate to the user with the finding that does not close, the 3 attempts and what changed in each. A loop-back to PLAN or earlier resets the count; `NEEDS DISCUSSION` does not consume a pass. Every retry still needs the user's confirmation, so the ceiling never makes the loop automatic. Hitting the ceiling never advances to the next phase, never ships, and never marks the gate green or the phase `concluída`; only an explicit user decision, recorded in `task.md`, changes that.
- **Token economy:** prefer Speed-tier agents (`tier: speed`) for routine implementation and Reasoning-tier agents (`tier: reasoning`) for GOAL, design, security, and architecture. Frontmatter is the source of truth — don't pin to model names.

## Output (after each phase)

```
[NNN-<name>] <PHASE> — <Agent/Command> — <PASS|BLOCK|NO-GO>
  Faixa: <padrão|trivial> · Status: <status> · Passagem: <n>/3
  Produced: <artifacts>
  GOAL metric: <name> — still traceable? yes/no
  Peer consult: <peer → finding> | none
  Memory updated: <files>
  Next: <PHASE+1> — <Agent/Command>
```

## Output (final)

```
[NNN-<name>] SHIPPED — branch: feat/<kebab-name>
  Faixa:     <padrão|trivial>
  Phases:    GOAL ✅  DEFINE ✅  PLAN ✅  (SEC ➖)  BUILD ✅  VERIFY ✅  REVIEW ✅  SHIP ✅
  GOAL:      <metric> — baseline <x> → target <y> by <date> (baseline@ship: <z>)
  Files:     N created, M modified
  ADRs:      ADR-NNNN
  AC:        N/N covered
  Security:  APPROVE | APPROVE WITH MITIGATIONS
  Peers:     <N consulted, M repos notified> | none
  Custo:     $X.XXXX orquestração · N subagents não contabilizados · /cost p/ total
  Follow-ups: ...
  legend:    ✅ pass · ◇ collapsed (trivial lane) · ➖ skipped (not triggered) · ❌ blocked
```
