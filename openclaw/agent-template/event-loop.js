/**
 * Agent Event Loop v2 — AI Workforce Engine
 *
 * Runs alongside the A2A server via setTimeout. Every tick:
 *   SENSE → THINK → ACT → REFLECT
 *
 * v2 changes:
 * - Queries agent_tasks_v2 with capabilities matching
 * - Atomic task claiming via claim_task_v2 RPC (FOR UPDATE SKIP LOCKED)
 * - Check-in engine: every N completed tasks → summary to agent_checkins
 * - Auto-pause: 5 consecutive idles → pause active projects + WhatsApp notify
 * - Model tiering: reads model config from agents table
 * - Updates agent availability in agents table
 */

const { execFile } = require("child_process");

// --- Anthropic official pricing (per million tokens, blended input+output avg) ---
// Source: https://docs.anthropic.com/en/docs/about-claude/models
// Blended = (input_price + output_price) / 2 for simplicity since we don't split in/out
const MODEL_PRICING = {
  "claude-opus-4-6":           { input: 15.00, output: 75.00, blended: 45.00 },   // $15/$75 per MTok
  "claude-opus-4-20250514":    { input: 15.00, output: 75.00, blended: 45.00 },
  "claude-sonnet-4-6":         { input: 3.00,  output: 15.00, blended: 9.00 },    // $3/$15 per MTok
  "claude-sonnet-4-20250514":  { input: 3.00,  output: 15.00, blended: 9.00 },
  "claude-haiku-4-5-20251001": { input: 0.80,  output: 4.00,  blended: 2.40 },    // $0.80/$4 per MTok
  "claude-haiku-3-5-20241022": { input: 0.80,  output: 4.00,  blended: 2.40 },
};
const DEFAULT_BLENDED_PRICE = 9.00; // Sonnet pricing as fallback

function getTokenCost(tokens, model) {
  const pricing = MODEL_PRICING[model] || null;
  const pricePerMTok = pricing ? pricing.blended : DEFAULT_BLENDED_PRICE;
  return parseFloat((tokens * pricePerMTok / 1_000_000).toFixed(6));
}

// --- Config from env ---
const AGENT_ID = process.env.AGENT_ID || "";
const AGENT_NAME = process.env.AGENT_NAME || "Agent";
const AGENT_ROLE = process.env.AGENT_ROLE || "AI Agent";
const ORG_ID = process.env.ORG_ID || "";
const SB_URL = process.env.SUPABASE_URL || "";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const MIN_INTERVAL = 10000;    // 10s when busy
const MAX_INTERVAL = 120000;   // 2min when idle
const DEFAULT_INTERVAL = 20000; // 20s default
const STALL_WINDOW = 3;
const IDLE_PAUSE_THRESHOLD = 5;        // consecutive idles before auto-pause
const CHECKIN_EVERY_N_TASKS = 3;       // generate check-in every N completed tasks
const CALLBACK_URL = "https://twilio-bridge-production-241b.up.railway.app/api/agent-callback";

// --- Circuit breaker for agent-to-agent messaging ---
const messageCounts = {};
const MSG_CIRCUIT_LIMIT = 10;
const MSG_CIRCUIT_WINDOW = 5 * 60 * 1000;

// --- State ---
const state = {
  running: false,
  busy: false,
  iteration: 0,
  interval: DEFAULT_INTERVAL,
  consecutiveIdles: 0,
  lastAction: null,
  lastActionTime: null,
  timer: null,
  budget: { tokens: 0, cost: 0, iterations: 0 },
  maxIterations: parseInt(process.env.EVENT_LOOP_MAX_ITERATIONS || "200", 10),
  recentActions: [],
  lastSenseTime: null,
  budgetFromDB: null,
  consecutiveErrors: 0,
  // v2 additions
  agentConfig: null,           // cached agent row (model, capabilities, tier, etc.)
  tasksCompletedSinceCheckin: 0,
};

const sbHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${SB_KEY}`,
  apikey: SB_KEY,
};

// --- Supabase REST helpers ---
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!res.ok) return [];
  return res.json();
}

async function sbPatch(path, body) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  return res;
}

async function sbRpc(fnName, body) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: sbHeaders,
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json();
}

// ============================================================
// SENSE — gather context from DB (v2: agent_tasks_v2 + agent config)
// ============================================================
async function sense() {
  if (!SB_URL || !SB_KEY || !AGENT_ID) return {};

  const since = state.lastSenseTime || new Date(Date.now() - 600000).toISOString();
  const now = new Date().toISOString();
  state.lastSenseTime = now;

  // Load agent config every 10 iterations (model, capabilities, tier)
  if (!state.agentConfig || state.iteration % 10 === 0) {
    const agentRows = await sbGet(
      `agents?id=eq.${AGENT_ID}&select=model,capabilities,tier,team,availability,temperature,max_tokens`
    ).catch(() => []);
    state.agentConfig = Array.isArray(agentRows) && agentRows[0] ? agentRows[0] : null;
  }

  const capabilities = state.agentConfig?.capabilities || [];

  const [inbox, myTasksV2, availableTasksV2, myTasksLegacy, availableTasksLegacy, budget, heartbeats] = await Promise.all([
    // 1. Inbox messages (recent, to me)
    sbGet(
      `agent_messages?to_agent_id=eq.${AGENT_ID}&created_at=gt.${since}&order=created_at.desc&limit=5&select=from_agent_id,content,created_at`
    ).catch(() => []),

    // 2. My assigned tasks on agent_tasks_v2
    sbGet(
      `agent_tasks_v2?assigned_agent_id=eq.${AGENT_ID}&status=in.(claimed,in_progress)&order=priority.asc&limit=5&select=id,title,description,task_type,status,priority`
    ).catch(() => []),

    // 3. Available v2 tasks I could claim (capabilities match done in claim_task_v2 RPC)
    sbGet(
      `agent_tasks_v2?status=eq.ready&assigned_agent_id=is.null&org_id=eq.${ORG_ID}&order=priority.asc&limit=5&select=id,title,description,task_type,priority,required_capabilities`
    ).catch(() => []),

    // 4. My assigned tasks on legacy blackboard (backward compat)
    sbGet(
      `project_board?assignee_agent_id=eq.${AGENT_ID}&status=in.(claimed,working)&order=priority.desc&limit=5&select=id,title,content,status,priority`
    ).catch(() => []),

    // 5. Available legacy tasks
    sbGet(
      `project_board?status=eq.available&entry_type=eq.task&org_id=eq.${ORG_ID}&order=priority.desc&limit=5&select=id,title,content,priority`
    ).catch(() => []),

    // 6. My budget
    sbGet(
      `agent_budgets?agent_id=eq.${AGENT_ID}&limit=1&select=tokens_used,max_tokens,cost_usd,max_cost_usd,iterations_used,max_iterations`
    ).catch(() => []),

    // 7. Who's online
    sbGet(
      `agent_heartbeats?last_seen=gt.${new Date(Date.now() - 300000).toISOString()}&select=agent_id,status,current_task`
    ).catch(() => []),
  ]);

  // Merge v2 + legacy tasks
  const safe = (arr) => Array.isArray(arr) ? arr : [];
  const myTasks = [...safe(myTasksV2), ...safe(myTasksLegacy)];
  const availableTasks = [...safe(availableTasksV2), ...safe(availableTasksLegacy)];

  return {
    inbox: safe(inbox),
    myTasks,
    availableTasks,
    budget: Array.isArray(budget) && budget[0] ? budget[0] : null,
    onlineAgents: safe(heartbeats),
    capabilities,
    isV2Available: safe(availableTasksV2).length > 0,
  };
}

// ============================================================
// THINK — ask LLM what to do next
// ============================================================
function think(context) {
  return new Promise((resolve) => {
    const budgetStr = context.budget
      ? `${context.budget.tokens_used || 0}/${context.budget.max_tokens || "∞"} tokens, $${context.budget.cost_usd || 0}/${context.budget.max_cost_usd || "∞"}`
      : "No budget tracking";

    const fmtTask = (t) => {
      const desc = typeof t.content === "object"
        ? (t.content?.description || JSON.stringify(t.content))
        : (t.description || t.content || "");
      return `- [${t.id}] ${t.title} (pri=${t.priority}, type=${t.task_type || "general"}) — ${(desc || "").substring(0, 150)}`;
    };

    const prompt = `SYSTEM: You are an autonomous AI agent. Return ONLY a JSON object, no other text.

CONTEXT:
- Name: ${AGENT_NAME}, Role: ${AGENT_ROLE}
- Capabilities: ${(context.capabilities || []).join(", ") || "general"}
- Loop iteration: ${state.iteration}
- Budget: ${budgetStr}

INBOX (${context.inbox.length}):
${context.inbox.length ? context.inbox.map((m) => `- ${(m.content || "").substring(0, 200)}`).join("\n") : "(empty)"}

MY TASKS (${context.myTasks.length}):
${context.myTasks.length ? context.myTasks.map(fmtTask).join("\n") : "(none assigned)"}

AVAILABLE TASKS (${context.availableTasks.length}):
${context.availableTasks.length ? context.availableTasks.map(fmtTask).join("\n") : "(none available)"}

ONLINE AGENTS: ${context.onlineAgents.length ? context.onlineAgents.map((a) => a.agent_id?.substring(0, 8)).join(", ") : "none"}

RESPOND WITH EXACTLY ONE JSON OBJECT:
{"action":"claim_task","reasoning":"...","params":{"task_id":"..."}}
{"action":"work_on_task","reasoning":"...","params":{"task_id":"...","instruction":"..."}}
{"action":"send_message","reasoning":"...","params":{"to_agent":"name","message":"..."}}
{"action":"complete_task","reasoning":"...","params":{"task_id":"...","result_summary":"..."}}
{"action":"idle","reasoning":"nothing to do","params":{}}

RULES:
1. If AVAILABLE TASKS has entries and MY TASKS is empty → claim_task (pick highest priority)
2. If MY TASKS has entries → work_on_task (use the task description as instruction)
3. If no tasks at all → idle
4. ONLY return JSON. No markdown, no explanation, no code blocks.`;

    execFile(
      "node",
      [
        "/app/dist/index.js", "agent",
        "--message", prompt,
        "--agent", "main",
        "--session-id", "event-loop",
        "--timeout", "120",
      ],
      { cwd: "/app", timeout: 150000, env: { ...process.env, HOME: "/home/node" } },
      (error, stdout, stderr) => {
        if (error) {
          console.error("[event-loop] THINK error:", error.message, (stderr || "").substring(0, 200));
          return resolve({ action: "idle", reasoning: "LLM call failed", params: {} });
        }
        const raw = (stdout || "").trim();
        state.budget.tokens += Math.ceil((prompt.length + raw.length) / 4);
        state.budget.iterations++;

        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.warn("[event-loop] THINK: no JSON in response:", raw.substring(0, 150));
          return resolve({ action: "idle", reasoning: "Could not parse LLM response", params: {} });
        }
        try {
          resolve(JSON.parse(jsonMatch[0]));
        } catch (e) {
          console.warn("[event-loop] THINK: invalid JSON:", e.message);
          resolve({ action: "idle", reasoning: "JSON parse error", params: {} });
        }
      }
    );
  });
}

// --- Log to agent_activity_events (Mission Control) ---
async function logActivity(eventType, toolName, content) {
  if (!SB_URL || !SB_KEY || !AGENT_ID) return;
  fetch(`${SB_URL}/rest/v1/agent_activity_events`, {
    method: "POST",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({
      agent_id: AGENT_ID, org_id: ORG_ID,
      event_type: eventType, tool_name: toolName,
      content: (typeof content === "string" ? content : JSON.stringify(content)).substring(0, 3000),
    }),
  }).catch(() => {});
}

// --- Log to agent_messages ---
async function logMessage(fromId, toId, role, content, metadata = {}) {
  if (!SB_URL || !SB_KEY) return;
  fetch(`${SB_URL}/rest/v1/agent_messages`, {
    method: "POST",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({
      org_id: ORG_ID, from_agent_id: fromId || null, to_agent_id: toId || null,
      role, content: (content || "").substring(0, 2000), metadata,
    }),
  }).catch(() => {});
}

// ============================================================
// ACT — execute the decision (v2: atomic claiming + v2 task ops)
// ============================================================
async function act(decision, context) {
  const { action, params = {} } = decision;
  console.log(`[event-loop] ACT: ${action} — ${decision.reasoning || ""}`);

  if (action !== "idle") {
    logActivity("event_loop_action", action, `${decision.reasoning || ""} | ${JSON.stringify(params).substring(0, 200)}`);
  }

  switch (action) {
    case "claim_task": {
      if (!params.task_id) break;

      // Try v2 atomic claim first
      if (context?.isV2Available) {
        const capabilities = state.agentConfig?.capabilities || [];
        const claimed = await sbRpc("claim_task_v2", {
          p_org_id: ORG_ID,
          p_agent_id: AGENT_ID,
          p_capabilities: capabilities,
        });
        if (claimed && Array.isArray(claimed) && claimed.length > 0) {
          console.log(`[event-loop] Claimed v2 task: ${claimed[0].id} — ${claimed[0].title}`);
          return "claimed_v2";
        }
      }

      // Fallback: legacy blackboard claim
      const claimRes = await fetch(`${SB_URL}/functions/v1/blackboard`, {
        method: "PATCH",
        headers: sbHeaders,
        body: JSON.stringify({ entry_id: params.task_id, action: "claim", agent_id: AGENT_ID }),
      });
      const claimData = await claimRes.json().catch(() => ({}));
      console.log(`[event-loop] Claimed legacy task ${params.task_id}: ${claimData.entry?.status || "failed"}`);
      return claimData.entry?.status === "claimed" ? "claimed" : "claim_failed";
    }

    case "work_on_task": {
      if (!params.task_id || !params.instruction) break;

      // Check if v2 task
      const isV2 = await sbGet(`agent_tasks_v2?id=eq.${params.task_id}&select=id`).catch(() => []);
      if (Array.isArray(isV2) && isV2.length > 0) {
        // Update v2 task status
        await sbPatch(`agent_tasks_v2?id=eq.${params.task_id}`, {
          status: "in_progress", started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
      } else {
        // Legacy blackboard
        await sbPatch(`project_board?id=eq.${params.task_id}`, { status: "working" });
      }

      const result = await callGateway(params.instruction, `task-${params.task_id}`);
      console.log(`[event-loop] Task ${params.task_id} result: ${(result || "").substring(0, 100)}`);
      logActivity("task_result", "work_on_task", `Task: ${params.task_id} | Result: ${(result || "").substring(0, 300)}`);
      return result;
    }

    case "complete_task": {
      if (!params.task_id) break;

      // Check if v2 task
      const isV2c = await sbGet(`agent_tasks_v2?id=eq.${params.task_id}&select=id`).catch(() => []);
      if (Array.isArray(isV2c) && isV2c.length > 0) {
        const taskTokens = state.budget.tokens;
        const taskCost = getTokenCost(taskTokens, state.agentConfig?.model || "claude-sonnet-4-6");
        await sbPatch(`agent_tasks_v2?id=eq.${params.task_id}`, {
          status: "done",
          completed_at: new Date().toISOString(),
          result: { summary: params.result_summary || "Done" },
          tokens_used: taskTokens,
          cost_usd: taskCost,
          updated_at: new Date().toISOString(),
        });
        // Dependency resolution happens via DB trigger
        state.tasksCompletedSinceCheckin++;
        console.log(`[event-loop] Completed v2 task ${params.task_id} (${state.tasksCompletedSinceCheckin} since last check-in)`);
      } else {
        // Legacy blackboard
        await fetch(`${SB_URL}/functions/v1/blackboard`, {
          method: "PATCH",
          headers: sbHeaders,
          body: JSON.stringify({ entry_id: params.task_id, action: "complete", result: params.result_summary || "Done" }),
        });
        state.tasksCompletedSinceCheckin++;
      }
      return "completed";
    }

    case "send_message": {
      if (!params.to_agent || !params.message) break;
      const now = Date.now();
      const mc = messageCounts[params.to_agent];
      if (mc && mc.resetAt > now) {
        if (mc.count >= MSG_CIRCUIT_LIMIT) {
          console.warn(`[event-loop] Circuit breaker: ${mc.count} msgs to ${params.to_agent}, skipping`);
          return "circuit_breaker";
        }
        mc.count++;
      } else {
        messageCounts[params.to_agent] = { count: 1, resetAt: now + MSG_CIRCUIT_WINDOW };
      }
      logMessage(AGENT_ID, null, "user", `→ ${params.to_agent}: ${params.message.substring(0, 3000)}`, { a2a_direct: true, to_agent_name: params.to_agent });
      return new Promise((resolve) => {
        execFile(
          "node",
          ["/home/node/.openclaw/a2a-send.js", params.to_agent, params.message],
          { timeout: 120000, env: { ...process.env, HOME: "/home/node" } },
          (err, stdout) => {
            if (err) { console.error("[event-loop] send_message error:", err.message); return resolve("send_error"); }
            const reply = (stdout || "").trim();
            logMessage(null, AGENT_ID, "assistant", `← ${params.to_agent}: ${reply.substring(0, 3000)}`, { a2a_direct: true, from_agent_name: params.to_agent });
            resolve(reply);
          }
        );
      });
    }

    case "post_to_board": {
      if (!params.title) break;
      await fetch(`${SB_URL}/functions/v1/blackboard`, {
        method: "POST",
        headers: sbHeaders,
        body: JSON.stringify({ org_id: ORG_ID, entry_type: "note", title: params.title, content: { text: params.content || "" }, written_by: AGENT_ID }),
      });
      return "posted";
    }

    case "idle":
    default:
      return null;
  }
  return null;
}

// --- Call OpenClaw gateway ---
function callGateway(message, sessionKey = "event-loop") {
  return new Promise((resolve) => {
    execFile(
      "node",
      [
        "/app/dist/index.js", "agent",
        "--message", message,
        "--agent", "main",
        "--session-id", sessionKey,
        "--timeout", "300",
      ],
      { cwd: "/app", timeout: 300000, env: { ...process.env, HOME: "/home/node" } },
      (error, stdout) => {
        if (error) {
          console.error("[event-loop] Gateway error:", error.message);
          return resolve(`(error: ${error.message})`);
        }
        const output = (stdout || "").trim();
        state.budget.tokens += Math.ceil((message.length + output.length) / 4);
        resolve(output || "(no response)");
      }
    );
  });
}

// ============================================================
// REFLECT — update state, heartbeat, check-in, auto-pause
// ============================================================
async function reflect(decision) {
  const action = decision?.action || "idle";
  const taskId = decision?.params?.task_id || null;

  // --- Adaptive interval ---
  if (action === "idle") {
    state.consecutiveIdles++;
    state.interval = Math.min(state.interval * 1.5, MAX_INTERVAL); // slower ramp-up
  } else {
    state.consecutiveIdles = 0;
    state.interval = MIN_INTERVAL; // immediately fast when working
    state.lastAction = action;
    state.lastActionTime = new Date().toISOString();
  }

  // --- Update agent availability ---
  if (SB_URL && SB_KEY && AGENT_ID) {
    const newAvailability = action === "idle" ? "available" : "working";
    sbPatch(`agents?id=eq.${AGENT_ID}`, { availability: newAvailability, updated_at: new Date().toISOString() }).catch(() => {});
  }

  // --- Auto-pause inactive projects ---
  if (action === "idle" && state.consecutiveIdles === IDLE_PAUSE_THRESHOLD && SB_URL && SB_KEY && AGENT_ID) {
    console.log(`[event-loop] ${IDLE_PAUSE_THRESHOLD} consecutive idles — auto-pausing active projects`);
    try {
      const activeProjects = await sbGet(
        `agent_projects?status=eq.active&assigned_agents=cs.{${AGENT_ID}}&select=id,name`
      ).catch(() => []);
      for (const proj of (Array.isArray(activeProjects) ? activeProjects : [])) {
        console.warn(`[event-loop] Auto-pausing project "${proj.name}" (${proj.id})`);
        await sbPatch(`agent_projects?id=eq.${proj.id}`, { status: "paused", updated_at: new Date().toISOString() });
        fetch(CALLBACK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_name: AGENT_NAME,
            result: { text: `⏸️ Proyecto "${proj.name}" pausado — ${AGENT_NAME} no tiene más tareas. Envía un mensaje para reactivar.` },
            whatsapp_number: null,
          }),
        }).catch(() => {});
      }
    } catch (err) {
      console.error("[event-loop] Auto-pause error:", err.message);
    }
  }

  // --- Check-in engine: every N completed tasks → generate summary ---
  if (state.tasksCompletedSinceCheckin >= CHECKIN_EVERY_N_TASKS && SB_URL && SB_KEY && AGENT_ID) {
    console.log(`[event-loop] Check-in: ${state.tasksCompletedSinceCheckin} tasks completed, generating summary`);
    state.tasksCompletedSinceCheckin = 0;
    try {
      // Get recently completed tasks for the summary
      const recentDone = await sbGet(
        `agent_tasks_v2?assigned_agent_id=eq.${AGENT_ID}&status=eq.done&order=completed_at.desc&limit=${CHECKIN_EVERY_N_TASKS}&select=title,result`
      ).catch(() => []);
      const taskNames = (Array.isArray(recentDone) ? recentDone : []).map(t => t.title).join(", ");

      // Get pending tasks count
      const pending = await sbGet(
        `agent_tasks_v2?assigned_agent_id=eq.${AGENT_ID}&status=in.(ready,backlog)&select=id`
      ).catch(() => []);
      const pendingCount = Array.isArray(pending) ? pending.length : 0;

      const summary = `Completé ${CHECKIN_EVERY_N_TASKS} tareas: ${taskNames || "varias"}. ${pendingCount > 0 ? `Tengo ${pendingCount} más en mi backlog.` : "Mi backlog está vacío."}`;

      await fetch(`${SB_URL}/rest/v1/agent_checkins`, {
        method: "POST",
        headers: { ...sbHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({
          org_id: ORG_ID,
          agent_id: AGENT_ID,
          checkin_type: "standup",
          summary,
          next_steps: pendingCount > 0 ? "Continuar con las siguientes tareas del backlog" : "Esperando nuevas tareas",
          needs_approval: pendingCount === 0,
          fallback_action: "continue",
          expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        }),
      });

      // Notify via WhatsApp
      fetch(CALLBACK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_name: AGENT_NAME,
          result: { text: `📋 Check-in de ${AGENT_NAME}: ${summary}` },
          whatsapp_number: null,
        }),
      }).catch(() => {});

      logActivity("checkin", "standup", summary);
    } catch (err) {
      console.error("[event-loop] Check-in error:", err.message);
    }
  }

  // --- Stall detection ---
  state.recentActions.push({ action, taskId });
  if (state.recentActions.length > STALL_WINDOW) state.recentActions.shift();

  if (state.recentActions.length === STALL_WINDOW) {
    const allSame = state.recentActions.every(
      (a) => a.action === state.recentActions[0].action && a.taskId === state.recentActions[0].taskId
    );
    if (allSame && action !== "idle") {
      console.warn(`[event-loop] STALL detected: repeated ${action} on ${taskId} — forcing idle`);
      state.interval = MAX_INTERVAL;
      state.recentActions = [];
      fetch(CALLBACK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_name: AGENT_NAME,
          result: { text: `⚠️ ${AGENT_NAME} está trabado en: ${action} on ${taskId}. Necesita ayuda.` },
          whatsapp_number: null,
        }),
      }).catch(() => {});
    }
  }

  // --- Heartbeat ---
  if (SB_URL && SB_KEY && AGENT_ID) {
    await fetch(`${SB_URL}/rest/v1/agent_heartbeats`, {
      method: "POST",
      headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        agent_id: AGENT_ID,
        status: action === "idle" ? "idle" : "working",
        current_task: action === "idle" ? null : (taskId || action),
        last_seen: new Date().toISOString(),
        loop_iteration: state.iteration,
      }),
    }).catch(() => {});
  }

  // --- Sync budget ---
  if (action !== "idle" && SB_URL && SB_KEY && AGENT_ID) {
    await fetch(`${SB_URL}/rest/v1/agent_budgets`, {
      method: "POST",
      headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        agent_id: AGENT_ID,
        org_id: ORG_ID,
        tokens_used: state.budget.tokens,
        cost_usd: getTokenCost(state.budget.tokens, state.agentConfig?.model || "claude-sonnet-4-6"),
        iterations_used: state.budget.iterations,
      }),
    }).catch(() => {});
  }

  reschedule();
}

// ============================================================
// TICK — one full cycle
// ============================================================
async function tick() {
  if (!state.running) return;
  if (state.busy) {
    console.log("[event-loop] Skipping tick — busy");
    reschedule();
    return;
  }

  state.iteration++;
  console.log(`[event-loop] === Tick #${state.iteration} (interval=${Math.round(state.interval / 1000)}s) ===`);

  if (state.iteration > state.maxIterations) {
    console.warn("[event-loop] Max iterations reached, stopping.");
    stop();
    return;
  }

  // Budget enforcement (cached, refresh every 10 iterations)
  if (SB_URL && SB_KEY && AGENT_ID && (state.iteration % 10 === 0 || !state.budgetFromDB)) {
    const budgetRows = await sbGet(`agent_budgets?agent_id=eq.${AGENT_ID}&limit=1`).catch(() => []);
    state.budgetFromDB = Array.isArray(budgetRows) && budgetRows[0] ? budgetRows[0] : null;
  }
  if (state.budgetFromDB) {
    const b = state.budgetFromDB;
    if ((b.iterations_used || 0) >= (b.max_iterations || 200)) { console.warn("[event-loop] Budget: max iterations"); stop(); return; }
    if ((b.cost_usd || 0) >= (b.max_cost_usd || 10)) { console.warn("[event-loop] Budget: max cost"); stop(); return; }
  }

  state.busy = true;
  let decision = { action: "idle", reasoning: "default", params: {} };
  let tickError = false;
  let context = {};

  try {
    context = await sense();

    // --- FAST PATH: if v2 tasks available and nothing assigned, skip LLM and claim directly ---
    const hasMyTasks = context.myTasks && context.myTasks.length > 0;
    const hasAvailableV2 = context.isV2Available;

    if (!hasMyTasks && hasAvailableV2) {
      console.log("[event-loop] FAST PATH: v2 tasks available, claiming directly (skip THINK)");
      const capabilities = state.agentConfig?.capabilities || [];
      const claimed = await sbRpc("claim_task_v2", {
        p_org_id: ORG_ID,
        p_agent_id: AGENT_ID,
        p_capabilities: capabilities,
      });
      if (claimed && Array.isArray(claimed) && claimed.length > 0) {
        const task = claimed[0];
        console.log(`[event-loop] FAST CLAIM: ${task.id} — ${task.title}`);
        logActivity("event_loop_action", "claim_task", `FAST CLAIM: ${task.title} (pri=${task.priority}) | ${(task.description || "").substring(0, 200)}`);
        decision = { action: "claim_task", reasoning: "Fast path: v2 task available", params: { task_id: task.id } };
        // Immediately schedule next tick to work on the claimed task
        state.interval = MIN_INTERVAL;
      } else {
        console.log("[event-loop] FAST PATH: claim returned nothing (capabilities mismatch or race)");
        decision = await think(context);
        await act(decision, context);
      }
    } else if (hasMyTasks) {
      // Has assigned tasks — use THINK to decide what to do with them
      console.log("[event-loop] Has assigned tasks, using THINK");
      decision = await think(context);
      await act(decision, context);
    } else {
      // No v2 tasks, check legacy or truly idle
      decision = await think(context);
      await act(decision, context);
    }
  } catch (err) {
    console.error("[event-loop] Tick error:", err.message);
    tickError = true;
  } finally {
    state.busy = false;
  }

  // Error recovery: 3 consecutive errors → pause 10min
  if (tickError && decision.action !== "idle") {
    state.consecutiveErrors++;
  } else {
    state.consecutiveErrors = 0;
  }
  if (state.consecutiveErrors >= 3) {
    console.error("[event-loop] 3 consecutive errors, pausing 10min");
    state.interval = 600000;
    state.consecutiveErrors = 0;
  }

  await reflect(decision);
}

// --- Timer management ---
function reschedule() {
  if (state.timer) clearTimeout(state.timer);
  if (!state.running) return;
  state.timer = setTimeout(tick, state.interval);
}

// ============================================================
// Public API
// ============================================================
function start() {
  if (state.running) return;
  if (!AGENT_ID) {
    console.warn("[event-loop] No AGENT_ID set — event loop disabled");
    return;
  }
  console.log(`[event-loop] v2 Starting for ${AGENT_NAME} (${AGENT_ID}), interval=${DEFAULT_INTERVAL / 1000}s`);
  state.running = true;
  state.interval = DEFAULT_INTERVAL;
  state.timer = setTimeout(tick, 5000);
}

function stop() {
  console.log("[event-loop] Stopping");
  state.running = false;
  if (state.timer) { clearTimeout(state.timer); state.timer = null; }
  // Mark agent as offline
  if (SB_URL && SB_KEY && AGENT_ID) {
    sbPatch(`agents?id=eq.${AGENT_ID}`, { availability: "offline" }).catch(() => {});
  }
}

function acquireLock() { state.busy = true; }
function releaseLock() { state.busy = false; }

function getState() {
  return {
    running: state.running, busy: state.busy, iteration: state.iteration,
    interval: state.interval, consecutiveIdles: state.consecutiveIdles,
    consecutiveErrors: state.consecutiveErrors, lastAction: state.lastAction,
    lastActionTime: state.lastActionTime, budget: { ...state.budget },
    budgetFromDB: state.budgetFromDB, agentConfig: state.agentConfig,
    tasksCompletedSinceCheckin: state.tasksCompletedSinceCheckin,
  };
}

module.exports = { start, stop, acquireLock, releaseLock, getState };
