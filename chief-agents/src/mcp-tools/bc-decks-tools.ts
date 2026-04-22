/**
 * Business Case Decks tools — generate shareable Yuno BC decks.
 * Requires 'bc_decks' capability. Calls the presentation-create edge function
 * on Supabase, which researches the client's payment stack via Firecrawl,
 * persists the row in `presentations`, and returns a public URL at
 * chief.yuno.tools/bc/<slug> valid for 90 days.
 *
 * Distinct from `business_cases` capability (legacy PPTX generator).
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://arupeqczrxmfkcbjwyad.supabase.co';
const PRESENTATION_CREATE_URL = `${SUPABASE_URL}/functions/v1/presentation-create`;

const pricingTierSchema = z.object({
  upToTx: z.number().nullable().describe('Upper tx bound of this tier; null = uncapped (final tier)'),
  ratePerTx: z.number().describe('USD per transaction in this tier'),
});

export function buildBcDecksTools(agent: AgentConfig): any[] {
  const createBcDeck = tool(
    'create_bc_deck',
    `Generate a Yuno Business Case deck for a specific client and return a public URL valid for 90 days.

The deck is a 24-slide presentation covering the problem, Yuno's platform, 4 value levers (approvals, MDR, APMs, ops), pricing, and implementation plan — all personalized with the client's numbers.

IMPORTANT UX: before calling this tool, send the user ONE message with ALL required fields to fill in (use the template in SKILL.md). Wait for their full reply, parse the values, then invoke.

Auto-research: if \`todayProviders\` is empty, the endpoint uses Firecrawl to find the client's current PSPs/acquirers from public sources.

Returns a URL like https://chief.yuno.tools/bc/<client>-<hash6> that anyone can open without auth.`,
    {
      orgId: z.string().describe("The org_id this deck belongs to (from the user's active org)"),
      clientName: z.string().describe('Client company name, preserving casing (e.g., "Rappi", "Acme Global", "ikea")'),
      date: z.string().describe('Quote date or quarter (e.g., "Q2 2026", "Jan 2026")'),

      // Client profile
      tpv: z.number().describe('Annual TPV in USD (e.g., 2400000000 for $2.4B)'),
      avgTicket: z.number().describe('Average transaction size in USD'),
      currentApproval: z.number().min(0).max(100).describe('Current approval rate as % (e.g., 82.4)'),
      currentMDR: z.number().min(0).max(10).describe('Current blended MDR as % (e.g., 2.45)'),
      activeMarkets: z.number().int().describe('Number of markets the client operates in today'),
      currentAPMs: z.number().int().describe('Number of payment methods enabled today'),
      currentProviders: z.number().int().describe('Number of PSPs/acquirers integrated today'),
      grossMargin: z.number().min(0).max(100).describe('Gross margin as % (e.g., 4)'),
      fteToday: z.number().describe('Current payments ops FTE count'),
      todayProviders: z.array(z.string()).optional().describe('Current PSPs/acquirers (e.g., ["stripe","dlocal"]). If empty, the endpoint researches via Firecrawl.'),

      // Pricing (Yuno commercial terms — always ask the user)
      pricingModel: z.enum(['flat', 'tiered']).describe('Yuno pricing model'),
      ratePerTx: z.number().optional().describe('USD per tx (required when pricingModel=flat)'),
      rateTiers: z.array(pricingTierSchema).optional().describe('Per-tier rates (required when pricingModel=tiered)'),
      minTxAnnual: z.number().describe('Minimum annual transactions committed'),
      monthlySaaS: z.number().describe('Monthly SaaS fee in USD'),

      // Lever knobs (defaults are Yuno benchmarks)
      approvalLiftPp: z.number().optional().describe('Approval rate lift in pp (default 7.4)'),
      mdrReductionBps: z.number().optional().describe('MDR reduction in bps (default 38)'),
      apmUpliftPct: z.number().optional().describe('APM TPV uplift as % (default 6)'),
      newAPMsAdded: z.number().optional().describe('New APMs activated (default 180)'),
      fteTarget: z.number().optional().describe('Post-Yuno FTE target (default 0.5)'),
      opsSavings: z.number().optional().describe('Annual ops savings (default 2100000)'),
      conservativeMult: z.number().optional().describe('Conservative scenario multiplier (default 0.6)'),
      optimisticMult: z.number().optional().describe('Optimistic scenario multiplier (default 1.4)'),
      npvMultiplier: z.number().optional().describe('3yr NPV multiplier (default 2.6)'),

      // Regeneration
      regenerateFrom: z.string().optional().describe('Slug of an existing deck to regenerate from. Parent defaults are copied; only the fields you pass override.'),
    },
    async (params) => {
      const agentToken = process.env.PRESENTATIONS_AGENT_TOKEN;
      if (!agentToken) {
        return {
          content: [{ type: 'text' as const, text: 'create_bc_deck error: PRESENTATIONS_AGENT_TOKEN env var not set in this environment.' }],
        };
      }

      try {
        const res = await fetch(PRESENTATION_CREATE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Agent-Token': agentToken,
            'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''}`,
          },
          body: JSON.stringify(params),
        });
        const txt = await res.text();
        let data: any = {};
        try { data = JSON.parse(txt); } catch { data = { error: txt.slice(0, 300) }; }

        if (!res.ok) {
          return {
            content: [{
              type: 'text' as const,
              text: `create_bc_deck error (${res.status}): ${data.error || 'unknown'}`,
            }],
          };
        }

        const providers = (data.providers || []).slice(0, 8).join(', ') || '(none found)';
        const expires = data.expiresAt ? new Date(data.expiresAt).toLocaleDateString('es', { dateStyle: 'medium' }) : 'unknown';

        return {
          content: [{
            type: 'text' as const,
            text: [
              `Deck generado para ${params.clientName}:`,
              `→ ${data.url}`,
              '',
              `Providers encontrados: ${providers}`,
              `Válido hasta: ${expires}`,
              data.regeneratedFrom ? `Regenerado de: ${data.regeneratedFrom}` : '',
            ].filter(Boolean).join('\n'),
          }],
        };
      } catch (e: any) {
        return {
          content: [{ type: 'text' as const, text: `create_bc_deck error: ${e.message}` }],
        };
      }
    },
  );

  return [createBcDeck];
}
