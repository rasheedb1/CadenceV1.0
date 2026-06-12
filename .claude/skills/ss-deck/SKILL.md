---
name: ss-deck
description: Generate a Stripe Sessions style sales deck for a target merchant. Posts to the ss-deck-generate edge function on Supabase, which researches the merchant's top 4 acquirers via chief-deep-research-company (with regional fallback), creates a row in `merchants_ss`, and returns a public URL at chief.yuno.tools/m/<slug>. The 21-slide deck (Cover, Diagnostic, Yuno Solve, Product Suite, Global Presence, Leadership, etc.) is rendered client-side from the merchants_ss row. Use when the user types /ss-deck or asks to generate a Stripe Sessions deck / "deck visual" / "SS deck" for a named client. Distinct from /yuno-bc (commercial BC) and /sdr-bc (prospecting BC with traffic math) — this is a visual storytelling deck with the polished slide design from the yuno-sales-pitch-maker repo.
---

# Stripe Sessions Deck Generator

Generates a 21-slide Stripe Sessions style sales deck for a target merchant. Visually distinct from `/yuno-bc` and `/sdr-bc` — this is the polished event-style deck ported from `yuno-sales-pitch-maker`, focused on visual storytelling (globe, diagnostic topology, product suite, leadership grid) rather than per-region commercial math.

Served at `https://chief.yuno.tools/m/<slug>`. Read-public, no expiration.

## Trigger

- `/ss-deck` (no args — asks for client name)
- `/ss-deck <Client Name>` (proceeds directly)
- "armá un SS deck para <cliente>" / "generate a Stripe Sessions deck for <client>" / "necesito el deck visual para <cliente>"

## Flow

### 1. Gather input

Only one required: **Client name** (preserve casing: Rappi stays Rappi).

If missing, ask:

> Para generar el SS deck necesito el nombre del cliente (casing original, ej. Discord, Mercari).

Wait for the reply before continuing.

Optional follow-ups (ask only if the user has not already specified — defaults match the cadence step):

- **Language for the deck?** (en default · es · pt)
- **Display currency?** (USD default · MXN · BRL · COP · ARS · CLP · PEN · EUR)

If the user does not answer either, default to `en` + `USD` so manual decks match
the automatic cadence-generated decks (per the 2026-05-18 policy).

### 2. Identify the AE

Same model as `/yuno-bc` and `/sdr-bc`: take `userEmail` from conversation context and pass as `createdByEmail`. The endpoint resolves the AE's `user_id` + `org_id` from `ae_integrations` (provider=gmail). If the AE has no Gmail integration, pass `org_id` explicitly from context.

### 3. POST to ss-deck-generate

```bash
curl -sX POST \
  "https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/ss-deck-generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFydXBlcWN6cnhtZmtjYmp3eWFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTE2ODMsImV4cCI6MjA4NTM4NzY4M30.gC3dki2lgl2mvqZqwhXW3oA_ZumVdXhaXuLb5HLehS8" \
  -H "X-Agent-Token: $(grep PRESENTATIONS_AGENT_TOKEN /Users/rasheedbayter/Documents/Laiky\ AI/.env.local | cut -d= -f2-)" \
  -d '{
    "createdByEmail": "<USER_EMAIL_FROM_CONVERSATION_CONTEXT>",
    "company_name": "<ClientName>",
    "language": "en",
    "currency": "USD"
  }'
```

Optional fields:
- `language`: `"en"` (default), `"es"`, or `"pt"`. Controls slide copy + number formatting locale. Omit to keep the cadence default of English.
- `currency`: `"USD"` (default), `"MXN"`, `"BRL"`, `"COP"`, `"ARS"`, `"CLP"`, `"PEN"`, `"EUR"`, or `"GBP"`. Display only — math is currency-agnostic.
- `mode`: `"merchant"` (default), `"banking"`, or `"partner"`. v1 ships merchant only; banking/partner shells exist in the slide module but are unfilled.
- `logo`: absolute URL to a company logo (white wordmark on transparent works best). If omitted, the cover renders the company name as text.
- `greeting`: per-merchant cover greeting override (e.g. `"Hi Takeshi"`). If omitted, falls back to the default "Hello {name} team!".

### 4. Handle responses

The endpoint runs deep research (cached 30d) to find the merchant's top 4 acquirers, with a regional fallback when public info is weak. Total latency ~5-10s on cache hit, ~20-45s on cache miss.

**Success:**
```json
{
  "id": "uuid",
  "slug": "walmart-a8f3c2",
  "url": "https://chief.yuno.tools/m/walmart-a8f3c2",
  "company_name": "Walmart",
  "mode": "merchant",
  "language": "en",
  "currency": "USD",
  "content_source": "research",
  "region": "us",
  "domain": "walmart.com",
  "acquirers_count": 4,
  "acquirers": ["Chase Paymentech", "Worldpay (FIS)", "Fiserv", "Global Payments"],
  "created_at": "2026-..."
}
```

`content_source` values:
- `research` — top 4 acquirers extracted from public sources (Firecrawl + Claude). Most accurate.
- `regional_fallback` — public info was weak (<2 real acquirers found). Falls back to the top 4 acquirers for the merchant's primary region (US/LATAM/EMEA/APAC). The deck shows a disclaimer line.
- `template` — domain resolution failed entirely. The slide reverts to the generic "+460 providers" tile (no per-merchant content).

Report to user (one short line):

```
✅ Deck generado: <url>
Acquirers (top 4): <list>
Fuente: <content_source> · región: <region>
```

**Errors:**
- `400 company_name is required` → re-ask the client name.
- `400 org_id is required (pass createdByEmail with linked Gmail integration, or org_id directly)` → the user has no Gmail integration. Surface the message and suggest connecting Gmail or passing org_id manually.
- `401 Invalid auth` → check `PRESENTATIONS_AGENT_TOKEN` is set in `.env.local`.
- `500 Insert failed` → likely RLS or migration not applied. Verify migration 142 is live.

## Distinct from other deck skills

| Skill        | URL prefix                       | Source table         | What's in it |
|---|---|---|---|
| `/yuno-bc`   | chief.yuno.tools/bc/<slug>       | presentations (kind=bc)     | Commercial deck (pricing, value props, customer logos) |
| `/sdr-bc`    | chief.yuno.tools/sdr-bc/<slug>   | presentations (kind=sdr_bc) | Prospecting deck with regional traffic math |
| **`/ss-deck`** | **chief.yuno.tools/m/<slug>** | **merchants_ss**            | **21-slide visual deck** (cover globe, diagnostic topology, product suite, leadership grid) |

When the user is ambiguous about which deck they want, ask:
> ¿Querés `/yuno-bc` (deck comercial completo), `/sdr-bc` (prospecting con math regional) o `/ss-deck` (deck visual estilo Stripe Sessions)?

## Notes

- v1 uses placeholder copy (`[merchant]` tokens, generic PAIN/CAPABILITY titles). The visual deck renders correctly; per-merchant copywriting is the v2 follow-up.
- The deck is **public-read**: any cold link visitor can load `/m/<slug>` without auth. Treat the slug as the share token.
- No expiration. Decks accumulate in `merchants_ss` indefinitely. Cleanup policy TBD.
- PDF export: `https://bridge.yuno.tools/api/m/<slug>/pdf` (Phase 3 — pending bridge endpoint wiring).
