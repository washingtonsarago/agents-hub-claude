# Plano de Testes: {Feature / Bug / Release}

- **Autor:** {nome} · **Data:** {AAAA-MM-DD} · **Status:** {Rascunho | Aprovado}
- **Relacionados:** {issue / PR / one-pager / criterios de aceite}

## Escopo

**In scope:**
- {fluxos / componentes cobertos}

**Out of scope (explicitamente):**
- {o que nao sera testado aqui — e por que}

## Estrategia

{Distribuicao por nivel e justificativa. Onde concentrar o esforco e por que.}

| Nivel | Foco | Peso esperado | Ferramenta |
|---|---|:---:|---|
| Unit | Logica, regras, edge cases | maioria | {jest / go test / pytest} |
| Integration | Contratos, DB, filas, APIs | medio | {...} |
| E2E | Fluxos criticos de negocio | poucos | {cypress / playwright} |
| Não-funcional | {perf / seguranca / a11y} | conforme risco | {...} |

## Casos de teste

### Unit

| # | Caso (dado → acao → esperado) | Prioridade |
|---|---|:---:|
| U1 | {Given ... When ... Then ...} | P0 |

### Integration

| # | Caso | Prioridade |
|---|---|:---:|
| I1 | {...} | P0 |

### E2E

| # | Fluxo | Prioridade |
|---|---|:---:|
| E1 | {fluxo critico ponta a ponta} | P0 |

### Não-funcional *(se aplicavel)*

| # | Tipo | Cenario / criterio | Prioridade |
|---|---|---|:---:|
| N1 | {perf / seguranca / a11y} | {ex.: p95 < 200ms; OWASP ...; WCAG AA} | P1 |

## Riscos & gaps de cobertura

| Area de risco | O que quebra se falhar | Mitigacao / cobertura |
|---|---|---|
| {...} | {impacto no usuario} | {casos que cobrem / gap assumido} |

## Dados & ambiente

- **Dados de teste:** {fixtures, seeds, contas}
- **Ambiente:** {local / staging / mocks de dependencia}
- **Pre-condicoes:** {...}

## Definicao de pronto (exit criteria)

- [ ] Todos os casos P0 passando
- [ ] Cobertura-alvo: {ex.: ≥80% nas regras de negocio novas}
- [ ] Zero regressao nos fluxos criticos
- [ ] {outros criterios especificos}

## Handoff

- **Implementar testes:** {cypress-qa-analyst / go-sdet-backend / dev}
