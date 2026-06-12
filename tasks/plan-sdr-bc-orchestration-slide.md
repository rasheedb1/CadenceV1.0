# Plan: SDR BC — Orchestration "Stack Actual" Slide (port from workshop slide 14)

> Fecha: 2026-05-18 · Owner: rasheed@y.uno
> Status: **IN PROGRESS** — defaults decididos, ejecutando

## Objetivo

Portar la slide 14 del Workshop BC (`Hoy {client} opera punto-a-punto. Con Yuno, todo se orquesta en una sola capa.`) al SDR BC como nueva slide entre la 5 (Geography) y la 6 (Why Yuno section), respetando que el SDR BC no tiene inputs del AE (solo research).

## Posición y numeración

- Nueva slide se inserta como **slide 6** en el deck (entre Geography y Why Yuno divider)
- Total slides pasa de 27 → 28
- Page counter "X / 27" en cover Slide01 actualiza a "X / 28"
- Slides posteriores corren +1 (Why Yuno → 7, Yuno Overview → 8, Trust → 9, BC Section → 10, Levers → 11, ...) — el bookkeeping ya está parametrizado por `pageNum` en cada componente, así que el incremento es automático en slideBuilders

## Decisiones (defaults)

| Decisión | Default | Justificación |
|---|---|---|
| Antifraud LADO IZQUIERDO | **Solo si research detecta vendor explícito** | User lo pidió: "no es necesario... a menos de que encuentres algo en el research donde mencionen explícitamente que el cliente X tiene contrato o interacción con cybersource, riskified" |
| Antifraud LADO DERECHO | **1 card siempre** | User dijo "y un antifraude" |
| Current PSPs | Max 2 desde `intel.payment_stack.psps_detected` | User dijo "pongamos solo 2 máximo como current" |
| Proposed PSPs | Current + 3 desde `REGIONAL_STACK_CATALOG[top_region].acquirers` | Por la imagen — current se mantiene como "integrado", agregamos "nuevo · vía Yuno" |
| Metric ribbon (tx/mes + AR%) | **Mostrar con marca "(est.)"** | Da credibilidad al diagrama; SDR BC tiene la data aproximada (SimilarWeb × conversion + base AR weighted) |
| Animaciones SVG del workshop | **NO** | Simpler version inline — el SDR BC es Babel-in-browser JSX, no React build pipeline |

## Detección de antifraude explícito

Lista hardcoded de vendors:
```
ANTIFRAUD_VENDORS = [
  'cybersource', 'riskified', 'forter', 'signifyd', 'kount', 'sift',
  'clearsale', 'aci', 'adyen risk', 'stripe radar', 'arkose', 'incognia',
  'minfraud', 'fraudlabs',
]
```

Búsqueda:
1. Scan `intel.payment_stack.psps_detected[].name` (case-insensitive, substring match)
2. Scan `intel.payment_stack.gateway_evidence[].description` (case-insensitive, substring match)
3. Si match → `current_antifraud = "<vendor canonical name>"`
4. Si no → `current_antifraud = null` (left side NO renderiza la card de antifraud)

Lado derecho:
- Si `current_antifraud` existe → usar ese (continuidad: cliente ya tiene esa relación)
- Si no → default a `"Riskified"` (vendor conocido en LATAM)

## Tokens nuevos en `defaults`

```ts
{
  orchestration_client_tx_per_month: "~3.4M",        // string formatted
  orchestration_client_ar_pct: "82",                 // string %
  orchestration_current_psps: ["BBVA", "EVO"],       // max 2
  orchestration_current_antifraud: "Cybersource",    // string|null
  orchestration_proposed_antifraud: "Cybersource",   // string (siempre)
  orchestration_proposed_psps: [                     // current + 3 nuevos, dedup
    { name: "BBVA", role: "integrado" },
    { name: "EVO", role: "integrado" },
    { name: "Cielo", role: "nuevo" },
    { name: "Stone", role: "nuevo" },
    { name: "PayU", role: "nuevo" },
  ],
}
```

## Implementación

### Backend (`supabase/functions/sdr-bc-generate/index.ts`)

- Nueva const `ANTIFRAUD_VENDORS`
- Nueva función `detectCurrentAntifraud(intel: IntelligenceShape): string | null`
- Nueva función `buildOrchestrationData(intel, stackSplit, topRegion, avgMonthlyVisits, topCountries)` que retorna los 5 tokens
- En el handler, después de `computeRegionalCards`: `Object.assign(deckData, buildOrchestrationData(...))`

### Frontend (`public/sdr-bc-assets/slides-01-context.jsx`)

- Nueva función `Slide05bOrchestration({ data })` con layout:
  - Section header: "Caso · stack actual"
  - Title: "Hoy {clientName} opera punto-a-punto. Con Yuno, todo se orquesta en una sola capa." (split en head + accent + tail)
  - Two-column grid (50/50):
    - **LEFT (sin Yuno · hoy)**: client node → [antifraud node si existe] → 2 acquirer cards horizontalmente
    - **RIGHT (con Yuno · target)**: client node → Yuno orchestration bar → antifraud node → 5 acquirer cards horizontalmente (current como "INTEGRADO", proposed como "NUEVO · VÍA YUNO")
  - Footnotes bottom-left ("HOY · 2 PSPs · sin ruteo · ~X% MDR") y bottom-right ("CON YUNO · 5+ PSPs · smart routing · 1 API · X tx/año")
  - Conectores: simple CSS borders / lines (no SVG)
  - Page counter: "06 / 28"

### Slide builders (`supabase/functions/sdr-bc-render/index.ts`)

- Insertar `(d) => <Slide05bOrchestration data={d} />` entre `Slide05Geography` y `Slide06WhyYunoSection`
- `JSX_VER` bump

### i18n (`public/sdr-bc-assets/sdr-bc-i18n.js`)

Nuevas claves bajo `sOrch`:
- `mono_kicker`: "caso · stack actual"
- `title_head`: "Hoy ${clientName} opera punto-a-punto."
- `title_accent`: "Con Yuno, todo se orquesta en una sola capa."
- `title_tail`: ""
- `left_header`: "SIN YUNO · HOY"
- `right_header`: "CON YUNO · TARGET"
- `client_tx_label`: "${tx} tx/mes · ${ar}% AR (est.)"
- `role_antifraud`: "antifraude"
- `role_primary`: "PRIMARIO"
- `role_secondary`: "SECUNDARIO"
- `role_integrated`: "INTEGRADO"
- `role_new`: "NUEVO · VÍA YUNO"
- `left_footnote`: "HOY · ${n} PSPs · sin ruteo · sin orquestación"
- `right_footnote`: "CON YUNO · ${n}+ PSPs · smart routing · 1 API"
- `yuno_orchestration_label`: "yuno orchestration"
- `yuno_capabilities`: ["Smart Routing", "Vault", "Reconciliation", "Fraud", "Payouts"] (no traducidos, son product names)

## Smoke test

1. ASOS — debería detectar Worldpay/Adyen como current, no detectar antifraude (no aparece en research), proponer current + 3 regionales para EMEA
2. Crocs — verificar US-only top, fallback con regional catalog para US

## Out of scope

- Animaciones SVG / payment packet motion (workshop tiene; SDR BC keep it simple)
- Slide adapta por país (mostraríamos LATAM por defecto si top region es LATAM; otros mercados podríamos hacer en iteración futura)
- Edit override en el wizard Step 2 para PSPs current — no incluido en esta iteración
