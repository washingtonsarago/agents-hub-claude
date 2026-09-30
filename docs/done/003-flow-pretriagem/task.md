<!-- demand: 003-flow-pretriagem -->
<!-- created: 2026-09-17 -->
# Change: Pré-triagem de clareza do prompt no /flow

## 0. GOAL _(from /discovery — the anchor for every phase)_
**Discovery brief:** docs/discovery/flow-pretriagem.md
**Objective (why):** O volume de AC do `/flow` não correlaciona com a dificuldade da demanda — a 001 (ambígua, sensível, decisão revertida no meio) fechou com 16 AC e a 002 (um agent markdown, pedido sem ambiguidade) com 18. Falta um sinal de entrada que calibre quanto de spec a demanda merece.
**Success metric:** nº de AC na §3 do `task.md`, em demandas cuja pré-triagem deu nota > 6
**Baseline:** 17 AC (média de 16 e 18 — as duas demandas já rodadas pelo `/flow`, sem diferenciação por clareza; fonte: `docs/todo/001-ahc-pat-auth/task.md`, `docs/todo/002-flutter-dart-engineer/task.md`)  →  **Target:** ≤ 10 AC em demanda com nota > 6, **com 100% de rastreabilidade AC→teste mantida no gate da VERIFY**, até 2026-10-31
**Leading indicator:** a primeira demanda pós-merge grava nota + justificativa no `task.md`. Sem isso gravado, a métrica não é observável — é o ponto de instrumentação do BUILD.
**Não-objetivo:** reduzir AC em demanda com nota ≤ 6. Se a nota baixa também encolher a spec, a mudança virou desculpa pra especificar menos.
**Baseline at ship (2026-09-17, commit `4c40abe`):** **17 AC** — inalterado, e isso é o esperado, não uma falha.
A métrica mede demandas com **nota > 6**, e **nenhuma existe ainda**: a pré-triagem passa a valer da próxima demanda em diante. A 003 pontuou **4** (abaixo do corte) e fechou com **10 AC** — mas esses 10 vieram de priorização por risco do PO, **não** da regra nova se autoaplicando, e por isso **não contam** para a métrica. Registrar 10 aqui como "melhoria" seria fraude de medição.
**A primeira leitura real é o Experimento 3:** a primeira demanda pós-merge que pontuar > 6. Comandos de coleta na §8; gatilho de reversão na §5.4.
**Recommendation:** Go — com dois ajustes do discovery: (1) a ênfase em performance ganha gatilho próprio (nota > 6 **e** superfície executável), (2) o gate da VERIFY não afrouxa.
**Pré-triagem (Phase 0.5):** NOTA 4/10 — **abaixo** do corte (> 6). Média (6+4+4+5)/4 = 4,75 → `floor` 4, mais veto por A2 e A3. Esta demanda roda o DEFINE completo, sem teto de AC (dry-run, Experimento 2 do discovery; rubrica e método em §5.2/§5.3).
- **A1 Deliverable 6:** o pedido dizia "no `/flow`" e não fechava o file set — a exclusão de `/feature-flow` e `/bug-flow` teve de ser decidida pelo lead depois (§4 deste `task.md`).
- **A2 Mechanism 4:** o mecanismo nomeado era "pontuar de 1 a 10"; eixos, agregação e corte não existiam em nenhum artefato do repo e tiveram de ser inventados no PLAN (§5.2). **Veto.**
- **A3 Done 4:** "menos AC" é adjetivo — o teto `≤ 10` só nasceu no DEFINE (AC-03), não vinha do pedido, e não era derivável de nenhum gate existente (`scripts/validate-artifacts.js`, `node --test`). **Veto.**
- **A4 Stability 5:** "mais foco em performance" deixou aberto se valia para toda nota > 6 ou só para superfície executável; `docs/discovery/flow-pretriagem.md` teve de partir o pedido em dois gatilhos.

## 1. Description _(DEFINE — PO)_

**Problema.** O `/flow` não lê nada sobre a qualidade do prompt que abre a demanda. O DEFINE aplica o mesmo gate ("AC testáveis, escopo limitado") a qualquer entrada, então o volume de AC é praticamente constante e não correlaciona com a dificuldade — chega a correlacionar ao contrário. A 001 (auth + PAT, superfície sensível, decisão de espelho revertida no meio do voo, veredito `APPROVE WITH MITIGATIONS`) fechou com **16 AC**. A 002 (um único `agents/flutter-dart-engineer.md`, pedido sem ambiguidade) fechou com **18 AC** e 357 linhas de `task.md`. AC é trabalho de dois lados — escrever no DEFINE e cobrir com teste no VERIFY ("every AC has at least one automated test that fails without the change") — então o excesso é pago duas vezes em tokens, mais uma terceira na revisão do PR.

**A mudança.** Antes do DEFINE, o orquestrador pontua o **prompt inicial da demanda** de 1 a 10 em **clareza/maturidade**, por rubrica de eixos nomeados, e grava **nota + justificativa por eixo** no `task.md`. Três caminhos:

| Condição | Efeito |
|---|---|
| Nota ≤ 6 | **Nada muda.** O DEFINE roda exatamente como hoje. |
| Nota > 6 | O DEFINE produz **menos AC, com granularidade maior**: cenários agrupados, alguns verificáveis por inspeção objetiva em vez de Gherkin item a item. O gate da VERIFY **não** afrouxa. |
| Nota > 6 **e** superfície executável (`bin/ahc`, `scripts/`, `install.sh`, `mcp/`, `test/`) | O PLAN ganha, além do enxugamento, um bloco de performance **com número**. |

**Valor de negócio.** O custo da mudança é editar um arquivo de prompt (`commands/flow.md`, 420 linhas); reverter é `git revert` + `node scripts/regen-manifest.js`. Não toca superfície sensível, não cria artefato novo, não muda distribuição — o `/flow` já é um command distribuído, e a regra "distribuição só via PR mergeado em `main`" (`business.md`) continua valendo sem alteração. O que se ganha é orçamento de tokens redirecionado do que já estava claro para o que é de fato incerto.

**Segmento.**

| Segmento | Pain | Frequência | Efeito desta mudança |
|---|---|---|---|
| Orquestrador `/flow` (primário) | 4/5 | Toda execução | Ganha o sinal de entrada que hoje não existe |
| Dev/lead que abre demanda no hub | 3/5 | ~1 demanda/semana | Demanda clara deixa de pagar spec completa |
| Contributor que revisa o PR | 2/5 | Todo PR de demanda | Lê nota + justificativa e pode contestar |
| Dev que abre demanda ambígua | — | — | **Nenhum** — é o não-objetivo (§0) |

**Risco aceito e como ele é pago.** A nota é **auto-atribuída por quem se beneficia dela**: quem pontua é o orquestrador, que paga a conta de tokens, e nota alta = menos trabalho (Premissa #2 do discovery, confiança 2/5). Não há árbitro independente neste fluxo e inventar um custaria mais que a mudança inteira. A mitigação aceita é **transparência, não controle**: rubrica fixa com eixos nomeados + justificativa **por eixo** gravada no `task.md`, auditável no PR. Isso não é um detalhe de implementação — é AC (AC-02) e é o leading indicator da métrica.

**Nota desta demanda (dry-run — Experimento 2 do discovery).** O prompt que abriu a 003 exigiu **4 perguntas de desambiguação** do orquestrador antes de o flow abrir, então esta demanda **não** se qualifica para o caminho flexibilizado (nota ≤ 6) e a §3 abaixo é escrita sob o caminho normal. Os 10 AC vêm de **priorização por risco feita pelo PO**, não da regra nova se aplicando a si mesma — escrever 18 AC para a mudança de um arquivo markdown seria repetir exatamente o problema que a demanda existe para resolver.

**Conflito com `business.md`:** nenhum. `business.md` não registra regra de domínio sobre rigor de spec, granularidade de AC ou gates de orquestração do `/flow` — o que ele fixa ("origem única", "distribuição só via PR mergeado", "custo medido, nunca estimado") não é tocado. O único ADR existente (`docs/adr/0001-cascata-de-credenciais-do-ahc.md`) é sobre credenciais. Esta é uma decisão de orquestração interna, não de domínio; se o lead quiser que ela vire regra registrada, o `project-memory-keeper` a grava em `guidelines.md` no SHIP.

## 2. User stories (INVEST)

- **US1 (Must)** — Como **orquestrador do `/flow`**, quero pontuar o prompt inicial de 1 a 10 por uma rubrica de eixos nomeados antes de entrar no DEFINE, para calibrar quanto de spec a demanda merece em vez de aplicar o mesmo rigor a todo prompt.
- **US2 (Must)** — Como **dev/lead que abre uma demanda já clara e pequena**, quero que nota > 6 produza menos AC com granularidade maior, para não pagar spec completa por um pedido que já chegou resolvido.
- **US3 (Must)** — Como **contributor que revisa o PR**, quero ler no `task.md` a nota e a justificativa **por eixo**, para auditar no PR uma nota que foi auto-atribuída por quem se beneficia dela.
- **US4 (Must)** — Como **dev que abre uma demanda ambígua**, quero que nota ≤ 6 rode exatamente o fluxo de hoje, para que a mudança não vire desculpa para especificar menos justamente onde o risco é maior.
- **US5 (Must)** — Como **QA/SDET do VERIFY**, quero que todo AC que sobreviveu ao enxugamento continue exigindo teste automatizado que falha sem a mudança, para que menos AC não vire menos cobertura.
- **US6 (Should)** — Como **lead do hub**, quero bloco de performance obrigatório só quando a demanda toca superfície executável, para não trocar cerimônia de AC por cerimônia de performance num arquivo `.md` que não tem latência nenhuma.

## 3. Acceptance criteria (Gherkin)

**Definições:** **ARQUIVO** = `commands/flow.md` · **BASE** = `origin/main` · **SEÇÃO** = a etapa de pré-triagem introduzida por esta mudança dentro de `## Phase chain` · **RUBRICA** = o conjunto de eixos nomeados definido na SEÇÃO · **NOTA** = inteiro de 1 a 10 resultante da RUBRICA · **CORTE** = NOTA > 6 · **TEMPLATE** = o bloco de código markdown sob o heading `## <task.md> template` dentro do ARQUIVO · **SUP-EXEC** = demanda cujo diff previsto toca `bin/ahc`, `scripts/`, `install.sh`, `mcp/` ou `test/`.

**Natureza da prova.** ARQUIVO é prompt, não código: **não existe neste repo harness que execute o orquestrador e observe a nota** — o mesmo limite já registrado na 002 para comportamento de agent. Logo nenhum AC aqui depende de teste comportamental de modelo. Todo AC é verificável por **comando determinístico** sobre arquivo/diff/manifest/suíte, ou por **inspeção objetiva do diff** com predicado binário. Os predicados de AC-01…AC-08 são `grep`/`git diff` e devem ser encodados pelo VERIFY como asserções em `test/*.test.js` sobre `commands/flow.md` — elas falham sem a mudança, que é o que o gate da Phase 4 exige. Hoje `test/` tem 19 arquivos e **nenhum** cobre `commands/`; criar essa cobertura é trabalho do VERIFY, não pré-requisito deste DEFINE.

- [ ] **AC-01 — A pré-triagem existe como etapa nomeada entre GOAL e DEFINE, com rubrica de eixos** _(Inspeção + Comando)_
  - Given na BASE o `## Phase chain` vai de `### Phase 0 — GOAL` direto para `### Phase 1 — DEFINE`
  - When se lê o ARQUIVO após a mudança
  - Then existe uma etapa de pré-triagem com heading próprio, posicionada **entre** Phase 0 e Phase 1 — `grep -n '^### Phase' ARQUIVO` mostra o heading novo nessa posição
  - And a SEÇÃO define uma RUBRICA com **no mínimo 3 eixos nomeados**, a escala 1–10, como os eixos compõem a NOTA e o CORTE escrito como `> 6`
  - And a SEÇÃO declara em texto que o eixo é **clareza/maturidade do prompt** e que complexidade, criticidade e tamanho da demanda **não** entram na NOTA
  - _Move GOAL?_ **sim** — a métrica é "nº de AC em demandas com nota > 6"; sem NOTA definida não existe a população que a métrica mede.

- [ ] **AC-02 — NOTA e justificativa por eixo gravadas no `task.md`** _(Inspeção + Comando)_
  - Given a nota é auto-atribuída por quem se beneficia dela, e a mitigação aceita é transparência
  - When o orquestrador conclui a pré-triagem
  - Then o TEMPLATE dentro do ARQUIVO ganha um campo de pré-triagem contendo: a NOTA, e **uma linha de justificativa por eixo** da RUBRICA (não uma justificativa agregada)
  - And a SEÇÃO declara a gravação **obrigatória** e que o DEFINE **não inicia** sem ela — o bloco `### Phase 1 — DEFINE` referencia a NOTA gravada em seus `**Inputs:**`
  - And `docs/todo/003-flow-pretriagem/task.md` grava a própria NOTA com justificativa por eixo (dry-run, Experimento 2 do discovery), e a NOTA registrada é **≤ 6**
  - And comando: `grep -c '<rótulo do campo de pré-triagem>' commands/flow.md docs/todo/003-flow-pretriagem/task.md` ≥ 1 em cada arquivo
  - _Move GOAL?_ **sim** — é o leading indicator declarado na §0. Sem NOTA gravada a métrica não é observável, e sem justificativa por eixo o risco de auto-serviço não tem como ser auditado no PR.

- [ ] **AC-03 — NOTA > 6 enxuga o DEFINE com teto numérico, não com adjetivo** _(Inspeção + Comando)_
  - Given CORTE verdadeiro
  - When o DEFINE roda
  - Then a SEÇÃO instrui: teto explícito de **≤ 10 AC** na §3 do `task.md`, agrupamento de cenários relacionados num AC só, e permissão de verificação por **inspeção objetiva** no lugar de Gherkin item a item
  - And o teto está escrito como **número**, não como adjetivo ("menos", "enxuto", "o necessário") — `grep -E '(≤|<=) ?10' ARQUIVO` casa dentro da SEÇÃO
  - And a SEÇÃO mantém a exigência de que todo AC, agrupado ou não, seja verificável por comando ou inspeção objetiva — granularidade maior não autoriza AC subjetivo
  - _Move GOAL?_ **sim** — é a instrução que produz o alvo (baseline 17 → ≤ 10).

- [ ] **AC-04 — Menos AC, não AC mais frouxo: o gate da VERIFY fica intacto** _(Comando + Inspeção)_
  - Given a linha de exit gate da Phase 4 na BASE: "every AC has at least one automated test that **fails without the change**"
  - When se inspeciona `git diff BASE -- commands/flow.md`
  - Then o bloco `### Phase 4 — VERIFY` não tem nenhuma linha removida nem alterada — comando: `git diff BASE -- commands/flow.md | grep '^-' | grep -v '^---' | grep -ci 'automated test\|VERIFY\|traceability'` = **0**
  - And a SEÇÃO afirma explicitamente que o teto reduz a **quantidade** de AC e **não** o rigor de prova de cada AC que sobreviveu
  - _Move GOAL?_ **não** — protege a cláusula do target "com 100% de rastreabilidade AC→teste mantida" (Premissa #3). Sem ele a métrica melhora enquanto a cobertura cai, que é o modo de falha mais caro desta mudança.

- [ ] **AC-05 — Não-regressão: NOTA ≤ 6 roda exatamente o fluxo de hoje** _(Comando + Inspeção)_
  - Given uma demanda cuja pré-triagem deu NOTA ≤ 6
  - When o DEFINE roda
  - Then a SEÇÃO diz explicitamente que NOTA ≤ 6 segue o DEFINE atual — sem teto de AC, sem agrupamento obrigatório e sem bloco de performance
  - And o diff sobre o fluxo existente é **aditivo**: toda linha removida (`git diff BASE -- commands/flow.md | grep '^-' | grep -v '^---'`) reaparece no lado `+` com o texto original preservado (realocação/renumeração); **nenhuma instrução do fluxo atual é removida em termos líquidos**
  - And o bloco `### Phase 1 — DEFINE` conserva suas linhas `**Produces:**` e `**Exit gate:**` originais, admitindo no máximo acréscimo que referencie a NOTA
  - _Move GOAL?_ **não** — protege o não-objetivo declarado na §0 ("reduzir AC em demanda com nota ≤ 6" = a mudança falhou).

- [ ] **AC-06 — Bloco de performance só com NOTA > 6 _e_ superfície executável** _(Inspeção + Comando)_
  - Given CORTE verdadeiro
  - When a demanda é avaliada quanto a SUP-EXEC
  - Then a SEÇÃO define SUP-EXEC pela lista literal `bin/ahc`, `scripts/`, `install.sh`, `mcp/`, `test/` — `grep -c 'bin/ahc' ARQUIVO` ≥ 1 e as 5 entradas aparecem na SEÇÃO
  - And a condição é **conjunção**: CORTE **E** SUP-EXEC → o PLAN produz bloco de performance com **número** (orçamento ou medida), e a SEÇÃO diz o que medir
  - And CORTE **e** demanda só de conteúdo (`.md`) → **nenhum** bloco de performance é adicionado; o único efeito da nota alta é o teto de AC
  - _Move GOAL?_ **não** — protege a Premissa #5: impede trocar cerimônia de AC por cerimônia de performance onde não há latência a otimizar.

- [ ] **AC-07 — Escopo: um arquivo, nenhum artefato novo, nenhum subcomando inventado** _(Comando)_
  - Then `git diff --name-only BASE` lista **apenas** `commands/flow.md`, `manifest.json`, `docs/todo/003-flow-pretriagem/task.md`, `docs/discovery/flow-pretriagem.md` e o arquivo de teste criado pelo VERIFY em `test/` _(allowlist corrigida pelo orquestrador no gate do DEFINE: a redação original excluía o `test/*.test.js` que o próprio bloco «Natureza da prova» exige da Phase 4)_
  - And `git diff --name-only BASE -- commands/feature-flow.md commands/bug-flow.md agents/ skills/ autonomous/` retorna **vazio** (decisão do lead, §4)
  - And nenhum arquivo é criado em `commands/`, `agents/`, `skills/` ou `autonomous/`, e a SEÇÃO **não** define slash command nem subcomando novo — a pré-triagem é etapa interna do `/flow`, invocada por nenhuma sintaxe nova
  - _Move GOAL?_ **não** — guarda-corpo de escopo e da regra de não sombrear comando nativo.

- [ ] **AC-08 — Idioma conforme `guidelines.md` §Idioma** _(Inspeção)_
  - Given `guidelines.md`: "Instruções para o modelo (corpo de agent/command) → **inglês**. Output que o usuário lê, exemplos no `description`, templates de relatório → **PT-BR**."
  - When se lê a SEÇÃO
  - Then as instruções ao orquestrador estão em **inglês**, como o resto do ARQUIVO
  - And os campos que a SEÇÃO acrescenta ao TEMPLATE e qualquer texto que o usuário lê estão em **PT-BR**, como os blocos PT-BR já existentes no ARQUIVO (§11 `Custo`, a fala de telemetria do pre-flight)
  - _Move GOAL?_ **não** — conformidade de convenção; um PR que a viola não mergeia, e sem merge nenhuma demanda recebe a instrução.

- [ ] **AC-09 — Gates mecânicos do repo verdes** _(Comando)_
  - Then `node scripts/validate-artifacts.js --strict` sai 0 com **0 errors e 0 warnings**, sem alterar nenhuma linha do validator
  - And após `node scripts/regen-manifest.js`, o `--check` sai 0; a entrada `commands.flow` traz `sha256` batendo com o arquivo novo e `version` com **minor bump** (`1.2.5` → `1.3.0`, via `--bump=minor`) _(emendado pelo orquestrador no gate do PLAN, 2026-09-17: a redação original fixava o default de `scripts/regen-manifest.js`; o histórico do próprio manifest mostra `feat(flow)` → minor (`3a02cf6`/`6f0e042`: 1.0.0→1.1.0; `c96b610`: 1.1.1→1.2.0) e `fix(flow)` → patch (`6f9a1fa`, `729ce6c`). O salto 1.2.1→1.2.5 em `bf03b10` é churn de regeneração, não decisão)_
  - And `node --test test/*.test.js` passa sem alterar teste existente
  - _Move GOAL?_ **não** — gate de merge; é o que faz a instrução chegar aos devs via `ahc sync`.

- [ ] **AC-10 — Backtest da rubrica separa a 001 da 002** _(Inspeção + Comando)_
  - Given os prompts originais que abriram as demandas 001 e 002
  - When a RUBRICA é aplicada aos dois e o resultado é gravado na §5 deste `task.md` (saída do PLAN, Experimento 1 do discovery)
  - Then existe uma tabela com a NOTA de cada uma **por eixo**, e a 002 pontua **acima** da 001
  - And a 002 cai em CORTE (> 6) e a 001 **não** (≤ 6)
  - And se a 001 pontuar > 6, a RUBRICA está reprovada e o AC **falha** — volta ao PLAN
  - _Move GOAL?_ **sim, indiretamente** — se a RUBRICA não ordena clareza, o CORTE seleciona a população errada e o alvo "≤ 10 AC" vira redução indiscriminada, que é literalmente o não-objetivo da métrica.

### 3.1 Linkagem com a GOAL metric

| AC | Papel na métrica |
|---|---|
| AC-01 | Define a população medida — "demandas com nota > 6" só existe se a NOTA existir |
| AC-02 | **Instrumenta** — sem nota + justificativa gravadas, a métrica não é observável (leading indicator da §0) |
| AC-03 | Produz o efeito — o teto ≤ 10 é o que move 17 → ≤ 10 |
| AC-10 | Valida que o CORTE seleciona as demandas certas |
| AC-04, AC-05 | Protegem, respectivamente, a cláusula de rastreabilidade do target e o não-objetivo |
| AC-06, AC-07, AC-08, AC-09 | Guarda-corpos de escopo, convenção e merge — não movem a métrica, mas sem eles nada chega ao dev |

**Como medir no ship (§0 "Baseline at ship").** Na primeira demanda pós-merge com NOTA > 6: `grep -c '^- \[ \] \*\*AC-' docs/todo/<NNN>-*/task.md` precisa retornar **≤ 10**, e a matriz AC→teste da §8 daquela demanda precisa cobrir **100%** dos AC. Baseline de referência: 16 (001) e 18 (002), média 17 — n = 2, assumido como referência declarada e não como estatística (Premissa #4).

## 4. Out of scope
- `/feature-flow` e `/bug-flow` — decisão do lead em 2026-09-17: a pré-triagem entra só em `commands/flow.md`.

## 5. Implementation guide _(PLAN — Architect)_

**Componentes tocados:** `commands/flow.md` (único arquivo de produção) + `manifest.json` (derivado por script).
**Contratos novos:** nenhum contrato de código. Um contrato **textual** novo: o campo de pré-triagem na §0 do `task.md`, que a Phase 1 passa a ler. Nenhum subcomando, nenhuma sintaxe nova, nenhum artefato novo.
**Data flow:** prompt inicial da demanda → Phase 0.5 aplica a RUBRICA → NOTA + 4 justificativas gravadas na §0 do `task.md` → Phase 1 lê a NOTA nos seus `**Inputs:**` e ramifica (teto de AC) → Phase 2 ramifica só se NOTA > 6 **e** SUP-EXEC (bloco de performance). O `task.md` é o único carregador de estado entre as fases — é o que já acontece hoje com a GOAL metric.

### 5.1 Onde a seção entra, e como se chama

**Heading: `### Phase 0.5 — TRIAGE (Prompt clarity)`.** Em inglês, como todo heading do ARQUIVO (`guidelines.md` §Idioma).

A numeração fracionária **não** quebra a existente — ela segue um precedente que o próprio arquivo já estabeleceu: `### Phase 2.5 — Threat modeling (Security, conditional)` (linha 191) existe exatamente para encaixar uma etapa entre duas fases numeradas **sem renumerar nenhuma**. `0.5` é a mesma solução para o mesmo problema, um slot acima.

Renumerar (pré-triagem = Phase 1, DEFINE = 2, PLAN = 3…) foi **descartado**: obrigaria a reescrever 8 headings, toda referência cruzada do arquivo (`Phase 2.5`, `Phase 3 diff`, `Phase 1 + 2 (+ 2.5) outputs`, a legenda do Output final) e o próprio `docs/USAGE.md` — um diff de dezenas de linhas removidas, que reprova o AC-05 (diff aditivo) e estoura o AC-07 (lista de arquivos).

**Uma divergência a declarar no texto:** a Phase 2.5 é *condicional*; a 0.5 roda **sempre**. A seção abre dizendo isso em cláusula própria (`Runs: always … Unlike Phase 2.5, never skipped`), senão a analogia de numeração contrabandeia a semântica errada.

**Os 4 pontos de toque — e só eles:**

| # | Onde | Linhas da BASE | Mudança |
|---|---|---|---|
| 1 | Entre a linha **166** (fim do bloco `> The GOAL phase is what separates…`) e a **167** (`### Phase 1 — DEFINE`) | inserção pura, 0 linhas removidas | A SEÇÃO inteira (~25 linhas) |
| 2 | Linha **170**, `**Inputs:**` da Phase 1 | 1 linha modificada, aditiva | `…the Phase 0 brief, **the Phase 0.5 score recorded in §0**, `business.md`.` |
| 3 | Após a linha **289** (`**Recommendation:** Go`), dentro do TEMPLATE, §0 | inserção pura, ~5 linhas | Campo de pré-triagem em **PT-BR** |
| 4 | Linha **410**, legenda do Output final | 1 linha modificada, aditiva | Token `TRIAGE <n>` entre `GOAL ✅` e `DEFINE ✅` |

> **Ponto de toque #4 não foi aplicado (decisão do BUILD, mantida pela Phase 4).** O motivo não é orçamento — é o AC-04: editar a linha 410 cria uma linha removida que contém a string `VERIFY`, e o predicado literal do AC-04 (`grep -ci 'automated test\|VERIFY\|traceability'` sobre as linhas removidas, hoje encodado como asserção em `test/flow-pretriagem.test.js`) passa a devolver 1. Trocar uma conveniência visual por uma emenda num AC de não-regressão de segurança não fecha. **Não reabra sem emendar o AC-04 para escopar o `grep` ao bloco da Phase 4.**

**O que explicitamente NÃO muda** — é isto que o VERIFY encoda como asserção:

- Linhas **1–166**: header, Mission, Pre-flight (incl. 3b/3c de custo), toda a seção Peer sessions e o bloco `### Phase 0 — GOAL` inteiro. Zero edições.
- `### Phase 2 — PLAN` (175–189): **zero edições.** O efeito de performance mora na SEÇÃO, não aqui (ver 5.7, trade-off T-C).
- `### Phase 2.5` (191–197), `### Phase 3 — BUILD` (199–214), `### Phase 4 — VERIFY` (216–227), `### Phase 5` (229–233), `### Phase 6` (235–244), `### Cost accounting` (246–274): **zero edições.** A linha de exit gate da Phase 4 (`every AC has at least one automated test that fails without the change`, linha 227) sai do diff byte a byte idêntica — é o AC-04.
- `## Rules` (383–393) e `## Output (after each phase)` (395–404): zero edições. O bloco por fase já usa `<PHASE>` como placeholder, então `TRIAGE` cabe sem editar nada.
- Nenhuma linha de `**Produces:**` ou `**Exit gate:**` de qualquer fase é tocada.

### 5.2 A RUBRICA

Quatro eixos, 1–10 cada. O texto normativo (inglês, vai literal para o ARQUIVO) — **na versão publicada em `commands/flow.md` as âncoras das faixas 4–6 e 7–8 estão colapsadas na coluna `between`** (corte #1 da §5.4, aplicado no BUILD por orçamento), então a tabela final tem três colunas: `1–3` · `between` · `9–10`:

> **Consequência a registrar para quem mexer nisto depois:** com o colapso, a fronteira do veto (**eixo ≤ 4**) deixou de ter âncora própria — ela cai no meio da coluna `between`, que cobre 4 a 8. A resolução passou a morar só na nota numérica do eixo, não na âncora que a sustenta, e é exatamente aí que a rodada de estresse (abaixo) mostra a pressão de auto-serviço agindo: um 4 e um 6 são a diferença entre vetar e não vetar, e a tabela publicada não os distingue. Se a rubrica for recalibrada com n maior, **devolver âncora própria à faixa 4–6 é a primeira coisa a fazer**.

```markdown
**Scores the prompt, not the problem.** Never score how many files change, how long it
takes, whether it touches auth or secrets, or how risky it is. A large, critical demand
asked for maturely scores 10; a typo fix asked for vaguely scores 3.

Score each axis 1–10, reading the prompt **as it arrived** — before any clarification
you went on to ask.

| Axis | 1–3 | 4–6 | 7–8 | 9–10 |
|---|---|---|---|---|
| **A1 Deliverable** — does it say what will exist at the end? | a problem or a wish | a capability; the file set is open | the artifact type and its directory | the exact path(s) |
| **A2 Mechanism** — is the named mechanism checkable against this repo today? | none, or contradicted by the repo | named, ≥1 primitive unverified — needs a spike | named, primitives exist, one parameter open | named, every primitive already exists |
| **A3 Done** — can you write the exit condition without asking the requester? | adjectives only ("better", "faster") | depends on a fact nobody has yet | derivable from the repo's existing gates | stated, or fully fixed by those gates |
| **A4 Stability** — does it commit to one path? | it asks you to choose the direction | ≥2 paths open, and the choice changes the file set | one path, a secondary preference, same file set | one path |

**Cite or cap.** Each axis justification names one concrete artifact — a path, a
`path:line`, or the explicit absence of one. An axis with no citation scores **at most 5**.
The score is self-assigned by whoever pays the token bill, so it has to be falsifiable
in the PR.

**SCORE** = `floor(mean(A1..A4))`, then **veto: any axis ≤ 4 caps SCORE at 6.**
```

**Por que estes eixos e não outros.** Cada um mede uma propriedade do **texto do pedido**, avaliável no instante em que ele chega, contra o repo como ele está. Nenhum lê tamanho, complexidade ou criticidade:

- **A1** é granularidade de nomeação, não volume. "Migrar os 21 `agents/*.md` para frontmatter v2" nomeia o conjunto exato e pontua 9; "melhorar o flow" pontua 2. O maior dos dois é o que pontua alto.
- **A2** pergunta se o mecanismo **que o pedido nomeou** é conferível hoje — não se é difícil de construir. Um design distribuído complexo, cujas primitivas todas existem, pontua 9.
- **A3** é derivabilidade do critério de saída, não rigor dele.
- **A4** é compromisso com um caminho, não risco do caminho.

**Anti-eixo, escrito na seção:** a cláusula `Scores the prompt, not the problem` é o guarda-corpo. Sem ela, A2 é a porta por onde complexidade entra disfarçada — e é o eixo que mais precisa dela.

**Reprodutibilidade.** As âncoras são predicados quase-binários ("o file set está aberto ou fechado?", "a primitiva existe no repo ou não?"), não adjetivos. A trava real é o **Cite or cap**: um eixo só vale acima de 5 se a justificativa apontar um arquivo, uma linha ou a ausência verificável de um. Isso converte cada eixo de opinião em afirmação falsificável no PR — a única mitigação disponível para a Premissa #2 (nota auto-servida), como o discovery já registrou.

**Agregação: média, truncada para baixo, com veto.** `SCORE = floor(mean(A1..A4))`, e **qualquer eixo ≤ 4 trava a NOTA em ≤ 6**.

A pergunta que a escolha de agregação decide — *um prompt com um eixo péssimo e três ótimos passa?* — é respondida com **não**, e de propósito:

| Agregação | 001 na leitura auto-servida (7/6/7/7 = 6,75) | Veredito |
|---|---|---|
| Média + `round()` | **7 → passa do corte** | Reprovada: um arredondamento entrega o caminho flexibilizado à demanda mais ambígua do histórico |
| Mínimo | 6 → reprova | Segura demais: um único eixo fraco mataria qualquer demanda, e quase nada cruzaria o corte — a feature morre por YAGNI ao contrário |
| Soma ponderada | — | Descartada: pesos são quatro botões a mais para calibrar sem dado (n=3) e degradam a reprodutibilidade |
| **Média + `floor` + veto** | 6 → reprova, **duas vezes** | **Escolhida** |

O `floor` dá a primeira trava (é preciso média ≥ 7,0 exatos, não 6,5 arredondado); o veto dá a segunda e é a que carrega a semântica: **um eixo irresolvido significa que o DEFINE tem trabalho real a fazer, e três eixos fortes não compram isso.** Um pedido que nomeia o arquivo, o critério de pronto e um caminho só, mas cujo mecanismo depende de uma primitiva que ninguém conferiu, **é** uma demanda que precisa de spec completa — é literalmente a 001. A média preserva resolução (distingue 7 de 9, o que importa para recalibrar o corte depois com n maior); o veto decide.

### 5.3 BACKTEST — Experimento 1 do discovery

**Método.** Os prompts são reconstruídos do brief de discovery e das §0–§1 do `task.md` de cada demanda, e pontuados **ex-ante**: lendo o pedido como ele chegou, contra o repo daquela data, **sem** usar nada que só se soube depois. O que aconteceu durante o flow (reversão de decisão, spike, pergunta de desambiguação) **não é insumo de eixo** — é o teste de validade da nota. Rubrica que se alimenta do retrovisor não prevê nada; ela apenas descreve.

**Prompt reconstruído — 001** _(fontes: `docs/discovery/ahc-pat-auth.md` §Problem Statement + `docs/todo/001-ahc-pat-auth/task.md` §0 "Escopo confirmado com o lead (2026-09-14)")_:

> "Devs da EMS-NCTECH sem credencial git não conseguem instalar nem atualizar o hub — o `install.sh` falha no clone do repo internal. Quero que o `ahc` passe a autenticar por um **PAT de conta de serviço**, com o token fixo no código, e que a instalação vire um one-liner publicado na wiki interna. O repo não pode virar público."

**Prompt reconstruído — 002** _(fontes: `docs/discovery/flutter-dart-engineer.md` §5 Whys #4 "pedido explícito do lead do hub em 2026-09-16" + premissa D2 + `docs/todo/002-flutter-dart-engineer/task.md` §0–§1)_:

> "Quero um agent especialista em Dart/Flutter no hub, no mesmo formato dos agents de stack que já existem (Go, .NET, Node/TS, Python, React). Escopo: linguagem Dart + framework Flutter num agent só."

#### Rodada 1 — notas por eixo

| Demanda | A1 Deliverable | A2 Mechanism | A3 Done | A4 Stability | Média | **NOTA** (`floor` + veto) | Corte (> 6) |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **001** ahc-pat-auth | 5 | **3** | 4 | 4 | 4,00 | **4** _(veto A2, A3, A4)_ | **abaixo** ✅ |
| **002** flutter-dart-engineer | 9 | 9 | 8 | 8 | 8,50 | **8** | **acima** ✅ |

**Justificativa por eixo — 001** (cada uma cita um artefato, como a própria regra exige):

- **A1 = 5.** Nomeia uma *capacidade* ("o `ahc` autentica por PAT"), não um conjunto de arquivos. Cita `install.sh` e o one-liner, mas o diff real acabou em `bin/ahc`, `install.sh`, `scripts/make-mirror.js`, `test/` e docs. No instante da leitura o file set está aberto → coluna `between`.
- **A2 = 3.** O mecanismo nomeado é "PAT de **conta de serviço**". Conta de serviço **não existe** no GitHub para esta org — `docs/todo/001-ahc-pat-auth/task.md` §0 registra "Sem conta de serviço (não existe no GitHub)". E o desenho então vigente no repo (`docs/ROADMAP.md` §1, token na URL) é **contradito** pelo que o git faz com `.git/config`, e foi descartado no PLAN. Mecanismo nomeado e contradito pelo repo → coluna `1–3`. **Veto.**
- **A3 = 4.** A forma do pronto é derivável ("install + sync numa máquina sem credencial"), mas o baseline precisou ser **reproduzido** (repro de 2026-09-14, HOME limpo) e o pronto dependia de fatos que ninguém tinha: a cota da contents API (`docs/discovery/ahc-pat-auth.md` §E1c) e o ruleset da org `No new secrets violations`, descoberto **em 2026-09-16, depois do flow aberto**, e que bloqueia o merge (`task.md` §0). → coluna `between`. **Veto.**
- **A4 = 4.** Dois caminhos vivos no pedido: origem no canônico × espelho pessoal com publicação automática. Não é detalhe — muda o file set e a postura de segurança. Ex-post o caminho do espelho foi adotado em 09-14 e **revertido em 09-15** (`task.md` §0, "o re-escopo … foi revertido"); ex-ante o pedido simplesmente não escolheu. → coluna `between`. **Veto.**

**Justificativa por eixo — 002:**

- **A1 = 9.** O deliverable é um arquivo em `agents/`, no molde de 5 agents de stack que já existem. O nome exato (`flutter-dart-engineer`) foi fixado no mesmo dia (`docs/discovery/flutter-dart-engineer.md`, premissa D2) — parâmetro de nomenclatura, não de escopo. → coluna `9–10`.
- **A2 = 9.** O mecanismo é "mais um `agents/*.md`". Toda primitiva já existe e é conferível sem spike: `team: frontend` está em `VALID_TEAMS` (`scripts/validate-artifacts.js:33-45`, premissa F2 confiança 5) e o `regen-manifest` absorve o artefato sem mudança de código; 5 agents de 89–326 linhas provam o formato (F1 confiança 5). → coluna `9–10`.
- **A3 = 8.** O pronto sai inteiro dos gates que o repo já tem: `validate-artifacts --strict` 0/0, `regen-manifest --check` exit 0, `node --test` verde. Não é 9–10 porque a decomposição nos 6 tipos de tarefa foi produzida pelo discovery, não pelo pedido. A pergunta aberta (quantos devs Flutter, risco D1) é sobre *valor*, não sobre *pronto* — o brief diz literalmente "E1 **não bloqueia** o build". → coluna `between`.
- **A4 = 8.** Um caminho só. O único "ou" (Dart isolado × Dart+Flutter num agent) foi resolvido no mesmo dia e, decidido de qualquer jeito, **não muda o file set**: continua um `.md` em `agents/`. → coluna `between`.

#### Rodada de estresse — a leitura auto-servida da 001

Uma rodada só prova pouco quando o avaliador é quem se beneficia. Então a rubrica foi reaplicada à 001 **maximizando a nota dentro das âncoras**, como faria um orquestrador querendo o caminho barato:

| Leitura da 001 | A1 | A2 | A3 | A4 | Média | `floor` | Veto? | NOTA | Passa? |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Honesta (rodada 1) | 5 | 3 | 4 | 4 | 4,00 | 4 | sim | **4** | não |
| Auto-servida plausível | 7 | 6 | 7 | 6 | 6,50 | 6 | não | **6** | **não** |
| Auto-servida agressiva | 7 | 6 | 7 | 7 | 6,75 | 6 | não | **6** | **não** |
| Auto-servida agressiva, com `round()` em vez de `floor` | 7 | 6 | 7 | 7 | 6,75 | **7** | não | **7** | **PASSARIA** ❌ |

A última linha é o motivo de o `floor` estar na regra e não ser detalhe de estilo. Para a 001 cruzar o corte com `floor`, o avaliador precisa de **média ≥ 7,0**, o que exige afirmar que a conta de serviço existia (A2 ≥ 7) — afirmação que a regra **Cite or cap** obriga a acompanhar de uma citação, e que nenhuma citação sustenta.

#### Corroboração — dry-run da própria 003

Aplicada ao prompt que abriu esta demanda: **A1 = 6** (dizia "no `/flow`"; a exclusão de `/feature-flow` e `/bug-flow` precisou de decisão do lead, §4), **A2 = 4** (o mecanismo era "pontuar de 1 a 10" — eixos, agregação e corte não existiam e tiveram de ser inventados), **A3 = 4** ("menos AC" é adjetivo; o teto `≤ 10` só nasceu no DEFINE), **A4 = 5** ("mais foco em performance" deixou aberto se valia para toda nota > 6 ou só para superfície executável — o discovery teve de partir em dois gatilhos). Média 4,75 → `floor` 4, veto por A2/A3 → **NOTA 4 ≤ 6**. Bate com o que a §1 já afirmou de forma independente (4 perguntas de desambiguação antes de abrir o flow).

#### Veredito do backtest

**APROVADO na rodada 1.** 002 = **8** > 001 = **4**; a 001 fica **≤ 6** como o discovery exigiu; e a 002 cai acima do corte, populando a métrica. A ordenação bate com a dificuldade observada (001: spike obrigatório, decisão revertida no meio, `APPROVE WITH MITIGATIONS`; 002: um markdown, zero reversões). Terceiro ponto (003 = 4) reforça. **Não houve rodada 2 porque a rodada 1 não reprovou** — o que substitui a reescrita é a rodada de estresse acima, que ataca a rubrica pelo vetor real (auto-serviço) em vez de simular uma falha.

**Limite declarado:** n = 3, todos pontuados pelo mesmo avaliador, nesta sessão. O backtest mostra que a rubrica **ordena** e que o corte **separa**; não mostra estabilidade entre sessões (Premissa #1, confiança 2). O Experimento 3 do discovery — a próxima demanda real — é quem testa isso, e o campo gravado no `task.md` é o que o torna auditável.

### 5.4 NFR — o trade-off central

**NFR impact (latency / throughput / availability / cost):** não há latência, throughput nem disponibilidade — `commands/flow.md` não é código executável. O único NFR real é **custo de contexto**: o arquivo é um prompt carregado **inteiro em toda invocação do `/flow`**, hoje 420 linhas / **28.675 bytes ≈ 7.169 tokens**. A SEÇÃO é custo fixo pago em toda execução, inclusive nas demandas com NOTA ≤ 6 que, por decisão do lead, não recebem benefício nenhum.

**Quanto a seção adiciona** (medido sobre o rascunho normativo da 5.2, não estimado):

| Ponto de toque | Linhas | Bytes |
|---|--:|--:|
| SEÇÃO `### Phase 0.5 — TRIAGE` | 25 | 2.775 |
| Campo de pré-triagem no TEMPLATE (§0, PT-BR) | 5 | ~300 |
| `**Inputs:**` da Phase 1 (1 linha modificada) | 0 | ~25 |
| Legenda do Output final (1 linha modificada) | 0 | ~14 |
| **Total** | **30** | **~3.114** |

**3.114 / 28.675 = +10,9%** → arquivo vai a ~31.789 bytes ≈ **7.947 tokens** (+778).

**A partir de que proporção a mudança custa mais do que economiza.** O que a seção economiza, medido nos `task.md` do repo: a §3 da 001 tem 16 AC em 18.670 bytes (**1.167 B/AC**) e a da 003 tem 10 AC em 9.879 bytes (**988 B/AC**) — média **~1.050 bytes ≈ 260 tokens por AC escrito**. Cortar 17 → 10 são 7 AC ≈ 7.350 bytes: **~1.840 tokens de output** no DEFINE, mais o mesmo texto relido como input nos briefs de PLAN, BUILD, VERIFY e REVIEW (o `task.md` é o carregador de estado entre fases; ≥ 4 releituras) ≈ **7.360 tokens de input**. Total conservador: **~9.200 tokens por demanda acima do corte** — e isso **ignora** o termo dominante, os 7 testes que o VERIFY não precisa escrever, porque o gate `every AC has at least one automated test` cobra um por AC.

Com `p` = fração das demandas que pontuam > 6:

```
custo    = 778 tokens × toda execução
benefício = ~9.200 tokens × execuções com NOTA > 6
net ≥ 0  ⟺  p ≥ 778 / 9.200 = 8,5%
```

**A mudança passa a custar mais do que economiza se menos de ~8,5% das demandas pontuarem acima do corte** — cerca de 1 em 12. O histórico disponível dá p = 1/3 (002 = 8; 001 = 4; 003 = 4), ~4× o break-even. Invertendo: com p = 33%, a seção só ficaria net-negativa acima de **~3.000 tokens ≈ 12.000 bytes**, quase 4× o desenho proposto. **Há folga real, e é por isso que o orçamento abaixo pode ser apertado sem drama.**

**O custo fixo ameaça a métrica GOAL? Não — e é importante dizer por quê, porque a resposta fácil está errada.** A métrica é uma **contagem de AC** (`nº de AC na §3 do task.md`), não um orçamento de tokens. Nenhuma quantidade de bytes em `commands/flow.md` muda quantos AC o DEFINE escreve; os dois números não se tocam. Se o custo de contexto fosse a métrica, o desenho estaria em conflito — não é.

**O que ameaça a métrica é outra coisa, e é real:** a SEÇÃO compete por **atenção** com 420 linhas de prompt já existentes. O modo de falha não é "o arquivo ficou grande", é "a instrução do teto `≤ 10` ficou enterrada em 60 linhas de rubrica hedged e o orquestrador não a aplica". Isso reprova o AC-03 na prática enquanto passa no `grep`. Por isso o controle não é um alvo de bytes por si só — é **o alvo de bytes como proxy de concisão**, com prioridade de corte declarada.

**Orçamento de tamanho (fixado por este PLAN, é gate do BUILD):**

> **≤ 32 linhas acrescentadas e ≤ 3.200 bytes**, somando os 4 pontos de toque. `wc -lc commands/flow.md` após a mudança deve ficar em **≤ 452 linhas / ≤ 31.875 bytes** (+10,9% sobre a BASE). Estourou → volta ao PLAN, não se negocia no BUILD.

> **EMENDA DO TETO — orquestrador, 2026-09-17, no gate da Phase 4.** O teto acima passa a ser **≤ 470 linhas / ≤ 33.000 bytes**.
>
> **Por quê:** o número original foi dimensionado no PLAN, **antes** do gate de segurança existir. A Phase 4 voltou com `APPROVE WITH MITIGATIONS` e três cláusulas normativas obrigatórias (M1, M2, M3 — §7), mais a correção do achado V-1. Não cabiam nos 3.200 bytes, e nenhuma delas é cortável: M2 e M3 são o que impede uma demanda sensível bem redigida de perder cobertura de caso de abuso, que é o modo de falha mais caro desta mudança.
>
> **Quem ampliou:** o orquestrador, acima do BUILD. A cláusula "não se negocia no BUILD" continua valendo e não foi violada — ela proíbe o implementador afrouxar o próprio limite, não o gate reescopar o limite quando um gate posterior muda os requisitos.
>
> **O break-even da 5.4 — enunciado corrigido no REVIEW (2026-09-17).** A aritmética fecha (+3.840 B ≈ 960 tokens; 960/9.200 = 10,4% ≈ os "~11%" declarados), mas **o modelo omite dois termos e superestima a confiança**, como o `system-architect` cobrou no review:
>
> 1. **O bloco de performance nunca é subtraído.** Quando NOTA > 6 **e** SUP-EXEC, a mudança *obriga* o PLAN a produzir orçamento ou medição com número — output novo e chamadas de ferramenta novas, incidindo **só** sobre as demandas acima do corte, exatamente as que recebem os 9.200 tokens de benefício. É custo dentro do numerador, contabilizado como zero.
> 2. **Assimetria de multiplicador.** O benefício aplica ×5 (1 escrita + ≥4 releituras do `task.md`); o custo aplica ×1 e conta só bytes de prompt. Mas a Phase 0.5 também **escreve** ~350 B na §0, que atravessam as mesmas releituras em **toda** demanda, e **executá-la** custa raciocínio mais as leituras que o `Cite or cap` exige (provar ausência é grep, e o resultado entra no contexto).
> 3. **`p` é observação, não medida.** `p = 1/3` vem de n=3, mesmo avaliador, mesma sessão, e duas das três estão abaixo do corte — o numerador é **um** ponto. O intervalo de confiança engole o break-even de 11% com folga.
>
> **Conclusão honesta: o net é indeterminado a n=3.** A decisão de aprovar **não** se apoia em margem — se apoia em **reversibilidade**: é um arquivo, `git revert` desfaz, e o Experimento 3 (a primeira demanda real pós-merge) entrega o dado que falta em uma iteração. A alegação anterior de "~3× de folga" era mais confiança do que os dados sustentam, e foi retirada.
>
> **Gatilho de reversão, definido agora enquanto é barato:** duas demandas acima do corte que não fecharem ≤ 10 AC, **ou** três demandas seguidas abaixo do corte, disparam revisão do corte ou revert.
>
> **Estado real:** 449 linhas / 32.515 bytes — dentro do teto emendado, 485 bytes de folga.
>
> **Dívida honesta:** esta emenda só foi escrita aqui depois que o SDET a reportou como estouro (V-5), lendo um documento que eu não tinha atualizado. O número vigia desde o loop-back; o registro atrasou. A partir desta demanda o teto é **gate executável** (`test/flow-pretriagem.test.js`, caso T9/§5.4), justamente para não depender de prosa.

**Ordem de corte se não couber** (corta-se do fim para o começo, nunca do começo):
1. As âncoras das faixas **4–6** e **7–8** colapsam em uma coluna "between" (economia ~700 B);
2. A cláusula `Cite or cap` encolhe para uma oração dentro da linha do SCORE;
3. O ponto de toque #4 (legenda) cai — é conveniência, não regra.

**Nunca se corta**, porque cada um é a prova de um AC: os 4 nomes de eixo e a escala (AC-01), a regra de agregação + veto + o corte escrito `> 6` (AC-01), o teto `≤ 10` **como número** (AC-03), a cláusula "fewer AC, never looser AC" (AC-04), a linha de que NOTA ≤ 6 roda como hoje (AC-05), as 5 entradas literais de SUP-EXEC (AC-06), a cláusula anti-eixo (AC-01).

### 5.5 Versionamento do manifest — AC-09 precisa de emenda

`ahc` não faz range de semver: a comparação de pin é igualdade exata de string (`bin/ahc:644`, `pin !== item.version`) e o sync decide por sha256. Então patch × minor **não tem consequência mecânica** — é sinal, lido por quem roda `ahc list` e `ahc status`. O que torna a escolha uma questão de honestidade do registro, não de compatibilidade.

**O que o repo fez antes, neste mesmo arquivo:**

| Commit | Mudança em `commands/flow.md` | Versão |
|---|---|---|
| `3a02cf6` + `6f0e042` | `feat(flow)`: seção nova "Peer sessions", +56 linhas — capacidade nova | 1.0.0 → **1.1.0** (minor) |
| `6f9a1fa` | `fix(flow)`: ancorar consulta num ref — correção dentro de seção existente | 1.1.0 → 1.1.1 (patch) |
| `c96b610` | `feat(flow)`: "Peer handshake", subseção nova + tabela nova no TEMPLATE §9 — capacidade nova | 1.1.1 → **1.2.0** (minor) |
| `729ce6c` | `fix(flow)`: corrigir explicação — correção | 1.2.0 → 1.2.1 (patch) |
| `bf03b10` | `feat(hub)`: seção "Cost accounting" + TEMPLATE §11 + pre-flight 3c | 1.2.1 → **1.2.5** (4× patch) |

**Decisão: `--bump=minor` (`1.2.5` → `1.3.0`). O AC-09 está errado neste ponto e precisa ser emendado.**

O sinal deliberado do repo é inequívoco e apareceu **duas vezes neste arquivo**: `feat(flow)` que acrescenta uma seção de capacidade → **minor**; `fix(flow)` que corrige texto existente → **patch**. Esta demanda é exatamente o primeiro formato — fase nomeada nova, campo novo no TEMPLATE, comportamento novo do orquestrador, `feat(flow)` no commit.

O contraexemplo `bf03b10` **não é uma decisão de versionamento, é churn**: 1.2.1 → 1.2.5 são **quatro** bumps consecutivos num commit só, ou seja, `regen-manifest.js` rodou quatro vezes com o default durante o trabalho (o commit também criou `/veredito` e a skill `session-cost`). Ninguém escolheu "patch" ali; a entrada derivou. Tratar isso como precedente é tomar um efeito colateral de ferramenta por política.

**Emenda a reportar ao PO** (não aplicada por este PLAN, conforme instrução):

> **AC-09, segundo bullet.** Onde se lê `…e `version` com **minor bump** (`1.2.5` → `1.3.0`, via `--bump=minor`) _(emendado pelo orquestrador no gate do PLAN, 2026-09-17: a redação original fixava o default de `scripts/regen-manifest.js`; o histórico do próprio manifest mostra `feat(flow)` → minor (`3a02cf6`/`6f0e042`: 1.0.0→1.1.0; `c96b610`: 1.1.1→1.2.0) e `fix(flow)` → patch (`6f9a1fa`, `729ce6c`). O salto 1.2.1→1.2.5 em `bf03b10` é churn de regeneração, não decisão)_`, leia-se `…e `version` com **minor bump** (`1.2.5` → `1.3.0`), produzido por `node scripts/regen-manifest.js --bump=minor``.
>
> **Razão:** o default do script é `patch` (`scripts/regen-manifest.js:40`), mas o repo usou `--bump=minor` nas duas vezes em que `commands/flow.md` ganhou capacidade (`6f0e042`: 1.0.0→1.1.0; `c96b610`: 1.1.1→1.2.0), e `patch` nas duas vezes em que só corrigiu texto. O AC como está fixa o default da ferramenta em vez da convenção do repo. Sem a emenda, o BUILD tem de escolher entre passar no AC-09 e seguir a convenção que o `guidelines.md` manda seguir.

Se o PO recusar a emenda, o BUILD segue o AC (`1.2.6`) — o AC é o contrato — e a divergência com a convenção fica registrada aqui.

### 5.6 Atomic tasks (ordenadas por dependência)

- [ ] **T1** — Fechar o texto normativo em inglês da SEÇÃO (4 eixos + âncoras + `Cite or cap` + `floor`/veto + corte `> 6` + cláusula anti-eixo), dentro do orçamento da 5.4. Saída: bloco pronto para colar. _(AC: 01, 08)_
- [ ] **T2** — Inserir a SEÇÃO em `commands/flow.md` entre a linha 166 e a 167, como heading `### Phase 0.5 — TRIAGE (Prompt clarity)`, com a cláusula `Runs: always … Unlike Phase 2.5, never skipped`. Zero linhas removidas. _(AC: 01, 05, 07)_
- [ ] **T3** — Escrever na SEÇÃO a tabela de ramificação: `SCORE ≤ 6` → nada muda; `SCORE > 6` → teto **`≤ 10 AC`** como número, agrupamento e inspeção objetiva, com a cláusula "fewer AC, never looser AC — the Phase 4 gate is untouched". _(AC: 03, 04, 05)_
- [ ] **T4** — Escrever na mesma tabela a conjunção `SCORE > 6` **AND** SUP-EXEC, com as 5 entradas literais (`bin/ahc`, `scripts/`, `install.sh`, `mcp/`, `test/`), o que medir, e a exclusão explícita de demanda só `.md`. _(AC: 06)_
- [ ] **T5** — Acrescentar ao TEMPLATE, §0, após `**Recommendation:**`, o campo de pré-triagem em **PT-BR**: NOTA, acima/abaixo do corte, e **uma linha por eixo**. _(AC: 02, 08)_
- [ ] **T6** — Acrescentar `the Phase 0.5 score recorded in §0` aos `**Inputs:**` da Phase 1 — DEFINE (linha 170). Não tocar `**Produces:**` nem `**Exit gate:**`. _(AC: 02, 05)_
- [ ] **T7** — Acrescentar o token `TRIAGE <n>` à legenda do Output final (linha 410). **Primeiro item a cair se o orçamento estourar.** _(AC: 02)_
- [ ] **T8** — Gravar na §0 **deste** `task.md` a NOTA da própria 003 com justificativa por eixo (dry-run, Experimento 2; valores em 5.3: 6/4/4/5 → **4**). É o ponto de instrumentação da métrica. _(AC: 02)_
- [x] **T9** — Conferir o orçamento: `wc -lc commands/flow.md` ≤ 470 linhas / ≤ 33.000 bytes _(teto emendado no gate da Phase 4 — ver 5.4; era 452/31.875)_. Agora também asserido por teste. Estourou → aplicar a ordem de corte da 5.4; se ainda estourar, volta ao PLAN. _(AC: 01, 03 — NFR da 5.4)_
- [ ] **T10** — Conferir o diff aditivo: `git diff origin/main -- commands/flow.md | grep '^-' | grep -v '^---'` só pode conter as 2 linhas realocadas dos pontos #2 e #4, ambas reaparecendo no lado `+`; e a contagem do AC-04 sobre `automated test|VERIFY|traceability` tem de dar **0**. _(AC: 04, 05)_
- [ ] **T11** — `node scripts/regen-manifest.js --bump=minor` e depois `--check` exit 0; conferir `commands.flow` com `sha256` novo e `version` **1.3.0**. ⚠️ **Bloqueado pela emenda do AC-09 (5.5)** — sem a emenda, rodar o default (`1.2.6`). _(AC: 09)_
- [ ] **T12** — `node scripts/validate-artifacts.js --strict` com 0 errors / 0 warnings e `node --test test/*.test.js` verde, sem alterar validator nem teste existente. _(AC: 09)_
- [ ] **T13** — _(VERIFY, Phase 4)_ Criar `test/flow-pretriagem.test.js` encodando como asserção sobre `commands/flow.md` os predicados de AC-01…AC-08 — inclusive a ausência de remoção no bloco da Phase 4. É o primeiro teste do repo a cobrir `commands/`. _(AC: 01–08, e o exit gate da Phase 4)_

### 5.7 Trade-offs considerados

| # | Alternativa | A favor | Contra | Veredito |
|---|---|---|---|---|
| **T-A** | **Seção inline em `commands/flow.md`** | 1 arquivo, 1 commit para reverter; carrega junto com o prompt, sem modo de falha novo; cabe no escopo travado pelo lead e no AC-07 | Custo fixo em toda execução, inclusive nas ≤ 6 | **Recomendada** |
| **T-B** | Pré-triagem como **skill separada** (`skills/pretriagem/`), invocada pelo `/flow` | Tira ~3.100 bytes do prompt sempre carregado; a rubrica evolui sem tocar o `/flow` | Cria artefato novo em `skills/` — **reprova o AC-07** e o escopo do lead; passa de 1 para 2 artefatos no `ahc sync` e no reverter; e troca um custo fixo **conhecido** por um modo de falha **novo** (skill não carrega → a pré-triagem simplesmente não roda, silenciosamente) | Descartada — e a 5.4 mostra que o custo fixo que ela resolveria está ~4× abaixo do break-even, então ela paga um risco novo para otimizar o que não dói |
| **T-C** | Efeito de performance escrito **dentro da Phase 2 — PLAN**, e não na SEÇÃO | Fica onde o leitor da fase está olhando | Duplica a condição em dois pontos que derivam com o tempo; e edita o bloco da Phase 2, aumentando a superfície do diff contra AC-05/AC-07 | Descartada — a SEÇÃO nomeia "DEFINE" e "PLAN" na tabela de ramificação, e o orquestrador lê o arquivo inteiro a cada execução; localidade vale menos que fonte única |
| **T-D** | **Rubrica implícita** — "julgue a clareza de 1 a 10, use bom senso" | Custo de bytes quase zero | Nota inauditável: mata a única mitigação da Premissa #2 (transparência), reprova o AC-01 (≥ 3 eixos) e é infalsificável por construção — não há o que aplicar à 001 e à 002, então o Experimento 1 nem roda | Descartada |
| **T-E** | **Corte em 7 ou 8** em vez de `> 6` | Mais conservador | É decisão travada do lead; e os 3 pontos disponíveis (8, 4, 4) estão a ≥ 2 do corte dos dois lados — mover para 7 não reclassifica nenhum caso conhecido, só encolhe a população da métrica sem evidência | Descartada (YAGNI) |
| **T-F** | **Renumerar as fases** (pré-triagem = Phase 1, DEFINE = 2…) | Numeração inteira, sem fracionário | Reescreve 8 headings e toda referência cruzada do arquivo + `docs/USAGE.md`; reprova o AC-05 (diff aditivo) e estoura o AC-07 | Descartada — `Phase 2.5` já é o precedente da casa para exatamente isto |
| **T-G** | Agregação por **média simples com arredondamento** | Mais intuitivo | A rodada de estresse (5.3) mostra a 001 **passando do corte** com `round()` | Descartada — é a diferença entre a rubrica funcionar e não funcionar |

**Recommended approach:** **T-A + `floor` com veto + orçamento duro de 3.200 bytes.** Uma seção só, inserida num slot fracionário que o arquivo já usa, dona de **todas** as ramificações (DEFINE e PLAN), com a nota gravada no `task.md` como único estado que atravessa as fases. Quatro pontos de toque, dois deles de uma linha, e nenhuma linha de gate existente removida. O que faz esse desenho ser defensável não é a rubrica — é o backtest que a reprovaria se ela não separasse a 001 da 002, e o orçamento que impede a seção de virar o próximo problema que o `/flow` terá de resolver.

### 5.8 ADR

**ADRs created:** **nenhum. Recomendação: não abrir ADR nesta demanda.**

O escopo travado pelo lead é um arquivo, e o AC-07 congela a lista do diff — `docs/adr/0002-*.md` não está nela. Um ADR novo não é um acréscimo neutro: quebra um AC que o DEFINE já fechou. Isso exige justificativa, e ela não se sustenta:

- O único ADR do repo (`docs/adr/0001-cascata-de-credenciais-do-ahc.md`) decide uma **fronteira de confiança** — origem de distribuição, credencial embutida, raio de alcance fora do repo. É o tipo de decisão que `architecture.md` §Decisions log existe para carregar.
- Esta decisão não toca componente, integração, data store, trust boundary nem NFR de runtime. É **regra de orquestração interna**, expressa em texto de prompt, revertida com um `git revert`. O lugar dela é `guidelines.md` ("conventions actually in use" / "lessons learned"), que é exatamente onde a §1 deste `task.md` já a roteou e onde a Phase 6 do `/flow` já a colocaria pelo memory side-effect.
- O material que justificaria um ADR — alternativas descartadas e consequências — **está** registrado: 5.7 (T-A…T-G) e 5.4. Duplicá-lo num ADR de um arquivo de escopo é cerimônia, que é literalmente o que esta demanda existe para cortar.

**Se o lead decidir o contrário**, o registro seria **ADR-0002 — Calibração do rigor de spec por pré-triagem de clareza do prompt no `/flow`**, e o **AC-07 precisaria ser emendado** para admitir `docs/adr/0002-*.md` na allowlist do diff. Esse é o preço de sobrepor, e ele deve ser pago explicitamente, não por omissão.

## 6. Sensitive surface _(PLAN → triggers Security)_
- [ ] Auth / AuthZ  · [ ] Secrets  · [ ] PII  · [ ] Payments
- [ ] File upload/download  · [ ] Deserialization  · [ ] Raw SQL / shell exec
- [ ] Multi-tenant isolation  · [ ] New external integration / trust boundary

**Nada se aplica — Phase 2.5 (Threat modeling) não roda.** O diff é texto de prompt em `commands/flow.md` mais o `manifest.json` derivado por script: nenhum código executável, nenhuma credencial, nenhum dado pessoal, nenhuma query, nenhum canal externo novo, nenhuma fronteira de confiança tocada. A SEÇÃO não lê arquivo do dev, não define subcomando e não muda quem pode ler o quê; as únicas invocações que ela nomeia são locais e não-mutantes (ver M1 na §7) _(frase corrigida no REVIEW: a redação original dizia "não invoca ferramenta", o que deixou de ser literalmente verdade quando M1 acrescentou a cláusula de medição)_ — o canal de distribuição (`ahc sync` sobre o canônico da org, `architecture.md` §Topology) segue byte a byte o mesmo. O `security-specialist` continua rodando o gate rápido da Phase 4, como em toda demanda; o que não se justifica aqui é o threat model dedicado da Phase 2.5.

## 7. Security _(gate da Phase 4 — a §6 não tem caixa marcada, então a Phase 2.5 não rodou)_

**Veredito: APPROVE WITH MITIGATIONS** — `security-specialist`, 2026-09-17.

| Severidade | Abertos | Notas |
|---|--:|---|
| Critical | 0 | |
| High | 0 | |
| Medium | 0 | |
| Low | 3 | M1–M3, todos texto em `commands/flow.md` — **aplicados no loop-back do BUILD** |

**Secret scan:** limpo nos 4 arquivos da mudança (incluindo os untracked). Zero ocorrências de `github_pat_`, `gh[pousr]_`, `AKIA`/`ASIA`, `xox[baprs]-`, `sk-`/`sk_live_`, `AIza`, `SG.`, chave privada PEM, JWT, `Bearer`, connection string com credencial, ou atribuição `password|secret|token|api_key`. Sweep de entropia (≥32 chars sem espaço) só devolveu caminhos de repo. **Zero ocorrências do marcador `AHC-EMBEDDED-TOKEN`** no diff — os dois legítimos seguem só em `install.sh:16` e `bin/ahc:46`, intocados (regra do `guidelines.md` §Anti-patterns respeitada). Integridade do manifest conferida por `shasum`, não assumida.

**Threat model:** não requerido — nenhuma fronteira de confiança cruzada. Concordância com a §6 quanto à Phase 2.5, **com uma ressalva**: a §6 afirmou "não invoca ferramenta" sem considerar que a cláusula de medição de performance nomeava `install.sh` entre os alvos (ver M1).

**A constatação que sustenta o APPROVE**, verificada no diff e não aceita de palavra: **a nota da Phase 0.5 é ortogonal aos gates de segurança.** Os dois hunks de `commands/flow.md` (`@@ -164,10 +164,34 @@` e `@@ -287,6 +311,11 @@`) não encostam na Phase 2.5 (linha 215) nem na Phase 4 (linha 240). A Phase 2.5 continua disparando pelas caixas da §6 marcadas no PLAN, **independente da nota**; o `security-specialist` da Phase 4 continua rodando `Then, always`; e o exit gate segue exigindo teste automatizado por AC. Nenhum caminho faz uma demanda sensível perder gate por ter sido bem escrita.

### Mitigações aplicadas (loop-back do BUILD, 2026-09-17)

- [x] **M1 — Medição não roda instalador.** A cláusula de performance passou a exigir invocação **não-mutante** (`bin/ahc --version`, `node --test`) e proíbe explicitamente rodar `install.sh` contra o `~/.claude` real do dev; "budget" é substituto sempre aceitável. _Risco fechado: o `flow.md` não tinha instrução de medição antes deste diff — a brecha era nossa, criada aqui._
- [x] **M2 — AC de segurança fora do agrupamento.** A célula `SCORE > 6` passou a dizer que AC derivado de controle exigido pela Phase 2.5 e AC de caso negativo/abuso **não são agrupáveis e não contam contra o teto de 10**. _Antes isso era verdade só por acidente de numeração (controles caem na §7, o teto fala da §3) — e quem agrupa sob pressão lê o texto novo, não a numeração._
- [x] **M3 — Brecha inspeção × teste fechada.** AC verificado por inspeção **continua preso ao exit gate da Phase 4**: inspeção substitui a prosa Gherkin, nunca o teste por trás dela. _A correção mora inteira na Phase 0.5; a Phase 4 segue byte a byte idêntica (AC-04)._

### Follow-up (não bloqueia o SHIP)

- O sweep de segredo do `scripts/make-mirror.js --check` (`github_pat_[A-Za-z0-9_]{20,}` fora dos marcadores, sobre todos os blobs) roda só na construção do espelho, **não na CI de PR** (`test.yml` roda a suíte; `regen-manifest.yml` roda o `--check` do manifest). Um `github_pat_` colado em `docs/` só é barrado no push do espelho. A exposição dentro do canônico não muda com esta demanda — é dívida preexistente, registrada aqui porque foi encontrada aqui.

### Para o `project-memory-keeper` no SHIP

- `architecture.md` — M1/M2/M3 como mitigações aceitas em 2026-09-17, e a constatação de ortogonalidade entre a nota da Phase 0.5 e os gates de segurança.
- `guidelines.md` — **anti-padrão: instrução de medição de performance que nomeia um instalador entre os alvos.** Idioma correto: medir por invocação não-mutante, ou sob `HOME` descartável como `test/helpers.js` faz, ou declarar budget.
- `guidelines.md` — **anti-padrão (a lição mais cara desta demanda): encodar o diff de um PR como teste permanente.** Os AC-04/05/07 foram escritos como predicados sobre `git diff` contra `origin/main`, uma ref viva. Três consequências, todas pegas só no REVIEW: (a) o teste ficaria vermelho **no instante do merge**, porque `origin/main` passa a conter a mudança e o diff contra si mesmo é vazio; (b) a CI (`actions/checkout@v4` sem `fetch-depth`) não materializa `refs/remotes/origin/main`, então três casos quebrariam já no PR, por erro de git e não por achado; (c) a allowlist de arquivos da demanda virou restrição permanente — reproduzido contra a branch `feat/002-flutter-dart-engineer` em voo, que quebrava a suíte ao mergear depois. **Regra:** invariante de artefato é propriedade do **conteúdo** e vai para o `*.test.js`; escopo de demanda é evidência de PR e vai para a §8 do `task.md` como comando de uma vez só.
- `guidelines.md` — **convenção de fase fracionária, com limite.** Fase fracionária (`X.5`) é para etapa intersticial que não renumera a cadeia. Quem acrescenta uma fica obrigado a atualizar **toda** a enumeração canônica: a linha de abertura de `commands/flow.md`, o cheat sheet de `docs/FLOWS.md`, e `docs/flows/render.py` (que gera o PNG, o `guia.html` e o PDF distribuídos). **A terceira fracionária dispara reavaliação da numeração inteira** — e o ADR devido nesse momento é sobre a convenção, não sobre a etapa que a disparou.
- `guidelines.md` — o campo de pré-triagem na §0 do `task.md` é **protocolo entre fases**, não prosa: escrito pela Phase 0.5, lido pelos `Inputs:` da Phase 1, e decide ramificação na 1 e na 2. Não tem schema nem validador (`validate-artifacts.js` não olha `docs/todo/`), e **já divergiu com n=1** — o TEMPLATE prescreve `- A1 Deliverable <n>:` e esta demanda gravou `- **A1 Deliverable 6:**`. O literal do TEMPLATE é a fonte; quem gravar diferente quebra o `grep` da métrica.

### Follow-ups registrados no REVIEW (não bloqueiam o SHIP)

- **Material de treinamento com a cadeia hard-coded — 4 pontos, confirmados por `grep`.** A frase "sete fases, sete gates" fica **factualmente errada** assim que este PR mergeia: passam a ser **nove gates** (as duas fracionárias têm gate próprio) numa cadeia de sete fases numeradas.
  - `docs/flows/render.py:128` — `"Sete fases, sete gates. A métrica GOAL da fase 0 é o fio…"` (gera `01-flow-pipeline.png`)
  - `docs/flows/render_print.py:86` — `head(c, "/flow — GOAL → SHIP", "Sete fases, sete gates. …")` (gera `print/p01-flow.png`)
  - `docs/flows/guia.html:158` — `"os sete gates, um a um, com o critério exato de aprovação"`
  - `docs/flows/guia.html:198` — `alt="As sete fases do /flow com o critério de cada gate"`

  Esses quatro alimentam o PNG, o `guia.html` e o `guia-flow-bug-flow.pdf` distribuídos aos devs. **Fora do escopo desta demanda** — regenerar cascateia em `render_print.py`, `print/` e no PDF, e é trabalho de uma demanda de documentação própria. Mitigação aplicada aqui: `docs/FLOWS.md` ganhou legenda sob a imagem declarando que o diagrama está defasado e que a cadeia vigente é a do mermaid acima. **Dívida declarada, não silenciosa.**
- **Sweep de segredo do `scripts/make-mirror.js --check` não roda na CI de PR** — dívida preexistente, encontrada aqui.
- **A trava anti-auto-serviço (`Cite or cap`) não tem detecção automatizada** para demandas futuras: o teste desta demanda assere que a regra **está escrita**, não que ela **foi seguida** na §0 de cada nova demanda. A asserção mais barata é a próxima demanda contar 4 linhas de eixo com citação na sua própria §0.


## 8. QA plan _(VERIFY)_

### Pirâmide de testes — aqui ela é degenerada, e vale dizer por quê

A pirâmide clássica (unit → integration → E2E) pressupõe código que executa. O artefato desta mudança é **texto de prompt**: `commands/flow.md` não tem função, não tem processo, não tem I/O. Não existe camada unit, não existe camada de integração e não existe E2E — **inventar uma seria mentir sobre o que foi provado**. O que existe é uma única camada:

| Camada | Existe? | O que é aqui |
|---|:--:|---|
| Unit | ❌ | não há unidade executável a isolar |
| Integration | ❌ | não há dois componentes a integrar — o "componente" é uma instrução lida por um modelo |
| E2E / comportamental | ❌ | exigiria rodar o orquestrador e observar a nota. **Não existe harness disso neste repo** — mesmo limite já registrado na 002 para comportamento de agent. Declarado, não contornado |
| **Asserção sobre conteúdo de artefato** | ✅ | `test/flow-pretriagem.test.js` — 8 `test()` de AC + 1 de orçamento (T9/§5.4), **105 asserções, todas sobre o conteúdo de `commands/flow.md`**. **Zero dependência de git/VCS** (reescrito no REVIEW — ver §8.1) |
| Gates mecânicos do repo | ✅ | `validate-artifacts --strict`, `regen-manifest --check`, `node --test test/*.test.js` |

**O que essa camada prova e o que não prova.** Prova que a instrução **está escrita**, onde tem de estar, com o número e não com adjetivo, e que nada do fluxo de hoje foi removido. **Não prova** que o orquestrador **obedece** — isso é o Experimento 3 do discovery (a primeira demanda real pós-merge), e é a Premissa #1 (confiança 2) declarada na §5.3.

**Referência do diff.** Os AC de diff (AC-04, AC-05) comparam contra `git show origin/main:commands/flow.md`, **nunca** contra `git diff --name-only`: dois arquivos desta demanda só entram no índice no SHIP, e um predicado dependente de staging mudaria de resposta por um motivo que não é a feature.

**Prova do gate da Phase 4** ("cada AC tem teste que falha sem a mudança") — reproduzível:

```sh
git show origin/main:commands/flow.md > /tmp/base-flow.md
FLOW_MD_UNDER_TEST=/tmp/base-flow.md node --test test/flow-pretriagem.test.js   # 8/8 vermelhos
node --test test/flow-pretriagem.test.js                                        # 8/8 verdes
```

AC-04, AC-05 e AC-07 são critérios de **invariância** ("este bloco NÃO mudou", "o file set NÃO cresceu") — vacuamente verdadeiros na BASE. Cada um desses três testes por isso também asserta a **presença** da SEÇÃO, que é o que o deixa vermelho sem a mudança.

### GOAL metric observable? **Sim — por comando, sem instrumentação nova**

A métrica é `nº de AC na §3 do task.md, em demandas cuja pré-triagem deu nota > 6`. O leading indicator é a nota + justificativa por eixo gravadas no `task.md`. Os dois se consultam com `grep` sobre o repo, porque o `task.md` é o próprio armazenamento:

```sh
# 1. Leading indicator — a nota de uma demanda (e se ela está acima do corte)
grep -oE 'NOTA [0-9]+/10 — \*\*(acima|abaixo)\*\*' docs/todo/<NNN>-*/task.md

# 2. Leading indicator — as 4 justificativas por eixo (tem de dar 4)
grep -cE '^- \*{0,2}A[1-4] [A-Za-z]+ [0-9]+' docs/todo/<NNN>-*/task.md

# 3. A métrica — nº de AC da §3 daquela demanda (alvo: ≤ 10 quando a nota > 6)
grep -c '^- \[[ x]\] \*\*AC-' docs/todo/<NNN>-*/task.md

# 4. A série inteira, uma linha por demanda (é o que se lê no ship)
for f in docs/todo/*/task.md; do
  printf '%s\tnota=%s\tAC=%s\n' "$f" \
    "$(grep -oE 'NOTA [0-9]+/10' "$f" | head -1)" \
    "$(grep -c '^- \[[ x]\] \*\*AC-' "$f")"
done
```

Conferido neste worktree: `001` → 16 AC; `003` → nota 4/10, 4 justificativas de eixo, 10 AC.

**Três ressalvas honestas, porque "observável" aqui não é o mesmo que "confiável":**
1. **A consulta depende de formato, não de schema.** Nada valida o campo de pré-triagem — o `validate-artifacts.js` não olha para `docs/todo/`. Se uma demanda futura escrever a nota noutro formato, o `grep` devolve vazio e a métrica fica silenciosamente sem ponto. Já há divergência: o TEMPLATE prescreve `- A1 Deliverable <n>: …` e a §0 desta demanda gravou `- **A1 Deliverable 6:** …` (daí o `\*{0,2}` no comando 2).
2. **A população é pequena e só conta o que está em `main`.** `docs/todo/002-*` não existe nesta branch (nunca foi mergeada), então o baseline de 18 AC da §0 não é reconferível por comando aqui — só o 16 da 001 é.
3. **n = 1 no ship.** O "Baseline at ship" sai da primeira demanda pós-merge com nota > 6. É um ponto, não uma série.

### Matriz de rastreabilidade AC → teste

| AC | Arquivo de teste | Status |
|---|---|---|
| AC-01 | `test/flow-pretriagem.test.js` › `AC-01 — a pré-triagem existe como etapa nomeada entre GOAL e DEFINE, com rubrica de eixos` (21 asserções — inclui o veto `≤ 4 caps at 6`, o `Cite or cap`, e a contagem de eixos travada em 4) | ✅ verde · 15/15 vermelhas na BASE |
| AC-02 | `test/flow-pretriagem.test.js` › `AC-02 — NOTA e justificativa por eixo gravadas no task.md` (13 asserções — só o durável do TEMPLATE; a amarra com `docs/todo/003-*` saiu) | ✅ verde · 9 de 13 vermelhas na BASE |
| AC-03 | `test/flow-pretriagem.test.js` › `AC-03 — NOTA > 6 enxuga o DEFINE com teto numérico, não com adjetivo` (11 asserções — teto extraído como número, M3 pinado) | ✅ verde · 4/4 vermelhas na BASE |
| AC-04 | `test/flow-pretriagem.test.js` › `AC-04 — menos AC, não AC mais frouxo: o gate da VERIFY fica intacto` (12 asserções: **sha256 pinado** do bloco Phase 4 + literais do `Exit gate:`/`Produces:`) | ✅ verde · 5 de 12 vermelhas na BASE |
| AC-05 | `test/flow-pretriagem.test.js` › `AC-05 — não-regressão: NOTA ≤ 6 roda exatamente o fluxo de hoje` (14 asserções — a linha de `Inputs:` provada **puramente aditiva**: remover o acréscimo devolve a linha da BASE caractere a caractere) | ✅ verde · 7 de 14 vermelhas na BASE |
| AC-06 | `test/flow-pretriagem.test.js` › `AC-06 — bloco de performance só com NOTA > 6 _e_ superfície executável` (18 asserções — V-1 pinado) | ✅ verde · 3/3 vermelhas na BASE |
| AC-07 | **Dividido no REVIEW.** No teste, só o invariante de artefato: `test/flow-pretriagem.test.js` › `AC-07 — a pré-triagem não inventa sintaxe nem vaza para os outros orquestradores` (4 asserções). O escopo de demanda virou **evidência de PR** — §8.1 abaixo | ✅ verde · 1 de 4 vermelha na BASE |
| AC-08 | `test/flow-pretriagem.test.js` › `AC-08 — idioma conforme guidelines.md §Idioma` (10 asserções — predicado **invertido**: stopwords PT-BR de alta frequência, em vez de lista fechada de 9 palavras) | ✅ verde · 8 de 10 vermelhas na BASE |
| AC-09 | **Sem teste dedicado — coberto pelos gates do repo.** `node scripts/validate-artifacts.js --strict` (0 errors / 0 warnings, exit 0) · `node scripts/regen-manifest.js --check` (exit 0, `commands.flow` em `1.3.0` com sha256 novo) · `node --test test/*.test.js` (275/275, nenhum teste existente alterado) | ✅ verde |
| AC-10 | **Sem teste dedicado — coberto pelo backtest da §5.3** (Experimento 1: 002 = 8 > 001 = 4; 001 ≤ 6; rodada de estresse + corroboração 003 = 4). Evidência documental, não executável | ✅ verde por inspeção |

**Cobertura: 10/10 AC.** 8 por asserção automatizada, 1 pelos gates mecânicos, 1 por inspeção documental do backtest.

### Achados do VERIFY (não bloqueiam os AC como escritos; entram como registro)

- **V-1 (AC-06, intenção) — ✅ RESOLVIDO no loop-back do BUILD.** Achado: `test/` estava na lista literal de SUP-EXEC, mas o gate da Phase 4 obriga **toda** demanda acima do corte a criar ou editar arquivo em `test/` (um teste por AC). Logo "o diff previsto toca `test/`" era aproximadamente sempre verdadeiro acima do corte, e a saída "content-only (`.md`) → no performance block" ficava quase inalcançável — expondo a Premissa #5 do discovery. **Esta demanda é o contraexemplo vivo:** mudança só de `.md` que ainda assim tocou `test/flow-pretriagem.test.js`. **Correção aplicada:** `test/` passou a contar como superfície executável **só quando é objeto da mudança** (o que o teste assere, o harness, o tempo da suíte), **nunca quando o teste existe apenas para provar a mudança**. Protegido por 2 asserções novas em AC-06, para a correção não regredir em silêncio.
- **V-2 (AC-07 × documentação) — ✅ RESOLVIDO por emenda de escopo do orquestrador.** Achado: com a Phase 0.5 rodando **sempre**, `docs/FLOWS.md`, `docs/USAGE.md:272` e `README.md:471` passavam a descrever uma cadeia que não é mais a do comando — e `docs/FLOWS.md:74` **desenha a Phase 2.5 no mermaid** e tem seção `Gate 2.5 → 3 · SEC` própria, ou seja, fase fracionária é documentada ali e a 0.5 ausente era inconsistência real, não abstração. **Emenda:** a allowlist do AC-07 passou a admitir `docs/FLOWS.md`, `docs/USAGE.md` e `README.md`; os irmãos `feature-flow`/`bug-flow`, `agents/`, `skills/` e `autonomous/` **seguem congelados e asseridos como intocados**. Os três docs foram sincronizados no loop-back. _(A redação anterior deste achado dizia "a allowlist congela o diff em 5 caminhos" — são 8, e os três docs estão dentro.)_
- **V-5 (T9/§5.4) — ✅ RESOLVIDO como emenda de teto, não como estouro.** O SDET reportou `commands/flow.md` com 32.515 bytes contra o teto de 31.875 da §5.4, citando a cláusula "estourou → volta ao PLAN". **O achado estava certo sobre o documento e errado sobre o fato:** o teto tinha sido ampliado pelo orquestrador para **≤ 470 linhas / ≤ 33.000 bytes** no loop-back da Phase 4, para acomodar M1/M2/M3, e essa emenda não tinha sido escrita na §5.4 — o SDET leu o documento desatualizado. Emenda agora registrada na §5.4 com justificativa e data. Estado real: 449 linhas / 32.515 bytes, dentro. **Consequência boa do achado:** o teto deixou de ser prosa e virou **gate executável** (`test/flow-pretriagem.test.js`, caso T9/§5.4), que é o que impede crescimento silencioso do prompt mais caro do hub.

- **V-3 (§5.1, ponto de toque #4) — fechado como "não fazer", decisão do orquestrador.** O token `TRIAGE <n>` na legenda do Output final não foi implementado, e **a razão não é orçamento**. Editar aquela linha cria uma linha removida contendo a string `VERIFY`, o que faz o predicado literal do AC-04 (`grep -ci 'automated test\|VERIFY\|traceability'` sobre as linhas removidas) devolver 1 e reprovar — hoje asserido em `test/flow-pretriagem.test.js`. Custo/benefício não fecha: ganhar uma conveniência visual custaria emendar um AC de não-regressão de segurança. Não reabrir sem emendar o AC-04 antes (escopando o `grep` ao bloco da Phase 4, ex. `awk '/^### Phase 4/,/^### Phase 5/'`). Efeito aceito: o relatório final do `/flow` não exibe a nota.
- **V-4 (§5.2 × §5.3, rastreabilidade da rubrica).** As âncoras `4–6` e `7–8` colapsaram na coluna `between` — corte #1 da ordem declarada na §5.4, e necessário para caber no orçamento. Consequência não registrada: as justificativas do backtest citam "→ faixa 4–6" e "faixa 7–8", faixas que **não existem** mais na tabela publicada, e a fronteira do veto (eixo ≤ 4) ficou sem âncora própria — exatamente onde a rodada de estresse mostra que a pressão de auto-serviço age.

### 8.1 Evidência de PR — escopo de demanda, deliberadamente fora da suíte permanente

O REVIEW derrubou a primeira versão destes predicados: eles estavam encodados como `git diff` contra `origin/main` dentro do `*.test.js`, e **escopo de uma demanda não é invariante de um artefato**. As três consequências, duas delas reproduzidas empiricamente pelos reviewers:

1. **Vermelho no merge** — pós-merge `origin/main` contém a mudança, o diff contra si mesmo é vazio, o `deepEqual` falha sem nada ter regredido.
2. **Vermelho na CI já neste PR** — `actions/checkout@v4` sem `fetch-depth` não materializa `refs/remotes/origin/main`; simulado, deu 6 pass / 3 fail.
3. **Repo congelado** — a allowlist virava restrição permanente. Reproduzido contra a branch `feat/002-flutter-dart-engineer`, em voo: `artefatos novos criados: ["agents/flutter-dart-engineer.md"]`.

**Correção:** o teste ficou sem nenhum `git`, e estes comandos rodam **uma vez, no PR**. Todos conferidos em 2026-09-17, saída batendo com o esperado. _(Verificação da correção: com o agent da 002 presente na árvore, a suíte da 003 dá 9/9 verde.)_

```sh
# AC-07 · arquivos tocados pelo commit da feature (4c40abe), contra a allowlist emendada no REVIEW
#   NOTA: rode contra o commit da feature, não contra a ponta do PR. O SHIP acrescenta um
#   segundo commit com o memory sync (.claude/memory/*, side-effect obrigatório da Phase 6)
#   e a movida docs/todo/ -> docs/done/. Os dois são esperados e estão fora da allowlist do AC-07,
#   que descreve o escopo da *mudança*, não o fechamento da demanda.
git diff --name-only origin/main 4c40abe
#   README.md  commands/flow.md  docs/FLOWS.md  docs/USAGE.md
#   docs/discovery/flow-pretriagem.md  docs/todo/003-flow-pretriagem/task.md
#   manifest.json  test/flow-pretriagem.test.js

# AC-07 · irmãos e artefatos congelados pela §4 — esperado: vazio
git diff --name-only origin/main -- \
  commands/feature-flow.md commands/bug-flow.md agents/ skills/ autonomous/

# AC-07 · nenhum artefato novo — esperado: vazio
comm -13 \
  <(git ls-tree -r --name-only origin/main -- commands agents skills autonomous | sort) \
  <(git ls-files --cached --others --exclude-standard -- commands agents skills autonomous | sort)

# AC-02 · dry-run (Experimento 2) — a 003 gravou a própria nota
grep -c '^\*\*Pré-triagem (Phase 0.5):\*\*' docs/todo/003-flow-pretriagem/task.md   # 1
grep -cE '^- \*{0,2}A[1-4] [A-Za-z]+ [0-9]+' docs/todo/003-flow-pretriagem/task.md    # 4
grep -oE 'NOTA [0-9]+/10' docs/todo/003-flow-pretriagem/task.md | head -1             # NOTA 4/10
```

### 8.2 Mutation testing — 2 rodadas, 113 mutantes, 0 sobreviventes

O REVIEW encontrou seis asserções que não provavam nada (a pior: remover **o veto e o `Cite or cap` inteiros** deixava 5 dos 8 casos verdes — a única mitigação da Premissa #2 não tinha teste). Todos fechados e reverificados:

| Mutação | Morta por |
|---|---|
| remove `veto: any axis ≤ 4 caps SCORE at 6` | AC-01 |
| remove a cláusula `Cite or cap` | AC-01 |
| remove o eixo A4 da rubrica | AC-01 + AC-02 (cruzamento com `four justifications`) |
| injeta `` Run `/pretriagem` to score it. `` | AC-07 |
| traduz uma instrução real para PT-BR | AC-08 + AC-01 |
| afrouxa o exit gate da Phase 4 | AC-04 |
| apaga o texto original dos `**Inputs:**` da Phase 1 | AC-05 |
| troca o teto `≤ 10 AC` por `≤ 20 AC` | AC-03 |

**Rodada 2 — re-review adversarial (91 mutantes, 68 mortos, 23 sobreviventes).** A rodada 1 acima foi auto-avaliação do autor do teste, e ela passou 23 buracos. O re-review por um especialista independente, com 91 mutantes, encontrou **3 BLOCKERs**:

| Furo | O que sobrevivia | Por que importava |
|---|---|---|
| **Escala casada por substring** | `1–10` → `1–100` e `1–10000` ficavam verdes | Com escala 1–100 o corte `> 6` deixa de significar qualquer coisa: toda demanda fica acima do corte, o teto passa a valer sempre, e "≤ 6 roda o fluxo de hoje" vira letra morta |
| **Teto pelo primeiro número** | `**≤ 10 AC** … (in practice ≤ 25 AC is fine)` ficava verde | É o AC que produz a métrica GOAL, e o modo de falha declarado na §5.4 é literalmente "o teto ficou enterrado em texto" — um segundo teto maior é a forma mais barata de enterrá-lo |
| **Nada provava que a etapa sempre roda** | `Runs: only when the lead asks … skippable`, e **reverter a linha 3 para a BASE** | A linha de abertura é editada por esta demanda justamente para declarar `which always runs`, e não tinha asserção nenhuma. Etapa pulável ⇒ os outros sete AC ficam sem população e a métrica GOAL não é observável |

Mais 5 famílias de WARNING: SUP-EXEC não ancorada na enumeração (remover `test/` da lista sobrevivia pela menção posterior na mesma célula), regex de slash cega a `/pt`/`/Maiúscula`/em-dash/aspas, varredura de irmãos cobrindo 2 arquivos em vez de 4 diretórios (a seção inteira pôde ser colada em `commands/discovery.md` sem ruído), idioma passando por fora das 22 stopwords — **inclusive a tradução da definição de um eixo da rubrica** — e **escape hatch aditivo**: quatro mutantes que *preservam* o texto exigido e *acrescentam* uma válvula (`(ignore when in a hurry)` no veto é a Premissa #2 sendo neutralizada sem ser removida).

**Rodada 3 — 22/22 mortos, 0 sobreviventes.** Todos os 23 reconstruídos como mutantes executáveis e refeitos (N30 descartado como benigno: `/discovery` é comando real). Fixes: números extraídos e comparados em vez de casados por substring (escala em 2 pontos, `matchAll` exigindo que **todos** os tetos da célula sejam `[10]`), âncoras na linha `**Runs:**` e na linha 3, enumeração de SUP-EXEC recortada da célula, classe de prefixo do regex invertida, varredura dos 4 diretórios com piso de sanidade, segundo predicado de idioma **ortográfico** (zero diacrítico PT na parte instrucional), e `doesNotMatch` de escape hatch nas 6 células críticas. _(Uma iteração: o vocabulário de escape tinha `may waive` e não `may`, e um mutante sobreviveu à primeira passada.)_

**Verificação independente do orquestrador:** 4 mutantes rodados por mim fora do relatório do autor — escala `1–100`, `(ignore when in a hurry)` no veto, teto duplo `≤ 25 AC`, e reversão da linha 3 para a BASE. **Os 4 morrem.**

**Limites declarados, honestos:** AC-08 é heurística (stopword + diacrítico), não parser — não pegaria PT-BR sem acento nem stopword. O `doesNotMatch` de escape hatch fecha um vocabulário, não prova ausência de contradição em prosa, o que é impossível. E o sha256 pinado do AC-04 **vai falhar em qualquer edição futura legítima da Phase 4**: é o preço do predicado forte, e a mensagem de falha avisa que o hash precisa ser repinado conscientemente, não "consertado".

## 9. Cross-repo peer consults
| Phase | Peer session | Repo | Ref lido | Pergunta | Resposta | Mudou o plano? |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

_Pre-flight 2026-09-17: `ListAgents` mostrou 1 peer (`refinmulnivel-58`, busy), em repo não afetado por esta mudança. Sem handshake, sem consulta — a demanda é local a `commands/flow.md`._

## 10. Done
- [x] Código commitado (`4c40abe`) — _merge depende do PR e da CI_
- [x] Custo de orquestração medido e registrado (§11) — $46,0223, fonte transcript, 11 subagents fora
- [x] Todos os AC com teste verde — 275/275 na suíte; 8/8 casos de AC vermelhos contra `origin/main`
- [x] Métrica GOAL instrumentada e observável — campo `Pré-triagem (Phase 0.5)` no TEMPLATE, comandos de coleta na §8
- [x] Veredito de segurança: **APPROVE WITH MITIGATIONS** (M1/M2/M3 aplicadas e reverificadas — §7)
- [x] Memória sincronizada — `project-memory-keeper`, commit separado
- [x] Baseline registrado no ship — 17 AC, inalterado e corretamente inalterado (§0)
- [x] Peers notificados — n/a, nenhum repo afetado (§9)

## 11. Custo _(SHIP — medido, não estimado)_
**Início:** 2026-09-17T14:40:03Z
**Fonte:** **transcript (só orquestrador).** O OTEL está `live` nesta máquina, mas a porta 9464 — que é única por máquina — está servindo a sessão `7eb56a8c`, não esta (`daf94807`). Reportar aquele número seria atribuir a esta demanda o custo de outra sessão.
**Comando:** `node ~/.claude/skills/session-cost/scripts/session-cost.js --since 2026-09-17T14:40:03Z`

| | |
|---|---|
| Custo de orquestração | **$46,0223** |
| Chamadas de API | 203 |
| Output (inclui 72.251 de thinking) | 299.468 tok |
| Leitura de cache | 38.785.697 tok |
| Escrita de cache (1h) | 1.914.072 tok |
| Input não-cacheado | 406 tok |
| Subagents despachados | **11 — consumo NÃO incluído acima** |

_O número acima é só o orquestrador. O Claude Code não grava tokens de subagent no
transcript, e num flow como este — que rodou discovery, PO, arquiteto, dev, SDET,
security, 4 reviewers em paralelo e um re-review adversarial — é neles que está a
maior parte do gasto. **Total real da sessão: `/cost` nativo.** Nenhum número aqui
foi derivado ou estimado._
