/**
 * Workflow tools — let agents create / edit / list XYFlow workflows from chat.
 *
 * The LLM emits a logical graph (nodes with id/type/data + edges with from/to).
 * We run dagre server-side to compute deterministic positions, then write to
 * the `workflows` table in the same JSON shape the existing WorkflowBuilder
 * UI expects.
 *
 * Capability key in integration-registry.ts: `workflows`
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import * as dagre from '@dagrejs/dagre';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';
import { sbGet, sbPostReturn, sbPatch } from '../supabase-client.js';

// --- Types we accept from the LLM (intentionally loose) --------------------

interface LlmNode {
  id: string;
  type: string;
  data?: Record<string, unknown>;
  label?: string;
}
interface LlmEdge {
  from: string;
  to: string;
  label?: string;
}

interface XyNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
  measured?: { width: number; height: number };
}
interface XyEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
  style?: { strokeWidth: number };
}

const NODE_W = 180;
const NODE_H = 64;
const RANK_SEP = 100;
const NODE_SEP = 60;

function autoLayout(nodes: LlmNode[], edges: LlmEdge[]): { nodes: XyNode[]; edges: XyEdge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', nodesep: NODE_SEP, ranksep: RANK_SEP });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) {
    if (g.node(e.from) && g.node(e.to)) g.setEdge(e.from, e.to);
  }
  dagre.layout(g);

  const xyNodes: XyNode[] = nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: n.type,
      data: { label: n.label ?? n.id, ...(n.data ?? {}) },
      position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
      measured: { width: NODE_W, height: NODE_H },
    };
  });

  const xyEdges: XyEdge[] = edges.map((e, i) => ({
    id: `xy-edge__${e.from}-${e.to}-${i}`,
    source: e.from,
    target: e.to,
    label: e.label,
    animated: true,
    style: { strokeWidth: 2 },
  }));

  return { nodes: xyNodes, edges: xyEdges };
}

async function resolveOwnerId(agent: AgentConfig): Promise<string | null> {
  // 1) Try the agent's created_by.
  const rows = await sbGet<Array<{ created_by: string | null }>>(
    `agents?id=eq.${agent.id}&select=created_by`,
  ).catch(() => []);
  if (rows[0]?.created_by) return rows[0].created_by;
  // 2) Fall back to any admin in the org.
  const admins = await sbGet<Array<{ user_id: string }>>(
    `organization_members?org_id=eq.${agent.orgId}&role=in.(admin,manager)&select=user_id&order=created_at.asc&limit=1`,
  ).catch(() => []);
  return admins[0]?.user_id ?? null;
}

// ---------------------------------------------------------------------------

export function buildWorkflowTools(agent: AgentConfig): any[] {
  const crear = tool(
    'crear_workflow',
    'Create a new visual workflow on the Chief platform. Provide nodes (each with id, type, optional data) and edges (from→to). Positions are computed server-side with auto-layout — do NOT send x/y coordinates.',
    {
      name: z.string().min(1).max(120).describe('Workflow display name'),
      description: z.string().max(600).optional(),
      nodes: z.array(z.object({
        id: z.string(),
        type: z.string().describe('Node type, e.g. trigger_manual, action_linkedin_message, condition, delay'),
        data: z.record(z.string(), z.any()).optional(),
        label: z.string().optional(),
      })).min(1).describe('Logical graph nodes; coordinates are NOT supplied here'),
      edges: z.array(z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().optional(),
      })).default([]),
      trigger_type: z.enum(['manual', 'scheduled', 'webhook', 'event']).default('manual'),
      workflow_type: z.string().default('lead'),
      schedule_cron: z.string().optional().describe('cron expression if trigger_type=scheduled'),
    },
    async ({ name, description, nodes, edges, trigger_type, workflow_type, schedule_cron }) => {
      const ownerId = await resolveOwnerId(agent);
      if (!ownerId) {
        return { content: [{ type: 'text', text: 'No owner could be resolved (org has no admin/manager).' }] };
      }
      const graph = autoLayout(nodes, edges);
      const triggerConfig = trigger_type === 'scheduled' && schedule_cron ? { cron: schedule_cron } : null;
      const inserted = await sbPostReturn<Array<{ id: string }>>('workflows', {
        org_id: agent.orgId,
        owner_id: ownerId,
        name,
        description: description ?? null,
        status: 'draft',
        graph_json: graph,
        trigger_type,
        trigger_config: triggerConfig,
        workflow_type,
      }).catch((err: any) => ({ __error: err?.message ?? String(err) } as any));
      if (inserted && (inserted as any).__error) {
        return { content: [{ type: 'text', text: `Failed: ${(inserted as any).__error}` }] };
      }
      const id = Array.isArray(inserted) ? inserted[0]?.id : (inserted as any)?.id;
      return {
        content: [{
          type: 'text',
          text: `Workflow "${name}" created (id=${id}, ${graph.nodes.length} nodes, ${graph.edges.length} edges). Open in editor: /agents/workflows/${id}`,
        }],
      };
    },
  );

  const editar = tool(
    'editar_workflow',
    'Modify an existing workflow. You can update name, description, status, trigger config, and the graph (nodes+edges). When the graph is updated, positions are recomputed server-side.',
    {
      workflow_id: z.string().uuid(),
      name: z.string().max(120).optional(),
      description: z.string().max(600).optional(),
      status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
      nodes: z.array(z.object({
        id: z.string(),
        type: z.string(),
        data: z.record(z.string(), z.any()).optional(),
        label: z.string().optional(),
      })).optional(),
      edges: z.array(z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().optional(),
      })).optional(),
    },
    async ({ workflow_id, name, description, status, nodes, edges }) => {
      // Verify org ownership.
      const existing = await sbGet<Array<{ id: string; org_id: string }>>(
        `workflows?id=eq.${workflow_id}&select=id,org_id`,
      ).catch(() => []);
      if (!existing[0]) return { content: [{ type: 'text', text: 'workflow_not_found' }] };
      if (existing[0].org_id !== agent.orgId) {
        return { content: [{ type: 'text', text: 'workflow_not_in_your_org' }] };
      }

      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (status !== undefined) updates.status = status;
      if (nodes && edges) updates.graph_json = autoLayout(nodes, edges);

      if (Object.keys(updates).length === 0) {
        return { content: [{ type: 'text', text: 'No fields to update.' }] };
      }

      await sbPatch(`workflows?id=eq.${workflow_id}`, updates).catch((err: any) => {
        return { __error: err?.message ?? String(err) };
      });

      return {
        content: [{
          type: 'text',
          text: `Workflow ${workflow_id} updated: ${Object.keys(updates).join(', ')}.`,
        }],
      };
    },
  );

  const listar = tool(
    'listar_workflows',
    "List the workflows in your org. Returns id, name, status, trigger_type and node count for each. Useful before creating a new workflow to avoid duplication, or before editing one.",
    {
      status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
      limit: z.number().int().min(1).max(50).default(20),
    },
    async ({ status, limit }) => {
      const params = new URLSearchParams();
      params.set('org_id', `eq.${agent.orgId}`);
      params.set('select', 'id,name,status,trigger_type,workflow_type,graph_json,updated_at');
      params.set('order', 'updated_at.desc');
      params.set('limit', String(limit));
      if (status) params.set('status', `eq.${status}`);
      const rows = await sbGet<Array<any>>(`workflows?${params.toString()}`).catch(() => []);
      const summarized = rows.map((w) => ({
        id: w.id,
        name: w.name,
        status: w.status,
        trigger_type: w.trigger_type,
        workflow_type: w.workflow_type,
        node_count: Array.isArray(w?.graph_json?.nodes) ? w.graph_json.nodes.length : 0,
        edge_count: Array.isArray(w?.graph_json?.edges) ? w.graph_json.edges.length : 0,
        updated_at: w.updated_at,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(summarized, null, 2) }] };
    },
  );

  return [crear, editar, listar];
}
