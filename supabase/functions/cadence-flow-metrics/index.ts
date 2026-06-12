// cadence-flow-metrics
// Read-only aggregation endpoint that powers the Cadence Flow viewer.
// Given a cadence_id, returns per-step config + metrics + recent runs.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

type StepStatusCounts = {
  pending: number
  generated: number
  sent: number
  failed: number
  skipped: number
}

type RecentRun = {
  instance_id: string
  lead_id: string
  lead_name: string
  company: string | null
  status: string
  updated_at: string
  carlos_score: number | null
}

type StepOut = {
  step_id: string
  day_offset: number
  order_in_day: number
  step_type: string
  step_label: string
  skill: { id: string; name: string; display_name: string } | null
  signal_allocation: string | null
  config: {
    has_ai_prompt: boolean
    has_research_prompt: boolean
    has_template: boolean
  }
  carlos: {
    threshold: number | null
    min_acceptable: number | null
    max_attempts: number | null
    avg_score_30d: number | null
    samples: number
  }
  metrics: {
    scheduled: number
    executed: number
    failed: number
    skipped: number
    success_rate: number | null
  }
  recent_runs: RecentRun[]
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const body = await req.json().catch(() => ({}))
    const cadenceId: string | undefined = body.cadence_id
    const ownerIdOpt: string | undefined = body.owner_id
    const orgIdOpt: string | undefined = body.org_id
    const daysWindow: number = Math.max(1, Math.min(90, body.days_window ?? 30))

    if (!cadenceId) return errorResponse('cadence_id is required', 400)

    const ctx = await getAuthContext(authHeader, { ownerId: ownerIdOpt, orgId: orgIdOpt })
    if (!ctx) return errorResponse('Unauthorized', 401)
    const { orgId } = ctx

    const supabase = createSupabaseClient()

    // 1) Cadence + steps (validate org ownership)
    const { data: cadence, error: cadenceErr } = await supabase
      .from('cadences')
      .select('id, name, org_id, status, automation_mode, timezone')
      .eq('id', cadenceId)
      .eq('org_id', orgId)
      .single()
    if (cadenceErr || !cadence) return errorResponse('Cadence not found', 404)

    const { data: steps, error: stepsErr } = await supabase
      .from('cadence_steps')
      .select('id, cadence_id, step_type, step_label, day_offset, order_in_day, config_json')
      .eq('cadence_id', cadenceId)
      .order('day_offset', { ascending: true })
      .order('order_in_day', { ascending: true })
    if (stepsErr) return errorResponse(`Failed to load steps: ${stepsErr.message}`, 500)
    if (!steps || steps.length === 0) {
      return jsonResponse({
        cadence: { ...cadence, total_steps: 0, total_days: 0 },
        steps: [],
        generated_at: new Date().toISOString(),
      })
    }

    const stepIds = steps.map((s) => s.id)
    const stepTypes = [...new Set(steps.map((s) => s.step_type))]
    const dayOffsets = [...new Set(steps.map((s) => s.day_offset))]
    const skillIds = [
      ...new Set(
        steps
          .map((s) => (s.config_json as Record<string, unknown> | null)?.skill_id as string | undefined)
          .filter((v): v is string => typeof v === 'string' && v.length > 0)
      ),
    ]

    const windowFromIso = new Date(Date.now() - daysWindow * 86400_000).toISOString()

    // 2) Parallel fetches
    const [rubricRes, skillRes, instancesRes, qaRes, recentRes] = await Promise.all([
      // Rubrics keyed by (step_type, day_offset) for this org
      supabase
        .from('carlos_step_rubric')
        .select('step_type, day_offset, threshold, min_acceptable, max_attempts')
        .eq('org_id', orgId)
        .in('step_type', stepTypes)
        .in('day_offset', dayOffsets),
      // Skills referenced in any step
      skillIds.length > 0
        ? supabase.from('skill_registry').select('id, name, display_name').in('id', skillIds)
        : Promise.resolve({ data: [], error: null }),
      // Status counts: pull all instances within window, aggregate in code
      supabase
        .from('lead_step_instances')
        .select('cadence_step_id, status, updated_at')
        .in('cadence_step_id', stepIds)
        .eq('org_id', orgId)
        .gte('updated_at', windowFromIso),
      // Carlos avg score: pull qa_supervisor_decisions joined with reviews
      supabase
        .from('qa_supervisor_decisions')
        .select('quality_score, shadow_mode, created_at, review:message_qa_reviews!inner(cadence_step_id)')
        .eq('org_id', orgId)
        .eq('shadow_mode', false)
        .not('quality_score', 'is', null)
        .gte('created_at', windowFromIso)
        .in('review.cadence_step_id', stepIds),
      // Recent runs: top 5 per step (we'll trim after)
      supabase
        .from('lead_step_instances')
        .select(
          'id, cadence_step_id, lead_id, status, updated_at, lead:leads(id, first_name, last_name, company)'
        )
        .in('cadence_step_id', stepIds)
        .eq('org_id', orgId)
        .order('updated_at', { ascending: false })
        .limit(stepIds.length * 5),
    ])

    if (rubricRes.error) return errorResponse(`rubric: ${rubricRes.error.message}`, 500)
    if (skillRes.error) return errorResponse(`skills: ${skillRes.error.message}`, 500)
    if (instancesRes.error) return errorResponse(`instances: ${instancesRes.error.message}`, 500)
    if (qaRes.error) return errorResponse(`qa: ${qaRes.error.message}`, 500)
    if (recentRes.error) return errorResponse(`recent: ${recentRes.error.message}`, 500)

    // Build lookup maps
    const rubricByKey = new Map<string, { threshold: number; min_acceptable: number; max_attempts: number }>()
    for (const r of rubricRes.data ?? []) {
      rubricByKey.set(`${r.step_type}::${r.day_offset}`, {
        threshold: Number(r.threshold),
        min_acceptable: Number(r.min_acceptable),
        max_attempts: Number(r.max_attempts),
      })
    }

    const skillById = new Map<string, { id: string; name: string; display_name: string }>()
    for (const s of skillRes.data ?? []) skillById.set(s.id, s)

    // Status counts by step
    const countsByStep = new Map<string, StepStatusCounts>()
    for (const id of stepIds) {
      countsByStep.set(id, { pending: 0, generated: 0, sent: 0, failed: 0, skipped: 0 })
    }
    for (const row of instancesRes.data ?? []) {
      const c = countsByStep.get(row.cadence_step_id)
      if (!c) continue
      if (row.status in c) (c as unknown as Record<string, number>)[row.status] += 1
    }

    // Carlos: avg score + sample count per step
    const carlosByStep = new Map<string, { sum: number; n: number }>()
    for (const row of qaRes.data ?? []) {
      const reviewObj = row.review as unknown
      const stepId = Array.isArray(reviewObj)
        ? (reviewObj[0] as { cadence_step_id?: string } | undefined)?.cadence_step_id
        : (reviewObj as { cadence_step_id?: string } | null)?.cadence_step_id
      if (!stepId) continue
      const score = Number(row.quality_score)
      if (!Number.isFinite(score)) continue
      const acc = carlosByStep.get(stepId) ?? { sum: 0, n: 0 }
      acc.sum += score
      acc.n += 1
      carlosByStep.set(stepId, acc)
    }

    // Recent runs grouped by step (already ordered desc), trim to 5 each
    const recentByStep = new Map<string, RecentRun[]>()
    for (const id of stepIds) recentByStep.set(id, [])
    for (const row of recentRes.data ?? []) {
      const bucket = recentByStep.get(row.cadence_step_id)
      if (!bucket || bucket.length >= 5) continue
      const lead = (Array.isArray(row.lead) ? row.lead[0] : row.lead) as
        | { id: string; first_name: string; last_name: string; company: string | null }
        | null
      bucket.push({
        instance_id: row.id,
        lead_id: row.lead_id,
        lead_name: lead ? `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim() : 'Unknown',
        company: lead?.company ?? null,
        status: row.status,
        updated_at: row.updated_at,
        carlos_score: null, // join would be expensive; surfaced in drawer separately if needed
      })
    }

    // Compose output
    const out: StepOut[] = steps.map((s) => {
      const cfg = (s.config_json ?? {}) as Record<string, unknown>
      const skillId = typeof cfg.skill_id === 'string' ? (cfg.skill_id as string) : null
      const counts = countsByStep.get(s.id)!
      const carlosAgg = carlosByStep.get(s.id)
      const rubric = rubricByKey.get(`${s.step_type}::${s.day_offset}`)
      const executed = counts.sent + counts.generated
      const totalAttempted = executed + counts.failed
      return {
        step_id: s.id,
        day_offset: s.day_offset,
        order_in_day: s.order_in_day,
        step_type: s.step_type,
        step_label: s.step_label,
        skill: skillId ? skillById.get(skillId) ?? null : null,
        signal_allocation: typeof cfg.signal_allocation === 'string' ? (cfg.signal_allocation as string) : null,
        config: {
          has_ai_prompt: typeof cfg.ai_prompt === 'string' && (cfg.ai_prompt as string).length > 0,
          has_research_prompt:
            typeof cfg.research_prompt === 'string' && (cfg.research_prompt as string).length > 0,
          has_template: typeof cfg.message_template === 'string' && (cfg.message_template as string).length > 0,
        },
        carlos: {
          threshold: rubric?.threshold ?? null,
          min_acceptable: rubric?.min_acceptable ?? null,
          max_attempts: rubric?.max_attempts ?? null,
          avg_score_30d: carlosAgg && carlosAgg.n > 0 ? Number((carlosAgg.sum / carlosAgg.n).toFixed(2)) : null,
          samples: carlosAgg?.n ?? 0,
        },
        metrics: {
          scheduled: counts.pending + counts.generated,
          executed: counts.sent,
          failed: counts.failed,
          skipped: counts.skipped,
          success_rate: totalAttempted > 0 ? Number((counts.sent / totalAttempted).toFixed(3)) : null,
        },
        recent_runs: recentByStep.get(s.id) ?? [],
      }
    })

    return jsonResponse({
      cadence: {
        id: cadence.id,
        name: cadence.name,
        status: cadence.status,
        automation_mode: cadence.automation_mode,
        timezone: cadence.timezone,
        total_steps: steps.length,
        total_days: Math.max(...steps.map((s) => s.day_offset)) + 1,
      },
      days_window: daysWindow,
      steps: out,
      generated_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('cadence-flow-metrics error:', err)
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500)
  }
})
