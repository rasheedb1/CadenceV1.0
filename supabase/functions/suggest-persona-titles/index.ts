// Edge Function: Suggest Persona Title Keywords by Company Size Tier
// POST /functions/v1/suggest-persona-titles
// Uses LLM to generate adaptive title keywords for a buyer persona across
// enterprise, mid-market, and startup/SMB company size tiers.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext } from '../_shared/supabase.ts'
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

    const ctx = await getAuthContext(authHeader)
    if (!ctx) return errorResponse('Unauthorized', 401)

    const body: SuggestRequest = await req.json()
    const { productCategory, companyDescription, buyingRole, personaDescription } = body

    if (!buyingRole) return errorResponse('buyingRole is required')

    let llm
    try {
      llm = await createLLMClientForUser(ctx.userId)
    } catch (err) {
      return errorResponse(`LLM not configured: ${err instanceof Error ? err.message : 'Unknown'}`, 500)
    }

    const systemPrompt = `You are a B2B sales expert who finds real decision-makers on LinkedIn Sales Navigator.

Given a product and a buyer persona role, generate SHORT search keywords for LinkedIn's "Role" filter across 3 company size tiers. These keywords are combined with a SEPARATE seniority filter, so do NOT include seniority in the keywords.

CRITICAL RULES:
- Use SHORT keywords (1-2 words) that appear as substrings in real LinkedIn titles
- Focus on FUNCTIONAL AREA terms, not full job titles
- The seniority filter (VP, Director, CXO, etc.) is applied SEPARATELY — never put "VP of...", "Head of...", "Director of..." in keywords
- Only include C-level abbreviations (CFO, CTO, CEO, COO, CRO) as standalone keywords when relevant
- Keywords must work across different industries

GOOD: ["Finance", "Treasury", "Payments", "Accounting", "CFO"]
GOOD: ["Engineering", "Platform", "Software", "Architecture", "CTO"]
BAD: ["VP of Revenue Operations", "Head of Payment Infrastructure"]
BAD: ["Director of Engineering", "SVP Technology"]

Tiers:
1. ENTERPRISE (1000+): Specific functional areas + specialized terms (e.g., "Payments", "Treasury", "Revenue Operations", "Platform Engineering")
2. MID-MARKET (51-1000): Broader functional areas (e.g., "Finance", "Engineering", "Product", "Operations")
3. STARTUP/SMB (1-50): C-level titles + broad areas (e.g., "CEO", "CTO", "CFO", "Founder", "Finance", "Technology")

Respond with ONLY valid JSON:
{
  "tiers": {
    "enterprise": ["Payments", "Treasury", "Revenue Operations", "Billing", "Financial Services", "CFO"],
    "mid_market": ["Finance", "Payments", "Accounting", "Treasury", "CFO"],
    "startup_smb": ["CEO", "CFO", "Founder", "Finance", "Co-Founder"]
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
