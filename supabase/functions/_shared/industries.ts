// Controlled-vocabulary industry classification + take-rate lookup for SDR BC.
// Source: tasks/industria-take-rate.txt (37 industries, take_rate as % of TPV).
// Every client must be classified into exactly ONE of these by the synthesis LLM.

export interface IndustryEntry {
  category: string
  take_rate_pct: number
  // Reasonable typical global average order value (USD) for this vertical.
  // Used as a fallback when the deep-research LLM cannot find a company-specific
  // ticket from public sources. Always paired with `warnings.ticket_industry_default`
  // and confidence='low' so the deck signals it's an estimate.
  default_ticket_usd: number
}

export const INDUSTRIES: IndustryEntry[] = [
  { category: 'Neobanks',                  take_rate_pct: 2,    default_ticket_usd: 50 },
  { category: 'Remittance',                take_rate_pct: 5,    default_ticket_usd: 200 },
  { category: 'Social/Advertising',        take_rate_pct: 70,   default_ticket_usd: 15 },
  { category: 'Streaming',                 take_rate_pct: 40,   default_ticket_usd: 10 },
  { category: 'SuperApps/Delivery Apps',   take_rate_pct: 15,   default_ticket_usd: 20 },
  { category: 'Cinema',                    take_rate_pct: 25,   default_ticket_usd: 15 },
  { category: 'Ticketing',                 take_rate_pct: 22,   default_ticket_usd: 80 },
  { category: 'Payroll',                   take_rate_pct: 2,    default_ticket_usd: 500 },
  { category: 'PSP',                       take_rate_pct: 0.5,  default_ticket_usd: 100 },
  { category: 'Telecom',                   take_rate_pct: 55,   default_ticket_usd: 40 },
  { category: 'Adult Content',             take_rate_pct: 18,   default_ticket_usd: 25 },
  { category: 'Crypto',                    take_rate_pct: 1,    default_ticket_usd: 300 },
  { category: 'Dating',                    take_rate_pct: 65,   default_ticket_usd: 25 },
  { category: 'Gambling/Sports Betting',   take_rate_pct: 8,    default_ticket_usd: 50 },
  { category: 'Gaming',                    take_rate_pct: 55,   default_ticket_usd: 15 },
  { category: 'Investing',                 take_rate_pct: 0.3,  default_ticket_usd: 1000 },
  { category: 'Airlines',                  take_rate_pct: 22,   default_ticket_usd: 400 },
  { category: 'Train/bus/cruise Tickets',  take_rate_pct: 18,   default_ticket_usd: 80 },
  { category: 'Car Rental',                take_rate_pct: 25,   default_ticket_usd: 250 },
  { category: 'Hospitality/Hotels',        take_rate_pct: 40,   default_ticket_usd: 220 },
  { category: 'Ridesharing/Mobility',      take_rate_pct: 11,   default_ticket_usd: 15 },
  { category: 'Travel/OTAs',               take_rate_pct: 13,   default_ticket_usd: 500 },
  { category: 'Cosmetics',                 take_rate_pct: 60,   default_ticket_usd: 50 },
  { category: 'Direct Selling',            take_rate_pct: 30,   default_ticket_usd: 80 },
  { category: 'Food and drinks',           take_rate_pct: 25,   default_ticket_usd: 30 },
  { category: 'Luxury goods/Apparel',      take_rate_pct: 60,   default_ticket_usd: 180 },
  { category: 'Marketplace',               take_rate_pct: 11,   default_ticket_usd: 60 },
  { category: 'Retail (Pets, Electronics)', take_rate_pct: 30,  default_ticket_usd: 75 },
  { category: 'AI',                        take_rate_pct: 50,   default_ticket_usd: 25 },
  { category: 'Digital Goods',             take_rate_pct: 65,   default_ticket_usd: 15 },
  { category: 'Hosting',                   take_rate_pct: 30,   default_ticket_usd: 50 },
  { category: 'SaaS',                      take_rate_pct: 70,   default_ticket_usd: 60 },
  { category: 'Cybersecurity',             take_rate_pct: 70,   default_ticket_usd: 120 },
  { category: 'e-learning',                take_rate_pct: 45,   default_ticket_usd: 60 },
  { category: 'Fitness',                   take_rate_pct: 45,   default_ticket_usd: 30 },
  { category: 'Healthcare',                take_rate_pct: 40,   default_ticket_usd: 120 },
  { category: 'Insurance',                 take_rate_pct: 15,   default_ticket_usd: 150 },
]

// Median take_rate as fallback when classification fails.
// Used together with `industry_warning: true` on the deck.
export const FALLBACK_INDUSTRY: IndustryEntry = { category: 'Marketplace', take_rate_pct: 11, default_ticket_usd: 60 }

const INDUSTRY_LOOKUP = new Map(
  INDUSTRIES.map(i => [i.category.toLowerCase(), i]),
)

export function lookupIndustry(category: string | null | undefined): IndustryEntry | null {
  if (!category) return null
  return INDUSTRY_LOOKUP.get(category.toLowerCase().trim()) ?? null
}

export const INDUSTRY_CATEGORIES_FOR_PROMPT = INDUSTRIES.map(i => i.category).join(', ')

// Compact catalog payload for UI dropdowns (sdr-bc-research).
// Avoids leaking `default_ticket_usd` to the frontend — that's a math-side detail.
export interface IndustryCatalogEntry {
  category: string
  take_rate_pct: number
}
export function listIndustries(): IndustryCatalogEntry[] {
  return INDUSTRIES.map(({ category, take_rate_pct }) => ({ category, take_rate_pct }))
}
