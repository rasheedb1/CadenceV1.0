import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient, getAuthContext, getUnipileAccountId, logActivity } from '../_shared/supabase.ts'
import { createUnipileClient } from '../_shared/unipile.ts'
import { createFirecrawlClient, type FirecrawlClient } from '../_shared/firecrawl.ts'
import { createLLMClientForUser } from '../_shared/llm.ts'
import { detectLanguage, type LanguageConfig } from '../_shared/language-detection.ts'
import { GLOBAL_ANTI_PATTERNS, getBannedPhrasesForLanguage, findBannedPhrases, findFormatViolations, buildAntiPatternsPromptSection } from '../_shared/anti-patterns.ts'

// ─── Types ────────────────────────────────────────────────────────

interface AIGenerateRequest {
  leadId: string
  stepType: 'linkedin_message' | 'linkedin_connect' | 'linkedin_comment' | 'send_email'
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
  ownerId?: string
  orgId?: string
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
}): string {
  const {
    senderPersona, profile, insights, researchSummary, stepType, language,
    languageConfig, objective, structure, writingPrinciples, antiPatterns,
    customPrompt, customInstructions, exampleMessages, exampleNotes,
    postContext, regenerateHint,
  } = params

  const isEmail = stepType === 'send_email'
  const parts: string[] = []

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

  // ── SECTION 3: Research Data ──
  parts.push(`## PROSPECT RESEARCH
Company: ${profile.company}
Contact: ${profile.name}, ${profile.headline}
${profile.location ? `Location: ${profile.location}` : ''}
${profile.summary ? `Bio: ${truncate(profile.summary, 500)}` : ''}`)

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
      ownerId,
      orgId,
    } = body

    const ctx = await getAuthContext(authHeader, { ownerId, orgId })
    if (!ctx) return errorResponse('Unauthorized', 401)
    const userId = ctx.userId

    if (!leadId) return errorResponse('leadId is required')
    if (!stepType) return errorResponse('stepType is required')
    const validStepTypes = ['linkedin_message', 'linkedin_connect', 'linkedin_comment', 'send_email']
    if (!validStepTypes.includes(stepType)) {
      return errorResponse(`stepType must be one of: ${validStepTypes.join(', ')}`)
    }
    const isEmailStep = stepType === 'send_email'

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

    // ── Parallel data fetching ──
    const researchStart = Date.now()
    const promises: Record<string, Promise<unknown>> = {}

    if (username && unipileAccountId) {
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

    const firstName = lead.first_name || ''
    const lastName = lead.last_name || ''
    const company = lead.company || ''

    if (firecrawl && (firstName || company)) {
      if (firstName && lastName) {
        promises.firecrawlPerson = firecrawl.search(
          `"${firstName} ${lastName}" ${company} latest news announcements`,
          { limit: 5, tbs: 'qdr:y' }
        )
      }
      if (company) {
        promises.firecrawlCompany = firecrawl.search(
          `"${company}" recent news product launch funding partnership`,
          { limit: 5, tbs: 'qdr:y' }
        )
      }
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

    // ── Process Unipile profile ──
    const profileSummary: ProfileSummary = {
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

    // ── Process Firecrawl results ──
    const webInsights: WebInsight[] = []
    let researchFailed = false
    const seenUrls = new Set<string>()

    const processFirecrawlSearchResult = (key: string) => {
      if (settled[key]?.status === 'fulfilled') {
        const searchResult = settled[key].value as { success: boolean; data?: Array<{ url: string; title: string; description: string }> }
        if (searchResult?.success && searchResult.data) {
          for (const result of searchResult.data) {
            if (seenUrls.has(result.url)) continue
            seenUrls.add(result.url)
            const snippet = truncate(result.description || '', 200)
            if (snippet) {
              webInsights.push({ title: result.title || result.url, snippet, url: result.url })
            }
          }
        }
      } else if (settled[key]?.status === 'rejected') {
        console.error(`Firecrawl ${key} failed:`, settled[key].reason)
        researchFailed = true
      }
    }

    if (promises.firecrawlPerson) processFirecrawlSearchResult('firecrawlPerson')
    if (promises.firecrawlCompany) processFirecrawlSearchResult('firecrawlCompany')

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

    // ── Auto-detect language from LinkedIn location ──
    const languageConfig = detectLanguage(profileSummary.location || lead.location || null)
    const effectiveLanguage = languageConfig.code
    console.log(`Language detected: ${languageConfig.language} (${languageConfig.code}) from location: ${profileSummary.location || lead.location || 'unknown'}`)

    console.log(`Research complete: profile=${!!settled.profile}, posts=${profileSummary.recentPosts.length}, insights=${finalInsights.length}, persona=${!!senderPersona}`)

    // ── Template variable substitution ──
    const templateVars: Record<string, string> = {
      first_name: firstName, last_name: lastName, company,
      title: lead.title || '', email: lead.email || '', linkedin_url: linkedinUrl,
      industry: lead.industry || '', website: lead.website || '',
      department: lead.department || '', annual_revenue: lead.annual_revenue || '',
      company_linkedin_url: lead.company_linkedin_url || '',
    }

    const resolvedMessageTemplate = messageTemplate ? substituteTemplateVariables(messageTemplate, templateVars) : null
    const resolvedResearchPrompt = researchPrompt ? substituteTemplateVariables(researchPrompt, templateVars) : null

    // ── LLM client ──
    const generationStart = Date.now()
    let llm
    try {
      llm = await createLLMClientForUser(userId)
    } catch (err) {
      console.error('Failed to create LLM client:', err)
      return errorResponse('LLM API not configured', 500)
    }
    console.log(`Using LLM: ${llm.provider}/${llm.model}`)

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

    // ── Build user prompt with language context ──
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
      postContext,
      regenerateHint,
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
      qualityCheck = await runQualityCheck(llm, generatedMessage, antiPatterns, maxLengthForCheck, effectiveLanguage)

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
      },
    })

    clearTimeout(timeout)

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
        sourcesUsed: [
          ...(settled.profile?.status === 'fulfilled' ? ['unipile_profile'] : []),
          ...(profileSummary.recentPosts.length > 0 ? ['unipile_posts'] : []),
          ...(finalInsights.length > 0 ? ['firecrawl_search'] : []),
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
