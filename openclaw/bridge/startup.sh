#!/bin/bash
set -e

echo "=== Chief Bridge + OpenClaw — Starting ==="

# --- OpenClaw onboard ---
cd /app
if [ ! -f "/home/node/.openclaw/.onboarded" ]; then
  echo "[startup] Running OpenClaw onboard..."
  node dist/index.js onboard --mode local --no-install-daemon 2>/dev/null || true
  node dist/index.js config set gateway.mode local 2>/dev/null || true
  touch /home/node/.openclaw/.onboarded
fi
node dist/index.js doctor --fix 2>/dev/null || true

# --- Start Bridge (Express server on $PORT) ---
BRIDGE_PORT="${PORT:-3100}"
echo "[startup] Starting bridge on port ${BRIDGE_PORT}..."
cd /home/node/bridge
PORT="${BRIDGE_PORT}" node server.js &
BRIDGE_PID=$!
echo "[startup] Bridge started (PID=$BRIDGE_PID)"

# --- Start OpenClaw gateway on internal port ---
echo "[startup] Starting OpenClaw gateway on port 18789..."
cd /app
node dist/index.js gateway --bind lan --port 18789 &
GW_PID=$!
echo "[startup] Gateway started (PID=$GW_PID)"

# Wait for either process to exit
wait -n $BRIDGE_PID $GW_PID
echo "[startup] A process exited, shutting down..."
kill $BRIDGE_PID $GW_PID 2>/dev/null || true
exit 1
