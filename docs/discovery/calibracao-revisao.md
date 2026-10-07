# Discovery: Calibração de revisão nos agents do hub
**Data:** 2026-09-30 | **Facilitador:** Claude (via `/flow`, demanda 005) | **Status:** Archived (No-go)

## Problem Statement
Devs que pedem revisão de código a um agent do hub recebem, quando o modelo é pequeno, quase o dobro de alarmes falsos em relação a revisores de referência,
porque os nossos agents de engenharia (`go-senior-engineer`, `python-engineer`, `senior-react-developer`, `dotnet-backend-architect`, `security-specialist`) não trazem nenhuma instrução de calibração — conferir no código antes de afirmar bug, separar bug de sugestão, calibrar severidade, conhecer os falsos positivos típicos da stack,
o que faz o dev gastar tempo refutando achados inexistentes e, com o tempo, parar de confiar nos achados verdadeiros.

5 Whys, resumido: "muitos falsos positivos" → o agent afirma como bug crítico o que não é (ex.: `base.OnModelCreating` ausente, `AsNoTracking` numa entidade modificada, "race" dentro de um `SaveChanges` transacional) → nada no corpo do agent pede verificação antes da afirmação → os agents foram escritos como engenheiros de implementação, e revisão é uma das tarefas, não o foco → nunca houve medição de precisão de revisão.

## Usuários afetados
| Segmento | Quem | Dor (1-5) | Frequência | Workaround atual |
|---|---|---|---|---|
| Dev que usa agent para revisar | Pede "revise este código/PR" e recebe o agent da stack | 3 | Semanal | Descartar achados na mão |
| Dev em modelo menor (haiku/sonnet por custo) | Roda subagent em modelo mais barato | 4 | Cresce com a regra model×tier da 004 | Subir para opus |
| `/code-review` e `/flow` | Usam esses agents como lentes | 3 | Todo flow | Nenhum |

**Research gap:** sem relato de dev registrado; a dor vem do benchmark controlado, não de uso observado.

## Outcome desejado
**JTBD:** Quando peço revisão a um agent do hub, quero que cada problema apontado como bug seja real e com a severidade certa, para eu agir sobre a lista sem precisar refutá-la.

```
Metric: falsos positivos na revisão do benchmark difícil, em haiku, 2 rodadas, 5 agents
        (juiz cego em opus comparando com o gabarito de 40 defeitos plantados)
Baseline: 29 FP · recall 37,5/80 (47%) — 2026-09-29, agents da branch 004 (c173351)
          por agent (FP / achados): dotnet 11 / 7 · security 7 / 8 · go 5 / 7,5 · python 4 / 6,5 · react 2 / 8,5
          referência externa, mesmo benchmark: revisores do ecc 15 FP · 37,5/80
Guarda (não pode piorar): sonnet 80/80 com 1 FP no baseline
Target: ≤ 15 FP em haiku, recall haiku ≥ 37,5/80, sonnet ≥ 79/80 com ≤ 2 FP, até 2026-10-10
Leading indicators: FP do dotnet-backend-architect (11, o maior) cai primeiro; exemplos de FP do juiz deixam de ser "tratado como crítico"
```

## Premissas & Riscos
| # | Premissa | Tipo | Confiança (1-5) | Teste |
|---|---|---|---|---|
| 1 | Instrução de calibração no corpo reduz FP sem derrubar recall | Feasibility | 3 | O próprio benchmark antes/depois, 2 rodadas |
| 2 | 10 revisões por hub/modelo bastam para separar ruído de efeito | Feasibility | 2 | 2 rodadas; se a diferença for pequena, rodar a 3ª antes de concluir |
| 3 | Juiz opus é consistente | Feasibility | 3 | Mesmo juiz e mesmo prompt antes e depois |
| 4 | O benchmark representa revisão real | Desirability | 2 | Limitação declarada; fixtures sintéticos |
| 5 | Versionar fixtures com vulnerabilidades plantadas não dispara os gates do Datadog nem o secret scan | Viability | 2 | Verificar no PLAN: os PR gates ("No new code vulnerabilities") podem bloquear o PR por código de propósito vulnerável |

## Experimentos
| # | Experimento | Testa | Custo | Sinal |
|---|---|---|---|---|
| 1 | Rodar o benchmark depois da mudança (haiku + sonnet, 2 rodadas) | 1, 3 | ~40 revisões + 40 julgamentos (a rodada anterior custou US$ 6,33 medidos) | FP ≤ 15 e recall mantido |
| 2 | Decidir onde o benchmark mora | 5 | PLAN | PR sem bloqueio de gate |

## Recomendação
**No-go (2026-09-30, decisão do lead).** A premissa implícita — de que os agents revisores rodam em modelo pequeno — é falsa no uso real: os 5 agents medidos têm `model: opus` no frontmatter, e a regra `model` × `tier` da demanda 004 (`scripts/validate-artifacts.js`) já proíbe `haiku` com `tier: reasoning`, que é o caso dos 5. O excesso de falsos positivos só aparece quando o benchmark força haiku; em sonnet e opus os dois hubs empatam (80/80 contra 79/80, 1 FP cada).

## Aprendizados
- Medir no modelo em que o artefato de fato roda. O benchmark em haiku foi útil para discriminar prompts, mas não descrevia o uso do hub.
- A guarda contra o risco já existe (regra `model` × `tier`); não é preciso texto de calibração para cobri-lo.
- Oportunidade não testada: em revisão, sonnet empatou com opus e custou ~15% menos no benchmark. Descer os revisores para sonnet exige medir também implementação e arquitetura, que esses agents fazem — fica como ideia, não como demanda.
- O benchmark (fixtures-hard com 40 defeitos plantados, juiz cego) ficou em scratchpad, fora do repo; se voltar a ser útil, versionar exige resolver o risco de os PR gates acusarem as vulnerabilidades plantadas.
