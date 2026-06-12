// chief-generate-bc-for-company
// =============================================================================
// Genera Business Case personalizado por empresa para Day 9 email.
// Llamado por workflow paralelo "BC Pre-gen" la noche del Day 7 de la cadencia.
//
// Flujo:
//   1. Load queue row (status='done', cadence_lead_ids[] no vacío)
//   2. Skip si bc_url ya existe (idempotente)
//   3. Llama presentation-create con clientName + defaults Yuno
//   4. Update queue.bc_url + queue.bc_generated_at
//   5. Update todos los cadence_leads de esa empresa: context_json.bc_url
//
// V1 limitación documentada: usa defaults financieros Yuno estándar (tpv=1B,
// avgTicket=50, currentApproval=85%, currentMDR=2.5%). Personalizar por empresa
// via company-research output queda como TODO de V2.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext, createSupabaseClient } from '../_shared/supabase.ts'

interface BcRequest {
  queue_id: string
  ownerId?: string
  orgId?: string
  /** Force re-generate even if bc_url exists */
  force?: boolean
  /** Override defaults for testing */
  overrides?: Record<string, unknown>
}

// Yuno BC standard defaults — V2 personalizar por company-research output
const YUNO_BC_DEFAULTS = {
  tpv: 1_000_000_000,        // 1B annual TPV
  avgTicket: 50,
  currentApproval: 85,        // 85% baseline
  currentMDR: 2.5,            // 2.5%
  grossMargin: 30,
  activeMarkets: 5,
  currentAPMs: 8,
  currentProviders: 3,
  fteToday: 4,
  fteTarget: 0.5,
  approvalLiftPp: 7.4,
  mdrReductionBps: 38,
  apmUpliftPct: 6,
  newAPMsAdded: 180,
  integrationReductionPct: 85,
  opsSavings: 2_100_000,
  locale: 'en' as const,      // PN3: inglés siempre
  currency: 'USD' as const,
  pricingModel: 'flat' as const,
  ratePerTx: 0.05,            // $0.05 per transaction
  conservativeMult: 0.5,
  optimisticMult: 1.5,
  npvMultiplier: 3,
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const body = (await req.json().catch(() => ({}))) as BcRequest

    const auth = await getAuthContext(authHeader, { ownerId: body.ownerId, orgId: body.orgId })
    if (!auth) return errorResponse('Unauthorized', 401)

    if (!body.queue_id) return errorResponse('queue_id is required')

    const supabase = createSupabaseClient(authHeader)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // ---------- 1. Load queue row + company ----------
    const { data: queueRow, error: qErr } = await supabase
      .from('icp_pipeline_queue')
      .select('id, org_id, company_id, status, bc_url, bc_generated_at, cadence_lead_ids')
      .eq('id', body.queue_id)
      .eq('org_id', auth.orgId)
      .single()

    if (qErr || !queueRow) return errorResponse(`Queue row ${body.queue_id} not found`, 404)
    if (queueRow.status !== 'done') {
      return errorResponse(`Queue row status='${queueRow.status}', BC only generates for status='done'`, 400)
    }
    if (!queueRow.cadence_lead_ids || queueRow.cadence_lead_ids.length === 0) {
      return errorResponse('No cadence_lead_ids for this queue row — nothing to update', 400)
    }

    // Idempotency: skip if BC already generated
    if (queueRow.bc_url && !body.force) {
      return jsonResponse({
        success: true,
        cached: true,
        bc_url: queueRow.bc_url,
        generated_at: queueRow.bc_generated_at,
        cadence_leads_updated: 0,
      })
    }

    const { data: company, error: cErr } = await supabase
      .from('account_map_companies')
      .select('id, company_name, website')
      .eq('id', queueRow.company_id)
      .single()
    if (cErr || !company) return errorResponse(`Company ${queueRow.company_id} not found`, 404)

    // ---------- 2. Build BC payload (defaults + overrides) ----------
    const overrides = body.overrides || {}
    const bcPayload = {
      clientName: company.company_name,
      clientWebsite: company.website || undefined,
      ...YUNO_BC_DEFAULTS,
      ...overrides,
      orgId: auth.orgId,
      ownerId: auth.userId,
    }

    // ---------- 3. Invoke presentation-create ----------
    console.log(`[${company.company_name}] generating BC...`)
    const startedAt = Date.now()

    const presResp = await fetch(`${supabaseUrl}/functions/v1/presentation-create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bcPayload),
    })

    if (!presResp.ok) {
      const errText = await presResp.text()
      return errorResponse(`presentation-create failed: ${presResp.status} ${errText.slice(0, 300)}`, 502)
    }

    const presJson = await presResp.json() as { url?: string; slug?: string; expiresAt?: string }
    if (!presJson.url) {
      return errorResponse('presentation-create returned no url', 502)
    }

    const elapsedMs = Date.now() - startedAt
    console.log(`[${company.company_name}] BC generated in ${elapsedMs}ms: ${presJson.url}`)

    // ---------- 4. Update queue row ----------
    await supabase
      .from('icp_pipeline_queue')
      .update({
        bc_url: presJson.url,
        bc_generated_at: new Date().toISOString(),
      })
      .eq('id', queueRow.id)

    // ---------- 5. Update cadence_leads.context_json.bc_url ----------
    // Each lead of this company gets the same bc_url cached for the Day 9 step.
    let cadenceLeadsUpdated = 0
    for (const cadenceLeadId of queueRow.cadence_lead_ids) {
      try {
        // Read existing context_json, merge, write back
        const { data: cl } = await supabase
          .from('cadence_leads')
          .select('id, context_json')
          .eq('id', cadenceLeadId)
          .maybeSingle()

        const existingCtx = (cl?.context_json as Record<string, unknown>) || {}
        const newCtx = {
          ...existingCtx,
          bc_url: presJson.url,
          bc_slug: presJson.slug,
          bc_generated_at: new Date().toISOString(),
        }

        const { error: updErr } = await supabase
          .from('cadence_leads')
          .update({ context_json: newCtx })
          .eq('id', cadenceLeadId)

        if (!updErr) cadenceLeadsUpdated++
      } catch (err) {
        console.warn(`Failed to update cadence_lead ${cadenceLeadId}:`, err)
      }
    }

    return jsonResponse({
      success: true,
      cached: false,
      company: company.company_name,
      bc_url: presJson.url,
      bc_slug: presJson.slug,
      elapsed_ms: elapsedMs,
      cadence_leads_total: queueRow.cadence_lead_ids.length,
      cadence_leads_updated: cadenceLeadsUpdated,
    })
  } catch (err) {
    console.error('chief-generate-bc-for-company error:', err)
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})
