/**
 * Express router mounted at `/api/chat`.
 *
 * Exposes:
 *   POST   /api/chat/threads
 *   GET    /api/chat/threads
 *   GET    /api/chat/threads/:id
 *   PATCH  /api/chat/threads/:id
 *   DELETE /api/chat/threads/:id
 *   POST   /api/chat/threads/:id/messages
 *   GET    /api/chat/threads/:id/stream?turn_id=...
 *   POST   /api/chat/threads/:id/cancel
 *
 * Auth: Supabase JWT in Authorization header (Bearer) or ?access_token=... for SSE GETs.
 * The router exports `liveStreams` as a getter so the parent server's SIGTERM
 * handler can drain in-flight turns.
 */

const express = require("express");
const { z } = require("zod");
const { randomUUID } = require("node:crypto");
const { sb } = require("./supabase");
const { requireAuth, ensureOrgMatch } = require("./auth");
const {
  LIMITS,
  tryAcquireSlot,
  snapshotCounters,
  checkIdempotencyKey,
  recordIdempotencyKey,
} = require("./guards");
const { TurnCoordinator, registerTurn, getTurn, listTurns } = require("./turn-coordinator");
const { writeSseHeaders, writeSseEvent, writeSseComment } = require("./sse");

const router = express.Router();

// Auth middleware applied to every /api/chat/* route.
router.use(requireAuth);

// ============================================================================
// THREADS
// ============================================================================

const CreateThreadSchema = z.object({
  agent_id: z.string().uuid(),
  title: z.string().max(120).optional(),
});

router.post("/threads", async (req, res) => {
  const auth = req.auth;
  const parsed = CreateThreadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const { agent_id, title } = parsed.data;

  const { data: agent, error: agErr } = await sb
    .from("agents")
    .select("id, org_id, name")
    .eq("id", agent_id)
    .maybeSingle();
  if (agErr) {
    console.error("[chat] agent lookup failed", agErr);
    res.status(500).json({ error: "db_error" });
    return;
  }
  if (!agent) {
    res.status(404).json({ error: "agent_not_found" });
    return;
  }
  if (!ensureOrgMatch(req, agent.org_id)) {
    res.status(403).json({ error: "agent_not_in_org" });
    return;
  }

  const { data: org, error: orgErr } = await sb
    .from("organizations")
    .select("id, agent_web_chat_enabled")
    .eq("id", auth.orgId)
    .maybeSingle();
  if (orgErr) {
    res.status(500).json({ error: "db_error" });
    return;
  }
  if (!org || !org.agent_web_chat_enabled) {
    res.status(403).json({ error: "feature_disabled" });
    return;
  }

  const { data: thread, error: thErr } = await sb
    .from("agent_web_threads")
    .insert({
      org_id: auth.orgId,
      user_id: auth.userId,
      agent_id,
      title: title || null,
    })
    .select("id, org_id, user_id, agent_id, title, status, created_at, last_message_at")
    .single();
  if (thErr) {
    console.error("[chat] thread insert failed", thErr);
    res.status(500).json({ error: "db_error" });
    return;
  }
  res.status(201).json({ thread });
});

router.get("/threads", async (req, res) => {
  const auth = req.auth;
  const limit = Math.min(Number(req.query.limit || 50), 100);
  const before = typeof req.query.before === "string" ? req.query.before : null;
  const status = typeof req.query.status === "string" ? req.query.status : "active";

  let q = sb
    .from("agent_web_threads")
    .select("id, agent_id, title, status, last_message_at, total_cost_usd, created_at")
    .eq("user_id", auth.userId)
    .eq("org_id", auth.orgId)
    .eq("status", status)
    .order("last_message_at", { ascending: false })
    .limit(limit);
  if (before) q = q.lt("last_message_at", before);
  const { data, error } = await q;
  if (error) {
    res.status(500).json({ error: "db_error" });
    return;
  }
  res.json({ threads: data || [] });
});

router.get("/threads/:id", async (req, res) => {
  const auth = req.auth;
  const id = req.params.id;
  const { data: thread, error: thErr } = await sb
    .from("agent_web_threads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (thErr) { res.status(500).json({ error: "db_error" }); return; }
  if (!thread) { res.status(404).json({ error: "not_found" }); return; }
  if (thread.user_id !== auth.userId) { res.status(403).json({ error: "forbidden" }); return; }
  if (!ensureOrgMatch(req, thread.org_id)) { res.status(409).json({ error: "org_mismatch" }); return; }

  const recentLimit = Math.min(Number(req.query.events || 200), 500);
  const { data: events, error: evErr } = await sb
    .from("agent_chat_events")
    .select("id, turn_id, event_type, payload, created_at")
    .eq("thread_id", id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(recentLimit);
  if (evErr) { res.status(500).json({ error: "db_error" }); return; }
  res.json({ thread, events: events || [] });
});

const PatchSchema = z.object({
  title: z.string().max(120).optional(),
  status: z.enum(["active", "paused", "archived"]).optional(),
});

router.patch("/threads/:id", async (req, res) => {
  const auth = req.auth;
  const id = req.params.id;
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_body" }); return; }
  const { data: thread } = await sb.from("agent_web_threads").select("id, user_id, org_id").eq("id", id).maybeSingle();
  if (!thread) { res.status(404).json({ error: "not_found" }); return; }
  if (thread.user_id !== auth.userId) { res.status(403).json({ error: "forbidden" }); return; }
  if (!ensureOrgMatch(req, thread.org_id)) { res.status(409).json({ error: "org_mismatch" }); return; }
  const { data, error } = await sb
    .from("agent_web_threads")
    .update(parsed.data)
    .eq("id", id)
    .select("id, title, status, last_message_at")
    .single();
  if (error) { res.status(500).json({ error: "db_error" }); return; }
  res.json({ thread: data });
});

router.delete("/threads/:id", async (req, res) => {
  const auth = req.auth;
  const id = req.params.id;
  const { data: thread } = await sb.from("agent_web_threads").select("id, user_id, org_id").eq("id", id).maybeSingle();
  if (!thread) { res.status(404).json({ error: "not_found" }); return; }
  if (thread.user_id !== auth.userId) { res.status(403).json({ error: "forbidden" }); return; }
  if (!ensureOrgMatch(req, thread.org_id)) { res.status(409).json({ error: "org_mismatch" }); return; }
  const { error } = await sb.from("agent_web_threads").update({ status: "archived" }).eq("id", id);
  if (error) { res.status(500).json({ error: "db_error" }); return; }
  res.status(204).end();
});

// ============================================================================
// MESSAGES + STREAM + CANCEL
// ============================================================================

const PostMessageSchema = z.object({
  message: z.string().min(1).max(8000),
});

router.post("/threads/:id/messages", async (req, res) => {
  const auth = req.auth;
  const threadId = req.params.id;

  const parsed = PostMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const { message } = parsed.data;
  const idemKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"];

  if (idemKey) {
    try {
      const hit = await checkIdempotencyKey(idemKey, auth.userId);
      if (hit.hit) { res.status(202).json({ turn_id: hit.turnId, idempotent: true }); return; }
    } catch (err) {
      console.warn("[chat] idempotency check failed", err && err.message);
      res.status(409).json({ error: "idempotency_conflict" });
      return;
    }
  }

  const { data: thread } = await sb
    .from("agent_web_threads")
    .select("id, org_id, user_id, agent_id, sdk_session_id, status")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) { res.status(404).json({ error: "thread_not_found" }); return; }
  if (thread.user_id !== auth.userId) { res.status(403).json({ error: "forbidden" }); return; }
  if (!ensureOrgMatch(req, thread.org_id)) { res.status(409).json({ error: "org_mismatch" }); return; }
  if (thread.status === "archived") { res.status(409).json({ error: "thread_archived" }); return; }

  const { data: agent } = await sb
    .from("agents")
    .select("id, org_id, name, max_cost_per_turn_usd")
    .eq("id", thread.agent_id)
    .maybeSingle();
  if (!agent) { res.status(404).json({ error: "agent_not_found" }); return; }
  if (agent.org_id !== thread.org_id) { res.status(409).json({ error: "agent_org_mismatch" }); return; }

  const slot = tryAcquireSlot(auth.userId, auth.orgId, thread.agent_id);
  if (slot && slot.error) {
    res.status(429).json({ error: "rate_limited", scope: slot.scope });
    return;
  }

  const turnId = randomUUID();

  const { error: userMsgErr } = await sb.from("agent_chat_events").insert({
    id: randomUUID(),
    thread_id: threadId,
    turn_id: turnId,
    org_id: thread.org_id,
    user_id: auth.userId,
    event_type: "user_message",
    payload: { type: "user_message", turnId, text: message, ts: new Date().toISOString() },
  });
  if (userMsgErr) {
    slot.release();
    console.error("[chat] user_message persist failed", userMsgErr);
    res.status(500).json({ error: "db_error" });
    return;
  }

  await sb.from("agent_audit_log").insert({
    org_id: thread.org_id,
    user_id: auth.userId,
    agent_id: thread.agent_id,
    thread_id: threadId,
    turn_id: turnId,
    event_type: "turn_started",
    metadata: { idempotency_key: idemKey || null },
  });

  if (idemKey) {
    await recordIdempotencyKey({ key: idemKey, userId: auth.userId, threadId, turnId }).catch((err) => {
      console.warn("[chat] idempotency record failed", err && err.message);
    });
  }

  const coord = new TurnCoordinator({
    agentId: thread.agent_id,
    threadId,
    turnId,
    userId: auth.userId,
    userFullName: auth.fullName,
    orgId: auth.orgId,
    message,
    resumeSessionId: thread.sdk_session_id || undefined,
    maxCostUsd: agent.max_cost_per_turn_usd || LIMITS.perTurnDefaultCostUsd,
  });
  registerTurn(coord);

  coord.start().finally(async () => {
    slot.release();
    const { data: cur } = await sb
      .from("agent_web_threads")
      .select("total_input_tokens, total_output_tokens, total_cost_usd")
      .eq("id", threadId)
      .maybeSingle();
    const updates = {
      last_message_at: new Date().toISOString(),
      total_cost_usd: Number((cur && cur.total_cost_usd) || 0) + coord.finalCostUsd,
      total_input_tokens: Number((cur && cur.total_input_tokens) || 0) + coord.finalInputTokens,
      total_output_tokens: Number((cur && cur.total_output_tokens) || 0) + coord.finalOutputTokens,
    };
    if (coord.finalSdkSessionId) updates.sdk_session_id = coord.finalSdkSessionId;
    await sb.from("agent_web_threads").update(updates).eq("id", threadId);
    await sb.from("agent_audit_log").insert({
      org_id: thread.org_id,
      user_id: auth.userId,
      agent_id: thread.agent_id,
      thread_id: threadId,
      turn_id: turnId,
      event_type: "turn_completed",
      metadata: { cost_usd: coord.finalCostUsd, tokens: coord.finalInputTokens + coord.finalOutputTokens },
    });
  });

  res.status(202).json({ turn_id: turnId });
});

router.get("/threads/:id/stream", async (req, res) => {
  const auth = req.auth;
  const threadId = req.params.id;
  const turnId = req.query.turn_id;
  if (!turnId) { res.status(400).json({ error: "turn_id_required" }); return; }

  const { data: thread } = await sb
    .from("agent_web_threads")
    .select("id, org_id, user_id")
    .eq("id", threadId)
    .maybeSingle();
  if (!thread) { res.status(404).json({ error: "thread_not_found" }); return; }
  if (thread.user_id !== auth.userId) { res.status(403).json({ error: "forbidden" }); return; }
  if (!ensureOrgMatch(req, thread.org_id)) { res.status(409).json({ error: "org_mismatch" }); return; }

  const lastEventId = req.headers["last-event-id"] || req.query.last_event_id;

  writeSseHeaders(res);
  const keepAlive = setInterval(() => writeSseComment(res, "keepalive"), 15_000);

  // Replay past events for the turn from DB (Last-Event-ID aware).
  await replayPast(threadId, turnId, lastEventId, res);

  const coord = getTurn(turnId);
  if (!coord || coord.isDone()) {
    writeSseComment(res, "turn-done");
    clearInterval(keepAlive);
    res.end();
    return;
  }

  const seen = new Set();
  const onEvent = (ev) => {
    if (seen.has(ev.id)) return;
    seen.add(ev.id);
    writeSseEvent(res, { id: ev.id, type: ev.type, data: ev.data });
    if (
      ev.type === "turn_completed" ||
      ev.type === "turn_aborted" ||
      ev.type === "turn_paused" ||
      ev.type === "error"
    ) {
      cleanup();
      res.end();
    }
  };
  const unsubscribe = coord.subscribe(onEvent);
  const onClose = () => cleanup();
  req.on("close", onClose);
  req.on("error", onClose);

  function cleanup() {
    unsubscribe();
    clearInterval(keepAlive);
    req.off("close", onClose);
    req.off("error", onClose);
  }
});

async function replayPast(threadId, turnId, lastEventId, res) {
  const { data: events, error } = await sb
    .from("agent_chat_events")
    .select("id, event_type, payload, created_at")
    .eq("thread_id", threadId)
    .eq("turn_id", turnId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    console.error("[chat] replay query failed", error);
    return;
  }
  let resumeFrom = -1;
  if (lastEventId && events) {
    resumeFrom = events.findIndex((e) => e.id === lastEventId);
  }
  const toReplay = (events || []).slice(resumeFrom + 1);
  for (const e of toReplay) {
    writeSseEvent(res, { id: e.id, type: e.event_type, data: e.payload });
  }
}

router.post("/threads/:id/cancel", async (req, res) => {
  const auth = req.auth;
  const threadId = req.params.id;
  const turnId = (req.body && req.body.turn_id) || req.query.turn_id;
  if (!turnId) { res.status(400).json({ error: "turn_id_required" }); return; }
  const { data: thread } = await sb.from("agent_web_threads").select("id, org_id, user_id").eq("id", threadId).maybeSingle();
  if (!thread) { res.status(404).json({ error: "thread_not_found" }); return; }
  if (thread.user_id !== auth.userId) { res.status(403).json({ error: "forbidden" }); return; }
  if (!ensureOrgMatch(req, thread.org_id)) { res.status(409).json({ error: "org_mismatch" }); return; }
  const coord = getTurn(turnId);
  if (!coord) { res.json({ status: "not_in_flight" }); return; }
  coord.abort("user-cancel");
  res.json({ status: "aborting" });
});

module.exports = { router, listTurns, snapshotCounters };
