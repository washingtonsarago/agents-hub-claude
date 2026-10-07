#!/usr/bin/env bash
# otlp-telemetry.sh — liga a telemetria OTLP do Claude Code (métricas + eventos)
# para um destino remoto, numa máquina de dev. Destinos: devanalyze, datadog.
#
# O que faz:
#   - guarda a credencial FORA do settings.json: Keychain no macOS, arquivo 600
#     em ~/.config/claude-otlp/<destino> no Linux;
#   - instala ~/.claude/bin/otel-headers-<destino>.sh (otelHeadersHelper), que
#     lê a credencial na hora e monta os cabeçalhos;
#   - faz merge no settings.json (global ou de um projeto) com backup, escrita
#     atômica e validação. Exporters que já existiam (ex.: prometheus, usado
#     pelo /session-cost) são preservados;
#   - FORÇA as flags de conteúdo em 0 (prompts, respostas, parâmetros e saída
#     de ferramentas, corpo das requisições) e avisa se alguma estava ligada;
#   - registra os valores originais em ~/.claude/otlp-telemetry.state.json,
#     para o uninstall devolver a máquina ao estado anterior.
#
# Uso:
#   otlp-telemetry.sh install <destino> [opções]   liga (env + credencial + helper)
#   otlp-telemetry.sh install <destino> --token-only
#                         só credencial + helper; endpoints vêm das managed settings
#   otlp-telemetry.sh managed-block <destino> [opções]
#                         imprime o JSON para as managed settings (sem credencial)
#   otlp-telemetry.sh managed-block <destino> --embed-token | pbcopy
#                         o mesmo JSON COM o token da org (OTEL_EXPORTER_OTLP_HEADERS):
#                         os devs não instalam nada. Lê o token do Keychain (ou de
#                         OTLP_TOKEN) e se recusa a rodar dentro do Claude Code.
#   otlp-telemetry.sh check
#   otlp-telemetry.sh test <destino> [opções]
#   otlp-telemetry.sh uninstall [--project ...] [--purge-key]
#
# Opções:
#   --project DIR        grava em DIR/.claude/settings.local.json (só aquele repo)
#   --team NOME          OTEL_RESOURCE_ATTRIBUTES team.id=NOME (só datadog)
#   --attr k=v           atributo de recurso extra, repetível (só datadog)
#   --force              troca um destino OTLP já configurado por este
#   datadog:    --site us3.datadoghq.com (padrão)
#   devanalyze: --base-url https://devanalyze.io  --metrics-path P  --logs-path P
#               --no-logs  (só métricas). O DevAnalyze ignora atributos de
#               recurso: tenant vem do token, time vem do cadastro do developer.
#
# A credencial é pedida no terminal, sem eco. Sem terminal interativo (`!` do
# Claude Code, MDM), passe pelo ambiente: OTLP_TOKEN=... otlp-telemetry.sh install ...
#
# Requer: bash, curl, python3.

set -euo pipefail

CMD="${1:-}"; [ $# -gt 0 ] && shift || true
DEST=""
case "${1:-}" in devanalyze|datadog) DEST="$1"; shift ;; esac

PROJECT="" TEAM="" FORCE=0 PURGE_KEY=0 TOKEN_ONLY=0 NO_LOGS=0 EMBED_TOKEN=0 SETTINGS_OVERRIDE=""
SITE="us3.datadoghq.com"
BASE_URL="https://devanalyze.io"
METRICS_PATH="/api/v1/ai-usage/claude-code/ingest"
LOGS_PATH="/api/v1/ai-usage/claude-code/ingest/logs"
VERIFY_PATH="/api/v1/ai-usage/claude-code/ingest/verify"
ATTRS=()

die() { echo "erro: $*" >&2; exit 1; }
info() { echo "• $*"; }
usage() { sed -n '2,41p' "$0"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --team) TEAM="$2"; shift 2 ;;
    --attr) ATTRS+=("$2"); shift 2 ;;
    --force) FORCE=1; shift ;;
    --purge-key) PURGE_KEY=1; shift ;;
    --token-only) TOKEN_ONLY=1; shift ;;
    --embed-token) EMBED_TOKEN=1; shift ;;
    --site) SITE="$2"; shift 2 ;;
    --base-url) BASE_URL="${2%/}"; shift 2 ;;
    --metrics-path) METRICS_PATH="$2"; shift 2 ;;
    --logs-path) LOGS_PATH="$2"; shift 2 ;;
    --no-logs) NO_LOGS=1; shift ;;
    --settings) SETTINGS_OVERRIDE="$2"; shift 2 ;;   # só para teste
    -h|--help) usage; exit 0 ;;
    *) die "opção desconhecida: $1" ;;
  esac
done

command -v python3 >/dev/null || die "python3 não encontrado"
command -v curl >/dev/null || die "curl não encontrado"

OS="$(uname -s)"
STATE="$HOME/.claude/otlp-telemetry.state.json"
if [ -n "$SETTINGS_OVERRIDE" ]; then SETTINGS="$SETTINGS_OVERRIDE"
elif [ -n "$PROJECT" ]; then
  [ -d "$PROJECT" ] || die "projeto não existe: $PROJECT"
  SETTINGS="$(cd "$PROJECT" && pwd)/.claude/settings.local.json"
else SETTINGS="$HOME/.claude/settings.json"; fi

# ---------- perfil do destino ----------
# PROFILE é um JSON com tudo que o merge precisa; o python não sabe de destino.
build_profile() {
  local attrs=""
  [ -n "$TEAM" ] && attrs="team.id=$TEAM"
  for a in "${ATTRS[@]+"${ATTRS[@]}"}"; do attrs="${attrs:+$attrs,}$a"; done
  case "$DEST" in
    datadog)
      case "$SITE" in
        datadoghq.com|us3.datadoghq.com|us5.datadoghq.com|datadoghq.eu|ap1.datadoghq.com|ap2.datadoghq.com|uk1.datadoghq.com) ;;
        app.datadoghq.com) SITE="datadoghq.com" ;;
        app.datadoghq.eu) SITE="datadoghq.eu" ;;
        *) die "site não suportado pelo Agent Console: $SITE" ;;
      esac
      METRICS_URL="https://otlp.$SITE/v1/metrics"; LOGS_URL="https://otlp.$SITE/v1/logs"
      VERIFY_URL="https://api.$SITE/api/v1/validate"
      PROTOCOL="http/protobuf"
      KC_SERVICE="datadog-otlp-api-key"
      ;;
    devanalyze)
      # http só para o DevAnalyze rodando local (teste do ingest antes do deploy).
      case "$BASE_URL" in https://*|http://127.0.0.1|http://127.0.0.1:*|http://localhost|http://localhost:*) ;;
        *) die "--base-url precisa ser https (http só para 127.0.0.1/localhost)" ;; esac
      METRICS_URL="$BASE_URL$METRICS_PATH"
      LOGS_URL="$BASE_URL$LOGS_PATH"
      VERIFY_URL="$BASE_URL$VERIFY_PATH"
      if [ -n "$attrs" ]; then
        echo "aviso: o DevAnalyze ignora --team/--attr (o time vem do cadastro do developer); não enviados." >&2
        attrs=""
      fi
      PROTOCOL="http/json"
      KC_SERVICE="devanalyze-otlp-token"
      ;;
    *) die "informe o destino: devanalyze ou datadog" ;;
  esac
  [ "$NO_LOGS" = 1 ] && LOGS_URL=""
  HELPER="$HOME/.claude/bin/otel-headers-$DEST.sh"
  LINUX_KEY_FILE="$HOME/.config/claude-otlp/$DEST"
  PROFILE="$(python3 - "$DEST" "$METRICS_URL" "$LOGS_URL" "$PROTOCOL" "$attrs" "$HELPER" <<'PY'
import json, sys
dest, metrics, logs, proto, attrs, helper = sys.argv[1:7]
env = {
    "OTEL_EXPORTER_OTLP_PROTOCOL": proto,
    "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT": metrics,
}
if logs: env["OTEL_EXPORTER_OTLP_LOGS_ENDPOINT"] = logs
# Delta fixado nos dois: o intake OTLP do Datadog só aceita delta, e o ingest do
# DevAnalyze (demanda 005) soma delta com deduplicação. Explícito, não o padrão
# do Claude Code, para não mudar de semântica se o padrão mudar.
env["OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE"] = "delta"
if dest == "devanalyze":
    # user.account_uuid é o id estável que casa com Developer.claude_code_account_uuid;
    # sem isto o payload só traz user.id, anônimo por instalação.
    env["OTEL_METRICS_INCLUDE_ACCOUNT_UUID"] = "true"
    if logs:
        # Contrato C5 rev. 4: o padrão de 5 s dá ~7200 POSTs/min com 500 devs; a
        # cota por org é 4000/min de logs (429 acima disso).
        env["OTEL_LOGS_EXPORT_INTERVAL"] = "30000"
print(json.dumps({"dest": dest, "env": env, "logs": bool(logs), "attrs": attrs, "helper": helper}))
PY
)"
}

# ---------- credencial ----------
key_read() {
  if [ "$OS" = Darwin ]; then security find-generic-password -s "$KC_SERVICE" -w 2>/dev/null || true
  else [ -r "$LINUX_KEY_FILE" ] && tr -d '\n' < "$LINUX_KEY_FILE" || true; fi
}

key_store() {
  if [ "$OS" = Darwin ]; then
    security add-generic-password -U -a "$USER" -s "$KC_SERVICE" -w "$1"
  else
    mkdir -p "$(dirname "$LINUX_KEY_FILE")"; chmod 700 "$(dirname "$LINUX_KEY_FILE")"
    ( umask 077; printf '%s' "$1" > "$LINUX_KEY_FILE" )
  fi
}

key_delete() {
  if [ "$OS" = Darwin ]; then security delete-generic-password -s "$KC_SERVICE" >/dev/null 2>&1 || true
  else rm -f "$LINUX_KEY_FILE"; fi
}

key_check_format() {
  case "$DEST" in
    datadog) [[ "$1" =~ ^[a-f0-9]+$ ]] && [ "${#1}" -eq 32 ] \
      || die "não parece uma API key do Datadog (32 hex). Application Key e Key ID não servem." ;;
    # Contrato C5: 32–256 caracteres ASCII imprimíveis (sem espaço). Tamanho e
    # alfabeto checados separados: o regex do macOS recusa repetição acima de
    # 255 ({32,256} quebrava com "maximum repetition exceeds 255").
    devanalyze) (LC_ALL=C; [[ "$1" =~ ^[!-~]+$ ]]) && [ "${#1}" -ge 32 ] && [ "${#1}" -le 256 ] \
      || die "token do DevAnalyze precisa ter 32–256 caracteres ASCII imprimíveis, sem espaço" ;;
  esac
}

obtain_key() {
  local k="${OTLP_TOKEN:-}" cur ans label
  label=$([ "$DEST" = datadog ] && echo "Datadog API key ($SITE)" || echo "Token claude_code do DevAnalyze")
  if [ -z "$k" ]; then
    cur="$(key_read)"
    if [ -n "$cur" ] && [ ! -t 0 ]; then echo "$cur"; return; fi
    if [ -t 0 ]; then
      if [ -n "$cur" ]; then
        read -r -p "Já existe uma credencial guardada. Substituir? [s/N] " ans </dev/tty
        case "$ans" in s|S) ;; *) echo "$cur"; return ;; esac
      fi
      read -r -s -p "$label: " k </dev/tty; echo >&2
    fi
  fi
  [ -n "$k" ] || die "sem credencial: rode num terminal interativo ou passe OTLP_TOKEN"
  key_check_format "$k"
  echo "$k"
}

# 2xx = aceita; 401/403 = recusada; outro código = não deu para verificar agora.
key_validate() {
  case "$DEST" in
    datadog) curl -s -o /dev/null -w '%{http_code}' -H "DD-API-KEY: $1" "$VERIFY_URL" ;;
    # 204 = token válido, 401 = inválido; nada é gravado.
    devanalyze) curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $1" "$VERIFY_URL" ;;
  esac
}

# ---------- helper ----------
install_helper() {
  local read_cmd headers
  if [ "$OS" = Darwin ]; then read_cmd="security find-generic-password -s $KC_SERVICE -w 2>/dev/null"
  else read_cmd="tr -d '\\n' < \"\$HOME/.config/claude-otlp/$DEST\" 2>/dev/null"; fi
  case "$DEST" in
    datadog) headers='{"dd-api-key":"%s","dd-otel-metric-config":"{\\"resource_attributes_as_tags\\":true}"}' ;;
    devanalyze) headers='{"Authorization":"Bearer %s"}' ;;
  esac
  mkdir -p "$(dirname "$HELPER")"
  cat > "$HELPER" <<EOF
#!/bin/sh
# otelHeadersHelper do Claude Code ($DEST), instalado por otlp-telemetry.sh.
# A credencial não fica no settings.json: é lida aqui a cada refresh.
key=\$($read_cmd) || key=""
[ -n "\$key" ] || { echo "credencial $DEST ausente" >&2; exit 1; }
# Escapa \ e " para o JSON continuar válido com qualquer caractere imprimível.
key=\$(printf '%s' "\$key" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
printf '$headers\n' "\$key"
EOF
  chmod 700 "$HELPER"
}

# ---------- settings (merge em python) ----------
settings_merge() {
  local prof="${PROFILE:-}"; [ -n "$prof" ] || prof='{}'
  MODE="$1" SETTINGS_PATH="$SETTINGS" STATE_PATH="$STATE" PROFILE="$prof" EMBED_VALUE="${EMBED_VALUE:-}" \
  FORCE="$FORCE" TOKEN_ONLY="$TOKEN_ONLY" python3 - <<'PY'
import json, os, shutil, sys, time
mode = os.environ["MODE"]; path = os.environ["SETTINGS_PATH"]; state_path = os.environ["STATE_PATH"]
prof = json.loads(os.environ["PROFILE"]); force = os.environ["FORCE"] == "1"
token_only = os.environ["TOKEN_ONLY"] == "1"

# Flags que fazem CONTEÚDO sair da máquina. Ficam explicitamente em "0" (não
# só ausentes): um valor no settings vence o que estiver exportado no shell.
CONTENT = ["OTEL_LOG_USER_PROMPTS", "OTEL_LOG_ASSISTANT_RESPONSES", "OTEL_LOG_TOOL_DETAILS",
           "OTEL_LOG_TOOL_CONTENT", "OTEL_LOG_RAW_API_BODIES", "OTEL_LOG_MANAGED_SETTINGS"]
DEST_KEYS = ["OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_HEADERS",
             "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
             "OTEL_EXPORTER_OTLP_METRICS_HEADERS", "OTEL_EXPORTER_OTLP_LOGS_HEADERS"]
MANAGED = ["CLAUDE_CODE_ENABLE_TELEMETRY", "OTEL_METRICS_EXPORTER", "OTEL_LOGS_EXPORTER",
           "OTEL_EXPORTER_OTLP_PROTOCOL", "OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE",
           "OTEL_METRICS_INCLUDE_ACCOUNT_UUID", "OTEL_METRIC_EXPORT_INTERVAL", "OTEL_LOGS_EXPORT_INTERVAL",
           "OTEL_RESOURCE_ATTRIBUTES"] + DEST_KEYS + CONTENT

def on(v): return str(v).strip().lower() not in ("", "0", "false", "no", "off")

def load(p, default):
    if not os.path.exists(p): return default
    with open(p) as f: return json.load(f)

def save(p, data):
    os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w") as f: json.dump(data, f, indent=2, ensure_ascii=False); f.write("\n")
    with open(tmp) as f: json.load(f)
    os.replace(tmp, p)

def exporters(v):
    return [x.strip() for x in (v or "").split(",") if x.strip() and x.strip() != "none"]

def merge_attrs(cur, new):
    if not new: return cur
    keys = {a.split("=", 1)[0] for a in new.split(",")}
    kept = [a for a in (cur or "").split(",") if a and a.split("=", 1)[0] not in keys]
    return ",".join(kept + new.split(","))

def target_env(base):
    """O env completo do destino, aplicado sobre `base`."""
    env = dict(base)
    m = exporters(env.get("OTEL_METRICS_EXPORTER")) or ["prometheus"]
    if "otlp" not in m: m.insert(0, "otlp")
    env["CLAUDE_CODE_ENABLE_TELEMETRY"] = "1"
    env["OTEL_METRICS_EXPORTER"] = ",".join(m)
    if prof["logs"]:
        l = exporters(env.get("OTEL_LOGS_EXPORTER"))
        if "otlp" not in l: l.insert(0, "otlp")
        env["OTEL_LOGS_EXPORTER"] = ",".join(l)
    for k in DEST_KEYS:
        if k not in prof["env"]: env.pop(k, None)
    env.update(prof["env"])
    env.setdefault("OTEL_METRIC_EXPORT_INTERVAL", "60000")
    attrs = merge_attrs(env.get("OTEL_RESOURCE_ATTRIBUTES"), prof["attrs"])
    if attrs: env["OTEL_RESOURCE_ATTRIBUTES"] = attrs
    for k in CONTENT: env[k] = "0"
    return env

if mode == "managed-block":
    env = target_env({})
    tok = os.environ.get("EMBED_VALUE", "")
    if tok:
        # Formato OTEL: chave=valor, valor percent-encoded. Com cabeçalho nas
        # managed settings o Claude Code ignora endpoints e cabeçalhos que o dev
        # tenha configurado por conta própria: a política vence.
        from urllib.parse import quote
        hdr = "Authorization=Bearer " if prof["dest"] == "devanalyze" else "dd-api-key="
        env["OTEL_EXPORTER_OTLP_HEADERS"] = hdr + quote(tok, safe="")
    print(json.dumps({"env": env}, indent=2, ensure_ascii=False))
    sys.exit(0)

s = load(path, {})
if not isinstance(s, dict): sys.exit("settings não é um objeto JSON: " + path)
env = s.setdefault("env", {})
states = load(state_path, {})
key = os.path.abspath(path)

if mode == "check":
    st = states.get(key)
    print("settings:", path, f"(instalado: {st['dest']})" if st else "")
    for k in MANAGED:
        if k in env: print(f"  {k} = {'***' if 'HEADERS' in k else env[k]}")
    print("  otelHeadersHelper =", s.get("otelHeadersHelper", "(ausente)"))
    leaks = [k for k in CONTENT if on(env.get(k, ""))]
    for k in leaks: print(f"  ATENÇÃO: {k} ligado — conteúdo sai da máquina")
    sys.exit(0)

if mode == "install":
    helper = prof["helper"]
    if not token_only:
        # Um destino OTLP por sinal: não trocar outro destino calado.
        mine = set(prof["env"].values())
        other = [f"{k}={'***' if 'HEADERS' in k else env[k]}" for k in DEST_KEYS
                 if env.get(k) and env[k] not in mine]
        h = s.get("otelHeadersHelper")
        if h and h != helper: other.append(f"otelHeadersHelper={h}")
        if other and not force:
            sys.exit("já existe outro destino OTLP configurado:\n  " + "\n  ".join(other) +
                     "\no Claude Code manda cada sinal para UM endpoint. Use --force para trocar.")

    leaks = [k for k in CONTENT if on(env.get(k, ""))]
    if key not in states:  # guarda o original só na primeira instalação
        states[key] = {"env": {k: env.get(k) for k in MANAGED},
                       "otelHeadersHelper": s.get("otelHeadersHelper")}
    states[key]["dest"] = prof["dest"]
    if os.path.exists(path):
        shutil.copy2(path, f"{path}.bak-otlp-{time.strftime('%Y%m%d%H%M%S')}")

    if token_only:
        for k in CONTENT: env[k] = "0"
    else:
        s["env"] = env = target_env(env)
    s["otelHeadersHelper"] = helper
    save(path, s); save(state_path, states)
    for k in leaks: print(f"aviso: {k} estava ligado — desliguei (conteúdo não sai da máquina)")
    print("settings atualizado:", path)
    sys.exit(0)

if mode == "uninstall":
    st = states.pop(key, None)
    if st is None: sys.exit("nada instalado por este script em " + path)
    shutil.copy2(path, f"{path}.bak-otlp-{time.strftime('%Y%m%d%H%M%S')}")
    for k, v in st["env"].items():
        if v is None: env.pop(k, None)
        else: env[k] = v
    if not env: s.pop("env", None)
    if st["otelHeadersHelper"] is None: s.pop("otelHeadersHelper", None)
    else: s["otelHeadersHelper"] = st["otelHeadersHelper"]
    save(path, s); save(state_path, states)
    print("settings restaurado:", path)
    print("DEST=" + st["dest"])
PY
}

warn_shell_content() {
  local k
  for k in OTEL_LOG_USER_PROMPTS OTEL_LOG_ASSISTANT_RESPONSES OTEL_LOG_TOOL_DETAILS OTEL_LOG_TOOL_CONTENT OTEL_LOG_RAW_API_BODIES OTEL_LOG_MANAGED_SETTINGS; do
    case "${!k:-}" in ""|0|false|no|off) ;;
      *) echo "aviso: $k está ligado no seu shell. O settings força 0, mas remova do seu ~/.zshrc." >&2 ;;
    esac
  done
}

send_test() {
  local k="$1" code
  case "$DEST" in
    datadog)
      local now id body
      now="$(python3 -c 'import time;print(time.time_ns())')"; id="otlp-telemetry-$(hostname -s)-$now"
      body='{"resourceLogs":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"claude-code"}}]},"scopeLogs":[{"scope":{"name":"otlp-telemetry"},"logRecords":[{"timeUnixNano":"'"$now"'","body":{"stringValue":"teste_conectividade"},"attributes":[{"key":"teste.id","value":{"stringValue":"'"$id"'"}}]}]}]}]}'
      code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$LOGS_URL" -H 'Content-Type: application/json' -H "dd-api-key: $k" --data "$body")"
      info "log de teste: HTTP $code — Log Explorer: service:claude-code @teste.id:$id" ;;
    devanalyze)
      code="$(key_validate "$k")"
      info "verificação do token em $VERIFY_URL: HTTP $code (204 = válido)" ;;
  esac
  case "$code" in 2??) return 0 ;; *) return 1 ;; esac
}

case "$CMD" in
  install)
    build_profile
    k="$(obtain_key)"
    code="$(key_validate "$k")"
    case "$code" in
      2??) info "credencial aceita por $DEST" ;;
      401|403) die "credencial recusada por $DEST (HTTP $code)" ;;
      *) echo "aviso: não deu para validar a credencial agora (HTTP $code); seguindo." >&2 ;;
    esac
    key_store "$k"; info "credencial guardada ($([ "$OS" = Darwin ] && echo Keychain || echo "$LINUX_KEY_FILE"))"
    install_helper; info "helper: $HELPER"
    "$HELPER" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d and all(d.values())' \
      || die "helper não devolveu cabeçalho válido"
    settings_merge install
    warn_shell_content
    info "pronto. Reinicie o Claude Code."
    ;;
  managed-block)
    build_profile
    if [ "$EMBED_TOKEN" = 1 ]; then
      # Dentro do Claude Code a saída vai para o transcript; o token não pode ir junto.
      [ -z "${CLAUDECODE:-}" ] || die "--embed-token não roda dentro do Claude Code: use um terminal e mande a saída para o pbcopy"
      EMBED_VALUE="${OTLP_TOKEN:-$(key_read)}"
      [ -n "$EMBED_VALUE" ] || die "sem token: rode 'install $DEST' antes ou passe OTLP_TOKEN"
      key_check_format "$EMBED_VALUE"
      [ -t 1 ] && echo "aviso: o JSON abaixo contém o token. Prefira: ... --embed-token | pbcopy" >&2
    fi
    settings_merge managed-block
    ;;
  check)
    settings_merge check
    warn_shell_content
    ;;
  test)
    build_profile
    k="$(key_read)"; [ -n "$k" ] || die "sem credencial guardada para $DEST; rode install"
    send_test "$k"
    ;;
  uninstall)
    out="$(settings_merge uninstall)"; echo "$out" | grep -v '^DEST='
    DEST="$(echo "$out" | sed -n 's/^DEST=//p')"
    if [ -n "$DEST" ] && ! python3 -c 'import json,sys; s=json.load(open(sys.argv[1])); sys.exit(0 if any(v["dest"]==sys.argv[2] for v in s.values()) else 1)' "$STATE" "$DEST" 2>/dev/null; then
      build_profile
      rm -f "$HELPER"; info "helper removido"
      [ "$PURGE_KEY" = 1 ] && { key_delete; info "credencial removida"; }
    fi
    info "reinicie o Claude Code para parar o envio."
    ;;
  *) usage; exit 1 ;;
esac
