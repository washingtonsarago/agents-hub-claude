# Discovery: Pré-triagem de clareza do prompt no `/flow`
**Data:** 2026-09-17 | **Facilitador:** orquestrador `/flow` (sessão `agents-claude-2a`) | **Status:** Validated

## Problem Statement

O **dev que roda `/flow` no hub** gasta cerimônia de spec desproporcional quando **a demanda já chega clara e pequena**, porque **o DEFINE não tem nenhum sinal de entrada que module o rigor — todo prompt recebe o mesmo tratamento**, o que leva a **um volume de AC praticamente constante independente do tamanho do problema: 16 AC na 001 e 18 AC na 002**.

### 5 Whys

1. **Por que a cerimônia incomoda?** Porque a 002 — um único arquivo `agents/flutter-dart-engineer.md`, pedido sem ambiguidade — produziu 18 AC e 357 linhas de `task.md`.
2. **Por que 18 AC num arquivo markdown?** Porque o DEFINE decompõe até o critério ser verificável item a item, sem teto.
3. **Por que não há teto?** Porque o `/flow` não distingue demanda ambígua de demanda clara — o gate é o mesmo ("AC testáveis, escopo limitado").
4. **Por que isso é caro?** Porque AC é trabalho de dois lados: escrever no DEFINE e cobrir no VERIFY ("every AC has at least one automated test").
5. **Raiz:** falta um **sinal de entrada** — nada no `/flow` lê a qualidade do prompt inicial pra calibrar quanto de spec a demanda merece.

**Evidência contra-intuitiva (a que fecha o caso):** a demanda **mais** ambígua e sensível (001 — auth, PAT, decisão de espelho revertida no meio do voo, `APPROVE WITH MITIGATIONS`) fechou com **16 AC**; a demanda **mais** clara e contida (002 — um agent markdown) fechou com **18**. O volume de AC hoje não correlaciona com a dificuldade do problema. Fonte: `docs/todo/001-ahc-pat-auth/task.md`, `docs/todo/002-flutter-dart-engineer/task.md`.

## Usuários afetados

| Segment | Quem é | Pain intensity (1-5) | Frequência | Workaround atual |
|---|---|---|---|---|
| Dev/lead que abre demanda no hub | Roda `/flow` pra criar ou mudar artefato | 3 | ~1 demanda por semana (2 em ~3 semanas de histórico) | Aguenta a cerimônia, ou abandona o `/flow` e commita direto |
| Orquestrador `/flow` (o próprio modelo) | Consome o orçamento de tokens no DEFINE e no VERIFY | 4 | Toda execução | Nenhum — não tem como calibrar |
| Contributor que revisa o PR | Lê `task.md` pra entender a mudança | 2 | Todo PR de demanda | Pula pra §5 |

**Research gap (declarado):** n = 2 demandas. Não houve entrevista com os >50 devs que rodam `ahc sync`; a dor é observada no artefato, não relatada pelo usuário. Baseline fraco por construção — ver Premissa #4.

## Outcome desejado

**JTBD**

> Quando **abro uma demanda no `/flow` com o problema já bem definido na cabeça**,
> quero **que o orquestrador reconheça isso e não me faça pagar a spec completa**,
> pra que **o orçamento vá pro que é de fato incerto — o desenho e a performance — em vez de decompor um pedido que já estava claro**.

**Success metric**

```
Métrica:  nº de AC na §3 do task.md, em demandas cuja pré-triagem deu nota > 6
Baseline: 17 AC (média de 16 e 18) — as duas demandas já rodadas pelo /flow,
          sem nenhuma diferenciação por clareza
          Fonte: docs/todo/001-ahc-pat-auth/task.md, docs/todo/002-flutter-dart-engineer/task.md
Target:   ≤ 10 AC em demandas com nota > 6, com 100% de rastreabilidade AC→teste
          mantida no gate da VERIFY, até 2026-10-31
Leading:  a primeira demanda pós-merge registra nota + justificativa no task.md
          (se a nota não for gravada, a métrica não é observável — esse é o ponto
          de instrumentação do BUILD)
```

**Não-objetivo da métrica:** reduzir AC em demanda com nota ≤ 6. Se a nota baixa também encolher a spec, a mudança falhou — virou desculpa pra especificar menos, não calibração.

## Premissas & Riscos

| # | Premissa | Tipo | Confiança (1-5) | Teste |
|---|---|---|---|---|
| 1 | O orquestrador consegue pontuar clareza de forma estável — a mesma demanda não oscila de 4 pra 8 entre sessões | Feasibility | 2 ⚠️ | Backtest: aplicar a rubrica aos prompts da 001 e da 002 e ver se a ordenação bate com a dificuldade real observada |
| 2 | A nota é auto-servida: quem pontua é quem paga a conta de tokens, e nota alta = menos trabalho | Viability | **2 ⚠️ risco principal** | Rubrica fixa com eixos nomeados + justificativa obrigatória por eixo gravada no `task.md`, auditável no PR |
| 3 | Menos AC com granularidade maior não reduz cobertura real — agrupar 3 AC em 1 mantém o mesmo teste | Feasibility | 3 ⚠️ | Manter o gate da VERIFY duro (todo AC que sobrou precisa de teste que falha sem a mudança); medir cobertura, não contagem |
| 4 | 17 AC é baseline representativo | — | 2 ⚠️ | n = 2. Assumido como referência declarada, não como estatística |
| 5 | "Focar mais em performance" faz sentido no hub | Desirability | **2 ⚠️** | A maioria das demandas do hub é markdown sem superfície de runtime — a 002 é um `.md`, não tem latência. Ênfase em performance só tem o que morder quando a demanda toca código executável (`bin/ahc`, `scripts/`, `install.sh`, `mcp/`) |
| 6 | Demanda com nota ≤ 6 segue exatamente como hoje | Feasibility | 4 | Inspeção do diff: o caminho ≤ 6 não muda texto nenhum do fluxo atual |

## Experimentos

| # | Experimento | O que testa | Custo | Sinal de sucesso |
|---|---|---|---|---|
| 1 | **Backtest da rubrica** nos prompts originais da 001 e da 002 | Premissas #1 e #2 | ~1h, dentro do PLAN | A 002 pontua acima da 001, e a nota da 002 cai na faixa > 6. Se a 001 (ambígua, decisão revertida no meio) pontuar > 6, a rubrica está quebrada |
| 2 | **Dry-run na própria 003** | #1, #2 | 0 — já está acontecendo | Esta demanda se pontua com a rubrica e o resultado vai pro `task.md` |
| 3 | Rodar a próxima demanda real do hub com a pré-triagem ligada | #3 (cobertura) | 1 demanda | ≤ 10 AC **e** VERIFY fecha sem exceção no gate AC→teste |

Descartados: entrevista com os 50 devs (custa mais que a mudança — é editar um arquivo markdown) e A/B (não há tráfego; ~1 demanda/semana).

## Recomendação

**Go** — com um ajuste de escopo em cima do pedido original.

O problema é real e está medido no próprio repo: o volume de AC não correlaciona com a dificuldade da demanda, e chega a correlacionar ao contrário. A mudança é barata (um arquivo de prompt), reversível (git revert) e não toca superfície sensível nenhuma.

**Dois ajustes que o discovery recomenda levar pro DEFINE:**

1. **A ênfase em performance precisa de gatilho próprio, não pode pendurar na mesma nota.** Clareza do prompt e sensibilidade a performance são eixos independentes: um prompt cristalino pra criar um agent markdown não tem performance nenhuma pra otimizar, e mandar o PLAN "focar mais em performance" ali gera cerimônia — exatamente o que a demanda quer eliminar. Proposta: nota > 6 **e** a demanda toca superfície executável → bloco de performance obrigatório com número. Nota > 6 em demanda só de conteúdo → só o efeito de enxugar AC.
2. **O gate da VERIFY não afrouxa** (já é a decisão do lead): menos AC, não AC mais frouxo. É o que protege a Premissa #3 — sem isso, a métrica melhora e a qualidade cai junto, e o `/flow` perde a única coisa que o justifica.

**Risco aceito e registrado:** a nota é auto-atribuída por quem se beneficia dela (Premissa #2). Mitigação é transparência, não controle — rubrica fixa, justificativa por eixo gravada no `task.md`, revisável no PR. Não existe árbitro independente nesse fluxo, e inventar um custaria mais que a mudança inteira.

## Próximos passos

- [x] Baseline medido nas demandas 001 e 002
- [ ] DEFINE (`senior-product-owner`): AC verificáveis, incluindo o caminho ≤ 6 como não-regressão
- [ ] PLAN: rubrica com eixos nomeados + backtest (Experimento 1)
- [ ] BUILD: instrumentar a métrica — a nota e a justificativa precisam ser **gravadas** no `task.md`, senão nada disso é observável
