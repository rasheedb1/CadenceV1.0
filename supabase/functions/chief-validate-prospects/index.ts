// chief-validate-prospects
// =============================================================================
// Second-pass quality gate AFTER cascade-search-company, BEFORE Apollo enrich.
//
// Problem: Unipile cascade-search returns prospects matching loose title
// keywords ("VP Strategy" matched as "Head of Payments" because "VP" present).
// Result: 6/6 Grubhub prospects were Strategy/Operations, 0 were Payments.
//
// Solution: LLM (Sonnet 4.5) scores each prospect 0-10 on "decision-maker
// likelihood for payments orchestration purchase". Filters to only validated
// prospects before Apollo (saves Apollo credits + dramatically improves quality).
//
// Tier scoring:
//   9-10: Direct payments decision-maker (VP Payments, Head of Payments, CFO at $500M+)
//   7-8:  Strong payments influencer (Payments Ops Mgr, Sr Payments Engineer, Head of Risk/Fraud at scale)
//   4-6:  Adjacent/champion (Product Mgr Payments, FinOps, mid-level payments)
//   0-3:  Wrong person (Strategy, Sales, Marketing, HR, Brand, generic Operations)
//
// Cost: ~$0.05 per company (1 Sonnet call processes all 24 prospects in one batch)
// Saves: ~$0.40 in Apollo credits (only enriches validated 8/24 vs all 24)
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext, createSupabaseClient } from '../_shared/supabase.ts'

interface ValidateRequest {
  company_id: string
  account_map_id: string
  ownerId?: string
  orgId?: string
  min_qualifying_score?: number
  include_enriched?: boolean  // V11b: also score prospects that already have email (for re-validation)
}

interface ProspectInput {
  id: string
  first_name: string
  last_name: string
  title: string
  persona_id: string | null
}

interface ProspectScore {
  prospect_id: string
  full_name: string
  title: string
  score: number
  tier: 'decision_maker' | 'strong_influencer' | 'champion' | 'wrong_person'
  reasoning: string
  recommend_enrich: boolean
}

const SYSTEM_PROMPT = `You are a payments orchestration sales expert reviewing a list of prospects from a target company. Your job: score each prospect 0-10 on "likelihood they're a decision-maker or strong influencer for buying a payment orchestration platform like Yuno".

YUNO sells to companies needing to orchestrate multiple PSPs / acquirers / payment methods. The buyer is someone who owns:
- The payment stack itself (PSP relationships, routing decisions, acceptance rates)
- The cost-of-payments line on the P&L
- The payments product (checkout, conversion)
- Risk/fraud trade-offs in payments

TIER DEFINITIONS (use these to score):

TIER 1 — DIRECT DECISION MAKER (score 9-10):
  • VP Payments, Head of Payments, Director Payments, Chief Payments Officer
  • Head of Payment Orchestration, Head of Payment Gateway, Head of Acceptance
  • Head of Alternative & Local Payment Methods
  • Director Payments & Fraud
  • Global Payments Strategy, Payments Strategy and Ops (if Director+ level)
  • Payment Partnerships (if Director+)
  • CFO at companies $500M+ ARR (broader budget authority over payment costs)
  • Spanish/Portuguese equivalents: Director de Pagos, Diretor de Pagamentos, Coordenador de Meios de Pagamento

TIER 2 — STRONG INFLUENCER (score 7-8):
  • Head of Risk, Head of Fraud, Head of Risk & Fraud (co-owns acceptance trade-offs)
  • Director Risk, Director Fraud, Fraud Prevention leaders
  • CPO / Chief Product Officer (when company has payments-as-product)
  • Head of Product (Payments/Checkout)
  • Senior Product Manager Payments / Technical Product Manager Payments
  • CTO / VP Engineering at companies where payments is core
  • Head of Architecture (when building payments)
  • VP Finance, Head of Finance (broader than CFO scope)
  • Treasurer, Head of Treasury

TIER 3 — CHAMPION / ADJACENT (score 4-6):
  • Head of E-commerce, VP E-commerce, Director E-commerce (digital revenue owner)
  • Head of Digital Business, VP Digital, Director Digital Commerce
  • Product Manager Payments (mid-level)
  • Payments Operations Manager, Payments Strategy Manager (Manager-level)
  • Coordenador / Coordinador de Pagamentos (LATAM mid-level)
  • Senior Payments Engineer
  • Operations Compliance Lead

TIER 0 — WRONG PERSON (score 0-3):
  • VP/Head/Director of: Strategy, Operations (generic), Marketing, Sales, HR, Talent
  • Brand, Communications, PR, Legal (unless Legal owns payments compliance)
  • Customer Success / Support / Account Management
  • General Manager (unless small co)
  • Sourcing Strategy, Procurement (unless they're buying PSPs)
  • Engineering Manager (generic, not payments-specific)
  • Senior Retention Manager, Growth Analytics, Brand Insights
  • Key City Operations, Field Operations
  • Anyone with "Strategy" in title without "Payments" qualifier

CRITICAL: "Strategy" or "Operations" alone ≠ payments buyer. Must have Payments/Payment/Pagos/Pagamento in title OR be CFO at scale.

OUTPUT STRICT JSON (no markdown, no preamble):
{
  "prospects": [
    {
      "prospect_id": "uuid",
      "full_name": "First Last",
      "title": "exact title from input",
      "score": 0-10,
      "tier": "decision_maker" | "strong_influencer" | "champion" | "wrong_person",
      "reasoning": "1 sentence WHY this score",
      "recommend_enrich": boolean
    }
  ],
  "summary": {
    "total_reviewed": N,
    "qualified_count": N (score >= 6),
    "decision_makers": N (score >= 9),
    "strong_influencers": N (score 7-8),
    "champions": N (score 4-6),
    "wrong_persons": N (score 0-3)
  }
}

recommend_enrich = true if score >= min_qualifying_score (passed in user prompt).`

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const body = (await req.json()) as ValidateRequest
    const auth = await getAuthContext(authHeader, { ownerId: body.ownerId, orgId: body.orgId })
    if (!auth) return errorResponse('Unauthorized', 401)

    const supabase = createSupabaseClient(authHeader)
    const minQualifying = body.min_qualifying_score ?? 6

    // V11b: optionally include enriched (re-validate pre-existing prospects without scores)
    let q = supabase
      .from('prospects')
      .select('id, first_name, last_name, title, persona_id, enrichment_data')
      .eq('account_map_id', body.account_map_id)
      .eq('company_id', body.company_id)
    if (!body.include_enriched) {
      q = q.is('email', null)  // default: unenriched only (pre-Apollo gate)
    }
    const { data: prospects, error: pErr } = await q

    if (pErr) return errorResponse(`Failed to fetch prospects: ${pErr.message}`, 500)
    if (!prospects || prospects.length === 0) {
      return jsonResponse({
        success: true,
        message: 'No unenriched prospects to validate',
        validated_count: 0,
      })
    }

    // E4 cache: skip prospects already validated in last 30 days. LLM is non-
    // deterministic enough that re-scoring the same prospect twice in a month
    // wastes tokens for ~zero benefit. Borderline (4-6) get double-pass below.
    const VALIDATOR_CACHE_DAYS = 30
    const cacheThreshold = Date.now() - VALIDATOR_CACHE_DAYS * 24 * 60 * 60 * 1000
    const freshScored: typeof prospects = []
    const cachedSkipped: typeof prospects = []
    for (const p of prospects) {
      const enrich = (p as { enrichment_data?: Record<string, unknown> | null }).enrichment_data || {}
      const validatedAt = enrich.validated_at as string | undefined
      const score = enrich.validator_score as number | undefined
      if (validatedAt && score !== undefined && new Date(validatedAt).getTime() > cacheThreshold) {
        cachedSkipped.push(p)
      } else {
        freshScored.push(p)
      }
    }
    if (cachedSkipped.length > 0) {
      console.log(`[chief-validate-prospects] E4 cache: ${cachedSkipped.length} prospects already scored within ${VALIDATOR_CACHE_DAYS}d — skipping LLM call`)
    }
    if (freshScored.length === 0) {
      return jsonResponse({
        success: true,
        message: `All ${prospects.length} prospects already scored (cache hit, ${VALIDATOR_CACHE_DAYS}d)`,
        validated_count: 0,
        cached_count: cachedSkipped.length,
      })
    }

    console.log(`[chief-validate-prospects] reviewing ${freshScored.length} prospects for company ${body.company_id} (${cachedSkipped.length} cached)`)

    // Build prompt (only fresh prospects — cached ones already have scores)
    const prospectList = (freshScored as ProspectInput[]).map(p => ({
      prospect_id: p.id,
      full_name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown',
      title: p.title || '(no title)',
    }))

    // V11c: Chunk to avoid Sonnet max_tokens truncation. Each prospect output
    // is ~150-250 tokens (id 36 + name 20 + title 30 + tier 20 + reasoning 50-150).
    // 20 prospects × 250 tokens = 5000 tokens output → fits comfortably in 8192.
    // We use max_tokens=16384 for 4x safety margin. Chunk size 20 keeps each
    // call <8s on Sonnet (vs 25-40s for 50+ prospect batches).
    const CHUNK_SIZE = 20
    const SONNET_MAX_TOKENS = 16384

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return errorResponse('ANTHROPIC_API_KEY not set', 500)

    const startMs = Date.now()

    /**
     * Score one chunk of prospects via Sonnet. Returns the parsed validation
     * object (prospects + summary) plus usage/cost. Throws on truncation or
     * parse failure so the caller can decide to retry with a smaller chunk.
     */
    const scoreChunk = async (
      chunk: typeof prospectList
    ): Promise<{ prospects: ProspectScore[]; summary: Record<string, number>; usage: { input_tokens: number; output_tokens: number }; stopReason: string | null }> => {
      const userPrompt = `Min qualifying score: ${minQualifying}

Review the following ${chunk.length} prospects and score each on payments-orchestration decision-maker likelihood:

${JSON.stringify(chunk, null, 2)}

Return strict JSON per schema.`

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: SONNET_MAX_TOKENS,
          temperature: 0,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })

      if (!resp.ok) {
        const errText = await resp.text()
        throw new Error(`Anthropic ${resp.status}: ${errText.slice(0, 300)}`)
      }

      const llmData = await resp.json()
      const stopReason = (llmData.stop_reason as string | null) || null
      const text = llmData.content?.[0]?.text || ''
      const usageRaw = llmData.usage || {}
      const usage = {
        input_tokens: (usageRaw.input_tokens as number) || 0,
        output_tokens: (usageRaw.output_tokens as number) || 0,
      }

      if (stopReason === 'max_tokens') {
        throw new Error(`Sonnet response truncated at max_tokens (chunk=${chunk.length}, max=${SONNET_MAX_TOKENS}). Reduce CHUNK_SIZE or raise max_tokens.`)
      }

      const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || [null, text]
      let parsed: { prospects: ProspectScore[]; summary: Record<string, number> }
      try {
        parsed = JSON.parse(jsonMatch[1] || text)
      } catch (e) {
        throw new Error(`Validator parse failed: ${(e as Error).message}. Stop reason: ${stopReason}. Raw: ${text.slice(0, 300)}`)
      }
      return { ...parsed, usage, stopReason }
    }

    // Split into chunks of CHUNK_SIZE and process in parallel
    const chunks: typeof prospectList[] = []
    for (let i = 0; i < prospectList.length; i += CHUNK_SIZE) {
      chunks.push(prospectList.slice(i, i + CHUNK_SIZE))
    }
    console.log(`[chief-validate-prospects] V11c: scoring ${prospectList.length} prospects in ${chunks.length} chunk(s) of up to ${CHUNK_SIZE} (parallel)`)

    let chunkResults: Awaited<ReturnType<typeof scoreChunk>>[]
    try {
      chunkResults = await Promise.all(chunks.map(c => scoreChunk(c)))
    } catch (e) {
      return errorResponse(`Validator failed: ${(e as Error).message}`, 502)
    }

    // Merge chunk results into a single validation object + sum cost
    const validation: { prospects: ProspectScore[]; summary: Record<string, number> } = {
      prospects: chunkResults.flatMap(r => r.prospects),
      summary: {
        decision_makers: chunkResults.reduce((s, r) => s + (r.summary?.decision_makers ?? 0), 0),
        strong_influencers: chunkResults.reduce((s, r) => s + (r.summary?.strong_influencers ?? 0), 0),
        champions: chunkResults.reduce((s, r) => s + (r.summary?.champions ?? 0), 0),
        wrong_persons: chunkResults.reduce((s, r) => s + (r.summary?.wrong_persons ?? 0), 0),
        qualified_count: 0, // recomputed below
      },
    }
    validation.summary.qualified_count = validation.prospects.filter(p => p.score >= minQualifying).length

    const usage = {
      input_tokens: chunkResults.reduce((s, r) => s + r.usage.input_tokens, 0),
      output_tokens: chunkResults.reduce((s, r) => s + r.usage.output_tokens, 0),
    }
    const cost = (usage.input_tokens * 3 + usage.output_tokens * 15) / 1_000_000

    // E4 borderline double-pass: prospects with score 4-6 are noisy. A second
    // call with the same temperature=0 prompt usually agrees, but if it disagrees
    // we average to reduce false positives/negatives. Only re-call for borderline
    // (cheap: typically <15% of prospects).
    const borderline = validation.prospects.filter(s => s.score >= 4 && s.score <= 6)
    if (borderline.length > 0) {
      console.log(`[chief-validate-prospects] E4 double-pass: re-scoring ${borderline.length} borderline prospects (4-6)`)
      const borderlineNames = new Set(borderline.map(b => b.prospect_id))
      const borderlinePrompts = prospectList.filter(p => borderlineNames.has(p.prospect_id))
      const dpUserPrompt = `Min qualifying score: ${minQualifying}

Re-score the following ${borderlinePrompts.length} borderline prospects on payments-orchestration decision-maker likelihood. Be especially careful at the 4-6 boundary — small title differences matter.

${JSON.stringify(borderlinePrompts, null, 2)}

Return strict JSON per schema.`
      try {
        const dpResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 8192,  // V11c: bumped from 2048 to defend against truncation on >7 borderline
            temperature: 0,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: dpUserPrompt }],
          }),
        })
        if (dpResp.ok) {
          const dpData = await dpResp.json()
          const dpText = dpData.content?.[0]?.text || ''
          const dpMatch = dpText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || [null, dpText]
          const dpVal: { prospects: ProspectScore[] } = JSON.parse(dpMatch[1] || dpText)
          // Average the 2 scores; keep tier from the higher (more inclusive) score
          const dpMap = new Map(dpVal.prospects.map(p => [p.prospect_id, p]))
          for (const orig of validation.prospects) {
            const second = dpMap.get(orig.prospect_id)
            if (!second) continue
            const avg = Math.floor((orig.score + second.score) / 2)
            const better = orig.score >= second.score ? orig : second
            orig.score = avg
            orig.tier = better.tier
            orig.recommend_enrich = avg >= minQualifying
            orig.reasoning = `[avg(${orig.score},${second.score})=${avg}] ${better.reasoning}`
          }
          // Recompute summary
          validation.summary.qualified_count = validation.prospects.filter(p => p.score >= minQualifying).length
        } else {
          console.warn(`[chief-validate-prospects] double-pass failed (non-fatal), keeping single-pass scores`)
        }
      } catch (dpErr) {
        console.warn(`[chief-validate-prospects] double-pass error (non-fatal):`, (dpErr as Error).message)
      }
    }

    // V11b: MERGE validator scores into existing enrichment_data (don't overwrite Apollo data)
    const prospectMap = new Map((freshScored || []).map(p => [p.id, p]))
    const updates = validation.prospects.map(async (s) => {
      const existing = prospectMap.get(s.prospect_id)
      const existingEnrich = (existing?.enrichment_data as Record<string, unknown>) || {}
      const mergedEnrich = {
        ...existingEnrich,
        validator_score: s.score,
        validator_tier: s.tier,
        validator_reasoning: s.reasoning,
        validator_recommend_enrich: s.recommend_enrich,
        validated_at: new Date().toISOString(),
      }
      // Only update status to 'disqualified_by_validator' if it's not already promoted
      const existingStatus = (existing as Record<string, unknown> | undefined)?.status as string | undefined
      const newStatus = s.recommend_enrich
        ? (existingStatus && existingStatus !== 'disqualified_by_validator' ? existingStatus : 'new')
        : 'disqualified_by_validator'
      await supabase
        .from('prospects')
        .update({
          enrichment_data: mergedEnrich,
          status: newStatus,
        })
        .eq('id', s.prospect_id)
    })
    await Promise.all(updates)

    return jsonResponse({
      success: true,
      company_id: body.company_id,
      validated_count: validation.prospects.length,
      qualified_count: validation.summary.qualified_count,
      summary: validation.summary,
      decision_makers: validation.prospects.filter(p => p.tier === 'decision_maker').map(p => ({ name: p.full_name, title: p.title, score: p.score })),
      wrong_persons_filtered: validation.prospects.filter(p => p.tier === 'wrong_person').map(p => ({ name: p.full_name, title: p.title, reason: p.reasoning })),
      cost_usd: cost.toFixed(4),
      duration_ms: Date.now() - startMs,
    })
  } catch (err) {
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})
