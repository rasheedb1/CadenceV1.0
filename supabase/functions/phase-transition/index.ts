/**
 * Phase Transition — Auto-generates tasks for a project phase
 *
 * Called when:
 * 1. A project is created (generate tasks for Phase 1)
 * 2. A phase completes (generate tasks for the next phase)
 *
 * Uses Anthropic Haiku to decompose phase description into 3-7 concrete tasks
 * with capabilities, priorities, and dependencies.
 */

import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const CALLBACK_URL = 'https://twilio-bridge-production-241b.up.railway.app/api/agent-callback'

async function callHaiku(prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`)
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

Deno.serve(async (req: Request) => {
  const corsResult = handleCors(req)
  if (corsResult) return corsResult

  const supabase = createSupabaseClient()

  try {
    const body = await req.json()
    const { project_id, phase_id } = body

    if (!project_id) return errorResponse('Missing project_id', 400)

    // 1. Load project
    const { data: project, error: projErr } = await supabase
      .from('agent_projects')
      .select('id, org_id, name, description')
      .eq('id', project_id)
      .single()
    if (projErr || !project) return errorResponse('Project not found', 404)

    // 2. Load the target phase (either specified or first in_progress)
    let phase
    if (phase_id) {
      const { data } = await supabase
        .from('agent_project_phases')
        .select('*')
        .eq('id', phase_id)
        .single()
      phase = data
    } else {
      const { data } = await supabase
        .from('agent_project_phases')
        .select('*')
        .eq('project_id', project_id)
        .eq('status', 'in_progress')
        .order('phase_number', { ascending: true })
        .limit(1)
        .single()
      phase = data
    }
    if (!phase) return jsonResponse({ success: true, message: 'No in_progress phase found' })

    // 3. Load the agent assigned to this phase
    const { data: agent } = await supabase
      .from('agents')
      .select('id, name, role, capabilities')
      .eq('id', phase.agent_id)
      .single()

    // 4. Load previous phase results for context
    let previousContext = ''
    if (phase.phase_number > 1) {
      const { data: prevPhases } = await supabase
        .from('agent_project_phases')
        .select('name, result')
        .eq('project_id', project_id)
        .lt('phase_number', phase.phase_number)
        .eq('status', 'completed')
        .order('phase_number', { ascending: true })

      if (prevPhases && prevPhases.length > 0) {
        previousContext = prevPhases.map(p =>
          `Phase "${p.name}" completed: ${typeof p.result === 'string' ? p.result.substring(0, 300) : JSON.stringify(p.result).substring(0, 300)}`
        ).join('\n')
      }
    }

    // 5. Load ALL active agents for task distribution
    const { data: allAgents } = await supabase
      .from('agents')
      .select('id, name, role, capabilities')
      .eq('org_id', project.org_id)
      .neq('status', 'destroyed')

    const agentList = (allAgents || []).map(a =>
      `- ${a.name} (${a.role}): capabilities=[${(a.capabilities || []).join(',')}]`
    ).join('\n')

    // Map task_type → required_capabilities
    const TYPE_CAPS: Record<string, string[]> = {
      design: ['design'],
      code: ['code', 'ops'],
      research: ['research'],
      qa: ['outreach', 'research'],
      outreach: ['outreach'],
      writing: [],      // any agent
      general: [],      // any agent
    }

    const prompt = `Decompose this project phase into 3-7 concrete, actionable tasks.
IMPORTANT: Distribute tasks across ALL available agents, not just one.

PROJECT: ${project.name}
${project.description ? `DESCRIPTION: ${project.description.substring(0, 500)}` : ''}

PHASE ${phase.phase_number}: ${phase.name}
PHASE DESCRIPTION: ${phase.description || phase.name}

AVAILABLE AGENTS:
${agentList}

${previousContext ? `PREVIOUS PHASES COMPLETED:\n${previousContext}` : ''}

Return ONLY a JSON array. Each task must have:
- title (string, concise)
- description (string, specific instructions)
- task_type (design|code|research|qa|outreach|writing|general)
- priority (0-100, lower = more urgent)
- depends_on_index (number or null, index of task that must complete first)

RULES:
- Generate tasks that match DIFFERENT agent capabilities so ALL agents get work
- design tasks → for agents with design capability
- code tasks → for agents with code capability
- qa/outreach tasks → for agents with outreach capability
- At least 1 task per available agent
- Max 7 tasks total

Return ONLY the JSON array.`

    const llmResponse = await callHaiku(prompt)

    // Parse tasks from LLM response
    const jsonMatch = llmResponse.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error('[phase-transition] No JSON array in LLM response:', llmResponse.substring(0, 200))
      return errorResponse('Failed to parse tasks from LLM', 500)
    }

    let tasks: Array<{
      title: string
      description: string
      task_type: string
      priority: number
      depends_on_index: number | null
    }>
    try {
      tasks = JSON.parse(jsonMatch[0])
    } catch (e) {
      console.error('[phase-transition] JSON parse error:', e)
      return errorResponse('Invalid JSON from LLM', 500)
    }

    // Cap at 7 tasks
    tasks = tasks.slice(0, 7)

    // 6. Insert tasks into agent_tasks_v2
    const createdTaskIds: string[] = []
    const taskIdMap: Record<number, string> = {} // index → uuid for depends_on resolution

    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i]

      // Resolve depends_on
      const dependsOn: string[] = []
      if (t.depends_on_index !== null && t.depends_on_index !== undefined && taskIdMap[t.depends_on_index]) {
        dependsOn.push(taskIdMap[t.depends_on_index])
      }

      // Determine status: if has unresolved dependency → backlog, else ready
      const taskStatus = dependsOn.length > 0 ? 'backlog' : 'ready'

      const { data: created, error: taskErr } = await supabase
        .from('agent_tasks_v2')
        .insert({
          org_id: project.org_id,
          project_id: project.id,
          phase_id: phase.id,
          title: t.title,
          description: t.description,
          task_type: t.task_type || 'general',
          required_capabilities: TYPE_CAPS[t.task_type] || [],
          priority: t.priority || 50,
          depends_on: dependsOn,
          status: taskStatus,
          parent_result_summary: previousContext ? previousContext.substring(0, 500) : null,
          created_by: 'auto-decompose',
        })
        .select('id')
        .single()

      if (taskErr) {
        console.error(`[phase-transition] Task insert error:`, taskErr.message)
        continue
      }
      if (created) {
        createdTaskIds.push(created.id)
        taskIdMap[i] = created.id
      }
    }

    // 7. Update phase with task IDs
    await supabase
      .from('agent_project_phases')
      .update({ task_ids: createdTaskIds })
      .eq('id', phase.id)

    // 8. Notify via WhatsApp
    const taskSummary = tasks.map((t, i) => `${i + 1}. ${t.title} (${t.task_type}, P${t.priority})`).join('\n')
    try {
      await fetch(CALLBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_name: 'Chief',
          result: {
            text: `📋 *Fase ${phase.phase_number}: ${phase.name}* — ${createdTaskIds.length} tareas creadas\n\n${taskSummary}\n\n${agent?.name || 'Agente'} empezará a reclamarlas automáticamente.\nReply STOP para pausar.`
          },
          whatsapp_number: null,
        }),
      })
    } catch {}

    console.log(`[phase-transition] Created ${createdTaskIds.length} tasks for phase ${phase.phase_number} of project ${project.name}`)

    return jsonResponse({
      success: true,
      project: project.name,
      phase: phase.name,
      phase_number: phase.phase_number,
      tasks_created: createdTaskIds.length,
      task_ids: createdTaskIds,
    })

  } catch (err) {
    console.error('[phase-transition] Error:', err)
    return errorResponse(err instanceof Error ? err.message : 'Error interno', 500)
  }
})
