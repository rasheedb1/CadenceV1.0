import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext } from '../_shared/supabase.ts'
import { createLLMClient } from '../_shared/llm.ts'

// ─── Types ────────────────────────────────────────────────────────

interface GenerateBcStructureRequest {
  description: string
  slideCount?: number
  language?: string
  tone?: string
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
  layout: 'cover' | 'title_only' | 'title_and_body' | 'title_and_bullets' | 'two_columns' | 'big_number' | 'comparison_table'
  fixed_content: string | null
  fields: BcSlideField[]
}

// ─── Helpers ──────────────────────────────────────────────────────

function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    let cleaned = text.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    return JSON.parse(cleaned) as T
  } catch {
    return fallback
  }
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

  let body: GenerateBcStructureRequest
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { description, slideCount = 9, language = 'English', tone = 'Professional' } = body

  if (!description || !description.trim()) {
    return errorResponse('description is required', 400)
  }

  console.log(`[generate-bc-structure] user=${authCtx.userId} slides=${slideCount} lang=${language} tone=${tone}`)

  const llm = createLLMClient('anthropic')

  const systemPrompt = `You are an expert business case presentation designer. Generate a slide-by-slide structure for a business case presentation based on the user's description.

Rules:
- Always start with a cover slide (type: "mixed", layout: "cover") with field key "company_name" (field_type: "auto", ai_instruction: null)
- Include 1-2 "fixed" slides for company info (About Us) where field_type is "fixed" and fixed_content has placeholder text like "Write your company description here"
- The core slides should be "dynamic" - AI fills per prospect
- End with next steps slide (type: "dynamic")
- Each dynamic field must have a specific, actionable ai_instruction that references researching the prospect
- Example outputs should be realistic and specific, not generic
- Return ONLY valid JSON array, no markdown, no explanation

Return a JSON array matching this TypeScript type:
interface BcSlide {
  slide_number: number
  title: string  // can contain {{company_name}} placeholder
  type: "fixed" | "dynamic" | "mixed"
  layout: "cover" | "title_only" | "title_and_body" | "title_and_bullets" | "two_columns" | "big_number" | "comparison_table"
  fixed_content: string | null  // only for fixed slides
  fields: Array<{
    key: string
    name: string
    field_type: "auto" | "dynamic" | "fixed"
    output_type: "text" | "list" | "number"
    ai_instruction: string | null
    fallback_behavior: "use_benchmarks" | "leave_blank" | "use_default"
    fallback_default: string | null
    example_output: string | null
    max_length: number
    data_sources: string[]
    sort_order: number
  }>
}`

  const userContent = `Create a business case presentation structure with exactly ${slideCount} slides.

Language: ${language}
Tone: ${tone}

Business case description:
${description.trim()}`

  try {
    const result = await llm.createMessage({
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      maxTokens: 4000,
      temperature: 0.3,
      jsonMode: true,
    })

    if (!result.success) {
      console.error('[generate-bc-structure] LLM error:', result.error)
      return errorResponse(`LLM generation failed: ${result.error}`, 500)
    }

    const slides = safeJsonParse<BcSlide[]>(result.text, [])

    if (!Array.isArray(slides) || slides.length === 0) {
      console.error('[generate-bc-structure] Failed to parse slides from LLM response:', result.text.substring(0, 500))
      return errorResponse('Failed to parse slide structure from AI response', 500)
    }

    console.log(`[generate-bc-structure] Generated ${slides.length} slides`)

    return jsonResponse({ success: true, slides })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[generate-bc-structure] Error:', msg)
    return errorResponse(msg, 500)
  }
})
