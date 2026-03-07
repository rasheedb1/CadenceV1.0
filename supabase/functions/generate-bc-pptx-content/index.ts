import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient, getAuthContext } from '../_shared/supabase.ts'
import { createFirecrawlClient } from '../_shared/firecrawl.ts'
import { createLLMClient } from '../_shared/llm.ts'
import type { FirecrawlClient } from '../_shared/firecrawl.ts'

/**
 * Generate Business Case content for uploaded PPTX templates.
 *
 * Differences from generate-business-case:
 * - Works with `detected_variables` (DetectedVariable[]) instead of slide_structure
 * - Auto variables filled from lead data
 * - AI variables generated via Claude with their instruction
 * - Returns { content: Record<string,string>, signals: [...], businessCaseId: string }
 * - PPTX substitution happens in the browser (not here)
 */

// ─── Types ────────────────────────────────────────────────────────

interface DetectedVariable {
  key: string
  raw: string
  type: 'auto' | 'ai'
  field_key?: string
  instruction?: string
}

interface Lead {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  company: string | null
  title: string | null
  phone: string | null
  linkedin_url: string | null
  website: string | null
  industry: string | null
}

interface ResearchSignal {
  name: string
  summary: string
  sourceUrl?: string
}

// ─── Constants ────────────────────────────────────────────────────

const FC_TIMEOUT_MS = 10_000
const MAX_RESEARCH_CHARS = 8000

// ─── Helpers ──────────────────────────────────────────────────────

function truncate(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text || ''
  return text.substring(0, maxLen) + '...'
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms),
    ),
  ])
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// ─── Auto-fill from lead data ─────────────────────────────────────

function autoFillVariable(variable: DetectedVariable, lead: Lead): string | null {
  const fieldKey = variable.field_key || variable.key.toLowerCase()
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  switch (fieldKey) {
    case 'company': return lead.company || null
    case 'contact_name': return [lead.first_name, lead.last_name].filter(Boolean).join(' ') || null
    case 'first_name': return lead.first_name || null
    case 'last_name': return lead.last_name || null
    case 'title': return lead.title || null
    case 'email': return lead.email || null
    case 'phone': return lead.phone || null
    case 'website': return lead.website || null
    case 'industry': return lead.industry || null
    case 'date': return today
    default:
      // Try direct lead field match
      const val = (lead as Record<string, unknown>)[fieldKey]
      if (typeof val === 'string') return val
      return null
  }
}

// ─── Research Phase ───────────────────────────────────────────────

async function researchCompany(
  firecrawl: FirecrawlClient,
  lead: Lead,
): Promise<{ researchSummary: string; signals: ResearchSignal[] }> {
  const company = lead.company || ''
  const sections: string[] = []
  const signals: ResearchSignal[] = []
  let totalChars = 0

  function addSection(label: string, content: string, sourceUrl?: string) {
    if (!content.trim() || totalChars >= MAX_RESEARCH_CHARS) return
    const remaining = MAX_RESEARCH_CHARS - totalChars
    const trimmed = truncate(content.trim(), Math.min(2500, remaining))
    if (trimmed) {
      sections.push(`### ${label}\n${trimmed}`)
      totalChars += trimmed.length
      signals.push({ name: label, summary: trimmed.substring(0, 200), sourceUrl })
    }
  }

  // 1. Scrape company website
  const websiteUrl = lead.website ||
    (lead.linkedin_url && !lead.linkedin_url.includes('linkedin.com') ? lead.linkedin_url : null)

  if (websiteUrl) {
    try {
      const result = await withTimeout(
        firecrawl.scrape(websiteUrl, { formats: ['markdown'], maxCharacters: 5000 }),
        FC_TIMEOUT_MS, 'scrape website',
      )
      if (result.success && result.data?.markdown) {
        addSection('Company Website', result.data.markdown, websiteUrl)
      }
    } catch (err) {
      console.warn('[bc-pptx-content] Website scrape failed:', err)
    }
  } else if (company) {
    try {
      const search = await withTimeout(
        firecrawl.search(`${company} official website`, { limit: 2, maxRetries: 1 }),
        FC_TIMEOUT_MS, 'search website',
      )
      if (search.success && search.data?.length > 0) {
        const top = search.data[0]
        const domain = extractDomain(top.url)
        if (!domain.includes('linkedin') && !domain.includes('facebook')) {
          try {
            const scrape = await withTimeout(
              firecrawl.scrape(top.url, { formats: ['markdown'], maxCharacters: 4000 }),
              FC_TIMEOUT_MS, 'scrape discovered site',
            )
            if (scrape.success && scrape.data?.markdown) {
              addSection('Company Website', scrape.data.markdown, top.url)
            }
          } catch { /* non-fatal */ }
        }
      }
    } catch (err) {
      console.warn('[bc-pptx-content] Site discovery failed:', err)
    }
  }

  if (!company) return { researchSummary: sections.join('\n\n'), signals }

  // 2. News search
  try {
    const newsSearch = await withTimeout(
      firecrawl.search(`${company} latest news 2024 2025`, { limit: 3, maxRetries: 1 }),
      FC_TIMEOUT_MS, 'news search',
    )
    if (newsSearch.success && newsSearch.data?.length > 0) {
      const newsContent = newsSearch.data
        .map((r: { title?: string; description?: string; url: string }) =>
          `• ${r.title || ''}: ${r.description || ''}`.trim()
        )
        .join('\n')
      addSection('Recent News', newsContent)
    }
  } catch { /* non-fatal */ }

  return { researchSummary: sections.join('\n\n'), signals }
}

// ─── AI Variable Generation ───────────────────────────────────────

async function generateAiVariable(
  llm: ReturnType<typeof createLLMClient>,
  instruction: string,
  lead: Lead,
  researchSummary: string,
): Promise<string> {
  const contactName = [lead.first_name, lead.last_name].filter(Boolean).join(' ')
  const contextBlock = researchSummary
    ? `\n\nCOMPANY RESEARCH:\n${truncate(researchSummary, 4000)}`
    : ''

  const prompt = `You are a B2B sales expert generating content for a business case presentation.

COMPANY: ${lead.company || 'Unknown'}
CONTACT: ${contactName || 'Unknown'}
TITLE: ${lead.title || 'Unknown'}
INDUSTRY: ${lead.industry || 'Unknown'}${contextBlock}

TASK: ${instruction}

Respond ONLY with the requested content. Be specific, concise, and tailored to this company.
Do not add explanations, headers, or meta-commentary. Maximum 300 words.`

  const response = await llm.complete({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 400,
    temperature: 0.4,
  })

  return response.trim()
}

// ─── Main Handler ─────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)

    const ctx = await getAuthContext(authHeader)
    if (!ctx) return errorResponse('Unauthorized', 401)

    const body = await req.json() as { templateId: string; leadId: string }
    const { templateId, leadId } = body

    if (!templateId || !leadId) {
      return errorResponse('templateId and leadId are required', 400)
    }

    const supabase = createSupabaseClient(authHeader)

    // Load template
    const { data: template, error: tErr } = await supabase
      .from('business_case_templates')
      .select('id, org_id, name, generation_prompt, detected_variables, template_type')
      .eq('id', templateId)
      .eq('org_id', ctx.orgId)
      .single()

    if (tErr || !template) return errorResponse('Template not found', 404)

    if (template.template_type !== 'uploaded_pptx') {
      return errorResponse('This endpoint is for uploaded_pptx templates only', 400)
    }

    // Load lead
    const { data: lead, error: lErr } = await supabase
      .from('leads')
      .select('id, first_name, last_name, email, company, title, phone, linkedin_url, website, industry')
      .eq('id', leadId)
      .eq('org_id', ctx.orgId)
      .single()

    if (lErr || !lead) return errorResponse('Lead not found', 404)

    const detectedVariables: DetectedVariable[] = template.detected_variables || []

    // Phase 1: Research
    const firecrawl = createFirecrawlClient()
    const llm = createLLMClient()

    const { researchSummary, signals } = await researchCompany(firecrawl, lead as Lead)

    // Phase 2: Build content map
    const content: Record<string, string> = {}

    // Auto variables
    for (const variable of detectedVariables) {
      if (variable.type !== 'auto') continue
      const val = autoFillVariable(variable, lead as Lead)
      if (val) content[variable.key] = val
    }

    // AI variables (in parallel, up to 5 at a time)
    const aiVariables = detectedVariables.filter((v) => v.type === 'ai' && v.instruction)
    const BATCH_SIZE = 5

    for (let i = 0; i < aiVariables.length; i += BATCH_SIZE) {
      const batch = aiVariables.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async (variable) => {
          const value = await generateAiVariable(llm, variable.instruction!, lead as Lead, researchSummary)
          return { key: variable.key, value }
        }),
      )
      for (const result of results) {
        if (result.status === 'fulfilled') {
          content[result.value.key] = result.value.value
        }
      }
    }

    // Save business case record
    const contactName = [lead.first_name, lead.last_name].filter(Boolean).join(' ')
    const now = new Date().toISOString()
    const { data: savedCase, error: saveErr } = await supabase
      .from('business_cases')
      .insert({
        org_id: ctx.orgId,
        template_id: templateId,
        lead_id: leadId,
        company_name: lead.company || contactName || 'Unknown',
        contact_name: contactName || null,
        generated_content: content,
        signals_used: signals,
        research_data: { researchSummary: truncate(researchSummary, 2000) },
        status: 'generated',
        created_by: ctx.userId,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single()

    if (saveErr || !savedCase) {
      console.error('[bc-pptx-content] Failed to save business case:', saveErr)
      return errorResponse('Failed to save business case', 500)
    }

    console.log(`[bc-pptx-content] Generated ${Object.keys(content).length} variables for ${lead.company}`)

    return jsonResponse({
      success: true,
      businessCaseId: savedCase.id,
      content,
      signals,
    })
  } catch (error) {
    console.error('[bc-pptx-content] error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500,
    )
  }
})
