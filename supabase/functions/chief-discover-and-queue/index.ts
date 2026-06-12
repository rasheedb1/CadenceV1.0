// chief-discover-and-queue
// =============================================================================
// Wrapper de discover-icp-companies + persiste resultados en icp_pipeline_queue.
// Lo llama el workflow weekly "ICP Long List Refill" o el agente Andrés vía
// call_skill('descubrir_empresas_y_encolar', { target_count }).
//
// Flujo:
// 1. Lee org_chief_settings → icp_profile_id, account_map_id, daily_target_companies
// 2. Lee icp_profiles.description + builder_data
// 3. Lee empresas excluidas (cooldown/blacklist/queue activa) via get_excluded_company_names_for_org
// 4. Invoca discover-icp-companies con icpDescription + excludedCompanies
// 5. Por cada empresa: upsert en account_map_companies + insert en icp_pipeline_queue
// 6. Return summary
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext, createSupabaseClient } from '../_shared/supabase.ts'

interface QueueRequest {
  /** Target empresas a encolar este run. Default: settings.daily_target_companies * 5 (buffer semanal) */
  target_count?: number
  /** Override del ICP description (raro — default usa el icp_profile linkeado en settings) */
  icp_description_override?: string
  /** Smoke test: valida settings + excluded list + retorna sin invocar discover (no cuesta $$) */
  dry_run?: boolean
  /** Service-role caller pasa ownerId + orgId explícito (cron / agent task) */
  ownerId?: string
  orgId?: string
}

interface DiscoveredCompany {
  company_name: string
  industry: string | null
  company_size: string | null
  website: string | null
  location: string | null
  description: string | null
  relevance_reason: string | null
  relevance_score: number
  fit_category: 'high' | 'medium' | 'low'
  score_breakdown?: Record<string, number>
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const body = (await req.json().catch(() => ({}))) as QueueRequest

    const auth = await getAuthContext(authHeader, { ownerId: body.ownerId, orgId: body.orgId })
    if (!auth) return errorResponse('Unauthorized', 401)

    const supabase = createSupabaseClient(authHeader)

    // ---------- 1. Settings + ICP profile ----------
    const { data: settings, error: sErr } = await supabase
      .from('org_chief_settings')
      .select('icp_profile_id, account_map_id, daily_target_companies, max_emails_per_company')
      .eq('org_id', auth.orgId)
      .single()

    if (sErr || !settings) {
      return errorResponse(
        `Chief pipeline no configurado para esta org. Crea el row en org_chief_settings primero.`,
        400
      )
    }
    if (!settings.icp_profile_id || !settings.account_map_id) {
      return errorResponse(
        `org_chief_settings tiene icp_profile_id o account_map_id en NULL. Linkear primero.`,
        400
      )
    }

    // ════════════════════════════════════════════════════════════════
    // BACK-PRESSURE CHECK (migrations 110 + 115)
    // Pause discovery if EITHER:
    //   - pending schedules > max_pending_schedules_back_pressure (default 200)
    //   - weekly DMs already used + pending DMs ≥ weekly DM cap (default 150)
    // ════════════════════════════════════════════════════════════════
    if (!body.dry_run) {
      const { data: bpData } = await supabase.rpc('should_pause_discovery', { p_org_id: auth.orgId })
      const bp = Array.isArray(bpData) ? bpData[0] : bpData
      if (bp?.should_pause) {
        console.log(`[chief-discover-and-queue] back-pressure: reason=${bp.reason} pending=${bp.pending_count}/${bp.threshold} weeklyDMs=${bp.weekly_dms_used}+${bp.pending_dm_schedules}/${bp.weekly_dm_cap} → skip discovery`)
        return jsonResponse({
          skipped: true,
          reason: bp.reason,
          pending_schedules: bp.pending_count,
          threshold: bp.threshold,
          weekly_dms_used: bp.weekly_dms_used,
          weekly_dm_cap: bp.weekly_dm_cap,
          pending_dm_schedules: bp.pending_dm_schedules,
          message: bp.reason === 'weekly_dm_cap_projection_exceeded'
            ? `Discovery paused: weekly LinkedIn DMs ${bp.weekly_dms_used} sent + ${bp.pending_dm_schedules} pending = ${bp.weekly_dms_used + bp.pending_dm_schedules}/${bp.weekly_dm_cap}. Adding more leads now would push over the LinkedIn weekly cap. Resumes Monday.`
            : `Discovery paused: ${bp.pending_count} schedules pending exceeds threshold ${bp.threshold}. Will retry next run.`,
        })
      }
    }

    // ════════════════════════════════════════════════════════════════
    // DYNAMIC TARGET (migration 116)
    // En vez de hard 5/día, calcular cuántas empresas caben dado el
    // presupuesto semanal de DMs (cap 150 - executed - pending). Cada lead
    // genera 2 DMs (Day 3 + Day 7); cada empresa rinde max_emails_per_company
    // leads en el peor caso.
    // ════════════════════════════════════════════════════════════════
    const { data: safeTargetData, error: stErr } = await supabase.rpc('compute_safe_discovery_target', {
      p_org_id: auth.orgId,
      p_explicit_request: body.target_count ?? null,
    })
    if (stErr) {
      console.error('compute_safe_discovery_target failed:', stErr)
    }
    const safeRow = Array.isArray(safeTargetData) ? safeTargetData[0] : safeTargetData
    const targetCount = safeRow?.safe_target ?? settings.daily_target_companies
    console.log(`[chief-discover-and-queue] dynamic target: ${targetCount} | ${safeRow?.reasoning ?? '(no rpc)'}`)

    if (targetCount === 0) {
      return jsonResponse({
        skipped: true,
        reason: 'no_dm_budget_remaining',
        target_count: 0,
        weekly_dm_cap: safeRow?.weekly_dm_cap,
        weekly_dms_used: safeRow?.weekly_dms_used,
        pending_dm_schedules: safeRow?.pending_dm_schedules,
        weekly_dm_budget_remaining: safeRow?.weekly_dm_budget_remaining,
        message: `Discovery skipped: weekly DM budget exhausted (cap ${safeRow?.weekly_dm_cap} − used ${safeRow?.weekly_dms_used} − pending ${safeRow?.pending_dm_schedules} = 0 budget). Resumes Monday.`,
      })
    }

    const { data: icp, error: icpErr } = await supabase
      .from('icp_profiles')
      .select('description, builder_data, name')
      .eq('id', settings.icp_profile_id)
      .single()

    if (icpErr || !icp) return errorResponse(`ICP profile ${settings.icp_profile_id} no encontrado`, 404)

    const icpDescription = body.icp_description_override || icp.description
    if (!icpDescription || icpDescription.trim().length < 50) {
      return errorResponse(`ICP description vacía o muy corta para "${icp.name}". Necesita al menos 50 chars.`, 400)
    }

    // ---------- 2. Excluded companies (split list strategy) ----------
    // Two RPCs:
    //   - get_excluded_company_names_for_org() → full list (~700 names) for SQL post-filter
    //   - get_excluded_company_names_for_llm(50) → top-50 by priority for LLM prompt
    // This keeps the prompt bounded while still filtering hundreds of names.
    const [fullExclusion, llmExclusion] = await Promise.all([
      supabase.rpc('get_excluded_company_names_for_org', { p_org_id: auth.orgId }),
      supabase.rpc('get_excluded_company_names_for_llm', { p_org_id: auth.orgId, p_limit: 50 }),
    ])
    if (fullExclusion.error) console.error('get_excluded_company_names_for_org failed:', fullExclusion.error)
    if (llmExclusion.error)  console.error('get_excluded_company_names_for_llm failed:', llmExclusion.error)
    const excludedCompanies: string[] = Array.isArray(fullExclusion.data) ? fullExclusion.data : []
    const excludedCompaniesForLlm: string[] = Array.isArray(llmExclusion.data) ? llmExclusion.data : []
    console.log(
      `Excluding ${excludedCompanies.length} companies total | LLM prompt sees top ${excludedCompaniesForLlm.length}`
    )

    // ---------- 2.5. Dry-run early return (smoke test) ----------
    if (body.dry_run) {
      return jsonResponse({
        dry_run: true,
        settings_ok: true,
        org_id: auth.orgId,
        icp_profile_id: settings.icp_profile_id,
        icp_profile_name: icp.name,
        icp_description_chars: icpDescription.length,
        account_map_id: settings.account_map_id,
        target_count: targetCount,
        dynamic_target_reasoning: safeRow?.reasoning,
        weekly_dm_cap: safeRow?.weekly_dm_cap,
        weekly_dms_used: safeRow?.weekly_dms_used,
        pending_dm_schedules: safeRow?.pending_dm_schedules,
        weekly_dm_budget_remaining: safeRow?.weekly_dm_budget_remaining,
        excluded_count_total: excludedCompanies.length,
        excluded_count_for_llm: excludedCompaniesForLlm.length,
        excluded_sample_llm: excludedCompaniesForLlm.slice(0, 10),
      })
    }

    // ---------- 3. Invoke discover-icp-companies ----------
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const discoverResp = await fetch(`${supabaseUrl}/functions/v1/discover-icp-companies`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        icpDescription,
        minCompanies: Math.max(targetCount, 10),
        maxCompanies: targetCount + 10,
        excludedCompaniesForLlm,        // top-50 → LLM prompt
        excludedCompaniesForFilter: excludedCompanies, // full list → post-filter
        owner_id: auth.userId,
        org_id: auth.orgId,
      }),
    })

    if (!discoverResp.ok) {
      const errText = await discoverResp.text()
      return errorResponse(`discover-icp-companies failed: ${discoverResp.status} ${errText}`, 502)
    }

    const discoverJson = await discoverResp.json()
    const companies: DiscoveredCompany[] = discoverJson.companies || []
    console.log(`Discovered ${companies.length} companies`)

    if (companies.length === 0) {
      return jsonResponse({
        discovered: 0,
        enqueued: 0,
        skipped: 0,
        message: 'No companies returned by discover-icp-companies',
      })
    }

    // ---------- 4. Persist: account_map_companies upsert + queue insert ----------
    let enqueued = 0
    let skippedDup = 0
    let failed = 0

    for (const comp of companies) {
      try {
        // Upsert account_map_companies — match by NORMALIZED name to dedupe
        // variants like "Delivery Hero" / "Delivery Hero, Inc" / "DELIVERY HERO".
        // Migration 132 added a UNIQUE INDEX on (account_map_id, normalize_company_name)
        // which protects at the DB level even if this lookup races.
        let companyId: string | null = null

        const { data: normMatchRows, error: matchErr } = await supabase.rpc(
          'find_account_map_company_by_norm',
          { p_account_map_id: settings.account_map_id, p_company_name: comp.company_name }
        )
        if (matchErr) {
          // Fallback to ilike if RPC not yet deployed (defense)
          console.warn(`find_account_map_company_by_norm RPC failed, falling back to ilike: ${matchErr.message}`)
        }
        const existing = Array.isArray(normMatchRows) && normMatchRows.length > 0
          ? normMatchRows[0]
          : (await supabase
              .from('account_map_companies')
              .select('id, pipeline_state')
              .eq('account_map_id', settings.account_map_id)
              .ilike('company_name', comp.company_name)
              .maybeSingle()).data

        if (existing) {
          companyId = existing.id
          // Si la empresa está en cooldown o blacklisted, skipear
          if (existing.pipeline_state === 'blacklisted' || existing.pipeline_state === 'cooldown') {
            skippedDup++
            continue
          }
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from('account_map_companies')
            .insert({
              account_map_id: settings.account_map_id,
              org_id: auth.orgId,
              owner_id: auth.userId,
              company_name: comp.company_name,
              industry: comp.industry,
              company_size: comp.company_size,
              website: comp.website,
              location: comp.location,
              description: comp.description,
              pipeline_state: 'available',
            })
            .select('id')
            .single()

          if (insErr || !inserted) {
            console.error(`Failed to insert ${comp.company_name}:`, insErr)
            failed++
            continue
          }
          companyId = inserted.id
        }

        // Insert into queue (UNIQUE partial index dedupes if already pending/processing)
        const { error: qErr } = await supabase
          .from('icp_pipeline_queue')
          .insert({
            org_id: auth.orgId,
            account_map_id: settings.account_map_id,
            company_id: companyId,
            relevance_score: comp.relevance_score,
            fit_category: comp.fit_category,
            score_breakdown: comp.score_breakdown || {},
            status: 'pending',
          })

        if (qErr) {
          // 23505 = unique violation (already in queue, expected)
          if ((qErr as { code?: string }).code === '23505') {
            skippedDup++
            continue
          }
          console.error(`Failed to enqueue ${comp.company_name}:`, qErr)
          failed++
          continue
        }

        // Mark account_map_companies as in_pipeline
        await supabase
          .from('account_map_companies')
          .update({ pipeline_state: 'in_pipeline', last_pipeline_processed_at: null })
          .eq('id', companyId)

        enqueued++
      } catch (err) {
        console.error(`Error processing company ${comp.company_name}:`, err)
        failed++
      }
    }

    return jsonResponse({
      success: true,
      discovered: companies.length,
      enqueued,
      skipped_duplicates: skippedDup,
      failed,
      icp_profile: icp.name,
      account_map_id: settings.account_map_id,
      target_count: targetCount,
      dynamic_target_reasoning: safeRow?.reasoning,
      weekly_dm_budget_remaining: safeRow?.weekly_dm_budget_remaining,
    })
  } catch (err) {
    console.error('chief-discover-and-queue error:', err)
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})
