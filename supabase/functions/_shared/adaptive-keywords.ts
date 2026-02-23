/**
 * Adaptive keyword generation based on company size tier.
 * (Deno port of src/lib/prospecting/adaptive-keywords.ts)
 */

// ── Inlined types (from src/types/account-mapping.ts) ──

export type CompanySizeTier = 'enterprise' | 'mid_market' | 'startup_smb'

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

export interface AccountMapCompanyMinimal {
  company_name: string
  company_size: string | null
  industry: string | null
  website: string | null
  location: string | null
}

export interface BuyerPersonaMinimal {
  id: string
  name: string
  title_keywords: string[]
  seniority: string | null
  description: string | null
  role_in_buying_committee: string | null
  priority: number
  is_required: boolean
  max_per_company: number
  departments: string[]
  title_keywords_by_tier: TierKeywords
  seniority_by_tier: TierSeniority
}

export function getCompanySizeTier(company: AccountMapCompanyMinimal): CompanySizeTier {
  const size = company.company_size
  if (!size) return 'mid_market'

  const sizeMap: Record<string, CompanySizeTier> = {
    '1-10': 'startup_smb',
    '11-50': 'startup_smb',
    '51-200': 'mid_market',
    '201-500': 'mid_market',
    '501-1000': 'mid_market',
    '1001-5000': 'enterprise',
    '5001-10000': 'enterprise',
    '10001+': 'enterprise',
  }
  return sizeMap[size] || 'mid_market'
}

export function getAdaptiveKeywords(
  persona: BuyerPersonaMinimal,
  company: AccountMapCompanyMinimal
): { titleKeywords: string[]; seniority: string[] } {
  const tier = getCompanySizeTier(company)

  const tierKeywords = persona.title_keywords_by_tier?.[tier]
  const titleKeywords =
    tierKeywords && tierKeywords.length > 0
      ? tierKeywords
      : persona.title_keywords

  const tierSeniority = persona.seniority_by_tier?.[tier]
  const seniority =
    tierSeniority && tierSeniority.length > 0
      ? tierSeniority
      : persona.seniority
        ? [persona.seniority]
        : []

  return { titleKeywords, seniority }
}
