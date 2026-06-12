// chief-process-company
// =============================================================================
// Toma una row de icp_pipeline_queue y la procesa end-to-end:
//   1. cascade-search-company (L1→L2→L3 todas las personas del ICP)
//   2. enrich-prospect en batches Apollo (cap 10)
//   3. Threshold check: si <min_emails → skip + cooldown 90d
//   4. Top max_emails priorizado por payments → promote a leads (dedup global)
//   5. Assign a cadencia + crear primera schedule
//   6. Update queue row + account_map_companies
//
// Invocado por:
//   - Workflow Daily Prospecting (action_agent_skill → delegar a Andrés)
//   - Manual trigger desde UI/Postman
//
// IMPORTANTE: en worst case puede tardar 4-5 min. Si Supabase corta el edge
// function en 150s, mover a background task pattern (agent_tasks_v2). V1 acepta
// el riesgo y revisa con telemetry.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext, createSupabaseClient, getUnipileAccountId, logActivity } from '../_shared/supabase.ts'
import { createUnipileClient } from '../_shared/unipile.ts'

interface ProcessRequest {
  queue_id: string
  ownerId?: string
  orgId?: string
  /** Override settings (testing only) */
  min_emails_override?: number
  max_emails_override?: number
  /** Testing safety: skip the schedules INSERT so process-queue won't fire any LinkedIn/email actions */
  skip_schedule?: boolean
}

interface Prospect {
  id: string
  first_name: string
  last_name: string
  email: string | null
  linkedin_url: string | null
  linkedin_provider_id: string | null
  title: string | null
  company: string | null
  buying_role: string | null
  persona_id: string | null
  enrichment_data: Record<string, unknown> | null
}

interface CadenceStep {
  id: string
  day_offset: number
  order_in_day: number
  step_type: string
  config_json: Record<string, unknown>
}

const APOLLO_BATCH = 10  // enrich-prospect cap per call

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const body = (await req.json().catch(() => ({}))) as ProcessRequest

    const auth = await getAuthContext(authHeader, { ownerId: body.ownerId, orgId: body.orgId })
    if (!auth) return errorResponse('Unauthorized', 401)

    if (!body.queue_id) return errorResponse('queue_id is required')

    const supabase = createSupabaseClient(authHeader)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const startedAt = new Date().toISOString()

    // =====================================================================
    // 1. Load queue row + settings + cadence first step
    // =====================================================================
    const { data: queueRow, error: qErr } = await supabase
      .from('icp_pipeline_queue')
      .select('id, org_id, account_map_id, company_id, status, attempted_count')
      .eq('id', body.queue_id)
      .eq('org_id', auth.orgId)
      .single()

    if (qErr || !queueRow) return errorResponse(`Queue row ${body.queue_id} not found`, 404)
    if (queueRow.status !== 'processing') {
      return errorResponse(`Queue row status='${queueRow.status}', expected 'processing'. Was claim_next_n_companies called?`, 400)
    }

    const { data: settings, error: sErr } = await supabase
      .from('org_chief_settings')
      .select('cadence_id, min_emails_per_company, max_emails_per_company, company_cooldown_days')
      .eq('org_id', auth.orgId)
      .single()

    if (sErr || !settings) return errorResponse('org_chief_settings not configured', 400)
    if (!settings.cadence_id) return errorResponse('settings.cadence_id is null. Create the Chief Outreach cadence first.', 400)

    const minEmails = body.min_emails_override ?? settings.min_emails_per_company
    const maxEmails = body.max_emails_override ?? settings.max_emails_per_company
    const cooldownDays = settings.company_cooldown_days

    const { data: companyRow, error: cErr } = await supabase
      .from('account_map_companies')
      .select('id, company_name, website')
      .eq('id', queueRow.company_id)
      .single()
    if (cErr || !companyRow) return errorResponse(`Company ${queueRow.company_id} not found`, 404)

    await logActivity({
      ownerId: auth.userId,
      orgId: auth.orgId,
      action: 'chief_process_company_started',
      status: 'ok',
      details: {
        queue_id: body.queue_id,
        account_map_company_id: queueRow.company_id,
        company_name: companyRow.company_name,
        min_emails: minEmails,
        max_emails: maxEmails,
      },
    }).catch(() => {})

    // ════════════════════════════════════════════════════════════════════
    // V12: SALESFORCE OPPORTUNITY GUARD (migration 129)
    // Skip companies that already have an open or closed-won opportunity
    // in Salesforce — protects other Yuno reps + ourselves from conflict.
    // Long cooldown (365d) since SF state changes infrequently.
    // ════════════════════════════════════════════════════════════════════
    try {
      const { data: sfData } = await supabase.rpc('check_sf_opportunity_conflict', {
        p_org_id: auth.orgId,
        p_company_name: companyRow.company_name,
      })
      const sfConflict = Array.isArray(sfData) ? sfData[0] : sfData
      if (sfConflict?.has_conflict) {
        const reason = `existing_sf_${sfConflict.conflict_type}:${sfConflict.matched_account_name}_${sfConflict.matched_opp_stage || 'unknown'}`
        console.log(`[${companyRow.company_name}] SF conflict detected: ${reason} — skipping (long cooldown 365d)`)
        await markSkipped(supabase, body.queue_id, queueRow.company_id, reason, 365)
        await logActivity({
          ownerId: auth.userId,
          orgId: auth.orgId,
          action: 'chief_process_company_skipped',
          status: 'ok',
          details: {
            company_name: companyRow.company_name,
            skip_reason: 'existing_sf_opportunity',
            sf_conflict_type: sfConflict.conflict_type,
            sf_account_name: sfConflict.matched_account_name,
          },
        }).catch(() => {})
        return jsonResponse({
          success: true,
          status: 'skipped',
          skip_reason: 'existing_sf_opportunity',
          sf_conflict_type: sfConflict.conflict_type,
          sf_account_name: sfConflict.matched_account_name,
          sf_opp_name: sfConflict.matched_opp_name,
          sf_opp_stage: sfConflict.matched_opp_stage,
          sf_opp_count: sfConflict.opp_count,
          cooldown_days: 365,
        })
      }
      console.log(`[${companyRow.company_name}] SF check: no conflict, proceeding`)
    } catch (sfErr) {
      console.warn(`[${companyRow.company_name}] SF check failed (non-fatal, proceeding):`, (sfErr as Error).message)
    }

    // First step of the cadence (sorted by day_offset, order_in_day)
    const { data: firstStepRows } = await supabase
      .from('cadence_steps')
      .select('id, day_offset, order_in_day, step_type, config_json')
      .eq('cadence_id', settings.cadence_id)
      .order('day_offset', { ascending: true })
      .order('order_in_day', { ascending: true })
      .limit(1)
    const firstStep = firstStepRows?.[0] as CadenceStep | undefined
    if (!firstStep) return errorResponse(`Cadence ${settings.cadence_id} has no steps`, 400)

    // =====================================================================
    // 2. Cascade-search en 2 pases (PN9 algoritmo iterativo)
    //    Pase A: core required priorities [1,2,3,4]  → ~4 personas, ~60-90s
    //    Pase B: adyacentes priority [5]             → solo si Pase A < min_emails
    // Esto reparte el trabajo para no exceder 150s timeout en empresas grandes.
    // =====================================================================
    /**
     * Llama cascade-search con timeout corto. Si el response timeoutea (cascade-search a veces
     * tarda >60s en post-processing), igual los prospects ya se crearon en DB durante la búsqueda.
     * Devolvemos el delta de prospects nuevos en lugar del totalFound del response.
     */
    const callCascade = async (priorities: number[], hardTimeoutMs = 75_000): Promise<number> => {
      // Snapshot de count antes de la llamada para calcular delta
      const { count: beforeCount } = await supabase
        .from('prospects')
        .select('id', { count: 'exact', head: true })
        .eq('account_map_id', queueRow.account_map_id)
        .eq('company_id', queueRow.company_id)

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), hardTimeoutMs)

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/cascade-search-company`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountMapId: queueRow.account_map_id,
            companyId: queueRow.company_id,
            maxPerRole: Math.ceil(maxEmails / 4) + 2,
            personaPriorities: priorities,
            ownerId: auth.userId,
            orgId: auth.orgId,
          }),
          signal: controller.signal,
        })
        clearTimeout(timer)

        if (resp.ok) {
          const json = await resp.json()
          return (json.totalFound as number) || 0
        }
        // Non-OK: log but continue — los prospects ya pueden estar en DB
        const errText = await resp.text().catch(() => '')
        console.warn(`cascade-search priorities=${priorities.join(',')} returned ${resp.status}: ${errText.slice(0, 100)}`)
      } catch (err) {
        clearTimeout(timer)
        if ((err as Error).name === 'AbortError') {
          console.warn(`cascade-search priorities=${priorities.join(',')} aborted after ${hardTimeoutMs}ms — checking DB for partial prospects`)
        } else {
          console.warn(`cascade-search priorities=${priorities.join(',')} threw: ${(err as Error).message}`)
        }
      }

      // Calcular delta — los prospects que aparecieron durante la cascade call
      const { count: afterCount } = await supabase
        .from('prospects')
        .select('id', { count: 'exact', head: true })
        .eq('account_map_id', queueRow.account_map_id)
        .eq('company_id', queueRow.company_id)
      const delta = (afterCount || 0) - (beforeCount || 0)
      console.log(`cascade-search delta (DB): ${delta} new prospects`)
      return delta
    }

    const countEmails = async (): Promise<number> => {
      const { count } = await supabase
        .from('prospects')
        .select('id', { count: 'exact', head: true })
        .eq('account_map_id', queueRow.account_map_id)
        .eq('company_id', queueRow.company_id)
        .not('email', 'is', null)
        .neq('email', '')
      return count || 0
    }

    const enrichBatch = async (prospectIds: string[]): Promise<void> => {
      for (let i = 0; i < prospectIds.length; i += APOLLO_BATCH) {
        const batch = prospectIds.slice(i, i + APOLLO_BATCH)
        const enrichResp = await fetch(`${supabaseUrl}/functions/v1/enrich-prospect`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prospectIds: batch, ownerId: auth.userId, orgId: auth.orgId }),
        })
        if (!enrichResp.ok) {
          console.warn(`Apollo batch ${i / APOLLO_BATCH + 1} failed: ${enrichResp.status}`)
        }
      }
    }

    const queryProspectsToEnrich = async (): Promise<string[]> => {
      const { data } = await supabase
        .from('prospects')
        .select('id, email, enrichment_data, status')
        .eq('account_map_id', queueRow.account_map_id)
        .eq('company_id', queueRow.company_id)
        .is('email', null)
      const list = (data || []) as Array<{ id: string; email: string | null; enrichment_data: Record<string, unknown> | null; status: string | null }>
      return list.filter(p => {
        if (p.enrichment_data?.apollo_email) return false  // already enriched
        // V10: only enrich validator-approved (filter out disqualified_by_validator)
        if (p.status === 'disqualified_by_validator') return false
        // V12: validator score must be >= 4 (was 6) — admits champions tier
        const score = (p.enrichment_data as Record<string, unknown> | null)?.validator_score as number | undefined
        if (score !== undefined && score < 4) return false
        return true
      }).map(p => p.id)
    }

    let totalCascadeFound = 0
    // V11: 2 pasadas con re-cascade adyacente si la primera no rinde 1 qualified+enriched.
    // Pass A: priorities [1,2,3,4] = core (Payments/CFO/Risk/Product/Ecom/Eng/Manager)
    // Pass B: priorities [5] = adjacent (would be added if user wants — currently we don't have
    //         priority-5 personas after migration 127 cleanup, but kept for future)
    // The loop now exits as soon as we have ≥1 qualified prospect with email.
    const passesPlan: number[][] = [[1, 2, 3, 4], [5]]
    let lastPassWasAdjacent = false
    const MIN_QUALIFIED_WITH_EMAIL = 1  // V11: at least 1 qualified+enriched is enough

    // Hard budget timer per pass — pass A gets 70s, pass B gets 50s (total <150s edge limit)
    const PASS_BUDGETS_MS = [70_000, 50_000]
    const startMs = Date.now()

    try {
      for (let passIdx = 0; passIdx < passesPlan.length; passIdx++) {
        const priorities = passesPlan[passIdx]
        const passBudget = PASS_BUDGETS_MS[passIdx] || 50_000
        const passLabel = priorities.includes(5) ? 'B (adyacentes)' : `A priorities=[${priorities.join(',')}]`
        const elapsed = Date.now() - startMs
        const totalBudget = PASS_BUDGETS_MS.slice(0, passIdx + 1).reduce((a, b) => a + b, 0)
        if (elapsed > totalBudget) {
          console.log(`[${companyRow.company_name}] cascade budget exhausted at ${elapsed}ms (limit ${totalBudget}ms), skipping remaining passes`)
          break
        }
        console.log(`[${companyRow.company_name}] Pase ${passLabel} (elapsed=${elapsed}ms, pass budget ${passBudget}ms)`)

        const found = await callCascade(priorities, passBudget)
        totalCascadeFound += found
        console.log(`[${companyRow.company_name}] Pase ${passLabel}: ${found} prospects (acumulado ${totalCascadeFound})`)

        // Drenar background work de cascade-search-company (post-processing puede seguir 10-20s después del abort)
        await new Promise(resolve => setTimeout(resolve, 5000))

        // ════════════════════════════════════════════════════════════════
        // V10: VALIDATOR GATE — score prospects BEFORE Apollo enrich.
        // Filters out wrong-persona false positives (Strategy/Ops/Brand/etc).
        // Only validated prospects (score >= 6) go to Apollo (cost saving + quality).
        // ════════════════════════════════════════════════════════════════
        try {
          const validateResp = await fetch(`${supabaseUrl}/functions/v1/chief-validate-prospects`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              company_id: queueRow.company_id,
              account_map_id: queueRow.account_map_id,
              ownerId: auth.userId,
              orgId: auth.orgId,
              min_qualifying_score: 4,  // V12: was 6 (decision_maker + strong_influencer only). 4 admits champions (Product Mgr Payments, Payments Ops Mgr, Financial Lead) per user request 2026-05-09.
            }),
          })
          if (validateResp.ok) {
            const valData = await validateResp.json()
            console.log(`[${companyRow.company_name}] validator: ${valData.qualified_count}/${valData.validated_count} qualified (DM:${valData.summary?.decision_makers}, SI:${valData.summary?.strong_influencers}, CH:${valData.summary?.champions}, WP:${valData.summary?.wrong_persons})`)
          } else {
            console.warn(`[${companyRow.company_name}] validator failed (non-fatal):`, await validateResp.text().catch(() => ''))
          }
        } catch (vErr) {
          console.warn(`[${companyRow.company_name}] validator error (non-fatal):`, (vErr as Error).message)
        }

        // V10: queryProspectsToEnrich now ONLY returns validator-approved prospects
        const toEnrichIds = await queryProspectsToEnrich()
        if (toEnrichIds.length > 0) {
          console.log(`[${companyRow.company_name}] Apollo enrich ${toEnrichIds.length} VALIDATED prospects...`)
          await enrichBatch(toEnrichIds)
        } else {
          console.log(`[${companyRow.company_name}] 0 prospects passed validator — skipping Apollo enrich (saves credits)`)
        }

        // V11: count QUALIFIED prospects with email (validator-approved + Apollo-enriched)
        const { data: qualWithEmail } = await supabase
          .from('prospects')
          .select('id, status, enrichment_data')
          .eq('account_map_id', queueRow.account_map_id)
          .eq('company_id', queueRow.company_id)
          .not('email', 'is', null)
          .neq('email', '')
        const qualifiedWithEmailCount = (qualWithEmail || []).filter(p => {
          if (p.status === 'disqualified_by_validator') return false
          const score = (p.enrichment_data as Record<string, unknown> | null)?.validator_score as number | undefined
          // V11c: STRICT — unscored prospects are NOT counted as qualified.
          // The previous "assume valid" behavior masked validator truncation bugs:
          // when Sonnet truncated mid-array, unscored prospects inflated this
          // count, the loop broke early, and the V11b re-validation also failed
          // silently → only 1 lead promoted from 17 enriched (Deliveroo case).
          // Now: unscored requires explicit re-validation before counting.
          if (score === undefined) return false
          return score >= 4  // V12: was 6, lowered to admit champions tier
        }).length

        const emailCount = await countEmails()
        console.log(`[${companyRow.company_name}] Pase ${passLabel}: emails total=${emailCount}, qualified+enriched=${qualifiedWithEmailCount} (need ≥${MIN_QUALIFIED_WITH_EMAIL})`)

        if (qualifiedWithEmailCount >= MIN_QUALIFIED_WITH_EMAIL) {
          console.log(`[${companyRow.company_name}] ✓ at least ${MIN_QUALIFIED_WITH_EMAIL} qualified+enriched found — done at Pase ${passLabel}`)
          break
        }
        lastPassWasAdjacent = priorities.includes(5)
        console.log(`[${companyRow.company_name}] only ${qualifiedWithEmailCount} qualified+enriched — continuing to next pass for re-cascade`)
      }
    } catch (err) {
      await markFailed(supabase, body.queue_id, (err as Error).message)
      return errorResponse((err as Error).message, 502)
    }

    if (totalCascadeFound === 0) {
      await markSkipped(supabase, body.queue_id, queueRow.company_id, 'no_prospects_found', cooldownDays)
      return jsonResponse({ success: true, status: 'skipped', skip_reason: 'no_prospects_found', prospects_found: 0 })
    }

    const cascadeFound = totalCascadeFound

    // =====================================================================
    // 5. Re-query prospects with email — V11: filter to QUALIFIED only
    // =====================================================================
    const { data: enriched } = await supabase
      .from('prospects')
      .select('id, first_name, last_name, email, linkedin_url, linkedin_provider_id, title, company, buying_role, persona_id, enrichment_data, status')
      .eq('account_map_id', queueRow.account_map_id)
      .eq('company_id', queueRow.company_id)
      .not('email', 'is', null)
      .neq('email', '')
    const allWithEmail = (enriched || []) as Prospect[]

    // V11b: STRICT — only promote validator-approved (score >= 6).
    // Pre-existing prospects without validator_score are RE-VALIDATED here
    // (not auto-passed) to prevent Strategy/Operations bypass.
    const unscoredIds = allWithEmail
      .filter(p => {
        const score = (p.enrichment_data as Record<string, unknown> | null)?.validator_score as number | undefined
        return score === undefined && (p as Record<string, unknown>).status !== 'disqualified_by_validator'
      })
      .map(p => p.id)

    if (unscoredIds.length > 0) {
      console.log(`[${companyRow.company_name}] re-running validator on ${unscoredIds.length} pre-existing unscored prospects`)
      try {
        // Force validator to score these even though they have email
        await fetch(`${supabaseUrl}/functions/v1/chief-validate-prospects`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_id: queueRow.company_id,
            account_map_id: queueRow.account_map_id,
            ownerId: auth.userId,
            orgId: auth.orgId,
            min_qualifying_score: 6,
            include_enriched: true,  // V11b: force scoring of pre-enriched
          }),
        })
        // Re-fetch after validator update
        const { data: rescored } = await supabase
          .from('prospects')
          .select('id, first_name, last_name, email, linkedin_url, linkedin_provider_id, title, company, buying_role, persona_id, enrichment_data, status')
          .eq('account_map_id', queueRow.account_map_id)
          .eq('company_id', queueRow.company_id)
          .not('email', 'is', null)
          .neq('email', '')
        if (rescored) allWithEmail.length = 0, allWithEmail.push(...(rescored as Prospect[]))
      } catch (vErr) {
        console.warn(`[${companyRow.company_name}] re-validation error (non-fatal):`, (vErr as Error).message)
      }
    }

    const validatorPassed = allWithEmail.filter(p => {
      if ((p as Record<string, unknown>).status === 'disqualified_by_validator') return false
      const score = (p.enrichment_data as Record<string, unknown> | null)?.validator_score as number | undefined
      if (score === undefined) return false
      return score >= 4  // V12: was 6, lowered to admit champions tier
    })

    // M2: email-domain validation. Apollo sometimes returns a prospect's PRIOR
    // employer email (e.g. "manuel@17sigma.com" for a Ualá employee). Filter to
    // emails whose domain matches the company website domain (or a known
    // subsidiary). Domain extracted from companyRow.website.
    const companyDomain = extractRootDomain(companyRow.website)
    const SUBSIDIARY_ALLOWLIST: Record<string, string[]> = {
      'deliveryhero.com': ['foodpanda.com', 'foodpanda.ph', 'foodpanda.sg', 'foodora.com', 'glovoapp.com'],
      'uber.com': ['ubereats.com', 'postmates.com'],
    }
    const allowedDomains = new Set<string>()
    if (companyDomain) {
      allowedDomains.add(companyDomain)
      for (const sub of SUBSIDIARY_ALLOWLIST[companyDomain] || []) allowedDomains.add(sub)
    }
    const withEmail = validatorPassed.filter(p => {
      if (!companyDomain) return true  // no website on company → can't validate, allow
      const email = (p as { email?: string }).email
      if (!email) return false
      const emailDomain = email.split('@')[1]?.toLowerCase()
      if (!emailDomain) return false
      // accept exact match or subdomain match (e.g. mail.revolut.com → revolut.com)
      const rootDomain = extractRootDomain('https://' + emailDomain)
      const matches = allowedDomains.has(rootDomain || emailDomain) || Array.from(allowedDomains).some(d => emailDomain.endsWith('.' + d))
      return matches
    })
    const domainFilteredCount = validatorPassed.length - withEmail.length
    if (domainFilteredCount > 0) {
      const dropped = validatorPassed.filter(p => !withEmail.includes(p)).map(p => `${p.first_name} ${p.last_name} <${(p as { email?: string }).email}>`)
      console.log(`[${companyRow.company_name}] M2 email-domain filter dropped ${domainFilteredCount} (company=${companyDomain}): ${dropped.join('; ')}`)
    }
    console.log(`[${companyRow.company_name}] ${withEmail.length} qualified+enriched (of ${allWithEmail.length} total with email — strict validator + email-domain gate)`)

    // ════════════════════════════════════════════════════════════════════
    // V13: LinkedIn current-employer verifier (live Unipile profile check)
    // After M2 domain check, query LinkedIn LIVE for each prospect to confirm
    // their CURRENT employer matches the target company. Catches cases where:
    //   - Apollo email is stale (person changed jobs but old email still routable)
    //   - Cascade-search matched a wrong-person variant
    //   - Person leased contractor email but works at different company
    //
    // Behavior:
    //   - passed=true → keep
    //   - passed=false → DROP + mark prospects.status='wrong_company'
    //   - passed=undefined (verifier failed for technical reasons) → KEEP
    //     (don't lose good leads to API failures; M2 domain check is fallback)
    //
    // Cost: 1 Unipile call per prospect (parallelized → ~2-5s for 10 prospects).
    // ════════════════════════════════════════════════════════════════════
    const verifyStartMs = Date.now()
    const unipileAccountId = await getUnipileAccountId(auth.userId)
    const targetNorm = normalizeCompanyForCompare(companyRow.company_name)
    // V13b: throttle Unipile to avoid 429 — batches of 5 in parallel, 300ms gap.
    // For typical 10-prospect run that's ~600ms total; for 50-prospect mega-companies
    // it's ~3s. Worst case stays comfortably under per-company budget.
    const VERIFIER_BATCH = 5
    const VERIFIER_GAP_MS = 300
    const verifyOne = async (p: typeof withEmail[number]): Promise<EmployerVerifyResult> => {
      const slug = extractLinkedInSlug(p.linkedin_url)
      const identifier = p.linkedin_provider_id || slug
      if (!identifier) {
        return { id: p.id, passed: undefined, reason: 'no_li_identifier', observed: null, expected: companyRow.company_name }
      }
      try {
        const unipile = createUnipileClient()
        const profile = await unipile.getProfile(unipileAccountId!, identifier)
        if (!profile.success || !profile.data) {
          return { id: p.id, passed: undefined, reason: 'unipile_lookup_failed', observed: null, expected: companyRow.company_name }
        }
        const data = profile.data as Record<string, unknown>
        const observed = ((data.current_company as string) || parseCompanyFromHeadline(data.headline as string) || '').trim()
        if (!observed) {
          return { id: p.id, passed: undefined, reason: 'no_company_in_profile', observed: (data.headline as string) || null, expected: companyRow.company_name }
        }
        const observedNorm = normalizeCompanyForCompare(observed)
        const matches = observedNorm === targetNorm
          || observedNorm.includes(targetNorm)
          || targetNorm.includes(observedNorm)
        return { id: p.id, passed: matches, reason: matches ? 'match' : 'mismatch', observed, expected: companyRow.company_name }
      } catch (err) {
        return { id: p.id, passed: undefined, reason: `verify_error:${(err as Error).message?.slice(0, 60)}`, observed: null, expected: companyRow.company_name }
      }
    }
    let verifierResults: EmployerVerifyResult[] = []
    if (!unipileAccountId) {
      console.warn(`[${companyRow.company_name}] V13 verifier SKIPPED — no Unipile account for owner ${auth.userId}`)
    } else {
      for (let i = 0; i < withEmail.length; i += VERIFIER_BATCH) {
        const chunk = withEmail.slice(i, i + VERIFIER_BATCH)
        const chunkResults = await Promise.all(chunk.map(verifyOne))
        verifierResults.push(...chunkResults)
        if (i + VERIFIER_BATCH < withEmail.length) {
          await new Promise(r => setTimeout(r, VERIFIER_GAP_MS))
        }
      }
    }

    const verifierFailedIds = new Set(verifierResults.filter(r => r.passed === false).map(r => r.id))
    const verifierUnknownCount = verifierResults.filter(r => r.passed === undefined).length

    if (verifierFailedIds.size > 0) {
      const dropped = verifierResults.filter(r => r.passed === false)
        .map(r => `${r.id.slice(0, 8)} expected="${r.expected}" observed="${r.observed}"`)
      console.log(`[${companyRow.company_name}] V13 employer-verifier DROPPED ${verifierFailedIds.size}: ${dropped.join(' | ')}`)
      // Mark in DB so future runs skip them
      await Promise.all(
        Array.from(verifierFailedIds).map(id =>
          supabase.from('prospects').update({ status: 'wrong_company' }).eq('id', id)
        )
      )
    }

    const verifiedWithEmail = withEmail.filter(p => !verifierFailedIds.has(p.id))
    const verifyMs = Date.now() - verifyStartMs
    console.log(`[${companyRow.company_name}] V13 verifier: ${verifiedWithEmail.length}/${withEmail.length} passed live LI check (unknown=${verifierUnknownCount} kept) in ${verifyMs}ms`)

    // From this point on use verifiedWithEmail instead of withEmail
    const finalWithEmail = verifiedWithEmail

    const emailsByRole: Record<string, number> = {}
    for (const p of finalWithEmail) {
      const role = p.buying_role || 'unknown'
      emailsByRole[role] = (emailsByRole[role] || 0) + 1
    }

    // E1: skip only if ZERO qualified+enriched+verified. Use SHORT cooldown (30d, not
    // settings.company_cooldown_days=90d) because:
    //   - Apollo refreshes its DB → may have new emails next month
    //   - Cascade-search may surface different prospects in next attempt
    //   - The batch processor immediately claims another company, so the
    //     daily target doesn't suffer.
    // 30d also distinguishes this from "successful processing" cooldown (90d)
    // and SF conflict cooldown (365d).
    const NO_QUALIFIED_COOLDOWN_DAYS = 30
    if (finalWithEmail.length < MIN_QUALIFIED_WITH_EMAIL) {
      const skipReason = `no_qualified_buyers_with_email:${finalWithEmail.length}_final_of_${allWithEmail.length}_with_email_${domainFilteredCount}_domain_${verifierFailedIds.size}_wrong_company`
      await markSkipped(
        supabase,
        body.queue_id,
        queueRow.company_id,
        skipReason,
        NO_QUALIFIED_COOLDOWN_DAYS,
        emailsByRole
      )
      return jsonResponse({
        success: true,
        status: 'skipped',
        skip_reason: 'no_qualified_buyers_with_email',
        prospects_found: cascadeFound,
        emails_found_total: allWithEmail.length,
        emails_found_qualified: finalWithEmail.length,
        domain_dropped: domainFilteredCount,
        wrong_company_dropped: verifierFailedIds.size,
        min_required: MIN_QUALIFIED_WITH_EMAIL,
        emails_by_role: emailsByRole,
      })
    }

    // =====================================================================
    // 6. Top maxEmails priorizado por persona priority (payments primero)
    // =====================================================================
    // Get persona priorities for sorting
    const personaIds = Array.from(new Set(finalWithEmail.map(p => p.persona_id).filter((x): x is string => Boolean(x))))
    const { data: personasRows } = await supabase
      .from('buyer_personas')
      .select('id, priority')
      .in('id', personaIds.length > 0 ? personaIds : ['00000000-0000-0000-0000-000000000000'])
    const personaPriority = new Map<string, number>()
    for (const p of personasRows || []) personaPriority.set(p.id, p.priority || 99)

    // V11: sort by validator_score DESC first (best buyers go first), tie-break by persona priority
    const sorted = [...finalWithEmail].sort((a, b) => {
      const aScore = ((a.enrichment_data as Record<string, unknown> | null)?.validator_score as number) ?? 5
      const bScore = ((b.enrichment_data as Record<string, unknown> | null)?.validator_score as number) ?? 5
      if (bScore !== aScore) return bScore - aScore  // higher validator score first
      const ap = personaPriority.get(a.persona_id || '') ?? 99
      const bp = personaPriority.get(b.persona_id || '') ?? 99
      return ap - bp
    })
    const selected = sorted.slice(0, maxEmails)
    const scoreSummary = selected.map(p => {
      const s = (p.enrichment_data as Record<string, unknown> | null)?.validator_score as number | undefined
      return `${(p.first_name || '').slice(0,1)}${(p.last_name || '').slice(0,3)}(${s ?? 'N/A'})`
    }).join(', ')
    console.log(`[${companyRow.company_name}] selected top ${selected.length}/${finalWithEmail.length} for cadencia: [${scoreSummary}]`)

    // =====================================================================
    // 7. Promote to leads (dedup global by email + linkedin_url)
    // =====================================================================
    const cadenceLeadIds: string[] = []
    let promoted = 0
    let skippedDup = 0

    for (const prospect of selected) {
      try {
        // Dedup: existing lead with same email OR linkedin_url in this org
        let leadId: string | null = null
        const dedupQueries = []
        if (prospect.email) dedupQueries.push(`email.eq.${prospect.email}`)
        if (prospect.linkedin_url) dedupQueries.push(`linkedin_url.eq.${prospect.linkedin_url}`)

        if (dedupQueries.length > 0) {
          const { data: existingLead } = await supabase
            .from('leads')
            .select('id')
            .eq('org_id', auth.orgId)
            .or(dedupQueries.join(','))
            .limit(1)
            .maybeSingle()
          if (existingLead) {
            leadId = existingLead.id
            skippedDup++
          }
        }

        if (!leadId) {
          // Create new lead — set account_map_company_id FK for research cache (migration 117b)
          const { data: newLead, error: leadErr } = await supabase
            .from('leads')
            .insert({
              owner_id: auth.userId,
              org_id: auth.orgId,
              first_name: prospect.first_name,
              last_name: prospect.last_name,
              email: prospect.email,
              linkedin_url: prospect.linkedin_url,
              company: prospect.company || companyRow.company_name,
              account_map_company_id: queueRow.company_id,
              title: prospect.title,
              timezone: 'America/New_York',
            })
            .select('id')
            .single()
          if (leadErr || !newLead) {
            console.warn(`Failed to create lead for prospect ${prospect.id}:`, leadErr)
            continue
          }
          leadId = newLead.id
          promoted++

          // Mark prospect as promoted
          await supabase
            .from('prospects')
            .update({ status: 'promoted', promoted_lead_id: leadId })
            .eq('id', prospect.id)
        }

        // ============================================================
        // 8. Assign to cadence_leads + create first schedule
        // ============================================================
        const { data: cadenceLeadRow } = await supabase
          .from('cadence_leads')
          .upsert(
            {
              lead_id: leadId,
              cadence_id: settings.cadence_id,
              owner_id: auth.userId,
              org_id: auth.orgId,
              current_step_id: firstStep.id,
              status: 'active',
            },
            { onConflict: 'lead_id,cadence_id' }
          )
          .select('id')
          .single()

        // Create lead_step_instance for first step
        await supabase.from('lead_step_instances').upsert(
          {
            cadence_id: settings.cadence_id,
            cadence_step_id: firstStep.id,
            lead_id: leadId,
            owner_id: auth.userId,
            status: 'pending',
          },
          { onConflict: 'cadence_step_id,lead_id' }
        )

        // Create first schedule (jitter: stagger by 30s per lead to avoid LinkedIn rate spike)
        // SAFETY: skip if testing mode (no schedules → process-queue won't fire any action)
        if (!body.skip_schedule) {
          const scheduledAt = new Date(Date.now() + cadenceLeadIds.length * 30_000 + 60_000).toISOString()
          await supabase.from('schedules').insert({
            cadence_id: settings.cadence_id,
            cadence_step_id: firstStep.id,
            lead_id: leadId,
            owner_id: auth.userId,
            org_id: auth.orgId,
            scheduled_at: scheduledAt,
            status: 'scheduled',
          })
        }

        if (cadenceLeadRow?.id) cadenceLeadIds.push(cadenceLeadRow.id)
      } catch (err) {
        console.error(`Error promoting prospect ${prospect.id}:`, err)
      }
    }

    // =====================================================================
    // 9. Mark queue done + update company state
    // =====================================================================
    await supabase
      .from('icp_pipeline_queue')
      .update({
        status: 'done',
        processed_at: new Date().toISOString(),
        discovered_emails_by_role: emailsByRole,
        cadence_lead_ids: cadenceLeadIds,
      })
      .eq('id', body.queue_id)

    // Set 90-day cooldown post-done so next discovery cycle excludes this
    // company. Without this, get_excluded_company_names_for_org wouldn't
    // know to skip it and the LLM could re-propose it next run (caused the
    // iFood double-processing on 2026-05-09).
    const cooldownUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('account_map_companies')
      .update({
        pipeline_state: 'cooldown',
        cooldown_until: cooldownUntil,
        last_pipeline_processed_at: new Date().toISOString(),
      })
      .eq('id', queueRow.company_id)

    // ════════════════════════════════════════════════════════════════════
    // 10. Fire-and-forget deck preparation (V14)
    // Trigger ss-deck + sdr-bc generation in background. URLs land on the
    // amc row within ~30-60s. By the time Day 5 cadence step fires (5
    // business days later), URLs are guaranteed ready. If generation fails
    // catastrophically, prompts skip the deck CTA — degrades silently.
    // ════════════════════════════════════════════════════════════════════
    if (promoted > 0) {
      // Don't await — let it run async. Edge function will continue
      // processing in its own runtime even after we return.
      fetch(`${supabaseUrl}/functions/v1/chief-prepare-decks-for-company`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_map_company_id: queueRow.company_id,
          ownerId: auth.userId,
          orgId: auth.orgId,
        }),
      }).catch(err => {
        // Non-fatal — log but don't surface to caller. Decks will be
        // regenerated on demand via a re-trigger if needed.
        console.warn(`[${companyRow.company_name}] chief-prepare-decks fire-and-forget failed (non-fatal):`, (err as Error).message)
      })
      console.log(`[${companyRow.company_name}] V14 deck prep triggered (background)`)
      await logActivity({
        ownerId: auth.userId,
        orgId: auth.orgId,
        action: 'chief_decks_prep_triggered',
        status: 'ok',
        details: {
          account_map_company_id: queueRow.company_id,
          company_name: companyRow.company_name,
          leads_promoted: promoted,
        },
      }).catch(() => {})
    }

    await logActivity({
      ownerId: auth.userId,
      orgId: auth.orgId,
      action: 'chief_process_company_completed',
      status: 'ok',
      details: {
        company_name: companyRow.company_name,
        prospects_found: cascadeFound,
        emails_found: finalWithEmail.length,
        leads_promoted: promoted,
        leads_dedup_skipped: skippedDup,
      },
    }).catch(() => {})

    return jsonResponse({
      success: true,
      status: 'done',
      company: companyRow.company_name,
      prospects_found: cascadeFound,
      emails_found: finalWithEmail.length,
      emails_total_with_email: allWithEmail.length,
      domain_dropped: domainFilteredCount,
      wrong_company_dropped: verifierFailedIds.size,
      emails_by_role: emailsByRole,
      leads_promoted: promoted,
      leads_dedup_skipped: skippedDup,
      cadence_lead_ids: cadenceLeadIds,
    })
  } catch (err) {
    console.error('chief-process-company error:', err)
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract root domain from a website URL or bare domain.
 * "https://www.deliveryhero.com/about" → "deliveryhero.com"
 * "uala.com.ar" → "uala.com.ar"
 * "https://mail.revolut.com" → "revolut.com"
 * Returns null if unparseable.
 */

// V13 employer-verifier types + helpers
interface EmployerVerifyResult {
  id: string
  passed: boolean | undefined  // true=match, false=mismatch, undefined=couldn't verify
  reason: string
  observed: string | null
  expected: string
}

/**
 * Extract LinkedIn slug from URL.
 * "https://www.linkedin.com/in/chad-ridgway-ctp-mba-a9856319/" → "chad-ridgway-ctp-mba-a9856319"
 * "linkedin.com/in/john-doe" → "john-doe"
 * Returns null for unparseable URLs.
 */
function extractLinkedInSlug(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/linkedin\.com\/in\/([^\/?#]+)/i)
  return m ? m[1] : null
}

/**
 * Parse company from LinkedIn headline like "Director, Payments at Disney"
 * Returns the substring after " at " or null.
 */
function parseCompanyFromHeadline(headline: string | null | undefined): string | null {
  if (!headline) return null
  // Common patterns: "X at Y", "X | Y", "X @ Y"
  const atMatch = headline.match(/\sat\s+(.+)$/i)
  if (atMatch) return atMatch[1].trim().split(/[\|·•]/)[0].trim()
  return null
}

/**
 * Aggressive normalize for company-name comparison.
 * Catches naming variants: "Free Now" / "FREENOW" / "Free-Now" / "Freenow Group"
 * by lowercasing, stripping suffixes, then collapsing whitespace + punctuation.
 *
 * Examples:
 *   "Free Now"           → "freenow"
 *   "FREENOW"            → "freenow"
 *   "Freenow Group"      → "freenow"  (strip group suffix first)
 *   "The Walt Disney Co" → "thewaltdisney"
 *   "Disney"             → "disney"
 *   → both contain each other after collapse → match in caller
 */
function normalizeCompanyForCompare(name: string | null | undefined): string {
  if (!name) return ''
  return name.toLowerCase()
    // Strip common corporate suffixes
    .replace(/\s*(,\s*)?\s*(inc|incorporated|corp|corporation|llc|ltd|limited|sa|s\.a\.|s\.a|sas|s\.a\.s|gmbh|ag|bv|nv|plc|co\.|company|holdings?|group|international|global)\.?\s*$/i, '')
    // Strip whitespace, punctuation, hyphens — collapses "Free Now" → "freenow"
    .replace(/[\s\-_.,&'"!?()/]/g, '')
    .trim()
}

function extractRootDomain(input: string | null | undefined): string | null {
  if (!input) return null
  let raw = input.trim().toLowerCase()
  // strip protocol + path
  raw = raw.replace(/^https?:\/\//, '').split('/')[0]
  // strip leading www.
  raw = raw.replace(/^www\./, '')
  if (!raw.includes('.')) return null
  // For multi-tld like uala.com.ar, keep last 3 parts; otherwise last 2.
  const parts = raw.split('.')
  const COUNTRY_TLDS = new Set(['ar', 'br', 'mx', 'co', 'pe', 'cl', 'uy', 'uk', 'au', 'nz', 'in', 'sg', 'jp', 'kr'])
  const SECOND_LEVEL_PUBLIC = new Set(['com', 'co', 'net', 'org', 'gov', 'edu', 'ac'])
  if (parts.length >= 3) {
    const last = parts[parts.length - 1]
    const secondLast = parts[parts.length - 2]
    if (COUNTRY_TLDS.has(last) && SECOND_LEVEL_PUBLIC.has(secondLast)) {
      return parts.slice(-3).join('.')  // uala.com.ar
    }
  }
  return parts.slice(-2).join('.')
}

async function markSkipped(
  supabase: ReturnType<typeof createSupabaseClient>,
  queueId: string,
  companyId: string,
  reason: string,
  cooldownDays: number,
  emailsByRole: Record<string, number> = {}
) {
  const cooldownUntil = new Date(Date.now() + cooldownDays * 24 * 60 * 60 * 1000).toISOString()

  await supabase
    .from('icp_pipeline_queue')
    .update({
      status: 'skipped',
      skip_reason: reason,
      processed_at: new Date().toISOString(),
      discovered_emails_by_role: emailsByRole,
      next_retry_at: cooldownUntil,
    })
    .eq('id', queueId)

  await supabase
    .from('account_map_companies')
    .update({
      pipeline_state: 'cooldown',
      cooldown_until: cooldownUntil,
      last_pipeline_processed_at: new Date().toISOString(),
    })
    .eq('id', companyId)
}

async function markFailed(
  supabase: ReturnType<typeof createSupabaseClient>,
  queueId: string,
  errorDetail: string
) {
  await supabase
    .from('icp_pipeline_queue')
    .update({
      status: 'failed',
      error_detail: errorDetail.slice(0, 1000),
      processed_at: new Date().toISOString(),
    })
    .eq('id', queueId)
}
