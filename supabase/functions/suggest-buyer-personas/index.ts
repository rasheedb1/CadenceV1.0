import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext, createSupabaseClient } from '../_shared/supabase.ts'
import { createLLMClientForUser } from '../_shared/llm.ts'

interface SuggestedPersona {
  name: string
  title_keywords: string[]
  seniority: string
  department: string
  reasoning: string
  // Adaptive fields (v2)
  description?: string
  role_in_buying_committee?: string
  departments?: string[]
  title_keywords_by_tier?: {
    enterprise: string[]
    mid_market: string[]
    startup_smb: string[]
  }
  seniority_by_tier?: {
    enterprise: string[]
    mid_market: string[]
    startup_smb: string[]
  }
}

/** Strip markdown code fences, thinking blocks, and extract JSON from LLM response */
function extractJSON(raw: string): string {
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim()
  cleaned = cleaned.replace(/```(?:json)?\s*\n?/g, '').replace(/```\s*$/g, '').trim()
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]
  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) return objMatch[0]
  return cleaned
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)

    const ctx = await getAuthContext(authHeader)
    if (!ctx) return errorResponse('Unauthorized', 401)

    const body = await req.json()
    const { accountMapId } = body as { accountMapId: string }

    if (!accountMapId) return errorResponse('accountMapId is required')

    const supabase = createSupabaseClient(authHeader)

    // Fetch account map with builder data
    const { data: accountMap, error: amErr } = await supabase
      .from('account_maps')
      .select('filters_json, icp_description')
      .eq('id', accountMapId)
      .eq('org_id', ctx.orgId)
      .single()

    if (amErr) return errorResponse(`Failed to fetch account map: ${amErr.message}`, 500)

    const builderData = accountMap?.filters_json?.icp_builder_data || null
    const icpDescription = accountMap?.icp_description || ''

    if (!builderData && !icpDescription) {
      return errorResponse('No ICP data available. Fill in the ICP builder or custom prompt first.')
    }

    // Fetch existing personas to avoid duplicates
    const { data: existingPersonas, error: pErr } = await supabase
      .from('buyer_personas')
      .select('name, title_keywords, seniority, department')
      .eq('account_map_id', accountMapId)
      .eq('org_id', ctx.orgId)

    if (pErr) return errorResponse(`Failed to fetch personas: ${pErr.message}`, 500)

    // Initialize LLM
    let llm
    try {
      llm = await createLLMClientForUser(ctx.userId)
    } catch (err) {
      return errorResponse(`LLM not configured: ${err instanceof Error ? err.message : 'Unknown'}`, 500)
    }

    const systemPrompt = `You are a B2B sales expert who finds real decision-makers on LinkedIn Sales Navigator. Given an ICP, suggest buyer personas with PRACTICAL search keywords that actually match real LinkedIn profile titles.

CRITICAL RULES FOR title_keywords:
- Keywords are used in LinkedIn Sales Navigator's "Role" filter combined with a separate seniority filter
- Use SHORT keywords (1-2 words) that appear as substrings in real LinkedIn titles
- DO NOT include seniority in keywords (no "VP of...", "Head of...", "Director of...") — the seniority filter handles this separately
- Focus on FUNCTIONAL AREA terms: "Finance", "Payments", "Treasury", "Engineering", "Product"
- Include COMMON EXACT titles only for C-level: "CFO", "CTO", "CEO", "COO", "CRO"
- Think about what words ACTUALLY appear in LinkedIn titles at the target companies
- Keywords must work across different industries (a logistics company won't have "Payment Infrastructure" roles)

GOOD keywords: ["Finance", "Treasury", "Payments", "Accounting", "CFO"]
GOOD keywords: ["Engineering", "Platform", "Infrastructure", "CTO", "Software"]
BAD keywords: ["VP of Payment Infrastructure", "Head of Financial Operations", "Director of Platform Engineering"]
BAD keywords: ["Payment & Fintech Decision Maker", "Engineering & Infrastructure Lead"]

Persona fields:
- name: short role label (e.g., "Finance Leader", "Technical Buyer")
- description: 1-2 sentences
- role_in_buying_committee: decision_maker | champion | influencer | technical_evaluator | budget_holder | end_user
- department: Engineering | Marketing | Finance | Operations | IT | Sales | Product | HR | Legal | Executive
- departments: array of relevant departments
- title_keywords: 3-5 SHORT mid-market search terms (functional area words, NOT full titles)
- seniority: Entry | Senior | Manager | Director | VP | CXO | Owner | Partner
- title_keywords_by_tier: adaptive keywords by company size:
  - enterprise (1000+): 6-10 keywords — mix of specific function words + common C-level abbreviations
  - mid_market (51-1000): 5-8 keywords — broader function words
  - startup_smb (1-50): 4-6 keywords — C-level titles + broad function words
- seniority_by_tier: 2-4 seniority levels per tier
- reasoning: 1 sentence

Rules:
- Suggest 3-5 personas, ordered by relevance (decision_maker first)
- If existing personas are provided, suggest DIFFERENT complementary ones
- You MUST respond with a JSON object: {"personas": [...]}`

    // Build user prompt from builder data or free-text
    let icpSummary: string
    if (builderData) {
      const parts: string[] = []
      if (builderData.companyDescription) parts.push(`Our company: ${builderData.companyDescription}`)
      if (builderData.productCategory) parts.push(`Product category: ${builderData.productCategory}`)
      if (builderData.businessModels?.length) parts.push(`Business models: ${builderData.businessModels.join(', ')}`)
      if (builderData.industries?.length) parts.push(`Target industries: ${builderData.industries.join(', ')}`)
      if (builderData.companySizes?.length) parts.push(`Company sizes: ${builderData.companySizes.join(', ')}`)
      if (builderData.companyStages?.length) parts.push(`Company stages: ${builderData.companyStages.join(', ')}`)
      if (builderData.existingCustomers?.length) parts.push(`Existing customers: ${builderData.existingCustomers.join(', ')}`)
      icpSummary = parts.join('\n')
    } else {
      icpSummary = `ICP Description: ${icpDescription}`
    }

    const existingPersonaSummary = existingPersonas && existingPersonas.length > 0
      ? existingPersonas.map((p: { name: string; title_keywords: string[]; seniority: string | null; department: string | null }) =>
          `- ${p.name} (${p.title_keywords.join(', ')})`
        ).join('\n')
      : '(none)'

    const userPrompt = `## ICP Summary:
${icpSummary}

## Existing Personas (suggest different ones):
${existingPersonaSummary}

Suggest 3-5 buyer personas for this ICP.`

    const isOpenAI = llm.provider === 'openai'
    const result = await llm.createMessage({
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 4096,
      temperature: 0.5,
      jsonMode: isOpenAI,
    })

    if (!result.success) {
      return errorResponse(`LLM suggestion failed: ${result.error}`, 500)
    }

    // Parse response
    let personas: SuggestedPersona[] = []
    try {
      const jsonStr = extractJSON(result.text)
      const parsed = JSON.parse(jsonStr)
      if (parsed.personas && Array.isArray(parsed.personas)) {
        personas = parsed.personas
      } else if (Array.isArray(parsed)) {
        personas = parsed
      }
    } catch (err) {
      console.error('Failed to parse personas:', err)
      return errorResponse('Failed to parse AI suggestions', 500)
    }

    // Validate and normalize
    const validSeniorities = ['Entry', 'Senior', 'Manager', 'Director', 'VP', 'CXO', 'Owner', 'Partner']
    const validRoles = ['decision_maker', 'champion', 'influencer', 'technical_evaluator', 'budget_holder', 'end_user']

    personas = personas.map(p => {
      // Validate flat fields
      const seniority = validSeniorities.includes(p.seniority) ? p.seniority : 'Manager'
      const title_keywords = Array.isArray(p.title_keywords) ? p.title_keywords : []

      // Validate tier keywords — fall back to flat keywords for all tiers if missing
      const tiers = p.title_keywords_by_tier || {}
      const title_keywords_by_tier = {
        enterprise: Array.isArray(tiers.enterprise) && tiers.enterprise.length > 0 ? tiers.enterprise : title_keywords,
        mid_market: Array.isArray(tiers.mid_market) && tiers.mid_market.length > 0 ? tiers.mid_market : title_keywords,
        startup_smb: Array.isArray(tiers.startup_smb) && tiers.startup_smb.length > 0 ? tiers.startup_smb : title_keywords,
      }

      // Validate tier seniority — fall back to flat seniority for all tiers if missing
      const sTiers = p.seniority_by_tier || {}
      const filterSeniority = (arr: unknown) =>
        Array.isArray(arr) ? arr.filter((s: string) => validSeniorities.includes(s)) : []
      const seniority_by_tier = {
        enterprise: filterSeniority(sTiers.enterprise).length > 0 ? filterSeniority(sTiers.enterprise) : [seniority],
        mid_market: filterSeniority(sTiers.mid_market).length > 0 ? filterSeniority(sTiers.mid_market) : [seniority],
        startup_smb: filterSeniority(sTiers.startup_smb).length > 0 ? filterSeniority(sTiers.startup_smb) : [seniority],
      }

      return {
        ...p,
        seniority,
        title_keywords,
        description: p.description || null,
        role_in_buying_committee: validRoles.includes(p.role_in_buying_committee || '') ? p.role_in_buying_committee : null,
        departments: Array.isArray(p.departments) ? p.departments : p.department ? [p.department] : [],
        title_keywords_by_tier,
        seniority_by_tier,
      }
    })

    console.log(`Generated ${personas.length} persona suggestions for account map ${accountMapId}`)

    return jsonResponse({
      success: true,
      personas,
    })
  } catch (error) {
    console.error('Suggest buyer personas error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
