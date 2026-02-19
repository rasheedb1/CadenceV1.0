import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext } from '../_shared/supabase.ts'
import { createFirecrawlClient } from '../_shared/firecrawl.ts'

interface EnrichRequest {
  companyName: string
  website?: string | null
}

interface WebsiteData {
  success: boolean
  markdown?: string
  metadata?: { title?: string; description?: string }
  scrapedAt: string
  error?: string
}

interface NewsArticle {
  url: string
  title: string
  description: string
}

interface NewsData {
  success: boolean
  articles: NewsArticle[]
  searchedAt: string
  error?: string
}

interface CompanyEnrichment {
  companyName: string
  websiteData: WebsiteData
  newsData: NewsData
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)

    const ctx = await getAuthContext(authHeader)
    if (!ctx) return errorResponse('Unauthorized', 401)

    const body: EnrichRequest = await req.json()
    const { companyName, website } = body

    if (!companyName?.trim()) {
      return errorResponse('companyName is required')
    }

    let firecrawl
    try {
      firecrawl = createFirecrawlClient()
    } catch {
      return errorResponse('Firecrawl API not configured', 500)
    }

    console.log(`Enriching company: "${companyName}" (website: ${website || 'none'})`)

    // Run website scrape and news search in parallel
    const websitePromise = (async (): Promise<WebsiteData> => {
      if (!website) {
        return { success: false, scrapedAt: new Date().toISOString(), error: 'No website provided' }
      }

      try {
        const url = website.startsWith('http') ? website : `https://${website}`
        const result = await firecrawl.scrape(url, {
          formats: ['markdown'],
          maxCharacters: 3000,
        })

        if (!result.success || !result.data) {
          console.warn(`Website scrape failed for ${url}:`, result.error)
          return { success: false, scrapedAt: new Date().toISOString(), error: result.error || 'Scrape failed' }
        }

        const metadata = result.data.metadata as Record<string, unknown> | undefined
        return {
          success: true,
          markdown: result.data.markdown,
          metadata: metadata ? {
            title: typeof metadata.title === 'string' ? metadata.title : undefined,
            description: typeof metadata.description === 'string' ? metadata.description : undefined,
          } : undefined,
          scrapedAt: new Date().toISOString(),
        }
      } catch (err) {
        console.error(`Website scrape error for ${website}:`, err)
        return {
          success: false,
          scrapedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : 'Unknown scrape error',
        }
      }
    })()

    const newsPromise = (async (): Promise<NewsData> => {
      try {
        const query = `"${companyName}" company news`
        const result = await firecrawl.search(query, { limit: 5, tbs: 'qdr:m' })

        if (!result.success || !result.data) {
          console.warn(`News search failed for "${companyName}":`, result.error)
          return { success: false, articles: [], searchedAt: new Date().toISOString(), error: result.error || 'Search failed' }
        }

        const articles: NewsArticle[] = result.data.map(r => ({
          url: r.url,
          title: r.title,
          description: r.description,
        }))

        console.log(`Found ${articles.length} news articles for "${companyName}"`)
        return { success: true, articles, searchedAt: new Date().toISOString() }
      } catch (err) {
        console.error(`News search error for "${companyName}":`, err)
        return {
          success: false,
          articles: [],
          searchedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : 'Unknown search error',
        }
      }
    })()

    const [websiteData, newsData] = await Promise.all([websitePromise, newsPromise])

    const enrichment: CompanyEnrichment = {
      companyName,
      websiteData,
      newsData,
    }

    console.log(`Enrichment complete for "${companyName}": website=${websiteData.success}, news=${newsData.success} (${newsData.articles.length} articles)`)

    return jsonResponse({
      success: true,
      enrichment,
    })
  } catch (error) {
    console.error('Enrich company error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
