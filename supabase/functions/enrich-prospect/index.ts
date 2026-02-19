// Edge Function: Enrich Prospect
// POST /functions/v1/enrich-prospect
// Uses Firecrawl to scrape a company website for contact details (emails, phones).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface EnrichRequest {
  prospectId: string
  companyWebsite: string
}

// Pages to scrape for contact info
const CONTACT_PATHS = ['', '/contact', '/about', '/team', '/about-us', '/contact-us']

/**
 * Call Firecrawl to scrape a URL and extract emails/phones
 */
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
              emails: {
                type: 'array',
                items: { type: 'string' },
                description: 'All email addresses found on this page',
              },
              phones: {
                type: 'array',
                items: { type: 'string' },
                description: 'All phone numbers found on this page',
              },
            },
          },
          prompt: 'Extract all email addresses and phone numbers from this page. Include contact emails, support emails, and any direct phone numbers.',
        }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.warn(`Firecrawl failed for ${url}: HTTP ${response.status} - ${errorText}`)
      return { emails: [], phones: [] }
    }

    const data = await response.json()
    // v2 returns extracted JSON in data.json (v1 used data.extract)
    const extract = data?.data?.json || {}

    return {
      emails: (extract.emails || []).filter((e: string) => e && e.includes('@')),
      phones: (extract.phones || []).filter((p: string) => p && p.length > 5),
    }
  } catch (error) {
    console.warn(`Firecrawl error for ${url}:`, error)
    return { emails: [], phones: [] }
  }
}

/**
 * Try to match an email to a person's name using common patterns
 */
function matchEmailToName(
  emails: string[],
  firstName: string,
  lastName: string
): string | null {
  const first = firstName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const last = lastName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // Common email patterns to check (in priority order)
  const patterns = [
    `${first}.${last}`,     // john.doe@
    `${first}${last}`,      // johndoe@
    `${first[0]}${last}`,   // jdoe@
    `${first}_${last}`,     // john_doe@
    `${last}.${first}`,     // doe.john@
    `${first}`,             // john@
    `${last}`,              // doe@
  ]

  for (const pattern of patterns) {
    const match = emails.find(e => e.toLowerCase().startsWith(pattern + '@'))
    if (match) return match
  }

  // Partial match: email contains first or last name
  const partialMatch = emails.find(e => {
    const local = e.split('@')[0].toLowerCase()
    return local.includes(first) || local.includes(last)
  })

  return partialMatch || null
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization header', 401)
    }

    const ctx = await getAuthContext(authHeader)
    if (!ctx) {
      return errorResponse('Unauthorized', 401)
    }

    const body: EnrichRequest = await req.json()

    if (!body.prospectId) {
      return errorResponse('prospectId is required')
    }
    if (!body.companyWebsite) {
      return errorResponse('companyWebsite is required')
    }

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY')
    if (!firecrawlApiKey) {
      return errorResponse('Firecrawl API key not configured', 500)
    }

    const supabase = createSupabaseClient()

    // Fetch the prospect
    const { data: prospect, error: prospectError } = await supabase
      .from('prospects')
      .select('*')
      .eq('id', body.prospectId)
      .eq('org_id', ctx.orgId)
      .single()

    if (prospectError || !prospect) {
      return errorResponse('Prospect not found')
    }

    // Normalize the website URL
    let baseUrl = body.companyWebsite.trim()
    if (!baseUrl.startsWith('http')) {
      baseUrl = `https://${baseUrl}`
    }
    // Remove trailing slash
    baseUrl = baseUrl.replace(/\/+$/, '')

    console.log(`Enriching prospect ${prospect.first_name} ${prospect.last_name} via ${baseUrl}`)

    // Scrape multiple pages for contact info
    const allEmails = new Set<string>()
    const allPhones = new Set<string>()

    for (const path of CONTACT_PATHS) {
      const url = `${baseUrl}${path}`
      console.log(`Scraping: ${url}`)
      const result = await scrapeForContacts(url, firecrawlApiKey)
      result.emails.forEach(e => allEmails.add(e))
      result.phones.forEach(p => allPhones.add(p))

      // If we found emails, no need to scrape more pages
      if (allEmails.size > 0 && allPhones.size > 0) break
    }

    const emailsFound = Array.from(allEmails)
    const phonesFound = Array.from(allPhones)

    console.log(`Found ${emailsFound.length} emails, ${phonesFound.length} phones`)

    // Try to match the best email to the prospect's name
    const bestEmail = matchEmailToName(emailsFound, prospect.first_name, prospect.last_name)
    const bestPhone = phonesFound[0] || null

    // Update the prospect record
    const updateData: Record<string, unknown> = {
      enrichment_data: {
        emails_found: emailsFound,
        phones_found: phonesFound,
        website_scraped: baseUrl,
        enriched_at: new Date().toISOString(),
      },
      status: 'enriched',
      updated_at: new Date().toISOString(),
    }

    if (bestEmail) updateData.email = bestEmail
    if (bestPhone) updateData.phone = bestPhone

    await supabase
      .from('prospects')
      .update(updateData)
      .eq('id', body.prospectId)

    return jsonResponse({
      success: true,
      enrichment: {
        emails_found: emailsFound,
        phones_found: phonesFound,
      },
      bestEmailMatch: bestEmail,
      bestPhoneMatch: bestPhone,
    })
  } catch (error) {
    console.error('Error in enrich-prospect:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
