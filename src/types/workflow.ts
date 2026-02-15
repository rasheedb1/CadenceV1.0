import type { Node, Edge } from '@xyflow/react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>

// =====================================================
// NODE TYPES
// =====================================================
export type WorkflowNodeType =
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

export type WorkflowNodeCategory = 'trigger' | 'action' | 'condition' | 'delay'

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
export type WorkflowTriggerType = 'manual' | 'new_lead_added'

// =====================================================
// INTERFACES
// =====================================================
export interface Workflow {
  id: string
  owner_id: string
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
