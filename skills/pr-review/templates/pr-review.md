# Revisao de Pull Requests — {repo}

**Ultima mudanca:** {AAAA-MM-DD HH:MM UTC} · **Repositorio:** `{github.com/org/repo}` · **Execucao:** {manual | tarefa agendada (autonoma)} · **Fonte:** API do GitHub (`gh`)

> Este arquivo e sobrescrito a cada run em que o estado do repo muda. Runs sem mudanca
> nao tocam nele — veja `history.md` pra trilha de execucao e o `git log` deste arquivo
> pra evolucao dos pareceres.

---

## Resumo executivo

{1-3 frases sobre o estado geral, sempre em relacao ao run anterior:
"2 PRs novos desde {data}" / "PR #12 saiu de draft" / "1 PR mergeado, 1 aberto".}

- {bullet com fato relevante: estado da main, nº de PRs abertos, achados}

### Tabela de candidatos

| PR / Branch | Commit | Autor | Estado vs main | Faz sentido | Atende ao padrao | Recomendacao |
|---|---|---|---|:---:|:---:|---|
| `#{N} {branch}` | `{sha}` | {autor} | {X↑ / Y↓} | {n}/10 | {n}/10 | {✅ Aprovar · 🟡 Ajustar · ❌ Rejeitar} |

> {notas sobre PRs redundantes (conteudo ja na main) ou branches sem PR aberto}

---

## Analise por candidato

### {PR #N — titulo}

**1. Analise de conteudo:** {o que muda, qualidade, se segue o padrao do repo,
se o conteudo ja esta na main (redundancia)}

**2. Notas (1-10):**

| Criterio | Nota | Justificativa |
|---|:---:|---|
| Faz sentido | {n}/10 | {uma linha} |
| Atende ao padrao | {n}/10 | {uma linha} |

**3. Parecer final:**
- **Pontos fortes:** {...}
- **Pontos fracos:** {...}
- **Sugestoes:** {...}
- **Recomendacao:** {✅ / 🟡 / ❌} {acao concreta}
- **Merece `code-review` profundo?** {sim/nao + por que}

---

## Acao automatica neste run

{Em modo autonomo: "Nenhuma — a tarefa pede analise/relatorio; nenhuma acao de
escrita (fechar/comentar/mesclar) foi executada." Caso contrario, liste o que foi feito.}

---

*Gerado pela skill `pr-review`. Fingerprint do estado: `{sha}`.*
