# agents-hub-claude

> **Cópia de distribuição externa.** O hub canônico é [`EMS-NCTECH/agents-hub-claude`](https://github.com/EMS-NCTECH/agents-hub-claude) e é lá que se contribui — PRs abertos aqui não chegam nos devs da engenharia. Este espelho existe pra quem não tem acesso à org EMS-NCTECH conseguir instalar e sincronizar. Gerado por `scripts/make-mirror.js`; não edite à mão.

> 📘 **[Guia de uso com exemplos →](docs/USAGE.md)** — o que cada agent/command faz, quando acionar, prompts prontos e fluxos combinados.
> 🔁 **[Guia dos fluxos orquestrados →](docs/FLOWS.md)** — `/flow` e `/bug-flow` gate a gate, com exemplos e o modelo de loop quando os agents discordam ([PDF ilustrado](docs/flows/guia-flow-bug-flow.pdf)).
> 🗺️ **[Roadmap →](docs/ROADMAP.md)** — iniciativas futuras, decisões pendentes e o que está fora de escopo (com razão).

## Objetivo

Padronizar e distribuir, de forma automática, o time de **agents e slash commands do Claude Code** usados pela engenharia da EMS-NCTECH. O hub existe para que:

- **Todo dev tenha o mesmo ferramental** — os mesmos agents (Go, .NET, React, DBA, DevOps, Arquitetura, PO, QA…) e os mesmos commands (`/code-review`, `/smart-commit`, `/discovery`, `/arch-design`, etc.) instalados, versionados e atualizados sem esforço manual.
- **As boas práticas virem código** — convenções, checklists de review, templates de ADR e fluxos de discovery ficam versionados no repo, não em wikis esquecidas.
- **A curva de onboarding caia** — um dev novo roda `install.sh` uma vez e passa a ter o mesmo "time sênior virtual" que o resto da engenharia já usa no dia a dia.
- **As atualizações cheguem sozinhas** — o hook `SessionStart` roda `ahc sync` a cada sessão, então melhorias feitas aqui chegam a todos na próxima vez que abrirem o Claude Code, sem ninguém precisar lembrar de dar pull.
- **Haja uma fonte única da verdade** — `manifest.json` com versão + `sha256` por item, garantindo integridade e rastreabilidade das mudanças.

Em resumo: **menos tempo configurando Claude Code, mais tempo entregando software com qualidade consistente entre squads.**

---

## Arquitetura

![Arquitetura do agents-hub-claude](docs/architecture/agents-hub-claude.png)

> Gerado pela skill `architecture-diagram` (matplotlib). Pra regenerar após mudar a estrutura: `python3 docs/architecture/render.py`.

**Fluxo, da esquerda pra direita:**

1. **Contributor** edita `agents/`, `commands/`, `skills/` ou `autonomous/` no repo do hub.
2. Push pra um PR → **CI Actions** roda dois gates: `regen-manifest --check` (falha se manifest está desatualizado) + `test.yml` (validator + 94 testes de integração `node:test`).
3. Merge no `main` → workflow `regen-manifest` faz auto-commit do manifest se houver drift residual.
4. Em cada `SessionStart` do Claude Code de cada dev, o hook dispara `ahc sync --quiet --timeout=5`.
5. `ahc` faz `git clone --depth=1` do repo, lê `manifest.json`, compara com `~/.claude/.ahc-lock.json`, baixa só o que mudou, **verifica sha256 por arquivo** (incluindo cada arquivo dentro de uma skill), grava em `~/.claude/{agents,commands,skills,autonomous}/`, e **remove o que saiu do manifest** (só o que ele mesmo instalou; item pinado é preservado).
6. Claude Code lê `~/.claude/` na inicialização da sessão; agents/commands/skills ficam disponíveis pro dev imediatamente. As specs em `autonomous/` **não** são lidas pelo Claude Code — são distribuídas pra visibilidade e kill switch (`ahc autonomous list`), já que o agent autônomo roda na nuvem, não na máquina do dev.

---

Registry centralizado de **agents, commands, skills e agents autônomos do Claude Code** da EMS-NCTECH, com CLI própria (`ahc`) que sincroniza tudo automaticamente em cada máquina.

- **Fonte da verdade:** `manifest.json` com versão e `sha256` por item (e por arquivo, em skills)
- **CLI:** `ahc` — Node zero-deps, distribuída via `install.sh`
- **Auto-update:** hook `SessionStart` do Claude Code roda `ahc sync` a cada sessão
- **Destino dos arquivos:** `~/.claude/agents/` (agents), `~/.claude/commands/` (slash commands), `~/.claude/skills/<nome>/` (skills multi-arquivo), `~/.claude/autonomous/` (specs de agents autônomos)
- **Quality gates:** GitHub Actions `regen-manifest` (PR + push) e `test.yml` (validator + 94 testes)

> **Como usar cada agent/command?** Veja o **[Guia de uso com exemplos →](docs/USAGE.md)** — o que cada um faz, quando acionar, prompts prontos e fluxos combinados.

---

## Instalação

O repo é `INTERNAL` na org EMS-NCTECH, então o `ahc` usa `git clone` sob o capô em vez de HTTP anônimo. A credencial vem da primeira origem que autenticar, nesta ordem: variável `AHC_GITHUB_TOKEN` → `token` salvo em `~/.claude/.ahc-config.json` → token de leitura embutido no `ahc` → sua credencial git (a que `gh auth login` configura). Quem já tem `gh` configurado não precisa fazer nada diferente; quem não tem, veja [Sem credencial git (one-liner da wiki)](#sem-credencial-git-one-liner-da-wiki) logo abaixo. Requisitos comuns:

- **`git`** — autenticado na org EMS-NCTECH
- **`node`** (v18+) — o `ahc` CLI é Node puro, zero-deps
- **`gh` CLI** — recomendado pra autenticação automática (alternativa: PAT no keychain)

> **Sem `gh` nem credential helper configurado?** Pule pra [Sem credencial git (one-liner da wiki)](#sem-credencial-git-one-liner-da-wiki) — não precisa autenticar no GitHub pra instalar nem pra sincronizar.

### Sem credencial git (one-liner da wiki)

Pra quem não tem `gh auth login` nem credential helper configurado (máquina nova, ambiente restrito, Git Bash sem setup): o `ahc` resolve a autenticação de sync sozinho, com um token de leitura embutido no próprio instalador. Você não precisa de `gh` nem de configurar credencial git nenhuma.

**Pré-requisitos:** `git` (>= 2.31) e `node` (v18+) instalados.

**1) Copie o comando da wiki interna.** O formato publicado é:

```bash
curl -fsSL -H "Authorization: Bearer <TOKEN>" -H "Accept: application/vnd.github.raw" "https://api.github.com/repos/washingtonsarago/agents-hub-claude/contents/install.sh?ref=main" | bash
```

`<TOKEN>` é um placeholder — copie o comando já com o token preenchido direto da página da wiki interna. O token é só de leitura, escopado ao repo `agents-hub-claude`, e muda quando o time o renova: não existe um valor fixo pra colar aqui.

> **Atenção ao `curl | bash`:** se o `curl` falhar (token vencido, rede fora, rate limit da API), o `bash` recebe um script vazio e termina com exit 0 mesmo assim — o comando parece ter "rodado" sem instalar nada. O erro real fica só no stderr do `curl`, então confira a saída e valide o resultado com `ahc doctor` (passo 3) antes de assumir que deu certo.

**2) Aguarde o instalador terminar.** Ele grava o binário em `~/.local/bin/ahc`, configura o hook `SessionStart` em `~/.claude/settings.json` e clona o hub em `~/.claude/.ahc-cache/`. Garanta que `~/.local/bin` está no PATH (passo 4 das seções macOS/Windows acima).

**3) Verifique:**

```bash
ahc doctor
ahc sync
```

Os dois devem terminar sem pedir usuário nem senha. Veja [Diagnóstico (`ahc doctor`)](#diagnóstico-ahc-doctor) pro formato da saída e [Troubleshooting](#troubleshooting) pro que fazer diante de cada ⚠/✗.

**Token vencido ou revogado depois?** Sem reinstalar: `export AHC_GITHUB_TOKEN=<token-novo>` ou `ahc config token=<token-novo>`. Rodar o one-liner de novo também funciona e preserva o `token` que você já tiver salvo em `~/.claude/.ahc-config.json`.

### macOS

**1) Instalar pré-requisitos (se não tiver):**

```bash
brew install git node gh
```

**2) Autenticar no GitHub:**

```bash
gh auth login
```

Escolha: GitHub.com → HTTPS → "Login with a web browser" → siga o fluxo. Isso configura o git credential helper automaticamente pra clonar repos privados/internal.

**3) Instalar o hub:**

```bash
cd /tmp
gh repo clone washingtonsarago/agents-hub-claude ahc-boot
bash ahc-boot/install.sh
rm -rf ahc-boot
```

**4) Garantir que `~/.local/bin` está no PATH.** Adiciona ao seu `~/.zshrc` (ou `~/.bash_profile`):

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Depois recarrega: `source ~/.zshrc`.

**5) Verificar:**

```bash
ahc list
```

Deve listar os 20 agents + 17 commands + 14 skills + 1 autonomous com status `local:X.Y.Z   remote:X.Y.Z`.

---

### Windows

O `install.sh` precisa de um shell bash. No Windows, a forma recomendada é **WSL2** (Ubuntu). Git Bash também funciona com pequenos ajustes.

#### Opção A — WSL2 (recomendada)

**1) Instalar WSL2 + Ubuntu** (no PowerShell como admin):

```powershell
wsl --install -d Ubuntu
```

Reinicia o Windows, abre o Ubuntu pelo menu Iniciar, cria seu usuário.

**2) Dentro do Ubuntu (WSL), instalar pré-requisitos:**

```bash
sudo apt update && sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list
sudo apt update && sudo apt install -y gh
```

**3) Autenticar no GitHub:**

```bash
gh auth login
```

**4) Instalar o hub:**

```bash
cd /tmp
gh repo clone washingtonsarago/agents-hub-claude ahc-boot
bash ahc-boot/install.sh
rm -rf ahc-boot
```

**5) PATH (WSL bash):**

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

**6) Verificar:**

```bash
ahc list
```

> **Importante:** o Claude Code no Windows lê `~/.claude/` a partir do filesystem onde ele roda. Se você usa Claude Code **nativo no Windows**, ele lê `C:\Users\<você>\.claude\` — e o install feito dentro do WSL instala em `/home/<você>/.claude/` (que é outro lugar). Veja a **Opção B** abaixo pra essa situação.

#### Opção B — Git Bash (Claude Code nativo no Windows)

Use quando você roda o Claude Code no Windows (não dentro do WSL).

**1) Instalar pré-requisitos:**
- [Git for Windows](https://git-scm.com/download/win) (vem com Git Bash)
- [Node.js LTS](https://nodejs.org/) (v18+)
- [GitHub CLI](https://cli.github.com/)

**2) Abrir o Git Bash** (não PowerShell nem cmd) e autenticar:

```bash
gh auth login
```

**3) Instalar o hub:**

```bash
cd /tmp
gh repo clone washingtonsarago/agents-hub-claude ahc-boot
bash ahc-boot/install.sh
rm -rf ahc-boot
```

O `install.sh` vai detectar `$HOME` como `C:\Users\<você>` no Git Bash e instalar em:
- CLI: `C:\Users\<você>\.local\bin\ahc`
- Agents: `C:\Users\<você>\.claude\agents\`
- Commands: `C:\Users\<você>\.claude\commands\`
- Cache: `C:\Users\<você>\.claude\.ahc-cache\`

**4) Adicionar `~/.local/bin` ao PATH do Windows** (necessário pro Claude Code achar o `ahc` ao disparar o hook):

- Abre **Configurações do Windows** → busca "variáveis de ambiente" → "Editar as variáveis de ambiente do sistema"
- Em **Variáveis de Ambiente** → **Path** (usuário) → Editar → Novo
- Adiciona: `%USERPROFILE%\.local\bin`
- OK. Fecha e reabre o Git Bash / Claude Code.

**5) Verificar:**

```bash
ahc list
```

---

### Solução de problemas

**`fatal: could not read Username for 'https://github.com'`**
Git não tem credenciais. Rode `gh auth login` e tente de novo. Se já tiver rodado, force o credential helper: `gh auth setup-git`.

**`ahc: command not found` depois do install**
`~/.local/bin` não está no PATH. Veja os passos de PATH por plataforma acima.

**`ahc sync` funciona manual, mas auto-update não roda ao abrir o Claude Code**
O hook `SessionStart` não está no `settings.json`. Confirme com:
```bash
grep -c 'ahc sync' ~/.claude/settings.json
```
Se retornar `0`, re-rode o `install.sh` — ele faz merge seguro no settings.json existente.

**Claude Code no Windows não encontra o `ahc` ao disparar o hook**
O PATH do Claude Code (processo gráfico) não herda alterações feitas no Git Bash. Configure `%USERPROFILE%\.local\bin` no PATH via Configurações do Windows (passo 4 da Opção B) e reabra o Claude Code.

**`node: command not found`**
Instala Node.js LTS (v18+). Mac: `brew install node`. Windows: [nodejs.org](https://nodejs.org/). WSL: ver passo 2 da Opção A.

---

## Como usar

### Sincronizar agents

```bash
ahc sync                # baixa o manifest, atualiza o que mudou
ahc sync --quiet        # sem logs (usado pelo hook SessionStart)
ahc sync --force        # ignora pins, força atualização
```

O `sync` é idempotente: só baixa o agent se o `sha256` do manifest diferir do `~/.claude/.ahc-lock.json` local. Se você estiver offline, falha silenciosamente e mantém o cache local.

### Listar estado atual

```bash
ahc list
```

Mostra cada agent com versão local vs remota. Legenda:

- `++` novo (disponível remoto, não instalado)
- `↑↑` atualização disponível
- `--` removido remotamente (ainda presente local)

### Travar uma versão (pin)

```bash
ahc pin arquiteto-sr@1.2.0     # não atualiza esse agent
ahc unpin arquiteto-sr         # volta a atualizar
```

Útil quando um agent novo quebra seu fluxo e você quer segurar a versão antiga até investigar.

### Configuração

```bash
ahc config                                        # mostra config atual
ahc config repo=washingtonsarago/agents-hub-claude      # muda o repo fonte
ahc config branch=beta                            # troca pro canal beta
ahc config channel=beta                           # label do canal
ahc config token=<token-novo>                     # troca o token de leitura (env AHC_GITHUB_TOKEN tem precedência)
```

Config fica em `~/.claude/.ahc-config.json`, sempre gravada com modo `600`. O campo `token`, quando presente, sai mascarado (só prefixo + últimos 4 caracteres) em qualquer saída de `ahc config` — o valor completo nunca aparece em stdout nem em stderr, só no arquivo em disco.

### Diagnóstico (`ahc doctor`)

Quando o auto-update parar de funcionar ou você quiser confirmar que está tudo configurado, rode:

```bash
ahc doctor
```

Saída exemplo:

```
ahc doctor — system health check

✓ ahc binary in PATH (/Users/you/.local/bin/ahc)
✓ SessionStart hook configured (/Users/you/.claude/settings.json)
✓ lock file valid (20 agents · 17 commands · 14 skills · 1 autonomous · last sync 2h ago)
✓ config file permission (mode 600)
✓ git version (2.43.0 >= 2.31)
✓ git auth (washingtonsarago/agents-hub-claude@main reachable via embutido)
✓ ahc CLI up to date (sha 172722dc170f…)

Summary: 7 ✓ · 0 ⚠ · 0 ✗
```

O `git auth` nomeia a origem que autenticou (`embutido`, `env (AHC_GITHUB_TOKEN)`, `config (token em ~/.claude/.ahc-config.json)` ou `credencial git`) — é o `ahc` tentando, em cascata e nessa ordem, cada uma até uma funcionar. Se uma origem de maior precedência foi recusada mas outra autenticou, o doctor mostra ⚠ pra cada uma recusada, sem derrubar o exit code (o sync continua funcionando). Veja [Troubleshooting](#troubleshooting) pros ⚠/✗ possíveis desse check.

O que cada check valida:

- **`ahc binary in PATH`** — o binário invocado é encontrado no filesystem.
- **`SessionStart hook`** — `~/.claude/settings.json` tem hook `SessionStart` rodando `ahc sync`.
- **`lock file`** — `~/.claude/.ahc-lock.json` parseável, não vazio, e mostra última sync.
- **`config file permission`** — `~/.claude/.ahc-config.json` está em `0600` (crítico se houver token; preventivo caso contrário). No Windows, é skipped.
- **`git version`** — o git instalado é >= 2.31 (versão mínima que aceita o header de autenticação por token que o `ahc` injeta).
- **`git auth`** — a cascata de origens (`AHC_GITHUB_TOKEN` → `token` da config → token embutido → credencial git) alcança `repo@branch`; cada origem tem um teto de 30s pra responder, e uma recusa de autenticação (401/403/404) avança pra próxima na hora, sem esperar o teto.
- **`ahc CLI up to date`** — sha do binário local bate com o `bin/ahc` da branch configurada (avisa se você tem CLI antigo após release).

**Exit codes:**
- `0` — tudo verde ou só ⚠ (warnings não bloqueiam, inclusive quando uma origem de token caiu mas outra autenticou).
- `1` — pelo menos um ✗ (item bloqueante; siga a hint logo abaixo do check).

---

## Auto-update via SessionStart

Já configurado pelo `install.sh` em `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "/home/you/.local/bin/ahc sync --quiet --timeout=3" }
        ]
      }
    ]
  }
}
```

Toda vez que você abre o Claude Code, o hook roda o sync em background com timeout de 3s. Se estiver offline, não bloqueia a sessão.

---

## Agents disponíveis

Lista atual agrupada por **time** (ver `manifest.json` para versões e hashes). Cada agent declara seu time na frontmatter (`team: <bucket>`) — a CLI usa isso pra agrupar `ahc list` e o validator garante o enum.

### backend
| Agent | Uso |
|---|---|
| `dotnet-backend-architect` | .NET / ASP.NET Core / DDD / CQRS |
| `go-senior-engineer` | Go senior — concurrency, gRPC, microservices |
| `nodejs-backend-architect` | Node.js TS-first — Fastify/Express/NestJS, Prisma/Drizzle, Zod |
| `python-engineer` | Python idiomático — FastAPI/Django, Pydantic v2, async, pytest, polars |

### frontend
| Agent | Uso |
|---|---|
| `senior-react-developer` | React, hooks, state, acessibilidade, testes |

### data
| Agent | Uso |
|---|---|
| `cache-search-engineer` | Cache (Redis/Memcached/ElastiCache) e search (Elasticsearch/OpenSearch) — patterns, invalidação, stampede, relevância, mapping/sharding |
| `postgres-dba` | PostgreSQL DBA — tuning, replicação, HA, troubleshooting |

### devops
| Agent | Uso |
|---|---|
| `aws-devops-engineer` | Infra AWS, CI/CD, Terraform, EKS, observabilidade |
| `infra-cost-estimator` | Estimativa de custo de infra, TCO, comparação de cenários, FinOps, build-vs-buy com sensibilidade |

### integration
| Agent | Uso |
|---|---|
| `integration-architect` | Event-driven, SQS/SNS/Kafka, CDC, orchestration |

### architecture
| Agent | Uso |
|---|---|
| `system-architect` | Arquitetura, ADRs, C4, análise de trade-offs |

### security
| Agent | Uso |
|---|---|
| `security-specialist` | AppSec/DevSecOps — OWASP Top 10, CWE Top 25, STRIDE, release-gate |

### qa
| Agent | Uso |
|---|---|
| `cypress-qa-analyst` | Cypress E2E, estratégia de teste, CI integration |
| `go-sdet-backend` | Go SDET — testes, coverage, race, fuzz |

### product
| Agent | Uso |
|---|---|
| `senior-product-designer` | UX strategy — discovery, IA, journey, heurísticas, a11y, design system |
| `senior-product-owner` | User stories, OKRs, priorização de backlog |

### docs
| Agent | Uso |
|---|---|
| `technical-writer` | Documentação user-facing — Diátaxis, getting-started, tutorials, how-tos, migration guides |

### meta
| Agent | Uso |
|---|---|
| `project-memory-keeper` | Trio `.claude/memory/{business,architecture,guidelines}.md` + READMEs + ADRs |

> Para listar localmente filtrando por time: `ahc list --team=backend,data`.

## Commands disponíveis

Slash commands instalados em `~/.claude/commands/` — invoque com `/<nome>`:

| Command | Uso |
|---|---|
| `/api-contract` | Gerar OpenAPI spec ou validar contratos entre serviços |
| `/autonomo` | Criar um **agent autônomo**: escreve a spec em `autonomous/<nome>.md`, registra no manifest e arma a rotina agendada na nuvem |
| `/arch-design` | Design arquitetural — diagramas C4, ADRs, análise de trade-offs |
| `/bootstrap-project` | Escaneia o repo, detecta stack e cria `.claude/memory/{business,architecture,guidelines}.md` + `docs/{adr,todo,done}/` |
| `/bug-flow` | Orquestração de bug: triage → RCA → fix + teste de regressão → security gate → commit |
| `/code-review` | Revisão multi-reviewer paralela de PR/diff — orquestrador classifica o diff e dispara `system-architect` + `security-specialist` + stack-specifics em paralelo, deduplica e consolida |
| `/db-audit` | Auditoria de schema, índices, FKs, migrations, queries e segurança de banco |
| `/discovery` | Product discovery — problem framing, JTBD, assumptions, experimentos, go/no-go |
| `/feature-flow` | Orquestração de feature: PO → Arquiteto → (Threat-model) → Dev → QA → Security gate → Review → Commit |
| `/flow` | Orquestração completa `GOAL → DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP`, ancorada numa métrica de sucesso. Supersede `/feature-flow`. Consulta sessões peer em outros repos quando o change mexe em contrato compartilhado |
| `/incident-response` | Orquestração de incidente em prod: detect → triage → mitigate → RCA → fix → postmortem blameless |
| `/jira-story` | Redigir ou refinar user stories com critérios de aceite e cenários de teste |
| `/memory-query` | Lookup de alta precisão na memória do projeto (`.claude/memory/*`) com citação do arquivo + seção |
| `/onboard-dev` | Gerar `ONBOARDING.md` completo pra novos devs do projeto |
| `/smart-commit` | Analisar diff e criar Conventional Commit com type/scope corretos |
| `/tech-debt` | Escanear e classificar dívida técnica com plano de ação priorizado |
| `/veredito` | Auditar a alegação de conclusão de um agent — re-roda o que foi prometido, caça seis fraudes (teste afrouxado, conclusão falsa, escopo inflado, ação não autorizada, traição da spec, lixo) e devolve CONFIRMADO / COM RESSALVAS / REFUTADO |

> Detalhes, exemplos de prompt e fluxos combinados: **[docs/USAGE.md](docs/USAGE.md)**.

---

## Coordenação entre sessões no mesmo checkout

Várias sessões do Claude Code abertas na mesma pasta compartilham working tree e `.git` — mas não sabem umas das outras. Dois danos reais disso: um `index.lock` órfão que travou um repo por **8 dias** sem ninguém achar a causa, e sessões desfazendo o trabalho umas das outras sem aviso.

O `ahc` agora coordena, com uma regra inegociável: **nada nunca bloqueia.** O git já serializa o trecho crítico; o que faltava era limpeza e consciência.

| Peça | O que faz | Onde roda |
|---|---|---|
| **Janitor** | Remove lock de git **provadamente** órfão: idade ≥ 30min **e** nenhum processo dono (via `lsof`) **e** (0 byte **ou** ≥ 24h). Fora disso, só avisa com o comando pronto. Nunca toca estado de merge/rebase interrompido. | `ahc sync` (todo SessionStart), guard, `ahc doctor` |
| **Presença** | Cada sessão registra `<gitdir>/ahc-sessions/<pid>.json` com heartbeat. Sessão nova avisa se há outra viva. Mortas são coletadas pelos vivos (kill -9 não avisa ninguém). | `ahc sync` |
| **Guard** | Antes de um git de **escrita** com outra sessão viva: um aviso, deduplicado por 15min. Leitura nunca interfere; comando não reconhecido conta como leitura. Sempre exit 0. | hook `PreToolUse` (opt-in, abaixo) |
| **Worktree** | `ahc worktree <branch>` cria a worktree em `../<repo>.wt/<branch>`, copia `.env` e `settings.local.json`, e imprime o `cd`. Presença é por worktree — quem isola para de receber aviso. | manual |

**Zero fricção no caso comum:** com uma sessão só, tudo isso é invisível. E `ahc doctor` ganhou os checks de lock órfão e de sessões concorrentes.

**Guard (opt-in).** O janitor e a presença funcionam sem configurar nada (pegam carona no `ahc sync` do SessionStart). O guard exige um hook `PreToolUse` no `~/.claude/settings.json` — opt-in porque adiciona ~50–80ms de startup de Node a **cada** comando Bash, em todos os projetos:

```json
"PreToolUse": [
  { "matcher": "Bash",
    "hooks": [ { "type": "command", "command": "~/.local/bin/ahc coord guard", "timeout": 3 } ] }
]
```

**Kill switch:** `ahc coord off` no checkout (religa com `ahc coord on`), ou `AHC_COORD=off` no ambiente. Bug no mecanismo degrada pra "sem coordenação", nunca pra "dev travado".

**Limite conhecido:** um `git rebase` rodado num terminal cru, fora do Claude Code, é invisível pra presença — mas o janitor ainda limpa o lock órfão que ele deixar.

---

## Espelho pra quem está fora da org

O repo canônico é `INTERNAL` na EMS-NCTECH: contractors, parceiros e ambientes restritos não conseguem clonar nem sincronizar dele. O espelho em outro owner é o canal dessas pessoas.

Ele **não** é cópia byte-a-byte — `install.sh`, `bin/ahc`, `README.md` e o campo `repo` do manifest precisam apontar pro próprio espelho, senão o `ahc sync` do usuário externo tenta alcançar um repo que ele não enxerga.

Esse delta é gerado, não mantido na mão:

```bash
node scripts/make-mirror.js --owner=<login>            # dry-run: lista o que muda
node scripts/make-mirror.js --owner=<login> --apply    # escreve na tree atual
node scripts/make-mirror.js --owner=<login> --check    # a tree já é o espelho?
```

O transform reescreve **só os slugs de repositório** nos arquivos que dirigem instalação e remove `test/origin.test.js` + `.githooks/pre-push` (que existem pra travar o canônico num único owner — no espelho um falharia e o outro bloquearia o push).

Menções em prosa a EMS-NCTECH ficam intactas: são verdadeiras e informativas pro leitor externo. Foi apagá-las que produziu as frases quebradas da primeira tentativa manual (*"O repo é `INTERNAL` na org ,"*).

> **Fluxo:** merge na `main` canônica → `git checkout -B mirror-main origin/main` → `node scripts/make-mirror.js --owner=<login> --apply` → commit → `push --force` pro espelho. O espelho é derivado; PR nele não chega nos devs da engenharia.

---

## Agents autônomos

Agents que rodam **sozinhos**, num horário fixo, sem ninguém acionar. Vivem em `autonomous/<nome>.md` — a quarta categoria do hub, ao lado de agents, commands e skills.

Cada arquivo é a especificação completa de uma rotina agendada: o cron, o repo, o modelo, as ferramentas, o orçamento de tokens, o prompt que a rotina recebe, e o `routine_id` quando armada. Como qualquer artefato do hub, passa por PR, é versionado e o `ahc` distribui.

```bash
/autonomo toda manhã de dia útil, revisa os PRs abertos e me avisa no Slack só se algo mudou
```

O comando entrevista o mínimo necessário, escreve a spec, valida, arma a rotina e grava o `routine_id` de volta no arquivo.

**Ver o que está no ar:**

```bash
ahc autonomous list
```

```
1 autonomous agent(s) in ~/.claude/autonomous/

  armado   pr-sentinel              read-only  cron(UTC): 7 12 * * 1-5
           https://claude.ai/code/routines/trig_...

1 armado(s), 0 so especificacao.
```

### Por que passar pelo hub em vez de agendar direto

Uma rotina criada pelo `/schedule` nativo vive só na conta de quem criou: não é versionada, não passa por review, e ninguém mais sabe que existe nem como desligar. Colocando a spec no repo, "o que roda sozinho em nome da engenharia" vira uma pergunta com resposta auditável.

### O gate de segurança

O default é `mode: read-only`. Bons agents autônomos ou **falham silenciosamente sem prejuízo** (comentam, sugerem) ou **falham loudly mas reversivelmente** (abrem PR que ninguém é obrigado a mesclar). Os perigosos tomam ação irreversível.

Autorizar ação irreversível exige `mode: write` **e** um campo `approved_by: <nome>` — o validator rejeita um sem o outro. O atrito é intencional: autorização de agent autônomo carrega um nome.

Toda spec também precisa declarar uma **condição de silêncio** — o que faz o agent não produzir nada. Sem isso ele vira ruído diário que o time aprende a ignorar.

O primeiro do time é o [`pr-sentinel`](autonomous/pr-sentinel.md).

---

## Adicionando / atualizando um agent, command, skill ou autonomous

1. **Crie ou edite** o arquivo:
   - `agents/<nome>.md` — agent
   - `commands/<nome>.md` — slash command
   - `skills/<nome>/SKILL.md` (+ qualquer arquivo auxiliar em subpastas) — skill multi-arquivo
   - `autonomous/<nome>.md` — agent autônomo (prefira criar via `/autonomo`)
2. **Regenere o manifest** localmente:
   ```bash
   node scripts/regen-manifest.js
   ```
   O script escaneia `agents/` + `commands/` + `autonomous/` + `skills/`, recalcula sha256 (por arquivo nas skills), bumpa `version` (patch por padrão; use `--bump=minor` ou `--bump=major` quando aplicável), atualiza `updated_at`, e lida com adição/remoção de itens.
3. **Edite a `description`** do item no `manifest.json` se for um arquivo novo (a auto-extração tira da frontmatter, mas vale revisar).
4. **Commit + PR** para `main`.

A GitHub Action **Regen manifest** roda em PRs com `--check` (falha se a pessoa esqueceu o passo 2) e roda automaticamente no push pra `main` (auto-commit do manifest se houver drift residual).

Assim que o PR for mergeado, todos os devs com `ahc` instalado vão receber a atualização no próximo `SessionStart`.

### Modos do script

```bash
node scripts/regen-manifest.js                # default: bump patch nos que mudaram, escreve manifest
node scripts/regen-manifest.js --dry-run      # mostra o que mudaria, sem escrever
node scripts/regen-manifest.js --check        # exit 1 se manifest está desatualizado (modo CI)
node scripts/regen-manifest.js --bump=minor   # bump minor em todos que mudaram
node scripts/regen-manifest.js --bump=major   # bump major em todos que mudaram
```

---

## Validação e testes

Dois mecanismos rodam em CI (workflow `Test`) em todo PR e push pra `main`. Ambos são zero-dep e dá pra rodar local antes do commit.

### Validator de artefatos

`scripts/validate-artifacts.js` cobre o que o `regen-manifest.js` não cobre — invariantes do conteúdo:

- Frontmatter obrigatório nos agents (`name`, `description`, `model`).
- `name` da frontmatter bate com o nome do arquivo (kebab-case).
- `description` (quando entre aspas) é JSON válido.
- `model` em `opus|sonnet|haiku`.
- `tier` (quando presente) em `reasoning|speed`.
- `team` (quando presente) em `backend|frontend|data|devops|integration|architecture|security|qa|product|docs|meta`.
- Skills: `SKILL.md` existe, frontmatter tem `name` igual à pasta, manifest tem todos os arquivos da árvore (sem orphan).
- `manifest.updated_at` no formato `YYYY-MM-DD`.
- `sha256` de cada item bate com o conteúdo do arquivo.

```bash
node scripts/validate-artifacts.js                  # passa com warnings, exit 0 se sem erros
node scripts/validate-artifacts.js --quiet          # só erros
node scripts/validate-artifacts.js --strict         # tier e team ausentes viram erro (não warning)
```

### Testes (`node --test`)

Suite de integração cobrindo o CLI (`bin/ahc`), o regen (`scripts/regen-manifest.js`) e o validator. Spawna o CLI real contra fixtures `file://` num `HOME` temporário — testa exatamente o que o dev experimenta.

```bash
node --test test/*.test.js                          # roda tudo (~2s)
node --test test/sync.test.js                       # só os de sync
node --test test/regen.test.js                      # só regen
node --test test/validator.test.js                  # só validator
node --test test/doctor.test.js                     # só doctor
```

Cobertura atual:

- `sync.test.js` — install fresco, idempotência, hash mismatch em skill, pin/unpin, lock back-compat (sem `skills` field), `list` com as categorias, `config` get/set.
- `regen.test.js` — clean repo, edição com bump patch, `--check` falhando em drift, `--dry-run`, novo agent, remoção de orphan, skill multi-arquivo, `.DS_Store` ignorado, `--bump=minor`, `--bump` inválido.
- `validator.test.js` — fixture clean passa, frontmatter ausente, name/filename mismatch, JSON quebrado, model/tier/team inválidos, `--strict` (tier e team), sha drift, file ausente, orphan, aux file fora do manifest, manifest JSON inválido, `updated_at` formato errado.
- `doctor.test.js` — clean env exit 0, missing/malformed `settings.json`, hook sem `ahc sync`, missing/malformed/empty lock, config world-readable com e sem token, mode 600.
- `mirror.test.js` — o transform do espelho externo: reescreve slugs de instalação, preserva prosa, remove as travas do canônico, idempotente, e recusa gerar espelho com o owner canônico.
- `prune.test.js` — poda de órfãos no `sync`: command e skill retirados do manifest saem do disco e do lock, item pinado sobrevive, arquivo que o `ahc` não instalou não é tocado, entrada fantasma no lock é limpa.
- `coord.test.js` — coordenação de sessões: janitor remove só lock provadamente órfão (0 byte + 31min; não-vazio só com 24h; fresco nunca), presença avisa e coleta mortos, heartbeat >12h invalida PID vivo, guard avisa em escrita/cala em leitura/deduplica/nunca bloqueia, kill switch, worktrees não se veem.
- `autonomous.test.js` — spec clean passa, `mode: write` sem `approved_by` rejeitado (e aceito com), cron fora de 5 campos, `mode` inválido, `routine_id` malformado, `repo` fora de `org/repo`, spec fora do manifest, manifest antigo sem a chave `autonomous` ainda valida, regen expondo `schedule`/`mode`, regen limpando `routine_id` removido, `sync` distribuindo pra `~/.claude/autonomous/`, `ahc autonomous list` separando armado de spec.

### Origem do hub

O hub mora **só** em `washingtonsarago/agents-hub-claude`. Um fork pessoal virando default no `install.sh` repontua silenciosamente todo install downstream (o installer grava `~/.claude/.ahc-config.json`, e é de lá que o `ahc sync` puxa) — por isso a origem é testada em CI (`origin.test.js`), não revisada no olho.

No lado local, um hook versionado recusa push pra qualquer remote que não seja o EMS. Ele não vem ativo num clone novo — ative uma vez:

```bash
git config core.hooksPath .githooks
```

---

## Convenções de redação (agents & commands)

Para manter o hub coerente, todo agent ou command novo segue:

### Idioma

- **Agent-facing (instruções pro modelo) → inglês.** O corpo do `.md` que descreve missão, princípios, workflow, regras, anti-patterns e protocolo de colaboração é sempre em inglês. Modelos respondem melhor a prompts em inglês e o vocabulário técnico (BLOCKER, OWASP, CWE, ADR, etc.) já é inglês.
- **User-facing (output que o usuário lê / textos que o agent fala de volta) → português.** Mensagens, perguntas, exemplos de prompt no `description`, templates de relatório que o agent vai exibir pro dev brasileiro — em PT-BR.
- **Docs do hub (`README.md`, `docs/USAGE.md`) → português.** Audiência são os devs da EMS-NCTECH.

> Status: todos os commands seguem essa regra hoje (sweep PT-BR concluído em 2026-05-02). Termos técnicos (BLOCKER, WARNING, CRITICAL, OWASP, ADR, JTBD, INVEST, sync, push) ficam em EN intencionalmente — são jargão.

### Frontmatter (agents)

Campos obrigatórios:
- `name` — kebab-case, igual ao nome do arquivo (sem `.md`)
- `description` — string JSON-escapada com 1 linha de explicação + 3–5 exemplos `user: ... → launch <agent> ...` (esses exemplos podem estar em PT)
- `model` — `opus` | `sonnet` | `haiku`
- `color` — qualquer cor (visual)

Campos recomendados (introduzidos em 2026-05):
- `tier` — `reasoning` | `speed`. Meta-info pra orquestração e decisão de custo. `reasoning` = decisões complexas (PO, arquitetura, segurança, design). `speed` = execução rotineira (implementação, testes, formatação, sync de docs).
- `team` — `backend` | `frontend` | `data` | `devops` | `integration` | `architecture` | `security` | `qa` | `product` | `docs` | `meta`. Bucket primário do agent — usado pra agrupar `ahc list` e o filtro `--team`. Um agent fica em **um** time (cross-cutting será tratado via `tags` no futuro — ver ROADMAP §6.2). Em `--strict`, ausência vira erro.

### Memória do projeto

Agents que precisam de contexto persistente do projeto **leem e escrevem em `.claude/memory/{business,architecture,guidelines}.md`** via `project-memory-keeper`, não em arquivos próprios. Se um agent precisa de uma seção que não cabe em nenhum dos três, levante uma issue antes de criar arquivo novo.

---

## Estrutura do repo

```
.
├── agents/              # .md dos agents (source of truth, distribuídos via ahc)
├── commands/            # .md dos slash commands (distribuídos via ahc)
├── skills/              # skills do Claude Code, multi-arquivo (distribuídos via ahc)
│   └── <nome>/
│       ├── SKILL.md
│       └── templates/   # ou scripts/, etc. — qualquer estrutura interna
├── bin/
│   └── ahc              # CLI Node zero-deps
├── scripts/
│   ├── regen-manifest.js     # regenera manifest.json a partir de agents/ + commands/ + skills/
│   └── validate-artifacts.js # CI gate: frontmatter + sha + orphan + nomes
├── test/                     # node:test integration tests (sync, regen, validator, doctor)
│   ├── helpers.js
│   ├── fixtures/remote/      # mini repo de fixtures (1 agent, 1 command, 1 skill)
│   ├── sync.test.js
│   ├── regen.test.js
│   ├── validator.test.js
│   └── doctor.test.js
├── .github/workflows/
│   ├── regen-manifest.yml    # CI: --check em PR, auto-commit no push pra main
│   └── test.yml              # CI: validator + node --test em PR e push
├── manifest.json        # index com versão + sha256 por item (agents + commands + skills)
├── install.sh           # bootstrap: instala ahc + configura hook
└── README.md
```

## Skills disponíveis

Skills do Claude Code (`~/.claude/skills/<nome>/SKILL.md`) são distribuídas igual aos agents e commands — `ahc sync` baixa a árvore inteira da skill (SKILL.md + arquivos auxiliares) com sha256 por arquivo.

| Skill | Uso |
|---|---|
| `architecture-diagram` | Diagramas de arquitetura em PNG (estilo Linear/Vercel) — cards, sombras, paleta por camada |
| `sequence-diagram` | Diagramas de sequência (UML-ish) em PNG — participantes verticais, mensagens com badge, blocks opt/alt/loop, sync vs async vs error |
| `er-diagram` | Diagramas Entity-Relationship em PNG a partir de SQL/DDL ou descrição — tabelas com colunas + tipos + constraints PK/FK/UQ/NN/IX, relações com multiplicidade |
| `release-notes` | Release notes estruturadas em Markdown (e PDF via pandoc) — header, summary, breaking changes com migration, security, features, fixes, contributors |
| `session-cost` | Mede tokens e custo em US$ de uma sessão, separando orquestrador de subagent. Duas fontes: telemetria OTEL (completa) ou transcript (só orquestrador). Mede do disco, nunca estima — usada pelo `/flow` na fase SHIP |

> Esta tabela lista só uma parte das 14 skills — as demais aparecem em `ahc list` e no [guia de uso](docs/USAGE.md).

> **Atenção pra devs com `ahc` antigo:** versões do `ahc` anteriores a 2026-05-02 não conhecem a categoria `skills` e vão ignorar essa parte do manifest. Re-rode `install.sh` ou copie só o binário atualizado: `cp /tmp/ahc-boot/bin/ahc ~/.local/bin/ahc`.

## Arquivos gerenciados na máquina do dev

```
~/.local/bin/ahc                   # binário da CLI
~/.claude/agents/*.md              # agents instalados
~/.claude/commands/*.md            # slash commands instalados
~/.claude/skills/*/                # skills instaladas (multi-arquivo por skill)
~/.claude/.ahc-config.json         # config (repo, branch, channel, token), modo 600
~/.claude/.ahc-lock.json           # lock com versão instalada e pins
~/.claude/settings.json            # contém o hook SessionStart
```

---

## Troubleshooting

### `ahc doctor` — `git auth`

O check `git auth` tenta, em cascata, cada origem de credencial (`AHC_GITHUB_TOKEN` → `token` da config → token embutido → credencial git) até uma autenticar. Cada saída possível e o que fazer:

**⚠ `git auth: origem recusada — env (AHC_GITHUB_TOKEN)`**
Uma origem depois dela autenticou, então o sync continua funcionando — mas a variável está com um token velho. Atualize ou remova: `unset AHC_GITHUB_TOKEN`.

**⚠ `git auth: origem recusada — config (token em ~/.claude/.ahc-config.json)`**
O `token` salvo na config venceu ou foi revogado. Informe outro com `ahc config token=<novo>`, ou remova o campo apagando a chave `token` do arquivo.

**⚠ `git auth: origem recusada — embutido`**
O token embutido no `ahc` venceu ou foi revogado. Rode de novo o one-liner da wiki (ele atualiza o binário com o token vigente), ou informe o seu próprio com `AHC_GITHUB_TOKEN=<token>` ou `ahc config token=<novo>`.

**✗ `git auth — <repo>@<branch>: acesso recusado por todas as origens (...)`**
Nenhuma origem disponível autenticou. Informe um token válido: `export AHC_GITHUB_TOKEN=<token>` ou `ahc config token=<token>`. Com conta na org: `gh auth login && gh auth setup-git`.

**✗ `git auth — <repo>@<branch>: a branch não existe no repo (...)`**
`branch` na config aponta pra um nome que não existe no remoto — não é problema de credencial, trocar de token não resolve. Confira o nome e corrija com `ahc config branch=<branch>`.

**✗ `git auth — <repo>@<branch>: rede/timeout (...); outras origens não tentadas`**
Falha de conectividade (DNS, proxy, host inalcançável) para a cascata antes mesmo de testar credenciais — nenhuma origem foi apresentada. Confira a rede (VPN, proxy corporativo, `curl -I https://github.com`) e rode `ahc doctor` de novo.

**✗ `git version — <versão> < 2.31 (necessário para autenticar por token)`**
Git desatualizado: versões abaixo de 2.31 não têm o mecanismo que o `ahc` usa para enviar o token de autenticação. Atualize o git (`brew upgrade git`, `sudo apt install --only-upgrade git`, ou baixe de [git-scm.com](https://git-scm.com/downloads)) e rode `ahc doctor` de novo.

### `ahc sync` retorna erro de acesso ao hub

Rode `ahc doctor` — ele isola qual das quatro origens (env, config, embutido, credencial git) está falhando e a dica de cada uma, conforme a lista acima. Sem token nenhum disponível e sem `gh auth login`, use o one-liner da wiki ([Sem credencial git](#sem-credencial-git-one-liner-da-wiki)) para reinstalar com o token vigente.

**Agent não apareceu no Claude Code**
Verifique se o arquivo existe em `~/.claude/agents/<nome>.md` e reinicie o Claude Code. O Claude Code lê esse diretório na inicialização da sessão.

**Quero reverter um agent**

```bash
ahc pin <nome>@<versao-antiga>
ahc sync --force
```

---

## Licença

Uso interno EMS-NCTECH.
