/**
 * Company name normalization for Deno edge functions.
 * Same algorithm as src/lib/company-normalize.ts (duplicated for Deno compatibility).
 */

const COMPANY_SUFFIXES = [
  'inc', 'incorporated', 'corp', 'corporation', 'llc', 'ltd', 'limited',
  'co', 'company', 'plc', 'gmbh', 'ag', 'sa', 'sas', 'srl', 'bv',
  'nv', 'pty', 'pvt', 'lp', 'llp', 'pllc', 'pc', 'pa',
  'group', 'holdings', 'international', 'technologies', 'solutions',
  'services', 'consulting', 'partners', 'associates',
]

export function normalizeCompanyName(name: string): string {
  if (!name) return ''

  let normalized = name
    .toLowerCase()
    .trim()
    .replace(/\(.*?\)/g, '')
    .replace(/[.,\-_&+]/g, ' ')
    .replace(/['"!@#$%^*(){}[\]:;<>?/\\|`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

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

export function buildNormalizedSet(names: string[]): Set<string> {
  return new Set(names.map(normalizeCompanyName))
}
