// Edge Function: AI Refine Prompt (Multi-Agent)
// POST /functions/v1/ai-refine-prompt
//
// Multi-agent pipeline:
//   Agent 1 (Analyzer) — reads the current prompt + user feedback + generated message
//                         and produces a structured JSON change plan (add/remove/modify)
//   Agent 2 (Refiner)  — applies the change plan SURGICALLY to the original prompt
//                         and returns the improved version
//
// This is intentionally different from ai-polish-prompt which generates from scratch.
// Here we preserve the original prompt's spirit and only touch what the feedback asks for.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext } from '../_shared/supabase.ts'
import { createLLMClientForUser } from '../_shared/llm.ts'

interface RefinePromptRequest {
  currentPrompt: string
  userFeedback: string
  generatedMessage?: string   // The message that was generated — helps Agent 1 trace what went wrong
  stepType: 'linkedin_message' | 'linkedin_connect' | 'linkedin_comment' | 'send_email'
  tone?: string
  language?: string
}

interface ChangePlan {
  add: string[]       // New instructions to add
  remove: string[]    // Instructions/patterns to remove or soften
  modify: string[]    // "original instruction → what it should become" entries
  reasoning: string   // Short explanation of why these changes address the feedback
}

export interface RefinePromptResponse {
  success: boolean
  refinedPrompt: string
  changes: {
    add: string[]
    remove: string[]
    modify: string[]
    reasoning: string
  }
}

const STEP_TYPE_LABELS: Record<string, string> = {
  linkedin_message: 'LinkedIn direct messages (DMs/InMails)',
  linkedin_connect: 'LinkedIn connection request notes',
  linkedin_comment: 'LinkedIn post comments',
  send_email: 'cold outreach emails',
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)

    const ctx = await getAuthContext(authHeader)
    if (!ctx) return errorResponse('Unauthorized', 401)

    const body: RefinePromptRequest = await req.json()
    const {
      currentPrompt,
      userFeedback,
      generatedMessage,
      stepType,
      tone = 'professional',
      language = 'es',
    } = body

    if (!currentPrompt?.trim()) return errorResponse('currentPrompt is required')
    if (!userFeedback?.trim()) return errorResponse('userFeedback is required')

    const langLabel = language === 'es' ? 'Spanish' : language === 'en' ? 'English' : language
    const messageTypeLabel = STEP_TYPE_LABELS[stepType] || 'sales messages'

    // Initialize LLM with user's settings
    let llm
    try {
      llm = await createLLMClientForUser(ctx.userId)
    } catch (err) {
      return errorResponse(`LLM not configured: ${err instanceof Error ? err.message : 'Unknown'}`, 500)
    }

    // ──────────────────────────────────────────────────────────────────────
    // AGENT 1 — Analyzer
    // Reads: current prompt + generated message + user feedback
    // Outputs: structured JSON change plan
    // ──────────────────────────────────────────────────────────────────────
    console.log('[Agent 1] Analyzing prompt and feedback...')

    const messageContext = generatedMessage
      ? `\n\n## Message that was generated with this prompt (for context):\n"""\n${generatedMessage.substring(0, 1000)}${generatedMessage.length > 1000 ? '\n[truncated]' : ''}\n"""`
      : ''

    const analyzerSystem = `You are an expert prompt engineer specializing in B2B sales outreach.

Your task: analyze an existing AI prompt and a user's feedback, then output a SURGICAL change plan.

The prompt controls how an AI generates ${messageTypeLabel}.
The user's feedback may refer to issues they noticed in the generated message — trace those issues back to what in the prompt CAUSED them.

## Output format (strict JSON, no other text):
{
  "add": ["specific new instruction to add", ...],
  "remove": ["specific instruction or pattern to eliminate", ...],
  "modify": ["original instruction → improved version", ...],
  "reasoning": "1-2 sentence explanation of why these changes address the feedback"
}

## Rules:
- Be SURGICAL: only touch what the feedback explicitly points to
- Preserve EVERYTHING else — do not suggest unrelated improvements
- If the feedback mentions style/tone issues in the message, translate to specific prompt instructions
- If the generated message did something wrong, trace it to the prompt instruction that caused it
- Keep arrays concise: 1-3 items each maximum
- Write all content in: ${langLabel}
- Output ONLY the JSON object — no preamble, no explanation outside the JSON`

    const analyzerUser = `## Current prompt:
"""
${currentPrompt}
"""${messageContext}

## User's feedback:
"${userFeedback}"

Produce the change plan JSON.`

    const analysisResult = await llm.createMessage({
      system: analyzerSystem,
      messages: [{ role: 'user', content: analyzerUser }],
      maxTokens: 700,
      temperature: 0.2,
    })

    if (!analysisResult.success) {
      return errorResponse(`Agent 1 (analyzer) failed: ${analysisResult.error}`, 500)
    }

    console.log('[Agent 1] Raw output:', analysisResult.text.substring(0, 400))

    // Parse change plan — be lenient about JSON extraction
    let changePlan: ChangePlan
    try {
      const jsonMatch = analysisResult.text.match(/\{[\s\S]*\}/)
      const raw = jsonMatch?.[0] || analysisResult.text
      const parsed = JSON.parse(raw)
      changePlan = {
        add: Array.isArray(parsed.add) ? parsed.add : [],
        remove: Array.isArray(parsed.remove) ? parsed.remove : [],
        modify: Array.isArray(parsed.modify) ? parsed.modify : [],
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      }
    } catch (parseErr) {
      console.warn('[Agent 1] Could not parse JSON, using fallback:', parseErr)
      // Fallback: treat entire text as reasoning, no structured changes
      changePlan = { add: [], remove: [], modify: [], reasoning: analysisResult.text }
    }

    const totalChanges = changePlan.add.length + changePlan.remove.length + changePlan.modify.length
    console.log(`[Agent 1] Change plan: +${changePlan.add.length} add, -${changePlan.remove.length} remove, ~${changePlan.modify.length} modify`)

    // If no changes identified, return original with a note
    if (totalChanges === 0) {
      return jsonResponse({
        success: true,
        refinedPrompt: currentPrompt,
        changes: {
          add: [],
          remove: [],
          modify: [],
          reasoning: changePlan.reasoning || 'No specific changes identified from the feedback.',
        },
      } satisfies RefinePromptResponse)
    }

    // ──────────────────────────────────────────────────────────────────────
    // AGENT 2 — Refiner
    // Reads: original prompt + structured change plan from Agent 1
    // Outputs: improved prompt with ONLY the planned changes applied
    // ──────────────────────────────────────────────────────────────────────
    console.log('[Agent 2] Applying change plan to prompt...')

    const addSection = changePlan.add.length > 0
      ? `ADD these new instructions:\n${changePlan.add.map(a => `  • ${a}`).join('\n')}`
      : ''
    const removeSection = changePlan.remove.length > 0
      ? `REMOVE or eliminate:\n${changePlan.remove.map(r => `  • ${r}`).join('\n')}`
      : ''
    const modifySection = changePlan.modify.length > 0
      ? `MODIFY (original → new):\n${changePlan.modify.map(m => `  • ${m}`).join('\n')}`
      : ''

    const changeInstructions = [addSection, removeSection, modifySection]
      .filter(Boolean)
      .join('\n\n')

    const refinerSystem = `You are an expert prompt engineer specializing in B2B sales outreach.

Your task: take an existing prompt and apply a precise set of changes to it. Produce the improved prompt.

## Rules (strictly follow these):
1. Apply ONLY the changes listed — do not add extra improvements
2. Preserve the full structure, formatting, and all other instructions of the original
3. The refined prompt should feel like a natural evolution of the original, not a rewrite
4. Keep the same language: ${langLabel}
5. Output ONLY the refined prompt text — no explanations, no "here is your prompt" prefix`

    const refinerUser = `## Original prompt:
"""
${currentPrompt}
"""

## Changes to apply:
${changeInstructions}

Apply these changes to the original prompt and output the refined version.`

    const refinementResult = await llm.createMessage({
      system: refinerSystem,
      messages: [{ role: 'user', content: refinerUser }],
      maxTokens: 1500,
      temperature: 0.2,
    })

    if (!refinementResult.success) {
      return errorResponse(`Agent 2 (refiner) failed: ${refinementResult.error}`, 500)
    }

    console.log('[Agent 2] Refined prompt length:', refinementResult.text.length)

    return jsonResponse({
      success: true,
      refinedPrompt: refinementResult.text.trim(),
      changes: {
        add: changePlan.add,
        remove: changePlan.remove,
        modify: changePlan.modify,
        reasoning: changePlan.reasoning,
      },
    } satisfies RefinePromptResponse)

  } catch (error) {
    console.error('ai-refine-prompt error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
