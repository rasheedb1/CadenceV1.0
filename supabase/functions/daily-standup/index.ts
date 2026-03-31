/**
 * Daily Standup — Automated team summary via WhatsApp
 *
 * Triggered by pg_cron every hour (weekdays). Checks each user's
 * configured timezone + standup_hour to decide if it's time to send.
 * This way users in different timezones all get their standup at their local 9am.
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'

const BRIDGE_CALLBACK = 'https://twilio-bridge-production-241b.up.railway.app/api/agent-callback'

function getCurrentHourInTimezone(tz: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz })
    return parseInt(formatter.format(new Date()), 10)
  } catch {
    return -1 // invalid timezone
  }
}

Deno.serve(async (req: Request) => {
  const corsResult = handleCors(req)
  if (corsResult) return corsResult

  const supabase = createSupabaseClient()

  // Allow force-send via POST body { "force": true }
  let force = false
  try {
    const body = await req.json().catch(() => ({}))
    force = body?.force === true
  } catch { /* empty body is fine */ }

  try {
    // 1. Get all sessions with standup enabled
    const { data: sessions, error: sessErr } = await supabase
      .from('chief_sessions')
      .select('whatsapp_number, org_id, timezone, standup_hour, standup_enabled')

    if (sessErr) throw new Error(`Sessions query failed: ${sessErr.message}`)
    if (!sessions || sessions.length === 0) {
      return jsonResponse({ success: true, message: 'No sessions found' })
    }

    // 2. Filter to users whose local time matches their standup_hour
    const recipients = sessions.filter(s => {
      if (!s.whatsapp_number || !s.standup_enabled) return false
      if (force) return true
      const localHour = getCurrentHourInTimezone(s.timezone || 'America/Mexico_City')
      return localHour === (s.standup_hour ?? 9)
    })

    if (recipients.length === 0) {
      return jsonResponse({ success: true, message: 'No recipients at this hour', checked: sessions.length })
    }

    // 3. Get team standup data
    const { data: standup } = await supabase.from('agent_standup').select('*')

    // 4. Get active/paused projects
    const { data: projects } = await supabase
      .from('agent_projects')
      .select('name, status, current_iteration, updated_at')
      .in('status', ['active', 'paused'])
      .order('updated_at', { ascending: false })
      .limit(5)

    // 5. Get pending check-ins
    const { data: checkins } = await supabase
      .from('agent_checkins')
      .select('agent_id, summary')
      .eq('needs_approval', true)
      .eq('status', 'sent')
      .limit(5)

    // 6. Format message
    const now = new Date()
    const dateStr = now.toLocaleDateString('es-MX', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: recipients[0]?.timezone || 'America/Mexico_City',
    })

    let msg = `📋 *Standup del equipo* — ${dateStr}\n\n`

    if (standup && standup.length > 0) {
      for (const a of standup) {
        const icon = a.availability === 'working' ? '🔵' :
                     a.availability === 'blocked' ? '🔴' : '🟢'
        const model = (a.model || '').split('-')[1] || '?'
        msg += `${icon} *${a.agent_name}* (${a.agent_role})\n`
        msg += `   ${model} | ${a.team || '—'} | `
        msg += `${a.tasks_done_24h || 0} completadas | `
        msg += `${a.tasks_in_progress || 0} en progreso | `
        msg += `${a.tasks_backlog || 0} pendientes`
        if (a.tasks_blocked) msg += ` | ⚠️ ${a.tasks_blocked} bloqueadas`
        msg += '\n\n'
      }
    } else {
      msg += '_No hay agentes activos._\n\n'
    }

    if (projects && projects.length > 0) {
      msg += '---\n📁 *Proyectos*\n'
      for (const p of projects) {
        const statusIcon = p.status === 'active' ? '▶️' : '⏸️'
        msg += `${statusIcon} "${p.name}" — ${p.status} (iter ${p.current_iteration || 0})\n`
      }
      msg += '\n'
    }

    if (checkins && checkins.length > 0) {
      const agentNames: Record<string, string> = {}
      standup?.forEach((a: { agent_id: string; agent_name: string }) => {
        agentNames[a.agent_id] = a.agent_name
      })
      msg += '---\n⏳ *Check-ins esperando tu respuesta*\n'
      for (const c of checkins) {
        msg += `• ${agentNames[c.agent_id] || 'Agente'}: ${(c.summary || '').substring(0, 80)}\n`
      }
      msg += '\n'
    }

    msg += '_Responde a este mensaje para dar instrucciones al equipo._'

    // 7. Send to each recipient
    const sent: string[] = []
    for (const r of recipients) {
      try {
        await fetch(BRIDGE_CALLBACK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_name: 'Chief',
            result: { text: msg },
            whatsapp_number: r.whatsapp_number,
          }),
        })
        sent.push(r.whatsapp_number)
      } catch (err) {
        console.error(`[standup] Failed to send to ${r.whatsapp_number}:`, err)
      }
    }

    console.log(`[standup] Sent to ${sent.length}/${recipients.length} recipients`)
    return jsonResponse({ success: true, sent: sent.length, recipients: recipients.length })

  } catch (err) {
    console.error('[standup] Error:', err)
    return errorResponse(err instanceof Error ? err.message : 'Error interno', 500)
  }
})
