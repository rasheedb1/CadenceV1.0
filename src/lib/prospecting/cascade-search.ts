/**
 * Cascade Search: 3-level progressive search strategy.
 *
 * Level 1 — Functional keywords + tier seniority (one API call)
 * Level 2 — Domain terms as general keywords + broad seniority (one API call)
 * Level 3 — Company + seniority only, no title filter (one API call)
 *
 * Each level is ONE call to the search-sales-navigator edge function.
 * Stops at the first level that produces results.
 */

import type {
  SearchSalesNavigatorParams,
  SearchSalesNavigatorResponse,
  SalesNavResult,
} from '@/contexts/AccountMappingContext'
import type { AccountMapCompany, BuyerPersona } from '@/types/account-mapping'
import { getAdaptiveKeywords } from './adaptive-keywords'
import { generateTitleVariations, isSeniorTitle } from './clean-keywords'

// ── Types ──

export type SearchLevel = 1 | 2 | 3

export interface CascadeResult {
  prospects: SalesNavResult[]
  level: SearchLevel
  queryUsed: string
  levelDetails: LevelDetail[]
}

export interface LevelDetail {
  level: SearchLevel
  label: string
  keywords: string[]
  resultsCount: number
  skipped?: boolean
}

export interface CascadeConfig {
  company: AccountMapCompany
  persona: BuyerPersona
  accountMapId: string
  onSearch: (params: SearchSalesNavigatorParams) => Promise<SearchSalesNavigatorResponse>
  maxResults?: number
  /** Set of LinkedIn provider IDs to exclude (already found for this company) */
  excludeProviderIds?: Set<string>
  /** Callback when starting a new cascade level */
  onLevelStart?: (level: SearchLevel) => void
  /** Delay in ms between cascade levels (rate limiting) */
  delayBetweenLevels?: number
}

// ── Domain terms for Level 2 ──

const DOMAIN_TERMS: Record<string, string[]> = {
  payment: ['payments', 'checkout', 'billing', 'fintech', 'transactions'],
  finance: ['finance', 'treasury', 'accounting', 'financial planning'],
  engineering: ['engineering', 'platform', 'infrastructure', 'backend'],
  product: ['product management', 'product strategy', 'product'],
  marketing: ['marketing', 'growth', 'demand generation'],
  sales: ['sales', 'revenue', 'business development'],
  security: ['security', 'fraud', 'risk', 'compliance'],
  data: ['data', 'analytics', 'business intelligence'],
  operations: ['operations', 'strategy', 'process'],
  ecommerce: ['ecommerce', 'commerce', 'marketplace', 'retail'],
  technology: ['technology', 'software', 'digital', 'IT'],
  hr: ['human resources', 'talent', 'people operations', 'recruiting'],
  legal: ['legal', 'regulatory', 'compliance', 'governance'],
  supply: ['supply chain', 'logistics', 'procurement', 'warehouse'],
}

/** Broad seniority for Level 2 */
const BROAD_SENIORITY = ['CXO', 'VP', 'Director', 'Owner', 'Partner']
/** All senior levels for Level 3 */
const ALL_SENIOR = ['CXO', 'VP', 'Director', 'Manager', 'Senior', 'Owner', 'Partner']

// ── Helpers ──

function deduplicateProfiles(
  profiles: SalesNavResult[],
  excludeIds?: Set<string>
): SalesNavResult[] {
  const seen = new Map<string, SalesNavResult>()
  for (const p of profiles) {
    const key = p.linkedinProviderId || `${p.firstName}-${p.lastName}-${p.company}`
    if (excludeIds?.has(key)) continue
    if (!seen.has(key)) seen.set(key, p)
  }
  return Array.from(seen.values())
}

function getDomainTerms(persona: BuyerPersona): string[] {
  const text = (
    persona.name + ' ' +
    (persona.description || '') + ' ' +
    persona.title_keywords.join(' ')
  ).toLowerCase()

  const terms: string[] = []
  for (const [domain, searchTerms] of Object.entries(DOMAIN_TERMS)) {
    if (text.includes(domain)) {
      terms.push(...searchTerms)
    }
  }

  // If no domain matched, extract significant words from persona text
  if (terms.length === 0) {
    const stopWords = new Set([
      'head', 'chief', 'vice', 'president', 'director', 'manager',
      'senior', 'lead', 'officer', 'the', 'and', 'for', 'leader',
      'buyer', 'maker', 'decision',
    ])
    const words = text.split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w))
    terms.push(...words.slice(0, 4))
  }

  return [...new Set(terms)]
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ── Cascade Search ──

export async function cascadeSearch(config: CascadeConfig): Promise<CascadeResult> {
  const {
    company,
    persona,
    accountMapId,
    onSearch,
    maxResults = 5,
    excludeProviderIds,
    onLevelStart,
    delayBetweenLevels = 2000,
  } = config

  const levelDetails: LevelDetail[] = []

  // Get adaptive keywords for this company tier
  const { titleKeywords, seniority } = getAdaptiveKeywords(persona, company)

  // ===== LEVEL 1: Functional keywords + seniority filter =====
  onLevelStart?.(1)

  if (titleKeywords.length > 0) {
    // Clean keywords: extract functional cores, expand variations
    const variations = generateTitleVariations(titleKeywords)

    // Separate C-level abbreviations from functional terms
    const cLevelPattern = /^(CEO|CTO|CFO|COO|CMO|CRO|CPO|CIO|CISO|CDO)$/i
    const cLevelKeywords = variations.filter(v => cLevelPattern.test(v))
    const functionalKeywords = variations.filter(v => !cLevelPattern.test(v))

    // Combine: functional terms + C-level (cap to 20 to avoid overly broad)
    const searchKeywords = [...functionalKeywords, ...cLevelKeywords].slice(0, 20)

    try {
      const response = await onSearch({
        accountMapId,
        companyNames: [company.company_name],
        titleKeywords: searchKeywords,
        seniority: seniority.length > 0 ? seniority : BROAD_SENIORITY,
        limit: maxResults * 3,
      })

      const results = response.results || []
      const unique = deduplicateProfiles(results, excludeProviderIds)
      levelDetails.push({
        level: 1, label: 'Title match',
        keywords: searchKeywords.slice(0, 8),
        resultsCount: unique.length,
      })

      if (unique.length > 0) {
        return {
          prospects: unique.slice(0, maxResults),
          level: 1,
          queryUsed: searchKeywords.slice(0, 4).join(', '),
          levelDetails,
        }
      }
    } catch (e) {
      console.warn(`Cascade L1 failed for "${persona.name}" at ${company.company_name}:`, e)
      levelDetails.push({ level: 1, label: 'Title match', keywords: searchKeywords, resultsCount: 0 })
    }
  } else {
    levelDetails.push({ level: 1, label: 'Title match', keywords: [], resultsCount: 0, skipped: true })
  }

  // ===== LEVEL 2: Domain terms as general keywords + broad seniority =====
  await sleep(delayBetweenLevels)
  onLevelStart?.(2)

  const domainTerms = getDomainTerms(persona)

  if (domainTerms.length > 0) {
    try {
      const response = await onSearch({
        accountMapId,
        companyNames: [company.company_name],
        keywords: domainTerms.join(' OR '),
        seniority: BROAD_SENIORITY,
        limit: maxResults * 3,
      })

      const results = response.results || []
      // Client-side filter: prefer people with senior titles
      const seniorResults = results.filter(p => {
        const title = (p.title || p.headline || '').toString()
        return isSeniorTitle(title)
      })
      // If senior filter is too aggressive, fall back to all results
      const filtered = seniorResults.length > 0 ? seniorResults : results
      const unique = deduplicateProfiles(filtered, excludeProviderIds)

      levelDetails.push({
        level: 2, label: 'Broadened',
        keywords: domainTerms.slice(0, 6),
        resultsCount: unique.length,
      })

      if (unique.length > 0) {
        return {
          prospects: unique.slice(0, maxResults),
          level: 2,
          queryUsed: domainTerms.slice(0, 3).join(', '),
          levelDetails,
        }
      }
    } catch (e) {
      console.warn(`Cascade L2 failed for "${persona.name}" at ${company.company_name}:`, e)
      levelDetails.push({ level: 2, label: 'Broadened', keywords: domainTerms, resultsCount: 0 })
    }
  } else {
    levelDetails.push({ level: 2, label: 'Broadened', keywords: [], resultsCount: 0, skipped: true })
  }

  // ===== LEVEL 3: Company + senior seniority only (no title filter) =====
  await sleep(delayBetweenLevels)
  onLevelStart?.(3)

  try {
    const response = await onSearch({
      accountMapId,
      companyNames: [company.company_name],
      seniority: ALL_SENIOR,
      limit: 15,
    })

    const results = response.results || []
    const seniorResults = results.filter(p => {
      const title = (p.title || p.headline || '').toString()
      return isSeniorTitle(title)
    })
    const unique = deduplicateProfiles(
      seniorResults.length > 0 ? seniorResults : results.slice(0, 5),
      excludeProviderIds
    )

    levelDetails.push({
      level: 3, label: 'Broad',
      keywords: ['All senior at company'],
      resultsCount: unique.length,
    })

    return {
      prospects: unique.slice(0, maxResults),
      level: 3,
      queryUsed: unique.length > 0
        ? `Senior profiles at ${company.company_name}`
        : 'All levels exhausted',
      levelDetails,
    }
  } catch (e) {
    console.warn(`Cascade L3 failed for "${persona.name}" at ${company.company_name}:`, e)
    levelDetails.push({ level: 3, label: 'Broad', keywords: [], resultsCount: 0 })
  }

  // All levels failed
  return {
    prospects: [],
    level: 3,
    queryUsed: 'All levels exhausted',
    levelDetails,
  }
}

/** Label for search level display */
export const SEARCH_LEVEL_LABELS: Record<SearchLevel, { label: string; color: string }> = {
  1: { label: 'exact', color: 'text-green-600' },
  2: { label: 'broadened', color: 'text-amber-600' },
  3: { label: 'broad match', color: 'text-orange-600' },
}
