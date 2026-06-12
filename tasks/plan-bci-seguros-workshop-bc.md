# Plan — Adaptar Workshop BC para BCI Seguros (Chile)

**Fecha:** 2026-06-08
**Slug existente:** `bci-seguros-cde7nt` (se regenera al final)
**Feedback del user:** quitar antifraude+gateway del BC, ajustar 6 slides, usar pricing tiers reales de Yuno LATAM, equipo solo Rasheed.

## Estrategia

3 capas de cambios:

1. **Engine math** — extender para soportar débito MDR como **%** (no solo $/tx)
2. **Slides JSX** — quitar fallback hardcoded, hacer condicional antifraud, allow 1-person team, etc.
3. **Inputs payload** — pricing tiers, verticals, antifraud=0, etc.

## Cambios — Engine (`supabase/functions/_shared/workshops-bc-math.ts`)

- [ ] **Agregar `current_debit_mdr_pct` / `target_debit_mdr_pct`** (% sobre TPV débito)
  - Mantiene `*_debit_mdr_per_tx` para compat con Coppel
  - Si `debit_mdr_pct` está set → `mdrDebitSavings = tpvDebitNew × (current - target) / 100`
  - Si solo `per_tx` está set → cálculo legacy

- [ ] **(Opcional) Default `current_antifraud_per_attempt` a `undefined`** en lugar de 0 — para distinguir "sin antifraude" vs "antifraude $0"

## Cambios — Slides JSX

### Slide 13 — `SlideStack.jsx`
- [ ] **LEFT tree (sin Yuno):** si `current_antifraud` es null/empty, NO renderizar el nodo Cybersource (línea 410: `const antifraud = inputs.current_antifraud || 'Cybersource'` → cambiar a explícito + esquivar render)
- [ ] Re-rutear wires del LEFT tree: BCI → directo a los 2 acquirers (sin nodo intermedio)
- [ ] RIGHT tree (con Yuno): keep as-is con Cybersource+Riskified como upsell

### Slide 15 — `SlideLeversOverview.jsx`
- [ ] Ya soporta cards condicionales de débito (`hasDebit`) y gateway (`hasGateway`)
- [ ] **Agregar `hasAntifraud` check** y hide antifraud card cuando `afNow === 0 && afNew === 0`
- [ ] Cuando `debit_mdr_pct` set → renderizar débito card con `fmtPct(debitMdrNowPct, 2)` en lugar de `${cs}${debitMdrNow.toFixed(2)}`

### Slide 18 — `SlideLeverAntifraud.jsx`
- [ ] WorkshopViewer: filtrar `SlideLeverAntifraud` del array `SLIDES` cuando antifraud no aplica
- [ ] Igual: filtrar `SlideLeverGateway` si existiera

### Slide 19 — `SlideLeverMonitors.jsx`
- [ ] Ya usa `inputs.integrations_planned` que default 6 → ✅ funciona
- [ ] BCI deck: pasar `integrations_planned: 6` explícito (aunque sea default)

### Slide 21 — `SlidePerVerticalResult.jsx`
- [ ] **Root cause:** requiere `inputs.verticals[]` para renderizar. Vacío = $0.
- [ ] Fix: pasar `inputs.verticals: [{ id: 'seguros', name: 'Seguros', monthly_tx: 130000, avg_ticket: 60, credit_mix_pct: 85 }]`
- [ ] Con 1 vertical: render 2 columnas (Seguros + TOTAL)

### Slide 22 — `SlideYunoCost.jsx`
- [ ] **Quitar default MXN hardcoded en SaaS card** (línea 162: `.replace('{curr}', 'MXN')`) → usar `currency` real
- [ ] **TIER_DISCOUNT_PCT** (10% hardcoded): convertir a input opcional `inputs.yuno_tier_discount_pct`, default 0
- [ ] **MIN_TX_RAMP** (escalera Coppel): convertir a opcional `inputs.yuno_min_tx_ramp_enabled`, default false → para BCI mostrar flat 100K
- [ ] **"Crédito 100% hasta 30/ago/2026" banner promo** (líneas 401-443): convertir a opcional `inputs.yuno_promo_banner`, hide si no aplica
- [ ] BCI tiers pasan via `inputs.yuno_pricing_tiers`:
  ```
  [
    { limit_tx: 50000,   rate_local: 0.10  },
    { limit_tx: 100000,  rate_local: 0.09  },
    { limit_tx: 150000,  rate_local: 0.085 },
    { limit_tx: 300000,  rate_local: 0.075 },
    { limit_tx: 500000,  rate_local: 0.065 },
    { limit_tx: Infinity, rate_local: 0.05 },
  ]
  ```

**⚠️ Pendiente confirmar "los créditos sean 'se conversará de forma conjunta'":**
Opción A: la columna "list rate tachado" (strikethrough) — quitar y dejar solo applied rate
Opción B: el banner "Crédito 100% hasta..." → reemplazar texto
Opción C: el badge "−10% en todos los tiers" → reemplazar con "se conversará"

→ **Mi interpretación: B + C** (quitar promo banner y el badge de descuento porque BCI no negoció esos términos aún)

### Slide 23 — `SlideYunoExtras.jsx`
- [ ] **Reconciliation = 0** → hide la card de conciliación (líneas 42-50 + render block)
- [ ] Soportar `inputs.yuno_reconciliation_monthly_local: 0` → skip render
- [ ] 3DS card queda como única extra

### Slide 31 — `SlideTeam.jsx`
- [ ] Cambiar `yunoTeam.length >= 2` → `yunoTeam.length >= 1` (línea 80)
- [ ] Grid: si 1 persona → 1-col centered (max-width 600px). Si 2 → grid 2-col actual.
- [ ] Pasar attendees: `[{ name: 'Rasheed Bayter', role: 'Director Comercial LATAM', email: 'rasheed@y.uno', side: 'yuno' }]`

## Cambios — Payload (regenerate BCI slug)

```json
{
  "client_name": "BCI Seguros",
  "country": "CL",
  "language": "es",
  "currency": "USD",
  "workshop_date": "Junio 2026",
  "inputs": {
    "monthly_transactions": 130000,
    "avg_ticket_usd": 60,
    "current_approval_rate_pct": 86.0,
    "target_approval_rate_pct": 86.86,
    "current_credit_mdr_pct": 1.70,
    "target_credit_mdr_pct": 1.46,
    "current_debit_mdr_pct": 1.36,
    "target_debit_mdr_pct": 0.76,
    "current_antifraud_per_attempt": 0,
    "target_antifraud_per_attempt": 0,
    "current_gateway_per_attempt": 0,
    "target_gateway_per_attempt": 0,
    "take_rate_pct": 25,
    "current_acquirers": ["Klap", "Transbank"],
    "current_antifraud": null,
    "integrations_planned": 6,
    "reconciliation_savings_monthly_usd": 0,
    "yuno_saas_monthly_usd": 5000,
    "yuno_min_tx_monthly": 100000,
    "usd_to_local_fx": 1,
    "yuno_pricing_tiers": [
      { "limit_tx": 50000,  "rate_local": 0.10  },
      { "limit_tx": 100000, "rate_local": 0.09  },
      { "limit_tx": 150000, "rate_local": 0.085 },
      { "limit_tx": 300000, "rate_local": 0.075 },
      { "limit_tx": 500000, "rate_local": 0.065 },
      { "limit_tx": 99999999, "rate_local": 0.05 }
    ],
    "verticals": [
      { "id": "seguros", "name": "Seguros", "monthly_tx": 130000, "avg_ticket": 60, "credit_mix_pct": 85 }
    ]
  },
  "attendees": [
    { "name": "Juan Pablo Ortiz", "role": "Head of Payments", "side": "client" },
    { "name": "Valeria Paz", "role": "Equipo Pagos", "side": "client" },
    { "name": "Rasheed Bayter", "role": "Director Comercial LATAM", "email": "rasheed@y.uno", "side": "yuno" }
  ]
}
```

## Math esperado con los nuevos inputs

- TPV anual: $93.6M USD
- TPV crédito (85%): $79.56M → MDR savings = `79.56M × (1.70 − 1.46) / 100 = $190.9K`
- TPV débito (15%): $14.04M → MDR savings = `14.04M × (1.36 − 0.76) / 100 = $84.2K`
- MDR total: ~$275K (igual al anterior, blended)
- Smart Routing: $234K (sin cambio)
- Dev one-time: 6 × $38,880 = $233.3K (sin cambio)
- Conciliación: $0 (removido)
- Antifraude: $0 (removido)
- **Total Year 1: $742K USD** (vs $865K anterior — bajan los $120K de recon)

## Costo Yuno con nuevos tiers (130K tx/mes)

- Tier 1 (0–50K): 50,000 × $0.10 = $5,000
- Tier 2 (50K–100K): 50,000 × $0.09 = $4,500
- Tier 3 (100K–150K): 30,000 × $0.085 = $2,550
- **Per-tx mensual: $12,050 → anual $144,600**
- SaaS: $5K × 12 = $60K
- **Costo Yuno anual: $204.6K**

## ROI esperado

`$742K / $204.6K = 3.6x` (vs 0.31x anterior — ahora positivo)

## Deploy

- [ ] Deploy edge function: `supabase functions deploy workshops-bc-generate`
- [ ] Push frontend: `git push origin main` (Railway auto)
- [ ] Regenerate slug via curl → verificar URL

## Pendientes de confirmar antes de empezar

1. ¿Interpretación correcta de "los créditos sean 'se conversará de forma conjunta'"? → Opción B+C (quitar promo banner + badge de descuento)
2. ¿OK con tratar debito como % en lugar de $/tx? (necesita engine extension)
3. ¿Quitar SlideLeverAntifraud (slide 18) entero del BCI deck, o dejarlo como educacional con $0?
