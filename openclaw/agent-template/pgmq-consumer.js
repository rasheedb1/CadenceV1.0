/**
 * pgmq Queue Consumer for OpenClaw Gateway
 *
 * Reads messages from the agent's pgmq queue and injects them into the
 * local OpenClaw gateway via WebSocket (JSON-RPC protocol).
 *
 * Protocol reference: bridge/server.js OpenClawClient (lines 86-360)
 */

const { execSync, spawn } = require("child_process");
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
// OpenClaw CLI Interface
// Uses `node dist/index.js chat` to send messages to the local gateway
// This avoids WebSocket protocol complexities (device pairing, schema validation)
// =====================================================

function sendToGateway(message, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error("Gateway timeout")); }, timeoutMs);

    // Use the OpenClaw CLI to send a prompt
    // The CLI command is: openclaw prompt "message" (or: node dist/index.js prompt "message")
    const child = spawn("node", ["dist/index.js", "prompt", message], {
      cwd: "/app",
      env: { ...process.env, TERM: "dumb", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim());
      } else if (stdout.trim()) {
        resolve(stdout.trim()); // Some output even with non-zero exit
      } else {
        reject(new Error(`CLI exit ${code}: ${stderr.substring(0, 200)}`));
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`CLI spawn error: ${err.message}`));
    });
  });
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

  // List available CLI commands for debugging
  try {
    const { execFileSync } = require("child_process");
    const helpOutput = execFileSync("node", ["dist/index.js", "--help"], { cwd: "/app", encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"] });
    console.log("[pgmq-consumer] OpenClaw CLI commands:", helpOutput.substring(0, 500));
  } catch (err) {
    console.log("[pgmq-consumer] CLI help:", (err.stdout || err.stderr || err.message || "").substring(0, 500));
  }

  // Test CLI connectivity
  try {
    console.log("[pgmq-consumer] Testing OpenClaw CLI...");
    const testResult = await sendToGateway("Respond with only the word PONG", 30000);
    console.log("[pgmq-consumer] CLI test OK:", (testResult || "").substring(0, 50));
  } catch (err) {
    console.error("[pgmq-consumer] CLI test failed:", err.message);
    console.log("[pgmq-consumer] Will start consuming anyway — CLI may work for real messages");
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
