import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext } from '../_shared/supabase.ts'
import { createLLMClientForUser, type LLMClient } from '../_shared/llm.ts'
import { createFirecrawlClient } from '../_shared/firecrawl.ts'

interface DiscoverRequest {
  icpDescription: string
  minCompanies?: number
  maxCompanies?: number
  excludedCompanies?: string[]
}

interface DiscoveredCompany {
  company_name: string
  industry: string | null
  company_size: string | null
  website: string | null
  location: string | null
  description: string | null
  relevance_reason: string | null
  relevance_score: number
  fit_category: 'high' | 'medium' | 'low'
  score_breakdown?: Record<string, number>
}

/** Strip markdown code fences, thinking blocks, and extract JSON from LLM response */
function extractJSON(raw: string): string {
  // Remove <think>...</think> or <reasoning>...</reasoning> blocks
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim()
  // Remove ```json ... ``` or ``` ... ``` wrappers
  cleaned = cleaned.replace(/```(?:json)?\s*\n?/g, '').replace(/```\s*$/g, '').trim()
  // Try to find a JSON array
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]
  // Try to find a JSON object
  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) return objMatch[0]
  return cleaned
}

/** Normalize company name for comparison (strip suffixes, punctuation, lowercase) */
function normalizeForComparison(name: string): string {
  if (!name) return ''
  const suffixes = [
    'inc', 'incorporated', 'corp', 'corporation', 'llc', 'ltd', 'limited',
    'co', 'company', 'plc', 'gmbh', 'ag', 'sa', 'sas', 'srl', 'bv',
    'nv', 'pty', 'pvt', 'lp', 'llp', 'pllc', 'group', 'holdings',
    'international', 'technologies', 'solutions', 'services', 'consulting',
    'partners', 'associates',
  ]
  let n = name.toLowerCase().trim()
    .replace(/\(.*?\)/g, '')
    .replace(/[.,\-_&+]/g, ' ')
    .replace(/['"!@#$%^*(){}[\]:;<>?/\\|`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  let changed = true
  while (changed) {
    changed = false
    for (const s of suffixes) {
      const re = new RegExp(`\\s+${s}$`, 'i')
      if (re.test(n)) { n = n.replace(re, '').trim(); changed = true }
    }
  }
  return n
}

/** Call LLM and parse JSON response with up to maxRetries attempts */
async function callLLMForJSON<T>(
  llm: LLMClient,
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens: number; temperature: number; maxRetries?: number; parseKey?: string }
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  const maxRetries = opts.maxRetries ?? 2
  const isOpenAI = llm.provider === 'openai'

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const isRetry = attempt > 0
    console.log(`LLM JSON call attempt ${attempt + 1}/${maxRetries + 1}${isRetry ? ' (retry)' : ''}`)

    // On retry, make the prompt more explicit
    const finalSystem = isRetry
      ? `${systemPrompt}\n\nCRITICAL: Your previous response was not valid JSON. You MUST respond with ONLY a valid JSON ${opts.parseKey ? 'object' : 'array'}. No markdown code fences, no explanation, no text before or after the JSON.`
      : systemPrompt

    const result = await llm.createMessage({
      system: finalSystem,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: opts.maxTokens,
      temperature: isRetry ? 0.1 : opts.temperature,
      jsonMode: isOpenAI,
    })

    if (!result.success) {
      console.error(`LLM call failed on attempt ${attempt + 1}:`, result.error)
      if (attempt === maxRetries) return { success: false, error: result.error || 'LLM call failed' }
      continue
    }

    try {
      const raw = result.text
      console.log(`Raw LLM response (${raw.length} chars, first 300):`, raw.substring(0, 300))
      const jsonStr = extractJSON(raw)
      const parsed = JSON.parse(jsonStr)

      // If jsonMode returns a wrapper object, extract the array from a known key
      if (opts.parseKey && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const arr = parsed[opts.parseKey] || parsed.queries || parsed.companies || parsed.results || parsed.data
        if (Array.isArray(arr)) return { success: true, data: arr as T }
        // If the object itself has the right shape, try values
        const firstArrayVal = Object.values(parsed).find(v => Array.isArray(v))
        if (firstArrayVal) return { success: true, data: firstArrayVal as T }
      }

      if (Array.isArray(parsed)) return { success: true, data: parsed as T }

      throw new Error(`Expected array but got ${typeof parsed}`)
    } catch (err) {
      console.error(`Parse failed on attempt ${attempt + 1}:`, err instanceof Error ? err.message : err)
      if (attempt === maxRetries) return { success: false, error: `Failed to parse after ${maxRetries + 1} attempts` }
    }
  }

  return { success: false, error: 'Exhausted retries' }
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)

    const ctx = await getAuthContext(authHeader)
    if (!ctx) return errorResponse('Unauthorized', 401)

    // Parse request
    const body: DiscoverRequest = await req.json()
    const {
      icpDescription,
      minCompanies = 5,
      maxCompanies = 15,
      excludedCompanies = [],
    } = body

    if (!icpDescription?.trim()) {
      return errorResponse('icpDescription is required')
    }

    // Initialize clients
    let llm: LLMClient
    let firecrawl
    try {
      llm = await createLLMClientForUser(ctx.userId)
    } catch (err) {
      return errorResponse(`LLM not configured: ${err instanceof Error ? err.message : 'Unknown'}`, 500)
    }
    try {
      firecrawl = createFirecrawlClient()
    } catch {
      return errorResponse('Firecrawl API not configured', 500)
    }

    // Scale search effort based on how many companies are requested
    // Keep queries minimal to avoid edge function timeout (60s limit)
    const isLargeRequest = maxCompanies > 30
    const numQueries = isLargeRequest ? 5 : 3
    const resultsPerQuery = isLargeRequest ? 10 : 5

    // ── Step 1: Generate search queries from ICP description ──
    console.log(`Step 1: Generating ${numQueries} search queries (${llm.provider}/${llm.model})...`)

    const querySystem = `You are an expert B2B market researcher. Generate web search queries to find real companies matching an Ideal Customer Profile (ICP).

Rules:
- Generate exactly ${numQueries} diverse search queries
- Each query should approach the ICP from a different angle (industry, geography, company characteristics, technology, market segment${isLargeRequest ? ', funding stage, specific verticals, company directories, market reports, competitor lists' : ''})
- Queries should be specific enough to find REAL company names, not generic articles
- Include company list queries like "top [industry] companies in [region]"
- Include queries for industry reports, directories, and rankings
${isLargeRequest ? '- Include queries targeting different sub-industries and geographies to maximize diversity\n- Include queries for funded startups, unicorns, and fast-growing companies in target sectors' : ''}

You MUST respond with a JSON object: {"queries": [${Array.from({ length: numQueries }, (_, i) => `"query${i + 1}"`).join(', ')}]}`

    const queryResult = await callLLMForJSON<string[]>(
      llm,
      querySystem,
      `Generate ${numQueries} search queries to find companies matching this ICP:\n\n${icpDescription.trim()}`,
      { maxTokens: 512, temperature: 0.7, maxRetries: 1, parseKey: 'queries' }
    )

    if (!queryResult.success) {
      return errorResponse(`Failed to generate queries: ${queryResult.error}`, 500)
    }

    const searchQueries = queryResult.data
    console.log(`Generated ${searchQueries.length} search queries:`, searchQueries)

    // ── Step 2: Run Firecrawl searches in parallel ──
    console.log('Step 2: Running Firecrawl searches...')

    const searchPromises = searchQueries.map((query) =>
      firecrawl.search(query, { limit: resultsPerQuery, maxRetries: 1 })
    )
    const searchResults = await Promise.all(searchPromises)

    // Collect all results
    const allResults: Array<{ query: string; title: string; url: string; description: string }> = []
    searchResults.forEach((result, i) => {
      if (result.success && result.data) {
        result.data.forEach((r) => {
          allResults.push({
            query: searchQueries[i],
            title: r.title,
            url: r.url,
            description: r.description,
          })
        })
      }
    })

    console.log(`Firecrawl returned ${allResults.length} total results across ${searchQueries.length} queries`)

    if (allResults.length === 0) {
      return jsonResponse({
        success: true,
        companies: [],
        excludedCompanies: [],
        queriesUsed: searchQueries,
        totalSearchResults: 0,
        message: 'No search results found. Try refining your ICP description.',
      })
    }

    // ── Step 3: LLM analyzes results and extracts companies ──
    // For large requests, batch the analysis to avoid LLM token overflow and edge function timeout
    console.log(`Step 3: Analyzing results with ${llm.provider}/${llm.model}...`)

    const analysisSystem = `You are an expert B2B market analyst. Extract and identify real companies from web search results that match an Ideal Customer Profile (ICP).

Rules:
1. Extract REAL company names from the search results — don't invent companies
2. Deduplicate: if the same company appears multiple times, merge the info
3. For each company, provide as much structured data as you can find from the results
4. Score each company's relevance to the ICP on a 1-10 scale:
   - 8-10 = "high" fit (strong match on industry, size, geography, and key ICP signals)
   - 5-7 = "medium" fit (partial match, some ICP criteria met)
   - 1-4 = "low" fit (tangential match, few ICP criteria met)
5. Set fit_category based on relevance_score: "high" for 8-10, "medium" for 5-7, "low" for 1-4
6. Provide a score_breakdown object with 7 category scores (each 0-10):
   - industry_match: How well does the company's industry align with the ICP?
   - company_size: Does the company size match the desired range?
   - geography: Does the company operate in the target regions?
   - business_model: Does the business model match (B2B, SaaS, marketplace, etc.)?
   - digital_presence: Does the company have the desired digital/tech characteristics?
   - buying_signals: Are there indicators the company is ready to buy?
   - exclusion_check: 10 = passes all exclusion criteria, 0 = clearly excluded
7. Extract as many matching companies as you can find from the provided search results
8. Do NOT pad with irrelevant companies — only include genuine matches
${excludedCompanies.length > 0 ? `9. EXCLUDED COMPANIES — Do NOT include any of these companies in your results (they are existing customers, competitors, or on the Do Not Contact list):
${excludedCompanies.slice(0, 100).map(name => `   - ${name}`).join('\n')}
   If you find any of these companies in the search results, skip them entirely.` : ''}

You MUST respond with a JSON object with this exact structure:
{"companies": [{"company_name": "...", "industry": "...", "company_size": "...", "website": "...", "location": "...", "description": "...", "relevance_reason": "...", "relevance_score": 8, "fit_category": "high", "score_breakdown": {"industry_match": 9, "company_size": 7, "geography": 8, "business_model": 9, "digital_presence": 8, "buying_signals": 6, "exclusion_check": 10}}]}`

    // Split search results into batches for parallel LLM analysis
    const RESULTS_PER_BATCH = 50
    const resultBatches: Array<typeof allResults> = []
    for (let i = 0; i < allResults.length; i += RESULTS_PER_BATCH) {
      resultBatches.push(allResults.slice(i, i + RESULTS_PER_BATCH))
    }

    console.log(`Splitting ${allResults.length} search results into ${resultBatches.length} batch(es) for analysis`)

    const allExtracted: DiscoveredCompany[] = []

    // Run all analysis batches in parallel to minimize total time
    const batchPromises = resultBatches.map((batch, batchIdx) => {
      const companiesPerBatch = Math.ceil(maxCompanies / resultBatches.length)
      const batchMaxTokens = Math.min(8192, Math.max(4096, companiesPerBatch * 250))

      console.log(`Analysis batch ${batchIdx + 1}/${resultBatches.length}: ${batch.length} results, targeting ~${companiesPerBatch} companies, maxTokens=${batchMaxTokens}`)

      return callLLMForJSON<DiscoveredCompany[]>(
        llm,
        analysisSystem,
        `## ICP Description:
${icpDescription.trim()}

## Search Results (batch ${batchIdx + 1}/${resultBatches.length}):
${batch.map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${r.description}`).join('\n\n')}

Extract and rank companies from these results that match the ICP. Return up to ${companiesPerBatch} companies as JSON.`,
        { maxTokens: batchMaxTokens, temperature: 0.3, maxRetries: 1, parseKey: 'companies' }
      ).then(result => ({ batchIdx, result }))
    })

    const batchResults = await Promise.all(batchPromises)
    for (const { batchIdx, result } of batchResults) {
      if (result.success) {
        allExtracted.push(...result.data)
        console.log(`Batch ${batchIdx + 1} extracted ${result.data.length} companies`)
      } else {
        console.error(`Batch ${batchIdx + 1} failed: ${result.error}`)
      }
    }

    if (allExtracted.length === 0) {
      return errorResponse('Failed to extract companies from search results', 500)
    }

    // Deduplicate by company_name (keep the one with higher score)
    const deduped = new Map<string, DiscoveredCompany>()
    for (const c of allExtracted) {
      const key = c.company_name.toLowerCase().trim()
      const existing = deduped.get(key)
      if (!existing || (c.relevance_score ?? 0) > (existing.relevance_score ?? 0)) {
        deduped.set(key, c)
      }
    }

    // ── Post-filter: remove excluded companies via normalized name matching ──
    const excludedNormalized = new Set(excludedCompanies.map(normalizeForComparison))
    const excludedFromResults: Array<{ company_name: string; reason: string }> = []
    const afterExclusion: DiscoveredCompany[] = []

    for (const company of Array.from(deduped.values())) {
      const norm = normalizeForComparison(company.company_name)
      if (excludedNormalized.has(norm)) {
        excludedFromResults.push({
          company_name: company.company_name,
          reason: 'Matched exclusion list (customer/competitor/DNC)',
        })
      } else {
        afterExclusion.push(company)
      }
    }

    if (excludedFromResults.length > 0) {
      console.log(`Post-filter excluded ${excludedFromResults.length} companies: ${excludedFromResults.map(e => e.company_name).join(', ')}`)
    }

    // Post-process: normalize scores, breakdowns, and derive categories server-side
    const companies = afterExclusion.map(c => {
      const score = Math.max(1, Math.min(10, Math.round(c.relevance_score || 5)))
      const category: 'high' | 'medium' | 'low' =
        score >= 8 ? 'high' : score >= 5 ? 'medium' : 'low'
      let breakdown = c.score_breakdown
      if (breakdown && typeof breakdown === 'object') {
        const normalized: Record<string, number> = {}
        for (const [k, v] of Object.entries(breakdown)) {
          normalized[k] = Math.max(0, Math.min(10, Math.round(Number(v) || 0)))
        }
        breakdown = normalized
      }
      return { ...c, relevance_score: score, fit_category: category, score_breakdown: breakdown }
    })
    // Sort by score descending
    companies.sort((a, b) => b.relevance_score - a.relevance_score)
    console.log(`Discovered ${companies.length} unique companies (high: ${companies.filter(c => c.fit_category === 'high').length}, medium: ${companies.filter(c => c.fit_category === 'medium').length}, low: ${companies.filter(c => c.fit_category === 'low').length})`)

    return jsonResponse({
      success: true,
      companies,
      excludedCompanies: excludedFromResults,
      queriesUsed: searchQueries,
      totalSearchResults: allResults.length,
    })
  } catch (error) {
    console.error('Discover ICP companies error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
