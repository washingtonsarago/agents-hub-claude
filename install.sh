#!/usr/bin/env bash
# ahc installer — clones the hub via git and configures SessionStart hook
#
# Seguro para `curl … | bash` (C10): fora daqui só existem constantes e
# definições de função; todo efeito colateral vive em main(), chamada na última
# linha do arquivo. Um download truncado nunca chega a essa linha e portanto
# não cria nada. O xtrace fica desligado de propósito: ele ecoaria credenciais
# nos comandos de git.
set -euo pipefail

# PAT fine-grained de leitura da org. Entra no BUILD vazio — vazio significa
# "esta origem não existe" — e recebe o valor real na última tarefa da demanda
# 001, gravado pelo orquestrador a partir de um arquivo local. A linha abaixo é
# o marcador: aparece uma única vez neste arquivo e o literal é idêntico ao do
# bin/ahc (test/embedded-token.test.js trava as duas invariantes).
AHC_EMBEDDED_TOKEN='' # AHC-EMBEDDED-TOKEN

GIT_BASE_DEFAULT="https://github.com"

# Override de base aceito só para o harness de teste, e só em loopback literal.
# Nome de host fica de fora de propósito (C7 do threat model): um `localhost`
# depende de resolução, e /etc/hosts ou DNS podem apontá-lo para fora da
# máquina. Âncorado nas duas pontas, então userinfo, path, query, fragmento e
# https externo não passam. O padrão fica numa variável e o lado direito do
# `=~` vai sem aspas — é o que o bash 3.2 do macOS exige para tratá-lo como
# regex.
AHC_TEST_BASE_RE='^http://(127\.0\.0\.1|\[::1\]):[0-9]{1,5}$'

# Versão mínima do git: 2.31 é a primeira que aceita `http.<url>.extraHeader`
# com escopo de URL, que é como o token é apresentado ao hub sem vazar para
# outro host. Abaixo disso o instalador não tem como cumprir o contrato.
GIT_MIN_MAJOR=2
GIT_MIN_MINOR=31

# `repo` vai para dentro da URL e `branch` vira argumento do git. Sem este
# filtro um valor vindo de AHC_REPO/AHC_BRANCH (ou de um config herdado) podia
# virar opção do git (`--upload-pack=…`) ou um path arbitrário. Mesmo padrão do
# REPO_SLUG_RE do bin/ahc. Padrão em variável e `=~` sem aspas do lado direito:
# é o que o bash 3.2 do macOS exige.
AHC_REPO_SLUG_RE='^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$'

# Classificação da falha do git (§5 + emenda 2 do §7 / C4). Estas expressões
# são as mesmas de GIT_FAILURE_RULES no bin/ahc, na mesma ordem: a primeira
# regra que casar vence. Só `refused`/`unavailable` avançam a cascata.
# (`Couldn.t` porque o literal do bin/ahc tem apóstrofo, que não cabe numa
# string entre aspas simples do bash.)
AHC_RE_NETWORK='Could not resolve host|Failed to connect|Couldn.t connect to server|Connection refused|Connection reset|Connection timed out|Operation timed out|timed out|Empty reply from server|SSL|TLS|certificate'
AHC_RE_REDIRECT='returned error: 30[0-9]'
AHC_RE_NOCRED='could not read Username|could not read Password|terminal prompts disabled'
AHC_RE_AUTHFAILED='Authentication failed|returned error: 401'
AHC_RE_FORBIDDEN='returned error: 403|Write access to repository not granted'
AHC_RE_NOTFOUND='returned error: 404|repository .* not found|Repository not found'
# Só linhas `fatal:`/`error:` contam; `remote:` é texto do servidor.
AHC_RE_GIT_ERROR_LINE='^(fatal|error):'

# Variáveis locais do git (`git rev-parse --local-env-vars`). Herdar qualquer
# uma faria o `reset --hard FETCH_HEAD` agir no repo de trabalho do dev em vez
# do cache (C5). Mesma lista do GIT_LOCAL_ENV_VARS do bin/ahc.
AHC_GIT_LOCAL_ENV_VARS='GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_CONFIG GIT_CONFIG_PARAMETERS GIT_OBJECT_DIRECTORY GIT_DIR GIT_WORK_TREE GIT_IMPLICIT_WORK_TREE GIT_GRAFT_FILE GIT_INDEX_FILE GIT_NO_REPLACE_OBJECTS GIT_REPLACE_REF_BASE GIT_PREFIX GIT_SHALLOW_FILE GIT_COMMON_DIR'
# GIT_TRACE* imprimem o header de auth quando GIT_TRACE_REDACT=0 (C9). O sweep
# por `compgen` pega as variantes que o git ganhar no futuro; a lista fixa é o
# que sobra se `compgen` não existir.
AHC_GIT_TRACE_ENV_VARS='GIT_TRACE GIT_TRACE2 GIT_TRACE2_EVENT GIT_TRACE2_PERF GIT_TRACE_CURL GIT_TRACE_CURL_NO_DATA GIT_TRACE_PACKET GIT_TRACE_PACK_ACCESS GIT_TRACE_PERFORMANCE GIT_TRACE_REFS GIT_TRACE_SETUP GIT_TRACE_SHALLOW GIT_TRACE_FSMONITOR'

git_base_url() {
  local raw="${AHC_TEST_GIT_BASE_URL:-}"
  if [ -n "$raw" ]; then
    if [[ $raw =~ $AHC_TEST_BASE_RE ]]; then
      echo "[ahc] modo de teste: base $raw" >&2
      printf '%s\n' "$raw"
      return 0
    fi
    echo "[ahc] aviso: AHC_TEST_GIT_BASE_URL ignorada (só http://127.0.0.1:<porta> ou http://[::1]:<porta>, sem userinfo, path ou query); usando $GIT_BASE_DEFAULT" >&2
  fi
  printf '%s\n' "$GIT_BASE_DEFAULT"
}

# Origem "embutido" da cascata. A troca pelo token de teste vale só quando a
# base é o loopback do harness: assim o literal embutido só é apresentado ao
# github.com, e o token de teste só ao loopback.
ahc_embedded_token() {
  if [ "$GIT_BASE" != "$GIT_BASE_DEFAULT" ]; then
    printf '%s' "${AHC_TEST_EMBEDDED_TOKEN:-}"
  else
    printf '%s' "$AHC_EMBEDDED_TOKEN"
  fi
}

# ---------------------------------------------------------------------------
# Cascata de origens de credencial em bash (T10 de 001-ahc-pat-auth)
#
# Espelho fiel do que o `bin/ahc` faz em JS (`credentialSources()`,
# `tokenConfigEntries()`, `classifyGitFailure()`, `gitRefresh()`): mesma ordem
# (env → config → embutido → credencial git), mesmas chaves de injeção, mesma
# classificação e os MESMOS rótulos. O AC-14 compara a ordem do log de
# `Authorization` do instalador com a do `ahc sync`; qualquer drift aqui
# aparece lá. A duplicação é deliberada (trade-off do §5): nada do repo existe
# antes do clone, então o instalador não tem como reaproveitar o CLI.
# ---------------------------------------------------------------------------

# Rótulos exibidos de cada origem — iguais ao SOURCE_LABELS do bin/ahc.
source_label() {
  case "$1" in
    env)      printf '%s' 'env (AHC_GITHUB_TOKEN)' ;;
    config)   printf '%s' 'config (token em ~/.claude/.ahc-config.json)' ;;
    embutido) printf '%s' 'embutido' ;;
    git)      printf '%s' 'credencial git' ;;
    *)        printf '%s' "$1" ;;
  esac
}

list_has() {
  local needle="$1" item
  for item in $2; do
    if [ "$item" = "$needle" ]; then return 0; fi
  done
  return 1
}

# Lê o `token` da config já existente ANTES do clone. Sem isto o instalador
# ignoraria o override que o dev gravou com `ahc config token=…` e reinstalar
# com o embutido revogado falharia, mesmo com um token válido em disco.
#
# O valor sai por stdout e é capturado por `$( )` — nunca por argv (C10) e
# nunca ecoado. Arquivo ausente, JSON inválido, `token` não-string ou vazio
# devolvem string vazia, que é "esta origem não existe" (C11). JSON inválido
# não é erro aqui: quem reclama dele é o `write_config_merged`, depois, e com a
# instrução de não sobrescrever.
read_config_token() {
  AHC_CFG_FILE="$CLAUDE_DIR/.ahc-config.json" node -e '
const fs = require("fs");
try {
  const cfg = JSON.parse(fs.readFileSync(process.env.AHC_CFG_FILE, "utf8"));
  const t = cfg && cfg.token;
  if (typeof t === "string") process.stdout.write(t);
} catch (e) { /* ausente, ilegível ou inválido: origem indisponível */ }
' 2>/dev/null || true
}

# Formas de segredo que nunca podem sair em stdout/stderr (C9): o valor de cada
# origem e o base64 de `x-access-token:<valor>`, que é o que vai no header.
# Mesmo piso do `secretCandidates()` do bin/ahc (comprimento >= 4).
build_secret_forms() {
  AHC_SECRET_FORMS="$(
    AHC_SF_ENV="${AHC_GITHUB_TOKEN:-}" \
    AHC_SF_CFG="$CFG_TOKEN" \
    AHC_SF_EMB="$(ahc_embedded_token)" \
    node -e '
const out = [];
for (const k of ["AHC_SF_ENV", "AHC_SF_CFG", "AHC_SF_EMB"]) {
  const v = process.env[k] || "";
  if (v.length < 4) continue;
  out.push(v);
  out.push(Buffer.from("x-access-token:" + v).toString("base64"));
}
process.stdout.write(out.join("\n"));
'
  )"
}

# C9: todo eco de stderr do git passa por aqui. Tira o header de Authorization
# inteiro, troca cada forma de segredo por `<redacted>` e entrega só a primeira
# linha, limitada — a mesma política do `redact()` do bin/ahc.
ahc_redact() {
  local s="$1" secret
  case "$s" in
    *Authorization:*)   s="${s%%Authorization:*}Authorization: <redacted>" ;;
    *authorization:*)   s="${s%%authorization:*}Authorization: <redacted>" ;;
  esac
  while IFS= read -r secret; do
    if [ -n "$secret" ]; then s="${s//$secret/<redacted>}"; fi
  done <<EOF
${AHC_SECRET_FORMS:-}
EOF
  s="${s%%$'\n'*}"
  if [ "${#s}" -gt 300 ]; then s="${s:0:300}…"; fi
  printf '%s' "$s"
}

# C6: o índice das chaves injetadas parte do GIT_CONFIG_COUNT herdado, ou seja,
# ele entra numa soma — e no bash `$((VAR + 0))` EXECUTA um `$(...)` contido na
# variável. Validar `^[0-9]+$` antes de qualquer aritmética é o controle; o
# valor nunca é ecoado, porque pode ter sido plantado no ambiente.
inherited_git_config_count() {
  local raw="${GIT_CONFIG_COUNT:-}"
  if [ -z "$raw" ]; then printf '0'; return 0; fi
  case "$raw" in ''|*[!0-9]*) return 1 ;; esac
  if [ "${#raw}" -gt 4 ]; then return 1; fi
  printf '%s' "$raw"
}

# Uma invocação de git com o ambiente do contrato (§5, "Injeção por invocação").
#   $1 = cwd, $2 = rodada (`token` ou `git`), $3 = token (vazio na rodada git)
# O resto são os argumentos do git. Tudo acontece num subshell: as variáveis
# saneadas e o header não escapam para o `ahc sync` nem para o `node` (C10).
ahc_git() {
  local run_cwd="$1" round="$2" token="$3"
  shift 3
  (
    local v i basic
    # C5 — env do git saneada.
    for v in $AHC_GIT_LOCAL_ENV_VARS $AHC_GIT_TRACE_ENV_VARS GIT_CURL_VERBOSE; do
      unset "$v" 2>/dev/null || true
    done
    for v in $(compgen -v 2>/dev/null | grep '^GIT_TRACE' || true); do
      unset "$v" 2>/dev/null || true
    done
    export GIT_TRACE_REDACT=1
    # Não interativo: nem terminal, nem askpass, nem diálogo do GCM (AC-02/03).
    export GIT_TERMINAL_PROMPT=0
    export GIT_ASKPASS=''
    export SSH_ASKPASS=''
    export GCM_INTERACTIVE=never
    # C4 — a classificação casa mensagens em inglês.
    export LC_ALL=C
    export LANGUAGE=C

    i="$GIT_CFG_BASE"
    export "GIT_CONFIG_KEY_$i=http.lowSpeedLimit"; export "GIT_CONFIG_VALUE_$i=1000"; i=$((i + 1))
    export "GIT_CONFIG_KEY_$i=http.lowSpeedTime";  export "GIT_CONFIG_VALUE_$i=30";   i=$((i + 1))

    if [ "$round" = token ]; then
      # Base64 pelo node: `base64 | tr -d` difere entre macOS e Linux (quebra de
      # linha a cada 76 colunas no GNU coreutils) e produziria um header
      # inválido num dos dois. O token entra por ambiente, jamais por argv (C10).
      basic="$(AHC_BASIC_TOKEN="$token" node -e 'process.stdout.write(Buffer.from("x-access-token:" + process.env.AHC_BASIC_TOKEN).toString("base64"))')"
      # Genérico de propósito: o reset vazio zera também o helper com escopo de
      # URL (`credential.<url>.helper`, o formato do `gh auth setup-git`), então
      # nenhum helper do dev responde ao 401 de uma rodada rotulada env/config/
      # embutido — é o que mantém o rótulo da origem verdadeiro.
      export "GIT_CONFIG_KEY_$i=credential.helper"; export "GIT_CONFIG_VALUE_$i="; i=$((i + 1))
      # C1: escopo da URL completa, não `http.extraHeader` genérico. Um
      # `http.<base>.extraheader` do dev vence o reset genérico (E1/E2) e o
      # header genérico acompanha a URL reescrita por `insteadOf` (E4a/C3).
      # O primeiro valor, vazio, zera a lista multi-valorada; o segundo injeta.
      export "GIT_CONFIG_KEY_$i=http.$HUB_URL.extraHeader"; export "GIT_CONFIG_VALUE_$i="; i=$((i + 1))
      export "GIT_CONFIG_KEY_$i=http.$HUB_URL.extraHeader"; export "GIT_CONFIG_VALUE_$i=Authorization: Basic $basic"; i=$((i + 1))
      # C2: no default (`initial`) o curl tira o header do GET redirecionado,
      # mas o git manda o POST git-upload-pack ao novo host COM o header (E5).
      export "GIT_CONFIG_KEY_$i=http.$HUB_URL.followRedirects"; export "GIT_CONFIG_VALUE_$i=false"; i=$((i + 1))
    fi
    export GIT_CONFIG_COUNT="$i"

    cd "$run_cwd" || exit 1
    # stdin fechado: mesmo que algo escape do não-interativo, não há o que ler.
    exec git "$@" </dev/null
  )
}

# Validação de `repo`/`branch` antes de qualquer rede e antes de qualquer
# escrita no HOME. O T9 deixou esta parte para cá porque é aqui que a URL passa
# a ser montada em bash. Mesmos critérios do `validateHubRef()` do bin/ahc.
validate_hub_ref() {
  if ! [[ $REPO =~ $AHC_REPO_SLUG_RE ]]; then
    echo "[ahc] ERRO: repo inválido ($REPO): esperado <owner>/<nome> com letras, dígitos, ponto, hífen ou underscore. Ajuste AHC_REPO ou copie o comando atualizado da wiki." >&2
    return 1
  fi
  case "$BRANCH" in
    '' | -*)
      echo "[ahc] ERRO: branch inválida: não pode ser vazia nem começar com \"-\". Ajuste AHC_BRANCH." >&2
      return 1
      ;;
  esac
  # Comando puramente local (não abre rede, não precisa de repo). O cwd neutro
  # evita que `@{-1}` e afins resolvam contra o repo de trabalho do dev.
  if ! ahc_git "${TMPDIR:-/tmp}" git '' check-ref-format --branch "$BRANCH" >/dev/null 2>&1; then
    echo "[ahc] ERRO: branch inválida: \`git check-ref-format --branch\` recusou o valor. Ajuste AHC_BRANCH." >&2
    return 1
  fi
}

# Classifica a última falha de git a partir de $GIT_ERR_FILE.
#   $1 = rodada (`token` ou `git`)
# Define CLASS_KIND e CLASS_DETAIL. Na rodada `git`, que é a última, nada
# avança: `could not read Username` vira `unavailable` (tentada, sem credencial
# para apresentar) e 404 vira `notfound`, exatamente como no bin/ahc.
classify_git_failure() {
  local round="$1" line body
  CLASS_KIND=unknown
  CLASS_DETAIL=""
  while IFS= read -r line; do
    # trim
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    if ! printf '%s\n' "$line" | grep -qE "$AHC_RE_GIT_ERROR_LINE"; then continue; fi
    body="$line"
    if printf '%s\n' "$body" | grep -qiE "$AHC_RE_NETWORK"; then
      CLASS_KIND=network
    elif printf '%s\n' "$body" | grep -qiE "$AHC_RE_REDIRECT"; then
      CLASS_KIND=redirect
    elif printf '%s\n' "$body" | grep -qiE "$AHC_RE_NOCRED"; then
      if [ "$round" = git ]; then CLASS_KIND=unavailable; else CLASS_KIND=refused; fi
    elif printf '%s\n' "$body" | grep -qiE "$AHC_RE_AUTHFAILED"; then
      CLASS_KIND=refused
    elif printf '%s\n' "$body" | grep -qiE "$AHC_RE_FORBIDDEN"; then
      CLASS_KIND=refused
    elif printf '%s\n' "$body" | grep -qiE "$AHC_RE_NOTFOUND"; then
      if [ "$round" = git ]; then CLASS_KIND=notfound; else CLASS_KIND=refused; fi
    else
      continue
    fi
    CLASS_DETAIL="$(ahc_redact "$line")"
    return 0
  done < "$GIT_ERR_FILE"

  # Nenhuma linha reconhecida: `desconhecido`, que também não avança (C4).
  # O detalhe é a primeira linha `fatal:`/`error:` (o que o `classifyGitFailure`
  # do bin/ahc usa); só quando não existe nenhuma é que a primeira linha crua do
  # stderr entra — o caso do git que nem chegou a rodar.
  line="$(grep -E "$AHC_RE_GIT_ERROR_LINE" "$GIT_ERR_FILE" 2>/dev/null | head -n 1 || true)"
  if [ -z "$line" ]; then
    line="$(head -n 1 "$GIT_ERR_FILE" 2>/dev/null || true)"
  fi
  CLASS_DETAIL="$(ahc_redact "$line")"
  return 0
}

# Texto do motivo, no mesmo formato do `accessWhat()` do bin/ahc.
access_what() {
  case "$CLASS_KIND" in
    unavailable) printf '%s' "$(source_label git): nenhuma configurada ($CLASS_DETAIL)" ;;
    network)     printf '%s' "rede/timeout ($CLASS_DETAIL)" ;;
    redirect)    printf '%s' "redirect recusado ($CLASS_DETAIL)" ;;
    notfound)    printf '%s' "repo não encontrado ($CLASS_DETAIL)" ;;
    refused)     printf '%s' "acesso recusado ($CLASS_DETAIL)" ;;
    *)           printf '%s' "falha não classificada ($CLASS_DETAIL)" ;;
  esac
}

# Uma tentativa completa de uma origem: `fetch`+`reset` se o cache já existe,
# `clone` se não. O `fetch` usa a URL EXPLÍCITA, nunca `origin`: um remoto
# antigo pode carregar credencial na userinfo e não é a fonte de verdade.
hub_git_attempt() {
  local round="$1" token="$2"
  : > "$GIT_ERR_FILE"
  if [ -d "$CACHE/.git" ]; then
    ahc_git "$CACHE_DIR" "$round" "$token" -C "$CACHE" fetch --depth=1 --quiet "$HUB_URL" "refs/heads/$BRANCH" 2>>"$GIT_ERR_FILE" || return 1
    ahc_git "$CACHE_DIR" "$round" "$token" -C "$CACHE" reset --hard --quiet FETCH_HEAD 2>>"$GIT_ERR_FILE" || return 1
  else
    ahc_git "$CACHE_DIR" "$round" "$token" clone --depth=1 --branch "$BRANCH" --quiet "$HUB_URL" "$CACHE" 2>>"$GIT_ERR_FILE" || return 1
  fi
  return 0
}

# Origens disponíveis, na ordem fixa do §5. env/config/embutido só existem com
# valor não vazio; a rodada `git` é sempre a última e sempre é tentada (ela
# pode ficar "indisponível", que é outra coisa: tentada, sem nada a apresentar).
credential_sources() {
  local out=''
  if [ -n "${AHC_GITHUB_TOKEN:-}" ]; then out="$out env"; fi
  if [ -n "$CFG_TOKEN" ]; then out="$out config"; fi
  if [ -n "$(ahc_embedded_token)" ]; then out="$out embutido"; fi
  printf '%s' "$out git"
}

# A cascata. Devolve 0 com HUB_SOURCE preenchido, ou 1 depois de imprimir o
# erro. Nada é persistido: trocar o token por env ou config vale já na próxima
# execução, sobre o mesmo cache (premissa F3).
hub_access() {
  local id token round labels label refused_ids tried_ids

  tried_ids=''
  refused_ids=''
  HUB_SOURCE=''
  HUB_REFUSED=''

  for id in $(credential_sources); do
    if [ "$id" = git ]; then
      round=git
      token=''
    else
      round=token
      case "$id" in
        env)      token="${AHC_GITHUB_TOKEN:-}" ;;
        config)   token="$CFG_TOKEN" ;;
        embutido) token="$(ahc_embedded_token)" ;;
      esac
    fi
    tried_ids="$tried_ids $id"

    if hub_git_attempt "$round" "$token"; then
      # Sucesso: para aqui. Nenhuma origem posterior é apresentada (AC-14).
      HUB_SOURCE="$id"
      HUB_REFUSED="$refused_ids"
      return 0
    fi

    classify_git_failure "$round"

    # Um clone abortado deixa o diretório para trás; sem limpar, a próxima
    # origem cairia no ramo do `fetch` sobre um cache sem `.git`.
    if [ -e "$CACHE" ] && [ ! -d "$CACHE/.git" ]; then
      rm -rf "$CACHE"
    fi

    case "$CLASS_KIND" in
      refused)
        refused_ids="$refused_ids $id"
        ;;
      unavailable)
        # Tentada, mas não apresentou nada: não entra na lista de recusadas.
        # É o que separa as linhas 6 e 7 do AC-14.
        ;;
      *)
        # Rede, redirect, 404 sem token, não classificado: para na hora, sem
        # apresentar mais nenhuma origem.
        echo "[ahc] ERRO: acesso ao hub falhou em $REPO@$BRANCH via $(source_label "$id"): $(access_what)" >&2
        return 1
        ;;
    esac
  done

  labels=''
  for id in $tried_ids; do
    if list_has "$id" "$refused_ids"; then
      label="$(source_label "$id")"
    else
      label="$(source_label "$id"): nenhuma configurada"
    fi
    if [ -z "$labels" ]; then labels="$label"; else labels="$labels, $label"; fi
  done
  echo "[ahc] ERRO: acesso ao hub recusado por todas as origens ($labels). Informe um token com AHC_GITHUB_TOKEN=<token> ou copie o comando atualizado da wiki." >&2
  return 1
}

# `git --version` → "git version 2.39.5 (Apple Git-154)". Só major.minor
# interessa. Formato inesperado conta como "não atende": é preferível mandar
# atualizar o git a seguir e falhar no meio do clone.
git_version_ok() {
  local raw ver major rest minor
  raw="$(git --version 2>/dev/null || true)"
  ver="${raw#git version }"
  ver="${ver%% *}"
  major="${ver%%.*}"
  rest="${ver#*.}"
  minor="${rest%%.*}"
  case "$major" in ''|*[!0-9]*) return 1 ;; esac
  case "$minor" in ''|*[!0-9]*) return 1 ;; esac
  if [ "$major" -gt "$GIT_MIN_MAJOR" ]; then return 0; fi
  if [ "$major" -eq "$GIT_MIN_MAJOR" ] && [ "$minor" -ge "$GIT_MIN_MINOR" ]; then return 0; fi
  return 1
}

# Merge da config local (C11). O que já está no arquivo sobrevive — inclusive o
# `token` que o dev gravou com `ahc config token=…` e qualquer chave que uma
# versão futura do ahc tenha escrito; só `repo`, `branch` e `channel` passam a
# valer os desta execução.
#
# Escrita por tmp com modo 600 + rename, o mesmo contrato do `writeConfigFile()`
# do bin/ahc: nunca existe uma janela em que o arquivo final esteja legível por
# outro usuário, e um erro no meio não deixa a config pela metade. JSON inválido
# aborta sem sobrescrever — apagar o arquivo apagaria o token junto.
#
# Os valores vão por ambiente, não por argv (C10): argv de processo é legível
# por qualquer processo do mesmo usuário.
write_config_merged() {
  AHC_CFG_FILE="$CLAUDE_DIR/.ahc-config.json" \
  AHC_CFG_REPO="$REPO" \
  AHC_CFG_BRANCH="$BRANCH" \
  AHC_CFG_CHANNEL="$CHANNEL" \
  node -e '
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const f = process.env.AHC_CFG_FILE;
let cfg = {};
if (fs.existsSync(f)) {
  let raw;
  try {
    raw = fs.readFileSync(f, "utf8");
  } catch (e) {
    console.error("[ahc] ERRO: não consegui ler " + f + "; nada foi sobrescrito.");
    process.exit(1);
  }
  if (raw.trim() !== "") {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("[ahc] ERRO: " + f + " não é JSON válido; nada foi sobrescrito. Corrija o arquivo (ou mova-o para outro nome) e rode o instalador de novo.");
      process.exit(1);
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.error("[ahc] ERRO: " + f + " não contém um objeto JSON; nada foi sobrescrito. Corrija o arquivo (ou mova-o para outro nome) e rode o instalador de novo.");
      process.exit(1);
    }
    cfg = parsed;
  }
}
cfg.repo = process.env.AHC_CFG_REPO;
cfg.branch = process.env.AHC_CFG_BRANCH;
cfg.channel = process.env.AHC_CFG_CHANNEL;
const dir = path.dirname(f);
fs.mkdirSync(dir, { recursive: true });
const data = JSON.stringify(cfg, null, 2) + "\n";
const tmp = path.join(dir, ".ahc-config.json." + process.pid + "." + crypto.randomBytes(6).toString("hex") + ".tmp");
try {
  // `wx` garante que não estamos reaproveitando um tmp de outro processo.
  fs.writeFileSync(tmp, data, { mode: 0o600, flag: "wx" });
  // O `mode` do open é filtrado pelo umask; o chmod no tmp (que ainda não é o
  // arquivo final, logo não expõe nada) garante 600 exatos em qualquer umask.
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, f);
} catch (e) {
  try { fs.unlinkSync(tmp); } catch (e2) {}
  console.error("[ahc] ERRO: falha ao gravar " + f + " (" + e.code + ").");
  process.exit(1);
}
'
}

main() {
  REPO="${AHC_REPO:-washingtonsarago/agents-hub-claude}"
  BRANCH="${AHC_BRANCH:-main}"
  CHANNEL="stable"

  BIN_DIR="${AHC_BIN_DIR:-$HOME/.local/bin}"
  CLAUDE_DIR="$HOME/.claude"
  CACHE_DIR="$CLAUDE_DIR/.ahc-cache"
  CACHE="$CACHE_DIR/$(echo "$REPO" | tr '/' '_')"
  SETTINGS="$CLAUDE_DIR/settings.json"

  GIT_BASE="$(git_base_url)"

  echo "[ahc] installing from $REPO@$BRANCH"

  command -v node >/dev/null 2>&1 || { echo "[ahc] node is required" >&2; exit 1; }
  command -v git  >/dev/null 2>&1 || { echo "[ahc] git is required"  >&2; exit 1; }

  # Preflight de versão do git antes de qualquer escrita: falhar aqui não deixa
  # rastro no HOME do dev.
  if ! git_version_ok; then
    echo "[ahc] ERRO: o ahc exige git >= ${GIT_MIN_MAJOR}.${GIT_MIN_MINOR} (encontrado: $(git --version 2>/dev/null || echo 'desconhecido')). Atualize o git e rode o instalador de novo." >&2
    return 1
  fi

  # C6 — validado antes de qualquer aritmética e antes de rodar git. Um valor
  # com `$(...)` seria executado por `$((VAR + 0))`, então ele nunca é ecoado.
  if ! GIT_CFG_BASE="$(inherited_git_config_count)"; then
    echo "[ahc] ERRO: GIT_CONFIG_COUNT herdado do ambiente é inválido (esperado só dígitos). Nenhum comando git foi executado. Rode \`unset GIT_CONFIG_COUNT\` e tente de novo." >&2
    return 1
  fi

  # Validação de repo/branch antes do mkdir: falhar aqui não deixa rastro no
  # HOME do dev e não abre rede.
  validate_hub_ref || return 1

  mkdir -p "$BIN_DIR" "$CLAUDE_DIR" "$CACHE_DIR"

  HUB_URL="$GIT_BASE/$REPO.git"

  # O `token` da config já existente é uma origem da cascata — e precisa ser
  # lido ANTES do clone, senão reinstalar com o embutido revogado falharia
  # mesmo com um token válido em disco.
  CFG_TOKEN="$(read_config_token)"
  build_secret_forms

  GIT_ERR_FILE="$(mktemp "${TMPDIR:-/tmp}/ahc-git-err.XXXXXX")"
  trap 'rm -f "$GIT_ERR_FILE"' EXIT

  # Clone ou atualização do cache pela cascata de origens (§5): env → config →
  # embutido → credencial git. Uma origem recusada cede a vez à seguinte; só a
  # recusa de TODAS é falha.
  if [ -d "$CACHE/.git" ]; then
    echo "[ahc] updating cache at $CACHE"
  else
    echo "[ahc] cloning $REPO → $CACHE"
  fi
  hub_access || return 1
  if [ -n "$HUB_REFUSED" ]; then
    labels=''
    for id in $HUB_REFUSED; do
      if [ -z "$labels" ]; then labels="$(source_label "$id")"; else labels="$labels, $(source_label "$id")"; fi
    done
    echo "[ahc] aviso: hub autenticado via $(source_label "$HUB_SOURCE"); origem(ns) recusada(s): $labels. Rode \`ahc doctor\`."
  fi

  # Install the CLI from the cache
  cp "$CACHE/bin/ahc" "$BIN_DIR/ahc"
  chmod +x "$BIN_DIR/ahc"
  echo "[ahc] installed $BIN_DIR/ahc"

  # PATH check
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) echo "[ahc] WARNING: $BIN_DIR is not in PATH. Add to your shell rc:"
       echo '         export PATH="$HOME/.local/bin:$PATH"' ;;
  esac

  # Local config — mesclada, nunca sobrescrita em bloco (AC-15).
  write_config_merged

  # SessionStart hook — safely merged into settings.json via node (preserves existing config)
  HOOK_CMD="$BIN_DIR/ahc sync --quiet --timeout=5"
  SETTINGS="$SETTINGS" HOOK_CMD="$HOOK_CMD" node -e '
const fs = require("fs");
const f = process.env.SETTINGS;
const cmd = process.env.HOOK_CMD;
let s = {};
if (fs.existsSync(f)) {
  try { s = JSON.parse(fs.readFileSync(f, "utf8")); }
  catch (e) { console.error("[ahc] settings.json is invalid JSON; leaving untouched. Fix manually."); process.exit(1); }
}
s.hooks = s.hooks || {};
s.hooks.SessionStart = s.hooks.SessionStart || [];
const already = JSON.stringify(s.hooks.SessionStart).includes("ahc sync");
if (already) { console.log("[ahc] SessionStart hook already configured"); process.exit(0); }
s.hooks.SessionStart.push({
  matcher: "*",
  hooks: [{ type: "command", command: cmd }]
});
fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n");
console.log("[ahc] SessionStart hook added to " + f);
' || echo "[ahc] WARNING: failed to configure hook automatically — add this block to $SETTINGS manually: { \"hooks\": { \"SessionStart\": [{ \"matcher\": \"*\", \"hooks\": [{ \"type\": \"command\", \"command\": \"$HOOK_CMD\" }] }] } }"

  # First sync — sem `|| true`: uma sync que falha é uma instalação que não
  # funciona, e reportar sucesso aqui distorceria a medição do GOAL (AC-03).
  echo "[ahc] running first sync..."
  if ! "$BIN_DIR/ahc" sync; then
    echo "[ahc] ERRO: a primeira sincronização falhou. O CLI ficou em $BIN_DIR/ahc; resolva o acesso ao hub e rode \`ahc sync\` de novo." >&2
    return 1
  fi
  echo "[ahc] done. try: ahc list"
}

main "$@"
