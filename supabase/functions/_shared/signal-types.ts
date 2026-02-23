// Sales Signal Types for Edge Functions (Deno)
// Mirrors src/types/signals.ts for backend use

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
}

export interface SignalConfig {
  id: string
  user_id: string
  org_id: string
  signal_type_id: string
  enabled: boolean
  priority: number
  custom_query: string | null
}

export interface SignalConfigWithType extends SignalConfig {
  signal_type: SignalType
}

export interface DetectedSignal {
  signalSlug: string
  signalName: string
  category: SignalCategory
  confidence: number
  summary: string
  source: 'firecrawl' | 'linkedin' | 'both'
  sourceUrl?: string
  rawSnippet?: string
}
