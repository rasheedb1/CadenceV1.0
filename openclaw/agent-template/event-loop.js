/**
 * Agent Event Loop — Proactive autonomous work cycle
 *
 * Runs alongside the A2A server via setInterval. Every tick:
 *   SENSE → THINK → ACT → REFLECT
 *
 * Adaptive interval: 30s when busy, up to 5min when idle.
 * Shares a mutex lock with the A2A server to avoid concurrent LLM calls.
 */

const { execFile } = require("child_process");
const { randomUUID } = require("crypto");

// --- Config from env ---
const AGENT_ID = process.env.AGENT_ID || "";
const AGENT_NAME = process.env.AGENT_NAME || "Agent";
const AGENT_ROLE = process.env.AGENT_ROLE || "AI Agent";
const ORG_ID = process.env.ORG_ID || "";
const SB_URL = process.env.SUPABASE_URL || "";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const MIN_INTERVAL = 30000;    // 30s when busy
const MAX_INTERVAL = 300000;   // 5min when idle
const DEFAULT_INTERVAL = 60000; // 1min default
const STALL_WINDOW = 3;

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
  recentActions: [], // last N (action, taskId) for stall detection
  lastSenseTime: null,
};

const sbHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${SB_KEY}`,
  apikey: SB_KEY,
};

// --- Supabase REST helper ---
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!res.ok) return [];
  return res.json();
}

async function sbPost(path, body) {
  const res = await fetch(`${SB_URL}/${path}`, {
    method: "POST",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  return res;
}

async function sbPatch(path, body) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  return res;
}

// ============================================================
// SENSE — gather context from DB
// ============================================================
async function sense() {
  if (!SB_URL || !SB_KEY || !AGENT_ID) return {};

  const since = state.lastSenseTime || new Date(Date.now() - 600000).toISOString();
  const now = new Date().toISOString();
  state.lastSenseTime = now;

  const [inbox, myTasks, availableTasks, budget, heartbeats] = await Promise.all([
    // 1. Inbox messages (recent, to me)
    sbGet(
      `agent_messages?to_agent_id=eq.${AGENT_ID}&created_at=gt.${since}&order=created_at.desc&limit=5&select=from_agent_id,content,created_at`
    ).catch(() => []),

    // 2. My assigned tasks on the blackboard
    sbGet(
      `project_board?assignee_agent_id=eq.${AGENT_ID}&status=in.(claimed,working)&order=priority.desc&limit=5&select=id,title,content,status,priority`
    ).catch(() => []),

    // 3. Available tasks I could claim
    sbGet(
      `project_board?status=eq.available&entry_type=eq.task&org_id=eq.${ORG_ID}&order=priority.desc&limit=5&select=id,title,content,priority`
    ).catch(() => []),

    // 4. My budget
    sbGet(
      `agent_budgets?agent_id=eq.${AGENT_ID}&limit=1&select=tokens_used,max_tokens,cost_usd,max_cost_usd,iterations_used,max_iterations`
    ).catch(() => []),

    // 5. Who's online
    sbGet(
      `agent_heartbeats?last_seen=gt.${new Date(Date.now() - 300000).toISOString()}&select=agent_id,status,current_task`
    ).catch(() => []),
  ]);

  return {
    inbox: Array.isArray(inbox) ? inbox : [],
    myTasks: Array.isArray(myTasks) ? myTasks : [],
    availableTasks: Array.isArray(availableTasks) ? availableTasks : [],
    budget: Array.isArray(budget) && budget[0] ? budget[0] : null,
    onlineAgents: Array.isArray(heartbeats) ? heartbeats : [],
  };
}

// ============================================================
// THINK — ask LLM what to do next
// ============================================================
function think(context) {
  return new Promise((resolve, reject) => {
    const budgetStr = context.budget
      ? `${context.budget.tokens_used || 0}/${context.budget.max_tokens || "∞"} tokens, $${context.budget.cost_usd || 0}/${context.budget.max_cost_usd || "∞"}`
      : "No budget tracking";

    // Format tasks with their content/description
    const fmtTask = (t) => {
      const desc = typeof t.content === "object" ? (t.content.description || JSON.stringify(t.content)) : (t.content || "");
      return `- [${t.id}] ${t.title} (pri=${t.priority}) — ${desc.substring(0, 150)}`;
    };

    const prompt = `SYSTEM: You are an autonomous AI agent. Return ONLY a JSON object, no other text.

CONTEXT:
- Name: ${AGENT_NAME}, Role: ${AGENT_ROLE}
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
        // Estimate tokens for budget tracking (~4 chars/token)
        state.budget.tokens += Math.ceil((prompt.length + raw.length) / 4);
        state.budget.iterations++;

        // Extract JSON from response (may be wrapped in markdown)
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

// ============================================================
// ACT — execute the decision
// ============================================================
async function act(decision) {
  const { action, params = {} } = decision;
  console.log(`[event-loop] ACT: ${action} — ${decision.reasoning || ""}`);

  switch (action) {
    case "work_on_task": {
      if (!params.task_id || !params.instruction) break;
      // Mark task as working
      await sbPatch(`project_board?id=eq.${params.task_id}`, { status: "working" });
      // Call LLM via gateway
      const result = await callGateway(params.instruction, `task-${params.task_id}`);
      console.log(`[event-loop] Task ${params.task_id} result: ${(result || "").substring(0, 100)}`);
      return result;
    }

    case "claim_task": {
      if (!params.task_id) break;
      // Use PATCH to blackboard edge function for atomic claim
      const claimRes = await fetch(`${SB_URL}/functions/v1/blackboard`, {
        method: "PATCH",
        headers: sbHeaders,
        body: JSON.stringify({ entry_id: params.task_id, action: "claim", agent_id: AGENT_ID }),
      });
      const claimData = await claimRes.json().catch(() => ({}));
      console.log(`[event-loop] Claimed task ${params.task_id}: ${claimData.entry?.status || "failed"}`);
      return claimData.entry?.status === "claimed" ? "claimed" : "claim_failed";
    }

    case "send_message": {
      if (!params.to_agent || !params.message) break;
      return new Promise((resolve) => {
        execFile(
          "node",
          ["/home/node/.openclaw/a2a-send.js", params.to_agent, params.message],
          { timeout: 120000, env: { ...process.env, HOME: "/home/node" } },
          (err, stdout) => {
            if (err) { console.error("[event-loop] send_message error:", err.message); return resolve("send_error"); }
            resolve((stdout || "").trim());
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

    case "complete_task": {
      if (!params.task_id) break;
      await fetch(`${SB_URL}/functions/v1/blackboard`, {
        method: "PATCH",
        headers: sbHeaders,
        body: JSON.stringify({ entry_id: params.task_id, action: "complete", result: params.result_summary || "Done" }),
      });
      console.log(`[event-loop] Completed task ${params.task_id}`);
      return "completed";
    }

    case "idle":
    default:
      return null;
  }
  return null;
}

// --- Call OpenClaw gateway (same pattern as a2a-server.js) ---
function callGateway(message, sessionKey = "event-loop") {
  return new Promise((resolve, reject) => {
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
      (error, stdout, stderr) => {
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
// REFLECT — update state, heartbeat, budget, stall guard
// ============================================================
async function reflect(decision) {
  const action = decision?.action || "idle";
  const taskId = decision?.params?.task_id || null;

  // --- Adaptive interval ---
  if (action === "idle") {
    state.consecutiveIdles++;
    state.interval = Math.min(state.interval * 2, MAX_INTERVAL);
  } else {
    state.consecutiveIdles = 0;
    state.interval = Math.max(Math.floor(state.interval / 2), MIN_INTERVAL);
    state.lastAction = action;
    state.lastActionTime = new Date().toISOString();
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
    }
  }

  // --- Heartbeat ---
  if (SB_URL && SB_KEY && AGENT_ID) {
    const heartbeat = {
      agent_id: AGENT_ID,
      status: action === "idle" ? "idle" : "working",
      current_task: action === "idle" ? null : (taskId || action),
      last_seen: new Date().toISOString(),
      loop_iteration: state.iteration,
    };
    // Upsert via POST with on-conflict
    await fetch(`${SB_URL}/rest/v1/agent_heartbeats`, {
      method: "POST",
      headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(heartbeat),
    }).catch(() => {});
  }

  // --- Budget tracking to DB ---
  if (SB_URL && SB_KEY && AGENT_ID && state.budget.iterations % 5 === 0) {
    await sbPost("rest/v1/rpc/update_agent_budget", {
      p_agent_id: AGENT_ID,
      p_tokens: state.budget.tokens,
    }).catch(() => {});
  }

  // Reschedule
  reschedule();
}

// ============================================================
// TICK — one full cycle
// ============================================================
async function tick() {
  if (!state.running) return;
  if (state.busy) {
    console.log("[event-loop] Skipping tick — busy (A2A request in progress)");
    reschedule();
    return;
  }

  state.iteration++;
  console.log(`[event-loop] === Tick #${state.iteration} (interval=${Math.round(state.interval / 1000)}s) ===`);

  // Budget guard
  if (state.iteration > state.maxIterations) {
    console.warn("[event-loop] Max iterations reached, stopping.");
    stop();
    return;
  }

  state.busy = true;
  let decision = { action: "idle", reasoning: "default", params: {} };

  try {
    const context = await sense();
    decision = await think(context);
    await act(decision);
  } catch (err) {
    console.error("[event-loop] Tick error:", err.message);
  } finally {
    state.busy = false;
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
  console.log(`[event-loop] Starting for ${AGENT_NAME} (${AGENT_ID}), interval=${DEFAULT_INTERVAL / 1000}s`);
  state.running = true;
  state.interval = DEFAULT_INTERVAL;
  // First tick after a short delay to let the A2A server boot
  state.timer = setTimeout(tick, 5000);
}

function stop() {
  console.log("[event-loop] Stopping");
  state.running = false;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

/** A2A server calls this before processing a request */
function acquireLock() {
  state.busy = true;
}

/** A2A server calls this after processing a request */
function releaseLock() {
  state.busy = false;
}

function getState() {
  return {
    running: state.running,
    busy: state.busy,
    iteration: state.iteration,
    interval: state.interval,
    consecutiveIdles: state.consecutiveIdles,
    lastAction: state.lastAction,
    lastActionTime: state.lastActionTime,
    budget: { ...state.budget },
  };
}

module.exports = { start, stop, acquireLock, releaseLock, getState };
