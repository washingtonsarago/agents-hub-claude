---
name: runbook
description: Gera um runbook operacional padronizado de um servico em Markdown, cobrindo identificacao/dono/on-call, dependencias, deploy e rollback, health checks e dashboards, alarmes e o que significam, playbooks de recuperacao passo-a-passo, escalonamento, restart seguro, feature flags/kill switches e links de referencia. Use quando o usuario pedir "cria o runbook do servico", "runbook operacional", "documenta como operar isso", "manual de operacao", "playbook de recuperacao", "o que fazer quando cair", ou antes de colocar um servico em producao / entrar de plantao. Faz par com a command incident-response (consultado DURANTE o incidente) e com a skill postmortem (escrita DEPOIS).
---

# runbook

Skill para produzir um **runbook operacional** de um servico. A saida e um arquivo Markdown em `docs/runbooks/{servico}.md`.

O objetivo e responder, antes de qualquer incidente: **como este servico funciona, como opera-lo com seguranca e o que fazer quando algo quebra** — para que quem estiver de plantao (mesmo sem contexto do servico) consiga diagnosticar, mitigar e restaurar sem depender do autor original.

## Quando usar esta skill

Acione quando o usuario pedir, em qualquer variacao:

- "cria o runbook do servico", "runbook operacional", "manual de operacao"
- "documenta como operar isso", "como fazer deploy/rollback disso"
- "playbook de recuperacao", "o que fazer quando o servico cair"
- antes de colocar um servico em producao, ou ao preparar a documentacao de plantao (on-call).

Diferenca para outras capacidades:
- **`incident-response` (command):** orquestra o incidente *ao vivo*. O runbook e o documento **preventivo** que ela **consulta durante** o incidente (playbooks, restart, kill switches). Um bom runbook encurta o tempo de mitigacao.
- **`postmortem` (skill):** escrito **depois** do incidente, para aprender. O runbook e escrito **antes**; um postmortem frequentemente gera action items que **atualizam** o runbook (novo alarme, novo playbook).

Em resumo: **runbook = antes/durante · postmortem = depois.** O runbook nao duplica nenhum dos dois — ele e a fonte operacional consultada sob pressao.

## Processo recomendado

1. **Identificar o servico.** Nome, dono (time/squad), canal de on-call, criticidade/tier, SLO. Se faltar o essencial, pergunte de forma objetiva (max 3): quem e o dono, onde roda, qual o SLO/criticidade.

2. **Mapear dependencias.** Liste **upstream** (de quem este servico depende: DB, cache, filas, APIs externas) e **downstream** (quem depende dele). Marque quais sao criticas — a falha delas derruba o servico — e o comportamento esperado em degradacao (fail-open/fail-closed).

3. **Documentar deploy e rollback.** Como se faz deploy (pipeline, comando, aprovacoes), como se **reverte com seguranca** e quanto tempo leva. Rollback e a mitigacao mais comum — precisa estar a um comando de distancia, testado.

4. **Health checks e observabilidade.** Endpoints de health/readiness, dashboards (com links), metricas-chave (RED/USE: latencia, erro, saturacao) e onde ficam os logs. Quem esta de plantao precisa ver o estado do servico em segundos.

5. **Catalogar alarmes.** Para **cada** alerta: nome, o que significa (o sintoma real, nao so o threshold), severidade, e o **primeiro passo** de investigacao. Alarme sem "o que fazer" gera fadiga de alerta.

6. **Escrever os playbooks de recuperacao.** Para cada falha comum (dependencia fora, fila acumulando, memory leak, deploy ruim): sintomas → diagnostico → **passos de mitigacao numerados** → como confirmar que voltou. Passos executaveis, com comandos reais, nao descricoes vagas.

7. **Restart seguro, flags e escalonamento.** Documente o procedimento de **restart seguro** (drain, ordem, o que verificar antes/depois), as **feature flags / kill switches** disponiveis (o que cada uma desliga e o efeito colateral) e a **cadeia de escalonamento** (primario → secundario → dono do sistema → quando acordar quem).

8. **Salvar e manter vivo.** `docs/runbooks/{servico}.md` (`templates/runbook.md`). Um runbook desatualizado e pior que nenhum — vincule-o ao postmortem para que cada incidente o mantenha correto.

## Convencoes

- Escrito para quem **nao conhece** o servico e esta sob pressao: passos numerados, comandos copy-paste, sem pressupor contexto.
- Todo alarme tem **o que significa + primeiro passo**. Todo playbook tem **como confirmar** que resolveu.
- Kill switches e flags com **efeito colateral** explicito (o que se perde ao aciona-las).
- Links reais para dashboards, runbooks de dependencias e canais de on-call.
- Datas absolutas (`AAAA-MM-DD`) no controle de versao. Linguagem: portugues (pt-BR).

## Output format

Arquivo `docs/runbooks/{servico}.md` seguindo `templates/runbook.md`. Ao final, reporte: caminho, dono/on-call, nº de playbooks e alarmes documentados, e gaps conhecidos (o que ainda falta preencher).

## Anti-patterns a evitar

- Runbook narrativo, sem passos executaveis — sob pressao ninguem le paragrafo, seguem passo numerado.
- Alarme listado sem dizer o que significa nem o primeiro passo.
- Playbook sem criterio de "voltou ao normal" — nao da pra saber se a mitigacao funcionou.
- Rollback documentado mas nunca testado (descobrir que nao funciona durante o incidente).
- Kill switch sem o efeito colateral de aciona-lo.
- Runbook que envelhece: sem processo de atualizacao pos-incidente, vira ficcao.
- Duplicar o postmortem (analise de causa) ou a command incident-response (orquestracao ao vivo) — o runbook e so a fonte operacional.
