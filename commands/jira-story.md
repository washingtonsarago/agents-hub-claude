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
**As a** [persona/role]
**I want** [action/feature]
**So that** [benefit/value]

## Description
[Business context and motivation — 2-3 paragraphs]

## Acceptance Criteria
- [ ] AC-01: [verifiable criterion]
- [ ] AC-02: [verifiable criterion]
- [ ] AC-03: [verifiable criterion]

## Technical Refinement
### Impacted files
- `path/to/file.go` — [what changes]
- `path/to/migration.sql` — [new table/column]

### Dependencies
- Depends on: [related issues]
- Blocks: [issues that depend on this]

### Risks
- [identified risk and mitigation]

## Test Scenarios
| # | Scenario | Given | When | Then |
|---|----------|-------|------|------|
| 1 | Happy path | ... | ... | ... |
| 2 | Expected error | ... | ... | ... |

## Estimation
- **Story Points:** [1/2/3/5/8/13]
- **Complexity:** [Low/Medium/High]
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
