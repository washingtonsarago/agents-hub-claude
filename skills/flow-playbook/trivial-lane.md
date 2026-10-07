# Trivial lane — collapsed execution

Read by `/flow` only after pre-flight step 5 records `trivial` in §0 **Faixa**, with F1–F5 cited, before Phase 0. The eight phases stay, each in its collapsed form. Nothing here waives a gate.

## Collapsed phases

| Phase | Collapsed form |
|---|---|
| GOAL | One line in §0: metric, baseline (with source) and target. No `/discovery`. |
| TRIAGE | Runs as written in `flow.md`, always; a SCORE ≤ 6, or an F criterion it drops, leaves the lane (below). |
| DEFINE + PLAN | One short section written by the orchestrator, no subagent: at most 3 AC, the production file, the test that proves it, and **UX:** in §5. No UX consult here. |
| BUILD | The stack dev, who also writes the test that proves the change. |
| VERIFY | The same Phase 4 exit gate, RED proof included. The orchestrator runs the tests and records the RED proof; `security-specialist` runs the security gate (secret scan + OWASP-relevant checks on the touched files). No QA agent, `mobile-qa-analyst` included: the RED proof of a mobile change is the test the stack dev wrote in BUILD, and a flow marked `NÃO EXECUTADO` is never RED proof. |
| REVIEW | `/code-review --single-reviewer <agent>` plus the path of this `task.md`: exactly 1 reviewer. |
| SHIP | As written in `flow.md`. |

In the final output GOAL, DEFINE and PLAN show `◇`; `➖` stays reserved for SEC.

## Mandatory subagents (a run without findings): 4

1. `project-memory-keeper` — context load in pre-flight.
2. The stack dev — BUILD.
3. `security-specialist` — the VERIFY security gate.
4. One reviewer — REVIEW.

`senior-product-owner` and `system-architect` are never mandatory here. The single reviewer is the platform UX agent (`ux-designer-web` or `ux-designer-mobile`) when the diff changes visible UI. Otherwise it is the stack lens the production file fires in `/code-review` Step 2, or a fresh instance of the BUILD stack agent when none fires; no UX agent is dispatched. The single reviewer is never `system-architect`. The count stays at 4 either way.

Conditional, outside the count: the SHIP memory sync (the trivial-lane rule of Phase 6 in `flow.md`: only when the shipped change alters something the memory describes, decided with a citation; otherwise §10 records `nada a sincronizar: <citação>` and no subagent runs), the adversarial verification inside `/code-review`, and re-dispatches after a loop.

A failing single reviewer is a missing lens: verdict `INCOMPLETE`, and REVIEW does not pass.

## Leaving the lane

When, in any phase, an F criterion stops holding (a 2nd production file, a sensitive surface, a contract, a 4th AC, an ADR), follow **Leaving the lane** in `flow.md`:

1. Leave the lane. Record in §0 the criterion that fell, with a citation, and the phase where it fell.
2. Resume in the standard lane from Phase 1 DEFINE; DEFINE and PLAN are redone by the standard-lane subagents.
3. Keep the one-line GOAL only if it meets the Phase 0 exit gate (named metric, baseline with source, target with date); otherwise go back to Phase 0 with `/discovery`.
4. Never return to the trivial lane in the same flow.

A sensitive surface excludes the trivial lane, always, and Phase 2.5 then runs per its trigger.
