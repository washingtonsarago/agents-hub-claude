"""
Diagramas do guia de fluxos orquestrados (/flow e /bug-flow).

Gera:
  01-flow-pipeline.png     cadeia GOAL -> SHIP com o gate de cada fase
  02-bug-flow-pipeline.png cadeia triage -> commit + fast path S1
  03-loop-model.png        o que acontece quando um gate reprova
  04-loopback-map.png      de onde falha -> pra onde volta
  05-precedencia.png       precedencia quando dois agents discordam

Regerar:  python3 docs/flows/render.py
"""
import os
import textwrap
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle, Polygon
from matplotlib import rcParams

rcParams['font.family'] = ['Helvetica Neue', 'Helvetica', 'Arial', 'DejaVu Sans']

OUTDIR = os.path.dirname(os.path.abspath(__file__))
DPI = 200

BG_TOP, BG_BOT = "#f6f7fb", "#e8ebf4"
INK, INK_SOFT, INK_MUTED = "#0f172a", "#475569", "#94a3b8"
LINE = "#cbd5e1"

# (fill, ink/border, accent)
COL_GOAL  = ("#eef2ff", "#3730a3", "#4f46e5")
COL_SPEC  = ("#f5f3ff", "#5b21b6", "#7c3aed")
COL_ARCH  = ("#ecfeff", "#0e7490", "#06b6d4")
COL_SEC   = ("#fef2f2", "#b91c1c", "#ef4444")
COL_BUILD = ("#ecfdf5", "#047857", "#10b981")
COL_QA    = ("#fff7ed", "#b45309", "#f59e0b")
COL_REV   = ("#fdf4ff", "#86198f", "#c026d3")
COL_SHIP  = ("#f0fdf4", "#166534", "#22c55e")
COL_NEUTRAL = ("#f8fafc", "#334155", "#64748b")


def _mix(a, b, t):
    ah, bh = a.lstrip("#"), b.lstrip("#")
    return "#%02x%02x%02x" % tuple(
        int(int(ah[i:i+2], 16) + (int(bh[i:i+2], 16) - int(ah[i:i+2], 16)) * t)
        for i in (0, 2, 4)
    )


class Canvas:
    def __init__(self, w, h):
        self.W, self.H = w, h
        self.fig, self.ax = plt.subplots(figsize=(w, h))
        self.ax.set_xlim(0, w)
        self.ax.set_ylim(0, h)
        self.ax.axis('off')
        self.fig.patch.set_facecolor(BG_TOP)
        for i in range(200):
            c = _mix(BG_TOP, BG_BOT, i / 199)
            self.ax.add_patch(Rectangle((0, h * (1 - (i + 1) / 200)), w, h / 200,
                                        facecolor=c, edgecolor='none', zorder=0))

    # ---------- primitivas ----------
    def shadow(self, x, y, w, h, off=0.06, alpha=0.10, radius=0.18):
        self.ax.add_patch(FancyBboxPatch(
            (x + off, y - off), w, h,
            boxstyle=f"round,pad=0.02,rounding_size={radius}",
            linewidth=0, facecolor="#0f172a", alpha=alpha, zorder=1))

    def panel(self, x, y, w, h, palette=COL_NEUTRAL, alpha=1.0, lw=1.0, radius=0.18):
        bg, border, accent = palette
        self.shadow(x, y, w, h, radius=radius)
        self.ax.add_patch(FancyBboxPatch(
            (x, y), w, h, boxstyle=f"round,pad=0.02,rounding_size={radius}",
            linewidth=lw, edgecolor=border, facecolor=bg, alpha=alpha, zorder=2))
        self.ax.add_patch(FancyBboxPatch(
            (x, y), 0.11, h, boxstyle="round,pad=0.0,rounding_size=0.055",
            linewidth=0, facecolor=accent, zorder=3))

    def text(self, x, y, s, size=9, color=INK, weight='normal', ha='center',
             va='center', style='normal', zorder=6, **kw):
        self.ax.text(x, y, s, fontsize=size, color=color, weight=weight,
                     ha=ha, va=va, style=style, zorder=zorder, **kw)

    def pill(self, x, y, label, color, text_color="white", size=8.2, pad=0.28,
             height=0.36, zorder=6):
        w = 0.105 * size / 8.2 * len(label) + pad * 2
        self.ax.add_patch(FancyBboxPatch(
            (x - w / 2, y - height / 2), w, height,
            boxstyle="round,pad=0.01,rounding_size=0.17",
            linewidth=0, facecolor=color, zorder=zorder))
        self.text(x, y, label, size=size, color=text_color, weight='bold', zorder=zorder + 1)
        return w

    def arrow(self, x1, y1, x2, y2, color=INK_SOFT, lw=1.6, curve=0.0, dashed=False,
              style="-|>", scale=15, zorder=5):
        self.ax.add_patch(FancyArrowPatch(
            (x1, y1), (x2, y2), arrowstyle=style, mutation_scale=scale,
            color=color, linewidth=lw, linestyle=(0, (4, 3)) if dashed else 'solid',
            connectionstyle=f"arc3,rad={curve}", zorder=zorder))

    def title(self, text, subtitle=None, accent=COL_GOAL[2]):
        self.text(self.W / 2, self.H - 0.62, text, size=26, weight='bold')
        self.ax.add_patch(Rectangle((self.W / 2 - 1.2, self.H - 1.02), 2.4, 0.045,
                                    facecolor=accent, edgecolor='none', zorder=2))
        if subtitle:
            self.text(self.W / 2, self.H - 1.38, subtitle, size=11.5,
                      color=INK_SOFT, style='italic')

    def save(self, name):
        path = os.path.join(OUTDIR, name)
        self.fig.savefig(path, dpi=DPI, bbox_inches='tight',
                         facecolor=self.fig.get_facecolor(), pad_inches=0.22)
        plt.close(self.fig)
        print("wrote", path)


def wrap(s, width):
    return "\n".join(textwrap.wrap(s, width))


# ============================================================
# 01 — pipeline do /flow
# ============================================================
def flow_pipeline():
    c = Canvas(28, 12.2)
    c.title("/flow — da métrica ao merge",
            "Sete fases, sete gates. A métrica GOAL da fase 0 é o fio que atravessa todas as outras.")

    phases = [
        ("0", "GOAL",   "/discovery", COL_GOAL,
         "Recomendação Go e métrica concreta: nome + baseline com fonte + alvo com data.",
         "No-go encerra · Learn-more pausa"),
        ("1", "DEFINE", "senior-product-owner", COL_SPEC,
         "AC testáveis, escopo fechado, sem conflito com business.md e ≥1 AC que move a métrica.",
         "Produz task.md §1–4"),
        ("2", "PLAN",   "system-architect", COL_ARCH,
         "Tarefas atômicas ordenadas, NFR não ameaça a métrica, superfície sensível marcada.",
         "ADR + consulta peer"),
        ("3", "BUILD",  "dev da stack", COL_BUILD,
         "Toda AC verificável no diff, lint e unit verdes, métrica instrumentada.",
         "branch feat/<NNN>-<nome>"),
        ("4", "VERIFY", "SDET + security", COL_QA,
         "Cada AC com teste que falha sem a mudança, métrica emite, veredicto APPROVE.",
         "BLOCK volta pro BUILD"),
        ("5", "REVIEW", "/code-review", COL_REV,
         "Nenhum BLOCKER. Reviewers em paralelo, agregados e deduplicados.",
         "NEEDS DISCUSSION → humano"),
        ("6", "SHIP",   "/smart-commit", COL_SHIP,
         "Commits criados, memória sincronizada, baseline registrado, demanda em done/.",
         "notifica peers afetados"),
    ]

    n = len(phases)
    gap = 0.62
    x0 = 0.35
    avail = c.W - 2 * x0
    w = (avail - gap * (n - 1)) / n
    y, h = 3.15, 4.5

    for i, (num, name, agent, pal, gate, foot) in enumerate(phases):
        x = x0 + i * (w + gap)
        c.panel(x, y, w, h, pal)
        cx = x + w / 2 + 0.05
        # numero da fase
        c.ax.add_patch(FancyBboxPatch((x + 0.30, y + h - 0.92), 0.62, 0.62,
                                      boxstyle="round,pad=0.01,rounding_size=0.3",
                                      linewidth=0, facecolor=pal[2], zorder=4))
        c.text(x + 0.61, y + h - 0.61, num, size=13, color="white", weight='bold')
        c.text(cx + 0.28, y + h - 0.61, name, size=15, color=pal[1], weight='bold')
        c.text(cx, y + h - 1.32, agent, size=9.5, color=INK_SOFT, style='italic')
        c.ax.add_patch(Rectangle((x + 0.35, y + h - 1.62), w - 0.7, 0.02,
                                 facecolor=LINE, edgecolor='none', zorder=4))
        c.pill(x + 0.95, y + h - 1.95, "GATE", pal[1], size=7.6, height=0.32)
        c.text(cx, y + h - 2.95, wrap(gate, 26), size=8.6, color=INK, va='center')
        c.text(cx, y + 0.42, foot, size=7.8, color=INK_MUTED, style='italic')

        if i < n - 1:
            c.arrow(x + w + 0.08, y + h / 2, x + w + gap - 0.08, y + h / 2,
                    color=INK_MUTED, lw=2.0, scale=17)

    # fase condicional 2.5
    xs = x0 + 2 * (w + gap)
    xb = x0 + 3 * (w + gap)
    sx = (xs + xb + w) / 2 - w / 2
    sy = y + h + 0.75
    c.panel(sx, sy, w, 1.75, COL_SEC)
    c.text(sx + w / 2 + 0.05, sy + 1.34, "2.5 · SEC  (condicional)", size=11.5,
           color=COL_SEC[1], weight='bold')
    c.text(sx + w / 2 + 0.05, sy + 0.98, "security-specialist", size=9, color=INK_SOFT, style='italic')
    c.text(sx + w / 2 + 0.05, sy + 0.44,
           wrap("STRIDE + controles concretos atribuídos ao BUILD. Obrigatória em trust boundary.", 32),
           size=8.4, color=INK)
    c.arrow(xs + w * 0.75, y + h + 0.05, sx + w * 0.3, sy - 0.05,
            color=COL_SEC[2], lw=1.6, dashed=True, curve=0.18)
    c.arrow(sx + w * 0.72, sy - 0.05, xb + w * 0.28, y + h + 0.05,
            color=COL_SEC[2], lw=1.6, dashed=True, curve=0.18)
    c.text((xs + xb + w) / 2, sy - 0.40, "superfície sensível marcada na fase 2",
           size=8.4, color=COL_SEC[1], style='italic', zorder=8,
           bbox=dict(boxstyle="round,pad=0.26", facecolor="#f4f6fb", edgecolor='none'))

    # faixa da metrica GOAL
    by, bh = 1.28, 1.15
    c.panel(x0, by, c.W - 2 * x0, bh, ("#ffffff", "#334155", COL_GOAL[2]))
    c.text(x0 + 0.55, by + bh / 2, "MÉTRICA GOAL", size=10.5, color=COL_GOAL[1],
           weight='bold', ha='left')
    c.text(x0 + 3.6, by + bh / 2,
           "carregada da fase 0 até a 6 — toda fase referencia; fase que não consegue se amarrar nela é sinal de re-scope",
           size=10, color=INK_SOFT, ha='left', style='italic')
    for i in range(n):
        cx = x0 + i * (w + gap) + w / 2
        c.ax.add_patch(Rectangle((cx - 0.02, by + bh), 0.04, y - by - bh,
                                 facecolor=COL_GOAL[2], alpha=0.32, edgecolor='none', zorder=1))

    c.text(c.W / 2, 0.55,
           "gate verde → próxima fase   ·   gate vermelho → volta pra fase que produziu o defeito, nunca automático",
           size=9.5, color=INK_MUTED)
    c.save("01-flow-pipeline.png")


# ============================================================
# 02 — pipeline do /bug-flow
# ============================================================
def bug_pipeline():
    c = Canvas(26, 12.3)
    c.title("/bug-flow — do report ao fix com teste de regressão",
            "Toda fix sai com um teste que falha antes e passa depois. Sem exceção.",
            accent=COL_SEC[2])

    row1 = [
        ("1", "Triage", "orquestrador", COL_NEUTRAL,
         "Repro documentado (ou marcado não-reproduzível) e superfície suspeita nomeada."),
        ("2", "RCA", "dev da stack", COL_ARCH,
         "Causa raiz específica: arquivo:linha + o passo em falso. “Problema de concorrência” reprova."),
        ("3", "Severidade", "orquestrador", COL_QA,
         "S1–S4 + check de superfície sensível, que torna a fase 6 obrigatória."),
        ("4", "Fix", "mesmo dev da fase 2", COL_BUILD,
         "Ataca a causa, teste de regressão fica vermelho ao reverter o fix, zero refactor de carona."),
        ("5", "QA", "SDET / cypress", COL_QA,
         "Tudo verde e o teste novo está na suíte padrão; classe de entrada subtestada coberta."),
    ]
    row2 = [
        ("6", "Security", "security-specialist", COL_SEC,
         "Só se a fase 3 marcou. APPROVE ou APPROVE WITH MITIGATIONS. BLOCK volta pra fase 4."),
        ("7", "Review", "/code-review", COL_REV,
         "Sem BLOCKERs. Em S1, abreviado a BLOCKERs apenas."),
        ("8", "Memory sync", "project-memory-keeper", COL_SPEC,
         "Classe nova de bug vira anti-padrão em guidelines.md, com link pro teste."),
        ("9", "Commit", "/smart-commit", COL_SHIP,
         "fix: + move docs/todo/ → docs/done/. S1 também: CHANGELOG e aviso no on-call."),
    ]

    gap, x0 = 0.55, 0.35
    w = (c.W - 2 * x0 - gap * 4) / 5
    h = 3.05
    yA, yB = 5.35, 1.35

    def draw_row(items, yy, start_x):
        for i, (num, name, agent, pal, gate) in enumerate(items):
            x = start_x + i * (w + gap)
            c.panel(x, yy, w, h, pal)
            cx = x + w / 2 + 0.05
            c.ax.add_patch(FancyBboxPatch((x + 0.28, yy + h - 0.82), 0.56, 0.56,
                                          boxstyle="round,pad=0.01,rounding_size=0.28",
                                          linewidth=0, facecolor=pal[2], zorder=4))
            c.text(x + 0.56, yy + h - 0.54, num, size=12, color="white", weight='bold')
            c.text(cx + 0.24, yy + h - 0.54, name, size=13, color=pal[1], weight='bold')
            c.text(cx, yy + h - 1.14, agent, size=8.8, color=INK_SOFT, style='italic')
            c.ax.add_patch(Rectangle((x + 0.32, yy + h - 1.42), w - 0.64, 0.02,
                                     facecolor=LINE, edgecolor='none', zorder=4))
            c.pill(x + 0.88, yy + h - 1.72, "GATE", pal[1], size=7.2, height=0.30)
            c.text(cx, yy + 0.78, wrap(gate, 30), size=8.4, color=INK)
            if i < len(items) - 1:
                c.arrow(x + w + 0.06, yy + h / 2, x + w + gap - 0.06, yy + h / 2,
                        color=INK_MUTED, lw=2.0, scale=17)

    draw_row(row1, yA, x0)
    draw_row(row2, yB, x0)

    # quebra de linha da cadeia (5 -> 6): cotovelo pela faixa entre as duas linhas
    x5 = x0 + 4 * (w + gap) + w / 2
    x6 = x0 + w / 2
    lane = (yA + yB + h) / 2
    c.arrow(x5, yA - 0.06, x5, lane, color=INK_MUTED, lw=1.9, style='-', scale=1)
    c.arrow(x5, lane, x6, lane, color=INK_MUTED, lw=1.9, style='-', scale=1)
    c.arrow(x6, lane, x6, yB + h + 0.06, color=INK_MUTED, lw=1.9, scale=16)
    c.text(c.W / 2, lane + 0.28, "fase 5 → fase 6", size=9, color=INK_MUTED, style='italic',
           bbox=dict(boxstyle="round,pad=0.22", facecolor="#f2f4f9", edgecolor='none'))

    # fast path S1
    fp_y = yA + h + 0.62
    c.panel(x0, fp_y, c.W - 2 * x0, 1.15, ("#fff1f2", "#9f1239", "#e11d48"))
    c.text(x0 + 0.55, fp_y + 0.58, "FAST PATH S1", size=10.5, color="#9f1239",
           weight='bold', ha='left')
    c.text(x0 + 3.2, fp_y + 0.58,
           "1 → 2 → 4 → 5 → (6 se aplicável) → 7 → 9        ·   a fase 3 é implícita (declarar S1 já classificou)   "
           "·   a fase 8 roda em até 24h pós-merge, sem bloquear o fix",
           size=10, color=INK_SOFT, ha='left', style='italic')

    c.text(c.W / 2, 0.52,
           "severidades:  S1 prod fora / dados / segurança / dinheiro   ·   S2 fluxo core sem workaround   "
           "·   S3 não-core com workaround   ·   S4 cosmético",
           size=9.5, color=INK_MUTED)
    c.save("02-bug-flow-pipeline.png")


# ============================================================
# 03 — modelo de loop
# ============================================================
def loop_model():
    c = Canvas(20.5, 13.4)
    c.title("O que acontece quando um gate reprova",
            "Nenhum loop é automático: o orquestrador para, propõe o menor caminho pro verde e pede confirmação.",
            accent=COL_QA[2])

    # losango do gate
    gx, gy = 3.3, 6.35
    dw, dh = 2.4, 1.45
    c.ax.add_patch(Polygon([[gx, gy + dh], [gx + dw, gy], [gx, gy - dh], [gx - dw, gy]],
                           closed=True, facecolor="#ffffff", edgecolor="#334155",
                           linewidth=1.6, zorder=3))
    c.text(gx, gy + 0.22, "GATE", size=15, weight='bold', color=INK)
    c.text(gx, gy - 0.35, "da fase N", size=9.5, color=INK_SOFT, style='italic')

    outcomes = [
        ("verde", COL_SHIP, "Avança",
         "Fase N+1 começa. O artefato entra como entrada da próxima fase."),
        ("artefato incompleto", COL_QA, "Mesma fase reexecuta",
         "AC não testável, RCA vaga, teste que não falha sem o fix. Ninguém discordou — a fase só não entregou o que o gate pede."),
        ("defeito nasceu antes", COL_ARCH, "Volta pra fase que produziu",
         "Security dá BLOCK no VERIFY porque o design da fase 2 é inseguro → volta pra 2, não pra 3. Depois refaz só os gates afetados."),
        ("agents se contradizem", COL_REV, "NEEDS DISCUSSION",
         "Dois reviewers competentes em posições opostas no mesmo ponto. O orquestrador registra os dois lados e para. Humano decide."),
        ("2ª volta no mesmo gate", COL_SEC, "Escala ou re-escopa",
         "A terceira tentativa quase nunca é o problema — ele costuma estar uma fase acima. Convenção, não regra do command."),
    ]

    bx, bw, bh = 7.6, 12.3, 1.62
    step = 2.24
    top_y = c.H - 2.05 - bh
    vx, vy = gx + dw, gy  # vertice direito do losango
    for i, (label, pal, titulo, corpo) in enumerate(outcomes):
        by = top_y - i * step
        cy = by + bh / 2
        c.panel(bx, by, bw, bh, pal)
        c.text(bx + 0.45, by + bh - 0.48, titulo, size=12.5, color=pal[1],
               weight='bold', ha='left')
        c.text(bx + 0.45, by + 0.52, wrap(corpo, 92), size=8.9, color=INK, ha='left', va='center')
        c.arrow(vx + 0.06, vy, bx - 0.14, cy, color=pal[2], lw=1.7,
                curve=-0.16 if cy > vy else 0.16)
        c.pill(bx + 1.55, by + bh + 0.33, label, pal[2], size=7.8, height=0.36)

    c.text(c.W / 2, 0.5,
           "regra do loop-back: volte para quem PRODUZIU o defeito, não para a fase imediatamente anterior",
           size=10.5, color=INK_SOFT, style='italic')
    c.save("03-loop-model.png")


# ============================================================
# 04 — mapa de retorno
# ============================================================
def loopback_map():
    c = Canvas(24, 10.6)
    c.title("Mapa de retorno — de onde falha, pra onde volta",
            "As setas de baixo são reexecução da própria fase; as de cima, retorno pra fase que produziu o defeito.",
            accent=COL_ARCH[2])

    phases = [("0", "GOAL", COL_GOAL), ("1", "DEFINE", COL_SPEC), ("2", "PLAN", COL_ARCH),
              ("2.5", "SEC", COL_SEC), ("3", "BUILD", COL_BUILD), ("4", "VERIFY", COL_QA),
              ("5", "REVIEW", COL_REV), ("6", "SHIP", COL_SHIP)]
    n = len(phases)
    gap, x0 = 0.55, 0.5
    w = (c.W - 2 * x0 - gap * (n - 1)) / n
    y, h = 4.6, 1.5
    cxs = []
    for i, (num, name, pal) in enumerate(phases):
        x = x0 + i * (w + gap)
        cxs.append(x + w / 2)
        c.panel(x, y, w, h, pal)
        c.text(x + w / 2 + 0.05, y + h - 0.52, f"{num} · {name}", size=12,
               color=pal[1], weight='bold')
        c.text(x + w / 2 + 0.05, y + 0.42, "gate", size=8.4, color=INK_MUTED, style='italic')
        if i < n - 1:
            c.arrow(x + w + 0.06, y + h / 2, x + w + gap - 0.06, y + h / 2,
                    color=INK_MUTED, lw=1.8, scale=15)

    # retornos (origem, destino, label, altura, cor)
    returns = [
        (5, 4, "BLOCK de segurança ·\nBLOCKER de review", 1.05, COL_SEC[2]),
        (5, 2, "fix exige mudança\nestrutural → SEC revalida", 2.35, COL_ARCH[1]),
        (6, 4, "BLOCKER\nde review", 1.72, COL_REV[2]),
        (2, 1, "NFR ameaça\na métrica", 1.05, COL_SPEC[2]),
        (1, 0, "métrica errada,\nnão o escopo", 3.05, COL_GOAL[2]),
        (3, 2, "controle exige\nmudança de design", 1.05, COL_SEC[1]),
    ]
    for src, dst, label, lift, color in returns:
        xs, xd = cxs[src], cxs[dst]
        top = y + h
        c.ax.add_patch(FancyArrowPatch(
            (xs, top + 0.05), (xd, top + 0.05), arrowstyle="-|>", mutation_scale=15,
            color=color, linewidth=1.7,
            connectionstyle=f"arc3,rad={0.10 + lift * 0.055}", zorder=5))
        c.text((xs + xd) / 2, top + lift * 0.52 + 0.42, label, size=8.4, color=color,
               ha='center', va='center', style='italic', zorder=7,
               bbox=dict(boxstyle="round,pad=0.24", facecolor="#ffffff",
                         edgecolor=color, alpha=0.95, linewidth=0.8))

    selfloops = [
        (1, "AC não testável\nou escopo aberto"),
        (2, "tarefas não\natômicas"),
        (4, "lint/unit vermelho\nAC invisível no diff"),
        (5, "teste passa\nsem a mudança"),
    ]
    for idx, label in selfloops:
        x = cxs[idx]
        c.arrow(x - 0.34, y - 0.05, x + 0.34, y - 0.05,
                color=INK_MUTED, lw=1.5, curve=1.7, scale=12)
        c.text(x, y - 1.28, label, size=8.2, color=INK_SOFT, ha='center', va='center',
               style='italic',
               bbox=dict(boxstyle="round,pad=0.22", facecolor="#ffffff",
                         edgecolor=LINE, alpha=0.95, linewidth=0.8))

    box_y = 0.55
    c.panel(0.5, box_y, c.W - 1.0, 1.5, ("#ffffff", "#334155", INK_MUTED))
    c.text(1.0, box_y + 1.08,
           "Ler assim:  o gate que reprovou não decide pra onde volta — quem decide é onde o defeito NASCEU.",
           size=10.5, color=INK, weight='bold', ha='left')
    c.text(1.0, box_y + 0.48,
           "Um BLOCK no VERIFY por controle ausente volta pro BUILD.  O mesmo BLOCK por um modelo de dados que expõe PII "
           "por construção volta pro PLAN — e obriga a 2.5 a revalidar.  Patch em cima de design errado continua errado.",
           size=9.4, color=INK_SOFT, ha='left')
    c.save("04-loopback-map.png")


# ============================================================
# 05 — precedencia
# ============================================================
def precedencia():
    c = Canvas(19, 13.0)
    c.title("Precedência quando dois agents discordam",
            "Da regra mais forte para a mais fraca. O orquestrador nunca escolhe lado sozinho.",
            accent=COL_SEC[2])

    rules = [
        ("1", "Security BLOCK para tudo", COL_SEC,
         "Não é negociável por outro agent. A cadeia só reentra depois do finding tratado."),
        ("2", "BLOCKER de review é corrigido antes do merge", COL_REV,
         "Sem exceção. WARNING e INFO não seguram o gate; BLOCKER sim."),
        ("3", "Convenção do projeto > best practice genérica", COL_ARCH,
         "Padrão que o codebase usa consistentemente não é achado, venha de qual specialist vier. guidelines.md é o árbitro."),
        ("4", "Evidência > inferência", COL_BUILD,
         "Peer citando arquivo:linha num ref ancorado ganha do arquiteto que infere. Sem ref e sha, é resposta sobre working tree — pergunte de novo."),
        ("5", "Contradição real que evidência não resolve → humano", COL_GOAL,
         "O orquestrador registra os dois lados em NEEDS DISCUSSION e para. Você decide, e só então define o retorno."),
    ]

    x, w = 0.6, c.W - 1.2
    h, gap = 1.52, 0.38
    top = 9.35
    for i, (num, titulo, pal, corpo) in enumerate(rules):
        yy = top - i * (h + gap)
        inset = i * 0.30
        c.panel(x + inset, yy, w - inset * 2, h, pal)
        c.ax.add_patch(FancyBboxPatch((x + inset + 0.32, yy + h - 0.92), 0.62, 0.62,
                                      boxstyle="round,pad=0.01,rounding_size=0.3",
                                      linewidth=0, facecolor=pal[2], zorder=4))
        c.text(x + inset + 0.63, yy + h - 0.61, num, size=13, color="white", weight='bold')
        c.text(x + inset + 1.18, yy + h - 0.58, titulo, size=12.5, color=pal[1],
               weight='bold', ha='left')
        c.text(x + inset + 1.18, yy + 0.44, wrap(corpo, 108), size=9, color=INK,
               ha='left', va='center')

    c.panel(0.6, 0.5, c.W - 1.2, 1.15, ("#ffffff", "#334155", INK_MUTED))
    c.text(c.W / 2, 1.28, "Peer session nunca é dono de gate", size=11, weight='bold', color=INK)
    c.text(c.W / 2, 0.82,
           "Peer informa o gate, nunca o segura. Sem resposta → “não respondido” e a cadeia segue. "
           "E nunca peça a um peer o que esta sessão teve negado.",
           size=9.4, color=INK_SOFT)
    c.save("05-precedencia.png")


if __name__ == "__main__":
    flow_pipeline()
    bug_pipeline()
    loop_model()
    loopback_map()
    precedencia()
