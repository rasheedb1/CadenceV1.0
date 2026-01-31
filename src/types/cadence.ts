// =====================================================
// STEP TYPES
// =====================================================
export type StepType =
  | 'send_email'
  | 'linkedin_message'
  | 'linkedin_like'
  | 'linkedin_connect'
  | 'linkedin_comment'
  | 'whatsapp_message'
  | 'call_manual'

// =====================================================
// STATUS TYPES
// =====================================================
export type CadenceStatus = 'draft' | 'active'

export type CadenceLeadStatus =
  | 'active'
  | 'pending'
  | 'generated'
  | 'sent'
  | 'failed'
  | 'paused'
  | 'scheduled'
  | 'completed'

export type LeadStepInstanceStatus = 'pending' | 'generated' | 'sent' | 'failed' | 'skipped'

export type ScheduleStatus =
  | 'scheduled'
  | 'executed'
  | 'canceled'
  | 'skipped_due_to_state_change'
  | 'failed'

export type EmailStatus = 'queued' | 'sent' | 'failed'

export type EmailEventType = 'sent' | 'opened' | 'clicked' | 'failed' | 'bounced'

export type ConversationStatus = 'not_messaged' | 'messaged' | 'awaiting_reply' | 'replied' | 'failed'

export type MessageDirection = 'inbound' | 'outbound'

export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed'

export type ActivityStatus = 'ok' | 'failed'

// =====================================================
// INTERFACES
// =====================================================

export interface Profile {
  user_id: string
  full_name: string | null
  unipile_account_id: string | null
  created_at: string
}

export interface Lead {
  id: string
  owner_id: string
  user_id?: string // Alias for owner_id (backward compatibility)
  first_name: string
  last_name: string
  email: string | null
  linkedin_url: string | null
  company: string | null
  title: string | null
  phone: string | null
  timezone: string
  // Fields for UI compatibility (stored in cadence_leads in DB)
  cadence_id?: string | null
  current_step_id?: string | null
  status?: CadenceLeadStatus
  created_at: string
  updated_at: string
}

export interface Cadence {
  id: string
  owner_id: string
  name: string
  status: CadenceStatus
  created_at: string
  updated_at: string
  // Relations
  steps?: CadenceStep[]
  cadence_leads?: CadenceLead[]
}

export interface CadenceStep {
  id: string
  cadence_id: string
  owner_id: string
  step_type: StepType
  step_label: string
  // Aliases for backward compatibility
  type?: StepType
  label?: string
  day_offset: number
  order_in_day: number
  config_json: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CadenceLead {
  id: string
  cadence_id: string
  lead_id: string
  owner_id: string
  current_step_id: string | null
  status: CadenceLeadStatus
  created_at: string
  updated_at: string
  // Relations
  lead?: Lead
  cadence?: Cadence
  current_step?: CadenceStep
}

export interface LeadStepInstance {
  id: string
  cadence_id: string
  cadence_step_id: string
  lead_id: string
  owner_id: string
  status: LeadStepInstanceStatus
  draft_json: Record<string, unknown> | null
  message_template_text: string | null
  message_rendered_text: string | null
  payload_snapshot: Record<string, unknown> | null
  result_snapshot: Record<string, unknown> | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface Schedule {
  id: string
  cadence_id: string
  cadence_step_id: string
  lead_id: string
  owner_id: string
  scheduled_at: string
  timezone: string
  status: ScheduleStatus
  message_template_text: string | null
  message_rendered_text: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface Template {
  id: string
  owner_id: string
  name: string
  step_type: StepType
  subject_template: string | null
  body_template: string
  created_at: string
  updated_at: string
}

export interface EmailMessage {
  id: string
  event_id: string
  owner_user_id: string
  lead_id: string | null
  cadence_id: string | null
  cadence_step_id: string | null
  to_email: string
  subject: string
  html_body_original: string | null
  html_body_tracked: string | null
  gmail_message_id: string | null
  status: EmailStatus
  sent_at: string | null
  last_error: string | null
  created_at: string
}

export interface EmailEvent {
  id: string
  event_id: string
  owner_user_id: string
  lead_id: string | null
  cadence_id: string | null
  cadence_step_id: string | null
  event_type: EmailEventType
  link_url: string | null
  link_label: string | null
  user_agent: string | null
  ip_address: string | null
  metadata_json: Record<string, unknown> | null
  created_at: string
}

export interface LinkedInConversation {
  id: string
  owner_id: string
  lead_id: string
  linkedin_thread_id: string | null
  phantom_thread_id: string | null
  status: ConversationStatus
  last_activity_at: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
  // Relations
  lead?: Lead
  messages?: LinkedInMessage[]
}

export interface LinkedInMessage {
  id: string
  conversation_id: string
  owner_id: string
  body: string
  content?: string // Alias for body (backward compatibility)
  direction: MessageDirection
  provider: string
  provider_message_id: string | null
  delivery_status: DeliveryStatus
  status?: DeliveryStatus // Alias for delivery_status (backward compatibility)
  error: string | null
  sent_at: string | null
  created_at: string
}

export interface ActivityLogEntry {
  id: string
  owner_id: string
  cadence_id: string | null
  cadence_step_id: string | null
  lead_id: string | null
  action: string
  status: ActivityStatus
  details: Record<string, unknown> | null
  created_at: string
  // Relations
  lead?: Lead
  cadence?: Cadence
  cadence_step?: CadenceStep
}

export interface WeeklyMessageStats {
  id: string
  owner_id: string
  week_start: string
  linkedin_sent: number
  sales_navigator_sent: number
  sales_navigator_credit_errors: number
  created_at: string
  updated_at: string
}

// =====================================================
// CONFIG OBJECTS
// =====================================================

export const STEP_TYPE_CONFIG: Record<StepType, { label: string; icon: string; color: string; channel: string }> = {
  send_email: { label: 'Send Email', icon: 'Mail', color: 'blue', channel: 'email' },
  linkedin_message: { label: 'LinkedIn Message', icon: 'MessageSquare', color: 'sky', channel: 'linkedin' },
  linkedin_connect: { label: 'LinkedIn Connect', icon: 'UserPlus', color: 'cyan', channel: 'linkedin' },
  linkedin_like: { label: 'LinkedIn Like', icon: 'ThumbsUp', color: 'teal', channel: 'linkedin' },
  linkedin_comment: { label: 'LinkedIn Comment', icon: 'MessageCircle', color: 'emerald', channel: 'linkedin' },
  whatsapp_message: { label: 'WhatsApp Message', icon: 'Phone', color: 'green', channel: 'whatsapp' },
  call_manual: { label: 'Manual Call', icon: 'PhoneCall', color: 'orange', channel: 'phone' },
}

export const CADENCE_LEAD_STATUS_CONFIG: Record<CadenceLeadStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: 'green' },
  pending: { label: 'Pending', color: 'yellow' },
  generated: { label: 'Generated', color: 'blue' },
  sent: { label: 'Sent', color: 'purple' },
  failed: { label: 'Failed', color: 'red' },
  paused: { label: 'Paused', color: 'gray' },
  scheduled: { label: 'Scheduled', color: 'orange' },
  completed: { label: 'Completed', color: 'emerald' },
}

export const CONVERSATION_STATUS_CONFIG: Record<ConversationStatus, { label: string; color: string }> = {
  not_messaged: { label: 'Not Messaged', color: 'gray' },
  messaged: { label: 'Messaged', color: 'blue' },
  awaiting_reply: { label: 'Awaiting Reply', color: 'yellow' },
  replied: { label: 'Replied', color: 'green' },
  failed: { label: 'Failed', color: 'red' },
}

// Legacy aliases for backward compatibility
export type LeadStatus = CadenceLeadStatus
export const LEAD_STATUS_CONFIG = CADENCE_LEAD_STATUS_CONFIG
export type Step = CadenceStep
