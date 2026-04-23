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

### 3. Collect inputs

**CRITICAL: This step is two phases. DO NOT proceed to step 4 until the user has replied with the required values. NEVER default the fields in Phase A — each deck needs real client numbers or the output is meaningless.**

#### Phase A — ASK the user, then STOP and wait

Send this message exactly (with the placeholder `<ClientName>` replaced) and then **halt**. Do not generate the curl. Do not assume defaults. Wait for the user's reply before going to Phase B:

```
Para generar el deck de <ClientName> necesito estos datos del cliente.

1) PER-COUNTRY BREAKDOWN (obligatorio — da forma a la slide 15):
   Lista los países donde opera hoy el cliente, y para cada uno:
     - tx       (transacciones/año, obligatorio)
     - mdrBps   (MDR en bps — OPCIONAL, si lo omites uso el global)
     - avgTicket (USD — OPCIONAL, si lo omites uso el global)

   Ejemplos válidos:
     "BR 120M tx, MX 45M tx, CO 20M tx"                   (usa MDR y avgTicket globales)
     "BR 120M tx mdr=285 tkt=42, MX 45M tx"               (BR custom, MX global)

2) VALORES GLOBALES (aplican donde no hay valor por país):
   avgTicket        = ?      (USD por transacción, global)
   currentApproval  = ?      (%, ej. 82.4)
   currentMDR       = ?      (%, ej. 2.45 — equivale a 245 bps)
   grossMargin      = ?      (%, ej. 4)

   Nota: el TPV global NO lo pregunto — se calcula como sum(tx × avgTicket) por país.

3) PRICING YUNO (negociado por cliente — SIEMPRE confirmar):
   pricingModel       = flat | tiered
   ratePerTx          = ?      (USD/tx, si flat)    [o rateTiers si tiered]
   minTxAnnual        = ?      (tx/año floor)
   monthlySaaS        = ?      (USD/mes)
   reconciliationFee  = ?      (USD/mes — OPCIONAL, déjalo en 0 si no aplica)

4) OPERACIÓN (Lever 03 operational savings):
   numNewIntegrations = ?      (cuántos providers nuevos va a integrar el cliente vía Yuno)
                               Cada integración cuesta $10K/mes × 3 meses = $30K in-house
                               y Yuno la entrega bundled. También driver de time-to-market.

5) VENDEDOR (aparece en la slide de cierre como contacto):
   salesName   = ?             (nombre completo, ej. "Rasheed Bayter")
   salesEmail  = ?             (email — OPCIONAL, default "carol@yuno.co" si no das)
   salesTitle  = ?             (cargo — OPCIONAL, default "Chief Business Officer")

Lo demás lo investigo yo (APMs actuales, providers actuales) o uso benchmarks Yuno
(approvalLiftPp 7.4, mdrReductionBps 38, apmUpliftPct 6, etc). Si quieres cambiar
algún benchmark, dime. Si no, usamos defaults.
```

**STOP. Wait for user reply. Do not invent values. Do not proceed.**

#### Phase B — After user replies

Once the user has provided the inputs:

1. **Build the `countries` array** from the user's list. Shape per entry:
   ```json
   { "code": "BR", "name": "brazil", "tx": 120000000, "mdrBps": 285, "avgTicket": 42 }
   ```
   - `code`: 2-3 letter ISO-ish (BR, MX, CO, CL, AR, US, ES, GB, IN…).
   - `name`: lowercase human label.
   - `tx`: integer transactions/year (parse "120M" → 120_000_000).
   - `mdrBps`, `avgTicket`: only include if the user gave per-country overrides. Omit the fields otherwise — the endpoint and deck fall back to the globals.
2. Set `activeMarkets` = `countries.length` (unless user overrode it).
3. **Do NOT send `tpv`** — the endpoint derives it from `sum(tx × avgTicket)` per country. If you send it anyway, the endpoint ignores it when `countries.length > 0`.
4. Take the user-provided values for `avgTicket`, `currentApproval`, `currentMDR`, `grossMargin`, and the pricing block.
5. For `currentAPMs` and `currentProviders` (counts) — if Firecrawl research returns data, use it; otherwise send `0`.
6. For `todayProviders` (list) — leave empty; the endpoint runs Firecrawl.
7. Use Yuno default levers (`approvalLiftPp = 7.4`, `mdrReductionBps = 38`, `apmUpliftPct = 6`, `newAPMsAdded = 180`, `fteTarget = 0.5`, `opsSavings = 2_100_000`, `conservativeMult = 0.6`, `optimisticMult = 1.4`, `npvMultiplier = 2.6`) unless the user overrode them.
8. Proceed to step 4.

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
    "countries": [
      { "code": "BR", "name": "brazil", "tx": 120000000, "mdrBps": 285, "avgTicket": 42 },
      { "code": "MX", "name": "mexico", "tx": 45000000 }
    ],
    "avgTicket": 48,
    "currentApproval": 82.4,
    "currentMDR": 2.45,
    "grossMargin": 4,
    "pricingModel": "flat",
    "ratePerTx": 0.04,
    "minTxAnnual": 200000,
    "monthlySaaS": 8000
  }'
```

Omit `tpv` — it's derived from `countries`. Omit Yuno lever defaults unless overriding.

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
- `avgTicket > 0`
- `0 < currentApproval ≤ 100`
- `0 < currentMDR ≤ 10` (MDR is in %)
- `0 < grossMargin ≤ 100`
- `pricingModel` ∈ {"flat", "tiered"}
- `minTxAnnual ≥ 0`, `monthlySaaS ≥ 0`
- `reconciliationFee` optional, 0 ≤ x ≤ 1e8 (USD/mes; 0 = card muestra "minimum commitment" genérico)
- `numNewIntegrations` optional integer, 0 ≤ x ≤ 1000 (drives Lever 03 integration cost $30K/int and time-to-market 3mo/int)
- `salesName` / `salesTitle` / `salesEmail` optional strings (close-slide contact; salesEmail must match email regex). Defaults to Carol Grunberg if absent.
- `countries`: optional array (≤20 entries). If present and non-empty, `tpv` is derived from sum(tx × avgTicket) per country.
  - Per country: `tx > 0` required; `mdrBps` (0 < x ≤ 1000) optional; `avgTicket` (0 < x ≤ 1e6) optional.
- `tpv > 0` — required only if `countries` is empty/absent; ignored otherwise.

The edge function re-validates; this skill-side check is for faster feedback.

## Common mistakes to avoid

- ❌ Don't generate local HTML files — the endpoint persists to Supabase
- ❌ Don't convert MDR to bps — keep as percent (2.45, not 245)
- ❌ Don't lowercase the client name — casing is preserved end-to-end
- ❌ Don't skip pricing questions — always confirm the Yuno commercial terms with the user
- ❌ Don't manually fill `todayProviders` unless the user specifies — let Firecrawl find them
- ❌ **Don't auto-default the client-specific inputs** (`activeMarkets`, `tpv`, `avgTicket`, `currentApproval`, `currentMDR`, `grossMargin`, and the pricing block). These are the whole point of the deck — every client is different. Using generic defaults (like Walmart's 2.4B TPV or 82.4% approval as a placeholder) produces a number-salad deck that doesn't match reality and is worse than no deck. **Always stop at Phase A of step 3 and wait for the user's reply.**

## Local debug helper (optional)

`research.py` in this directory can be run directly to preview what providers Firecrawl finds for a client, without creating a row:
```bash
python3 .claude/skills/yuno-bc/research.py "Rappi"
```
Requires `FIRECRAWL_API_KEY` in env or `.env.local`. Useful for debugging / sanity-checking research output.
