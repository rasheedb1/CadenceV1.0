const express = require("express");
const Anthropic = require("@anthropic-ai/sdk").default;

// --- Environment ---
const {
  PORT = "8080",
  SOUL_MD = "",
  AGENT_ID = "unknown",
  ORG_ID = "",
  ANTHROPIC_API_KEY,
  SUPABASE_URL: SB_URL,
  SUPABASE_SERVICE_ROLE_KEY: SB_KEY,
  AUTH_TOKEN,
  CLAUDE_MODEL = "claude-sonnet-4-6",
  AGENT_TOOLS = "[]",
} = process.env;

if (!ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY — agent cannot process tasks");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const app = express();
app.use(express.json({ limit: "5mb" }));

// Parse tools from env + add built-in tools
let agentTools = [];
try { agentTools = JSON.parse(AGENT_TOOLS); } catch { console.error("[agent] Failed to parse AGENT_TOOLS"); }

// Always add registrar_aprendizaje tool
agentTools.push({
  name: "registrar_aprendizaje",
  description: "Registra un aprendizaje o lección aprendida después de completar una tarea. Usa esto para mejorar con el tiempo — guarda patrones, preferencias del cliente, estrategias efectivas, errores a evitar.",
  input_schema: { type: "object", properties: { category: { type: "string", description: "Categoría: prospecting, outreach, company_research, cadences, general" }, learning: { type: "string", description: "El aprendizaje en lenguaje natural" }, context: { type: "string", description: "Contexto adicional (empresa, industria, etc.)" }, task_id: { type: "string", description: "ID de la tarea relacionada" } }, required: ["learning"] },
});

console.log(`[agent] Loaded ${agentTools.length} tools`);

// --- Auth middleware ---
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !AUTH_TOKEN) return res.status(401).json({ error: "Unauthorized" });
  const token = auth.replace("Bearer ", "");
  if (token !== AUTH_TOKEN && token !== SB_KEY) return res.status(403).json({ error: "Forbidden" });
  next();
}

// --- State ---
let activeTasks = 0;
const startTime = Date.now();
const MAX_HISTORY = 50;

// =====================================================
// SUPABASE HELPERS (same pattern as gateway)
// =====================================================

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

// =====================================================
// PERSISTENT MEMORY
// =====================================================

async function loadMemory(sessionKey = "default") {
  try {
    const p = new URLSearchParams({
      agent_id: `eq.${AGENT_ID}`,
      session_key: `eq.${sessionKey}`,
      select: "role,content",
      order: "created_at.asc",
      limit: String(MAX_HISTORY),
    });
    const rows = await sbFetch(`${SB_URL}/rest/v1/agent_conversation_history?${p}`, { headers: sbHeaders() });
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const messages = [];
    for (const r of rows) {
      if (r.role === "user" && typeof r.content === "string") {
        messages.push({ role: "user", content: r.content });
      } else if (r.role === "assistant" && Array.isArray(r.content)) {
        const textBlocks = r.content.filter(b => b.type === "text" && b.text);
        if (textBlocks.length > 0) messages.push({ role: "assistant", content: textBlocks });
      }
    }
    console.log(`[agent] Loaded ${messages.length} messages from memory (${sessionKey})`);
    return messages;
  } catch (err) {
    console.error("[agent] loadMemory error:", err.message);
    return [];
  }
}

async function saveMessage(sessionKey, role, content) {
  try {
    await sbFetch(`${SB_URL}/rest/v1/agent_conversation_history`, {
      method: "POST",
      headers: { ...sbHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({ agent_id: AGENT_ID, session_key: sessionKey, role, content: typeof content === "string" ? content : content }),
    });
  } catch (err) {
    console.error("[agent] saveMessage error:", err.message);
  }
}

// =====================================================
// TOOL EXECUTION (mirrors gateway gwExecuteTool)
// =====================================================

async function agentExecuteTool(name, args) {
  const base = SB_URL;
  try {
    switch (name) {
      // --- Sales tools ---
      case "buscar_prospectos":
        return await sbFetch(`${base}/functions/v1/cascade-search-company`, { method: "POST", headers: sbHeaders(true), body: JSON.stringify(args) });

      case "crear_cadencia": {
        const { steps, ...cd } = args;
        const cad = await sbFetch(`${base}/rest/v1/cadences`, { method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify({ ...cd, status: "draft" }) });
        const c = Array.isArray(cad) ? cad[0] : cad;
        if (!c?.id) return { success: false, error: "No se pudo crear la cadencia", details: cad };
        const rows = steps.map(s => ({ ...s, cadence_id: c.id, org_id: args.org_id }));
        const created = await sbFetch(`${base}/rest/v1/cadence_steps`, { method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify(rows) });
        return { success: true, cadence_id: c.id, cadence_name: c.name, steps_created: Array.isArray(created) ? created.length : 0 };
      }

      case "descubrir_empresas":
        return await sbFetch(`${base}/functions/v1/discover-icp-companies`, { method: "POST", headers: sbHeaders(true), body: JSON.stringify(args) });

      case "investigar_empresa":
        return await sbFetch(`${base}/functions/v1/company-research`, { method: "POST", headers: sbHeaders(true), body: JSON.stringify(args) });

      case "enriquecer_prospectos":
        return await sbFetch(`${base}/functions/v1/enrich-prospect`, { method: "POST", headers: sbHeaders(true), body: JSON.stringify(args) });

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

      case "enviar_mensaje":
        return await sbFetch(`${base}/functions/v1/linkedin-send-message`, { method: "POST", headers: sbHeaders(true), body: JSON.stringify(args) });

      case "enviar_email":
        return await sbFetch(`${base}/functions/v1/send-email`, { method: "POST", headers: sbHeaders(true), body: JSON.stringify(args) });

      case "business_case":
        return await sbFetch(`${base}/functions/v1/generate-business-case`, { method: "POST", headers: sbHeaders(true), body: JSON.stringify(args) });

      case "ver_metricas": {
        const cp = new URLSearchParams({ select: "*", org_id: `eq.${args.org_id}` });
        if (args.cadence_id) cp.set("id", `eq.${args.cadence_id}`);
        const ap = new URLSearchParams({ select: "activity_type,status,created_at", org_id: `eq.${args.org_id}`, limit: "1000" });
        if (args.cadence_id) ap.set("cadence_id", `eq.${args.cadence_id}`);
        const [cads, acts] = await Promise.all([
          sbFetch(`${base}/rest/v1/cadences?${cp}`, { headers: sbHeaders() }),
          sbFetch(`${base}/rest/v1/activity_log?${ap}`, { headers: sbHeaders() }),
        ]);
        return { success: true, cadences: cads, activities: acts };
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
          return { success: !!((Array.isArray(data) ? data[0] : data)?.id), lead: Array.isArray(data) ? data[0] : data };
        }
        if (operation === "update") {
          const data = await sbFetch(`${base}/rest/v1/leads?id=eq.${lead_id}&org_id=eq.${org_id}`, { method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify(updates) });
          return { success: !!((Array.isArray(data) ? data[0] : data)?.id), lead: Array.isArray(data) ? data[0] : data };
        }
        if (operation === "assign_to_cadence") {
          const ids = lead_ids?.length ? lead_ids : (lead_id ? [lead_id] : []);
          if (!ids.length) return { success: false, error: "Se requiere lead_id o lead_ids" };
          const rows = ids.map(id => ({ cadence_id, lead_id: id, org_id, status: "active", current_step: 1 }));
          const data = await sbFetch(`${base}/rest/v1/cadence_leads`, { method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify(rows) });
          return { success: true, assigned: Array.isArray(data) ? data.length : 0 };
        }
        return { success: false, error: `Operación desconocida: ${operation}` };
      }

      // --- Content tools ---
      case "gestionar_prompts": case "gestionar_templates": case "gestionar_personas": case "gestionar_perfiles_icp": {
        const tableMap = { gestionar_prompts: "ai_prompts", gestionar_templates: "templates", gestionar_personas: "buyer_personas", gestionar_perfiles_icp: "icp_profiles" };
        const table = tableMap[name];
        const { org_id, operation } = args;
        if (operation === "list") {
          const p = new URLSearchParams({ select: "*", org_id: `eq.${org_id}`, order: "created_at.desc", limit: String(args.filters?.limit || 20) });
          return { success: true, data: await sbFetch(`${base}/rest/v1/${table}?${p}`, { headers: sbHeaders() }) };
        }
        if (operation === "get") {
          const idField = name === "gestionar_prompts" ? "prompt_id" : name === "gestionar_templates" ? "template_id" : name === "gestionar_personas" ? "persona_id" : "profile_id";
          return { success: true, data: await sbFetch(`${base}/rest/v1/${table}?id=eq.${args[idField]}&org_id=eq.${org_id}`, { headers: sbHeaders() }) };
        }
        return { success: true, data: "Operación no soportada aún" };
      }

      // --- Calendar tools ---
      case "ver_calendario": {
        const dateFrom = args.date_from || new Date().toISOString().slice(0, 10);
        const dateTo = args.date_to || new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
        const ep = new URLSearchParams({ select: "*", order: "occurred_at.asc", limit: "50" });
        ep.set("activity_type", "eq.meeting");
        ep.set("occurred_at", `gte.${dateFrom}T00:00:00`);
        const evs = await sbFetch(`${base}/rest/v1/ae_activities?${ep}`, { headers: sbHeaders() });
        return { success: true, events: Array.isArray(evs) ? evs : [], total: Array.isArray(evs) ? evs.length : 0 };
      }

      case "buscar_slots_disponibles":
        return await sbFetch(`${base}/functions/v1/ae-calendar-free-slots`, { method: "POST", headers: sbHeaders(true), body: JSON.stringify(args) });

      case "crear_evento_calendario":
        return await sbFetch(`${base}/functions/v1/ae-calendar-create-event`, { method: "POST", headers: sbHeaders(true), body: JSON.stringify(args) });

      // --- Agent-to-agent ---
      case "comunicar_agente": {
        let target = null;
        if (args.agent_id) {
          const p = new URLSearchParams({ id: `eq.${args.agent_id}`, select: "id,name,role,status,railway_url", limit: "1" });
          const rows = await sbFetch(`${base}/rest/v1/agents?${p}`, { headers: sbHeaders() });
          if (Array.isArray(rows) && rows.length > 0) target = rows[0];
        } else if (args.agent_name) {
          const p = new URLSearchParams({ org_id: `eq.${ORG_ID}`, name: `ilike.%${args.agent_name}%`, status: "eq.active", select: "id,name,role,status,railway_url", limit: "1" });
          const rows = await sbFetch(`${base}/rest/v1/agents?${p}`, { headers: sbHeaders() });
          if (Array.isArray(rows) && rows.length > 0) target = rows[0];
        }
        if (!target) return { success: false, error: "Agente destino no encontrado." };
        if (!target.railway_url) return { success: false, error: `${target.name} no está desplegado.` };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        try {
          const res = await fetch(`${target.railway_url}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SB_KEY}` },
            body: JSON.stringify({ message: args.message, context: { org_id: ORG_ID, from_agent: AGENT_ID } }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const result = await res.json();
          // Log exchange
          await sbFetch(`${base}/rest/v1/agent_messages`, {
            method: "POST", headers: { ...sbHeaders(), Prefer: "return=minimal" },
            body: JSON.stringify([
              { org_id: ORG_ID, from_agent_id: AGENT_ID, to_agent_id: target.id, role: "user", content: args.message },
              { org_id: ORG_ID, from_agent_id: target.id, to_agent_id: AGENT_ID, role: "assistant", content: result.reply || JSON.stringify(result) },
            ]),
          });
          return { success: true, agent: target.name, reply: result.reply || result };
        } catch (err) {
          clearTimeout(timeout);
          return { success: false, error: `Error comunicando con ${target.name}: ${err.message}` };
        }
      }

      // --- Learning system ---
      case "registrar_aprendizaje": {
        const { category, learning, context: ctx, task_id } = args;
        if (!learning) return { success: false, error: "Falta el campo 'learning'" };
        const row = { agent_id: AGENT_ID, org_id: ORG_ID, category: category || "general", learning, context: ctx || null, source_task_id: task_id || null };
        await sbFetch(`${base}/rest/v1/agent_learnings`, { method: "POST", headers: { ...sbHeaders(), Prefer: "return=minimal" }, body: JSON.stringify(row) });
        console.log(`[agent] Learning saved: "${learning.substring(0, 80)}"`);
        return { success: true, message: "Aprendizaje registrado." };
      }

      default:
        return { success: false, error: `Tool ${name} no disponible en este agente.` };
    }
  } catch (err) {
    console.error(`[agent] tool ${name} error:`, err.message);
    return { success: false, error: err.message };
  }
}

// =====================================================
// CLAUDE WITH TOOLS + MEMORY
// =====================================================

async function callClaude(systemPrompt, userMessage, sessionKey = "default") {
  // Load persistent memory
  const savedHistory = await loadMemory(sessionKey);
  const history = [...savedHistory, { role: "user", content: userMessage }];

  // Save user message
  saveMessage(sessionKey, "user", userMessage);

  for (let i = 0; i < 10; i++) {
    const params = {
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: history,
    };
    if (agentTools.length > 0) params.tools = agentTools;

    const response = await anthropic.messages.create(params);
    history.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "tool_use") {
      const blocks = response.content.filter(b => b.type === "tool_use");
      const results = await Promise.all(blocks.map(async (b) => {
        console.log(`[agent] tool ${b.name}(${JSON.stringify(b.input).substring(0, 100)})`);
        const r = await agentExecuteTool(b.name, b.input);
        console.log(`[agent] tool ${b.name} → ${JSON.stringify(r).substring(0, 150)}`);
        return { type: "tool_result", tool_use_id: b.id, content: JSON.stringify(r) };
      }));
      history.push({ role: "user", content: results });
      continue;
    }

    const text = response.content.find(b => b.type === "text")?.text || "";
    // Save assistant response
    saveMessage(sessionKey, "assistant", response.content);
    return text;
  }
  return "No pude completar la tarea en el número máximo de iteraciones.";
}

// =====================================================
// SYSTEM PROMPT
// =====================================================

async function loadLearnings() {
  try {
    const p = new URLSearchParams({ agent_id: `eq.${AGENT_ID}`, select: "category,learning", order: "created_at.desc", limit: "30" });
    const rows = await sbFetch(`${SB_URL}/rest/v1/agent_learnings?${p}`, { headers: sbHeaders() });
    if (!Array.isArray(rows) || rows.length === 0) return "";
    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.category]) grouped[r.category] = [];
      grouped[r.category].push(r.learning);
    }
    let text = "\n\n## Aprendizajes Acumulados\nEstos son tus aprendizajes de tareas anteriores. Úsalos para ser más efectivo:\n";
    for (const [cat, items] of Object.entries(grouped)) {
      text += `\n### ${cat}\n${items.map(i => `- ${i}`).join("\n")}`;
    }
    return text;
  } catch (err) {
    console.error("[agent] loadLearnings error:", err.message);
    return "";
  }
}

async function buildSystemPrompt(extraContext) {
  let sp = SOUL_MD || `# Agent ${AGENT_ID}\n\nSoy un agente AI. Respondo en español.`;
  if (agentTools.length > 0) {
    sp += `\n\n## Herramientas disponibles\nTienes ${agentTools.length} herramientas. Úsalas cuando sea necesario para ejecutar acciones reales (buscar prospectos, enviar mensajes, investigar empresas, etc.). No inventes datos — usa las herramientas.`;
  }
  // Load accumulated learnings
  const learnings = await loadLearnings();
  if (learnings) sp += learnings;

  if (extraContext) {
    sp += `\n\n---\n\nCONTEXTO:\n${typeof extraContext === "string" ? extraContext : JSON.stringify(extraContext)}`;
  }
  return sp;
}

// =====================================================
// ROUTES
// =====================================================

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, agent_id: AGENT_ID, tools: agentTools.length, uptime_seconds: Math.floor((Date.now() - startTime) / 1000) });
});

app.get("/api/status", (_req, res) => {
  res.json({ status: "active", agent_id: AGENT_ID, active_tasks: activeTasks, tools: agentTools.length, uptime_seconds: Math.floor((Date.now() - startTime) / 1000) });
});

app.get("/api/tools", requireAuth, (_req, res) => {
  res.json({ tools: agentTools.map(t => ({ name: t.name, description: t.description })) });
});

// Task execution (formal, with tracking + memory)
app.post("/api/task", requireAuth, async (req, res) => {
  const { instruction, context, task_id } = req.body;
  if (!instruction) return res.status(400).json({ error: "Missing instruction" });

  activeTasks++;
  const sessionKey = task_id || "task-" + Date.now();
  console.log(`[agent] Task: "${instruction.substring(0, 80)}" (${sessionKey})`);

  if (task_id) {
    await sbFetch(`${SB_URL}/functions/v1/agent-task`, { method: "PATCH", headers: sbHeaders(true), body: JSON.stringify({ task_id, status: "in_progress" }) });
  }

  try {
    const systemPrompt = await buildSystemPrompt(context);
    const result = await callClaude(systemPrompt, instruction, sessionKey);

    if (task_id) {
      await sbFetch(`${SB_URL}/functions/v1/agent-task`, { method: "PATCH", headers: sbHeaders(true), body: JSON.stringify({ task_id, status: "completed", result: { text: result } }) });
    }

    console.log(`[agent] Done: "${result.substring(0, 80)}"`);
    activeTasks--;
    res.json({ success: true, result });
  } catch (err) {
    console.error(`[agent] Task error:`, err.message);
    if (task_id) {
      await sbFetch(`${SB_URL}/functions/v1/agent-task`, { method: "PATCH", headers: sbHeaders(true), body: JSON.stringify({ task_id, status: "failed", error: err.message }) });
    }
    activeTasks--;
    res.status(500).json({ success: false, error: err.message });
  }
});

// Chat (conversational, with memory but no formal task)
app.post("/api/chat", requireAuth, async (req, res) => {
  const { message, context } = req.body;
  if (!message) return res.status(400).json({ error: "Missing message" });

  const sessionKey = context?.from_agent || "chat";
  console.log(`[agent] Chat (${sessionKey}): "${message.substring(0, 80)}"`);

  try {
    const systemPrompt = await buildSystemPrompt(context);
    const reply = await callClaude(systemPrompt, message, sessionKey);
    console.log(`[agent] Reply: "${reply.substring(0, 80)}"`);
    res.json({ success: true, reply });
  } catch (err) {
    console.error(`[agent] Chat error:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
// BACKGROUND TASK POLLING
// =====================================================

async function pollPendingTasks() {
  try {
    const p = new URLSearchParams({ agent_id: `eq.${AGENT_ID}`, status: "eq.pending", order: "created_at.asc", limit: "1" });
    const tasks = await sbFetch(`${SB_URL}/rest/v1/agent_tasks?${p}`, { headers: sbHeaders() });
    if (!Array.isArray(tasks) || tasks.length === 0) return;

    const task = tasks[0];
    console.log(`[agent] Picked up pending task: ${task.id}`);
    activeTasks++;

    await sbFetch(`${SB_URL}/functions/v1/agent-task`, { method: "PATCH", headers: sbHeaders(true), body: JSON.stringify({ task_id: task.id, status: "in_progress" }) });

    try {
      const sp = await buildSystemPrompt({ org_id: task.org_id });
      const result = await callClaude(sp, task.instruction, `task-${task.id}`);
      await sbFetch(`${SB_URL}/functions/v1/agent-task`, { method: "PATCH", headers: sbHeaders(true), body: JSON.stringify({ task_id: task.id, status: "completed", result: { text: result } }) });
      console.log(`[agent] Completed pending task: ${task.id}`);
    } catch (err) {
      await sbFetch(`${SB_URL}/functions/v1/agent-task`, { method: "PATCH", headers: sbHeaders(true), body: JSON.stringify({ task_id: task.id, status: "failed", error: err.message }) });
      console.error(`[agent] Failed pending task ${task.id}:`, err.message);
    }
    activeTasks--;
  } catch (err) {
    console.error("[agent] pollPendingTasks error:", err.message);
  }
}

// Poll every 60 seconds
setInterval(pollPendingTasks, 60000);

// =====================================================
// START
// =====================================================

app.listen(parseInt(PORT, 10), "0.0.0.0", () => {
  console.log(`🤖 Agent ${AGENT_ID} running on http://0.0.0.0:${PORT}`);
  console.log(`   Model: ${CLAUDE_MODEL} | Tools: ${agentTools.length} | Org: ${ORG_ID || "not set"}`);
});
