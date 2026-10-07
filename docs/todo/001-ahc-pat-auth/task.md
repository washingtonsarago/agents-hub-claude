<!-- demand: 001-ahc-pat-auth -->
<!-- created: 2026-09-14 -->
# Change: Autenticação do ahc por PAT fine-grained da org (sem credencial git)

## 0. GOAL _(from /discovery — the anchor for every phase)_
**Discovery brief:** docs/discovery/ahc-pat-auth.md
**Objective (why):** Hoje o `install.sh` (`install.sh:27`) e o `ahc sync` (`bin/ahc:103-119`) clonam o hub INTERNAL com as credenciais git do dev. Quem não tem usuário git ou credential helper configurado não consegue instalar nem sincronizar.
**Success metric:** Taxa de sucesso de install + sync numa máquina sem credencial git
**Baseline:** 0% — 0/1 (source: reprodução 2026-09-14, HOME limpo + `GIT_TERMINAL_PROMPT=0`; `git clone` exit 128 "could not read Username")  →  **Target:** 100% (one-liner + `ahc sync` + `ahc doctor` verdes na mesma reprodução, e teste automatizado da precedência do token) by 2026-09-30
**Leading indicator:** GitHub traffic `count` de clones em 14 dias — baseline 15 clones / 9 únicos (2026-08-31→2026-09-13). `uniques` cai para ~1 após o ship, por design.
**Baseline at ship:** **100%** — E1 ponta a ponta em 2026-09-16 contra o canônico (`?ref=main`), em HOME temporário na CB (sem `~/.gitconfig`, sem credential helper, sem `~/.git-credentials`, sem `gh` e sem node no PATH; `GIT_TERMINAL_PROMPT=0`): instalador **exit 0** com `[ahc] done` e 52 artefatos; `ahc doctor` **9 ✓ · 0 ⚠ · 0 ✗** com a linha `✓ git auth (EMS-NCTECH/agents-hub-claude@main reachable via embutido)`; `ahc list` exit 0; segundo `ahc sync` exit 0 e idempotente (`skipped:52`). Baseline de 2026-09-14 era **0%** (`git clone` exit 128, "could not read Username"). No mesmo run também ficou provado: o cache **não** guardou credencial (`.git/config` sem `extraheader` e sem userinfo), o hook `SessionStart` foi escrito, o Node isolado foi baixado quando faltou node (v24.21.0) e o PAT teve **0 ocorrências** nas saídas do instalador, do `doctor`, do `list` e do `sync` — C9 contra o GitHub real.
**Recommendation:** Go — premissas abertas D1 (tamanho do grupo) e M1 (medição) seguem em paralelo; E1 (spike do token) vira T0

**Escopo confirmado com o lead (2026-09-14):**
- PAT fine-grained **criado pela conta do lead (`washingtonsarago`, membro e admin do hub) com dono dos recursos = `EMS-NCTECH`**, só leitura (`Contents: Read` + `Metadata: Read`), escopo **somente** `EMS-NCTECH/agents-hub-claude`. Sem conta de serviço (não existe no GitHub).
- Token **fixo no código**. Objetivo: não tornar o repo público. **Vazamento do token é risco aceito.** Sem cofre de segredos.
- Precedência **em cascata** (decidido 2026-09-14): `AHC_GITHUB_TOKEN` (env) → `cfg.token` (config) → token fixo → credencial git do próprio dev. Origem recusada → tenta a próxima; falha só se todas forem recusadas. Permite trocar o token sem republicar o `install.sh` e não derruba quem tem credencial se o token fixo for revogado.
- Reinstalação (one-liner de novo) **preserva** o `token` já salvo no config, com modo 600.
- Entrega ao dev sem credencial git: **one-liner `curl ... | bash` publicado na wiki interna**, com o token.
- Contexto: hub com mais de 50 devs; repo `internal`; secret scanning e push protection **do GitHub** desligados (verificado via API em 2026-09-14). **Corrigido em 2026-09-16:** faltou verificar os rulesets da org — o check obrigatório `Datadog PR Gates / No new secrets violations` reprova o literal embutido e bloqueia o merge (ver §7 e o ADR-0001).
- **Distribuição 100% dentro da org (2026-09-15).** O re-escopo de 2026-09-14 (espelho pessoal como origem + publicação automática) foi **revertido**: a ação foi bloqueada pelo controle de segurança do Claude Code (credential leakage), porque o conteúdo do repo internal sairia da org, e o lead escolheu manter tudo no canônico. O espelho segue manual e fora do escopo.
- **T0/E1:** passou contra o espelho com o token antigo, o que valida o mecanismo (injeção por `GIT_CONFIG_COUNT`, fetch em cache existente, classificação do 403). **Precisa ser refeito** com o token novo contra o canônico.
- **Pré-existente corrigido na branch:** `main` vermelha desde o PR #20 (sha antigo em `skills/session-cost`); `regen-manifest.js` rodado em `feat/001-ahc-pat-auth` (session-cost 1.0.1 → 1.0.2), validator 0 erros. O auto-commit do manifest na `main` é recusado pelo ruleset da org, então o manifest precisa ser regenerado no PR.

## 1. Description _(DEFINE — PO)_
**Problem:** Um dev da EMS-NCTECH sem credencial git configurada (sem `gh auth login` e sem credential helper) não consegue instalar nem atualizar o hub. O `install.sh` (`install.sh:21-28`) e os comandos `ahc sync`, `ahc list` e `ahc doctor` (via `gitRefresh`, `bin/ahc:103-119`) só chegam ao repo `internal` pela credencial git da máquina. A falha foi reproduzida em 2026-09-14, com HOME limpo e `GIT_TERMINAL_PROMPT=0`: o `git clone` termina com exit 128 e a mensagem "could not read Username". A dica do `ahc doctor` cita `AHC_GITHUB_TOKEN` (`bin/ahc:542`), mas nenhum código lê essa variável. Quem tentar o override por config esbarra em dois problemas: `ahc config token=...` grava o arquivo sem restringir a permissão, e o próprio `ahc doctor` passa a falhar no check `config file permission` (`bin/ahc:509-524`); além disso, o valor é cortado no segundo `=` (`bin/ahc:628`).

**Business value:** Levar a taxa de sucesso de install + sync numa máquina sem credencial git de 0% para 100% até 2026-09-30. Isso coloca esses devs no mesmo ferramental da engenharia sem tornar o repo público. A demanda também permite trocar o token sem republicar o `install.sh`, porque um token vencido não se corrige pelo próprio `sync`. O tamanho do impacto segue em aberto (D1/E2): a org tem 217 membros, mais de 50 devs usam `ahc sync` e não se sabe quantos estão bloqueados.

**User segment:**
- **Primário:** dev sem credencial git. Tem conta na org e acesso à wiki interna, mas não tem `gh` nem credential helper (máquina nova, Git Bash no Windows, ambiente restrito).
- **Secundário:** dev em onboarding que segue o comando de instalação da wiki.
- **Guarda de regressão:** dev já instalado com credencial funcionando, que recebe o hub pelo hook `SessionStart`. A situação dele não pode piorar.
- **Operador:** lead do hub, que troca o token quando ele vence ou é revogado.

## 2. User stories (INVEST)
- **US1 — Instalação pelo one-liner.** Como dev sem credencial git, quero instalar o hub rodando o one-liner publicado na wiki interna, para ter agents, commands e skills funcionando sem configurar `gh` nem credential helper. _(AC-01, AC-02, AC-03)_
- **US2 — Sync e list com cache já clonado.** Como dev sem credencial git com o hub já instalado, quero que `ahc sync` (inclusive o disparado pelo hook `SessionStart`) e `ahc list` atualizem a partir do cache existente, para receber as novas versões a cada sessão. _(AC-04, AC-05)_
- **US3 — Troca do token por env ou config.** Como dev cujo token embutido venceu ou foi revogado, quero informar um token novo por `AHC_GITHUB_TOKEN` ou `ahc config token=...` e mantê-lo quando rodar o one-liner da wiki de novo, para voltar a sincronizar sem esperar um `install.sh` novo e sem perder o token ao reinstalar. _(AC-06, AC-07, AC-08, AC-15)_
- **US4 — Diagnóstico pelo `ahc doctor`.** Como dev sem credencial git, quero que o `ahc doctor` fique verde quando o acesso funciona, diga qual origem autenticou, avise quais origens foram recusadas e, quando todas falham, explique como informar outra, para resolver sozinho sem precisar entender de git. _(AC-09, AC-10, AC-11)_
- **US5 — Sem regressão para quem já tem credencial.** Como dev que já tem credencial git e o hub instalado, quero que install, sync, list e doctor continuem funcionando como hoje, para não perder o auto-update com esta mudança. _(AC-12, AC-13)_
- **US6 — Fallback em cascata quando uma origem é recusada.** Como dev, com ou sem credencial git, cuja origem de token de maior precedência venceu ou foi revogada, quero que o `ahc` tente as origens seguintes na ordem env → config → embutido → minha credencial git até uma autenticar, para continuar sincronizando sem agir enquanto existir alguma origem válida. Usa a ordem definida na US3 e não depende das demais histórias para entregar valor. _(AC-14)_

## 3. Acceptance criteria (Gherkin)

**Definições usadas nos cenários**
- **Condição de baseline (CB):** HOME temporário vazio; nenhuma credencial git disponível (sem `~/.gitconfig` e sem credential helper, inclusive o da config de sistema do git); `gh` ausente; `GIT_TERMINAL_PROMPT=0`. É a mesma reprodução do baseline de 2026-09-14.
- **Remoto local autenticado:** repo git local, sem rede, que aceita só um conjunto configurável de credenciais, recusa as demais e registra, em ordem, cada credencial recebida. Os testes de CI (`node:test`, que sobem o CLI real e o `install.sh` com HOME temporário, no padrão de `test/helpers.js`) usam esse remoto. Como apontar o CLI e o instalador para ele é decisão do PLAN.
- **T_EMBUTIDO / T_CFG / T_ENV / T_OLD / T_NEW:** tokens distintos usados só nos cenários.
- **C_DEV:** credencial git do próprio dev, distinta de todos os tokens acima.
- **Credential helper simulado:** credential helper git configurado no HOME temporário que fornece C_DEV, representando a credencial do dev (credential helper ou `gh auth`).
- **Origens disponíveis e cascata:** as origens são, nesta ordem, `AHC_GITHUB_TOKEN` (env), `token` de `~/.claude/.ahc-config.json` (config), token embutido e credencial git do dev. Uma origem está disponível quando existe: env e config não vazios; o embutido sempre; a credencial git quando há credential helper ou `gh auth`. O acesso falha só quando **todas** as origens disponíveis são recusadas.
- **Canônico:** `EMS-NCTECH/agents-hub-claude`, repo `internal` da org. É a origem única de install e sync de todos os devs e também recebe os PRs e roda os gates de CI. Nos cenários de CI, o remoto local autenticado faz o papel do canônico.

**O que cada tipo de prova cobre**
| Prova | Cobre | Não cobre |
|---|---|---|
| **CI** (`node --test`, ubuntu, sem token real) | Precedência, cascata de fallback, override, troca de token sobre cache existente, preservação do token na reinstalação, permissão do config, `=` no valor, saídas do doctor, regressão | Canônico real, política de PAT da org, download do `install.sh` pelo `curl`, resposta real do GitHub a token vencido ou revogado, credential helper real (osxkeychain, Git Credential Manager, `gh auth`) |
| **E1** (spike manual, token real, máquina Unix com CB) | F1, F2, F3 e F7 contra o canônico real com o token novo; o one-liner de ponta a ponta; smoke com `gh auth` real (AC-12) | Precedência exaustiva e cascata (ficam com a CI) |

**US1 — Instalação pelo one-liner**

- [ ] **AC-01 — One-liner da wiki numa máquina sem credencial git** _(Prova: E1, contra o canônico real)_
  - Given a CB, com `node` e `git` instalados, e o PAT fine-grained de leitura (dono dos recursos `EMS-NCTECH`, só `EMS-NCTECH/agents-hub-claude`, `Contents` + `Metadata` read-only) válido
  - When o dev roda o one-liner copiado da wiki interna, que baixa o `install.sh` do canônico `EMS-NCTECH/agents-hub-claude` pela API contents (`Accept: application/vnd.github.raw`) usando o token de leitura e o executa com `bash`
  - Then o comando termina com exit 0 sem pedir usuário nem senha
  - And `ahc` fica instalado em `~/.local/bin`, `~/.claude/settings.json` tem o hook `SessionStart` com `ahc sync`, e `~/.claude/.ahc-lock.json` lista os artefatos do manifest do canônico
  - And o `repo` gravado em `~/.claude/.ahc-config.json` e o cache clonado apontam para `EMS-NCTECH/agents-hub-claude`
  - And, na mesma máquina e logo em seguida, `ahc sync` e `ahc doctor` terminam com exit 0
  - _Moves GOAL metric?_ **sim**. É a própria medição do target: reproduz a condição do baseline (0%) e precisa passar.

- [ ] **AC-02 — Instalador em HOME limpo contra remoto autenticado** _(Prova: CI)_
  - Given a CB e um remoto local autenticado que aceita só T_EMBUTIDO
  - And nenhum `AHC_GITHUB_TOKEN` e nenhum `~/.claude/.ahc-config.json` prévio
  - When o `install.sh` roda
  - Then termina com exit 0 sem aguardar input
  - And o CLI, o hook `SessionStart` e o lock ficam no mesmo estado do AC-01
  - _Moves GOAL metric?_ **sim**. É a prova automatizada, sem rede, do caminho medido no AC-01.

- [ ] **AC-03 — Instalador não reporta sucesso falso** _(Prova: CI)_
  - Given a CB e um remoto local autenticado que recusa **todas** as origens disponíveis (T_EMBUTIDO e, quando definidos, T_ENV e T_CFG)
  - When o `install.sh` roda
  - Then termina com exit diferente de 0, sem pedir usuário nem senha
  - And não imprime a mensagem final de conclusão (`[ahc] done`)
  - And a saída indica que o acesso ao hub foi recusado
  - And, se alguma origem da cascata for aceita, o instalador não falha: o caso é o do AC-14
  - _Moves GOAL metric?_ **sim**. Sem este AC, uma instalação falha poderia ser contada como sucesso e distorcer a medição.

**US2 — Sync e list com cache já clonado**

- [ ] **AC-04 — Sync e list em cache existente sem credencial git** _(Prova: CI; o E1 repete contra o canônico real)_
  - Given a CB, o hub instalado como no AC-02 (cache já clonado)
  - And o hub recebeu uma versão nova de um agent do manifest
  - When o dev roda `ahc sync`
  - Then termina com exit 0, o agent atualizado é gravado em `~/.claude/agents/` e o lock registra a nova versão
  - And `ahc list` mostra o item na versão nova
  - _Moves GOAL metric?_ **sim**. Cobre a parte "sync" da métrica.

- [ ] **AC-05 — Sync do hook `SessionStart` sem terminal** _(Prova: CI)_
  - Given a CB, cache existente e stdin fechado
  - When roda o comando do hook, `ahc sync --quiet --timeout=5`
  - Then termina sem aguardar input e aplica as atualizações do remoto
  - And, se o remoto recusar uma origem de maior precedência e aceitar uma seguinte, o comando também termina sem aguardar input e aplica as atualizações (cascata do AC-14)
  - And, se o remoto recusar **todas** as origens disponíveis, o comando termina sem aguardar input, mantém intactos os artefatos já instalados e preserva o exit code atual do modo `--quiet`
  - _Moves GOAL metric?_ **sim**. Este é o sync que de fato roda a cada sessão; se travar num prompt, o dev fica sem atualização.

**US3 — Troca do token por env ou config**

- [ ] **AC-06 — Precedência do token** _(Prova: CI)_
  - Scenario Outline: token apresentado ao hub segundo as origens disponíveis
  - Given a CB e um remoto local autenticado que registra o token recebido
  - And `AHC_GITHUB_TOKEN` = `<env>` e o campo `token` de `~/.claude/.ahc-config.json` = `<config>`
  - When o dev roda `ahc sync`
  - Then o token recebido pelo remoto é `<apresentado>`

    | env | config | apresentado |
    |---|---|---|
    | T_ENV | T_CFG | T_ENV |
    | T_ENV | _(ausente)_ | T_ENV |
    | _(ausente)_ | T_CFG | T_CFG |
    | _(ausente)_ | _(ausente)_ | T_EMBUTIDO |
    | `""` (vazia) | T_CFG | T_CFG |
    | _(ausente)_ | `""` (vazio) | T_EMBUTIDO |
  - And o resultado é o mesmo para `ahc list` e para o `ahc doctor`
  - _Escopo:_ com todas as origens aceitas pelo remoto, este AC prova qual token é apresentado **primeiro**; o fallback quando uma origem é recusada é coberto pelo AC-14.
  - _Moves GOAL metric?_ **sim**. O target exige explicitamente "teste automatizado cobrindo a precedência do token".

- [ ] **AC-07 — Valor com `=` gravado por inteiro** _(Prova: CI)_
  - Given um `~/.claude/.ahc-config.json` com `repo`, `branch` e `channel`
  - When o dev roda `ahc config token=abc=def==`
  - Then o arquivo contém `token` com o valor `abc=def==`
  - And `repo`, `branch` e `channel` continuam com os valores anteriores
  - And a regra vale para qualquer chave: o valor é tudo o que vem depois do primeiro `=`
  - _Moves GOAL metric?_ **sim, indireto**. Um token truncado derruba o sync de quem aplicou o override.

- [ ] **AC-08 — Token novo tem efeito sobre cache criado com token antigo (premissa F3)** _(Prova: CI; o E1 confirma contra o canônico real)_
  - Given um cache do hub clonado com sucesso usando T_OLD
  - And o hub passa a recusar T_OLD e a aceitar só T_NEW
  - When o dev define `AHC_GITHUB_TOKEN=T_NEW` e roda `ahc sync`
  - Then termina com exit 0 e aplica as atualizações do remoto, sem que o dev apague o cache nem reinstale
  - And o mesmo vale quando T_NEW é informado por `ahc config token=T_NEW`, sem variável de ambiente
  - And, com T_NEW em config e a variável de ambiente removida, os próximos `ahc sync` e `ahc doctor` continuam com exit 0
  - _Moves GOAL metric?_ **sim**. Sem este AC, a taxa de sucesso cai para 0% na primeira troca de token.

- [ ] **AC-15 — Reinstalação mantém o token da config** _(Prova: CI, Linux/macOS)_
  - Given `~/.claude/.ahc-config.json` com `token` = T_CFG, modo 600 e `repo`, `branch` e `channel` com valores diferentes dos que o instalador vai gravar
  - When o `install.sh` roda de novo, como no one-liner da wiki
  - Then o arquivo continua com `token` = T_CFG
  - And o arquivo continua com modo 600
  - And `repo`, `branch` e `channel` passam a ter os valores definidos pelo instalador nessa execução
  - And `ahc doctor` não reporta ✗ nem ⚠ em `config file permission`
  - _Moves GOAL metric?_ **sim, indireto**. O dev que aplicou o override por config e roda o one-liner de novo perderia o token e, com o embutido recusado, voltaria a falhar no sync.

**US4 — Diagnóstico pelo `ahc doctor`**

- [ ] **AC-09 — Doctor verde sem credencial git** _(Prova: CI; o E1 repete contra o canônico real após o AC-01)_
  - Given a CB, o hub instalado como no AC-02, `settings.json` com o hook e lock válido
  - When o dev roda `ahc doctor`
  - Then termina com exit 0 e sem nenhum check ✗
  - And `git auth` aparece como ✓, com `EMS-NCTECH/agents-hub-claude` como repo alcançável
  - And `ahc CLI up to date` não emite "could not compare with remote"
  - And a saída indica a origem que autenticou (env, config ou embutido)
  - And, quando a primeira origem disponível autentica, `git auth` não emite ⚠ de origem recusada
  - _Moves GOAL metric?_ **sim**. "`ahc doctor` verde" faz parte do target.

- [ ] **AC-10 — Doctor diante de origens recusadas** _(Prova: CI)_
  - **Cenário A — todas as origens disponíveis recusadas**
  - Scenario Outline: nenhuma origem autentica
  - Given a CB, as origens `<disponíveis>` e um remoto local autenticado que recusa todas elas
  - When o dev roda `ahc doctor`
  - Then termina com exit 1 e `git auth` aparece como ✗, com motivo de autenticação recusada
  - And a dica nomeia cada origem tentada e recusada e explica como informar outro token, por `AHC_GITHUB_TOKEN` ou por `ahc config token=...`
  - And a dica não depende de `gh auth login` como única saída

    | disponíveis |
    |---|
    | embutido |
    | env (T_ENV), config (T_CFG), embutido |
    | env (T_ENV), config (T_CFG), embutido, credencial git (credential helper simulado com C_DEV) |

  - **Cenário B — origem de maior precedência recusada, origem seguinte autentica**
  - Scenario Outline: acesso funciona com aviso
  - Given a CB, acrescida do credential helper simulado quando `<credencial git>` = C_DEV
  - And `AHC_GITHUB_TOKEN` = `<env>`, `token` da config = `<config>` e um remoto local autenticado que aceita só `<aceita>`
  - When o dev roda `ahc doctor`
  - Then `git auth` aparece como ✓, com o repo alcançável, e nomeia a origem que autenticou: `<autenticou>`
  - And há um ⚠ para cada origem em `<recusadas>`, que nomeia a origem e explica como substituí-la (atualizar ou remover `AHC_GITHUB_TOKEN`, ou informar outro token por `ahc config token=...`)
  - And o ⚠ não altera o exit code: sem outro check ✗, o doctor termina com exit 0, conforme a regra atual (⚠ = exit 0)

    | env | config | credencial git | aceita | autenticou | recusadas |
    |---|---|---|---|---|---|
    | T_ENV | T_CFG | _(sem helper)_ | T_CFG | config | env |
    | _(ausente)_ | T_CFG | _(sem helper)_ | T_EMBUTIDO | embutido | config |
    | _(ausente)_ | _(ausente)_ | C_DEV | C_DEV | credencial git | embutido |

  - _Decisão (exit 0 no Cenário B):_ o acesso funciona e o sync segue verde. Exit 1 deixaria vermelho o doctor dos devs com credencial git sempre que o token embutido fosse revogado, sem que eles precisem agir, o que contraria o AC-12.
  - _Moves GOAL metric?_ **sim**. Encurta o caminho de volta ao sync verde depois que um token vence e avisa sobre o token velho antes que a última origem válida também caia.

- [ ] **AC-11 — Config gravada pelo ahc não contradiz o doctor** _(Prova: CI, Linux/macOS; no win32 o check segue skipped)_
  - Given `~/.claude/.ahc-config.json` inexistente, ou existente com modo 644 e sem `token`
  - When o dev roda `ahc config token=T_CFG`
  - Then o arquivo fica com modo 600
  - And `ahc doctor` não reporta ✗ nem ⚠ em `config file permission`
  - And vale a mesma garantia para qualquer escrita desse arquivo, feita pelo `ahc` ou pelo instalador, que deixe `token` presente
  - And continua valendo o comportamento atual: um arquivo com `token` e modo 644 criado fora do `ahc` ainda gera ✗ em `config file permission`
  - _Moves GOAL metric?_ **sim**. Sem este AC, o dev que segue a dica de override fica com o doctor vermelho e o target não é atingido.

**US5 — Sem regressão para quem já tem credencial**

- [ ] **AC-12 — Dev com credencial git e instalação existente** _(Prova: CI com credential helper simulado e remoto local no papel do canônico; smoke manual com `gh auth` real de um dev da org durante o E1)_
  - Given um HOME com o credential helper simulado (C_DEV), `token` ausente da config e nenhum `AHC_GITHUB_TOKEN`
  - And um cache do hub clonado pela versão atual do `ahc` (anterior a esta mudança), e um lock com itens instalados, um pin e um arquivo escrito à mão em `~/.claude/agents/`
  - When o dev atualiza para a nova versão e roda `ahc sync`, `ahc list` e `ahc doctor`
  - Then os três terminam com exit 0, sem reinstalar e sem apagar o cache
  - And isso vale tanto com o hub aceitando T_EMBUTIDO, que agora é tentado antes da credencial git, quanto com o hub recusando T_EMBUTIDO e aceitando só C_DEV (a credencial do próprio dev, membro da org)
  - And, no caso de T_EMBUTIDO recusado, o `ahc doctor` mostra `git auth` ✓ pela credencial git e ⚠ para o embutido, com exit 0 (AC-10, Cenário B)
  - And o pin continua respeitado e o arquivo escrito à mão fica intacto
  - And a configuração git global do dev (`~/.gitconfig`, credential helper e as credenciais guardadas nele) fica idêntica à de antes
  - _Moves GOAL metric?_ **não**. É guarda de regressão para os mais de 50 devs ativos.

- [ ] **AC-13 — Suíte existente e origem única seguem verdes** _(Prova: CI)_
  - Given a mudança aplicada
  - When a CI roda `node scripts/validate-artifacts.js --quiet` e `node --test test/*.test.js`
  - Then tudo passa
  - And isso inclui `test/origin.test.js` (`install.sh`, `bin/ahc` e `README.md` só apontam para `EMS-NCTECH/agents-hub-claude`) e os cenários com remoto `file://`, que seguem funcionando sem token
  - _Moves GOAL metric?_ **não**. É guarda de regressão.

**US6 — Fallback em cascata quando uma origem é recusada**

- [ ] **AC-14 — Cascata de origens até uma autenticar** _(Prova: CI)_
  - Scenario Outline: resultado segundo as origens disponíveis e as que o remoto aceita
  - Given a CB, acrescida do credential helper simulado quando `<credencial git>` = C_DEV
  - And `AHC_GITHUB_TOKEN` = `<env>`, `token` da config = `<config>`, e o hub instalado com cache já clonado
  - And um remoto local autenticado que aceita só `<aceita>`, publicou uma versão nova de um agent do manifest e registra em ordem as credenciais recebidas
  - When o dev roda `ahc sync`
  - Then o resultado é `<resultado>`
  - And as credenciais recebidas pelo remoto são as das origens em `<recusadas>`, na ordem da cascata, seguidas da origem em `<autenticou>` quando houver
  - And nenhuma origem posterior à que autenticou é apresentada ao remoto

    | env | config | credencial git | aceita | resultado | autenticou | recusadas |
    |---|---|---|---|---|---|---|
    | T_ENV | T_CFG | _(sem helper)_ | T_CFG | sucesso | config | env |
    | _(ausente)_ | T_CFG | _(sem helper)_ | T_EMBUTIDO | sucesso | embutido | config |
    | T_ENV | T_CFG | _(sem helper)_ | T_EMBUTIDO | sucesso | embutido | env, config |
    | _(ausente)_ | _(ausente)_ | C_DEV | C_DEV | sucesso | credencial git | embutido |
    | T_ENV | T_CFG | C_DEV | C_DEV | sucesso | credencial git | env, config, embutido |
    | _(ausente)_ | _(ausente)_ | _(sem helper)_ | _(nenhuma)_ | falha | — | embutido |
    | T_ENV | T_CFG | C_DEV | _(nenhuma)_ | falha | — | env, config, embutido, credencial git |

  - And **sucesso** significa: exit 0, o agent atualizado gravado em `~/.claude/agents/` e a nova versão no lock, como no AC-04
  - And **falha** significa, para `ahc sync` e `ahc sync --quiet --timeout=5`:
    - nenhum pedido de usuário ou senha e nenhuma espera por input, inclusive rodando com stdin fechado e sem `GIT_TERMINAL_PROMPT` definido;
    - os artefatos já instalados (arquivos em `~/.claude/agents/`, `~/.claude/commands/`, `~/.claude/skills/` e o lock) ficam idênticos aos de antes;
    - o `ahc sync --quiet` preserva o exit code atual desse modo quando o acesso ao hub falha.
  - And o mesmo resultado e a mesma ordem de credenciais valem para `ahc sync --quiet --timeout=5`, `ahc list` e `install.sh`; no `install.sh`, a falha segue o AC-03
  - _Moves GOAL metric?_ **sim**. A métrica mede install + sync em máquina sem credencial git; sem a cascata, um token vencido em env ou config esconde um embutido válido e a taxa volta a 0% até o dev perceber e remover o override. As linhas com C_DEV são guarda de regressão para os mais de 50 devs com credencial: um embutido revogado não pode derrubar o sync deles.

**US3 — complemento (decisão do lead, 2026-09-15; registrado pelo orquestrador)**

- [ ] **AC-16 — `ahc config` não exibe o token inteiro** _(Prova: CI)_
  - Given `~/.claude/.ahc-config.json` com `token` = `github_pat_TESTONLY…0123abcd`
  - When o dev roda `ahc config` sem argumentos
  - Then a saída mostra o campo `token` mascarado, só com o prefixo e os 4 últimos caracteres (`github_pat_…abcd`), e o valor completo não aparece em stdout nem em stderr
  - And `ahc config token=<novo>` confirma a gravação também mascarada
  - And o arquivo em disco continua com o valor completo e com modo 600
  - And os demais campos (`repo`, `branch`, `channel`) aparecem sem alteração
  - _Moves GOAL metric?_ **não**. É um controle de higiene de saída (§7 O6, promovido a obrigatório pelo lead).

## 4. Out of scope
- PAT por usuário (ROADMAP §10).
- Cofre de segredos.
- Controles contra vazamento do token: mascarar o token em logs (a saída de `ahc config` passou a mascarar: decisão do lead em 2026-09-15, AC-16), rotação automática, alerta de expiração e secret scanning. O vazamento é risco aceito pelo lead em 2026-09-14.
- Prompt interativo pedindo o token no instalador, previsto no texto antigo do ROADMAP §1. A entrega é o one-liner da wiki.
- Criação do PAT fine-grained de leitura (dono dos recursos `EMS-NCTECH`, só o canônico, read-only) e publicação da página na wiki interna. São ações do lead fora do repo (E1/T0).
- Espelho pessoal como canal de distribuição e publicação automática — rejeitado em 2026-09-15 (conteúdo da org sairia da org).
- Externos (contractors, parceiros) seguem no espelho manual com credencial própria; não atendidos por esta demanda.
- Corrigir o ruleset da org que rejeita o auto-commit do manifest na `main` canônica. O manifest é regenerado no próprio PR.
- Telemetria de uso e medição de adoção (M1, ROADMAP §5.3), e os experimentos E2/E3. Eles correm em paralelo e não bloqueiam o DONE.
- Validação dedicada em Windows/Git Bash. A CI roda só em `ubuntu-latest`, o E1 roda numa máquina Unix e o check de permissão continua skipped no win32.

## 5. Implementation guide _(PLAN — Architect)_
**Components touched:**
| Componente | Mudança |
|---|---|
| `bin/ahc` | Constante `EMBEDDED_TOKEN` (marcador); `gitBaseURL()` com override de teste restrito a loopback; `credentialSources(cfg)`; `gitEnv(source)`; `classifyGitFailure()`; `gitRefresh()` reescrito com `execFileSync`, URL explícita e timeout; `cmdSync`/`cmdList` com a linha de aviso; `cmdDoctor` com uma cascata só, reaproveitada pelos checks 5 e 6, e o check `git version`; `cmdConfig` corta só no primeiro `=`; `writeConfigFile()` atômico com modo 600 |
| `install.sh` | Preflight `git >= 2.31`; validação de `REPO`/`BRANCH`; a mesma cascata em bash para clone/fetch; config **mesclada** (preserva `token` e chaves desconhecidas; sobrescreve `repo`/`branch`/`channel`) com modo 600; primeira sync que falha → exit ≠ 0, sem `[ahc] done` |
| `manifest.json` | Regenerado na branch (`1733caa`, session-cost 1.0.1 → 1.0.2). O ruleset da org recusa o auto-commit do `regen-manifest.yml` na `main`, então o manifest é regenerado **dentro do PR**. O `regen-manifest.yml` não muda nesta demanda |
| `scripts/make-mirror.js` | Esvazia o valor do token embutido nos dois marcadores. O PAT é da org `EMS-NCTECH` e **não pode sair da org** numa cópia manual do espelho; além disso, só vale para o canônico, e no espelho seria recusado em todo sync e geraria um ⚠ por sessão. O espelho segue manual e fora do escopo; nada publica automaticamente fora da org |
| `test/support/git-auth-server.js` (novo) | Remoto HTTP local autenticado: processo filho Node que envolve o `git http-backend` |
| `test/support/cred-helper.sh` (novo) | Credential helper simulado que devolve C_DEV |
| `test/helpers.js` | `startAuthRemote()`, `makeBareHub()`, `publishAgentVersion()`, `baselineEnv()`, `runInstall()` |
| `.github/workflows/test.yml` | Step `git --version` (rastreabilidade do requisito >= 2.31) |
| `README.md` | Seção de instalação sem credencial (formato do one-liner com placeholder, **sem token**), exemplo do doctor e troubleshooting |

**New contracts:**
- **Origens, em ordem** (id / rótulo exibido): `env` / `env (AHC_GITHUB_TOKEN)` → `config` / `config (token em ~/.claude/.ahc-config.json)` → `embutido` / `embutido` → `git` / `credencial git`. `env`, `config` e `embutido` só existem quando o valor não é vazio. `git` é sempre tentada por último.
- **Token embutido, com valor único em dois lugares marcados:**
  - `bin/ahc`: `const EMBEDDED_TOKEN = ''; // AHC-EMBEDDED-TOKEN`
  - `install.sh`: `AHC_EMBEDDED_TOKEN='' # AHC-EMBEDDED-TOKEN`
  - O valor é um PAT fine-grained cujo **dono dos recursos é a org `EMS-NCTECH`**, criado pela conta do lead (membro da org, admin do repo), com **só** `EMS-NCTECH/agents-hub-claude` selecionado e `Contents: Read` + `Metadata: Read`. Não existe conta de serviço. A distribuição é o one-liner da wiki interna e o próprio código; o vazamento é risco aceito pelo lead.
  - O BUILD entra com `''` (origem indisponível). Na **última tarefa (T14)**, o orquestrador grava o valor real nas duas linhas a partir de um arquivo local. **Nenhum agente lê, escreve ou imprime o valor**; testes, logs e docs usam só os marcadores e placeholders. O `test/embedded-token.test.js` exige que o marcador apareça **exatamente uma vez** em cada arquivo e que os dois literais sejam **idênticos**, e passa tanto com `''` quanto com o valor real.
- **Injeção por invocação** (nada em argv, na URL, em `.git/config` nem em `~/.gitconfig`). Toda chamada git recebe `env` com:
  - `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=''`, `SSH_ASKPASS=''`, `GCM_INTERACTIVE=never`;
  - via `GIT_CONFIG_COUNT`, `http.lowSpeedLimit=1000` e `http.lowSpeedTime=max(10, timeout)`.
  - **Rodadas de token** acrescentam `credential.helper=` (vazio, anula os helpers de sistema e global; verificado em 2026-09-14), `http.extraHeader=` (vazio, anula headers do dev) e `http.extraHeader=Authorization: Basic base64("x-access-token:<token>")`.
  - **Rodada `git`:** sem header e com os helpers do dev intactos (lookup normal do git, não interativo).
  - Se o ambiente já tiver `GIT_CONFIG_COUNT=N`, as chaves do ahc são **acrescentadas** a partir do índice N.
- **URL do hub:** `${base}/${repo}.git`, com `base = https://github.com`. `fetch` usa a URL explícita (`git -C <cache> fetch --depth=1 <url> refs/heads/<branch>` + `reset --hard FETCH_HEAD`) e não usa `origin`. Assim, um `origin` antigo, inclusive com credencial na userinfo, não interfere.
- **Validação (modo git):** `repo` precisa casar `^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$`; `branch` não pode começar com `-` e precisa passar em `git check-ref-format --branch`. Se falhar, o erro sai antes de qualquer rede.
- **Classificação da falha:**
  | stderr / erro | rodada de token | rodada `git` | avança a cascata? |
  |---|---|---|---|
  | `could not read Username` (401 sem credencial utilizável) | recusada | **indisponível** (sem credencial) | sim / fim |
  | `Authentication failed` (401 com credencial) | recusada | recusada | sim / fim |
  | `returned error: 403`, inclusive `Write access to repository not granted` (token que autentica mas não tem leitura do repo; observado no E1 de 2026-09-14) | recusada | recusada | sim / fim |
  | `repository ... not found` (404) | **recusada** (o GitHub pode responder 404 a principal autenticado sem acesso; a API respondeu 404 no E1) | não encontrado | sim / fim |
  | `Could not resolve host`, `Failed to connect`, `timed out`, SSL, morto por timeout | rede | rede | **não**: para na hora |
- **Timeout do git:** hard cap do `execFileSync`: `fetch` = `max(3 × --timeout, 15s)` (15s no hook, 30s no CLI); `clone` = 120s. Estouro conta como rede. O `install.sh` usa só `lowSpeed` (30s), sem teto de relógio.
- **Override só de teste:** `AHC_TEST_GIT_BASE_URL` só vale se casar **exatamente** `^http://(127\.0\.0\.1|\[::1\]):[0-9]{1,5}$` _(corrigido em 2026-09-15 pelo orquestrador: a redação original incluía `localhost`, que a emenda 4 do §7 removeu por causa do C7 — guard de loopback **sem nome de host**)_. O guard barra userinfo (`http://127.0.0.1:1@evil`), path e https externo. Fora do padrão, a variável é ignorada com aviso em stderr. `AHC_TEST_EMBEDDED_TOKEN` substitui o literal embutido (`''` = indisponível) **só** quando o override de base é válido. Garantia: o token embutido só é enviado para `github.com` ou para loopback.
- **Config:** `token` (string; vazio = origem ausente). Toda escrita feita pelo `ahc` ou pelo instalador passa por tmp com modo 600 e `rename`, **sempre**, com ou sem token. `ahc config k=v` corta só no primeiro `=`; chave vazia devolve usage com exit 2. O `sync` **não** faz chmod em arquivo que ele não escreveu (preserva o ✗ do AC-11).
- **Saídas novas:**
  - `sync`/`list` com origem recusada e sucesso depois, **uma linha** via `console.log` (ignora `--quiet`, porque o stdout do SessionStart chega ao contexto): `[ahc] aviso: hub autenticado via <rótulo>; origem(ns) recusada(s): <rótulos>. Rode \`ahc doctor\`.`
  - `sync` com todas recusadas (stderr): `[ahc] acesso ao hub recusado por todas as origens (<rótulos>) — mantendo o cache local. Rode \`ahc doctor\`.` Exit: `--quiet` → 0 (inalterado); sem `--quiet` → 1.
  - `install.sh` com todas recusadas (stderr): `[ahc] ERRO: acesso ao hub recusado por todas as origens (<rótulos>). Informe um token com AHC_GITHUB_TOKEN=<token> ou copie o comando atualizado da wiki.` Exit 1, sem `done`.
  - `doctor`:
    ```
    ✓ git auth (EMS-NCTECH/agents-hub-claude@main reachable via embutido)
    ⚠ git auth: origem recusada — env (AHC_GITHUB_TOKEN)
      → Atualize ou remova a variável: `unset AHC_GITHUB_TOKEN`
    ⚠ git auth: origem recusada — config (token em ~/.claude/.ahc-config.json)
      → Informe outro token com `ahc config token=<novo>` ou remova o campo `token`
    ⚠ git auth: origem recusada — embutido
      → Token embutido vencido ou revogado: rode de novo o one-liner da wiki, ou informe um token por AHC_GITHUB_TOKEN / `ahc config token=<novo>`
    ✗ git auth — EMS-NCTECH/agents-hub-claude@main: acesso recusado por todas as origens (env, config, embutido, credencial git)
      → Informe um token válido: `export AHC_GITHUB_TOKEN=<token>` ou `ahc config token=<token>`. Com conta na org: `gh auth login && gh auth setup-git`
    ✗ git auth — EMS-NCTECH/agents-hub-claude@main: rede/timeout (<detalhe>); outras origens não tentadas
    ✗ git version — 2.25.1 < 2.31 (necessário para autenticar por token)
    ```
    Quando a rodada `git` fica indisponível, a lista de origens do ✗ aparece como `credencial git: nenhuma configurada`. A dica antiga (`AHC_GITHUB_TOKEN` que ninguém lia) sai.
- **One-liner da wiki** (API de contents, documentada para PAT fine-grained; não usa raw, que tem cache de CDN; `Accept` validado no E1 de 2026-09-14 com HTTP 200):
  `curl -fsSL -H "Authorization: Bearer <TOKEN>" -H "Accept: application/vnd.github.raw" "https://api.github.com/repos/EMS-NCTECH/agents-hub-claude/contents/install.sh?ref=main" | bash`
  Origem única: sempre `EMS-NCTECH/agents-hub-claude`, alcançado pelos controles de acesso da própria org. Nenhuma cópia automática para repo fora da org.
  O token **não** é repassado ao `bash`: o instalador usa o embutido. Ressalva do `curl | bash`: se o `curl` falhar, o `bash` recebe script vazio e sai com 0, e o erro HTTP do `curl` fica visível no stderr. Para o E1 antes do merge, use `?ref=<branch>` e `AHC_BRANCH=<branch>`.

**Data flow:**
1. `sync` / `list` / `doctor` / `install.sh` → `loadConfig()` → modo git? (`file://`/`http*` seguem com `fetchURL`, sem mudança, AC-13).
2. Validação de `repo`/`branch` → `url = gitBaseURL() + /repo.git`.
3. `credentialSources` = [env?, config?, embutido?, git]. Para cada origem, em ordem:
   - `execFileSync('git', clone|fetch, { env: gitEnv(origem), timeout })`;
   - ok → `{ cache, source, refused[] }` e **para** (nenhuma origem posterior é apresentada, AC-14);
   - recusada (ou indisponível na rodada `git`) → anota e segue;
   - rede/timeout → lança `HubAccessError{kind:'network'}` e **para**.
4. Todas recusadas/indisponíveis → `HubAccessError{kind:'refused', tried, refused}`.
5. Os chamadores traduzem: o sync imprime a linha de aviso ou de erro; o doctor monta ✓/⚠/✗ e o check 6 reusa o `cache` sem nova cascata; o `install.sh` sai com 1.
6. Nada é persistido: trocar o token por env ou config vale na próxima chamada sobre o mesmo cache (**F3 resolvida**).

**NFR impact (latency / throughput / availability / cost):**
| Cenário (hook `sync --quiet --timeout=5`) | Tentativas | Latência adicional vs. hoje _(estimativa, medir no T0)_ |
|---|---|---|
| Embutido válido, sem env/config: o caso de todos, inclusive dos >50 devs com credencial | 1 | ~0 (um spawn de `git`, igual a hoje) |
| Embutido revogado, dev com credencial | 2 | **+323 ms medidos no E1** (2026-09-15; 772 ms com 1 tentativa, 1095 ms com 2) + 1 linha de aviso por sessão |
| Todas recusadas | ≤ 4 (cada uma falha no 1º GET `info/refs`) | ~1,2–2,4s, cache mantido, exit 0 |
| Rede fora / DNS / stall | 1 (não avança) | **Limitada a 15s** (hoje: sem limite, `execSync` sem timeout) |
| `git version` no doctor | +1 spawn (~5ms) | só no doctor; o hot path do sync não checa |
- Disponibilidade: um token revogado deixa de derrubar quem tem credencial (melhora). Custo: zero.
- O `uniques` do traffic cai para ~1, como já está previsto no §0.

**Does NFR impact the GOAL metric?** Não. O caminho feliz tem 1 tentativa, como hoje. O pior caso de auth fica em ~2s, e o de rede passa a ter teto. O único risco para a métrica é um link muito lento abortar o `fetch` pelo teto de 15s no hook. Isso não conta como falha de install (o instalador não tem teto de relógio), e o `sync` manual tem teto de 30s.

**Atomic tasks (ordered):**
- [x] **T0 — E1 contra o canônico com o token novo** _(feito em 2026-09-15; resultados em `docs/discovery/ahc-pat-auth.md` §E1)_. **F1, F2, F3, F7, V1 e C13 confirmadas**: `ls-remote` exit 0; contents API 200 em `?ref=main` (raw e +json); `clone`→`fetch`→`reset --hard` todos exit 0 sobre cache existente, `.git/config` sem credencial; `push --dry-run` **recusado** (403) — o PAT é só de leitura; expiração **2027-09-16 13:08:33 UTC**; escopo confinado (outro repo da org → 403). Latência medida: **772 ms** com 1 tentativa, **+323 ms** pela segunda. Ressalvas e o achado da classificação estão no discovery. **Segue aberto para o AC-01:** executar o one-liner completo contra o canônico depois do T14 — exige o push da branch ou o merge. _(enunciado original abaixo)_
- ~~**T0 — enunciado**~~ _(orquestrador; **pendente**; não bloqueia T1–T13, bloqueia T14 e o AC-01)_. O mecanismo já foi validado em 2026-09-14 contra o espelho, com o token antigo: injeção por `GIT_CONFIG_COUNT`, `fetch` em cache existente + `reset --hard FETCH_HEAD`, 403 "Write access to repository not granted" como recusa e HOME intacta. Falta repetir contra `EMS-NCTECH/agents-hub-claude`, com o PAT da org lido de arquivo local pelo orquestrador (nenhum agente vê o valor, nada em log), HOME limpo e na CB:
  - (a) `git ls-remote` com o header por `GIT_CONFIG_COUNT` → exit 0 (F1, F7);
  - (b) one-liner da contents API com `?ref=feat/001-ahc-pat-auth` → HTTP 200 e `bash -n` ok (F2);
  - (c) escopo: outro repo da org e a API de um repo fora da seleção respondem 404/403; registrar o stderr real de token inválido (401) para calibrar a classificação;
  - (d) F3 no canônico: `clone --depth=1`, `fetch` + `reset --hard FETCH_HEAD` com token → exit 0, o mesmo `fetch` sem token → exit 128, `.git/config` sem credencial;
  - (e) V1/F7: header `github-authentication-token-expiration` e se a política da org exigiu aprovação do PAT;
  - (f) latência real de 1 e de 2 tentativas (insumo do NFR).
  - Resultado registrado em `docs/discovery/ahc-pat-auth.md`. (AC-01, insumo; premissas F1, F2, F3, F7, V1)
- [x] **T1 — Manifest regenerado no PR** _(feito, `1733caa`)_. A `main` canônica estava vermelha desde o PR #20 (sha antigo em `skills/session-cost`); `regen-manifest.js` rodado na branch (session-cost 1.0.1 → 1.0.2), validator com 0 erros e 0 warnings. O ruleset da org recusa o auto-commit do `regen-manifest.yml` no push para `main` (`push declined due to repository rule violations`), então o manifest é regenerado dentro do PR. O `regen-manifest.yml` não muda nesta demanda. (AC-13)
- [x] **T2 — Harness do remoto autenticado** _(feito)_. Extras sobre o escrito: `installCredHelper()`, acessores `presentedSecrets/presentedUsers/clearAuthLog/setAccepted`, `makeBareHub()` copia também o `install.sh` (insumo do AC-02 no T10), porta publicada como `{"port":n}` e credencial julgada pelo segredo (o usuário difere entre rodadas). `runInstall()` fica **sem cobertura** até o T9/T10, porque o `install.sh` ainda não lê `AHC_TEST_GIT_BASE_URL`.
  - `test/support/git-auth-server.js` roda como **processo filho**: o `runAhc` usa `spawnSync`, que bloquearia um servidor no mesmo processo. Ele envolve o `git http-backend` (CGI: `GIT_PROJECT_ROOT`, `GIT_HTTP_EXPORT_ALL`, `PATH_INFO`, `QUERY_STRING`, `CONTENT_TYPE`, `HTTP_CONTENT_ENCODING`), faz bind em `127.0.0.1:0` e publica a porta no stdout. Lê de um JSON as credenciais aceitas, que o teste pode trocar em tempo de execução (AC-08). Responde 401 + `WWW-Authenticate: Basic` quando falta credencial ou ela é recusada. Registra num arquivo, **em ordem**, o `Authorization` de cada `GET info/refs` que traz credencial (a requisição anônima inicial da rodada `git` não entra).
  - `test/support/cred-helper.sh` devolve C_DEV.
  - Em `helpers.js`: `makeBareHub()` (fixture + `bin/ahc` do repo, commit), `publishAgentVersion()`, `baselineEnv(home)` (HOME/XDG temporários, `GIT_CONFIG_NOSYSTEM=1`, sem `AHC_GITHUB_TOKEN`, `GIT_TERMINAL_PROMPT` ausente, cwd temporário, `AHC_TEST_GIT_BASE_URL`), `runInstall()`.
  - Autoteste `test/git-auth-harness.test.js` (recusa token desconhecido, aceita o conhecido, ordem do log, `git --version` >= 2.31) + step `git --version` na CI. Nenhum código de feature. (AC: infra de 02–06, 08–10, 12, 14, 15)
- [x] **T3 — Contrato do token embutido + modo de teste** _(feito)_. Regex **sem `localhost`** (emenda 4 do §7 / C7, que prevalece sobre a redação original do §5, corrigida abaixo). Também trocadas as montagens de URL do hub (`gitRefresh`, check 5 do doctor, `git clone` do instalador) para `${gitBaseURL()}/${repo}.git` — sem isso o override não teria efeito. `embeddedToken()`/`ahc_embedded_token()` ficam sem chamador até T6/T10. 17 testes; mutação verificada (afrouxar o regex derruba 4). Marcadores com `''` em `bin/ahc` e `install.sh`; `gitBaseURL()` com o guard de loopback nos dois; `AHC_TEST_EMBEDDED_TOKEN`. Teste `test/embedded-token.test.js`:
  - marcador único por arquivo e literais idênticos, verde com `''` e com valor preenchido;
  - o guard rejeita `http://127.0.0.1:1@evil.test`, `https://127.0.0.1:1` e `http://10.0.0.1:1`, com aviso em stderr e nenhuma requisição chegando ao harness (use `HTTPS_PROXY=http://127.0.0.1:1` para o fallback ao github.com falhar sem rede);
  - `origin.test.js` segue verde. (AC-13)
- [x] **T4 — Escrita de config** _(feito)_. `cmdConfig` corta no primeiro `=`; `writeConfigFile()` com tmp 600 + `rename`. Teste `test/config.test.js`: `token=abc=def==` preserva `repo`/`branch`/`channel`; arquivo inexistente e arquivo 644 sem token terminam em 600; doctor sem ✗/⚠ em `config file permission`; arquivo 644 com token criado fora do ahc continua ✗. (AC-07, AC-11)
- [x] **T4b — Mascaramento da saída do `ahc config`** _(feito)_. O AC-16 entrou no §3 em 2026-09-15 por decisão do lead e não tinha tarefa dona — alocado aqui pelo orquestrador. `cmdConfig` mascara o `token` nas duas saídas (listagem sem argumentos e confirmação da gravação): só prefixo + 4 últimos caracteres, nada do valor inteiro em stdout ou stderr. Os demais campos saem inalterados e o arquivo em disco continua com o valor completo e modo 600. Teste em `test/config.test.js` (os asserts do T4 checam o arquivo, não o stdout, justamente para não colidir). (AC-16; §7 O6). Implementado: `maskToken()` (prefixo `github_pat_`/`ghp_` + `…` + 4 últimos), `maskConfigForDisplay()` na listagem e a confirmação da gravação; valor curto demais sai só `…`; `''` (origem ausente) sai literal. 9 testes em `test/config.test.js`.
- [x] **T5 — `gitRefresh` seguro, só com a rodada `git`** _(feito)_. `HubConfigError`/`HubAccessError`, `gitEnv()` saneado (C5) com `GIT_CONFIG_COUNT` herdado validado (C6), `redact()` em todo eco (C9), `classifyGitFailure()` com as duas linhas da emenda 2, `validateHubRef()` sem rede, `execFileSync` com URL explícita e os dois tetos de relógio. 23 testes; mutações verificadas. **Divergências aceitas:** (i) o git deixou de herdar o terminal, então `ahc sync` não mostra mais a barra de progresso do clone — a classificação depende de capturar stderr; (ii) `check-ref-format` roda com `cwd` em tmp, porque valida antes de criar diretório; (iii) `GIT_CONFIG_COUNT` é validado em vez de removido, como o §5 exige. **Dívida aberta para o T8:** o check 5 do doctor ainda monta `git ls-remote` por string com `execSync` interpolando a URL — com `repo` contendo `"` isso passa pelo shell. **Recomendação para o T6:** expor `classifyGitFailure` por `module.exports` guardado por `require.main !== module` e escrever ali os casos unitários do C4, que o T5 cobriu só por integração. `execFileSync` + URL explícita + validação de slug/branch + env não interativo + timeouts + classificação da rodada `git`; `cmdSync`/`cmdList` passam a consumir `{cache, source, refused}`. Testes: sync e list com o helper C_DEV contra o harness; `GIT_ASKPASS` apontando para um script que dorme 100s **não** trava; `repo` com `;` ou `$(...)` e `branch` iniciando com `-` são rejeitados sem rede. (AC-12 caminho de credencial, AC-13)
- [x] **T6 — Cascata de tokens** _(feito)_. `credentialSources()`, `tokenConfigEntries()` com header de escopo de URL + `followRedirects=false` (C1, C2), laço que para no primeiro sucesso, `module.exports` guardado por `require.main !== module` com os 12 unitários do C4. 35 testes, 7 mutantes mortos. **Decisões:** `notfound` não avança (só existe na rodada `git`, que é a última); `refused[]` não inclui `git` quando a rodada fica `unavailable` — é o que separa as linhas 6 e 7 do AC-14, e o T8 deriva o caso por `tried` menos `refused`. Ajustou **uma asserção** de `test/embedded-token.test.js` (o token de teste plantado ali vira origem legítima com a cascata no lugar — comportamento por contrato, linha 4 do AC-14). `credentialSources` + `gitEnv` de token + classificação das rodadas de token (401, 403 inclusive "Write access to repository not granted", 404) + `HubAccessError`. Testes em `test/auth-cascade.test.js`: tabela do AC-06 para `sync` e `list`; tabela completa do AC-14 (resultado + ordem do log + nada após a que autenticou + artefatos e lock idênticos na falha); AC-08 (T_OLD→T_NEW por env e por config sobre o mesmo cache, depois sem env); AC-04 (versão nova gravada, lock, `list`). (AC-04, AC-06, AC-08, AC-14)
- [x] **T6b — `branch` inexistente tem linha própria na classificação** _(feito)_. `kind: 'noref'`, `advance:false`, mensagem `a branch não existe no repo (<detalhe>)` e dica `ahc config branch=<branch>` no doctor. Cobre as duas formas: `couldn't find remote ref` (fetch, a medida no E1) e `Remote branch … not found in upstream` (clone). 6 testes. _(original: achado do T0/E1, alocado pelo orquestrador)_. O E1 mediu `fatal: couldn't find remote ref refs/heads/<branch>` contra o GitHub real — forma que a tabela do §5 não prevê. Hoje cai em `unknown`: **não avança a cascata**, que é o comportamento certo (não é falha de credencial), mas a mensagem ao dev não diz o que houve. Acrescentar linha à tabela e a `classifyGitFailure` com `kind: 'noref'`, sem avançar, e mensagem dizendo que a branch não existe no repo. Teste unitário junto dos 12 do C4 em `test/auth-cascade.test.js`. (C4)
- [x] **T7 — Modo hook** _(feito)_. `reportRefusedSources()` via `console.log` (ignora `--quiet` de propósito: o stdout do SessionStart chega ao contexto), `hubFailureLine()`, exit `--quiet`→0 / sem→1. 11 testes com stdin fechado e sem `GIT_TERMINAL_PROMPT`. **Acréscimo ao §5 aceito:** `cmdList` passou a escrever a causa em stderr na falha (antes engolia em silêncio, e sem isso o T6b não chegava ao `list`); exit segue 0. Falhas que não são recusa total ganharam linha própria em vez de virar "offline or unreachable". Linha única de aviso no `sync --quiet` quando houve recusa com sucesso; mensagem de todas recusadas com exit 0 no `--quiet` e 1 sem ele. Testes com stdin fechado (`stdio: ['ignore', …]`) e sem `GIT_TERMINAL_PROMPT` no ambiente do teste: linhas do AC-14 via `sync --quiet --timeout=5`. (AC-05, AC-14 linhas quiet)
- [x] **T8 — Doctor** _(feito)_. Cascata única (`gitRefresh` uma vez; o check do CLI consome `access.cache` — mutação prova que voltar a chamar duplica a credencial apresentada), check `git version`, ✓/⚠/✗ no texto literal do §5, `credencial git: nenhuma configurada` derivado de `tried` menos `refused`. 18 testes. **Dívida de segurança do T5/T6 eliminada:** o `execSync` com URL interpolada saiu do check 5; agora passa por `validateHubRef()` + `execFileSync`, e o teste com `repo` contendo `"; touch pwned` mata a regressão. `HubConfigError` vira ✗ sem ecoar o valor (podia forjar linhas do doctor com `\n`). Uma cascata só, reaproveitada pelo check 6; check `git version`; ✓ com origem; ⚠ por origem recusada com a dica certa; ✗ com a lista de origens e dica sem depender só de `gh`; ✗ de rede sem avançar. Testes: AC-09, AC-10 A (3 linhas) e B (3 linhas), coluna doctor do AC-06; os testes antigos de `doctor.test.js` (fixture `file://`) seguem verdes. (AC-06, AC-09, AC-10)
- [x] **T9 — `install.sh`: config e sucesso** _(feito)_. Corpo em `main()` (C10), `write_config_merged` via `node -e` com valores por env (nunca argv), preflight `git >= 2.31` **antes** do `mkdir -p`, primeira sync sem `|| true`. JSON inválido na config → exit 1 **sem escrever** (apagar levaria o `token`). 6 testes, mutações verificadas. Validação de `REPO`/`BRANCH` ficou para o T10, que já monta URL em bash. Merge da config via `node -e` (preserva `token` e chaves extras; `repo`/`branch`/`channel` do instalador; tmp 600 + `mv`); preflight `git >= 2.31`; primeira sync sem `|| true`; falha → exit ≠ 0 sem `done`. Testes `test/install.test.js`: AC-15 e a parte do instalador do AC-11. (AC-03 parcial, AC-11, AC-15)
- [x] **T10 — `install.sh`: cascata** _(feito)_. Cascata em bash 3.2 transcrita do `bin/ahc` (rótulos, ordem, regex de classificação, chaves de injeção com escopo de URL), token da config lido **antes** do clone, base64 via `node`, `fetch` por URL explícita, validação de `REPO`/`BRANCH` (a pendência que o T9 deixou). 22 casos novos, 6 mutantes mortos. **Paridade com o `sync` provada in situ:** um install bem-sucedido gera duas passadas da cascata no log do harness (clone em bash + primeira sync em Node) e o teste compara as duas metades entre si. **Acréscimo ao §5 aceito:** o instalador também imprime a linha de aviso quando uma origem é recusada e outra autentica — o §5 só a definia para `sync`/`list`, mas quem instala precisa saber que o embutido caiu. Leitura do `token` da config existente **antes** do clone; `hub_git clone|fetch` em bash com as mesmas env, classificação e ordem do T6 (base64 via `node`, sem `base64 | tr`); mensagem de todas recusadas; `fetch` pela URL explícita. Testes: AC-02 (HOME limpo, aceita só T_EMBUTIDO via `AHC_TEST_EMBEDDED_TOKEN`), AC-03, linhas do AC-14 para `install.sh` (ordem do log idêntica à do `sync`). (AC-02, AC-03, AC-14)
- [x] **T10b — Testes de controle que ficaram sem cobertura** _(depende de: T5, T10; lacuna sinalizada pelo agente do T10, alocada pelo orquestrador)_. O §7 pede dois testes para o par T5/T10 que nenhuma tarefa escreveu: **C4 com locale traduzido** (`LANG=pt_BR.UTF-8` — a classificação tem de continuar correta porque `LC_ALL=C`/`LANGUAGE=C` são fixados) e **C5 com `GIT_DIR` herdado** no `install.sh` (o repo do dev não pode ser tocado). A implementação já faz as duas coisas; falta a prova. Testes em `test/install.test.js` e `test/git-refresh.test.js`. (C4, C5) **Fechado em 2026-09-16 (orquestrador):** os dois testes **já existiam** — entraram junto com o T5/T10 no commit `da5673a` (`C4: locale traduzido…` e `C5: GIT_DIR/GIT_WORK_TREE herdados…`, nos dois arquivos), e o cabeçalho do `install.test.js` já os documentava; faltava só marcar a tarefa. Verificados verdes nesta máquina, com `pt_BR.UTF-8` instalado (nenhum `skip`).
- [x] **T10c — C10 sem prova nenhuma** _(feito em 2026-09-16; lacuna achada pelo orquestrador ao conferir o gate “C1–C14 com testes verdes” do §7)_. O C10 era o único controle do §7 **sem nenhum teste** (`grep -rn C10 test/` voltava vazio), embora a implementação estivesse no `install.sh` desde o T9. Escritos em `test/install.test.js` os três testes que o §7 pede: **(a)** estático — a última linha não vazia é `main "$@"`, aparece uma única vez, e nenhuma linha liga xtrace; **(b)** truncamento em 25/50/90% por `bash` lendo stdin, comparando a **árvore inteira do HOME** antes e depois; **(c)** shims de `git` e `node` no PATH registrando a argv de cada invocação, com âncora provando que foram mesmo chamados. **Achado do caminho:** a primeira versão do (b) assertava “`~/.claude` não existe” e falhou — mas por culpa do teste, não do instalador: `makeTmpHome()` já cria o diretório vazio. A reprodução manual confirmou que o `install.sh` cortado a 25/50/90% não cria nada (o `mkdir -p "$BIN_DIR" "$CLAUDE_DIR"` está na linha 657, dentro de `main()`). A comparação de árvore que substituiu a asserção é mais forte: pega também arquivo criado dentro de diretório preexistente. **4 mutantes mortos:** linha executável depois de `main "$@"`; `set -x`; `mkdir` em nível de topo antes dos 25%; token passado por argv ao `node`. (C10)
- [x] **T11 — Guarda de regressão do dev com credencial** _(feito; **nenhuma regressão encontrada**)_. Cenário montado à mão como o ahc anterior deixava (clone **completo** com `origin`, lock com pin, arquivo manual em `~/.claude/agents/`, helper C_DEV **mais** `~/.git-credentials` populado). **Prova que mais importa:** `~/.gitconfig` e o store do helper ficam byte-idênticos nos dois casos — o `credential.helper=''` das rodadas de token impede que o 401 do embutido dispare `erase` nos helpers do dev, que seria a regressão mais destrutiva possível (apagar a credencial do dev por causa de um token embutido revogado). Também provado: `fetch --depth=1` anda sobre o clone completo do ahc antigo sem reclone silencioso (inode do `.git` idêntico). **Observação de baixa severidade:** o check `config file permission` emite ⚠ para config 644 mesmo sem `token`; um dev legado com 644 herdado vê um ⚠ a mais no doctor (exit segue 0, não fere o AC-12). `test/regression-dev-credential.test.js`: cache criado por `git clone` simples da URL do harness (mesmo layout do cache do ahc anterior, que não sabe apontar para loopback), lock com item pinado, arquivo escrito à mão em `~/.claude/agents/`, helper C_DEV. Casos: remoto aceita T_EMBUTIDO; remoto aceita só C_DEV. Critérios: `sync`/`list`/`doctor` com exit 0, ⚠ do embutido no segundo caso, pin respeitado, arquivo manual intacto, sha256 de `~/.gitconfig` e do store do helper iguais antes e depois. (AC-12)
- [x] **T12 — `make-mirror` nunca leva o token da org** _(feito)_. `--apply` esvazia os dois marcadores e gera commit **órfão** (com `reflog expire` + `gc --prune=now`, senão os objetos antigos sobrevivem no `.git`); `--check` varre o histórico alcançável por `--all` + HEAD. 6 casos novos, 3 mutantes mortos. **Pendência aberta:** o piso do padrão de PAT ficou `{40,}` em vez do `{20,}` que o C12 exige, porque o comentário do `maskToken` em `bin/ahc:985` usa o exemplo `github_pat_TESTONLY…0123abcd` (22 caracteres de corpo) e disparava falso positivo. **Resolvido pelo orquestrador em 2026-09-15:** exemplo do `maskToken` reescrito com reticências (`github_pat_TESTONLY…0123abcd`) e piso `{20,}` restaurado. Verificado: `--check` sem achado de segredo, suíte verde. `make-mirror.js --apply` esvazia o valor nos dois marcadores da cópia; `--check` falha se algum marcador tiver valor. Caso novo em `test/mirror.test.js` com um valor fictício (`T_EMBUTIDO`, nunca o real) na árvore de entrada: a cópia sai com `''` nos dois marcadores e nenhum arquivo da cópia contém o valor fictício. O espelho segue manual; nenhuma publicação automática fora da org. (**Controle de segurança (§7), sem AC próprio**; sinalizado para a Phase 2.5. O teste roda na suíte `node --test test/*.test.js`, mas o AC-13 não descreve este comportamento.)
- [x] **T13 — Docs** _(feito)_. Seção de instalação sem credencial com o one-liner em `?ref=main` e a ressalva do `curl | bash`; exemplo real do doctor (com a linha `git version`, ausente do exemplo antigo); troubleshooting com uma entrada por ⚠/✗, cada dica copiada de `REFUSED_HINTS`/`ALL_REFUSED_HINT`/`NOREF_HINT`; `ahc config token=` e o mascaramento documentados; `help` do CLI citando `token`. **Duas afirmações falsas corrigidas, além do pedido:** o README dizia que o check `git auth` responde "em até 8s" (não existe esse teto — é `max(3 × --timeout, 15s)`, 30s no CLI), e o troubleshooting de `README.md:705` mandava migrar o sync para `git clone --depth=1` "ver issue" — o caminho que esta própria demanda implementa. Também reescrito o parágrafo de abertura de `## Instalação`, que afirmava que o ahc usa "suas credenciais do GitHub" — verdade para um dos quatro caminhos, falsa como descrição geral depois da cascata. README: instalação sem credencial (formato do one-liner com `<TOKEN>`, sem valor real), exemplo do doctor, troubleshooting (`README.md:705` descreve um caminho que deixa de existir), `help` do CLI citando `token`. (suporte a AC-01 e AC-10: a dica precisa ser verdadeira)
- [x] **T14 — Inserir o token embutido** _(orquestrador; **última tarefa**; depende de: T0 verde e T1–T13 concluídas)_. O orquestrador lê o valor de um arquivo local e o grava nas duas linhas `AHC-EMBEDDED-TOKEN` (`bin/ahc` e `install.sh`), sem ecoar o valor em terminal, log ou mensagem de commit. Agentes não participam. Critérios: `embedded-token.test.js` verde (literais idênticos), suíte completa e validator verdes, `make-mirror --apply` numa cópia descartável deixa os marcadores com `''`. (AC-13; pré-requisito do AC-01) **Feito em 2026-09-16 (orquestrador).** Valor lido de arquivo local (modo 600) e gravado nas duas linhas com as âncoras conferidas **antes** de qualquer escrita; nunca ecoado em terminal, log ou mensagem de commit, e toda saída de teste passou por redação. Conferido antes de gravar: formato fine-grained (C13), responde pelo canônico e expira em **2027-09-16 13:08:33 UTC** — a mesma expiração que o T0 registrou, logo é o mesmo token já validado; e o espelho pessoal tinha voltado a **privado**. **Defeito encontrado ao rodar os gates:** três testes cravavam o estado de BUILD e quebravam por construção no instante em que o valor entrasse — `embedded-token.test.js` assertava `value === ''` (contra o §5, que manda o contrato passar *tanto* com `''` *quanto* com o valor real), `treeWithLiterals()` casava só a linha do literal vazio, e `credentialSources: ordem…` cravava `['env','config','git']` com o comentário "o embutido deste checkout está vazio". Os três passaram a **derivar** o estado do marcador, sem afrouxar nada: os negativos do C13 (literais divergentes, `ghp_` clássico, marcador duplicado) seguem verdes. **Gates pós-gravação:** suíte **277/277**, validator 0 erros, e o **C12 provado em cópia descartável** — com o token commitado, `make-mirror --apply` deixa **0 ocorrências do valor na árvore e 0 no histórico**, com os dois marcadores vazios. **Gate de segredos (2026-09-16):** ao abrir o PR #22, o check obrigatório `Datadog PR Gates / No new secrets violations` reprovou o literal embutido — controle da org que nem o §0 nem o §7 haviam mapeado (o `Tests + validator` passou em 55s). O PR #21, sem o literal, passou nesse mesmo check. O lead, como org-admin, decidiu em 2026-09-16 mergear com bypass; ver ADR-0001, seção "Exceção de merge".

_Depois do T14 (VERIFY, orquestrador, máquina Unix na CB):_ E1 ponta a ponta com o one-liner (`?ref=<branch>` + `AHC_BRANCH`), `ahc sync` e `ahc doctor`, mais smoke com `gh auth` real para o AC-12; repetir contra `main` após o merge. Prova o AC-01 e confirma AC-04, AC-08 e AC-09 no GitHub real.

**Mapa AC → tarefas:**
| AC | Tarefas |
|---|---|
| AC-01 | T0, T13, T14 + E1 ponta a ponta no VERIFY |
| AC-02 | T2, T10 |
| AC-03 | T9, T10 |
| AC-04 | T6 |
| AC-05 | T7 |
| AC-06 | T6, T8 |
| AC-07 | T4 |
| AC-08 | T2, T6 |
| AC-09 | T8 |
| AC-10 | T8, T13 |
| AC-11 | T4, T9 |
| AC-12 | T5, T11 |
| AC-13 | T1, T3, T5, T14 |
| AC-14 | T6, T7, T10 |
| AC-15 | T9 |
| _sem AC (controle de segurança, §7)_ | T12 |

**Trade-offs considered:**
| Decisão | Opções | Escolha e motivo |
|---|---|---|
| Origem de install e sync | (a) canônico `EMS-NCTECH/agents-hub-claude` com PAT cujo dono é a org; (b) espelho pessoal como origem, com publicação automática a cada merge | **(a)** (lead, 2026-09-15). (b) tira da org o conteúdo do repo internal e foi bloqueada pelo controle de segurança do Claude Code (credential leakage). (a) mantém o acesso sob os controles da org e dispensa push token, Environment e workflow de publicação. Custo: quem sai da org ou perde acesso ao repo deixa de sincronizar pela credencial git, e o PAT depende da conta do lead continuar membro |
| Onde a credencial entra no git | (A) token na URL, como no ROADMAP §1; (B) `git -c http.extraHeader` em argv; (C) `GIT_CONFIG_COUNT` por env + reset de helpers; (D) credential helper efêmero por env; (E) isolar a config (`GIT_CONFIG_GLOBAL=/dev/null` + NOSYSTEM) | **C.** A grava em `.git/config`, aparece no `ps` e quebra F3. B aparece no `ps`. D custa um round-trip de 401 a mais e troca `store`/`erase` com o helper. E derruba proxy/CA corporativos em `~/.gitconfig` e seria regressão. O custo de C é exigir git >= 2.31 |
| Fonte do token embutido | (1) literal nos dois arquivos + teste de igualdade; (2) só no `install.sh`, com o `ahc` lendo o do cache; (3) instalador grava arquivo de estado; (4) instalador injeta via `sed` no `ahc` instalado; (5) one-liner repassa por env | **1.** O `install.sh` roda antes de existir qualquer conteúdo do repo, e o `ahc` roda desacoplado dele. (2) quebra sem cache; (3) cria um arquivo secreto novo e exige migração; (4) muda o sha e deixa o doctor em "CLI out of date" para sempre; (5) contraria o AC-02 e não persiste para o sync. O drift vira impossível de mergear pela CI |
| O que avança a cascata | Só 401/403 (padrão do orquestrador) × 401/403 + **404 em rodada de token** | **Com 404.** O GitHub responde 404, não 403, a um token válido sem acesso a um repo privado/internal (PAT sem o repo selecionado, conta do lead fora da org ou sem acesso ao repo); no git, a falta de leitura veio como 403 "Write access to repository not granted" no E1. Sem isso, um embutido desautorizado derrubaria os devs com credencial (AC-12). O custo é que um slug com typo tenta ≤ 4 origens rápidas; timeout, DNS e conexão continuam sem avançar |
| Interatividade da rodada `git` | Permitir GUI/askpass × sempre não interativo | **Não interativo** (`GIT_TERMINAL_PROMPT=0`, askpass vazio, `GCM_INTERACTIVE=never`). Hook sem TTY não pode abrir diálogo (AC-05/14). Mudança de comportamento: quem dependia do popup do GCM ou do askpass do VS Code dentro do `ahc` precisa guardar a credencial (`gh auth setup-git`), e a dica do doctor diz isso |
| Memorizar a origem vencedora | Sim × não | **Não.** Mudaria a ordem observável do AC-14 e só economiza ~1 RTT em estado degradado (YAGNI) |
| Cascata do instalador | Bash duplicado × obter o `ahc` antes | **Bash duplicado e mínimo.** Nada do repo existe antes do clone. A drift fica coberta por rodar as mesmas tabelas (AC-14) contra `install.sh` e `sync` |

**Recommended approach:** Credencial injetada **por invocação** via `GIT_CONFIG_COUNT` (header `Authorization: Basic` + reset de helpers nas rodadas de token; lookup normal e não interativo na rodada do dev), com URL explícita e nada persistido. Cascata env → config → embutido → credencial git, que avança só em recusa de auth (401/403, e 404 com token) e para em erro de rede, agora com timeout. Origem única dentro da org (`EMS-NCTECH/agents-hub-claude`); token embutido = PAT fine-grained da org, só leitura e só este repo, como literal único em dois marcadores travados por teste de CI, gravado pelo orquestrador na última tarefa; `make-mirror` esvazia os marcadores para o token nunca sair da org. Harness HTTP local com `git http-backend` e override de base restrito a loopback. `execFileSync` em todos os caminhos tocados.

**ADRs created:** [ADR-0001 — Acesso ao hub dentro da org: PAT da EMS-NCTECH, cascata de credenciais e injeção por invocação no ahc](../../adr/0001-cascata-de-credenciais-do-ahc.md)

## 6. Sensitive surface _(PLAN → triggers Security)_
- [x] Auth / AuthZ  · [x] Secrets  · [ ] PII  · [ ] Payments
- [ ] File upload/download  · [ ] Deserialization  · [x] Raw SQL / shell exec
- [ ] Multi-tenant isolation  · [x] New external integration / trust boundary

_Notas para o Security (Phase 2.5):_
- **Shell exec:** migração de `execSync` interpolado para `execFileSync` em `gitRefresh` e no doctor; novo `env` de processo filho com o header de auth; o `install.sh` monta env de git em bash; o one-liner é `curl | bash`. Fora do escopo tocado e sem interpolar config: `lockHeldByLiveProcess` e `coordGitDir` (resíduo).
- **Trust boundary nova:** PAT fine-grained cujo dono dos recursos é a org `EMS-NCTECH`, criado pela conta do lead (sem conta de serviço), só leitura (`Contents` + `Metadata`) e só `EMS-NCTECH/agents-hub-claude`. O token é distribuído no código e no one-liner da wiki interna (`~/.local/bin/ahc` fica 755 na máquina do dev): o vazamento é **risco aceito**, não reabrir. A validade do embutido depende de a conta do lead seguir membro da org e com acesso ao repo. Também entram: a API de contents `api.github.com` no one-liner (`curl | bash`), o override `AHC_TEST_*` como canal de entrada restrito a loopback e o `http.extraHeader` sem escopo de host, com redirects no default `initial` do git.
- **Secrets:** o valor só existe nos marcadores `AHC-EMBEDDED-TOKEN` e é gravado pelo orquestrador no T14, a partir de arquivo local; nenhum agente manipula o valor. Secret scanning e push protection estão desligados na org, então o commit do token não gera alerta. O T12 (`make-mirror` esvazia os marcadores) é **controle de segurança sem AC próprio**: validar na Phase 2.5 que nenhuma cópia manual leva o token da org para fora dela.
- **Memória:** o anti-pattern "Embutir token em `install.sh`" (`guidelines.md`) foi marcado como superado pelo ADR-0001 para o token de leitura da org; "Push do hub para fork pessoal" segue válido.

## 7. Security _(filled if section 6 has any check)_
_Phase 2.5 — threat model de design (security-specialist, 2026-09-15). Não há código ainda; o gate de release é no VERIFY._

**Evidência verificada localmente em 2026-09-15** (git 2.50.1, curl 8.7.1; servidores `git http-backend` em loopback, HOME temporário, `GIT_CONFIG_NOSYSTEM=1`, valores fictícios):
- **E1:** `http.<url>.extraheader` no `~/.gitconfig` do dev **vence** o reset e o header injetados como `http.extraHeader` genérico por `GIT_CONFIG_COUNT`. O servidor recebeu só a credencial do dev.
- **E2:** as mesmas chaves com a URL completa (`http.<url-do-repo>.extraHeader`) vencem. O servidor recebeu só o token injetado.
- **E3b:** `credential.helper=` genérico por env **zera** também o helper com escopo de URL (`credential.<url>.helper`, formato do `gh auth setup-git`).
- **E4a:** com `url.<B>.insteadOf=<A>` no config do dev, o header genérico **vai para o host B**. **E4b:** com a chave pela URL completa de A, B não recebe o header.
- **E5:** com o default `followRedirects=initial` e um 302 de A para outro host, o curl tira o header do GET redirecionado, mas o git manda o `POST git-upload-pack` **ao novo host com o header**. Acontece também com a chave com escopo de URL.
- **E5d/E5f:** `http.<url>.followRedirects=false` bloqueia (`The requested URL returned error: 302`). **E5e:** um `followRedirects=true` com escopo no config do dev **vence** o `false` genérico.
- **E7:** `GIT_CONFIG_COUNT` herdado malformado faz o git falhar com "bogus count". No bash, `$((GIT_CONFIG_COUNT + 0))` **executa** um `$(...)` contido na variável.
- **E8:** `GIT_TRACE_CURL=1` imprime `Authorization: Basic <redacted>`. A redação depende de `GIT_TRACE_REDACT`, que é 1 por padrão.
- **`GIT_DIR`** no ambiente vence `git -C <cache>`: um `reset --hard FETCH_HEAD` agiria no repo apontado pela variável.
- **Varredura de segredos no histórico do repo:** 93 commits, nenhum padrão encontrado (`github_pat_`, `ghp_`/`gho_`/`ghs_`, `AKIA`, `xox*`, chave privada, `sk-ant-`). É o que um token vazado expõe hoje.

**STRIDE:**
| Asset | Threat | Likelihood | Impact | Existing control | Gap |
|---|---|---|---|---|---|
| Token embutido (PAT da org) | **I** — vazamento pelo código (`~/.local/bin/ahc` 755, repo internal), pela wiki, pelo histórico do shell e pelo argv do `curl` no one-liner | Alta | Médio: leitura do hub e de todo o histórico git | Fine-grained, só o canônico, `Contents` + `Metadata` read-only | **Aceito (lead, 2026-09-14/15).** Resta garantir que o literal gravado é mesmo esse token (C13) |
| Token embutido, `AHC_GITHUB_TOKEN`, `cfg.token` | **I** — envio a host que não é github.com por `url.<x>.insteadOf` do dev, por exemplo um proxy git corporativo (E4a) | Média | Alto para token pessoal do dev; médio para o embutido | Nenhum: o §5 usa `http.extraHeader` sem escopo | C1, C3 |
| Idem | **I** — redirect para outro host: o POST seguinte leva o header (E5) | Baixa: exige 3xx vindo de github.com por TLS (proxy TLS corporativo, CA comprometida) | Alto | TLS validado pelo curl | C2 |
| Precedência e rótulo da origem | **S/R** — `http.<url>.extraheader` do dev vence o reset genérico (E1). As rodadas "env/config/embutido" apresentam a credencial do dev, o doctor rotula a origem errada e a ordem do AC-14 fica falsa | Baixa-média | Médio | Nenhum | C1 |
| Credential helper do dev nas rodadas de token | **I** — helper com escopo de URL responde a um 401 da rodada de token | Baixa | Médio | `credential.helper=` vazio por env zera também o helper com escopo (E3b) | Sem teste com helper com escopo (C1) |
| Classificação da falha | **T/D** — mensagens do git traduzidas (`LANG=pt_BR`, Git for Windows) ou linhas `remote:` levam a classificar rede como recusa (avança, até 4× a latência no hook) ou recusa como texto não reconhecido | Média | Baixo-médio (disponibilidade) | Nenhum | C4 |
| Classificação usada para forçar fallback | **E/I** — forçar 401/403/404 nas rodadas de token para o `ahc` usar a credencial do dev | Baixa: exige controlar a resposta de github.com | Baixo: a credencial do dev vai à mesma URL que já a recebe hoje | TLS | Nenhuma além de C2 (variante com redirect) |
| Repositório de trabalho do dev | **T** — `GIT_DIR`/`GIT_WORK_TREE` herdados (`ahc` chamado de hook git ou de shell com essas variáveis) fazem `reset --hard FETCH_HEAD` agir no repo do dev | Baixa | Alto: perda de trabalho não commitado | Nenhum (pré-existente; o T5 reescreve o trecho) | C5 |
| Processo git filho e bash | **E** — `GIT_CONFIG_COUNT` herdado com `$(...)` executa código na aritmética do `install.sh` (E7) | Baixa: exige controle do env | Médio | Nenhum | C6 |
| Saídas: stdout/stderr, contexto do SessionStart, doctor | **I** — token ecoado por trace do git com `GIT_TRACE_REDACT=0`, por `e.message`/objeto de erro serializado ou por stderr do git repassado em `<detalhe>` | Média | Médio: token pessoal em transcript e logs | Header só no env; trace redige por padrão (E8) | C5, C9 |
| Override `AHC_TEST_GIT_BASE_URL` / `AHC_TEST_EMBEDDED_TOKEN` | **S/I** — variável esquecida no shell, ou plantada por snippet, envia os tokens de env e config a um listener local; `localhost` depende de resolução de nome | Baixa | Baixo-médio: quem controla o env já lê os tokens | Regex exato de loopback que barra userinfo, path e https externo; embutido de teste só com base válida | C7 |
| Execução do git | **E** — injeção por `execSync` interpolado; argumento iniciado com `-`; no Windows, `git.exe` do diretório corrente (no SessionStart, o cwd é o projeto aberto) | Baixa | Alto | §5 prevê `execFileSync` e validação de `repo`/`branch` (T5) | C5 (cwd) |
| One-liner `curl \| bash` | **T** — download truncado executa script parcial; com `curl -f` em falha, o `bash` sai 0 (falso sucesso) | Baixa | Médio | `-f`, TLS padrão, sem `-L` (header não segue redirect) | C10; O7 |
| `install.sh` | **I** — token em argv (`node -e … "$tok"`), `set -x`, `export` global herdado pelo `ahc sync` e pelo `node` | Média sem regra explícita | Médio | Nenhum | C10 |
| `~/.claude/.ahc-config.json` | **I/T** — janela 644 entre escrever e dar chmod; perda do token na reinstalação; JSON inválido sobrescrito; `token` não-string enviado como `[object Object]` | Média | Médio | doctor dá ✗ para 644 com token | C11 |
| Espelho manual (T12) | **I** — cópia leva o token da org para fora dela. Esvaziar só a árvore não basta: o espelho sai de "branch derivada + `push --force`", e o commit do T14 vai junto no histórico | Alta, se o fluxo atual se repetir após o T14 | Alto: quebra a decisão "o token nunca sai da org" | Nenhum (o T12 cobre só a árvore) | C12 |
| Conteúdo distribuído (instruções executadas pelo Claude Code em mais de 50 máquinas) | **T** — conteúdo malicioso no hub. O sha256 só protege contra corrupção, porque o manifest vem da mesma origem | Baixa | Crítico | Ruleset e PR na org; token read-only; sha256 por arquivo | O refactor pode pular a verificação (C14); `cfg.repo` apontando para outro hub (O4) |
| Literal gravado no T14 | **E** — gravação de token errado (PAT clássico `ghp_`, ou fine-grained com dono pessoal ou escopo amplo) distribuído a todos | Baixa | Alto | T0(c) verifica o escopo manualmente | C13 |
| Disponibilidade do embutido: conta do lead | **D** — lead sai da org ou perde acesso ao repo; PAT expira; política da org exige aprovação | Média em 12 meses | Médio: devs sem credencial voltam a 0% até a rotação (PR + wiki + reinstalação) | Cascata env/config; credencial git dos membros | **Aceito (lead, 2026-09-14/15)**; O1, O2 |
| Disponibilidade do embutido: revogação provocada | **D** — quem tem o valor o publica em repo ou gist público, e o GitHub pode revogar token GitHub detectado em conteúdo público | Média | Médio (mesmo efeito da linha anterior) | Cascata | Consequência do risco aceito; O1 |
| Rastreabilidade | **R** — todo acesso por token aparece como a conta do lead; não se atribui uso nem vazamento a um dev | Alta | Baixo | Nenhum | **Aceito (lead, 2026-09-14/15)**; O3 |
| Invariante "nenhum agente lê o valor" | **I** — depois do T14, qualquer sessão que leia `bin/ahc` ou o diff do PR (pr-review, code-review, veredito, rotina que posta no Slack) vê o valor | Alta | Baixo-médio: o valor já é de vazamento aceito | Nenhum | Consequência do risco aceito; O8 |

**Ajustes no §5 antes do BUILD** (o architect aplica; sem eles, a garantia "o token embutido só é enviado para `github.com` ou para loopback" é falsa):
1. **Injeção por invocação:** nas rodadas de token, trocar `http.extraHeader=` / `http.extraHeader=Authorization…` por `http.<url>.extraHeader`, com `<url>` exatamente igual à URL computada, e acrescentar `http.<url>.followRedirects=false`. Retirar a menção a "redirects no default `initial`" (C1–C3).
2. **Classificação da falha:** `LC_ALL=C` no env; casar só linhas `fatal:`/`error:`; duas linhas novas na tabela, `redirect` (`returned error: 30x`) e `desconhecido`, ambas **sem avançar** a cascata (C4).
3. **`gitEnv`:** sanear as variáveis locais e de trace do git, fixar `cwd` e validar o `GIT_CONFIG_COUNT` herdado antes de acrescentar chaves (C5, C6).
4. **Override só de teste:** tirar `localhost` do regex (C7).
5. **T12:** o espelho sai como commit órfão e o `--check` varre o histórico alcançável (C12). **T0(c):** incluir `push --dry-run` recusado e 404 em outro repo da org como pré-condição do T14 (C13).
6. **`install.sh`:** corpo em `main()` (C10).

**Required controls (must ship in BUILD):**
- [x] **C1 — Chaves de injeção com escopo da URL completa** _(T6, T10; AC-06, AC-14)_.
  - Nas rodadas de token, o reset e o header usam `http.<url>.extraHeader`, com `<url>` = `${base}/${repo}.git` exatamente como é passada ao git.
  - O `credential.helper=` genérico fica como está.
  - **Teste:** HOME com `http.<base>/.extraheader` de C_DEV e `credential.<base>.helper` devolvendo C_DEV. Nas rodadas de token, o harness registra só o token da origem, na ordem do AC-14; na rodada `git`, C_DEV.
- [x] **C2 — Sem redirect nas rodadas de token** _(T6, T10)_.
  - `http.<url>.followRedirects=false`, com escopo de URL, porque um `true` com escopo no config do dev vence o genérico (E5e).
  - Um 3xx vira a classe `redirect`: não avança a cascata e aparece com mensagem própria no doctor, no sync e no instalador.
  - **Teste:** um segundo servidor no harness e o primeiro respondendo 302 para ele. O segundo não recebe nenhuma requisição com `Authorization`, `ahc sync` sai ≠ 0 e nenhuma origem posterior é apresentada.
- [x] **C3 — Nenhum token vai a host reescrito por `insteadOf`** _(T6, T10)_.
  - Garantido pelo C1 (E4b).
  - **Teste:** HOME com `url.<servidor B>.insteadOf=<base>`. Em `sync`, `doctor` e `install.sh`, B não recebe `Authorization` com T_ENV, T_CFG nem T_EMBUTIDO.
- [x] **C4 — Classificação estável e fechada** _(T5, T6, T8, T10)_.
  - `LC_ALL=C` e `LANGUAGE=C` no env de todo git.
  - Só linhas `fatal:`/`error:` contam; linhas `remote:` são ignoradas.
  - `returned error: 30x` → `redirect`; texto não reconhecido → `desconhecido`. Nenhuma das duas avança, e ambas mostram só a primeira linha já redigida (C9).
  - **Teste:** a tabela do AC-14 com `LANG=pt_BR.UTF-8` no ambiente. Teste unitário de `classifyGitFailure`: `remote: Authentication failed` seguido de erro de conexão → `rede`; texto arbitrário → `desconhecido`.
- [x] **C5 — Env e cwd do git saneados** _(T5, T10)_.
  - Remover do env as variáveis de `git rev-parse --local-env-vars` (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_COMMON_DIR` e afins), além de `GIT_TRACE*` e `GIT_CURL_VERBOSE`.
  - Fixar `GIT_TRACE_REDACT=1`.
  - `cwd` do `execFileSync` = `CACHE_DIR`. No `install.sh`, a mesma limpeza com `unset` num subshell.
  - **Teste:** `GIT_DIR` apontando para um repo de teste com arquivo modificado e não commitado. Depois de `ahc sync`, `ahc doctor` e `install.sh`, HEAD, índice e arquivo ficam idênticos.
- [x] **C6 — `GIT_CONFIG_COUNT` herdado validado** _(T5, T10)_.
  - Só `^[0-9]+$` é aceito antes de qualquer aritmética, em Node e em bash.
  - Fora disso: erro claro, sem rodar git e sem ecoar o valor.
  - **Teste:** `GIT_CONFIG_COUNT='x[$(touch <marcador>)]'`. O marcador não é criado, o exit é ≠ 0 e o harness não recebe requisições.
- [x] **C7 — Guard de loopback sem nome de host** _(T3)_.
  - Regex `^http://(127\.0\.0\.1|\[::1\]):[0-9]{1,5}$`, igual nos dois arquivos. No bash, o padrão fica numa variável e o teste é `[[ $x =~ $re ]]`, sem aspas no lado direito.
  - Com override válido, sai uma linha em stderr: `[ahc] modo de teste: base <url>`.
  - `AHC_TEST_EMBEDDED_TOKEN` sem base válida é ignorado.
  - **Teste:** os casos do T3, mais `http://localhost:1`, `http://127.0.0.1:1/x` e `http://127.0.0.1:1#@evil.test`, todos rejeitados. `AHC_TEST_EMBEDDED_TOKEN` sozinho não chega a nenhum servidor.
- [x] **C8 — Token só no modo git** _(T6)_.
  - `fetchURL` (`file://`/`http*`) nunca recebe `Authorization`.
  - **Teste:** `cfg.repo=http://127.0.0.1:<porta>/` com T_ENV e T_CFG definidos. O harness registra zero `Authorization`.
- [x] **C9 — Higiene de saída provada por canário** _(T5–T10)_.
  - Nenhum valor de token, nem seu base64 (`x-access-token:<v>`), aparece em stdout, stderr, doctor, mensagens de erro ou na linha de aviso que vai ao contexto do SessionStart.
  - Todo eco de stderr do git ou de `e.message` passa por `redact()`: tira os valores das origens e as linhas `Authorization` e limita a saída à primeira linha.
  - Nunca serializar o objeto de erro inteiro.
  - **Teste:** tokens canário distintos nas linhas do AC-14 e do AC-10 e nas classes `rede`, `redirect` e `desconhecido`, para `sync`, `sync --quiet`, `list`, `doctor` e `install.sh`. Uma das rodadas usa `GIT_TRACE=1 GIT_TRACE_CURL=1 GIT_CURL_VERBOSE=1 GIT_TRACE_REDACT=0`. O grep do canário e do base64 em stdout+stderr retorna 0.
- [x] **C10 — `install.sh` seguro para `curl | bash` e sem token em argv** _(T9, T10; AC-02, AC-03)_.
  - O corpo inteiro fica em `main() { … }`, com `main "$@"` como última linha.
  - Sem `set -x`/`xtrace`.
  - O token chega ao `node` (base64) só por variável de ambiente e ao git só como prefixo do comando num subshell, nunca por `export` global nem por argv.
  - **Testes:**
    - (a) estático: a última linha não vazia é `main "$@"` e não há `set -x`;
    - (b) truncamento: `head -c <N> install.sh | bash` com N em 25, 50 e 90% não cria nada no HOME temporário nem em `AHC_BIN_DIR`;
    - (c) shims de `git` e `node` no PATH registram argv e repassam ao binário real, e o canário não aparece no registro.
- [x] **C11 — Escrita da config atômica e sem perda** _(T4, T9; AC-07, AC-11, AC-15)_.
  - `writeFileSync(tmp, dados, { mode: 0o600, flag: 'wx' })`, com nome aleatório no mesmo diretório, seguido de `renameSync`; o tmp é removido em caso de erro. O merge do instalador usa a mesma rotina.
  - Se a config existente tiver JSON inválido, o instalador não a sobrescreve e sai ≠ 0 com instrução.
  - `token` que não é string não vira origem.
  - **Teste:** com `umask 000`, `ahc config token=…` e `install.sh` deixam o modo final em 600. Com config inválida, o arquivo fica byte a byte igual e o exit é ≠ 0. Com `"token": 123`, não há rodada de config no harness.
- [x] **C12 — Espelho sem o token na árvore e no histórico** _(T12)_.
  - Além de esvaziar os marcadores, o `make-mirror --apply` gera a cópia como **commit órfão**, sem histórico do canônico.
  - O `--check` falha se algum blob alcançável a partir de HEAD tiver marcador com valor ou casar `github_pat_[A-Za-z0-9_]{20,}`.
  - **Teste em `test/mirror.test.js`:** repo de fixture em que o commit 1 traz o marcador com valor fictício no formato `github_pat_`, **montado em runtime por concatenação** (nenhum literal no repo), e o commit 2 esvazia o marcador. O `--check` falha pelo histórico; a saída do `--apply` tem um único commit, e `git log --all -p` da cópia não contém o valor.
- [x] **C13 — O literal embutido é um fine-grained de leitura** _(T3, T0, T14)_.
  - `embedded-token.test.js` passa com `''` ou com valor que case `^github_pat_[A-Za-z0-9_]+$`, e falha com `ghp_`, `gho_` ou qualquer outro formato.
  - O T0(c) registra que `git push --dry-run` com o token é recusado e que `GET /repos/EMS-NCTECH/<outro repo>` responde 404. O T14 só roda com os dois resultados registrados.
  - **Teste:** cópia temporária dos dois arquivos com um `ghp_` montado em runtime faz o teste falhar.
- [x] **C14 — Integridade preservada no refactor** _(T6, T10)_.
  - O novo consumo de `{cache, source, refused}` mantém a verificação sha256 por item e por arquivo de skill, qualquer que seja a origem que autenticou.
  - **Teste:** o harness publica um agent cujo conteúdo diverge do sha do manifest. O arquivo não é gravado, o lock do item não muda e aparece `hash mismatch` em stderr.
- [x] **Mantidos do §5 como controles obrigatórios:**
  - `execFileSync` com validação de `repo`/`branch` antes de qualquer rede, e `GIT_ASKPASS` que dorme não trava (T5);
  - nada em URL, argv, `.git/config` ou `~/.gitconfig`: o T11 compara o sha256 do `~/.gitconfig` e deve também afirmar que o `.git/config` do cache não tem `extraheader` nem userinfo;
  - marcador único e literais idênticos (T3).

**Controles compensatórios opcionais** (não contradizem as decisões do lead):
- **O1 (opcional) — Detecção de expiração e revogação:** workflow agendado no canônico, ou rotina read-only do hub, que faz `git ls-remote` com o literal do próprio repo. Avisa quando o token é recusado ou quando o header `github-authentication-token-expiration` indica menos de 30 dias.
- **O2 (opcional) — Bus factor da conta do lead:** runbook de rotação (PR com o valor novo, atualização da wiki, aviso aos devs) e um segundo admin da org apto a criar o PAT substituto.
- **O3 (opcional) — Auditoria:** revisão periódica do audit log da org para o uso do token (acesso programático, IPs inesperados), onde o plano da org expuser esses eventos.
- **O4 (opcional):** `ahc doctor` emite ⚠ quando `cfg.repo` ≠ `EMS-NCTECH/agents-hub-claude`, contra engenharia social que aponte para outro hub.
- **O5 (opcional):** a dica do doctor prefere `ahc config token=` (arquivo 600) a `export AHC_GITHUB_TOKEN` no rc do shell, que propaga o token a todo processo filho, inclusive às sessões do Claude Code.
- **O6 (opcional; conflita com §4, decisão do lead):** mascarar o token na saída de `ahc config`. Hoje ela imprime `[config] token = <valor>` e o JSON inteiro; se o Claude rodar o comando numa sessão, o valor entra no transcript, inclusive quando é um token pessoal do dev, que não está coberto pelo risco aceito.
- **O7 (opcional) — One-liner da wiki:** `curl --proto '=https' --tlsv1.2 -fsSL …`, nunca com `-L`. Alternativa: baixar para arquivo e rodar `bash <arquivo>` com `&&`, o que evita o exit 0 silencioso quando o `curl` falha.
- **O8 (opcional):** pr-review, code-review e veredito redigem a linha `AHC-EMBEDDED-TOKEN` antes de mandar o diff a modelo ou ao Slack.
- **O9 (opcional):** `core.hooksPath` apontando para um diretório vazio nas rodadas de token, para que hooks globais do dev não recebam o env com o header.
- **O10 (opcional):** o doctor usa `git ls-remote --get-url` para rotular "indisponível (URL reescrita por insteadOf)" em vez de "recusada".
- **O11 (opcional):** `.githooks/pre-push` no canônico recusa `github_pat_` fora das duas linhas `AHC-EMBEDDED-TOKEN`.

**Veredito de design (Phase 2.5): APPROVE WITH MITIGATIONS.**
- Critical: nenhum.
- High, com correção definida neste §7:
  - token a host reescrito por `insteadOf` (C1/C3);
  - token ao host de destino de redirect (C2);
  - token no histórico do espelho (C12).
- Medium:
  - precedência quebrada por chave com escopo do dev (C1);
  - `GIT_DIR` herdado (C5);
  - classificação dependente de locale (C4);
  - higiene de saída (C9);
  - `install.sh` (C10, C11);
  - formato do literal (C13).
- Low: `GIT_CONFIG_COUNT` (C6), guard de loopback (C7), cwd no Windows (C5).
- Aceitos pelo lead: vazamento do token, dependência da conta do lead e falta de atribuição.
- **Exceção de merge (2026-09-16, lead/org-admin):** o check obrigatório `Datadog PR Gates / No new secrets violations` reprovou o PR #22 por causa do literal embutido. Decidido mergear com bypass de organization admin. O gate não havia sido mapeado nem no §0 nem neste threat model; registro completo no ADR-0001, seção "Exceção de merge".
- O gate de release no VERIFY exige C1–C14 com testes verdes.

## 8. QA plan _(VERIFY)_
**Test pyramid:** majoritariamente **integração** — o CLI real (`bin/ahc`) e o `install.sh` real rodam contra um remoto HTTP autenticado local (`test/support/git-auth-server.js`, sobre `git http-backend`), sempre com HOME temporário na CB. **Unit** onde a lógica é pura e exportada sob `require.main !== module`: `classifyGitFailure`, `credentialSources`, `tokenConfigEntries`. **E2E** só manual (E1, contra o canônico real — pendente do T14). **Sem fuzz**: a superfície é uma tabela fechada de classificação de mensagem de erro, coberta caso a caso.
**GOAL metric observable?** Ainda não. A métrica do GOAL (taxa de sucesso de install + sync na CB) só é medível contra o canônico real, pelo E1 pós-T14; o leading indicator (clones em 14 dias) vem da API `repos/EMS-NCTECH/agents-hub-claude/traffic/clones`, sem dashboard.
**Execução (2026-09-16, já com o token embutido gravado pelo T14):** `node --test test/*.test.js` → **277 testes, 0 falhas, 0 skips**. `node scripts/validate-artifacts.js` → **0 erros, 0 warnings**. CI verde no PR.
**PRs:** [#21](https://github.com/EMS-NCTECH/agents-hub-claude/pull/21) (mergeado em 2026-09-16T17:17:46Z, commit `0c08537`) levou T1–T13 + T10b/T10c, mas **sem o T14**: foi mergeado antes de o commit do token chegar, e a `main` ficou com os marcadores vazios. [#22](https://github.com/EMS-NCTECH/agents-hub-claude/pull/22) traz o T14 e a correção do contrato dos testes.
**Controles do §7:** C1–C14 todos com teste verde. O C10 estava sem prova nenhuma até o T10c.
**AC traceability:**
| AC | Test file | Status |
|---|---|---|
| AC-01 — one-liner da wiki na CB | E1 manual de 2026-09-16, registrado no §0 "Baseline at ship" | ✅ **verde**: instalou e sincronizou na CB autenticando `via embutido` |
| AC-02 — instalador em HOME limpo | `test/install.test.js`, `test/doctor.test.js` | ✅ verde |
| AC-03 — instalador não reporta sucesso falso | `test/install.test.js` | ✅ verde |
| AC-04 — sync e list em cache existente | `test/auth-cascade.test.js` | ✅ verde |
| AC-05 — sync do hook `SessionStart` | `test/hook-mode.test.js`, `test/git-refresh.test.js` | ✅ verde |
| AC-06 — precedência do token | `test/auth-cascade.test.js`, `test/doctor.test.js` | ✅ verde |
| AC-07 — valor com `=` gravado por inteiro | `test/config.test.js` | ✅ verde |
| AC-08 — token novo sobre cache antigo | `test/auth-cascade.test.js`, `test/git-auth-harness.test.js` | ✅ verde |
| AC-09 — doctor verde sem credencial git | `test/doctor.test.js` | ✅ verde |
| AC-10 — doctor diante de origens recusadas | `test/doctor.test.js`, `test/regression-dev-credential.test.js` | ✅ verde |
| AC-11 — config gravada não contradiz o doctor | `test/config.test.js`, `test/install.test.js` | ✅ verde |
| AC-12 — dev com credencial e instalação existente | `test/regression-dev-credential.test.js`, `test/git-refresh.test.js`, `test/doctor.test.js` | ✅ verde (smoke com `gh auth` real segue no E1) |
| AC-13 — suíte existente e origem única verdes | `test/auth-cascade.test.js`, `test/git-refresh.test.js` + suíte inteira | ✅ verde |
| AC-14 — cascata até uma origem autenticar | `test/auth-cascade.test.js`, `test/install.test.js`, `test/hook-mode.test.js`, `test/git-auth-harness.test.js` | ✅ verde |
| AC-15 — reinstalação mantém o token | `test/install.test.js` | ✅ verde |
| AC-16 — `ahc config` não exibe o token inteiro | `test/config.test.js` | ✅ verde |

## 9. Cross-repo peer consults _(optional — only when another repo is touched)_
| Phase | Peer session | Repo | Ref lido | Pergunta | Resposta (arquivo:linha) | Mudou o plano? |
|---|---|---|---|---|---|---|

**Handshake**
| Sessão | remote | branch | head | dirty | origin_main_fresh |
|---|---|---|---|:--:|:--:|

_Única sessão vizinha (`refinmulnivel-5e`) não é de repo afetado — sem consulta._

## 10. Done
- [x] **Code merged** — T1–T14 na `main` pelos PRs [#21](https://github.com/EMS-NCTECH/agents-hub-claude/pull/21) e [#22](https://github.com/EMS-NCTECH/agents-hub-claude/pull/22). O [#23](https://github.com/EMS-NCTECH/agents-hub-claude/pull/23) segue aberto: leva o registro da exceção de segurança e este fechamento.
- [ ] **Custo de orquestração medido e registrado (§11)** — *não medido*: a skill `session-cost` não está instalada nesta máquina. Não estimar (ver §11).
- [x] **All AC tests green** — AC-02 a AC-16 pela suíte (277 testes, 0 falhas, 0 skips) e AC-01 pelo E1 de 2026-09-16.
- [ ] **GOAL metric instrumented & observable** — a métrica foi **medida** (E1: 0% → 100%), mas não é observável de forma contínua: o leading indicator (clones em 14 dias) não tem dashboard.
- [x] **Security verdict: APPROVE** — a Phase 2.5 deu APPROVE WITH MITIGATIONS e os controles C1–C14 estão verdes. **Ressalva registrada:** o check obrigatório `Datadog PR Gates / No new secrets violations` reprovou o literal embutido e foi contornado por bypass de organization admin (ADR-0001, seção "Exceção de merge").
- [ ] **Memory synced** — o `project-memory-keeper` ainda não rodou para esta demanda.
- [x] **GOAL baseline recorded at ship** — §0, "Baseline at ship".
- [x] **Affected peer repos notified (if any)** — nenhum: o §9 registra que a única sessão vizinha não era de repo afetado.

## 11. Custo _(SHIP — medido, não estimado)_
**Início:** 2026-09-14T19:59:27Z
**Fonte:** não medido — skill `session-cost` não instalada nesta máquina (`~/.claude/skills/session-cost/scripts/otel-setup.js` ausente)
**Comando:** —

_Sem fonte de medição: total da sessão via `/cost` nativo._

**Atualização 2026-09-16 (SHIP):** segue sem fonte de medição — a skill `session-cost` continua ausente nesta máquina, então o custo de orquestração desta demanda **não foi medido**. Pela regra do próprio §11 (medido, não estimado), fica registrado como não medido em vez de receber um número inventado.
