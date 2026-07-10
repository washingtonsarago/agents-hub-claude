# Postmortem: {Titulo do incidente}

- **Incidente:** {INC-NNN, se houver} · **Severidade:** {SEV-1..4}
- **Data do incidente:** {AAAA-MM-DD} · **Postmortem por:** {nome} · **Status:** {Rascunho | Revisado | Fechado}
- **Relacionados:** {incident.md · ADR-XXXX · PRs · alertas}

> **Blameless.** Este documento analisa sistemas e processos. Nenhuma secao atribui
> culpa a individuos — erro humano é um sintoma, não uma causa-raiz.

## Resumo

{2-4 frases: o que aconteceu, o impacto e como foi resolvido. Legivel por qualquer
stakeholder.}

## Impacto (quantificado)

- **Duracao:** {inicio real} → {resolucao} = {Xh Ymin}
- **Usuarios / requests afetados:** {numero + fonte}
- **Degradacao:** {ex.: p95 200ms → 8s; erro 5xx em 30% das req}
- **SLO / receita / dados:** {impacto concreto, ou "sem perda de dados"}

## Timeline (UTC)

| Horario | Evento |
|---|---|
| {AAAA-MM-DD HH:MM} | {inicio real do problema} |
| {HH:MM} | {deteccao — alerta / report} |
| {HH:MM} | {diagnostico / hipotese} |
| {HH:MM} | {mitigacao aplicada} |
| {HH:MM} | {resolucao confirmada} |

- **Gap de deteccao:** {tempo entre inicio real e deteccao}
- **Tempo de mitigacao:** {deteccao → mitigacao}

## Causa-raiz

### 5 Whys

1. Por que {sintoma}? → {...}
2. Por que {...}? → {...}
3. Por que {...}? → {...}
4. Por que {...}? → {...}
5. Por que {...}? → **{causa sistemica}**

### Fatores contribuintes

- {mudanca recente / gap de monitoramento / teste ausente / dependencia fragil / runbook inexistente}

## Analise

- **O que funcionou:** {deteccao, resposta, ferramentas que ajudaram}
- **O que falhou:** {gaps de processo, sinal, automacao}
- **Onde tivemos sorte:** {riscos latentes que so nao pioraram por acaso}

## Action items

| # | Acao | Tipo | Dono | Prioridade | Prazo |
|---|---|---|---|:---:|---|
| 1 | {reduzir recorrencia / melhorar deteccao} | Preventiva / Deteccao / Mitigacao / Processo | {nome} | P0 | {AAAA-MM-DD} |
| 2 | {...} | {...} | {nome} | P1 | {AAAA-MM-DD} |

## Licoes aprendidas

{1-3 bullets que o time deve carregar adiante. Candidatos a virar memoria de
projeto (.claude/memory/) ou ADR.}
