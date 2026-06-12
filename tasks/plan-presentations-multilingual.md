# Plan: Presentaciones Multilenguaje (es / en / pt)

> Fecha: 2026-05-18 · Owner: rasheed@y.uno
> Status: **DRAFT — esperando aprobación antes de empezar Fase 1**
> Scope: Workshops BC, SDR BC, SS Deck

## Objetivo

Habilitar las 3 presentaciones generadas desde Chief (`/yuno-workshops-bc`, `/sdr-bc`, `/ss-deck`) en **español, inglés y portugués**, manteniendo **idénticos** los cálculos (math, traffic, regions, levers) en todos los idiomas. Cero cambios al pipeline numérico; toda la traducción es capa de presentación.

## Decisiones tomadas (clarificaciones del 2026-05-18)

1. **Source de traducciones:** LLM genera 3 versiones, user revisa antes de merge. Usar glosario Yuno (auth rate, MDR, antifraude, take rate, smart routing) consistente entre los 3 decks.
2. **Default language:**
   - Auto-generación (cadence step, cron) → **siempre `en`**
   - UI manual → idioma elegido por el AE en el form
3. **Currency formatting:**
   - Auto-generación → **siempre USD**
   - UI manual → moneda elegida por el AE
   - Implementación vía `Intl.NumberFormat(locale, { currency })` para que el mismo número renderice `$24.5M` (en) / `$24,5M` (es) / `US$ 24,5M` (pt-BR)

## Principios

1. **Math intocable.** Toda la matemática vive server-side en edge functions (`workshops-bc-math.ts`, `sdr-bc-generate`, `ss-deck-generate`). Estas funciones quedan **read-only** en este plan salvo agregar `language`/`currency` al input schema.
2. **Solo capa de presentación cambia.** Slides JSX leen valores pre-computados; añadimos un dict de strings + helper de format.
3. **Patrón yuno-bc como blueprint.** Replicamos el approach existente de `presentation-create` + `presentation-render` (variants `-es.jsx`/`-pt.jsx` + `SERVICE_I18N` + `GATE_COPY`).
4. **Workshops primero** (ya tiene 70% de la infra). SDR BC y SS Deck después.
5. **QA por idioma antes de merge:** cada deck renderizado en los 3 idiomas debe mostrar los mismos números, solo cambiando labels y format.

---

## Fase 0 — Foundations (shared infra)

> Output: helpers compartidos + glosario de términos Yuno en 3 idiomas + migrations DB.

- [ ] **0.1** Crear `supabase/functions/_shared/i18n.ts`:
  - `type Lang = 'es' | 'en' | 'pt'`
  - `formatMoney(value, currency, lang)` → wrap `Intl.NumberFormat`
  - `formatNumber(value, lang)` → separadores decimales correctos
  - `validateLang(input): Lang` (default 'en')
  - `validateCurrency(input): string` (whitelist USD, MXN, BRL, COP, ARS, CLP, PEN, EUR; default USD)
- [ ] **0.2** Crear `src/lib/i18n-glossary.ts` con términos Yuno en 3 idiomas:
  - auth rate / tasa de aprobación / taxa de aprovação
  - take rate / take rate / take rate
  - MDR / MDR / MDR
  - antifraud / antifraude / antifraude
  - smart routing / ruteo inteligente / roteamento inteligente
  - acquirer / adquirente / adquirente
  - chargeback / contracargo / chargeback
  - acceptance rate uplift / mejora en aprobación / aumento na aprovação
  - cross-border / cross-border / cross-border
  - APM / método alternativo / método alternativo
  - …completar lista al inicio de Fase 1
- [ ] **0.3** Migration shared: añadir columnas `language text default 'en'` + `currency text default 'USD'` a `presentations` (kind=sdr_bc) y `merchants_ss`. `workshops_bc` ya tiene `language` — solo añadir `currency` y extender CHECK de language para incluir 'pt'.
- [ ] **0.4** Decisión: ¿el `Intl.NumberFormat` corre en server (edge function pre-computa strings) o client (JSX llama helper)? **Propuesta:** computar números crudos en server, formatear en client con helper compartido. Así un mismo row puede re-renderizar en otro idioma sin regenerar.

---

## Fase 1 — Workshops BC (lo más cerca de done)

> Estado actual: ya tiene `language` enum (es/en), i18n.js cubre ~70%, math en `workshops-bc-math.ts` puro. Falta PT + completar strings hardcoded + currency.

### 1.A — DB & edge function

- [ ] **1.A.1** Migration: extender CHECK constraint de `workshops_bc.language` de `('es','en')` a `('es','en','pt')`. Añadir columna `currency text default 'USD'`.
- [ ] **1.A.2** `workshops-bc-generate/index.ts`: extender validación de `language` a aceptar `pt`. Aceptar `currency` opcional, default 'USD'. Validar whitelist. **No tocar `computeBusinessCase`.**
- [ ] **1.A.3** Persistir `language` + `currency` en la row, retornar en URL response.

### 1.B — i18n PT

- [ ] **1.B.1** Spawn translation agent: LLM traduce todas las keys existentes de `src/workshops-bc/lib/i18n.js` a PT usando glosario de 0.2. Output: nuevo bloque `pt: {...}` en el mismo archivo.
- [ ] **1.B.2** Review humano (user) de PT antes de merge. Áreas críticas: case studies (Rappi, inDrive, Livelo, McDonald's), lever names, NOVA capabilities.

### 1.C — Strings hardcoded restantes (~30%)

- [ ] **1.C.1** Inventario completo: lista de archivos y líneas con strings hardcoded en `src/workshops-bc/components/slides/`:
  - `SlideCover.jsx` lines 38–48 (hero "orquestación de pagos")
  - `SlideLeversOverview.jsx` lines 29–68 (LEVERS array)
  - `SlideLeverRouting.jsx`, `SlideLeverMDR.jsx`, `SlideLeverAntifraud.jsx`, `SlideLeverMonitors.jsx`
  - `SlideCaseRappi.jsx`, `SlideCaseInDrive.jsx`, `SlideCaseLivelo.jsx`, `SlideCaseMcDonalds.jsx`
  - `SlideNova.jsx` lines 16–21 (capabilities — coordinar con redesign en `plan-workshops-bc-nova-redesign.md`)
  - `SlideConcierge.jsx`
  - `SlidePOSFlow.jsx`, `SlidePOSBeforeAfter.jsx`, `SlidePOSApms.jsx`
- [ ] **1.C.2** Refactor: extraer cada string a key en i18n.js (es/en/pt). Sustituir literal por `tr(lang, 'key.path')`.
- [ ] **1.C.3** Pasar `lang={data.LANGUAGE}` prop a cada slide desde `WorkshopViewer.jsx`. Hoy solo pasa `data`, `pageNum`, `total`.

### 1.D — Currency formatting

- [ ] **1.D.1** Refactor `fmtMoney()` helper en `src/workshops-bc/lib/format.js` para aceptar `(value, currency, lang)` y usar `Intl.NumberFormat`.
- [ ] **1.D.2** Cada slide que muestra plata (`SlideBusinessCaseRecap`, `SlideYunoCost`, `SlidePerVerticalResult`, lever slides) usa `fmtMoney(value, data.CURRENCY, data.LANGUAGE)`.
- [ ] **1.D.3** **Validar Coppel:** `$24.52M/año` (es) === `$24.52M/year` (en) === `US$ 24,52M/ano` (pt). Mismo número, formato distinto.

### 1.E — UI form

- [ ] **1.E.1** Añadir dropdown `language` (es/en/pt) en el form de "/yuno-workshops-bc" UI (ubicación: buscar dónde vive el form en `src/pages` o `src/components`).
- [ ] **1.E.2** Añadir dropdown `currency` (USD, MXN, BRL, COP, ARS, CLP, PEN, EUR).
- [ ] **1.E.3** Cuando se llame desde la skill `/yuno-workshops-bc`, la skill sigue preguntando idioma (ya lo hace). Skill pasa `currency='USD'` salvo que user lo override.

### 1.F — Skill update

- [ ] **1.F.1** Actualizar `.claude/skills/yuno-workshops-bc/SKILL.md` para preguntar 3 opciones (es/en/pt) en vez de 2, y permitir override de currency.

---

## Fase 2 — SDR BC (English only → trilingüe)

> Estado actual: 100% inglés, math puro server-side, slides JSX con strings inline.

### 2.A — DB & edge function

- [ ] **2.A.1** Migration: si `presentations.defaults` JSONB ya guarda config, persistir `language` + `currency` ahí. Si no, añadir columnas dedicadas.
- [ ] **2.A.2** `sdr-bc-generate/index.ts`: añadir `language: 'es'|'en'|'pt'` (default 'en') y `currency` (default 'USD') al request schema. Persistir. **No tocar math** (TPV, Δ AR, Δ TPV, Cost Reduction, take rate por categoría).
- [ ] **2.A.3** `_shared/regions.ts`: extender `REGION_LABEL` a `REGION_LABELS: Record<Lang, Record<RegionKey, string>>`.
  - en: { us: 'North America', lat: 'LATAM', ema: 'EMEA', apa: 'APAC' }
  - es: { us: 'Norteamérica', lat: 'LATAM', ema: 'EMEA', apa: 'APAC' }
  - pt: { us: 'América do Norte', lat: 'LATAM', ema: 'EMEA', apa: 'APAC' }
- [ ] **2.A.4** En `sdr-bc-generate` pasar `language` al builder de `regionsRendered` para que use la versión correcta de region label.

### 2.B — i18n strings

- [ ] **2.B.1** Crear `public/sdr-bc-assets/sdr-bc-i18n.js` con dict en/es/pt. Cubrir:
  - **Slide 09 (section divider):** "Business case", "Region by region — quantifying the upside…"
  - **Slide 10 (four levers):** títulos + bullets de las 4 palancas (Acceptance rate uplift, New-methods growth, MDR cost optimization, Build / Run avoidance), "Four levers. One outcome.", body text, kickers
  - **Cards table headers (líneas 277, 405, 536):** Market / Annual TPV / Δ AR (pp) / Δ TPV ($M) / Cost Red. ($M) / Proposed APMs / Team / Cost per month / Per integration / All integrations
  - **Slide 27 (Total / CTA):** copy de cierre
  - **Slide 01 Cover:** título, kicker, fecha label
  - **Slide 02 Agenda:** items
  - Footer / disclaimer text
- [ ] **2.B.2** LLM traduce todo → user revisa.
- [ ] **2.B.3** Refactor: reemplazar literales por `copy[key]` con helper `getCopy(lang)`.

### 2.C — Render wiring

- [ ] **2.C.1** `sdr-bc-render/index.ts`: extraer `lang = data.defaults?.language || 'en'` y `currency = data.defaults?.currency || 'USD'`. Pasar a cada slide builder.
- [ ] **2.C.2** Cada `Slide*` JSX recibe `lang` + `currency` y formatea con `Intl.NumberFormat`.

### 2.D — UI form

- [ ] **2.D.1** Si la UI de SDR BC existe (verificar — la skill puede ser la única entrada hoy), añadir dropdowns. Si no, ya con la skill basta.

### 2.E — Skill update

- [ ] **2.E.1** Actualizar `.claude/skills/sdr-bc/SKILL.md` (hoy es "English-only, no language gate") → preguntar idioma + currency. Mantener default 'en' + 'USD' para que las llamadas existentes no rompan.

---

## Fase 3 — SS Deck (English only → trilingüe)

> Estado actual: 100% inglés, 21 slides React, cadence step ya integrado.

### 3.A — DB & edge function

- [ ] **3.A.1** Migration: añadir `language text default 'en' check (language in ('es','en','pt'))` + `currency text default 'USD'` a `merchants_ss`.
- [ ] **3.A.2** `ss-deck-generate/index.ts`: aceptar `language` + `currency` en body schema. Persistir. **No tocar research/acquirer detection.**
- [ ] **3.A.3** `defaultDeckContent()` (líneas 80–120): convertir las 5 pain_titles, 6 missing_methods, 4 capability_titles/descs en dict por idioma. Edge function devuelve el bloque del idioma pedido.

### 3.B — i18n strings (21 slides)

- [ ] **3.B.1** Crear `src/ss-deck/lib/copy.js` con dict en/es/pt. Cubrir slide por slide:
  - SlideCover ("Hello {name} team!")
  - SlideMarketContext / SlideOrchestrationEra / SlideWhatIsOrchestration / SlideWhyPlatformPartner / SlideBeyondOrchestration / SlideValueLevers / SlideWhiteLabelPromise / SlideInfrastructure (slides 2–9 banking flow)
  - SlideDiagnostic (PAIN_TAXONOMY tags: RESILIENCE, CROSS-BORDER, ROUTING, RECOVERY, AUTH RATE, COVERAGE, SECURITY, OPERATIONS) + 5 pain cards
  - SlideYunoSolve
  - SlideReplitGoingGlobal / SlideReplitBenefits
  - SlideProductSuite (6 product cards)
  - SlideDashboard (UI labels)
  - SlideGlobalPresence
  - SlideLeadership (nombres se quedan iguales, solo cambian role labels)
  - SlideTrustedBy
  - SlideCTA / SlideBookDemo
- [ ] **3.B.2** LLM traduce + user revisa.
- [ ] **3.B.3** Refactor: cada slide JSX recibe `language` prop y usa `getCopy(language, 'key')`.

### 3.C — Cadence step integration

- [ ] **3.C.1** `process-queue/index.ts` (`processGenerateSsDeck`): hoy llama a `ss-deck-generate` con `{company_name, org_id, [website]}`. Mantener — **automatic siempre = 'en' / 'USD'** (decisión user). No requiere cambios.
- [ ] **3.C.2** Si en el futuro queremos override por cadence o per-lead, persistir `deck_language` en `cadence_lead_state`. **Out of scope para esta fase.**

### 3.D — Render component

- [ ] **3.D.1** Localizar route `/m/:slug` y component. Extraer `language` de la row `merchants_ss`. Pasar como prop al viewer.
- [ ] **3.D.2** `toSlideData()` en `src/ss-deck/lib/supabase.js` añade `LANGUAGE` + `CURRENCY` al data object.

### 3.E — UI form

- [ ] **3.E.1** Tab "SS Deck" en `/presentaciones` (form "New SS Deck"): añadir dropdowns language + currency.

### 3.F — Skill update

- [ ] **3.F.1** `.claude/skills/ss-deck/SKILL.md`: preguntar idioma + currency. Default 'en' / 'USD'.

---

## Fase 4 — QA cross-deck

> Output: matriz 3×3 (3 decks × 3 idiomas) verificada antes de prod.

- [ ] **4.1** Generar **Coppel** en workshops-bc en es/en/pt. Verificar:
  - Math idéntica en los 3 (Smart Routing $X, MDR $Y, Antifraud $Z, total $24.52M)
  - Labels traducidos correctamente (smart routing / ruteo inteligente / roteamento)
  - Format de currency correcto por locale
- [ ] **4.2** Generar **bet365** (o cliente verificado) en sdr-bc en es/en/pt. Verificar:
  - Top-5 por región por traffic share + 1% floor inalterado
  - Δ TPV / Cost Reduction matemáticamente iguales
  - Region labels: "North America" → "Norteamérica" → "América do Norte"
  - Auth rates por país identical (only labels change)
- [ ] **4.3** Generar **Replit** o similar en ss-deck en es/en/pt. Verificar:
  - Acquirers detectados son los mismos (no cambia con idioma)
  - PAIN_TAXONOMY tags traducidos
  - Slide flow correcto (banking vs replit-only path inalterado)
- [ ] **4.4** Smoke test cadence step: lead que entra en cadencia automática hoy genera SS Deck en `en` por default (sin override).
- [ ] **4.5** Smoke test cadence step manual: si AE setea language preference en cadence config (futuro), respeta override. **Si no implementamos override en Fase 3, este test queda diferido.**
- [ ] **4.6** Performance: generar deck en 3 idiomas no debe agregar latencia significativa (i18n.js carga 3× strings pero es <50KB). Validar bundle size.

---

## Fase 5 — Documentación & rollout

- [ ] **5.1** Actualizar memorias en `~/.claude/projects/.../memory/`:
  - `project_yuno_workshops_bc.md`: añadir support PT
  - `project_sdr_bc_deck.md`: cambiar de "English-only" a "trilingüe (en default)"
  - `project_ss_deck.md`: añadir support es/en/pt + currency
- [ ] **5.2** Update CLAUDE.md (`tasks/lessons.md` o similar) con regla: "Cuando se agregue una slide nueva a cualquier presentación, debe nacer con keys en i18n.js (es/en/pt). NO hardcodear strings."
- [ ] **5.3** Single commit por fase (Fase 1, Fase 2, Fase 3, Fase 4 QA) con smoke test propio. No mega-PR.

---

## Riesgos & mitigaciones

| Riesgo | Mitigación |
|---|---|
| LLM traduce mal términos Yuno (smart routing → "enrutamiento" en vez de "ruteo") | Glosario explícito en Fase 0.2 + user review obligatorio |
| Strings PT no caben en cards (más largas que EN) | QA visual en Fase 4 por cada slide; ajustar font-size si overflow |
| Coppel BC en pt da número distinto por error de format | Tests unitarios sobre `fmtMoney(24524782, 'USD', 'pt')` === `'US$ 24,5M'` |
| Cadence step cambia comportamiento accidentalmente | Decisión clara: automatic = en/USD always; no se toca `process-queue` salvo Fase 3.C.1 (no-op) |
| Currency conversion drift (si user pide MXN sobre TPV en USD) | **Out of scope esta fase.** Currency es solo display format, no conversion. Si user pide MXN, mostramos el número crudo con símbolo MXN — explicitar en UI tooltip |
| Bundle size crece con 3× strings | Lazy-load por idioma si total > 200KB. Probablemente innecesario; medir en 4.6 |

## Estimación de esfuerzo

| Fase | Esfuerzo | Bloqueado por |
|---|---|---|
| 0 — Foundations | 2h | – |
| 1 — Workshops BC | 6h | 0 |
| 2 — SDR BC | 7h | 0 |
| 3 — SS Deck | 8h | 0 |
| 4 — QA | 3h | 1, 2, 3 |
| 5 — Docs | 1h | 4 |
| **Total** | **~27h** | |

Se puede paralelizar Fases 1, 2, 3 (3 ramas separadas, sin overlap de archivos).

---

## Out of scope (explícito)

- **Tocar la matemática.** Cero cambios a `workshops-bc-math.ts`, `sdr-bc-generate` compute layer, `ss-deck-generate` research pipeline.
- **Currency conversion (FX).** Mostramos el número que computó el server con el símbolo elegido. Si user pide MXN sobre TPV-en-USD, asumimos que el number ya está en MXN o lo muestra como display-only (tooltip explica).
- **Idiomas adicionales** (fr, de, jp, etc.). Solo es/en/pt.
- **Auto-detect language** desde país del cliente. UI siempre pide explícito; automatic siempre = 'en'.
- **Re-render automático** cuando user cambia idioma de una row existente. Si quieres re-renderizar Coppel de es → pt, regeneras (nueva row o update + cache-bust).
