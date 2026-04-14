import type { Node, Edge } from '@xyflow/react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>

// =====================================================
// NODE TYPES
// =====================================================
export type WorkflowNodeType =
  // Existing lead workflow nodes
  | 'trigger_manual'
  | 'trigger_new_lead'
  | 'action_linkedin_message'
  | 'action_linkedin_connect'
  | 'action_linkedin_like'
  | 'action_linkedin_comment'
  | 'action_send_email'
  | 'action_task'
  | 'condition_connection_accepted'
  | 'condition_message_received'
  | 'condition_lead_attribute'
  | 'condition_time_elapsed'
  | 'delay_wait'
  // Agent workflow nodes
  | 'trigger_scheduled'
  | 'action_agent_skill'
  | 'action_agent_task'
  | 'action_agent_review'
  | 'action_notify_human'
  | 'action_for_each'
  | 'action_retry'
  | 'condition_task_result'
  | 'condition_human_approval'

export type WorkflowNodeCategory = 'trigger' | 'action' | 'condition' | 'delay' | 'control'

// =====================================================
// NODE CONFIG DATA
// =====================================================
export interface TriggerNodeData {
  label: string
}

export interface ActionLinkedInMessageData {
  label: string
  messageTemplate: string
}

export interface ActionLinkedInConnectData {
  label: string
  noteText: string
}

export interface ActionLinkedInLikeData {
  label: string
  reactionType: 'LIKE' | 'CELEBRATE' | 'LOVE' | 'INSIGHTFUL' | 'CURIOUS'
}

export interface ActionLinkedInCommentData {
  label: string
  commentText: string
}

export interface ActionSendEmailData {
  label: string
  subject: string
  bodyTemplate: string
}

export interface ActionTaskData {
  label: string
  taskDescription: string
}

export interface ConditionConnectionAcceptedData {
  label: string
  timeoutDays: number
}

export interface ConditionMessageReceivedData {
  label: string
  keywordFilter: string
  timeoutDays: number
}

export interface ConditionLeadAttributeData {
  label: string
  field: string
  operator: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'is_empty' | 'is_not_empty'
  value: string
}

export interface ConditionTimeElapsedData {
  label: string
  duration: number
  unit: 'hours' | 'days'
}

export interface DelayWaitData {
  label: string
  duration: number
  unit: 'hours' | 'days'
}

// --- Agent workflow node data ---

export interface TriggerScheduledData {
  label: string
  cron: string            // e.g. '0 9 * * 1-5' (Mon-Fri 9am)
  timezone: string        // e.g. 'America/Mexico_City'
  description: string     // Human readable: 'Lunes a Viernes 9am'
}

export interface ActionAgentSkillData {
  label: string
  agentId: string
  agentName: string
  skillName: string
  skillDisplayName: string
  params: Record<string, string>    // key: value or "{{step.field}}" template
  onEmpty: 'skip' | 'ask_human' | 'retry' | 'stop'
  onError: 'retry' | 'notify' | 'stop'
  maxRetries: number
}

export interface ActionAgentTaskData {
  label: string
  agentId: string
  agentName: string
  instruction: string
  maxBudgetUsd: number
}

export interface ActionAgentReviewData {
  label: string
  reviewerAgentId: string
  reviewerAgentName: string
  criteria: string
  maxIterations: number
}

export interface ActionNotifyHumanData {
  label: string
  channel: 'whatsapp' | 'email'
  message: string         // Supports {{variable}} templates
}

export interface ActionForEachData {
  label: string
  arraySource: string     // e.g. "{{step1.companies}}"
  itemVar: string         // e.g. "company"
}

export interface ActionRetryData {
  label: string
  maxRetries: number
  backoffSeconds: number
  targetNodeId: string
}

export interface ConditionTaskResultData {
  label: string
  field: string           // e.g. "count", "status", "result.companies"
  operator: '>' | '<' | '==' | '!=' | 'contains' | 'is_empty' | 'is_not_empty'
  value: string
}

export interface ConditionHumanApprovalData {
  label: string
  question: string
  options: string[]       // e.g. ['Sí, continuar', 'No, parar', 'Ajustar criterios']
  timeoutHours: number
}

export type WorkflowNodeData =
  | TriggerNodeData
  | ActionLinkedInMessageData
  | ActionLinkedInConnectData
  | ActionLinkedInLikeData
  | ActionLinkedInCommentData
  | ActionTaskData
  | ConditionConnectionAcceptedData
  | ConditionMessageReceivedData
  | ConditionLeadAttributeData
  | ConditionTimeElapsedData
  | DelayWaitData
  // Agent workflow data
  | TriggerScheduledData
  | ActionAgentSkillData
  | ActionAgentTaskData
  | ActionAgentReviewData
  | ActionNotifyHumanData
  | ActionForEachData
  | ActionRetryData
  | ConditionTaskResultData
  | ConditionHumanApprovalData

// =====================================================
// REACT FLOW TYPES
// React Flow requires Record<string, unknown> for Node data,
// so we use Node directly and cast to specific data types in components.
// =====================================================
export type WorkflowNode = Node
export type WorkflowEdge = Edge

export interface WorkflowGraph {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

// =====================================================
// STATUS TYPES
// =====================================================
export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'archived'
export type WorkflowRunStatus = 'running' | 'waiting' | 'completed' | 'failed' | 'paused'
export type WorkflowTriggerType = 'manual' | 'new_lead_added' | 'scheduled' | 'on_demand' | 'webhook'
export type WorkflowType = 'lead' | 'agent'

// =====================================================
// INTERFACES
// =====================================================
export interface Workflow {
  id: string
  owner_id: string
  org_id: string
  name: string
  description: string | null
  status: WorkflowStatus
  graph_json: WorkflowGraph
  trigger_type: WorkflowTriggerType
  created_at: string
  updated_at: string
}

export interface WorkflowRun {
  id: string
  workflow_id: string
  lead_id: string
  owner_id: string
  org_id: string
  current_node_id: string | null
  status: WorkflowRunStatus
  waiting_until: string | null
  waiting_for_event: string | null
  context_json: Record<string, unknown>
  started_at: string
  updated_at: string
}

export interface WorkflowEventLog {
  id: string
  workflow_run_id: string
  workflow_id: string
  lead_id: string
  owner_id: string
  org_id: string
  node_id: string
  node_type: string
  action: string
  status: string
  details: Record<string, unknown>
  created_at: string
}

// =====================================================
// NODE TYPE CONFIG
// =====================================================
export const WORKFLOW_NODE_CATEGORIES: Record<WorkflowNodeCategory, { label: string; color: string }> = {
  trigger: { label: 'Triggers', color: 'emerald' },
  action: { label: 'Actions', color: 'blue' },
  condition: { label: 'Conditions', color: 'amber' },
  delay: { label: 'Delays', color: 'slate' },
  control: { label: 'Control', color: 'purple' },
}

export const WORKFLOW_NODE_CONFIG: Record<WorkflowNodeType, {
  label: string
  category: WorkflowNodeCategory
  icon: string
  description: string
  defaultData: AnyRecord
}> = {
  trigger_manual: {
    label: 'Manual Trigger',
    category: 'trigger',
    icon: 'Play',
    description: 'Start when leads are manually enrolled',
    defaultData: { label: 'Manual Trigger' },
  },
  trigger_new_lead: {
    label: 'New Lead Added',
    category: 'trigger',
    icon: 'UserPlus',
    description: 'Start when a new lead is created',
    defaultData: { label: 'New Lead Added' },
  },
  action_linkedin_message: {
    label: 'Send Message',
    category: 'action',
    icon: 'MessageSquare',
    description: 'Send a LinkedIn message',
    defaultData: { label: 'Send Message', messageTemplate: '' },
  },
  action_linkedin_connect: {
    label: 'Send Connection',
    category: 'action',
    icon: 'UserPlus',
    description: 'Send a LinkedIn connection request',
    defaultData: { label: 'Send Connection', noteText: '' },
  },
  action_linkedin_like: {
    label: 'Like Post',
    category: 'action',
    icon: 'ThumbsUp',
    description: 'Like a LinkedIn post',
    defaultData: { label: 'Like Post', reactionType: 'LIKE' },
  },
  action_linkedin_comment: {
    label: 'Comment on Post',
    category: 'action',
    icon: 'MessageCircle',
    description: 'Comment on a LinkedIn post',
    defaultData: { label: 'Comment on Post', commentText: '' },
  },
  action_send_email: {
    label: 'Send Email',
    category: 'action',
    icon: 'Mail',
    description: 'Send an email via Gmail',
    defaultData: { label: 'Send Email', subject: '', bodyTemplate: '' },
  },
  action_task: {
    label: 'Create Task',
    category: 'action',
    icon: 'ClipboardList',
    description: 'Create a manual task reminder',
    defaultData: { label: 'Create Task', taskDescription: '' },
  },
  condition_connection_accepted: {
    label: 'Connection Accepted?',
    category: 'condition',
    icon: 'UserCheck',
    description: 'Check if connection request was accepted',
    defaultData: { label: 'Connection Accepted?', timeoutDays: 7 },
  },
  condition_message_received: {
    label: 'Message Received?',
    category: 'condition',
    icon: 'MessageSquare',
    description: 'Check if a reply was received',
    defaultData: { label: 'Message Received?', keywordFilter: '', timeoutDays: 7 },
  },
  condition_lead_attribute: {
    label: 'Lead Attribute',
    category: 'condition',
    icon: 'Filter',
    description: 'Check a lead field value',
    defaultData: { label: 'Lead Attribute', field: 'title', operator: 'contains', value: '' },
  },
  condition_time_elapsed: {
    label: 'Time Elapsed',
    category: 'condition',
    icon: 'Clock',
    description: 'Check if enough time has passed',
    defaultData: { label: 'Time Elapsed', duration: 1, unit: 'days' },
  },
  delay_wait: {
    label: 'Wait',
    category: 'delay',
    icon: 'Timer',
    description: 'Wait for a specified duration',
    defaultData: { label: 'Wait', duration: 1, unit: 'days' },
  },
  // --- Agent workflow nodes ---
  trigger_scheduled: {
    label: 'Scheduled Trigger',
    category: 'trigger',
    icon: 'CalendarClock',
    description: 'Run on a schedule (daily, weekly, custom cron)',
    defaultData: { label: 'Daily 9am', cron: '0 9 * * 1-5', timezone: 'America/Mexico_City', description: 'Lunes a Viernes 9am' },
  },
  action_agent_skill: {
    label: 'Agent Skill',
    category: 'action',
    icon: 'Bot',
    description: 'Execute a skill with a specific agent',
    defaultData: { label: 'Agent Skill', agentId: '', agentName: '', skillName: '', skillDisplayName: '', params: {}, onEmpty: 'skip', onError: 'retry', maxRetries: 3 },
  },
  action_agent_task: {
    label: 'Agent Task',
    category: 'action',
    icon: 'BrainCircuit',
    description: 'Give an agent a free-form instruction',
    defaultData: { label: 'Agent Task', agentId: '', agentName: '', instruction: '', maxBudgetUsd: 1 },
  },
  action_agent_review: {
    label: 'Agent Review',
    category: 'action',
    icon: 'CheckCircle',
    description: 'Have an agent review another agent\'s work',
    defaultData: { label: 'Agent Review', reviewerAgentId: '', reviewerAgentName: '', criteria: '', maxIterations: 3 },
  },
  action_notify_human: {
    label: 'Notify Human',
    category: 'action',
    icon: 'Bell',
    description: 'Send a notification without blocking the workflow',
    defaultData: { label: 'Notify', channel: 'whatsapp', message: '' },
  },
  action_for_each: {
    label: 'For Each',
    category: 'control',
    icon: 'Repeat',
    description: 'Loop over an array from a previous step',
    defaultData: { label: 'For Each', arraySource: '', itemVar: 'item' },
  },
  action_retry: {
    label: 'Retry',
    category: 'control',
    icon: 'RotateCcw',
    description: 'Retry a failed step with exponential backoff',
    defaultData: { label: 'Retry', maxRetries: 3, backoffSeconds: 60, targetNodeId: '' },
  },
  condition_task_result: {
    label: 'Task Result',
    category: 'condition',
    icon: 'GitBranch',
    description: 'Branch based on the result of the previous agent step',
    defaultData: { label: 'Task Result?', field: 'count', operator: '>', value: '0' },
  },
  condition_human_approval: {
    label: 'Human Approval',
    category: 'condition',
    icon: 'HandMetal',
    description: 'Ask a human to choose the next step',
    defaultData: { label: 'Human Approval', question: '', options: ['Continue', 'Stop'], timeoutHours: 4 },
  },
}

export const WORKFLOW_STATUS_CONFIG: Record<WorkflowStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'gray' },
  active: { label: 'Active', color: 'green' },
  paused: { label: 'Paused', color: 'yellow' },
  archived: { label: 'Archived', color: 'red' },
}

export const WORKFLOW_RUN_STATUS_CONFIG: Record<WorkflowRunStatus, { label: string; color: string }> = {
  running: { label: 'Running', color: 'blue' },
  waiting: { label: 'Waiting', color: 'yellow' },
  completed: { label: 'Completed', color: 'green' },
  failed: { label: 'Failed', color: 'red' },
  paused: { label: 'Paused', color: 'gray' },
}
