/**
 * Chief Tools — In-process MCP server with Supabase tools
 * Available to agents during SDK query() execution.
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';
import { sbGet, sbPost, sbPostReturn } from '../supabase-client.js';
import { TYPE_CAPS } from '../types.js';

async function resolveAgentId(orgId: string, name: string): Promise<string | null> {
  const rows = await sbGet<Array<{ id: string }>>(
    `agents?org_id=eq.${orgId}&name=ilike.%${encodeURIComponent(name)}%&limit=1&select=id`,
  ).catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0].id : null;
}

export function buildChiefToolsServer(agent: AgentConfig) {
  const sendMessage = tool(
    'send_agent_message',
    'Send a message to another agent on your team. Use for questions, proposals, sharing context, or decisions. Set to_agent="team" to broadcast.',
    {
      to_agent: z.string().describe('Agent name or "team" for broadcast'),
      message: z.string().describe('Message content'),
      message_type: z.string().optional().describe('question|answer|proposal|decision|blocker|info'),
    },
    async ({ to_agent, message, message_type }) => {
      const toAgentId = to_agent === 'team' ? null : await resolveAgentId(agent.orgId, to_agent);
      await sbPost('agent_messages', {
        org_id: agent.orgId,
        from_agent_id: agent.id,
        to_agent_id: toAgentId,
        content: message,
        message_type: message_type || 'info',
        project_id: agent.currentProjectId,
      });
      return { content: [{ type: 'text' as const, text: `Message sent to ${to_agent}` }] };
    },
  );

  const saveArtifact = tool(
    'save_artifact',
    'Save a work output (code, document, design, analysis) as a versioned artifact. Other agents will see the content_summary.',
    {
      filename: z.string().describe('Artifact filename'),
      artifact_type: z.string().describe('code|design|research|report|review|spec|general'),
      content: z.string().describe('Full artifact content'),
      content_summary: z.string().describe('~200 word summary for other agents'),
    },
    async ({ filename, artifact_type, content, content_summary }) => {
      // Auto-version: find latest version
      const existing = await sbGet<Array<{ version: number }>>(
        `agent_artifacts?created_by=eq.${agent.id}&filename=eq.${encodeURIComponent(filename)}&order=version.desc&limit=1&select=version`,
      ).catch(() => []);
      const version = (Array.isArray(existing) && existing[0]?.version || 0) + 1;

      const data = await sbPostReturn<{ id: string }>('agent_artifacts', {
        org_id: agent.orgId,
        created_by: agent.id,
        task_id: agent.currentTaskId,
        project_id: agent.currentProjectId,
        filename,
        version,
        artifact_type,
        content: content.substring(0, 10000),
        content_summary: content_summary.substring(0, 500),
      });

      return {
        content: [{ type: 'text' as const, text: `Artifact saved: ${filename} v${version}${data?.id ? ` (${data.id})` : ''}` }],
      };
    },
  );

  const createSubtask = tool(
    'create_subtask',
    'Create a sub-task for yourself or another team member. Use to break down complex work.',
    {
      title: z.string().describe('Task title'),
      description: z.string().describe('Task description'),
      assign_to: z.string().describe('Agent name, "self", or "auto" (capability match)'),
      task_type: z.string().describe('code|design|research|qa|writing|general'),
      priority: z.number().optional().describe('0-100, lower=higher priority'),
      depends_on_task_id: z.string().optional().describe('Task ID this depends on'),
    },
    async ({ title, description, assign_to, task_type, priority, depends_on_task_id }) => {
      const assigneeId = assign_to === 'self' ? agent.id
        : assign_to === 'auto' ? null
        : await resolveAgentId(agent.orgId, assign_to);

      await sbPost('agent_tasks_v2', {
        org_id: agent.orgId,
        project_id: agent.currentProjectId,
        parent_task_id: agent.currentTaskId,
        title,
        description,
        task_type,
        required_capabilities: TYPE_CAPS[task_type] || [],
        priority: priority || 50,
        status: assigneeId ? 'claimed' : 'ready',
        assigned_agent_id: assigneeId,
        assigned_at: assigneeId ? new Date().toISOString() : null,
        depends_on: depends_on_task_id ? [depends_on_task_id] : [],
      });

      return { content: [{ type: 'text' as const, text: `Subtask created: "${title}" → ${assign_to}` }] };
    },
  );

  const queryKnowledge = tool(
    'query_team_knowledge',
    'Search the team knowledge base for lessons learned, decisions, and facts.',
    {
      query: z.string().describe('Search query'),
    },
    async ({ query: searchQuery }) => {
      const rows = await sbGet<Array<{ content: string; category: string; importance: number }>>(
        `agent_knowledge?or=(agent_id.eq.${agent.id},agent_id.is.null)&org_id=eq.${agent.orgId}&content=ilike.%${encodeURIComponent(searchQuery)}%&order=importance.desc&limit=5&select=content,category,importance`,
      ).catch(() => []);

      const results = Array.isArray(rows) && rows.length > 0
        ? rows.map((k) => `[${k.category}] ${k.content}`).join('\n')
        : 'No results found';
      return { content: [{ type: 'text' as const, text: results }] };
    },
  );

  const askHuman = tool(
    'ask_human_via_whatsapp',
    'Send a question to the human via WhatsApp. Use when you need approval, clarification, or a decision that only a human can make.',
    {
      message: z.string().describe('Question for the human'),
      priority: z.string().optional().describe('normal|urgent'),
    },
    async ({ message, priority }) => {
      await sbPost('outbound_human_messages', {
        org_id: agent.orgId,
        agent_id: agent.id,
        message,
        channel: 'whatsapp',
        status: 'pending',
        priority: priority || 'normal',
      });
      return {
        content: [{ type: 'text' as const, text: 'Question sent to human via WhatsApp. Reply will arrive in your next SENSE cycle.' }],
      };
    },
  );

  return createSdkMcpServer({
    name: 'chief-tools',
    version: '1.0.0',
    tools: [sendMessage, saveArtifact, createSubtask, queryKnowledge, askHuman],
  });
}
