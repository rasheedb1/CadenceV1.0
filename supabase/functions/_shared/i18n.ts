// Multilingual presentation infrastructure (es / en / pt) for the three deck
// generators that ship from Chief:
//   - workshops-bc-generate  → workshops_bc table (column: language, currency)
//   - sdr-bc-generate        → presentations table (kind='sdr_bc', stored in defaults JSONB)
//   - ss-deck-generate       → merchants_ss table (column: language, currency)
//
// Math computation lives in each edge function and is UNAFFECTED by language —
// numbers are computed once, formatted at render time by the consumer via the
// matching client-side helper (src/lib/i18n.ts).
//
// Defaults — applied when the caller doesn't pass an explicit value:
//   - Automatic / cadence callers   → 'en' + 'USD'
//   - UI / skill callers            → must pass explicitly (skill prompts user)
//
// Whitelist enforced at validation time; unknown values fall back to default
// rather than throwing, so cadence steps never crash on a typo.

export type Lang = 'es' | 'en' | 'pt'

export const SUPPORTED_LANGS: readonly Lang[] = ['es', 'en', 'pt'] as const

// Whitelist of currencies the decks can render. Add to this list (not to slide
// JSX) when a new market needs to be supported. Symbols + locale rules live in
// the client format helper; this list only gates input validation.
export const SUPPORTED_CURRENCIES: readonly string[] = [
  'USD', 'MXN', 'BRL', 'COP', 'ARS', 'CLP', 'PEN', 'EUR', 'GBP',
] as const

export const DEFAULT_LANG: Lang = 'en'
export const DEFAULT_CURRENCY = 'USD'

// Locale code passed to Intl.NumberFormat / Intl.DateTimeFormat. Distinct from
// Lang because PT specifically means pt-BR for our merchants (Brazil-first).
// If we ever need pt-PT, branch here on country.
export const LOCALE_FOR_LANG: Record<Lang, string> = {
  es: 'es-MX',
  en: 'en-US',
  pt: 'pt-BR',
}

export function validateLang(input: unknown, fallback: Lang = DEFAULT_LANG): Lang {
  if (typeof input !== 'string') return fallback
  const lower = input.toLowerCase().trim()
  // Accept common variants: 'es-MX' → 'es', 'pt-BR' → 'pt', 'en-US' → 'en'
  const base = lower.split(/[-_]/)[0]
  if (SUPPORTED_LANGS.includes(base as Lang)) return base as Lang
  return fallback
}

export function validateCurrency(input: unknown, fallback: string = DEFAULT_CURRENCY): string {
  if (typeof input !== 'string') return fallback
  const upper = input.toUpperCase().trim()
  if (SUPPORTED_CURRENCIES.includes(upper)) return upper
  return fallback
}

// Currency-aware compact formatter for server-side log lines and any place an
// edge function needs to surface a number in the response. Slide rendering
// should use the client helper at src/lib/i18n.ts so React can re-format if
// the row is re-rendered in another language without regenerating.
// Mirror of the client-side CURRENCY_SYMBOL map in src/lib/i18n.ts so server
// logs and any HTML response that happens to render a number look identical.
const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$', MXN: '$', COP: '$', ARS: '$', CLP: '$', PEN: 'S/.',
  BRL: 'R$', EUR: '€', GBP: '£',
}

export function fmtMoneyServer(value: number, currency: string, lang: Lang, opts: { decimals?: number } = {}): string {
  if (!Number.isFinite(value)) return '—'
  const { decimals = 1 } = opts
  const locale = LOCALE_FOR_LANG[lang] ?? LOCALE_FOR_LANG.en
  const abs = Math.abs(value)
  let body: string
  let suffix = ''
  if (abs >= 1e9)      { body = (abs / 1e9).toFixed(decimals); suffix = 'B' }
  else if (abs >= 1e6) { body = (abs / 1e6).toFixed(decimals); suffix = 'M' }
  else if (abs >= 1e3) { body = (abs / 1e3).toFixed(0);        suffix = 'K' }
  else                 { body = abs.toFixed(0) }
  const decimalSep = (1.1).toLocaleString(locale).slice(1, 2)
  body = body.replace('.', decimalSep)
  const sign = value < 0 ? '-' : ''
  const cur = currency.toUpperCase()
  let symbol: string
  if (lang === 'pt' && cur === 'USD') symbol = 'US$'
  else if (CURRENCY_SYMBOL[cur])       symbol = CURRENCY_SYMBOL[cur]
  else {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0)
    symbol = parts.find(p => p.type === 'currency')?.value ?? currency
  }
  const symbolJoiner = lang === 'pt' ? ' ' : ''
  return `${sign}${symbol}${symbolJoiner}${body}${suffix}`
}

// Region label lookups for SDR BC slide rendering. Imported by sdr-bc-generate
// + sdr-bc-render. Region keys match _shared/regions.ts (us | lat | ema | apa).
export const REGION_LABELS_I18N: Record<Lang, Record<'us' | 'lat' | 'ema' | 'apa', string>> = {
  en: { us: 'North America', lat: 'LATAM',         ema: 'EMEA', apa: 'APAC' },
  es: { us: 'Norteamérica',  lat: 'Latinoamérica', ema: 'EMEA', apa: 'APAC' },
  pt: { us: 'América do Norte', lat: 'América Latina', ema: 'EMEA', apa: 'APAC' },
}
