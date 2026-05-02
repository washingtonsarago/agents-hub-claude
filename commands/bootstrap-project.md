# Bootstrap Project

You initialize the project's agent-facing memory by scanning the repo, detecting the stack, and seeding the canonical memory trio plus the demand-tracking folders. Run this once per repo, on first install of `ahc`, or when memory was deleted/corrupted.

## Context
$ARGUMENTS

## Mission

Bring a freshly cloned project (or a project that never used the squad) to a state where every other agent can reliably read `.claude/memory/{business,architecture,guidelines}.md` and find truthful, evidence-based content. **Derive everything from the codebase — never invent.**

## Scope (what you create)

```
.claude/
└── memory/
    ├── business.md
    ├── architecture.md
    └── guidelines.md
docs/
├── adr/
│   └── .gitkeep
├── todo/
│   └── .gitkeep
└── done/
    └── .gitkeep
```

You do not modify application code. You do not overwrite existing memory files — if one exists, enhance it; flag conflicts.

## Workflow

### Step 1 — Detect

Inspect the repo (do not ask the user before scanning):

| Signal | What to read |
|--------|--------------|
| `package.json` / `pnpm-lock.yaml` / `yarn.lock` | Node/JS stack, frameworks, scripts |
| `tsconfig.json` | TypeScript config, path aliases |
| `go.mod` + `go.sum` | Go version, modules |
| `*.csproj` / `*.sln` / `Directory.Packages.*` | .NET TFM, package versions, central package management |
| `pyproject.toml` / `requirements*.txt` / `Pipfile` | Python stack |
| `Cargo.toml` | Rust |
| `pom.xml` / `build.gradle*` | JVM stack |
| `Gemfile` | Ruby |
| `Dockerfile` / `docker-compose.yml` | Runtime topology |
| `terraform/` / `*.tf` / `cloudformation/` / `serverless.yml` | IaC and cloud target |
| `.github/workflows/` / `.gitlab-ci.yml` / `Jenkinsfile` | CI/CD |
| `migrations/` / `db/migrate/` / `supabase/` / `prisma/schema.prisma` | DB engine + schema |
| `openapi.yaml` / `*.proto` / `graphql/schema.*` | External API surface |
| `CLAUDE.md` (root or nearest) | Project's own conventions — these override defaults |
| `README.md` | Existing human-facing summary |
| Folder layout (`src/`, `internal/`, `cmd/`, `apps/`, `services/`, `packages/`, `web/`, `api/`, `domain/`...) | Architectural intent |

Sample (read 2–3 files per layer when present): one controller/handler, one service/use-case, one repository/data-access, one domain entity, one test. Capture the **actual** patterns: error envelope, mapping, layering, validation, deletion policy, optimistic concurrency.

### Step 2 — Confirm with the user

Before writing memory, present a one-screen detection summary and ask 3–5 targeted questions to fill what code can't reveal. Examples:

- "Detectei stack `.NET 8 + EF Core + Postgres + React/Vite`. Confirma?"
- "Não achei NFRs documentados. Qual seu alvo de latência p99 e disponibilidade?"
- "Vejo integração com Stripe e Twilio. Esse é o escopo de integrações externas hoje?"
- "Identity provider em uso? (Auth0 / Cognito / próprio / outro)"
- "Tem regulação aplicável? (LGPD / PCI / SOC2 / nenhuma específica)"

Don't ask >5 questions. If the user is silent on something, write `_a confirmar_` in the file and flag in the report.

### Step 3 — Seed the trio

Create each file using the skeleton from `project-memory-keeper.md`. Fill what you have evidence for; mark gaps as `_a confirmar_`. Cross-reference between files (don't duplicate).

**Routing rule (sharp):**
- A fact about *what the product does or for whom* → `business.md`
- A fact about *how the system is built and runs* → `architecture.md`
- A fact about *how the team writes code in this repo* → `guidelines.md`

Examples:
- "Postgres 15 with row-level security enabled" → `architecture.md` (security controls).
- "All write operations go through a Unit of Work; never call `SaveChanges` from controllers" → `guidelines.md` (convention).
- "Customers are restricted to their own tenant_id; admins see all tenants" → `business.md` (permissions).

### Step 4 — Seed the demand folders

```
docs/adr/.gitkeep
docs/todo/.gitkeep
docs/done/.gitkeep
```

Create only if `docs/` doesn't already have these. Do not move existing files.

### Step 5 — Verify and report

Output a one-screen report:

```
[bootstrap] project: <root path>
  detected stack: <list>
  detected runtime: <docker / k8s / serverless / bare metal>
  detected ci: <provider>
  detected db: <engine + version>
  external integrations: <list>

  files created:
    .claude/memory/business.md
    .claude/memory/architecture.md
    .claude/memory/guidelines.md
    docs/adr/.gitkeep
    docs/todo/.gitkeep
    docs/done/.gitkeep

  open gaps (marked `_a confirmar_` in the trio):
    - business.md: <list>
    - architecture.md: <list>
    - guidelines.md: <list>

  next steps:
    - Resolva os gaps acima editando manualmente os trechos `_a confirmar_` em `.claude/memory/`. Os agents preencherão o resto incrementalmente via `project-memory-keeper` à medida que o trabalho acontece.
    - Para qualquer trabalho não trivial, agents agora carregam memória automaticamente via `project-memory-keeper`.
    - Use `/feature-flow` e `/bug-flow` para fluxos completos com gates.
```

## Rules

- **Read-only against application code.** You scan and quote evidence. You never edit `src/`, `internal/`, etc.
- **Don't invent.** If evidence is absent, mark `_a confirmar_` and ask. Hallucinated business rules are worse than blank ones.
- **Idempotent.** Running twice on the same repo enhances, never duplicates. If a section already has content, integrate; don't replace.
- **Respect existing `CLAUDE.md`.** Anything in there overrides defaults. Surface contradictions in the report rather than silently overriding.
- **Sensitive content.** Never write secrets, real customer data, internal hostnames you found in env files. Flag them as findings instead.
- **Time:** date the headers (`<!-- Last updated: YYYY-MM-DD -->`).

## When NOT to run

- The trio already exists and is in active use → use `project-memory-keeper` directly to update specific sections instead.
- The user wants a human-facing onboarding doc → use `/onboard-dev` instead (different audience, different artifact).
- The user wants ADRs for past decisions → use `system-architect` directly.
