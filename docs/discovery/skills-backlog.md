# Discovery: Quais skills faltam no agents-hub-claude

**Data:** 2026-06-22 · **Facilitador:** Claude (assistente do PO) · **Status:** Exploring

## Problem Statement

> Times de eng/produto/design que usam o toolkit struggle com **inconsistência e retrabalho na produção de artefatos repetíveis** (ADRs, planos de teste, postmortems, diagramas, docs de produto) quando precisam entregar esses artefatos no dia a dia, porque a camada de **skills** é a mais fraca do hub (era 4, agora 7, todas concentradas em 2 tipos: diagrama e doc de release), o que leva a **artefatos feitos à mão, em formatos divergentes, com qualidade variável** — exatamente o problema que os `PR-REVIEW-*.md` evidenciam.

## Por que skills (e não mais agents/commands)

O hub tem **20 agents** (fortes) e **14 commands** (fortes), mas só **7 skills**. Skills são *model-invoked* — disparam sozinhas pela descrição, sem o usuário lembrar de um comando. São o melhor veículo para **artefatos padronizados recorrentes**: o valor está em garantir o *mesmo formato, toda vez*. Esse é o gap de maior alavancagem agora.

## Usuários afetados

| Segmento | Quem são | Dor (1-5) | Frequência | Workaround atual |
|---|---|:---:|---|---|
| Engenheiros backend/frontend | consumidores dos agents | 4 | Semanal | Copiam template de outro repo ou escrevem do zero |
| QA / SDET | cypress-qa, go-sdet | 4 | Por feature | Plano de teste ad-hoc, sem formato comum |
| PO / PM | usuário desta sessão | 3 | Por iniciativa | Docs de produto manuais (parcialmente coberto agora por `product-brief`) |
| Tech leads / arquitetos | system-architect | 4 | Por decisão/incidente | ADR/postmortem manual (ADR agora coberto) |
| SecOps | security-specialist | 3 | Por superfície sensível | Threat model informal |

**Research gap:** não há telemetria de *quais artefatos o time mais gera à mão*. Recomendação abaixo (Step 6) inclui instrumentar isso.

## Outcome desejado

```
Quando preciso produzir um artefato recorrente (ADR, test plan, postmortem, diagrama),
quero que a skill certa dispare e gere o documento no formato-padrão do time,
para eu focar no conteúdo e não no formato — com consistência entre pessoas e repos.
```

**Métrica de sucesso (proposta):** % de artefatos gerados via skill vs. à mão.
Baseline: ~0% (skills atuais cobrem só diagrama/release) → Target: 60% dos artefatos recorrentes via skill até 2026-09-30.
**Indicador líder:** nº de invocações de skill / semana (instrumentável via hook de uso).

## Candidatos de skill (backlog priorizado)

Avaliação RICE simplificada — **Reach** (quantos times tocam) × **Impact** (1-3) ÷ **Effort** (P/M/G). ✅ = já entregue nesta sessão.

| # | Skill | Eixo | Reach | Impact | Effort | Prioridade | Par com |
|---|---|---|:---:|:---:|:---:|:---:|---|
| ✅ | `adr` | Eng | Alto | 3 | P | feito | system-architect |
| ✅ | `product-brief` | Produto | Médio | 3 | P | feito | senior-product-owner |
| ✅ | `pr-review` | Processo | Alto | 2 | P | feito | code-review |
| ✅ | `test-plan` | Eng/QA | Alto | 3 | M | feito | cypress-qa, go-sdet |
| ✅ | `postmortem` | Eng/SRE | Alto | 3 | P | feito | incident-response (cmd) |
| 3 | **`flowchart-diagram`** | Visual | Alto | 2 | P | **P1** | (família diagram) |
| 4 | **`threat-model`** (STRIDE) | Segurança | Médio | 3 | M | **P1** | security-specialist |
| 5 | **`prioritization`** (RICE/MoSCoW/Kano) | Produto | Médio | 2 | P | **P1** | senior-product-owner, discovery |
| 6 | **`runbook`** | Eng/Ops | Médio | 2 | P | **P2** | aws-devops-engineer |
| 7 | **`state-diagram`** | Visual | Médio | 2 | P | **P2** | (família diagram) |
| 8 | **`c4-diagram`** | Visual | Médio | 2 | M | **P2** | system-architect |
| 9 | **`okr`** | Produto | Baixo | 2 | P | **P3** | senior-product-owner |
| 10 | **`pr-description`** | Processo | Alto | 1 | P | **P3** | smart-commit (cmd) |
| 11 | **`story-map`** | Produto | Baixo | 2 | M | **P3** | discovery, product-brief |

## Premissas & Riscos

| # | Premissa | Tipo | Confiança (1-5) | Como validar |
|---|---|---|:---:|---|
| 1 | Times geram esses artefatos com frequência suficiente p/ justificar skill | Desejabilidade | 3 | Instrumentar uso; perguntar em 1 retro |
| 2 | Skills *model-invoked* disparam no momento certo (descrição boa) | Exequibilidade | 4 | Testar gatilhos das 3 já entregues por 1 semana |
| 3 | Padronizar artefato > liberdade de formato (não vira camisa de força) | Desejabilidade | 3 | Coletar feedback nas 3 primeiras |
| 4 | Família de diagrama tem valor marginal decrescente | Viabilidade | 4 | Já refletido: visuais despriorizados vs docs/processo |

## Experimentos (cheap-first)

| # | Experimento | Testa | Custo | Sinal de sucesso |
|---|---|---|---|---|
| 1 | Soltar as 3 skills entregues e medir disparos/semana | Premissa 1, 2 | ~0 (instrumentação via hook) | ≥5 invocações reais na 1ª semana |
| 2 | Construir só `test-plan` + `postmortem` (P0) e pedir feedback | Premissa 3 | ~M | QA/SRE adotam sem reclamar do formato |
| 3 | 1 pergunta na retro: "qual doc você mais refaz à mão?" | Reach real do backlog | ~0 | Ranking confirma/reordena P0-P3 |

## Recomendação

**Learn more → build incremental.** Não construir as 11 de uma vez.

1. **Já feito:** `adr`, `product-brief`, `pr-review` (esta sessão) — servem de baseline de qualidade.
2. **Próxima leva (P0):** `test-plan` e `postmortem` — maior reach × impact, baixo/médio esforço, cada uma faz par com agent/command já existente (cypress-qa/go-sdet e a command `incident-response`).
3. **Validar antes de escalar:** instrumentar uso (Experimento 1) e rodar a pergunta de retro (Experimento 3) para confirmar o ranking antes de investir em P1+.
4. **Despriorizar família visual:** já tem 3 skills; valor marginal menor. Construir `flowchart-diagram` só após os P0.

## Próximos passos

- [ ] Aprovar a próxima leva (P0: `test-plan`, `postmortem`) — decisão do PO
- [ ] Instrumentar telemetria de invocação de skill (hook de uso) para fechar o research gap
- [ ] Rodar a pergunta de retro para validar/reordenar o backlog
- [ ] Reavaliar P1+ com dados em ~2 semanas
