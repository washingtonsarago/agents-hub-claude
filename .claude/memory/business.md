<!-- Last updated: 2026-09-30 -->
# Business Memory

> Owns: domain glossary, business rules, user segments, permissions, JTBD, scope.
> Stack e topologia → [architecture.md](architecture.md). Convenções de código → [guidelines.md](guidelines.md).

## Product summary

`agents-hub-claude` é o registry centralizado de **agents, slash commands, skills e agents autônomos do Claude Code** da engenharia da EMS-NCTECH. Um dev roda `install.sh` uma vez; a partir daí o hook `SessionStart` roda `ahc sync` em toda sessão e o dev recebe o mesmo ferramental que o resto da engenharia, sem esforço manual. O objetivo é que boas práticas (checklists de review, ADR, discovery, fluxos com gates) virem código versionado em vez de wiki esquecida. Fonte: `README.md` §Objetivo.

**Escala:** mais de 50 devs rodam `ahc sync` hoje (confirmado pelo lead em 2026-09-14).

## Domain glossary

| Term | Meaning |
|------|---------|
| Hub | Repositório canônico `EMS-NCTECH/agents-hub-claude` — única origem de PRs, gates de CI, e de distribuição/sync para todos os devs. |
| `ahc` | CLI que instala e sincroniza os artefatos do hub na máquina do dev. |
| Artefato | Item distribuído. Quatro categorias: **agent** (`agents/*.md`), **command** (`commands/*.md`), **skill** (`skills/<nome>/`, multi-arquivo), **autonomous** (`autonomous/*.md`). |
| Manifest | `manifest.json` — índice com versão e sha256 por item (e por arquivo nas skills). Fonte da verdade da distribuição. |
| Lock | `~/.claude/.ahc-lock.json` — o que o `ahc` instalou na máquina, em que versão, e os pins. |
| Pin | Decisão explícita do dev de segurar um artefato numa versão (`ahc pin <nome>@<versão>`). |
| Channel | Rótulo do canal de distribuição (`stable`, `beta`), junto com a branch de origem. |
| Espelho (mirror) | Repositório privado `washingtonsarago/agents-hub-claude` — cópia manual derivada do hub canônico para acesso de usuários externos sem acesso à org. Não é canal de distribuição para a engenharia. |
| Agent autônomo | Rotina agendada (claude.ai routines) cuja spec vive versionada em `autonomous/`. |
| Trio de memória | `.claude/memory/{business,architecture,guidelines}.md` — contexto persistente do projeto lido por todos os agents. |
| Peer session | Outra sessão Claude Code viva, normalmente em outro repo, consultável pelo `/flow` só para verdade sobre aquele repo. |
| `tier` / `team` | Metadados de frontmatter de agent: custo de raciocínio (`reasoning`/`speed`) e bucket de time para `ahc list --team`. |
| Change-reviewer | Rename de `emstech-reviewer`; agent que revisa código nos gates do `/flow-lite` com perfil específico (ex-`emstech-reviewer`, demanda 004, 2026-09-30). |
| Mobile-qa-analyst | Agent de QA mobile com Maestro para E2E em Flutter, React Native e nativo (demanda 007, 2026-09-30). |
| Faixa trivial | Modo comprimido do `/flow` para mudança **até 1 arquivo**, **sem superfície sensível**, **sem contrato novo**, **≤ 3 AC** e **sem ADR** — 8 fases colapsadas, ≤ 4 subagents obrigatórios (demanda 006, 2026-09-30). |
| Prova de RED | Evidência verificável de que cada AC falha sem a mudança: ref sem a mudança + comando + trecho da saída vermelha, na §8 do `task.md` (demanda 006, 2026-09-30). |

## User segments & permissions

| Segment | Capabilities | Restrictions |
|---------|--------------|--------------|
| Dev da engenharia EMS-NCTECH | `install.sh`, `ahc sync/list/pin/unpin/config/doctor`, recebe atualizações a cada sessão | **Hoje:** precisa de acesso à org e credencial git configurada (`gh auth login` / credential helper), e sincroniza do canônico. **Após a demanda 001 (não entregue):** instala via one-liner `curl ... \| bash` com PAT fixo e sincroniza do canônico, sem credencial git |
| Contributor | Cria/edita artefatos via PR para `main` | Passa pelos gates de CI (validator, testes, manifest sem drift); push só para o remote EMS-NCTECH (`.githooks/pre-push`) |
| Lead do hub | Dono do `docs/ROADMAP.md` e das decisões pendentes (§9) | Conta que cria e administra o PAT fine-grained para acesso aos artefatos |
| Usuário externo (contractor, parceiro, ambiente restrito) | Sincroniza do espelho privado com a própria credencial git de colaborador (9 colaboradores em 2026-09-14) | Sem acesso ao hub canônico; recebe só o conteúdo publicado no espelho. A demanda 001 não serve este segmento |
| Agent autônomo | Executa no horário da spec, `mode: read-only` por padrão | `mode: write` exige `approved_by: <nome>` — o validator rejeita um sem o outro |

## Core business rules

- **Origem única.** O hub canônico `EMS-NCTECH/agents-hub-claude` é a única origem de contribuições, de CI/gates e de distribuição/sync. Todos os devs instalam e sincronizam a partir do hub canônico. Fork pessoal como default repontuaria todo install downstream — travado por `test/origin.test.js` e `.githooks/pre-push`.
- **Distribuição só via PR mergeado em `main`.** O que chega aos devs é o que passou pelos gates.
- **Distribuição mantida 100% dentro da org.** Todos os devs e ferramentas sincronizam direto do `EMS-NCTECH/agents-hub-claude`.
- **O sync só remove o que ele mesmo instalou.** Arquivo escrito à mão em `~/.claude` nunca é tocado; item pinado sobrevive à retirada do manifest.
- **Nenhum artefato pode ter o nome de um slash command nativo do Claude Code** — ele sombreia o nativo. Precedente: `/goal`, revertido e ainda assim ativo por um mês até existir a poda de órfãos.
- **Agent autônomo precisa de condição de silêncio** declarada — sem ela vira ruído que o time aprende a ignorar.
- **Ação irreversível por agent autônomo carrega um nome** (`approved_by`).
- **Custo reportado é medido, nunca estimado.** Estimativa apresentada como número é tratada como fraude pelo `/veredito`.
- **Novas capacidades vêm do ROADMAP item 8.1**, priorizadas por RICE. **Skills inertes** que distribuem conteúdo de commands carregado sob demanda (ex.: `flow-playbook` para protocolo de peer e playbook trivial do `/flow`) ficam fora dessa regra e exigem aval do lead — ADR-0003 (demanda 006, 2026-09-30).
- **Acesso via PAT** (decidido em 2026-09-14; escopo ajustado para o repo canônico em 2026-09-15): o token é **fine-grained, criado pela conta do lead** (`washingtonsarago`), **dono dos recursos = `EMS-NCTECH`**, **só leitura**, com escopo **só no repo canônico** (`EMS-NCTECH/agents-hub-claude`), `Contents` + `Metadata` read-only, e fica **fixo no código**. Sem conta de serviço, sem espelho como origem. O objetivo é apenas permitir install sem credencial git; **vazamento do token é risco aceito pelo lead**. Sem cofre de segredos. **Precedência em cascata:** `AHC_GITHUB_TOKEN` (env) → `token` em `~/.claude/.ahc-config.json` → token fixo no código → credenciais git do dev. Quando uma origem é recusada, o `ahc` tenta a próxima. A primeira que autentica ganha; falha ocorre só quando todas as origens são recusadas. Racional: um token revogado não deve parar devs com credenciais git funcionando, e um token obsoleto no config não deve esconder um token válido. **Reinstalação preserva o token:** re-executar o instalador mantém um `token` já salvo no config. **Overrides são locais:** um novo token passado por env ou config toma efeito no próximo sync, sem reinstalar nem limpar o cache. Dev sem credencial git recebe o hub via **one-liner `curl ... | bash` publicado na wiki interna**, com o token. PAT por usuário segue fora de escopo.
- **Sucesso de install só com artefatos realmente instalados** (derivada dos AC da demanda 001, 2026-09-14): o instalador não reporta sucesso quando o acesso ao hub foi recusado.
- **Permissão do arquivo de config** (derivada dos AC da demanda 001, 2026-09-14): arquivo config contendo `token` e escrito por `ahc` ou pelo instalador tem mode 600.
- **Saída do `ahc config` mascara o token** (decisão do lead, demanda 001, 2026-09-15): mostra só o prefixo e os 4 últimos caracteres; o arquivo em disco guarda o valor completo com modo 600.
- **Sem alteração de configuração git global** (derivada dos AC da demanda 001, 2026-09-14): `ahc` nunca muda `~/.gitconfig` do dev ou o credential helper.
- **O rigor de spec é calibrado pela clareza do pedido, nunca pela criticidade ou complexidade.** Um pedido bem escrito e sem ambiguidade justifica menos AC; um pedido vago continua com quantidade livre. Calibração reduz AC **em quantidade**, nunca em rigor de prova — cada AC sobrevivente é verificado com o mesmo rigor que antes. O exit gate de verificação (cada AC tem teste que falha sem a mudança) não muda. Implementado via Phase 0.5 TRIAGE (pré-triagem da clareza), score 1–10, ramificação teto ≤ 10 AC acima do corte (demanda 003, 2026-09-17).
- **Faixa trivial do `/flow` colapsa a cadeia sem remover gates.** Critério objetivo: ≤ 1 arquivo de produção, nenhuma superfície sensível, nenhum contrato novo, ≤ 3 AC, sem ADR. Superfície sensível exclui sempre; TRIAGE abaixo do corte (≤ 6) não dispara faixa trivial — TRIAGE mede clareza, não tamanho. TRIAGE está registrada antes do DEFINE num campo da §0 do `task.md`. 8 fases existem colapsadas, ≤ 4 subagents obrigatórios (dev da stack, security gate, 1 revisor). Sair da faixa (critério cai no meio) → DEFINE e PLAN refeitos em faixa padrão, sem volta à trivial. Security gate sempre obrigatório; `/code-review` fail-closed quando falta revisor. Faixa trivial deve estar registrada na demanda ANTES do DEFINE (Phase 0.5 é seleção de faixa, não TRIAGE). (demanda 006, decisão do lead 2026-09-30).

## Scope

**In scope:** distribuição e versionamento de artefatos do Claude Code para a engenharia; CLI de sync/diagnóstico; coordenação de sessões no mesmo checkout; specs de agents autônomos; espelho externo gerado; medição de custo de sessão.

**Out of scope** (fonte: `docs/ROADMAP.md` §10 — não voltar à mesa sem fato novo):
- Repo público (política interna).
- Espelho em git interno (a empresa não tem GitLab/Bitbucket).
- PAT por usuário (exige acesso ao GitHub, que é a lacuna original).
- `ahc playground`, voice mode, A/B testing de agents, federação cross-org.

## Compliance / regulatory

- Uso interno EMS-NCTECH (README §Licença).
- Regulação aplicável (LGPD etc.): _a confirmar_ — o hub não processa dados de cliente identificados no código.

## Decisions log (product/domain)

- Espelho privado vira canal único de distribuição, sincronizado automaticamente a cada merge; token fine-grained da conta do lead com escopo só no espelho (conta de serviço descartada por limitação do PAT fine-grained) — 2026-09-14 (lead, demanda 001) — **revertida em 2026-09-15**
- Fallback em cascata entre origens de token e preservação do token na reinstalação — 2026-09-14 (lead, demanda 001)
- PAT fine-grained **fixo no código**, sem cofre, vazamento aceito — 2026-09-14 (lead, demanda 001; reverte "token embutido" do ROADMAP §10 e fecha a pendência de cofre do §1/§9 — ROADMAP ainda não atualizado) — **segue válida**; só o escopo mudou em 2026-09-15, do espelho para o repo canônico com dono dos recursos EMS-NCTECH (ver entrada de 2026-09-15)
- Distribuição mantida 100% dentro da org: re-escopo do espelho revertido (bloqueado pelo controle de segurança — conteúdo da org sairia da org); token fine-grained com dono dos recursos EMS-NCTECH, só o repo canônico — 2026-09-15 (lead, demanda 001)
- `/goal` removido por sombrear o slash command nativo — ver commit `revert(commands): remove /goal`
- Categoria `autonomous/` com gate `mode: write` + `approved_by` — ROADMAP §2
- **Demanda 004 (2026-09-30):** rename `emstech-reviewer` → `change-reviewer` com description restrita; regra `model × tier` no validator; eval de roteamento promovido a ferramenta versionada em `scripts/routing-eval/`; compatibilidade com nomes legados (`.emstech-reviewer.json`, bloco cercado, `EMSTECH_TELEMETRY`, diretório de estado). ADR na arquitecture.md ou veredito de design explícito; memory registra.
- **Demanda 005 (2026-09-30):** No-go. Calibração contra falsos positivos nos agents revisores: o excesso só aparecia forçando haiku no benchmark, mas os revisores rodam em opus e a regra `model × tier` já impede haiku com `tier: reasoning`. Lição: medir no modelo em que o artefato roda.
- **Demanda 006 (2026-09-30):** Faixa trivial colapsa 8 fases em ≤ 4 subagents; prova de RED verificável em fase VERIFY; status por fase e retomada; teto de 3 passagens; `/code-review` fail-closed; UX consulta na PLAN e lente na REVIEW para UI visível. Skill inerte `flow-playbook` distribui protocolo de peer e playbook trivial sob demanda — exceção aprovada à regra ROADMAP 8.1 (ADR-0003, lead 2026-09-30).
- **Demanda 007 (2026-09-30):** Agent novo `mobile-qa-analyst` com Maestro, E2E mobile em Flutter/RN/nativo; linha mobile na Phase 4 do `/flow` — roteamento por PREDICADO MOBILE (Dart/RN/nativo); comportamento honesto (nunca verde sem execução); risco residual S-03 aceito (Maestro checksum não tem attestation, adulteração no release não é detectável) — lead assinou o aceite.
