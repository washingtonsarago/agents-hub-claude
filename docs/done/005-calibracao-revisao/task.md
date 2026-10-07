<!-- demand: 005-calibracao-revisao -->
<!-- created: 2026-09-30 -->
# Change: Calibração de revisão nos agents do hub

## 0. GOAL _(from /discovery — the anchor for every phase)_
**Discovery brief:** docs/discovery/calibracao-revisao.md
**Objective (why):** revisão feita por agent do hub não pode vir com alarmes falsos que o dev precisa refutar — em modelo pequeno, os nossos agents geram quase o dobro dos revisores de referência.
**Success metric:** falsos positivos no benchmark difícil de revisão (40 defeitos plantados, juiz cego opus), haiku, 2 rodadas, 5 agents
**Baseline:** 29 FP · recall 37,5/80 (47%) em haiku; sonnet 80/80 com 1 FP (source: comparativo de 2026-09-29, agents em c173351; referência externa ecc: 15 FP · 37,5/80)  →  **Target:** ≤ 15 FP em haiku com recall ≥ 37,5/80, e sonnet ≥ 79/80 com ≤ 2 FP, by 2026-10-10
**Baseline at ship:** _(filled in Phase 6)_
**Recommendation:** ~~Go~~ → **No-go** (2026-09-30, lead): os revisores medidos já rodam em opus e a regra model × tier da 004 impede haiku neles; o problema não ocorre no uso real. Ver o brief.
**Pré-triagem (Phase 0.5):** NOTA 7/10 — acima do corte (> 6)
- A1 Deliverable 6: "seção curta de calibração nos agents que revisam código" nomeia a capacidade, mas o conjunto de arquivos fica aberto — os 5 agents do benchmark são só os medidos, não "os que revisam".
- A2 Mechanism 7: instrução no corpo do agent é primitiva existente (`agents/*.md`); o instrumento (benchmark em `scratchpad/compare/`) existe, mas fora do repo e com parâmetro de versionamento não verificado.
- A3 Done 8: condição dada na proposta ("baixar os falsos positivos sem perder defeitos achados", re-rodando o mesmo benchmark em haiku); o número-alvo ≤ 15 vem da referência ecc medida.
- A4 Stability 7: um caminho só depois da divisão 005/006 decidida pelo lead; a forma do texto (comum × por stack) fica em aberto.

## 1. Description _(DEFINE — PO)_

## 2. User stories (INVEST)

## 3. Acceptance criteria (Gherkin)

## 4. Out of scope

## 5. Implementation guide _(PLAN — Architect)_

## 6. Sensitive surface _(PLAN → triggers Security)_
- [ ] Auth / AuthZ  · [ ] Secrets  · [ ] PII  · [ ] Payments
- [ ] File upload/download  · [ ] Deserialization  · [ ] Raw SQL / shell exec
- [ ] Multi-tenant isolation  · [ ] New external integration / trust boundary

## 7. Security _(filled if section 6 has any check)_

## 8. QA plan _(VERIFY)_

## 9. Cross-repo peer consults _(optional — only when another repo is touched)_
Sem peer aplicável: a demanda só toca este repo.

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
**Início:** 2026-09-30T00:13:23Z
**Fonte:** transcript (só orquestrador) — OTEL `live` na máquina, mas o endpoint 9464 está servindo outra sessão
**Comando:**
