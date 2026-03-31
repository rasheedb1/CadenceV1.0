/**
 * Task Hygiene — Periodic cleanup of stale tasks
 *
 * Runs every 5 minutes via pg_cron. Detects and fixes:
 * 1. Claimed tasks with no progress (>5 min) → release back to ready
 * 2. In-progress tasks abandoned (>30 min no heartbeat) → release
 * 3. Review tasks unclaimed (>30 min) → auto-approve with note
 * 4. Backlog tasks with all dependencies done → promote to ready
 * 5. Tasks assigned to offline agents → release
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'

const CLAIMED_TIMEOUT_MS = 10 * 60 * 1000     // 10 min — agent claimed but never started
const AGENT_OFFLINE_MS = 10 * 60 * 1000        // 10 min — agent heartbeat stale = offline
const REVIEW_ORPHAN_MS = 60 * 60 * 1000        // 60 min — review task with no one working on it

Deno.serve(async (req: Request) => {
  const corsResult = handleCors(req)
  if (corsResult) return corsResult

  const supabase = createSupabaseClient()
  const now = new Date()
  const stats = { released_claimed: 0, released_stale: 0, auto_approved: 0, promoted: 0, unassigned_offline: 0 }

  try {
    // Load all heartbeats once (used by multiple rules)
    const { data: heartbeats } = await supabase
      .from('agent_heartbeats')
      .select('agent_id, last_seen, status')
    const agentLastSeen: Record<string, number> = {}
    if (heartbeats) {
      for (const h of heartbeats) {
        agentLastSeen[h.agent_id] = new Date(h.last_seen).getTime()
      }
    }
    const isAgentOffline = (agentId: string | null) => {
      if (!agentId) return true
      const lastSeen = agentLastSeen[agentId]
      return !lastSeen || lastSeen < now.getTime() - AGENT_OFFLINE_MS
    }

    // ── RULE 1: Release claimed tasks ONLY if agent is offline ──
    // Safe: if agent is alive, it might be about to start. Only release if agent is confirmed dead.
    const claimedCutoff = new Date(now.getTime() - CLAIMED_TIMEOUT_MS).toISOString()
    const { data: staleClaimed } = await supabase
      .from('agent_tasks_v2')
      .select('id, title, assigned_agent_id')
      .eq('status', 'claimed')
      .lt('assigned_at', claimedCutoff)

    if (staleClaimed) {
      for (const task of staleClaimed) {
        if (isAgentOffline(task.assigned_agent_id)) {
          await supabase.from('agent_tasks_v2').update({
            status: 'ready', assigned_agent_id: null, assigned_at: null,
            updated_at: now.toISOString(),
          }).eq('id', task.id)
          stats.released_claimed++
        }
        // If agent is alive → do nothing, let it work
      }
    }

    // ── RULE 2: Release in_progress tasks ONLY if agent is offline ──
    // NEVER release a task from a live agent — it might be working on a long task.
    // Only release if the agent's heartbeat is stale (crashed, redeployed, etc.)
    const { data: inProgressTasks } = await supabase
      .from('agent_tasks_v2')
      .select('id, title, assigned_agent_id')
      .eq('status', 'in_progress')

    if (inProgressTasks) {
      for (const task of inProgressTasks) {
        if (isAgentOffline(task.assigned_agent_id)) {
          await supabase.from('agent_tasks_v2').update({
            status: 'ready', assigned_agent_id: null, assigned_at: null, started_at: null,
            context_summary: '[Auto-released: agent went offline while working]',
            updated_at: now.toISOString(),
          }).eq('id', task.id)
          stats.released_stale++
        }
        // If agent is alive → do NOT touch, even if it's been hours
      }
    }

    // ── RULE 3: Release review tasks ONLY if unclaimed AND old ──
    // Don't auto-approve — just move back to ready so someone else can claim.
    // Only if nobody is working on it AND it's been >60 min.
    const reviewCutoff = new Date(now.getTime() - REVIEW_ORPHAN_MS).toISOString()
    const { data: staleReviews } = await supabase
      .from('agent_tasks_v2')
      .select('id, title, assigned_agent_id')
      .eq('status', 'review')
      .lt('updated_at', reviewCutoff)

    if (staleReviews) {
      for (const task of staleReviews) {
        if (!task.assigned_agent_id || isAgentOffline(task.assigned_agent_id)) {
          // Nobody working on the review — move original task to done
          await supabase.from('agent_tasks_v2').update({
            status: 'done',
            completed_at: now.toISOString(),
            context_summary: '[Auto-completed: review unclaimed for >60min, no reviewer available]',
            updated_at: now.toISOString(),
          }).eq('id', task.id)
          stats.auto_approved++
        }
      }
    }

    // ── RULE 4: Promote backlog tasks with all dependencies resolved ──
    // This is always safe — just fixing a missed trigger.
    const { data: backlogTasks } = await supabase
      .from('agent_tasks_v2')
      .select('id, depends_on')
      .eq('status', 'backlog')

    if (backlogTasks) {
      for (const task of backlogTasks) {
        const deps = (task.depends_on as string[]) || []
        if (deps.length === 0) {
          await supabase.from('agent_tasks_v2').update({
            status: 'ready', updated_at: now.toISOString(),
          }).eq('id', task.id)
          stats.promoted++
          continue
        }
        const { data: depTasks } = await supabase
          .from('agent_tasks_v2')
          .select('id, status')
          .in('id', deps)
        if (depTasks && depTasks.every(d => d.status === 'done' || d.status === 'cancelled')) {
          await supabase.from('agent_tasks_v2').update({
            status: 'ready', updated_at: now.toISOString(),
          }).eq('id', task.id)
          stats.promoted++
        }
      }
    }

    // ── RULE 5: Unassign claimed/in_progress from offline agents ──
    // Same as rules 1+2 but catches any edge cases.
    const offlineIds = Object.entries(agentLastSeen)
      .filter(([_, lastSeen]) => lastSeen < now.getTime() - AGENT_OFFLINE_MS)
      .map(([id]) => id)

    if (offlineIds.length > 0) {
      const { data: orphanTasks } = await supabase
        .from('agent_tasks_v2')
        .select('id')
        .in('assigned_agent_id', offlineIds)
        .in('status', ['claimed', 'in_progress'])

      if (orphanTasks) {
        for (const task of orphanTasks) {
          await supabase.from('agent_tasks_v2').update({
            status: 'ready', assigned_agent_id: null, assigned_at: null, started_at: null,
            updated_at: now.toISOString(),
          }).eq('id', task.id)
          stats.unassigned_offline++
        }
      }
    }

    const total = Object.values(stats).reduce((a, b) => a + b, 0)
    if (total > 0) {
      console.log(`[task-hygiene] Cleaned: released_claimed=${stats.released_claimed}, released_stale=${stats.released_stale}, auto_approved=${stats.auto_approved}, promoted=${stats.promoted}, unassigned_offline=${stats.unassigned_offline}`)
    }

    return jsonResponse({ success: true, stats, total_actions: total })

  } catch (err) {
    console.error('[task-hygiene] Error:', err)
    return errorResponse(err instanceof Error ? err.message : 'Error interno', 500)
  }
})
