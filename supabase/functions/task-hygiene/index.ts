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

const CLAIMED_TIMEOUT_MS = 5 * 60 * 1000      // 5 min
const INPROGRESS_TIMEOUT_MS = 30 * 60 * 1000   // 30 min
const REVIEW_TIMEOUT_MS = 30 * 60 * 1000       // 30 min

Deno.serve(async (req: Request) => {
  const corsResult = handleCors(req)
  if (corsResult) return corsResult

  const supabase = createSupabaseClient()
  const now = new Date()
  const stats = { released_claimed: 0, released_stale: 0, auto_approved: 0, promoted: 0, unassigned_offline: 0 }

  try {
    // 1. Release claimed tasks with no progress (>5 min)
    const claimedCutoff = new Date(now.getTime() - CLAIMED_TIMEOUT_MS).toISOString()
    const { data: staleClaimed } = await supabase
      .from('agent_tasks_v2')
      .select('id, title, assigned_agent_id')
      .eq('status', 'claimed')
      .lt('assigned_at', claimedCutoff)

    if (staleClaimed) {
      for (const task of staleClaimed) {
        await supabase.from('agent_tasks_v2').update({
          status: 'ready', assigned_agent_id: null, assigned_at: null,
          context_summary: (task as Record<string, unknown>).context_summary
            ? `${(task as Record<string, unknown>).context_summary}\n[Auto-released: claimed >5min without progress]`
            : '[Auto-released: claimed >5min without progress]',
          updated_at: now.toISOString(),
        }).eq('id', task.id)
        stats.released_claimed++
      }
    }

    // 2. Release in-progress tasks from agents with stale heartbeats (>30 min)
    const progressCutoff = new Date(now.getTime() - INPROGRESS_TIMEOUT_MS).toISOString()
    const { data: staleProgress } = await supabase
      .from('agent_tasks_v2')
      .select('id, title, assigned_agent_id, started_at')
      .eq('status', 'in_progress')
      .lt('updated_at', progressCutoff)

    if (staleProgress) {
      // Check if assigned agent is still alive
      const { data: heartbeats } = await supabase
        .from('agent_heartbeats')
        .select('agent_id, last_seen')

      const agentLastSeen: Record<string, string> = {}
      if (heartbeats) {
        for (const h of heartbeats) {
          agentLastSeen[h.agent_id] = h.last_seen
        }
      }

      for (const task of staleProgress) {
        const agentId = task.assigned_agent_id
        const lastSeen = agentId ? agentLastSeen[agentId] : null
        const agentStale = !lastSeen || new Date(lastSeen).getTime() < now.getTime() - INPROGRESS_TIMEOUT_MS

        if (agentStale) {
          await supabase.from('agent_tasks_v2').update({
            status: 'ready', assigned_agent_id: null, assigned_at: null, started_at: null,
            context_summary: '[Auto-released: agent offline or task stale >30min]',
            updated_at: now.toISOString(),
          }).eq('id', task.id)
          stats.released_stale++
        }
      }
    }

    // 3. Auto-approve review tasks unclaimed >30 min
    const reviewCutoff = new Date(now.getTime() - REVIEW_TIMEOUT_MS).toISOString()
    const { data: staleReviews } = await supabase
      .from('agent_tasks_v2')
      .select('id, title')
      .eq('status', 'review')
      .lt('updated_at', reviewCutoff)

    if (staleReviews) {
      for (const task of staleReviews) {
        await supabase.from('agent_tasks_v2').update({
          status: 'done',
          completed_at: now.toISOString(),
          review_score: 0.7,
          context_summary: '[Auto-approved: no reviewer available after 30min]',
          updated_at: now.toISOString(),
        }).eq('id', task.id)
        stats.auto_approved++
      }
    }

    // 4. Promote backlog tasks with all dependencies done
    const { data: backlogTasks } = await supabase
      .from('agent_tasks_v2')
      .select('id, depends_on')
      .eq('status', 'backlog')

    if (backlogTasks) {
      for (const task of backlogTasks) {
        const deps = (task.depends_on as string[]) || []
        if (deps.length === 0) {
          // No dependencies — should be ready
          await supabase.from('agent_tasks_v2').update({
            status: 'ready', updated_at: now.toISOString(),
          }).eq('id', task.id)
          stats.promoted++
          continue
        }

        // Check if all dependencies are done
        const { data: depTasks } = await supabase
          .from('agent_tasks_v2')
          .select('id, status')
          .in('id', deps)

        if (depTasks) {
          const allDone = depTasks.every(d => d.status === 'done' || d.status === 'cancelled')
          if (allDone) {
            await supabase.from('agent_tasks_v2').update({
              status: 'ready', updated_at: now.toISOString(),
            }).eq('id', task.id)
            stats.promoted++
          }
        }
      }
    }

    // 5. Unassign tasks from offline agents (heartbeat >10 min stale)
    const offlineCutoff = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
    const { data: offlineAgents } = await supabase
      .from('agent_heartbeats')
      .select('agent_id')
      .lt('last_seen', offlineCutoff)

    if (offlineAgents && offlineAgents.length > 0) {
      const offlineIds = offlineAgents.map(a => a.agent_id)
      const { data: orphanTasks } = await supabase
        .from('agent_tasks_v2')
        .select('id')
        .in('assigned_agent_id', offlineIds)
        .in('status', ['claimed', 'in_progress'])

      if (orphanTasks) {
        for (const task of orphanTasks) {
          await supabase.from('agent_tasks_v2').update({
            status: 'ready', assigned_agent_id: null, assigned_at: null, started_at: null,
            context_summary: '[Auto-released: assigned agent went offline]',
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
