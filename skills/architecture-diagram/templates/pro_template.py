"""
Template polido de diagrama de arquitetura.

Como usar:
1. Copie este arquivo para /tmp/<nome>.py
2. Substitua os textos das chamadas card() pelos componentes do projeto
3. Ajuste coordenadas se precisar adicionar/remover cartoes
4. Ajuste a variavel OUT no final
5. Execute: python3 /tmp/<nome>.py

Mantenha intactos: helpers (card/section/arrow/shadow), paleta, gradiente.
"""
import os
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle
from matplotlib import rcParams

rcParams['font.family'] = ['Helvetica Neue', 'Helvetica', 'Arial', 'DejaVu Sans']

# ============================================================
#  CONFIGURACAO
# ============================================================
W, H = 22, 13.5            # tamanho do canvas (polegadas)
DPI  = 200                 # resolucao final
THEME = "light"            # "light" | "dark"

# Saida (ajuste para o seu projeto)
OUT = "/tmp/architecture.png"

# ============================================================
#  PALETA
# ============================================================
if THEME == "dark":
    BG_TOP, BG_BOT = "#1a1b26", "#1a1b26"
    INK       = "#c0caf5"
    INK_SOFT  = "#9aa5ce"
    INK_MUTED = "#7782a8"
    LINE      = "#414868"
else:
    BG_TOP, BG_BOT = "#f4f6fb", "#e6eaf3"
    INK       = "#0f172a"
    INK_SOFT  = "#475569"
    INK_MUTED = "#94a3b8"
    LINE      = "#cbd5e1"

# Cores de camada: (fundo, borda, acento)
COL_CLIENT = ("#eef2ff", "#3730a3", "#4338ca")
COL_EDGE   = ("#ecfeff", "#0e7490", "#0891b2")
COL_APP    = ("#eef2ff", "#4338ca", "#6366f1")
COL_SVC    = ("#ecfdf5", "#047857", "#10b981")
COL_TRANS  = ("#fdf4ff", "#86198f", "#a21caf")
COL_INFRA  = ("#fff7ed", "#b45309", "#d97706")
COL_DOMAIN = ("#faf5ff", "#6b21a8", "#9333ea")
COL_DATA   = ("#fef2f2", "#b91c1c", "#dc2626")
COL_EXT    = ("#f1f5f9", "#334155", "#475569")

# ============================================================
#  CANVAS + FUNDO
# ============================================================
fig, ax = plt.subplots(figsize=(W, H))
ax.set_xlim(0, W)
ax.set_ylim(0, H)
ax.axis('off')
fig.patch.set_facecolor(BG_TOP)
ax.set_facecolor(BG_TOP)

# gradiente vertical
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
        ax.add_patch(Rectangle((0, H * (1 - (i+1)/200)), W, H/200,
                                facecolor=c, edgecolor='none', zorder=0))

# ============================================================
#  HELPERS
# ============================================================
def shadow(x, y, w, h, off=0.07, alpha=0.10, radius=0.18):
    s = FancyBboxPatch((x + off, y - off), w, h,
                       boxstyle=f"round,pad=0.02,rounding_size={radius}",
                       linewidth=0, facecolor="#0f172a", alpha=alpha, zorder=1)
    ax.add_patch(s)

def card(x, y, w, h, title, subtitle=None, palette=COL_APP,
         title_size=11, sub_size=8.5, accent_bar=True):
    """
    Cartao com sombra suave + barra de acento lateral.
    title: texto principal (negrito, cor da borda)
    subtitle: linha de descricao opcional (cinza)
    palette: tupla (bg, border, accent)
    """
    bg, border, accent = palette
    shadow(x, y, w, h)
    body = FancyBboxPatch((x, y), w, h,
                          boxstyle="round,pad=0.02,rounding_size=0.18",
                          linewidth=1.0, edgecolor=border, facecolor=bg, zorder=2)
    ax.add_patch(body)
    if accent_bar:
        bar = FancyBboxPatch((x, y), 0.12, h,
                             boxstyle="round,pad=0.0,rounding_size=0.06",
                             linewidth=0, facecolor=accent, zorder=3)
        ax.add_patch(bar)
    if subtitle:
        ax.text(x + w/2 + 0.05, y + h - h*0.32, title, ha='center', va='center',
                fontsize=title_size, color=border, weight='bold', zorder=4)
        ax.text(x + w/2 + 0.05, y + h*0.32, subtitle, ha='center', va='center',
                fontsize=sub_size, color=INK_SOFT, zorder=4)
    else:
        ax.text(x + w/2 + 0.05, y + h/2, title, ha='center', va='center',
                fontsize=title_size, color=border, weight='bold', zorder=4)

def section(x, y, w, h, label, color):
    """Grupo com borda tracejada e pilula de cabecalho."""
    rect = FancyBboxPatch((x, y), w, h,
                          boxstyle="round,pad=0.04,rounding_size=0.22",
                          linewidth=1.2, edgecolor=color, facecolor='none',
                          linestyle=(0, (6, 4)), zorder=1.5)
    ax.add_patch(rect)
    pill_w = max(0.18 * len(label) + 0.4, 1.6)
    pill = FancyBboxPatch((x + 0.3, y + h - 0.32), pill_w, 0.42,
                          boxstyle="round,pad=0.02,rounding_size=0.2",
                          linewidth=0, facecolor=color, zorder=2)
    ax.add_patch(pill)
    ax.text(x + 0.3 + pill_w/2, y + h - 0.11, label, ha='center', va='center',
            fontsize=9.5, color="white", weight='bold', zorder=3)

def arrow(x1, y1, x2, y2, color=INK_SOFT, lw=1.4, style="-|>", curve=0.0,
          dashed=False, label=None, label_pos=0.5, label_offset=(0, 0.18)):
    """Seta com rotulo opcional em badge."""
    ls = (0, (4, 3)) if dashed else 'solid'
    a = FancyArrowPatch((x1, y1), (x2, y2),
                        arrowstyle=style, mutation_scale=14,
                        color=color, linewidth=lw,
                        connectionstyle=f"arc3,rad={curve}",
                        linestyle=ls, zorder=5)
    ax.add_patch(a)
    if label:
        mx = x1 + (x2 - x1) * label_pos + label_offset[0]
        my = y1 + (y2 - y1) * label_pos + label_offset[1]
        ax.text(mx, my, label, fontsize=8, color=color, ha='center', va='center',
                style='italic', zorder=6,
                bbox=dict(boxstyle="round,pad=0.18", facecolor=BG_TOP,
                          edgecolor='none', alpha=0.85))

def legend(x, y, w, h, items, title="Camadas"):
    """Card de legenda. items: [(label, cor)]."""
    shadow(x, y, w, h)
    box = FancyBboxPatch((x, y), w, h,
                          boxstyle="round,pad=0.04,rounding_size=0.18",
                          linewidth=1.0, edgecolor=LINE,
                          facecolor="white" if THEME == "light" else "#24283b",
                          zorder=2)
    ax.add_patch(box)
    ax.text(x + w/2, y + h - 0.22, title,
            ha='center', fontsize=10, color=INK, weight='bold', zorder=3)
    for i, (lbl, c) in enumerate(items):
        col = i % 2
        row = i // 2
        cx = x + 0.25 + col * (w/2 - 0.05)
        cy = y + h - 0.55 - row * 0.22
        ax.add_patch(Rectangle((cx, cy), 0.18, 0.14, facecolor=c, edgecolor=c, zorder=3))
        ax.text(cx + 0.26, cy + 0.07, lbl, fontsize=8.2, color=INK_SOFT,
                va='center', zorder=3)

def title(text, subtitle=None, info=None):
    ax.text(W/2, H - 0.55, text,
            ha='center', fontsize=30, color=INK, weight='bold')
    if subtitle:
        ax.text(W/2, H - 1.05, subtitle,
                ha='center', fontsize=12, color=INK_SOFT, style='italic')
    ax.add_patch(Rectangle((W/2 - 1.2, H - 1.25), 2.4, 0.04,
                            facecolor=COL_APP[2], edgecolor='none', zorder=2))
    if info:
        ax.text(W/2, H - 1.65, info,
                ha='center', fontsize=10, color=INK_MUTED)

# ============================================================
#  EXEMPLO MINIMO  (substitua pelo seu sistema)
# ============================================================
title(
    "Nome do Sistema",
    "Arquitetura  -  Clean Architecture  -  Stack",
    "Componente A   |   Componente B   |   Datastore   |   Observabilidade",
)

# Zona 1 - Clientes
card(1.2, H - 3.2, 4.0, 1.05, "Clientes externos",
     "descricao breve", COL_CLIENT)
card(5.6, H - 3.2, 4.0, 1.05, "Admin / Backoffice",
     "descricao breve", COL_CLIENT)

# Zona 2 - Edge
section(1.0, H - 5.0 - 0.2, 8.8, 1.55, "edge / middlewares", COL_EDGE[2])
card(1.3,  H - 5.0, 2.6, 0.95, "Compression", "headers", COL_EDGE)
card(4.05, H - 5.0, 2.6, 0.95, "CORS / Recovery", "panic-safe", COL_EDGE)
card(6.8,  H - 5.0, 2.85, 0.95, "Auth helpers", "tokens / sessao", COL_EDGE)

# Zona 3 - Aplicacao principal
section(10.4, 4.0, 10.4, 6.8, "internal / app", COL_APP[2])
card(10.8, 9.45, 4.7, 0.95, "router", "router HTTP", COL_APP)
card(15.7, 9.45, 4.7, 0.95, "middleware", "auth / tenant / tracing", COL_APP)
card(10.8, 8.35, 9.6, 0.95, "handler", "parsing / validacao / serializacao", COL_APP)
card(10.8, 6.95, 9.6, 1.25, "service",
     "orquestracao  -  regras de negocio  -  cache", COL_SVC, 12, 9)
card(10.8, 5.75, 9.6, 1.05, "repositorios",
     "interfaces do dominio implementadas em infra", COL_INFRA)

# Zona 4 - Domain (lateral) + Infra + Datastores
section(1.0, 0.4, 4.8, 3.2, "internal / domain", COL_DOMAIN[2])
card(1.3, 2.35, 4.2, 0.7, "entity", "objetos de negocio", COL_DOMAIN)
card(1.3, 1.55, 4.2, 0.7, "dto / constant", "transferencia entre camadas", COL_DOMAIN)
card(1.3, 0.75, 4.2, 0.7, "repo interfaces", "definidas pelo dominio", COL_DOMAIN)

section(6.0, 0.4, 3.8, 3.2, "infrastructure", COL_INFRA[2])
card(6.3, 2.35, 3.2, 0.7, "postgres / redis", "pools + cache", COL_INFRA)
card(6.3, 1.55, 3.2, 0.7, "entity / interface", "tags db", COL_INFRA)
card(6.3, 0.75, 3.2, 0.7, "configs / migrations", "viper + env", COL_INFRA)

card(10.4, 2.25, 4.9, 1.3, "PostgreSQL", "RW + RO pools", COL_DATA, 13, 9.5)
card(15.5, 2.25, 5.3, 1.3, "Redis", "cache / sessao", COL_DATA, 13, 9.5)
card(10.4, 0.75, 10.4, 1.3,
     "APIs externas (downstream)",
     "integracoes / parceiros", COL_EXT, 13, 9.5)

# ============================================================
#  SETAS
# ============================================================
arrow(3.2, H - 3.2, 5.4, H - 4.05, color=COL_EDGE[2], lw=1.6, curve=-0.15)
arrow(7.6, H - 3.2, 5.4, H - 4.05, color=COL_EDGE[2], lw=1.6, curve=0.15)
arrow(5.2, H - 2.7, 10.4, 9.95, color=COL_APP[2], lw=2.0, curve=-0.15,
      label="HTTP request", label_pos=0.55, label_offset=(0, 0.22))
arrow(15.6, 6.95, 12.85, 3.55, color=COL_EXT[2], lw=2.4, curve=0.15,
      label="HTTP downstream", label_pos=0.5, label_offset=(0.6, 0.05))
arrow(13.6, 5.75, 12.8, 3.55, color=COL_INFRA[2], lw=1.6, curve=-0.1,
      label="SQL", label_pos=0.55, label_offset=(0, 0.18))
arrow(17.6, 5.75, 18.0, 3.55, color=COL_INFRA[2], lw=1.6, curve=0.1,
      label="cache", label_pos=0.5, label_offset=(0.4, 0.18))
arrow(5.8, 1.5, 10.4, 6.7, color=COL_DOMAIN[2], lw=1.2, curve=-0.2, dashed=True,
      label="repo interfaces", label_pos=0.5, label_offset=(0.5, 0.18))
arrow(6.0, 1.6, 5.8, 1.6, color=COL_INFRA[2], lw=1.2, dashed=True)

# ============================================================
#  LEGENDA
# ============================================================
legend(W - 3.6, H - 2.55, 3.4, 1.45, [
    ("Cliente",        COL_CLIENT[2]),
    ("pkg/app",        COL_EDGE[2]),
    ("Presentation",   COL_APP[2]),
    ("Service",        COL_SVC[2]),
    ("Domain",         COL_DOMAIN[2]),
    ("Infrastructure", COL_INFRA[2]),
    ("Datastore",      COL_DATA[2]),
    ("Externo",        COL_EXT[2]),
])

# ============================================================
#  SALVAR
# ============================================================
os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
plt.savefig(OUT, dpi=DPI, facecolor=BG_TOP, bbox_inches='tight')
print(f"OK -> {OUT}")
