# Plan: SDR BC — Optional Overrides via 2-Step Form

> Fecha: 2026-05-18 · Owner: rasheed@y.uno
> Status: **DRAFT — esperando aprobación antes de implementar**

## Objetivo

Reemplazar el form single-step de `/sdr-bc` por un wizard de 2 pasos que **expone todos los cálculos automáticos como campos opcionales**. Si el AE los llena, esos valores ganan; si los deja vacíos, el flujo automático actual corre intacto. Cero regresiones para slugs existentes.

## Decisiones aprobadas (preguntas previas)

- **Take rate:** solo dropdown de industria (37 categorías). El take rate queda derivado, no hay override separado.
- **APMs por país:** multi-select del catálogo `APMS_BY_ISO` (sin freetext, sin "otro").
- **SDR name + position:** solo cover del deck. No persisten en `presentations.metadata` ni en `ae_integrations`.

## Cálculos hoy automáticos que pasan a override opcional

| # | Cálculo | Source actual | Override propuesto | Paso |
|---|---------|---------------|-------------------|------|
| 1 | Industria (clasificación) | Deep research LLM → `lookupIndustry()` en `_shared/industries.ts` | `industry_override?: string` (dropdown 37 categorías) | Paso 2 |
| 2 | Take rate % | Derivado de industria (`INDUSTRIES[cat].take_rate_pct`) | Implícito — viaja con `industry_override` | — |
| 3 | Ticket promedio USD | Deep research (high/med conf) → industry default | `avg_ticket_override_usd?: number` (ya existe; ahora siempre visible) | Paso 2 |
| 4 | Local entity por país | Deep research `intel.legal_entities[].has_entity` | `legal_entities_override?: [{iso, has_entity}]` | Paso 2 |
| 5 | APMs existentes por país | Deep research `intel.existing_apms[]` | `existing_apms_override?: [{iso, apms[]}]` | Paso 2 |
| 6 | Top-5 países por región | SimilarWeb + ≥1% floor | NO override (es el driver del paso 2) | — |
| 7 | Recommended APMs | Catálogo `APMS_BY_ISO` (diff vs existentes) | NO override (derivado) | — |
| 8 | Acquirers/gateways | Deep research + `REGIONAL_STACK_CATALOG` fallback | NO override (fuera de scope esta iteración) | — |

**Campos nuevos solo de UI (sin afectar math):**
- `sdr_name?: string` — slide cover "Prepared by"
- `sdr_position?: string` — slide cover

---

## Arquitectura

### Backend

**1 endpoint nuevo + 1 endpoint modificado, cero migraciones.**

#### `sdr-bc-research` (NUEVO, read-only)
- **Input:** `{ clientName, website?, createdByEmail, force_refresh? }`
- **Acciones:**
  1. `ensureDomainGroup()` → resuelve dominio
  2. `callSimilarWeb()` → top countries (cache 30d)
  3. `callDeepResearch()` → industry guess + APMs hints + local entity hints (cache 30d)
  4. Bucket en regiones, ≥1% floor, top-5/región (mismo `regionOf()` + `COUNTRY_REGION`)
- **Output:**
  ```ts
  {
    domain: string,
    suggested_industry: string,           // ej. "Marketplace"
    suggested_avg_ticket_usd: number|null, // null si avg_ticket_unknown
    industries_catalog: Array<{ key, label, take_rate_pct }>, // 37 entries para dropdown
    regions: Array<{
      region: 'lat'|'us'|'ema'|'apa',
      countries: Array<{
        iso, name, share, visits,
        suggested_legal_entity: boolean | null,
        suggested_existing_apms: string[],
        catalog_apms: string[]   // APMS_BY_ISO[iso] para multi-select
      }>
    }>
  }
  ```
- **Manejo de error:** mismos códigos que `sdr-bc-generate` (`company_domain_unresolved`, `avg_ticket_unknown` se reporta como `suggested_avg_ticket_usd: null` en vez de 422 — el AE puede llenarlo en paso 2).
- **Caché:** todo cache-hot por construcción (reusa `chief_deep_research_company_cache` + `similarweb_cache`).

#### `sdr-bc-generate` (MODIFICADO, backwards-compat)
- **Nuevos campos opcionales en request body:**
  - `industry_override?: string` (valida contra `INDUSTRIES`; 400 si inválido)
  - `legal_entities_override?: Array<{ iso: string, has_entity: boolean }>`
  - `existing_apms_override?: Array<{ iso: string, apms: string[] }>`
  - `sdr_name?: string`, `sdr_position?: string` (van a `presentations.payload.cover_prepared_by`)
- **Puntos de inyección en código:**
  - [sdr-bc-generate/index.ts:849-863](supabase/functions/sdr-bc-generate/index.ts#L849) — antes de `lookupIndustry(intel.industry_category)` checa `body.industry_override`
  - [sdr-bc-generate/index.ts:318-327](supabase/functions/sdr-bc-generate/index.ts#L318) — `verifiedLocal(iso)` checa overrides primero
  - [sdr-bc-generate/index.ts:308-317](supabase/functions/sdr-bc-generate/index.ts#L308) — `existingApmsFor(iso)` merge con overrides (override gana)
- **Backwards-compat:** todos los slugs existentes (Crocs, Kaseya, bet365, etc.) que no envíen overrides corren idénticos a hoy.

### Frontend

**Refactor de [src/components/NewSdrBcForm.tsx](src/components/NewSdrBcForm.tsx) a wizard 2 steps.**

#### Step 1 — Lookup inputs
Fields:
- `clientName` (required)
- `website` (optional, current behavior)
- `createdByEmail` (required, current behavior)
- `sdrName` (optional, default '')
- `sdrPosition` (optional, default '')
- `force_refresh` checkbox

On submit:
- Loading spinner (60-90s realista)
- Call `sdr-bc-research`
- Store response in local state `researchResult`
- Advance to Step 2

Error cases:
- `company_domain_unresolved` → mismo helper de domain candidates que hoy
- Network/timeout → toast + permite retry sin perder inputs

#### Step 2 — Override review
Renderiza un layout con secciones:

**Top section: Industria + Ticket**
- Dropdown industria (37 opciones, preselecto = `suggested_industry`)
- Avg ticket input (placeholder = `suggested_avg_ticket_usd` si no es null; required visualmente si null pero permite continuar — el backend devolverá 422 si queda vacío y no hay research)

**Per region accordion (1 sección por región con países):**
Cada país:
- Toggle local entity: `Auto (research dice X) / Yes / No`
- Multi-select APMs existentes: checkboxes del `catalog_apms[iso]`, preseleccionados con `suggested_existing_apms`

**Footer:**
- "Back" → vuelve a Step 1 sin perder state
- "Generate deck" → POST a `sdr-bc-generate` con `{...step1Fields, industry_override, avg_ticket_override_usd?, legal_entities_override, existing_apms_override, sdr_name, sdr_position}`
- Backend re-corre research (cache-hot, ~5-10s) y aplica overrides

**Comportamiento "Auto" en cada toggle:**
- Solo manda override en el array si el AE lo cambió respecto al sugerido. Toggle "Auto" = no incluir esa ISO en `legal_entities_override` → backend usa research como hoy.

### Catálogo de industrias en frontend
- **NO duplicar** `_shared/industries.ts` en `src/`.
- `sdr-bc-research` devuelve `industries_catalog[]` → frontend lo usa directo. Single source of truth.

### Skill update
- Actualizar [.claude/skills/sdr-bc/SKILL.md](.claude/skills/sdr-bc/SKILL.md):
  - Documentar los nuevos campos opcionales en request body de `sdr-bc-generate`
  - Aclarar que el flujo desde el chat (skill) sigue siendo single-call; los overrides son solo para la UI

### Cover slide
- [public/sdr-bc-assets/slides-01-context.jsx](public/sdr-bc-assets/slides-01-context.jsx) — agregar "Prepared by {{SDR_NAME}} · {{SDR_POSITION}}" condicional (no romper layout si vacío)
- [supabase/functions/sdr-bc-render/index.ts](supabase/functions/sdr-bc-render/index.ts) — pasar tokens nuevos al render

---

## Checklist de implementación

### Fase 1 — Backend
- [ ] **1.1** Crear `supabase/functions/sdr-bc-research/index.ts` extrayendo lógica de research de `sdr-bc-generate` (refactor common helpers a `_shared/sdr-bc-research-core.ts` si crece)
- [ ] **1.2** Agregar `industries_catalog` exportable en `_shared/industries.ts` (función `listIndustries()`)
- [ ] **1.3** Agregar campos override al request schema de `sdr-bc-generate` + validación
- [ ] **1.4** Wire overrides en los 3 puntos de inyección (industry, legal entity, existing APMs)
- [ ] **1.5** Persistir `sdr_name`/`sdr_position` en `presentations.payload` para que render los lea
- [ ] **1.6** Deploy ambas edge functions: `SUPABASE_ACCESS_TOKEN=... npx supabase functions deploy sdr-bc-research sdr-bc-generate --no-verify-jwt --project-ref arupeqczrxmfkcbjwyad`

### Fase 2 — Frontend
- [ ] **2.1** Refactor `NewSdrBcForm.tsx` a wizard (state machine `step: 1 | 2`, hold `researchResult`)
- [ ] **2.2** Componente `Step1Lookup` (5 campos + submit a `sdr-bc-research`)
- [ ] **2.3** Componente `Step2Overrides` (industria dropdown + ticket + region accordions con APMs/local entity)
- [ ] **2.4** Diff logic — solo enviar overrides cuando el AE cambió respecto al sugerido
- [ ] **2.5** Loading states (skeleton durante research) + error states (domain_unresolved retry)
- [ ] **2.6** Verificar en browser localmente (`pnpm dev`) con un cliente real (ej. Crocs) end-to-end

### Fase 3 — Cover + Skill
- [ ] **3.1** Editar `slides-01-context.jsx` para "Prepared by" condicional
- [ ] **3.2** Pasar tokens en `sdr-bc-render`
- [ ] **3.3** Actualizar `.claude/skills/sdr-bc/SKILL.md` con campos nuevos

### Fase 4 — Smoke test
- [ ] **4.1** Generar deck SIN overrides (caso baseline) — verificar que slug nuevo = comportamiento idéntico a Crocs actual
- [ ] **4.2** Generar deck CON override de industria (cambiar Marketplace → Travel) — verificar take rate cambia en math
- [ ] **4.3** Generar deck CON override de local entity (forzar `has_entity=true` en país sin entity) — verificar Δ AR = 2pp en vez de 4pp en esa columna
- [ ] **4.4** Generar deck CON override de APMs existentes — verificar slide APMs refleja inputs
- [ ] **4.5** Verificar cover muestra SDR name/position

### Fase 5 — Deploy
- [ ] **5.1** Commit + push a `main` (Railway auto-deploy frontend)
- [ ] **5.2** Verificar en `chief.yuno.tools/presentaciones` tab SDR BC con cliente real
- [ ] **5.3** Marcar plan como `DONE` y mover a `plan-sdr-bc-optional-overrides-DONE.md`

---

## Riesgos identificados

| Riesgo | Mitigación |
|--------|-----------|
| Step 1 tarda 60-90s (research) — UX pobre | Loading state explícito + estimar "esto toma ~1 min"; aprovechar cache 30d en runs subsecuentes |
| AE override inconsistente (ej. dice "Pix existing" en US) | UI: catalog_apms[iso] viene filtrado por país; no se pueden seleccionar APMs irrelevantes |
| Skill `/sdr-bc` desde chat se rompe | Backwards-compat: campos override opcionales; sin ellos = comportamiento idéntico |
| Industry dropdown abrumador (37 opciones) | Agrupar por familia (Marketplace / Travel / Retail / SaaS / etc.) o searchable combobox |
| `sdr_name/position` persisten en payload — privacy? | No PII sensible; queda en deck público igual que client name |

## Out of scope (siguiente iteración si se pide)

- Override de acquirers/gateways (payment stack)
- Override de auth rates por país
- Override de share/visits de SimilarWeb
- Editar la lista top-5 países (agregar/remover manualmente)
- Persistir SDR name/position por defecto en `ae_integrations`
