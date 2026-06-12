// Banking vertical deck data. Loaded when the viewer route is /m/banking.
// Parallel to the Supabase-backed merchant mode: instead of pitching a
// specific merchant, this deck is addressed TO the bank as buyer. Every
// string is written as a benefit the bank executive would underline
// (merchant reach, regional expansion, white-label control, protocol
// neutrality, agentic lead). Three-Layer Playbook frame kept intact:
// Wedge → Multiplier → Platform → Agentic Layer.
//
// The MODE flag is what individual slides branch on to swap observations,
// chips, badges, and headline copy.

export const BANKING_DATA = {
  MODE: 'banking',
  // Generic placeholder rendered as the bank name everywhere a specific
  // bank logo would normally sit. SlideCover uses this exact string as
  // a sentinel to swap to the generic "Built for your bank" header.
  COMPANY_NAME: 'Your Bank',
  COMPANY_LOGO: null,
  COMPANY_LOGO_MONO: null,

  // ---------- Slide 2 (Infrastructure): what the bank gains ----------
  // Three observations reframed as benefits to the bank: merchant reach,
  // regional expansion, and white-label control. Strong text keys land
  // on the benefit, not the competitive commentary.
  INFRA_OBSERVATIONS: [
    { text: 'Your merchants get 1,000+ payment methods across 190+ countries without a new integration.',
      strong: ['1,000+ payment methods', '190+ countries'] },
    { text: 'Extend your operating perimeter across LATAM, APAC, and MEA on day one, under your brand.',
      strong: ['LATAM, APAC, and MEA', 'under your brand'] },
    { text: 'Keep the customer relationship, commercial control, and brand. Yuno is the engine underneath.',
      strong: ['Keep the customer relationship', 'engine underneath'] },
  ],

  // Slide 2 bottom stats — coverage numbers the bank inherits by plugging in.
  INFRA_STATS: [
    { number: '460+',
      strong: 'integrations', tail: ' ready to ship under your brand, no new contracts to sign.' },
    { number: '1,000+',
      strong: 'local methods', tail: ' from Pix to UPI to mada, live in your merchants\' checkouts.' },
  ],

  // ---------- Slide 3 (Diagnostic): strategic opportunities ----------
  // The five cards were previously market commentary; now each is a
  // strategic opening for the bank, framed as "here is what you gain".
  PAIN_1_TITLE: 'Merchant reach without the integration tax',
  PAIN_1_TAG:   'REACH',
  PAIN_1_DESC:  'Offer your merchants 1,000+ methods and 460+ integrations on day one. You sell the reach, Yuno carries the build.',

  PAIN_2_TITLE: 'Regional expansion on day one',
  PAIN_2_TAG:   'EXPANSION',
  PAIN_2_DESC:  'Activate LATAM, APAC, and MEA flows without standing up local entities for each corridor. Your footprint extends the moment you connect.',

  PAIN_3_TITLE: 'Your brand, your customer, your commercials',
  PAIN_3_TAG:   'WHITE-LABEL',
  PAIN_3_DESC:  'Keep full ownership of the merchant relationship and the economics. Yuno renders inside your portal, signs with your JWT, and never competes for the end customer.',

  PAIN_4_TITLE: 'Stay neutral across every protocol',
  PAIN_4_TAG:   'NEUTRALITY',
  PAIN_4_DESC:  'Plug into agentic commerce without locking into ACP, UCP, or any single scheme. Your stack stays independent of whoever authors the next protocol.',

  PAIN_5_TITLE: 'Agentic layer already in production',
  PAIN_5_TAG:   'AGENTIC LEAD',
  PAIN_5_DESC:  'NOVA recovers end-user declines, Payments Concierge sits inside your ops team. Live today, with roughly a 12-month lead on everyone else pitching banks.',

  // PSPs placeholder for the topology diagram — rendered as "current stack"
  // around the bank node. Earlier versions named real products (CyberSource,
  // MPGS) which only apply to a subset of banks; switched to category labels
  // so any bank audience reads themselves in it without us claiming a stack
  // they don't actually run.
  PSPS: [
    { name: 'Acquiring layer', role: 'Single gateway' },
    { name: 'Issuing layer',   role: 'In-house only' },
    { name: 'Risk engine',     role: 'Manual rules' },
    { name: 'Local rails',     role: 'Country by country' },
  ],

  // Slide 3 consolidated "What Yuno enables" pill list. Banking mode
  // hides the Capability Stack chip row entirely (every chip would show
  // as missing and overlapped with these pills — White-Label vs
  // White-label dashboard, Multi-Tenant vs Multi-tenant hierarchy), so
  // the unique stack items (PCI Vault, Reconciliation, KYC/KYB, Tax,
  // BaaS) live here instead. One section, one read.
  LOCAL_METHODS_MISSING: [
    { method: 'Non-custodial',           market: 'Settlement direct to the bank' },
    { method: 'Multi-market activation', market: 'Configure, don’t build' },
    { method: 'LATAM coverage',          market: 'Extend your perimeter' },
    { method: 'APAC coverage',           market: 'Extend your perimeter' },
    { method: 'MEA coverage',            market: 'Extend your perimeter' },
    { method: 'White-label dashboard',   market: 'Under your brand' },
    { method: 'Multi-tenant hierarchy',  market: 'Holding co to branches' },
    { method: 'PCI Vault',               market: 'Tokenization at scale' },
    { method: 'Reconciliation',          market: 'Across every PSP' },
    { method: 'KYC/KYB',                 market: 'Onboarding ready' },
    { method: 'Tax + BaaS modules',      market: 'Switch on per market' },
    { method: 'Agentic commerce',        market: 'NOVA + Payments Concierge' },
    { method: 'Protocol neutrality',     market: 'Independent of ACP, UCP' },
  ],

  // Capability stack section is hidden for banking (see SlideDiagnostic).
  // Field kept for shape compatibility with the merchant data path.
  CAPABILITIES_LIVE: [],

  // ---------- Slide 4 (Yuno Solves): Three-Layer Playbook ----------
  // Wedge → Multiplier → Platform (+ Agentic). Each description is
  // rewritten to center on what the bank gains at that layer, not on
  // Yuno's internal workstream.
  CAPABILITY_1_TITLE: 'Wedge',
  CAPABILITY_1_DESC:  'Start narrow. Plug Yuno in behind one capability — smart routing, cascade recovery, or PCI Vault Tokenization — and prove uptime and auth uplift before expanding. Non-custodial: Yuno handles messages, not money. Settlement flows direct to the bank.',

  CAPABILITY_2_TITLE: 'Multiplier',
  CAPABILITY_2_DESC:  'Turn Yuno on for your whole merchant portfolio. White-label dashboard, checkout, and SDK under your brand, so every merchant you acquire inherits the full stack. Bank-grade compliance built in: PCI-DSS Level 1, SOC2 Type II, 99.99% uptime.',

  CAPABILITY_3_TITLE: 'Platform',
  CAPABILITY_3_DESC:  'Run your bank on Yuno infrastructure end to end. Multi-tenant hierarchy from holding co to branches, per-jurisdiction data residency, regulator-ready reporting. Activating the next market is configuration, not engineering — months, not years across your footprint.',

  CAPABILITY_4_TITLE: 'Agentic Layer',
  CAPABILITY_4_DESC:  'NOVA and Payments Concierge embedded inside your ops teams, roughly a 12-month lead over anyone else pitching you, and protocol-neutral so your bank stays independent of ACP, UCP, and any single scheme.',
}
