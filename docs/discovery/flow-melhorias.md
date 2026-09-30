# Discovery: Melhorias no `/flow` e no `/code-review` vindas do comparativo com o ecc
**Data:** 2026-09-30 | **Facilitador:** Claude (via `/flow`, demanda 006) | **Status:** Validated

## Problem Statement
Devs que rodam o `/flow` pagam o mesmo custo de cadeia (8 fases, ≥ 7 subagents) numa mudança trivial e numa demanda grande, não conseguem retomar um flow interrompido, e recebem um gate de VERIFY ("teste que falha sem a mudança") que depende da palavra do dev,
porque `commands/flow.md` não tem faixa de tamanho (`:414` "Never skip a phase"), não registra status por fase, não limita o loop BUILD↔VERIFY (`:251` "BUILD loops back", sem teto), e o `/code-review` não define o que acontece quando um revisor falha nem verifica achados antes de reportar,
o que leva a flows caros para mudanças pequenas, retrabalho após interrupção e gates que podem passar sem evidência.

**Evidência observada nesta sessão (demanda 004, 2026-09-29):** (a) o classificador de permissão caiu no meio do VERIFY e não havia como retomar pelo `task.md` — foi preciso reler o estado à mão; (b) a prova de "falha sem a mudança" existiu porque o dev a fez por conta própria (mutação/stash), não porque o gate a exigisse em forma verificável; (c) o comparativo estrutural com o ecc (`orch-pipeline`, `tdd-workflow`, `orch-review`, `santa-loop`, `prp-plan`) mostrou as 5 capacidades implementadas lá.

## Usuários afetados
| Segmento | Quem | Dor (1-5) | Frequência | Workaround |
|---|---|---|---|---|
| Dev que roda `/flow` em mudança pequena | Typo, ajuste de config, 1 arquivo | 4 | Frequente | Não usa o `/flow` (perde os gates) |
| Dev com flow interrompido | Sessão cai, limite de contexto, permissão | 3 | Ocasional | Reconstrói o estado lendo o `task.md` |
| Lead/revisor | Confia no gate de VERIFY | 3 | Todo flow | Pede a prova de RED no PR |

**Research gap:** a frequência de "mudança trivial" e de interrupção é inferida; não há telemetria de uso do `/flow` (ROADMAP item 7).

## Outcome desejado
**JTBD:** Quando rodo o `/flow`, quero que o rigor seja proporcional ao tamanho da mudança, que um flow interrompido continue de onde parou e que cada gate exija evidência verificável, para confiar no resultado sem pagar cadeia cheia em mudança pequena.

```
Metric (primária): capacidades presentes nos commands e fixadas por teste determinístico
        (test/*.test.js lendo commands/flow.md e commands/code-review.md, no molde de test/flow-pretriagem.test.js)
        C1 faixa de tamanho · C2 prova de RED em commit · C3 status por fase + retomada · C4 teto de 3 iterações · C5 review fail-closed com verificação adversarial · C6 UX chamado quando a mudança altera UI visível (web → ux-designer-web; Dart/Flutter/mobile → ux-designer-mobile) — acrescentada pelo lead em 2026-09-30
Baseline: 0/6 (grep em commands/flow.md e commands/code-review.md, base 4e9cdc6: nenhum termo de faixa, retomada, teto, fail-closed ou verificação de achado)
Metric (outcome, proxy da spec): fases e subagents obrigatórios numa mudança trivial, contados pelo texto do flow.md
Baseline: 8 fases (GOAL, TRIAGE, DEFINE, PLAN, BUILD, VERIFY, REVIEW, SHIP) · ≥ 7 subagents (memory-keeper ×2, PO, architect, dev, security gate, ≥ 1 revisor)
Target: 6/6 capacidades e, na faixa trivial, ≤ 4 subagents com as 8 fases presentes (colapsadas, nenhuma pulada), sem faixa trivial quando há superfície sensível — até 2026-10-14
Leading indicator: primeira demanda trivial rodada pela faixa nova, com o número de subagents medido
```

## Premissas & Riscos
| # | Premissa | Tipo | Confiança | Teste |
|---|---|---|---|---|
| 1 | Encolher a cadeia para mudança trivial não reabre o problema que o GOAL obrigatório resolve | Desirability | 2 | **Decisão do lead** (abaixo) |
| 2 | "Trivial" é classificável por critério objetivo (arquivos, superfície, AC) sem autoavaliação enviesada | Feasibility | 3 | Critério com citação obrigatória, no molde do cite-or-cap da TRIAGE |
| 3 | Prova de RED em commit cabe no fluxo sem poluir o histórico | Feasibility | 3 | PLAN escolhe entre commit de teste antes do fix e registro do run RED na §8 |
| 4 | Verificador adversarial no `/code-review` não dobra o custo | Viability | 3 | Só verifica BLOCKER/WARNING, não INFO |
| 5 | Teste determinístico de texto de command não vira teste de diff (`guidelines.md:52-56`) | Feasibility | 4 | Fixar invariantes com literais, como o `flow-pretriagem.test.js` |

## Pergunta central para o lead
A faixa trivial contraria `flow.md:414` ("Never skip a phase") e a regra "GOAL is not optional". A proposta é **não pular fase, e sim colapsá-la**: na faixa trivial, GOAL vira uma linha (métrica + baseline no próprio `task.md`, sem `/discovery`), DEFINE e PLAN viram uma seção curta escrita pelo orquestrador sem subagent, e BUILD, VERIFY (com prova de RED), REVIEW (1 revisor) e SHIP seguem. Superfície sensível (§6) tira a mudança da faixa trivial — sempre.

## Decisão do lead (2026-09-30)
**Colapsar, não pular.** Na faixa trivial nenhuma fase some: GOAL vira uma linha no `task.md` (métrica + baseline, sem `/discovery`); DEFINE e PLAN viram uma seção curta escrita pelo orquestrador, sem subagent; BUILD, VERIFY com prova de RED, REVIEW com 1 revisor e SHIP seguem. Superfície sensível (§6) tira a mudança da faixa trivial, sempre. Meta: ≤ 4 subagents.

## Recomendação
**Go.**

## Próximos passos
- [x] Lead decide a regra da faixa trivial
- [ ] DEFINE — senior-product-owner
