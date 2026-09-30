# Discovery: Revisão do escopo dos agents do hub
**Data:** 2026-09-29 | **Facilitador:** Claude (via `/flow`, demanda 004) | **Status:** Validated

## Problem Statement
Devs que usam o hub dependem do Claude Code escolher o agent certo pela `description` do frontmatter quando delegam uma tarefa,
porque não existe nenhuma medida de roteamento no hub (confirmado no context load: sem telemetria de seleção, sem teste, sem eval),
o que faz sobreposição de escopo entre agents só aparecer quando alguém nota o agent errado trabalhando — e agents novos (ex.: `flutter-dart-engineer`, demanda 002) entram sem nenhuma checagem de colisão.

5 Whys, resumido: "o agent errado é escolhido" → porque duas descriptions reivindicam a mesma tarefa → porque cada description é escrita isolada, olhando só o próprio agent → porque não há um conjunto de pedidos de referência contra o qual comparar → porque roteamento nunca foi tratado como comportamento testável.

## Usuários afetados
| Segmento | Quem | Dor (1-5) | Frequência | Workaround atual |
|---|---|---|---|---|
| Dev da engenharia | Usa o hub via `ahc sync` e delega tarefas em linguagem natural | 2 | Diária, mas o erro é raro (ver baseline) | Nomeia o agent explicitamente |
| Mantenedor do hub | Escreve/ajusta agents | 3 | A cada agent novo | Revisão a olho das descriptions |
| Commands do hub (`/flow`, `/feature-flow`…) | Roteiam por nome fixo | 1 | — | Não dependem da description |

**Research gap:** nenhum relato de dev registrado sobre agent errado; a dor do segmento 1 é inferida, não observada.

## Outcome desejado
**JTBD:** Quando eu delego uma tarefa ao Claude sem dizer qual agent, quero que ele escolha o agent cujo escopo cobre a tarefa, para que eu não receba o trabalho de um especialista da área vizinha.

```
Metric: acurácia de roteamento no eval de referência (docs/discovery/revisao-escopo-agents/)
        = casos em que o 1º Agent tool_use cai num agent aceito / total de casos
Baseline: 70/73 (95,9%) — opus, 2026-09-29, base@d78e998, rótulos v2 (pós-decisão do lead)
          · evalset.json (48): 47/48 — clear 21/21, boundary 21/21, gap 5/6
          · evalset-hard.json (25): 23/25 — rodadas r1/r2 + delta de 2 rodadas nos 5 casos re-rotulados
Erros sistemáticos (errados em 2/2 rodadas): 1 — h-rev-generic (PR genérico → emstech-reviewer)
Target: 0 erros sistemáticos e ≥ 71/73, até 2026-10-10
Leading indicators: h-rev-generic sai de emstech-reviewer; rev-1/rev-2 continuam no reviewer renomeado
```

**Como foi medido (reprodutível):** `build-agents.js` monta o `--agents` só com `agents/*.md` do hub; `route-one.js` roda `claude -p` num diretório vazio com `--tools Agent --setting-sources "" --strict-mcp-config`, lê o stream e **mata o processo no primeiro `Agent` tool_use** — o subagent nunca executa. O init confirmou 26 agents visíveis: os 21 do hub + 5 embutidos (`claude`, `Explore`, `general-purpose`, `Plan`, `statusline-setup`); agents locais do `~/.claude/agents` ficam fora. Cada pedido é embrulhado em "Delegue esta tarefa ao subagent mais apropriado, sem executá-la você mesmo". Casos de lacuna aceitam `general-purpose`/`claude`.

### Achados do baseline
| Caso | Esperado | Escolhido | Rodadas | Leitura |
|---|---|---|---|---|
| h-rev-generic "Revise o PR #51 (texto de botões)" | general-purpose | `emstech-reviewer` | 2/2 | A description ("Use as the reviewer of a code change in two modes") captura **qualquer** revisão |
| h-arch-adr "Registre num ADR a decisão de trocar REST por eventos" | system-architect | `project-memory-keeper` | 2/2 | Os dois reivindicam ADR: architect ("ADRs"), memory-keeper ("owns … ADRs in docs/adr/"). **Rótulo discutível** — registrar decisão já tomada é o trabalho declarado do memory-keeper |
| h-nostack-api "Crie uma API REST de cadastro" | general/system-architect | nodejs / NONE | 1+1 | Ruído: sem stack, qualquer escolha é chute |
| gap-sap "IDoc ORDERS05" | general-purpose | integration-architect | 1/1 | Defensável (EDI é integração); o hub não tem agent SAP (existe só local, fora do hub) |

### Achados estáticos (frontmatter, fora do eval)
- `senior-product-owner`: `model: haiku` com `tier: reasoning` — contraditório (haiku é o modelo de speed).
- `aws-devops-engineer`: `model: sonnet` com `tier: reasoning` — os demais `reasoning` usam opus.
- Lacunas do hub: Flutter/Dart (demanda 002 em andamento), Java/Spring, SAP, contratos, MySQL, Azure. No eval as lacunas caem corretamente em `general-purpose` (5/6) — ou seja, lacuna hoje **não** gera roteamento errado, só ausência de especialista.

## Premissas & Riscos
| # | Premissa | Tipo | Confiança (1-5) | Teste |
|---|---|---|---|---|
| 1 | Os rótulos do eval refletem o escopo **pretendido** pelo lead (ex.: PR genérico não é do emstech-reviewer; ADR é do architect) | Desirability | 2 | Perguntar ao lead os 2 casos contestados |
| 2 | Roteamento no `claude -p` com o prompt embrulhado aproxima o de uma sessão interativa | Feasibility | 3 | Aceito como proxy; a sessão real tem mais agents (locais) e contexto — o eval mede as descriptions do hub isoladas, que é o que o hub controla |
| 3 | 72 casos escritos por uma só pessoa cobrem as colisões relevantes | Feasibility | 3 | Adicionar casos a cada agent novo (a 002 é o primeiro) |
| 4 | O modelo é estável entre rodadas | Feasibility | 4 | 2 rodadas do hard set deram exatamente os mesmos erros |
| 5 | Um erro de 94,4% justifica mexer em descriptions | Viability | 3 | Mudança é pequena (2 descriptions) e o eval vira gate barato para agents futuros |

## Experimentos
| # | Experimento | Testa | Custo | Sinal de sucesso |
|---|---|---|---|---|
| 1 | Perguntar ao lead o dono pretendido de "revisão genérica de PR" e "registrar ADR" | Premissa 1 | minutos | Rótulos confirmados ou corrigidos |
| 2 | Rodar o eval com sonnet além de opus | Premissa 2 (sensibilidade ao modelo) | ~72 chamadas | Mesmos erros sistemáticos |
| 3 | Rodar o eval incluindo `flutter-dart-engineer` da 002 | Premissa 3 | ~72 chamadas | Nenhuma colisão nova com `ux-designer-mobile` |

## Decisões do lead (experimento 1, 2026-09-29)
- **Revisão de PR:** tirar "emstech" do nome → **`change-reviewer`** (agent + skill + referências). Alcance **continua restrito**: gate do `/flow-lite` e pedidos que citem as regras/perfil dele; revisão genérica de PR não é dele. Mesmo PR da 004, com review do autor da #26 (Gabriel Marcelo).
- **ADR:** **architect decide, memory registra.** `system-architect` quando há decisão a tomar; `project-memory-keeper` quando a decisão já foi tomada e só falta registrar. Explicitar nas duas descriptions.
- Re-rotulagem: `h-arch-adr` (decisão já tomada) → `project-memory-keeper`; novo `h-arch-decide` → `system-architect`; `rev-1`/`rev-2` reescritos sem "emstech" para valer antes e depois do rename. Medido em 2 rodadas: ADR já acerta os dois casos com a regra; só `h-rev-generic` segue errado.

## Recomendação
**Go.** A hipótese de partida ("descriptions fazem o agent errado ser escolhido") foi **em grande parte refutada** — 21/21 claros e 21/21 de fronteira. O problema real é estreito: **1 erro sistemático** (revisão genérica capturada pelo reviewer do `/flow-lite`), **1 fronteira implícita** (ADR, hoje certa por sorte da redação) e **2 incoerências model × tier**.

Escopo do Go: (a) rename `emstech-reviewer` → `change-reviewer` com description restrita; (b) explicitar a regra de ADR nas descriptions de `system-architect` e `project-memory-keeper`; (c) alinhar `model`/`tier` de `senior-product-owner` e `aws-devops-engineer`; (d) promover o eval a ferramenta versionada do hub, para agent novo passar por ele antes do merge.

## Próximos passos
- [x] Lead decide os 2 donos (experimento 1)
- [x] Alinhar os rótulos do eval à decisão e medir de novo
- [ ] Handoff ao `senior-product-owner` (DEFINE)
