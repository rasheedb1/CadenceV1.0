// =====================================================
// ACCOUNT MAPPING TYPES
// =====================================================

import type { ICPBuilderData } from './icp-builder'

// Legacy filter fields (kept for backwards compatibility)
export interface AccountMapFiltersLegacy {
  industry: string[]
  company_size: string[]
  location: string[]
  seniority: string[]
  keywords: string[]
  title_keywords: string[]
}

// Extended filters: legacy fields + optional guided builder data
export type AccountMapFilters = AccountMapFiltersLegacy & {
  icp_builder_data?: ICPBuilderData
}

export const EMPTY_FILTERS: AccountMapFilters = {
  industry: [],
  company_size: [],
  location: [],
  seniority: [],
  keywords: [],
  title_keywords: [],
}

export interface AccountMap {
  id: string
  owner_id: string
  name: string
  description: string | null
  icp_description: string | null
  discover_min_companies: number
  discover_max_companies: number
  filters_json: AccountMapFilters
  created_at: string
  updated_at: string
  // Relations (populated via select)
  account_map_companies?: AccountMapCompany[]
  buyer_personas?: BuyerPersona[]
  prospects?: Prospect[]
}

export interface AccountMapCompany {
  id: string
  account_map_id: string
  owner_id: string
  company_name: string
  industry: string | null
  company_size: string | null
  website: string | null
  linkedin_url: string | null
  location: string | null
  description: string | null
  created_at: string
  updated_at: string
}

// ── Adaptive Buyer Personas ──

export type CompanySizeTier = 'enterprise' | 'mid_market' | 'startup_smb'

export type BuyingCommitteeRole =
  | 'decision_maker'
  | 'champion'
  | 'influencer'
  | 'technical_evaluator'
  | 'budget_holder'
  | 'end_user'

export interface TierKeywords {
  enterprise: string[]
  mid_market: string[]
  startup_smb: string[]
}

export interface TierSeniority {
  enterprise: string[]
  mid_market: string[]
  startup_smb: string[]
}

export const EMPTY_TIER_KEYWORDS: TierKeywords = { enterprise: [], mid_market: [], startup_smb: [] }
export const EMPTY_TIER_SENIORITY: TierSeniority = { enterprise: [], mid_market: [], startup_smb: [] }

export const BUYING_COMMITTEE_ROLES: { value: BuyingCommitteeRole; label: string; description: string }[] = [
  { value: 'decision_maker', label: 'Decision Maker', description: 'Signs contracts, approves budget' },
  { value: 'champion', label: 'Champion', description: 'Internal advocate, has the pain your product solves' },
  { value: 'influencer', label: 'Influencer', description: 'Has technical opinion, evaluates solutions' },
  { value: 'technical_evaluator', label: 'Technical Evaluator', description: 'Tests/validates the product' },
  { value: 'budget_holder', label: 'Budget Holder', description: 'Controls the budget but may not be the user' },
  { value: 'end_user', label: 'End User', description: 'Will use the product daily' },
]

export const BUYING_ROLE_CONFIG: Record<BuyingCommitteeRole, { label: string; color: string }> = {
  decision_maker: { label: 'Decision Maker', color: 'text-red-600 bg-red-50 border-red-200' },
  champion: { label: 'Champion', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  influencer: { label: 'Influencer', color: 'text-purple-600 bg-purple-50 border-purple-200' },
  technical_evaluator: { label: 'Tech Evaluator', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  budget_holder: { label: 'Budget Holder', color: 'text-green-600 bg-green-50 border-green-200' },
  end_user: { label: 'End User', color: 'text-gray-600 bg-gray-50 border-gray-200' },
}

export interface BuyerPersona {
  id: string
  account_map_id: string
  owner_id: string
  name: string
  title_keywords: string[]
  seniority: string | null
  department: string | null
  max_per_company: number
  // Adaptive fields
  description: string | null
  role_in_buying_committee: BuyingCommitteeRole | null
  priority: number
  is_required: boolean
  departments: string[]
  title_keywords_by_tier: TierKeywords
  seniority_by_tier: TierSeniority
  created_at: string
  updated_at: string
}

export type ProspectStatus = 'new' | 'enriched' | 'promoted'
export type ProspectSource = 'sales_navigator' | 'manual' | 'import'

export interface Prospect {
  id: string
  account_map_id: string
  company_id: string | null
  owner_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  title: string | null
  company: string | null
  linkedin_url: string | null
  linkedin_provider_id: string | null
  headline: string | null
  location: string | null
  source: ProspectSource
  status: ProspectStatus
  enrichment_data: Record<string, unknown> | null
  promoted_lead_id: string | null
  // Persona tracking
  persona_id: string | null
  buying_role: string | null
  search_metadata: Record<string, unknown> | null
  // AI validation
  relevance_score: number | null
  role_fit: 'strong' | 'moderate' | 'weak' | null
  outreach_angle: string | null
  ai_reasoning: string | null
  red_flags: string | null
  ai_validated: boolean
  skipped: boolean
  skip_reason: string | null
  created_at: string
  updated_at: string
}

export const BUYING_ROLE_ICONS: Record<string, string> = {
  decision_maker: '🎯',
  champion: '🏗️',
  influencer: '💡',
  technical_evaluator: '🔧',
  budget_holder: '💰',
  end_user: '👤',
}

export interface OutreachStrategy {
  id: string
  account_map_id: string
  company_id: string
  owner_id: string
  strategy_name: string | null
  overall_reasoning: string | null
  steps: OutreachStep[]
  created_at: string
  updated_at: string
}

export interface OutreachStep {
  order: number
  prospect_id: string
  prospect_name: string
  role: string
  reasoning: string
  suggested_angle: string
}

export const PROSPECT_STATUS_CONFIG: Record<ProspectStatus, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  new: { label: 'Nuevo', variant: 'secondary' },
  enriched: { label: 'Enriquecido', variant: 'default' },
  promoted: { label: 'Promovido', variant: 'outline' },
}

export const SENIORITY_OPTIONS = [
  'Entry',
  'Senior',
  'Manager',
  'Director',
  'VP',
  'CXO',
  'Owner',
  'Partner',
]

export const COMPANY_SIZE_OPTIONS = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1001-5000',
  '5001-10000',
  '10001+',
]

// ── ICP Templates ──

export interface ICPTemplate {
  id: string
  owner_id: string
  name: string
  description: string | null
  builder_data: ICPBuilderData
  created_at: string
  updated_at: string
}

// ── ICP Discovery Feedback ──

export type FeedbackType = 'helpful' | 'not_helpful'

export interface ICPDiscoveryFeedback {
  id: string
  account_map_id: string
  owner_id: string
  company_name: string
  feedback: FeedbackType
  discovery_data: Record<string, unknown> | null
  created_at: string
}

// ── Smart ICP Insights ──

export interface ICPInsight {
  category: string
  insight: string
  suggestion: string
  action?: {
    field: keyof ICPBuilderData
    operation: 'add' | 'remove'
    value: string
  }
  confidence: 'high' | 'medium' | 'low'
}
