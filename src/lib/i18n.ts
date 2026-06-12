// Client-side multilingual helper for slide rendering.
//
// Mirrors supabase/functions/_shared/i18n.ts (server side) — the Lang and
// currency lists are identical so a row written by the edge function renders
// correctly here without translation tables.
//
// What lives here:
//   - Lang type and SUPPORTED_LANGS / SUPPORTED_CURRENCIES whitelists
//   - locale lookup for Intl.NumberFormat / Intl.DateTimeFormat
//   - fmtMoney(value, currency, lang) — locale-aware, compact (B / M / K)
//   - fmtPct, fmtInt, fmtDate
//   - tr(dict, lang, path) — dotted-path lookup in nested string dicts (used by
//     each deck's local copy module)
//
// What does NOT live here:
//   - Per-deck strings. Each deck owns its own dict (workshops-bc/lib/i18n.js,
//     sdr-bc-assets/sdr-bc-i18n.js, ss-deck/lib/copy.js). This file is the
//     plumbing, not the dictionary.

export type Lang = 'es' | 'en' | 'pt'

export const SUPPORTED_LANGS: readonly Lang[] = ['es', 'en', 'pt'] as const

export const SUPPORTED_CURRENCIES: readonly string[] = [
  'USD', 'MXN', 'BRL', 'COP', 'ARS', 'CLP', 'PEN', 'EUR', 'GBP',
] as const

export const DEFAULT_LANG: Lang = 'en'
export const DEFAULT_CURRENCY = 'USD'

export const LOCALE_FOR_LANG: Record<Lang, string> = {
  es: 'es-MX',
  en: 'en-US',
  pt: 'pt-BR',
}

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(v)
}

export function resolveLang(v: unknown, fallback: Lang = DEFAULT_LANG): Lang {
  if (typeof v !== 'string') return fallback
  const base = v.toLowerCase().split(/[-_]/)[0]
  return isLang(base) ? base : fallback
}

export function resolveCurrency(v: unknown, fallback: string = DEFAULT_CURRENCY): string {
  if (typeof v !== 'string') return fallback
  const upper = v.toUpperCase().trim()
  return SUPPORTED_CURRENCIES.includes(upper) ? upper : fallback
}

// Currency symbol map — preferred display symbol regardless of caller locale.
// Mirrors src/workshops-bc/lib/format.js convention (used in production since
// the Coppel deck shipped). For USD we always show "$" in en/es and "US$" in
// pt-BR; if a caller passes an exotic currency not in this map we fall back to
// the Intl-formatted symbol for the locale.
const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$', MXN: '$', COP: '$', ARS: '$', CLP: '$', PEN: 'S/.',
  BRL: 'R$', EUR: '€', GBP: '£',
}

function symbolForCurrency(currency: string, lang: Lang): string {
  // pt-BR distinguishes USD vs local currency by prefixing "US$" — keep that.
  if (lang === 'pt' && currency === 'USD') return 'US$'
  const mapped = CURRENCY_SYMBOL[currency.toUpperCase()]
  if (mapped) return mapped
  const locale = LOCALE_FOR_LANG[lang] ?? LOCALE_FOR_LANG.en
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0)
  return parts.find(p => p.type === 'currency')?.value ?? currency
}

/** Compact, locale-aware currency formatter.
 *  fmtMoney(24_524_782, 'USD', 'en') === '$24.5M'
 *  fmtMoney(24_524_782, 'USD', 'es') === '$24.5M'    (es-MX uses '.' for decimals)
 *  fmtMoney(24_524_782, 'USD', 'pt') === 'US$ 24,5M' (pt-BR uses ',' for decimals)
 */
export function fmtMoney(
  value: number,
  currency: string = DEFAULT_CURRENCY,
  lang: Lang = DEFAULT_LANG,
  opts: { decimals?: number; withCode?: boolean } = {},
): string {
  if (!Number.isFinite(value)) return '—'
  const { decimals = 1, withCode = false } = opts
  const locale = LOCALE_FOR_LANG[lang] ?? LOCALE_FOR_LANG.en
  const abs = Math.abs(value)
  let body: string
  let suffix = ''
  if (abs >= 1e9)      { body = (abs / 1e9).toFixed(decimals).replace(/\.0$/, ''); suffix = 'B' }
  else if (abs >= 1e6) { body = (abs / 1e6).toFixed(decimals).replace(/\.0$/, ''); suffix = 'M' }
  else if (abs >= 1e3) { body = (abs / 1e3).toFixed(0);                              suffix = 'K' }
  else                 { body = Math.round(abs).toLocaleString(locale) }

  // Replace JS-native '.' decimal with locale-correct separator. es-MX actually
  // uses '.' (Mexican convention matches US); pt-BR uses ',' (Brazilian).
  const decimalSep = (1.1).toLocaleString(locale).slice(1, 2)
  body = body.replace('.', decimalSep)

  const sign = value < 0 ? '-' : ''
  const symbol = symbolForCurrency(currency, lang)
  // pt-BR puts a space between symbol and number ("US$ 24,5M"); en/es don't.
  const symbolJoiner = lang === 'pt' ? ' ' : ''
  const code = withCode ? ` ${currency}` : ''
  return `${sign}${symbol}${symbolJoiner}${body}${suffix}${code}`
}

/** Integer formatter — thousand separators by locale. */
export function fmtInt(value: number, lang: Lang = DEFAULT_LANG): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(LOCALE_FOR_LANG[lang] ?? 'en-US', {
    maximumFractionDigits: 0,
  }).format(value)
}

/** Percentage formatter — accepts e.g. 87.5 (NOT 0.875). */
export function fmtPct(value: number, lang: Lang = DEFAULT_LANG, decimals = 1): string {
  if (!Number.isFinite(value)) return '—'
  const locale = LOCALE_FOR_LANG[lang] ?? 'en-US'
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value) + '%'
}

/** Date formatter — accepts ISO strings or Date objects. Falls through to the
 *  original string on parse failure rather than rendering 'Invalid Date'. */
export function fmtDate(value: string | Date, lang: Lang = DEFAULT_LANG): string {
  const d = typeof value === 'string' ? new Date(value) : value
  if (!d || Number.isNaN(d.getTime())) return String(value)
  return new Intl.DateTimeFormat(LOCALE_FOR_LANG[lang] ?? 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(d)
}

/** Dotted-path lookup in a nested string dictionary.
 *  Each leaf can be either a plain string (same value all langs) or
 *  { es, en, pt } variant object. Missing keys return the path so the bug is
 *  visible in the rendered slide rather than blank.
 *
 *  Example:
 *    const STRINGS = { cta: { primary: { es: 'Contáctanos', en: 'Contact us', pt: 'Fale conosco' } } }
 *    tr(STRINGS, 'es', 'cta.primary') === 'Contáctanos'
 */
export function tr(dict: any, lang: Lang, path: string): string {
  const segments = path.split('.')
  let node: any = dict
  for (const s of segments) {
    if (node == null || typeof node !== 'object') return path
    node = node[s]
  }
  if (node == null) return path
  if (typeof node === 'object' && lang in node) return node[lang]
  if (typeof node === 'string') return node
  // If we landed on a {es,en,pt} object but lang missing, fall through to en
  if (typeof node === 'object' && 'en' in node) return node.en
  return path
}
