# Developer Onboarding Guide

Generate a comprehensive onboarding document for a new developer joining this project. Delegate to the `project-memory-keeper` agent when available to pull existing context.

## Context
$ARGUMENTS

## Instructions

### Step 1 — Project Discovery
Analyze the current project thoroughly:
- Read README.md, CLAUDE.md, any existing docs
- Identify the tech stack (language, framework, database, cache, messaging)
- Map the directory structure
- Find the entry points (main.go, Program.cs, etc.)
- Identify configuration files (env, appsettings, docker-compose)
- Check CI/CD pipelines (.github/workflows, Dockerfile)

### Step 2 — Generate Onboarding Guide

```markdown
# Onboarding do Dev — {project-name}

## Início rápido (rodar em 15 minutos)

### Pré-requisitos
- [ ] {linguagem/runtime} instalado (versão X.Y)
- [ ] Docker + Docker Compose
- [ ] {tool} instalado
- [ ] Acesso à org GitHub {org}
- [ ] VPN/credenciais pra {env}

### Setup
1. Clone: `git clone {repo-url}`
2. Instalar deps: `{install-command}`
3. Subir infra: `docker compose up -d`
4. Rodar migrations: `{migration-command}`
5. Subir app: `{run-command}`
6. Verificar: `curl http://localhost:{port}/health`

## Visão geral da arquitetura

### Stack
| Camada | Tecnologia |
|--------|-----------|
| Linguagem | ... |
| Framework | ... |
| Banco | ... |
| Cache | ... |
| Mensageria | ... |
| Auth | ... |

### Estrutura do projeto
{árvore comentada com descrição de cada pasta}

### Arquivos pra ler primeiro
1. `{file}` — {por que importa}
2. `{file}` — {por que importa}
3. `{file}` — {por que importa}

## Conceitos do domínio
{Explique o domínio de negócio em termos simples}
- **{Conceito A}**: o que é, como é modelado
- **{Conceito B}**: o que é, como é modelado

## Fluxos críticos
{Descreva os 3 fluxos mais importantes do sistema}

### Fluxo 1: {nome}
{Diagrama de sequência em Mermaid}

## Schema do banco
{Diagrama ER simplificado em Mermaid}

## Endpoints da API
| Método | Path | Descrição |
|--------|------|-----------|
| GET | /api/... | ... |

## Variáveis de ambiente
| Variável | Obrigatória | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| ... | Sim/Não | ... | ... |

## Fluxo de desenvolvimento
1. Crie branch a partir de `main`: `git checkout -b feat/XX-descricao`
2. Faça as mudanças
3. Rode os testes: `{test-command}`
4. Commit: siga Conventional Commits
5. Push e abra PR
6. Peça review do {reviewer}
7. Merge após CI passar

## Tarefas comuns
- **Adicionar um endpoint:** {onde colocar, padrão a seguir}
- **Adicionar uma migration:** {comando, convenção de nome}
- **Adicionar um teste:** {onde ficam os testes, como rodar}
- **Debug local:** {ferramentas, dicas}

## Troubleshooting
| Problema | Solução |
|----------|---------|
| "too many connections" | Verifique o pool size do DB no config |
| Testes dando timeout | Confira se o Docker da infra está rodando |
| Auth falha localmente | Verifique se o Keycloak está no :8080 |

## Contatos do time
| Papel | Nome | Quando perguntar |
|-------|------|------------------|
| Tech Lead | ... | Decisões de arquitetura |
| PO | ... | Requisitos, prioridades |
| DBA | ... | Mudanças de schema, queries |

## Links úteis
- Board do Jira: {url}
- Confluence: {url}
- Monitoring: {url}
- Staging: {url}
```

### Step 3 — Save
Save the guide as `docs/ONBOARDING.md` in the project root.

> Note: the template above is what gets written to the user's repo, so it stays in PT-BR. The instructions on this page (steps 1-3) remain in EN since they brief Claude.
