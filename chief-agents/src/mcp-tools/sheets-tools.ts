/**
 * Google Sheets tools — read, write, search spreadsheets.
 * Requires 'sheets' capability. Uses same Google OAuth token.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';
import { getFreshGoogleToken } from '../utils/google-auth.js';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export function buildSheetsTools(agent: AgentConfig): any[] {
  async function ensureToken(): Promise<{ token: string } | { error: string }> {
    const t = await getFreshGoogleToken(agent.orgId);
    if (!t) return { error: 'Google not connected. Ask user to reconnect Gmail.' };
    return { token: t.accessToken };
  }

  const readSheet = tool(
    'sheets_read',
    'Read data from a Google Sheets spreadsheet. Returns the cell values as a table.',
    {
      spreadsheet_id: z.string().describe('Spreadsheet ID (from the URL or drive_search_files)'),
      range: z.string().optional().describe('A1 notation range (e.g. "Sheet1!A1:D10", "A:Z"). Default: first sheet all data'),
    },
    async ({ spreadsheet_id, range }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const r = range ? encodeURIComponent(range) : '';
        const url = r
          ? `${SHEETS_BASE}/${spreadsheet_id}/values/${r}`
          : `${SHEETS_BASE}/${spreadsheet_id}/values/A1:ZZ1000`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${t.token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Failed to read sheet');
        const values = data.values || [];
        if (values.length === 0) return { content: [{ type: 'text' as const, text: 'Sheet is empty.' }] };
        // Format as simple table
        const header = values[0];
        const rows = values.slice(1);
        let table = header.join(' | ') + '\n' + header.map(() => '---').join(' | ') + '\n';
        table += rows.map((r: any[]) => r.join(' | ')).join('\n');
        return { content: [{ type: 'text' as const, text: `📊 ${data.range || range || 'Sheet'}:\n\n${table.substring(0, 8000)}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Sheets error: ${e.message}` }] };
      }
    },
  );

  const writeSheet = tool(
    'sheets_write',
    'Write data to a Google Sheets spreadsheet. Appends rows or updates a specific range.',
    {
      spreadsheet_id: z.string().describe('Spreadsheet ID'),
      range: z.string().describe('A1 notation range to write to (e.g. "Sheet1!A1")'),
      values: z.array(z.array(z.string())).describe('2D array of values (rows × columns)'),
      mode: z.string().optional().describe('"update" (default — overwrites range) or "append" (adds after last row)'),
    },
    async ({ spreadsheet_id, range, values, mode }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const isAppend = mode === 'append';
        const url = isAppend
          ? `${SHEETS_BASE}/${spreadsheet_id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
          : `${SHEETS_BASE}/${spreadsheet_id}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
        const res = await fetch(url, {
          method: isAppend ? 'POST' : 'PUT',
          headers: { Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Failed to write');
        const updated = data.updatedCells || data.updates?.updatedCells || values.flat().length;
        return { content: [{ type: 'text' as const, text: `✅ ${updated} cells ${isAppend ? 'appended' : 'updated'} in ${range}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Sheets error: ${e.message}` }] };
      }
    },
  );

  const createSheet = tool(
    'sheets_create',
    'Create a new Google Sheets spreadsheet with optional initial data.',
    {
      title: z.string().describe('Spreadsheet title'),
      headers: z.array(z.string()).optional().describe('Column headers for the first row'),
      initial_data: z.array(z.array(z.string())).optional().describe('Initial rows of data'),
    },
    async ({ title, headers, initial_data }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        // Create spreadsheet
        const res = await fetch(SHEETS_BASE, {
          method: 'POST',
          headers: { Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ properties: { title } }),
        });
        const ss = await res.json();
        if (!res.ok) throw new Error(ss?.error?.message || 'Failed to create');
        // Add headers + data if provided
        const rows: string[][] = [];
        if (headers?.length) rows.push(headers);
        if (initial_data?.length) rows.push(...initial_data);
        if (rows.length > 0) {
          await fetch(`${SHEETS_BASE}/${ss.spreadsheetId}/values/A1?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: rows }),
          });
        }
        return { content: [{ type: 'text' as const, text: `✅ Sheet created: ${title}\n🔗 ${ss.spreadsheetUrl}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Sheets error: ${e.message}` }] };
      }
    },
  );

  // === NEW: Clear Range ===
  const clearSheet = tool(
    'sheets_clear',
    'Clear data from a range in a spreadsheet (keeps formatting, removes values).',
    {
      spreadsheet_id: z.string().describe('Spreadsheet ID'),
      range: z.string().describe('A1 notation range to clear (e.g. "Sheet1!A2:Z100")'),
    },
    async ({ spreadsheet_id, range }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const res = await fetch(`${SHEETS_BASE}/${spreadsheet_id}/values/${encodeURIComponent(range)}:clear`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Failed to clear');
        return { content: [{ type: 'text' as const, text: `✅ Cleared ${data.clearedRange || range}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Sheets error: ${e.message}` }] };
      }
    },
  );

  // === NEW: List Sheets (tabs) in a spreadsheet ===
  const listSheetTabs = tool(
    'sheets_list_tabs',
    'List all sheet tabs in a spreadsheet with their names and IDs.',
    {
      spreadsheet_id: z.string().describe('Spreadsheet ID'),
    },
    async ({ spreadsheet_id }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const res = await fetch(`${SHEETS_BASE}/${spreadsheet_id}?fields=sheets.properties`, {
          headers: { Authorization: `Bearer ${t.token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Failed');
        const sheets = data.sheets || [];
        const lines = sheets.map((s: any, i: number) => {
          const p = s.properties;
          return `${i + 1}. "${p.title}" (ID: ${p.sheetId}, ${p.gridProperties?.rowCount || '?'} rows × ${p.gridProperties?.columnCount || '?'} cols)`;
        }).join('\n');
        return { content: [{ type: 'text' as const, text: `Sheet tabs:\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Sheets error: ${e.message}` }] };
      }
    },
  );

  // === NEW: Add/Delete Sheet Tab ===
  const manageTab = tool(
    'sheets_manage_tab',
    'Add or delete a sheet tab in a spreadsheet.',
    {
      spreadsheet_id: z.string().describe('Spreadsheet ID'),
      action: z.enum(['add', 'delete']).describe('"add" new tab or "delete" existing'),
      title: z.string().optional().describe('Tab title (required for add)'),
      sheet_id: z.number().optional().describe('Sheet tab ID (required for delete — get from sheets_list_tabs)'),
    },
    async ({ spreadsheet_id, action, title, sheet_id }) => {
      const t = await ensureToken();
      if ('error' in t) return { content: [{ type: 'text' as const, text: t.error }] };
      try {
        const requests: any[] = [];
        if (action === 'add') {
          requests.push({ addSheet: { properties: { title: title || 'New Sheet' } } });
        } else {
          if (sheet_id === undefined) return { content: [{ type: 'text' as const, text: 'sheet_id required for delete. Use sheets_list_tabs first.' }] };
          requests.push({ deleteSheet: { sheetId: sheet_id } });
        }
        const res = await fetch(`${SHEETS_BASE}/${spreadsheet_id}:batchUpdate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${t.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Failed');
        return { content: [{ type: 'text' as const, text: `✅ Tab ${action === 'add' ? `"${title}" added` : 'deleted'}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Sheets error: ${e.message}` }] };
      }
    },
  );

  return [readSheet, writeSheet, createSheet, clearSheet, listSheetTabs, manageTab];
}
