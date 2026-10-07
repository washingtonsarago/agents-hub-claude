---
name: sequence-diagram
description: Gera diagramas de sequencia em PNG com qualidade profissional (estilo Linear/Vercel) usando matplotlib. Use quando o usuario pedir um "diagrama de sequencia", "sequence diagram", "fluxo de request", "fluxo do pedido", "como o servico A chama o servico B", "diagrama de webhook" ou similar. Renderiza participantes verticais como cartoes, mensagens horizontais como setas com badge, e suporta blocos opt/alt/loop/par e notas. Solidas para sync, tracejadas para async/return, vermelho para erro.
---

# sequence-diagram

Skill para produzir diagramas de sequencia (UML-ish) em PNG bonitos e legiveis a partir de uma descricao textual de um fluxo (REST/gRPC/event-driven/saga). Casa visualmente com a skill `architecture-diagram` — mesma paleta, mesmo estilo de cartao e badges — pra que arquitetura e fluxo lado a lado se sintam um conjunto.

A saida e sempre um arquivo `.png` salvo no projeto (ou em `/tmp` se nao houver caminho preferido), gerado com matplotlib usando o sistema de design descrito abaixo.

## Quando usar esta skill

Acione quando o usuario pedir, em qualquer variacao:

- "diagrama de sequencia", "sequence diagram", "uml de sequencia"
- "fluxo do request", "fluxo do pedido", "fluxo de checkout / login / webhook"
- "como o `payment-service` chama o `order-service`?"
- "desenha o handshake gRPC / o saga / a coreografia de eventos"
- "uma imagem do fluxo de retry"

Nao usar para:

- Diagramas de arquitetura (componentes lado a lado) → use a skill `architecture-diagram`.
- Diagramas ER (entidades + relacoes) → use a skill `er-diagram`.
- Sequencias muito longas (> ~15 mensagens) — divida em dois diagramas (happy path / error paths) ou marque o trecho relevante com um bloco `opt`.

## Pre-requisitos

Verifique e instale silenciosamente o que faltar:

```bash
python3 -c "import matplotlib" 2>/dev/null || pip3 install --quiet matplotlib
```

Nao depende de plantuml, mermaid-cli, graphviz ou java.

## Processo recomendado

1. **Coletar o fluxo**
   - Se existir `ARCHITECTURE.md`, `README.md`, `AGENTS.md` ou contratos OpenAPI/AsyncAPI, leia primeiro pra entender quem fala com quem.
   - Pergunte ao usuario (se faltar): participantes (esq -> dir, na ordem em que entram no fluxo), happy path, alternativas/erros, qual e a unidade de async (fire-and-forget vs eventual consistency).
   - Identifique notas relevantes (idempotencia, timeout, retry, circuit breaker) — viram `note(...)`.

2. **Modelar a sequencia**
   - Lista de participantes com `role` (`client | edge | app | service | worker | db | ext`) — define a cor.
   - Lista de mensagens cronologica (de cima pra baixo). Cada uma: `from`, `to`, `label`, `kind` (`sync | return | async | error`), `role_to` (cor da seta segue o destinatario).
   - Blocos opcionais: `opt` (passo condicional), `alt` (caminhos alternativos com `else`), `loop` (repeticao), `par` (paralelo).

3. **Adaptar o template**
   - Copie `templates/sequence_template.py` para `/tmp/<nome>.py`.
   - Substitua `PARTICIPANTS` e `MESSAGES`. Adicione `block(...)` e `note(...)` se relevante.
   - Mantenha o sistema de design (cores, helpers, gradiente).

4. **Gerar e validar**
   - `python3 /tmp/<nome>.py`.
   - Use Read no PNG pra conferir: legibilidade, sem sobreposicao de labels, setas chegam nas lifelines certas, ordem cronologica clara.
   - Se houver, ajuste `y` das mensagens (espaco vertical) ou aumente `HEIGHT`.

5. **Salvar no projeto**
   - Caminho preferido: `docs/diagrams/<nome>-sequence.png` ou `docs/architecture/<nome>-sequence.png` se a pasta existir.
   - Senao: raiz do projeto ou `/tmp` se for descartavel.

## Sistema de design

Consistente com `architecture-diagram` — leia a especificacao de cores e cartoes la pra contexto comum. O que e especifico de sequence aqui:

### Participante (cartao no topo da lifeline)

- Mesmo cartao da `architecture-diagram` (rounded 0.18, sombra, accent bar 0.10)
- Header: nome (bold, cor da borda) + subtitle (cinza, ex.: "kong", "go", "PSP")
- Cor escolhida pelo `role`:

```
client    -> indigo  (#3730a3 / #4338ca)
edge      -> cyan    (#0e7490 / #0891b2)
app       -> indigo  (#4338ca / #6366f1)
service   -> emerald (#047857 / #10b981)
worker    -> fuchsia (#86198f / #a21caf)
db        -> red     (#b91c1c / #dc2626)
ext       -> slate   (#334155 / #475569)
```

### Lifeline

- Linha vertical pontilhada `(0, (2, 3))` cinza-claro do header ate o rodape.
- Largura fixa 1.2.

### Mensagens

- **sync request** — solida, `arrowstyle='-|>'`, lw 1.6, cor do destinatario.
- **sync return** — tracejada `(0, (4, 3))`, `-|>`, lw 1.3, cor do destinatario, label em italico.
- **async** (fire-and-forget) — tracejada, `arrowstyle='->'` (cabeca aberta), lw 1.4, cor `worker` ou destinatario, label italico.
- **error** — solida vermelha (`COL_DATA[2]`), lw 1.8, label com prefixo `ERROR:` em negrito.

Label sempre em badge `bbox=round,pad=0.18` com fundo `BG_TOP` alpha 0.85 — evita choque com a lifeline pontilhada por baixo.

### Blocos (opt / alt / loop / par)

- Retangulo arredondado com borda tracejada `(0, (6, 4))`.
- Pilula colorida no canto superior esquerdo com o tipo (`opt`, `alt`, `loop`, `par`).
- Condicao opcional ao lado da pilula entre `[colchetes]` em italico.
- Cor padrao: `COL_SVC[2]` (verde). Para erro use `COL_DATA[2]`.

### Notas (sticky notes)

- Cartao pequeno amarelo (`COL_NOTE`) com sombra suave.
- Texto em italico, cor da borda.
- Use pra: idempotencia, timeout, retry policy, circuit breaker, contracao de rate-limit, observacao operacional.

### Layout

- Participantes distribuidos uniformemente em `cx = margin + i * col_width`.
- Header na parte de cima (`HEADER_TOP = HEIGHT - 1.6`).
- Mensagens da `y = HEADER_TOP - 1.0` ate `y = LIFELINE_BOTTOM + 0.5`. Espacamento minimo entre mensagens consecutivas: 0.6.
- Legenda no canto inferior direito.

### Fundo

- Gradiente vertical `#f4f6fb` -> `#e6eaf3` (light) ou `#1a1b26` solido (dark) — identico ao da skill arquitetural.

## Template de referencia

Use `templates/sequence_template.py` como ponto de partida. Ele ja contem:

- Helpers `participant_box()`, `lifeline()`, `message()`, `block()`, `note()`, `legend()`, `title()`.
- Paleta completa por papel.
- Gradiente de fundo.
- Exemplo funcional: payment flow com 6 participantes, 11 mensagens (incluindo async + erro), 1 nota e legenda.

Para adaptar: substitua `PARTICIPANTS` e `MESSAGES`. Mantenha helpers + paleta intactos.

## Variantes que voce pode oferecer ao usuario

Apos gerar a primeira versao, ofereca:

- Tema claro vs escuro.
- Versao "happy path" (so sync + return) + "error paths" separada.
- Versao com `opt`/`alt` blocos pra mostrar caminhos alternativos.
- Versao "saga" pra distinguir o coordenador (geralmente `worker`) das compensacoes.
- Versao "estreita" (sem subtitulos nos participantes) pra mais participantes caberem.

## Anti-padroes (nao faca)

- Nao misturar mais de 7 participantes — divida o fluxo.
- Nao deixar mais de 15 mensagens na mesma imagem — extraia o trecho menos critico pra um diagrama secundario.
- Nao deixar setas se cruzando sem necessidade — replaneje a ordem dos participantes.
- Nao usar `bidirectional arrows` (cabeca de seta nas duas pontas) — sempre `from -> to`, com retorno como mensagem separada.
- Nao gerar SVG/Mermaid/PlantUML por padrao — usuario quase sempre quer PNG.
- Nao usar Comic Sans, Times ou serifs — sans-serif geometrica.
- Nao usar emojis no PNG.

## Checklist de qualidade

Antes de entregar, leia o PNG e valide visualmente:

- [ ] Titulo e subtitulo legiveis.
- [ ] Cada participante tem cor coerente com seu papel.
- [ ] Lifelines pontilhadas alcancam a base do canvas.
- [ ] Cada mensagem tem label legivel (nao sobreposto a outra label nem a lifeline).
- [ ] Setas batem exatamente nas lifelines (nao "vazam" pra dentro do cartao do participante).
- [ ] Sync solidas / async tracejadas / erro vermelho — visualmente distintas.
- [ ] Blocos `opt`/`alt`/`loop` envolvem as mensagens corretas (nao cortam labels).
- [ ] Resolucao >= 180 dpi.
- [ ] Arquivo salvo em local versionavel (`docs/diagrams/` ou `docs/architecture/`).
