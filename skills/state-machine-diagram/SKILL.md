---
name: state-machine-diagram
description: Gera diagramas de maquina de estados (statechart / FSM) em PNG com qualidade profissional (estilo Linear/Vercel) usando matplotlib. Use quando o usuario pedir "maquina de estados", "statechart", "diagrama de estados", "state machine", "FSM", "ciclo de vida do pedido / da entidade", "quais estados o recurso pode assumir" ou "estados e transicoes". Renderiza estados como cartoes coloridos por categoria, transicoes como setas rotuladas com evento[guarda]/acao, estado inicial como circulo preenchido e estados finais como anel duplo. Suporta self-transitions (loops).
---

# state-machine-diagram

Skill para produzir diagramas de maquina de estados (statechart / FSM, notacao UML-ish) em PNG bonitos e legiveis a partir de uma descricao textual do ciclo de vida de uma entidade (pedido, assinatura, ticket, job, sessao, documento). Casa visualmente com as skills `architecture-diagram` e `sequence-diagram` — mesma paleta, mesmo estilo de cartao com sombra, accent bar e badges — pra que arquitetura, fluxo e ciclo de vida se sintam um conjunto.

A saida e sempre um arquivo `.png` salvo no projeto (ou em `/tmp` se nao houver caminho preferido), gerado com matplotlib usando o sistema de design descrito abaixo.

## Quando usar esta skill

Acione quando o usuario pedir, em qualquer variacao:

- "maquina de estados", "state machine", "statechart", "FSM", "automato finito"
- "diagrama de estados", "diagrama de transicao de estados"
- "ciclo de vida do pedido / da assinatura / do ticket / do job"
- "quais estados o `Order` / `Payment` / `Subscription` pode assumir?"
- "quais sao os estados e as transicoes desse recurso?"
- "desenha a maquina de estados do checkout / do onboarding / do processamento"

Nao usar para:

- **Fluxo temporal entre servicos** (quem chama quem, cronologia de mensagens) → use a skill `sequence-diagram`.
- **Componentes lado a lado / topologia** (modulos, camadas, infra) → use a skill `architecture-diagram`.
- **Entidades + relacoes de dados** (tabelas, cardinalidade) → use a skill `er-diagram`.
- Maquinas muito grandes (> ~10 estados ou > ~20 transicoes) — divida em sub-maquinas ou agrupe estados em superestados (ver Variantes).

Regra pratica: se o foco e **"em que estado a entidade esta e o que a faz mudar de estado"**, e esta skill. Se o foco e **"a ordem em que os servicos conversam"**, e `sequence-diagram`.

## Pre-requisitos

Verifique e instale silenciosamente o que faltar:

```bash
python3 -c "import matplotlib" 2>/dev/null || pip3 install --quiet matplotlib
```

Nao depende de plantuml, mermaid-cli, graphviz ou java.

## Processo recomendado

1. **Coletar a maquina de estados**
   - Se existir `ARCHITECTURE.md`, `README.md`, `AGENTS.md`, enums de status no codigo (`enum OrderStatus`, colunas `status`, `state`) ou migrations, leia primeiro pra descobrir os estados reais.
   - Pergunte ao usuario (se faltar): estado inicial, estado(s) final(is), lista de estados intermediarios, e para cada transicao qual e o **evento** que a dispara (e, se houver, a **guarda** e a **acao**).
   - Identifique estados terminais de sucesso vs de erro/cancelamento — isso define a cor.

2. **Modelar os estados e transicoes**
   - Lista de estados, cada um com `categoria` (`normal | active | wait | success | error`), coordenada `(x, y)` e se e `final`.
   - Um pseudo-estado inicial apontando pro primeiro estado real.
   - Lista de transicoes: `from`, `to`, `label` na notacao `evento [guarda] / acao`, e `curve` pra arquear quando necessario.
   - Self-transitions (loops de retry / heartbeat / refresh) no proprio estado.

3. **Adaptar o template**
   - Copie `templates/state_machine_template.py` para `/tmp/<nome>.py`.
   - Substitua as chamadas `state_box(...)`, `initial_marker(...)`, `transition(...)` e `self_transition(...)` pelos dados reais.
   - Mantenha o sistema de design (cores, helpers, gradiente, dpi).

4. **Gerar e validar**
   - `python3 /tmp/<nome>.py`.
   - Use Read no PNG pra conferir: sem sobreposicao de cartoes nem de labels, setas encostam na borda dos estados, estado inicial e finais claros, cada transicao tem um evento.
   - Se houver sobreposicao, ajuste as coordenadas `(x, y)` dos estados ou a `curve` das transicoes.

5. **Salvar no projeto**
   - Caminho preferido: `docs/diagrams/<nome>-states.png` ou `docs/architecture/<nome>-states.png` se a pasta existir.
   - Senao: raiz do projeto ou `/tmp` se for descartavel.

## Sistema de design

Consistente com `architecture-diagram` e `sequence-diagram` — leia a especificacao de cores e cartoes la pra contexto comum. O que e especifico da maquina de estados aqui:

### Estado (cartao arredondado)

- Mesmo cartao das outras skills (rounded 0.18, sombra suave, accent bar 0.11).
- Header: nome do estado (bold, cor da borda) + subtitle opcional (italico, cinza) pra `entry/exit/do-activity` ou uma descricao curta.
- Cor escolhida pela **categoria**:

```
normal   -> indigo  (#4338ca / #6366f1)   estado comum do fluxo
active   -> cyan    (#0e7490 / #0891b2)   em processamento
wait     -> slate   (#334155 / #475569)   espera / pendente / bloqueado
success  -> emerald (#047857 / #10b981)   terminal de sucesso
error    -> red     (#b91c1c / #dc2626)   erro / cancelado / rejeitado
```

### Estado inicial (pseudo-estado)

- Pequeno **circulo preenchido** (preto no tema claro, `INK` no escuro) com uma seta solida para o primeiro estado real.
- Sem rotulo (a nao ser que o inicio tenha uma acao — ai vai no label da seta).

### Estados finais (terminais)

- **Anel duplo**: uma moldura externa arredondada em volta do cartao (parametro `final=True` no `state_box`).
- Geralmente categoria `success` (verde) ou `error` (vermelho).
- Um estado final nunca tem transicao de saida.

### Transicoes

- Seta solida `-|>` da borda de um estado a borda do outro (o helper calcula o ponto de contato na borda, sem "vazar" pra dentro do cartao).
- Rotulo em **badge** com a notacao UML: `evento [guarda] / acao`
  - **evento** — o gatilho (obrigatorio; ex.: `pagar`, `despachar`, `timeout`).
  - **[guarda]** — condicao booleana opcional entre colchetes (ex.: `[valor ok]`, `[dentro do prazo]`).
  - **/ acao** — efeito colateral opcional apos a barra (ex.: `/ captura`, `/ libera estoque`).
- Cor da seta segue a natureza da transicao: verde pra avanco feliz, vermelho pra erro/cancelamento, indigo/slate pra transicoes neutras.
- Use `curve` (arc3) pra arquear e evitar cruzamento/sobreposicao quando dois estados trocam setas nos dois sentidos.

### Self-transition (loop)

- Alca curva (Bezier) que sai e volta ao mesmo estado, com cabeca de seta na chegada.
- Serve pra retry, heartbeat, refresh de token, reprocessamento — algo que mantem a entidade no mesmo estado.
- Rotulada com a mesma notacao `evento [guarda] / acao`. Escolha o lado (`top`/`bottom`/`left`/`right`) que estiver livre.

### Layout

- Estados posicionados por coordenadas `(x, y)` numa lista — o usuario ajusta livremente.
- Sugestao: fluxo principal (happy path) numa linha horizontal no topo; terminais de erro/sucesso numa linha abaixo.
- Setas curvas (`arc3`) quando necessario pra nao cruzar cartoes.

### Fundo

- Gradiente vertical `#f4f6fb` -> `#e6eaf3` (light) ou `#1a1b26` solido (dark) — identico ao das outras skills. DPI >= 180 (padrao 200).

## Template de referencia

Use `templates/state_machine_template.py` como ponto de partida. Ele ja contem:

- Helpers `state_box()`, `initial_marker()`, `final_ring` (via `final=True`), `transition()`, `self_transition()`, `legend()`, `title()`.
- Registro automatico de geometria (`GEOM`) pra as setas encostarem na borda certa.
- Paleta completa por categoria + gradiente de fundo.
- Exemplo funcional: ciclo de vida de um pedido — `initial -> pending_payment -> paid -> shipped -> delivered` (final), com erros `pending_payment -> cancelled` (final) e `paid -> refunded` (final), mais uma self-transition de retry em `pending_payment`.

Para adaptar: substitua as chamadas `state_box`/`transition`/`self_transition`. Mantenha helpers + paleta intactos.

## Variantes que voce pode oferecer ao usuario

Apos gerar a primeira versao, ofereca:

- **Com vs sem guardas/acoes** — versao enxuta so com o evento, ou completa com `[guarda] / acao`.
- **Tema claro vs escuro** (`THEME = "dark"`).
- **Agrupamento em superestados** — envolver um conjunto de estados relacionados (ex.: todos os "em transporte") numa moldura tracejada com pilula, no estilo `section()` da architecture-diagram, pra hierarquizar.
- **Happy path vs error paths** — uma imagem so com o fluxo feliz e outra destacando cancelamentos/reembolsos.
- **Versao compacta** — sem subtitles nos estados pra caber mais estados.

## Anti-padroes (nao faca)

- **Estado sem saida que nao seja final** — todo estado nao-terminal precisa de pelo menos uma transicao de saida (senao vira deadlock silencioso). Se e ponto final, marque `final=True`.
- **Transicao sem evento** — toda seta precisa de um gatilho (evento) rotulado; a unica excecao e a transicao automatica de conclusao (do-activity que termina), que deve ser explicitada.
- **Estado inicial ou final ambiguo** — sempre um unico circulo inicial preenchido; finais sempre com anel duplo. Nao deixe o leitor adivinhar onde comeca/termina.
- **Setas cruzando cartoes** — reposicione `(x, y)` ou use `curve` pra desviar.
- **Misturar cronologia de servicos aqui** — se aparecer "servico A chama servico B", isso e `sequence-diagram`, nao maquina de estados.
- Nao empilhar mais de ~10 estados na mesma imagem — agrupe ou divida.
- Nao gerar SVG/Mermaid/PlantUML por padrao — usuario quase sempre quer PNG.
- Nao usar Comic Sans, Times ou serifs — sans-serif geometrica. Sem emojis no PNG.

## Checklist de qualidade

Antes de entregar, leia o PNG e valide visualmente:

- [ ] Titulo e subtitulo legiveis.
- [ ] Existe exatamente um estado inicial (circulo preenchido) com seta pro primeiro estado.
- [ ] Cada estado final tem anel duplo e nenhuma transicao de saida.
- [ ] Todo estado nao-terminal tem ao menos uma transicao de saida (sem deadlock).
- [ ] Toda transicao tem um evento no rotulo; guarda `[...]` e acao `/ ...` quando aplicavel.
- [ ] Cores das categorias coerentes (sucesso verde, erro vermelho, espera slate, etc.).
- [ ] Setas encostam na borda dos estados (nao vazam pra dentro nem ficam curtas).
- [ ] Labels em badge nao se sobrepoem entre si nem cobrem os cartoes.
- [ ] Self-transitions (se houver) com cabeca de seta clara e rotulo legivel.
- [ ] Resolucao >= 180 dpi.
- [ ] Arquivo salvo em local versionavel (`docs/diagrams/` ou `docs/architecture/`).
