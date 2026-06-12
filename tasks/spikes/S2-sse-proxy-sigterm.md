# Spike S2 — Single-hop SSE proxy via Railway private net + SIGTERM drain

**Fecha:** 2026-05-04
**Verdict:** YELLOW — viable as designed, but two facts must be confirmed by a live deploy probe in Phase 1 (private-net idle timeout, default `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`). Code path and headers are correct; risks are bounded and have explicit mitigations.

---

## Q1 — Can `chat-bridge` hold an open response from `chief.railway.internal:8080` for 60+ seconds while streaming?

**Probable yes, but undocumented.** Railway's [private networking docs](https://docs.railway.com/reference/private-networking) describe `*.railway.internal` as direct, encrypted, IPv6 service-to-service traffic with "zero configuration" and explicitly do **not** mention any proxy, load-balancer, idle timeout, or stream cap on internal traffic. Internal traffic does **not** transit the public edge (which is where buffering and timeouts typically live). Community evidence (Railway help threads, Discord) consistently reports that long-lived SSE/WebSocket between two internal services works without artificial cuts as long as the services keep the socket alive.

What is definitely true:
- Internal traffic uses Wireguard-tunneled IPv6 between containers in the same project. There is no documented L7 proxy in the path.
- Node's default keep-alive is fine; the upstream `fetch` in `chat-bridge` and the Node `http` server in `chief-agents` (used today for `/execute-chief`) hold sockets indefinitely until either side closes.
- The bridge currently proxies long-running WhatsApp/PDF work (BC PDF endpoint takes ~14s, see memory `project_bc_pdf_endpoint.md`) without complaints, but those are <30s.

What is **not** verifiable from public docs:
- Whether Railway imposes an internal idle timeout (none documented; community says no).
- Behavior when the upstream service (`chief-agents`) is being redeployed mid-stream — unclear if internal DNS resolution holds the socket or recycles instantly.

**Mitigation (cheap):** emit an SSE keep-alive `: ping\n\n` comment every 15 s on both legs of the proxy. If any intermediate ever DOES enforce a 60s idle timeout, the comments reset it. Comments are ignored by EventSource and cost <50 bytes each. **Phase 1 must include a 5-minute live stream test** between the two services (deployed) to confirm.

The single-hop design (no Redis, no fan-out tier) means there is exactly one socket of concern: `chat-bridge` ⇄ `chief-agents`. The browser ⇄ `chat-bridge` leg uses the public edge, which sits behind Railway's edge proxy. SSE works on Railway public edge **only** with the four headers below — without them, the edge proxy may buffer, killing token-by-token UX.

Required response headers on the browser-facing leg:
```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```
`X-Accel-Buffering: no` is the de-facto signal to nginx-flavored proxies (Railway's public edge respects it, per multiple community reports) to disable response buffering. `no-transform` blocks gzip rewriting that would also defeat streaming.

---

## Q2 — Railway's SIGTERM grace period

**Confirmed from docs:** Railway sends `SIGTERM` to the old container when a new deployment goes online, and the **default grace is 0 seconds before `SIGKILL`** (yes, zero — the doc is explicit). Grace is configurable via the **`RAILWAY_DEPLOYMENT_DRAINING_SECONDS`** service env var.

Source (verified via WebFetch of `docs.railway.com/reference/deployments`):
> "Once the new deployment is online, the old deployment is sent a SIGTERM signal. By default, it is given 0 seconds to gracefully shutdown before being forcefully stopped with a SIGKILL."

**Implication for our design:** the plan requires ≥10 s drain to flush `turn_paused` events. We must set `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15` on the `chat-bridge` service (and on `chief-agents` if Phase 2 streams from it). 15 s = 10 s real drain headroom + 5 s safety margin. Higher values delay every deploy, so we keep it tight.

The current `chief-agents/src/orchestrator.ts` already has a `gracefulShutdown()` (lines 568-588) that waits up to 12 s — but with the default `0 s` Railway grace, that handler **has never actually run to completion in production**. We should set the env var on `chief-agents` too, even though Spike S2 is bridge-focused. The current bridge (`openclaw/bridge/server.js`) has **zero `process.on()` calls** — `grep -n process.on server.js` returns nothing. The new `chat-bridge` will be greenfield, so no migration debt.

---

## Q3 — `Last-Event-ID` reconnection cursor

**Confirmed against the WHATWG HTML spec** (server-sent-events section): the browser's native `EventSource` automatically sets the `Last-Event-ID` HTTP request header on reconnect **iff** it has previously received an event whose `id:` field was non-empty. If we never emit `id:` lines, no header arrives — so the cursor is opt-in by the server.

**Plan for the bridge:**
- Every event we write to the SSE stream MUST include `id: <agent_chat_events.id>` (uuid v7 — monotonic, sortable, indexed).
- Insertion into `agent_chat_events` happens **before** writing the SSE frame (so the id exists). Use a small per-turn write-ahead buffer if insert latency is a concern; uuid v7 is generated client-side so we can assign and emit before the row commits, then commit asynchronously.
- On `GET /stream?turnId=...`, read `req.headers['last-event-id']`. If present:
  1. Validate it's a uuid v7 belonging to this turn (defensive — reject foreign ids).
  2. `SELECT * FROM agent_chat_events WHERE turn_id = $1 AND id > $2 ORDER BY id ASC` — replay rows newer than the cursor first.
  3. If the turn is still in-flight (no terminal event in DB yet), tee back into the live AsyncIterable from `chief-agents` for any in-progress upstream stream. If `chief-agents` was already done by the time the client reconnected, the DB replay alone is sufficient and we close cleanly.
- If the turn was paused by SIGTERM (terminal event = `turn_paused`), the bridge re-`POST`s to `chief-agents` with the `sdk_session_id` to resume, then continues streaming from where it stopped.

Note on uuid v7 ordering: `id > $2` works because uuid v7 is lexicographically sortable by time prefix. If we used uuid v4 we'd need a separate `seq BIGINT` column.

---

## Code skeleton — `chat-bridge` proxy endpoint

TypeScript / Express. Keep this in `chat-bridge/src/routes/stream.ts`. Names match plan v3.

```ts
// chat-bridge/src/routes/stream.ts
import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { v7 as uuidv7 } from 'uuid';
import { verifyJwt } from '../auth/jwt';            // JWKS local verify, 10min cache
import { assertOrgMember } from '../auth/membership'; // queries organization_members per request

const CHIEF_AGENTS_URL = process.env.CHIEF_AGENTS_URL || 'http://chief.railway.internal:8080';
const KEEPALIVE_MS = 15_000;
const DRAIN_DEADLINE_MS = 12_000; // must be < RAILWAY_DEPLOYMENT_DRAINING_SECONDS

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

// SIGTERM drain registry — every active stream registers its abort controller here
const activeStreams = new Set<{ turnId: string; abort: AbortController; res: Response }>();
let shuttingDown = false;

process.on('SIGTERM', async () => {
  shuttingDown = true;
  console.log(`[shutdown] SIGTERM received, draining ${activeStreams.size} stream(s)`);
  const deadline = Date.now() + DRAIN_DEADLINE_MS;

  for (const s of activeStreams) {
    try {
      // 1. Tell upstream chief-agents to stop (it will commit session_id for resume)
      s.abort.abort('sigterm');
      // 2. Emit terminal turn_paused event so the browser knows to reconnect with Last-Event-ID
      const ev = { id: uuidv7(), type: 'turn_paused', turn_id: s.turnId, ts: Date.now() };
      await persistEvent(ev, /*orgId, userId from closure*/);
      writeSse(s.res, ev);
      s.res.end();
    } catch (e) { /* swallow — we're going down */ }
  }
  // Give in-flight DB inserts a beat to commit
  while (Date.now() < deadline && activeStreams.size > 0) {
    await new Promise((r) => setTimeout(r, 100));
  }
  process.exit(0);
});

export async function handleStream(req: Request, res: Response) {
  // --- 1. Auth ---
  const claims = await verifyJwt(req.headers.authorization);
  if (!claims) return res.status(401).end();
  const userId = claims.sub;
  const orgId = String(req.query.org_id || '');
  await assertOrgMember(userId, orgId); // throws 403 if not a member

  const turnId = String(req.query.turn_id || '');
  if (!turnId) return res.status(400).end();

  // Verify turn belongs to a thread pinned to this org (immutable per plan v3 §7)
  const { data: turn } = await sb
    .from('agent_chat_events')
    .select('thread_id, agent_web_threads!inner(org_id)')
    .eq('turn_id', turnId)
    .limit(1)
    .maybeSingle();
  if (turn && (turn as any).agent_web_threads.org_id !== orgId) {
    return res.status(409).end(); // org mismatch
  }

  // --- 2. SSE headers (Railway public edge respects X-Accel-Buffering: no) ---
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  // --- 3. Replay from Last-Event-ID, if present ---
  const lastEventId = req.headers['last-event-id'] as string | undefined;
  if (lastEventId) {
    const { data: replay } = await sb
      .from('agent_chat_events')
      .select('*')
      .eq('turn_id', turnId)
      .eq('org_id', orgId) // RLS belt-and-suspenders
      .gt('id', lastEventId)
      .order('id', { ascending: true })
      .limit(1000);
    for (const ev of replay || []) writeSse(res, ev);

    // If terminal event already in DB → done, no upstream call needed
    const terminal = (replay || []).find((e) => ['turn_done', 'turn_aborted', 'turn_error'].includes(e.type));
    if (terminal) { res.end(); return; }
  }

  // --- 4. Open upstream stream ---
  const abort = new AbortController();
  const reg = { turnId, abort, res };
  activeStreams.add(reg);
  if (shuttingDown) { activeStreams.delete(reg); res.end(); return; }

  // Client disconnect → kill upstream
  req.on('close', () => {
    abort.abort('client_disconnect');
    activeStreams.delete(reg);
  });

  // Heartbeat every 15s — comments are ignored by EventSource but reset any idle timer
  const ka = setInterval(() => res.write(`: ping ${Date.now()}\n\n`), KEEPALIVE_MS);

  try {
    const upstream = await fetch(`${CHIEF_AGENTS_URL}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnId, orgId, userId, lastEventId }),
      signal: abort.signal,
    });
    if (!upstream.ok || !upstream.body) {
      res.write(`event: error\ndata: ${JSON.stringify({ status: upstream.status })}\n\n`);
      return;
    }

    // --- 5. Pipe chunks: parse SSE frames from upstream, persist + forward ---
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // Split on SSE record separator (\n\n)
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const ev = parseSseFrame(frame); // { type, data }
        if (!ev) continue;

        // Assign id, persist, then forward
        const stored = {
          id: uuidv7(),
          turn_id: turnId,
          org_id: orgId,        // denormalized for RLS equality check
          user_id: userId,      // denormalized for audit
          type: ev.type,
          payload: scrubPii(ev.data),
          created_at: new Date().toISOString(),
        };
        // Fire-and-forget insert — the SSE frame must go out fast.
        // If the insert fails, we'll lose this event from history but the user still saw it.
        // For audit-grade durability, await the insert (adds ~5ms p50).
        sb.from('agent_chat_events').insert(stored).then(({ error }) => {
          if (error) console.error('[stream] persist failed', error.message, stored.id);
        });

        writeSse(res, stored);

        // Terminal frames — close cleanly
        if (['turn_done', 'turn_aborted', 'turn_error'].includes(ev.type)) {
          reader.cancel().catch(() => {});
          break;
        }
      }
    }
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    }
  } finally {
    clearInterval(ka);
    activeStreams.delete(reg);
    res.end();
  }
}

// --- helpers ---

function writeSse(res: Response, ev: { id: string; type: string; payload?: unknown; data?: unknown }) {
  res.write(`id: ${ev.id}\n`);
  res.write(`event: ${ev.type}\n`);
  res.write(`data: ${JSON.stringify(ev.payload ?? ev.data ?? {})}\n\n`);
}

function parseSseFrame(frame: string): { type: string; data: unknown } | null {
  let type = 'message';
  let dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) type = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    // ignore id: from upstream — we re-mint our own
  }
  if (dataLines.length === 0) return null;
  try { return { type, data: JSON.parse(dataLines.join('\n')) }; }
  catch { return { type, data: dataLines.join('\n') }; }
}

function scrubPii(payload: unknown): unknown {
  // Per plan v3 §10: regex strip emails/phones from payload
  const s = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const scrubbed = s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[phone]');
  return typeof payload === 'string' ? scrubbed : JSON.parse(scrubbed);
}

async function persistEvent(_ev: unknown) { /* see inline insert above */ }
```

---

## Open risks → Phase 3 verification plan

| Risk | How Phase 3 / live deploy verifies |
|---|---|
| Undocumented Railway internal idle timeout cuts streams | Deploy `chat-bridge` + a stub `/chat/stream` that emits one frame every 30 s for 5 min. Confirm frames arrive end-to-end. If they don't, lower keep-alive to 10 s. |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15` is honored | Trigger a redeploy mid-stream from a Playwright test; assert client receives `turn_paused` event before socket closes. |
| Public edge buffers SSE despite headers | Same Playwright test asserts first chunk reaches the browser within 2 s of `query()` first emit. If buffered → fallback to chunked-encoded NDJSON over POST (uglier but not buffer-able). |
| `Last-Event-ID` not echoed by some intermediary | Manual `curl -H 'Last-Event-ID: <uuid>'` against deployed bridge confirms header propagates. Spec-mandated for browsers, but a corporate proxy could strip — plan v3 already accepts this as a residual risk. |
| `chief-agents` redeploy mid-stream | Out of scope for S2 (covered by S1 abort + session resume). Verified via Playwright suite in Fase 6. |

The two facts that gate green-light are both verifiable in <30 minutes once Fase 1 deploys the empty `chat-bridge` skeleton with `/health`. Recommend bundling those probes into the Fase 1 acceptance checklist rather than blocking on a separate spike redeploy.
