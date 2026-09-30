---
name: test-plan
description: Gera um plano de testes estruturado em Markdown para uma feature, bug ou release, cobrindo escopo, estrategia (piramide de testes), casos por nivel (unit/integration/e2e), criterios de aceite, riscos e cobertura. Use quando o usuario pedir "cria um plano de testes", "test plan dessa feature", "que cenarios testar", "estrategia de testes pra isso", "casos de teste pro checkout", "matriz de testes", ou antes de implementar/revisar testes de uma mudanca relevante. Faz par com cypress-qa-analyst, go-sdet-backend e a command feature-flow.
---

# test-plan

Skill para produzir um **plano de testes** acionavel a partir de uma feature, bug ou release. A saida e um arquivo Markdown em `docs/test-plans/`.

O objetivo e responder, antes de escrever um unico teste: **o que precisa ser testado, em que nivel, com que prioridade, e como saberemos que esta coberto** — alinhando QA, devs e PO no mesmo entendimento de "pronto".

## Quando usar esta skill

Acione quando o usuario pedir, em qualquer variacao:

- "cria um plano de testes", "test plan dessa feature/release"
- "que cenarios/casos testar", "estrategia de testes pra isso"
- "matriz de testes", "como cubro essa mudanca"
- antes de implementar testes de uma feature relevante, ou ao revisar a cobertura de um PR.

Diferenca para outras capacidades:
- **`cypress-qa-analyst` / `go-sdet-backend` (agents):** *escrevem* os testes. Use o plano *antes* para decidir o que escrever; delegue a implementacao a eles.
- **`feature-flow` (command):** orquestra a feature ponta a ponta; o test-plan e o artefato de qualidade dentro desse fluxo.

## Processo recomendado

1. **Coletar contexto.** Use o que ja existe (descricao da feature, criterios de aceite, codigo). Se faltar algo critico, pergunte de forma objetiva (max 3): qual o comportamento esperado, quais as regras de negocio, o que e fora de escopo.

2. **Definir escopo.** O que esta **in scope** e — explicitamente — **out of scope**. Liste as features/fluxos afetados.

3. **Escolher a estrategia (piramide de testes).** Decida a distribuicao por nivel e justifique:
   - **Unit** — logica pura, regras de negocio, branches/edge cases. A base, a maioria.
   - **Integration** — contratos entre modulos, DB, filas, APIs externas (com mocks/contract tests).
   - **E2E** — poucos, criticos: os fluxos de maior valor de negocio (ex.: checkout, login).
   - Sinalize tambem: testes de **performance**, **seguranca** e **acessibilidade** se a mudanca tocar essas superficies.

4. **Derivar casos de teste.** Para cada nivel, liste casos cobrindo:
   - **Happy path** · **edge cases** (limites, vazio, max) · **caminhos de erro** (input invalido, falha de dependencia) · **regras de negocio** especificas.
   - Use particionamento de equivalencia e analise de valor-limite — nao liste casos redundantes.
   - Marque a **prioridade** de cada caso (P0 critico / P1 importante / P2 desejavel).

5. **Riscos & cobertura.** Aponte areas de maior risco (o que quebra o usuario se falhar), gaps conhecidos de cobertura e dados/ambiente de teste necessarios.

6. **Definir o "pronto".** Criterios objetivos de saida: casos P0 passando, cobertura-alvo, zero regressao nos fluxos criticos.

7. **Salvar.** `docs/test-plans/{slug}.md` (`templates/test-plan.md`). Ao final, sugira o handoff (cypress-qa / go-sdet para implementar).

## Convencoes

- Casos com **prioridade** sempre (P0/P1/P2) — um plano sem prioridade nao ajuda a cortar escopo.
- Cada caso descreve **dado/contexto → acao → resultado esperado** (estilo Given/When/Then quando couber).
- Seja honesto sobre **gaps**: o que nao sera testado e por que.
- Datas absolutas (`AAAA-MM-DD`). Linguagem: portugues (pt-BR).

## Output format

Arquivo `docs/test-plans/{slug}.md` seguindo `templates/test-plan.md`. Ao final, reporte: caminho, total de casos por nivel/prioridade, riscos em destaque e o handoff recomendado.

## Anti-patterns a evitar

- So happy path — a maior parte dos bugs vive em edge cases e caminhos de erro.
- Piramide invertida: muitos E2E lentos/frageis, poucos unit.
- Casos sem prioridade — impossivel cortar escopo sob pressao de prazo.
- Casos redundantes que testam a mesma particao de equivalencia.
- Ignorar dados/ambiente necessarios (o plano nao executa na pratica).
- Plano que nao define criterio objetivo de "pronto".
