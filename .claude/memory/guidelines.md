<!-- Last updated: 2026-09-30 -->
# Guidelines Memory

> Owns: code conventions, lessons learned, anti-patterns, agent tone.
> Regras de produto → [business.md](business.md). Stack e segurança → [architecture.md](architecture.md).

## Conventions actually in use

| Topic | Convention | Where to see it |
|-------|------------|-----------------|
| Dependências | Zero deps em todo JS (CLI, scripts, testes). Só módulos nativos do Node, `require` CommonJS | `bin/ahc:6-12`, `scripts/*.js`, `test/helpers.js` |
| Layering do CLI | Arquivo único; um `cmdX()` por subcomando; helpers pequenos (`loadConfig`, `loadLock`, `readJSON`, `writeJSON`) no topo | `bin/ahc` |
| Config | `DEFAULT_CONFIG` mesclado com `~/.claude/.ahc-config.json` (`{...DEFAULT_CONFIG, ...arquivo}`) | `bin/ahc:33-57` |
| Error handling | Hook nunca derruba a sessão: `--quiet` sai 0 quando offline; efeitos colaterais opcionais em `try {} catch {}` ("nada aqui pode quebrar o sync"). Erro de git reembrulhado com contexto (`git fetch failed for <repo>@<branch>`) | `bin/ahc:103-119`, `bin/ahc:243-246`, `bin/ahc:268-287` |
| Saída | `log()` respeita `--quiet`; `err()` sempre vai para stderr; mensagem prefixada com `[ahc]`. Aviso que precisa chegar ao contexto da sessão usa `console.log` de propósito | `bin/ahc:46-47`, `bin/ahc:268-273` |
| Exit codes | `doctor`: 0 = verde ou só ⚠, 1 = algum ✗. Uso inválido: 2 | `bin/ahc:611`, `bin/ahc:627` |
| Diagnóstico | Checks do `doctor` com `pass/warn/fail(label, detail, hint)`; todo ✗/⚠ traz a hint com o comando de correção | `bin/ahc:461-612` |
| Validation | Invariantes de artefato no `validate-artifacts.js` (frontmatter, nome = arquivo, sha, órfãos); regras de `autonomous` também lá; regra `model × tier` desde demanda 004: `reasoning` → `{opus,sonnet}`, `speed` → `{sonnet,haiku}` | `scripts/validate-artifacts.js:52-55` |
| Tests | Integração com `node:test`: spawna o CLI real (`runAhc`) com `HOME` temporário apontando para a fixture `file://` em `test/fixtures/remote`. Um `*.test.js` por feature. Cabeçalho do arquivo explica o que isola | `test/helpers.js`, `test/doctor.test.js:1-4` |
| Comentários | Explicam o **porquê**, frequentemente com o incidente que motivou (em PT-BR no código recente) | `bin/ahc:288-298`, `scripts/make-mirror.js:1-30` |
| Manifest | Mudou artefato → `node scripts/regen-manifest.js` (bump patch default; `--bump=minor|major`). CI falha com drift | README §Adicionando |
| Commits | Conventional Commits com escopo e assunto em PT-BR (`feat(flow): ...`, `fix(sync): ...`, `chore(pr-review): ...`) | `git log` |
| Branches | `feat/<nome>`, `fix/<nome>`, `revert/<nome>`, `docs/<nome>`; merge via PR | `git log` |
| Agent novo | Exige ≥ 1 caso `clear` e ≥ 1 `boundary` no evalset de `scripts/routing-eval/evalset.json` antes do merge. Rodar `node scripts/routing-eval/run.js --rounds 2 --model opus` antes do PR é obrigatório (custo real). CI falha se agent não tem cobertura. (demanda 004, 2026-09-30) | `scripts/routing-eval/lib/evalset.js:52-58`, `test/routing-eval.test.js:48` |
| `model × tier` | `tier: reasoning` → `model ∈ {opus, sonnet}`; `tier: speed` → `model ∈ {sonnet, haiku}`. Proibido: `haiku`+`reasoning`, `opus`+`speed`. Validator rejeita com erro. | `scripts/validate-artifacts.js:52-55` (demanda 004) |
| Rename com compat | Rename de agent/skill distribuído com compat legada em dois planos: (a) config novo vence (ex.: `.change-reviewer.json` > `.emstech-reviewer.json`), opt-out mais restritivo vence (ex.: `EMSTECH_TELEMETRY=off` continua valendo), (b) literais legados numa compat layer única por domínio (ex.: `skills/change-reviewer/scripts/lib/{telemetry,profile}.js`). Documento de migração no README/USAGE com instrução `ahc unpin`. (demanda 004, 2026-09-30) | `skills/change-reviewer/scripts/lib/`, `test/flow-lite-*.test.js` |
| Testes pinam linha | Quando um teste valida um literal de um command/agent (ex.: "PROVA DE RED" em `flow.md`), pinando o hash ou a linha, afrouxar o teste para acomodar a mudança **sem justificativa no diff** é BLOCKER de `commands/code-review.md:164`. Se o acréscimo é puramente aditivo e justificado, o teste atualiza; se é reescrita, precisa de aprovação. (demanda 006, 2026-09-30) | `test/flow-pretriagem.test.js:337-346` (PHASE4_SHA256) |
| Prova de RED | Evidência verificável em todas as faixas do `/flow`, para cada AC: ref sem a mudança + comando exato + trecho da saída vermelha que nomeia o teste (única forma aceita — commit de teste antes do fix some no squash merge, D3 da 006). Falha sem a mudança afirmada sem evidência não conta. Registrado na §8 do `task.md` com tabela de traceability (AC, arquivo do teste/flow, status, prova). Flow NÃO EXECUTADO não é PROVA DE RED. (demanda 006, 2026-09-30) | `commands/flow.md` Phase 4 (§2 "VERIFY gate"), `docs/done/006-flow-melhorias/task.md` (D3) |

### Idioma (README §Convenções de redação)

- Instruções para o modelo (corpo de agent/command) → **inglês**.
- Output que o usuário lê, exemplos no `description`, templates de relatório → **PT-BR**.
- Docs do hub (`README.md`, `docs/`) → **PT-BR**. Jargão técnico (BLOCKER, OWASP, ADR, sync) fica em inglês.

### Frontmatter de agent

Obrigatórios: `name` (kebab-case = nome do arquivo), `description` (string JSON-escapada com 3–5 exemplos), `model` (`opus|sonnet|haiku`), `color`. Recomendados: `tier` (`reasoning|speed`), `team` (um só bucket). Validator deve ficar com **0 errors, 0 warnings**.

## Engineering fundamentals

- **KISS / YAGNI:** CLI de arquivo único e zero-deps; features novas entram como subcomando, não como framework.
- **Fail-soft em hook, fail-closed em gate:** o que roda no SessionStart degrada para "sem feature"; o que é gate de CI ou de segurança (`doctor` com token exposto, `approved_by`) falha.
- **Derivar em vez de manter à mão:** manifest e espelho são gerados por script e checados em CI.
- **Testar o que o dev experimenta:** integração contra o binário real, não mocks de função.

## Anti-patterns banned in this repo

- Criar command/skill com nome de slash command nativo (`/goal` foi revertido por isso).
- Editar o espelho externo à mão ou fazer substituição literal do nome da org em prosa.
- ~~Embutir token em `install.sh`.~~ **Superado pelo [ADR-0001](../../docs/adr/0001-cascata-de-credenciais-do-ahc.md) (2026-09-15) para o token de leitura com escopo da org:** PAT fine-grained com dono `EMS-NCTECH`, só leitura e só `EMS-NCTECH/agents-hub-claude`, nos marcadores `AHC-EMBEDDED-TOKEN` de `install.sh` e `bin/ahc`, com o valor gravado pelo orquestrador, nunca por agentes. Continua proibido embutir qualquer outro token (com escrita, de outro repo ou de conta pessoal) ou colocar token fora desses marcadores.
- Push do hub para fork pessoal (bloqueado por `pre-push`).
- Agendar agent autônomo fora do hub (`/schedule` direto) — não é versionado nem auditável.
- Hook de SessionStart que bloqueia ou falha a sessão.
- Reportar custo estimado/derivado em vez do número medido.
- Consultar peer session para contornar permissão negada nesta sessão.
- **Encodar o diff de um PR como teste permanente.** Especificamente: predicados sobre `git diff` contra `origin/main` em `*.test.js`. Três consequências reproduzidas empiricamente (demanda 003):
  - Teste fica **vermelho no instante do merge**: pós-merge `origin/main` contém a mudança, diff contra si mesmo é vazio, asserção falha sem nada ter regredido.
  - Teste quebra na CI já no PR: `actions/checkout@v4` sem `fetch-depth` não materializa `refs/remotes/origin/main`, causando erro de git.
  - Repo congelado: allowlist de arquivos tocados virou restrição permanente — reproduzido contra `feat/002-flutter-dart-engineer` em voo, que quebrava a suíte ao mergear depois.
  - **Regra:** invariante de artefato (propriedade do conteúdo: "bloco Phase 4 intacto", "linha de Inputs puramente aditiva") vai para `*.test.js` com literais pinados; escopo de demanda (lista de arquivos tocados, "nenhum artefato novo", nota da pré-triagem gravada no `task.md`) é evidência de PR e vive na §8 do `task.md` como comando de uma vez só.
- **Instrução de medição de performance que nomeia um instalador entre os alvos.** Modo de falha: `install.sh` e `ahc sync` escrevem em `~/.claude` real; medição sob verdadeira HOME contamina o dev. **Idioma correto:** invocação não-mutante (`bin/ahc --version`, `node --test`), ou medir sob `HOME` descartável (exemplo: `test/helpers.js`), ou declarar budget em vez de medir. Instaladores e sincronizadores **nunca** entram em `wc` ou `time` de medição — apenas em orçamentos escritos em prosa.

## Phase fractionation convention

Fase fracionária (`X.5`) é etapa intersticial entre duas numeradas que não renumera a cadeia. Ex.: Phase 0.5 TRIAGE entre GOAL e DEFINE.

**Responsabilidades de quem acrescenta uma:** obrigado a atualizar **toda** a enumeração canônica — a linha de abertura de `commands/flow.md`, o cheat sheet de `docs/FLOWS.md` e `docs/flows/render.py` (gerador de PNG/HTML/PDF). **Terceira fracionária acrescentada dispara reavaliação da numeração inteira** — e o ADR devido nesse momento é sobre a convenção (quando renumerar, quantas fracionárias cabem), não sobre a fase que a disparou.

Registrado porque: demanda 003 introduziu Phase 0.5; ADR-0001 falava de Phase 2.5; sem enumeração inteira estabelecida (quais 7 eixos, ordem), a terceira fracionária vai criar conflito. O contrato é documento vivo — registre quando adicionar.

## Specification rigor calibrated by prompt clarity

A clareza do pedido — não a complexidade, criticidade nem risco do trabalho — calibra o **número** de AC que a demanda deve ter. Pedido maduro e sem ambiguidade gera ≤ 10 AC; pedido vago continua rodando com o número que o DEFINE decide (sem teto).

**Onde vive:** fase Phase 0.5 TRIAGE (`commands/flow.md`, §Phase 0.5); nota gravada em `task.md` §0 (protocolo entre fases); ramificação aplicada na Phase 1 (DEFINE) e Phase 2 (PLAN). **Lição barata:** calibração reduz AC **em quantidade**, nunca em rigor de prova — cada AC sobrevivente é verificado com mesmo rigor que antes. O exit gate da Phase 4 não muda.

## Triage protocol — pré-triagem recording

O campo de pré-triagem na §0 do `task.md` é **protocolo entre fases**, não prosa: lido pelos `Inputs:` da Phase 1, aplicado na ramificação de PLAN. Schema esperado: `NOTA <n>/10 — <acima|abaixo> do corte (> 6)`, seguido de **uma linha por eixo** (A1–A4) com número e citação de artefato.

**Divergência já observada com n=1:** TEMPLATE prescreve `- A1 Deliverable <n>:` e §0 desta demanda gravou `- **A1 Deliverable 6:**` (com **bold**). Não existe validador de schema — o `validate-artifacts.js` não olha `docs/todo/`. A métrica GOAL (`grep` sobre `docs/todo/*/task.md`) falha silenciosamente se formato mudar. **O literal do TEMPLATE é a fonte; quem gravar diferente quebra a observabilidade da métrica.**

## Vulnerability classes already remediated

| Class | When | Remediation idiom | Anti-pattern to avoid |
|-------|------|-------------------|-----------------------|
| _Nenhuma registrada até 2026-09-14_ | | | |

## Agent tone

Direto, técnico, opinativo. Citar arquivo e linha. Responder ao usuário em PT-BR.
