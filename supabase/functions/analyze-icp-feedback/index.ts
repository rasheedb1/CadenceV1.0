import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext, createSupabaseClient } from '../_shared/supabase.ts'
import { createLLMClientForUser } from '../_shared/llm.ts'

interface ICPInsight {
  category: string
  insight: string
  suggestion: string
  action?: {
    field: string
    operation: 'add' | 'remove'
    value: string
  }
  confidence: 'high' | 'medium' | 'low'
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

    // Fetch feedback for this account map
    const { data: feedback, error: fbErr } = await supabase
      .from('icp_discovery_feedback')
      .select('*')
      .eq('account_map_id', accountMapId)
      .eq('org_id', ctx.orgId)

    if (fbErr) return errorResponse(`Failed to fetch feedback: ${fbErr.message}`, 500)

    if (!feedback || feedback.length === 0) {
      return jsonResponse({
        success: true,
        insights: [],
        message: 'No feedback data available yet. Discover companies and rate them to generate insights.',
      })
    }

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

    // Prepare feedback summary
    const helpful = feedback.filter((f: { feedback: string }) => f.feedback === 'helpful')
    const notHelpful = feedback.filter((f: { feedback: string }) => f.feedback === 'not_helpful')

    const helpfulSummary = helpful.map((f: { company_name: string; discovery_data: Record<string, unknown> | null }) => {
      const d = f.discovery_data || {}
      return `- ${f.company_name}: industry=${d.industry || '?'}, size=${d.company_size || '?'}, location=${d.location || '?'}, score=${d.relevance_score || '?'}`
    }).join('\n')

    const notHelpfulSummary = notHelpful.map((f: { company_name: string; discovery_data: Record<string, unknown> | null }) => {
      const d = f.discovery_data || {}
      return `- ${f.company_name}: industry=${d.industry || '?'}, size=${d.company_size || '?'}, location=${d.location || '?'}, score=${d.relevance_score || '?'}`
    }).join('\n')

    // Initialize LLM
    let llm
    try {
      llm = await createLLMClientForUser(ctx.userId)
    } catch (err) {
      return errorResponse(`LLM not configured: ${err instanceof Error ? err.message : 'Unknown'}`, 500)
    }

    const systemPrompt = `You are an expert B2B sales strategy analyst. Analyze user feedback on ICP (Ideal Customer Profile) company discoveries and suggest actionable refinements.

You will receive:
1. The user's current ICP builder configuration (structured fields)
2. Companies the user marked as "helpful" (good matches)
3. Companies the user marked as "not helpful" (bad matches)

Your task: Identify patterns in the feedback and suggest specific changes to the ICP builder fields.

Rules:
- Focus on actionable, specific suggestions (e.g., "add SaaS to business models" not "refine your criteria")
- Each insight should reference concrete data from the feedback
- The "action" field is optional but strongly preferred — it should map to a specific builder field
- Valid builder fields for action.field: companyDescription, productCategory, existingCustomers, businessModels, industries, companySizes, revenueRangeMin, revenueRangeMax, companyStages, targetRegions, mustOperateIn, digitalPresence, techSignals, buyingSignals, customSignals, exclusionCriteria, excludedCompanies, excludedIndustries
- action.operation is "add" (include this value) or "remove" (exclude this value)
- confidence: "high" if pattern is clear (3+ examples), "medium" if some evidence (2 examples), "low" if suggestive (1 example)
- Return 3-7 insights, ordered by confidence desc
- category should be one of: industry, company_size, geography, business_model, digital_presence, buying_signals, exclusions, general

You MUST respond with a JSON object: {"insights": [{"category": "...", "insight": "...", "suggestion": "...", "action": {"field": "...", "operation": "add", "value": "..."}, "confidence": "high"}]}`

    const userPrompt = `## Current ICP Configuration:
${builderData ? JSON.stringify(builderData, null, 2) : `Free-text description: ${icpDescription}`}

## Companies Marked HELPFUL (${helpful.length}):
${helpfulSummary || '(none)'}

## Companies Marked NOT HELPFUL (${notHelpful.length}):
${notHelpfulSummary || '(none)'}

Analyze the patterns and suggest refinements to improve future ICP discoveries.`

    const isOpenAI = llm.provider === 'openai'
    const result = await llm.createMessage({
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 2048,
      temperature: 0.4,
      jsonMode: isOpenAI,
    })

    if (!result.success) {
      return errorResponse(`LLM analysis failed: ${result.error}`, 500)
    }

    // Parse response
    let insights: ICPInsight[] = []
    try {
      const jsonStr = extractJSON(result.text)
      const parsed = JSON.parse(jsonStr)
      if (parsed.insights && Array.isArray(parsed.insights)) {
        insights = parsed.insights
      } else if (Array.isArray(parsed)) {
        insights = parsed
      }
    } catch (err) {
      console.error('Failed to parse insights:', err)
      return errorResponse('Failed to parse AI insights', 500)
    }

    // Validate confidence values
    insights = insights.map(i => ({
      ...i,
      confidence: ['high', 'medium', 'low'].includes(i.confidence) ? i.confidence : 'low',
    }))

    console.log(`Generated ${insights.length} insights for account map ${accountMapId}`)

    return jsonResponse({
      success: true,
      insights,
      feedbackSummary: {
        total: feedback.length,
        helpful: helpful.length,
        notHelpful: notHelpful.length,
      },
    })
  } catch (error) {
    console.error('Analyze ICP feedback error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
