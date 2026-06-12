---
name: sdr-bc
description: Generate a trilingual (es/en/pt, en default) SDR Business Case deck for a target client. Posts to the sdr-bc-generate edge function on Supabase, which runs SimilarWeb traffic intelligence + Firecrawl research with per-country legal-entity detection, then computes per-region cards (Top-5 by traffic share, ≥1% floor) with TPV / Δ AR / Δ TPV / Cost Reduction. Persists to `presentations` with kind='sdr_bc'. Use when the user types /sdr-bc or asks to generate an SDR business case for a named client.
---

# SDR Business Case Generator

Generates an SDR-focused deck that summarizes the regional opportunity for a target client based on SimilarWeb traffic geography + deep research. Distinct from `/yuno-bc` (per-client commercial deck): SDR BC is a **prospecting deck** that an SDR can send to a fresh contact at the client, showing per-region cards math (top traffic countries, AR uplift, cost reduction).

The deck is served at `https://chief.yuno.tools/sdr-bc/<slug>` for 90 days. **Defaults to English** — if the user does not specify a language, the deck is generated in English with USD formatting. Spanish (es) and Brazilian Portuguese (pt) are also supported (multilingual upgrade, 2026-05-18). Math is identical across all three languages — only labels and number formatting change.

## Trigger

- `/sdr-bc` (no args — asks for client name + website)
- `/sdr-bc <Client Name>` (asks for website)
- `/sdr-bc <Client Name> <website>` (proceeds directly)
- "generate an SDR BC for <client>" / "armá un SDR BC para <cliente>"

## Flow

### 1. Gather inputs (very short — most data is auto-resolved)

The endpoint auto-resolves traffic data (SimilarWeb), top countries per region, average ticket (deep-research from public sources), industry classification (controlled vocabulary), and per-country legal entity detection. The skill only needs:

- **Client name** (preserve casing: Rappi stays Rappi).
- **Website** (e.g. `rappi.com`, `https://www.spacex.com`). Required — SimilarWeb needs a domain.
- **Language** (optional, default `en`) — `en` · `es` · `pt`. Math is identical across all three; only labels and number formatting change.
- **Currency** (optional, default `USD`) — `USD` · `MXN` · `BRL` · `COP` · `ARS` · `CLP` · `PEN` · `EUR` · `GBP`. Display-only — the underlying TPV / Δ TPV math is in USD-equivalent and is not FX-converted.

If client name or website is missing, ask:

> Para generar el SDR BC necesito:
> 1) Nombre del cliente (exacto, casing original)
> 2) Website principal (ej. rappi.com)
>
> Opcionales (si no especificas usamos defaults):
> 3) Idioma del deck (en default · es · pt)
> 4) Moneda de display (USD default · MXN · BRL · COP · ARS · CLP · PEN · EUR)

Do NOT prompt the user for language/currency if they have not asked for a non-English deck — just default to `en` + `USD` (preserves the legacy behaviour). Only ask if the user explicitly mentions a language or currency in their prompt.

Wait for the reply before continuing.

### 2. Identify the AE

Same model as `/yuno-bc`: take `userEmail` from conversation context and pass as `createdByEmail`. The endpoint resolves the AE's `user_id` + `org_id` from `ae_integrations` (provider=gmail). If the AE has no Gmail connected, the endpoint returns a clear error.

### 3. POST to sdr-bc-generate

```bash
curl -sX POST \
  "https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/sdr-bc-generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFydXBlcWN6cnhtZmtjYmp3eWFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTE2ODMsImV4cCI6MjA4NTM4NzY4M30.gC3dki2lgl2mvqZqwhXW3oA_ZumVdXhaXuLb5HLehS8" \
  -H "X-Agent-Token: $(grep PRESENTATIONS_AGENT_TOKEN /Users/rasheedbayter/Documents/Laiky\ AI/.env.local | cut -d= -f2-)" \
  -d '{
    "createdByEmail": "<USER_EMAIL_FROM_CONVERSATION_CONTEXT>",
    "clientName": "<ClientName>",
    "website": "<rappi.com>",
    "language": "en",
    "currency": "USD"
  }'
```

Optional flags (rarely needed):
- `language: "es" | "en" | "pt"` — default `en`. Whitelisted; unknown values fall back to default.
- `currency: "USD" | "MXN" | "BRL" | "COP" | "ARS" | "CLP" | "PEN" | "EUR" | "GBP"` — default `USD`. Display only.
- `force_refresh: true` — bypasses the 30-day deep-research cache
- `avg_ticket_override_usd: 25.50` — only use if a previous call returned `reason: avg_ticket_unknown`

**UI-driven overrides (Chief wizard Step 2 only, do NOT pass from the skill unless the user explicitly asked for a specific value):**

These are surfaced as optional fields in the `/presentaciones` Chief UI 2-step wizard (Step 1 = lookup, Step 2 = override review). The skill keeps the single-call zero-prompt flow — if the user wants to override these from chat they have to be explicit ("set industry to Travel/OTAs", "ticket is $55", "Crocs has a local entity in France").

- `industry_override: "<one of 37 categories>"` — validated against `_shared/industries.ts`. Take rate is auto-derived from the industry (no separate `take_rate_override`).
- `legal_entities_override: [{ "iso": "FR", "has_entity": true }, ...]` — bypasses the deep-research confidence gate; per-ISO override of `verifiedLocal()`. Affects Δ AR (2pp with entity vs 4pp without) and Δ MDR (20bps vs 50bps).
- `existing_apms_override: [{ "iso": "US", "apms": ["PayPal","Apple Pay","Affirm"] }, ...]` — replaces the deep-research existing-APMs list per ISO. Empty array IS a valid override ("confirmed: no APMs").
- `sdr_name: "Rasheed Bayter"` — Cover slide "Prepared by" line. No math impact.
- `sdr_position: "SDR · LATAM"` — Cover slide subtitle under Prepared by. Skipped if `sdr_name` is empty.

`industry_override` validation: an unknown category returns `400 { reason: 'invalid_industry_override', valid_categories: [...] }`. Always pick from the 37 categories listed in `_shared/industries.ts`.

### 4. Handle responses

**Success:**
```json
{
  "id": "uuid",
  "slug": "rappi-a8f3c2",
  "url": "https://chief.yuno.tools/sdr-bc/rappi-a8f3c2",
  "expiresAt": "...",
  "industry": "SuperApps/Delivery Apps",
  "avg_ticket_usd": 12.50,
  "avg_ticket_confidence": "high",
  "language": "en",
  "currency": "USD",
  "regions_rendered": [
    { "region": "latam", "label": "LATAM", "country_count": 5 },
    { "region": "us", "label": "North America", "country_count": 1 }
  ],
  "warnings": {}
}
```

Note: `regions_rendered[].label` is already translated to the requested language (e.g. "Latinoamérica" when language=es). The keys (`us`, `lat`, `ema`, `apa`) stay constant.

Report to user:
```
✓ SDR BC generated
→ https://chief.yuno.tools/sdr-bc/<slug>

Snapshot:
  Client:           <ClientName>
  Industry:         <industry>  (take rate <take_rate_pct>%)
  Avg ticket:       $<avg_ticket_usd>  (confidence: <high|med|low>)
  Regions rendered: <list with country count each>
  Warnings:         <if any — flag for the user>
  Valid until:      <expires_at ISO>
```

**Error responses to handle:**

- `reason: avg_ticket_unknown` (422): no credible avg-ticket source found.
  > Couldn't find a credible average-ticket source for <client>. Provide a manual estimate (USD per transaction) and I'll re-run with `avg_ticket_override_usd`.

  Ask the user for the value, then re-POST with `avg_ticket_override_usd: <N>`.

- `reason: similarweb_unavailable` (422): SimilarWeb has no data for the domain.
  > SimilarWeb has no traffic data for <domain>. The SDR BC needs traffic geography to render regional cards. Try a different domain or skip the SDR BC for this client.

- `reason: no_regions_above_floor` (422): all SimilarWeb top countries have <1% share.
  > Traffic for <client> is too fragmented (no country above the 1% floor). The SDR BC won't have meaningful regional slides for this client.

- `No Gmail integration found ...` (400): AE has no connected Gmail.
  > Conectá tu Gmail en Chief (Settings o WhatsApp `/conectar gmail`) antes de generar el SDR BC.

### 5. Warnings to surface

If `warnings.ticket_low_confidence: true` — flag to the user that the ticket is an industry benchmark, not a company-specific number.

If `warnings.industry_fallback: true` — the deep-research couldn't classify the client into one of the 37 industries; the deck used `Marketplace` (take rate 11%) as fallback. Suggest the user provide context to re-classify in a regen.

If `warnings.ticket_source: "user_override"` — confirms the user-provided ticket was used; no action needed.

If `warnings.industry_source: "user_override"` — confirms `industry_override` was applied (skips the deep-research classification + the `Marketplace` fallback path entirely).

If `warnings.legal_entities_override_count` / `warnings.existing_apms_override_count` are present — counts of per-ISO overrides applied. Surface to the user so they know the AE manually corrected research.

## Validation rules (skill-side, for fast feedback)

- `clientName`: non-empty, preserve casing.
- `website`: must include a domain (with or without scheme). The endpoint normalizes via the shared `normalizeDomain`.
- `avg_ticket_override_usd`: positive number, USD per transaction. Only pass when retrying after `avg_ticket_unknown`.

## Math reference (so the skill can explain numbers if asked)

Per country `c` (top 5 per region above 1% share):
- `tpv_usd = monthly_visits_c × 12 × 0.07 × avg_ticket_usd` (M USD)
- `has_entity = (deep-research legal_entities[c].has_entity=true AND confidence in {high, med})`
- `Δ AR pp = 2 if has_entity else 4`
- `Δ TPV = tpv × (Δpp / 100) / base_AR_country` (multiplicative — base AR from `auth-rates-by-country.txt` snapshot)
- `Cost reduction = tpv × (Δ_MDR_bps / 10000)` where `Δ_MDR = 20 if has_entity else 50`
- `Revenue uplift = Σ Δ TPV × industry_take_rate_pct / 100`

Region totals are sums of the per-country numbers. Region cards only render if ≥1 country passes the 1% floor; the deck adapts (no padding).

## Common mistakes to avoid

- ❌ **Don't gate on language.** The deck defaults to `en` + `USD`. Only ask the user about language/currency if they explicitly request a non-default value. Never block the request waiting for a language answer.
- ❌ **Don't ask for ticket, TPV, MDR, currentApproval, gross margin, pricing, or country list.** All auto-resolved.
- ❌ **Don't fabricate the average ticket** if the endpoint returned `avg_ticket_unknown` — always ask the user for a manual override.
- ❌ **Don't lowercase the client name** — casing is preserved end-to-end.
- ❌ **Don't pass `force_refresh: true` by default.** Only when the user explicitly says "regenerate fresh" / "skip the cache" / "force re-research".
- ❌ **Don't generate local HTML files.** The endpoint persists to Supabase and exposes the public URL.

## Difference vs /yuno-bc

| | /yuno-bc | /sdr-bc |
|---|---|---|
| Audience | Existing/prospect client (already in conversation) | Cold SDR outreach to fresh contact |
| Inputs | TPV, ticket, MDR, AR, pricing, country breakdown, etc. (many) | client_name + website only |
| Research | Firecrawl PSPs/APMs | SimilarWeb traffic + deep research + legal entities per country |
| Language | Asks es/en/pt every time | Default en; es/pt available if user asks |
| Deck path | /bc/<slug> | /sdr-bc/<slug> |
| `presentations.kind` | yuno_bc | sdr_bc |
| Numbers driven by | User-provided commercial reality | Public traffic data + auth-rate benchmarks |
