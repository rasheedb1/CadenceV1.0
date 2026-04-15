/**
 * Gong tools — access call recordings, transcripts, and analytics.
 * Requires 'gong' capability. Auth: API key stored in agent_integrations.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';
import { sbGet } from '../supabase-client.js';

const GONG_BASE = 'https://us-11211.api.gong.io/v2';

async function getGongAuth(orgId: string): Promise<{ auth: string } | { error: string }> {
  const rows = await sbGet<Array<{ access_token: string; refresh_token: string; status: string }>>(
    `agent_integrations?org_id=eq.${orgId}&provider=eq.gong&status=eq.active&select=access_token,refresh_token&limit=1`,
  ).catch(() => []);
  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: 'Gong not connected. Ask the user to add their Gong API key in Settings > Integrations.' };
  }
  const key = rows[0].access_token;
  const secret = rows[0].refresh_token || '';
  return { auth: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` };
}

async function gongFetch(path: string, auth: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${GONG_BASE}${path}`, {
    ...init,
    headers: { Authorization: auth, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Gong API ${res.status}: ${JSON.stringify(data).substring(0, 200)}`);
  return data;
}

export function buildGongTools(agent: AgentConfig): any[] {
  const listCalls = tool(
    'gong_list_calls',
    'List recent Gong calls/meetings. Returns call ID, title, date, duration, participants. Use to find specific calls or get an overview of recent activity.',
    {
      from_date: z.string().optional().describe('Start date ISO 8601 (default: 7 days ago)'),
      to_date: z.string().optional().describe('End date ISO 8601 (default: now)'),
      limit: z.number().optional().describe('Max results (default 20)'),
    },
    async ({ from_date, to_date, limit }) => {
      const a = await getGongAuth(agent.orgId);
      if ('error' in a) return { content: [{ type: 'text' as const, text: a.error }] };
      try {
        const from = from_date || new Date(Date.now() - 7 * 86400000).toISOString();
        const to = to_date || new Date().toISOString();
        const data = await gongFetch('/calls/extensive', a.auth, {
          method: 'POST',
          body: JSON.stringify({
            filter: { fromDateTime: from, toDateTime: to },
            contentSelector: { exposedFields: { content: { structure: true } } },
            cursor: null,
          }),
        });
        const calls = (data.calls || []).slice(0, limit || 20);
        if (calls.length === 0) return { content: [{ type: 'text' as const, text: 'No calls found in this period.' }] };
        const lines = calls.map((c: any, i: number) => {
          const dur = c.metaData?.duration ? `${Math.round(c.metaData.duration / 60)}min` : '?';
          const parties = (c.parties || []).map((p: any) => p.name || p.emailAddress).join(', ');
          return `${i + 1}. [${c.metaData?.id}] ${c.metaData?.title || 'Untitled'}\n   ${c.metaData?.started || '?'} · ${dur}\n   👥 ${parties}`;
        }).join('\n');
        return { content: [{ type: 'text' as const, text: `Gong calls (${calls.length}):\n\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Gong error: ${e.message}` }] };
      }
    },
  );

  const getTranscript = tool(
    'gong_get_transcript',
    'Get the full transcript of a specific Gong call. Returns speaker-tagged conversation text.',
    {
      call_id: z.string().describe('Gong call ID (from gong_list_calls)'),
    },
    async ({ call_id }) => {
      const a = await getGongAuth(agent.orgId);
      if ('error' in a) return { content: [{ type: 'text' as const, text: a.error }] };
      try {
        const data = await gongFetch('/calls/transcript', a.auth, {
          method: 'POST',
          body: JSON.stringify({ filter: { callIds: [call_id] } }),
        });
        const transcripts = data.callTranscripts || [];
        if (transcripts.length === 0) return { content: [{ type: 'text' as const, text: 'No transcript found for this call.' }] };
        const t = transcripts[0];
        const lines = (t.transcript || []).map((seg: any) => {
          const speaker = seg.speakerName || seg.speakerId || 'Unknown';
          const text = (seg.sentences || []).map((s: any) => s.text).join(' ');
          return `**${speaker}:** ${text}`;
        }).join('\n\n');
        return { content: [{ type: 'text' as const, text: `Transcript (call ${call_id}):\n\n${lines.substring(0, 10000)}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Gong error: ${e.message}` }] };
      }
    },
  );

  const getCallStats = tool(
    'gong_call_stats',
    'Get analytics/stats for a Gong call: talk ratio, topics discussed, action items, questions asked.',
    {
      call_id: z.string().describe('Gong call ID'),
    },
    async ({ call_id }) => {
      const a = await getGongAuth(agent.orgId);
      if ('error' in a) return { content: [{ type: 'text' as const, text: a.error }] };
      try {
        const data = await gongFetch('/calls/extensive', a.auth, {
          method: 'POST',
          body: JSON.stringify({
            filter: { callIds: [call_id] },
            contentSelector: {
              exposedFields: {
                content: { topics: true, trackers: true, pointsOfInterest: true },
                interaction: { interactionStats: true, questions: true },
              },
            },
          }),
        });
        const calls = data.calls || [];
        if (calls.length === 0) return { content: [{ type: 'text' as const, text: 'No data found.' }] };
        const c = calls[0];
        let text = `Call stats for ${c.metaData?.title || call_id}:\n\n`;
        if (c.interaction?.interactionStats) {
          const s = c.interaction.interactionStats;
          text += `Talk ratio: ${s.talkRatio || '?'}%\n`;
          text += `Longest monologue: ${s.longestMonologue || '?'}s\n`;
        }
        if (c.content?.topics?.length) {
          text += `\nTopics: ${c.content.topics.map((t: any) => t.name).join(', ')}\n`;
        }
        if (c.interaction?.questions?.length) {
          text += `\nQuestions (${c.interaction.questions.length}):\n`;
          c.interaction.questions.slice(0, 10).forEach((q: any, i: number) => {
            text += `${i + 1}. ${q.text} (by ${q.speakerName || '?'})\n`;
          });
        }
        return { content: [{ type: 'text' as const, text }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Gong error: ${e.message}` }] };
      }
    },
  );

  // === NEW: Search Calls by Deal/Account ===
  const searchByDeal = tool(
    'gong_search_calls_by_deal',
    'Find all Gong calls associated with a specific company, deal, or person. Use to prepare for meetings or review deal history.',
    {
      company_name: z.string().optional().describe('Company/account name to search'),
      person_name: z.string().optional().describe('Person name to search'),
      days_back: z.number().optional().describe('How many days back to search (default 90)'),
    },
    async ({ company_name, person_name, days_back }) => {
      const a = await getGongAuth(agent.orgId);
      if ('error' in a) return { content: [{ type: 'text' as const, text: a.error }] };
      try {
        const from = new Date(Date.now() - (days_back || 90) * 86400000).toISOString();
        const data = await gongFetch('/calls/extensive', a.auth, {
          method: 'POST',
          body: JSON.stringify({ filter: { fromDateTime: from, toDateTime: new Date().toISOString() } }),
        });
        const searchTerms = [company_name, person_name].filter(Boolean).map(s => s!.toLowerCase());
        const matched = (data.calls || []).filter((c: any) => {
          const parties = (c.parties || []).map((p: any) => `${p.name || ''} ${p.emailAddress || ''} ${p.company || ''}`).join(' ').toLowerCase();
          const title = (c.metaData?.title || '').toLowerCase();
          return searchTerms.some(term => parties.includes(term) || title.includes(term));
        }).slice(0, 15);
        if (matched.length === 0) return { content: [{ type: 'text' as const, text: `No calls found matching "${company_name || person_name}" in the last ${days_back || 90} days.` }] };
        const lines = matched.map((c: any, i: number) => {
          const dur = c.metaData?.duration ? `${Math.round(c.metaData.duration / 60)}min` : '?';
          const parties = (c.parties || []).map((p: any) => p.name || p.emailAddress).join(', ');
          return `${i + 1}. [${c.metaData?.id}] ${c.metaData?.title || 'Untitled'}\n   ${c.metaData?.started || '?'} · ${dur}\n   👥 ${parties}`;
        }).join('\n');
        return { content: [{ type: 'text' as const, text: `Calls matching "${company_name || person_name}" (${matched.length}):\n\n${lines}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Gong error: ${e.message}` }] };
      }
    },
  );

  // === NEW: Get Action Items from Call ===
  const getActionItems = tool(
    'gong_get_action_items',
    'Extract action items, next steps, and key decisions from a Gong call transcript. Uses the call transcript + stats to identify commitments.',
    {
      call_id: z.string().describe('Gong call ID'),
    },
    async ({ call_id }) => {
      const a = await getGongAuth(agent.orgId);
      if ('error' in a) return { content: [{ type: 'text' as const, text: a.error }] };
      try {
        // Get both stats (for points of interest) and transcript
        const [statsData, transData] = await Promise.all([
          gongFetch('/calls/extensive', a.auth, {
            method: 'POST',
            body: JSON.stringify({
              filter: { callIds: [call_id] },
              contentSelector: { exposedFields: { content: { topics: true, trackers: true, pointsOfInterest: true } } },
            }),
          }),
          gongFetch('/calls/transcript', a.auth, {
            method: 'POST',
            body: JSON.stringify({ filter: { callIds: [call_id] } }),
          }),
        ]);
        const call = statsData.calls?.[0];
        const transcript = transData.callTranscripts?.[0];

        let text = `Action items from: ${call?.metaData?.title || call_id}\n\n`;

        // Points of interest (Gong's auto-detected action items)
        const poi = call?.content?.pointsOfInterest || [];
        if (poi.length > 0) {
          text += '## Gong-detected highlights:\n';
          poi.forEach((p: any, i: number) => { text += `${i + 1}. ${p.snippet || p.text || JSON.stringify(p)}\n`; });
        }

        // Trackers (custom keywords/phrases)
        const trackers = call?.content?.trackers || [];
        if (trackers.length > 0) {
          text += '\n## Tracked phrases mentioned:\n';
          trackers.forEach((t: any) => { text += `• ${t.name}: ${t.count || 1}x\n`; });
        }

        // Topics
        const topics = call?.content?.topics || [];
        if (topics.length > 0) {
          text += `\n## Topics discussed: ${topics.map((t: any) => t.name).join(', ')}\n`;
        }

        // Provide transcript excerpt for LLM to analyze
        if (transcript?.transcript?.length) {
          const lastSegments = transcript.transcript.slice(-5);
          text += '\n## Call closing (last segments — check for commitments):\n';
          lastSegments.forEach((seg: any) => {
            const speaker = seg.speakerName || '?';
            const words = (seg.sentences || []).map((s: any) => s.text).join(' ');
            text += `**${speaker}:** ${words.substring(0, 300)}\n`;
          });
        }

        return { content: [{ type: 'text' as const, text: text.substring(0, 8000) }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Gong error: ${e.message}` }] };
      }
    },
  );

  return [listCalls, getTranscript, getCallStats, searchByDeal, getActionItems];
}
