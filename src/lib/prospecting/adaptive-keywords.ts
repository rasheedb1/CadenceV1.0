import type {
  AccountMapCompany,
  BuyerPersona,
  CompanySizeTier,
} from '@/types/account-mapping'

/**
 * Maps a company_size string (from COMPANY_SIZE_OPTIONS) to a size tier.
 * Returns 'mid_market' as default when size is unknown.
 */
export function getCompanySizeTier(company: AccountMapCompany): CompanySizeTier {
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

/**
 * Returns adaptive title keywords and seniority for a persona+company combination.
 * Falls back to flat title_keywords/seniority when tier data is empty.
 */
export function getAdaptiveKeywords(
  persona: BuyerPersona,
  company: AccountMapCompany
): { titleKeywords: string[]; seniority: string[] } {
  const tier = getCompanySizeTier(company)

  // Try tier-specific keywords, fall back to flat
  const tierKeywords = persona.title_keywords_by_tier?.[tier]
  const titleKeywords =
    tierKeywords && tierKeywords.length > 0
      ? tierKeywords
      : persona.title_keywords

  // Try tier-specific seniority, fall back to flat
  const tierSeniority = persona.seniority_by_tier?.[tier]
  const seniority =
    tierSeniority && tierSeniority.length > 0
      ? tierSeniority
      : persona.seniority
        ? [persona.seniority]
        : []

  return { titleKeywords, seniority }
}

export const TIER_LABELS: Record<CompanySizeTier, { label: string; icon: string; description: string }> = {
  enterprise: { label: 'Enterprise', icon: '🏢', description: '1000+ employees' },
  mid_market: { label: 'Mid-Market', icon: '🏬', description: '51-1000 employees' },
  startup_smb: { label: 'Startup/SMB', icon: '🚀', description: '1-50 employees' },
}
