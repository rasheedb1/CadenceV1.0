/**
 * Active turn state machine.
 *
 * Responsibilities
 *   - Replays past events from `agent_chat_events` (via GET thread detail).
 *   - Streams live events from chat-bridge SSE.
 *   - Reduces SDKEvents into a flat list of "messages" the UI can render.
 *   - Auto-reconnects with Last-Event-ID on transient failures.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  cancelTurn as apiCancel,
  getThread,
  openStream,
  postMessage,
  type ChatEventRow,
  type SseFrame,
} from '@/lib/chat/client';

export interface ChatMessage {
  /** Stable id used for React keys + Last-Event-ID resume. */
  id: string;
  turnId: string | null;
  role: 'user' | 'assistant' | 'system';
  text: string;
  /** Tool calls observed during the assistant's turn. */
  toolCalls: ChatToolCall[];
  /** Wall-clock time when this message started. */
  startedAt: string;
  /** When the turn ended, if applicable. */
  endedAt?: string;
  status: 'streaming' | 'done' | 'aborted' | 'error' | 'paused';
  costUsd?: number;
  errorMessage?: string;
}

export interface ChatToolCall {
  toolUseId: string;
  toolName: string;
  status: 'started' | 'finished' | 'errored';
  input?: unknown;
  output?: unknown;
  startedAt: string;
  endedAt?: string;
}

interface State {
  messages: ChatMessage[];
  /** Currently streaming turn — we use this to attach further events to the right message. */
  liveTurnId: string | null;
  loading: boolean;
  error: string | null;
}

type Action =
  | { type: 'reset'; messages: ChatMessage[] }
  | { type: 'append_user'; turnId: string; text: string; ts: string }
  | { type: 'sdk_event'; frame: SDKEventFrame };

interface SDKEventFrame {
  id?: string;
  type: string;
  payload: any;
}

function findTurnIndex(state: State, turnId: string): number {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    if (state.messages[i].turnId === turnId && state.messages[i].role === 'assistant') return i;
  }
  return -1;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'reset':
      return { ...state, messages: action.messages, liveTurnId: null, error: null };

    case 'append_user': {
      const msg: ChatMessage = {
        id: `user:${action.turnId}`,
        turnId: action.turnId,
        role: 'user',
        text: action.text,
        toolCalls: [],
        startedAt: action.ts,
        status: 'done',
      };
      return { ...state, messages: [...state.messages, msg] };
    }

    case 'sdk_event': {
      const f = action.frame;
      const turnId: string | undefined = f.payload?.turnId ?? f.payload?.turn_id;
      if (!turnId) return state;
      const messages = state.messages.slice();

      const ensureAssistant = (): number => {
        let idx = findTurnIndex({ ...state, messages }, turnId);
        if (idx === -1) {
          messages.push({
            id: `assistant:${turnId}`,
            turnId,
            role: 'assistant',
            text: '',
            toolCalls: [],
            startedAt: f.payload?.ts ?? new Date().toISOString(),
            status: 'streaming',
          });
          idx = messages.length - 1;
        }
        return idx;
      };

      switch (f.type) {
        case 'turn_started': {
          ensureAssistant();
          return { ...state, messages, liveTurnId: turnId, loading: true };
        }
        case 'assistant_chunk': {
          const idx = ensureAssistant();
          messages[idx] = { ...messages[idx], text: messages[idx].text + (f.payload?.delta ?? '') };
          return { ...state, messages };
        }
        case 'tool_call_started': {
          const idx = ensureAssistant();
          const calls = messages[idx].toolCalls.slice();
          calls.push({
            toolUseId: f.payload?.toolUseId ?? '',
            toolName: f.payload?.toolName ?? 'unknown',
            input: f.payload?.input,
            startedAt: f.payload?.ts ?? new Date().toISOString(),
            status: 'started',
          });
          messages[idx] = { ...messages[idx], toolCalls: calls };
          return { ...state, messages };
        }
        case 'tool_call_finished': {
          const idx = ensureAssistant();
          const calls = messages[idx].toolCalls.slice();
          const target = calls.findIndex((c) => c.toolUseId === f.payload?.toolUseId);
          if (target !== -1) {
            calls[target] = {
              ...calls[target],
              output: f.payload?.output,
              endedAt: f.payload?.ts ?? new Date().toISOString(),
              status: f.payload?.isError ? 'errored' : 'finished',
            };
          }
          messages[idx] = { ...messages[idx], toolCalls: calls };
          return { ...state, messages };
        }
        case 'turn_completed': {
          const idx = ensureAssistant();
          messages[idx] = {
            ...messages[idx],
            status: 'done',
            endedAt: f.payload?.ts ?? new Date().toISOString(),
            costUsd: f.payload?.costUsd,
          };
          return { ...state, messages, liveTurnId: null, loading: false };
        }
        case 'turn_aborted': {
          const idx = ensureAssistant();
          messages[idx] = {
            ...messages[idx],
            status: 'aborted',
            endedAt: f.payload?.ts ?? new Date().toISOString(),
            errorMessage: f.payload?.reason ?? 'aborted',
          };
          return { ...state, messages, liveTurnId: null, loading: false };
        }
        case 'turn_paused': {
          const idx = ensureAssistant();
          messages[idx] = {
            ...messages[idx],
            status: 'paused',
            endedAt: f.payload?.ts ?? new Date().toISOString(),
          };
          return { ...state, messages, liveTurnId: turnId, loading: true };
        }
        case 'error': {
          const idx = ensureAssistant();
          messages[idx] = {
            ...messages[idx],
            status: 'error',
            endedAt: f.payload?.ts ?? new Date().toISOString(),
            errorMessage: f.payload?.message ?? 'error',
          };
          return { ...state, messages, liveTurnId: null, loading: false, error: f.payload?.message ?? 'error' };
        }
        case 'user_message':
          // Already inserted on send; ignore replays of our own message.
          return state;
        default:
          return state;
      }
    }
  }
}

function eventsToMessages(events: ChatEventRow[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const e of events) {
    const turnId = e.payload?.turnId ?? e.payload?.turn_id ?? e.turn_id;
    if (e.event_type === 'user_message') {
      messages.push({
        id: e.id,
        turnId,
        role: 'user',
        text: e.payload?.text ?? '',
        toolCalls: [],
        startedAt: e.created_at,
        status: 'done',
      });
      continue;
    }
    let idx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].turnId === turnId && messages[i].role === 'assistant') { idx = i; break; }
    }
    if (idx === -1) {
      messages.push({
        id: `assistant:${turnId}`,
        turnId,
        role: 'assistant',
        text: '',
        toolCalls: [],
        startedAt: e.created_at,
        status: 'streaming',
      });
      idx = messages.length - 1;
    }
    const m = messages[idx];
    switch (e.event_type) {
      case 'assistant_chunk':
        m.text += e.payload?.delta ?? '';
        break;
      case 'tool_call_started':
        m.toolCalls.push({
          toolUseId: e.payload?.toolUseId ?? '',
          toolName: e.payload?.toolName ?? 'unknown',
          input: e.payload?.input,
          startedAt: e.payload?.ts ?? e.created_at,
          status: 'started',
        });
        break;
      case 'tool_call_finished': {
        const t = m.toolCalls.find((c) => c.toolUseId === e.payload?.toolUseId);
        if (t) {
          t.output = e.payload?.output;
          t.endedAt = e.payload?.ts ?? e.created_at;
          t.status = e.payload?.isError ? 'errored' : 'finished';
        }
        break;
      }
      case 'turn_completed':
        m.status = 'done';
        m.endedAt = e.payload?.ts ?? e.created_at;
        m.costUsd = e.payload?.costUsd;
        break;
      case 'turn_aborted':
        m.status = 'aborted';
        m.endedAt = e.payload?.ts ?? e.created_at;
        m.errorMessage = e.payload?.reason;
        break;
      case 'error':
        m.status = 'error';
        m.endedAt = e.payload?.ts ?? e.created_at;
        m.errorMessage = e.payload?.message;
        break;
    }
  }
  return messages;
}

export function useChatStream(threadId: string | null) {
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const [state, dispatch] = useReducer(reducer, {
    messages: [],
    liveTurnId: null,
    loading: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const lastEventIdRef = useRef<string | undefined>(undefined);
  const activeTurnRef = useRef<string | null>(null);

  // Load history when thread changes.
  useEffect(() => {
    if (!token || !threadId) {
      dispatch({ type: 'reset', messages: [] });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { events } = await getThread(token, threadId);
        if (cancelled) return;
        dispatch({ type: 'reset', messages: eventsToMessages(events) });
      } catch (err) {
        console.error('[useChatStream] load history failed', err);
      }
    })();
    return () => { cancelled = true; };
  }, [token, threadId]);

  // Abort any in-flight stream when thread changes or component unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(async (text: string) => {
    if (!token || !threadId) throw new Error('not_authenticated');
    const idemKey = crypto.randomUUID();
    const { turn_id } = await postMessage(token, threadId, text, idemKey);
    activeTurnRef.current = turn_id;
    dispatch({ type: 'append_user', turnId: turn_id, text, ts: new Date().toISOString() });

    const controller = new AbortController();
    abortRef.current = controller;
    lastEventIdRef.current = undefined;

    const consume = async (): Promise<void> => {
      await openStream(token, threadId, turn_id, {
        signal: controller.signal,
        lastEventId: lastEventIdRef.current,
        onFrame: (frame: SseFrame) => {
          if (frame.id) lastEventIdRef.current = frame.id;
          let payload: any;
          try { payload = JSON.parse(frame.data); } catch { return; }
          dispatch({ type: 'sdk_event', frame: { id: frame.id, type: frame.type ?? 'message', payload } });
        },
      });
    };

    try {
      await consume();
    } catch (err: any) {
      if (controller.signal.aborted) return;
      // Best-effort one reconnect with Last-Event-ID.
      if (lastEventIdRef.current) {
        try { await consume(); }
        catch (err2) { console.error('[useChatStream] reconnect failed', err2); }
      } else {
        console.error('[useChatStream] stream failed', err);
      }
    }
  }, [token, threadId]);

  const cancel = useCallback(async () => {
    if (!token || !threadId || !activeTurnRef.current) return;
    try {
      await apiCancel(token, threadId, activeTurnRef.current);
    } catch (err) {
      console.error('[useChatStream] cancel failed', err);
    }
    abortRef.current?.abort();
  }, [token, threadId]);

  return { ...state, send, cancel };
}
