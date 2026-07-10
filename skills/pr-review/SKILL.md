---
name: pr-review
description: Gera um relatorio padronizado de revisao de Pull Requests do repositorio em Markdown, no formato PR-REVIEW-AAAA-MM-DD.md usado pelo time. Use quando o usuario pedir "revisa os PRs", "faz o PR review do dia", "gera o relatorio de pull requests", "analisa as branches abertas", "review diario", ou quando a tarefa agendada de revisao rodar. Avalia cada PR/branch candidato com notas (faz sentido / atende ao padrao), parecer e recomendacao (aprovar / ajustar / rejeitar), e e robusto a ambientes sem acesso a API do GitHub (cai pra refs locais origin/*). Complementa a command code-review (que faz review aprofundado de um diff especifico).
---

# pr-review

Skill para produzir o **relatorio diario de revisao de Pull Requests** no formato consolidado do time: `PR-REVIEW-AAAA-MM-DD.md` na raiz do repositorio. Padroniza um artefato que hoje e feito a mao e varia de formato entre execucoes.

Foco: dar uma visao executiva do estado dos PRs/branches candidatos, com avaliacao consistente e recomendacao acionavel por candidato — funcionando tanto com acesso vivo a API do GitHub quanto em ambientes restritos (sandbox/cron sem egress/credenciais).

## Quando usar esta skill

Acione quando o usuario pedir, em qualquer variacao:

- "revisa os PRs", "PR review do dia", "relatorio de pull requests"
- "analisa as branches abertas / candidatas"
- "review diario", "roda a verificacao de PRs"
- ou quando uma tarefa agendada de revisao for executada (modo autonomo).

Diferenca para a command **`code-review`:** aquela faz review *aprofundado, linha a linha,* de um diff/PR especifico com multiplos revisores. Esta skill faz o *relatorio consolidado diario* de todos os candidatos, com avaliacao de alto nivel e recomendacao. Use as duas em conjunto: o relatorio aponta o que merece um `code-review` profundo.

## Processo recomendado

1. **Determinar a fonte de dados (com fallback).**
   - Tente a API/`gh` se disponivel: `gh pr list --state open --json number,title,headRefName,...`.
   - Se a API estiver indisponivel (sem egress, sem credencial, `gh` ausente), **caia para os refs locais**: `git for-each-ref refs/remotes/origin`, comparando cada branch com `origin/main` (`git rev-list --left-right --count origin/main...origin/<branch>`).
   - **Sempre declare a fonte e suas limitacoes** no topo do relatorio (ver secao "Limitacao do ambiente" do template). Honestidade sobre o que pode/nao pode ser verificado e parte do padrao.

2. **Levantar candidatos.** Para cada PR aberto (ou branch remota a frente da `main`): numero/branch, ultimo commit, estado vs `main` (X commits a frente / Y atras), data.
   - Marque branches ja mescladas (`0 a frente`) como "nada a revisar".
   - Distinga branches **apenas locais** de branches em `origin` (so estas sao candidatas a PR real).

3. **Avaliar cada candidato** em duas dimensoes, escala 1-10:
   - **Faz sentido:** a mudanca e necessaria/nao-redundante? Resolve um problema real?
   - **Atende ao padrao:** segue convencoes do repo (estrutura, frontmatter, Conventional Commits, esta em sincronia com a `main`)?
   - Derive a **recomendacao**: ✅ Aprovar · 🟡 Ajustar (rebase/correcao) · ❌ Rejeitar/fechar.

4. **Escrever o relatorio** seguindo `templates/pr-review.md`: header com data/repo/execucao, eventual aviso de limitacao do ambiente, resumo executivo, tabela de candidatos, analise por candidato (conteudo + notas + parecer final), e a secao de acao automatica.

5. **Modo autonomo = somente leitura.** Em execucao agendada/autonoma, **nao** execute acoes de escrita (fechar PR, comentar, mesclar). O relatorio recomenda; a acao exige decisao humana. Declare isso na secao "Acao automatica neste run".

## Convencoes

- Nome do arquivo: `PR-REVIEW-{AAAA-MM-DD}.md` na raiz do repo. Use a data corrente.
- Comparacao incremental: sempre relate o delta desde o ultimo run (se houver um `PR-REVIEW-*.md` anterior, compare e destaque o que mudou; "estado identico" e uma saida valida).
- Notas sempre com justificativa de uma linha — nota sem racional e ruido.
- Linguagem: portugues (pt-BR).

## Output format

Arquivo `PR-REVIEW-{AAAA-MM-DD}.md` seguindo `templates/pr-review.md`. Ao final, reporte ao usuario: caminho do arquivo, numero de candidatos avaliados, recomendacoes em destaque e quaisquer limitacoes de ambiente que afetaram a analise.

## Anti-patterns a evitar

- Afirmar que um PR foi verificado "ao vivo" quando so se teve acesso a refs locais — sempre declare a fonte real.
- Recomendar merge/aprovacao sem checar se o conteudo ja esta na `main` (redundancia).
- Notas sem justificativa.
- Executar acoes de escrita em modo autonomo.
- Relatorio que ignora o run anterior e nao mostra o delta.
