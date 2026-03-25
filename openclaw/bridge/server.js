/**
 * OpenClaw <-> Twilio WhatsApp Bridge (v2)
 *
 * Uses OpenClaw's JSON-RPC WebSocket protocol:
 * - connect.challenge → connect handshake
 * - chat.send for user messages
 * - Streaming events for AI responses
 */

const express = require("express");
const twilio = require("twilio");
const WebSocket = require("ws");
const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_NUMBER,
  OPENCLAW_GATEWAY_URL = "ws://localhost:18789",
  BRIDGE_PORT = "3100",
  WEBHOOK_BASE_URL,
  OPENCLAW_GATEWAY_TOKEN = "",
  OPENCLAW_SESSION_KEY = "whatsapp",
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
  console.error("Missing required env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER");
  process.exit(1);
}

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const WHATSAPP_MAX_LENGTH = 4096;

function splitMessage(text) {
  if (text.length <= WHATSAPP_MAX_LENGTH) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= WHATSAPP_MAX_LENGTH) { chunks.push(remaining); break; }
    let idx = remaining.lastIndexOf("\n\n", WHATSAPP_MAX_LENGTH);
    if (idx === -1 || idx < WHATSAPP_MAX_LENGTH * 0.3) idx = remaining.lastIndexOf("\n", WHATSAPP_MAX_LENGTH);
    if (idx === -1 || idx < WHATSAPP_MAX_LENGTH * 0.3) idx = remaining.lastIndexOf(" ", WHATSAPP_MAX_LENGTH);
    if (idx === -1) idx = WHATSAPP_MAX_LENGTH;
    chunks.push(remaining.slice(0, idx));
    remaining = remaining.slice(idx).trimStart();
  }
  return chunks;
}

function uid() { return crypto.randomUUID(); }

// ---------------------------------------------------------------------------
// OpenClaw Gateway Client (JSON-RPC protocol)
// ---------------------------------------------------------------------------
class OpenClawClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.connected = false;
    this.pending = new Map(); // id -> {resolve, reject}
    this.streamText = "";     // accumulated streaming text
    this.streamResolve = null; // resolve function for current stream
    this.connectNonce = null;
    this.reconnectTimer = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      console.log(`[oc] Connecting to ${this.url}`);
      this.ws = new WebSocket(this.url, {
        headers: {
          Origin: "https://openclaw-production-1352.up.railway.app",
          "User-Agent": "TwilioBridge/2.0",
        },
      });

      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout (30s)"));
        this.ws?.close();
      }, 30000);

      this.ws.on("open", () => {
        console.log("[oc] WebSocket open, waiting for challenge...");
        // Don't resolve yet - wait for connect handshake to complete
      });

      this.ws.on("message", (data) => {
        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }

        // Handle connect.challenge event
        if (msg.type === "event" && msg.event === "connect.challenge") {
          const nonce = msg.payload?.nonce;
          console.log("[oc] Got connect.challenge, nonce:", nonce ? "yes" : "no");
          this.connectNonce = nonce;
          this._sendConnect().then(() => {
            clearTimeout(timeout);
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
            if (msg.error) {
              handler.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            } else {
              handler.resolve(msg.result ?? msg.data ?? msg);
            }
          }
          return;
        }

        // Handle streaming events
        if (msg.type === "event") {
          this._handleStreamEvent(msg);
          return;
        }
      });

      this.ws.on("close", (code, reason) => {
        console.log(`[oc] WebSocket closed: ${code} ${reason}`);
        this.connected = false;
        this.ws = null;
        // Flush pending requests
        for (const [id, handler] of this.pending) {
          handler.reject(new Error("Connection closed"));
        }
        this.pending.clear();
        // Auto-reconnect
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect().catch(err => console.error("[oc] Reconnect failed:", err.message));
          }, 5000);
        }
      });

      this.ws.on("error", (err) => {
        console.error("[oc] WebSocket error:", err.message);
      });

      // If no challenge within 5s, try sending connect directly
      setTimeout(() => {
        if (!this.connected && this.ws?.readyState === WebSocket.OPEN) {
          console.log("[oc] No challenge received, sending connect directly...");
          this._sendConnect().then(() => {
            clearTimeout(timeout);
            resolve();
          }).catch(() => {});
        }
      }, 5000);
    });
  }

  async _sendConnect() {
    // Generate a device key pair for the handshake
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const pubKeyDer = publicKey.export({ type: "spki", format: "der" });
    const pubKeyB64 = pubKeyDer.toString("base64");
    const signedAt = Date.now();
    const signPayload = `${pubKeyB64}:${signedAt}:${this.connectNonce || ""}`;
    const signature = crypto.sign(null, Buffer.from(signPayload), privateKey).toString("base64");

    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: { id: "openclaw-control-ui", platform: "web", mode: "webchat", version: "2026.3.23" },
      role: "operator",
      scopes: ["operator.read", "operator.write"],
      device: {
        id: "twilio-bridge-" + crypto.randomBytes(4).toString("hex"),
        publicKey: pubKeyB64,
        signature: signature,
        signedAt: signedAt,
        nonce: this.connectNonce || "",
      },
      caps: ["tool-events"],
      auth: OPENCLAW_GATEWAY_TOKEN ? { token: OPENCLAW_GATEWAY_TOKEN } : {},
      userAgent: "TwilioBridge/2.0",
      locale: "es",
    };

    try {
      const result = await this.request("connect", params);
      console.log("[oc] Connected! Protocol:", result?.protocol, "Auth:", result?.auth?.role);
      this.connected = true;
      return result;
    } catch (err) {
      console.error("[oc] Connect handshake failed:", err.message);
      throw err;
    }
  }

  request(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error("Not connected"));
      }

      const id = uid();
      const msg = { type: "req", id, method, params };

      this.pending.set(id, { resolve, reject });

      // Timeout for RPC requests
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`RPC timeout: ${method}`));
        }
      }, 120000);

      this.ws.send(JSON.stringify(msg));
    });
  }

  _handleStreamEvent(msg) {
    // Text streaming events - accumulate the text
    if (msg.stream === "text" || msg.stream === "content") {
      const text = msg.data?.text || msg.data?.content || msg.data || "";
      if (typeof text === "string") {
        this.streamText += text;
      }
      return;
    }

    // Stream end event
    if (msg.stream === "done" || msg.stream === "end" || msg.event === "chat.done" || msg.event === "chat.complete") {
      if (this.streamResolve) {
        this.streamResolve(this.streamText);
        this.streamResolve = null;
        this.streamText = "";
      }
      return;
    }

    // Chat message events (non-streaming response)
    if (msg.event === "chat.message" || msg.event === "chat.response") {
      const text = msg.data?.content || msg.data?.text || msg.payload?.content || msg.payload?.text || "";
      if (text && this.streamResolve) {
        this.streamResolve(text);
        this.streamResolve = null;
        this.streamText = "";
      }
      return;
    }

    // Log other events for debugging
    if (msg.event && !["heartbeat", "health"].includes(msg.event)) {
      console.log(`[oc] Event: ${msg.event || msg.stream}`, msg.data ? JSON.stringify(msg.data).substring(0, 200) : "");
    }
  }

  async sendMessage(text, sessionKey = OPENCLAW_SESSION_KEY) {
    const idempotencyKey = uid();

    // Reset stream state
    this.streamText = "";

    // Create a promise that resolves when we get the complete response
    const responsePromise = new Promise((resolve, reject) => {
      this.streamResolve = resolve;

      // Timeout after 90s
      setTimeout(() => {
        if (this.streamResolve === resolve) {
          this.streamResolve = null;
          // If we have partial text, return it
          if (this.streamText.trim()) {
            resolve(this.streamText);
            this.streamText = "";
          } else {
            reject(new Error("Response timeout (90s)"));
          }
        }
      }, 90000);
    });

    // Send the chat message
    try {
      const result = await this.request("chat.send", {
        sessionKey,
        message: text,
        deliver: false,
        idempotencyKey,
      });
      console.log("[oc] chat.send acknowledged:", result?.ok !== undefined ? result.ok : "sent");
    } catch (err) {
      // If chat.send itself returns the response (non-streaming)
      if (err.message?.includes("timeout")) {
        // Check if we got streaming text
        if (this.streamText.trim()) {
          return this.streamText;
        }
      }
      throw err;
    }

    return responsePromise;
  }

  isReady() {
    return this.ws?.readyState === WebSocket.OPEN && this.connected;
  }
}

// Global OpenClaw client
const ocClient = new OpenClawClient(OPENCLAW_GATEWAY_URL);

// Connect on startup
(async () => {
  try {
    await ocClient.connect();
    console.log("[oc] Ready to process messages!");
  } catch (err) {
    console.error("[oc] Initial connection failed:", err.message, "- will retry on first message");
  }
})();

// ---------------------------------------------------------------------------
// Twilio signature validation
// ---------------------------------------------------------------------------
function validateTwilioSignature(req, res, next) {
  if (process.env.NODE_ENV === "development") return next();

  const signature = req.headers["x-twilio-signature"];
  if (!signature) return res.status(403).json({ error: "Missing signature" });

  const url = WEBHOOK_BASE_URL
    ? `${WEBHOOK_BASE_URL}${req.originalUrl}`
    : `${req.protocol}://${req.get("host")}${req.originalUrl}`;

  if (!twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, url, req.body)) {
    console.warn("[auth] Invalid Twilio signature");
    return res.status(403).json({ error: "Invalid signature" });
  }
  next();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    gateway: ocClient.isReady() ? "connected" : "disconnected",
  });
});

app.get("/api/whatsapp/incoming", (_req, res) => {
  res.json({ status: "ok", message: "Twilio WhatsApp webhook. Expects POST." });
});

app.post("/api/whatsapp/status", (req, res) => {
  const { MessageSid, MessageStatus, ErrorCode } = req.body || {};
  if (MessageStatus === "failed" || MessageStatus === "undelivered") {
    console.error(`[status] ${MessageSid}: ${MessageStatus} (${ErrorCode})`);
  }
  res.sendStatus(200);
});

app.post("/api/whatsapp/incoming", validateTwilioSignature, async (req, res) => {
  const { From, Body, ProfileName, WaId, MessageSid } = req.body;

  console.log(`[in] From=${From} Profile=${ProfileName} MsgSid=${MessageSid}`);
  console.log(`[in] Body: ${Body?.substring(0, 200)}`);

  if (!Body || !From) {
    const twiml = new twilio.twiml.MessagingResponse();
    return res.type("text/xml").send(twiml.toString());
  }

  // Acknowledge immediately
  const twiml = new twilio.twiml.MessagingResponse();
  res.type("text/xml").send(twiml.toString());

  try {
    // Ensure connected
    if (!ocClient.isReady()) {
      console.log("[oc] Not connected, reconnecting...");
      await ocClient.connect();
    }

    const aiResponse = await ocClient.sendMessage(Body);

    if (!aiResponse || !aiResponse.trim()) {
      throw new Error("Empty response from OpenClaw");
    }

    const chunks = splitMessage(aiResponse);
    for (const chunk of chunks) {
      await twilioClient.messages.create({
        from: TWILIO_WHATSAPP_NUMBER,
        to: From,
        body: chunk,
      });
      if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
    }
    console.log(`[out] Sent ${chunks.length} message(s) to ${From}`);

  } catch (err) {
    console.error(`[error] ${From}:`, err.message);
    try {
      await twilioClient.messages.create({
        from: TWILIO_WHATSAPP_NUMBER,
        to: From,
        body: "⚠️ Lo siento, hubo un error procesando tu mensaje. Intenta de nuevo en unos momentos.",
      });
    } catch (sendErr) {
      console.error("[error] Failed to send error msg:", sendErr.message);
    }
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = parseInt(BRIDGE_PORT, 10);
app.listen(PORT, () => {
  console.log(`Twilio <-> OpenClaw bridge v2 on port ${PORT}`);
  console.log(`  Webhook: POST /api/whatsapp/incoming`);
  console.log(`  Gateway: ${OPENCLAW_GATEWAY_URL}`);
  console.log(`  Session: ${OPENCLAW_SESSION_KEY}`);
});
