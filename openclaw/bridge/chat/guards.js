/**
 * Concurrency, idempotency, cost cap, tool-loop and PII guards.
 * Single-instance only; if we ever scale the bridge horizontally we move to
 * Redis (BullMQ) — see plan v3 §V1 cut list.
 */

const { sb } = require("./supabase");

const LIMITS = {
  perUserConcurrent: Number(process.env.LIMIT_PER_USER || 3),
  perOrgConcurrent: Number(process.env.LIMIT_PER_ORG || 20),
  perAgentConcurrent: Number(process.env.LIMIT_PER_AGENT || 8),
  perTurnWallclockMs: Number(process.env.LIMIT_TURN_WALLCLOCK_MS || 90_000),
  perTurnDefaultCostUsd: Number(process.env.LIMIT_TURN_DEFAULT_COST_USD || 1.0),
  // Cap per same-tool calls in a turn. Plan v3 §A.6 originally specified 3 but
  // that's only sensible for expensive external tools (Apollo, Salesforce…).
  // Generic execution tools (Bash, Read, Write, Edit, Grep, Glob, Task) get
  // called dozens of times in legit workflows. Cost cap + wallclock are the
  // real safety nets; this cap only catches pathological runaways.
  toolLoopRepeatMax: Number(process.env.LIMIT_TOOL_REPEAT_MAX || 25),
  // Built-in coding tools exempt from the per-tool cap entirely.
  toolLoopExempt: new Set(
    (process.env.LIMIT_TOOL_LOOP_EXEMPT ||
      "Bash,Read,Write,Edit,MultiEdit,Grep,Glob,Task,WebFetch,WebSearch,TodoWrite,NotebookEdit"
    ).split(",").map((s) => s.trim()).filter(Boolean),
  ),
};

const turnsPerUser = new Map();
const turnsPerOrg = new Map();
const turnsPerAgent = new Map();

function tryAcquireSlot(userId, orgId, agentId) {
  const u = turnsPerUser.get(userId) || 0;
  const o = turnsPerOrg.get(orgId) || 0;
  const a = turnsPerAgent.get(agentId) || 0;
  if (u >= LIMITS.perUserConcurrent) return { error: "rate_limited", scope: "user" };
  if (o >= LIMITS.perOrgConcurrent) return { error: "rate_limited", scope: "org" };
  if (a >= LIMITS.perAgentConcurrent) return { error: "rate_limited", scope: "agent" };
  turnsPerUser.set(userId, u + 1);
  turnsPerOrg.set(orgId, o + 1);
  turnsPerAgent.set(agentId, a + 1);
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      turnsPerUser.set(userId, Math.max(0, (turnsPerUser.get(userId) || 1) - 1));
      turnsPerOrg.set(orgId, Math.max(0, (turnsPerOrg.get(orgId) || 1) - 1));
      turnsPerAgent.set(agentId, Math.max(0, (turnsPerAgent.get(agentId) || 1) - 1));
    },
  };
}

function snapshotCounters() {
  return {
    user: Object.fromEntries(turnsPerUser),
    org: Object.fromEntries(turnsPerOrg),
    agent: Object.fromEntries(turnsPerAgent),
  };
}

// ----- Idempotency ---------------------------------------------------------

async function checkIdempotencyKey(key, userId) {
  const { data, error } = await sb
    .from("agent_idempotency_keys")
    .select("turn_id, user_id")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { hit: false };
  if (data.user_id !== userId) {
    throw new Error("idempotency_key_user_mismatch");
  }
  return { hit: true, turnId: data.turn_id };
}

async function recordIdempotencyKey({ key, userId, threadId, turnId }) {
  const { error } = await sb.from("agent_idempotency_keys").insert({
    key,
    user_id: userId,
    thread_id: threadId,
    turn_id: turnId,
  });
  if (error && error.code !== "23505") throw error;
}

// ----- Per-turn cost + tool-loop tracker -----------------------------------

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
}

function createTurnGuard({ maxCostUsd }) {
  let cumulativeCost = 0;
  const toolCallCount = new Map();
  const sigCount = new Map();

  return {
    observe({ type, costUsd, toolName, input }) {
      if (type === "turn_completed" && typeof costUsd === "number") {
        cumulativeCost = costUsd;
        if (cumulativeCost > maxCostUsd) {
          return `cost_cap_exceeded: $${cumulativeCost.toFixed(4)} > $${maxCostUsd}`;
        }
      }
      if (type === "tool_call_started" && toolName) {
        // Strip mcp__namespace__ prefix when checking exempt list so config can
        // refer to either the bare name (Bash) or the full mcp name.
        const bareName = toolName.replace(/^mcp__[^_]+__/, "");
        const exempt = LIMITS.toolLoopExempt.has(bareName) || LIMITS.toolLoopExempt.has(toolName);
        const n = (toolCallCount.get(toolName) || 0) + 1;
        toolCallCount.set(toolName, n);
        if (!exempt && n > LIMITS.toolLoopRepeatMax) {
          return `tool_loop: ${toolName} called ${n}x (max ${LIMITS.toolLoopRepeatMax})`;
        }
        // Same-args repetition catches real tight loops; applies even to exempt
        // tools because calling Bash with identical command 3+ times is wrong.
        try {
          const sig = `${toolName}::${stableStringify(input)}`;
          const m = (sigCount.get(sig) || 0) + 1;
          sigCount.set(sig, m);
          if (m > 3) return `tool_repeat_args: ${toolName} repeated identical args ${m}x`;
        } catch {
          /* ignore */
        }
      }
      return null;
    },
  };
}

// ----- PII scrub -----------------------------------------------------------

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// Only scrub phones with explicit international prefix to avoid false-positives
// on ISO timestamps and product codes. "+52 55 1234 5678" matches; "2026-05-05" doesn't.
const PHONE_RE = /\+\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g;

function scrubPii(value) {
  if (typeof value === "string") {
    return value.replace(EMAIL_RE, "[email]").replace(PHONE_RE, "[phone]");
  }
  if (Array.isArray(value)) return value.map(scrubPii);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrubPii(v);
    return out;
  }
  return value;
}

module.exports = {
  LIMITS,
  tryAcquireSlot,
  snapshotCounters,
  checkIdempotencyKey,
  recordIdempotencyKey,
  createTurnGuard,
  scrubPii,
};
