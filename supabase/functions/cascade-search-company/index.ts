/**
 * Edge Function: Cascade Search Company
 * POST /functions/v1/cascade-search-company
 *
 * Runs the full 3-level cascade search for ALL personas at a single company.
 * This replaces 15+ client-side edge function calls with 1 server-side call.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext, createSupabaseClient, getUnipileAccountId } from '../_shared/supabase.ts'
import { createUnipileClient } from '../_shared/unipile.ts'
import { cascadeSearch } from '../_shared/cascade-search.ts'
import { getCompanySizeTier } from '../_shared/adaptive-keywords.ts'
import type { SalesNavResult, SearchLevel, LevelDetail } from '../_shared/cascade-search.ts'

interface CascadeSearchRequest {
  accountMapId: string
  companyId: string
  maxPerRole: number
}

interface PersonaResult {
  personaId: string
  personaName: string
  resultsCount: number
  searchLevel: SearchLevel
  queryUsed: string
  levelDetails: LevelDetail[]
  error?: string
}

const DELAY_BETWEEN_PERSONAS_MS = 1500

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

    const body: CascadeSearchRequest = await req.json()
    const { accountMapId, companyId, maxPerRole } = body

    if (!accountMapId || !companyId) {
      return errorResponse('accountMapId and companyId are required')
    }

    // Get Unipile LinkedIn account
    const unipileAccountId = await getUnipileAccountId(ctx.userId)
    if (!unipileAccountId) {
      return errorResponse('No LinkedIn account connected. Please connect your LinkedIn in Settings.')
    }

    const supabase = createSupabaseClient(authHeader)
    const unipile = createUnipileClient()

    // Load company
    const { data: company, error: cErr } = await supabase
      .from('account_map_companies')
      .select('id, company_name, company_size, industry, website, location')
      .eq('id', companyId)
      .eq('org_id', ctx.orgId)
      .single()

    if (cErr || !company) return errorResponse('Company not found', 404)

    // Load personas for this account map (ordered by priority)
    const { data: personas, error: pErr } = await supabase
      .from('buyer_personas')
      .select('id, name, title_keywords, seniority, description, role_in_buying_committee, priority, is_required, max_per_company, departments, title_keywords_by_tier, seniority_by_tier')
      .eq('account_map_id', accountMapId)
      .eq('org_id', ctx.orgId)
      .order('is_required', { ascending: false })
      .order('priority', { ascending: true })

    if (pErr || !personas || personas.length === 0) {
      return errorResponse('No buyer personas found for this account map', 404)
    }

    console.log(`Cascade search for ${company.company_name} (${personas.length} personas, max ${maxPerRole}/role)`)

    const foundProviderIds = new Set<string>()
    const personaResults: PersonaResult[] = []
    let totalFound = 0
    const tier = getCompanySizeTier(company)

    for (let i = 0; i < personas.length; i++) {
      const persona = personas[i]

      if (!persona.title_keywords || persona.title_keywords.length === 0) {
        personaResults.push({
          personaId: persona.id,
          personaName: persona.name,
          resultsCount: 0,
          searchLevel: 1,
          queryUsed: 'Skipped (no keywords)',
          levelDetails: [],
        })
        continue
      }

      try {
        const cascadeResult = await cascadeSearch({
          company,
          persona,
          unipile,
          accountId: unipileAccountId,
          maxResults: maxPerRole,
          excludeProviderIds: foundProviderIds,
        })

        // Track found provider IDs for cross-persona dedup
        for (const p of cascadeResult.prospects) {
          if (p.linkedinProviderId) foundProviderIds.add(p.linkedinProviderId)
        }

        // Save prospects to DB
        if (cascadeResult.prospects.length > 0) {
          const rows = cascadeResult.prospects.map((p: SalesNavResult) => ({
            account_map_id: accountMapId,
            company_id: companyId,
            owner_id: ctx.userId,
            org_id: ctx.orgId,
            first_name: p.firstName,
            last_name: p.lastName,
            title: p.title,
            company: p.company,
            linkedin_url: p.linkedinUrl,
            linkedin_provider_id: p.linkedinProviderId,
            headline: p.headline,
            location: p.location,
            source: 'sales_navigator',
            status: 'new',
            persona_id: persona.id,
            buying_role: persona.role_in_buying_committee || null,
            search_metadata: {
              tier,
              search_level: cascadeResult.level,
              query_used: cascadeResult.queryUsed,
              level_details: cascadeResult.levelDetails,
              persona_name: persona.name,
            },
          }))

          const { error: insertErr } = await supabase.from('prospects').insert(rows)
          if (insertErr) {
            console.error(`Failed to save prospects for persona ${persona.name}:`, insertErr)
          }
        }

        totalFound += cascadeResult.prospects.length

        personaResults.push({
          personaId: persona.id,
          personaName: persona.name,
          resultsCount: cascadeResult.prospects.length,
          searchLevel: cascadeResult.level,
          queryUsed: cascadeResult.queryUsed,
          levelDetails: cascadeResult.levelDetails,
        })

        console.log(`  ${persona.name}: ${cascadeResult.prospects.length} found (L${cascadeResult.level})`)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`  ${persona.name}: ERROR - ${errorMsg}`)

        personaResults.push({
          personaId: persona.id,
          personaName: persona.name,
          resultsCount: 0,
          searchLevel: 3,
          queryUsed: 'Error',
          levelDetails: [],
          error: errorMsg,
        })

        // On rate limit, wait longer
        if (errorMsg.includes('429') || errorMsg.includes('rate') || errorMsg.includes('Rate')) {
          console.warn(`Rate limit hit, cooling down 45s...`)
          await new Promise(r => setTimeout(r, 45000))
        }
      }

      // Delay between personas (skip after last one)
      if (i < personas.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_PERSONAS_MS))
      }
    }

    console.log(`Cascade search complete: ${totalFound} total for ${company.company_name}`)

    return jsonResponse({
      success: true,
      totalFound,
      companyName: company.company_name,
      personaResults,
    })
  } catch (error) {
    console.error('cascade-search-company error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
