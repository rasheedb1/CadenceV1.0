#!/bin/bash
# Juanse (OpenClaw + A2A) Startup
# Key: A2A server starts FIRST on $PORT so Railway sees the port quickly.
# Gateway + Express start in background after.

echo "=== Juanse (OpenClaw + A2A) — Starting ==="

# --- Step 1: OpenClaw onboard (fast, non-blocking) ---
cd /app
if [ ! -f "/home/node/.openclaw/.onboarded" ]; then
  echo "[startup] Running OpenClaw onboard..."
  node dist/index.js onboard --mode local --no-install-daemon 2>/dev/null || true
  node dist/index.js config set gateway.mode local 2>/dev/null || true
  node dist/index.js config set gateway.bind lan 2>/dev/null || true
  touch /home/node/.openclaw/.onboarded
fi
node dist/index.js doctor --fix 2>/dev/null || true

# --- Step 2: Start OpenClaw gateway on INTERNAL port 18789 ---
export GATEWAY_PORT=18789
echo "[startup] Starting OpenClaw gateway on port ${GATEWAY_PORT}..."
cd /app
node dist/index.js gateway --bind lan --port "${GATEWAY_PORT}" &
echo "[startup] Gateway starting in background..."

# --- Step 3: Git + Juanse Express (all in background, non-blocking) ---
(
  # Configure git
  git config --global user.name "Chief Dev Bot" 2>/dev/null
  git config --global user.email "dev@laiky.ai" 2>/dev/null
  git config --global --add safe.directory /repo 2>/dev/null

  # Clone or update repo
  if [ ! -d "/repo/.git" ]; then
    if [ -n "$GITHUB_PAT" ]; then
      git clone "https://${GITHUB_PAT}@github.com/rasheedb1/CadenceV1.0.git" /repo 2>/dev/null || true
    fi
  else
    cd /repo && git pull origin main 2>/dev/null || true
  fi

  # Configure gh CLI
  if [ -n "$GITHUB_PAT" ]; then
    echo "$GITHUB_PAT" | gh auth login --with-token 2>/dev/null || true
  fi

  # Claude Code config
  mkdir -p /home/node/.claude
  cat > /home/node/.claude/settings.json << 'SETTINGS'
{
  "permissions": {
    "allow": ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch"]
  }
}
SETTINGS

  # Start Juanse Express on port 3100 (optional — may fail without Twilio env vars)
  PORT=3100 node /home/node/juanse/dist/index.js 2>/dev/null || echo "[startup] Juanse Express failed (non-critical)"
) &
echo "[startup] Background setup started (git + express)"

# --- Step 4: Start A2A server on $PORT (Railway-exposed) — MUST START FAST ---
echo "[startup] Starting A2A server on port ${PORT:-8080}..."
cd /home/node/.openclaw
exec node a2a-server.js
