# Memory Query

You answer questions by reading the project's canonical memory at `.claude/memory/{business,architecture,guidelines}.md` and returning **extracted snippets**, not paraphrases. This command is a high-precision lookup, not a chat.

## Context
$ARGUMENTS

## Mission

Save tokens and reduce hallucination. Other agents (and humans) shouldn't have to re-read the entire memory trio just to answer one question. You read once, route to the right file, return the relevant section verbatim with a citation.

## Pre-flight (mandatory)

1. Check that `.claude/memory/business.md`, `.claude/memory/architecture.md`, and `.claude/memory/guidelines.md` exist.
2. If any is missing, stop and answer:
   ```
   Memória do projeto não está inicializada (.claude/memory/* ausente ou parcial).
   Rode `/bootstrap-project` primeiro pra semear a memória.
   Faltando: <list>
   ```
3. If `$ARGUMENTS` is empty, switch to **Browse mode** (see below).

## Routing rule (which file to read)

Match the question to the file by topic, not by keyword:

| If the question is about... | Read |
|-----------------------------|------|
| What the product does, who it serves, business rules, permissions, JTBD, scope, compliance | `business.md` |
| Stack, NFRs, integrations, trust boundaries, threat models, security controls, infrastructure, identity provider | `architecture.md` |
| In-repo code conventions, anti-patterns banned, vulnerability classes already remediated, test patterns, agent tone | `guidelines.md` |
| Architectural decisions ("why did we pick X over Y") | `architecture.md` "Decisions log" + the named ADR in `docs/adr/` |
| Domain decisions ("why is feature X out of scope") | `business.md` "Decisions log" + the named ADR |
| Anything cross-cutting | All three, in order |

If the question doesn't fit any of the above, say so plainly — don't guess.

## Modes

### Mode A — Direct query (default when `$ARGUMENTS` is non-empty)

1. Pick the file via the routing rule.
2. Find the relevant section(s). Prefer **exact extraction** over summary.
3. Respond in this format:

```
**Pergunta:** <restate in one line>

**Fonte:** `.claude/memory/<file>.md` § <section name>

**Trecho:**
> <exact paragraph(s) from the file>

**Resumo (1 linha):** <only if the trecho is > 5 lines>

**Relacionado:**
- ADR-NNNN — <title> (`docs/adr/NNNN-...md`) — if cited in the trecho
- `.claude/memory/<other>.md` § <section> — if there's a tight cross-reference
```

If the answer requires multiple files, list each as a separate block. Don't blend.

If the question has **no answer** in memory, respond:

```
**Pergunta:** <restate>

**Não consta na memória do projeto.** Possíveis causas:
- A informação ainda não foi documentada — abra task pra `project-memory-keeper` registrar.
- A pergunta é sobre <topic> e foge do escopo do trio (ver routing rule).

**Sugestão:** <e.g., "rodar `/bootstrap-project` se a memória está nova", ou "perguntar ao tech lead", ou "consultar o agent X diretamente">.
```

### Mode B — Browse (when `$ARGUMENTS` is empty)

Show the table of contents of the trio:

```
## Memória do projeto — índice

### .claude/memory/business.md
- § Product summary
- § Domain glossary  (N termos)
- § User segments & permissions
- § Core business rules  (N regras)
- § Scope
- § Compliance / regulatory
- § Decisions log  (N ADRs)

### .claude/memory/architecture.md
- § Tech stack
- § Topology
- § Non-functional requirements
- § Data stores
- § External integrations & trust boundaries  (N integrações)
- § Security controls
- § Threat models  (N modelos)
- § Decisions log  (N ADRs)

### .claude/memory/guidelines.md
- § Conventions actually in use
- § Engineering fundamentals
- § Anti-patterns banned in this repo  (N items)
- § Vulnerability classes already remediated  (N classes)
- § Agent tone

Use `/memory-query <pergunta>` pra extrair uma seção específica.
```

Counts come from actually scanning the files (count list items / table rows / ADR references).

## Rules

- **Quote, don't paraphrase.** The value of this command is fidelity. If the user wanted summary, they'd ask another agent.
- **One question, one answer.** If the user asks 3 things, route each separately and present 3 blocks.
- **Cite the file path and section heading every time.** Without the citation the answer is worthless.
- **Don't read code.** This command reads memory only. If memory points to a code path, mention the path but don't open it.
- **Don't update memory.** If you find that memory is wrong or stale, end the response with a flag: `⚠️ Memória possivelmente desatualizada — sugiro acionar project-memory-keeper pra revisar § <section>.`
- **Stay short.** Token budget is the entire point. If a section is huge, return the most relevant paragraph + a "ver mais em <file>:<line range>" pointer.

## Anti-patterns

- Paraphrasing the trio in your own words ("o projeto basicamente faz X..."). Use the file's own words.
- Inventing a section that doesn't exist.
- Returning multiple unrelated trechos in hope that one matches.
- Reading code to answer a memory question.
- Updating memory to "fix" what looks wrong — that's `project-memory-keeper`'s job.

## Example interaction

```
User: /memory-query qual é a política de retenção de PII?
Output:
**Pergunta:** Qual é a política de retenção de PII?

**Fonte:** `.claude/memory/architecture.md` § Security controls

**Trecho:**
> PII retention: 18 months for active accounts, 30 days post-deletion request (LGPD art. 16). Backups purged on the same cadence via lifecycle rule on s3://ems-backups/* (KMS key alias/ems-pii). Audit log of access kept 5 years.

**Relacionado:**
- ADR-0023 — LGPD compliance posture (`docs/adr/0023-lgpd-compliance-posture.md`)
- `.claude/memory/business.md` § Compliance / regulatory
```
