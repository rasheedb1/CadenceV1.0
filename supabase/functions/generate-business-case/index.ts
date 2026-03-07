import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
import { createFirecrawlClient } from '../_shared/firecrawl.ts'
import { createLLMClient } from '../_shared/llm.ts'
import type { FirecrawlClient } from '../_shared/firecrawl.ts'

/**
 * Generate Business Case
 *
 * Loads a template + lead, researches the company via Firecrawl,
 * then generates filled content for each dynamic field using Claude.
 *
 * Supabase wall time: 150s. Internal budget: 145s.
 */

// ─── Types ────────────────────────────────────────────────────────

interface GenerateBusinessCaseRequest {
  templateId: string
  leadId: string
}

interface BcSlideField {
  key: string
  name: string
  field_type: 'auto' | 'dynamic' | 'fixed'
  output_type: 'text' | 'list' | 'number'
  ai_instruction: string | null
  fallback_behavior: 'use_benchmarks' | 'leave_blank' | 'use_default'
  fallback_default: string | null
  example_output: string | null
  max_length: number
  data_sources: string[]
  sort_order: number
}

interface BcSlide {
  slide_number: number
  title: string
  type: 'fixed' | 'dynamic' | 'mixed'
  layout: string
  fixed_content: string | null
  fields: BcSlideField[]
}

interface Lead {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  company: string | null
  title: string | null
  linkedin_url: string | null
  website: string | null
}

interface BusinessCaseTemplate {
  id: string
  org_id: string
  name: string
  generation_prompt: string | null
  slide_structure: BcSlide[]
}

interface ResearchSignal {
  name: string
  summary: string
  sourceUrl?: string
}

// ─── Constants ────────────────────────────────────────────────────

const FC_TIMEOUT_MS = 10_000
const MAX_RESEARCH_CHARS = 8000
const MAX_FIELD_PARALLEL = 5  // max concurrent LLM field calls per slide

// ─── Helpers ──────────────────────────────────────────────────────

function truncate(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text || ''
  return text.substring(0, maxLen) + '...'
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms)
    ),
  ])
}

function extractDomainFromUrl(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// ─── Research Phase ───────────────────────────────────────────────

async function researchCompany(
  firecrawl: FirecrawlClient,
  lead: Lead,
  generationPrompt: string | null,
): Promise<{ researchSummary: string; sources: Array<{ url: string; title: string }> }> {
  const company = lead.company || ''
  const sections: string[] = []
  const sources: Array<{ url: string; title: string }> = []
  let totalChars = 0

  function addSection(label: string, content: string) {
    if (!content.trim() || totalChars >= MAX_RESEARCH_CHARS) return
    const remaining = MAX_RESEARCH_CHARS - totalChars
    const trimmed = truncate(content.trim(), Math.min(2500, remaining))
    if (trimmed) {
      sections.push(`### ${label}\n${trimmed}`)
      totalChars += trimmed.length
    }
  }

  // 1. Scrape company website
  const websiteUrl = lead.website
    || (lead.linkedin_url && !lead.linkedin_url.includes('linkedin.com') ? lead.linkedin_url : null)

  if (websiteUrl) {
    try {
      const scrapeResult = await withTimeout(
        firecrawl.scrape(websiteUrl, { formats: ['markdown'], maxCharacters: 5000 }),
        FC_TIMEOUT_MS, 'scrape website'
      )
      if (scrapeResult.success && scrapeResult.data?.markdown) {
        addSection('Company Website', scrapeResult.data.markdown)
        sources.push({ url: websiteUrl, title: `${company} website` })
      }
    } catch (err) {
      console.warn('[generate-bc] Website scrape failed (non-fatal):', err)
    }
  } else if (company) {
    // Try to find/scrape website via search
    try {
      const siteSearch = await withTimeout(
        firecrawl.search(`${company} official website`, { limit: 3, maxRetries: 1 }),
        FC_TIMEOUT_MS, 'search website'
      )
      if (siteSearch.success && siteSearch.data && siteSearch.data.length > 0) {
        const topResult = siteSearch.data[0]
        const domain = extractDomainFromUrl(topResult.url)
        if (!domain.includes('linkedin') && !domain.includes('facebook')) {
          try {
            const scrapeResult = await withTimeout(
              firecrawl.scrape(topResult.url, { formats: ['markdown'], maxCharacters: 4000 }),
              FC_TIMEOUT_MS, 'scrape discovered site'
            )
            if (scrapeResult.success && scrapeResult.data?.markdown) {
              addSection('Company Website', scrapeResult.data.markdown)
              sources.push({ url: topResult.url, title: topResult.title || `${company} website` })
            }
          } catch {
            // non-fatal
          }
        }
      }
    } catch (err) {
      console.warn('[generate-bc] Site discovery search failed (non-fatal):', err)
    }
  }

  if (!company) {
    return { researchSummary: sections.join('\n\n'), sources }
  }

  // 2. General company overview search (adapt query to generation context if provided)
  const overviewQuery = generationPrompt && generationPrompt.length > 50
    ? `${company} ${generationPrompt.substring(0, 80)}`
    : `${company} company overview business`

  // 3. Recent news search
  // Fire both searches in parallel
  const [overviewResult, newsResult] = await Promise.allSettled([
    withTimeout(
      firecrawl.search(overviewQuery, { limit: 4, maxRetries: 1 }),
      FC_TIMEOUT_MS, 'overview search'
    ),
    withTimeout(
      firecrawl.search(`"${company}" news 2024 2025`, { limit: 4, maxRetries: 1 }),
      FC_TIMEOUT_MS, 'news search'
    ),
  ])

  if (overviewResult.status === 'fulfilled' && overviewResult.value.success && overviewResult.value.data) {
    const lines: string[] = []
    for (const item of overviewResult.value.data) {
      lines.push(`- **${item.title}** (${item.url})\n  ${truncate(item.description || '', 300)}`)
      if (item.url && item.title) sources.push({ url: item.url, title: item.title })
    }
    addSection('Company Overview (Search Results)', lines.join('\n'))
  } else {
    console.warn('[generate-bc] Overview search failed (non-fatal)')
  }

  if (newsResult.status === 'fulfilled' && newsResult.value.success && newsResult.value.data) {
    const lines: string[] = []
    for (const item of newsResult.value.data) {
      lines.push(`- **${item.title}** (${item.url})\n  ${truncate(item.description || '', 300)}`)
      if (item.url && item.title) sources.push({ url: item.url, title: item.title })
    }
    addSection('Recent News', lines.join('\n'))
  } else {
    console.warn('[generate-bc] News search failed (non-fatal)')
  }

  const researchSummary = sections.join('\n\n')
  console.log(`[generate-bc] Research complete: ${researchSummary.length} chars, ${sources.length} sources`)

  return { researchSummary, sources }
}

// ─── Field Generation ─────────────────────────────────────────────

async function generateField(
  llm: ReturnType<typeof createLLMClient>,
  field: BcSlideField,
  lead: Lead,
  researchSummary: string,
): Promise<string> {
  if (!field.ai_instruction) {
    return field.fallback_default || ''
  }

  const prompt = `You are filling in a business case presentation field.

Field: ${field.name}
Instruction: ${field.ai_instruction}
Max length: ${field.max_length} characters
Output type: ${field.output_type}

Company: ${lead.company || 'Unknown'}
Contact: ${lead.first_name || ''} ${lead.last_name || ''}, ${lead.title || 'Unknown title'}

Research data:
${researchSummary || '(No research data available)'}

Generate ONLY the field content, no explanation, no label. Be specific and use data from the research.
If you don't find specific data, use industry benchmarks and acknowledge uncertainty with "approximately" or "estimated".${field.output_type === 'list' ? '\nReturn as a bullet list with each item on a new line starting with "- ".' : ''}${field.output_type === 'number' ? '\nReturn ONLY the number or number with unit (e.g. "$2.5M" or "45%"), nothing else.' : ''}`

  const result = await llm.createMessage({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: Math.min(512, Math.ceil(field.max_length / 3) + 50),
    temperature: 0.4,
  })

  if (!result.success) {
    console.warn(`[generate-bc] Field "${field.key}" generation failed: ${result.error}`)
    // Apply fallback behavior
    if (field.fallback_behavior === 'use_benchmarks') {
      return field.example_output || field.fallback_default || `(Benchmark data for ${field.name})`
    }
    if (field.fallback_behavior === 'use_default' && field.fallback_default) {
      return field.fallback_default
    }
    return ''
  }

  // Enforce max_length
  return truncate(result.text.trim(), field.max_length)
}

// ─── Auto-fill ────────────────────────────────────────────────────

function autoFillField(field: BcSlideField, lead: Lead): string | null {
  if (field.field_type !== 'auto') return null

  const key = field.key.toLowerCase()

  if (key === 'company_name') return lead.company || ''
  if (key === 'contact_name') return `${lead.first_name || ''} ${lead.last_name || ''}`.trim()
  if (key === 'contact_title' || key === 'title') return lead.title || ''
  if (key === 'contact_email' || key === 'email') return lead.email || ''
  if (key === 'company_website' || key === 'website') return lead.website || ''
  if (key === 'linkedin_url' || key === 'linkedin') return lead.linkedin_url || ''

  // Generic: try to match lead fields by key name similarity
  if (key.includes('company')) return lead.company || ''
  if (key.includes('first_name') || key === 'first') return lead.first_name || ''
  if (key.includes('last_name') || key === 'last') return lead.last_name || ''

  return null
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

  let body: GenerateBusinessCaseRequest
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { templateId, leadId } = body

  if (!templateId) return errorResponse('templateId is required', 400)
  if (!leadId) return errorResponse('leadId is required', 400)

  console.log(`[generate-bc] user=${authCtx.userId} org=${authCtx.orgId} templateId=${templateId} leadId=${leadId}`)

  const supabase = createSupabaseClient(authHeader)

  // ── 1. Load template ───────────────────────────────────────────────────────
  const { data: template, error: templateErr } = await supabase
    .from('business_case_templates')
    .select('id, org_id, name, generation_prompt, slide_structure')
    .eq('id', templateId)
    .eq('org_id', authCtx.orgId)
    .single()

  if (templateErr || !template) {
    console.error('[generate-bc] Template not found:', templateErr?.message)
    return errorResponse('Business case template not found', 404)
  }

  const tmpl = template as BusinessCaseTemplate

  // ── 2. Load lead ───────────────────────────────────────────────────────────
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, first_name, last_name, email, company, title, linkedin_url, website')
    .eq('id', leadId)
    .eq('org_id', authCtx.orgId)
    .single()

  if (leadErr || !lead) {
    console.error('[generate-bc] Lead not found:', leadErr?.message)
    return errorResponse('Lead not found', 404)
  }

  const typedLead = lead as Lead

  // ── 3. Init clients ────────────────────────────────────────────────────────
  let firecrawl: FirecrawlClient | null = null
  try {
    firecrawl = createFirecrawlClient()
  } catch (err) {
    console.warn('[generate-bc] Firecrawl not configured, skipping research:', err)
    // Firecrawl is optional — generation can still run without research
  }

  const llm = createLLMClient('anthropic')

  // ── 4. Research company ────────────────────────────────────────────────────
  let researchSummary = ''
  let researchSources: Array<{ url: string; title: string }> = []

  if (firecrawl) {
    try {
      const researchResult = await researchCompany(firecrawl, typedLead, tmpl.generation_prompt || null)
      researchSummary = researchResult.researchSummary
      researchSources = researchResult.sources
    } catch (err) {
      console.warn('[generate-bc] Research phase failed (non-fatal), continuing without research data:', err)
    }
  }

  // ── 5. Generate content for each dynamic field ─────────────────────────────
  const generatedContent: Record<string, string> = {}
  const slides: BcSlide[] = Array.isArray(tmpl.slide_structure) ? tmpl.slide_structure : []

  for (const slide of slides) {
    if (!Array.isArray(slide.fields) || slide.fields.length === 0) continue

    const dynamicFields = slide.fields.filter(f => f.field_type === 'dynamic')
    const autoFields = slide.fields.filter(f => f.field_type === 'auto')

    // Auto-fill synchronously
    for (const field of autoFields) {
      const value = autoFillField(field, typedLead)
      if (value !== null) {
        generatedContent[field.key] = value
      }
    }

    // Generate dynamic fields in batches to avoid overwhelming the LLM
    for (let i = 0; i < dynamicFields.length; i += MAX_FIELD_PARALLEL) {
      const batch = dynamicFields.slice(i, i + MAX_FIELD_PARALLEL)
      const batchResults = await Promise.allSettled(
        batch.map(field => generateField(llm, field, typedLead, researchSummary))
      )

      for (let j = 0; j < batch.length; j++) {
        const field = batch[j]
        const result = batchResults[j]

        if (result.status === 'fulfilled' && result.value) {
          generatedContent[field.key] = result.value
        } else {
          // Apply fallback
          if (result.status === 'rejected') {
            console.warn(`[generate-bc] Field "${field.key}" rejected:`, result.reason)
          }
          if (field.fallback_behavior === 'use_benchmarks') {
            generatedContent[field.key] = field.example_output || field.fallback_default || ''
          } else if (field.fallback_behavior === 'use_default' && field.fallback_default) {
            generatedContent[field.key] = field.fallback_default
          } else {
            generatedContent[field.key] = ''
          }
        }
      }
    }
  }

  console.log(`[generate-bc] Generated ${Object.keys(generatedContent).length} fields`)

  // ── 6. Save to business_cases table ───────────────────────────────────────
  const { data: savedCase, error: saveErr } = await supabase
    .from('business_cases')
    .insert({
      org_id: authCtx.orgId,
      template_id: templateId,
      lead_id: leadId,
      company_name: typedLead.company || 'Unknown',
      contact_name: `${typedLead.first_name || ''} ${typedLead.last_name || ''}`.trim() || 'Unknown',
      generated_content: generatedContent,
      research_data: {
        research_summary: researchSummary,
        sources: researchSources,
      },
      signals_used: [],
      status: 'generated',
      created_by: authCtx.userId,
    })
    .select('id')
    .single()

  if (saveErr || !savedCase) {
    console.error('[generate-bc] Failed to save business case:', saveErr?.message)
    return errorResponse(`Failed to save business case: ${saveErr?.message || 'Unknown error'}`, 500)
  }

  const businessCaseId: string = savedCase.id

  // ── 7. Build signals from research sources ─────────────────────────────────
  const signals: ResearchSignal[] = researchSources.slice(0, 5).map(s => ({
    name: s.title,
    summary: `Source used in business case generation for ${typedLead.company || 'company'}`,
    sourceUrl: s.url,
  }))

  console.log(`[generate-bc] DONE: businessCaseId=${businessCaseId} fields=${Object.keys(generatedContent).length}`)

  return jsonResponse({
    success: true,
    businessCaseId,
    generatedContent,
    signals,
  })
})
