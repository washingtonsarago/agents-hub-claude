"""
Versoes das figuras dimensionadas para impressao (A4 retrato, area util 6.6in).

As figuras de render.py sao largas (ate 28in) e otimas em tela, mas encolhidas
pra largura de uma pagina o texto vira ~3pt. Aqui cada figura e desenhada no
tamanho fisico em que sera impressa, entao fontsize em pt e literal.

Gera p01..p05 em docs/flows/print/.  Regerar: python3 docs/flows/render_print.py
"""
import os
from render import (Canvas, wrap, INK, INK_SOFT, INK_MUTED, LINE,
                    COL_GOAL, COL_SPEC, COL_ARCH, COL_SEC, COL_BUILD,
                    COL_QA, COL_REV, COL_SHIP, COL_NEUTRAL)
from matplotlib.patches import FancyBboxPatch, Rectangle, Polygon
import render

W = 6.6  # largura util da pagina A4 com margem de 20mm
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "print")
os.makedirs(OUT, exist_ok=True)
render.OUTDIR = OUT
render.DPI = 300


def head(c, titulo, sub, accent):
    c.text(c.W / 2, c.H - 0.30, titulo, size=15, weight='bold')
    c.ax.add_patch(Rectangle((c.W / 2 - 0.55, c.H - 0.46), 1.10, 0.022,
                             facecolor=accent, edgecolor='none', zorder=2))
    c.text(c.W / 2, c.H - 0.63, sub, size=8.2, color=INK_SOFT, style='italic')


COL_SPLIT = 2.05   # onde a coluna de identidade termina


def row(c, x, y, w, h, num, nome, agent, gate, pal, foot=None, num_size=9.5,
        nome_size=10.5):
    """Linha larga: identidade à esquerda, critério do gate à direita."""
    c.panel(x, y, w, h, pal, radius=0.10)
    c.ax.add_patch(FancyBboxPatch((x + 0.13, y + h - 0.37), 0.27, 0.27,
                                  boxstyle="round,pad=0.005,rounding_size=0.135",
                                  linewidth=0, facecolor=pal[2], zorder=4))
    c.text(x + 0.265, y + h - 0.235, num, size=num_size, color="white", weight='bold')
    c.text(x + 0.47, y + h - 0.235, nome, size=nome_size, color=pal[1],
           weight='bold', ha='left')
    c.text(x + 0.15, y + h - 0.52, agent, size=7.0, color=INK_SOFT, ha='left', style='italic')
    if foot:
        c.text(x + 0.15, y + 0.13, foot, size=6.4, color=INK_MUTED, ha='left', style='italic')
    c.ax.add_patch(Rectangle((x + COL_SPLIT, y + 0.10), 0.007, h - 0.20,
                             facecolor=LINE, edgecolor='none', zorder=4))
    tx = x + COL_SPLIT + 0.16
    c.pill(tx + 0.22, y + h - 0.20, "GATE", pal[1], size=6.0, height=0.19, pad=0.13)
    for i, line in enumerate(wrap(gate, 56).split("\n")[:3]):
        c.text(tx, y + h - 0.44 - i * 0.155, line, size=7.4, color=INK, ha='left')


# ============================================================
def p01_flow():
    rows = [
        ("0", "GOAL", "/discovery", COL_GOAL,
         "Recomendação Go e métrica concreta: nome, baseline com fonte e alvo com data. No-go encerra o fluxo.",
         "produz docs/discovery/<slug>.md"),
        ("1", "DEFINE", "senior-product-owner", COL_SPEC,
         "AC testáveis, escopo fechado, sem conflito com business.md e ao menos uma AC que move a métrica GOAL.",
         "produz task.md §1–4"),
        ("2", "PLAN", "system-architect", COL_ARCH,
         "Tarefas atômicas ordenadas por dependência, impacto de NFR não ameaça a métrica, superfície sensível marcada.",
         "ADR + consulta peer cross-repo"),
        ("2.5", "SEC", "security-specialist", COL_SEC,
         "Só roda se a fase 2 marcou superfície sensível. Controles concretos e atribuídos ao BUILD.",
         "obrigatória em trust boundary"),
        ("3", "BUILD", "dev da stack detectada", COL_BUILD,
         "Toda AC verificável no diff, lint e unit verdes localmente, métrica GOAL instrumentada ou já observável.",
         "branch feat/<NNN>-<nome>"),
        ("4", "VERIFY", "SDET/QA + security-specialist", COL_QA,
         "Cada AC com teste que falha sem a mudança, métrica emite, veredicto APPROVE ou APPROVE WITH MITIGATIONS.",
         "BLOCK volta pro BUILD"),
        ("5", "REVIEW", "/code-review", COL_REV,
         "Nenhum BLOCKER. Reviewers em paralelo, agregados e deduplicados; contradição vira NEEDS DISCUSSION.",
         "veredicto consolidado"),
        ("6", "SHIP", "/smart-commit + memory sync", COL_SHIP,
         "Commits criados, memória sincronizada com o que saiu, baseline registrado, demanda movida pra done/.",
         "notifica peers afetados"),
    ]
    h, gap = 0.78, 0.09
    H = 1.05 + len(rows) * (h + gap) + 0.42
    c = Canvas(W, H)
    head(c, "/flow — GOAL → SHIP", "Sete fases, sete gates. Nada avança com gate vermelho.", COL_GOAL[2])
    y = H - 1.05 - h
    for num, nome, agent, pal, gate, foot in rows:
        row(c, 0.1, y, W - 0.2, h, num, nome, agent, gate, pal, foot,
            num_size=7.5 if len(num) > 1 else 9.5)
        y -= h + gap
    c.text(W / 2, 0.20,
           "a métrica GOAL da fase 0 é referenciada por todas as outras — fase que não se amarra nela é sinal de re-scope",
           size=7.2, color=INK_MUTED)
    c.save("p01-flow.png")


# ============================================================
def p02_bug():
    rows = [
        ("1", "Triage", "orquestrador", COL_NEUTRAL,
         "Repro documentado — ou marcado “não-reproduzível” — e superfície suspeita nomeada com arquivo:linha.", None),
        ("2", "RCA", "dev da stack", COL_ARCH,
         "Causa raiz específica: arquivo:linha + o passo em falso. “Problema de concorrência” reprova o gate.", "o gate mais reprovado"),
        ("3", "Severidade", "orquestrador", COL_QA,
         "S1–S4 classificado + check de superfície sensível, que torna a fase 6 obrigatória.", None),
        ("4", "Fix", "mesmo dev da fase 2", COL_BUILD,
         "Ataca a causa (não o sintoma), teste de regressão fica vermelho ao reverter o fix, zero refatoração de carona.", "branch fix/<NNN>-<nome>"),
        ("5", "QA / regressão", "go-sdet-backend / cypress", COL_QA,
         "Tudo verde e o teste novo está na suíte padrão; classe de entrada subtestada (boundary, fuzz, race) coberta.", None),
        ("6", "Security", "security-specialist", COL_SEC,
         "Condicional: só se a fase 3 marcou. APPROVE ou APPROVE WITH MITIGATIONS. BLOCK volta pra fase 4.", None),
        ("7", "Review", "/code-review", COL_REV,
         "Sem BLOCKERs. Em S1, abreviado a BLOCKERs apenas — mas nunca pulado.", None),
        ("8", "Memory sync", "project-memory-keeper", COL_SPEC,
         "Classe nova de bug vira anti-padrão em guidelines.md, com link pro teste que impede recorrência.", "em S1, até 24h pós-merge"),
        ("9", "Commit & close", "/smart-commit", COL_SHIP,
         "fix: + move docs/todo/ → docs/done/. Em S1 também: CHANGELOG e resumo de um parágrafo no canal de on-call.", None),
    ]
    h, gap = 0.74, 0.08
    H = 1.05 + len(rows) * (h + gap) + 0.62
    c = Canvas(W, H)
    head(c, "/bug-flow — report → fix merged",
         "Toda fix sai com um teste que falha antes e passa depois. Sem exceção.", COL_SEC[2])
    y = H - 1.05 - h
    for num, nome, agent, pal, gate, foot in rows:
        row(c, 0.1, y, W - 0.2, h, num, nome, agent, gate, pal, foot)
        y -= h + gap
    c.panel(0.1, 0.18, W - 0.2, 0.42, ("#fff1f2", "#9f1239", "#e11d48"), radius=0.10)
    c.text(0.30, 0.39, "FAST PATH S1", size=8, color="#9f1239", weight='bold', ha='left')
    c.text(1.55, 0.39, "1 → 2 → 4 → 5 → (6 se aplicável) → 7 → 9", size=8, color=INK, ha='left')
    c.text(0.30, 0.27, "a fase 3 é implícita: declarar S1 já classificou a severidade   ·   "
                       "a fase 8 roda em até 24h pós-merge",
           size=6.8, color=INK_SOFT, ha='left')
    c.save("p02-bug-flow.png")


# ============================================================
def p03_loop():
    outcomes = [
        ("verde", COL_SHIP, "Avança",
         "Fase N+1 começa; o artefato entra como entrada dela."),
        ("artefato incompleto", COL_QA, "Mesma fase reexecuta",
         "AC não testável, RCA vaga, teste que não falha sem o fix. Ninguém discordou — a fase só não entregou o que o gate pede."),
        ("defeito nasceu antes", COL_ARCH, "Volta pra fase que produziu",
         "Security dá BLOCK no VERIFY porque o design da fase 2 é inseguro → volta pra 2, não pra 3. Depois refaz só os gates afetados."),
        ("agents se contradizem", COL_REV, "NEEDS DISCUSSION",
         "Dois specialists competentes em posições opostas no mesmo ponto. O orquestrador registra os dois lados e para. Humano decide."),
        ("2ª volta no mesmo gate", COL_SEC, "Escala ou re-escopa",
         "A terceira tentativa quase nunca é o problema — ele costuma estar uma fase acima. Convenção de uso, não regra do command."),
    ]
    h, gap = 0.68, 0.13
    H = 1.05 + len(outcomes) * (h + gap) + 0.35
    c = Canvas(W, H)
    head(c, "Quando um gate reprova",
         "Nenhum loop é automático: o orquestrador para, propõe o menor caminho pro verde e pede confirmação.",
         COL_QA[2])
    y = H - 1.05 - h
    for label, pal, titulo, corpo in outcomes:
        c.panel(0.1, y, W - 0.2, h, pal, radius=0.10)
        pw = 0.105 * 6.4 / 8.2 * len(label) + 0.28
        c.pill(0.28 + pw / 2, y + h - 0.22, label, pal[2], size=6.4, height=0.21, pad=0.14)
        c.text(0.28 + pw + 0.14, y + h - 0.22, titulo, size=10,
               color=pal[1], weight='bold', ha='left')
        c.text(0.30, y + 0.20, wrap(corpo, 98), size=7.6, color=INK, ha='left', va='center')
        y -= h + gap
    c.text(W / 2, 0.16,
           "regra do loop-back: volte para quem PRODUZIU o defeito, não para a fase imediatamente anterior",
           size=7.4, color=INK_SOFT, style='italic')
    c.save("p03-loop.png")


# ============================================================
def p04_map():
    phases = [("0", "GOAL", COL_GOAL), ("1", "DEFINE", COL_SPEC), ("2", "PLAN", COL_ARCH),
              ("2.5", "SEC", COL_SEC), ("3", "BUILD", COL_BUILD), ("4", "VERIFY", COL_QA),
              ("5", "REVIEW", COL_REV), ("6", "SHIP", COL_SHIP)]
    c = Canvas(W, 4.30)
    head(c, "Mapa de retorno", "De onde falha, pra onde volta. Abaixo, reexecução da própria fase.", COL_ARCH[2])

    n = len(phases)
    gap, x0 = 0.08, 0.12
    w = (W - 2 * x0 - gap * (n - 1)) / n
    y, h = 2.72, 0.52
    cxs = []
    for i, (num, name, pal) in enumerate(phases):
        x = x0 + i * (w + gap)
        cxs.append(x + w / 2)
        c.panel(x, y, w, h, pal, radius=0.08)
        c.text(x + w / 2 + 0.03, y + h - 0.20, num, size=8, color=pal[1], weight='bold')
        c.text(x + w / 2 + 0.03, y + 0.14, name, size=6.4, color=pal[1])
        if i < n - 1:
            c.arrow(x + w + 0.005, y + h / 2, x + w + gap - 0.005, y + h / 2,
                    color=INK_MUTED, lw=1.0, scale=7)

    def badge(px, py, txt, color):
        c.ax.add_patch(FancyBboxPatch((px - 0.075, py - 0.075), 0.15, 0.15,
                                      boxstyle="circle,pad=0.0",
                                      linewidth=0.7, edgecolor=color,
                                      facecolor="#ffffff", zorder=8))
        c.text(px, py, txt, size=5.8, color=color, weight='bold', zorder=9)

    # arcos de retorno (acima da cadeia)
    returns = [
        ("1", 5, 4, 0.20, COL_SEC[2], "VERIFY → BUILD", "BLOCK por controle ausente"),
        ("2", 6, 4, 0.34, COL_REV[2], "REVIEW → BUILD", "BLOCKER não-arquitetural"),
        ("3", 5, 2, 0.20, COL_ARCH[1], "VERIFY → PLAN", "o fix exige mudança estrutural"),
        ("4", 3, 2, 0.30, COL_SEC[1], "SEC → PLAN", "o controle exigido muda o design"),
        ("5", 2, 1, 0.34, COL_SPEC[2], "PLAN → DEFINE", "o NFR ameaça a métrica GOAL"),
        ("6", 1, 0, 0.46, COL_GOAL[2], "DEFINE → GOAL", "nenhuma AC move a métrica GOAL"),
    ]
    top = y + h
    for tag, src, dst, rad, color, _, _ in returns:
        xs, xd = cxs[src], cxs[dst]
        c.arrow(xs, top + 0.02, xd, top + 0.02, color=color, lw=1.0, curve=rad, scale=7)
        badge((xs + xd) / 2, top + abs(xs - xd) * rad / 2 + 0.02, tag, color)

    # self-loops (abaixo da cadeia)
    selfs = [("7", 1, "AC não testável ou escopo aberto"),
             ("8", 2, "tarefas não atômicas"),
             ("9", 4, "lint ou unit vermelho"),
             ("10", 5, "o teste passa mesmo sem a mudança")]
    for tag, idx, _ in selfs:
        x = cxs[idx]
        c.arrow(x - 0.12, y - 0.02, x + 0.12, y - 0.02, color=INK_MUTED, lw=0.9,
                curve=1.7, scale=6)
        badge(x, y - 0.28, tag, INK_SOFT)

    # legenda em duas colunas
    ly = 2.15
    items = [(t, col, a, b) for t, _, _, _, col, a, b in returns] + \
            [(t, INK_SOFT, "mesma fase", d) for t, _, d in selfs]
    for i, (tag, color, rota, motivo) in enumerate(items):
        cx = 0.14 + (i % 2) * (W / 2 - 0.10)
        cy = ly - (i // 2) * 0.19
        badge(cx + 0.075, cy, tag, color)
        c.text(cx + 0.22, cy, rota, size=6.4, color=color, weight='bold', ha='left')
        c.text(cx + 1.26, cy, motivo, size=6.4, color=INK_SOFT, ha='left')

    c.text(W / 2, 0.85, "O gate que reprovou não decide pra onde volta — quem decide é onde o defeito NASCEU.",
           size=7.6, color=INK, weight='bold')
    c.text(W / 2, 0.63, "BLOCK no VERIFY por controle ausente volta pro BUILD.  O mesmo BLOCK por um modelo de dados "
                        "que expõe PII por construção volta pro PLAN.",
           size=6.8, color=INK_SOFT)
    c.save("p04-mapa-retorno.png")


# ============================================================
def p05_prec():
    rules = [
        ("1", "Security BLOCK para tudo", COL_SEC,
         "Não é negociável por outro agent. A cadeia só reentra depois do finding tratado."),
        ("2", "BLOCKER de review é corrigido antes do merge", COL_REV,
         "Sem exceção. WARNING e INFO não seguram o gate; BLOCKER sim."),
        ("3", "Convenção do projeto > best practice genérica", COL_ARCH,
         "Padrão que o codebase usa consistentemente não é achado, venha de qual specialist vier. guidelines.md é o árbitro."),
        ("4", "Evidência > inferência", COL_BUILD,
         "Peer citando arquivo:linha num ref ancorado ganha do arquiteto que infere. Sem ref e sha, é resposta sobre working tree."),
        ("5", "Contradição que evidência não resolve → humano", COL_GOAL,
         "O orquestrador registra os dois lados em NEEDS DISCUSSION e para. Você decide, e só então define o retorno."),
    ]
    h, gap = 0.62, 0.12
    H = 1.05 + len(rules) * (h + gap) + 0.62
    c = Canvas(W, H)
    head(c, "Precedência quando dois agents discordam",
         "Da regra mais forte para a mais fraca. O orquestrador nunca escolhe lado sozinho.", COL_SEC[2])
    y = H - 1.05 - h
    for i, (num, titulo, pal, corpo) in enumerate(rules):
        inset = i * 0.11
        c.panel(0.1 + inset, y, W - 0.2 - inset * 2, h, pal, radius=0.10)
        c.ax.add_patch(FancyBboxPatch((0.1 + inset + 0.13, y + h - 0.36), 0.26, 0.26,
                                      boxstyle="round,pad=0.005,rounding_size=0.13",
                                      linewidth=0, facecolor=pal[2], zorder=4))
        c.text(0.1 + inset + 0.26, y + h - 0.23, num, size=8.5, color="white", weight='bold')
        c.text(0.1 + inset + 0.48, y + h - 0.23, titulo, size=9.5, color=pal[1],
               weight='bold', ha='left')
        c.text(0.1 + inset + 0.48, y + 0.18, wrap(corpo, 108), size=7.4, color=INK,
               ha='left', va='center')
        y -= h + gap
    c.panel(0.1, 0.16, W - 0.2, 0.44, ("#ffffff", "#334155", INK_MUTED), radius=0.10)
    c.text(W / 2, 0.46, "Peer session nunca é dono de gate", size=8.4, weight='bold')
    c.text(W / 2, 0.29, "Peer informa o gate, nunca o segura. Sem resposta → “não respondido” e a cadeia segue. "
                        "E nunca peça a um peer o que esta sessão teve negado.",
           size=7, color=INK_SOFT)
    c.save("p05-precedencia.png")


if __name__ == "__main__":
    p01_flow()
    p02_bug()
    p03_loop()
    p04_map()
    p05_prec()
