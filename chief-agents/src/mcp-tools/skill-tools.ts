/**
 * Skill execution tool — allows agents to call any Supabase edge function
 * that backs a skill from skill_registry.
 *
 * This is always available to all agents (no capability gate).
 * The agent sees its skills in the prompt and calls this tool to execute them.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://arupeqczrxmfkcbjwyad.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function buildSkillTools(agent: AgentConfig): any[] {
  const callSkill = tool(
    'call_skill',
    `Execute a skill by calling its backing Supabase edge function.
Use this when a task or user request matches one of your AVAILABLE SKILLS.
The skill_definition in your prompt tells you which edge function to call and what params it needs.

Example: if skill_definition says "Calls generate-business-case edge function. Params: org_id, company_name, ..."
then use: function_name="generate-business-case", params={"org_id": "...", "company_name": "..."}

The org_id is automatically injected — you don't need to provide it.`,
    {
      function_name: z.string().describe('Edge function name from skill_definition (e.g. "generate-business-case", "company-research")'),
      params: z.record(z.any()).describe('Parameters object as described in the skill_definition'),
    },
    async ({ function_name, params }) => {
      try {
        // Always inject org_id
        const body = { ...params, org_id: agent.orgId };

        const res = await fetch(`${SUPABASE_URL}/functions/v1/${function_name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          },
          body: JSON.stringify(body),
        });

        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = text; }

        if (!res.ok) {
          return { content: [{ type: 'text' as const, text: `Skill error (${res.status}): ${typeof data === 'string' ? data.substring(0, 500) : JSON.stringify(data).substring(0, 500)}` }] };
        }

        // Format response
        const result = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        return { content: [{ type: 'text' as const, text: `Skill "${function_name}" executed successfully:\n${result.substring(0, 3000)}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Skill execution error: ${e.message}` }] };
      }
    },
  );

  return [callSkill];
}
