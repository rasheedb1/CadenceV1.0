// Shared PSP padding helper used by the Diagnostic and YunoSolve slides.
// The topology diagrams on both slides always show exactly 4 PSP chips +
// an overflow "+460 providers more" chip on slide 4. Real PSPs (from
// per-merchant research stored in Supabase) are rendered first; if
// research didn't identify 4, the slot is filled with globally-recognized
// enterprise processors so the diagram reads as a complete stack instead
// of a half-built one.

const DUMMY_PSPS = [
  { name: 'Stripe',        role: 'Global processor' },
  { name: 'Adyen',         role: 'Enterprise acquirer' },
  { name: 'Braintree',     role: 'Global processor' },
  { name: 'Checkout.com',  role: 'Global processor' },
  { name: 'Worldpay',      role: 'Global processor' },
]

// Normalize an array of raw PSPs (strings OR { name, role } objects) into
// exactly N chips: real ones first (capped at N), then dummies that don't
// duplicate any real name, until N is reached.
export function padPspsToN(rawPsps, n = 4) {
  const real = (Array.isArray(rawPsps) ? rawPsps : [])
    .map((p) => (typeof p === 'string' ? { name: p } : p))
    .filter((p) => p && p.name)
    .slice(0, n)

  if (real.length >= n) return real

  const realNames = new Set(real.map((p) => p.name.toLowerCase()))
  const fillers = DUMMY_PSPS
    .filter((p) => !realNames.has(p.name.toLowerCase()))
    .slice(0, n - real.length)

  return [...real, ...fillers]
}
