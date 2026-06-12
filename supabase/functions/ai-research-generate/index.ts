import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient, getAuthContext, getUnipileAccountId, logActivity } from '../_shared/supabase.ts'
import { createUnipileClient } from '../_shared/unipile.ts'
import { createFirecrawlClient, type FirecrawlClient } from '../_shared/firecrawl.ts'
import { createLLMClient, createLLMClientForUser } from '../_shared/llm.ts'
import { detectLanguage, type LanguageConfig } from '../_shared/language-detection.ts'
import { parsePersonaScope, signalRelevanceForPersona, angleHintForFunction, REGIONAL_PAYMENTS } from '../_shared/persona-scope.ts'
import { buildAngleLockSection, getTouchAngle } from '../_shared/touch-angles.ts'
import { GLOBAL_ANTI_PATTERNS, getBannedPhrasesForLanguage, findBannedPhrases, findFormatViolations, buildAntiPatternsPromptSection } from '../_shared/anti-patterns.ts'
import { scanSignals } from '../_shared/signal-scanner.ts'
import type { SignalConfigWithType, DetectedSignal } from '../_shared/signal-types.ts'

// ─── Types ────────────────────────────────────────────────────────

interface AIGenerateRequest {
  leadId: string
  stepType: 'linkedin_message' | 'linkedin_connect' | 'linkedin_comment' | 'send_email' | 'email_reply'
  messageTemplate?: string
  researchPrompt?: string
  tone?: 'professional' | 'casual' | 'friendly'
  language?: string
  additionalUrls?: string[]
  postContext?: string
  exampleMessages?: string[]
  exampleNotes?: string[]
  // New structured fields
  senderPersona?: SenderPersona | null
  objective?: string | null
  structure?: string | null
  writingPrinciples?: string[]
  antiPatterns?: string[]
  customInstructions?: string
  // Regeneration context
  regenerateHint?: 'shorter' | 'more_casual' | 'different_angle' | null
  // Signals toggle
  useSignals?: boolean
  // V15 narrative arc — day_offset enables ANGLE LOCK injection (per-touch
  // capability/peer/number rotation) so each cadence touch covers a different
  // Yuno value prop instead of all messages saying "smart routing + 5-12pp + SpaceX".
  dayOffset?: number
  cadenceId?: string  // for PRIOR TOUCHES query (DB lookup of prior message_qa_reviews for this lead+cadence)
  // V14: pre-generated company deck URLs (cached on amc — see chief-prepare-decks-for-company)
  // - ssDeckUrl: Stripe Sessions visual deck → inject as soft CTA on Day 5 (email_reply) + Day 7 (linkedin_message follow-up)
  // - sdrBcUrl: SDR Business Case → inject as the actual BC link on Day 9 (replaces invented URL in prompt examples)
  // When undefined/null, the prompt MUST NOT mention a deck — degrades silently.
  ssDeckUrl?: string | null
  sdrBcUrl?: string | null
  ownerId?: string
  orgId?: string
  // Model override (for test tab — bypasses profile default)
  llmProvider?: string
  llmModel?: string
}

interface SenderPersona {
  full_name: string
  role: string
  company: string
  value_proposition: string
  credibility?: string
  communication_style: string
  signature?: string
}

interface ProfileSummary {
  name: string
  headline: string
  company: string
  location?: string
  summary?: string
  recentPosts: Array<{ text: string; date?: string }>
}

interface WebInsight {
  title: string
  snippet: string
  url: string
}

interface QualityCheckResult {
  human_score: number
  issues: string[]
  has_cliches: boolean
  cliche_phrases: string[]
  exceeds_length: boolean
  violates_anti_patterns: string[]
  suggestion: string
  // Enhanced fields
  language_correct: boolean
  language_detected: string
  banned_words_found: string[]
  has_em_dashes: boolean
  has_semicolons: boolean
  has_markdown: boolean
  has_mixed_languages: boolean
  opens_with_self_intro: boolean
  multiple_ctas: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────

function extractUsernameFromUrl(linkedinUrl: string): string | null {
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^\/\?#]+)/)
  return match ? match[1] : null
}

function truncate(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text || ''
  return text.substring(0, maxLen) + '...'
}

function substituteTemplateVariables(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match)
}

// ─── System Prompt (English — language-agnostic instructions) ────

const SYSTEM_PROMPT = `You are an expert B2B sales copywriter. Your job is to write prospecting messages that sound like they were written by a smart, thoughtful human — not an AI, not a generic SDR, not a marketing tool.

ABSOLUTE RULES:
1. Write like a real person, not a sales tool. Every message must pass the "would I actually send this?" test.
2. The message must feel like the start of a CONVERSATION, not a pitch.
3. The first sentence is ALWAYS about THEM — never about you, your company, or your product.
4. The goal is to spark curiosity and get a reply, NOT to sell.
5. Each message must be UNIQUE — never repeat structures, openings, or patterns across messages.
6. Write in the EXACT language specified in the language context section. Do NOT mix languages.
7. Match the cultural tone and formality level specified for the target language/region.

WRITING STYLE:
- Short paragraphs (1-2 sentences max per paragraph)
- Conversational tone — write like you'd text a respected colleague
- Specific > generic. Use concrete details from the research, not vague compliments.
- One clear question or soft CTA at the end — never more than one.
- No filler words, no throat-clearing, no preamble.

FORMAT:
- Respond ONLY with the message. No explanations, no "Here you go", no markdown.
- Do NOT wrap the message in quotes.
- Do NOT include a subject line unless explicitly requested.
- Do NOT use em dashes (—), semicolons (;), or markdown formatting.
- Do NOT use emojis unless explicitly requested.

BANNED WORDS (English): leverage, synergy, game-changer, paradigm, circle back, touch base, low-hanging fruit, move the needle, cutting-edge, robust, seamless, holistic, deep dive, bandwidth, scalable, disruptive, streamline, revolutionize, unlock potential
BANNED WORDS (Spanish): sinergia, paradigma, innovador, disruptivo, apalancar, potenciar, de vanguardia, enfoque holístico, propuesta de valor, puntos de dolor, escalable, revolucionar, quedo a tus órdenes, quedo a tu disposición
BANNED WORDS (Portuguese): sinergia, paradigma, inovador, disruptivo, alavancar, potencializar, de vanguarda, abordagem holística, proposta de valor, pontos de dor, escalável, revolucionar, fico à disposição, fico no aguardo`

function buildUserPromptV2(params: {
  senderPersona: SenderPersona | null
  profile: ProfileSummary
  insights: WebInsight[]
  researchSummary: string | null
  stepType: string
  language: string
  languageConfig: LanguageConfig
  objective: string | null
  structure: string | null
  writingPrinciples: string[]
  antiPatterns: string[]
  customPrompt: string | null
  customInstructions: string | null
  exampleMessages?: string[]
  exampleNotes?: string[]
  postContext?: string
  regenerateHint?: string | null
  detectedSignals?: DetectedSignal[]
  companyIntelligence?: Record<string, unknown> | null
  // V15 narrative arc
  dayOffset?: number | null
  priorTouches?: Array<{ day_offset: number; step_type: string; subject: string | null; message: string }>
  // V14: company-level deck URLs (cached on amc)
  ssDeckUrl?: string | null
  sdrBcUrl?: string | null
}): string {
  const {
    senderPersona, profile, insights, researchSummary, stepType, language,
    languageConfig, objective, structure, writingPrinciples, antiPatterns,
    customPrompt, customInstructions, exampleMessages, exampleNotes,
    postContext, regenerateHint, detectedSignals, companyIntelligence,
    dayOffset, priorTouches, ssDeckUrl, sdrBcUrl,
  } = params

  const isEmail = stepType === 'send_email' || stepType === 'email_reply'
  const parts: string[] = []

  // ── ZERO-PLACEHOLDER ENFORCEMENT (V16) ─────────────────────────────────
  // Critical safety rule. Outbound endpoints (send-email / linkedin-*)
  // hard-block any message with unsubstituted template variables. This
  // banner sits at the TOP of the prompt so the model treats it as a
  // first-class constraint instead of a footnote.
  parts.push(`## ⛔ ZERO-PLACEHOLDER RULE — ABSOLUTE, NO EXCEPTIONS:

NEVER output any of these in subject or body:
  ❌ {{first_name}} / {{company}} / {{anything}}     (Mustache)
  ❌ {first_name} / {company} / {anything}           (single brace)
  ❌ [first_name] / [Company] / [BC_URL] / [insert metric] / [N PSPs] / [markets] / [Rappi + McDonald's]   (square bracket)
  ❌ <first_name> / <recipient>                      (angle bracket — except real HTML tags)
  ❌ \${first_name}                                   (JS template)
  ❌ XXX / TBD / TODO / FIXME / PLACEHOLDER          (placeholder words)

Why this matters: any of the above tokens reaching the lead's inbox = guaranteed AI-tell, message gets blocked at send time, and you get a zero score from QA.

What to do instead:
  - Use the lead's actual data (first_name, company, title, etc.) directly in prose. The values are provided in CONTACT and PROFILE sections below.
  - For Day 9 BC delivery: write a literal URL placeholder using yuno.com domain (e.g. https://yuno.com/bc/<slug-from-company>). The actual URL gets injected by the cadence engine. Do NOT use [BC_URL] or {{bc_url}}.
  - When prompt examples show "[markets]" or "[Rappi + McDonald's]", those are EXAMPLES showing structure — replace with the actual market list / actual peers in your output.

If you cannot find a value, REWRITE THE SENTENCE. Do not emit a placeholder.`)

  // ── SECTION 1: Sender Context ──
  if (senderPersona && senderPersona.full_name) {
    const styleDescriptions: Record<string, string> = {
      founder_to_founder: 'Founder-to-Founder: direct, peer-to-peer, no unnecessary formalities',
      expert_consultant: 'Expert Consultant: authoritative but approachable, data-driven perspective',
      peer_casual: 'Peer Casual: like an industry colleague, conversational and light',
      executive_brief: 'Executive Brief: concise, executive-level, respecting their time',
    }
    parts.push(`## SENDER CONTEXT
Name: ${senderPersona.full_name}
Role: ${senderPersona.role}
Company: ${senderPersona.company}
Value Proposition: ${senderPersona.value_proposition}
${senderPersona.credibility ? `Credibility: ${senderPersona.credibility}` : ''}
Communication Style: ${styleDescriptions[senderPersona.communication_style] || senderPersona.communication_style}
${senderPersona.signature ? `Signature: ${senderPersona.signature}` : ''}`)
  }

  // ── SECTION 2: Language Context ──
  parts.push(`## LANGUAGE CONTEXT
Write the entire message in: ${languageConfig.language} (${languageConfig.code})
Cultural context: ${languageConfig.cultural_context}
Formality level: ${languageConfig.formality}
Greeting style: ${languageConfig.greeting_style}
IMPORTANT: Write ONLY in ${languageConfig.language}. Do NOT mix languages. Every single word must be in ${languageConfig.language}.`)

  // ── SECTION 2.5: Detected Sales Signals (hooks for personalization) ──
  // V12: signals tagged with relevance to the lead's geographic scope.
  // 'high' = perfect match for this lane, prefer these as the hook
  // 'medium' = neutral / global / parent-company context
  // 'low' = different region — use only as background, never as the main hook
  if (detectedSignals && detectedSignals.length > 0) {
    // Need persona scope here too (parsed below in SECTION 6.5 — duplicate cheap parse)
    const _personaScope = parsePersonaScope(profile.headline || stepType, profile.location || null, profile.company || null)
    const ranked = detectedSignals.map(s => ({
      ...s,
      relevance: signalRelevanceForPersona(`${s.signalName} ${s.summary}`, _personaScope),
    }))
    // Sort: high → medium → low
    const order = { high: 0, medium: 1, low: 2 } as Record<string, number>
    ranked.sort((a, b) => order[a.relevance] - order[b.relevance])
    const signalLines = ranked.map(s => {
      const tag = s.relevance === 'high' ? '⭐ HIGH MATCH'
                : s.relevance === 'low' ? '⚠ DIFFERENT REGION (background only)'
                : 'medium'
      return `- [${s.category.toUpperCase()}] [${tag}] ${s.signalName}: ${s.summary} (confidence: ${Math.round(s.confidence * 100)}%)`
    })
    parts.push(`## SALES SIGNALS DETECTED
The following signals were found about this prospect or their company, ranked by relevance to the lead's geographic + functional scope (see PERSONA SCOPE section below).

PRIORITIZE signals tagged "⭐ HIGH MATCH" as the main hook. NEVER lead with a signal tagged "⚠ DIFFERENT REGION" — use those only as supporting context if at all. Pick 1-2 signals; do NOT list all.

${signalLines.join('\n')}`)
  }

  // ── SECTION 3: Research Data ──
  parts.push(`## PROSPECT RESEARCH
Company: ${profile.company}
Contact: ${profile.name}, ${profile.headline}
${profile.location ? `Location: ${profile.location}` : ''}
${profile.summary ? `Bio: ${truncate(profile.summary, 500)}` : ''}`)

  // ── DEEP COMPANY INTELLIGENCE (migration 121) ──
  // If the company has structured intelligence (cross-border opps, APM gaps,
  // PSP stack, complaints, expansion signals), this is THE highest-leverage
  // context for messaging. Reference specific findings.
  if (companyIntelligence) {
    const intel = companyIntelligence as Record<string, unknown>
    const lines: string[] = []
    lines.push(`## DEEP COMPANY INTELLIGENCE (use these SPECIFIC findings — they're verified with source URLs):`)
    if (intel.executive_summary) {
      lines.push(`\n### Executive Summary:\n${intel.executive_summary}`)
    }
    if (intel.primary_yuno_pitch) {
      lines.push(`\n### Primary Yuno Pitch (use as message anchor):\n${intel.primary_yuno_pitch}`)
    }
    if (intel.recommended_peer_case) {
      lines.push(`\n### Recommended Peer Case: ${intel.recommended_peer_case}`)
    }
    const expansion = (intel.expansion_signals as Array<Record<string, unknown>>) || []
    if (expansion.length > 0) {
      lines.push(`\n### Recent Expansion / Corporate Signals (use as TIMING HOOK):`)
      for (const s of expansion.slice(0, 3)) {
        lines.push(`  - [${s.date}] ${s.description}`)
      }
    }
    const complaints = (intel.payment_complaints as Array<Record<string, unknown>>) || []
    if (complaints.length > 0) {
      lines.push(`\n### Payment Complaints (REAL pain evidence — use as proof point):`)
      for (const c of complaints.slice(0, 3)) {
        lines.push(`  - ${c.issue_type} (${c.frequency_estimate}) — ${c.source_url}`)
      }
    }
    const crossBorder = (intel.cross_border_opportunities as Array<Record<string, unknown>>) || []
    if (crossBorder.length > 0) {
      lines.push(`\n### Cross-Border Opportunities (pitch MoR / local acquiring):`)
      for (const c of crossBorder) {
        lines.push(`  - ${c.country} (${c.opportunity_score}): ${c.why}`)
      }
    }
    const apmGaps = (intel.apm_gaps as Array<Record<string, unknown>>) || []
    if (apmGaps.length > 0) {
      lines.push(`\n### APM Gaps (specific local payment methods missing):`)
      for (const a of apmGaps) {
        lines.push(`  - ${a.country}: missing ${(a.missing_apms as string[]).join(', ')}`)
      }
    }
    const stack = intel.payment_stack as Record<string, unknown>
    if (stack) {
      const psps = (stack.psps_detected as Array<Record<string, unknown>>) || []
      if (psps.length > 0) {
        lines.push(`\n### PSPs detected:`)
        for (const p of psps) {
          lines.push(`  - ${p.name} (${p.evidence_type})`)
        }
      }
      lines.push(`  Orchestrator detected: ${stack.orchestrator_detected}`)
    }
    lines.push(`\n### USAGE INSTRUCTIONS:`)
    lines.push(`- Reference SPECIFIC findings (a complaint URL pattern, a real expansion event, a real APM gap, a real PSP detected). NOT generic "multi-country delivery platforms".`)
    lines.push(`- If recent expansion signal exists, use as timing hook in opener.`)
    lines.push(`- If payment complaint exists, cite it as proof of pain.`)
    lines.push(`- If cross-border opportunity exists, pitch MoR / local acquiring (Yuno's value prop here).`)
    lines.push(`- If APM gap exists, name the specific APM (PIX/OXXO/PSE/UPI/BLIK/etc).`)
    lines.push(`- If primary_yuno_pitch is provided, use as your core message anchor.`)
    parts.push(lines.join('\n'))
  }

  if (researchSummary) {
    parts.push(`Research Summary:
${researchSummary}`)
  }

  if (profile.recentPosts.length > 0) {
    parts.push(`Recent Posts:`)
    for (const post of profile.recentPosts.slice(0, 3)) {
      parts.push(`- ${post.date ? `[${post.date}] ` : ''}${truncate(post.text, 300)}`)
    }
  }

  if (insights.length > 0) {
    parts.push(`\nWeb Sources:`)
    for (const insight of insights) {
      parts.push(`- ${insight.title}: ${truncate(insight.snippet, 200)}`)
    }
  }

  // ── SECTION 4: Message Instructions ──
  const channelLabels: Record<string, string> = {
    linkedin_message: 'LinkedIn Message (max 200 words)',
    linkedin_connect: 'LinkedIn Connection Note (STRICT MAX 300 characters)',
    linkedin_comment: 'LinkedIn Comment (max 150 words)',
    send_email: 'Email (max 300 words, first line must be: SUBJECT: [subject line])',
    email_reply: 'Email Follow-Up Reply (max 250 words, first line must be: SUBJECT: Re: [original subject])',
  }

  parts.push(`## MESSAGE INSTRUCTIONS
Channel: ${channelLabels[stepType] || stepType}
${objective ? `Objective: ${objective}` : ''}`)

  // Use custom prompt (legacy full-text prompt) if provided
  if (customPrompt) {
    parts.push(`Prompt Instructions:
${customPrompt}`)
  }

  // Use structured fields
  if (structure) {
    parts.push(`Message Structure:
${structure}`)
  }

  if (writingPrinciples && writingPrinciples.length > 0) {
    parts.push(`Writing Principles:
${writingPrinciples.map(p => `- ${p}`).join('\n')}`)
  }

  // Step-type specific rules (always apply)
  if (stepType === 'linkedin_connect') {
    parts.push(`CHANNEL RULES (mandatory):
- STRICT MAX 300 characters (LinkedIn enforces this limit)
- Very concise and direct
- Mention ONE specific connection point
- Do NOT include CTA or questions — only the reason to connect
- Do NOT include greetings or signature`)
  } else if (stepType === 'linkedin_comment') {
    parts.push(`CHANNEL RULES (mandatory):
- Must be a genuine, relevant contribution to the post topic
- Add value with a perspective or complementary insight
- Do NOT be generic ("Great post!" or "Totally agree")`)
  } else if (isEmail) {
    parts.push(`CHANNEL RULES (mandatory):
- FORMAT: First line MUST be "SUBJECT: [subject line]" followed by a blank line then the body
- Short subject line (max 60 chars), compelling and personalized
- Short paragraphs separated by blank lines
- Do NOT use generic subjects like "Proposal" or "Opportunity"`)
  }

  // ── SECTION 5: Anti-Patterns (global + user-defined) ──
  parts.push(buildAntiPatternsPromptSection(languageConfig.code, antiPatterns))

  // ── SECTION 6: Reference Messages ──
  if (exampleMessages && exampleMessages.length > 0) {
    parts.push(`## STYLE REFERENCES (tone inspiration, do NOT copy literally):`)
    exampleMessages.forEach((msg, i) => {
      const note = exampleNotes?.[i]
      parts.push(`Example ${i + 1}${note ? ` (${note})` : ''}:\n${msg}`)
    })
  }

  // ── SECTION 6.5: PERSONA SCOPE + REGIONAL CONTEXT (V12) ──
  // Parse the lead's title + location to determine geographic + functional
  // scope. Then inject region-specific payment context so the AI doesn't
  // misalign (e.g. talking about Mexico to a UK Bank CEO).
  const personaScope = parsePersonaScope(profile.headline || stepType, profile.location || null, profile.company || null)
  const regional = REGIONAL_PAYMENTS[personaScope.geo]
  const angleHint = angleHintForFunction(personaScope.functional, personaScope.seniority)
  parts.push(`## PERSONA SCOPE (CRITICAL — align all signals + value props to THIS lane):
- Geographic scope: ${personaScope.geo}${personaScope.raw_geo_token ? ` (parsed from "${personaScope.raw_geo_token}")` : ''}
- Functional scope: ${personaScope.functional}${personaScope.raw_func_token ? ` (parsed from "${personaScope.raw_func_token}")` : ''}
- Seniority: ${personaScope.seniority}
- Angle that resonates: ${angleHint}

## REGIONAL PAYMENTS CONTEXT FOR ${personaScope.geo}:
- Local methods: ${regional.local_methods.slice(0, 6).join(', ')}
- Card landscape: ${regional.card_specifics}
- Regulators: ${regional.regulators.join(', ')}
- Competing PSPs: ${regional.key_psps.slice(0, 5).join(', ')}
- Current trends: ${regional.trends}
- Common payments pain in this region: ${regional.pain}

→ IMPORTANT: When you reference a payments problem or expansion signal, prefer ones that match THIS lane.
   If the company has signals from other regions (e.g. parent company news in Mexico when this lead leads UK),
   DO NOT lead with that. Instead anchor to ${personaScope.geo}-specific dynamics or treat the parent-company
   signal as background context, not the main hook.`)

  // ── SECTION 6.6: YUNO POSITIONING LOCK (V12 → V14: per-day variation) ──
  // Yuno is not a household name. First touch MUST introduce as orchestrator.
  // Subsequent touches MUST NOT re-introduce with textbook definition (reads
  // robotic). They reference Yuno through the angle of THAT day, threading
  // naturally — like a real rep continuing a conversation.
  const isValueStep = stepType !== 'linkedin_connect' && stepType !== 'linkedin_comment'
  // V17: thread continuation kicks in for ANY day_offset >= 3, regardless of
  // whether priorTouches array is populated. In production priorTouches is
  // always populated from message_qa_reviews; in test calls it may be empty,
  // but the message should still treat the reader as already knowing what
  // Yuno is. Only Day 1 (and unknown day) gets the full intro.
  const isFirstValueTouch = dayOffset == null || dayOffset <= 1
  if (isValueStep) {
    if (isFirstValueTouch) {
      // FIRST contact: full introduction required (reader doesn't know Yuno yet).
      parts.push(`## 🛑 YUNO POSITIONING — FIRST VALUE-BEARING TOUCH:

Yuno is NOT a household name. Reader hasn't heard of us. But the message MUST open with the prospect's pain point, not with what Yuno is. Yuno enters AFTER the hook, attached to the SPECIFIC capability that resolves the pain.

⛔ HARD BAN on these textbook openers — they sound robotic and trigger Carlos rejection:
  • "Yuno is a payment orchestration platform — one API to 300+ processors..."
  • "We built Yuno as a payment orchestration layer that sits on top of your existing PSPs."
  • Any sentence that DEFINES Yuno before it's earned attention.

✅ Approved patterns — pick the one that lands today's angle, always introducing Yuno through CAPABILITY + outcome, never as a definition:

  • "Yuno routes each transaction to the processor with the highest auth rate for that BIN and market, in real time. {{peer}} runs through us across {{N}} countries for exactly this reason."
  • "Yuno's smart routing layer reroutes declined cards across {{X}} acquirers in milliseconds — {{peer}} saw a {{N}}pp lift on cross-border volume."
  • "Yuno orchestrates payments across PSPs so {{prospect-specific outcome}}. {{peer}} switched to us when {{situation}}."

If you find yourself writing "Yuno is a..." stop and rewrite as "Yuno {{verb}}..." (routes, orchestrates, reroutes, retries, recovers, aggregates).

Cite ONE verified peer (Rappi, inDrive, Uber, McDonald's, Avianca, Livelo, Reserva, Open English, Viva Aerobus, Xcaret, Smartfit, SpaceX) — pick most relevant to ${personaScope.geo} or ${personaScope.functional}.

Use ONE defendible number from approved list (never invent):
  +5-12pp auth lift offshore→local | +2-5pp same-market | 10-50bps MDR | 1,000+ methods | 200+ countries | 300+ processors | ~75% recovery via NOVA

❌ DO NOT use "we" / "our platform" instead of "Yuno" by name.
❌ DO NOT lead with capability before establishing what Yuno is.`)
    } else {
      // SUBSEQUENT touches: reader already knows what Yuno is. Forbid the
      // textbook intro entirely.
      parts.push(`## 🛑 YUNO POSITIONING — THREAD CONTINUATION (Day ${dayOffset}):

The reader has ALREADY been told what Yuno is (Day 1 introduced "Yuno is a payment orchestration platform..."). They know. They don't need to be told again.

⛔ HARD BAN — ANY of these phrases is an INSTANT REJECT (also applies to Day 1):
  • "Yuno is a payment orchestration platform"
  • "Yuno is a payment orchestrator"
  • "Yuno is a payment orchestration layer"
  • "We built Yuno as a payment orchestration layer"
  • "Yuno is a payment orchestration platform that sits on top of your existing PSPs"
  • "sits on top of your existing PSPs" (without the verb modifier — see below)
  • "one API to 300+ processors and 1,000+ payment methods across 200+ countries"
  • Any sentence that EXPLAINS what Yuno is or DEFINES the orchestration product.

NOTE: "Yuno's smart routing layer sits on top of..." is acceptable IF immediately followed by a routing OUTCOME (auth lift, specific BIN routing, etc.). The ban is on the bare DEFINITIONAL phrasing.

If you need to mention numbers like "300+ processors" or "1,000+ methods", weave them into the SPECIFIC capability you're talking about today — never as a definition of Yuno. Examples:

  Day 5 (negotiation angle) WRONG:
    "Yuno is a payment orchestration platform. The contrarian insight: don't renegotiate."
  Day 5 RIGHT:
    "With Yuno's vendor-agnostic stack you can route volume across acquirers in real time, which flips the renegotiation dynamic."

  Day 7 (recovery angle) WRONG:
    "Yuno is a payment orchestration platform that sits on top of your existing PSPs. One thing we built is Nova..."
  Day 7 RIGHT:
    "Yuno's Nova agent retries failed payments across 300+ processors and recovers around 75% of declines."

  Day 9 (BC delivery) WRONG:
    "Yuno is a payment orchestration platform. One API to 300+ processors..."
  Day 9 RIGHT:
    "If you orchestrated through Yuno you'd see [X], based on the math in the deck."

THE RULE: write as if the reader already understands Yuno. Reference it by name + capability + outcome. NEVER by definition.

Cite ONE peer + ONE number (different from PRIOR TOUCHES if any — see ANGLE LOCK).`)
    }
  }

  // ── SECTION 6.7: ANGLE LOCK by day_offset (V15 narrative arc) ──
  // The 9-day cadence is designed so each touch covers a DIFFERENT Yuno value
  // prop. Without this lock, the AI defaults to "smart routing + 5-12pp + SpaceX/Uber"
  // on every single touch — that's repetitive, signals lack of insight, fails enterprise
  // outreach best practice (Becc Holland 5-touch arc, Outreach.io 2024 benchmark).
  if (isValueStep && dayOffset != null) {
    const angleLockSection = buildAngleLockSection(dayOffset)
    if (angleLockSection) {
      parts.push(angleLockSection)
    }
  }

  // ── SECTION 6.7b: DECK ATTACHMENTS (V14 — cached per company on amc) ──
  // Day 5 (email_reply follow-up) + Day 7 (linkedin_message follow-up)
  // optionally append a Stripe Sessions visual deck (ss_deck) as a soft CTA.
  // Day 9 (BC delivery email) uses the actual SDR BC URL instead of inventing one.
  // ALL conditionals: if the URL is missing → DO NOT mention any deck (degrades silently).
  if (isValueStep && dayOffset != null) {
    if ((dayOffset === 5 || dayOffset === 7) && ssDeckUrl) {
      parts.push(`## 📎 COMPANY DECK AVAILABLE (Day ${dayOffset} — optional soft CTA):

A pre-built deck specifically about Yuno + how it fits this company has been generated and is available at:
  ${ssDeckUrl}

ADD A ONE-LINE CTA at the end of the message referencing this deck. Pick a casual phrasing — vary it, don't sound templated. Examples:
  • "Also left you a quick deck with public info on Yuno and how it could fit ${profile.company || '{{company}}'}: ${ssDeckUrl}"
  • "If it helps, I put together a short deck on Yuno tailored to ${profile.company || '{{company}}'}'s setup: ${ssDeckUrl}"
  • "Built a quick view of where Yuno fits with what you're doing at ${profile.company || '{{company}}'} — ${ssDeckUrl}"

The CTA is in ADDITION to (not replacing) your main question/CTA. Place it just before the signature.

⛔ DO NOT invent a different URL. Use the EXACT URL ${ssDeckUrl} verbatim. No brackets, no placeholders.`)
    } else if ((dayOffset === 5 || dayOffset === 7) && !ssDeckUrl) {
      // Explicit "no deck this touch" signal — prevents the AI from inventing one if it sees the angle pattern.
      parts.push(`## 📎 NO DECK FOR THIS TOUCH (Day ${dayOffset}):
No pre-built deck is available for this lead's company. DO NOT mention or fabricate any deck link. Focus on the angle + calibrated question only.`)
    }

    if (dayOffset === 9 && sdrBcUrl) {
      parts.push(`## 📎 SDR BUSINESS CASE URL (Day 9 — MANDATORY use this exact URL):

The SDR BC for this company has been generated and is live at:
  ${sdrBcUrl}

⛔ Use the EXACT URL ${sdrBcUrl} verbatim where the prompt structure says "[BC_URL]" or "yuno.com/bc/...". DO NOT invent a different URL. DO NOT use placeholders. No brackets.

The actual deck shows: per-region cards with traffic share, average ticket, projected TPV, approval rate uplift, and cost reduction — calibrated to the company's footprint.`)
    } else if (dayOffset === 9 && !sdrBcUrl) {
      // SDR BC not generated — re-shape the Day 9 message so it doesn't reference a deck.
      parts.push(`## 📎 NO SDR BUSINESS CASE AVAILABLE (Day 9):
The SDR BC could not be generated for this company (likely SimilarWeb couldn't resolve the domain). REWRITE the Day 9 message to drop the BC delivery angle entirely. Instead, do a clean soft-exit synthesis email: recap the cadence arc, surface one specific insight from public earnings/news that hasn't been mentioned, and invite calibration feedback on the assumptions. DO NOT mention any deck, BC, or attachment.`)
    }
  }

  // ── SECTION 6.8: PRIOR TOUCHES context (V15 narrative arc) ──
  // Show the AI what was sent in earlier touches so it can build a thread
  // and explicitly NOT repeat angles, peers, numbers, or hooks already used.
  // Multi-channel coherence: LinkedIn DMs reference email threads, etc.
  if (isValueStep && priorTouches && priorTouches.length > 0) {
    const lines: string[] = ['## 📜 PRIOR TOUCHES IN THIS CADENCE (build the narrative arc — do not repeat):']
    for (const pt of priorTouches.sort((a, b) => a.day_offset - b.day_offset)) {
      const channel = pt.step_type.startsWith('linkedin') ? 'LinkedIn' : 'Email'
      const subject = pt.subject ? ` — Subject: "${pt.subject}"` : ''
      const excerpt = (pt.message || '').slice(0, 280).replace(/\n+/g, ' ')
      lines.push(`\n### Day ${pt.day_offset} (${channel}: ${pt.step_type})${subject}`)
      lines.push(`Body excerpt: "${excerpt}${pt.message.length > 280 ? '...' : ''}"`)
    }
    lines.push(`\n→ TODAY'S MESSAGE MUST:
- Reference at least one prior touch naturally (multi-channel coherence: "picking up the thread from Monday", "as I mentioned in my LinkedIn note", "different angle from the email yesterday")
- Use a DIFFERENT capability than prior touches (see ANGLE LOCK above)
- Use a DIFFERENT peer than prior touches (rotate)
- Use a DIFFERENT numeric anchor than prior touches
- Build on what came before, do NOT repeat the same value prop in different words`)
    parts.push(lines.join('\n'))
  }

  // ── SECTION 7: Additional Instructions ──
  if (customInstructions?.trim()) {
    parts.push(`## SPECIFIC INSTRUCTIONS FOR THIS LEAD
${customInstructions}`)
  }

  // ── Post context for comments ──
  if (stepType === 'linkedin_comment' && postContext) {
    parts.push(`## POST TO COMMENT ON:
${truncate(postContext, 1000)}`)
  }

  // ── Regeneration hint ──
  if (regenerateHint) {
    const hintMap: Record<string, string> = {
      shorter: 'IMPORTANT: The user wants a SHORTER message than the previous one. Significantly reduce the length.',
      more_casual: 'IMPORTANT: The user wants a MORE CASUAL tone. Make it more conversational and light.',
      different_angle: 'IMPORTANT: The user wants a DIFFERENT ANGLE. Completely change the approach and opening.',
    }
    if (hintMap[regenerateHint]) {
      parts.push(`## REGENERATION\n${hintMap[regenerateHint]}`)
    }
  }

  parts.push(`Write the message now.`)

  return parts.join('\n\n')
}

// ─── Enhanced Quality Check ──────────────────────────────────────

async function runQualityCheck(
  llm: { createMessage: (params: Record<string, unknown>) => Promise<{ success: boolean; text: string; error?: string }> },
  message: string,
  antiPatterns: string[],
  maxLength: number,
  expectedLangCode: string,
): Promise<QualityCheckResult | null> {
  try {
    // Pre-check: detect format violations and banned phrases locally (fast, no LLM needed)
    const localBannedFound = findBannedPhrases(message, expectedLangCode)
    const localFormatViolations = findFormatViolations(message)

    const expectedLang = expectedLangCode.startsWith('es') ? 'Spanish'
      : expectedLangCode.startsWith('pt') ? 'Portuguese'
      : expectedLangCode.startsWith('fr') ? 'French'
      : expectedLangCode.startsWith('de') ? 'German'
      : 'English'

    const prompt = `Evaluate this B2B sales message and respond ONLY with valid JSON.

MESSAGE TO EVALUATE:
"""
${message}
"""

EXPECTED LANGUAGE: ${expectedLang} (${expectedLangCode})
MAX LENGTH: ${maxLength} characters (current: ${message.length})

ANTI-PATTERNS TO CHECK:
${antiPatterns.length > 0 ? antiPatterns.map(p => `- ${p}`).join('\n') : '(none defined)'}

LOCALLY DETECTED ISSUES (already confirmed):
- Banned phrases found: ${localBannedFound.length > 0 ? localBannedFound.join(', ') : 'none'}
- Format violations: ${localFormatViolations.length > 0 ? localFormatViolations.join(', ') : 'none'}

Respond with this exact JSON structure (no markdown, no backticks):
{
  "human_score": <1-10>,
  "issues": ["list of all issues found"],
  "has_cliches": <true/false>,
  "cliche_phrases": ["list of cliche phrases found in message"],
  "exceeds_length": <true/false>,
  "violates_anti_patterns": ["list of violated anti-patterns"],
  "suggestion": "specific actionable suggestion to improve",
  "language_correct": <true if message is entirely in ${expectedLang}, false if wrong language>,
  "language_detected": "<actual language of the message>",
  "banned_words_found": ["banned words/phrases found in message"],
  "has_em_dashes": <true if message contains em dashes>,
  "has_semicolons": <true if message contains semicolons>,
  "has_markdown": <true if message has markdown formatting>,
  "has_mixed_languages": <true if message mixes multiple languages>,
  "opens_with_self_intro": <true if message starts by introducing sender>,
  "multiple_ctas": <true if message has more than one call-to-action or question>
}

SCORING CRITERIA:
- 9-10: Sounds completely human, personalized, indistinguishable from a real message
- 7-8: Good, natural, only minor tweaks needed
- 5-6: Acceptable but has generic or predictable phrases
- 3-4: Sounds like AI, has cliches, wouldn't pass as human
- 1-2: Template-like, multiple violations, clearly automated

AUTOMATIC DEDUCTIONS:
- Wrong language: -3 points
- Mixed languages: -2 points
- Opens with self-introduction: -2 points
- Contains banned phrases: -1 per phrase (max -3)
- Em dashes or semicolons: -1
- Multiple CTAs: -1
- Markdown formatting: -1`

    const result = await llm.createMessage({
      system: 'You are a quality evaluator for B2B sales messages. Respond ONLY with valid JSON, no markdown, no backticks. Be strict and honest.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 800,
      temperature: 0.2,
      jsonMode: true,
    })

    if (!result.success) return null

    // Parse JSON from response (handle potential markdown wrapping)
    let jsonText = result.text.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }
    const parsed = JSON.parse(jsonText) as QualityCheckResult

    // Merge local detections (ensure they're not missed by LLM)
    if (localBannedFound.length > 0) {
      const existing = new Set((parsed.banned_words_found || []).map((w: string) => w.toLowerCase()))
      for (const phrase of localBannedFound) {
        if (!existing.has(phrase.toLowerCase())) {
          parsed.banned_words_found = [...(parsed.banned_words_found || []), phrase]
        }
      }
      parsed.has_cliches = true
    }
    if (localFormatViolations.some(v => v.includes('em dash'))) parsed.has_em_dashes = true
    if (localFormatViolations.some(v => v.includes('semicolon'))) parsed.has_semicolons = true
    if (localFormatViolations.some(v => v.includes('markdown'))) parsed.has_markdown = true

    return parsed
  } catch (err) {
    console.error('Quality check failed:', err)
    return null
  }
}

// ─── Main Handler ─────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  // 90-second timeout: covers research + up to 5 LLM calls (summary, generate, quality, rewrite, recheck)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90000)

  try {
    const startTime = Date.now()

    // ── Auth ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return errorResponse('Missing authorization header', 401)

    // ── Parse & validate request ──
    const body: AIGenerateRequest = await req.json()
    const {
      leadId,
      stepType,
      messageTemplate,
      researchPrompt,
      tone = 'professional',
      language = 'es',
      additionalUrls,
      postContext,
      exampleMessages,
      exampleNotes,
      senderPersona: requestPersona,
      objective,
      structure,
      writingPrinciples = [],
      antiPatterns = [],
      customInstructions,
      regenerateHint,
      useSignals: useSignalsParam,
      dayOffset,
      cadenceId,
      ssDeckUrl,
      sdrBcUrl,
      ownerId,
      orgId,
      llmProvider,
      llmModel,
    } = body

    const ctx = await getAuthContext(authHeader, { ownerId, orgId })
    if (!ctx) return errorResponse('Unauthorized', 401)
    const userId = ctx.userId

    if (!leadId) return errorResponse('leadId is required')
    if (!stepType) return errorResponse('stepType is required')
    const validStepTypes = ['linkedin_message', 'linkedin_connect', 'linkedin_comment', 'send_email', 'email_reply']
    if (!validStepTypes.includes(stepType)) {
      return errorResponse(`stepType must be one of: ${validStepTypes.join(', ')}`)
    }
    const isEmailStep = stepType === 'send_email' || stepType === 'email_reply'

    // ── Fetch lead from DB ──
    const supabase = createSupabaseClient()
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('org_id', ctx.orgId)
      .single()

    if (leadError || !lead) {
      return errorResponse('Lead not found', 404)
    }

    // ════════════════════════════════════════════════════════════════════
    // RESEARCH CACHE LOOKUP (migration 117)
    // Lazy cache: Day 1 fetches + saves; Day 3/5/7/9 read cache only.
    // TTLs: company 30d, person 14d, signals 7d.
    // ════════════════════════════════════════════════════════════════════
    const COMPANY_RESEARCH_TTL_MS = 30 * 24 * 60 * 60 * 1000
    const PERSON_RESEARCH_TTL_MS  = 14 * 24 * 60 * 60 * 1000
    const SIGNALS_TTL_MS          =  7 * 24 * 60 * 60 * 1000

    type LeadCache = {
      version?: number
      profile_summary?: {
        name: string; headline: string; company: string;
        location?: string; summary?: string;
        recentPosts: Array<{ text: string; date?: string }>
      }
      person_insights?: Array<{ title: string; snippet: string; url: string }>
      fetched_at?: string
    } | null

    type CompanyCache = {
      version?: number
      company_insights?: Array<{ title: string; snippet: string; url: string }>
      detected_signals?: DetectedSignal[]
      fetched_at?: string
      signals_refreshed_at?: string
    } | null

    const isCacheFresh = (refreshedAt: string | null | undefined, ttlMs: number): boolean => {
      if (!refreshedAt) return false
      const age = Date.now() - new Date(refreshedAt).getTime()
      return age < ttlMs
    }

    // Person cache (lead-scoped)
    const leadResearchCache: LeadCache = (lead.research_json && Object.keys(lead.research_json).length > 0)
      ? lead.research_json as LeadCache
      : null
    const personCacheFresh = isCacheFresh(lead.research_refreshed_at, PERSON_RESEARCH_TTL_MS)

    // Company cache: prefer direct FK on lead; fallback to prospects join by email
    let companyId: string | null = lead.account_map_company_id || null
    let companyCache: CompanyCache = null
    let companyResearchFresh = false
    let signalsFresh = false
    try {
      // Fallback: if FK not set, try prospect match by email
      if (!companyId && lead.email) {
        const { data: prospectRow } = await supabase
          .from('prospects')
          .select('company_id')
          .eq('org_id', ctx.orgId)
          .ilike('email', lead.email)
          .not('company_id', 'is', null)
          .limit(1)
          .maybeSingle()
        companyId = prospectRow?.company_id || null
        if (companyId) {
          // Backfill the FK so future lookups skip this fallback
          await supabase.from('leads').update({ account_map_company_id: companyId }).eq('id', leadId)
        }
      }

      if (companyId) {
        const { data: companyRow } = await supabase
          .from('account_map_companies')
          .select('research_json, research_refreshed_at, signals_refreshed_at')
          .eq('id', companyId)
          .maybeSingle()
        if (companyRow?.research_json && Object.keys(companyRow.research_json).length > 0) {
          companyCache = companyRow.research_json as CompanyCache
        }
        companyResearchFresh = isCacheFresh(companyRow?.research_refreshed_at, COMPANY_RESEARCH_TTL_MS)
        signalsFresh = isCacheFresh(companyRow?.signals_refreshed_at, SIGNALS_TTL_MS)
      }
    } catch (err) {
      console.warn('[research-cache] company cache lookup failed (non-fatal):', err)
    }

    console.log(`[research-cache] lead=${leadId.slice(0,8)} personFresh=${personCacheFresh} companyId=${companyId?.slice(0,8) ?? 'null'} companyFresh=${companyResearchFresh} signalsFresh=${signalsFresh}`)

    // ── Fetch sender persona from DB if not provided ──
    let senderPersona: SenderPersona | null = requestPersona || null
    if (!senderPersona) {
      const { data: personaData } = await supabase
        .from('sender_personas')
        .select('*')
        .eq('user_id', userId)
        .eq('org_id', ctx.orgId)
        .single()
      if (personaData && personaData.full_name) {
        senderPersona = personaData as SenderPersona
      }
    }

    // ── Get Unipile account ──
    const unipileAccountId = await getUnipileAccountId(userId)
    if (!unipileAccountId && !isEmailStep) {
      return errorResponse('No LinkedIn account connected. Please connect your LinkedIn in Settings.', 400)
    }

    // ── Initialize clients ──
    const unipile = createUnipileClient()
    let firecrawl: FirecrawlClient | null = null
    try {
      firecrawl = createFirecrawlClient()
    } catch {
      console.log('Firecrawl API key not configured, skipping web research')
    }

    // ── Extract LinkedIn username ──
    const linkedinUrl = lead.linkedin_url || ''
    const username = extractUsernameFromUrl(linkedinUrl)

    // ── Parallel data fetching (cache-aware) ──
    const researchStart = Date.now()
    const promises: Record<string, Promise<unknown>> = {}

    const firstName = lead.first_name || ''
    const lastName = lead.last_name || ''
    const company = lead.company || ''

    // PERSON: only fetch if cache is stale/missing
    if (!personCacheFresh && username && unipileAccountId) {
      promises.profile = unipile.getProfile(unipileAccountId, username)
      promises.posts = (async () => {
        const profileResult = await unipile.getProfile(unipileAccountId, username)
        if (profileResult.success && profileResult.data) {
          const profileData = profileResult.data as { provider_id?: string; id?: string }
          const uid = profileData.provider_id || profileData.id
          if (uid) return unipile.getUserPosts(unipileAccountId, uid, 5)
        }
        return { success: false, error: 'Could not get provider_id for posts' }
      })()
    }

    if (!personCacheFresh && firecrawl && firstName && lastName) {
      promises.firecrawlPerson = firecrawl.search(
        `"${firstName} ${lastName}" ${company} latest news announcements`,
        { limit: 5, tbs: 'qdr:y' }
      )
    }

    // COMPANY: only fetch if cache is stale/missing
    if (!companyResearchFresh && firecrawl && company) {
      promises.firecrawlCompany = firecrawl.search(
        `"${company}" recent news product launch funding partnership`,
        { limit: 5, tbs: 'qdr:y' }
      )
    }

    if (firecrawl && additionalUrls && additionalUrls.length > 0) {
      promises.firecrawlUrls = Promise.all(
        additionalUrls.map(url => firecrawl!.scrape(url, { formats: ['markdown'] }))
      )
    }

    // ── Wait for all results ──
    const keys = Object.keys(promises)
    const results = await Promise.allSettled(Object.values(promises))
    const settled: Record<string, { status: string; value?: unknown; reason?: unknown }> = {}
    keys.forEach((key, i) => {
      settled[key] = {
        status: results[i].status,
        value: results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<unknown>).value : undefined,
        reason: results[i].status === 'rejected' ? (results[i] as PromiseRejectedResult).reason : undefined,
      }
    })

    const researchTimeMs = Date.now() - researchStart

    // ── Process Unipile profile (merge cache + fresh) ──
    let profileSummary: ProfileSummary
    if (personCacheFresh && leadResearchCache?.profile_summary) {
      profileSummary = leadResearchCache.profile_summary as ProfileSummary
      console.log('[research-cache] HIT person profile (cache age OK)')
    } else {
      profileSummary = {
        name: `${firstName} ${lastName}`.trim() || 'Unknown',
        headline: lead.title || '',
        company: company,
        recentPosts: [],
      }

      if (settled.profile?.status === 'fulfilled') {
        const profileResult = settled.profile.value as { success: boolean; data?: Record<string, unknown> }
        if (profileResult?.success && profileResult.data) {
          const p = profileResult.data
          profileSummary.name = (p.name as string) || profileSummary.name
          profileSummary.headline = (p.headline as string) || profileSummary.headline
          profileSummary.location = p.location as string | undefined
          profileSummary.summary = p.about as string || p.summary as string || undefined
          if (!profileSummary.company && p.current_company) {
            profileSummary.company = p.current_company as string
          }
        }
      }

      if (settled.posts?.status === 'fulfilled') {
        const postsResult = settled.posts.value as { success: boolean; data?: { items?: Array<Record<string, unknown>> } }
        if (postsResult?.success && postsResult.data?.items) {
          profileSummary.recentPosts = postsResult.data.items
            .slice(0, 5)
            .map(post => ({ text: (post.text as string) || '', date: post.created_at as string | undefined }))
            .filter(post => post.text)
        }
      }
    }

    // ── Process Firecrawl results (cache + fresh merged) ──
    const webInsights: WebInsight[] = []
    let researchFailed = false
    const seenUrls = new Set<string>()
    // Track which slices come from fresh fetch (so we can save back to cache)
    let freshPersonInsights: WebInsight[] = []
    let freshCompanyInsights: WebInsight[] = []

    const collectFirecrawlSearch = (key: string, sink: WebInsight[]) => {
      if (settled[key]?.status === 'fulfilled') {
        const searchResult = settled[key].value as { success: boolean; data?: Array<{ url: string; title: string; description: string }> }
        if (searchResult?.success && searchResult.data) {
          for (const result of searchResult.data) {
            const snippet = truncate(result.description || '', 200)
            if (snippet) sink.push({ title: result.title || result.url, snippet, url: result.url })
          }
        }
      } else if (settled[key]?.status === 'rejected') {
        console.error(`Firecrawl ${key} failed:`, settled[key].reason)
        researchFailed = true
      }
    }

    // Person insights: from cache OR freshly fetched
    let personInsights: WebInsight[]
    if (personCacheFresh && leadResearchCache?.person_insights) {
      personInsights = leadResearchCache.person_insights as WebInsight[]
      console.log('[research-cache] HIT person insights')
    } else {
      collectFirecrawlSearch('firecrawlPerson', freshPersonInsights)
      personInsights = freshPersonInsights
    }
    for (const insight of personInsights) {
      if (seenUrls.has(insight.url)) continue
      seenUrls.add(insight.url)
      webInsights.push(insight)
    }

    // Company insights: from cache OR freshly fetched
    let companyInsights: WebInsight[]
    if (companyResearchFresh && companyCache?.company_insights) {
      companyInsights = companyCache.company_insights as WebInsight[]
      console.log('[research-cache] HIT company insights')
    } else {
      collectFirecrawlSearch('firecrawlCompany', freshCompanyInsights)
      companyInsights = freshCompanyInsights
    }
    for (const insight of companyInsights) {
      if (seenUrls.has(insight.url)) continue
      seenUrls.add(insight.url)
      webInsights.push(insight)
    }

    if (settled.firecrawlUrls?.status === 'fulfilled') {
      const scrapeResults = settled.firecrawlUrls.value as Array<{ success: boolean; data?: { markdown?: string; metadata?: Record<string, unknown> } }>
      for (let i = 0; i < scrapeResults.length; i++) {
        const result = scrapeResults[i]
        const url = additionalUrls![i]
        if (seenUrls.has(url)) continue
        seenUrls.add(url)
        if (result?.success && result.data?.markdown) {
          webInsights.push({ title: (result.data.metadata?.title as string) || url, snippet: truncate(result.data.markdown, 300), url })
        }
      }
    } else if (settled.firecrawlUrls?.status === 'rejected') {
      researchFailed = true
    }

    if (!firecrawl) researchFailed = true
    const finalInsights = webInsights.slice(0, 6)

    // ── Language: caller (process-queue) can force a specific language via the
    // language field (e.g. 'en' when ai_prompts.language = 'en'). When set,
    // we skip auto-detection. This was added so LATAM leads receive English
    // outreach (Yuno's brand voice) instead of auto-translated Spanish that
    // drifts away from prompt rules + Carlos rubrics.
    let languageConfig: LanguageConfig
    if (language && language === 'en') {
      languageConfig = {
        language: 'English',
        code: 'en',
        cultural_context: 'Global B2B SaaS — direct, value-prop forward, defendible numbers.',
        formality: 'professional-casual',
        greeting_style: 'First-name only, then comma + new line.',
      } as LanguageConfig
      console.log(`Language FORCED to English by caller (skipped auto-detect for location ${profileSummary.location || lead.location || 'unknown'})`)
    } else {
      languageConfig = detectLanguage(profileSummary.location || lead.location || null)
      console.log(`Language auto-detected: ${languageConfig.language} (${languageConfig.code}) from location: ${profileSummary.location || lead.location || 'unknown'}`)
    }
    const effectiveLanguage = languageConfig.code

    console.log(`Research complete: profile=${!!settled.profile}, posts=${profileSummary.recentPosts.length}, insights=${finalInsights.length}, persona=${!!senderPersona}`)

    // ── Fetch company research report if {{research}} is referenced in templates ──
    let companyResearchText = ''
    const templatesNeedResearch =
      (messageTemplate || '').includes('{{research}}') ||
      (researchPrompt || '').includes('{{research}}')

    if (templatesNeedResearch && company) {
      try {
        const { data: researchRow } = await supabase
          .from('research_project_companies')
          .select('research_summary, research_content, company_name')
          .eq('org_id', ctx.orgId)
          .eq('status', 'completed')
          .ilike('company_name', company.trim())
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (researchRow) {
          companyResearchText = researchRow.research_summary
            || truncate(researchRow.research_content || '', 3000)
          console.log(`Found company research for "${company}" (${companyResearchText.length} chars)`)
        } else {
          console.log(`No completed research found for company: "${company}"`)
          companyResearchText = '(No se encontró investigación disponible para esta empresa)'
        }
      } catch (err) {
        console.error('Failed to fetch company research (non-fatal):', err)
      }
    }

    // ── Template variable substitution ──
    const templateVars: Record<string, string> = {
      first_name: firstName, last_name: lastName, company,
      title: lead.title || '', email: lead.email || '', linkedin_url: linkedinUrl,
      industry: lead.industry || '', website: lead.website || '',
      department: lead.department || '', annual_revenue: lead.annual_revenue || '',
      company_linkedin_url: lead.company_linkedin_url || '',
      research: companyResearchText,
    }

    const resolvedMessageTemplate = messageTemplate ? substituteTemplateVariables(messageTemplate, templateVars) : null
    const resolvedResearchPrompt = researchPrompt ? substituteTemplateVariables(researchPrompt, templateVars) : null

    // ── LLM client ──
    const generationStart = Date.now()
    let llm
    try {
      if (llmProvider && llmModel) {
        llm = createLLMClient(llmProvider as 'anthropic' | 'openai', llmModel)
        console.log(`Using LLM override: ${llmProvider}/${llmModel}`)
      } else {
        llm = await createLLMClientForUser(userId)
      }
    } catch (err) {
      console.error('Failed to create LLM client:', err)
      return errorResponse('LLM API not configured', 500)
    }
    console.log(`Using LLM: ${llm.provider}/${llm.model}`)

    // ── Fetch user's signal configs + scan for signals (cache-aware) ──
    const useSignals = useSignalsParam !== false // default true
    let detectedSignals: DetectedSignal[] = []
    let signalsSearchTimeMs = 0
    let signalsFreshlyScanned = false

    if (!useSignals) {
      console.log('Signal scanning disabled by user')
    } else if (signalsFresh && companyCache?.detected_signals) {
      // CACHE HIT: signals scanned <7d ago, reuse
      detectedSignals = companyCache.detected_signals as DetectedSignal[]
      console.log(`[research-cache] HIT signals (${detectedSignals.length} cached signals)`)
    } else try {
      // Try user's saved configs first
      const { data: signalConfigRows } = await supabase
        .from('signal_configs')
        .select('*, signal_type:signal_types(*)')
        .eq('user_id', userId)
        .eq('org_id', ctx.orgId)
        .eq('enabled', true)

      let signalConfigs = (signalConfigRows || []) as unknown as SignalConfigWithType[]

      if (signalConfigs.length === 0) {
        const { data: defaultTypes } = await supabase
          .from('signal_types')
          .select('*')
          .eq('default_enabled', true)
          .order('sort_order', { ascending: true })

        if (defaultTypes && defaultTypes.length > 0) {
          signalConfigs = defaultTypes.map(st => ({
            id: '',
            user_id: userId,
            org_id: ctx.orgId,
            signal_type_id: st.id,
            enabled: true,
            priority: 5,
            custom_query: null,
            created_at: '',
            updated_at: '',
            signal_type: st,
          })) as unknown as SignalConfigWithType[]
          console.log(`Using ${signalConfigs.length} default signal types (user has no saved configs)`)
        }
      }

      if (signalConfigs.length > 0 && company) {
        console.log(`Scanning ${signalConfigs.length} enabled signals (cache stale or missing)...`)
        const scanResult = await scanSignals(
          signalConfigs,
          firecrawl,
          llm,
          {
            company,
            firstName,
            lastName,
            industry: lead.industry || '',
            linkedinPosts: profileSummary.recentPosts,
            profileSummary: profileSummary.summary || profileSummary.headline || '',
          },
        )
        detectedSignals = scanResult.signals
        signalsSearchTimeMs = scanResult.timeMs
        signalsFreshlyScanned = true
        console.log(`Signal scan complete: ${detectedSignals.length} signals detected in ${signalsSearchTimeMs}ms`)
      } else if (!company) {
        console.log('Skipping signal scan: no company data available')
      } else {
        console.log('No signal configs available, skipping signal scan')
      }
    } catch (err) {
      console.error('Signal scanning failed (non-fatal):', err)
    }

    // ════════════════════════════════════════════════════════════════════
    // PERSIST CACHE (fire and forget — don't block generation)
    // Save what we just freshly fetched. Cache hits skip the corresponding write.
    // ════════════════════════════════════════════════════════════════════
    const nowIso = new Date().toISOString()

    if (!personCacheFresh) {
      const personPayload = {
        version: 1,
        profile_summary: profileSummary,
        person_insights: freshPersonInsights,
        fetched_at: nowIso,
      }
      supabase
        .from('leads')
        .update({ research_json: personPayload, research_refreshed_at: nowIso })
        .eq('id', leadId)
        .then(({ error }: { error: unknown }) => {
          if (error) console.warn('[research-cache] failed to save person cache:', error)
          else console.log(`[research-cache] SAVED person cache for lead ${leadId.slice(0,8)}`)
        })
    }

    if (companyId && (!companyResearchFresh || signalsFreshlyScanned)) {
      const companyPayload: Record<string, unknown> = {
        version: 1,
        company_insights: companyResearchFresh
          ? (companyCache?.company_insights || [])
          : freshCompanyInsights,
        detected_signals: signalsFreshlyScanned
          ? detectedSignals
          : (companyCache?.detected_signals || []),
        fetched_at: companyResearchFresh
          ? (companyCache?.fetched_at || nowIso)
          : nowIso,
        signals_refreshed_at: signalsFreshlyScanned
          ? nowIso
          : (companyCache?.signals_refreshed_at || nowIso),
      }
      const updates: Record<string, unknown> = { research_json: companyPayload }
      if (!companyResearchFresh) updates.research_refreshed_at = nowIso
      if (signalsFreshlyScanned) updates.signals_refreshed_at = nowIso

      supabase
        .from('account_map_companies')
        .update(updates)
        .eq('id', companyId)
        .then(({ error }: { error: unknown }) => {
          if (error) console.warn('[research-cache] failed to save company cache:', error)
          else console.log(`[research-cache] SAVED company cache for company ${companyId!.slice(0,8)} (research=${!companyResearchFresh}, signals=${signalsFreshlyScanned})`)
        })
    }

    // ── Research summary (parallel with setup) ──
    const summaryParts: string[] = []
    summaryParts.push(`Name: ${profileSummary.name}`)
    summaryParts.push(`Title: ${profileSummary.headline}`)
    summaryParts.push(`Company: ${profileSummary.company}`)
    if (profileSummary.location) summaryParts.push(`Location: ${profileSummary.location}`)
    if (profileSummary.summary) summaryParts.push(`Bio: ${truncate(profileSummary.summary, 300)}`)
    if (profileSummary.recentPosts.length > 0) {
      summaryParts.push(`\nRecent Posts (${profileSummary.recentPosts.length}):`)
      for (const post of profileSummary.recentPosts.slice(0, 3)) {
        summaryParts.push(`- ${truncate(post.text, 200)}`)
      }
    }
    if (finalInsights.length > 0) {
      summaryParts.push(`\nWeb Sources (${finalInsights.length}):`)
      for (const insight of finalInsights) {
        summaryParts.push(`- ${insight.title}: ${truncate(insight.snippet, 150)}`)
      }
    }

    const researchSummarySystemPrompt = resolvedResearchPrompt
      ? `${resolvedResearchPrompt}\n\n## AVAILABLE DATA:\nYou will be provided with collected information about a B2B prospect including their LinkedIn profile, recent posts, and web sources. Use ONLY the provided data.\n\n## RULES:\n- Do NOT invent data. Only use what is provided.\n- Respond ONLY with the summary/analysis, no titles or prefixes.\n- Write the summary in English (it will be used as internal research context).`
      : `You are a B2B research analyst. Your job is to synthesize collected information about a prospect into a clear, useful executive summary.\n\nRules:\n- Write a 3-5 sentence summary highlighting the most relevant points for a B2B seller.\n- Mention: who the person is, their role, key company data, and any relevant recent news or activity.\n- If there are recent posts, briefly mention the topics they're interested in.\n- If there's company news (funding, partnerships, launches), highlight them.\n- Be concise and direct. Do NOT invent data.\n- Respond ONLY with the summary, no titles or prefixes.`

    // Generate research summary first, then use it in message generation
    const summaryResult = await llm.createMessage({
      system: researchSummarySystemPrompt,
      messages: [{ role: 'user', content: `Generate an executive summary of this prospect:\n\n${summaryParts.join('\n')}` }],
      maxTokens: 4096,
      temperature: 0.3,
    })
    const researchSummary = summaryResult.success ? summaryResult.text : null

    // For linkedin_comment: if no explicit postContext was provided, use the most recent fetched post
    const effectivePostContext = postContext ||
      (stepType === 'linkedin_comment' && profileSummary.recentPosts.length > 0
        ? profileSummary.recentPosts[0].text
        : undefined)

    if (stepType === 'linkedin_comment') {
      console.log(`linkedin_comment postContext: ${effectivePostContext ? `"${effectivePostContext.substring(0, 100)}..."` : 'none — comment will be generic'}`)

      // ════════════════════════════════════════════════════════════════
      // V10 (2026-05-18): BLACKLIST-ONLY POST-RELEVANCE GATE
      //
      // History: V9 used a whitelist of "company news" patterns and a
      // blacklist of "personal/hiring" patterns; if a post didn't match
      // the whitelist it was skipped. That over-rejected: 19/22 SKIPs
      // on 2026-05-14/15 hit `not_company_news` for posts that were
      // genuinely commentable (case studies, quarterly results, product
      // launches phrased differently, Spanish business news, etc.).
      //
      // V10 inverts the gate: we only skip on explicit personal /
      // hiring / condolence / dead-end patterns (EN + ES). Everything
      // else passes to the LLM, which is responsible for producing a
      // 1-4 word reaction OR signalling SKIP_COMMENT when nothing
      // meaningful can be said. The fallback handler below upgrades a
      // literal "SKIP_COMMENT" from the LLM into the structured skip
      // signal that process-queue already understands.
      // ════════════════════════════════════════════════════════════════
      const skipPatterns: RegExp[] = [
        // --- English hiring / role announcements ---
        /\bi'?m\s+hiring\b/i,
        /\b(we'?re|i'?m)\s+(hiring|looking\s+for)\b/i,
        /\bjoin\s+(my|our)\s+team\b/i,
        /\bnew\s+role\s+alert\b/i,
        /\b(apply(ing)?|application)\s+(here|now|today|via|by)\b/i,
        /\b(open|hiring|new)\s+(position|role|vacancy|vacancies|opening)s?\b/i,
        /\b(hiring|seeking)\s+(a|an)\s+\w+/i,                       // "Hiring a Staff Product Manager"
        /\bcheck\s+out\s+this\s+job\b/i,
        /\bsenior\s+(associate|manager|analyst|director|engineer)\s+role\b/i,
        // --- English personal career posts ---
        /\bi'?m\s+(starting|happy\s+to\s+share\s+i'?m\s+starting)\s+a\s+new\s+(position|role|chapter)\b/i,
        /\bafter\s+\d+\s+(amazing\s+)?(years?|months?)\s+at\b/i,
        /\bover\s+\d+\s+years?\s+at\s+\w+/i,
        /\bexcited\s+to\s+(announce|share)\s+(my|i\s+(am|will|have))\b/i,
        // --- English personal life events / condolences ---
        /\b(rest\s+in\s+peace|passed\s+away|in\s+loving\s+memory|rip\b)/i,
        /\b(my\s+(birthday|anniversary|wedding|baby))\b/i,
        // --- Spanish hiring / role announcements ---
        /\b(estamos|seguimos)\s+(buscando|contratando|en\s+(la\s+)?b[úu]squeda)\b/i,
        /\bbuscamos\s+(un|una|a)\s+/i,
        /\b(se\s+busca|se\s+necesita)\s+/i,
        /\b(abrimos|hay)\s+(una\s+)?(vacante|posici[óo]n|puesto)\b/i,
        /\b¡?(¿)?te\s+(apasiona|gustar[íi]a|interesa)\b.{0,40}(postula|apl[íi]ca|env[íi]a\s+tu\s+cv|p[óo]stulate)\b/i,
        /\bpostula(te|r)?\s+(aqu[íi]|ahora|hoy)\b/i,
        // --- Spanish personal career announcements ---
        /\b(empiezo|comienzo|inicio)\s+(una\s+)?(nueva\s+(etapa|posici[óo]n|aventura))\b/i,
        /\b(tras|despu[ée]s\s+de)\s+\d+\s+(a[ñn]os|meses)\s+en\b/i,
        // --- Spanish life events / condolences ---
        /\b(descanse\s+en\s+paz|q\.?e\.?p\.?d\.?|fallecimiento|en\s+memoria\s+de)\b/i,
      ]

      const postLower = (effectivePostContext || '').toLowerCase()
      const matchedSkip = skipPatterns.find(p => p.test(postLower))

      let skipReason: string | null = null
      if (!effectivePostContext || effectivePostContext.length < 30) skipReason = 'no_post_or_too_short'
      else if (matchedSkip) skipReason = 'personal_or_hiring_post'

      if (skipReason) {
        console.log(`[linkedin_comment] DETERMINISTIC SKIP: ${skipReason}`)
        return jsonResponse({
          success: true,
          generatedSubject: null,
          generatedMessage: 'SKIP_COMMENT',
          deterministic_skip: true,
          skip_reason: skipReason,
          post_preview: (effectivePostContext || '').slice(0, 120),
          metadata: { totalTimeMs: Date.now() - researchStart, deterministicSkipped: true },
        })
      }
      console.log(`[linkedin_comment] post relevance OK — proceeding to LLM`)
    }

    // ── Build user prompt with language context ──
    // Pull deep intelligence from companyCache if present (migration 121)
    const companyIntelligence = (companyCache as Record<string, unknown> | null)?.intelligence as Record<string, unknown> | undefined

    // V15: query PRIOR TOUCHES for narrative-arc context. Only relevant for
    // value-bearing steps (Day 1/3/5/7/9), and only when caller passes
    // cadenceId + dayOffset (process-queue does this; manual tests may not).
    let priorTouches: Array<{ day_offset: number; step_type: string; subject: string | null; message: string }> = []
    if (cadenceId && dayOffset != null && dayOffset > 0) {
      try {
        const { data: priorRows } = await supabase
          .from('message_qa_reviews')
          .select('day_offset, step_type, generated_subject, generated_message, status, decided_at, created_at')
          .eq('lead_id', leadId)
          .eq('cadence_id', cadenceId)
          .lt('day_offset', dayOffset)
          .in('status', ['approved', 'auto_approved', 'auto_passed', 'sent', 'regenerated'])
          .order('day_offset', { ascending: true })
        if (priorRows) {
          // Dedupe per day_offset, keep the most recent decided
          const byDay = new Map<number, typeof priorRows[number]>()
          for (const r of priorRows) {
            const existing = byDay.get(r.day_offset)
            const rTime = new Date(r.decided_at || r.created_at).getTime()
            const eTime = existing ? new Date(existing.decided_at || existing.created_at).getTime() : 0
            if (!existing || rTime > eTime) byDay.set(r.day_offset, r)
          }
          priorTouches = Array.from(byDay.values()).map(r => ({
            day_offset: r.day_offset, step_type: r.step_type,
            subject: r.generated_subject, message: r.generated_message || '',
          }))
          if (priorTouches.length > 0) {
            console.log(`[v15-narrative-arc] Found ${priorTouches.length} prior touches for lead=${leadId.slice(0,8)} cadence=${cadenceId.slice(0,8)}: days [${priorTouches.map(t => t.day_offset).join(',')}]`)
          }
        }
      } catch (ptErr) {
        console.warn(`[v15-narrative-arc] Failed to query prior touches:`, ptErr)
      }
    }

    const userPrompt = buildUserPromptV2({
      senderPersona,
      profile: profileSummary,
      insights: finalInsights,
      researchSummary,
      stepType,
      language: effectiveLanguage,
      languageConfig,
      objective: objective || null,
      structure: structure || null,
      writingPrinciples,
      antiPatterns,
      customPrompt: resolvedMessageTemplate || null,
      customInstructions: customInstructions || null,
      exampleMessages,
      exampleNotes,
      postContext: effectivePostContext,
      regenerateHint,
      detectedSignals,
      companyIntelligence: companyIntelligence || null,
      dayOffset,
      priorTouches,
      ssDeckUrl: ssDeckUrl || null,
      sdrBcUrl: sdrBcUrl || null,
    })

    const maxTokens = stepType === 'linkedin_connect' ? 200 : stepType === 'linkedin_comment' ? 400 : isEmailStep ? 800 : 600

    // ── Generate message ──
    const aiResult = await llm.createMessage({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens,
      temperature: 0.7,
    })

    if (!aiResult.success) {
      console.error('LLM generation failed:', aiResult.error)
      await logActivity({ ownerId: userId, orgId: ctx.orgId, leadId, action: 'ai_generate_message', status: 'failed', details: { error: aiResult.error, stepType } })
      return errorResponse(`Message generation failed: ${aiResult.error}`, 500)
    }

    let generatedMessage = aiResult.text
    const generationTimeMs = Date.now() - generationStart

    // V10 (2026-05-18): linkedin_comment LLM output handler.
    //
    // Two distinct cases:
    //   a) LLM explicitly returned SKIP_COMMENT  → respect it; emit the
    //      structured deterministic_skip signal so process-queue skips
    //      the step instead of posting anything. The LLM has actual
    //      context the gate doesn't (e.g. "post is just emojis", "all
    //      hashtags", "thanking someone for a gift").
    //   b) LLM returned a refusal, too short, or too long  → salvage
    //      with a 1-4 word generic reaction picked from post keywords.
    //      A noisy LLM is recoverable; explicit skip is not.
    if (stepType === 'linkedin_comment') {
      const trimmedMsg = (generatedMessage || '').trim()
      const llmExplicitSkip = /^\s*SKIP_COMMENT\s*$/i.test(trimmedMsg)
      if (llmExplicitSkip) {
        console.log(`[linkedin_comment] LLM explicit SKIP_COMMENT → propagating skip signal`)
        return jsonResponse({
          success: true,
          generatedSubject: null,
          generatedMessage: 'SKIP_COMMENT',
          deterministic_skip: true,
          skip_reason: 'llm_chose_skip',
          post_preview: (effectivePostContext || '').slice(0, 120),
          metadata: { totalTimeMs: Date.now() - researchStart, llmExplicitSkip: true },
        })
      }
      const isRecoverable = /SKIP_COMMENT/i.test(trimmedMsg) ||  // SKIP_COMMENT embedded in surrounding text
                            /^(i\s+(can'?t|cannot|will\s+not|should\s+not))/i.test(trimmedMsg) ||
                            /^(unable\s+to|sorry,?\s+i)/i.test(trimmedMsg) ||
                            trimmedMsg.length < 2 ||
                            trimmedMsg.length > 120
      console.log(`[linkedin_comment] LLM returned: "${trimmedMsg.slice(0, 100)}" | recoverable=${isRecoverable}`)
      if (isRecoverable) {
        const postLower = (effectivePostContext || '').toLowerCase()
        let fallback = 'Big move.'
        if (/\b(acquir|merge|joining|integrat)/i.test(postLower)) fallback = 'Long time coming.'
        else if (/\b(funding|raised|series\s+[a-d]|round|\$\d|m\s+led\s+by)/i.test(postLower)) fallback = 'Bold round.'
        else if (/\b(launch|introducing|new\s+(product|feature)|is\s+now\s+live)/i.test(postLower)) fallback = 'Bold.'
        else if (/\bpartnership\s+with\s+|official\s+(sponsor|partner)/i.test(postLower)) fallback = 'Smart partnership.'
        else if (/\bexpand|nationwide\s+(rollout|expansion)/i.test(postLower)) fallback = 'Big expansion.'
        else if (/\baward|recogniz|number\s+\d/i.test(postLower)) fallback = 'Earned it.'
        else if (/\b(strong\s+performance|excellent\s+(start|quarter)|record\s+(quarter|year))/i.test(postLower)) fallback = 'Strong quarter.'
        else if (/\bcase\s+stud|success\s+stor/i.test(postLower)) fallback = 'Great case.'
        else if (/\bwelcome\s+\w+/i.test(postLower)) fallback = 'Strong hire.'
        console.log(`[linkedin_comment] FALLBACK applied (was "${trimmedMsg.slice(0,50)}", now "${fallback}")`)
        generatedMessage = fallback
      }
    }

    // ── Extract subject line ──
    let generatedSubject: string | null = null
    const subjectMatch = generatedMessage.match(/^SUBJECT:\s*(.+?)(?:\n|$)/i)
    if (subjectMatch) {
      generatedSubject = subjectMatch[1].trim()
      generatedMessage = generatedMessage.replace(/^SUBJECT:\s*.+\n*/i, '').trim()
    }
    if (!isEmailStep) generatedSubject = null

    // ── LAYER 5: Quality Check ──
    const maxLengthForCheck = stepType === 'linkedin_connect' ? 300
      : stepType === 'linkedin_comment' ? 800
      : isEmailStep ? 2000 : 1200

    let qualityCheck: QualityCheckResult | null = null
    try {
      // V9b: Skip quality check for linkedin_comment — it's 1-4 words binary,
      // quality check would re-generate the fallback we just applied.
      if (stepType === 'linkedin_comment') {
        console.log('[linkedin_comment] skipping quality check (1-4w binary, fallback already applied)')
        qualityCheck = null
      } else {
        qualityCheck = await runQualityCheck(llm, generatedMessage, antiPatterns, maxLengthForCheck, effectiveLanguage)
      }

      // If score < 7, regenerate with detailed feedback
      if (qualityCheck && qualityCheck.human_score < 7) {
        console.log(`Quality check score ${qualityCheck.human_score}/10, regenerating with feedback...`)

        // Build detailed feedback for the rewrite
        const feedbackParts: string[] = []
        feedbackParts.push(`## QUALITY CORRECTION`)
        feedbackParts.push(`The previous message scored ${qualityCheck.human_score}/10. Rewrite it fixing ALL issues below.`)

        if (!qualityCheck.language_correct) {
          feedbackParts.push(`CRITICAL: Wrong language detected (${qualityCheck.language_detected}). The message MUST be entirely in ${languageConfig.language}.`)
        }
        if (qualityCheck.has_mixed_languages) {
          feedbackParts.push(`CRITICAL: Mixed languages detected. Write ONLY in ${languageConfig.language}, not a single word in another language.`)
        }
        if (qualityCheck.opens_with_self_intro) {
          feedbackParts.push(`FIX: Message opens with self-introduction. Start with something about THEM, not about you.`)
        }
        if (qualityCheck.multiple_ctas) {
          feedbackParts.push(`FIX: Multiple CTAs/questions detected. Use only ONE question or soft CTA at the end.`)
        }
        if (qualityCheck.banned_words_found && qualityCheck.banned_words_found.length > 0) {
          feedbackParts.push(`FIX: Remove these banned words/phrases: ${qualityCheck.banned_words_found.join(', ')}`)
        }
        if (qualityCheck.cliche_phrases.length > 0) {
          feedbackParts.push(`FIX: Remove these cliche phrases: ${qualityCheck.cliche_phrases.join(', ')}`)
        }
        if (qualityCheck.has_em_dashes) {
          feedbackParts.push(`FIX: Remove all em dashes (—). Use commas, periods, or parentheses instead.`)
        }
        if (qualityCheck.has_semicolons) {
          feedbackParts.push(`FIX: Remove all semicolons (;). Use shorter sentences or commas.`)
        }
        if (qualityCheck.has_markdown) {
          feedbackParts.push(`FIX: Remove all markdown formatting. No **bold**, no *italic*, no #headers.`)
        }
        if (qualityCheck.exceeds_length) {
          feedbackParts.push(`FIX: Message exceeds ${maxLengthForCheck} character limit. Make it shorter.`)
        }
        if (qualityCheck.issues.length > 0) {
          feedbackParts.push(`Other issues: ${qualityCheck.issues.join('; ')}`)
        }
        if (qualityCheck.suggestion) {
          feedbackParts.push(`Suggestion: ${qualityCheck.suggestion}`)
        }
        feedbackParts.push(`\nRewrite the message fixing ALL the above issues. It must sound natural, human, and conversational.`)

        const regenPrompt = `${userPrompt}\n\n${feedbackParts.join('\n')}`

        const regenResult = await llm.createMessage({
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: regenPrompt }],
          maxTokens,
          temperature: 0.8,
        })

        if (regenResult.success) {
          generatedMessage = regenResult.text
          // Re-extract subject if needed
          const regenSubjectMatch = generatedMessage.match(/^SUBJECT:\s*(.+?)(?:\n|$)/i)
          if (regenSubjectMatch) {
            generatedSubject = isEmailStep ? regenSubjectMatch[1].trim() : null
            generatedMessage = generatedMessage.replace(/^SUBJECT:\s*.+\n*/i, '').trim()
          }

          // Re-run quality check on improved version
          const recheck = await runQualityCheck(llm, generatedMessage, antiPatterns, maxLengthForCheck, effectiveLanguage)
          if (recheck) qualityCheck = recheck
        }
      }
    } catch (err) {
      console.error('Quality check error:', err)
    }

    // ── Log success ──
    await logActivity({
      ownerId: userId,
      orgId: ctx.orgId,
      leadId,
      action: 'ai_generate_message',
      status: 'ok',
      details: {
        stepType, tone, language: effectiveLanguage,
        detectedLanguage: languageConfig.language,
        insightsCount: finalInsights.length,
        researchFailed, researchTimeMs, generationTimeMs,
        humanScore: qualityCheck?.human_score || null,
        hasSenderPersona: !!senderPersona,
        signalsDetected: detectedSignals.length,
        signalsSearchTimeMs,
      },
    })

    clearTimeout(timeout)

    // V17: HARD POST-PROCESS — strip em dashes + tildes from output (user
    // mandate 2026-05-11: "totalmente prohibido"). Even if the prompt + Carlos
    // miss them, this guarantees they never reach the recipient.
    const sanitizeTypography = (s: string | null | undefined): string => {
      if (!s) return s as string
      return s
        .replace(/\s*—\s*/g, ', ')   // em-dash → comma + space (preserves flow)
        .replace(/\s*–\s*/g, ', ')   // en-dash → comma
        .replace(/~\s*/g, 'around ') // tilde → "around"
        .replace(/[‘’]/g, "'")        // curly apostrophes → straight
        .replace(/[“”]/g, '"')        // curly quotes → straight
        .replace(/…/g, '...')         // ellipsis → three periods
    }

    // V17b: word-level vocabulary swap for the most common AI-tells that have
    // unambiguous casual equivalents. Carlos still rejects + regenerates for
    // the broader banned list, but these one-word swaps are 100% safe and
    // guarantee the user never sees them.
    const sanitizeVocabulary = (s: string | null | undefined): string => {
      if (!s) return s as string
      const swaps: Array<[RegExp, string]> = [
        [/\bincumbent\b/gi, 'current'],
        [/\bincumbents\b/gi, 'current providers'],
        [/\butilize\b/g, 'use'],
        [/\bUtilize\b/g, 'Use'],
        [/\butilizes\b/g, 'uses'],
        [/\butilizing\b/g, 'using'],
        [/\bcommence\b/g, 'start'],
        [/\bCommence\b/g, 'Start'],
        [/\bcommences\b/g, 'starts'],
        [/\bterminate\b/g, 'end'],
        [/\bterminates\b/g, 'ends'],
        [/\bascertain\b/g, 'find out'],
        [/\bAscertain\b/g, 'Find out'],
        [/\bexpedite\b/g, 'speed up'],
        [/\bExpedite\b/g, 'Speed up'],
        [/\bfacilitate\b/g, 'make easier'],
        [/\bFacilitate\b/g, 'Make easier'],
        [/\bsubsequent\b/gi, 'next'],
        [/\baforementioned\b/gi, 'above'],
        [/\bheretofore\b/gi, 'until now'],
        [/\bhitherto\b/gi, 'until now'],
      ]
      let out = s
      for (const [r, rep] of swaps) out = out.replace(r, rep)
      return out
    }
    generatedMessage = sanitizeVocabulary(sanitizeTypography(generatedMessage))
    generatedSubject = sanitizeVocabulary(sanitizeTypography(generatedSubject))

    return jsonResponse({
      success: true,
      generatedMessage,
      generatedSubject,
      research: {
        profileSummary,
        webInsights: finalInsights,
        researchFailed,
        researchSummary,
      },
      qualityCheck: qualityCheck ? {
        humanScore: qualityCheck.human_score,
        issues: qualityCheck.issues,
        suggestion: qualityCheck.suggestion,
        hasCliches: qualityCheck.has_cliches,
        languageCorrect: qualityCheck.language_correct ?? true,
        languageDetected: qualityCheck.language_detected ?? languageConfig.language,
        bannedWordsFound: qualityCheck.banned_words_found ?? [],
        formatIssues: {
          hasEmDashes: qualityCheck.has_em_dashes ?? false,
          hasSemicolons: qualityCheck.has_semicolons ?? false,
          hasMarkdown: qualityCheck.has_markdown ?? false,
        },
        hasMixedLanguages: qualityCheck.has_mixed_languages ?? false,
        opensWithSelfIntro: qualityCheck.opens_with_self_intro ?? false,
        multipleCtas: qualityCheck.multiple_ctas ?? false,
      } : null,
      detectedSignals: detectedSignals.length > 0 ? detectedSignals : undefined,
      detectedLanguage: {
        language: languageConfig.language,
        code: languageConfig.code,
        formality: languageConfig.formality,
      },
      metadata: {
        researchTimeMs,
        generationTimeMs,
        totalTimeMs: Date.now() - startTime,
        totalInsights: finalInsights.length,
        signalsSearchTimeMs: signalsSearchTimeMs || undefined,
        sourcesUsed: [
          ...(settled.profile?.status === 'fulfilled' ? ['unipile_profile'] : []),
          ...(profileSummary.recentPosts.length > 0 ? ['unipile_posts'] : []),
          ...(finalInsights.length > 0 ? ['firecrawl_search'] : []),
          ...(detectedSignals.length > 0 ? ['signal_scan'] : []),
        ],
      },
    })
  } catch (error) {
    clearTimeout(timeout)

    if (error instanceof DOMException && error.name === 'AbortError') {
      console.error('AI research pipeline timed out (90s)')
      return errorResponse('Research pipeline timed out. Please try again.', 504)
    }

    console.error('AI research generate error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500)
  }
})
