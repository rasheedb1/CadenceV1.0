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

# --- Step 3: Start Juanse Express server (WhatsApp handler) ---
echo "[startup] Starting Juanse Express server on port ${PORT:-8080}..."
node /home/node/juanse/dist/index.js &
JUANSE_PID=$!
echo "[startup] Juanse Express server started (PID=$JUANSE_PID)"

# --- Step 4: Start pgmq consumer ---
if [ -n "$SUPABASE_URL" ]; then
  echo "[startup] Starting pgmq consumer..."
  # Copy pgmq-consumer from agent-template pattern (reuse the same consumer)
  if [ -f "/home/node/juanse/dist/pgmq.js" ]; then
    NODE_PATH=/app/node_modules node -e "
      const pgmq = require('/home/node/juanse/dist/pgmq');
      const fs = require('fs');
      const AGENT_ID = process.env.AGENT_ID || 'juanse';
      const GATEWAY_PORT = 18789; // OpenClaw gateway runs on 18789 internally
      const CONFIG_PATH = '/home/node/.openclaw/openclaw.json';

      function getGatewayToken() {
        try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))?.gateway?.auth?.token || ''; } catch { return ''; }
      }

      async function sendToGateway(message) {
        const token = getGatewayToken();
        const res = await fetch('http://127.0.0.1:' + GATEWAY_PORT + '/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
          body: JSON.stringify({ model: 'openclaw/default', messages: [{ role: 'user', content: message }] }),
        });
        if (!res.ok) throw new Error('Gateway HTTP ' + res.status);
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
      }

      async function main() {
        // Wait for gateway
        for (let i = 0; i < 30; i++) {
          try { const r = await fetch('http://127.0.0.1:' + GATEWAY_PORT + '/healthz'); if (r.ok) break; } catch {}
          await new Promise(r => setTimeout(r, 3000));
        }
        const ok = await pgmq.isAvailable().catch(() => false);
        if (!ok) { console.error('[pgmq-juanse] pgmq not available'); return; }
        const queueName = pgmq.getQueueName(AGENT_ID);
        console.log('[pgmq-juanse] Consuming queue: ' + queueName);
        while (true) {
          try {
            const msgs = await pgmq.pollMessages(queueName, 600, 1, 5);
            if (!msgs || msgs.length === 0) continue;
            const msg = msgs[0];
            const env = pgmq.parseMessage(msg);
            if (!env) { await pgmq.archiveMessage(queueName, msg.msg_id); continue; }
            console.log('[pgmq-juanse] Processing: type=' + env.type);
            const instruction = env.payload?.instruction || env.payload?.message || '';
            const result = await sendToGateway(instruction);
            if (env.reply_to) {
              await pgmq.sendMessage(env.reply_to, { type: 'reply', correlation_id: env.correlation_id, from_agent_id: AGENT_ID, payload: { message: result }, sent_at: new Date().toISOString() });
            }
            await pgmq.archiveMessage(queueName, env._msg_id);
          } catch (err) { console.error('[pgmq-juanse] Error:', err.message); await new Promise(r => setTimeout(r, 5000)); }
        }
      }
      main().catch(e => console.error('[pgmq-juanse] Fatal:', e.message));
    " &
    echo "[startup] pgmq consumer started"
  fi
fi

# --- Step 5: Start OpenClaw gateway (foreground) ---
GATEWAY_PORT=18789
echo "[startup] Starting OpenClaw gateway on port ${GATEWAY_PORT}..."
cd /app
exec node dist/index.js gateway --bind lan --port "${GATEWAY_PORT}"
