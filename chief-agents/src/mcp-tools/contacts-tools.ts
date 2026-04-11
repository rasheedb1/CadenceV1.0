/**
 * Google Contacts tools — search and list contacts.
 * Requires 'contacts' capability. Uses same Google OAuth token.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';
import { getFreshGoogleToken } from '../utils/google-auth.js';

const PEOPLE_BASE = 'https://people.googleapis.com/v1';

export function buildContactsTools(agent: AgentConfig): any[] {
  async function ensureToken(): Promise<{ token: string } | { error: string }> {
    const t = await getFreshGoogleToken(agent.orgId);
    if (!t) return { error: 'Google not connected. Ask user to reconnect Gmail.' };
    return { token: t.accessToken };
  }

  const searchContacts = tool(
    'contacts_search',
    'Search Google Contacts by name, email, or company. Returns name, email, phone, company.',
    {
      query: z.string().describe('Search query (name, email, or company)'),
      limit: z.number().optional().describe('Max results (default 10)'),
    },
    async ({ query, limit }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const lim = Math.min(limit || 10, 30);
        const url = `${PEOPLE_BASE}/people:searchContacts?query=${encodeURIComponent(query)}&readMask=names,emailAddresses,phoneNumbers,organizations&pageSize=${lim}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${t.token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Search failed');
        const results = data.results || [];
        if (results.length === 0) return { content: [{ type: 'text' as const, text: `No contacts found for "${query}"` }] };
        const lines = results.map((r: any, i: number) => {
          const p = r.person || {};
          const name = p.names?.[0]?.displayName || '?';
          const email = p.emailAddresses?.[0]?.value || '';
          const phone = p.phoneNumbers?.[0]?.value || '';
          const org = p.organizations?.[0]?.name || '';
          const title = p.organizations?.[0]?.title || '';
          return `${i + 1}. ${name}${org ? ` — ${title ? title + ' @ ' : ''}${org}` : ''}\n   📧 ${email || 'N/A'} | 📱 ${phone || 'N/A'}`;
        }).join('\n');
        return { content: [{ type: 'text' as const, text: `Contacts for "${query}":\n\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Contacts error: ${e.message}` }] };
      }
    },
  );

  const listContacts = tool(
    'contacts_list',
    'List Google Contacts (most recently updated first). Good for getting a contact list overview.',
    {
      limit: z.number().optional().describe('Max contacts (default 20)'),
    },
    async ({ limit }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const lim = Math.min(limit || 20, 50);
        const url = `${PEOPLE_BASE}/people/me/connections?personFields=names,emailAddresses,phoneNumbers,organizations&pageSize=${lim}&sortOrder=LAST_MODIFIED_DESCENDING`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${t.token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'List failed');
        const connections = data.connections || [];
        if (connections.length === 0) return { content: [{ type: 'text' as const, text: 'No contacts found.' }] };
        const lines = connections.map((p: any, i: number) => {
          const name = p.names?.[0]?.displayName || '?';
          const email = p.emailAddresses?.[0]?.value || '';
          const org = p.organizations?.[0]?.name || '';
          return `${i + 1}. ${name}${org ? ` (${org})` : ''} — ${email || 'N/A'}`;
        }).join('\n');
        return { content: [{ type: 'text' as const, text: `Contacts (${connections.length}):\n\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Contacts error: ${e.message}` }] };
      }
    },
  );

  return [searchContacts, listContacts];
}
