---
name: session-cost
description: Mede tokens gastos e custo em US$ de uma sessao do Claude Code, separando o que o orquestrador consumiu do que os subagents consumiram. Use quando o usuario perguntar "quanto custou essa sessao", "quantos tokens gastei", "qual o custo desse flow", "quanto ta custando", "custo por fase", ou quando um command precisar reportar custo no final. Mede a partir de dados no disco (telemetria OpenTelemetry ou o transcript da sessao) e nunca estima — se nao conseguir medir, reporta inconclusivo com a causa. Faz par com /flow e /veredito.
---

# session-cost

Skill para **medir** — não estimar — tokens e custo de uma sessão do Claude Code.

O modelo não tem acesso programático ao próprio consumo. Um número dito de cabeça é invenção, e é exatamente a fraude de *conclusão falsa* que o `/veredito` existe pra caçar. Então tudo aqui sai do disco: ou dos contadores de telemetria, ou do transcript que o Claude Code grava.

## Quando usar esta skill

- O usuário pergunta quanto custou a sessão, o flow, ou uma fase
- Um command precisa fechar com custo (o `/flow` usa isto na fase SHIP)
- Antes de decidir se vale delegar trabalho pesado, pra saber a linha de base

## As duas fontes — e por que isso importa

| Fonte | Cobre subagent? | Preço vem de | Setup |
|---|:--:|---|---|
| **A** `otel-cost.js` — contadores OpenTelemetry | ✅ | Claude Code (`claude_code.cost.usage`) | env vars + restart, por máquina |
| **B** `session-cost.js` — transcript JSONL | ❌ | tabela local (envelhece) | nenhum |

**Essa diferença é a coisa mais importante da skill.** O transcript **não registra consumo de subagent** — verificado em 2026-08-17 sobre 96 transcripts: 435 despachos de subagent (`Task`/`Agent`) e **zero** linhas com `isSidechain`. Em qualquer command que delega (`/flow`, `/code-review`, `/feature-flow`, `/bug-flow`, `/incident-response`), o trabalho delegado é onde está a maior parte do gasto — e a fonte B não o enxerga.

Por isso: **um número da fonte B nunca é "o custo do flow".** É "o custo de orquestração, com N subagents não contabilizados". Diga as duas coisas juntas, sempre.

A fonte A resolve isso porque o contador `claude_code.token.usage` carrega o label `query_source` (`main` / `subagent` / `auxiliary`), e o custo vem calculado pelo próprio Claude Code — sem tabela de preços local pra envelhecer.

## Como usar

Os scripts ficam em `~/.claude/skills/session-cost/scripts/` depois do `ahc sync`.

### 1. Descobrir qual fonte está disponível

```sh
node ~/.claude/skills/session-cost/scripts/otel-setup.js --check
```

Cinco estados, com exit code:

| Estado | Exit | Significado |
|---|:--:|---|
| `live` | 0 | endpoint prometheus responde — fonte A disponível agora |
| `needs-restart` | 1 | configurado, endpoint mudo — falta reiniciar o Claude Code |
| `not-configured` | 2 | telemetria desligada |
| `invalid` | 3 | `settings.json` ilegível — não mexer, avisar humano |
| `remote-only` | 4 | telemetria ativa, mas só com destino OTLP remoto |

O `--check` resolve a config por **merge de chave** entre o ambiente do processo e o
`settings.json`, ambiente primeiro. Nenhuma das duas fontes basta sozinha: o arquivo não
enxerga a política da organização (server-managed settings vivem no servidor), e o ambiente
só recebe as chaves que o Claude Code repassa a subprocessos — medido em campo:
`CLAUDE_CODE_ENABLE_TELEMETRY` chega, `OTEL_METRICS_EXPORTER` não. O campo `resolved_from`
do `--json` diz de onde veio cada chave.

### 2. Ligar a telemetria, se o usuário quiser

```sh
node ~/.claude/skills/session-cost/scripts/otel-setup.js --enable
```

Para exportar também para um collector da organização (agregação de time, custo por skill,
accept rate por pessoa):

```sh
node ~/.claude/skills/session-cost/scripts/otel-setup.js --enable \
  --otlp https://collector.exemplo/v1/metrics \
  --headers "Authorization=Bearer <token-da-org>"
```

Os dois exporters convivem (`otlp,prometheus`), então ligar o remoto **não** custa a medição
local desta sessão. `--no-local` deixa só o remoto.

> ⚠️ **Destino remoto é decisão de política, não técnica.** `user_email`, `user_account_id` e
> `organization_id` passam a sair da máquina do dev — ver "Sobre os labels" abaixo. O script
> exige `--otlp` explícito e nunca liga destino remoto sozinho.

**Peça um sim explícito antes.** Isso escreve três env vars no `~/.claude/settings.json` do usuário — config global dele, não artefato da tarefa. Escrever sem pedir é ação não autorizada. O script preserva o resto do arquivo, faz backup, e se recusa a tocar num JSON que não consegue parsear.

Vale só no próximo start do Claude Code (env var carrega na inicialização) — então **ligar não melhora a medição da sessão atual**. Diga isso em vez de insinuar que o número vai melhorar agora.

### 3. Medir

**Fonte A**, janela entre dois pontos (contadores são cumulativos):

```sh
node ~/.claude/skills/session-cost/scripts/otel-cost.js snapshot > /tmp/t0.json
# ... trabalho acontece ...
node ~/.claude/skills/session-cost/scripts/otel-cost.js report --since /tmp/t0.json
```

**Fonte B**, sessão inteira ou a partir de um instante:

```sh
node ~/.claude/skills/session-cost/scripts/session-cost.js
node ~/.claude/skills/session-cost/scripts/session-cost.js --since 2026-08-17T14:00:00Z
```

Ambos aceitam `--json` para consumo por outro script.

## A pegadinha da porta 9464 (verificada em campo)

**Só um processo do Claude Code consegue bindar a porta 9464.** Com duas sessões abertas na mesma máquina — coisa comum — quem subiu primeiro serve o endpoint, e as métricas dele são de **outra sessão**.

Isso foi observado de verdade em 2026-08-17: uma leitura do endpoint devolveu `$16,87` com um split de subagent perfeitamente plausível, e o `session_id` das séries era de outra sessão. Número certo, sessão errada — indistinguível de estar correto sem olhar o label.

Por isso o `otel-cost.js` **filtra por `session_id` e falha alto** quando o endpoint não serve a sessão atual (exit 1, dizendo qual é qual). Escape hatches explícitos: `--session <id>` para apontar outra, `--any-session` para aceitar o que vier.

Se der esse erro, use a fonte B — ela lê o transcript desta sessão e não tem ambiguidade de atribuição.

## Sobre os labels

As séries carregam `user_email`, `user_account_id`, `organization_id` e `session_id`. No exporter Prometheus isso fica em `localhost` e não sai da máquina. **Se alguém algum dia apontar o exporter OTLP para um collector remoto, isso vira PII saindo da máquina do dev** — decisão de política, não técnica.

Labels úteis além de `query_source`: `model`, `type`, `effort`, `agent_name` (qual subagent), `skill_name` (qual skill estava ativa) e `mcp_server_name` / `mcp_tool_name`. Dá pra atribuir custo por skill e por MCP server, não só por sessão.

## Regras de reporte

1. **Reporte o número que o script imprimiu.** Nunca um que você derivou, arredondou de cabeça ou inferiu.
2. **Nomeie a fonte e o limite dela junto do número.** Fonte B sem a ressalva de subagent é um número que parece completo e não é.
3. **Se falhar, é `inconclusivo` com a causa real** — transcript ausente, endpoint mudo, modelo sem preço na tabela. Nunca substitua por estimativa.
4. **A tabela de preços da fonte B envelhece.** Está carimbada e o script imprime a data em todo run. Antes de usar num business case ou cobrança de cliente, reconfira em `platform.claude.com/docs/en/pricing`.

## Anti-patterns

- **"O flow custou $X"** usando a fonte B. Custou mais; você mediu uma parte.
- **Estimar quando o script falhou.** Inconclusivo é resultado; número inventado não é.
- **Rodar `--enable` sem perguntar.** É o `settings.json` global do dev.
- **Tratar a tabela de preços como oficial.** É aproximação datada; a fonte A tem o número do próprio Claude Code.
- **Somar `output_tokens` + `thinking_tokens`.** Thinking já está dentro de output — somar duplica.
