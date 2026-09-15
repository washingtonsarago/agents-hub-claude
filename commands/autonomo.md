# Autônomo

Cria um **agent autônomo** do hub: um agent que roda sozinho, num horário fixo, sem ninguém acionar.

Você descreve o que ele faz e quando; o comando escreve a especificação versionada em `autonomous/<nome>.md`, registra no manifest e arma a rotina de verdade na nuvem. A partir daí o agent está no ar **e** revisável em PR.

Uso: `/autonomo <descrição do que o agent deve fazer e com que frequência>`

## Por que passar pelo hub em vez de agendar direto

O `/schedule` nativo cria uma rotina na conta de quem executou. Ela não fica versionada, não passa por review, não é distribuída e ninguém mais sabe que existe. Este comando produz as duas coisas: a rotina rodando **e** o artefato no repo, que o `ahc` distribui como qualquer agent ou skill.

## Instruções

### 1. Entender o pedido

Extraia da descrição do usuário: o que o agent faz, com que frequência, sobre qual repositório, e o que ele produz no final (commit, mensagem em canal, issue, PR).

Pergunte **apenas o que faltar** e não puder ser inferido com segurança. Não entreviste o usuário sobre o que ele já disse.

Se o horário vier em linguagem natural ("toda manhã", "às segundas"), converta para cron **UTC** — o fuso do usuário é `America/Sao_Paulo` (UTC-3). Confirme a conversão numa linha: *"9h de São Paulo = 12h UTC, cron `7 12 * * 1-5`"*. Evite o minuto `:00` quando o horário for aproximado; use um minuto deslocado (7, 13, 23…) para não cair no pico global de agendamentos. O intervalo mínimo é **1 hora**.

### 2. Escolher o modo — e defender o read-only

O default é `mode: read-only`. Bons agents autônomos ou **falham silenciosamente sem prejuízo** (comentam, sugerem) ou **falham loudly mas reversivelmente** (abrem PR que ninguém é obrigado a mesclar). Os perigosos tomam ação irreversível: commit direto na main, mensagem para cliente, deleção de recurso, deploy.

Se o pedido do usuário exigir `mode: write`, diga em uma frase qual ação irreversível está sendo autorizada e peça confirmação explícita. O arquivo precisará declarar `approved_by: <nome>` — o validator rejeita `mode: write` sem esse campo.

Nunca dê a um agent autônomo mais ferramenta do que a tarefa exige. `tools` mínimo que funcione.

### 3. Escrever a especificação

Crie `autonomous/<nome>.md`. O nome é kebab-case e vira o nome do arquivo, o campo `name` da frontmatter e o nome da rotina.

```yaml
---
name: <kebab-case>
description: "<uma linha: o que faz, quando, e o que produz>"
schedule: <cron 5 campos, UTC>
repo: <org/repo>
model: <opus|sonnet|haiku>
mode: <read-only|write>
tools: <lista separada por vírgula>
connectors: <lista separada por vírgula, ou vazio>
budget_tokens_per_run: <número>
routine_id:
---
```

O corpo do arquivo traz: o horário em fuso local por extenso, o **prompt completo** que a rotina recebe, por que o agent é seguro, e o kill switch. Use `autonomous/pr-sentinel.md` como referência de forma e profundidade.

O prompt é a parte que mais importa. A rotina começa com **zero contexto** — nada desta conversa chega lá. Ele precisa ser autossuficiente: dizer que é uma tarefa agendada sem humano acompanhando, o que ler, o que fazer, o que **não** fazer, e qual é a condição de parada. Um prompt vago produz um agent que gera ruído todo dia.

Sempre inclua uma **condição de silêncio**: o que faz o agent não produzir nada. Agent autônomo sem condição de silêncio vira ruído que o time aprende a ignorar — foi exatamente o que aconteceu com o PR review diário antes desta categoria existir.

### 4. Registrar no manifest

```sh
node scripts/regen-manifest.js
node scripts/validate-artifacts.js
```

O validator exige: `name` batendo com o nome do arquivo, cron de 5 campos, `repo` no formato `org/repo`, `mode` válido, e `approved_by` quando `mode: write`. Corrija o que ele apontar antes de seguir.

### 5. Armar a rotina

Carregue a ferramenta com `ToolSearch` (`select:RemoteTrigger`) e crie a rotina:

```json
{
  "name": "<nome>",
  "cron_expression": "<schedule da frontmatter>",
  "enabled": true,
  "job_config": {
    "ccr": {
      "environment_id": "<id do ambiente>",
      "session_context": {
        "model": "claude-sonnet-5",
        "sources": [{"git_repository": {"url": "https://github.com/<repo>"}}],
        "allowed_tools": ["<tools da frontmatter>"]
      },
      "events": [{"data": {
        "uuid": "<uuid v4 minúsculo, gerado agora>",
        "session_id": "", "type": "user", "parent_tool_use_id": null,
        "message": {"role": "user", "content": "<o prompt do corpo do arquivo>"}
      }}]
    }
  }
}
```

Se o agent precisar de conectores (Slack, Gmail, Atlassian…), inclua `mcp_connections`. Se um conector necessário não estiver conectado na conta, **pare e avise** — a rotina seria criada e falharia silenciosamente todo dia.

Confirme a configuração completa com o usuário antes de criar. Depois de criada, grave o `routine_id` retornado de volta na frontmatter do arquivo, rode `regen-manifest` de novo e mostre o link `https://claude.ai/code/routines/{id}`.

### 6. Fechar

Reporte: o caminho da especificação, o horário em fuso local, o modo, o que o agent produz, a condição de silêncio, e como matá-lo.

Não commite — deixe staged para o usuário revisar, como qualquer mudança no hub.

## Verificar o que está no ar

```sh
ahc autonomous list
```

Mostra as especificações distribuídas e quais têm `routine_id` preenchido (armadas) ou vazio (só especificação).

## Anti-patterns

- **Agent sem condição de silêncio.** Se ele produz saída todo run independente do estado, é ruído.
- **Prompt que depende do contexto desta conversa.** A rotina começa do zero; o que não estiver escrito no prompt não existe.
- **`mode: write` como default** porque "seria mais prático". A prática é o argumento que precede todo incidente de automação.
- **Ferramentas em excesso.** `Bash` sempre disponível "por via das dúvidas" é como agent autônomo faz estrago não previsto.
- **Armar sem versionar.** Rotina criada fora do repo é rotina que ninguém audita e ninguém sabe desligar.
