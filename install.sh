#!/usr/bin/env bash
# ahc installer — clones the hub via git and configures SessionStart hook
set -euo pipefail

REPO="${AHC_REPO:-EMS-NCTECH/agents-hub-claude}"
BRANCH="${AHC_BRANCH:-main}"
BIN_DIR="${AHC_BIN_DIR:-$HOME/.local/bin}"
CLAUDE_DIR="$HOME/.claude"
CACHE_DIR="$CLAUDE_DIR/.ahc-cache"
CACHE="$CACHE_DIR/$(echo "$REPO" | tr '/' '_')"
SETTINGS="$CLAUDE_DIR/settings.json"

echo "[ahc] installing from $REPO@$BRANCH"

command -v node >/dev/null 2>&1 || { echo "[ahc] node is required" >&2; exit 1; }
command -v git  >/dev/null 2>&1 || { echo "[ahc] git is required"  >&2; exit 1; }

mkdir -p "$BIN_DIR" "$CLAUDE_DIR" "$CACHE_DIR"

# Clone or update the hub cache (uses your git credentials — works with private/INTERNAL repos)
if [ -d "$CACHE/.git" ]; then
  echo "[ahc] updating cache at $CACHE"
  git -C "$CACHE" fetch origin "$BRANCH" --depth=1 --quiet
  git -C "$CACHE" reset --hard FETCH_HEAD --quiet
else
  echo "[ahc] cloning $REPO → $CACHE"
  git clone --depth=1 --branch "$BRANCH" --quiet "https://github.com/$REPO.git" "$CACHE"
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

# Local config
cat > "$CLAUDE_DIR/.ahc-config.json" <<EOF
{
  "repo": "$REPO",
  "branch": "$BRANCH",
  "channel": "stable"
}
EOF

# SessionStart hook (idempotent — skip if already present)
HOOK_CMD="$BIN_DIR/ahc sync --quiet --timeout=5"
if [ -f "$SETTINGS" ] && grep -q 'ahc sync' "$SETTINGS" 2>/dev/null; then
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

# First sync
echo "[ahc] running first sync..."
"$BIN_DIR/ahc" sync || true
echo "[ahc] done. try: ahc list"
