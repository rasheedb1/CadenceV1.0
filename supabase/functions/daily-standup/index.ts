/**
 * Daily Standup — Automated team summary via WhatsApp
 *
 * Triggered by pg_cron every day at 9:00 AM (America/Mexico_City).
 * Queries agent_standup view, formats a WhatsApp-friendly summary,
 * and sends it via the Twilio bridge callback endpoint.
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'

const BRIDGE_CALLBACK = 'https://twilio-bridge-production-241b.up.railway.app/api/agent-callback'

Deno.serve(async (req: Request) => {
  const corsResult = handleCors(req)
  if (corsResult) return corsResult

  const supabase = createSupabaseClient()

  try {
    // 1. Get team standup data
    const { data: standup, error: standupErr } = await supabase
      .from('agent_standup')
      .select('*')

    if (standupErr) throw new Error(`Standup query failed: ${standupErr.message}`)
    if (!standup || standup.length === 0) {
      return jsonResponse({ success: true, message: 'No agents to report' })
    }

    // 2. Get active/paused projects
    const { data: projects } = await supabase
      .from('agent_projects')
      .select('name, status, current_iteration, updated_at')
      .in('status', ['active', 'paused'])
      .order('updated_at', { ascending: false })
      .limit(5)

    // 3. Get pending check-ins
    const { data: checkins } = await supabase
      .from('agent_checkins')
      .select('agent_id, summary')
      .eq('needs_approval', true)
      .eq('status', 'sent')
      .limit(5)

    // 4. Format the standup message
    const now = new Date()
    const dateStr = now.toLocaleDateString('es-MX', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'America/Mexico_City',
    })

    let msg = `📋 *Standup del equipo* — ${dateStr}\n\n`

    // Agent status table
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

    // Projects
    if (projects && projects.length > 0) {
      msg += '---\n📁 *Proyectos*\n'
      for (const p of projects) {
        const statusIcon = p.status === 'active' ? '▶️' : '⏸️'
        msg += `${statusIcon} "${p.name}" — ${p.status} (iter ${p.current_iteration || 0})\n`
      }
      msg += '\n'
    }

    // Pending check-ins
    if (checkins && checkins.length > 0) {
      const agentNames: Record<string, string> = {}
      standup.forEach((a: { agent_id: string; agent_name: string }) => {
        agentNames[a.agent_id] = a.agent_name
      })
      msg += '---\n⏳ *Check-ins esperando tu respuesta*\n'
      for (const c of checkins) {
        msg += `• ${agentNames[c.agent_id] || 'Agente'}: ${(c.summary || '').substring(0, 80)}\n`
      }
      msg += '\n'
    }

    msg += '_Responde a este mensaje para dar instrucciones al equipo._'

    // 5. Get WhatsApp number from chief_sessions (first org admin)
    const { data: sessions } = await supabase
      .from('chief_sessions')
      .select('whatsapp_number')
      .limit(5)

    const numbers = (sessions || [])
      .map((s: { whatsapp_number: string }) => s.whatsapp_number)
      .filter(Boolean)

    if (numbers.length === 0) {
      console.log('[standup] No WhatsApp numbers found, skipping send')
      return jsonResponse({ success: true, message: 'No recipients', standup: msg })
    }

    // 6. Send to all registered WhatsApp numbers
    const sent: string[] = []
    for (const waNumber of numbers) {
      try {
        await fetch(BRIDGE_CALLBACK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_name: 'Chief',
            result: { text: msg },
            whatsapp_number: waNumber,
          }),
        })
        sent.push(waNumber)
      } catch (err) {
        console.error(`[standup] Failed to send to ${waNumber}:`, err)
      }
    }

    console.log(`[standup] Sent to ${sent.length} recipients`)
    return jsonResponse({ success: true, sent: sent.length, standup: msg })

  } catch (err) {
    console.error('[standup] Error:', err)
    return errorResponse(err instanceof Error ? err.message : 'Error interno', 500)
  }
})
