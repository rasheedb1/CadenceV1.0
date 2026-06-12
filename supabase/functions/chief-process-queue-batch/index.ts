// chief-process-queue-batch
// =============================================================================
// Auto-retry batch processor: keeps claiming + processing companies from
// queue UNTIL daily_target_processed_companies is hit, queue is empty,
// DM budget exhausted, or edge function time runs out.
//
// Designed to be invoked:
//   - By pg_cron every 30-60 min during business hours
//   - Manually after a discovery run
//   - As fallback when chief-process-company skips
//
// Per-call constraints (fits within 150s edge timeout):
//   - Hard time budget: 130s (leaves 20s buffer)
//   - batch_max_attempts_per_run (default 4) — most companies take 80-120s
//   - First-success-counts toward daily target
//
// Each tick processes 1-2 companies typically. Multiple cron ticks per day
// → reaches daily target even with high skip rate.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext, createSupabaseClient } from '../_shared/supabase.ts'

interface BatchRequest {
  ownerId?: string
  orgId?: string
  target_override?: number          // override daily target (manual runs)
  trigger_discovery_if_low?: boolean // default true — triggers chief-consume-from-list (pre-approved list) if pending < threshold; LLM-based chief-discover-and-queue stays as manual fallback only
}

// Each chief-process-company takes ~80-130s. Edge function timeout = 150s.
// Process at most 1 company per call (or attempt 1 retry if first is fast skip).
// Cron runs every 5-10 min during business hours to compensate.
const HARD_BUDGET_MS = 135_000
const PER_COMPANY_TIMEOUT_MS = 130_000
const MAX_COMPANIES_PER_CALL = 1  // safety: one company per edge call

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const body = (await req.json().catch(() => ({}))) as BatchRequest
    const auth = await getAuthContext(authHeader, { ownerId: body.ownerId, orgId: body.orgId })
    if (!auth) return errorResponse('Unauthorized', 401)

    const supabase = createSupabaseClient(authHeader)
    const startMs = Date.now()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // ─── Kill switch: bail immediately if org disabled outreach ───
    const { data: enabledData, error: enabledErr } = await supabase.rpc('is_outreach_enabled', { p_org_id: auth.orgId })
    if (enabledErr) {
      console.warn(`[batch] is_outreach_enabled check failed (fail-closed): ${enabledErr.message}`)
      return jsonResponse({
        success: true,
        skipped: true,
        reason: 'outreach_enabled_check_failed',
        error: enabledErr.message,
      })
    }
    if (enabledData === false) {
      console.log(`[batch] outreach DISABLED for org ${auth.orgId} — bailing`)
      return jsonResponse({
        success: true,
        skipped: true,
        reason: 'outreach_disabled_for_org',
        org_id: auth.orgId,
      })
    }

    // ─── Load settings + today's progress ───
    const { data: settings } = await supabase
      .from('org_chief_settings')
      .select('daily_target_processed_companies, batch_max_attempts_per_run, batch_min_queue_for_discovery')
      .eq('org_id', auth.orgId)
      .maybeSingle()

    const dailyTarget = body.target_override ?? settings?.daily_target_processed_companies ?? 1
    // V11: cap per-call attempts to 1 successful company (fits 150s edge timeout)
    const maxAttempts = Math.min(MAX_COMPANIES_PER_CALL, settings?.batch_max_attempts_per_run ?? 4)
    const minQueueForDiscovery = settings?.batch_min_queue_for_discovery ?? 5

    const { data: progressData } = await supabase.rpc('count_processed_companies_today', { p_org_id: auth.orgId })
    const progress = Array.isArray(progressData) ? progressData[0] : progressData
    const doneToday = progress?.done_today ?? 0
    const skippedToday = progress?.skipped_today ?? 0

    if (doneToday >= dailyTarget) {
      return jsonResponse({
        success: true,
        skipped: true,
        reason: 'daily_target_already_met',
        done_today: doneToday,
        target: dailyTarget,
      })
    }

    const remainingTarget = dailyTarget - doneToday

    // ─── Check DM budget ───
    const { data: dmBudgetData } = await supabase.rpc('compute_safe_discovery_target', {
      p_org_id: auth.orgId,
      p_explicit_request: null,
    })
    const dmBudget = Array.isArray(dmBudgetData) ? dmBudgetData[0] : dmBudgetData
    if ((dmBudget?.safe_target ?? 0) === 0) {
      return jsonResponse({
        success: true,
        skipped: true,
        reason: 'no_dm_budget_remaining',
        done_today: doneToday,
        target: dailyTarget,
        weekly_dm_budget_remaining: dmBudget?.weekly_dm_budget_remaining,
      })
    }

    // ─── Check queue health, trigger discovery if low ───
    const { data: healthData } = await supabase.rpc('get_queue_health', { p_org_id: auth.orgId })
    const health = Array.isArray(healthData) ? healthData[0] : healthData
    let pendingAvailable = health?.pending_count ?? 0

    if (pendingAvailable < minQueueForDiscovery && (body.trigger_discovery_if_low !== false)) {
      console.log(`[batch] queue low (${pendingAvailable} < ${minQueueForDiscovery}), consuming from pre-approved list`)
      try {
        const discResp = await fetch(`${supabaseUrl}/functions/v1/chief-consume-from-list`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ownerId: auth.userId, orgId: auth.orgId }),
        })
        const discJson = await discResp.json().catch(() => ({}))
        console.log(`[batch] consume result: enqueued=${discJson.enqueued}, skipped_excluded=${discJson.skipped_excluded}, skipped_dups=${discJson.skipped_duplicates}, remaining=${discJson.pre_approved_remaining}, low_warn=${discJson.low_list_warning}`)
        // Re-check queue
        const { data: hd2 } = await supabase.rpc('get_queue_health', { p_org_id: auth.orgId })
        const h2 = Array.isArray(hd2) ? hd2[0] : hd2
        pendingAvailable = h2?.pending_count ?? 0
      } catch (dErr) {
        console.warn(`[batch] discovery failed (non-fatal):`, (dErr as Error).message)
      }
    }

    // ─── Loop: claim + process until target / queue empty / time / attempts ───
    const attempts: Array<{ company_id: string; status: string; reason?: string; ms: number }> = []
    let successful = 0
    let skipped = 0
    let failed = 0

    for (let i = 0; i < maxAttempts; i++) {
      const elapsed = Date.now() - startMs
      if (elapsed > HARD_BUDGET_MS) {
        console.log(`[batch] hard time budget exceeded at ${elapsed}ms — stopping`)
        break
      }
      if (successful >= remainingTarget) {
        console.log(`[batch] target met (${successful}/${remainingTarget}) — stopping`)
        break
      }

      // Claim next
      const { data: claimed } = await supabase.rpc('claim_next_n_companies', { p_org_id: auth.orgId, p_n: 1 })
      const claim = Array.isArray(claimed) ? claimed[0] : null
      if (!claim) {
        console.log(`[batch] queue empty after ${i} attempts`)
        break
      }

      const companyStartMs = Date.now()
      console.log(`[batch] attempt ${i + 1}/${maxAttempts}: claimed company_id=${claim.company_id}`)

      // Process with timeout guard
      try {
        const ctrl = new AbortController()
        const tid = setTimeout(() => ctrl.abort(), PER_COMPANY_TIMEOUT_MS)
        const procResp = await fetch(`${supabaseUrl}/functions/v1/chief-process-company`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            queue_id: claim.queue_id,
            ownerId: auth.userId,
            orgId: auth.orgId,
          }),
          signal: ctrl.signal,
        })
        clearTimeout(tid)

        const ms = Date.now() - companyStartMs
        const result = await procResp.json().catch(() => ({}))

        if (result.status === 'done') {
          successful++
          attempts.push({ company_id: claim.company_id, status: 'done', ms })
          console.log(`[batch] ✓ company processed (${result.leads_promoted} leads), ${ms}ms`)
        } else if (result.status === 'skipped') {
          skipped++
          attempts.push({ company_id: claim.company_id, status: 'skipped', reason: result.skip_reason, ms })
          console.log(`[batch] ⊘ skipped (${result.skip_reason}), ${ms}ms — trying next`)
        } else {
          failed++
          attempts.push({ company_id: claim.company_id, status: 'failed', reason: result.error || 'unknown', ms })
          console.warn(`[batch] ✗ failed (${result.error}), ${ms}ms`)
        }
      } catch (procErr) {
        const ms = Date.now() - companyStartMs
        failed++
        attempts.push({ company_id: claim.company_id, status: 'error', reason: (procErr as Error).message, ms })
        console.error(`[batch] error processing company:`, procErr)
      }
    }

    return jsonResponse({
      success: true,
      done_today_after: doneToday + successful,
      target: dailyTarget,
      target_met: (doneToday + successful) >= dailyTarget,
      this_run_successful: successful,
      this_run_skipped: skipped,
      this_run_failed: failed,
      total_attempts: attempts.length,
      remaining_in_queue: pendingAvailable - attempts.length,
      attempts,
      duration_ms: Date.now() - startMs,
    })
  } catch (err) {
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})
