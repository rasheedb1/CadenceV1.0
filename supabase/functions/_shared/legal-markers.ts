// Per-region legal-entity markers used to build targeted Firecrawl queries
// for the SDR BC's local-entity research phase. The synthesis LLM then
// reads those results to emit a per-country `has_entity` verdict with
// confidence. Markers are country-name-aware where possible.

import type { RegionKey } from './regions.ts'

// Tokens that strongly indicate a local legal entity in that region. Pulled
// from registries and standard corporate suffixes — the goal is recall over
// precision (the LLM downstream disambiguates). EMA bucket combines Europe +
// Middle East + Africa markers (matches the deck's classic EMEA grouping).
const REGION_TOKENS: Record<RegionKey, string[]> = {
  us: [
    'EIN', 'LLC', 'Inc.', 'incorporated in Delaware', 'Corp.',
    'business registration', 'state of incorporation',
  ],
  lat: [
    // BR
    'CNPJ', 'Ltda', 'S.A.', 'filial',
    // MX
    'RFC', 'S.A. de C.V.', 'sociedad anónima',
    // CO
    'NIT', 'S.A.S.',
    // AR
    'CUIT', 'S.R.L.',
    // CL/PE generic
    'sociedad comercial', 'sucursal',
  ],
  ema: [
    // Europe — UK/IE
    'Companies House', 'Ltd', 'Limited', 'PLC',
    // DE/AT/CH
    'Handelsregister', 'GmbH', 'AG',
    // FR
    'SIREN', 'SIRET', 'SAS', 'SARL',
    // ES
    'S.L.', 'S.A.',
    // IT
    'partita IVA', 'S.r.l.',
    // PL
    'KRS', 'Sp. z o.o.',
    // NL
    'KVK', 'B.V.',
    // Middle East — GCC
    'FZC', 'FZE', 'FZ-LLC', 'commercial license',
    // Africa — ZA / NG / KE
    'Pty Ltd', 'CAC',
    // Africa — EG
    'S.A.E.',
    // Africa — MA / TN / DZ
    'registre du commerce',
  ],
  apa: [
    // SG / MY
    'Pte Ltd', 'Sdn Bhd',
    // AU / NZ
    'Pty Ltd',
    // CN / TW
    'Co. Ltd', 'Co., Ltd.',
    // JP
    'Kabushiki Kaisha', 'K.K.', '株式会社',
    // IN / PK / BD
    'Pvt Ltd', 'Private Limited',
    // KR
    '주식회사',
    // PH
    'Inc.',
    // ID
    'PT ',
  ],
}

export function buildRegionEntityQuery(
  companyName: string,
  region: RegionKey,
  countryNames: string[],
): string {
  const tokens = REGION_TOKENS[region] ?? []
  // Quote tokens with spaces / punctuation. Single-word ones stay bare.
  const tokenClause = tokens
    .map(t => (/[\s.,]/.test(t) ? `"${t}"` : t))
    .join(' OR ')
  // Country hint helps Firecrawl rank registry pages — names from SimilarWeb.
  const countryHint = countryNames.length > 0
    ? ` (${countryNames.slice(0, 5).map(c => `"${c}"`).join(' OR ')})`
    : ''
  return `"${companyName}" (${tokenClause})${countryHint}`
}
