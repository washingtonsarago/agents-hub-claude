"""
Gera a apresentacao executiva do agents-hub-claude em .pptx
Paleta inspirada no Grupo NC (azuis corporativos / farmaceutico) em tom claro.
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from lxml import etree
from pathlib import Path

# ---------- Paleta Grupo NC (light blue corporate) ----------
NAVY        = RGBColor(0x0A, 0x2A, 0x5E)   # titulos
PRIMARY     = RGBColor(0x1E, 0x5B, 0xB8)   # azul principal
MID_BLUE    = RGBColor(0x3D, 0x7DD6, 0xEE) if False else RGBColor(0x4A, 0x90, 0xE2)
SKY         = RGBColor(0x7C, 0xB6, 0xE8)
TINT        = RGBColor(0xEA, 0xF2, 0xFB)   # card bg
TINT_2      = RGBColor(0xF1, 0xF6, 0xFC)
BG          = RGBColor(0xF7, 0xFA, 0xFD)
WHITE       = RGBColor(0xFF, 0xFF, 0xFF)
TEXT        = RGBColor(0x1A, 0x22, 0x36)
MUTED       = RGBColor(0x5C, 0x6B, 0x82)
RULE        = RGBColor(0xD6, 0xE2, 0xF2)
TEAL        = RGBColor(0x16, 0xA0, 0x85)
GOLD        = RGBColor(0xE8, 0x9C, 0x2E)

SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)

prs = Presentation()
prs.slide_width = SLIDE_W
prs.slide_height = SLIDE_H

BLANK = prs.slide_layouts[6]


# ---------- helpers ----------
def add_rect(slide, x, y, w, h, fill, line=None, shadow=False, corner=False):
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE if corner else MSO_SHAPE.RECTANGLE, x, y, w, h
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    if line is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = line
        shape.line.width = Pt(0.75)
    if not shadow:
        # disable default shadow
        sp = shape.shadow
        sp.inherit = False
    if corner:
        # set adjustment to soft corner
        shape.adjustments[0] = 0.08
    shape.text_frame.margin_left = Inches(0)
    shape.text_frame.margin_right = Inches(0)
    shape.text_frame.margin_top = Inches(0)
    shape.text_frame.margin_bottom = Inches(0)
    return shape


def add_text(slide, x, y, w, h, text, *, size=14, bold=False, color=TEXT,
             align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, font="Calibri",
             line_spacing=1.15):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0)
    tf.margin_right = Inches(0)
    tf.margin_top = Inches(0)
    tf.margin_bottom = Inches(0)
    tf.vertical_anchor = anchor
    lines = text.split("\n") if isinstance(text, str) else text
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line_spacing
        run = p.add_run()
        run.text = line
        run.font.name = font
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
    return tb


def add_runs(slide, x, y, w, h, runs, *, align=PP_ALIGN.LEFT,
             anchor=MSO_ANCHOR.TOP, line_spacing=1.2):
    """runs: list of (text, dict(size, bold, color, font))"""
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0); tf.margin_right = Inches(0)
    tf.margin_top = Inches(0); tf.margin_bottom = Inches(0)
    tf.vertical_anchor = anchor
    p = tf.paragraphs[0]
    p.alignment = align
    p.line_spacing = line_spacing
    for text, opts in runs:
        if text == "\n":
            p = tf.add_paragraph()
            p.alignment = align
            p.line_spacing = line_spacing
            continue
        r = p.add_run()
        r.text = text
        r.font.name = opts.get("font", "Calibri")
        r.font.size = Pt(opts.get("size", 14))
        r.font.bold = opts.get("bold", False)
        r.font.color.rgb = opts.get("color", TEXT)
    return tb


def add_circle(slide, cx, cy, r, fill, alpha=None):
    x = cx - r // 2
    y = cy - r // 2
    shape = slide.shapes.add_shape(MSO_SHAPE.OVAL, x, y, r, r)
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.fill.background()
    if alpha is not None:
        # set alpha on the solidFill
        spPr = shape.fill._xPr
        sf = spPr.find(qn('a:solidFill'))
        if sf is not None:
            srgb = sf.find(qn('a:srgbClr'))
            if srgb is not None:
                a = etree.SubElement(srgb, qn('a:alpha'))
                a.set('val', str(int(alpha * 100000)))
    return shape


def set_slide_bg(slide, color=BG):
    bg = slide.background
    bg.fill.solid()
    bg.fill.fore_color.rgb = color


def add_decoration_corner(slide, palette="primary"):
    """elemento decorativo no canto superior direito de cada slide de conteudo"""
    # arco de circulos no canto
    add_circle(slide, SLIDE_W - Inches(0.4), Inches(0.4), Inches(2.0), TINT)
    add_circle(slide, SLIDE_W - Inches(0.2), Inches(0.6), Inches(0.9), SKY)


def add_footer(slide, idx, total, section=""):
    # rodape minimalista
    add_rect(slide, Inches(0.6), SLIDE_H - Inches(0.55),
             SLIDE_W - Inches(1.2), Emu(9525), RULE)  # 1pt rule
    add_text(slide, Inches(0.6), SLIDE_H - Inches(0.42),
             Inches(6), Inches(0.3),
             "agents-hub-claude   ·   EMS-NCTECH",
             size=9, color=MUTED)
    add_text(slide, SLIDE_W - Inches(2.6), SLIDE_H - Inches(0.42),
             Inches(2), Inches(0.3),
             f"{idx:02d} / {total:02d}   {section}",
             size=9, color=MUTED, align=PP_ALIGN.RIGHT)


def add_slide_header(slide, kicker, title, idx):
    # kicker (eyebrow) em azul
    add_text(slide, Inches(0.6), Inches(0.5), Inches(8), Inches(0.35),
             kicker.upper(), size=10, bold=True, color=PRIMARY,
             font="Calibri")
    # numero do slide grande no canto direito
    add_text(slide, SLIDE_W - Inches(2.0), Inches(0.45),
             Inches(1.5), Inches(0.6),
             f"{idx:02d}", size=28, bold=True, color=TINT,
             align=PP_ALIGN.RIGHT, font="Calibri")
    # titulo
    add_text(slide, Inches(0.6), Inches(0.85), Inches(11.5), Inches(0.9),
             title, size=32, bold=True, color=NAVY)
    # accent rule
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.6), Inches(1.65),
                                 Inches(0.6), Pt(3))
    bar.fill.solid(); bar.fill.fore_color.rgb = PRIMARY
    bar.line.fill.background()


TOTAL = 11

# ============================================================
# SLIDE 1 — CAPA
# ============================================================
s = prs.slides.add_slide(BLANK)
set_slide_bg(s, WHITE)

# painel azul a direita ocupando ~45%
panel = add_rect(s, Inches(7.4), 0, Inches(5.93), SLIDE_H, NAVY)

# circulos decorativos no painel
add_circle(s, Inches(13.3), Inches(1.5), Inches(4.5), PRIMARY)
add_circle(s, Inches(12.5), Inches(6.0), Inches(3.2), MID_BLUE)
add_circle(s, Inches(8.0),  Inches(6.8), Inches(1.6), SKY)

# linha de marca
brand_bar = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.7), Inches(0.7),
                               Inches(0.5), Pt(4))
brand_bar.fill.solid(); brand_bar.fill.fore_color.rgb = PRIMARY
brand_bar.line.fill.background()

add_text(s, Inches(0.7), Inches(0.85), Inches(6), Inches(0.4),
         "EMS-NCTECH   ·   ENGENHARIA",
         size=11, bold=True, color=PRIMARY)

add_text(s, Inches(0.7), Inches(1.6), Inches(6.5), Inches(2.0),
         "agents-hub-claude",
         size=54, bold=True, color=NAVY)

add_text(s, Inches(0.7), Inches(3.3), Inches(6.5), Inches(1.2),
         "O time sênior virtual da engenharia,\npadronizado e auto-atualizado.",
         size=22, color=TEXT, line_spacing=1.25)

# numeros destaque
def stat(x, label, value):
    add_text(s, x, Inches(5.2), Inches(2), Inches(0.7),
             value, size=36, bold=True, color=PRIMARY)
    add_text(s, x, Inches(5.95), Inches(2), Inches(0.4),
             label, size=10, color=MUTED, bold=True)

stat(Inches(0.7), "AGENTS",   "15")
stat(Inches(2.5), "COMMANDS", "14")
stat(Inches(4.3), "SKILLS",    "4")

add_text(s, Inches(0.7), Inches(6.7), Inches(6.5), Inches(0.4),
         "Apresentação executiva   ·   2026",
         size=10, color=MUTED)

# painel direito: "claim"
add_text(s, Inches(7.9), Inches(2.6), Inches(5.0), Inches(2.5),
         "Menos tempo\nconfigurando.\nMais tempo\nentregando.",
         size=34, bold=True, color=WHITE, line_spacing=1.1)
add_text(s, Inches(7.9), Inches(5.6), Inches(5.0), Inches(0.4),
         "QUALIDADE CONSISTENTE ENTRE SQUADS",
         size=10, bold=True, color=SKY)


# ============================================================
# SLIDE 2 — O PROBLEMA
# ============================================================
s = prs.slides.add_slide(BLANK)
set_slide_bg(s, BG)
add_decoration_corner(s)
add_slide_header(s, "Contexto", "O problema que estamos resolvendo", 2)

intro = ("A engenharia já adotou Claude Code, mas o uso é fragmentado — "
         "cada dev configura agents e prompts do seu jeito.")
add_text(s, Inches(0.6), Inches(2.0), Inches(12), Inches(0.6),
         intro, size=15, color=MUTED)

# 4 cards de pain points
pains = [
    ("Inconsistência entre squads",
     "Cada dev usa prompts diferentes — qualidade de review, commit e arquitetura varia."),
    ("Boas práticas em wikis",
     "Convenções vivem em páginas esquecidas e canais de Slack. Desatualizam silenciosamente."),
    ("Onboarding lento",
     "Dev novo demora dias até produzir no mesmo padrão do time. Custo recorrente."),
    ("Drift silencioso",
     "Atualizações em prompts não chegam ao time. Ninguém sabe que versão o colega usa."),
]
card_w = Inches(2.95)
card_h = Inches(2.6)
card_y = Inches(3.0)
gap = Inches(0.15)
start_x = Inches(0.6)

for i, (h, t) in enumerate(pains):
    x = start_x + (card_w + gap) * i
    add_rect(s, x, card_y, card_w, card_h, WHITE, corner=True)
    # accent bar topo
    bar = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, x + Inches(0.25),
                             card_y + Inches(0.25), Inches(0.4), Pt(3))
    bar.fill.solid(); bar.fill.fore_color.rgb = PRIMARY
    bar.line.fill.background()
    # numero
    add_text(s, x + Inches(0.25), card_y + Inches(0.4),
             card_w - Inches(0.5), Inches(0.4),
             f"0{i+1}", size=14, bold=True, color=SKY)
    add_text(s, x + Inches(0.25), card_y + Inches(0.85),
             card_w - Inches(0.5), Inches(0.6),
             h, size=15, bold=True, color=NAVY, line_spacing=1.15)
    add_text(s, x + Inches(0.25), card_y + Inches(1.5),
             card_w - Inches(0.5), Inches(1.0),
             t, size=11, color=MUTED, line_spacing=1.3)

# rodape com custo
add_text(s, Inches(0.6), Inches(6.0), Inches(12), Inches(0.4),
         "Custo: retrabalho · revisões inconsistentes · débito técnico invisível · ramp-up alto.",
         size=12, bold=True, color=PRIMARY)

add_footer(s, 2, TOTAL, "PROBLEMA")


# ============================================================
# SLIDE 3 — A SOLUCAO
# ============================================================
s = prs.slides.add_slide(BLANK)
set_slide_bg(s, BG)
add_decoration_corner(s)
add_slide_header(s, "Solução", "Registry central + sync automático", 3)

add_text(s, Inches(0.6), Inches(2.0), Inches(7.5), Inches(0.6),
         "Um repositório com toda a inteligência. Uma CLI que sincroniza a cada sessão.",
         size=15, color=MUTED, line_spacing=1.3)

# fluxo vertical (5 passos)
steps = [
    ("Engenheiro abre Claude Code",
     "Hook SessionStart dispara o sync — sem interação manual."),
    ("`ahc` compara manifest × lock",
     "CLI lê o manifest remoto e confronta com o lock local (sha256)."),
    ("Baixa só o que mudou",
     "Idempotente. Resiliente offline. Verificação por hash."),
    ("Instala em ~/.claude/",
     "Agents, commands e skills disponíveis para o Claude Code."),
    ("Time sênior virtual atualizado",
     "Boas práticas chegam ao dev sem comunicado, sem treinamento."),
]
sx = Inches(0.6); sy = Inches(2.7)
sw = Inches(7.4); sh = Inches(0.65); sgap = Inches(0.15)

for i, (h, t) in enumerate(steps):
    y = sy + (sh + sgap) * i
    # bullet circle
    cx = sx + Inches(0.35); cy = y + Inches(0.32)
    bullet = s.shapes.add_shape(MSO_SHAPE.OVAL,
                                sx, y + Inches(0.05),
                                Inches(0.55), Inches(0.55))
    bullet.fill.solid(); bullet.fill.fore_color.rgb = PRIMARY
    bullet.line.fill.background()
    add_text(s, sx, y + Inches(0.08), Inches(0.55), Inches(0.55),
             str(i+1), size=14, bold=True, color=WHITE,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    # texto
    add_text(s, sx + Inches(0.85), y, Inches(6.6), Inches(0.35),
             h, size=13, bold=True, color=NAVY)
    add_text(s, sx + Inches(0.85), y + Inches(0.32), Inches(6.6), Inches(0.35),
             t, size=10, color=MUTED, line_spacing=1.25)

# painel direito: principios
right_x = Inches(8.6); right_w = Inches(4.1)
add_rect(s, right_x, Inches(2.5), right_w, Inches(4.0), TINT, corner=True)
add_text(s, right_x + Inches(0.35), Inches(2.75), right_w - Inches(0.7),
         Inches(0.4), "PRINCÍPIOS", size=10, bold=True, color=PRIMARY)
principles = [
    ("Zero-deps",       "CLI Node puro. Sem cadeia de deps."),
    ("Idempotente",     "Só baixa se mudou. Verificável."),
    ("Fail-silent",     "Offline não bloqueia a sessão."),
    ("Integridade",     "sha256 por arquivo no manifest."),
    ("Reversível",      "Pin de versão para rollback."),
    ("Auditável",       "Versão em uso é rastreável."),
]
py = Inches(3.2)
for h, t in principles:
    add_text(s, right_x + Inches(0.35), py, right_w - Inches(0.7),
             Inches(0.3), h, size=12, bold=True, color=NAVY)
    add_text(s, right_x + Inches(0.35), py + Inches(0.28),
             right_w - Inches(0.7), Inches(0.3),
             t, size=9.5, color=MUTED)
    py += Inches(0.55)

add_footer(s, 3, TOTAL, "SOLUÇÃO")


# ============================================================
# SLIDE 4 — BENEFICIOS PARA O NEGOCIO
# ============================================================
s = prs.slides.add_slide(BLANK)
set_slide_bg(s, BG)
add_decoration_corner(s)
add_slide_header(s, "Valor", "Benefícios para o negócio", 4)

# bento grid 3x2 + 1 destaque a direita
benefits = [
    ("Padronização instantânea",
     "Mesmo arsenal em todas as squads. Reviews, commits e arquitetura no mesmo critério."),
    ("Onboarding em horas",
     "Dev novo roda install.sh e entra com o time sênior virtual. Ramp-up cai de dias para horas."),
    ("Boas práticas como código",
     "ADRs, checklists e fluxos de discovery versionados no Git — não em wiki esquecida."),
    ("Atualização zero-toque",
     "Melhoria publicada chega a todos no próximo SessionStart. Sem comunicado."),
    ("Rastreabilidade total",
     "manifest.json com sha256 por arquivo. Auditoria responde 'qual versão estava em uso'."),
    ("Foco no problema",
     "Dev não escolhe prompt. Aciona o agent certo. Tempo cognitivo volta para o negócio."),
]

cw = Inches(3.95); ch = Inches(1.75); cgap = Inches(0.15)
cx0 = Inches(0.6); cy0 = Inches(2.0)

for i, (h, t) in enumerate(benefits):
    col = i % 3; row = i // 3
    x = cx0 + (cw + cgap) * col
    y = cy0 + (ch + cgap) * row
    add_rect(s, x, y, cw, ch, WHITE, corner=True)
    # icone (quadrado azul claro)
    add_rect(s, x + Inches(0.3), y + Inches(0.3),
             Inches(0.45), Inches(0.45), TINT, corner=True)
    dot = s.shapes.add_shape(MSO_SHAPE.OVAL, x + Inches(0.45),
                             y + Inches(0.42), Inches(0.18), Inches(0.18))
    dot.fill.solid(); dot.fill.fore_color.rgb = PRIMARY
    dot.line.fill.background()
    add_text(s, x + Inches(0.95), y + Inches(0.32),
             cw - Inches(1.2), Inches(0.4),
             h, size=13.5, bold=True, color=NAVY)
    add_text(s, x + Inches(0.3), y + Inches(0.95),
             cw - Inches(0.6), Inches(0.8),
             t, size=10.5, color=MUTED, line_spacing=1.3)

# faixa destaque
add_rect(s, Inches(0.6), Inches(5.85), Inches(12.13), Inches(0.85),
         NAVY, corner=True)
add_text(s, Inches(0.95), Inches(5.95), Inches(11.5), Inches(0.4),
         "RESULTADO", size=10, bold=True, color=SKY)
add_text(s, Inches(0.95), Inches(6.25), Inches(11.5), Inches(0.5),
         "Qualidade consistente entre squads, sem custo de manutenção por dev.",
         size=14, bold=True, color=WHITE)

add_footer(s, 4, TOTAL, "BENEFÍCIOS")


# ============================================================
# SLIDE 5 — BENEFICIOS PARA A ENGENHARIA
# ============================================================
s = prs.slides.add_slide(BLANK)
set_slide_bg(s, BG)
add_decoration_corner(s)
add_slide_header(s, "Engenharia", "O dia-a-dia que muda", 5)

eng_items = [
    ("/code-review",   "Revisão padronizada — security, correctness, performance, testing."),
    ("/smart-commit",  "Commits convencionais alinhados ao diff. Type/scope corretos."),
    ("/discovery",     "Problem framing, JTBD, assumptions e go/no-go estruturado."),
    ("/arch-design",   "C4 + ADRs com análise de trade-offs no padrão do hub."),
    ("/bug-flow",      "Triage → RCA → fix + regressão → security gate → commit."),
    ("/feature-flow",  "PO → Arquiteto → Dev → QA → Security → Review → Commit."),
    ("/incident-response", "Detect → mitigate → RCA → postmortem blameless."),
    ("Memória do projeto", "business / architecture / guidelines mantidos pelo agent dedicado."),
]

ix0 = Inches(0.6); iy0 = Inches(2.0)
iw = Inches(6.0); ih = Inches(0.95); igap = Inches(0.12)

for i, (cmd, desc) in enumerate(eng_items):
    col = i % 2; row = i // 2
    x = ix0 + (iw + Inches(0.15)) * col
    y = iy0 + (ih + igap) * row
    add_rect(s, x, y, iw, ih, WHITE, corner=True)
    # tag azul a esquerda
    tag = s.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                             x, y, Pt(3), ih)
    tag.fill.solid(); tag.fill.fore_color.rgb = PRIMARY
    tag.line.fill.background()
    add_text(s, x + Inches(0.3), y + Inches(0.18),
             iw - Inches(0.5), Inches(0.35),
             cmd, size=13, bold=True, color=PRIMARY,
             font="Consolas")
    add_text(s, x + Inches(0.3), y + Inches(0.5),
             iw - Inches(0.5), Inches(0.45),
             desc, size=10.5, color=TEXT, line_spacing=1.25)

# CI gate destaque
add_text(s, Inches(0.6), Inches(6.6), Inches(12), Inches(0.4),
         "+ validação por CI: regen-manifest --check  +  31 testes de integração impedem conteúdo quebrado de chegar ao dev.",
         size=11, color=MUTED, bold=True)

add_footer(s, 5, TOTAL, "ENGENHARIA")


# ============================================================
# SLIDE 6 — AGENTS (15)
# ============================================================
s = prs.slides.add_slide(BLANK)
set_slide_bg(s, BG)
add_decoration_corner(s)
add_slide_header(s, "Pincelada nos agents", "15 especialistas virtuais", 6)

add_text(s, Inches(0.6), Inches(2.0), Inches(12), Inches(0.45),
         "Cada agent carrega missão, anti-patterns e protocolo próprios. O dev descreve a tarefa; o agent certo é acionado.",
         size=12, color=MUTED, line_spacing=1.3)

# 5 colunas de domínio
domains = [
    ("Backend & Plataforma", PRIMARY, [
        "go-senior-engineer",
        "go-sdet-backend",
        "dotnet-backend-architect",
        "nodejs-backend-architect",
        "python-engineer",
    ]),
    ("Dados & Integração", MID_BLUE, [
        "postgres-dba",
        "integration-architect",
    ]),
    ("Frontend & QA", TEAL, [
        "senior-react-developer",
        "cypress-qa-analyst",
    ]),
    ("Arquitetura, Segurança & Infra", NAVY, [
        "system-architect",
        "security-specialist",
        "aws-devops-engineer",
    ]),
    ("Produto & Memória", GOLD, [
        "senior-product-owner",
        "senior-product-designer",
        "project-memory-keeper",
    ]),
]

dx0 = Inches(0.6); dy0 = Inches(2.8)
dw = Inches(2.42); dh = Inches(3.6); dgap = Inches(0.1)

for i, (name, color, agents) in enumerate(domains):
    x = dx0 + (dw + dgap) * i
    add_rect(s, x, dy0, dw, dh, WHITE, corner=True)
    # accent top bar
    bar = s.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                             x, dy0, dw, Pt(4))
    bar.fill.solid(); bar.fill.fore_color.rgb = color
    bar.line.fill.background()
    add_text(s, x + Inches(0.25), dy0 + Inches(0.2),
             dw - Inches(0.5), Inches(0.6),
             name, size=11, bold=True, color=NAVY, line_spacing=1.2)
    # agents list
    py = dy0 + Inches(0.95)
    for ag in agents:
        # bullet
        b = s.shapes.add_shape(MSO_SHAPE.OVAL,
                               x + Inches(0.25), py + Inches(0.1),
                               Inches(0.1), Inches(0.1))
        b.fill.solid(); b.fill.fore_color.rgb = color
        b.line.fill.background()
        add_text(s, x + Inches(0.45), py,
                 dw - Inches(0.6), Inches(0.3),
                 ag, size=10, color=TEXT, font="Consolas")
        py += Inches(0.32)

add_text(s, Inches(0.6), Inches(6.6), Inches(12), Inches(0.4),
         "Como o dev usa: descreve a tarefa em linguagem natural — o agent certo é acionado e devolve no padrão do hub.",
         size=11, color=MUTED, line_spacing=1.3, bold=False)

add_footer(s, 6, TOTAL, "AGENTS")


# ============================================================
# SLIDE 7 — COMMANDS & SKILLS
# ============================================================
s = prs.slides.add_slide(BLANK)
set_slide_bg(s, BG)
add_decoration_corner(s)
add_slide_header(s, "Orquestração", "Commands & Skills", 7)

# COMMANDS (esquerda)
add_text(s, Inches(0.6), Inches(2.0), Inches(6), Inches(0.5),
         "14 SLASH COMMANDS", size=11, bold=True, color=PRIMARY)
add_text(s, Inches(0.6), Inches(2.35), Inches(6), Inches(0.5),
         "Fluxos completos disparados por um comando.",
         size=11, color=MUTED)

cmds = [
    ("/feature-flow",      "PO → Arquiteto → Dev → QA → Security → Review → Commit"),
    ("/bug-flow",          "Triage → RCA → fix + regressão → security gate"),
    ("/incident-response", "Detect → mitigate → RCA → postmortem"),
    ("/code-review",       "Security + correctness + performance + testing"),
    ("/discovery",         "JTBD, assumptions, experimentos, go/no-go"),
    ("/arch-design",       "C4 + ADRs com trade-offs"),
    ("/db-audit",          "Schema, índices, FKs, queries, segurança"),
    ("/tech-debt",         "Classifica e prioriza dívida técnica"),
    ("/api-contract  ·  /smart-commit  ·  /jira-story",
                          "/onboard-dev  ·  /bootstrap-project  ·  /memory-query"),
]

cy = Inches(2.95)
for cmd, desc in cmds:
    add_text(s, Inches(0.6), cy, Inches(3.0), Inches(0.3),
             cmd, size=10.5, bold=True, color=NAVY, font="Consolas")
    add_text(s, Inches(3.7), cy, Inches(3.5), Inches(0.3),
             desc, size=10, color=MUTED)
    cy += Inches(0.36)

# divider vertical
divider = s.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                             Inches(7.6), Inches(2.0),
                             Pt(1), Inches(4.5))
divider.fill.solid(); divider.fill.fore_color.rgb = RULE
divider.line.fill.background()

# SKILLS (direita)
add_text(s, Inches(7.9), Inches(2.0), Inches(5), Inches(0.5),
         "4 SKILLS", size=11, bold=True, color=PRIMARY)
add_text(s, Inches(7.9), Inches(2.35), Inches(5), Inches(0.5),
         "Geração de artefatos visuais e documentais.",
         size=11, color=MUTED)

skills = [
    ("architecture-diagram", "Diagramas de arquitetura PNG (estilo Linear/Vercel)."),
    ("sequence-diagram",     "Sequência UML-ish com sync/async/error."),
    ("er-diagram",           "Entity-Relationship a partir de SQL/DDL."),
    ("release-notes",        "Markdown + PDF com breaking changes, security, fixes."),
]
sy = Inches(2.95)
for name, desc in skills:
    add_rect(s, Inches(7.9), sy, Inches(4.8), Inches(0.78),
             WHITE, corner=True)
    bar = s.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                             Inches(7.9), sy, Pt(3), Inches(0.78))
    bar.fill.solid(); bar.fill.fore_color.rgb = TEAL
    bar.line.fill.background()
    add_text(s, Inches(8.15), sy + Inches(0.12), Inches(4.5), Inches(0.3),
             name, size=11, bold=True, color=NAVY, font="Consolas")
    add_text(s, Inches(8.15), sy + Inches(0.42), Inches(4.5), Inches(0.3),
             desc, size=9.5, color=MUTED)
    sy += Inches(0.86)

add_footer(s, 7, TOTAL, "ORQUESTRAÇÃO")


# ============================================================
# SLIDE 8 — GARANTIAS TECNICAS
# ============================================================
s = prs.slides.add_slide(BLANK)
set_slide_bg(s, BG)
add_decoration_corner(s)
add_slide_header(s, "Confiabilidade", "Garantias técnicas", 8)

guarantees = [
    ("Integridade",
     "sha256 por arquivo no manifest.json. Validado no install e a cada sync."),
    ("Quality gates",
     "regen-manifest --check em PR + 31 testes de integração (node:test) bloqueiam conteúdo quebrado."),
    ("Idempotência",
     "ahc sync só baixa o que mudou. Hash bate? Não baixa. Determinístico."),
    ("Resiliência",
     "Offline → fail-silent. Mantém cache local. Não bloqueia a sessão do dev."),
    ("Reversibilidade",
     "ahc pin <agent>@<versão> trava versão antiga até investigação."),
    ("Zero-deps",
     "CLI Node puro. Sem cadeia de dependências externas para auditar."),
]

gx0 = Inches(0.6); gy0 = Inches(2.1)
gw = Inches(6.0); gh = Inches(1.4); ggap_x = Inches(0.15); ggap_y = Inches(0.15)

for i, (h, t) in enumerate(guarantees):
    col = i % 2; row = i // 2
    x = gx0 + (gw + ggap_x) * col
    y = gy0 + (gh + ggap_y) * row
    add_rect(s, x, y, gw, gh, WHITE, corner=True)
    # check icon (quadrado com tick)
    add_rect(s, x + Inches(0.3), y + Inches(0.3),
             Inches(0.45), Inches(0.45), PRIMARY, corner=True)
    add_text(s, x + Inches(0.3), y + Inches(0.32),
             Inches(0.45), Inches(0.45),
             "✓", size=18, bold=True, color=WHITE,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    add_text(s, x + Inches(0.95), y + Inches(0.3),
             gw - Inches(1.2), Inches(0.4),
             h, size=14, bold=True, color=NAVY)
    add_text(s, x + Inches(0.95), y + Inches(0.7),
             gw - Inches(1.2), Inches(0.7),
             t, size=10.5, color=MUTED, line_spacing=1.3)

add_footer(s, 8, TOTAL, "CONFIABILIDADE")


# ============================================================
# SLIDE 9 — ROI
# ============================================================
s = prs.slides.add_slide(BLANK)
set_slide_bg(s, BG)
add_decoration_corner(s)
add_slide_header(s, "Resultado esperado", "ROI antes × depois", 9)

# header da tabela
hx = Inches(0.6); hy = Inches(2.1)
hw_ind = Inches(5.0); hw_col = Inches(3.55); hh = Inches(0.55)

add_rect(s, hx, hy, hw_ind, hh, NAVY, corner=True)
add_rect(s, hx + hw_ind + Inches(0.1), hy, hw_col, hh, TINT, corner=True)
add_rect(s, hx + hw_ind + hw_col + Inches(0.2), hy, hw_col, hh, PRIMARY, corner=True)

add_text(s, hx + Inches(0.3), hy, hw_ind - Inches(0.6), hh,
         "INDICADOR", size=11, bold=True, color=WHITE,
         anchor=MSO_ANCHOR.MIDDLE)
add_text(s, hx + hw_ind + Inches(0.4), hy, hw_col - Inches(0.6), hh,
         "ANTES", size=11, bold=True, color=NAVY,
         anchor=MSO_ANCHOR.MIDDLE)
add_text(s, hx + hw_ind + hw_col + Inches(0.5), hy, hw_col - Inches(0.6), hh,
         "DEPOIS", size=11, bold=True, color=WHITE,
         anchor=MSO_ANCHOR.MIDDLE)

rows = [
    ("Onboarding até produzir no padrão",
     "dias",            "horas"),
    ("Variabilidade de qualidade entre squads",
     "alta",            "baixa (mesmo arsenal)"),
    ("Tempo p/ propagar nova boa prática",
     "semanas",         "próxima sessão"),
    ("Rastreabilidade de versão em uso",
     "inexistente",     "sha256 por arquivo"),
    ("Esforço de manutenção por dev",
     "recorrente",      "zero (auto-sync)"),
]

ry = hy + hh + Inches(0.15)
rh = Inches(0.7); rgap = Inches(0.1)

for i, (ind, before, after) in enumerate(rows):
    bg_fill = WHITE if i % 2 == 0 else TINT_2
    add_rect(s, hx, ry, hw_ind, rh, bg_fill, corner=True)
    add_rect(s, hx + hw_ind + Inches(0.1), ry, hw_col, rh, bg_fill, corner=True)
    add_rect(s, hx + hw_ind + hw_col + Inches(0.2), ry, hw_col, rh,
             TINT, corner=True)
    add_text(s, hx + Inches(0.3), ry, hw_ind - Inches(0.6), rh,
             ind, size=12, color=TEXT, anchor=MSO_ANCHOR.MIDDLE)
    add_text(s, hx + hw_ind + Inches(0.4), ry, hw_col - Inches(0.6), rh,
             before, size=12, color=MUTED, anchor=MSO_ANCHOR.MIDDLE,
             align=PP_ALIGN.CENTER)
    add_text(s, hx + hw_ind + hw_col + Inches(0.5), ry, hw_col - Inches(0.6), rh,
             after, size=12, bold=True, color=PRIMARY,
             anchor=MSO_ANCHOR.MIDDLE, align=PP_ALIGN.CENTER)
    ry += rh + rgap

add_footer(s, 9, TOTAL, "ROI")


# ============================================================
# SLIDE 10 — PROXIMOS PASSOS
# ============================================================
s = prs.slides.add_slide(BLANK)
set_slide_bg(s, BG)
add_decoration_corner(s)
add_slide_header(s, "Plano", "Próximos passos", 10)

steps_n = [
    ("Adoção",
     "install.sh em todas as máquinas da engenharia.",
     "macOS / WSL / Git Bash documentados no README."),
    ("Governança",
     "PRs no hub passam por review + CI.",
     "Mudanças relevantes viram ADR no próprio repo."),
    ("Roadmap",
     "Iniciativas futuras, decisões pendentes e fora de escopo.",
     "Ver docs/ROADMAP.md."),
    ("Métricas",
     "Instrumentar uso de commands/agents por squad.",
     "Priorizar evoluções com dado, não palpite."),
]

px0 = Inches(0.6); py0 = Inches(2.1)
pw = Inches(6.05); ph = Inches(2.15); pgap_x = Inches(0.15); pgap_y = Inches(0.15)

for i, (h, t1, t2) in enumerate(steps_n):
    col = i % 2; row = i // 2
    x = px0 + (pw + pgap_x) * col
    y = py0 + (ph + pgap_y) * row
    add_rect(s, x, y, pw, ph, WHITE, corner=True)
    # numero gigante
    add_text(s, x + Inches(0.3), y + Inches(0.2),
             Inches(1.2), Inches(1.6),
             f"0{i+1}", size=54, bold=True, color=TINT,
             font="Calibri")
    add_text(s, x + Inches(1.5), y + Inches(0.35),
             pw - Inches(1.8), Inches(0.45),
             h, size=18, bold=True, color=NAVY)
    add_text(s, x + Inches(1.5), y + Inches(0.85),
             pw - Inches(1.8), Inches(0.5),
             t1, size=11, color=TEXT, line_spacing=1.3)
    add_text(s, x + Inches(1.5), y + Inches(1.4),
             pw - Inches(1.8), Inches(0.5),
             t2, size=10, color=MUTED, line_spacing=1.3)

add_footer(s, 10, TOTAL, "PLANO")


# ============================================================
# SLIDE 11 — RESUMO / FECHAMENTO
# ============================================================
s = prs.slides.add_slide(BLANK)
set_slide_bg(s, NAVY)

# decorativos
add_circle(s, Inches(13.0), Inches(0.5), Inches(3.5), PRIMARY)
add_circle(s, Inches(0.5),  Inches(7.2), Inches(2.8), MID_BLUE)
add_circle(s, Inches(11.5), Inches(7.0), Inches(1.2), SKY)

# claim
brand_bar = s.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                               Inches(0.7), Inches(0.7),
                               Inches(0.5), Pt(4))
brand_bar.fill.solid(); brand_bar.fill.fore_color.rgb = SKY
brand_bar.line.fill.background()

add_text(s, Inches(0.7), Inches(0.85), Inches(8), Inches(0.4),
         "RESUMO   ·   AGENTS-HUB-CLAUDE",
         size=11, bold=True, color=SKY)

add_text(s, Inches(0.7), Inches(1.7), Inches(12), Inches(2.5),
         "Menos tempo configurando.\nMais tempo entregando.",
         size=54, bold=True, color=WHITE, line_spacing=1.05)

# 4 chips
chips = [
    "1 install",
    "0 manutenção",
    "Atualização contínua",
    "Auditável e reversível",
]
cx = Inches(0.7); cy = Inches(4.5)
for i, c in enumerate(chips):
    w = Inches(2.85)
    add_rect(s, cx, cy, w, Inches(0.7), PRIMARY, corner=True)
    add_text(s, cx, cy, w, Inches(0.7),
             c, size=12, bold=True, color=WHITE,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    cx += w + Inches(0.15)

# bloco final
add_text(s, Inches(0.7), Inches(5.7), Inches(12), Inches(0.5),
         "Time sênior virtual. Igual para todos. Sempre atualizado.",
         size=18, color=SKY, line_spacing=1.3)

# rodape branco
add_text(s, Inches(0.7), SLIDE_H - Inches(0.6),
         Inches(12), Inches(0.4),
         "EMS-NCTECH   ·   github.com/EMS-NCTECH/agents-hub-claude",
         size=10, color=SKY, bold=True)


# ---------- save ----------
out = Path(__file__).resolve().parent.parent / "docs" / "agents-hub-claude-executive.pptx"
prs.save(out)
print(f"OK -> {out}")
