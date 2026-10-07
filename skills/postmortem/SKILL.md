---
name: postmortem
description: Gera um postmortem blameless de incidente em Markdown, com resumo de impacto, timeline, analise de causa-raiz (5 Whys / contributing factors), o que funcionou/falhou e action items rastreaveis. Use quando o usuario pedir "escreve o postmortem", "post-mortem desse incidente", "analise de causa-raiz", "RCA", "retro do incidente", "documenta o que aconteceu na queda", ou apos um incidente ser mitigado. Cultura blameless: foca em sistemas e processos, nunca em culpar pessoas. Faz par com a command incident-response e com o agent system-architect (para ADR de mudanca estrutural).
---

# postmortem

Skill para produzir um **postmortem blameless** apos um incidente. A saida e um arquivo Markdown — alinhado a estrutura da command `incident-response`: se existir `docs/incidents/INC-NNN-<slug>/`, salva como `postmortem.md` dentro dela; caso contrario, em `docs/postmortems/{AAAA-MM-DD}-{slug}.md`.

Princípio central: **blameless**. O postmortem analisa *sistemas, processos e sinais* que permitiram o incidente — nunca atribui culpa a pessoas. Um postmortem que aponta culpados ensina o time a esconder erros; um blameless ensina a corrigir o sistema.

## Quando usar esta skill

Acione quando o usuario pedir, em qualquer variacao:

- "escreve o postmortem", "post-mortem desse incidente"
- "analise de causa-raiz", "RCA", "root cause"
- "retro do incidente", "documenta a queda de ontem"
- apos um incidente ser mitigado (handoff natural da command `incident-response`).

Diferenca para outras capacidades:
- **`incident-response` (command):** orquestra o incidente *ao vivo* (mitigar, timeline em tempo real, severidade). O postmortem e o artefato de *aprendizado* produzido depois — pode consumir a `incident.md` gerada por ela.
- **`adr` (skill):** se uma action item for uma decisao arquitetural, gere tambem um ADR e linke-o.

## Processo recomendado

1. **Reunir os fatos.** Use a `incident.md` da command `incident-response` se existir (timeline, severidade, ID). Senao, colete: o que aconteceu, quando comecou/terminou, quem detectou, impacto. Pergunte o essencial faltante (max 3 perguntas).

2. **Quantificar o impacto.** Seja concreto: duracao, usuarios/requests afetados, dados perdidos, receita/SLO impactado. "Ficou lento" nao e impacto; "p95 subiu de 200ms para 8s por 47min, ~12k usuarios" e.

3. **Reconstruir a timeline** (em UTC). Deteccao → diagnostico → mitigacao → resolucao. Marque os marcos: *quando comecou de fato* vs *quando foi detectado* (a diferenca = gap de deteccao) e *quando foi mitigado* vs *resolvido*.

4. **Analisar a causa-raiz — blameless.**
   - Aplique **5 Whys** ate chegar a causa sistemica (nao pare em "fulano deu deploy errado"; pergunte por que o sistema *permitiu* esse deploy chegar a producao).
   - Liste **fatores contribuintes** (raramente ha uma unica causa): mudanca recente, gap de monitoramento, falta de teste, runbook ausente, dependencia fragil.
   - Linguagem voltada a sistema: "o pipeline nao tinha gate de X", nao "a pessoa esqueceu de X".

5. **O que funcionou / o que falhou / onde tivemos sorte.** Honestidade nos tres. "Onde tivemos sorte" expoe riscos latentes que so nao viraram incidente por acaso.

6. **Action items rastreaveis.** Cada um com: descricao, **dono**, prioridade, prazo, e tipo (preventiva / deteccao / mitigacao / processo). Action item sem dono e sem prazo nao existe. Priorize as que **reduzem recorrencia** ou **diminuem o tempo de deteccao**.

7. **Salvar e linkar.** Atualize o `incident.md` (se houver) com link para o postmortem. Se gerou ADR, linke reciprocamente.

## Convencoes

- **Blameless sempre.** Sem nomes em contexto de culpa; papeis/equipes quando necessario.
- Timeline em **UTC**, formato `AAAA-MM-DD HH:MM`.
- Impacto **quantificado**, com numeros e fonte.
- Action items com **dono + prazo + prioridade** obrigatorios.
- Linguagem: portugues (pt-BR).

## Output format

Arquivo seguindo `templates/postmortem.md`, salvo em `docs/incidents/INC-NNN-<slug>/postmortem.md` (se a pasta existir) ou `docs/postmortems/{AAAA-MM-DD}-{slug}.md`. Ao final, reporte: caminho, severidade, nº de action items por prioridade e os P0 com seus donos.

## Anti-patterns a evitar

- **Culpar pessoas** ("erro humano" como causa-raiz — humano errar e esperado; o sistema deveria conter).
- Parar o 5 Whys cedo demais, na causa proxima e nao na sistemica.
- Impacto vago, sem numeros.
- Action items sem dono/prazo — viram lista de desejos.
- So o que falhou — registre tambem o que funcionou e onde houve sorte.
- Postmortem que nao reduz recorrencia nem melhora a deteccao.
