/**
 * THINK phase — build LLM prompt and get action decision
 * Replaces OpenClaw CLI execFile with direct Anthropic API call.
 * Prompt structure ported exactly from event-loop.js lines 198-332.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AgentConfig, LoopState, SenseContext, ParsedAction } from '../types.js';
import type { Logger } from '../utils/logger.js';

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  }
  return anthropicClient;
}

/** Build the THINK prompt — exact port from event-loop.js */
function buildPrompt(agent: AgentConfig, context: SenseContext, state: LoopState): string {
  const budgetStr = context.budget
    ? `${context.budget.tokens_used || 0}/${context.budget.max_tokens || '∞'} tokens, $${context.budget.cost_usd || 0}/${context.budget.max_cost_usd || '∞'}`
    : 'No budget tracking';

  const fmtTask = (t: any): string => {
    const desc = typeof t.content === 'object'
      ? (t.content?.description || JSON.stringify(t.content))
      : (t.description || t.content || '');
    return `- [${t.id}] ${t.title} (pri=${t.priority}, type=${t.task_type || 'general'}) — ${(desc || '').substring(0, 150)}`;
  };

  // --- Build memory context sections (exact port) ---
  let memoryContext = '';

  // Parent task results (from dependency resolution)
  const taskWithParent = (context.myTasks || []).find((t: any) => t.parent_result_summary);
  if (taskWithParent) {
    memoryContext += `\nDEPENDENCY CONTEXT:\n${(taskWithParent as any).parent_result_summary}\n`;
  }

  // Context summary (accumulated from resolved dependencies)
  const taskWithContext = (context.myTasks || []).find((t: any) => t.context_summary);
  if (taskWithContext && taskWithContext !== taskWithParent) {
    memoryContext += `\nTASK CONTEXT:\n${(taskWithContext as any).context_summary}\n`;
  }

  // Latest artifact summary
  if (context.latestArtifact) {
    const a = context.latestArtifact;
    memoryContext += `\nLAST ARTIFACT (${a.filename} v${a.version}, ${a.artifact_type}):\n${(a.content_summary || '').substring(0, 300)}\n`;
  }

  // Latest review
  if (context.latestReview) {
    const r = context.latestReview;
    memoryContext += `\nLAST REVIEW (iteration ${r.iteration}, score: ${r.score}, ${r.passed ? 'APPROVED' : 'NOT APPROVED'}):\n`;
    if (r.issues && Array.isArray(r.issues) && r.issues.length > 0) {
      memoryContext += `Issues: ${r.issues.map((i: any) => (typeof i === 'object' ? i.issue : i)).join('; ')}\n`;
    }
    if (r.suggestions && Array.isArray(r.suggestions) && r.suggestions.length > 0) {
      memoryContext += `Suggestions: ${r.suggestions.map((s: any) => (typeof s === 'object' ? s.suggestion : s)).join('; ')}\n`;
    }
  }

  // Pending feedback from human
  if (context.pendingFeedback && context.pendingFeedback.length > 0) {
    memoryContext += `\nFEEDBACK FROM YOUR MANAGER:\n`;
    for (const f of context.pendingFeedback) {
      memoryContext += `- ${f.feedback}\n`;
    }
    memoryContext += `Incorporate this feedback into your work.\n`;
  }

  // Knowledge / lessons learned
  if (context.knowledge && context.knowledge.length > 0) {
    memoryContext += `\nKNOWLEDGE (lessons learned):\n`;
    for (const k of context.knowledge) {
      memoryContext += `- [${k.category}] ${k.content}\n`;
    }
  }

  // --- NEW: Unread messages from other agents ---
  if (context.unreadMessages && context.unreadMessages.length > 0) {
    memoryContext += `\nUNREAD MESSAGES FROM TEAM:\n`;
    for (const m of context.unreadMessages) {
      memoryContext += `- [${m.message_type}] ${m.from_agent_id?.substring(0, 8) || 'system'}: ${m.content.substring(0, 200)}\n`;
    }
  }

  // --- NEW: Project context ---
  if (context.projectContext && context.projectContext.length > 0) {
    const pc = context.projectContext[0];
    if (pc.task_counts) {
      memoryContext += `\nPROJECT STATUS (${pc.project_name}):\n`;
      const tc = pc.task_counts;
      memoryContext += `Tasks: ${tc.done || 0} done, ${tc.in_progress || 0} in progress, ${tc.ready || 0} ready, ${tc.backlog || 0} backlog, ${tc.failed || 0} failed\n`;
    }
  }

  // Variable section only — system prompt is built separately for caching
  return `CONTEXT:
- Name: ${agent.name}, Role: ${agent.role}
- Loop iteration: ${state.iteration}
- Budget: ${budgetStr}
${memoryContext}
INBOX (${context.inbox.length}):
${context.inbox.length ? context.inbox.map((m: any) => `- ${(m.content || '').substring(0, 200)}`).join('\n') : '(empty)'}

MY TASKS (${context.myTasks.length}):
${context.myTasks.length ? context.myTasks.map(fmtTask).join('\n') : '(none assigned)'}

AVAILABLE TASKS (${context.availableTasks.length}):
${context.availableTasks.length ? context.availableTasks.map(fmtTask).join('\n') : '(none available)'}

ONLINE AGENTS: ${context.onlineAgents.length ? context.onlineAgents.map((a) => a.agent_id?.substring(0, 8)).join(', ') : 'none'}

Respond with ONE JSON action object now.`;
}

// Static system prompt — cached across all THINK calls (90% savings on cache hits)
function buildSystemPrompt(agent: AgentConfig): string {
  return `You are an autonomous AI agent in a multi-agent workforce platform called Chief. You decide what action to take next based on your tasks, inbox, and team context. You return ONE JSON action per call.

YOUR IDENTITY:
- Name: ${agent.name}
- Role: ${agent.role}
- Capabilities: ${agent.capabilities.join(', ') || 'general'}

CRITICAL REVIEW RULE: If a task title starts with "[REVIEW]" or has task_type="review", you are REVIEWING another agent's work. You MUST use action="submit_review" with score (0-1), passed (boolean), issues, and suggestions. NEVER use work_on_task on a [REVIEW] task — that creates infinite loops.

AVAILABLE ACTIONS (return EXACTLY ONE JSON object):
{"action":"claim_task","reasoning":"...","params":{"task_id":"..."}}
{"action":"work_on_task","reasoning":"...","params":{"task_id":"...","instruction":"..."}}
{"action":"complete_task","reasoning":"...","params":{"task_id":"...","result_summary":"..."}}
{"action":"request_review","reasoning":"...","params":{"task_id":"...","result_summary":"...","review_notes":"what to review"}}
{"action":"submit_review","reasoning":"...","params":{"task_id":"...","score":0.8,"passed":true,"issues":["issue1"],"suggestions":["suggestion1"]}}
{"action":"send_message","reasoning":"...","params":{"to_agent":"name","message":"...","message_type":"info"}}
{"action":"ask_human","reasoning":"...","params":{"question":"...","priority":"normal"}}
{"action":"create_subtask","reasoning":"...","params":{"title":"...","description":"...","assign_to":"self|auto|name","task_type":"code","priority":50}}
{"action":"reply_message","reasoning":"...","params":{"to_agent_id":"...","message":"...","thread_id":"..."}}
{"action":"idle","reasoning":"nothing to do","params":{}}

DECISION RULES (in order of priority):
1. If MY TASKS has a task with title starting with "[REVIEW]" → submit_review with score, passed, issues, suggestions. NEVER work_on_task on a review task.
2. If AVAILABLE TASKS has entries and MY TASKS is empty → claim_task (pick highest priority)
3. If MY TASKS has a non-review task → work_on_task (use the task description + DEPENDENCY CONTEXT + FEEDBACK as instruction)
4. After completing significant work → request_review (if task has review_iteration < max 3)
5. If task has LAST REVIEW that was NOT APPROVED → work_on_task to fix the issues, then request_review again
6. If you CANNOT do something because you lack a tool or permission → ask_human explaining what you need
7. If you need a tool that doesn't exist → send_message to Juanse (developer)
8. If UNREAD MESSAGES need a response → reply_message
9. If no tasks at all → idle
10. ONLY return JSON. No markdown, no explanation, no code blocks.

RESPONSE FORMAT: Return ONLY a JSON object with the action. No surrounding text, no markdown, no code blocks. Just raw JSON.`;
}

/** Call Anthropic API directly to get action decision */
export async function think(
  agent: AgentConfig,
  context: SenseContext,
  state: LoopState,
  log: Logger,
): Promise<ParsedAction> {
  const userPrompt = buildPrompt(agent, context, state);
  const systemPrompt = buildSystemPrompt(agent);
  const client = getClient();

  // Use haiku for THINK (cheaper routing decision)
  const thinkModel = 'claude-haiku-4-5-20251001';

  try {
    // Use cache_control on system prompt — saves 90% on subsequent calls
    const response = await client.messages.create({
      model: thinkModel,
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    // Track token usage (including cache stats)
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    const cacheRead = (response.usage as any)?.cache_read_input_tokens || 0;
    const cacheWrite = (response.usage as any)?.cache_creation_input_tokens || 0;
    state.budget.tokens += inputTokens + outputTokens + cacheRead + cacheWrite;
    state.budget.iterations++;
    if (cacheRead > 0) {
      log.info(`THINK cache hit: ${cacheRead} tokens read from cache (90% discount)`);
    }

    // Parse JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn(`THINK: no JSON in response: ${raw.substring(0, 150)}`);
      return { action: 'idle', reasoning: 'Could not parse LLM response', params: {} };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      action: parsed.action || 'idle',
      reasoning: parsed.reasoning || '',
      params: parsed.params || {},
    };
  } catch (err: any) {
    log.error(`THINK error: ${err.message}`);
    return { action: 'idle', reasoning: 'LLM call failed', params: {} };
  }
}
