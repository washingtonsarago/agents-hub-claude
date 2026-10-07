---
name: er-diagram
description: Gera diagramas ER (Entity-Relationship) em PNG com qualidade profissional usando matplotlib. Use quando o usuario pedir um "diagrama ER", "diagrama de banco", "diagrama de schema", "visualizar o schema", "como se relacionam essas tabelas", "modelagem de dados visual", "imagem do schema". Le opcionalmente um schema.sql / migration / pg_dump pra extrair tabelas e relacoes; ou recebe descricao textual. Cada tabela vira um cartao com colunas + tipos + constraints (PK/FK/UQ/NN/IX); relacoes ligam colunas com multiplicidade (1:1, 1:N, N:1, M:N) nas pontas.
---

# er-diagram

Skill para produzir diagramas ER (Entity-Relationship) em PNG bonitos e legiveis a partir de um schema SQL (DDL / migration / `pg_dump --schema-only`) ou de uma descricao textual de entidades. Casa visualmente com `architecture-diagram` e `sequence-diagram` — mesma paleta, mesmo estilo de cartao — pra que se sintam um conjunto.

A saida e sempre um arquivo `.png` salvo no projeto (ou em `/tmp` se nao houver caminho preferido), gerado com matplotlib.

## Quando usar esta skill

Acione quando o usuario pedir, em qualquer variacao:

- "diagrama ER", "ER diagram", "diagrama de schema", "diagrama de banco"
- "visualizar o schema do Postgres / Mysql"
- "como se relacionam as tabelas `orders`, `customers`, `payments`?"
- "le essa migration e desenha"
- "modelagem visual do banco"
- "imagem do schema do servico X"

Nao usar para:

- Diagrama de arquitetura de sistema (componentes lado a lado) → `architecture-diagram`.
- Diagrama de sequencia / fluxo de chamadas → `sequence-diagram`.
- Schema enorme (> 30 tabelas) — corte por bounded context (ex.: so o subgrafo `payments`) ou gere multiplos PNGs.

## Pre-requisitos

Verifique e instale silenciosamente o que faltar:

```bash
python3 -c "import matplotlib" 2>/dev/null || pip3 install --quiet matplotlib
```

Opcional pra ler schema ao vivo de Postgres:

```bash
python3 -c "import psycopg" 2>/dev/null || pip3 install --quiet "psycopg[binary]"
```

Nao depende de graphviz, dbdiagram, mermaid ou plantuml.

## Processo recomendado

1. **Coletar schema**
   - Se o usuario apontar um arquivo (`migrations/001_init.sql`, `schema.sql`, `prisma/schema.prisma`), leia.
   - Se apontar um banco vivo, prefira ler `pg_catalog` / `information_schema` (nao escreva nada — apenas SELECT).
   - Se nao houver, peca a lista de tabelas com colunas e constraints.

2. **Identificar bounded contexts**
   - Agrupe tabelas por dominio observavel: prefixo (`order_*`), schema (`payments.*`), ou agrupamento natural.
   - Cada grupo recebe uma cor (`COL_USERS`, `COL_CATALOG`, `COL_ORDERS`, `COL_PAYMENTS`, `COL_AUDIT`, etc.).
   - Maximo 5–6 cores num diagrama; se houver mais bounded contexts, divida em diagramas.

3. **Modelar tabelas**
   - Cada tabela: `(table_name, columns)` onde `columns` e lista de `(col, type, [constraints])`.
   - Constraints suportadas: `PK`, `FK`, `UQ`, `NN`, `IX`. Use combinacoes (ex.: `["FK", "NN", "UQ"]`).
   - Tipos curtos (`uuid`, `varchar(120)`, `integer`, `timestamptz`, `boolean`, `bigserial`, `jsonb`).
   - Mostre `created_at` / `updated_at` / `deleted_at` se forem relevantes pra historia (soft delete vira tema na revisao).

4. **Modelar relacoes**
   - Lista de `(from_table, to_table, from_col, to_col, kind, color, [label], [curve])`.
   - `kind`: `'1:1'`, `'1:N'`, `'N:1'`, `'M:N'`. Multiplicidade aparece nas pontas.
   - Cor: prefira a cor do bounded context da tabela "filha" (FK).
   - `curve`: 0.0 padrao; use 0.1–0.25 (positivo ou negativo) pra evitar cruzamento.
   - Para M:N: desenhe ate a tabela junction (ex.: `order_items`) ao inves de uma seta direta.

5. **Adaptar o template**
   - Copie `templates/er_template.py` para `/tmp/<nome>.py`.
   - Substitua os blocos `table_card(...)` e `relation(...)` pelos seus.
   - Ajuste `WIDTH/HEIGHT` se houver mais de 8 tabelas.
   - Mantenha helpers + paleta intactos.

6. **Gerar e validar**
   - `python3 /tmp/<nome>.py`.
   - Use Read no PNG: nao deve haver linhas atravessando cartoes, multiplicidades devem estar legiveis nas pontas, cores coerentes por dominio.
   - Se houver, ajuste `(x, y)` das tabelas pra reposicionar.

7. **Salvar no projeto**
   - Caminho preferido: `docs/database/er-<dominio>.png` ou `docs/architecture/er-<dominio>.png`.
   - Senao: raiz ou `/tmp`.

## Sistema de design

Consistente com `architecture-diagram` e `sequence-diagram` — mesma paleta base, mesmas regras de cartao/sombra/gradiente. O que e especifico de ER aqui:

### Cartao de tabela

- Cabecalho colorido (cor `accent` do bounded context) com nome da tabela em branco bold + subtitulo opcional (nome do schema/contexto) a direita.
- Linha separadora fina abaixo do header.
- Body: lista de colunas em rows de altura fixa `0.32`.
- Cada row: `nome` (esquerda, bold), `tipo` (direita, italico, cor `TYPE_COLOR`), pilulas de constraint (extrema direita).
- Sombra suave (mesma da `architecture-diagram`).

### Pilulas de constraint

Cada constraint vira uma pilula pequena (largura 0.42, altura 0.20) com cor propria:

```
PK  -> amarelo  (#fef9c3 / #854d0e)  — primary key
FK  -> azul     (#dbeafe / #1e40af)  — foreign key
UQ  -> rosa     (#fce7f3 / #9d174d)  — unique
NN  -> indigo   (#e0e7ff / #3730a3)  — not null
IX  -> verde    (#ecfdf5 / #047857)  — index secundario
```

### Relacoes

- Linha simples (`arrowstyle='-'`, sem cabeca de seta) ligando o lado mais proximo das duas tabelas (escolhe automaticamente esquerdo vs direito).
- Multiplicidade nas duas pontas em badge (`1` / `N` / `M`), cor da relacao.
- Label opcional no meio (ex.: `places`, `pays for`, `audited by`).
- `curve` ate +-0.25 pra evitar choque com outras relacoes.

### Bounded contexts (cores)

Uma cor por dominio:

```
users     -> indigo  (#3730a3 / #4338ca)
catalog   -> cyan    (#0e7490 / #0891b2)
orders    -> emerald (#047857 / #10b981)
payments  -> fuchsia (#86198f / #a21caf)
audit     -> amber   (#b45309 / #d97706)
domain X  -> violet  (#6b21a8 / #9333ea)
log       -> slate   (#334155 / #475569)
```

### Layout

- Grade leve: 3 colunas (esquerda, centro, direita), 1–3 linhas dependendo do numero de tabelas.
- Tabelas do mesmo bounded context proximas espacialmente (mesma coluna ou linha).
- Tabela junction (M:N) entre as duas tabelas que conecta.
- Legenda de bounded contexts no canto inferior direito; legenda de constraints ao lado.

### Fundo

- Gradiente `#f4f6fb` -> `#e6eaf3` (light) ou `#1a1b26` solido (dark) — identico aos outros skills da familia.

## Template de referencia

Use `templates/er_template.py` como ponto de partida. Ele ja contem:

- Helpers `table_card()`, `relation()`, `legend()`, `title()`, `constraint_pill()`.
- Paleta de bounded contexts + cores de constraint.
- Gradiente de fundo.
- Exemplo funcional: 7 tabelas (users, addresses, products, orders, order_items, payments, audit_log) com 6 relacoes (1:N e 1:1) e 2 legendas (contextos + constraints).

Para adaptar: substitua as chamadas `table_card(...)` e `relation(...)`. Mantenha helpers + paleta.

## Variantes que voce pode oferecer ao usuario

- Tema claro vs escuro.
- "Subgrafo por dominio" — apenas uma cor / um bounded context (ex.: so payments + suas FKs).
- "Visao logica" sem tipos (so colunas + constraints, mais limpa pra apresentacao).
- "Visao desnormalizada" se houver views materializadas (mostre a view como cartao verde com ref pras tabelas-fonte).
- "Visao indexada" — destaque so as colunas com `IX` (uteis pra discussao de perf).

## Anti-padroes (nao faca)

- Nao desenhar todas as colunas auditoriais (`created_at`, `updated_at`, `deleted_at`, `created_by`, etc.) em todas as tabelas — repete e polui. Mostre so onde for parte da historia.
- Nao gerar diagrama com mais de ~12 tabelas — corte por bounded context.
- Nao usar setas `M:N` direto entre duas tabelas; sempre desenhe a tabela junction explicita.
- Nao misturar mais de 6 cores de bounded context num diagrama.
- Nao deixar relacoes cruzando cartoes — reposicione.
- Nao gerar SVG/Mermaid/dbml por padrao — usuario quase sempre quer PNG.

## Checklist de qualidade

Antes de entregar, leia o PNG e valide visualmente:

- [ ] Cada tabela tem header colorido + nome legivel + subtitulo do dominio.
- [ ] Constraints PK/FK/UQ/NN/IX visiveis na linha certa, sem sobreposicao com o tipo.
- [ ] Tipos italico cyan, nomes bold escuro — boa hierarquia visual.
- [ ] Multiplicidade `1` / `N` / `M` em badge nas duas pontas de cada relacao.
- [ ] Nenhuma relacao atravessa um cartao de tabela.
- [ ] Cores consistentes por bounded context.
- [ ] Legenda de contextos + legenda de constraints presentes.
- [ ] Resolucao >= 180 dpi.
- [ ] Arquivo salvo em local versionavel (`docs/database/`).
