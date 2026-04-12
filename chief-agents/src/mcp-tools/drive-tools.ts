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

  // === NEW: Copy File ===
  const copyFile = tool(
    'drive_copy_file',
    'Copy a Google Drive file (Doc, Sheet, Slide, etc). Creates a duplicate with a new name. Use for templates.',
    {
      file_id: z.string().describe('File ID to copy'),
      new_name: z.string().describe('Name for the copy'),
      folder_id: z.string().optional().describe('Destination folder ID (optional)'),
    },
    async ({ file_id, new_name, folder_id }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const body: any = { name: new_name };
        if (folder_id) body.parents = [folder_id];
        const data = await driveFetch(`/files/${file_id}/copy`, t.token, { method: 'POST', body: JSON.stringify(body) });
        return { content: [{ type: 'text' as const, text: `✅ Copied to: ${new_name}\n🔗 https://drive.google.com/file/d/${data.id}/view` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Drive error: ${e.message}` }] };
      }
    },
  );

  // === NEW: Move/Rename File ===
  const moveFile = tool(
    'drive_move_rename',
    'Move a file to a different folder and/or rename it.',
    {
      file_id: z.string().describe('File ID'),
      new_name: z.string().optional().describe('New name (optional)'),
      destination_folder_id: z.string().optional().describe('Folder ID to move to (optional)'),
    },
    async ({ file_id, new_name, destination_folder_id }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        // Get current parents for move
        let addParents = '';
        let removeParents = '';
        if (destination_folder_id) {
          const meta = await driveFetch(`/files/${file_id}?fields=parents`, t.token);
          removeParents = (meta.parents || []).join(',');
          addParents = destination_folder_id;
        }
        const params = new URLSearchParams();
        if (addParents) params.set('addParents', addParents);
        if (removeParents) params.set('removeParents', removeParents);
        const body: any = {};
        if (new_name) body.name = new_name;
        const paramStr = params.toString() ? `?${params}` : '';
        await driveFetch(`/files/${file_id}${paramStr}`, t.token, { method: 'PATCH', body: JSON.stringify(body) });
        return { content: [{ type: 'text' as const, text: `✅ File updated${new_name ? ` → renamed to "${new_name}"` : ''}${destination_folder_id ? ' → moved to new folder' : ''}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Drive error: ${e.message}` }] };
      }
    },
  );

  // === NEW: Share File / Manage Permissions ===
  const shareFile = tool(
    'drive_share',
    'Share a Google Drive file with someone. Set role: reader, commenter, writer, or owner. Can also share with anyone via link.',
    {
      file_id: z.string().describe('File ID to share'),
      email: z.string().optional().describe('Email address to share with (for user/group sharing)'),
      role: z.enum(['reader', 'commenter', 'writer', 'owner']).describe('Permission level'),
      type: z.enum(['user', 'group', 'anyone']).optional().describe('"user" (default), "group", or "anyone" (link sharing)'),
      notify: z.boolean().optional().describe('Send email notification (default true)'),
    },
    async ({ file_id, email, role, type, notify }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const shareType = type || 'user';
        const body: any = { role, type: shareType };
        if (shareType !== 'anyone' && email) body.emailAddress = email;
        const sendNotification = notify !== false ? 'true' : 'false';
        const data = await driveFetch(`/files/${file_id}/permissions?sendNotificationEmail=${sendNotification}`, t.token, {
          method: 'POST', body: JSON.stringify(body),
        });
        if (shareType === 'anyone') {
          const fileData = await driveFetch(`/files/${file_id}?fields=webViewLink`, t.token);
          return { content: [{ type: 'text' as const, text: `✅ File shared with anyone (${role})\n🔗 ${fileData.webViewLink}` }] };
        }
        return { content: [{ type: 'text' as const, text: `✅ Shared with ${email} as ${role}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Drive share error: ${e.message}` }] };
      }
    },
  );

  // === NEW: Remove Permission ===
  const removePermission = tool(
    'drive_remove_permission',
    'Remove sharing permission from a file. First list permissions, then remove by permission ID.',
    {
      file_id: z.string().describe('File ID'),
      permission_id: z.string().optional().describe('Permission ID to remove (from drive_list_permissions)'),
      email: z.string().optional().describe('Email to remove (alternative to permission_id — will find and remove)'),
    },
    async ({ file_id, permission_id, email }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        let permId = permission_id;
        if (!permId && email) {
          const perms = await driveFetch(`/files/${file_id}/permissions?fields=permissions(id,emailAddress,role)`, t.token);
          const match = (perms.permissions || []).find((p: any) => p.emailAddress === email);
          if (!match) return { content: [{ type: 'text' as const, text: `No permission found for ${email}` }] };
          permId = match.id;
        }
        if (!permId) return { content: [{ type: 'text' as const, text: 'Provide permission_id or email to remove' }] };
        await fetch(`${DRIVE_BASE}/files/${file_id}/permissions/${permId}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${t.token}` },
        });
        return { content: [{ type: 'text' as const, text: `✅ Permission removed${email ? ` for ${email}` : ''}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Drive error: ${e.message}` }] };
      }
    },
  );

  // === NEW: List Permissions ===
  const listPermissions = tool(
    'drive_list_permissions',
    'List who has access to a file and their permission level.',
    {
      file_id: z.string().describe('File ID'),
    },
    async ({ file_id }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const data = await driveFetch(`/files/${file_id}/permissions?fields=permissions(id,emailAddress,role,type,displayName)`, t.token);
        const perms = data.permissions || [];
        if (perms.length === 0) return { content: [{ type: 'text' as const, text: 'No permissions found (private file).' }] };
        const lines = perms.map((p: any) => `• ${p.displayName || p.emailAddress || p.type} — ${p.role} (id: ${p.id})`).join('\n');
        return { content: [{ type: 'text' as const, text: `Permissions:\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Drive error: ${e.message}` }] };
      }
    },
  );

  // === NEW: Delete File ===
  const deleteFile = tool(
    'drive_delete',
    'Move a file to trash in Google Drive. Can be recovered from trash within 30 days.',
    {
      file_id: z.string().describe('File ID to delete'),
    },
    async ({ file_id }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        // Move to trash (recoverable) instead of permanent delete
        await driveFetch(`/files/${file_id}`, t.token, { method: 'PATCH', body: JSON.stringify({ trashed: true }) });
        return { content: [{ type: 'text' as const, text: '✅ File moved to trash (recoverable for 30 days).' }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Drive error: ${e.message}` }] };
      }
    },
  );

  // === NEW: Create Folder ===
  const createFolder = tool(
    'drive_create_folder',
    'Create a new folder in Google Drive.',
    {
      name: z.string().describe('Folder name'),
      parent_folder_id: z.string().optional().describe('Parent folder ID (optional — root if omitted)'),
    },
    async ({ name, parent_folder_id }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const body: any = { name, mimeType: 'application/vnd.google-apps.folder' };
        if (parent_folder_id) body.parents = [parent_folder_id];
        const data = await driveFetch('/files', t.token, { method: 'POST', body: JSON.stringify(body) });
        return { content: [{ type: 'text' as const, text: `✅ Folder created: ${name}\n📁 ID: ${data.id}\n🔗 https://drive.google.com/drive/folders/${data.id}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Drive error: ${e.message}` }] };
      }
    },
  );

  return [searchFiles, readFile, listRecentFiles, createDoc, copyFile, moveFile, shareFile, removePermission, listPermissions, deleteFile, createFolder];
}
