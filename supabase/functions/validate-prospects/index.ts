import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthUser, createSupabaseClient } from '../_shared/supabase.ts'
import { createLLMClientForUser } from '../_shared/llm.ts'

interface ValidateRequest {
  accountMapId: string
  companyId: string       // validate prospects for a specific company
  productDescription: string
  productCategory: string
}

interface ProfileValidation {
  prospect_id: string
  relevance_score: number
  role_fit: 'strong' | 'moderate' | 'weak'
  is_recommended: boolean
  outreach_angle: string
  red_flags: string | null
  reasoning: string
}

/** Strip markdown code fences, thinking blocks, and extract JSON */
function extractJSON(raw: string): string {
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim()
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

    const body: ValidateRequest = await req.json()
    const { accountMapId, companyId, productDescription, productCategory } = body

    if (!accountMapId || !companyId) return errorResponse('accountMapId and companyId are required')

    const supabase = createSupabaseClient(authHeader)

    // Fetch the company info
    const { data: company, error: cErr } = await supabase
      .from('account_map_companies')
      .select('*')
      .eq('id', companyId)
      .eq('owner_id', user.id)
      .single()

    if (cErr || !company) return errorResponse('Company not found', 404)

    // Fetch unvalidated prospects for this company
    const { data: prospects, error: pErr } = await supabase
      .from('prospects')
      .select('id, first_name, last_name, title, company, headline, location, buying_role, persona_id')
      .eq('account_map_id', accountMapId)
      .eq('company_id', companyId)
      .eq('owner_id', user.id)
      .or('ai_validated.is.null,ai_validated.eq.false')

    if (pErr) return errorResponse(`Failed to fetch prospects: ${pErr.message}`, 500)
    if (!prospects || prospects.length === 0) {
      return jsonResponse({ success: true, validated: 0, message: 'No prospects to validate' })
    }

    // Fetch personas for role context
    const { data: personas } = await supabase
      .from('buyer_personas')
      .select('id, name, description, role_in_buying_committee')
      .eq('account_map_id', accountMapId)
      .eq('owner_id', user.id)

    const personaMap: Record<string, { name: string; description: string | null; role: string | null }> = {}
    for (const p of personas || []) {
      personaMap[p.id] = { name: p.name, description: p.description, role: p.role_in_buying_committee }
    }

    // Determine company size tier
    const sizeMap: Record<string, string> = {
      '1-10': 'Startup/SMB', '11-50': 'Startup/SMB',
      '51-200': 'Mid-Market', '201-500': 'Mid-Market', '501-1000': 'Mid-Market',
      '1001-5000': 'Enterprise', '5001-10000': 'Enterprise', '10001+': 'Enterprise',
    }
    const companyTier = sizeMap[company.company_size || ''] || 'Mid-Market'

    // Initialize LLM
    const llm = await createLLMClientForUser(user.id)

    // Batch validate (up to 20 at a time to avoid token limits)
    const batchSize = 20
    const allValidations: ProfileValidation[] = []

    for (let i = 0; i < prospects.length; i += batchSize) {
      const batch = prospects.slice(i, i + batchSize)

      const profilesText = batch.map((p, idx) => {
        const persona = p.persona_id ? personaMap[p.persona_id] : null
        return `Profile ${idx + 1} (ID: ${p.id}):
  Name: ${p.first_name} ${p.last_name}
  Title: ${p.title || 'N/A'}
  Company: ${p.company || company.company_name}
  Headline: ${p.headline || 'N/A'}
  Location: ${p.location || 'N/A'}
  Searched as: ${persona?.name || 'Unknown'} (${p.buying_role || persona?.role || 'N/A'})
  Role description: ${persona?.description || 'N/A'}`
      }).join('\n\n')

      const prompt = `You are a B2B sales expert evaluating whether LinkedIn profiles are the right contacts for a sales team.

CONTEXT:
- We sell: ${productDescription || productCategory || 'B2B software'}
- Product category: ${productCategory || 'N/A'}
- Target company: ${company.company_name} (${company.industry || 'Unknown industry'}, ${companyTier})
- Company website: ${company.website || 'N/A'}

PROFILES TO EVALUATE:
${profilesText}

For EACH profile, evaluate:
1. RELEVANCE (1-10): How likely is this person to be involved in decisions about ${productCategory || 'our product'}?
2. ROLE FIT: Does their title/headline match the searched role? (strong/moderate/weak)
3. OUTREACH ANGLE: What pain point or value proposition would resonate with this specific person? Write 1-2 sentences.
4. RED FLAGS: Any reasons this person might NOT be the right contact? (null if none)
5. REASONING: Brief explanation of your assessment.

Be critical. Only give relevance_score >= 7 if the person would realistically be involved in evaluating or buying ${productCategory || 'this type of product'}.

Respond in JSON:
{
  "profiles": [
    {
      "prospect_id": "the-id-from-above",
      "relevance_score": 8,
      "role_fit": "strong",
      "is_recommended": true,
      "outreach_angle": "Owns payment infrastructure decisions...",
      "red_flags": null,
      "reasoning": "VP Payments at enterprise — ideal decision maker"
    }
  ]
}`

      const isOpenAI = llm.provider === 'openai'
      const result = await llm.createMessage({
        system: 'You are a B2B sales validation expert. Always respond with valid JSON.',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 4096,
        temperature: 0.3,
        jsonMode: isOpenAI,
      })

      if (!result.success) {
        console.error(`LLM validation failed for batch ${i}: ${result.error}`)
        continue
      }

      try {
        const jsonStr = extractJSON(result.text)
        const parsed = JSON.parse(jsonStr)
        const profiles = parsed.profiles || parsed
        if (Array.isArray(profiles)) {
          allValidations.push(...profiles)
        }
      } catch (parseErr) {
        console.error('Failed to parse validation response:', parseErr)
        continue
      }
    }

    // Update prospects with validation results
    let updatedCount = 0
    for (const v of allValidations) {
      if (!v.prospect_id) continue

      const score = Math.max(1, Math.min(10, Math.round(v.relevance_score || 0)))
      const roleFit = ['strong', 'moderate', 'weak'].includes(v.role_fit) ? v.role_fit : 'weak'

      const { error: uErr } = await supabase
        .from('prospects')
        .update({
          relevance_score: score,
          role_fit: roleFit,
          outreach_angle: v.outreach_angle || null,
          ai_reasoning: v.reasoning || null,
          red_flags: v.red_flags || null,
          ai_validated: true,
        })
        .eq('id', v.prospect_id)
        .eq('owner_id', user.id)

      if (!uErr) updatedCount++
    }

    console.log(`Validated ${updatedCount}/${prospects.length} prospects for company ${company.company_name}`)

    return jsonResponse({
      success: true,
      validated: updatedCount,
      total: prospects.length,
      validations: allValidations,
    })
  } catch (error) {
    console.error('Validate prospects error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
