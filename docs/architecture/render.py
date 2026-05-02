"""
Diagrama de arquitetura do agents-hub-claude.
Foco: fluxo de distribuicao (contributor -> CI -> repo -> ahc -> dev machine -> Claude Code).
Memoria do projeto fica em diagrama separado.
"""
import os
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle
from matplotlib import rcParams

rcParams['font.family'] = ['Helvetica Neue', 'Helvetica', 'Arial', 'DejaVu Sans']

W, H = 24, 13.5
DPI = 200
OUT = os.path.expanduser("~/repo/ems/agents-claude/docs/architecture/agents-hub-claude.png")

BG_TOP, BG_BOT = "#f4f6fb", "#e6eaf3"
INK, INK_SOFT, INK_MUTED = "#0f172a", "#475569", "#94a3b8"
LINE = "#cbd5e1"

COL_HUMAN = ("#eef2ff", "#3730a3", "#4338ca")
COL_GIT   = ("#ecfeff", "#0e7490", "#0891b2")
COL_CI    = ("#fff7ed", "#b45309", "#d97706")
COL_CLI   = ("#ecfdf5", "#047857", "#10b981")
COL_DATA  = ("#fdf4ff", "#86198f", "#a21caf")
COL_USER  = ("#faf5ff", "#6b21a8", "#9333ea")
COL_LOCAL = ("#fef2f2", "#b91c1c", "#dc2626")

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

for i in range(200):
    t = i / 199
    c = _mix(BG_TOP, BG_BOT, t)
    ax.add_patch(Rectangle((0, H * (1 - (i+1)/200)), W, H/200,
                            facecolor=c, edgecolor='none', zorder=0))

def shadow(x, y, w, h, off=0.07, alpha=0.10, radius=0.18):
    s = FancyBboxPatch((x + off, y - off), w, h,
                       boxstyle=f"round,pad=0.02,rounding_size={radius}",
                       linewidth=0, facecolor="#0f172a", alpha=alpha, zorder=1)
    ax.add_patch(s)

def card(x, y, w, h, title, subtitle=None, palette=COL_GIT,
         title_size=11, sub_size=8.5):
    bg, border, accent = palette
    shadow(x, y, w, h)
    body = FancyBboxPatch((x, y), w, h,
                          boxstyle="round,pad=0.02,rounding_size=0.18",
                          linewidth=1.0, edgecolor=border, facecolor=bg, zorder=2)
    ax.add_patch(body)
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
    rect = FancyBboxPatch((x, y), w, h,
                          boxstyle="round,pad=0.04,rounding_size=0.22",
                          linewidth=1.2, edgecolor=color, facecolor='none',
                          linestyle=(0, (6, 4)), zorder=1.5)
    ax.add_patch(rect)
    pill_w = max(0.18 * len(label) + 0.4, 1.8)
    pill = FancyBboxPatch((x + 0.3, y + h - 0.32), pill_w, 0.42,
                          boxstyle="round,pad=0.02,rounding_size=0.2",
                          linewidth=0, facecolor=color, zorder=2)
    ax.add_patch(pill)
    ax.text(x + 0.3 + pill_w/2, y + h - 0.11, label, ha='center', va='center',
            fontsize=9.5, color="white", weight='bold', zorder=3)

def arrow(x1, y1, x2, y2, color=INK_SOFT, lw=1.4, style="-|>", curve=0.0,
          dashed=False, label=None, label_pos=0.5, label_offset=(0, 0.20)):
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
        ax.text(mx, my, label, fontsize=8.5, color=color, ha='center', va='center',
                style='italic', zorder=6,
                bbox=dict(boxstyle="round,pad=0.20", facecolor=BG_TOP,
                          edgecolor='none', alpha=0.92))

def legend(x, y, w, h, items, title="Camadas"):
    shadow(x, y, w, h)
    box = FancyBboxPatch((x, y), w, h,
                          boxstyle="round,pad=0.04,rounding_size=0.18",
                          linewidth=1.0, edgecolor=LINE,
                          facecolor="white", zorder=2)
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
    ax.add_patch(Rectangle((W/2 - 1.4, H - 1.25), 2.8, 0.04,
                            facecolor=COL_GIT[2], edgecolor='none', zorder=2))
    if info:
        ax.text(W/2, H - 1.65, info,
                ha='center', fontsize=10, color=INK_MUTED)

# ============================================================
title(
    "agents-hub-claude",
    "Squad de IA distribuida via ahc - 14 agents, 14 commands, 4 skills",
    "Contributor -> GitHub (source of truth) -> CI gates -> ahc sync -> ~/.claude/ -> Claude Code",
)

# ============================================================
#  PARTE 1 - GitHub side (parte de cima)
# ============================================================

# Contributor
card(0.6, H - 3.4, 3.2, 0.95, "Contributor", "edita agents/commands/skills", COL_HUMAN)

# Source of truth (GitHub)
section(4.6, H - 6.1, 11.5, 4.2, "EMS-NCTECH/agents-hub-claude  -  GitHub (main)", COL_GIT[2])

card(4.95, H - 3.6, 2.5, 1.2, "agents/", "14 .md\nfrontmatter typed", COL_GIT, 11, 8)
card(7.55, H - 3.6, 2.5, 1.2, "commands/", "14 slash commands\n/<nome>", COL_GIT, 11, 8)
card(10.15, H - 3.6, 2.5, 1.2, "skills/", "4 skills, multi-arquivo\nSKILL.md + auxiliares", COL_GIT, 11, 8)
card(12.75, H - 3.6, 3.2, 1.2, "manifest.json", "version + sha256 por\nitem (e por arquivo em skills)", COL_DATA, 11, 8)

card(4.95, H - 5.7, 5.4, 0.95, "scripts/regen-manifest.js", "scan + sha + bump + add/remove", COL_CI, 10.5, 8.5)
card(10.55, H - 5.7, 5.4, 0.95, "scripts/validate-artifacts.js", "frontmatter + sha + orphan + nomes", COL_CI, 10.5, 8.5)

# CI Actions (direita)
section(16.6, H - 6.1, 6.8, 4.2, "GitHub Actions", COL_CI[2])

card(16.95, H - 3.6, 6.1, 1.2, "regen-manifest.yml",
     "PR: --check (falha em drift)\npush main: regen + auto-commit", COL_CI, 11, 8)
card(16.95, H - 5.7, 6.1, 0.95, "test.yml",
     "validator + node --test (31 tests)", COL_CI, 11, 8)

# ============================================================
#  PARTE 2 - Distribuicao
# ============================================================
card(0.6, H - 7.4, 4.0, 1.0, "ahc sync", "git clone --depth=1\nverify sha256 por arquivo", COL_CLI, 11.5, 8.5)

# ============================================================
#  PARTE 3 - Dev machine (parte de baixo)
# ============================================================
section(0.5, 0.5, 23.0, 5.3, "Dev machine - macOS / WSL2 / Git Bash", COL_LOCAL[2])

# Linha 1 - Claude Code + ahc + config + lock
card(0.95, 4.5, 5.2, 1.05, "Claude Code", "abre sessao\n-> SessionStart hook", COL_USER, 11, 8.5)
card(6.35, 4.5, 5.0, 1.05, "~/.local/bin/ahc", "Node CLI - zero-deps\nsync | list | pin | config", COL_CLI, 11, 8.5)
card(11.55, 4.5, 5.6, 1.05, "~/.claude/.ahc-config.json", "repo + branch + channel", COL_DATA, 11, 8.5)
card(17.35, 4.5, 6.0, 1.05, "~/.claude/.ahc-lock.json", "versao instalada por item\n+ sha + pins", COL_DATA, 11, 8.5)

# Linha 2 - Pasta de instalacao (3 categorias)
card(0.95, 1.0, 7.3, 3.0, "~/.claude/agents/*.md",
     "14 agents instalados\n(stack: Go, .NET, React, Python, Node,\n"
     "Postgres, AWS, integration, security,\nPO, system architect, memory keeper, QAs)", COL_LOCAL, 12, 9)
card(8.45, 1.0, 7.3, 3.0, "~/.claude/commands/*.md",
     "14 slash commands\n(orchestrators: /feature-flow,\n"
     "/bug-flow, /incident-response;\nutilitarios: /code-review, /smart-commit,\n"
     "/discovery, /tech-debt, /memory-query, ...)", COL_LOCAL, 12, 9)
card(15.95, 1.0, 7.4, 3.0, "~/.claude/skills/<nome>/",
     "4 skills (multi-arquivo cada)\narchitecture-diagram, sequence-diagram,\n"
     "er-diagram, release-notes\nauto-trigger por keywords no contexto", COL_LOCAL, 12, 9)

# ============================================================
#  SETAS
# ============================================================
# Contributor -> GitHub
arrow(2.2, H - 3.4, 5.4, H - 2.85, color=COL_GIT[2], lw=1.8, curve=-0.10,
      label="git push (PR)", label_pos=0.55, label_offset=(0, 0.25))

# GitHub side -> CI Actions
arrow(15.9, H - 4.0, 16.9, H - 4.0, color=COL_CI[2], lw=1.8,
      label="on PR / push", label_pos=0.5, label_offset=(0, 0.25))

# CI -> manifest auto-commit (loop back)
arrow(20.0, H - 5.7, 14.4, H - 4.4, color=COL_CI[2], lw=1.4, curve=0.30, dashed=True,
      label="auto-commit manifest (only on push to main)", label_pos=0.55, label_offset=(1.0, 0.30))

# GitHub -> ahc sync (descendo)
arrow(5.0, H - 6.1, 2.6, H - 7.6 + 1.0, color=COL_CLI[2], lw=2.0, curve=-0.20,
      label="git clone + read manifest", label_pos=0.55, label_offset=(0.4, 0.25))

# Claude Code SessionStart -> ahc sync
arrow(2.6, 4.5, 2.6, H - 7.4 + 1.0 + 0.05, color=COL_USER[2], lw=1.8,
      label="SessionStart hook (timeout 5s)", label_pos=0.5, label_offset=(2.0, 0.0))

# ahc sync -> grava 3 categorias (3 setas)
arrow(2.6, H - 7.4, 4.6, 4.05, color=COL_LOCAL[2], lw=1.6, curve=-0.20,
      label="sha verify + write", label_pos=0.55, label_offset=(0.6, 0.25))
arrow(3.5, H - 7.4, 12.1, 4.05, color=COL_LOCAL[2], lw=1.4, curve=-0.10, dashed=True)
arrow(4.0, H - 7.4, 19.6, 4.05, color=COL_LOCAL[2], lw=1.4, curve=-0.05, dashed=True)

# ahc sync -> escreve lock
arrow(4.6, H - 6.9, 19.5, 5.55, color=COL_DATA[2], lw=1.2, curve=-0.05, dashed=True,
      label="update lock", label_pos=0.5, label_offset=(0.5, 0.20))

# Pasta de instalacao -> Claude Code (consumo na sessao)
arrow(4.6, 4.0, 3.4, 4.5, color=COL_USER[2], lw=1.2, curve=-0.10, dashed=True,
      label="lido na sessao", label_pos=0.5, label_offset=(-0.5, 0.20))

# ============================================================
#  LEGENDA - canto inferior esquerdo (acima do contributor estamos sem espaco)
# ============================================================
legend(0.6, H - 6.1, 3.4, 2.4, [
    ("Contributor",    COL_HUMAN[2]),
    ("GitHub repo",    COL_GIT[2]),
    ("CI / Actions",   COL_CI[2]),
    ("ahc CLI",        COL_CLI[2]),
    ("manifest/lock",  COL_DATA[2]),
    ("Claude Code",    COL_USER[2]),
    ("~/.claude",      COL_LOCAL[2]),
])

# ============================================================
os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
plt.savefig(OUT, dpi=DPI, facecolor=BG_TOP, bbox_inches='tight')
print(f"OK -> {OUT}")
