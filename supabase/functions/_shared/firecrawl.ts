// Firecrawl Client for Supabase Edge Functions
// Documentation: https://docs.firecrawl.dev
// API v2

export interface FirecrawlConfig {
  apiKey: string
}

export interface FirecrawlSearchResult {
  url: string
  title: string
  description: string
  position?: number
}

export interface FirecrawlSearchResponse {
  success: boolean
  data?: FirecrawlSearchResult[] | { web?: FirecrawlSearchResult[] }
  creditsUsed?: number
}

export interface FirecrawlScrapeResult {
  markdown?: string
  metadata?: Record<string, unknown>
  json?: Record<string, unknown>
}

export interface FirecrawlScrapeResponse {
  success: boolean
  data?: FirecrawlScrapeResult
}

export interface FirecrawlResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export class FirecrawlClient {
  private baseUrl = 'https://api.firecrawl.dev/v2'
  private apiKey: string

  constructor(config: FirecrawlConfig) {
    this.apiKey = config.apiKey
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries = 3,
    baseDelay = 1000
  ): Promise<Response> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, options)

        // Retry on rate limit (429) or server errors (5xx)
        if (response.status === 429 || response.status >= 500) {
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt)
            console.log(`Firecrawl API ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
        }

        return response
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt)
          console.log(`Firecrawl API network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError || new Error('Firecrawl API request failed after retries')
  }

  /**
   * Search the web using Firecrawl's search endpoint.
   * Returns title, description, and URL for each result.
   */
  async search(
    query: string,
    options?: {
      limit?: number
      tbs?: string // time-based filter: qdr:d (day), qdr:w (week), qdr:m (month), qdr:y (year)
      maxRetries?: number // override default 3 retries for faster fail
    }
  ): Promise<FirecrawlResponse<FirecrawlSearchResult[]>> {
    try {
      const body: Record<string, unknown> = {
        query,
        limit: options?.limit ?? 5,
      }

      if (options?.tbs) body.tbs = options.tbs

      console.log(`Firecrawl search: "${query}"`)

      const response = await this.fetchWithRetry(
        `${this.baseUrl}/search`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        options?.maxRetries ?? 3
      )

      const responseText = await response.text()

      if (!response.ok) {
        console.error(`Firecrawl search error ${response.status}:`, responseText)
        return { success: false, error: `Firecrawl API ${response.status}: ${responseText}` }
      }

      const data = JSON.parse(responseText) as FirecrawlSearchResponse
      // Log raw response structure to debug empty results
      const dataType = data.data === null ? 'null' : data.data === undefined ? 'undefined' : Array.isArray(data.data) ? 'array' : typeof data.data
      const dataKeys = data.data && typeof data.data === 'object' && !Array.isArray(data.data) ? Object.keys(data.data) : []
      console.log(`Firecrawl raw response: success=${data.success}, data type=${dataType}, keys=${JSON.stringify(dataKeys)}, response length=${responseText.length}`)
      if (responseText.length < 500) console.log(`Firecrawl full response: ${responseText}`)

      // Firecrawl v2 without scraping: { data: { web: [...] } }
      // Firecrawl v2 with scraping: { data: [...] }
      const results = Array.isArray(data.data)
        ? data.data
        : (data.data as { web?: FirecrawlSearchResult[] })?.web || []
      console.log(`Firecrawl search returned ${results.length} results`)
      return { success: true, data: results }
    } catch (error) {
      console.error('Firecrawl search error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Scrape a URL and return its content as markdown.
   * Can also extract structured JSON data with a schema.
   */
  async scrape(
    url: string,
    options?: {
      formats?: Array<string | { type: string; schema?: Record<string, unknown>; prompt?: string }>
      maxCharacters?: number
    }
  ): Promise<FirecrawlResponse<FirecrawlScrapeResult>> {
    try {
      const body: Record<string, unknown> = { url }

      if (options?.formats) {
        body.formats = options.formats
      } else {
        body.formats = ['markdown']
      }

      console.log(`Firecrawl scrape: ${url}`)

      const response = await this.fetchWithRetry(
        `${this.baseUrl}/scrape`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      )

      const responseText = await response.text()

      if (!response.ok) {
        console.error(`Firecrawl scrape error ${response.status}:`, responseText)
        return { success: false, error: `Firecrawl API ${response.status}: ${responseText}` }
      }

      const data = JSON.parse(responseText) as FirecrawlScrapeResponse
      console.log(`Firecrawl scrape returned: markdown=${(data.data?.markdown?.length || 0)} chars`)
      return { success: true, data: data.data }
    } catch (error) {
      console.error('Firecrawl scrape error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Search the web and scrape the top results for full content.
   * Combines search + scrape in one call for research use cases.
   */
  async searchAndScrape(
    query: string,
    options?: {
      limit?: number
      tbs?: string
      maxContentChars?: number
    }
  ): Promise<FirecrawlResponse<Array<{ title: string; url: string; description: string; content: string }>>> {
    // Step 1: Search
    const searchResult = await this.search(query, {
      limit: options?.limit ?? 5,
      tbs: options?.tbs,
    })

    if (!searchResult.success || !searchResult.data || searchResult.data.length === 0) {
      return { success: false, error: searchResult.error || 'No search results' }
    }

    // Step 2: Scrape top results for full content (in parallel)
    const maxContent = options?.maxContentChars ?? 500
    const scrapePromises = searchResult.data.slice(0, 3).map(async (result) => {
      try {
        const scrapeResult = await this.scrape(result.url)
        const markdown = scrapeResult.data?.markdown || ''
        return {
          title: result.title,
          url: result.url,
          description: result.description,
          content: markdown.length > maxContent ? markdown.substring(0, maxContent) + '...' : markdown,
        }
      } catch {
        // If scrape fails, still return the search result with description as content
        return {
          title: result.title,
          url: result.url,
          description: result.description,
          content: result.description,
        }
      }
    })

    const results = await Promise.all(scrapePromises)
    return { success: true, data: results }
  }
}

export function createFirecrawlClient(): FirecrawlClient {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY')
  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY environment variable is required')
  }
  return new FirecrawlClient({ apiKey })
}
