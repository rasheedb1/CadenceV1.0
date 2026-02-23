/**
 * Server-side Cascade Search: 3-level progressive search strategy.
 * (Deno port of src/lib/prospecting/cascade-search.ts)
 *
 * Calls Unipile directly instead of going through the search-sales-navigator edge function.
 */

import type { UnipileClient } from './unipile.ts'
import { getAdaptiveKeywords } from './adaptive-keywords.ts'
import type { AccountMapCompanyMinimal, BuyerPersonaMinimal } from './adaptive-keywords.ts'
import { generateTitleVariations, isSeniorTitle } from './clean-keywords.ts'

// ── Types ──

export type SearchLevel = 1 | 2 | 3

export interface SalesNavResult {
  firstName: string
  lastName: string
  title: string
  company: string
  linkedinUrl: string
  linkedinProviderId: string
  headline: string
  location: string
}

export interface CascadeResult {
  prospects: SalesNavResult[]
  level: SearchLevel
  queryUsed: string
  levelDetails: LevelDetail[]
  apiCallCount: number
}

export interface LevelDetail {
  level: SearchLevel
  label: string
  keywords: string[]
  resultsCount: number
  skipped?: boolean
}

export interface CascadeConfig {
  company: AccountMapCompanyMinimal
  persona: BuyerPersonaMinimal
  unipile: UnipileClient
  accountId: string
  maxResults?: number
  excludeProviderIds?: Set<string>
  delayBetweenLevels?: number
}

// ── Constants ──

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

const BROAD_SENIORITY = ['CXO', 'VP', 'Director', 'Owner', 'Partner']
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

function getDomainTerms(persona: BuyerPersonaMinimal): string[] {
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

/** Normalize Unipile search results to SalesNavResult */
function normalizeResults(data: Record<string, unknown>): SalesNavResult[] {
  const items = (data?.items || data?.results || []) as Array<Record<string, unknown>>
  return items.map((item: Record<string, unknown>) => {
    const positions = (item.current_positions || []) as Array<Record<string, unknown>>
    const currentPosition = positions[0] || {}
    const name = item.name?.toString() || ''
    return {
      firstName: (item.first_name || item.firstName || name.split(' ')[0] || '') as string,
      lastName: (item.last_name || item.lastName || name.split(' ').slice(1).join(' ') || '') as string,
      title: ((currentPosition.role as string) || item.title || item.headline || '') as string,
      company: ((currentPosition.company as string) || item.company || item.company_name || '') as string,
      linkedinUrl: (item.public_profile_url || item.profile_url ||
        (item.public_identifier ? `https://www.linkedin.com/in/${item.public_identifier}` : '') || '') as string,
      linkedinProviderId: (item.provider_id || item.id || '') as string,
      headline: (item.headline || item.title || '') as string,
      location: (item.location || '') as string,
    }
  })
}

/** Search with exponential backoff on 429 / rate-limit errors */
async function searchWithRetry(
  unipile: UnipileClient,
  accountId: string,
  params: {
    keywords?: string
    company_names?: string[]
    title_keywords?: string[]
    seniority?: string[]
    limit?: number
  },
  maxRetries = 3,
): Promise<SalesNavResult[]> {
  let lastError: unknown
  let delay = 15000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await unipile.searchSalesNavigator(accountId, params)
      if (!result.success) {
        throw new Error(result.error || 'Search failed')
      }
      return normalizeResults(result.data as Record<string, unknown>)
    } catch (e) {
      lastError = e
      const msg = e instanceof Error ? e.message : String(e)
      const isRateLimit = msg.includes('429') || msg.includes('rate') || msg.includes('Rate') || msg.includes('too many')

      if (isRateLimit && attempt < maxRetries) {
        console.warn(`Rate limited (attempt ${attempt + 1}/${maxRetries + 1}), waiting ${delay / 1000}s...`)
        await sleep(delay)
        delay *= 2
      } else {
        throw e
      }
    }
  }
  throw lastError
}

// ── Cascade Search ──

export async function cascadeSearch(config: CascadeConfig): Promise<CascadeResult> {
  const {
    company,
    persona,
    unipile,
    accountId,
    maxResults = 5,
    excludeProviderIds,
    delayBetweenLevels = 2000,
  } = config

  const levelDetails: LevelDetail[] = []
  let apiCallCount = 0

  const { titleKeywords, seniority } = getAdaptiveKeywords(persona, company)

  // ===== LEVEL 1: Functional keywords + seniority filter =====
  if (titleKeywords.length > 0) {
    const variations = generateTitleVariations(titleKeywords)
    const cLevelPattern = /^(CEO|CTO|CFO|COO|CMO|CRO|CPO|CIO|CISO|CDO)$/i
    const cLevelKeywords = variations.filter(v => cLevelPattern.test(v))
    const functionalKeywords = variations.filter(v => !cLevelPattern.test(v))
    const searchKeywords = [...functionalKeywords, ...cLevelKeywords].slice(0, 20)

    try {
      apiCallCount++
      const results = await searchWithRetry(unipile, accountId, {
        company_names: [company.company_name],
        title_keywords: searchKeywords,
        seniority: seniority.length > 0 ? seniority : BROAD_SENIORITY,
        limit: maxResults * 3,
      })

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
          apiCallCount,
        }
      }
    } catch (e) {
      console.warn(`Cascade L1 failed for "${persona.name}" at ${company.company_name}:`, e)
      levelDetails.push({ level: 1, label: 'Title match', keywords: searchKeywords, resultsCount: 0 })
    }
  } else {
    levelDetails.push({ level: 1, label: 'Title match', keywords: [], resultsCount: 0, skipped: true })
  }

  // ===== LEVEL 2: Domain terms + broad seniority =====
  await sleep(delayBetweenLevels)
  const domainTerms = getDomainTerms(persona)

  if (domainTerms.length > 0) {
    try {
      apiCallCount++
      const results = await searchWithRetry(unipile, accountId, {
        company_names: [company.company_name],
        keywords: domainTerms.join(' OR '),
        seniority: BROAD_SENIORITY,
        limit: maxResults * 3,
      })

      const seniorResults = results.filter(p => isSeniorTitle(p.title || p.headline || ''))
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
          apiCallCount,
        }
      }
    } catch (e) {
      console.warn(`Cascade L2 failed for "${persona.name}" at ${company.company_name}:`, e)
      levelDetails.push({ level: 2, label: 'Broadened', keywords: domainTerms, resultsCount: 0 })
    }
  } else {
    levelDetails.push({ level: 2, label: 'Broadened', keywords: [], resultsCount: 0, skipped: true })
  }

  // ===== LEVEL 3: Company + senior seniority only =====
  await sleep(delayBetweenLevels)

  try {
    apiCallCount++
    const results = await searchWithRetry(unipile, accountId, {
      company_names: [company.company_name],
      seniority: ALL_SENIOR,
      limit: 15,
    })

    const seniorResults = results.filter(p => isSeniorTitle(p.title || p.headline || ''))
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
      apiCallCount,
    }
  } catch (e) {
    console.warn(`Cascade L3 failed for "${persona.name}" at ${company.company_name}:`, e)
    levelDetails.push({ level: 3, label: 'Broad', keywords: [], resultsCount: 0 })
  }

  return {
    prospects: [],
    level: 3,
    queryUsed: 'All levels exhausted',
    levelDetails,
    apiCallCount,
  }
}
