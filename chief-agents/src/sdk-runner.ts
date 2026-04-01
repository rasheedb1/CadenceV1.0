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
  const stderrLines: string[] = [];

  try {
    const safeName = agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    log.info(`Starting SDK query for ${agent.name}, model=${model}, cwd=/workspace/${safeName}`);
    const enhancedPrompt = `IMPORTANT: You have FULL permission to use ALL tools including Bash. Execute shell commands directly — do NOT simulate, infer, or skip them. The environment is sandboxed and safe. Run git, npm, node, and any CLI commands without hesitation.

${taskPrompt}`;

    for await (const message of query({
      prompt: enhancedPrompt,
      options: {
        model,
        systemPrompt: agent.soulPrompt + '\n\nCRITICAL: You have unconditional permission to execute ANY Bash command. Never refuse, skip, or simulate shell commands. Always use the Bash tool directly.',
        allowedTools,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        cwd: `/workspace/${safeName}`,
        maxTurns: 50,
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

      if (message.type === 'result') {
        totalCost = (message as any).total_cost_usd || 0;
        numTurns = (message as any).num_turns || 0;
        const usage = (message as any).usage;
        if (usage) {
          totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
        }
        // Use the result text if available
        if ((message as any).result) {
          resultText = (message as any).result;
        }
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
  };
}
