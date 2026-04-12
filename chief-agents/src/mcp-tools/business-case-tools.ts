/**
 * Business Case tools — generate Yuno PPTX presentations.
 * Requires 'business_cases' capability. Calls bridge endpoint.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { AgentConfig } from '../types.js';

const BRIDGE_URL = process.env.BRIDGE_URL || process.env.BRIDGE_PUBLIC_URL || 'https://twilio-bridge-production-241b.up.railway.app';

export function buildBusinessCaseTools(_agent: AgentConfig): any[] {
  const generateBC = tool(
    'generate_business_case',
    `Generate a Yuno Business Case PPTX presentation for a client prospect.
Collects deal parameters and produces a branded 8-slide deck with:
- Cover with client name
- Solution overview
- Business case calculations (MDR savings + approval rate increase)
- Volume table by country
- Impact summary (Efecto Yuno)
- Economic impact metrics
- Commercial proposal (flat or tranches pricing)
- Closing CTA

Returns a download URL for the PPTX file.`,
    {
      clientName: z.string().describe('Client/prospect company name'),
      countries: z.array(z.object({
        country: z.string(),
        txnPerMonth: z.number(),
      })).describe('Countries where they operate with monthly transaction volume each'),
      ticketPromedio: z.number().describe('Average ticket in USD'),
      totalTxnMes: z.number().describe('Total transactions per month across all countries'),
      mdrActual: z.number().describe('Current MDR as decimal (e.g. 0.028 = 2.8%)'),
      mdrNuevo: z.number().describe('Proposed MDR with Yuno as decimal'),
      aprobacionActual: z.number().describe('Current approval rate as decimal (e.g. 0.85 = 85%)'),
      aprobacionNueva: z.number().describe('Estimated approval rate with Yuno'),
      margenProducto: z.number().optional().describe('Product margin as decimal (0 if not applicable)'),
      ahorroConciliacion: z.number().optional().describe('Monthly reconciliation savings in USD (default 5000)'),
      ahorroOperativo: z.number().optional().describe('Monthly operational savings in USD (default 5000)'),
      pricingType: z.enum(['flat', 'tranches']).describe('Pricing model: flat rate or volume tranches'),
      flatPrice: z.number().optional().describe('Flat price per approved transaction (if pricingType=flat)'),
      tranches: z.array(z.object({
        name: z.string(),
        range: z.string(),
        price: z.number(),
      })).optional().describe('Volume-based pricing tiers (if pricingType=tranches)'),
      minimoTransaccional: z.string().optional().describe('Minimum transactional commitment text'),
      saasFee: z.number().optional().describe('Monthly SaaS fee in USD (0 if none)'),
      propuestaValidaHasta: z.string().optional().describe('Proposal validity date'),
    },
    async (params) => {
      try {
        const res = await fetch(`${BRIDGE_URL}/api/generate-business-case`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          return { content: [{ type: 'text' as const, text: `Business case error: ${data.error || 'generation failed'}` }] };
        }
        const s = data.summary;
        return { content: [{ type: 'text' as const, text: `Business Case generated for ${s.clientName}:\n- TPV/mes: $${(s.totalTPVMensual/1e6).toFixed(1)}M\n- Ahorro MDR: $${(s.ahorroMDRMensual/1e3).toFixed(0)}K/mes\n- Revenue aumento: $${(s.aumentoRevenue/1e3).toFixed(0)}K/mes\n- Total impacto: $${(s.totalMensual/1e3).toFixed(0)}K/mes\n- Slides: ${s.slides}\n\nDownload: ${data.url}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text' as const, text: `Business case error: ${e.message}` }] };
      }
    },
  );

  return [generateBC];
}
