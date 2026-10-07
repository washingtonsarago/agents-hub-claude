---
name: deployment-diagram
description: Gera diagramas de deployment / topologia de infraestrutura em PNG com qualidade profissional (estilo Linear/Vercel) usando matplotlib. Use quando o usuario pedir "topologia de infra", "diagrama de deployment", "onde roda o quê", "diagrama de VPC / subnets", "topologia AWS", "como esta o deploy", "diagrama de rede / infra" ou similar. Renderiza zonas/boundaries aninhadas (regiao, VPC, subnet public/private, AZ, on-prem), nos de execucao coloridos por tipo de recurso (ELB, ECS/EKS, EC2, Lambda, RDS, ElastiCache, S3, filas) e conexoes com porta/protocolo. Solida para trafego sincrono, tracejada para async/replicacao.
---

# deployment-diagram

Skill para produzir diagramas de deployment/topologia de infraestrutura em PNG bonitos e legiveis a partir de uma descricao textual da topologia (ou de leitura previa de `terraform/`, `*.tf`, `docker-compose.yml`, `k8s/`, `cloudformation`, `ARCHITECTURE.md`). Casa visualmente com as skills `architecture-diagram`, `sequence-diagram` e `er-diagram` — mesma paleta, cartoes com sombra e accent bar, badges e gradiente de fundo — pra que os diagramas do projeto se sintam um conjunto.

A saida e sempre um arquivo `.png` salvo no projeto (ou em `/tmp` se nao houver caminho preferido), gerado com matplotlib usando o sistema de design descrito abaixo.

## Quando usar esta skill

Acione quando o usuario pedir, em qualquer variacao:

- "topologia de infra", "diagrama de deployment", "diagrama de deploy"
- "onde roda o quê", "em que subnet fica o X", "o que fica em private/public"
- "diagrama de VPC / subnets / rede", "topologia AWS / GCP / Azure"
- "desenha nossa infra", "como esta o ambiente de producao"
- "multi-AZ", "multi-regiao", "DR / disaster recovery", "failover regional"
- pedidos que citem recursos de infra concretos: ALB/ELB, ECS/EKS/Fargate, EC2, Lambda, RDS, Aurora, ElastiCache/Redis, S3, SQS/SNS/Kafka, NAT gateway, bastion

## Quando NAO usar

- **Fluxo logico / componentes / camadas** (presentation/service/domain, como modulos se relacionam) -> use a skill `architecture-diagram`.
- **Sequencia temporal** (quem chama quem, request flow passo a passo) -> use a skill `sequence-diagram`.
- **Modelo de dados** (tabelas, colunas, chaves, relacoes) -> use a skill `er-diagram`.
- Notacao formal obrigatoria (C4 oficial, diagramas de rede padrao Cisco/AWS com icones oficiais) -> ferramentas dedicadas.

A distincao chave: `deployment-diagram` responde **"onde cada coisa roda e como as caixas de infra se conectam na rede"**, nao "qual e a logica interna" nem "qual a ordem das chamadas".

## Pre-requisitos

Verifique e instale silenciosamente o que faltar:

```bash
python3 -c "import matplotlib" 2>/dev/null || pip3 install --quiet matplotlib
```

Nao depende de graphviz, mermaid, plantuml, terraform-graph ou dot.

## Processo recomendado

1. **Coletar a topologia**
   - Se existir IaC (`*.tf`, `cloudformation/*.yml`, `docker-compose.yml`, `k8s/`, `helm/`) ou `ARCHITECTURE.md`, leia primeiro pra extrair regioes, VPCs, subnets, recursos e portas.
   - Pergunte ao usuario (se faltar): provedor (AWS/GCP/Azure/on-prem), quantas AZs/regioes, quais recursos ficam em public vs private, portas/protocolos entre eles, o que e sincrono vs replicacao.
   - Identifique as fronteiras (boundaries) que importam: conta/regiao > VPC > subnet > AZ. Nao desenhe boundary que nao agrega informacao.

2. **Modelar zonas e nos**
   - Zonas (do maior pro menor, aninhando): regiao -> VPC -> subnet (public/private) -> AZ.
   - Nos: cada recurso vira um `node()` com a cor do seu **tipo** (ver paleta).
   - Conexoes: cada porta/protocolo relevante vira um `link()`. Solida = sincrono; tracejada = async/replicacao.

3. **Adaptar o template**
   - Copie `templates/deployment_template.py` para `/tmp/<nome>.py`.
   - Substitua as chamadas `zone(...)`, `node(...)` e `link(...)` pela topologia real.
   - Mantenha o sistema de design (paleta, helpers, gradiente) intacto.

4. **Gerar e validar**
   - `python3 /tmp/<nome>.py`.
   - Use Read no PNG pra conferir: zonas nao se sobrepoem errado, nos ficam DENTRO da zona certa, setas batem nas bordas e nao atravessam cartoes, labels de porta legiveis.
   - Se houver problema, ajuste coordenadas (as zonas externas ocupam mais area; as internas ficam recuadas) e regenere.

5. **Salvar no projeto**
   - Caminho preferido: `docs/architecture/<nome>-deployment.png` ou `docs/infra/<nome>.png` se a pasta existir.
   - Senao: raiz do projeto ou `/tmp` se for descartavel.

## Sistema de design

Consistente com `architecture-diagram` — leia a especificacao comum de cores, cartoes e gradiente la. O que e especifico de deployment aqui:

### Paleta por TIPO de recurso (nao por camada logica)

A cor do no e escolhida pelo **papel de infra**, nao pela camada arquitetural:

```
Edge / LB / CDN / gateway      -> cyan    (#0e7490 / #0891b2)   COL_EDGE
Compute (EC2 / node / host)    -> indigo  (#4338ca / #6366f1)   COL_COMPUTE
Service / container / app / fn -> emerald (#047857 / #10b981)   COL_SERVICE
DB / cache (RDS / ElastiCache) -> red     (#b91c1c / #dc2626)   COL_DATA
Storage (S3 / EFS / volume)    -> slate   (#334155 / #475569)   COL_STORE
Fila / evento (SQS/SNS/Kafka)  -> fuchsia (#86198f / #a21caf)   COL_QUEUE
Externo (internet / cliente)   -> violet  (#6b21a8 / #9333ea)   COL_EXT
Observabilidade (CloudWatch)   -> amber   (#b45309 / #d97706)   COL_OBS
```

Cada cor e uma tupla `(fundo, borda, acento)`. O acento e a barra lateral do cartao.

### No de deploy (`node`)

- Mesmo cartao das outras skills: rounded 0.18, sombra deslocada `+0.07,-0.07` alpha 0.10, accent bar de 0.12.
- Titulo em bold na cor da borda + subtitulo em cinza (`INK_SOFT`) — ex.: "RDS primary" / "PostgreSQL 16 (writer)".
- `badge` opcional (pilula pequena no canto superior direito) pra metadados de deploy: `"x3"` (replicas), `"Multi-AZ"`, `"RO"` (read-only), `"spot"`, `"az-a"`.

### Zona / boundary (`zone`)

- Retangulo grande arredondado com **borda tracejada** `(0, (6, 4))` + leve preenchimento translucido (`alpha ~0.035`) pra dar profundidade.
- **Pilula** de rotulo no canto superior esquerdo, cor solida da zona, texto branco bold.
- CIDR opcional na pilula: `zone(..., "VPC", ZONE_VPC, cidr="10.0.0.0/16")` -> "VPC 10.0.0.0/16".
- Cores de zona: regiao=slate, VPC=indigo, public subnet=cyan, private subnet=emerald, AZ=cinza, on-prem=amber.

### Zonas aninhadas (importante)

Zonas se aninham do maior pro menor. Desenhe **de fora pra dentro**, com `z` crescente e area recuada:

```python
zone(0.8, 0.8, 15.4, 11.4, "AWS region", ZONE_REGION, cidr="us-east-1",  z=1.4)  # externa
zone(1.3, 1.2, 14.4,  9.9, "VPC",        ZONE_VPC,    cidr="10.0.0.0/16", z=1.6)  # dentro da regiao
zone(1.7, 8.0, 13.6,  2.6, "public subnet",  ZONE_PUB,  cidr="10.0.1.0/24",  z=1.8)  # dentro da VPC
zone(1.7, 1.6, 13.6,  5.9, "private subnet", ZONE_PRIV, cidr="10.0.10.0/24", z=1.8)  # dentro da VPC
```

Regra pratica: cada nivel aninhado recua ~0.4 em cada lado. Os `node()` vem depois (z >= 3), sempre POSICIONADOS dentro da zona a que pertencem.

### Conexoes (`link`)

- **Solida** (`dashed=False`) = trafego sincrono (request/response, SQL, cache read).
- **Tracejada** (`dashed=True`) = async / replicacao / streaming de logs (replica de RDS, envio de metricas, fila).
- `arrowstyle='-|>'`, `mutation_scale=14`, sutilmente curvas (`curve=0.1..0.2`).
- Ligue por bordas nomeadas: `link(a, "bot", b, "top", ...)` com `side` em `top|bot|left|right`.
- Label de **porta/protocolo** em badge: `":443 https"`, `":5432 sql"`, `":6379 redis"`, `"replica async"`, `"logs / metrics"`.
- A cor da seta segue o tipo do destino (ex.: seta pro RDS em `COL_DATA[1]`).

### Fundo e legenda

- Gradiente vertical `#f4f6fb` -> `#e6eaf3` (light) ou `#1a1b26` solido (dark) — identico as outras skills.
- Legenda flutuante com os tipos de recurso presentes (card branco, sombra, quadradinhos coloridos em duas colunas).

## Template de referencia

Use `templates/deployment_template.py` como ponto de partida. Ele ja contem:

- Helpers `zone()`, `node()`, `link()`, `legend()`, `title()`, `shadow()`.
- Paleta completa por tipo de recurso + cores de zona.
- Gradiente de fundo e helper `_mix`.
- Exemplo funcional: internet -> ALB (public subnet) -> ECS Fargate (private subnet) -> RDS primary + replica + ElastiCache (private subnet) + S3 + CloudWatch, tudo dentro de uma VPC numa regiao AWS, com portas nos labels e replicacao tracejada.

Para adaptar: substitua as chamadas `zone/node/link`. Mantenha helpers + paleta intactos.

## Variantes que voce pode oferecer ao usuario

Apos gerar a primeira versao, ofereca:

- **Multi-AZ** — duplicar subnets private/public em duas AZs lado a lado (AZ-a / AZ-b), com o ALB distribuindo entre elas.
- **Multi-regiao** — duas zonas de regiao (ex.: us-east-1 / eu-west-1) com replicacao cross-region tracejada.
- **DR / disaster recovery** — regiao primaria ativa + regiao secundaria em standby, com badge "standby" e failover tracejado.
- **Tema escuro** (`THEME = "dark"`) pra apresentacao/slides.
- **On-prem hibrido** — zona `on-prem` (amber) conectada a VPC via VPN/Direct Connect.

## Anti-padroes (nao faca)

- Nao confundir com diagrama de arquitetura logica: aqui as caixas sao **recursos de infra que rodam em algum lugar**, nao camadas de codigo.
- Nao desenhar boundary que nao agrega (ex.: uma VPC com uma unica subnet e um unico no — simplifique).
- Nao aninhar mais de 4 niveis (regiao > VPC > subnet > AZ ja e o limite pratico de legibilidade).
- Nao colocar um `node()` visualmente fora da zona a que ele pertence.
- Nao usar mais de ~8 tipos de recurso (a paleta ja cobre os principais) nem mais de ~20 nos — divida em diagramas por ambiente/regiao.
- Nao usar emojis ou icones decorativos no PNG (CLAUDE.md proibe).
- Nao gerar SVG/Mermaid/PlantUML por padrao — usuario quase sempre quer PNG.
- Nao usar Comic Sans, Times ou serifs — sans-serif geometrica.
- Nao deixar setas se cruzando sem necessidade — replaneje o layout das zonas.

## Checklist de qualidade

Antes de entregar, leia o PNG e valide visualmente:

- [ ] Titulo e subtitulo legiveis.
- [ ] Cada zona tem pilula de rotulo + CIDR (quando aplicavel) e borda tracejada.
- [ ] Zonas aninhadas nao vazam: as internas ficam recuadas dentro das externas.
- [ ] Cada no esta DENTRO da zona correta (subnet/AZ certa).
- [ ] Cor de cada no coerente com o TIPO de recurso.
- [ ] Conexoes tem porta/protocolo quando relevante.
- [ ] Sincrono (solida) vs async/replicacao (tracejada) visualmente distintos.
- [ ] Setas batem nas bordas dos nos, sem atravessar cartoes.
- [ ] Legenda presente com os tipos usados.
- [ ] Resolucao >= 180 dpi.
- [ ] Arquivo salvo em local versionavel (`docs/architecture/` ou `docs/infra/`).
