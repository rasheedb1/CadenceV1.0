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
    // Use a FIXED device key pair that's pre-registered in the gateway's paired.json
    if (!this.deviceKeys) {
      const privPkcs8B64 = process.env.BRIDGE_DEVICE_PRIV_PKCS8 || "MC4CAQAwBQYDK2VwBCIEIES3M2mQg2KWlOK3awTyyr+/VB9HnP+AApGU6lKAYXf3";
      const privateKeyObj = crypto.createPrivateKey({
        key: Buffer.from(privPkcs8B64, "base64"),
        format: "der",
        type: "pkcs8",
      });
      const pubHex = "6ba347b711c57dbc0032b7c2bff32e7982516218392e515bd6428ab33b1bc227";
      const deviceId = "d5679b0ffc21ab3d";
      this.deviceKeys = { publicKey: pubHex, privateKeyObj, deviceId };
      console.log(`[oc] Using fixed device: ${deviceId}`);
    }

    const { publicKey: pubHex, privateKeyObj, deviceId } = this.deviceKeys;
    const signedAt = Date.now();
    const nonce = this.connectNonce || "";

    const clientId = "openclaw-control-ui";
    const clientMode = "webchat";
    const role = "operator";
    const scopes = ["operator.read", "operator.write"];
    const token = ""; // --auth none, no token

    // Sign payload: v2|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce
    // IMPORTANT: separator is | (pipe), nonce is last field
    const signPayload = ["v2", deviceId, clientId, clientMode, role, scopes.join(","), String(signedAt), token, nonce].join("|");
    const signature = crypto.sign(null, Buffer.from(signPayload), privateKeyObj).toString("hex");

    console.log(`[oc] Sign payload: ${signPayload.substring(0, 80)}...`);

    const params = {
      minProtocol: 3,
      maxProtocol: 3,
      client: { id: clientId, platform: "web", mode: clientMode, version: "2026.3.23" },
      role,
      scopes,
      device: { id: deviceId, publicKey: pubHex, signature, signedAt, nonce },
      caps: ["tool-events"],
      auth: {},
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

// Agent task completion callback — sends result to user via WhatsApp
app.post("/api/agent-callback", express.json(), async (req, res) => {
  const { task_id, agent_name, result, error, whatsapp_number } = req.body;
  console.log(`[callback] Agent ${agent_name} completed task ${task_id} for ${whatsapp_number}`);

  if (!whatsapp_number) return res.status(400).json({ error: "Missing whatsapp_number" });

  try {
    let message;
    if (error) {
      message = `❌ **${agent_name}** tuvo un error con la tarea:\n${error}`;
    } else {
      const resultText = typeof result === "string" ? result : (result?.text || JSON.stringify(result));
      message = `✅ **${agent_name}** terminó la tarea:\n\n${resultText}`;
    }

    // Send via WhatsApp (split if needed)
    const chunks = splitMessage(message);
    for (const chunk of chunks) {
      await twilioClient.messages.create({
        from: TWILIO_WHATSAPP_NUMBER,
        to: whatsapp_number,
        body: chunk,
      });
      if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
    }
    console.log(`[callback] Sent result to ${whatsapp_number} (${chunks.length} msgs)`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[callback] Error sending to ${whatsapp_number}:`, err.message);
    res.status(500).json({ error: err.message });
  }
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

    const aiResponse = await ocClient.sendMessage(Body, WaId || From);

    if (!aiResponse || !aiResponse.trim()) {
      throw new Error("Empty response from OpenClaw");
    }

    // Detect image URLs in AI response for media messages
    // Matches full URLs with image extensions + query params (e.g., Firecrawl GCS URLs)
    const imgRegex = /(https?:\/\/[^\s")\]]+\.(?:png|jpg|jpeg|webp|gif)[^\s")\]]*)/gi;
    const imageUrls = aiResponse.match(imgRegex) || [];
    // Also clean up markdown link syntax around the URL: [text](URL) → text
    let textBody = aiResponse;
    for (const url of imageUrls) {
      // Remove the URL and any markdown link wrapping it
      const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      textBody = textBody.replace(new RegExp(`\\[([^\\]]*)\\]\\(${escaped}\\)`, "g"), "$1");
      textBody = textBody.replace(url, "");
    }
    textBody = textBody.replace(/\n{3,}/g, "\n\n").trim();

    // Send text chunks
    if (textBody.trim()) {
      const chunks = splitMessage(textBody);
      for (const chunk of chunks) {
        await twilioClient.messages.create({
          from: TWILIO_WHATSAPP_NUMBER,
          to: From,
          body: chunk,
        });
        if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
      }
      console.log(`[out] Sent ${chunks.length > 1 ? chunks.length + " text msgs" : "1 text msg"} to ${From}`);
    }

    // Send image URLs as media messages
    for (const imgUrl of imageUrls) {
      await twilioClient.messages.create({
        from: TWILIO_WHATSAPP_NUMBER,
        to: From,
        body: "",
        mediaUrl: [imgUrl],
      });
      console.log(`[out] Sent image to ${From}: ${imgUrl.substring(0, 80)}`);
    }

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
// Start HTTP server
// ---------------------------------------------------------------------------
const PORT = parseInt(BRIDGE_PORT, 10);
app.listen(PORT, () => {
  console.log(`Twilio <-> OpenClaw bridge v2 on port ${PORT}`);
  console.log(`  Webhook: POST /api/whatsapp/incoming`);
  console.log(`  Gateway: ${OPENCLAW_GATEWAY_URL}`);
  console.log(`  Session: ${OPENCLAW_SESSION_KEY}`);
});

// =============================================================================
// EMBEDDED GATEWAY — OpenClaw AI (Anthropic Claude + tool calling)
// Runs in the same process to avoid supervisord multi-process issues.
// =============================================================================

const _AnthSdk = require("@anthropic-ai/sdk");
const Anthropic = _AnthSdk.default || _AnthSdk;
const path = require("path");
const { readFileSync } = require("fs");

const {
  ANTHROPIC_API_KEY,
  SUPABASE_URL: SB_URL = "https://arupeqczrxmfkcbjwyad.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: SB_KEY,
  GATEWAY_PORT: GW_PORT_STR = "18789",
  CLAUDE_MODEL = "claude-sonnet-4-6",
  RAILWAY_API_TOKEN,
  RAILWAY_PROJECT_ID = "160e649b-5baa-4a3d-b2a4-26ad4f5c74ac",
  RAILWAY_ENVIRONMENT_ID = "df9cf24b-413b-4748-8cd3-6f69f60db99a",
  GITHUB_REPO = "rasheedb1/CadenceV1.0",
} = process.env;

if (!ANTHROPIC_API_KEY || !SB_KEY) {
  console.error("[gateway] Missing ANTHROPIC_API_KEY or SUPABASE_SERVICE_ROLE_KEY — gateway disabled");
} else {
  // Load workspace context — try multiple paths for resilience
  let SYSTEM_PROMPT;
  let AGENTS_MD = ""; // Raw AGENTS.md content — injected into child agents
  const workspaceCandidates = [
    "/app/workspace",
    path.join(__dirname, "..", "workspace"),
    path.join(__dirname, "workspace"),
    path.join(process.cwd(), "..", "workspace"),
  ];
  for (const dir of workspaceCandidates) {
    try {
      const soul = readFileSync(path.join(dir, "SOUL.md"), "utf8");
      const agents = readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      SYSTEM_PROMPT = `${soul}\n\n---\n\n${agents}`;
      AGENTS_MD = agents;
      console.log(`[gateway] Loaded workspace from ${dir}`);
      break;
    } catch (_) {}
  }
  if (!SYSTEM_PROMPT) {
    console.log("[gateway] Workspace files not found — using embedded system prompt");
    SYSTEM_PROMPT = `# Chief — by Laiky AI

## Identidad
Eres **Chief**, el asistente de automatización de ventas de Laiky AI.

## Idioma
Español es tu idioma principal. Si el usuario escribe en inglés, responde en inglés.

## Capacidades
Tienes acceso a 24+ herramientas para gestionar TODO el dashboard de Chief:
1. Buscar prospectos (Sales Navigator)
2. Crear cadencias de outreach
3. Descubrir empresas (ICP)
4. Investigar empresas
5. Enriquecer prospectos (email, teléfono)
6. Ver actividad (mensajes, respuestas, errores)
7. Enviar mensajes LinkedIn (DM, InMail, conexión)
8. Enviar emails (Gmail)
9. Generar business cases
10. Ver métricas de cadencias
11. Gestionar leads (CRUD + asignar a cadencias)
12. Gestionar AI Prompts (ver, crear, editar, eliminar)
13. Gestionar Templates (ver, crear, editar, eliminar)
14. Gestionar Buyer Personas (ver, crear, editar, eliminar)
15. Gestionar Perfiles ICP (ver, crear, editar, eliminar)
16. Ver notificaciones (respuestas, errores, emails abiertos)
17. Ver detalle de cadencia (pasos, leads, estado)
18. Ver conexiones (LinkedIn, Gmail conectadas)
19. Ver programación (acciones programadas)
20. Capturar pantalla del dashboard (SOLO cuando el usuario lo pide)

## Reglas
- Siempre necesitas org_id y saber quién es el usuario.
- Si ya tienes contexto guardado, úsalo directamente — no preguntes nada.
- Si es usuario nuevo, pide org_id y email, verifica con OTP.
- Confirma antes de enviar mensajes o crear cadencias.
- Respuestas cortas para WhatsApp, usa emojis para estado.
- Solo toma screenshots cuando el usuario lo pide explícitamente.
- Nunca expongas tokens o IDs internos.`;
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  // Supabase helpers
  function sbHeaders(edge = false) {
    const h = { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}` };
    if (!edge) h["apikey"] = SB_KEY;
    return h;
  }
  async function sbFetch(url, opts = {}) {
    const res = await fetch(url, opts);
    const txt = await res.text();
    try { return JSON.parse(txt); } catch { return { _raw: txt, _status: res.status }; }
  }

  // Railway API helper
  async function railwayGQL(query, variables = {}) {
    if (!RAILWAY_API_TOKEN) throw new Error("RAILWAY_API_TOKEN not configured");
    const res = await fetch("https://backboard.railway.app/graphql/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RAILWAY_API_TOKEN}` },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0].message);
    return json.data;
  }

  // Tools (Anthropic format)
  const gwTools = [
    { name: "buscar_prospectos", description: "Busca prospectos en una empresa usando LinkedIn Sales Navigator (L1→L2→L3).", input_schema: { type: "object", properties: { org_id: { type: "string" }, company_name: { type: "string" }, company_domain: { type: "string" }, titles: { type: "array", items: { type: "string" } }, seniority_levels: { type: "array", items: { type: "string" } }, limit: { type: "number" }, buyer_persona_id: { type: "string" } }, required: ["org_id", "company_name"] } },
    { name: "crear_cadencia", description: "Crea una cadencia de outreach con pasos. Confirma con el usuario antes de ejecutar.", input_schema: { type: "object", properties: { org_id: { type: "string" }, name: { type: "string" }, description: { type: "string" }, steps: { type: "array", items: { type: "object", properties: { step_number: { type: "number" }, step_type: { type: "string", enum: ["linkedin_connect","linkedin_message","linkedin_inmail","email","manual_task","linkedin_like","linkedin_comment"] }, delay_days: { type: "number" }, template: { type: "string" }, subject: { type: "string" } }, required: ["step_number","step_type","delay_days","template"] } } }, required: ["org_id","name","steps"] } },
    { name: "descubrir_empresas", description: "Descubre empresas que encajan con el ICP.", input_schema: { type: "object", properties: { org_id: { type: "string" }, icp_profile_id: { type: "string" }, criteria: { type: "object", properties: { industries: { type: "array", items: { type: "string" } }, employee_range: { type: "string" }, revenue_range: { type: "string" }, locations: { type: "array", items: { type: "string" } }, technologies: { type: "array", items: { type: "string" } } } }, limit: { type: "number" }, exclude_existing: { type: "boolean" } }, required: ["org_id"] } },
    { name: "investigar_empresa", description: "Investiga una empresa a fondo — noticias, tech stack, insights.", input_schema: { type: "object", properties: { org_id: { type: "string" }, company_name: { type: "string" }, company_domain: { type: "string" }, depth: { type: "string", enum: ["quick","deep"] } }, required: ["org_id","company_name"] } },
    { name: "enriquecer_prospectos", description: "Enriquece un prospecto con email y datos de LinkedIn.", input_schema: { type: "object", properties: { org_id: { type: "string" }, prospect_id: { type: "string" }, first_name: { type: "string" }, last_name: { type: "string" }, company: { type: "string" }, company_domain: { type: "string" }, linkedin_url: { type: "string" }, enrich_email: { type: "boolean" }, enrich_phone: { type: "boolean" } }, required: ["org_id"] } },
    { name: "ver_actividad", description: "Consulta el log de actividades — mensajes enviados, respuestas, errores.", input_schema: { type: "object", properties: { org_id: { type: "string" }, lead_id: { type: "string" }, cadence_id: { type: "string" }, activity_type: { type: "string" }, status: { type: "string" }, date_from: { type: "string" }, limit: { type: "number" } }, required: ["org_id"] } },
    { name: "enviar_mensaje", description: "Envía un mensaje por LinkedIn. Confirmar con usuario antes.", input_schema: { type: "object", properties: { org_id: { type: "string" }, sender_account_id: { type: "string" }, recipient_provider_id: { type: "string" }, message: { type: "string" }, message_type: { type: "string", enum: ["message","inmail","connection_request"] } }, required: ["org_id","sender_account_id","recipient_provider_id","message","message_type"] } },
    { name: "business_case", description: "Genera un business case personalizado para una empresa.", input_schema: { type: "object", properties: { org_id: { type: "string" }, company_name: { type: "string" }, company_domain: { type: "string" }, prospect_name: { type: "string" }, prospect_title: { type: "string" }, pain_points: { type: "array", items: { type: "string" } }, our_solution: { type: "string" }, research_data: { type: "object" }, language: { type: "string", enum: ["es","en"] } }, required: ["org_id","company_name"] } },
    { name: "ver_metricas", description: "Consulta métricas de cadencias — respuesta, conexión, conversión.", input_schema: { type: "object", properties: { org_id: { type: "string" }, cadence_id: { type: "string" }, date_from: { type: "string" }, date_to: { type: "string" } }, required: ["org_id"] } },
    { name: "gestionar_leads", description: "CRUD sobre leads — listar, crear, actualizar, asignar a cadencias.", input_schema: { type: "object", properties: { org_id: { type: "string" }, operation: { type: "string", enum: ["list","create","update","assign_to_cadence","remove_from_cadence"] }, filters: { type: "object", properties: { status: { type: "string" }, company: { type: "string" }, limit: { type: "number" } } }, lead: { type: "object", properties: { first_name: { type: "string" }, last_name: { type: "string" }, email: { type: "string" }, company: { type: "string" }, title: { type: "string" }, linkedin_url: { type: "string" }, provider_id: { type: "string" }, status: { type: "string" }, source: { type: "string" } } }, lead_id: { type: "string" }, lead_ids: { type: "array", items: { type: "string" } }, updates: { type: "object" }, cadence_id: { type: "string" } }, required: ["org_id","operation"] } },
    { name: "guardar_sesion", description: "Guarda la identidad del usuario (org_id, user_id, member_id, nombre) asociada a su número de WhatsApp. Úsalo siempre que el usuario te proporcione su org_id o se identifique, para que no tenga que repetirlo en futuras conversaciones.", input_schema: { type: "object", properties: { whatsapp_number: { type: "string", description: "Número de WhatsApp del usuario — ya lo tienes como sessionKey" }, org_id: { type: "string" }, user_id: { type: "string" }, member_id: { type: "string" }, display_name: { type: "string", description: "Nombre del usuario para saludarlo en futuras sesiones" } }, required: ["whatsapp_number"] } },
    { name: "identificar_usuario", description: "Busca un usuario dentro de una organización por su email. Úsalo durante el onboarding — después de recibir el org_id, pide el email y llama esta tool para obtener user_id, member_id y nombre completo. Luego llama guardar_sesion con esos datos.", input_schema: { type: "object", properties: { org_id: { type: "string" }, email: { type: "string" } }, required: ["org_id", "email"] } },
    { name: "enviar_otp", description: "Envía un código de verificación de 6 dígitos al email del usuario via Supabase Auth. Úsalo después de recibir el email durante el onboarding para verificar que el usuario es dueño de esa cuenta.", input_schema: { type: "object", properties: { email: { type: "string" } }, required: ["email"] } },
    { name: "verificar_otp", description: "Verifica el código OTP que el usuario recibió en su email. Si es válido, identifica al usuario en la organización y guarda la sesión permanentemente. Este es el paso final del onboarding — después de esto el usuario no necesita identificarse nunca más.", input_schema: { type: "object", properties: { email: { type: "string" }, token: { type: "string", description: "Código de 6 dígitos que el usuario recibió en su email" }, org_id: { type: "string" }, whatsapp_number: { type: "string", description: "Número WhatsApp del usuario — ya lo tienes como sessionKey" } }, required: ["email", "token", "org_id", "whatsapp_number"] } },
    { name: "enviar_email", description: "Envía un email usando la cuenta Gmail conectada del usuario. Confirmar antes de enviar.", input_schema: { type: "object", properties: { org_id: { type: "string" }, owner_id: { type: "string", description: "user_id del remitente" }, lead_id: { type: "string" }, to: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, cc: { type: "string" } }, required: ["org_id", "owner_id", "to", "subject", "body"] } },
    { name: "gestionar_prompts", description: "CRUD sobre AI prompts — listar, ver, crear, actualizar, eliminar.", input_schema: { type: "object", properties: { org_id: { type: "string" }, owner_id: { type: "string" }, operation: { type: "string", enum: ["list", "get", "create", "update", "delete"] }, prompt_id: { type: "string" }, prompt: { type: "object", properties: { name: { type: "string" }, prompt_body: { type: "string" }, step_type: { type: "string" }, tone: { type: "string" }, language: { type: "string" }, prompt_type: { type: "string" }, is_default: { type: "boolean" }, description: { type: "string" } } }, updates: { type: "object" }, filters: { type: "object", properties: { prompt_type: { type: "string" }, step_type: { type: "string" }, limit: { type: "number" } } } }, required: ["org_id", "operation"] } },
    { name: "gestionar_templates", description: "CRUD sobre templates de mensajes — listar, ver, crear, actualizar, eliminar.", input_schema: { type: "object", properties: { org_id: { type: "string" }, owner_id: { type: "string" }, operation: { type: "string", enum: ["list", "get", "create", "update", "delete"] }, template_id: { type: "string" }, template: { type: "object", properties: { name: { type: "string" }, step_type: { type: "string" }, subject_template: { type: "string" }, body_template: { type: "string" } } }, updates: { type: "object" }, filters: { type: "object", properties: { step_type: { type: "string" }, limit: { type: "number" } } } }, required: ["org_id", "operation"] } },
    { name: "gestionar_personas", description: "CRUD sobre buyer personas — listar, ver, crear, actualizar, eliminar.", input_schema: { type: "object", properties: { org_id: { type: "string" }, owner_id: { type: "string" }, operation: { type: "string", enum: ["list", "get", "create", "update", "delete"] }, persona_id: { type: "string" }, persona: { type: "object", properties: { name: { type: "string" }, title_keywords: { type: "array", items: { type: "string" } }, seniority: { type: "string" }, department: { type: "string" }, description: { type: "string" }, role_in_buying_committee: { type: "string" }, priority: { type: "number" }, max_per_company: { type: "number" }, icp_profile_id: { type: "string" } } }, updates: { type: "object" }, filters: { type: "object", properties: { icp_profile_id: { type: "string" }, limit: { type: "number" } } } }, required: ["org_id", "operation"] } },
    { name: "gestionar_perfiles_icp", description: "CRUD sobre perfiles ICP — listar, ver, crear, actualizar, eliminar.", input_schema: { type: "object", properties: { org_id: { type: "string" }, owner_id: { type: "string" }, operation: { type: "string", enum: ["list", "get", "create", "update", "delete"] }, profile_id: { type: "string" }, profile: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, builder_data: { type: "object" }, discover_min_companies: { type: "number" }, discover_max_companies: { type: "number" } } }, updates: { type: "object" } }, required: ["org_id", "operation"] } },
    { name: "ver_notificaciones", description: "Ver notificaciones (respuestas, errores, emails abiertos) y marcar como leídas.", input_schema: { type: "object", properties: { org_id: { type: "string" }, owner_id: { type: "string" }, operation: { type: "string", enum: ["list", "mark_read", "mark_all_read"] }, notification_id: { type: "string" }, filters: { type: "object", properties: { is_read: { type: "boolean" }, type: { type: "string" }, limit: { type: "number" } } } }, required: ["org_id", "operation"] } },
    { name: "ver_cadencia_detalle", description: "Ve los detalles completos de una cadencia: pasos, leads asignados, estado.", input_schema: { type: "object", properties: { org_id: { type: "string" }, cadence_id: { type: "string" } }, required: ["org_id", "cadence_id"] } },
    { name: "ver_conexiones", description: "Ve las cuentas conectadas del usuario (LinkedIn, Gmail, etc.).", input_schema: { type: "object", properties: { org_id: { type: "string" }, user_id: { type: "string" } }, required: ["org_id", "user_id"] } },
    { name: "ver_programacion", description: "Ve las acciones programadas (schedules) — próximos envíos, estado.", input_schema: { type: "object", properties: { org_id: { type: "string" }, cadence_id: { type: "string" }, status: { type: "string", enum: ["scheduled", "executed", "failed", "canceled"] }, limit: { type: "number" } }, required: ["org_id"] } },
    { name: "capturar_pantalla", description: "Captura un screenshot del dashboard de Chief. SOLO cuando el usuario lo pide explícitamente ('mándame screenshot', 'muéstrame cómo se ve'). Genera un magic link para autenticar y captura via Firecrawl.", input_schema: { type: "object", properties: { page_path: { type: "string", description: "Ruta de la página, ej: /leads, /cadences, /ai-prompts, /templates" }, user_email: { type: "string", description: "Email del usuario para generar magic link" }, wait_ms: { type: "number", description: "Milisegundos de espera para que cargue la página (default 6000)" } }, required: ["page_path", "user_email"] } },
    { name: "ver_calendario", description: "Ve los eventos del calendario del usuario para un rango de fechas. Útil para saber qué reuniones tiene hoy o esta semana.", input_schema: { type: "object", properties: { user_id: { type: "string", description: "user_id del usuario (de la sesión guardada)" }, org_id: { type: "string" }, date_from: { type: "string", description: "YYYY-MM-DD (default: hoy)" }, date_to: { type: "string", description: "YYYY-MM-DD (default: 6 días desde date_from)" } }, required: ["user_id", "org_id"] } },
    { name: "buscar_slots_disponibles", description: "Busca slots de tiempo libre en el calendario del usuario. Útil para proponer horarios de reunión a prospectos o clientes.", input_schema: { type: "object", properties: { user_id: { type: "string" }, org_id: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD (default: hoy)" }, days: { type: "number", description: "Días a analizar (1-7, default: 1)" }, timezone: { type: "string", description: "IANA timezone (default: America/Mexico_City)" }, business_start: { type: "number", description: "Hora inicio jornada (default: 9)" }, business_end: { type: "number", description: "Hora fin jornada (default: 18)" } }, required: ["user_id", "org_id"] } },
    { name: "crear_evento_calendario", description: "Crea un evento en Google Calendar y envía invitaciones por email a los asistentes. Genera Google Meet automáticamente si hay invitados. CONFIRMAR con el usuario antes de crear.", input_schema: { type: "object", properties: { user_id: { type: "string" }, org_id: { type: "string" }, title: { type: "string", description: "Título del evento" }, start_datetime: { type: "string", description: "ISO 8601 (ej: 2025-03-28T10:00:00)" }, end_datetime: { type: "string", description: "ISO 8601 (ej: 2025-03-28T11:00:00)" }, timezone: { type: "string", description: "IANA timezone (default: America/Mexico_City)" }, description: { type: "string", description: "Descripción o agenda del evento" }, location: { type: "string" }, attendees: { type: "array", items: { type: "object", properties: { email: { type: "string" }, name: { type: "string" } }, required: ["email"] }, description: "Lista de invitados. Recibirán invitación por email." } }, required: ["user_id", "org_id", "title", "start_datetime", "end_datetime"] } },
    { name: "sincronizar_calendario", description: "Sincroniza el calendario del usuario con Google Calendar. Útil si no ve reuniones recientes o quiere refrescar datos.", input_schema: { type: "object", properties: { user_id: { type: "string" }, org_id: { type: "string" } }, required: ["user_id", "org_id"] } },
    // --- Agent Platform tools ---
    { name: "gestionar_agentes", description: "Crea, lista o elimina agentes AI de la organización. Cada agente tiene un rol (CPO, Developer, CFO, HR, etc.) y habilidades específicas. Confirma detalles antes de crear.", input_schema: { type: "object", properties: { org_id: { type: "string" }, operation: { type: "string", enum: ["create", "list", "get", "delete"] }, name: { type: "string", description: "Nombre del agente (ej: 'CPO Agent')" }, role: { type: "string", description: "Rol del agente (ej: 'cpo', 'developer', 'cfo', 'hr', 'marketing', 'custom')" }, description: { type: "string", description: "Descripción de qué hace este agente" }, skills: { type: "array", items: { type: "string" }, description: "Lista de skills del skill_registry" }, agent_id: { type: "string", description: "ID del agente (para get/delete)" } }, required: ["org_id", "operation"] } },
    { name: "delegar_tarea", description: "Delega una tarea a un agente hijo. Si el agente está desplegado, la envía directamente. Si no, la guarda como pendiente. Usa cuando el usuario dice 'dile a X que haga Y', 'pídele a X que...'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, agent_id: { type: "string", description: "ID del agente destino" }, agent_name: { type: "string", description: "Nombre del agente (alternativa a agent_id, búsqueda por nombre)" }, instruction: { type: "string", description: "La tarea en lenguaje natural" } }, required: ["org_id", "instruction"] } },
    { name: "consultar_agente", description: "Pregunta rápida a un agente sin crear tarea formal. Ideal para '¿qué opina X?', 'pregúntale a X...', 'consulta con el CFO...'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, agent_id: { type: "string", description: "ID del agente" }, agent_name: { type: "string", description: "Nombre del agente (alternativa a agent_id)" }, message: { type: "string", description: "La pregunta o mensaje" } }, required: ["org_id", "message"] } },
    { name: "desplegar_agente", description: "Despliega un agente en Railway como servicio independiente. Crea el servidor, configura variables de entorno, y activa el agente. Usa cuando el usuario quiere que un agente esté operativo: 'despliega al CPO', 'activa a Nando', 'pon a funcionar al agente'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, agent_id: { type: "string", description: "ID del agente a desplegar" }, agent_name: { type: "string", description: "Nombre del agente (alternativa a agent_id)" } }, required: ["org_id"] } },
    { name: "web_research", description: "Busca en la web y scrapea páginas para investigación. Acciones: 'search' (buscar), 'scrape' (extraer contenido de URL), 'research' (buscar + scrape combinado).", input_schema: { type: "object", properties: { action: { type: "string", enum: ["search", "scrape", "research"], description: "search=buscar en web, scrape=extraer contenido de URL, research=buscar+scrape" }, query: { type: "string", description: "Término de búsqueda (para search/research)" }, url: { type: "string", description: "URL a scrapear (para scrape)" }, limit: { type: "number", description: "Número de resultados (default 5)" }, max_chars: { type: "number", description: "Máximo de caracteres de contenido (default 2000)" } }, required: [] } },
    { name: "ver_tarea_agente", description: "Consulta el estado y resultado de la última tarea de un agente. Usa cuando el usuario pregunta '¿ya terminó X?', '¿qué encontró X?', 'resultado de la tarea de X'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, agent_id: { type: "string" }, agent_name: { type: "string", description: "Nombre del agente" }, task_id: { type: "string", description: "ID específico de tarea (opcional)" } }, required: ["org_id"] } },
    { name: "reunion_agentes", description: "Convoca una reunión con múltiples agentes sobre un tema. Cada agente da su perspectiva según su rol. Usa cuando: 'haz una reunión con X y Y sobre...', 'quiero que X y Y discutan...', 'junta a los agentes para hablar de...'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, agent_names: { type: "array", items: { type: "string" }, description: "Nombres de los agentes a convocar" }, topic: { type: "string", description: "El tema a discutir" } }, required: ["org_id", "agent_names", "topic"] } },
  ];

  async function gwExecuteTool(name, args) {
    const base = SB_URL;
    try {
      switch (name) {
        case "buscar_prospectos": return await sbFetch(`${base}/functions/v1/cascade-search-company`, { method: "POST", headers: sbHeaders(true), body: JSON.stringify(args) });
        case "crear_cadencia": {
          const { steps, ...cd } = args;
          const cad = await sbFetch(`${base}/rest/v1/cadences`, { method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify({ ...cd, status: "draft" }) });
          const c = Array.isArray(cad) ? cad[0] : cad;
          if (!c?.id) return { success: false, error: "No se pudo crear la cadencia", details: cad };
          const rows = steps.map(s => ({ ...s, cadence_id: c.id, org_id: args.org_id }));
          const created = await sbFetch(`${base}/rest/v1/cadence_steps`, { method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify(rows) });
          return { success: true, cadence_id: c.id, cadence_name: c.name, steps_created: Array.isArray(created) ? created.length : 0 };
        }
        case "descubrir_empresas": return await sbFetch(`${base}/functions/v1/discover-icp-companies`, { method: "POST", headers: sbHeaders(true), body: JSON.stringify(args) });
        case "investigar_empresa": return await sbFetch(`${base}/functions/v1/company-research`, { method: "POST", headers: sbHeaders(true), body: JSON.stringify(args) });
        case "enriquecer_prospectos": return await sbFetch(`${base}/functions/v1/enrich-prospect`, { method: "POST", headers: sbHeaders(true), body: JSON.stringify(args) });
        case "ver_actividad": {
          const p = new URLSearchParams({ select: "*", org_id: `eq.${args.org_id}`, order: "created_at.desc", limit: String(args.limit || 20) });
          if (args.lead_id) p.set("lead_id", `eq.${args.lead_id}`);
          if (args.cadence_id) p.set("cadence_id", `eq.${args.cadence_id}`);
          if (args.activity_type) p.set("activity_type", `eq.${args.activity_type}`);
          if (args.status) p.set("status", `eq.${args.status}`);
          if (args.date_from) p.set("created_at", `gte.${args.date_from}`);
          const data = await sbFetch(`${base}/rest/v1/activity_log?${p}`, { headers: sbHeaders() });
          return { success: true, activities: data, total: Array.isArray(data) ? data.length : 0 };
        }
        case "enviar_mensaje": return await sbFetch(`${base}/functions/v1/linkedin-send-message`, { method: "POST", headers: sbHeaders(true), body: JSON.stringify(args) });
        case "business_case": return await sbFetch(`${base}/functions/v1/generate-business-case`, { method: "POST", headers: sbHeaders(true), body: JSON.stringify(args) });
        case "ver_metricas": {
          const cp = new URLSearchParams({ select: "*", org_id: `eq.${args.org_id}` });
          if (args.cadence_id) cp.set("id", `eq.${args.cadence_id}`);
          const ap = new URLSearchParams({ select: "activity_type,status,created_at", org_id: `eq.${args.org_id}`, limit: "1000" });
          if (args.cadence_id) ap.set("cadence_id", `eq.${args.cadence_id}`);
          const lp = new URLSearchParams({ select: "status,cadence_id", org_id: `eq.${args.org_id}` });
          if (args.cadence_id) lp.set("cadence_id", `eq.${args.cadence_id}`);
          const [cads, acts, leads] = await Promise.all([
            sbFetch(`${base}/rest/v1/cadences?${cp}`, { headers: sbHeaders() }),
            sbFetch(`${base}/rest/v1/activity_log?${ap}`, { headers: sbHeaders() }),
            sbFetch(`${base}/rest/v1/cadence_leads?${lp}`, { headers: sbHeaders() }),
          ]);
          return { success: true, cadences: cads, activities: acts, cadence_leads: leads };
        }
        case "gestionar_leads": {
          const { org_id, operation, filters, lead, lead_id, lead_ids, updates, cadence_id } = args;
          if (operation === "list") {
            const p = new URLSearchParams({ select: "*", org_id: `eq.${org_id}`, order: "created_at.desc", limit: String(filters?.limit || 20) });
            if (filters?.status) p.set("status", `eq.${filters.status}`);
            if (filters?.company) p.set("company", `eq.${filters.company}`);
            const data = await sbFetch(`${base}/rest/v1/leads?${p}`, { headers: sbHeaders() });
            return { success: true, leads: data, total: Array.isArray(data) ? data.length : 0 };
          }
          if (operation === "create") {
            const data = await sbFetch(`${base}/rest/v1/leads`, { method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify({ ...lead, org_id }) });
            const c = Array.isArray(data) ? data[0] : data;
            return { success: !!c?.id, lead: c };
          }
          if (operation === "update") {
            const data = await sbFetch(`${base}/rest/v1/leads?id=eq.${lead_id}&org_id=eq.${org_id}`, { method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify(updates) });
            const u = Array.isArray(data) ? data[0] : data;
            return { success: !!u?.id, lead: u };
          }
          if (operation === "assign_to_cadence") {
            const ids = lead_ids?.length ? lead_ids : (lead_id ? [lead_id] : []);
            if (!ids.length) return { success: false, error: "Se requiere lead_id o lead_ids" };
            const rows = ids.map(id => ({ cadence_id, lead_id: id, org_id, status: "active", current_step: 1 }));
            const data = await sbFetch(`${base}/rest/v1/cadence_leads`, { method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify(rows) });
            return { success: true, assigned: Array.isArray(data) ? data.length : 0 };
          }
          if (operation === "remove_from_cadence") {
            await fetch(`${base}/rest/v1/cadence_leads?lead_id=eq.${lead_id}&cadence_id=eq.${cadence_id}&org_id=eq.${org_id}`, { method: "DELETE", headers: sbHeaders() });
            return { success: true };
          }
          return { success: false, error: `Operación desconocida: ${operation}` };
        }
        case "enviar_otp": {
          const { email } = args;
          const res = await sbFetch(`${base}/auth/v1/otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": SB_KEY },
            body: JSON.stringify({ email, should_create_user: false }),
          });
          if (res?.error) return { success: false, error: res.error.message || "No se pudo enviar el código. Verifica que el email esté registrado en Chief." };
          return { success: true };
        }
        case "verificar_otp": {
          const { email, token, org_id, whatsapp_number } = args;
          // Verify OTP with Supabase Auth
          const verifyRes = await sbFetch(`${base}/auth/v1/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": SB_KEY },
            body: JSON.stringify({ type: "email", email, token }),
          });
          if (verifyRes?.error || !verifyRes?.user?.id) {
            return { success: false, error: verifyRes?.error?.message || "Código inválido o expirado. Pide uno nuevo." };
          }
          const user_id = verifyRes.user.id;
          // Resolve org membership
          const members = await sbFetch(`${base}/rest/v1/organization_members?org_id=eq.${org_id}&user_id=eq.${user_id}&select=id,role&limit=1`, { headers: sbHeaders() });
          const member = Array.isArray(members) ? members[0] : null;
          if (!member) return { success: false, error: "El usuario verificado no pertenece a esta organización." };
          // Get display name
          const profs = await sbFetch(`${base}/rest/v1/profiles?user_id=eq.${user_id}&select=full_name&limit=1`, { headers: sbHeaders() });
          const display_name = Array.isArray(profs) ? profs[0]?.full_name : null;
          // Save session permanently
          await sbFetch(`${base}/rest/v1/chief_sessions`, {
            method: "POST",
            headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates,return=representation" },
            body: JSON.stringify({ whatsapp_number, org_id, user_id, member_id: member.id, display_name, updated_at: new Date().toISOString() }),
          });
          console.log(`[gateway] OTP verified & session saved: ${whatsapp_number} → ${email} (${user_id})`);
          return { success: true, user_id, member_id: member.id, display_name, role: member.role };
        }
        case "identificar_usuario": {
          const { org_id, email } = args;
          const data = await sbFetch(`${base}/rest/v1/rpc/search_org_member_by_email`, {
            method: "POST",
            headers: sbHeaders(false),
            body: JSON.stringify({ p_org_id: org_id, p_email: email }),
          });
          if (Array.isArray(data) && data.length > 0) return { success: true, user: data[0] };
          if (data?.user_id) return { success: true, user: data };
          return { success: false, error: "Usuario no encontrado en esta organización. Verifica el email y el org_id." };
        }
        case "guardar_sesion": {
          const { whatsapp_number, org_id, user_id, member_id, display_name } = args;
          const payload = { whatsapp_number, updated_at: new Date().toISOString() };
          if (org_id) payload.org_id = org_id;
          if (user_id) payload.user_id = user_id;
          if (member_id) payload.member_id = member_id;
          if (display_name) payload.display_name = display_name;
          const data = await sbFetch(`${base}/rest/v1/chief_sessions`, {
            method: "POST",
            headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates,return=representation" },
            body: JSON.stringify(payload),
          });
          const r = Array.isArray(data) ? data[0] : data;
          return { success: !!r?.whatsapp_number, session: r };
        }
        case "enviar_email":
          return await sbFetch(`${base}/functions/v1/send-email`, { method: "POST", headers: sbHeaders(true), body: JSON.stringify({ leadId: args.lead_id, to: args.to, subject: args.subject, body: args.body, cc: args.cc, ownerId: args.owner_id, orgId: args.org_id }) });

        case "gestionar_prompts": {
          const { org_id, owner_id, operation, prompt_id, prompt, updates, filters } = args;
          if (operation === "list") {
            const p = new URLSearchParams({ select: "*", org_id: `eq.${org_id}`, order: "created_at.desc", limit: String(filters?.limit || 20) });
            if (owner_id) p.set("owner_id", `eq.${owner_id}`);
            if (filters?.prompt_type) p.set("prompt_type", `eq.${filters.prompt_type}`);
            if (filters?.step_type) p.set("step_type", `eq.${filters.step_type}`);
            const data = await sbFetch(`${base}/rest/v1/ai_prompts?${p}`, { headers: sbHeaders() });
            return { success: true, prompts: data, total: Array.isArray(data) ? data.length : 0 };
          }
          if (operation === "get") {
            const data = await sbFetch(`${base}/rest/v1/ai_prompts?id=eq.${prompt_id}&org_id=eq.${org_id}`, { headers: sbHeaders() });
            return { success: true, prompt: Array.isArray(data) ? data[0] : data };
          }
          if (operation === "create") {
            const data = await sbFetch(`${base}/rest/v1/ai_prompts`, { method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify({ ...prompt, org_id, owner_id }) });
            return { success: true, prompt: Array.isArray(data) ? data[0] : data };
          }
          if (operation === "update") {
            const data = await sbFetch(`${base}/rest/v1/ai_prompts?id=eq.${prompt_id}&org_id=eq.${org_id}`, { method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify(updates) });
            return { success: true, prompt: Array.isArray(data) ? data[0] : data };
          }
          if (operation === "delete") {
            await fetch(`${base}/rest/v1/ai_prompts?id=eq.${prompt_id}&org_id=eq.${org_id}`, { method: "DELETE", headers: sbHeaders() });
            return { success: true };
          }
          return { success: false, error: `Operación desconocida: ${operation}` };
        }

        case "gestionar_templates": {
          const { org_id, owner_id, operation, template_id, template, updates, filters } = args;
          if (operation === "list") {
            const p = new URLSearchParams({ select: "*", org_id: `eq.${org_id}`, order: "created_at.desc", limit: String(filters?.limit || 20) });
            if (owner_id) p.set("owner_id", `eq.${owner_id}`);
            if (filters?.step_type) p.set("step_type", `eq.${filters.step_type}`);
            const data = await sbFetch(`${base}/rest/v1/templates?${p}`, { headers: sbHeaders() });
            return { success: true, templates: data, total: Array.isArray(data) ? data.length : 0 };
          }
          if (operation === "get") {
            const data = await sbFetch(`${base}/rest/v1/templates?id=eq.${template_id}&org_id=eq.${org_id}`, { headers: sbHeaders() });
            return { success: true, template: Array.isArray(data) ? data[0] : data };
          }
          if (operation === "create") {
            const data = await sbFetch(`${base}/rest/v1/templates`, { method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify({ ...template, org_id, owner_id }) });
            return { success: true, template: Array.isArray(data) ? data[0] : data };
          }
          if (operation === "update") {
            const data = await sbFetch(`${base}/rest/v1/templates?id=eq.${template_id}&org_id=eq.${org_id}`, { method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify(updates) });
            return { success: true, template: Array.isArray(data) ? data[0] : data };
          }
          if (operation === "delete") {
            await fetch(`${base}/rest/v1/templates?id=eq.${template_id}&org_id=eq.${org_id}`, { method: "DELETE", headers: sbHeaders() });
            return { success: true };
          }
          return { success: false, error: `Operación desconocida: ${operation}` };
        }

        case "gestionar_personas": {
          const { org_id, owner_id, operation, persona_id, persona, updates, filters } = args;
          if (operation === "list") {
            const p = new URLSearchParams({ select: "*", org_id: `eq.${org_id}`, order: "created_at.desc", limit: String(filters?.limit || 20) });
            if (owner_id) p.set("owner_id", `eq.${owner_id}`);
            if (filters?.icp_profile_id) p.set("icp_profile_id", `eq.${filters.icp_profile_id}`);
            const data = await sbFetch(`${base}/rest/v1/buyer_personas?${p}`, { headers: sbHeaders() });
            return { success: true, personas: data, total: Array.isArray(data) ? data.length : 0 };
          }
          if (operation === "get") {
            const data = await sbFetch(`${base}/rest/v1/buyer_personas?id=eq.${persona_id}&org_id=eq.${org_id}`, { headers: sbHeaders() });
            return { success: true, persona: Array.isArray(data) ? data[0] : data };
          }
          if (operation === "create") {
            const data = await sbFetch(`${base}/rest/v1/buyer_personas`, { method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify({ ...persona, org_id, owner_id }) });
            return { success: true, persona: Array.isArray(data) ? data[0] : data };
          }
          if (operation === "update") {
            const data = await sbFetch(`${base}/rest/v1/buyer_personas?id=eq.${persona_id}&org_id=eq.${org_id}`, { method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify(updates) });
            return { success: true, persona: Array.isArray(data) ? data[0] : data };
          }
          if (operation === "delete") {
            await fetch(`${base}/rest/v1/buyer_personas?id=eq.${persona_id}&org_id=eq.${org_id}`, { method: "DELETE", headers: sbHeaders() });
            return { success: true };
          }
          return { success: false, error: `Operación desconocida: ${operation}` };
        }

        case "gestionar_perfiles_icp": {
          const { org_id, owner_id, operation, profile_id, profile, updates } = args;
          if (operation === "list") {
            const p = new URLSearchParams({ select: "*", org_id: `eq.${org_id}`, order: "created_at.desc" });
            if (owner_id) p.set("owner_id", `eq.${owner_id}`);
            const data = await sbFetch(`${base}/rest/v1/icp_profiles?${p}`, { headers: sbHeaders() });
            return { success: true, profiles: data, total: Array.isArray(data) ? data.length : 0 };
          }
          if (operation === "get") {
            const [prof, personas] = await Promise.all([
              sbFetch(`${base}/rest/v1/icp_profiles?id=eq.${profile_id}&org_id=eq.${org_id}`, { headers: sbHeaders() }),
              sbFetch(`${base}/rest/v1/buyer_personas?icp_profile_id=eq.${profile_id}&org_id=eq.${org_id}`, { headers: sbHeaders() }),
            ]);
            return { success: true, profile: Array.isArray(prof) ? prof[0] : prof, personas: personas };
          }
          if (operation === "create") {
            const data = await sbFetch(`${base}/rest/v1/icp_profiles`, { method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify({ ...profile, org_id, owner_id }) });
            return { success: true, profile: Array.isArray(data) ? data[0] : data };
          }
          if (operation === "update") {
            const data = await sbFetch(`${base}/rest/v1/icp_profiles?id=eq.${profile_id}&org_id=eq.${org_id}`, { method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify(updates) });
            return { success: true, profile: Array.isArray(data) ? data[0] : data };
          }
          if (operation === "delete") {
            await fetch(`${base}/rest/v1/icp_profiles?id=eq.${profile_id}&org_id=eq.${org_id}`, { method: "DELETE", headers: sbHeaders() });
            return { success: true };
          }
          return { success: false, error: `Operación desconocida: ${operation}` };
        }

        case "ver_notificaciones": {
          const { org_id, owner_id, operation, notification_id, filters } = args;
          if (operation === "list") {
            const p = new URLSearchParams({ select: "*", org_id: `eq.${org_id}`, order: "created_at.desc", limit: String(filters?.limit || 20) });
            if (owner_id) p.set("owner_id", `eq.${owner_id}`);
            if (filters?.is_read !== undefined) p.set("is_read", `eq.${filters.is_read}`);
            if (filters?.type) p.set("type", `eq.${filters.type}`);
            const data = await sbFetch(`${base}/rest/v1/notifications?${p}`, { headers: sbHeaders() });
            return { success: true, notifications: data, total: Array.isArray(data) ? data.length : 0 };
          }
          if (operation === "mark_read") {
            await sbFetch(`${base}/rest/v1/notifications?id=eq.${notification_id}&org_id=eq.${org_id}`, { method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" }, body: JSON.stringify({ is_read: true }) });
            return { success: true };
          }
          if (operation === "mark_all_read") {
            const p = new URLSearchParams({ org_id: `eq.${org_id}`, is_read: "eq.false" });
            if (owner_id) p.set("owner_id", `eq.${owner_id}`);
            await sbFetch(`${base}/rest/v1/notifications?${p}`, { method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" }, body: JSON.stringify({ is_read: true }) });
            return { success: true };
          }
          return { success: false, error: `Operación desconocida: ${operation}` };
        }

        case "ver_cadencia_detalle": {
          const { org_id, cadence_id } = args;
          const [cadence, steps, leads] = await Promise.all([
            sbFetch(`${base}/rest/v1/cadences?id=eq.${cadence_id}&org_id=eq.${org_id}`, { headers: sbHeaders() }),
            sbFetch(`${base}/rest/v1/cadence_steps?cadence_id=eq.${cadence_id}&org_id=eq.${org_id}&order=day_offset.asc,order_in_day.asc`, { headers: sbHeaders() }),
            sbFetch(`${base}/rest/v1/cadence_leads?cadence_id=eq.${cadence_id}&org_id=eq.${org_id}&select=id,lead_id,status,current_step_id`, { headers: sbHeaders() }),
          ]);
          return { success: true, cadence: Array.isArray(cadence) ? cadence[0] : cadence, steps, leads, total_leads: Array.isArray(leads) ? leads.length : 0 };
        }

        case "ver_conexiones": {
          const { org_id, user_id } = args;
          const [linkedin, gmail] = await Promise.all([
            sbFetch(`${base}/rest/v1/unipile_accounts?user_id=eq.${user_id}&select=id,provider,account_id,status`, { headers: sbHeaders() }),
            sbFetch(`${base}/rest/v1/ae_integrations?user_id=eq.${user_id}&org_id=eq.${org_id}&select=id,provider,config`, { headers: sbHeaders() }),
          ]);
          return { success: true, linkedin: Array.isArray(linkedin) ? linkedin : [], gmail: Array.isArray(gmail) ? gmail : [] };
        }

        case "ver_programacion": {
          const { org_id, cadence_id, status, limit } = args;
          const p = new URLSearchParams({ select: "*", org_id: `eq.${org_id}`, order: "scheduled_at.asc", limit: String(limit || 20) });
          if (cadence_id) p.set("cadence_id", `eq.${cadence_id}`);
          if (status) p.set("status", `eq.${status}`);
          const data = await sbFetch(`${base}/rest/v1/schedules?${p}`, { headers: sbHeaders() });
          return { success: true, schedules: data, total: Array.isArray(data) ? data.length : 0 };
        }

        case "capturar_pantalla": {
          const { page_path, user_email, wait_ms = 6000 } = args;
          const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;
          if (!FIRECRAWL_KEY) return { success: false, error: "FIRECRAWL_API_KEY no configurada en el servidor" };
          // Step 1: Generate magic link
          const redirectTo = `https://laiky-cadence.vercel.app${page_path}`;
          const linkRes = await sbFetch(`${base}/auth/v1/admin/generate_link`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}`, "apikey": SB_KEY },
            body: JSON.stringify({ type: "magiclink", email: user_email, options: { redirect_to: redirectTo } }),
          });
          if (!linkRes?.properties?.action_link && !linkRes?.action_link) {
            return { success: false, error: "No se pudo generar el link de autenticación", details: linkRes };
          }
          const actionLink = linkRes.properties?.action_link || linkRes.action_link;
          // Step 2: Firecrawl screenshot
          const scrapeRes = await fetch("https://api.firecrawl.dev/v2/scrape", {
            method: "POST",
            headers: { "Authorization": `Bearer ${FIRECRAWL_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ url: actionLink, formats: ["screenshot"], waitFor: wait_ms }),
          });
          const scrapeData = await scrapeRes.json();
          if (!scrapeData?.success || !scrapeData?.data?.screenshot) {
            return { success: false, error: "No se pudo capturar la pantalla", details: scrapeData?.error || scrapeData };
          }
          return { success: true, screenshot_url: scrapeData.data.screenshot, page: page_path };
        }

        case "ver_calendario": {
          const dateFrom = args.date_from || new Date().toISOString().split("T")[0];
          const dateTo = args.date_to || (() => {
            const d = new Date(dateFrom + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 6);
            return d.toISOString().split("T")[0];
          })();
          const data = await sbFetch(
            `${base}/rest/v1/ae_activities?select=id,title,occurred_at,duration_seconds,participants,summary,raw_data&user_id=eq.${args.user_id}&org_id=eq.${args.org_id}&type=eq.meeting&occurred_at=gte.${dateFrom}T00:00:00.000Z&occurred_at=lte.${dateTo}T23:59:59.999Z&order=occurred_at.asc&limit=50`,
            { headers: sbHeaders() }
          );
          const evs = Array.isArray(data) ? data : [];
          return {
            success: true, date_from: dateFrom, date_to: dateTo, total: evs.length,
            events: evs.map(e => ({
              id: e.id, title: e.title, start: e.occurred_at,
              duration_min: e.duration_seconds ? Math.round(e.duration_seconds / 60) : null,
              external_attendees: (e.participants || []).filter(p => !p.is_self).map(p => ({ name: p.name, email: p.email })),
              location: e.raw_data?.location || null,
              meet_link: e.raw_data?.meet_link || null,
              html_link: e.raw_data?.html_link || null,
            })),
          };
        }

        case "buscar_slots_disponibles":
          return await sbFetch(`${base}/functions/v1/ae-calendar-free-slots`, {
            method: "POST", headers: sbHeaders(true), body: JSON.stringify(args),
          });

        case "crear_evento_calendario":
          return await sbFetch(`${base}/functions/v1/ae-calendar-create-event`, {
            method: "POST", headers: sbHeaders(true), body: JSON.stringify(args),
          });

        case "sincronizar_calendario":
          return await sbFetch(`${base}/functions/v1/ae-calendar-sync`, {
            method: "POST", headers: sbHeaders(true), body: JSON.stringify(args),
          });

        // --- Agent Platform tools ---
        case "gestionar_agentes": {
          const op = args.operation;
          if (op === "create") {
            const soulMd = args.soul_md || `# ${args.name || "Agent"}

## Identidad
Eres **${args.name || "Agent"}**, un agente AI con el rol de **${args.role || "custom"}** dentro de la organización.
${args.description ? `\n${args.description}\n` : ""}

## Idioma
- Español es tu idioma principal. Si el usuario escribe en inglés, responde en inglés.

## Personalidad
- Profesional y directo.
- Eficiente — vas al grano.
- Proactivo — sugieres siguientes pasos.

## Reglas
- Sé directo, eficiente y profesional.
- Reporta resultados de forma concisa.
- Siempre necesitas org_id para operaciones con datos.
- Nunca expongas tokens, keys o IDs internos al usuario.`;
            return await sbFetch(`${base}/functions/v1/manage-agent`, {
              method: "POST", headers: sbHeaders(true),
              body: JSON.stringify({ org_id: args.org_id, name: args.name, role: args.role, description: args.description, soul_md: soulMd, skills: args.skills || [] }),
            });
          }
          if (op === "list") {
            return await sbFetch(`${base}/functions/v1/manage-agent?org_id=${encodeURIComponent(args.org_id)}`, {
              method: "GET", headers: sbHeaders(true),
            });
          }
          if (op === "get") {
            return await sbFetch(`${base}/functions/v1/manage-agent?agent_id=${encodeURIComponent(args.agent_id)}`, {
              method: "GET", headers: sbHeaders(true),
            });
          }
          if (op === "delete") {
            return await sbFetch(`${base}/functions/v1/manage-agent`, {
              method: "DELETE", headers: sbHeaders(true),
              body: JSON.stringify({ agent_id: args.agent_id }),
            });
          }
          return { success: false, error: `Operación desconocida: ${op}` };
        }

        case "delegar_tarea": {
          // Resolve agent by ID or name
          let agent = null;
          if (args.agent_id) {
            const p = new URLSearchParams({ id: `eq.${args.agent_id}`, select: "id,name,role,status,railway_url", limit: "1" });
            const rows = await sbFetch(`${base}/rest/v1/agents?${p}`, { headers: sbHeaders() });
            if (Array.isArray(rows) && rows.length > 0) agent = rows[0];
          } else if (args.agent_name) {
            const p = new URLSearchParams({ org_id: `eq.${args.org_id}`, name: `ilike.%${args.agent_name}%`, status: "neq.destroyed", select: "id,name,role,status,railway_url", limit: "1" });
            const rows = await sbFetch(`${base}/rest/v1/agents?${p}`, { headers: sbHeaders() });
            if (Array.isArray(rows) && rows.length > 0) agent = rows[0];
          }
          if (!agent) return { success: false, error: "Agente no encontrado. Usa gestionar_agentes list para ver los agentes disponibles." };

          // Create task record
          const taskRes = await sbFetch(`${base}/functions/v1/agent-task`, {
            method: "POST", headers: sbHeaders(true),
            body: JSON.stringify({ org_id: args.org_id, agent_id: agent.id, instruction: args.instruction, delegated_by: "orchestrator" }),
          });
          const taskId = taskRes?.task?.id;

          // If agent is deployed, send task (async — agent responds immediately, processes in background)
          if (agent.status === "active" && agent.railway_url) {
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 15000); // Short timeout — just confirm acceptance
              // Build callback URL so agent can notify user when done
              const callbackUrl = `https://twilio-bridge-production-241b.up.railway.app/api/agent-callback`;
              // Get WhatsApp number from DB (chief_sessions)
              let waNumber = null;
              try {
                const sp = new URLSearchParams({ org_id: `eq.${args.org_id}`, select: "whatsapp_number", limit: "1", order: "updated_at.desc" });
                const sessions = await sbFetch(`${base}/rest/v1/chief_sessions?${sp}`, { headers: sbHeaders() });
                if (Array.isArray(sessions) && sessions.length > 0) waNumber = sessions[0].whatsapp_number;
              } catch (_) {}

              const agentRes = await fetch(`${agent.railway_url}/api/task`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}` },
                body: JSON.stringify({ instruction: args.instruction, context: { org_id: args.org_id }, task_id: taskId, callback_url: callbackUrl, whatsapp_number: waNumber, agent_name: agent.name }),
                signal: controller.signal,
              });
              clearTimeout(timeout);
              const result = await agentRes.json();

              // If agent returned a full result (sync mode or fast task)
              if (result.result && !result.accepted) {
                if (taskId) {
                  await sbFetch(`${base}/functions/v1/agent-task`, {
                    method: "PATCH", headers: sbHeaders(true),
                    body: JSON.stringify({ task_id: taskId, status: "completed", result }),
                  });
                }
                return { success: true, agent: agent.name, task_id: taskId, result: result.result };
              }

              // Agent accepted the task and is processing async
              return { success: true, agent: agent.name, task_id: taskId, status: "processing", message: `${agent.name} recibió la tarea y está trabajando en ella. El resultado se guardará automáticamente cuando termine. Puedes preguntar "¿ya terminó ${agent.name}?" en unos minutos.` };
            } catch (err) {
              // Timeout just means the agent is still processing — that's OK
              return { success: true, agent: agent.name, task_id: taskId, status: "processing", message: `Tarea enviada a ${agent.name}. Está trabajando en ella — puede tomar unos minutos. Pregunta "¿ya terminó ${agent.name}?" cuando quieras ver el resultado.` };
            }
          }

          // Agent not deployed
          return { success: true, agent: agent.name, task_id: taskId, status: "pending", message: `Tarea creada para ${agent.name} (${agent.role}), pero el agente no está desplegado aún. Se ejecutará cuando el agente esté activo.` };
        }

        case "consultar_agente": {
          // Resolve agent by ID or name (same logic)
          let agent = null;
          if (args.agent_id) {
            const p = new URLSearchParams({ id: `eq.${args.agent_id}`, select: "id,name,role,status,railway_url", limit: "1" });
            const rows = await sbFetch(`${base}/rest/v1/agents?${p}`, { headers: sbHeaders() });
            if (Array.isArray(rows) && rows.length > 0) agent = rows[0];
          } else if (args.agent_name) {
            const p = new URLSearchParams({ org_id: `eq.${args.org_id}`, name: `ilike.%${args.agent_name}%`, status: "neq.destroyed", select: "id,name,role,status,railway_url", limit: "1" });
            const rows = await sbFetch(`${base}/rest/v1/agents?${p}`, { headers: sbHeaders() });
            if (Array.isArray(rows) && rows.length > 0) agent = rows[0];
          }
          if (!agent) return { success: false, error: "Agente no encontrado. Usa gestionar_agentes list para ver los agentes disponibles." };

          if (agent.status !== "active" || !agent.railway_url) {
            return { success: false, error: `${agent.name} no está desplegado. No puedo consultarlo hasta que esté activo.` };
          }

          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60000);
            const res = await fetch(`${agent.railway_url}/api/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}` },
              body: JSON.stringify({ message: args.message, context: { org_id: args.org_id } }),
              signal: controller.signal,
            });
            clearTimeout(timeout);
            const result = await res.json();

            // Log exchange
            await sbFetch(`${base}/rest/v1/agent_messages`, {
              method: "POST",
              headers: { ...sbHeaders(), Prefer: "return=minimal" },
              body: JSON.stringify([
                { org_id: args.org_id, to_agent_id: agent.id, role: "user", content: args.message },
                { org_id: args.org_id, from_agent_id: agent.id, role: "assistant", content: typeof result.reply === "string" ? result.reply : JSON.stringify(result) },
              ]),
            });

            return { success: true, agent: agent.name, reply: result.reply || result };
          } catch (err) {
            return { success: false, agent: agent.name, error: `Error consultando al agente: ${err.message}` };
          }
        }

        case "ver_tarea_agente": {
          // Get the latest task for an agent
          let agentId = args.agent_id;
          if (!agentId && args.agent_name) {
            const p = new URLSearchParams({ org_id: `eq.${args.org_id}`, name: `ilike.%${args.agent_name}%`, status: "neq.destroyed", select: "id,name", limit: "1" });
            const rows = await sbFetch(`${base}/rest/v1/agents?${p}`, { headers: sbHeaders() });
            if (Array.isArray(rows) && rows.length > 0) agentId = rows[0].id;
          }
          if (!agentId) return { success: false, error: "Agente no encontrado." };

          const tp = new URLSearchParams({ org_id: `eq.${args.org_id}`, agent_id: `eq.${agentId}`, order: "created_at.desc", limit: "1", select: "*" });
          if (args.task_id) tp.set("id", `eq.${args.task_id}`);
          const tasks = await sbFetch(`${base}/rest/v1/agent_tasks?${tp}`, { headers: sbHeaders() });
          if (!Array.isArray(tasks) || tasks.length === 0) return { success: false, error: "No hay tareas para este agente." };

          const task = tasks[0];
          const resultText = task.result && typeof task.result === "object" && task.result.text ? task.result.text : (task.error || "Sin resultado");

          // For large results: send directly to WhatsApp, bypass Claude entirely
          if (resultText.length > 3000 && task.status === "completed") {
            try {
              // Look up WhatsApp number
              const sp = new URLSearchParams({ org_id: `eq.${args.org_id}`, select: "whatsapp_number", limit: "1" });
              const sessions = await sbFetch(`${base}/rest/v1/chief_sessions?${sp}`, { headers: sbHeaders() });
              const waNum = Array.isArray(sessions) && sessions.length > 0 ? sessions[0].whatsapp_number : null;

              if (waNum) {
                const fullMsg = `📋 *Reporte completo de ${args.agent_name || "agente"}:*\n\n${resultText}`;
                const chunks = splitMessage(fullMsg);
                for (const chunk of chunks) {
                  await twilioClient.messages.create({ from: TWILIO_WHATSAPP_NUMBER, to: `whatsapp:+${waNum}`, body: chunk });
                  if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
                }
                console.log(`[ver_tarea] Sent ${chunks.length} msgs directly to ${waNum} (${resultText.length} chars)`);
                return { success: true, status: task.status, message: `Reporte completo enviado directo a tu WhatsApp (${resultText.length} caracteres, ${chunks.length} mensajes). Revísalo ahí.` };
              }
            } catch (sendErr) {
              console.error("[ver_tarea] Direct send error:", sendErr.message);
            }
          }

          // For small results or if direct send failed: return normally
          return {
            success: true,
            task_id: task.id,
            status: task.status,
            instruction: task.instruction?.substring(0, 200),
            result_text: resultText.length > 3000 ? resultText.substring(0, 3000) + "\n\n[... resultado parcial]" : resultText,
            error: task.error,
            completed_at: task.completed_at,
          };
        }

        case "reunion_agentes": {
          const { org_id, agent_names, topic } = args;
          if (!agent_names || agent_names.length === 0) return { success: false, error: "Se necesita al menos un agente." };

          // Resolve all agents
          const resolvedAgents = [];
          for (const name of agent_names) {
            const p = new URLSearchParams({ org_id: `eq.${org_id}`, name: `ilike.%${name}%`, status: "neq.destroyed", select: "id,name,role,status,railway_url", limit: "1" });
            const rows = await sbFetch(`${base}/rest/v1/agents?${p}`, { headers: sbHeaders() });
            if (Array.isArray(rows) && rows.length > 0) resolvedAgents.push(rows[0]);
          }

          if (resolvedAgents.length === 0) return { success: false, error: "No se encontraron agentes con esos nombres." };

          // Send topic to each agent in parallel
          const prompt = `El orchestrator Chief te convoca a una reunión con otros agentes. El tema es:\n\n"${topic}"\n\nDa tu perspectiva como ${"{role}"} de forma concisa (máximo 3 párrafos). Sé directo y aporta valor desde tu rol.`;

          const responses = await Promise.allSettled(
            resolvedAgents.map(async (agent) => {
              if (agent.status !== "active" || !agent.railway_url) {
                return { agent: agent.name, role: agent.role, reply: `[${agent.name} no está desplegado]` };
              }
              try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 60000);
                const res = await fetch(`${agent.railway_url}/api/chat`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}` },
                  body: JSON.stringify({ message: prompt.replace("{role}", agent.role), context: { org_id, meeting: true, topic } }),
                  signal: controller.signal,
                });
                clearTimeout(timeout);
                const data = await res.json();
                return { agent: agent.name, role: agent.role, reply: data.reply || data.result || JSON.stringify(data) };
              } catch (err) {
                return { agent: agent.name, role: agent.role, reply: `[Error contactando a ${agent.name}: ${err.message}]` };
              }
            })
          );

          const results = responses.map(r => r.status === "fulfilled" ? r.value : { agent: "unknown", role: "unknown", reply: "[Error]" });

          // Log meeting in agent_messages
          for (const r of results) {
            const ag = resolvedAgents.find(a => a.name === r.agent);
            if (ag) {
              await sbFetch(`${base}/rest/v1/agent_messages`, {
                method: "POST", headers: { ...sbHeaders(), Prefer: "return=minimal" },
                body: JSON.stringify({ org_id, from_agent_id: ag.id, role: "assistant", content: r.reply, metadata: { meeting: true, topic } }),
              });
            }
          }

          return { success: true, topic, participants: results.map(r => r.agent), responses: results };
        }

        case "desplegar_agente": {
          // Resolve agent (with skills)
          let agent = null;
          if (args.agent_id) {
            const p = new URLSearchParams({ id: `eq.${args.agent_id}`, select: "*,agent_skills(*)", limit: "1" });
            const rows = await sbFetch(`${base}/rest/v1/agents?${p}`, { headers: sbHeaders() });
            if (Array.isArray(rows) && rows.length > 0) agent = rows[0];
          } else if (args.agent_name) {
            const p = new URLSearchParams({ org_id: `eq.${args.org_id}`, name: `ilike.%${args.agent_name}%`, status: "neq.destroyed", select: "*,agent_skills(*)", limit: "1" });
            const rows = await sbFetch(`${base}/rest/v1/agents?${p}`, { headers: sbHeaders() });
            if (Array.isArray(rows) && rows.length > 0) agent = rows[0];
          }
          if (!agent) return { success: false, error: "Agente no encontrado." };
          if (agent.status === "active" && agent.railway_service_id) {
            return { success: false, error: `${agent.name} ya está desplegado y activo.` };
          }

          if (!RAILWAY_API_TOKEN) return { success: false, error: "RAILWAY_API_TOKEN no configurado. No puedo desplegar." };

          try {
            // Update status to deploying
            await sbFetch(`${base}/functions/v1/manage-agent`, {
              method: "PATCH", headers: sbHeaders(true),
              body: JSON.stringify({ agent_id: agent.id, updates: { status: "deploying" } }),
            });

            // 1. Create Railway service
            const serviceName = `agent-${agent.name.toLowerCase().replace(/[^a-z0-9]/g, "-").substring(0, 30)}`;
            const createData = await railwayGQL(
              `mutation($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }`,
              { input: { projectId: RAILWAY_PROJECT_ID, name: serviceName, source: { repo: GITHUB_REPO } } }
            );
            const serviceId = createData.serviceCreate.id;
            console.log(`[deploy] Created Railway service ${serviceId} for agent ${agent.name}`);

            // 1b. Set rootDirectory via serviceInstanceUpdate
            await railwayGQL(
              `mutation { serviceInstanceUpdate(serviceId: "${serviceId}", environmentId: "${RAILWAY_ENVIRONMENT_ID}", input: { rootDirectory: "openclaw/agent-template" }) }`
            );
            console.log(`[deploy] Set rootDirectory to openclaw/agent-template`);

            // 2. Set environment variables
            await railwayGQL(
              `mutation($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }`,
              { input: {
                projectId: RAILWAY_PROJECT_ID,
                environmentId: RAILWAY_ENVIRONMENT_ID,
                serviceId,
                variables: (() => {
                  // Build AGENT_TOOLS from agent's skills
                  const comunicarTool = { name: "comunicar_agente", description: "Comunica con otro agente de la organización. Envía un mensaje y recibe respuesta.", input_schema: { type: "object", properties: { org_id: { type: "string" }, agent_id: { type: "string" }, agent_name: { type: "string", description: "Nombre del agente destino" }, message: { type: "string" } }, required: ["message"] } };
                  let toolsForAgent = [];
                  try {
                    // Match agent skills to gateway tool definitions
                    const skillNames = (agent.agent_skills || []).filter(s => s.enabled !== false).map(s => s.skill_name);
                    toolsForAgent = gwTools.filter(t => skillNames.includes(t.name) && !["gestionar_agentes","delegar_tarea","consultar_agente","desplegar_agente"].includes(t.name));
                    toolsForAgent.push(comunicarTool);
                  } catch (e) { console.error("[deploy] Error building AGENT_TOOLS:", e.message); }

                  // Build enriched SOUL_MD: agent personality + skill docs + learning instructions
                  const skillNames = (agent.agent_skills || []).filter(s => s.enabled !== false).map(s => s.skill_name);
                  let enrichedSoulMd = agent.soul_md;

                  // Inject relevant skill documentation from AGENTS.md
                  if (AGENTS_MD) {
                    // Extract skill sections that match this agent's skills
                    const skillDocs = [];
                    for (const name of skillNames) {
                      // Match "### N. skill_name" sections in AGENTS.md
                      const regex = new RegExp(`### \\d+\\.\\s*${name.replace(/_/g, "[_\\\\s-]")}[\\s\\S]*?(?=### \\d+\\.|## |$)`, "i");
                      const match = AGENTS_MD.match(regex);
                      if (match) skillDocs.push(match[0].trim());
                    }
                    if (skillDocs.length > 0) {
                      enrichedSoulMd += `\n\n---\n\n## Documentación de Skills\nUsa esta referencia para saber CÓMO y CUÁNDO usar cada herramienta:\n\n${skillDocs.join("\n\n")}`;
                    }
                  }

                  // Add learning system instructions
                  enrichedSoulMd += `\n\n---\n\n## Sistema de Aprendizaje
Después de cada tarea completada, reflexiona sobre qué aprendiste y guárdalo usando la herramienta registrar_aprendizaje. Ejemplos:
- "El cliente X prefiere comunicación por email, no LinkedIn"
- "Para empresas de tech en Colombia, usar títulos en inglés funciona mejor"
- "La cadencia de 5 pasos tiene mejor respuesta que la de 3"

Tus aprendizajes se cargan automáticamente en cada sesión para que seas cada vez más experto.`;

                  return {
                    PORT: "8080",
                    SOUL_MD: enrichedSoulMd,
                    AGENT_ID: agent.id,
                    ORG_ID: args.org_id,
                    ANTHROPIC_API_KEY: ANTHROPIC_API_KEY,
                    SUPABASE_URL: SB_URL,
                    SUPABASE_SERVICE_ROLE_KEY: SB_KEY,
                    AUTH_TOKEN: SB_KEY,
                    CLAUDE_MODEL: "claude-sonnet-4-6",
                    AGENT_TOOLS: JSON.stringify(toolsForAgent),
                  };
                })(),
              }}
            );
            console.log(`[deploy] Set env vars for service ${serviceId}`);

            // 3. Generate a Railway domain
            let railwayUrl = null;
            try {
              const domainData = await railwayGQL(
                `mutation($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { domain } }`,
                { input: { serviceId, environmentId: RAILWAY_ENVIRONMENT_ID } }
              );
              railwayUrl = `https://${domainData.serviceDomainCreate.domain}`;
              console.log(`[deploy] Domain created: ${railwayUrl}`);
            } catch (domErr) {
              console.error(`[deploy] Domain creation error:`, domErr.message);
            }

            // 4. Update agent record — set to active (Railway builds async, domain is ready)
            await sbFetch(`${base}/functions/v1/manage-agent`, {
              method: "PATCH", headers: sbHeaders(true),
              body: JSON.stringify({
                agent_id: agent.id,
                updates: {
                  railway_service_id: serviceId,
                  railway_url: railwayUrl,
                  status: "active",
                },
              }),
            });

            return {
              success: true,
              agent: agent.name,
              service_id: serviceId,
              railway_url: railwayUrl,
              status: "active",
              message: `${agent.name} desplegado exitosamente en Railway. URL: ${railwayUrl}. El servicio estará listo en ~2 minutos mientras se construye.`,
            };
          } catch (err) {
            console.error(`[deploy] Error deploying agent ${agent.name}:`, err.message);
            // Revert status
            await sbFetch(`${base}/functions/v1/manage-agent`, {
              method: "PATCH", headers: sbHeaders(true),
              body: JSON.stringify({ agent_id: agent.id, updates: { status: "error" } }),
            });
            return { success: false, error: `Error desplegando: ${err.message}` };
          }
        }

        default: return { success: false, error: `Tool desconocida: ${name}` };
      }
    } catch (err) {
      console.error(`[gateway] tool ${name} error:`, err.message);
      return { success: false, error: err.message };
    }
  }

  const gwSessions = new Map(); // sessionKey -> { history: [], systemPrompt: string }
  const GW_MAX_HISTORY = 50;

  async function loadUserContext(waId) {
    try {
      const p = new URLSearchParams({ whatsapp_number: `eq.${waId}`, select: "*", limit: "1" });
      const rows = await sbFetch(`${SB_URL}/rest/v1/chief_sessions?${p}`, { headers: sbHeaders() });
      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    } catch (err) {
      console.error("[gateway] loadUserContext error:", err.message);
      return null;
    }
  }

  // --- Conversation persistence ---
  async function loadConversationHistory(waId) {
    try {
      const p = new URLSearchParams({
        whatsapp_number: `eq.${waId}`,
        select: "role,content",
        order: "created_at.asc",
        limit: String(GW_MAX_HISTORY),
      });
      const rows = await sbFetch(`${SB_URL}/rest/v1/chief_conversation_history?${p}`, { headers: sbHeaders() });
      if (!Array.isArray(rows) || rows.length === 0) return [];
      // Filter out tool_result messages that reference old tool_use_ids (would cause API errors)
      // Only keep user text + assistant text messages for continuity
      const messages = [];
      for (const r of rows) {
        if (r.role === "user" && typeof r.content === "string") {
          messages.push({ role: "user", content: r.content });
        } else if (r.role === "assistant" && Array.isArray(r.content)) {
          // Only keep text blocks from assistant (skip tool_use to avoid stale references)
          const textBlocks = r.content.filter(b => b.type === "text" && b.text);
          if (textBlocks.length > 0) {
            messages.push({ role: "assistant", content: textBlocks });
          }
        }
      }
      console.log(`[gateway] Loaded ${messages.length} messages from history for ${waId}`);
      return messages;
    } catch (err) {
      console.error("[gateway] loadConversationHistory error:", err.message);
      return [];
    }
  }

  async function saveMessage(waId, orgId, role, content) {
    try {
      await sbFetch(`${SB_URL}/rest/v1/chief_conversation_history`, {
        method: "POST",
        headers: { ...sbHeaders(), Prefer: "return=minimal" },
        body: JSON.stringify({
          whatsapp_number: waId,
          org_id: orgId || null,
          role,
          content: typeof content === "string" ? content : content,
        }),
      });
    } catch (err) {
      console.error("[gateway] saveMessage error:", err.message);
    }
  }

  async function gwProcessMessage(sessionKey, message) {
    let session = gwSessions.get(sessionKey);
    let orgId = null;
    if (!session) {
      const ctx = await loadUserContext(sessionKey);
      let sp;
      if (ctx) {
        orgId = ctx.org_id;
        const parts = [`Número WhatsApp: ${sessionKey}`];
        if (ctx.display_name) parts.push(`Nombre: ${ctx.display_name}`);
        if (ctx.org_id) parts.push(`org_id: ${ctx.org_id}`);
        if (ctx.user_id) parts.push(`user_id: ${ctx.user_id}`);
        if (ctx.member_id) parts.push(`member_id: ${ctx.member_id}`);
        sp = `${SYSTEM_PROMPT}\n\n---\n\nCONTEXTO GUARDADO DEL USUARIO:\n${parts.join('\n')}\n\nNO pidas org_id, user_id ni datos de identidad — ya están registrados. Úsalos directamente en tus herramientas.`;
        console.log(`[gateway] Restored context for ${sessionKey}: org_id=${ctx.org_id} user=${ctx.display_name}`);
        // Load org's agents for orchestrator context
        if (orgId) {
          try {
            const agentsParams = new URLSearchParams({ org_id: `eq.${orgId}`, status: "neq.destroyed", select: "id,name,role,description,status", order: "created_at.desc" });
            const orgAgents = await sbFetch(`${SB_URL}/rest/v1/agents?${agentsParams}`, { headers: sbHeaders() });
            if (Array.isArray(orgAgents) && orgAgents.length > 0) {
              sp += `\n\nAGENTES DISPONIBLES EN ESTA ORG:\n` + orgAgents.map(a => `- **${a.name}** (${a.role}) [${a.status}] id=${a.id}${a.description ? ` — ${a.description}` : ""}`).join("\n");
              sp += `\n\nPuedes delegar tareas o consultar a estos agentes usando delegar_tarea o consultar_agente.`;
            }
          } catch (e) { console.error("[gateway] loadOrgAgents error:", e.message); }
        }
      } else {
        sp = `${SYSTEM_PROMPT}\n\n---\n\nNúmero WhatsApp de este usuario: ${sessionKey}\nUsuario nuevo — cuando te proporcione su org_id o se identifique, usa guardar_sesion para recordarlo permanentemente.`;
      }
      // Load persistent conversation history
      const savedHistory = await loadConversationHistory(sessionKey);
      session = { history: savedHistory, systemPrompt: sp, orgId };
      gwSessions.set(sessionKey, session);
    }

    const { history, systemPrompt } = session;
    history.push({ role: "user", content: message });

    // Persist user message
    saveMessage(sessionKey, session.orgId, "user", message);

    for (let i = 0; i < 10; i++) {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages: history,
        tools: gwTools,
      });

      history.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "tool_use") {
        const blocks = response.content.filter(b => b.type === "tool_use");
        const results = await Promise.all(blocks.map(async (b) => {
          const r = await gwExecuteTool(b.name, b.input);
          console.log(`[gateway] tool ${b.name} →`, JSON.stringify(r).substring(0, 150));
          return { type: "tool_result", tool_use_id: b.id, content: JSON.stringify(r) };
        }));
        history.push({ role: "user", content: results });
        continue;
      }

      const text = response.content.find(b => b.type === "text")?.text || "";
      if (history.length > GW_MAX_HISTORY) session.history = history.slice(-GW_MAX_HISTORY);
      // Persist assistant response
      saveMessage(sessionKey, session.orgId, "assistant", response.content);
      return text;
    }
    return "Hubo un problema procesando tu solicitud. Intenta de nuevo.";
  }

  // Start embedded gateway WebSocket server
  const { WebSocketServer: GwWSS } = require("ws");
  const GW_PORT = parseInt(GW_PORT_STR, 10);
  const gwServer = new GwWSS({ port: GW_PORT, host: "0.0.0.0" });

  gwServer.on("connection", (ws) => {
    let authorized = false;
    const nonce = crypto.randomBytes(16).toString("hex");
    ws.send(JSON.stringify({ type: "event", event: "connect.challenge", payload: { nonce } }));

    ws.on("message", async (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.type !== "req") return;

      if (msg.method === "connect") {
        authorized = true;
        ws.send(JSON.stringify({ type: "res", id: msg.id, result: { protocol: 3, auth: { role: msg.params?.role || "operator" }, ok: true } }));
        return;
      }
      if (!authorized) { ws.send(JSON.stringify({ type: "res", id: msg.id, result: { error: "Not authorized" } })); return; }

      if (msg.method === "chat.send") {
        const { sessionKey = "default", message } = msg.params || {};
        if (!message) { ws.send(JSON.stringify({ type: "res", id: msg.id, result: { ok: false } })); return; }
        console.log(`[gateway] chat.send session=${sessionKey} "${message.substring(0, 80)}"`);
        ws.send(JSON.stringify({ type: "res", id: msg.id, result: { ok: true } }));
        gwProcessMessage(sessionKey, message)
          .then(reply => {
            console.log(`[gateway] reply "${reply.substring(0, 80)}"`);
            ws.send(JSON.stringify({ type: "event", event: "chat.message", data: { content: reply } }));
          })
          .catch(err => {
            console.error("[gateway] error:", err.message);
            ws.send(JSON.stringify({ type: "event", event: "chat.message", data: { content: "Error interno. Intenta de nuevo." } }));
          });
        return;
      }
      ws.send(JSON.stringify({ type: "res", id: msg.id, result: { error: `Unknown method: ${msg.method}` } }));
    });

    ws.on("error", err => console.error("[gateway] ws error:", err.message));
  });

  console.log(`🤖 Gateway embedded on ws://0.0.0.0:${GW_PORT} (${CLAUDE_MODEL})`);
  // Note: the original IIFE (ocClient.connect()) already handles initial connection.
  // The gateway WS server is synchronously registered before the event loop processes
  // the TCP connection, so the IIFE's connect() will succeed.
}
