// =====================================================
// COMPANY ENRICHMENT TYPES (Firecrawl Pipeline)
// =====================================================

export interface CompanyEnrichment {
  companyName: string
  websiteData: {
    success: boolean
    markdown?: string
    metadata?: { title?: string; description?: string }
    scrapedAt: string
    error?: string
  }
  newsData: {
    success: boolean
    articles: Array<{ url: string; title: string; description: string }>
    searchedAt: string
    error?: string
  }
}

export type EnrichmentStatus = 'pending' | 'enriching' | 'enriched' | 'error'

export interface EnrichCompanyResponse {
  success: boolean
  enrichment: CompanyEnrichment
  error?: string
}

export interface ReEvaluatedCompany {
  company_name: string
  relevance_score: number
  fit_category: 'high' | 'medium' | 'low'
  relevance_reason: string
  score_breakdown: Record<string, number>
  confidence: 'high' | 'medium' | 'low'
}

export interface ReEvaluateResponse {
  success: boolean
  companies: ReEvaluatedCompany[]
}
