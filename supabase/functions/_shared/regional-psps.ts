// regional-psps.ts
// Canonical payment-stack catalog by region. Used as a deterministic fallback
// for the SDR BC "current payment stack" slide when public research (deep-research
// → Firecrawl) doesn't surface real PSPs/acquirers for the prospect.
//
// Philosophy:
//   - These are the BEST-KNOWN, most likely processors a brand in the region
//     would actually be using (heuristic, not company-specific).
//   - The deck shows a disclaimer when this fallback is used so the SDR doesn't
//     pitch on false assumptions.
//   - Curated to ~4 acquirers + ~5 gateways/PSPs per region for visual balance
//     on slide 4 (the 3-column layout).

import type { RegionKey } from './regions.ts'

export interface RegionalPaymentStack {
  acquirers: string[]
  gateways: string[]
}

// Names mirror what shows up in Salesforce / public sources and in Yuno's
// own ecosystem so the deck reads consistently with reality.
export const REGIONAL_STACK_CATALOG: Record<RegionKey, RegionalPaymentStack> = {
  // North America (US + CA): card networks dominate, big-bank acquirers,
  // hosted PSPs are dominant on the gateway side.
  us: {
    acquirers: ['Chase Paymentech', 'Worldpay (FIS)', 'Fiserv', 'Global Payments'],
    gateways:  ['Stripe', 'Braintree', 'Adyen', 'Authorize.net', 'Square'],
  },
  // LATAM (BR, MX, AR, CO, CL, PE): mix of local acquirers per country.
  // Defaults skew BR + MX (largest LATAM markets by traffic).
  lat: {
    acquirers: ['Cielo', 'Rede', 'Stone', 'Conekta'],
    gateways:  ['dLocal', 'Ebanx', 'MercadoPago', 'Kushki', 'PayU'],
  },
  // EMEA: Europe + MEA folded together (region key is `ema`). UK/FR/DE/ES
  // weight skews the acquirer list European; MEA gateway names appear in
  // gateways for Gulf coverage.
  ema: {
    acquirers: ['Worldpay', 'Barclaycard', 'Elavon', 'Global Payments'],
    gateways:  ['Adyen', 'Stripe', 'Checkout.com', 'Mollie', 'Klarna'],
  },
  // APAC: JP/AU/SG/IN/KR. Adyen + Stripe are pan-APAC; per-country giants
  // (Razorpay in IN, GMO in JP) cover local rails.
  apa: {
    acquirers: ['NAB Merchant Services', 'GMO Payment Gateway', 'Worldline', 'PayU'],
    gateways:  ['Adyen', 'Stripe', 'Razorpay', 'Airwallex', 'PayPay'],
  },
}

/**
 * Decide whether the deep-research payment_stack data is "weak" enough to
 * justify falling back to the regional catalog.
 *
 * Heuristic: weak = fewer than 2 distinct real PSP names, OR the only entries
 * are e-commerce platforms (Salesforce Commerce Cloud, Shopify, BigCommerce,
 * Magento) which aren't actually payment processors.
 */
const ECOM_PLATFORM_NOT_PSP = [
  'salesforce commerce cloud', 'shopify', 'bigcommerce', 'magento',
  'woocommerce', 'commerce cloud', 'oracle commerce',
]

export function isStackResearchWeak(
  acquirers: string[],
  gateways: string[],
): boolean {
  const allNames = [...acquirers, ...gateways].map(n => n.toLowerCase().trim()).filter(Boolean)
  // Drop e-commerce platforms when counting real PSPs.
  const realPsps = allNames.filter(n => !ECOM_PLATFORM_NOT_PSP.some(p => n.includes(p)))
  return realPsps.length < 2
}

/**
 * Pull the regional stack for the prospect's top-traffic region.
 * Returns null if the region isn't in the catalog (shouldn't happen for the
 * 4 supported RegionKey values).
 */
export function getRegionalStack(region: RegionKey): RegionalPaymentStack | null {
  return REGIONAL_STACK_CATALOG[region] ?? null
}
