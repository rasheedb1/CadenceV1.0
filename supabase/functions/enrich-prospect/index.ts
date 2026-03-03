// Edge Function: Enrich Prospect
// POST /functions/v1/enrich-prospect
// Primary: Apollo.io People Enrichment API (by linkedin_url)
// Fallback: Firecrawl website scraping for email pattern detection
// Also supports bulk enrichment via prospectIds array

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface EnrichRequest {
  // Single prospect
  prospectId?: string
  // Bulk prospects
  prospectIds?: string[]
  // Optional: company website for Firecrawl fallback
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

// ─── Concurrency helper ───────────────────────────────────────────

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex++
      results[index] = await tasks[index]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
  return results
}

// ─── Apollo.io People Enrichment ─────────────────────────────────

async function enrichWithApollo(
  apiKey: string,
  params: {
    linkedinUrl?: string
    firstName?: string
    lastName?: string
    domain?: string
    email?: string
  }
): Promise<{ success: boolean; person?: ApolloPersonMatch; error?: string; creditError?: boolean; emailCreditWarning?: boolean; phoneCreditWarning?: boolean }> {
  try {
    // Build query parameters
    const queryParams = new URLSearchParams()
    if (params.linkedinUrl) queryParams.set('linkedin_url', params.linkedinUrl)
    if (params.firstName) queryParams.set('first_name', params.firstName)
    if (params.lastName) queryParams.set('last_name', params.lastName)
    if (params.domain) queryParams.set('domain', params.domain)
    if (params.email) queryParams.set('email', params.email)
    queryParams.set('reveal_personal_emails', 'true')
    queryParams.set('reveal_phone_number', 'true')

    const url = `https://api.apollo.io/api/v1/people/match?${queryParams.toString()}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
    })

    if (!response.ok) {
      const text = await response.text()
      console.warn(`Apollo API error ${response.status}: ${text}`)
      if (response.status === 429) return { success: false, error: 'Apollo rate limit exceeded' }
      return { success: false, error: `Apollo API ${response.status}` }
    }

    const data = await response.json()

    // Detect Apollo account-level errors (credit exhaustion, plan restrictions)
    if (data?.error || data?.message) {
      const msg = (data.error || data.message || '').toLowerCase()
      if (msg.includes('credit') || msg.includes('quota') || msg.includes('limit') || msg.includes('plan')) {
        console.warn(`Apollo account warning: ${data.error || data.message}`)
        return { success: false, error: `Apollo: ${data.error || data.message}`, creditError: true }
      }
    }

    const person = data?.person as ApolloPersonMatch | undefined

    if (!person) {
      return { success: false, error: 'No match found in Apollo' }
    }

    // Detect when Apollo found the person but withheld data (credit signals)
    const emailCreditWarning = !person.email && data?.reveal_personal_emails_credit_used === false
    const phoneCreditWarning = (!person.phone_numbers || person.phone_numbers.length === 0) && data?.reveal_phone_credit_used === false

    // Log credit signals for debugging
    if (emailCreditWarning) console.warn('Apollo email credit warning: reveal_personal_emails_credit_used=false')
    if (phoneCreditWarning) console.warn('Apollo phone credit warning: reveal_phone_credit_used=false')

    console.log(`Apollo response for match: email=${person.email || 'null'}, phones=${person.phone_numbers?.length || 0}, email_credit_used=${data?.reveal_personal_emails_credit_used}, phone_credit_used=${data?.reveal_phone_credit_used}`)

    return { success: true, person, emailCreditWarning, phoneCreditWarning }
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

// ─── Enrich a single prospect ────────────────────────────────────

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
  apolloPersonFound?: boolean
  emailCreditWarning?: boolean
  phoneCreditWarning?: boolean
}> {
  // Fetch prospect
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
  let apolloEmailCreditWarning = false
  let apolloPhoneCreditWarning = false
  const enrichmentDetails: Record<string, unknown> = { enriched_at: new Date().toISOString() }

  // ── Strategy 1: Apollo.io (primary) ──
  if (apolloApiKey) {
    // Extract domain from company website or company name
    let domain: string | undefined
    const website = companyWebsite || prospect.enrichment_data?.company_website as string | undefined
    if (website) {
      try {
        const url = new URL(website.startsWith('http') ? website : `https://${website}`)
        domain = url.hostname.replace(/^www\./, '')
      } catch { /* ignore */ }
    }

    // Check if we have at least one identifier before calling Apollo
    const hasIdentifier = !!(prospect.linkedin_url || domain || (prospect.first_name && prospect.last_name))
    if (!hasIdentifier) {
      failReason = 'no_identifier'
      enrichmentDetails.fail_reason = failReason
      console.log(`Skipping Apollo for ${prospect.first_name} ${prospect.last_name}: no LinkedIn URL or domain`)
    } else {
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
        const person = apolloResult.person
        source = 'apollo'

        if (person.email) {
          bestEmail = person.email
          enrichmentDetails.apollo_email = person.email
          enrichmentDetails.apollo_email_status = person.email_status
        }

        if (person.phone_numbers && person.phone_numbers.length > 0) {
          bestPhone = person.phone_numbers[0].sanitized_number
          enrichmentDetails.apollo_phones = person.phone_numbers
        }

        // Track credit warnings
        apolloEmailCreditWarning = apolloResult.emailCreditWarning || false
        apolloPhoneCreditWarning = apolloResult.phoneCreditWarning || false

        // Infer credit warnings: Apollo found the person but returned no data despite reveal flags
        if (!bestEmail) apolloEmailCreditWarning = true
        if (!bestPhone) apolloPhoneCreditWarning = true

        if (apolloEmailCreditWarning) enrichmentDetails.apollo_email_credit_warning = true
        if (apolloPhoneCreditWarning) enrichmentDetails.apollo_phone_credit_warning = true

        // If Apollo found the person but has no contact data at all
        if (!bestEmail && !bestPhone) {
          failReason = 'no_contact_data'
        }

        // Store extra Apollo data for later use
        enrichmentDetails.apollo_title = person.title
        enrichmentDetails.apollo_city = person.city
        enrichmentDetails.apollo_country = person.country
        if (person.organization) {
          enrichmentDetails.apollo_company = person.organization.name
          enrichmentDetails.apollo_website = person.organization.website_url
          enrichmentDetails.apollo_industry = person.organization.industry
          enrichmentDetails.apollo_employees = person.organization.estimated_num_employees
        }

        console.log(`Apollo enrichment for ${prospect.first_name} ${prospect.last_name}: email=${bestEmail}, phone=${bestPhone}, emailCreditWarning=${apolloEmailCreditWarning}, phoneCreditWarning=${apolloPhoneCreditWarning}`)
      } else {
        // Apollo couldn't find the person at all
        const errMsg = apolloResult.error || ''
        if (errMsg.includes('rate') || errMsg.includes('429')) {
          failReason = 'apollo_rate_limit'
        } else {
          failReason = 'not_in_apollo'
        }
        console.log(`Apollo miss for ${prospect.first_name} ${prospect.last_name}: ${apolloResult.error} → failReason=${failReason}`)
        enrichmentDetails.apollo_error = apolloResult.error
      }
    }
  } else {
    failReason = 'no_api_key'
  }

  // ── Strategy 2: Firecrawl website scraping (fallback if no email from Apollo) ──
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
  // Clear fail_reason if we got contact data; otherwise store it
  const finalFailReason = (bestEmail || bestPhone) ? null : failReason
  enrichmentDetails.source = source
  if (finalFailReason) enrichmentDetails.fail_reason = finalFailReason
  else delete enrichmentDetails.fail_reason // clear old reason if now enriched

  const updateData: Record<string, unknown> = {
    enrichment_data: { ...(prospect.enrichment_data || {}), ...enrichmentDetails, fail_reason: finalFailReason },
    status: bestEmail ? 'enriched' : prospect.status,
    updated_at: new Date().toISOString(),
  }
  if (bestEmail) updateData.email = bestEmail
  if (bestPhone) updateData.phone = bestPhone

  // Also update location from Apollo if we have it and prospect doesn't
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
    apolloPersonFound: !!apolloApiKey,
    emailCreditWarning: apolloEmailCreditWarning && !bestEmail,
    phoneCreditWarning: apolloPhoneCreditWarning && !bestPhone,
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

    const ctx = await getAuthContext(authHeader)
    if (!ctx) return errorResponse('Unauthorized', 401)

    const body: EnrichRequest = await req.json()

    // Resolve prospect IDs (single or bulk)
    const prospectIds = body.prospectIds || (body.prospectId ? [body.prospectId] : [])
    if (prospectIds.length === 0) {
      return errorResponse('prospectId or prospectIds is required')
    }

    const apolloApiKey = Deno.env.get('APOLLO_API_KEY') || null
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY') || null

    if (!apolloApiKey && !firecrawlApiKey) {
      return errorResponse('No enrichment API keys configured (APOLLO_API_KEY or FIRECRAWL_API_KEY)', 500)
    }

    const supabase = createSupabaseClient()

    // Cap batch size to prevent Supabase 60s timeout
    const MAX_BATCH = 4
    const cappedIds = prospectIds.slice(0, MAX_BATCH)
    if (cappedIds.length < prospectIds.length) {
      console.warn(`enrich-prospect: received ${prospectIds.length} IDs, capping at ${MAX_BATCH}`)
    }

    const CONCURRENCY = 3
    const tasks = cappedIds.map((pid) => async () => {
      const result = await enrichSingleProspect(
        supabase,
        pid,
        ctx.orgId,
        apolloApiKey,
        firecrawlApiKey,
        body.companyWebsite,
      )
      return { prospectId: pid, ...result }
    })
    const results = await runWithConcurrency(tasks, CONCURRENCY)

    const enriched = results.filter(r => r.email)
    const emailCreditWarning = results.some(r => r.emailCreditWarning)
    const phoneCreditWarning = results.some(r => r.phoneCreditWarning)

    // Count failure reasons for summary
    const failReasonCounts: Record<string, number> = {}
    for (const r of results) {
      if (r.failReason) {
        failReasonCounts[r.failReason] = (failReasonCounts[r.failReason] || 0) + 1
      }
    }

    console.log(`Enrichment complete: ${enriched.length}/${results.length} got emails, ${results.filter(r => r.phone).length} got phones. failReasons=${JSON.stringify(failReasonCounts)}`)

    return jsonResponse({
      success: true,
      results,
      summary: {
        total: results.length,
        enriched: enriched.length,
        withEmail: enriched.length,
        withPhone: results.filter(r => r.phone).length,
        emailCreditWarning,
        phoneCreditWarning,
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
