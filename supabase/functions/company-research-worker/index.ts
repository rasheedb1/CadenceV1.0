import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient } from '../_shared/supabase.ts'
import { createFirecrawlClient } from '../_shared/firecrawl.ts'
import { createLLMClientForUser } from '../_shared/llm.ts'
import type { LLMClient } from '../_shared/llm.ts'
import type { FirecrawlClient } from '../_shared/firecrawl.ts'

// ─── Types ────────────────────────────────────────────────────────

interface WorkerRequest {
  researchProjectCompanyId: string
  orgId: string
  userId: string
}

interface ResearchSource {
  url: string
  title: string
  type: string
  snippet: string
}

interface GatherResult {
  status: 'fulfilled' | 'rejected'
  value?: unknown
  reason?: unknown
}

// ─── Constants ───────────────────────────────────────────────────

// Per-Firecrawl-call timeout: 25s max (generous since we're async)
const FIRECRAWL_CALL_TIMEOUT_MS = 25_000

// ─── Helpers ──────────────────────────────────────────────────────

function truncate(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text || ''
  return text.substring(0, maxLen) + '...'
}

function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    let cleaned = text.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    return JSON.parse(cleaned) as T
  } catch {
    return fallback
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms)
    ),
  ])
}

function collectTopUrls(
  searchResults: Record<string, GatherResult>,
  maxUrls: number,
): string[] {
  const seen = new Set<string>()
  const urls: string[] = []
  const skipDomains = ['linkedin.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'youtube.com']
  const priorityKeys = ['newsRecent', 'newsPR', 'funding', 'custom_0', 'custom_1', 'leadership', 'competitors', 'industrySearch']

  for (const key of priorityKeys) {
    if (urls.length >= maxUrls) break
    const result = searchResults[key]
    if (result?.status !== 'fulfilled') continue
    const val = result.value as { success?: boolean; data?: Array<{ url: string }> }
    if (!val?.success || !val.data) continue
    for (const item of val.data) {
      if (urls.length >= maxUrls) break
      if (!item.url || seen.has(item.url)) continue
      if (skipDomains.some(d => item.url.includes(d))) continue
      seen.add(item.url)
      urls.push(item.url)
    }
  }
  return urls
}

function buildDossier(
  websiteResults: Record<string, GatherResult>,
  searchResults: Record<string, GatherResult>,
  secondaryScrapes: Array<{ url: string; markdown: string }>,
  companyName: string,
): { dossier: string; sources: ResearchSource[] } {
  const sections: string[] = []
  const sources: ResearchSource[] = []
  const maxPerSource = 5000
  let totalChars = 0
  const maxTotal = 70000

  function addSection(title: string, content: string) {
    if (totalChars >= maxTotal) return
    const truncated = truncate(content, Math.min(maxPerSource, maxTotal - totalChars))
    if (truncated.trim()) {
      sections.push(`### ${title}\n${truncated}`)
      totalChars += truncated.length + title.length + 10
    }
  }

  function addSearchResults(key: string, title: string, type: string) {
    const result = searchResults[key]
    if (result?.status !== 'fulfilled') return
    const val = result.value as { success?: boolean; data?: Array<{ url: string; title: string; description: string }> }
    if (!val?.success || !val.data || val.data.length === 0) return
    const lines: string[] = []
    for (const item of val.data) {
      lines.push(`- **${item.title || 'Untitled'}** (${item.url})\n  ${truncate(item.description || '', 400)}`)
      sources.push({ url: item.url, title: item.title || 'Untitled', type, snippet: truncate(item.description || '', 200) })
    }
    addSection(title, lines.join('\n'))
  }

  // Website Content
  const websiteKeys = ['websiteMain', 'websiteAbout', 'websiteProducts', 'websiteTeam']
  const websiteLabels = ['Homepage', 'About Page', 'Products Page', 'Team Page']
  for (let i = 0; i < websiteKeys.length; i++) {
    const result = websiteResults[websiteKeys[i]]
    if (result?.status !== 'fulfilled') continue
    const val = result.value as { success?: boolean; data?: { markdown?: string; metadata?: Record<string, unknown> } }
    if (!val?.success || !val.data?.markdown) continue
    addSection(`Website - ${websiteLabels[i]}`, val.data.markdown)
    const metadata = val.data.metadata || {}
    sources.push({
      url: (metadata.sourceURL as string) || (metadata.url as string) || '',
      title: (metadata.title as string) || `${companyName} ${websiteLabels[i]}`,
      type: 'website',
      snippet: truncate(val.data.markdown, 200),
    })
  }

  addSearchResults('newsRecent', 'Recent News', 'news')
  addSearchResults('newsPR', 'Press Releases & Announcements', 'press_release')
  addSearchResults('funding', 'Funding & Financial Information', 'financial')
  addSearchResults('competitors', 'Competitive Landscape', 'competitor')
  addSearchResults('leadership', 'Leadership & Key People', 'leadership')
  addSearchResults('industrySearch', 'Industry & Market Trends', 'industry')

  for (let i = 0; i < 10; i++) {
    const key = `custom_${i}`
    if (!searchResults[key]) break
    addSearchResults(key, `Custom Research ${i + 1}`, 'custom')
  }

  if (secondaryScrapes.length > 0) {
    const articleLines: string[] = []
    for (const scrape of secondaryScrapes) {
      articleLines.push(`#### Source: ${scrape.url}\n${truncate(scrape.markdown, maxPerSource)}`)
    }
    addSection('Full Article Content', articleLines.join('\n\n'))
  }

  return { dossier: sections.join('\n\n'), sources }
}

function extractExecutiveSummary(report: string): string {
  const execMatch = report.match(/##\s*(?:1\.\s*)?Executive\s+Summary\s*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/)
  if (execMatch && execMatch[1]) return execMatch[1].trim()
  const paragraphs = report.split('\n\n').filter(p => p.trim() && !p.startsWith('#'))
  return paragraphs.slice(0, 3).join('\n\n').trim()
}

// ─── Phase Executors ─────────────────────────────────────────────

async function phaseGather(
  firecrawl: FirecrawlClient,
  llm: LLMClient,
  companyName: string,
  website: string,
  industry: string,
  researchPrompt: string,
): Promise<{
  websiteResults: Record<string, GatherResult>
  searchResults: Record<string, GatherResult>
  secondaryScrapes: Array<{ url: string; markdown: string }>
}> {
  // Generate custom search queries
  let customQueries: string[] = []
  if (researchPrompt.trim()) {
    try {
      const queryGenResult = await withTimeout(
        llm.createMessage({
          system: 'Generate exactly 2 web search queries to research a company based on the user\'s research focus. Return ONLY a JSON array of 2 strings. No explanation.',
          messages: [{
            role: 'user',
            content: `Company: ${companyName}\nWebsite: ${website}\nIndustry: ${industry}\n\nResearch focus:\n${researchPrompt.substring(0, 2000)}`,
          }],
          maxTokens: 200,
          temperature: 0.3,
        }),
        15000,
        'query gen'
      )
      if (queryGenResult.success) {
        customQueries = safeJsonParse<string[]>(queryGenResult.text, [])
        if (!Array.isArray(customQueries)) customQueries = []
        customQueries = customQueries.filter(q => typeof q === 'string' && q.trim()).slice(0, 2)
      }
    } catch (err) {
      console.warn('Custom query gen failed (non-fatal):', err)
    }
    console.log(`Custom queries: ${customQueries.length}`, customQueries)
  }

  // Parallel web gathering
  const gatherPromises: Record<string, Promise<unknown>> = {}

  if (website) {
    const cleanWebsite = website.replace(/\/$/, '')
    gatherPromises.websiteMain = withTimeout(
      firecrawl.scrape(cleanWebsite, { formats: ['markdown'], maxCharacters: 8000 }),
      FIRECRAWL_CALL_TIMEOUT_MS, 'scrape main'
    )
    gatherPromises.websiteAbout = withTimeout(
      firecrawl.scrape(cleanWebsite + '/about', { formats: ['markdown'], maxCharacters: 5000 }),
      FIRECRAWL_CALL_TIMEOUT_MS, 'scrape about'
    )
    gatherPromises.websiteProducts = withTimeout(
      firecrawl.scrape(cleanWebsite + '/products', { formats: ['markdown'], maxCharacters: 5000 }),
      FIRECRAWL_CALL_TIMEOUT_MS, 'scrape products'
    )
    gatherPromises.websiteTeam = withTimeout(
      firecrawl.scrape(cleanWebsite + '/team', { formats: ['markdown'], maxCharacters: 5000 }),
      FIRECRAWL_CALL_TIMEOUT_MS, 'scrape team'
    )
  }

  gatherPromises.newsRecent = withTimeout(firecrawl.search(`"${companyName}" news 2026`, { limit: 8, maxRetries: 1 }), FIRECRAWL_CALL_TIMEOUT_MS, 'search news')
  gatherPromises.newsPR = withTimeout(firecrawl.search(`"${companyName}" press release announcement`, { limit: 5, tbs: 'qdr:y', maxRetries: 1 }), FIRECRAWL_CALL_TIMEOUT_MS, 'search PR')
  gatherPromises.funding = withTimeout(firecrawl.search(`"${companyName}" funding round valuation revenue`, { limit: 5, tbs: 'qdr:y', maxRetries: 1 }), FIRECRAWL_CALL_TIMEOUT_MS, 'search funding')
  gatherPromises.competitors = withTimeout(firecrawl.search(`"${companyName}" competitors alternatives vs ${industry || ''}`, { limit: 5, maxRetries: 1 }), FIRECRAWL_CALL_TIMEOUT_MS, 'search competitors')
  gatherPromises.industrySearch = withTimeout(firecrawl.search(`${industry || companyName} market trends 2026`, { limit: 5, maxRetries: 1 }), FIRECRAWL_CALL_TIMEOUT_MS, 'search industry')
  gatherPromises.leadership = withTimeout(firecrawl.search(`"${companyName}" CEO founder leadership executive team`, { limit: 5, maxRetries: 1 }), FIRECRAWL_CALL_TIMEOUT_MS, 'search leadership')

  for (let i = 0; i < customQueries.length; i++) {
    gatherPromises[`custom_${i}`] = withTimeout(firecrawl.search(customQueries[i], { limit: 5, maxRetries: 1 }), FIRECRAWL_CALL_TIMEOUT_MS, `search custom_${i}`)
  }

  const gatherKeys = Object.keys(gatherPromises)
  const gatherResults = await Promise.allSettled(Object.values(gatherPromises))
  const settled: Record<string, GatherResult> = {}
  gatherKeys.forEach((key, i) => {
    settled[key] = {
      status: gatherResults[i].status,
      value: gatherResults[i].status === 'fulfilled' ? (gatherResults[i] as PromiseFulfilledResult<unknown>).value : undefined,
      reason: gatherResults[i].status === 'rejected' ? (gatherResults[i] as PromiseRejectedResult).reason : undefined,
    }
  })

  const fulfilled = gatherKeys.filter(k => settled[k].status === 'fulfilled').length
  const rejected = gatherKeys.filter(k => settled[k].status === 'rejected').length
  console.log(`Gather: ${fulfilled} ok, ${rejected} failed / ${gatherKeys.length}`)

  const websiteResults: Record<string, GatherResult> = {}
  const searchResults: Record<string, GatherResult> = {}
  for (const key of gatherKeys) {
    if (key.startsWith('website')) websiteResults[key] = settled[key]
    else searchResults[key] = settled[key]
  }

  // Secondary scrapes
  const urlsToScrape = collectTopUrls(searchResults, 3)
  const secondaryScrapes: Array<{ url: string; markdown: string }> = []

  if (urlsToScrape.length > 0) {
    console.log(`Secondary scrapes: ${urlsToScrape.length} URLs`)
    const secondaryResults = await Promise.allSettled(
      urlsToScrape.map(url =>
        withTimeout(firecrawl.scrape(url, { formats: ['markdown'], maxCharacters: 5000 }), FIRECRAWL_CALL_TIMEOUT_MS, `scrape ${url}`)
      )
    )
    for (let i = 0; i < secondaryResults.length; i++) {
      if (secondaryResults[i].status === 'fulfilled') {
        const val = (secondaryResults[i] as PromiseFulfilledResult<unknown>).value as { success?: boolean; data?: { markdown?: string } }
        if (val?.success && val.data?.markdown) {
          secondaryScrapes.push({ url: urlsToScrape[i], markdown: val.data.markdown })
        }
      }
    }
    console.log(`Secondary scrapes: ${secondaryScrapes.length} ok`)
  }

  return { websiteResults, searchResults, secondaryScrapes }
}

async function phaseSynthesize(
  llm: LLMClient,
  companyName: string,
  website: string,
  industry: string,
  researchPrompt: string,
  dossier: string,
): Promise<string> {
  const systemPrompt = `You are an expert business research analyst producing comprehensive company research reports.

RULES:
- Use ONLY information from the provided sources. Do NOT invent facts.
- Cite sources by including [Source: URL] inline when making specific claims.
- Structure the report into clear sections with markdown headers (## level).
- Be thorough and exhaustive — produce a detailed, in-depth report.
- Write in a professional, analytical tone.
- If information for a section is not available, state that clearly.
- The report should be as long and detailed as the data supports. No length limits.
- Start with a 2-3 paragraph Executive Summary.
- Do NOT truncate or shorten your response. Write the complete report.`

  const userContent = `## RESEARCH TASK
Company: ${companyName}
Website: ${website || 'N/A'}
Industry: ${industry || 'N/A'}

## CUSTOM RESEARCH INSTRUCTIONS
${researchPrompt}

## REQUIRED SECTIONS
1. Executive Summary
2. Company Overview
3. Products & Services
4. Leadership & Key People
5. Recent News & Developments
6. Financial Overview
7. Competitive Landscape
8. Industry Position & Market Analysis
9. Key Takeaways & Strategic Implications

## GATHERED DATA
${dossier || '(No web data gathered — produce a report based on your existing knowledge, clearly noting real-time data was unavailable.)'}`

  const result = await llm.createMessage({
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
    maxTokens: 16384,
    temperature: 0.3,
  })

  if (!result.success) {
    // Retry once
    console.error('Synthesis failed, retrying:', result.error)
    const retry = await llm.createMessage({
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      maxTokens: 16384,
      temperature: 0.3,
    })
    if (!retry.success) throw new Error(`LLM synthesis failed: ${retry.error}`)
    return retry.text
  }

  return result.text
}

// ─── Main Worker Handler ─────────────────────────────────────────

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const startTime = Date.now()

  let body: WorkerRequest
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON', 400)
  }

  const { researchProjectCompanyId, orgId, userId } = body
  if (!researchProjectCompanyId || !orgId || !userId) {
    return errorResponse('Missing required fields', 400)
  }

  // Use service role client (no user auth needed — this is a background worker)
  const supabase = createSupabaseClient()

  console.log(`[Worker] Starting research for ${researchProjectCompanyId}`)

  // Load the research_project_companies row
  const { data: rpc, error: rpcError } = await supabase
    .from('research_project_companies')
    .select('*')
    .eq('id', researchProjectCompanyId)
    .eq('org_id', orgId)
    .single()

  if (rpcError || !rpc) {
    console.error('[Worker] Row not found:', rpcError)
    return errorResponse('Not found', 404)
  }

  // Load the parent research project
  const { data: project, error: projectError } = await supabase
    .from('research_projects')
    .select('*')
    .eq('id', rpc.research_project_id)
    .eq('org_id', orgId)
    .single()

  if (projectError || !project) {
    console.error('[Worker] Project not found:', projectError)
    await supabase.from('research_project_companies').update({ status: 'failed', error_message: 'Research project not found' }).eq('id', researchProjectCompanyId)
    return errorResponse('Project not found', 404)
  }

  const companyName = rpc.company_name || ''
  const website = rpc.company_website || ''
  const industry = rpc.company_industry || ''
  const researchPrompt = project.research_prompt || ''

  // Init clients
  let firecrawl: FirecrawlClient
  let llm: LLMClient

  try {
    firecrawl = createFirecrawlClient()
  } catch (err) {
    console.error('[Worker] Firecrawl init failed:', err)
    await supabase.from('research_project_companies').update({ status: 'failed', error_message: 'Firecrawl API not configured' }).eq('id', researchProjectCompanyId)
    return errorResponse('Firecrawl not configured', 500)
  }

  try {
    llm = await createLLMClientForUser(userId)
  } catch (err) {
    console.error('[Worker] LLM init failed:', err)
    await supabase.from('research_project_companies').update({ status: 'failed', error_message: 'LLM API not configured' }).eq('id', researchProjectCompanyId)
    return errorResponse('LLM not configured', 500)
  }

  console.log(`[Worker] LLM: ${llm.provider}/${llm.model}`)

  try {
    // ── Phase 1+2: Gather ──────────────────────────────────────
    console.log('[Worker] Phase: Gather')
    const { websiteResults, searchResults, secondaryScrapes } = await phaseGather(
      firecrawl, llm, companyName, website, industry, researchPrompt
    )

    // ── Phase 3: Assemble dossier ──────────────────────────────
    console.log('[Worker] Phase: Assemble')
    const { dossier, sources: allSources } = buildDossier(websiteResults, searchResults, secondaryScrapes, companyName)
    console.log(`[Worker] Dossier: ${dossier.length} chars, ${allSources.length} sources`)

    // Check if we're approaching the function time limit (140s)
    const elapsed = Date.now() - startTime
    if (elapsed > 130000) {
      // Save gathered data and invoke ourselves again for synthesis
      console.log(`[Worker] Time check: ${elapsed}ms elapsed — chaining to synthesis`)
      await supabase.from('research_project_companies').update({
        research_metadata: {
          phase: 'gathered',
          dossier_length: dossier.length,
          sources_count: allSources.length,
          gather_time_ms: elapsed,
          _dossier: dossier,
          _sources: allSources,
        },
      }).eq('id', researchProjectCompanyId)

      // Chain: invoke ourselves again for synthesis phase
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      fetch(`${supabaseUrl}/functions/v1/company-research-worker`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ researchProjectCompanyId, orgId, userId, phase: 'synthesize' }),
      }).catch(err => console.error('[Worker] Chain invoke failed:', err))

      await new Promise(resolve => setTimeout(resolve, 200))
      return jsonResponse({ success: true, phase: 'gathered', chained: true })
    }

    // ── Phase 4: Synthesize ────────────────────────────────────
    console.log('[Worker] Phase: Synthesize')
    const finalReport = await phaseSynthesize(llm, companyName, website, industry, researchPrompt, dossier)
    console.log(`[Worker] Report: ${finalReport.length} chars`)

    // ── Phase 5: Quick quality score ───────────────────────────
    let qualityScore = 7
    const elapsed2 = Date.now() - startTime
    if (elapsed2 < 135000) {
      try {
        const qr = await withTimeout(llm.createMessage({
          system: 'Evaluate a company research report. Respond with JSON only: {"overall_score": <1-10>}',
          messages: [{ role: 'user', content: `Rate this report 1-10:\n\n${finalReport.substring(0, 4000)}\n\nJSON:` }],
          maxTokens: 100, temperature: 0.1, jsonMode: true,
        }), 10000, 'quality check')
        if (qr.success) {
          const qd = safeJsonParse<{ overall_score?: number }>(qr.text, {})
          if (qd.overall_score && qd.overall_score >= 1 && qd.overall_score <= 10) qualityScore = qd.overall_score
        }
      } catch { /* non-fatal */ }
    }

    // ── Phase 6: Save ──────────────────────────────────────────
    const totalTimeMs = Date.now() - startTime
    const executiveSummary = extractExecutiveSummary(finalReport)

    const { error: updateError } = await supabase
      .from('research_project_companies')
      .update({
        status: 'completed',
        research_content: finalReport,
        research_summary: executiveSummary,
        research_sources: allSources,
        research_metadata: {
          llm_provider: llm.provider,
          llm_model: llm.model,
          total_time_ms: totalTimeMs,
          total_sources: allSources.length,
          quality_score: qualityScore,
        },
        quality_score: qualityScore,
        completed_at: new Date().toISOString(),
      })
      .eq('id', researchProjectCompanyId)
      .eq('org_id', orgId)

    if (updateError) {
      console.error('[Worker] Save failed:', updateError)
      throw new Error(`Save failed: ${updateError.message}`)
    }

    console.log(`[Worker] DONE: "${companyName}" in ${totalTimeMs}ms, quality=${qualityScore}`)
    return jsonResponse({ success: true, totalTimeMs, qualityScore, reportLength: finalReport.length })

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Worker] FAILED: "${companyName}":`, msg)

    await supabase.from('research_project_companies').update({
      status: 'failed',
      error_message: msg,
      retry_count: (rpc.retry_count || 0) + 1,
    }).eq('id', researchProjectCompanyId).eq('org_id', orgId)

    return errorResponse(msg, 500)
  }
})
