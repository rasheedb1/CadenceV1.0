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
      args: ['-y', '@anthropic-ai/mcp-server-playwright'],
    };
  }

  let resultText = '';
  let totalCost = 0;
  let totalTokens = 0;
  let numTurns = 0;

  try {
    for await (const message of query({
      prompt: taskPrompt,
      options: {
        model,
        systemPrompt: agent.soulPrompt,
        allowedTools,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        cwd: `/workspace/${agent.name.toLowerCase()}`,
        maxTurns: 50,
        mcpServers,
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
    log.error(`SDK query error: ${err.message}`);
    resultText = `(error: ${err.message})`;
  }

  return {
    text: resultText || '(no response)',
    tokensUsed: totalTokens,
    costUsd: totalCost,
    numTurns,
  };
}
