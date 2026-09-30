# PR review — relatório consolidado

Artefatos da skill [`pr-review`](../../skills/pr-review/SKILL.md), gerados pela tarefa agendada de revisão de PRs.

| Arquivo | Escrita | O que é |
|---|---|---|
| `latest.md` | sobrescrito, **só quando o estado do repo muda** | Relatório atual: candidatos, notas, pareceres, recomendações |
| `history.md` | append, **uma linha por run** | Trilha de execução — prova de que o agent rodou, mesmo em dia parado |
| `.state.json` | sobrescrito todo run | Fingerprint do estado + timestamps, para o gate de mudança |
| `archive/AAAA-MM/` | congelado | Os 59 relatórios `PR-REVIEW-AAAA-MM-DD.md` do formato antigo, agrupados por mês (2026-05-13 → 2026-08-14) |

## Por que mudou

O formato antigo era **um arquivo por dia na raiz do repo**. Entre 13/05 e 14/08 isso gerou 59 arquivos (9 em maio, 18 em junho, 21 em julho, 11 em agosto), dos quais 26 nunca chegaram a ser commitados. Pior: a partir de julho a tarefa perdeu acesso à API do GitHub e passou a repetir o mesmo parecer sobre as mesmas 3 branches, todo dia, a partir de um clone congelado — com aparência de relatório fresco.

As duas regras que a skill agora impõe atacam exatamente isso:

1. **Sem acesso vivo à API, a run é inconclusiva.** Não se escreve análise nova em cima de dado congelado; registra-se a falha e para.
2. **Sem mudança de estado, silêncio.** Dia parado não gera relatório. Só a linha em `history.md`.

## Como ler

- **"O que está aberto agora?"** → `latest.md`
- **"O agent está vivo? rodou ontem?"** → últimas linhas de `history.md`
- **"Como o parecer sobre o PR #12 evoluiu?"** → `git log -p docs/pr-review/latest.md`

O histórico de pareceres vive no git, não em arquivos paralelos.

## Decisão pendente

Hoje a tarefa **commita** `history.md` + `.state.json` a cada run (diff de ~2 linhas). A alternativa é publicar num canal (Slack `#ems-engineering`) e commitar só quando houver mudança. É a decisão em aberto do item 2 do [ROADMAP](../ROADMAP.md) — "qual canal pra reports da Fase A".
