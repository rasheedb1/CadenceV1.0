const express = require("express");
const Anthropic = require("@anthropic-ai/sdk").default;

// --- Environment ---
const {
  PORT = "8080",
  SOUL_MD = "",
  AGENT_ID = "unknown",
  ORG_ID = "",
  ANTHROPIC_API_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  AUTH_TOKEN, // Token to validate incoming requests (use service role key)
  CLAUDE_MODEL = "claude-sonnet-4-6",
} = process.env;

if (!ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY — agent cannot process tasks");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const app = express();
app.use(express.json());

// --- Auth middleware ---
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !AUTH_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = auth.replace("Bearer ", "");
  if (token !== AUTH_TOKEN && token !== SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

// --- Task tracking ---
let activeTasks = 0;
const startTime = Date.now();

// --- Supabase helpers ---
async function sbFetch(path, opts = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      ...opts.headers,
    },
  });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { _raw: txt, _status: res.status }; }
}

// --- Claude conversation ---
async function callClaude(systemPrompt, userMessage, maxIterations = 10) {
  const messages = [{ role: "user", content: userMessage }];

  for (let i = 0; i < maxIterations; i++) {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    // If no tool use, extract text and return
    if (response.stop_reason !== "tool_use") {
      const text = response.content.find((b) => b.type === "text")?.text || "";
      return text;
    }

    // Handle tool calls (agent-specific tools can be added here in the future)
    const toolBlocks = response.content.filter((b) => b.type === "tool_use");
    const results = toolBlocks.map((b) => ({
      type: "tool_result",
      tool_use_id: b.id,
      content: JSON.stringify({ error: `Tool ${b.name} not available in this agent runtime` }),
    }));
    messages.push({ role: "user", content: results });
  }

  return "No pude completar la tarea en el número máximo de iteraciones.";
}

// --- Build system prompt ---
function buildSystemPrompt(extraContext) {
  let sp = SOUL_MD || `# Agent ${AGENT_ID}\n\nSoy un agente AI. Respondo en español.`;
  if (extraContext) {
    sp += `\n\n---\n\nCONTEXTO ADICIONAL:\n${JSON.stringify(extraContext)}`;
  }
  return sp;
}

// --- Routes ---

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    agent_id: AGENT_ID,
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
  });
});

// Status
app.get("/api/status", (_req, res) => {
  res.json({
    status: "active",
    agent_id: AGENT_ID,
    active_tasks: activeTasks,
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
  });
});

// Task execution (formal task with tracking)
app.post("/api/task", requireAuth, async (req, res) => {
  const { instruction, context, task_id } = req.body;
  if (!instruction) {
    return res.status(400).json({ error: "Missing instruction" });
  }

  activeTasks++;
  console.log(`[agent] Task received: "${instruction.substring(0, 80)}" (task_id=${task_id})`);

  // Update task status to in_progress
  if (task_id && SUPABASE_URL) {
    await sbFetch("/functions/v1/agent-task", {
      method: "PATCH",
      body: JSON.stringify({ task_id, status: "in_progress" }),
    });
  }

  try {
    const systemPrompt = buildSystemPrompt(context);
    const result = await callClaude(systemPrompt, instruction);

    // Update task as completed
    if (task_id && SUPABASE_URL) {
      await sbFetch("/functions/v1/agent-task", {
        method: "PATCH",
        body: JSON.stringify({ task_id, status: "completed", result: { text: result } }),
      });
    }

    console.log(`[agent] Task completed: "${result.substring(0, 80)}"`);
    activeTasks--;
    res.json({ success: true, result });
  } catch (err) {
    console.error(`[agent] Task error:`, err.message);

    if (task_id && SUPABASE_URL) {
      await sbFetch("/functions/v1/agent-task", {
        method: "PATCH",
        body: JSON.stringify({ task_id, status: "failed", error: err.message }),
      });
    }

    activeTasks--;
    res.status(500).json({ success: false, error: err.message });
  }
});

// Chat (quick Q&A, no formal task)
app.post("/api/chat", requireAuth, async (req, res) => {
  const { message, context } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Missing message" });
  }

  console.log(`[agent] Chat: "${message.substring(0, 80)}"`);

  try {
    const systemPrompt = buildSystemPrompt(context);
    const reply = await callClaude(systemPrompt, message);
    console.log(`[agent] Reply: "${reply.substring(0, 80)}"`);
    res.json({ success: true, reply });
  } catch (err) {
    console.error(`[agent] Chat error:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Start ---
app.listen(parseInt(PORT, 10), "0.0.0.0", () => {
  console.log(`🤖 Agent ${AGENT_ID} running on http://0.0.0.0:${PORT}`);
  console.log(`   Model: ${CLAUDE_MODEL}`);
  console.log(`   Org: ${ORG_ID || "not set"}`);
});
