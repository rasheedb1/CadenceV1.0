// Sales Signal Types — Configurable signals for AI message generation

export type SignalCategory = 'funding' | 'expansion' | 'hiring' | 'product' | 'market' | 'social'

export interface SignalType {
  id: string
  category: SignalCategory
  slug: string
  name: string
  description: string
  icon: string
  search_query_template: string
  classification_prompt: string
  default_enabled: boolean
  sort_order: number
  created_at: string
}

export interface SignalConfig {
  id: string
  user_id: string
  org_id: string
  signal_type_id: string
  enabled: boolean
  priority: number
  custom_query: string | null
  created_at: string
  updated_at: string
}

// Joined view: signal_type + user config
export interface SignalConfigWithType extends SignalConfig {
  signal_type: SignalType
}

// A detected signal from the AI research phase
export interface DetectedSignal {
  signalSlug: string
  signalName: string
  category: SignalCategory
  confidence: number // 0-1
  summary: string // Short human-readable summary
  source: 'firecrawl' | 'linkedin' | 'both'
  sourceUrl?: string
  rawSnippet?: string
}

// Category metadata for UI grouping
export const SIGNAL_CATEGORIES: Record<SignalCategory, { label: string; icon: string; color: string }> = {
  funding: { label: 'Funding', icon: 'DollarSign', color: 'bg-green-100 text-green-700 border-green-200' },
  expansion: { label: 'Expansion', icon: 'Globe', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  hiring: { label: 'Hiring', icon: 'UserPlus', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  product: { label: 'Producto', icon: 'Rocket', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  market: { label: 'Mercado', icon: 'TrendingUp', color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  social: { label: 'Social', icon: 'MessageSquare', color: 'bg-pink-100 text-pink-700 border-pink-200' },
}
