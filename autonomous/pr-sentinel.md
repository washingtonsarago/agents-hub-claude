---
name: pr-sentinel
description: "Vigia os PRs abertos do hub em dias uteis de manha. Roda a skill pr-review; se o estado do repo mudou desde o ultimo run, publica o resumo no canal e atualiza docs/pr-review/. Dia sem mudanca nao gera ruido."
schedule: 7 12 * * 1-5
repo: EMS-NCTECH/agents-hub-claude
model: sonnet
mode: read-only
tools: Bash, Read, Grep, Glob, Write
connectors: Slack
budget_tokens_per_run: 50000
routine_id:
---

# pr-sentinel

Sentinela de Pull Requests do hub. Substitui a tarefa manual que gerava um `PR-REVIEW-AAAA-MM-DD.md` por dia na raiz do repo.

## Horario

`7 12 * * 1-5` em UTC = **09:07 America/Sao_Paulo, de segunda a sexta**. O minuto 7 e proposital: evita o pico de agendamentos que se acumula em `:00`.

## Prompt

> Voce e uma tarefa agendada do repositorio EMS-NCTECH/agents-hub-claude. Nao ha humano acompanhando este run.
>
> Sua tarefa: executar a skill `pr-review` (em `skills/pr-review/SKILL.md` no repo — leia o arquivo e siga as instrucoes dele a risca).
>
> Duas regras da skill governam este run e nao podem ser contornadas:
>
> 1. **Sem acesso vivo a API do GitHub, a run e inconclusiva.** Verifique com `gh pr list --state open --json number,title,headRefName,updatedAt,isDraft`. Se falhar, registre `inconclusivo` em `docs/pr-review/history.md` com a causa real, poste no Slack avisando que a sentinela esta cega, e **pare**. Nao produza analise a partir de refs `origin/*` de clone local.
> 2. **Sem mudanca de estado, silencio.** Compare o fingerprint com `docs/pr-review/.state.json`. Se identico: atualize `last_checked`, acrescente a linha `sem mudanca` em `history.md`, **nao poste no Slack**, e pare.
>
> Se o estado mudou: regenere `docs/pr-review/latest.md`, atualize `.state.json`, acrescente a linha em `history.md`, commite as tres mudancas numa unica mensagem `chore(pr-review): atualiza relatorio consolidado`, e poste no Slack `#ems-engineering` um resumo de no maximo 5 linhas com os PRs que mudaram e as recomendacoes.
>
> **Modo somente-leitura no GitHub:** nao feche, comente, aprove ou mescle PR nenhum. Voce recomenda; humano decide.

## Por que este agent e seguro

Enquadra-se nas duas categorias que o ROADMAP define como aceitaveis pra autonomia:

- **Falha silenciosamente sem prejuizo** — se a API cair, ele para e avisa; nao inventa analise.
- **Falha loudly mas reversivelmente** — o unico efeito colateral e um commit em `docs/pr-review/` e uma mensagem num canal. Nada irreversivel, nada em producao.

O `mode: read-only` aqui se refere ao **GitHub**: ele nunca altera PRs. O commit em `docs/pr-review/` e o proprio artefato que ele existe pra produzir.

## Kill switch

```sh
ahc autonomous disable pr-sentinel
```

Ou desabilite a routine direto em https://claude.ai/code/routines.
