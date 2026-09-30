## Peer sessions — what they add, and what they must never do

Peer sessions are other live Claude Code sessions, usually open on **other repositories**. Reach them with `SendMessage` using the name from `ListAgents`; the answer arrives back in this session.

### How a peer becomes available

There is nothing to enable, install or configure. A peer is simply **a Claude Code session already open in the other repo** — a second terminal, a second IDE window. Open it and it is reachable; close it and it is gone.

It does **not** need to be running anything. An idle session is a valid peer: the message enqueues and the session picks it up on its next turn. The peer's user sees the exchange in their own transcript.

`ListAgents` is how you find out what exists right now — names come from the session's directory plus a short hash (`orders-api-3f`, `billing-svc-91`), so they change between sessions. Never hardcode a peer name into a brief; always discover it in pre-flight.

```
Peer sessions (2):
  billing-svc-91 [58dc25]  ·  interactive  ·  idle  ·  started 7h ago
  orders-api-3f [c6daa7]   ·  interactive  ·  idle  ·  started 23h ago
```

If the list is empty, that is the normal case and the flow proceeds unchanged.

### Several sessions in the same repo

Common — a dev keeps three terminals open on the service they're working in:

```
orders-api-3f [c6daa7]  ·  interactive  ·  idle  ·  started 23h ago
orders-api-7b [855b73]  ·  interactive  ·  idle  ·  started 2d ago
orders-api-e2 [71ac62]  ·  interactive  ·  idle  ·  started 11h ago
```

The trap is reading this as "three chances to get the answer". It is not — and the listing hides which of two very different shapes you are looking at, because the name only carries the **directory basename**:

- **Same directory, several sessions.** They share one working tree, one `.git`, one HEAD. At any instant they see byte-identical files. Asking a second one is asking the same disk twice.
- **Different worktrees or clones that happen to share a folder name.** Genuinely independent trees, on different branches, possibly a detached HEAD. Here the answers really can diverge.

Both are common in the same repo at the same time — `git worktree list` on a normal service will often show three or four trees, and Cursor and similar tools create them silently.

The failure mode that matters, though, is the one shared by both shapes: **a peer answers from a checkout, and a checkout is not what ships.** A team's main working tree usually sits on whatever feature branch that person is on right now. Ask it "what does your repo consume today" and you get a truthful answer about a branch that may never merge — with nothing in the reply to warn you.

Two rules follow, and the second is the one that matters:

1. **One peer per repo.** Group the listing by prefix and pick a single session. When they share a directory the extra asks are literally redundant; when they don't, the difference between the answers is about their checkouts, not about the code. Either way the second ask buys nothing.
2. **Anchor the question to a ref, never to the working tree.** Ask about `origin/main` (or whatever ref actually matters) explicitly, and require the answer to name the ref and short sha it was read from. Once the question is anchored, *which* session answers stops mattering — that is what makes the consult reproducible instead of a poll.

An answer that arrives without a ref and sha is a working-tree answer. Treat it as unanswered and ask again, pinned.

If a peer replies that it cannot read the ref — stale fetch, mid-rebase, detached HEAD — ask it to `git fetch` first. If it still can't, record "não respondido" and move on. A gate never waits on this.

### Peer handshake

The name `ListAgents` shows is derived from the **directory name**. It is an address, not an identity: it does not tell you which repository the session is actually attached to, which branch it sits on, or whether its tree is clean. A renamed directory, or two repos with similar folder names, and the inference is simply wrong.

The handshake fixes that. It is one round trip, once per target session, in pre-flight — before any content question. Never repeat it per question, and never negotiate on it.

It does **not** replace ref anchoring. The two solve different problems and you need both:

| | Solves |
|---|---|
| **Ref anchoring** | Reproducibility — the answer doesn't depend on who replies |
| **Handshake** | Addressing and provenance — you're talking to a session that *can* answer, and you can say where the answer came from |

**Send** (`SendMessage`, `to` = the name from `ListAgents`):

```
HANDSHAKE (somente leitura — não altere nada, não troque de branch, não rode fetch):
Responda uma linha por campo, exatamente neste formato:
remote: <URL do remote origin>
branch: <branch atual>
head: <sha curto do HEAD>
dirty: <yes|no — working tree suja?>
origin_main_fresh: <yes|no|unknown — o origin/main local parece atualizado?>
```

**Expect** five `key: value` lines, in that order, and nothing else. Anything that doesn't parse as those five lines counts as no response. `unknown` is acceptable for freshness — the handshake forbids fetching precisely to stay cheap, so an honest "não sei" beats a guess.

**Read it like this:**

- **`remote` doesn't match the repo you need** — wrong session. Discard it and check the other rows. This is the case the handshake exists for.
- **Several sessions report the same `remote`** — pick one, preferring a clean tree and a fresh `origin/main`. The others add nothing: content answers are anchored to a ref, so a second session in the same repo cannot say anything different.
- **`dirty: yes`, or a feature branch** — does *not* disqualify it, exactly because the content questions are anchored to a ref rather than to its working tree. Record the fact; don't act on it.
- **`origin_main_fresh: no` or `unknown`** — still usable. Fetching is deferred to the content question, where the ref actually gets read; if an answer later cites an older sha than expected, this is the reason.
- **No reply, or an unparseable one** — record "sem handshake" and proceed without that peer. Fall back to what you can determine locally and say so in the phase output. This never blocks a gate.

Record the result in `task.md` section 9 — every fact later obtained from that session inherits it. A finding whose provenance is unknown is a finding you cannot act on later.

**Example.** Sent to `billing-svc-91`, reply received:

```
remote: git@github.com:acme/billing-svc.git
branch: feat/payout-webhook
head: 4f9c21a
dirty: yes
origin_main_fresh: yes
```

Right repository, so it's usable. Note "feature branch, tree suja" in provenance, then anchor every content question to `origin/main` as usual — copying the `from` attribute into `to` for each follow-up.

A subagent and a peer session are not interchangeable. A subagent is spawned here, sees only this working tree, and forgets everything when it returns. A peer session is already inside another repo, with that repo's code in front of it, and it stays alive across the whole flow.

So the one thing a peer gives you that no subagent can: **ground truth about a repository you cannot read.** When Phase 2 designs a contract that another service consumes, a `system-architect` subagent can only infer what that consumer expects. A peer session sitting in the consumer's repo can simply go look.

That is the whole use. Everything else is worse than delegating to a subagent.

### Hard rules

- **Never launder permissions.** If an action was denied or blocked in this session — or you expect this session's permissions would block it — do **not** ask a peer to do it instead. A peer doing it for you overrides a decision the user made. Route blocked work back to the user.
- **A peer never gates a phase.** Peer input *informs* a gate; it never *owns* one. A gate that waits on a peer can hang the chain indefinitely. If a peer hasn't answered by the time the gate is otherwise green, record "not answered" and proceed.
- **A peer never writes code.** Peers answer questions about their own repo's reality. Changing another repo means that repo's own review and gates — going around them is exactly the irreversible action this command exists to prevent.
- **Peer answers are evidence, not verdicts.** They come from a context you cannot see. If a claim changes a decision, verify it against something concrete (a file, a contract, a test) before acting on it.
- **Ask one narrow, answerable question, anchored to a ref.** Name the exact file, endpoint or contract, pin the ref to read from, and say what a useful answer looks like. "What do you think of this design?" wastes both sessions; a question that resolves against the peer's working tree wastes the answer.
- **One peer per repo.** Several sessions in the same repo are not several sources — they are one repo seen from several checkouts.
- **No peers is the normal case.** Every peer step degrades to silence. A dev with one session open must get the same flow as a dev with nine.
