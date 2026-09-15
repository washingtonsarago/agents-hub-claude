"""
Template polido de diagrama de deployment / topologia de infraestrutura.

Como usar:
1. Copie este arquivo para /tmp/<nome>.py
2. Substitua as ZONAS (zone) e os NOS (node) pela topologia real do projeto
3. Ajuste WIDTH/HEIGHT e coordenadas conforme o numero de zonas/nos
4. Ajuste OUT no final
5. Execute: python3 /tmp/<nome>.py

Mantenha intactos: helpers (zone / node / link / legend / title), paleta, gradiente.
Estilo casa com as skills architecture-diagram / sequence-diagram / er-diagram.

Conceitos:
- zone()  = boundary/limite de infra (regiao, VPC, subnet, AZ, on-prem).
            Retangulo grande arredondado com borda tracejada + pilula no canto.
            Zonas podem ANINHAR: desenhe a externa primeiro (maior), depois as
            internas (menores) dentro dela.
- node()  = recurso de deploy (ALB, ECS, EC2, Lambda, RDS, Redis, S3, fila...).
            Cartao com sombra + accent bar, cor escolhida pelo TIPO de recurso.
- link()  = conexao/porta entre nos. Solida = trafego sincrono; tracejada =
            async / replicacao. Label opcional com porta/protocolo (":443 https").
"""
import os
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle
from matplotlib import rcParams

rcParams['font.family'] = ['Helvetica Neue', 'Helvetica', 'Arial', 'DejaVu Sans']

# ============================================================
#  CONFIGURACAO
# ============================================================
W, H  = 22, 14             # tamanho do canvas (polegadas)
DPI   = 200                # resolucao final (>= 180)
THEME = "light"            # "light" | "dark"

OUT = "/tmp/deployment.png"

# ============================================================
#  PALETA  (identica a das skills de diagrama)
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

# Cores por TIPO de recurso: (fundo, borda, acento)
COL_EDGE    = ("#ecfeff", "#0e7490", "#0891b2")  # cyan   -> lb / edge / cdn / gateway
COL_COMPUTE = ("#eef2ff", "#4338ca", "#6366f1")  # indigo -> ec2 / ecs / eks / k8s node
COL_SERVICE = ("#ecfdf5", "#047857", "#10b981")  # emerald-> service / container / app / lambda
COL_DATA    = ("#fef2f2", "#b91c1c", "#dc2626")  # red    -> rds / db / cache / elasticache
COL_STORE   = ("#f1f5f9", "#334155", "#475569")  # slate  -> s3 / bucket / efs / volume
COL_QUEUE   = ("#fdf4ff", "#86198f", "#a21caf")  # fuchsia-> sqs / sns / kafka / eventbridge
COL_EXT     = ("#faf5ff", "#6b21a8", "#9333ea")  # violet -> internet / cliente / terceiros
COL_OBS     = ("#fff7ed", "#b45309", "#d97706")  # amber  -> observabilidade / cloudwatch

# Cores das ZONAS (so a borda/pilula; fundo sempre translucido)
ZONE_REGION = "#334155"   # regiao / conta (slate)
ZONE_VPC    = "#4338ca"   # VPC (indigo)
ZONE_PUB    = "#0891b2"   # public subnet (cyan)
ZONE_PRIV   = "#047857"   # private subnet (emerald)
ZONE_AZ     = "#94a3b8"   # availability zone (cinza)
ZONE_ONPREM = "#b45309"   # on-prem / datacenter (amber)

# ============================================================
#  CANVAS + FUNDO
# ============================================================
fig, ax = plt.subplots(figsize=(W, H))
ax.set_xlim(0, W); ax.set_ylim(0, H); ax.axis('off')
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

def zone(x, y, w, h, label, color=ZONE_VPC, cidr=None, z=1.4, fill=0.035):
    """
    Boundary de infra (regiao / VPC / subnet / AZ / on-prem).
    Retangulo grande arredondado, borda tracejada, pilula de rotulo no canto
    superior esquerdo. Para ANINHAR: chame primeiro a zona externa (maior),
    depois as internas dentro dela (z maior = desenha por cima).
      label: nome curto (ex.: "VPC", "public subnet", "AZ-a", "on-prem")
      cidr : bloco/CIDR opcional que aparece na pilula (ex.: "10.0.0.0/16")
    """
    # leve preenchimento translucido pra dar profundidade ao aninhamento
    ax.add_patch(FancyBboxPatch((x, y), w, h,
                 boxstyle="round,pad=0.04,rounding_size=0.22",
                 linewidth=0, facecolor=color, alpha=fill, zorder=z))
    ax.add_patch(FancyBboxPatch((x, y), w, h,
                 boxstyle="round,pad=0.04,rounding_size=0.22",
                 linewidth=1.3, edgecolor=color, facecolor='none',
                 linestyle=(0, (6, 4)), zorder=z + 0.05))
    text = label if not cidr else f"{label}  {cidr}"
    pill_w = max(0.135 * len(text) + 0.5, 1.6)
    pill = FancyBboxPatch((x + 0.32, y + h - 0.34), pill_w, 0.44,
                          boxstyle="round,pad=0.02,rounding_size=0.2",
                          linewidth=0, facecolor=color, zorder=z + 0.1)
    ax.add_patch(pill)
    ax.text(x + 0.32 + pill_w/2, y + h - 0.12, text, ha='center', va='center',
            fontsize=9.5, color="white", weight='bold', zorder=z + 0.15)

def node(x, y, w, h, title, subtitle=None, palette=COL_SERVICE, badge=None,
         title_size=11, sub_size=8.5, z=3):
    """
    No de deploy (recurso) = cartao com sombra + accent bar, cor pelo tipo.
      badge: rotulo pequeno no canto sup. direito (ex.: "x2", "Multi-AZ", "spot")
    Retorna dict com ancoras de borda pra ligar com link().
    """
    bg, border, accent = palette
    shadow(x, y, w, h)
    ax.add_patch(FancyBboxPatch((x, y), w, h,
                 boxstyle="round,pad=0.02,rounding_size=0.18",
                 linewidth=1.0, edgecolor=border, facecolor=bg, zorder=z))
    ax.add_patch(FancyBboxPatch((x, y), 0.12, h,
                 boxstyle="round,pad=0.0,rounding_size=0.06",
                 linewidth=0, facecolor=accent, zorder=z + 1))
    if subtitle:
        ax.text(x + w/2 + 0.05, y + h - h*0.34, title, ha='center', va='center',
                fontsize=title_size, color=border, weight='bold', zorder=z + 2)
        ax.text(x + w/2 + 0.05, y + h*0.32, subtitle, ha='center', va='center',
                fontsize=sub_size, color=INK_SOFT, zorder=z + 2)
    else:
        ax.text(x + w/2 + 0.05, y + h/2, title, ha='center', va='center',
                fontsize=title_size, color=border, weight='bold', zorder=z + 2)
    if badge:
        bw = max(0.11 * len(badge) + 0.24, 0.44)
        bx = x + w - bw - 0.12
        ax.add_patch(FancyBboxPatch((bx, y + h - 0.34), bw, 0.26,
                     boxstyle="round,pad=0.02,rounding_size=0.1",
                     linewidth=0, facecolor=accent, zorder=z + 2))
        ax.text(bx + bw/2, y + h - 0.21, badge, ha='center', va='center',
                fontsize=7.5, color="white", weight='bold', zorder=z + 3)
    return {"x": x, "y": y, "w": w, "h": h,
            "cx": x + w/2, "cy": y + h/2,
            "top": (x + w/2, y + h), "bot": (x + w/2, y),
            "left": (x, y + h/2), "right": (x + w, y + h/2)}

def _anchor(n, side):
    return n[side]

def link(a, side_a, b, side_b, color=INK_SOFT, lw=1.6, curve=0.0,
         dashed=False, label=None, label_pos=0.5, label_offset=(0, 0.2),
         head="-|>"):
    """
    Conexao entre dois nos.
      side_a / side_b : 'top' | 'bot' | 'left' | 'right'
      dashed=False -> trafego sincrono (solida)
      dashed=True  -> async / replicacao (tracejada)
      label -> porta/protocolo em badge (ex.: ":443 https", ":5432", "replica")
    """
    (x1, y1) = _anchor(a, side_a)
    (x2, y2) = _anchor(b, side_b)
    ls = (0, (5, 3)) if dashed else 'solid'
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2),
                 arrowstyle=head, mutation_scale=14,
                 color=color, linewidth=lw,
                 connectionstyle=f"arc3,rad={curve}",
                 linestyle=ls, zorder=5))
    if label:
        mx = x1 + (x2 - x1) * label_pos + label_offset[0]
        my = y1 + (y2 - y1) * label_pos + label_offset[1]
        ax.text(mx, my, label, fontsize=8, color=color, ha='center', va='center',
                style='italic', zorder=6,
                bbox=dict(boxstyle="round,pad=0.18", facecolor=BG_TOP,
                          edgecolor='none', alpha=0.88))

def legend(x, y, w, h, items, title="Tipos de recurso"):
    shadow(x, y, w, h)
    ax.add_patch(FancyBboxPatch((x, y), w, h,
                 boxstyle="round,pad=0.04,rounding_size=0.18",
                 linewidth=1.0, edgecolor=LINE,
                 facecolor="white" if THEME == "light" else "#24283b", zorder=6))
    ax.text(x + w/2, y + h - 0.24, title,
            ha='center', fontsize=10, color=INK, weight='bold', zorder=7)
    for i, (lbl, c) in enumerate(items):
        col = i % 2
        row = i // 2
        cx = x + 0.25 + col * (w/2 - 0.05)
        cy = y + h - 0.58 - row * 0.24
        ax.add_patch(Rectangle((cx, cy), 0.18, 0.14, facecolor=c, edgecolor=c, zorder=7))
        ax.text(cx + 0.26, cy + 0.07, lbl, fontsize=8.2, color=INK_SOFT,
                va='center', zorder=7)

def title(text, subtitle=None, info=None):
    ax.text(W/2, H - 0.55, text, ha='center', fontsize=28, color=INK, weight='bold')
    if subtitle:
        ax.text(W/2, H - 1.05, subtitle, ha='center', fontsize=12,
                color=INK_SOFT, style='italic')
    ax.add_patch(Rectangle((W/2 - 1.2, H - 1.25), 2.4, 0.04,
                            facecolor=COL_COMPUTE[2], edgecolor='none', zorder=2))
    if info:
        ax.text(W/2, H - 1.62, info, ha='center', fontsize=10, color=INK_MUTED)

# ============================================================
#  EXEMPLO FUNCIONAL  (substitua pela sua topologia)
#  internet -> ALB (public subnet) -> ECS service (private subnet)
#           -> RDS primary + replica + ElastiCache (private subnet)
#  tudo dentro de uma VPC numa regiao AWS.
# ============================================================
title(
    "Topologia de Deployment  -  AWS",
    "Regiao us-east-1  -  VPC single-AZ  -  ALB + ECS Fargate + RDS + ElastiCache",
    "public subnet   |   private subnet   |   trafego sincrono   |   replicacao async",
)

# --- Zonas aninhadas: regiao > VPC > subnets ---
zone(0.8, 0.8, 15.4, 11.4, "AWS region", ZONE_REGION, cidr="us-east-1", z=1.4)
zone(1.3, 1.2, 14.4, 9.9,  "VPC",        ZONE_VPC,    cidr="10.0.0.0/16", z=1.6)
zone(1.7, 8.0, 13.6, 2.6,  "public subnet",  ZONE_PUB,  cidr="10.0.1.0/24", z=1.8)
zone(1.7, 1.6, 13.6, 5.9,  "private subnet", ZONE_PRIV, cidr="10.0.10.0/24", z=1.8)

# --- Nos externos (fora da VPC) ---
n_net = node(17.0, 9.2, 4.0, 1.15, "Internet", "usuarios / clientes",
             COL_EXT, badge="public")
n_s3  = node(17.0, 6.0, 4.0, 1.15, "S3", "assets / uploads estaticos",
             COL_STORE)
n_obs = node(17.0, 3.4, 4.0, 1.15, "CloudWatch", "logs / metricas / alarmes",
             COL_OBS)

# --- Public subnet: edge / load balancer ---
n_alb = node(6.6, 8.6, 4.2, 1.35, "ALB", "application load balancer",
             COL_EDGE, badge="Multi-AZ")

# --- Private subnet: compute + service ---
n_ecs = node(6.4, 5.4, 4.6, 1.5, "ECS Fargate", "api service (containers)",
             COL_SERVICE, badge="x3")

# --- Private subnet: data layer ---
n_rds_p = node(2.3, 2.1, 3.8, 1.35, "RDS primary", "PostgreSQL 16 (writer)",
               COL_DATA)
n_rds_r = node(6.6, 2.1, 3.8, 1.35, "RDS replica", "PostgreSQL (reader)",
               COL_DATA, badge="RO")
n_cache = node(10.9, 2.1, 4.1, 1.35, "ElastiCache", "Redis (cache / sessao)",
               COL_DATA)

# ============================================================
#  CONEXOES  (porta/protocolo no label; solida=sync, tracejada=async)
# ============================================================
link(n_net, "left", n_alb, "top",   color=COL_EDGE[1],    lw=2.0, curve=-0.12,
     label=":443 https", label_pos=0.55, label_offset=(-0.2, 0.25))
link(n_alb, "bot", n_ecs, "top",     color=COL_SERVICE[1], lw=2.0, curve=0.0,
     label=":8080 http", label_offset=(0.55, 0.0))
link(n_ecs, "bot", n_rds_p, "top",   color=COL_DATA[1],    lw=1.8, curve=-0.15,
     label=":5432 sql", label_pos=0.5, label_offset=(-0.35, 0.15))
link(n_ecs, "bot", n_cache, "top",   color=COL_DATA[1],    lw=1.8, curve=0.15,
     label=":6379 redis", label_pos=0.5, label_offset=(0.45, 0.15))
link(n_rds_p, "right", n_rds_r, "left", color=COL_DATA[1], lw=1.6, curve=0.0,
     dashed=True, label="replica async", label_offset=(0, 0.22))
link(n_ecs, "right", n_s3, "left",   color=COL_STORE[1],   lw=1.5, curve=0.1,
     label=":443 s3", label_pos=0.5, label_offset=(0, 0.22))
link(n_ecs, "right", n_obs, "left",  color=COL_OBS[1],     lw=1.3, curve=-0.18,
     dashed=True, label="logs / metrics", label_pos=0.55, label_offset=(0.1, -0.2))

# ============================================================
#  LEGENDA
# ============================================================
legend(17.0, 0.9, 4.0, 1.95, [
    ("Edge / LB",       COL_EDGE[2]),
    ("Compute",         COL_COMPUTE[2]),
    ("Service / app",   COL_SERVICE[2]),
    ("DB / cache",      COL_DATA[2]),
    ("Storage",         COL_STORE[2]),
    ("Fila / evento",   COL_QUEUE[2]),
    ("Externo",         COL_EXT[2]),
    ("Observabilidade", COL_OBS[2]),
], title="Tipos de recurso")

# ============================================================
#  SALVAR
# ============================================================
os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
plt.savefig(OUT, dpi=DPI, facecolor=BG_TOP, bbox_inches='tight')
print(f"OK -> {OUT}")
