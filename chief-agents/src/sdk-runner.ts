/**
 * SDK Runner — Claude Agent SDK wrapper
 * Replaces OpenClaw CLI callGateway() with query() + bypassPermissions.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentConfig, SDKResult } from './types.js';
import { ROLE_TOOLS } from './types.js';
import { buildChiefToolsServer } from './mcp-tools/chief-tools.js';
import type { Logger } from './utils/logger.js';

// Model mapping from agents table values
const MODEL_MAP: Record<string, string> = {
  'claude-opus-4-6': 'claude-opus-4-6',
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
  'claude-haiku-4-5-20251001': 'claude-haiku-4-5-20251001',
};

// Cache MCP servers per agent (instantiated once per loop start, not per call)
const mcpServerCache = new Map<string, ReturnType<typeof buildChiefToolsServer>>();

function getChiefToolsServer(agent: AgentConfig): ReturnType<typeof buildChiefToolsServer> {
  if (!mcpServerCache.has(agent.id)) {
    mcpServerCache.set(agent.id, buildChiefToolsServer(agent));
  }
  return mcpServerCache.get(agent.id)!;
}

/** Clear cached MCP server (e.g. when agent config changes) */
export function clearMcpCache(agentId: string): void {
  mcpServerCache.delete(agentId);
}

/**
 * Execute a task using Claude Agent SDK query().
 * This is THE key change from OpenClaw — bypassPermissions means no /approve prompts.
 */
export async function executeWithSDK(
  agent: AgentConfig,
  taskPrompt: string,
  log: Logger,
  resumeSessionId?: string, // Pass existing session_id to resume instead of starting fresh
): Promise<SDKResult> {
  const chiefTools = getChiefToolsServer(agent);
  const roleTools = ROLE_TOOLS[agent.roleKey] || ROLE_TOOLS.sales;
  const model = MODEL_MAP[agent.model] || 'claude-sonnet-4-6';

  const allowedTools = [
    ...roleTools,
    'mcp__chief-tools__*',
    ...(agent.capabilities.includes('code') ? ['mcp__github__*'] : []),
    ...(agent.capabilities.includes('browser') || agent.capabilities.includes('design') || agent.capabilities.includes('research')
      ? ['mcp__playwright__*'] : []),
  ];

  // Build MCP servers config
  const mcpServers: Record<string, any> = {
    'chief-tools': chiefTools,
  };

  // GitHub MCP (for agents with code capability)
  if (agent.capabilities.includes('code') && process.env.GITHUB_TOKEN) {
    mcpServers.github = {
      type: 'stdio' as const,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN },
    };
  }

  // Playwright MCP (for agents needing browser)
  if (agent.capabilities.includes('browser') || agent.capabilities.includes('design') || agent.capabilities.includes('research')) {
    mcpServers.playwright = {
      type: 'stdio' as const,
      command: 'npx',
      args: ['-y', '@playwright/mcp'],
    };
  }

  let resultText = '';
  let totalCost = 0;
  let totalTokens = 0;
  let numTurns = 0;
  let capturedSessionId: string | null = null;
  let resultSubtype: string | null = null;
  const stderrLines: string[] = [];

  try {
    const safeName = agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    log.info(`Starting SDK query for ${agent.name}, model=${model}, cwd=/workspace/${safeName}${resumeSessionId ? `, RESUMING session ${resumeSessionId.substring(0, 12)}` : ''}`);
    const enhancedPrompt = resumeSessionId
      ? taskPrompt  // When resuming, the session already has context — just send the new info
      : `IMPORTANT: You have FULL permission to use ALL tools including Bash. Execute shell commands directly — do NOT simulate, infer, or skip them. The environment is sandboxed and safe. Run git, npm, node, and any CLI commands without hesitation.

${taskPrompt}`;

    // Build a LARGE stable system prompt to trigger Claude Code's automatic prompt caching
    // (caching kicks in when system prompt > 1024 tokens for Sonnet, > 2048 for Haiku)
    const stableSystemPrompt = `${agent.soulPrompt}

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

    for await (const message of query({
      prompt: enhancedPrompt,
      options: {
        model,
        // When resuming, don't pass systemPrompt — the session already has it
        ...(resumeSessionId
          ? { resume: resumeSessionId }
          : { systemPrompt: stableSystemPrompt }),
        allowedTools,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        cwd: `/workspace/${safeName}`,
        maxTurns: 15,
        mcpServers,
        // Auto-approve ALL tool calls — this is the belt-and-suspenders fix
        // for bypassPermissions not fully bypassing Bash in Docker
        canUseTool: async (_toolName: string, input: Record<string, unknown>) => ({
          behavior: 'allow' as const,
          updatedInput: input,
        }),
        // Merge all env vars + ensure HOME is correct for non-root user
        env: { ...process.env, HOME: process.env.HOME || '/home/agent' },
        // Capture stderr for debugging
        stderr: (data: string) => {
          if (data.trim()) {
            stderrLines.push(data.trim());
            log.warn(`[SDK stderr] ${data.trim().substring(0, 300)}`);
          }
        },
      },
    })) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            resultText += (block as any).text;
          }
        }
      }

      // Capture session_id from every message (it's the same across all messages in a session)
      if ((message as any).session_id) {
        capturedSessionId = (message as any).session_id;
      }

      if (message.type === 'result') {
        totalCost = (message as any).total_cost_usd || 0;
        numTurns = (message as any).num_turns || 0;
        resultSubtype = (message as any).subtype || null;
        capturedSessionId = (message as any).session_id || capturedSessionId;
        const usage = (message as any).usage;
        if (usage) {
          totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
          const cacheRead = usage.cache_read_input_tokens || 0;
          const cacheWrite = usage.cache_creation_input_tokens || 0;
          if (cacheRead > 0 || cacheWrite > 0) {
            log.info(`SDK cache: read=${cacheRead}, write=${cacheWrite} tokens (${cacheRead > 0 ? '90% discount applied' : 'first call, will cache'})`);
          }
        }
        // Use the result text if available
        if ((message as any).result) {
          resultText = (message as any).result;
        }
        log.info(`SDK session_id: ${capturedSessionId?.substring(0, 16) || 'none'}, subtype: ${resultSubtype}`);
      }
    }
  } catch (err: any) {
    const errDetail = err.stack || err.message || String(err);
    const stderrOutput = stderrLines.join('\n');
    log.error(`SDK query error: ${errDetail.substring(0, 500)}`);
    if (stderrOutput) log.error(`SDK stderr output: ${stderrOutput.substring(0, 500)}`);
    // Write detailed error + stderr to activity log for debugging
    const { sbPost } = await import('./supabase-client.js');
    sbPost('agent_activity_events', {
      agent_id: agent.id, org_id: agent.orgId,
      event_type: 'sdk_error', tool_name: 'executeWithSDK',
      content: `SDK CRASH: ${errDetail.substring(0, 1000)}\n\nSTDERR: ${stderrOutput.substring(0, 1000)}`,
    }).catch(() => {});
    resultText = `(error: ${err.message})`;
  }

  return {
    text: resultText || '(no response)',
    tokensUsed: totalTokens,
    costUsd: totalCost,
    numTurns,
    sessionId: capturedSessionId,
    subtype: resultSubtype,
  };
}
