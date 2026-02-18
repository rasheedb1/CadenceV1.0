import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthUser } from '../_shared/supabase.ts'
import { createLLMClientForUser, type LLMClient } from '../_shared/llm.ts'

interface CompanyEnrichment {
  companyName: string
  websiteData: {
    success: boolean
    markdown?: string
    metadata?: { title?: string; description?: string }
  }
  newsData: {
    success: boolean
    articles: Array<{ url: string; title: string; description: string }>
  }
}

interface CompanyToEvaluate {
  company_name: string
  industry: string | null
  company_size: string | null
  website: string | null
  location: string | null
  description: string | null
  enrichment?: CompanyEnrichment
}

interface ReEvaluatedCompany {
  company_name: string
  relevance_score: number
  fit_category: 'high' | 'medium' | 'low'
  relevance_reason: string
  score_breakdown: Record<string, number>
  confidence: 'high' | 'medium' | 'low'
}

interface ReEvaluateRequest {
  icpDescription: string
  companies: CompanyToEvaluate[]
}

/** Strip markdown code fences, thinking blocks, and extract JSON */
function extractJSON(raw: string): string {
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim()
  cleaned = cleaned.replace(/```(?:json)?\s*\n?/g, '').replace(/```\s*$/g, '').trim()
  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) return objMatch[0]
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]
  return cleaned
}

/** Call LLM and parse JSON response with retries */
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

    const finalSystem = isRetry
      ? `${systemPrompt}\n\nCRITICAL: Your previous response was not valid JSON. You MUST respond with ONLY a valid JSON object. No markdown code fences, no explanation, no text before or after the JSON.`
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

      if (opts.parseKey && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const arr = parsed[opts.parseKey] || parsed.companies || parsed.results || parsed.data
        if (Array.isArray(arr)) return { success: true, data: arr as T }
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

/** Build a summary string for a company's enrichment data */
function buildEnrichmentContext(company: CompanyToEvaluate): string {
  const parts: string[] = []

  parts.push(`Company: ${company.company_name}`)
  if (company.industry) parts.push(`Industry: ${company.industry}`)
  if (company.company_size) parts.push(`Size: ${company.company_size}`)
  if (company.location) parts.push(`Location: ${company.location}`)
  if (company.description) parts.push(`Description: ${company.description}`)
  if (company.website) parts.push(`Website: ${company.website}`)

  const enrichment = company.enrichment
  if (enrichment) {
    // Website data
    if (enrichment.websiteData?.success && enrichment.websiteData.markdown) {
      const snippet = enrichment.websiteData.markdown.substring(0, 500)
      parts.push(`\n[VERIFIED WEBSITE DATA]`)
      if (enrichment.websiteData.metadata?.title) parts.push(`Site title: ${enrichment.websiteData.metadata.title}`)
      if (enrichment.websiteData.metadata?.description) parts.push(`Site description: ${enrichment.websiteData.metadata.description}`)
      parts.push(`Website content (excerpt): ${snippet}`)
    }

    // News data
    if (enrichment.newsData?.success && enrichment.newsData.articles.length > 0) {
      parts.push(`\n[VERIFIED NEWS DATA]`)
      enrichment.newsData.articles.slice(0, 3).forEach((article, i) => {
        parts.push(`News ${i + 1}: "${article.title}" - ${article.description}`)
      })
    }
  }

  return parts.join('\n')
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)

    const user = await getAuthUser(authHeader)
    if (!user) return errorResponse('Unauthorized', 401)

    const body: ReEvaluateRequest = await req.json()
    const { icpDescription, companies } = body

    if (!icpDescription?.trim()) return errorResponse('icpDescription is required')
    if (!companies?.length) return errorResponse('companies array is required')

    let llm: LLMClient
    try {
      llm = await createLLMClientForUser(user.id)
    } catch (err) {
      return errorResponse(`LLM not configured: ${err instanceof Error ? err.message : 'Unknown'}`, 500)
    }

    console.log(`Re-evaluating ${companies.length} companies with enrichment data (${llm.provider}/${llm.model})`)

    const systemPrompt = `You are an expert B2B market analyst. You are RE-EVALUATING companies against an ICP using REAL enrichment data (scraped websites and recent news).

Rules:
1. For companies with [VERIFIED WEBSITE DATA] or [VERIFIED NEWS DATA] sections, use that REAL data to make accurate assessments. Set confidence to "high".
2. For companies WITHOUT enrichment data, make your best assessment from basic info only. Set confidence to "low".
3. Score each company 1-10 with a score_breakdown of 7 categories (each 0-10):
   - industry_match: How well the company's industry aligns with the ICP
   - company_size: Does the company size match the desired range?
   - geography: Does the company operate in target regions?
   - business_model: Does the business model match?
   - digital_presence: Digital/tech characteristics match?
   - buying_signals: Indicators the company is ready to buy (look for growth signals, hiring, funding, product launches in news)
   - exclusion_check: 10 = passes all exclusion criteria, 0 = clearly excluded
4. Derive fit_category from relevance_score: "high" (8-10), "medium" (5-7), "low" (1-4)
5. Provide a relevance_reason explaining WHY this company is a fit (cite specific evidence from enrichment data when available)
6. Be MORE ACCURATE than initial scoring — use the real data to correct any initial misjudgments

You MUST respond with a JSON object:
{"companies": [{"company_name": "...", "relevance_score": 8, "fit_category": "high", "relevance_reason": "...", "score_breakdown": {"industry_match": 9, ...}, "confidence": "high"}]}`

    // Process in batches to avoid token overflow (max ~25 companies per LLM call)
    const BATCH_SIZE = 25
    const allReEvaluated: ReEvaluatedCompany[] = []

    for (let batchStart = 0; batchStart < companies.length; batchStart += BATCH_SIZE) {
      const batch = companies.slice(batchStart, batchStart + BATCH_SIZE)
      const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(companies.length / BATCH_SIZE)
      console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} companies)`)

      const companySummaries = batch.map((c, i) =>
        `--- Company ${batchStart + i + 1} ---\n${buildEnrichmentContext(c)}`
      ).join('\n\n')

      const userPrompt = `## ICP Description:
${icpDescription.trim()}

## Companies to Re-Evaluate (with enrichment data where available):
${companySummaries}

Re-evaluate all ${batch.length} companies and return updated scores as JSON.`

      // Scale maxTokens: ~200 tokens per company
      const batchMaxTokens = Math.min(16384, Math.max(4096, batch.length * 200))

      const result = await callLLMForJSON<ReEvaluatedCompany[]>(
        llm,
        systemPrompt,
        userPrompt,
        { maxTokens: batchMaxTokens, temperature: 0.3, maxRetries: 2, parseKey: 'companies' }
      )

      if (!result.success) {
        console.error(`Batch ${batchNum} failed: ${result.error}`)
        // Continue with other batches — don't fail the whole request
        continue
      }

      allReEvaluated.push(...result.data)
    }

    if (allReEvaluated.length === 0) {
      return errorResponse('Re-evaluation failed: no batches succeeded', 500)
    }

    // Post-process: normalize scores and derive categories
    const reEvaluated = allReEvaluated.map(c => {
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

      const confidence = c.confidence === 'high' || c.confidence === 'medium' || c.confidence === 'low'
        ? c.confidence
        : 'low'

      return {
        ...c,
        relevance_score: score,
        fit_category: category,
        score_breakdown: breakdown,
        confidence,
      }
    })

    console.log(`Re-evaluated ${reEvaluated.length} companies (high: ${reEvaluated.filter(c => c.fit_category === 'high').length}, verified: ${reEvaluated.filter(c => c.confidence === 'high').length})`)

    return jsonResponse({
      success: true,
      companies: reEvaluated,
    })
  } catch (error) {
    console.error('Re-evaluate companies error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
