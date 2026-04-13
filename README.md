# agents-hub-claude

Registry centralizado de **agents e commands do Claude Code** da EMS-NCTECH, com CLI própria (`ahc`) que sincroniza tudo automaticamente em cada máquina.

- **Fonte da verdade:** `manifest.json` com versão e `sha256` de cada agent
- **CLI:** `ahc` — Node zero-deps, distribuída via `install.sh`
- **Auto-update:** hook `SessionStart` do Claude Code roda `ahc sync` a cada sessão
- **Destino dos arquivos:** `~/.claude/agents/` (agents) e `~/.claude/commands/` (slash commands)

---

## Instalação

Requisitos: `node`, `git`, `curl` (ou `wget`) e `gh` autenticado na org EMS-NCTECH (o repo é `INTERNAL`).

```bash
curl -fsSL https://raw.githubusercontent.com/EMS-NCTECH/agents-hub-claude/main/install.sh | bash
```

O instalador:

1. Baixa o binário `ahc` para `~/.local/bin/ahc`
2. Cria `~/.claude/.ahc-config.json` apontando para este repo
3. Configura o hook `SessionStart` em `~/.claude/settings.json` (se ainda não existir)
4. Roda um primeiro `ahc sync`

Se `~/.local/bin` não estiver no seu `PATH`, adicione ao seu shell rc:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

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
| `/db-audit` | Auditoria de schema, índices, FKs, migrations, queries e segurança de banco |
| `/jira-story` | Redigir ou refinar user stories com critérios de aceite e cenários de teste |

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
