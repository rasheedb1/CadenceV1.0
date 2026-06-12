---
name: yuno-one-click
description: Generate a per-merchant product deck for Yuno One-Click checkout (the shared-token network across all Yuno merchants — Rappi tokens reusable in McDonald's, Coppel in Avianca, etc.). POSTs to the yuno-one-click-generate edge function, which runs SimilarWeb traffic intel + chief-deep-research-company (industry + avg_ticket + country) and computes per-merchant TPV impact + projected Network Recognition Rate (NRR). Persists to `presentations` with kind='yuno_one_click'. Returns a public URL at chief.yuno.tools/one-click/<slug>. Use when the user types /yuno-one-click or asks to generate a one-click checkout deck for a named merchant. Spanish default, audience = merchant prospect CXO.
---

# Yuno One-Click Deck Generator

Genera un deck dinámico per-merchant explicando el producto Yuno One-Click — el wallet shopper-centric donde un cliente que guarda su tarjeta en Rappi puede pagar en McDonald's, Coppel o Avianca con un solo tap. La presentación es para **merchant prospects externos** (CXO retail / payments / product).

Sirve el deck en `https://chief.yuno.tools/one-click/<slug>` por 90 días. **Default en español** con formato USD. Audiencia: ejecutivos del lado merchant que evalúan activar Yuno One-Click en su checkout.

**Distinto de:** `/yuno-bc` (BC comercial per-client), `/sdr-bc` (prospecting con math regional), `/ss-deck` (deck visual co-branded), `/yuno-workshops-bc` (workshop BC). Este es el **deck de producto** específico de One-Click, con narrativa de red compartida y posicionamiento afirmativo (sin mencionar competidores).

## Trigger

- `/yuno-one-click` (sin args — pregunta merchant + website)
- `/yuno-one-click <Merchant>` (pregunta website)
- `/yuno-one-click <Merchant> <website>` (procede directo)
- "genera un deck de one-click para <merchant>"
- "armá un yuno one-click para <merchant>"

## Flow

### 1. Gather inputs

El endpoint auto-resuelve casi todo (industry, avg ticket, país principal vía SimilarWeb top-country). El skill solo necesita:

- **Merchant name** (preservar casing: Coppel queda Coppel)
- **Website** (ej. `coppel.com`, `https://www.rappi.com`). Requerido — SimilarWeb lo necesita.

Opcionales (rara vez):
- `country_override` (ISO-2 ej. `MX`, `BR`) — bypassa SimilarWeb top-country, útil si el merchant opera en un solo país pero el dominio es global
- `industry_override` (1 de 37 categorías de `_shared/industries.ts`)

Si falta merchant o website, preguntar:

> Para generar el deck de Yuno One-Click necesito:
> 1) Nombre del merchant (exacto, casing original)
> 2) Website principal (ej. coppel.com)
>
> Opcionales:
> 3) País principal (ISO-2 ej. MX) si el dominio es global
> 4) Industry override (si el research lo clasifica mal)

Esperar respuesta antes de continuar.

### 2. Identify the AE

Mismo modelo que `/sdr-bc`: toma `userEmail` del contexto y pásalo como `createdByEmail`. El endpoint resuelve `user_id + org_id` desde `ae_integrations` (provider=gmail). Si el AE no tiene Gmail conectado, el endpoint retorna error claro.

### 3. POST to yuno-one-click-generate

```bash
curl -sX POST \
  "https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/yuno-one-click-generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFydXBlcWN6cnhtZmtjYmp3eWFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTE2ODMsImV4cCI6MjA4NTM4NzY4M30.gC3dki2lgl2mvqZqwhXW3oA_ZumVdXhaXuLb5HLehS8" \
  -H "X-Agent-Token: $(grep PRESENTATIONS_AGENT_TOKEN /Users/rasheedbayter/Documents/Laiky\ AI/.env.local | cut -d= -f2-)" \
  -d '{
    "createdByEmail": "<USER_EMAIL_FROM_CONVERSATION_CONTEXT>",
    "clientName": "<Merchant>",
    "website": "<merchant.com>"
  }'
```

Optional flags:
- `country_override: "MX"` — ISO-2 país principal si SimilarWeb top-country no aplica
- `industry_override: "<one of 37 categories>"` — validado contra `_shared/industries.ts`
- `avg_ticket_override_usd: 35.50` — solo si retorna `reason: avg_ticket_unknown`
- `force_refresh: true` — bypass cache 30d del deep-research

### 4. Handle responses

**Success:**
```json
{
  "id": "uuid",
  "slug": "coppel-a8f3c2",
  "url": "https://chief.yuno.tools/one-click/coppel-a8f3c2",
  "expiresAt": "...",
  "industry": "Retail (Pets, Electronics)",
  "industry_take_rate_pct": 30,
  "avg_ticket_usd": 75,
  "avg_ticket_confidence": "med",
  "country_iso": "MX",
  "monthly_visits": 12500000,
  "projected_nrr_pct_m3": 25,
  "projected_nrr_pct_m12": 40,
  "annual_uplift_usd_m": 12.4,
  "warnings": {}
}
```

Report to user:
```
✓ Deck Yuno One-Click generado
→ https://chief.yuno.tools/one-click/<slug>

Snapshot:
  Merchant:         <Merchant>
  Industria:        <industry> (take rate <take_rate_pct>%)
  País principal:   <country_iso>
  Ticket promedio:  $<avg_ticket_usd> (confianza: <high|med|low>)
  Visits/mes:       <monthly_visits>
  NRR proyectado:   <m3>% mes 3 → <m12>% mes 12
  Uplift anual est: $<annual_uplift_usd_m>M
  Warnings:         <if any>
  Vigente hasta:    <expires_at>
```

**Error responses:**

- `reason: avg_ticket_unknown` (422):
  > No se encontró un ticket promedio confiable para <merchant>. Provee una estimación manual (USD por transacción) y reintentamos con `avg_ticket_override_usd`.

- `reason: similarweb_unavailable` (422):
  > SimilarWeb no tiene tráfico para <domain>. El deck necesita monthly_visits para el math de NRR. Prueba otro dominio o pasa `country_override` + `manual_traffic`.

- `reason: invalid_industry_override` (400): industry_override no está en el catálogo de 37. Lista válidos en la respuesta.

- `No Gmail integration found ...` (400):
  > Conectá tu Gmail en Chief antes de generar el deck.

## Math de referencia (para explicar números si el merchant pregunta)

Variables:
- `MV` = monthly visits (SimilarWeb)
- `CONV` = 0.07 (conversion rate baseline)
- `AT` = avg ticket USD (research + industry default)
- `TR` = industry take rate %

Cálculo:
- **TPV anual del merchant** = `MV × 12 × CONV × AT` (USD)
- **NRR proyectado** (conservador, no contractual):
  - Mes 3: `25%` (base anchor merchants Yuno)
  - Mes 12: `40%` (post network maturation)
- **Conversion uplift en network shoppers** = `+15%` (mid-point del rango +10-30% documentado en wallets shopper-centric)
- **Auth rate uplift** (network tokens) = `+3 pp` (mid-point +2-5 pp documentado)
- **Uplift anual estimado** = `TPV × NRR_m12 × (conv_uplift + auth_uplift_pct_of_tpv)`
- **Revenue uplift Yuno** = `uplift_anual × TR / 100`

Los porcentajes son benchmarks de mercado para wallets shopper-centric; NRR es proyección basada en cohort de 12 anchor merchants Yuno (Rappi, McDonald's, Avianca, Coppel, Smartfit, Uber, Viva, inDrive, Open English, Reserva, Livelo, SpaceX). **No es promesa contractual** — el deck incluye footnote.

## Validation rules (skill-side)

- `clientName`: no vacío, preservar casing
- `website`: dominio (con o sin scheme). Endpoint normaliza
- `avg_ticket_override_usd`: número positivo USD/tx
- `country_override`: ISO-2 mayúsculas (MX, BR, CO, CL, AR, PE, EC)

## Common mistakes to avoid

- ❌ **No mencionar competidores** en el deck — Deuna, Stripe Link, Bolt, Mercado Pago, etc. son SOLO research interno. El deck es posicionamiento afirmativo de Yuno.
- ❌ **No bloquear por idioma** — default es español. Solo cambia si user explícitamente pide en/pt.
- ❌ **No fabricar el ticket promedio** si retorna `avg_ticket_unknown` — pedir override al user.
- ❌ **No lowercasear el merchant name** — casing preservado end-to-end.
- ❌ **No pasar `force_refresh: true` por default** — solo si user pide "regenera fresh" / "skipea el cache".
- ❌ **No generar archivos HTML locales** — el endpoint persiste en Supabase y expone URL pública.

## Difference vs other Yuno deck skills

| | /yuno-bc | /sdr-bc | /ss-deck | /yuno-one-click |
|---|---|---|---|---|
| Audience | Client comercial | Cold SDR | Sales pitch | **Merchant CXO prospect** |
| Foco | BC comercial per-client | Regional opportunity | Visual storytelling | **Producto One-Click** |
| Math | TPV/MDR/AR client | Per-region cards | Acquirers map | **Per-merchant NRR + uplift** |
| Language default | es (asks) | en | en | **es** |
| Deck path | /bc/<slug> | /sdr-bc/<slug> | /m/<slug> | **/one-click/<slug>** |
| `presentations.kind` | yuno_bc | sdr_bc | merchants_ss table | **yuno_one_click** |
| Competidores mencionados | No | No | No | **NUNCA** (regla estricta) |
