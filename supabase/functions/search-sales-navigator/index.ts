// Edge Function: Search Sales Navigator
// POST /functions/v1/search-sales-navigator
// Searches LinkedIn Sales Navigator for people matching filters via Unipile API.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getAuthUser, getUnipileAccountId } from '../_shared/supabase.ts'
import { createUnipileClient } from '../_shared/unipile.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface SearchRequest {
  keywords?: string
  companyNames?: string[]
  titleKeywords?: string[]
  location?: string
  seniority?: string[]
  companySizeMin?: string
  companySizeMax?: string
  limit?: number
  cursor?: string
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

    const user = await getAuthUser(authHeader)
    if (!user) {
      return errorResponse('Unauthorized', 401)
    }

    const body: SearchRequest = await req.json()

    // Get user's Unipile LinkedIn account
    const accountId = await getUnipileAccountId(user.id)
    if (!accountId) {
      return errorResponse('No LinkedIn account connected. Please connect your LinkedIn in Settings.')
    }

    const unipile = createUnipileClient()
    const limit = Math.min(body.limit || 25, 50)

    console.log(`Sales Navigator search by user ${user.id}: keywords="${body.keywords}", companies=${JSON.stringify(body.companyNames)}, titles=${JSON.stringify(body.titleKeywords)}`)

    const result = await unipile.searchSalesNavigator(accountId, {
      keywords: body.keywords,
      company_names: body.companyNames,
      title_keywords: body.titleKeywords,
      location: body.location,
      seniority: body.seniority,
      company_size_min: body.companySizeMin,
      company_size_max: body.companySizeMax,
      limit,
      cursor: body.cursor,
    })

    if (!result.success) {
      console.error('Sales Navigator search failed:', result.error)
      return errorResponse(result.error || 'Search failed')
    }

    // Normalize the response — Unipile returns items in various formats
    const rawData = result.data as Record<string, unknown>
    const items = (rawData?.items || rawData?.results || []) as Array<Record<string, unknown>>
    const cursor = (rawData?.cursor || rawData?.next_cursor || null) as string | null
    const hasMore = !!cursor

    const prospects = items.map((item: Record<string, unknown>) => {
      // Sales Navigator returns current company info in current_positions array
      const positions = (item.current_positions || []) as Array<Record<string, unknown>>
      const currentPosition = positions[0] || {}

      return {
        firstName: item.first_name || item.firstName || '',
        lastName: item.last_name || item.lastName || '',
        title: (currentPosition.role as string) || item.title || item.headline || '',
        company: (currentPosition.company as string) || item.company || item.company_name || '',
        linkedinUrl: item.public_profile_url || item.profile_url ||
          (item.public_identifier ? `https://www.linkedin.com/in/${item.public_identifier}` : '') || '',
        linkedinProviderId: item.provider_id || item.id || '',
        headline: item.headline || item.title || '',
        location: item.location || '',
      }
    })

    console.log(`Found ${prospects.length} prospects, hasMore=${hasMore}`)

    return jsonResponse({
      success: true,
      prospects,
      cursor,
      hasMore,
      totalFound: prospects.length,
    })
  } catch (error) {
    console.error('Error in search-sales-navigator:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
