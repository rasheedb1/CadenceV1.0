---
name: yuno-workshops-bc
description: Generate a Yuno Workshop Business Case deck for a target client. POSTs to the workshops-bc-generate edge function on Supabase, which validates the AE's client inputs, computes the four-lever business case math (Smart Routing incremental revenue at 15% take rate + MDR savings on new TPV + per-attempt antifraud savings + Monitors qualitative), persists a row in `workshops_bc`, and returns a public URL at chief.yuno.tools/workshop/<slug>. The 26-slide deck (Cover, Agenda, 4 section dividers, Yuno set, 4 case studies, Coppel set with 4 lever slides, AI set with 3 product slides, summary set) is rendered client-side using the Yuno brandbook (Titillium Web, halftone dots, 6 themes). Use when the user types /yuno-workshops-bc or asks to generate a workshop BC / "workshop deck" / "BC para workshop" for a named client. Distinct from /yuno-bc (commercial BC), /sdr-bc (prospecting BC) and /ss-deck (visual storytelling deck) — this is the workshop-grade BC with explicit client inputs + visible math assumptions.
---

# Yuno Workshops BC Generator

Generates a 26-slide Workshop Business Case deck for a named client. Designed for in-person/Zoom workshops with engaged clients where the Yuno team needs to:

1. Explain what Yuno is (platform, products, AI, Monitors)
2. Walk through a tailored business case math with the client's actual numbers
3. Show portfolio proof and customer logos
4. Lock in next steps

**Deck structure (26 slides):** Cover · Agenda · `01 Sección Yuno` · Yuno en números · Plataforma · Marcas que confían · `02 Sección Casos` · inDrive · Rappi · Livelo · McDonald's · `03 Sección Cliente` · Stack actual · Volúmenes · 4 palancas overview · Lever Routing · Lever MDR · Lever Antifraude · Lever Monitors · `04 Sección AI` · NOVA · Concierge · Toolkit · Impacto anual · Equipo · Próximos pasos.

**Visual contract:** Yuno brandbook (Titillium Web font, lowercase typography, 6 themes — light/lilac/dark/blue/gradient/blue-gradient). Halftone dot decorations + Orb halftone glow on hero slides. 8-step staggered entrance animation triggered when each slide becomes active.

Served at `https://chief.yuno.tools/workshop/<slug>`. Read-public, no expiration. PDF at `https://bridge.yuno.tools/api/workshop/<slug>/pdf`.

Visual contract clones `/ss-deck` (same Yuno-blue ramp, Geist typography, dark canvas, gradient titles, border-beam cards, beam-rule animations) but never modifies the SS Deck skill.

## Trigger

- `/yuno-workshops-bc` (no args — runs Phase A)
- `/yuno-workshops-bc <Client Name>` (proceeds to Phase A)
- "armá un workshop BC para <cliente>" / "generate a workshop BC for <client>" / "necesito el deck de workshop para <cliente>"

## Flow

### Phase A — Language gate + input gathering

**FIRST, ALWAYS ASK LANGUAGE** (regla en memoria — `feedback_yuno_bc_language.md`):

> ¿En qué idioma generamos el deck del workshop? (es · en · pt)

Wait for the reply, then ask for currency (optional):

> ¿Moneda para mostrar números? (USD por defecto · MXN · BRL · COP · ARS · CLP · PEN · EUR · GBP)

If the user doesn't answer, default to **USD**. Currency is *display-only* —
math runs in the input currency regardless; this only changes how numbers are
formatted on the slides.

Then collect the rest:

```yaml
client_name: "Coppel"               # required, preserve casing
country: "MX"                       # ISO-2, optional
workshop_title: null                # optional override (default auto-generated)
workshop_date: "Mayo 2026"          # optional
client_logo: null                   # absolute URL, optional

# Math-critical (REQUIRED — fail the call without these)
monthly_transactions: 2800000       # APPROVED tx per month
avg_ticket_usd: 110                 # in USD
current_approval_rate_pct: 82       # 0-100

# Math-tunable (OPTIONAL — skip a lever if not provided)
current_acquirers: ["BBVA", "EVO"]
current_antifraud: "Cybersource"
current_mdr_pct: 1.60                # 1.60% = 1.60
target_mdr_pct: 1.50
current_antifraud_per_attempt: 0.04  # USD per attempt
target_antifraud_per_attempt: 0.03
target_approval_rate_pct: 85
take_rate_pct: 15                    # contribution margin for Smart Routing revenue uplift; default 15%

# Workshop framing (optional)
attendees:
  - { name: "Juan Pablo Ortega", role: "CEO", side: "yuno" }
  - { name: "Cliente CFO", role: "CFO", side: "client" }
```

If `monthly_transactions`, `avg_ticket_usd`, or `current_approval_rate_pct` are missing, ASK FOR THEM before calling the endpoint.

### Phase B — Identify the AE

Take `userEmail` from conversation context and pass as `createdByEmail`. The endpoint resolves the AE's `user_id` + `org_id` from `ae_integrations` (provider=gmail). If the AE has no Gmail integration, pass `org_id` explicitly from context.

### Phase C — POST to workshops-bc-generate

```bash
curl -sX POST \
  "https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/workshops-bc-generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFydXBlcWN6cnhtZmtjYmp3eWFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTE2ODMsImV4cCI6MjA4NTM4NzY4M30.gC3dki2lgl2mvqZqwhXW3oA_ZumVdXhaXuLb5HLehS8" \
  -H "X-Agent-Token: $(grep PRESENTATIONS_AGENT_TOKEN /Users/rasheedbayter/Documents/Laiky\ AI/.env.local | cut -d= -f2-)" \
  -d '{
    "createdByEmail": "<USER_EMAIL_FROM_CONVERSATION_CONTEXT>",
    "client_name": "Coppel",
    "country": "MX",
    "language": "es",
    "currency": "USD",
    "workshop_date": "Mayo 2026",
    "inputs": {
      "monthly_transactions": 2800000,
      "avg_ticket_usd": 110,
      "current_acquirers": ["BBVA", "EVO"],
      "current_antifraud": "Cybersource",
      "current_mdr_pct": 1.60,
      "target_mdr_pct": 1.50,
      "current_antifraud_per_attempt": 0.04,
      "target_antifraud_per_attempt": 0.03,
      "current_approval_rate_pct": 82,
      "target_approval_rate_pct": 85,
      "take_rate_pct": 15
    },
    "attendees": []
  }'
```

### Phase D — Handle responses

**Success:**
```json
{
  "id": "uuid",
  "slug": "coppel-gc6vyn",
  "url": "https://chief.yuno.tools/workshop/coppel-gc6vyn",
  "pdf_url": "https://bridge.yuno.tools/api/workshop/coppel-gc6vyn/pdf",
  "client_name": "Coppel",
  "language": "es",
  "currency": "USD",
  "content_source": "inputs_only",
  "business_case": {
    "tpv_monthly_usd": 308000000,
    "tpv_annual_usd": 3696000000,
    "annual_approved_tx": 33600000,
    "annual_attempts": 40975610,
    "approved_new_annual": 34829268,
    "incremental_approved_tx_annual": 1229268,
    "incremental_tpv_annual_usd": 135219512,
    "incremental_revenue_annual_usd": 20282927,
    "mdr_savings_annual_usd": 3831220,
    "antifraud_savings_annual_usd": 409756,
    "direct_savings_annual_usd": 4240976,
    "total_annual_value_usd": 24523902,
    "take_rate_pct": 15,
    "monitors_qualitative": true
  }
}
```

Report to user (one short line):

```
✅ Workshop deck generado: <url>
PDF: <pdf_url>
Impacto anual estimado: $XX.XM USD
```

**Errors:**
- `400 monthly_transactions is required` → re-ask for that specific input.
- `400 avg_ticket_usd is required` → re-ask.
- `400 current_approval_rate_pct is required (0-100)` → re-ask.
- `400 client_name is required` → re-ask the client name.
- `400 org_id is required` → surface the message; the user has no Gmail integration.
- `401 Invalid auth` → check `PRESENTATIONS_AGENT_TOKEN` is set in `.env.local`.
- `500 Insert failed` → verify migration 145 is applied.

## Math behind the four levers

| Lever | Formula |
|---|---|
| MDR savings | `tpv_annual × (current_mdr - target_mdr) / 100` |
| Antifraud savings | `(approved_tx / approval_rate) × (current_af - target_af) × 12` |
| Approval TPV uplift | `attempts × (target_approval - current_approval) × avg_ticket × 12` |
| Revenue uplift | `tpv_uplift × margin / 100` |

**Critical:** antifraud is charged per ATTEMPT, not per approved tx. `monthly_transactions` is treated as approvals; attempts = approvals / approval_rate.

## Distinct from other deck skills

| Skill                  | URL prefix                              | Source table       | What's in it |
|---|---|---|---|
| `/yuno-bc`             | chief.yuno.tools/bc/<slug>              | presentations      | Commercial 1-pager with pricing + customer logos |
| `/sdr-bc`              | chief.yuno.tools/sdr-bc/<slug>          | presentations      | Prospecting BC with regional traffic math |
| `/ss-deck`             | chief.yuno.tools/m/<slug>               | merchants_ss       | 21-slide visual sales deck (globe, topology) |
| **`/yuno-workshops-bc`** | **chief.yuno.tools/workshop/<slug>**  | **workshops_bc**   | **17-slide workshop deck (explainer + tailored math + proof + next steps)** |

When the user is ambiguous about which deck they want, ask:
> ¿Querés `/yuno-bc` (deck comercial), `/sdr-bc` (prospecting), `/ss-deck` (deck visual SS) o `/yuno-workshops-bc` (deck de workshop con math + proof + next steps)?

## Notes

- **Public read**: any cold-link visitor can load `/workshop/<slug>` without auth. Treat the slug as the share token.
- **Customer proof rule**: the deck only cites the 12 verified Yuno customers from memory's `reference_yuno_customer_proof_library.md` (Rappi, inDrive, Uber, McDonald's, Avianca, Viva Aerobus, Xcaret, Livelo, Reserva, Open English, Smartfit, SpaceX). Never invent metrics; the slides use only published numbers from y.uno/success-cases.
- **Anti-fabricated-proof**: the business case shows all assumptions on-slide (margin %, approval rate before/after, ticket, monthly tx). The "Revenue uplift" lever shows the margin assumption right in the card so it can't be misread as direct revenue.
- **Default Yuno team** appears on the Team slide (Co-founders + CRO + LatAm GM) when `attendees` is empty.
- **Language**: ALWAYS ask es/en/pt in Phase A before calling. Never assume from prior decks. Default to `es` only if the AE explicitly skips the question.
- **Currency**: optional in the skill prompt. Default `USD`. Whitelist: USD · MXN · BRL · COP · ARS · CLP · PEN · EUR · GBP. Currency is display-only — math computes identical numbers regardless.
