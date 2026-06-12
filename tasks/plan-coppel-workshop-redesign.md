# Plan: Coppel Workshop redesign — align with Claude Design handoff

> Fecha: 2026-05-12 (sesión 2) · Owner: rasheed@y.uno
> Status: **DRAFT — esperando aprobación**
> Source: bundle Claude Design `dDvk3CJKRffh93hhSlLxjQ` · primary file `Coppel Workshop.html`

## TL;DR — el diseño es una SUITE distinta

Lo que construimos a la mañana (17 slides, Geist, dark canvas, border-beam) **NO matchea** el diseño que el usuario subió. El diseño define un sistema visual diferente con 26 slides. Decisión clave que requiere tu sign-off:

**¿Rebuild completo del workshops-bc para matchear el diseño?**

## Gap analysis (current vs design)

| Dimensión | Lo que tenemos (v1) | Lo que el diseño define | Acción |
|---|---|---|---|
| **Slides** | 17 | **26** (+4 section dividers, +3 case studies extra, +3 per-lever, +2 per-AI-product) | Rebuild list |
| **Font** | Geist + Geist Mono | **Titillium Web** + Geist Mono (Yuno brandbook) | Switch font |
| **Typography case** | Title Case (capital 1ra letra) | **all lowercase** (per brandbook) — `text-transform: lowercase` | Cambiar todos los `t-title` |
| **Themes** | Dark canvas only | **6 themes**: light · lilac · dark · blue · gradient (black→blue) · blue-gradient | Multi-theme rotativo |
| **Layout** | flex+grid con clamp() padding | Absolute positioning con `var(--margin)=80px` fijo | Cambiar layout system |
| **Decorations** | Border-beam (conic) + beam-rule horizontal | **HalftoneBg** (SVG dot pattern w/ mask fades) + **OrbHalftone** (radial glow + dots) + section labels con línea horizontal corta | Add 2 new components |
| **Animations** | `stagger > *:nth-child` on mount | `[data-deck-active]` MutationObserver → 8-step anim-in keyframe con blur+translateY | New activation system |
| **Counter** | Static number | Counter component animado 0→target on slide activation | New component |
| **Customer proof** | 2 slides (Approval + Speed, 3 logos c/u) | **4 dedicated slides**: inDrive · Rappi · Livelo · McDonald's (con quote + grid 4-stats + side card) | Add 2 slides |
| **Levers** | 1 slide combinado (4 cards) | **1 overview (S15) + 4 dedicadas (S16/17/18/19)** | Add 4 slides |
| **AI products** | 1 slide combinado (Nova+Concierge+Toolkit) | **3 slides dedicadas** (S21 Nova c/ WhatsApp mock, S22 Concierge c/ Slack mock, S23 Toolkit con stack de 4 layers) | Add 3 slides |
| **Section dividers** | No tiene | **4 slides** dedicadas a separar agenda blocks (S03/S07/S12/S20) con número gigante (01/02/03/04) + título lowercase + subtitle | Add 4 slides |
| **Stage** | 1920×1080 con `transform: scale()` para fit | Mismo (1920×1080) | OK |

## Math differences (más sutiles pero importantes)

| Lever | Mi math actual | Math del diseño |
|---|---|---|
| TAKE_RATE | margin_assumption_pct (default 30%) | **`TAKE_RATE = 0.15`** fijo (15% contribution margin) |
| MDR savings | `tpv_annual × Δmdr/100` (sobre TPV actual) | `approvedNew × ticket × Δmdr/100` (sobre **TPV NUEVO** post-uplift) |
| Antifraude | igual: `attempts × Δaf × 12` | mismo |
| Approval | `attempts × Δapr × ticket × 12` = TPV uplift | mismo |
| Revenue capturado | `tpv_uplift × 30%` margin | **`tpv_uplift × 15%`** take rate |
| Monitors | NO existía como lever | **Cualitativo** — no money, valor mostrado como barra rayada en S24 |

**Impacto para Coppel:** mi cálculo da $44.67M/año (30% margin). Con el diseño:
- Revenue capturado = $135.2M × 15% = $20.28M/año
- MDR savings recalculado sobre nuevo TPV = $2.90M × 12 × 0.1% × 1.0244 ≈ $3.78M/año (ligeramente más)
- Antifraude = $0.41M (igual)
- **Total: ~$24.47M/año** (vs $44.67M antes — 45% más conservador)

## Plan de implementación (3 fases, ~6h total)

### Fase A — Visual system foundation (~1.5h)
- [ ] **A.1** Nuevo `src/workshops-bc/index.css` SIN `@import` de ss-deck. Tokens propios:
  - Switch font Geist → Titillium Web + Geist Mono
  - 6 themes en `:root` + clases `.theme-{light,lilac,dark,blue,gradient,blue-gradient}`
  - Variables del diseño: `--unity-black: #282A30`, `--harmony-lilac: #E8EAF5`, `--lime: #E0ED80`, `--cyan: #38ADFF`, `--yuno-blue-deep: #1227AD`, `--margin: 80px`
- [ ] **A.2** Typography: clase `.t-title{text-transform: lowercase; font-weight:200-300}` + variantes xl/l/m/s
- [ ] **A.3** Animation system: `[data-deck-active]` activation + `.anim-in.anim-in-{1..8}` con keyframe `animIn` (blur+translateY+opacity)
- [ ] **A.4** WorkshopViewer.jsx: setear `data-deck-active` en el slide visible, retirarlo de los inactivos (MutationObserver-free, prop-based)
- [ ] **A.5** Shared components nuevos en `src/workshops-bc/components/primitives/`:
  - `HalftoneBg.jsx` (SVG dot pattern + mask fade)
  - `OrbHalftone.jsx` (radial glow + halftone overlay)
  - `SectionLabel.jsx` (línea horizontal + label uppercase)
  - `SlideFooter.jsx` (logo · sección · página NN/26)
  - `YunoLogo.jsx` (wordmark lowercase 700)
  - `Counter.jsx` (animated number, observa data-deck-active)
  - `ClientLogoMark.jsx` (placeholder dashed border)

### Fase B — Math + DB schema (~1h)
- [ ] **B.1** Update edge fn `workshops-bc-generate/index.ts`:
  - Cambiar `margin_assumption_pct` → `take_rate_pct` (default 15)
  - MDR savings = `approvedNew × ticket × Δmdr/100`
  - Quitar `total_impact_annual_usd` que sumaba 4 levers; reemplazar por:
    - `incremental_revenue_annual_usd` (15% take rate sobre TPV uplift)
    - `direct_savings_annual_usd` = mdr + antifraude
    - `total_annual_value_usd` = revenue + direct_savings (3 levers)
    - `monitors_qualitative: true`
- [ ] **B.2** Migration 147: rename `business_case` payload schema. Add NEW computed fields, deprecate viejos. Re-curl Coppel para validar new math = ~$24M.
- [ ] **B.3** Re-deploy edge fn

### Fase C — Slide rebuild (~3.5h, paralelizable)
Las 26 slides. Marco S## == nombre del componente al lado:

| # | Slide | Theme | Componente |
|---|---|---|---|
| 01 | Cover | gradient | `SlideCover.jsx` (reescribir) |
| 02 | Agenda | light | `SlideAgenda.jsx` (reescribir — 5 items con páginas) |
| 03 | Sección 01 · Quién es Yuno | blue-gradient | `SlideSectionYuno.jsx` (nuevo) |
| 04 | Yuno en números | light | `SlideYunoNumbers.jsx` (nuevo) |
| 05 | Plataforma | dark | `SlidePlatform.jsx` (nuevo) |
| 06 | Logo wall | light | `SlideLogoWall.jsx` (15 brands, grid 5×3) |
| 07 | Sección 02 · Casos | dark | `SlideSectionCases.jsx` (nuevo) |
| 08 | Caso inDrive | light | `SlideCaseInDrive.jsx` (nuevo) |
| 09 | Caso Rappi | dark | `SlideCaseRappi.jsx` (nuevo) |
| 10 | Caso Livelo | light | `SlideCaseLivelo.jsx` (nuevo) |
| 11 | Caso McDonald's | dark | `SlideCaseMcDonalds.jsx` (nuevo) |
| 12 | Sección 03 · Caso Coppel | blue-gradient | `SlideSectionCoppel.jsx` (nuevo) |
| 13 | Stack actual cliente | light | `SlideStack.jsx` (reescribir desde Diagnostic) |
| 14 | Volúmenes | light | `SlideVolumes.jsx` (nuevo) |
| 15 | 4 palancas overview | dark | `SlideLeversOverview.jsx` (reescribir desde BusinessCase) |
| 16 | Lever 01 · Routing | light | `SlideLeverRouting.jsx` (nuevo, w/ ruteo visual) |
| 17 | Lever 02 · MDR | light | `SlideLeverMDR.jsx` (nuevo) |
| 18 | Lever 03 · Antifraude | light | `SlideLeverAntifraud.jsx` (nuevo) |
| 19 | Lever 04 · Monitors | dark | `SlideLeverMonitors.jsx` (reescribir) |
| 20 | Sección 04 · AI nativo | blue-gradient | `SlideSectionAI.jsx` (nuevo) |
| 21 | NOVA | dark | `SlideNova.jsx` (nuevo, w/ WhatsApp bubble mock) |
| 22 | Payments Concierge | light | `SlideConcierge.jsx` (nuevo, w/ Slack mock) |
| 23 | Yuno Toolkit | dark | `SlideToolkit.jsx` (nuevo, 4-layer stack diagram) |
| 24 | Impacto anual | dark | `SlideAnnualImpact.jsx` (reescribir TheNumbers — waterfall) |
| 25 | Equipo | light | `SlideTeam.jsx` (reescribir — 2 grandes cards, no grid de 4) |
| 26 | Próximos pasos | gradient | `SlideNext.jsx` (reescribir — 4-step timeline + CTA card) |

**Slides que se borran** (obsoletas):
- `SlideMarketContext.jsx` (no está en diseño)
- `SlideWhatIsYuno.jsx` (cubierto por Platform + YunoNumbers)
- `SlideYunoSolve.jsx` (no está)
- `SlideProductSuite.jsx` (cubierto por Toolkit + Platform)
- `SlideProofApproval/Speed.jsx` (reemplazado por 4 case slides individuales)
- `SlideTrustedBy.jsx` (reemplazado por LogoWall)
- `SlideThanks.jsx` (mergeada en S26 Next)
- `SlideTheNumbers.jsx` (reescrita como AnnualImpact)
- `SlideBusinessCase.jsx` (reescrita como LeversOverview)
- `SlideYunoAI.jsx` (split en 3: Nova + Concierge + Toolkit)

### Fase D — Verificación + deploy (~30min)
- [ ] **D.1** Smoke test Coppel re-run — verificar URL renderiza 26 slides
- [ ] **D.2** Math check: total ≈ $24M (no $44M)
- [ ] **D.3** Typecheck + lint
- [ ] **D.4** Git commit + push (Railway auto-deploy)
- [ ] **D.5** Update memory `project_yuno_workshops_bc.md` con la nueva estructura

## Decisiones que necesito tu sign-off

1. **¿Replace 17-slide con 26-slide, o build alongside como `/workshop-v2/<slug>`?**
   - **Propuesta:** REPLACE. El URL existente (`/workshop/coppel-ajc5f4`) ya está vivo y queda obsoleto si solo redirigo a v2. Reemplazo en sitio.

2. **¿Math: switch a TAKE_RATE=15% + Monitors cualitativo? (= ~$24M vs $44M actual)**
   - **Propuesta:** SI. Es más defensible (15% take rate retail es estándar) y matchea el diseño. Hay que reportar al usuario que el número Coppel baja.

3. **¿Font Titillium Web vs Geist?**
   - **Propuesta:** SI, Titillium per brandbook (es la marca real Yuno). Geist se queda solo en ss-deck (sin tocar).

4. **¿Datos hardcoded en el diseño vs paramétricos en mi skill?**
   - Diseño tiene team hardcoded (Rasheed + Mauricio), customer logos hardcoded (15 brands), stats Yuno hardcoded (1000+ métodos, etc.)
   - **Propuesta:** mantener los stats Yuno + customer logos como copy del slide (no inputs); team data hardcoded a Rasheed + Mauricio por default pero override-able via `attendees` (lo que ya tenemos).

5. **¿4 customer slides individuales o sigo con 2 multi-customer?**
   - Diseño: 4 slides (inDrive/Rappi/Livelo/McDonald's), cada uno con grid 4-stats + quote + side card.
   - **Propuesta:** SI, 4 slides — la copy ya la sacaste de y.uno/success-cases.

6. **¿Tweak panel (live KPI editing) del diseño?**
   - Diseño tiene panel con inputs para editar Coppel KPIs en vivo. Es útil para iterar diseño pero no para producción (el cliente no debería editar el deck).
   - **Propuesta:** NO incluir en el frontend prod — los inputs vienen del edge fn al crearse. El diseño lo tiene para iterar el HTML standalone.

## Out of scope

- PDF endpoint del bridge — ya funciona, no cambia.
- Skill SKILL.md — solo update menor para reflejar el nuevo math (campos `take_rate_pct`, etc.).
- Migration 145 schema — el JSONB `business_case` puede acomodar el nuevo shape sin migration, solo el código del edge fn cambia.

## Time estimate

- Fase A: 1.5h
- Fase B: 1h
- Fase C: 3.5h (4 personas en paralelo seria <1h)
- Fase D: 30min
- **Total: ~6.5h** secuencial
