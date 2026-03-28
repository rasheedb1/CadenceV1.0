/**
 * pgmq Queue Consumer — runs as background process alongside OpenClaw gateway
 *
 * Reads messages from the agent's pgmq queue and forwards them to the
 * OpenClaw gateway via WebSocket (chat.send protocol) or HTTP.
 *
 * This bridges the pgmq async communication system with OpenClaw's runtime.
 */

const pgmq = require("./pgmq");

const AGENT_ID = process.env.AGENT_ID || "unknown";
const ORG_ID = process.env.ORG_ID || "";
const SB_URL = process.env.SUPABASE_URL || "";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GATEWAY_PORT = process.env.OPENCLAW_GATEWAY_PORT || "18789";

// Wait for gateway to be ready before starting
async function waitForGateway(maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`http://localhost:${GATEWAY_PORT}/healthz`);
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

// Send a message to the OpenClaw gateway as if it came from a user
async function sendToGateway(message) {
  try {
    // Use the gateway's HTTP API to inject a message
    // OpenClaw gateways accept POST /api/chat for programmatic access
    const res = await fetch(`http://localhost:${GATEWAY_PORT}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, stream: false }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.response || data.reply || JSON.stringify(data);
    }
    return null;
  } catch (err) {
    console.error(`[pgmq-consumer] Gateway send failed:`, err.message);
    return null;
  }
}

// Supabase helper for task status updates
async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SB_URL}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}`, "apikey": SB_KEY, ...opts.headers },
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

async function processMessage(envelope) {
  const { type, payload, task_id, reply_to, correlation_id, org_id, from_agent_id } = envelope;
  console.log(`[pgmq-consumer] Processing: type=${type} from=${from_agent_id} task=${task_id}`);

  try {
    if (type === "task") {
      // Update task status
      if (task_id) {
        await sbFetch(`/functions/v1/agent-task`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ task_id, status: "in_progress" }),
        });
      }

      // Forward to OpenClaw gateway
      const instruction = payload.instruction || payload.message || "";
      const result = await sendToGateway(instruction);

      // Update task completed
      if (task_id) {
        await sbFetch(`/functions/v1/agent-task`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ task_id, status: result ? "completed" : "failed", result: result ? { text: result } : null, error: result ? null : "Gateway did not respond" }),
        });
      }

      // Send reply back
      if (reply_to && result) {
        await pgmq.sendMessage(reply_to, {
          type: "reply", correlation_id, from_agent_id: AGENT_ID,
          org_id: org_id || ORG_ID, task_id,
          payload: { message: result },
          sent_at: new Date().toISOString(),
        });
      }

      // WhatsApp callback
      if (payload.whatsapp_number && result) {
        const cbUrl = payload.callback_url || "https://twilio-bridge-production-241b.up.railway.app/api/agent-callback";
        try {
          await fetch(cbUrl, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ task_id, agent_name: payload.agent_name || AGENT_ID, result: { text: result }, whatsapp_number: payload.whatsapp_number }),
          });
        } catch {}
      }

    } else if (type === "chat" || type === "review" || type === "collaboration") {
      const message = payload.message || "";
      const result = await sendToGateway(message);

      if (reply_to) {
        await pgmq.sendMessage(reply_to, {
          type: "reply", correlation_id, from_agent_id: AGENT_ID,
          org_id: org_id || ORG_ID,
          payload: { message: result || "No response from agent" },
          sent_at: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.error(`[pgmq-consumer] Error processing:`, err.message);
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
  console.log(`[pgmq-consumer] Agent ${AGENT_ID} — waiting for gateway...`);
  const ready = await waitForGateway();
  if (!ready) {
    console.error("[pgmq-consumer] Gateway not ready after 60s, starting consumer anyway");
  }

  const queueName = pgmq.getQueueName(AGENT_ID);
  const available = await pgmq.isAvailable().catch(() => false);
  if (!available) {
    console.warn("[pgmq-consumer] pgmq not available — consumer exiting");
    return;
  }

  console.log(`[pgmq-consumer] Starting consumer on queue: ${queueName}`);

  while (true) {
    try {
      const messages = await pgmq.pollMessages(queueName, 300, 1, 5);
      if (!messages || messages.length === 0) continue;

      const msg = messages[0];
      const envelope = pgmq.parseMessage(msg);
      if (!envelope) {
        await pgmq.archiveMessage(queueName, msg.msg_id);
        continue;
      }

      await processMessage(envelope);
      await pgmq.archiveMessage(queueName, envelope._msg_id);
    } catch (err) {
      console.error("[pgmq-consumer] Loop error:", err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

main().catch(err => {
  console.error("[pgmq-consumer] Fatal error:", err.message);
  process.exit(1);
});
