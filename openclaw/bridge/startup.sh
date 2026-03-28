#!/bin/bash
set -e

echo "=== Chief Bridge + OpenClaw — Starting ==="

# --- OpenClaw onboard (for future use) ---
cd /app
if [ ! -f "/home/node/.openclaw/.onboarded" ]; then
  echo "[startup] Running OpenClaw onboard..."
  node dist/index.js onboard --mode local --no-install-daemon 2>/dev/null || true
  touch /home/node/.openclaw/.onboarded
fi
node dist/index.js doctor --fix 2>/dev/null || true

# --- Start Bridge only ---
# The bridge (server.js) already embeds its own gateway on port 18789.
# No need to start a separate OpenClaw gateway — it would conflict.
# OpenClaw tools (browser, exec, etc.) will be added as a separate process
# on a different port in a future iteration.
BRIDGE_PORT="${PORT:-3100}"
echo "[startup] Starting bridge on port ${BRIDGE_PORT}..."
cd /home/node/bridge
export PORT="${BRIDGE_PORT}"
exec node server.js
