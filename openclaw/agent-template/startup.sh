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

# --- Step 2: Set Anthropic API key for OpenClaw ---
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "[startup] WARNING: ANTHROPIC_API_KEY not set"
fi

# --- Step 3: Start pgmq queue consumer in background ---
if [ -f "/home/node/.openclaw/pgmq-consumer.js" ] && [ -n "$SUPABASE_URL" ]; then
  echo "[startup] Starting pgmq queue consumer..."
  node /home/node/.openclaw/pgmq-consumer.js &
  PGMQ_PID=$!
  echo "[startup] pgmq consumer started (PID=$PGMQ_PID)"
else
  echo "[startup] pgmq consumer skipped (missing config or SUPABASE_URL)"
fi

# --- Step 4: Start OpenClaw gateway ---
echo "[startup] Starting OpenClaw gateway on port 18789..."
exec node dist/index.js gateway --bind lan --port 18789
