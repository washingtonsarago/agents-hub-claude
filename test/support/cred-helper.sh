#!/usr/bin/env bash
# Credential helper simulado — infraestrutura de teste (T2 da demanda
# 001-ahc-pat-auth). Faz o papel da credencial git do próprio dev (C_DEV):
# o que um osxkeychain, um Git Credential Manager ou um `gh auth setup-git`
# entregariam ao git sem abrir prompt.
#
# Configuração no HOME temporário do teste:
#   git config --global credential.helper "<caminho>/cred-helper.sh"
#
# O valor é fictício e literal. Nenhum token real passa por aqui.
set -u

AHC_TEST_CRED_USERNAME="${AHC_TEST_CRED_USERNAME:-dev}"
AHC_TEST_CRED_PASSWORD="${AHC_TEST_CRED_PASSWORD:-C_DEV}"

case "${1:-}" in
  get)
    # O git escreve a descrição da credencial no stdin e fecha o pipe.
    # Drenar evita SIGPIPE do lado dele.
    cat >/dev/null 2>&1 || true
    printf 'username=%s\n' "$AHC_TEST_CRED_USERNAME"
    printf 'password=%s\n' "$AHC_TEST_CRED_PASSWORD"
    ;;
  *)
    # store / erase / qualquer outra operação: no-op silencioso.
    cat >/dev/null 2>&1 || true
    ;;
esac
