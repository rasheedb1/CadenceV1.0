---
name: draft-contrato
description: Generate a draft Yuno Order Form contract as a Google Doc for a specific client. Calls the bridge endpoint /api/generate-contract which copies a Google Docs template into the contracts folder and fills placeholders via replaceAllText. If a recent business case exists for the client in `presentations`, its pricing + country are pulled automatically; the caller fills the rest (registration number, address, effective date, integration type, contacts). Use when the user types /draft-contrato or asks to generate/create a contract draft for a named client.
---

# Yuno Order Form Contract Draft Generator

Creates a new Google Doc contract draft by calling the `generate-contract` endpoint on the bridge. The bridge copies a pre-authored template into the Yuno contracts folder in Drive and runs `replaceAllText` for each `{{VAR}}` placeholder.

Single source of truth: the bridge endpoint looks up the BC, formats pricing, copies the template, and returns the Doc URL. This skill is a thin client that gathers inputs and POSTs them.

Same company is always the signatory on Yuno's side — that's written literal in the template, not a variable.

## Trigger

- `/draft-contrato` (no args — asks for the client name)
- `/draft-contrato <Client Name>` (e.g., `/draft-contrato Rappi`)
- "genera un contrato para X" / "draft del contrato de X"

## Flow

### 1. Get the client name
Preserve casing (Rappi stays Rappi). Ask if not provided:
> ¿Para qué cliente el contrato?

### 2. Get the org_id
The endpoint requires `org_id`. Query Supabase once to get the user's primary org. Reads `$SUPABASE_ACCESS_TOKEN` from shell env — never hardcode.

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

Save the `id` value for the payload.

> ⚠️ The Supabase PAT (`sbp_...`) is an admin credential — never commit it, paste it in chat, or share in logs. If exposed, rotate at https://supabase.com/dashboard/account/tokens.

### 3. Look up a recent BC for this client

Query `presentations` for the most recent non-archived deck matching the client name. If one exists, the bridge endpoint will pull `COMPANY_NAME`, `COUNTRY`/`TERRITORY`, `MONTHLY_PLATFORM_FEE`, `TX_FEE_PAYMENT`, and `MIN_TX_COUNT` from it automatically. **Do this query before Phase A so you know what to ask and what not to ask.**

```bash
python3 - <<'PY'
import json, os, urllib.request
CLIENT = "<ClientName>"  # replace inline — never shell-interpolate into SQL strings
ORG = "<ORG_ID_FROM_STEP_2>"
q = f"""
  SELECT slug, client_name, defaults, created_at
  FROM presentations
  WHERE org_id = '{ORG}' AND archived = false AND client_name ILIKE '{CLIENT}'
  ORDER BY created_at DESC
  LIMIT 1;
"""
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

If you get a row, extract:
- `clientName` → use as `COMPANY_NAME`
- `countries[].name` → first one becomes `COUNTRY`, all joined with `", "` become `TERRITORY`
- `monthlySaaS` → `MONTHLY_PLATFORM_FEE` (format as `USD <n>`)
- `rateTiers[]` → **tabla de pricing** (ver abajo — ya no es un string plano)
- `ratePerTx` (solo si NO hay rateTiers) → pricing flat
- `minTxAnnual / 12` rounded → `MIN_TX_COUNT`

**Pricing: el bridge maneja dos modos automáticamente según lo que traiga el BC**:
- Si `rateTiers` tiene ≥1 entrada válida con `ratePerTx` → inserta una tabla nativa "Table 3: Transaction Pricing" en el Doc (FEE TYPE | MONTHLY VOLUME | TIER | FEE), con una fila por tier
- Si sólo hay `ratePerTx` flat → tabla de 1 fila con volumen "ALL TRANSACTIONS"
- Si el caller quiere forzar flat-string legacy, pasar `overrides.TX_FEE_PAYMENT = "USD X.XX per successful transaction"` (escape hatch — no se recomienda si hay BC)

**Formato de volumen en la tabla:** `0 - 5.000.000 TRANSACTIONS`, última fila `20.000.001+ TRANSACTIONS` (separador europeo con punto, matches estilo del template).

If no row, all required fields must come from the user (el usuario también puede dar los tiers a mano).

### 4. Collect inputs

**CRITICAL: Two phases. DO NOT proceed to step 5 until the user has replied with the required values. NEVER invent registration numbers, addresses, dates, contacts, or integration type — they are client-specific and the contract is legally binding.**

#### Phase A — ASK the user, then STOP and wait

Show what was pulled from the BC (if any) and ask for the rest. Send this message (adjust based on what the BC already covered) and **halt**:

```
Para el draft del contrato de <ClientName> necesito confirmar estos campos.

[Si hubo BC: "Jalé estos del business case <slug>:"]
  COMPANY_NAME          = <from BC or ask>
  COUNTRY               = <from BC first country, or ask>
  TERRITORY             = <from BC countries joined, or ask>
  MONTHLY_PLATFORM_FEE  = <from BC monthlySaaS formatted, or ask>
  MIN_TX_COUNT          = <from BC minTxAnnual/12, or ask>

[Pricing: el bridge construye automáticamente la tabla del contrato. Muéstrale al usuario qué va a renderizar:]
  Si BC tiene rateTiers:
    "La tabla 'Table 3: Transaction Pricing' se va a generar con estos tiers:
       Tier 1: 0 - X TRANSACTIONS     → USD <fee>
       Tier 2: X+1 - Y TRANSACTIONS   → USD <fee>
       Tier 3: Y+1+ TRANSACTIONS      → USD <fee>
     ¿Los confirmas o quieres ajustar?"
  Si BC tiene solo ratePerTx flat:
    "Pricing flat detectado: USD <rate> por transacción → se renderiza como tabla de 1 fila 'ALL TRANSACTIONS'. ¿OK?"
  Si no hay BC:
    "¿Pricing flat o tiered? Si tiered, dame cada tier (volumen máximo + fee)."

[Siempre pregunta estos — nunca vienen del BC:]
  REGISTRATION_NUMBER   = ?   (número de registro mercantil del cliente)
  COMPANY_ADDRESS       = ?   (dirección fiscal completa)
  EFFECTIVE_DATE        = ?   (fecha de inicio, formato "YYYY-MM-DD" o "Month DD, YYYY")
  INTEGRATION_TYPE      = ?   (API, SDK, o hosted checkout — puede ser varios)
  PRIMARY_CONTACT       = ?   (Name, Title, Email — en una sola línea)
  TECHNICAL_CONTACT     = ?   (Name, Title, Email)
  BILLING_CONTACT       = ?   (Name, Title, Email)

Opcionales (uso defaults Yuno si no me dices):
  SIGNATURE_DATE        = EFFECTIVE_DATE
  SUBSCRIPTION_TERM     = "12 months"
  AUTHORIZED_USERS      = "10"
  TX_FEE_FRAUD          = "USD 0.01 per successful transaction"
  TX_FEE_3DS            = "USD 0.025 per successful transaction"
  MIN_MONTHLY_GUARANTEE = "USD 200"

¿Confirmas los del BC y me mandas los demás?
```

**STOP. Wait for user reply. Do not invent values. Do not proceed.**

#### Phase B — After user replies

Once the user has provided all required fields:

1. Build the `overrides` object with every user-provided value. Keys match the template placeholders exactly (see Variables reference below).
2. Do NOT include defaults the user didn't override — the bridge endpoint injects them.
3. If the user confirmed BC values, you can either omit them from `overrides` (the endpoint pulls them from the BC via `bc_slug`) or include them in `overrides` (overrides win). Preferred: pass `bc_slug` so the user sees the linkage in the response.
4. Proceed to step 5.

### 5. POST to generate-contract

```bash
curl -sX POST \
  "https://twilio-bridge-production-241b.up.railway.app/api/generate-contract" \
  -H "Content-Type: application/json" \
  -d '{
    "org_id": "<ORG_ID_FROM_STEP_2>",
    "client_name": "<ClientName>",
    "bc_slug": "<slug from step 3 if any, else omit>",
    "overrides": {
      "REGISTRATION_NUMBER": "...",
      "COMPANY_ADDRESS": "...",
      "EFFECTIVE_DATE": "...",
      "INTEGRATION_TYPE": "...",
      "PRIMARY_CONTACT": "...",
      "TECHNICAL_CONTACT": "...",
      "BILLING_CONTACT": "..."
    }
  }'
```

The bridge endpoint:
1. Resolves the org's Google access token (via `/integrations/google/refresh`)
2. Looks up the BC if `bc_slug` is set, else falls back to `client_name ILIKE` match
3. Merges Yuno defaults → BC → overrides
4. Validates every required var is filled; returns `{success: false, missing: [...]}` if not
5. Copies the template into the contracts folder
6. Runs batch `replaceAllText` for each placeholder
7. Returns the Google Doc URL

### 6. Parse the response

**Success:**
```json
{
  "success": true,
  "docId": "1abc...",
  "url": "https://docs.google.com/document/d/1abc.../edit",
  "used_bc_slug": "rappi-a8f3c2",
  "vars_applied": ["AUTHORIZED_USERS", "BILLING_CONTACT", "..."]
}
```

**Missing fields (doc NOT created):**
```json
{
  "success": false,
  "missing": ["REGISTRATION_NUMBER", "EFFECTIVE_DATE"],
  "used_bc_slug": "rappi-a8f3c2",
  "message": "Missing required fields: ..."
}
```
→ Go back to Phase A, ask only for the missing fields, resubmit.

**Error (Google disconnected, template not found, etc):**
```json
{ "success": false, "error": "...", "details": {...} }
```
→ Show error to user; common fix: org needs to reconnect Google via WhatsApp.

### 7. Report to the user

```
✓ Contrato draft generado
→ <url>

Sanity check:
  Cliente:         <COMPANY_NAME>
  Territorio:      <TERRITORY>
  Platform fee:    <MONTHLY_PLATFORM_FEE>
  Pricing:         <response.pricing_table.mode — "tiered" con N filas, "flat_single", o "flat_override">
  Vigencia:        <SUBSCRIPTION_TERM> desde <EFFECTIVE_DATE>
  BC usado:        <used_bc_slug or "ninguno">

Revisa el draft en Drive antes de mandárselo al cliente.
```

## Variables reference (placeholders in template)

**Client-specific (required from user or BC):**
- `COMPANY_NAME`, `COUNTRY`, `REGISTRATION_NUMBER`, `COMPANY_ADDRESS`
- `EFFECTIVE_DATE`, `SIGNATURE_DATE`
- `TERRITORY`, `INTEGRATION_TYPE`
- `MONTHLY_PLATFORM_FEE`
- `PRIMARY_CONTACT`, `TECHNICAL_CONTACT`, `BILLING_CONTACT`

**Pricing (auto-table):**
- `{{TX_FEE_PAYMENT}}` en el template es un **marcador** — el bridge lo borra e inserta una tabla nativa "Table 3: Transaction Pricing" con columnas `FEE TYPE | MONTHLY TRANSACTION VOLUME | TIER | FEE PER TRANSACTION`.
- Source priority:
  1. `overrides.TX_FEE_PAYMENT` string → modo legacy, se reemplaza como texto plano (no tabla). Sólo usar si quieres forzar flat sin BC.
  2. `BC.defaults.rateTiers[]` con ≥2 entradas → tabla tiered (1 fila por tier)
  3. `BC.defaults.rateTiers[]` con 1 entrada, o `BC.defaults.ratePerTx > 0` → tabla flat de 1 fila ("ALL TRANSACTIONS")
  4. Nada → `{success: false, missing: ["TX_FEE_PAYMENT"]}`

**Yuno defaults (overridable):**
- `SUBSCRIPTION_TERM` = `"12 months"`
- `AUTHORIZED_USERS` = `"10"`
- `TX_FEE_FRAUD` = `"USD 0.01 per successful transaction"`
- `TX_FEE_3DS` = `"USD 0.025 per successful transaction"`
- `MIN_MONTHLY_GUARANTEE` = `"USD 200"`
- `MIN_TX_COUNT` = `"5,000"`

**Yuno signatory:** written literal in the template (not a placeholder) — same for every contract.

## Validation rules

- `client_name`: non-empty (required unless `bc_slug` is provided)
- `overrides`: object of string values; keys must match placeholder names exactly (e.g., `COMPANY_NAME`, not `companyName`)
- `EFFECTIVE_DATE`: plain string — the endpoint doesn't parse it. Use human-readable format (`"April 23, 2026"` or `"2026-04-23"`) consistent with the template's style.
- Currency strings: include the `USD` prefix and the units suffix where the template shows them (e.g., `"USD 4,200"` for platform fee; `"USD 0.04 per successful transaction"` for tx fee).
- Contact strings: format as `"Name, Title, email@domain.com"` — single line, no newlines.

## Common mistakes to avoid

- ❌ **Don't invent the registration number, address, or contacts.** These are legally binding; never guess. Always ask the user in Phase A.
- ❌ **Don't skip the BC lookup in step 3.** If a BC exists, pulling its pricing saves the user from re-typing numbers that are already in the system and could drift.
- ❌ **Don't send `overrides.COMPANY_NAME` with different casing than the BC** if using `bc_slug`. The endpoint merges with override winning, so casing drift = visible drift in the contract.
- ❌ **Don't pass overrides as numbers** — all template placeholders are text strings. `"MONTHLY_PLATFORM_FEE": 3800` produces literal `3800` in the doc (no USD prefix). Format as `"USD 3,800"`.
- ❌ **Don't retry on `{success: false, missing: [...]}` without asking the user** — that's the endpoint telling you what's still needed. Ask the user, don't guess.
- ❌ **Don't assume the Google token is fresh** — the endpoint refreshes automatically. But if the org has never connected Google, it returns a clear error; relay it to the user.
- ❌ **Don't modify the template from this skill.** Template edits are done manually in Drive; the skill only reads + copies it.
- ❌ **Don't pass `overrides.TX_FEE_PAYMENT` when the BC has `rateTiers`.** El override legacy corta la tabla y mete un string plano en su lugar — se pierden los tiers. Sólo úsalo si de verdad quieres flat-string legacy y el BC no trae tiers.

## Debugging

**"docs.batchUpdate 400: ... is not a Google Doc"**
→ Template is stored as `.docx`. Open the template in Drive, `File → Save as Google Doc`, update `CONTRACT_TEMPLATE_DOC_ID` env var in Railway bridge, redeploy.

**"drive.files.copy 403"**
→ Template or output folder not accessible to the org's connected Google account. Share both with that account (or change the owner).

**"Google not connected for this org"**
→ The org needs to run `conectar_gmail` from WhatsApp first to establish the OAuth token.

**Placeholders left literal in the generated doc (e.g., `{{COMPANY_NAME}}` still visible)**
→ Either the variable name in `overrides` doesn't match the template, or the template still has the PDF-style `[X]` brackets instead of `{{X}}`. Verify both.

**`{{TX_FEE_PAYMENT}}` aparece literal y NO hay tabla**
→ El bridge intentó insertar la tabla pero el marker no se localizó. Causas posibles:
  - El template no tiene `{{TX_FEE_PAYMENT}}` como placeholder (ej. ya está reemplazado o tiene formato distinto)
  - El BC no trae `rateTiers` ni `ratePerTx` y no se mandó `overrides.TX_FEE_PAYMENT`
  - El response trae `pricing_table.inserted: false` con un `reason` ("marker_not_found", "no_rows") — leerlo te dice qué falló
→ Fix: confirmar que el template tiene `{{TX_FEE_PAYMENT}}` exactamente, o mandar `overrides.TX_FEE_PAYMENT` legacy.
