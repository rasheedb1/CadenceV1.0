// Edge Function: Suggest Persona Title Keywords by Company Size Tier
// POST /functions/v1/suggest-persona-titles
// Uses LLM to generate adaptive title keywords for a buyer persona across
// enterprise, mid-market, and startup/SMB company size tiers.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthUser } from '../_shared/supabase.ts'
import { createLLMClientForUser } from '../_shared/llm.ts'

interface SuggestRequest {
  productCategory: string
  companyDescription: string
  buyingRole: string
  personaDescription: string
}

/** Strip markdown code fences, thinking blocks, and extract JSON from LLM response */
function extractJSON(raw: string): string {
  let cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .trim()
  cleaned = cleaned.replace(/```(?:json)?\s*\n?/g, '').replace(/```\s*$/g, '').trim()
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

    const user = await getAuthUser(authHeader)
    if (!user) return errorResponse('Unauthorized', 401)

    const body: SuggestRequest = await req.json()
    const { productCategory, companyDescription, buyingRole, personaDescription } = body

    if (!buyingRole) return errorResponse('buyingRole is required')

    let llm
    try {
      llm = await createLLMClientForUser(user.id)
    } catch (err) {
      return errorResponse(`LLM not configured: ${err instanceof Error ? err.message : 'Unknown'}`, 500)
    }

    const systemPrompt = `You are a B2B sales expert specializing in identifying the right contacts at companies of different sizes.

Given a product description and a buyer persona role, generate LinkedIn Sales Navigator title keywords for 3 company size tiers. The titles should reflect how the SAME buying role exists at different organizational scales:

1. ENTERPRISE (1000+ employees): Specialized, dedicated roles. Titles are specific and often include the function name (e.g., "VP of Revenue Operations", "Head of Payment Infrastructure").
2. MID-MARKET (51-1000 employees): Broader roles. The person handling this function often has a wider scope (e.g., "VP Finance" covers payments too, "Director of Engineering" covers payment infra).
3. STARTUP/SMB (1-50 employees): Generalist leaders. C-level or founders often make these decisions directly (e.g., "CEO", "CTO", "Co-Founder").

Rules:
- For each tier, provide 5-8 title keywords (most common/likely first)
- Title keywords should be practical LinkedIn search terms that match real job titles
- Also recommend 2-4 seniority levels per tier from: Entry, Senior, Manager, Director, VP, CXO, Owner, Partner
- Think about who ACTUALLY makes the decision about the described product at each company size

Respond with ONLY valid JSON:
{
  "tiers": {
    "enterprise": ["VP Payments", "Head of Payments", ...],
    "mid_market": ["VP Finance", "VP Engineering", ...],
    "startup_smb": ["CEO", "CTO", "Co-Founder", ...]
  },
  "seniority": {
    "enterprise": ["VP", "Director", "CXO"],
    "mid_market": ["VP", "Director", "CXO"],
    "startup_smb": ["CXO", "Owner", "VP"]
  }
}`

    const contextParts: string[] = []
    if (productCategory) contextParts.push(`Product category: ${productCategory}`)
    if (companyDescription) contextParts.push(`Company description: ${companyDescription}`)
    contextParts.push(`Buying role: ${buyingRole}`)
    if (personaDescription) contextParts.push(`Persona description: ${personaDescription}`)

    const userPrompt = `${contextParts.join('\n')}\n\nGenerate title keywords and seniority levels for all 3 company size tiers.`

    const isOpenAI = llm.provider === 'openai'
    const result = await llm.createMessage({
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 1024,
      temperature: 0.5,
      jsonMode: isOpenAI,
    })

    if (!result.success) {
      return errorResponse(`LLM failed: ${result.error}`, 500)
    }

    // Parse response
    const jsonStr = extractJSON(result.text)
    const parsed = JSON.parse(jsonStr)

    // Validate structure
    const tiers = parsed.tiers || {}
    const seniority = parsed.seniority || {}

    const validSeniorities = ['Entry', 'Senior', 'Manager', 'Director', 'VP', 'CXO', 'Owner', 'Partner']

    // Ensure arrays and validate seniority values
    for (const tier of ['enterprise', 'mid_market', 'startup_smb']) {
      tiers[tier] = Array.isArray(tiers[tier]) ? tiers[tier] : []
      seniority[tier] = Array.isArray(seniority[tier])
        ? seniority[tier].filter((s: string) => validSeniorities.includes(s))
        : []
    }

    console.log(`Generated persona titles for role "${buyingRole}": E:${tiers.enterprise.length} M:${tiers.mid_market.length} S:${tiers.startup_smb.length}`)

    return jsonResponse({
      success: true,
      tiers,
      seniority,
    })
  } catch (error) {
    console.error('Suggest persona titles error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
