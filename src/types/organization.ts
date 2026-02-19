export type OrgPlan = 'free' | 'starter' | 'pro' | 'enterprise'

export const PLAN_LABELS: Record<OrgPlan, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

export const PLAN_COLORS: Record<OrgPlan, string> = {
  free: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  starter: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  pro: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  enterprise: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

export interface OrganizationAdmin {
  id: string
  name: string
  slug: string
  plan: OrgPlan
  is_active: boolean
  plan_started_at: string | null
  created_by: string
  created_at: string
  member_count: number
}
