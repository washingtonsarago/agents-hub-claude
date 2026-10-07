# ADR-0003: Texto condicional de command vive em skill inerte lida sob demanda

**Status:** Accepted
**Data:** 2026-09-30
**Demanda:** `docs/todo/006-flow-melhorias/task.md` (§5, decisões D1 e D2)
**Decisores:** lead do hub (escopo e aprovação de exceção), system-architect (desenho)

## Contexto

A demanda 006 acrescenta seis capacidades ao `/flow` e ao `/code-review` (C1–C6 em task.md §1). Essas mudanças ocupam ~7,2 KB de texto obrigatório sempre carregado (gates, template, retomada, teto) e ~2,8 KB de playbook da faixa trivial (C1), lido só quando a faixa é escolhida.

O orçamento de tamanho do `flow.md` está no teto: **470 linhas / 33.000 bytes** (`test/flow-pretriagem.test.js:115-116`). Hoje o arquivo tem **449 linhas / 32.798 bytes**, deixando **folga de 202 bytes**. Seis capacidades não cabem nesse orçamento.

Além disso, o `flow.md` carrega hoje um bloco maior de forma **condicional**: o protocolo de peer sessions (linhas 39–150, **9.165 bytes**, sha256 `e8f907c4a49852085c382ff2149a5b84fb165cd32ebe4af7924e2ea1697e82ad`), que só é usado quando há peer num repo afetado, não em cada invocação.

Há ainda uma restrição de custo: toda vez que um dev roda `/flow`, ele carrega o `flow.md` inteiro em contexto. A faixa trivial (C1) busca baratear a mudança pequena; ampliar o orçamento de forma fixa ia contra esse objetivo.

Precedentes: o `flow.md` já depende de `~/.claude/skills/session-cost/scripts/` (linhas `:21`, `:274`) e o `/flow-lite` depende de duas skills (`README.md:278`), lidas sob demanda.

## Opcoes consideradas

### Opcao A — Relocar para skill inerte, lida sob demanda

Mover o protocolo de peer (9.165 bytes, byte a byte) e o playbook da faixa trivial (≤3.500 bytes, IA) para `skills/flow-playbook/` (SKILL.md stub com `disable-model-invocation: true` + `user-invocable: false`, `peers.md`, `trivial-lane.md`). O `flow.md` fica com gatilho, critério e gate.

**Prós:**
- O custo fixo por invocação **não aumenta**: permanece ≤31.500 bytes para faixa padrão sem peer, ≤35.000 com faixa trivial.
- O caso comum (faixa padrão, sem peer) fica **~5% mais barato** que hoje.
- Nenhuma regra de `flow.md` é reescrita: o protocolo muda de lugar byte a byte, com hash pinado no teste provando integridade.
- Não cria novos slash commands ni ocupa a listagem de skills (flags de frontmatter impedem).
- A skill é veículo de distribuição puro, lido via arquivo sob demanda; fail-closed em ilegibilidade.
- Segue o mesmo canal de distribuição: manifest com sha256 por arquivo, conferido no sync e no validator.

**Contras:**
- Exceção à regra `business.md:56` ("Novas skills vêm do ROADMAP 8.1"): é uma skill inerte, distribuída pelo mesmo manifest, que só carrega texto condicional de um command.
- Leitura de `~/.claude/skills/flow-playbook/` pode pedir permissão fora do cwd, degradando UX (negado equivale a ilegível, coberto por fail-closed).
- Desalinhamento de versão entre `flow.md` e playbook levaria a inconsistência; ambos saem do mesmo `ahc sync` e do mesmo manifest, fail-closed cobre só arquivo ausente ou ilegível; versão incompatível não é detectada e depende de os dois saírem juntos do mesmo sync.

### Opcao B — Ampliar o teto de tamanho

Aumentar de 470/33.000 para ~560/43.500 linhas e bytes. Isso cria espaço para todas as seis capacidades no próprio `flow.md`.

**Prós:**
- Simplicidade: nenhuma skill nova, nenhuma falha de leitura.
- Sem restrição de versão entre artefatos.

**Contras:**
- Seria a **segunda ampliação** consecutiva do teto (31.875 → 33.000 → 43.500), paga em **toda invocação**, inclusive nas triviais que C1 quer baratear.
- Aumento de **+30%** no custo fixo de contexto. A folga de 202 bytes torna-se inútil.
- O objetivo de baratear mudança pequena fica comprometido: uma mudança trivial continua carregando 43.500 bytes de `flow.md` em vez de 31.500.

### Opcao C — Enxugar o texto existente

Remover ou reescrever seções do `flow.md` (ex.: reescrita da rationale do protocolo de peer, retirada de Cost accounting) para liberar espaço.

**Prós:**
- Sem skill nova.

**Contras:**
- **Não fecha sozinha.** A TRIAGE está pinada pela demanda 003 (intocável); a rationale do protocolo de peer e o Cost accounting somam 4–6 KB. Mesmo enxugando, fica acima de 33.000, exigindo (b) junto.
- Reescrever a rationale do protocolo, que é **carga útil do prompt**, arrisca perder regra sem testes para detectar.
- Após enxugar, continua no teto de 33.000, não reduz para abaixo.

## Decisao

**Opcao A.** Relocar para skill inerte lida sob demanda.

Racional: é a única que não aumenta o custo fixo. Na faixa padrão sem peer, custa **~5% menos** que hoje. O playbook é texto condicional dum command, não capacidade nova do hub, e distribui pelo mesmo canal. O precedente já existe: `session-cost` e skills do `/flow-lite` funcionam assim.

**Corte da skill inerte:**
- **Fica em `flow.md`** (sempre carregado): gates das 6 capacidades (PROVA DE RED, status, teto, UX), template com campos obrigatórios (Faixa, F1–F5, Status por fase, UX, Prova de RED, Passagens), retomada no pre-flight, critério objetivo de entrada da faixa trivial, exclusão por superfície sensível (sem válvula de escape), security gate (sempre obrigatório).
- **Vai para `skills/flow-playbook/`** (lido condicionalmente):
  - `peers.md`: protocolo de peer, linhas 39–150 do HEAD, byte a byte, sha256 pinado.
  - `trivial-lane.md`: execução colapsada das 8 fases (GOAL/TRIAGE/DEFINE/PLAN/2.5/BUILD/VERIFY/REVIEW/SHIP), enumeração dos 4 subagents obrigatórios + condicionais, saída da faixa trivial quando critério cai.

**Forma da skill:**
- `SKILL.md` stub com frontmatter: `name: flow-playbook`, `description: Playbook de peer sessions e faixa trivial do /flow` (PT-BR), `disable-model-invocation: true`, `user-invocable: false`. Nenhum slash command novo, nenhuma descrição carregada em sessão.
- Arquivo local `peers.md` e `trivial-lane.md` no diretório da skill, distribuídos pelo manifest.
- Sem colisão de nome com `/flow` nem com comandos nativos.

**Fail-closed da leitura:**
- `trivial-lane.md` ilegível → faixa padrão adotada, com `faixa trivial indisponível: playbook ausente` registrado na §0.
- `peers.md` ilegível → nenhum peer consultado, motivo registrado na §9; peer nunca é gate (`flow.md:145`).

**Guardarrails:**
- `test/flow-pretriagem.test.js:460-475` (AC-07 da demanda 003) varre `skills/**/*.md` procurando `/Phase 0\.5|pré-triagem|TRIAGE \(Prompt clarity\)/i`. O playbook escreve só "TRIAGE", nunca os outros literais.
- Teste de integridade: sha256 do trecho de `peers.md` (heading até fim, com `trimEnd()`) deve casar com `e8f907c4…`.

**Exceção aprovada pelo lead (2026-09-30):**

A regra `business.md` diz "Novas skills vêm do ROADMAP 8.1". O `skills/flow-playbook/` é uma exceção autorizada pela lead do hub porque:
1. Não é capacidade nova do hub; é **veículo de distribuição** do texto dum command existente.
2. Segue o mesmo canal: manifest com sha256, conferido no sync e no validator.
3. Já há precedentes: `session-cost` e `/flow-lite` usam skills pra arquivos carregados sob demanda.

Com o aval, o SHIP emenda a regra de `business.md` para deixar clara a separação: "Novas **capacidades** vêm do ROADMAP 8.1; skills **inertes** que distribuem conteúdo de commands carregado sob demanda ficam fora dessa regra."

## Consequencias

**Positivas**
- Dev rodando `/flow` faixa padrão sem peer carrega ~31.500 bytes de `flow.md`, **~5% menos** que hoje.
- Dev rodando `/flow` faixa trivial carrega ~31.500 + ≤3.500 = ≤35.000 bytes, **ainda abaixo** do teto original de 33.000 que vigoraria para a versão de (b).
- Seis capacidades cabem no orçamento sem ampliar o custo fixo.
- Nenhuma regra de `flow.md` é reescrita; o protocolo de peer fica intacto, comprovado por hash.
- Não cria slash commands novos, não polui a listagem de skills.
- Falha de leitura tem regra fail-closed clara: faixa padrão ou peer silenciado.

**Negativas**
- Leitura de arquivo sob demanda (`~/.claude/skills/flow-playbook/`) pode pedir permissão fora do cwd, degradando UX por um turno quando negado. Isso é ilegibilidade equivalente a arquivo ausente, já coberta por fail-closed.
- Desalinhamento de versão entre `flow.md` e playbook levaria a inconsistência; mitigado por ambos saírem do mesmo manifest, mas é complexidade de distribuição adicionada.
- Exceção à regra ROADMAP 8.1 precisa de aval do lead e cria precedente; próximas demandas podem pedir o mesmo.
- Flagas de frontmatter `disable-model-invocation` e `user-invocable` precisam estar implementadas na versão do Claude Code usado (falha silenciosa = `/flow-playbook` aparece como skill normal, incluindo descrição em listagens).

**Neutras**
- O `flow.md` continua pinado por hash na demanda 003 (`test/flow-pretriagem.test.js`, PHASE4_SHA256). O D2 da 006 acrescenta uma linha (`RED proof`), mas o hash da BASE é calculado sem esse acréscimo — integridade mantida.
- Manifests regenerados dentro de PRs enquanto o ruleset da org bloquear auto-commit na `main` (mitigação já implementada, ortogonal a este ADR).
- A cópia manual do espelho (make-mirror) nunca carrega a skill inerte; quem usa o espelho precisa de credencial própria (não é mudança, apenas apontamento).
- Memória: o anti-pattern "skill inerte que deveria ser prosaico em outro lugar" fica superado como exceção explícita; próximas skills inertes vão precisar de aval também.

## Notas

- **Referência:** demanda 006, task.md §5 (D1: "Orçamento do `flow.md`: relocar o texto condicional para uma skill inerte lida sob demanda").
- **Teste de integridade:** `test/flow-pretriagem.test.js:507` (T3) valida sha256 do trecho de `peers.md`.
- **Revisão e aval:** lead do hub, organization-admin, 2026-09-30. Exceção fica registrada neste ADR e na §5 do task.md.
- **Fallback:** se o aval for retirado antes do SHIP, o PLAN avança para opção (b) e refaz T3–T12.
