---
name: flow-playbook
description: Texto condicional do /flow, lido sob demanda por caminho pelo proprio command (protocolo de peer sessions e faixa trivial). Nao invocavel.
disable-model-invocation: true
user-invocable: false
---

# flow-playbook

Inert vehicle for `/flow` text that only applies on a conditional branch. `commands/flow.md` stays loaded on every invocation with what always applies (gates, template, resume, pass ceiling, trivial-lane entry criteria); the branch-only text lives here and is read by path, on demand.

- `peers.md` — the peer sessions protocol, read only when `ListAgents` shows a peer in an affected repo.
- `trivial-lane.md` — the collapsed execution of the trivial lane, read only after the lane is chosen.

An unreadable file never unlocks anything: without `trivial-lane.md` the flow runs the standard lane, and without `peers.md` no peer is consulted.
