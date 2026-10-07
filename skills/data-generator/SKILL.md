---
name: data-generator
description: Gera dados de teste/seed realistas a partir de um schema (SQL DDL, Prisma/TypeORM/EF, JSON Schema ou descricao textual), produzindo um script Python reutilizavel com Faker (locale pt_BR) e saida em SQL INSERT, CSV e JSON/NDJSON, respeitando FKs, unicidade e coerencia semantica. Use quando o usuario pedir "gera dados de teste", "seed do banco", "popular a tabela", "massa de dados", "dados fake", "preencher o banco pra testar", "gerar CPF/email/nomes ficticios" ou "fixtures pra desenvolvimento". Faz par com db-audit e com os agents de backend/DBA.
---

# data-generator

Skill para produzir **dados de teste / seed realistas** a partir de um schema. A saida e um **script gerador Python reutilizavel** (usando `faker`) mais os arquivos de dados nos formatos escolhidos (SQL INSERT, CSV, JSON/NDJSON).

O objetivo e entregar massa de dados **coerente e reproduzivel**: nomes, emails, CPFs, telefones, enderecos e datas plausiveis (locale pt_BR por padrao), com relacionamentos (FKs) validos, unicidade respeitada e constraints do schema honradas — para popular ambientes de dev, rodar testes de integracao ou medir performance sem tocar em dados reais.

## Quando usar esta skill

Acione quando o usuario pedir, em qualquer variacao:

- "gera dados de teste", "seed do banco", "popular/preencher a tabela"
- "massa de dados", "dados fake/ficticios", "fixtures pra desenvolvimento"
- "preciso de 1000 clientes/pedidos pra testar", "dados pra teste de carga/performance"
- "gera CPF/email/nome/endereco ficticio", "script pra popular o banco"
- antes de rodar testes de integracao/e2e que dependem de dados, ou ao montar um ambiente de dev do zero.

Diferenca para outras capacidades:
- **`db-audit` (skill):** analisa/otimiza o schema existente. Aqui o schema e a *entrada*; a saida e a massa de dados.
- **agents de backend/DBA (`postgres-dba`, `nodejs-backend-architect`, etc.):** desenham o schema e as migrations. Esta skill *popula* o schema que eles definiram.
- **`test-plan` (skill):** decide *o que* testar; esta skill provê os *dados* de que os testes precisam.

## Pre-requisitos

Verifique e instale silenciosamente o que faltar:

```bash
python3 -c "import faker" 2>/dev/null || pip3 install --quiet faker
```

Nao depende de driver de banco: a skill **gera arquivos** (`.sql`, `.csv`, `.json`) que o usuario aplica com a ferramenta dele (`psql`, `mysql`, migration, etc.). Se o usuario pedir para aplicar diretamente, ai sim proponha o driver adequado (`psycopg`, `mysql-connector`).

## Processo recomendado

1. **Ler e entender o schema.** Aceite a entrada em qualquer forma:
   - **SQL DDL** (`CREATE TABLE ...`): extraia colunas, tipos, `NOT NULL`, `UNIQUE`, `PRIMARY KEY`, `FOREIGN KEY`, `CHECK`, `DEFAULT`.
   - **Prisma / TypeORM / EF Core:** leia o `schema.prisma`, entidades/decorators ou classes; mapeie relacoes (`@relation`, `@ManyToOne`, `HasMany`).
   - **JSON Schema:** use `properties`, `required`, `enum`, `format` (email, date-time, uuid), `minLength/maxLength`.
   - **Descricao textual:** peca o minimo faltante (max 3 perguntas): quais entidades, quais campos-chave, quais relacionamentos.

2. **Montar o grafo de dependencias (FKs).** Liste as entidades e suas FKs, depois faca uma **ordenacao topologica**: pais antes de filhos (ex.: `customers` -> `orders` -> `order_items`). Se houver ciclo (FK opcional circular), quebre-o gerando o campo nullable numa segunda passada. Nunca gere um filho referenciando um pai inexistente.

3. **Mapear cada campo para um gerador semantico.** Case o nome/tipo da coluna ao provider certo do Faker:
   - `name`, `first_name`, `last_name` -> `fake.name()` / `fake.first_name()`
   - `email` -> derivado do nome (coerencia: email casa com a pessoa), garantindo unicidade
   - `cpf`, `cnpj`, `rg` -> providers pt_BR (`fake.cpf()`, `fake.cnpj()`) — validos mas ficticios
   - `phone`, `telefone` -> `fake.phone_number()` (pt_BR)
   - endereco: `street`, `city`, `state`, `zipcode` -> providers pt_BR coerentes entre si
   - datas: `created_at`/`updated_at`/`birth_date` -> intervalos **plausiveis** (nascimento no passado, `updated_at >= created_at`)
   - `enum`/`status` -> escolha ponderada do dominio permitido (respeitar `CHECK`)
   - numericos monetarios -> faixas realistas (ex.: preco de 5 a 500), nunca negativos se a coluna nao permite.

4. **Respeitar constraints do schema.** Gere sempre dentro do que o schema aceita:
   - `UNIQUE` -> use um pool/`set` para nao repetir (email, cpf, username, slug).
   - `NOT NULL` -> nunca emita `NULL` onde e proibido.
   - `CHECK` / faixas -> respeite (idade >= 0, status ∈ dominio, `end >= start`).
   - tamanho de coluna (`VARCHAR(n)`) -> trunque/limite o gerador.
   - FK -> escolha sempre uma PK ja existente do pai.

5. **Definir volume por perfil.** Ofereca perfis e deixe o usuario escolher/ajustar por entidade:
   - **smoke** (~10 por entidade) — sanidade rapida, fixtures de teste.
   - **dev** (~1.000) — ambiente de desenvolvimento realista.
   - **perf** (~100.000+) — teste de carga/performance; use geracao em *streaming* e `COPY`/`INSERT` em lote para nao estourar memoria.

6. **Fixar a seed (reprodutibilidade).** **Sempre** parametrize `SEED` e passe para `Faker.seed()` + `random.seed()`. Nunca gere aleatorio sem seed — a mesma seed deve produzir exatamente o mesmo dataset. Reporte a seed usada.

7. **Adaptar o template e gerar.** Copie `templates/generator_template.py`, ajuste as entidades/campos/quantidades e execute:
   ```bash
   python3 generator_template.py
   ```
   Confira as primeiras linhas de cada saida (Read no `.sql`/`.json`) para validar coerencia e FKs antes de entregar.

8. **Entregar.** Reporte: script gerado, formatos de saida, entidades x quantidade, seed usada e como aplicar (ex.: `psql -f seed.sql`).

## Convencoes

- **NUNCA usar dados reais de producao nem PII de pessoas reais.** Todo dado e sintetico. Nao importe amostras de bases reais "so pra ficar realista".
- **Coerencia referencial obrigatoria:** toda FK aponta para uma PK existente do pai. Filhos so depois dos pais (ordem topologica).
- **Seed determinística:** `SEED` fixo, reproduzivel. Reporte-a sempre.
- **Locale pt_BR por padrao** (nomes, CPF/CNPJ, telefones, enderecos, cidades brasileiras). Troque so se o usuario pedir outro locale.
- **Coerencia semantica:** email casa com o nome; `updated_at >= created_at`; idade compativel com `birth_date`; status dentro do dominio.
- Linguagem: portugues (pt-BR).

## Output format

1. **Script gerador** `generator_template.py` adaptado (reutilizavel e versionavel — salve no repo, ex.: `scripts/seed/` ou `db/seed/`).
2. **Arquivos de dados** nos formatos pedidos:
   - **SQL INSERT** (`seed.sql`) — `INSERT INTO ... VALUES ...` em lote, na ordem topologica de FKs.
   - **CSV** (um arquivo por entidade) — para `COPY` / import em massa.
   - **JSON / NDJSON** — para fixtures de app/testes.

Ao final, reporte: caminho do script, formatos gerados, entidades x quantidade, **seed usada** e o comando de aplicacao.

## Anti-patterns a evitar

- **Gerar dados que violam constraints do schema** (FK inexistente, `NULL` em `NOT NULL`, duplicado em `UNIQUE`, valor fora de `CHECK`, string maior que `VARCHAR(n)`). O seed tem que *aplicar* sem erro.
- **Usar dados reais / PII** de producao ou de pessoas reais — sempre sintetico.
- **Random sem seed** — dataset irreproduzivel; impossivel depurar teste que quebra so as vezes.
- **Ignorar a ordem topologica** — inserir filho antes do pai quebra a FK.
- **Email/nome/idade incoerentes** (email `xyz123@` sem relacao com o nome, `updated_at` antes de `created_at`, idade negativa).
- **Volume unico hardcoded** — sem perfis (smoke/dev/perf), o mesmo script nao serve pra testar e pra medir carga.
- **Carregar 100k+ registros em memoria** para o perfil perf em vez de gerar em streaming/lotes.
- **Locale errado** (nomes/CPF em en_US quando o dominio e brasileiro).

## Checklist de qualidade

Antes de entregar, valide:

- [ ] Ordem topologica de FKs correta (pais antes de filhos), sem ciclo pendente.
- [ ] Toda FK referencia uma PK existente.
- [ ] `UNIQUE` respeitado (sem duplicatas em email/cpf/slug).
- [ ] Nenhum `NULL` em coluna `NOT NULL`; nenhum valor fora de `CHECK`/enum.
- [ ] Coerencia semantica: email casa com nome, `updated_at >= created_at`, datas plausiveis.
- [ ] Locale pt_BR (ou o solicitado) aplicado.
- [ ] `SEED` fixo e reportado; rodar de novo produz o mesmo dataset.
- [ ] Perfil de volume escolhido (smoke/dev/perf) e ajustavel por entidade.
- [ ] Formatos de saida pedidos gerados e validados nas primeiras linhas.
- [ ] Zero PII/dado real; tudo sintetico.
