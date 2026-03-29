#!/bin/bash
# Juanse (OpenClaw + A2A) Startup
# A2A server starts IMMEDIATELY on $PORT — everything else is background.

echo "=== Juanse (OpenClaw + A2A) — Starting ==="

# --- Background: all heavy setup (onboard, gateway, git, express) ---
(
  cd /app

  # OpenClaw onboard
  if [ ! -f "/home/node/.openclaw/.onboarded" ]; then
    echo "[bg] Running OpenClaw onboard..."
    node dist/index.js onboard --mode local --no-install-daemon 2>/dev/null || true
    node dist/index.js config set gateway.mode local 2>/dev/null || true
    node dist/index.js config set gateway.bind lan 2>/dev/null || true
    touch /home/node/.openclaw/.onboarded
  fi
  node dist/index.js doctor --fix 2>/dev/null || true

  # Start gateway on 18789
  echo "[bg] Starting gateway on 18789..."
  node dist/index.js gateway --bind lan --port 18789 &

  # Git setup
  git config --global user.name "Chief Dev Bot" 2>/dev/null
  git config --global user.email "dev@laiky.ai" 2>/dev/null
  git config --global --add safe.directory /repo 2>/dev/null
  if [ ! -d "/repo/.git" ] && [ -n "$GITHUB_PAT" ]; then
    git clone "https://${GITHUB_PAT}@github.com/rasheedb1/CadenceV1.0.git" /repo 2>/dev/null || true
  elif [ -d "/repo/.git" ]; then
    cd /repo && git pull origin main 2>/dev/null || true
  fi
  [ -n "$GITHUB_PAT" ] && echo "$GITHUB_PAT" | gh auth login --with-token 2>/dev/null || true

  # Claude Code config
  mkdir -p /home/node/.claude
  echo '{"permissions":{"allow":["Read","Write","Edit","Bash","Glob","Grep","WebSearch","WebFetch"]}}' > /home/node/.claude/settings.json

  # Juanse Express on 3100 (optional)
  PORT=3100 node /home/node/juanse/dist/index.js 2>/dev/null || echo "[bg] Express failed (non-critical)"
) &

# --- Foreground: A2A server on $PORT (starts in <2s) ---
export GATEWAY_PORT=18789
echo "[startup] Starting A2A server on port ${PORT:-8080}..."
cd /home/node/.openclaw
exec node a2a-server.js
