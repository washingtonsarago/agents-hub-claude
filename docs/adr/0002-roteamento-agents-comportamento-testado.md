# ADR-0002: Roteamento de agents como comportamento testado

**Status:** Accepted
**Data:** 2026-09-29
**Demanda:** `docs/todo/004-revisao-escopo-agents/task.md` (§5, decisão do PLAN)
**Decisores:** lead do hub (approval)

## Contexto

O `/flow` seleciona subagents pela `description` do frontmatter. O hub não tinha medição de acurácia dessa escolha até a demanda 004, que criou um eval de referência com 73 casos (base `d78e998`). O eval mostrou **1 erro sistemático reproduzível**: "Revise o PR #51 (texto de botões)" cairia no `emstech-reviewer` em 2/2 rodadas porque a description dele reivindica qualquer revisão, quando o escopo pretendido é só o gate do `/flow-lite`.

Além disso, quando um agent novo é criado (ex.: `flutter-dart-engineer` da demanda 002), não existe gate que garanta ausência de colisão com os existentes. O eval vive em `docs/discovery/`, fora de qualquer caminho que um contributor siga.

## Opcoes consideradas

### Opcao A — Eval versionado como ferramenta determinística

Promover o eval para `scripts/routing-eval/`, com:
- **Evalset pinado:** casos com `id`, `kind` ∈ {clear, boundary, gap, overlap, nostack}, `expect` (agente esperado) e `prompt` (texto do usuário).
- **Cobertura obrigatória:** cada agent novo exige ≥ 1 caso `clear` e ≥ 1 `boundary`.
- **Parte determinística na CI:** valida schema do evalset, verifica cobertura, falha se um agent não tem casos. Teste não chama Claude.
- **Parte com modelo, fora da CI:** execução do eval com `node scripts/routing-eval/run.js` sob demanda, com saída (JSON de roteamento) gravada como evidência na §8 do `task.md`. Métrica GOAL medida assim.

**Prós:**
- Gate barato de CI detecta colisão antes do merge.
- Eval é reproduzível: outro desenvolvedor pode rodar e confirmar.
- Métrica GOAL vira instrumento versionado, não artefato efêmero.
- Custo medido, nunca estimado (cumpre `business.md:49`).

**Contras:**
- Eval com modelo roda fora da CI, custa dinheiro real a cada teste.
- Resultado não é determinístico entre rodadas ou modelos.

### Opcao B — Testes de roteamento em `*.test.js`

Codificar predicados de roteamento diretamente em testes (ex.: "quando o prompt tem 'revise' + 'PR'…").

**Prós:**
- Roda determinístico na CI.
- Integrado ao workflow de testes.

**Contras:**
- Não testa o roteador de verdade (Claude), testa só a lógica de seleção determinística.
- Cada mudança de description exige atualizar teste.
- Não mede acurácia em casos novos/ambíguos; só predicados codificados.
- Violaria anti-pattern de `guidelines.md:52-56` ("Encodar o diff de um PR como teste permanente").

## Decisao

**Opcao A.** Eval versionado como ferramenta determinística.

Racional: é o único jeito de medir roteamento de verdade (usando Claude). Determinístico na CI garante colisão; medição com modelo fica fora. Eval é instrumento, não produto — vive em `scripts/`, não em `docs/discovery/`.

**Estrutura:**

- **`scripts/routing-eval/evalset.json`:** array de 73+ casos. Schema: `id` (string única), `kind` (enum), `expect` (array de agent names ou `["NONE"]`), `prompt` (texto do usuário em PT-BR).
- **`scripts/routing-eval/lib/evalset.js`:** validação de cobertura. Falha se um agent em `agents/` não tem ≥ 1 `clear` e ≥ 1 `boundary` que o esperam.
- **`scripts/routing-eval/run.js`:** executa eval com `claude -p`, toma 2+ rodadas, imprime total, acertos por kind, erros sistemáticos e caminhos dos JSON de saída. Exit code ≠ 0 se houver erro sistemático ou abaixo do limiar passado.
- **`test/routing-eval.test.js`:** valida schema, executa `lib/evalset.js`, falha na BASE (evalset ausente) e quando um agent novo é adicionado sem casos.

**Instrução no README:**
- Ao adicionar agent, adicione ≥ 1 `clear` e ≥ 1 `boundary` ao evalset.
- Rode `node scripts/routing-eval/run.js --rounds 2 --model opus --out /tmp/eval` antes do PR.
- Cole os dois JSON de saída + comando na §8 do `task.md`.
- Aviso: eval tem custo real, não é determinístico.

## Consequencias

**Positivas**
- Agent novo entra sem risco de colisão invisível.
- Roteamento é medido, não suposto.
- Métrica GOAL (`docs/todo/004-revisao-escopo-agents/task.md` §0) fica reproduzível.
- Eval é versionado, não efêmero.

**Negativas**
- Custo real a cada medição do eval (modelo sob demanda).
- Resultado não determinístico; pode variar entre rodadas/versões do modelo.
- Complexidade adicional no onboarding de novo agent.

**Neutras**
- Determinístico na CI garante colisão óbvia; desalinhamento entre CI e resultado do eval fica como discrepância residual (ex.: espera C1, CI aprova com casos, eval retorna C2 numa rodada — informativo, não gate).
- Anti-pattern de `guidelines.md` ("Encodar o diff do PR como teste permanente") não se aplica: casos do evalset são invariante de artefato, não predicado sobre git diff.

## Notas

- **Referência:** demanda 004, task.md §5 (decisão D4: "Eval promovido a ferramenta versionada do hub").
- **Base:** 73 casos de `docs/discovery/revisao-escopo-agents/`, medidos na demanda 004 (baseline 70/73 + 1 sistemático).
- **Teste de cobertura:** `test/routing-eval.test.js:48`, requer ≥ 73 casos no evalset.
- **Cobertura por agent:** `scripts/routing-eval/lib/evalset.js:52-58`, requer ≥ 1 `clear` + ≥ 1 `boundary` por agent em `agents/`.
- **Revisão e aval:** lead do hub, demanda 004, 2026-09-29. Aceito sem mitigações.
- **Fallback:** se o custo do eval se tornar problema, o PLAN pode revisar para Opcao B (teste determinístico) com perda de fidelidade na medição.
