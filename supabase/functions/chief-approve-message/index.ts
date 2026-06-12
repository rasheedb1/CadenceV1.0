// chief-approve-message
// =============================================================================
// Handler para aprobaciones/rechazos/regeneraciones de QA reviews via WhatsApp.
// Invocado por el bridge cuando el usuario responde 1/2/3 a un QA prompt.
//
// Decisions:
//   - approve: schedule.status='scheduled' + scheduled_at=NOW() + pre_approved=true
//   - reject:  schedule.status='rejected' + lead_step_instance.status='skipped'
//              → process-queue avanza al siguiente step
//   - regenerate: schedule.status='hold_for_review' (resetea), message rendered_text=null,
//                 config_json.regenerate_hint set
//                 → process-queue regenera y vuelve a hold_for_review
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext, createSupabaseClient } from '../_shared/supabase.ts'

interface ApproveRequest {
  review_id: string
  decision: 'approve' | 'reject' | 'regenerate'
  decision_reason?: string
  regenerate_hint?: 'shorter' | 'more_casual' | 'different_angle'
  decided_by?: string  // user_id (optional, set by bridge based on user_phone lookup)
  ownerId?: string
  orgId?: string
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const body = (await req.json().catch(() => ({}))) as ApproveRequest

    const auth = await getAuthContext(authHeader, { ownerId: body.ownerId, orgId: body.orgId })
    if (!auth) return errorResponse('Unauthorized', 401)

    if (!body.review_id || !body.decision) return errorResponse('review_id and decision required')
    if (!['approve', 'reject', 'regenerate'].includes(body.decision)) {
      return errorResponse(`Invalid decision: ${body.decision}`)
    }

    const supabase = createSupabaseClient(authHeader)

    // ── Load review ──
    const { data: review, error: revErr } = await supabase
      .from('message_qa_reviews')
      .select('id, status, schedule_id, lead_id, cadence_id, cadence_step_id, step_type, generated_subject, generated_message, regenerate_count')
      .eq('id', body.review_id)
      .eq('org_id', auth.orgId)
      .maybeSingle()

    if (revErr || !review) return errorResponse(`Review ${body.review_id} not found`, 404)
    if (review.status !== 'pending') {
      return errorResponse(`Review status='${review.status}', expected 'pending'`, 400)
    }

    const decidedAt = new Date().toISOString()

    // ── Apply decision ──
    if (body.decision === 'approve') {
      // Update review
      await supabase.from('message_qa_reviews').update({
        status: 'approved',
        decided_at: decidedAt,
        decided_by: body.decided_by || auth.userId,
        decision_reason: body.decision_reason || 'human approved via WhatsApp',
      }).eq('id', review.id)

      // Update schedule: set back to scheduled with NOW so process-queue picks it up.
      // process-queue will detect the approved review (via message_qa_reviews.status='approved')
      // and use the already-generated message instead of regenerating.
      await supabase.from('schedules').update({
        status: 'scheduled',
        scheduled_at: decidedAt,
        message_rendered_text: review.generated_message,
      }).eq('id', review.schedule_id)

      // Increment burn-in counter
      await supabase.rpc('increment_step_burn_in_approval', {
        p_org_id: auth.orgId,
        p_cadence_id: review.cadence_id,
        p_step_type: review.step_type,
      }).then(() => {}, async () => {
        // RPC may not exist yet — fallback to manual upsert
        await upsertBurnInApproval(supabase, auth.orgId, review.cadence_id, review.step_type)
      })

      // Mark pending_whatsapp_actions row consumed
      await supabase.from('pending_whatsapp_actions')
        .update({ consumed_at: decidedAt })
        .eq('target_id', review.id)

      return jsonResponse({
        success: true,
        decision: 'approve',
        schedule_id: review.schedule_id,
        message: `Approved. Schedule will execute on next process-queue run (≤2 min).`,
      })
    }

    if (body.decision === 'reject') {
      await supabase.from('message_qa_reviews').update({
        status: 'rejected',
        decided_at: decidedAt,
        decided_by: body.decided_by || auth.userId,
        decision_reason: body.decision_reason || 'human rejected via WhatsApp',
      }).eq('id', review.id)

      // Mark schedule as rejected (process-queue won't execute it)
      await supabase.from('schedules').update({
        status: 'rejected',
        last_error: 'Rejected by human reviewer in QA burn-in',
      }).eq('id', review.schedule_id)

      // Mark lead_step_instance as skipped (manual)
      await supabase.from('lead_step_instances').update({
        status: 'skipped',
        last_error: 'Skipped: rejected in QA review',
      }).eq('lead_id', review.lead_id).eq('cadence_step_id', review.cadence_step_id)

      // Advance lead to next step manually
      // (We do NOT advance here — let the next process-queue cycle pick up next step naturally)
      // Actually: rejection means the cadence_lead.current_step_id should advance
      const { data: cadenceStep } = await supabase
        .from('cadence_steps')
        .select('day_offset, order_in_day')
        .eq('id', review.cadence_step_id)
        .single()

      if (cadenceStep) {
        const { data: nextStep } = await supabase
          .from('cadence_steps')
          .select('id')
          .eq('cadence_id', review.cadence_id)
          .or(`day_offset.gt.${cadenceStep.day_offset},and(day_offset.eq.${cadenceStep.day_offset},order_in_day.gt.${cadenceStep.order_in_day})`)
          .order('day_offset', { ascending: true })
          .order('order_in_day', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (nextStep) {
          await supabase.from('cadence_leads').update({
            current_step_id: nextStep.id,
          }).eq('cadence_id', review.cadence_id).eq('lead_id', review.lead_id)
        } else {
          await supabase.from('cadence_leads').update({
            status: 'completed',
          }).eq('cadence_id', review.cadence_id).eq('lead_id', review.lead_id)
        }
      }

      // Increment rejections counter
      await supabase.rpc('increment_step_burn_in_rejection', {
        p_org_id: auth.orgId,
        p_cadence_id: review.cadence_id,
        p_step_type: review.step_type,
      }).then(() => {}, async () => {
        await upsertBurnInRejection(supabase, auth.orgId, review.cadence_id, review.step_type)
      })

      await supabase.from('pending_whatsapp_actions')
        .update({ consumed_at: decidedAt })
        .eq('target_id', review.id)

      return jsonResponse({
        success: true,
        decision: 'reject',
        message: 'Rejected. Step skipped, advanced to next step in cadence.',
      })
    }

    if (body.decision === 'regenerate') {
      const newCount = (review.regenerate_count || 0) + 1
      // V8: pull settings from org config (qa_max_attempts, qa_min_acceptable_score)
      const { data: settingsRow } = await supabase
        .from('org_chief_settings')
        .select('qa_max_attempts, qa_min_acceptable_score')
        .eq('org_id', auth.orgId)
        .maybeSingle()
      const MAX_ATTEMPTS = settingsRow?.qa_max_attempts ?? 5
      const MIN_ACCEPTABLE = Number(settingsRow?.qa_min_acceptable_score ?? 4.5)

      if (newCount > MAX_ATTEMPTS) {
        // V8 PHILOSOPHY: send the BEST attempt rather than skip.
        // Query all reviews for this schedule_id, pick highest-scoring, send that.
        const { data: allReviews } = await supabase
          .from('message_qa_reviews')
          .select('id, generated_subject, generated_message, status')
          .eq('schedule_id', review.schedule_id)
          .order('created_at', { ascending: false })

        // Pull scores from qa_supervisor_decisions
        let bestReview: { id: string; generated_subject: string | null; generated_message: string; score: number | null } | null = null
        for (const r of (allReviews || [])) {
          const { data: dec } = await supabase
            .from('qa_supervisor_decisions')
            .select('quality_score')
            .eq('review_id', r.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          const score = dec?.quality_score ? Number(dec.quality_score) : null
          if (!bestReview || ((score ?? -1) > (bestReview.score ?? -1))) {
            bestReview = { id: r.id, generated_subject: r.generated_subject, generated_message: r.generated_message, score }
          }
        }

        if (bestReview && (bestReview.score ?? 0) >= MIN_ACCEPTABLE) {
          // SEND BEST ATTEMPT (skip the bad ones, use the best)
          console.log(`[chief-approve-v8] max attempts hit. Sending BEST attempt: review ${bestReview.id} score=${bestReview.score}`)
          await supabase.from('message_qa_reviews').update({
            status: 'approved_best_after_max',
            decided_at: decidedAt,
            decided_by: 'carlos_v8_send_best',
            decision_reason: `auto-send best attempt after max ${MAX_ATTEMPTS} regens (best score=${bestReview.score})`,
          }).eq('id', bestReview.id)

          // Set schedule to executable with best message
          await supabase.from('schedules').update({
            status: 'scheduled',
            scheduled_at: decidedAt,
            message_rendered_text: bestReview.generated_message,
            message_rendered_subject: bestReview.generated_subject,
          }).eq('id', review.schedule_id)

          await supabase.from('lead_step_instances').update({
            message_rendered_text: bestReview.generated_message,
            status: 'pending',
          }).eq('lead_id', review.lead_id).eq('cadence_step_id', review.cadence_step_id)

          return jsonResponse({
            success: true,
            decision: 'approved_best_after_max',
            best_score: bestReview.score,
            message: `Max regens hit. Sending best attempt (score=${bestReview.score}).`,
          })
        } else {
          // All attempts truly bad — skip the touch
          console.log(`[chief-approve-v8] max attempts hit. Best score ${bestReview?.score ?? 'null'} < ${MIN_ACCEPTABLE}. Skipping touch.`)
          await supabase.from('schedules').update({
            status: 'cancelled',
            last_error: `carlos_v8_skip_truly_bad: best_score=${bestReview?.score}`,
          }).eq('id', review.schedule_id)
          return jsonResponse({
            success: true,
            decision: 'skip_truly_bad',
            best_score: bestReview?.score,
            message: `Max regens hit. Best score ${bestReview?.score} below ${MIN_ACCEPTABLE} threshold. Touch skipped.`,
          })
        }
      }

      // Mark current review as regenerated (audit trail)
      await supabase.from('message_qa_reviews').update({
        status: 'regenerated',
        decided_at: decidedAt,
        decided_by: body.decided_by || auth.userId,
        decision_reason: 'human requested regeneration via WhatsApp',
        regenerate_hint: body.regenerate_hint || 'different_angle',
      }).eq('id', review.id)

      // Reset schedule back to 'scheduled' so process-queue picks it up and regenerates.
      // The next cron cycle will: generate fresh AI msg → validate → run Carlos again.
      const { data: schedRow } = await supabase
        .from('schedules')
        .select('config_json')
        .eq('id', review.schedule_id)
        .maybeSingle()
      const newConfig = {
        ...(schedRow?.config_json as Record<string, unknown> || {}),
        regenerate_hint: body.regenerate_hint || 'different_angle',
        regenerate_count: newCount,
        // V9: persist Carlos full feedback so next gen sees specific guidance
        carlos_feedback_history: [
          ...(((schedRow?.config_json as Record<string, unknown>)?.carlos_feedback_history as unknown[]) || []),
          {
            attempt: newCount,
            feedback: (body as Record<string, unknown>).carlos_feedback || null,
            decision_reason: body.decision_reason,
            timestamp: decidedAt,
          },
        ].slice(-5),  // keep last 5
      }
      await supabase.from('schedules').update({
        status: 'scheduled',
        scheduled_at: decidedAt,
        config_json: newConfig,
        message_rendered_text: null,
      }).eq('id', review.schedule_id)

      // Reset lead_step_instance message
      await supabase.from('lead_step_instances').update({
        message_rendered_text: null,
        status: 'pending',
      }).eq('lead_id', review.lead_id).eq('cadence_step_id', review.cadence_step_id)

      // Increment regenerations counter
      await upsertBurnInRegeneration(supabase, auth.orgId, review.cadence_id, review.step_type)

      await supabase.from('pending_whatsapp_actions')
        .update({ consumed_at: decidedAt })
        .eq('target_id', review.id)

      return jsonResponse({
        success: true,
        decision: 'regenerate',
        regenerate_count: newCount,
        message: `Regeneration #${newCount} scheduled. process-queue will regenerate and re-notify on next run.`,
      })
    }

    return errorResponse('Unreachable')
  } catch (err) {
    console.error('chief-approve-message error:', err)
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})

// ─── Helpers: upsert step_burn_in_status counters ─────────────────────
async function upsertBurnInApproval(
  supabase: ReturnType<typeof createSupabaseClient>,
  orgId: string, cadenceId: string, stepType: string
) {
  const { data: existing } = await supabase
    .from('step_burn_in_status')
    .select('approvals_count, approval_threshold, in_burn_in')
    .eq('org_id', orgId)
    .eq('cadence_id', cadenceId)
    .eq('step_type', stepType)
    .maybeSingle()

  if (existing) {
    const newCount = existing.approvals_count + 1
    const graduated = newCount >= existing.approval_threshold
    await supabase.from('step_burn_in_status').update({
      approvals_count: newCount,
      in_burn_in: !graduated,
      graduated_at: graduated && !existing.in_burn_in ? null : (graduated ? new Date().toISOString() : null),
      last_decision_at: new Date().toISOString(),
    }).eq('org_id', orgId).eq('cadence_id', cadenceId).eq('step_type', stepType)
  } else {
    await supabase.from('step_burn_in_status').insert({
      org_id: orgId,
      cadence_id: cadenceId,
      step_type: stepType,
      approvals_count: 1,
      approval_threshold: 1,
      in_burn_in: false,
      graduated_at: new Date().toISOString(),
      last_decision_at: new Date().toISOString(),
    })
  }
}

async function upsertBurnInRejection(
  supabase: ReturnType<typeof createSupabaseClient>,
  orgId: string, cadenceId: string, stepType: string
) {
  const { data: existing } = await supabase
    .from('step_burn_in_status')
    .select('rejections_count')
    .eq('org_id', orgId).eq('cadence_id', cadenceId).eq('step_type', stepType)
    .maybeSingle()

  if (existing) {
    await supabase.from('step_burn_in_status').update({
      rejections_count: existing.rejections_count + 1,
      last_decision_at: new Date().toISOString(),
    }).eq('org_id', orgId).eq('cadence_id', cadenceId).eq('step_type', stepType)
  } else {
    await supabase.from('step_burn_in_status').insert({
      org_id: orgId, cadence_id: cadenceId, step_type: stepType,
      rejections_count: 1, last_decision_at: new Date().toISOString(),
    })
  }
}

async function upsertBurnInRegeneration(
  supabase: ReturnType<typeof createSupabaseClient>,
  orgId: string, cadenceId: string, stepType: string
) {
  const { data: existing } = await supabase
    .from('step_burn_in_status')
    .select('regenerations_count')
    .eq('org_id', orgId).eq('cadence_id', cadenceId).eq('step_type', stepType)
    .maybeSingle()

  if (existing) {
    await supabase.from('step_burn_in_status').update({
      regenerations_count: existing.regenerations_count + 1,
      last_decision_at: new Date().toISOString(),
    }).eq('org_id', orgId).eq('cadence_id', cadenceId).eq('step_type', stepType)
  } else {
    await supabase.from('step_burn_in_status').insert({
      org_id: orgId, cadence_id: cadenceId, step_type: stepType,
      regenerations_count: 1, last_decision_at: new Date().toISOString(),
    })
  }
}
