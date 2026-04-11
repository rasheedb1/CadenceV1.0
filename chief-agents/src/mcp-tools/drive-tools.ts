/**
 * Google Drive tools — read, search, create files.
 * Requires 'drive' capability. Uses same Google OAuth token as inbox/calendar.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';
import { getFreshGoogleToken } from '../utils/google-auth.js';

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';

async function driveFetch(path: string, token: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${DRIVE_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${data?.error?.message || JSON.stringify(data).substring(0, 200)}`);
  return data;
}

export function buildDriveTools(agent: AgentConfig): any[] {
  async function ensureToken(): Promise<{ token: string } | { error: string }> {
    const t = await getFreshGoogleToken(agent.orgId);
    if (!t) return { error: 'Google not connected. Ask user to reconnect Gmail (includes Drive scope).' };
    return { token: t.accessToken };
  }

  const searchFiles = tool(
    'drive_search_files',
    'Search Google Drive for files and folders. Returns name, type, last modified, link. Use Gmail-like query syntax.',
    {
      query: z.string().describe('Search query (e.g. "quarterly report", "type:spreadsheet budget", "name contains \'invoice\'")'),
      limit: z.number().optional().describe('Max results (default 10, max 30)'),
    },
    async ({ query, limit }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const q = encodeURIComponent(query.includes(':') ? query : `fullText contains '${query}' or name contains '${query}'`);
        const lim = Math.min(limit || 10, 30);
        const data = await driveFetch(`/files?q=${q}&pageSize=${lim}&fields=files(id,name,mimeType,modifiedTime,webViewLink,size,owners)&orderBy=modifiedTime desc`, t.token);
        const files = data.files || [];
        if (files.length === 0) return { content: [{ type: 'text' as const, text: `No files found for "${query}"` }] };
        const lines = files.map((f: any, i: number) => {
          const type = f.mimeType?.includes('folder') ? '📁' : f.mimeType?.includes('spreadsheet') ? '📊' : f.mimeType?.includes('document') ? '📄' : f.mimeType?.includes('presentation') ? '📑' : '📎';
          const size = f.size ? `${Math.ceil(f.size / 1024)}KB` : '';
          return `${i + 1}. ${type} ${f.name} ${size}\n   Modified: ${f.modifiedTime || '?'}\n   🔗 ${f.webViewLink || f.id}`;
        }).join('\n');
        return { content: [{ type: 'text' as const, text: `Found ${files.length} files:\n\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Drive error: ${e.message}` }] };
      }
    },
  );

  const readFile = tool(
    'drive_read_file',
    'Read the text content of a Google Drive file (Docs, Sheets, or plain text). For Docs, exports as plain text. For Sheets, exports as CSV.',
    {
      file_id: z.string().describe('Google Drive file ID (from drive_search_files)'),
      format: z.string().optional().describe('Export format: "text" (default for Docs), "csv" (for Sheets), "html"'),
    },
    async ({ file_id, format }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        // First get file metadata to determine type
        const meta = await driveFetch(`/files/${file_id}?fields=mimeType,name`, t.token);
        let exportMime = 'text/plain';
        if (meta.mimeType?.includes('spreadsheet') || format === 'csv') exportMime = 'text/csv';
        else if (format === 'html') exportMime = 'text/html';

        const url = meta.mimeType?.startsWith('application/vnd.google-apps')
          ? `${DRIVE_BASE}/files/${file_id}/export?mimeType=${encodeURIComponent(exportMime)}`
          : `${DRIVE_BASE}/files/${file_id}?alt=media`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${t.token}` } });
        const text = await res.text();
        if (!res.ok) throw new Error(`Export failed: ${text.substring(0, 200)}`);
        return { content: [{ type: 'text' as const, text: `📄 ${meta.name}\n\n${text.substring(0, 10000)}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Drive error: ${e.message}` }] };
      }
    },
  );

  const listRecentFiles = tool(
    'drive_list_recent',
    'List recently modified files in Google Drive. Good for daily briefings or finding what the user worked on recently.',
    {
      limit: z.number().optional().describe('Max files (default 10)'),
      type: z.string().optional().describe('Filter by type: "document", "spreadsheet", "presentation", "folder", or "all" (default)'),
    },
    async ({ limit, type }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        let q = 'trashed = false';
        if (type && type !== 'all') {
          const mimeMap: Record<string, string> = {
            document: 'application/vnd.google-apps.document',
            spreadsheet: 'application/vnd.google-apps.spreadsheet',
            presentation: 'application/vnd.google-apps.presentation',
            folder: 'application/vnd.google-apps.folder',
          };
          if (mimeMap[type]) q += ` and mimeType = '${mimeMap[type]}'`;
        }
        const lim = Math.min(limit || 10, 30);
        const data = await driveFetch(`/files?q=${encodeURIComponent(q)}&pageSize=${lim}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&orderBy=modifiedTime desc`, t.token);
        const files = data.files || [];
        if (files.length === 0) return { content: [{ type: 'text' as const, text: 'No recent files.' }] };
        const lines = files.map((f: any, i: number) => {
          const type = f.mimeType?.includes('folder') ? '📁' : f.mimeType?.includes('spreadsheet') ? '📊' : f.mimeType?.includes('document') ? '📄' : '📎';
          return `${i + 1}. ${type} ${f.name} — ${f.modifiedTime?.substring(0, 10) || '?'}\n   🔗 ${f.webViewLink || ''}`;
        }).join('\n');
        return { content: [{ type: 'text' as const, text: `Recent files:\n\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Drive error: ${e.message}` }] };
      }
    },
  );

  const createDoc = tool(
    'drive_create_document',
    'Create a new Google Doc with the given title and content. Returns the document link.',
    {
      title: z.string().describe('Document title'),
      content: z.string().describe('Document content (plain text — will be inserted into the Doc)'),
    },
    async ({ title, content }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        // Create empty doc
        const doc = await driveFetch('/files', t.token, {
          method: 'POST',
          body: JSON.stringify({ name: title, mimeType: 'application/vnd.google-apps.document' }),
        });
        // Insert content via Docs API
        await fetch(`https://docs.googleapis.com/v1/documents/${doc.id}:batchUpdate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{ insertText: { location: { index: 1 }, text: content } }],
          }),
        });
        return { content: [{ type: 'text' as const, text: `✅ Doc created: ${title}\n🔗 https://docs.google.com/document/d/${doc.id}/edit` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Drive error: ${e.message}` }] };
      }
    },
  );

  return [searchFiles, readFile, listRecentFiles, createDoc];
}
