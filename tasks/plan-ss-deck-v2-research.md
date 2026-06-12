# Plan: SS Deck v2 — top 4 acquirers en SlideYunoSolve

## Goal
Cuando `/ss-deck <Cliente>` corre, popular `merchants_ss.psps` con los **top 4 acquirers** del cliente. El slide `SlideYunoSolve` ya renderiza la lista dinámicamente — no toca frontend.

## Lógica (jerarquía de fallbacks)
1. **Path A — deep research**: resolver dominio → upsert `account_map_companies` → llamar `chief-deep-research-company` → extraer `intelligence.payment_stack.acquirers[]` → tomar top 4.
2. **Path B — regional fallback**: si Path A devuelve <2 acquirers reales (heurística `isStackResearchWeak` ya existente), tomar el **país top** por traffic share (SimilarWeb top_countries[0]) → mapear a región (us/lat/ema/apa) → usar `REGIONAL_STACK_CATALOG[region].acquirers` (ya curated, 4 acquirers por región).
3. **Path C — último recurso**: si Path B falla (no hay SimilarWeb data), devolver `[]` y el slide muestra "+460 providers" como template.

Filtros: aplicar `isNonPsp()` (helper ya portado) para descartar Visa/Mastercard/Apple Pay/cards genéricos antes de guardar.

## Shape final en DB
`merchants_ss.psps` = jsonb array of `{ name: string, role?: string }`. El slide usa solo `.name`.

## Cambios

### Backend (único trabajo)
- [ ] **`ss-deck-generate/index.ts` v2**:
  - Aceptar `website?` opcional. Si no viene → `resolveCompanyDomain(company_name)`.
  - `upsert account_map_companies { company_name, website }` (idéntico patrón a sdr-bc-generate).
  - `await fetch chief-deep-research-company { company_id }` (uso cached 30d).
  - Extraer `intelligence.payment_stack.acquirers` + `gateways`.
  - Si `isStackResearchWeak(acquirers, gateways)` → llamar `similarweb-traffic` para top_countries → mapear primero a región vía `regionOf(isoFromCountryName(name))` → tomar `REGIONAL_STACK_CATALOG[region].acquirers`.
  - Filtrar con `isNonPsp()`, slice top 4, mapear a `[{ name, role: null }]`.
  - Guardar como `psps` en la insert.
  - Devolver source breadcrumb: `content_source: 'research' | 'regional_fallback' | 'template'`.
- [ ] Si `chief-deep-research-company` tarda >25s o falla → fallback directo a Path B sin bloquear la generación.

### Frontend
- [ ] **Nada que tocar**. El slide ya consume `data.PSPS.slice(0, 4)`.

### Skill
- [ ] Update `SKILL.md` para mencionar que v2 corre research (mencionar latencia ~30-60s y posible `regional_fallback` flag en la respuesta).

## Latencia + costo esperados
- Path A: 20-40s (deep-research cache miss) o <2s (cache hit). Costo: $0.30-0.50 si miss.
- Path B: 2-5s (1 llamada SimilarWeb). Costo: ~30 credits SimilarWeb.
- Total p50 esperado: 5-10s (la mayoría de empresas top tendrán cache hit eventualmente).

## Verificación
- [ ] `curl ss-deck-generate {"company_name":"Walmart"}` → row con `psps` poblado con 4 acquirers (research o regional). El primer test debe usar una empresa USA-heavy (Walmart) y una LATAM (Rappi) para validar ambos paths.
- [ ] Abrir `/m/walmart-<suffix>` → slide YunoSolve muestra 4 chips (no "+460 providers" grande).
- [ ] Re-generar deck existente NO requerido (solo afecta decks nuevos).

## Riesgos
- **chief-deep-research-company crea account_map_companies row** si no existe — eso podría tirar nuevos rows que el equipo de account-mapping no espera. **Mitigación**: usar la misma lógica que sdr-bc-generate (que ya hace esto en prod sin problemas).
- **NON_PSP_PATTERNS demasiado agresivo**: podría tirar 3 de los 4 acquirers reales. **Mitigación**: si después de filtrar quedan <2 → caer a regional fallback en vez de mostrar lista corta.
- **Costo $$**: cada deck dispara deep-research ($0.30-0.50). Si se generan 50 decks al día = $15-25/día. Aceptable pero monitor.
