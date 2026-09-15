---
name: pr-review
description: Gera o relatorio consolidado de revisao de Pull Requests do repositorio em docs/pr-review/latest.md. Use quando o usuario pedir "revisa os PRs", "faz o PR review do dia", "gera o relatorio de pull requests", "analisa as branches abertas", "review diario", ou quando a tarefa agendada de revisao rodar. Avalia cada PR/branch candidato com notas (faz sentido / atende ao padrao), parecer e recomendacao (aprovar / ajustar / rejeitar). Em modo autonomo so escreve quando o estado do repo mudou desde o ultimo run, e aborta se nao tiver acesso vivo a API do GitHub. Complementa a command code-review (que faz review aprofundado de um diff especifico).
---

# pr-review

Skill para produzir o **relatorio consolidado de revisao de Pull Requests** do time, em `docs/pr-review/latest.md`. Padroniza um artefato que variava de formato entre execucoes.

Foco: dar uma visao executiva do estado dos PRs/branches candidatos, com avaliacao consistente e recomendacao acionavel por candidato.

## Quando usar esta skill

Acione quando o usuario pedir, em qualquer variacao:

- "revisa os PRs", "PR review do dia", "relatorio de pull requests"
- "analisa as branches abertas / candidatas"
- "review diario", "roda a verificacao de PRs"
- ou quando uma tarefa agendada de revisao for executada (modo autonomo).

Diferenca para a command **`code-review`:** aquela faz review *aprofundado, linha a linha,* de um diff/PR especifico com multiplos revisores. Esta skill faz o *relatorio consolidado* de todos os candidatos, com avaliacao de alto nivel e recomendacao. Use as duas em conjunto: o relatorio aponta o que merece um `code-review` profundo.

## Regra 1 — sem acesso vivo, a run e inconclusiva

Esta skill exige **acesso vivo a API do GitHub**. Verifique antes de qualquer analise:

```sh
gh pr list --state open --json number,title,headRefName,updatedAt,isDraft,mergeable
```

Se o comando falhar (sem `gh`, sem credencial, egress bloqueado, HTTP != 200), **pare**:

1. **Nao** reescreva `latest.md`. Um relatorio novo derivado de um clone congelado parece fresco e nao e — esse e o defeito que esta regra existe pra impedir.
2. Acrescente uma linha em `docs/pr-review/history.md` com resultado `inconclusivo` e a causa real (ex.: `api.github.com inalcancavel`, `sem credencial`).
3. Reporte ao usuario, em uma frase, o que precisa ser liberado pra proxima run funcionar.

Refs `origin/*` de um clone local **nao sao fallback valido**: eles congelam junto com o clone e produzem o mesmo parecer indefinidamente. Sao aceitaveis apenas como *complemento* a API viva, pra comparar branches (`git rev-list --left-right --count`).

## Regra 2 — sem mudanca de estado, silencio

Calcule o **fingerprint** do estado do repo e compare com `docs/pr-review/.state.json`.

O fingerprint e o sha256 do JSON canonico (chaves ordenadas) de:

```json
{
  "main": "<sha de origin/main>",
  "prs": [{"number": 12, "head_sha": "<sha>", "draft": false}]
}
```

- **Fingerprint identico ao ultimo run:** nao toque em `latest.md`. Atualize apenas `last_checked` no `.state.json`, acrescente uma linha `sem mudanca` em `history.md`, e reporte uma frase ao usuario. Nada de arquivo novo, nada de commit.
- **Fingerprint diferente:** regenere `latest.md` por inteiro e grave o novo fingerprint.

Silencio num dia parado e a saida **correta**, nao uma falha. Um relatorio por dia que repete o parecer anterior nao e vigilancia: e ruido que treina o time a ignorar o canal.

## Processo

1. **Coletar os candidatos** via API (Regra 1). Para cada PR aberto: numero, titulo, branch, ultimo commit, autor, draft ou nao, estado vs `main` (X commits a frente / Y atras).
   - Marque PRs cujo conteudo ja esta na `main` como redundantes.
   - Branches remotas sem PR aberto entram como candidatas com a nota disso.

2. **Checar o gate de estado** (Regra 2). Se nao mudou, pare aqui.

3. **Avaliar cada candidato** em duas dimensoes, escala 1-10:
   - **Faz sentido:** a mudanca e necessaria/nao-redundante? Resolve um problema real?
   - **Atende ao padrao:** segue convencoes do repo (estrutura, frontmatter com `tier:`/`team:`, Conventional Commits, em sincronia com a `main`)?
   - Derive a **recomendacao**: ✅ Aprovar · 🟡 Ajustar (rebase/correcao) · ❌ Rejeitar/fechar.

4. **Escrever `docs/pr-review/latest.md`** seguindo `templates/pr-review.md`, sobrescrevendo o anterior. O historico de pareceres vive no git, nao em arquivos paralelos.

5. **Acrescentar a linha em `docs/pr-review/history.md`** (formato na secao Output).

6. **Modo autonomo = somente leitura no GitHub.** Nao feche, comente ou mescle PR. O relatorio recomenda; a acao exige decisao humana. Declare isso na secao "Acao automatica neste run".

## Output

Tres arquivos em `docs/pr-review/`:

| Arquivo | Escrita | Conteudo |
|---|---|---|
| `latest.md` | sobrescrito, so quando o estado muda | Relatorio completo, via `templates/pr-review.md` |
| `history.md` | append, uma linha por run | Trilha de execucao |
| `.state.json` | sobrescrito todo run | `{"fingerprint": "...", "last_checked": "...", "last_change": "..."}` |

Linha de `history.md` (uma por run, mais recente no fim):

```
| 2026-08-14T09:16Z | agendada | mudou    | 3 PRs abertos, 1 novo (#14) | fingerprint a1b2c3d4 |
| 2026-08-15T09:16Z | agendada | sem mudanca | — | fingerprint a1b2c3d4 |
| 2026-08-16T09:16Z | agendada | inconclusivo | api.github.com inalcancavel | — |
```

**Nunca** crie `PR-REVIEW-AAAA-MM-DD.md` na raiz do repo. Esse era o formato antigo; os relatorios ja gerados estao em `docs/pr-review/archive/`.

Ao final, reporte ao usuario: se houve mudanca, o caminho do arquivo, numero de candidatos e as recomendacoes em destaque; se nao houve, uma unica frase.

## Anti-patterns a evitar

- **Produzir analise a partir de um clone congelado.** Se a API nao respondeu, a run e inconclusiva (Regra 1).
- **Escrever relatorio num dia sem mudanca.** Silencio e a saida certa (Regra 2).
- **Um arquivo por execucao.** Gera acumulo que ninguem le; o historico e o git.
- Afirmar que um PR foi verificado "ao vivo" quando so se teve acesso a refs locais — sempre declare a fonte real.
- Recomendar merge/aprovacao sem checar se o conteudo ja esta na `main` (redundancia).
- Notas sem justificativa de uma linha.
- Executar acoes de escrita no GitHub em modo autonomo.
