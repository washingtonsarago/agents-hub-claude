"""
Template de gerador de dados de teste / seed.

Como usar:
1. Copie este arquivo para o seu repo (ex.: scripts/seed/generate.py).
2. Ajuste ENTITIES: entidades, campos, geradores e quantidades a partir do seu schema.
3. Garanta a ordem topologica de FKs em ENTITY_ORDER (pais antes de filhos).
4. Escolha o perfil de volume (PROFILE) e/ou sobrescreva "count" por entidade.
5. Rode: python3 generate.py
   Saidas: seed.sql (INSERT em lote) + seed.json (por entidade).

Principios (NAO quebre):
- SEED fixo => dataset reproduzivel. Nunca use random sem seed.
- Locale pt_BR por padrao (nomes, CPF, telefone, endereco coerentes).
- Toda FK aponta pra uma PK ja gerada do pai (ordem topologica).
- UNIQUE, NOT NULL, CHECK e tamanho de coluna respeitados.
- Zero PII/dado real: tudo sintetico.

Pre-requisito:
    python3 -c "import faker" 2>/dev/null || pip3 install --quiet faker
"""
import json
import random
from datetime import datetime, timedelta

from faker import Faker

# ============================================================
#  CONFIGURACAO
# ============================================================
SEED = 42                     # seed determinística — reproduz o MESMO dataset
LOCALE = "pt_BR"              # troque so se o dominio nao for brasileiro
PROFILE = "dev"              # "smoke" (~10) | "dev" (~1000) | "perf" (~100000)

PROFILES = {"smoke": 10, "dev": 1000, "perf": 100000}

OUT_SQL = "seed.sql"
OUT_JSON = "seed.json"

# Faker + random SEMPRE com seed (reprodutibilidade)
fake = Faker(LOCALE)
Faker.seed(SEED)
random.seed(SEED)

# Pools para garantir UNIQUE sem repetir
_used = {}


def unique(pool_key, generator, max_tries=1000):
    """Gera um valor unico por chave de pool (respeita constraint UNIQUE)."""
    seen = _used.setdefault(pool_key, set())
    for _ in range(max_tries):
        value = generator()
        if value not in seen:
            seen.add(value)
            return value
    raise RuntimeError(f"Nao consegui gerar valor unico para '{pool_key}' "
                       f"(pool esgotado). Reduza o volume ou amplie o gerador.")


def email_from_name(name, key="email"):
    """Email coerente com o nome da pessoa, garantindo unicidade."""
    base = (name.lower()
            .replace(" ", ".")
            .replace("ã", "a").replace("á", "a").replace("â", "a")
            .replace("é", "e").replace("ê", "e").replace("í", "i")
            .replace("ó", "o").replace("ô", "o").replace("ç", "c")
            .replace("ú", "u"))
    domain = random.choice(["example.com", "teste.com.br", "mail.dev"])
    return unique(key, lambda: f"{base}{random.randint(1, 9999)}@{domain}")


# ============================================================
#  DEFINICAO DAS ENTIDADES  (ADAPTE ISTO AO SEU SCHEMA)
#
#  Exemplo concreto de FKs encadeadas:
#     customers  ->  orders  ->  order_items
#
#  Cada gerador recebe (row_index, context) e devolve um dict de linha.
#  context["rows"] tem as linhas ja geradas dos PAIS (para escolher FKs).
# ============================================================

STATUS_PEDIDO = ["pendente", "pago", "enviado", "entregue", "cancelado"]


def gen_customer(i, ctx):
    name = fake.name()
    created = fake.date_time_between(start_date="-2y", end_date="-1d")
    updated = fake.date_time_between(start_date=created, end_date="now")
    return {
        "id": i + 1,                                   # PK
        "name": name[:120],                            # respeita VARCHAR(120)
        "email": email_from_name(name, "customer_email"),  # UNIQUE
        "cpf": unique("cpf", fake.cpf),               # UNIQUE, valido/ficticio
        "phone": fake.phone_number()[:20],
        "city": fake.city(),
        "state": fake.estado_sigla(),
        "created_at": created.isoformat(sep=" ", timespec="seconds"),
        "updated_at": updated.isoformat(sep=" ", timespec="seconds"),  # >= created
    }


def gen_order(i, ctx):
    parent = random.choice(ctx["rows"]["customers"])   # FK valida (pai existe)
    created = fake.date_time_between(
        start_date=datetime.fromisoformat(parent["created_at"]),
        end_date="now",
    )
    return {
        "id": i + 1,
        "customer_id": parent["id"],                   # FK -> customers.id
        "status": random.choice(STATUS_PEDIDO),        # dentro do dominio/CHECK
        "total": 0.0,                                  # calculado apos itens
        "created_at": created.isoformat(sep=" ", timespec="seconds"),
    }


def gen_order_item(i, ctx):
    parent = random.choice(ctx["rows"]["orders"])      # FK -> orders.id
    qty = random.randint(1, 5)
    price = round(random.uniform(5, 500), 2)           # faixa realista, > 0
    return {
        "id": i + 1,
        "order_id": parent["id"],
        "product": fake.word().capitalize()[:80],
        "quantity": qty,
        "unit_price": price,
        "subtotal": round(qty * price, 2),
    }


# Metadados por entidade. "count" sobrescreve o volume do PROFILE.
ENTITIES = {
    "customers":   {"gen": gen_customer,   "count": None},
    "orders":      {"gen": gen_order,      "count": None},
    "order_items": {"gen": gen_order_item, "count": None},
}

# ORDEM TOPOLOGICA: pais antes de filhos. NAO reordene sem checar as FKs.
ENTITY_ORDER = ["customers", "orders", "order_items"]

# Multiplicadores de volume por entidade (relativo ao base do PROFILE).
# Ex.: em "dev" (base 1000) => 1000 clientes, ~2500 pedidos, ~7500 itens.
VOLUME_FACTOR = {"customers": 1.0, "orders": 2.5, "order_items": 7.5}


# ============================================================
#  GERACAO
# ============================================================
def resolve_count(name):
    if ENTITIES[name]["count"] is not None:
        return ENTITIES[name]["count"]
    base = PROFILES[PROFILE]
    return max(1, int(base * VOLUME_FACTOR.get(name, 1.0)))


def generate():
    ctx = {"rows": {}}
    for name in ENTITY_ORDER:                 # pais antes de filhos
        n = resolve_count(name)
        gen = ENTITIES[name]["gen"]
        rows = [gen(i, ctx) for i in range(n)]
        ctx["rows"][name] = rows
    # Pos-processamento coerente: total do pedido = soma dos subtotais dos itens.
    totals = {}
    for item in ctx["rows"].get("order_items", []):
        totals[item["order_id"]] = totals.get(item["order_id"], 0.0) + item["subtotal"]
    for order in ctx["rows"].get("orders", []):
        order["total"] = round(totals.get(order["id"], 0.0), 2)
    return ctx["rows"]


# ============================================================
#  EMISSAO: SQL INSERT + JSON
# ============================================================
def sql_value(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"   # escapa aspas


def emit_sql(data, path, batch=500):
    lines = ["-- Seed gerado por data-generator (sintetico).",
             f"-- SEED={SEED} LOCALE={LOCALE} PROFILE={PROFILE}",
             "BEGIN;"]
    for name in ENTITY_ORDER:                        # ordem topologica no INSERT
        rows = data.get(name, [])
        if not rows:
            continue
        cols = list(rows[0].keys())
        col_list = ", ".join(cols)
        for start in range(0, len(rows), batch):     # INSERT em lote (perf-friendly)
            chunk = rows[start:start + batch]
            values = ",\n".join(
                "  (" + ", ".join(sql_value(r[c]) for c in cols) + ")"
                for r in chunk
            )
            lines.append(f"INSERT INTO {name} ({col_list}) VALUES\n{values};")
    lines.append("COMMIT;")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def emit_json(data, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, default=str)


def emit_ndjson(data, prefix="seed"):
    """Opcional: um arquivo .ndjson por entidade (bom pra fixtures/streaming)."""
    for name, rows in data.items():
        with open(f"{prefix}.{name}.ndjson", "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False, default=str) + "\n")


def emit_csv(data, prefix="seed"):
    """Opcional: um CSV por entidade (bom pra COPY/import em massa)."""
    import csv
    for name, rows in data.items():
        if not rows:
            continue
        with open(f"{prefix}.{name}.csv", "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)


# ============================================================
#  MAIN
# ============================================================
if __name__ == "__main__":
    data = generate()
    emit_sql(data, OUT_SQL)
    emit_json(data, OUT_JSON)
    # emit_csv(data)     # descomente se quiser CSV por entidade
    # emit_ndjson(data)  # descomente se quiser NDJSON por entidade

    summary = ", ".join(f"{k}={len(v)}" for k, v in data.items())
    print(f"OK | SEED={SEED} PROFILE={PROFILE} LOCALE={LOCALE}")
    print(f"Entidades: {summary}")
    print(f"Arquivos: {OUT_SQL}, {OUT_JSON}")
    print("Aplicar (ex.): psql -d minha_base -f seed.sql")
