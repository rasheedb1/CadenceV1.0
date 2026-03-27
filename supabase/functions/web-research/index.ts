import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createFirecrawlClient } from '../_shared/firecrawl.ts'

Deno.serve(async (req: Request) => {
  const corsResult = handleCors(req)
  if (corsResult) return corsResult

  try {
    const { action, query, url, limit, max_chars } = await req.json()

    const firecrawl = createFirecrawlClient()

    // Search the web
    if (action === 'search') {
      if (!query) return errorResponse('Missing query', 400)
      const result = await firecrawl.search(query, { limit: limit || 5 })
      return jsonResponse({ success: true, results: result.data || [] })
    }

    // Scrape a specific URL
    if (action === 'scrape') {
      if (!url) return errorResponse('Missing url', 400)
      const result = await firecrawl.scrape(url, { maxCharacters: max_chars || 5000 })
      return jsonResponse({
        success: true,
        url,
        content: result.data?.markdown || '',
        metadata: result.data?.metadata || {},
      })
    }

    // Search + scrape (research mode)
    if (action === 'research' || !action) {
      if (!query) return errorResponse('Missing query', 400)
      const result = await firecrawl.searchAndScrape(query, {
        limit: limit || 5,
        maxContentChars: max_chars || 2000,
      })
      return jsonResponse({ success: true, results: result.data || [] })
    }

    return errorResponse(`Unknown action: ${action}. Use: search, scrape, research`, 400)
  } catch (err) {
    console.error('web-research error:', err)
    return errorResponse(err instanceof Error ? err.message : 'Error interno', 500)
  }
})
