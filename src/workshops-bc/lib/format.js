// Workshop-deck format helpers.
//
// Delegates to the shared multilingual helper at `src/lib/i18n.ts` so the
// same locale rules apply across all three deck systems (workshops-bc,
// sdr-bc, ss-deck). The wrapper preserves the existing call sites' shape:
//
//   fmtMoney(value, currency, lang, opts)
//
// `lang` is the third positional arg (defaults to 'en'). For the few legacy
// call sites that still passed `{decimals,withCode}` as the third arg, the
// wrapper detects an object there and shifts it to opts with lang='en'.

import { fmtMoney as fmtMoneyShared, fmtPct as fmtPctShared, fmtInt as fmtIntShared } from '../../lib/i18n'

export const fmtMoney = (v, currency = 'USD', lang = 'en', opts = {}) => {
  // Legacy call sites passed `fmtMoney(v, currency, { decimals })` with opts
  // in the third slot. Detect and shift so we don't break them.
  if (lang && typeof lang === 'object' && !Array.isArray(lang)) {
    opts = lang
    lang = 'en'
  }
  return fmtMoneyShared(v, currency, lang, opts)
}

// Backwards-compat — preserves the existing call signature exactly.
export const fmtUSD = (v, opts) => fmtMoneyShared(v, 'USD', 'en', opts)

export const fmtNum = (v, lang = 'en') => fmtIntShared(v, lang)

// Compact tx-volume label: 130000 → "130K", 2800000 → "2.80M". Keeps the
// legacy "x.xxM" rendering for ≥1M volumes (Coppel) while small decks
// (BCI · 130K tx/mes) stop reading as "0.13M".
export const fmtTxCompact = (v) => {
  const n = Number(v) || 0
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`
  return String(Math.round(n))
}

export const fmtPct = (v, decimals = 1, lang = 'en') => {
  // Legacy: fmtPct(v, decimals). Shared signature is fmtPct(v, lang, decimals).
  // If decimals is a string ('es'/'en'/'pt'), swap.
  if (typeof decimals === 'string') {
    const swap = lang
    lang = decimals
    decimals = typeof swap === 'number' ? swap : 1
  }
  return fmtPctShared(v, lang, decimals)
}
