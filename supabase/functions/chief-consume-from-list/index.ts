// chief-consume-from-list
// =============================================================================
// REPLACEMENT for chief-discover-and-queue. Instead of calling the LLM-based
// discover-icp-companies, we consume entries FIFO from pre_approved_icp_companies
// (table seeded with 2484 user-curated ICP companies + LinkedIn URLs).
//
// Flujo:
// 1. Read org_chief_settings → account_map_id, daily_target_companies
// 2. Back-pressure check (same as chief-discover-and-queue)
// 3. Dynamic target via compute_safe_discovery_target
// 4. Fetch full excluded set (SF customers/opps + cooldown + blacklist)
// 5. consume_next_n_pre_approved(targetCount * 2, orgId) → claim with buffer
// 6. For each claimed entry:
//      a. If excluded → mark_pre_approved_resolution_failed (stays consumed)
//      b. Else → upsert account_map_companies (linkedin_url hint) + insert queue
//      c. Stop once enqueued == targetCount
// 7. Rollback any remaining unused claimed entries
// 8. Check count_remaining; if < 50 → log warning (alert via separate cron)
// 9. Return summary
//
// LLM discovery (chief-discover-and-queue + discover-icp-companies) stays
// deployed as MANUAL fallback — only triggered by explicit agent skill call,
// not pg_cron.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext, createSupabaseClient, logActivity } from '../_shared/supabase.ts'

interface ConsumeRequest {
  /** Target empresas a encolar este run. Default: settings.daily_target_companies */
  target_count?: number
  /** Smoke test: valida settings + lista pero NO consume nada */
  dry_run?: boolean
  /** Service-role caller pasa ownerId + orgId explícito (cron) */
  ownerId?: string
  orgId?: string
  /** Buffer multiplier for consumed entries (default 2x targetCount). Higher = more chances to find non-excluded entries. */
  buffer_multiplier?: number
}

interface ConsumedEntry {
  id: string
  pos: number
  name: string
  linkedin_url: string
  url_type: string
  needs_resolution: boolean
}

const LOW_LIST_THRESHOLD = 50

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const body = (await req.json().catch(() => ({}))) as ConsumeRequest

    const auth = await getAuthContext(authHeader, { ownerId: body.ownerId, orgId: body.orgId })
    if (!auth) return errorResponse('Unauthorized', 401)

    const supabase = createSupabaseClient(authHeader)

    // ---------- 1. Settings ----------
    const { data: settings, error: sErr } = await supabase
      .from('org_chief_settings')
      .select('icp_profile_id, account_map_id, daily_target_companies, max_emails_per_company')
      .eq('org_id', auth.orgId)
      .single()

    if (sErr || !settings) {
      return errorResponse('Chief pipeline no configurado para esta org. Crea row en org_chief_settings primero.', 400)
    }
    if (!settings.account_map_id) {
      return errorResponse('org_chief_settings.account_map_id es NULL. Linkear primero.', 400)
    }

    // ---------- 2. Back-pressure check ----------
    if (!body.dry_run) {
      const { data: bpData } = await supabase.rpc('should_pause_discovery', { p_org_id: auth.orgId })
      const bp = Array.isArray(bpData) ? bpData[0] : bpData
      if (bp?.should_pause) {
        console.log(`[chief-consume-from-list] back-pressure: ${bp.reason} pending=${bp.pending_count}/${bp.threshold} weeklyDMs=${bp.weekly_dms_used}+${bp.pending_dm_schedules}/${bp.weekly_dm_cap} → skip`)
        return jsonResponse({
          skipped: true,
          reason: bp.reason,
          pending_schedules: bp.pending_count,
          threshold: bp.threshold,
          weekly_dms_used: bp.weekly_dms_used,
          weekly_dm_cap: bp.weekly_dm_cap,
          pending_dm_schedules: bp.pending_dm_schedules,
          message: bp.reason === 'weekly_dm_cap_projection_exceeded'
            ? `Consume paused: weekly LinkedIn DMs ${bp.weekly_dms_used}+${bp.pending_dm_schedules}/${bp.weekly_dm_cap}.`
            : `Consume paused: ${bp.pending_count} schedules pending exceeds threshold ${bp.threshold}.`,
        })
      }
    }

    // ---------- 3. Dynamic target ----------
    const { data: safeTargetData, error: stErr } = await supabase.rpc('compute_safe_discovery_target', {
      p_org_id: auth.orgId,
      p_explicit_request: body.target_count ?? null,
    })
    if (stErr) console.error('compute_safe_discovery_target failed:', stErr)
    const safeRow = Array.isArray(safeTargetData) ? safeTargetData[0] : safeTargetData
    const targetCount: number = safeRow?.safe_target ?? settings.daily_target_companies ?? 5
    console.log(`[chief-consume-from-list] dynamic target: ${targetCount} | ${safeRow?.reasoning ?? '(no rpc)'}`)

    if (targetCount === 0) {
      return jsonResponse({
        skipped: true,
        reason: 'no_dm_budget_remaining',
        target_count: 0,
        weekly_dm_cap: safeRow?.weekly_dm_cap,
        weekly_dms_used: safeRow?.weekly_dms_used,
        pending_dm_schedules: safeRow?.pending_dm_schedules,
        weekly_dm_budget_remaining: safeRow?.weekly_dm_budget_remaining,
        message: 'Consume skipped: weekly DM budget exhausted. Resumes Monday.',
      })
    }

    // ---------- 4. Excluded set with precise reasons (Migration 135) ----------
    const { data: excludedRaw, error: exErr } = await supabase.rpc('get_excluded_companies_with_reason', { p_org_id: auth.orgId })
    if (exErr) console.error('get_excluded_companies_with_reason failed:', exErr)
    const excludedRows: Array<{ company_name: string; norm_name: string; reason: string }> =
      Array.isArray(excludedRaw) ? excludedRaw : []
    // Normalize for comparison (cheap: lowercase + strip common suffixes)
    const normalizeForCompare = (n: string) =>
      n.toLowerCase()
       .replace(/\s*(,\s*)?\s*(inc|incorporated|corp|corporation|llc|ltd|limited|sa|s\.a\.|s\.a|sas|s\.a\.s|gmbh|ag|bv|nv|plc|co\.|company|holdings?|group|international|global)\.?\s*$/, '')
       .trim()
    // Build name → reason map for accurate skip labeling
    const excludedReasonMap = new Map<string, string>()
    for (const row of excludedRows) {
      excludedReasonMap.set(row.norm_name || normalizeForCompare(row.company_name), row.reason)
    }
    const excludedSet = new Set(excludedReasonMap.keys())
    const reasonBreakdown = excludedRows.reduce<Record<string, number>>((acc, r) => {
      acc[r.reason] = (acc[r.reason] || 0) + 1
      return acc
    }, {})
    console.log(`[V13b] Excluding ${excludedSet.size} companies — reasons: ${JSON.stringify(reasonBreakdown)} | excludedRows.length=${excludedRows.length}`)

    // ---------- 5. Pre-flight: list size ----------
    const { data: remainingData } = await supabase.rpc('count_remaining_pre_approved')
    const remainingBefore: number = typeof remainingData === 'number' ? remainingData : (remainingData?.[0] ?? 0)

    if (remainingBefore === 0) {
      return jsonResponse({
        skipped: true,
        reason: 'pre_approved_list_empty',
        message: 'Pre-approved list is exhausted. Run bulk_insert_pre_approved_companies() to refill or trigger LLM fallback (chief-discover-and-queue).',
      })
    }

    // ---------- 5.5. Dry-run early return ----------
    if (body.dry_run) {
      const { data: stats } = await supabase.rpc('get_pre_approved_list_stats')
      return jsonResponse({
        dry_run: true,
        settings_ok: true,
        org_id: auth.orgId,
        account_map_id: settings.account_map_id,
        target_count: targetCount,
        dynamic_target_reasoning: safeRow?.reasoning,
        weekly_dm_budget_remaining: safeRow?.weekly_dm_budget_remaining,
        excluded_count: excludedSet.size,
        excluded_breakdown: reasonBreakdown,
        pre_approved_stats: Array.isArray(stats) ? stats[0] : stats,
      })
    }

    // ---------- 6. Consume with buffer ----------
    const buffer = body.buffer_multiplier ?? 2
    const consumeN = Math.min(targetCount * buffer, remainingBefore)
    const { data: claimedRaw, error: cnErr } = await supabase.rpc('consume_next_n_pre_approved', {
      p_n: consumeN,
      p_org_id: auth.orgId,
    })
    if (cnErr) {
      return errorResponse(`consume_next_n_pre_approved failed: ${cnErr.message}`, 500)
    }
    const claimed: ConsumedEntry[] = Array.isArray(claimedRaw) ? claimedRaw : []
    console.log(`Claimed ${claimed.length} entries (target=${targetCount}, buffer=${buffer}x)`)

    // ---------- 7. Iterate: enqueue valid, mark excluded, rollback unused ----------
    let enqueued = 0
    let skippedExcluded = 0
    let skippedDup = 0
    let failed = 0
    const unused: string[] = [] // claimed but not enqueued and not exclusion-marked

    for (const entry of claimed) {
      // Stop once we've enqueued the target
      if (enqueued >= targetCount) {
        unused.push(entry.id)
        continue
      }

      // Check exclusion with precise reason (Migration 135)
      const norm = normalizeForCompare(entry.name)
      if (excludedSet.has(norm)) {
        const preciseReason = excludedReasonMap.get(norm) || 'unknown_excluded'
        await supabase.rpc('mark_pre_approved_resolution_failed', {
          p_id: entry.id,
          p_reason: preciseReason,
        })
        skippedExcluded++
        continue
      }

      try {
        // Lookup existing account_map_companies row by normalized name
        let companyId: string | null = null
        const { data: normMatchRows } = await supabase.rpc('find_account_map_company_by_norm', {
          p_account_map_id: settings.account_map_id,
          p_company_name: entry.name,
        })
        const existing = Array.isArray(normMatchRows) && normMatchRows.length > 0 ? normMatchRows[0] : null

        if (existing) {
          companyId = existing.id
          if (existing.pipeline_state === 'blacklisted' || existing.pipeline_state === 'cooldown' || existing.pipeline_state === 'in_pipeline') {
            await supabase.rpc('mark_pre_approved_resolution_failed', {
              p_id: entry.id,
              p_reason: `existing_amc_state:${existing.pipeline_state}`,
            })
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
              company_name: entry.name,
              linkedin_url: entry.linkedin_url,
              pipeline_state: 'available',
            })
            .select('id')
            .single()

          if (insErr || !inserted) {
            // 23505 = unique violation. Migration 139 indexed
            // (org_id, normalize_company_name(company_name)), so the org
            // already has a row for this normalized name but on a different
            // account_map_id (legacy state from earlier configs). Adopt it
            // and migrate its account_map_id to the current pipeline.
            //
            // Mig 152: lookup via find_amc_by_org_norm — the old ilike was a
            // case-insensitive exact match (no wildcards) and silently missed
            // suffix-stripped variants like "Apple" vs "Apple Inc".
            if ((insErr as { code?: string })?.code === '23505') {
              const { data: adoptRows } = await supabase.rpc('find_amc_by_org_norm', {
                p_org_id: auth.orgId,
                p_company_name: entry.name,
              })
              const existingByOrg = Array.isArray(adoptRows) && adoptRows.length > 0 ? adoptRows[0] : null
              if (existingByOrg?.id) {
                const adopted = existingByOrg as { id: string; account_map_id: string | null; pipeline_state: string | null }
                if (adopted.account_map_id !== settings.account_map_id) {
                  await supabase
                    .from('account_map_companies')
                    .update({ account_map_id: settings.account_map_id })
                    .eq('id', adopted.id)
                }
                if (adopted.pipeline_state === 'blacklisted' || adopted.pipeline_state === 'cooldown' || adopted.pipeline_state === 'in_pipeline') {
                  await supabase.rpc('mark_pre_approved_resolution_failed', {
                    p_id: entry.id,
                    p_reason: `existing_amc_state:${adopted.pipeline_state}`,
                  })
                  skippedDup++
                  continue
                }
                companyId = adopted.id
                console.log(`[consume] adopted existing AMC ${adopted.id} for ${entry.name} (was on stale account_map_id=${adopted.account_map_id})`)
              } else {
                console.error(`Failed to insert ${entry.name} and no existing AMC found by org+name:`, insErr)
                await supabase.rpc('mark_pre_approved_resolution_failed', {
                  p_id: entry.id,
                  p_reason: `amc_insert_error:${insErr?.code ?? 'unknown'}`,
                })
                failed++
                continue
              }
            } else {
              console.error(`Failed to insert ${entry.name}:`, insErr)
              await supabase.rpc('mark_pre_approved_resolution_failed', {
                p_id: entry.id,
                p_reason: `amc_insert_error:${insErr?.code ?? 'unknown'}`,
              })
              failed++
              continue
            }
          } else {
            companyId = inserted.id
          }
        }

        // Insert into queue (UNIQUE per-day index dedupes if already pending/processing/done today)
        const { error: qErr } = await supabase
          .from('icp_pipeline_queue')
          .insert({
            org_id: auth.orgId,
            account_map_id: settings.account_map_id,
            company_id: companyId,
            relevance_score: 10, // pre-approved → max relevance
            fit_category: 'high',
            score_breakdown: { source: 'pre_approved_list', position: entry.pos, url_type: entry.url_type },
            status: 'pending',
          })

        if (qErr) {
          if ((qErr as { code?: string }).code === '23505') {
            await supabase.rpc('mark_pre_approved_resolution_failed', {
              p_id: entry.id,
              p_reason: 'queue_duplicate_per_day',
            })
            skippedDup++
            continue
          }
          console.error(`Failed to enqueue ${entry.name}:`, qErr)
          await supabase.rpc('mark_pre_approved_resolution_failed', {
            p_id: entry.id,
            p_reason: `queue_insert_error:${(qErr as { code?: string }).code ?? 'unknown'}`,
          })
          failed++
          continue
        }

        // Mark account_map_companies as in_pipeline
        await supabase
          .from('account_map_companies')
          .update({ pipeline_state: 'in_pipeline', last_pipeline_processed_at: null })
          .eq('id', companyId)

        // Link consumption FK
        await supabase.rpc('link_pre_approved_to_amc', {
          p_id: entry.id,
          p_amc_id: companyId,
        })

        enqueued++
      } catch (err) {
        console.error(`Error processing ${entry.name}:`, err)
        await supabase.rpc('mark_pre_approved_resolution_failed', {
          p_id: entry.id,
          p_reason: `unhandled_error:${(err as Error).message?.slice(0, 80) ?? 'unknown'}`,
        })
        failed++
      }
    }

    // ---------- 8. Rollback unused claims so future runs can re-claim them ----------
    for (const id of unused) {
      await supabase.rpc('rollback_pre_approved_consumption', { p_id: id })
    }

    // ---------- 9. Low-list warning ----------
    const { data: remainingAfterData } = await supabase.rpc('count_remaining_pre_approved')
    const remainingAfter: number = typeof remainingAfterData === 'number' ? remainingAfterData : (remainingAfterData?.[0] ?? 0)
    const lowList = remainingAfter < LOW_LIST_THRESHOLD

    let alertSent = false
    if (lowList) {
      console.warn(`⚠ pre_approved_icp_companies LOW: ${remainingAfter} entries remaining (threshold ${LOW_LIST_THRESHOLD})`)

      // Anti-spam claim — only send 1 alert per org per day
      const { data: claimedSlot } = await supabase.rpc('claim_pre_approved_alert_slot', {
        p_org_id: auth.orgId,
        p_remaining: remainingAfter,
        p_threshold: LOW_LIST_THRESHOLD,
      })

      if (claimedSlot === true) {
        try {
          // Resolve the org's WhatsApp recipient from chief_sessions
          const { data: chiefSession } = await supabase
            .from('chief_sessions')
            .select('whatsapp_number')
            .eq('org_id', auth.orgId)
            .eq('user_id', auth.userId)
            .maybeSingle()

          if (chiefSession?.whatsapp_number) {
            const bridgeUrl = Deno.env.get('BRIDGE_URL') || 'https://bridge.yuno.tools'
            const message =
              `⚠ Lista pre-approved ICP baja: ${remainingAfter} empresas restantes (umbral ${LOW_LIST_THRESHOLD}).\n\n` +
              `A 5 empresas/día = ${Math.floor(remainingAfter / 5)} días de runway.\n\n` +
              `Pásame nueva lista o dime "fallback LLM" para reactivar discovery automático.`

            const alertResp = await fetch(`${bridgeUrl}/api/whatsapp/notify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: chiefSession.whatsapp_number,
                body: message,
                org_id: auth.orgId,
              }),
            })
            await supabase.rpc('mark_pre_approved_alert_sent', {
              p_org_id: auth.orgId,
              p_status: alertResp.status,
            })
            alertSent = alertResp.ok
            console.log(`Pre-approved low-list WhatsApp alert sent to ${chiefSession.whatsapp_number} → ${alertResp.status}`)
          } else {
            console.warn(`Pre-approved low-list alert: no chief_sessions row for org=${auth.orgId} user=${auth.userId}`)
          }
        } catch (alertErr) {
          console.error('Pre-approved low-list alert send failed:', alertErr)
        }
      } else {
        console.log(`Pre-approved low-list alert already sent today for org ${auth.orgId} (anti-spam)`)
      }
    }

    await logActivity({
      ownerId: auth.userId,
      orgId: auth.orgId,
      action: 'chief_consume_from_list_completed',
      status: 'ok',
      details: {
        target_count: targetCount,
        claimed: claimed.length,
        enqueued,
        skipped_excluded: skippedExcluded,
        skipped_duplicates: skippedDup,
        failed,
        pre_approved_remaining: remainingAfter,
        low_list_warning: lowList,
      },
    }).catch(() => {})

    return jsonResponse({
      success: true,
      target_count: targetCount,
      claimed: claimed.length,
      enqueued,
      skipped_excluded: skippedExcluded,
      skipped_duplicates: skippedDup,
      failed,
      released_unused: unused.length,
      account_map_id: settings.account_map_id,
      pre_approved_remaining: remainingAfter,
      pre_approved_remaining_before: remainingBefore,
      low_list_warning: lowList,
      low_list_threshold: LOW_LIST_THRESHOLD,
      low_list_alert_sent: alertSent,
      dynamic_target_reasoning: safeRow?.reasoning,
      weekly_dm_budget_remaining: safeRow?.weekly_dm_budget_remaining,
    })
  } catch (err) {
    console.error('chief-consume-from-list error:', err)
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})
