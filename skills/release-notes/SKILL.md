---
name: release-notes
description: Gera release notes estruturadas em Markdown (e PDF opcional via pandoc) a partir de versao + commits/PRs/manual input. Use quando o usuario pedir "release notes", "changelog do release", "documenta a v2.5", "compila as PRs do sprint em release notes", "gera o PDF de release". Estrutura padrao: header (versao, data, manager), summary, breaking changes (com migration), security fixes, features, improvements, fixes, deprecations, contributors. Output: arquivo `.md` (sempre) + `.pdf` (se pandoc estiver instalado).
---

# release-notes

Skill para empacotar release notes profissionais a partir de dados de um release (versao, commits, PRs, ou input manual). Saida principal e Markdown estruturado; PDF opcional via pandoc se o ambiente tiver.

## Quando usar esta skill

Acione quando o usuario pedir, em qualquer variacao:

- "release notes", "release notes da v2.5", "documenta o release"
- "gera o PDF de release", "release notes em PDF"
- "compila as PRs do sprint em release notes"
- "changelog estruturado entre v1.4.0 e v1.5.0"
- "executive summary do release pra mandar pro time"

Nao usar para:

- Mensagens individuais de commit → use `/smart-commit`.
- Documentacao tecnica continua → `project-memory-keeper` (READMEs, ADRs).
- Postmortem de incidente → `/incident-response` cobre.
- One-off changelog em formato livre — use editor manual.

## Pre-requisitos

```bash
python3 -c "import jinja2" 2>/dev/null || pip3 install --quiet jinja2
```

Pra gerar PDF (opcional):

```bash
which pandoc >/dev/null 2>&1 || echo "pandoc nao instalado — PDF sera pulado"
which xelatex >/dev/null 2>&1 || echo "xelatex nao instalado — PDF pode falhar (instale via mactex/texlive)"
```

A skill funciona sem pandoc — gera apenas markdown nesse caso, sem erro.

## Processo recomendado

1. **Identificar o range do release**
   - Pergunte ao usuario: versao nova (`X.Y.Z`), versao anterior, data alvo (default: hoje).
   - Se houver tag git da versao anterior, use `git log <prev>..HEAD --oneline` pra coletar commits candidatos.
   - Se houver acesso ao GitHub: `gh pr list --base main --state merged --search "merged:>=YYYY-MM-DD"` pra listar PRs.

2. **Classificar mudancas**
   - Leia o titulo de cada commit/PR e classifique:
     - `feat:` ou novo endpoint/feature visivel → **features**
     - `perf:`, `refactor:` que ganha algo observavel, `chore:` operacional relevante → **improvements**
     - `fix:` → **fixes**
     - `BREAKING CHANGE:` no body, ou remocao de endpoint/campo → **breaking**
     - vulnerabilidade fechada (CVE, OWASP, audit interno) → **security**
     - feature flag desativada que removeu codigo legado → **deprecations** (entry pra "removed in")
   - Pergunte ao usuario quando houver duvida — nao classifique a esmo.

3. **Coletar contexto pra cada item**
   - Titulo: 1 linha, claro pra leitor externo (sem jargao do squad).
   - Descricao: 1–3 linhas com o "o que mudou" + "por que importa".
   - PR # / issue # / autor (`@handle`) — sempre que disponiveis.
   - Para breaking: **migration** obrigatoria (steps numerados, exemplos de antes/depois).
   - Para security: severity (Critical / High / Medium / Low), CVE se publico, descricao curta.

4. **Adaptar o template**
   - Copie `templates/render.py` para `/tmp/<nome>.py`.
   - Substitua o dict `CONTEXT` com os dados coletados.
   - O template Jinja2 (`templates/release-notes.md.j2`) e referenciado por path relativo — copie ele tambem ou aponte `TEMPLATE_DIR` pra skill instalada (`~/.claude/skills/release-notes/templates/`).

5. **Renderizar e revisar**
   - `python3 /tmp/<nome>.py`.
   - Use Read no `.md` gerado: revise hierarquia (sections nao vazias), tom (consistente, formal-tecnico), markdown valido.
   - Se houver PDF: abra mentalmente — header bem formatado? listas legiveis? quebras de pagina sensatas?

6. **Salvar no projeto**
   - Caminho preferido: `docs/releases/v<X.Y.Z>.md` (e `.pdf` se gerou).
   - Senao: raiz ou `/tmp` se for descartavel.
   - Ofereca tambem postar no GitHub Releases (`gh release create v<X.Y.Z> --notes-file docs/releases/v<X.Y.Z>.md`).

## Sistema de design (estrutura do documento)

Diferente das skills de diagrama, aqui o "design" e a **arquitetura textual** do documento. Mantenha-a estavel pra que devs e stakeholders saibam o que esperar.

### Ordem das secoes (rigorosa)

1. **Header** — produto, versao, data, manager, versao anterior, sha. Em blockquote.
2. **Summary** — 1–2 paragrafos. O "what + why" do release pra alguem que nao acompanhou o sprint.
3. **Breaking changes** (se houver) — primeiro depois do summary, com warning visual. Cada um com migration steps.
4. **Security fixes** (se houver) — tabela com severity, descricao, CVE/PR.
5. **Features** — heading H3 por feature, descricao, PR/autor em linha de metadata.
6. **Improvements** — bullets com 1 linha de descricao.
7. **Fixes** — bullets curtos, com `fixes #issue` e `PR #N`.
8. **Deprecations** — tabela com `what / replacement / removed_in`.
9. **Migration guide** — apenas se nao houver breaking (que ja tem migration inline).
10. **Contributors** — lista de handles separada por virgulas.

### Convencoes de redacao

- **Voz ativa.** "Adicionado suporte X" → "Suporte a X". "Foi corrigido" → "Corrigido".
- **Sem `we`/`our`.** Foca no produto, nao na squad.
- **PR/issue refs sempre** — link rastreavel e o que da credibilidade.
- **Codigo em `inline code`** — nomes de endpoint, parametro, header, env var.
- **Sem emojis no corpo** — apenas nos headers padrao do template (✨ 🔧 🐛 ⚠ 🔒 🕯 🚀 🙌). Nao espalhe emojis pelas descricoes.
- **Datas em ISO 8601** (`2026-05-12`) — universal, sem ambiguidade.
- **Sem promessas vagas.** "Melhoramos a performance" → "p99 de /checkout caiu de 480ms pra 180ms".

### Tipografia (PDF)

Quando `pandoc + xelatex` estao disponiveis:

- Mainfont: `Helvetica Neue`.
- Monofont: `Menlo`.
- Margem: 2cm.
- Linkcolor: NavyBlue.
- Sem cabecalho/rodape customizado — minimal, legivel.

## Template de referencia

Use `templates/render.py` como ponto de partida. Ele ja contem:

- `Environment` Jinja2 configurado (trim_blocks + lstrip_blocks).
- `CONTEXT` dict com exemplo realista (release ficticio com breaking, security, features, improvements, fixes, deprecations).
- Render para markdown + tentativa de PDF via pandoc/xelatex (silencia se ferramentas faltarem).

`templates/release-notes.md.j2` e o template Jinja2 com a estrutura completa. Geralmente nao precisa editar — apenas substituir o `CONTEXT` no `render.py`.

## Variantes que voce pode oferecer ao usuario

- **"Concise"** — so summary + features + breaking changes. Bom pra emails internos.
- **"Customer-facing"** — corta `improvements` e `fixes` que sao internos; foca em features visiveis e breaking changes. Bom pra customers/parceiros.
- **"Full audit"** — inclui tudo + appendix com tabela de todos os PRs do range (titulo, autor, PR #).
- **"Patch release"** — apenas `fixes` + `security`, sem features. Header mais curto.
- **"PDF executive"** — render so do summary + features + um chart (se a skill `architecture-diagram` foi usada pra gerar uma image, embed no PDF).

## Anti-padroes (nao faca)

- Nao gerar release notes a partir so de commit messages sem revisar — commits sao escritos pra dev, release notes sao escritas pra leitor externo.
- Nao listar mudancas internas-apenas (refactor de teste, lint, ci tweaks) — poluente.
- Nao misturar features e fixes na mesma secao.
- Nao escrever `Various improvements and bug fixes` — escreva os tres mais relevantes.
- Nao gerar PDF sem revisar o markdown primeiro.
- Nao usar emojis aleatorios — so os do template.
- Nao colocar credenciais, tokens, paths internos, hostnames de prod.

## Checklist de qualidade

Antes de entregar:

- [ ] Versao + data + manager corretos no header.
- [ ] Summary tem 1–2 paragrafos com "what + why" — nao e copia do changelog.
- [ ] Cada breaking change tem migration steps claros (numerados, com antes/depois).
- [ ] Cada security fix tem severity classificada.
- [ ] Cada feature tem PR # e autor.
- [ ] Sem mencao a credenciais, paths internos, ou contributor-only context.
- [ ] Markdown valido (preview no editor antes de commitar).
- [ ] PDF (se gerado): nenhum overflow horizontal, links clicaveis, sem fontes faltando.
- [ ] Arquivo salvo em `docs/releases/v<X.Y.Z>.md` ou local equivalente versionavel.
- [ ] Se for release publico: tambem postar via `gh release create v<X.Y.Z> --notes-file <path>`.
