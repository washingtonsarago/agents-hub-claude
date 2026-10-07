# Telemetria do Claude Code por política da organização

Como ligar a exportação OTLP para todo o time **sem depender de cada dev rodar um comando**.

## Por que política e não onboarding manual

Telemetria configurada à mão é opt-in: quem não configurar vira **falso negativo** — e falso
negativo é indistinguível de "não usa". Como a pergunta de negócio é justamente *quantos do
time usam*, uma amostra de tamanho desconhecido não responde nada.

**Server-managed settings estão disponíveis no plano Claude for Teams** (não é exclusivo do
Enterprise, apesar da página de autenticação sugerir). Eles entregam `env` e `hooks` do
console para todos os clientes autenticados na organização e ocupam o topo da hierarquia de
settings — nenhum arquivo de usuário ou de projeto sobrescreve.

## Onde publicar

`claude.ai/admin-settings/claude-code` → aba **Managed settings**.

Exige papel **Owner** ou **Primary Owner**. Admin não vê nem edita — se o link redirecionar
para outra página de Admin Settings, é falta de papel, não bug.

## O bloco

Gerado pelo script, que é a fonte da verdade — não edite à mão:

```sh
bash ~/.claude/skills/session-cost/scripts/otlp-telemetry.sh managed-block devanalyze
```

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp,prometheus",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
    "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT": "https://devanalyze.io/api/v1/ai-usage/claude-code/ingest",
    "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT": "https://devanalyze.io/api/v1/ai-usage/claude-code/ingest/logs",
    "OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE": "delta",
    "OTEL_METRICS_INCLUDE_ACCOUNT_UUID": "true",
    "OTEL_LOGS_EXPORT_INTERVAL": "30000",
    "OTEL_METRIC_EXPORT_INTERVAL": "60000",
    "OTEL_LOG_USER_PROMPTS": "0",
    "OTEL_LOG_ASSISTANT_RESPONSES": "0",
    "OTEL_LOG_TOOL_DETAILS": "0",
    "OTEL_LOG_TOOL_CONTENT": "0",
    "OTEL_LOG_RAW_API_BODIES": "0",
    "OTEL_LOG_MANAGED_SETTINGS": "0"
  }
}
```

Segue o contrato da demanda 005 do DevAnalyze. Cada sinal tem URL completa: **nunca** use
`OTEL_EXPORTER_OTLP_ENDPOINT`, porque o SDK acrescentaria `/v1/metrics` e `/v1/logs` a ele. Só
`http/json` é aceito (protobuf e gzip recebem 415). A temporalidade fica fixada em `delta`, e o ingest
soma com deduplicação. O `session.id` (ligado por padrão) só entra num digest de deduplicação e
não é armazenado.

**`OTEL_LOGS_EXPORT_INTERVAL=30000`:** o padrão do Claude Code é 5 s, o que dá cerca de 7200 POSTs/min
com 500 devs. O servidor tem cota por org (4000/min de logs, 1500/min de métricas), e o excesso
recebe 429. Com 30 s, o volume cai para cerca de 1200/min.

**O bloco acima não leva credencial.** Para o token ir junto, e o dev não precisar instalar nada,
veja "Token automático" abaixo. Esse é o caminho recomendado.

**Por que `otlp,prometheus` e não só `otlp`:** os dois exporters convivem. O `prometheus`
mantém `localhost:9464` de pé para o dev medir a própria sessão com a skill `session-cost`;
o `otlp` alimenta a organização. Deixar só `otlp` tira do dev a capacidade de se medir.

**Por que eventos também:** métricas dão adoção e custo; **eventos dão comportamento**.
`tool_result` com `duration_ms`, `api_error`, ciclos de retry — a detecção de desperdício sai
dos logs, não dos contadores. Ingerir só métricas entrega dois terços.

**`OTEL_METRICS_INCLUDE_ACCOUNT_UUID` não é opcional.** Sem ela o payload traz `user.id`, que
é um identificador **anônimo por instalação** — muda quando o dev reinstala e não identifica a
conta. O `user.account_uuid` é o estável, e é a chave que casa com o export CSV de spend.

**Sem `OTEL_RESOURCE_ATTRIBUTES`:** o DevAnalyze não lê nenhum. O tenant vem do token, e o time vem
do cadastro do developer no DevAnalyze. O script ignora `--team`/`--attr` nesse destino.

### Respostas do ingest

| Código | Significado |
|---|---|
| 202 | Aceito. O corpo traz contadores: `accepted`, `duplicates`, `stale`, `ignored`, `no_identity`, `unmatched` (+ amostra `unmatched_emails`), `skipped_non_corporate`, `over_budget` (acima de 50 000 eventos por dev/dia) e `multi_identity`. O `resource_org_mismatch` está deprecated e sempre vem `false` |
| 401 | Token inválido |
| 413 | Acima de 2 MiB ou de 2000 `logRecords` por POST |
| 415 | Content-type ou compressão não suportados (use `http/json` sem gzip) |
| 429 | Acima da cota da org por minuto (logs 4000, métricas 1500); o exporter reenvia e o ingest é idempotente |
| 422 | Payload malformado; a resposta não ecoa o conteúdo |
| 500 | Erro do servidor; o exporter reenvia e o ingest é idempotente |

Registros com mais de 24 h, ou mais de 10 min no futuro, contam como `stale` e ficam fora do agregado.
Para validar um token sem gravar nada, faça um `GET /api/v1/ai-usage/claude-code/ingest/verify` com o
Bearer: responde 204 se o token é válido e 401 se não é. É o que o `install` faz.

## Token automático (recomendado)

O token `claude_code` é **um só para a organização**. Então ele pode ir no próprio bloco, como
`OTEL_EXPORTER_OTLP_HEADERS`, e todo dev do Teams passa a enviar sem rodar nada. Quem tem o token
no Keychain (depois de um `install devanalyze`) gera o bloco completo **num terminal**, direto
para a área de transferência:

```sh
bash ~/.claude/skills/session-cost/scripts/otlp-telemetry.sh managed-block devanalyze --embed-token | pbcopy
```

Depois é colar em `claude.ai/admin-settings/claude-code` → Managed settings. O script se recusa
a rodar dentro do Claude Code (o JSON com o token iria para o transcript).

- **Trocar o token:** rotacione no DevAnalyze, regere o bloco e republique. Todos recebem no
  próximo fetch das managed settings.
- **Exposição:** o token fica legível no cache de settings de cada máquina. É a mesma exposição
  de entregar o token na mão a cada dev. A solução de verdade é token por dev, que é follow-up
  do DevAnalyze.
- **Efeito na máquina do dev:** um `OTEL_EXPORTER_OTLP_HEADERS` gerenciado faz o Claude Code
  apagar os endpoints e cabeçalhos OTLP que o dev tenha configurado por conta própria. A
  política vence.
- **⚠ O `otelHeadersHelper` vence o cabeçalho do bloco.** Medido com o Claude Code 2.1.292:
  numa máquina com `install devanalyze` (que instala o helper), o token do helper é o que vai.
  Depois de publicar o bloco com token, rode `otlp-telemetry.sh uninstall` nessas máquinas.
  Senão, depois de uma troca de token elas continuam mandando o antigo e passam a receber 401.
- Header no formato OTEL, com espaço literal: `Authorization=Bearer <token>`. Também validado no
  2.1.292: chega ao servidor exatamente como `Bearer <token>`.

## Alternativa: cada dev instala a credencial

Use só se o token não puder ir na política. O token é a credencial `claude_code` da organização no DevAnalyze. Quem administra a org no
DevAnalyze entrega ao dev por canal seguro (gerenciador de senhas, nunca chat). O dev roda,
**num terminal de verdade** (não pelo `!` do Claude Code, que não tem tty):

```sh
bash ~/.claude/skills/session-cost/scripts/otlp-telemetry.sh install devanalyze --token-only
```

O token tem 32–256 caracteres ASCII imprimíveis, e o install recusa qualquer outro formato antes de
gravar algo. Ele pede o token sem eco, guarda no Keychain (macOS) ou em `~/.config/claude-otlp/devanalyze`
com modo 600 (Linux) e aponta o `otelHeadersHelper` do usuário para
`~/.claude/bin/otel-headers-devanalyze.sh`. Endpoints e flags continuam vindo da política.

Quem não instalar o token exporta sem autenticação e é recusado — vira falso negativo. O
DevAnalyze deve tratar "dev com Claude Code ativo e zero telemetria" como pendência de
onboarding, não como "não usa".

### O que dizer ao time sobre o painel

- **Os eventos aparecem no painel depois que a semana fecha**, na terça-feira às 00:10 UTC. Painel
  vazio no mesmo dia não indica falha; para isso, olhe o `test` do script ou o 202 do ingest.
- **O painel omite combinações com menos de 3 devs** (k-anonimato). Um time pequeno filtrado demais
  some do gráfico de propósito.

## O que NUNCA entra nesta política

```
OTEL_LOG_USER_PROMPTS=1 · OTEL_LOG_ASSISTANT_RESPONSES=1 · OTEL_LOG_TOOL_DETAILS=1
OTEL_LOG_TOOL_CONTENT=1 · OTEL_LOG_RAW_API_BODIES (qualquer valor além de 0)
OTEL_LOG_MANAGED_SETTINGS=1
```

Essas variáveis fazem o conteúdo do trabalho sair da máquina do dev. O bloco as fixa em `"0"`
— na política, que fica no topo da hierarquia, nenhum settings de usuário ou de projeto
consegue religar. O produto mede uso, não lê trabalho. O ingest também tem allowlist e descarta
conteúdo mesmo que o cliente mande: o cliente não é uma fronteira de segurança.

## Antes de publicar: avise o time

Um `OTEL_EXPORTER_OTLP_ENDPOINT` não-vazio e qualquer definição de `hooks` **sempre** disparam
o diálogo de aprovação de segurança no cliente. **Se o dev recusar, o Claude Code encerra.**

Na prática é "aceita ou não usa" — o que é forte o suficiente, e é exatamente por isso que
pegar alguém de surpresa é o pior jeito de fazer isso. Comunique antes, dizendo o que é
coletado e o que não é.

## Limites honestos

Isto é **controle de cliente, não fronteira de segurança**:

| Situação | O que acontece |
|---|---|
| Dev edita o cache local | Vale até o próximo fetch, que restaura a política |
| Dev exporta `ANTHROPIC_BASE_URL` ou `CLAUDE_CODE_USE_*` | **Pula o fetch inteiro** — e o próprio `env` server-managed não corrige, porque a variável impede a busca que o entregaria |
| Binário modificado ou versão antiga | Sem enforcement |
| Segmentação por time | Não suportada — a política é uniforme na org. Segmente pelo dado, com `OTEL_RESOURCE_ATTRIBUTES` |

Nenhum desses buracos é fechável por plugin. É por isso que um censo server-side
independente continua valendo como denominador.

## Verificar que pegou

No cliente:

```sh
node ~/.claude/skills/session-cost/scripts/otel-setup.js --check --json
bash ~/.claude/skills/session-cost/scripts/otlp-telemetry.sh check
```

O campo `resolved_from` diz de onde veio cada chave (`ambiente` = política, `settings.json` =
config local). Dentro do Claude Code, `/status` mostra a origem da política em
`Setting sources`.

⚠️ Configuração de OpenTelemetry **exige restart completo** do CLI. Uma sessão já aberta não
começa a exportar sozinha.
