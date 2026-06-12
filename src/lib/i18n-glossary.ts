// Yuno terminology glossary in es / en / pt.
//
// PURPOSE — Single source of truth for how Yuno's product, sales and finance
// vocabulary gets translated across the three deck systems (Workshops BC, SDR
// BC, SS Deck). When the translation agent generates copy for slides, it MUST
// honor this mapping so the same concept reads identically across decks.
//
// HOW TO USE — The dict is loaded as context for the translation LLM. It is
// also imported by deck UIs for tooltip labels. Do not import it inside
// generated slide JSX (that's what the per-deck i18n dicts are for); import
// it only where you need the canonical term itself.
//
// Adding a term:
//   1. Append below.
//   2. Use the canonical Yuno casing (e.g. "Smart Routing" — capitalised,
//      treated as a product name; "MDR" — all-caps initialism).
//   3. Provide ALL three languages. No fallback to English.
//   4. If a term is intentionally kept in English in es/pt (e.g. "MDR",
//      "Smart Routing"), repeat the English string in those slots so it's
//      visible in code review that the decision is deliberate.

export type Lang = 'es' | 'en' | 'pt'

export interface GlossaryEntry {
  /** Canonical English term (also acts as lookup key in the slide i18n dicts). */
  en: string
  /** LATAM Spanish — tuteo, warm-professional. */
  es: string
  /** Brazilian Portuguese — voce, warm-professional. */
  pt: string
  /** Optional context for the translator so the same English word with
   *  different meanings can be disambiguated. */
  note?: string
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  // ── Core payment vocabulary ─────────────────────────────────────────────
  auth_rate: {
    en: 'authorization rate',
    es: 'tasa de aprobación',
    pt: 'taxa de aprovação',
    note: 'aka acceptance rate; %% of attempted card transactions that get approved by the issuer',
  },
  authorization_rate: { en: 'authorization rate', es: 'tasa de aprobación', pt: 'taxa de aprovação' },
  acceptance_rate: { en: 'acceptance rate', es: 'tasa de aceptación', pt: 'taxa de aceitação' },
  approval_rate: { en: 'approval rate', es: 'tasa de aprobación', pt: 'taxa de aprovação' },
  approval_uplift: {
    en: 'approval rate uplift',
    es: 'mejora en la tasa de aprobación',
    pt: 'aumento da taxa de aprovação',
    note: 'always pair with a unit when used as a metric: "+3pp uplift" / "+3pp de mejora" / "+3pp de aumento"',
  },
  take_rate: {
    en: 'take rate',
    es: 'take rate',
    pt: 'take rate',
    note: 'kept in English — industry term, no clean translation. Used in Workshops BC math (15%).',
  },
  mdr: {
    en: 'MDR',
    es: 'MDR',
    pt: 'MDR',
    note: 'Merchant Discount Rate — fee % charged by the acquirer on each transaction. Never spell out.',
  },
  mdr_savings: {
    en: 'MDR savings',
    es: 'ahorro en MDR',
    pt: 'economia em MDR',
  },
  tpv: {
    en: 'TPV',
    es: 'TPV',
    pt: 'TPV',
    note: 'Total Payment Volume — also keep as "TPV" across all 3 languages.',
  },
  monthly_tpv: { en: 'monthly TPV', es: 'TPV mensual', pt: 'TPV mensal' },
  annual_tpv: { en: 'annual TPV', es: 'TPV anual', pt: 'TPV anual' },
  incremental_tpv: { en: 'incremental TPV', es: 'TPV incremental', pt: 'TPV incremental' },
  delta_tpv: { en: 'Δ TPV', es: 'Δ TPV', pt: 'Δ TPV', note: 'use the delta glyph; treat as a column header symbol' },
  delta_ar: { en: 'Δ AR', es: 'Δ TA', pt: 'Δ TA', note: 'AR = authorization rate; TA = tasa de aprobación / taxa de aprovação. Pp suffix added separately.' },

  // ── Cost levers ────────────────────────────────────────────────────────
  antifraud: { en: 'antifraud', es: 'antifraude', pt: 'antifraude' },
  antifraud_savings: { en: 'antifraud savings', es: 'ahorro en antifraude', pt: 'economia em antifraude' },
  antifraud_per_attempt: {
    en: 'antifraud cost per attempt',
    es: 'costo de antifraude por intento',
    pt: 'custo de antifraude por tentativa',
    note: 'critical math distinction — antifraud is charged per attempt, not per approval',
  },
  per_attempt: { en: 'per attempt', es: 'por intento', pt: 'por tentativa' },
  chargeback: { en: 'chargeback', es: 'contracargo', pt: 'chargeback', note: 'PT keeps the English; ES uses "contracargo"' },
  cost_reduction: { en: 'cost reduction', es: 'reducción de costos', pt: 'redução de custos' },
  cost_savings: { en: 'cost savings', es: 'ahorro en costos', pt: 'economia de custos' },

  // ── Yuno products (proper names — keep English casing) ─────────────────
  smart_routing: {
    en: 'Smart Routing',
    es: 'Smart Routing',
    pt: 'Smart Routing',
    note: 'product name — DO NOT translate. Body copy can elaborate ("ruteo inteligente entre adquirentes") but the proper noun stays in English.',
  },
  smart_3ds: { en: 'Smart 3DS', es: 'Smart 3DS', pt: 'Smart 3DS' },
  network_tokens: { en: 'Network Tokens', es: 'Network Tokens', pt: 'Network Tokens' },
  account_updater: { en: 'Account Updater', es: 'Account Updater', pt: 'Account Updater' },
  payment_concierge: { en: 'Payment Concierge', es: 'Payment Concierge', pt: 'Payment Concierge' },
  nova_ai: { en: 'Nova AI', es: 'Nova AI', pt: 'Nova AI' },
  monitors: { en: 'Monitors', es: 'Monitors', pt: 'Monitors' },
  yuno_sdk_toolkit: { en: 'Yuno SDK Toolkit', es: 'Yuno SDK Toolkit', pt: 'Yuno SDK Toolkit' },
  checkout_builder: { en: 'Checkout Builder', es: 'Checkout Builder', pt: 'Checkout Builder' },

  // ── Players in the stack ───────────────────────────────────────────────
  acquirer: { en: 'acquirer', es: 'adquirente', pt: 'adquirente' },
  acquirers: { en: 'acquirers', es: 'adquirentes', pt: 'adquirentes' },
  issuer: { en: 'issuer', es: 'emisor', pt: 'emissor' },
  psp: { en: 'PSP', es: 'PSP', pt: 'PSP' },
  gateway: { en: 'gateway', es: 'gateway', pt: 'gateway' },
  apm: { en: 'APM', es: 'APM', pt: 'APM', note: 'Alternative Payment Method — kept as acronym across langs' },
  apms: { en: 'APMs', es: 'APMs', pt: 'APMs' },
  alternative_payment_method: {
    en: 'alternative payment method',
    es: 'método alternativo de pago',
    pt: 'método alternativo de pagamento',
  },
  payment_method: { en: 'payment method', es: 'método de pago', pt: 'método de pagamento' },
  bin: { en: 'BIN', es: 'BIN', pt: 'BIN' },
  pci_dss: { en: 'PCI DSS Level 1', es: 'PCI DSS Nivel 1', pt: 'PCI DSS Nível 1' },

  // ── Orchestration vocabulary ───────────────────────────────────────────
  orchestration: { en: 'orchestration', es: 'orquestación', pt: 'orquestração' },
  payment_orchestration: { en: 'payment orchestration', es: 'orquestación de pagos', pt: 'orquestração de pagamentos' },
  orchestration_layer: { en: 'orchestration layer', es: 'capa de orquestación', pt: 'camada de orquestração' },
  routing: { en: 'routing', es: 'ruteo', pt: 'roteamento' },
  intelligent_routing: { en: 'intelligent routing', es: 'ruteo inteligente', pt: 'roteamento inteligente' },
  failover: { en: 'failover', es: 'failover', pt: 'failover', note: 'kept in English across all langs — industry term' },
  auto_failover: { en: 'auto-failover', es: 'failover automático', pt: 'failover automático' },
  retries: { en: 'retries', es: 'reintentos', pt: 'novas tentativas' },
  reconciliation: { en: 'reconciliation', es: 'reconciliación', pt: 'reconciliação' },
  settlement: { en: 'settlement', es: 'settlement', pt: 'settlement' },
  dispute: { en: 'dispute', es: 'disputa', pt: 'disputa' },
  refund: { en: 'refund', es: 'reembolso', pt: 'reembolso' },
  payout: { en: 'payout', es: 'payout', pt: 'payout' },

  // ── Markets / geography labels ─────────────────────────────────────────
  cross_border: {
    en: 'cross-border',
    es: 'cross-border',
    pt: 'cross-border',
    note: 'kept in English in body copy; tagline contexts may use "internacional" / "transfronteiriço"',
  },
  local_acquiring: { en: 'local acquiring', es: 'adquirencia local', pt: 'adquirência local' },
  international: { en: 'international', es: 'internacional', pt: 'internacional' },
  region: { en: 'region', es: 'región', pt: 'região' },
  market: { en: 'market', es: 'mercado', pt: 'mercado' },
  market_context: { en: 'Market Context', es: 'Contexto de Mercado', pt: 'Contexto de Mercado' },

  // ── Sales/BC framing ───────────────────────────────────────────────────
  business_case: { en: 'business case', es: 'business case', pt: 'business case' },
  diagnostic: { en: 'diagnostic', es: 'diagnóstico', pt: 'diagnóstico' },
  the_solve: { en: 'the solve', es: 'la solución', pt: 'a solução' },
  product_suite: { en: 'product suite', es: 'suite de producto', pt: 'suíte de produtos' },
  global_presence: { en: 'global presence', es: 'presencia global', pt: 'presença global' },
  leadership: { en: 'leadership', es: 'liderazgo', pt: 'liderança' },
  trusted_by: { en: 'trusted by', es: 'clientes que confían en Yuno', pt: 'empresas que confiam em Yuno' },
  next_steps: { en: 'next steps', es: 'próximos pasos', pt: 'próximos passos' },
  agenda: { en: 'agenda', es: 'agenda', pt: 'agenda' },
  thanks: { en: 'thank you', es: 'gracias', pt: 'obrigado' },

  // ── Metric labels ──────────────────────────────────────────────────────
  annual_impact: { en: 'annual impact', es: 'impacto anual', pt: 'impacto anual' },
  annual_savings: { en: 'annual savings', es: 'ahorro anual', pt: 'economia anual' },
  monthly_savings: { en: 'monthly savings', es: 'ahorro mensual', pt: 'economia mensal' },
  estimated_annual_savings: { en: 'estimated annual savings', es: 'ahorro anual estimado', pt: 'economia anual estimada' },
  revenue_uplift: { en: 'revenue uplift', es: 'aumento de ingresos', pt: 'aumento de receita' },
  incremental_revenue: { en: 'incremental revenue', es: 'ingreso incremental', pt: 'receita incremental' },
  total_impact: { en: 'total impact', es: 'impacto total', pt: 'impacto total' },
  combined_annual_impact: { en: 'combined annual impact', es: 'impacto anual combinado', pt: 'impacto anual combinado' },
  assumptions: { en: 'assumptions', es: 'supuestos', pt: 'premissas' },

  // ── Time / scheduling ──────────────────────────────────────────────────
  week: { en: 'week', es: 'semana', pt: 'semana' },
  month: { en: 'month', es: 'mes', pt: 'mês' },
  quarter: { en: 'quarter', es: 'trimestre', pt: 'trimestre' },
  year: { en: 'year', es: 'año', pt: 'ano' },
  per_year: { en: 'per year', es: 'por año', pt: 'por ano' },
  per_month: { en: 'per month', es: 'por mes', pt: 'por mês' },

  // ── UI / general ───────────────────────────────────────────────────────
  contact_us: { en: 'Contact us', es: 'Contáctanos', pt: 'Fale conosco' },
  get_in_touch: { en: 'Get in touch', es: 'Contáctanos', pt: 'Entre em contato' },
  book_demo: { en: 'Book a demo', es: 'Agenda una demo', pt: 'Agende uma demo' },
  learn_more: { en: 'Learn more', es: 'Conoce más', pt: 'Saiba mais' },
  customers: { en: 'customers', es: 'clientes', pt: 'clientes' },
  case_study: { en: 'case study', es: 'caso de éxito', pt: 'estudo de caso' },
  case_studies: { en: 'case studies', es: 'casos de éxito', pt: 'casos de sucesso' },
}

/** Lookup a term in the specified language. Returns the English original
 *  on missing key so the surface fails visibly rather than silently. */
export function term(key: string, lang: Lang): string {
  const entry = GLOSSARY[key]
  if (!entry) return key
  return entry[lang] ?? entry.en
}
