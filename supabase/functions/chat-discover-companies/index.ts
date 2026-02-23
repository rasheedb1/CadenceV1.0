// Edge Function: Chat-based Company Discovery
// POST /functions/v1/chat-discover-companies
// Conversational AI flow for iteratively discovering target companies.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getAuthContext, createSupabaseClient } from '../_shared/supabase.ts'
import { createLLMClientForUser } from '../_shared/llm.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

function extractJSON(raw: string): string {
  let cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .trim()
  cleaned = cleaned.replace(/```(?:json)?\s*\n?/g, '').replace(/```\s*$/g, '').trim()
  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) return objMatch[0]
  // If no closing brace found, JSON may be truncated - try to repair
  const openMatch = cleaned.match(/\{[\s\S]*/)
  if (openMatch) return repairTruncatedJSON(openMatch[0])
  return cleaned
}

/**
 * Attempt to repair truncated JSON from LLM output.
 * Strips the last incomplete object/element and closes all open brackets.
 */
function repairTruncatedJSON(json: string): string {
  let repaired = json

  // Strip trailing incomplete key-value pair (e.g. `"key": "incom`)
  repaired = repaired.replace(/,\s*"[^"]*"?\s*:\s*"[^"]*$/s, '')
  // Strip trailing incomplete object (after last complete },)
  repaired = repaired.replace(/,\s*\{[^}]*$/s, '')
  // Strip trailing incomplete string value in array
  repaired = repaired.replace(/,\s*"[^"]*$/s, '')
  // Strip trailing comma
  repaired = repaired.replace(/,\s*$/s, '')

  // Count open/close brackets and balance them
  const opens = (repaired.match(/\[/g) || []).length
  const closes = (repaired.match(/\]/g) || []).length
  const openBraces = (repaired.match(/\{/g) || []).length
  const closeBraces = (repaired.match(/\}/g) || []).length

  // Close arrays first, then objects (since companies array is inside the root object)
  repaired += ']'.repeat(Math.max(0, opens - closes))
  repaired += '}'.repeat(Math.max(0, openBraces - closeBraces))

  console.log(`Repaired truncated JSON: added ${Math.max(0, opens - closes)} ] and ${Math.max(0, openBraces - closeBraces)} }`)
  return repaired
}

const SYSTEM_PROMPT = `You are an expert B2B market researcher and company discovery assistant. You help users find real companies that match their Ideal Customer Profile (ICP).

## Your Task
Have a natural conversation to help the user discover and refine target companies. Each turn, you should:
1. Respond conversationally (acknowledge their input, explain your reasoning briefly)
2. Suggest 5-8 REAL companies that match their criteria

## Rules
- Only suggest REAL companies that actually exist. Never invent fake companies.
- ALWAYS suggest between 5 and 8 companies. Never more than 8 per turn.
- Each company must have: company_name, industry, company_size (estimate like "51-200", "1001-5000", etc.), website, location, description (1 sentence max), and reason_for_suggesting (1 sentence max).
- Keep description and reason_for_suggesting SHORT (under 20 words each).
- Learn from ACCEPTED companies: suggest MORE companies similar to accepted ones (same industry, same size, same region, similar business model).
- Learn from REJECTED companies: AVOID companies similar to rejected ones. Identify why they were rejected (too big? wrong industry? wrong region?) and adjust.
- NEVER re-suggest a company that was already suggested, accepted, rejected, or exists in the account map.
- If the user gives refinement instructions ("bigger companies", "only in LATAM", "more like X"), incorporate those constraints strictly.
- Keep your conversational text concise (2-3 sentences max).
- If the user's first message is vague and no ICP context is provided, ask 1-2 clarifying questions before suggesting companies.
- Respond ONLY in the same language the user writes in. If they write in Spanish, respond in Spanish. If English, respond in English.

## Response Format
You MUST respond with a VALID, COMPLETE JSON object. Keep responses compact to avoid truncation.
{
  "responseText": "Your conversational response here...",
  "companies": [
    {
      "company_name": "Example Corp",
      "industry": "Fintech",
      "company_size": "201-500",
      "website": "https://example.com",
      "location": "San Francisco, USA",
      "description": "Payment processing for SMBs.",
      "reason_for_suggesting": "Fintech in 200-500 range with payment focus."
    }
  ]
}

If you need to ask clarifying questions, set companies to an empty array [].`

/**
 * Condense a long array into a summary string to save prompt tokens.
 * If the list has ≤ maxItems items, join them as-is. Otherwise, show
 * the first `maxItems` and note how many more there are.
 */
function condenseList(items: string[], maxItems = 10): string {
  if (items.length <= maxItems) return items.join(', ')
  const shown = items.slice(0, maxItems).join(', ')
  return `${shown} (and ${items.length - maxItems} more similar)`
}

function buildUserPrompt(
  icpContext: { icpDescription: string | null; builderData: unknown },
  messages: Array<{ role: string; content: string }>,
  acceptedCompanies: Array<{ company_name: string; industry?: string | null }>,
  rejectedCompanies: Array<{ company_name: string; industry?: string | null }>,
  existingCompanyNames: string[],
  excludedCompanyNames: string[],
  userMessage: string,
): string {
  const parts: string[] = []

  // ICP context — condense long lists to save tokens
  if (icpContext.icpDescription) {
    // Truncate very long ICP descriptions
    const desc = icpContext.icpDescription.length > 500
      ? icpContext.icpDescription.substring(0, 500) + '...'
      : icpContext.icpDescription
    parts.push(`## ICP Description\n${desc}`)
  }
  if (icpContext.builderData) {
    const bd = icpContext.builderData as Record<string, unknown>
    const relevant: string[] = []
    if (bd.productCategory) relevant.push(`Product category: ${bd.productCategory}`)
    if (bd.companyDescription) relevant.push(`Company: ${String(bd.companyDescription).substring(0, 200)}`)
    if (Array.isArray(bd.industries) && bd.industries.length > 0) relevant.push(`Target industries: ${condenseList(bd.industries as string[], 12)}`)
    if (Array.isArray(bd.companySizes) && bd.companySizes.length > 0) relevant.push(`Target company sizes: ${(bd.companySizes as string[]).join(', ')}`)
    if (Array.isArray(bd.targetRegions) && bd.targetRegions.length > 0) relevant.push(`Target regions: ${condenseList(bd.targetRegions as string[], 8)}`)
    if (Array.isArray(bd.businessModels) && bd.businessModels.length > 0) relevant.push(`Business models: ${condenseList(bd.businessModels as string[], 8)}`)
    if (Array.isArray(bd.companyStages) && bd.companyStages.length > 0) relevant.push(`Company stages: ${condenseList(bd.companyStages as string[], 6)}`)
    if (Array.isArray(bd.buyingSignals) && bd.buyingSignals.length > 0) relevant.push(`Buying signals: ${condenseList(bd.buyingSignals as string[], 6)}`)
    if (Array.isArray(bd.existingCustomers) && bd.existingCustomers.length > 0) relevant.push(`Existing customers (similar to): ${condenseList(bd.existingCustomers as string[], 5)}`)
    if (relevant.length > 0) {
      parts.push(`## ICP Builder Data\n${relevant.join('\n')}`)
    }
  }

  // Conversation history — keep last 4 turns max; summarize assistant turns (strip company JSON)
  const recentMessages = messages.slice(-4)
  if (recentMessages.length > 0) {
    const history = recentMessages.map(m => {
      const label = m.role === 'user' ? 'User' : 'Assistant'
      // Truncate very long assistant messages (they often contain prior JSON)
      const content = m.content.length > 300 ? m.content.substring(0, 300) + '...' : m.content
      return `${label}: ${content}`
    }).join('\n\n')
    parts.push(`## Conversation History\n${history}`)
  }

  // Accepted companies (last 20 to keep prompt manageable)
  if (acceptedCompanies.length > 0) {
    const recent = acceptedCompanies.slice(-20)
    const list = recent.map(c =>
      `- ${c.company_name}${c.industry ? ` (${c.industry})` : ''}`
    ).join('\n')
    parts.push(`## Accepted Companies (suggest MORE like these)\n${list}`)
  }

  // Rejected companies (last 15)
  if (rejectedCompanies.length > 0) {
    const recent = rejectedCompanies.slice(-15)
    const list = recent.map(c =>
      `- ${c.company_name}${c.industry ? ` (${c.industry})` : ''}`
    ).join('\n')
    parts.push(`## Rejected Companies (AVOID similar to these)\n${list}`)
  }

  // Excluded companies — only send up to 100 in prompt (post-filter catches the rest)
  if (excludedCompanyNames.length > 0) {
    const shown = excludedCompanyNames.slice(0, 100)
    const note = excludedCompanyNames.length > 100
      ? ` (and ${excludedCompanyNames.length - 100} more — all excluded)`
      : ''
    parts.push(`## EXCLUDED COMPANIES — existing customers, competitors, or do-not-contact. NEVER suggest any of these:\n${shown.join(', ')}${note}`)
  }

  // Do-not-suggest list — cap at 80 names
  const allNames = new Set([
    ...existingCompanyNames,
    ...acceptedCompanies.map(c => c.company_name),
    ...rejectedCompanies.map(c => c.company_name),
  ])
  if (allNames.size > 0) {
    const nameList = Array.from(allNames).slice(0, 80)
    const note = allNames.size > 80 ? ` (and ${allNames.size - 80} more)` : ''
    parts.push(`## DO NOT suggest these companies (already known)\n${nameList.join(', ')}${note}`)
  }

  // Current user message
  parts.push(`## Current Message\n${userMessage}`)

  return parts.join('\n\n')
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Missing authorization header', 401)
    }

    const ctx = await getAuthContext(authHeader)
    if (!ctx) {
      return errorResponse('Unauthorized', 401)
    }

    const body = await req.json()
    const {
      messages = [],
      icpContext = { icpDescription: null, builderData: null },
      acceptedCompanies = [],
      rejectedCompanies = [],
      existingCompanyNames = [],
      excludedCompanyNames: clientExcluded = [],
      userMessage,
    } = body

    if (!userMessage?.trim()) {
      return errorResponse('userMessage is required')
    }

    console.log(`Chat discover for user ${ctx.userId}: "${userMessage.substring(0, 100)}", accepted=${acceptedCompanies.length}, rejected=${rejectedCompanies.length}`)

    // Build full exclusion list: client registry + Salesforce accounts
    const excludedSet = new Set<string>(
      (clientExcluded as string[]).map((n: string) => n.toLowerCase())
    )

    // Also exclude all Salesforce-synced accounts for this org
    const supabase = createSupabaseClient()
    const { data: sfAccounts } = await supabase
      .from('salesforce_accounts')
      .select('name')
      .eq('org_id', ctx.orgId)
    if (sfAccounts) {
      for (const acc of sfAccounts) {
        excludedSet.add(acc.name.toLowerCase())
      }
    }

    const allExcluded = Array.from(excludedSet)
    console.log(`Excluding ${allExcluded.length} companies (${(clientExcluded as string[]).length} registry + ${sfAccounts?.length ?? 0} Salesforce)`)

    const llm = await createLLMClientForUser(ctx.userId)

    const userPrompt = buildUserPrompt(
      icpContext,
      messages,
      acceptedCompanies,
      rejectedCompanies,
      existingCompanyNames,
      allExcluded,
      userMessage,
    )

    console.log(`Prompt length: ${userPrompt.length} chars (~${Math.round(userPrompt.length / 4)} tokens)`)

    const MIN_COMPANIES = 5

    const callLLM = async (prompt: string, maxTokens: number) => {
      return llm.createMessage({
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        maxTokens,
        temperature: 0.7,
        jsonMode: llm.provider === 'openai',
      })
    }

    /**
     * Parse LLM text into { responseText, companies[] }.
     * Handles truncated JSON with repair + retry.
     */
    const parseLLMResponse = async (text: string, stopReason: string | null | undefined, prompt: string): Promise<{ responseText: string; companies: unknown[] }> => {
      const jsonStr = extractJSON(text)
      try {
        const p = JSON.parse(jsonStr)
        return { responseText: p.responseText || '', companies: Array.isArray(p.companies) ? p.companies : [] }
      } catch (parseErr) {
        console.warn('JSON parse failed, attempting repair:', (parseErr as Error).message)
        try {
          const p = JSON.parse(repairTruncatedJSON(jsonStr))
          const companies = Array.isArray(p.companies) ? p.companies : []
          console.log(`Repair succeeded, recovered ${companies.length} companies`)
          return { responseText: p.responseText || '', companies }
        } catch {
          console.error('JSON repair also failed, retrying with higher token limit')
          const retry = await callLLM(prompt, 32768)
          if (!retry.success) throw new Error(retry.error || 'LLM retry failed')
          console.log(`Retry response: ${retry.text.length} chars, stopReason=${retry.stopReason}`)
          const retryJson = extractJSON(retry.text)
          try {
            const p = JSON.parse(retryJson)
            return { responseText: p.responseText || '', companies: Array.isArray(p.companies) ? p.companies : [] }
          } catch {
            try {
              const p = JSON.parse(repairTruncatedJSON(retryJson))
              return { responseText: p.responseText || '', companies: Array.isArray(p.companies) ? p.companies : [] }
            } catch {
              return { responseText: 'La respuesta fue cortada. Por favor intenta de nuevo.', companies: [] }
            }
          }
        }
      }
    }

    let result = await callLLM(userPrompt, 16384)

    if (!result.success) {
      console.error('LLM call failed:', result.error)
      return errorResponse(`AI service error: ${result.error}`, 500)
    }

    console.log(`LLM response: ${result.text.length} chars, stopReason=${result.stopReason}, usage=${JSON.stringify(result.usage)}`)

    let { responseText, companies: rawCompanies } = await parseLLMResponse(result.text, result.stopReason, userPrompt)

    // If we got too few companies and the model stopped normally, make a fill-up call
    if (rawCompanies.length > 0 && rawCompanies.length < MIN_COMPANIES && result.stopReason !== 'max_tokens') {
      console.log(`Only ${rawCompanies.length} companies returned, requesting more to reach ${MIN_COMPANIES}`)
      const alreadySuggested = rawCompanies.map((c: { company_name?: string }) => c.company_name).filter(Boolean)
      const fillUpPrompt = `${userPrompt}\n\n## IMPORTANT: You already suggested these companies: ${alreadySuggested.join(', ')}. DO NOT repeat them. Suggest ${MIN_COMPANIES - rawCompanies.length} MORE different companies that match the criteria. Return the SAME JSON format with only the NEW companies.`

      const fillResult = await callLLM(fillUpPrompt, 8192)
      if (fillResult.success) {
        console.log(`Fill-up response: ${fillResult.text.length} chars, stopReason=${fillResult.stopReason}`)
        try {
          const fillParsed = await parseLLMResponse(fillResult.text, fillResult.stopReason, fillUpPrompt)
          if (fillParsed.companies.length > 0) {
            // Deduplicate by company name
            const existingNames = new Set(rawCompanies.map((c: { company_name?: string }) => c.company_name?.toLowerCase()).filter(Boolean))
            const newOnes = fillParsed.companies.filter((c: { company_name?: string }) =>
              c.company_name && !existingNames.has(c.company_name.toLowerCase())
            )
            rawCompanies = [...rawCompanies, ...newOnes]
            console.log(`Fill-up added ${newOnes.length} companies, total now ${rawCompanies.length}`)
          }
        } catch (fillErr) {
          console.warn('Fill-up call failed, returning what we have:', fillErr)
        }
      }
    }

    // Post-filter: remove any companies the LLM suggested despite exclusion instructions
    const companies = rawCompanies.filter((c: { company_name?: string }) => {
      if (!c.company_name) return false
      return !excludedSet.has(c.company_name.toLowerCase())
    })

    if (rawCompanies.length !== companies.length) {
      console.log(`Post-filtered ${rawCompanies.length - companies.length} excluded companies from LLM response`)
    }
    console.log(`Returning ${companies.length} company suggestions`)

    return jsonResponse({
      success: true,
      responseText,
      companies,
    })
  } catch (error) {
    console.error('chat-discover-companies error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
