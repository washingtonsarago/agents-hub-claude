# Revisao de Pull Requests — {repo}

**Data:** {AAAA-MM-DD} · **Repositorio:** `{github.com/org/repo}` · **Execucao:** {manual | tarefa agendada (autonoma)}

---

## ⚠️ Limitacao do ambiente *(incluir apenas se aplicavel)*

{Declare a fonte de dados real e o que NAO pode ser verificado. Ex.: API do GitHub
indisponivel (egress bloqueado / sem credencial / gh ausente); analise baseada em
refs `origin/*` do clone local (FETCH_HEAD {timestamp}). Para automacao confiavel:
{o que precisa ser liberado}.}

---

## Resumo executivo

{1-3 frases sobre o estado geral. Se houver run anterior, destaque o DELTA:
"Nenhum PR novo desde {data}" / "N novos candidatos" / "estado identico".}

- {bullet com fato relevante: estado da main, nº de branches, achados}

### Tabela de candidatos

| PR / Branch | Commit | Estado vs main | Faz sentido | Atende ao padrao | Recomendacao |
|---|---|---|:---:|:---:|---|
| `{branch}` | `{sha}` | {X↑ / Y↓} | {n}/10 | {n}/10 | {✅ Aprovar · 🟡 Ajustar · ❌ Rejeitar} |

> {notas sobre branches ja mescladas (0↑) ou apenas locais — "nada a revisar"}

---

## Analise por candidato

### {1. branch / PR #N}

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

---

## Acao automatica neste run

{Em modo autonomo: "Nenhuma — a tarefa pede analise/relatorio; nenhuma acao de
escrita (fechar/comentar/mesclar) foi executada." Caso contrario, liste o que foi feito.}

---

*Gerado por skill `pr-review` em {AAAA-MM-DD}. Fonte: {API GitHub | refs origin/* do clone local}.*
