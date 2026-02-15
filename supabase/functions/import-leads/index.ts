// Edge Function: Import Leads from CSV
// POST /functions/v1/import-leads
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthUser, logActivity } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface LeadRow {
  first_name: string
  last_name: string
  email?: string
  company?: string
  title?: string
  linkedin_url?: string
  phone?: string
  industry?: string
  website?: string
  company_linkedin_url?: string
  annual_revenue?: string
  total_funding?: string
  latest_funding?: string
  latest_funding_amount?: string
  department?: string
  corporate_phone?: string
  personal_phone?: string
}

interface ImportRequest {
  rows: LeadRow[]
  upsertRows?: LeadRow[]
  existingLeadIds?: string[]
  cadenceId?: string | null
}

interface ImportError {
  row: number
  error: string
  data?: LeadRow
}

// Validate a single lead row
function validateRow(row: LeadRow, index: number): ImportError | null {
  if (!row.first_name || row.first_name.trim() === '') {
    return { row: index, error: 'Missing required field: first_name', data: row }
  }
  if (!row.last_name || row.last_name.trim() === '') {
    return { row: index, error: 'Missing required field: last_name', data: row }
  }

  // Validate email format if provided
  if (row.email && !isValidEmail(row.email)) {
    return { row: index, error: 'Invalid email format', data: row }
  }

  // Validate LinkedIn URL format if provided
  if (row.linkedin_url && !isValidLinkedInUrl(row.linkedin_url)) {
    return { row: index, error: 'Invalid LinkedIn URL format', data: row }
  }

  return null
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function isValidLinkedInUrl(url: string): boolean {
  return url.includes('linkedin.com/in/') || url.includes('linkedin.com/sales/')
}

function cleanValue(val?: string): string | null {
  if (!val) return null
  const trimmed = val.trim()
  if (trimmed === '' || trimmed === '""' || trimmed === "''") return null
  return trimmed
}

function buildLeadInsert(row: LeadRow, ownerId: string) {
  return {
    owner_id: ownerId,
    first_name: row.first_name.trim(),
    last_name: row.last_name.trim(),
    email: cleanValue(row.email),
    company: cleanValue(row.company),
    title: cleanValue(row.title),
    linkedin_url: cleanValue(row.linkedin_url),
    phone: cleanValue(row.phone),
    timezone: 'UTC',
    industry: cleanValue(row.industry),
    website: cleanValue(row.website),
    company_linkedin_url: cleanValue(row.company_linkedin_url),
    annual_revenue: cleanValue(row.annual_revenue),
    total_funding: cleanValue(row.total_funding),
    latest_funding: cleanValue(row.latest_funding),
    latest_funding_amount: cleanValue(row.latest_funding_amount),
    department: cleanValue(row.department),
    corporate_phone: cleanValue(row.corporate_phone),
    personal_phone: cleanValue(row.personal_phone),
  }
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization header', 401)
    }

    const user = await getAuthUser(authHeader)
    if (!user) {
      return errorResponse('Unauthorized', 401)
    }

    const body: ImportRequest = await req.json()
    const { rows = [], upsertRows = [], existingLeadIds = [], cadenceId } = body

    if (rows.length === 0 && (!upsertRows || upsertRows.length === 0) && existingLeadIds.length === 0) {
      return errorResponse('No data rows to import')
    }

    const supabase = createSupabaseClient()

    // Validate new rows
    const validationErrors: ImportError[] = []
    const validRows: LeadRow[] = []

    rows.forEach((row, index) => {
      const error = validateRow(row, index + 1)
      if (error) {
        validationErrors.push(error)
      } else {
        validRows.push(row)
      }
    })

    let importedCount = 0
    let updatedCount = 0
    const allLeadIds: string[] = []

    // Deduplicate validRows by email (keep first occurrence, prevent intra-batch duplicates)
    const seenEmails = new Set<string>()
    const deduplicatedRows = validRows.filter((row) => {
      const email = cleanValue(row.email)?.toLowerCase()
      if (!email) return true // Keep rows without email
      if (seenEmails.has(email)) return false
      seenEmails.add(email)
      return true
    })

    // Insert new leads
    if (deduplicatedRows.length > 0) {
      const leadsToInsert = deduplicatedRows.map((row) => buildLeadInsert(row, user.id))

      const { data: insertedLeads, error: insertError } = await supabase
        .from('leads')
        .insert(leadsToInsert)
        .select('id')

      if (insertError) {
        console.error('Insert error:', insertError)
        return errorResponse(`Failed to import leads: ${insertError.message}`, 500)
      }

      importedCount = insertedLeads?.length || 0
      for (const lead of insertedLeads || []) {
        allLeadIds.push(lead.id)
      }
    }

    // Upsert duplicate leads (update existing by email)
    if (upsertRows && upsertRows.length > 0) {
      for (const row of upsertRows) {
        const email = cleanValue(row.email)
        if (!email) continue

        const updateData: Record<string, unknown> = {
          first_name: row.first_name.trim(),
          last_name: row.last_name.trim(),
          updated_at: new Date().toISOString(),
        }
        if (cleanValue(row.company)) updateData.company = cleanValue(row.company)
        if (cleanValue(row.title)) updateData.title = cleanValue(row.title)
        if (cleanValue(row.linkedin_url)) updateData.linkedin_url = cleanValue(row.linkedin_url)
        if (cleanValue(row.phone)) updateData.phone = cleanValue(row.phone)
        if (cleanValue(row.industry)) updateData.industry = cleanValue(row.industry)
        if (cleanValue(row.website)) updateData.website = cleanValue(row.website)
        if (cleanValue(row.company_linkedin_url)) updateData.company_linkedin_url = cleanValue(row.company_linkedin_url)
        if (cleanValue(row.annual_revenue)) updateData.annual_revenue = cleanValue(row.annual_revenue)
        if (cleanValue(row.total_funding)) updateData.total_funding = cleanValue(row.total_funding)
        if (cleanValue(row.latest_funding)) updateData.latest_funding = cleanValue(row.latest_funding)
        if (cleanValue(row.latest_funding_amount)) updateData.latest_funding_amount = cleanValue(row.latest_funding_amount)
        if (cleanValue(row.department)) updateData.department = cleanValue(row.department)
        if (cleanValue(row.corporate_phone)) updateData.corporate_phone = cleanValue(row.corporate_phone)
        if (cleanValue(row.personal_phone)) updateData.personal_phone = cleanValue(row.personal_phone)

        const { data: updatedLead, error: updateError } = await supabase
          .from('leads')
          .update(updateData)
          .eq('owner_id', user.id)
          .eq('email', email)
          .select('id')
          .single()

        if (!updateError && updatedLead) {
          updatedCount++
          allLeadIds.push(updatedLead.id)
        }
      }
    }

    // Add existing leads that just need cadence assignment (no new record needed)
    for (const id of existingLeadIds) {
      allLeadIds.push(id)
    }

    // Assign to cadence if specified
    if (cadenceId && allLeadIds.length > 0) {
      const { data: steps } = await supabase
        .from('cadence_steps')
        .select('id')
        .eq('cadence_id', cadenceId)
        .order('day_offset', { ascending: true })
        .order('order_in_day', { ascending: true })
        .limit(1)

      const firstStepId = steps?.[0]?.id || null

      const cadenceLeadInserts = allLeadIds.map((leadId) => ({
        cadence_id: cadenceId,
        lead_id: leadId,
        owner_id: user.id,
        current_step_id: firstStepId,
        status: 'active',
      }))

      const { error: clError } = await supabase
        .from('cadence_leads')
        .upsert(cadenceLeadInserts, { onConflict: 'cadence_id,lead_id' })

      if (clError) {
        console.error('Cadence assignment error:', clError)
      }

      // Also create lead_step_instances so leads appear in the step view
      if (firstStepId) {
        const lsiInserts = allLeadIds.map((leadId) => ({
          cadence_id: cadenceId,
          cadence_step_id: firstStepId,
          lead_id: leadId,
          owner_id: user.id,
          status: 'pending',
        }))

        const { error: lsiError } = await supabase
          .from('lead_step_instances')
          .upsert(lsiInserts, { onConflict: 'cadence_step_id,lead_id' })

        if (lsiError) {
          console.error('Lead step instance error:', lsiError)
        }
      }
    }

    // Log activity
    await logActivity({
      ownerId: user.id,
      cadenceId: cadenceId || undefined,
      action: 'import_leads',
      status: 'ok',
      details: {
        imported: importedCount,
        updated: updatedCount,
        errors: validationErrors.length,
        totalRows: rows.length + (upsertRows?.length || 0),
        cadenceId: cadenceId || null,
      },
    })

    return jsonResponse({
      success: true,
      imported: importedCount,
      updated: updatedCount,
      errors: validationErrors,
      message: `Imported ${importedCount} leads${updatedCount > 0 ? `, updated ${updatedCount}` : ''}${validationErrors.length > 0 ? ` with ${validationErrors.length} errors` : ''}`,
    })
  } catch (error) {
    console.error('Error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})
