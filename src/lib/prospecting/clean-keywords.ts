/**
 * Keyword cleaning and variation utilities for Sales Navigator searches.
 * Transforms raw persona title keywords into cleaned, split, and expanded
 * search terms that better match LinkedIn profile titles.
 */

/**
 * Split a compound title keyword and clean each part.
 * "VP of Payments / Head of Payments" → ["VP Payments", "Head Payments"]
 * "Director of Product (Checkout / Payments Product)" → ["Director Product"]
 */
export function splitAndCleanKeyword(keyword: string): string[] {
  // Split by "/" or "|" separators
  const parts = keyword.split(/\s*[\/|]\s*/).map(p => p.trim()).filter(Boolean)

  return parts.map(part =>
    part
      .replace(/\s*\(.*?\)\s*/g, '')            // Remove parenthesized content
      .replace(/\b(of|the|and|for|in|at)\b/gi, '') // Remove prepositions
      .replace(/\s+/g, ' ')                     // Collapse spaces
      .trim()
  ).filter(p => p.length > 2)
}

/**
 * Generate title variations for broader matching.
 * Takes an array of raw title keywords from a persona and returns
 * a deduplicated array of cleaned keywords + VP/Head/Director variants.
 *
 * ["VP of Payments / Head of Payments"] →
 *   ["VP Payments", "Head Payments", "Head of Payments", "Director of Payments",
 *    "VP of Payments", "Director of Payments"]
 */
export function generateTitleVariations(keywords: string[]): string[] {
  const allVariations: string[] = []

  for (const keyword of keywords) {
    const cleaned = splitAndCleanKeyword(keyword)
    allVariations.push(...cleaned)

    for (const kw of cleaned) {
      const lower = kw.toLowerCase()

      // VP ↔ Head ↔ Director interchangeability
      if (lower.startsWith('vp ')) {
        allVariations.push(kw.replace(/^vp /i, 'Head of '))
        allVariations.push(kw.replace(/^vp /i, 'Director of '))
      } else if (lower.startsWith('head ')) {
        allVariations.push(kw.replace(/^head /i, 'VP '))
        allVariations.push(kw.replace(/^head /i, 'Director '))
      } else if (lower.startsWith('director ')) {
        allVariations.push(kw.replace(/^director /i, 'VP '))
        allVariations.push(kw.replace(/^director /i, 'Head of '))
      }

      // Chief X Officer → VP X, Head of X
      if (lower.startsWith('chief ')) {
        const area = kw.substring(6).replace(/\bofficer\b/i, '').trim()
        if (area) {
          allVariations.push(`VP ${area}`)
          allVariations.push(`Head of ${area}`)
        }
      }
    }
  }

  // Deduplicate case-insensitively
  const seen = new Set<string>()
  return allVariations.filter(v => {
    const key = v.toLowerCase().trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
