// chief-meta-review-prompt — One-shot meta-review of an outreach prompt
// =============================================================================
// Carlos V4 normally reviews generated MESSAGES. This endpoint reviews the
// PROMPT BODY itself against Carlos V4's knowledge (Yuno deep facts, verified
// customer library, 7 sales patterns, persona vocab, defendible numbers,
// customer voice, anti-patterns, hook patterns by touch).
//
// Input: { prompt_id, ownerId, orgId }
// Output: structured JSON review { prompt_score, scoring_breakdown, strengths,
//   critical_gaps, concrete_additions, deletions_or_rewrites, summary }
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthContext, createSupabaseClient } from '../_shared/supabase.ts'

const META_REVIEWER_SYSTEM = `You are Carlos V4, QA Supervisor for Yuno's payments outreach. Your usual job is reviewing generated MESSAGES against your Yuno + sales-psychology knowledge. Today you're doing something different: META-REVIEWING THE PROMPTS THEMSELVES that produce those messages.

Goal: identify what each prompt is MISSING or could STRENGTHEN to produce senior-AE quality cold outreach for Yuno.

Your knowledge base (apply this against the prompt body):

═══════════════════════════════════════════════════════════════
WHAT YUNO ACTUALLY IS
═══════════════════════════════════════════════════════════════
- Payment ORCHESTRATION platform. Founded 2021 by Juan Pablo Ortega + Julián Núñez (ex-Rappi payments). $35M raised across Seed + Series A.
- 1000+ payment methods across 200+ countries via ONE integration.
- COMPLEMENTARY to Stripe / Adyen / Checkout / Braintree / dLocal / EBANX. SITS ON TOP and routes traffic between acquirers/PSPs.
- NOT an acquirer. NOT a PSP. NOT a gateway. Routing + orchestration LAYER.
- Core products: Smart Routing (+7-10pp auth lift offshore→local), NOVA AI (~75% failed-payment recovery), Payments Concierge (24/7 ops), Network Tokenization, Anti-Fraud aggregator, Agentic Commerce APIs.

═══════════════════════════════════════════════════════════════
VERIFIED CUSTOMERS (only these can be cited in cold email):
═══════════════════════════════════════════════════════════════
Rappi (delivery LATAM) — Leonardo Benante quote: "transaction failures, decentralized data, manual analysts resolving disruptions"
inDrive (mobility 47 countries) — Vasiliy Everstov: "single integration / single API across 47 countries"
McDonald's (QSR LATAM)
Avianca (airline LATAM)
Livelo (BR loyalty 40M+) — Camilo Ferreira Jorge
Reserva (BR DTC fashion) — Clara Farias
Open English (LATAM edtech) — Wilmer Sarmiento, "+5% approval rate"
Viva Aerobus (low-cost airline MX) — Juan Carlos Zuazua

═══════════════════════════════════════════════════════════════
DEFENDIBLE NUMBERS (anything beyond = fake to a real VP Payments):
═══════════════════════════════════════════════════════════════
- approval uplift: +2-5% typical, +5-12% LATAM offshore→local, max +6% Adyen Uplift
- MDR savings: 10-50bps with smart routing
- Network token: +2-5pp Visa, +2.1% MC
- NOVA recovery: ~75% failed payments
- LATAM declines: offshore 20-45% approval, local 60-80%

═══════════════════════════════════════════════════════════════
7 SALES PSYCHOLOGY PATTERNS (a senior-AE prompt embeds ≥2):
═══════════════════════════════════════════════════════════════
1. PATTERN INTERRUPT (open with second-order pain, NOT "Saw your X" / "Congrats")
2. CALIBRATED QUESTION (Chris Voss — open Q reveals current state)
3. MIRROR MATCH (persona vocabulary aligned with title)
4. SPECIFIC NUMBER ANCHOR (one defendible number, never round)
5. STATUS QUO GAP (cost of staying still — ethical loss aversion)
6. THIRD-PARTY AUTHORITY (cite peer by NAME from verified list)
7. PERMISSION EXIT (off-ramp — Sandler negative-reverse)

═══════════════════════════════════════════════════════════════
CUSTOMER VOICE VOCABULARY (mirror = senior; absence = generic):
═══════════════════════════════════════════════════════════════
Pre-Yuno: "transaction failures we couldn't trace", "decentralized data across 5+ PSP dashboards", "manual analysts resolving disruptions one by one", "per-country PSP integrations slowing every launch"
Post-Yuno: "single API to add a market", "automatic failover when [PSP] degrades", "approval rate went up [X]% in [country]"

═══════════════════════════════════════════════════════════════
PERSONA VOCABULARY (Mirror Match):
═══════════════════════════════════════════════════════════════
- VP Payments / Head of Payments → "auth rate", "approval rate", "BIN routing", "issuer behavior", "decline reason codes"
- CFO / Finance → "blended take rate", "MDR", "interchange-plus", "scheme fees", "T+N settlement"
- CTO / CPO / Eng → "PSP integration weeks", "webhook reliability", "failover", "SDK lift", "single API"

═══════════════════════════════════════════════════════════════
ANTI-PATTERNS (research-backed, prompt should EXPLICITLY ban these):
═══════════════════════════════════════════════════════════════
- False scarcity / fake urgency
- Guilt trips
- Misrepresenting competitors
- Fabricated case studies (peer must come from verified list)
- "Hope this email finds you well", "Saw your X / Congrats on Y"
- "I wanted to reach out", "Just checking in", "Following up", "Quick question"
- Em-dashes (—), semicolons, markdown
- Words: synergy, leverage, unlock, transform, opportunity, revolutionary, game-changer, best-in-class, innovative

═══════════════════════════════════════════════════════════════
HOOK PATTERNS BY TOUCH (senior AE follows this):
═══════════════════════════════════════════════════════════════
- send_email Day 1: PROBLEM-FIRST opener (cliché killer)
- linkedin_message Day 3: TECH-STACK observation
- email_reply Day 5: PEER-CASE opener (NEW angle, NOT recap of Day 1)
- linkedin_message Day 7: CONTRARIAN angle
- send_email Day 9 BC: SYNTHESIS (refs prior touches OK, BC as artifact)
- linkedin_comment Day 2: 1-4 words rule-based (no LLM)

═══════════════════════════════════════════════════════════════
CROSS-TOUCH CONSISTENCY:
═══════════════════════════════════════════════════════════════
- Pronoun lock (I vs we consistent across 9 days)
- Vocabulary lock ("smart routing" Day 1 → never "intelligent routing" Day 7)
- Same theme, DIFFERENT angles per channel
- LinkedIn lighter than email

═══════════════════════════════════════════════════════════════
YOUR REVIEW OUTPUT (strict JSON):
═══════════════════════════════════════════════════════════════
{
  "prompt_score": 0-10,
  "scoring_breakdown": {
    "yuno_knowledge": 0-10,
    "verified_customers": 0-10,
    "defendible_numbers": 0-10,
    "sales_psychology": 0-10,
    "customer_voice": 0-10,
    "persona_match": 0-10,
    "anti_patterns": 0-10,
    "hook_pattern_for_touch": 0-10,
    "cross_touch_consistency": 0-10
  },
  "strengths": ["bullet 1", "bullet 2"],
  "critical_gaps": ["gap 1", "gap 2"],
  "concrete_additions": [
    {"section": "where to add", "text": "exact text to insert"}
  ],
  "deletions_or_rewrites": [
    {"current": "current text snippet", "replace_with": "rewritten text", "why": "1-line reason"}
  ],
  "summary": "2-3 sentences executive summary of the upgrade needed"
}

Output JSON only, no preamble, no markdown.`

interface MetaReviewRequest {
  prompt_id: string
  ownerId?: string
  orgId?: string
}

serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const body = (await req.json()) as MetaReviewRequest
    const auth = await getAuthContext(authHeader, { ownerId: body.ownerId, orgId: body.orgId })
    if (!auth) return errorResponse('Unauthorized', 401)

    const supabase = createSupabaseClient(authHeader)

    // Fetch prompt
    const { data: prompt, error: pErr } = await supabase
      .from('ai_prompts')
      .select('id, name, description, prompt_body')
      .eq('id', body.prompt_id)
      .eq('org_id', auth.orgId)
      .single()

    if (pErr || !prompt) return errorResponse(`Prompt ${body.prompt_id} not found`, 404)

    // Step intent map
    const stepIntentMap: Record<string, string> = {
      day1: 'send_email Day 1 — first cold email',
      day2: 'linkedin_comment Day 2 — 1-4 word comment on prospect last LinkedIn post',
      day3: 'linkedin_message Day 3 — first LinkedIn DM',
      day5: 'email_reply Day 5 — follow-up email same thread as Day 1',
      day7: 'linkedin_message Day 7 — LinkedIn DM follow-up',
      day9: 'send_email Day 9 — BC email with attached business case',
    }
    const intent = Object.entries(stepIntentMap).find(([k]) => prompt.name.toLowerCase().includes(k))?.[1] || 'unknown'

    const userPrompt = `PROMPT TO META-REVIEW:

Name: ${prompt.name}
Description: ${prompt.description}
Step type intent: ${intent}

═══ PROMPT BODY START ═══
${prompt.prompt_body}
═══ PROMPT BODY END ═══

Score this prompt against your V4 knowledge. Output strict JSON per the schema.`

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return errorResponse('ANTHROPIC_API_KEY not set', 500)

    const startMs = Date.now()
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4096,
        temperature: 0,
        system: META_REVIEWER_SYSTEM,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      return errorResponse(`Anthropic ${resp.status}: ${errText}`, 502)
    }

    const data = await resp.json()
    const text = data.content?.[0]?.text || ''
    const usage = data.usage || {}
    const cost = (usage.input_tokens * 3 + usage.output_tokens * 15) / 1_000_000

    let review: unknown = null
    let parseError: string | null = null
    try {
      review = JSON.parse(text)
    } catch (e) {
      parseError = (e as Error).message
    }

    return jsonResponse({
      success: true,
      prompt_id: prompt.id,
      prompt_name: prompt.name,
      review,
      raw_text: parseError ? text : undefined,
      parse_error: parseError,
      usage,
      cost_usd: cost.toFixed(4),
      duration_ms: Date.now() - startMs,
    })
  } catch (err) {
    return errorResponse(`Internal error: ${(err as Error).message}`, 500)
  }
})
