<!-- Last updated: 2026-05-02 -->
# Roadmap — agents-hub-claude

Documento de iniciativas futuras pro hub. Origem: discussões entre Washington (lead) e Claude entre 2026-04 e 2026-05. Cada item tem **problema → solução → esforço → riscos → dependências → decisões pendentes**.

> Convenção de prioridade: as iniciativas estão agrupadas por tema. Dentro de cada tema, ordem **de atacar primeiro** é a que aparece primeiro. Itens marcados **[próximo]** são os candidatos mais maduros pro próximo sprint.

---

## Estado atual (snapshot de 2026-05-02)

- **18 agents + 14 commands + 4 skills**, distribuídos via `ahc sync` no `SessionStart` hook do Claude Code
- CLI `ahc` zero-deps + manifest com sha256 por arquivo
- 2 GitHub Actions: `regen-manifest` (CI gate) e `test.yml` (validator + 33 testes)
- `scripts/regen-manifest.js` + `scripts/validate-artifacts.js`
- Convenções documentadas no README: idioma, frontmatter, memória trio
- `tier:` metadata em todos os 18 agents (dívida zerada)
- `team:` metadata em todos os 18 agents (Fase 1 do item 6 entregue) — agrupamento e filtro `--team` no `ahc list`
- Sweep PT-BR concluído nos commands antigos (dívida zerada)
- Diagrama de arquitetura em `docs/architecture/agents-hub-claude.png`
- Validator: **0 errors, 0 warnings**

---

## 1. Distribuição interna sem GitHub access  **[próximo]**

**Problema.** Hoje o `ahc` exige `gh auth login` + acesso à org EMS-NCTECH. Devs sem GitHub access (contractors, parceiros, ambientes restritos, devs novos sem onboard completo) não conseguem instalar.

**Decisão tomada.** Não vamos:
- Tornar o repo público (descartado por política interna)
- Espelhar pra git interno (descartado: empresa não tem GitLab/Bitbucket)
- Colocar token embutido em `install.sh` (descartado: vaza)

**Decisão tomada — ataque com PAT de service account em secret store interno.**

### Setup

1. **Service account no GitHub:** `ems-nctech-hub-reader` com 2FA, adicionado à org com acesso **só** ao `agents-hub-claude`.
2. **Fine-grained PAT** nesse usuário:
   - Scope: único repo `EMS-NCTECH/agents-hub-claude`
   - Permissions: **`Contents: Read`** + **`Metadata: Read`** (nada mais)
   - Expiration: **90 dias**
3. **Secret store interno** (1Password / AWS Secrets Manager / Doppler — *a definir, ver pendência abaixo*) guarda o PAT. Devs pegam dali.

### Mudanças no código

**`bin/ahc`:**
```js
function gitURL(cfg) {
  const token = process.env.AHC_GITHUB_TOKEN || cfg.token;
  if (token) {
    return `https://x-access-token:${token}@github.com/${cfg.repo}.git`;
  }
  return `https://github.com/${cfg.repo}.git`; // fallback: gh auth
}
```
Precedência: `AHC_GITHUB_TOKEN` (env) > `cfg.token` (config) > git credentials.
Sanitizar URL nos logs (não vazar token em `stderr`).

**`~/.claude/.ahc-config.json`:** ganha campo `token`. Permissão `chmod 600`.

**`install.sh`:** dois fluxos:
- *Modo "tem gh auth":* comportamento atual.
- *Modo "sem gh auth, com token":* detecta `AHC_GITHUB_TOKEN` no env OU prompta o token. Salva em config com `chmod 600`. **Nunca loga o token.**

### Operação

- **Rotação trimestral** automática (calendário + GitHub Action que avisa 7 dias antes da expiração). Novo PAT publicado no secret store. Devs com token expirado pegam o novo.
- **Audit:** GitHub Audit Log mostra acessos pelo bot. Picos suspeitos → revogar.
- **Kill switch:** revogar PAT via API ou UI em segundos. Pre-acordado: suspeita → revoga primeiro, investiga depois.
- **Wiki interna curta:** "se `ahc sync` retornar 401, pegue novo token no vault X, rode `ahc config token=<novo>`".

### Riscos aceitos

- Token vazado dá leitura do repo até rotação. Mitigado por scope mínimo + 90 dias.
- Atribuição perdida (todos clonam como o bot). Mitigado por audit log no acesso ao secret store.
- Off-boarding: revogar acesso ao vault ≠ revogar token. Por isso rotação trimestral é o que de fato protege.

### Esforço

- ~1 dia de código (`ahc` + `install.sh` + sanitização)
- ~0.5 dia de teste de integração novo (`test/sync.test.js`: cenário com `cfg.token`)
- ~1 dia de setup de secret store + criação do bot user + primeira rotação documentada

### Decisões pendentes

- [ ] **Qual secret store** usar pra distribuir o PAT? (1Password / AWS SM / Doppler / Vault / outro)
- [ ] **Owner da conta bot** no GitHub (admin da org precisa criar)
- [ ] **Cadência de rotação** confirmada — proposta: 90 dias (sincronizado com expiração natural do PAT fine-grained)

---

## 2. Agents autônomos  **[próximo, fase A]**

**Problema.** Hoje todo agent é invocado por humano. A capacidade de "agents que agem sozinhos" multiplica leverage — especialmente em PR review, dependency triage, postmortem facilitation, drift detection. Sem isso, o hub é um arsenal **passivo**.

### 3 fases possíveis (atacar em ordem)

#### Fase A — Light: scheduled jobs reusando commands existentes

Empacotar commands existentes em **cron via skill `schedule`** ou **GitHub Actions agendadas**:
- Toda segunda 9h: `/tech-debt` na main → posta resumo no canal interno (Slack/Teams) ou abre issue no repo
- Toda sexta: `/discovery` agregador de feedback do quarter
- Mensal: `memory drift detector` (ver item 4) → abre PR com sugestão de ADR

**Esforço:** ~1 dia. Reusa tudo. Risco zero (output só comenta, humano aprova).

#### Fase B — Medium: agents em GitHub Actions reagindo a eventos do repo

Workflows que disparam em `pull_request`, `push`, `issues`:

| Workflow | Trigger | Ação | Esforço |
|---|---|---|---|
| **PR security sentinel** | `pull_request` | Roda `security-specialist` no diff, comenta achados, bloqueia merge se BLOCKER | ~3 dias |
| **Renovate/Dependabot bouncer** | `pull_request` (autor: renovate/dependabot) | Audita CVE delta + breaking changes, comenta verdict | ~2 dias |
| **Issue triager** | `issues.opened` (label: bug) | Roda Phase 1-3 do `/bug-flow` (triage + RCA + severity), edita issue com hipóteses | ~2 dias |
| **Memory janitor** | `push` para main | Escaneia diff, atualiza `architecture.md` se cruzou trust boundary, commita auto | ~3 dias |

**Pré-requisito:** Anthropic API key em repo secret + budget definido por workflow.
**Backstop natural:** humano sempre vê output antes de mergear/aceitar.

#### Fase C — Heavy: nova categoria `autonomous/` no hub

Quarta categoria no manifest, ao lado de `agents/`/`commands/`/`skills/`. Cada autonomous agent declara:
```yaml
name: pr-security-sentinel
trigger: { type: github-event, on: pull_request }
permissions: [read-repo, comment-pr]
budget: { tokens_per_run: 50000, max_runs_per_day: 100 }
```
`ahc` distribui esses scripts pro repo. CI roda. Dashboard de execuções fica em `~/.claude/.ahc-runs/`.

**Esforço:** ~2 semanas. Construir runtime de agents autônomos do zero.
**Riscos reais:** custo de token explode em escala, decisões erradas tomadas sem humano. Precisa orçamento, kill switch, audit log.
**Quando vale:** só quando tivermos ~3-4 workflows de Fase B funcionando — aí o padrão emerge e justifica formalizar.

### Princípios

Bons agents autônomos são os que **falham silenciosamente sem prejuízo** (comentam num PR, não bloqueiam) ou **falham loudly mas reversivelmente** (abrem PR de sugestão, ninguém mergeia). Os perigosos são os que tomam ação irreversível (commit em main, mensagem em prod, deletar coisa).

### Recomendação

- **Atacar Fase A** primeiro (1 dia, ROI imediato, risco zero).
- Em paralelo, fazer **uma piloto da Fase B** — sugestão: **PR security sentinel** primeiro (ROI alto, output só comenta, testa o modelo de "API key + Action + budget" sem committment grande).
- **Fase C só** depois de 3-4 workflows de B funcionando.

### Decisões pendentes

- [ ] Qual canal pra reports da Fase A? (Slack #ems-engineering / Teams / issue automática no repo)
- [ ] Budget mensal de tokens da Anthropic API alocado pra automação
- [ ] Quem aprova/revoga API key

---

## 3. CLI quality-of-life

### 3.1 `ahc doctor`  **[próximo]**

**Problema.** Devs com hook desatualizado / PATH errado / lock corrompido / token expirado ficam sem feedback. Suporte vira pingue-pongue de WhatsApp.

**Solução.** Comando de diagnóstico com exit codes semânticos:
```bash
ahc doctor
✓ ahc in PATH: ~/.local/bin/ahc
✓ SessionStart hook configured
✗ git auth: permission denied
  → Run `gh auth login` or set AHC_GITHUB_TOKEN
✓ lock file valid (last sync: 2 hours ago)
⚠ ahc v1.2.0 → v2.0.0 available
  → Run bash <(curl ...) install.sh
```

**Checks:**
- `~/.local/bin/ahc` no PATH
- `~/.claude/settings.json` tem hook `SessionStart` válido
- `git ls-remote` (ou call à raw API se token configurado) com timeout
- `~/.claude/.ahc-lock.json` parseável + não vazio
- Versão local do `ahc` vs versão remota (sugere self-update)
- Permissão de `~/.claude/.ahc-config.json` é `0600` (alerta se token está em arquivo world-readable)

**Esforço:** ~12h (8h código + 4h teste). Test em `test/doctor.test.js` cobrindo cada check com mocks.

**Dependências:** nenhuma.

### 3.2 `ahc remove <nome>`

**Problema.** Não tem como desinstalar individual. Hoje o jeito é editar `~/.claude/.ahc-lock.json` na mão e deletar arquivo.

**Solução.** Comando que remove arquivo local + entrada do lock + adiciona ao `.ahc-skiplist.json` (pra `sync` não reinstalar). Suporta agents, commands, skills.

**Esforço:** ~4h.

### 3.3 `ahc rollback <nome>`

**Problema.** Hoje rollback é `ahc pin <nome>@<versao-antiga>` + `ahc sync --force`. Confuso.

**Solução.** Açúcar sintático: `ahc rollback feature-flow` volta pra versão imediatamente anterior (lê `~/.claude/.ahc-history.json` que o `sync` mantém).

**Esforço:** ~6h (incluindo manter history).

### 3.4 Self-update do `ahc` via `ahc upgrade`

**Problema.** Hoje pra atualizar o CLI é re-rodar `install.sh`. Quando mudamos schema (ex: adição de `skills/`), devs com `ahc` antigo só percebem porque "perderam feature".

**Solução.** Comando `ahc upgrade` que baixa o `bin/ahc` mais recente do repo, compara sha256, substitui o binário local. Se manifest declarar `min_ahc_version`, o sync atual avisa quando dev está abaixo.

**Esforço:** ~6h.

---

## 4. Memory loop closure  **[próximo, item 4.1]**

### 4.1 Memory drift detector

**Problema.** O trio `.claude/memory/{business,architecture,guidelines}.md` é populado via `project-memory-keeper` mas nada verifica se ele permanece vivo. Você adiciona uma integração com Stripe em abril, ninguém atualiza `architecture.md`, e em outubro o agent que lê memória mente sobre o que existe no sistema.

**Solução.** Job no CI que:
1. Scaneia novos `feat:` / `BREAKING:` commits do quarter
2. Compara com `.claude/memory/architecture.md`
3. Abre issue automática: *"você adicionou integração com Stripe em abril mas `architecture.md` não menciona — escreva ADR ou atualize o trio"*

Reuso natural com Fase B do item 2 (autonomous agents).

**Esforço:** ~2 dias.

### 4.2 Auto-ADR seeding do git log

**Problema.** Decisões arquiteturais implícitas dos últimos 12 meses nunca viraram ADR. Quem chega novo não tem como saber por que escolheu Postgres vs Mongo, REST vs gRPC, EventBridge vs SQS.

**Solução.** Script que escaneia `feat:` e `BREAKING:` commits dos últimos N meses, agrupa por área (auth, db, integrações, etc.), propõe ADRs (uma por decisão arquitetural detectada). Dev revisa e aceita.

**Esforço:** ~1 dia. Atacar como rodada única — backfill histórico — não recurring.

### 4.3 `/teach <arquivo>` — explainer de código

**Problema.** Onboarding de novo dev exige pair-programming inicial. Documentação trivial fica obsoleta.

**Solução.** Command que recebe um arquivo, monta walkthrough Khan-Academy-style: o que cada bloco faz, qual padrão do projeto está aplicando, qual decisão arquitetural ele encarna (puxando da memória trio), qual o "why" de cada `if`. Substitui pair-programming inicial.

**Esforço:** ~1 dia.

---

## 5. Quality / testing

### 5.1 Prompt regression suite  **[interesse alto, sem precedente na indústria]**

**Problema.** Qualquer edit num prompt de agent é salto de fé. Não temos como saber se mudar o `system-architect` quebrou a forma dele responder. Existe `test/sync.test.js` (cobre o **CLI**) e `validate-artifacts.js` (cobre **estrutura**), mas zero cobertura **comportamental**.

**Solução.** Suite que captura saídas de cada agent contra fixtures como baseline. CI roda agent contra fixtures e mostra **diff comportamental**: *"esse PR fez o `system-architect` parar de citar trade-offs em 3/10 fixtures"*.

**Decisões a tomar antes de codar:**
- O que conta como "comportamento": presença de seções? número de tool calls? estrutura JSON da resposta? distribuição de palavras-chave? snapshot literal?
- Snapshot literal é frágil (qualquer phrase change quebra). Métricas estruturais (presença de seções, ratio de seções, count de findings por categoria) são mais robustas.
- Custo: rodar suite em CI consome tokens da Anthropic API.

**Esforço:** ~3 dias.

**Por que vale:** ninguém na indústria construiu isso. É genuinamente novo, vira diferencial.

### 5.2 Test coverage de funções puras do `bin/ahc`

**Problema.** Hoje só temos integração. Funções como `bumpVersion`, `extractDescription`, `walkFiles` não têm unit tests.

**Solução.** Refator pequeno: extrair funções puras pra `bin/ahc-lib.js`, importar em `bin/ahc` e em `test/lib.test.js`. Adiciona ~10-15 unit tests rápidos.

**Esforço:** ~4h.

### 5.3 Telemetria opt-in

**Problema.** Backlog de skills/agents é priorizado a dedo, sem evidência. Saber *"go-senior-engineer é 3x mais invocado que python-engineer"* mudaria RICE.

**Solução.** Arquivo `~/.claude/.ahc-telemetry.json` (opt-in via `ahc config telemetry=on`) que grava só counts (qual agent/command/skill foi sincronizado, quando, qual versão). Nada pessoal, sem prompt content. Job opcional posta agregados no canal interno semanalmente.

**Esforço:** ~24h.

### Decisões pendentes

- [ ] **Política da empresa permite tracking opt-in de devs** (counts only, sem dados pessoais)? Define se 5.3 é viável.

---

## 6. Discoverability  **[backlog médio]**

### 6.1 Team field (Fase 1)  <!-- DONE: 2026-05-07 -->

**Entregue.** Cada agent declara `team` na frontmatter (enum fechado de 11 buckets: `backend|frontend|data|devops|integration|architecture|security|qa|product|docs|meta`). Validator garante o enum (warning sem `--strict`, erro com `--strict`). Manifest carrega `team` por agent (propagado sem bump de versão — é metadata). `ahc list` agrupa por team e suporta `--team=<a,b,...>` pra filtrar.

### 6.2 Tags cross-cutting (Fase 3 — pendente)

**Problema.** `team` é unidimensional. Casos como `aws-devops-engineer` (infra **e** observabilidade **e** custo) ou `cache-search-engineer` (data **e** performance) merecem múltiplos eixos.

**Solução.** Estender frontmatter com `tags: [string]` (2-5 tags por artefato — cross-cutting). Comandos novos:
- `ahc search observability` → busca em tags + description
- `ahc show go-senior-engineer --related` → sugere artefatos relacionados (overlap de tags)

Manifest schema bump v1 → v2 com migration path no `ahc sync` pra versões antigas.

**Esforço:** ~16h (tagging retroativo 3h + schema 3h + code 6h + tests 2h + docs 2h).

### 6.3 Cross-reference automático entre agents relacionados

**Problema.** Dev usa `go-senior-engineer` mas não sabe que existe `go-sdet-backend` complementar.

**Solução.** Após item 6.2, gerar grafo de relacionamento (tag overlap + campo `related` opcional no frontmatter). README mostra "often used with" por agent.

**Esforço:** ~6h após 6.2.

---

## 7. Documentação interna  **[backlog baixo]**

### 7.1 CONTRIBUTING.md

**Problema.** Convenções estão espalhadas pelo README. Novo contributor custa ~2h pra entender frontmatter / tier / memória / convenção de idioma.

**Solução.** Criar `CONTRIBUTING.md` consolidando: convenções, fluxo de adicionar agent/command/skill, como rodar testes, como rodar validator, como bumpar versão.

**Esforço:** ~10h.

### 7.2 CHANGELOG.md (usar a própria skill `release-notes`!)

**Problema.** Não temos histórico publicado de mudanças. Ironia: temos skill `release-notes` mas não usamos no próprio repo.

**Solução.** Criar `CHANGELOG.md` retroativo dos commits dos últimos 3 meses usando a skill. A partir daí, cada release no GH Releases puxa do mesmo template.

**Esforço:** ~4h pro retroativo + zero pro contínuo (skill faz).

### 7.3 LICENSE explícita

**Problema.** README diz "Uso interno EMS-NCTECH" mas não tem arquivo LICENSE. Se alguém tentar usar fora, fica ambíguo.

**Solução.** Adicionar `LICENSE` com texto curto explicitando "Uso interno EMS-NCTECH, não distribuir externamente sem autorização".

**Esforço:** ~30min (mais aprovação do jurídico se houver).

### Decisões pendentes

- [ ] Texto exato da LICENSE — alinhar com jurídico/RH

---

## 8. Novos artefatos (skills + commands)

### 8.1 Skills do backlog do PO  **[espera]**

Vindas do brainstorm anterior. Atacar conforme demanda real do time:

| Skill | RICE | Esforço |
|---|---|---|
| `data-generator` | 132 | 24h |
| `deployment-diagram` | 128 | 16h |
| `runbook` | 120 | 12h |
| `openapi-visual` | 104 | 16h |
| `terraform-plan-summary` | 96 | 12h |
| `postmortem` (overlap parcial com `/incident-response`) | 88 | 12h |
| `state-machine-diagram` | 80 | 12h |

### 8.2 `/draft-pr` — PR description gerada do diff + Jira + convenções

**Problema.** Devs gastam ~10min escrevendo PR description. Qualidade varia. Risk callouts somem.

**Solução.** Command que lê diff, lê ticket linkado (se houver), conhece convenções do repo, escreve body do PR no formato do time (Summary / Test plan / Risk callouts / Screenshots placeholder).

**Esforço:** ~1 dia.

### 8.3 MCP server bundled  **[strategic]**

**Problema.** Hub só serve Claude Code hoje. Cursor, Zed, Continue não conseguem consumir.

**Solução.** Empacotar um MCP server que expõe os 18 agents + 14 commands + 4 skills via Model Context Protocol. Qualquer cliente MCP-compatível ganha o arsenal.

**Esforço:** ~3 dias.

**Por que vale:** desacopla do Claude Code antes que vire prisão. Portabilidade gigante.

### 8.4 `ahc record` / `ahc playback`

**Problema.** Onboarding de novo dev é texto + pair-programming. Não tem jeito de "mostrar como o senior atacou esse bug ontem".

**Solução.** `ahc record` grava sessão completa (prompts + outputs + tool calls), redacta secrets automaticamente, salva como `.ahc-recording.jsonl`. Outro dev faz `ahc playback <arquivo>` e re-vive sessão passo a passo. Onboarding viral.

**Esforço:** ~4 dias.

---

## 9. Decisões pendentes consolidadas

Lista de input que precisamos do Washington antes de atacar itens específicos:

1. **Distribuição interna (item 1):** qual secret store + owner do bot user
2. **Telemetria (item 5.3):** política da empresa permite tracking opt-in?
3. **Agents autônomos (item 2):** canal pra reports + budget de tokens + owner de API key
4. **Escala atual:** quantos devs rodam `ahc sync` hoje? (10? 50? 100+?) → muda RICE de discovery (item 6) e CLI doctor (item 3.1)
5. **Roadmap de skills (item 8.1):** "esperar demanda" ou tem prioridade do time?
6. **OSS no futuro:** plano de eventual open-source ou interno-only indefinido? → afeta LICENSE (item 7.3) e CONTRIBUTING (item 7.1)
7. **Bloqueadores conhecidos:** alguém reportou pain além dos listados (`sync` lento, dificuldade de desinstalar, updates quebrando setup)?

---

## 10. Explicitamente fora de escopo

Coisas discutidas e **rejeitadas** (com razão registrada — pra não voltar à mesa sem novidade):

- **Repo público.** Política interna não permite. Não voltar a propor sem mudança de política.
- **Espelho em git interno** (GitLab/Bitbucket). Empresa não tem.
- **Token embutido em `install.sh`.** Vaza imediatamente. Substituído pelo padrão de service account + secret store (item 1).
- **Per-user PAT** (cada dev gera seu próprio token). Defeats o propósito — exige acesso GitHub que é o gap original.
- **`ahc playground`** (sandbox de teste de agent draft). Bom em teoria mas baixo ROI até termos contributors externos frequentes.
- **Voice mode / transcrição de áudio.** Não é um workflow do time hoje.
- **A/B testing de agents.** Prematuro até telemetria existir (item 5.3).
- **Federação cross-org.** Discutir só se decisão de OSS mudar.

---

## 11. Próximas ondas sugeridas

Se eu fosse atacar isso pelo Washington, seria nessa ordem:

**Onda 1 (sprint atual ou próximo, ~1 semana):**
1. Distribuição interna com PAT (item 1) — desbloqueia novos devs
2. `ahc doctor` (item 3.1) — corta tempo de suporte
3. Memory drift detector (item 4.1) — fecha o loop do trio

**Onda 2 (sprint seguinte, ~1 semana):**
4. PR security sentinel (item 2 fase B) — primeiro agent autônomo
5. Auto-ADR seeding (item 4.2) — paga dívida histórica em uma rodada
6. CHANGELOG retroativo via `release-notes` (item 7.2) — dogfood

**Onda 3 (médio prazo, ~2 semanas):**
7. Prompt regression suite (item 5.1) — virtuoso e sem precedente
8. MCP server bundled (item 8.3) — portabilidade estratégica
9. Tags / discovery (item 6.2) — antes do USAGE.md ficar inviável

**Backlog perpétuo:** skills do item 8.1 conforme demanda; CLI quality-of-life (3.2/3.3/3.4) conforme dor real surgir.

---

> **Como atualizar este roadmap:** quando atacar um item, mover pra changelog/done (após item 7.2 estar feito) ou marcar `<!-- DONE: 2026-MM-DD -->` no header da seção. Adicionar item novo seguindo o template "problema → solução → esforço → riscos → dependências → decisões pendentes".
