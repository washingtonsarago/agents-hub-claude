# agents-hub-claude — Apresentação Executiva

> Time sênior virtual da EMS-NCTECH no Claude Code, padronizado e auto-atualizado.

---

## Slide 1 — Capa

**agents-hub-claude**
Padronização do uso de IA na engenharia EMS-NCTECH

- 18 agents · 14 commands · 4 skills
- Distribuição automática · Sincronização por sessão
- Quality gates em CI · Versionamento por `sha256`

---

## Slide 2 — O Problema

A engenharia já adotou Claude Code, mas o uso é **fragmentado**:

- Cada dev configura agents/commands do seu jeito → **inconsistência entre squads**.
- Boas práticas vivem em wikis e Slack → **se perdem ou ficam desatualizadas**.
- Onboarding lento: dev novo demora dias até conseguir produzir no mesmo padrão.
- Atualizações em prompts/agents não chegam ao time → **drift silencioso**.
- Sem rastreabilidade: ninguém sabe qual versão de agent o colega está rodando.

**Custo:** retrabalho, revisões inconsistentes, débito técnico invisível, curva de aprendizado alta.

---

## Slide 3 — A Solução

Um **registry central** de agents, commands e skills com CLI própria (`ahc`) que sincroniza a cada sessão do Claude Code.

```
Engenheiro abre Claude Code
        │
        ▼
Hook SessionStart dispara `ahc sync`
        │
        ▼
CLI compara manifest remoto × lock local (sha256)
        │
        ▼
Baixa só o que mudou → ~/.claude/{agents,commands,skills}/
        │
        ▼
Dev tem o "time sênior virtual" atualizado, sem esforço
```

**Princípios:** zero-deps, idempotente, fail-silent offline, integridade por hash.

---

## Slide 4 — Benefícios para o Negócio

| Benefício | Impacto |
|---|---|
| **Padronização instantânea** | Todo dev usa o mesmo arsenal — code review, commit, arquitetura, segurança seguem o mesmo critério. |
| **Onboarding em minutos** | Dev novo roda `install.sh` uma vez e tem o mesmo ferramental sênior do time. Ramp-up cai de dias para horas. |
| **Boas práticas como código** | ADRs, checklists de review, fluxos de discovery versionados no Git — não em wiki esquecida. |
| **Atualização zero-toque** | Melhoria publicada no repo chega a todos no próximo `SessionStart`. Sem comunicado, sem treinamento. |
| **Rastreabilidade total** | `manifest.json` com versão + `sha256` por arquivo. Auditoria responde "qual versão estava em uso em X data". |
| **Qualidade consistente entre squads** | Reviews, threat models e arquiteturas saem com o mesmo nível de rigor — independente de quem executou. |
| **Redução de custo cognitivo** | Dev não decide "qual prompt usar"; aciona o agent certo via comando direto. Foco volta para o problema de negócio. |

---

## Slide 5 — Benefícios para a Engenharia

- **Code Review automatizado e padronizado** (`/code-review`) — security + correctness + performance no mesmo template.
- **Commits convencionais sem esforço** (`/smart-commit`) — type/scope corretos, mensagem alinhada ao diff.
- **Discovery e Architecture Design viram fluxos** — `/discovery`, `/arch-design` produzem ADRs e C4 prontos.
- **Bug e Feature flows orquestrados** — `/bug-flow` e `/feature-flow` encadeiam PO → Arquiteto → Dev → QA → Security automaticamente.
- **Memória do projeto centralizada** — `.claude/memory/{business,architecture,guidelines}.md` mantida pelo `project-memory-keeper`.
- **Validação por CI** — `regen-manifest --check` + 31 testes de integração impedem que conteúdo quebrado chegue aos devs.

---

## Slide 6 — Pincelada nos Agents (15)

Os agents são **especialistas virtuais** que o dev aciona via Claude Code. Cada um carrega missão, anti-patterns e protocolo de colaboração próprios.

### Backend & Plataforma
- **`go-senior-engineer`** — Go com concurrency, gRPC, microservices.
- **`go-sdet-backend`** — testes Go: coverage, race, fuzz.
- **`dotnet-backend-architect`** — .NET / ASP.NET Core, DDD, CQRS.
- **`nodejs-backend-architect`** — Node.js TS-first (Fastify, NestJS, Prisma, Zod).
- **`python-engineer`** — Python idiomático (FastAPI, Pydantic v2, async, polars).

### Dados & Integração
- **`postgres-dba`** — tuning, replicação, HA, troubleshooting.
- **`integration-architect`** — event-driven, SQS/SNS/Kafka, CDC, orquestração.

### Frontend & QA
- **`senior-react-developer`** — React, hooks, state, a11y, testes.
- **`cypress-qa-analyst`** — Cypress E2E, estratégia de teste, CI.

### Arquitetura, Segurança & Infra
- **`system-architect`** — ADRs, C4, análise de trade-offs.
- **`security-specialist`** — OWASP/CWE, STRIDE, release-gate.
- **`aws-devops-engineer`** — AWS, Terraform, EKS, observabilidade.

### Produto & Memória
- **`senior-product-owner`** — user stories, OKRs, priorização.
- **`senior-product-designer`** — UX, IA, journey, heurísticas, a11y.
- **`project-memory-keeper`** — mantém memória do projeto + ADRs + READMEs.

> **Como o dev usa:** descreve a tarefa em linguagem natural; o agent certo é acionado e devolve análise/código no padrão do hub.

---

## Slide 7 — Commands & Skills (Pincelada)

**14 slash commands** orquestram fluxos completos:

- `/feature-flow` — PO → Arquiteto → Dev → QA → Security → Review → Commit.
- `/bug-flow` — triage → RCA → fix + regressão → security gate → commit.
- `/incident-response` — detect → mitigate → RCA → postmortem blameless.
- `/code-review`, `/smart-commit`, `/api-contract`, `/db-audit`, `/tech-debt`, `/discovery`, `/arch-design`, `/jira-story`, `/onboard-dev`, `/bootstrap-project`, `/memory-query`.

**4 skills** geram artefatos visuais e documentais profissionais:

- `architecture-diagram` · `sequence-diagram` · `er-diagram` · `release-notes`.

---

## Slide 8 — Garantias Técnicas

- **Integridade:** `sha256` por arquivo no `manifest.json`.
- **Quality gates em CI:** `regen-manifest --check` + 31 testes de integração (`node:test`).
- **Idempotência:** `ahc sync` só baixa o que mudou.
- **Resiliência:** offline → falha silenciosa, mantém cache local.
- **Rollback:** `ahc pin <agent>@<versão>` trava versão antiga até investigação.
- **Zero-deps:** CLI em Node puro, sem cadeia de dependências para auditar.

---

## Slide 9 — ROI Esperado

| Indicador | Antes | Depois |
|---|---|---|
| Onboarding de dev (até produzir no padrão) | dias | horas |
| Variabilidade de qualidade entre squads | alta | baixa (mesmo arsenal) |
| Tempo para propagar nova boa prática | semanas (Slack/wiki) | próxima sessão (auto-sync) |
| Rastreabilidade de versão em uso | inexistente | `sha256` por arquivo |
| Esforço de manutenção por dev | recorrente | zero (hook `SessionStart`) |

---

## Slide 10 — Próximos Passos

1. **Adoção:** `install.sh` em todas as máquinas da engenharia (macOS / WSL / Git Bash documentados).
2. **Governança:** PRs no hub passam por review + CI; mudanças relevantes viram ADR.
3. **Roadmap:** ver [`docs/ROADMAP.md`](ROADMAP.md) — próximas iniciativas, decisões pendentes e itens fora de escopo.
4. **Métricas:** instrumentar uso de commands/agents por squad para priorizar evoluções.

---

## Slide 11 — Resumo

> **Menos tempo configurando Claude Code, mais tempo entregando software com qualidade consistente entre squads.**

- 1 install · 0 manutenção · atualização contínua.
- Boas práticas viram código versionado.
- Time sênior virtual igual para todos.
- Auditável, reversível, rastreável.

**Repositório:** `EMS-NCTECH/agents-hub-claude` · **CLI:** `ahc` · **Docs:** [`README.md`](../README.md) · [`docs/USAGE.md`](USAGE.md)
