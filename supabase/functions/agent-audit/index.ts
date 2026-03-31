/**
 * Agent Audit Trail — Consolidated activity export
 *
 * GET ?org_id=X&agent_id=Y&from=ISO&to=ISO&limit=100
 *
 * Returns unified timeline: tasks, messages, activity events, check-ins, budget changes
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'

Deno.serve(async (req: Request) => {
  const corsResult = handleCors(req)
  if (corsResult) return corsResult

  const supabase = createSupabaseClient()
  const url = new URL(req.url)
  const orgId = url.searchParams.get('org_id')
  const agentId = url.searchParams.get('agent_id')
  const from = url.searchParams.get('from') || new Date(Date.now() - 7 * 86400000).toISOString()
  const to = url.searchParams.get('to') || new Date().toISOString()
  const limit = parseInt(url.searchParams.get('limit') || '200', 10)

  if (!orgId) return errorResponse('Missing org_id', 400)

  try {
    const timeline: Array<{
      type: string
      agent_id: string | null
      agent_name?: string
      content: string
      detail?: string
      cost_usd?: number
      tokens?: number
      timestamp: string
    }> = []

    // 1. Tasks v2
    let taskQuery = supabase.from('agent_tasks_v2').select('*').eq('org_id', orgId)
      .gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false }).limit(limit)
    if (agentId) taskQuery = taskQuery.eq('assigned_agent_id', agentId)
    const { data: tasks } = await taskQuery
    if (tasks) {
      for (const t of tasks) {
        timeline.push({
          type: 'task', agent_id: t.assigned_agent_id,
          content: `[${t.status}] ${t.title}${t.result ? ' → ' + JSON.stringify(t.result).substring(0, 200) : ''}`,
          detail: t.task_type, cost_usd: Number(t.cost_usd || 0), tokens: t.tokens_used || 0,
          timestamp: t.completed_at || t.started_at || t.created_at,
        })
      }
    }

    // 2. Messages
    let msgQuery = supabase.from('agent_messages').select('*').eq('org_id', orgId)
      .gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false }).limit(limit)
    if (agentId) msgQuery = msgQuery.or(`from_agent_id.eq.${agentId},to_agent_id.eq.${agentId}`)
    const { data: messages } = await msgQuery
    if (messages) {
      for (const m of messages) {
        timeline.push({
          type: 'message', agent_id: m.from_agent_id,
          content: typeof m.content === 'string' ? m.content.substring(0, 300) : JSON.stringify(m.content).substring(0, 300),
          detail: `${m.role} → ${m.to_agent_id || 'broadcast'}`,
          timestamp: m.created_at,
        })
      }
    }

    // 3. Activity events
    let evtQuery = supabase.from('agent_activity_events').select('*').eq('org_id', orgId)
      .gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false }).limit(limit)
    if (agentId) evtQuery = evtQuery.eq('agent_id', agentId)
    const { data: events } = await evtQuery
    if (events) {
      for (const e of events) {
        timeline.push({
          type: 'activity', agent_id: e.agent_id,
          content: (e.content || '').substring(0, 300),
          detail: `${e.event_type}${e.tool_name ? '/' + e.tool_name : ''}`,
          timestamp: e.created_at,
        })
      }
    }

    // 4. Check-ins
    let ckQuery = supabase.from('agent_checkins').select('*').eq('org_id', orgId)
      .gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false }).limit(50)
    if (agentId) ckQuery = ckQuery.eq('agent_id', agentId)
    const { data: checkins } = await ckQuery
    if (checkins) {
      for (const c of checkins) {
        timeline.push({
          type: 'checkin', agent_id: c.agent_id,
          content: `[${c.status}] ${c.summary || ''}${c.feedback ? ' | Feedback: ' + c.feedback : ''}`,
          detail: c.checkin_type,
          timestamp: c.created_at,
        })
      }
    }

    // Sort by timestamp desc
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Enrich with agent names
    const { data: agents } = await supabase.from('agents').select('id, name').eq('org_id', orgId)
    const nameMap: Record<string, string> = {}
    if (agents) agents.forEach(a => { nameMap[a.id] = a.name })
    for (const entry of timeline) {
      if (entry.agent_id) entry.agent_name = nameMap[entry.agent_id] || undefined
    }

    // Summary
    const totalCost = timeline.filter(t => t.cost_usd).reduce((acc, t) => acc + (t.cost_usd || 0), 0)
    const totalTokens = timeline.filter(t => t.tokens).reduce((acc, t) => acc + (t.tokens || 0), 0)

    return jsonResponse({
      success: true,
      org_id: orgId,
      agent_id: agentId || 'all',
      period: { from, to },
      summary: {
        total_events: timeline.length,
        tasks: timeline.filter(t => t.type === 'task').length,
        messages: timeline.filter(t => t.type === 'message').length,
        activities: timeline.filter(t => t.type === 'activity').length,
        checkins: timeline.filter(t => t.type === 'checkin').length,
        total_cost_usd: parseFloat(totalCost.toFixed(4)),
        total_tokens: totalTokens,
      },
      timeline: timeline.slice(0, limit),
    })
  } catch (err) {
    console.error('[audit] Error:', err)
    return errorResponse(err instanceof Error ? err.message : 'Error interno', 500)
  }
})
