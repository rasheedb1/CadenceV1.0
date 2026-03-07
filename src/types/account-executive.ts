// ============================================================
// Account Executive (AE) — TypeScript Types
// ============================================================

export type AEAccountStage = 'onboarding' | 'active' | 'at_risk' | 'expanding' | 'churned'

export interface AEAccount {
  id: string
  org_id: string
  owner_user_id: string
  name: string
  domain?: string | null
  industry?: string | null
  contract_value?: number | null
  currency: string
  renewal_date?: string | null  // ISO date YYYY-MM-DD
  health_score: number           // 0-100
  stage: AEAccountStage
  notes?: string | null
  gong_account_id?: string | null
  created_at: string
  updated_at: string
}

export type AEActivityType = 'call' | 'email' | 'meeting' | 'manual'
export type AEActivitySource = 'gong' | 'gmail' | 'google_calendar' | 'manual'

export interface AEActionItem {
  text: string
  assignee?: string
  due_date?: string  // ISO date
  completed?: boolean
}

export interface AEParticipant {
  name: string
  email?: string
}

export interface AEActivity {
  id: string
  org_id: string
  ae_account_id?: string | null
  user_id: string
  type: AEActivityType
  source: AEActivitySource
  external_id?: string | null
  title: string
  summary?: string | null
  action_items: AEActionItem[]
  occurred_at: string  // ISO datetime
  duration_seconds?: number | null
  participants: AEParticipant[]
  raw_data?: unknown
  created_at: string
}

export interface AEReminder {
  id: string
  org_id: string
  ae_account_id?: string | null
  activity_id?: string | null
  user_id: string
  title: string
  description?: string | null
  due_at: string   // ISO datetime
  completed: boolean
  completed_at?: string | null
  source: string   // 'manual' | 'ai_suggested' | 'gong' | 'gmail'
  created_at: string
}

export type AEIntegrationProvider = 'gong' | 'google_calendar'

export interface AEIntegration {
  id: string
  org_id: string
  user_id: string
  provider: AEIntegrationProvider
  access_token?: string | null
  refresh_token?: string | null
  token_expires_at?: string | null
  config: Record<string, unknown>
  connected_at: string
}

// ── Derived helpers ──────────────────────────────────────────

export const AE_STAGE_LABELS: Record<AEAccountStage, string> = {
  onboarding: 'Onboarding',
  active: 'Active',
  at_risk: 'At Risk',
  expanding: 'Expanding',
  churned: 'Churned',
}

export const AE_STAGE_COLORS: Record<AEAccountStage, string> = {
  onboarding: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  at_risk: 'bg-red-100 text-red-800',
  expanding: 'bg-purple-100 text-purple-800',
  churned: 'bg-gray-100 text-gray-600',
}

export function healthScoreColor(score: number): string {
  if (score >= 70) return 'text-green-600'
  if (score >= 40) return 'text-yellow-600'
  return 'text-red-600'
}

export function healthScoreBg(score: number): string {
  if (score >= 70) return 'bg-green-500'
  if (score >= 40) return 'bg-yellow-500'
  return 'bg-red-500'
}
