/**
 * LinkedIn tools — via Unipile API.
 * Requires 'linkedin' capability. Auth: UNIPILE_DSN + UNIPILE_ACCESS_TOKEN env vars.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';
import { sbGet } from '../supabase-client.js';

const UNIPILE_DSN = process.env.UNIPILE_DSN || '';
const UNIPILE_TOKEN = process.env.UNIPILE_ACCESS_TOKEN || '';

async function unipileFetch(path: string, method = 'GET', body?: any): Promise<any> {
  if (!UNIPILE_DSN || !UNIPILE_TOKEN) throw new Error('UNIPILE_DSN / UNIPILE_ACCESS_TOKEN not configured');
  const res = await fetch(`https://${UNIPILE_DSN}${path}`, {
    method,
    headers: { 'X-API-KEY': UNIPILE_TOKEN, 'Content-Type': 'application/json', accept: 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { _raw: txt, _status: res.status }; }
}

async function getLinkedInAccountId(orgId: string): Promise<string | null> {
  // Find the org's LinkedIn Unipile account
  const members = await sbGet<Array<{ user_id: string }>>(
    `organization_members?org_id=eq.${orgId}&role=eq.admin&select=user_id&limit=1`,
  ).catch(() => []);
  if (!Array.isArray(members) || members.length === 0) return null;
  const accs = await sbGet<Array<{ account_id: string }>>(
    `unipile_accounts?user_id=eq.${members[0].user_id}&provider=eq.LINKEDIN&status=eq.active&select=account_id&limit=1`,
  ).catch(() => []);
  return Array.isArray(accs) && accs[0] ? accs[0].account_id : null;
}

export function buildLinkedInTools(agent: AgentConfig): any[] {
  const viewProfile = tool(
    'linkedin_view_profile',
    'View a LinkedIn profile by provider_id or profile URL. Returns name, headline, company, location.',
    {
      profile_id: z.string().optional().describe('LinkedIn provider ID (ACoAA...)'),
      profile_url: z.string().optional().describe('LinkedIn profile URL'),
    },
    async ({ profile_id, profile_url }) => {
      try {
        const id = profile_id || profile_url;
        if (!id) return { content: [{ type: 'text' as const, text: 'Provide profile_id or profile_url' }] };
        const data = await unipileFetch(`/api/v1/users/${encodeURIComponent(id)}`);
        const name = `${data.first_name || ''} ${data.last_name || ''}`.trim();
        const text = `${name}\n${data.headline || ''}\n🏢 ${data.company || ''}\n📍 ${data.location || ''}\n🔗 ${data.profile_url || ''}`;
        return { content: [{ type: 'text' as const, text }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `LinkedIn error: ${e.message}` }] };
      }
    },
  );

  const sendConnection = tool(
    'linkedin_send_connection',
    'Send a LinkedIn connection request to a profile. Optional personalized note (max 300 chars).',
    {
      profile_id: z.string().describe('LinkedIn provider ID'),
      message: z.string().optional().describe('Connection note (max 300 chars)'),
    },
    async ({ profile_id, message }) => {
      try {
        const accountId = await getLinkedInAccountId(agent.orgId);
        if (!accountId) return { content: [{ type: 'text' as const, text: 'No LinkedIn account connected. Ask user to connect LinkedIn in Unipile.' }] };
        const body: any = { account_id: accountId, provider_id: profile_id };
        if (message) body.message = message.substring(0, 300);
        const data = await unipileFetch('/api/v1/users/invite', 'POST', body);
        return { content: [{ type: 'text' as const, text: `✅ Connection request sent to ${profile_id}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `LinkedIn error: ${e.message}` }] };
      }
    },
  );

  const sendMessage = tool(
    'linkedin_send_message',
    'Send a LinkedIn message to an existing connection.',
    {
      profile_id: z.string().describe('LinkedIn provider ID of the recipient'),
      message: z.string().describe('Message content'),
    },
    async ({ profile_id, message }) => {
      try {
        const accountId = await getLinkedInAccountId(agent.orgId);
        if (!accountId) return { content: [{ type: 'text' as const, text: 'No LinkedIn account connected.' }] };
        const data = await unipileFetch('/api/v1/chats', 'POST', {
          account_id: accountId, attendees_ids: [profile_id], text: message,
        });
        return { content: [{ type: 'text' as const, text: `✅ Message sent to ${profile_id}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `LinkedIn error: ${e.message}` }] };
      }
    },
  );

  const getChats = tool(
    'linkedin_get_chats',
    'List recent LinkedIn conversations. Returns chat ID, participant names, last message preview.',
    {
      limit: z.number().optional().describe('Max chats (default 10)'),
    },
    async ({ limit }) => {
      try {
        const accountId = await getLinkedInAccountId(agent.orgId);
        if (!accountId) return { content: [{ type: 'text' as const, text: 'No LinkedIn account connected.' }] };
        const data = await unipileFetch(`/api/v1/chats?account_id=${accountId}&limit=${limit || 10}`);
        const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
        if (items.length === 0) return { content: [{ type: 'text' as const, text: 'No chats found.' }] };
        const lines = items.map((c: any, i: number) => {
          const name = c.attendees?.map((a: any) => a.display_name).join(', ') || 'Unknown';
          return `${i + 1}. ${name}\n   Last: ${(c.last_message?.text || '').substring(0, 100)}`;
        }).join('\n');
        return { content: [{ type: 'text' as const, text: `Recent chats:\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `LinkedIn error: ${e.message}` }] };
      }
    },
  );

  const searchProfile = tool(
    'linkedin_search_profile',
    'Search LinkedIn for profiles by name, company, or keywords.',
    {
      query: z.string().describe('Search query (name, company, title)'),
      limit: z.number().optional().describe('Max results (default 5)'),
    },
    async ({ query, limit }) => {
      try {
        const accountId = await getLinkedInAccountId(agent.orgId);
        if (!accountId) return { content: [{ type: 'text' as const, text: 'No LinkedIn account connected.' }] };
        const data = await unipileFetch(`/api/v1/users/search?account_id=${accountId}&query=${encodeURIComponent(query)}&limit=${limit || 5}`);
        const items = Array.isArray(data?.items) ? data.items : [];
        if (items.length === 0) return { content: [{ type: 'text' as const, text: `No profiles found for "${query}"` }] };
        const lines = items.map((p: any, i: number) => {
          return `${i + 1}. ${p.first_name} ${p.last_name} — ${p.headline || ''}\n   🏢 ${p.company || ''} | 🔗 ${p.profile_url || p.provider_id || ''}`;
        }).join('\n');
        return { content: [{ type: 'text' as const, text: `Profiles for "${query}":\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `LinkedIn error: ${e.message}` }] };
      }
    },
  );

  return [viewProfile, sendConnection, sendMessage, getChats, searchProfile];
}
