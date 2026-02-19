// Edge Function: Chat-based Company Discovery
// POST /functions/v1/chat-discover-companies
// Conversational AI flow for iteratively discovering target companies.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getAuthContext } from '../_shared/supabase.ts'
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
  return cleaned
}

const SYSTEM_PROMPT = `You are an expert B2B market researcher and company discovery assistant. You help users find real companies that match their Ideal Customer Profile (ICP).

## Your Task
Have a natural conversation to help the user discover and refine target companies. Each turn, you should:
1. Respond conversationally (acknowledge their input, explain your reasoning briefly)
2. Suggest 5-10 REAL companies that match their criteria

## Rules
- Only suggest REAL companies that actually exist. Never invent fake companies.
- Each company must have: company_name, industry, company_size (estimate like "51-200", "1001-5000", etc.), website, location, description (1 sentence), and reason_for_suggesting (why this company fits).
- Learn from ACCEPTED companies: suggest MORE companies similar to accepted ones (same industry, same size, same region, similar business model).
- Learn from REJECTED companies: AVOID companies similar to rejected ones. Identify why they were rejected (too big? wrong industry? wrong region?) and adjust.
- NEVER re-suggest a company that was already suggested, accepted, rejected, or exists in the account map.
- If the user gives refinement instructions ("bigger companies", "only in LATAM", "more like X"), incorporate those constraints strictly.
- Keep your conversational text concise (2-4 sentences max).
- If the user's first message is vague and no ICP context is provided, ask 1-2 clarifying questions before suggesting companies.
- Respond ONLY in the same language the user writes in. If they write in Spanish, respond in Spanish. If English, respond in English.

## Response Format
You MUST respond with a valid JSON object with exactly this structure:
{
  "responseText": "Your conversational response here...",
  "companies": [
    {
      "company_name": "Example Corp",
      "industry": "Fintech",
      "company_size": "201-500",
      "website": "https://example.com",
      "location": "San Francisco, USA",
      "description": "Payment processing platform for SMBs.",
      "reason_for_suggesting": "Matches your ICP: fintech company in the 200-500 range with payment focus."
    }
  ]
}

If you need to ask clarifying questions, set companies to an empty array [].`

function buildUserPrompt(
  icpContext: { icpDescription: string | null; builderData: unknown },
  messages: Array<{ role: string; content: string }>,
  acceptedCompanies: Array<{ company_name: string; industry?: string | null }>,
  rejectedCompanies: Array<{ company_name: string; industry?: string | null }>,
  existingCompanyNames: string[],
  userMessage: string,
): string {
  const parts: string[] = []

  // ICP context
  if (icpContext.icpDescription) {
    parts.push(`## ICP Description\n${icpContext.icpDescription}`)
  }
  if (icpContext.builderData) {
    const bd = icpContext.builderData as Record<string, unknown>
    const relevant: string[] = []
    if (bd.productCategory) relevant.push(`Product category: ${bd.productCategory}`)
    if (bd.companyDescription) relevant.push(`Company: ${bd.companyDescription}`)
    if (Array.isArray(bd.industries) && bd.industries.length > 0) relevant.push(`Target industries: ${bd.industries.join(', ')}`)
    if (Array.isArray(bd.companySizes) && bd.companySizes.length > 0) relevant.push(`Target company sizes: ${bd.companySizes.join(', ')}`)
    if (Array.isArray(bd.targetRegions) && bd.targetRegions.length > 0) relevant.push(`Target regions: ${bd.targetRegions.join(', ')}`)
    if (Array.isArray(bd.businessModels) && bd.businessModels.length > 0) relevant.push(`Business models: ${bd.businessModels.join(', ')}`)
    if (Array.isArray(bd.existingCustomers) && bd.existingCustomers.length > 0) relevant.push(`Existing customers (similar to): ${bd.existingCustomers.join(', ')}`)
    if (relevant.length > 0) {
      parts.push(`## ICP Builder Data\n${relevant.join('\n')}`)
    }
  }

  // Conversation history (last 8 turns to avoid token overflow)
  const recentMessages = messages.slice(-8)
  if (recentMessages.length > 0) {
    const history = recentMessages.map(m =>
      `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
    ).join('\n\n')
    parts.push(`## Conversation History\n${history}`)
  }

  // Accepted companies
  if (acceptedCompanies.length > 0) {
    const list = acceptedCompanies.map(c =>
      `- ${c.company_name}${c.industry ? ` (${c.industry})` : ''}`
    ).join('\n')
    parts.push(`## Accepted Companies (suggest MORE like these)\n${list}`)
  }

  // Rejected companies
  if (rejectedCompanies.length > 0) {
    const list = rejectedCompanies.map(c =>
      `- ${c.company_name}${c.industry ? ` (${c.industry})` : ''}`
    ).join('\n')
    parts.push(`## Rejected Companies (AVOID similar to these)\n${list}`)
  }

  // Do-not-suggest list
  const allNames = new Set([
    ...existingCompanyNames,
    ...acceptedCompanies.map(c => c.company_name),
    ...rejectedCompanies.map(c => c.company_name),
  ])
  if (allNames.size > 0) {
    parts.push(`## DO NOT suggest these companies (already known)\n${Array.from(allNames).join(', ')}`)
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
      userMessage,
    } = body

    if (!userMessage?.trim()) {
      return errorResponse('userMessage is required')
    }

    console.log(`Chat discover for user ${ctx.userId}: "${userMessage.substring(0, 100)}", accepted=${acceptedCompanies.length}, rejected=${rejectedCompanies.length}`)

    const llm = await createLLMClientForUser(ctx.userId)

    const userPrompt = buildUserPrompt(
      icpContext,
      messages,
      acceptedCompanies,
      rejectedCompanies,
      existingCompanyNames,
      userMessage,
    )

    const result = await llm.createMessage({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 4096,
      temperature: 0.7,
      jsonMode: llm.provider === 'openai',
    })

    if (!result.success) {
      console.error('LLM call failed:', result.error)
      return errorResponse(`AI service error: ${result.error}`, 500)
    }

    console.log('LLM response length:', result.text.length)

    const jsonStr = extractJSON(result.text)
    const parsed = JSON.parse(jsonStr)

    const responseText = parsed.responseText || ''
    const companies = Array.isArray(parsed.companies) ? parsed.companies : []

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
