"""
Renderiza release-notes.md.j2 em Markdown e (opcional) PDF.

Como usar:
1. Copie este arquivo para /tmp/<nome>.py
2. Edite o dict CONTEXT abaixo com os dados do release
3. Execute: python3 /tmp/<nome>.py
4. Saidas:
   - /tmp/<nome>.md  (sempre)
   - /tmp/<nome>.pdf (se pandoc estiver disponivel)

Mantenha intacto o template Jinja2 — adapte apenas CONTEXT.
"""
import os
import shutil
import subprocess
from pathlib import Path

try:
    from jinja2 import Environment, FileSystemLoader
except ImportError:
    raise SystemExit(
        "[release-notes] jinja2 nao esta instalado. Rode:\n"
        "  pip3 install --quiet jinja2"
    )

# ============================================================
#  CONFIGURACAO
# ============================================================
TEMPLATE_DIR = Path(__file__).parent       # ./templates/
TEMPLATE_FILE = "release-notes.md.j2"

OUT_MD  = Path("/tmp/release-notes.md")
OUT_PDF = Path("/tmp/release-notes.pdf")    # gerado so se pandoc existir

# ============================================================
#  CONTEXT  (substitua pelos dados reais do release)
# ============================================================
CONTEXT = {
    "product":  "EMS Gateway",
    "version":  "2.5.0",
    "previous": "2.4.3",
    "date":     "2026-05-12",
    "manager":  "@washingtons",
    "sha":      "60f724dabc1234ef5678",

    "summary": (
        "Release com webhooks de pagamento, exportacao em massa e melhorias "
        "de observabilidade. Inclui um breaking change na API de relatorios "
        "(ver secao abaixo) e dois fixes de seguranca (severity High)."
    ),

    "breaking": [
        {
            "title": "GET /reports/v1 removido",
            "description": (
                "O endpoint legado `GET /reports/v1` foi removido. "
                "Use `GET /reports/v2` que tem os mesmos dados + paginacao "
                "via cursor."
            ),
            "migration": (
                "1. Atualize chamadas pra `/reports/v2`.\n"
                "2. Trocar `?page=N` por `?cursor=<token>` (token volta no header `X-Next-Cursor`).\n"
                "3. Resposta agora envelopada em `{ data: [], cursor: null|string }`.\n"
            ),
            "pr": 1840,
        },
    ],

    "security": [
        {
            "severity": "High",
            "title": "Token JWT podia ser reutilizado pos-logout",
            "description": "Faltava invalidacao no Redis. Corrigido + auditoria adicionada.",
            "cve": "",  # interno; sem CVE publico
            "pr": 1851,
        },
    ],

    "features": [
        {
            "title": "Webhooks de pagamento",
            "description": (
                "Eventos `payment.succeeded`, `payment.failed`, `payment.refunded` "
                "agora podem ser entregues por webhook HTTPS. Suporte a HMAC-SHA256, "
                "retry exponencial (5x, ate 24h) e dead-letter queue inspecionavel."
            ),
            "pr": 1820, "author": "@alice",
        },
        {
            "title": "Exportacao em massa de pedidos",
            "description": (
                "`POST /orders/exports` cria um job assincrono que gera CSV (ate 1M linhas) "
                "e disponibiliza em URL pre-assinada por 24h."
            ),
            "pr": 1832, "author": "@bob",
        },
    ],

    "improvements": [
        {"title": "p99 de /checkout caiu de 480ms pra 180ms",
         "description": "Cache de regras fiscais com TTL de 60s + remocao de N+1 em line_items.",
         "pr": 1825, "author": "@carla"},
        {"title": "Tracing OTel completo",
         "description": "Spans agora cobrem o fluxo do API gateway ate o Postgres.",
         "pr": 1829, "author": "@diego"},
    ],

    "fixes": [
        {"title": "Race condition no cache de tarifas",
         "description": "CAS atomico via SETNX, sem mais double-booking de promo.",
         "issue": 1798, "pr": 1822, "author": "@erika"},
        {"title": "Memory leak em jobs de export",
         "description": "Generator nao fechado liberava conexao. Corrigido com `with` block.",
         "issue": 1815, "pr": 1828, "author": "@bob"},
    ],

    "deprecations": [
        {"what": "X-Legacy-Tenant header", "replacement": "X-Tenant-ID", "removed_in": "3.0.0"},
    ],

    "migration": "",  # nao usar em conjunto com breaking; deixe em branco se houver breaking change

    "contributors": ["@alice", "@bob", "@carla", "@diego", "@erika", "@washingtons"],
}

# ============================================================
#  RENDER
# ============================================================
env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_DIR)),
    trim_blocks=True,
    lstrip_blocks=True,
)
tpl = env.get_template(TEMPLATE_FILE)
md = tpl.render(**CONTEXT)

OUT_MD.parent.mkdir(parents=True, exist_ok=True)
OUT_MD.write_text(md, encoding="utf-8")
print(f"OK  -> {OUT_MD}  ({len(md)} chars)")

# ============================================================
#  PDF (opcional, se pandoc estiver instalado)
# ============================================================
if shutil.which("pandoc"):
    try:
        subprocess.run(
            [
                "pandoc",
                str(OUT_MD),
                "-o", str(OUT_PDF),
                "--pdf-engine=xelatex",
                "-V", "geometry:margin=2cm",
                "-V", "mainfont=Helvetica Neue",
                "-V", "monofont=Menlo",
                "-V", "linkcolor=NavyBlue",
            ],
            check=True,
        )
        print(f"OK  -> {OUT_PDF}")
    except subprocess.CalledProcessError as e:
        print(f"WARN: pandoc falhou (sem xelatex?): {e}. Markdown ja foi salvo.")
else:
    print("INFO: pandoc nao encontrado — pulando PDF. Markdown ja salvo.")
