// Persona scope detection — parses lead title + location into geographic +
// functional scope so message generation aligns with the lead's actual lane
// (e.g. "CEO Revolut Bank UK" → UK retail bank scope, not Revolut Group global).
//
// Used by ai-research-generate to:
//   1. Filter company expansion_signals — degrade signals from regions ≠ scope
//   2. Inject region-specific payment context (local methods, regulators)
//   3. Tune AI prompt with persona-aware angle

export type GeoScope =
  | 'UK' | 'EU' | 'USA' | 'CA'
  | 'BR' | 'MX' | 'AR' | 'CO' | 'CL' | 'PE' | 'LATAM'
  | 'APAC' | 'IN' | 'SG' | 'PH' | 'JP' | 'AU'
  | 'GCC' | 'MENA' | 'IL'
  | 'AFRICA'
  | 'GLOBAL'

export type FunctionalScope =
  | 'retail_bank' | 'corporate_bank' | 'group_holding'
  | 'engineering' | 'product' | 'finance' | 'risk_fraud'
  | 'commercial' | 'operations' | 'general_management'

export type Seniority = 'c_level' | 'vp_director' | 'head' | 'manager' | 'ic'

export interface PersonaScope {
  geo: GeoScope
  functional: FunctionalScope
  seniority: Seniority
  raw_geo_token: string | null   // e.g. "UK" extracted from "Bank UK"
  raw_func_token: string | null  // e.g. "Bank" → retail_bank
}

const GEO_PATTERNS: Array<[RegExp, GeoScope]> = [
  // Most specific first
  [/\b(uk|united\s+kingdom|britain|england)\b/i, 'UK'],
  [/\b(usa|united\s+states|us|america|north\s+america|nasdaq)\b/i, 'USA'],
  [/\b(canada|ca\b)/i, 'CA'],
  [/\b(brazil|brasil|brazilian)\b/i, 'BR'],
  [/\b(mexico|méxico|mexican)\b/i, 'MX'],
  [/\b(argentina|argentinian)\b/i, 'AR'],
  [/\b(colombia|colombian)\b/i, 'CO'],
  [/\b(chile|chilean)\b/i, 'CL'],
  [/\b(peru|peruvian)\b/i, 'PE'],
  [/\b(latam|latin\s+america|south\s+america)\b/i, 'LATAM'],
  [/\b(india|indian)\b/i, 'IN'],
  [/\b(singapore|sg\b)/i, 'SG'],
  [/\b(philippines|filipino|ph\b)/i, 'PH'],
  [/\b(japan|japanese|jp\b)/i, 'JP'],
  [/\b(australia|australian|aussie)\b/i, 'AU'],
  [/\b(apac|asia[\s-]?pacific|southeast\s+asia)\b/i, 'APAC'],
  [/\b(gcc|gulf|uae|emirates|saudi|kuwait|qatar|bahrain|oman)\b/i, 'GCC'],
  [/\b(mena|middle\s+east|north\s+africa)\b/i, 'MENA'],
  [/\b(israel|israeli)\b/i, 'IL'],
  [/\b(africa|african|nigeria|kenya|south\s+africa)\b/i, 'AFRICA'],
  [/\b(europe|european|eu\b|emea)\b/i, 'EU'],
  // Generic global indicators
  [/\b(global|international|worldwide|cross[\s-]?border|group)\b/i, 'GLOBAL'],
]

const FUNCTIONAL_PATTERNS: Array<[RegExp, FunctionalScope]> = [
  // Engineering / technical first (more specific terms)
  [/\b(cto|chief\s+technology|vp\s+engineering|head\s+of\s+engineering|engineering\s+manager|principal\s+architect|sr\s+engineer|senior\s+engineer)\b/i, 'engineering'],
  [/\b(cpo|chief\s+product|vp\s+product|head\s+of\s+product|product\s+(manager|lead|director))\b/i, 'product'],
  [/\b(cfo|chief\s+financial|vp\s+finance|head\s+of\s+finance|controller|treasurer|finance\s+(director|manager))\b/i, 'finance'],
  [/\b(risk|fraud|compliance|aml|kyc)\b/i, 'risk_fraud'],
  [/\b(cco|chief\s+commercial|vp\s+sales|head\s+of\s+sales|head\s+of\s+commercial|business\s+development|partnerships)\b/i, 'commercial'],
  [/\b(coo|chief\s+operating|head\s+of\s+operations|operations\s+(manager|director|lead))\b/i, 'operations'],
  // Bank / company-type
  [/\b(retail\s+bank|consumer\s+bank|digital\s+bank|neobank|bank\s+(uk|brazil|us|spain|mexico))\b/i, 'retail_bank'],
  [/\b(corporate\s+bank|commercial\s+bank|investment\s+bank)\b/i, 'corporate_bank'],
  [/\b(group|holding|parent)\b/i, 'group_holding'],
  // Generic management
  [/\b(ceo|chief\s+executive|founder|president|managing\s+director|general\s+manager|gm\b)\b/i, 'general_management'],
]

const SENIORITY_PATTERNS: Array<[RegExp, Seniority]> = [
  [/\b(ceo|cfo|cto|coo|cpo|cco|cro|chief\s+\w+|founder|co[\s-]?founder|president|managing\s+director)\b/i, 'c_level'],
  [/\b(vp|vice\s+president|svp|evp|director|directora|diretor|director[ae])\b/i, 'vp_director'],
  [/\b(head\s+of|head\s+de|jefe\s+de|chefe\s+de|principal)\b/i, 'head'],
  [/\b(manager|gerente|gestor|lead|coordinator|coordinador|coordenador|sr\b|senior)\b/i, 'manager'],
]

export function parsePersonaScope(title: string | null | undefined, location: string | null | undefined, company: string | null | undefined): PersonaScope {
  const titleStr = (title || '').trim()
  const locationStr = (location || '').trim()
  const companyStr = (company || '').trim()
  const combined = `${titleStr} ${locationStr} ${companyStr}`

  // Detect geographic scope — title takes precedence (e.g. "Revolut Bank UK"
  // means UK scope even if location says London — same answer, but title is
  // more authoritative when a person leads a specific geo).
  let geo: GeoScope = 'GLOBAL'
  let geoToken: string | null = null
  for (const [pattern, scope] of GEO_PATTERNS) {
    const match = titleStr.match(pattern)
    if (match) { geo = scope; geoToken = match[0]; break }
  }
  // Fallback to location if title was generic
  if (geo === 'GLOBAL' && locationStr) {
    for (const [pattern, scope] of GEO_PATTERNS) {
      const match = locationStr.match(pattern)
      if (match) { geo = scope; geoToken = match[0]; break }
    }
  }

  // Detect functional scope
  let functional: FunctionalScope = 'general_management'
  let funcToken: string | null = null
  for (const [pattern, scope] of FUNCTIONAL_PATTERNS) {
    const match = titleStr.match(pattern)
    if (match) { functional = scope; funcToken = match[0]; break }
  }

  // Detect seniority
  let seniority: Seniority = 'ic'
  for (const [pattern, level] of SENIORITY_PATTERNS) {
    if (pattern.test(titleStr)) { seniority = level; break }
  }

  return { geo, functional, seniority, raw_geo_token: geoToken, raw_func_token: funcToken }
}

/**
 * Decide whether a company-level signal is RELEVANT to this persona's scope.
 * Returns 'high' | 'medium' | 'low' so the prompt can promote/degrade signals.
 *
 * Examples:
 * - persona scope=UK, signal mentions "Mexico" → 'low' (parent context, not lead's lane)
 * - persona scope=UK, signal mentions "UK" → 'high'
 * - persona scope=GLOBAL, any signal → 'medium-high'
 * - persona scope=BR, signal is funding round (no geo) → 'medium'
 */
export function signalRelevanceForPersona(signalText: string, persona: PersonaScope): 'high' | 'medium' | 'low' {
  if (!signalText) return 'medium'
  const txt = signalText.toLowerCase()

  // Find which geos the signal mentions
  const signalGeos: GeoScope[] = []
  for (const [pattern, scope] of GEO_PATTERNS) {
    if (pattern.test(signalText)) signalGeos.push(scope)
  }

  // No geo in signal → neutral medium
  if (signalGeos.length === 0) return 'medium'

  // Persona is GLOBAL → most signals are relevant
  if (persona.geo === 'GLOBAL') return 'medium'

  // Direct match
  if (signalGeos.includes(persona.geo)) return 'high'

  // Sub-region match (LATAM persona ↔ BR/MX/AR signal)
  const LATAM = ['BR', 'MX', 'AR', 'CO', 'CL', 'PE', 'LATAM']
  const APAC = ['IN', 'SG', 'PH', 'JP', 'AU', 'APAC']
  const EU_FAMILY = ['UK', 'EU']
  const NA = ['USA', 'CA']

  if (LATAM.includes(persona.geo) && signalGeos.some(g => LATAM.includes(g))) return 'high'
  if (APAC.includes(persona.geo) && signalGeos.some(g => APAC.includes(g))) return 'high'
  if (EU_FAMILY.includes(persona.geo) && signalGeos.some(g => EU_FAMILY.includes(g))) return 'medium'
  if (NA.includes(persona.geo) && signalGeos.some(g => NA.includes(g))) return 'medium'

  // Signal mentions GLOBAL → still moderately useful (parent company news)
  if (signalGeos.includes('GLOBAL')) return 'medium'

  // Signal is from a totally different geo than persona's lane
  return 'low'
}

// Regional payment context — what local methods, regulators, and pain points
// the AI should reference. Hand-curated; refresh quarterly.
export interface RegionalContext {
  local_methods: string[]
  card_specifics: string
  regulators: string[]
  key_psps: string[]
  trends: string
  pain: string
}

export const REGIONAL_PAYMENTS: Record<GeoScope, RegionalContext> = {
  UK: {
    local_methods: ['Faster Payments', 'BACS', 'CHAPS', 'Direct Debit', 'Open Banking PIS', 'Variable Recurring Payments (VRP)'],
    card_specifics: 'Visa Debit dominates retail, Mastercard ~30%, Amex limited to premium',
    regulators: ['FCA', 'PSR', 'OBIE', 'PRA'],
    key_psps: ['Stripe UK', 'Adyen UK', 'Worldpay/FIS', 'Checkout.com (HQ)'],
    trends: 'App-to-app payments (VRP) growing 35% YoY, PIS substituting card-not-present, FCA pushing Open Banking adoption',
    pain: 'Issuer-side declines on cross-border, limited APM coverage outside cards, BACS settlement delays',
  },
  EU: {
    local_methods: ['SEPA Credit Transfer', 'SEPA Instant', 'iDEAL (NL)', 'Bancontact (BE)', 'Sofort/Klarna (DE)', 'Bizum (ES)', 'Blik (PL)', 'MB WAY (PT)'],
    card_specifics: 'Visa + Mastercard dominate, significant local debit (Carte Bancaire FR, Girocard DE)',
    regulators: ['ECB', 'EBA', 'national (BaFin, AFM, AMF)'],
    key_psps: ['Adyen (HQ)', 'Mollie', 'Stripe EU', 'PPRO', 'Klarna', 'Worldline'],
    trends: 'PSD3 expected 2026, SEPA Instant becoming mandatory, A2A growing, SCA 2.0',
    pain: 'Multi-country APM coverage (each country 2-5 local methods), 3DS friction, multi-currency settlement',
  },
  USA: {
    local_methods: ['ACH', 'RTP', 'FedNow', 'Wire', 'Apple Pay', 'Google Pay', 'PayPal', 'Venmo', 'Zelle', 'Cash App'],
    card_specifics: 'Visa + Mastercard primary, Amex strong premium, debit interchange capped (Reg II)',
    regulators: ['Federal Reserve', 'OCC', 'FDIC', 'CFPB'],
    key_psps: ['Stripe (HQ)', 'Braintree/PayPal', 'Adyen US', 'Worldpay/FIS', 'Square/Block'],
    trends: 'FedNow rollout, stablecoin rails entering B2B, AI-driven fraud at issuers tightening declines',
    pain: 'High interchange vs EU, fragmented state regulation, declining checks but still 4% of B2B',
  },
  CA: {
    local_methods: ['Interac e-Transfer', 'Interac Online', 'EFT', 'Pre-Authorized Debit'],
    card_specifics: 'Interac debit dominates POS; Visa + MC for credit; Amex limited',
    regulators: ['OSFI', 'FCAC', 'Bank of Canada'],
    key_psps: ['Moneris', 'Stripe Canada', 'Helcim', 'Square Canada'],
    trends: 'Real-Time Rail (RTR) launching, Open Banking framework in development',
    pain: 'Interac e-Transfer caps, cross-border to US slow despite NAFTA, French-language compliance for QC',
  },
  BR: {
    local_methods: ['Pix', 'Boleto Bancário', 'Pix Cobrança', 'TED', 'DOC'],
    card_specifics: 'Elo (Brazilian network) ~20%, installments (parcelado) up to 12x interest-free is standard expectation',
    regulators: ['Banco Central do Brasil (BCB)', 'CVM', 'Susep'],
    key_psps: ['Cielo', 'Rede', 'Stone', 'Pagseguro', 'EBANX', 'Mercado Pago'],
    trends: 'Pix is 40%+ of e-commerce by volume, Pix Automatic for recurring (2024), OpenFinance maturing',
    pain: 'Installments financing logic, FX for cross-border merchants, Pix dispute resolution maturing',
  },
  MX: {
    local_methods: ['SPEI (instant)', 'OXXO (cash voucher)', 'CoDi (QR mobile)', 'Domiciliación'],
    card_specifics: 'Cards <40% of e-commerce, cash + SPEI dominate, Carnet local network niche',
    regulators: ['CNBV', 'Banxico', 'CONDUSEF'],
    key_psps: ['Conekta', 'Openpay (BBVA)', 'Stripe Mexico', 'PayU LATAM', 'MercadoPago'],
    trends: 'OXXO still 30%+ for unbanked, SPEI reaching parity with cards, nearshoring driving B2B volume',
    pain: 'OXXO 24-72h settlement, low card penetration outside metros, SPEI cutoff times for non-bank PSPs',
  },
  AR: {
    local_methods: ['Mercado Pago wallet', 'Rapipago', 'Pago Fácil', 'Transferencia bancaria', 'MODO'],
    card_specifics: 'Crédito en cuotas (installments) standard, multiple FX rates affect card processing',
    regulators: ['BCRA', 'CNV'],
    key_psps: ['Mercado Pago', 'Decidir (Prisma)', 'PayU', 'MODO'],
    trends: 'Currency controls drive crypto/dollar rails, MODO consortium gaining vs Mercado Pago, MEP-dollar export now allowed',
    pain: 'FX volatility, capital controls, AFIP compliance, dollar-pricing with peso settlement',
  },
  CO: {
    local_methods: ['PSE (bank debit)', 'Nequi', 'Daviplata', 'Bancolombia QR', 'Transferencia'],
    card_specifics: 'Cards ~50% of e-comm, Codensa store card popular',
    regulators: ['Superintendencia Financiera', 'Banco de la República'],
    key_psps: ['PayU', 'ePayco', 'Wompi (Bancolombia)', 'Mercado Pago'],
    trends: 'PSE adoption growing, Bre-B (instant payment system) launched 2024',
    pain: 'Cards have lower approval than LATAM avg, PSE redirect UX hurts conversion',
  },
  CL: {
    local_methods: ['Webpay (Transbank)', 'Multicaja', 'Khipu', 'Servipag'],
    card_specifics: 'Transbank historic monopoly broken in 2020, multi-acquirer market growing',
    regulators: ['CMF', 'Banco Central de Chile'],
    key_psps: ['Transbank', 'Getnet (Santander)', 'Kushki', 'Flow.cl'],
    trends: 'Multi-acquirer market post-Transbank monopoly end, fintech licensing law',
    pain: 'Transbank legacy integration debt, multi-acquirer routing complexity',
  },
  PE: {
    local_methods: ['Yape', 'Plin', 'PagoEfectivo', 'BCP transferencia', 'Niubiz'],
    card_specifics: 'Visa dominant, Mastercard ~25%, Amex limited',
    regulators: ['SBS', 'BCRP'],
    key_psps: ['Niubiz (Visanet)', 'Izipay', 'Culqi', 'Mercado Pago'],
    trends: 'Yape + Plin wallets growing fast, Niubiz interoperability with QR',
    pain: 'Cash still high, multi-rail wallet UX',
  },
  LATAM: {
    local_methods: ['Pix (BR)', 'OXXO + SPEI (MX)', 'PSE (CO)', 'Mercado Pago (regional)', 'Boleto (BR)'],
    card_specifics: 'Installments (cuotas/parcelas) critical across region, Elo + Hipercard in BR, Naranja in AR',
    regulators: ['Per-country: BCB, Banxico, Superfinanciera, BCRA, SBIF'],
    key_psps: ['EBANX', 'dLocal', 'PayU LATAM', 'MercadoPago', 'Kushki', 'Astropay'],
    trends: 'Cross-border merchants need 4-6 local methods per country, Pix model spreading (DiMo, Bre-B), embedded BNPL rising',
    pain: 'Local acquiring required for good approval (cross-border = 30-45% decline), tax/FX complexity, installment financing',
  },
  IN: {
    local_methods: ['UPI', 'RuPay', 'Net Banking', 'IMPS', 'Wallets (Paytm/PhonePe/Google Pay)', 'EMI'],
    card_specifics: 'RuPay ~30%, Visa + MC issuer-dependent, tokenization mandatory since 2022',
    regulators: ['RBI', 'NPCI', 'SEBI'],
    key_psps: ['Razorpay', 'Cashfree', 'PayU India', 'Pine Labs', 'BillDesk'],
    trends: 'UPI handles ~80% of digital transactions by count and is free for merchants, cross-border UPI rolling out',
    pain: 'Card tokenization compliance, recurring mandate friction (e-mandate), foreign FX restrictions',
  },
  SG: {
    local_methods: ['PayNow', 'GIRO', 'FAST', 'GrabPay (regional)', 'PayLah!', 'AliPay+'],
    card_specifics: 'Cards dominate retail, Visa + Mastercard ~85%',
    regulators: ['MAS', 'ABS'],
    key_psps: ['Stripe Singapore', 'Adyen APAC', '2C2P', 'Razer Merchant Services'],
    trends: 'Hub for APAC payment companies, PayNow corporate growing, CBDC pilots, cross-border QR (Project Nexus)',
    pain: 'Multi-country APAC coverage from one entity, FX hedging across 8-10 currencies',
  },
  PH: {
    local_methods: ['GCash', 'Maya', 'InstaPay', 'PESONet', 'Bank transfer', 'OTC (7-Eleven, Cebuana)'],
    card_specifics: 'Cards <25% of e-comm, wallets + OTC dominate',
    regulators: ['BSP', 'SEC PH'],
    key_psps: ['PayMaya', 'GCash for Business', 'Xendit', 'PayMongo', 'Dragonpay'],
    trends: 'GCash + Maya duopoly in wallets, QR Ph national standard, cross-border via PayNow link',
    pain: 'Low card penetration, wallet KYC limits, OTC reconciliation lag',
  },
  JP: {
    local_methods: ['Konbini', 'Pay-easy', 'PayPay', 'LINE Pay', 'Rakuten Pay', 'Bank transfer'],
    card_specifics: 'JCB local network ~30%, Visa + MC for international, prepaid cards common',
    regulators: ['FSA Japan', 'METI'],
    key_psps: ['GMO Payment Gateway', 'SBPS', 'Komoju', 'Stripe Japan'],
    trends: 'QR wallet wars (PayPay leading), cross-border merchants need konbini for older demographic',
    pain: 'Konbini reconciliation + 7-day settlement, language + cultural barriers for foreign PSPs',
  },
  AU: {
    local_methods: ['BPAY', 'PayID + NPP (real-time)', 'POLi (deprecated)', 'Direct Debit'],
    card_specifics: 'Visa + Mastercard dominate, EFTPOS for debit, Amex strong in retail',
    regulators: ['APRA', 'ASIC', 'Reserve Bank of Australia'],
    key_psps: ['Stripe Australia', 'Adyen', 'Tyro', 'Pin Payments', 'Westpac PayWay'],
    trends: 'Least-cost routing (LCR) mandate driving multi-acquirer adoption, NPP / PayID growing',
    pain: 'LCR routing complexity, multi-currency for trans-Tasman trade',
  },
  APAC: {
    local_methods: ['Varies: UPI (IN), PayNow (SG), GrabPay, AliPay, WeChat Pay, GCash, KakaoPay'],
    card_specifics: 'UnionPay critical for China inbound, JCB for Japan, RuPay for India',
    regulators: ['Per-country: MAS, RBI, FSA, BSP, etc.'],
    key_psps: ['Adyen APAC', '2C2P', 'AsiaPay', 'Stripe', 'Razorpay', 'Cashfree', 'Xendit'],
    trends: 'Cross-border QR linkage (Project Nexus), wallet-to-wallet across borders, stablecoin pilots',
    pain: 'Each country needs separate licensing, wallet integration N×M complexity',
  },
  GCC: {
    local_methods: ['Mada (Saudi)', 'KNET (Kuwait)', 'BENEFIT (Bahrain)', 'QPAY (Qatar)', 'OmanNet', 'UAE Switch', 'Apple/Google Pay common'],
    card_specifics: 'Local debit networks dominate domestic, Visa/MC for international, Tabby/Tamara BNPL strong',
    regulators: ['SAMA (Saudi)', 'CBUAE', 'CMA Kuwait', 'CBB Bahrain', 'QCB'],
    key_psps: ['Checkout.com (MENA)', 'Network International', 'Telr', 'PayTabs', 'HyperPay', 'Amazon Payment Services'],
    trends: 'Saudi Vision 2030 pushing digital payments, UAE 2024 stablecoin regs, BNPL boom across GCC',
    pain: 'Multi-country GCC coverage requires 5+ acquirers, Sharia compliance for fintech, high cash usage in Saudi non-metro',
  },
  MENA: {
    local_methods: ['Mada (KSA)', 'KNET (KW)', 'Fawry (EG)', 'Vodafone Cash (EG)', 'Meeza (EG)'],
    card_specifics: 'Cards ~40% in UAE/KSA, <20% in Egypt/Morocco, cash on delivery still 30-40%',
    regulators: ['Per country: SAMA, CBUAE, CBE, Bank Al-Maghrib'],
    key_psps: ['Checkout.com', 'PayTabs', 'HyperPay', 'Telr', 'Network International'],
    trends: 'Cash on delivery declining 5pp/year, BNPL adoption fast UAE/KSA, Egypt instant payment maturing',
    pain: 'Cash on delivery fraud, Sharia structuring, multi-currency, exit-of-funds restrictions in EG',
  },
  IL: {
    local_methods: ['Bit', 'Paybox', 'Israeli Postal Bank', 'Direct Debit (Hora\'at Keva)'],
    card_specifics: 'Isracard local network, Visa + MC widely accepted',
    regulators: ['Bank of Israel', 'ISA'],
    key_psps: ['Tranzila', 'Pelecard', 'CardCom', 'Stripe Israel'],
    trends: 'Bit + Paybox instant P2P growing, Open Banking maturing',
    pain: 'Hebrew-language merchant interfaces, currency hedging USD/ILS',
  },
  AFRICA: {
    local_methods: ['M-Pesa (KE/TZ)', 'MTN MoMo (regional)', 'Airtel Money', 'Flutterwave', 'Paystack', 'Cellulant'],
    card_specifics: 'Cards <20% in most markets, mobile money dominant',
    regulators: ['Per country: CBN (NG), CBK (KE), SARB (ZA)'],
    key_psps: ['Flutterwave', 'Paystack (now Stripe)', 'Cellulant', 'DPO Group', 'Yoco (ZA)'],
    trends: 'Mobile money 50%+ of transactions in EA, cross-border PAPSS launching, regional consolidation',
    pain: 'FX restrictions, mobile money interop, KYC tiered limits',
  },
  GLOBAL: {
    local_methods: ['Varies by deployment region — see specific country contexts'],
    card_specifics: 'Visa + Mastercard universal, Amex premium, UnionPay APAC, Discover US',
    regulators: ['Region-dependent: GDPR (EU), PCI-DSS global'],
    key_psps: ['Stripe', 'Adyen', 'Checkout.com', 'Worldpay', 'PayPal/Braintree'],
    trends: 'Multi-PSP orchestration becoming standard at >$100M GMV, tokenization mandates spreading, A2A growing globally',
    pain: 'Per-region acquirer integration, multi-currency settlement, regional approval rate variance',
  },
}

/**
 * Title-aware angle hint for the AI prompt. Helps prioritize which value-prop
 * resonates most with the role.
 */
export function angleHintForFunction(functional: FunctionalScope, seniority: Seniority): string {
  const hints: Record<FunctionalScope, string> = {
    engineering: 'integration burden, single API replaces N PSP integrations, engineering bandwidth, future-proof stack',
    product: 'checkout conversion, approval rate UX, time-to-market for new payment methods, product velocity',
    finance: 'cost-of-payments line, MDR optimization, vendor-agnostic negotiation leverage, blended take rate, scheme fees',
    risk_fraud: 'multi-vendor fraud aggregation, BIN-level decisioning, decline reason analysis, chargeback reduction',
    commercial: 'partner-friendly orchestration, GMV uplift via approval rate, geo expansion to capture new markets',
    operations: 'unified reconciliation, single pane of glass for N PSPs, settlement consolidation',
    retail_bank: 'consumer payment flows, local APMs by region, regulatory compliance per jurisdiction (FCA/CNBV/etc)',
    corporate_bank: 'B2B payment rails, SWIFT/wire alternatives, cross-border treasury',
    group_holding: 'group-wide payment strategy, M&A integration, multi-entity reconciliation',
    general_management: 'strategic competitive positioning, growth via better unit economics, partnership / build-vs-buy',
  }
  const seniorityPrefix = seniority === 'c_level' ? 'Strategic + competitive lens. ' :
                          seniority === 'vp_director' ? 'Owns the metric. ' :
                          seniority === 'head' ? 'Hands-on owner. ' :
                          seniority === 'manager' ? 'Operational details + roadmap. ' :
                          'Implementation specifics. '
  return seniorityPrefix + hints[functional]
}
