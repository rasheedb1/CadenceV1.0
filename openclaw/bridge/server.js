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
} = process.env;

if (!ANTHROPIC_API_KEY || !SB_KEY) {
  console.error("[gateway] Missing ANTHROPIC_API_KEY or SUPABASE_SERVICE_ROLE_KEY — gateway disabled");
} else {
  // Load workspace context — try multiple paths for resilience
  let SYSTEM_PROMPT;
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
      console.log(`[gateway] Loaded workspace from ${dir}`);
      break;
    } catch (_) {}
  }
  if (!SYSTEM_PROMPT) {
    console.error("[gateway] Could not find workspace files — using fallback prompt");
    SYSTEM_PROMPT = "Eres Chief, el asistente de automatización de ventas de Laiky AI. Responde siempre en español. Tienes acceso a herramientas para buscar prospectos, crear cadencias, gestionar leads y más. Siempre pide el org_id si no lo tienes.";
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

  async function gwProcessMessage(sessionKey, message) {
    let session = gwSessions.get(sessionKey);
    if (!session) {
      const ctx = await loadUserContext(sessionKey);
      let sp;
      if (ctx) {
        const parts = [`Número WhatsApp: ${sessionKey}`];
        if (ctx.display_name) parts.push(`Nombre: ${ctx.display_name}`);
        if (ctx.org_id) parts.push(`org_id: ${ctx.org_id}`);
        if (ctx.user_id) parts.push(`user_id: ${ctx.user_id}`);
        if (ctx.member_id) parts.push(`member_id: ${ctx.member_id}`);
        sp = `${SYSTEM_PROMPT}\n\n---\n\nCONTEXTO GUARDADO DEL USUARIO:\n${parts.join('\n')}\n\nNO pidas org_id, user_id ni datos de identidad — ya están registrados. Úsalos directamente en tus herramientas.`;
        console.log(`[gateway] Restored context for ${sessionKey}: org_id=${ctx.org_id} user=${ctx.display_name}`);
      } else {
        sp = `${SYSTEM_PROMPT}\n\n---\n\nNúmero WhatsApp de este usuario: ${sessionKey}\nUsuario nuevo — cuando te proporcione su org_id o se identifique, usa guardar_sesion para recordarlo permanentemente.`;
      }
      session = { history: [], systemPrompt: sp };
      gwSessions.set(sessionKey, session);
    }

    const { history, systemPrompt } = session;
    history.push({ role: "user", content: message });

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
