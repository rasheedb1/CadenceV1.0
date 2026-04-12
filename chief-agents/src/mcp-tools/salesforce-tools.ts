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

async function sfApiFetch(path: string, token: string, instanceUrl: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${instanceUrl}/services/data/v59.0${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  // Salesforce PATCH returns 204 No Content on success
  if (res.status === 204) return { success: true };
  const data = await res.json();
  if (!res.ok) throw new Error(data?.[0]?.message || JSON.stringify(data).substring(0, 300));
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

  // === NEW: Update Opportunity ===
  const updateOpportunity = tool(
    'sf_update_opportunity',
    `Update a Salesforce Opportunity. Can change stage, amount, close date, next steps, description, and any editable field.
If a stage change fails because required fields are missing, the error will tell you which fields are needed — ask the user for them and retry.
Common fields: StageName, Amount, CloseDate, NextStep, Description, Probability, LeadSource, Type.
Custom fields use __c suffix (e.g. Blockers__c, MRR__c, TAR__c, AnnualRevenue__c).`,
    {
      opportunity_id: z.string().describe('Salesforce Opportunity ID (18-char, e.g. "006Hu00000XxYyZz")'),
      fields: z.record(z.any()).describe('Fields to update as key-value pairs. Examples: {"StageName":"Closed Won","Amount":50000,"NextStep":"Sign contract","Description":"Updated notes"}'),
    },
    async ({ opportunity_id, fields }) => {
      const t = await getFreshSfToken(agent.orgId);
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        await sfApiFetch(`/sobjects/Opportunity/${opportunity_id}`, t.token, t.instanceUrl, {
          method: 'PATCH',
          body: JSON.stringify(fields),
        });
        const fieldList = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join(', ');
        return { content: [{ type: 'text' as const, text: `✅ Opportunity updated: ${fieldList}` }] };
      } catch (e: any) {
        const msg = e.message || '';
        // Detect required field errors and return helpful message
        if (msg.includes('REQUIRED_FIELD_MISSING') || msg.includes('FIELD_CUSTOM_VALIDATION_EXCEPTION')) {
          return { content: [{ type: 'text' as const, text: `❌ Update blocked — required fields missing:\n${msg}\n\nAsk the user which values to set for the missing fields, then retry with those fields included.` }] };
        }
        return { content: [{ type: 'text' as const, text: `Salesforce update error: ${msg}` }] };
      }
    },
  );

  // === NEW: Create Opportunity ===
  const createOpportunity = tool(
    'sf_create_opportunity',
    'Create a new Salesforce Opportunity. Requires Name, StageName, CloseDate at minimum. AccountId recommended.',
    {
      name: z.string().describe('Opportunity name (e.g. "Acme Corp - Enterprise License")'),
      stage: z.string().describe('Stage name (e.g. "Discovery", "Qualification", "Negotiation")'),
      close_date: z.string().describe('Expected close date (YYYY-MM-DD)'),
      amount: z.number().optional().describe('Deal value in USD'),
      account_name: z.string().optional().describe('Account name — will search and link automatically'),
      description: z.string().optional().describe('Deal description / notes'),
      next_step: z.string().optional().describe('Next step for this deal'),
      extra_fields: z.record(z.any()).optional().describe('Any additional fields as key-value pairs'),
    },
    async ({ name, stage, close_date, amount, account_name, description, next_step, extra_fields }) => {
      const t = await getFreshSfToken(agent.orgId);
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        // Resolve AccountId from name if provided
        let accountId: string | undefined;
        if (account_name) {
          const soql = encodeURIComponent(`SELECT Id FROM Account WHERE Name LIKE '%${account_name}%' LIMIT 1`);
          const acctData = await sfApiFetch(`/query/?q=${soql}`, t.token, t.instanceUrl);
          accountId = acctData.records?.[0]?.Id;
        }

        const body: Record<string, any> = {
          Name: name,
          StageName: stage,
          CloseDate: close_date,
          ...(amount !== undefined && { Amount: amount }),
          ...(accountId && { AccountId: accountId }),
          ...(description && { Description: description }),
          ...(next_step && { NextStep: next_step }),
          ...(extra_fields || {}),
        };

        const result = await sfApiFetch('/sobjects/Opportunity', t.token, t.instanceUrl, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return { content: [{ type: 'text' as const, text: `✅ Opportunity created: "${name}" (${stage})\nID: ${result.id}\n${accountId ? `Linked to account: ${account_name}` : 'No account linked — set account_name to link'}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Salesforce create error: ${e.message}` }] };
      }
    },
  );

  // === NEW: Get Contacts ===
  const getContacts = tool(
    'sf_get_contacts',
    'Search Salesforce Contacts by name, email, account, or any keyword. Returns contact details with phone, email, title, account.',
    {
      query: z.string().optional().describe('Search by name, email, or keyword'),
      account_name: z.string().optional().describe('Filter by account/company name'),
      limit: z.number().optional().describe('Max results (default 20)'),
    },
    async ({ query, account_name, limit }) => {
      const t = await getFreshSfToken(agent.orgId);
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        let where = '1=1';
        if (query) where += ` AND (Name LIKE '%${query}%' OR Email LIKE '%${query}%' OR Title LIKE '%${query}%')`;
        if (account_name) where += ` AND Account.Name LIKE '%${account_name}%'`;
        const soql = encodeURIComponent(`SELECT Id,Name,Email,Phone,MobilePhone,Title,Department,Account.Name FROM Contact WHERE ${where} ORDER BY LastModifiedDate DESC LIMIT ${limit || 20}`);
        const data = await sfApiFetch(`/query/?q=${soql}`, t.token, t.instanceUrl);
        const contacts = data.records || [];
        if (contacts.length === 0) return { content: [{ type: 'text' as const, text: 'No contacts found.' }] };
        const lines = contacts.map((c: any, i: number) =>
          `${i + 1}. **${c.Name}** — ${c.Title || '?'}\n   🏢 ${c.Account?.Name || '?'} | 📧 ${c.Email || 'N/A'} | 📱 ${c.MobilePhone || c.Phone || 'N/A'}`
        ).join('\n');
        return { content: [{ type: 'text' as const, text: `Contacts (${contacts.length}):\n\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Salesforce error: ${e.message}` }] };
      }
    },
  );

  // === NEW: Log Activity (Task/Event) ===
  const logActivity = tool(
    'sf_log_activity',
    'Log an activity in Salesforce — create a Task (call, email, to-do) or Event (meeting) linked to an Opportunity or Contact.',
    {
      type: z.enum(['Task', 'Event']).describe('"Task" for calls/emails/to-dos, "Event" for meetings'),
      subject: z.string().describe('Activity subject (e.g. "Follow-up call", "Contract review meeting")'),
      description: z.string().optional().describe('Activity details/notes'),
      related_to_id: z.string().optional().describe('Opportunity or Account ID to link this activity to (WhatId)'),
      contact_id: z.string().optional().describe('Contact ID (WhoId)'),
      due_date: z.string().optional().describe('Due date for tasks (YYYY-MM-DD) or event start (YYYY-MM-DDTHH:MM:SS)'),
      duration_minutes: z.number().optional().describe('Duration in minutes (for Events)'),
      status: z.string().optional().describe('Task status: "Not Started", "In Progress", "Completed" (default: "Completed")'),
      priority: z.string().optional().describe('Task priority: "High", "Normal", "Low" (default: "Normal")'),
    },
    async ({ type, subject, description, related_to_id, contact_id, due_date, duration_minutes, status, priority }) => {
      const t = await getFreshSfToken(agent.orgId);
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        if (type === 'Task') {
          const body: Record<string, any> = {
            Subject: subject,
            Description: description || '',
            Status: status || 'Completed',
            Priority: priority || 'Normal',
            ...(related_to_id && { WhatId: related_to_id }),
            ...(contact_id && { WhoId: contact_id }),
            ...(due_date && { ActivityDate: due_date }),
          };
          const result = await sfApiFetch('/sobjects/Task', t.token, t.instanceUrl, { method: 'POST', body: JSON.stringify(body) });
          return { content: [{ type: 'text' as const, text: `✅ Task logged: "${subject}" (${body.Status})\nID: ${result.id}` }] };
        } else {
          const startDt = due_date || new Date().toISOString();
          const endDt = new Date(new Date(startDt).getTime() + (duration_minutes || 30) * 60000).toISOString();
          const body: Record<string, any> = {
            Subject: subject,
            Description: description || '',
            StartDateTime: startDt,
            EndDateTime: endDt,
            DurationInMinutes: duration_minutes || 30,
            ...(related_to_id && { WhatId: related_to_id }),
            ...(contact_id && { WhoId: contact_id }),
          };
          const result = await sfApiFetch('/sobjects/Event', t.token, t.instanceUrl, { method: 'POST', body: JSON.stringify(body) });
          return { content: [{ type: 'text' as const, text: `✅ Event logged: "${subject}" (${duration_minutes || 30}min)\nID: ${result.id}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Salesforce activity error: ${e.message}` }] };
      }
    },
  );

  return [searchAccounts, pushLead, syncAccount, searchOpportunities, sfQuery, updateOpportunity, createOpportunity, getContacts, logActivity];
}
