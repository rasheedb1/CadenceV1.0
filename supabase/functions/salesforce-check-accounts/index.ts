// Edge Function: Check if companies exist in Salesforce with active opportunities
// POST /functions/v1/salesforce-check-accounts
// Body: { domains?: string[], company_names?: string[] }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface AccountMatch {
  query: string
  match_type: 'domain' | 'name'
  sf_account_name: string
  has_active_opportunities: boolean
  active_opportunities_count: number
  total_pipeline_value: number
  latest_opportunity: {
    name: string | null
    stage: string | null
    amount: number | null
    close_date: string | null
    owner: string | null
  } | null
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)

    const ctx = await getAuthContext(authHeader)
    if (!ctx) return errorResponse('Invalid or expired token', 401)

    const { domains, company_names } = await req.json() as {
      domains?: string[]
      company_names?: string[]
    }

    if ((!domains || domains.length === 0) && (!company_names || company_names.length === 0)) {
      return errorResponse('Provide at least one domain or company_name', 400)
    }

    const supabase = createSupabaseClient()
    const matches: AccountMatch[] = []
    const matchedQueries = new Set<string>()

    // Match by domain
    if (domains && domains.length > 0) {
      const cleanDomains = domains
        .map(d => d.toLowerCase().replace(/^www\./, ''))
        .filter(Boolean)

      if (cleanDomains.length > 0) {
        const { data: domainMatches } = await supabase
          .from('salesforce_accounts')
          .select('*')
          .eq('org_id', ctx.orgId)
          .in('domain', cleanDomains)

        for (const acc of domainMatches || []) {
          matchedQueries.add(acc.domain)
          matches.push({
            query: acc.domain,
            match_type: 'domain',
            sf_account_name: acc.name,
            has_active_opportunities: acc.has_active_opportunities,
            active_opportunities_count: acc.active_opportunities_count,
            total_pipeline_value: acc.total_pipeline_value,
            latest_opportunity: acc.latest_opportunity_name ? {
              name: acc.latest_opportunity_name,
              stage: acc.latest_opportunity_stage,
              amount: acc.total_pipeline_value,
              close_date: acc.latest_opportunity_close_date,
              owner: acc.owner_name,
            } : null,
          })
        }
      }
    }

    // Match by company name (case-insensitive)
    if (company_names && company_names.length > 0) {
      for (const name of company_names) {
        if (matchedQueries.has(name.toLowerCase())) continue

        const { data: nameMatches } = await supabase
          .from('salesforce_accounts')
          .select('*')
          .eq('org_id', ctx.orgId)
          .ilike('name', `%${name}%`)
          .limit(1)

        if (nameMatches && nameMatches.length > 0) {
          const acc = nameMatches[0]
          matchedQueries.add(name.toLowerCase())
          matches.push({
            query: name,
            match_type: 'name',
            sf_account_name: acc.name,
            has_active_opportunities: acc.has_active_opportunities,
            active_opportunities_count: acc.active_opportunities_count,
            total_pipeline_value: acc.total_pipeline_value,
            latest_opportunity: acc.latest_opportunity_name ? {
              name: acc.latest_opportunity_name,
              stage: acc.latest_opportunity_stage,
              amount: acc.total_pipeline_value,
              close_date: acc.latest_opportunity_close_date,
              owner: acc.owner_name,
            } : null,
          })
        }
      }
    }

    // Build unmatched lists
    const unmatchedDomains = (domains || []).filter(
      d => !matchedQueries.has(d.toLowerCase().replace(/^www\./, ''))
    )
    const unmatchedNames = (company_names || []).filter(
      n => !matchedQueries.has(n.toLowerCase())
    )

    return jsonResponse({
      matches,
      unmatched_domains: unmatchedDomains,
      unmatched_names: unmatchedNames,
    })
  } catch (error) {
    console.error('salesforce-check-accounts error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})
