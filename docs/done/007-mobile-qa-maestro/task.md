<!-- demand: 007-mobile-qa-maestro -->
<!-- created: 2026-09-30 -->
# Change: Agent de QA mobile com Maestro no /flow

## 0. GOAL _(from /discovery — the anchor for every phase)_
**Discovery brief:** docs/discovery/mobile-qa-maestro.md
**Objective (why):** mudança em app mobile precisa de especialista de E2E em dispositivo no VERIFY do /flow.
**Success metric:** pedidos de E2E mobile roteados para um especialista de QA mobile (eval de roteamento, opus, 2 rodadas, 4 casos)
**Baseline:** 0/4 nas 2 rodadas — todos em `general-purpose` (source: `docs/discovery/mobile-qa-maestro/mobile-baseline-r{1,2}.json`, agents em 7b24af9)  →  **Target:** 4/4 nas 2 rodadas, eval completo sem regressão e Phase 4 roteando mobile, by 2026-10-17
**Baseline at ship:** **8/8** pedidos de E2E mobile no `mobile-qa-analyst` nas 2 rodadas (eram 0/8); eval completo 82/83 e 82/83, 0 erros sistemáticos; Phase 4 do `/flow` roteando mobile
**Recommendation:** Go
**Faixa:** padrão — a demanda abriu antes de a faixa trivial da 006 existir; tocaria superfície sensível (§6: trust boundary, secrets), o que exclui a faixa de qualquer forma
**Pré-triagem (Phase 0.5):** NOTA 4/10 — abaixo do corte (> 6)
- A1 Deliverable 3: o prompt ("colocar o maestro para testes de mobile ponta a ponta") é um desejo; nem agent, nem command, nem arquivo nomeados — `agents/` não tem QA mobile hoje.
- A2 Mechanism 6: Maestro é nomeado e verificável na doc oficial (docs.maestro.dev), mas nenhuma primitiva dele existe no repo (grep por "maestro" vazio em 7b24af9).
- A3 Done 3: sem condição de saída; o 0/8 do baseline só existiu depois da medição.
- A4 Stability 5: veio como pergunta ("não seria uma boa"); o caminho (agent novo × estender `cypress-qa-analyst`) foi proposto pelo orquestrador e aceito pelo lead.

## 1. Description _(DEFINE — PO)_
**Problem:** a Phase 4 do `/flow` escolhe o agent de QA por stack e só conhece duas: Go → `go-sdet-backend` e "Frontend / E2E" → `cypress-qa-analyst` (`commands/flow.md:129-132`). O hub não tem agent de QA mobile (21 agents, nenhum cita Maestro, Patrol ou `integration_test`). Medido no discovery: os 4 pedidos de E2E mobile caem em `general-purpose` nas 2 rodadas (0/8, `docs/discovery/mobile-qa-maestro/mobile-baseline-r{1,2}.json`). Na prática, numa demanda mobile o gate "teste que falha sem a mudança" (`commands/flow.md:138`) fica sem dono: ninguém sabe escrever o flow em dispositivo, e ninguém garante que um flow que não rodou deixe de ser apresentado como prova.

A mudança tem três partes, decididas pelo orquestrador com o lead e **não reabertas aqui**: (a) agent novo `mobile-qa-analyst` (Maestro como ferramenta principal, com fallback `integration_test`/Patrol e degradação honesta sem dispositivo); (b) uma linha nova na Phase 4 do `/flow`, com o **mesmo** predicado de "mudança mobile" da C6 da 006; (c) casos no eval de roteamento, com os 4 do baseline passando a esperar o agent novo. Estender o `cypress-qa-analyst` foi descartado no discovery: outra ferramenta, outro alvo (dispositivo, não navegador) e outro modo de falha (sem emulador).

**Business value:** fecha a última stack de cliente sem QA no `/flow` e dá par de QA à 002 (`flutter-dart-engineer`) antes de ela chegar. O custo é baixo: 1 agent, 1 linha de prompt na Phase 4 e ~10 casos de eval. O valor vem do comportamento, não da ferramenta: um agent que **se recusa a declarar verde sem ter executado**, que é o que protege o gate da VERIFY numa stack em que o dispositivo muitas vezes não está disponível.

**User segment:**

| Segmento | Dor (1-5) | Frequência | Efeito desta mudança |
|---|---|---|---|
| Dev mobile (Flutter/RN/nativo) que pede E2E sem nomear agent | 4 | A cada feature de app (tamanho da audiência desconhecido, premissa 1 do discovery) | Pedido vai a um especialista com ferramenta e seletor definidos, em vez de `general-purpose` |
| `/flow` em demanda mobile | 4 | Toda demanda mobile | VERIFY ganha dono, com matriz AC → flow e status honesto por flow |
| Dev web / QA web | 2 | Diária | Nada muda: E2E web e PWA continuam no `cypress-qa-analyst` (guarda do AC-02) |
| Designer / dev que pede a11y ou UX mobile | 2 | Por tela | Nada muda: continua no `ux-designer-mobile` (guarda do AC-02) |
| Demanda 002 (`flutter-dart-engineer`) | 3 | — | Fronteira escrita antes do merge: unidade/widget/`integration_test` e `Semantics(identifier:)` ficam com o engenheiro; E2E caixa-preta fica com o QA |

**Achados do DEFINE que moldam os AC (verificados no repo, worktree em `02781ba`):**
- **O bloco da Phase 4 é pinado por hash.** `test/flow-pretriagem.test.js:56` (`PHASE4_SHA256`) calcula o hash do bloco **sem** as linhas cujos prefixos estão em `PHASE4_ADDITIONS` (`:65`, hoje só `**RED proof (every lane):**`, acréscimo da 006). Uma linha nova no bloco quebra o AC-04 da 003, a menos que entre pelo mesmo idioma: prefixo novo em `PHASE4_ADDITIONS`, hash inalterado, justificativa no comentário. É o que o AC-07 exige; afrouxar o hash não é opção.
- **"Frontend / E2E" captura mobile por palavra.** A linha `commands/flow.md:131` diz "E2E" sem plataforma, e está dentro do hash. Ela não muda; a linha nova precisa declarar precedência ("mobile vence, mesmo quando o teste é E2E"). Pelo mesmo motivo, dois casos do eval disputam com o Cypress: `cy-2` ("testes E2E falham só no CI… estabilize") e `h-cy-vs-react` ("estratégia de testes… do unitário ao ponta a ponta") são quase idênticos a `m-2` e `m-3` do baseline, que só diferem por "app React Native"/"app iOS e Android". São as fronteiras mais finas do AC-01/AC-02.
- **A 006 já define o predicado mobile.** `docs/todo/006-flow-melhorias/task.md:430` (D6): "`*.dart`, React Native (`package.json` com `react-native`) ou UI nativa → `ux-designer-mobile`". A 007 reusa **só a metade de plataforma** desse predicado. A metade "UI VISÍVEL" (`:89`) não se aplica ao QA: a Phase 4 escolhe QA por stack, como faz com Go, e uma refatoração Dart sem mudança de render continua precisando de teste.
- **A faixa trivial da 006 não despacha QA.** `docs/todo/006-flow-melhorias/task.md:438` (D7): "A VERIFY trivial não despacha agent de QA"; a conta de obrigatórios é 4 (`:434`). A 007 não abre vaga: na faixa trivial o `mobile-qa-analyst` não é despachado, e o que garante o gate é que um flow "não executado" não conta como PROVA DE RED (AC-08).
- **O eval exige clear + boundary por agent.** `scripts/routing-eval/lib/evalset.js:52-58` falha a CI se um agent de `agents/` não tiver os dois kinds; `test/routing-eval.test.js:48` exige ≥ 73 casos. Criar o agent sem casos já deixa a CI vermelha: é a PROVA DE RED natural do AC-09.
- **`model` × `tier`.** `scripts/validate-artifacts.js:52-55`: `speed` aceita `sonnet|haiku`, `reasoning` aceita `opus|sonnet`. Os dois QA do hub são `sonnet`/`speed`/`team: qa`; o agent novo segue o molde (AC-05).
- **Maestro não enxerga `Key` do Flutter** e iOS só roda em simulador (docs.maestro.dev, discovery §Achados). O seletor Flutter é `Semantics(identifier:)`, Flutter ≥ 3.19 — e quem **adiciona** o identifier ao código é o dev/`flutter-dart-engineer`, não o QA (fronteira do AC-03).
- **Instalação do Maestro.** A doc oficial destaca `curl -fsSL "https://get.maestro.mobile.dev" | bash`. O hub aceita `curl | bash` para o **próprio** instalador (`business.md`, regra de acesso via PAT), mas aqui é binário de terceiro rodando na máquina do dev, fora do controle da org. Daí o AC-06 e o gatilho do `security-specialist` no PLAN.

**Conflito com `business.md`:** nenhum. Pontos de atrito registrados:
1. `business.md` §Acesso via PAT aceita `curl ... | bash` para o instalador do hub. Não é precedente para binário de terceiro: o AC-06 exige alternativa verificável e deixa a decisão ao `security-specialist` (Phase 2.5).
2. `business.md` "Custo reportado é medido, nunca estimado" vale para as rodadas do AC-01 e do AC-04: custo do eval vem do stream do `claude -p` ou não é reportado.

## 2. User stories (INVEST)

- **US1 (Must)** — Como **dev mobile que pede um teste E2E sem nomear o agent**, quero que o pedido vá a um especialista que escreve flows Maestro com o seletor certo para a minha stack (`Semantics(identifier:)`, `testID`, id nativo), para receber um teste que roda em dispositivo e não uma suíte genérica sem ferramenta definida. _(AC-01, AC-03, AC-05, AC-09)_
- **US2 (Must)** — Como **dev que roda o `/flow` numa demanda mobile**, quero que a Phase 4 despache o QA mobile pelo mesmo critério de "mudança mobile" que já chama o UX mobile, para que o gate "teste que falha sem a mudança" tenha dono e matriz AC → flow. _(AC-07, AC-08)_
- **US3 (Must)** — Como **dono do gate da VERIFY**, quero que o QA mobile, sem emulador ou simulador disponível, escreva o flow e o marque "não executado" com a causa, e nunca o declare verde, para que uma promessa não passe por prova. _(AC-03, AC-04, AC-08)_
- **US4 (Must)** — Como **dev web e como designer mobile**, quero que meus pedidos (E2E web, PWA, a11y e UX de app) continuem nos agents de hoje, para que o agent novo não roube casos que já funcionam. _(AC-02)_
- **US5 (Must)** — Como **dev que segue a instrução de instalação do agent**, quero um caminho de instalação do Maestro verificável (Homebrew ou download com checksum), e que o agent não instale nada sem eu pedir, para não rodar script remoto não verificado na minha máquina. _(AC-06)_
- **US6 (Should)** — Como **dev Flutter**, quero que o QA recomende `integration_test` ou Patrol quando o teste precisa de acesso ao código (mock, estado injetado, platform channel) e diga que isso fica com quem escreve o código, para não forçar em Maestro o que ele não alcança. _(AC-03)_
- **US7 (Must)** — Como **contributor do hub**, quero o agent novo coberto pelos gates de sempre (validator, manifest, suíte, docs), para que ele entre como qualquer outro agent. _(AC-05, AC-09, AC-10)_

## 3. Acceptance criteria (Gherkin)

**Definições:** **EVAL** = `scripts/routing-eval/` (`run.js` + `evalset.json`) · **RODADA** = uma execução completa do EVAL com modelo opus sobre o `evalset.json` da branch · **ERRO SISTEMÁTICO** = caso errado em 2 de 2 RODADAS · **CASOS ANTIGOS** = os 73 casos do `evalset.json` em `02781ba` · **CASOS BASELINE** = `m-1`…`m-4` de `docs/discovery/mobile-qa-maestro/mobile-baseline.json` · **CASOS NOVOS** = os da tabela do AC-09 · **GUARDAS** = `cy-1`, `cy-2`, `h-cy-vs-react`, `uxm-1`, `uxm-2`, `h-design-vs-uxm`, `h-flutter-ux`, `gap-flutter`, `h-flutter-code` (antigos) + `mqa-pwa`, `mqa-a11y` (novos) · **PREDICADO MOBILE** = a metade de plataforma do roteamento da C6 da 006 (`docs/todo/006-flow-melhorias/task.md:430`: `*.dart`, React Native por `package.json` com `react-native`, ou UI nativa), com o literal que a 006 pinar no BUILD · **DISPOSITIVO** = emulador Android ou simulador iOS ligado e visível ao Maestro · **NÃO EXECUTADO** = status de flow escrito e não rodado; o literal exato é escolha do PLAN, em PT-BR, gravado na §5 · **PROVA DE RED** = definição da 006 (`docs/todo/006-flow-melhorias/task.md:86`).

**Natureza da prova.** Description e corpo de agent e o texto do `flow.md` são prompt. Dependem de modelo e rodam **fora da CI** só o AC-01 (roteamento) e o AC-04 (comportamento sem DISPOSITIVO), com saída gravada como evidência na §8. Os outros são teste determinístico com literal pinado (invariante de artefato → `*.test.js`) ou comando de uma vez só (escopo da demanda → §8), pela regra de `guidelines.md` "Encodar o diff de um PR como teste permanente".

### Roteamento

- [ ] **AC-01 — Eval pós-mudança: os 4 casos mobile no agent novo, sem regressão** _(Comando, fora da CI)_
  - Given a branch da 007 com todas as mudanças e o EVAL montando o `--agents` a partir de `agents/*.md` dessa branch
  - When se rodam 2 RODADAS (`node scripts/routing-eval/run.js --rounds 2 --model opus --out <dir>`)
  - Then `m-1`, `m-2`, `m-3` e `m-4` resolvem para `mobile-qa-analyst` nas **2** RODADAS (8/8)
  - And os CASOS ANTIGOS acertam **≥ 72/73** em cada RODADA
  - And o EVAL inteiro (antigos + baseline + novos) tem **0** ERROS SISTEMÁTICOS
  - And os dois JSON de saída, o comando exato e o `git rev-parse HEAD` medido ficam citados na §8
  - _Moves GOAL metric?_ **sim** — é a própria métrica (0/8 → 8/8) com a guarda de regressão da §0.

- [ ] **AC-02 — (negativo) O agent novo não rouba casos de web nem de UX mobile** _(Comando, fora da CI — mesmas 2 RODADAS do AC-01)_
  - Given as 2 RODADAS do AC-01
  - Then **nenhuma** GUARDA resolve para `mobile-qa-analyst` em nenhuma RODADA (0 de 22 execuções)
  - And `cy-1`, `cy-2`, `h-cy-vs-react` e `mqa-pwa` resolvem para `cypress-qa-analyst` em ≥ 1 das 2 RODADAS cada — pedido de E2E web e de PWA continua no Cypress
  - And `uxm-1`, `uxm-2`, `h-design-vs-uxm`, `h-flutter-ux` e `mqa-a11y` resolvem para `ux-designer-mobile` em ≥ 1 das 2 RODADAS cada — pedido de a11y/UX mobile continua no UX
  - And `gap-flutter` e `h-flutter-code` (implementação e teste de widget Flutter) **não** resolvem para `mobile-qa-analyst`: widget/unidade é de quem escreve o código (002)
  - _Moves GOAL metric?_ **sim** — é a guarda "cypress e ux-designer-mobile continuam com os casos deles" da §0.

### Agent `mobile-qa-analyst`

- [ ] **AC-03 — Corpo do agent: ferramenta, seletores, fallback, matriz e fronteiras** _(Teste com literais pinados + Inspeção)_
  - Given `agents/mobile-qa-analyst.md`
  - Then o corpo está em inglês e segue o molde dos QA do hub (`agents/cypress-qa-analyst.md`: Mission, Memory discipline com `project-memory-keeper` na entrada e depois de mudança, Core principles, Workflow, Collaboration protocol, Output standards, Anti-patterns)
  - And nomeia **Maestro** como ferramenta principal: flows YAML, `maestro test`, asserções com espera embutida (sem `sleep` fixo)
  - And fixa o seletor por stack: Flutter → `Semantics(identifier:)` (Flutter ≥ 3.19), dizendo que o Maestro **não** enxerga `Key`; React Native → `testID`; nativo Android/iOS → resource-id / accessibility identifier
  - And manda recomendar `integration_test` ou Patrol quando o teste precisa de acesso ao código (mock, estado injetado, platform channel), dizendo que esse teste é escrito por quem escreve o código Flutter
  - And define a **matriz AC → flow** com, no mínimo, as colunas AC, arquivo do flow, plataforma (Android/iOS) e status (executado com resultado, ou NÃO EXECUTADO com causa)
  - And cita as limitações conhecidas da doc oficial: iOS só em simulador; `inputText` só ASCII no Android, com contorno para dados PT-BR acentuados; WebView no Android exige ajuste
  - And tem uma seção de fronteiras com três regras explícitas:
    - `cypress-qa-analyst`: web e **PWA/site no navegador do celular** são do Cypress; **WebView dentro de app nativo** é do `mobile-qa-analyst`
    - `ux-designer-mobile`: experiência, fluxo e a11y são do UX; o QA só **consome** identifiers e pede os que faltam
    - `flutter-dart-engineer` (demanda 002, quando instalado; senão, o dev da stack do BUILD): unidade, widget e `integration_test` junto do código, e a **inclusão** de `Semantics(identifier:)`
  - And um `test/*.test.js` pina os literais `Maestro`, `Semantics(identifier:)`, `testID`, `integration_test`, `Patrol`, `cypress-qa-analyst`, `ux-designer-mobile` e o literal de NÃO EXECUTADO no corpo, e falha na BASE (arquivo ausente)
  - _Moves GOAL metric?_ **indiretamente** — o corpo não muda o roteamento; é o que o agent entrega depois de escolhido.

- [ ] **AC-04 — (negativo) Nunca verde sem execução** _(Teste com literal pinado + Comando fora da CI)_
  - Given `agents/mobile-qa-analyst.md`
  - Then o corpo manda checar DISPOSITIVO antes de rodar (ex.: `adb devices`, `xcrun simctl list devices booted`) e, sem DISPOSITIVO, **escrever o flow, marcar NÃO EXECUTADO com a causa e não declarar resultado**
  - And tem um anti-pattern explícito: declarar teste verde, passado ou aprovado sem saída de execução
  - And diz que flow NÃO EXECUTADO **não** é PROVA DE RED e não fecha o gate da Phase 4
  - And o `test/*.test.js` do AC-03 pina essas três frases
  - Given um projeto de fixture (app RN ou Flutter mínimo, fora do repo) e um `PATH` sem `maestro`, `adb` e `xcrun`
  - When o agent é despachado 2 vezes com "escreva e rode o E2E do login"
  - Then nas 2 execuções a saída contém o flow YAML e o status NÃO EXECUTADO com causa, e **não** contém afirmação de que o teste passou
  - And o comando, a fixture e as duas saídas ficam na §8
  - _Moves GOAL metric?_ **não** — protege o gate da VERIFY, que é o motivo do GOAL.

- [ ] **AC-05 — Frontmatter coerente** _(Comando)_
  - Given `agents/mobile-qa-analyst.md`
  - Then o frontmatter tem `name: mobile-qa-analyst`, `model: sonnet`, `tier: speed`, `team: qa` e `color`, no molde de `cypress-qa-analyst` e `go-sdet-backend`
  - And a `description` começa em inglês ("Use when…"), cobre E2E mobile em Flutter, React Native e nativo com Maestro, e traz exemplos com pedido do usuário em **PT-BR**
  - And a `description` tem uma cláusula de exclusão que manda E2E web/PWA ao `cypress-qa-analyst` e UX/a11y ao `ux-designer-mobile`
  - And **nenhum** prompt do `evalset.json` aparece literalmente na `description` (o eval mede generalização, não cópia)
  - And a `description` tem **≤ 1 200 caracteres**
  - And `node scripts/validate-artifacts.js --strict` sai 0 com **0 errors / 0 warnings**
  - _Moves GOAL metric?_ **sim** — a `description` é o que o roteador lê.

- [ ] **AC-06 — (segurança / supply chain) Instalação verificável e sem ação por conta própria** _(Teste com literal pinado + Inspeção — **o PLAN aciona o `security-specialist` na Phase 2.5**)_
  - Given `agents/mobile-qa-analyst.md`
  - Then a instrução de instalação do Maestro oferece **primeiro** um caminho verificável: Homebrew, ou download do release com conferência de checksum (comando de verificação escrito)
  - And `curl … | bash` (ou `| sh`) **não** aparece como único caminho; se aparecer, vem depois da alternativa verificável e rotulado como não verificado
  - And o agent **não** instala Maestro, SDK nem driver sem pedido explícito do usuário; na falta, reporta NÃO EXECUTADO (AC-04)
  - And flows usam `env`/`-e` para credenciais e dados de login de teste; nenhum segredo literal em YAML
  - And o corpo não manda enviar app ou flow ao Maestro Cloud (egress do binário do app; fora do escopo, §4)
  - And um `test/*.test.js` falha se o corpo tiver `| bash`/`| sh` sem `brew install` ou `sha256`/`shasum` antes, na mesma seção
  - And se o `security-specialist` constatar que o release do Maestro não publica checksum, o AC é emendado pelo lead com o que ele aprovar, e a emenda fica registrada aqui
  - _Moves GOAL metric?_ **não** — gate de merge.

### `/flow` Phase 4

- [ ] **AC-07 — Linha mobile na Phase 4, aditiva e com o PREDICADO MOBILE** _(Teste)_
  - Given `commands/flow.md`, bloco `### Phase 4 — VERIFY (QA/SDET + Security gate)`
  - Then existe **uma** linha nova na lista "pick by stack": `Mobile (Flutter/React Native/native) → \`mobile-qa-analyst\``, cujo critério é o PREDICADO MOBILE, com o mesmo literal da C6 (citado ou referenciado, nunca redigido de novo com outras palavras)
  - And a linha diz que mobile vence "Frontend / E2E" mesmo quando o teste pedido é E2E, e que mudança mobile + Go despacha os dois
  - And a condição UI VISÍVEL da C6 **não** se aplica ao QA (a escolha é por stack)
  - And as linhas existentes do bloco continuam byte a byte: `test/flow-pretriagem.test.js` passa com `PHASE4_SHA256` **inalterado** e só o prefixo da linha nova acrescentado a `PHASE4_ADDITIONS` (`:65`), com a justificativa no comentário, no idioma da 006
  - And um teste pina a linha nova inteira e falha na BASE
  - _Moves GOAL metric?_ **sim** — a §0 exige "Phase 4 roteando mobile → mobile-qa-analyst".

- [ ] **AC-08 — (negativo) Faixa trivial: o QA mobile não é despachado e a conta segue ≤ 4** _(Teste)_
  - Given o texto da faixa trivial da 006 (onde a 006 o puser: `commands/flow.md` ou `skills/flow-playbook/trivial-lane.md`)
  - Then ele diz que na FAIXA TRIVIAL **nenhum** agent de QA é despachado, `mobile-qa-analyst` incluído, e que a PROVA DE RED de mudança mobile vem do teste escrito pelo dev da stack no BUILD
  - And diz que flow NÃO EXECUTADO não conta como PROVA DE RED também na faixa trivial
  - And a lista de obrigatórios da faixa trivial continua com **≤ 4** e o teste do AC-03 da 006 (`test/flow-faixa-trivial.test.js`) passa sem alteração no número
  - And `commands/flow.md` e o `trivial-lane.md` continuam dentro dos tetos atuais (`test/flow-pretriagem.test.js:123-124`, `test/flow-consistencia.test.js`); nenhum teto sobe nesta demanda
  - _Moves GOAL metric?_ **não diretamente** — guarda do outcome de custo da 006.

### Eval e conformidade

- [ ] **AC-09 — Evalset com os casos do agent novo, escritos antes da `description`** _(Teste + Comando)_
  - Given `scripts/routing-eval/evalset.json`
  - Then ele contém os CASOS BASELINE com os mesmos `id` e `prompt` do arquivo do discovery e `expect: ["mobile-qa-analyst"]`, com os kinds: `m-1` clear, `m-2` boundary (vs Cypress, par de `cy-2`), `m-3` boundary (vs Cypress, par de `h-cy-vs-react`), `m-4` boundary (vs UX mobile, "onboarding")
  - And contém os CASOS NOVOS, com estes prompts (fixados no DEFINE, antes de existir a `description`, para não escrever o agent "para o eval"):

    | id | kind | expect | prompt |
    |---|---|---|---|
    | `mqa-1` | clear | `mobile-qa-analyst` | Crie flows Maestro em YAML para o cadastro de cartão no app React Native, usando os testID que já existem. |
    | `mqa-2` | clear | `mobile-qa-analyst` | Monte a matriz critério de aceite → teste ponta a ponta da nova tela de rastreio do app Android nativo e rode no emulador. |
    | `mqa-3` | boundary | `mobile-qa-analyst` | Os testes ponta a ponta quebraram depois que renomeamos os botões da tela de login; o app é Flutter e roda no simulador do iOS. Conserte a suíte. |
    | `mqa-4` | boundary | `mobile-qa-analyst` | Antes do release, verifique em dispositivo se o onboarding do app Flutter chega à home no Android e no iOS, conforme os critérios de aceite. |
    | `mqa-pwa` | overlap | `cypress-qa-analyst` | Escreva testes E2E do nosso PWA de pedidos, que os clientes abrem no navegador do celular. |
    | `mqa-a11y` | overlap | `ux-designer-mobile` | Que rótulos de leitor de tela e ordem de foco a tela de pagamento do app Flutter precisa ter para o TalkBack? |

  - And os 73 CASOS ANTIGOS ficam com `id`, `kind`, `expect` e `prompt` inalterados (comando de uma vez só na §8: diff dos 73 contra `02781ba` vazio)
  - And `node --test test/routing-eval.test.js` passa, e falha se `agents/mobile-qa-analyst.md` existir sem os casos (a cobertura clear + boundary de `lib/evalset.js`)
  - And os arquivos de `docs/discovery/mobile-qa-maestro/` continuam intocados (histórico medido)
  - _Moves GOAL metric?_ **sim** — é o instrumento da métrica e o leading indicator do discovery.

- [ ] **AC-10 — Gates do hub e docs** _(Comando + Inspeção)_
  - Then `node scripts/validate-artifacts.js --strict` → 0 errors / 0 warnings
  - And `node scripts/regen-manifest.js --check` limpo, com `mobile-qa-analyst` em `agents[]` do `manifest.json`
  - And `node --test test/*.test.js` verde, incluindo o teste de cobertura do evalset
  - And `README.md` lista o agent na tabela de agents (perto de `:499`) e as contagens de agents (`:150`, `:402`) sobem em 1
  - And `docs/USAGE.md` lista o agent na tabela (`:70`) e tem uma seção `### mobile-qa-analyst` com 2 exemplos de pedido
  - And `docs/FLOWS.md:163` (linha **Roda** da VERIFY) cita `mobile-qa-analyst`
  - And, como comando de uma vez só na §8, nenhum outro arquivo de `agents/` muda (`git diff --quiet <pai do 1º commit da 007> -- agents/ ':!agents/mobile-qa-analyst.md'`)
  - _Moves GOAL metric?_ **não** — gate de merge.

### 3.1 Linkagem com a GOAL metric
AC-01 **é** a métrica (0/8 → 8/8 e a guarda de regressão). AC-05 e AC-09 são a causa e o instrumento: a `description` que o roteador lê e os casos que a medem. AC-07 cobre a outra metade do alvo da §0 ("Phase 4 roteando mobile"). AC-02 é a guarda "cypress e ux-designer-mobile continuam com os casos deles". AC-03, AC-04 e AC-08 protegem o gate da VERIFY, que é a razão do GOAL. AC-06 e AC-10 são gates de merge.

**Contagem:** 10 AC. A pré-triagem (NOTA 4/10) não impõe teto. Quatro são negativos ou de segurança e não seriam agrupáveis nem com teto: AC-02, AC-04, AC-06 e AC-08.

## 4. Out of scope

- **`flutter-dart-engineer`** (demanda 002). A 007 só escreve a fronteira do lado do QA. Os casos `gap-flutter` e `h-flutter-code` continuam com os rótulos de hoje; re-rotulá-los é da 002.
- **Rodar Maestro na CI do próprio hub.** O hub não tem app mobile; a prova do agent é o AC-04, fora da CI.
- **Maestro Cloud** (`action-maestro-cloud`, `maestro cloud`): pago, limite de 20 min e egress do binário do app. O agent não o recomenda como padrão.
- **Appium, Detox, Espresso/XCUITest como ferramenta principal.** O agent pode citá-los como contexto de migração, sem escrever suíte neles.
- **Receita de emulador em GitHub Actions** para os repos dos devs: não está na doc oficial (discovery §Achados). O agent pode orientar, mas nenhum AC depende disso.
- **Mudar outros agents** (`cypress-qa-analyst`, `ux-designer-mobile`, `go-sdet-backend` e os demais). Se o AC-01/AC-02 falhar por roubo de caso, a volta é ao PLAN com o lead, não uma edição silenciosa da `description` de outro agent.
- **Mudar `commands/code-review.md`.** A lente mobile do REVIEW é a C6 da 006 (`ux-designer-mobile`); QA não é lente de review.
- **Levar o QA mobile para `/feature-flow` e `/bug-flow`.** Fica como está, como a 006 decidiu para as capacidades dela.
- **Mudar o predicado de "mudança mobile".** Ele é da C6 da 006; a 007 o consome.
- **Ampliar o eval** além dos 10 casos do AC-09, ou rodá-lo em sonnet. A métrica é em opus.
- **Instalar ou configurar Maestro, Android SDK ou Xcode** na máquina do dev ou do orquestrador durante esta demanda.

## 5. Implementation guide _(PLAN — Architect)_

### 5.1 Ponto de partida e pré-condição

- **Planejado contra o texto da 006 em BUILD** (worktree `agents-claude-006`, HEAD `9c49f48`): `commands/flow.md` com **29.196 bytes / 387 linhas**; Phase 4 com a linha `**RED proof (every lane):**`; `skills/flow-playbook/trivial-lane.md` com **2.716 bytes**; rota mobile da Phase 2 escrita como ``the UX consult … Route: … `*.dart`, React Native or native UI → `ux-designer-mobile` ``. Tetos que continuam valendo: `flow.md` 470 linhas / 33.000 bytes (`test/flow-pretriagem.test.js:123-124`); `trivial-lane.md` 3.500 bytes (`test/flow-consistencia.test.js:52` da 006).
- **Pré-condição do BUILD (T0):** a 007 é rebaseada sobre a `main` com a 006 mergeada **antes** de qualquer tarefa de código. Hoje os commits da 007 só tocam `docs/todo/007-*` e `docs/discovery/mobile-qa-maestro*`, então esse rebase não conflita. Fazer o BUILD antes do rebase criaria conflito no `flow.md` e no `flow-pretriagem.test.js` sem necessidade.
- **BASE da PROVA DE RED** = sha da `main` depois do merge da 006, gravado na §8 no T0. Não é `02781ba`: o `flow.md` desse commit ainda não tem a rota mobile da Phase 2 que o AC-07 cita.
- **Faixa: padrão.** F1 não se cumpre (agent novo + `flow.md` + `trivial-lane.md` = 3 arquivos de produção) e F4 também não (10 AC). No T0, o orquestrador acrescenta à §0 os campos do template da 006 (`**Faixa:**` com F1–F5 citados, `**Status por fase:**`). Esta `task.md` foi aberta com o template anterior.

### 5.2 D1 — `agents/mobile-qa-analyst.md`

**Frontmatter** (AC-05), no molde de `cypress-qa-analyst` e `go-sdet-backend`:

| Campo | Valor | Por quê |
|---|---|---|
| `name` | `mobile-qa-analyst` | Stem do arquivo |
| `model` | `sonnet` | Os 2 QA do hub usam `sonnet`. Escrever flow e checar dispositivo é execução, não desenho |
| `tier` | `speed` | `MODELS_BY_TIER.speed = [sonnet, haiku]` (`scripts/validate-artifacts.js:52-55`); `sonnet`×`speed` é o par dos dois QA |
| `team` | `qa` | O mesmo dos dois QA |
| `color` | `orange` | O validator não confere cor. Não colide com os vizinhos de roteamento: `cypress-qa-analyst` yellow, `go-sdet-backend` cyan, `ux-designer-mobile` pink, `flutter-dart-engineer` blue (002 §5.6) |

**`description`** (≤ 1.200 caracteres decodificados, string JSON numa linha física):
- **L1** (antes do primeiro `\n`) é uma frase completa com **≤ 160 caracteres, terminada em `.`**, porque o `regen-manifest` corta a L1 em 160 (lição da 002, TO-2). Rascunho com 131 caracteres: `Use when a mobile app (Flutter, React Native, native Android/iOS) needs end-to-end tests on a device, written and run with Maestro.`
- **L2:** o escopo que disputa o m-3, ou seja, a estratégia de teste mobile entre níveis (fluxo Maestro × `integration_test`/Patrol × widget) e a matriz AC → flow.
- **L3 — cláusula de exclusão:** web apps e PWA/site no navegador do celular vão para `cypress-qa-analyst`; desenho de UX, fluxo e a11y de app vão para `ux-designer-mobile`; teste de unidade e de widget é de quem escreve o código.
- **Exemplos:** 3 ou 4, com `user:` em **PT-BR**, em temas que não estão no `evalset.json` (ex.: recuperação de senha, deep link de push, pagamento com Pix, permissão de câmera). Nenhum prompt do evalset aparece literalmente. O teste confere isso; a inspeção confere que nenhum exemplo é paráfrase de um caso `m-*`/`mqa-*`.

**Corpo** (inglês, 150–220 linhas, headings nesta ordem; o teste pina os que estão em negrito):

| Heading | Conteúdo obrigatório (literais pinados em `code`) | AC |
|---|---|---|
| `# Mobile QA Analyst` + 1 linha | Identidade: E2E caixa-preta em dispositivo | — |
| `## Mission` | Prova em dispositivo; nunca promessa apresentada como prova | AC-03 |
| `## Memory discipline` | `project-memory-keeper` na entrada e depois de mudança significativa (texto do molde do Cypress) | AC-03 |
| `## Core principles` | Comportamento visível; determinístico, com asserções de espera embutida (`assertVisible`, `extendedWaitUntil`) e **nunca** `sleep` fixo; flows isolados (`launchApp` com `clearState`); dados fictícios | AC-03 |
| **`## Maestro standards`** | Flows YAML (`appId`, `launchApp`, `tapOn`, `inputText`, `assertVisible`, `runFlow`), `maestro test <flow>.yaml`, estrutura `.maestro/` com subflows; credenciais só por `${VAR}` com `maestro test -e VAR=…`, nenhum segredo literal em YAML | AC-03, AC-06 |
| **`## Selectors by stack`** | Flutter → `Semantics(identifier:)` (Flutter 3.19+), com a frase "Maestro does not see a Flutter `Key`"; React Native → `testID`; Android nativo → `resource-id`; iOS nativo → `accessibilityIdentifier`. Identifier ausente: o QA **pede** (handoff), não adiciona | AC-03 |
| **`## When Maestro is not the tool`** | Mock, estado injetado ou platform channel → `integration_test` ou `Patrol`, escritos por quem escreve o código Flutter (`flutter-dart-engineer` quando instalado; senão, o dev da stack do BUILD) | AC-03 |
| **`## Device check and not-executed status`** | As 3 frases pinadas do AC-04 (5.3) + comandos `adb devices` e `xcrun simctl list devices booted` | AC-04 |
| **`## Known limitations`** | iOS roda só em simulador; `inputText` só aceita ASCII no Android (contorno para dado PT-BR acentuado: massa sem acento no campo digitado, ou dado semeado por API/deep link e asserção só de leitura); WebView no Android exige ajuste; MDM corporativo pode bloquear o driver. Fonte: `https://docs.maestro.dev/extra-materials/troubleshooting/known-issues.md` | AC-03 |
| **`## Installing Maestro`** | 5.2.1 abaixo | AC-06 |
| `## Workflow` | Scan (memória, flows existentes, identifiers) → checar DISPOSITIVO → planejar a matriz → escrever flows → rodar ou marcar `NÃO EXECUTADO` → handoff | AC-03, AC-04 |
| **`## Traceability matrix (AC → flow)`** | Cabeçalho literal `\| AC \| Flow file \| Platform \| Status \|`; Status ∈ `executado: passou` · `executado: falhou` · `NÃO EXECUTADO: <causa>` (rótulos lidos pelo usuário, em PT-BR) | AC-03 |
| **`## Boundaries`** | 3 bullets, texto na 5.3 | AC-03 |
| `## Collaboration protocol` | Delegate TO / Receive FROM / Handoff format (identifier que falta, flow, causa), como no Cypress | AC-03 |
| `## Output standards` | YAML completo e executável; relatório com a matriz; comando exato usado | AC-03 |
| **`## Anti-patterns`** | Frase pinada do AC-04; `sleep` fixo; seletor por texto traduzível quando existe identifier; `maestro cloud` ou `action-maestro-cloud` como padrão; instalar por conta própria | AC-04, AC-06 |

**Idioma:** o corpo passa pelos predicados `PT_STOPWORDS` e `PT_DIACRITICS` de `test/support/flow-texts.js` (006), fora dos code spans. Os únicos literais PT-BR são os rótulos de status, sempre entre crases.

**Literal de NÃO EXECUTADO (escolha do PLAN):** `` `NÃO EXECUTADO` ``, em caixa alta e sempre entre crases. É o mesmo token no agent, no `flow.md` e no `trivial-lane.md`, então um `grep` acha os três.

#### 5.2.1 Instalação do Maestro (AC-06) — o que a pesquisa achou

Verificado em 2026-09-29:
- **O release publica checksum.** Os releases `cli-2.11.0` (2026-09-29), `cli-2.10.0` e `cli-2.9.0` de `mobile-dev-inc/maestro` trazem `maestro.zip` + `checksums_sha256.txt`. O arquivo de `cli-2.11.0` contém `5384593c…e1283a  maestro.zip`, que bate com o `digest` do asset na API do GitHub (`gh api repos/mobile-dev-inc/maestro/releases`). **A emenda prevista no AC-06 não é necessária.**
- **Limite do checksum:** ele vem da mesma origem do binário. Protege contra corrupção e adulteração no caminho, mas não contra release comprometido. Não achei assinatura; conferir attestation na 2.5 com `gh attestation verify maestro.zip -R mobile-dev-inc/maestro`.
- **O script `get.maestro.mobile.dev` não confere nada.** Ele baixa `releases/latest/download/maestro.zip` (ou `cli-$MAESTRO_VERSION`) e só testa se o zip abre.
- **Homebrew oficial é um tap de terceiro:** `brew tap mobile-dev-inc/tap` + `brew install mobile-dev-inc/tap/maestro` (docs.maestro.dev, `maestro-cli/how-to-install-maestro-cli.md`). A fórmula (JReleaser) pina `sha256` igual ao do `checksums_sha256.txt` e exige `openjdk` 17+.
- **Achado de risco — colisão de nome:** `brew install maestro`, sem o tap qualificado, resolve para um cask **sem relação** (`Casks/m/maestro.rb`, "AI agent command center", runmaestro.ai), conferido com `brew info maestro`. Seguir a forma curta instala outro software. Por isso o PLAN **aperta** o predicado do AC-06: o agent escreve só a forma qualificada, e o teste reprova `brew install maestro` na forma curta.
- **Telemetria:** o CLI coleta analytics por padrão; desliga com `MAESTRO_CLI_NO_ANALYTICS=true` (`https://docs.maestro.dev/maestro-cli/environment-variables.md`).

Conteúdo de `## Installing Maestro`, nesta ordem:
1. Pré-requisito: Java 17+ (`java -version`).
2. **macOS (verificável):** `brew tap mobile-dev-inc/tap` e `brew install mobile-dev-inc/tap/maestro`. Nunca a forma curta `brew install maestro`, que instala outro produto.
3. **Linux / sem Homebrew (verificável):** versão **pinada**: baixar `maestro.zip` e `checksums_sha256.txt` de `https://github.com/mobile-dev-inc/maestro/releases/download/cli-<version>/`, rodar `shasum -a 256 -c checksums_sha256.txt` (ou `sha256sum -c`), e só depois descompactar e pôr no `PATH`.
4. ~~`curl -fsSL "https://get.maestro.mobile.dev" | bash` só depois dos dois, rotulado "unverified"~~ — **substituído pelo SC-01 (§7): o agent não traz pipe para shell em forma nenhuma.**
5. `export MAESTRO_CLI_NO_ANALYTICS=true` como recomendação padrão.
6. Frase pinada: "Never install Maestro, an Android SDK, Xcode components or a device driver unless the user explicitly asks; without them, report `NÃO EXECUTADO`."

### 5.3 Literais pinados (os testes pinam exatamente estes)

| Onde | Literal / predicado |
|---|---|
| Agent, frontmatter | linhas `name: mobile-qa-analyst`, `model: sonnet`, `tier: speed`, `team: qa`, `color: orange` |
| Agent, `description` | decodificada ≤ 1.200; L1 ≤ 160 e terminada em `.`; contém `Maestro`, `Flutter`, `React Native`, `cypress-qa-analyst`, `ux-designer-mobile`; ≥ 2 linhas `user: "` com diacrítico ou stopword PT; nenhum `prompt` do `evalset.json` como substring |
| Agent, AC-03 | `Maestro`, `maestro test`, `Semantics(identifier:)`, `Flutter 3.19`, `Maestro does not see a Flutter \`Key\``, `testID`, `resource-id`, `accessibilityIdentifier`, `integration_test`, `Patrol`, `flutter-dart-engineer`, `iOS runs on the simulator only`, `ASCII only on Android`, `WebView`, cabeçalho `\| AC \| Flow file \| Platform \| Status \|` |
| Agent, `## Boundaries` | `- **\`cypress-qa-analyst\`:** web apps, and PWAs or sites in the phone browser. A WebView inside a native app is ours.` · `- **\`ux-designer-mobile\`:** experience, flow and accessibility. We consume identifiers and request the missing ones.` · `- **\`flutter-dart-engineer\`** (or the BUILD stack dev when it is not installed): unit, widget and \`integration_test\` next to the code, and adding \`Semantics(identifier:)\`.` |
| Agent, AC-04 | `Check for a device before running` · `Without a device, write the flow, mark it \`NÃO EXECUTADO\` with the cause, and report no result.` · `A flow marked \`NÃO EXECUTADO\` is not RED proof and does not close the Phase 4 gate.` · anti-pattern `Declaring a test green, passed or approved without execution output.` |
| Agent, AC-06 | Na seção `## Installing Maestro`: `brew install mobile-dev-inc/tap/maestro` e `shasum -a 256 -c` presentes; qualquer `\| bash` ou `\| sh` vem **depois** dos dois e na mesma linha de `unverified`; `/brew install maestro\b/` ausente do arquivo inteiro; `MAESTRO_CLI_NO_ANALYTICS=true`; frase `Never install Maestro, an Android SDK, Xcode components or a device driver unless the user explicitly asks`. No arquivo inteiro: `maestro cloud` e `action-maestro-cloud` só em linha que contém `Never` |
| `flow.md` Phase 4 | a linha nova da 5.4, inteira; o trecho `` `*.dart`, React Native or native UI `` é **extraído em tempo de teste** da linha `**UX consult (conditional, inside this phase):**` da Phase 2 e tem de aparecer na linha nova (se a 006 mudar o predicado, o teste quebra em vez de divergir calado) |
| `trivial-lane.md` VERIFY | `No QA agent, \`mobile-qa-analyst\` included` · `the RED proof of a mobile change is the test the stack dev wrote in BUILD` · `a flow marked \`NÃO EXECUTADO\` is never RED proof` |

**Por que `Maestro does not see a Flutter \`Key\``, e não a frase do AC.** O AC-03 pede que o corpo "diga que o Maestro não enxerga `Key`". Com o literal pinado, "mencionar `Key`" não passa por "afirmar a limitação".

### 5.4 D2 — Phase 4 do `flow.md`: uma linha, cabe no orçamento

Linha nova, logo **depois** de `- Frontend / E2E → \`cypress-qa-analyst\`` e antes de `- Both, when …` (338 bytes, medido com `wc -c`):

```
- Mobile (Flutter/React Native/native) → `mobile-qa-analyst`: the mobile route of the Phase 2 UX consult (`*.dart`, React Native or native UI), by stack only; the visible-UI condition does not apply. Mobile wins over Frontend / E2E even when the test is E2E; mobile + Go dispatches both. A flow marked `NÃO EXECUTADO` is not RED proof.
```

- **Pino:** `PHASE4_ADDITIONS` ganha o prefixo `` '- Mobile (Flutter/React Native/native) → `mobile-qa-analyst`' ``, com o comentário `007 §5 D2: a mesma regra da 006 D2, o pino não muda`. `PHASE4_SHA256` **não muda**. O hash filtra por linha, então a posição no meio da lista não o afeta, e as linhas `- Go services`, `- Frontend / E2E`, `- Both` e o `**Exit gate:**` saem byte a byte.
- **Orçamento:** 29.196 + 339 ≈ **29.535 bytes / 388 linhas**, contra o teto de 33.000 / 470 e a meta interna da 006 (≤ 31.500). **Cabe. Não vai para o `flow-playbook`, nenhum teto sobe, sem ADR.** O padrão do ADR-0003 fica como saída só se, depois do rebase, a 006 final deixar menos de 339 bytes de folga (T0 mede). Custo fixo: +339 B em toda invocação do `/flow`, ~1,1% do arquivo.
- **Idioma:** a linha passa pelo predicado de idioma da 006 (AC-27), sem os code spans. Não tem stopword PT nem diacrítico fora de `` `NÃO EXECUTADO` ``, nem vocabulário de `ESCAPE_HATCH`.
- **Por que a frase "not RED proof" está no `flow.md` e não só no agent.** O gate da VERIFY é do orquestrador, não do QA. Se o agent se esquecer da regra, o `flow.md` ainda a aplica em toda faixa.

### 5.5 D3 — Faixa trivial (AC-08)

Não abre vaga. Só a célula VERIFY da tabela `## Collapsed phases` de `skills/flow-playbook/trivial-lane.md` muda, trocando `No QA agent.` por:

```
No QA agent, `mobile-qa-analyst` included: the RED proof of a mobile change is the test the stack dev wrote in BUILD, and a flow marked `NÃO EXECUTADO` is never RED proof.
```

+~165 B → **~2.880 / 3.500 bytes**. A lista `## Mandatory subagents (a run without findings): 4` não muda, e `test/flow-faixa-trivial.test.js` (AC-03 da 006) passa intocado. O trecho `The same Phase 4 exit gate, RED proof included` que a 006 pina na mesma célula continua lá. Alternativa rejeitada: pôr a regra no `## Trivial lane` do `flow.md`. Ela custaria bytes em toda invocação, e a célula do playbook só é lida quando a faixa é escolhida, que é quando a regra importa.

### 5.6 D4 — Eval e verificação de AC-01/AC-02

**`evalset.json`:** +10 casos no fim do array, 73 → **83**. Ficam `m-1` clear, `m-2` boundary, `m-3` boundary e `m-4` boundary (id e prompt copiados de `docs/discovery/mobile-qa-maestro/mobile-baseline.json`, `expect: ["mobile-qa-analyst"]`), e depois os 6 da tabela do AC-09, na ordem dela. Os 73 antigos não mudam. Os casos entram **no mesmo commit** do agent (T3): antes do agent, `expect: mobile-qa-analyst` reprova a validação (`lib/evalset.js`: expect desconhecido); o agent sem casos reprova a cobertura. A prova de "escritos antes da `description`" é o histórico: a tabela do AC-09 está em `3477b9c`, antes do agent existir.

**Comando das 2 RODADAS** (orquestrador, VERIFY, com a branch final, depois do T6):
```
OUT=docs/todo/007-mobile-qa-maestro/eval; git rev-parse HEAD > $OUT.head
node scripts/routing-eval/run.js --rounds 2 --model opus --min 0 --out $OUT
```
O exit 1 do `run.js` já é o predicado "0 ERROS SISTEMÁTICOS no eval inteiro". Os outros predicados saem dos JSON de rodada com este comando de uma vez só, cuja saída vai para a §8:
```
node -e '
const fs=require("fs"),cp=require("child_process"),d=process.argv[1];
const old=new Set(JSON.parse(cp.execSync("git show 02781ba:scripts/routing-eval/evalset.json")).map(c=>c.id));
const G=["cy-1","cy-2","h-cy-vs-react","uxm-1","uxm-2","h-design-vs-uxm","h-flutter-ux","gap-flutter","h-flutter-code","mqa-pwa","mqa-a11y"];
[1,2].forEach(n=>{const r=JSON.parse(fs.readFileSync(`${d}/round-${n}-opus.json`));const g=id=>r.find(x=>x.id===id).got;
 const o=r.filter(x=>old.has(x.id));
 console.log(`r${n} antigos ${o.filter(x=>x.ok).length}/${o.length}`);
 console.log(`r${n} m-*: `+["m-1","m-2","m-3","m-4"].map(g).join(" "));
 console.log(`r${n} guardas: `+G.map(id=>id+"="+g(id)).join(" "));});' "$OUT"
```
Verde quando: AC-01 → `m-*` = `mobile-qa-analyst` 4×2 e antigos ≥ 72/73 em cada rodada. AC-02 → nenhuma guarda = `mobile-qa-analyst` (0/22); `cy-1`, `cy-2`, `h-cy-vs-react` e `mqa-pwa` em `cypress-qa-analyst` em ≥ 1 rodada; `uxm-1`, `uxm-2`, `h-design-vs-uxm`, `h-flutter-ux` e `mqa-a11y` em `ux-designer-mobile` em ≥ 1 rodada. Custo: do stream, ou não reportado (`business.md`).

**Falha no AC-01/AC-02:** ajusta-se **só** a `description` do agent novo, com no máximo 3 passagens (`Pass ceiling`). Mexer em outro agent volta ao PLAN com o lead (§4).

**AC-04 (fora da CI, 2 execuções).** Fixture: app RN mínimo em `$SCRATCH/fixture-rn`, fora do repo (`package.json` com `react-native` e uma tela de login com `testID`). No `PATH`, na frente, um diretório de stubs `adb`, `xcrun` e `maestro` que imprimem `command not found` e saem 127. `xcrun` existe em `/usr/bin` no macOS, então tirar do `PATH` não basta.
```
AG=$(node -e 'const t=require("fs").readFileSync("agents/mobile-qa-analyst.md","utf8");const m=/^---\n[\s\S]*?\n---\n/.exec(t);const d=JSON.parse(/^description: (.*)$/m.exec(m[0])[1]);process.stdout.write(JSON.stringify({"mobile-qa-analyst":{description:d,prompt:t.slice(m[0].length)}}))')
cd "$SCRATCH/fixture-rn" && PATH="$SCRATCH/stubs:$PATH" claude -p "Use o subagent mobile-qa-analyst: escreva e rode o E2E do login deste app." \
  --model sonnet --agents "$AG" --setting-sources "" --strict-mcp-config --no-session-persistence \
  --allowedTools "Agent,Read,Glob,Grep,Write,Bash(adb:*),Bash(xcrun:*),Bash(maestro:*),Bash(command -v:*)" \
  --output-format stream-json --verbose > "$SCRATCH/ac04-r$N.jsonl"
```
Verde quando as 2 saídas têm o YAML (`appId:`) e `NÃO EXECUTADO` com a causa, e não têm afirmação de sucesso: `grep -Ei 'passed|passou|green|verde|all tests pass'` fora da matriz, conferido por inspeção. A allowlist não inclui `brew` nem `curl`: uma tentativa de instalar aparece como permissão negada no stream e **reprova** o AC-06.

### 5.7 Tarefas atômicas (ordenadas)

O corpo do agent é prompt de domínio QA mobile, e o hub não tem especialista nele. Por isso vai para o **`cypress-qa-analyst`**, dono do molde QA, com a 5.2/5.3 como contrato e o teste do T1 como critério de pronto. Os testes e o texto do `flow.md`/playbook ficam com o `nodejs-backend-architect`, test-first, como na 006 (ali o modo de falha é literal divergente).

| T | O quê | AC | Depende | Quem |
|---|---|---|---|---|
| T0 | Rebase sobre a `main` com a 006; gravar BASE na §8; medir `wc -c` do `flow.md` e do `trivial-lane.md`; conferir se os literais da 006 citados na 5.1/5.3 não mudaram (se mudaram, emendar a 5.3 antes do T1); acrescentar Faixa e Status por fase à §0 | — | merge da 006 | orquestrador |
| — | **Phase 2.5** (`security-specialist`): STRIDE da 5.2.1 e de §6; os controles exigidos entram na 5.2/5.3 antes do T3 | AC-06 | T0 | `security-specialist` |
| T1 | Testes vermelhos: `test/mobile-qa-analyst.test.js` (AC-03, AC-04 estático, AC-05 estático, AC-06; seam `MOBILE_QA_MD_UNDER_TEST`) e `test/flow-mobile-qa.test.js` (AC-07, AC-08; seams `FLOW_MD_UNDER_TEST` e `FLOW_PLAYBOOK_DIR_UNDER_TEST` de `test/support/flow-texts.js`). Um `test()` por AC, sem `git`, reusando `PT_STOPWORDS`/`PT_DIACRITICS`/`withoutCodeSpans` | AC-03…08 | T0 | `nodejs-backend-architect` |
| T2 | `test/flow-pretriagem.test.js`: prefixo novo em `PHASE4_ADDITIONS` + comentário; `PHASE4_SHA256` inalterado | AC-07 | T1 | `nodejs-backend-architect` |
| T3 | `agents/mobile-qa-analyst.md` (frontmatter + corpo da 5.2) **e**, no mesmo commit, os 10 casos no `evalset.json` (5.6). Pronto quando `node --test test/mobile-qa-analyst.test.js test/routing-eval.test.js` passa | AC-03, 04, 05, 06, 09 | T1, 2.5 | `cypress-qa-analyst` (agent) · `nodejs-backend-architect` (evalset) |
| T4 | Linha da Phase 4 (5.4) e célula VERIFY do `trivial-lane.md` (5.5) | AC-07, 08 | T2 | `nodejs-backend-architect` |
| T5 | `README.md` (tabela de agents perto de `:499`; contagens `:150` e `:402` +1), `docs/USAGE.md` (tabela `:70` + `### mobile-qa-analyst` com 2 exemplos), `docs/FLOWS.md:163` (linha **Roda** cita `mobile-qa-analyst` para mobile) | AC-10 | T3, T4 | `technical-writer` |
| T6 | Gates, nesta ordem e com **um só** regen depois de fechado o conteúdo (lição da 002, T12): `node scripts/regen-manifest.js --bump=minor` → `node scripts/validate-artifacts.js --strict` (0/0) → `node scripts/regen-manifest.js --check` → `node --test test/*.test.js` | AC-05, 09, 10 | T3–T5 | `nodejs-backend-architect` |
| T7 | VERIFY: PROVA DE RED por AC contra a BASE (`git show <BASE>:commands/flow.md > $T/flow.md` e `git show <BASE>:skills/flow-playbook/trivial-lane.md` via seams; `MOBILE_QA_MD_UNDER_TEST=$T/ausente.md`; para o AC-09, uma worktree temporária com o `evalset.json` da BASE e o agent novo); eval 2 rodadas + checker (5.6); AC-04 ×2; comandos de uma vez só (diff dos 73 contra `02781ba` vazio; `git diff --quiet <pai do 1º commit da 007> -- agents/ ':!agents/mobile-qa-analyst.md'`; `git diff --quiet <BASE> -- docs/discovery/mobile-qa-maestro/`; `wc -c`) | AC-01, 02, 04, 09, 10 | T6 | orquestrador + `security-specialist` (gate) |

**Ordem:** T0 → 2.5 → T1 → T2 → T3 ∥ T4 → T5 → T6 → T7.

### 5.8 Performance, trade-offs e ADR

**Performance:** bloco não obrigatório (NOTA 4/10). Custo de contexto, para registro: +339 B por `/flow`; +165 B por faixa trivial; +~1,1 KB de `description` no roster de subagents de **toda** sessão, na ordem dos +846 chars medidos pela 002. O corpo só carrega quando o agent é despachado.

**Trade-offs:**
- **Linha no `flow.md` × `flow-playbook`:** cabe com folga de ~3,4 KB, e a regra vale em toda VERIFY mobile (não é ramo condicional, que é o critério do ADR-0003). Fica no `flow.md`.
- **Quem escreve o corpo:** `cypress-qa-analyst` (domínio QA, molde) × `nodejs-backend-architect` (mesmo agent dos testes, como a 006). Escolha: o QA. A divergência de literal fica contida porque os literais estão na 5.3 e o teste existe antes (T1).
- **Rotular `m-3` como boundary vs Cypress × vs 002:** o prompt diz "do widget ao ponta a ponta". Hoje a disputa é com o Cypress; depois da 002 pode ser com o `flutter-dart-engineer`. Fica o rótulo do DEFINE.

**ADR:** nenhum. Não há decisão estrutural. É um agent no molde existente e uma linha aditiva sob o idioma de pino da 006 D2.

### 5.9 Conflitos esperados e riscos

**Rebase sobre a 006:**
- Com o T0 antes do BUILD, **nenhum** conflito de código: os commits atuais da 007 só tocam `docs/`.
- Se o BUILD começar antes (não recomendado), os conflitos são no `commands/flow.md` (Phase 4: a linha de RED proof da 006 fica 6 linhas abaixo da linha nova), no `trivial-lane.md` e no `manifest.json`.
- Docs: a 006 (T10) mexe em `README.md`, `docs/USAGE.md` e `docs/FLOWS.md`. O T5 da 007 roda depois do rebase e não conflita.

**Com a 002 (`flutter-dart-engineer`), qualquer que seja a ordem de merge:**
1. `manifest.json`: conflito certo. Resolver com o manifest da `main` + um novo `regen-manifest`, nunca à mão.
2. `README.md` `:150`/`:402`: contagem 21 → 22 → 23, conflito textual.
3. `docs/USAGE.md`: tabela de agents, linhas adjacentes.
4. **`scripts/routing-eval/evalset.json`:** a §5 da 002 (`4e22287`) diz que nenhum `test/*.js` muda e que "nada neste repo mede roteamento". Isso está defasado desde a 004: `lib/evalset.js:52-58` exige clear + boundary por agent. A 002 vai precisar de casos, e os dois PRs vão acrescentar no fim do mesmo array. É conflito textual certo; resolver concatenando.
5. **Roteamento:** depois da 002, `m-3` ("do widget ao ponta a ponta") e `gap-flutter`/`h-flutter-code` passam a disputar com o `flutter-dart-engineer`. **Quem mergear por último re-roda as 2 RODADAS** do AC-01/AC-02 sobre a `main` combinada.
6. O corpo da 007 cita `flutter-dart-engineer` com a cláusula "or the BUILD stack dev when it is not installed". O texto vale em qualquer ordem, e o validator não confere referência cruzada a agent.

**Riscos:**
1. **`m-2`/`m-3` contra `cy-2`/`h-cy-vs-react`**, que diferem só por "app React Native"/"app iOS e Android": é a fronteira mais fina. A saída prevista é a L3 da `description`; o limite é 3 passagens só na `description` do agent novo.
2. **Colisão `brew install maestro`**: mitigada pelo literal qualificado e pelo teste negativo. Se o dev já tem o cask errado, o agent não detecta. A 2.5 decide se o corpo manda conferir com `maestro --version`.
3. **Checksum na mesma origem** (5.2.1): é integridade, não autenticidade. Aceitar ou exigir mais é decisão da 2.5.
4. **AC-04 depende de modelo:** 2 execuções são amostra pequena. Um verde falso em qualquer uma reprova, e a correção é no corpo.
5. **Orçamento pós-006:** se a 006 final crescer mais de ~3,4 KB além dos 29.196 B, a linha não cabe e vai para o playbook pelo padrão do ADR-0003. O T0 mede antes do T4.

## 6. Sensitive surface _(PLAN → triggers Security)_
- [ ] Auth / AuthZ  · [x] Secrets  · [ ] PII  · [ ] Payments
- [ ] File upload/download  · [ ] Deserialization  · [ ] Raw SQL / shell exec
- [ ] Multi-tenant isolation  · [x] New external integration / trust boundary

**Duas caixas marcadas, então a Phase 2.5 (`security-specialist`) roda antes do T3.**

- **[x] New external integration / trust boundary (supply chain).** O agent passa a recomendar a instalação de um binário de terceiro (`mobile-dev-inc/maestro`, JVM) na máquina do dev, fora do controle da org e com três canais de confiança diferentes:
  - o tap Homebrew `mobile-dev-inc/tap`, fórmula gerada por JReleaser com `sha256` pinado;
  - o release do GitHub, com `checksums_sha256.txt` da mesma origem e sem assinatura encontrada;
  - o script `get.maestro.mobile.dev`, sem verificação nenhuma.

  Soma-se a colisão de nome `brew install maestro` → cask sem relação (5.2.1), um vetor típico de confusão de pacote. O binário também sai da máquina com dados: analytics ligado por padrão (`MAESTRO_CLI_NO_ANALYTICS`) e o Maestro Cloud (upload do app), excluído pela §4. Perguntas para a 2.5:
  - (a) tap qualificado + checksum pinado bastam, ou exige-se attestation/versão pinada também no Homebrew?
  - (b) o `curl | bash` rotulado "unverified" pode aparecer, ou sai do corpo?
  - (c) `MAESTRO_CLI_NO_ANALYTICS=true` é recomendação ou controle obrigatório?
  - (d) o corpo manda conferir o produto instalado (`maestro --version`)?
- **[x] Secrets.** Os flows que o agent escreve carregam credenciais de login de teste. O controle está no AC-06: só `${VAR}` com `maestro test -e`, nenhum literal em YAML, `.env` fora do versionamento. A 2.5 confere se isso basta, e se os artefatos de execução (screenshots e gravações em `~/.maestro/tests/`) precisam de regra de não commitar.
- **[ ] Raw SQL / shell exec — não marcado.** O hub não ganha código executável: são um `.md` de prompt, uma linha de command, JSON de eval e testes `node:test` que só leem arquivos. Os comandos que o agent roda (`adb devices`, `xcrun simctl list …`, `maestro test`) são o uso normal da ferramenta, com o mesmo perfil do `cypress run` do `cypress-qa-analyst`. O que tem risco nessa linha, instalar, já está coberto pela caixa de supply chain e pela frase pinada "Never install … unless the user explicitly asks". O AC-04 roda com allowlist sem `brew` nem `curl`.
- **[ ] PII — não marcado.** O agent manda usar dado fictício; não há coleta nem armazenamento de dado pessoal pelo hub. A 2.5 pode promover isto se entender que screenshots de execução contra conta real são risco.
- As demais caixas não se aplicam: não há auth do hub, pagamento real (o exemplo "Pix" é tema de teste com dado fictício), upload, desserialização nem multi-tenant.

## 7. Security _(filled if section 6 has any check)_

**Phase 2.5 — `security-specialist`, 2026-09-29.** O escopo é o texto do agent e a linha da Phase 4. O hub não ganha código executável. O risco está no que o prompt manda o dev ou o próprio agent fazer: instalar binário de terceiro, rodar flow em dispositivo e guardar credencial de teste.

**Conferido nesta fase (não é só reuso da 5.2.1):**
- `gh api repos/mobile-dev-inc/maestro/releases/latest` → `cli-2.11.0`, assets `maestro.zip` e `checksums_sha256.txt`.
- `gh api repos/mobile-dev-inc/maestro/attestations/sha256:<digest do maestro.zip>` → **404**. O release não tem attestation de build, então `gh attestation verify` não é controle possível hoje.
- `brew info --json=v2 --cask maestro` → cask `maestro` do `homebrew/cask`, "AI agent command center", runmaestro.ai. A colisão de nome se confirma.

**Trust boundaries:** (1) a máquina do dev ou o runner de CI × a infraestrutura da `mobile-dev-inc` (GitHub Releases, tap Homebrew, `get.maestro.mobile.dev`, endpoint de analytics, Maestro Cloud); (2) o agent × o dispositivo e as contas do dev (emulador, simulador, celular físico ligado por `adb`); (3) o repo do app × os artefatos de execução (`~/.maestro/tests/`, screenshots, gravações, logs).

### 7.1 STRIDE

| # | Asset | Threat | Likelihood | Impact | Existing control | Gap |
|---|---|---|---|---|---|---|
| S-01 | Máquina do dev / runner de CI | **T** — `curl -fsSL get.maestro.mobile.dev \| bash` baixa `releases/latest` e só confere se o zip abre. Adulteração no caminho ou no host do script executa código arbitrário com o usuário do dev | Média | Alto | AC-06 exige alternativa verificável antes do pipe. A 5.2.1 item 4 ainda deixa o pipe no corpo, com o rótulo "unverified" | Um modelo que lê o pipe no prompt tende a oferecê-lo, porque é a forma mais curta. O rótulo não impede isso → SC-01 |
| S-02 | Máquina do dev | **S** — confusão de pacote: `brew install maestro` na forma curta instala o cask sem relação (runmaestro.ai), confirmado acima | Média | Alto | 5.3 reprova `/brew install maestro\b/` no arquivo | Um dev que já tem o cask errado não é detectado (risco 2 da 5.9), e o binário `maestro` do `PATH` pode ser outro produto → SC-02 |
| S-03 | Integridade do binário | **T** — release comprometido na origem (conta ou pipeline da `mobile-dev-inc`): o `checksums_sha256.txt` vem da mesma origem e a fórmula do tap pina o mesmo hash | Baixa | Alto | Checksum pinado (tap) e `shasum -c` (download manual) | Não há assinatura nem attestation (404). Sem controle técnico disponível → risco residual aceito, SC-04 |
| S-04 | Reprodutibilidade / integridade | **T** — versão não pinada: `releases/latest` (manual ou CI) troca o binário sem revisão, e o checksum passa a validar qualquer coisa que a origem publicar | Média | Médio | A 5.2.1 item 3 diz "versão pinada" | Nenhum teste reprova `releases/latest` → SC-03 |
| S-05 | Telemetria do dev / da org | **I** — o analytics do CLI vem ligado por padrão e sai da máquina sem pedido | Alta | Baixo | A 5.2.1 item 5 traz o `export` como **recomendação** | Recomendação num único ponto não chega aos comandos que o agent roda → SC-05 (decisão (c): obrigatório) |
| S-06 | Binário do app, flows, credenciais | **I** — upload ao Maestro Cloud (`maestro cloud`, `maestro login`, `action-maestro-cloud`, API key) manda app e flows a terceiro | Baixa | Alto | §4 exclui. A 5.3 limita `maestro cloud`/`action-maestro-cloud` a linha com `Never` | `maestro login`, `--api-key` e `MAESTRO_CLOUD_API_KEY` não estão cobertos → SC-06 |
| S-07 | Credenciais de teste | **I** — segredo literal em YAML versionado, em `-e SENHA=literal` (vai para o histórico do shell, a lista de processos e o log de CI) ou em `.env` commitado | Alta | Médio | AC-06: `${VAR}` + `maestro test -e`, nenhum literal em YAML | O próprio `-e VAR=valor` digitado vaza. O `.env` sem regra de `.gitignore`. Nenhum teste lê os exemplos do corpo → SC-07 |
| S-08 | Dados exibidos e digitados no app | **I** — screenshots, gravações e logs de `~/.maestro/tests/` (ou `--test-output-dir`) guardam o que foi digitado e exibido, credencial incluída, e acabam commitados ou anexados a PR ou issue | Média | Médio | Nenhum | → SC-08 |
| S-09 | PII de pessoas reais | **I** — flow rodado contra conta real ou backend de produção, com dado pessoal em `inputText` e na tela, e depois capturado nos artefatos | Média | Médio | O Core principles da 5.2 fala em "dados fictícios" | Nada fala de conta de teste nem de backend não produtivo → SC-09. **A PII continua desmarcada na §6**: o hub não coleta nem guarda dado pessoal; SC-08 e SC-09 cobrem o caminho |
| S-10 | Variáveis de ambiente, rede | **T/I** — flow é código: `runScript`/`evalScript` rodam JS com `http`. Um flow de origem não revisada (PR externo, cópia da internet) exfiltra os `${VAR}` quando o agent o roda | Baixa | Alto | Nenhum | → SC-10 |
| S-11 | Dispositivo e contas pessoais do dev | **T/D** — o agent roda comando destrutivo (`adb uninstall`, `adb shell pm clear`, `xcrun simctl erase`, `clearKeychain`) ou um flow com `clearState` no celular **físico** do dev, apagando dado ou sessão pessoal | Média | Médio | Nenhum. O AC-04 só cobre a ausência de dispositivo | → SC-11 |
| S-12 | Máquina do dev | **E** — o agent instala Maestro, SDK ou driver por conta própria, com `sudo` ou escrita no `PATH` | Média | Alto | Frase pinada "Never install … unless the user explicitly asks". A allowlist do AC-04 exclui `brew`/`curl` | `sudo` não é reprovado no texto → SC-12 |
| S-13 | Gate da VERIFY | **R** — o agent declara verde sem ter executado, ou cita "executado" sem evidência que se possa reconferir | Alta | Alto | AC-04 (3 frases + anti-pattern), linha da Phase 4 com "not RED proof" | "executado" sem comando nem exit code não se audita → SC-13 |

**13 ameaças:** 6 de impacto Alto (S-01, S-02, S-03, S-06, S-10, S-12), mais S-13, de impacto Alto no gate. Nenhuma fica Critical ou High em aberto **se** os controles abaixo entrarem no BUILD. S-03 fica como risco residual Médio aceito (SC-04).

**Respostas às perguntas da §6:**
- (a) Tap qualificado + checksum pinado bastam no Homebrew, porque a fórmula já pina `sha256`. Não exijo pin de versão no Homebrew: a fórmula do tap é o pin. No download manual e na CI, a versão pinada é **obrigatória**. Attestation não existe (404); fica como follow-up.
- (b) O `curl … | bash` **sai do corpo**. A 5.2.1 item 4 e a linha AC-06 da 5.3 precisam ser emendadas pelo orquestrador antes do T1. A saída é compatível com o AC-06: "não aparece como único caminho" continua valendo, e o teste do AC-06 fica mais rígido.
- (c) `MAESTRO_CLI_NO_ANALYTICS=true` vira **controle obrigatório** em todo comando `maestro test` do corpo.
- (d) **Sim.** O corpo manda conferir `maestro --version` e detectar o cask errado.

### 7.2 Required controls (must ship in BUILD)

O texto entra no corpo do agent no **T3** (`cypress-qa-analyst`). Cada controle é pinado por um `test()` em `test/mobile-qa-analyst.test.js` no **T1** (`nodejs-backend-architect`), vermelho na BASE, lendo só o texto (seam `MOBILE_QA_MD_UNDER_TEST`). "Bloco de código" = fenced code block do corpo. Os literais em inglês abaixo são os que o teste pina.

| SC | Ameaça | Controle | Onde (seção) | Teste determinístico | T# |
|---|---|---|---|---|---|
| SC-01 | S-01 | Nenhum pipe para shell no agent | arquivo inteiro | `/\|\s*(ba\|z)?sh\b/` ausente do arquivo; `get.maestro.mobile.dev` ausente ou só em linha que contém `Do not use` | T1 · T3 |
| SC-02 | S-02 | Só a forma qualificada, com conferência pós-instalação: `brew tap mobile-dev-inc/tap` + `brew install mobile-dev-inc/tap/maestro`; depois `maestro --version`; se `brew list --cask maestro` achar o cask, reportar ao usuário que o produto errado está instalado, **sem** desinstalar | `## Installing Maestro` | os três literais presentes na seção; `/brew install\s+maestro\b/` ausente do arquivo; frase `If \`brew list --cask maestro\` finds a cask, a different product is installed: tell the user and do not uninstall it.` presente | T1 · T3 |
| SC-03 | S-04, S-01 | Download manual e CI com versão pinada e checksum antes de descompactar | `## Installing Maestro` | `releases/download/cli-` presente; `releases/latest` ausente do arquivo; o índice de `shasum -a 256 -c` é menor que o de `unzip` na seção; frase `In CI, pin the version, verify the checksum and read credentials from the CI secret store.` presente | T1 · T3 |
| SC-04 | S-03 | Risco residual aceito: checksum da mesma origem, sem assinatura nem attestation (404 em 2026-09-29). Registrar em `.claude/memory/architecture.md` com data e aceite do lead. Follow-up: quando o upstream publicar attestation, acrescentar `gh attestation verify maestro.zip -R mobile-dev-inc/maestro` | memória (T6) | inspeção na VERIFY: entrada presente no `architecture.md` com data e aceite | T6 · T7 |
| SC-05 | S-05 | Analytics desligado como obrigação | `## Installing Maestro` + todo bloco de código | `MAESTRO_CLI_NO_ANALYTICS=true` na seção; **toda** linha de bloco de código que contém `maestro test` contém `MAESTRO_CLI_NO_ANALYTICS=true` | T1 · T3 |
| SC-06 | S-06 | Nada vai ao Maestro Cloud sem pedido | `## Anti-patterns` | frase `Never run \`maestro cloud\` or \`maestro login\`, upload an app or flow, or pass an API key to Maestro Cloud unless the user explicitly asks.` presente; `maestro cloud`, `maestro login`, `action-maestro-cloud`, `--api-key` e `MAESTRO_CLOUD_API_KEY` só em linha que contém `Never` | T1 · T3 |
| SC-07 | S-07 | Credencial só por variável vinda do ambiente ou do secret store; `.env` fora do git | `## Maestro standards` | em bloco de código, todo `-e NOME=` tem valor começando por `$` ou `"$`; em bloco `yaml`, nenhuma linha casa `/(password\|senha\|token\|secret\|api[_-]?key)\w*\s*:\s*["']?[^$\s"'{]/i`; todo `inputText:` com esses nomes no mesmo bloco usa `${`; frase `Credentials come from the shell environment or the CI secret store, never typed on the command line or committed; keep \`.env\` in \`.gitignore\`.` presente | T1 · T3 |
| SC-08 | S-08 | Artefatos de execução não saem do time | `## Maestro standards` | frase `Screenshots, recordings and logs in \`~/.maestro/tests/\` hold what the app showed and typed: never commit them or attach them outside the team.` presente | T1 · T3 |
| SC-09 | S-09 | Só conta de teste e dado fictício, contra backend não produtivo | `## Core principles` | frase `Run flows only with test accounts and fictitious data against a non-production backend.` presente | T1 · T3 |
| SC-10 | S-10 | Flow é código | `## Maestro standards` | frase `Flows are code: read every \`runScript\`, \`evalScript\` and \`http\` call before running a flow you did not write.` presente | T1 · T3 |
| SC-11 | S-11 | Dispositivo do dev: emulador ou simulador primeiro; perguntar antes de rodar em celular físico; comando destrutivo só com aviso | `## Device check and not-executed status` | frase `Prefer an emulator or simulator; if the only device is a physical phone, ask before running.` presente; `adb uninstall`, `pm clear`, `simctl erase` e `clearKeychain` só em linha que contém `ask` | T1 · T3 |
| SC-12 | S-12 | Sem elevação nem instalação por conta própria | arquivo inteiro | `/\bsudo\b/` ausente; a frase `Never install Maestro, an Android SDK, Xcode components or a device driver unless the user explicitly asks` continua pinada (5.3). Comportamental: a allowlist do AC-04 sem `brew`/`curl` e a tentativa negada no stream reprova (5.6, T7) | T1 · T3 · T7 |
| SC-13 | S-13 | "executado" exige evidência reconferível | `## Traceability matrix (AC → flow)` | frase `Every \`executado\` status cites the exact command and its exit code.` presente, além das 3 frases e do anti-pattern do AC-04 (5.3). Defesa em profundidade: a linha da Phase 4 (5.4) com `A flow marked \`NÃO EXECUTADO\` is not RED proof.`, pinada inteira pelo `test/flow-mobile-qa.test.js` | T1 · T3 · T4 |

**Emendas que a Phase 2.5 exige antes do T1 (a cargo do orquestrador; esta fase só edita a §7):**
1. 5.2.1 item 4: remover o `curl … | bash`. Em 5.2.1 item 2, acrescentar `maestro --version` e a checagem `brew list --cask maestro` (SC-02). Em 5.2.1 item 5, trocar "recomendação padrão" por obrigatório (SC-05).
2. Linha "Agent, AC-06" da 5.3: substituir "qualquer `| bash` … na mesma linha de `unverified`" por SC-01 e acrescentar os literais de SC-02, SC-03 e SC-05…SC-13.
3. O orçamento de 150–220 linhas do corpo comporta as ~10 frases novas. Nenhuma exige heading novo.

**Controles de processo (sem teste de texto):** a VERIFY (T7) repete o STRIDE só se o corpo final divergir dos literais acima. Na memória (T6 → `project-memory-keeper`), `architecture.md` recebe a boundary "binário de terceiro recomendado por agent" com SC-04 como risco aceito. `guidelines.md` recebe o anti-pattern "prompt de agent que manda instalar por `curl | bash` ou por nome curto de pacote" e o idioma "tap ou release qualificado + checksum + versão pinada + conferência pós-instalação".

### 7.3 Veredito da Phase 2.5

**Decisão: APPROVE WITH MITIGATIONS. Pode seguir para o BUILD** (T1 → T3), desde que as emendas 1–2 entrem na 5.2.1/5.3 antes do T1 e SC-01…SC-13 estejam nos testes do T1.

| Severity | Open | Mitigated (by SC in BUILD) | Notes |
|---|---|---|---|
| Critical | 0 | 0 | |
| High | 0 | 6 | S-01, S-02, S-06, S-10, S-12, S-13 |
| Medium | 0 | 6 | S-04, S-05, S-07, S-08, S-09, S-11 |
| Low | 0 | 0 | |
| Residual aceito | 1 | — | S-03 (Médio): aceite do lead registrado em `architecture.md` no T6 |

**Secrets:** clean, porque a demanda ainda não tem código de agent. SC-07 impede que o BUILD introduza segredo. · **Dependencies:** nenhuma dependência de runtime entra no hub. Maestro é ferramenta recomendada ao dev, sem CVE conhecido avaliado aqui. · **Threat model:** added in this change (§7.1).
**Required before release:** SC-01…SC-13 verdes no T6; aceite do SC-04 registrado; o gate da T7 com AC-04 ×2 sem tentativa de instalação no stream.
**Follow-ups (post-release):** attestation ou assinatura do upstream (SC-04); receita de CI com emulador, fora do escopo pela §4, que deve herdar SC-03, SC-05 e SC-07 quando existir.

**Decisões do orquestrador e do lead após a Phase 2.5 (2026-09-30):**
- **Risco residual S-03 aceito pelo lead:** o checksum do Maestro vem da mesma origem do binário e o release não tem attestation (`gh api .../attestations` → 404). O aceite é registrado no `architecture.md` na T6/T7 (SC-04).
- **Emendas à §5 exigidas pela §7, que prevalece onde divergir:** 5.2.1 sem `curl | bash` no item 4; item 2 com `maestro --version` e checagem `brew list --cask maestro` para detectar o produto errado; analytics desligado passa de recomendação a obrigatório (SC-05). Na 5.3, a regra do AC-06 passa a ser o SC-01 com os literais de SC-02 a SC-13.

## 8. QA plan _(VERIFY)_
**BASE:** `feat/006-flow-melhorias` = `827e885` (hoje em `origin/main` via PR #31). **HEAD medido:** `6a5e339` (VERIFY), `976b229` (após a passagem 2).
**Test pyramid:** Unit (texto pinado): `test/mobile-qa-analyst.test.js` (25), `test/flow-mobile-qa.test.js` (2), ajustes em `test/flow-pretriagem.test.js`, `test/flow-prova-red.test.js` e `test/support/flow-texts.js` (`MOBILE_QA_LINE`, linha inteira). E2E com modelo: eval de roteamento (AC-01/02) e execução real do agent (AC-04), fora da CI.
**Suíte:** `node --test test/*.test.js` → **454/454** · `validate-artifacts.js --strict` 0/0 · `regen-manifest.js --check` limpo.

**PROVA DE RED:**
- AC-03/05/06 e SC-01…13: `MOBILE_QA_MD_UNDER_TEST=<ausente> node --test test/mobile-qa-analyst.test.js` → `tests 25 / pass 0 / fail 25` (commit `2e7ed72`, antes do agent). Verificador: 20 mutações, uma por controle, todas vermelhas.
- AC-07/08: `FLOW_MD_UNDER_TEST` e `FLOW_PLAYBOOK_DIR_UNDER_TEST` apontando para `2c40ac2` → 2/2 vermelhos (commit `0e4b43b`).

**AC-01/02 — eval** (`node scripts/routing-eval/run.js --rounds 2 --model opus --conc 4`, em `7454c5e`; descriptions e evalset idênticos até o HEAD, confirmado por `git diff --quiet 7454c5e HEAD -- agents/ scripts/routing-eval/`): mobile **8/8** nas 2 rodadas; 22 casos de guarda nunca no agent novo; `mqa-pwa` → `cypress-qa-analyst` e `mqa-a11y` → `ux-designer-mobile` nas 2 rodadas; total 82/83 · 82/83, 0 erros sistemáticos (ruídos antigos: `pg-1` → NONE na r1, `h-nostack-tests` → Explore na r2). Saídas: `eval/round-{1,2}-opus.json`. Custo do eval: não medido (163 de 166 chamadas sem custo no stream).

**AC-04 — execução real, 2 rodadas:** agent como system prompt, `PATH=stubs:/usr/bin:/bin` (stubs de `adb`/`xcrun`/`maestro` saindo 127), `--permission-mode default` (tudo que exige aprovação é negado e fica registrado), fixture React Native com `testID`. `env -i` quebrou o login, então o HOME real foi mantido, com cwd descartável. Resultado: **0** tentativas de `brew`/`curl`/`wget`/`sudo`/download; flows escritos só com `${TEST_EMAIL}`/`${TEST_PASSWORD}`; matriz com `NÃO EXECUTADO: <causa>`; nenhuma afirmação de verde. Streams em scratchpad (`verify-007/ac04-r{1,2}.jsonl`).

**Security gate:** APPROVE WITH MITIGATIONS — SC-01…13 com código e teste; SC-04 (aceite do lead do S-03) registrado em `.claude/memory/architecture.md` (`3453f77`).

**Passagens (teto 3):**
| # | Origem | Achados | Commits |
|---|---|---|---|
| 1 | BUILD | T1–T5 | `2e7ed72`…`6a5e339` |
| 2 | REVIEW → BUILD | docs: "três QAs juntos" contradizia o flow; arquitetura: "mobile vence" divergia da C6 (web + mobile despacha os dois); QA: exemplo sem seletor `id:`; teste sem contagem da linha mobile; USAGE sem `brew tap` | `462fc37`, `976b229` |

**REVIEW:** architect APPROVED WITH COMMENTS · QA (`cypress-qa-analyst`) APPROVED WITH COMMENTS · docs CHANGES REQUESTED (1 BLOCKER) → corrigido em `462fc37` e conferido pelo orquestrador contra `commands/flow.md:137` (não houve re-review do writer) · security (gate) APPROVE WITH MITIGATIONS → **APPROVED WITH COMMENTS**.

**Follow-ups:**
- Lente **Test integrity** do `/code-review` não roteia `.maestro/` nem `mobile-qa-analyst` (`commands/code-review.md:38,52`).
- `agents/cypress-qa-analyst.md` não cita a fronteira com o `mobile-qa-analyst` (WebView em app nativo).
- Smoke de sintaxe do bloco YAML do exemplo (hoje só predicado de texto).
- Conflitos previstos com a 002 (`flutter-dart-engineer`) em `evalset.json`, `manifest.json` e README.

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
**Início:** 2026-09-30T01:02:16Z
**Fonte:** transcript (só orquestrador) — endpoint OTEL 9464 servindo outra sessão
**Comando:** `node ~/.claude/skills/session-cost/scripts/session-cost.js --since 2026-09-30T01:02:16Z`

**Custo: não medido.** A ferramenta imprimiu `TOTAL $0.0000` com "modelo sem preço na tabela, excluído do total: claude-opus-5-5" — ausência de preço, não custo zero. 222 chamadas de API do orquestrador; **42 subagents despachados, consumo não incluído**. A janela se sobrepõe à da 006 (as duas correram em paralelo nesta sessão). Total real: `/cost` nativo.
