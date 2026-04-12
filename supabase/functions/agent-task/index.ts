import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'

Deno.serve(async (req: Request) => {
  const corsResult = handleCors(req)
  if (corsResult) return corsResult

  const supabase = createSupabaseClient()

  try {
    const method = req.method

    // GET — List tasks (reads from agent_tasks_v2)
    if (method === 'GET') {
      const url = new URL(req.url)
      const orgId = url.searchParams.get('org_id')
      const agentId = url.searchParams.get('agent_id')
      const status = url.searchParams.get('status')
      const limit = parseInt(url.searchParams.get('limit') || '20', 10)

      if (!orgId) return errorResponse('Missing org_id', 400)

      let query = supabase
        .from('agent_tasks_v2')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (agentId) query = query.eq('assigned_agent_id', agentId)
      if (status) query = query.eq('status', status)

      const { data, error } = await query
      if (error) return errorResponse(error.message, 500)
      return jsonResponse({ success: true, tasks: data })
    }

    // POST — Create task (writes to agent_tasks_v2 so agents can see it)
    if (method === 'POST') {
      const body = await req.json()
      const { org_id, agent_id, instruction, delegated_by, task_type, priority } = body

      if (!org_id || !agent_id || !instruction || !delegated_by) {
        return errorResponse('Missing required fields: org_id, agent_id, instruction, delegated_by', 400)
      }

      const { data: task, error } = await supabase
        .from('agent_tasks_v2')
        .insert({
          org_id,
          title: (instruction as string).substring(0, 120),
          description: instruction,
          task_type: task_type || 'general',
          assigned_agent_id: agent_id,
          assigned_at: new Date().toISOString(),
          status: 'claimed',
          priority: priority || 10,
          created_by: delegated_by,
        })
        .select()
        .single()

      if (error) return errorResponse(error.message, 500)

      // Log the instruction as a message
      await supabase.from('agent_messages').insert({
        org_id,
        to_agent_id: agent_id,
        role: 'user',
        content: instruction,
        message_type: 'task',
        metadata: { delegated_by, task_id: task.id },
      })

      return jsonResponse({ success: true, task }, 201)
    }

    // PATCH — Update task status/result
    if (method === 'PATCH') {
      const body = await req.json()
      const { task_id, status, result, error: taskError } = body

      if (!task_id) return errorResponse('Missing task_id', 400)

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (status) {
        updates.status = status
        if (status === 'in_progress') updates.started_at = new Date().toISOString()
        if (status === 'done' || status === 'failed') updates.completed_at = new Date().toISOString()
      }
      if (result !== undefined) updates.result = result
      if (taskError !== undefined) updates.error = taskError

      const { data: task, error: updateErr } = await supabase
        .from('agent_tasks_v2')
        .update(updates)
        .eq('id', task_id)
        .select()
        .single()

      if (updateErr) return errorResponse(updateErr.message, 500)
      return jsonResponse({ success: true, task })
    }

    return errorResponse(`Method ${method} not allowed`, 405)
  } catch (err) {
    console.error('agent-task error:', err)
    return errorResponse(err instanceof Error ? err.message : 'Error interno', 500)
  }
})
