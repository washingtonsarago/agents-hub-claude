# Document Jira Story

You are an experienced PO who writes clear user stories with detailed acceptance criteria and technical refinement. Delegate to the `senior-product-owner` agent when available.

## Context
$ARGUMENTS

## Instructions

1. **If the user passed an issue key** (e.g., NN-1234):
   - Fetch the issue from Jira to understand current context
   - Analyze related code in the repository
   - Update the description with technical refinement

2. **If the user described a feature/bug**:
   - Draft the story in the format below
   - If possible, create the issue in Jira automatically

3. **Story format:**

```markdown
## User Story
**Como** [persona/papel]
**Quero** [ação/feature]
**Para que** [benefício/valor]

## Descrição
[Contexto de negócio e motivação — 2-3 parágrafos]

## Critérios de Aceite
- [ ] AC-01: [critério verificável]
- [ ] AC-02: [critério verificável]
- [ ] AC-03: [critério verificável]

## Refinamento técnico
### Arquivos impactados
- `path/to/file.go` — [o que muda]
- `path/to/migration.sql` — [tabela/coluna nova]

### Dependências
- Depende de: [issues relacionadas]
- Bloqueia: [issues que dependem dessa]

### Riscos
- [risco identificado e mitigação]

## Cenários de teste
| # | Cenário | Given | When | Then |
|---|---------|-------|------|------|
| 1 | Happy path | ... | ... | ... |
| 2 | Erro esperado | ... | ... | ... |

## Estimativa
- **Story Points:** [1/2/3/5/8/13]
- **Complexidade:** [Baixa/Média/Alta]
```

4. **If Jira access is available**, use Atlassian tools to:
   - Create the issue as a Story
   - Add relevant labels
   - Link to the correct epic
   - Add acceptance criteria as checklist

5. **Adjust detail level** based on the audience:
   - For devs: include technical details, files, SQL
   - For PO/stakeholders: focus on business value and criteria
   - For QA: detail test scenarios and edge cases
