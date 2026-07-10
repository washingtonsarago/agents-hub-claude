# Runbook: {{servico}}

- **Servico:** {{servico}} · **Tier / criticidade:** {{tier}} · **SLO:** {{ex.: 99.9% · p95 < 300ms}}
- **Dono (time/squad):** {{time}} · **On-call:** {{canal / escala PagerDuty-Opsgenie}}
- **Repositorio:** {{link}} · **Ambientes:** {{prod / staging}}
- **Ultima revisao:** {{AAAA-MM-DD}} · **Revisado por:** {{nome}}

> Escrito para quem **nao conhece** este servico e esta sob pressao. Siga os passos
> numerados. Em incidente ao vivo, use a command `incident-response`; depois de
> mitigado, escreva o `postmortem`. Cada postmortem deve **atualizar** este runbook.

## 1. Visao geral

{{2-4 frases: o que o servico faz, papel no fluxo de negocio e o que quebra para o
usuario final se ele cair.}}

## 2. Dependencias

**Upstream (o servico depende de):**

| Dependencia | Tipo | Critica? | Comportamento se cair | Runbook / contato |
|---|---|:---:|---|---|
| {{ex.: Postgres orders}} | DB | Sim | {{fail-closed: 5xx}} | {{link}} |
| {{ex.: Redis cache}} | Cache | Nao | {{fail-open: degrada latencia}} | {{link}} |
| {{ex.: API de pagamentos}} | HTTP externo | Sim | {{fila de retry}} | {{link}} |

**Downstream (dependem deste servico):**

- {{servico/consumidor}} — {{impacto se este cair}}

## 3. Deploy

- **Como:** {{pipeline / comando / GitOps}}
- **Aprovacoes:** {{quem aprova / gates}}
- **Duracao tipica:** {{X min}} · **Estrategia:** {{rolling / blue-green / canary}}
- **Verificacao pos-deploy:** {{dashboards / smoke test a checar}}

## 4. Rollback

> Rollback e a mitigacao mais comum. Deve estar testado e a um comando de distancia.

1. {{comando / passo para reverter para a versao anterior}}
2. {{como confirmar que a versao anterior esta ativa}}
3. **Confirmar recuperacao:** {{metrica que deve normalizar}}

- **Duracao tipica do rollback:** {{X min}}
- **Migracoes de banco?** {{reversiveis? procedimento especial?}}

## 5. Health checks & dashboards

| Recurso | Onde | O que observar |
|---|---|---|
| Health / readiness | {{URL /healthz}} | {{200 = ok}} |
| Dashboard principal | {{link Grafana/Datadog}} | {{latencia, erro, saturacao}} |
| Logs | {{link / query}} | {{como filtrar por request-id}} |
| Traces | {{link}} | {{...}} |

**Metricas-chave (RED/USE):** {{taxa de req, taxa de erro, p95/p99, CPU/mem, fila}}

## 6. Alarmes & alertas

> Para cada alarme: o que significa (o sintoma real) e o **primeiro passo**.

| Alarme | O que significa | Severidade | Primeiro passo |
|---|---|:---:|---|
| {{HighErrorRate}} | {{5xx acima de X% por Ymin}} | SEV-2 | {{ver playbook 8.1}} |
| {{HighLatency}} | {{p95 > Xms}} | SEV-3 | {{ver playbook 8.2}} |
| {{QueueBacklog}} | {{fila > N mensagens}} | SEV-2 | {{ver playbook 8.3}} |

## 7. Escalonamento

| Nivel | Quem | Quando acionar | Contato |
|---|---|---|---|
| L1 - Primario | {{on-call do time}} | Sempre, primeiro | {{canal / telefone}} |
| L2 - Secundario | {{backup}} | Sem resposta em {{X min}} ou SEV-1 | {{...}} |
| L3 - Dono do sistema | {{tech lead / autor}} | {{causa desconhecida / dado em risco}} | {{...}} |
| Fora do time | {{time da dependencia}} | {{quando a causa e upstream}} | {{link on-call deles}} |

## 8. Playbooks de recuperacao

> Falhas comuns. Cada um: **sintomas → diagnostico → mitigacao → confirmar**.

### 8.1 {{Dependencia critica fora do ar}}

- **Sintomas:** {{5xx, alarme X, dashboard Y vermelho}}
- **Diagnostico:** {{como confirmar que a causa e a dependencia — check, log, health dela}}
- **Mitigacao:**
  1. {{acionar kill switch / fail-open, se aplicavel}}
  2. {{escalar para o time da dependencia (secao 7)}}
  3. {{...}}
- **Confirmar recuperacao:** {{metrica/alarme que deve normalizar}}

### 8.2 {{Latencia alta / saturacao}}

- **Sintomas:** {{p95 subindo, CPU/mem alto}}
- **Diagnostico:** {{deploy recente? pico de trafego? dependencia lenta? query ruim?}}
- **Mitigacao:**
  1. {{escalar horizontalmente / aumentar replicas}}
  2. {{rollback se coincide com deploy (secao 4)}}
  3. {{...}}
- **Confirmar recuperacao:** {{p95 volta a < Xms}}

### 8.3 {{Fila / backlog acumulando}}

- **Sintomas:** {{lag do consumidor, mensagens presas}}
- **Diagnostico:** {{consumidor caido? poison message? throughput insuficiente?}}
- **Mitigacao:**
  1. {{verificar/reiniciar consumidores}}
  2. {{redirecionar poison messages para a DLQ}}
  3. {{...}}
- **Confirmar recuperacao:** {{lag volta a zero}}

### 8.4 {{Deploy ruim / regressao}}

- **Sintomas:** {{erro/latencia comecou logo apos deploy}}
- **Mitigacao:** {{rollback imediato — secao 4}}
- **Confirmar recuperacao:** {{metricas voltam ao baseline pre-deploy}}

## 9. Restart seguro

> Reiniciar sem causar perda de dados ou efeito cascata.

1. **Antes:** {{drenar conexoes / desregistrar do LB / pausar consumidor}}
2. {{ordem de restart — ex.: uma replica por vez, aguardar readiness}}
3. {{comando de restart}}
4. **Depois:** {{verificar health, dashboards e que nao ha requests em erro}}

- **Nao reinicie se:** {{condicoes perigosas — ex.: migracao em andamento}}

## 10. Feature flags & kill switches

| Flag / switch | O que desliga | Efeito colateral | Como acionar |
|---|---|---|---|
| {{kill_pagamentos}} | {{fluxo de pagamento}} | {{clientes nao finalizam compra}} | {{painel / comando}} |
| {{degrade_cache}} | {{leitura sem cache}} | {{latencia maior, DB mais carregado}} | {{...}} |

## 11. Referencias

- **Arquitetura / ADRs:** {{links}}
- **Runbooks das dependencias:** {{links}}
- **Postmortems relacionados:** {{links — incidentes que geraram atualizacoes aqui}}
- **Canal de on-call / escala:** {{link}}
- **Contatos de fornecedores/terceiros:** {{SLA, suporte, telefone}}
