---
name: yuno-bc
description: Create a Yuno business case deck for a specific client. Posts to the presentation-create edge function on Supabase, which researches the client's payment stack via Firecrawl, persists the row in `presentations`, and returns a public URL at chief.yuno.tools/bc/<slug> that's live for 90 days. Use when the user types /yuno-bc or asks to generate/create a business case for a named client.
---

# Yuno Business Case Generator

Creates a new deck in the Chief `presentations` table by calling the `presentation-create` edge function. The deck is served publicly at `https://chief.yuno.tools/bc/<slug>` until 90 days after creation.

Single source of truth: the edge function computes the slug, runs Firecrawl research, and persists the row. This skill is just a thin client that gathers the inputs and POSTs them.

## Trigger

- `/yuno-bc` (no args — asks for the client name + language)
- `/yuno-bc <Client Name>` (e.g., `/yuno-bc Rappi` — asks for language)
- `/yuno-bc <Client Name> <es|en|pt>` (e.g., `/yuno-bc Rappi pt` — language pre-set)
- "create a business case for X" / "genera BC para X"

## Flow

### 1. Get the client name
Preserve casing (Rappi stays Rappi, ikea stays ikea). Ask if not provided:
> ¿Para qué cliente?

### 1b. ALWAYS ask for the language

Never assume — always ask before generating, even when the user has worked on Spanish-only or English-only decks before. Different decks for different audiences.

If the user already passed `es`, `en` or `pt` as a second arg, skip the question and use it. Otherwise ask:

> ¿En qué idioma generamos el deck — **español (es)**, **inglés (en)** o **português (pt)**?

Wait for the user's reply. Save the answer as `locale ∈ {'en', 'es', 'pt'}` for the curl payload.

The deck and the public landing page both render in that language. Don't proceed to Phase A inputs until you have the locale answer.

### 2. Identify the AE (resolves both user_id and org_id)
The edge function looks up the AE by their connected Gmail email. From the conversation context, take the user's email (system field `userEmail`, e.g., `rasheed@y.uno`) and pass it as `createdByEmail` in the create payload — DO NOT query the database from the skill.

The edge function will:
- Find the matching row in `ae_integrations` (provider=gmail) by email
- Use that integration's `user_id` as `created_by` and its `org_id` as the BC's org
- Reject the request if the AE has no Gmail integration (returns a clear error asking to connect Gmail in Chief)

This means: **the AE must have completed the Google OAuth flow in Chief** (UI Settings or WhatsApp `/conectar gmail`) before creating BCs. View-tracking notifications use that same Gmail to send a self-note when someone opens the deck.

### 3. Collect inputs

**CRITICAL: This step is two phases. DO NOT proceed to step 4 until the user has replied with the required values. NEVER default the fields in Phase A — each deck needs real client numbers or the output is meaningless.**

#### Phase A — ASK the user, then STOP and wait

Send this message exactly (with the placeholder `<ClientName>` replaced) and then **halt**. Do not generate the curl. Do not assume defaults. Wait for the user's reply before going to Phase B:

```
Para generar el deck de <ClientName> necesito estos datos del cliente.

1) PER-COUNTRY BREAKDOWN (obligatorio — da forma a la slide 15):
   Lista los países donde opera hoy el cliente, y para cada uno:
     - tx       (transacciones/MES, NÚMERO PLANO obligatorio — ej. 1500000 = 1.5M tx/mes)
     - mdrBps   (MDR en bps — OPCIONAL, si lo omites uso el global)
     - avgTicket (USD — OPCIONAL, si lo omites uso el global)

   Ejemplos válidos:
     "BR 10000000 tx, MX 4000000 tx, CO 1500000 tx"       (10M brasil, 4M méxico, 1.5M colombia — todo mensual)
     "BR 10000000 tx mdr=285 tkt=42, MX 4000000 tx"       (BR custom, MX global)
     "global 110000 tx"                                   (sin desglose — una sola fila "Global", 110K tx/mes)

   IMPORTANTE: NO uses sufijos "120M" / "1.5K". Pasame los números enteros mensuales.
   Si el cliente opera global y NO hay desglose por país, di "global <N> tx" y
   construyo una fila única { code: "WW", name: "global", tx: N } para que slide 15
   no quede vacía. En este caso SIEMPRE preguntar el countryCount real (pregunta 2).

2) PRESENCIA DEL CLIENTE (slide 11 + slide "Tu stack hoy" — evita que salga en 0):
   countryCount      = ?      (int — en cuántos países opera hoy el cliente, aunque mandes una sola fila "global")
   currentAPMs       = ?      (int — cuántos métodos de pago acepta hoy: cards, wallets, APMs locales, etc.)
   currentProviders  = ?      (int — cuántos PSPs/gateways tiene hoy)
   todayProviders    = ?      (LISTA de nombres concretos, ej. "stripe, adyen, dlocal, mercado pago, payu, ..." — máx. 12)
                              Drives la slide "Tu stack hoy". Si lo das, los nombres aparecen tal cual en el deck.

   Si NO sabes estos números/nombres, di "no sé" o "investígalos" y yo uso WebFetch/WebSearch
   contra el sitio del cliente (footer de checkout, página "about", stack de pagos) y
   propongo una estimación antes de mandar el curl. Firecrawl dentro del endpoint sólo
   busca providers públicos y casi siempre cae a 0 — mejor si yo investigo en Phase B
   y propongo nombres concretos para aprobación.

3) VALORES GLOBALES (aplican donde no hay valor por país):
   avgTicket        = ?      (USD por transacción, global)
   currentApproval  = ?      (%, ej. 82.4)
   currentMDR       = ?      (%, ej. 2.45 — equivale a 245 bps)
   grossMargin      = ?      (%, ej. 4)

   Nota: el TPV global NO lo pregunto — se calcula como sum(tx × avgTicket) por país.

3b) PALANCAS YUNO (negociadas por cliente — SIEMPRE confirmar):
   approvalLiftPp    = ?     (puntos porcentuales de uplift en approval — drives Lever 1.
                              Default Yuno: 7.4. Ej: si el cliente tiene 82.4% y le subimos
                              a 89.8%, pasá 7.4. Si negociaste un compromiso distinto, ajustá.)
   mdrReductionBps   = ?     (basis points que le bajamos al MDR — drives Lever 2.
                              Default Yuno: 38 (≈0.38%). Ej: si su MDR es 2.45% y lo
                              llevamos a 2.07%, pasá 38. 100 bps = 1%.)

   Estas dos palancas son las que aparecen explícitamente en el deck como compromisos.
   El usuario PUEDE dejarlas en default escribiendo "default" / "estándar Yuno" — en ese
   caso omitís los campos del payload y el backend aplica 7.4 / 38 automáticamente.
   Si el usuario da un número, lo respetás tal cual.

4) PRICING YUNO (negociado por cliente — SIEMPRE confirmar):
   pricingModel = flat | tramos | tiers
     • flat   → una tarifa USD/tx para todo el volumen
     • tramos → cada tramo cobra su rate; se SUMAN (ej. 100K@0.05 + 50K@0.04 para 150K tx/mes)
     • tiers  → todo el volumen al rate del bracket donde cae (ej. 150K cae en bracket "100K+ @ 0.04" → 150K × 0.04)
   ratePerTx       = ?  (USD/tx — solo si flat)
   rateTiers       = ?  (solo si tramos|tiers — lista de brackets MENSUALES con ratePerTx)
                        Ej tramos: "0-100K @ 0.05, 100K-500K @ 0.04, 500K+ @ 0.03"
                        Ej tiers:  "hasta 100K @ 0.05, hasta 500K @ 0.04, sobre 500K @ 0.03"
                        (mismo formato; lo distingue pricingModel)
   minTxMonthly    = ?  (tx/MES floor — lo paso a anual ×12 antes del curl)
   monthlySaaS     = ?  (USD/mes)
   reconciliationFee = ?  (USD/mes — OPCIONAL, déjalo en 0 si no aplica)

5) OPERACIÓN (Lever 03 operational savings):
   numNewIntegrations = ?      (cuántos providers nuevos va a integrar el cliente vía Yuno)
                               Cada integración cuesta $10K/mes × 3 meses = $30K in-house
                               y Yuno la entrega bundled. También driver de time-to-market.

6) VENDEDOR (aparece en la slide de cierre como contacto):
   salesName   = ?             (nombre completo, ej. "Rasheed Bayter")
   salesEmail  = ?             (email — OPCIONAL, default "carol@yuno.co" si no das)
   salesTitle  = ?             (cargo — OPCIONAL, default "Chief Business Officer")

Lo demás lo investigo yo (APMs actuales, providers actuales) o uso benchmarks Yuno
(apmUpliftPct 6, newAPMsAdded 180, fteTarget 0.5, opsSavings 2.1M, conservativeMult 0.6,
optimisticMult 1.4, npvMultiplier 2.6). Si quieres cambiar algún benchmark, dime. Si no,
usamos defaults. (approvalLiftPp y mdrReductionBps se preguntan arriba en 3b porque son
los compromisos comerciales con el cliente.)
```

**STOP. Wait for user reply. Do not invent values. Do not proceed.**

#### Phase B — After user replies

Once the user has provided the inputs:

1. **Build the `countries` array** from the user's list. Shape per entry (ANNUAL in payload — multiplica ×12 los tx mensuales que dio el usuario):
   ```json
   { "code": "BR", "name": "brazil", "tx": 120000000, "mdrBps": 285, "avgTicket": 42 }
   ```
   - `code`: 2-3 letter ISO-ish (BR, MX, CO, CL, AR, US, ES, GB, IN…).
   - `name`: lowercase human label.
   - `tx`: integer transactions/AÑO. **Convertir desde mensual: si el user dijo 10000000, mandá 120000000.**
   - `mdrBps`, `avgTicket`: only include if the user gave per-country overrides. Omit the fields otherwise — the endpoint and deck fall back to the globals.
   - **"Global" fallback:** if the user said "global" / "es global" / didn't give per-country breakdown, send ONE row: `{ "code": "WW", "name": "global", "tx": <totalAnnualTx> }` (también ×12). Never send `countries: []` — slide 15 renders blank otherwise.
2. **Set `activeMarkets` from the user's `countryCount` answer** (question 2 in Phase A). DO NOT use `countries.length` — that's 1 when user said "global", but the real market count can be higher. Only fall back to `countries.length` if the user explicitly didn't answer countryCount.
3. **Do NOT send `tpv`** — the endpoint derives it from `sum(tx × avgTicket)` per country. If you send it anyway, the endpoint ignores it when `countries.length > 0`.
4. Take the user-provided values for `avgTicket`, `currentApproval`, `currentMDR`, `grossMargin`, and the pricing block.
5. **For `currentAPMs` and `currentProviders` (counts) — use the user's answer from Phase A question 2 when given.** If the user said "no sé" / "investígalos":
   - Run `WebFetch` against the client's homepage + `/checkout` / `/pagos` / `/payment` pages and count distinct payment methods shown (cards, wallets, local APMs).
   - For providers (PSPs/gateways), check page source / footer for known markers (MercadoPago, Stripe, Adyen, dLocal, PayU, Ebanx, Transbank, etc.). If nothing public, estimate from market footprint (LATAM multi-country multi-PSP clients typically have 3-5).
   - **Report the researched numbers back to the user and wait for approval** before sending the curl. Do NOT silently inject researched numbers.
   - If even research returns nothing usable, fall back to `0` (slide 11 will show 0 — better than a wrong guess).
6. For `todayProviders` (list of provider names) — **PREFER user input over Firecrawl**:
   - Si el user dio nombres en Phase A pregunta 2 → mandalos como array de strings (lowercase, trimmed). Drives la slide "Tu stack hoy".
   - Si dijo "no sé" / "investígalos" → vos hacés la investigación con WebFetch/WebSearch en Phase B y proponés la lista para aprobación antes del curl.
   - Solo dejá vacío (`todayProviders` omitted) cuando ni el user ni vos pudieron conseguir nombres — el endpoint corre Firecrawl como fallback.
7. **Approval lift + MDR reduction (commercial commitments, asked in Phase A 3b):**
   - If the user gave numbers → include `approvalLiftPp` and `mdrReductionBps` in the payload exactly as given.
   - If the user said "default" / "estándar Yuno" / didn't override → **omit both fields**; the backend applies `approvalLiftPp = 7.4` and `mdrReductionBps = 38` automatically.
   - Other Yuno default levers (`apmUpliftPct = 6`, `newAPMsAdded = 180`, `fteTarget = 0.5`, `opsSavings = 2_100_000`, `conservativeMult = 0.6`, `optimisticMult = 1.4`, `npvMultiplier = 2.6`) → leave them off the payload unless the user explicitly asked to change one.
8. **Convertir pricing inputs a anual** antes del payload:
   - `minTxAnnual = minTxMonthly × 12`
   - Si `pricingModel ∈ {tramos, tiers}`: para cada `rateTiers[i]`, multiplicar `upToTx × 12` (mantener `null` en el último). `ratePerTx` se queda igual (ya es USD/tx).
   - Backend acepta `tiered` como alias legacy de `tramos`, pero **siempre mandá el valor canónico (`tramos` o `tiers`)** en BCs nuevos.
9. **Calcular y mostrar breakdown ANTES del curl**. Computa monthly + annual con la fórmula correcta según modelo:
   - `flat`: `txFee = txAnnual × ratePerTx`
   - `tramos`: por cada tramo, `take = min(remaining, upToTx - prev) × ratePerTx`; suma todos
   - `tiers`: encontrar el bracket donde `txAnnual ≤ upToTx` (o último si todos cap'd) y `txFee = txAnnual × ratePerTx_de_ese_bracket`
   - `txAnnualFee = max(actualTxFee, minCommitFee)` donde `minCommitFee` se calcula igual con `minTxAnnual`
   - `total = txAnnualFee + monthlySaaS×12 + reconciliationFee×12`

   Mostrar al usuario y esperar OK antes de POSTear:
   ```
   Pricing breakdown — <ClientName> (<pricingModel>):
     volumen:        <txMonthly> tx/mes  →  <txAnnual> tx/año
     tx fee:         $X/mes  →  $Y/año
     saas:           $X/mes  →  $Y/año
     reconciliation: $X/mes  →  $Y/año   (omitir si 0)
     ────────────────────────────────────
     TOTAL Yuno:     $X/mes  →  $Y/año
   ```
10. Proceed to step 4.

### 4. POST to presentation-create

```bash
curl -sX POST \
  "https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/presentation-create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFydXBlcWN6cnhtZmtjYmp3eWFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTE2ODMsImV4cCI6MjA4NTM4NzY4M30.gC3dki2lgl2mvqZqwhXW3oA_ZumVdXhaXuLb5HLehS8" \
  -H "X-Agent-Token: $(grep PRESENTATIONS_AGENT_TOKEN /Users/rasheedbayter/Documents/Laiky\ AI/.env.local | cut -d= -f2-)" \
  -d '{
    "createdByEmail": "<USER_EMAIL_FROM_CONVERSATION_CONTEXT>",
    "clientName": "<ClientName>",
    "locale": "<es|en|pt — from step 1b>",
    "date": "...",
    "countries": [
      { "code": "BR", "name": "brazil", "tx": 120000000, "mdrBps": 285, "avgTicket": 42 },
      { "code": "MX", "name": "mexico", "tx": 45000000 }
    ],
    "activeMarkets": 2,
    "currentAPMs": 12,
    "currentProviders": 3,
    "avgTicket": 48,
    "currentApproval": 82.4,
    "currentMDR": 2.45,
    "grossMargin": 4,
    "approvalLiftPp": 7.4,
    "mdrReductionBps": 38,
    "pricingModel": "flat",
    "ratePerTx": 0.04,
    "minTxAnnual": 2400000,
    "monthlySaaS": 8000
  }'
```

**Ejemplo con tramos** (user dijo: "0-100K @ 0.05, 100K-500K @ 0.04, 500K+ @ 0.03" mensuales):
```json
{
  "pricingModel": "tramos",
  "rateTiers": [
    { "upToTx": 1200000,  "ratePerTx": 0.05 },
    { "upToTx": 6000000,  "ratePerTx": 0.04 },
    { "upToTx": null,     "ratePerTx": 0.03 }
  ],
  "minTxAnnual": 2400000
}
```

**Ejemplo con tiers** (mismos brackets, pero whole-volume): idéntica `rateTiers`, solo cambia `pricingModel: "tiers"`.

Omit `tpv` — it's derived from `countries`. Send `approvalLiftPp` / `mdrReductionBps` only when the user gave per-client values in Phase A 3b; omit them to let the backend apply 7.4 / 38. Omit other Yuno lever defaults unless overriding.

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
- `pricingModel` ∈ {"flat", "tramos", "tiers"} (backend acepta "tiered" como alias legacy de "tramos" para regeneraciones de BCs viejos — pero en BCs nuevos siempre mandá el valor canónico)
- `locale` ∈ {"en", "es", "pt"} (optional in payload — defaults to "en". Skill MUST always ask the user; never pass without confirming.)
- `minTxAnnual ≥ 0`, `monthlySaaS ≥ 0`
- `approvalLiftPp` optional, 0 ≤ x ≤ 100 (percentage points). Omit → backend defaults to 7.4
- `mdrReductionBps` optional, 0 ≤ x ≤ 1000 (basis points). Omit → backend defaults to 38
- `reconciliationFee` optional, 0 ≤ x ≤ 1e8 (USD/mes; 0 = card muestra "minimum commitment" genérico)
- `numNewIntegrations` optional integer, 0 ≤ x ≤ 1000 (drives Lever 03 integration cost $30K/int and time-to-market 3mo/int)
- `salesName` / `salesTitle` / `salesEmail` optional strings (close-slide contact; salesEmail must match email regex). Defaults to Carol Grunberg if absent.
- `countries`: optional array (≤20 entries). If present and non-empty, `tpv` is derived from sum(tx × avgTicket) per country.
  - Per country: `tx > 0` required; `mdrBps` (0 < x ≤ 1000) optional; `avgTicket` (0 < x ≤ 1e6) optional.
- `tpv > 0` — required only if `countries` is empty/absent; ignored otherwise.

The edge function re-validates; this skill-side check is for faster feedback.

## Common mistakes to avoid

- ❌ **Don't skip the language question.** Always ask `idioma (es | en | pt)` at step 1b, even with returning users. Different audiences (LATAM vs. global vs. Brasil, etc.) — never assume.
- ❌ Don't generate local HTML files — the endpoint persists to Supabase
- ❌ Don't convert MDR to bps — keep as percent (2.45, not 245)
- ❌ Don't lowercase the client name — casing is preserved end-to-end
- ❌ Don't skip pricing questions — always confirm the Yuno commercial terms with the user
- ❌ **Don't skip `todayProviders` when el user te dio nombres**. La slide "Tu stack hoy" es una de las primeras del deck y muestra tus proveedores actuales junto al stack Yuno. Si pasás los nombres del user, el deck refleja exactamente su realidad; si dejás que Firecrawl los busque, casi siempre cae a 0 o lista parcial.
- ❌ **Don't leave `countries` empty.** If the user said "es global" / no per-country breakdown, send ONE row `{ "code": "WW", "name": "global", "tx": <total> }`. An empty array makes slide 15 render blank ("no country breakdown provided"). Seen live: tur.com first pass showed $0 TPV across 0 markets on slide 15.
- ❌ **Don't skip `activeMarkets` / `currentAPMs` / `currentProviders`.** These power slide 11 (client footprint today) and default to 0 when absent. Firecrawl rarely finds them (most clients hide their payment stack), so always ASK the user in Phase A question 2 and pass the user's numbers. Sending 0 makes the deck look like the client doesn't exist.
- ❌ **Don't auto-default the client-specific inputs** (`tpv`, `avgTicket`, `currentApproval`, `currentMDR`, `grossMargin`, and the pricing block). These are the whole point of the deck — every client is different. Using generic defaults (like Walmart's 2.4B TPV or 82.4% approval as a placeholder) produces a number-salad deck that doesn't match reality and is worse than no deck. **Always stop at Phase A of step 3 and wait for the user's reply.**
- ❌ **Don't use "120M" / "1.5K" shorthand for tx**. Inputs son MENSUALES en número plano (1500000 = 1.5M tx/mes). El skill multiplica ×12 al armar el payload — vos no sumes ni multipliques la cifra que dio el user antes de mostrarle el breakdown.
- ❌ **Don't skip the breakdown preview**. Antes del POST, calculá monthly + annual con la fórmula correcta según `pricingModel` y mostrale al usuario. Una pricing mal-tipeada se ve en el breakdown y se corrige antes de generar el deck.

## Local debug helper (optional)

`research.py` in this directory can be run directly to preview what providers Firecrawl finds for a client, without creating a row:
```bash
python3 .claude/skills/yuno-bc/research.py "Rappi"
```
Requires `FIRECRAWL_API_KEY` in env or `.env.local`. Useful for debugging / sanity-checking research output.
