import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthUser, createSupabaseClient } from '../_shared/supabase.ts'
import { createLLMClientForUser } from '../_shared/llm.ts'

interface StrategyRequest {
  accountMapId: string
  companyId: string
  productDescription: string
  productCategory: string
}

interface StrategyStep {
  order: number
  prospect_id: string
  prospect_name: string
  role: string
  reasoning: string
  suggested_angle: string
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

    const body: StrategyRequest = await req.json()
    const { accountMapId, companyId, productDescription, productCategory } = body

    if (!accountMapId || !companyId) return errorResponse('accountMapId and companyId are required')

    const supabase = createSupabaseClient(authHeader)

    // Fetch the company
    const { data: company, error: cErr } = await supabase
      .from('account_map_companies')
      .select('*')
      .eq('id', companyId)
      .eq('owner_id', user.id)
      .single()

    if (cErr || !company) return errorResponse('Company not found', 404)

    // Fetch validated prospects for this company (prefer validated, fallback to all)
    const { data: prospects, error: pErr } = await supabase
      .from('prospects')
      .select('id, first_name, last_name, title, company, headline, buying_role, relevance_score, role_fit, outreach_angle, ai_validated, skipped')
      .eq('account_map_id', accountMapId)
      .eq('company_id', companyId)
      .eq('owner_id', user.id)
      .neq('skipped', true)
      .order('relevance_score', { ascending: false, nullsFirst: false })

    if (pErr) return errorResponse(`Failed to fetch prospects: ${pErr.message}`, 500)
    if (!prospects || prospects.length < 2) {
      return jsonResponse({
        success: true,
        strategy: null,
        message: 'Need at least 2 non-skipped prospects to generate a strategy',
      })
    }

    // Initialize LLM
    const llm = await createLLMClientForUser(user.id)

    const prospectsText = prospects.map(p =>
      `- ${p.first_name} ${p.last_name} (${p.title || 'Unknown title'}) — Role: ${p.buying_role || 'Unknown'}, Relevance: ${p.relevance_score || '?'}/10, Fit: ${p.role_fit || 'unknown'}${p.outreach_angle ? `, Angle: ${p.outreach_angle}` : ''}`
    ).join('\n')

    const prompt = `You are a B2B sales strategist. Given these contacts found at ${company.company_name}, suggest the optimal outreach sequence.

We sell: ${productDescription || productCategory || 'B2B software'}
Product category: ${productCategory || 'N/A'}
Company: ${company.company_name} (${company.industry || 'Unknown'}, ${company.company_size || 'Unknown size'})

Contacts found:
${prospectsText}

Consider these approaches:
- Champion-first: Start with someone who has the pain, then leverage to reach the decision maker
- Top-down: Start with the decision maker if they're accessible
- Multi-thread: Contact champion and decision maker simultaneously

Recommend the best approach and explain why. Max 3 steps.

Respond in JSON:
{
  "strategy_name": "Champion-first",
  "steps": [
    {
      "order": 1,
      "prospect_id": "uuid-here",
      "prospect_name": "María García",
      "role": "champion",
      "reasoning": "She feels the pain daily...",
      "suggested_angle": "Lead with engineering efficiency..."
    }
  ],
  "overall_reasoning": "Starting with the champion because..."
}`

    const isOpenAI = llm.provider === 'openai'
    const result = await llm.createMessage({
      system: 'You are a B2B outreach strategist. Always respond with valid JSON.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2048,
      temperature: 0.5,
      jsonMode: isOpenAI,
    })

    if (!result.success) {
      return errorResponse(`LLM strategy generation failed: ${result.error}`, 500)
    }

    let strategy: { strategy_name: string; steps: StrategyStep[]; overall_reasoning: string } | null = null
    try {
      const jsonStr = extractJSON(result.text)
      strategy = JSON.parse(jsonStr)
    } catch (parseErr) {
      console.error('Failed to parse strategy:', parseErr)
      return errorResponse('Failed to parse AI strategy', 500)
    }

    if (!strategy) return errorResponse('No strategy generated', 500)

    // Upsert into outreach_strategies table
    const { error: uErr } = await supabase
      .from('outreach_strategies')
      .upsert({
        account_map_id: accountMapId,
        company_id: companyId,
        owner_id: user.id,
        strategy_name: strategy.strategy_name,
        overall_reasoning: strategy.overall_reasoning,
        steps: strategy.steps,
      }, { onConflict: 'account_map_id,company_id,owner_id' })

    if (uErr) {
      console.error('Failed to save strategy:', uErr)
      // Still return the strategy even if save fails
    }

    console.log(`Generated outreach strategy "${strategy.strategy_name}" for ${company.company_name}`)

    return jsonResponse({ success: true, strategy })
  } catch (error) {
    console.error('Suggest outreach strategy error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
