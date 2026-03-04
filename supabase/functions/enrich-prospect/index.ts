// Edge Function: Enrich Prospect
// POST /functions/v1/enrich-prospect
// Primary: Apollo.io People Enrichment API (single + bulk match)
// Fallback: Firecrawl website scraping for email pattern detection
// API keys: per-org from org_integrations table, env var fallback

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface EnrichRequest {
  prospectId?: string
  prospectIds?: string[]
  companyWebsite?: string
}

interface ApolloPersonMatch {
  id?: string
  first_name?: string
  last_name?: string
  email?: string
  email_status?: string
  title?: string
  headline?: string
  linkedin_url?: string
  city?: string
  state?: string
  country?: string
  phone_numbers?: Array<{ sanitized_number: string; type?: string; status?: string }>
  organization?: {
    name?: string
    website_url?: string
    industry?: string
    estimated_num_employees?: number
  }
}

// ─── Get API keys: per-org first, then env var fallback ─────────

async function getApiKeys(
  supabase: ReturnType<typeof createSupabaseClient>,
  orgId: string,
): Promise<{ apolloApiKey: string | null; firecrawlApiKey: string | null }> {
  // Try per-org keys first
  const { data } = await supabase
    .from('org_integrations')
    .select('apollo_api_key, firecrawl_api_key')
    .eq('org_id', orgId)
    .single()

  const apolloApiKey = data?.apollo_api_key || Deno.env.get('APOLLO_API_KEY') || null
  const firecrawlApiKey = data?.firecrawl_api_key || Deno.env.get('FIRECRAWL_API_KEY') || null

  if (data?.apollo_api_key) console.log('Using per-org Apollo API key')
  else if (apolloApiKey) console.log('Using global Apollo API key (env var fallback)')

  return { apolloApiKey, firecrawlApiKey }
}

// ─── Apollo.io Single People Enrichment ──────────────────────────

async function enrichWithApollo(
  apiKey: string,
  params: {
    linkedinUrl?: string
    firstName?: string
    lastName?: string
    domain?: string
    email?: string
  }
): Promise<{ success: boolean; person?: ApolloPersonMatch; error?: string; creditError?: boolean }> {
  try {
    const requestBody: Record<string, string | boolean> = {}
    if (params.linkedinUrl) requestBody.linkedin_url = params.linkedinUrl
    if (params.firstName) requestBody.first_name = params.firstName
    if (params.lastName) requestBody.last_name = params.lastName
    if (params.domain) requestBody.domain = params.domain
    if (params.email) requestBody.email = params.email
    requestBody.reveal_personal_emails = true
    // reveal_phone_number requires webhook_url (async delivery) — omitted.
    // Phone numbers are still returned if Apollo already has them.

    const response = await fetch('https://api.apollo.io/api/v1/people/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const text = await response.text()
      console.warn(`Apollo API error ${response.status}: ${text.slice(0, 300)}`)
      if (response.status === 429) return { success: false, error: 'Apollo rate limit exceeded' }
      if (response.status === 401 || response.status === 403) return { success: false, error: `Apollo auth error: ${text.slice(0, 200)}`, creditError: true }
      return { success: false, error: `Apollo API ${response.status}: ${text.slice(0, 200)}` }
    }

    const data = await response.json()

    if (data?.error || data?.message) {
      const msg = (data.error || data.message || '').toLowerCase()
      if (msg.includes('credit') || msg.includes('quota') || msg.includes('limit') || msg.includes('plan')) {
        return { success: false, error: `Apollo: ${data.error || data.message}`, creditError: true }
      }
    }

    const person = data?.person as ApolloPersonMatch | undefined
    if (!person) {
      return { success: false, error: 'No match found in Apollo' }
    }

    return { success: true, person }
  } catch (error) {
    console.error('Apollo enrichment error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Apollo API error' }
  }
}

// ─── Firecrawl Website Scraping (fallback) ───────────────────────

async function scrapeForContacts(
  url: string,
  apiKey: string
): Promise<{ emails: string[]; phones: string[] }> {
  try {
    const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: [{
          type: 'json',
          schema: {
            type: 'object',
            properties: {
              emails: { type: 'array', items: { type: 'string' }, description: 'All email addresses found on this page' },
              phones: { type: 'array', items: { type: 'string' }, description: 'All phone numbers found on this page' },
            },
          },
          prompt: 'Extract all email addresses and phone numbers from this page.',
        }],
      }),
    })

    if (!response.ok) return { emails: [], phones: [] }

    const data = await response.json()
    const extract = data?.data?.json || {}

    return {
      emails: (extract.emails || []).filter((e: string) => e && e.includes('@')),
      phones: (extract.phones || []).filter((p: string) => p && p.length > 5),
    }
  } catch {
    return { emails: [], phones: [] }
  }
}

function matchEmailToName(emails: string[], firstName: string, lastName: string): string | null {
  const first = firstName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const last = lastName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  const patterns = [
    `${first}.${last}`, `${first}${last}`, `${first[0]}${last}`,
    `${first}_${last}`, `${last}.${first}`, `${first}`, `${last}`,
  ]

  for (const pattern of patterns) {
    const match = emails.find(e => e.toLowerCase().startsWith(pattern + '@'))
    if (match) return match
  }

  const partialMatch = emails.find(e => {
    const local = e.split('@')[0].toLowerCase()
    return local.includes(first) || local.includes(last)
  })

  return partialMatch || null
}

// ─── Process Apollo result for a single prospect ─────────────────

function processApolloMatch(
  person: ApolloPersonMatch | null | undefined,
): {
  email: string | null
  phone: string | null
  enrichmentDetails: Record<string, unknown>
  failReason: string | null
} {
  const enrichmentDetails: Record<string, unknown> = {}

  if (!person) {
    return { email: null, phone: null, enrichmentDetails, failReason: 'not_in_apollo' }
  }

  const email = person.email || null
  const phone = person.phone_numbers?.[0]?.sanitized_number || null

  if (person.email) {
    enrichmentDetails.apollo_email = person.email
    enrichmentDetails.apollo_email_status = person.email_status
  }
  if (person.phone_numbers && person.phone_numbers.length > 0) {
    enrichmentDetails.apollo_phones = person.phone_numbers
  }

  enrichmentDetails.apollo_title = person.title
  enrichmentDetails.apollo_city = person.city
  enrichmentDetails.apollo_country = person.country
  if (person.organization) {
    enrichmentDetails.apollo_company = person.organization.name
    enrichmentDetails.apollo_website = person.organization.website_url
    enrichmentDetails.apollo_industry = person.organization.industry
    enrichmentDetails.apollo_employees = person.organization.estimated_num_employees
  }

  const failReason = (!email && !phone) ? 'no_contact_data' : null

  return { email, phone, enrichmentDetails, failReason }
}

// ─── Enrich a single prospect (full pipeline) ───────────────────

async function enrichSingleProspect(
  supabase: ReturnType<typeof createSupabaseClient>,
  prospectId: string,
  orgId: string,
  apolloApiKey: string | null,
  firecrawlApiKey: string | null,
  companyWebsite?: string,
): Promise<{
  success: boolean
  email?: string | null
  phone?: string | null
  source?: string
  error?: string
  failReason?: string | null
}> {
  const { data: prospect, error: pErr } = await supabase
    .from('prospects')
    .select('*')
    .eq('id', prospectId)
    .eq('org_id', orgId)
    .single()

  if (pErr || !prospect) {
    return { success: false, error: 'Prospect not found' }
  }

  let bestEmail: string | null = null
  let bestPhone: string | null = null
  let source = 'none'
  let failReason: string | null = null
  const enrichmentDetails: Record<string, unknown> = { enriched_at: new Date().toISOString() }

  // ── Strategy 1: Apollo.io (primary) ──
  if (apolloApiKey) {
    let domain: string | undefined
    const website = companyWebsite || prospect.enrichment_data?.company_website as string | undefined
    if (website) {
      try {
        const url = new URL(website.startsWith('http') ? website : `https://${website}`)
        domain = url.hostname.replace(/^www\./, '')
      } catch { /* ignore */ }
    }

    const hasIdentifier = !!(prospect.linkedin_url || domain || (prospect.first_name && prospect.last_name))
    if (!hasIdentifier) {
      failReason = 'no_identifier'
      enrichmentDetails.fail_reason = failReason
    } else {
      // Single match call
      const apolloResult = await enrichWithApollo(apolloApiKey, {
        linkedinUrl: prospect.linkedin_url || undefined,
        firstName: prospect.first_name,
        lastName: prospect.last_name,
        domain,
      })

      if (apolloResult.creditError) {
        failReason = 'apollo_credit_exhausted'
        enrichmentDetails.apollo_error = apolloResult.error
      } else if (apolloResult.success && apolloResult.person) {
        const result = processApolloMatch(apolloResult.person)
        bestEmail = result.email
        bestPhone = result.phone
        Object.assign(enrichmentDetails, result.enrichmentDetails)
        failReason = result.failReason
        if (bestEmail || bestPhone) source = 'apollo'
      } else {
        const errMsg = apolloResult.error || ''
        failReason = errMsg.includes('rate') || errMsg.includes('429') ? 'apollo_rate_limit' : 'not_in_apollo'
        enrichmentDetails.apollo_error = apolloResult.error
      }
    }
  } else {
    failReason = 'no_api_key'
  }

  // ── Strategy 2: Firecrawl website scraping (fallback) ──
  if (!bestEmail && firecrawlApiKey && companyWebsite) {
    let baseUrl = companyWebsite.trim()
    if (!baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`
    baseUrl = baseUrl.replace(/\/+$/, '')

    const contactPaths = ['', '/contact', '/about', '/team']
    const allEmails = new Set<string>()
    const allPhones = new Set<string>()

    for (const path of contactPaths) {
      const result = await scrapeForContacts(`${baseUrl}${path}`, firecrawlApiKey)
      result.emails.forEach(e => allEmails.add(e))
      result.phones.forEach(p => allPhones.add(p))
      if (allEmails.size > 0) break
    }

    if (allEmails.size > 0) {
      const matched = matchEmailToName(Array.from(allEmails), prospect.first_name, prospect.last_name)
      if (matched) {
        bestEmail = matched
        source = source === 'apollo' ? 'apollo+firecrawl' : 'firecrawl'
      }
      enrichmentDetails.firecrawl_emails = Array.from(allEmails)
    }

    if (!bestPhone && allPhones.size > 0) {
      bestPhone = Array.from(allPhones)[0]
      enrichmentDetails.firecrawl_phones = Array.from(allPhones)
    }
  }

  // ── Update prospect ──
  const finalFailReason = (bestEmail || bestPhone) ? null : failReason
  enrichmentDetails.source = source
  if (finalFailReason) enrichmentDetails.fail_reason = finalFailReason
  else delete enrichmentDetails.fail_reason

  const updateData: Record<string, unknown> = {
    enrichment_data: { ...(prospect.enrichment_data || {}), ...enrichmentDetails, fail_reason: finalFailReason },
    status: bestEmail ? 'enriched' : prospect.status,
    updated_at: new Date().toISOString(),
  }
  if (bestEmail) updateData.email = bestEmail
  if (bestPhone) updateData.phone = bestPhone

  if (!prospect.location && enrichmentDetails.apollo_city) {
    const parts = [enrichmentDetails.apollo_city, enrichmentDetails.apollo_country].filter(Boolean)
    if (parts.length > 0) updateData.location = parts.join(', ')
  }

  await supabase
    .from('prospects')
    .update(updateData)
    .eq('id', prospectId)

  return {
    success: true,
    email: bestEmail,
    phone: bestPhone,
    source,
    failReason: finalFailReason,
  }
}

// ─── Main Handler ─────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)

    const body = await req.json() as EnrichRequest & { ownerId?: string; orgId?: string }

    const ctx = await getAuthContext(authHeader, { ownerId: body.ownerId, orgId: body.orgId })
    if (!ctx) return errorResponse('Unauthorized', 401)

    const prospectIds = body.prospectIds || (body.prospectId ? [body.prospectId] : [])
    if (prospectIds.length === 0) {
      return errorResponse('prospectId or prospectIds is required')
    }

    const supabase = createSupabaseClient()

    // Get API keys: per-org first, env var fallback
    const { apolloApiKey, firecrawlApiKey } = await getApiKeys(supabase, ctx.orgId)

    if (!apolloApiKey && !firecrawlApiKey) {
      return errorResponse('No enrichment API keys configured. Go to Settings > Organization > Integrations to add your Apollo API key.', 400)
    }

    // Cap batch size for edge function timeout safety (each call ~2-3s)
    const MAX_BATCH = 10
    const cappedIds = prospectIds.slice(0, MAX_BATCH)
    if (cappedIds.length < prospectIds.length) {
      console.warn(`enrich-prospect: received ${prospectIds.length} IDs, capping at ${MAX_BATCH}`)
    }

    // Enrich each prospect sequentially via single match (most reliable)
    const results = []
    for (const pid of cappedIds) {
      const result = await enrichSingleProspect(
        supabase,
        pid,
        ctx.orgId,
        apolloApiKey,
        firecrawlApiKey,
        body.companyWebsite,
      )
      results.push({ prospectId: pid, ...result })
    }

    const enriched = results.filter(r => r.email)
    const failReasonCounts: Record<string, number> = {}
    for (const r of results) {
      if (r.failReason) failReasonCounts[r.failReason] = (failReasonCounts[r.failReason] || 0) + 1
    }

    console.log(`Enrichment complete: ${enriched.length}/${results.length} got emails. failReasons=${JSON.stringify(failReasonCounts)}`)

    return jsonResponse({
      success: true,
      results,
      summary: {
        total: results.length,
        enriched: enriched.length,
        withEmail: enriched.length,
        withPhone: results.filter(r => r.phone).length,
        failReasonCounts,
      },
    })
  } catch (error) {
    console.error('Error in enrich-prospect:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
