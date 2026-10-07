<!-- Last updated: 2026-09-30 -->
# Architecture Memory

> Owns: stack, topology, NFRs, integrations, trust boundaries, threat models, security controls.
> Regras de produto → [business.md](business.md). Convenções de código → [guidelines.md](guidelines.md).

## Tech stack

| Layer | Choice | Reason |
|-------|--------|--------|
| CLI | Node puro, CommonJS, **zero dependências** (`bin/ahc`, arquivo único) | Instala em qualquer máquina com Node sem `npm install`; sem `package.json` no repo |
| Runtime mínimo | Node v18+ (README); CI usa Node 20 | — |
| Installer | Bash (`install.sh`, `set -euo pipefail`) | Bootstrap em macOS / WSL2 / Git Bash |
| Tooling do repo | `scripts/regen-manifest.js`, `scripts/validate-artifacts.js`, `scripts/make-mirror.js` (Node zero-deps) | Gates determinísticos de CI |
| Diagramas / docs | Python + matplotlib (`docs/**/render*.py`, skills de diagrama); `scripts/build-*.py` | Só geração de artefato visual, fora do caminho de distribuição |
| Testes | `node:test` + `node:assert` | Zero-deps, igual ao CLI |
| CI | GitHub Actions | — |
| Artefatos | Markdown com frontmatter YAML | Formato que o Claude Code lê |

## Topology

1. **Contributor** edita `agents/`, `commands/`, `skills/` ou `autonomous/` e abre PR para `main`.
2. **CI** (`test.yml`): `validate-artifacts.js --quiet` + `node --test test/*.test.js`. (`regen-manifest.yml`): `--check` em PR; no push para `main`, regenera e tenta auto-commit do manifest com `GITHUB_TOKEN` (`contents: write`, mensagem com `[skip ci]`). **O ruleset da org recusa esse push** (`push declined due to repository rule violations`): a `main` está vermelha desde o PR #20 (sha antigo em `skills/session-cost`), corrigido na branch `feat/001-ahc-pat-auth` (`1733caa`, ainda não mergeado). Na prática, o manifest precisa ser regenerado **dentro do PR**.
3. **`ruleset.yml`** reusa `EMS-NCTECH/nctech-pipeline/.github/workflows/rulesets.yml@main` (`secrets: inherit`), diário e no primeiro push.
4. **Máquina do dev:** hook `SessionStart` → `ahc sync --quiet --timeout=5`.
5. **`ahc sync`** (`bin/ahc` `cmdSync`): `gitRefresh` faz `git clone --depth=1` (ou `fetch` + `reset --hard FETCH_HEAD`) de `https://github.com/<repo>.git` para `~/.claude/.ahc-cache/<repo_sanitizado>`; lê o manifest do cache; compara com o lock; copia só o que mudou verificando sha256; poda órfãos; grava o lock; registra presença e roda o janitor de locks.
6. **Claude Code** lê `~/.claude/{agents,commands,skills}` no início da sessão. `~/.claude/autonomous/` é só visibilidade (as rotinas rodam na nuvem).
7. **Espelho `washingtonsarago/agents-hub-claude` (privado, fora da org):** hoje, `make-mirror.js --owner=<login> --apply` manual numa branch derivada + `push --force` (defasado 18 dias em 2026-09-14), para usuários externos que sincronizam com a própria credencial git. Não é canal de distribuição da engenharia.

**Planejado (ADR-0001, demanda 001, não implementado):**
- Install e sync continuam com **origem única no canônico** `EMS-NCTECH/agents-hub-claude`, dentro da org. Nenhuma publicação automática para repo fora da org.
- `gitRefresh`, doctor e `install.sh` passam a autenticar pela cascata env → config → token embutido (PAT de leitura da org) → credencial git, injetada por invocação.
- One-liner da wiki interna via contents API do canônico.
- `make-mirror.js` passa a esvaziar os marcadores do token na cópia manual (`--check` falha se houver valor).

Caminho alternativo: se `cfg.repo` começa com `file://` ou `http`, o `ahc` usa `fetchURL` (HTTP/arquivo) em vez de git — é o modo das fixtures de teste.

## Non-functional requirements

| NFR | Target |
|-----|--------|
| Sync no SessionStart | Não pode bloquear a sessão: offline em `--quiet` sai com exit 0 e mantém o cache local. Hook com `--timeout=5` (`install.sh:52`) |
| Timeout de rede | `FLAGS.timeout` (default 10s) vale só para `fetchURL`; as chamadas `git` do `gitRefresh` rodam **sem timeout** (`execSync` sem `timeout`). Planejado (ADR-0001): `fetch` `max(3×--timeout, 15s)`, `clone` 120s, stall detection |
| Tentativas de auth por sync | Planejado (ADR-0001): 1 no caminho feliz; ≤ 4 (~1,2–2,4s, estimativa) com todas as origens recusadas; erro de rede não avança a cascata |
| `ahc doctor` git auth | `git ls-remote` com timeout de 8s |
| Coordenação de sessões | Nunca bloqueia; guard adiciona ~50–80ms por comando Bash (opt-in) |
| Suíte de testes | ~2s local (README) |
| Latência p99 / disponibilidade / RPO-RTO | _a confirmar_ — não há serviço hospedado; a disponibilidade depende do GitHub (e, planejado, de o PAT da org seguir válido, o que depende da conta do lead; a credencial git dos membros cobre a falta dele) |

## Data stores

Não há banco de dados. Estado em arquivos:

- **Repo:** `manifest.json` (fonte da verdade).
- **Máquina do dev:** `~/.claude/.ahc-config.json` (repo, branch, channel; `token` opcional planejado), `~/.claude/.ahc-lock.json` (instalados + pins + `last_sync`), `~/.claude/.ahc-cache/` (clone raso do hub), `~/.claude/settings.json` (hooks, merge feito pelo installer).
- **Por checkout:** `<gitdir>/ahc-sessions/<pid>.json` (presença/heartbeat da coordenação de sessões).

## External integrations & trust boundaries

| Integration | Direction | Auth | Trust boundary | Threat-model link |
|-------------|-----------|------|----------------|-------------------|
| GitHub `EMS-NCTECH/agents-hub-claude` (git HTTPS; planejado: + contents API no one-liner) | out (clone/fetch/ls-remote) | Hoje: credenciais do git do dev (`gh auth` / credential helper). Planejado (ADR-0001): cascata env → config → token embutido (PAT fine-grained com dono `EMS-NCTECH`, criado pela conta do lead, só este repo, `Contents` + `Metadata` read-only) → credencial git do dev | Máquina do dev ↔ GitHub, dentro dos controles de acesso da org; o conteúdo baixado vira instrução executada pelo Claude Code; planejado: token de leitura da org distribuído no código e na wiki | `docs/todo/001-ahc-pat-auth/task.md` [task.md §7 da demanda 001](../../docs/todo/001-ahc-pat-auth/task.md) — APPROVE WITH MITIGATIONS, 2026-09-15 |
| GitHub `washingtonsarago/agents-hub-claude` (espelho privado, fora da org) | out (manual) | Credencial git de cada colaborador (9 em 2026-09-14). Planejado: a cópia nunca carrega o token da org (marcadores esvaziados pelo `make-mirror`) | Org ↔ conta pessoal, só por ação manual; fora da demanda 001 | — |
| `raw.githubusercontent.com` / HTTP | out | Nenhuma (só `User-Agent: ahc`) | Só para `cfg.repo` `http*`/`file://` | — |
| GitHub Actions `GITHUB_TOKEN` | CI → repo | Token do workflow, `contents: write` só no job `regen`; o push na `main` é recusado pelo ruleset da org | CI ↔ `main` | — |
| Workflow reutilizável `nctech-pipeline` | CI | `secrets: inherit` (recebe **todos** os secrets de repo) | Repo ↔ outro repo da org | — |
| claude.ai routines (agents autônomos) | out | Conta de quem arma a rotina | Nuvem Anthropic ↔ repo | Gate `mode`/`approved_by` |
| Slack (pr-sentinel) | out | Connector da rotina | Nuvem ↔ canal | — |
| Ollama local (`mcp/local-llm`, `.mcp.json`) | localhost `:11434` | Nenhuma | Local | `docs/LLM-LOCAL.md` |

## Security controls

- **Identity provider:** nenhum próprio; identidade é a do GitHub.
- **AuthN / AuthZ model:** hoje, leitura do repo INTERNAL via credencial git do dev. **Desenhado (ADR-0001, ainda não implementado):**
  - Origem única: `EMS-NCTECH/agents-hub-claude`, pelos controles de acesso da org. Rejeitado: espelho pessoal como origem com publicação automática (conteúdo da org sairia da org).
  - Token de leitura: PAT fine-grained (`github_pat_`) com **dono dos recursos = `EMS-NCTECH`**, criado pela conta do lead (membro, admin do repo), só este repo, `Contents` + `Metadata` read-only. Sem conta de serviço.
  - Fixo no código: marcadores `AHC-EMBEDDED-TOKEN` em `bin/ahc` e `install.sh` (literal único, travado por teste), com o valor gravado pelo orquestrador a partir de arquivo local, nunca por agentes. Distribuído também pelo one-liner da wiki interna. Vazamento aceito.
  - Cascata env `AHC_GITHUB_TOKEN` → `token` da config → embutido → credencial git do dev.
  - Credencial injetada por invocação via `GIT_CONFIG_COUNT` (header `Authorization: Basic` + reset de `credential.helper`), nada em URL, argv ou disco.
  - Avança em 401/403 (inclui "Write access to repository not granted") e em 404 nas rodadas de token; para em erro de rede.
  - Git sempre não interativo; exige git >= 2.31.
- **Integridade:** sha256 por item e por arquivo de skill, verificado no sync e no validator.
- **Origem:** `test/origin.test.js` (CI) + `.githooks/pre-push` (local, opt-in via `git config core.hooksPath .githooks`). O transform do espelho remove os dois.
- **Secrets management:** nenhum segredo no repo até 2026-09-15. No GitHub, o hub é `internal`, o espelho `washingtonsarago/agents-hub-claude` é `private`, e secret scanning + push protection estão **desligados** (verificado via API em 2026-09-14). `ahc doctor` exige `chmod 600` em `.ahc-config.json` quando há campo `token` (`bin/ahc:509-521`). Planejado (ADR-0001): um único segredo, o PAT de leitura da org, como literal nos marcadores do canônico; o `make-mirror` esvazia os marcadores para o token nunca sair da org; sem push token, sem Environment e sem secret de Actions.
- **Agents autônomos:** default read-only; escrita exige `approved_by`.
- **Encryption in transit:** HTTPS para GitHub. At rest: n/a.
- **OWASP Top 10 posture:** _a confirmar_ — sem auditoria registrada.

**Lacunas conhecidas relevantes para o PAT** (evidência, não veredito — validar no threat model):
- `AHC_GITHUB_TOKEN` e `cfg.token` só aparecem no `ahc doctor` (hint e check de permissão); nenhum dos dois é usado por `gitRefresh` nem pelo `install.sh`. → **Planejado por ADR-0001** (cascata no `gitRefresh`, no doctor e no `install.sh`), não corrigido.
- O desenho do ROADMAP §1 põe o token na URL (`https://x-access-token:<token>@github.com/...`). Com `git clone`, essa URL fica gravada em `.git/config` do cache e aparece na lista de processos. → **Descartado por ADR-0001**: header via `GIT_CONFIG_COUNT` por invocação, `fetch` pela URL explícita. Ainda não implementado; ROADMAP §1 ainda descreve o desenho antigo.
- `ahc config k=v` grava via `writeJSON` sem `chmod`, então um `ahc config token=...` criaria o arquivo com a umask padrão; e faz `split('=')`, truncando valores com `=`. → **Planejado por ADR-0001 / demanda 001** (corte no primeiro `=`, escrita atômica com modo 600 pelo `ahc` e pelo instalador), não corrigido.
- `gitRefresh` e o check de git auth montam comando shell por interpolação de string com `cfg.repo`/`cfg.branch` (`execSync`), não `execFileSync`. → **Planejado por ADR-0001** (`execFileSync` + `env` + validação de slug/branch nos caminhos tocados), não corrigido. Resíduo fora do escopo: `lockHeldByLiveProcess` e `coordGitDir` seguem com `execSync`, sem interpolar config.
- As chamadas git do `gitRefresh` não têm timeout. → **Planejado por ADR-0001**, não corrigido.
- O `make-mirror.js` copiaria qualquer valor presente nos marcadores para fora da org. → **Planejado por ADR-0001** (esvaziar os marcadores e falhar no `--check`), não corrigido. O espelho segue manual e defasado (18 dias em 2026-09-14), fora da demanda 001.
- O ruleset da org recusa o auto-commit do `regen-manifest.yml` na `main`, que fica vermelha quando um PR entra com manifest desatualizado. → Mitigado regenerando o manifest dentro do PR; o workflow não muda na demanda 001.
- Secrets de repo do canônico chegam a workflows de PR de branches do próprio repo e ao `nctech-pipeline` via `secrets: inherit` (`ruleset.yml`). Não afeta a demanda 001, que não usa secrets de Actions.
- Memória: `guidelines.md` foi alinhado em 2026-09-15 ("Embutir token em `install.sh`" superado para o token da org). Em `business.md`, "Origem única" e "Acesso via PAT" já refletem o desenho dentro da org, mas o log de decisões ainda traz a entrada de 2026-09-14 sobre o espelho como canal único, superada pela de 2026-09-15. Pendente de limpeza pelo `project-memory-keeper`.

- **Roteamento de agents como comportamento testado (ADR-0002, demanda 004, 2026-09-30, Accepted).** Eval de roteamento versionado em `scripts/routing-eval/`, rodável com um comando, com evalset pinado (`clear` e `boundary` por agent novo). Parte determinística na CI (valida campos do evalset, cobertura por agent); parte com modelo, fora da CI, rodada sob demanda com comando documentado. Eval é instrumento da métrica GOAL: sem ele, a mudança não é reproduzível. Custo só reportado se medido do stream do `claude -p`.

- **Compatibilidade legada: config novo vence, opt-out mais restritivo vence (demanda 004, rename emstech-reviewer → change-reviewer, 2026-09-30).** Rename do agent e skill para `change-reviewer`; compatibilidade com `.emstech-reviewer.json`, bloco cercado legado no `CLAUDE.md`, diretório de estado `~/.claude/.emstech-reviewer/`, variáveis `EMSTECH_TELEMETRY*`. Config novo (`.change-reviewer.json`) vence se ambos existem. Telemetria continua desativada se `EMSTECH_TELEMETRY=off` no ambiente. Legacy files permanecem aceitos enquanto o ahc não poda; nota de migração no README instrui `ahc unpin` para quem pinou. Implementado via compat layer em `skills/change-reviewer/scripts/lib/{telemetry,profile}.js`; test coverage em `test/flow-lite-*.test.js`.

- **Skill inerte `flow-playbook` (ADR-0003, demanda 006, 2026-09-30, Accepted).** Distribui protocolo de peer (9.165 B, byte a byte, hash pinado) e playbook da faixa trivial (≤3.500 B) lidos sob demanda pelo `/flow`. Não é comando novo, não aparece em listagens (flags `disable-model-invocation: true`, `user-invocable: false`). Exceção aprovada pelo lead à regra ROADMAP 8.1: é veículo de distribuição puro, não capacidade nova. Falha de leitura → fail-closed: faixa padrão ou peer silenciado. Teste de integridade sha256 em `test/flow-pretriagem.test.js:507`.

- **`/code-review` fail-closed: INCOMPLETE com recálculo, concordância de BLOCKER de segurança (demanda 006, 2026-09-30).** Revisão com revisor faltante (timeout, saída fora de formato, ausência) não aprova. BLOCKER/WARNING passam por verificação adversarial (re-despacho para contestar) antes do relatório; asserção de APPROVED requer todos os revisores verdes. Teto de 6 revisores mantido; lente de UX mobile (C6) ocupa a vaga do revisor único na faixa trivial, não soma. Implementado em `commands/code-review.md` Phase 5 (§1 "verdict"), linha fail-closed ("nenhum revisor faltando"). Test coverage em `test/flow-pretriagem.test.js` (AC-14 da 006).

- **Maestro CLI recomendado pelo `mobile-qa-analyst` (demanda 007) — risco residual aceito pelo lead em 2026-09-30.** O agent só recomenda `brew install mobile-dev-inc/tap/maestro` (a forma curta `brew install maestro` instala outro produto) ou o zip do GitHub Release com versão pinada e `checksums_sha256.txt` conferido antes de extrair; nunca pipe para shell, nunca `releases/latest`; `MAESTRO_CLI_NO_ANALYTICS=true` em todo `maestro test`; nada no Maestro Cloud sem pedido. **Residual (S-03):** o checksum vem da mesma origem do binário e o release não tem attestation (`gh api .../attestations` → 404 em 2026-09-30) — adulteração no release não é detectável. Controles SC-01…SC-13 pinados em `test/mobile-qa-analyst.test.js`.

## Threat models

- **Demanda 001 — PAT da org e cascata de credenciais do `ahc` (2026-09-15):** STRIDE, controles obrigatórios C1–C14 e compensatórios opcionais em [`docs/todo/001-ahc-pat-auth/task.md` §7](../../docs/todo/001-ahc-pat-auth/task.md). Verificado com git 2.50.1:
  - `http.extraHeader` genérico perde para um `http.<url>.extraheader` do dev;
  - o header segue um `insteadOf` para outro host;
  - o header é reenviado ao host de destino de um redirect (default `initial`);
  - `GIT_DIR` herdado vence `git -C`.

  Idioma exigido: `http.<url>.extraHeader` + `http.<url>.followRedirects=false`, com a URL completa. Veredito de design: APPROVE WITH MITIGATIONS.

## Decisions log (architecture)

ADRs em `docs/adr/`:
- [ADR-0001](../../docs/adr/0001-cascata-de-credenciais-do-ahc.md) — Acesso ao hub dentro da org: origem única no canônico, PAT de leitura com dono `EMS-NCTECH` embutido nos marcadores `AHC-EMBEDDED-TOKEN`, cascata de credenciais (env → config → embutido → credencial git) e injeção por invocação via `GIT_CONFIG_COUNT`. Rejeita o espelho pessoal como origem com publicação automática. **Proposed**, 2026-09-14, revisado em 2026-09-15, demanda 001.
- [ADR-0002](../../docs/adr/0002-roteamento-agents-comportamento-testado.md) — Roteamento de agents como comportamento testado: eval versionado em `scripts/routing-eval/`, rodável com comando, com evalset que cobre `clear` + `boundary` por agent novo. Métrica GOAL medida fora da CI. Parte determinística (valida evalset) na CI, garante cobertura antes do merge. **Accepted**, 2026-09-29, demanda 004.
- [ADR-0003](../../docs/adr/0003-skill-inerte-texto-condicional.md) — Texto condicional de command vive em skill inerte lida sob demanda: `flow-playbook` distribui protocolo de peer e playbook da faixa trivial sem aumentar custo fixo de `/flow`. Exceção aprovada à regra ROADMAP 8.1. **Accepted**, 2026-09-30, demanda 006.

Decisões estruturais anteriores, registradas em commits e no ROADMAP:
- Sync via `git clone --depth=1` em vez de raw HTTP, porque o repo é INTERNAL — README §Instalação
- Poda de órfãos no sync, restrita ao que o `ahc` instalou — commit `fix(sync): remover do disco o que saiu do manifest`
- Coordenação de sessões: "nada nunca bloqueia"; estado por worktree — commit `feat(coord)`
- Espelho externo gerado por script, não mantido à mão — commit `feat(mirror)`
- Medição de custo distribuída como skill `session-cost` (OTEL ou transcript) — ROADMAP §8.6
- **Phase 0.5 TRIAGE (pré-triagem de clareza do prompt) — demanda 003, 2026-09-17.** Veredito: APPROVE WITH MITIGATIONS (M1–M3, todos de texto). Constatação estrutural: **a nota da Phase 0.5 é ortogonal aos gates de segurança.** A Phase 2.5 dispara pelas caixas de superfície sensível marcadas no PLAN, independente da nota; o `security-specialist` da Phase 4 roda `Then, always`; nenhum caminho faz uma demanda sensível perder gate por ter sido bem escrita. Mitigações:
  - **M1:** Medição de performance não invoca instalador — invocação não-mutante (`bin/ahc --version`, `node --test`) ou `HOME` descartável (exemplo `test/helpers.js`), ou budget em prosa.
  - **M2:** AC derivado de controle de Phase 2.5 e AC de caso negativo/abuso não são agrupáveis; não contam contra teto de 10 AC.
  - **M3:** AC verificado por inspeção (em vez de Gherkin) continua preso ao exit gate da Phase 4 — inspeção substitui prosa, nunca o teste automatizado.
