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

const WHATSAPP_MAX_LENGTH = 1600; // Twilio WhatsApp API hard limit — messages >1600 chars get silently truncated

function splitMessage(text) {
  // Reserve space for part label "[1/9]\n" when splitting
  const maxLen = text.length <= WHATSAPP_MAX_LENGTH ? WHATSAPP_MAX_LENGTH : WHATSAPP_MAX_LENGTH - 15;
  if (text.length <= WHATSAPP_MAX_LENGTH) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    // Try to split at natural boundaries: paragraph > heading > newline > space
    let idx = remaining.lastIndexOf("\n\n", maxLen);
    if (idx === -1 || idx < maxLen * 0.3) idx = remaining.lastIndexOf("\n---", maxLen);
    if (idx === -1 || idx < maxLen * 0.3) idx = remaining.lastIndexOf("\n", maxLen);
    if (idx === -1 || idx < maxLen * 0.3) idx = remaining.lastIndexOf(" ", maxLen);
    if (idx === -1) idx = maxLen;
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

      // Timeout after 300s (5 min — allows complex multi-tool chains)
      setTimeout(() => {
        if (this.streamResolve === resolve) {
          this.streamResolve = null;
          if (this.streamText.trim()) {
            resolve(this.streamText);
            this.streamText = "";
          } else {
            reject(new Error("Response timeout (300s)"));
          }
        }
      }, 300000);
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

// ---------------------------------------------------------------------------
// CORS for dashboard cross-origin requests (auth + integrations endpoints)
// ---------------------------------------------------------------------------
app.use(["/auth", "/integrations"], (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ---------------------------------------------------------------------------
// Google OAuth — shared between WhatsApp and dashboard
// Tokens live in agent_integrations (single source of truth)
// ---------------------------------------------------------------------------
const BRIDGE_PUBLIC_URL = process.env.BRIDGE_PUBLIC_URL || "https://twilio-bridge-production-241b.up.railway.app";
const GOOGLE_REDIRECT_URI = `${BRIDGE_PUBLIC_URL}/auth/google/callback`;
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive",                // Full Drive access (create, edit, delete, share, permissions)
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/presentations",
].join(" ");

// Module-scope Supabase helpers (the ones inside gwExecuteToolSync aren't hoisted here)
const SB_URL_GLOBAL = process.env.SUPABASE_URL || "https://arupeqczrxmfkcbjwyad.supabase.co";
const SB_KEY_GLOBAL = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
function sbHeadersGlobal() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SB_KEY_GLOBAL}`,
    "apikey": SB_KEY_GLOBAL,
  };
}
async function sbFetchGlobal(url, opts = {}) {
  const res = await fetch(url, opts);
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { _raw: txt, _status: res.status }; }
}

function requireGoogleEnv() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured");
  return { id, secret };
}

// Start OAuth flow — returns the auth URL (JSON) or redirects (html)
app.get("/auth/google/start", (req, res) => {
  try {
    const { id } = requireGoogleEnv();
    const orgId = String(req.query.org_id || "");
    const source = String(req.query.source || "dashboard"); // whatsapp | dashboard
    const userId = String(req.query.user_id || "");
    if (!orgId) return res.status(400).send("Missing org_id");
    const state = Buffer.from(JSON.stringify({ org_id: orgId, source, user_id: userId, nonce: Date.now() })).toString("base64url");
    const params = new URLSearchParams({
      client_id: id,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: GOOGLE_SCOPES,
      access_type: "offline",
      prompt: "consent", // ensures refresh_token is returned
      state,
    });
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    // If browser-like Accept, redirect; otherwise return JSON (for Chief tool)
    const accept = String(req.headers.accept || "");
    if (accept.includes("text/html")) return res.redirect(url);
    return res.json({ url });
  } catch (e) {
    console.error("[auth/google/start] error:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

// OAuth callback — exchange code, store tokens, show success HTML
app.get("/auth/google/callback", async (req, res) => {
  try {
    const { id: clientId, secret: clientSecret } = requireGoogleEnv();
    const code = String(req.query.code || "");
    const stateEncoded = String(req.query.state || "");
    if (!code || !stateEncoded) return res.status(400).send("Missing code or state");

    let stateDecoded;
    try {
      // Try base64url first, then regular base64, then URL-decoded base64url
      const raw = stateEncoded.replace(/%3D/g, "=").replace(/%2B/g, "+").replace(/%2F/g, "/");
      try {
        stateDecoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
      } catch {
        stateDecoded = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
      }
    } catch (e) {
      console.error("[auth/google/callback] state decode failed:", stateEncoded, e.message);
      return res.status(400).send("Invalid state — please try connecting again with a fresh link.");
    }
    const { org_id: orgId, source, user_id: userId } = stateDecoded || {};
    if (!orgId) return res.status(400).send("state missing org_id");

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("[auth/google/callback] token exchange failed:", tokenData);
      return res.status(500).send(`Token exchange failed: ${JSON.stringify(tokenData).substring(0, 300)}`);
    }

    // Get user email
    let email = null;
    try {
      const uiRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const ui = await uiRes.json();
      email = ui?.email || null;
    } catch {}

    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();

    // Upsert in agent_integrations (unique on org_id + provider)
    const existing = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations?org_id=eq.${orgId}&provider=eq.google&select=id`, { headers: sbHeadersGlobal() });
    const payload = {
      org_id: orgId,
      provider: "google",
      email,
      access_token: tokenData.access_token,
      token_expires_at: expiresAt,
      scopes: GOOGLE_SCOPES.split(" "),
      connected_via: source || "dashboard",
      connected_by_user_id: userId || null,
      last_refreshed_at: new Date().toISOString(),
      status: "active",
      error_message: null,
    };
    // Only overwrite refresh_token if Google sent one (they only send on first consent)
    if (tokenData.refresh_token) payload.refresh_token = tokenData.refresh_token;

    if (Array.isArray(existing) && existing.length > 0) {
      await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations?org_id=eq.${orgId}&provider=eq.google`, {
        method: "PATCH",
        headers: { ...sbHeadersGlobal(), Prefer: "return=minimal" },
        body: JSON.stringify(payload),
      });
    } else {
      if (!payload.refresh_token) {
        console.warn(`[auth/google/callback] first connect but no refresh_token from Google — will require re-auth`);
      }
      await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations`, {
        method: "POST",
        headers: { ...sbHeadersGlobal(), Prefer: "return=minimal" },
        body: JSON.stringify(payload),
      });
    }

    console.log(`[auth/google/callback] Gmail connected for org ${orgId} (${email}) via ${source}`);

    // Success HTML
    return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Gmail connected</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#111;border:1px solid #222;border-radius:16px;padding:40px;text-align:center;max-width:400px}.ok{font-size:48px;margin-bottom:16px}h1{margin:0 0 8px;font-size:22px}p{color:#888;margin:8px 0 0}</style></head>
<body><div class="card"><div class="ok">✅</div><h1>Gmail connected</h1><p>${email || "Your account"}</p><p>You can close this tab — Paula can now read your inbox.</p></div></body></html>`);
  } catch (e) {
    console.error("[auth/google/callback] error:", e);
    return res.status(500).send(`Error: ${e.message}`);
  }
});

// Status check — used by dashboard
app.get("/integrations/google/status", async (req, res) => {
  try {
    const orgId = String(req.query.org_id || "");
    if (!orgId) return res.status(400).json({ error: "Missing org_id" });
    const rows = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations?org_id=eq.${orgId}&provider=eq.google&select=email,status,connected_at,token_expires_at,connected_via,last_used_at`, { headers: sbHeadersGlobal() });
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.json({ connected: false });
    }
    const row = rows[0];
    return res.json({
      connected: row.status === "active",
      email: row.email,
      connected_at: row.connected_at,
      connected_via: row.connected_via,
      expires_at: row.token_expires_at,
      last_used_at: row.last_used_at,
      status: row.status,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Disconnect — used by dashboard and Chief
app.post("/integrations/google/disconnect", express.json(), async (req, res) => {
  try {
    const orgId = String(req.body?.org_id || req.query.org_id || "");
    if (!orgId) return res.status(400).json({ error: "Missing org_id" });
    await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations?org_id=eq.${orgId}&provider=eq.google`, {
      method: "DELETE",
      headers: { ...sbHeadersGlobal(), Prefer: "return=minimal" },
    });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Internal endpoint used by chief-agents containers to get a fresh access_token
app.post("/integrations/google/refresh", express.json(), async (req, res) => {
  try {
    const { id: clientId, secret: clientSecret } = requireGoogleEnv();
    const orgId = String(req.body?.org_id || "");
    if (!orgId) return res.status(400).json({ error: "Missing org_id" });
    const rows = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations?org_id=eq.${orgId}&provider=eq.google&select=*`, { headers: sbHeadersGlobal() });
    if (!Array.isArray(rows) || rows.length === 0) return res.status(404).json({ error: "not_connected" });
    const row = rows[0];
    if (row.status !== "active") return res.status(400).json({ error: `status: ${row.status}` });

    // If not expired (with 60s margin), return current token
    const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
    if (expiresAt - Date.now() > 60_000) {
      return res.json({ access_token: row.access_token, email: row.email, expires_at: row.token_expires_at, refreshed: false });
    }

    // Refresh
    if (!row.refresh_token) {
      await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations?org_id=eq.${orgId}&provider=eq.google`, {
        method: "PATCH", headers: { ...sbHeadersGlobal(), Prefer: "return=minimal" },
        body: JSON.stringify({ status: "expired", error_message: "No refresh_token — user must reconnect" }),
      });
      return res.status(400).json({ error: "no_refresh_token", message: "User must reconnect Gmail" });
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: row.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations?org_id=eq.${orgId}&provider=eq.google`, {
        method: "PATCH", headers: { ...sbHeadersGlobal(), Prefer: "return=minimal" },
        body: JSON.stringify({ status: "error", error_message: JSON.stringify(tokenData).substring(0, 300) }),
      });
      return res.status(500).json({ error: "refresh_failed", details: tokenData });
    }
    const newExpires = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
    await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations?org_id=eq.${orgId}&provider=eq.google`, {
      method: "PATCH", headers: { ...sbHeadersGlobal(), Prefer: "return=minimal" },
      body: JSON.stringify({
        access_token: tokenData.access_token,
        token_expires_at: newExpires,
        last_refreshed_at: new Date().toISOString(),
        status: "active",
        error_message: null,
      }),
    });
    return res.json({ access_token: tokenData.access_token, email: row.email, expires_at: newExpires, refreshed: true });
  } catch (e) {
    console.error("[integrations/google/refresh] error:", e);
    return res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Salesforce OAuth — bridge endpoints
// ---------------------------------------------------------------------------
const SF_REDIRECT_URI = `${BRIDGE_PUBLIC_URL}/auth/salesforce/callback`;

// In-memory store for PKCE verifiers (short-lived, keyed by state nonce)
const sfPkceStore = new Map();

app.get("/auth/salesforce/start", (req, res) => {
  try {
    const clientId = process.env.SALESFORCE_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: "SALESFORCE_CLIENT_ID not configured" });
    const orgId = String(req.query.org_id || "");
    const source = String(req.query.source || "dashboard");
    if (!orgId) return res.status(400).json({ error: "Missing org_id" });

    // Generate PKCE code_verifier + code_challenge
    const verifierBytes = crypto.randomBytes(32);
    const codeVerifier = verifierBytes.toString("base64url");
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

    const nonce = crypto.randomUUID();
    const state = Buffer.from(JSON.stringify({ org_id: orgId, source, nonce })).toString("base64url");

    // Store verifier for callback (expires in 10 min)
    sfPkceStore.set(nonce, codeVerifier);
    setTimeout(() => sfPkceStore.delete(nonce), 600_000);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: SF_REDIRECT_URI,
      scope: "full refresh_token",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "login",
    });
    const url = `https://login.salesforce.com/services/oauth2/authorize?${params}`;
    const accept = String(req.headers.accept || "");
    if (accept.includes("text/html")) return res.redirect(url);
    return res.json({ url });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get("/auth/salesforce/callback", async (req, res) => {
  try {
    const clientId = process.env.SALESFORCE_CLIENT_ID;
    const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.status(500).send("Missing Salesforce credentials");
    const code = String(req.query.code || "");
    const stateRaw = String(req.query.state || "");
    if (!code) return res.status(400).send("Missing code");
    let stateObj = {};
    try { stateObj = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8")); } catch {}
    const orgId = stateObj.org_id || "";
    const source = stateObj.source || "dashboard";
    const nonce = stateObj.nonce || "";

    // Retrieve PKCE code_verifier
    const codeVerifier = sfPkceStore.get(nonce);
    if (!codeVerifier) {
      return res.status(400).send("PKCE session expired — please try connecting again.");
    }
    sfPkceStore.delete(nonce);

    const tokenRes = await fetch("https://login.salesforce.com/services/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code", code,
        client_id: clientId, client_secret: clientSecret,
        redirect_uri: SF_REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    });
    const td = await tokenRes.json();
    if (!tokenRes.ok || !td.access_token) {
      console.error("[auth/salesforce/callback] token exchange failed:", td);
      return res.status(500).send(`Salesforce token error: ${JSON.stringify(td).substring(0, 300)}`);
    }

    // Get user info
    let email = null;
    try {
      const uiRes = await fetch(`${td.instance_url}/services/oauth2/userinfo`, {
        headers: { Authorization: `Bearer ${td.access_token}` },
      });
      const ui = await uiRes.json();
      email = ui?.email || null;
    } catch {}

    // Upsert in agent_integrations
    const payload = {
      org_id: orgId, provider: "salesforce", email,
      access_token: td.access_token, refresh_token: td.refresh_token || null,
      token_expires_at: null, // Salesforce doesn't return expires_in easily
      scopes: ["full", "refresh_token"], connected_via: source,
      metadata: { instance_url: td.instance_url, sf_id: td.id },
      last_refreshed_at: new Date().toISOString(), status: "active", error_message: null,
    };
    const existing = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations?org_id=eq.${orgId}&provider=eq.salesforce&select=id`, { headers: sbHeadersGlobal() });
    if (Array.isArray(existing) && existing.length > 0) {
      await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations?org_id=eq.${orgId}&provider=eq.salesforce`, {
        method: "PATCH", headers: { ...sbHeadersGlobal(), Prefer: "return=minimal" }, body: JSON.stringify(payload),
      });
    } else {
      await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations`, {
        method: "POST", headers: { ...sbHeadersGlobal(), Prefer: "return=minimal" }, body: JSON.stringify(payload),
      });
    }

    // Also upsert in salesforce_connections for edge function compat
    const sfPayload = {
      org_id: orgId, access_token: td.access_token, refresh_token: td.refresh_token,
      instance_url: td.instance_url, sf_user_id: td.id, is_active: true,
    };
    const sfExist = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/salesforce_connections?org_id=eq.${orgId}&select=id`, { headers: sbHeadersGlobal() });
    if (Array.isArray(sfExist) && sfExist.length > 0) {
      await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/salesforce_connections?org_id=eq.${orgId}`, {
        method: "PATCH", headers: { ...sbHeadersGlobal(), Prefer: "return=minimal" }, body: JSON.stringify(sfPayload),
      });
    } else {
      await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/salesforce_connections`, {
        method: "POST", headers: { ...sbHeadersGlobal(), Prefer: "return=minimal" }, body: JSON.stringify(sfPayload),
      });
    }

    console.log(`[auth/salesforce/callback] Connected for org ${orgId} (${email})`);
    return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Salesforce connected</title>
<style>body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#111;border:1px solid #222;border-radius:16px;padding:40px;text-align:center;max-width:400px}.ok{font-size:48px;margin-bottom:16px}h1{margin:0 0 8px;font-size:22px}p{color:#888;margin:8px 0 0}</style></head>
<body><div class="card"><div class="ok">☁️</div><h1>Salesforce connected</h1><p>${email || "Your account"}</p><p>You can close this tab.</p></div></body></html>`);
  } catch (e) {
    console.error("[auth/salesforce/callback]", e);
    return res.status(500).send(`Error: ${e.message}`);
  }
});

// Salesforce token refresh (auto-refresh on every API call)
app.post("/integrations/salesforce/refresh", express.json(), async (req, res) => {
  try {
    const clientId = process.env.SALESFORCE_CLIENT_ID;
    const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
    const orgId = String(req.body?.org_id || "");
    if (!orgId) return res.status(400).json({ error: "Missing org_id" });

    // Try agent_integrations first, then salesforce_connections
    let row = null;
    const aiRows = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations?org_id=eq.${orgId}&provider=eq.salesforce&select=*`, { headers: sbHeadersGlobal() });
    if (Array.isArray(aiRows) && aiRows.length > 0) row = aiRows[0];
    if (!row) {
      const sfRows = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/salesforce_connections?org_id=eq.${orgId}&select=access_token,refresh_token,instance_url,is_active`, { headers: sbHeadersGlobal() });
      if (Array.isArray(sfRows) && sfRows.length > 0) {
        row = { access_token: sfRows[0].access_token, refresh_token: sfRows[0].refresh_token, metadata: { instance_url: sfRows[0].instance_url }, status: sfRows[0].is_active ? "active" : "expired" };
      }
    }
    if (!row) return res.status(404).json({ error: "not_connected" });
    if (!row.refresh_token) return res.status(400).json({ error: "no_refresh_token" });

    const instanceUrl = row.metadata?.instance_url || "https://login.salesforce.com";

    // Try current token first
    try {
      const testRes = await fetch(`${instanceUrl}/services/data/v59.0/limits`, {
        headers: { Authorization: `Bearer ${row.access_token}` },
      });
      if (testRes.ok) {
        return res.json({ access_token: row.access_token, instance_url: instanceUrl, refreshed: false });
      }
    } catch {}

    // Token expired — refresh it
    if (!clientId || !clientSecret) return res.status(500).json({ error: "Missing SF credentials" });
    const tokenRes = await fetch(`${instanceUrl}/services/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: row.refresh_token,
      }),
    });
    const td = await tokenRes.json();
    if (!tokenRes.ok || !td.access_token) {
      console.error("[sf/refresh] failed:", td);
      return res.status(500).json({ error: "refresh_failed", details: td });
    }

    // Update both tables
    const newInstanceUrl = td.instance_url || instanceUrl;
    await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations?org_id=eq.${orgId}&provider=eq.salesforce`, {
      method: "PATCH", headers: { ...sbHeadersGlobal(), Prefer: "return=minimal" },
      body: JSON.stringify({ access_token: td.access_token, metadata: { instance_url: newInstanceUrl }, status: "active", last_refreshed_at: new Date().toISOString() }),
    });
    await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/salesforce_connections?org_id=eq.${orgId}`, {
      method: "PATCH", headers: { ...sbHeadersGlobal(), Prefer: "return=minimal" },
      body: JSON.stringify({ access_token: td.access_token, instance_url: newInstanceUrl, is_active: true }),
    });

    console.log(`[sf/refresh] Token refreshed for org ${orgId}`);
    return res.json({ access_token: td.access_token, instance_url: newInstanceUrl, refreshed: true });
  } catch (e) {
    console.error("[sf/refresh] error:", e);
    return res.status(500).json({ error: e.message });
  }
});

// Salesforce status
app.get("/integrations/salesforce/status", async (req, res) => {
  try {
    const orgId = String(req.query.org_id || "");
    if (!orgId) return res.status(400).json({ error: "Missing org_id" });
    const rows = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations?org_id=eq.${orgId}&provider=eq.salesforce&select=email,status,connected_at,connected_via,metadata`, { headers: sbHeadersGlobal() });
    if (!Array.isArray(rows) || rows.length === 0) return res.json({ connected: false });
    const r = rows[0];
    return res.json({ connected: r.status === "active", email: r.email, instance_url: r.metadata?.instance_url, connected_at: r.connected_at, status: r.status });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// LinkedIn/Unipile — status check + hosted auth link generation
// ---------------------------------------------------------------------------
app.get("/integrations/linkedin/status", async (req, res) => {
  try {
    const orgId = String(req.query.org_id || "");
    if (!orgId) return res.status(400).json({ error: "Missing org_id" });
    // Find org admin's active LinkedIn Unipile account
    const members = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/organization_members?org_id=eq.${orgId}&role=eq.admin&select=user_id&limit=1`, { headers: sbHeadersGlobal() });
    if (!Array.isArray(members) || members.length === 0) return res.json({ connected: false, note: "No admin found" });
    const userId = members[0].user_id;
    const accs = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/unipile_accounts?user_id=eq.${userId}&provider=eq.LINKEDIN&status=eq.active&select=account_id,status,connected_at`, { headers: sbHeadersGlobal() });
    if (!Array.isArray(accs) || accs.length === 0) return res.json({ connected: false });
    return res.json({ connected: true, account_id: accs[0].account_id, connected_at: accs[0].connected_at, provider: "unipile" });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Generate Unipile Hosted Auth link for LinkedIn
app.get("/auth/linkedin/start", async (req, res) => {
  try {
    const dsn = process.env.UNIPILE_DSN;
    const token = process.env.UNIPILE_ACCESS_TOKEN;
    if (!dsn || !token) return res.status(500).json({ error: "UNIPILE_DSN/UNIPILE_ACCESS_TOKEN not configured" });
    const orgId = String(req.query.org_id || "");
    if (!orgId) return res.status(400).json({ error: "Missing org_id" });
    // Generate hosted auth link via Unipile API
    const hostedRes = await fetch(`https://${dsn}/api/v1/hosted/accounts/link-creation`, {
      method: "POST",
      headers: { "X-API-KEY": token, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        type: "LINKEDIN",
        api_url: `https://${dsn}`,
        success_redirect_url: `${BRIDGE_PUBLIC_URL}/auth/linkedin/success?org_id=${orgId}`,
        failure_redirect_url: `${BRIDGE_PUBLIC_URL}/auth/linkedin/failure`,
        notify_url: `${BRIDGE_PUBLIC_URL}/auth/linkedin/webhook?org_id=${orgId}`,
      }),
    });
    const hostedData = await hostedRes.json();
    const url = hostedData?.url || hostedData?.object?.url;
    if (!url) {
      console.error("[auth/linkedin/start] Unipile response:", hostedData);
      return res.status(500).json({ error: "Failed to generate Unipile auth link", details: hostedData });
    }
    const accept = String(req.headers.accept || "");
    if (accept.includes("text/html")) return res.redirect(url);
    return res.json({ url });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

app.get("/auth/linkedin/success", (_req, res) => {
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>LinkedIn connected</title>
<style>body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#111;border:1px solid #222;border-radius:16px;padding:40px;text-align:center;max-width:400px}.ok{font-size:48px;margin-bottom:16px}h1{margin:0 0 8px;font-size:22px}p{color:#888;margin:8px 0 0}</style></head>
<body><div class="card"><div class="ok">💼</div><h1>LinkedIn connected</h1><p>You can close this tab.</p></div></body></html>`);
});

// Integrations status — unified endpoint for all providers
app.get("/integrations/status", async (req, res) => {
  try {
    const orgId = String(req.query.org_id || "");
    if (!orgId) return res.status(400).json({ error: "Missing org_id" });
    const rows = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations?org_id=eq.${orgId}&select=provider,email,status,connected_at,connected_via`, { headers: sbHeadersGlobal() });
    const integrations = {};
    for (const r of (Array.isArray(rows) ? rows : [])) {
      integrations[r.provider] = { connected: r.status === "active", email: r.email, connected_at: r.connected_at, connected_via: r.connected_via };
    }
    // Check LinkedIn from unipile_accounts
    const members = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/organization_members?org_id=eq.${orgId}&role=eq.admin&select=user_id&limit=1`, { headers: sbHeadersGlobal() });
    if (Array.isArray(members) && members.length > 0) {
      const accs = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/unipile_accounts?user_id=eq.${members[0].user_id}&provider=eq.LINKEDIN&status=eq.active&select=account_id&limit=1`, { headers: sbHeadersGlobal() });
      integrations["linkedin"] = { connected: Array.isArray(accs) && accs.length > 0, provider: "unipile" };
    }
    // API-key integrations (always "available" if env vars set)
    integrations["firecrawl"] = { available: !!process.env.FIRECRAWL_API_KEY };
    integrations["apollo"] = { available: !!process.env.APOLLO_API_KEY };
    return res.json(integrations);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// API Key management — store/read per-org API keys for integrations
// ---------------------------------------------------------------------------
app.post("/integrations/apikey/save", express.json(), async (req, res) => {
  try {
    const { org_id, provider, api_key, api_secret, label } = req.body;
    if (!org_id || !provider || !api_key) return res.status(400).json({ error: "Missing org_id, provider, or api_key" });
    const payload = {
      org_id, provider,
      access_token: api_key,
      refresh_token: api_secret || null,
      email: label || null,
      connected_via: "dashboard",
      status: "active",
      metadata: { type: "apikey" },
      last_refreshed_at: new Date().toISOString(),
    };
    const existing = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations?org_id=eq.${org_id}&provider=eq.${provider}&select=id`, { headers: sbHeadersGlobal() });
    if (Array.isArray(existing) && existing.length > 0) {
      await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations?org_id=eq.${org_id}&provider=eq.${provider}`, {
        method: "PATCH", headers: { ...sbHeadersGlobal(), Prefer: "return=minimal" }, body: JSON.stringify(payload),
      });
    } else {
      await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations`, {
        method: "POST", headers: { ...sbHeadersGlobal(), Prefer: "return=minimal" }, body: JSON.stringify(payload),
      });
    }
    return res.json({ success: true, message: `${provider} API key saved` });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

app.get("/integrations/apikey/status", async (req, res) => {
  try {
    const orgId = String(req.query.org_id || "");
    const provider = String(req.query.provider || "");
    if (!orgId || !provider) return res.status(400).json({ error: "Missing org_id or provider" });
    const rows = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_integrations?org_id=eq.${orgId}&provider=eq.${provider}&select=status,email,connected_at`, { headers: sbHeadersGlobal() });
    if (!Array.isArray(rows) || rows.length === 0) return res.json({ connected: false });
    return res.json({ connected: rows[0].status === "active", label: rows[0].email, connected_at: rows[0].connected_at });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// Business Case Generator endpoint
// ---------------------------------------------------------------------------
app.post("/api/generate-business-case", express.json({ limit: "5mb" }), async (req, res) => {
  try {
    const { generateBusinessCase } = require("./generate_business_case");
    const config = req.body;
    if (!config?.clientName) return res.status(400).json({ error: "Missing clientName" });

    const { buffer, summary } = await generateBusinessCase(config);
    const fileName = `Business_Case_${config.clientName.replace(/\s+/g, "_")}_${Date.now()}.pptx`;

    // Upload to Supabase Storage
    const { createClient } = require("@supabase/supabase-js");
    const sb = createClient(SB_URL_GLOBAL, SB_KEY_GLOBAL);
    const { error: uploadError } = await sb.storage
      .from("business-cases")
      .upload(fileName, buffer, { contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", upsert: true });

    let downloadUrl;
    if (uploadError) {
      // Fallback: save to /tmp and serve via bridge
      const tmpPath = `/tmp/${fileName}`;
      require("fs").writeFileSync(tmpPath, buffer);
      downloadUrl = `${BRIDGE_PUBLIC_URL}/api/download/${fileName}`;
      console.warn("[business-case] Storage upload failed, using tmp:", uploadError.message);
    } else {
      const { data: urlData } = sb.storage.from("business-cases").getPublicUrl(fileName);
      downloadUrl = urlData?.publicUrl || `${SB_URL_GLOBAL}/storage/v1/object/public/business-cases/${fileName}`;
    }

    console.log(`[business-case] Generated for ${config.clientName}: ${downloadUrl}`);
    return res.json({ success: true, url: downloadUrl, fileName, summary });
  } catch (e) {
    console.error("[business-case] error:", e);
    return res.status(500).json({ error: e.message });
  }
});

// Serve tmp files for fallback
app.get("/api/download/:filename", (req, res) => {
  const filePath = `/tmp/${req.params.filename}`;
  if (!require("fs").existsSync(filePath)) return res.status(404).send("File not found");
  res.setHeader("Content-Disposition", `attachment; filename="${req.params.filename}"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  res.sendFile(filePath);
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
  console.log(`[callback] Agent ${agent_name} completed task ${task_id} for ${whatsapp_number || 'auto-resolve'}`);

  // Resolve whatsapp_number: try provided → resolve from task's org → resolve from agent name
  let waNumber = whatsapp_number;
  let resolvedOrgId = null;

  if (!waNumber) {
    try {
      // Strategy 1: If we have task_id, get org_id from the task itself (most reliable)
      if (task_id) {
        const taskRows = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agent_tasks_v2?id=eq.${task_id}&select=org_id&limit=1`, { headers: sbHeadersGlobal() });
        if (Array.isArray(taskRows) && taskRows.length > 0) {
          resolvedOrgId = taskRows[0].org_id;
        }
      }

      // Strategy 2: Fallback to agent name lookup
      if (!resolvedOrgId && agent_name) {
        const agents = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/agents?name=ilike.*${encodeURIComponent(agent_name || '')}*&select=org_id&limit=1`, { headers: sbHeadersGlobal() });
        if (Array.isArray(agents) && agents.length > 0) {
          resolvedOrgId = agents[0].org_id;
        } else {
          console.warn(`[callback] Agent name lookup failed for "${agent_name}" — no matching agent found`);
        }
      }

      // Resolve WhatsApp number from org's chief session (most recent first)
      if (resolvedOrgId) {
        const sessions = await sbFetchGlobal(`${SB_URL_GLOBAL}/rest/v1/chief_sessions?org_id=eq.${resolvedOrgId}&select=whatsapp_number&order=updated_at.desc&limit=1`, { headers: sbHeadersGlobal() });
        if (Array.isArray(sessions) && sessions.length > 0 && sessions[0].whatsapp_number) {
          waNumber = sessions[0].whatsapp_number;
          console.log(`[callback] Auto-resolved whatsapp_number=${waNumber} for org=${resolvedOrgId}`);
        } else {
          console.warn(`[callback] No chief_sessions with whatsapp_number for org=${resolvedOrgId}`);
        }
      }
    } catch (e) {
      console.error('[callback] Failed to resolve whatsapp_number:', e.message);
    }
  }

  if (!waNumber) {
    console.error(`[callback] FAILED: No whatsapp_number for agent "${agent_name}" task=${task_id} org=${resolvedOrgId} — notification lost`);
    return res.json({ success: false, reason: "no_whatsapp_number", agent_name, task_id, org_id: resolvedOrgId });
  }

  try {
    let message;
    if (error) {
      message = `❌ *${agent_name}* tuvo un error con la tarea:\n${error}`;
    } else {
      const resultText = typeof result === "string" ? result : (result?.text || result?.reply || result?.message || result?.summary || JSON.stringify(result));
      // Clean up any residual JSON-like formatting for WhatsApp
      const cleanText = resultText.replace(/^\{[\s\S]*\}$/, (match) => {
        try {
          const obj = JSON.parse(match);
          return obj.text || obj.reply || obj.message || obj.summary || match;
        } catch { return match; }
      });
      message = `✅ *${agent_name}* terminó la tarea:\n\n${cleanText}`;
    }

    // Split into multiple WhatsApp messages if needed, each ≤1600 chars
    // Splits at paragraph breaks, then newlines, then spaces — never mid-word
    const toNumber = waNumber.startsWith('whatsapp:') ? waNumber : `whatsapp:+${waNumber.replace(/^\+/, '')}`;
    const chunks = splitMessage(message);

    // Add part indicators if multi-message (e.g. "[1/3]")
    const labeled = chunks.length > 1
      ? chunks.map((c, i) => `${c}\n\n_[${i + 1}/${chunks.length}]_`)
      : chunks;

    for (const chunk of labeled) {
      await twilioClient.messages.create({
        from: TWILIO_WHATSAPP_NUMBER,
        to: toNumber,
        body: chunk,
      });
      if (labeled.length > 1) await new Promise(r => setTimeout(r, 800));
    }
    console.log(`[callback] Sent result to ${toNumber} (${labeled.length} msg(s), ${message.length} chars total)`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[callback] Error sending to ${waNumber}:`, err.message);
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
    // --- GATEWAY: Check if human is replying to an agent (no LLM needed) ---
    if (SB_KEY) {
      try {
        // Check conversation_control: is an agent waiting for a reply?
        const ctrlRes = await fetch(`${SB_URL}/rest/v1/conversation_control?whatsapp_number=eq.${WaId || From.replace('whatsapp:+', '')}&select=active_agent_id,active_message_id`, {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY },
        });
        const ctrl = await ctrlRes.json();
        const activeCtrl = Array.isArray(ctrl) && ctrl[0] ? ctrl[0] : null;

        // Also check @agent mentions for explicit routing
        const mentionMatch = Body.match(/^@(\w+)\s/);

        if (activeCtrl?.active_agent_id || mentionMatch) {
          let targetAgentId = activeCtrl?.active_agent_id;
          let targetName = null;

          // @mention overrides conversation_control
          if (mentionMatch) {
            const agRes = await fetch(`${SB_URL}/rest/v1/agents?name=ilike.*${mentionMatch[1]}*&status=neq.destroyed&select=id,name&limit=1`, {
              headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY },
            });
            const ags = await agRes.json();
            if (Array.isArray(ags) && ags[0]) {
              targetAgentId = ags[0].id;
              targetName = ags[0].name;
            }
          }

          if (targetAgentId) {
            // Route reply directly to agent's inbox (no LLM!)
            const replyText = mentionMatch ? Body.replace(mentionMatch[0], '').trim() : Body;

            // Resolve org_id: from conversation_control, or from the agent record
            let routeOrgId = (Array.isArray(ctrl) && ctrl[0]) ? ctrl[0].org_id : null;
            if (!routeOrgId) {
              const orgRes = await fetch(`${SB_URL}/rest/v1/agents?id=eq.${targetAgentId}&select=org_id`, {
                headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY },
              });
              const orgData = await orgRes.json();
              routeOrgId = Array.isArray(orgData) && orgData[0] ? orgData[0].org_id : null;
            }

            if (!routeOrgId) {
              console.error("[gateway] Cannot route: no org_id found for agent", targetAgentId);
            }

            // Write to agent_messages as human reply
            await fetch(`${SB_URL}/rest/v1/agent_messages`, {
              method: "POST",
              headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
              body: JSON.stringify({
                org_id: routeOrgId,
                to_agent_id: targetAgentId,
                role: "user",
                content: replyText,
                metadata: { source: "whatsapp_reply", from_human: true },
              }),
            });

            // Update outbound message as replied
            if (activeCtrl?.active_message_id) {
              await fetch(`${SB_URL}/rest/v1/outbound_human_messages?id=eq.${activeCtrl.active_message_id}`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
                body: JSON.stringify({ status: "replied", reply: replyText, replied_at: new Date().toISOString() }),
              });
            }

            // Clear conversation control
            await fetch(`${SB_URL}/rest/v1/conversation_control?whatsapp_number=eq.${WaId || From.replace('whatsapp:+', '')}`, {
              method: "PATCH",
              headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
              body: JSON.stringify({ active_agent_id: null, active_message_id: null, updated_at: new Date().toISOString() }),
            });

            // Get agent name for confirmation
            if (!targetName) {
              const nRes = await fetch(`${SB_URL}/rest/v1/agents?id=eq.${targetAgentId}&select=name`, {
                headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY },
              });
              const ns = await nRes.json();
              targetName = Array.isArray(ns) && ns[0] ? ns[0].name : "Agent";
            }

            // Confirm to human (no LLM)
            await twilioClient.messages.create({
              from: TWILIO_WHATSAPP_NUMBER, to: From,
              body: `✅ Reply sent to ${targetName}.`,
            });
            console.log(`[gateway] Routed human reply to ${targetName} (${targetAgentId.substring(0, 8)}) — no LLM`);
            return;
          }
        }
      } catch (gwErr) {
        console.error("[gateway] Conversation routing error:", gwErr.message);
        // Fall through to Chief if routing fails
      }
    }

    // --- Check message length (WhatsApp limit is 4096, but with context injection it grows) ---
    const WA_CHAR_LIMIT = 4096;
    if (Body.length > WA_CHAR_LIMIT) {
      console.warn(`[in] Message too long: ${Body.length} chars (limit ${WA_CHAR_LIMIT})`);
      await twilioClient.messages.create({
        from: TWILIO_WHATSAPP_NUMBER,
        to: From,
        body: `⚠️ Your message is too long (${Body.length} chars, max ${WA_CHAR_LIMIT}).\n\nTip: Split it into 2-3 shorter messages, or send the first part now and I'll ask for more details.\n\nAlternatively, use the dashboard to configure complex projects.`,
      });
      return;
    }

    // Team context injection REMOVED — Chief was mixing project info into
    // unrelated responses. Chief can use ver_equipo/standup_equipo tools
    // when the user explicitly asks for team status.
    let messageToSend = Body;

    // Ensure connected
    if (!ocClient.isReady()) {
      console.log("[oc] Not connected, reconnecting...");
      await ocClient.connect();
    }

    // Send a "thinking" message immediately so user knows we're working
    const thinkingMessages = [
      "Thinking...", "Working on it...", "Processing...", "On it...",
      "Let me check...", "Looking into it...", "One moment...", "Analyzing...",
      "Gathering context...", "Running the numbers...",
    ];
    const thinkingMsg = thinkingMessages[Math.floor(Math.random() * thinkingMessages.length)];
    const thinkingTimer = setTimeout(async () => {
      try {
        await twilioClient.messages.create({ from: TWILIO_WHATSAPP_NUMBER, to: From, body: thinkingMsg });
        console.log(`[out] Sent thinking message to ${From}: ${thinkingMsg}`);
      } catch {}
    }, 8000); // Only send if response takes >8s

    const aiResponse = await ocClient.sendMessage(messageToSend, WaId || From);
    clearTimeout(thinkingTimer);

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
      const isTimeout = err.message?.includes("timeout") || err.message?.includes("Timeout");
      const errorMsg = isTimeout
        ? `⏱️ Response timed out — the request was too complex for a single message.\n\nTry:\n• Splitting into smaller requests\n• Being more specific\n• Using "assign task to [agent]" for long operations`
        : `⚠️ Something went wrong processing your message.\n\nError: ${(err.message || "Unknown").substring(0, 100)}\n\nTry again in a moment.`;
      await twilioClient.messages.create({
        from: TWILIO_WHATSAPP_NUMBER,
        to: From,
        body: errorMsg,
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
  console.log(`  Gateway Worker: polling outbound_human_messages every 10s`);
});

// =============================================================================
// MESSAGE FORMATTER — Translates + formats agent messages via Haiku (~$0.001/msg)
// =============================================================================
const _FormatterSdk = require("@anthropic-ai/sdk");
const formatterClient = new (_FormatterSdk.default || _FormatterSdk)({ apiKey: process.env.ANTHROPIC_API_KEY });

async function formatAgentMessage(rawMessage, agentName, priority, language = "es") {
  let msg = rawMessage || "";

  // Quick cleanup: remove duplicate [AgentName] prefixes
  const namePattern = new RegExp(`\\[${agentName}\\]\\s*`, 'gi');
  msg = msg.replace(namePattern, '').trim();

  // Flag permission issues — these indicate a real problem that needs fixing
  // Don't suppress them, but reformat so the user understands the context
  if (/\/approve\s+[a-f0-9]+/i.test(msg) || /exec\s+(approval|policy|blocked)/i.test(msg) || /shell\s+(blocked|command\s+approval)/i.test(msg)) {
    return `⚠️ *${agentName} — Permission Issue:*\nThe agent is reporting shell commands are blocked. This should not happen — they have bypass permissions. If this persists, ask your admin to check the agent runtime configuration.`;
  }

  // Try LLM formatting (Haiku — fast, cheap)
  try {
    const langName = { es: "Spanish", en: "English", pt: "Portuguese", fr: "French" }[language] || "Spanish";
    const res = await formatterClient.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: `Rewrite this agent message for a non-technical CEO reading on WhatsApp. Language: ${langName}. Remove technical jargon (/approve commands, UUIDs, exec policies, iteration numbers). Keep the FULL content — do NOT cut information, questions, or lists. If the message has numbered questions or parameters, keep ALL of them. Use one emoji at the start. Format cleanly for WhatsApp.

Agent: ${agentName}
Priority: ${priority || "normal"}
Message: ${msg.substring(0, 2000)}

Reply with ONLY the formatted message, nothing else.` }],
    });
    const formatted = res.content?.[0]?.text?.trim();
    if (formatted && formatted.length > 5) {
      return `*${agentName}:*\n${formatted}`;
    }
  } catch (e) {
    console.error("[formatter] Haiku failed, using fallback:", e.message);
  }

  // Fallback: basic regex cleanup
  msg = msg.replace(/\/approve\s+[a-f0-9]+\s+allow-\w+/gi, '').trim();
  msg = msg.replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/g, m => m.substring(0, 8));
  msg = msg.replace(/\s{2,}/g, ' ').trim();

  let emoji = '💬';
  if (priority === 'urgent') emoji = '🚨';
  else if (/block|stuck|fail|error/i.test(msg)) emoji = '⚠️';
  else if (/complet|done|finish|success/i.test(msg)) emoji = '✅';
  else if (/question|help|need/i.test(msg)) emoji = '❓';

  return `${emoji} *${agentName}:*\n${msg}`;
}

// GATEWAY WORKER — Polls agent→human messages and sends via WhatsApp (NO LLM)
// =============================================================================
const GW_POLL_INTERVAL = 10_000; // 10 seconds
const GW_NOTIFICATION_BUFFER = new Map(); // agent_id → { messages: [], timer }
const GW_BUFFER_FLUSH_MS = 60_000; // flush after 1 min of quiet
const GW_BUFFER_MAX = 5; // force flush at 5 messages

async function gatewayWorkerTick() {
  if (!SB_KEY) return;
  try {
    // 1. Fetch pending outbound messages
    const res = await fetch(`${SB_URL}/rest/v1/outbound_human_messages?status=eq.pending&order=created_at.asc&limit=10&select=id,org_id,from_agent_id,message,priority,context`, {
      headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY },
    });
    const messages = await res.json();
    if (!Array.isArray(messages) || messages.length === 0) return;

    // 2. Load agent names
    const agentIds = [...new Set(messages.map(m => m.from_agent_id))];
    const agentRes = await fetch(`${SB_URL}/rest/v1/agents?id=in.(${agentIds.join(",")})&select=id,name`, {
      headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY },
    });
    const agents = await agentRes.json();
    const nameMap = {};
    if (Array.isArray(agents)) agents.forEach(a => { nameMap[a.id] = a.name; });

    // 3. Process each message
    for (const msg of messages) {
      const agentName = nameMap[msg.from_agent_id] || "Agent";

      if (msg.priority === "urgent") {
        // Urgent: send immediately
        await sendOutboundMessage(msg, agentName);
      } else {
        // Normal: buffer for digest
        bufferOutboundMessage(msg, agentName);
      }

      // Mark as sent
      await fetch(`${SB_URL}/rest/v1/outbound_human_messages?id=eq.${msg.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ status: "sent" }),
      });
    }
  } catch (err) {
    console.error("[gateway-worker] Error:", err.message);
  }
}

async function sendOutboundMessage(msg, agentName) {
  try {
    // Find WhatsApp number + language preference for this org
    const sessRes = await fetch(`${SB_URL}/rest/v1/chief_sessions?org_id=eq.${msg.org_id}&select=whatsapp_number,language&limit=1`, {
      headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY },
    });
    const sessions = await sessRes.json();
    const waNum = Array.isArray(sessions) && sessions[0] ? sessions[0].whatsapp_number : null;
    const language = (Array.isArray(sessions) && sessions[0]?.language) || "es";
    if (!waNum) return;

    const formatted = await formatAgentMessage(msg.message, agentName, msg.priority, language);
    if (!formatted) return; // Message was filtered (permission noise)
    const chunks = splitMessage(formatted);
    for (const chunk of chunks) {
      await twilioClient.messages.create({ from: TWILIO_WHATSAPP_NUMBER, to: `whatsapp:+${waNum}`, body: chunk });
    }

    // Set conversation control so reply routes back to this agent
    await fetch(`${SB_URL}/rest/v1/conversation_control`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        org_id: msg.org_id, whatsapp_number: waNum,
        active_agent_id: msg.from_agent_id, active_message_id: msg.id,
        context: msg.context || {}, updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }),
    });

    console.log(`[gateway-worker] Sent [${agentName}] message to ${waNum}`);
  } catch (err) {
    console.error(`[gateway-worker] Send failed:`, err.message);
  }
}

function bufferOutboundMessage(msg, agentName) {
  const key = msg.org_id;
  if (!GW_NOTIFICATION_BUFFER.has(key)) {
    GW_NOTIFICATION_BUFFER.set(key, { messages: [], timer: null });
  }
  const buf = GW_NOTIFICATION_BUFFER.get(key);
  buf.messages.push({ agentName, message: msg.message, id: msg.id, from_agent_id: msg.from_agent_id, org_id: msg.org_id });

  // Flush after quiet period (debounce)
  clearTimeout(buf.timer);
  buf.timer = setTimeout(() => flushBuffer(key), GW_BUFFER_FLUSH_MS);

  // Force flush if buffer exceeds max
  if (buf.messages.length >= GW_BUFFER_MAX) {
    clearTimeout(buf.timer);
    flushBuffer(key);
  }
}

async function flushBuffer(orgId) {
  const buf = GW_NOTIFICATION_BUFFER.get(orgId);
  if (!buf || buf.messages.length === 0) return;

  const messages = [...buf.messages];
  buf.messages = [];

  // Load user language
  const sessRes2 = await fetch(`${SB_URL}/rest/v1/chief_sessions?org_id=eq.${orgId}&select=language&limit=1`, {
    headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY },
  }).catch(() => ({ json: () => [] }));
  const sess2 = await sessRes2.json();
  const lang = (Array.isArray(sess2) && sess2[0]?.language) || "es";

  // Format as digest
  let digest;
  if (messages.length === 1) {
    digest = await formatAgentMessage(messages[0].message, messages[0].agentName, null, lang);
  } else {
    const parts = await Promise.all(messages.map(m => formatAgentMessage(m.message.substring(0, 200), m.agentName, null, lang)));
    digest = `📋 *Team Update (${messages.length})*\n\n` + parts.join('\n\n');
  }

  // Set conversation control to last agent who sent
  const lastMsg = messages[messages.length - 1];
  try {
    await sendOutboundMessage({
      org_id: lastMsg.org_id,
      from_agent_id: lastMsg.from_agent_id,
      message: digest,
      context: {},
    }, lastMsg.agentName);
  } catch (err) {
    console.error("[gateway-worker] Flush failed:", err.message);
  }
}

// Start polling
setInterval(gatewayWorkerTick, GW_POLL_INTERVAL);

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
  CLAUDE_MODEL = "claude-opus-4-6",
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
    SYSTEM_PROMPT = `# Chief — AI Workforce Advisor & Orchestrator

## Identity
You are **Chief**, the strategic AI advisor and workforce orchestrator by Laiky AI. You're not a pass-through — you're the user's CTO-level partner who manages a team of AI agents that work like real employees.

## Language
- Match the user's language. If they write in English, respond in English. If Spanish, respond in Spanish.

## Your Role: Strategic Advisor
You don't just relay commands — you THINK, RECOMMEND, and OPTIMIZE:
- **Recommend prompts**: When user wants to start a project, suggest a detailed prompt with phases, roles, and success criteria. Explain WHY.
- **Suggest task assignments**: Based on agent capabilities, recommend who should do what. "Sofi should handle this because she has design+research caps."
- **Proactive insights**: After reviewing team status, suggest next steps. "Oscar found 3 P0 bugs — I recommend pausing new features until Juanse fixes them."
- **Challenge bad ideas**: If user asks something that won't work, say so. "That won't work because Nando doesn't have code capability. I suggest assigning to Juanse instead."
- **Cost awareness**: Estimate project costs. "This 4-phase project will cost ~$5-8 in LLM tokens across 3 agents."

## Agent Onboarding (CRITICAL — make agents READY from day 1)
When user wants to create a new agent, run this discovery flow. The goal is that the agent has EVERYTHING it needs to work autonomously from the moment it's created. No blockers, no missing tokens, no "I need access to X".

### Step 1: Understand the mission
Ask: "What will this agent DO? What's their day-to-day job?"
Listen for signals: code, design, testing, sales, research, content, data, etc.

### Step 2: Discover requirements based on mission
Based on their answer, ask TARGETED follow-up questions (ONE at a time):

**If the agent will write/deploy code:**
- "What repo will they work on? I need the GitHub URL."
- "Where does it deploy? Vercel, Railway, AWS, Netlify?"
- "Does it use a database? Supabase, PostgreSQL, Firebase?"
- "I'll need these tokens to give them access:" → list exactly which tokens (GITHUB_TOKEN, VERCEL_TOKEN, etc.)
- Use web_search_firecrawl to find docs on where to get each token. Example: search "how to create Vercel personal access token" and give the user the direct link.

**If the agent will do design/UX:**
- "Will they need to take screenshots of live sites? I'll enable screenshot_page (Firecrawl)."
- "Do they need to browse and interact with pages? I'll enable Playwright browser."
- "What's the production URL they'll audit?"
- "Do they need access to a design system or Figma?"

**If the agent will do QA/testing:**
- "What's the URL they'll test?"
- "Do they need to interact with the app (click buttons, fill forms)? I'll enable Playwright."
- "Do they need to run automated tests? I'll enable Bash + test runner."

**If the agent will do sales/outreach:**
- "Do they need LinkedIn access? I'll need a Unipile connection."
- "Do they need to send emails? I'll need Gmail/Outlook integration."
- "What CRM do they use? Salesforce, HubSpot?"

**If the agent will do research:**
- "I'll enable web search (Firecrawl) + web scraping + Playwright browser. Any specific data sources they need?"

### Step 3: Collect tokens/access
For each required token:
1. Explain WHAT it's for in simple terms
2. Use web_search_firecrawl to find the exact page where the user can create/find the token
3. Give them the direct link: "Go to https://vercel.com/account/tokens to create a Vercel token"
4. Store each token securely as an env var for the agent

### Step 4: Configure and confirm
Show the FULL config before creating:
"I'll create **[Name]** with:
- 🧠 Model: Sonnet (fast + capable)
- 🔧 Capabilities: [list with explanations]
- 🔑 Access: GitHub (repo X), Vercel (deploy), Supabase (DB)
- 👥 Team: product, reports to [lead]
- 💰 Estimated cost: ~$X/day when busy

They'll be able to: [list of concrete things]
They WON'T be able to: [list of limitations]

Ready to create?"

### Step 5: Post-creation verification
After creating, suggest a simple test task:
"Agent created! I'll assign them a quick test: [simple task relevant to their role]. This verifies all their tools work. I'll report results in 2 minutes."

### Capability → Tools Reference
**Built-in (always available based on role):**
- code → Read, Write, Edit, MultiEdit, Grep, Glob, deploy_frontend, deploy_edge_function, push_db_migration
- design → Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
- research → WebSearch, WebFetch, scrape_url, screenshot_page, web_search_firecrawl
- browser → Playwright MCP (navigate, click, fill forms, screenshot)
- outreach → LinkedIn/email tools via Chief Outreach platform
- writing → Read, Write, WebSearch, WebFetch, Glob
- ops → Bash (system commands, npm, git), deploy tools

**Integration capabilities (toggleable per agent via cambiar_config_agente):**
Google (requires conectar_gmail — one OAuth covers all Google tools):
- inbox → list_unread_emails, read_email, search_emails, summarize_inbox, mark_as_read, archive_email, draft_reply
- calendar → list_calendar_events, create_calendar_event, find_free_slots
- drive → drive_search_files, drive_read_file, drive_list_recent, drive_create_document
- sheets → sheets_read, sheets_write, sheets_create
- contacts → contacts_search, contacts_list
- presentations → create_presentation, add_slides_to_presentation (Google Slides — crea decks completos con layout, texto, notas)

External services:
- linkedin → linkedin_view_profile, linkedin_send_connection, linkedin_send_message, linkedin_get_chats, linkedin_search_profile (Unipile)
- apollo → apollo_search_people, apollo_enrich_person, apollo_search_companies
- salesforce → sf_search_accounts, sf_push_lead, sf_sync_account

**IMPORTANT:** When user says "dale acceso a X a [agente]", use cambiar_config_agente to ADD the capability. The agent's tools auto-rebuild within 1-3 minutes. Don't add capabilities the agent doesn't need.

**Integration auth requirements:**
- inbox, calendar, drive, sheets, contacts → ALL use Google OAuth (single conectar_gmail — one connection, all Google tools)
- linkedin → Unipile account (auto-detected from org admin's LinkedIn connection)
- apollo → APOLLO_API_KEY env var (pre-configured, always available)
- salesforce → Salesforce OAuth (conectar_salesforce tool)

## Agent Onboarding — ALWAYS follow this when creating a new agent:
When the user says "crea un agente" or "nuevo agente":

1. Ask for the NAME: "¿Cómo se llama?"
2. Ask for the ROLE using templates:
   "¿Qué rol? Templates disponibles:
   1️⃣ Desarrollador — code, deploys, bugs, reviews
   2️⃣ Diseñador UX — auditorías, specs, research visual
   3️⃣ QA / Tester — testing funcional, accesibilidad, bugs
   4️⃣ Ventas / BDR — prospectos, outreach, CRM
   5️⃣ Asistente Personal — correos, calendario, briefings
   6️⃣ Marketing — contenido, SEO, redes sociales
   7️⃣ Investigador — research, reportes, análisis
   8️⃣ Project Manager — seguimiento, reportes, coordinación
   9️⃣ Custom — descríbelo tú"
3. Based on template, suggest MODEL + CAPABILITIES + INTEGRATIONS:
   - Developer → Sonnet, [code,ops,data], [firecrawl]
   - UX → Sonnet, [design,research,writing], [firecrawl]
   - QA → Haiku, [research,outreach,browser], [firecrawl]
   - Sales → Sonnet, [outreach,research,writing,browser], [linkedin,apollo,salesforce]
   - Assistant → Haiku, [inbox,calendar,drive,contacts,research,writing], []
   - Marketing → Sonnet, [writing,research,browser], [firecrawl,linkedin]
   - Researcher → Sonnet, [research,writing,browser], [firecrawl,apollo]
   - PM → Haiku, [research,writing], [calendar,sheets]
4. Ask for PERSONALITY:
   "¿Personalidad?
   1. Profesional y directa
   2. Amigable y proactiva
   3. Formal y detallista
   4. Técnica y concisa
   5. Custom — descríbela"
5. Ask for SPECIAL RULES: "¿Alguna regla especial? (ej: 'nunca enviar correos sin aprobación', 'reportar en inglés')"
6. Show FULL SUMMARY and ask for approval before creating.
7. After creation, run a quick test task to verify tools work.

### Universal deploy: ANY provider
Agents with code+ops can deploy to ANY provider via Bash + npx:
- Vercel: npx vercel --prod (built-in deploy_frontend tool)
- Netlify: npx netlify-cli deploy --prod
- Railway: railway CLI via API
- AWS: npx aws-cdk deploy or aws CLI
- Firebase: npx firebase deploy
- Fly.io: flyctl deploy
- Any other: search with web_search_firecrawl for "[provider] CLI deploy command"

When onboarding, DON'T assume any specific stack. Ask what they use, then:
1. Search with web_search_firecrawl for "[provider] create API token" or "[provider] CLI setup"
2. Give the user the exact URL to create their token
3. Explain what the token is for in simple terms
4. Store it as an env var that the agent can use via Bash

The agent can install ANY CLI tool via npx or npm at runtime — they have full Bash access. Chief's job is to figure out WHAT they need and help the user provide the access tokens.

## Skill-Based Routing (CRITICAL — YOUR #1 RULE)
**You are an ORCHESTRATOR, not a worker. You NEVER do work yourself — you route to agents.**

When the user asks you to DO something (create, generate, analyze, search, send, build, investigate, etc.):
1. Call resolver_skill with what the user wants
2. If it finds a match, call delegar_tarea to the agent it recommends, with this instruction format:
   "Ejecuta el skill '[skill name]' usando call_skill con function_name='[from skill definition]'. Pregunta al usuario los datos que necesites antes de ejecutar. [user's original request]"
3. If no match, use delegar_tarea as a general task to the most appropriate agent, or suggest creating a skill with crear_skill

**NEVER:**
- Do research, generate content, read emails, send emails, or create presentations yourself
- Decompose a skill into sub-steps — delegate the WHOLE thing to the agent
- Skip resolver_skill when the user asks to DO something

**ONLY skip resolver_skill for:** greetings, status questions ("qué están haciendo"), config changes, team/project management, connecting integrations.

## Task Delegation Rules (CRITICAL)
**RULE #1: Only delegate tasks that the user EXPLICITLY requests in their LAST message.**
- If the user says "haz un business case para McDonald's" → call resolver_skill → delegate to the matched agent. NOTHING ELSE.
- NEVER look at previous messages to create additional tasks the user didn't ask for.
- NEVER "bundle" old requests with new ones. Each message is a standalone request.
- If you're about to call delegar_tarea more than once for a single user message, STOP and re-read the message. Did the user ask for multiple things? If not, only delegate ONE task.
- Conversation history is for CONTEXT (understanding who the user is, what they've done before), NOT for generating new tasks.

## Project Planning
When user wants to create a project:
1. DON'T just create it immediately. FIRST suggest a plan:
   - Recommended phases (3-4 max)
   - Who does what in each phase
   - Review cycle: who reviews whom
   - Estimated cost and timeline
   - What tools agents will use
2. THEN create it. Show: "Project created with X phases, Y tasks auto-generated. Agents are claiming now."
3. Monitor and report: "Phase 1 complete — 4/4 tasks done. Sofi found 8 UX issues. Starting Phase 2."

## Backlog Management
Agents report needs via report_to_chief. When user asks "qué necesitan?" or "backlog":
1. Use ver_backlog to show open items
2. Prioritize: blockers first, then decisions, then requests
3. Suggest resolutions: "Juanse needs GITHUB_TOKEN — I can add it now. Oscar needs browser access — should I add 'browser' capability?"
4. After user resolves, use resolver_backlog to close items

## Deploy Capabilities
The agents have FULL deploy access:
- deploy_frontend → Vercel production deploy
- deploy_edge_function → Supabase Edge Functions
- push_db_migration → SQL to production DB
- git push → Code to GitHub
When creating projects that involve code changes, ALWAYS include a deploy step in the last phase.

## Core capabilities
You manage AI agent teams + the Chief Outreach sales platform.
- Create and manage AI agents (with smart defaults — infer everything from role)
- Create projects with phases that auto-decompose into tasks
- Agents auto-claim tasks based on capabilities
- Monitor team status, performance, artifacts, reviews, backlog
- Run sales outreach (cadences, leads, LinkedIn, email)

## Response Rules — CRITICAL, FOLLOW EXACTLY
1. **ANSWER ONLY WHAT WAS ASKED.** This is the #1 rule. If the user asks about Gmail, ONLY talk about Gmail. Do NOT add project status, agent updates, code changes, or ANY other topic. Zero tangents. Zero "by the way". If the user asks one thing, respond to that ONE thing only.
2. **NEVER volunteer information about projects, commits, artifacts, or agent activity unless explicitly asked.** The user will ask "qué están haciendo los agentes?" or "estado del proyecto" when they want that info. If they don't ask, don't share it.
3. NEVER ask for information you can infer.
4. ALWAYS show what you inferred after creating.
5. ONE question at a time max.
6. VALUE FIRST: Create/execute first, let user adjust after.
7. When creating agents: use the onboarding flow above.
8. When creating projects: suggest plan first, then create.
9. Keep WhatsApp responses SHORT. Use emojis for status. Max 2-3 paragraphs. NO walls of text.
10. **NEVER show JSON, code, curly braces, brackets, or technical formatting in responses.** Tool results are for YOU to interpret — the user should see a clean, conversational, human-friendly message. Instead of showing \`{ "success": true, "agent": "Paula" }\`, say "Paula está en eso" or "Listo, le delegué la tarea a Paula". Format data as natural text, bullet points, or simple lists — NEVER as code or JSON.
11. Always need org_id and know who the user is.
12. If context is saved, use it directly — don't re-ask.
13. Confirm before sending external messages or spending money.
14. Never expose tokens or internal IDs.
15. Agents have full bash permissions via bypass. If an agent says they need /approve or shell approval, do NOT relay the /approve command to the user. Instead tell the user: "There's a permission issue with [agent]. The system should handle this automatically — I'll tell the agent to retry." Then message the agent: "You have full bypass permissions. Execute commands directly without waiting for approval."
16. NEVER show /approve IDs or ask the user to run /approve commands. The user cannot run those — they're internal system commands.
17. MULTIPLE projects can be active in parallel. When querying projects, filter by status=active. Ignore completed/paused.
18. ALWAYS propose a plan before creating a project. Use proponer_proyecto first.
19. INTELLIGENT DELEGATION: select the MINIMUM subset of agents required.`;
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
    { name: "ver_calendario", description: "Ve los eventos del calendario del usuario para un rango de fechas. Útil para saber qué reuniones tiene hoy o esta semana.", input_schema: { type: "object", properties: { user_id: { type: "string", description: "user_id del usuario (de la sesión guardada)" }, org_id: { type: "string" }, date_from: { type: "string", description: "YYYY-MM-DD (default: hoy)" }, date_to: { type: "string", description: "YYYY-MM-DD (default: 6 días desde date_from)" } }, required: ["user_id", "org_id"] } },
    { name: "buscar_slots_disponibles", description: "Busca slots de tiempo libre en el calendario del usuario. Útil para proponer horarios de reunión a prospectos o clientes.", input_schema: { type: "object", properties: { user_id: { type: "string" }, org_id: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD (default: hoy)" }, days: { type: "number", description: "Días a analizar (1-7, default: 1)" }, timezone: { type: "string", description: "IANA timezone (default: America/Mexico_City)" }, business_start: { type: "number", description: "Hora inicio jornada (default: 9)" }, business_end: { type: "number", description: "Hora fin jornada (default: 18)" } }, required: ["user_id", "org_id"] } },
    { name: "crear_evento_calendario", description: "Crea un evento en Google Calendar y envía invitaciones por email a los asistentes. Genera Google Meet automáticamente si hay invitados. CONFIRMAR con el usuario antes de crear.", input_schema: { type: "object", properties: { user_id: { type: "string" }, org_id: { type: "string" }, title: { type: "string", description: "Título del evento" }, start_datetime: { type: "string", description: "ISO 8601 (ej: 2025-03-28T10:00:00)" }, end_datetime: { type: "string", description: "ISO 8601 (ej: 2025-03-28T11:00:00)" }, timezone: { type: "string", description: "IANA timezone (default: America/Mexico_City)" }, description: { type: "string", description: "Descripción o agenda del evento" }, location: { type: "string" }, attendees: { type: "array", items: { type: "object", properties: { email: { type: "string" }, name: { type: "string" } }, required: ["email"] }, description: "Lista de invitados. Recibirán invitación por email." } }, required: ["user_id", "org_id", "title", "start_datetime", "end_datetime"] } },
    { name: "sincronizar_calendario", description: "Sincroniza el calendario del usuario con Google Calendar. Útil si no ve reuniones recientes o quiere refrescar datos.", input_schema: { type: "object", properties: { user_id: { type: "string" }, org_id: { type: "string" } }, required: ["user_id", "org_id"] } },
    // --- Agent Platform tools ---
    { name: "gestionar_agentes", description: "Creates, lists, or deletes AI agents. When creating: infer team, tier, capabilities, and parent from the role — DON'T ask the user for these fields. Just create with smart defaults and show what was inferred. The user can adjust after. Roles: sales, ux_designer, developer, cto, cpo, qa, cfo, hr, marketing, custom.", input_schema: { type: "object", properties: { org_id: { type: "string" }, operation: { type: "string", enum: ["create", "list", "get", "delete"] }, name: { type: "string", description: "Agent name" }, role: { type: "string", description: "Role: sales, ux_designer, developer, cto, cpo, qa, cfo, hr, marketing, custom" }, description: { type: "string", description: "What this agent does" }, skills: { type: "array", items: { type: "string" } }, agent_id: { type: "string", description: "Agent ID (for get/delete)" }, model: { type: "string", description: "LLM model (default: claude-sonnet-4-6)" }, tier: { type: "string", description: "worker/team_lead/manager (auto-inferred from role)" }, team: { type: "string", description: "Team name (auto-inferred from role)" }, capabilities: { type: "array", items: { type: "string" }, description: "Capabilities (auto-inferred from role)" }, parent_agent_id: { type: "string", description: "Parent agent UUID (auto-inferred from team lead)" } }, required: ["org_id", "operation"] } },
    { name: "delegar_tarea", description: "Delega una tarea a un agente hijo. Si el agente está desplegado, la envía directamente. Si no, la guarda como pendiente. Usa cuando el usuario dice 'dile a X que haga Y', 'pídele a X que...'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, agent_id: { type: "string", description: "ID del agente destino" }, agent_name: { type: "string", description: "Nombre del agente (alternativa a agent_id, búsqueda por nombre)" }, instruction: { type: "string", description: "La tarea en lenguaje natural" } }, required: ["org_id", "instruction"] } },
    { name: "consultar_agente", description: "Pregunta rápida a un agente sin crear tarea formal. Ideal para '¿qué opina X?', 'pregúntale a X...', 'consulta con el CFO...'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, agent_id: { type: "string", description: "ID del agente" }, agent_name: { type: "string", description: "Nombre del agente (alternativa a agent_id)" }, message: { type: "string", description: "La pregunta o mensaje" } }, required: ["org_id", "message"] } },
    { name: "desplegar_agente", description: "Despliega un agente en Railway como servicio independiente. Crea el servidor, configura variables de entorno, y activa el agente. Usa cuando el usuario quiere que un agente esté operativo: 'despliega al CPO', 'activa a Nando', 'pon a funcionar al agente'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, agent_id: { type: "string", description: "ID del agente a desplegar" }, agent_name: { type: "string", description: "Nombre del agente (alternativa a agent_id)" } }, required: ["org_id"] } },
    { name: "crear_proyecto", description: "Crea un proyecto multi-fase que los agentes ejecutan autónomamente. Las fases se ejecutan secuencialmente, con revisiones opcionales. El proyecto sobrevive reinicios. Usa cuando: 'que Sofi mejore toda la UX', 'proyecto grande entre X y Y', 'quiero que hagan esto por fases'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, name: { type: "string", description: "Nombre del proyecto" }, description: { type: "string" }, phases: { type: "array", items: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, agent_name: { type: "string" }, reviewer_name: { type: "string" } }, required: ["name", "description", "agent_name"] } } }, required: ["org_id", "name", "phases"] } },
    { name: "guardar_memoria", description: "Guarda un hecho, decisión o contexto importante en la memoria de largo plazo. Usa cuando: el usuario menciona algo que debas recordar siempre, se toma una decisión importante, se define un objetivo o prioridad. NO guardes detalles triviales.", input_schema: { type: "object", properties: { org_id: { type: "string" }, content: { type: "string", description: "El hecho o decisión a recordar" }, category: { type: "string", description: "Categoría: proyecto, decision, objetivo, agente, preferencia, contexto" }, importance: { type: "string", enum: ["critical", "high", "normal", "low"], description: "Importancia (critical siempre se carga)" } }, required: ["org_id", "content"] } },
    { name: "ver_tarea_agente", description: "Consulta el estado y resultado de la última tarea de un agente. Usa cuando el usuario pregunta '¿ya terminó X?', '¿qué encontró X?', 'resultado de la tarea de X'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, agent_id: { type: "string" }, agent_name: { type: "string", description: "Nombre del agente" }, task_id: { type: "string", description: "ID específico de tarea (opcional)" } }, required: ["org_id"] } },
    { name: "descomponer_proyecto", description: "Descompone un proyecto grande en tareas pequeñas en el blackboard. Los agentes las reclamarán automáticamente. Usa esto cuando el usuario pide algo complejo que requiere múltiples pasos.", input_schema: { type: "object", properties: { org_id: { type: "string" }, project_name: { type: "string", description: "Nombre del proyecto" }, description: { type: "string", description: "Descripción detallada de lo que se necesita" }, agent_roles: { type: "array", items: { type: "string" }, description: "Roles de los agentes disponibles (ej: ux_designer, cto)" } }, required: ["org_id", "project_name", "description"] } },
    // --- Workforce v2 tools ---
    { name: "ver_equipo", description: "Muestra el estado completo del equipo de agentes: quién está disponible, trabajando o bloqueado, qué tareas tienen, métricas. Usa cuando: '¿qué están haciendo?', '¿quién está libre?', 'estado del equipo', 'dashboard'.", input_schema: { type: "object", properties: { org_id: { type: "string" } }, required: ["org_id"] } },
    { name: "asignar_objetivo", description: "Crea tareas en agent_tasks_v2 que los agentes reclaman automáticamente según sus capabilities. Cada tarea tiene tipo, prioridad y capabilities requeridas. Usa cuando: 'ponlos a trabajar en X', 'que alguien haga Y', 'asigna esta tarea'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, tasks: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, task_type: { type: "string", description: "Tipo: code, design, research, outreach, writing, data, ops, general" }, required_capabilities: { type: "array", items: { type: "string" }, description: "Capabilities necesarias: code, design, research, outreach, writing, data, ops, strategy" }, priority: { type: "number", description: "0=urgente, 50=normal, 100=baja" }, depends_on: { type: "array", items: { type: "string" }, description: "IDs de tareas que deben completarse primero" } }, required: ["title", "task_type"] } } }, required: ["org_id", "tasks"] } },
    { name: "aprobar_checkin", description: "Responde a un check-in pendiente de un agente. Usa cuando el agente reportó progreso y necesita aprobación para continuar, o cuando quieres dar feedback.", input_schema: { type: "object", properties: { org_id: { type: "string" }, checkin_id: { type: "string", description: "ID del check-in (viene en el contexto)" }, action: { type: "string", enum: ["approve", "reject"], description: "Aprobar o rechazar" }, feedback: { type: "string", description: "Feedback o instrucciones para el agente" } }, required: ["org_id", "checkin_id", "action"] } },
    { name: "standup_equipo", description: "Genera un resumen ejecutivo del equipo: tareas completadas, en progreso, bloqueadas, y check-ins pendientes. Formato WhatsApp-friendly. Usa cuando: 'standup', 'resumen', '¿qué hicieron hoy?'.", input_schema: { type: "object", properties: { org_id: { type: "string" } }, required: ["org_id"] } },
    { name: "cambiar_config_agente", description: "Cambia la configuración de un agente: modelo LLM, temperatura, equipo, tier, capabilities. Usa cuando: 'cambia a Sofi a Opus', 'pon a Juanse en el equipo de ventas', 'hazlo team lead'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, agent_name: { type: "string", description: "Nombre del agente" }, updates: { type: "object", properties: { model: { type: "string", description: "claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001" }, temperature: { type: "number" }, team: { type: "string" }, tier: { type: "string", enum: ["worker", "team_lead", "manager"] }, capabilities: { type: "array", items: { type: "string" } } } } }, required: ["org_id", "agent_name", "updates"] } },
    { name: "pausar_reactivar_proyecto", description: "Pausa o reactiva un proyecto existente. Usa cuando: 'continuar proyecto', 'pausa el proyecto X', 'reactiva'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, project_id: { type: "string" }, action: { type: "string", enum: ["pause", "activate"] } }, required: ["org_id", "project_id", "action"] } },
    // --- Memory tools ---
    { name: "ver_artefactos", description: "Ve los artefactos (outputs de trabajo) producidos por los agentes. Filtra por agente, tarea, o proyecto. Usa cuando: 'qué produjo Sofi?', 'muéstrame los entregables', 'resultado de la tarea X'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, agent_name: { type: "string" }, task_id: { type: "string" }, limit: { type: "number" } }, required: ["org_id"] } },
    { name: "ver_conocimiento", description: "Ve el conocimiento acumulado (facts, lessons, decisions) del equipo o de un agente específico. Usa cuando: 'qué ha aprendido Sofi?', 'lecciones del equipo', 'qué saben sobre X'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, agent_name: { type: "string" }, category: { type: "string", enum: ["fact", "preference", "strategy", "lesson", "decision"] } }, required: ["org_id"] } },
    { name: "ver_reviews", description: "Ve el historial de reviews de una tarea. Muestra scores, issues y sugerencias de cada iteración. Usa cuando: 'cómo va el review?', 'qué feedback dieron?', 'historial de revisiones'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, task_id: { type: "string" } }, required: ["org_id", "task_id"] } },
    { name: "ver_backlog", description: "Ve el backlog de items que los agentes necesitan del humano: blockers, decisiones, aprobaciones, feedback. Filtra por status (open/resolved/all). Usa cuando: 'qué necesitan los agentes?', 'backlog', 'pendientes de mi lado', 'qué está bloqueado?'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, status: { type: "string", enum: ["open", "resolved", "all"], description: "Filter by status (default: open)" }, agent_name: { type: "string", description: "Filter by agent name (optional)" } }, required: ["org_id"] } },
    { name: "resolver_backlog", description: "Marca un item del backlog como resuelto con una resolución. Usa cuando el usuario responde a un pedido del backlog: 'listo', 'aprobado', 'ya lo hice', 'resuelto'.", input_schema: { type: "object", properties: { backlog_id: { type: "string", description: "ID del item del backlog" }, resolution: { type: "string", description: "Qué se hizo para resolverlo" } }, required: ["backlog_id", "resolution"] } },
    { name: "ensenar_agente", description: "Inyecta un hecho, lección o decisión en la memoria del equipo o de un agente específico. Usa cuando el usuario dice algo que los agentes deberían recordar siempre: 'recuerda que...', 'los agentes deben saber que...', 'regla del equipo: ...'.", input_schema: { type: "object", properties: { org_id: { type: "string" }, agent_name: { type: "string", description: "Nombre del agente (null = conocimiento del equipo)" }, content: { type: "string", description: "El hecho o lección" }, category: { type: "string", enum: ["fact", "preference", "strategy", "lesson", "decision"] }, importance: { type: "number", description: "0.0-1.0, default 0.7" } }, required: ["org_id", "content"] } },
    { name: "analizar_estructura", description: "Analiza la estructura del equipo y sugiere mejoras: si un equipo tiene 4+ workers sin team lead, sugiere crear uno. Si hay agentes sin equipo, sugiere asignarlos. Usa cuando: 'cómo está organizado el equipo?', 'necesitamos más estructura?', 'analiza la jerarquía'.", input_schema: { type: "object", properties: { org_id: { type: "string" } }, required: ["org_id"] } },
    { name: "configurar_standup", description: "Configura el standup diario automático: timezone, hora, y si está activado. Usa cuando: 'estoy en México', 'mándame el standup a las 8am', 'cambia mi zona horaria', 'desactiva el standup'. Timezones comunes: America/Mexico_City, America/Bogota, America/Buenos_Aires, America/Santiago, America/Lima, Europe/Madrid, US/Eastern, US/Pacific.", input_schema: { type: "object", properties: { whatsapp_number: { type: "string", description: "Número WhatsApp del usuario (sessionKey)" }, timezone: { type: "string", description: "IANA timezone (ej: America/Mexico_City, America/Bogota)" }, standup_hour: { type: "number", description: "Hora local para el standup (0-23, default 9)" }, standup_enabled: { type: "boolean", description: "Activar/desactivar standup diario" } }, required: ["whatsapp_number"] } },
    { name: "configurar_idioma", description: "Configura el idioma para TODOS los mensajes — tanto los de Chief como los de los agentes. Usa cuando: 'habla en español', 'everything in English', 'manda todo en español', 'change language'. Idiomas: es (español), en (English), pt (português).", input_schema: { type: "object", properties: { whatsapp_number: { type: "string", description: "Número WhatsApp del usuario (sessionKey)" }, language: { type: "string", enum: ["es", "en", "pt"], description: "Código de idioma" } }, required: ["whatsapp_number", "language"] } },
    // --- Plan → Approval → Execution flow ---
    { name: "proponer_proyecto", description: "PROPONE un proyecto al usuario sin crearlo aún. Guarda un draft y devuelve un resumen formateado que el usuario debe aprobar. USA ESTA TOOL SIEMPRE antes de crear_proyecto, salvo que el usuario diga explícitamente 'sin plan' o 'hazlo ya'. La proposal debe: (1) listar capabilities necesarias, (2) seleccionar el SUBSET MÍNIMO de agentes (no todos), (3) justificar cada agente, (4) mencionar qué agentes quedan libres para otros proyectos. Varios proyectos pueden correr en paralelo si usan subsets distintos.", input_schema: { type: "object", properties: { org_id: { type: "string" }, whatsapp_number: { type: "string", description: "Número del usuario que propone (para autoría del draft)" }, name: { type: "string", description: "Nombre corto del proyecto" }, description: { type: "string", description: "Descripción del scope" }, capabilities_needed: { type: "array", items: { type: "string" }, description: "Capabilities requeridas: code, design, research, outreach, writing, data, ops, strategy, inbox" }, proposed_agents: { type: "array", items: { type: "object", properties: { name: { type: "string", description: "Nombre del agente (ej: Sofi, Juanse, Paula)" }, role: { type: "string", description: "Rol en este proyecto (ej: 'diseño', 'implementación', 'triage de correos')" }, reason: { type: "string", description: "Por qué este agente (capabilities que aporta)" } }, required: ["name", "role", "reason"] }, description: "Subset MÍNIMO de agentes necesarios. No incluir agentes innecesarios." }, phases: { type: "array", items: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, agent_name: { type: "string" }, reviewer_name: { type: "string" } }, required: ["name", "description", "agent_name"] }, description: "Fases del proyecto (3-4 típicamente)" }, success_criteria: { type: "string", description: "Cómo sabremos que el proyecto terminó" }, estimated_cost_usd: { type: "number", description: "Costo total estimado del proyecto en USD" }, estimated_duration: { type: "string", description: "Duración estimada en lenguaje natural (ej: '2-4 horas', '1 día')" }, reasoning: { type: "string", description: "Justificación general del plan y por qué este approach" }, free_agents: { type: "array", items: { type: "string" }, description: "Agentes que quedan libres para otras cosas" } }, required: ["org_id", "whatsapp_number", "name", "description", "proposed_agents", "phases"] } },
    { name: "aprobar_proyecto", description: "APRUEBA un draft de proyecto y lo crea de verdad. Usa cuando el usuario responde 'sí', 'apruébalo', 'ok', 'hazlo', 'adelante' a una propuesta previa de proponer_proyecto. Requiere el draft_id (lo tienes en contexto del draft pendiente o se busca el más reciente del org).", input_schema: { type: "object", properties: { org_id: { type: "string" }, draft_id: { type: "string", description: "ID del draft a aprobar (opcional — si no se pasa, toma el draft pending más reciente del org)" } }, required: ["org_id"] } },
    { name: "rechazar_proyecto", description: "RECHAZA un draft de proyecto con una razón. Usa cuando el usuario responde 'no', 'cambia X', 'no me gusta', 'mejor que...' a una propuesta previa. Después de rechazar, el usuario probablemente va a querer otra propuesta modificada.", input_schema: { type: "object", properties: { org_id: { type: "string" }, draft_id: { type: "string", description: "ID del draft a rechazar (opcional — si no se pasa, toma el draft pending más reciente)" }, razon: { type: "string", description: "Qué no le gustó al usuario (para poder ajustar)" } }, required: ["org_id"] } },
    { name: "ver_drafts", description: "Lista los drafts de proyecto pendientes de aprobación. Usa cuando: '¿qué propuestas tengo pendientes?', '¿hay drafts?', 'muéstrame los proyectos propuestos'.", input_schema: { type: "object", properties: { org_id: { type: "string" } }, required: ["org_id"] } },
    // --- Integrations (Google / Gmail) ---
    { name: "conectar_gmail", description: "Genera un link para que el usuario conecte su Gmail a los agentes (OAuth). Usa cuando: 'conecta mi gmail', 'quiero que Paula lea mis correos', 'enlaza mi correo'. Devuelve una URL que el usuario abre UNA sola vez para autorizar.", input_schema: { type: "object", properties: { org_id: { type: "string" }, whatsapp_number: { type: "string", description: "Para identificar quién conecta" } }, required: ["org_id"] } },
    { name: "estado_gmail", description: "Consulta si el Gmail del org está conectado a los agentes. Usa cuando: 'está conectado mi gmail?', 'estado de mi correo'. Devuelve email, fecha de conexión, y si el token sigue válido.", input_schema: { type: "object", properties: { org_id: { type: "string" } }, required: ["org_id"] } },
    { name: "desconectar_gmail", description: "Desconecta el Gmail del org de los agentes (revoca token). Usa cuando: 'desconecta mi gmail', 'remueve mi correo'.", input_schema: { type: "object", properties: { org_id: { type: "string" } }, required: ["org_id"] } },
    { name: "resolver_skill", description: "ALWAYS call this FIRST when the user asks you to DO something that an agent might know how to do (business case, presentation, research, prospecting, etc.). Searches the skill registry and finds which agent has the right skill. Returns: agent name, skill name, skill definition (with required params), and delegation instruction. You then delegate to that agent using delegar_tarea with the full skill context. NEVER try to do skill work yourself — always route through agents.", input_schema: { type: "object", properties: { org_id: { type: "string" }, query: { type: "string", description: "What the user wants to do, in natural language (e.g. 'business case para Falabella', 'buscar prospectos en LinkedIn', 'crear presentacion de ventas')" } }, required: ["org_id", "query"] } },
    // --- Salesforce OAuth ---
    { name: "conectar_salesforce", description: "Genera link para conectar Salesforce CRM. Usa cuando: 'conecta Salesforce', 'enlaza mi CRM'. Devuelve URL OAuth.", input_schema: { type: "object", properties: { org_id: { type: "string" } }, required: ["org_id"] } },
    { name: "estado_salesforce", description: "Consulta si Salesforce está conectado. Usa cuando: 'está conectado Salesforce?', 'estado CRM'.", input_schema: { type: "object", properties: { org_id: { type: "string" } }, required: ["org_id"] } },
    // --- LinkedIn/Unipile ---
    { name: "conectar_linkedin", description: "Genera link para conectar LinkedIn vía Unipile. Usa cuando: 'conecta mi LinkedIn', 'enlaza LinkedIn'.", input_schema: { type: "object", properties: { org_id: { type: "string" } }, required: ["org_id"] } },
    { name: "estado_linkedin", description: "Consulta si LinkedIn está conectado. Usa cuando: 'está conectado LinkedIn?', 'tengo LinkedIn activo?'.", input_schema: { type: "object", properties: { org_id: { type: "string" } }, required: ["org_id"] } },
    // --- Integration overview ---
    { name: "estado_integraciones", description: "Muestra el estado de TODAS las integraciones (Gmail, Calendar, Salesforce, LinkedIn, Apollo, Firecrawl). Usa cuando: 'qué integraciones tengo?', 'estado de integraciones', 'qué está conectado?'.", input_schema: { type: "object", properties: { org_id: { type: "string" } }, required: ["org_id"] } },
    // --- Skill management ---
    { name: "crear_skill", description: "Crea un nuevo skill en el skill_registry. Los skills son habilidades ejecutables que los agentes pueden usar. Usa cuando: 'crea un skill para...', 'quiero que los agentes puedan...', 'nuevo skill que haga...'. DEBES preguntar: (1) Nombre visible, (2) Qué hace (descripción), (3) Qué función llama y con qué parámetros (skill_definition), (4) Categoría. Si el usuario no sabe la definición técnica, ayúdalo a construirla.", input_schema: { type: "object", properties: { org_id: { type: "string" }, name: { type: "string", description: "ID único kebab-case (ej: generar_propuesta)" }, display_name: { type: "string", description: "Nombre visible (ej: Generar Propuesta Comercial)" }, description: { type: "string", description: "Qué hace el skill (1-2 oraciones)" }, category: { type: "string", enum: ["sales", "research", "operations", "marketing", "finance", "support", "system"], description: "Categoría" }, skill_definition: { type: "string", description: "Cómo se ejecuta. Formato: 'Calls {function-name} edge function. Params: param1, param2[], param3 (opcion1|opcion2).'" }, requires_integrations: { type: "array", items: { type: "string" }, description: "Integraciones requeridas: unipile, firecrawl, google_calendar, gmail, salesforce, linkedin, apollo" }, assign_to_agents: { type: "array", items: { type: "string" }, description: "Nombres de agentes a los que asignar este skill automáticamente" } }, required: ["org_id", "display_name", "description", "skill_definition"] } },
    { name: "listar_skills", description: "Lista todos los skills disponibles en el skill_registry. Usa cuando: 'qué skills hay?', 'lista los skills', 'habilidades disponibles'.", input_schema: { type: "object", properties: { org_id: { type: "string" } }, required: ["org_id"] } },
  ];

  // Tools that should run in background (>30s expected)
  const ASYNC_TOOLS = new Set([
    "desplegar_agente", "consultar_agente",
  ]);

  // Format tool results for WhatsApp — human-friendly, no JSON
  function formatToolResultForWhatsApp(name, result) {
    // Extract meaningful text from the result object
    if (typeof result === "string") return result;

    // consultar_agente — show the agent's reply or message
    if (name === "consultar_agente") {
      if (result.reply) return `💬 *${result.agent || "Agente"}*:\n\n${result.reply}`;
      if (result.message) return `⏳ *${result.agent || "Agente"}*: ${result.message}`;
      if (result.error) return `❌ ${result.error}`;
    }

    // desplegar_agente
    if (name === "desplegar_agente") {
      if (result.message) return `🚀 ${result.message}`;
    }

    // buscar_prospectos
    if (name === "buscar_prospectos") {
      if (result.message) return result.message;
      if (result.prospects && Array.isArray(result.prospects)) {
        return `🔍 Encontré ${result.prospects.length} prospectos.`;
      }
    }

    // Generic: try common text fields before falling back to JSON
    if (result.text) return result.text;
    if (result.message) return result.message;
    if (result.reply) return result.reply;
    if (result.result?.text) return result.result.text;
    if (result.result && typeof result.result === "string") return result.result;

    // Last resort — but clean up the JSON to be less code-like
    return JSON.stringify(result, null, 2);
  }

  // Run a tool in background — return immediate ack, send result via WhatsApp callback
  function runToolAsync(name, args, orgId) {
    const startMsg = {
      desplegar_agente: "🚀 Deploying agent in background...",
      consultar_agente: "💬 Consulting agent...",
      reunion_agentes: "🤝 Starting agent meeting...",
      buscar_prospectos: "🔍 Searching prospects...",
      capturar_pantalla: "📸 Capturing screenshot...",
    }[name] || `⚡ Running ${name}...`;

    // Fire and forget — execute in background
    (async () => {
      try {
        const result = await gwExecuteToolSync(name, args);
        const formatted = formatToolResultForWhatsApp(name, result);
        const summary = formatted; // splitMessage handles chunking — don't truncate
        // Only show tool name if we couldn't extract a friendly message
        const isGenericJson = summary.startsWith("{") || summary.startsWith("[");
        const prefix = isGenericJson ? `✅ *${name}* completado:\n\n` : "✅ ";
        await notifyUserByOrg(orgId || args.org_id, `${prefix}${summary}`);
      } catch (err) {
        await notifyUserByOrg(orgId || args.org_id, `❌ Error en *${name}*: ${err.message || "Error desconocido"}`);
      }
    })();

    return { success: true, async: true, message: startMsg + " You'll receive the result via WhatsApp when done." };
  }

  async function gwExecuteTool(name, args) {
    // Route slow tools to async execution
    if (ASYNC_TOOLS.has(name)) {
      return runToolAsync(name, args, args.org_id);
    }
    return gwExecuteToolSync(name, args);
  }

  async function gwExecuteToolSync(name, args) {
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
            // --- Smart defaults: infer from role ---
            const ROLE_DEFAULTS = {
              sales:        { caps: ["outreach", "research", "writing"], team: "sales", tier: "worker" },
              ux_designer:  { caps: ["design", "research", "writing"], team: "product", tier: "worker" },
              developer:    { caps: ["code", "ops", "data"], team: "product", tier: "worker" },
              cto:          { caps: ["code", "ops", "data", "strategy"], team: "product", tier: "team_lead" },
              cpo:          { caps: ["strategy", "research", "design"], team: "product", tier: "team_lead" },
              qa:           { caps: ["research", "outreach"], team: "product", tier: "worker" },
              cfo:          { caps: ["data", "strategy"], team: "ops", tier: "worker" },
              hr:           { caps: ["writing", "outreach"], team: "ops", tier: "worker" },
              marketing:    { caps: ["writing", "research", "outreach"], team: "marketing", tier: "worker" },
              custom:       { caps: [], team: null, tier: "worker" },
            };
            const roleKey = args.role || "custom";
            const defaults = ROLE_DEFAULTS[roleKey] || ROLE_DEFAULTS.custom;

            // Infer team lead as parent if one exists
            let parentAgentId = args.parent_agent_id || null;
            if (!parentAgentId && defaults.team) {
              const leadRows = await sbFetch(`${base}/rest/v1/agents?org_id=eq.${args.org_id}&team=eq.${defaults.team}&tier=in.(team_lead,manager)&status=neq.destroyed&select=id,name&limit=1`, { headers: sbHeaders() });
              if (Array.isArray(leadRows) && leadRows[0]) {
                parentAgentId = leadRows[0].id;
              }
            }

            const soulMd = args.soul_md || `# ${args.name || "Agent"}

## Identity
You are **${args.name || "Agent"}**, an AI agent with the role of **${args.role || "custom"}** in the organization.
${args.description ? `\n${args.description}\n` : ""}

## Language
- English is your primary language.

## Personality
- Professional and direct.
- Efficient — get to the point.
- Proactive — suggest next steps.

## Rules
- Be direct, efficient, and professional.
- Report results concisely.
- You need org_id for data operations.
- Never expose tokens, keys, or internal IDs.`;

            const createBody = {
              org_id: args.org_id,
              name: args.name,
              role: args.role,
              description: args.description,
              soul_md: soulMd,
              skills: args.skills || [],
              // v2 workforce fields with smart defaults
              model: args.model || "claude-sonnet-4-6",
              model_provider: "anthropic",
              tier: args.tier || defaults.tier,
              team: args.team || defaults.team,
              capabilities: args.capabilities || defaults.caps,
              parent_agent_id: parentAgentId,
            };

            const result = await sbFetch(`${base}/functions/v1/manage-agent`, {
              method: "POST", headers: sbHeaders(true),
              body: JSON.stringify(createBody),
            });

            // Enrich response with what was inferred
            if (result?.agent || result?.success) {
              const agent = result.agent || result;
              return {
                ...result,
                inferred_config: {
                  team: createBody.team,
                  tier: createBody.tier,
                  capabilities: createBody.capabilities,
                  parent: parentAgentId ? "auto-assigned to team lead" : "reports to Chief",
                  model: createBody.model,
                },
                message: `Agent "${args.name}" created as ${createBody.tier} in team "${createBody.team || 'none'}". Capabilities: ${createBody.capabilities.join(", ")}. ${parentAgentId ? "Auto-assigned to team lead." : "Reports directly to Chief."} Reply to adjust any settings.`,
              };
            }
            return result;
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
            const p = new URLSearchParams({ id: `eq.${args.agent_id}`, select: "id,name,role,status,capabilities,org_id", limit: "1" });
            const rows = await sbFetch(`${base}/rest/v1/agents?${p}`, { headers: sbHeaders() });
            if (Array.isArray(rows) && rows.length > 0) agent = rows[0];
          } else if (args.agent_name) {
            const p = new URLSearchParams({ org_id: `eq.${args.org_id}`, name: `ilike.%${args.agent_name}%`, status: "neq.destroyed", select: "id,name,role,status,capabilities,org_id", limit: "1" });
            const rows = await sbFetch(`${base}/rest/v1/agents?${p}`, { headers: sbHeaders() });
            if (Array.isArray(rows) && rows.length > 0) agent = rows[0];
          }
          if (!agent) return { success: false, error: "Agente no encontrado. Usa gestionar_agentes list para ver los agentes disponibles." };

          // Infer task_type from agent capabilities for proper routing
          const caps = agent.capabilities || [];
          let taskType = "general";
          if (caps.includes("code")) taskType = "code";
          else if (caps.includes("design") || caps.includes("ux")) taskType = "design";
          else if (caps.includes("research")) taskType = "research";
          else if (caps.includes("qa")) taskType = "qa";
          else if (caps.includes("inbox")) taskType = "inbox";

          // Auto-resolve skills: search the agent's assigned skills for a match with the instruction
          let enrichedInstruction = args.instruction || "";
          try {
            const agentSkills = await sbFetch(`${base}/rest/v1/agent_skills?agent_id=eq.${agent.id}&enabled=eq.true&select=skill_name`, { headers: sbHeaders() });
            if (Array.isArray(agentSkills) && agentSkills.length > 0) {
              const skillNames = agentSkills.map(s => s.skill_name);
              const orFilter = skillNames.map(n => `name.eq.${n}`).join(',');
              const skillDefs = await sbFetch(`${base}/rest/v1/skill_registry?or=(${orFilter})&select=name,display_name,skill_definition`, { headers: sbHeaders() });
              if (Array.isArray(skillDefs) && skillDefs.length > 0) {
                // Find best matching skill by keyword overlap
                const instrLower = enrichedInstruction.toLowerCase();
                const scored = skillDefs.map(s => {
                  const words = `${s.display_name} ${s.name}`.toLowerCase().split(/[\s_-]+/);
                  const matches = words.filter(w => w.length > 3 && instrLower.includes(w)).length;
                  return { ...s, score: matches };
                }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);
                if (scored.length > 0) {
                  const best = scored[0];
                  enrichedInstruction += `\n\nIMPORTANT — USE THIS SKILL: "${best.display_name}" (${best.name}). ${best.skill_definition}\nCall the call_skill tool with the correct function_name and params. Ask the user for any data you need BEFORE executing.`;
                  console.log(`[delegar_tarea] Auto-matched skill "${best.display_name}" for agent ${agent.name}`);
                }
              }
            }
          } catch (e) { console.warn("[delegar_tarea] Skill enrichment error:", e.message); }

          // Create task directly in agent_tasks_v2 with status=claimed + assigned to agent
          // status=claimed + assigned_agent_id set = only the assigned agent sees it in SENSE
          // claim_task_v2 RPC only grabs status='ready' AND assigned_agent_id IS NULL, so no theft
          const taskPayload = {
            org_id: args.org_id,
            title: (args.instruction || "").substring(0, 120),
            description: enrichedInstruction,
            task_type: taskType,
            required_capabilities: caps,
            assigned_agent_id: agent.id,
            assigned_at: new Date().toISOString(),
            status: "claimed",
            priority: args.priority || 10,
            created_by: "chief_delegator",
          };
          const taskRows = await sbFetch(`${base}/rest/v1/agent_tasks_v2`, {
            method: "POST",
            headers: { ...sbHeaders(), Prefer: "return=representation" },
            body: JSON.stringify(taskPayload),
          });
          const taskId = Array.isArray(taskRows) && taskRows.length > 0 ? taskRows[0].id : null;

          if (!taskId) {
            console.error(`[delegar_tarea] Failed to create task in agent_tasks_v2:`, JSON.stringify(taskRows));
            return { success: false, error: "Error creando la tarea. Intenta de nuevo." };
          }

          // Log the instruction as a message to the agent's inbox
          await sbFetch(`${base}/rest/v1/agent_messages`, {
            method: "POST",
            headers: { ...sbHeaders(), Prefer: "return=minimal" },
            body: JSON.stringify({
              org_id: args.org_id,
              to_agent_id: agent.id,
              role: "user",
              content: args.instruction,
              message_type: "task",
              metadata: { task_id: taskId, delegated_by: "chief" },
            }),
          }).catch(e => console.warn("[delegar_tarea] Failed to log message:", e.message));

          console.log(`[delegar_tarea] Created task ${taskId} in agent_tasks_v2, assigned to ${agent.name} (${agent.id})`);

          // Agent's event loop will pick this up in next SENSE cycle (10-60s)
          // On completion, act.ts calls /api/agent-callback which sends WhatsApp notification
          return {
            success: true,
            agent: agent.name,
            task_id: taskId,
            status: "processing",
            message: `Tarea asignada a ${agent.name}. La está procesando y te llegará el resultado por WhatsApp cuando termine.`,
          };
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

          // PRIMARY: A2A Protocol (sync, blocking — agent executes with full tools)
          if (agent.status === "active" && agent.railway_url) {
            console.log(`[consultar_agente] Sending to ${agent.name} via A2A at ${agent.railway_url}`);
            const a2aResult = await a2a.sendA2AMessage(agent.railway_url, args.message, {
              token: SB_KEY,
              fromAgentId: "chief",
              orgId: args.org_id,
              timeoutMs: 300000, // 5 min — research tasks can take time
            });

            if (a2aResult.success && a2aResult.reply) {
              // Log exchange in agent_messages
              await sbFetch(`${base}/rest/v1/agent_messages`, {
                method: "POST",
                headers: { ...sbHeaders(), Prefer: "return=minimal" },
                body: JSON.stringify([
                  { org_id: args.org_id, to_agent_id: agent.id, role: "user", content: args.message, message_type: "chat", metadata: { a2a: true, from: "chief" } },
                  { org_id: args.org_id, from_agent_id: agent.id, role: "assistant", content: a2aResult.reply, message_type: "answer", metadata: { a2a: true } },
                ]),
              }).catch(e => console.warn("[consultar_agente] Failed to log A2A exchange:", e.message));

              return { success: true, agent: agent.name, reply: a2aResult.reply };
            }

            if (a2aResult.success && a2aResult.taskId && !a2aResult.reply) {
              // Still working — poll briefly
              const pollResult = await a2a.pollA2ATask(agent.railway_url, a2aResult.taskId, { token: SB_KEY, maxWaitMs: 120000 });
              if (pollResult.success && pollResult.reply) {
                await sbFetch(`${base}/rest/v1/agent_messages`, {
                  method: "POST",
                  headers: { ...sbHeaders(), Prefer: "return=minimal" },
                  body: JSON.stringify([
                    { org_id: args.org_id, to_agent_id: agent.id, role: "user", content: args.message, message_type: "chat", metadata: { a2a: true, from: "chief" } },
                    { org_id: args.org_id, from_agent_id: agent.id, role: "assistant", content: pollResult.reply, message_type: "answer", metadata: { a2a: true } },
                  ]),
                }).catch(e => console.warn("[consultar_agente] Failed to log A2A exchange:", e.message));
                return { success: true, agent: agent.name, reply: pollResult.reply };
              }
              return { success: true, agent: agent.name, message: `${agent.name} está procesando tu consulta. Te llegará por WhatsApp.` };
            }

            if (!a2aResult.success) {
              console.warn(`[consultar_agente] A2A failed for ${agent.name}:`, a2aResult.error);
            }
          }

          // FALLBACK: agent_messages table (SENSE phase reads this inbox)
          await sbFetch(`${base}/rest/v1/agent_messages`, {
            method: "POST",
            headers: { ...sbHeaders(), Prefer: "return=minimal" },
            body: JSON.stringify({
              org_id: args.org_id,
              to_agent_id: agent.id,
              role: "user",
              content: args.message,
              message_type: "chat",
              metadata: { from: "chief", requires_response: true },
            }),
          });

          console.log(`[consultar_agente] A2A unavailable, fallback to agent_messages for ${agent.name}`);
          return {
            success: true,
            agent: agent.name,
            message: `${agent.name} está procesando. Te llegará por WhatsApp.`,
          };
        }

        case "proponer_proyecto": {
          const {
            org_id, whatsapp_number, name: draftName, description: draftDesc,
            capabilities_needed, proposed_agents, phases: draftPhases,
            success_criteria: draftSuccess, estimated_cost_usd, estimated_duration,
            reasoning, free_agents,
          } = args;

          if (!Array.isArray(proposed_agents) || proposed_agents.length === 0) {
            return { success: false, error: "proposed_agents no puede estar vacío — indica al menos 1 agente." };
          }
          if (!Array.isArray(draftPhases) || draftPhases.length === 0) {
            return { success: false, error: "phases no puede estar vacío — indica al menos 1 fase." };
          }

          // Insert draft
          const draftRows = await sbFetch(`${base}/rest/v1/project_drafts`, {
            method: "POST",
            headers: { ...sbHeaders(), Prefer: "return=representation" },
            body: JSON.stringify({
              org_id,
              created_by: whatsapp_number || null,
              name: draftName,
              description: draftDesc || null,
              workflow_type: "collaboration",
              proposed_agents: proposed_agents,
              capabilities_needed: Array.isArray(capabilities_needed) ? capabilities_needed : [],
              phases: draftPhases,
              success_criteria: draftSuccess || null,
              estimated_cost_usd: typeof estimated_cost_usd === "number" ? estimated_cost_usd : null,
              estimated_duration: estimated_duration || null,
              reasoning: reasoning || null,
              status: "pending",
            }),
          });
          const draft = Array.isArray(draftRows) ? draftRows[0] : draftRows;
          if (!draft?.id) return { success: false, error: "No se pudo guardar el draft." };

          // Build a readable summary for the user
          const agentsList = proposed_agents.map(a => `• *${a.name}* (${a.role}) — ${a.reason}`).join("\n");
          const phasesList = draftPhases.map((p, i) => {
            const reviewer = p.reviewer_name ? ` → review: ${p.reviewer_name}` : "";
            return `${i + 1}. *${p.name}* — ${p.agent_name}${reviewer}`;
          }).join("\n");
          const capsLine = Array.isArray(capabilities_needed) && capabilities_needed.length > 0
            ? `\n🧠 *Capabilities necesarias:* ${capabilities_needed.join(", ")}`
            : "";
          const costLine = typeof estimated_cost_usd === "number"
            ? `\n💰 *Costo estimado:* ~$${estimated_cost_usd.toFixed(2)}`
            : "";
          const durLine = estimated_duration ? `\n⏱️ *Duración estimada:* ${estimated_duration}` : "";
          const freeLine = Array.isArray(free_agents) && free_agents.length > 0
            ? `\n🟢 *Agentes libres:* ${free_agents.join(", ")} (disponibles para otros proyectos)`
            : "";
          const reasoningLine = reasoning ? `\n\n💭 *Por qué este plan:*\n${reasoning}` : "";
          const successLine = draftSuccess ? `\n\n✅ *Criterio de éxito:*\n${draftSuccess}` : "";

          const summary = `📋 *Propuesta de proyecto: ${draftName}*\n\n${draftDesc || ""}${capsLine}\n\n👥 *Equipo propuesto:*\n${agentsList}\n\n📐 *Fases:*\n${phasesList}${costLine}${durLine}${freeLine}${reasoningLine}${successLine}\n\n_Responde *"sí"* o *"apruebo"* para arrancar, o *"no, cambia X"* para ajustar._\n_Draft ID: \`${draft.id.substring(0, 8)}\`_`;

          console.log(`[proponer_proyecto] Draft ${draft.id} for "${draftName}" with ${proposed_agents.length} agents`);
          return {
            success: true,
            draft_id: draft.id,
            name: draftName,
            message: summary,
            requires_approval: true,
          };
        }

        case "ver_drafts": {
          const { org_id } = args;
          const drafts = await sbFetch(`${base}/rest/v1/active_project_drafts?org_id=eq.${org_id}&order=created_at.desc`, { headers: sbHeaders() });
          if (!Array.isArray(drafts) || drafts.length === 0) {
            return { success: true, drafts: [], message: "No hay propuestas pendientes." };
          }
          const lines = drafts.map(d => {
            const agents = (d.proposed_agents || []).map(a => a.name).join(", ");
            return `• *${d.name}* (${d.id.substring(0, 8)}) — ${agents}`;
          }).join("\n");
          return { success: true, drafts, message: `📋 *Drafts pendientes:*\n${lines}` };
        }

        case "conectar_gmail": {
          const { org_id, whatsapp_number } = args;
          // Resolve user_id from whatsapp_number if possible (via chief_sessions)
          let userId = null;
          if (whatsapp_number) {
            const sessions = await sbFetch(`${base}/rest/v1/chief_sessions?whatsapp_number=eq.${encodeURIComponent(whatsapp_number)}&select=user_id&limit=1`, { headers: sbHeaders() });
            if (Array.isArray(sessions) && sessions.length > 0) userId = sessions[0].user_id;
          }
          const startUrl = `${BRIDGE_PUBLIC_URL}/auth/google/start?org_id=${encodeURIComponent(org_id)}&source=whatsapp${userId ? `&user_id=${userId}` : ""}`;
          // Get the actual Google URL by calling internal endpoint
          let authUrl = startUrl;
          try {
            const r = await fetch(startUrl);
            const d = await r.json();
            if (d?.url) authUrl = d.url;
          } catch { /* fallback: return the start URL, which redirects when opened in a browser */ }
          return {
            success: true,
            url: authUrl,
            message: `🔐 *Conectar Gmail*\n\nAbre este link UNA sola vez para autorizar:\n\n${authUrl}\n\nCuando autorices, Paula podrá leer tu inbox, hacer triage y resúmenes. Tus tokens se guardan de forma segura (cifrados en la BD).`,
          };
        }

        case "estado_gmail": {
          const { org_id } = args;
          const rows = await sbFetch(`${base}/rest/v1/agent_integrations?org_id=eq.${org_id}&provider=eq.google&select=email,status,connected_at,token_expires_at,connected_via,last_used_at`, { headers: sbHeaders() });
          if (!Array.isArray(rows) || rows.length === 0) {
            return { success: true, connected: false, message: "❌ Gmail no conectado. Usa `conectar_gmail` para enlazarlo." };
          }
          const r = rows[0];
          const ok = r.status === "active";
          const msg = ok
            ? `✅ *Gmail conectado*\n📧 ${r.email}\n🕐 Desde: ${new Date(r.connected_at).toLocaleString()}\n🔁 Vía: ${r.connected_via}`
            : `⚠️ Gmail en estado \`${r.status}\` — necesitas reconectar.`;
          return { success: true, connected: ok, email: r.email, status: r.status, message: msg };
        }

        case "desconectar_gmail": {
          const { org_id } = args;
          await sbFetch(`${base}/rest/v1/agent_integrations?org_id=eq.${org_id}&provider=eq.google`, {
            method: "DELETE", headers: { ...sbHeaders(), Prefer: "return=minimal" },
          });
          return { success: true, message: "🔓 Gmail desconectado. Paula ya no puede leer tu inbox." };
        }

        case "conectar_salesforce": {
          const { org_id } = args;
          try {
            const r = await fetch(`${BRIDGE_PUBLIC_URL}/auth/salesforce/start?org_id=${encodeURIComponent(org_id)}&source=whatsapp`);
            const d = await r.json();
            return { success: true, url: d.url, message: `☁️ *Conectar Salesforce*\n\nAbre este link:\n${d.url}\n\nAutoriza y los agentes podrán buscar cuentas, crear leads y sincronizar.` };
          } catch (e) { return { success: false, error: e.message }; }
        }

        case "estado_salesforce": {
          const { org_id } = args;
          const rows = await sbFetch(`${base}/rest/v1/agent_integrations?org_id=eq.${org_id}&provider=eq.salesforce&select=email,status,connected_at`, { headers: sbHeaders() });
          if (!Array.isArray(rows) || rows.length === 0) return { success: true, connected: false, message: "❌ Salesforce no conectado. Usa `conectar_salesforce`." };
          const r = rows[0];
          return { success: true, connected: r.status === "active", message: r.status === "active" ? `☁️ Salesforce conectado (${r.email})` : `⚠️ Salesforce: ${r.status}` };
        }

        case "conectar_linkedin": {
          const { org_id } = args;
          try {
            const r = await fetch(`${BRIDGE_PUBLIC_URL}/auth/linkedin/start?org_id=${encodeURIComponent(org_id)}`);
            const d = await r.json();
            if (!d.url) return { success: false, error: d.error || "No se pudo generar link de LinkedIn" };
            return { success: true, url: d.url, message: `💼 *Conectar LinkedIn*\n\nAbre este link:\n${d.url}\n\nConecta tu cuenta de LinkedIn y los agentes podrán ver perfiles, enviar conexiones y mensajes.` };
          } catch (e) { return { success: false, error: e.message }; }
        }

        case "estado_linkedin": {
          const { org_id } = args;
          try {
            const r = await fetch(`${BRIDGE_PUBLIC_URL}/integrations/linkedin/status?org_id=${encodeURIComponent(org_id)}`);
            const d = await r.json();
            return { success: true, connected: d.connected, message: d.connected ? `💼 LinkedIn conectado (Unipile account ${d.account_id})` : "❌ LinkedIn no conectado. Usa `conectar_linkedin`." };
          } catch (e) { return { success: false, error: e.message }; }
        }

        case "estado_integraciones": {
          const { org_id } = args;
          try {
            const r = await fetch(`${BRIDGE_PUBLIC_URL}/integrations/status?org_id=${encodeURIComponent(org_id)}`);
            const d = await r.json();
            let msg = "📡 *Estado de integraciones:*\n\n";
            const check = (name, data) => {
              if (data?.connected) return `✅ *${name}* — conectado${data.email ? ` (${data.email})` : ""}`;
              if (data?.available) return `🔧 *${name}* — disponible (API key configurada)`;
              return `❌ *${name}* — no conectado`;
            };
            msg += check("Gmail", d.google) + "\n";
            msg += check("Salesforce", d.salesforce) + "\n";
            msg += check("LinkedIn", d.linkedin) + "\n";
            msg += check("Apollo", d.apollo) + "\n";
            msg += check("Firecrawl", d.firecrawl) + "\n";
            return { success: true, integrations: d, message: msg };
          } catch (e) { return { success: false, error: e.message }; }
        }

        case "enviar_correo": {
          const { org_id, to, subject, body, cc, reply_to_message_id } = args;
          // Get fresh token via bridge refresh endpoint
          try {
            const tokenRes = await fetch(`${BRIDGE_PUBLIC_URL}/integrations/google/refresh`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ org_id }),
            });
            const tokenData = await tokenRes.json();
            if (!tokenRes.ok || !tokenData.access_token) {
              return { success: false, error: "Gmail no conectado. Usa `conectar_gmail` primero.", details: tokenData };
            }
            // Build RFC 2822 raw email
            const rawLines = [
              `To: ${to}`,
              `Subject: ${subject}`,
              cc ? `Cc: ${cc}` : null,
              reply_to_message_id ? `In-Reply-To: ${reply_to_message_id}` : null,
              reply_to_message_id ? `References: ${reply_to_message_id}` : null,
              "Content-Type: text/plain; charset=UTF-8",
              "",
              body,
            ].filter(Boolean).join("\r\n");
            const rawB64 = Buffer.from(rawLines, "utf8").toString("base64url");
            const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
              method: "POST",
              headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ raw: rawB64 }),
            });
            const gmailData = await gmailRes.json();
            if (!gmailRes.ok) {
              return { success: false, error: `Gmail API error: ${gmailData?.error?.message || JSON.stringify(gmailData).substring(0, 300)}` };
            }
            console.log(`[enviar_correo] Sent to ${to}, subject "${subject}", id ${gmailData.id}`);
            return { success: true, message_id: gmailData.id, message: `✅ Correo enviado a ${to}\n📧 Asunto: ${subject}` };
          } catch (e) {
            return { success: false, error: `Error enviando: ${e.message}` };
          }
        }

        case "resolver_skill": {
          const { org_id, query: skillQuery } = args;
          try {
            // 1. Search skill_registry by keyword matching
            const words = skillQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            const orClauses = words.map(w => `display_name.ilike.*${w}*,description.ilike.*${w}*,name.ilike.*${w}*`).join(',');
            const { data: skills } = await supabase
              .from('skill_registry')
              .select('name,display_name,description,skill_definition,category')
              .or(orClauses)
              .limit(5);

            if (!skills || skills.length === 0) {
              return { success: false, no_match: true, message: `No encontré un skill que coincida con "${skillQuery}". Puedes crear uno con crear_skill o delegarlo como tarea general con delegar_tarea.` };
            }

            // 2. For each matching skill, find which agents have it assigned
            const results = [];
            for (const skill of skills) {
              const { data: assignments } = await supabase
                .from('agent_skills')
                .select('agent_id,enabled')
                .eq('skill_name', skill.name)
                .eq('enabled', true);

              let agentNames = [];
              if (assignments && assignments.length > 0) {
                const agentIds = assignments.map(a => a.agent_id);
                const { data: agents } = await supabase
                  .from('agents')
                  .select('id,name')
                  .in('id', agentIds)
                  .eq('org_id', org_id);
                agentNames = (agents || []).map(a => a.name);
              }

              results.push({
                skill_name: skill.name,
                display_name: skill.display_name,
                description: skill.description,
                skill_definition: skill.skill_definition,
                category: skill.category,
                agents: agentNames,
              });
            }

            // 3. Pick best match (first with agents assigned)
            const best = results.find(r => r.agents.length > 0) || results[0];
            const agentStr = best.agents.length > 0 ? best.agents.join(', ') : 'ninguno (asigna el skill a un agente primero)';

            return {
              success: true,
              best_match: best,
              all_matches: results,
              delegation_instruction: best.agents.length > 0
                ? `Usa delegar_tarea para enviar a ${best.agents[0]} con esta instruccion: "Ejecuta el skill '${best.display_name}' usando call_skill con function_name segun tu skill definition. ${best.skill_definition}. Pregunta al usuario los datos que necesites antes de ejecutar."`
                : `No hay agente con este skill asignado. Usa crear_skill para registrarlo o asignalo desde el dashboard.`,
              message: `🎯 *Skill encontrado: ${best.display_name}*\n📋 ${best.description}\n👤 Agentes: ${agentStr}\n\n${best.agents.length > 0 ? `Delegando a *${best.agents[0]}*...` : '⚠️ Sin agente asignado.'}`,
            };
          } catch (e) {
            return { success: false, error: e.message };
          }
        }

        case "leer_correos": {
          const { org_id, query: emailQuery, limit: emailLimit } = args;
          try {
            const tokenRes = await fetch(`${BRIDGE_PUBLIC_URL}/integrations/google/refresh`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ org_id }),
            });
            const tokenData = await tokenRes.json();
            if (!tokenRes.ok || !tokenData.access_token) {
              return { success: false, error: "Gmail no conectado. Usa `conectar_gmail` primero." };
            }
            const q = encodeURIComponent(emailQuery || "is:unread in:inbox");
            const lim = Math.min(emailLimit || 10, 20);
            const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=${lim}`, {
              headers: { Authorization: `Bearer ${tokenData.access_token}` },
            });
            const listData = await listRes.json();
            const ids = (listData.messages || []).map(m => m.id);
            if (ids.length === 0) return { success: true, count: 0, message: "📭 No hay correos que coincidan." };
            // Fetch metadata for each
            const msgs = await Promise.all(ids.map(async (id) => {
              const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
                headers: { Authorization: `Bearer ${tokenData.access_token}` },
              });
              return r.json();
            }));
            const lines = msgs.map((m, i) => {
              const headers = m.payload?.headers || [];
              const from = headers.find(h => h.name === "From")?.value || "?";
              const subj = headers.find(h => h.name === "Subject")?.value || "(sin asunto)";
              const date = headers.find(h => h.name === "Date")?.value || "";
              const unread = (m.labelIds || []).includes("UNREAD") ? "•" : " ";
              return `${unread} ${i + 1}. ${from}\n     "${subj}" — ${date}\n     ${(m.snippet || "").substring(0, 120)}`;
            }).join("\n");
            return { success: true, count: msgs.length, message: `📬 *${msgs.length} correos:*\n\n${lines}` };
          } catch (e) {
            return { success: false, error: `Error leyendo correos: ${e.message}` };
          }
        }

        case "rechazar_proyecto": {
          const { org_id, draft_id, razon } = args;
          let targetId = draft_id;
          if (!targetId) {
            const pending = await sbFetch(`${base}/rest/v1/project_drafts?org_id=eq.${org_id}&status=eq.pending&order=created_at.desc&limit=1&select=id,name`, { headers: sbHeaders() });
            if (Array.isArray(pending) && pending.length > 0) targetId = pending[0].id;
          }
          if (!targetId) return { success: false, error: "No hay draft pendiente para rechazar." };
          await sbFetch(`${base}/rest/v1/project_drafts?id=eq.${targetId}`, {
            method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
            body: JSON.stringify({ status: "rejected", rejection_reason: razon || null, decided_at: new Date().toISOString() }),
          });
          console.log(`[rechazar_proyecto] Draft ${targetId} rejected: ${razon}`);
          return { success: true, message: `Draft rechazado. Razón: ${razon || "(sin razón)"}. Cuando quieras, te propongo una versión ajustada.` };
        }

        case "aprobar_proyecto": {
          const { org_id, draft_id } = args;
          // Find the target draft
          let draftRow = null;
          if (draft_id) {
            const rows = await sbFetch(`${base}/rest/v1/project_drafts?id=eq.${draft_id}&select=*`, { headers: sbHeaders() });
            draftRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
          } else {
            const rows = await sbFetch(`${base}/rest/v1/project_drafts?org_id=eq.${org_id}&status=eq.pending&order=created_at.desc&limit=1&select=*`, { headers: sbHeaders() });
            draftRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
          }
          if (!draftRow) return { success: false, error: "No hay draft pendiente para aprobar." };
          if (draftRow.status !== "pending") return { success: false, error: `El draft está en estado "${draftRow.status}" — ya no se puede aprobar.` };

          // Delegate to crear_proyecto internal logic by constructing args
          const promoteArgs = {
            org_id: draftRow.org_id,
            name: draftRow.name,
            description: draftRow.description,
            workflow_type: draftRow.workflow_type || "collaboration",
            agent_names: (draftRow.proposed_agents || []).map(a => a.name),
            phases: draftRow.phases || [],
            success_criteria: draftRow.success_criteria,
          };

          // Re-enter the dispatcher to reuse the crear_proyecto logic (dedup + phases + auto-decompose).
          let promoted;
          try {
            promoted = await gwExecuteToolSync("crear_proyecto", promoteArgs);
          } catch (e) {
            promoted = { success: false, error: `promotion failed: ${e.message}` };
          }

          if (!promoted?.success) {
            return { success: false, error: `No se pudo crear el proyecto a partir del draft: ${promoted?.error || "unknown"}` };
          }

          // Mark draft approved with project_id
          await sbFetch(`${base}/rest/v1/project_drafts?id=eq.${draftRow.id}`, {
            method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
            body: JSON.stringify({
              status: "approved",
              approved_project_id: promoted.project_id || null,
              decided_at: new Date().toISOString(),
            }),
          });

          console.log(`[aprobar_proyecto] Draft ${draftRow.id} approved → project ${promoted.project_id}`);
          return {
            success: true,
            draft_id: draftRow.id,
            project_id: promoted.project_id,
            name: draftRow.name,
            message: `✅ Proyecto "${draftRow.name}" aprobado y arrancando. ${promoted.message || ""}`,
          };
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

          // === Pre-resolve proposed agent IDs (for overlap-based dedup) ===
          // Collect agent names from both workflow modes so we can check overlap BEFORE creating.
          const proposedAgentNames = new Set();
          if (Array.isArray(agent_names)) {
            for (const n of agent_names) if (n) proposedAgentNames.add(n);
          }
          if (Array.isArray(phases)) {
            for (const ph of phases) {
              if (ph?.agent_name) proposedAgentNames.add(ph.agent_name);
              if (ph?.reviewer_name) proposedAgentNames.add(ph.reviewer_name);
            }
          }
          const proposedAgentIds = new Set();
          for (const name of proposedAgentNames) {
            const a = await resolveAgentId(name);
            if (a?.id) proposedAgentIds.add(a.id);
          }

          // === DEDUP: Only close existing projects that OVERLAP agents with the new one ===
          // Parallel projects with disjoint agent sets are allowed to coexist.
          try {
            const existingProjects = await sbFetch(`${base}/rest/v1/agent_projects?org_id=eq.${org_id}&status=in.(active,in_progress,paused)&select=id,name,status,assigned_agents`, { headers: sbHeaders() });
            if (Array.isArray(existingProjects) && existingProjects.length > 0) {
              for (const ep of existingProjects) {
                const epAgents = Array.isArray(ep.assigned_agents) ? ep.assigned_agents : [];
                const overlaps = epAgents.some(id => proposedAgentIds.has(id));
                if (!overlaps) {
                  console.log(`[crear_proyecto] Keeping parallel project "${ep.name}" (${ep.id}) — no agent overlap`);
                  continue;
                }
                // Close overlapping project so its agents are freed for the new one
                await sbFetch(`${base}/rest/v1/agent_projects?id=eq.${ep.id}`, {
                  method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
                  body: JSON.stringify({ status: "completed", updated_at: new Date().toISOString() }),
                });
                await sbFetch(`${base}/rest/v1/agent_project_phases?project_id=eq.${ep.id}&status=neq.completed`, {
                  method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
                  body: JSON.stringify({ status: "completed" }),
                });
                console.log(`[crear_proyecto] Closed overlapping project: ${ep.name} (${ep.id})`);
              }
            }
          } catch (e) { console.error("[crear_proyecto] Dedup error:", e.message); }

          // === COLLABORATION MODE (v2: generates tasks, no A2A sync) ===
          if (workflow_type === "collaboration") {
            if (!agent_names || agent_names.length < 2) return { success: false, error: "Se necesitan al menos 2 agentes para colaboración." };

            // Resolve all agents
            const resolvedAgents = [];
            for (const name of agent_names) {
              const agent = await resolveAgentId(name);
              if (!agent) return { success: false, error: `Agente "${name}" no encontrado.` };
              resolvedAgents.push(agent);
            }

            // Create project
            const projRows = await sbFetch(`${base}/rest/v1/agent_projects`, {
              method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" },
              body: JSON.stringify({
                org_id, name: projName, description: projDesc || null, status: "active",
                workflow_type: "collaboration",
                assigned_agents: resolvedAgents.map(a => a.id),
                max_iterations: max_iterations || 100,
                checkpoint_every: checkpoint_every || 10,
                current_iteration: 0,
                success_criteria: success_criteria || null,
              }),
            });
            const project = Array.isArray(projRows) ? projRows[0] : projRows;
            if (!project?.id) return { success: false, error: "No se pudo crear el proyecto." };

            // Auto-generate phases if not provided
            const collabPhases = phases && phases.length > 0 ? phases : [
              { name: "Fase 1 — Ejecución principal", description: projDesc || projName, agent_name: agent_names[0], reviewer_name: agent_names[1] || agent_names[0] },
            ];

            // Create phases + set first as in_progress
            const phaseRows = [];
            for (let i = 0; i < collabPhases.length; i++) {
              const ph = collabPhases[i];
              const agent = await resolveAgentId(ph.agent_name);
              let reviewerId = null;
              if (ph.reviewer_name) {
                const reviewer = await resolveAgentId(ph.reviewer_name);
                if (reviewer) reviewerId = reviewer.id;
              }
              phaseRows.push({
                project_id: project.id, phase_number: i + 1, name: ph.name,
                description: ph.description || ph.name, agent_id: agent?.id || resolvedAgents[0].id,
                reviewer_agent_id: reviewerId, status: i === 0 ? "in_progress" : "pending",
              });
            }

            const phaseRes = await sbFetch(`${base}/rest/v1/agent_project_phases`, {
              method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" },
              body: JSON.stringify(phaseRows),
            });
            const createdPhases = Array.isArray(phaseRes) ? phaseRes : [];

            // Auto-decompose Phase 1 into v2 tasks
            const phase1 = createdPhases.find(p => p.status === "in_progress") || createdPhases[0];
            let tasksCreated = 0;
            if (phase1?.id) {
              try {
                const ptRes = await fetch(`${base}/functions/v1/phase-transition`, {
                  method: "POST", headers: sbHeaders(true),
                  body: JSON.stringify({ project_id: project.id, phase_id: phase1.id }),
                });
                const ptData = await ptRes.json();
                tasksCreated = ptData?.tasks_created || 0;
              } catch (e) {
                console.error(`[project] Phase 1 auto-decompose failed:`, e.message);
              }
            }

            console.log(`[project] Created collaboration "${projName}" with ${resolvedAgents.length} agents, ${collabPhases.length} phases, ${tasksCreated} v2 tasks`);
            return {
              success: true,
              project_id: project.id,
              name: projName,
              workflow_type: "collaboration",
              agents: resolvedAgents.map(a => a.name),
              phases: collabPhases.length,
              tasks_created: tasksCreated,
              message: `Proyecto "${projName}" creado con ${collabPhases.length} fase(s) y ${tasksCreated} tareas auto-generadas. Los agentes las reclamarán automáticamente. Fase completada → siguiente fase auto-arranca.`,
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

          // Set first phase as in_progress
          phaseRows[0].status = "in_progress";

          const phaseRes = await sbFetch(`${base}/rest/v1/agent_project_phases`, {
            method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" },
            body: JSON.stringify(phaseRows),
          });
          const createdPhases = Array.isArray(phaseRes) ? phaseRes : [];

          // --- AUTO-DECOMPOSE: Generate tasks for Phase 1 ---
          const phase1 = createdPhases.find(p => p.status === "in_progress") || createdPhases[0];
          if (phase1?.id) {
            try {
              console.log(`[project] Auto-decomposing Phase 1: ${phase1.name}`);
              await fetch(`${base}/functions/v1/phase-transition`, {
                method: "POST",
                headers: sbHeaders(true),
                body: JSON.stringify({ project_id: project.id, phase_id: phase1.id }),
              });
            } catch (e) {
              console.error(`[project] Phase 1 auto-decompose failed:`, e.message);
            }
          }

          console.log(`[project] Created "${projName}" with ${phases.length} phases + auto-decomposed Phase 1`);
          return {
            success: true,
            project_id: project.id,
            name: projName,
            phases: phases.map((p, i) => `${i + 1}. ${p.name} (${p.agent_name}${p.reviewer_name ? ` → review: ${p.reviewer_name}` : ""})`),
            message: `Proyecto "${projName}" creado con ${phases.length} fases. Fase 1 arrancando con tareas auto-generadas. Los agentes las reclamarán automáticamente.`,
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
          // v2: Creates produce + review tasks in agent_tasks_v2
          // Event loop handles execution, artifacts, reviews automatically
          const { org_id, producer_name, reviewer_name, task: collabTask, max_iterations: collabMax } = args;

          const resolveAgent = async (name) => {
            const p = new URLSearchParams({ org_id: `eq.${org_id}`, name: `ilike.%${name}%`, status: "neq.destroyed", select: "id,name,role,capabilities", limit: "1" });
            const rows = await sbFetch(`${base}/rest/v1/agents?${p}`, { headers: sbHeaders() });
            return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
          };

          const producer = await resolveAgent(producer_name);
          const reviewer = await resolveAgent(reviewer_name);
          if (!producer) return { success: false, error: `Agente ${producer_name} no encontrado.` };
          if (!reviewer) return { success: false, error: `Agente ${reviewer_name} no encontrado.` };

          // Create produce task (ready for producer to claim)
          const produceRes = await sbFetch(`${base}/rest/v1/agent_tasks_v2`, {
            method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" },
            body: JSON.stringify({
              org_id, title: collabTask?.substring(0, 80) || "Tarea colaborativa",
              description: `${collabTask}\n\nProduce tu mejor trabajo. Cuando termines usa request_review para que ${reviewer.name} lo revise.`,
              task_type: "general",
              required_capabilities: producer.capabilities || [],
              priority: 10, status: "ready",
              max_review_iterations: collabMax || 3,
              created_by: "chief",
            }),
          });
          const produceTask = Array.isArray(produceRes) && produceRes[0] ? produceRes[0] : null;

          return {
            success: true,
            task_id: produceTask?.id,
            message: `Tarea creada para ${producer.name}. Cuando produzca su trabajo, ${reviewer.name} lo revisará automáticamente (max ${collabMax || 3} rondas). Todo via artifacts + reviews — sin timeouts.`,
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
          // v2: writes to agent_tasks_v2 (not blackboard)
          const { org_id, project_name, description, agent_roles } = args;

          // Map role_hints to capabilities
          const roleCapMap = {
            ux_designer: ["design", "research"], cto: ["code", "ops"],
            developer: ["code"], sales: ["outreach", "research"],
            marketing: ["writing", "research"], qa: ["research"],
          };

          const anthropic = new (_AnthSdk.default || _AnthSdk)({ apiKey: process.env.ANTHROPIC_API_KEY });
          const decomposition = await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `Decompose this project into 5-12 concrete tasks.\n\nProject: ${project_name}\nDescription: ${description}\nRoles: ${(agent_roles || ["ux_designer", "cto", "sales"]).join(", ")}\n\nReturn ONLY a JSON array:\n[{"title":"...","description":"...","priority":10,"task_type":"design","role_hint":"ux_designer","depends_on_index":null}]\n\ntask_type: design|code|research|qa|outreach|writing|general\npriority: 0=urgent, 50=normal, 100=low\ndepends_on_index: index of task that must complete first (or null)`
            }],
          });
          const responseText = decomposition.content[0]?.text || "[]";
          const jsonMatch = responseText.match(/\[[\s\S]*\]/);
          if (!jsonMatch) return { success: false, error: "No se pudo descomponer el proyecto" };
          let tasks;
          try { tasks = JSON.parse(jsonMatch[0]); }
          catch { return { success: false, error: "JSON inválido en la descomposición" }; }

          const created = [];
          const taskIdMap = {};
          for (let i = 0; i < tasks.length; i++) {
            const t = tasks[i];
            const caps = roleCapMap[t.role_hint] || [];
            const dependsOn = (t.depends_on_index != null && taskIdMap[t.depends_on_index]) ? [taskIdMap[t.depends_on_index]] : [];
            const taskStatus = dependsOn.length > 0 ? "backlog" : "ready";

            const res = await sbFetch(`${base}/rest/v1/agent_tasks_v2`, {
              method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" },
              body: JSON.stringify({
                org_id, title: t.title, description: t.description,
                task_type: t.task_type || "general",
                required_capabilities: caps, priority: t.priority || 50,
                depends_on: dependsOn, status: taskStatus, created_by: "chief",
              }),
            });
            const row = Array.isArray(res) && res[0] ? res[0] : null;
            if (row) { taskIdMap[i] = row.id; created.push({ title: t.title, priority: t.priority, type: t.task_type }); }
          }
          return {
            success: true, project: project_name,
            tasks_created: created.length, tasks: created,
            message: `Proyecto "${project_name}" descompuesto en ${created.length} tareas v2. Los agentes las reclamarán automáticamente según sus capabilities.`,
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

        // --- Memory tool implementations ---
        case "ver_artefactos": {
          let query = `${SB_URL}/rest/v1/agent_artifacts?org_id=eq.${args.org_id}&order=created_at.desc&limit=${args.limit || 10}&select=id,task_id,filename,version,artifact_type,content_summary,created_by,created_at`;
          if (args.task_id) query += `&task_id=eq.${args.task_id}`;
          if (args.agent_name) {
            const ag = await sbFetch(`${SB_URL}/rest/v1/agents?org_id=eq.${args.org_id}&name=ilike.*${args.agent_name}*&limit=1&select=id`, { headers: sbHeaders() });
            if (Array.isArray(ag) && ag[0]) query += `&created_by=eq.${ag[0].id}`;
          }
          const artifacts = await sbFetch(query, { headers: sbHeaders() });
          // Enrich with agent names
          const agentMap = {};
          const allAgents = await sbFetch(`${SB_URL}/rest/v1/agents?org_id=eq.${args.org_id}&select=id,name`, { headers: sbHeaders() });
          if (Array.isArray(allAgents)) allAgents.forEach(a => { agentMap[a.id] = a.name; });
          const enriched = (Array.isArray(artifacts) ? artifacts : []).map(a => ({
            ...a, agent_name: agentMap[a.created_by] || "Unknown",
          }));
          return { success: true, artifacts: enriched, total: enriched.length };
        }

        case "ver_conocimiento": {
          let query = `${SB_URL}/rest/v1/agent_knowledge?org_id=eq.${args.org_id}&valid_until=is.null&order=importance.desc&limit=20&select=id,agent_id,content,category,importance,source_type,created_at`;
          if (args.category) query += `&category=eq.${args.category}`;
          if (args.agent_name) {
            const ag = await sbFetch(`${SB_URL}/rest/v1/agents?org_id=eq.${args.org_id}&name=ilike.*${args.agent_name}*&limit=1&select=id`, { headers: sbHeaders() });
            if (Array.isArray(ag) && ag[0]) query += `&agent_id=eq.${ag[0].id}`;
          }
          const knowledge = await sbFetch(query, { headers: sbHeaders() });
          const agentMap2 = {};
          const allAg = await sbFetch(`${SB_URL}/rest/v1/agents?org_id=eq.${args.org_id}&select=id,name`, { headers: sbHeaders() });
          if (Array.isArray(allAg)) allAg.forEach(a => { agentMap2[a.id] = a.name; });
          const enriched2 = (Array.isArray(knowledge) ? knowledge : []).map(k => ({
            ...k, agent_name: k.agent_id ? (agentMap2[k.agent_id] || "Agent") : "Equipo",
          }));
          return { success: true, knowledge: enriched2, total: enriched2.length };
        }

        case "ver_reviews": {
          const reviews = await sbFetch(`${SB_URL}/rest/v1/agent_reviews?task_id=eq.${args.task_id}&order=iteration.asc&select=*`, { headers: sbHeaders() });
          const agentMap3 = {};
          const allAg3 = await sbFetch(`${SB_URL}/rest/v1/agents?org_id=eq.${args.org_id}&select=id,name`, { headers: sbHeaders() });
          if (Array.isArray(allAg3)) allAg3.forEach(a => { agentMap3[a.id] = a.name; });
          const enriched3 = (Array.isArray(reviews) ? reviews : []).map(r => ({
            ...r, reviewer_name: agentMap3[r.reviewer_agent_id] || "Unknown",
          }));
          return { success: true, reviews: enriched3, total: enriched3.length };
        }

        case "ver_backlog": {
          let backlogQuery = `${SB_URL}/rest/v1/agent_backlog?org_id=eq.${args.org_id}`;
          const bStatus = args.status || "open";
          if (bStatus !== "all") backlogQuery += `&status=eq.${bStatus}`;
          if (args.agent_name) {
            const ag = await sbFetch(`${SB_URL}/rest/v1/agents?org_id=eq.${args.org_id}&name=ilike.*${args.agent_name}*&limit=1&select=id`, { headers: sbHeaders() });
            if (Array.isArray(ag) && ag[0]) backlogQuery += `&agent_id=eq.${ag[0].id}`;
          }
          backlogQuery += `&order=created_at.desc&limit=20&select=id,agent_id,category,title,details,status,resolution,created_at`;
          const backlogItems = await sbFetch(backlogQuery, { headers: sbHeaders() });
          const agMap = {};
          const allAg = await sbFetch(`${SB_URL}/rest/v1/agents?org_id=eq.${args.org_id}&select=id,name`, { headers: sbHeaders() });
          if (Array.isArray(allAg)) allAg.forEach(a => { agMap[a.id] = a.name; });
          const enriched = (Array.isArray(backlogItems) ? backlogItems : []).map(b => ({
            ...b, agent_name: agMap[b.agent_id] || "Unknown",
          }));
          return { success: true, backlog: enriched, total: enriched.length, status_filter: bStatus };
        }

        case "resolver_backlog": {
          await sbFetch(`${SB_URL}/rest/v1/agent_backlog?id=eq.${args.backlog_id}`, {
            method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
            body: JSON.stringify({ status: "resolved", resolution: args.resolution, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
          });
          return { success: true, message: `Backlog item resolved: "${args.resolution}"` };
        }

        case "ensenar_agente": {
          let agentId = null;
          if (args.agent_name) {
            const ag = await sbFetch(`${SB_URL}/rest/v1/agents?org_id=eq.${args.org_id}&name=ilike.*${args.agent_name}*&limit=1&select=id,name`, { headers: sbHeaders() });
            if (Array.isArray(ag) && ag[0]) agentId = ag[0].id;
          }
          await sbFetch(`${SB_URL}/rest/v1/agent_knowledge`, {
            method: "POST", headers: { ...sbHeaders(), Prefer: "return=minimal" },
            body: JSON.stringify({
              org_id: args.org_id, agent_id: agentId, scope: "/",
              category: args.category || "fact", content: args.content,
              importance: args.importance || 0.7, source_type: "user_input",
            }),
          });
          return { success: true, message: `Conocimiento guardado${agentId ? ` para ${args.agent_name}` : " para todo el equipo"}: "${args.content}"` };
        }

        case "analizar_estructura": {
          const agts = await sbFetch(`${SB_URL}/rest/v1/agents?org_id=eq.${args.org_id}&status=neq.destroyed&select=id,name,role,team,tier,parent_agent_id,capabilities,model,availability`, { headers: sbHeaders() });
          if (!Array.isArray(agts)) return { success: false, error: "Could not load agents" };

          const suggestions = [];
          const teams = {};
          const orphans = [];

          for (const a of agts) {
            if (a.team) {
              if (!teams[a.team]) teams[a.team] = { workers: [], leads: [], managers: [] };
              teams[a.team][a.tier === 'team_lead' ? 'leads' : a.tier === 'manager' ? 'managers' : 'workers'].push(a);
            } else {
              orphans.push(a);
            }
          }

          // Check teams with 4+ workers and no lead
          for (const [teamName, members] of Object.entries(teams)) {
            if (members.workers.length >= 4 && members.leads.length === 0) {
              const bestCandidate = members.workers.sort((a, b) => (b.capabilities?.length || 0) - (a.capabilities?.length || 0))[0];
              suggestions.push({
                type: "need_team_lead",
                team: teamName,
                workers: members.workers.length,
                message: `El equipo "${teamName}" tiene ${members.workers.length} workers sin team lead. Sugiero promover a ${bestCandidate?.name || 'un agente'} o crear uno nuevo.`,
                candidate: bestCandidate?.name || null,
              });
            }
          }

          // Orphan agents
          if (orphans.length > 0) {
            suggestions.push({
              type: "orphan_agents",
              agents: orphans.map(a => a.name),
              message: `${orphans.length} agente(s) sin equipo: ${orphans.map(a => a.name).join(', ')}. Sugiero asignarlos a un equipo.`,
            });
          }

          // Agents without capabilities
          const noCaps = agts.filter(a => !a.capabilities || a.capabilities.length === 0);
          if (noCaps.length > 0) {
            suggestions.push({
              type: "no_capabilities",
              agents: noCaps.map(a => a.name),
              message: `${noCaps.length} agente(s) sin capabilities configuradas: ${noCaps.map(a => a.name).join(', ')}. No podrán reclamar tareas del backlog.`,
            });
          }

          return {
            success: true,
            total_agents: agts.length,
            teams: Object.entries(teams).map(([name, m]) => ({
              name, workers: m.workers.length, leads: m.leads.length, managers: m.managers.length,
            })),
            orphan_agents: orphans.length,
            suggestions,
            healthy: suggestions.length === 0,
            message: suggestions.length === 0
              ? "✅ La estructura del equipo se ve bien. Todos los agentes tienen equipo, capabilities, y los equipos están balanceados."
              : `⚠️ ${suggestions.length} sugerencia(s) para mejorar la estructura:\n${suggestions.map((s, i) => `${i + 1}. ${s.message}`).join('\n')}`,
          };
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

        case "configurar_idioma": {
          const langNames = { es: "Español", en: "English", pt: "Português" };
          await sbFetch(`${SB_URL}/rest/v1/chief_sessions?whatsapp_number=eq.${args.whatsapp_number}`, {
            method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=minimal" },
            body: JSON.stringify({ language: args.language, updated_at: new Date().toISOString() }),
          });
          return { success: true, message: `Language set to ${langNames[args.language] || args.language}. All messages from Chief and agents will now be in ${langNames[args.language] || args.language}.` };
        }

        case "crear_skill": {
          const { org_id, display_name, description, category, skill_definition, requires_integrations, assign_to_agents } = args;
          const slug = (args.name || display_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')).substring(0, 60);
          try {
            const { data: skill, error } = await supabase
              .from('skill_registry')
              .insert({
                name: slug,
                display_name,
                description,
                category: category || 'sales',
                skill_definition,
                requires_integrations: requires_integrations || [],
                is_system: false,
              })
              .select('name,display_name')
              .single();
            if (error) return { success: false, error: error.message.includes('unique') ? `Ya existe un skill con el nombre "${slug}"` : error.message };
            // Auto-assign to agents if requested
            let assigned = [];
            if (assign_to_agents && assign_to_agents.length > 0) {
              for (const agentName of assign_to_agents) {
                const { data: agents } = await supabase.from('agents').select('id').ilike('name', `%${agentName}%`).eq('org_id', org_id).limit(1);
                if (agents && agents[0]) {
                  await supabase.from('agent_skills').insert({ agent_id: agents[0].id, skill_name: slug, enabled: true }).catch(() => {});
                  assigned.push(agentName);
                }
              }
            }
            return { success: true, skill: skill.display_name, name: slug, assigned_to: assigned, message: `Skill "${display_name}" creado${assigned.length > 0 ? ` y asignado a: ${assigned.join(', ')}` : '. Asígnalo a agentes desde el dashboard o dime a quién.'}` };
          } catch (e) { return { success: false, error: e.message }; }
        }

        case "listar_skills": {
          try {
            const { data } = await supabase.from('skill_registry').select('name,display_name,description,category').order('category').order('display_name');
            if (!data || data.length === 0) return { success: true, message: "No hay skills registrados." };
            const grouped = {};
            for (const s of data) {
              if (!grouped[s.category]) grouped[s.category] = [];
              grouped[s.category].push(s);
            }
            let msg = `📋 *Skills disponibles (${data.length}):*\n`;
            for (const [cat, skills] of Object.entries(grouped)) {
              msg += `\n*${cat.toUpperCase()}*\n`;
              for (const s of skills) msg += `• ${s.display_name} — ${s.description.substring(0, 80)}\n`;
            }
            return { success: true, skills: data, message: msg };
          } catch (e) { return { success: false, error: e.message }; }
        }

        default: return { success: false, error: `Tool desconocida: ${name}` };
      }
    } catch (err) {
      console.error(`[gateway] tool ${name} error:`, err.message);
      return { success: false, error: err.message };
    }
  }

  const gwSessions = new Map(); // sessionKey -> { history: [], systemPrompt: string }
  const GW_MAX_HISTORY = 6;  // Only last 3 exchanges — prevents LLM from re-processing old tasks

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

    // Add a dynamic system instruction reminding the LLM what the CURRENT request is
    // This prevents the LLM from re-processing old conversation messages as new tasks
    const currentRequestReminder = `\n\n---\nCURRENT USER REQUEST (this is the ONLY thing you should act on):\n"${message.substring(0, 500)}"\n\nDo NOT create tasks or take actions based on previous messages in the conversation. Only respond to the request above.`;

    for (let i = 0; i < 10; i++) {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: systemPrompt + (i === 0 ? currentRequestReminder : ''),
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
                // Extract readable text from result — prefer human-friendly format
                const textContent = r?.reply || r?.result_text || r?.result?.text || r?.text || r?.message || r?.result || resultStr;
                const msg = typeof textContent === "string" ? textContent : formatToolResultForWhatsApp(b.name, textContent);
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
      // Aggressive history trim — keep only last 6 messages (3 exchanges)
      // This prevents the LLM from seeing old delegated tasks and re-creating them
      if (history.length > GW_MAX_HISTORY) session.history = history.slice(-GW_MAX_HISTORY);
      // Also enforce a character limit
      const MAX_HISTORY_CHARS = 8000;
      let totalChars = history.reduce((sum, m) => sum + JSON.stringify(m.content).length, 0);
      while (totalChars > MAX_HISTORY_CHARS && history.length > 2) {
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
