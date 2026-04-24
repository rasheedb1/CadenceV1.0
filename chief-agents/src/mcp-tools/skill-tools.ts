/**
 * Skill execution tool — allows agents to call any Supabase edge function
 * or bridge endpoint that backs a skill from skill_registry.
 *
 * This is always available to all agents (no capability gate).
 * The agent sees its skills in the prompt and calls this tool to execute them.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://arupeqczrxmfkcbjwyad.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BRIDGE_URL = process.env.BRIDGE_URL || process.env.BRIDGE_PUBLIC_URL || 'https://twilio-bridge-production-241b.up.railway.app';

// Skills whose backing function lives on the bridge, not Supabase edge functions
const BRIDGE_SKILLS: Record<string, string> = {
  'generate-business-case': '/api/generate-business-case',
  'generate-contract': '/api/generate-contract',
};

export function buildSkillTools(agent: AgentConfig): any[] {
  const callSkill = tool(
    'call_skill',
    `Execute a skill by calling its backing function (edge function or bridge API).
Use this when a task or user request matches one of your AVAILABLE SKILLS.
The skill_definition in your prompt tells you which function to call and what params it needs.

Example: if skill_definition says "Calls generate-business-case edge function via bridge. Params: clientName, ..."
then use: function_name="generate-business-case", params={"clientName": "Acme Corp", ...}

The org_id is automatically injected — you don't need to provide it.`,
    {
      function_name: z.string().describe('Function name from skill_definition (e.g. "generate-business-case", "company-research", "cascade-search-company")'),
      params: z.record(z.any()).describe('Parameters object as described in the skill_definition'),
    },
    async ({ function_name, params }) => {
      try {
        const body = { ...params, org_id: agent.orgId, owner_id: agent.id };

        // Determine endpoint: bridge or Supabase edge function
        const isBridge = BRIDGE_SKILLS[function_name];
        const url = isBridge
          ? `${BRIDGE_URL}${isBridge}`
          : `${SUPABASE_URL}/functions/v1/${function_name}`;

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (!isBridge) {
          headers['Authorization'] = `Bearer ${SUPABASE_SERVICE_KEY}`;
        }

        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = text; }

        if (!res.ok) {
          return { content: [{ type: 'text' as const, text: `Skill error (${res.status}): ${typeof data === 'string' ? data.substring(0, 500) : JSON.stringify(data).substring(0, 500)}` }] };
        }

        // Format response — handle bridge's {success, url, summary} format
        if (data?.success && data?.url) {
          const s = data.summary || {};
          const summary = s.clientName
            ? `Business Case for ${s.clientName}:\n- TPV/mes: $${((s.totalTPVMensual || 0)/1e6).toFixed(1)}M\n- Ahorro MDR: $${((s.ahorroMDRMensual || 0)/1e3).toFixed(0)}K/mes\n- Revenue adicional: $${((s.aumentoRevenue || 0)/1e3).toFixed(0)}K/mes\n- Impacto total: $${((s.totalMensual || 0)/1e3).toFixed(0)}K/mes\n- Slides: ${s.slides || '?'}`
            : '';
          return { content: [{ type: 'text' as const, text: `✅ Skill executed successfully.\n${summary}\n\n📥 Download: ${data.url}` }] };
        }

        const result = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        return { content: [{ type: 'text' as const, text: `Skill "${function_name}" executed successfully:\n${result.substring(0, 3000)}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Skill execution error: ${e.message}` }] };
      }
    },
  );

  return [callSkill];
}
