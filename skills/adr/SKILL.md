---
name: adr
description: Gera Architecture Decision Records (ADR) estruturados em Markdown a partir de uma decisao tecnica, com contexto, opcoes avaliadas, trade-offs, decisao e consequencias. Use quando o usuario pedir "registra essa decisao", "cria um ADR", "documenta a escolha de X", "por que escolhemos Y", "ADR pra essa migracao", "decision record", ou quando uma decisao arquitetural relevante for tomada e precisar de registro versionado. Numera automaticamente (ADR-0001, 0002...), salva em docs/adr/ e mantem um indice. Faz par com system-architect / arquiteto-sr.
---

# adr

Skill para registrar **decisoes arquiteturais** de forma padronizada, versionada e rastreavel, no formato ADR (Architecture Decision Record — Michael Nygard). A saida e sempre um arquivo Markdown numerado em `docs/adr/`, mais a atualizacao do indice `docs/adr/README.md`.

Uma boa ADR captura o **porque** de uma decisao no momento em que ela foi tomada — para que, meses depois, ninguem precise arqueologar commits ou Slack para entender a razao de uma escolha.

## Quando usar esta skill

Acione quando o usuario pedir, em qualquer variacao:

- "registra essa decisao", "cria um ADR", "decision record"
- "documenta por que escolhemos Postgres em vez de Mongo"
- "ADR pra migracao de REST pra gRPC", "registra a escolha de arquitetura"
- "precisamos versionar essa decisao de design"
- ou logo apos uma analise de trade-offs (ex.: vinda do `system-architect`) que resultou numa escolha.

Nao usar para: documentacao de API (use `technical-writer`/`api-contract`), diagramas (use `architecture-diagram`), ou tarefas de implementacao.

## Processo recomendado

1. **Descobrir o proximo numero.** Liste `docs/adr/` e encontre o maior `NNNN`; o novo ADR e `NNNN+1`, com 4 digitos (`0001`, `0042`). Se a pasta nao existir, comece em `0001` e crie a pasta.

2. **Coletar o essencial.** Se a conversa ja tem o contexto (decisao tomada, opcoes discutidas), use-o. Caso falte algo critico, pergunte de forma objetiva — no maximo 2-3 perguntas:
   - Qual o problema/forca que motivou a decisao?
   - Quais opcoes foram consideradas?
   - O que foi decidido e por que?

3. **Preencher o template** (`templates/adr-template.md`):
   - **Status:** `Proposto` por padrao; `Aceito` se o usuario confirmar; `Substituido por ADR-XXXX` / `Deprecado` quando aplicavel.
   - **Contexto:** forcas em jogo (tecnicas, de negocio, de equipe), restricoes, requisitos. Descritivo, neutro.
   - **Opcoes consideradas:** ao menos 2. Para cada uma, prós e contras objetivos.
   - **Decisao:** o que foi escolhido, em voz ativa ("Vamos usar..."). Inclua o racional.
   - **Consequencias:** positivas, negativas e neutras. Seja honesto sobre os custos assumidos.

4. **Salvar e indexar.**
   - Salve como `docs/adr/NNNN-titulo-em-kebab-case.md`.
   - Atualize (ou crie) `docs/adr/README.md` com uma linha na tabela de indice: numero, titulo, status, data.

5. **Superseding.** Se este ADR substitui um anterior, marque o antigo como `Substituido por ADR-NNNN` e adicione um link reciproco entre os dois.

## Convencoes

- **Imutabilidade:** ADRs aceitos nao sao reescritos. Para mudar uma decisao, crie um novo ADR que substitui o anterior. (Correcoes de digitacao sao ok.)
- **Uma decisao por ADR.** Se a conversa contem varias decisoes independentes, gere um ADR para cada.
- **Data absoluta** no formato `AAAA-MM-DD`.
- **Titulo** curto e descritivo, em voz de decisao ("Usar Postgres como banco primario"), nao de pergunta.
- Linguagem do conteudo: portugues (pt-BR), salvo se o projeto usar ingles em `docs/`.

## Output format

Arquivo `docs/adr/NNNN-titulo.md` seguindo `templates/adr-template.md`, e uma linha no indice `docs/adr/README.md`:

```markdown
| ADR | Titulo | Status | Data |
|---|---|---|---|
| [0001](0001-usar-postgres.md) | Usar Postgres como banco primario | Aceito | 2026-06-22 |
```

Ao final, informe ao usuario: caminho do arquivo gerado, numero do ADR e status. Se algum campo critico ficou como suposicao, sinalize.

## Anti-patterns a evitar

- ADR que so descreve a solucao sem registrar as **alternativas rejeitadas** — perde-se o aprendizado.
- Consequencias so positivas — toda decisao tem custo; omiti-lo e desonesto.
- Reescrever um ADR aceito em vez de criar um que o substitui.
- Misturar varias decisoes num unico registro.
- "Decidimos X porque e a melhor opcao" sem o racional concreto.
