# Discovery: Agent de QA mobile com Maestro no `/flow`
**Data:** 2026-09-30 | **Facilitador:** Claude (via `/flow`, demanda 007) | **Status:** Validated

## Problem Statement
Devs que mudam app mobile (Flutter, React Native, nativo) chegam ao VERIFY do `/flow` sem especialista de teste ponta a ponta,
porque a Phase 4 só roteia Go → `go-sdet-backend` e Frontend/E2E → `cypress-qa-analyst` (`commands/flow.md`, Phase 4) e o hub não tem agent de QA mobile,
o que deixa o gate "teste que falha sem a mudança" sem quem saiba escrever e rodar E2E em dispositivo, e faz o pedido de teste mobile cair em `general-purpose`.

## Usuários afetados
| Segmento | Quem | Dor (1-5) | Frequência | Workaround |
|---|---|---|---|---|
| Dev mobile (Flutter/RN/nativo) | Pede E2E do app | 4 | A cada feature de app | `general-purpose` sem padrão de ferramenta |
| `/flow` em demanda mobile | VERIFY por stack | 4 | Toda demanda mobile | Sem agent; gate de RED sem dono |
| Demanda 002 (`flutter-dart-engineer`) | Implementa Flutter | 3 | — | Sem par de QA |

**Research gap:** o tamanho da audiência mobile na engenharia é desconhecido (mesmo risco D1 da 002).

## Outcome desejado
**JTBD:** Quando mudo um app mobile, quero que o pedido de teste E2E vá para um especialista que escreve e roda flows em dispositivo, para o gate do VERIFY ter prova real e não uma promessa.

```
Metric: roteamento de pedidos de E2E mobile para um especialista de QA mobile
        (eval de roteamento do hub, opus, 2 rodadas, 4 pedidos de E2E mobile)
Baseline: 0/4 nas 2 rodadas (0/8) — todos em general-purpose (2026-09-30, agents em 7b24af9;
          scratchpad route/mobile-baseline-r{1,2}.json)
Guardas: eval completo sem regressão (≥ 72/73 e 0 erros sistemáticos, o nível da 004);
         cypress-qa-analyst e ux-designer-mobile continuam com os casos deles
Target: 4/4 nas 2 rodadas + Phase 4 do /flow roteando mobile → mobile-qa-analyst, até 2026-10-17
Leading indicator: casos clear/boundary novos do agent passam no eval antes do merge
```

## Achados da pesquisa (fontes oficiais, 2026-09-30)
- Maestro é caixa-preta: lê a Semantics Tree no Flutter (seletor recomendado `Semantics(identifier:)`, Flutter ≥ 3.19; **não enxerga `Key`s**), `testID` no React Native, ADB no Android; **iOS só em simulador**. https://docs.maestro.dev/get-started/supported-platform/flutter · …/react-native
- Flows YAML (`appId`, `launchApp`, `tapOn`, `inputText`, `assertVisible` com retry de 7 s, `runFlow`, `env`); CLI `maestro test`. https://docs.maestro.dev/maestro-cli/
- Limitações: `inputText` só ASCII no Android; `hideKeyboard` instável no iOS; WebView no Android exige ajuste; MDM corporativo pode bloquear o driver. https://docs.maestro.dev/extra-materials/troubleshooting/known-issues.md
- Complementos para Flutter com acesso ao código: `integration_test` (oficial) e Patrol (LeanCode). https://docs.flutter.dev/testing/integration-tests · https://patrol.leancode.co/
- CI: action `mobile-dev-inc/action-maestro-cloud` (pago, limite de 20 min); receita de emulador local no GitHub Actions não está na doc oficial.

## Premissas & Riscos
| # | Premissa | Tipo | Confiança | Teste |
|---|---|---|---|---|
| 1 | Há demanda mobile suficiente na engenharia | Desirability | 2 | Mesmo risco D1 da 002; não bloqueia — reverter custa um commit |
| 2 | Um agent novo não rouba casos do `cypress-qa-analyst` nem do `ux-designer-mobile` | Feasibility | 3 | Eval completo com casos boundary contra os dois |
| 3 | O gate de RED é cumprível em mobile | Feasibility | 2 | Sem emulador/Mac o agent precisa degradar: escrever o flow e marcar "não executado", nunca fingir verde |
| 4 | Instalar Maestro por `curl \| bash` é aceitável | Viability | 3 | Avaliação do `security-specialist` (supply chain) |
| 5 | Dados de teste em PT-BR funcionam | Feasibility | 2 | Limitação ASCII do `inputText` no Android: o agent orienta a contornar |

## Recomendação
**Go.** Lacuna medida (0/8), mecanismo conhecido (Maestro + fallback Patrol/integration_test), instrumento pronto (eval da 004).

## Próximos passos
- [ ] DEFINE — senior-product-owner (depois que a 006 fechar o SHIP, para não disputar o `flow.md`)
