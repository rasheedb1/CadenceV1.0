/**
 * Agent Config — loads and transforms agent config from Supabase agents table
 */

import type { AgentRow, AgentConfig } from './types.js';

/** Map agent role text to a roleKey for tool selection */
function roleToKey(role: string): string {
  const r = role.toLowerCase();
  if (r.includes('cto') || r.includes('dev') || r.includes('full-stack') || r.includes('engineer')) return 'cto';
  if (r.includes('ux') || r.includes('ui') || r.includes('design')) return 'ux_designer';
  if (r.includes('qa') || r.includes('quality') || r.includes('test')) return 'qa_engineer';
  if (r.includes('sales') || r.includes('outreach') || r.includes('bdr')) return 'sales';
  return 'sales'; // default
}

/** Transform a DB agent row into runtime config */
export function loadAgentConfig(agent: AgentRow): AgentConfig {
  return {
    id: agent.id,
    orgId: agent.org_id,
    name: agent.name,
    role: agent.role,
    roleKey: roleToKey(agent.role),
    model: agent.model || 'claude-sonnet-4-6',
    temperature: agent.temperature ?? 0.7,
    maxTokens: agent.max_tokens || 4096,
    capabilities: agent.capabilities || [],
    team: agent.team,
    tier: agent.tier || 'worker',
    soulPrompt: agent.soul_md || buildDefaultSoul(agent),
    currentTaskId: null,
    currentProjectId: null,
  };
}

function buildDefaultSoul(agent: AgentRow): string {
  return `You are ${agent.name}, a ${agent.role} on the Chief AI platform.
Your capabilities: ${(agent.capabilities || []).join(', ') || 'general'}.
Team: ${agent.team || 'unassigned'}. Tier: ${agent.tier || 'worker'}.

RULES:
- Deliver value first, ask questions only when truly blocked.
- Work autonomously — complete tasks end-to-end.
- Use save_artifact to persist your work outputs.
- Use send_agent_message to coordinate with teammates.
- Use ask_human_via_whatsapp only when you need human approval or decisions.
- Always include a result_summary when completing tasks.
- Respond in English.`;
}
