/**
 * Daily Cost Report — Sends a daily cost summary via WhatsApp
 *
 * Triggered by pg_cron at the user's local 8am (timezone-aware).
 * Reports yesterday's spend, top expensive tasks, and current cap usage.
 *
 * POST { "force": true } to bypass timezone check.
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'

const BRIDGE_CALLBACK = 'https://twilio-bridge-production-241b.up.railway.app/api/agent-callback'

function getCurrentHourInTimezone(tz: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz })
    return parseInt(formatter.format(new Date()), 10)
  } catch {
    return -1
  }
}

Deno.serve(async (req: Request) => {
  const corsResult = handleCors(req)
  if (corsResult) return corsResult

  const supabase = createSupabaseClient()

  let force = false
  try {
    const body = await req.json().catch(() => ({}))
    force = body?.force === true
  } catch { /* empty body */ }

  try {
    // 1. Get all sessions
    const { data: sessions } = await supabase
      .from('chief_sessions')
      .select('whatsapp_number, org_id, timezone, standup_hour, standup_enabled')

    if (!sessions || sessions.length === 0) {
      return jsonResponse({ success: true, message: 'No sessions' })
    }

    // 2. Filter recipients (8am local, 1 hour before standup which is at 9am default)
    const recipients = sessions.filter(s => {
      if (!s.whatsapp_number || !s.standup_enabled) return false
      if (force) return true
      const localHour = getCurrentHourInTimezone(s.timezone || 'America/Mexico_City')
      const reportHour = (s.standup_hour ?? 9) - 1 // 1 hour before standup
      return localHour === reportHour
    })

    if (recipients.length === 0) {
      return jsonResponse({ success: true, message: 'No recipients at this hour', checked: sessions.length })
    }

    const reports: Array<{ org: string; sent: boolean }> = []

    for (const session of recipients) {
      const orgId = session.org_id
      if (!orgId) continue

      // 3. Fetch cost data from views
      const { data: agentCosts } = await supabase
        .from('cost_by_agent_today')
        .select('agent_name, model, cost_today, cost_total, cap_pct_used, tasks_done_today')
        .eq('org_id', orgId)

      const { data: expensiveTasks } = await supabase
        .from('expensive_tasks_24h')
        .select('title, agent_name, cost_usd, task_type')
        .eq('org_id', orgId)
        .limit(5)

      const { data: byTaskType } = await supabase
        .from('cost_by_task_type')
        .select('task_type, total_cost, task_count, avg_cost_per_task')
        .eq('org_id', orgId)
        .limit(5)

      // 4. Compute totals
      const totalToday = (agentCosts || []).reduce((sum, a: any) => sum + Number(a.cost_today || 0), 0)
      const totalAllTime = (agentCosts || []).reduce((sum, a: any) => sum + Number(a.cost_total || 0), 0)
      const tasksToday = (agentCosts || []).reduce((sum, a: any) => sum + Number(a.tasks_done_today || 0), 0)

      // 5. Build the report message
      let message = `📊 *Daily Cost Report*\n\n`
      message += `💰 *Yesterday's spend: $${totalToday.toFixed(2)}*\n`
      message += `📈 All-time total: $${totalAllTime.toFixed(2)}\n`
      message += `✅ Tasks completed: ${tasksToday}\n`

      if (totalToday > 0) {
        const avgCost = totalToday / Math.max(tasksToday, 1)
        message += `💵 Avg cost/task: $${avgCost.toFixed(4)}\n`
      }

      // Per-agent breakdown
      message += `\n*By agent:*\n`
      for (const a of (agentCosts || []) as any[]) {
        if (a.cost_today > 0 || a.tasks_done_today > 0) {
          const modelShort = a.model?.includes('haiku') ? 'haiku' : a.model?.includes('opus') ? 'opus' : 'sonnet'
          message += `• ${a.agent_name} (${modelShort}): $${Number(a.cost_today).toFixed(4)} · ${a.tasks_done_today} tasks · ${a.cap_pct_used}% cap\n`
        }
      }

      // Top expensive tasks
      if (expensiveTasks && expensiveTasks.length > 0) {
        message += `\n*Most expensive tasks (24h):*\n`
        for (const t of expensiveTasks as any[]) {
          message += `• $${Number(t.cost_usd).toFixed(4)} — ${t.title?.substring(0, 50)} (${t.agent_name})\n`
        }
      }

      // Cost by type
      if (byTaskType && byTaskType.length > 0) {
        message += `\n*By task type (30d):*\n`
        for (const t of byTaskType as any[]) {
          message += `• ${t.task_type}: $${Number(t.total_cost).toFixed(2)} (${t.task_count} tasks, avg $${Number(t.avg_cost_per_task).toFixed(4)})\n`
        }
      }

      // Alert if any agent is over 80%
      const overCap = (agentCosts || []).filter((a: any) => a.cap_pct_used >= 80)
      if (overCap.length > 0) {
        message += `\n⚠️ *AGENTES SOBRE 80% del cap:*\n`
        for (const a of overCap as any[]) {
          message += `• ${a.agent_name}: ${a.cap_pct_used}%\n`
        }
      }

      // 6. Send via bridge callback
      try {
        await fetch(BRIDGE_CALLBACK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_name: 'Chief',
            result: { text: message },
            whatsapp_number: session.whatsapp_number,
          }),
        })
        reports.push({ org: orgId, sent: true })
      } catch (e) {
        reports.push({ org: orgId, sent: false })
      }
    }

    return jsonResponse({ success: true, reports, checked: sessions.length })
  } catch (e: any) {
    return errorResponse(`Daily cost report error: ${e.message}`, 500)
  }
})
