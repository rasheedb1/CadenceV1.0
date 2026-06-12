/**
 * TurnCoordinator — drives one in-flight turn end-to-end.
 *
 * Responsibilities:
 *  - POST chief-agents `/chat/stream` over the Railway private network.
 *  - Parse SSE chunks, persist each event to `agent_chat_events`, and re-emit
 *    to local subscribers (GET /stream attaches via .subscribe()).
 *  - Run cost / tool-loop guards between events; abort upstream if tripped.
 *  - Wallclock timeout safety net (90s default).
 */

const { EventEmitter } = require("node:events");
const { randomUUID } = require("node:crypto");
const { sb } = require("./supabase");
const { SseParser } = require("./sse");
const { LIMITS, scrubPii, createTurnGuard } = require("./guards");

const CHIEF_AGENTS_INTERNAL_URL =
  process.env.CHIEF_AGENTS_INTERNAL_URL || "http://chief.railway.internal:8080";

class TurnCoordinator {
  constructor(ctx) {
    this.ctx = ctx;
    this.abortController = new AbortController();
    this.emitter = new EventEmitter();
    this.startedAtMs = Date.now();
    this.done = false;
    this.guard = createTurnGuard({ maxCostUsd: ctx.maxCostUsd });
    this.lastEventId = null;
    this.finalSdkSessionId = null;
    this.finalCostUsd = 0;
    this.finalInputTokens = 0;
    this.finalOutputTokens = 0;
    this.emitter.setMaxListeners(0);
  }

  isDone() {
    return this.done;
  }

  subscribe(listener) {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  abort(reason) {
    if (this.abortController.signal.aborted) return;
    this.abortController.abort(reason);
  }

  start() {
    return this._run().catch((err) => {
      console.error("[chat-turn] coordinator crashed", this.ctx.turnId, err);
    });
  }

  async _run() {
    const { ctx, abortController } = this;
    const wallclockTimer = setTimeout(
      () => this.abort("wallclock-exceeded"),
      LIMITS.perTurnWallclockMs
    );

    try {
      const upstream = await fetch(`${CHIEF_AGENTS_INTERNAL_URL}/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          agent_id: ctx.agentId,
          thread_id: ctx.threadId,
          turn_id: ctx.turnId,
          user_id: ctx.userId,
          user_full_name: ctx.userFullName,
          org_id: ctx.orgId,
          message: ctx.message,
          resume_session_id: ctx.resumeSessionId,
        }),
        signal: abortController.signal,
      });

      if (!upstream.ok || !upstream.body) {
        const text = await upstream.text().catch(() => "");
        await this._persistAndEmit({
          type: "error",
          data: {
            type: "error",
            turnId: ctx.turnId,
            message: `upstream ${upstream.status}: ${text.slice(0, 200)}`,
            ts: new Date().toISOString(),
          },
        });
        return;
      }

      const parser = new SseParser();
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
        for (const ev of parser.drain()) {
          if (!ev.event) continue;
          let data;
          try {
            data = JSON.parse(ev.data);
          } catch {
            continue;
          }

          // Cost cap + tool-loop.
          const reason = this.guard.observe({
            type: ev.event,
            costUsd: data && data.costUsd,
            toolName: data && data.toolName,
            input: data && data.input,
          });
          if (reason) {
            console.warn("[chat-turn] guard tripped", ctx.turnId, reason);
            this.abort(reason);
            await this._persistAndEmit({
              type: "turn_aborted",
              data: {
                type: "turn_aborted",
                turnId: ctx.turnId,
                reason,
                ts: new Date().toISOString(),
              },
              forcedId: ev.id,
            });
            return;
          }

          await this._persistAndEmit({ type: ev.event, data, forcedId: ev.id });

          if (ev.event === "turn_completed") {
            this.finalSdkSessionId = (data && data.sessionId) || null;
            this.finalCostUsd = (data && data.costUsd) || 0;
            this.finalInputTokens = (data && data.inputTokens) || 0;
            this.finalOutputTokens = (data && data.outputTokens) || 0;
            return;
          }
          if (
            ev.event === "turn_aborted" ||
            ev.event === "turn_paused" ||
            ev.event === "error"
          ) {
            return;
          }
        }
      }
    } catch (err) {
      const aborted =
        abortController.signal.aborted || (err && err.name === "AbortError");
      const reason = aborted
        ? String(abortController.signal.reason || (err && err.message) || "aborted")
        : (err && err.message) || "unknown";
      await this._persistAndEmit({
        type: aborted ? "turn_aborted" : "error",
        data: aborted
          ? {
              type: "turn_aborted",
              turnId: this.ctx.turnId,
              reason,
              ts: new Date().toISOString(),
            }
          : {
              type: "error",
              turnId: this.ctx.turnId,
              message: String(reason).slice(0, 500),
              ts: new Date().toISOString(),
            },
      });
    } finally {
      clearTimeout(wallclockTimer);
      this.done = true;
      this.emitter.emit("done");
    }
  }

  async _persistAndEmit({ type, data, forcedId }) {
    const id = forcedId || randomUUID();
    const created_at = new Date().toISOString();
    const scrubbedPayload = scrubPii(data);
    const { error } = await sb.from("agent_chat_events").insert({
      id,
      thread_id: this.ctx.threadId,
      turn_id: this.ctx.turnId,
      org_id: this.ctx.orgId,
      user_id: this.ctx.userId,
      event_type: type,
      payload: scrubbedPayload,
      created_at,
    });
    if (error && error.code !== "23505") {
      console.error("[chat-turn] persist event failed", this.ctx.turnId, error);
    }
    this.lastEventId = id;
    this.emitter.emit("event", { id, type, data, createdAt: created_at });
  }
}

// ----- Process-wide registry ----------------------------------------------

const turnsByTurnId = new Map();

function registerTurn(t) {
  turnsByTurnId.set(t.ctx.turnId, t);
  t.emitter.once("done", () => {
    setTimeout(() => turnsByTurnId.delete(t.ctx.turnId), 30_000);
  });
}

function getTurn(turnId) {
  return turnsByTurnId.get(turnId);
}

function listTurns() {
  return Array.from(turnsByTurnId.values());
}

module.exports = { TurnCoordinator, registerTurn, getTurn, listTurns };
