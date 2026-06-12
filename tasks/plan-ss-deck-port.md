# Plan: Port Stripe Sessions deck to Chief (`/m/<slug>`)

## Goal
Copiar el deck de 21 slides de `yuno-sales-pitch-maker` a Chief **tal cual** — mismas transiciones, mismos estilos, mismas fuentes — como módulo **totalmente aparte** de `/yuno-bc` y `/sdr-bc`. URL final: `chief.yuno.tools/m/<slug>`. Skill nueva `/ss-deck <Company>` que genera el row en DB y devuelve el link.

## Non-goals (lo que NO tocamos)
- `presentation-render`, `sdr-bc-render`, `bridge/api/bc/:slug/pdf` (siguen sirviendo BCs actuales)
- Tabla `presentations` (los SS-decks viven en tabla propia `merchants_ss`)
- Diseño Tailwind/shadcn de Chief (los slides usan inline styles puros — los dejamos así para preservar fidelidad)
- yuno-bc + sdr-bc skills (siguen funcionando intactas)

## Architecture decisions
1. **Stack mismatch (inline styles vs Tailwind)**: el repo usa `const styles = {...}` JSX puro. Chief usa Tailwind v4 + shadcn. Para preservar "mismo todo" → **portamos los slides como JSX puro sin reescribir a Tailwind**. Viven en una carpeta aislada `src/ss-deck/` que no comparte componentes con el resto.
2. **Frontend isolation**: nueva ruta `/m/:slug` montada en `App.tsx`. Lazy-loaded para no inflar el bundle principal. El layout chief (sidebar, etc.) NO se renderiza en esta ruta — es full-bleed como el original.
3. **Tabla propia, no `presentations`**: schema idéntico al repo (`merchants_ss`) — pain_titles, psps, missing_methods, capability_titles/descs, capabilities_live. Razón: el shape de datos es muy distinto al de BC (que es un slide-tree con `kind`); meter SS-decks en `presentations.kind='ss'` forzaría un payload jsonb opaco y rompería la simetría con el repo upstream (haría futuras syncs imposibles).
4. **Org-scoping**: agregar `org_id` a `merchants_ss` (Chief es multi-tenant; el repo upstream no). RLS por org_id como el resto.
5. **PDF**: extender `bridge.yuno.tools` con `/api/m/:slug/pdf` que apunta a `chief.yuno.tools/m/:slug/pdf` (modo print). Reusa la instancia de Puppeteer + HMAC bypass que ya existe para BCs. **No portamos** el Express del repo.
6. **Assets**: copiar `public/` del repo a `public/ss-deck/` en Chief (logos, banks.csv, merchants.csv, world-map.svg, team photos, embellishments). Paths relativos en los slides se prefijan con `/ss-deck/`.
7. **Generación**: skill `/ss-deck <Company>` invoca edge function `ss-deck-generate` que (a) resuelve dominio (reusa `_shared/resolve-company-domain.ts` ya existente), (b) llama `chief-deep-research-company` para PSPs/métodos, (c) normaliza con `NON_PSP_PATTERNS`, (d) upsert en `merchants_ss`, (e) devuelve URL. Sin LLM extra de copywriting en v1 — usa fallback `_default.json` con `[merchant]` placeholders para PAIN_*/CAPABILITY_*. v2 puede reemplazar copywriting con Claude llamando los prompts del repo.

## Phase 1 — Backend (tabla + edge function)

- [ ] **Migration**: `supabase/migrations/<NNN>_create_merchants_ss.sql`
  - Mirror de `001_create_merchants.sql` del repo + `org_id uuid not null references organizations(id)` + RLS por org_id (no public read como el repo — los decks son por-org).
  - Trigger `set_updated_at` (ya existe en Chief, reusar).
  - Index `(org_id, slug)` UNIQUE.
- [ ] **Edge function `ss-deck-generate`** (`supabase/functions/ss-deck-generate/index.ts`)
  - Input: `{ company_name, org_id }`.
  - Steps:
    1. `resolve-company-domain` (compartido) → primary domain.
    2. `chief-deep-research-company` → research markdown.
    3. Extract PSPs + missing methods via Claude (puerto de `scripts/research-psps.mjs` lógica, inline en TS, sin escribir archivos).
    4. Normalizar con `NON_PSP_PATTERNS` (puerto de las regex del repo).
    5. Upsert `merchants_ss` con slug + content.
    6. Return `{ url: 'https://chief.yuno.tools/m/<slug>' }`.
  - **NO** generar copywriting de pains/capabilities en v1 — usar `_default.json` shape con `{COMPANY_NAME}` interpolation.
- [ ] **Helper `_shared/non-psp-patterns.ts`**: porta las regex de `scripts/research-psps.mjs` para reuso.

## Phase 2 — Frontend (slides + router)

- [ ] **Copiar slides as-is**: `src/ss-deck/components/` ← repo `src/components/`
  - 21 slides + SlideBase, SlideViewer, PrintViewer, LandingPage (este último NO se monta — solo lo referencian las slides como import). BeamRule, CircuitAmbient, OrbBackground, CoverFX.
  - Mantener `.jsx` (no convertir a `.tsx`) para minimizar diff con upstream y permitir sync futura.
  - `src/ss-deck/lib/` ← `theme.jsx`, `psps.js`. **Reescribir `supabase.js`** para usar el supabase client ya existente de Chief (`src/integrations/supabase/client.ts`) y leer de `merchants_ss` filtrado por org_id activo.
  - `src/ss-deck/data/` ← `_default.json`, `banking.js`, `partners.js`, `email-template.js`. NO copiar `*.generated.js` aún (depende de assets).
- [ ] **Assets**: `public/ss-deck/` ← repo `public/` (todo, ~30MB de logos + world map + team photos). Audit con `du -sh` antes de commit para confirmar tamaño.
- [ ] **Fonts**: Geist Variable + Geist Mono. Verificar si Chief ya los carga (memory dice "Geist" — ver `index.css`). Si no, agregar via `@fontsource-variable/geist`.
- [ ] **Router**: agregar a `App.tsx`:
  - `<Route path="/m/:slug" element={<SSDeckViewer />} />` — sin layout chief, lazy import.
  - `<Route path="/m/:slug/pdf" element={<SSDeckPrint />} />` — para Puppeteer.
- [ ] **SSDeckViewer.tsx** wrapper: lee `:slug` de params, llama `fetchMerchantContent(slug, orgId)`, monta `<SlideViewer data={...} />`.
- [ ] **Auth gate**: los `/m/<slug>` deben ser públicos (igual que `/bc/<slug>`) para compartir link con merchants. Verificar AuthContext no redirige al login en estas rutas (BC routes ya manejan esto — copiar patrón).

## Phase 3 — Skill + PDF

- [ ] **Skill `/ss-deck`**: `.claude/skills/ss-deck/SKILL.md`
  - Pattern: usuario tipea `/ss-deck Discord` → skill llama `ss-deck-generate` → devuelve URL.
  - Idéntico shape a `/yuno-bc` y `/sdr-bc` (consistencia).
- [ ] **PDF endpoint**: agregar a Railway bridge `/api/m/:slug/pdf`:
  - Reusa instancia Puppeteer existente del bridge (no creamos nueva).
  - HMAC bypass `?print=<token>` con `BC_PRINT_SECRET` ya configurado.
  - Navega a `https://chief.yuno.tools/m/:slug/pdf` (modo print).

## Phase 4 — Verificación

- [ ] **Smoke test local**: `npm run dev`, navegar a `/m/discord` con seed manual en DB. Verificar:
  - Las 21 slides renderizan
  - Transiciones (fadeInUp, pulse, beam) funcionan
  - Globe + world map cargan assets desde `/ss-deck/`
  - Keyboard nav (← → 1-9) funciona
- [ ] **Generate test**: `curl POST ss-deck-generate {company_name:"Discord", org_id:"..."}` → confirmar row en `merchants_ss`, abrir URL.
- [ ] **PDF test**: `curl bridge.yuno.tools/api/m/discord/pdf?print=...` → descarga PDF 18 páginas, verificar render.
- [ ] **No-regression**: abrir `/bc/<slug-existente>` y `/sdr-bc/<slug>` — confirmar que siguen sirviendo correctamente.

## Open questions (decidir antes de Phase 2)

1. **Pulir copywriting con LLM en v1 o v2?** El repo upstream tiene ~40 scripts de research + Claude para generar pains/capabilities. Sin esto, los decks generados tienen placeholders `[merchant]`. Recomiendo **v2** — primero validar que el visual rinde, después automatizar copy.
2. **Banking + Partner modes**: el repo soporta 3 modos (merchant, banking, partner). ¿Los portamos los 3 o solo merchant en v1? Recomiendo **solo merchant en v1**; banking/partner son verticals específicos de Yuno que requieren contenido curado.
3. **Quién puede generar?** ¿Todos los users con org de Yuno, o solo roles Admin? Por consistencia con yuno-bc → todos.

## Estimación
- Phase 1: 2-3h (migration + edge function + helper)
- Phase 2: 3-4h (copy + assets + router + auth gate) — la mayor parte es plumbing, no código nuevo
- Phase 3: 1-2h (skill + PDF endpoint)
- Phase 4: 1h (smoke tests)
- **Total: ~8-10h** para v1 funcional con copywriting placeholder

## Riesgos
- **Bundle size**: 11.6k LOC de slides + ~30MB de assets. Lazy-load del route + asset audit obligatorio antes de merge.
- **Font conflict**: si Chief ya carga otra versión de Geist, podría haber doble-fetch. Verificar.
- **Auth context**: si AuthContext fuerza redirect al login, romper para `/m/*` igual que se hizo para `/bc/*`.
- **Inline styles + dark mode**: los slides asumen `background: #000`. Si Chief tiene dark/light toggle global, aislar.

## Reviewable checklist (sec final cuando termine)
- [ ] Migration aplicada en prod
- [ ] Edge function deployada
- [ ] Frontend deployado a Railway (`git push origin main`)
- [ ] PDF endpoint en bridge funcionando
- [ ] Skill `/ss-deck` documentada en SKILL.md
- [ ] Test E2E pasado con 1 cliente real (no Discord/template)
- [ ] Memory entry creada en `MEMORY.md` con URL pattern + tabla

---

## Review section (post-implementation)
_(llenar cuando termine)_

---

## Review (post-implementation — 2026-05-12)

### Shipped
- [x] Migration 142 applied to prod DB (`merchants_ss` exists)
- [x] `ss-deck-generate` edge function deployed (smoke test returned `{slug, url, ...}` 200 OK with row visible in DB)
- [x] Frontend pushed to Railway (`commit 968f910`), serving `/ss-deck-assets/*` at 200
- [x] Bridge PDF endpoint `/api/m/:slug/pdf` deployed (OPTIONS 204)
- [x] Skill `.claude/skills/ss-deck/SKILL.md` ready
- [x] Memory updated (project_ss_deck.md + MEMORY.md index)

### Deferred / not in v1
- **Per-merchant copywriting** — v2 will wire `chief-deep-research-company` + the ported `_shared/non-psp-patterns.ts` helper to rewrite pains/PSPs/capabilities per merchant. Currently every deck shows the agnostic `_default.json` content with `[merchant]` placeholders rewritten to the company name.
- **Banking + Partner modes** — slide components are ported and the `mode` column exists, but skill ships `merchant` only. Flipping a row to `banking` or `partner` in DB will already render the right slide set.
- **Real visual smoke test (browser)** — curl confirmed HTTP 200 + asset 200, but actually loading the deck in a browser and walking through the 21 slides is still pending. Recommend doing this before sharing any cold link.

### Files
- `supabase/migrations/142_create_merchants_ss.sql`
- `supabase/functions/ss-deck-generate/index.ts`
- `supabase/functions/_shared/non-psp-patterns.ts`
- `src/ss-deck/` (24 files, 11.6k LOC ported verbatim as `.jsx`)
- `public/ss-deck-assets/` (40MB)
- `src/App.tsx` (+ 4 lines for lazy routes)
- `openclaw/bridge/server.js` (+ `/api/m/:slug/pdf`)
- `.claude/skills/ss-deck/SKILL.md`
