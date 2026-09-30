<!-- demand: 006-flow-melhorias -->
<!-- created: 2026-09-30 -->
# Change: Melhorias no /flow e no /code-review vindas do comparativo com o ecc

## 0. GOAL _(from /discovery — the anchor for every phase)_
**Discovery brief:** docs/discovery/flow-melhorias.md
**Objective (why):** rigor proporcional ao tamanho da mudança, flow retomável após interrupção e gates que exigem evidência verificável.
**Success metric:** capacidades C1–C6 presentes em `commands/flow.md` e `commands/code-review.md` e fixadas por teste determinístico; e subagents obrigatórios numa mudança trivial, contados pelo texto do `flow.md`
**Baseline:** 0/6 capacidades; faixa trivial inexistente — 8 fases e ≥ 7 subagents em qualquer mudança (source: grep em `commands/flow.md` e `commands/code-review.md`, base 4e9cdc6; `flow.md:414`, `:251`)  →  **Target:** 6/6 e, na faixa trivial, ≤ 4 subagents com as 8 fases presentes (colapsadas), by 2026-10-14
**Baseline at ship:** **6/6** capacidades fixadas por teste (427/427, prova de RED contra `d78e998`); faixa trivial com **4** subagents obrigatórios; `flow.md` 30.950 B (era 32.798, teto 33.000 intacto)
**Recommendation:** Go
**Pré-triagem (Phase 0.5):** NOTA 6/10 — abaixo do corte (> 6)
- A1 Deliverable 7: as 5 capacidades estão nomeadas e os arquivos são implícitos (`commands/flow.md`, `commands/code-review.md`); o conjunto exato de testes fica aberto.
- A2 Mechanism 7: cada mecanismo tem referência verificável no ecc (`orch-pipeline`, `tdd-workflow`, `orch-review`, `santa-loop`); no repo, as primitivas existem (`task.md`, commits, `test/flow-pretriagem.test.js`), mas os parâmetros (limites da faixa, forma da prova de RED) não.
- A3 Done 5: "adotar" cada item não fixa a condição de saída; os limites da faixa trivial só existiram depois da decisão do lead.
- A4 Stability 6: um caminho por item, mas a faixa trivial abriu uma escolha de direção (colapsar × pular × não ter) resolvida por pergunta.

## 1. Description _(DEFINE — PO)_
**Problem:** o `/flow` cobra a mesma cadeia de qualquer mudança: 8 fases e ≥ 7 subagents num typo ou numa demanda grande (`commands/flow.md:414` "Never skip a phase"). Ele não registra em que fase está, então um flow interrompido é reconstruído à mão (evidência da 004, discovery §Evidência "a"). O gate da VERIFY exige "teste que falha sem a mudança" (`commands/flow.md:251`), mas não exige prova que outra pessoa confira, e na 004 a prova só existiu porque o dev a fez por conta própria (evidência "b"). O loop BUILD↔VERIFY não tem teto (`:251` "BUILD loops back"; `docs/FLOWS.md:527-529` admite que o anti-loop é "convenção de uso recomendada, não regra escrita nos commands").

O `/code-review` agrega vereditos de quem **devolveu** (`commands/code-review.md:106-110`): um revisor que falha some da conta, e o resultado pode sair `APPROVED` sem a lente dele. Nenhum achado é conferido antes de chegar ao relatório.

Por fim, o `/flow` nunca chama UX. O PLAN consulta só `integration-architect` e `postgres-dba` (`commands/flow.md:201`). O `/code-review` manda diff de UI para o `senior-product-designer` (`commands/code-review.md:51`), não para os agents de UX por plataforma (`agents/ux-designer-web.md`, `agents/ux-designer-mobile.md`), e não tem gatilho para Dart/Flutter nem React Native (`:36-53`).

A mudança tem **seis** capacidades. A regra da faixa trivial foi decidida pelo lead e **não é reaberta aqui** (discovery §Decisão do lead, 2026-09-30: colapsar, não pular; superfície sensível tira da faixa, sempre; meta ≤ 4 subagents). A C6 é acréscimo do lead ao escopo.
- **C1** faixa trivial no `/flow`, com critério objetivo de entrada, citação obrigatória e saída da faixa;
- **C2** prova de RED verificável no gate da Phase 4, em todas as faixas;
- **C3** status por fase no `task.md` e retomada a partir da primeira fase não concluída;
- **C4** teto de 3 passagens por gate nos loops BUILD↔VERIFY e REVIEW→BUILD, com escalonamento ao usuário;
- **C5** `/code-review` fail-closed quando falta revisor, mais verificação adversarial de BLOCKER/WARNING;
- **C6** o `/flow` chama o agent de UX da plataforma quando a mudança altera interface visível: consulta no PLAN e lente de UX/a11y no `/code-review`.

**Métrica GOAL:** capacidades presentes e fixadas por teste determinístico passam de **0/6 → 6/6** (a §0 é atualizada pelo orquestrador). A parte de outcome continua: na faixa trivial, ≤ 4 subagents obrigatórios com as 8 fases presentes.

**Business value:**
- Mudança pequena passa a caber no `/flow` sem perder os gates (hoje o workaround é não usar o `/flow`, discovery §Usuários).
- Flow interrompido deixa de custar a releitura manual do estado.
- Gate de RED e revisão passam a ter evidência que o lead confere sem pedir no PR.
- Mudança de UI recebe fluxo, estados e acessibilidade **antes** do BUILD, quando corrigir é barato.

Custo contido: texto de dois commands, template do `task.md`, docs que descrevem o `/flow` e testes determinísticos sobre esse texto. Nenhum agent, script ou CLI muda.

**User segment:**

| Segmento | Dor (1-5) | Frequência | Efeito desta mudança |
|---|---|---|---|
| Dev que roda `/flow` em mudança pequena (>50 devs, `business.md:11`) | 4 | Frequente (inferida, sem telemetria) | Faixa trivial com ≤ 4 subagents obrigatórios, sem perder VERIFY, security gate e REVIEW |
| Dev com flow interrompido | 3 | Ocasional | Retoma pela primeira fase não concluída do `task.md` |
| Lead/revisor que confia no gate da VERIFY | 3 | Todo flow | Prova de RED conferível pela §8; revisão incompleta nunca sai aprovada |
| Dev preso num loop BUILD↔VERIFY | 3 | Ocasional | O flow para na 3ª passagem sem verde e escala com o achado |
| Dev de front web ou mobile | 3 (inferida) | A cada mudança de tela | Fluxo, estados e a11y definidos no PLAN; lente de UX da plataforma no REVIEW |

**Achados do DEFINE que moldam os AC (verificados no repo, base `7847b04`):**
- **O bloco da Phase 4 está pinado por hash.** `test/flow-pretriagem.test.js:57-59` fixa o sha256 do bloco `### Phase 4 — VERIFY` e o literal do exit gate. Isso vale para a 003 inteira e é o que garante "gate da VERIFY intacto". Se a C2 editar esse bloco, o AC-04 da 003 fica vermelho. O AC-08 resolve o conflito sem afrouxar a garantia: o literal original continua presente, byte a byte, e a atualização do pin só é aceita se for puramente aditiva e justificada no diff. Sem essa justificativa, é o BLOCKER de `commands/code-review.md:164` ("teste mudado para acomodar o código").
- **O orçamento de tamanho do `flow.md` está quase no teto.** `test/flow-pretriagem.test.js:115-116` define teto de 470 linhas / 33.000 bytes. Hoje o arquivo tem 449 linhas / 32.798 bytes, ou seja, **202 bytes de folga**. C1–C4 e C6 não cabem nisso. O teste diz "quem estoura volta ao PLAN, não afrouxa esta asserção" (`:532`). O AC-25 deixa a decisão com o PLAN (novo teto com número e motivo, ou conteúdo movido para fora do prompt carregado em toda invocação), e ela nunca pode ser tomada em silêncio.
- **O `/code-review` sempre dispara dois revisores** (`commands/code-review.md:56`: `system-architect` e `security-specialist`). "REVIEW com 1 revisor" na faixa trivial não cabe no `/code-review` como está escrito hoje. A lente de segurança da faixa trivial fica garantida pelo security gate da VERIFY (AC-06), e o revisor único segue as regras da C5 (AC-14). Quando o diff é de UI, o revisor único é o de UX (C6). O PLAN escolhe o mecanismo: modo de revisor único no `/code-review` ou despacho direto pelo `/flow`.
- **A lente de UI do `/code-review` hoje é do `senior-product-designer`** (`commands/code-review.md:51`). A C6 põe `ux-designer-web`/`ux-designer-mobile` no diff de UI visível. O PLAN decide se o `senior-product-designer` continua em algum gatilho (ex.: copy sem mudança visual) e grava isso na §5. O teto de 6 revisores (`:59`) continua valendo, com a lente de UX dentro dele.
- **`flutter-dart-engineer` não existe na `main`** (demanda 002 em andamento). A C6 só chama o UX para Dart/Flutter. BUILD e revisão de código Dart por stack ficam fora.
- **A convenção anti-loop já existe, mas só na doc.** `docs/FLOWS.md:531-534` diz: "duas voltas no mesmo gate → pare"; volta que sobe de fase reinicia a contagem; `NEEDS DISCUSSION` não consome tentativa. "Teto de 3 passagens" é o mesmo número contado de outro jeito (1 passagem inicial + 2 voltas). O AC-11 adota essa semântica, e o AC-22 converte a seção de "convenção" em referência à regra do command, para as duas não divergirem.
- **O loop nunca é automático** (`commands/flow.md:418`, `docs/FLOWS.md:459`). O teto conta tentativas; não autoriza retentar sem confirmação do usuário.
- **Retomada × custo.** O pre-flight carimba `Início` na §11 (`commands/flow.md:19`), e a fonte B mede só o transcript da sessão corrente (`:285-289`). Um flow retomado em outra sessão mede só a sessão que o fechou. O AC-10 preserva o `Início` original, e o custo de flow retomado tem de declarar a fronteira (regra de `business.md:49`), nunca somar por estimativa.
- **A subtração até ≤ 4 não é automática.** O baseline tem 7 subagents (memory-keeper ×2, PO, architect, dev, security gate, ≥ 1 revisor). Tirar PO e architect deixa 5. O AC-03 fixa o que é obrigatório (dev, security gate, 1 revisor) e deixa ao PLAN a quarta vaga (ex.: memory-keeper de carga ou de sync). A verificação adversarial da C5 só dispara quando há BLOCKER/WARNING, então é condicional e não entra na conta dos obrigatórios. A lente de UX da faixa trivial **ocupa** a vaga do revisor único; não soma.

**Conflito com `business.md` / `guidelines.md`:**
1. **`business.md:56`** — "o rigor de spec é calibrado pela clareza do pedido, **nunca pela criticidade ou complexidade**". A faixa trivial colapsa DEFINE/PLAN pelo **tamanho da mudança**. É conflito real, resolvido pela decisão do lead de 2026-09-30, e a regra precisa ser emendada no SHIP (handoff ao `project-memory-keeper`). Proposta de redação: "a TRIAGE calibra a **quantidade de AC** pela clareza; a faixa trivial calibra o **volume da cadeia** pelo tamanho, com superfície sensível excluída; nenhuma das duas toca o gate de prova". O AC-23 mantém as duas separadas: o critério da faixa não altera a NOTA, e a TRIAGE não passa a pontuar tamanho (`commands/flow.md:174`).
2. **`guidelines.md:38`** (fail-closed em gate): não é conflito, é requisito. Critério sem citação → faixa padrão (AC-01); status sem artefato → fase não concluída (AC-10); revisor ausente → não aprova (AC-13); verificação que falha → achado mantido (AC-16); arquivo de UI sem citação de "nada visível muda" → UX dispara (AC-17).
3. **`guidelines.md:52-56`**: escopo de PR ("`/flow-lite` intocado", lista de arquivos) vira comando de uma vez só na §8, nunca `*.test.js` (AC-24). Invariantes dos commands viram teste com literais pinados (AC-26).
4. **`guidelines.md:59-63`** (fase fracionária): a faixa trivial é **modo**, não fase, e o consult de UX vive **dentro** da Phase 2. Nenhuma `X.5` nova e nenhuma renumeração (AC-23).

## 2. User stories (INVEST)

- **US1 (Must)** — Como **dev que roda o `/flow` numa mudança pequena**, quero uma faixa trivial com critério objetivo, em que as 8 fases existem colapsadas e a cadeia usa no máximo 4 subagents obrigatórios, para ter os gates do `/flow` sem pagar a cadeia cheia. _(C1; AC-01…AC-06)_
- **US2 (Must)** — Como **lead/revisor que confia no gate da VERIFY**, quero que a prova de que cada teste falha sem a mudança fique registrada numa forma que eu reproduza (sha + comando + saída, ou commit do teste antes do fix), para não depender da palavra do dev. _(C2; AC-07, AC-08)_
- **US3 (Must)** — Como **dev cujo flow foi interrompido**, quero que o `task.md` registre o status de cada fase e que o `/flow` retome da primeira não concluída sem refazer as concluídas, para não reconstruir o estado à mão. _(C3; AC-09, AC-10)_
- **US4 (Should)** — Como **dev preso num loop BUILD↔VERIFY ou REVIEW→BUILD**, quero que o flow pare na 3ª passagem sem verde e me mostre o achado que não fecha, para decidir o re-scope em vez de gastar mais iterações. _(C4; AC-11, AC-12)_
- **US5 (Must)** — Como **lead que lê o veredito do `/code-review`**, quero que uma revisão com revisor faltando nunca saia aprovada e que BLOCKER/WARNING passem por uma tentativa de refutação antes do relatório, para que o veredito signifique o que diz. _(C5; AC-13…AC-16)_
- **US6 (Must)** — Como **dev que muda uma tela web ou mobile pelo `/flow`**, quero que o agent de UX da plataforma defina fluxo, estados (vazio/erro/carregando) e acessibilidade antes do BUILD e revise o diff de UI, para não descobrir no PR que a tela não trata erro ou não é acessível. Refatoração sem mudança visível não paga essa consulta. _(C6; AC-17…AC-20)_
- **US7 (Should)** — Como **dev que aprende o `/flow` pela doc**, quero que README, USAGE e FLOWS descrevam faixa, status, retomada, teto, fail-closed e UX, e que nada contradiga o `/flow-lite`, para não descobrir as regras só rodando. _(consistência; AC-21…AC-27)_

## 3. Acceptance criteria (Gherkin)

**Definições:**
- **BASE** = `origin/main` no momento do PLAN (hoje empilhada sobre 004/005; o PLAN grava o sha).
- **FAIXA TRIVIAL** = o modo do `/flow` introduzido pela C1. **FAIXA PADRÃO** = a cadeia de hoje.
- **SUPERFÍCIE SENSÍVEL** = qualquer item da lista de `commands/flow.md:207` ou qualquer caixa da §6 do template.
- **PROVA DE RED** = evidência, por AC, de que o teste falha sem a mudança, reproduzível por terceiro.
- **PASSAGEM** = uma execução do gate (VERIFY ou REVIEW) sobre um BUILD.
- **LENTE FALTANTE** = revisor despachado que falhou, estourou o tempo ou devolveu saída fora do formato de `commands/code-review.md:84-94` (sem linha `verdict:` válida).
- **UI VISÍVEL** = mudança no que o usuário vê ou com que interage: saída renderizada (markup/JSX/widgets), estilos, copy visível, navegação, estados visuais, assets. **Não** é UI VISÍVEL: hook, chamada de API, tipagem ou refatoração cujo render não muda.
- Os literais PT-BR/EN exatos (nomes de campos, rótulos de veredito, marcador de fase colapsada) são escolha do PLAN, gravada na §5. Os testes pinam o que o PLAN escolher.

**Natureza da prova:** os artefatos são prompt. Não há harness que rode o orquestrador, então todo AC é predicado determinístico sobre o texto de `commands/flow.md` e `commands/code-review.md` (molde `test/flow-pretriagem.test.js`: seam por variável de ambiente para o arquivo sob teste, literais pinados, nenhum `git` nos testes). A PROVA DE RED **desta** demanda roda cada teste contra a BASE, pelo seam, e sai vermelho. Pela regra de `guidelines.md:52-56`, escopo de PR (arquivos tocados, `/flow-lite` intocado) fica como comando de uma vez só na §8.

### C1 — Faixa trivial

- [ ] **AC-01 — Entrada na faixa trivial por critério objetivo e citado** _(Teste)_
  - Given `commands/flow.md`
  - Then existe uma seção da faixa trivial com **critério de entrada conjuntivo**, todos obrigatórios:
    - (a) o diff previsto altera **no máximo 1 arquivo de produção**; não contam o teste que prova a mudança nem arquivo gerado por script do repo, como `manifest.json`;
    - (b) **nenhuma** SUPERFÍCIE SENSÍVEL;
    - (c) **nenhum** contrato novo ou alterado (endpoint, payload, schema compartilhado, pacote publicado);
    - (d) **≤ 3 AC**;
    - (e) **nenhum** ADR.
  - And cada critério é registrado no `task.md` com **uma citação** (path, `path:line` ou ausência verificável), no espírito do cite-or-cap de `commands/flow.md:183`
  - And a seção diz que **critério sem citação conta como não atendido**, e o flow segue na FAIXA PADRÃO (fail-closed)
  - And a decisão de faixa é registrada **antes do DEFINE**, num campo da §0 do template
  - _Moves GOAL metric?_ **sim** — é metade da C1 (1/6 da métrica primária).

- [ ] **AC-02 — As 8 fases estão presentes e colapsadas, nenhuma é pulada** _(Teste)_
  - Given a seção da faixa trivial
  - Then ela nomeia as 8 fases (GOAL, TRIAGE, DEFINE, PLAN, BUILD, VERIFY, REVIEW, SHIP) e a forma colapsada de cada uma:
    - GOAL em **uma linha** no `task.md`, com métrica, baseline (com fonte) e alvo, **sem `/discovery`**;
    - TRIAGE roda como hoje;
    - DEFINE e PLAN numa **única seção curta escrita pelo orquestrador, sem subagent**;
    - BUILD pelo dev da stack;
    - VERIFY com o mesmo exit gate da Phase 4, PROVA DE RED inclusa;
    - REVIEW com **1 revisor**, que é o de UX da plataforma quando o diff é de UI VISÍVEL (AC-20);
    - SHIP.
  - And a regra `Never skip a phase` (`commands/flow.md:414`) e `GOAL is not optional` (`:415`) continuam no arquivo, com o mesmo texto
  - _Moves GOAL metric?_ **sim** — "8 fases presentes (colapsadas)" é parte do alvo.

- [ ] **AC-03 — Na faixa trivial, no máximo 4 subagents obrigatórios** _(Teste)_
  - Given a seção da faixa trivial
  - Then ela **enumera** os subagents obrigatórios de uma execução sem achados, e a contagem é **≤ 4**
  - And a lista contém o dev da stack (BUILD), o `security-specialist` (security gate da VERIFY) e exatamente 1 revisor (REVIEW)
  - And `senior-product-owner` e `system-architect` **não** estão entre os obrigatórios
  - And despachos condicionais (verificação adversarial da C5, re-despacho após loop) são declarados como condicionais e ficam fora da contagem
  - _Moves GOAL metric?_ **sim** — é a métrica de outcome (baseline ≥ 7 → alvo ≤ 4).

- [ ] **AC-04 — Saída da faixa quando algo a invalida no meio** _(Teste)_
  - Given um flow na FAIXA TRIVIAL
  - When, em qualquer fase, um critério do AC-01 deixa de valer (2º arquivo de produção, SUPERFÍCIE SENSÍVEL, contrato, 4º AC, ADR)
  - Then a seção manda **sair da faixa**, registrar no `task.md` o critério que caiu (com citação) e a fase em que caiu
  - And manda retomar na FAIXA PADRÃO a partir da **Phase 1 DEFINE**, com DEFINE e PLAN refeitos pelos subagents da faixa padrão
  - And a GOAL de uma linha só é mantida se cumprir o exit gate da Phase 0 (métrica nomeada, baseline com fonte, alvo com data); se não cumprir, o flow volta à Phase 0 com `/discovery`
  - And a volta à faixa trivial **não** é permitida no mesmo flow
  - _Moves GOAL metric?_ não diretamente — impede que a faixa vire atalho.

- [ ] **AC-05 — (negativo) Superfície sensível nunca entra na faixa trivial** _(Teste)_
  - Given a seção da faixa trivial
  - Then ela afirma que SUPERFÍCIE SENSÍVEL exclui a faixa **sempre**, na entrada e no meio do flow (AC-04), e que nesse caso a Phase 2.5 roda conforme `commands/flow.md:218`
  - And a regra não tem válvula de escape: nenhum "unless", "except", "at the user's discretion", "a critério" ou equivalente no mesmo parágrafo. O teste usa o mesmo tipo de predicado `ESCAPE_HATCH` de `test/flow-pretriagem.test.js`
  - And nem pedido explícito do usuário coloca uma mudança com SUPERFÍCIE SENSÍVEL na faixa
  - _Moves GOAL metric?_ **sim** — o alvo exige "sem faixa trivial quando há superfície sensível".

- [ ] **AC-06 — (negativo) A faixa trivial nunca remove o security gate** _(Teste)_
  - Given `commands/flow.md`
  - Then a seção da faixa trivial manda rodar o security gate do `security-specialist` na VERIFY (secret scan + checagens OWASP sobre os arquivos tocados), como `commands/flow.md:249`
  - And a linha `**Then, always:**` da Phase 4 continua no arquivo com o texto da BASE
  - And nenhuma frase da seção dispensa, pula ou torna opcional o security gate
  - _Moves GOAL metric?_ não — guarda de não-regressão.

### C2 — Prova de RED verificável

- [ ] **AC-07 — O gate da VERIFY exige PROVA DE RED que um terceiro reproduz** _(Teste)_
  - Given `commands/flow.md`, em **todas** as faixas
  - Then a Phase 4 exige, para cada AC, PROVA DE RED registrada na §8 do `task.md` numa de duas formas (o PLAN pode restringir a uma):
    - (i) **commit do teste antes do fix**, com o sha citado e o comando que falha nele; ou
    - (ii) **comando exato + sha (ou ref) da árvore sem a mudança + trecho da saída vermelha que nomeia o teste**.
  - And a Phase 4 declara que AC **sem** PROVA DE RED nessa forma deixa o gate **não verde** (fail-closed). "Falha sem a mudança" afirmado sem evidência não conta
  - And a tabela `AC traceability` da §8 do template ganha o(s) campo(s) dessa evidência
  - _Moves GOAL metric?_ **sim** — é a C2 (1/6).

- [ ] **AC-08 — (negativo) Nenhum gate existente fica mais fraco** _(Teste)_
  - Given `commands/flow.md` depois da mudança
  - Then o exit gate da Phase 4 contém, **byte a byte**, o literal `every AC has at least one automated test that **fails without the change**`, e continua exigindo `security verdict is **APPROVE** or **APPROVE WITH MITIGATIONS**`, em todas as faixas
  - And qualquer edição do bloco da Phase 4 é **puramente aditiva**: removendo o acréscimo, volta o texto da BASE
  - And, se `PHASE4_SHA256`/`PHASE4_EXIT_GATE` de `test/flow-pretriagem.test.js` forem atualizados, as asserções de conteúdo desse teste (`:337-346`) ficam com o mesmo significado, e o diff traz a justificativa em comentário no próprio teste (regra de `commands/code-review.md:164`)
  - And o exit gate da Phase 5 continua exigindo "no BLOCKERs", só com acréscimo (ver AC-14)
  - And o exit gate da Phase 2 conserva as três condições da BASE (`commands/flow.md:205-207`), só com acréscimo (ver AC-18)
  - _Moves GOAL metric?_ não — guarda, exigida pelo GOAL ("gates com evidência", nunca mais frouxos).

### C3 — Status por fase e retomada

- [ ] **AC-09 — O `task.md` registra o status de cada fase** _(Teste)_
  - Given o template de `task.md` em `commands/flow.md`
  - Then ele tem um campo de status por fase para GOAL, TRIAGE, DEFINE, PLAN, 2.5, BUILD, VERIFY, REVIEW e SHIP, em PT-BR, com valores fechados (ex.: `pendente | em andamento | concluída | bloqueada | não se aplica`; o PLAN fixa os literais)
  - And cada fase manda o orquestrador **atualizar o status ao passar pelo gate**, com a data
  - And `não se aplica` só é aceito na 2.5 quando ela não disparou
  - _Moves GOAL metric?_ **sim** — metade da C3.

- [ ] **AC-10 — Retomada pela primeira fase não concluída, sem refazer as concluídas** _(Teste)_
  - Given `commands/flow.md`
  - When o `/flow` é invocado apontando para uma demanda com `task.md` existente em `docs/todo/`
  - Then o pre-flight **não** aloca novo `NNN`, **não** recarimba o `Início` da §11 e retoma da **primeira fase cujo status não é `concluída`**
  - And fases com status `concluída` não são reexecutadas
  - And uma fase marcada `concluída` cuja seção do `task.md` está vazia (ex.: §3 sem AC com status de DEFINE concluído) conta como **não concluída** (fail-closed)
  - And um loop-back para uma fase anterior volta para `pendente` o status das fases a jusante afetadas
  - And o custo de um flow retomado declara que a fonte cobre só a(s) sessão(ões) medida(s); nunca soma sessões por estimativa (`business.md:49`)
  - _Moves GOAL metric?_ **sim** — completa a C3.

### C4 — Teto de iterações

- [ ] **AC-11 — Teto de 3 passagens por gate, com escalonamento** _(Teste)_
  - Given `commands/flow.md`
  - Then os gates da VERIFY (BUILD↔VERIFY) e da REVIEW (REVIEW→BUILD) têm, **cada um**, teto de **3 PASSAGENS** sem verde
  - And na 3ª passagem sem verde o flow **para** e escala ao usuário com: o achado que não fecha, as 3 tentativas e o que mudou em cada uma
  - And cada passagem é registrada no `task.md` (fase, achado, o que mudou)
  - And a contagem segue `docs/FLOWS.md:531-534`: volta que sobe para PLAN ou antes reinicia a contagem; `NEEDS DISCUSSION` não consome passagem
  - And a confirmação do usuário antes de cada nova tentativa (`commands/flow.md:418`) continua valendo: o teto não torna o loop automático
  - _Moves GOAL metric?_ **sim** — é a C4 (1/6).

- [ ] **AC-12 — (negativo) Estourar o teto nunca vira aprovação** _(Teste)_
  - Given o texto do teto
  - Then estourar o teto **não** avança para a fase seguinte, **não** faz SHIP e não marca o gate como verde nem o status da fase como `concluída` (fica `bloqueada`)
  - And nenhuma frase autoriza "aceitar com ressalva" ao estourar sem decisão explícita do usuário registrada no `task.md`
  - _Moves GOAL metric?_ não — guarda.

### C5 — `/code-review` fail-closed e verificação adversarial

- [ ] **AC-13 — Revisor faltante nunca vira APPROVE limpo** _(Teste)_
  - Given `commands/code-review.md`
  - Then o Step 4 trata como LENTE FALTANTE o revisor que falhou, estourou o tempo ou devolveu saída fora do formato
  - And com ≥ 1 LENTE FALTANTE o veredito geral **não pode** ser `APPROVED` nem `APPROVED WITH COMMENTS`. O PLAN escolhe entre um rótulo novo (ex.: `INCOMPLETE`) e um existente que não aprove
  - And o relatório final (Step 5) tem campo/seção que **nomeia cada lente faltante** e o motivo
  - And vale também quando **todos** os revisores faltam, e no caminho "purely cosmetic" de `commands/code-review.md:58`
  - _Moves GOAL metric?_ **sim** — metade da C5.

- [ ] **AC-14 — A REVIEW do `/flow` não fica verde com revisão incompleta** _(Teste)_
  - Given `commands/flow.md`
  - Then o exit gate da Phase 5 exige "no BLOCKERs" **e** nenhuma LENTE FALTANTE
  - And na faixa trivial o revisor único segue a mesma regra: se ele falha, a REVIEW não passa
  - _Moves GOAL metric?_ **sim** — liga a C5 ao gate do `/flow`.

- [ ] **AC-15 — BLOCKER e WARNING passam por verificação adversarial; INFO não** _(Teste)_
  - Given `commands/code-review.md`
  - Then, entre a agregação e o relatório final, há um passo que, para cada BLOCKER e WARNING, **tenta refutar** o achado contra o código (arquivo e linha citados)
  - And o passo declara que **INFO não é verificado** (custo)
  - And cada achado verificado sai como `confirmado`, `refutado` ou `inconclusivo`
  - And achado `refutado` sai da lista principal, mas aparece numa seção própria do relatório com a evidência (`path:line`) que o refutou, e nunca some em silêncio
  - _Moves GOAL metric?_ **sim** — completa a C5.

- [ ] **AC-16 — (negativo) A verificação nunca rebaixa sem prova** _(Teste)_
  - Given o passo de verificação
  - Then `inconclusivo` mantém o achado com a severidade original
  - And falha, timeout ou saída ilegível do verificador mantém o achado (fail-closed, `guidelines.md:38`)
  - And a verificação não rebaixa severidade: só confirma ou refuta com evidência citada
  - And o BLOCKER de "teste mudado para acomodar o código" (`commands/code-review.md:164`) só é refutado se a justificativa explícita estiver no diff
  - _Moves GOAL metric?_ não — guarda.

### C6 — UX quando a mudança altera interface visível

- [ ] **AC-17 — Gatilho de UX objetivo, citado e roteado por plataforma** _(Teste)_
  - Given `commands/flow.md`
  - Then existe regra que dispara UX quando o diff previsto ou o plano altera UI VISÍVEL, e o `task.md` registra as telas/componentes afetados com citação de arquivo (`path` ou `path:line`)
  - And o roteamento é fixo:
    - front web (React e afins) → `ux-designer-web`;
    - Dart/Flutter ou app mobile, React Native incluso → `ux-designer-mobile`;
    - os dois, quando a mudança toca as duas plataformas.
  - And o gatilho é fail-closed: se o plano toca arquivo de UI (componente, tela, widget, estilo) e o `task.md` não cita por que nada visível muda, o UX dispara
  - _Moves GOAL metric?_ **sim** — metade da C6 (1/6).

- [ ] **AC-18 — Consulta de UX no PLAN, antes do BUILD** _(Teste)_
  - Given `commands/flow.md`, FAIXA PADRÃO
  - Then a Phase 2 manda consultar o agent de UX do AC-17 quando o gatilho dispara, **antes** do BUILD, cobrindo fluxo, estados (vazio, erro, carregando) e acessibilidade
  - And o resultado é registrado no `task.md`, num lugar previsto pelo template, **sem renumerar** as seções existentes (§6, §8 e §11 são citadas por número no `flow.md`)
  - And o exit gate da Phase 2 não fica verde quando o gatilho disparou e o registro de UX está ausente
  - And a consulta vive **dentro** da Phase 2; não é fase nova (AC-23)
  - And na FAIXA TRIVIAL **não** há consulta de UX no PLAN
  - _Moves GOAL metric?_ **sim** — é a parte "antes do BUILD" da C6.

- [ ] **AC-19 — Lente de UX/a11y no `/code-review` para diff de UI** _(Teste)_
  - Given `commands/code-review.md`
  - Then a tabela do Step 2 despacha `ux-designer-web` para diff de UI VISÍVEL web e `ux-designer-mobile` para diff de UI VISÍVEL mobile, com gatilhos que incluem `*.dart` e componentes React Native
  - And o prompt dessa lente cobre UX e acessibilidade
  - And a lente fica sujeita à C5 (se falha, vira LENTE FALTANTE) e cabe no teto de 6 revisores (`commands/code-review.md:59`)
  - _Moves GOAL metric?_ **sim** — completa a C6.

- [ ] **AC-20 — (negativo) Mudança sem UI visível não dispara UX; na faixa trivial, UX é o revisor único** _(Teste)_
  - Given `commands/flow.md` e `commands/code-review.md`
  - Then os dois nomeiam explicitamente como **não-gatilho** a refatoração de front sem mudança visível (hook, chamada de API, tipagem)
  - And nenhum dos dois dispara UX **só** pela extensão do arquivo (`.tsx`, `.jsx`, `.dart`) quando o `task.md` cita que o render não muda
  - And na FAIXA TRIVIAL com diff de UI VISÍVEL o revisor único da REVIEW é o agent de UX da plataforma; sem UI VISÍVEL, nenhum agent de UX é despachado
  - And a contagem de subagents obrigatórios da faixa trivial (AC-03) continua ≤ 4 nos dois casos
  - _Moves GOAL metric?_ **sim** — guarda do outcome de custo (UX não vira custo fixo).

### Consistência

- [ ] **AC-21 — Template e saídas refletem faixa e status** _(Teste)_
  - Given `commands/flow.md`
  - Then a §0 do template tem o campo de faixa (AC-01) e o de status por fase (AC-09)
  - And `## Output (after each phase)` mostra a faixa, o status da fase e a passagem corrente (`n/3`) quando for VERIFY ou REVIEW
  - And `## Output (final)` mostra a faixa, e a linha `Phases:` distingue **colapsada** de **pulada** com um marcador próprio, que aparece na `legend:`
  - And `➖` continua reservado para a 2.5 não disparada: nenhuma fase da faixa trivial sai como `➖`
  - _Moves GOAL metric?_ não — consistência.

- [ ] **AC-22 — Docs do hub descrevem o `/flow` como ele ficou** _(Inspeção binária, comando na §8)_
  - Then `README.md` (linha do `/flow` na tabela de commands, hoje `:536`) cita faixa trivial, retomada, teto e UX
  - And `docs/USAGE.md` §`/flow` descreve:
    - faixa trivial (critério e exclusão por superfície sensível);
    - status e retomada;
    - PROVA DE RED;
    - teto de passagens;
    - gatilho de UX.
  - And `docs/USAGE.md` e `README.md`, onde descrevem o `/code-review`, citam fail-closed, verificação adversarial e a lente de UX por plataforma
  - And `docs/FLOWS.md`:
    - descreve a faixa trivial e o consult de UX na seção do `/flow` e no cheat sheet (`:574`);
    - `§Convenção anti-loop-infinito` (`:527-537`) deixa de dizer "convenção de uso recomendada, não regra escrita nos commands" e aponta para a regra do `flow.md`, com o mesmo teto;
    - a matriz de retorno (`:472`) e o mermaid de `:462-468` não contradizem o teto de 3 passagens.
  - And `grep -n "não regra escrita nos commands" docs/FLOWS.md` não devolve nada
  - _Moves GOAL metric?_ não.

- [ ] **AC-23 — A faixa é modo, não fase; TRIAGE e DEFINE da 003 intactos** _(Teste)_
  - Given `commands/flow.md`
  - Then o conjunto de headings `### Phase ` é o mesmo da BASE (nenhuma fase nova, nenhuma fracionária nova, `guidelines.md:59-63`), e a linha de abertura (`:3`) mantém "seven numbered phases" e "two interstitial ones"
  - And a seção `### Phase 0.5 — TRIAGE` não menciona a faixa, e a NOTA não usa critério de tamanho (`commands/flow.md:174` preservado)
  - And `test/flow-pretriagem.test.js` passa inteiro, com AC-05 (linhas do DEFINE) e AC-07 (sem vazamento, sem sintaxe nova) sem alteração nas asserções
  - And nenhum slash command novo é criado (`business.md:46`)
  - _Moves GOAL metric?_ não — guarda.

- [ ] **AC-24 — `/flow-lite` intocado e não contradito** _(Comando de uma vez só na §8, não `*.test.js`)_
  - Then `git diff --quiet <BASE> -- commands/flow-lite.md skills/flow-lite/` sai 0
  - And, por inspeção registrada na §8, nenhum texto novo de `flow.md`, `code-review.md` ou das docs atribui ao `/flow-lite` faixa, status por fase, teto, verificação adversarial ou UX, nem afirma algo que contradiga `commands/flow-lite.md:5-6` ("less volume with more rigor")
  - _Moves GOAL metric?_ não.

- [ ] **AC-25 — Orçamento de tamanho decidido no PLAN, nunca afrouxado em silêncio** _(Teste + §5)_
  - Given o teto de `test/flow-pretriagem.test.js:115-116` (470 linhas / 33.000 bytes) e a folga de 202 bytes na base `7847b04`
  - Then o T9 continua verde
  - And, se `BUDGET_MAX_LINES`/`BUDGET_MAX_BYTES` mudarem, a §5 registra o número novo, o tamanho medido do `flow.md` e o motivo, e o diff do teste cita a §5 da 006
  - And, se parte do texto sair do `flow.md` (ex.: para arquivo carregado sob demanda), os testes da 006 leem o arquivo onde a regra passou a viver, e o `flow.md` aponta para ele
  - _Moves GOAL metric?_ não — guarda de custo fixo por invocação.

- [ ] **AC-26 — As 6 capacidades fixadas por teste determinístico** _(Teste + comando na §8)_
  - Then existe ao menos um `test/*.test.js` por capacidade (C1–C6), no molde de `test/flow-pretriagem.test.js`:
    - lê `commands/flow.md` / `commands/code-review.md` com seam por variável de ambiente;
    - literais pinados;
    - nenhuma chamada a `git`;
    - um `test()` por AC, nomeado com o AC.
  - And `node --test` passa inteiro na branch
  - And a §8 registra, para cada teste de AC, a PROVA DE RED **desta** demanda na forma do AC-07: comando com o seam apontando para o arquivo da BASE, sha da BASE e saída vermelha
  - _Moves GOAL metric?_ **sim** — é a métrica primária (baseline 0/6 → alvo 6/6).

- [ ] **AC-27 — Idioma conforme `guidelines.md:27-29`** _(Teste)_
  - Then o texto instrucional novo em `commands/flow.md` e `commands/code-review.md` está em inglês, sem diacrítico PT fora de citações de campos
  - And campos do template do `task.md`, rótulos de status e seções do relatório que o usuário lê estão em PT-BR
  - And as docs (`README.md`, `docs/`) estão em PT-BR, com jargão técnico em inglês
  - _Moves GOAL metric?_ não.

**Rastreio ao GOAL:**

| Parte da métrica | AC |
|---|---|
| C1 | AC-01, AC-02, AC-03, AC-05 |
| C2 | AC-07 |
| C3 | AC-09, AC-10 |
| C4 | AC-11 |
| C5 | AC-13, AC-14, AC-15 |
| C6 | AC-17, AC-18, AC-19, AC-20 |
| Outcome ≤ 4 subagents, 8 fases colapsadas | AC-02, AC-03, AC-20 |
| Fixação por teste (6/6) | AC-26 |

## 4. Out of scope
- **Medir o custo real de flows** (tokens/US$ da faixa trivial versus a padrão). Fica como leading indicator pós-merge: a primeira demanda trivial rodada pela faixa nova, com subagents contados e custo medido pela `session-cost`.
- **Mudar agents** (`agents/*.md`): nenhuma description, frontmatter ou corpo de agent muda, inclusive `ux-designer-web`, `ux-designer-mobile` e `senior-product-designer`. O verificador adversarial da C5 e a lente de UX da C6 usam agents existentes.
- **BUILD e revisão de código Dart/Flutter por stack**: o `flutter-dart-engineer` é da demanda 002 e não existe na `main`. A C6 só chama o UX.
- **Mudar o `/flow-lite`** (`commands/flow-lite.md`, `skills/flow-lite/`), inclusive levar para lá faixa, status, teto, verificação adversarial ou UX.
- **Levar C1–C4 e C6 para `/feature-flow` e `/bug-flow`**: a matriz do `/bug-flow` em `docs/FLOWS.md` fica como está.
- **Paralelismo com worktrees** e **plano "Patterns to Mirror"** (ideias do ecc não escolhidas no discovery).
- **Mudar a TRIAGE**: rubrica, cálculo da NOTA, corte e ramificações da Phase 0.5 ficam como estão.
- **Telemetria de uso do `/flow`** (ROADMAP item 7) e medição automática de frequência de mudança trivial.
- **Regenerar os PNG/PDF de `docs/flows/`**, salvo se o PLAN mudar a enumeração canônica de fases (o AC-23 proíbe).
- **Harness que executa o orquestrador**: a prova continua sendo predicado sobre o texto dos commands.

## 5. Implementation guide _(PLAN — Architect)_

### 5.1 BASE e medições de partida

- **BASE = `d78e998`** (`origin/main` no PLAN, merge do PR #26). `commands/flow.md` e `commands/code-review.md` têm o mesmo blob em `d78e998`, `4e9cdc6` e `HEAD` (`5ad4952…` e `f7d66ac…`, conferidos com `git rev-parse <ref>:<path>`). A PROVA DE RED desta demanda usa `git show d78e998:<path>`.
- **Exceção do AC-24.** A branch está empilhada sobre a 004, ainda não mergeada, e a 004 altera `commands/flow-lite.md`. `git diff --quiet d78e998 -- commands/flow-lite.md` sai **1** sem que a 006 tenha tocado nada. O AC-24 compara contra **`4e9cdc6`** (pai do primeiro commit da 006, `7847b04`). Se a 006 for rebaseada depois do merge da 004, a §8 regrava o ref com o novo pai do primeiro commit da 006.
- **Tamanho medido:** `flow.md` 32.798 bytes / 449 linhas (folga de 202 bytes no T9); `code-review.md` 10.267 bytes. Seções do `flow.md` que pesam: protocolo de peer (`## Peer sessions …` até antes de `## Phase chain`, linhas 39–150) = **9.165 bytes**, sha256 `e8f907c4a49852085c382ff2149a5b84fb165cd32ebe4af7924e2ea1697e82ad` (bloco com `trimEnd()`); TRIAGE 3.740 bytes (pinada pela 003, intocável); Cost accounting 2.206 bytes.

### 5.2 Decisões

**D1 — Orçamento do `flow.md`: relocar o texto condicional para uma skill inerte lida sob demanda.** O orçamento do T9 (470 / 33.000) **não muda**.

As seis capacidades pedem ~7,2 KB de texto que precisa ficar sempre carregado: gates, template, retomada e teto. Somam ainda ~2,8 KB de playbook da faixa trivial, que só é lido quando a faixa é escolhida.

| Opção | `flow.md` depois | Bytes por `/flow` padrão sem peer | Custo / risco |
|---|---|---|---|
| **(a) Relocar o protocolo de peer (9.165 B, verbatim) e o playbook da faixa trivial para `skills/flow-playbook/`**; no `flow.md` ficam gatilho, critério e gate | **~31.000 B / ~410 linhas** | **~31.000 (−5%)** | Artefato novo no manifest; dependência de leitura de arquivo em runtime (fail-closed abaixo); precisa do aval do lead para a regra `business.md` "Novas skills vêm do ROADMAP item 8.1" |
| (b) Ampliar o teto | ~42.800 B / ~545 linhas → teto **43.500 / 560** | ~42.800 (**+30%**) | Seria a **segunda ampliação** do teto (31.875 → 33.000 → 43.500), paga em toda invocação, inclusive nas triviais que a C1 quer baratear |
| (c) Enxugar o texto existente | ~36–38 KB (a TRIAGE é pinada; sobram a racional do protocolo de peer e o Cost accounting, ~4–6 KB) | ~37.000 (+13%) | **Não fecha sozinha.** Continua acima de 33.000 e exigiria (b) junto. Reescrever sem teste a racional do protocolo de peer, que é carga útil do prompt, arrisca perder regra |

**Recomendação: (a).** É a única que não aumenta o custo fixo e sai mais barata que hoje no caso comum, sem peer. Não reescreve nenhuma regra: o protocolo de peer muda de lugar byte a byte, e um sha pinado prova isso. O precedente já existe: o `flow.md` depende de `~/.claude/skills/session-cost/scripts/` (`:21`, `:274`) e o `/flow-lite` depende de duas skills (`README.md:278`).

Critério do corte: **fica no `flow.md` o que vale em toda execução** (gates, template, retomada, teto, critério de entrada da faixa, exclusão por superfície sensível). **Vai para o playbook o que só vale num ramo condicional**: o protocolo de peer, lido só quando o `ListAgents` mostra um peer num repo afetado, e a execução colapsada da faixa trivial, lida só depois de a faixa ser escolhida.

- **Forma da skill:** `skills/flow-playbook/` com `SKILL.md` stub (frontmatter `name: flow-playbook`, `description` em PT-BR, `disable-model-invocation: true`, `user-invocable: false`), `peers.md` e `trivial-lane.md`. O nome não colide com `/flow` nem com comando nativo. Com as duas flags não há slash command novo (AC-23) nem descrição carregada em toda sessão.
- **Fail-closed da leitura:** `trivial-lane.md` ilegível → faixa padrão, com "faixa trivial indisponível: playbook ausente" na §0. `peers.md` ilegível → nenhum peer consultado, e a §9 registra o motivo. Peer nunca é gate (`flow.md:145`), então degradar para silêncio é o comportamento que já existe.
- **Restrição herdada da 003:** o AC-07 de `test/flow-pretriagem.test.js:460-475` varre `skills/**/*.md` procurando `/Phase 0\.5|pré-triagem|TRIAGE \(Prompt clarity\)/i`. O playbook escreve só "TRIAGE", nunca esses literais.
- **Decisão pendente do lead (bloqueia o BUILD de T3/T6):** confirmar que uma skill inerte, que só serve de veículo de distribuição do texto de um command, não é "skill nova" no sentido de `business.md` (ROADMAP 8.1). Com o aval, o SHIP emenda a regra. **Se o lead recusar, o fallback é (b), com teto de 43.500 bytes / 560 linhas**, justificado no diff do teste citando esta §5.

**D2 — Pino da Phase 4: acréscimo de uma linha, hash calculado sem ela, valor do pino inalterado.** A C2 entra como **uma linha nova** logo depois do `**Exit gate:**` da Phase 4, sem linha em branco extra, com o prefixo `**RED proof (every lane):**`. As linhas `**Exit gate:**`, `**Produces:**` e `**Then, always:**` ficam byte a byte. Em `test/flow-pretriagem.test.js`, `PHASE4_SHA256` **mantém o valor** `3563b9ee…`. A asserção passa a ser `sha256(bloco sem as linhas de PHASE4_ADDITIONS) === PHASE4_SHA256`, e cada acréscimo tem de aparecer exatamente uma vez. É o mesmo idioma do `DEFINE_INPUTS_ADDITION` (`:66-68`, `:375-381`): tirando o acréscimo, o texto volta ao da BASE. As asserções `:337-346` não mudam. O diff do teste leva um comentário citando "006 §5 D2". Esse comentário é a justificativa explícita que `code-review.md:164` exige. Nada fica mais frouxo: continua provado que o bloco da BASE está intacto, e agora o acréscimo também fica pinado (AC-08).

**D3 — PROVA DE RED só na forma (ii): ref sem a mudança + comando + trecho da saída vermelha.** O PLAN restringe a uma forma, como o AC-07 permite.

| | (i) commit do teste antes do fix | **(ii) registro do run RED na §8** |
|---|---|---|
| Modelo de commit do `/flow` | Conflita: o `/flow` commita no SHIP via `/smart-commit` (`flow.md:261`), e o BUILD teria de commitar no meio | Compatível: nada muda no fluxo de commit |
| Squash merge / rebase | O sha some da `main` (fica só em `refs/pull/N`) ou muda no rebase | O ref citado é a BASE, que já está na `main` e sobrevive |
| Git log | Commits "test: red" poluem o histórico | Limpo |
| Terceiro reproduz? | Sim, enquanto o sha existir | Sim: `git show <BASE>:<path>` + seam (conteúdo), ou `git worktree add <tmp> <BASE>` + arquivo de teste da branch (código) |

A linha nova da Phase 4 exige, **por AC**: ref sem a mudança (sha alcançável da `main`), o comando exato e o trecho da saída vermelha que **nomeia o teste**. AC sem esse registro deixa o gate **não verde**. A coluna da §8 do template passa a ser `Prova de RED (ref · comando · saída)`.

**D4 — Status por fase: tabela na §0 com coluna de evidência; retomada como passo 0 do pre-flight.** A tabela (literal na 5.3) tem 9 linhas fixas e uma coluna **Evidência**, que aponta seção, arquivo ou relatório. Com isso o fail-closed do AC-10 vira regra única, sem mapear fase a seção: **`concluída` com Evidência vazia, ou apontando para seção vazia, conta como não concluída**. Isso cobre BUILD e REVIEW, que não têm seção própria no `task.md`.

A retomada vira o passo `0. **Resume, never restart.**` do pre-flight. Ela dispara quando `$ARGUMENTS` nomeia uma demanda existente (`NNN` ou `docs/todo/NNN-*/`). Nesse caso o pre-flight:
- pula os passos 3 e 3b (não aloca `NNN`, não recarimba o `Início`);
- retoma na primeira linha cujo status não é `concluída`;
- volta para `pendente` as fases a jusante quando há loop-back.

A frase de fronteira do custo de flow retomado (AC-10, `business.md:49`) entra no Cost accounting. A regra "atualize o status ao passar pelo gate, com a data" entra uma vez na abertura de `## Phase chain`, não repetida por fase, para economizar bytes.

**D5 — `/code-review`: `INCOMPLETE`, verificação com no máximo 2 despachos e modo de revisor único.**
- **Lente faltante:** o Step 4 ganha o item de classificação (falhou / timeout / sem linha `verdict:` válida). O veredito geral segue a precedência `CHANGES REQUESTED` > **`INCOMPLETE`** > `NEEDS DISCUSSION` > `APPROVED WITH COMMENTS` > `APPROVED`. Qualquer lente faltante impede os dois aprovados. O relatório ganha `## Lentes faltantes`, com `- <reviewer>: <falhou|timeout|saída fora do formato>` ou `nenhuma`. A regra vale também para "todos faltaram" e para o caminho cosmético de `:58`.
- **Verificação adversarial:** vira o item 7 do Step 4, sem renumerar o Step 5 (citado em `:69` e pelo AC-13). O despacho é feito depois do dedupe:

| Despacho | Despachos extras | Competência | Risco |
|---|---|---|---|
| 1 verificador por achado | = nº de BLOCKER+WARNING (sem teto) | Alta | Pode passar do dobro do custo da revisão |
| 1 por lente que levantou achado | ≤ 6 | Alta | Até 2× no pior caso |
| **1 `security-specialist` novo para achados de categoria Security + 1 `system-architect` novo para o resto, em paralelo** | **≤ 2, zero quando não há BLOCKER/WARNING** | Boa: segurança fica com o especialista | Refutação indevida fora de segurança. Mitigação: refutar exige `path:line`, e o refutado aparece em `## Achados refutados` para o humano ver |

  **Escolha: a terceira.** O custo tem teto fixo, o que atende a premissa #4 da discovery. Cada achado sai `confirmado | refutado | inconclusivo`. Achado ausente da saída do verificador, falha ou saída ilegível → **mantido com a severidade original**. A verificação nunca rebaixa severidade. O BLOCKER de `:164` só é refutado com a justificativa explícita no diff.
- **Faixa trivial × `:56`:** o `/code-review` ganha o **modo revisor único** (`--single-reviewer <agent>` em `$ARGUMENTS`), porque o despacho direto pelo `/flow` duplicaria no `flow.md` a agregação, o fail-closed e a verificação (bytes a mais e duas fontes de verdade). A linha `:56` ganha, por acréscimo, a exceção "except in single-reviewer mode, used by `/flow`'s trivial lane, where the VERIFY security gate covers the security lens". Nesse modo o Step 2 é pulado e os Steps 3–5 valem inteiros (lente faltante → `INCOMPLETE`). O relatório imprime `**Modo:** revisor único (faixa trivial do /flow) — lente de segurança coberta pelo security gate da VERIFY`, então um uso manual para fugir da lente de segurança fica visível.

**D6 — UX: critério por caminho com fail-closed; o architect decide e o orquestrador confere no gate.**
- **Gatilho objetivo:** o plano toca um arquivo de UI, isto é, `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.html`, `*.css`, `*.scss`, `*.less`, `*.dart`, arquivo de tema/tokens/estilo, asset de imagem/fonte ou arquivo de strings/copy exibida. **Dispara por padrão.** Para não disparar, a §5 cita, **por arquivo**, por que o render não muda (hook, chamada de API, tipagem, refatoração), com `path:line`. Sem citação, o UX dispara (AC-17, AC-20).
- **Roteamento fixo:** web (React/Vue/Svelte/HTML/CSS fora de RN) → `ux-designer-web`; `*.dart`, React Native (`package.json` com `react-native`) ou UI nativa → `ux-designer-mobile`; as duas plataformas → os dois.
- **Quem decide:** o `system-architect` preenche o campo `**UX:**` da §5 no PLAN, e o orquestrador confere no exit gate da Phase 2 (bullet aditivo). Na faixa trivial, quem escreve o campo é o orquestrador, na seção colapsada, e não há consulta no PLAN (AC-18). O UX entra como revisor único na REVIEW.
- **`code-review.md:51`:** a linha UI/UX vira duas, `**UI visible — web**` → `ux-designer-web` e `**UI visible — mobile**` → `ux-designer-mobile`, com os mesmos globs, prompt de UX + a11y e a frase de não-gatilho. O `senior-product-designer` fica com **copy/microcopy ou fluxo de produto sem mudança visual**, e só quando nenhuma lente de UX de plataforma disparou. Assim não há lente dupla no mesmo diff, e o teto de 6 (`:59`) continua valendo.

**D7 — Faixa trivial com 4 obrigatórios.** `project-memory-keeper` (carga, no pre-flight, antes de a faixa ser conhecida) + **dev da stack** (BUILD, escreve também o teste que prova a mudança) + **`security-specialist`** (security gate da VERIFY) + **1 revisor** (`/code-review --single-reviewer`) = **4**.

O revisor único é o agent de UX da plataforma quando há UI VISÍVEL. Sem UI, é a lente do Step 2 que o arquivo de produção dispara; se nenhuma dispara, uma instância nova do agent de stack do BUILD. **Nunca `system-architect` nem `senior-product-owner`** (AC-03).

A VERIFY trivial não despacha agent de QA. O orquestrador roda os testes e registra a PROVA DE RED, e o gate é o mesmo. Ficam **condicionais, fora da conta**: sync de memória no SHIP (só quando a mudança altera regra ou padrão gravado; senão a §10 registra "nada a sincronizar: <citação>"), a verificação adversarial da D5 e os re-despachos de loop.

**D8 — A faixa é decidida no pre-flight, antes da GOAL (emenda do VERIFY, passagem 2, `7933abd`).** O verificador independente mostrou que decidir a faixa "depois da TRIAGE e antes do DEFINE" era inexecutável: a Phase 0 já teria rodado `/discovery`, que delega a PO e architect, os dois que a faixa trivial exclui. A avaliação F1–F5 passa ao pre-flight, a partir do pedido e do diff previsto. A TRIAGE continua rodando sempre e, **abaixo do corte, tira a demanda da faixa** (`11dbf71`, item 9). Consequência aceita: a faixa é decidida antes de a clareza do pedido ser medida, e a TRIAGE é a trava de saída.

**Emenda à D5 (REVIEW, passagem 3).** A refutação de um BLOCKER de segurança pede a concordância de quem o levantou (qualquer "raised by" após o dedupe), por `SendMessage`. Isso é uma rodada além do teto de ≤ 2 despachos. Sem esse revisor ou sem resposta, o BLOCKER fica. O recálculo só converte `CHANGES_REQUESTED` quando havia ao menos um BLOCKER e todos foram refutados.

### 5.3 Literais pinados (os testes pinam exatamente estes)

| Onde | Literal |
|---|---|
| `flow.md` | heading `## Trivial lane (a mode, not a phase)`, depois de `### Cost accounting` e antes do template; frases `An uncited criterion counts as not met`, `A sensitive surface excludes the trivial lane, always`, `The security gate runs in every lane` |
| `flow.md` pre-flight | `0. **Resume, never restart.**`; ponteiros `~/.claude/skills/flow-playbook/peers.md` e `~/.claude/skills/flow-playbook/trivial-lane.md` |
| `flow.md` Phase 4 | linha nova com prefixo `**RED proof (every lane):**` (D2) |
| `flow.md` Phase 5 | ``**Exit gate:** no BLOCKERs; no missing lens (verdict `INCOMPLETE` is not green, in every lane).``: a BASE `**Exit gate:** no BLOCKERs.` volta ao remover `; no missing lens (…)` |
| `flow.md` Phase 2 | bullet aditivo `- **UX consult recorded** in §5 when the UX trigger fired.` |
| `flow.md` Rules | `- **Pass ceiling: 3 per gate.**` (VERIFY e REVIEW; na 3ª passagem sem verde: para, status `bloqueada`, escala com achado + 3 tentativas + o que mudou; volta a PLAN ou antes zera a contagem; `NEEDS DISCUSSION` não conta; `:418` segue valendo; estourar nunca avança, nunca faz SHIP, nunca marca verde) |
| Template §0 | `**Faixa:** <padrão\|trivial> — decidida no pre-flight, antes da GOAL` (D8) + `- F1 Produção ≤ 1 arquivo: <citação>` … `- F5 ADR nenhum: <citação>` (prefixo `F`, e não `A`, para não casar com o regex `^- A\d+ \w+ <n>:` do AC-02 da 003) |
| Template §0 | `**Status por fase:**` + `\| Fase \| Status \| Data \| Evidência \|` + 9 linhas (`GOAL`, `TRIAGE`, `DEFINE`, `PLAN`, `2.5`, `BUILD`, `VERIFY`, `REVIEW`, `SHIP`) + `_Status: pendente · em andamento · concluída · bloqueada · não se aplica (só 2.5)_` |
| Template §5 | `**UX:** <dispara\|não dispara> — <telas/componentes (path)> \| <por que nada visível muda (path:line)>` e `**UX consult:** <ux-designer-web\|ux-designer-mobile> — fluxo · estados (vazio/erro/carregando) · a11y` |
| Template §8 | `\| AC \| Test file \| Prova de RED (ref · comando · saída) \| Status \|` e `**Passagens:**` + `\| Gate \| n/3 \| Achado \| O que mudou \|` |
| Outputs | por fase: `  Faixa: <padrão\|trivial> · Status: <status> · Passagem: <n>/3`; final: `  Faixa:     <padrão\|trivial>`; marcador de fase colapsada `◇`; legend acrescida de `◇ collapsed (trivial lane)`; `➖` continua só na `SEC` |
| `code-review.md` | `INCOMPLETE`; `## Lentes faltantes`; `**Adversarial verification (BLOCKER/WARNING only).**`; `confirmado \| refutado \| inconclusivo`; `## Achados refutados`; `--single-reviewer <agent>`; `**Modo:** revisor único`; linhas `**UI visible — web**` / `**UI visible — mobile**` |

Texto instrucional em inglês, sem diacrítico. Campos de template e rótulos lidos pelo usuário em PT-BR (AC-27).

### 5.4 Componentes, contratos e fluxo

**Components touched:**
- `commands/flow.md`
- `commands/code-review.md`
- `skills/flow-playbook/{SKILL.md,peers.md,trivial-lane.md}` (novo)
- `manifest.json` (regen `--bump=minor`)
- `test/flow-pretriagem.test.js` (só o D2)
- testes novos (T1)
- `README.md`, `docs/USAGE.md`, `docs/FLOWS.md`

Nenhum agent, script ou CLI muda.

**New contracts:** nenhum contrato de runtime. Os contratos de texto são o schema da §0 (Faixa, F1–F5, Status por fase) e da §8 (Prova de RED, Passagens), lidos entre fases como a pré-triagem (`guidelines.md` §Triage protocol), e o argumento `--single-reviewer` do `/code-review`.

**Data flow:**
1. Pre-flight: carga de memória, depois `0. Resume` (se a demanda existe) ou alocação.
2. GOAL e TRIAGE.
3. Decisão de faixa com F1–F5 citados, registrada antes do DEFINE. Se for trivial, lê `trivial-lane.md`.
4. A cadeia segue. Cada gate atualiza o Status e, na VERIFY e na REVIEW, as Passagens.
5. REVIEW: `/code-review`, que agrega as lentes, marca as faltantes e verifica BLOCKER/WARNING (≤ 2 despachos) antes do relatório.
6. O veredito `INCOMPLETE` segura o exit gate da Phase 5.

**NFR impact:** só custo de contexto, na 5.5. Latência da REVIEW: +1 rodada paralela (≤ 2 agents) só quando há BLOCKER/WARNING.

**Does NFR impact the GOAL metric?** Não. A meta de ≤ 4 subagents na faixa trivial conta obrigatórios, e a verificação é condicional. A (a) reduz o custo fixo por invocação.

**Contrato de texto `/code-review` × `task.md` (achado do REVIEW).** O modo `--single-reviewer` lê do `task.md` da demanda o campo **Faixa** e a linha da VERIFY na tabela de status com evidência verde (`APPROVE`/`APPROVE WITH MITIGATIONS`). `task.md` ausente ou ilegível anula a flag e roda o modo completo. Mudar esses literais no template do `/flow` exige mudar o `/code-review` junto; os testes pinam os dois lados.

### 5.5 Performance: bytes carregados por invocação

NOTA 6/10, abaixo do corte, então o bloco não é obrigatório. Fica registrado porque o custo real desta demanda é contexto. Os números da coluna "Depois" são **orçamento**, não medição. A §8 mede com `wc -c` no fim do BUILD.

| Cenário | Hoje | Depois, com (a) | Depois, com (b) |
|---|---:|---:|---:|
| `/flow` faixa padrão, sem peer (caso comum) | 32.798 | **≤ 31.500** | ~42.800 |
| `/flow` faixa trivial, sem peer | 32.798 (não existe) | ≤ 31.500 + ≤ 3.500 (`trivial-lane.md`) = **≤ 35.000** | ~42.800 |
| `/flow` com peer num repo afetado | 32.798 | ≤ 31.500 + ~9.400 (`peers.md`) = **≤ 40.900** | ~42.800 |
| `/code-review` (e REVIEW do `/flow`) | 10.267 | **≤ 13.500** | ≤ 13.500 |

Orçamentos que os testes da 006 impõem como **guarda, não AC**, no molde do T9: `trivial-lane.md` ≤ 3.500 bytes e `code-review.md` ≤ 13.500 bytes. O `flow.md` continua sob o T9 da 003, que não muda (470 / 33.000). A meta interna do PLAN é ≤ 31.500, deixando 1.500 bytes de folga para a próxima demanda.

### 5.6 Tarefas atômicas (ordenadas)

A prosa de command é o artefato, então vai para dev, e não para o orquestrador (`flow.md:416`). O texto e os testes que pinam seus literais ficam **no mesmo agent**, `nodejs-backend-architect`, escritos test-first a partir da 5.3: o modo de falha é literal divergente entre texto e teste. As docs PT-BR ficam com o `technical-writer`.

| T | O quê | AC | Depende | Quem |
|---|---|---|---|---|
| T1 | Testes primeiro, vermelhos. `test/support/flow-texts.js` expõe os seams `FLOW_MD_UNDER_TEST` (o mesmo da 003), `CODE_REVIEW_MD_UNDER_TEST` e `FLOW_PLAYBOOK_DIR_UNDER_TEST`. Um arquivo por capacidade: `flow-faixa-trivial` (AC-01…06), `flow-prova-red` (AC-07, 08), `flow-retomada` (AC-09, 10), `flow-teto` (AC-11, 12), `code-review-fail-closed` (AC-13…16), `flow-ux` (AC-17…20), mais `flow-consistencia` (AC-21, 23, 25, 27 e as guardas da 5.5). Um `test()` por AC, sem `git`. O AC-05 reusa o predicado `ESCAPE_HATCH` da 003 | AC-26 | — | `nodejs-backend-architect` |
| T2 | D2 em `test/flow-pretriagem.test.js`: `PHASE4_ADDITIONS`, hash calculado sem os acréscimos, valor do pino inalterado, comentário "006 §5 D2" | AC-08 | T1 | `nodejs-backend-architect` |
| T3 | `skills/flow-playbook/`: `SKILL.md` stub com as duas flags e `peers.md` com o bloco das linhas 39–150 **verbatim** (teste: sha `e8f907c4…` do trecho do heading ao fim, com `trimEnd()`). No `flow.md`, o bloco sai, o passo 4 do pre-flight aponta para `peers.md` com o fail-closed da D1, e `:421` deixa de dizer "see the peer rules above". Rodar `regen-manifest --bump=minor` e `validate-artifacts` | AC-25 | T1 + **aval do lead (D1)** | `nodejs-backend-architect` |
| T4 | Template: §0 (Faixa, F1–F5, Status por fase), §5 (UX, UX consult), §8 (Prova de RED, Passagens), sem renumerar seção | AC-01, 07, 09, 11, 18, 21 | T1 | `nodejs-backend-architect` |
| T5 | Pre-flight `0. Resume`, regra de status na abertura de `## Phase chain`, fronteira de custo de flow retomado no Cost accounting | AC-09, 10 | T4 | `nodejs-backend-architect` |
| T6 | `## Trivial lane (a mode, not a phase)` no `flow.md`: critério F1–F5 com citação, fail-closed, exclusão por superfície sensível sem válvula, security gate sempre, ponteiro com fail-closed. `trivial-lane.md`: forma colapsada das 8 fases, enumeração dos 4 obrigatórios e dos condicionais, saída da faixa (AC-04), revisor único (D7) | AC-01…06, 20 | T3, T4 | `nodejs-backend-architect` |
| T7 | Linha `**RED proof (every lane):**` na Phase 4 (D3) e bullet `Pass ceiling` em Rules | AC-07, 08, 11, 12 | T2, T4 | `nodejs-backend-architect` |
| T8 | Phase 2 (gatilho, roteamento e não-gatilho de UX, consulta antes do BUILD, bullet no exit gate), exit gate da Phase 5 (aditivo) e outputs | AC-14, 17, 18, 20, 21 | T4 | `nodejs-backend-architect` |
| T9 | `code-review.md`: lente faltante e `INCOMPLETE`, `## Lentes faltantes`, item 7 de verificação, `## Achados refutados`, modo revisor único e exceção aditiva em `:56`, linhas de UX web e mobile, reescopo do `senior-product-designer` | AC-13, 15, 16, 19, 20 | T1 | `nodejs-backend-architect` |
| T10 | `README.md`, `docs/USAGE.md`, `docs/FLOWS.md`: seção do `/flow` e do `/code-review`, cheat sheet, e a §Convenção anti-loop-infinito vira referência à regra do `flow.md` | AC-22, 24, 27 | T5–T9 | `technical-writer` |
| T11 | ADR-0003, "Texto condicional de command vive em skill inerte lida sob demanda" | — | T3 | `project-memory-keeper` |
| T12 | §8: PROVA DE RED por teste contra `d78e998` via seam, `git diff --quiet 4e9cdc6 -- commands/flow-lite.md skills/flow-lite/`, `node --test` inteiro, `validate-artifacts`, `wc -c` dos arquivos da 5.5 | AC-24, 26 | T1–T10 | orquestrador (VERIFY) |

**Atomic tasks (ordered):** T1 → T2 → T3 (depois do aval D1) → T4 → T5 ∥ T6 ∥ T7 ∥ T8 → T9 (independente depois do T1) → T10 → T11 → T12.

### 5.7 Trade-offs, abordagem, ADR e riscos

**Trade-offs considered:** estão na D1 (orçamento), D3 (forma da prova), D5 (despacho da verificação e revisor único em modo × despacho direto) e D6 (senior-product-designer mantido × removido).

**Recommended approach:** D1 (a) + D2–D7 como descritas acima.

**ADRs created:** **ADR-0003** (T11). É estrutural porque inaugura o padrão "command carrega em toda invocação só o que vale sempre; texto de ramo condicional mora numa skill inerte distribuída pelo mesmo manifest, lida sob demanda e com fail-closed". Esse padrão é o que a próxima demanda vai imitar ou questionar. O número 0002 está reservado pela 004 (T10 dela). Se a ordem de merge mudar, renumerar no SHIP.

**Riscos:**
1. **Aval do lead na D1** (regra ROADMAP 8.1). Sem ele, cai para (b) e o custo fixo sobe 30%.
2. **Flags do frontmatter** (`disable-model-invocation`, `user-invocable`): se a versão do Claude Code do dev ignorar alguma delas, a descrição entra na listagem (~250 B por sessão) ou aparece `/flow-playbook`. O T3 confere na doc do Claude Code antes de fechar.
3. **Leitura de `~/.claude/skills/...` pode pedir permissão** fora do cwd. Isso é degradação de UX, não de gate: negado equivale a ilegível, que já tem regra fail-closed.
4. **Desalinhamento de versão** entre `flow.md` e o playbook: os dois saem do mesmo `ahc sync` e do mesmo manifest, e o fail-closed cobre arquivo ausente.
5. **Verificador fora de segurança refuta errado:** a refutação exige `path:line`, e o achado refutado fica visível no relatório.
6. **Uso manual de `--single-reviewer`** para fugir da lente de segurança: o modo aparece no relatório. Não é gate de CI.
7. **Conflito com `business.md:56`** já está decidido pelo lead. A emenda sai no SHIP pelo `project-memory-keeper`, junto com a da regra 8.1.

**Decisão do lead (2026-09-30):** autorizada a skill inerte `skills/flow-playbook/` como exceção à regra "novas skills vêm do ROADMAP 8.1" (`business.md`) — é veículo de texto do `/flow`, não capacidade nova. Teto do `flow.md` fica em 470 linhas / 33.000 bytes. Exceção registrada no ADR-0003 (T11).

## 6. Sensitive surface _(PLAN → triggers Security)_
- [ ] Auth / AuthZ  · [ ] Secrets  · [ ] PII  · [ ] Payments
- [ ] File upload/download  · [ ] Deserialization  · [ ] Raw SQL / shell exec
- [ ] Multi-tenant isolation  · [ ] New external integration / trust boundary

Nenhuma caixa se aplica, então a Phase 2.5 não dispara. O security gate da VERIFY roda normalmente.

A mudança é texto de prompt (`commands/*.md`), Markdown de uma skill inerte, docs e testes `node:test` que só leem arquivos do repo. Não há código executável novo, credencial, dado pessoal nem chamada externa.

- **Nova fronteira de confiança?** Não. O `peers.md` e o `trivial-lane.md` chegam pelo mesmo canal e com a mesma verificação de integridade de qualquer artefato: manifest com sha256 por arquivo de skill, conferido no sync e no validator (`architecture.md:82`). O `flow.md` já lê `~/.claude/skills/session-cost/` hoje.
- **Shell exec:** nenhum comando novo é executado pelos commands. Os comandos da PROVA DE RED (`git show`, `node --test`) são evidência registrada pelo orquestrador na §8, com o mesmo perfil dos que o cabeçalho da 003 já prescreve.
- **Controle de processo, não superfície de aplicação:** o modo revisor único tira a lente de segurança do `/code-review` só na faixa trivial. A faixa exclui superfície sensível sempre (AC-05), e o security gate da VERIFY continua obrigatório (AC-06). O security gate da VERIFY deve conferir que essas duas frases saíram sem válvula de escape.

## 7. Security _(filled if section 6 has any check)_

## 8. QA plan _(VERIFY)_
**Test pyramid:** Unit (texto de command pinado): `test/flow-faixa-trivial.test.js`, `test/flow-prova-red.test.js`, `test/flow-retomada.test.js`, `test/flow-teto.test.js`, `test/code-review-fail-closed.test.js`, `test/flow-ux.test.js`, `test/flow-consistencia.test.js`, `test/flow-pretriagem.test.js` (D2), com seams `FLOW_MD_UNDER_TEST`, `CODE_REVIEW_MD_UNDER_TEST` e `FLOW_PLAYBOOK_DIR_UNDER_TEST`. Integration/E2E: não se aplica (texto de command).
**Suíte:** `node --test test/*.test.js` → **427/427** · `validate-artifacts.js --strict` 0/0 · `regen-manifest.js --check` limpo.
**GOAL metric observable?** sim — **6/6** capacidades presentes e fixadas por teste; faixa trivial com **4** subagents obrigatórios (`skills/flow-playbook/trivial-lane.md`).

**PROVA DE RED** (ref sem a mudança: `d78e998`, e playbook vazio):
```
git show d78e998:commands/flow.md > "$TMPDIR/base-flow.md"
git show d78e998:commands/code-review.md > "$TMPDIR/base-cr.md"
FLOW_MD_UNDER_TEST="$TMPDIR/base-flow.md" CODE_REVIEW_MD_UNDER_TEST="$TMPDIR/base-cr.md" \
FLOW_PLAYBOOK_DIR_UNDER_TEST="$TMPDIR/sem-playbook" node --test test/flow-faixa-trivial.test.js \
  test/flow-prova-red.test.js test/flow-retomada.test.js test/flow-teto.test.js \
  test/code-review-fail-closed.test.js test/flow-ux.test.js test/flow-consistencia.test.js
```
Saída na T1 (`cd5c28f`): `tests 26 / pass 1 / fail 25`. Só a guarda de tamanho do `code-review.md` passava, como esperado. Verificação independente: 32 mutações mínimas, nenhuma sobrevivente. Passagem 3: 14 mutações, todas vermelhas.

**Passagens (teto 3):**
| # | Origem | Achados | Commits |
|---|---|---|---|
| 1 | BUILD | T1–T9 | `cd5c28f`…`f93996f` |
| 2 | VERIFY → BUILD | 5 contradições (faixa depois do `/discovery`, sync de memória, revisor único architect, playbook ilegível no meio, veredito sem recálculo) + 3 do security gate | `7933abd`, `61d6973`, `2c40ac2` |
| 3 | REVIEW → BUILD | 15 correções: security (recálculo, concordância, evidência verde, `task.md` ilegível), arquitetura (`INCOMPLETE` no `/feature-flow` e `/bug-flow`, globs de UX iguais, UX fora do `/flow`, ADR-0003, TRIAGE tira da faixa), docs (Gate 5/6, F1–F5), testes (guardas de ordem, pinos compartilhados) | `11dbf71`, `e481c63` |

**Security gate (VERIFY):** APPROVE WITH MITIGATIONS; os 3 achados foram corrigidos na passagem 2 e revistos na 3.
**REVIEW:** 1ª rodada CHANGES REQUESTED (security, docs); arquitetura e Node APPROVED WITH COMMENTS. Confirmação após a passagem 3: security APPROVED WITH COMMENTS, docs APPROVED → **veredito final APPROVED WITH COMMENTS**, sem BLOCKER.

**Follow-ups (INFO, fora do teto de passagens):**
- `code-review.md:122` — "(as in single-reviewer mode)" é ambíguo; reescrever como "a Security BLOCKER in single-reviewer mode is never `refutado`".
- `code-review.md:123` — "WARNING its reviewer called blocking" sem critério; tratar como bloqueante todo WARNING `confirmado`/`inconclusivo` de revisor `CHANGES_REQUESTED`, ou criar marcador no formato de achado.
- Testes: pinos duplicados entre `flow-prova-red` e `support/`; recortes posicionais remanescentes.
- `session-cost`: a tabela de preços (2026-08-17) não tem `claude-opus-5-5`, e o custo sai US$ 0,0000; atualizar a tabela ou reportar "não medido" automaticamente quando o modelo não tem preço.
- Memory sync (`business.md:56` emenda da faixa trivial, exceção do `flow-playbook`) feito na passada final de documentação combinada com o lead para 004+006+007.

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
**Início:** 2026-09-30T00:20:02Z
**Fonte:** transcript (só orquestrador) — endpoint OTEL 9464 servindo outra sessão
**Comando:** `node ~/.claude/skills/session-cost/scripts/session-cost.js --since 2026-09-30T00:20:02Z`

**Custo: não medido.** A ferramenta imprimiu `TOTAL $0.0000` com o aviso "modelo sem preço na tabela, excluído do total: claude-opus-5-5": não é custo zero, é ausência de preço. 190 chamadas de API do orquestrador; **35 subagents despachados, consumo não incluído**. Total real: `/cost` nativo. (A janela começa no início da 006 e inclui o trabalho paralelo da 007 feito nesta sessão.)
