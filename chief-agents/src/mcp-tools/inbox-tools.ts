/**
 * Inbox tools — Gmail API direct (no Unipile).
 * Exposed only to agents with the 'inbox' capability (e.g. Paula).
 *
 * Uses the shared agent_integrations table via getFreshGoogleToken().
 * Read + safe write (draft only, no send without explicit approval).
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';
import { getFreshGoogleToken } from '../utils/google-auth.js';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function gmailFetch(path: string, token: string, init?: RequestInit): Promise<any> {
  const url = `${GMAIL_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (!res.ok) throw new Error(`Gmail API ${res.status}: ${data?.error?.message || text.substring(0, 200)}`);
    return data;
  } catch (e: any) {
    if (!res.ok) throw new Error(`Gmail API ${res.status}: ${text.substring(0, 200)}`);
    throw e;
  }
}

/**
 * Parse a Gmail message into a compact form.
 * Gmail returns messages with base64url-encoded bodies, multipart structures, etc.
 */
function parseGmailMessage(msg: any): {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  unread: boolean;
  labels: string[];
} {
  const headers = (msg.payload?.headers || []) as Array<{ name: string; value: string }>;
  const h = (name: string) => headers.find(x => x.name.toLowerCase() === name.toLowerCase())?.value || '';

  // Extract body: prefer text/plain, fall back to text/html (stripped)
  function extractBody(part: any): string {
    if (!part) return '';
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64url').toString('utf8');
    }
    if (part.mimeType === 'text/html' && part.body?.data) {
      const html = Buffer.from(part.body.data, 'base64url').toString('utf8');
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    if (Array.isArray(part.parts)) {
      // Prefer plain over html
      const plain = part.parts.find((p: any) => p.mimeType === 'text/plain');
      if (plain) return extractBody(plain);
      const html = part.parts.find((p: any) => p.mimeType === 'text/html');
      if (html) return extractBody(html);
      for (const sub of part.parts) {
        const b = extractBody(sub);
        if (b) return b;
      }
    }
    return '';
  }

  return {
    id: msg.id,
    threadId: msg.threadId,
    from: h('From'),
    to: h('To'),
    subject: h('Subject') || '(no subject)',
    date: h('Date'),
    snippet: msg.snippet || '',
    body: extractBody(msg.payload).substring(0, 8000),
    unread: Array.isArray(msg.labelIds) && msg.labelIds.includes('UNREAD'),
    labels: msg.labelIds || [],
  };
}

export function buildInboxTools(agent: AgentConfig) {
  const hasInbox = Array.isArray(agent.capabilities) && agent.capabilities.includes('inbox');
  if (!hasInbox) return [];

  async function ensureToken(): Promise<{ token: string } | { error: string }> {
    const t = await getFreshGoogleToken(agent.orgId);
    if (!t) return { error: 'Gmail not connected. Ask the user to connect their Gmail using the dashboard or the `conectar_gmail` tool via Chief.' };
    return { token: t.accessToken };
  }

  const listUnreadEmails = tool(
    'list_unread_emails',
    'List the user unread emails via Gmail API. Returns compact array with id, from, subject, date, snippet, labels. Use this for triage. Supports optional Gmail query syntax (ex: "from:jefe@empresa.com after:2026/04/01").',
    {
      query: z.string().optional().describe('Gmail search query. Default: "is:unread in:inbox". Examples: "from:X is:unread", "after:2026/04/01 has:attachment"'),
      limit: z.number().optional().describe('Max results (default 20, max 50)'),
    },
    async ({ query, limit }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      const q = encodeURIComponent(query || 'is:unread in:inbox');
      const lim = Math.min(limit || 20, 50);
      try {
        const list = await gmailFetch(`/messages?q=${q}&maxResults=${lim}`, t.token);
        const ids = (list.messages || []).map((m: any) => m.id);
        if (ids.length === 0) return { content: [{ type: 'text' as const, text: 'No emails match.' }] };
        // Batch fetch messages with metadata
        const msgs = await Promise.all(
          ids.map((id: string) => gmailFetch(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=To`, t.token).catch(() => null)),
        );
        const parsed = msgs.filter(Boolean).map(parseGmailMessage);
        const lines = parsed.map((m, i) => {
          const unread = m.unread ? '•' : ' ';
          return `${unread} ${i + 1}. [${m.id}] ${m.from}\n     "${m.subject}" — ${m.date}\n     ${m.snippet.substring(0, 140)}`;
        }).join('\n');
        return { content: [{ type: 'text' as const, text: `Found ${parsed.length} emails:\n\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Gmail error: ${e.message}` }] };
      }
    },
  );

  const readEmail = tool(
    'read_email',
    'Read the full content of a specific email by id (from list_unread_emails or search_emails). Returns headers + full body + attachments metadata.',
    {
      email_id: z.string().describe('Gmail message id'),
    },
    async ({ email_id }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const msg = await gmailFetch(`/messages/${email_id}?format=full`, t.token);
        const m = parseGmailMessage(msg);
        const atts: string[] = [];
        function collectAtts(part: any) {
          if (!part) return;
          if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
            atts.push(`- ${part.filename} (${part.body.size || '?'} bytes, id: ${part.body.attachmentId})`);
          }
          if (Array.isArray(part.parts)) part.parts.forEach(collectAtts);
        }
        collectAtts(msg.payload);
        const text = `From: ${m.from}\nTo: ${m.to}\nSubject: ${m.subject}\nDate: ${m.date}\nLabels: ${m.labels.join(', ')}\n\n${m.body}${atts.length ? `\n\nAttachments:\n${atts.join('\n')}` : ''}`;
        return { content: [{ type: 'text' as const, text }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Gmail error: ${e.message}` }] };
      }
    },
  );

  const searchEmails = tool(
    'search_emails',
    'Search emails using Gmail query syntax. Full power: "from:X", "to:Y", "subject:Z", "has:attachment", "label:important", "after:2026/01/01", "is:unread", "is:starred", boolean operators (AND, OR, -).',
    {
      query: z.string().describe('Gmail search query (same syntax as Gmail web UI)'),
      limit: z.number().optional().describe('Max results (default 20, max 50)'),
    },
    async ({ query, limit }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      const lim = Math.min(limit || 20, 50);
      try {
        const list = await gmailFetch(`/messages?q=${encodeURIComponent(query)}&maxResults=${lim}`, t.token);
        const ids = (list.messages || []).map((m: any) => m.id);
        if (ids.length === 0) return { content: [{ type: 'text' as const, text: `No matches for: ${query}` }] };
        const msgs = await Promise.all(
          ids.map((id: string) => gmailFetch(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, t.token).catch(() => null)),
        );
        const parsed = msgs.filter(Boolean).map(parseGmailMessage);
        const lines = parsed.map((m, i) => `${i + 1}. [${m.id}] ${m.from} — "${m.subject}" (${m.date})\n   ${m.snippet.substring(0, 140)}`).join('\n');
        return { content: [{ type: 'text' as const, text: `Matches for "${query}" (${parsed.length}):\n\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Gmail error: ${e.message}` }] };
      }
    },
  );

  const summarizeInbox = tool(
    'summarize_inbox',
    'Fetch recent emails (unread by default) in a compact structured form ready for you to summarize. Use when the user asks for "resumen de correos" or "digest".',
    {
      hours: z.number().optional().describe('Only emails from last N hours (default 24)'),
      limit: z.number().optional().describe('Max emails (default 30, max 50)'),
      include_read: z.boolean().optional().describe('Include read emails too (default false)'),
    },
    async ({ hours, limit, include_read }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      const lim = Math.min(limit || 30, 50);
      const hrs = hours || 24;
      const afterDate = new Date(Date.now() - hrs * 60 * 60 * 1000);
      const afterStr = `${afterDate.getFullYear()}/${String(afterDate.getMonth() + 1).padStart(2, '0')}/${String(afterDate.getDate()).padStart(2, '0')}`;
      const q = `${include_read ? '' : 'is:unread '}in:inbox after:${afterStr}`;
      try {
        const list = await gmailFetch(`/messages?q=${encodeURIComponent(q)}&maxResults=${lim}`, t.token);
        const ids = (list.messages || []).map((m: any) => m.id);
        if (ids.length === 0) return { content: [{ type: 'text' as const, text: `No emails in the last ${hrs} hours.` }] };
        const msgs = await Promise.all(
          ids.map((id: string) => gmailFetch(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=To`, t.token).catch(() => null)),
        );
        const parsed = msgs.filter(Boolean).map((m: any, i: number) => {
          const p = parseGmailMessage(m);
          return {
            n: i + 1,
            id: p.id,
            from: p.from,
            subject: p.subject,
            date: p.date,
            unread: p.unread,
            labels: p.labels.filter(l => !l.startsWith('CATEGORY_')),
            snippet: p.snippet.substring(0, 240),
          };
        });
        return { content: [{ type: 'text' as const, text: `Inbox batch (last ${hrs}h, ${parsed.length} items):\n\n${JSON.stringify(parsed, null, 2)}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Gmail error: ${e.message}` }] };
      }
    },
  );

  const markAsRead = tool(
    'mark_as_read',
    'Mark an email as read (removes UNREAD label). Use this after the user has confirmed they saw a specific email in the summary.',
    {
      email_id: z.string().describe('Gmail message id'),
    },
    async ({ email_id }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        await gmailFetch(`/messages/${email_id}/modify`, t.token, {
          method: 'POST',
          body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
        });
        return { content: [{ type: 'text' as const, text: `Marked as read: ${email_id}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Gmail error: ${e.message}` }] };
      }
    },
  );

  const archiveEmail = tool(
    'archive_email',
    'Archive an email (removes INBOX label). Use when the user confirms an email no longer needs attention.',
    {
      email_id: z.string().describe('Gmail message id'),
    },
    async ({ email_id }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        await gmailFetch(`/messages/${email_id}/modify`, t.token, {
          method: 'POST',
          body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
        });
        return { content: [{ type: 'text' as const, text: `Archived: ${email_id}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Gmail error: ${e.message}` }] };
      }
    },
  );

  const draftReply = tool(
    'draft_reply',
    'Create a DRAFT reply to an email. The draft is saved in Gmail but NOT sent. The user will review it and click send manually. Always use this instead of sending directly.',
    {
      email_id: z.string().describe('The email id you are replying to'),
      body: z.string().describe('The reply body (plain text)'),
    },
    async ({ email_id, body }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        // Fetch original to get thread + headers
        const orig = await gmailFetch(`/messages/${email_id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID`, t.token);
        const headers = orig.payload?.headers || [];
        const from = headers.find((h: any) => h.name === 'From')?.value || '';
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
        const msgId = headers.find((h: any) => h.name === 'Message-ID')?.value || '';
        const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
        // Extract email address from "Name <email@x.com>"
        const toMatch = from.match(/<([^>]+)>/) || [null, from];
        const to = toMatch[1];
        const raw = [
          `To: ${to}`,
          `Subject: ${replySubject}`,
          msgId ? `In-Reply-To: ${msgId}` : '',
          msgId ? `References: ${msgId}` : '',
          'Content-Type: text/plain; charset=UTF-8',
          '',
          body,
        ].filter(Boolean).join('\r\n');
        const rawB64 = Buffer.from(raw, 'utf8').toString('base64url');
        const created = await gmailFetch('/drafts', t.token, {
          method: 'POST',
          body: JSON.stringify({ message: { raw: rawB64, threadId: orig.threadId } }),
        });
        return { content: [{ type: 'text' as const, text: `✅ Draft created (id: ${created.id}). The user must review and send it manually from Gmail.` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Gmail error: ${e.message}` }] };
      }
    },
  );

  return [listUnreadEmails, readEmail, searchEmails, summarizeInbox, markAsRead, archiveEmail, draftReply];
}
