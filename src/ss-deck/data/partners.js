// Partners vertical deck data. Loaded when the landing page selection is
// tagged type='partner' (APMs, PSPs, fraud providers, consulting firms,
// acquirers, networks). Parallel to banking.js: the deck reuses the same
// shell but skips the Diagnostic slide via SlideViewer (partners span too
// many industries for a per-partner deep-dive to land), and reframes
// YunoSolve to "what we deliver to merchants today" so the partner can
// see what Yuno does in front of the merchant base they would plug into.
//
// The per-partner value proposition is intentionally NOT in the deck.
// Each partnerships rep articulates that in voice-over during the
// conversation. The deck establishes:
//   1. What problem we solve (Infrastructure + YunoSolve)
//   2. Who we are (Leadership)
// Everything else is the conversation, not the slides.

export const PARTNER_DATA = {
  MODE: 'partner',
  COMPANY_NAME: 'Partner',
  COMPANY_LOGO: null,
  COMPANY_LOGO_MONO: null,

  // Slide 4 (YunoSolve) capability cards — reused from the merchant default
  // so the partner sees the actual Yuno value props delivered to merchants,
  // not a partner-facing pitch (Wedge / Multiplier / Platform). Generic
  // copy with no per-merchant placeholders.
  CAPABILITY_1_TITLE: 'Smart Routing',
  CAPABILITY_1_DESC:  'Per-transaction decisioning across every acquirer lifts auth rate on every merchant flow without a single engineering sprint on their side.',

  CAPABILITY_2_TITLE: 'Failover & Retries',
  CAPABILITY_2_DESC:  'Automatic cascade across processors rescues declined transactions in real time, turning involuntary churn into recovered revenue.',

  CAPABILITY_3_TITLE: 'Local Payment Methods',
  CAPABILITY_3_DESC:  '1,000+ APMs, wallets and local rails — UPI, Pix, iDEAL, Konbini, GrabPay — live through one integration, unlocking global conversion for every merchant on the platform.',

  CAPABILITY_4_TITLE: 'Unified Orchestration',
  CAPABILITY_4_DESC:  'One reconciliation, one analytics layer, one contract surface across every PSP and market, replacing a fragmented ops mesh with a single control plane.',
}
