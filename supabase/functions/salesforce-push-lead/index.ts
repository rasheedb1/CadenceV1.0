/**
 * Edge Function: Push Lead(s) to Salesforce
 * POST /functions/v1/salesforce-push-lead
 *
 * Creates Lead records in Salesforce from enriched leads.
 * Supports single (leadId) or bulk (leadIds) mode.
 * Checks for duplicates by email before creating.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext, createSupabaseClient } from '../_shared/supabase.ts'
import { salesforceApiCall, salesforceQuery } from '../_shared/salesforce.ts'

interface LeadRecord {
  id: string
  first_name: string
  last_name: string
  email: string | null
  company: string | null
  phone: string | null
  title: string | null
  website: string | null
  industry: string | null
  salesforce_lead_id: string | null
}

interface PushResult {
  leadId: string
  leadName: string
  success: boolean
  salesforceLeadId?: string
  duplicate?: boolean
  error?: string
}

const DELAY_BETWEEN_LEADS_MS = 300

async function pushSingleLead(
  lead: LeadRecord,
  orgId: string,
  supabase: ReturnType<typeof createSupabaseClient>
): Promise<PushResult> {
  const name = `${lead.first_name} ${lead.last_name}`

  if (!lead.email) {
    return { leadId: lead.id, leadName: name, success: false, error: 'No email' }
  }

  if (lead.salesforce_lead_id) {
    return { leadId: lead.id, leadName: name, success: false, error: 'Already pushed' }
  }

  // Check for duplicates in Salesforce by email
  const escapedEmail = lead.email.replace(/'/g, "\\'")
  const duplicates = await salesforceQuery(
    orgId,
    `SELECT Id, Name FROM Lead WHERE Email = '${escapedEmail}' LIMIT 1`
  )

  if (duplicates.length > 0) {
    return {
      leadId: lead.id,
      leadName: name,
      success: false,
      duplicate: true,
      salesforceLeadId: duplicates[0].Id as string,
      error: `Duplicate in SF (${duplicates[0].Name})`,
    }
  }

  // Build the Salesforce Lead payload
  const sfLead: Record<string, string> = {
    FirstName: lead.first_name || '',
    LastName: lead.last_name || 'Unknown',
    Email: lead.email,
    Company: lead.company || 'Unknown',
    Status: 'Open - Not Contacted',
    LeadSource: 'Laiky AI',
  }

  if (lead.phone) sfLead.Phone = lead.phone
  if (lead.title) sfLead.Title = lead.title
  if (lead.website) sfLead.Website = lead.website
  if (lead.industry) sfLead.Industry = lead.industry

  // Create the Lead in Salesforce
  const result = await salesforceApiCall(orgId, '/sobjects/Lead', 'POST', sfLead) as {
    id: string
    success: boolean
    errors: unknown[]
  }

  if (!result.success || !result.id) {
    return { leadId: lead.id, leadName: name, success: false, error: 'SF create failed' }
  }

  // Update our lead record with the SF ID
  const now = new Date().toISOString()
  await supabase
    .from('leads')
    .update({
      salesforce_lead_id: result.id,
      salesforce_pushed_at: now,
      updated_at: now,
    })
    .eq('id', lead.id)

  return { leadId: lead.id, leadName: name, success: true, salesforceLeadId: result.id }
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)

    const ctx = await getAuthContext(authHeader)
    if (!ctx) return errorResponse('Unauthorized', 401)

    const body = await req.json() as { leadId?: string; leadIds?: string[]; prospectIds?: string[] }
    const isProspectMode = !!body.prospectIds
    const ids = body.prospectIds || body.leadIds || (body.leadId ? [body.leadId] : [])
    const isBulk = !!(body.leadIds || body.prospectIds)

    if (ids.length === 0) return errorResponse('leadId, leadIds, or prospectIds is required')

    const supabase = createSupabaseClient(authHeader)

    // Load records from appropriate table
    let records: LeadRecord[]
    if (isProspectMode) {
      const { data, error } = await supabase
        .from('prospects')
        .select('id, first_name, last_name, email, company, phone, title, linkedin_url')
        .in('id', ids)
        .eq('org_id', ctx.orgId)
      if (error || !data || data.length === 0) return errorResponse('No prospects found', 404)
      // Map prospect fields to LeadRecord (no salesforce_lead_id on prospects — email dedupe handles idempotency)
      records = data.map(p => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email,
        company: p.company,
        phone: p.phone,
        title: p.title,
        website: p.linkedin_url || null,
        industry: null,
        salesforce_lead_id: null,
      }))
    } else {
      const { data, error } = await supabase
        .from('leads')
        .select('id, first_name, last_name, email, company, phone, title, website, industry, salesforce_lead_id')
        .in('id', ids)
        .eq('org_id', ctx.orgId)
      if (error || !data || data.length === 0) return errorResponse('No leads found', 404)
      records = data as LeadRecord[]
    }

    // Single mode (backward compatible, leads only)
    if (!isBulk && records.length === 1) {
      const lead = records[0]
      const result = await pushSingleLead(lead, ctx.orgId, supabase)

      if (result.duplicate) {
        return jsonResponse({
          success: false,
          duplicate: true,
          salesforceLeadId: result.salesforceLeadId,
          message: result.error,
        })
      }

      if (!result.success) {
        return errorResponse(result.error || 'Failed to push lead', 400)
      }

      return jsonResponse({
        success: true,
        salesforceLeadId: result.salesforceLeadId,
      })
    }

    // Bulk mode
    const results: PushResult[] = []
    for (let i = 0; i < records.length; i++) {
      try {
        const result = await pushSingleLead(records[i], ctx.orgId, supabase)
        results.push(result)
        console.log(`  [${i + 1}/${records.length}] ${result.leadName}: ${result.success ? 'OK' : result.error}`)
      } catch (err) {
        const name = `${records[i].first_name} ${records[i].last_name}`
        results.push({
          leadId: records[i].id,
          leadName: name,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }

      // Small delay between leads to avoid SF rate limits
      if (i < records.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_LEADS_MS))
      }
    }

    const pushed = results.filter(r => r.success).length
    const duplicates = results.filter(r => r.duplicate).length
    const failed = results.filter(r => !r.success && !r.duplicate).length

    console.log(`Bulk push complete: ${pushed} pushed, ${duplicates} duplicates, ${failed} failed`)

    return jsonResponse({
      success: true,
      total: results.length,
      pushed,
      duplicates,
      failed,
      results,
    })
  } catch (error) {
    console.error('salesforce-push-lead error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
