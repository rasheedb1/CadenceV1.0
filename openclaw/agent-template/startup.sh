#!/bin/bash
# OpenClaw Agent Startup Script
# 1. Injects dynamic SOUL.md from env var
# 2. Starts pgmq queue consumer in background
# 3. Starts OpenClaw gateway

set -e

WORKSPACE="/home/node/.openclaw/workspace"
CONFIG="/home/node/.openclaw/openclaw.json"

echo "[startup] Agent ID: ${AGENT_ID:-unknown}"
echo "[startup] Org ID: ${ORG_ID:-not set}"

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
  node dist/index.js onboard --mode local --no-install-daemon 2>/dev/null || true
  node dist/index.js config set gateway.mode local 2>/dev/null || true
  node dist/index.js config set gateway.bind lan 2>/dev/null || true
  touch /home/node/.openclaw/.onboarded
  echo "[startup] Onboard complete"
fi

# Fix any config issues automatically
node dist/index.js doctor --fix 2>/dev/null || true

# --- Step 3: Start pgmq queue consumer in background ---
# Run from /app so Node.js can find ws module in OpenClaw's node_modules
if [ -f "/home/node/.openclaw/pgmq-consumer.js" ] && [ -n "$SUPABASE_URL" ]; then
  echo "[startup] Starting pgmq queue consumer..."
  cd /app && NODE_PATH=/app/node_modules node /home/node/.openclaw/pgmq-consumer.js &
  PGMQ_PID=$!
  cd /home/node/.openclaw
  echo "[startup] pgmq consumer started (PID=$PGMQ_PID)"
else
  echo "[startup] pgmq consumer skipped (missing config or SUPABASE_URL)"
fi

# --- Step 4: Start OpenClaw gateway ---
# Railway injects $PORT — OpenClaw must listen on it
GATEWAY_PORT="${PORT:-18789}"
echo "[startup] Starting OpenClaw gateway on port ${GATEWAY_PORT}..."
exec node dist/index.js gateway --bind lan --port "${GATEWAY_PORT}"
