/**
 * pgmq Queue Consumer for OpenClaw Gateway
 *
 * Reads messages from the agent's pgmq queue and injects them into the
 * local OpenClaw gateway via WebSocket (JSON-RPC protocol).
 *
 * Protocol reference: bridge/server.js OpenClawClient (lines 86-360)
 */

const fs = require("fs");
const pgmq = require("./pgmq");

const AGENT_ID = process.env.AGENT_ID || "unknown";
const ORG_ID = process.env.ORG_ID || "";
const SB_URL = process.env.SUPABASE_URL || "";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GATEWAY_PORT = process.env.PORT || "18789";
const CONFIG_PATH = "/home/node/.openclaw/openclaw.json";

// Supabase helper
async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SB_URL}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}`, "apikey": SB_KEY, ...opts.headers },
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

// =====================================================
// OpenClaw HTTP API Interface (OpenAI-compatible)
// POST /v1/chat/completions with Bearer token auth
// =====================================================

function getGatewayToken() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return config?.gateway?.auth?.token || "";
  } catch { return ""; }
}

async function sendToGateway(message, timeoutMs = 120000) {
  const token = getGatewayToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model: "openclaw/default",
        messages: [{ role: "user", content: message }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Gateway HTTP ${res.status}: ${errText.substring(0, 200)}`);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "";
    return reply;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// =====================================================
// MAIN CONSUMER LOOP
// =====================================================

async function waitForGateway(maxWaitMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/healthz`);
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 3000));
  }
  return false;
}

async function processMessage(envelope) {
  const { type, payload, task_id, reply_to, correlation_id, org_id, from_agent_id } = envelope;
  console.log(`[pgmq-consumer] Processing: type=${type} from=${from_agent_id} task=${task_id}`);

  try {
    // Update task status
    if (task_id) {
      await sbFetch(`/functions/v1/agent-task`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ task_id, status: "in_progress" }),
      }).catch(() => {});
    }

    // Build message for the gateway
    const instruction = payload?.instruction || payload?.message || "";

    // Send to OpenClaw gateway via CLI
    const result = await sendToGateway(instruction);
    console.log(`[pgmq-consumer] Gateway responded: "${(result || "").substring(0, 80)}"`);

    // Update task status
    if (task_id) {
      await sbFetch(`/functions/v1/agent-task`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ task_id, status: result ? "completed" : "failed", result: result ? { text: result } : null }),
      }).catch(() => {});
    }

    // Send reply to reply_to queue
    if (reply_to && result) {
      await pgmq.sendMessage(reply_to, {
        type: "reply", correlation_id, from_agent_id: AGENT_ID,
        org_id: org_id || ORG_ID, task_id,
        payload: { message: result },
        sent_at: new Date().toISOString(),
      }).catch(err => console.error("[pgmq-consumer] Reply send failed:", err.message));
    }

    // WhatsApp callback
    if (payload?.whatsapp_number && result) {
      const cbUrl = payload.callback_url || "https://twilio-bridge-production-241b.up.railway.app/api/agent-callback";
      try {
        await fetch(cbUrl, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id, agent_name: payload.agent_name || AGENT_ID, result: { text: result }, whatsapp_number: payload.whatsapp_number }),
        });
        console.log(`[pgmq-consumer] Callback sent (${payload.whatsapp_number})`);
      } catch {}
    }

  } catch (err) {
    console.error(`[pgmq-consumer] Processing error:`, err.message);
    if (reply_to) {
      try {
        await pgmq.sendMessage(reply_to, {
          type: "reply", correlation_id, from_agent_id: AGENT_ID,
          payload: { error: err.message },
          sent_at: new Date().toISOString(),
        });
      } catch {}
    }
    if (task_id) {
      try {
        await sbFetch(`/functions/v1/agent-task`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ task_id, status: "failed", error: err.message }),
        });
      } catch {}
    }
  }
}

async function main() {
  console.log(`[pgmq-consumer] Agent ${AGENT_ID} starting...`);

  // Check Supabase connectivity
  if (!SB_URL || !SB_KEY) {
    console.error("[pgmq-consumer] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — exiting");
    return;
  }

  // Wait for OpenClaw gateway to be ready
  console.log("[pgmq-consumer] Waiting for gateway...");
  const gatewayReady = await waitForGateway();
  if (!gatewayReady) {
    console.error("[pgmq-consumer] Gateway not ready after 90s — exiting");
    return;
  }

  // Check pgmq availability (retry up to 3 times)
  let pgmqAvailable = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      console.log(`[pgmq-consumer] Checking pgmq availability (attempt ${attempt + 1})... SB_URL=${process.env.SUPABASE_URL?.substring(0, 30)}`);
      pgmqAvailable = await pgmq.isAvailable();
      if (pgmqAvailable) { console.log("[pgmq-consumer] pgmq is available!"); break; }
      console.warn(`[pgmq-consumer] pgmq check returned false`);
    } catch (err) {
      console.warn(`[pgmq-consumer] pgmq check attempt ${attempt + 1} error:`, err.message?.substring(0, 200));
    }
    if (attempt < 4) await new Promise(r => setTimeout(r, 5000));
  }
  if (!pgmqAvailable) {
    console.error(`[pgmq-consumer] pgmq not available after 3 attempts (SB_URL=${SB_URL ? 'set' : 'MISSING'}, SB_KEY=${SB_KEY ? 'set' : 'MISSING'}) — exiting`);
    return;
  }

  // Test HTTP API connectivity
  try {
    console.log("[pgmq-consumer] Testing gateway HTTP API...");
    const testResult = await sendToGateway("Respond with only the word PONG", 30000);
    console.log("[pgmq-consumer] Gateway API test OK:", (testResult || "").substring(0, 100));
  } catch (err) {
    console.error("[pgmq-consumer] Gateway API test failed:", err.message?.substring(0, 200));
    console.log("[pgmq-consumer] Will start consuming anyway");
  }

  // Main consumer loop
  const queueName = pgmq.getQueueName(AGENT_ID);
  console.log(`[pgmq-consumer] Consuming queue: ${queueName}`);

  while (true) {
    try {
      const messages = await pgmq.pollMessages(queueName, 300, 1, 5);
      if (!messages || messages.length === 0) continue;

      const msg = messages[0];
      const envelope = pgmq.parseMessage(msg);
      if (!envelope) { await pgmq.archiveMessage(queueName, msg.msg_id); continue; }

      await processMessage(envelope);
      await pgmq.archiveMessage(queueName, envelope._msg_id);
    } catch (err) {
      console.error("[pgmq-consumer] Loop error:", err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

main().catch(err => {
  console.error("[pgmq-consumer] Fatal:", err.message);
  process.exit(1);
});
