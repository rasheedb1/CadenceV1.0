# Workshops BC · Palanca 04 → operaciones (dev + reconciliación)

Reemplaza la slide 19 actual (`SlideLeverMonitors` · "cuando un proveedor cae…") por una nueva **Palanca 04 · operaciones** que cuantifica:

1. Ahorro de **dev cost** por 6 integraciones nuevas (one-time)
2. Tiempo de engineering reasignado (meses-persona)
3. Ahorro de **conciliación** por archivo único de liquidación (anual recurrente)

Para Coppel: replazar BBVA + Evo como adquirentes independientes (cada uno con su archivo de liquidación) por la única fuente de liquidación de Yuno → ~$10,000/mes de ahorro operacional.

## Math (defaults para Coppel; todos overrideables vía INPUTS)

**Dev cost per integration (LATAM benchmark de yuno-bdm-ppt-pricing):**

| Equipo | $/mes |
|---|---|
| Engineering | $6,300 |
| Banking & Payments | $1,575 |
| Product | $1,350 |
| Fraud/Risk | $1,350 |
| Compliance | $900 |
| Treasury | $810 |
| Finance | $675 |
| **Total** | **$12,960/mes** |

- Por integración (3 meses de esfuerzo): **$38,880**
- 6 integraciones × $38,880 = **$233,280** (dev cost one-time evitado)
- 6 × 3 meses = **18 meses-persona** de engineering reasignados a core

**Reconciliación:**
- $10,000/mes × 12 = **$120,000/año** (recurrente)

**Total Year-1 operacional:** $353,280

## Cambios

### 1. `supabase/functions/workshops-bc-generate/index.ts`

Agregar inputs opcionales (defaults Coppel):
- `integrations_planned` (default 6)
- `reconciliation_savings_monthly_usd` (default 10000)
- `dev_cost_monthly_usd` (default 12960)
- `dev_months_per_integration` (default 3)
- `acquirers_consolidated` (default `['BBVA','EVO']`)

Agregar al `BusinessCase`:
- `dev_cost_per_integration_usd`
- `dev_cost_savings_one_time_usd`
- `engineering_months_saved`
- `reconciliation_savings_annual_usd`
- `operational_savings_year1_usd` (= dev one-time + recon × 12)

Sumar `operational_savings_year1_usd` a `direct_savings_annual_usd` y `total_annual_value_usd` (user pidió "si anual").

### 2. `src/workshops-bc/components/slides/SlideLeverMonitors.jsx`

Reemplazo TOTAL — mismo filename. Light theme. Layout estilo Antifraud:
- Title: "menos integraciones, **menos conciliaciones.**"
- Lead: explica que 6 nuevas integraciones via Yuno = 1 sola integración + 1 archivo de liquidación
- Card izquierda (lilac): tabla de 7 equipos + total /mo + por integración + total 6 integraciones
- Card derecha (negra): dos números apilados — dev one-time ($233K) + reconciliación anual ($120K) — con subtítulos

### 3. `src/workshops-bc/components/WorkshopViewer.jsx` + `PrintViewer.jsx`

- `bg: 'dark'` → `'light'` para slide 19
- `label: 'Palanca 04 monitors'` → `'Palanca 04 operaciones'`

### 4. `src/workshops-bc/components/slides/SlideLeversOverview.jsx`

Card #4: "monitors + AI / 5–10 min → < 1 s / real-time" →
"operaciones / 6 integraciones / +$353K" (con dev one-time + recon anual)

### 5. `src/workshops-bc/components/slides/SlideAnnualImpact.jsx`

Fila 4 "Monitors + AI" cualitativa → "Operaciones · dev + conciliación" cuantitativa con `operational_savings_year1_usd`. El total ya recoge el cambio porque viene de `total_annual_value_usd`.

## Out of scope (esta tarea)

- SlideToolkit / SlideYunoNumbers siguen listando Monitors como capability del producto (Monitors sigue existiendo en el stack — solo no es la palanca destacada para Coppel).
- SlideAgenda menciona "slides 12 — 19" — el rango sigue siendo el mismo, no cambia.

## Verificación (post-build)

- `npm run build` sin errores
- Slide 19 muestra los nuevos números correctamente
- Slide 24 (AnnualImpact) suma reconciliación + dev al total
- Slide 15 (LeversOverview) muestra "operaciones" como palanca 4
- Edge function: post con inputs mínimos sigue funcionando (defaults aplicados)
