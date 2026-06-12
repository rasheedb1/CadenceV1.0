# BC Tracking + Per-Slide Analytics + Email Notifications

**Goal:** Track who opens each Yuno BC, notify the AE who created it on every open, and add a per-slide dwell-time dashboard in `/presentaciones`.

**Decisions captured from user (2026-04-28):**
- **Email provider: Gmail self-note** — la edge function usa el token de Gmail del AE (de `ae_integrations`) y manda from=AE → to=AE. Cada AE recibe en su propio inbox.
- **Email gate: solo email** (mínima fricción)
- **Notificación en cada apertura, sin dedup** — cada visita dispara un email (incluye refreshes)
- **Geolocalización IP automática** vía `ip-api.com` server-side (sin pedir nada al viewer)
- **Modal con colores Yuno**: fondo `#06070B`, gradiente `#1A1F35→#06070B`, púrpura `#3E4FE0`, acento `#E0ED80`, font Titillium Web
- Per-slide dwell-time dashboard en `/presentaciones`
- Resend descartado (key en Secrets queda muerta — rotar/borrar después)

---

## Phase 1 — Schema & migrations

- [ ] Migration `100_presentation_tracking.sql`:
  - [ ] `presentation_views` table — id, presentation_id (FK), slug, viewer_email, viewer_ip, viewer_user_agent, viewer_city, viewer_country, viewer_region, session_id (uuid), viewed_at
  - [ ] No dedup — every visit is logged AND triggers a notification email
  - [ ] `presentation_slide_views` table — id, session_id, slide_index, dwell_ms, recorded_at
  - [ ] RLS: AE can read views of presentations they created OR same org; service role full access for tracking endpoints
- [ ] Push via Supabase Management API

## Phase 2 — Tracking edge functions

- [ ] `track-presentation-view` (new, public, `--no-verify-jwt`)
  - [ ] POST `{slug, viewer_email}` → returns `{session_id, presentation_id}`
  - [ ] Validate slug exists in `presentations`, not archived/expired
  - [ ] Capture IP from `x-forwarded-for`, user-agent from headers
  - [ ] Geolocate IP via `https://ip-api.com/json/<ip>?fields=status,country,regionName,city` (free, no key, server-side, ~45 req/min limit)
  - [ ] Insert into `presentation_views` with city/region/country
  - [ ] Always dispatch notification email (no dedup)
  - [ ] Return `session_id` so frontend can attach slide tracking to it
- [ ] `track-presentation-slide` (new, public, `--no-verify-jwt`)
  - [ ] POST `{session_id, slide_index, dwell_ms}` (batchable array)
  - [ ] Upsert into `presentation_slide_views` (sum dwell_ms if same session+slide)
  - [ ] Accept `sendBeacon` payloads (text/plain JSON)
- [ ] Shared helper `_shared/gmail.ts` (extracted from existing `send-email`):
  - [ ] `getValidGmailToken(supabase, userId, orgId)` — devuelve `{ token, email }` o `null` si no hay integración; refresca si expira < 2 min
  - [ ] `refreshAccessToken(refreshToken)` — refresh token via Google OAuth
  - [ ] `buildRfc2822({ to, from, subject, html })` — RFC 2822 builder (sin tracking pixel ni leadId, versión simple)
  - [ ] `sendGmailMessage({ token, raw })` — POST a `gmail.googleapis.com/.../messages/send`
  - [ ] (`send-email` se refactoriza para usar este helper en PR separada — no ahora)
- [ ] Notification sender (helper, called from `track-presentation-view`):
  - [ ] `getValidGmailToken(supabase, presentations.created_by, presentations.org_id)`
  - [ ] Si no hay integración → log warning, NO bloquear el insert de la view (return temprano)
  - [ ] Compose Gmail message (self-note):
    - From: `gmailAuth.email`
    - To: `gmailAuth.email` (same)
    - Subject: `📬 {viewer_email} abrió el BC de {client_name}`
    - HTML body: viewer email + ciudad/país + IP + timestamp + link al deck + link a `chief.yuno.tools/presentaciones`
  - [ ] Dispatch via Gmail API
  - [ ] Errores loguean pero nunca bloquean el insert de la view

## Phase 3 — BC page email gate + slide tracking

Modify `supabase/functions/presentation-render/index.ts` template:

- [ ] Email gate modal injected into HTML (Yuno-branded):
  - [ ] Fullscreen overlay con gradiente `radial-gradient(ellipse at 50% 0%, #1A1F35 0%, #06070B 60%)`
  - [ ] Card central (max-width 480px): logo Yuno (mismo SVG del favicon, fill `#3E4FE0`), eyebrow "PROPUESTA DE NEGOCIO" en `rgba(140,153,255,0.9)`, título "Bienvenido al business case de {client_name}", subtítulo "Compártenos tu correo para continuar"
  - [ ] Input email (font Titillium Web, fondo `rgba(255,255,255,0.04)`, border `rgba(255,255,255,0.12)`, focus border `#3E4FE0`)
  - [ ] Botón "Continuar" en `#E0ED80` con texto `#06070B`
  - [ ] On load, check `localStorage.bc_viewer_email_<slug>`
  - [ ] If missing → modal bloqueante hasta que envíen email
  - [ ] Validate email format (regex), no existence check
  - [ ] On submit → call `track-presentation-view`, persist email + session_id, fade out modal
  - [ ] If already stored → call `track-presentation-view` silently con email guardado, no mostrar modal, store new session_id
- [ ] Slide tracking client logic:
  - [ ] Hook into the deck's slide-change event (verify the lib used in the template)
  - [ ] Track active `slide_index` + dwell timer
  - [ ] Heartbeat every 10s while page is visible (Page Visibility API)
  - [ ] On slide change / `pagehide` / `visibilitychange→hidden` → flush dwell via `navigator.sendBeacon`
  - [ ] Pause timer when tab is hidden

## Phase 4 — AE-facing dashboard in `/presentaciones`

- [ ] Update `src/pages/Presentaciones.tsx` cards:
  - [ ] Show: `{view_count} aperturas · {unique_emails} emails únicos · última: {relative time}`
  - [ ] TanStack Query aggregating `presentation_views` per presentation_id
- [ ] New detail modal on card click:
  - [ ] **Tab "Visitas"** — table: email · primera vez · última · # aperturas · IP · país
  - [ ] **Tab "Engagement por slide"** — recharts bar chart of avg dwell_ms per slide
  - [ ] **Tab "Sesiones"** — list of sessions with slide-by-slide timeline
- [ ] Aggregated query for cards; lazy-load detail only on modal open

## Phase 5 — Verification

- [ ] Confirm yuno-bc skill passes `createdBy: <user_uuid>` to `presentation-create` (verify, fix if not)
- [ ] Manual E2E:
  - [ ] Create test BC → `created_by` populated
  - [ ] Open `/bc/<slug>` incognito → modal shows, enter email, deck renders
  - [ ] Verify `presentation_views` row + notification arrives
  - [ ] Re-open same slug same IP → view AND email both fire again (no dedup)
  - [ ] Switch slides → `presentation_slide_views` accumulates
  - [ ] `/presentaciones` shows view count + per-slide chart

## Phase 6 — Deploy

- [ ] `SUPABASE_ACCESS_TOKEN=... npx supabase functions deploy track-presentation-view --no-verify-jwt --project-ref arupeqczrxmfkcbjwyad`
- [ ] Same for `track-presentation-slide` and updated `presentation-render`
- [ ] `npx vercel --prod --yes --token=... --name chief.ai --scope team_wkauOukILE7VaSS4M7dDapQG`
- [ ] Smoke test in prod with real BC

---

## Final blockers before coding

1. **Confirmación: AE sin Gmail conectado → sin notificación.** Si un AE crea un BC pero nunca completó el OAuth de Google unificado, no le llega nada (solo log warning). ¿OK con esto, o querés un fallback (e.g. correo a `rasheed@y.uno` como super-admin)?
2. **Carpeta "Enviados" del AE** — el correo aparece en su carpeta Sent porque viene de su propia cuenta. Ya lo mencioné, solo confirmo que lo entendiste y aceptas.
3. **Resend key** — la subí a Secrets pero no se va a usar. ¿La borro de Supabase y la rotás en Resend, o la dejamos como fallback futuro?
