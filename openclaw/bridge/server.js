/**
 * OpenClaw <-> Twilio WhatsApp Bridge
 *
 * Receives incoming WhatsApp messages via Twilio webhook,
 * forwards them to the OpenClaw Gateway over WebSocket,
 * and relays AI responses back through the Twilio REST API.
 *
 * This is the compiled JS version of server.ts for direct Node execution.
 */

const express = require("express");
const twilio = require("twilio");
const WebSocket = require("ws");

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_NUMBER, // e.g. "whatsapp:+14155238886"
  OPENCLAW_GATEWAY_URL = "ws://localhost:18789",
  BRIDGE_PORT = "3100",
  WEBHOOK_BASE_URL, // e.g. "https://your-app.railway.app"
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
  console.error(
    "Missing required env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER"
  );
  process.exit(1);
}

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const app = express();

// Twilio sends form-encoded POSTs
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ---------------------------------------------------------------------------
// WhatsApp message length limit
// ---------------------------------------------------------------------------
const WHATSAPP_MAX_LENGTH = 4096;

/**
 * Split a long message into WhatsApp-safe chunks, breaking on paragraph
 * boundaries when possible.
 */
function splitMessage(text) {
  if (text.length <= WHATSAPP_MAX_LENGTH) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= WHATSAPP_MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a paragraph break
    let splitIdx = remaining.lastIndexOf("\n\n", WHATSAPP_MAX_LENGTH);
    if (splitIdx === -1 || splitIdx < WHATSAPP_MAX_LENGTH * 0.3) {
      splitIdx = remaining.lastIndexOf("\n", WHATSAPP_MAX_LENGTH);
    }
    if (splitIdx === -1 || splitIdx < WHATSAPP_MAX_LENGTH * 0.3) {
      splitIdx = remaining.lastIndexOf(" ", WHATSAPP_MAX_LENGTH);
    }
    if (splitIdx === -1) {
      splitIdx = WHATSAPP_MAX_LENGTH;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// WebSocket connection management
// ---------------------------------------------------------------------------

/** Per-conversation WebSocket connections keyed by sender WhatsApp ID */
const connections = new Map();

// Cleanup idle connections every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, conn] of connections) {
    if (now - conn.lastActivity > 10 * 60 * 1000) {
      console.log(`[ws] Closing idle connection for ${id}`);
      conn.ws.close();
      connections.delete(id);
    }
  }
}, 5 * 60 * 1000);

/**
 * Get or create a WebSocket connection to the OpenClaw Gateway for a given
 * conversation (identified by the sender's WhatsApp ID).
 */
function getOrCreateConnection(waId, profileName) {
  const existing = connections.get(waId);
  if (existing && existing.ws.readyState === WebSocket.OPEN) {
    existing.lastActivity = Date.now();
    return Promise.resolve(existing.ws);
  }

  return new Promise((resolve, reject) => {
    console.log(`[ws] Opening connection to OpenClaw for ${waId}`);
    const ws = new WebSocket(OPENCLAW_GATEWAY_URL);

    ws.on("open", () => {
      console.log(`[ws] Connected for ${waId}`);

      // Send an init/handshake message so OpenClaw knows who this user is
      ws.send(
        JSON.stringify({
          type: "init",
          channel: "whatsapp",
          userId: waId,
          userName: profileName,
          metadata: {
            platform: "whatsapp",
            via: "twilio",
          },
        })
      );

      connections.set(waId, {
        ws,
        lastActivity: Date.now(),
        pendingReply: null,
      });

      resolve(ws);
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log(`[ws] Received from OpenClaw for ${waId}:`, msg.type);

        if (
          msg.type === "message" ||
          msg.type === "assistant" ||
          msg.type === "response"
        ) {
          const text =
            msg.content || msg.text || msg.message || msg.data?.content || "";
          const conn = connections.get(waId);
          if (conn?.pendingReply && text) {
            conn.pendingReply(text);
            conn.pendingReply = null;
          }
        }
      } catch (err) {
        console.error(`[ws] Failed to parse message for ${waId}:`, err);
      }
    });

    ws.on("close", () => {
      console.log(`[ws] Connection closed for ${waId}`);
      connections.delete(waId);
    });

    ws.on("error", (err) => {
      console.error(`[ws] Error for ${waId}:`, err.message);
      connections.delete(waId);
      reject(err);
    });
  });
}

/**
 * Send a user message through the WebSocket and wait for the AI response.
 * Times out after 120 seconds (LLM + tool calls can take a while).
 */
function sendAndWaitForReply(waId, profileName, message) {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      const conn = connections.get(waId);
      if (conn) conn.pendingReply = null;
      reject(new Error("OpenClaw response timeout (120s)"));
    }, 120_000);

    try {
      const ws = await getOrCreateConnection(waId, profileName);

      const conn = connections.get(waId);
      conn.pendingReply = (text) => {
        clearTimeout(timeout);
        resolve(text);
      };
      conn.lastActivity = Date.now();

      ws.send(
        JSON.stringify({
          type: "message",
          content: message,
          userId: waId,
          userName: profileName,
          channel: "whatsapp",
        })
      );
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });
}

// ---------------------------------------------------------------------------
// Twilio signature validation middleware
// ---------------------------------------------------------------------------
function validateTwilioSignature(req, res, next) {
  if (process.env.NODE_ENV === "development") {
    return next();
  }

  const signature = req.headers["x-twilio-signature"];
  if (!signature) {
    return res.status(403).json({ error: "Missing x-twilio-signature header" });
  }

  const url = WEBHOOK_BASE_URL
    ? `${WEBHOOK_BASE_URL}${req.originalUrl}`
    : `${req.protocol}://${req.get("host")}${req.originalUrl}`;

  const isValid = twilio.validateRequest(
    TWILIO_AUTH_TOKEN,
    signature,
    url,
    req.body
  );

  if (!isValid) {
    console.warn("[auth] Invalid Twilio signature", { url, signature });
    return res.status(403).json({ error: "Invalid Twilio signature" });
  }

  next();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Health check */
app.get("/health", (_req, res) => {
  const gatewayConnected = Array.from(connections.values()).some(
    (c) => c.ws.readyState === WebSocket.OPEN
  );

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    gateway: gatewayConnected ? "connected" : "no_active_sessions",
    activeSessions: connections.size,
  });
});

/** GET — return 200 for infra health checks on the webhook path */
app.get("/api/whatsapp/incoming", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Twilio WhatsApp webhook endpoint. Expects POST.",
  });
});

/** POST — Incoming WhatsApp message from Twilio */
app.post(
  "/api/whatsapp/incoming",
  validateTwilioSignature,
  async (req, res) => {
    const { From, Body, ProfileName, WaId, MessageSid } = req.body;

    console.log(
      `[incoming] From=${From} WaId=${WaId} Profile=${ProfileName} MsgSid=${MessageSid}`
    );
    console.log(`[incoming] Body: ${Body?.substring(0, 200)}`);

    if (!Body || !From) {
      const MessagingResponse = twilio.twiml.MessagingResponse;
      const twiml = new MessagingResponse();
      return res.type("text/xml").send(twiml.toString());
    }

    // Immediately acknowledge receipt to Twilio (avoid 15s timeout)
    const MessagingResponse = twilio.twiml.MessagingResponse;
    const twiml = new MessagingResponse();
    res.type("text/xml").send(twiml.toString());

    try {
      const aiResponse = await sendAndWaitForReply(
        WaId || From,
        ProfileName || "Unknown",
        Body
      );

      const chunks = splitMessage(aiResponse);

      for (const chunk of chunks) {
        await twilioClient.messages.create({
          from: TWILIO_WHATSAPP_NUMBER,
          to: From,
          body: chunk,
        });

        if (chunks.length > 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      console.log(
        `[outgoing] Sent ${chunks.length} message(s) to ${From}`
      );
    } catch (err) {
      console.error(`[error] Failed to process message from ${From}:`, err);

      try {
        await twilioClient.messages.create({
          from: TWILIO_WHATSAPP_NUMBER,
          to: From,
          body: "\u26a0\ufe0f Lo siento, hubo un error procesando tu mensaje. Intenta de nuevo en unos momentos.",
        });
      } catch (sendErr) {
        console.error("[error] Failed to send error message:", sendErr);
      }
    }
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = parseInt(BRIDGE_PORT, 10);

app.listen(PORT, () => {
  console.log(`Twilio <-> OpenClaw bridge listening on port ${PORT}`);
  console.log(`   Webhook URL: POST /api/whatsapp/incoming`);
  console.log(`   Health:      GET  /health`);
  console.log(`   Gateway:     ${OPENCLAW_GATEWAY_URL}`);
});
