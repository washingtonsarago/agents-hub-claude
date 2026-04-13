#!/usr/bin/env bash
# ahc installer — baixa a CLI e configura o hook SessionStart no Claude Code
set -euo pipefail

REPO="${AHC_REPO:-EMS-NCTECH/agents-hub-claude}"
BRANCH="${AHC_BRANCH:-main}"
BIN_DIR="${AHC_BIN_DIR:-$HOME/.local/bin}"
CLAUDE_DIR="$HOME/.claude"
SETTINGS="$CLAUDE_DIR/settings.json"

echo "[ahc] installing from $REPO@$BRANCH"

command -v node >/dev/null 2>&1 || { echo "[ahc] node is required" >&2; exit 1; }

mkdir -p "$BIN_DIR" "$CLAUDE_DIR"

URL="https://raw.githubusercontent.com/$REPO/$BRANCH/bin/ahc"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$URL" -o "$BIN_DIR/ahc"
else
  wget -qO "$BIN_DIR/ahc" "$URL"
fi
chmod +x "$BIN_DIR/ahc"
echo "[ahc] installed at $BIN_DIR/ahc"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "[ahc] WARNING: $BIN_DIR is not in PATH. Add to your shell rc:"
     echo '         export PATH="$HOME/.local/bin:$PATH"' ;;
esac

# Grava config inicial
cat > "$CLAUDE_DIR/.ahc-config.json" <<EOF
{
  "repo": "$REPO",
  "branch": "$BRANCH",
  "channel": "stable"
}
EOF

# Instala hook SessionStart de forma idempotente (sem jq: regrava se ausente)
HOOK_CMD="$BIN_DIR/ahc sync --quiet --timeout=3"
if [ -f "$SETTINGS" ] && grep -q '"ahc sync"' "$SETTINGS" 2>/dev/null; then
  echo "[ahc] hook already present in settings.json"
elif [ ! -f "$SETTINGS" ]; then
  cat > "$SETTINGS" <<EOF
{
  "hooks": {
    "SessionStart": [
      { "matcher": "*", "hooks": [{ "type": "command", "command": "$HOOK_CMD" }] }
    ]
  }
}
EOF
  echo "[ahc] created $SETTINGS with SessionStart hook"
else
  echo "[ahc] settings.json exists — add this hook manually:"
  echo
  echo '  "hooks": { "SessionStart": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "'"$HOOK_CMD"'" }] }] }'
  echo
fi

echo "[ahc] running first sync..."
"$BIN_DIR/ahc" sync || true
echo "[ahc] done. try: ahc list"
