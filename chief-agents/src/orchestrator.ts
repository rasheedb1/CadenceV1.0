/**
 * Orchestrator — Main process that manages all agent event loops
 * Loads active agents from Supabase, spawns concurrent loops, monitors health.
 * Runs in 1 Railway container instead of 4.
 */

import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import { randomUUID } from 'node:crypto';
import { sbGet, sbPatch } from './supabase-client.js';
import { loadAgentConfig } from './agent-config.js';
import { runEventLoop } from './event-loop.js';
import { executeWithSDK } from './sdk-runner.js';
import { streamWithSDK, type SDKEvent } from './sdk-stream-runner.js';
import { buildExecutePrompt } from './router.js';
import type { AgentRow, AgentConfig } from './types.js';
import { createLogger } from './utils/logger.js';
import { stripLoneSurrogates } from './utils/text.js';
import { buildChiefOrchestratorServer } from './mcp-tools/chief-orchestrator-tools.js';

const PORT = parseInt(process.env.PORT || '8080', 10);

// Agent configs indexed by name (lowercase) for A2A routing
const agentConfigs = new Map<string, AgentConfig>();

interface AgentLoopHandle {
  name: string;
  agentId: string;
  promise: Promise<void>;
  startedAt: Date;
  restarts: number;
}

const activeLoops = new Map<string, AgentLoopHandle>();
let shuttingDown = false;

// Live web-chat SSE turns. Keyed by turn_id. gracefulShutdown aborts all of them
// so each emits a `turn_paused` (handled inside handleChatStream) before exit.
interface LiveStreamHandle {
  turnId: string;
  threadId: string;
  agentName: string;
  abort: AbortController;
  res: http.ServerResponse;
}
const liveStreams = new Map<string, LiveStreamHandle>();

async function main(): Promise<void> {
  console.log('[Orchestrator] Starting chief-agents runtime');

  // Load all active agents for the org
  const agents = await sbGet<AgentRow[]>(
    'agents?status=in.(active,deploying)&select=*',
  );

  if (!Array.isArray(agents) || agents.length === 0) {
    console.error('[Orchestrator] No active agents found. Exiting.');
    process.exit(1);
  }

  console.log(`[Orchestrator] Found ${agents.length} active agents: ${agents.map((a) => a.name).join(', ')}`);

  // Ensure workspace directories exist
  for (const agent of agents) {
    const safeName = agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const dir = `/workspace/${safeName}`;
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    console.log(`[Orchestrator] Workspace ready: ${dir}`);
  }

  // Store configs for A2A routing
  for (const agent of agents) {
    const config = loadAgentConfig(agent);
    agentConfigs.set(agent.name.toLowerCase(), config);
  }

  // Start all event loops concurrently with auto-restart
  for (const agent of agents) {
    spawnAgentLoop(agent);
  }

  // Health check HTTP server
  startHealthServer();

  // Graceful shutdown
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  console.log(`[Orchestrator] All ${agents.length} agent loops started. Health check on :${PORT}`);

  // Keep the process alive
  await new Promise<void>(() => {});
}

function spawnAgentLoop(agentRow: AgentRow, restartCount = 0): void {
  const config = loadAgentConfig(agentRow);
  const maxRestarts = 10;

  const promise = runWithRestart(config.name, async () => {
    await runEventLoop(config);
  }, maxRestarts, restartCount);

  activeLoops.set(agentRow.id, {
    name: config.name,
    agentId: agentRow.id,
    promise,
    startedAt: new Date(),
    restarts: restartCount,
  });
}

async function runWithRestart(
  name: string,
  fn: () => Promise<void>,
  maxRetries: number,
  initialRetries = 0,
): Promise<void> {
  let retries = initialRetries;
  while (retries < maxRetries && !shuttingDown) {
    try {
      await fn();
      // If fn() returns normally, the loop was stopped gracefully
      break;
    } catch (err: any) {
      retries++;
      console.error(`[Orchestrator] ${name} loop crashed (${retries}/${maxRetries}): ${err.message}`);
      if (retries < maxRetries && !shuttingDown) {
        const backoffMs = Math.min(5000 * retries, 60_000);
        console.log(`[Orchestrator] Restarting ${name} in ${backoffMs / 1000}s...`);
        await sleep(backoffMs);
      }
    }
  }
  if (retries >= maxRetries) {
    console.error(`[Orchestrator] ${name} reached max retries (${maxRetries}), agent stopped permanently`);
  }
}

/** Parse JSON body from an incoming HTTP request */
function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

/** Find agent config by name (case-insensitive, partial match) */
function findAgent(name: string): AgentConfig | undefined {
  const lower = name.toLowerCase();
  // Exact match first
  if (agentConfigs.has(lower)) return agentConfigs.get(lower);
  // Partial match
  for (const [key, config] of agentConfigs) {
    if (key.includes(lower) || lower.includes(key)) return config;
  }
  return undefined;
}

/** Handle A2A JSON-RPC message/send — runs executeWithSDK and returns A2A response */
async function handleA2A(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body: any;
  try { body = await parseBody(req); } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } }));
    return;
  }

  const { id, method, params } = body;

  if (method !== 'message/send') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not supported: ${method}` } }));
    return;
  }

  // Extract message text and metadata
  const parts = params?.message?.parts || [];
  const text = parts.filter((p: any) => p.kind === 'text').map((p: any) => p.text).join('\n');
  const metadata = params?.message?.metadata || {};

  if (!text) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Empty message' } }));
    return;
  }

  // Find which agent to route to — use URL path or first available agent
  // Bridge sends to the agent's railway_url/a2a/jsonrpc, but all agents share this container
  // So we try to extract agent name from metadata or use the first agent
  const targetName = metadata.target_agent || metadata.from_agent_id;
  let agent: AgentConfig | undefined;

  // Try to find by target agent name
  if (targetName && targetName !== 'chief') {
    agent = findAgent(targetName);
  }

  // If not found, use the first agent (single-agent containers) or try all
  if (!agent && agentConfigs.size === 1) {
    agent = agentConfigs.values().next().value;
  }

  if (!agent) {
    // If multiple agents, return error — need target
    const names = Array.from(agentConfigs.keys()).join(', ');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32602, message: `Multiple agents available (${names}). Specify target_agent in metadata.` } }));
    return;
  }

  const log = createLogger(`A2A:${agent.name}`);
  log.info(`Received query: ${text.substring(0, 150)}`);

  try {
    // Execute the query using the agent's SDK runner (same as work_on_task)
    const result = await executeWithSDK(agent, text, log);
    const replyText = result.text || '(no response)';
    log.info(`Query completed: ${replyText.substring(0, 100)} (${result.numTurns} turns, $${result.costUsd.toFixed(4)})`);

    // Return A2A message response
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      id,
      result: {
        kind: 'message',
        messageId: id,
        role: 'agent',
        parts: [{ kind: 'text', text: replyText }],
        metadata: { agent_name: agent.name, turns: result.numTurns, cost_usd: result.costUsd },
      },
    }));
  } catch (err: any) {
    log.error(`Query failed: ${err.message}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code: -32000, message: err.message || 'Agent execution failed' },
    }));
  }
}

/** POST /execute — Direct task execution, bypasses event loop (0 latency) */
async function handleExecute(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body: any;
  try { body = await parseBody(req); } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  const { agent_id, task_id } = body;
  if (!agent_id || !task_id) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'agent_id and task_id required' }));
    return;
  }

  // Find agent config
  let agent: AgentConfig | undefined;
  for (const [, config] of agentConfigs) {
    if (config.id === agent_id) { agent = config; break; }
  }
  if (!agent) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Agent ${agent_id} not found in this container` }));
    return;
  }

  const log = createLogger(`EXEC:${agent.name}`);
  log.info(`/execute task=${task_id.substring(0, 8)}`);

  // Set currentTaskId so MCP tools (ask_human_via_whatsapp, save_artifact, etc.) work correctly
  agent.currentTaskId = task_id;

  // Clear MCP server cache to pick up new currentTaskId
  const { clearMcpCache } = await import('./sdk-runner.js');
  clearMcpCache(agent.id);

  try {
    // Build prompt using deterministic router (no LLM, no THINK)
    const execPrompt = await buildExecutePrompt(agent, task_id, log);
    if (!execPrompt) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Task not found' }));
      return;
    }

    // Mark task in_progress
    await sbPatch(`agent_tasks_v2?id=eq.${task_id}`, {
      status: 'in_progress',
      started_at: new Date().toISOString(),
    }).catch(() => {});

    // Execute SDK (with session resumption if applicable)
    const result = await executeWithSDK(agent, execPrompt.prompt, log, execPrompt.resumeSessionId);

    // Save session_id for future resumption
    if (result.sessionId) {
      await sbPatch(`agent_tasks_v2?id=eq.${task_id}`, {
        session_id: result.sessionId,
      }).catch(() => {});
    }

    log.info(`/execute done: ${result.numTurns} turns, $${result.costUsd.toFixed(4)}, session=${result.sessionId?.substring(0, 12) || 'none'}`);

    // Record cost
    const { sbRpc } = await import('./supabase-client.js');
    sbRpc('record_task_cost', { p_agent_id: agent.id, p_cost: result.costUsd, p_tokens: result.tokensUsed }).catch(() => {});

    // Log activity
    const { sbPost } = await import('./supabase-client.js');
    sbPost('agent_activity_events', {
      agent_id: agent.id, org_id: agent.orgId,
      event_type: 'task_result', tool_name: 'execute_direct',
      content: `Task: ${task_id} | Turns: ${result.numTurns} | Cost: $${result.costUsd.toFixed(4)} | Result: ${result.text.substring(0, 300)}`,
    }).catch(() => {});

    // CRITICAL: Send result to WhatsApp via bridge callback
    // The SDK may return text directly without calling ask_human_via_whatsapp,
    // so we ALWAYS send the result through the callback pipeline.
    const { pickUrl } = await import('./utils/env-url.js');
    const CALLBACK_URL = pickUrl(process.env.CALLBACK_URL, 'https://bridge.yuno.tools/api/agent-callback');
    if (result.text && result.text.length > 10) {
      fetch(CALLBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id,
          agent_name: agent.name,
          result: { text: result.text },
          whatsapp_number: null, // Bridge resolves from org
        }),
      }).catch((e: any) => log.warn(`Callback failed: ${e.message}`));
      log.info(`/execute callback sent to bridge for WhatsApp delivery`);
    }

    // Determine if the agent is waiting for human input or done
    // Heuristic: if the result text contains question patterns, agent needs input
    // This is more reliable than checking outbound_human_messages timing
    const resultLower = result.text.toLowerCase()
    const questionPatterns = [
      'necesito', 'proporciona', 'confirma', 'responde', 'por favor',
      'cuál es', 'qué es', '¿', 'datos que faltan', 'información',
      'pendiente', 'waiting', 'need', 'please provide', 'missing',
    ]
    const hasQuestionMark = result.text.includes('?')
    const hasQuestionPattern = questionPatterns.some(p => resultLower.includes(p))
    const hasSkillResult = resultLower.includes('business case') && (resultLower.includes('generado') || resultLower.includes('pptx') || resultLower.includes('descargar'))
    const hasCallSkillResult = resultLower.includes('call_skill') && resultLower.includes('success')

    // Agent asked human if: has questions AND doesn't have a deliverable result
    const askedHuman = (hasQuestionMark || hasQuestionPattern) && !hasSkillResult && !hasCallSkillResult && result.numTurns <= 3;

    if (askedHuman) {
      // Agent asked a question → save scratchpad, keep task in_progress
      log.info(`/execute: agent asked human, keeping task in_progress`);
      if (result.text) {
        try {
          const taskRows2 = await sbGet<Array<{ context_summary: string | null }>>(
            `agent_tasks_v2?id=eq.${task_id}&select=context_summary`,
          ).catch(() => []);
          let pad: any = {};
          if (Array.isArray(taskRows2) && taskRows2[0]?.context_summary) {
            try { pad = JSON.parse(taskRows2[0].context_summary); } catch { pad = {}; }
          }
          if (!pad.conversation) pad.conversation = [];
          pad.conversation.push({ role: 'agent', ts: new Date().toISOString(), content: result.text.substring(0, 2000) });
          pad.last_action = 'asked_human';
          pad.version = (pad.version || 0) + 1;
          await sbPatch(`agent_tasks_v2?id=eq.${task_id}`, {
            context_summary: JSON.stringify(pad),
          }).catch(() => {});
        } catch {}
      }
    } else {
      // Agent finished work → mark task as done (triggers workflow advancement if linked)
      log.info(`/execute: agent finished, marking task done`);
      await sbPatch(`agent_tasks_v2?id=eq.${task_id}`, {
        status: 'done',
        completed_at: new Date().toISOString(),
        result: { summary: result.text.substring(0, 2000), turns: result.numTurns, cost_usd: result.costUsd },
      }).catch((e: any) => log.warn(`Failed to complete task: ${e.message}`));
    }

    const taskStatus = askedHuman ? 'waiting_for_human' : 'completed';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: taskStatus,
      result: result.text.substring(0, 2000),
      session_id: result.sessionId,
      turns: result.numTurns,
      cost_usd: result.costUsd,
      subtype: result.subtype,
    }));
  } catch (err: any) {
    log.error(`/execute error: ${err.message}`);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

/** POST /wake — Force agent event loop to run next tick immediately */
async function handleWake(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body: any;
  try { body = await parseBody(req); } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  const { agent_id, reason } = body;
  console.log(`[wake] Agent ${agent_id?.substring(0, 8)} woken: ${reason || 'no reason'}`);

  // We can't directly interrupt a sleeping event loop from here,
  // but we can set a flag that the loop checks. For now, just acknowledge.
  // The real speedup comes from /execute bypassing the loop entirely.
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'acknowledged', agent_id }));
}

/**
 * POST /chat/stream — Web-chat SSE endpoint (private network only).
 *
 * The chat-bridge calls this with a JSON body and reads back an
 * `text/event-stream` response. Each event is one SDKEvent (see
 * sdk-stream-runner.ts). The bridge persists events as it forwards them.
 *
 * Body shape (validated below):
 *   {
 *     agent_id: uuid,
 *     thread_id: uuid,
 *     turn_id: uuid,
 *     user_id: uuid,
 *     org_id: uuid,
 *     user_full_name?: string,
 *     message: string,
 *     resume_session_id?: string
 *   }
 *
 * The bridge is responsible for auth + org-pin check + cost guards + idempotency.
 * This handler trusts the bridge (private network, no public domain).
 */
async function handleChatStream(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body: any;
  try { body = await parseBody(req); } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  const { agent_id, thread_id, turn_id, user_id, org_id, user_full_name, message, resume_session_id } = body || {};
  if (!agent_id || !thread_id || !turn_id || !user_id || !org_id || !message) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'agent_id, thread_id, turn_id, user_id, org_id and message are required',
    }));
    return;
  }

  // Locate the agent in this container (all agents run here today).
  let agent: AgentConfig | undefined;
  for (const [, config] of agentConfigs) {
    if (config.id === agent_id) { agent = config; break; }
  }
  if (!agent) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Agent ${agent_id} not loaded in this container` }));
    return;
  }
  if (agent.orgId !== org_id) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Agent org mismatch' }));
    return;
  }

  const log = createLogger(`CHAT:${agent.name}`);
  log.info(`/chat/stream turn=${turn_id.slice(0, 8)} thread=${thread_id.slice(0, 8)} user=${user_id.slice(0, 8)}`);

  // SSE headers — see Spike S2 for rationale.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // Flush headers immediately so the bridge starts forwarding right away.
  if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

  const abortController = new AbortController();
  const handle: LiveStreamHandle = {
    turnId: turn_id,
    threadId: thread_id,
    agentName: agent.name,
    abort: abortController,
    res,
  };
  liveStreams.set(turn_id, handle);

  // Bridge disconnect or upstream cancel → abort SDK.
  const onClose = (): void => {
    if (!abortController.signal.aborted) abortController.abort('client-disconnect');
  };
  req.on('close', onClose);
  req.on('error', onClose);

  // 15s SSE keep-alive comments to keep proxies/idle-timeouts happy.
  const keepAlive = setInterval(() => {
    if (!res.writableEnded) res.write(': keepalive\n\n');
  }, 15_000);

  const writeEvent = (event: SDKEvent): void => {
    if (res.writableEnded) return;
    const id = randomUUID();
    res.write(`id: ${id}\n`);
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    for await (const ev of streamWithSDK({
      agent,
      taskPrompt: message,
      thread: {
        threadId: thread_id,
        turnId: turn_id,
        userId: user_id,
        userFullName: user_full_name,
        orgId: org_id,
      },
      log,
      resumeSessionId: resume_session_id,
      signal: abortController.signal,
    })) {
      writeEvent(ev);
      if (
        ev.type === 'turn_completed' ||
        ev.type === 'turn_aborted' ||
        ev.type === 'error'
      ) break;
    }
  } catch (err: any) {
    log.error(`/chat/stream crashed: ${err?.stack || err?.message}`);
    writeEvent({
      type: 'error',
      turnId: turn_id,
      message: (err?.message || String(err)).slice(0, 500),
      ts: new Date().toISOString(),
    });
  } finally {
    clearInterval(keepAlive);
    liveStreams.delete(turn_id);
    if (!res.writableEnded) res.end();
  }
}

/** POST /execute-chief — Chief orchestrator via Claude Agent SDK with session resumption */
async function handleExecuteChief(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let body: any;
  try { body = await parseBody(req); } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  const { message, org_id, session_id, whatsapp_number, system_prompt } = body;
  if (!message || !org_id) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'message and org_id required' }));
    return;
  }

  const log = createLogger('CHIEF-SDK');
  log.info(`/execute-chief msg="${message.substring(0, 80)}"`);

  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    // Build MCP server for Chief's orchestrator tools
    const chiefMcp = buildChiefOrchestratorServer(org_id);

    const chiefSystemPrompt = system_prompt || `You are Chief, an AI orchestrator for a multi-agent workforce platform.
You manage a team of AI agents and help the user delegate tasks, create workflows, and monitor their team.

CHANNEL: WhatsApp. Your responses are sent directly as WhatsApp messages to the user's phone.

RESPONSE FORMAT RULES (CRITICAL):
- Keep responses SHORT: 2-5 lines max. WhatsApp is not a document viewer.
- NEVER dump raw JSON, IDs, technical data, or tool results in your response.
- When listing items (agents, tasks, workflows), use a compact format: name + 1-line summary each.
- For long results, give a SUMMARY and offer: "¿Quieres ver más detalles de alguno?"
- Use simple formatting: *bold* for names, line breaks between items. No tables, no markdown headers.
- If a tool returns a lot of data, SUMMARIZE it — don't paste it.

TASK ROUTING:
1. ONE-TIME action ("busca X", "genera Y", "dile a Z") → delegar_tarea
2. RECURRING/AUTOMATED ("todos los días", "cada semana", "diario", "rutina") → crear_workflow_agente
3. If the user mentions an agent by name → delegate to that agent.

BEHAVIOR:
- Only act on the CURRENT message. Never re-execute old tasks.
- Create ONE task per request. Not two. Not three. ONE.
- Respond in the same language as the user.`;

    let resultText = '';
    let capturedSessionId: string | null = null;
    let totalCost = 0;
    let numTurns = 0;

    // Collect only the LAST assistant text (the final response to the user)
    // Intermediate tool calls and their results are internal — don't send to WhatsApp
    let lastAssistantText = '';

    for await (const msg of query({
      prompt: stripLoneSurrogates(message),
      options: {
        model: 'claude-sonnet-4-6',
        systemPrompt: stripLoneSurrogates(chiefSystemPrompt),
        // NO session resumption — Chief is stateless. Context comes via last_exchange in the prompt.
        allowedTools: ['mcp__chief-orchestrator__*'],
        permissionMode: 'bypassPermissions' as any,
        maxTurns: 10,
        mcpServers: { 'chief-orchestrator': chiefMcp },
        canUseTool: async (_t: string, input: Record<string, unknown>) => ({
          behavior: 'allow' as const,
          updatedInput: input,
        }),
      },
    })) {
      if (msg.type === 'assistant') {
        // Only keep text from this turn (overwrite previous — we want the LAST one)
        const textBlocks = msg.message.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
        if (textBlocks) lastAssistantText = textBlocks;
      }
      if ((msg as any).session_id) capturedSessionId = (msg as any).session_id;
      if (msg.type === 'result') {
        totalCost = (msg as any).total_cost_usd || 0;
        numTurns = (msg as any).num_turns || 0;
        capturedSessionId = (msg as any).session_id || capturedSessionId;
        // Don't use (msg as any).result — it contains ALL text including tool results/JSON dumps
        // We only want lastAssistantText (the final human-readable response)
      }
    }
    // Always prefer the last assistant text (clean, no tool dumps)
    resultText = lastAssistantText || resultText || '(sin respuesta)';

    log.info(`/execute-chief done: ${numTurns} turns, $${totalCost.toFixed(4)}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      text: resultText || '(sin respuesta)',
      turns: numTurns,
      cost_usd: totalCost,
    }));
  } catch (err: any) {
    log.error(`/execute-chief error: ${err.message}`);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function startHealthServer(): void {
  const server = http.createServer(async (req, res) => {
    const url = req.url || '/';

    // Chief SDK execution (WhatsApp → bridge → here)
    if (url === '/execute-chief' && req.method === 'POST') {
      await handleExecuteChief(req, res);
      return;
    }

    // Direct task execution (bypasses event loop)
    if (url === '/execute' && req.method === 'POST') {
      await handleExecute(req, res);
      return;
    }

    // Wake agent for inter-agent messages
    if (url === '/wake' && req.method === 'POST') {
      await handleWake(req, res);
      return;
    }

    // A2A JSON-RPC endpoint
    if (url.startsWith('/a2a/jsonrpc') && req.method === 'POST') {
      await handleA2A(req, res);
      return;
    }

    // Web-chat SSE stream (private network only — chat-bridge calls this)
    if (url === '/chat/stream' && req.method === 'POST') {
      await handleChatStream(req, res);
      return;
    }

    // Health check (GET /)
    const status = {
      status: 'ok',
      uptime: process.uptime(),
      a2a: true,
      agents: Array.from(activeLoops.values()).map((h) => ({
        name: h.name,
        agentId: h.agentId,
        startedAt: h.startedAt.toISOString(),
        restarts: h.restarts,
      })),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
  });

  server.listen(PORT, () => {
    console.log(`[Orchestrator] Health + A2A server listening on :${PORT}`);
  });
}

async function gracefulShutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Orchestrator] Graceful shutdown initiated (live_streams=${liveStreams.size})...`);

  // Drain in-flight web-chat SSE turns first: abort SDK + emit turn_paused so
  // the bridge can flush and the client can resume with Last-Event-ID.
  for (const [, handle] of liveStreams) {
    try {
      handle.abort.abort('sigterm');
      if (!handle.res.writableEnded) {
        handle.res.write(`event: turn_paused\n`);
        handle.res.write(`data: ${JSON.stringify({
          type: 'turn_paused',
          turnId: handle.turnId,
          reason: 'sigterm',
          ts: new Date().toISOString(),
        })}\n\n`);
        handle.res.end();
      }
    } catch (err: any) {
      console.error(`[Orchestrator] failed to drain stream ${handle.turnId.slice(0, 8)}: ${err?.message}`);
    }
  }

  // Give loops a chance to finish their current tick
  await sleep(2000);

  // Wait for all loops to stop (with timeout)
  const timeout = sleep(10_000).then(() => {
    console.log('[Orchestrator] Shutdown timeout reached, forcing exit');
  });

  await Promise.race([
    Promise.allSettled(Array.from(activeLoops.values()).map((h) => h.promise)),
    timeout,
  ]);

  console.log('[Orchestrator] Shutdown complete');
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Entry point ---
main().catch((err) => {
  console.error('[Orchestrator] Fatal error:', err);
  process.exit(1);
});
