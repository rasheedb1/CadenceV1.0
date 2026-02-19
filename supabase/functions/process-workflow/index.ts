// Edge Function: Process Workflow Runs
// POST /functions/v1/process-workflow
// Processes active workflow runs — executes action nodes, evaluates conditions,
// handles delays, and advances leads through the workflow graph.
// Called via cron (every 5 minutes) or on-demand after webhook events.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getUnipileAccountId, logActivity } from '../_shared/supabase.ts'
import { createUnipileClient } from '../_shared/unipile.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

interface WorkflowRun {
  id: string
  workflow_id: string
  lead_id: string
  owner_id: string
  org_id: string
  current_node_id: string | null
  status: string
  waiting_until: string | null
  waiting_for_event: string | null
  context_json: Record<string, unknown>
  started_at: string
  updated_at: string
}

interface GraphNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

interface GraphEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  label?: string
}

interface WorkflowGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// Map action node types to LinkedIn Edge Function endpoints
const ACTION_TO_ENDPOINT: Record<string, string> = {
  action_linkedin_message: '/functions/v1/linkedin-send-message',
  action_linkedin_connect: '/functions/v1/linkedin-send-connection',
  action_linkedin_like: '/functions/v1/linkedin-like-post',
  action_linkedin_comment: '/functions/v1/linkedin-comment',
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Find the next node(s) from a given node via edges.
 * For condition nodes, pass sourceHandle ('yes' or 'no') to pick the branch.
 */
function getNextNodeId(
  graph: WorkflowGraph,
  currentNodeId: string,
  sourceHandle?: string
): string | null {
  const edge = graph.edges.find(e => {
    if (e.source !== currentNodeId) return false
    if (sourceHandle) return e.sourceHandle === sourceHandle
    return true
  })
  return edge?.target || null
}

/**
 * Execute a LinkedIn action for a workflow run
 */
async function executeAction(
  nodeType: string,
  nodeData: Record<string, unknown>,
  leadId: string,
  ownerId: string,
  orgId: string,
  authToken: string
): Promise<{ success: boolean; error?: string }> {
  const endpoint = ACTION_TO_ENDPOINT[nodeType]

  if (!endpoint) {
    // Manual action types (action_task) — just log and succeed
    if (nodeType === 'action_task') {
      return { success: true }
    }
    return { success: false, error: `Unsupported action type: ${nodeType}` }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const url = `${supabaseUrl}${endpoint}`

  // Build body based on action type
  const body: Record<string, unknown> = { leadId, ownerId, orgId }

  switch (nodeType) {
    case 'action_linkedin_message':
      body.message = (nodeData.messageTemplate as string) || ''
      break
    case 'action_linkedin_connect':
      body.message = (nodeData.noteText as string) || undefined
      break
    case 'action_linkedin_like':
      body.reactionType = (nodeData.reactionType as string) || 'LIKE'
      break
    case 'action_linkedin_comment':
      body.comment = (nodeData.commentText as string) || ''
      break
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken,
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()
    if (!response.ok) {
      return { success: false, error: data.error || `HTTP ${response.status}` }
    }
    return { success: data.success !== false }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Evaluate a condition node and return 'yes' or 'no'
 */
async function evaluateCondition(
  nodeType: string,
  nodeData: Record<string, unknown>,
  run: WorkflowRun,
  lead: Record<string, unknown>
): Promise<'yes' | 'no' | 'wait'> {
  switch (nodeType) {
    case 'condition_connection_accepted': {
      // Check if webhook set the event in context_json
      if (run.context_json?.connection_accepted) {
        return 'yes'
      }
      // Poll via Unipile if we've been waiting for a while
      const accountId = await getUnipileAccountId(run.owner_id)
      if (accountId && lead.linkedin_url) {
        try {
          const client = createUnipileClient()
          const profile = await client.getProfile(accountId, lead.linkedin_url as string)
          if (profile?.is_connected || profile?.relationship === 'CONNECTED') {
            return 'yes'
          }
        } catch {
          // Polling failed, continue waiting
        }
      }
      // Check timeout
      const timeoutDays = (nodeData.timeoutDays as number) || 7
      const waitingSince = new Date(run.updated_at)
      const now = new Date()
      const daysDiff = (now.getTime() - waitingSince.getTime()) / (1000 * 60 * 60 * 24)
      if (daysDiff >= timeoutDays) {
        return 'no'
      }
      return 'wait'
    }

    case 'condition_message_received': {
      if (run.context_json?.message_received) {
        const keyword = (nodeData.keywordFilter as string)?.toLowerCase()
        if (!keyword) return 'yes'
        const receivedMsg = (run.context_json.message_body as string)?.toLowerCase() || ''
        return receivedMsg.includes(keyword) ? 'yes' : 'no'
      }
      const timeoutDays = (nodeData.timeoutDays as number) || 7
      const waitingSince = new Date(run.updated_at)
      const now = new Date()
      const daysDiff = (now.getTime() - waitingSince.getTime()) / (1000 * 60 * 60 * 24)
      if (daysDiff >= timeoutDays) {
        return 'no'
      }
      return 'wait'
    }

    case 'condition_lead_attribute': {
      const field = nodeData.field as string
      const operator = nodeData.operator as string
      const value = (nodeData.value as string)?.toLowerCase() || ''
      const fieldValue = ((lead[field] as string) || '').toLowerCase()

      switch (operator) {
        case 'equals': return fieldValue === value ? 'yes' : 'no'
        case 'contains': return fieldValue.includes(value) ? 'yes' : 'no'
        case 'starts_with': return fieldValue.startsWith(value) ? 'yes' : 'no'
        case 'ends_with': return fieldValue.endsWith(value) ? 'yes' : 'no'
        case 'is_empty': return fieldValue === '' ? 'yes' : 'no'
        case 'is_not_empty': return fieldValue !== '' ? 'yes' : 'no'
        default: return 'no'
      }
    }

    case 'condition_time_elapsed': {
      const duration = (nodeData.duration as number) || 1
      const unit = (nodeData.unit as string) || 'days'
      const multiplier = unit === 'hours' ? 1000 * 60 * 60 : 1000 * 60 * 60 * 24
      const waitingSince = new Date(run.updated_at)
      const elapsed = Date.now() - waitingSince.getTime()
      return elapsed >= duration * multiplier ? 'yes' : 'wait'
    }

    default:
      return 'no'
  }
}

/**
 * Process a single workflow run — execute the current node and advance
 */
async function processRun(
  run: WorkflowRun,
  authToken: string
): Promise<{ success: boolean; action: string; error?: string }> {
  const supabase = createSupabaseClient()

  // Load the workflow graph
  const { data: workflow } = await supabase
    .from('workflows')
    .select('graph_json, status')
    .eq('id', run.workflow_id)
    .single()

  if (!workflow || workflow.status !== 'active') {
    return { success: false, action: 'skip', error: 'Workflow not active' }
  }

  const graph = workflow.graph_json as WorkflowGraph
  if (!run.current_node_id) {
    return { success: false, action: 'skip', error: 'No current node' }
  }

  const currentNode = graph.nodes.find(n => n.id === run.current_node_id)
  if (!currentNode) {
    // Node was deleted — mark run as failed
    await supabase.from('workflow_runs').update({ status: 'failed' }).eq('id', run.id)
    return { success: false, action: 'fail', error: 'Current node not found in graph' }
  }

  const nodeType = currentNode.type
  const nodeData = currentNode.data

  // Load lead data for conditions
  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', run.lead_id)
    .single()

  if (!lead) {
    await supabase.from('workflow_runs').update({ status: 'failed' }).eq('id', run.id)
    return { success: false, action: 'fail', error: 'Lead not found' }
  }

  // Execute based on node type
  let nextNodeId: string | null = null

  if (nodeType.startsWith('trigger_')) {
    // Trigger nodes just pass through to the next node
    nextNodeId = getNextNodeId(graph, currentNode.id)

  } else if (nodeType.startsWith('action_')) {
    // Execute the LinkedIn action
    const result = await executeAction(nodeType, nodeData, run.lead_id, run.owner_id, run.org_id, authToken)

    // Log the event
    await supabase.from('workflow_event_log').insert({
      workflow_run_id: run.id,
      workflow_id: run.workflow_id,
      lead_id: run.lead_id,
      owner_id: run.owner_id,
      org_id: run.org_id,
      node_id: currentNode.id,
      node_type: nodeType,
      action: 'execute',
      status: result.success ? 'success' : 'failed',
      details: { error: result.error },
    })

    if (!result.success) {
      await supabase.from('workflow_runs').update({
        status: 'failed',
        context_json: { ...run.context_json, last_error: result.error },
      }).eq('id', run.id)
      return { success: false, action: 'action_failed', error: result.error }
    }

    nextNodeId = getNextNodeId(graph, currentNode.id)

  } else if (nodeType.startsWith('condition_')) {
    const result = await evaluateCondition(nodeType, nodeData, run, lead)

    if (result === 'wait') {
      // Set run to waiting for the event
      const waitEvent = nodeType === 'condition_connection_accepted'
        ? 'connection_accepted'
        : nodeType === 'condition_message_received'
          ? 'message_received'
          : null

      await supabase.from('workflow_runs').update({
        status: 'waiting',
        waiting_for_event: waitEvent,
      }).eq('id', run.id)

      return { success: true, action: 'waiting' }
    }

    // Log the condition evaluation
    await supabase.from('workflow_event_log').insert({
      workflow_run_id: run.id,
      workflow_id: run.workflow_id,
      lead_id: run.lead_id,
      owner_id: run.owner_id,
      org_id: run.org_id,
      node_id: currentNode.id,
      node_type: nodeType,
      action: `condition_${result}`,
      status: 'success',
      details: { result },
    })

    nextNodeId = getNextNodeId(graph, currentNode.id, result)

  } else if (nodeType === 'delay_wait') {
    const duration = (nodeData.duration as number) || 1
    const unit = (nodeData.unit as string) || 'days'
    const multiplier = unit === 'hours' ? 1000 * 60 * 60 : 1000 * 60 * 60 * 24
    const waitUntil = new Date(Date.now() + duration * multiplier).toISOString()

    await supabase.from('workflow_runs').update({
      status: 'waiting',
      waiting_until: waitUntil,
    }).eq('id', run.id)

    await supabase.from('workflow_event_log').insert({
      workflow_run_id: run.id,
      workflow_id: run.workflow_id,
      lead_id: run.lead_id,
      owner_id: run.owner_id,
      org_id: run.org_id,
      node_id: currentNode.id,
      node_type: nodeType,
      action: 'delay_start',
      status: 'success',
      details: { wait_until: waitUntil, duration, unit },
    })

    return { success: true, action: 'delay_started' }
  }

  // Advance to next node
  if (nextNodeId) {
    await supabase.from('workflow_runs').update({
      current_node_id: nextNodeId,
      status: 'running',
      waiting_until: null,
      waiting_for_event: null,
    }).eq('id', run.id)

    return { success: true, action: 'advanced' }
  } else {
    // No next node — workflow completed for this lead
    await supabase.from('workflow_runs').update({
      status: 'completed',
      current_node_id: null,
    }).eq('id', run.id)

    await supabase.from('workflow_event_log').insert({
      workflow_run_id: run.id,
      workflow_id: run.workflow_id,
      lead_id: run.lead_id,
      owner_id: run.owner_id,
      org_id: run.org_id,
      node_id: currentNode.id,
      node_type: nodeType,
      action: 'workflow_completed',
      status: 'success',
      details: {},
    })

    return { success: true, action: 'completed' }
  }
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization header', 401)
    }

    const supabase = createSupabaseClient()
    const now = new Date().toISOString()

    // Query runs that need processing:
    // 1. Running runs (need to execute their current node)
    // 2. Waiting runs whose wait has expired
    // 3. Waiting runs that might need condition re-evaluation
    const { data: runs, error } = await supabase
      .from('workflow_runs')
      .select('*')
      .or(
        `status.eq.running,` +
        `and(status.eq.waiting,waiting_until.lte.${now}),` +
        `and(status.eq.waiting,waiting_for_event.neq.null)`
      )
      .limit(50)

    if (error) {
      console.error('Error querying workflow runs:', error)
      return errorResponse('Failed to query workflow runs', 500)
    }

    if (!runs || runs.length === 0) {
      return jsonResponse({ success: true, message: 'No workflow runs to process', processed: 0 })
    }

    console.log(`Processing ${runs.length} workflow runs`)

    const results = []

    for (let i = 0; i < runs.length; i++) {
      const run = runs[i] as WorkflowRun

      // For waiting runs with expired delays, set back to running
      if (run.status === 'waiting' && run.waiting_until && new Date(run.waiting_until) <= new Date()) {
        // Advance past the delay node
        const { data: workflow } = await supabase
          .from('workflows')
          .select('graph_json')
          .eq('id', run.workflow_id)
          .single()

        if (workflow && run.current_node_id) {
          const graph = workflow.graph_json as WorkflowGraph
          const nextNodeId = getNextNodeId(graph, run.current_node_id)
          if (nextNodeId) {
            await supabase.from('workflow_runs').update({
              current_node_id: nextNodeId,
              status: 'running',
              waiting_until: null,
              waiting_for_event: null,
            }).eq('id', run.id)
            run.current_node_id = nextNodeId
            run.status = 'running'
          }
        }
      }

      if (run.status !== 'running' && !run.waiting_for_event) continue

      const result = await processRun(run, authHeader)
      results.push({ runId: run.id, ...result })

      // Process the run again if it advanced (to handle sequential nodes)
      let maxIterations = 10
      while (result.success && result.action === 'advanced' && maxIterations > 0) {
        // Refresh the run
        const { data: refreshedRun } = await supabase
          .from('workflow_runs')
          .select('*')
          .eq('id', run.id)
          .single()

        if (!refreshedRun || refreshedRun.status !== 'running') break

        const nextResult = await processRun(refreshedRun as WorkflowRun, authHeader)
        results.push({ runId: run.id, ...nextResult })

        if (nextResult.action !== 'advanced') break
        maxIterations--
      }

      // Add small delay between runs to avoid rate limits
      if (i < runs.length - 1) {
        await sleep(1000)
      }
    }

    const succeeded = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return jsonResponse({
      success: true,
      message: `Processed ${runs.length} workflow runs`,
      processed: runs.length,
      actions: results.length,
      succeeded,
      failed,
      results,
    })
  } catch (error) {
    console.error('Error processing workflows:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error processing workflows',
      500
    )
  }
})
