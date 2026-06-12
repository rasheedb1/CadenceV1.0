/**
 * SimilarWeb tools — web traffic intelligence for client research.
 * Requires 'traffic_intelligence' capability.
 *
 * Proxies through the Supabase edge function `similarweb-traffic`, which
 * holds the API key and a 30-day cross-org cache. Agents never see the key
 * and don't make direct SimilarWeb calls — guarantees credit reuse across
 * Andrés, Enrique, and the cadence pipeline.
 *
 * No refresh-on-demand by design: silent auto-refresh at age >25 days is
 * handled by the edge function. Agents always get the freshest available
 * cache hit without burning credits per query.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';
import { pickUrl } from '../utils/env-url.js';

const SB_URL = pickUrl(process.env.SUPABASE_URL, 'https://arupeqczrxmfkcbjwyad.supabase.co');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.AUTH_TOKEN || '';

interface TrafficResponse {
  success?: boolean;
  error?: string;
  stale?: boolean;
  stale_reason?: string;
  domain?: string;
  cache_status?: 'hit' | 'miss' | 'silent_refresh';
  fetched_at?: string;
  monthly_visits?: {
    avg: number;
    latest: number;
    series: Array<{ month: string; visits: number }>;
    window: { start: string; end: string };
    last_updated: string;
  };
  top_countries?: Array<{
    name: string;
    share: number;
    visits: number;
    rank_in_country: number;
  }>;
  engagement?: {
    avg_visit_duration_sec: number | null;
    pages_per_visit: number | null;
    bounce_rate: number | null;
  };
}

function formatVisits(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function buildSimilarwebTools(_agent: AgentConfig): any[] {
  const getTraffic = tool(
    'similarweb_get_traffic',
    'Get web traffic intelligence for a company: monthly visits + top countries by traffic share + engagement metrics (bounce rate, pages/visit, avg duration). Pass either a domain (e.g. "rappi.com") or a full URL — both are normalized. Data is from SimilarWeb, cached 30 days. Use this BEFORE drafting outreach or business cases — never ask the user for traffic data you can fetch.',
    {
      domain: z.string().describe('Company domain or URL (e.g. "rappi.com", "https://www.rappi.com/about" — both work). Required.'),
    },
    async ({ domain }) => {
      try {
        const res = await fetch(`${SB_URL}/functions/v1/similarweb-traffic`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SB_KEY}`,
            'apikey': SB_KEY,
          },
          body: JSON.stringify({ domain }),
        });
        const data = await res.json() as TrafficResponse;

        if (!res.ok || data.error) {
          return { content: [{ type: 'text' as const, text: `SimilarWeb error: ${data.error || `HTTP ${res.status}`}` }] };
        }

        const mv = data.monthly_visits;
        const tc = data.top_countries || [];
        const eng = data.engagement;

        if (!mv || !tc.length) {
          return { content: [{ type: 'text' as const, text: `No SimilarWeb data available for ${data.domain || domain}. The site may be too small to track or the domain is incorrect.` }] };
        }

        const countriesText = tc.slice(0, 10).map((c, i) =>
          `  ${i + 1}. ${c.name}: ${(c.share * 100).toFixed(1)}% (${formatVisits(c.visits)} visits)`
        ).join('\n');

        const engText = eng && eng.bounce_rate !== null
          ? `\n📊 Engagement: ${(eng.bounce_rate! * 100).toFixed(0)}% bounce · ${eng.pages_per_visit} pages/visit · ${eng.avg_visit_duration_sec}s avg`
          : '';

        const staleNote = data.stale
          ? `\n⚠️ Note: serving cached data (fresh fetch failed: ${data.stale_reason || 'unknown'})`
          : '';

        const text = [
          `🌐 ${data.domain} — Web traffic intelligence`,
          ``,
          `📈 Monthly visits (avg ${mv.window.start}..${mv.window.end}): ${formatVisits(mv.avg)}`,
          `   Latest month: ${formatVisits(mv.latest)}`,
          ``,
          `🌍 Top countries by traffic share:`,
          countriesText,
          engText,
          ``,
          `Source: SimilarWeb (data updated ${mv.last_updated}, cache: ${data.cache_status})${staleNote}`,
        ].filter(Boolean).join('\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `SimilarWeb tool error: ${e.message}` }] };
      }
    },
  );

  return [getTraffic];
}
