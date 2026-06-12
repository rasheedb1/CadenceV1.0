---
title: SDR BC — Regional Cards Slide (numbers generator)
owner: rasheed
date: 2026-05-11
status: pending approval
scope: ONLY the cards slide per region (slide 02 family in public/sdr-bc/). APMs slide is the next plan.
---

# Plan — SDR BC Regional Cards Slide

## Goal

Generate the `{region}_cards_rows` payload + totals for every region with SimilarWeb traffic, for use by `public/sdr-bc/slides-02-business-case.jsx::RegionCardsSlide`.

Output contract per region (already defined by the deck stage):

```ts
data[`${region}_cards_rows`] = [
  { country: "Brazil", tpv: "180", ar: "+4", dtpv: "9", cost: "0.9" },
  ...up to 5 rows
]
data[`${KEY}_TPV_TOT`]     // Σ tpv
data[`${KEY}_TPVUPT`]      // Σ dtpv
data[`${KEY}_COST_REDTOT`] // Σ cost
data[`${KEY}_REVENUEUP`]   // OPEN — see Open Questions
```

`region` ∈ `{ us, latam, emea, mea, apac }` · `KEY = region.toUpperCase()`.

## Dependencies (status)

| Dep | Status |
|---|---|
| SimilarWeb `top_countries` (cached 30d) | ✅ live |
| `tasks/auth-rates-by-country.txt` (76 countries, REAL+AVG) | ✅ |
| `tasks/industria-take-rate.txt` (37 industries → take_rate %) | ✅ |
| `tasks/metodos-pago-por-pais.txt` (APMs por país, deferido a slide 2) | ✅ |
| `legal_entities[]` in deep-research output | ⚠️ exists but shallow → enhance (this plan) |
| `avg_ticket_usd` + `industry_category` in deep-research | ❌ add to synthesis (this plan) |
| SDR BC generator endpoint | ❌ build new (this plan) |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ /sdr-bc <ClientName> (skill, Claude Code) — ENGLISH ONLY        │
│   ↓ POST { client_name, website }                               │
│                                                                 │
│ ┌─ supabase/functions/sdr-bc-generate/index.ts (NEW) ─────────┐ │
│ │  1. Invoke chief-deep-research-company (force_refresh:false)│ │
│ │     Returns (enhanced):                                     │ │
│ │       • similarweb.top_countries[]                          │ │
│ │       • legal_entities[] per top country (high/med/low)     │ │
│ │       • avg_ticket_usd + ticket_confidence + ticket_source  │ │
│ │       • industry_category (one of 37) + take_rate_pct       │ │
│ │  2. Bucket top countries → regions (filter share >=1%)      │ │
│ │  3. For each region with ≥1 country:                        │ │
│ │       pick top-5 by share → compute 5 columns per country   │ │
│ │       compute totals incl. REVENUEUP = TPVUPT × take_rate   │ │
│ │  4. Persist `presentations.deck_data` (jsonb, language=en)  │ │
│ │  5. Return `https://chief.yuno.tools/sdr-bc/<slug>`         │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Deep-research enhancement (chief-deep-research-company)

The existing function runs once per client (30d cache). We add **three** new structured outputs to the synthesis JSON: `legal_entities[]` per top country (already exists but shallow — enhanced below), `avg_ticket_usd` with strict precision rules, and `industry_category` from the 37-row controlled list.

### New synthesis output (additions, NOT replacements)

```json
{
  // ...existing fields...
  "avg_ticket_usd": 42.50,
  "avg_ticket_confidence": "high" | "med" | "low" | "unknown",
  "avg_ticket_source_url": "https://...",
  "avg_ticket_evidence_quote": "Q3 2024 earnings: average order value $42.50",

  "industry_category": "SuperApps/Delivery Apps",
  "industry_take_rate_pct": 15,
  "industry_classification_evidence": "Rappi operates last-mile delivery across LATAM..."
}
```

### `avg_ticket_usd` precision rules (system prompt, hard rules)

> Find the company's GLOBAL average order value / ticket promedio. ORDERED preference:
> 1. **Official financial disclosure** (earnings call, 10-K, 20-F, investor presentation, prospectus) → `confidence: high`
> 2. **Reputable analyst report or trade press** with explicit number (Statista, eMarketer, Reuters, FT, Bloomberg, TechCrunch citing primary source) → `confidence: med`
> 3. **Industry benchmark applied to the company's vertical** (e.g. "fashion e-com average is $80") → `confidence: low`
> 4. **No credible source found** → `confidence: unknown`, `avg_ticket_usd: null`
>
> NEVER invent a number. NEVER average disparate currencies without conversion. ALWAYS cite `source_url` + quote.
> If multiple ticket sizes by region/product exist, prefer the **company-wide blended** number; otherwise the largest segment.

### `industry_category` rules (controlled vocabulary)

> Classify the company into EXACTLY ONE of these 37 industries (controlled vocabulary from `tasks/industria-take-rate.txt`):
> Neobanks, Remittance, Social/Advertising, Streaming, SuperApps/Delivery Apps, Cinema, Ticketing, Payroll, PSP, Telecom, Adult Content, Crypto, Dating, Gambling/Sports Betting, Gaming, Investing, Airlines, Train/bus/cruise Tickets, Car Rental, Hospitality/Hotels, Ridesharing/Mobility, Travel/OTAs, Cosmetics, Direct Selling, Food and drinks, Luxury goods/Apparel, Marketplace, Retail (Pets, Electronics), AI, Digital Goods, Hosting, SaaS, Cybersecurity, e-learning, Fitness, Healthcare, Insurance.
>
> Pick the **closest match by primary revenue stream**. If the company spans two, pick the one with majority revenue. Include 1-sentence justification in `industry_classification_evidence`.

### Local-entity research (phases)

#### Why enhance (not duplicate)

Existing function already runs 6 Firecrawl queries + LLM synthesis with `legal_entities[]` in the JSON schema. It's cached 30d per company. We **extend** the synthesis to be per-country precise; we do NOT add a new edge function.

#### Phase 1 (unchanged)

SimilarWeb `top_countries` + 5 Firecrawl generic queries fire in parallel. **Drop the current generic `entities` query** (line 170 of current file) — it's replaced below. Add 1 new generic query: `"{client}" "average order value" OR "average ticket" OR "AOV"` for the ticket precision rules (folded into Phase 1 since it's not country-scoped).

#### Phase 2 (new, awaits SimilarWeb result)

After SimilarWeb returns, take all countries with share ≥3% (cap at top 20). Bucket them by region and fire 1 Firecrawl query per region present, packed with that region's legal markers:

```
LATAM:  "{client}" ("CNPJ" OR "Ltda" OR "RFC" OR "S.A. de C.V."
                    OR "NIT" OR "CUIT" OR "S.A.S." OR "filial")
NA:     "{client}" ("EIN" OR "Inc." OR "LLC"
                    OR "incorporated in Delaware")
EMEA:   "{client}" ("Companies House" OR "Handelsregister"
                    OR "SIREN" OR "Ltd" OR "GmbH" OR "SAS" OR "S.L.")
MEA:    "{client}" ("LLC" OR "FZC" OR "FZE" OR "FZ-LLC"
                    OR "S.A.R.L." OR "WLL" OR "Pty Ltd")
APAC:   "{client}" ("Pte Ltd" OR "Pty Ltd" OR "Sdn Bhd"
                    OR "Co. Ltd" OR "Kabushiki Kaisha" OR "Pvt Ltd")
```

Cost ≈ same as today (was 1 generic, now ≤5 targeted, but most clients only have 1-3 regions of meaningful traffic → typically 2-3 queries).

#### Phase 3 (new, cheap operational heuristic)

Parallel `HEAD` request to `{root_domain}.{cctld}` for each top-N country:

```
rappi.com → rappi.com.br, rappi.com.mx, rappi.co, rappi.com.ar, ...
```

200/3xx response → `evidence: "country_domain"` (medium confidence).
Pure HTTP HEAD, ~0 cost, parallel, 3s timeout.

#### Phase 4 (synthesis prompt extension)

Synthesis LLM is told (added to system prompt):

> For EACH country in the SimilarWeb top_countries list, emit one entry in `legal_entities[]` with shape:
> ```json
> {
>   "country": "BR",
>   "has_entity": true | false | null,
>   "confidence": "high" | "med" | "low" | "unknown",
>   "entity_name": "Rappi Brasil Ltda" | null,
>   "evidence_type": "legal_filing" | "corp_disclosure" | "country_domain" | "press" | "inference",
>   "evidence_quote": "CNPJ 21.157.225/0001-00 — source: ...",
>   "source_url": "..."
> }
> ```
> `high` = explicit legal filing or corporate disclosure naming the entity.
> `med` = country-specific website (cctld) + operational mentions, no legal doc.
> `low` = press/inference only.
> `unknown` = no signal — set `has_entity: null`.

#### Phase 5 (deterministic mapping for BC — NOT in LLM)

In `sdr-bc-generate`:

```ts
const verifiedLocal = (e) =>
  e.has_entity === true && (e.confidence === 'high' || e.confidence === 'med');
// Anything else → no local entity (conservative).
```

#### Cost & cache

- Net Firecrawl: 7 queries (was 6) — drop the generic `entities` query, add `avg_ticket` query + 2-3 targeted entity batches by region
- HEAD pings: free
- LLM tokens: +~30-40% on synthesis (~$0.008) due to ticket + industry + per-country entity requirements
- **Cache: existing 30-day TTL on `account_map_companies.intelligence_synthesized_at`** — single request per client per month max
- **Anti-double-spend rule:** `sdr-bc-generate` ALWAYS calls deep-research with `force_refresh: false`. Refresh only when user explicitly invokes `/sdr-bc <client> --refresh`.

## Math per column

### Inputs per country `c`
- `share_c` = SimilarWeb `top_countries[c].share` (0..1)
- `visits_monthly_c` = SimilarWeb `top_countries[c].visits` (already country-scoped)
- `ticket_usd` = deep-research `avg_ticket_usd` (global, single value, applied to every country)
- `base_ar_c` = AUTH_RATES[c.iso] ?? REGIONAL_AVG_AR[region] ?? 0.80
- `has_entity_c` = verified-local (from deterministic mapping above)
- `take_rate_pct` = deep-research `industry_take_rate_pct` (resolved from the controlled industry vocabulary)

### Constants
- `CONVERSION = 0.07`
- `DELTA_AR_WITH_ENTITY = 2`     (pp)
- `DELTA_AR_NO_ENTITY = 4`       (pp)
- `DELTA_MDR_WITH_ENTITY = 20`   (bps)
- `DELTA_MDR_NO_ENTITY = 50`     (bps)

### Columns

```ts
// per country
const visits_annual = visits_monthly_c * 12;
const tpv_usd       = visits_annual * CONVERSION * ticket_usd;
const tpv_m         = tpv_usd / 1_000_000;

const delta_ar_pp   = has_entity_c ? DELTA_AR_WITH_ENTITY : DELTA_AR_NO_ENTITY;
const dtpv_m        = tpv_m * (delta_ar_pp / 100) / base_ar_c;   // multiplicative

const delta_mdr_bps = has_entity_c ? DELTA_MDR_WITH_ENTITY : DELTA_MDR_NO_ENTITY;
const cost_red_m    = tpv_m * (delta_mdr_bps / 10_000);

row = {
  country: c.name,
  tpv:   formatM(tpv_m),
  ar:    `+${delta_ar_pp}`,
  dtpv:  formatM(dtpv_m),
  cost:  formatM(cost_red_m),
};
```

`formatM(x)` rounds to 1 decimal if x<10, else integer; trims trailing zeros.

### Totals (per region)

```ts
const TPV_TOT     = sum(rows.tpv_m);
const TPVUPT      = sum(rows.dtpv_m);
const COST_REDTOT = sum(rows.cost_red_m);
const REVENUEUP   = TPVUPT * (take_rate_pct / 100);  // industry-derived
```

`take_rate_pct` is a single value for the whole deck (industry-wide), applied identically to every region's REVENUEUP. Source: `tasks/industria-take-rate.txt` keyed by `industry_category` returned by deep-research.

## Region → Country mapping (constant)

`supabase/functions/_shared/regions.ts`:

```ts
export const COUNTRY_REGION: Record<string, RegionKey> = {
  // NA
  US:'us', CA:'us', MX:'us', PR:'us', CR:'us', PA:'us', GT:'us', JM:'us',
  BS:'us', TT:'us', HN:'us', SV:'us', NI:'us', DO:'us',
  // LATAM (South America + Cuba etc.)
  BR:'latam', AR:'latam', CO:'latam', CL:'latam', PE:'latam', EC:'latam',
  UY:'latam', PY:'latam', BO:'latam', VE:'latam',
  // EMEA (Europe)
  GB:'emea', DE:'emea', FR:'emea', ES:'emea', IT:'emea', NL:'emea', BE:'emea',
  CH:'emea', AT:'emea', PT:'emea', IE:'emea', SE:'emea', NO:'emea', DK:'emea',
  FI:'emea', PL:'emea', CZ:'emea', SK:'emea', HU:'emea', RO:'emea', GR:'emea',
  TR:'emea',
  // MEA (Middle East + Africa)
  AE:'mea', SA:'mea', QA:'mea', KW:'mea', BH:'mea', OM:'mea', JO:'mea',
  IL:'mea', LB:'mea', EG:'mea', ZA:'mea', NG:'mea', KE:'mea', MA:'mea',
  GH:'mea', CI:'mea', TZ:'mea', TN:'mea', ET:'mea',
  // APAC
  JP:'apac', IN:'apac', CN:'apac', AU:'apac', NZ:'apac', SG:'apac', HK:'apac',
  KR:'apac', TW:'apac', ID:'apac', TH:'apac', VN:'apac', PH:'apac', MY:'apac',
  PK:'apac', BD:'apac', LK:'apac',
};

export const AUTH_RATES: Record<string, number> = {
  // parsed from tasks/auth-rates-by-country.txt at build time
  US: 0.875, CA: 0.875, MX: 0.69, DO: 0.85, /* ...avg fallbacks per region */
};
export const REGIONAL_AVG_AR: Record<RegionKey, number> = {
  us: 0.82, latam: 0.75, emea: 0.84, mea: 0.79, apac: 0.90,
};
```

`AUTH_RATES` lookup chain: ISO code → fallback to regional avg → fallback to 0.80.

## Top-N per region rule

- Filter SimilarWeb countries to those with `share >= 0.01` (≥1%)
- Bucket by region (`COUNTRY_REGION` map)
- Per region, sort by share desc, take **up to top 5**
- If a region has only 2 countries above the floor → render 2 rows (no padding, no synthetic countries)
- If a region has 0 countries above the floor → skip that region's slides entirely

## Fallbacks (explicit)

| Case | Behavior |
|---|---|
| SimilarWeb 404 for client domain | skip ALL regional slides; return error to the skill caller with `reason: similarweb_unavailable` |
| Region has 0 countries with ≥1% share | skip that region's slides |
| Region has 1–4 countries above floor | render that many rows (no padding) |
| Country missing from AUTH_RATES table | use REGIONAL_AVG_AR[region], then 0.80 |
| Country missing from COUNTRY_REGION map | log warning + drop the country |
| Deep-research missing entity for a country | treat as `has_entity = false` (conservative path: +4pp, 50bps) |
| `avg_ticket_confidence = unknown` | **fail loud**: skill replies "no credible ticket source found, please provide manually as override". Do NOT fabricate. (Recommended UX: skill prompts user with `avg_ticket_override_usd` and re-runs.) |
| `avg_ticket_confidence = low` | proceed but flag the deck `data.ticket_warning = "low confidence — industry benchmark only"` so the slide footer can show a caveat |
| `industry_category` cannot be classified | LLM must return `null`; skill falls back to industry `"Marketplace"` (median take_rate 11%) and flags `industry_warning: true` |

## Inputs the skill must collect from the user

| Field | Required | Notes |
|---|---|---|
| `client_name` | ✅ | for SimilarWeb domain resolution + research |
| `website` | ✅ | normalized via existing `normalizeDomain` |
| `avg_ticket_override_usd` | ❌ optional | only used as fallback if deep-research returns `confidence: unknown`. Skill prompts user only in that case. |
| `--refresh` | ❌ optional | bypass deep-research 30d cache |

**No language prompt** — SDR BC is **English-only** (decision 2026-05-11). The skill should NOT ask which language to use; the deck title and copy are always English.

**No avg_ticket prompt** by default — deep-research auto-resolves it with the strict precision rules (Phase A skipped unless confidence is `unknown`).

**No `regions[]` prompt** — every region with `≥1` country above the 1% share floor renders automatically.

**No `gross_margin` prompt** — REVENUEUP uses `industry_take_rate_pct` from the controlled-vocabulary classification.

## File checklist

- [ ] `supabase/functions/_shared/regions.ts` — country→region map, AUTH_RATES (parsed from `auth-rates-by-country.txt`), REGIONAL_AVG_AR
- [ ] `supabase/functions/_shared/industries.ts` — controlled vocabulary + take_rate lookup (parsed from `industria-take-rate.txt`)
- [ ] `supabase/functions/_shared/legal-markers.ts` — region→legal-marker query template
- [ ] `supabase/functions/chief-deep-research-company/index.ts` — replace generic `entities` query, add `avg_ticket` generic query, add Phase 2+3+4 logic, extend synthesis prompt with ticket/industry/per-country rules
- [ ] `supabase/functions/sdr-bc-generate/index.ts` — new orchestrator (math + totals + persistence)
- [ ] `supabase/migrations/138_sdr_bc_presentations.sql` — `presentations.deck_type` enum add `'sdr_bc'`; `deck_data` jsonb column if not present
- [ ] `.claude/skills/sdr-bc/SKILL.md` — invocation contract: `client_name` + `website` only; English-only deck; prompt for `avg_ticket_override_usd` ONLY if deep-research returns `confidence: unknown`
- [ ] Frontend route at `chief.yuno.tools/sdr-bc/<slug>` (separate from existing `/bc/<slug>` route)
- [ ] `public/sdr-bc/slides-02-business-case.jsx` — adjust the cards table to render up to 5 rows cleanly (currently sized for 3 placeholders)

## Smoke-test cases

1. **Rappi.com** (LATAM-heavy, many local entities) → expect LATAM region with CO/MX/BR/AR/PE rows, mostly +2pp / 20bps. EMEA empty (skip slide).
2. **xbox.com** (US-heavy) → only NA region rendered, mostly +4pp / 50bps (Microsoft has US entity, foreign sales likely cross-border).
3. **plata.com** (small site) → SimilarWeb 0.12M visits; expect graceful skip if all shares <1%.
4. **A multi-region brand** (e.g. McDonald's) → expect 4 regions, each with 5 rows.
5. **Cache reuse:** re-run for same client < 30d → no Firecrawl/SimilarWeb hits.

## Out of scope (this plan)

- APMs slide (next plan, awaits Δ TPV + MDR delta inputs from user)
- BC PDF export (existing puppeteer pipeline can render once data is in `deck_data`)
- Per-region `avg_ticket` overrides (v2)
- Custom `gross_margin` per region (v2)
- Direct LLM-generated APM recommendations (deck uses static `metodos_pago_por_pais.txt` table)

## Decisions closed (2026-05-11)

| # | Question | Decision |
|---|---|---|
| 1 | REVENUEUP formula | `TPVUPT × industry_take_rate_pct / 100`. Industry classified by deep-research from the 37-row controlled vocabulary in `tasks/industria-take-rate.txt`. EVERY client MUST be classified. |
| 2 | `avg_ticket_usd` source | Resolved automatically by deep-research with strict precision rules (financial disclosure > analyst > industry benchmark > unknown). Single GLOBAL value applied to all countries. Skill prompts user only when `confidence: unknown`. |
| 3 | Top-N per region | Up to 5 per region, with `share ≥ 1%` floor. Render only as many countries as pass the floor (e.g. NA with 2 countries → 2 rows, no padding). |
| 4 | Language | **English only.** No language gate in skill. |
| 5 | Deck URL | New path: `chief.yuno.tools/sdr-bc/<slug>`. Separate from `/bc/<slug>`. |

## Review section (post-implementation)

_To be filled after build & smoke test._
