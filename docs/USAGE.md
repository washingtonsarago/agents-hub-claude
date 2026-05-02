# Guia de uso — Agents & Commands

Este guia mostra **o que cada agent/command faz**, **quando acionar**, e **exemplos prontos** (prompts) para obter o melhor resultado dentro do Claude Code.

> Dica geral: quanto mais contexto concreto (arquivo, linha, erro, stack, número de usuários, SLA, restrições), melhor o resultado. Agents são colegas seniores — briefing curto e específico > prompt genérico.

---

## Como acionar

- **Agents** rodam via Task/subagente. Normalmente basta descrever a tarefa e o Claude Code seleciona o agent correto pela `description`. Para forçar, mencione o nome: *"use o agent `postgres-dba` para..."*.
- **Commands** são slash commands. Digite `/<nome>` no prompt (ex.: `/code-review`, `/smart-commit`).
- Você pode **combinar**: abrir uma discovery com `/discovery`, gerar stories com `senior-product-owner`, implementar com `go-senior-engineer`, testar com `go-sdet-backend` e commitar com `/smart-commit`.

---

## Agents

### aws-devops-engineer
**O que faz:** IaC (Terraform/CloudFormation), CI/CD, EKS/ECS, observabilidade, hardening, FinOps na AWS.
**Quando usar:** desenhar infra nova, troubleshoot prod (OOM/5xx), revisar custo, DR multi-região, pipelines.
**Exemplos de prompt:**
- "Escreva um módulo Terraform para VPC com 3 AZs, subnets public/private/isolated, NAT gateway único para dev e um por AZ em prod. Região `sa-east-1`."
- "Nossa conta pulou de US$ 4k → US$ 6k/mês. Use o `aws-devops-engineer` para apontar os top 5 ofensores e sugerir ações reversíveis."
- "Pods do serviço `orders-api` no EKS estão sendo OOMKilled 3x/dia. Limits em 512Mi. Diagnostique e proponha fix."
- "Projete DR cross-region (us-east-1 → us-west-2) para RDS Postgres com RPO ≤ 5 min e RTO ≤ 30 min."

### cypress-qa-analyst
**O que faz:** estratégia de testes E2E, specs Cypress estáveis, integração CI, acessibilidade (axe).
**Quando usar:** depois de novo componente/fluxo, para estabilizar suíte flaky, revisar estratégia de teste.
**Exemplos:**
- "Escreva specs Cypress para o fluxo de login (`/login`) cobrindo: sucesso, senha errada, conta bloqueada, MFA. Use `cy.session` para isolar."
- "Nossa suíte no GitHub Actions falha ~20% por flake. Diagnostique causas e proponha fixes (sem `cy.wait` arbitrário)."
- "Adicione checagens axe-core em todas as páginas principais e falhe o build em `critical`/`serious`."

### dotnet-backend-architect
**O que faz:** C#/ASP.NET Core, DDD, Clean Architecture, CQRS com MediatR, EF Core, testes.
**Quando usar:** novo microsserviço .NET, revisão de bounded context, CQRS, invariants de aggregate.
**Exemplos:**
- "Crie um microsserviço `Orders` com DDD: aggregate `Order`, value objects `Money`, `Address`. Endpoints REST + handlers MediatR. EF Core + Postgres."
- "Revise `src/Inventory/Repository/ProductRepository.cs` — está vazando `IQueryable` pra fora do domínio. Proponha refactor."
- "Adicione pipeline behaviors no MediatR para: validation (FluentValidation), logging, transação por request."

### go-senior-engineer
**O que faz:** Go idiomático, concorrência segura, gRPC, performance, microservices.
**Quando usar:** implementar feature nova em Go, debugar data race, revisar handler, scaffold de serviço.
**Exemplos:**
- "Implemente um worker pool em `internal/worker/pool.go` que lê jobs de um channel, com graceful shutdown via `context.Context` e backpressure."
- "Tenho `go test -race` apontando data race em `internal/cache/cache.go:142`. Diagnostique e corrija sem usar `sync.Mutex` global se der."
- "Scaffold de um serviço gRPC `pricing` com health check, interceptors (logging, recovery, tracing OTel) e testes de integração."

### go-sdet-backend
**O que faz:** testes unit/integration/fuzz para Go, estratégia de coverage, análise de race.
**Quando usar:** após novo código Go, para cobrir edge cases, auditar suíte atual.
**Exemplos:**
- "Acabei de escrever `ParallelOrchestrate` em `internal/gateway/service/orchestrator.go`. Revise e escreva testes (unit + race + fuzz onde fizer sentido)."
- "Nosso coverage em `internal/transform/` está em 62%. Liste os gaps críticos e escreva os testes faltantes."

### nodejs-backend-architect
**O que faz:** Node.js TS-first — Fastify/Express/NestJS, Prisma/Drizzle, Zod, async patterns, observabilidade, testes.
**Quando usar:** novo serviço Node, revisão de handler/middleware, debug de event-loop bloqueado, migração JS→TS, decisão de framework.
**Exemplos:**
- "Scaffold um serviço Fastify pra `/orders` com Prisma + Postgres + validação Zod + integration tests."
- "Revise nosso middleware de auth em `src/middleware/auth.ts` — tipagem do `req.user` está como `any`."
- "Estamos com event loop bloqueado em prod (p99 = 8s). Diagnostique com clinic.js."
- "Express ou Fastify ou NestJS pro novo projeto? Squad de 5, foco em throughput."

### python-engineer
**O que faz:** Python idiomático e tipado — FastAPI/Django, Pydantic v2, async (asyncio/httpx), pytest + hypothesis, polars vs pandas, packaging (uv).
**Quando usar:** novo serviço/script Python, refactor pra type strict, perf (memória/CPU), testes property-based, escolha de stack.
**Exemplos:**
- "Crie um serviço FastAPI pra `/orders` com SQLAlchemy 2.x async + Pydantic v2 + Alembic + pytest."
- "Revise `src/payments/processor.py` — está difícil de testar e tem `try/except Exception` em 3 lugares."
- "Tenho um script que processa 5GB de CSV e estoura memória. Diagnostique e refatore (chunking ou polars)."
- "Adicione testes property-based com hypothesis pra `parse_invoice()`."

### integration-architect
**O que faz:** arquitetura event-driven, SQS/SNS/EventBridge/Kafka, CDC (Debezium), Step Functions, Airflow.
**Quando usar:** decidir padrão de integração, desenhar pipeline, desacoplar serviços, CDC.
**Exemplos:**
- "Precisamos replicar `orders` do Postgres pro Snowflake com latência < 1 min. Avalie Debezium+Kafka vs DMS e recomende."
- "Serviços `billing` e `notifications` estão acoplados via HTTP síncrono e cascata derruba ambos. Proponha desacoplamento event-driven."
- "SQS FIFO vs EventBridge para comunicação interna entre 6 serviços com ordering por `tenant_id`. Decida e justifique."

### postgres-dba
**O que faz:** tuning de query, EXPLAIN, índices, particionamento, replicação, backup/recovery, HA, autovacuum.
**Quando usar:** query lenta, bloat, escolha de índice, design de schema time-series, replicação.
**Exemplos:**
- "Essa query leva 8s em prod: `SELECT ... FROM orders o JOIN customers c ...` (cole o SQL completo + EXPLAIN ANALYZE). Otimize."
- "Preciso armazenar 10M leituras de sensores/dia consultadas por `(device_id, ts range)`. Desenhe schema + particionamento."
- "Autovacuum não dá conta de `public.events` (bloat 40%). Diagnostique e tune parâmetros."

### project-memory-keeper
**O que faz:** mantém o **trio de memória do projeto** (`.claude/memory/business.md`, `architecture.md`, `guidelines.md`), além de README, CONTEXT.md e ADRs. Sintetiza o projeto pra outros agents.
**Quando usar:** após refactor grande, novo módulo, mudança arquitetural, decisão de domínio, vuln remediada, ou para gerar um snapshot do projeto.
**Exemplos:**
- "Adicionei `src/payments/` com integração Stripe. Atualize `architecture.md` (nova integração + trust boundary), `business.md` (regra de cobrança) e o README global."
- "Migramos de REST pra GraphQL no `api-gateway`. Escreva o ADR e propague em `architecture.md`."
- "Dê um sumário executivo do projeto atual (lê o trio + ADRs)."

### security-specialist
**O que faz:** AppSec/DevSecOps — threat modeling STRIDE, audit OWASP Top 10 + CWE Top 25, secret scanning, audit de CVE em dependências, validação de configuração, e **release-gate** explícito.
**Quando usar:** revisão de PR que toca surface sensível (auth, secrets, PII, payments, upload, deserialization, raw SQL, multi-tenant), threat-model proativo durante design, decisão de gate antes de release.
**Exemplos:**
- "Audite o PR #142 — toca login e geração de token. Quero verdict + STRIDE."
- "Vou expor endpoint público de upload de imagem. Faça threat-model **antes** de implementar."
- "Posso liberar o release? Já passou code-review e QA."
- "Escaneia secrets no repo todo + CVEs nas deps de produção do serviço orders."

### senior-product-owner
**O que faz:** user stories INVEST, critérios de aceite (Gherkin), RICE/MoSCoW, OKRs, métricas.
**Quando usar:** traduzir requisito ambíguo em backlog acionável, priorizar, definir sucesso.
**Exemplos:**
- "Quebre este pedido — 'queremos checkout mais rápido' — em stories INVEST com critérios de aceite Gherkin."
- "Priorize estes 15 itens do backlog para o próximo trimestre usando RICE. Contexto: squad de 4 devs, foco em retenção."
- "Defina métricas de sucesso (north star + guardrails) para o redesign do onboarding."

### senior-react-developer
**O que faz:** React tipado, acessível, performático, state management, RTL tests.
**Quando usar:** novo componente, bug de re-render, escolha de state, testes de comportamento.
**Exemplos:**
- "Crie um `<Modal>` reutilizável, acessível (focus trap, ESC, aria), com TS genérico no `onConfirm`."
- "`<ProductList>` re-renderiza 30x ao digitar no filtro. Diagnostique e corrija — sem memoização cega."
- "Zustand vs Context para o estado do carrinho? Analise trade-offs considerando SSR (Next 14 App Router)."

### system-architect
**O que faz:** decisões arquiteturais, ADRs, C4, análise de trade-offs, review de design.
**Quando usar:** design de sistema novo, monolito vs microsserviço, ADR, review de escalabilidade.
**Exemplos:**
- "Desenhe um sistema de pagamentos para 10k tps com idempotência forte e reconciliação diária. Proponha 2 opções e compare."
- "Escreva um ADR para nossa decisão de adotar event-driven entre `orders` e `billing` usando EventBridge."
- "Review do desenho anexo (C4 Container) — aponte riscos de escalabilidade e pontos únicos de falha."

---

## Commands (slash)

### `/api-contract`
Gera ou valida contratos de API (OpenAPI/AsyncAPI).
**Exemplo:** `/api-contract gerar OpenAPI 3.1 para o recurso /orders com CRUD, paginação cursor e erros RFC 7807`

### `/arch-design`
Facilita design arquitetural — C4, ADR, trade-offs.
**Exemplo:** `/arch-design sistema de notificações multi-canal (email/SMS/push) com 500 msg/s e retry com DLQ`

### `/bootstrap-project`
Escaneia o repo, detecta stack e cria a memória canônica do projeto: `.claude/memory/{business,architecture,guidelines}.md` + `docs/{adr,todo,done}/`. Roda **uma vez por repo**, na primeira instalação ou se a memória foi perdida.
**Exemplo:** `/bootstrap-project` (na raiz do repo, sem argumento — ele detecta sozinho)

### `/bug-flow`
Orquestra um bug ponta-a-ponta: triage → RCA → fix + teste de regressão → security gate (se necessário) → review → commit. Cria `docs/todo/<NNN>-<nome>/bug.md` e move pra `docs/done/` quando fecha. Toda fix sai com regression test que falha sem o fix.
**Exemplo:** `/bug-flow autovacuum não roda em public.events e bloat passou de 40% — ver thread no Slack #db`

### `/code-review`
Revisão profunda de diff/PR: segurança, correção, performance, testes.
**Exemplo:** `/code-review` (com staged diff) ou `/code-review PR #142`

### `/db-audit`
Auditoria de schema, índices, FKs, migrations e segurança de banco.
**Exemplo:** `/db-audit schema public do Postgres do serviço orders — foco em índices ausentes e FKs`

### `/discovery`
Facilitador de product discovery — problem framing, JTBD, assumptions, experimentos, go/no-go.
**Exemplo:** `/discovery queremos reduzir churn em contas SMB — ajude a estruturar a investigação`

### `/feature-flow`
Orquestra uma feature ponta-a-ponta com gates: PO (refinement) → Arquiteto (feasibility + ADR) → Security (threat-model se tocar surface sensível) → Dev (stack-aware) → QA → Security gate → `/code-review` → memory sync → `/smart-commit`. Cria `docs/todo/<NNN>-<nome>/task.md` e move pra `docs/done/` quando fecha.
**Exemplo:** `/feature-flow checkout em uma página com salvamento de cartão tokenizado pra clientes recorrentes`

### `/jira-story`
Escreve/refina user stories com AC e cenários de teste.
**Exemplo:** `/jira-story como cliente, quero salvar endereços favoritos para checkout rápido`

### `/onboard-dev`
Gera um `ONBOARDING.md` completo do projeto atual.
**Exemplo:** `/onboard-dev` (rode na raiz do repo)

### `/smart-commit`
Analisa o diff staged e cria um Conventional Commit com type/scope corretos.
**Exemplo:** `git add -p && /smart-commit`

### `/tech-debt`
Escaneia e classifica dívida técnica com plano de ação priorizado.
**Exemplo:** `/tech-debt foco em internal/gateway/ — risco vs esforço`

---

## Memória canônica do projeto

A partir do `project-memory-keeper@3.0.0`, todo agent espera encontrar três arquivos no projeto:

```
.claude/
└── memory/
    ├── business.md       # domínio, glossário, regras, permissões, JTBD, escopo
    ├── architecture.md   # stack, NFRs, integrações, trust boundaries, threat models, security controls
    └── guidelines.md     # convenções de código deste repo, anti-patterns banidos, vulns remediadas, tom
```

- Crie com `/bootstrap-project` na raiz do repo (uma vez).
- Mantenha com `project-memory-keeper` (sob demanda) ou via os fluxos `/feature-flow` e `/bug-flow` (automático).
- Versione com o repo. **Não** vai pro `~/.claude/` global — é por projeto.

> Routing rule: o que o produto faz e pra quem → `business.md`. Como o sistema é construído e roda → `architecture.md`. Como o time escreve código neste repo → `guidelines.md`.

---

## Fluxos combinados (receitas)

> **Atalho:** para feature/bug com gates explícitos, use direto `/feature-flow` e `/bug-flow` — eles encadeiam tudo abaixo.

**Nova feature ponta-a-ponta (manual, sem `/feature-flow`):**
1. `/discovery` → valida problema
2. `senior-product-owner` → stories + AC
3. `system-architect` → ADR + design
4. `security-specialist` → threat-model (se tocar surface sensível)
5. `go-senior-engineer` (ou stack equivalente) → implementação
6. `go-sdet-backend` → testes + fuzz
7. `security-specialist` → release gate
8. `/code-review` → revisão
9. `project-memory-keeper` → sync `architecture.md` / `guidelines.md` / ADR
10. `/smart-commit` → commit

**Bug ponta-a-ponta (manual, sem `/bug-flow`):**
1. `go-senior-engineer` (ou stack equivalente) → triage + RCA
2. mesmo dev → fix + teste de regressão
3. `go-sdet-backend` → valida regressão + smoke adjacente
4. `security-specialist` → audit do diff (se surface sensível)
5. `/code-review` → revisão
6. `project-memory-keeper` → registra anti-pattern em `guidelines.md` (se nova classe de bug)
7. `/smart-commit` → commit (`fix:`)

**Incidente de performance em Postgres:**
1. `postgres-dba` → diagnóstico com EXPLAIN ANALYZE
2. `/db-audit` → auditoria completa do schema afetado
3. `aws-devops-engineer` → ajuste de instância/parâmetros se necessário

**Frontend novo no monorepo:**
1. `senior-react-developer` → componente + testes RTL
2. `cypress-qa-analyst` → E2E do fluxo
3. `/code-review` → revisão
4. `project-memory-keeper` → atualiza docs

**Decisão de release (gate):**
1. `security-specialist` → verdict (APPROVE / APPROVE WITH MITIGATIONS / BLOCK)
2. Se BLOCK → loop ao dev com a finding específica.
3. Se APPROVE → `/smart-commit` final + tag.

---

## Boas práticas de prompt

- **Contexto primeiro, pedido depois.** *"Stack: Go 1.22, Postgres 15, k8s. Problema: latência p99 subiu de 80ms pra 400ms após deploy de ontem. Objetivo: voltar pra 80ms sem reverter o deploy."*
- **Cole trechos relevantes** (SQL, stack trace, EXPLAIN, log). Não faça o agent adivinhar.
- **Peça trade-offs explícitos** quando existirem múltiplas soluções: *"proponha 2 opções com prós/contras"*.
- **Defina restrições:** prazo, budget, SLA, compat, equipe.
- **Quando não souber qual agent usar**, descreva a tarefa — o Claude Code escolhe pelo `description`.
