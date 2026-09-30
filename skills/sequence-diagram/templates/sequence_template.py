"""
Template polido de diagrama de sequencia.

Como usar:
1. Copie este arquivo para /tmp/<nome>.py
2. Substitua PARTICIPANTS, MESSAGES e (se houver) BLOCKS pelos dados reais
3. Ajuste WIDTH/HEIGHT se precisar de mais participantes ou mensagens
4. Ajuste OUT no final
5. Execute: python3 /tmp/<nome>.py

Mantenha intactos: helpers (participant_box / lifeline / message / block / note),
paleta, gradiente. Estilo casa com a skill architecture-diagram.
"""
import os
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle
from matplotlib import rcParams

rcParams['font.family'] = ['Helvetica Neue', 'Helvetica', 'Arial', 'DejaVu Sans']

# ============================================================
#  CONFIGURACAO
# ============================================================
WIDTH, HEIGHT = 20, 13
DPI = 200
THEME = "light"   # "light" | "dark"
OUT = "/tmp/sequence.png"

# ============================================================
#  PALETA  (mesma da architecture-diagram)
# ============================================================
if THEME == "dark":
    BG_TOP, BG_BOT = "#1a1b26", "#1a1b26"
    INK, INK_SOFT, INK_MUTED = "#c0caf5", "#9aa5ce", "#7782a8"
    LINE = "#414868"
else:
    BG_TOP, BG_BOT = "#f4f6fb", "#e6eaf3"
    INK, INK_SOFT, INK_MUTED = "#0f172a", "#475569", "#94a3b8"
    LINE = "#cbd5e1"

# (fundo, borda, acento) por papel
COL_CLIENT = ("#eef2ff", "#3730a3", "#4338ca")
COL_EDGE   = ("#ecfeff", "#0e7490", "#0891b2")
COL_APP    = ("#eef2ff", "#4338ca", "#6366f1")
COL_SVC    = ("#ecfdf5", "#047857", "#10b981")
COL_WORKER = ("#fdf4ff", "#86198f", "#a21caf")
COL_DATA   = ("#fef2f2", "#b91c1c", "#dc2626")
COL_EXT    = ("#f1f5f9", "#334155", "#475569")
COL_NOTE   = ("#fffbeb", "#b45309", "#d97706")

ROLE = {
    "client": COL_CLIENT, "edge": COL_EDGE, "app": COL_APP,
    "service": COL_SVC, "worker": COL_WORKER, "db": COL_DATA, "ext": COL_EXT,
}

# ============================================================
#  CANVAS + FUNDO
# ============================================================
fig, ax = plt.subplots(figsize=(WIDTH, HEIGHT))
ax.set_xlim(0, WIDTH); ax.set_ylim(0, HEIGHT); ax.axis('off')
fig.patch.set_facecolor(BG_TOP); ax.set_facecolor(BG_TOP)

def _mix(a, b, t):
    ah = a.lstrip("#"); bh = b.lstrip("#")
    return "#%02x%02x%02x" % (
        int(int(ah[0:2],16) + (int(bh[0:2],16) - int(ah[0:2],16)) * t),
        int(int(ah[2:4],16) + (int(bh[2:4],16) - int(ah[2:4],16)) * t),
        int(int(ah[4:6],16) + (int(bh[4:6],16) - int(ah[4:6],16)) * t),
    )

if THEME == "light":
    for i in range(200):
        t = i / 199
        c = _mix(BG_TOP, BG_BOT, t)
        ax.add_patch(Rectangle((0, HEIGHT * (1 - (i+1)/200)), WIDTH, HEIGHT/200,
                                facecolor=c, edgecolor='none', zorder=0))

# ============================================================
#  HELPERS
# ============================================================
def shadow(x, y, w, h, off=0.07, alpha=0.10, radius=0.18):
    s = FancyBboxPatch((x + off, y - off), w, h,
                       boxstyle=f"round,pad=0.02,rounding_size={radius}",
                       linewidth=0, facecolor="#0f172a", alpha=alpha, zorder=1)
    ax.add_patch(s)

def participant_box(cx, top_y, name, role="app", subtitle=None, width=2.6, height=0.9):
    """Cartao de participante centrado em cx, com a base em top_y."""
    pal = ROLE.get(role, COL_APP)
    bg, border, accent = pal
    x = cx - width/2
    y = top_y - height
    shadow(x, y, width, height)
    body = FancyBboxPatch((x, y), width, height,
                          boxstyle="round,pad=0.02,rounding_size=0.18",
                          linewidth=1.0, edgecolor=border, facecolor=bg, zorder=2)
    ax.add_patch(body)
    bar = FancyBboxPatch((x, y), 0.10, height,
                         boxstyle="round,pad=0.0,rounding_size=0.06",
                         linewidth=0, facecolor=accent, zorder=3)
    ax.add_patch(bar)
    if subtitle:
        ax.text(cx + 0.05, y + height*0.62, name, ha='center', va='center',
                fontsize=11, color=border, weight='bold', zorder=4)
        ax.text(cx + 0.05, y + height*0.28, subtitle, ha='center', va='center',
                fontsize=8.5, color=INK_SOFT, zorder=4)
    else:
        ax.text(cx + 0.05, y + height/2, name, ha='center', va='center',
                fontsize=11, color=border, weight='bold', zorder=4)
    return y  # base of header

def lifeline(cx, y_top, y_bot, color=None):
    """Linha pontilhada vertical do header ate y_bot."""
    color = color or LINE
    ax.plot([cx, cx], [y_top, y_bot], color=color, linewidth=1.2,
            linestyle=(0, (2, 3)), zorder=1.2)

def message(x_from, x_to, y, label, kind="sync", role_to="app"):
    """Mensagem horizontal entre duas colunas, na altura y.

    kind: 'sync' (solid -|>), 'return' (dashed -|>), 'async' (dashed ->), 'error' (solid red).
    """
    pal = ROLE.get(role_to, COL_APP)
    if kind == "error":
        color = COL_DATA[2]
    else:
        color = pal[2]

    if kind == "sync":
        ls, style, lw = 'solid', '-|>', 1.6
    elif kind == "return":
        ls, style, lw = (0, (4, 3)), '-|>', 1.3
    elif kind == "async":
        ls, style, lw = (0, (4, 3)), '->', 1.4
    else:  # error
        ls, style, lw = 'solid', '-|>', 1.8

    a = FancyArrowPatch((x_from, y), (x_to, y),
                        arrowstyle=style, mutation_scale=14,
                        color=color, linewidth=lw, linestyle=ls, zorder=5)
    ax.add_patch(a)

    mx = (x_from + x_to) / 2
    style_label = 'italic' if kind in ("return", "async") else 'normal'
    weight = 'bold' if kind == "error" else 'normal'
    txt = ("ERROR: " + label) if kind == "error" else label
    ax.text(mx, y + 0.18, txt, fontsize=8.5, color=color, ha='center', va='bottom',
            style=style_label, weight=weight, zorder=6,
            bbox=dict(boxstyle="round,pad=0.18", facecolor=BG_TOP,
                      edgecolor='none', alpha=0.85))

def block(x_l, x_r, y_top, y_bot, kind="opt", condition=None, color=None):
    """Bloco opt/alt/loop/par com pilula no canto superior esquerdo."""
    color = color or COL_SVC[2]
    rect = FancyBboxPatch((x_l, y_bot), x_r - x_l, y_top - y_bot,
                          boxstyle="round,pad=0.04,rounding_size=0.18",
                          linewidth=1.0, edgecolor=color, facecolor='none',
                          linestyle=(0, (6, 4)), zorder=1.5)
    ax.add_patch(rect)
    pill_w = max(0.18 * len(kind) + 0.5, 1.0)
    pill = FancyBboxPatch((x_l + 0.2, y_top - 0.32), pill_w, 0.42,
                          boxstyle="round,pad=0.02,rounding_size=0.2",
                          linewidth=0, facecolor=color, zorder=2)
    ax.add_patch(pill)
    ax.text(x_l + 0.2 + pill_w/2, y_top - 0.11, kind, ha='center', va='center',
            fontsize=9, color="white", weight='bold', zorder=3)
    if condition:
        ax.text(x_l + 0.2 + pill_w + 0.2, y_top - 0.11, f"[{condition}]",
                ha='left', va='center', fontsize=8.5, color=color,
                style='italic', zorder=3)

def note(cx, y, text, width=2.4, height=0.6):
    """Sticky note amarelo ancorado em (cx, y)."""
    pal = COL_NOTE
    x = cx - width/2
    shadow(x, y - height/2, width, height)
    body = FancyBboxPatch((x, y - height/2), width, height,
                          boxstyle="round,pad=0.02,rounding_size=0.12",
                          linewidth=1.0, edgecolor=pal[1], facecolor=pal[0], zorder=2)
    ax.add_patch(body)
    ax.text(cx, y, text, ha='center', va='center', fontsize=8.2,
            color=pal[1], style='italic', zorder=3)

def title(text, subtitle=None):
    ax.text(WIDTH/2, HEIGHT - 0.55, text,
            ha='center', fontsize=26, color=INK, weight='bold')
    if subtitle:
        ax.text(WIDTH/2, HEIGHT - 1.05, subtitle,
                ha='center', fontsize=11, color=INK_SOFT, style='italic')
    ax.add_patch(Rectangle((WIDTH/2 - 1.2, HEIGHT - 1.25), 2.4, 0.04,
                            facecolor=COL_APP[2], edgecolor='none', zorder=2))

def legend(x, y, w=4.6, h=1.05):
    """Legenda dos tipos de mensagem."""
    shadow(x, y, w, h)
    box = FancyBboxPatch((x, y), w, h,
                          boxstyle="round,pad=0.04,rounding_size=0.18",
                          linewidth=1.0, edgecolor=LINE,
                          facecolor="white" if THEME == "light" else "#24283b", zorder=2)
    ax.add_patch(box)
    ax.text(x + w/2, y + h - 0.2, "Tipos de mensagem",
            ha='center', fontsize=9.5, color=INK, weight='bold', zorder=3)
    items = [
        ("sync request",  COL_APP[2], 'solid', '-|>'),
        ("sync return",   COL_APP[2], (0, (4, 3)), '-|>'),
        ("async (fire)",  COL_WORKER[2], (0, (4, 3)), '->'),
        ("error",         COL_DATA[2], 'solid', '-|>'),
    ]
    for i, (lbl, c, ls, st) in enumerate(items):
        col = i % 2
        row = i // 2
        cx = x + 0.22 + col * (w/2)
        cy = y + h - 0.55 - row * 0.22
        a = FancyArrowPatch((cx, cy + 0.07), (cx + 0.45, cy + 0.07),
                            arrowstyle=st, mutation_scale=8,
                            color=c, linewidth=1.3, linestyle=ls, zorder=3)
        ax.add_patch(a)
        ax.text(cx + 0.55, cy + 0.07, lbl, fontsize=8, color=INK_SOFT,
                va='center', zorder=3)

# ============================================================
#  EXEMPLO MINIMO  (substitua pelos dados reais do fluxo)
# ============================================================
title("Payment Flow", "POST /charge - happy path com webhook async")

# 1) Participantes (esq -> dir). cx calculado pra distribuir uniforme.
PARTICIPANTS = [
    ("Customer",      "client",  "app mobile"),
    ("API Gateway",   "edge",    "kong"),
    ("Payment SVC",   "service", "go"),
    ("Stripe",        "ext",     "PSP"),
    ("Webhook SVC",   "worker",  "consumer"),
    ("Notif SVC",     "service", "email"),
]
n = len(PARTICIPANTS)
margin_x = 1.0
col_w = (WIDTH - 2 * margin_x) / (n - 1)
COLS = {p[0]: margin_x + i * col_w for i, p in enumerate(PARTICIPANTS)}

HEADER_TOP = HEIGHT - 1.6
LIFELINE_BOTTOM = 1.6

for name, role, sub in PARTICIPANTS:
    base = participant_box(COLS[name], HEADER_TOP, name, role=role, subtitle=sub)
    lifeline(COLS[name], base, LIFELINE_BOTTOM)

# 2) Blocos (opcional) - desenhe ANTES das mensagens pra ficar atras
# block(COLS["Payment SVC"] - 0.2, COLS["Webhook SVC"] + 0.2, 7.2, 4.8,
#       kind="opt", condition="charge ok", color=COL_SVC[2])

# 3) Mensagens - cronologica de cima pra baixo. y vai diminuindo.
MESSAGES = [
    # (y,    "from",         "to",            label,                 kind,     role_to)
    (10.6, "Customer",     "API Gateway",   "POST /charge",         "sync",   "edge"),
    (9.9,  "API Gateway",  "Payment SVC",   "validate + auth",      "sync",   "service"),
    (9.2,  "Payment SVC",  "Stripe",        "POST charges",         "sync",   "ext"),
    (8.5,  "Stripe",       "Payment SVC",   "201 charge_id",        "return", "service"),
    (7.8,  "Payment SVC",  "API Gateway",   "201 + payment_id",     "return", "edge"),
    (7.1,  "API Gateway",  "Customer",      "201 OK",               "return", "client"),
    (6.0,  "Stripe",       "Webhook SVC",   "POST /webhook (async)", "async", "worker"),
    (5.3,  "Webhook SVC",  "Payment SVC",   "settle + persist",     "sync",   "service"),
    (4.6,  "Webhook SVC",  "Notif SVC",     "publish receipt event", "async", "worker"),
    (3.9,  "Notif SVC",    "Customer",      "send email",           "async", "client"),
    # exemplo de erro:
    (2.9,  "Stripe",       "Payment SVC",   "402 card_declined",    "error", "service"),
]

for y, frm, to, label, kind, role_to in MESSAGES:
    message(COLS[frm], COLS[to], y, label, kind=kind, role_to=role_to)

# 4) Notas (opcional)
note(COLS["Webhook SVC"], 5.85,
     "idempotente:\nrejeita event_id duplicado", width=2.4, height=0.7)

# 5) Legenda no canto inferior direito
legend(WIDTH - 5.0, 0.25)

# ============================================================
#  SALVAR
# ============================================================
os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
plt.savefig(OUT, dpi=DPI, facecolor=BG_TOP, bbox_inches='tight')
print(f"OK -> {OUT}")
