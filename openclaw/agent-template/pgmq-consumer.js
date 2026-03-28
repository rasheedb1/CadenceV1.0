/**
 * pgmq Queue Consumer for OpenClaw Gateway
 *
 * Reads messages from the agent's pgmq queue and injects them into the
 * local OpenClaw gateway via WebSocket (JSON-RPC protocol).
 *
 * Protocol reference: bridge/server.js OpenClawClient (lines 86-360)
 */

const WebSocket = require("ws");
const crypto = require("crypto");
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
// OpenClaw WebSocket Client (simplified from bridge)
// =====================================================

class LocalGatewayClient {
  constructor(port) {
    this.port = port;
    this.url = `ws://127.0.0.1:${port}`;
    this.ws = null;
    this.connected = false;
    this.pending = new Map();
    this.streamText = "";
    this.streamResolve = null;
    this.reqCounter = 0;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      console.log(`[pgmq-ws] Connecting to ${this.url}`);
      this.ws = new WebSocket(this.url, {
        headers: { Origin: `http://127.0.0.1:${this.port}` },
      });

      const timeout = setTimeout(() => {
        reject(new Error("Gateway connection timeout (30s)"));
        this.ws?.close();
      }, 30000);

      this.ws.on("open", () => {
        console.log("[pgmq-ws] WebSocket open, waiting for challenge...");
      });

      this.ws.on("message", (data) => {
        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }

        // Handle connect.challenge
        if (msg.type === "event" && msg.event === "connect.challenge") {
          const nonce = msg.payload?.nonce || "";
          this._sendConnect(nonce).then(() => {
            clearTimeout(timeout);
            this.connected = true;
            resolve();
          }).catch((err) => {
            clearTimeout(timeout);
            reject(err);
          });
          return;
        }

        // Handle RPC responses
        if (msg.type === "res") {
          const handler = this.pending.get(msg.id);
          if (handler) {
            this.pending.delete(msg.id);
            if (msg.error) handler.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            else handler.resolve(msg.result ?? msg.data ?? msg);
          }
          return;
        }

        // Handle streaming events
        if (msg.type === "event") {
          this._handleStreamEvent(msg);
          return;
        }
      });

      this.ws.on("close", () => {
        this.connected = false;
        this.ws = null;
        for (const [, handler] of this.pending) handler.reject(new Error("Connection closed"));
        this.pending.clear();
      });

      this.ws.on("error", (err) => {
        console.error("[pgmq-ws] Error:", err.message);
      });

      // Fallback: if no challenge in 5s, try connecting directly
      setTimeout(() => {
        if (!this.connected && this.ws?.readyState === WebSocket.OPEN) {
          this._sendConnect("").then(() => { clearTimeout(timeout); this.connected = true; resolve(); }).catch(() => {});
        }
      }, 5000);
    });
  }

  async _sendConnect(nonce) {
    // Read auth token from config file (gateway writes it on startup)
    let authToken = "";
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      authToken = config?.gateway?.auth?.token || "";
    } catch { console.warn("[pgmq-ws] Could not read auth token from config"); }

    // Generate or load ED25519 device keypair for gateway authentication
    if (!this.deviceKeys) {
      const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
      const pubHex = publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex");
      const deviceId = crypto.randomBytes(8).toString("hex");
      this.deviceKeys = { publicKey: pubHex, privateKeyObj: privateKey, deviceId };
      console.log(`[pgmq-ws] Generated device: ${deviceId}`);
    }

    const { publicKey: pubHex, privateKeyObj, deviceId } = this.deviceKeys;
    const signedAt = Date.now();
    const clientId = "openclaw-control-ui";
    const clientMode = "webchat";
    const role = "operator";
    const scopes = ["operator.read", "operator.write"];
    const token = authToken || "";

    // Sign: v2|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce
    const signPayload = ["v2", deviceId, clientId, clientMode, role, scopes.join(","), String(signedAt), token, nonce].join("|");
    const signature = crypto.sign(null, Buffer.from(signPayload), privateKeyObj).toString("hex");

    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: { id: clientId, platform: "web", mode: clientMode, version: "2026.3.28" },
      role,
      scopes,
      device: { id: deviceId, publicKey: pubHex, signature, signedAt, nonce },
      auth: authToken ? { token: authToken } : {},
      caps: ["tool-events"],
      userAgent: "pgmq-consumer/1.0",
      locale: "es",
    };

    const result = await this._request("connect", params);
    console.log("[pgmq-ws] Connected! Protocol:", result?.protocol);
    return result;
  }

  _request(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error("Not connected"));
      }
      const id = `pgmq-${++this.reqCounter}`;
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`RPC timeout: ${method}`)); }
      }, 120000);
      this.ws.send(JSON.stringify({ type: "req", id, method, params }));
    });
  }

  _handleStreamEvent(msg) {
    if (msg.stream === "text" || msg.stream === "content") {
      const text = msg.data?.text || msg.data?.content || msg.data || "";
      if (typeof text === "string") this.streamText += text;
      return;
    }
    if (msg.stream === "done" || msg.stream === "end" || msg.event === "chat.done" || msg.event === "chat.complete") {
      if (this.streamResolve) { this.streamResolve(this.streamText); this.streamResolve = null; this.streamText = ""; }
      return;
    }
    if (msg.event === "chat.message" || msg.event === "chat.response") {
      const text = msg.data?.content || msg.data?.text || msg.payload?.content || msg.payload?.text || "";
      if (text && this.streamResolve) { this.streamResolve(text); this.streamResolve = null; this.streamText = ""; }
      return;
    }
  }

  async sendChat(message, sessionKey = "pgmq") {
    this.streamText = "";
    const responsePromise = new Promise((resolve, reject) => {
      this.streamResolve = resolve;
      setTimeout(() => {
        if (this.streamResolve === resolve) {
          this.streamResolve = null;
          if (this.streamText.trim()) { resolve(this.streamText); this.streamText = ""; }
          else reject(new Error("Response timeout (120s)"));
        }
      }, 120000);
    });

    await this._request("chat.send", {
      sessionKey,
      message,
      deliver: false,
      idempotencyKey: `pgmq-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    });

    return responsePromise;
  }

  isReady() {
    return this.ws?.readyState === WebSocket.OPEN && this.connected;
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

async function processMessage(gateway, envelope) {
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
    const sessionKey = task_id ? `task-${task_id}` : `chat-${correlation_id || Date.now()}`;

    // Send to OpenClaw gateway via WebSocket
    const result = await gateway.sendChat(instruction, sessionKey);
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

  // Connect to local OpenClaw gateway via WebSocket
  const gateway = new LocalGatewayClient(GATEWAY_PORT);
  try {
    await gateway.connect();
    console.log("[pgmq-consumer] Connected to OpenClaw gateway");
  } catch (err) {
    console.error("[pgmq-consumer] Gateway WebSocket connection failed:", err.message);
    console.log("[pgmq-consumer] Will retry in 30s...");
    await new Promise(r => setTimeout(r, 30000));
    try { await gateway.connect(); } catch (err2) {
      console.error("[pgmq-consumer] Second attempt failed:", err2.message, "— exiting");
      return;
    }
  }

  // Main consumer loop
  const queueName = pgmq.getQueueName(AGENT_ID);
  console.log(`[pgmq-consumer] Consuming queue: ${queueName}`);

  while (true) {
    try {
      // Reconnect if needed
      if (!gateway.isReady()) {
        console.log("[pgmq-consumer] Gateway disconnected, reconnecting...");
        await gateway.connect().catch(err => console.error("[pgmq-consumer] Reconnect failed:", err.message));
        if (!gateway.isReady()) { await new Promise(r => setTimeout(r, 10000)); continue; }
      }

      const messages = await pgmq.pollMessages(queueName, 300, 1, 5);
      if (!messages || messages.length === 0) continue;

      const msg = messages[0];
      const envelope = pgmq.parseMessage(msg);
      if (!envelope) { await pgmq.archiveMessage(queueName, msg.msg_id); continue; }

      await processMessage(gateway, envelope);
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
