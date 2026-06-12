// non-psp-patterns.ts
// Ported from yuno-sales-pitch-maker/scripts/research-psps.mjs.
// Drops payment-method / rail / bank-network values that get mis-classified
// as PSPs during research extraction. The Diagnostic slide renders every
// entry in `psps` as a provider box, so a slip like "Credit Card" or
// "Apple Pay" reads as if it were an acquirer next to "Stripe".

const NON_PSP_PATTERNS: RegExp[] = [
  // Card / cash generics
  /^credit\s*card/i,
  /^credit\s*\/?\s*debit/i,
  /^debit\s*card/i,
  /^cards?\s*only$/i,
  /^cards?$/i,
  /^card\s+processor/i,
  /^card\s+acquir(er|ing)/i,
  /^credit\s+card\s+processing/i,
  /^debit\s+card\s+networks?$/i,
  /^card\/ach\s+funding$/i,
  /^cash$/i,
  // Bank rails / wire / ACH / check
  /^invoice/i,
  /^wire$/i,
  /^wire\s+transfer/i,
  /^wire\s*\/\s*check$/i,
  /^bank\s+wire/i,
  /^bank\s+transfer/i,
  /^direct\s+debit$/i,
  /^direct\s+deposit$/i,
  /^direct\s+invoicing$/i,
  /^direct\s+web\s+billing$/i,
  /^ach$/i,
  /^ach\s*\/\s*(direct\s+debit|fedwire|nacha|sepa|bacs|e-?check|direct\s+deposit|checking\s+account|bank\s+transfers?)/i,
  /^ach\s+(debit|direct\s+deposit|network|direct\s+bank\s+transfers?)$/i,
  /^ach\s+via\s+/i,
  /^check$/i,
  /^check\s+payments?$/i,
  /^paper\s+check$/i,
  /^sepa\s+(direct\s+debit|dd)/i,
  /^sepa\s+dd\s*\//i,
  /^eft\s*\/\s*ach/i,
  /^cross-?border\s+wire\s+network$/i,
  // Wallets / IAP / methods (belong in missing_methods, not psps)
  /^apple\s+pay$/i,
  /^google\s+pay$/i,
  /^samsung\s+pay$/i,
  /^apple\s+pay\s*\/\s*google\s+pay$/i,
  // Generic / placeholder descriptors
  /^purchase\s+order/i,
  /^usd\s+only$/i,
  /^cryptocurrency\s+processor$/i,
  /^carrier\s+billing$/i,
  /^enterprise\s+invoicing$/i,
  /^manual\s+invoice$/i,
  /^paycheck\s+deduction$/i,
  /^insurance\s+claims$/i,
  /^medicare\s*\/\s*medicaid/i,
  /^ebt\s*\/\s*snap/i,
  /^hsa\s*\/\s*fsa\s+cards/i,
  /^mobile\s+money\s+networks?$/i,
  /^internal(\s|$)/i,
  /^local(\s|$)/i,
  /^legacy(\s|$)/i,
  /^multiple(\s|$)/i,
  /^third[-\s]party(\s|$)/i,
  /^undisclosed(\s|$)/i,
  /^proprietary(\s|$)/i,
  /^regional\s+bank/i,
  /^external\s+gateways?$/i,
  /^none\s+detected$/i,
  /^not\s+confirmed$/i,
  /^\d+[\d,+]*\s+(more|us\s+bank)/i,
  /\[inference\]/i,
  // Card networks (not PSPs themselves)
  /^mastercard$/i,
  /^mastercard\s+start\s+path$/i,
  /^visa$/i,
  /^visa\s+network$/i,
  /^visa\s*\/\s*mastercard(\s|\/|$)/i,
  /^visa\/mc(\s|\/|$)/i,
  /^discover\s+global\s+network$/i,
  /^unionpay$/i,
  // Specific bank names that appear as fallbacks
  /^mrv\s+banks?$/i,
  /^republic\s+bank\s*(&|and)\s*trust/i,
  /^google\s+cloud$/i,
  // Wallets that get mis-tagged as PSPs
  /^venmo$/i,
  /^cash\s*app(\s+pay)?$/i,
  /^paypal$/i,
  /^paypal\s*\/\s*venmo$/i,
  /^paypal\s*complete(\s+payments)?$/i,
  /^amazon\s+pay$/i,
  /^shop\s+pay$/i,
  /^stripe\s+link$/i,
  // BNPL (belongs in methods, not PSPs)
  /^klarna$/i,
  /^affirm$/i,
  /^afterpay$/i,
  /^sezzle$/i,
  /^zip$/i,
  /^clearpay/i,
  /^uplift$/i,
  /^sunbit$/i,
  /^paidy$/i,
  /^chariot$/i,
  /^afterpay\s*\/\s*zip$/i,
  /^klarna\s*\+\s*zip$/i,
]

export function isNonPsp(name: string): boolean {
  const trimmed = String(name).trim()
  if (!trimmed) return true
  return NON_PSP_PATTERNS.some((rx) => rx.test(trimmed))
}

export function filterNonPsps<T extends { name?: string }>(items: T[]): T[] {
  return items.filter((it) => !isNonPsp(it.name || ''))
}
