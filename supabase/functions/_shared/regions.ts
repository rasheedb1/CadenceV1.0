// Country → region bucketing + base authorization rates for SDR BC math.
// Source for auth rates: tasks/auth-rates-by-country.txt (2026-05-11 snapshot).
// All keys are ISO 3166-1 alpha-2. Country names from SimilarWeb are resolved
// via NAME_TO_ISO below before any lookup.

// Region keys match the SDR-BC deck JSX (slides-02-business-case.jsx).
// Note: EMA = EMEA classic (Europe + Middle East + Africa). The deck does NOT
// have a separate MEA slot — MEA countries fold into `ema`.
export type RegionKey = 'us' | 'lat' | 'ema' | 'apa'

export const REGION_LABEL: Record<RegionKey, string> = {
  us: 'North America',
  lat: 'LATAM',
  ema: 'EMEA',
  apa: 'APAC',
}

// ISO-2 → region. Countries not in this map are dropped with a warning.
// EMA bucket follows the deck's classic EMEA grouping: Europe + Middle East + Africa.
// NOTE on `us` vs `lat`: the BC slide treats North America as US + CA only.
// Mexico, Central America, and Caribbean countries belong to `lat` even though
// the auth-rates source file groups them under "NA + Caribbean / Central America"
// (that's an auth-rate-average bucket, not a sales-region bucket).
export const COUNTRY_REGION: Record<string, RegionKey> = {
  // North America — US + Canada only
  US: 'us', CA: 'us',
  // LATAM — Mexico + Central America + Caribbean
  MX: 'lat',
  PR: 'lat', CR: 'lat', PA: 'lat', GT: 'lat', JM: 'lat', BS: 'lat', TT: 'lat',
  HN: 'lat', SV: 'lat', NI: 'lat', DO: 'lat',
  // LATAM — South America
  BR: 'lat', AR: 'lat', CO: 'lat', CL: 'lat', PE: 'lat',
  EC: 'lat', UY: 'lat', PY: 'lat', BO: 'lat', VE: 'lat',
  // EMEA — Europe
  GB: 'ema', DE: 'ema', FR: 'ema', ES: 'ema', IT: 'ema',
  NL: 'ema', BE: 'ema', CH: 'ema', AT: 'ema', PT: 'ema', IE: 'ema',
  SE: 'ema', NO: 'ema', DK: 'ema', FI: 'ema',
  PL: 'ema', CZ: 'ema', SK: 'ema', HU: 'ema', RO: 'ema',
  GR: 'ema', TR: 'ema',
  // EMEA — Middle East
  AE: 'ema', SA: 'ema', QA: 'ema', KW: 'ema', BH: 'ema', OM: 'ema', JO: 'ema',
  IL: 'ema', LB: 'ema', EG: 'ema',
  // EMEA — Africa
  ZA: 'ema', NG: 'ema', KE: 'ema', MA: 'ema', GH: 'ema', CI: 'ema',
  TZ: 'ema', TN: 'ema', ET: 'ema',
  // APAC
  JP: 'apa', IN: 'apa', CN: 'apa', AU: 'apa', NZ: 'apa',
  SG: 'apa', HK: 'apa', KR: 'apa', TW: 'apa',
  ID: 'apa', TH: 'apa', VN: 'apa', PH: 'apa', MY: 'apa',
  PK: 'apa', BD: 'apa', LK: 'apa',
}

// Base authorization rate per country (decimal, e.g. 0.875 = 87.5%).
// Parsed from tasks/auth-rates-by-country.txt — REAL values where available,
// regional [AVG] fallbacks for the rest. Missing countries fall back to
// REGIONAL_AVG_AR[region] → DEFAULT_AR (0.80).
export const AUTH_RATES: Record<string, number> = {
  // NA + Caribbean/CA
  US: 0.875, CA: 0.875, MX: 0.69, DO: 0.85,
  PR: 0.82, CR: 0.82, PA: 0.82, GT: 0.82, JM: 0.82, BS: 0.82, TT: 0.82,
  HN: 0.82, SV: 0.82, NI: 0.82,
  // LATAM
  BR: 0.80, CO: 0.725, PE: 0.73,
  AR: 0.75, CL: 0.75, EC: 0.75, UY: 0.75, PY: 0.75, BO: 0.75, VE: 0.75,
  // Europe (3DS success rate per Ravelin 2026)
  GB: 0.95, IT: 0.93, NL: 0.92, FR: 0.91, IE: 0.91, CZ: 0.91,
  AT: 0.88, DE: 0.87, PL: 0.87, HU: 0.82, ES: 0.81, BE: 0.80, RO: 0.80,
  NO: 0.78, PT: 0.77, SE: 0.76, DK: 0.75, GR: 0.74, FI: 0.72, CH: 0.84,
  TR: 0.79, // not in EMEA-only avg; uses MEA-leaning context
  // MEA
  AE: 0.86, DZ: 0.84, SA: 0.80, ZA: 0.75, EG: 0.70,
  IL: 0.79, QA: 0.79, KW: 0.79, BH: 0.79, OM: 0.79, JO: 0.79, LB: 0.79,
  NG: 0.79, KE: 0.79, MA: 0.79, GH: 0.79, CI: 0.79, TZ: 0.79, TN: 0.79, ET: 0.79,
  // APAC
  JP: 0.92, IN: 0.875,
  CN: 0.90, AU: 0.90, NZ: 0.90, SG: 0.90, HK: 0.90, KR: 0.90, TW: 0.90,
  ID: 0.90, TH: 0.90, VN: 0.90, PH: 0.90, MY: 0.90,
  PK: 0.90, BD: 0.90, LK: 0.90,
}

// Regional auth-rate averages (decimal).
// us (US + CA only): both 87.5% per auth-rates-by-country.txt.
// lat (Mexico + CC + Caribbean + South America): blend of the auth-rates
// "LATAM" (0.75) and "NA + Caribbean / CA" (0.82) buckets — leaning toward
// LATAM since the country mix is dominated by South America.
// ema (EMEA classic = Europe + ME + Africa): unweighted mean of Europe (0.84)
// and MEA (0.79).
export const REGIONAL_AVG_AR: Record<RegionKey, number> = {
  us: 0.875,
  lat: 0.78,
  ema: 0.815,
  apa: 0.90,
}

export const DEFAULT_AR = 0.80

// Authoritative ISO-2 lookup chain for country names returned by SimilarWeb.
// SimilarWeb uses English country names; we normalize then lookup. Common
// variants ("USA", "United States of America", "Republica Dominicana") all
// resolve here. Unknown names return null.
const NAME_TO_ISO_MAP: Record<string, string> = {
  // North America + Caribbean / Central America
  'united states': 'US', 'usa': 'US', 'us': 'US', 'united states of america': 'US',
  'canada': 'CA',
  'mexico': 'MX', 'méxico': 'MX',
  'puerto rico': 'PR',
  'costa rica': 'CR',
  'panama': 'PA', 'panamá': 'PA',
  'guatemala': 'GT',
  'jamaica': 'JM',
  'bahamas': 'BS', 'the bahamas': 'BS',
  'trinidad and tobago': 'TT', 'trinidad & tobago': 'TT',
  'honduras': 'HN',
  'el salvador': 'SV',
  'nicaragua': 'NI',
  'dominican republic': 'DO', 'republica dominicana': 'DO', 'república dominicana': 'DO',
  // LATAM
  'brazil': 'BR', 'brasil': 'BR',
  'argentina': 'AR',
  'colombia': 'CO',
  'chile': 'CL',
  'peru': 'PE', 'perú': 'PE',
  'ecuador': 'EC',
  'uruguay': 'UY',
  'paraguay': 'PY',
  'bolivia': 'BO',
  'venezuela': 'VE',
  // Europe
  'united kingdom': 'GB', 'uk': 'GB', 'great britain': 'GB', 'england': 'GB',
  'germany': 'DE',
  'france': 'FR',
  'spain': 'ES', 'españa': 'ES',
  'italy': 'IT', 'italia': 'IT',
  'netherlands': 'NL', 'the netherlands': 'NL', 'holland': 'NL',
  'belgium': 'BE',
  'switzerland': 'CH',
  'austria': 'AT',
  'portugal': 'PT',
  'ireland': 'IE',
  'sweden': 'SE',
  'norway': 'NO',
  'denmark': 'DK',
  'finland': 'FI',
  'poland': 'PL',
  'czech republic': 'CZ', 'czechia': 'CZ',
  'slovakia': 'SK',
  'hungary': 'HU',
  'romania': 'RO',
  'greece': 'GR',
  'turkey': 'TR', 'türkiye': 'TR',
  // MEA
  'united arab emirates': 'AE', 'uae': 'AE',
  'saudi arabia': 'SA', 'ksa': 'SA',
  'qatar': 'QA',
  'kuwait': 'KW',
  'bahrain': 'BH',
  'oman': 'OM',
  'jordan': 'JO',
  'israel': 'IL',
  'lebanon': 'LB',
  'egypt': 'EG',
  'south africa': 'ZA',
  'nigeria': 'NG',
  'kenya': 'KE',
  'morocco': 'MA',
  'ghana': 'GH',
  "cote d'ivoire": 'CI', 'côte d’ivoire': 'CI', 'ivory coast': 'CI',
  'tanzania': 'TZ',
  'tunisia': 'TN',
  'ethiopia': 'ET',
  'algeria': 'DZ',
  // APAC
  'japan': 'JP',
  'india': 'IN',
  'china': 'CN',
  'australia': 'AU',
  'new zealand': 'NZ',
  'singapore': 'SG',
  'hong kong': 'HK',
  'south korea': 'KR', 'korea, south': 'KR', 'republic of korea': 'KR', 'korea': 'KR',
  'taiwan': 'TW',
  'indonesia': 'ID',
  'thailand': 'TH',
  'vietnam': 'VN', 'viet nam': 'VN',
  'philippines': 'PH',
  'malaysia': 'MY',
  'pakistan': 'PK',
  'bangladesh': 'BD',
  'sri lanka': 'LK',
}

// Country code top-level domains used by the cctld HEAD-ping heuristic.
// Only for countries we map; missing entries skip the cctld check.
export const CCTLD: Record<string, string[]> = {
  // Country domain priority — many merchants use BOTH the bare cctld and com.<cctld>
  US: ['us'], CA: ['ca'], MX: ['com.mx', 'mx'], PR: ['pr'],
  CR: ['co.cr', 'cr'], PA: ['com.pa', 'pa'], GT: ['com.gt', 'gt'], DO: ['do', 'com.do'],
  BR: ['com.br', 'br'], AR: ['com.ar', 'ar'], CO: ['co', 'com.co'],
  CL: ['cl'], PE: ['com.pe', 'pe'], EC: ['com.ec', 'ec'],
  UY: ['com.uy', 'uy'], PY: ['com.py', 'py'], BO: ['com.bo', 'bo'], VE: ['com.ve', 've'],
  GB: ['co.uk', 'uk'], DE: ['de'], FR: ['fr'], ES: ['es'], IT: ['it'],
  NL: ['nl'], BE: ['be'], CH: ['ch'], AT: ['at'], PT: ['pt'], IE: ['ie'],
  SE: ['se'], NO: ['no'], DK: ['dk'], FI: ['fi'],
  PL: ['pl'], CZ: ['cz'], SK: ['sk'], HU: ['hu'], RO: ['ro'], GR: ['gr'], TR: ['com.tr', 'tr'],
  AE: ['ae'], SA: ['com.sa', 'sa'], QA: ['qa'], KW: ['com.kw', 'kw'], BH: ['bh'],
  OM: ['om'], JO: ['jo'], IL: ['co.il'], EG: ['com.eg', 'eg'],
  ZA: ['co.za', 'za'], NG: ['com.ng', 'ng'], KE: ['co.ke', 'ke'],
  MA: ['ma'], GH: ['com.gh', 'gh'], TN: ['tn'],
  JP: ['co.jp', 'jp'], IN: ['in', 'co.in'], CN: ['cn', 'com.cn'],
  AU: ['com.au', 'au'], NZ: ['co.nz', 'nz'],
  SG: ['com.sg', 'sg'], HK: ['com.hk', 'hk'], KR: ['co.kr', 'kr'], TW: ['com.tw', 'tw'],
  ID: ['co.id', 'id'], TH: ['co.th', 'th'], VN: ['vn', 'com.vn'],
  PH: ['com.ph', 'ph'], MY: ['com.my', 'my'],
  PK: ['com.pk', 'pk'], BD: ['com.bd', 'bd'], LK: ['lk'],
}

export function isoFromCountryName(name: string | null | undefined): string | null {
  if (!name) return null
  const k = name.toLowerCase().trim().replace(/[.,]/g, '')
  return NAME_TO_ISO_MAP[k] ?? null
}

// Reverse lookup: ISO-2 → canonical English country name (matches SimilarWeb's
// top_countries.name format so downstream code that does isoFromCountryName(...)
// round-trips cleanly). Builds the index lazily on first call.
let _isoToNameMap: Record<string, string> | null = null
export function countryNameFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  if (!_isoToNameMap) {
    _isoToNameMap = {}
    // Prefer the "canonical" name per ISO — the first NAME_TO_ISO_MAP entry
    // we see for each ISO that has Title Case spelling. Skip alt spellings
    // (e.g., "usa", "uk", "korea") so the reverse map carries the public name.
    for (const [name, code] of Object.entries(NAME_TO_ISO_MAP)) {
      if (_isoToNameMap[code]) continue
      // Title-case the name (NAME_TO_ISO_MAP keys are lowercased).
      _isoToNameMap[code] = name.replace(/\b\w/g, (c) => c.toUpperCase())
    }
  }
  return _isoToNameMap[iso.toUpperCase()] ?? null
}

export function regionOf(iso: string): RegionKey | null {
  return COUNTRY_REGION[iso.toUpperCase()] ?? null
}

export function baseAuthRate(iso: string): number {
  const code = iso.toUpperCase()
  if (AUTH_RATES[code] !== undefined) return AUTH_RATES[code]
  const region = COUNTRY_REGION[code]
  if (region && REGIONAL_AVG_AR[region] !== undefined) return REGIONAL_AVG_AR[region]
  return DEFAULT_AR
}
