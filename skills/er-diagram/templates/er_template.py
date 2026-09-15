"""
Template polido de diagrama ER (Entity-Relationship).

Como usar:
1. Copie este arquivo para /tmp/<nome>.py
2. Substitua TABLES e RELATIONS pelos dados reais (ler de schema.sql / migration / pg_dump)
3. Ajuste WIDTH/HEIGHT e posicoes (x, y) por tabela conforme o numero
4. Ajuste OUT no final
5. Execute: python3 /tmp/<nome>.py

Mantenha intactos: helpers (table_card / relation / legend), paleta, gradiente.
Estilo casa com a skill architecture-diagram.
"""
import os
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle
from matplotlib import rcParams

rcParams['font.family'] = ['Helvetica Neue', 'Helvetica', 'Arial', 'DejaVu Sans']

# ============================================================
#  CONFIGURACAO
# ============================================================
WIDTH, HEIGHT = 22, 14
DPI = 200
THEME = "light"   # "light" | "dark"
OUT = "/tmp/er-diagram.png"

# ============================================================
#  PALETA
# ============================================================
if THEME == "dark":
    BG_TOP, BG_BOT = "#1a1b26", "#1a1b26"
    INK, INK_SOFT, INK_MUTED = "#c0caf5", "#9aa5ce", "#7782a8"
    LINE = "#414868"
    TYPE_COLOR = "#7aa2f7"
else:
    BG_TOP, BG_BOT = "#f4f6fb", "#e6eaf3"
    INK, INK_SOFT, INK_MUTED = "#0f172a", "#475569", "#94a3b8"
    LINE = "#cbd5e1"
    TYPE_COLOR = "#0e7490"

# Cores por dominio (uma cor por bounded context / area de negocio)
COL_USERS    = ("#eef2ff", "#3730a3", "#4338ca")  # indigo
COL_CATALOG  = ("#ecfeff", "#0e7490", "#0891b2")  # cyan
COL_ORDERS   = ("#ecfdf5", "#047857", "#10b981")  # emerald
COL_PAYMENTS = ("#fdf4ff", "#86198f", "#a21caf")  # fuchsia
COL_AUDIT    = ("#fff7ed", "#b45309", "#d97706")  # amber
COL_DOMAIN_X = ("#faf5ff", "#6b21a8", "#9333ea")  # violet
COL_LOG      = ("#f1f5f9", "#334155", "#475569")  # slate

CONSTRAINT_COLOR = {
    "PK":  ("#fef9c3", "#854d0e"),  # amarelo (key)
    "FK":  ("#dbeafe", "#1e40af"),  # azul claro
    "UQ":  ("#fce7f3", "#9d174d"),  # rosa
    "NN":  ("#e0e7ff", "#3730a3"),  # indigo claro
    "IX":  ("#ecfdf5", "#047857"),  # verde
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
ROW_HEIGHT = 0.32

def shadow(x, y, w, h, off=0.07, alpha=0.10, radius=0.18):
    s = FancyBboxPatch((x + off, y - off), w, h,
                       boxstyle=f"round,pad=0.02,rounding_size={radius}",
                       linewidth=0, facecolor="#0f172a", alpha=alpha, zorder=1)
    ax.add_patch(s)

def constraint_pill(x, y, label):
    """Pequena pilula de constraint (PK / FK / UQ / NN / IX)."""
    bg, fg = CONSTRAINT_COLOR.get(label, ("#e2e8f0", "#475569"))
    pill = FancyBboxPatch((x, y), 0.42, 0.20,
                          boxstyle="round,pad=0.02,rounding_size=0.08",
                          linewidth=0, facecolor=bg, zorder=4)
    ax.add_patch(pill)
    ax.text(x + 0.21, y + 0.10, label, ha='center', va='center',
            fontsize=7, color=fg, weight='bold', zorder=5)

def table_card(x, y, name, columns, palette=COL_ORDERS, width=4.6, subtitle=None):
    """
    Cartao de tabela.
    columns: lista de tuplas (col_name, type, [constraints]) onde constraints
             e um conjunto/lista com qualquer combinacao de PK/FK/UQ/NN/IX.
    Retorna (x_left, x_right, y_top, y_bot, anchors_dict) onde anchors_dict[col] = (x_anchor, y_row)
    """
    bg, border, accent = palette
    header_h = 0.55
    body_h = ROW_HEIGHT * len(columns) + 0.18
    h = header_h + body_h
    y_top = y
    y_bot = y - h

    shadow(x, y_bot, width, h)
    body = FancyBboxPatch((x, y_bot), width, h,
                          boxstyle="round,pad=0.02,rounding_size=0.18",
                          linewidth=1.0, edgecolor=border, facecolor=bg, zorder=2)
    ax.add_patch(body)

    # Header colorido
    header = FancyBboxPatch((x, y - header_h), width, header_h,
                            boxstyle="round,pad=0.02,rounding_size=0.18",
                            linewidth=0, facecolor=accent, zorder=3)
    ax.add_patch(header)
    ax.text(x + 0.18, y - header_h/2, name,
            ha='left', va='center', fontsize=11.5, color="white", weight='bold', zorder=4)
    if subtitle:
        ax.text(x + width - 0.18, y - header_h/2, subtitle,
                ha='right', va='center', fontsize=8.5, color="white",
                style='italic', alpha=0.85, zorder=4)

    # Linha separadora
    ax.plot([x + 0.06, x + width - 0.06], [y - header_h, y - header_h],
            color=border, linewidth=0.8, alpha=0.4, zorder=3)

    # Linhas das colunas
    anchors = {}
    for i, col in enumerate(columns):
        col_name = col[0]
        col_type = col[1] if len(col) > 1 else ""
        constraints = col[2] if len(col) > 2 else []

        row_y = y - header_h - 0.14 - i * ROW_HEIGHT
        # nome da coluna
        ax.text(x + 0.20, row_y, col_name,
                ha='left', va='center', fontsize=9.5, color=INK, weight='bold', zorder=4)
        # tipo (alinhado a direita das pilulas)
        type_x = x + width - 0.18 - 0.46 * len(constraints)
        ax.text(type_x, row_y, col_type,
                ha='right', va='center', fontsize=8.5, color=TYPE_COLOR,
                style='italic', zorder=4)
        # pilulas de constraint
        for k, c in enumerate(constraints):
            cx = x + width - 0.16 - (len(constraints) - k) * 0.46
            constraint_pill(cx, row_y - 0.10, c)

        anchors[col_name] = (row_y, x, x + width)

    return (x, x + width, y, y_bot, anchors)

def relation(from_table, to_table, from_col, to_col, kind="N:1",
             color=None, label=None, curve=0.0):
    """
    Liga uma coluna de uma tabela ate uma coluna de outra.
    kind: '1:1' | '1:N' | 'N:1' | 'M:N'
    Cores e labels da multiplicidade aparecem nas pontas.
    """
    color = color or LINE
    fy, fxL, fxR = from_table["anchors"][from_col]
    ty, txL, txR = to_table["anchors"][to_col]
    # escolhe lado mais proximo (esquerdo ou direito) de cada cartao
    if (fxL + fxR) / 2 < (txL + txR) / 2:
        x1 = fxR; x2 = txL
    else:
        x1 = fxL; x2 = txR

    a = FancyArrowPatch((x1, fy), (x2, ty),
                        arrowstyle='-', mutation_scale=10,
                        color=color, linewidth=1.4,
                        connectionstyle=f"arc3,rad={curve}",
                        zorder=4)
    ax.add_patch(a)
    # multiplicidade nas pontas
    left_mult, right_mult = kind.split(":")
    # ponta from
    ax.text(x1 + (0.3 if x1 < x2 else -0.3), fy + 0.18,
            left_mult, ha='center', va='center',
            fontsize=10, color=color, weight='bold', zorder=5,
            bbox=dict(boxstyle="round,pad=0.18", facecolor=BG_TOP,
                      edgecolor='none', alpha=0.9))
    # ponta to
    ax.text(x2 + (-0.3 if x1 < x2 else 0.3), ty + 0.18,
            right_mult, ha='center', va='center',
            fontsize=10, color=color, weight='bold', zorder=5,
            bbox=dict(boxstyle="round,pad=0.18", facecolor=BG_TOP,
                      edgecolor='none', alpha=0.9))
    # label opcional no meio
    if label:
        mx = (x1 + x2) / 2
        my = (fy + ty) / 2 + 0.22
        ax.text(mx, my, label, ha='center', va='center',
                fontsize=8, color=color, style='italic', zorder=5,
                bbox=dict(boxstyle="round,pad=0.18", facecolor=BG_TOP,
                          edgecolor='none', alpha=0.85))

def title(text, subtitle=None):
    ax.text(WIDTH/2, HEIGHT - 0.55, text,
            ha='center', fontsize=28, color=INK, weight='bold')
    if subtitle:
        ax.text(WIDTH/2, HEIGHT - 1.05, subtitle,
                ha='center', fontsize=11, color=INK_SOFT, style='italic')
    ax.add_patch(Rectangle((WIDTH/2 - 1.2, HEIGHT - 1.25), 2.4, 0.04,
                            facecolor=COL_ORDERS[2], edgecolor='none', zorder=2))

def legend(x, y, items, w=4.4, h=None, label_title="Bounded contexts"):
    """Legenda de dominios (ou de constraints). items = [(label, color)]."""
    h = h or (0.32 + 0.24 * ((len(items) + 1) // 2))
    shadow(x, y, w, h)
    box = FancyBboxPatch((x, y), w, h,
                          boxstyle="round,pad=0.04,rounding_size=0.18",
                          linewidth=1.0, edgecolor=LINE,
                          facecolor="white" if THEME == "light" else "#24283b", zorder=2)
    ax.add_patch(box)
    ax.text(x + w/2, y + h - 0.20, label_title,
            ha='center', fontsize=9.5, color=INK, weight='bold', zorder=3)
    for i, (lbl, c) in enumerate(items):
        col = i % 2
        row = i // 2
        cx = x + 0.22 + col * (w/2)
        cy = y + h - 0.55 - row * 0.24
        ax.add_patch(Rectangle((cx, cy), 0.18, 0.14, facecolor=c, edgecolor=c, zorder=3))
        ax.text(cx + 0.26, cy + 0.07, lbl, fontsize=8.2, color=INK_SOFT,
                va='center', zorder=3)

# ============================================================
#  EXEMPLO MINIMO  (substitua pelo schema real)
# ============================================================
title("Schema do Sistema", "Bounded contexts: users / catalog / orders / payments / audit")

# Cada chamada a table_card retorna anchors. Guardamos pra desenhar relations.
# Layout: 3 colunas (esq, centro, dir) x 2 linhas (cima, baixo).

t_users = {}
xL, xR, yT, yB, anc = table_card(
    1.0, HEIGHT - 2.0, "users", [
        ("id",          "uuid",         ["PK"]),
        ("email",       "varchar(255)", ["UQ", "NN"]),
        ("name",        "varchar(120)", ["NN"]),
        ("created_at",  "timestamptz",  ["NN"]),
        ("deleted_at",  "timestamptz",  []),
    ], palette=COL_USERS, width=4.6, subtitle="autn")
t_users["anchors"] = anc

t_addresses = {}
_, _, _, _, anc = table_card(
    1.0, HEIGHT - 6.6, "addresses", [
        ("id",         "uuid",         ["PK"]),
        ("user_id",    "uuid",         ["FK", "NN"]),
        ("street",     "varchar(200)", ["NN"]),
        ("city",       "varchar(80)",  ["NN"]),
        ("country",    "char(2)",      ["NN"]),
    ], palette=COL_USERS, width=4.6, subtitle="autn")
t_addresses["anchors"] = anc

t_products = {}
_, _, _, _, anc = table_card(
    8.4, HEIGHT - 2.0, "products", [
        ("id",          "uuid",         ["PK"]),
        ("sku",         "varchar(40)",  ["UQ", "NN"]),
        ("name",        "varchar(200)", ["NN"]),
        ("price_cents", "integer",      ["NN"]),
        ("active",      "boolean",      ["NN"]),
    ], palette=COL_CATALOG, width=4.6, subtitle="catalog")
t_products["anchors"] = anc

t_orders = {}
_, _, _, _, anc = table_card(
    8.4, HEIGHT - 7.6, "orders", [
        ("id",          "uuid",         ["PK"]),
        ("user_id",     "uuid",         ["FK", "NN"]),
        ("status",      "varchar(20)",  ["NN", "IX"]),
        ("total_cents", "integer",      ["NN"]),
        ("created_at",  "timestamptz",  ["NN", "IX"]),
    ], palette=COL_ORDERS, width=4.6, subtitle="orders")
t_orders["anchors"] = anc

t_order_items = {}
_, _, _, _, anc = table_card(
    8.4, HEIGHT - 12.7, "order_items", [
        ("id",          "uuid",     ["PK"]),
        ("order_id",    "uuid",     ["FK", "NN"]),
        ("product_id",  "uuid",     ["FK", "NN"]),
        ("qty",         "integer",  ["NN"]),
        ("unit_cents",  "integer",  ["NN"]),
    ], palette=COL_ORDERS, width=4.6, subtitle="orders")
t_order_items["anchors"] = anc

t_payments = {}
_, _, _, _, anc = table_card(
    15.8, HEIGHT - 7.6, "payments", [
        ("id",          "uuid",         ["PK"]),
        ("order_id",    "uuid",         ["FK", "NN", "UQ"]),
        ("provider",    "varchar(20)",  ["NN"]),
        ("provider_ref","varchar(64)",  ["UQ"]),
        ("status",      "varchar(20)",  ["NN", "IX"]),
        ("paid_at",     "timestamptz",  []),
    ], palette=COL_PAYMENTS, width=4.8, subtitle="payments")
t_payments["anchors"] = anc

t_audit = {}
_, _, _, _, anc = table_card(
    15.8, HEIGHT - 2.0, "audit_log", [
        ("id",          "bigserial",    ["PK"]),
        ("actor_id",    "uuid",         ["FK"]),
        ("entity",      "varchar(40)",  ["NN", "IX"]),
        ("entity_id",   "uuid",         ["NN"]),
        ("action",      "varchar(20)",  ["NN"]),
        ("at",          "timestamptz",  ["NN", "IX"]),
    ], palette=COL_AUDIT, width=4.8, subtitle="audit")
t_audit["anchors"] = anc

# ============================================================
#  RELACOES
# ============================================================
relation(t_users,       t_addresses, "id", "user_id", kind="1:N", color=COL_USERS[1])
relation(t_users,       t_orders,    "id", "user_id", kind="1:N", color=COL_ORDERS[1], curve=0.1)
relation(t_orders,      t_order_items, "id", "order_id", kind="1:N", color=COL_ORDERS[1])
relation(t_products,    t_order_items, "id", "product_id", kind="1:N", color=COL_CATALOG[1])
relation(t_orders,      t_payments,  "id", "order_id", kind="1:1", color=COL_PAYMENTS[1])
relation(t_users,       t_audit,     "id", "actor_id", kind="1:N", color=COL_AUDIT[1], curve=-0.2)

# ============================================================
#  LEGENDA
# ============================================================
legend(WIDTH - 4.6, 0.4, [
    ("users",    COL_USERS[2]),
    ("catalog",  COL_CATALOG[2]),
    ("orders",   COL_ORDERS[2]),
    ("payments", COL_PAYMENTS[2]),
    ("audit",    COL_AUDIT[2]),
])

legend(WIDTH - 9.4, 0.4, [
    ("PK key",    CONSTRAINT_COLOR["PK"][0]),
    ("FK ref",    CONSTRAINT_COLOR["FK"][0]),
    ("UQ unique", CONSTRAINT_COLOR["UQ"][0]),
    ("NN not null", CONSTRAINT_COLOR["NN"][0]),
    ("IX index",  CONSTRAINT_COLOR["IX"][0]),
], w=4.6, label_title="Constraints")

# ============================================================
#  SALVAR
# ============================================================
os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
plt.savefig(OUT, dpi=DPI, facecolor=BG_TOP, bbox_inches='tight')
print(f"OK -> {OUT}")
