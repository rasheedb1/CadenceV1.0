/**
 * A2A Protocol Server for OpenClaw Agents
 *
 * Implements Google's Agent-to-Agent (A2A) protocol v0.3.0 using @a2a-js/sdk.
 * - Serves Agent Card at /.well-known/agent-card.json
 * - Handles message/send JSON-RPC at /a2a/jsonrpc
 * - Proxies all other requests to OpenClaw gateway on localhost:18789
 * - Logs all exchanges to agent_messages table (audit trail)
 *
 * Env vars:
 *   PORT          — Railway-exposed port (default 8080)
 *   GATEWAY_PORT  — Internal OpenClaw gateway port (default 18789)
 *   AGENT_ID      — UUID of this agent
 *   AGENT_NAME    — Display name (e.g. "Sofía")
 *   AGENT_ROLE    — Role description (e.g. "Senior UX/UI Designer")
 *   ORG_ID        — Organization UUID
 *   A2A_TOKEN     — Bearer token for authenticating incoming A2A requests
 *   SUPABASE_URL  — For audit trail logging
 *   SUPABASE_SERVICE_ROLE_KEY — For audit trail logging
 */

const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const { randomUUID } = require("crypto");

// A2A SDK imports
const {
  DefaultRequestHandler,
  InMemoryTaskStore,
  DefaultExecutionEventBusManager,
} = require("@a2a-js/sdk/server");
const {
  jsonRpcHandler,
  agentCardHandler,
  UserBuilder,
} = require("@a2a-js/sdk/server/express");

// --- Environment ---
const PORT = parseInt(process.env.PORT || "8080", 10);
const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || "18789", 10);
const AGENT_ID = process.env.AGENT_ID || "unknown";
const AGENT_NAME = process.env.AGENT_NAME || "Agent";
const AGENT_ROLE = process.env.AGENT_ROLE || "AI Agent";
const ORG_ID = process.env.ORG_ID || "";
const A2A_TOKEN = process.env.A2A_TOKEN || "";
const SB_URL = process.env.SUPABASE_URL || "";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}`;

// --- Supabase helper for audit trail ---
async function logToAgentMessages(fromAgentId, toAgentId, role, content, metadata = {}) {
  if (!SB_URL || !SB_KEY) return;
  try {
    await fetch(`${SB_URL}/rest/v1/agent_messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SB_KEY}`,
        apikey: SB_KEY,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        org_id: ORG_ID,
        from_agent_id: fromAgentId || null,
        to_agent_id: toAgentId || null,
        role,
        content: typeof content === "string" ? content : JSON.stringify(content),
        metadata,
      }),
    });
  } catch (err) {
    console.error("[a2a] Audit log error:", err.message);
  }
}

// --- OpenClaw Gateway integration ---
async function sendToGateway(message, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    return data.choices?.[0]?.message?.content || "";
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// --- Agent Card ---
const agentCard = {
  name: AGENT_NAME,
  description: AGENT_ROLE,
  url: `https://${process.env.RAILWAY_PUBLIC_DOMAIN || "localhost:" + PORT}/a2a/jsonrpc`,
  protocolVersion: "0.3.0",
  skills: [
    {
      id: "general",
      name: "General Task Execution",
      description: `Execute tasks as ${AGENT_ROLE}`,
    },
  ],
  capabilities: {
    streaming: false,
    pushNotifications: false,
  },
  securitySchemes: A2A_TOKEN
    ? { bearerAuth: { type: "http", scheme: "bearer" } }
    : undefined,
};

// --- A2A Executor ---
// Implements AgentExecutor interface from @a2a-js/sdk/server
const openClawExecutor = {
  async execute(requestContext, eventBus) {
    const userMessage = requestContext.userMessage;
    const taskId = requestContext.taskId;

    // Extract text from message parts
    const textParts = (userMessage.parts || [])
      .filter((p) => p.kind === "text")
      .map((p) => p.text);
    const instruction = textParts.join("\n") || "";

    if (!instruction) {
      // Publish completed with empty response
      eventBus.publish({
        kind: "message",
        messageId: randomUUID(),
        role: "agent",
        parts: [{ kind: "text", text: "No instruction received." }],
      });
      eventBus.finished();
      return;
    }

    // Extract sender info from metadata if available
    const fromAgentId =
      userMessage.metadata?.from_agent_id || null;

    console.log(
      `[a2a] Executing: "${instruction.substring(0, 80)}" (task=${taskId}, from=${fromAgentId || "unknown"})`
    );

    // Log incoming message (audit trail)
    logToAgentMessages(fromAgentId, AGENT_ID, "user", instruction, {
      a2a: true,
      task_id: taskId,
      context_id: requestContext.contextId,
    });

    // Publish "working" status
    eventBus.publish({
      kind: "status-update",
      taskId,
      status: { state: "working", message: { parts: [{ kind: "text", text: "Processing..." }] } },
    });

    try {
      const result = await sendToGateway(instruction);

      console.log(
        `[a2a] Result: "${(result || "").substring(0, 80)}" (task=${taskId})`
      );

      // Log outgoing response (audit trail)
      logToAgentMessages(AGENT_ID, fromAgentId, "assistant", result, {
        a2a: true,
        task_id: taskId,
      });

      // Publish result as message
      eventBus.publish({
        kind: "message",
        messageId: randomUUID(),
        role: "agent",
        parts: [{ kind: "text", text: result || "(no response)" }],
      });
    } catch (err) {
      console.error(`[a2a] Execution error:`, err.message);

      eventBus.publish({
        kind: "status-update",
        taskId,
        status: {
          state: "failed",
          message: {
            parts: [{ kind: "text", text: `Error: ${err.message}` }],
          },
        },
      });
    }

    eventBus.finished();
  },

  async cancelTask(taskId, eventBus) {
    console.log(`[a2a] Cancel requested for task ${taskId}`);
    eventBus.publish({
      kind: "status-update",
      taskId,
      status: { state: "canceled" },
    });
    eventBus.finished();
  },
};

// --- Build A2A Request Handler ---
const taskStore = new InMemoryTaskStore();
const eventBusManager = new DefaultExecutionEventBusManager();
const requestHandler = new DefaultRequestHandler(
  agentCard,
  taskStore,
  openClawExecutor,
  eventBusManager
);

// --- Express App ---
const app = express();

// Health check (before auth)
app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    agent_id: AGENT_ID,
    agent_name: AGENT_NAME,
    protocol: "a2a/0.3.0",
    uptime_seconds: Math.floor(process.uptime()),
  });
});

// Bearer token auth middleware for A2A endpoints
function a2aAuth(req, res, next) {
  if (!A2A_TOKEN) return next(); // No token configured = open access

  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "Missing Authorization header" });

  const token = auth.replace("Bearer ", "");
  if (token !== A2A_TOKEN && token !== SB_KEY) {
    return res.status(403).json({ error: "Invalid token" });
  }
  next();
}

// A2A Agent Card endpoint
app.use(
  "/.well-known/agent-card.json",
  agentCardHandler({ agentCardProvider: async () => agentCard })
);

// A2A JSON-RPC endpoint
app.use(
  "/a2a/jsonrpc",
  a2aAuth,
  express.json(),
  jsonRpcHandler({
    requestHandler,
    userBuilder: UserBuilder.noAuthentication,
  })
);

// Legacy endpoints for backward compatibility (used by existing bridge tools)
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    agent_id: AGENT_ID,
    agent_name: AGENT_NAME,
    protocol: "a2a/0.3.0",
    uptime_seconds: Math.floor(process.uptime()),
  });
});

app.get("/api/status", (_req, res) => {
  res.json({
    status: "active",
    agent_id: AGENT_ID,
    agent_name: AGENT_NAME,
    protocol: "a2a/0.3.0",
    uptime_seconds: Math.floor(process.uptime()),
  });
});

// Proxy everything else to OpenClaw gateway (control UI, sessions, etc.)
app.use(
  "/",
  createProxyMiddleware({
    target: GATEWAY_URL,
    changeOrigin: true,
    ws: true,
    onError: (err, _req, res) => {
      console.error("[a2a] Proxy error:", err.message);
      if (res.headersSent) return;
      res.status(502).json({ error: "Gateway unavailable", details: err.message });
    },
  })
);

// --- Start ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🔗 A2A Server running on http://0.0.0.0:${PORT}`);
  console.log(`   Agent: ${AGENT_NAME} (${AGENT_ROLE})`);
  console.log(`   Agent ID: ${AGENT_ID}`);
  console.log(`   Gateway: ${GATEWAY_URL}`);
  console.log(`   A2A endpoint: /a2a/jsonrpc`);
  console.log(`   Agent Card: /.well-known/agent-card.json`);
  console.log(`   Auth: ${A2A_TOKEN ? "Bearer token" : "OPEN (no A2A_TOKEN set)"}`);
});
