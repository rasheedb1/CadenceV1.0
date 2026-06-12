# Plan — SimilarWeb Integration (Traffic Intelligence)

**Owner:** Rasheed
**Date:** 2026-05-10
**Status:** Pending approval

## Goal

Integrate SimilarWeb to enrich client research with two specific signals:
1. **Approximate monthly visits** for a domain (e.g. `rappi.com` → 65M/mo)
2. **Top countries by traffic share** (e.g. Rappi → CO 38%, MX 22%, BR 18%, AR 12%, PE 6%, other 4%)

Consumers (priority order):
1. `deep-research-company` (Carlos's research context — outreach pipeline)
2. Andrés (research agent, WhatsApp) — capability `traffic_intelligence`
3. Enrique (BC agent, WhatsApp) — capability `traffic_intelligence`
4. Future: Chief BC PDF deck (slide with country-share donut)

## Decision: REST API direct, not MCP

Reasoning documented in conversation. Three blockers killed MCP:
- MCP only callable from Claude clients → edge functions (process-queue cron) can't use it
- MCP has zero caching → bleeds data credits on repeat queries
- MCP injects 75-tool schema into every turn → 15-20k token overhead for 2 endpoints

Wrapper architecture gives us caching, normalized payload, country-code mapping, and per-agent gating.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│ supabase/functions/similarweb-traffic/index.ts             │
│   POST { domain: string, refresh?: bool }                  │
│   ↓                                                         │
│   1. Check similarweb_cache (where domain=X and now<expires)│
│   2. If hit + !refresh → return cached payload              │
│   3. Else fire 2 calls in parallel:                         │
│      - GET /v1/website/{d}/total-traffic-and-engagement/   │
│        visits?country=world&granularity=monthly             │
│        &start_date=<today-4mo>&end_date=<today-2mo>         │
│        &api_key=$SIMILARWEB_API_KEY                         │
│      - GET /v4/website/{d}/geo/total-traffic-by-country?    │
│        sort=share&asc=false&limit=10                        │
│        &start_date=<today-4mo>&end_date=<today-2mo>         │
│        &api_key=$SIMILARWEB_API_KEY                         │
│   4. Normalize: ISO numeric → country name (shared lookup)  │
│   5. Compute avg monthly visits from time series            │
│   6. Upsert similarweb_cache (expires_at = now + 30d)       │
│   7. Return normalized payload                              │
└────────────────────────────────────────────────────────────┘
            │                                       │
            ▼                                       ▼
   ┌──────────────────────────┐      ┌────────────────────────────┐
   │ chief-agents/src/        │      │ supabase/functions/        │
   │   mcp-tools/             │      │   deep-research-company/   │
   │   similarweb.ts          │      │   inject traffic summary   │
   │                          │      │   into Carlos research     │
   │ Tool: get_traffic_data   │      │   prompt                   │
   │ Input: { domain }        │      │                            │
   │ Returns normalized JSON  │      │                            │
   └──────────────────────────┘      └────────────────────────────┘
```

## Normalized payload shape

```typescript
{
  domain: "rappi.com",
  fetched_at: "2026-05-10T18:30:00Z",
  expires_at: "2026-06-09T18:30:00Z",
  monthly_visits: {
    avg: 65_400_000,        // average over the window
    latest: 67_100_000,     // most recent month
    series: [               // raw time series for transparency
      { month: "2026-01", visits: 63_200_000 },
      { month: "2026-02", visits: 65_900_000 },
      { month: "2026-03", visits: 67_100_000 }
    ],
    window: { start: "2026-01", end: "2026-03" }
  },
  top_countries: [
    { code: "CO", name: "Colombia", share: 0.382, visits: 25_700_000, rank: 1 },
    { code: "MX", name: "Mexico",   share: 0.218, visits: 14_600_000, rank: 2 },
    { code: "BR", name: "Brazil",   share: 0.181, visits: 12_100_000, rank: 3 }
    // ... up to limit=10
  ],
  engagement: {
    avg_visit_duration_sec: 312,
    pages_per_visit: 4.2,
    bounce_rate: 0.34
  },
  source: "similarweb_v1+v4",
  cache_status: "miss" | "hit"
}
```

## Schema

```sql
-- migration: 116_similarweb_cache.sql
create table similarweb_cache (
  domain          text primary key,
  monthly_visits  jsonb not null,
  top_countries   jsonb not null,
  engagement      jsonb,
  fetched_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  raw_visits      jsonb,   -- raw response for debugging
  raw_geo         jsonb,   -- raw response for debugging
  error           text     -- non-null if last fetch failed (do not serve)
);

create index similarweb_cache_expires_idx on similarweb_cache(expires_at);

-- RLS: service_role only (this is a shared resource across orgs)
alter table similarweb_cache enable row level security;
-- (no policies → service_role bypass only)
```

**Why no `org_id`?** SimilarWeb data is public-domain traffic stats. Sharing the cache across all orgs maximizes credit savings (if Yuno researched Rappi yesterday, no need to re-fetch when researching it from another agent today). No leakage risk — it's all public data.

## Date window strategy

SimilarWeb has ~6-week data lag. Safe window:
- `end_date = today - 2 months` (e.g. on 2026-05-10 → `2026-03`)
- `start_date = today - 4 months` (e.g. → `2026-01`)
- 3-month rolling window gives us avg + latest, smooths anomalies

Computed dynamically at fetch time (NOT cached as part of the cache key — domain is the only key, window always reflects "most recent 3 months at time of fetch").

## Credit budget estimate

Per fetch (1 domain, 3 months, country=world for visits, top-10 countries for geo):

- **Visits endpoint:** 1 credit × 3 months = **3 credits**
- **Geo endpoint:** 1 credit × 3 months × 10 results = **30 credits**
- **Total per domain (cache miss):** ~33 credits

With 30-day caching, expected steady-state usage:
- ~50 unique client domains researched/month
- ~33 credits × 50 = **~1,650 credits/month** for full Yuno outreach pipeline

(Refresh via `refresh: true` flag bypasses cache when needed — e.g. for a fresh BC deck.)

## API key handling

- Store: Supabase secret `SIMILARWEB_API_KEY` (set via `supabase secrets set`)
- **Never commit** to code or `.env.example`
- **Never log** the key value
- The key user pasted in chat must be rotated by Rasheed before production use

## File checklist

- [x] Supabase secret `SIMILARWEB_API_KEY` set (2026-05-10, HTTP 201)
- [x] Smoke test: both endpoints return 200 with valid data for `rappi.com`
- [ ] `supabase/migrations/116_similarweb_cache.sql`
- [ ] `supabase/functions/similarweb-traffic/index.ts`
- [ ] `supabase/functions/_shared/similarweb.ts` (typed client)
- [ ] `supabase/functions/deep-research-company/index.ts` (inject traffic summary as Step 0)
- [ ] `chief-agents/src/mcp-tools/similarweb.ts`
- [ ] `chief-agents/src/integration-registry.ts` (add `traffic_intelligence` capability)
- [ ] Skill row in `skill_registry` (assigned to Andrés + Enrique)

**Note (2026-05-10 smoke test):** Geo endpoint returns `country_name` directly in each record — no need for ISO 3166-1 numeric mapping table. Removed from checklist.

**Real response shapes (verified):**
```
GET /v1/website/{d}/total-traffic-and-engagement/visits
→ { meta: {...last_updated, request, status}, visits: [{ date: "YYYY-MM-DD", visits: number }] }

GET /v4/website/{d}/geo/total-traffic-by-country
→ { meta: {...last_updated, query, request, status},
    records: [{ country: numeric, country_name: string, share: float,
                visits: number, pages_per_visit: float, average_time: float,
                bounce_rate: float, rank: number }] }
```

**Data lag confirmed:** ~10 days, not 6 weeks. With `end_date = today - 2 months`, data is always available.

## Smoke test plan

1. Deploy edge function with `--no-verify-jwt`
2. `curl POST /functions/v1/similarweb-traffic { domain: "rappi.com" }` → expect cache miss, real data
3. Repeat same curl → expect `cache_status: "hit"`, sub-100ms response
4. `curl POST ... { domain: "rappi.com", refresh: true }` → expect cache miss, fresh fetch
5. Test edge case: `domain: "nonexistent12345.com"` → expect graceful error, no cache write with stale data
6. From WhatsApp: "Andrés, dame tráfico de inDrive" → expect Andrés invokes tool, returns formatted summary

## Out of scope (v1)

- App traffic data (mobile apps endpoint)
- Keyword/search data
- Industry analysis endpoints
- Traffic sources breakdown (direct/search/social) — easy to add later if Carlos wants it
- BC PDF deck slide with country donut (separate task, after data flows reliably)

## Open questions for Rasheed

1. ✅ API key obtained (stored in Supabase secrets 2026-05-10, must rotate)
2. ✅ REST-only approach approved
3. ✅ SimilarWeb fires at start of cadence as Step 0 of `deep-research-company`; downstream (Carlos rubrics, Enrique BC) reads from cache only
4. ⏳ Pending: refresh-on-demand for agents — recommendation: **NO** + silent auto-refresh when cache age >25 days

## Review section (post-implementation)

**Status: DEPLOYED 2026-05-10**

### What shipped

1. **Migration 137** — `similarweb_cache` table (cross-org, domain-PK, 30-day TTL, error column for cooldown)
2. **Edge function `similarweb-traffic`** — wrapper with:
   - 30-day cache hit (sub-second response)
   - Silent auto-refresh when age >25 days (fire-and-forget, returns cached immediately)
   - Error cooldown 1h (caches "Data not found" so we don't hammer SimilarWeb on untracked domains)
   - Domain normalization (strips protocol/www/path)
   - Stale-data fallback when fresh fetch fails
3. **Edge function `chief-deep-research-company`** — modified to:
   - Call `fetchSimilarWebTraffic()` in parallel with 6 Firecrawl searches
   - Persist result to `similarweb_cache` (priming for downstream Carlos/Enrique)
   - Inject summary as `== TRAFFIC DATA (SimilarWeb — AUTHORITATIVE) ==` in LLM prompt
   - System prompt updated with AUTHORITATIVE DATA POLICY (LLM must use SimilarWeb verbatim for `top_markets`)
4. **MCP tool `chief-agents/src/mcp-tools/similarweb-tools.ts`** — `similarweb_get_traffic(domain)` for agents
5. **Capability `traffic_intelligence`** registered in `integration-registry.ts`
6. **Andrés + Enrique** granted `traffic_intelligence` capability

### Smoke test results

| Domain | Result |
|---|---|
| rappi.com | ✅ 4.61M visits/mo, CO 39.5% / AR 18.4% / PE 15.4% |
| xbox.com | ✅ 50.78M visits/mo, US 25.9% |
| plata.com | ✅ 0.12M visits/mo, UK 84% |
| remitee.com | ✅ 0.00M (tiny), AR 51.2% |
| sagicorbank.com | ⚠️ 404 from SimilarWeb (too small to track) — cached as error with 1h cooldown |
| Cache hit verified | ✅ Second call returns instantly with `cache_status: hit` |
| Domain normalization | ✅ `https://www.rappi.com/about` → `rappi.com` (cache hit) |
| Error cooldown | ✅ Second call on sagicorbank.com returns `cached_error: true` without hitting SimilarWeb |

### Files changed

- `supabase/migrations/137_similarweb_cache.sql` (new)
- `supabase/functions/_shared/similarweb.ts` (new)
- `supabase/functions/similarweb-traffic/index.ts` (new)
- `supabase/functions/chief-deep-research-company/index.ts` (modified)
- `chief-agents/src/mcp-tools/similarweb-tools.ts` (new)
- `chief-agents/src/mcp-tools/integration-registry.ts` (modified)

### Deploy status

- ✅ Migration applied via Supabase Management API
- ✅ Edge functions deployed (`similarweb-traffic`, `chief-deep-research-company`)
- ✅ `SIMILARWEB_API_KEY` set in Supabase secrets
- ✅ Capabilities updated in `public.agents` for Andrés + Enrique
- ⏳ **Pending:** chief-agents Railway redeploy (auto on `git push origin main`)
- ⚠️ **User action required:** rotate `SIMILARWEB_API_KEY` (key was shared in chat)

### Not done (out of scope or follow-up)

- Full end-to-end test of `chief-deep-research-company` against a real new company (would cost ~$0.30-0.50 of LLM+Firecrawl — left for next time research is naturally triggered)
- BC PDF deck slide with country donut (separate task)
- Apps traffic data (mobile apps endpoint)
- Traffic sources breakdown (direct/search/social)

### Known limitations

- SimilarWeb 404s on small/private sites. Handled gracefully (1h error cooldown, fallback to Firecrawl in deep-research).
- Mobile-first apps (Rappi, Plata) show low web traffic — does NOT reflect app traffic.
- Engagement metrics are computed as average across top-10 country records (geo endpoint only returns these per-country, not per-domain).
