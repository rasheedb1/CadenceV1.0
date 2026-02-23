/**
 * Keyword cleaning and variation utilities for Sales Navigator searches.
 * (Deno port of src/lib/prospecting/clean-keywords.ts)
 */

const SENIORITY_PREFIXES = [
  'chief', 'vice president', 'vp', 'svp', 'evp', 'avp',
  'senior vice president', 'executive vice president',
  'director', 'senior director', 'managing director',
  'head', 'global head', 'regional head',
  'manager', 'senior manager',
  'lead', 'senior lead', 'team lead',
  'principal',
]

const PREPOSITIONS = /^\s*(of|the|and|for|in|at|&)\s+/gi

const C_LEVEL = new Set([
  'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cro', 'cpo', 'cio', 'ciso',
  'cdo', 'clo', 'cso',
])

function extractFunctionalCore(keyword: string): string {
  const trimmed = keyword.trim()
  if (!trimmed) return ''
  if (C_LEVEL.has(trimmed.toLowerCase())) return trimmed.toUpperCase()

  let result = trimmed
  const lower = result.toLowerCase()
  for (const prefix of SENIORITY_PREFIXES) {
    if (lower.startsWith(prefix + ' ')) {
      result = result.substring(prefix.length).trim()
      break
    }
  }

  result = result.replace(PREPOSITIONS, '').trim()
  result = result.replace(PREPOSITIONS, '').trim()
  result = result.replace(/\s*\(.*?\)\s*/g, '').trim()
  result = result.replace(/\s+/g, ' ').trim()

  return result || trimmed
}

export function splitAndCleanKeyword(keyword: string): string[] {
  const parts = keyword.split(/\s*[\/|]\s*/).map(p => p.trim()).filter(Boolean)
  const results: string[] = []
  for (const part of parts) {
    const subParts = part.split(/\s*&\s*/).filter(Boolean)
    if (subParts.length > 1) {
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

function isGenericWord(word: string): boolean {
  const generic = new Set([
    'management', 'manager', 'operations', 'services', 'solutions',
    'global', 'regional', 'senior', 'junior', 'lead', 'team',
    'business', 'corporate', 'general', 'assistant', 'associate',
  ])
  return generic.has(word.toLowerCase())
}

export function generateTitleVariations(keywords: string[]): string[] {
  const allVariations: string[] = []
  for (const keyword of keywords) {
    const cores = splitAndCleanKeyword(keyword)
    allVariations.push(...cores)
    const trimmed = keyword.trim()
    const wordCount = trimmed.split(/\s+/).length
    if (wordCount <= 2 && trimmed.length > 1) {
      allVariations.push(trimmed)
    }
    for (const core of cores) {
      const words = core.split(/\s+/)
      if (words.length >= 2) {
        for (const word of words) {
          if (word.length > 3 && !isGenericWord(word)) {
            allVariations.push(word)
          }
        }
      }
    }
  }
  const seen = new Set<string>()
  return allVariations.filter(v => {
    const key = v.toLowerCase().trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

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
