# /sdr-bc — Nova-light FULL redesign plan (draft, awaiting approval)

> User direction (2026-05-13): *"modificar mucho el diseño pero no el contenido,
> adaptar [pitch-maker] para una mejor version con las animaciones nuevas;
> slides con contenido igual → reemplazar totalmente (ej. clientes Yuno);
> las demás → adoptar la nueva naturaleza de diseño."*
>
> **Math + copy + edge function untouched.** All changes live in
> `public/sdr-bc-assets/` (styles.css, components.jsx, slides-01-context.jsx,
> slides-02-business-case.jsx). Edge function `sdr-bc-generate` not touched.

---

## Source of truth

Branch `main` of `yuno-payments/yuno-sales-pitch-maker`:
- `src/lib/theme.jsx` — token system (`light` object)
- `src/index.css` — keyframes + `.stagger` + `prefers-reduced-motion`
- `src/components/BeamRule.jsx` — 1px rule + sliding beam
- `src/components/slides/*.jsx` — slide implementations

---

## The new design system (what we're adopting)

### Tokens (port to CSS variables in styles.css)

```css
:root {
  /* Surfaces */
  --bg-canvas: #F8F9FC;          /* slide bg (off-white) */
  --bg-elevated: #FFFFFF;        /* card surface */
  --bg-section: #0F1020;         /* section dividers stay dark */
  /* Ink (opacity scale, not separate greys) */
  --ink-strong: #0F1020;
  --ink: #1E2030;
  --ink-secondary: rgba(30, 32, 48, 0.74);
  --ink-muted: rgba(30, 32, 48, 0.56);
  --ink-faint: rgba(30, 32, 48, 0.36);
  /* Accents — Yuno blue ramp unchanged */
  --accent: #3E4FE0;
  --accent-deep: #1726A6;
  --accent-mid: #5967E4;
  --accent-soft: #7C89EF;
  --accent-pale: #BDC3F6;
  --success: #16A34A;
  /* Card chrome */
  --card-shadow: 0 1px 3px rgba(30, 32, 48, 0.04), 0 8px 24px rgba(30, 32, 48, 0.04);
  --border-subtle: rgba(30, 32, 48, 0.08);
  --border-default: rgba(30, 32, 48, 0.12);
  --border-accent: rgba(62, 79, 224, 0.40);
  /* Gradients (one accent per slide rule) */
  --title-gradient: linear-gradient(135deg, #1726A6 0%, #3E4FE0 100%);
  --beam-base: linear-gradient(90deg, rgba(30,32,48,0.18) 0%, rgba(30,32,48,0) 100%);
  --beam-bright: linear-gradient(90deg, transparent 0%, rgba(62,79,224,0.55) 50%, transparent 100%);
}
```

### Motion primitives (port to styles.css)

| Primitive | Purpose | Pitch-maker source |
|---|---|---|
| `.stagger > *` w/ `:nth-child(1..16)` delays | Auto-stagger child reveals | `index.css` |
| `.reveal` w/ `revealUp` keyframe | Single-element settle-in | `index.css` |
| `<BeamRule />` (component) | Sliding light beam on 1px rules | `BeamRule.jsx` |
| `.border-beam` (CSS + `@property`) | Chasing conic gradient on card borders | `index.css` |
| `slide-enter > *` | Slide entry fade-in cascade | `index.css` |
| `@media (prefers-reduced-motion: reduce)` | A11y kill switch | `index.css` |

### Card recipe (the new default for everything)

```css
.card-nova {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 18px;
  box-shadow: var(--card-shadow);
  padding: clamp(22px, 1.8vw, 36px) clamp(22px, 1.8vw, 34px);
}
.card-nova.is-hero { /* totals / conclusions */ }
.card-nova.is-hero::after { /* border-beam */ }
```

### Typography decision

**Keep Titillium Web** (brand-approved per brandbook 2.2). To get the "Geist
look-and-feel" without swapping fonts:
- Lighter weights for display (300 / 400) instead of (600 / 700)
- `font-variant-numeric: tabular-nums` everywhere there's a number
- Tighter letter-spacing on display (-0.02em → -0.04em)
- Mono kicker labels via `'SF Mono', Menlo, monospace` (system mono, no asset cost)

*(If user later says "go Geist", swap is one `@font-face` block. Not now.)*

---

## Slide-by-slide mapping (27 slides)

Three actions: **REPLACE** (port pitch-maker slide wholesale, swap copy/data),
**REDESIGN** (rebuild in new language, content-specific to /sdr-bc),
**RESKIN** (keep structure, apply new tokens + motion).

| # | Current | Theme today | Action | New build |
|---|---|---|---|---|
| 01 | Cover | gradient | **REPLACE** | Port `SlideCover` light variant — light canvas + masked globe in accent fill + co-brand wordmark + contact card on right |
| 02 | Agenda | light | **REDESIGN** | Numbered list (mono kickers `01 02 03 04`) + `.stagger` + BeamRule under each item; one-column nova-light surface |
| 03 | Section · Context | blue-gradient | **REPLACE** | Section divider pattern: dark `#0F1020` bg + huge display "01 / Context" + BeamRule + chip count of slides in section |
| 04 | Client Stack | light | **REDESIGN** | 3-card row (`.card-nova`) of stack pillars (PSPs, APMs, Risk) + scraped logos as small `<img>` chips; border-beam on currently-active card |
| 05 | Geography | dark world map | **REPLACE** | Port `SlideGlobalPresence` light variant — light canvas, dotted continent map, animated pulse rings at customer offices |
| 06 | Section · Why Yuno | dark | **REPLACE** | Same section divider pattern as #03 — "02 / Why Yuno" |
| 07 | Yuno Overview | light | **REPLACE** | Port `SlideYunoSolve` capability cards — 3D flip cards (icon front, copy back), light surface |
| 08 | Trusted By | light | **REPLACE** ⭐ | Port `SlideTrustedBy` wholesale — 10-tile merchant grid (2×5) + investor strip below, light surface, hover lift (.pedigree-logo pattern) |
| 09 | Section · Business Case | dark | **REPLACE** | Section divider pattern — "03 / Business Case" |
| 10 | Levers Summary | light | **REPLACE** | Port `SlideValueLevers` — 4 lever cards in a row, each w/ icon + stat + mono kicker + body + benchmark strip below |
| 11 | NA Tabs | blue-gradient | **REDESIGN** | Light region nav: 4 region pills horizontal, active one in `--accent` fill + BeamRule under, others in `--surface-1` |
| 12 | NA Cards | light | **REDESIGN** | Light, split layout: 5-row data table (left, 60%) + hero conclusion card (right, 40%) with `.border-beam` on the conclusion |
| 13 | NA APMs | lilac | **REDESIGN** | Light, 5-row APM table + per-country adoption cards strip below |
| 14 | NA Dev | light | **RESKIN** | Apply card-nova + stagger to existing dev-cost layout |
| 15 | LATAM Tabs | blue-gradient | **REDESIGN** | Same as #11, active = LATAM |
| 16 | LATAM Cards | light | **REDESIGN** | Same as #12 |
| 17 | LATAM APMs | lilac | **REDESIGN** | Same as #13 |
| 18 | LATAM Dev | light | **RESKIN** | Same as #14 |
| 19 | EMEA Tabs | blue-gradient | **REDESIGN** | Same as #11, active = EMEA |
| 20 | EMEA Cards | light | **REDESIGN** | Same as #12 |
| 21 | EMEA APMs | lilac | **REDESIGN** | Same as #13 |
| 22 | EMEA Dev | light | **RESKIN** | Same as #14 |
| 23 | APAC Tabs | blue-gradient | **REDESIGN** | Same as #11, active = APAC |
| 24 | APAC Cards | light | **REDESIGN** | Same as #12 |
| 25 | APAC APMs | lilac | **REDESIGN** | Same as #13 |
| 26 | APAC Dev | light | **RESKIN** | Same as #14 |
| 27 | Total + CTA | dark | **REPLACE** | Port `SlideCTA` + `SlideBookDemo` — Yuno Total grand-stat with `--title-gradient` + contact card (Sergio's photo if available) + "Book a Demo" button |

**Tally**
- REPLACE wholesale: **9 slides** (01, 03, 05, 06, 07, 08, 09, 10, 27)
- REDESIGN in new language: **14 slides** (02, 11–13, 15–17, 19–21, 23–25 — all regional except dev)
- RESKIN only: **4 slides** (14, 18, 22, 26 — the dev slides per region)

---

## Build approach

### Stack constraint we must respect

`public/sdr-bc-assets/template.html` uses **React 18 UMD + inline Babel** — no
build pipeline. Pitch-maker uses **Vite + ESM + @phosphor-icons/react + Geist
font asset**. We will NOT introduce a build step (it'd touch
`vite.config.ts`, Railway dockerfile, edge function manifest, etc.).

Adaptation rules:
1. Transcribe slide JSX into the existing `slides-01-context.jsx` /
   `slides-02-business-case.jsx` files (Babel parses these inline)
2. Inline Phosphor SVG icons as raw `<svg>` paths instead of `import { ... }`
3. Replace pitch-maker's `useTheme()` hook with CSS variables (we commit to
   light — no runtime theme switching)
4. Keep React 18 UMD + JSX-style components — no hooks beyond `useState` /
   `useEffect` (already in template.html)
5. `BeamRule` ports as ~30 lines of inline JSX, no external import

### Phased rollout

**Phase 0 — Preview deck (3 slides, ~3h)** ⭐ *do this first, get user buy-in*

Build a standalone preview HTML at `public/sdr-bc-assets/preview.html`:
- Slide 01 (Cover, REPLACED)
- Slide 08 (Trusted By, REPLACED — user's explicit example)
- Slide 16 (LATAM Cards, REDESIGNED — the most important workhorse slide)

User opens preview locally → approves direction → only then proceed to Phase 1.

**Phase 1 — Design system foundation (~2h)**

- Rewrite `styles.css` with new tokens + motion primitives + card recipes
- Add `<BeamRule>` + `<MonoKicker>` + `<StatCard>` + `<NovaSection>` to `components.jsx`
- Add `.border-beam` CSS + `@property --border-beam-angle`
- Add `prefers-reduced-motion` block
- Hardened `[data-pdf-root]` print state

**Phase 2 — REPLACE slides (~5h)**

Port the 9 wholesale slides in this order (small → big risk):
1. Section dividers 03, 06, 09 (same template, just different copy)
2. Cover 01
3. Trust 08
4. Levers 10
5. Yuno Overview 07
6. Geography 05
7. CTA 27

**Phase 3 — REDESIGN slides (~4h)**

Region nav (11/15/19/23), Cards (12/16/20/24), APMs (13/17/21/25), Agenda 02.

**Phase 4 — RESKIN + QA (~2h)**

Dev slides 14/18/22/26, then end-to-end QA on real client (Samsara).

**Phase 5 — Ship (~30min)**

- `git push origin main` → Railway auto-deploys (no edge function deploy needed)
- Verify `chief.yuno.tools/sdr-bc/<slug>` renders
- Verify `bridge.yuno.tools/api/sdr-bc/<slug>/pdf` produces clean 27-page PDF

**Total estimate:** ~16h end-to-end, in 5 phases, with go/no-go gate at Phase 0.

---

## Open questions (need user input before Phase 0)

1. **Preview live or static?** Build `preview.html` as a static file with hardcoded sample data (Samsara) for review, or wire it through the actual edge function? → recommend: static, faster iteration
2. **Font**: confirm we keep Titillium (default), or do you want Geist? → recommend: Titillium now, Geist as a follow-up A/B
3. **Section divider style**: dark `#0F1020` like pitch-maker, or stay on the brand `#282A30` Unity Black? → recommend: `#0F1020` (deeper feels more modern)
4. **Cover globe**: pitch-maker masks a globe PNG over the accent color. Do we have a globe asset, or generate one? → we already have continent dots (`_continentDots` in current code), can reuse
5. **Sergio's photo** on CTA card: file exists somewhere in `public/`? → check before Phase 2

---

## Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Phosphor icons need hand-inlining (5–8 SVGs) | Time | Build a small inline-icon component upfront in Phase 1 |
| `prefers-reduced-motion` breaks PDF capture | PDF blank slides | Already-existing `[data-pdf-root]` rules force final state; extend pattern |
| `.border-beam` uses `@property` which Puppeteer may not support | Beam smears in PDF | Hide `.border-beam::after` in print, same as pitch-maker does |
| Regional slides break with empty data | Render error | Keep the existing `{{TOKEN}}` placeholder fallback pattern |
| Geist font request later | Rework | Phase-1 token file makes font swap one `@font-face` block + one CSS var change |

---

## Definition of done

- [ ] All 27 slides render on light surface with no "dark mode flash"
- [ ] 9 wholesale-replaced slides match pitch-maker visual quality
- [ ] BeamRule animates on section kickers + reduced-motion disables it
- [ ] `.border-beam` chases conclusion cards on slides 12/16/20/24
- [ ] Stagger reveals work on every multi-element slide
- [ ] PDF endpoint produces 27 clean pages, no mid-animation artifacts
- [ ] Real client smoke (Samsara) regenerated end-to-end
- [ ] No regression on edge function (math, tokens, slugs)
