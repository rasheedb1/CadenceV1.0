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
const BRIDGE_URL = process.env.BRIDGE_URL || process.env.BRIDGE_PUBLIC_URL || 'https://twilio-bridge-production-241b.up.railway.app';

async function getFreshSfToken(orgId: string): Promise<{ token: string; instanceUrl: string } | { error: string }> {
  try {
    const res = await fetch(`${BRIDGE_URL}/integrations/salesforce/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId }),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) return { error: data.error || 'Salesforce not connected. Ask user to reconnect.' };
    return { token: data.access_token, instanceUrl: data.instance_url };
  } catch (e: any) {
    return { error: `SF refresh error: ${e.message}` };
  }
}

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

async function sfApiFetch(path: string, token: string, instanceUrl: string): Promise<any> {
  const res = await fetch(`${instanceUrl}/services/data/v59.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.[0]?.message || JSON.stringify(data).substring(0, 200));
  return data;
}

export function buildSalesforceTools(agent: AgentConfig): any[] {
  const searchAccounts = tool(
    'sf_search_accounts',
    'Search Salesforce for accounts/companies. Returns matching Account records with name, industry, revenue, website.',
    {
      query: z.string().describe('Company name or keyword to search'),
    },
    async ({ query }) => {
      const t = await getFreshSfToken(agent.orgId);
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const soql = encodeURIComponent(`SELECT Id,Name,Industry,Website,AnnualRevenue,BillingCity,BillingCountry FROM Account WHERE Name LIKE '%${query}%' LIMIT 20`);
        const data = await sfApiFetch(`/query/?q=${soql}`, t.token, t.instanceUrl);
        const accs = data.records || [];
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

  const searchOpportunities = tool(
    'sf_search_opportunities',
    'Search Salesforce Opportunities. Returns open deals with account, stage, value, close date. Use for pipeline review, forecasting, or finding deals.',
    {
      owner_name: z.string().optional().describe('Filter by opportunity owner name (e.g. "Rasheed")'),
      stage: z.string().optional().describe('Filter by stage (e.g. "Negotiation", "Closed Won")'),
      query: z.string().optional().describe('Search by opportunity or account name'),
    },
    async ({ owner_name, stage, query }) => {
      const t = await getFreshSfToken(agent.orgId);
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        let where = 'IsClosed = false';
        if (owner_name) where += ` AND Owner.Name LIKE '%${owner_name}%'`;
        if (stage) where += ` AND StageName = '${stage}'`;
        if (query) where += ` AND (Name LIKE '%${query}%' OR Account.Name LIKE '%${query}%')`;
        const soql = encodeURIComponent(`SELECT Id,Name,StageName,Amount,CloseDate,Account.Name,Owner.Name,Probability FROM Opportunity WHERE ${where} ORDER BY Amount DESC NULLS LAST LIMIT 25`);
        const data = await sfApiFetch(`/query/?q=${soql}`, t.token, t.instanceUrl);
        const opps = data.records || [];
        if (opps.length === 0) return { content: [{ type: 'text' as const, text: 'No opportunities found.' }] };
        const totalValue = opps.reduce((s: number, o: any) => s + (o.Amount || 0), 0);
        const lines = opps.map((o: any, i: number) =>
          `${i + 1}. ${o.Name}\n   🏢 ${o.Account?.Name || '?'} | 📊 ${o.StageName} | 💰 $${(o.Amount || 0).toLocaleString()}\n   📅 Close: ${o.CloseDate || '?'} | 👤 ${o.Owner?.Name || '?'} | ${o.Probability || 0}% prob`
        ).join('\n');
        return { content: [{ type: 'text' as const, text: `Opportunities (${opps.length}) — Total: $${totalValue.toLocaleString()}:\n\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Salesforce error: ${e.message}` }] };
      }
    },
  );

  const sfQuery = tool(
    'sf_query',
    'Run any SOQL query against Salesforce. For advanced users — use standard Salesforce SOQL syntax.',
    {
      soql: z.string().describe('SOQL query (e.g. "SELECT Id,Name FROM Contact WHERE Email != null LIMIT 10")'),
    },
    async ({ soql }) => {
      const t = await getFreshSfToken(agent.orgId);
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const data = await sfApiFetch(`/query/?q=${encodeURIComponent(soql)}`, t.token, t.instanceUrl);
        const records = data.records || [];
        if (records.length === 0) return { content: [{ type: 'text' as const, text: 'No records found.' }] };
        return { content: [{ type: 'text' as const, text: `${records.length} records:\n\n${JSON.stringify(records.slice(0, 20), null, 2).substring(0, 8000)}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `SOQL error: ${e.message}` }] };
      }
    },
  );

  return [searchAccounts, pushLead, syncAccount, searchOpportunities, sfQuery];
}
