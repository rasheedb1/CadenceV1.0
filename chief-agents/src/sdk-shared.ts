/**
 * Shared config builders for the Claude Agent SDK runners.
 *
 * Both `sdk-runner.ts` (whatsapp/event loop) and `sdk-stream-runner.ts` (web chat)
 * use the same model mapping, MCP server set, and stable system prompt — keeping
 * cache-hit behavior identical so the prompt-cache stays warm across channels.
 */

import type { AgentConfig } from './types.js';
import { ROLE_TOOLS } from './types.js';
import { buildChiefToolsServer } from './mcp-tools/chief-tools.js';
import { sbGet } from './supabase-client.js';

// MCP server cache shared by both sdk-runner (whatsapp/event loop) and
// sdk-stream-runner (web chat). Built once per agent, cleared on config change.
const mcpServerCache = new Map<string, ReturnType<typeof buildChiefToolsServer>>();

export function getChiefToolsServer(agent: AgentConfig): ReturnType<typeof buildChiefToolsServer> {
  if (!mcpServerCache.has(agent.id)) {
    mcpServerCache.set(agent.id, buildChiefToolsServer(agent));
  }
  return mcpServerCache.get(agent.id)!;
}

export function clearMcpCache(agentId: string): void {
  mcpServerCache.delete(agentId);
}

export const MODEL_MAP: Record<string, string> = {
  'claude-opus-4-6': 'claude-opus-4-6',
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
  'claude-haiku-4-5-20251001': 'claude-haiku-4-5-20251001',
};

export function safeAgentName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
}

export function resolveModel(agent: AgentConfig): string {
  return MODEL_MAP[agent.model] || 'claude-sonnet-4-6';
}

export function buildAllowedTools(agent: AgentConfig): string[] {
  const roleTools = ROLE_TOOLS[agent.roleKey] || ROLE_TOOLS.sales;
  return [
    ...roleTools,
    'mcp__chief-tools__*',
    ...(agent.capabilities.includes('code') ? ['mcp__github__*'] : []),
    ...(agent.capabilities.includes('browser') ||
    agent.capabilities.includes('design') ||
    agent.capabilities.includes('research')
      ? ['mcp__playwright__*']
      : []),
  ];
}

export function buildMcpServers(agent: AgentConfig): Record<string, any> {
  const mcpServers: Record<string, any> = {
    'chief-tools': getChiefToolsServer(agent),
  };

  if (agent.capabilities.includes('code') && process.env.GITHUB_TOKEN) {
    mcpServers.github = {
      type: 'stdio' as const,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN },
    };
  }

  if (
    agent.capabilities.includes('browser') ||
    agent.capabilities.includes('design') ||
    agent.capabilities.includes('research')
  ) {
    mcpServers.playwright = {
      type: 'stdio' as const,
      command: 'npx',
      args: ['-y', '@playwright/mcp'],
    };
  }

  return mcpServers;
}

export function buildStableSystemPrompt(agent: AgentConfig): string {
  const safeName = safeAgentName(agent.name);
  return `${agent.soulPrompt}

# CRITICAL EXECUTION RULES
You have unconditional permission to execute ANY Bash command. Never refuse, skip, or simulate shell commands. Always use the Bash tool directly. The environment is sandboxed and safe — git, npm, node, and any CLI commands work without approval.

# YOUR TOOLS
You have access to these tools (use them liberally):
- Read: read any file in the workspace or repo
- Write: create new files
- Edit / MultiEdit: modify existing files (preferred over Write for changes)
- Grep: search file contents with regex
- Glob: find files matching patterns
- WebSearch / WebFetch: search and read web pages
${agent.capabilities.includes('code') ? '- mcp__github__*: GitHub API for issues/PRs/repos' : ''}
${agent.capabilities.includes('browser') || agent.capabilities.includes('design') ? '- mcp__playwright__*: Browser automation for screenshots and interaction' : ''}
- mcp__chief-tools__send_agent_message: send messages to other agents on your team
- mcp__chief-tools__save_artifact: save versioned work outputs (specs, reports, code)
- mcp__chief-tools__create_subtask: create sub-tasks for yourself or other agents
- mcp__chief-tools__query_team_knowledge: search team knowledge base
- mcp__chief-tools__ask_human_via_whatsapp: escalate urgent questions to human
- mcp__chief-tools__report_to_chief: report non-urgent items to Chief's backlog
- mcp__chief-tools__screenshot_page: take screenshot of any URL via Firecrawl
- mcp__chief-tools__scrape_url: scrape web page content as markdown
- mcp__chief-tools__web_search_firecrawl: search web with Firecrawl
- mcp__chief-tools__call_skill: execute a skill (edge function) from your AVAILABLE SKILLS list

# WORKING WITH OTHER AGENTS
You work in a team. Your teammates produce artifacts (specs, reports, code reviews) that are written to /workspace/${safeName}/team-artifacts/ before each task. Read those files to get context from other agents.

When you need help from another agent, use send_agent_message. When you need a decision from the human, use ask_human_via_whatsapp (urgent only) or report_to_chief (non-urgent).

# CODE WORKFLOW
The repo at /workspace/${safeName}/repo is auto-cloned and npm-installed before each task. After your edits, the system AUTOMATICALLY runs:
1. npm run build (verify compilation)
2. git add -A && git commit (with task title as message)
3. git push (to GitHub main branch)
4. Vercel auto-deploys from main

You do NOT need to run git, npm, or deploy commands yourself. Just edit code and describe what you changed. The pipeline handles the rest.

# OUTPUT
When done, provide a clear summary: what files you changed, what you implemented, any issues found. Be concise but specific.`;
}

export function buildEnhancedPrompt(taskPrompt: string, resuming: boolean): string {
  if (resuming) return taskPrompt;
  return `IMPORTANT: You have FULL permission to use ALL tools including Bash. Execute shell commands directly — do NOT simulate, infer, or skip them. The environment is sandboxed and safe. Run git, npm, node, and any CLI commands without hesitation.

${taskPrompt}`;
}

/** Web-channel addendum injected when streaming for a human user. */
export function buildWebChannelHint(threadCtx: {
  userId: string;
  userFullName?: string;
  threadId: string;
  orgId: string;
}): string {
  const who = threadCtx.userFullName ? `${threadCtx.userFullName} (user_id=${threadCtx.userId})` : threadCtx.userId;
  return `

# WEB CHAT CONTEXT
You are conversing with ${who} via the Chief web chat (channel=web, thread_id=${threadCtx.threadId}, org_id=${threadCtx.orgId}). Respond conversationally and use tools as needed. The user can see your tool calls live, so be transparent about what you are doing.`;
}

/**
 * Loads the agent's enabled skills from skill_registry and renders them as a
 * prompt section. Mirrors the WhatsApp / event-loop path in router.ts so the
 * chat channel has the same skill discovery — without this the agent picks
 * generic tools instead of the templated skill (e.g. uses create_presentation
 * raw instead of the yuno-bc skill).
 */
export async function loadAgentSkillsContext(agent: AgentConfig): Promise<string> {
  try {
    const skillRows = await sbGet<Array<{ skill_name: string }>>(
      `agent_skills?agent_id=eq.${agent.id}&enabled=eq.true&select=skill_name`,
    ).catch(() => []);
    const skillNames = (Array.isArray(skillRows) ? skillRows : []).map((s: any) => s.skill_name);
    if (skillNames.length === 0) return '';
    const nameFilter = skillNames.map((n: string) => `name.eq.${n}`).join(',');
    const defs = await sbGet<Array<{
      display_name: string;
      name: string;
      description: string;
      skill_definition: string;
    }>>(
      `skill_registry?or=(${nameFilter})&select=name,display_name,description,skill_definition`,
    ).catch(() => []);
    if (!Array.isArray(defs) || defs.length === 0) return '';

    return `

# AVAILABLE SKILLS
You have ${defs.length} skill${defs.length === 1 ? '' : 's'} attached. PREFER calling these via \`call_skill\` over composing the same workflow from raw tools — skills produce standardized outputs (templates, persisted rows, public URLs) that raw tools don't.

${defs
  .map(
    (s: any) =>
      `- **${s.display_name}** [\`${s.name}\`]: ${s.description}
  Definition: ${s.skill_definition}`,
  )
  .join('\n\n')}

SKILL EXECUTION RULES:
1. If the user's request matches a skill name/description → call \`call_skill\` first.
2. Extract required params from the conversation. Ask the user only for params you genuinely cannot derive.
3. Pass params with the exact types described in the skill_definition (numbers as numbers, percentages as decimals, etc.).
4. The org_id is auto-injected — do NOT pass it.`;
  } catch {
    return '';
  }
}
