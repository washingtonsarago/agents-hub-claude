---
name: test-autonomous
description: "Autonomous agent fixture used by tests."
schedule: 7 12 * * 1-5
repo: fixture/local
model: sonnet
mode: read-only
tools: Bash, Read
connectors:
budget_tokens_per_run: 10000
routine_id:
---

# test-autonomous

Fixture. Not a real autonomous agent.

## Prompt

> Fixture prompt — does nothing.
