import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'

const VALID_ENTRY_TYPES = ['task', 'artifact', 'decision', 'status', 'blocker', 'note']
const VALID_ACTIONS = ['claim', 'unclaim', 'complete', 'block', 'cancel', 'update']

Deno.serve(async (req: Request) => {
  // Handle CORS — note: PATCH is handled by the shared corsHeaders but we
  // return preflight manually here to include PATCH in allowed methods
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, GET, PATCH, OPTIONS',
      },
    })
  }

  const supabase = createSupabaseClient()

  try {
    const method = req.method

    // ─── GET — Read from the blackboard ─────────────────────────────────
    if (method === 'GET') {
      const url = new URL(req.url)
      const orgId = url.searchParams.get('org_id')
      const projectId = url.searchParams.get('project_id')
      const entryType = url.searchParams.get('entry_type')
      const status = url.searchParams.get('status')
      const assigneeAgentId = url.searchParams.get('assignee_agent_id')
      const available = url.searchParams.get('available')
      const limit = parseInt(url.searchParams.get('limit') || '50', 10)

      if (!orgId) return errorResponse('Missing org_id', 400)

      let query = supabase
        .from('project_board')
        .select('*')
        .eq('org_id', orgId)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)

      if (projectId) query = query.eq('project_id', projectId)
      if (entryType) query = query.eq('entry_type', entryType)

      // Shortcut: available=true → status=available AND no assignee
      if (available === 'true') {
        query = query.eq('status', 'available').is('assignee_agent_id', null)
      } else {
        if (status) query = query.eq('status', status)
        if (assigneeAgentId) query = query.eq('assignee_agent_id', assigneeAgentId)
      }

      const { data, error } = await query
      if (error) return errorResponse(error.message, 500)
      return jsonResponse({ success: true, entries: data })
    }

    // ─── POST — Write to the blackboard ─────────────────────────────────
    if (method === 'POST') {
      const body = await req.json()
      const {
        org_id,
        project_id,
        entry_type,
        title,
        content,
        priority,
        depends_on,
        assignee_agent_id,
      } = body

      if (!org_id || !entry_type || !title) {
        return errorResponse('Missing required fields: org_id, entry_type, title', 400)
      }

      if (!VALID_ENTRY_TYPES.includes(entry_type)) {
        return errorResponse(`Invalid entry_type. Must be one of: ${VALID_ENTRY_TYPES.join(', ')}`, 400)
      }

      const row: Record<string, unknown> = {
        org_id,
        entry_type,
        title,
        content: content || {},
        priority: priority ?? 0,
        status: 'available',
      }

      if (project_id) row.project_id = project_id
      if (depends_on && Array.isArray(depends_on)) row.depends_on = depends_on
      if (assignee_agent_id) {
        row.assignee_agent_id = assignee_agent_id
        row.status = 'claimed'
        row.claimed_at = new Date().toISOString()
      }

      const { data: entry, error } = await supabase
        .from('project_board')
        .insert(row)
        .select()
        .single()

      if (error) return errorResponse(error.message, 500)
      return jsonResponse({ success: true, entry }, 201)
    }

    // ─── PATCH — Update entry (claim, unclaim, complete, block, cancel, update) ─
    if (method === 'PATCH') {
      const body = await req.json()
      const { entry_id, action, agent_id, content, result } = body

      if (!entry_id || !action) {
        return errorResponse('Missing required fields: entry_id, action', 400)
      }

      if (!VALID_ACTIONS.includes(action)) {
        return errorResponse(`Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`, 400)
      }

      const now = new Date().toISOString()

      // ── claim: ATOMIC — only claim if status=available AND unassigned ──
      if (action === 'claim') {
        if (!agent_id) return errorResponse('Missing agent_id for claim action', 400)

        // Atomic claim: UPDATE ... WHERE status='available' AND assignee_agent_id IS NULL
        const { data: claimed, error: claimErr } = await supabase
          .from('project_board')
          .update({
            status: 'claimed',
            assignee_agent_id: agent_id,
            claimed_at: now,
            updated_at: now,
          })
          .eq('id', entry_id)
          .eq('status', 'available')
          .is('assignee_agent_id', null)
          .select()
          .maybeSingle()

        if (claimErr) return errorResponse(claimErr.message, 500)
        if (!claimed) {
          return errorResponse('Entry not available for claiming (already claimed or does not exist)', 409)
        }
        return jsonResponse({ success: true, entry: claimed })
      }

      // ── unclaim: release back to available ──
      if (action === 'unclaim') {
        const { data: entry, error: err } = await supabase
          .from('project_board')
          .update({
            status: 'available',
            assignee_agent_id: null,
            claimed_at: null,
            updated_at: now,
          })
          .eq('id', entry_id)
          .select()
          .single()

        if (err) return errorResponse(err.message, 500)
        return jsonResponse({ success: true, entry })
      }

      // ── complete ──
      if (action === 'complete') {
        const updates: Record<string, unknown> = {
          status: 'done',
          completed_at: now,
          updated_at: now,
        }
        if (result !== undefined) updates.result = result

        const { data: entry, error: err } = await supabase
          .from('project_board')
          .update(updates)
          .eq('id', entry_id)
          .select()
          .single()

        if (err) return errorResponse(err.message, 500)
        return jsonResponse({ success: true, entry })
      }

      // ── block ──
      if (action === 'block') {
        const updates: Record<string, unknown> = {
          status: 'blocked',
          updated_at: now,
        }
        if (result !== undefined) updates.result = result

        const { data: entry, error: err } = await supabase
          .from('project_board')
          .update(updates)
          .eq('id', entry_id)
          .select()
          .single()

        if (err) return errorResponse(err.message, 500)
        return jsonResponse({ success: true, entry })
      }

      // ── cancel ──
      if (action === 'cancel') {
        const { data: entry, error: err } = await supabase
          .from('project_board')
          .update({ status: 'cancelled', updated_at: now })
          .eq('id', entry_id)
          .select()
          .single()

        if (err) return errorResponse(err.message, 500)
        return jsonResponse({ success: true, entry })
      }

      // ── update: merge content or other fields ──
      if (action === 'update') {
        const updates: Record<string, unknown> = { updated_at: now }
        if (content !== undefined) updates.content = content
        if (result !== undefined) updates.result = result

        const { data: entry, error: err } = await supabase
          .from('project_board')
          .update(updates)
          .eq('id', entry_id)
          .select()
          .single()

        if (err) return errorResponse(err.message, 500)
        return jsonResponse({ success: true, entry })
      }
    }

    return errorResponse(`Method ${method} not allowed`, 405)
  } catch (err) {
    console.error('blackboard error:', err)
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500)
  }
})
