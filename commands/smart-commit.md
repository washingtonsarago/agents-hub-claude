# Smart Commit

Analyze all pending changes and create a well-structured commit following Conventional Commits.

## Instructions

1. Run `git status`, `git diff --staged`, and `git diff` to understand all changes

2. If there are unstaged changes, ask whether to include everything or select specific files

3. Analyze the content of changes and determine:
   - **Type**: feat, fix, refactor, docs, test, chore, perf, ci, build
   - **Scope**: affected module or area (e.g., estoque, pricing, auth)
   - **Description**: concise summary of the "why" (not the "what")
   - **Breaking change**: if there is a backward-incompatible change

4. Check recent history with `git log --oneline -10` to maintain style consistency

5. Commit format:
```
<type>(<scope>): <descrição no imperativo>

<corpo opcional com detalhes da mudança>

<footer com breaking changes ou referências>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

6. **Rules:**
   - Title max 72 characters
   - Body wrap at 80 characters
   - Use imperative verbs (add, fix, remove — not added, fixed, removed)
   - NEVER commit .env, credentials, secrets
   - If suspicious files are found (.env, .key, tokens), WARN before committing
   - If there are more than 3 different types of changes, suggest splitting into separate commits
   - Prefer staging specific files over `git add -A`

7. After user approval, execute the commit

$ARGUMENTS
