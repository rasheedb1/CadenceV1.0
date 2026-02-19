/**
 * Keyword cleaning and variation utilities for Sales Navigator searches.
 *
 * The strategy: keywords fed to the SN "role" filter should be SHORT functional
 * terms (1-2 words), not full compound job titles. The seniority filter handles
 * VP/Director/CXO matching separately.
 *
 * If legacy keywords contain embedded seniority ("VP of Payments"), we strip the
 * seniority prefix and keep only the functional part ("Payments").
 */

/** Common seniority prefixes to strip from compound titles */
const SENIORITY_PREFIXES = [
  'chief', 'vice president', 'vp', 'svp', 'evp', 'avp',
  'senior vice president', 'executive vice president',
  'director', 'senior director', 'managing director',
  'head', 'global head', 'regional head',
  'manager', 'senior manager',
  'lead', 'senior lead', 'team lead',
  'principal',
]

/** Prepositions to strip after removing seniority */
const PREPOSITIONS = /^\s*(of|the|and|for|in|at|&)\s+/gi

/** C-level abbreviations to keep as-is */
const C_LEVEL = new Set([
  'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cro', 'cpo', 'cio', 'ciso',
  'cdo', 'clo', 'cso',
])

/**
 * Extract the functional core from a keyword.
 * "VP of Payments" → "Payments"
 * "Head of Financial Operations" → "Financial Operations"
 * "CTO" → "CTO" (kept as-is)
 * "Finance" → "Finance" (already short)
 */
function extractFunctionalCore(keyword: string): string {
  const trimmed = keyword.trim()
  if (!trimmed) return ''

  // Keep C-level abbreviations as-is
  if (C_LEVEL.has(trimmed.toLowerCase())) return trimmed.toUpperCase()

  // Try to strip seniority prefixes (longest match first)
  let result = trimmed
  const lower = result.toLowerCase()

  for (const prefix of SENIORITY_PREFIXES) {
    if (lower.startsWith(prefix + ' ')) {
      result = result.substring(prefix.length).trim()
      break
    }
  }

  // Strip leading prepositions ("of Engineering" → "Engineering")
  result = result.replace(PREPOSITIONS, '').trim()
  // May need another pass for double prepositions
  result = result.replace(PREPOSITIONS, '').trim()

  // Remove parenthesized content
  result = result.replace(/\s*\(.*?\)\s*/g, '').trim()

  // Collapse whitespace
  result = result.replace(/\s+/g, ' ').trim()

  return result || trimmed
}

/**
 * Split compound keywords and extract functional cores.
 * "VP of Payments / Head of Finance" → ["Payments", "Finance"]
 * "Engineering & Infrastructure" → ["Engineering", "Infrastructure"]
 */
export function splitAndCleanKeyword(keyword: string): string[] {
  // Split by "/" or "|" separators
  const parts = keyword.split(/\s*[\/|]\s*/).map(p => p.trim()).filter(Boolean)

  const results: string[] = []
  for (const part of parts) {
    // Split by "&" for compound terms like "Engineering & Infrastructure"
    const subParts = part.split(/\s*&\s*/).filter(Boolean)

    if (subParts.length > 1) {
      // Each sub-part gets extracted independently
      for (const sub of subParts) {
        const core = extractFunctionalCore(sub)
        if (core.length > 1) results.push(core)
      }
    } else {
      const core = extractFunctionalCore(part)
      if (core.length > 1) results.push(core)
    }
  }

  return results
}

/**
 * Generate search-optimized keyword variations from persona title keywords.
 *
 * The approach:
 * 1. Extract functional cores from any compound titles
 * 2. Keep short keywords (1-2 words) as-is — they're already good search terms
 * 3. For multi-word terms, also add each significant individual word as a keyword
 * 4. Add singular/plural variants for common terms
 * 5. Deduplicate case-insensitively
 */
export function generateTitleVariations(keywords: string[]): string[] {
  const allVariations: string[] = []

  for (const keyword of keywords) {
    // First, try to split and extract functional cores
    const cores = splitAndCleanKeyword(keyword)
    allVariations.push(...cores)

    // Also add the original keyword if it's short (1-2 words) and not already covered
    const trimmed = keyword.trim()
    const wordCount = trimmed.split(/\s+/).length
    if (wordCount <= 2 && trimmed.length > 1) {
      allVariations.push(trimmed)
    }

    // For multi-word functional cores, also add individual significant words
    for (const core of cores) {
      const words = core.split(/\s+/)
      if (words.length >= 2) {
        for (const word of words) {
          // Only add individual words that are meaningful (>3 chars, not generic)
          if (word.length > 3 && !isGenericWord(word)) {
            allVariations.push(word)
          }
        }
      }
    }
  }

  // Deduplicate case-insensitively
  const seen = new Set<string>()
  return allVariations.filter(v => {
    const key = v.toLowerCase().trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Words that are too generic to use as standalone search terms */
function isGenericWord(word: string): boolean {
  const generic = new Set([
    'management', 'manager', 'operations', 'services', 'solutions',
    'global', 'regional', 'senior', 'junior', 'lead', 'team',
    'business', 'corporate', 'general', 'assistant', 'associate',
  ])
  return generic.has(word.toLowerCase())
}

/**
 * Check if a title string indicates a senior/leadership position.
 */
export function isSeniorTitle(title: string): boolean {
  const indicators = [
    'vp', 'vice president', 'director', 'head of', 'chief',
    'cto', 'cfo', 'ceo', 'coo', 'cmo', 'cro', 'cpo', 'cio', 'ciso',
    'svp', 'evp', 'avp',
    'founder', 'co-founder', 'owner', 'partner',
    'general manager', 'managing director',
    'principal', 'senior director',
  ]
  const lower = title.toLowerCase()
  return indicators.some(i => lower.includes(i))
}
