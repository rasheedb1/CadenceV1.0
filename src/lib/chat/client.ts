/**
 * Typed client for the chat-bridge.
 *
 * - REST CRUD over fetch with the Supabase JWT in Authorization.
 * - SSE consumed via fetch + ReadableStream (so we can send custom headers,
 *   unlike the native EventSource which only supports cookies).
 */

// Chat lives inside the existing Twilio bridge service (Yuno Railway).
// Override only if running against a non-prod bridge (e.g. local dev).
const BRIDGE_URL = import.meta.env.VITE_CHAT_BRIDGE_URL ?? 'https://bridge.yuno.tools';

export interface ChatThread {
  id: string;
  org_id: string;
  user_id: string;
  agent_id: string;
  title: string | null;
  status: 'active' | 'paused' | 'archived';
  last_message_at: string;
  total_cost_usd?: number;
  created_at: string;
  sdk_session_id?: string | null;
}

export interface ChatEventRow {
  id: string;
  turn_id: string;
  event_type: string;
  payload: any;
  created_at: string;
}

async function authedFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail: any = null;
    try { detail = await res.json(); } catch { /* */ }
    const err = new Error(`${res.status} ${res.statusText}${detail ? ` — ${JSON.stringify(detail)}` : ''}`) as Error & { status?: number; detail?: any };
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  return res.json() as Promise<T>;
}

export async function listThreads(token: string, opts: { status?: string; limit?: number } = {}): Promise<ChatThread[]> {
  const q = new URLSearchParams();
  if (opts.status) q.set('status', opts.status);
  if (opts.limit) q.set('limit', String(opts.limit));
  const data = await asJson<{ threads: ChatThread[] }>(
    await authedFetch(token, `/api/chat/threads${q.toString() ? `?${q}` : ''}`),
  );
  return data.threads;
}

export async function createThread(token: string, agentId: string, title?: string): Promise<ChatThread> {
  const data = await asJson<{ thread: ChatThread }>(
    await authedFetch(token, '/api/chat/threads', {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId, title }),
    }),
  );
  return data.thread;
}

export async function getThread(token: string, threadId: string, eventsLimit = 200): Promise<{ thread: ChatThread; events: ChatEventRow[] }> {
  return asJson(await authedFetch(token, `/api/chat/threads/${threadId}?events=${eventsLimit}`));
}

export async function patchThread(token: string, threadId: string, patch: { title?: string; status?: 'active' | 'paused' | 'archived' }): Promise<ChatThread> {
  const data = await asJson<{ thread: ChatThread }>(
    await authedFetch(token, `/api/chat/threads/${threadId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  );
  return data.thread;
}

export async function archiveThread(token: string, threadId: string): Promise<void> {
  const res = await authedFetch(token, `/api/chat/threads/${threadId}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) await asJson(res);
}

export async function postMessage(token: string, threadId: string, message: string, idempotencyKey?: string): Promise<{ turn_id: string; idempotent?: boolean }> {
  return asJson(
    await authedFetch(token, `/api/chat/threads/${threadId}/messages`, {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      body: JSON.stringify({ message }),
    }),
  );
}

export async function cancelTurn(token: string, threadId: string, turnId: string): Promise<void> {
  await authedFetch(token, `/api/chat/threads/${threadId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ turn_id: turnId }),
  });
}

// ----- SSE consumer ---------------------------------------------------------

export interface SseFrame {
  id?: string;
  type?: string;
  data: string;
}

export interface StreamHandlers {
  onFrame: (frame: SseFrame) => void;
  onError?: (err: unknown) => void;
  onDone?: () => void;
  signal?: AbortSignal;
  /** Sent as Last-Event-ID for resume after reconnect. */
  lastEventId?: string;
}

/**
 * Open an SSE stream against the bridge. Yields frames via onFrame.
 * Returns a Promise that resolves when the stream ends (server-closed) or
 * rejects on transport error.
 */
export async function openStream(
  token: string,
  threadId: string,
  turnId: string,
  handlers: StreamHandlers,
): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'text/event-stream',
  };
  if (handlers.lastEventId) headers['Last-Event-ID'] = handlers.lastEventId;

  const res = await fetch(`${BRIDGE_URL}/api/chat/threads/${threadId}/stream?turn_id=${turnId}`, {
    method: 'GET',
    headers,
    signal: handlers.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`stream open failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let cur: { id?: string; type?: string; data: string[] } = { data: [] };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) !== -1 || (idx = buf.indexOf('\r\n\r\n')) !== -1) {
        const sep = buf.slice(idx, idx + 2) === '\n\n' ? 2 : 4;
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + sep);
        cur = { data: [] };
        for (const line of block.split(/\r?\n/)) {
          if (!line || line.startsWith(':')) continue;
          const colon = line.indexOf(':');
          const field = colon === -1 ? line : line.slice(0, colon);
          const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
          if (field === 'id') cur.id = value;
          else if (field === 'event') cur.type = value;
          else if (field === 'data') cur.data.push(value);
        }
        if (cur.data.length > 0) {
          handlers.onFrame({ id: cur.id, type: cur.type, data: cur.data.join('\n') });
        }
      }
    }
  } catch (err) {
    handlers.onError?.(err);
    throw err;
  } finally {
    handlers.onDone?.();
  }
}
