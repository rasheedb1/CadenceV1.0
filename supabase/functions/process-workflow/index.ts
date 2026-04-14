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

// ================================================================
// TEMPLATE RESOLVER — resolves {{step_name.field}} from context_json
// ================================================================
function resolveTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const parts = path.trim().split('.')
    let val: unknown = context
    for (const p of parts) { val = (val as Record<string, unknown>)?.[p] }
    if (val === undefined || val === null) return ''
    if (typeof val === 'object') return JSON.stringify(val)
    return String(val)
  })
}

function resolveTemplateValue(template: string, context: Record<string, unknown>): unknown {
  // If the entire value is a single template variable, return the raw value (not stringified)
  const singleVarMatch = template.match(/^\{\{([^}]+)\}\}$/)
  if (singleVarMatch) {
    const parts = singleVarMatch[1].trim().split('.')
    let val: unknown = context
    for (const p of parts) { val = (val as Record<string, unknown>)?.[p] }
    return val
  }
  // Otherwise resolve as string interpolation
  return resolveTemplate(template, context)
}

function resolveParams(params: Record<string, string>, context: Record<string, unknown>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(params)) {
    if (typeof val === 'string' && val.includes('{{')) {
      resolved[key] = resolveTemplateValue(val, context)
    } else {
      resolved[key] = val
    }
  }
  return resolved
}

/** Save a step result in context_json under a named key */
function buildContextWithStepResult(
  existingContext: Record<string, unknown>,
  nodeId: string,
  nodeData: Record<string, unknown>,
  result: unknown,
): Record<string, unknown> {
  // Use node's stepName (from config) or fall back to nodeId
  const stepName = (nodeData.stepName as string) || (nodeData.label as string)?.toLowerCase().replace(/[^a-z0-9]+/g, '_') || nodeId
  return {
    ...existingContext,
    [stepName]: result,
    last_task_result: result,
    last_step: stepName,
  }
}

// Map action node types to LinkedIn Edge Function endpoints
const ACTION_TO_ENDPOINT: Record<string, string> = {
  action_linkedin_message: '/functions/v1/linkedin-send-message',
  action_linkedin_connect: '/functions/v1/linkedin-send-connection',
  action_linkedin_like: '/functions/v1/linkedin-like-post',
  action_linkedin_comment: '/functions/v1/linkedin-comment',
  action_linkedin_profile_view: '/functions/v1/linkedin-view-profile',
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
    case 'action_linkedin_profile_view':
      // No additional body fields needed
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
    .select('graph_json, status, workflow_type')
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

  // Load lead data for conditions (optional — agent workflows may not have leads)
  let lead: Record<string, unknown> | null = null
  if (run.lead_id) {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('id', run.lead_id)
      .single()
    lead = data
  }

  // For lead workflows, lead is required. For agent workflows, it's optional.
  const isAgentWorkflow = workflow.workflow_type === 'agent'
  if (!lead && !isAgentWorkflow) {
    await supabase.from('workflow_runs').update({ status: 'failed' }).eq('id', run.id)
    return { success: false, action: 'fail', error: 'Lead not found' }
  }

  // Execute based on node type
  let nextNodeId: string | null = null

  if (nodeType.startsWith('trigger_')) {
    // Trigger nodes just pass through to the next node
    nextNodeId = getNextNodeId(graph, currentNode.id)

  } else if (nodeType.startsWith('action_') && !nodeType.startsWith('action_agent_') && nodeType !== 'action_notify_human' && nodeType !== 'action_for_each' && nodeType !== 'action_retry') {
    // Execute the LinkedIn/email action (legacy lead workflows only)
    const result = await executeAction(nodeType, nodeData, run.lead_id!, run.owner_id, run.org_id, authToken)

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

  // ================================================================
  // AGENT WORKFLOW NODES
  // ================================================================
  } else if (nodeType === 'action_agent_skill' || nodeType === 'action_agent_task') {
    const agentId = nodeData.agentId as string
    const CHIEF_AGENTS_URL = Deno.env.get('CHIEF_AGENTS_URL') || 'https://chief-agents-production.up.railway.app'

    // Build skill instruction from node config
    let instruction = ''
    if (nodeType === 'action_agent_skill') {
      const skillName = nodeData.skillName as string
      const params = nodeData.params as Record<string, string> || {}
      const resolvedParams = resolveParams(params, run.context_json)
      instruction = `Execute skill "${skillName}" with params: ${JSON.stringify(resolvedParams)}\n\nUse the call_skill tool with function_name="${skillName}" and these exact params. Do NOT ask the user for data — all params are provided.`
    } else {
      instruction = resolveTemplate(nodeData.instruction as string || '', run.context_json)
    }

    // Create agent task linked to this workflow run
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const taskRes = await fetch(`${supabaseUrl}/rest/v1/agent_tasks_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        org_id: run.org_id,
        title: instruction.substring(0, 120),
        description: instruction,
        task_type: 'general',
        assigned_agent_id: agentId,
        assigned_at: new Date().toISOString(),
        status: 'claimed',
        priority: 10,
        workflow_run_id: run.id,
        workflow_node_id: currentNode.id,
      }),
    })
    const tasks = await taskRes.json()
    const taskId = Array.isArray(tasks) && tasks[0] ? tasks[0].id : null

    if (!taskId) {
      await supabase.from('workflow_runs').update({
        status: 'failed',
        context_json: { ...run.context_json, last_error: 'Failed to create agent task' },
      }).eq('id', run.id)
      return { success: false, action: 'task_creation_failed' }
    }

    // Execute immediately via /execute endpoint
    fetch(`${CHIEF_AGENTS_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, task_id: taskId }),
    }).catch((e: Error) => console.warn(`[workflow] /execute failed: ${e.message}`))

    // Pause workflow — the DB trigger (trg_advance_workflow) will resume it when task completes
    await supabase.from('workflow_runs').update({
      status: 'waiting',
      waiting_for_event: 'task_completed',
      waiting_task_id: taskId,
      context_json: { ...run.context_json, waiting_task_id: taskId },
    }).eq('id', run.id)

    await supabase.from('workflow_event_log').insert({
      workflow_run_id: run.id,
      workflow_id: run.workflow_id,
      lead_id: run.lead_id || '00000000-0000-0000-0000-000000000000',
      owner_id: run.owner_id,
      org_id: run.org_id,
      node_id: currentNode.id,
      node_type: nodeType,
      action: 'agent_task_created',
      status: 'success',
      details: { task_id: taskId, agent_id: agentId },
    })

    return { success: true, action: 'waiting_for_agent' }

  } else if (nodeType === 'condition_task_result') {
    // Evaluate condition on last task result
    const lastResult = run.context_json?.last_task_result as Record<string, unknown> || {}
    const lastStatus = run.context_json?.last_task_status as string || 'unknown'
    const field = nodeData.field as string || 'status'
    const operator = nodeData.operator as string || '=='
    const value = nodeData.value as string || ''

    let fieldValue: unknown
    if (field === 'status') {
      fieldValue = lastStatus
    } else if (field.includes('.')) {
      fieldValue = field.split('.').reduce((obj: unknown, key) => (obj as Record<string, unknown>)?.[key], lastResult)
    } else {
      fieldValue = lastResult[field]
    }

    let passed = false
    switch (operator) {
      case '>': passed = Number(fieldValue) > Number(value); break
      case '<': passed = Number(fieldValue) < Number(value); break
      case '==': passed = String(fieldValue) === value; break
      case '!=': passed = String(fieldValue) !== value; break
      case 'contains': passed = String(fieldValue).includes(value); break
      case 'is_empty': passed = !fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0); break
      case 'is_not_empty': passed = !!fieldValue && (!Array.isArray(fieldValue) || fieldValue.length > 0); break
    }

    await supabase.from('workflow_event_log').insert({
      workflow_run_id: run.id,
      workflow_id: run.workflow_id,
      lead_id: run.lead_id || '00000000-0000-0000-0000-000000000000',
      owner_id: run.owner_id,
      org_id: run.org_id,
      node_id: currentNode.id,
      node_type: nodeType,
      action: `condition_${passed ? 'yes' : 'no'}`,
      status: 'success',
      details: { field, operator, value, fieldValue, passed },
    })

    nextNodeId = getNextNodeId(graph, currentNode.id, passed ? 'yes' : 'no')

  } else if (nodeType === 'action_notify_human') {
    // Send notification via bridge callback (non-blocking)
    const CALLBACK_URL = Deno.env.get('CALLBACK_URL') || 'https://twilio-bridge-production-241b.up.railway.app/api/agent-callback'
    const resolvedMsg = resolveTemplate(nodeData.message as string || 'Workflow notification', run.context_json)

    fetch(CALLBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: 'Workflow',
        result: { text: resolvedMsg },
        whatsapp_number: null,
      }),
    }).catch(() => {})

    nextNodeId = getNextNodeId(graph, currentNode.id)

  } else if (nodeType === 'action_retry') {
    const maxRetries = (nodeData.maxRetries as number) || 3
    const backoffSeconds = (nodeData.backoffSeconds as number) || 60
    const targetNodeId = nodeData.targetNodeId as string
    const retryCount = (run.context_json?._retry_count as number) || 0

    if (retryCount < maxRetries) {
      const waitUntil = new Date(Date.now() + backoffSeconds * 1000 * Math.pow(2, retryCount)).toISOString()
      await supabase.from('workflow_runs').update({
        current_node_id: targetNodeId,
        status: 'waiting',
        waiting_until: waitUntil,
        context_json: { ...run.context_json, _retry_count: retryCount + 1 },
      }).eq('id', run.id)
      return { success: true, action: `retry_${retryCount + 1}/${maxRetries}` }
    } else {
      // Max retries exceeded — follow 'max_retries_exceeded' edge
      nextNodeId = getNextNodeId(graph, currentNode.id, 'max_retries_exceeded')
      // Reset retry count
      await supabase.from('workflow_runs').update({
        context_json: { ...run.context_json, _retry_count: 0 },
      }).eq('id', run.id)
    }

  } else if (nodeType === 'action_for_each') {
    // Loop over an array from a previous step result
    const arraySource = nodeData.arraySource as string || ''
    const itemVar = nodeData.itemVar as string || 'item'
    const items = resolveTemplateValue(arraySource, run.context_json)

    if (!Array.isArray(items) || items.length === 0) {
      // Empty array — follow 'empty' edge or advance normally
      nextNodeId = getNextNodeId(graph, currentNode.id, 'empty') || getNextNodeId(graph, currentNode.id)
    } else {
      // Get the next node (the body of the loop)
      const bodyNodeId = getNextNodeId(graph, currentNode.id, 'each_item') || getNextNodeId(graph, currentNode.id)

      // Create sub-runs for each item (they share the same workflow_run but execute sequentially)
      // Store iteration state in context_json
      await supabase.from('workflow_runs').update({
        current_node_id: bodyNodeId,
        context_json: {
          ...run.context_json,
          _for_each: {
            items,
            currentIndex: 0,
            itemVar,
            returnNodeId: currentNode.id,
            results: [],
          },
          [itemVar]: items[0], // Set current item
        },
      }).eq('id', run.id)

      await supabase.from('workflow_event_log').insert({
        workflow_run_id: run.id,
        workflow_id: run.workflow_id,
        lead_id: run.lead_id || '00000000-0000-0000-0000-000000000000',
        owner_id: run.owner_id,
        org_id: run.org_id,
        node_id: currentNode.id,
        node_type: nodeType,
        action: 'for_each_start',
        status: 'success',
        details: { total_items: items.length, item_var: itemVar },
      })

      return { success: true, action: `for_each_start_${items.length}_items` }
    }

  } else if (nodeType === 'condition_human_approval') {
    // Send question to human via WhatsApp and wait for response
    const question = resolveTemplate(nodeData.question as string || '', run.context_json)
    const options = nodeData.options as string[] || ['Continue', 'Stop']
    const timeoutHours = (nodeData.timeoutHours as number) || 4
    const CALLBACK_URL = Deno.env.get('CALLBACK_URL') || 'https://twilio-bridge-production-241b.up.railway.app/api/agent-callback'

    const formattedQuestion = `🔔 *Workflow necesita tu decisión:*\n\n${question}\n\nResponde con una de estas opciones:\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`

    fetch(CALLBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: 'Workflow',
        result: { text: formattedQuestion },
        whatsapp_number: null,
      }),
    }).catch(() => {})

    const waitUntil = new Date(Date.now() + timeoutHours * 3600000).toISOString()
    await supabase.from('workflow_runs').update({
      status: 'waiting',
      waiting_for_event: 'human_approval',
      waiting_until: waitUntil,
      context_json: { ...run.context_json, _approval_options: options },
    }).eq('id', run.id)

    await supabase.from('workflow_event_log').insert({
      workflow_run_id: run.id,
      workflow_id: run.workflow_id,
      lead_id: run.lead_id || '00000000-0000-0000-0000-000000000000',
      owner_id: run.owner_id,
      org_id: run.org_id,
      node_id: currentNode.id,
      node_type: nodeType,
      action: 'human_approval_requested',
      status: 'success',
      details: { question, options, timeout_hours: timeoutHours },
    })

    return { success: true, action: 'waiting_for_human_approval' }

  } else if (nodeType === 'action_agent_review') {
    // Have a reviewer agent evaluate the last task's result
    const reviewerAgentId = nodeData.reviewerAgentId as string
    const criteria = resolveTemplate(nodeData.criteria as string || '', run.context_json)
    const lastResult = run.context_json?.last_task_result || {}
    const CHIEF_AGENTS_URL = Deno.env.get('CHIEF_AGENTS_URL') || 'https://chief-agents-production.up.railway.app'

    const reviewInstruction = `REVIEW TASK: Evaluate this work output and decide if it meets the criteria.

WORK OUTPUT TO REVIEW:
${JSON.stringify(lastResult, null, 2)}

CRITERIA:
${criteria}

RESPOND WITH EXACTLY ONE OF:
- "APPROVED" if the work meets the criteria
- "NEEDS_REVISION: [your feedback]" if it needs changes

Be specific about what needs to change if you recommend revision.`

    // Create review task
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const taskRes = await fetch(`${supabaseUrl}/rest/v1/agent_tasks_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        org_id: run.org_id,
        title: `[REVIEW] ${criteria.substring(0, 100)}`,
        description: reviewInstruction,
        task_type: 'general',
        assigned_agent_id: reviewerAgentId,
        assigned_at: new Date().toISOString(),
        status: 'claimed',
        priority: 5,
        workflow_run_id: run.id,
        workflow_node_id: currentNode.id,
      }),
    })
    const tasks = await taskRes.json()
    const taskId = Array.isArray(tasks) && tasks[0] ? tasks[0].id : null

    if (taskId) {
      // Execute review immediately
      fetch(`${CHIEF_AGENTS_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: reviewerAgentId, task_id: taskId }),
      }).catch(() => {})

      await supabase.from('workflow_runs').update({
        status: 'waiting',
        waiting_for_event: 'task_completed',
        waiting_task_id: taskId,
      }).eq('id', run.id)
    }

    return { success: true, action: 'waiting_for_review' }
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
