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
4. **Discover peer sessions (optional).** Run `ListAgents`, group the rows by repo, and pick **one** session per repo this change touches. Send it the **peer handshake** (below) to confirm it really is that repo, and record the result in `task.md` section 9. If there are no peers, skip every peer step below — the chain runs unchanged.

## Peer sessions — what they add, and what they must never do

Peer sessions are other live Claude Code sessions, usually open on **other repositories**. Reach them with `SendMessage` using the name from `ListAgents`; the answer arrives back in this session.

### How a peer becomes available

There is nothing to enable, install or configure. A peer is simply **a Claude Code session already open in the other repo** — a second terminal, a second IDE window. Open it and it is reachable; close it and it is gone.

It does **not** need to be running anything. An idle session is a valid peer: the message enqueues and the session picks it up on its next turn. The peer's user sees the exchange in their own transcript.

`ListAgents` is how you find out what exists right now — names come from the session's directory plus a short hash (`orders-api-3f`, `billing-svc-91`), so they change between sessions. Never hardcode a peer name into a brief; always discover it in pre-flight.

```
Peer sessions (2):
  billing-svc-91 [58dc25]  ·  interactive  ·  idle  ·  started 7h ago
  orders-api-3f [c6daa7]   ·  interactive  ·  idle  ·  started 23h ago
```

If the list is empty, that is the normal case and the flow proceeds unchanged.

### Several sessions in the same repo

Common — a dev keeps three terminals open on the service they're working in:

```
orders-api-3f [c6daa7]  ·  interactive  ·  idle  ·  started 23h ago
orders-api-7b [855b73]  ·  interactive  ·  idle  ·  started 2d ago
orders-api-e2 [71ac62]  ·  interactive  ·  idle  ·  started 11h ago
```

The trap is reading this as "three chances to get the answer". It is not — and the listing hides which of two very different shapes you are looking at, because the name only carries the **directory basename**:

- **Same directory, several sessions.** They share one working tree, one `.git`, one HEAD. At any instant they see byte-identical files. Asking a second one is asking the same disk twice.
- **Different worktrees or clones that happen to share a folder name.** Genuinely independent trees, on different branches, possibly a detached HEAD. Here the answers really can diverge.

Both are common in the same repo at the same time — `git worktree list` on a normal service will often show three or four trees, and Cursor and similar tools create them silently.

The failure mode that matters, though, is the one shared by both shapes: **a peer answers from a checkout, and a checkout is not what ships.** A team's main working tree usually sits on whatever feature branch that person is on right now. Ask it "what does your repo consume today" and you get a truthful answer about a branch that may never merge — with nothing in the reply to warn you.

Two rules follow, and the second is the one that matters:

1. **One peer per repo.** Group the listing by prefix and pick a single session. When they share a directory the extra asks are literally redundant; when they don't, the difference between the answers is about their checkouts, not about the code. Either way the second ask buys nothing.
2. **Anchor the question to a ref, never to the working tree.** Ask about `origin/main` (or whatever ref actually matters) explicitly, and require the answer to name the ref and short sha it was read from. Once the question is anchored, *which* session answers stops mattering — that is what makes the consult reproducible instead of a poll.

An answer that arrives without a ref and sha is a working-tree answer. Treat it as unanswered and ask again, pinned.

If a peer replies that it cannot read the ref — stale fetch, mid-rebase, detached HEAD — ask it to `git fetch` first. If it still can't, record "não respondido" and move on. A gate never waits on this.

### Peer handshake

The name `ListAgents` shows is derived from the **directory name**. It is an address, not an identity: it does not tell you which repository the session is actually attached to, which branch it sits on, or whether its tree is clean. A renamed directory, or two repos with similar folder names, and the inference is simply wrong.

The handshake fixes that. It is one round trip, once per target session, in pre-flight — before any content question. Never repeat it per question, and never negotiate on it.

It does **not** replace ref anchoring. The two solve different problems and you need both:

| | Solves |
|---|---|
| **Ref anchoring** | Reproducibility — the answer doesn't depend on who replies |
| **Handshake** | Addressing and provenance — you're talking to a session that *can* answer, and you can say where the answer came from |

**Send** (`SendMessage`, `to` = the name from `ListAgents`):

```
HANDSHAKE (somente leitura — não altere nada, não troque de branch, não rode fetch):
Responda uma linha por campo, exatamente neste formato:
remote: <URL do remote origin>
branch: <branch atual>
head: <sha curto do HEAD>
dirty: <yes|no — working tree suja?>
origin_main_fresh: <yes|no|unknown — o origin/main local parece atualizado?>
```

**Expect** five `key: value` lines, in that order, and nothing else. Anything that doesn't parse as those five lines counts as no response. `unknown` is acceptable for freshness — the handshake forbids fetching precisely to stay cheap, so an honest "não sei" beats a guess.

**Read it like this:**

- **`remote` doesn't match the repo you need** — wrong session. Discard it and check the other rows. This is the case the handshake exists for.
- **Several sessions report the same `remote`** — pick one, preferring a clean tree and a fresh `origin/main`. The others add nothing: content answers are anchored to a ref, so a second session in the same repo cannot say anything different.
- **`dirty: yes`, or a feature branch** — does *not* disqualify it, exactly because the content questions are anchored to a ref rather than to its working tree. Record the fact; don't act on it.
- **`origin_main_fresh: no` or `unknown`** — still usable. Fetching is deferred to the content question, where the ref actually gets read; if an answer later cites an older sha than expected, this is the reason.
- **No reply, or an unparseable one** — record "sem handshake" and proceed without that peer. Fall back to what you can determine locally and say so in the phase output. This never blocks a gate.

Record the result in `task.md` section 9 — every fact later obtained from that session inherits it. A finding whose provenance is unknown is a finding you cannot act on later.

**Example.** Sent to `billing-svc-91`, reply received:

```
remote: git@github.com:acme/billing-svc.git
branch: feat/payout-webhook
head: 4f9c21a
dirty: yes
origin_main_fresh: yes
```

Right repository, so it's usable. Note "feature branch, tree suja" in provenance, then anchor every content question to `origin/main` as usual — copying the `from` attribute into `to` for each follow-up.

A subagent and a peer session are not interchangeable. A subagent is spawned here, sees only this working tree, and forgets everything when it returns. A peer session is already inside another repo, with that repo's code in front of it, and it stays alive across the whole flow.

So the one thing a peer gives you that no subagent can: **ground truth about a repository you cannot read.** When Phase 2 designs a contract that another service consumes, a `system-architect` subagent can only infer what that consumer expects. A peer session sitting in the consumer's repo can simply go look.

That is the whole use. Everything else is worse than delegating to a subagent.

### Hard rules

- **Never launder permissions.** If an action was denied or blocked in this session — or you expect this session's permissions would block it — do **not** ask a peer to do it instead. A peer doing it for you overrides a decision the user made. Route blocked work back to the user.
- **A peer never gates a phase.** Peer input *informs* a gate; it never *owns* one. A gate that waits on a peer can hang the chain indefinitely. If a peer hasn't answered by the time the gate is otherwise green, record "not answered" and proceed.
- **A peer never writes code.** Peers answer questions about their own repo's reality. Changing another repo means that repo's own review and gates — going around them is exactly the irreversible action this command exists to prevent.
- **Peer answers are evidence, not verdicts.** They come from a context you cannot see. If a claim changes a decision, verify it against something concrete (a file, a contract, a test) before acting on it.
- **Ask one narrow, answerable question, anchored to a ref.** Name the exact file, endpoint or contract, pin the ref to read from, and say what a useful answer looks like. "What do you think of this design?" wastes both sessions; a question that resolves against the peer's working tree wastes the answer.
- **One peer per repo.** Several sessions in the same repo are not several sources — they are one repo seen from several checkouts.
- **No peers is the normal case.** Every peer step degrades to silence. A dev with one session open must get the same flow as a dev with nine.

## Phase chain

Run phases in order. Each phase has an entry contract, a designated agent/command, and an **exit gate**. Do not advance past a gate that is not green. The **GOAL metric** established in Phase 0 is the thread — carry it forward into every phase's brief.

### Phase 0 — GOAL (Discovery)

**Command:** `/discovery`
**Inputs:** the user intent, `business.md`.
**Produces:** a discovery brief at `docs/discovery/<slug>.md` — Problem Statement, affected users, JTBD outcome, and a **success metric with baseline + target**, ending in a **Go / No-go / Learn-more** recommendation.
**Exit gate:** recommendation is **Go**, and the success metric is concrete (named metric, baseline value + source, target + date). A **No-go** stops the flow; **Learn-more** pauses it until the flagged experiments run.
**Carry-forward:** copy the success metric into `task.md` section 0 as the **GOAL metric** — this is the anchor every later phase must reference.
**Memory side-effect:** none yet; discovery is exploratory.

> The GOAL phase is what separates this from a plain delivery chain: if you can't state the measurable outcome and its baseline, you're not ready to spec.

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
- Both, when the change spans front + back.

**Inputs:** Phase 3 diff + AC.
**Produces:** integration / E2E / fuzz tests as appropriate, a traceability matrix (AC → test), and confirmation that the **GOAL metric is observable** (the instrumentation from Phase 3 emits and is queryable).
**Then, always:** `security-specialist` runs the security gate. If Phase 2.5 produced a STRIDE table, validate the required controls actually landed in the diff. Otherwise, run a fast pass on the touched files (secret scan + OWASP-relevant checks).
**Peer consult (conditional):** if Phase 2 flagged a cross-repo contract, ask that repo's peer session to confirm the shipped diff doesn't break it — now against real code, not a design sketch. Advisory: a silent peer does not hold the gate, but a peer reporting breakage is a finding that belongs in the record before SHIP.
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
- **Notify affected peers.** If a cross-repo contract shipped, tell each peer session in an affected repo what changed and where, so their context reflects reality instead of a stale assumption. Notification only — do not ask them to adapt their code; that is their repo's own flow.
- Move `docs/todo/<NNN>-<kebab-name>/` → `docs/done/<NNN>-<kebab-name>/`.
**Exit gate:** commits created, memory synced, GOAL baseline recorded, demand moved to `done/`.
**Output:** final summary table — phases passed, files changed, ADRs created, AC coverage, security verdict, GOAL metric + baseline, cost, follow-ups.

### Cost accounting (Phase 6, mandatory)

Measure it — never estimate. **Cost reporting degrades; it never blocks the flow.** Try the sources in order and always say which one produced the number.

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
- [ ] Memory synced
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
- **Never route blocked work through a peer.** See the peer rules above; this is the one that turns a convenience into a permission bypass.
- **Token economy:** prefer Speed-tier agents (`tier: speed`) for routine implementation and Reasoning-tier agents (`tier: reasoning`) for GOAL, design, security, and architecture. Frontmatter is the source of truth — don't pin to model names.

## Output (after each phase)

```
[NNN-<name>] <PHASE> — <Agent/Command> — <PASS|BLOCK|NO-GO>
  Produced: <artifacts>
  GOAL metric: <name> — still traceable? yes/no
  Peer consult: <peer → finding> | none
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
  Peers:     <N consulted, M repos notified> | none
  Custo:     $X.XXXX orquestração · N subagents não contabilizados · /cost p/ total
  Follow-ups: ...
  legend:    ✅ pass · ➖ skipped (not triggered) · ❌ blocked
```
