// Exa AI Client for Supabase Edge Functions
// Documentation: https://docs.exa.ai

export interface ExaConfig {
  apiKey: string
}

export interface ExaSearchResult {
  title: string
  url: string
  publishedDate?: string
  author?: string
  text?: string
  highlights?: string[]
  highlightScores?: number[]
}

export interface ExaSearchResponse {
  requestId: string
  results: ExaSearchResult[]
}

export interface ExaResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export class ExaClient {
  private baseUrl = 'https://api.exa.ai'
  private apiKey: string

  constructor(config: ExaConfig) {
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
            console.log(`Exa API ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
        }

        return response
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt)
          console.log(`Exa API network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError || new Error('Exa API request failed after retries')
  }

  async searchWithContents(
    query: string,
    options?: {
      numResults?: number
      type?: 'keyword' | 'neural' | 'auto'
      startPublishedDate?: string
      endPublishedDate?: string
      includeDomains?: string[]
      excludeDomains?: string[]
      text?: boolean | { maxCharacters?: number }
      highlights?: boolean | { numSentences?: number; highlightsPerUrl?: number }
    }
  ): Promise<ExaResponse<ExaSearchResponse>> {
    try {
      const body: Record<string, unknown> = {
        query,
        numResults: options?.numResults ?? 5,
        type: options?.type ?? 'auto',
      }

      if (options?.startPublishedDate) body.startPublishedDate = options.startPublishedDate
      if (options?.endPublishedDate) body.endPublishedDate = options.endPublishedDate
      if (options?.includeDomains) body.includeDomains = options.includeDomains
      if (options?.excludeDomains) body.excludeDomains = options.excludeDomains

      // Content retrieval options
      const contents: Record<string, unknown> = {}
      if (options?.text !== undefined) contents.text = options.text
      if (options?.highlights !== undefined) contents.highlights = options.highlights
      if (Object.keys(contents).length > 0) body.contents = contents

      console.log(`Exa search: "${query}"`)

      const response = await this.fetchWithRetry(
        `${this.baseUrl}/search`,
        {
          method: 'POST',
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      )

      const responseText = await response.text()

      if (!response.ok) {
        console.error(`Exa search error ${response.status}:`, responseText)
        return { success: false, error: `Exa API ${response.status}: ${responseText}` }
      }

      const data = JSON.parse(responseText) as ExaSearchResponse
      console.log(`Exa search returned ${data.results?.length ?? 0} results`)
      return { success: true, data }
    } catch (error) {
      console.error('Exa search error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  async getContents(
    urls: string[],
    options?: {
      text?: boolean | { maxCharacters?: number }
      highlights?: boolean | { numSentences?: number; highlightsPerUrl?: number }
    }
  ): Promise<ExaResponse<ExaSearchResponse>> {
    try {
      const body: Record<string, unknown> = { urls }

      if (options?.text !== undefined) body.text = options.text
      if (options?.highlights !== undefined) body.highlights = options.highlights

      console.log(`Exa contents: ${urls.length} URLs`)

      const response = await this.fetchWithRetry(
        `${this.baseUrl}/contents`,
        {
          method: 'POST',
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      )

      const responseText = await response.text()

      if (!response.ok) {
        console.error(`Exa contents error ${response.status}:`, responseText)
        return { success: false, error: `Exa API ${response.status}: ${responseText}` }
      }

      const data = JSON.parse(responseText) as ExaSearchResponse
      console.log(`Exa contents returned ${data.results?.length ?? 0} results`)
      return { success: true, data }
    } catch (error) {
      console.error('Exa contents error:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }
}

export function createExaClient(): ExaClient {
  const apiKey = Deno.env.get('EXA_API_KEY')
  if (!apiKey) {
    throw new Error('EXA_API_KEY environment variable is required')
  }
  return new ExaClient({ apiKey })
}
