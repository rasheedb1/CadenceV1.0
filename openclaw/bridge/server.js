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
const pgmq = require("./pgmq");
const a2a = require("./a2a-client");

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

// Send a WhatsApp notification to a user by org_id (looks up number from chief_sessions)
async function notifyUserByOrg(orgId, message) {
  try {
    const SB_URL_N = process.env.SUPABASE_URL || "https://arupeqczrxmfkcbjwyad.supabase.co";
    const SB_KEY_N = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SB_KEY_N) return;
    const res = await fetch(`${SB_URL_N}/rest/v1/chief_sessions?org_id=eq.${orgId}&select=whatsapp_number&limit=1`, {
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY_N}`, "apikey": SB_KEY_N },
    });
    const sessions = await res.json();
    const waNum = Array.isArray(sessions) && sessions.length > 0 ? sessions[0].whatsapp_number : null;
    if (!waNum) return;
    const chunks = splitMessage(message);
    for (const chunk of chunks) {
      await twilioClient.messages.create({ from: TWILIO_WHATSAPP_NUMBER, to: `whatsapp:+${waNum}`, body: chunk });
      if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
    }
    console.log(`[notify] Sent ${chunks.length} msgs to ${waNum}`);
  } catch (err) {
    console.error("[notify] Error:", err.message);
  }
}

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
    // --- Inject team context before sending to Chief ---
    let messageToSend = Body;
    if (SB_KEY) {
      try {
        const [projRes, agentsRes, checkinsRes] = await Promise.all([
          fetch(`${SB_URL}/rest/v1/agent_projects?status=in.(active,paused)&order=updated_at.desc&limit=3&select=id,name,status,current_iteration,updated_at`, { headers: sbHeaders() }),
          fetch(`${SB_URL}/rest/v1/agent_standup`, { headers: sbHeaders() }),
          fetch(`${SB_URL}/rest/v1/agent_checkins?needs_approval=eq.true&status=eq.sent&order=created_at.desc&limit=5&select=id,agent_id,summary,checkin_type,created_at`, { headers: sbHeaders() }),
        ]);
        const projects = projRes.ok ? await projRes.json() : [];
        const standup = agentsRes.ok ? await agentsRes.json() : [];
        const pendingCheckins = checkinsRes.ok ? await checkinsRes.json() : [];

        const parts = [];
        if (Array.isArray(standup) && standup.length > 0) {
          const teamStatus = standup.map(a => {
            const status = a.availability === 'working' ? '🔵 trabajando' : a.availability === 'blocked' ? '🔴 bloqueado' : '🟢 disponible';
            const workload = (a.tasks_in_progress || 0) + (a.tasks_backlog || 0);
            return `- ${a.agent_name} (${a.agent_role}, ${a.model?.split('-')[1] || 'LLM'}): ${status}, ${a.tasks_done_24h || 0} completadas hoy, ${workload} pendientes`;
          }).join('\n');
          parts.push(`EQUIPO:\n${teamStatus}`);
        }
        if (Array.isArray(projects) && projects.length > 0) {
          const projList = projects.map(p => {
            const ago = Math.round((Date.now() - new Date(p.updated_at).getTime()) / 60000);
            return `- "${p.name}" (${p.status}, iter ${p.current_iteration || 0}, hace ${ago}min)`;
          }).join('\n');
          parts.push(`PROYECTOS:\n${projList}`);
        }
        if (Array.isArray(pendingCheckins) && pendingCheckins.length > 0) {
          const names = {};
          standup.forEach(a => { names[a.agent_id] = a.agent_name; });
          const ckList = pendingCheckins.map(c => `- ${names[c.agent_id] || 'Agente'}: ${(c.summary || '').substring(0, 80)}`).join('\n');
          parts.push(`CHECK-INS PENDIENTES (necesitan tu respuesta):\n${ckList}`);
        }
        if (parts.length > 0) {
          messageToSend = `[CONTEXTO DEL EQUIPO]\n${parts.join('\n\n')}\n\nSi el usuario pide crear un proyecto y hay uno activo/pausado, pregunta si quiere reemplazarlo o continuar.\nSi hay check-ins pendientes, menciónalos.\n[FIN CONTEXTO]\n\n${Body}`;
          console.log(`[in] Injected team context (${standup.length} agents, ${projects.length} projects, ${pendingCheckins.length} checkins)`);
        }
      } catch (ctxErr) {
        console.error("[in] Team context injection failed:", ctxErr.message);
      }
    }

    // Ensure connected
    if (!ocClient.isReady()) {
      console.log("[oc] Not connected, reconnecting...");
      await ocClient.connect();
    }

    const aiResponse = await ocClient.sendMessage(messageToSend, WaId || From);

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
    { name: "crear_proyecto", description: "Crea un proyecto multi-fase que los agentes ejecutan autónomamente. Las fases se ejecutan secuencialmente, con revisiones opcionales. El proyecto sobrevive reinicios. Usa cuando: 'que Sofi mejore toda la UX', 'proyecto grande entre X y Y', 'quiero que hagan esto por fases'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, name: { type: "string", description: "Nombre del proyecto" }, description: { type: "string" }, phases: { type: "array", items: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, agent_name: { type: "string" }, reviewer_name: { type: "string" } }, required: ["name", "description", "agent_name"] } } }, required: ["org_id", "name", "phases"] } },
    { name: "guardar_memoria", description: "Guarda un hecho, decisión o contexto importante en la memoria de largo plazo. Usa cuando: el usuario menciona algo que debas recordar siempre, se toma una decisión importante, se define un objetivo o prioridad. NO guardes detalles triviales.", input_schema: { type: "object", properties: { org_id: { type: "string" }, content: { type: "string", description: "El hecho o decisión a recordar" }, category: { type: "string", description: "Categoría: proyecto, decision, objetivo, agente, preferencia, contexto" }, importance: { type: "string", enum: ["critical", "high", "normal", "low"], description: "Importancia (critical siempre se carga)" } }, required: ["org_id", "content"] } },
    { name: "colaborar_agentes", description: "Inicia una colaboración iterativa entre 2 agentes. Un agente produce trabajo, el otro da feedback, e iteran hasta converger en un resultado final. Usa cuando: 'que Sofi y Juanse trabajen juntos en X', 'que colaboren para lograr X', 'que iteren hasta que quede bien'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, producer_name: { type: "string", description: "Agente que produce el trabajo (ej: Sofi)" }, reviewer_name: { type: "string", description: "Agente que revisa y da feedback (ej: Juanse)" }, task: { type: "string", description: "La tarea o objetivo a lograr" }, max_iterations: { type: "number", description: "Máximo de rondas de feedback (default 3)" } }, required: ["org_id", "producer_name", "reviewer_name", "task"] } },
    { name: "web_research", description: "Busca en la web y scrapea páginas para investigación. Acciones: 'search' (buscar), 'scrape' (extraer contenido de URL), 'research' (buscar + scrape combinado).", input_schema: { type: "object", properties: { action: { type: "string", enum: ["search", "scrape", "research"], description: "search=buscar en web, scrape=extraer contenido de URL, research=buscar+scrape" }, query: { type: "string", description: "Término de búsqueda (para search/research)" }, url: { type: "string", description: "URL a scrapear (para scrape)" }, limit: { type: "number", description: "Número de resultados (default 5)" }, max_chars: { type: "number", description: "Máximo de caracteres de contenido (default 2000)" } }, required: [] } },
    { name: "ver_tarea_agente", description: "Consulta el estado y resultado de la última tarea de un agente. Usa cuando el usuario pregunta '¿ya terminó X?', '¿qué encontró X?', 'resultado de la tarea de X'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, agent_id: { type: "string" }, agent_name: { type: "string", description: "Nombre del agente" }, task_id: { type: "string", description: "ID específico de tarea (opcional)" } }, required: ["org_id"] } },
    { name: "reunion_agentes", description: "Convoca una reunión con múltiples agentes sobre un tema. Cada agente da su perspectiva según su rol. Usa cuando: 'haz una reunión con X y Y sobre...', 'quiero que X y Y discutan...', 'junta a los agentes para hablar de...'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, agent_names: { type: "array", items: { type: "string" }, description: "Nombres de los agentes a convocar" }, topic: { type: "string", description: "El tema a discutir" } }, required: ["org_id", "agent_names", "topic"] } },
    { name: "descomponer_proyecto", description: "Descompone un proyecto grande en tareas pequeñas en el blackboard. Los agentes las reclamarán automáticamente. Usa esto cuando el usuario pide algo complejo que requiere múltiples pasos.", input_schema: { type: "object", properties: { org_id: { type: "string" }, project_name: { type: "string", description: "Nombre del proyecto" }, description: { type: "string", description: "Descripción detallada de lo que se necesita" }, agent_roles: { type: "array", items: { type: "string" }, description: "Roles de los agentes disponibles (ej: ux_designer, cto)" } }, required: ["org_id", "project_name", "description"] } },
    // --- Workforce v2 tools ---
    { name: "ver_equipo", description: "Muestra el estado completo del equipo de agentes: quién está disponible, trabajando o bloqueado, qué tareas tienen, métricas. Usa cuando: '¿qué están haciendo?', '¿quién está libre?', 'estado del equipo', 'dashboard'.", input_schema: { type: "object", properties: { org_id: { type: "string" } }, required: ["org_id"] } },
    { name: "asignar_objetivo", description: "Crea tareas en agent_tasks_v2 que los agentes reclaman automáticamente según sus capabilities. Cada tarea tiene tipo, prioridad y capabilities requeridas. Usa cuando: 'ponlos a trabajar en X', 'que alguien haga Y', 'asigna esta tarea'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, tasks: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, task_type: { type: "string", description: "Tipo: code, design, research, outreach, writing, data, ops, general" }, required_capabilities: { type: "array", items: { type: "string" }, description: "Capabilities necesarias: code, design, research, outreach, writing, data, ops, strategy" }, priority: { type: "number", description: "0=urgente, 50=normal, 100=baja" }, depends_on: { type: "array", items: { type: "string" }, description: "IDs de tareas que deben completarse primero" } }, required: ["title", "task_type"] } } }, required: ["org_id", "tasks"] } },
    { name: "aprobar_checkin", description: "Responde a un check-in pendiente de un agente. Usa cuando el agente reportó progreso y necesita aprobación para continuar, o cuando quieres dar feedback.", input_schema: { type: "object", properties: { org_id: { type: "string" }, checkin_id: { type: "string", description: "ID del check-in (viene en el contexto)" }, action: { type: "string", enum: ["approve", "reject"], description: "Aprobar o rechazar" }, feedback: { type: "string", description: "Feedback o instrucciones para el agente" } }, required: ["org_id", "checkin_id", "action"] } },
    { name: "standup_equipo", description: "Genera un resumen ejecutivo del equipo: tareas completadas, en progreso, bloqueadas, y check-ins pendientes. Formato WhatsApp-friendly. Usa cuando: 'standup', 'resumen', '¿qué hicieron hoy?'.", input_schema: { type: "object", properties: { org_id: { type: "string" } }, required: ["org_id"] } },
    { name: "cambiar_config_agente", description: "Cambia la configuración de un agente: modelo LLM, temperatura, equipo, tier, capabilities. Usa cuando: 'cambia a Sofi a Opus', 'pon a Juanse en el equipo de ventas', 'hazlo team lead'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, agent_name: { type: "string", description: "Nombre del agente" }, updates: { type: "object", properties: { model: { type: "string", description: "claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001" }, temperature: { type: "number" }, team: { type: "string" }, tier: { type: "string", enum: ["worker", "team_lead", "manager"] }, capabilities: { type: "array", items: { type: "string" } } } } }, required: ["org_id", "agent_name", "updates"] } },
    { name: "pausar_reactivar_proyecto", description: "Pausa o reactiva un proyecto existente. Usa cuando: 'continuar proyecto', 'pausa el proyecto X', 'reactiva'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, project_id: { type: "string" }, action: { type: "string", enum: ["pause", "activate"] } }, required: ["org_id", "project_id", "action"] } },
    { name: "configurar_standup", description: "Configura el standup diario automático: timezone, hora, y si está activado. Usa cuando: 'estoy en México', 'mándame el standup a las 8am', 'cambia mi zona horaria', 'desactiva el standup'. Timezones comunes: America/Mexico_City, America/Bogota, America/Buenos_Aires, America/Santiago, America/Lima, Europe/Madrid, US/Eastern, US/Pacific.", input_schema: { type: "object", properties: { whatsapp_number: { type: "string", description: "Número WhatsApp del usuario (sessionKey)" }, timezone: { type: "string", description: "IANA timezone (ej: America/Mexico_City, America/Bogota)" }, standup_hour: { type: "number", description: "Hora local para el standup (0-23, default 9)" }, standup_enabled: { type: "boolean", description: "Activar/desactivar standup diario" } }, required: ["whatsapp_number"] } },
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

          // PRIMARY: A2A Protocol (HTTP direct, no queue, no lock)
          if (agent.status === "active" && agent.railway_url) {
            console.log(`[delegar_tarea] Sending to ${agent.name} via A2A (task=${taskId})`);
            const a2aResult = await a2a.sendA2AMessage(agent.railway_url, args.instruction, {
              token: SB_KEY,
              fromAgentId: "chief",
              orgId: args.org_id,
              timeoutMs: 300000,
            });

            if (a2aResult.success && a2aResult.reply) {
              // Sync response — task completed
              if (taskId) {
                await sbFetch(`${base}/functions/v1/agent-task`, { method: "PATCH", headers: sbHeaders(true),
                  body: JSON.stringify({ task_id: taskId, status: "completed", result: { text: a2aResult.reply } }) });
              }
              // Log exchange
              await sbFetch(`${base}/rest/v1/agent_messages`, { method: "POST", headers: { ...sbHeaders(), Prefer: "return=minimal" },
                body: JSON.stringify([
                  { org_id: args.org_id, to_agent_id: agent.id, role: "user", content: args.instruction, metadata: { a2a: true, task_id: taskId } },
                  { org_id: args.org_id, from_agent_id: agent.id, role: "assistant", content: a2aResult.reply, metadata: { a2a: true, task_id: taskId } },
                ]) });
              return { success: true, agent: agent.name, task_id: taskId, result: a2aResult.reply };
            }

            if (a2aResult.success && a2aResult.taskId && !a2aResult.reply) {
              // Async — task is still working, will complete later
              // Get WhatsApp number for notification when done
              let waNumber = null;
              try {
                const sp = new URLSearchParams({ org_id: `eq.${args.org_id}`, select: "whatsapp_number", limit: "1", order: "updated_at.desc" });
                const sessions = await sbFetch(`${base}/rest/v1/chief_sessions?${sp}`, { headers: sbHeaders() });
                if (Array.isArray(sessions) && sessions.length > 0) waNumber = sessions[0].whatsapp_number;
              } catch (_) {}

              // Poll in background, notify via WhatsApp when done
              (async () => {
                try {
                  const pollResult = await a2a.pollA2ATask(agent.railway_url, a2aResult.taskId, { token: SB_KEY, maxWaitMs: 300000 });
                  if (pollResult.success && pollResult.reply) {
                    if (taskId) await sbFetch(`${base}/functions/v1/agent-task`, { method: "PATCH", headers: sbHeaders(true), body: JSON.stringify({ task_id: taskId, status: "completed", result: { text: pollResult.reply } }) });
                    if (waNumber) {
                      await fetch("https://twilio-bridge-production-241b.up.railway.app/api/agent-callback", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ task_id: taskId, agent_name: agent.name, result: { text: pollResult.reply }, whatsapp_number: waNumber }),
                      }).catch(() => {});
                    }
                  }
                } catch (_) {}
              })();

              return { success: true, agent: agent.name, task_id: taskId, status: "processing", message: `Tarea enviada a ${agent.name} via A2A. Te llegará el resultado por WhatsApp cuando termine.` };
            }

            // A2A failed — fall through to pgmq/DB fallback
            if (!a2aResult.success) {
              console.warn(`[delegar_tarea] A2A failed for ${agent.name}:`, a2aResult.error);
            }
          }

          // FALLBACK: pgmq queue (for agents without A2A yet or A2A failure)
          try {
            let waNumber = null;
            try {
              const sp = new URLSearchParams({ org_id: `eq.${args.org_id}`, select: "whatsapp_number", limit: "1", order: "updated_at.desc" });
              const sessions = await sbFetch(`${base}/rest/v1/chief_sessions?${sp}`, { headers: sbHeaders() });
              if (Array.isArray(sessions) && sessions.length > 0) waNumber = sessions[0].whatsapp_number;
            } catch (_) {}

            const envelope = pgmq.createEnvelope({
              type: "task", fromAgentId: "chief", orgId: args.org_id, taskId, replyTo: "agent_chief",
              payload: { instruction: args.instruction, callback_url: "https://twilio-bridge-production-241b.up.railway.app/api/agent-callback", whatsapp_number: waNumber, agent_name: agent.name },
            });
            await pgmq.sendMessage(pgmq.getQueueName(agent.id), envelope);
            console.log(`[delegar_tarea] Queued task for ${agent.name} via pgmq fallback (task=${taskId})`);
            return { success: true, agent: agent.name, task_id: taskId, status: "processing", message: `Tarea enviada a ${agent.name}. Te llegará el resultado por WhatsApp.` };
          } catch (queueErr) {
            console.warn(`[delegar_tarea] pgmq also failed:`, queueErr.message);
          }

          // Agent not deployed — task stays pending in DB
          return { success: true, agent: agent.name, task_id: taskId, status: "pending", message: `Tarea creada para ${agent.name} (${agent.role}), pero el agente no está desplegado aún. Se ejecutará cuando esté activo.` };
        }

        case "consultar_agente": {
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

          // PRIMARY: A2A Protocol (sync, blocking)
          if (agent.status === "active" && agent.railway_url) {
            console.log(`[consultar_agente] Sending to ${agent.name} via A2A`);
            const a2aResult = await a2a.sendA2AMessage(agent.railway_url, args.message, {
              token: SB_KEY,
              fromAgentId: "chief",
              orgId: args.org_id,
              timeoutMs: 60000,
            });

            if (a2aResult.success && a2aResult.reply) {
              // Log exchange
              await sbFetch(`${base}/rest/v1/agent_messages`, { method: "POST", headers: { ...sbHeaders(), Prefer: "return=minimal" },
                body: JSON.stringify([
                  { org_id: args.org_id, to_agent_id: agent.id, role: "user", content: args.message, metadata: { a2a: true } },
                  { org_id: args.org_id, from_agent_id: agent.id, role: "assistant", content: a2aResult.reply, metadata: { a2a: true } },
                ]) });
              return { success: true, agent: agent.name, reply: a2aResult.reply };
            }

            if (a2aResult.success && a2aResult.taskId && !a2aResult.reply) {
              // Still working — poll briefly
              const pollResult = await a2a.pollA2ATask(agent.railway_url, a2aResult.taskId, { token: SB_KEY, maxWaitMs: 60000 });
              if (pollResult.success && pollResult.reply) {
                await sbFetch(`${base}/rest/v1/agent_messages`, { method: "POST", headers: { ...sbHeaders(), Prefer: "return=minimal" },
                  body: JSON.stringify([
                    { org_id: args.org_id, to_agent_id: agent.id, role: "user", content: args.message, metadata: { a2a: true } },
                    { org_id: args.org_id, from_agent_id: agent.id, role: "assistant", content: pollResult.reply, metadata: { a2a: true } },
                  ]) });
                return { success: true, agent: agent.name, reply: pollResult.reply };
              }
              return { success: true, agent: agent.name, message: `${agent.name} está procesando tu consulta. Te llegará por WhatsApp.` };
            }

            if (!a2aResult.success) {
              console.warn(`[consultar_agente] A2A failed for ${agent.name}:`, a2aResult.error);
            }
          }

          // FALLBACK: pgmq queue
          try {
            const envelope = pgmq.createEnvelope({
              type: "chat", fromAgentId: "chief", orgId: args.org_id, replyTo: "agent_chief",
              payload: { message: args.message, context: { from_agent: "chief" } },
            });
            await pgmq.sendMessage(pgmq.getQueueName(agent.id), envelope);

            const deadline = Date.now() + 30000;
            while (Date.now() < deadline) {
              const msgs = await pgmq.pollMessages("agent_chief", 30, 5, 5);
              for (const msg of msgs) {
                const parsed = pgmq.parseMessage(msg);
                if (parsed && parsed.type === "reply" && parsed.correlation_id === envelope.correlation_id) {
                  await pgmq.archiveMessage("agent_chief", parsed._msg_id);
                  const reply = parsed.payload?.message || parsed.payload?.reply || JSON.stringify(parsed.payload);
                  return { success: true, agent: agent.name, reply };
                }
              }
            }
            return { success: true, agent: agent.name, message: `${agent.name} está procesando. Te llegará por WhatsApp.` };
          } catch (queueErr) {
            console.warn(`[consultar_agente] pgmq also failed:`, queueErr.message);
          }

          return { success: false, error: `${agent.name} no está disponible (ni A2A ni cola funcionan).` };
        }

        case "crear_proyecto": {
          const { org_id, name: projName, description: projDesc, phases,
                  workflow_type, agent_names, max_iterations, checkpoint_every, success_criteria } = args;

          // Resolve agent names to IDs helper
          const resolveAgentId = async (agentName) => {
            const p = new URLSearchParams({ org_id: `eq.${org_id}`, name: `ilike.%${agentName}%`, status: "neq.destroyed", select: "id,name", limit: "1" });
            const rows = await sbFetch(`${base}/rest/v1/agents?${p}`, { headers: sbHeaders() });
            return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
          };

          // === COLLABORATION MODE ===
          if (workflow_type === "collaboration") {
            if (!agent_names || agent_names.length < 2) return { success: false, error: "Se necesitan al menos 2 agentes para colaboración." };

            // Resolve all agents
            const resolvedAgents = [];
            for (const name of agent_names) {
              const agent = await resolveAgentId(name);
              if (!agent) return { success: false, error: `Agente "${name}" no encontrado.` };
              resolvedAgents.push(agent);
            }

            const projRows = await sbFetch(`${base}/rest/v1/agent_projects`, {
              method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" },
              body: JSON.stringify({
                org_id, name: projName, description: projDesc || null, status: "active",
                workflow_type: "collaboration",
                assigned_agents: resolvedAgents.map(a => a.id),
                max_iterations: max_iterations || 20,
                checkpoint_every: checkpoint_every || 3,
                current_iteration: 0,
                success_criteria: success_criteria || null,
                project_memory: `# Proyecto: ${projName}\n## Criterios de éxito: ${success_criteria || "Definidos por los agentes"}\n## Descripción: ${projDesc || projName}\n\n### Inicio del proyecto\nAgentes asignados: ${resolvedAgents.map(a => a.name).join(", ")}\n`,
              }),
            });
            const project = Array.isArray(projRows) ? projRows[0] : projRows;
            if (!project?.id) return { success: false, error: "No se pudo crear el proyecto." };

            console.log(`[project] Created collaboration "${projName}" with ${resolvedAgents.length} agents, max ${max_iterations || 20} iterations`);
            return {
              success: true,
              project_id: project.id,
              name: projName,
              workflow_type: "collaboration",
              agents: resolvedAgents.map(a => a.name),
              max_iterations: max_iterations || 20,
              message: `Proyecto colaborativo "${projName}" creado. ${resolvedAgents.map(a => a.name).join(" y ")} van a iterar automáticamente. Te notifico cada ${checkpoint_every || 3} iteraciones.`,
            };
          }

          // === SEQUENTIAL MODE (original) ===
          if (!phases || phases.length === 0) return { success: false, error: "Se necesita al menos una fase." };

          const projRows = await sbFetch(`${base}/rest/v1/agent_projects`, {
            method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" },
            body: JSON.stringify({ org_id, name: projName, description: projDesc || null, status: "active" }),
          });
          const project = Array.isArray(projRows) ? projRows[0] : projRows;
          if (!project?.id) return { success: false, error: "No se pudo crear el proyecto." };

          const phaseRows = [];
          for (let i = 0; i < phases.length; i++) {
            const ph = phases[i];
            const agent = await resolveAgentId(ph.agent_name);
            if (!agent) return { success: false, error: `Agente ${ph.agent_name} no encontrado.` };
            let reviewerId = null;
            if (ph.reviewer_name) {
              const reviewer = await resolveAgentId(ph.reviewer_name);
              if (reviewer) reviewerId = reviewer.id;
            }
            phaseRows.push({
              project_id: project.id, phase_number: i + 1, name: ph.name,
              description: ph.description, agent_id: agent.id,
              reviewer_agent_id: reviewerId, status: "pending",
            });
          }

          await sbFetch(`${base}/rest/v1/agent_project_phases`, {
            method: "POST", headers: { ...sbHeaders(), Prefer: "return=minimal" },
            body: JSON.stringify(phaseRows),
          });

          console.log(`[project] Created "${projName}" with ${phases.length} phases`);
          return {
            success: true,
            project_id: project.id,
            name: projName,
            phases: phases.map((p, i) => `${i + 1}. ${p.name} (${p.agent_name}${p.reviewer_name ? ` → review: ${p.reviewer_name}` : ""})`),
            message: `Proyecto "${projName}" creado con ${phases.length} fases. Se ejecutará automáticamente. Te notifico en cada fase.`,
          };
        }

        case "guardar_memoria": {
          const { org_id, content, category, importance } = args;
          if (!content) return { success: false, error: "Falta el contenido" };
          await sbFetch(`${base}/rest/v1/chief_memory`, {
            method: "POST", headers: { ...sbHeaders(), Prefer: "return=minimal" },
            body: JSON.stringify({ org_id, content, category: category || "general", importance: importance || "normal" }),
          });
          console.log(`[memory] Saved: "${content.substring(0, 80)}" (${category || "general"}, ${importance || "normal"})`);
          return { success: true, message: "Memoria guardada." };
        }

        case "colaborar_agentes": {
          const { org_id, producer_name, reviewer_name, task, max_iterations } = args;
          const maxIter = max_iterations || 3;

          // Resolve both agents
          const resolveAgent = async (name) => {
            const p = new URLSearchParams({ org_id: `eq.${org_id}`, name: `ilike.%${name}%`, status: "eq.active", select: "id,name,role,railway_url", limit: "1" });
            const rows = await sbFetch(`${base}/rest/v1/agents?${p}`, { headers: sbHeaders() });
            return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
          };

          const producer = await resolveAgent(producer_name);
          const reviewer = await resolveAgent(reviewer_name);
          if (!producer) return { success: false, error: `Agente ${producer_name} no encontrado o no activo.` };
          if (!reviewer) return { success: false, error: `Agente ${reviewer_name} no encontrado o no activo.` };
          if (!producer.railway_url || !reviewer.railway_url) return { success: false, error: "Ambos agentes deben estar desplegados." };

          // Run collaboration in background — return immediately
          (async () => {
            // Call agent with retry + fallback to /api/review for faster responses
            const callAgent = async (agent, message, isReview = false) => {
              const endpoint = isReview ? "/api/review" : "/api/chat";
              for (let attempt = 0; attempt < 2; attempt++) {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), isReview ? 60000 : 300000);
                try {
                  const res = await fetch(`${agent.railway_url}${endpoint}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}` },
                    body: JSON.stringify({ message, context: { org_id, collaboration: true }, sync: true }),
                    signal: controller.signal,
                  });
                  clearTimeout(timeout);
                  if (!res.ok) {
                    const errText = await res.text();
                    console.error(`[collab] ${agent.name} ${endpoint} error ${res.status}: ${errText.substring(0, 200)}`);
                    if (attempt === 0) { console.log(`[collab] Retrying ${agent.name}...`); continue; }
                    return `[${agent.name} no pudo responder (${res.status})]`;
                  }
                  const data = await res.json();
                  return data.reply || data.result || JSON.stringify(data);
                } catch (err) {
                  clearTimeout(timeout);
                  console.error(`[collab] ${agent.name} attempt ${attempt + 1} failed:`, err.message);
                  if (attempt === 0) { console.log(`[collab] Retrying ${agent.name}...`); continue; }
                  return `[Error contactando a ${agent.name} después de 2 intentos: ${err.message}]`;
                }
              }
              return `[${agent.name} no respondió]`;
            };

            let currentWork = "";
            const iterations = [];

            for (let i = 0; i < maxIter; i++) {
              const producerPrompt = i === 0
                ? `Tarea: ${task}\n\nProduce tu mejor trabajo para esta tarea.`
                : `Tarea original: ${task}\n\nTu trabajo anterior:\n${currentWork}\n\nFeedback de ${reviewer.name} (${reviewer.role}):\n${iterations[iterations.length - 1]?.feedback}\n\nItera y mejora tu trabajo basándote en el feedback.`;

              currentWork = await callAgent(producer, producerPrompt);
              console.log(`[collab] Iter ${i + 1}: ${producer.name} produced ${currentWork.length} chars`);

              // Use /api/review for reviewer (faster, Claude API direct, no CLI)
              const reviewPrompt = `Revisa este trabajo de ${producer.name} (${producer.role}):\n\nTarea: ${task}\n\nTrabajo:\n${currentWork.substring(0, 3000)}\n\n${i < maxIter - 1 ? 'Da feedback constructivo y específico. Si el trabajo es satisfactorio, responde EXACTAMENTE "APROBADO" al inicio.' : 'Esta es la última iteración. Da tu feedback final.'}`;

              const feedback = await callAgent(reviewer, reviewPrompt, true);
              console.log(`[collab] Iter ${i + 1}: ${reviewer.name} reviewed (${feedback.length} chars)`);

              iterations.push({ iteration: i + 1, work_summary: currentWork.substring(0, 300), feedback_summary: feedback.substring(0, 300) });

              // Notify user on each iteration
              const approved = feedback.trim().toUpperCase().startsWith("APROBADO");
              await notifyUserByOrg(org_id, `🔄 *Colaboración — Iteración ${i + 1}/${maxIter}*\n\n*${producer.name}:*\n${currentWork.substring(0, 800)}\n\n*${reviewer.name}:*\n${feedback.substring(0, 800)}${approved ? "\n\n✅ *APROBADO*" : ""}`);

              await sbFetch(`${base}/rest/v1/agent_messages`, {
                method: "POST", headers: { ...sbHeaders(), Prefer: "return=minimal" },
                body: JSON.stringify([
                  { org_id, from_agent_id: producer.id, to_agent_id: reviewer.id, role: "assistant", content: currentWork.substring(0, 2000), metadata: { collaboration: true, iteration: i + 1, type: "work" } },
                  { org_id, from_agent_id: reviewer.id, to_agent_id: producer.id, role: "assistant", content: feedback.substring(0, 2000), metadata: { collaboration: true, iteration: i + 1, type: "feedback" } },
                ]),
              });

              if (feedback.trim().toUpperCase().startsWith("APROBADO")) {
                console.log(`[collab] Approved at iteration ${i + 1}`);
                break;
              }
            }

            // Final notification
            const finalApproved = iterations[iterations.length - 1]?.feedback_summary?.trim().toUpperCase().startsWith("APROBADO");
            await notifyUserByOrg(org_id, `🤝 *Colaboración ${producer.name} ↔ ${reviewer.name} finalizada*\n\n📋 Tarea: ${task.substring(0, 200)}\n🔄 Iteraciones: ${iterations.length}\n${finalApproved ? "✅ Status: Aprobado" : "⏹️ Status: Máximo de iteraciones alcanzado"}`);
          })();

          return {
            success: true,
            message: `Colaboración iniciada entre ${producer.name} y ${reviewer.name}. Van a iterar hasta ${maxIter} veces. Te notifico por WhatsApp cuando terminen.`,
          };
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

          // Send topic to each agent in parallel via A2A
          const responses = await Promise.allSettled(
            resolvedAgents.map(async (agent) => {
              if (agent.status !== "active" || !agent.railway_url) {
                return { agent: agent.name, role: agent.role, reply: `[${agent.name} no está desplegado]` };
              }
              const meetingPrompt = `El orchestrator Chief te convoca a una reunión con otros agentes. El tema es:\n\n"${topic}"\n\nDa tu perspectiva como ${agent.role} de forma concisa (máximo 3 párrafos). Sé directo y aporta valor desde tu rol.`;
              const a2aResult = await a2a.sendA2AMessage(agent.railway_url, meetingPrompt, {
                token: SB_KEY, fromAgentId: "chief", orgId: org_id, timeoutMs: 300000,
              });
              if (a2aResult.success && a2aResult.reply) {
                return { agent: agent.name, role: agent.role, reply: a2aResult.reply };
              }
              // If async, poll
              if (a2aResult.success && a2aResult.taskId) {
                const pollResult = await a2a.pollA2ATask(agent.railway_url, a2aResult.taskId, { token: SB_KEY, maxWaitMs: 120000 });
                if (pollResult.success && pollResult.reply) return { agent: agent.name, role: agent.role, reply: pollResult.reply };
              }
              return { agent: agent.name, role: agent.role, reply: `[Error: ${a2aResult.error || "sin respuesta"}]` };
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

        case "descomponer_proyecto": {
          const { org_id, project_name, description, agent_roles } = args;
          const anthropic = new (_AnthSdk.default || _AnthSdk)({ apiKey: process.env.ANTHROPIC_API_KEY });
          const decomposition = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `Descompón este proyecto en 5-15 tareas concretas y accionables.\n\nProyecto: ${project_name}\nDescripción: ${description}\nRoles disponibles: ${(agent_roles || ["ux_designer", "cto", "sales"]).join(", ")}\n\nRetorna SOLO un JSON array:\n[\n  {\n    "title": "Nombre corto de la tarea",\n    "description": "Instrucción concreta de qué hacer. Incluir archivos, comandos, o URLs si aplica.",\n    "priority": 10,\n    "role_hint": "ux_designer"\n  },\n  ...\n]\n\nReglas:\n- Cada tarea debe ser completable en 1-5 minutos\n- Ordena por prioridad (10=más alta, 1=más baja)\n- Incluye dependencias implícitas en el orden (las primeras tareas deben hacerse antes)\n- role_hint debe ser uno de los roles disponibles\n- Las instrucciones deben ser específicas: "Revisa archivo X" no "Mejora la UX"\n- Incluir tareas de verificación (build, test, review)`
            }],
          });
          const responseText = decomposition.content[0]?.text || "[]";
          const jsonMatch = responseText.match(/\[[\s\S]*\]/);
          if (!jsonMatch) return { success: false, error: "No se pudo descomponer el proyecto" };
          let tasks;
          try { tasks = JSON.parse(jsonMatch[0]); }
          catch { return { success: false, error: "JSON inválido en la descomposición" }; }
          const created = [];
          for (const task of tasks) {
            try {
              const res = await fetch(`${base}/functions/v1/blackboard`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY },
                body: JSON.stringify({
                  org_id,
                  entry_type: "task",
                  title: task.title,
                  content: { description: task.description, role_hint: task.role_hint, project: project_name },
                  priority: task.priority || 5,
                }),
              });
              const data = await res.json();
              if (data.entry) created.push({ title: task.title, priority: task.priority, role: task.role_hint });
            } catch {}
          }
          return {
            success: true,
            project: project_name,
            tasks_created: created.length,
            tasks: created,
            message: `Proyecto "${project_name}" descompuesto en ${created.length} tareas. Los agentes las reclamarán automáticamente.`,
          };
        }

        // --- Workforce v2 tool implementations ---
        case "ver_equipo": {
          const standup = await sbFetch(`${SB_URL}/rest/v1/agent_standup`, { headers: sbHeaders() });
          const projects = await sbFetch(`${SB_URL}/rest/v1/agent_projects?status=in.(active,paused)&order=updated_at.desc&limit=5&select=id,name,status,current_iteration,updated_at`, { headers: sbHeaders() });
          const checkins = await sbFetch(`${SB_URL}/rest/v1/agent_checkins?needs_approval=eq.true&status=eq.sent&order=created_at.desc&limit=5&select=id,agent_id,summary,checkin_type`, { headers: sbHeaders() });
          return {
            success: true,
            agents: Array.isArray(standup) ? standup.map(a => ({
              name: a.agent_name, role: a.agent_role, team: a.team, tier: a.tier, model: a.model,
              availability: a.availability, tasks_done_24h: a.tasks_done_24h,
              tasks_in_progress: a.tasks_in_progress, tasks_backlog: a.tasks_backlog,
              tasks_blocked: a.tasks_blocked, pending_checkins: a.pending_checkins,
            })) : [],
            projects: Array.isArray(projects) ? projects : [],
            pending_checkins: Array.isArray(checkins) ? checkins : [],
          };
        }

        case "asignar_objetivo": {
          if (!args.tasks || !Array.isArray(args.tasks)) return { success: false, error: "Missing tasks array" };
          const created = [];
          for (const task of args.tasks) {
            const row = {
              org_id: args.org_id,
              title: task.title,
              description: task.description || null,
              task_type: task.task_type || "general",
              required_capabilities: task.required_capabilities || [],
              priority: task.priority ?? 50,
              depends_on: task.depends_on || [],
              status: "ready",
              created_by: "chief",
            };
            const res = await sbFetch(`${SB_URL}/rest/v1/agent_tasks_v2`, {
              method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify(row),
            });
            if (Array.isArray(res) && res[0]) created.push({ id: res[0].id, title: task.title, priority: row.priority });
          }
          return { success: true, tasks_created: created.length, tasks: created, message: `${created.length} tarea(s) creada(s). Los agentes las reclamarán automáticamente según sus capabilities.` };
        }

        case "aprobar_checkin": {
          const ckStatus = args.action === "approve" ? "approved" : "rejected";
          await sbFetch(`${SB_URL}/rest/v1/agent_checkins?id=eq.${args.checkin_id}`, {
            method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
            body: JSON.stringify({ status: ckStatus, feedback: args.feedback || null, responded_at: new Date().toISOString() }),
          });
          return { success: true, checkin_id: args.checkin_id, status: ckStatus, message: `Check-in ${ckStatus}${args.feedback ? ': ' + args.feedback : ''}` };
        }

        case "standup_equipo": {
          const su = await sbFetch(`${SB_URL}/rest/v1/agent_standup`, { headers: sbHeaders() });
          if (!Array.isArray(su) || su.length === 0) return { success: true, message: "No hay agentes activos." };
          const lines = su.map(a => {
            const icon = a.availability === 'working' ? '🔵' : a.availability === 'blocked' ? '🔴' : '🟢';
            return `${icon} *${a.agent_name}* (${a.agent_role})\n   Modelo: ${a.model?.split('-')[1] || '?'} | Equipo: ${a.team || '—'}\n   Hoy: ${a.tasks_done_24h || 0} completadas | En progreso: ${a.tasks_in_progress || 0} | Backlog: ${a.tasks_backlog || 0}${a.tasks_blocked ? ` | ⚠️ ${a.tasks_blocked} bloqueadas` : ''}${a.pending_checkins ? `\n   📋 ${a.pending_checkins} check-in(s) esperando tu respuesta` : ''}`;
          });
          return { success: true, standup: lines.join('\n\n'), agent_count: su.length };
        }

        case "cambiar_config_agente": {
          // Find agent by name
          const agentRows = await sbFetch(`${SB_URL}/rest/v1/agents?org_id=eq.${args.org_id}&name=ilike.*${args.agent_name}*&status=neq.destroyed&limit=1&select=id,name`, { headers: sbHeaders() });
          if (!Array.isArray(agentRows) || agentRows.length === 0) return { success: false, error: `Agente "${args.agent_name}" no encontrado` };
          const agentId = agentRows[0].id;
          const updates = { ...args.updates, updated_at: new Date().toISOString() };
          await sbFetch(`${SB_URL}/rest/v1/agents?id=eq.${agentId}`, {
            method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" }, body: JSON.stringify(updates),
          });
          return { success: true, agent: agentRows[0].name, updates: args.updates, message: `Configuración de ${agentRows[0].name} actualizada.` };
        }

        case "pausar_reactivar_proyecto": {
          const newStatus = args.action === "pause" ? "paused" : "active";
          await sbFetch(`${SB_URL}/rest/v1/agent_projects?id=eq.${args.project_id}`, {
            method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
            body: JSON.stringify({ status: newStatus, updated_at: new Date().toISOString() }),
          });
          return { success: true, project_id: args.project_id, status: newStatus, message: `Proyecto ${newStatus === 'paused' ? 'pausado' : 'reactivado'}.` };
        }

        case "configurar_standup": {
          const updates = {};
          if (args.timezone) updates.timezone = args.timezone;
          if (args.standup_hour != null) updates.standup_hour = args.standup_hour;
          if (args.standup_enabled != null) updates.standup_enabled = args.standup_enabled;
          if (Object.keys(updates).length === 0) {
            // Just return current config
            const current = await sbFetch(`${SB_URL}/rest/v1/chief_sessions?whatsapp_number=eq.${args.whatsapp_number}&select=timezone,standup_hour,standup_enabled&limit=1`, { headers: sbHeaders() });
            return { success: true, current: Array.isArray(current) && current[0] ? current[0] : null };
          }
          updates.updated_at = new Date().toISOString();
          await sbFetch(`${SB_URL}/rest/v1/chief_sessions?whatsapp_number=eq.${args.whatsapp_number}`, {
            method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" }, body: JSON.stringify(updates),
          });
          const parts = [];
          if (args.timezone) parts.push(`Timezone: ${args.timezone}`);
          if (args.standup_hour != null) parts.push(`Hora: ${args.standup_hour}:00`);
          if (args.standup_enabled != null) parts.push(`Standup: ${args.standup_enabled ? 'activado' : 'desactivado'}`);
          return { success: true, updated: parts.join(', '), message: `Configuración actualizada. ${parts.join(', ')}.` };
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

          // Load long-term memories
          try {
            const memParams = new URLSearchParams({ org_id: `eq.${orgId}`, select: "category,content,importance", order: "importance.asc,created_at.desc", limit: "30" });
            const memories = await sbFetch(`${SB_URL}/rest/v1/chief_memory?${memParams}`, { headers: sbHeaders() });
            if (Array.isArray(memories) && memories.length > 0) {
              const grouped = {};
              for (const m of memories) { if (!grouped[m.category]) grouped[m.category] = []; grouped[m.category].push(m); }
              let memText = "\n\nMEMORIA DE LARGO PLAZO (recuerda esto siempre):";
              for (const [cat, items] of Object.entries(grouped)) {
                memText += `\n\n### ${cat}`;
                for (const item of items) memText += `\n- ${item.importance === "critical" ? "⚠️ " : ""}${item.content}`;
              }
              sp += memText;
              console.log(`[gateway] Loaded ${memories.length} memories for org ${orgId}`);
            }
          } catch (e) { console.error("[gateway] loadMemories error:", e.message); }
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
          let resultStr = JSON.stringify(r);
          console.log(`[gateway] tool ${b.name} → ${resultStr.substring(0, 150)}`);

          // Safeguard: if tool result is too large for Claude's context,
          // send it directly to WhatsApp and give Claude a short confirmation
          const MAX_TOOL_RESULT = 3000;
          if (resultStr.length > MAX_TOOL_RESULT) {
            try {
              const sp = new URLSearchParams({ org_id: `eq.${session.orgId}`, select: "whatsapp_number", limit: "1" });
              const sess = await sbFetch(`${SB_URL}/rest/v1/chief_sessions?${sp}`, { headers: sbHeaders() });
              const waNum = Array.isArray(sess) && sess.length > 0 ? sess[0].whatsapp_number : null;
              if (waNum) {
                // Extract readable text from result
                const textContent = r?.result_text || r?.result?.text || r?.result || r?.reply || resultStr;
                const msg = typeof textContent === "string" ? textContent : JSON.stringify(textContent, null, 2);
                const chunks = splitMessage(msg);
                for (const chunk of chunks) {
                  await twilioClient.messages.create({ from: TWILIO_WHATSAPP_NUMBER, to: `whatsapp:+${waNum}`, body: chunk });
                  if (chunks.length > 1) await new Promise(resolve => setTimeout(resolve, 500));
                }
                console.log(`[gateway] Large result (${resultStr.length} chars) sent directly to WhatsApp (${chunks.length} msgs)`);
                resultStr = JSON.stringify({ success: true, message: `Resultado enviado directo a WhatsApp (${msg.length} caracteres, ${chunks.length} mensajes). Ya lo tiene el usuario.` });
              }
            } catch (sendErr) {
              console.error("[gateway] Direct send error:", sendErr.message);
              // Fallback: truncate for Claude
              resultStr = resultStr.substring(0, MAX_TOOL_RESULT) + "... [truncado]";
            }
          }

          return { type: "tool_result", tool_use_id: b.id, content: resultStr };
        }));
        history.push({ role: "user", content: results });
        continue;
      }

      const text = response.content.find(b => b.type === "text")?.text || "";
      // Trim history by message count AND total character size
      if (history.length > GW_MAX_HISTORY) session.history = history.slice(-GW_MAX_HISTORY);
      // Also enforce a character limit to prevent context overflow
      const MAX_HISTORY_CHARS = 15000;
      let totalChars = history.reduce((sum, m) => sum + JSON.stringify(m.content).length, 0);
      while (totalChars > MAX_HISTORY_CHARS && history.length > 4) {
        history.shift();
        totalChars = history.reduce((sum, m) => sum + JSON.stringify(m.content).length, 0);
      }
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

  // =====================================================
  // PROJECT ENGINE — polls every 2 min, advances project phases
  // =====================================================
  // === COLLABORATION ENGINE ===
  // Iterates between assigned agents, maintaining project memory
  async function processCollaborationProject(project) {
    try {
      if (project.current_iteration >= project.max_iterations) {
        await sbFetch(`${SB_URL}/rest/v1/agent_projects?id=eq.${project.id}`, {
          method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
          body: JSON.stringify({ status: "completed", updated_at: new Date().toISOString() }),
        });
        await notifyUserByOrg(project.org_id, `🏁 *Proyecto "${project.name}" completado*\n\nSe alcanzó el máximo de ${project.max_iterations} iteraciones.\n\nResumen final:\n${(project.project_memory || "").substring(project.project_memory?.lastIndexOf("### Iteración") || 0).substring(0, 1000)}`);
        return;
      }

      const agents = project.assigned_agents || [];
      if (agents.length < 2) return;

      // Resolve ALL agents with info
      const agentInfos = [];
      for (const agId of agents) {
        const rows = await sbFetch(`${SB_URL}/rest/v1/agents?id=eq.${agId}&select=id,name,role,railway_url`, { headers: sbHeaders() });
        if (Array.isArray(rows) && rows.length > 0) agentInfos.push(rows[0]);
      }
      if (agentInfos.length < 2) { console.error("[collab] Not enough agents"); return; }

      // Lead agent = first agent. They drive the work and coordinate.
      const leadAgent = agentInfos[0];
      const otherAgents = agentInfos.slice(1);
      const agent = leadAgent; // Lead always receives the task

      if (!agent.railway_url) { console.error(`[collab] Lead agent not deployed`); return; }

      // Get last iteration for context
      const lastIterRows = await sbFetch(`${SB_URL}/rest/v1/agent_project_iterations?project_id=eq.${project.id}&order=iteration_number.desc&limit=1&select=agent_id,output_full,action`, { headers: sbHeaders() });
      const lastIter = Array.isArray(lastIterRows) && lastIterRows.length > 0 ? lastIterRows[0] : null;

      const isFirst = project.current_iteration === 0;
      const action = isFirst ? "produce" : "refine";

      // Build the prompt — HYBRID: agent coordinates directly with teammates
      let prompt = `## Proyecto: ${project.name}\n`;
      prompt += `**Iteración ${project.current_iteration + 1}/${project.max_iterations}**\n`;
      prompt += `**Tu rol:** ${agent.role} (LEAD del proyecto)\n`;
      if (project.success_criteria) prompt += `**Criterios de éxito:** ${project.success_criteria}\n`;
      prompt += `\n### Descripción:\n${project.description}\n`;

      // Communication instructions
      prompt += `\n### Comunicación directa con tu equipo:\n`;
      for (const other of otherAgents) {
        prompt += `Para hablar con **${other.name}** (${other.role}), ejecuta:\n`;
        prompt += `\`\`\`\nnode /home/node/.openclaw/a2a-send.js "${other.name}" "tu mensaje"\n\`\`\`\n`;
      }
      prompt += `Puedes enviar trabajo, pedir implementaciones, dar feedback, y recibir respuestas DIRECTO sin esperar a Chief.\n`;
      prompt += `**Usa a2a-send.js** para coordinar. Itera con tu equipo dentro de esta misma sesión.\n`;

      // Project memory
      if (project.project_memory) {
        prompt += `\n### Memoria del proyecto:\n${project.project_memory.substring(Math.max(0, project.project_memory.length - 3000))}\n`;
      }

      // Last iteration result
      if (lastIter?.output_full) {
        prompt += `\n### Tu último avance:\n${lastIter.output_full.substring(0, 2000)}\n`;
      }

      // Task instructions
      if (isFirst) {
        prompt += `\n### Tu tarea:\n`;
        prompt += `1. Analiza el proyecto y planifica\n`;
        prompt += `2. Coordina con ${otherAgents.map(a => a.name).join(", ")} — delégales trabajo via a2a-send.js\n`;
        prompt += `3. Itera con ellos: envía specs, recibe resultados, da feedback\n`;
        prompt += `4. Reporta aquí el resultado consolidado de esta iteración\n`;
      } else {
        prompt += `\n### Tu tarea:\n`;
        prompt += `Continúa el proyecto desde donde quedaste. Coordina con tu equipo via a2a-send.js.\n`;
        prompt += `Si el proyecto cumple TODOS los criterios de éxito, di "COMPLETADO" al inicio.\n`;
        prompt += `Si necesitas decisión del usuario humano (no de tu equipo), di "necesito tu input".\n`;
      }
      prompt += `\n**Reporta:** qué hiciste, qué delegaste, qué respondieron, y cuál es el estado actual.`;

      // Send to agent via A2A
      console.log(`[collab] Iteration ${project.current_iteration + 1}: ${agent.name} (${action})`);
      const startMs = Date.now();
      const a2aResult = await a2a.sendA2AMessage(agent.railway_url, prompt, {
        token: SB_KEY, fromAgentId: "project-engine", orgId: project.org_id, timeoutMs: 300000,
      });

      let output = "";
      if (a2aResult.success && a2aResult.reply) {
        output = a2aResult.reply;
      } else if (a2aResult.success && a2aResult.taskId) {
        const pollResult = await a2a.pollA2ATask(agent.railway_url, a2aResult.taskId, { token: SB_KEY, maxWaitMs: 120000 });
        output = pollResult.reply || "(sin respuesta)";
      } else {
        output = `Error: ${a2aResult.error || "sin respuesta"}`;
      }

      const durationMs = Date.now() - startMs;
      const outputSummary = output.substring(0, 300);

      // Save iteration
      await sbFetch(`${SB_URL}/rest/v1/agent_project_iterations`, {
        method: "POST", headers: { ...sbHeaders(), Prefer: "return=minimal" },
        body: JSON.stringify({
          project_id: project.id,
          iteration_number: project.current_iteration + 1,
          agent_id: leadAgent.id,
          action,
          input_summary: prompt.substring(0, 300),
          output_summary: outputSummary,
          output_full: output.substring(0, 10000),
          duration_ms: durationMs,
        }),
      });

      // Update project memory (append summary)
      const memoryUpdate = `\n### Iteración ${project.current_iteration + 1} (${agent.name} — ${action})\n${outputSummary}\n`;
      let newMemory = (project.project_memory || "") + memoryUpdate;

      // If memory > 6000 chars, truncate older entries but keep header + last 4000 chars
      if (newMemory.length > 6000) {
        const headerEnd = newMemory.indexOf("### Iteración");
        const header = headerEnd > 0 ? newMemory.substring(0, headerEnd) : "";
        newMemory = header + "\n[... iteraciones anteriores resumidas ...]\n" + newMemory.substring(newMemory.length - 4000);
      }

      // Check if agent said "COMPLETADO"
      const isCompleted = output.trim().toUpperCase().startsWith("COMPLETADO") || output.trim().toUpperCase().startsWith("DONE");

      // --- Loop detection: compare last 3 iteration summaries ---
      let isStuck = false;
      if (project.current_iteration >= 3) {
        const recentIterRows = await sbFetch(`${SB_URL}/rest/v1/agent_project_iterations?project_id=eq.${project.id}&order=iteration_number.desc&limit=3&select=output_summary`, { headers: sbHeaders() });
        if (Array.isArray(recentIterRows) && recentIterRows.length >= 3) {
          const summaries = recentIterRows.map(r => (r.output_summary || "").toLowerCase().trim());
          // Check similarity: if all 3 summaries share >60% of words, it's a loop
          const wordSets = summaries.map(s => new Set(s.split(/\s+/).filter(w => w.length > 3)));
          const commonWords01 = [...wordSets[0]].filter(w => wordSets[1].has(w)).length;
          const commonWords12 = [...wordSets[1]].filter(w => wordSets[2].has(w)).length;
          const avgSize = (wordSets[0].size + wordSets[1].size + wordSets[2].size) / 3;
          if (avgSize > 5 && commonWords01 / avgSize > 0.6 && commonWords12 / avgSize > 0.6) {
            isStuck = true;
            console.log(`[collab] Loop detected in "${project.name}" — pausing for human input`);
          }
        }
      }

      // --- Escalation: agent asks HUMAN for help (not another agent) ---
      const needsInput = /necesito (tu |su |del usuario |del humano )(input|ayuda|decisión|dirección)/i.test(output)
        || /no puedo continuar sin (tu |su )/i.test(output)
        || /(bloqueado|blocked|stuck) (sin|without|need) (dirección|direction|human)/i.test(output);

      const shouldPause = isStuck || needsInput;

      // Update project
      const newIteration = project.current_iteration + 1;
      await sbFetch(`${SB_URL}/rest/v1/agent_projects?id=eq.${project.id}`, {
        method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
        body: JSON.stringify({
          current_iteration: newIteration,
          project_memory: newMemory,
          updated_at: new Date().toISOString(),
          ...(isCompleted ? { status: "completed" } : {}),
          ...(shouldPause && !isCompleted ? { status: "paused" } : {}),
        }),
      });

      console.log(`[collab] ${agent.name} responded (${durationMs}ms, ${output.length} chars) ${isCompleted ? "→ COMPLETED" : shouldPause ? "→ PAUSED" : ""}`);

      // Notifications
      if (isCompleted) {
        await notifyUserByOrg(project.org_id, `🎉 *Proyecto "${project.name}" COMPLETADO*\n\n${agent.name} indicó que el trabajo está listo.\n\n📊 Iteraciones: ${newIteration}\n\nÚltimo resultado:\n${outputSummary}`);
      } else if (isStuck) {
        await notifyUserByOrg(project.org_id,
          `⚠️ *Proyecto "${project.name}" — necesito tu ayuda*\n\n` +
          `Los agentes llevan ${newIteration} iteraciones y parece que están repitiendo lo mismo.\n\n` +
          `Último resultado de ${agent.name}:\n${outputSummary}\n\n` +
          `*¿Qué quieres que hagan?* Responde con instrucciones específicas y digo "continuar proyecto".`
        );
      } else if (needsInput) {
        await notifyUserByOrg(project.org_id,
          `🤚 *Proyecto "${project.name}" — ${agent.name} necesita tu input*\n\n` +
          `${outputSummary}\n\n` +
          `Responde con tu decisión y digo "continuar proyecto".`
        );
      } else if (newIteration % (project.checkpoint_every || 3) === 0) {
        // Get recent iterations for summary
        const recentRows = await sbFetch(`${SB_URL}/rest/v1/agent_project_iterations?project_id=eq.${project.id}&order=iteration_number.desc&limit=${project.checkpoint_every || 3}&select=iteration_number,agent_id,output_summary`, { headers: sbHeaders() });
        const recent = Array.isArray(recentRows) ? recentRows : [];

        // Get agent names
        const agentNamesMap = {};
        for (const r of recent) {
          if (!agentNamesMap[r.agent_id]) {
            const ar = await sbFetch(`${SB_URL}/rest/v1/agents?id=eq.${r.agent_id}&select=name`, { headers: sbHeaders() });
            agentNamesMap[r.agent_id] = Array.isArray(ar) && ar.length > 0 ? ar[0].name : "agente";
          }
        }

        const summary = recent.reverse().map(r =>
          `${r.iteration_number}. *${agentNamesMap[r.agent_id]}*: ${(r.output_summary || "").substring(0, 200)}`
        ).join("\n\n");

        await notifyUserByOrg(project.org_id,
          `📋 *Proyecto: ${project.name}*\n` +
          `🔄 Iteración ${newIteration}/${project.max_iterations}\n\n` +
          `Últimos avances:\n${summary}\n\n` +
          `Responde "pausar proyecto" para detener.`
        );
      }
    } catch (err) {
      console.error(`[collab] Error in project ${project.id}:`, err.message);
    }
  }

  async function processProjects() {
    try {
      // Get all active projects
      const projects = await sbFetch(`${SB_URL}/rest/v1/agent_projects?status=eq.active&select=*`, { headers: sbHeaders() });
      if (!Array.isArray(projects) || projects.length === 0) return;

      for (const project of projects) {

        // === COLLABORATION MODE ENGINE ===
        if (project.workflow_type === "collaboration") {
          await processCollaborationProject(project);
          continue;
        }

        // === SEQUENTIAL MODE (original) ===
        // Get current phase (first non-completed, ordered by phase_number)
        const phases = await sbFetch(`${SB_URL}/rest/v1/agent_project_phases?project_id=eq.${project.id}&status=neq.completed&order=phase_number.asc&limit=1&select=*`, { headers: sbHeaders() });
        if (!Array.isArray(phases) || phases.length === 0) {
          // All phases completed — mark project done
          await sbFetch(`${SB_URL}/rest/v1/agent_projects?id=eq.${project.id}`, {
            method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
            body: JSON.stringify({ status: "completed", updated_at: new Date().toISOString() }),
          });
          await notifyUserByOrg(project.org_id, `🎉 *Proyecto "${project.name}" completado!*\n\nTodas las fases se ejecutaron exitosamente.`);
          console.log(`[project-engine] Project "${project.name}" completed!`);
          continue;
        }

        const phase = phases[0];

        // PENDING → create task and start
        if (phase.status === "pending") {
          // Get previous phase result for context
          const prevPhases = await sbFetch(`${SB_URL}/rest/v1/agent_project_phases?project_id=eq.${project.id}&status=eq.completed&order=phase_number.desc&limit=1&select=name,result`, { headers: sbHeaders() });
          const prevContext = Array.isArray(prevPhases) && prevPhases.length > 0
            ? `\n\nContexto de la fase anterior (${prevPhases[0].name}):\n${(prevPhases[0].result || "").substring(0, 2000)}`
            : "";

          const instruction = `Proyecto: ${project.name}\nFase ${phase.phase_number}: ${phase.name}\n\n${phase.description}${prevContext}${phase.feedback ? `\n\nFeedback del reviewer:\n${phase.feedback}` : ""}`;

          // Create task for the agent
          const taskRes = await sbFetch(`${SB_URL}/functions/v1/agent-task`, {
            method: "POST", headers: sbHeaders(true),
            body: JSON.stringify({ org_id: project.org_id, agent_id: phase.agent_id, instruction, delegated_by: "project-engine" }),
          });
          const taskId = taskRes?.task?.id;

          // Update phase status
          await sbFetch(`${SB_URL}/rest/v1/agent_project_phases?id=eq.${phase.id}`, {
            method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
            body: JSON.stringify({ status: "in_progress", task_id: taskId }),
          });

          // Get agent name for notification
          const agentRows = await sbFetch(`${SB_URL}/rest/v1/agents?id=eq.${phase.agent_id}&select=name,railway_url`, { headers: sbHeaders() });
          const agent = Array.isArray(agentRows) ? agentRows[0] : null;

          // Send task to agent via pgmq queue (primary) or HTTP (fallback)
          {
            const callbackUrl = "https://twilio-bridge-production-241b.up.railway.app/api/agent-callback";
            let waNum = null;
            try {
              const sp = new URLSearchParams({ org_id: `eq.${project.org_id}`, select: "whatsapp_number", limit: "1" });
              const sess = await sbFetch(`${SB_URL}/rest/v1/chief_sessions?${sp}`, { headers: sbHeaders() });
              if (Array.isArray(sess) && sess.length > 0) waNum = sess[0].whatsapp_number;
            } catch (_) {}

            let sentViaQueue = false;
            try {
              const envelope = pgmq.createEnvelope({
                type: "task", fromAgentId: "project-engine", orgId: project.org_id, taskId,
                replyTo: "agent_chief",
                payload: { instruction, callback_url: callbackUrl, whatsapp_number: waNum, agent_name: agent?.name || "agent" },
              });
              await pgmq.sendMessage(pgmq.getQueueName(phase.agent_id), envelope);
              sentViaQueue = true;
              console.log(`[project-engine] Queued task for phase ${phase.phase_number} via pgmq`);
            } catch (qErr) {
              console.warn(`[project-engine] pgmq failed, trying HTTP:`, qErr.message);
            }

            // HTTP fallback if queue failed
            if (!sentViaQueue && agent?.railway_url) {
              fetch(`${agent.railway_url}/api/task`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}` },
                body: JSON.stringify({ instruction, context: { org_id: project.org_id }, task_id: taskId, callback_url: callbackUrl, whatsapp_number: waNum, agent_name: agent.name }),
              }).then(async (res) => {
                if (res.status === 429) {
                  console.log(`[project-engine] Agent busy, will retry phase in next cycle`);
                  await sbFetch(`${SB_URL}/rest/v1/agent_project_phases?id=eq.${phase.id}`, {
                    method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
                    body: JSON.stringify({ status: "pending" }),
                  });
                }
              }).catch(err => {
                console.error(`[project-engine] Error sending to agent:`, err.message);
                sbFetch(`${SB_URL}/rest/v1/agent_project_phases?id=eq.${phase.id}`, {
                  method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
                  body: JSON.stringify({ status: "pending" }),
                }).catch(() => {});
              });
            }
          }

          await notifyUserByOrg(project.org_id, `📋 *Proyecto: ${project.name}*\n\n▶️ Fase ${phase.phase_number}: ${phase.name}\nAgente: ${agent?.name || "unknown"}\nStatus: en progreso...`);
          console.log(`[project-engine] Started phase ${phase.phase_number} of "${project.name}"`);
        }

        // IN_PROGRESS → check if task completed
        else if (phase.status === "in_progress" && phase.task_id) {
          const taskRows = await sbFetch(`${SB_URL}/rest/v1/agent_tasks?id=eq.${phase.task_id}&select=status,result`, { headers: sbHeaders() });
          const task = Array.isArray(taskRows) ? taskRows[0] : null;

          if (task?.status === "completed") {
            const result = task.result?.text || JSON.stringify(task.result);

            if (phase.reviewer_agent_id) {
              // Move to review
              await sbFetch(`${SB_URL}/rest/v1/agent_project_phases?id=eq.${phase.id}`, {
                method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
                body: JSON.stringify({ status: "review", result }),
              });
              console.log(`[project-engine] Phase ${phase.phase_number} → review`);
            } else {
              // No reviewer — mark completed
              await sbFetch(`${SB_URL}/rest/v1/agent_project_phases?id=eq.${phase.id}`, {
                method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
                body: JSON.stringify({ status: "completed", result, completed_at: new Date().toISOString() }),
              });
              await notifyUserByOrg(project.org_id, `✅ *Proyecto: ${project.name}*\n\nFase ${phase.phase_number} "${phase.name}" completada.`);
              console.log(`[project-engine] Phase ${phase.phase_number} completed`);
            }
          } else if (task?.status === "failed") {
            await sbFetch(`${SB_URL}/rest/v1/agent_project_phases?id=eq.${phase.id}`, {
              method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
              body: JSON.stringify({ status: "failed" }),
            });
            await notifyUserByOrg(project.org_id, `❌ *Proyecto: ${project.name}*\n\nFase ${phase.phase_number} "${phase.name}" falló. El proyecto está pausado.`);
          }
        }

        // REVIEW → send to reviewer
        else if (phase.status === "review") {
          const reviewerRows = await sbFetch(`${SB_URL}/rest/v1/agents?id=eq.${phase.reviewer_agent_id}&select=name,railway_url`, { headers: sbHeaders() });
          const reviewer = Array.isArray(reviewerRows) ? reviewerRows[0] : null;

          if (reviewer?.railway_url) {
            try {
              const reviewMsg = `Revisa este trabajo:\n\nProyecto: ${project.name}\nFase: ${phase.name}\n\nTrabajo:\n${(phase.result || "").substring(0, 3000)}\n\n${phase.current_review_iteration < phase.max_review_iterations - 1 ? 'Si está bien, responde "APROBADO" al inicio. Si no, da feedback específico.' : 'Última revisión. Da feedback final.'}`;

              const res = await fetch(`${reviewer.railway_url}/api/review`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}` },
                body: JSON.stringify({ message: reviewMsg, context: { org_id: project.org_id } }),
              });
              const data = await res.json();
              const feedback = data.reply || data.result || "";

              if (feedback.trim().toUpperCase().startsWith("APROBADO") || phase.current_review_iteration >= phase.max_review_iterations - 1) {
                await sbFetch(`${SB_URL}/rest/v1/agent_project_phases?id=eq.${phase.id}`, {
                  method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
                  body: JSON.stringify({ status: "completed", feedback, completed_at: new Date().toISOString() }),
                });
                await notifyUserByOrg(project.org_id, `✅ *Proyecto: ${project.name}*\n\nFase ${phase.phase_number} "${phase.name}" aprobada por ${reviewer.name}.`);
              } else {
                // Send back for iteration
                await sbFetch(`${SB_URL}/rest/v1/agent_project_phases?id=eq.${phase.id}`, {
                  method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
                  body: JSON.stringify({ status: "pending", feedback, current_review_iteration: phase.current_review_iteration + 1 }),
                });
                await notifyUserByOrg(project.org_id, `🔄 *Proyecto: ${project.name}*\n\nFase ${phase.phase_number}: ${reviewer.name} dio feedback. Iteración ${phase.current_review_iteration + 2}/${phase.max_review_iterations}.`);
              }
            } catch (err) {
              console.error(`[project-engine] Review error:`, err.message);
              // Don't fail the phase — just skip this cycle, engine will retry in 2 min
              console.log(`[project-engine] Will retry review in next cycle`);
            }
          }
        }
      }
    } catch (err) {
      console.error("[project-engine] Error:", err.message);
    }
  }

  // Run project engine every 2 minutes
  setInterval(processProjects, 120000);
  // First run after 30 seconds (let everything initialize)
  setTimeout(processProjects, 30000);
  // Note: the original IIFE (ocClient.connect()) already handles initial connection.
  // The gateway WS server is synchronously registered before the event loop processes
  // the TCP connection, so the IIFE's connect() will succeed.
}
