# BCI Seguros workshop — slide 17 (MDR débito), slide 21 (min flat 100K), quitar slide 22

**Fecha:** 2026-06-10 · **Slug:** `bci-seguros-249fwn` (update in-place, URL no cambia)

## Round 4 (mismo día) — logo BCI Seguros en cover · COMPLETADO

- [x] SVG oficial de bciseguros.cl (fondo ya transparente, mariposa 4 colores + wordmark) → `public/workshop-assets/bci-seguros-logo.svg`
- [x] Variante texto blanco para fondos oscuros (cover gradient + section dividers): `bci-seguros-logo-white.svg` (9 fills black→#FFFFFF, mariposa intacta)
- [x] Deploy del asset ANTES del update de DB (patrón map-pins) · `client_logo: /workshop-assets/bci-seguros-logo-white.svg` vía workshops-bc-update
- [x] Verificado visualmente: PDF pág 1 rasterizada (sips + PIL crop) — co-brand "yuno × Bci Seguros" limpio, BC intacto (ROI 4.8)

## Round 3 (mismo día) — approval +1.5pp, recon $5K/mes, sin slide 20, slide 14 mono-vertical
### COMPLETADO (commits `912bb0a` + `7e9824d`) — verificado en PDF live (28 slides + blank)

1. [x] **Approval 86% → 87.5%** (+1.5pp): slide 16 "De 86.0% a 87.5%", overview "+1.5pp", recap "+$408K · +27,209 tx" ✓
2. [x] **Slide 18: conciliación $5K/mes** — card "$60K · $5,000/mes", total año 1 **$293K**, fórmula `6 × $38,880 + $5,000 × 12` ✓; el recap volvió a mostrar el término recon automáticamente (condicional del round 2) ✓
3. [x] **Slide 20 (por vertical) eliminada** — filtro `verticals.length > 1` en viewer + PDF; pág 21 ahora es Sección AI ✓
4. [x] **Slide 14 mono-vertical** — sin card duplicada; strip: 130K tx/mes · $60 ticket · $93.6M TPV · $1.5M MDR; banner costo total $1.5M ✓
5. [x] **Fixes de paso:** key rota `leverRouting.titleConnector` (slide 16 imprimía el path literal) + **AF fantasma en slide 14**: `|| 0.80` con af=0 explícito fabricaba ~$1.5M/año de antifraude y el banner decía $3M en vez de $1.5M (bug preexistente, mismo patrón explicit-0 del recon)

**Math verificado (response del update = cálculo manual exacto):**
- Routing: +27,209.30 tx → **$408,139.53** · MDR: $194,274.42 crédito + $85,709.30 débito = **$279,983.72**
- Ops: dev $233,280 + recon $60,000 = **$293,280**
- Total Y1 **$981,403.25** · Yuno cost $204,600 · Net **$776,803.25** · ROI **4.8x**

## Diagnóstico

Engine math ✓ verificado a mano — todos los números del BC en DB son correctos:

| Concepto | Valor | Check |
|---|---|---|
| Aprobación 86% → 86.86% · +15,600 tx | +$936K TPV × 25% take | **$234,000** ✓ |
| MDR crédito 1.70% → 1.46% (TPV crédito nuevo $80.36M) | × 0.24pp | **$192,853.44** ✓ |
| MDR débito 1.36% → 0.76% (TPV débito nuevo $14.18M) | × 0.60pp | **$85,082.40** ✓ |
| **MDR total (suma crédito + débito)** | | **$277,935.84** ✓ |
| Ops: dev 6 integraciones × $38,880 (recon $0) | | **$233,280** ✓ |
| Total Year 1 | | **$745,215.84** ✓ |
| Costo Yuno: SaaS $60K + per-tx $144.6K ($12,050/mes) | | **$204,600** ✓ |
| Net benefit / ROI | | **$540,615.84 / 3.64x** ✓ |

Los problemas son de **capa de presentación**:

1. **Slide 17 (LeverMDR):** solo detecta débito vía `current_debit_mdr_per_tx` (modo Coppel $/tx). BCI usa `current_debit_mdr_pct` (1.36% → 0.76%) → la card de débito NO se renderiza y el título solo menciona crédito. El total card sí muestra la suma ($277.9K) pero sin el desglose visible.
2. **Slide 19 (Recap):** la fórmula de palanca 02 cae al branch "blended" → muestra `TPV × (1.70% − 1.46%)` que da $224.6K, inconsistente con el value $277.9K mostrado arriba.
3. **Slide 21 (YunoCost):** los flags `yuno_min_tx_ramp_enabled` / `yuno_tier_discount_pct` / `yuno_credit_promo_enabled` **se descartan en `validateInputs`** (no están en `BCInputs`) → el slug los perdió al generarse. Resultado actual: ramp escalonado Coppel 150K→1.1M, badge/strikethrough −10% que **infla el ROI en la slide** (muestra ~$555K net / 3.9x con rates descontados vs $540.6K / 3.64x reales), y banner promo "crédito 100%" de Coppel.
4. **Slide 22 (YunoExtras 3DS + concil.):** quitar del deck BCI.
5. **PDF (PrintViewer):** no replica el filtro de antifraude (bug existente) → el PDF muestra la slide de antifraude que el viewer oculta.

## Tareas

### A. Engine — `supabase/functions/_shared/workshops-bc-math.ts` (root cause)
- [ ] `BCInputs` + `validateInputs`: pass-through de flags de presentación: `yuno_tier_discount_pct` (num), `yuno_min_tx_ramp_enabled` (bool), `yuno_credit_promo_enabled` (bool), `yuno_credit_offer_title`/`yuno_credit_offer_body` (str), `yuno_extras_enabled` (bool). No afectan el cálculo — solo deben sobrevivir el persist.

### B. Slide 17 — `SlideLeverMDR.jsx` (pedido 1)
- [ ] Detectar pct-mode: `current_debit_mdr_pct > 0` (mismo patrón que SlideLeversOverview)
- [ ] Título: línea crédito `1.70% → 1.46%` + línea débito `1.36% → 0.76%` (en %, no $/tx)
- [ ] MethodCard débito: rates en %, fórmula `TPVdébito × (1.36% − 0.76%)`, savings $85.1K
- [ ] Total card: ya muestra la suma $277.9K ✓ (queda como cierre crédito + débito)

### C. Slide 19 — `SlideBusinessCaseRecap.jsx` (pedido 1: "todos los lugares")
- [ ] Palanca 02 en pct-mode: delta `1.70% · 1.36%` → `1.46% · 0.76%` y fórmula con breakdown crédito + débito (= $192.9K + $85.1K), no el blended incorrecto
- [ ] Revisar caption MDR de `SlideVolumes.jsx` (template `{debit}` usa per-tx $0.00 para BCI — mostrar % o adaptar)
- [ ] LeversOverview ✓ ya soporta pct (fa2bb19) · PerVertical ✓ usa mdr_savings suma — solo verificar render

### D. Slide 21 — `SlideYunoCost.jsx` (pedido 3)
- [ ] Badge "−10% en todos los tiers" condicional a `tierDiscountPct > 0` (hoy se muestra siempre)
- [ ] Con flags en data: mínimo único **100,000 tx/mes** (UI flat ya existe), tabla con rates BCI tal cual ($12,050/mes — igual al engine), sin banner promo Coppel

### E. Slide 22 — quitar (pedido 2)
- [ ] `WorkshopViewer.jsx`: filtrar `SlideYunoExtras` cuando `inputs.yuno_extras_enabled === false`
- [ ] `PrintViewer.jsx`: replicar AMBOS filtros (antifraude + extras) para que el PDF coincida con el viewer

### F. Data — slug `bci-seguros-249fwn`
- [ ] POST `workshops-bc-update` con: `yuno_min_tx_ramp_enabled: false`, `yuno_tier_discount_pct: 0`, `yuno_credit_promo_enabled: false`, `yuno_extras_enabled: false`
- [ ] Verificar BC recomputado idéntico (total $745,215.84 / ROI 3.64)

### G. Deploy + verify
- [ ] Deploy edge fns `workshops-bc-update` + `workshops-bc-generate` (comparten _shared)
- [ ] `git push origin main` (Railway auto)
- [ ] Browser: slide 17 con débito + suma, slide 21 flat 100K sin descuento, slide 22 ausente, conteo de slides correcto, PDF consistente

## Review — COMPLETADO 2026-06-10 (commits `949c56b` + `07d5290`)

Todo deployado y verificado end-to-end contra el PDF live (`bridge.yuno.tools/api/workshop/bci-seguros-249fwn/pdf`, 29 slides + 1 blank de Puppeteer):

**Pedido 1 — slide 17 MDR crédito + débito + suma:**
- Título: "Crédito 1.70% → 1.46% · débito 1.36% → 0.76%" ✓
- Card crédito $193K + card débito $85K (con fórmulas TPV × Δ%) + total **$278K** ✓
- Recap (slide 19): "TPVcrédito × ΔMDR% + TPVdébito × ΔMDR% = $193K crédito + $85K débito" ✓
- PerVertical, LeversOverview, Volumes: todos pct-aware, suma consistente en todos lados ✓

**Pedido 2 — slide 22 (3DS + conciliación) eliminada:** viewer y PDF (29 slides; pág 22 ahora es Sección AI) ✓. De paso el PDF ahora también filtra la slide de antifraude (bug preexistente).

**Pedido 3 — slide 21 mínimo flat 100K:** "mínimo único: 100,000 tx aprobadas / mes", label "compromiso mensual" (sin ramp sep→feb), tabla con rates BCI sin −10% fantasma ($12,050/mes = engine), sin banner promo Coppel ✓

**Pedido 4 — cálculos verificados:** engine ✓ a mano (tabla arriba). Los bugs eran de presentación: −10% inflaba el ROI de la slide (3.9x → ahora 3.64x real), recon fantasma $120K en fórmula del recap (bcLocal `|| default` con 0 explícito), card/fila AF "+$0".

**Extra aprobado:** PSP arena con roster chileno (Getnet 1.42 winning · Kushki 1.46 · Klap 1.48 · Transbank 1.50 · Mercado Pago 1.54; weighted ≈ 1.47% ≈ target 1.46%).

**Root cause fix (engine):** `validateInputs` ahora pass-through de flags de presentación (`yuno_tier_discount_pct`, `yuno_min_tx_ramp_enabled`, `yuno_credit_promo_enabled`, `yuno_credit_offer_title/body`, `yuno_extras_enabled`, `psp_arena_roster`) — antes se descartaban silenciosamente al persistir, por eso el deck BCI renderizaba los defaults Coppel. Edge fns `workshops-bc-update` + `workshops-bc-generate` redeployadas.

URL sin cambio: https://chief.yuno.tools/workshop/bci-seguros-249fwn
