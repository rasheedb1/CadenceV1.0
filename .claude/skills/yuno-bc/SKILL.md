---
name: yuno-bc
description: Create a Yuno business case deck for a specific client. Posts to the presentation-create edge function on Supabase, which researches the client's payment stack via Firecrawl, persists the row in `presentations`, and returns a public URL at chief.yuno.tools/bc/<slug> that's live for 90 days. Use when the user types /yuno-bc or asks to generate/create a business case for a named client.
---

# Yuno Business Case Generator

Creates a new deck in the Chief `presentations` table by calling the `presentation-create` edge function. The deck is served publicly at `https://chief.yuno.tools/bc/<slug>` until 90 days after creation.

Single source of truth: the edge function computes the slug, runs Firecrawl research, and persists the row. This skill is just a thin client that gathers the inputs and POSTs them.

## Trigger

- `/yuno-bc` (no args — asks for the client name)
- `/yuno-bc <Client Name>` (e.g., `/yuno-bc Rappi`)
- "create a business case for X" / "genera BC para X"

## Flow

### 1. Get the client name
Preserve casing (Rappi stays Rappi, ikea stays ikea). Ask if not provided:
> ¿Para qué cliente?

### 2. Get the org_id
The edge function requires `orgId` on the body. For an interactive Claude Code session, query Supabase once to get the user's first/primary org. Reads the Supabase Personal Access Token from `$SUPABASE_ACCESS_TOKEN` — never hardcode it in files or chat:

```bash
test -n "$SUPABASE_ACCESS_TOKEN" || { echo "Set SUPABASE_ACCESS_TOKEN in your shell env"; exit 1; }
python3 - <<'PY'
import json, os, urllib.request
q = "SELECT id, name FROM organizations ORDER BY created_at LIMIT 1;"
r = urllib.request.Request(
  'https://api.supabase.com/v1/projects/arupeqczrxmfkcbjwyad/database/query',
  data=json.dumps({'query': q}).encode(),
  headers={
    'Authorization': f"Bearer {os.environ['SUPABASE_ACCESS_TOKEN']}",
    'Content-Type': 'application/json',
    'User-Agent': 'supabase-cli/claude-code',
  },
  method='POST',
)
print(urllib.request.urlopen(r, timeout=30).read().decode())
PY
```

> ⚠️ The Supabase Personal Access Token (`sbp_...`) is an admin credential — never commit it, paste it in chat, or share in logs. If exposed, rotate immediately at https://supabase.com/dashboard/account/tokens.

Save the `id` value for the create payload.

### 3. Collect inputs (ONE message with the full template)

Present this template to the user and let them reply with overrides or "all defaults":

```
Cliente: <ClientName>                (confirmado)

PERFIL DEL CLIENTE (dime cuáles cambiar):
  date             = "Q2 2026"
  tpv              = 2_400_000_000     (USD/año)
  avgTicket        = 48                (USD)
  currentApproval  = 82.4              (%)
  currentMDR       = 2.45              (%)
  activeMarkets    = 18
  currentAPMs      = 34
  currentProviders = 12
  grossMargin      = 4                 (%)
  fteToday         = 4

PRICING YUNO (SIEMPRE preguntar — es negociado por cliente):
  pricingModel     = "flat"            (o "tiered")
  ratePerTx        = 0.04              (USD/tx, si flat)
  rateTiers        = [                 (si tiered)
    { upToTx: 200000, ratePerTx: 0.08 },
    { upToTx: 500000, ratePerTx: 0.06 },
    { upToTx: null,   ratePerTx: 0.04 }
  ]
  minTxAnnual      = 200000            (tx/año floor)
  monthlySaaS      = 8000              (USD/mes)

SUPUESTOS DE LEVERS (benchmarks Yuno, casi siempre default):
  approvalLiftPp      = 7.4
  mdrReductionBps     = 38
  apmUpliftPct        = 6
  newAPMsAdded        = 180
  fteTarget           = 0.5
  opsSavings          = 2_100_000
  conservativeMult    = 0.6
  optimisticMult      = 1.4
  npvMultiplier       = 2.6

NOTAS:
- Si no conoces los providers actuales, DÉJALO VACÍO — el endpoint investiga con Firecrawl.
- Para regenerar un deck existente, usa: "regenerate <slug>" y reemplazo solo los campos que cambies.
```

If the user says "todo default con pricing: flat 0.04 / min 200K / saas 8000", use those.

### 4. POST to presentation-create

```bash
curl -sX POST \
  "https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/presentation-create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFydXBlcWN6cnhtZmtjYmp3eWFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTE2ODMsImV4cCI6MjA4NTM4NzY4M30.gC3dki2lgl2mvqZqwhXW3oA_ZumVdXhaXuLb5HLehS8" \
  -H "X-Agent-Token: $(grep PRESENTATIONS_AGENT_TOKEN /Users/rasheedbayter/Documents/Laiky\ AI/.env.local | cut -d= -f2-)" \
  -d '{
    "orgId": "<ORG_ID_FROM_STEP_2>",
    "clientName": "<ClientName>",
    "date": "...",
    "tpv": ...,
    ... all fields ...
  }'
```

The Supabase anon key is baked in (public). The `PRESENTATIONS_AGENT_TOKEN` is read from `.env.local` at runtime.

### 5. Parse the response

Successful response:
```json
{
  "id": "uuid",
  "slug": "rappi-a8f3c2",
  "url": "https://chief.yuno.tools/bc/rappi-a8f3c2",
  "expiresAt": "2026-07-21T22:03:56+00:00",
  "providers": ["dlocal", "mercado pago", "ebanx", ...],
  "regeneratedFrom": null
}
```

### 6. Report to the user

```
✓ Deck generado
→ https://chief.yuno.tools/bc/<slug>

Sanity check:
  Client:         <ClientName>
  TPV:            $X.XB
  Pricing model:  flat/tiered
  Yuno annual:    $X.XM (computed by deck runtime)
  Providers:      <comma-separated list>
  Válido hasta:   <ISO date>
```

## Regeneration

If the user says "regenera X" or "regenerate <slug>":
1. POST to `presentation-create` with `regenerateFrom: "<slug>"` — the endpoint copies parent defaults
2. Include any fields to override on the new version
3. The old slug is NOT invalidated — both versions coexist until the old one expires

## Validation rules

- `clientName`: non-empty
- `tpv > 0`, `avgTicket > 0`
- `0 < currentApproval ≤ 100`
- `0 < currentMDR ≤ 10` (MDR is in %)
- `0 < grossMargin ≤ 100`
- `pricingModel` ∈ {"flat", "tiered"}
- `minTxAnnual ≥ 0`, `monthlySaaS ≥ 0`

The edge function re-validates; this skill-side check is for faster feedback.

## Common mistakes to avoid

- ❌ Don't generate local HTML files — the endpoint persists to Supabase
- ❌ Don't convert MDR to bps — keep as percent (2.45, not 245)
- ❌ Don't lowercase the client name — casing is preserved end-to-end
- ❌ Don't skip pricing questions — always confirm the Yuno commercial terms with the user
- ❌ Don't manually fill `todayProviders` unless the user specifies — let Firecrawl find them

## Local debug helper (optional)

`research.py` in this directory can be run directly to preview what providers Firecrawl finds for a client, without creating a row:
```bash
python3 .claude/skills/yuno-bc/research.py "Rappi"
```
Requires `FIRECRAWL_API_KEY` in env or `.env.local`. Useful for debugging / sanity-checking research output.
