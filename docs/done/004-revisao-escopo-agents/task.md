<!-- demand: 004-revisao-escopo-agents -->
<!-- created: 2026-09-29 -->
# Change: Revisão do escopo dos agents do hub

## 0. GOAL _(from /discovery — the anchor for every phase)_
**Discovery brief:** docs/discovery/revisao-escopo-agents.md
**Objective (why):** o Claude Code escolher, pela `description`, o agent cujo escopo cobre a tarefa — e agent novo não entrar no hub sem checar colisão.
**Success metric:** acurácia de roteamento no eval de referência (`docs/discovery/revisao-escopo-agents/`), modelo opus
**Baseline:** 70/73 (95,9%), 1 erro sistemático (`h-rev-generic`) (source: `baseline-opus-r1.json`, `hard-opus-r{1,2}.json` + delta de 2 rodadas nos casos re-rotulados, 2026-09-29, base@d78e998)  →  **Target:** 0 erros sistemáticos e ≥ 71/73 by 2026-10-10
**Baseline at ship:** **73/73 e 72/73** (2 RODADAS, 0 ERROS SISTEMÁTICOS); `h-rev-generic` → `general-purpose`, `rev-1`/`rev-2` → `change-reviewer`, `h-arch-adr` → `project-memory-keeper`, `h-arch-decide` → `system-architect` (medido em `1ff0221`, 2026-09-29)
**Recommendation:** Go
**Pré-triagem (Phase 0.5):** NOTA 2/10 — abaixo do corte (> 6)
- A1 Deliverable 2: o prompt ("revise os agentes que temos…") não diz o que existe no fim — nem relatório, nem arquivo; `agents/*.md` só aparece por inferência.
- A2 Mechanism 2: nenhum mecanismo nomeado; o eval de roteamento não existia no repo (ausência confirmada no context load, `.claude/memory/` sem teste/telemetria de seleção).
- A3 Done 2: "o mais apropriado" é adjetivo; a condição de saída só existiu depois do baseline medido nesta demanda.
- A4 Stability 3: o prompt abria 3 leituras (roteamento nos commands, agent da 002, escopo entre agents) e exigiu pergunta ao requester antes de começar.

## 1. Description _(DEFINE — PO)_
**Problem:** o Claude Code escolhe o subagent pela `description` do frontmatter, e o hub nunca mediu essa escolha. O eval de referência do discovery (73 casos, opus, base@d78e998) mostrou que o problema é estreito, mas real: **1 erro sistemático** — "Revise o PR #51 (texto de botões)" cai no `emstech-reviewer` em 2/2 rodadas, porque a description dele ("Use as the reviewer of a code change in two modes", `agents/emstech-reviewer.md:3`) reivindica **qualquer** revisão, quando o alcance pretendido pelo lead é só o gate do `/flow-lite` e pedidos que citem as regras/perfil dele. Há ainda **1 fronteira implícita** (ADR: `system-architect` e `project-memory-keeper` reivindicam os dois, e hoje acertam por sorte de redação) e **2 incoerências `model` × `tier`** (`senior-product-owner` com `haiku`/`reasoning`, `aws-devops-engineer` com `sonnet`/`reasoning`), que nenhum gate detecta porque o validator só checa os enums (`scripts/validate-artifacts.js:169-181`). Por fim, o eval vive em `docs/discovery/`, fora de qualquer caminho que um contributor siga ao adicionar um agent — a `flutter-dart-engineer` (demanda 002) entraria sem checagem de colisão.

A mudança tem quatro partes, decididas pelo lead e **não reabertas aqui**: (a) rename `emstech-reviewer` → `change-reviewer` com description restrita; (b) regra de ADR explícita nas duas descriptions ("architect decide, memory registra"); (c) regra `model` × `tier` no validator e os dois agents alinhados a ela; (d) eval promovido a ferramenta versionada do hub, com a parte determinística como teste da CI.

**Business value:** tira o único roteamento errado reproduzível do hub e transforma "agent novo não colide com os existentes" de revisão a olho em gate barato. Custo contido: 3 descriptions, 2 frontmatters, 1 regra de validator, 1 rename mecânico e a promoção de scripts que já existem. O eval **não** entra na CI — chama `claude -p` de verdade (custo real, não determinístico) — e roda sob demanda de quem adiciona ou muda um agent.

**User segment:**

| Segmento | Dor (1-5) | Frequência | Efeito desta mudança |
|---|---|---|---|
| Dev da engenharia que delega sem nomear o agent (>50 devs, `business.md:11`) | 2 | Diária; erro raro | Revisão genérica de PR deixa de cair no reviewer do `/flow-lite` |
| Time que já adotou `/flow-lite` | 3 | A cada item do lote | Rename sem perder perfil (`.emstech-reviewer.json`), bloco cercado do `CLAUDE.md` nem opt-out de telemetria |
| Mantenedor/contributor que adiciona agent | 3 | A cada agent novo | Ganha eval rodável + teste de CI que exige casos para o agent novo |
| Lead do hub | 2 | Por demanda | `model` × `tier` deixa de depender de revisão humana |

**Achados do DEFINE que moldam os AC (verificados no repo, base 39ba06c):**
- **O `ahc sync` cobre só metade do rename.** `pruneOrphans` (`bin/ahc:860-895`) remove agent e skill que saíram do manifest **e estão no lock** — então `~/.claude/agents/emstech-reviewer.md` e `~/.claude/skills/emstech-reviewer/` saem no próximo sync, salvo pin (`bin/ahc:867`, regra de `business.md:45`). Não cobre o que o ahc **não instalou**: o diretório de estado `~/.claude/.emstech-reviewer/` (config, ack e opt-out de telemetria — `skills/flow-lite/scripts/lib/telemetry.js:34`), a variável `EMSTECH_TELEMETRY=off` que o dev pôs no shell (`telemetry.js:81`), o `.emstech-reviewer.json` commitado nos repos que adotaram (`skills/emstech-reviewer/scripts/lib/profile.js:38`) e o bloco cercado `emstech-reviewer` no `CLAUDE.md` deles (`skills/emstech-reviewer/scripts/lib/context.js:27`). Rename puro nesses quatro pontos **reativaria telemetria contra um opt-out explícito** e trocaria silenciosamente o perfil do gate para `default` — mudança de comportamento do gate, que está fora de escopo. Daí o AC-05 (compatibilidade com os nomes legados) e o marcador `legacy`/`legado` no AC-12.
- **`test/prune.test.js` cobre command e skill, não agent** (`test/prune.test.js:55`, `:71`). O rename é o primeiro caso de agent órfão.
- **Não existe regra `model` × `tier`.** O validator só checa `model ∈ {opus,sonnet,haiku}` e `tier ∈ {reasoning,speed}`; `README.md:750` define a semântica do `tier` (`reasoning` = "decisões complexas (PO, arquitetura, segurança, design)") sem ligá-la ao modelo. O padrão observado é 17 de 19 agents restantes com `reasoning` ↔ `opus` e `speed` ↔ `sonnet|haiku`; a `flutter-dart-engineer` da 002 (`opus`/`reasoning`) já o respeita. O AC-09 cria a checagem.

**Conflito com `business.md`:** nenhum bloqueante. Dois pontos de atrito registrados:
1. `business.md:45` ("item pinado sobrevive à retirada do manifest") — dev com `emstech-reviewer` pinado mantém a description antiga, que continua capturando revisão genérica **na máquina dele**. Aceito: a regra vale; a mitigação é a nota de migração com `ahc unpin` (AC-13).
2. `business.md:49` ("custo reportado é medido, nunca estimado") vale para o eval promovido: ele reporta custo medido do stream do `claude -p` ou nada (AC-10).

## 2. User stories (INVEST)

- **US1 (Must)** — Como **dev que delega sem nomear o agent**, quero que "revise este PR" sem menção ao `/flow-lite` ou às regras dele **não** caia no reviewer do `/flow-lite`, para receber uma revisão genérica em vez de um gate com perfil que meu repo não adotou.
- **US2 (Must)** — Como **time que já adotou o `/flow-lite`**, quero que o reviewer passe a se chamar `change-reviewer` sem que meu perfil, meu bloco de decisões no `CLAUDE.md` nem meu opt-out de telemetria deixem de valer, para que um rename não mude o que o gate faz nem o que é enviado.
- **US3 (Must)** — Como **dev com o hub instalado**, quero que o próximo `ahc sync` remova o agent e a skill com o nome antigo e instale os novos, para não ficar com dois reviewers disputando o mesmo pedido.
- **US4 (Should)** — Como **dev que pede um ADR**, quero que decisão ainda aberta vá ao `system-architect` e decisão já tomada vá ao `project-memory-keeper`, para que rode o agent com a responsabilidade certa.
- **US5 (Should)** — Como **lead do hub**, quero que o validator rejeite `tier` incoerente com `model`, para que custo de raciocínio declarado e modelo real não divirjam sem ninguém notar.
- **US6 (Must)** — Como **contributor que adiciona ou muda um agent**, quero rodar o eval de roteamento do hub com um comando e ter a CI exigindo casos de referência para o meu agent, para descobrir colisão de escopo antes do merge e não depois que alguém nota o agent errado trabalhando.

## 3. Acceptance criteria (Gherkin)

**Definições:** **BASE** = `origin/main` no momento do PLAN · **LEGADO** = `emstech-reviewer` e os nomes derivados (`.emstech-reviewer.json`, `~/.claude/.emstech-reviewer/`, bloco cercado ` ```emstech-reviewer `, `EMSTECH_TELEMETRY`, `EMSTECH_TELEMETRY_ENDPOINT`, `EMSTECH_TELEMETRY_SYNC`, `EMSTECH_REVIEWER_HOME`) · **EVAL** = diretório versionado do eval promovido; caminho sugerido `scripts/routing-eval/` — o PLAN pode trocar, desde que grave o caminho na §5 e ele fique fora de `docs/` e de `test/` · **RODADA** = uma execução completa do EVAL sobre os 73 casos com modelo opus · **ERRO SISTEMÁTICO** = caso errado em 2 de 2 RODADAS · **HISTÓRICO** = `docs/todo/003-flow-lite/task.md`, `docs/todo/004-revisao-escopo-agents/task.md`, `docs/discovery/revisao-escopo-agents.md`, `docs/discovery/revisao-escopo-agents/` (resultados medidos do baseline), `docs/pr-review/archive/`, `docs/pr-review/history.md` · **LACUNA** = `general-purpose` ou `claude`.

**Natureza da prova.** Descriptions e corpos de agent são prompt; o **único** AC que depende de modelo é o AC-01, e ele roda **fora da CI**, com a saída das 2 RODADAS gravada como evidência na §8. Todos os outros são comando determinístico ou inspeção binária. Pelo anti-pattern de `guidelines.md:52-56`, escopo de demanda (arquivos tocados, ausência de "emstech") **não** vira `*.test.js`: fica como comando de uma vez só na §8; invariante de artefato (evalset bem-formado, regra `model` × `tier`, compatibilidade com LEGADO) vira teste.

- [ ] **AC-01 — Eval pós-mudança: 0 erros sistemáticos e ≥ 71/73** _(Comando, fora da CI)_
  - Given a branch da 004 com todas as mudanças aplicadas e o EVAL montando o `--agents` a partir de `agents/*.md` dessa branch
  - When se rodam 2 RODADAS
  - Then cada RODADA acerta **≥ 71/73** casos
  - And o número de ERROS SISTEMÁTICOS é **0**
  - And `h-rev-generic` **não** resolve para `change-reviewer` em nenhuma das 2 RODADAS
  - And `rev-1` e `rev-2` resolvem para `change-reviewer` nas 2 RODADAS
  - And `h-arch-adr` resolve para `project-memory-keeper` e `h-arch-decide` para `system-architect` nas 2 RODADAS
  - And os dois JSON de saída e o comando exato ficam citados na §8, com o `git rev-parse HEAD` da branch medida
  - _Moves GOAL metric?_ **sim** — é a própria métrica (baseline 70/73 e 1 sistemático → alvo 0 e ≥ 71/73).
  - **Emenda (VERIFY, 2026-09-29, decisão do lead):** o eval em `634c1eb` deu 71/73 nas 2 rodadas com `gap-sap` (→ `integration-architect`) e `h-nostack-api` (→ `NONE`, não delegou) errados nas duas. Os dois já estavam marcados como discutíveis no discovery (`39ba06c`), antes da mudança. O lead aceitou os dois rótulos: `integration-architect` para EDI→IDoc (o hub não tem agent SAP) e `NONE` para pedido sem stack — só em `kind: nostack`, regra no validador (`1ff0221`). **Correção do baseline:** pela definição da ferramenta, o `h-nostack-api` já errava nas 2 rodadas do baseline (nodejs, NONE); o "1 sistemático" do discovery estava subcontado. Com os rótulos finais, o baseline tem 1 sistemático (`h-rev-generic`) e o `h-nostack-api` passa a acerto parcial (r2).

- [ ] **AC-02 — Rename dos artefatos** _(Comando)_
  - Then `agents/change-reviewer.md` existe com `name: change-reviewer` e `skills/change-reviewer/SKILL.md` existe com `name: change-reviewer`
  - And `test -e agents/emstech-reviewer.md || test -e skills/emstech-reviewer` sai ≠ 0 (nenhum dos dois existe)
  - And `ls test/change-reviewer-*.test.js` lista os 3 arquivos hoje chamados `test/emstech-reviewer-{diff,gate,stages}.test.js`, e `ls test/emstech-*` não lista nada
  - And em `manifest.json`, `agents[]` e `skills[]` contêm `change-reviewer` e **nenhuma** entrada `emstech-reviewer` — `grep -ci emstech manifest.json` = **0**
  - And `commands/flow-lite.md` e `skills/flow-lite/` invocam o gate por `~/.claude/skills/change-reviewer/scripts/gate.js` e despacham o agent `change-reviewer`; os `require` de `skills/flow-lite/scripts/lib/{batch,telemetry}.js` apontam para `../../../change-reviewer/`
  - And os `$id` e `title` de `skills/change-reviewer/schema/*.json` usam `change-reviewer`
  - _Moves GOAL metric?_ **sim, indiretamente** — `rev-1`/`rev-2` passam a esperar `change-reviewer`; sem o rename o AC-01 não fecha.

- [ ] **AC-03 — Description do `change-reviewer` com alcance restrito** _(Inspeção)_
  - Given o alcance decidido: gate do `/flow-lite` e pedidos que citem as regras/perfil do reviewer
  - When se lê o campo `description` de `agents/change-reviewer.md`
  - Then ela contém uma cláusula explícita de exclusão dizendo que revisão genérica de PR/diff **não** é deste agent
  - And **todo** exemplo positivo da description cita ao menos um de: `/flow-lite`, `gate`, perfil/`profile`, regras/`rules` do reviewer — nenhum exemplo positivo é pedido genérico de revisão
  - **Emenda (VERIFY):** é permitido **um** contraexemplo marcado "do NOT launch change-reviewer" com pedido genérico — é o que ensina a exclusão ao roteador; o AC-01 mede se funciona
  - And os dois modos (`gate` e `pr`) continuam descritos — a mudança restringe **quando** o agent é escolhido, não **o que** ele faz
  - _Moves GOAL metric?_ **sim** — é a causa do único erro sistemático (`h-rev-generic`).

- [ ] **AC-04 — O `ahc sync` retira o nome antigo da máquina do dev** _(Comando + Teste)_
  - Given um `HOME` descartável (`test/helpers.js`, `guidelines.md:57`) sincronizado a partir de um manifest que contém `emstech-reviewer` em `agents[]` e `skills[]`
  - When o mesmo `HOME` roda `ahc sync` contra um manifest com `change-reviewer` no lugar
  - Then `~/.claude/agents/emstech-reviewer.md` e `~/.claude/skills/emstech-reviewer/` deixam de existir e saem do lock, e `change-reviewer` está instalado nas duas categorias
  - And a saída do sync contém `[removed] agent emstech-reviewer` e `[removed] skill emstech-reviewer`
  - And com `emstech-reviewer` pinado, os dois sobrevivem e a saída contém a linha `[pinned]` (regra de `business.md:45`, comportamento atual de `bin/ahc:867`)
  - And `test/prune.test.js` ganha um caso para a categoria **agent** (hoje só command e skill, `:55`/`:71`), com nomes de fixture genéricos
  - And a verificação contra o `manifest.json` real (BASE → HEAD) é comando de uma vez só na §8, não teste permanente
  - _Moves GOAL metric?_ **não diretamente** — o eval mede as descriptions do repo; este AC garante que o que foi medido é o que chega à máquina do dev, sem o agent antigo ainda disputando o pedido.

- [ ] **AC-05 — Compatibilidade com o LEGADO que o sync não alcança** _(Teste)_
  - Given um repo alvo com `.emstech-reviewer.json` e **sem** `.change-reviewer.json`
  - When o gate resolve o perfil
  - Then usa o perfil apontado pelo arquivo legado (mesmo resultado de hoje)
  - And, se os dois arquivos existirem, o novo prevalece
  - Given um `CLAUDE.md` com bloco cercado `emstech-reviewer`
  - Then as diretivas do bloco são lidas como hoje
  - Given `HOME` com `~/.claude/.emstech-reviewer/config.json` contendo `"enabled": false` e nenhum diretório de estado novo
  - Then a telemetria segue desativada e nada é enviado nem gravado no spool
  - And um ack registrado no diretório legado continua valendo (o aviso da primeira run não reaparece)
  - Given `EMSTECH_TELEMETRY=off` no ambiente
  - Then a telemetria segue desativada
  - And cada cenário acima é um caso em `test/*.test.js` que **falha** num rename sem compatibilidade
  - _Moves GOAL metric?_ **não** — protege o fora-de-escopo "não mudar o comportamento do gate" e o opt-out explícito do dev.

- [ ] **AC-06 — Telemetria sob o nome novo** _(Teste + Inspeção)_
  - Then o evento emitido carrega `service.name` = `change-reviewer` (hoje `emstech-reviewer`, `telemetry.js:227`), asserido em `test/flow-lite-summary-telemetry.test.js`
  - And o diretório de estado padrão passa a ser `~/.claude/.change-reviewer/` e as variáveis de ambiente novas não têm "emstech" no nome; as antigas seguem aceitas pelo AC-05
  - And `skills/flow-lite/TELEMETRY.md` registra a data da troca de `service.name`, para que consultas no backend unam os dois valores
  - _Moves GOAL metric?_ **não** — consistência do rename decidido pelo lead.

- [ ] **AC-07 — Regra de ADR nas duas descriptions** _(Inspeção + Comando)_
  - When se lê o campo `description` de `agents/system-architect.md`
  - Then ela diz que ADR é deste agent quando há **decisão a tomar** e que decisão **já tomada**, só a registrar, é do `project-memory-keeper` — `grep '^description:' agents/system-architect.md | grep -c project-memory-keeper` = 1
  - When se lê o campo `description` de `agents/project-memory-keeper.md`
  - Then ela diz que ADR é deste agent **só** para registrar decisão já tomada e que decisão em aberto é do `system-architect` — `grep '^description:' agents/project-memory-keeper.md | grep -c system-architect` = 1
  - And cada uma ganha **1 exemplo** do lado que lhe cabe
  - _Moves GOAL metric?_ **sim** — `h-arch-adr` e `h-arch-decide` estão no AC-01; hoje acertam por redação, não por regra.

- [ ] **AC-08 — Idioma e forma do frontmatter** _(Inspeção)_
  - Then as descriptions e corpos alterados seguem `guidelines.md:27-28` (instrução ao modelo em inglês; exemplos da `description` em PT-BR) e `guidelines.md:33` (string JSON-escapada, 3–5 exemplos)
  - _Moves GOAL metric?_ **não** — conformidade; PR que viola não mergeia.

- [ ] **AC-09 — Regra `model` × `tier` no validator e os dois agents alinhados** _(Teste + Comando)_
  - Given a regra (decidida pelo lead em 2026-09-29): `tier: reasoning` ⇒ `model ∈ {opus, sonnet}`; `tier: speed` ⇒ `model ∈ {sonnet, haiku}` — ou seja, `haiku`+`reasoning` e `opus`+`speed` são proibidos
  - When `scripts/validate-artifacts.js` roda, no modo normal **e** com `--strict`
  - Then um agent que viola a regra gera **erro** (não warning), com mensagem que nomeia o `model` e o `tier` encontrados
  - And `test/validator.test.js` ganha uma fixture para cada direção da violação (`haiku`+`reasoning`, `opus`+`speed`); os dois casos falham contra o validator da BASE
  - And `agents/senior-product-owner.md` fica com `model: sonnet` e `tier: reasoning` (decisão do lead: meio-termo de custo para o DEFINE)
  - And `agents/aws-devops-engineer.md` fica com `model: opus` e `tier: reasoning` (decisão do lead)
  - And `README.md` documenta a regra junto da definição de `tier` (perto de `:750`)
  - _Moves GOAL metric?_ **não** — achado estático do discovery; o eval não mede `model`/`tier`.

- [ ] **AC-10 — Eval promovido a ferramenta versionada, rodável com um comando** _(Comando + Inspeção)_
  - Then EVAL contém o evalset (os 73 casos atuais, com `rev-1`/`rev-2` esperando `change-reviewer`) e os scripts de montagem, roteamento e execução
  - And o `--agents` é montado **no momento da execução** a partir de `agents/*.md` — nenhum snapshot tipo `agents.json` é versionado em EVAL
  - And um único comando documentado roda N RODADAS com modelo parametrizável e imprime: total, acertos por `kind`, a lista de ERROS SISTEMÁTICOS e o caminho dos JSON de saída
  - And o comando sai com código **≠ 0** quando há ERRO SISTEMÁTICO ou quando o total fica abaixo do limiar passado por argumento
  - And custo só aparece se for **medido** do stream do `claude -p`; caso contrário a saída diz "custo: não medido" (`business.md:49`)
  - And `build-agents.js`, `route-one.js`, `run-eval.js`, `agents.json`, `evalset.json` e `evalset-hard.json` saem de `docs/discovery/revisao-escopo-agents/`; lá ficam só os JSON de resultado do baseline, como HISTÓRICO
  - And os scripts seguem zero deps e `require` CommonJS (`guidelines.md:11`)
  - _Moves GOAL metric?_ **sim** — é o instrumento da métrica; sem ele o AC-01 não é reproduzível por outra pessoa.

- [ ] **AC-11 — Parte determinística do eval na CI; a parte com modelo, fora** _(Teste + Comando)_
  - Then existe um `test/*.test.js` que valida o evalset de EVAL: `id` único; `kind` ∈ {`clear`, `boundary`, `gap`, `overlap`, `nostack`}; `expect` não vazio; todo valor de `expect` é um agent existente em `agents/` ou LACUNA; **todo** `agents/*.md` tem ≥ 1 caso `clear` e ≥ 1 caso `boundary` que o esperam
  - And o teste falha na BASE (o evalset não está em EVAL) e falha quando um agent é adicionado a `agents/` sem casos
  - And `grep -cE "child_process|spawn|route-one" <o arquivo de teste>` = **0** — o teste nunca chama o `claude`
  - And `grep -rn "<caminho de EVAL>" .github/workflows/` não encontra invocação do runner
  - And a seção "Adicionando / atualizando um agent…" do `README.md` (`:638`) instrui: adicionar ≥ 1 caso `clear` e ≥ 1 `boundary` ao evalset, rodar o comando do AC-10 com 2 RODADAS antes do PR e colar o resultado no PR — com aviso de que o eval tem custo real e não é determinístico
  - _Moves GOAL metric?_ **sim, como guarda** — impede que um agent novo (a 002 é o primeiro) derrube a métrica sem passar pelo eval.

- [ ] **AC-12 — Negativo: nenhum "emstech" fora do HISTÓRICO e da compatibilidade** _(Comando)_
  - When se roda
    ```
    git grep -n -i emstech -- . \
      ':(exclude)docs/todo/003-flow-lite/task.md' \
      ':(exclude)docs/todo/004-revisao-escopo-agents/task.md' \
      ':(exclude)docs/discovery/revisao-escopo-agents.md' \
      ':(exclude)docs/discovery/revisao-escopo-agents/' \
      ':(exclude)docs/pr-review/archive/' \
      ':(exclude)docs/pr-review/history.md' \
      | grep -viE 'legacy|legado'
    ```
  - Then a saída é **vazia**
  - And toda linha que o `grep -v` filtra é compatibilidade do AC-05 (código ou teste), a nota de migração do AC-13 ou a documentação dos nomes legados exigida pelo C13 (`TELEMETRY.md`, `SKILL.md`, `ADOPTION.md`, `commands/flow-lite.md`) — verificado por inspeção da lista sem o `grep -v`, resumida na §8 _(emenda do VERIFY: a redação original omitia a doc do C13)_
  - And `git grep -c -i emstech -- agents/ manifest.json` não retorna nada — a description que o roteador lê não tem o nome antigo nem como legado
  - _Moves GOAL metric?_ **não** — garante que o rename é completo; nome antigo esquecido num exemplo ou doc reintroduz a ambiguidade.

- [ ] **AC-13 — Docs e nota de migração** _(Comando + Inspeção)_
  - Then `README.md` e `docs/USAGE.md` referenciam `change-reviewer` em todas as seções que hoje citam o nome antigo (tabelas de agents e skills, instalação do `/flow-lite`, perfil, telemetria)
  - And existe **uma** nota de migração (no `README.md` ou em `docs/USAGE.md`) dizendo: o nome antigo sai no próximo `ahc sync`; quem pinou roda `ahc unpin emstech-reviewer`; `.emstech-reviewer.json`, o bloco cercado legado, o diretório de estado legado e `EMSTECH_TELEMETRY` seguem aceitos
  - And `skills/change-reviewer/ADOPTION.md` usa o nome novo
  - _Moves GOAL metric?_ **não** — adoção; sem a nota, o dev com pin segue com o reviewer antigo (atrito 1 da §1).

- [ ] **AC-14 — Gates do repo verdes** _(Comando)_
  - Then `node scripts/validate-artifacts.js --strict` sai 0 com **0 errors e 0 warnings**
  - And `node scripts/regen-manifest.js --check` sai 0
  - And `node --test test/*.test.js` passa
  - _Moves GOAL metric?_ **não** — gate de merge; é o que leva as descriptions novas aos devs.

- [ ] **AC-15 — Review do autor da #26** _(Comando)_
  - Then `gh pr view <PR da 004> --json reviews` mostra review `APPROVED` de Gabriel Marcelo (autor da #26, que criou o `emstech-reviewer`) antes do merge
  - _Moves GOAL metric?_ **não** — decisão do lead: o dono do reviewer valida o rename e a restrição de alcance.

### 3.1 Linkagem com a GOAL metric
AC-01 **é** a métrica. AC-03 e AC-07 atacam as causas que ela mede; AC-02 e AC-10 são pré-requisitos para medi-la; AC-11 é a guarda que a mantém depois do merge. Os demais protegem o que o rename não pode quebrar (AC-04, AC-05, AC-06, AC-12, AC-13) ou são gates de merge (AC-08, AC-09, AC-14, AC-15).

## 4. Out of scope

- **Criar agents para as lacunas do hub.** Flutter/Dart é a demanda 002; Java/Spring, SAP, contratos, MySQL e Azure ficam fora. No eval, lacuna hoje cai em LACUNA (5/6) — ausência de especialista, não roteamento errado.
- **Mudar o comportamento do gate ou as regras do reviewer.** Rule engine, perfis (`default.json`, `regulated.json`), schemas (fora `$id`/`title`), exit codes, formato de `gate.json`/`gate.md` e o fluxo do `/flow-lite` continuam iguais. O rename muda nome e alcance da description, não o que o reviewer faz.
- **Tornar o `change-reviewer` o revisor padrão de PR.** Revisão genérica de PR continua fora do alcance dele (decisão do lead); `/code-review` e a skill `pr-review` não mudam.
- **Rodar o eval na CI** ou como hook. Custo real e resultado não determinístico; roda sob demanda (AC-10/AC-11).
- **Remover a compatibilidade com o LEGADO.** Fica para uma demanda futura, com dado de uso que mostre que ninguém depende mais dele.
- **Migrar ou apagar `~/.claude/.emstech-reviewer/` na máquina do dev.** O sync só remove o que instalou (`business.md:45`); o diretório é lido como fallback, não movido.
- **Revisar outras descriptions** além de `change-reviewer`, `system-architect` e `project-memory-keeper`, e outros frontmatters além de `senior-product-owner` e `aws-devops-engineer`. O eval deu 21/21 claros e 21/21 de fronteira; não há evidência para mexer nos demais.
- **Ampliar o evalset** além dos 73 casos atuais (fora o ajuste de rótulo do rename). Os casos da `flutter-dart-engineer` são responsabilidade da 002, exigidos pelo AC-11 quando ela mergear.
- **Medir o roteamento em sessão interativa real** ou com os agents locais de `~/.claude/agents` — o eval mede as descriptions do hub isoladas, que é o que o hub controla (premissa 2 do discovery).
- **Rodar o eval em sonnet** (experimento 2 do discovery). A métrica é em opus.

## 5. Implementation guide _(PLAN — Architect)_

**Base verificada:** `origin/main` = `d78e998` (BASE). Worktree em `9b8940c` (só `docs/`). Contagens medidas nesta fase: `git grep -c -i emstech` toca 33 arquivos; o evalset tem 73 casos, IDs únicos, e **cada um dos 21 agents tem exatamente 1 caso `clear` e 1 `boundary`** — o invariante do AC-11 já passa sobre os dados atuais depois do re-rótulo `rev-1`/`rev-2`. Soma das `description` dos 21 agents: **19 619 chars** (`emstech-reviewer` 854, `system-architect` 603, `project-memory-keeper` 1 172).

### 5.1 Componentes tocados

| Caminho | Mudança | AC |
|---|---|---|
| `agents/emstech-reviewer.md` → `agents/change-reviewer.md` | `git mv`; `name`; `description` restrita; corpo com o nome novo | 02, 03, 08 |
| `skills/emstech-reviewer/` → `skills/change-reviewer/` | `git mv` do diretório; `SKILL.md` (`name` e `description`); `schema/*.json` (`$id`, `title`, descrições); comentários e `render-md.js:43`; `gate-run.js:202` (`outputSchema`, ponteiro funcional) | 02, 12 |
| `skills/change-reviewer/scripts/lib/legacy.js` | **Novo.** Fonte única dos nomes LEGADO (ver 5.2) | 05, 12 |
| `skills/change-reviewer/scripts/lib/profile.js` | Resolve `.change-reviewer.json` → `.emstech-reviewer.json` | 05 |
| `skills/change-reviewer/scripts/lib/context.js` | `BLOCK_RE` aceita as duas tags | 05 |
| `skills/change-reviewer/scripts/lib/version.js` | Alinhar `AGENT_VERSION` à versão final da skill no manifest (último commit de código) | 06 |
| `skills/flow-lite/scripts/lib/telemetry.js` | `require` de `../../../change-reviewer/`; `stateDir`, `isDisabled`, `acknowledged`, `resolveEndpoint`, `purge` com compat; `service.name` = `change-reviewer` | 02, 05, 06 |
| `skills/flow-lite/scripts/lib/batch.js` | `require` de `../../../change-reviewer/scripts/lib/git-readonly` | 02 |
| `skills/flow-lite/scripts/flow-lite.js` | `*_TELEMETRY_SYNC` novo + legado | 05, 06 |
| `skills/flow-lite/{SKILL.md,TELEMETRY.md}` | Nomes novos; data da troca de `service.name`; opt-out nas duas fontes | 06, 13 |
| `commands/flow-lite.md` | Caminho `~/.claude/skills/change-reviewer/scripts/gate.js`, dispatch do agent `change-reviewer`, perfil, opt-out | 02, 13 |
| `agents/system-architect.md`, `agents/project-memory-keeper.md` | `description` com a regra de ADR + 1 exemplo cada | 07, 08 |
| `agents/senior-product-owner.md`, `agents/aws-devops-engineer.md` | `model: sonnet` / `model: opus` (tier segue `reasoning`) | 09 |
| `scripts/validate-artifacts.js` | Regra `model` × `tier` (erro nos dois modos) | 09 |
| `scripts/routing-eval/**` | **Novo** (EVAL) — ver 5.4 | 10 |
| `docs/discovery/revisao-escopo-agents/` | Saem `build-agents.js`, `route-one.js`, `run-eval.js`, `agents.json`, `evalset.json`, `evalset-hard.json`; ficam os 3 JSON de resultado | 10 |
| `test/emstech-reviewer-{diff,gate,stages}.test.js` → `test/change-reviewer-*.test.js` | `git mv`; constante `SCRIPTS`; prefixos de `mkdtemp`; `BLOCK` com a tag nova | 02, 12 |
| `test/change-reviewer-gate.test.js` | Casos de compat de perfil e bloco (AC-05) | 05 |
| `test/flow-lite-summary-telemetry.test.js` | `service.name`; env nova; casos de compat de estado/opt-out/ack; limpeza das **duas** famílias de env | 05, 06 |
| `test/prune.test.js` | Caso da categoria agent (e pin) | 04 |
| `test/validator.test.js` | 2 fixtures (`haiku`+`reasoning`, `opus`+`speed`), modo normal e `--strict` | 09 |
| `test/routing-eval.test.js` | **Novo** — invariantes do evalset, sem modelo | 11 |
| `manifest.json` | **Só por `regen-manifest.js`**, exceto o campo `description` de item (README §Adicionando, passo 3) | 02, 14 |
| `README.md`, `docs/USAGE.md`, `skills/change-reviewer/ADOPTION.md` | Nome novo, nota de migração, regra `model` × `tier`, seção "Adicionando um agent" com o EVAL | 09, 11, 13 |
| `docs/adr/0002-*.md` | **Novo** — ver 5.8 | — |

`bin/ahc` **não muda**: `pruneOrphans` (`bin/ahc:860-895`) já itera `CATEGORIES`, que inclui `agents` (`bin/ahc:25-26`); o AC-04 é só teste novo. `install.sh`, `.github/workflows/`, perfis (`profiles/*.json`), rule engine, exit codes e formato de `gate.json`/`gate.md` ficam byte-idênticos em comportamento (fora de escopo, §4).

### 5.2 Novos contratos

| Contrato | Nome novo | LEGADO aceito |
|---|---|---|
| Agent | `change-reviewer` (`agents/change-reviewer.md`) | — (sai pelo `pruneOrphans`) |
| Skill | `change-reviewer` (`skills/change-reviewer/`, `~/.claude/skills/change-reviewer/scripts/gate.js`) | — (sai pelo `pruneOrphans`) |
| Diretório de estado | `~/.claude/.change-reviewer/` | `~/.claude/.emstech-reviewer/` |
| Override do diretório | `CHANGE_REVIEWER_HOME` | `EMSTECH_REVIEWER_HOME` |
| Opt-out por env | `CHANGE_REVIEWER_TELEMETRY=off` | `EMSTECH_TELEMETRY=off` |
| Endpoint por env | `CHANGE_REVIEWER_TELEMETRY_ENDPOINT` | `EMSTECH_TELEMETRY_ENDPOINT` |
| Envio síncrono | `CHANGE_REVIEWER_TELEMETRY_SYNC=1` | `EMSTECH_TELEMETRY_SYNC=1` |
| Arquivo de perfil no repo alvo | `.change-reviewer.json` | `.emstech-reviewer.json` |
| Bloco cercado no `CLAUDE.md` | ` ```change-reviewer ` (e ` ```json change-reviewer `) | ` ```emstech-reviewer ` (e ` ```json emstech-reviewer `) |
| `service.name` do evento OTLP | `change-reviewer` | — (data da troca em `TELEMETRY.md`) |
| `$id` dos schemas | `change-reviewer/agent-findings/v1`, `change-reviewer/gate-result/v1` | — (só identificador; nenhum código resolve `$id`) |

**Módulo `legacy.js`.** Todo literal LEGADO vive num só arquivo, `skills/change-reviewer/scripts/lib/legacy.js`, com cabeçalho explicando por que existe e quando sai (§4: demanda futura com dado de uso). Cada linha que contém o nome antigo contém também `legacy` (identificador `LEGACY_*` ou comentário `// legacy`), o que faz o filtro do AC-12 funcionar por construção. `telemetry.js` importa pelo mesmo caminho relativo que já usa para `version.js`. Remover a compat vira "apagar um módulo e seus chamadores". Nos testes de compat, os literais antigos ficam **pinados** (não importados de `legacy.js`), com `// legacy` na linha, para o teste pegar um `legacy.js` com valor errado (`guidelines.md:56`).

**Regra de precedência novo × LEGADO (AC-05).** Dois princípios, e só dois:

1. **Configuração: o novo vence por inteiro, o legado é fallback.** Nunca se mistura campo de uma fonte com campo da outra.
2. **Opt-out: qualquer fonte desliga, nenhuma fonte religa.** Não existe valor que reative a telemetria contra um `off` ou um `"enabled": false` em qualquer das duas fontes.

| Ponto | Resolução (primeiro que existir vence) |
|---|---|
| Perfil | `--profile` → `<worktree>/.change-reviewer.json` → `<worktree>/.emstech-reviewer.json` → `profiles/default.json`. Se o novo existir, o legado **não** é lido, nem se o novo não tiver a chave `profile` (cai em `default`, como hoje). JSON inválido no arquivo escolhido é `ProfileError` (fail-closed, como hoje), **sem** tentar o outro. |
| Bloco no `CLAUDE.md` | As duas tags são lidas e removidas da prosa (`context.js:72` depende disso: tag não reconhecida viraria prosa entregue ao agent). Dois blocos no mesmo arquivo se somam como dois blocos de mesma tag somam hoje; a precedência entre níveis (`context.js:7-13`) não muda. |
| Diretório de estado (`stateDir`) | `CHANGE_REVIEWER_HOME` → `EMSTECH_REVIEWER_HOME` → `~/.claude/.change-reviewer/` se existir → `~/.claude/.emstech-reviewer/` se existir → `~/.claude/.change-reviewer/` (criado na primeira escrita). Config, ack, spool e `last-event` saem **todos** do diretório resolvido. Quem só tem o legado continua escrevendo nele; nada é movido (§4). |
| `endpoint` + `headers` | Do mesmo `config.json` (o do diretório resolvido) → `CHANGE_REVIEWER_TELEMETRY_ENDPOINT` → `EMSTECH_TELEMETRY_ENDPOINT` → `OTEL_*` (ordem atual de `telemetry.js:65-71`). **Endpoint de uma fonte nunca recebe `headers` do `config.json` da outra** (headers OTLP podem carregar credencial). |
| Desligado (`isDisabled`) | `--no-telemetry` **ou** `CHANGE_REVIEWER_TELEMETRY=off` **ou** `EMSTECH_TELEMETRY=off` **ou** `"enabled": false` no `config.json` do diretório resolvido **ou** no do diretório legado padrão (`~/.claude/.emstech-reviewer/config.json`, lido sempre, mesmo quando o novo existe). A mensagem diz qual fonte desligou. |
| Ack (`acknowledged`) | Ack no diretório resolvido **ou** no legado padrão. `NOTICE_VERSION` **não** muda: o aviso troca nomes, não o que é coletado, e bumpá-lo reapresentaria o aviso a todos (contra o AC-05). |
| `--purge` | Limpa spool e `last-event` do diretório resolvido **e** do legado padrão. Direito de apagar não pode depender de qual nome o dev usou. |
| `*_TELEMETRY_SYNC` | Qualquer um dos dois igual a `1`. |

### 5.3 Data flow

**Roteamento (o que a GOAL mede).** `agents/change-reviewer.md` → PR com manifest regenerado → merge → `SessionStart` → `ahc sync` → `syncCategory` instala `change-reviewer` → `pruneOrphans` remove `emstech-reviewer` (agent e skill) do disco e do lock, salvo pin (`bin/ahc:867`) → Claude Code carrega a `description` nova no roster.

**Gate.** `/flow-lite` → `node ~/.claude/skills/change-reviewer/scripts/gate.js prepare` → `profile.js` (tabela 5.2) + `context.js` (duas tags) → `gate-context.json` → agent `change-reviewer` (gate mode) → `agent-findings.json` → `gate.js finalize`. Única diferença observável para um time adotante: os nomes nos caminhos e no título do `gate.md`.

**Telemetria.** `flow-lite.js summary` → `isDisabled` (qualquer fonte desliga) → `acknowledged` (qualquer fonte vale) → `derive()` (allowlist **inalterada**) → spool no diretório resolvido → `post` para o endpoint resolvido com `service.name=change-reviewer`. Nenhum campo novo no evento, nenhum destino novo.

**EVAL.** `scripts/routing-eval/evalset.json` + `agents/*.md` da branch → `lib/agents.js` monta o `--agents` em memória → `lib/route.js` roda `claude -p` por caso, N RODADAS → JSON por RODADA em diretório de saída (default em `os.tmpdir()`, fora do repo) → `lib/report.js` agrega → stdout + exit code. **CI:** `test/routing-eval.test.js` lê `evalset.json` e `agents/` com `fs` e chama `lib/evalset.js` (puro) e `lib/args.js` (puro). Nenhum processo filho, nenhuma rede.

### 5.4 EVAL — onde mora e como a CI lê sem chamar modelo

**Caminho: `scripts/routing-eval/`** (o sugerido pelo DEFINE; fora de `docs/` e de `test/`; `scripts/` já é "tooling do repo", `architecture.md` §Tech stack; o `regen-manifest` não varre `scripts/`, então o EVAL **não** é distribuído aos devs pelo `ahc sync`, o que é o certo para uma ferramenta de contributor).

```
scripts/routing-eval/
  run.js            CLI. Único ponto que importa lib/route.js
  evalset.json      73 casos (os 48 de evalset.json + os 25 de evalset-hard.json, IDs preservados)
  lib/agents.js     buildAgents(agentsDir) → objeto do --agents, em memória (sucessor de build-agents.js)
  lib/args.js       buildArgs({ prompt, model, agentsJson }) → argv do claude. Puro
  lib/route.js      processo filho + leitura do stream + kill no 1º Agent tool_use (sucessor de route-one.js)
  lib/evalset.js    validateEvalset(cases, agentNames) → erros[]. Puro, sem processo filho
  lib/report.js     summarize(rounds, { min }) → { total, byKind, systematic, cost, exitCode }. Puro
```

- **Comando (AC-10):** `node scripts/routing-eval/run.js --rounds 2 --model opus --min 71 [--conc 4] [--out <dir>] [--cases <evalset>]`. Imprime por RODADA o total e os acertos por `kind`, depois a lista de ERROS SISTEMÁTICOS (errado em todas as N RODADAS) e os caminhos dos JSON. Exit: `0` ok; `1` ERRO SISTEMÁTICO ou total abaixo de `--min` em alguma RODADA; `2` uso inválido ou evalset que falha em `validateEvalset` (pre-flight); `3` `claude` ausente no PATH. `TIMEOUT`/`ERR` contam como erro do caso e aparecem listados à parte.
- **Custo (AC-10, `business.md:49`):** o `route` mata o processo no 1º tool_use, antes do evento `result` que traz `total_cost_usd`. Logo: imprime a soma **só** se todas as chamadas trouxeram custo no stream; senão, `custo: não medido (k de n chamadas sem custo no stream)`. Nunca estima.
- **Sem snapshot:** `agents.json` sai do repo; o `--agents` é montado a cada execução a partir de `agents/*.md` da árvore atual (AC-10).
- **Invariante de segurança do runner** (não é gate de §6, mas é o que impede o eval de executar os pedidos na máquina do contributor com as credenciais dele — `aws-1` pede deploy no ECS): `buildArgs` sempre inclui `--tools Agent`, `--setting-sources ""`, `--strict-mcp-config` e cwd temporário vazio, e **nunca** `--dangerously-skip-permissions` nem `--permission-mode bypassPermissions`; o `route` mata o grupo de processos no 1º `Agent` tool_use e no timeout. Isso é testado via `lib/args.js`, que é puro.
- **Teste da CI (AC-11) — `test/routing-eval.test.js`:** lê `scripts/routing-eval/evalset.json`; lista `agents/*.md` pelo stem (o validator já garante `name` = stem, `validate-artifacts.js:160-161`); chama `validateEvalset`. Asserções: `id` único; `kind` ∈ {`clear`,`boundary`,`gap`,`overlap`,`nostack`}; `expect` não vazio; cada `expect` ∈ agents ∪ LACUNA; todo agent tem ≥ 1 `clear` e ≥ 1 `boundary`. Casos sintéticos inline provam que `validateEvalset` rejeita cada violação, **inclusive "agent novo sem casos"** (lista de agents com um nome a mais), sem mexer no repo. Mais: `summarize` com rodadas sintéticas (exit `1` com sistemático, `1` abaixo do limiar, `0` no caso bom, "não medido" quando falta custo) e `buildArgs` (flags obrigatórias presentes, bypass ausente). O arquivo de teste **não** importa `lib/route.js` e **não pode conter** as palavras `child_process`, `spawn` nem `route-one` — nem em comentário —, porque o grep do AC-11 é textual.
- **Evalset em um arquivo só**, não dois: o contributor tem um lugar para adicionar casos, e o teste lê um arquivo. O `kind` já distingue o que era "hard" (`overlap`, `nostack`).

### 5.5 Rename sem perder histórico, commit a commit

Pré-condição de cada commit: `node --test test/*.test.js` e `node scripts/validate-artifacts.js --quiet` verdes, e `node scripts/regen-manifest.js` rodado **dentro** do commit que muda qualquer artefato (o validator cruza sha e nome com o manifest, `validate-artifacts.js:193-196`). O repo mergeia com merge commit (`d78e998` é "Merge pull request #26"), então os commits intermediários chegam à `main` e o `git log --follow` enxerga o rename.

**Commit do rename (T1) é mecânico e mínimo**, para o git detectar `R` com alta similaridade:
1. `git mv agents/emstech-reviewer.md agents/change-reviewer.md`
2. `git mv skills/emstech-reviewer skills/change-reviewer`
3. `git mv test/emstech-reviewer-{diff,gate,stages}.test.js test/change-reviewer-{diff,gate,stages}.test.js` (um por um)
4. Edições mínimas no mesmo commit: `name:` do agent e do `SKILL.md`; **a `description` do `SKILL.md`** (ver armadilha 1 abaixo); `require` em `batch.js:17` e `telemetry.js:26`; constante `SCRIPTS` nos 3 testes; `commands/flow-lite.md` (caminho do `gate.js` e nome do agent despachado); `skills/flow-lite/SKILL.md:3,11`; `gate-run.js:202`; `$id`/`title` dos 2 schemas.
5. `node scripts/regen-manifest.js` → manifest perde as duas entradas `emstech-reviewer` e ganha `change-reviewer` @ 1.0.0.
6. Os literais LEGADO (`.emstech-reviewer.json`, tag do bloco, diretório de estado, env vars, `service.name`) **ficam intocados neste commit** → comportamento idêntico, suíte verde sem alterar asserções.
7. Conferir antes de commitar: `git diff --cached -M --stat` mostra `R` para os 3 testes, o agent e cada arquivo da skill.

**Armadilhas medidas:**
1. **`regen-manifest` não atualiza `description` de item existente** (`regen-manifest.js:9`: "Description left untouched"); só a extrai ao **criar** a entrada. A skill entra em T1 com a `description` do `SKILL.md` daquele momento. Se o `SKILL.md` ainda disser "emstech-reviewer" em T1, o manifest carrega "emstech" para sempre e o AC-02 (`grep -ci emstech manifest.json` = 0) falha. Por isso a `description` do `SKILL.md` muda **em T1**. Pelo mesmo motivo, T6 e T7 atualizam o campo `description` dos itens alterados no `manifest.json` à mão (README §Adicionando, passo 3, sanciona isso; `--check` não compara `description`).
2. **Bumps de versão por commit.** Cada commit que muda arquivo da skill bumpa patch. Não reverter à mão; em T3 (último commit de código da skill), alinhar `AGENT_VERSION` em `version.js` à versão que o manifest terá depois do regen daquele commit (o comentário de `version.js:2-3` exige isso; `version.js` faz parte do sha, então editar antes e regenerar depois).
3. **Env herdado nos testes.** Dev com `EMSTECH_TELEMETRY=off` no shell faz os testes de telemetria mudarem de resultado. `makeEnv` em `flow-lite-summary-telemetry.test.js:28-30` passa a remover as **duas** famílias (4 legadas + 4 novas).
4. **AC-12 é por linha.** Toda linha que citar o nome antigo em código, teste ou doc de compat precisa de `legacy`/`legado` na **mesma** linha. Prefixos de `mkdtemp` (`'emstech-diff-'` etc.) não são compat: trocam em T1.

### 5.6 Tarefas (ordem de dependência)

| # | Tarefa | Fecha | Depende | Quem |
|---|---|---|---|---|
| T1 | Rename mecânico (5.5), com regen | AC-02 (exceto descrições), parte do AC-12 | — | `nodejs-backend-architect` |
| T2 | `legacy.js` + compat no gate: `profile.js` e `context.js` com a tabela 5.2; testes de compat em `change-reviewer-gate.test.js` (legado só, novo só, os dois → novo vence, bloco legado, bloco novo, os dois blocos) que **falham** num rename sem compat; `BLOCK` do teste passa a usar a tag nova | AC-05 (perfil, bloco) | T1 | `nodejs-backend-architect` |
| T3 | Compat na telemetria: `stateDir`, `isDisabled`, `acknowledged`, `resolveEndpoint`, `purge`, `*_SYNC` em `flow-lite.js`; `service.name` = `change-reviewer`; testes: `config.json` legado com `"enabled": false` e sem diretório novo → nada enviado **nem** no spool; ack legado → aviso não reaparece; `EMSTECH_TELEMETRY=off` → desligado; novo diretório presente + legado `enabled:false` → desligado; endpoint de uma fonte sem headers da outra; `--purge` limpa os dois; asserção de `service.name` em `:295`. Alinhar `AGENT_VERSION` | AC-05 (estado, env, ack), AC-06 (código) | T2 (usa `legacy.js`) | `nodejs-backend-architect` |
| T4 | `test/prune.test.js`: agent órfão removido do disco e do lock com `[removed] agent <nome>`; agent pinado sobrevive com `[pinned]`. Fixture genérica (`ghost-agent`) | AC-04 (teste) | — | `nodejs-backend-architect` |
| T5 | Regra `model` × `tier` no validator (erro em ambos os modos, mensagem com os dois valores; tabela `MODELS_BY_TIER`); 2 fixtures em `validator.test.js` × modo normal e `--strict`; `senior-product-owner` → `sonnet`, `aws-devops-engineer` → `opus`; regen; `README.md` perto de `:750`. **Um commit só**: regra sem os dois agents deixa o validator vermelho | AC-09 | — | `nodejs-backend-architect` |
| T6 | `description` do `change-reviewer`: cláusula de exclusão ("not for generic PR/diff review — that is general-purpose or /code-review"), todos os exemplos citando `/flow-lite`, gate, perfil ou regras; os dois modos mantidos; corpo com o nome novo; `description` no manifest à mão | AC-03, AC-08 | T1 | **Orquestrador** (ver abaixo) |
| T7 | Regra de ADR nas `description` de `system-architect` e `project-memory-keeper` + 1 exemplo cada; manifest à mão se a 1ª linha mudar | AC-07, AC-08 | — | **Orquestrador** |
| T8 | EVAL (5.4): `git mv` dos 3 scripts e de `evalset.json` para `scripts/routing-eval/`, depois reescrita (commits separados: mover, depois editar); fundir `evalset-hard.json` e `git rm` dele; `git rm agents.json`; re-rótulo `rev-1`/`rev-2` → `change-reviewer`; `test/routing-eval.test.js` | AC-10, AC-11 (teste) | T1 | `nodejs-backend-architect` |
| T9 | Docs: `README.md` (tabelas `:283-284`, `:510`, `:800`, instalação, perfil `:323`, seção "Adicionando" `:638` com o passo do EVAL e o aviso de custo/não determinismo), `docs/USAGE.md` (`:76`, `:182-188`, `:319-327`, `:443-452`), `ADOPTION.md`, `TELEMETRY.md` (data da troca de `service.name`, opt-out nas duas fontes), **uma** nota de migração (`ahc unpin emstech-reviewer`, LEGADO aceito) | AC-06 (doc), AC-11 (README), AC-13 | T3, T8 | `nodejs-backend-architect` (texto PT-BR, derivado de grep; não justifica `technical-writer`) |
| T10 | ADR-0002 (5.8) | — | T8 | `project-memory-keeper` (decisão já tomada, só registrar — a própria regra do AC-07) |
| T11 | VERIFY: 2 RODADAS do EVAL em opus com `git rev-parse HEAD` (AC-01); sync BASE → HEAD com o `manifest.json` real em `HOME` descartável (AC-04); grep do AC-12 com e sem `grep -v`; gates do AC-14 com `--strict` | AC-01, AC-04 (cmd), AC-12, AC-14 | T1–T10 | Orquestrador (custo real, fora da CI) |
| T12 | PR + review `APPROVED` de Gabriel Marcelo | AC-15 | T11 | Lead |

**Quem escreve as `description` (T6, T7).** Não o `nodejs-backend-architect`. `description` é prompt de roteamento, não código: o critério de aceite é o comportamento do roteador (AC-01), e quem tem o contexto do discovery (os casos, as decisões do lead, por que `h-rev-generic` cai no reviewer) é o orquestrador do `/flow`. Delegar ao dev de Node não dá nada que ele saiba e perde esse contexto. O risco de o autor "escrever para o eval" é contido porque o eval é fixo e anterior à mudança (73 casos, rótulos do lead). T5 fica com o dev de Node porque ali o frontmatter é dado para o validator, não prompt.

**Paralelismo:** T4, T5 e T7 não dependem de T1, mas todos regeneram `manifest.json`. Na mesma branch, em série, ordem sugerida: T1 → T4 → T5 → T2 → T3 → T6 → T7 → T8 → T9 → T10. Nada de worktrees paralelas nesta demanda: o conflito em `manifest.json` custaria mais que o ganho.

### 5.7 Trade-offs

| Decisão | Opções | Escolha e porquê |
|---|---|---|
| LEGADO que o sync não alcança | (a) rename puro; (b) migrar/mover `~/.claude/.emstech-reviewer/` na 1ª run; (c) ler os dois com precedência | **(c).** (a) reativa telemetria contra opt-out explícito e troca o perfil do gate para `default` em silêncio. (b) escreve na home do dev, é irreversível e está fora de escopo (§4). (c) custa um módulo e dois `existsSync`. |
| Onde mora a compat | inline em cada arquivo × `legacy.js` único | **`legacy.js`**: remoção futura num lugar só e AC-12 satisfeito por construção. |
| Precedência | novo vence em tudo × legado vence em tudo × regra por natureza | **Por natureza**: configuração novo-vence (quem criou o novo quis o novo); opt-out mais-restritivo-vence (errar para o lado de não enviar). Uma regra só para tudo erraria um dos dois lados. |
| EVAL | (a) `scripts/routing-eval/` com `lib/` puros; (b) `scripts/routing-eval.js` + `test/fixtures/routing-eval/`; (c) ficar em `docs/discovery/` | **(a).** (b) põe o dado do produto em `test/`, o que o DEFINE proíbe, e um arquivo único mistura processo filho com lógica testável. (c) é o problema que o AC-10 resolve. |
| Evalset | 2 arquivos (como no discovery) × 1 | **1.** Um lugar para o contributor, uma leitura no teste. |
| Teste da CI | `require` do runner × módulos puros separados | **Puros separados** (`evalset.js`, `report.js`, `args.js`): testam lógica de verdade sem processo filho, e o grep do AC-11 fica 0 sem malabarismo. |
| Regra `model` × `tier` | warning × erro | **Erro nos dois modos** (decisão do lead, AC-09). Tabela no validator, não `if` encadeado. |
| Rename | 1 commit com tudo × commit mecânico + commits de conteúdo | **Mecânico primeiro**: `--follow` e o review do autor da #26 enxergam rename e mudança separados. |

### 5.8 ADR

**Sim, um: ADR-0002 — "Roteamento de agents como comportamento testado".** Muda o contrato de quem adiciona agent (casos obrigatórios, CI vermelha sem eles) e fixa a fronteira determinístico-na-CI / modelo-sob-demanda, que vai ser perguntada ("por que o eval não roda na CI?"). Registra também a regra `model` × `tier` como consequência. Escrito em T10 pelo `project-memory-keeper`.

**Sem ADR** para a política de compat LEGADO: é convenção de rename, não arquitetura. Vai para `guidelines.md` no memory sync ("rename de artefato distribuído: configuração novo-vence, opt-out mais-restritivo-vence, literais legados num módulo único").

### 5.9 NFR impact

| NFR | Impacto | Ameaça a GOAL? |
|---|---|---|
| Tempo da CI | +1 arquivo de teste com leitura de JSON e funções puras; +4 casos em testes existentes. Estimado < 100 ms (a medir no VERIFY com `node --test`) | Não |
| Sync no SessionStart | Uma vez por máquina: 1 agent + 1 skill removidos, 1 + 1 instalados. Nenhum round trip novo | Não |
| Contexto do roster (toda sessão, todo dev) | Hoje 19 619 chars. **Orçamento:** ≤ +1 000 chars no total (exclusão no `change-reviewer`, 1 exemplo em cada agent de ADR) | Não, se respeitado |
| Telemetria | Até 2 `existsSync` a mais por chamada. Allowlist e destino inalterados | Não |
| Comportamento do gate | Zero (§4). As asserções dos 3 testes renomeados não mudam em T1 | Não |
| Custo do EVAL | 146 chamadas `claude -p` opus por verificação (2 × 73), mortas no 1º tool_use. Custo **não medido** hoje pela mesma razão do 5.4. Fora da CI | Não |
| **Ruído do modelo** | Baseline 70/73 com 1 sistemático; os 2 erros restantes (`h-nostack-api`, `gap-sap`) são ruído ou defensáveis. Tirando `h-rev-generic`, o esperado é 71–72, **com margem de 0–1 caso** sobre o alvo ≥ 71 | **Sim — é o risco principal da GOAL.** Um desvio de ruído derruba o AC-01 sem regressão real. Mitigação: o critério de ERRO SISTEMÁTICO (2/2) é o que importa; se uma RODADA der 70, rodar uma 3ª e reportar as três, sem trocar o alvo |

**Afeta o GOAL:** diretamente. T6/T7 atacam a causa medida, T8 é o instrumento, e o teste de T8 é a guarda que mantém a métrica depois do merge.

### 5.10 Conflito com a demanda 002 (`flutter-dart-engineer`)

Estado medido: `origin/feat/002-flutter-dart-engineer` tem só docs (`task.md`, discovery); o `agents/flutter-dart-engineer.md` ainda não está commitado. Frontmatter planejado `opus`/`reasoning`, que já passa no AC-09.

- **Ordem recomendada: 004 mergeia antes da 002.** Ao rebasear, a 002 fica vermelha no `test/routing-eval.test.js` até adicionar ao `scripts/routing-eval/evalset.json` ≥ 1 caso `clear` e ≥ 1 `boundary` esperando `flutter-dart-engineer`. O `boundary` deve ser contra `ux-designer-mobile` (o único agent que cita Flutter hoje, 002 §5.4). Pelo README novo, a 002 roda o EVAL com 2 RODADAS e cola o resultado no PR. Isso é o experimento 3 do discovery, e resolve a limitação que a própria 002 declarou em §5.4 ("nada neste repo mede roteamento"). Recomendo que a 002 atualize a §5.4 e acrescente um AC para isso no rebase.
- **`manifest.json` no rebase:** conflito certo. Resolver rodando `node scripts/regen-manifest.js` sobre a árvore rebaseada, nunca à mão.
- **Se a ordem inverter (002 antes):** o teste da 004 fica vermelho para `flutter-dart-engineer`. Nesse caso a 004 adiciona os 2 casos (desvio do §4 registrado na §8), e o AC-01 continua medido sobre os **73 IDs da BASE** (`run.js --cases` com cópia filtrada), para a comparação com o baseline seguir válida.

## 6. Sensitive surface _(PLAN → triggers Security)_
- [ ] Auth / AuthZ  · [x] Secrets  · [x] PII  · [ ] Payments
- [ ] File upload/download  · [ ] Deserialization  · [ ] Raw SQL / shell exec
- [ ] Multi-tenant isolation  · [ ] New external integration / trust boundary

**Justificativa por caixa:**
- **[x] PII.** O evento de adoção carrega `identity.userId` = sha256 salgado do `git config user.email` (`telemetry.js:108-121`). É dado pseudonimizado, que continua sendo dado pessoal (LGPD). Esta demanda não adiciona campo nem destino, mas **reescreve o controle que decide se esse dado sai da máquina**: `isDisabled`, `acknowledged`, `stateDir`, `purge`. Uma regressão aqui envia dado de quem fez opt-out explícito, exatamente o modo de falha que o DEFINE identificou no rename puro. Pede revisão de: regra "qualquer fonte desliga" (5.2), cobertura dos testes do AC-05, `--purge` nas duas fontes, e o texto do aviso (`TELEMETRY.md`) continuar descrevendo com exatidão onde fica o opt-out, sem bump de `NOTICE_VERSION`.
- **[x] Secrets.** `config.json` do diretório de estado guarda `headers` OTLP, que podem conter credencial do coletor (`telemetry.js:74-77`). A nova resolução de diretório escolhe **qual** `config.json` é lido e para **qual** endpoint os headers vão. Controle exigido: endpoint e headers da mesma fonte (5.2). Registro de risco **pré-existente e fora de escopo** para o security avaliar: sem `headers` no config, `resolveHeaders` usa `OTEL_EXPORTER_OTLP_HEADERS` mesmo quando o endpoint veio de `EMSTECH_TELEMETRY_ENDPOINT`, e esses headers podem ir para um host diferente do coletor OTEL.
- **[ ] New external integration / trust boundary.** O destino não muda: mesma cadeia de resolução de endpoint (`telemetry.js:65-71`), com uma env nova na posição da antiga. Mesmo transporte, mesma allowlist (`derive()`), `service.name` é rótulo e não campo de conteúdo. O EVAL chama o `claude` CLI com a conta do próprio contributor, sob demanda, com prompts sintéticos versionados (sem dado de usuário). É ferramenta de dev que já existia no discovery, não integração do produto. O invariante do runner (5.4) fica testado.
- **[ ] Deserialization.** `JSON.parse` de `.change-reviewer.json` e do bloco cercado, que vêm do repo alvo (não confiável), é o **mesmo** parser e o mesmo tratamento de erro de hoje (`profile.js:40-42`, `context.js:76-79`). Muda o nome do arquivo e da tag, não o caminho de parse. A resolução de `profile` por caminho (`byNameOrPath`) não muda.
- **[ ] Raw SQL / shell exec.** O runner usa `spawn('claude', argv)` sem shell (argv em array, prompt como argumento), igual ao `route-one.js` atual. Nenhuma interpolação em string de shell. O risco real, que é o eval executar os pedidos com as credenciais do contributor, está coberto pelo invariante de 5.4 e não é injeção.
- **[ ] Auth/AuthZ, Payments, File upload/download, Multi-tenant isolation.** Não tocados. O piso de 5 pessoas do `aggregate` não muda. Durante a transição, um backend que fatie por `service.name` vê fatias **menores**, o que aumenta a supressão em vez de reduzi-la.

**Aciona o `security-specialist` (Phase 2.5):** sim, por PII e Secrets. O escopo da revisão é `telemetry.js`, `flow-lite.js` (`*_SYNC`), `legacy.js`, os testes do AC-05/AC-06 e `TELEMETRY.md`. O resto da demanda (descriptions, validator, EVAL, rename do gate) fica fora do escopo de segurança.

## 7. Security _(filled if section 6 has any check)_

**Revisão:** `security-specialist`, Phase 2.5, 2026-09-29, sobre o desenho do §5 e o código da BASE no escopo do §6 (`telemetry.js`, `flow-lite.js`, `TELEMETRY.md`, `profile.js`, `context.js`, testes de telemetria) mais o runner do EVAL (`docs/discovery/revisao-escopo-agents/route-one.js`, `build-agents.js`, `run-eval.js`), que o PLAN deixou fora do escopo de segurança e que eu incluí porque chama `claude -p` com a conta do contributor. Secret scan nos arquivos do escopo: limpo (o único acerto é texto explicativo em `docs/discovery/ahc-pat-auth.md:149`, sem valor). Nenhuma dependência nova (zero deps).

**Achados na BASE que o desenho ainda não cobre** (todos pré-existentes, mas no código que T3 reescreve):
- `telemetry --flush` não consulta `isDisabled` (`flow-lite.js:303-307`): spool que sobrou de envio falho sai depois de um opt-out.
- `resolveHeaders` desacopla headers de endpoint (`telemetry.js:74-77`): headers do `config.json` vão para um endpoint vindo de env ou de `--endpoint`, e `OTEL_EXPORTER_OTLP_HEADERS` vai para um endpoint que não é o OTEL. O flush em background repassa o endpoint por argv (`telemetry.js:314`), então no filho a fonte vira sempre `--endpoint`.
- `config.json` inválido cai em `{}` e `enabled` vira `true` (`telemetry.js:42,50`): opt-out corrompido liga a telemetria.
- Com a regra "legado padrão lido sempre", `isDisabled` passa a ler `~/.claude/.emstech-reviewer/` do `os.homedir()` real. Os testes atuais só isolam `EMSTECH_REVIEWER_HOME` (`flow-lite-summary-telemetry.test.js:26-34`), então um dev com opt-out real na máquina muda o resultado da suíte.
- `.claude/settings.json` de um repo adotante pode definir `env` para a sessão do Claude Code. Com isso, o repo aponta `*_TELEMETRY_ENDPOINT` para um host dele, ou `*_REVIEWER_HOME` para um diretório versionado com `config.json` (endpoint e `salt` conhecidos) e `telemetry-ack.json`. O efeito é envio sem aviso, e com `salt` conhecido o `userId` pode ser revertido por dicionário de e-mails da org. Já é possível hoje com `EMSTECH_*`; o rename dobra o número de variáveis.

### 7.1 STRIDE

| # | Asset | Threat | Likelihood | Impact | Existing control | Gap |
|---|---|---|---|---|---|---|
| S1 | E-mail pseudonimizado (`identity.userId`) de quem fez opt-out | **I** — rename religa a telemetria contra `"enabled": false` legado ou `EMSTECH_TELEMETRY=off` | Alta (é o que rename puro faz) | Alto (LGPD: dado pessoal enviado contra recusa explícita) | Princípio 2 do §5.2; testes do AC-05 planejados em T3 | `isDisabled` planejado lê só o diretório resolvido e o legado padrão. Ficam de fora `EMSTECH_REVIEWER_HOME` quando `CHANGE_REVIEWER_HOME` existe e o novo padrão quando há override. `config.json` inválido liga a telemetria. Não há teste "novo `enabled: true` não religa legado `false`". Os testes leem o `HOME` real |
| S2 | Mesmo dado, já no spool | **I** — `telemetry --flush` (manual ou filho em background) envia spool depois do opt-out | Média | Médio | Nenhum: `flow-lite.js:303` não chama `isDisabled` | Flush sem checagem de opt-out |
| S3 | Credencial do coletor em `headers` OTLP (`config.json`, `OTEL_EXPORTER_OTLP_HEADERS`) | **I** — headers de uma fonte vão para o endpoint de outra (diretório novo × legado, env, `--endpoint`) | Média | Alto (credencial entregue a host de terceiro) | §5.2: "endpoint de uma fonte nunca recebe headers do `config.json` da outra" | Regra cobre só diretório × diretório. Env/flag × `config.json` e OTEL headers × endpoint não-OTEL continuam (`telemetry.js:74-77`). Flush em background perde a fonte (`--endpoint` no argv, visível em `ps`) |
| S4 | Destino do evento e aviso da 1ª run | **S/I** — repo adotante redireciona o envio ou forja ack via `env` no `.claude/settings.json` (`*_TELEMETRY_ENDPOINT`, `*_REVIEWER_HOME`) | Baixa | Alto | Endpoint aparece na linha de telemetria do run summary | Nada mostra **de onde** vieram o diretório de estado e o endpoint; o ack vale de qualquer diretório resolvido. Correção completa fica fora do escopo (follow-up F1) |
| S5 | Perfil do gate (`regulated` → `default`) | **T** — `.change-reviewer.json` novo (inclusive adicionado pela própria mudança revisada) sombreia `.emstech-reviewer.json` em silêncio. Rename puro cai em `default` | Média | Alto (gate enfraquecido sem sinal) | `profile.name`/`path` em `gate-context.json` (`gate-run.js:172`) e rótulo no `gate.md` (`:237`); `ProfileError` em JSON inválido | Nenhum sinal de que o legado foi ignorado. Falta teste de "novo sem `profile` não lê legado" e de "novo inválido não tenta o legado" |
| S6 | Integridade das diretivas do `CLAUDE.md` | **E/T** — bloco com a tag nova passa por caminho de parse diferente e escapa de `FORBIDDEN_KEYS`/`ALLOWED_KEYS`; ou a tag não é removida da prosa e o JSON chega ao agent como texto | Baixa | Alto (desliga regra ou rebaixa severidade) | Parse único em `context.js:68-105`; `directivesIgnored` | Nenhum teste de paridade entre as duas tags |
| S7 | Allowlist do evento (`derive()`) | **I** — o rename acrescenta campo (fonte do diretório, `legacy`, caminho) ao evento ou ao envelope | Baixa | Médio | Teste de ausência de paths e chaves (`:164`); `--dry-run` = bytes enviados (`:275`) | Nenhum teste fixa o **conjunto** de chaves nem os atributos de `resource` |
| S8 | Direito de eliminação local | **R** — `--purge` limpa só um diretório e deixa spool/`last-event` no outro | Média | Médio | `purge()` no diretório atual (`telemetry.js:268`) | Planejado para 2 diretórios; faltam os overrides |
| S9 | Transparência do aviso | **R** — `TELEMETRY.md` descreve só um caminho de opt-out, e o dev não acha o que desliga | Média | Baixo | `--notice` imprime `TELEMETRY.md`; `NOTICE_VERSION` não muda (correto: o que é coletado não muda) | Nenhum teste de que o aviso cita as duas famílias |
| S10 | Credenciais e máquina do contributor (AWS, GitHub, shell) | **E** — o EVAL executa o pedido do caso (`aws-1`: deploy no ECS) em vez de só roteá-lo, se `--setting-sources ""` não surtir efeito, se o agent montado herdar ferramentas ou se o kill no 1º `tool_use` perder a corrida | Baixa | Crítico | Invariante do §5.4 (`--tools Agent`, `--setting-sources ""`, `--strict-mcp-config`, cwd vazio, sem bypass, kill do grupo), testado em `buildArgs`; `-p` sem regra de allow nega ferramenta fora da lista; corpo do agent é stub (`build-agents.js:10`) | Teste de argv não prova o ambiente efetivo. `agents.js` não tem allowlist de chaves: um frontmatter futuro com `tools`, `permissionMode`, `mcpServers` ou `hooks` passaria adiante |
| S11 | Segredos no ambiente e no disco do contributor | **I** — a saída do EVAL grava stream bruto ou stderr (evento `init`, caminhos, sessão), ou a sessão fica persistida em `~/.claude/projects/` | Baixa | Médio | `run-eval.js` grava `{...caso, got, cost, ok}`; stderr do filho é `ignore` | Nada fixa o formato da saída; sessões são persistidas (falta `--no-session-persistence`); env herdado inteiro (follow-up F4) |
| S12 | CPU e custo do contributor | **D** — processos `claude` órfãos ou sem limite | Baixa | Baixo | `detached` + `kill(-pid)` no 1º `tool_use`, no `result` e no timeout; `--conc` | Sem gap relevante |

### 7.2 Required controls (must ship in BUILD)

Cada controle tem um teste que **falha** sem ele. Nomes de fixture genéricos; literais legados pinados com `// legacy` (§5.2).

- [ ] **C1 (T3) — Opt-out por união e fail-closed.**
  - `isDisabled` desliga se houver `--no-telemetry`, `CHANGE_REVIEWER_TELEMETRY` ou `EMSTECH_TELEMETRY` igual a `off` (trim, sem diferenciar maiúsculas), ou `enabled === false` no `config.json` de **qualquer** candidato que exista: `CHANGE_REVIEWER_HOME`, `EMSTECH_REVIEWER_HOME`, `~/.claude/.change-reviewer/`, `~/.claude/.emstech-reviewer/`.
  - Um `config.json` que existe mas não parseia conta como desligado. Nenhum valor religa.
  - Teste de matriz em `flow-lite-summary-telemetry.test.js`:
    - legado `false` + novo `true`;
    - `EMSTECH_TELEMETRY=off` + `CHANGE_REVIEWER_TELEMETRY=on`;
    - `EMSTECH_REVIEWER_HOME` com `false` + `CHANGE_REVIEWER_HOME` definido;
    - JSON inválido.
  - Cada caso checa 0 requests num servidor HTTP local, spool vazio e sem `last-event`. `makeEnv` passa a apontar `HOME` para um diretório temporário e a remover as duas famílias de env.
- [ ] **C2 (T3) — Flush respeita opt-out.** `telemetry --flush` e o filho em background chamam `isDisabled` antes de ler o spool. Desligado significa 0 envios e spool intocado. Teste: evento no spool + `EMSTECH_TELEMETRY=off` + `--flush` contra servidor local → 0 requests.
- [ ] **C3 (T3) — Endpoint e headers da mesma fonte.**
  - Uma função pura `resolveTransport` devolve `{ endpoint, headers, source }`:
    - endpoint de `config.json` do diretório X → headers de X;
    - endpoint `OTEL_*` → `OTEL_EXPORTER_OTLP_HEADERS`;
    - `--endpoint` ou `*_TELEMETRY_ENDPOINT` → **sem** headers de autenticação.
  - O filho em background resolve o transporte sozinho, sem endpoint no argv. `--endpoint` explícito do usuário é repassado.
  - Teste unitário da matriz e teste de integração com servidor local capturando headers: headers do `config.json` nunca chegam a um endpoint de env; headers do diretório legado nunca chegam ao endpoint do novo.
- [ ] **C4 (T3) — Proveniência visível.** A linha de telemetria do run summary e o `--notice` mostram o diretório de estado com a fonte (`CHANGE_REVIEWER_HOME`, `EMSTECH_REVIEWER_HOME (legacy)`, padrão ou padrão legado) e a fonte do endpoint. Teste: asserção textual nos quatro casos. É a mitigação de detecção do S4.
- [ ] **C5 (T3) — `--purge` em todos os candidatos.** Remove spool e `last-event` de cada candidato do C1 que exista. Teste: estado nos dois diretórios padrão (via `HOME` temporário) e num override; depois do purge, nada resta.
- [ ] **C6 (T3) — Allowlist congelada.**
  - Um teste compara o conjunto de caminhos-folha de `derive()` com uma lista pinada da BASE.
  - Os atributos de `resource` do envelope são exatamente `service.name=change-reviewer` e `service.version`.
  - Nenhum campo de fonte, diretório ou `legacy` entra no evento. `--dry-run` continua byte a byte igual ao corpo enviado.
- [ ] **C7 (T2) — Perfil sem troca silenciosa.**
  - Testes em `change-reviewer-gate.test.js`: só legado; só novo; os dois (vence o novo); novo inválido → `ProfileError` sem tentar o legado; novo sem `profile` → `default` sem ler o legado.
  - Com os dois arquivos presentes, `prepare` emite em stderr um aviso que nomeia os dois arquivos, o perfil escolhido e que o legado foi ignorado. O teste checa esse aviso. `gate.json` e `gate.md` não mudam (§4).
- [ ] **C8 (T2) — Paridade das tags do bloco.**
  - Um único `BLOCK_RE` com alternância (`(?:change|emstech)-reviewer`, este com `// legacy`).
  - Teste: o mesmo JSON com `disableGate` e `severity` sob ` ```change-reviewer ` e ` ```json emstech-reviewer ` produz `directives` e `directivesIgnored` idênticos, e nenhum dos dois blocos aparece em `prose`.
  - Uma tag parecida (` ```change-reviewer-x `) continua prosa e não vira diretiva.
- [ ] **C9 (T8) — Argv do EVAL fechado.**
  - `buildArgs` inclui `--tools Agent`, `--setting-sources` seguido de `""` como elemento próprio, `--strict-mcp-config` e `--no-session-persistence`.
  - Não inclui `--mcp-config`, `--settings`, `--add-dir`, `--allowedTools`, `--dangerously-skip-permissions` nem `--permission-mode`.
  - Teste em `test/routing-eval.test.js` sobre `lib/args.js`.
- [ ] **C10 (T8) — Guarda do ambiente efetivo.**
  - Uma função pura `checkInit(event)` valida o evento `system/init` do stream: `tools` ⊆ {`Agent`, `Task`} e `mcp_servers` vazio.
  - Se falhar, `route` mata o grupo antes de qualquer `tool_use` e devolve `ENV_UNSAFE`, e `run.js` sai com `2`.
  - Teste com eventos sintéticos. No T11, a §8 registra o `init` real de uma chamada (só `tools` e `mcp_servers`).
- [ ] **C11 (T8) — Agents montados só com `description` e `prompt` stub.** `lib/agents.js` descarta qualquer outra chave do frontmatter (`tools`, `model`, `permissionMode`, `mcpServers`, `hooks`). Teste: fixture com essas chaves → saída com exatamente 2 chaves por agent.
- [ ] **C12 (T8) — Saída do EVAL com allowlist.** O JSON por RODADA grava só `id`, `kind`, `expect`, `prompt`, `got`, `ok` e `cost`. Stream bruto e stderr do filho nunca são persistidos; o diretório de saída padrão vem de `mkdtemp` em `os.tmpdir()`. Teste na função pura que serializa, em `lib/report.js`.
- [ ] **C13 (T9) — Aviso descreve as duas fontes.**
  - `TELEMETRY.md` lista `CHANGE_REVIEWER_TELEMETRY=off`, `EMSTECH_TELEMETRY=off (legado)`, os dois caminhos de `config.json` e a regra "headers só vão ao endpoint da mesma fonte".
  - Teste: a saída de `telemetry --notice` contém as duas variáveis. `NOTICE_VERSION` fica em 1.

### 7.3 Follow-ups (fora desta demanda, não bloqueiam)

- **F1 (S4)** — Env vinda do `.claude/settings.json` de repo adotante. Considerar ack válido só em diretório sob `os.homedir()` e aviso quando o endpoint vem de env. Exige demanda própria.
- **F2 (pré-existente)** — O perfil é lido da worktree revisada: a própria mudança pode trocar o perfil que a julga, e `byNameOrPath` resolve caminho fora da worktree (`profile.js:51`). Candidato a regra do gate ("mudança no arquivo de perfil exige segundo aprovador").
- **F3 (pré-existente)** — `enabled: "false"` (string) não desliga. Validar o tipo no `config.json`.
- **F4 (S11)** — Env mínima para o `claude -p` do EVAL. Hoje herda tudo, inacessível só porque as ferramentas estão restritas. Uma allowlist de env quebra auth via Bedrock/Vertex; avaliar com dado.

### 7.4 Veredito de design

**Decision:** APPROVE WITH MITIGATIONS. Nada bloqueia a entrada no BUILD. C1–C13 bloqueiam o **merge**: a Phase 4 recusa se algum faltar ou se o teste dele não falhar sem o controle.

| Severity | Open | Mitigated (por controle obrigatório) | Notes |
|---|---|---|---|
| Critical | 0 | 1 | S10 → C9–C11 |
| High | 0 | 5 | S1 → C1; S3 → C3; S5 → C7; S6 → C8; S4 → C4 (detecção) + F1 |
| Medium | 0 | 4 | S2 → C2; S7 → C6; S8 → C5; S11 → C12 |
| Low | 0 | 1 | S9 → C13; S12 sem gap |

**Secrets:** limpo no escopo · **Dependencies:** nenhuma nova · **Threat model:** este (adicionado nesta demanda)

## 8. QA plan _(VERIFY)_
**Test pyramid:** Unit (pura) — `test/routing-eval.test.js`, `test/validator.test.js`, `test/change-reviewer-gate.test.js`, `test/flow-lite-summary-telemetry.test.js`, `test/prune.test.js`; Integration — `ahc sync` BASE → HEAD em `HOME` descartável (uma vez, abaixo); E2E com modelo — EVAL (AC-01), fora da CI. Fuzz: não se aplica.
**Suíte:** `node --test test/*.test.js` → **400/400** (base 356) · `validate-artifacts.js --strict` 0/0 · `regen-manifest.js --check` limpo — em `1ff0221`.
**GOAL metric observable?** sim — `node scripts/routing-eval/run.js --rounds 2 --model opus`; saídas versionadas em `docs/todo/004-revisao-escopo-agents/eval/`.

**AC-01 — EVAL (comando exato: `node scripts/routing-eval/run.js --rounds 2 --model opus --conc 4 --out <dir>`)**
| HEAD medido | Rodada 1 | Rodada 2 | Erros sistemáticos | Saídas |
|---|---|---|---|---|
| `634c1eb` (pós-T6/T7, rótulos v2) | 71/73 | 71/73 | `gap-sap`, `h-nostack-api` | `eval/634c1eb-r{1,2}.json` |
| `1ff0221` (final, rótulos do lead) | **73/73** | **72/73** (`h-nostack-api` → nodejs) | **nenhum** | `eval/1ff0221-r{1,2}.json` |

`h-rev-generic` → `general-purpose` nas 4 rodadas; `rev-1`/`rev-2` → `change-reviewer`; `h-arch-adr` → `project-memory-keeper`; `h-arch-decide` → `system-architect`. Custo: **não medido** pela ferramenta (145 de 146 chamadas sem custo no stream — o processo é morto no 1º `tool_use`, antes do evento `result`).

**AC-04 — sync real BASE → HEAD (uma vez, 2026-09-29):** `git archive d78e998` e `git archive HEAD` em diretórios temporários; `HOME` descartável com `.ahc-config.json` apontando `file://<base>` → `node <base>/bin/ahc sync` instala `emstech-reviewer` (agent 1.0.1, skill 1.0.2); repo trocado para `file://<head>` → `node <head>/bin/ahc sync` imprime `[added] agent change-reviewer`, `[added] skill change-reviewer 1.0.3`, `[removed] agent emstech-reviewer`, `[removed] skill emstech-reviewer`; `~/.claude/{agents,skills}` só com `change-reviewer`; lock com 0 menções ao nome antigo.

**AC-12 — lista sem o `grep -v` (por arquivo):** `legacy.js` 8 · `test/flow-lite-summary-telemetry.test.js` 17 · `test/change-reviewer-gate.test.js` 6 (AC-05) · `README.md` 5 · `docs/USAGE.md` 1 (nota de migração, AC-13) · `TELEMETRY.md` 6 · `commands/flow-lite.md` 2 · `ADOPTION.md` 2 · `flow-lite/SKILL.md` 1 (doc dos nomes legados, C13). Com o `grep -v`: vazio. `git grep -c -i emstech -- agents/ manifest.json`: 0.

**Verificação independente (general-purpose, sem editar):** 12/13 AC com prova em `634c1eb`; lacunas fechadas depois — AC-12 e AC-08 (`afe5bb1`), AC-03 e AC-12 (redação emendada), AC-04 (sync real acima). O teste do AC-04 passa na BASE por ser guarda de comportamento já existente (`bin/ahc:867`); a prova de mutação está em `824b5e1`.

**Security gate:** APPROVE — C1–C13 com código e teste; secret scan do diff limpo. 4 achados LOW viram follow-up.

**AC traceability:**
| AC | Prova | Status |
|---|---|---|
| AC-01 | EVAL `1ff0221` 73/73 · 72/73, 0 sistemáticos | ✅ |
| AC-02 | greps de nome + `test/change-reviewer-*.test.js` | ✅ |
| AC-03 | inspeção de `agents/change-reviewer.md:3` (emenda: 1 contraexemplo) | ✅ |
| AC-04 | `test/prune.test.js:100-141` + sync real acima | ✅ |
| AC-05 | `test/change-reviewer-gate.test.js:114-180,269-294`; `test/flow-lite-summary-telemetry.test.js:406-474` | ✅ |
| AC-06 | `test/flow-lite-summary-telemetry.test.js:315`; `TELEMETRY.md` | ✅ |
| AC-07 | os 2 `grep -c` = 1 e 1 | ✅ |
| AC-08 | inspeção (`afe5bb1`) | ✅ |
| AC-09 | `test/validator.test.js` (2 fixtures) | ✅ |
| AC-10 | `scripts/routing-eval/` | ✅ |
| AC-11 | `test/routing-eval.test.js`; workflows sem `routing-eval` | ✅ |
| AC-12 | grep acima | ✅ |
| AC-13 | `README.md` nota de migração; `USAGE.md` aponta | ✅ |
| AC-14 | 3 gates verdes | ✅ |
| AC-15 | review do Gabriel Marcelo no PR | ⚠️ merge autorizado pelo lead antes do review |

## 9. Cross-repo peer consults _(optional — only when another repo is touched)_
Sem peer aplicável: sessões abertas em 2026-09-29 (`rm-coin-fb`, `refinmulnivel-11`, `refinmulnivel-a0`) estão em outros repos e a demanda não toca contrato de outro repo.

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
**Início:** 2026-09-29T13:27:10Z
**Fonte:** transcript (só orquestrador) — OTEL em `needs-restart` nesta sessão
**Comando:**
