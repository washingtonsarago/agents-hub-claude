"""
Template polido de diagrama de maquina de estados (statechart / FSM).

Como usar:
1. Copie este arquivo para /tmp/<nome>.py
2. Substitua STATES, INITIAL, FINALS e TRANSITIONS pelos dados reais
3. Ajuste as coordenadas (x, y) de cada estado pra evitar sobreposicao
4. Ajuste OUT no final
5. Execute: python3 /tmp/<nome>.py

Mantenha intactos: helpers (state_box / initial_marker / final_ring /
transition / self_transition), paleta, gradiente. Estilo casa com as skills
architecture-diagram e sequence-diagram.

Notacao UML das transicoes:  evento [guarda] / acao
  - evento : o gatilho (obrigatorio, exceto transicao automatica de conclusao)
  - [guarda] : condicao booleana opcional que habilita a transicao
  - / acao : efeito colateral opcional disparado na transicao
"""
import os
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle, Circle, PathPatch
from matplotlib.path import Path
from matplotlib import rcParams

rcParams['font.family'] = ['Helvetica Neue', 'Helvetica', 'Arial', 'DejaVu Sans']

# ============================================================
#  CONFIGURACAO
# ============================================================
WIDTH, HEIGHT = 20, 13
DPI = 200
THEME = "light"   # "light" | "dark"
OUT = "/tmp/state_machine.png"

# ============================================================
#  PALETA  (mesma da architecture-diagram / sequence-diagram)
# ============================================================
if THEME == "dark":
    BG_TOP, BG_BOT = "#1a1b26", "#1a1b26"
    INK, INK_SOFT, INK_MUTED = "#c0caf5", "#9aa5ce", "#7782a8"
    LINE = "#414868"
    MARK = "#c0caf5"          # cor do marcador inicial/final no dark
else:
    BG_TOP, BG_BOT = "#f4f6fb", "#e6eaf3"
    INK, INK_SOFT, INK_MUTED = "#0f172a", "#475569", "#94a3b8"
    LINE = "#cbd5e1"
    MARK = "#0f172a"          # circulo inicial preto no light

# (fundo, borda, acento) por categoria de estado
COL_NORMAL  = ("#eef2ff", "#4338ca", "#6366f1")   # indigo  - estado comum
COL_SUCCESS = ("#ecfdf5", "#047857", "#10b981")   # emerald - sucesso / terminal ok
COL_ERROR   = ("#fef2f2", "#b91c1c", "#dc2626")   # red     - erro / cancelado
COL_WAIT    = ("#f1f5f9", "#334155", "#475569")   # slate   - espera / pendente
COL_ACTIVE  = ("#ecfeff", "#0e7490", "#0891b2")   # cyan    - em processamento

CATEGORY = {
    "normal":  COL_NORMAL,
    "success": COL_SUCCESS,
    "error":   COL_ERROR,
    "wait":    COL_WAIT,
    "active":  COL_ACTIVE,
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

# Registro de geometria dos estados (para as setas encostarem na borda)
GEOM = {}   # name -> (cx, cy, w, h)

def state_box(name, cx, cy, category="normal", subtitle=None,
              width=2.7, height=1.05, final=False):
    """Cartao de estado centrado em (cx, cy).

    category: 'normal' | 'success' | 'error' | 'wait' | 'active'
    subtitle: linha secundaria opcional (ex.: acao do-activity)
    final: se True, desenha um anel externo (estado final).
    """
    pal = CATEGORY.get(category, COL_NORMAL)
    bg, border, accent = pal
    x = cx - width/2
    y = cy - height/2
    if final:
        # anel externo do estado final (moldura dupla)
        outer = FancyBboxPatch((x - 0.12, y - 0.12), width + 0.24, height + 0.24,
                               boxstyle="round,pad=0.02,rounding_size=0.22",
                               linewidth=1.4, edgecolor=border, facecolor='none',
                               zorder=1.6)
        ax.add_patch(outer)
    shadow(x, y, width, height)
    body = FancyBboxPatch((x, y), width, height,
                          boxstyle="round,pad=0.02,rounding_size=0.18",
                          linewidth=1.0, edgecolor=border, facecolor=bg, zorder=2)
    ax.add_patch(body)
    bar = FancyBboxPatch((x, y), 0.11, height,
                         boxstyle="round,pad=0.0,rounding_size=0.06",
                         linewidth=0, facecolor=accent, zorder=3)
    ax.add_patch(bar)
    if subtitle:
        ax.text(cx + 0.05, cy + height*0.16, name, ha='center', va='center',
                fontsize=11.5, color=border, weight='bold', zorder=4)
        ax.text(cx + 0.05, cy - height*0.22, subtitle, ha='center', va='center',
                fontsize=8.3, color=INK_SOFT, style='italic', zorder=4)
    else:
        ax.text(cx + 0.05, cy, name, ha='center', va='center',
                fontsize=11.5, color=border, weight='bold', zorder=4)
    GEOM[name] = (cx, cy, width, height)

def _edge_point(cx, cy, w, h, tx, ty):
    """Ponto na borda do retangulo (cx,cy,w,h) na direcao de (tx,ty)."""
    dx, dy = tx - cx, ty - cy
    if dx == 0 and dy == 0:
        return cx, cy
    hw, hh = w/2 + 0.06, h/2 + 0.06
    sx = hw / abs(dx) if dx != 0 else float('inf')
    sy = hh / abs(dy) if dy != 0 else float('inf')
    s = min(sx, sy)
    return cx + dx * s, cy + dy * s

def initial_marker(state_name, dx=-1.15, dy=0.0, r=0.16):
    """Circulo preenchido (pseudo-estado inicial) + seta para o estado.
    dx/dy posicionam o marcador relativo ao centro do estado alvo."""
    cx, cy, w, h = GEOM[state_name]
    mx, my = cx + dx, cy + dy
    ax.add_patch(Circle((mx, my), r, facecolor=MARK, edgecolor=MARK, zorder=5))
    ex, ey = _edge_point(cx, cy, w, h, mx, my)
    a = FancyArrowPatch((mx, my), (ex, ey),
                        arrowstyle='-|>', mutation_scale=15,
                        color=MARK, linewidth=1.6, zorder=5)
    ax.add_patch(a)

def transition(frm, to, label, color=None, curve=0.0,
               label_pos=0.5, label_offset=(0, 0.0)):
    """Seta rotulada de um estado a outro. label = 'evento [guarda] / acao'.
    curve>0 arqueia para um lado, curve<0 para o outro (arc3)."""
    color = color or INK_SOFT
    fcx, fcy, fw, fh = GEOM[frm]
    tcx, tcy, tw, th = GEOM[to]
    x1, y1 = _edge_point(fcx, fcy, fw, fh, tcx, tcy)
    x2, y2 = _edge_point(tcx, tcy, tw, th, fcx, fcy)
    a = FancyArrowPatch((x1, y1), (x2, y2),
                        arrowstyle='-|>', mutation_scale=15,
                        color=color, linewidth=1.6,
                        connectionstyle=f"arc3,rad={curve}", zorder=4)
    ax.add_patch(a)
    # posicao do rotulo, deslocada pela curvatura pra acompanhar o arco
    mx = x1 + (x2 - x1) * label_pos + label_offset[0]
    my = y1 + (y2 - y1) * label_pos + label_offset[1]
    mx += -(y2 - y1) * curve * 0.5
    my += (x2 - x1) * curve * 0.5
    ax.text(mx, my, label, fontsize=8.3, color=color, ha='center', va='center',
            zorder=6,
            bbox=dict(boxstyle="round,pad=0.22", facecolor=BG_TOP,
                      edgecolor=color, linewidth=0.7, alpha=0.95))

def self_transition(state_name, label, color=None, side="top", loop=0.9):
    """Alca curva (loop) que sai e volta ao mesmo estado.
    side: 'top' | 'bottom' | 'left' | 'right'."""
    color = color or INK_SOFT
    cx, cy, w, h = GEOM[state_name]
    if side == "top":
        p1 = (cx - w*0.22, cy + h/2); p2 = (cx + w*0.22, cy + h/2)
        c1 = (cx - w*0.22, cy + h/2 + loop); c2 = (cx + w*0.22, cy + h/2 + loop)
        lx, ly = cx, cy + h/2 + loop + 0.18
    elif side == "bottom":
        p1 = (cx - w*0.22, cy - h/2); p2 = (cx + w*0.22, cy - h/2)
        c1 = (cx - w*0.22, cy - h/2 - loop); c2 = (cx + w*0.22, cy - h/2 - loop)
        lx, ly = cx, cy - h/2 - loop - 0.18
    elif side == "right":
        p1 = (cx + w/2, cy + h*0.22); p2 = (cx + w/2, cy - h*0.22)
        c1 = (cx + w/2 + loop, cy + h*0.22); c2 = (cx + w/2 + loop, cy - h*0.22)
        lx, ly = cx + w/2 + loop + 0.18, cy
    else:  # left
        p1 = (cx - w/2, cy + h*0.22); p2 = (cx - w/2, cy - h*0.22)
        c1 = (cx - w/2 - loop, cy + h*0.22); c2 = (cx - w/2 - loop, cy - h*0.22)
        lx, ly = cx - w/2 - loop - 0.18, cy
    # corpo da alca: curva cubica de Bezier saindo e voltando ao mesmo estado
    verts = [p1, c1, c2, p2]
    codes = [Path.MOVETO, Path.CURVE4, Path.CURVE4, Path.CURVE4]
    pp = PathPatch(Path(verts, codes), fill=False, edgecolor=color,
                   linewidth=1.5, zorder=4)
    ax.add_patch(pp)
    # cabeca de seta na chegada (segue a tangente vindo de c2)
    head = FancyArrowPatch(c2, p2, arrowstyle='-|>', mutation_scale=13,
                           color=color, linewidth=1.5, zorder=4)
    ax.add_patch(head)
    ax.text(lx, ly, label, fontsize=8.0, color=color, ha='center', va='center',
            zorder=6,
            bbox=dict(boxstyle="round,pad=0.2", facecolor=BG_TOP,
                      edgecolor=color, linewidth=0.7, alpha=0.95))

def title(text, subtitle=None):
    ax.text(WIDTH/2, HEIGHT - 0.55, text,
            ha='center', fontsize=26, color=INK, weight='bold')
    if subtitle:
        ax.text(WIDTH/2, HEIGHT - 1.05, subtitle,
                ha='center', fontsize=11, color=INK_SOFT, style='italic')
    ax.add_patch(Rectangle((WIDTH/2 - 1.2, HEIGHT - 1.25), 2.4, 0.04,
                            facecolor=COL_NORMAL[2], edgecolor='none', zorder=2))

def legend(x, y, w=4.4, h=1.35):
    """Legenda das categorias de estado."""
    shadow(x, y, w, h)
    box = FancyBboxPatch((x, y), w, h,
                          boxstyle="round,pad=0.04,rounding_size=0.18",
                          linewidth=1.0, edgecolor=LINE,
                          facecolor="white" if THEME == "light" else "#24283b", zorder=2)
    ax.add_patch(box)
    ax.text(x + w/2, y + h - 0.22, "Categorias de estado",
            ha='center', fontsize=9.5, color=INK, weight='bold', zorder=3)
    items = [
        ("normal",         COL_NORMAL[2]),
        ("em processo",    COL_ACTIVE[2]),
        ("espera",         COL_WAIT[2]),
        ("sucesso/final",  COL_SUCCESS[2]),
        ("erro/cancelado", COL_ERROR[2]),
    ]
    for i, (lbl, c) in enumerate(items):
        col = i % 2
        row = i // 2
        cx = x + 0.25 + col * (w/2 - 0.05)
        cy = y + h - 0.55 - row * 0.24
        ax.add_patch(Rectangle((cx, cy), 0.18, 0.14, facecolor=c, edgecolor=c, zorder=3))
        ax.text(cx + 0.26, cy + 0.07, lbl, fontsize=8.2, color=INK_SOFT,
                va='center', zorder=3)

# ============================================================
#  EXEMPLO FUNCIONAL  (ciclo de vida de um pedido)
#  Substitua STATES / TRANSITIONS pela sua maquina de estados.
# ============================================================
title("Ciclo de Vida do Pedido", "Order state machine - evento [guarda] / acao")

# 1) Estados: nome -> (cx, cy, categoria, subtitle, final?)
#    Ajuste (cx, cy) para posicionar / evitar sobreposicao.
state_box("pending_payment", 3.8, 9.6, "wait",   "aguarda pagamento")
state_box("paid",            9.0, 9.6, "active", "pagamento confirmado")
state_box("shipped",       14.4, 9.6, "normal", "em transporte")
state_box("delivered",     14.4, 5.6, "success", "entregue", final=True)
state_box("cancelled",       3.8, 5.6, "error",  "pedido cancelado", final=True)
state_box("refunded",        9.0, 5.6, "error",  "valor estornado", final=True)

# 2) Estado inicial (circulo preenchido) apontando pro primeiro estado
initial_marker("pending_payment", dx=-1.75, dy=0.0)

# 3) Transicoes: evento [guarda] / acao
transition("pending_payment", "paid",
           "pagar [valor ok] / captura", color=COL_SUCCESS[1],
           label_offset=(0, 0.28))
transition("paid", "shipped",
           "despachar / gera etiqueta", color=COL_NORMAL[1],
           label_offset=(0, 0.28))
transition("shipped", "delivered",
           "confirmar entrega", color=COL_SUCCESS[1],
           label_offset=(0.55, 0))

# caminhos de erro
transition("pending_payment", "cancelled",
           "cancelar / libera estoque", color=COL_ERROR[1],
           label_offset=(-0.55, 0))
transition("paid", "refunded",
           "reembolsar [dentro do prazo] / estorna PSP", color=COL_ERROR[1],
           label_offset=(0.55, 0))

# self-transition: retry de pagamento no proprio estado
self_transition("pending_payment", "tentar novamente / reprocessa cartao",
                color=COL_WAIT[1], side="top", loop=0.85)

# 4) Legenda no canto inferior direito
legend(WIDTH - 4.9, 0.4)

# ============================================================
#  SALVAR
# ============================================================
os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
plt.savefig(OUT, dpi=DPI, facecolor=BG_TOP, bbox_inches='tight')
print(f"OK -> {OUT}")
