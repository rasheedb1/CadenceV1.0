/**
 * Chief Tools — In-process MCP server with Supabase tools
 * Available to agents during SDK query() execution.
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';
import { sbGet, sbPost, sbPostReturn } from '../supabase-client.js';
import { TYPE_CAPS } from '../types.js';
import { buildIntegrationTools } from './integration-registry.js';
import { buildSkillTools } from './skill-tools.js';

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

  // --- Report to Chief backlog (instead of spamming WhatsApp) ---
  const reportToChief = tool(
    'report_to_chief',
    'Add an item to Chief\'s backlog for human review. Use this instead of ask_human for non-urgent items: blockers, decisions needed, approval requests, or feedback. Chief reviews the backlog on their schedule — no WhatsApp spam. Use ask_human ONLY for truly urgent/blocking issues.',
    {
      category: z.string().describe('request|blocker|decision|approval|feedback'),
      title: z.string().describe('Short summary (1 line, shown in backlog list)'),
      details: z.string().optional().describe('Full context, what you tried, what you need'),
    },
    async ({ category, title, details }) => {
      await sbPost('agent_backlog', {
        org_id: agent.orgId,
        agent_id: agent.id,
        category,
        title,
        details: details || '',
        task_id: agent.currentTaskId,
        project_id: agent.currentProjectId,
      });
      return {
        content: [{ type: 'text' as const, text: `Added to Chief's backlog: [${category}] ${title}. Chief will review and respond.` }],
      };
    },
  );

  // --- Firecrawl tools (web scraping, screenshots, search) ---
  const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY || '';
  const FIRECRAWL_URL = 'https://api.firecrawl.dev/v2';

  const screenshotPage = tool(
    'screenshot_page',
    'Take a screenshot of a web page. Returns a screenshot URL. Use this to visually audit UI pages, check layouts, verify designs.',
    {
      url: z.string().describe('Full URL to screenshot (e.g. https://laiky-cadence.vercel.app/leads)'),
      wait_ms: z.number().optional().describe('Wait time in ms for page to load (default 5000)'),
    },
    async ({ url, wait_ms }) => {
      if (!FIRECRAWL_KEY) return { content: [{ type: 'text' as const, text: 'FIRECRAWL_API_KEY not configured' }] };
      try {
        const res = await fetch(`${FIRECRAWL_URL}/scrape`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${FIRECRAWL_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, formats: ['screenshot'], waitFor: wait_ms || 5000 }),
        });
        const data = await res.json() as any;
        if (data?.success && data?.data?.screenshot) {
          return { content: [{ type: 'text' as const, text: `Screenshot captured: ${data.data.screenshot}` }] };
        }
        return { content: [{ type: 'text' as const, text: `Screenshot failed: ${JSON.stringify(data).substring(0, 300)}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Screenshot error: ${e.message}` }] };
      }
    },
  );

  const scrapeUrl = tool(
    'scrape_url',
    'Scrape a web page and return its content as markdown. Use this for research, reading documentation, analyzing competitor UIs.',
    {
      url: z.string().describe('URL to scrape'),
    },
    async ({ url }) => {
      if (!FIRECRAWL_KEY) return { content: [{ type: 'text' as const, text: 'FIRECRAWL_API_KEY not configured' }] };
      try {
        const res = await fetch(`${FIRECRAWL_URL}/scrape`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${FIRECRAWL_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
        });
        const data = await res.json() as any;
        if (data?.success && data?.data?.markdown) {
          return { content: [{ type: 'text' as const, text: data.data.markdown.substring(0, 5000) }] };
        }
        return { content: [{ type: 'text' as const, text: `Scrape failed: ${JSON.stringify(data).substring(0, 300)}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Scrape error: ${e.message}` }] };
      }
    },
  );

  const firecrawlSearch = tool(
    'web_search_firecrawl',
    'Search the web using Firecrawl. Returns titles, URLs, and descriptions. Use for research, finding design references, checking competitors.',
    {
      query: z.string().describe('Search query'),
      limit: z.number().optional().describe('Max results (default 5)'),
    },
    async ({ query: q, limit }) => {
      if (!FIRECRAWL_KEY) return { content: [{ type: 'text' as const, text: 'FIRECRAWL_API_KEY not configured' }] };
      try {
        const res = await fetch(`${FIRECRAWL_URL}/search`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${FIRECRAWL_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, limit: limit || 5 }),
        });
        const data = await res.json() as any;
        const results = Array.isArray(data?.data) ? data.data : data?.data?.web || [];
        if (results.length === 0) return { content: [{ type: 'text' as const, text: 'No results found' }] };
        const formatted = results.map((r: any) => `- ${r.title}\n  ${r.url}\n  ${r.description || ''}`).join('\n\n');
        return { content: [{ type: 'text' as const, text: formatted }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Search error: ${e.message}` }] };
      }
    },
  );

  // --- Deploy tools (Vercel + Supabase) ---
  const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '';
  const VERCEL_PROJECT = process.env.VERCEL_PROJECT_NAME || 'chief.ai';
  const VERCEL_SCOPE = process.env.VERCEL_SCOPE || '';
  const SB_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
  const SB_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || '';

  const deployFrontend = tool(
    'deploy_frontend',
    'Deploy the frontend to Vercel production. Run this after git push to deploy changes live. Only use after npm run build succeeds locally.',
    {
      confirm: z.string().describe('Type "deploy" to confirm production deployment'),
    },
    async ({ confirm }) => {
      if (confirm !== 'deploy') return { content: [{ type: 'text' as const, text: 'Cancelled — type "deploy" to confirm' }] };
      if (!VERCEL_TOKEN) return { content: [{ type: 'text' as const, text: 'VERCEL_TOKEN not configured' }] };
      try {
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execFileAsync = promisify(execFile);
        const cwd = `/workspace/${agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')}`;
        const args = ['--prod', '--yes', `--token=${VERCEL_TOKEN}`, `--name`, VERCEL_PROJECT];
        if (VERCEL_SCOPE) args.push('--scope', VERCEL_SCOPE);
        const { stdout } = await execFileAsync('vercel', args, { cwd, timeout: 300_000, env: { ...process.env, HOME: '/home/agent' } });
        return { content: [{ type: 'text' as const, text: `Deploy successful!\n${stdout.substring(0, 1000)}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Deploy failed: ${(e.stderr || e.message || '').substring(0, 500)}` }] };
      }
    },
  );

  const deployEdgeFunction = tool(
    'deploy_edge_function',
    'Deploy a Supabase Edge Function to production. Use after modifying files in supabase/functions/.',
    {
      function_name: z.string().describe('Edge function name (e.g. "phase-transition", "task-hygiene")'),
    },
    async ({ function_name }) => {
      if (!SB_ACCESS_TOKEN || !SB_PROJECT_REF) return { content: [{ type: 'text' as const, text: 'SUPABASE_ACCESS_TOKEN not configured' }] };
      try {
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execFileAsync = promisify(execFile);
        const cwd = `/workspace/${agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')}`;
        const { stdout } = await execFileAsync('npx', ['supabase', 'functions', 'deploy', function_name, '--no-verify-jwt', '--project-ref', SB_PROJECT_REF], {
          cwd, timeout: 120_000,
          env: { ...process.env, HOME: '/home/agent', SUPABASE_ACCESS_TOKEN: SB_ACCESS_TOKEN },
        });
        return { content: [{ type: 'text' as const, text: `Edge function deployed!\n${stdout.substring(0, 500)}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Deploy failed: ${(e.stderr || e.message || '').substring(0, 500)}` }] };
      }
    },
  );

  const pushMigration = tool(
    'push_db_migration',
    'Push a SQL migration to the Supabase database. Use after creating a new migration file in supabase/migrations/.',
    {
      sql: z.string().describe('The SQL to execute on the production database'),
    },
    async ({ sql }) => {
      if (!SB_ACCESS_TOKEN || !SB_PROJECT_REF) return { content: [{ type: 'text' as const, text: 'SUPABASE_ACCESS_TOKEN not configured' }] };
      try {
        const res = await fetch(`https://api.supabase.com/v1/projects/${SB_PROJECT_REF}/database/query`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SB_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: sql }),
        });
        const data = await res.json();
        if (res.ok) return { content: [{ type: 'text' as const, text: `Migration applied: ${JSON.stringify(data).substring(0, 500)}` }] };
        return { content: [{ type: 'text' as const, text: `Migration failed: ${JSON.stringify(data).substring(0, 500)}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Migration error: ${e.message}` }] };
      }
    },
  );

  // ---------- Integration tools (capability-gated per agent) ----------
  const integrationTools = buildIntegrationTools(agent);

  // ---------- Skill execution tools (always available) ----------
  const skillTools = buildSkillTools(agent);

  return createSdkMcpServer({
    name: 'chief-tools',
    version: '1.0.0',
    tools: [sendMessage, saveArtifact, createSubtask, queryKnowledge, askHuman, reportToChief, screenshotPage, scrapeUrl, firecrawlSearch, deployFrontend, deployEdgeFunction, pushMigration, ...integrationTools, ...skillTools],
  });
}
