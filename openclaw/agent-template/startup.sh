#!/bin/bash
# OpenClaw Agent Startup Script (A2A Protocol)
# 1. Injects dynamic SOUL.md from env var
# 2. Starts OpenClaw gateway on internal port 18789
# 3. Starts A2A server on $PORT (Railway-exposed)

set -e

WORKSPACE="/home/node/.openclaw/workspace"
CONFIG="/home/node/.openclaw/openclaw.json"
A2A_DIR="/home/node/.openclaw"

echo "[startup] Agent: ${AGENT_NAME:-unknown} (ID: ${AGENT_ID:-unknown})"
echo "[startup] Org ID: ${ORG_ID:-not set}"
echo "[startup] Protocol: A2A v0.3.0"

# --- Step 1: Inject dynamic SOUL.md from env var ---
if [ -n "$SOUL_MD" ]; then
  echo "$SOUL_MD" > "$WORKSPACE/SOUL.md"
  echo "[startup] Injected SOUL.md from env ($(echo "$SOUL_MD" | wc -c) bytes)"
else
  echo "[startup] Using default SOUL.md from workspace"
fi

# --- Step 2: Set Anthropic API key + configure OpenClaw ---
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "[startup] WARNING: ANTHROPIC_API_KEY not set"
fi

# Run onboard in local mode (non-interactive) if not already done
if [ ! -f "/home/node/.openclaw/.onboarded" ]; then
  echo "[startup] Running OpenClaw onboard (local mode)..."
  cd /app
  node dist/index.js onboard --mode local --no-install-daemon 2>/dev/null || true
  node dist/index.js config set gateway.mode local 2>/dev/null || true
  node dist/index.js config set gateway.bind lan 2>/dev/null || true
  touch /home/node/.openclaw/.onboarded
  echo "[startup] Onboard complete"
fi

# Fix any config issues automatically
cd /app
node dist/index.js doctor --fix 2>/dev/null || true

# --- Step 3: Start OpenClaw gateway on INTERNAL port 18789 ---
# Gateway is NOT exposed to Railway — only A2A server talks to it
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

# --- Step 4: Extract gateway token ---
# After onboard + gateway start, the token is in the config file
echo "[startup] Reading gateway token..."
GW_TOKEN=$(cat /home/node/.openclaw/openclaw.json 2>/dev/null | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$GW_TOKEN" ]; then
  GW_TOKEN=$(find /home/node/.openclaw /home/node/.config -name "*.json" -exec grep -l "token" {} \; 2>/dev/null | head -1 | xargs grep -o '"token":"[^"]*"' 2>/dev/null | head -1 | cut -d'"' -f4)
fi
if [ -n "$GW_TOKEN" ]; then
  echo "[startup] Gateway token found (${#GW_TOKEN} chars)"
  export OPENCLAW_GATEWAY_TOKEN="$GW_TOKEN"
else
  echo "[startup] WARNING: No gateway token found, dumping config for debug:"
  cat /home/node/.openclaw/openclaw.json 2>/dev/null
  find /home/node/.openclaw /home/node/.config -name "*.json" 2>/dev/null
fi

# --- Step 5: Start A2A server on $PORT (Railway-exposed) ---
echo "[startup] Starting A2A server on port ${PORT:-8080}..."
cd "${A2A_DIR}"
exec node a2a-server.js
