/**
 * sdk-stream-runner — Async-iterable wrapper around the Claude Agent SDK
 * for the web-chat channel. Emits granular SDKEvent objects so the bridge
 * can persist + forward them as SSE.
 *
 * Differences vs sdk-runner.ts (executeWithSDK):
 *   - includePartialMessages: true → token-level deltas
 *   - abortController plumbed through (Spike S1 verified)
 *   - yields events instead of accumulating into a single SDKResult
 *   - injects a small web-channel hint on first turn (NOT on resume — the
 *     existing session already has that prompt cached)
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentConfig } from './types.js';
import type { Logger } from './utils/logger.js';
import { stripLoneSurrogates } from './utils/text.js';
import {
  buildAllowedTools,
  buildEnhancedPrompt,
  buildMcpServers,
  buildStableSystemPrompt,
  buildWebChannelHint,
  loadAgentSkillsContext,
  resolveModel,
  safeAgentName,
} from './sdk-shared.js';

// -----------------------------------------------------------------------------
// SDKEvent — the wire format the chat-bridge re-emits as SSE.
// Keep this shape backward-compatible: the frontend depends on it.
// -----------------------------------------------------------------------------
export type SDKEvent =
  | { type: 'turn_started'; turnId: string; sessionId?: string; ts: string }
  | { type: 'assistant_chunk'; turnId: string; delta: string; ts: string }
  | { type: 'assistant_message'; turnId: string; text: string; ts: string }
  | {
      type: 'tool_call_started';
      turnId: string;
      toolUseId: string;
      toolName: string;
      input?: unknown;
      ts: string;
    }
  | {
      type: 'tool_progress';
      turnId: string;
      toolUseId: string;
      toolName: string;
      elapsedSeconds: number;
      ts: string;
    }
  | {
      type: 'tool_call_finished';
      turnId: string;
      toolUseId: string;
      toolName: string;
      output?: unknown;
      isError?: boolean;
      ts: string;
    }
  | {
      type: 'turn_completed';
      turnId: string;
      sessionId: string | null;
      costUsd: number;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
      numTurns: number;
      ts: string;
    }
  | { type: 'turn_aborted'; turnId: string; reason: string; ts: string }
  | { type: 'error'; turnId: string; message: string; ts: string };

export interface ThreadContext {
  threadId: string;
  turnId: string;
  userId: string;
  userFullName?: string;
  orgId: string;
}

export interface StreamOptions {
  agent: AgentConfig;
  taskPrompt: string;
  thread: ThreadContext;
  log: Logger;
  resumeSessionId?: string;
  /** Caller-provided signal. Aborting it stops generation and tool execution. */
  signal?: AbortSignal;
}

const now = (): string => new Date().toISOString();

/**
 * Execute one turn of the SDK in streaming mode and yield SDKEvent objects
 * as they happen. Closes cleanly on abort.
 */
export async function* streamWithSDK(opts: StreamOptions): AsyncGenerator<SDKEvent> {
  const { agent, taskPrompt, thread, log, resumeSessionId, signal } = opts;
  const turnId = thread.turnId;

  // Bridge our caller's signal to the SDK's AbortController.
  const sdkAbort = new AbortController();
  const onAbort = (): void => {
    if (!sdkAbort.signal.aborted) sdkAbort.abort('upstream-abort');
  };
  if (signal) {
    if (signal.aborted) sdkAbort.abort('already-aborted');
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  const model = resolveModel(agent);
  const allowedTools = buildAllowedTools(agent);
  const mcpServers = buildMcpServers(agent);
  const safeName = safeAgentName(agent.name);
  const enhancedPrompt = buildEnhancedPrompt(taskPrompt, !!resumeSessionId);
  // Skills section — loaded once per turn (cheap, ~1 SQL hit). When resuming,
  // the SDK session already cached the skills from the first turn so we skip.
  const skillsCtx = resumeSessionId ? '' : await loadAgentSkillsContext(agent);
  const stableSystemPrompt = resumeSessionId
    ? null
    : buildStableSystemPrompt(agent) + buildWebChannelHint(thread) + skillsCtx;

  let capturedSessionId: string | null = null;
  let totalCost = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let numTurns = 0;
  // Map tool_use_id → tool_name so tool_call_finished can carry the name.
  const toolNamesByUseId = new Map<string, string>();

  yield { type: 'turn_started', turnId, sessionId: resumeSessionId, ts: now() };

  try {
    log.info(
      `[stream] starting turn=${turnId.slice(0, 8)} agent=${agent.name} model=${model}${
        resumeSessionId ? ` resume=${resumeSessionId.slice(0, 12)}` : ''
      }`,
    );

    for await (const message of query({
      prompt: stripLoneSurrogates(enhancedPrompt),
      options: {
        model,
        ...(resumeSessionId
          ? { resume: resumeSessionId }
          : { systemPrompt: stripLoneSurrogates(stableSystemPrompt!) }),
        allowedTools,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        cwd: `/workspace/${safeName}`,
        maxTurns: 15,
        mcpServers,
        includePartialMessages: true,
        abortController: sdkAbort,
        canUseTool: async (_toolName: string, input: Record<string, unknown>) => ({
          behavior: 'allow' as const,
          updatedInput: input,
        }),
        env: { ...process.env, HOME: process.env.HOME || '/home/agent' },
        stderr: (data: string) => {
          if (data.trim()) log.warn(`[stream stderr] ${data.trim().substring(0, 300)}`);
        },
      },
    })) {
      // Capture session_id from any message that carries it.
      const msgSessionId = (message as { session_id?: string }).session_id;
      if (msgSessionId) capturedSessionId = msgSessionId;

      const m = message as { type: string } & Record<string, unknown>;

      switch (m.type) {
        case 'stream_event': {
          // Token-level deltas from the underlying Anthropic SSE.
          // Forward only text_delta payloads as assistant_chunk.
          const ev = (m as { event?: { type?: string; delta?: { type?: string; text?: string } } })
            .event;
          if (
            ev?.type === 'content_block_delta' &&
            ev.delta?.type === 'text_delta' &&
            typeof ev.delta.text === 'string'
          ) {
            yield {
              type: 'assistant_chunk',
              turnId,
              delta: ev.delta.text,
              ts: now(),
            };
          }
          break;
        }

        case 'assistant': {
          // Consolidated assistant message: emit tool_call_started for each
          // tool_use block. Skip text blocks — they were already streamed via
          // stream_event above.
          const content = (m as {
            message?: { content?: Array<{ type: string; id?: string; name?: string; input?: unknown }> };
          }).message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_use') {
                const toolUseId = block.id || '';
                const toolName = block.name || 'unknown';
                if (toolUseId) toolNamesByUseId.set(toolUseId, toolName);
                yield {
                  type: 'tool_call_started',
                  turnId,
                  toolUseId,
                  toolName,
                  input: block.input,
                  ts: now(),
                };
              }
            }
          }
          break;
        }

        case 'user': {
          // Tool results come back as user messages. Emit tool_call_finished.
          const content = (m as {
            message?: { content?: Array<{ type: string; tool_use_id?: string; content?: unknown; is_error?: boolean }> };
          }).message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_result') {
                const toolUseId = block.tool_use_id || '';
                yield {
                  type: 'tool_call_finished',
                  turnId,
                  toolUseId,
                  toolName: toolNamesByUseId.get(toolUseId) || '',
                  output: block.content,
                  isError: !!block.is_error,
                  ts: now(),
                };
                if (toolUseId) toolNamesByUseId.delete(toolUseId);
              }
            }
          }
          break;
        }

        case 'tool_progress': {
          yield {
            type: 'tool_progress',
            turnId,
            toolUseId: (m as { tool_use_id?: string }).tool_use_id || '',
            toolName: (m as { tool_name?: string }).tool_name || '',
            elapsedSeconds: (m as { elapsed_time_seconds?: number }).elapsed_time_seconds || 0,
            ts: now(),
          };
          break;
        }

        case 'result': {
          totalCost = (m as { total_cost_usd?: number }).total_cost_usd || 0;
          numTurns = (m as { num_turns?: number }).num_turns || 0;
          const usage = (m as {
            usage?: {
              input_tokens?: number;
              output_tokens?: number;
              cache_read_input_tokens?: number;
              cache_creation_input_tokens?: number;
            };
          }).usage;
          if (usage) {
            inputTokens = usage.input_tokens || 0;
            outputTokens = usage.output_tokens || 0;
            cacheReadTokens = usage.cache_read_input_tokens || 0;
            cacheWriteTokens = usage.cache_creation_input_tokens || 0;
          }
          // Loop will exit naturally after 'result'.
          break;
        }

        default:
          // 'system', 'auth_status', 'compact_boundary', 'hook_response' — ignore for now.
          break;
      }

      if (sdkAbort.signal.aborted) break;
    }

    if (sdkAbort.signal.aborted) {
      const reason = String(sdkAbort.signal.reason ?? 'aborted');
      log.warn(`[stream] turn=${turnId.slice(0, 8)} aborted: ${reason}`);
      yield { type: 'turn_aborted', turnId, reason, ts: now() };
      return;
    }

    yield {
      type: 'turn_completed',
      turnId,
      sessionId: capturedSessionId,
      costUsd: totalCost,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      numTurns,
      ts: now(),
    };
  } catch (err) {
    const e = err as Error & { name?: string };
    if (sdkAbort.signal.aborted || e?.name === 'AbortError') {
      yield {
        type: 'turn_aborted',
        turnId,
        reason: String(sdkAbort.signal.reason ?? e?.message ?? 'aborted'),
        ts: now(),
      };
      return;
    }
    log.error(`[stream] turn=${turnId.slice(0, 8)} error: ${e?.stack || e?.message}`);
    yield {
      type: 'error',
      turnId,
      message: (e?.message || String(err)).slice(0, 500),
      ts: now(),
    };
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}
