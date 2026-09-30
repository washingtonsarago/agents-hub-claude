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

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp,prometheus",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT": "https://devanalyze.io/api/v1/ai-usage/claude-code/ingest",
    "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT": "https://devanalyze.io/api/v1/ai-usage/claude-code/ingest",
    "OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Bearer <token-da-organizacao>",
    "OTEL_METRICS_INCLUDE_ACCOUNT_UUID": "true",
    "OTEL_METRIC_EXPORT_INTERVAL": "60000",
    "OTEL_RESOURCE_ATTRIBUTES": "team.id=<time>,department=<area>"
  }
}
```

**Por que `otlp,prometheus` e não só `otlp`:** os dois exporters convivem. O `prometheus`
mantém `localhost:9464` de pé para o dev medir a própria sessão com a skill `session-cost`;
o `otlp` alimenta a organização. Deixar só `otlp` tira do dev a capacidade de se medir.

**Por que `OTEL_LOGS_EXPORTER` também:** métricas dão adoção e custo; **eventos dão
comportamento**. `tool_result` com `duration_ms`, `api_error`, ciclos de retry — a detecção
de desperdício sai dos logs, não dos contadores. Ingerir só métricas entrega dois terços.

**`OTEL_METRICS_INCLUDE_ACCOUNT_UUID` não é opcional.** Sem ela o payload traz `user.id`, que
é um identificador **anônimo por instalação** — muda quando o dev reinstala e não identifica a
conta. O `user.account_uuid` é o estável, e é a chave que casa com o export CSV de spend.

## O que NUNCA entra nesta política

```
OTEL_LOG_USER_PROMPTS · OTEL_LOG_ASSISTANT_RESPONSES
OTEL_LOG_TOOL_DETAILS · OTEL_LOG_RAW_API_BODIES
```

Essas variáveis fazem o conteúdo do trabalho sair da máquina do dev. Ficam **desligadas por
padrão** e devem permanecer assim. O produto mede uso, não lê trabalho.

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
```

O campo `resolved_from` diz de onde veio cada chave (`ambiente` = política, `settings.json` =
config local). Dentro do Claude Code, `/status` mostra a origem da política em
`Setting sources`.

⚠️ Configuração de OpenTelemetry **exige restart completo** do CLI. Uma sessão já aberta não
começa a exportar sozinha.
