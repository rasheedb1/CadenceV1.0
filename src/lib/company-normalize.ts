/**
 * Company name normalization for fuzzy matching.
 * No external libraries — simple string transforms only.
 */

// Common company suffixes to strip
const COMPANY_SUFFIXES = [
  'inc', 'incorporated', 'corp', 'corporation', 'llc', 'ltd', 'limited',
  'co', 'company', 'plc', 'gmbh', 'ag', 'sa', 'sas', 'srl', 'bv',
  'nv', 'pty', 'pvt', 'lp', 'llp', 'pllc', 'pc', 'pa',
  'group', 'holdings', 'international', 'technologies', 'solutions',
  'services', 'consulting', 'partners', 'associates',
]

/**
 * Normalize a company name for comparison/storage.
 * - Lowercase
 * - Trim whitespace
 * - Remove content in parentheses
 * - Remove common suffixes (Inc, LLC, Ltd, etc.)
 * - Remove punctuation
 * - Collapse multiple spaces
 */
export function normalizeCompanyName(name: string): string {
  if (!name) return ''

  let normalized = name
    .toLowerCase()
    .trim()
    // Remove content in parentheses: "Acme (US)" -> "Acme"
    .replace(/\(.*?\)/g, '')
    // Replace common separators with spaces
    .replace(/[.,\-_&+]/g, ' ')
    // Remove other punctuation
    .replace(/['"!@#$%^*(){}[\]:;<>?/\\|`~]/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()

  // Remove trailing suffixes iteratively (handle "Acme Corp Ltd")
  let changed = true
  while (changed) {
    changed = false
    for (const suffix of COMPANY_SUFFIXES) {
      const pattern = new RegExp(`\\s+${suffix.replace(/\./g, '\\.')}$`, 'i')
      if (pattern.test(normalized)) {
        normalized = normalized.replace(pattern, '').trim()
        changed = true
      }
    }
  }

  return normalized
}

/**
 * Check if two company names match after normalization.
 */
export function companiesMatch(a: string, b: string): boolean {
  return normalizeCompanyName(a) === normalizeCompanyName(b)
}

/**
 * Build a Set of normalized names for O(1) lookup.
 */
export function buildNormalizedSet(names: string[]): Set<string> {
  return new Set(names.map(normalizeCompanyName))
}
