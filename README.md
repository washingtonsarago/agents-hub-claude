# agents-hub-claude

Registry centralizado de **agents e commands do Claude Code** da EMS-NCTECH, com CLI própria (`ahc`) que sincroniza tudo automaticamente em cada máquina.

- **Fonte da verdade:** `manifest.json` com versão e `sha256` de cada agent
- **CLI:** `ahc` — Node zero-deps, distribuída via `install.sh`
- **Auto-update:** hook `SessionStart` do Claude Code roda `ahc sync` a cada sessão
- **Destino dos arquivos:** `~/.claude/agents/` (agents) e `~/.claude/commands/` (slash commands)

---

## Instalação

O repo é `INTERNAL` na org EMS-NCTECH, então o `ahc` usa `git clone` sob o capô (com as suas credenciais do GitHub) em vez de HTTP anônimo. Requisitos comuns:

- **`git`** — autenticado na org EMS-NCTECH
- **`node`** (v18+) — o `ahc` CLI é Node puro, zero-deps
- **`gh` CLI** — recomendado pra autenticação automática (alternativa: PAT no keychain)

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
gh repo clone EMS-NCTECH/agents-hub-claude ahc-boot
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

Deve listar os 11 agents + 8 commands com status `local:X.Y.Z   remote:X.Y.Z`.

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
gh repo clone EMS-NCTECH/agents-hub-claude ahc-boot
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
gh repo clone EMS-NCTECH/agents-hub-claude ahc-boot
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
ahc config repo=EMS-NCTECH/agents-hub-claude      # muda o repo fonte
ahc config branch=beta                            # troca pro canal beta
ahc config channel=beta                           # label do canal
```

Config fica em `~/.claude/.ahc-config.json`.

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

Lista atual (ver `manifest.json` para versões e hashes):

| Agent | Uso |
|---|---|
| `aws-devops-engineer` | Infra AWS, CI/CD, Terraform, EKS, observabilidade |
| `cypress-qa-analyst` | Cypress E2E, estratégia de teste, CI integration |
| `dotnet-backend-architect` | .NET / ASP.NET Core / DDD / CQRS |
| `go-senior-engineer` | Go senior — concurrency, gRPC, microservices |
| `integration-architect` | Event-driven, SQS/SNS/Kafka, CDC, orchestration |
| `project-memory-keeper` | README / CONTEXT / ADR sync |
| `senior-product-owner` | User stories, OKRs, priorização de backlog |
| `senior-react-developer` | React, hooks, state, acessibilidade, testes |
| `system-architect` | Arquitetura, ADRs, C4, análise de trade-offs |

## Commands disponíveis

Slash commands instalados em `~/.claude/commands/` — invoque com `/<nome>`:

| Command | Uso |
|---|---|
| `/api-contract` | Gerar OpenAPI spec ou validar contratos entre serviços |
| `/arch-design` | Design arquitetural — diagramas C4, ADRs, análise de trade-offs |
| `/code-review` | Revisão de PR ou diff — security, correctness, performance, testing |
| `/db-audit` | Auditoria de schema, índices, FKs, migrations, queries e segurança de banco |
| `/discovery` | Product discovery — problem framing, JTBD, assumptions, experimentos, go/no-go |
| `/jira-story` | Redigir ou refinar user stories com critérios de aceite e cenários de teste |
| `/onboard-dev` | Gerar `ONBOARDING.md` completo pra novos devs do projeto |
| `/smart-commit` | Analisar diff e criar Conventional Commit com type/scope corretos |
| `/tech-debt` | Escanear e classificar dívida técnica com plano de ação priorizado |

---

## Adicionando / atualizando um agent

1. **Crie ou edite** o arquivo em `agents/<nome>.md`
2. **Gere o hash** e atualize `manifest.json`:
   ```bash
   shasum -a 256 agents/<nome>.md
   ```
3. **Bump** a `version` do agent no `manifest.json` (semver)
4. **Atualize** o campo `updated_at` no topo do manifest
5. **Commit + PR** para `main`

Assim que o PR for mergeado, todos os devs com `ahc` instalado vão receber a atualização no próximo `SessionStart`.

> Dica: futuramente dá para automatizar os passos 2–4 com um script `scripts/regen-manifest.sh` ou um GitHub Action rodando no `push` para `main`.

---

## Estrutura do repo

```
.
├── agents/              # .md dos agents (source of truth)
├── commands/            # .md dos slash commands
├── bin/
│   └── ahc              # CLI Node zero-deps
├── manifest.json        # index com versão + sha256 por item (agents + commands)
├── install.sh           # bootstrap: instala ahc + configura hook
└── README.md
```

## Arquivos gerenciados na máquina do dev

```
~/.local/bin/ahc                   # binário da CLI
~/.claude/agents/*.md              # agents instalados
~/.claude/.ahc-config.json         # config (repo, branch, channel)
~/.claude/.ahc-lock.json           # lock com versão instalada e pins
~/.claude/settings.json            # contém o hook SessionStart
```

---

## Troubleshooting

**`ahc sync` retorna 404 / HTTP 401**
Repo é `INTERNAL`. Verifique se está logado na org com `gh auth status`. Se estiver usando `curl` direto, pode ser que o raw do GitHub não esteja enviando seu token — nesse caso, use `gh auth token` e exporte como header, ou migre o sync para `git clone --depth=1` (ver issue).

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
