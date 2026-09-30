#!/usr/bin/env bash
#
# Bootstrap público do ahc — ESTE É O ARQUIVO PUBLICADO EM github.com/EMS-NCTECH/ahc-install
#
# Ele é o único pedaço público da distribuição, e por isso é deliberadamente
# pequeno e estável: toda a lógica real de instalação continua no `install.sh`
# do hub privado, versionada com o resto. Mudanças aqui exigem republicar o
# arquivo no repo público, então evite colocar regra de negócio neste arquivo.
#
# CONTRATO INEGOCIÁVEL: este arquivo é público. Ele NUNCA pode conter o token.
# O token é obtido em tempo de execução, por AHC_GITHUB_TOKEN ou por prompt.
#
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/EMS-NCTECH/ahc-install/main/install.sh | bash
#   AHC_GITHUB_TOKEN=<token> curl -fsSL .../install.sh | bash     (não interativo)
#
set -euo pipefail

HUB_REPO="${AHC_REPO:-EMS-NCTECH/agents-hub-claude}"
HUB_BRANCH="${AHC_BRANCH:-main}"
HUB_URL="https://github.com/${HUB_REPO}.git"
WIKI="a página de instalação na wiki interna"

die() { echo "[ahc] ERRO: $*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || die "git não encontrado. Instale o git (>= 2.31) e rode de novo."

# O token: do ambiente, ou perguntado. `read` de /dev/tty e não de stdin —
# com `curl | bash` o stdin É o script, então ler dele comeria o próprio código.
TOKEN="${AHC_GITHUB_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  if [ ! -r /dev/tty ]; then
    die "sem terminal para pedir o token. Rode com AHC_GITHUB_TOKEN=<token> antes do curl, ou baixe o script e execute direto."
  fi
  echo "[ahc] Cole o token de leitura do hub (copie de ${WIKI}):" >&2
  # -s: não ecoa. O valor não vai para o histórico do shell nem para a tela.
  IFS= read -rs TOKEN < /dev/tty || die "leitura do token interrompida."
  echo >&2
fi
[ -n "$TOKEN" ] || die "token vazio. Copie o valor de ${WIKI} e rode de novo."
case "$TOKEN" in
  github_pat_*) ;;
  *) die "o valor informado não parece um token fine-grained (esperado github_pat_...). Confira em ${WIKI}." ;;
esac

# Injeção por invocação, idêntica à do install.sh do hub: nada em argv, na URL,
# no .git/config nem no ~/.gitconfig do dev. O `credential.helper=` vazio evita
# que um 401 dispare `erase` nos helpers do sistema e apague a credencial dele.
AUTH="$(printf 'x-access-token:%s' "$TOKEN" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(Buffer.from(s,"utf8").toString("base64")))' 2>/dev/null \
  || printf 'x-access-token:%s' "$TOKEN" | base64 | tr -d '\n')"

BASE="${GIT_CONFIG_COUNT:-0}"
case "$BASE" in (*[!0-9]*|'') BASE=0 ;; esac

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

echo "[ahc] obtendo o instalador de ${HUB_REPO}@${HUB_BRANCH}" >&2
set +e
GIT_TERMINAL_PROMPT=0 GIT_ASKPASS= SSH_ASKPASS= GCM_INTERACTIVE=never LC_ALL=C LANGUAGE=C \
GIT_CONFIG_COUNT=$((BASE + 4)) \
GIT_CONFIG_KEY_$((BASE + 0))="credential.helper"                 GIT_CONFIG_VALUE_$((BASE + 0))="" \
GIT_CONFIG_KEY_$((BASE + 1))="http.${HUB_URL}.extraHeader"       GIT_CONFIG_VALUE_$((BASE + 1))="" \
GIT_CONFIG_KEY_$((BASE + 2))="http.${HUB_URL}.extraHeader"       GIT_CONFIG_VALUE_$((BASE + 2))="Authorization: Basic ${AUTH}" \
GIT_CONFIG_KEY_$((BASE + 3))="http.${HUB_URL}.followRedirects"   GIT_CONFIG_VALUE_$((BASE + 3))="false" \
git clone --quiet --depth=1 --branch "$HUB_BRANCH" "$HUB_URL" "$TMP/hub" 2>"$TMP/err"
RC=$?
set -e

if [ $RC -ne 0 ]; then
  ERR="$(head -3 "$TMP/err" | tr '\n' ' ')"
  case "$ERR" in
    *"could not read Username"*|*"Authentication failed"*|*"error: 401"*|*"error: 403"*|*"not granted"*)
      die "o token foi recusado pelo GitHub. Ele pode ter vencido ou sido revogado — pegue o valor atual em ${WIKI}." ;;
    *"error: 404"*|*"not found"*)
      die "repositório ${HUB_REPO} não encontrado para este token. Confira em ${WIKI} se o token é o do hub." ;;
    *"Could not resolve host"*|*"Failed to connect"*|*"timed out"*)
      die "falha de rede ao alcançar o github.com. Verifique conexão e proxy." ;;
    *) die "não foi possível obter o instalador: ${ERR}" ;;
  esac
fi

[ -f "$TMP/hub/install.sh" ] || die "o hub não contém install.sh — avise o time do ${WIKI}."

echo "[ahc] executando o instalador" >&2
# O token segue por ambiente para a origem `env` da cascata do instalador,
# então ele não precisa ser pedido de novo. Nunca vai por argv.
AHC_GITHUB_TOKEN="$TOKEN" AHC_REPO="$HUB_REPO" AHC_BRANCH="$HUB_BRANCH" \
  bash "$TMP/hub/install.sh"
