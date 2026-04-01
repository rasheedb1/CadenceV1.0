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

  return `SYSTEM: You are an autonomous AI agent. Return ONLY a JSON object, no other text.

CONTEXT:
- Name: ${agent.name}, Role: ${agent.role}
- Capabilities: ${agent.capabilities.join(', ') || 'general'}
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

RESPOND WITH EXACTLY ONE JSON OBJECT:
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

RULES:
1. If AVAILABLE TASKS has entries and MY TASKS is empty → claim_task (pick highest priority)
2. If MY TASKS has entries → work_on_task (use the task description + DEPENDENCY CONTEXT + FEEDBACK as instruction)
3. After completing significant work → request_review (if task has review_iteration < max 3)
4. If task has LAST REVIEW that was NOT APPROVED → work_on_task to fix the issues, then request_review again
5. If reviewing another agent's work → submit_review with score (0-1), passed, issues, suggestions
6. If you CANNOT do something because you lack a tool or permission → ask_human explaining what you need and suggest which team member could help
7. If you need a tool that doesn't exist → send_message to Juanse (developer) asking him to research and create a script for it
8. If UNREAD MESSAGES need a response → reply_message
9. If no tasks at all → idle
10. ONLY return JSON. No markdown, no explanation, no code blocks.`;
}

/** Call Anthropic API directly to get action decision */
export async function think(
  agent: AgentConfig,
  context: SenseContext,
  state: LoopState,
  log: Logger,
): Promise<ParsedAction> {
  const prompt = buildPrompt(agent, context, state);
  const client = getClient();

  // Use haiku for THINK (cheaper routing decision) or agent's model
  const thinkModel = 'claude-haiku-4-5-20251001';

  try {
    const response = await client.messages.create({
      model: thinkModel,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    // Track token usage
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    state.budget.tokens += inputTokens + outputTokens;
    state.budget.iterations++;

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
