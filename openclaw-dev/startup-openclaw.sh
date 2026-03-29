#!/bin/bash
set -e

echo "=== Juanse (OpenClaw + Dev Bot) — Starting ==="

# --- Step 1: System setup (same as original startup.sh) ---

# Configure git
git config --global user.name "Chief Dev Bot"
git config --global user.email "dev@laiky.ai"
git config --global --add safe.directory /repo

# Clone or update repo
if [ ! -d "/repo/.git" ]; then
  if [ -n "$GITHUB_PAT" ]; then
    echo "[startup] Cloning repository..."
    git clone "https://${GITHUB_PAT}@github.com/rasheedb1/CadenceV1.0.git" /repo 2>/dev/null || echo "[startup] Clone failed, continuing"
  fi
else
  echo "[startup] Updating repository..."
  cd /repo && git pull origin main 2>/dev/null || echo "[startup] git pull failed, continuing"
fi

# Configure gh CLI
if [ -n "$GITHUB_PAT" ]; then
  echo "$GITHUB_PAT" | gh auth login --with-token 2>/dev/null || true
fi

# Create Claude Code config
mkdir -p /home/node/.claude
cat > /home/node/.claude/settings.json << 'SETTINGS'
{
  "permissions": {
    "allow": ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebSearch", "WebFetch"]
  }
}
SETTINGS

# --- Step 2: OpenClaw onboard ---
cd /app
if [ ! -f "/home/node/.openclaw/.onboarded" ]; then
  echo "[startup] Running OpenClaw onboard..."
  node dist/index.js onboard --mode local --no-install-daemon 2>/dev/null || true
  node dist/index.js config set gateway.mode local 2>/dev/null || true
  node dist/index.js config set gateway.bind lan 2>/dev/null || true
  touch /home/node/.openclaw/.onboarded
fi
node dist/index.js doctor --fix 2>/dev/null || true

# --- Step 3: Start Juanse Express server (Telegram bot handler) ---
echo "[startup] Starting Juanse Express server..."
node /home/node/juanse/dist/index.js &
JUANSE_PID=$!
echo "[startup] Juanse Express server started (PID=$JUANSE_PID)"

# --- Step 4: Start OpenClaw gateway on INTERNAL port 18789 ---
export GATEWAY_PORT=18789
echo "[startup] Starting OpenClaw gateway on internal port ${GATEWAY_PORT}..."
cd /app
node dist/index.js gateway --bind lan --port "${GATEWAY_PORT}" &
GATEWAY_PID=$!
echo "[startup] OpenClaw gateway started (PID=$GATEWAY_PID)"

# Wait for gateway to be ready (up to 30s)
echo "[startup] Waiting for gateway..."
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${GATEWAY_PORT}/healthz" > /dev/null 2>&1; then
    echo "[startup] Gateway ready!"
    break
  fi
  sleep 1
done

# --- Step 5: Start A2A server on $PORT (Railway-exposed) ---
echo "[startup] Starting A2A server on port ${PORT:-8080}..."
echo "[startup] A2A node_modules: $(ls /home/node/.openclaw/node_modules/ 2>/dev/null | head -5 || echo 'MISSING')"
cd /home/node/.openclaw
exec node a2a-server.js
