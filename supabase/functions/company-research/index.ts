import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
import { createFirecrawlClient } from '../_shared/firecrawl.ts'
import { createLLMClientForUser, createLLMClient } from '../_shared/llm.ts'
import type { LLMClient } from '../_shared/llm.ts'
import type { FirecrawlClient } from '../_shared/firecrawl.ts'

/**
 * Company Research — Single Function with Auto-Continuation
 *
 * Phase 1 (Gather): Parallel Firecrawl searches + scrapes + LLM query gen (~20-35s)
 * Phase 2 (Synthesize): LLM report generation (~30-50s)
 *
 * Always saves gathered data after gather phase and returns
 * { needsContinuation: true }. The frontend auto-retries, and the next
 * invocation detects the saved dossier and skips straight to synthesis.
 *
 * Supabase wall time: 150s. Internal budget: 145s.
 */

// ─── Types ────────────────────────────────────────────────────────

interface CompanyResearchRequest {
  researchProjectCompanyId: string
  llm_model?: string  // Optional: override Claude model for synthesis
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

const FC_TIMEOUT = 10_000        // Per-Firecrawl-call timeout
const GATHER_BUDGET_MS = 0       // Always save dossier and synthesize in a fresh invocation (fresh 150s budget)
const OVERALL_TIMEOUT_MS = 145_000
const SYNTHESIS_TIMEOUT_MS = 143_000  // Synthesis always runs in continuation (fresh 150s budget — ~143s available)

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

async function markFailed(
  supabase: ReturnType<typeof createSupabaseClient>,
  id: string,
  orgId: string,
  errorMessage: string,
  retryCount: number,
) {
  await supabase.from('research_project_companies').update({
    status: 'failed',
    error_message: errorMessage,
    retry_count: (retryCount || 0) + 1,
  }).eq('id', id).eq('org_id', orgId)
}

// ─── Gather Helpers ───────────────────────────────────────────────

function collectTopUrls(
  searchResults: Record<string, GatherResult>,
  maxUrls: number,
): string[] {
  const seen = new Set<string>()
  const urls: string[] = []
  const skip = ['linkedin.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'youtube.com']
  const priority = ['newsRecent', 'newsPR', 'funding', 'custom_0', 'custom_1', 'leadership', 'competitors', 'industrySearch']

  for (const key of priority) {
    if (urls.length >= maxUrls) break
    const result = searchResults[key]
    if (result?.status !== 'fulfilled') continue
    const val = result.value as { success?: boolean; data?: Array<{ url: string }> }
    if (!val?.success || !val.data) continue
    for (const item of val.data) {
      if (urls.length >= maxUrls) break
      if (!item.url || seen.has(item.url)) continue
      if (skip.some(d => item.url.includes(d))) continue
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
  const maxPer = 5000
  let total = 0
  const maxTotal = 35000 // More context for complete reports

  function add(title: string, content: string) {
    if (total >= maxTotal) return
    const t = truncate(content, Math.min(maxPer, maxTotal - total))
    if (t.trim()) {
      sections.push(`### ${title}\n${t}`)
      total += t.length + title.length + 10
    }
  }

  function addSearch(key: string, title: string, type: string) {
    const result = searchResults[key]
    if (result?.status !== 'fulfilled') return
    const val = result.value as { success?: boolean; data?: Array<{ url: string; title: string; description: string }> }
    if (!val?.success || !val.data || val.data.length === 0) return
    const lines: string[] = []
    for (const item of val.data) {
      lines.push(`- **${item.title || 'Untitled'}** (${item.url})\n  ${truncate(item.description || '', 400)}`)
      sources.push({ url: item.url, title: item.title || 'Untitled', type, snippet: truncate(item.description || '', 200) })
    }
    add(title, lines.join('\n'))
  }

  // Website content
  for (const [key, label] of [['websiteMain', 'Homepage'], ['websiteAbout', 'About Page']] as const) {
    const result = websiteResults[key]
    if (result?.status !== 'fulfilled') continue
    const val = result.value as { success?: boolean; data?: { markdown?: string; metadata?: Record<string, unknown> } }
    if (!val?.success || !val.data?.markdown) continue
    add(`Website - ${label}`, val.data.markdown)
    const md = val.data.metadata || {}
    sources.push({
      url: (md.sourceURL as string) || (md.url as string) || '',
      title: (md.title as string) || `${companyName} ${label}`,
      type: 'website',
      snippet: truncate(val.data.markdown, 200),
    })
  }

  addSearch('newsRecent', 'Recent News', 'news')
  addSearch('newsPR', 'Press Releases & Announcements', 'press_release')
  addSearch('funding', 'Funding & Financial Information', 'financial')
  addSearch('competitors', 'Competitive Landscape', 'competitor')
  addSearch('leadership', 'Leadership & Key People', 'leadership')
  addSearch('industrySearch', 'Industry & Market Trends', 'industry')

  for (let i = 0; i < 10; i++) {
    const key = `custom_${i}`
    if (!searchResults[key]) break
    addSearch(key, `Custom Research ${i + 1}`, 'custom')
  }

  if (secondaryScrapes.length > 0) {
    const lines = secondaryScrapes.map(s => `#### Source: ${s.url}\n${truncate(s.markdown, maxPer)}`)
    add('Full Article Content', lines.join('\n\n'))
  }

  return { dossier: sections.join('\n\n'), sources }
}

function extractSummary(report: string): string {
  const m = report.match(/##\s*(?:1\.\s*)?Executive\s+Summary\s*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/)
  if (m?.[1]) return m[1].trim()
  return report.split('\n\n').filter(p => p.trim() && !p.startsWith('#')).slice(0, 3).join('\n\n').trim()
}

// ─── Phase: Gather (FULLY PARALLEL — query gen + scrapes + searches at once) ──

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
  // Start ALL initial calls immediately — searches, scrapes, AND query gen in parallel
  const gatherPromises: Record<string, Promise<unknown>> = {}

  // Website scrapes (2 pages — main + about)
  if (website) {
    const w = website.replace(/\/$/, '')
    gatherPromises.websiteMain = withTimeout(
      firecrawl.scrape(w, { formats: ['markdown'], maxCharacters: 8000 }),
      FC_TIMEOUT, 'scrape main'
    )
    gatherPromises.websiteAbout = withTimeout(
      firecrawl.scrape(w + '/about', { formats: ['markdown'], maxCharacters: 5000 }),
      FC_TIMEOUT, 'scrape about'
    )
  }

  // Standard searches — all fire immediately
  gatherPromises.newsRecent = withTimeout(firecrawl.search(`"${companyName}" news 2026`, { limit: 8, maxRetries: 1 }), FC_TIMEOUT, 'news')
  gatherPromises.newsPR = withTimeout(firecrawl.search(`"${companyName}" press release announcement`, { limit: 5, tbs: 'qdr:y', maxRetries: 1 }), FC_TIMEOUT, 'PR')
  gatherPromises.funding = withTimeout(firecrawl.search(`"${companyName}" funding round valuation revenue`, { limit: 5, tbs: 'qdr:y', maxRetries: 1 }), FC_TIMEOUT, 'funding')
  gatherPromises.competitors = withTimeout(firecrawl.search(`"${companyName}" competitors alternatives vs ${industry || ''}`, { limit: 5, maxRetries: 1 }), FC_TIMEOUT, 'competitors')
  gatherPromises.industrySearch = withTimeout(firecrawl.search(`${industry || companyName} market trends 2026`, { limit: 5, maxRetries: 1 }), FC_TIMEOUT, 'industry')
  gatherPromises.leadership = withTimeout(firecrawl.search(`"${companyName}" CEO founder leadership executive team`, { limit: 5, maxRetries: 1 }), FC_TIMEOUT, 'leadership')

  // LLM query gen runs IN PARALLEL with everything above (not sequentially!)
  // Custom queries start as soon as query gen resolves
  const customQueryKeys: string[] = []
  const customQueryPromises: Promise<unknown>[] = []

  if (researchPrompt.trim()) {
    const queryGenDone = withTimeout(
      llm.createMessage({
        system: 'Generate exactly 2 web search queries to research a company based on the user\'s research focus. Return ONLY a JSON array of 2 strings. No explanation.',
        messages: [{
          role: 'user',
          content: `Company: ${companyName}\nWebsite: ${website}\nIndustry: ${industry}\n\nResearch focus:\n${researchPrompt.substring(0, 2000)}`,
        }],
        maxTokens: 200,
        temperature: 0.3,
      }),
      12000,
      'query gen'
    ).then(result => {
      if (result.success) {
        let queries = safeJsonParse<string[]>(result.text, [])
        if (!Array.isArray(queries)) queries = []
        queries = queries.filter(q => typeof q === 'string' && q.trim()).slice(0, 2)
        console.log(`[Research] Custom queries: ${queries.length}`, queries)
        for (let i = 0; i < queries.length; i++) {
          const key = `custom_${i}`
          customQueryKeys.push(key)
          customQueryPromises.push(
            withTimeout(firecrawl.search(queries[i], { limit: 5, maxRetries: 1 }), FC_TIMEOUT, `custom_${i}`)
          )
        }
      }
    }).catch(err => {
      console.warn('[Research] Query gen failed (non-fatal):', err)
    })

    // Wait for query gen so custom search promises are registered
    await queryGenDone
  }

  // Wait for ALL initial gathers (they've been running in parallel this whole time)
  const initialKeys = Object.keys(gatherPromises)
  const initialResults = await Promise.allSettled(Object.values(gatherPromises))

  // Wait for custom queries (they started during/after query gen)
  const customResults = customQueryPromises.length > 0
    ? await Promise.allSettled(customQueryPromises)
    : []

  // Combine all results
  const settled: Record<string, GatherResult> = {}
  initialKeys.forEach((key, i) => {
    settled[key] = {
      status: initialResults[i].status,
      value: initialResults[i].status === 'fulfilled' ? (initialResults[i] as PromiseFulfilledResult<unknown>).value : undefined,
      reason: initialResults[i].status === 'rejected' ? (initialResults[i] as PromiseRejectedResult).reason : undefined,
    }
  })
  customQueryKeys.forEach((key, i) => {
    settled[key] = {
      status: customResults[i].status,
      value: customResults[i].status === 'fulfilled' ? (customResults[i] as PromiseFulfilledResult<unknown>).value : undefined,
      reason: customResults[i].status === 'rejected' ? (customResults[i] as PromiseRejectedResult).reason : undefined,
    }
  })

  const allKeys = Object.keys(settled)
  const ok = allKeys.filter(k => settled[k].status === 'fulfilled').length
  const fail = allKeys.filter(k => settled[k].status === 'rejected').length
  console.log(`[Research] Gather: ${ok} ok, ${fail} failed / ${allKeys.length}`)

  const websiteResults: Record<string, GatherResult> = {}
  const searchResults: Record<string, GatherResult> = {}
  for (const key of allKeys) {
    if (key.startsWith('website')) websiteResults[key] = settled[key]
    else searchResults[key] = settled[key]
  }

  // Secondary scrapes — 2 top article URLs
  const urlsToScrape = collectTopUrls(searchResults, 1)
  const secondaryScrapes: Array<{ url: string; markdown: string }> = []

  if (urlsToScrape.length > 0) {
    console.log(`[Research] Secondary scrapes: ${urlsToScrape.length}`)
    const secResults = await Promise.allSettled(
      urlsToScrape.map(url =>
        withTimeout(firecrawl.scrape(url, { formats: ['markdown'], maxCharacters: 5000 }), FC_TIMEOUT, `scrape ${url}`)
      )
    )
    for (let i = 0; i < secResults.length; i++) {
      if (secResults[i].status === 'fulfilled') {
        const val = (secResults[i] as PromiseFulfilledResult<unknown>).value as { success?: boolean; data?: { markdown?: string } }
        if (val?.success && val.data?.markdown) {
          secondaryScrapes.push({ url: urlsToScrape[i], markdown: val.data.markdown })
        }
      }
    }
  }

  return { websiteResults, searchResults, secondaryScrapes }
}

// ─── Phase: Synthesize ────────────────────────────────────────────

async function phaseSynthesize(
  llm: LLMClient,
  companyName: string,
  website: string,
  industry: string,
  researchPrompt: string,
  dossier: string,
  timeoutMs: number,
): Promise<string> {
  const systemPrompt = `You are an expert business research analyst producing focused company research reports.

RULES:
- Use ONLY information from the provided sources. Do NOT invent facts.
- Cite sources by including [Source: URL] inline when making specific claims.
- Structure the report into clear sections with markdown headers (## level).
- Write a thorough, complete report — do not truncate any section.
- Write in a professional, analytical tone.
- If information for a section is not available, state that briefly.
- Start with a concise Executive Summary (3-5 sentences).
- Cover all required sections completely, even if sources are limited.`

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

  // Synthesis always runs in continuation (fresh 150s budget).
  // Opus 4.6 ~85 tok/s: 10000 tok ≈ 118s  |  Sonnet ~110 tok/s: 14000 tok ≈ 127s  |  Haiku ~200 tok/s: 20000 tok ≈ 100s
  const maxTokens = llm.model.includes('opus') ? 10000 : llm.model.includes('haiku') ? 20000 : 14000
  const result = await withTimeout(
    llm.createMessage({
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      maxTokens,
      temperature: 0.3,
    }),
    timeoutMs,
    'LLM synthesis'
  )

  if (!result.success) {
    throw new Error(`LLM synthesis failed: ${result.error}`)
  }

  return result.text
}

// ─── Main Handler ─────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return errorResponse('Missing authorization header', 401)

  let authCtx: { userId: string; orgId: string } | null
  try {
    authCtx = await getAuthContext(authHeader)
  } catch {
    return errorResponse('Authentication failed', 401)
  }
  if (!authCtx) return errorResponse('Unauthorized', 401)

  let body: CompanyResearchRequest
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { researchProjectCompanyId, llm_model: requestedModel } = body
  if (!researchProjectCompanyId) {
    return errorResponse('researchProjectCompanyId is required', 400)
  }

  const supabase = createSupabaseClient()
  const startTime = Date.now()

  // ── Load data ─────────────────────────────────────────────────
  const { data: rpc, error: rpcErr } = await supabase
    .from('research_project_companies')
    .select('*')
    .eq('id', researchProjectCompanyId)
    .eq('org_id', authCtx.orgId)
    .single()

  if (rpcErr || !rpc) return errorResponse('Research project company not found', 404)

  const { data: project, error: projErr } = await supabase
    .from('research_projects')
    .select('*')
    .eq('id', rpc.research_project_id)
    .eq('org_id', authCtx.orgId)
    .single()

  if (projErr || !project) return errorResponse('Research project not found', 404)

  // ── Check if this is a CONTINUATION (gathered data already saved) ──
  const savedDossier = (rpc.research_metadata as Record<string, unknown>)?._dossier as string | undefined
  const savedSources = (rpc.research_metadata as Record<string, unknown>)?._sources as ResearchSource[] | undefined
  const isContinuation = !!savedDossier

  if (!isContinuation) {
    // Fresh start — mark as researching
    await supabase.from('research_project_companies').update({
      status: 'researching',
      started_at: new Date().toISOString(),
      error_message: null,
    }).eq('id', researchProjectCompanyId).eq('org_id', authCtx.orgId)
  }

  const companyName = rpc.company_name || ''
  const website = rpc.company_website || ''
  const industry = rpc.company_industry || ''
  const researchPrompt = project.research_prompt || ''

  // ── Init clients ──────────────────────────────────────────────
  let firecrawl: FirecrawlClient
  let llm: LLMClient

  try {
    firecrawl = createFirecrawlClient()
  } catch (err) {
    console.error('[Research] Firecrawl init failed:', err)
    await markFailed(supabase, researchProjectCompanyId, authCtx.orgId, 'Firecrawl API not configured', rpc.retry_count)
    return errorResponse('Firecrawl not configured', 500)
  }

  try {
    llm = await createLLMClientForUser(authCtx.userId)
  } catch (err) {
    console.error('[Research] LLM init failed:', err)
    await markFailed(supabase, researchProjectCompanyId, authCtx.orgId, 'LLM API not configured', rpc.retry_count)
    return errorResponse('LLM not configured', 500)
  }

  console.log(`[Research] ${isContinuation ? 'CONTINUATION' : 'START'} for "${companyName}"`)

  // ── Execute ───────────────────────────────────────────────────
  try {
    // Always use Anthropic/Claude for synthesis
    // Priority: requestedModel from UI > user's saved model (if Anthropic) > haiku fallback
    const userSynthModel = llm.provider === 'anthropic' ? llm.model : 'claude-haiku-4-5-20251001'
    const synthModel = requestedModel || userSynthModel
    const synthLLM = createLLMClient('anthropic', synthModel)
    console.log(`[Research] synth=anthropic/${synthModel}${requestedModel ? ' (user-selected)' : ''}`)
    let dossier: string
    let sources: ResearchSource[]

    if (isContinuation) {
      // Skip gather — use saved data
      console.log('[Research] Using saved dossier from previous gather phase')
      dossier = savedDossier!
      sources = savedSources || []
    } else {
      // Phase 1: Gather
      console.log('[Research] Phase: Gather')
      const { websiteResults, searchResults, secondaryScrapes } = await phaseGather(
        firecrawl, llm, companyName, website, industry, researchPrompt
      )

      console.log('[Research] Phase: Assemble')
      const assembled = buildDossier(websiteResults, searchResults, secondaryScrapes, companyName)
      dossier = assembled.dossier
      sources = assembled.sources
      console.log(`[Research] Dossier: ${dossier.length} chars, ${sources.length} sources`)

      // Check time budget — if gather took too long, save for continuation
      const elapsed = Date.now() - startTime
      if (elapsed > GATHER_BUDGET_MS) {
        console.log(`[Research] Gather took ${elapsed}ms — saving for continuation`)
        await supabase.from('research_project_companies').update({
          research_metadata: {
            _dossier: dossier,
            _sources: sources,
            phase: 'gathered',
            gather_time_ms: elapsed,
          },
        }).eq('id', researchProjectCompanyId).eq('org_id', authCtx.orgId)

        return jsonResponse({ success: true, needsContinuation: true, phase: 'gathered' })
      }
    }

    // Phase 2: Synthesize — always in continuation; fresh 150s budget allows 10k-20k tokens
    const synthesisTimeout = SYNTHESIS_TIMEOUT_MS
    console.log(`[Research] Phase: Synthesize (budget: ${Math.round(synthesisTimeout / 1000)}s)`)

    const finalReport = await phaseSynthesize(
      synthLLM, companyName, website, industry, researchPrompt, dossier, synthesisTimeout
    )
    console.log(`[Research] Report: ${finalReport.length} chars`)

    // Save
    const totalTimeMs = Date.now() - startTime
    const summary = extractSummary(finalReport)

    const { error: saveErr } = await supabase
      .from('research_project_companies')
      .update({
        status: 'completed',
        research_content: finalReport,
        research_summary: summary,
        research_sources: sources,
        research_metadata: {
          llm_provider: synthLLM.provider,
          llm_model: synthLLM.model,
          total_time_ms: totalTimeMs,
          total_sources: sources.length,
          was_continuation: isContinuation,
        },
        quality_score: 7,
        completed_at: new Date().toISOString(),
      })
      .eq('id', researchProjectCompanyId)
      .eq('org_id', authCtx.orgId)

    if (saveErr) throw new Error(`Save failed: ${saveErr.message}`)

    console.log(`[Research] DONE: "${companyName}" in ${totalTimeMs}ms`)
    return jsonResponse({ success: true, totalTimeMs, reportLength: finalReport.length })

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Research] FAILED: "${companyName}":`, msg)
    await markFailed(supabase, researchProjectCompanyId, authCtx.orgId, msg, rpc.retry_count)
    return errorResponse(msg, 500)
  }
})
