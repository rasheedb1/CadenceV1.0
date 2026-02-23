// Signal Scanner — Detects sales signals using Firecrawl + LinkedIn data + LLM classification
import type { FirecrawlClient } from './firecrawl.ts'
import type { SignalConfigWithType, DetectedSignal, SignalCategory } from './signal-types.ts'

interface LLMClient {
  createMessage(params: {
    system?: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    maxTokens?: number
    temperature?: number
    jsonMode?: boolean
  }): Promise<{ success: boolean; text: string; error?: string }>
}

interface ScanContext {
  company: string
  firstName: string
  lastName: string
  industry: string
  linkedinPosts: Array<{ text: string; date?: string }>
  profileSummary: string
}

interface ScanOptions {
  maxSignals?: number
  maxFirecrawlCalls?: number
}

/**
 * Scans for sales signals based on user's enabled signal configs.
 * Uses Firecrawl for web signals and LinkedIn data for social signals.
 * Classifies results using a cheap LLM call.
 */
export async function scanSignals(
  configs: SignalConfigWithType[],
  firecrawl: FirecrawlClient | null,
  llm: LLMClient,
  context: ScanContext,
  options: ScanOptions = {},
): Promise<{ signals: DetectedSignal[]; timeMs: number }> {
  const startTime = Date.now()
  const maxSignals = options.maxSignals ?? 8
  const maxFirecrawlCalls = options.maxFirecrawlCalls ?? 6

  // Sort by priority (lower = higher priority)
  const sorted = [...configs]
    .filter(c => c.enabled)
    .sort((a, b) => a.priority - b.priority)

  if (sorted.length === 0) {
    return { signals: [], timeMs: Date.now() - startTime }
  }

  // Separate web signals (need Firecrawl) from social signals (use LinkedIn data)
  const webSignals = sorted.filter(c => c.signal_type.category !== 'social')
  const socialSignals = sorted.filter(c => c.signal_type.category === 'social')

  const allSnippets: Array<{
    config: SignalConfigWithType
    source: 'firecrawl' | 'linkedin'
    text: string
    url?: string
  }> = []

  // ── 1. Gather web signal data via Firecrawl (parallel, limited calls) ──
  if (firecrawl && webSignals.length > 0) {
    const year = new Date().getFullYear()
    const firecrawlTasks = webSignals.slice(0, maxFirecrawlCalls).map(async (config) => {
      try {
        const query = buildSearchQuery(config, context, year)
        if (!query) return

        const result = await firecrawl.search(query, { limit: 3, tbs: 'qdr:y', maxRetries: 1 })
        if (result.success && result.data && result.data.length > 0) {
          for (const item of result.data.slice(0, 2)) {
            const text = `${item.title}. ${item.description || ''}`
            if (text.length > 20) {
              allSnippets.push({ config, source: 'firecrawl', text, url: item.url })
            }
          }
        }
      } catch (err) {
        console.error(`Signal search failed for ${config.signal_type.slug}:`, err)
      }
    })

    await Promise.allSettled(firecrawlTasks)
  }

  // ── 2. Gather social signal data from LinkedIn posts ──
  if (socialSignals.length > 0 && context.linkedinPosts.length > 0) {
    for (const config of socialSignals) {
      const slug = config.signal_type.slug

      if (slug === 'recent_post' || slug === 'shared_article') {
        // Use actual LinkedIn post content
        for (const post of context.linkedinPosts.slice(0, 3)) {
          if (post.text && post.text.length > 20) {
            allSnippets.push({
              config,
              source: 'linkedin',
              text: `[LinkedIn Post${post.date ? ` - ${post.date}` : ''}] ${post.text}`,
            })
          }
        }
      } else if (slug === 'career_change') {
        // Check profile summary for career change signals
        if (context.profileSummary) {
          allSnippets.push({
            config,
            source: 'linkedin',
            text: `[Profile] ${context.profileSummary}`,
          })
        }
      }
      // mutual_connections: skip — would need separate API call
    }
  }

  if (allSnippets.length === 0) {
    return { signals: [], timeMs: Date.now() - startTime }
  }

  // ── 3. Batch classify all snippets with a single LLM call ──
  const detected = await classifySignals(llm, allSnippets, maxSignals)

  return { signals: detected, timeMs: Date.now() - startTime }
}

/**
 * Builds a Firecrawl search query from the signal config template.
 */
function buildSearchQuery(
  config: SignalConfigWithType,
  context: ScanContext,
  year: number,
): string | null {
  // User custom query takes priority
  if (config.custom_query?.trim()) {
    return config.custom_query
      .replace(/\{company\}/g, context.company)
      .replace(/\{first_name\}/g, context.firstName)
      .replace(/\{last_name\}/g, context.lastName)
      .replace(/\{industry\}/g, context.industry)
      .replace(/\{year\}/g, String(year))
  }

  const template = config.signal_type.search_query_template
  if (!template) return null

  return template
    .replace(/\{company\}/g, context.company)
    .replace(/\{first_name\}/g, context.firstName)
    .replace(/\{last_name\}/g, context.lastName)
    .replace(/\{industry\}/g, context.industry || 'technology')
    .replace(/\{department\}/g, '')
    .replace(/\{year\}/g, String(year))
}

/**
 * Classifies all gathered snippets in a single LLM call.
 * Returns only the signals that were positively detected.
 */
async function classifySignals(
  llm: LLMClient,
  snippets: Array<{
    config: SignalConfigWithType
    source: 'firecrawl' | 'linkedin'
    text: string
    url?: string
  }>,
  maxSignals: number,
): Promise<DetectedSignal[]> {
  // Build classification prompt with all snippets
  const snippetEntries = snippets.map((s, i) => {
    return `[${i}] Signal: "${s.config.signal_type.name}" (${s.config.signal_type.slug})
Classification criteria: ${s.config.signal_type.classification_prompt}
Content: ${s.text.substring(0, 400)}`
  })

  const prompt = `You are a B2B sales intelligence classifier. Analyze each content snippet and determine if it contains the specified sales signal.

For each snippet, return:
- "detected": true/false — does the content clearly contain this signal?
- "confidence": 0.0-1.0 — how confident are you?
- "summary": 1 sentence summary of the signal found (only if detected=true)

SNIPPETS TO CLASSIFY:
${snippetEntries.join('\n\n')}

Respond with a JSON array. Each element has: index (number), detected (boolean), confidence (number), summary (string or null).
Example: [{"index":0,"detected":true,"confidence":0.85,"summary":"Company raised $10M Series A in January 2026"},{"index":1,"detected":false,"confidence":0.1,"summary":null}]

Be strict: only mark detected=true if the content CLEARLY shows the signal. Generic or vague mentions should be detected=false.`

  try {
    const result = await llm.createMessage({
      system: 'You classify B2B sales signals from web content. Respond ONLY with a valid JSON array. No markdown, no backticks.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1500,
      temperature: 0.1,
      jsonMode: true,
    })

    if (!result.success) {
      console.error('Signal classification LLM failed:', result.error)
      return []
    }

    let jsonText = result.text.trim()
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    const classifications = JSON.parse(jsonText) as Array<{
      index: number
      detected: boolean
      confidence: number
      summary: string | null
    }>

    const detected: DetectedSignal[] = []
    for (const cls of classifications) {
      if (!cls.detected || cls.confidence < 0.5) continue
      const snippet = snippets[cls.index]
      if (!snippet) continue

      // Deduplicate by slug — keep highest confidence
      const existing = detected.find(d => d.signalSlug === snippet.config.signal_type.slug)
      if (existing) {
        if (cls.confidence > existing.confidence) {
          existing.confidence = cls.confidence
          existing.summary = cls.summary || existing.summary
          existing.sourceUrl = snippet.url || existing.sourceUrl
        }
        continue
      }

      detected.push({
        signalSlug: snippet.config.signal_type.slug,
        signalName: snippet.config.signal_type.name,
        category: snippet.config.signal_type.category as SignalCategory,
        confidence: cls.confidence,
        summary: cls.summary || '',
        source: snippet.source,
        sourceUrl: snippet.url,
        rawSnippet: snippet.text.substring(0, 200),
      })
    }

    // Sort by confidence descending, limit to maxSignals
    return detected
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxSignals)
  } catch (err) {
    console.error('Signal classification error:', err)
    return []
  }
}
