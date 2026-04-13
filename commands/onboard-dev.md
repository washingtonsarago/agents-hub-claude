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
# Developer Onboarding — {project-name}

## Quick Start (Get running in 15 minutes)

### Prerequisites
- [ ] {language/runtime} installed (version X.Y)
- [ ] Docker + Docker Compose
- [ ] {tool} installed
- [ ] Access to GitHub org {org}
- [ ] VPN/credentials for {env}

### Setup
1. Clone: `git clone {repo-url}`
2. Install deps: `{install-command}`
3. Start infra: `docker compose up -d`
4. Run migrations: `{migration-command}`
5. Start app: `{run-command}`
6. Verify: `curl http://localhost:{port}/health`

## Architecture Overview

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Language | ... |
| Framework | ... |
| Database | ... |
| Cache | ... |
| Messaging | ... |
| Auth | ... |

### Project Structure
{annotated tree with descriptions of each directory}

### Key Files to Read First
1. `{file}` — {why it's important}
2. `{file}` — {why it's important}
3. `{file}` — {why it's important}

## Domain Concepts
{Explain the core business domain in simple terms}
- **{Concept A}**: what it is, how it's modeled
- **{Concept B}**: what it is, how it's modeled

## Critical Flows
{Describe the 3 most important user/system flows}

### Flow 1: {name}
{Mermaid sequence diagram}

## Database Schema
{Simplified ER diagram in Mermaid}

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/... | ... |

## Environment Variables
| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| ... | Yes/No | ... | ... |

## Development Workflow
1. Create branch from `main`: `git checkout -b feat/XX-description`
2. Make changes
3. Run tests: `{test-command}`
4. Commit: follow Conventional Commits
5. Push and create PR
6. Get review from {reviewer}
7. Merge after CI passes

## Common Tasks
- **Add a new endpoint:** {where to add, pattern to follow}
- **Add a migration:** {command, naming convention}
- **Add a test:** {where tests live, how to run}
- **Debug locally:** {tools, tips}

## Troubleshooting
| Problem | Solution |
|---------|----------|
| "too many connections" | Check DB pool size in config |
| Tests timeout | Ensure Docker infra is running |
| Auth fails locally | Check Keycloak is up on :8080 |

## Team Contacts
| Role | Name | When to ask |
|------|------|-------------|
| Tech Lead | ... | Architecture decisions |
| PO | ... | Requirements, priorities |
| DBA | ... | Schema changes, queries |

## Useful Links
- Jira Board: {url}
- Confluence: {url}
- Monitoring: {url}
- Staging: {url}
```

### Step 3 — Save
Save the guide as `docs/ONBOARDING.md` in the project root.
