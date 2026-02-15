import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createSupabaseClient, getAuthUser, getUnipileAccountId, logActivity } from '../_shared/supabase.ts'
import { createUnipileClient } from '../_shared/unipile.ts'
import { createExaClient } from '../_shared/exa.ts'
import { createAnthropicClient } from '../_shared/anthropic.ts'

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
  ownerId?: string // For service-role calls from process-queue
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

function buildExamplesBlock(exampleMessages?: string[]): string {
  if (!exampleMessages || exampleMessages.length === 0) return ''
  const examples = exampleMessages
    .map((msg, i) => `Ejemplo ${i + 1}:\n${msg}`)
    .join('\n\n')
  return `\n\n## MENSAJES DE REFERENCIA (usa como inspiracion para tono y estructura, NO copies literalmente):\n${examples}`
}

function buildSystemPrompt(stepType: string, tone: string, language: string, customPrompt?: string, exampleMessages?: string[]): string {
  const toneDescriptions: Record<string, string> = {
    professional: 'profesional y directo, pero humano',
    casual: 'casual y conversacional, como hablar con un colega',
    friendly: 'amigable y cercano, con entusiasmo genuino',
  }

  const toneDesc = toneDescriptions[tone] || toneDescriptions.professional

  const isEmail = stepType === 'send_email'

  // If a custom prompt (from AI Prompts page) is provided, use it as the main instructions
  if (customPrompt) {
    return `Eres un experto en ventas B2B y copywriting de outreach${isEmail ? ' por email' : ' para LinkedIn'}.
Tu tono debe ser: ${toneDesc}.
Idioma de respuesta: ${language}.

## INSTRUCCIONES DEL USUARIO (seguir estrictamente):
${customPrompt}
${buildExamplesBlock(exampleMessages)}
## REGLAS DE SEGURIDAD (siempre aplican):
- NUNCA inventes datos. Solo usa la información proporcionada en el perfil e insights.
- Si no hay suficiente información para personalizar, genera un mensaje basado en el rol y empresa.
- Responde SOLO con el texto del mensaje, sin explicaciones ni alternativas.
- No uses comillas alrededor del mensaje.
${stepType === 'linkedin_connect' ? '- MÁXIMO 300 caracteres (límite estricto de LinkedIn para notas de conexión).' : ''}
${isEmail ? '- FORMATO OBLIGATORIO: La primera línea DEBE ser "SUBJECT: [línea de asunto]" seguida de una línea vacía y luego el cuerpo del email.' : ''}`
  }

  // Default step-type rules when no custom prompt
  const stepRules: Record<string, string> = {
    linkedin_message: `Genera un mensaje de LinkedIn (DM/InMail) personalizado.
- Máximo 200 palabras
- Abre con una referencia específica a algo reciente del prospecto
- Incluye un CTA claro pero no agresivo (ej: llamada de 15 min, compartir recurso)
- NO incluyas saludos genéricos como "Hola [Nombre]," — ve directo al punto personalizado
- NO incluyas tu nombre ni firma al final`,

    linkedin_connect: `Genera una nota de conexión de LinkedIn.
- Máximo 300 caracteres (esto es CRÍTICO, LinkedIn lo limita estrictamente)
- Debe ser muy concisa y directa
- Menciona UN punto específico de conexión
- NO incluyas CTA ni preguntas — solo la razón para conectar
- NO incluyas saludos ni firma`,

    linkedin_comment: `Genera un comentario para un post de LinkedIn.
- Máximo 150 palabras
- Debe ser un aporte genuino y relevante al tema del post
- Agrega valor con una perspectiva o dato complementario
- NO seas genérico (nada de "Great post!" o "Totalmente de acuerdo")
- Suena como alguien que realmente leyó y pensó sobre el post`,

    send_email: `Genera un email de ventas personalizado.
- FORMATO OBLIGATORIO: La primera línea DEBE ser "SUBJECT: [línea de asunto]" seguida de una línea vacía y luego el cuerpo
- La línea de asunto debe ser corta (max 60 caracteres), atractiva y personalizada
- El cuerpo del email debe tener máximo 300 palabras
- Usa párrafos cortos separados por líneas vacías para buena legibilidad
- Abre con una referencia específica al prospecto o su empresa
- Incluye un CTA claro (llamada, demo, reunión)
- Cierra con una firma profesional simple (nombre, cargo)
- NO uses líneas de asunto genéricas como "Propuesta" o "Oportunidad"
- NO incluyas placeholders como [Tu nombre] o [Empresa] — deja la firma con datos reales o genéricos`,
  }

  return `Eres un experto en ventas B2B y copywriting de outreach${isEmail ? ' por email' : ' para LinkedIn'}.
Tu tono debe ser: ${toneDesc}.
Idioma de respuesta: ${language}.

${stepRules[stepType] || (isEmail ? stepRules.send_email : stepRules.linkedin_message)}
${buildExamplesBlock(exampleMessages)}
REGLAS GENERALES:
- NUNCA inventes datos. Solo usa la información proporcionada en el perfil e insights.
- Si no hay suficiente información para personalizar, genera un mensaje basado en el rol y empresa.
- Responde SOLO con el texto del mensaje, sin explicaciones ni alternativas.
- No uses comillas alrededor del mensaje.`
}

function buildUserPrompt(
  profile: ProfileSummary,
  insights: WebInsight[],
  stepType: string,
  postContext?: string
): string {
  let prompt = `## Perfil del prospecto:
- Nombre: ${profile.name}
- Headline: ${profile.headline}
- Empresa: ${profile.company}
${profile.location ? `- Ubicación: ${profile.location}` : ''}
${profile.summary ? `- About: ${truncate(profile.summary, 500)}` : ''}`

  if (profile.recentPosts.length > 0) {
    prompt += `\n\n## Posts recientes del prospecto:`
    for (const post of profile.recentPosts.slice(0, 3)) {
      prompt += `\n- ${post.date ? `[${post.date}] ` : ''}${truncate(post.text, 300)}`
    }
  }

  if (insights.length > 0) {
    prompt += `\n\n## Insights de research web:`
    for (const insight of insights) {
      prompt += `\n- ${insight.title}: ${truncate(insight.snippet, 200)} (${insight.url})`
    }
  }

  if (stepType === 'linkedin_comment' && postContext) {
    prompt += `\n\n## Post al que debes comentar:\n${truncate(postContext, 1000)}`
  }

  const isEmail = stepType === 'send_email'
  prompt += isEmail
    ? `\n\nGenera el email personalizado. Recuerda: la primera línea debe ser "SUBJECT: [asunto]".`
    : `\n\nGenera el mensaje personalizado.`

  return prompt
}

// ─── Main Handler ─────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  // 30-second timeout for the entire pipeline
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

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
      ownerId,
    } = body

    // Support service-role calls (from process-queue) via ownerId param
    let userId: string
    if (ownerId) {
      const serviceKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      const token = authHeader.replace('Bearer ', '')
      if (token !== serviceKey) {
        return errorResponse('Unauthorized: ownerId requires service role', 403)
      }
      userId = ownerId
    } else {
      const user = await getAuthUser(authHeader)
      if (!user) return errorResponse('Unauthorized', 401)
      userId = user.id
    }

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
      .eq('owner_id', userId)
      .single()

    if (leadError || !lead) {
      return errorResponse('Lead not found', 404)
    }

    // ── Get Unipile account (optional for email steps — only needed for LinkedIn profile/posts) ──
    const unipileAccountId = await getUnipileAccountId(userId)
    if (!unipileAccountId && !isEmailStep) {
      return errorResponse('No LinkedIn account connected. Please connect your LinkedIn in Settings.', 400)
    }

    // ── Initialize clients ──
    const unipile = createUnipileClient()
    let exa: ReturnType<typeof createExaClient> | null = null
    try {
      exa = createExaClient()
    } catch {
      console.log('Exa API key not configured, skipping web research')
    }

    // ── Extract LinkedIn username ──
    const linkedinUrl = lead.linkedin_url || ''
    const username = extractUsernameFromUrl(linkedinUrl)

    // ── Parallel data fetching ──
    const researchStart = Date.now()

    // Build all promises
    const promises: Record<string, Promise<unknown>> = {}

    // 1. Unipile profile (skip for email steps without LinkedIn account)
    if (username && unipileAccountId) {
      promises.profile = unipile.getProfile(unipileAccountId, username)
    }

    // 2. Unipile posts (need provider_id, but we'll try with username)
    if (username && unipileAccountId) {
      // First get profile to get provider_id, then fetch posts
      promises.posts = (async () => {
        const profileResult = await unipile.getProfile(unipileAccountId, username)
        if (profileResult.success && profileResult.data) {
          const profileData = profileResult.data as { provider_id?: string; id?: string }
          const userId = profileData.provider_id || profileData.id
          if (userId) {
            return unipile.getUserPosts(unipileAccountId, userId, 5)
          }
        }
        return { success: false, error: 'Could not get provider_id for posts' }
      })()
    }

    // 3. Exa search queries (if client available)
    const firstName = lead.first_name || ''
    const lastName = lead.last_name || ''
    const company = lead.company || ''

    if (exa && (firstName || company)) {
      // Query 1: Person-focused search
      if (firstName && lastName) {
        promises.exaPerson = exa.searchWithContents(
          `"${firstName} ${lastName}" ${company} latest news announcements`,
          {
            numResults: 5,
            type: 'auto',
            startPublishedDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            text: { maxCharacters: 500 },
            highlights: { numSentences: 2, highlightsPerUrl: 2 },
          }
        )
      }

      // Query 2: Company-focused search
      if (company) {
        promises.exaCompany = exa.searchWithContents(
          `"${company}" recent news product launch funding partnership`,
          {
            numResults: 5,
            type: 'auto',
            startPublishedDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            text: { maxCharacters: 500 },
            highlights: { numSentences: 2, highlightsPerUrl: 2 },
          }
        )
      }
    }

    // 4. Exa contents for additional URLs
    if (exa && additionalUrls && additionalUrls.length > 0) {
      promises.exaUrls = exa.getContents(additionalUrls, {
        text: { maxCharacters: 1000 },
        highlights: { numSentences: 3, highlightsPerUrl: 3 },
      })
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

        // Try to extract company from experience
        if (!profileSummary.company && p.current_company) {
          profileSummary.company = p.current_company as string
        }
      }
    }

    // ── Process Unipile posts ──
    if (settled.posts?.status === 'fulfilled') {
      const postsResult = settled.posts.value as { success: boolean; data?: { items?: Array<Record<string, unknown>> } }
      if (postsResult?.success && postsResult.data?.items) {
        profileSummary.recentPosts = postsResult.data.items
          .slice(0, 5)
          .map(post => ({
            text: (post.text as string) || '',
            date: post.created_at as string | undefined,
          }))
          .filter(post => post.text)
      }
    }

    // ── Process Exa results into insights ──
    const webInsights: WebInsight[] = []
    let researchFailed = false
    const seenUrls = new Set<string>()

    const processExaResult = (key: string) => {
      if (settled[key]?.status === 'fulfilled') {
        const exaResult = settled[key].value as { success: boolean; data?: { results?: Array<Record<string, unknown>> } }
        if (exaResult?.success && exaResult.data?.results) {
          for (const result of exaResult.data.results) {
            const url = result.url as string
            if (seenUrls.has(url)) continue
            seenUrls.add(url)

            const highlights = result.highlights as string[] | undefined
            const text = result.text as string | undefined
            const snippet = highlights?.[0] || truncate(text || '', 200) || ''

            if (snippet) {
              webInsights.push({
                title: (result.title as string) || url,
                snippet,
                url,
              })
            }
          }
        }
      } else if (settled[key]?.status === 'rejected') {
        console.error(`Exa ${key} failed:`, settled[key].reason)
        researchFailed = true
      }
    }

    if (promises.exaPerson) processExaResult('exaPerson')
    if (promises.exaCompany) processExaResult('exaCompany')
    if (promises.exaUrls) processExaResult('exaUrls')

    // If exa was not available at all, mark as failed but continue
    if (!exa) researchFailed = true

    // Limit to 6 insights, sorted by relevance (person first, then company)
    const finalInsights = webInsights.slice(0, 6)

    console.log(`Research complete: profile=${!!settled.profile}, posts=${profileSummary.recentPosts.length}, insights=${finalInsights.length}, researchFailed=${researchFailed}`)
    console.log(`Research prompt: ${researchPrompt ? 'CUSTOM (' + researchPrompt.substring(0, 80) + '...)' : 'DEFAULT (built-in)'}`)

    // ── Substitute template variables in custom prompts ──
    const templateVars: Record<string, string> = {
      first_name: firstName,
      last_name: lastName,
      company: company,
      title: lead.title || '',
      email: lead.email || '',
      linkedin_url: linkedinUrl,
      industry: lead.industry || '',
      website: lead.website || '',
      department: lead.department || '',
      annual_revenue: lead.annual_revenue || '',
      company_linkedin_url: lead.company_linkedin_url || '',
    }

    const resolvedMessageTemplate = messageTemplate
      ? substituteTemplateVariables(messageTemplate, templateVars)
      : messageTemplate
    const resolvedResearchPrompt = researchPrompt
      ? substituteTemplateVariables(researchPrompt, templateVars)
      : researchPrompt

    // ── Generate message + research summary with Anthropic (in parallel) ──
    const generationStart = Date.now()
    let anthropic
    try {
      anthropic = createAnthropicClient()
    } catch {
      return errorResponse('Anthropic API key not configured', 500)
    }

    const systemPrompt = buildSystemPrompt(stepType, tone, language, resolvedMessageTemplate, exampleMessages)
    const userPrompt = buildUserPrompt(profileSummary, finalInsights, stepType, postContext)

    const maxTokens = stepType === 'linkedin_connect' ? 200 : stepType === 'linkedin_comment' ? 400 : isEmailStep ? 800 : 600

    // Build research summary prompt
    const summaryParts: string[] = []
    summaryParts.push(`Nombre: ${profileSummary.name}`)
    summaryParts.push(`Título: ${profileSummary.headline}`)
    summaryParts.push(`Empresa: ${profileSummary.company}`)
    if (profileSummary.location) summaryParts.push(`Ubicación: ${profileSummary.location}`)
    if (profileSummary.summary) summaryParts.push(`Bio: ${truncate(profileSummary.summary, 300)}`)
    if (profileSummary.recentPosts.length > 0) {
      summaryParts.push(`\nPosts recientes (${profileSummary.recentPosts.length}):`)
      for (const post of profileSummary.recentPosts.slice(0, 3)) {
        summaryParts.push(`- ${truncate(post.text, 200)}`)
      }
    }
    if (finalInsights.length > 0) {
      summaryParts.push(`\nFuentes web (${finalInsights.length}):`)
      for (const insight of finalInsights) {
        summaryParts.push(`- ${insight.title}: ${truncate(insight.snippet, 150)}`)
      }
    }

    // Build research summary system prompt (custom or default)
    const langLabel = language === 'es' ? 'español' : language === 'en' ? 'English' : language
    const researchSummarySystemPrompt = resolvedResearchPrompt
      ? `${resolvedResearchPrompt}

## DATOS DISPONIBLES:
Se te proporcionará información recolectada sobre un prospecto B2B incluyendo su perfil de LinkedIn, posts recientes, y fuentes web. Usa SOLO los datos proporcionados.

## REGLAS DE SEGURIDAD (siempre aplican):
- NO inventes datos. Solo usa lo proporcionado.
- Responde SOLO con el resumen/análisis, sin títulos ni prefijos como "Resumen:" o "Análisis:".
- Idioma: ${langLabel}.`
      : `Eres un analista de investigación B2B. Tu trabajo es sintetizar la información recolectada sobre un prospecto en un resumen ejecutivo claro y útil.
Idioma: ${langLabel}.

Reglas:
- Escribe un resumen de 3-5 oraciones que destaque los puntos más relevantes para un vendedor B2B.
- Menciona: quién es la persona, su rol, datos clave de la empresa, y cualquier noticia o actividad reciente relevante.
- Si hay posts recientes, menciona brevemente los temas que le interesan.
- Si hay noticias de la empresa (funding, partnerships, lanzamientos), destácalas.
- Sé conciso y directo. NO inventes datos. Solo usa lo proporcionado.
- Responde SOLO con el resumen, sin títulos ni prefijos.`

    // Run message generation and research summary in parallel
    const [aiResult, summaryResult] = await Promise.all([
      anthropic.createMessage({
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens,
        temperature: 0.7,
      }),
      anthropic.createMessage({
        system: researchSummarySystemPrompt,
        messages: [{
          role: 'user',
          content: `Genera un resumen ejecutivo de este prospecto con toda la información recolectada:\n\n${summaryParts.join('\n')}`,
        }],
        maxTokens: 4096,
        temperature: 0.3,
      }),
    ])

    if (!aiResult.success || !aiResult.data) {
      console.error('Anthropic generation failed:', aiResult.error)

      // Log failure
      await logActivity({
        ownerId: userId,
        leadId,
        action: 'ai_generate_message',
        status: 'failed',
        details: { error: aiResult.error, stepType },
      })

      return errorResponse(`Message generation failed: ${aiResult.error}`, 500)
    }

    let generatedMessage = anthropic.extractText(aiResult.data)
    const researchSummary = summaryResult.success && summaryResult.data
      ? anthropic.extractText(summaryResult.data)
      : null
    const generationTimeMs = Date.now() - generationStart

    // Extract and strip "SUBJECT: ..." from the first line (for ALL step types)
    // This prevents subject lines from appearing in message bodies
    let generatedSubject: string | null = null
    const subjectMatch = generatedMessage.match(/^SUBJECT:\s*(.+?)(?:\n|$)/i)
    if (subjectMatch) {
      generatedSubject = subjectMatch[1].trim()
      // Use greedy .+ to match the ENTIRE subject line (lazy .+? only matches 1 char)
      generatedMessage = generatedMessage.replace(/^SUBJECT:\s*.+\n*/i, '').trim()
    }
    // Only return subject for email steps
    if (!isEmailStep) {
      generatedSubject = null
    }

    // ── Log success ──
    await logActivity({
      ownerId: userId,
      leadId,
      action: 'ai_generate_message',
      status: 'ok',
      details: {
        stepType,
        tone,
        language,
        insightsCount: finalInsights.length,
        researchFailed,
        researchTimeMs,
        generationTimeMs,
      },
    })

    // ── Return response ──
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
      metadata: {
        researchTimeMs,
        generationTimeMs,
        totalTimeMs: Date.now() - startTime,
        totalInsights: finalInsights.length,
        sourcesUsed: [
          ...(settled.profile?.status === 'fulfilled' ? ['unipile_profile'] : []),
          ...(profileSummary.recentPosts.length > 0 ? ['unipile_posts'] : []),
          ...(finalInsights.length > 0 ? ['exa_search'] : []),
        ],
      },
    })
  } catch (error) {
    clearTimeout(timeout)

    if (error instanceof DOMException && error.name === 'AbortError') {
      console.error('AI research pipeline timed out (30s)')
      return errorResponse('Research pipeline timed out. Please try again.', 504)
    }

    console.error('AI research generate error:', error)
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500
    )
  }
})
