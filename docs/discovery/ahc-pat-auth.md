# Discovery: Autenticação do ahc por PAT de conta de serviço
**Data:** 2026-09-14 | **Facilitador:** Claude (/flow, demanda 001-ahc-pat-auth) | **Status:** Validated

## Problem Statement

Devs da EMS-NCTECH **sem credencial git configurada** não conseguem instalar nem atualizar o hub quando rodam o `install.sh` ou o `ahc sync`,
porque o clone do repo `internal` depende do credential helper da máquina (`install.sh:27`, `bin/ahc:103-119`) e não há outro caminho de autenticação,
o que leva a **0% de instalações bem-sucedidas nessas máquinas** (reproduzido em 2026-09-14) e a devs fora do ferramental padrão da engenharia.

**5 Whys (resumo)**
1. Por que o dev não tem o hub? → O `install.sh` falha no `git clone`.
2. Por que o clone falha? → O git pede usuário e não há credencial (`fatal: could not read Username for 'https://github.com'`).
3. Por que não há credencial? → A máquina não passou por `gh auth login` / credential helper.
4. Por que isso bloqueia? → O `ahc` só sabe autenticar usando a credencial do git do dev; `AHC_GITHUB_TOKEN` aparece na hint do `ahc doctor` (`bin/ahc:542`), mas não é lido em lugar nenhum.
5. Por que não há alternativa? → O repo é `internal` por política e não pode ficar público (ROADMAP §10); o item §1, que resolveria isso, nunca foi implementado.

## Usuários afetados

| Segment | Who they are | Pain intensity (1-5) | Frequency | Current workaround |
|---|---|---|---|---|
| Dev sem credencial git | Membro da engenharia com conta na org, mas sem `gh`/credential helper na máquina (máquina nova, Git Bash no Windows, ambiente restrito) | 5 — não instala | Uma vez por máquina, e em todo `sync` se a credencial some | Rodar `gh auth login` / `gh auth setup-git` (README §Solução de problemas) — exige saber o que fazer |
| Dev em onboarding | Dev novo seguindo o README | 4 — primeiro contato com o hub falha | Uma vez | Pedir ajuda a quem já tem instalado |
| Dev já instalado | Tem credencial funcionando | 1 — não afetado | — | — |

**Dimensão:** a org tem 217 membros no GitHub (API `orgs/EMS-NCTECH/members`, 2026-09-14); o lead relata mais de 50 devs usando `ahc sync`.

> **Research gap:** ninguém conversou com devs bloqueados e não há contagem de quantos são. A evidência de dor é o relato do lead, a entrada de troubleshooting do README para `could not read Username` (indica que já aconteceu) e a reprodução técnica. Ver experimento E2.

## Outcome desejado

**JTBD**
> Quando eu recebo o comando de instalação do hub na wiki interna,
> quero rodar uma única linha e ter os agents funcionando,
> para ter o mesmo ferramental da engenharia sem precisar configurar credencial git.

**Métrica de sucesso (GOAL)**
```
Metric:   Taxa de sucesso de install + sync numa máquina sem credencial git
Baseline: 0% — 0 de 1 tentativa (source: reprodução em 2026-09-14 com HOME limpo,
          GIT_TERMINAL_PROMPT=0, sem credential helper: `git clone` do install.sh
          termina com exit 128, "could not read Username for 'https://github.com'")
Target:   100% — one-liner da wiki + `ahc sync` + `ahc doctor` verdes na mesma reprodução,
          e teste automatizado cobrindo a precedência do token — até 2026-09-30
Leading indicators:
  - GitHub traffic `count` de clones (14 dias). Baseline: 15 clones / 9 únicos
    (2026-08-31 → 2026-09-13, API repos/EMS-NCTECH/agents-hub-claude/traffic/clones).
    Espera-se que `count` suba conforme devs bloqueados instalam.
    `uniques` deve CAIR para ~1 após o ship — todos passam a clonar como a conta de
    serviço. Isso é esperado e não é regressão.
  - Mensagens de suporte do tipo "could not read Username" — sem fonte hoje.
```

## Premissas & Riscos

| # | Assumption | Type | Confidence (1-5) | Test |
|---|---|---|---|---|
| D1 | Existe um grupo relevante de devs travado por falta de credencial git | Desirability | 2 | E2 — os 9 clones únicos em 14 dias contrastam com "mais de 50 devs"; o tamanho do grupo é desconhecido |
| D2 | Os devs-alvo têm acesso à wiki interna onde o one-liner será publicado | Desirability | 3 | Lead confirma a audiência da wiki |
| F1 | Um PAT fine-grained de conta de serviço lê um repo `internal` desta org enterprise (política de PAT e eventual SSO permitem) | Feasibility | 3 | E1 |
| F2 | O one-liner consegue baixar o `install.sh` do repo `internal` usando o token | Feasibility | 4 | E1 |
| F3 | Trocar o token por env/config tem efeito num cache já clonado. Se o token for gravado na URL do `origin`, o `git fetch origin` do `gitRefresh` continua usando o token antigo | Feasibility | 3 | E1 + decisão no PLAN (passar o token a cada chamada, não no remote) |
| V1 | O token fixo não expira antes de existir um jeito de redistribuir (a política da org pode impor expiração máxima) | Viability | 3 | E1 — registrar a expiração permitida ao criar o token |
| V2 | A conta de serviço pode ser criada e ter acesso só a este repo (assento enterprise, aprovação de admin) | Viability | 3 | Lead/admin da org |
| M1 | A adoção pós-ship é mensurável | Viability | 2 | E3 — `uniques` perde atribuição com token compartilhado e o `ahc` não tem telemetria (ROADMAP §5.3 pendente) |

**Riscos aceitos pelo lead (não reabrir):** token fixo no código e vazamento dele (dá leitura só deste repo); PAT por usuário fora de escopo; sem cofre de segredos.

## Experimentos

| # | Experiment | What it tests | Cost (time) | Success signal |
|---|---|---|---|---|
| E1 | Spike com o token real: criar a conta de serviço + PAT fine-grained; de um HOME limpo, rodar `git ls-remote` autenticado pelo token e baixar o `install.sh` com `curl` | F1, F2, F3, V1, V2 | 30 min (precisa de admin da org) | `ls-remote` com exit 0; `curl` com HTTP 200; expiração máxima registrada |
| E2 | Enquete de 1 pergunta no canal de engenharia: "tentou instalar o hub e travou em credencial git?" | D1 | 1 dia | Número de devs bloqueados — dimensiona o impacto |
| E3 | Rodar `ahc sync` hoje e conferir amanhã se o `count` do traffic de 2026-09-14 subiu | M1 (o traffic conta o `git fetch` do sync?) | 1 dia, custo zero | Sim → `count` vira indicador de uso; não → uso real exige telemetria |

## Re-escopo — espelho como origem (2026-09-14, lead)

**Decisões**
- **Todos os devs** instalam e sincronizam a partir do espelho privado `washingtonsarago/agents-hub-claude`, usando o token fixo. O canônico `EMS-NCTECH/agents-hub-claude` continua sendo a fonte dos PRs e dos gates de CI.
- O espelho é atualizado **automaticamente a cada merge** na `main` canônica (GitHub Action rodando `scripts/make-mirror.js` + push). Isso entra no escopo desta demanda.

**Evidência (API, 2026-09-14)**
- O último commit na `main` do espelho é de 2026-08-15 (`chore(mirror): aplicar transform de distribuição externa`). O último na canônica é de 2026-09-02 (merge do PR #20). **Defasagem atual: 18 dias.**
- O espelho tem 9 colaboradores, que hoje sincronizam com a própria credencial git.

**Efeito na métrica**
- A métrica do GOAL continua a mesma. Nova condição: um sync só conta como sucesso se entregar o conteúdo da `main` canônica vigente.
- Novo leading indicator: **defasagem entre o merge na `main` canônica e o commit de transform no espelho**. Baseline: 18 dias (fonte: API de commits dos dois repos, 2026-09-14). Alvo: ≤ 15 min após cada merge, até 2026-09-30.
- O traffic de clones passa a ser medido no espelho. O baseline de 15/9 do canônico deixa de ser comparável.

- **Dono do token (decidido depois da F4):** PAT fine-grained da conta `washingtonsarago`, com dono dos recursos = `washingtonsarago`, só o repositório `agents-hub-claude` (espelho) e `Contents: Read-only`. A conta de serviço sai desta demanda, porque não conseguiria ler um repo pessoal com PAT fine-grained. Não cria dependência nova da conta do lead, já que o espelho já é dela.

**Novas premissas**

| # | Assumption | Type | Confidence (1-5) | Test |
|---|---|---|---|---|
| F4 | Um PAT fine-grained da conta de serviço lê um repo privado de **outra conta pessoal** onde ela é só colaboradora | Feasibility | **Falsa** | Docs do GitHub ("Managing your personal access tokens", consultada em 2026-09-14): "Each token is limited to access resources owned by a single user or organization", e está listado como limitação "Using fine-grained personal access token to contribute to repositories where the user is an outside or repository collaborator". Token sem expiração é permitido, salvo política de org ou enterprise |
| F5 | Uma Action no canônico consegue fazer push no espelho pessoal usando um secret com escrita (política de Actions/secrets da org) | Feasibility | 3 | Spike de 1 workflow |
| F6 | As travas do canônico (`origin.test.js`, `pre-push`) não conflitam: o transform do espelho já as remove e reescreve os slugs para o espelho | Feasibility | 4 | Ler `scripts/make-mirror.js` |

## Re-escopo revertido — distribuição dentro da org (2026-09-15, lead)

- **O que aconteceu.** O desenho "espelho pessoal como origem + publicação automática do repo internal para `washingtonsarago/agents-hub-claude`" foi bloqueado pelo controle de segurança do Claude Code (credential leakage). Juntos, o token no código distribuído e a cópia automática tirariam o conteúdo da org do controle dela.
- **Decisão do lead.** Manter tudo dentro da org. Origem única de instalação e sync = `EMS-NCTECH/agents-hub-claude`. O token é um PAT fine-grained criado pela conta do lead, com dono dos recursos = `EMS-NCTECH`, só o repo canônico, `Contents` + `Metadata` read-only. Sem espelho automático e sem conta de serviço.
- **Impacto na métrica.** A métrica do GOAL não muda. O leading indicator de defasagem do espelho sai do escopo. O traffic de clones volta a ser medido no canônico (baseline 15 clones / 9 únicos).
- **Premissas.** F4, F5 e F6 deixam de se aplicar. Nova premissa **F7**: a org permite PAT fine-grained com EMS-NCTECH como dona dos recursos, sem aprovação ou com aprovação concedida. Confiança 3; teste: E1 com o token novo.
- **E1.** O mecanismo foi validado no espelho: injeção por invocação, fetch em cache existente, classificação do 403 e HOME intacta. **Falta refazer contra o canônico** com o token novo.

## Recomendação

**Go.**

- **O problema está comprovado objetivamente:** a falha foi reproduzida e o código confirma que não há caminho alternativo.
- **A solução já foi decidida pelo lead, é barata e é reversível:** cerca de 1 dia de código segundo o ROADMAP §1, e revogar o token desfaz o acesso em segundos.
- **As premissas de baixa confiança não bloqueiam o build.** D1 e M1 afetam o tamanho do impacto e a forma de medir, não a correção da entrega. Segurar a demanda até terminar E2 e E3 custaria mais do que construir.
- **O E1 é pré-requisito do BUILD de qualquer forma:** o token precisa existir para testar a entrega ponta a ponta. Ele vira a tarefa T0.

## Próximos passos

- [ ] E1 — lead/admin cria a conta de serviço e o PAT, e roda o spike (bloqueia o teste ponta a ponta do BUILD)
  - **1ª tentativa, 2026-09-14 — inconclusiva (token errado, não premissa falsa):**
    - O token fine-grained testado pertence à conta pessoal `washingtonsarago` e só enxerga 6 repos públicos pessoais. Nenhum repo da EMS-NCTECH aparece.
    - No hub canônico, a API dá 404 e o raw dá 404. O `git ls-remote`/`clone` dá 403 com "Write access to repository not granted", a mensagem que o GitHub usa quando o token autentica mas não tem leitura de conteúdo.
    - No espelho privado `washingtonsarago/agents-hub-claude`, o resultado é o mesmo: 404/403.
    - Não veio o header `github-authentication-token-expiration`.
    - A conta de serviço `ems-nctech-hub-reader` ainda não existe no GitHub (`users/` dá 404), então V2 segue aberta.
    - **Confirmado mesmo com a falha:** o token passado só por `GIT_CONFIG_COUNT`/`http.extraHeader` não grava nada na HOME limpa.
    - **Próxima tentativa:** PAT criado na conta de serviço, com dono dos recursos = EMS-NCTECH, "Only select repositories: agents-hub-claude" e `Contents: Read`. _(Superada pelo re-escopo: o token agora é do espelho.)_
  - **2ª tentativa, contra o espelho — falhou por permissão:** API do espelho 200 (Metadata), mas raw 404, contents 403 e git 403. O header `x-accepted-github-permissions: contents=read` mostrou que faltava `Contents`. O lead removeu `Administration` e adicionou `Contents: Read-only`.
  - **3ª tentativa, 2026-09-14 — PASSOU** (PAT fine-grained de `washingtonsarago`, 93 caracteres, só o espelho, `Contents` + `Metadata` read-only):
    - **Validade (V1):** sem header `github-authentication-token-expiration`, ou seja, token sem expiração. V1 validada.
    - **Escopo:** espelho 200; canônico 404; `/user/repos?type=private` lista 1 item.
    - **One-liner (F2):** o `install.sh` baixa por `raw.githubusercontent.com` (200) e pela API contents com `Accept: application/vnd.github.raw` (200). O arquivo do espelho já traz `REPO="${AHC_REPO:-washingtonsarago/agents-hub-claude}"` e passa em `bash -n`. F2 validada.
    - **Git com HOME limpo, token só por `GIT_CONFIG_COUNT`/`http.extraHeader` (F1):** `ls-remote` exit 0 (head `ad8e92d`); `clone --depth=1` exit 0; o `manifest.json` clonado tem `repo=washingtonsarago/agents-hub-claude` e `updated_at=2026-08-14`, o que confirma a defasagem. F1 validada.
    - **Cache existente (F3):** `fetch` + `reset --hard FETCH_HEAD` com o token exit 0; o mesmo `fetch` sem token exit 128. O token não aparece em `.git/config` (0 ocorrências) e a HOME fica vazia. F3 validada para injeção por invocação.
    - **Cascata:** o token contra o canônico dá exit 128. O GitHub responde **403 "Write access to repository not granted"** quando falta leitura de conteúdo, então esse texto precisa contar como credencial recusada.
    - **Observação:** `GET /repos/<espelho>/collaborators` responde 200 só com `metadata=read`, então não serve para provar que `Administration` saiu. A evidência disso é a tela do lead.
- [ ] E2 e E3 em paralelo ao BUILD
- [ ] DEFINE — `senior-product-owner` quebra em histórias INVEST com AC em Gherkin
- [ ] PLAN — `system-architect` resolve F3 (onde o token entra no git) e a precedência env > config > fixo
- [ ] Atualizar ROADMAP §1, §9 e §10 com a decisão de 2026-09-14

## E1 — PAT fine-grained da org contra o canônico (2026-09-15, orquestrador)

Execução do T0. Rodado pelo lead na própria máquina, com `HOME` temporário, `GIT_CONFIG_NOSYSTEM=1` e o PAT lido de arquivo local modo 600. **Nenhum agente viu o valor**; o token entrou só em env do `git` (via `GIT_CONFIG_COUNT`) e em arquivo de config do `curl` — nunca em `argv` — e todo o relatório passou por redator antes de ser lido. Alvo: `EMS-NCTECH/agents-hub-claude`.

| # | Verificação | Resultado |
|---|---|---|
| a | `ls-remote` com `Authorization: Basic base64("x-access-token:<PAT>")` injetado por `GIT_CONFIG_COUNT` | **exit 0** — F1 e F7 confirmadas |
| b | contents API, `Accept: application/vnd.github.raw`, `?ref=main` | **HTTP 200**, 2804 bytes — F2 confirmada. Com `Accept: application/vnd.github+json` também 200 |
| c | escopo: `EMS-NCTECH/nctech-pipeline` | **403** na API e no git (`remote: Write access to repository not granted`) |
| c | token inválido | API **401**; no git, `fatal: could not read Username … terminal prompts disabled` |
| c2 | `push --dry-run` no próprio repo | **recusado, 403** `Write access to repository not granted` — **C13 satisfeito: o PAT é só de leitura** |
| d | `clone --depth=1` → `fetch <url> refs/heads/main` → `reset --hard FETCH_HEAD`, com token, sobre cache existente | **todos exit 0** — F3 confirmada |
| d | o mesmo `fetch` **sem** token | exit 128 (`could not read Username`) |
| d | `.git/config` depois do clone | **sem credencial**; `remote.origin.url` limpo. `HOME` temporário com 0 entradas |
| e | `github-authentication-token-expiration` | **2027-09-16 13:08:33 UTC** |
| f | latência | **772 ms** com 1 tentativa; **1095 ms** com 2 (invalida → válida). Custo da tentativa extra: **+323 ms** |

**Calibração da tabela de classificação (§5 do task.md):**
- Token **inválido** produz exatamente o mesmo stderr de *nenhuma credencial* (`could not read Username`). A tabela já trata a linha como recusa na rodada de token — agora confirmado contra o GitHub real.
- Token **válido sem acesso ao repo** produz `Write access to repository not granted` + 403, mensagem enganosa para uma leitura. A tabela acerta ao classificar como recusa.
- **Achado novo, não previsto:** `branch` inexistente produz `fatal: couldn't find remote ref refs/heads/<branch>`. Não casa nenhuma linha da tabela, então cai em `unknown` e **não avança** a cascata — comportamento certo (não é falha de credencial), mas a mensagem ao dev fica sem sentido. **Ajuste pendente:** linha própria na tabela, com texto dizendo que a branch não existe.

**Ressalvas honestas:**
- A primeira execução devolveu **403** para a contents API em `?ref=feat/001-ahc-pat-auth`; a segunda, para a mesma URL, devolveu **404 `No commit found for the ref`**. O corpo do 403 não foi preservado e a condição **não se reproduziu**. Como o caminho de produção (`?ref=main`) está em 200 e a branch de fato não existe no remoto, não é bloqueio — mas se o 403 reaparecer, investigar antes de publicar o one-liner.
- A branch `feat/001-ahc-pat-auth` **não está no remoto** (só o commit local `1733caa`). Por isso (b) e (d) da primeira rodada falharam. A substância de F2 e F3 foi provada contra `main`; executar o one-liner de verdade antes do merge exige o push da branch.
- O `bash -n` da primeira rodada foi **falso positivo**: rodou sobre o JSON de erro, que o bash aceita como sintaxe válida. Corrigido no follow-up, que exige HTTP 200 antes de validar sintaxe.

**Ainda aberto para o AC-01:** executar o one-liner completo (`curl … | bash`) numa máquina sem credencial git, contra o canônico, com o token embutido já gravado (T14). Depende do push da branch ou do merge.

### E1c — o `403` da contents API é cota, não permissão (2026-09-15)

O `403` visto no E1 e na primeira tentativa de instalação reproduziu e foi diagnosticado: **`API rate limit exceeded for user ID <id do dono do PAT>`**, com `x-ratelimit-limit: 5000` e `remaining: 0`. Não tem relação com escopo do token, com o `ref` nem com o `Accept`. Na mesma execução, depois do reset da janela, `GET /commits/<branch>` respondeu 200 com `remaining: 4999`.

Na mesma rodada, pelo **git**, com o mesmo PAT: `ls-remote` da branch exit 0 e `clone --depth=1 --branch <branch>` exit 0, com o `install.sh` correto (27.183 bytes, cascata presente). **Operações git não consomem a cota da REST API.**

**Consequência de desenho, não só de teste:** o limite de 5000 req/h é **por usuário dono do PAT**, não por repositório nem por dev. Como o token embutido é único e pertence à conta do lead, toda chamada do one-liner (uma por instalação) divide a mesma cota com o uso próprio de API dessa conta — `gh` CLI, IDE, automações. O `ahc sync` **não** entra nessa conta, porque usa git.

- Volume esperado: ~1 chamada por instalação, para um grupo na casa das dezenas. Folgado contra 5000/h.
- Risco real: a cota ser exaurida pelo **uso pessoal do dono do token** (foi o que aconteceu aqui), e o dev que tentar instalar naquela hora receber um `403` cuja mensagem não diz nada sobre esperar.
- Mitigações possíveis, não decididas: documentar o `403` de cota no troubleshooting; usar `-f` no `curl` do one-liner para a falha aparecer; considerar um PAT de conta dedicada se o grupo crescer.

**Correção do registro:** o E1 concluiu que o `403` da primeira rodada "não se reproduziu". Reproduziu — a segunda rodada caiu numa janela nova, o que criou a aparência de transitoriedade.

**Correção (E1e, 2026-09-15 14:56 UTC):** duas conclusões anteriores desta seção estavam erradas e foram desfeitas pelo dado bruto.
1. O `403` **não** foi transiente e **não** dependia do `ref`: é sempre cota do balde `core`.
2. O endpoint `GET /rate_limit` reportou `core 5000/5000` no mesmo minuto em que toda chamada real devolvia `x-ratelimit-limit: 5000`, `x-ratelimit-used: 5000`, `x-ratelimit-remaining: 0`, `x-ratelimit-resource: core`. **Para PAT fine-grained, `/rate_limit` não é fonte confiável** — só os headers da resposta que falhou. O `x-ratelimit-reset` manteve o mesmo valor por ~30 min, confirmando que a janela não havia virado.

Lição de método registrada: com API de terceiro, concluir a partir de header agregado ou de uma única amostra produziu duas conclusões falsas seguidas. O corpo e os headers da resposta que falhou são o único dado que resolveu.

### E1f — instalação ao vivo contra o canônico (2026-09-15, ~15:00 UTC)

Rodado pelo lead, `HOME` temporário, **sem nenhuma credencial git**, token só por `AHC_GITHUB_TOKEN`. `install.sh` da branch (sha idêntico ao do remoto).

| Prova | Resultado |
|---|---|
| **AC-02** — install em HOME limpo | **exit 0**; 52 artefatos (`added:52 updated:0 removed:0`), hook `SessionStart` gravado, `[ahc] done` |
| **AC-11** — config do instalador | modo **600** |
| §5 — nada persistido | `.git/config` do cache com **0** ocorrências de credencial |
| **AC-09** (análogo) — doctor | **9 ✓ · 0 ⚠ · 0 ✗**, exit 0, linha `✓ git auth (…@… reachable via env (AHC_GITHUB_TOKEN))` |
| **AC-05** — modo hook | `sync --quiet` **exit 0**, sem linha de aviso de auth |
| **AC-01** — one-liner pela contents API | **não executado**: cota `core` esgotada (reset 15:04:24 UTC) |

**Achado de UX, não previsto nos AC:** o instalador **lê** `AHC_GITHUB_TOKEN` para autenticar o clone, mas **não o grava** na config (por contrato: `config.token` só por `ahc config token=`). Quem instalar apenas com a variável de ambiente, e sem token embutido disponível, termina com um CLI que instala bem e **falha em toda sessão seguinte** — o hook `SessionStart` passa a imprimir a linha de recusa no contexto do Claude. Em produção o embutido cobre o caso; ele aparece no cenário de recuperação (embutido revogado, dev usando env). Foi observado ao vivo, por acidente, num teste em que o `doctor` rodou sem a variável.

Opção recomendada (não implementada, aguardando decisão do lead): o instalador emite **uma linha** quando autenticou por `env` e não há nem `config.token` nem embutido, dizendo que o token não persiste e como gravá-lo. Alternativa rejeitada: gravar o token do ambiente na config automaticamente — escrever segredo em disco como efeito colateral de uma variável de ambiente é pior que o problema.
