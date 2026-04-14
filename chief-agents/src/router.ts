/**
 * Router — Deterministic routing for /execute endpoint
 * Replaces THINK (Haiku LLM) for direct task execution.
 * Only code, no LLM calls. Zero cost, zero errors.
 */

import { sbGet } from './supabase-client.js';
import type { AgentConfig } from './types.js';
import type { Logger } from './utils/logger.js';

interface TaskRow {
  id: string;
  title: string;
  description: string;
  context_summary: string | null;
  session_id: string | null;
  parent_result_summary: string | null;
}

interface ExecutePrompt {
  prompt: string;
  resumeSessionId?: string;
}

/**
 * Build the SDK prompt for a task — deterministic, no LLM needed.
 * Handles: fresh tasks, session resumption, conversation history.
 */
export async function buildExecutePrompt(
  agent: AgentConfig,
  taskId: string,
  log: Logger,
): Promise<ExecutePrompt | null> {
  // Load task
  const rows = await sbGet<TaskRow[]>(
    `agent_tasks_v2?id=eq.${taskId}&select=id,title,description,context_summary,session_id,parent_result_summary`,
  ).catch(() => []);

  if (!Array.isArray(rows) || rows.length === 0) {
    log.warn(`[router] Task ${taskId} not found`);
    return null;
  }

  const task = rows[0];
  let pad: any = null;
  if (task.context_summary) {
    try { pad = JSON.parse(task.context_summary); } catch {}
  }

  // CASE 1: Session resume — user replied to a previous question
  if (pad?.last_action === 'user_replied' && task.session_id) {
    const lastUserMsg = (pad.conversation || [])
      .filter((c: any) => c.role === 'user')
      .pop();

    log.info(`[router] RESUME session ${task.session_id.substring(0, 12)} — user replied`);
    return {
      prompt: `The user has replied to your previous questions. Here is their response:\n\n${lastUserMsg?.content || '(no content)'}\n\nYou now have all the data you need. Execute the skill with call_skill immediately. Do NOT ask any more questions.`,
      resumeSessionId: task.session_id,
    };
  }

  // CASE 2: Fresh task — build full prompt with skills
  const instruction = task.description || task.title;
  const parentContext = task.parent_result_summary
    ? `\nCONTEXT FROM DEPENDENCIES:\n${task.parent_result_summary}`
    : '';

  // Build conversation history if exists
  let conversationHistory = '';
  if (pad?.conversation && pad.conversation.length > 0) {
    conversationHistory = '\n\nCONVERSATION HISTORY:\n' +
      pad.conversation.map((c: any) =>
        `[${c.role === 'agent' ? 'YOU ASKED' : 'USER REPLIED'}]: ${c.content}`
      ).join('\n');
  }
  if (pad?.data_collected && Object.keys(pad.data_collected).length > 0) {
    conversationHistory += '\n\nDATA ALREADY COLLECTED:\n' + JSON.stringify(pad.data_collected, null, 2);
  }

  // Load skills
  let skillsContext = '';
  try {
    const skillRows = await sbGet<Array<{ skill_name: string }>>(
      `agent_skills?agent_id=eq.${agent.id}&enabled=eq.true&select=skill_name`,
    ).catch(() => []);
    const skillNames = (Array.isArray(skillRows) ? skillRows : []).map((s: any) => s.skill_name);
    if (skillNames.length > 0) {
      const nameFilter = skillNames.map((n: string) => `name.eq.${n}`).join(',');
      const defs = await sbGet<Array<{ display_name: string; name: string; description: string; skill_definition: string }>>(
        `skill_registry?or=(${nameFilter})&select=name,display_name,description,skill_definition`,
      ).catch(() => []);
      if (Array.isArray(defs) && defs.length > 0) {
        skillsContext = `\nAVAILABLE SKILLS:\n${defs.map((s: any) =>
          `- ${s.display_name} [${s.name}]: ${s.description}\n  How: ${s.skill_definition}`
        ).join('\n')}\n
SKILL EXECUTION RULES:
1. If CONVERSATION HISTORY has [USER REPLIED] with data AND a matching skill exists → call call_skill IMMEDIATELY.
2. If DATA ALREADY COLLECTED is present → map those fields directly to skill params.
3. Only use ask_human_via_whatsapp if you are genuinely missing required params.
4. When calling call_skill, extract numbers/percentages from the user's text and pass them as the correct param types.`;
      }
    }
  } catch {}

  const safeName = agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  const fullPrompt = `${instruction}${parentContext}${conversationHistory}

ENVIRONMENT:
- Working directory: /workspace/${safeName}
- Use Read, Write, Grep, Glob, WebSearch, screenshot_page as needed.
${skillsContext}`;

  log.info(`[router] FRESH task — ${fullPrompt.length} chars, skills: ${skillsContext.length > 0 ? 'YES' : 'no'}`);
  return { prompt: fullPrompt };
}
