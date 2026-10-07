<!-- demand: 003-flow-lite -->
<!-- created: 2026-09-17 -->
# Change: `/flow-lite` e `emstech-reviewer` — lote de itens com gate antes do commit

## 0. GOAL
**Brief de origem:** prompt do lead (2026-09-17), "implement the `/flow-lite` command"; referência de desenho "emstech-reviewer — gate mode specification".
**Objetivo (por quê):** o experimento `/flow` produziu dois modos de falha: **inflação** (o dobro de código de produção, o triplo de testes, subsistemas duplicados em versões divergentes, CI vermelha) e **desonestidade silenciosa** (entregar como completo o que o modelo de dados não sustenta, inferindo em vez de declarar a limitação). `/flow-lite` é menos volume com mais rigor: escopo limitado por item, honestidade obrigatória e um gate que roda antes do commit.
**Métrica de sucesso:** critérios de aceite da §9 do prompt, medidos num lote real contra os dois braços do experimento.
**Baseline:** braço `/flow` (inflação e inferência silenciosa observadas) → **Target:** CI 100% verde · arquivos criados por mais de um item divergindo ≤ 2 · itens bloqueados declarados 100% · inferência silenciosa 0 · itens sem wiring 0 · mediana de iterações até verde ≤ 2 · bloco de run-summary em 100% das runs · payload enviado == `--dry-run` byte a byte.
**Recomendação:** Go (lead, 2026-09-17).

## 1. Decisões do lead (2026-09-17) — fixas
1. **Exit 4 fail-closed, granular.** Diff, `CLAUDE.md` ou worktree ilegível → 4 sempre. Tracker inalcançável → 4 só se o perfil marcar o tracker como obrigatório.
2. **Override.** Autor sozinho registra no commit; o override vira item obrigatório de revisão no corpo do PR. Perfil pode exigir segundo aprovador por regra: `overrideRequiresSecondApprover: [ruleIds]`.
3. **Atribuição no commit: declarar** (`Co-Authored-By`). A regra de não assinar como IA vale só para corpo de comentário de revisão. Documentar os dois contextos separadamente.
4. **`team: meta`.** Núcleo mantido pelo time de origem na v1; quem mantém o núcleo decide o que é estrutural. "Perfil pode criar e elevar, nunca rebaixar" é teste, não convenção.
5. **Telemetria opt-out** com aviso de primeira execução. Piso de agregação (mínimo 5 pessoas) e ausência de painel por pessoa entram **na mesma fase** da emissão. Texto do aviso: rascunho vai ao lead na fase 8.
6. **Idioma.** Inglês em tudo que é distribuído: código, prompts, schema, CLI, relatório markdown do gate, aviso de primeira execução, doc de adoção. PT-BR (convenção do repo) no interno: assuntos de commit, este `task.md`, ADRs.
7. **`finalize` re-hash:** gravar o hash antes e depois, ambos em `gate.json`. O veredito fica fixado a um estado.
8. **`.claude/memory/*.md`** na precedência mais baixa da cascata: contribui só convenção e exceção de escopo, nunca diretiva bloqueante nem elevação de severidade.
9. **Teto de bytes de diff** enviados ao modelo. Estourou → `capabilities.diffCoverage: "partial"` com caminhos não avaliados **contados, nunca nomeados**.
10. OTLP/HTTP com JSON (zero deps). Tokens por fase só mensuráveis com OTel vivo; sem ele, "Not measured".

## 2. Convenções do repo que vencem o prompt
- Lógica executável vive em `skills/<nome>/scripts/*.js`, zero deps, CommonJS, instalada em `~/.claude/skills/<nome>/scripts/` (precedente: `session-cost`).
- Manifest regenerado **dentro do PR** (`node scripts/regen-manifest.js`); o ruleset da org recusa o auto-commit na `main`.
- Testes `node:test`, um arquivo por feature, contra o script real.
- Branch `feat/003-flow-lite` por fase; uma PR por fase.

## 3. Arquitetura
- **Agent `agents/emstech-reviewer.md`** — um prompt, dois modos (`pr`, `gate`). Julga `honesty`, `wiring`, `rule-parity`, `project-context`. Emite achados só no schema JSON. Nunca decide exit code, nunca roda git.
- **Skill `skills/emstech-reviewer/`** — a metade determinística (`scripts/gate.js`): leitor de diff read-only, cascata de `CLAUDE.md`, regras mecânicas (`ownership`, `suite`, `secret`, `scope`), `finalize` (schema, veredito, exit code, re-hash), `telemetry`. Perfis em `profiles/`.
- **Command `commands/flow-lite.md`** + `skills/flow-lite/scripts/` — lote (manifesto de ownership, ordem de merge, reconciliação), pipeline por item, run-summary, emissor OTLP.
- Reuso: `ahc worktree`, `ahc coord`, skill `session-cost` (fontes A/B, snapshot por janela, endpoint OTLP), Step 0 do `/code-review`, taxonomia do `/veredito`, regra "sem acesso vivo → inconclusivo" da skill `pr-review`.

## 4. Fases (uma PR cada)
- [x] **F1** Descoberta e plano — apresentado e aprovado em 2026-09-17.
- [x] **F2** Leitor de diff local com allowlist read-only estrutural — `skills/emstech-reviewer/scripts/{gate.js,lib/git-readonly.js,lib/diff-reader.js}`, `test/emstech-reviewer-diff.test.js` (16 testes). Entrega: subcomandos `diff` e `state-hash`; teto de bytes com `coverage.mode: partial` e `filesOmitted` (contagem); hash de estado sobre o diff completo + untracked; exit 2 e 4.
- [x] **F3** Descoberta de contexto + motor de regras + schema — `lib/context.js` (cascata dir tocado → raiz → workspace; `CLAUDE.local.md` só aperta; `.claude/memory` só convenção e exceção de escopo; bloco ```` ```emstech-reviewer ```` com JSON; prosa que tenta redirecionar é registrada e ignorada), `lib/rules.js` (núcleo: `honesty`, `ownership`, `wiring`, `rule-parity`, `suite`, `scope`, `secret`, `project-context`; estruturais: `honesty`, `ownership`, `suite`, `secret`), `lib/profile.js` (perfil só cria e eleva), `lib/schema.js` + `schema/*.json` (`confirmed:false` nunca `blocker`).
- [x] **F4** `gate.js prepare|finalize|run` — `lib/gate-run.js`, `lib/tracker.js` (adapters `none|fixture|command`; inalcançável vira 4 só se o perfil exigir), `lib/render-md.js` (UTC, sem nits sobre blocker), re-hash antes/depois em `gate.json`, `--report-only`, overrides por achado com `requiresSecondApprover`, trailers de commit. `test/emstech-reviewer-gate.test.js` (23 testes).
- [x] **F5** `commands/flow-lite.md` (pipeline por item, gate obrigatório, loop de remediação com cap do perfil, decisão só pelo exit code) e `agents/emstech-reviewer.md` (modos `pr` e `gate`, calibração, atribuição documentada nos dois contextos).
- [x] **F6** Lote — `skills/flow-lite/scripts/lib/batch.js`: `manifest validate`, `order` (ciclo → exit 1), `reconcile` (divergência → exit 1 antes de qualquer PR). `test/flow-lite-batch.test.js` (5 testes).
- [x] **F7** Run-summary — `lib/ledger.js` (tempo de parede carimbado pelo script; tokens só via `otel-cost.js` da `session-cost`, senão `not measured`/`inconclusive` com causa) e `lib/summary.js` (bloco em stdout + `run-summary.json`/`.md`, inclusive em run falha; caveat obrigatório).
- [x] **F8** Adoção — `lib/telemetry.js`: evento derivado do run-summary por allowlist (`schema/adoption-event.schema.json`), aviso de primeira execução = `TELEMETRY.md`, `--notice|--ack|--dry-run|--show-last|--purge|--flush|--aggregate`, spool limitado (50 arquivos / 7 dias), OTLP/HTTP JSON assíncrono e fail-open, `EMSTECH_TELEMETRY_SYNC=1` para CI, piso de agregação de 5 pessoas implementado no agregador de referência. `test/flow-lite-summary-telemetry.test.js` (9 testes), incluindo `--no-telemetry` sem efeito no resumo e payload enviado == `--dry-run` byte a byte.
- [x] **F9** `profiles/regulated.json` (exemplo do time de origem, sem nome de org) e `ADOPTION.md` (`--report-only` obrigatório na primeira run).

**Estado em 2026-09-17:** tudo implementado na branch `feat/003-flow-lite`, 53 testes novos verdes, validador 0/0, manifest regenerado. Pendente: commit único e push (credencial da máquina não alcança a org), texto final do aviso de telemetria (rascunho em `skills/flow-lite/TELEMETRY.md`), e o lote real para medir os critérios da §9.

## 5. Fora de escopo (v1)
Auto-merge, auto-aprovação, fechar PR; resolução automática de conflito; aplicar DDL; decompor work item no tracker sem revisão humana; métricas por pessoa; dashboard de telemetria.

## 6. Lacunas conhecidas
- Nenhum `CLAUDE.md` neste repo: a cascata lê `.claude/memory/*.md` na precedência mais baixa (decisão 8).
- Conectores MCP (Atlassian etc.) não autorizados nesta sessão: adapter de tracker declarado em config e testado com fixture.
- Remote `origin` recusa a credencial desta máquina (`Repository not found` no `git pull`, 2026-09-17): push e abertura de PR dependem de credencial válida.
