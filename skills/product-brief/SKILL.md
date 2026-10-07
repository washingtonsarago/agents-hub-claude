---
name: product-brief
description: Gera um one-pager de produto (PRD enxuto) estruturado em Markdown para alinhar um problema, publico, outcome, escopo e metricas antes do build. Use quando o usuario pedir "cria um one-pager", "escreve um PRD", "documento de produto pra essa feature", "brief de produto", "alinha o problema dessa iniciativa", "pitch interno", ou quando um PO/PM precisar transformar uma ideia vaga num documento acionavel para engenharia e stakeholders. Foca em problema-antes-de-solucao, outcomes mensuraveis e escopo MVP. Faz par com senior-product-owner e a command discovery.
---

# product-brief

Skill para produzir um **one-pager de produto** (PRD enxuto) que alinha time, engenharia e stakeholders em torno de uma iniciativa **antes** de escrever codigo. A saida e um arquivo Markdown em `docs/product/`.

O objetivo nao e especificar tudo, e responder com clareza: **que problema resolvemos, para quem, por que agora, como saberemos que funcionou, e qual o menor escopo que entrega valor.**

## Quando usar esta skill

Acione quando o usuario pedir, em qualquer variacao:

- "cria um one-pager", "escreve um PRD", "brief de produto", "doc de produto"
- "documenta essa feature pra eng", "pitch interno dessa iniciativa"
- "alinha o problema dessa ideia antes de estimar"
- "transforma isso num documento acionavel"

Diferenca para outras capacidades:
- **`discovery` (command):** explora o problema e valida premissas com experimentos. Use *antes* quando o problema ainda nao esta validado. O product-brief assume que ja ha confianca suficiente para especificar.
- **`jira-story` / `senior-product-owner`:** quebram o brief validado em user stories INVEST com criterios de aceite. Use *depois*.

## Processo recomendado

1. **Coletar contexto.** Use o que ja existe na conversa. Se faltar algo critico, pergunte de forma objetiva (max 3 perguntas): qual o problema e a dor, quem e o usuario, qual o resultado esperado.

2. **Problema antes de solucao.** Se o usuario pitchar uma feature ("queremos um dashboard"), trabalhe de tras pra frente ate o problema-raiz. Registre o problema, nao a solucao disfarcada de problema.

3. **Preencher o template** (`templates/one-pager.md`):
   - **TL;DR:** 2-3 frases que qualquer stakeholder entende.
   - **Problema & evidencia:** a dor + o dado/quote que a comprova. Se nao ha evidencia, marque como **premissa a validar**.
   - **Publico-alvo:** segmento(s) e o Job To Be Done.
   - **Outcome & metricas:** metrica de sucesso com baseline + target + data; indicadores lideres.
   - **Escopo (MVP):** o menor conjunto que entrega valor. Liste explicitamente **Out of scope** — tao importante quanto o in-scope.
   - **Riscos & premissas:** classificados (desejabilidade / viabilidade / exequibilidade) com confianca.
   - **Marcos / timeline:** alto nivel, sem comprometer datas que dependem de estimativa de eng.

4. **Ser honesto sobre incerteza.** Todo numero sem fonte vira "premissa a validar". Toda data sem base de estimativa vira "a definir com eng".

5. **Salvar.** `docs/product/{slug}.md`. Ao final, sugira o proximo passo (discovery se ha premissas criticas nao validadas; senior-product-owner/jira-story se pronto pra quebrar em stories).

## Convencoes

- Datas absolutas (`AAAA-MM-DD`). Converta "proximo trimestre" etc. para datas concretas.
- Metricas sempre com **baseline + target + fonte**. "Aumentar engajamento" sem numero e anti-pattern.
- Escopo enxuto: prefira cortar para um MVP testavel a especificar a versao final.
- Linguagem: portugues (pt-BR), salvo padrao diferente em `docs/`.

## Output format

Arquivo `docs/product/{slug}.md` seguindo `templates/one-pager.md`. Ao final, reporte: caminho do arquivo, principais premissas nao validadas (se houver) e o handoff recomendado.

## Anti-patterns a evitar

- Solucao disfarcada de problema ("usuarios precisam de um dashboard").
- Metrica de sucesso sem baseline ou sem fonte.
- Escopo sem "Out of scope" — sem isso, todo MVP incha.
- Premissas tratadas como fatos porque "todo mundo concorda".
- Comprometer datas que dependem de estimativa de engenharia.
- One-pager que vira documento de 5 paginas — se passou de uma pagina densa, corte.
