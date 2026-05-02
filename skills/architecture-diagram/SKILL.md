---
name: architecture-diagram
description: Gera diagramas de arquitetura em PNG com qualidade profissional (estilo Linear/Vercel) usando matplotlib. Use quando o usuario pedir um diagrama, "uma imagem", "um PNG", "um desenho" ou "um esquema visual" da arquitetura, sistema, fluxo, infraestrutura ou componentes. Tambem aplicavel quando o usuario pedir para "desenhar", "visualizar" ou "ilustrar" como modulos/servicos se relacionam. Produz cartoes com sombra suave, barra de acento colorida, secoes em pilulas, setas curvas com rotulos em badge e paleta moderna por camada.
---

# architecture-diagram

Skill para produzir diagramas de arquitetura em PNG bonitos e legiveis a partir de uma descricao textual da arquitetura ou de uma leitura previa de `ARCHITECTURE.md` / `README.md` / `AGENTS.md` do projeto.

A saida sempre e um arquivo `.png` salvo no projeto (ou em `/tmp` se nao houver caminho preferido), gerado com matplotlib usando o sistema de design descrito abaixo.

## Quando usar esta skill

Acione quando o usuario pedir, em qualquer variacao:

- "gera um png da arquitetura", "desenha a arquitetura", "uma imagem da arquitetura"
- "diagrama do sistema / fluxo / pipeline / infraestrutura"
- "ilustracao", "esquema visual", "deixa bonito", "estilo apresentacao"
- "como esses componentes se conectam visualmente"
- pedidos para gerar variantes (tema escuro, tema claro, versao polida)

Nao usar para diagramas que ja precisam de notacao formal especifica (C4 com PlantUML, sequencia UML, ER). Para esses casos, use ferramentas dedicadas (mermaid, plantuml).

## Pre-requisitos

Verifique e instale silenciosamente o que faltar:

```bash
python3 -c "import matplotlib" 2>/dev/null || pip3 install --quiet matplotlib
```

Nao depende de graphviz, mermaid ou plantuml (raramente instalados).

## Processo recomendado

1. **Coletar contexto da arquitetura**
   - Se existir `ARCHITECTURE.md`, `README.md` ou `AGENTS.md`, leia-os primeiro.
   - Liste mentalmente: clientes, edge/middlewares, aplicacoes (entry points), camadas internas (presentation/service/domain/infra), datastores, integracoes externas, observabilidade.
   - Identifique o fluxo de request principal (origem -> destino) e fluxos secundarios (admin, escrita de config, jobs).

2. **Escolher tema**
   - Tema padrao: `light` (gradiente claro, recomendado para apresentacoes/README).
   - `dark` se o usuario pedir explicitamente.
   - Se o usuario pedir "bem bonito" ou "polido", use o template `pro_template.py` desta skill como base.

3. **Adaptar o template**
   - Copie `templates/pro_template.py` para `/tmp/<nome>.py`.
   - Substitua os blocos das zonas pelos componentes reais do projeto.
   - Mantenha o sistema de design (cores, sombras, layout em zonas).

4. **Gerar e validar**
   - Execute `python3 /tmp/<nome>.py`.
   - Use a tool Read no PNG para conferir visualmente que nao ha sobreposicao, texto cortado ou setas erradas.
   - Se houver, ajuste coordenadas e regenere.

5. **Salvar no projeto**
   - Caminho preferido: `docs/architecture/<nome>.png` se a pasta existir.
   - Senao: raiz do projeto ou `/tmp` se for descartavel.

## Sistema de design

Esta secao define o "look & feel" que torna o diagrama bonito. Siga rigorosamente.

### Paleta (uma cor por camada arquitetural)

```
Cliente / Edge externo  -> indigo  (#3730a3 / #4338ca)
pkg/app compartilhado   -> cyan    (#0e7490 / #0891b2)
Presentation (app)      -> indigo  (#4338ca / #6366f1)
Service / use case      -> emerald (#047857 / #10b981)
Transform / engine      -> fuchsia (#86198f / #a21caf)
Domain                  -> violet  (#6b21a8 / #9333ea)
Infrastructure          -> amber   (#b45309 / #d97706)
Datastore               -> red     (#b91c1c / #dc2626)
Externo / downstream    -> slate   (#334155 / #475569)
```

Cada cor e uma tupla `(fundo_claro, borda, acento)`. O acento e a cor da barra lateral do cartao.

### Cartao (card)

- Bordas arredondadas (`rounding_size=0.18`)
- Sombra: retangulo cinza-escuro deslocado `+0.07, -0.07` com alpha 0.10
- Barra lateral colorida de 0.12 de largura (acento)
- Titulo em **bold** na cor da borda + subtitulo em cinza-medio (#475569)
- Tipografia: Helvetica Neue / Helvetica / Arial / DejaVu Sans (fallback)

### Secao (grupo)

- Retangulo arredondado com borda tracejada (`linestyle=(0, (6, 4))`)
- Cabecalho como "pilula" colorida no canto superior esquerdo
- Texto da pilula em branco, weight bold

### Setas

- Solidas para fluxo de runtime, tracejadas para dependencia/contrato
- `arrowstyle='-|>'`, `mutation_scale=14`
- Sutilmente curvas (`connectionstyle='arc3,rad=0.1..0.25'`) — evite curvas exageradas
- Rotulos em "badge": `bbox=dict(boxstyle='round,pad=0.18', facecolor='#f4f6fb', edgecolor='none', alpha=0.85)`

### Fundo

- Gradiente vertical de `#f4f6fb` (topo) -> `#e6eaf3` (base) para tema claro.
- Para tema escuro: `#1a1b26` solido.

### Layout em zonas

Use uma das duas estrategias:

**A. Vertical (preferido para arquiteturas em camadas)**
1. Titulo + subtitulo no topo
2. Clientes
3. Edge / middlewares globais
4. Aplicacoes (lado a lado se houver gateway + backoffice)
5. Datastores + downstream em baixo
6. Domain + Infrastructure em coluna lateral
7. Rodape de observabilidade

**B. Horizontal (para pipelines / fluxos)**
1. Titulo no topo
2. Origem -> processamento -> destino, da esquerda para direita
3. Camadas verticais quando houver
4. Legenda em card flutuante no canto

### Legenda

Card branco com sombra suave, lista de camadas em duas colunas:
- Quadrado colorido + label cinza-escuro
- Posicao: canto superior direito ou inferior direito
- Titulo "Camadas" em bold

## Template de referencia

Use `templates/pro_template.py` como ponto de partida. Ele ja contem:

- Helpers `card()`, `section()`, `arrow()`, `shadow()`
- Gradiente de fundo
- Paleta completa
- Exemplo funcional de layout em zonas
- Legenda flutuante

Para adaptar: substitua os textos de cada `card()` pelos componentes reais do projeto. Mantenha as coordenadas relativas e os helpers intactos.

## Variantes que voce pode oferecer ao usuario

Apos gerar a primeira versao, ofereca:

- Tema claro vs escuro
- Versao "diagrama de fluxo" (so o request flow do gateway)
- Versao "C4 nivel 1" (so caixas grandes, sem detalhes internos)
- Versao "infraestrutura" (foco em deploy: VPC, subnets, ALB, etc.)

## Anti-padroes (nao faca)

- Nao use emojis ou simbolos decorativos no PNG (CLAUDE.md proibe).
- Nao gere SVG por padrao (usuario quase sempre quer PNG).
- Nao polua com mais de ~20 cartoes — divida em diagramas multiplos.
- Nao misture mais de 6 cores por diagrama.
- Nao use Comic Sans, Times ou serifs — use sans-serif geometrica.
- Nao centralize tudo: hierarquia visual exige assimetria intencional.
- Nao deixe setas se cruzando sem necessidade — replaneje o layout.

## Checklist de qualidade

Antes de entregar, valide visualmente (lendo o PNG):

- [ ] Titulo legivel e centralizado
- [ ] Nenhum texto cortado fora do cartao
- [ ] Cartoes nao se sobrepoem (a menos que intencional)
- [ ] Setas chegam nas bordas certas, sem atravessar cartoes
- [ ] Cores consistentes por camada
- [ ] Legenda presente quando ha mais de 4 cores
- [ ] Resolucao >= 180 dpi
- [ ] Arquivo salvo em local versionavel (`docs/architecture/`)
