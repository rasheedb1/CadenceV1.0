// Friction-tax benchmarks por industria para el deck Yuno One-Click.
// Las cifras son aproximaciones derivadas de Baymard Institute (e-commerce
// abandonment baseline ~70%), Statista vertical reports y estudios públicos de
// orquestadores. Cada entry incluye:
//   - abandonment_rate_pct: % de carritos abandonados en checkout (CNP)
//   - avg_form_fields: número promedio de campos en checkout mobile del vertical
//   - mobile_share_pct: % de tráfico mobile típico para LATAM (informativo)
//
// Estas cifras alimentan slide 04 (Friction tax) y slide 19 (Conversion uplift)
// del deck. Son orientativas — Yuno One-Click se vende por su propia red, no
// por benchmarks ajenos. Se citan agrupadas, nunca como verdad absoluta.
//
// Categorías mantienen 1:1 paridad con `industries.ts` (37 verticals).

export interface FrictionEntry {
  abandonment_rate_pct: number
  avg_form_fields: number
  mobile_share_pct: number
}

export const FRICTION_BY_INDUSTRY: Record<string, FrictionEntry> = {
  'Neobanks':                    { abandonment_rate_pct: 65, avg_form_fields: 10, mobile_share_pct: 78 },
  'Remittance':                  { abandonment_rate_pct: 72, avg_form_fields: 14, mobile_share_pct: 80 },
  'Social/Advertising':          { abandonment_rate_pct: 55, avg_form_fields:  8, mobile_share_pct: 88 },
  'Streaming':                   { abandonment_rate_pct: 50, avg_form_fields:  9, mobile_share_pct: 72 },
  'SuperApps/Delivery Apps':     { abandonment_rate_pct: 62, avg_form_fields:  9, mobile_share_pct: 92 },
  'Cinema':                      { abandonment_rate_pct: 60, avg_form_fields:  9, mobile_share_pct: 85 },
  'Ticketing':                   { abandonment_rate_pct: 78, avg_form_fields: 12, mobile_share_pct: 70 },
  'Payroll':                     { abandonment_rate_pct: 45, avg_form_fields: 12, mobile_share_pct: 55 },
  'PSP':                         { abandonment_rate_pct: 50, avg_form_fields: 10, mobile_share_pct: 60 },
  'Telecom':                     { abandonment_rate_pct: 70, avg_form_fields: 11, mobile_share_pct: 78 },
  'Adult Content':               { abandonment_rate_pct: 68, avg_form_fields:  9, mobile_share_pct: 82 },
  'Crypto':                      { abandonment_rate_pct: 72, avg_form_fields: 12, mobile_share_pct: 70 },
  'Dating':                      { abandonment_rate_pct: 65, avg_form_fields:  9, mobile_share_pct: 88 },
  'Gambling/Sports Betting':     { abandonment_rate_pct: 70, avg_form_fields: 11, mobile_share_pct: 84 },
  'Gaming':                      { abandonment_rate_pct: 62, avg_form_fields:  9, mobile_share_pct: 80 },
  'Investing':                   { abandonment_rate_pct: 68, avg_form_fields: 13, mobile_share_pct: 65 },
  'Airlines':                    { abandonment_rate_pct: 85, avg_form_fields: 15, mobile_share_pct: 68 },
  'Train/bus/cruise Tickets':    { abandonment_rate_pct: 82, avg_form_fields: 13, mobile_share_pct: 72 },
  'Car Rental':                  { abandonment_rate_pct: 80, avg_form_fields: 14, mobile_share_pct: 60 },
  'Hospitality/Hotels':          { abandonment_rate_pct: 78, avg_form_fields: 13, mobile_share_pct: 70 },
  'Ridesharing/Mobility':        { abandonment_rate_pct: 58, avg_form_fields:  8, mobile_share_pct: 96 },
  'Travel/OTAs':                 { abandonment_rate_pct: 85, avg_form_fields: 15, mobile_share_pct: 72 },
  'Cosmetics':                   { abandonment_rate_pct: 72, avg_form_fields: 12, mobile_share_pct: 85 },
  'Direct Selling':              { abandonment_rate_pct: 70, avg_form_fields: 12, mobile_share_pct: 75 },
  'Food and drinks':             { abandonment_rate_pct: 65, avg_form_fields:  9, mobile_share_pct: 90 },
  'Luxury goods/Apparel':        { abandonment_rate_pct: 76, avg_form_fields: 12, mobile_share_pct: 80 },
  'Marketplace':                 { abandonment_rate_pct: 76, avg_form_fields: 12, mobile_share_pct: 82 },
  'Retail (Pets, Electronics)':  { abandonment_rate_pct: 74, avg_form_fields: 12, mobile_share_pct: 78 },
  'AI':                          { abandonment_rate_pct: 48, avg_form_fields:  8, mobile_share_pct: 55 },
  'Digital Goods':               { abandonment_rate_pct: 55, avg_form_fields:  9, mobile_share_pct: 78 },
  'Hosting':                     { abandonment_rate_pct: 50, avg_form_fields: 10, mobile_share_pct: 60 },
  'SaaS':                        { abandonment_rate_pct: 50, avg_form_fields: 10, mobile_share_pct: 60 },
  'Cybersecurity':               { abandonment_rate_pct: 48, avg_form_fields: 11, mobile_share_pct: 55 },
  'e-learning':                  { abandonment_rate_pct: 68, avg_form_fields: 11, mobile_share_pct: 75 },
  'Fitness':                     { abandonment_rate_pct: 66, avg_form_fields: 10, mobile_share_pct: 84 },
  'Healthcare':                  { abandonment_rate_pct: 70, avg_form_fields: 13, mobile_share_pct: 68 },
  'Insurance':                   { abandonment_rate_pct: 78, avg_form_fields: 14, mobile_share_pct: 62 },
}

// Promedio global usado como fallback si la industria no está mapeada.
// Source: Baymard ~70%, ajustado para mobile LATAM ~76%.
export const FRICTION_FALLBACK: FrictionEntry = {
  abandonment_rate_pct: 75,
  avg_form_fields: 11,
  mobile_share_pct: 78,
}

export function lookupFriction(category: string | null | undefined): FrictionEntry {
  if (!category) return FRICTION_FALLBACK
  return FRICTION_BY_INDUSTRY[category] ?? FRICTION_FALLBACK
}
