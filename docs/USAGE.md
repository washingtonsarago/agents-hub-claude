# Guia de uso — Agents & Commands

Este guia mostra **o que cada agent/command faz**, **quando acionar**, e **exemplos prontos** (prompts) para obter o melhor resultado dentro do Claude Code.

> Dica geral: quanto mais contexto concreto (arquivo, linha, erro, stack, número de usuários, SLA, restrições), melhor o resultado. Agents são colegas seniores — briefing curto e específico > prompt genérico.

---

## Como acionar

- **Agents** rodam via Task/subagente. Normalmente basta descrever a tarefa e o Claude Code seleciona o agent correto pela `description`. Para forçar, mencione o nome: *"use o agent `postgres-dba` para..."*.
- **Commands** são slash commands. Digite `/<nome>` no prompt (ex.: `/code-review`, `/smart-commit`).
- Você pode **combinar**: abrir uma discovery com `/discovery`, gerar stories com `senior-product-owner`, implementar com `go-senior-engineer`, testar com `go-sdet-backend` e commitar com `/smart-commit`.

### Descobrindo agents por time

Cada agent declara seu **time primário** (`team` na frontmatter). Use no terminal:

```bash
ahc list                              # mostra todos os agents agrupados por time
ahc list --team=backend               # filtra um time
ahc list --team=backend,data,devops   # filtra múltiplos times
```

Times disponíveis: `backend`, `frontend`, `data`, `devops`, `integration`, `architecture`, `security`, `qa`, `product`, `docs`, `meta`.

> **Quando usar dentro do Claude Code:** se você sabe que precisa de "alguém de data", peça *"use um agent do time `data`"* — o Claude resolve entre `postgres-dba` e `cache-search-engineer` pela natureza do problema (relacional vs cache/search).

---

## Agents

> Lista agrupada por **time** (mesma ordem do `ahc list`). Para o detalhe de cada um, role pra baixo.

### backend
| Agent | Foco |
|---|---|
| [`dotnet-backend-architect`](#dotnet-backend-architect) | C#/ASP.NET Core, DDD, CQRS |
| [`go-senior-engineer`](#go-senior-engineer) | Go, concorrência, gRPC |
| [`nodejs-backend-architect`](#nodejs-backend-architect) | Node.js TS-first |
| [`python-engineer`](#python-engineer) | Python idiomático e tipado |

### frontend
| Agent | Foco |
|---|---|
| [`senior-react-developer`](#senior-react-developer) | React, hooks, a11y |

### data
| Agent | Foco |
|---|---|
| [`cache-search-engineer`](#cache-search-engineer) | Redis/ElastiCache + Elasticsearch/OpenSearch |
| [`postgres-dba`](#postgres-dba) | PostgreSQL DBA |

### devops
| Agent | Foco |
|---|---|
| [`aws-devops-engineer`](#aws-devops-engineer) | AWS, CI/CD, Terraform, EKS |
| [`infra-cost-estimator`](#infra-cost-estimator) | TCO, FinOps, build-vs-buy |

### integration · architecture · security
| Agent | Foco |
|---|---|
| [`integration-architect`](#integration-architect) | Event-driven, CDC, orchestration |
| [`system-architect`](#system-architect) | ADRs, C4, trade-offs |
| [`security-specialist`](#security-specialist) | OWASP, STRIDE, release-gate |

### qa · product · docs · meta
| Agent | Foco |
|---|---|
| [`cypress-qa-analyst`](#cypress-qa-analyst) | Cypress E2E |
| [`mobile-qa-analyst`](#mobile-qa-analyst) | E2E mobile com Maestro (Flutter/React Native/nativo) |
| [`go-sdet-backend`](#go-sdet-backend) | Go SDET |
| [`senior-product-owner`](#senior-product-owner) | User stories, OKRs |
| [`senior-product-designer`](#senior-product-designer) | UX strategy, IA, a11y |
| [`technical-writer`](#technical-writer) | Docs end-user (Diátaxis) |
| [`project-memory-keeper`](#project-memory-keeper) | Trio de memória + ADRs |
| [`change-reviewer`](#change-reviewer) | Gate do `/flow-lite` e review com as regras/perfil dele |

---

### aws-devops-engineer
**O que faz:** IaC (Terraform/CloudFormation), CI/CD, EKS/ECS, observabilidade, hardening, FinOps na AWS.
**Quando usar:** desenhar infra nova, troubleshoot prod (OOM/5xx), revisar custo, DR multi-região, pipelines.
**Exemplos de prompt:**
- "Escreva um módulo Terraform para VPC com 3 AZs, subnets public/private/isolated, NAT gateway único para dev e um por AZ em prod. Região `sa-east-1`."
- "Nossa conta pulou de US$ 4k → US$ 6k/mês. Use o `aws-devops-engineer` para apontar os top 5 ofensores e sugerir ações reversíveis."
- "Pods do serviço `orders-api` no EKS estão sendo OOMKilled 3x/dia. Limits em 512Mi. Diagnostique e proponha fix."
- "Projete DR cross-region (us-east-1 → us-west-2) para RDS Postgres com RPO ≤ 5 min e RTO ≤ 30 min."

### cache-search-engineer
**O que faz:** estratégia de cache (Redis/Memcached/ElastiCache) e search (Elasticsearch/OpenSearch) — patterns de cache, invalidação, stampede protection, hot-key, mapping/analyzer, relevance tuning, sharding/replicas, latência de query.
**Quando usar:** hit-ratio degradado, decisão de invalidação, stampede pós-Black-Friday, design de busca com sinônimos/relevância, mapping explosion.
**Exemplos:**
- "Nosso Redis está com hit-ratio em 60% e p99 do app degradou. Diagnostique key design, TTLs, eviction policy e proponha fixes."
- "Implementar busca de produtos com sinônimos e relevância tunada — desenhe mapping Elasticsearch, analyzers, query DSL e como medir relevance."
- "Cache stampede derrubou o serviço de listagem na Black Friday. Proponha mitigações (request coalescing, probabilistic early expiration, lock)."
- "Estratégia de invalidação para o catálogo: TTL, event-based ou versioning? Faça trade-off consistência × complexidade."
- "Nosso índice Elasticsearch tem 2k campos e queries lentas. Diagnostique mapping explosion + ILM + sharding."

### cypress-qa-analyst
**O que faz:** estratégia de testes E2E, specs Cypress estáveis, integração CI, acessibilidade (axe).
**Quando usar:** depois de novo componente/fluxo, para estabilizar suíte flaky, revisar estratégia de teste.
**Exemplos:**
- "Escreva specs Cypress para o fluxo de login (`/login`) cobrindo: sucesso, senha errada, conta bloqueada, MFA. Use `cy.session` para isolar."
- "Nossa suíte no GitHub Actions falha ~20% por flake. Diagnostique causas e proponha fixes (sem `cy.wait` arbitrário)."
- "Adicione checagens axe-core em todas as páginas principais e falhe o build em `critical`/`serious`."

### mobile-qa-analyst
**O que faz:** testes E2E de apps mobile (Flutter, React Native, Android/iOS nativo) com Maestro — flows YAML, seletor por stack (`Semantics(identifier:)`, `testID`, `resource-id`, `accessibilityIdentifier`), matriz de rastreabilidade AC → flow, e o encaminhamento pra `integration_test`/Patrol quando o cenário precisa de acesso ao código (mock, estado injetado, platform channel).
**Quando usar:** depois de uma feature mobile pronta, pra provar em device (emulador Android ou simulador iOS) que um fluxo funciona, ou pra deixar o flow escrito mesmo sem device disponível agora.
**Exemplos:**
- Pedido: "Escreva e rode o flow Maestro de login do app Flutter (`com.example.app`) no emulador Android." Entrega: `.maestro/login.yaml` usando `Semantics(identifier:)`, a execução com `MAESTRO_CLI_NO_ANALYTICS=true maestro test`, e a matriz AC → flow com status `executado: passou`, comando e exit code citados.
- Pedido: "Prove o checkout com Pix no app React Native, no simulador iOS." Sem simulador *booted*, a entrega é o flow `.maestro/checkout.yaml` já escrito (seletor `testID`) e o status `NÃO EXECUTADO: no booted simulator` na matriz — o agent nunca declara um flow como passou sem execução real, e esse status não vale como prova de RED no gate do `/flow`.

**Instalação segura do Maestro:** no macOS, `brew tap mobile-dev-inc/tap` e depois `brew install mobile-dev-inc/tap/maestro` (o nome qualificado já tapeia se o tap faltar) — nunca o pacote curto `maestro`, que resolve pra um cask diferente. Fora do Homebrew ou em CI, o agent baixa uma versão pinada (nunca a mais recente) e confere o checksum SHA-256 antes de descompactar. `MAESTRO_CLI_NO_ANALYTICS=true` fica sempre exportado. O agent não instala Maestro, SDK ou driver de device por conta própria, e nunca sem o dev pedir explicitamente.

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

### infra-cost-estimator
**O que faz:** modela **antes** de provisionar — TCO em 3 anos, comparação de cenários (low/expected/peak), sensitivity analysis, unit economics, build-vs-buy. Cita fonte e snapshot date de cada preço.
**Quando usar:** decisão de stack/serviço com impacto em conta cloud, dimensionamento pra carga prevista, atribuição de gasto que estourou, migração on-prem → cloud, justificativa de Reserved/Savings Plans.
**Exemplos:**
- "Quanto custaria rodar nosso microsserviço de pedidos em ECS Fargate vs EKS vs Lambda? 200 req/s sustained, picos 1k req/s 2x/dia, payload 4KB."
- "Estimativa mensal pra suportar 50k MAU com pico de 2k req/s — sizing de compute, storage, egress, e budget low/expected/peak."
- "Conta AWS subiu 40%. Atribua o gasto, proponha 3 ações pra cortar 20% e quantifique risco de cada uma vs SLO atual."
- "Build vs buy: Postgres self-hosted no EKS ou RDS Aurora? TCO 3 anos incluindo ops effort e downtime cost."
- "Migrar nosso ETL on-prem pra cloud (mensal: 8TB processados). Modelo TCO 3 anos com break-even + cenários conservador/realista/agressivo."

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

### change-reviewer
**O que faz:** julga uma mudança de código em dois modos. Em **`gate`** (síncrono, último passo antes do commit) recebe o `gate-context.json` escrito pelo `gate.js prepare` e devolve achados em JSON que **decidem se o commit acontece**. Em **`pr`** (assíncrono) revisa um PR aberto num único comentário atualizado no lugar.
**O que NÃO faz:** ele **só julga** — não corrige, não edita, não roda git e não decide o exit code. Quem calcula o veredito é a metade determinística, a skill de mesmo nome. **Não é revisor genérico de PR:** pedido de revisão que não cita o `/flow-lite`, o gate, o perfil ou as regras deste reviewer vai para `/code-review` ou para o agent genérico. Essa separação é o desenho: o julgamento precisa de leitura, a decisão precisa ser mecânica.
**Por que existe:** os dois modos de falha da implementação assistida — **inflação** (subsistema que o item não pediu, duplicado em versões divergentes, teste que triplica o código) e **desonestidade silenciosa** (entregar como completo o que o modelo de dados não sustenta, inferindo o dado que falta em vez de declarar a limitação).
**Quando usar:** o [`/flow-lite`](#flow-lite) o aciona sozinho, em modo `gate`, **antes de cada commit** — é o uso principal e você não precisa fazer nada. Na mão, só quando você quer as regras e o perfil deste reviewer aplicados a um PR aberto ou a um diff de que desconfia.
**Exemplos:**
- "Revisa o PR #42 com as regras do change-reviewer." → modo `pr`, um comentário só
- "Roda o gate do change-reviewer: esse diff é honesto sobre o que o modelo de dados sustenta?" → modo `gate` contra a worktree atual
- "Roda o review de cadência do change-reviewer, com o perfil do time, nos PRs abertos." → modo `pr`, um comentário por PR

> Só `blocker` **confirmado** bloqueia: por schema, um achado com `confirmed: false` nunca é blocker. E as regras estruturais (`honesty`, `ownership`, `suite`, `secret`) não podem ser desligadas nem rebaixadas por `CLAUDE.md` nem por perfil.

### security-specialist
**O que faz:** AppSec/DevSecOps — threat modeling STRIDE, audit OWASP Top 10 + CWE Top 25, secret scanning, audit de CVE em dependências, validação de configuração, e **release-gate** explícito.
**Quando usar:** revisão de PR que toca surface sensível (auth, secrets, PII, payments, upload, deserialization, raw SQL, multi-tenant), threat-model proativo durante design, decisão de gate antes de release.
**Exemplos:**
- "Audite o PR #142 — toca login e geração de token. Quero verdict + STRIDE."
- "Vou expor endpoint público de upload de imagem. Faça threat-model **antes** de implementar."
- "Posso liberar o release? Já passou code-review e QA."
- "Escaneia secrets no repo todo + CVEs nas deps de produção do serviço orders."

### senior-product-designer
**O que faz:** UX strategy — discovery, IA, journey, heurísticas, a11y (WCAG 2.1 AA), design system, mensuração com HEART. Aplica Diátaxis ao próprio output: separa research / IA / interaction / visual.
**Quando usar:** vague request de "redesenha o dashboard", drop forte num passo de funil, heurística antes de implementar, journey map de onboarding, decisão modal vs panel vs página.
**Exemplos:**
- "Temos um pedido vago de 'novo dashboard de operações'. Faça discovery: quem é o usuário, qual job, qual métrica de sucesso, e proponha 2 direções com trade-offs."
- "Checkout drop 40% no passo 3 (revisão do pedido). Diagnostique com heurísticas + análise de fluxo e proponha alternativas."
- "Auditoria heurística (Nielsen 10) + WCAG 2.1 AA da tela `/orders/new`."
- "Journey map do onboarding com fases, emoções, dores, oportunidades."

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

### technical-writer
**O que faz:** documentação user-facing seguindo **Diátaxis** (tutorial / how-to / reference / explanation, nunca misturados). Polish de API reference, getting-started, migration guides, knowledge-base, README.
**Quando usar:** após API estabilizada (referência precisa ser humanizada), antes de release com breaking change (migration guide), onboarding externo (getting-started), README confuso pra dev de fora.
**Exemplos:**
- "Escreva o getting-started do nosso SDK público em Node.js — assume 0 contexto, exemplo copia-cola que roda em 5 min."
- "Reescreva nosso README — está confuso pra dev externo. Aplique Diátaxis."
- "Polir a referência da API `/orders` gerada pelo OpenAPI. Humanize descrições, adicione exemplos `curl` reais e error handling."
- "Migration guide da v1 → v2 do nosso client TS — mapa de breaking changes pra steps acionáveis."
- "Tutorial: integrar nosso webhook em 10 minutos."

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

> 📘 Gate a gate, com exemplo comentado e matriz de retorno: **[FLOWS.md](FLOWS.md)** · [PDF ilustrado](flows/guia-flow-bug-flow.pdf)

### `/code-review`
Revisão **multi-reviewer paralela** de diff/PR. O command classifica o diff (Go? SQL? React? Redis? IaC? UI?) e dispara em paralelo os specialistas aplicáveis (`system-architect` + `security-specialist` sempre, mais stack-specifics) — cada um revisa só pela sua lente. Diff de UI visível vai para `ux-designer-web` (web) ou `ux-designer-mobile` (Dart/Flutter, React Native, mobile nativo), não para o `senior-product-designer` — esse fica com copy/fluxo de produto sem mudança visual, e só quando nenhuma lente de UX de plataforma disparou. Refatoração sem mudança visível (hook, chamada de API, tipagem) não dispara UX. Em seguida agrega, deduplica achados sobrepostos e produz um relatório único com veredicto consolidado. Limita a 6 reviewers simultâneos por diff.

**Fail-closed quando falta revisor.** Um revisor que falhou, estourou o tempo ou devolveu saída sem `verdict:` válido conta como **lente faltante**. Com pelo menos uma lente faltante, o veredito geral nunca sai `APPROVED` nem `APPROVED WITH COMMENTS` — sai `INCOMPLETE`, e o relatório nomeia cada lente que faltou e o motivo. Vale também quando todos os revisores faltam.

**Verificação adversarial.** Antes do relatório final, todo achado `BLOCKER` e `WARNING` passa por uma tentativa de refutação contra o código (arquivo e linha citados); `INFO` não é verificado, por custo. Cada achado sai `confirmado`, `refutado` ou `inconclusivo` — `inconclusivo` mantém a severidade original, e um achado `refutado` sai da lista principal mas aparece numa seção própria do relatório com a evidência que o refutou. A verificação nunca rebaixa severidade sem prova.

**Modo revisor único** (`--single-reviewer <agent>`), usado pela faixa trivial do `/flow` e válido só quando o `task.md` da demanda registra a faixa trivial com a VERIFY concluída (fora disso, roda o modo completo); o revisor nunca é o `system-architect`. Pula a etapa de despacho paralelo, mas a agregação, o fail-closed e a verificação adversarial valem inteiros. A lente de segurança fica coberta pelo security gate da VERIFY do `/flow`, nunca pelo `/code-review` nesse modo — e o relatório declara isso.

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

### `/flow`
**Supersede o `/feature-flow`.** Mesma cadeia de entrega, com uma fase **GOAL** na frente: nada é construído sem uma métrica de sucesso com baseline e alvo, e toda fase seguinte tem que conseguir se amarrar nela. Sete fases numeradas: `GOAL → DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP` — mais duas intercaladas, a `0.5 · TRIAGE` (roda sempre, abaixo) e a `2.5 · SEC` (só se o PLAN marcar superfície sensível), que se encaixam entre as numeradas sem renumerá-las.

Se o `/discovery` não conseguir produzir métrica concreta, o flow **para** — é sinal de que ainda não dá pra especificar.

**Pré-triagem de clareza (`Phase 0.5 — TRIAGE`).** Entre o GOAL e o DEFINE o orquestrador pontua de 1 a 10 a clareza do *prompt* que abriu a demanda, por quatro eixos nomeados, e grava nota + justificativa por eixo na seção 0 do `task.md`. Nota **> 6** autoriza o DEFINE a fechar com **≤ 10 AC**, agrupando cenários relacionados; nota **≤ 6** roda o DEFINE como sempre. E quando a nota passa de 6 **e** a demanda toca superfície executável (`bin/ahc`, `scripts/`, `install.sh`, `mcp/`, ou `test/` quando o teste é o **objeto** da mudança e não só a prova dela), o PLAN ainda acrescenta um **bloco de performance com número** — orçamento ou medida. Demanda só de conteúdo (`.md`) acima do corte não ganha bloco nenhum. O gate da VERIFY não afrouxa em nenhum dos casos.

**Faixa trivial.** Mudança pequena não paga a cadeia inteira: as 8 fases continuam existindo, mas colapsadas, com no máximo 4 subagents obrigatórios (dev da stack no BUILD, `security-specialist` no security gate da VERIFY, e 1 revisor na REVIEW). Entra na faixa trivial quem cita, no `task.md`, que atende **todos** os cinco critérios: **F1** diff previsto em no máximo 1 arquivo de produção, **F2** nenhuma superfície sensível, **F3** nenhum contrato novo ou alterado, **F4** no máximo 3 AC e **F5** nenhum ADR. Critério sem citação conta como não atendido — a decisão é fail-closed, e fica registrada no pre-flight, antes da GOAL (que, na faixa trivial, é de uma linha, sem `/discovery`). **Superfície sensível exclui a faixa trivial sempre**, na entrada e em qualquer ponto do meio do flow, sem exceção: se algo invalidar um critério no meio do caminho, ou se a nota da TRIAGE ficar em 6 ou menos (abaixo do corte), o flow sai da faixa e retoma na faixa padrão a partir do DEFINE. A faixa trivial nunca remove o security gate da VERIFY. No SHIP, o sync de memória só é condicional na faixa trivial: roda quando a mudança altera algo que a memória descreve, senão o `task.md` registra `nada a sincronizar: <citação>`; a faixa padrão sempre sincroniza. A forma colapsada de cada fase, assim como o protocolo de peer sessions descrito abaixo, vivem em `skills/flow-playbook/` — texto de referência que só o próprio `/flow` lê sob demanda, não uma skill que você invoca ou que aparece autocarregada por palavra-chave.

**Status por fase e retomada.** Cada fase (GOAL, TRIAGE, DEFINE, PLAN, 2.5, BUILD, VERIFY, REVIEW, SHIP) tem status registrado na seção 0 do `task.md`, atualizado com data a cada gate. Um flow apontado para uma demanda com `task.md` existente não recomeça: retoma na primeira fase cujo status não é `concluída`, sem reexecutar as concluídas. Fase marcada `concluída` com a seção correspondente vazia conta como não concluída. Um loop-back para fase anterior volta a `pendente` o status das fases a jusante.

**Prova de RED, no gate da VERIFY.** Toda AC precisa de uma evidência reproduzível por terceiro de que o teste falha sem a mudança: a ref sem a mudança (sha alcançável da `main`), o comando exato, e o trecho da saída vermelha que nomeia o teste — registrado na seção 8 do `task.md`. "Falha sem a mudança" afirmado sem esse registro deixa o gate não verde, em qualquer faixa.

**Teto de passagens.** Os loops BUILD↔VERIFY e REVIEW→BUILD têm teto de 3 passagens sem ficar verde. Na 3ª passagem sem verde o flow para, marca a fase `bloqueada` e escala ao usuário com o achado que não fecha, as 3 tentativas e o que mudou em cada uma — nunca avança, nunca faz SHIP e nunca aceita "com ressalva" sem decisão explícita registrada. Uma volta que sobe para uma fase anterior reinicia a contagem; `NEEDS DISCUSSION` não consome passagem. O teto não torna o loop automático — a confirmação do usuário antes de cada nova tentativa continua valendo.

**Gatilho de UX.** Quando o plano toca arquivo de interface visível (componente, tela, widget, estilo, copy exibida), a Phase 2 (PLAN) consulta o agent de UX da plataforma **antes do BUILD** — `ux-designer-web` para front web, `ux-designer-mobile` para Dart/Flutter e mobile (React Native incluso), os dois quando a mudança toca as duas — cobrindo fluxo, estados (vazio, erro, carregando) e acessibilidade. O gatilho é fail-closed: sem citação de que nada visível muda, a UX é consultada. Refatoração sem mudança visível não dispara. Na faixa trivial não há consulta no PLAN; o agent de UX entra como o revisor único da REVIEW quando há UI visível.

**Consulta a sessões peer (opcional).** Quando o change mexe num contrato que outro repo consome, o `/flow` procura uma sessão do Claude Code aberta naquele repo e pergunta o que ele *de fato* consome hoje. Um subagent aqui só consegue inferir; a sessão de lá pode ir ler o código.

Não há nada pra ativar: peer é qualquer sessão do Claude Code já aberta no outro repo — outro terminal, outra janela do IDE. Pode estar ociosa. Sem sessão aberta, o flow roda idêntico.

**Várias sessões no mesmo repo?** Acontece o tempo todo, e a armadilha é achar que são várias chances de acertar a resposta. O nome na lista carrega só o **nome da pasta**, então ele esconde qual de duas situações bem diferentes você está vendo:

- **Mesma pasta, várias sessões** — dividem um working tree só, um `.git`, uma branch. Veem arquivos idênticos. Perguntar pra segunda é perguntar pro mesmo disco duas vezes.
- **Worktrees ou clones diferentes com nome de pasta parecido** — árvores independentes, em branches diferentes, às vezes com HEAD destacado. Aí as respostas divergem de verdade.

As duas convivem no mesmo repo: rode `git worktree list` num serviço qualquer e é comum aparecerem três ou quatro (o Cursor cria sozinho).

Mas a falha que importa é comum às duas: **um peer responde a partir de um checkout, e checkout não é o que vai pra produção.** O working tree principal costuma estar na branch de feature da pessoa. Perguntar "o que seu repo consome hoje" devolve resposta verdadeira sobre uma branch que talvez nunca mergeie — sem nada na resposta avisando disso.

Por isso o `/flow` escolhe uma sessão por repo e **ancora a pergunta num ref** (`origin/main`), exigindo que a resposta cite o ref e o sha lidos. Com a pergunta ancorada, tanto faz quem atende e tanto faz em que branch a pessoa está — é isso que torna a consulta reproduzível em vez de uma enquete.

**E como ele sabe que a sessão é mesmo daquele repo?** O nome que aparece na lista vem do **nome da pasta**, não do repositório — pasta renomeada ou dois repos com nome parecido e a suposição quebra. Antes de perguntar qualquer coisa, o `/flow` manda um **handshake**: uma única mensagem pedindo remote, branch, sha do HEAD e se a tree está suja. Uma ida e volta, uma vez por sessão. Se o remote não bater, a sessão é descartada; se bater, a resposta fica registrada como procedência de tudo que vier dela depois.

A consulta é **sempre consultiva** — nunca segura um gate, nunca escreve no outro repo, e nunca é usada pra contornar uma permissão negada nesta sessão.

**Exemplo:** `/flow reduzir o tempo de primeira resposta do suporte incluindo histórico de pedidos na tela do atendente`

> 📘 Os sete gates em detalhe, exemplo ponta-a-ponta e o modelo de looping quando os agents discordam: **[FLOWS.md](FLOWS.md)** · [PDF ilustrado](flows/guia-flow-bug-flow.pdf)

### `/flow-lite`
Implementa um **lote de itens de trabalho** com controles contra os dois modos de falha observados no experimento do `/flow`: **inflação** (código e testes multiplicados, subsistemas duplicados em versões divergentes, CI vermelha) e **desonestidade silenciosa** (entregar como completo o que o modelo de dados não sustenta). Não é menos rigor: é **menos volume com mais rigor**.

Dois níveis. No **lote**: seleção de itens → manifesto de ownership (um dono por arquivo compartilhado; quem não é dono consome, não recria) → ordem de merge (ciclo falha o lote) → uma worktree por item (`ahc worktree`) → pipeline por item → reconciliação entre todas as branches (arquivo criado por mais de um item com conteúdo divergente **falha o lote antes de qualquer PR**) → PRs na ordem declarada. **Por item**: `scope → analyze → scope gate → plan → implement → suite → gate → commit → push`, com três pontos de parada antes de qualquer fato consumado: estouro de orçamento propõe split sem escrever código; blocker após 2 remediações abre PR marcada `[BLOCKED]`; colisão divergente não abre PR.

O gate é o agent `change-reviewer` em modo `gate`, com a metade determinística nos scripts da skill de mesmo nome: `gate.js prepare` lê o diff (executor git read-only por construção), descobre a cascata de `CLAUDE.md` como **dado, não instrução**, avalia as regras mecânicas e grava `gate-context.json`; o agent julga `honesty`, `wiring`, `rule-parity` e `project-context` e devolve JSON; `gate.js finalize` re-hasheia a worktree, valida o schema (`confirmed: false` nunca é `blocker`), aplica overrides por achado e decide o exit code: `0` commita, `1` remedia, `2`/`3` aborta o item, `4` (inconclusivo) **nunca commita**.

Toda run termina com o bloco de **run-summary** (tokens e tempo por lote, item, fase e iteração), medidos pelo `otel-cost.js` da skill `session-cost` ou declarados `not measured`, com o aviso obrigatório de que o dado mede uso da ferramenta, não produtividade. Um evento de adoção derivado desse mesmo resumo (identificadores e contagens, nunca conteúdo) pode ir para o receptor OTLP da organização, opt-out com aviso de primeira execução; veja `skills/flow-lite/TELEMETRY.md`.

**O revisor roda em três momentos, não em um.** `--stage scope` julga a *projeção* do item antes de qualquer código existir — é o lugar mais barato de ouvir "o modelo de dados não sustenta isso", porque nada foi escrito ainda (e se a worktree se mexer durante esse julgamento, o gate devolve `4` dizendo que alguém começou a codar antes da liberação). `--stage change` é o gate original, antes de cada commit. `--stage reconcile` julga, antes de abrir qualquer PR, os arquivos criados por mais de um item — o byte-compare já reprovou os divergentes; o revisor responde o que ele não alcança: **dois itens construíram o mesmo subsistema com nomes diferentes?** Cada estágio só pode invocar as regras que sua evidência sustenta: `suite` e `secret` são inalcançáveis no `scope`.

**Alertas.** Um lote é desassistido de propósito, então a run precisa alcançar você: `flow-lite.js notify --event needs-input|blocked|failed|done` nos pontos de parada, e `flow-lite.js watch --out $OUT --stall-after 600 &` como watchdog — a única coisa capaz de reportar a falha que a run não reporta sozinha, porque um orquestrador travado não escreve nada. Banner no stderr + bell + notificador do SO (`osascript`, `notify-send`, beep no Windows); **nunca no stdout**, que carrega o run-summary. Desliga com `--no-notify` ou `FLOW_LITE_NOTIFY=off`, e já vem desligado em CI.

**Primeira run de um time novo é obrigatoriamente `--report-only`.** Guia de adoção (em inglês, porque é distribuído): `skills/change-reviewer/ADOPTION.md`. Quem vem do nome antigo: veja a nota de migração no README (seção *Instalar o `/flow-lite`*).

**Exemplo:** `/flow-lite ABC-1247 ABC-1250 ABC-1251 --base-ref origin/main --report-only`

### `/autonomo`
Cria um **agent autônomo**: escreve a spec em `autonomous/<nome>.md`, registra no manifest, valida e arma a rotina agendada na nuvem. Veja a seção [Agents autônomos](#agents-autônomos) abaixo.
**Exemplo:** `/autonomo toda segunda de manhã, roda /tech-debt na main e abre issue com os 3 itens de maior risco`

### `/incident-response`
Orquestra incidente em produção com prioridade na **mitigação** antes de RCA: detect → triage + blast radius → mitigation (flag/rollback/redirect) → RCA específica → fix permanente (`/bug-flow` ou `/feature-flow`) → postmortem blameless → memory sync. Cria `docs/incidents/INC-NNN-<nome>/incident.md` com timeline UTC obrigatória. Severities SEV-1 a SEV-4.
**Exemplo:** `/incident-response checkout retornando 500 pra ~30% dos clientes desde 14:20 UTC, alerta latency-p99-checkout disparou`

### `/jira-story`
Escreve/refina user stories com AC e cenários de teste.
**Exemplo:** `/jira-story como cliente, quero salvar endereços favoritos para checkout rápido`

### `/memory-query`
Lookup de alta precisão na memória do projeto. Lê o trio (`.claude/memory/business.md`, `architecture.md`, `guidelines.md`) e devolve **o trecho exato** com citação `arquivo § seção`, em vez de paráfrase. Sem argumento entra em modo browse (índice das 3 memórias).
**Exemplos:**
- `/memory-query qual é a política de retenção de PII?`
- `/memory-query como tratamos optimistic concurrency em escrita?`
- `/memory-query` (sem argumento — mostra o índice da memória)

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

## Agents autônomos

Agents que rodam **sozinhos**, num horário fixo, sem ninguém acionar. Cada um é uma spec em `autonomous/<nome>.md` — a quarta categoria do hub.

A spec declara tudo que a rotina precisa: cron (em UTC), repo, modelo, ferramentas, orçamento de tokens, o prompt que ela recebe, e o `routine_id` quando armada.

### Criar

```
/autonomo toda manhã de dia útil, revisa os PRs abertos e me avisa no Slack só se algo mudou
```

O comando pergunta só o que faltar, converte o horário pra UTC, escreve a spec, roda o validator, arma a rotina e grava o `routine_id` de volta no arquivo.

### Ver o que está no ar

```bash
ahc autonomous list
```

```
1 autonomous agent(s) in ~/.claude/autonomous/

  armado   pr-sentinel              read-only  cron(UTC): 7 12 * * 1-5
           https://claude.ai/code/routines/trig_...

1 armado(s), 0 so especificacao.
```

### As duas regras que todo autônomo segue

**Read-only por padrão.** Bom agent autônomo comenta e sugere; ação irreversível exige humano. Pra autorizar escrita, a spec precisa declarar `mode: write` **e** `approved_by: <nome>` — o validator rejeita um sem o outro. O atrito é de propósito.

**Condição de silêncio obrigatória.** Toda spec declara o que faz o agent *não* produzir nada. Sem isso ele vira ruído diário que o time aprende a ignorar — foi exatamente o que aconteceu com o PR review antes desta categoria existir.

### Por que não usar o `/schedule` nativo

Ele cria a rotina só na conta de quem rodou: não versionada, sem review, invisível pro resto do time e sem ninguém sabendo como desligar. Passando pelo hub, "o que roda sozinho em nome da engenharia" vira pergunta com resposta auditável.

O primeiro do time é o `pr-sentinel` — vigia os PRs do hub em dias úteis de manhã.

---

## Skills

Skills do Claude Code são auto-carregadas pelo Claude quando o contexto/keywords da conversa fazem match com a `description` da skill (não precisa ser invocada com `/`). Distribuídas via `ahc sync` em `~/.claude/skills/<nome>/`.

### `architecture-diagram`
**O que faz:** gera diagramas de arquitetura em **PNG** (estilo Linear/Vercel) com matplotlib — cards com sombra suave, barra de acento por camada, paleta moderna (indigo/cyan/emerald/fuchsia/violet/amber/red/slate), setas curvas com badge.
**Quando aciona automaticamente:** quando você pede "diagrama", "imagem", "PNG", "desenho", "esquema visual", "ilustração" da arquitetura/sistema/fluxo/infraestrutura/componentes.
**Exemplos:**
- "Desenha um PNG da arquitetura do gateway com gateway → service → repository → postgres."
- "Gera um diagrama do pipeline de ingestão (kafka → debezium → snowflake)."
- "Tema escuro do diagrama anterior, por favor."

### `sequence-diagram`
**O que faz:** gera diagramas de sequência (UML-ish) em **PNG** — participantes verticais com lifelines pontilhadas, mensagens horizontais com label em badge, blocos `opt`/`alt`/`loop`/`par`, notas. Sync solidas, async tracejadas, erro vermelho. Mesma família visual da `architecture-diagram`.
**Quando aciona automaticamente:** quando você pede "diagrama de sequência", "fluxo de request", "como o serviço A chama o B", "sequence diagram", "fluxo do webhook/saga/checkout".
**Exemplos:**
- "Desenha o fluxo de payment: customer → gateway → payment-service → stripe → webhook → notif → email."
- "Sequence diagram do handshake gRPC com `auth + tracing` interceptors."
- "Mostra o saga de criação de pedido com compensação no caso de pagamento recusado."

### `er-diagram`
**O que faz:** gera diagramas Entity-Relationship em **PNG** a partir de schema SQL/DDL/migration ou descrição textual. Cada tabela vira card com header colorido (cor por bounded context), linhas de coluna com tipo + pílulas de constraint (PK/FK/UQ/NN/IX), relações com multiplicidade nas pontas (1:1, 1:N, N:1, M:N).
**Quando aciona automaticamente:** "diagrama ER", "diagrama de schema", "diagrama de banco", "como se relacionam essas tabelas", "modelagem visual do banco".
**Exemplos:**
- "Lê `migrations/001_init.sql` e gera o ER do schema."
- "Desenha o ER só do bounded context de payments."
- "Visualiza o schema mostrando indexes secundários como pílulas IX."

### `release-notes`
**O que faz:** gera release notes estruturadas em **Markdown** (e PDF via `pandoc + xelatex` se disponível) — header com versão/data/manager, summary, breaking changes com migration steps, security fixes (com severity), features (heading H3), improvements/fixes (bullets), deprecations (tabela), contributors. Voz ativa, sem `we`, codigo em backticks, datas ISO 8601.
**Quando aciona automaticamente:** "release notes", "release notes da v2.5", "compila as PRs do sprint em release notes", "gera o PDF de release", "changelog estruturado".
**Exemplos:**
- "Gera release notes pra v2.5.0. Features: webhooks de pagamento, bulk export. Breaking: removi `/reports/v1`. Fixes: race no cache, memory leak em jobs."
- "Compila as PRs mergeadas desde v2.4.3 em release notes formato customer-facing."
- "Versão concise pra email interno."

### `change-reviewer` e `flow-lite`

> ⚠️ **`change-reviewer` são duas coisas com o mesmo nome:** esta **skill** (metade determinística — scripts, perfis, schema) e o **[agent homônimo](#change-reviewer)** (metade de julgamento, modos `gate` e `pr`). O gate só fecha com o par: o script lê o diff e calcula o veredito, o agent julga honestidade e fiação. Nenhum dos dois sozinho é o revisor.

**O que fazem:** são a metade determinística do `/flow-lite`. `change-reviewer/scripts/gate.js` lê o diff de uma worktree contra um ref (só subcomandos git de leitura existem no executor), descobre a cascata de `CLAUDE.md`, avalia regras mecânicas (`ownership`, `suite`, `secret`, `scope`, proibições do projeto), valida os achados do agent contra o schema e grava `gate.json` e `gate.md` com o exit code do contrato. `flow-lite/scripts/flow-lite.js` valida o manifesto de ownership, calcula a ordem de merge, reconcilia arquivos criados por mais de um item, mantém o ledger de fases e imprime o run-summary com a telemetria de adoção.
**Quando acionam:** pelo `/flow-lite`, ou direto na mão para um time que quer só o gate em `--report-only`:
```sh
node ~/.claude/skills/change-reviewer/scripts/gate.js run --worktree . --base-ref origin/main --item TRIAL-1 --out .flow-lite/trial --report-only
```
**Perfis:** `skills/change-reviewer/profiles/default.json` e `regulated.json` (exemplo com tracker obrigatório, regras de domínio e segundo aprovador para overrides). Um perfil pode criar regras e elevar severidade; nunca rebaixar regra do núcleo, e um teste garante isso. O repo aponta o perfil com `.change-reviewer.json` na raiz; o arquivo com o nome legado `.emstech-reviewer.json` continua aceito (se os dois existirem, o novo vence e o gate avisa).

> Skills usam `~/.claude/skills/<nome>/SKILL.md` + arquivos auxiliares (templates, scripts). O `ahc sync` baixa a árvore completa.

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

**Incidente de performance em cache/search (Redis ou Elasticsearch):**
1. `cache-search-engineer` → diagnóstico (hit-ratio, eviction, stampede, mapping, sharding)
2. `aws-devops-engineer` → tuning de instância/cluster (ElastiCache/OpenSearch managed) se necessário
3. `system-architect` → decisão estrutural se cache/search vira gargalo arquitetural

**Decisão build-vs-buy ou novo serviço cloud:**
1. `system-architect` → opções arquiteturais com trade-offs
2. `infra-cost-estimator` → TCO 3 anos por opção, sensitivity analysis, unit economics
3. `aws-devops-engineer` → uma vez decidido, IaC + observability + autoscaling

**Documentação user-facing pra release público:**
1. `technical-writer` → getting-started + reference + migration guide (Diátaxis)
2. `release-notes` (skill) → release notes estruturadas
3. `senior-product-owner` → comunicação aos stakeholders

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
