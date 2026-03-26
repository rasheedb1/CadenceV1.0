import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'

Deno.serve(async (req: Request) => {
  const corsResult = handleCors(req)
  if (corsResult) return corsResult

  const supabase = createSupabaseClient()

  try {
    const method = req.method

    // GET — List agents by org_id
    if (method === 'GET') {
      const url = new URL(req.url)
      const orgId = url.searchParams.get('org_id')
      const agentId = url.searchParams.get('agent_id')

      if (agentId) {
        const { data, error } = await supabase
          .from('agents')
          .select('*, agent_skills(*)')
          .eq('id', agentId)
          .single()
        if (error) return errorResponse(error.message, 404)
        return jsonResponse({ success: true, agent: data })
      }

      if (!orgId) return errorResponse('Missing org_id', 400)

      const { data, error } = await supabase
        .from('agents')
        .select('*, agent_skills(*)')
        .eq('org_id', orgId)
        .neq('status', 'destroyed')
        .order('created_at', { ascending: false })

      if (error) return errorResponse(error.message, 500)
      return jsonResponse({ success: true, agents: data })
    }

    // POST — Create agent
    if (method === 'POST') {
      const body = await req.json()
      const { org_id, name, role, description, soul_md, skills, config, created_by } = body

      if (!org_id || !name || !role || !soul_md) {
        return errorResponse('Missing required fields: org_id, name, role, soul_md', 400)
      }

      const { data: agent, error: agentErr } = await supabase
        .from('agents')
        .insert({
          org_id,
          name,
          role,
          description: description || null,
          soul_md,
          config: config || {},
          created_by: created_by || null,
        })
        .select()
        .single()

      if (agentErr) return errorResponse(agentErr.message, 500)

      // Insert skills if provided
      if (skills && Array.isArray(skills) && skills.length > 0) {
        const skillRows = skills.map((s: string) => ({
          agent_id: agent.id,
          skill_name: s,
        }))
        const { error: skillsErr } = await supabase
          .from('agent_skills')
          .insert(skillRows)
        if (skillsErr) {
          console.error('Error inserting skills:', skillsErr.message)
        }
      }

      // Re-fetch with skills
      const { data: full } = await supabase
        .from('agents')
        .select('*, agent_skills(*)')
        .eq('id', agent.id)
        .single()

      return jsonResponse({ success: true, agent: full }, 201)
    }

    // PATCH — Update agent
    if (method === 'PATCH') {
      const body = await req.json()
      const { agent_id, updates, skills } = body

      if (!agent_id) return errorResponse('Missing agent_id', 400)

      if (updates && Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString()
        const { error } = await supabase
          .from('agents')
          .update(updates)
          .eq('id', agent_id)
        if (error) return errorResponse(error.message, 500)
      }

      // Replace skills if provided
      if (skills && Array.isArray(skills)) {
        await supabase.from('agent_skills').delete().eq('agent_id', agent_id)
        if (skills.length > 0) {
          const skillRows = skills.map((s: string) => ({
            agent_id,
            skill_name: s,
          }))
          await supabase.from('agent_skills').insert(skillRows)
        }
      }

      const { data: full } = await supabase
        .from('agents')
        .select('*, agent_skills(*)')
        .eq('id', agent_id)
        .single()

      return jsonResponse({ success: true, agent: full })
    }

    // DELETE — Soft delete
    if (method === 'DELETE') {
      const body = await req.json()
      const { agent_id } = body

      if (!agent_id) return errorResponse('Missing agent_id', 400)

      const { error } = await supabase
        .from('agents')
        .update({ status: 'destroyed', updated_at: new Date().toISOString() })
        .eq('id', agent_id)

      if (error) return errorResponse(error.message, 500)
      return jsonResponse({ success: true })
    }

    return errorResponse(`Method ${method} not allowed`, 405)
  } catch (err) {
    console.error('manage-agent error:', err)
    return errorResponse(err instanceof Error ? err.message : 'Error interno', 500)
  }
})
