/**
 * Salesforce tools — proxy through existing Supabase edge functions.
 * Requires 'salesforce' capability. Auth handled by edge functions
 * (they read salesforce_connections table for OAuth tokens).
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';

const SB_URL = process.env.SUPABASE_URL || 'https://arupeqczrxmfkcbjwyad.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.AUTH_TOKEN || '';

async function edgeFn(name: string, body: any): Promise<any> {
  const res = await fetch(`${SB_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SB_KEY}`,
      'apikey': SB_KEY,
    },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { _raw: txt, _status: res.status }; }
}

export function buildSalesforceTools(agent: AgentConfig): any[] {
  const searchAccounts = tool(
    'sf_search_accounts',
    'Search Salesforce for accounts/companies. Returns matching Account records with name, industry, revenue, website.',
    {
      query: z.string().describe('Company name or keyword to search'),
    },
    async ({ query }) => {
      try {
        const data = await edgeFn('salesforce-check-accounts', {
          org_id: agent.orgId, company_name: query,
        });
        if (!data?.success && !data?.accounts) {
          return { content: [{ type: 'text' as const, text: `Salesforce error: ${data?.error || 'No accounts found or Salesforce not connected'}` }] };
        }
        const accs = data.accounts || [];
        if (accs.length === 0) return { content: [{ type: 'text' as const, text: `No accounts matching "${query}" in Salesforce.` }] };
        const lines = accs.map((a: any, i: number) =>
          `${i + 1}. ${a.Name} — ${a.Industry || '?'}\n   🌐 ${a.Website || 'N/A'} | 💰 ${a.AnnualRevenue || 'N/A'}\n   📍 ${a.BillingCity || ''}, ${a.BillingCountry || ''}`
        ).join('\n');
        return { content: [{ type: 'text' as const, text: `Salesforce accounts (${accs.length}):\n\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Salesforce error: ${e.message}` }] };
      }
    },
  );

  const pushLead = tool(
    'sf_push_lead',
    'Push a lead to Salesforce CRM. Creates or updates a Lead record.',
    {
      first_name: z.string().describe('Lead first name'),
      last_name: z.string().describe('Lead last name'),
      email: z.string().optional().describe('Lead email'),
      company: z.string().describe('Company name'),
      title: z.string().optional().describe('Job title'),
      phone: z.string().optional().describe('Phone number'),
      source: z.string().optional().describe('Lead source (e.g. "Apollo", "LinkedIn", "Referral")'),
    },
    async ({ first_name, last_name, email, company, title, phone, source }) => {
      try {
        const data = await edgeFn('salesforce-push-lead', {
          org_id: agent.orgId,
          lead: { first_name, last_name, email, company, title, phone, lead_source: source || 'Agent' },
        });
        if (!data?.success) {
          return { content: [{ type: 'text' as const, text: `Salesforce push failed: ${data?.error || 'Unknown error'}` }] };
        }
        return { content: [{ type: 'text' as const, text: `✅ Lead pushed to Salesforce: ${first_name} ${last_name} @ ${company}${data.lead_id ? ` (ID: ${data.lead_id})` : ''}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Salesforce error: ${e.message}` }] };
      }
    },
  );

  const syncAccount = tool(
    'sf_sync_account',
    'Sync account data between Chief and Salesforce. Pulls latest from SF or pushes to SF.',
    {
      company_name: z.string().describe('Company name to sync'),
      direction: z.string().optional().describe('"pull" (SF→Chief, default) or "push" (Chief→SF)'),
    },
    async ({ company_name, direction }) => {
      try {
        const data = await edgeFn('salesforce-sync', {
          org_id: agent.orgId, company_name, direction: direction || 'pull',
        });
        if (!data?.success) {
          return { content: [{ type: 'text' as const, text: `Sync failed: ${data?.error || 'Unknown error'}` }] };
        }
        return { content: [{ type: 'text' as const, text: `✅ Sync complete for "${company_name}": ${data.message || 'OK'}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Salesforce error: ${e.message}` }] };
      }
    },
  );

  return [searchAccounts, pushLead, syncAccount];
}
