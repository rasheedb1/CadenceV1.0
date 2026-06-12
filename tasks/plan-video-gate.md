# Plan — `chief.yuno.tools/video` con email gate

Crear una URL pública en `chief.yuno.tools/video` que pida correo y al ingresar muestre el video de YouTube `F5ABZ_1lujo`. Cuando alguien lo abre, se envía Gmail a **rasheed@y.uno** con quién, IP y ubicación.

## Decisiones

- **URL**: `/video` (path fijo, sin slug — un solo video hardcoded)
- **YouTube ID**: `F5ABZ_1lujo` (https://www.youtube.com/watch?v=F5ABZ_1lujo)
- **Email gate**: cualquier email válido (no se bloquean gmail/hotmail)
- **Notificación**: Gmail a `rasheed@y.uno` (hardcoded; cambiar el destinatario después = 1 línea en el edge function)
- **Storage**: nueva tabla mínima `video_views` (NO reusar `presentations` — esa infra es BC-céntrica con client_name, locale, AE binding)
- **Persistencia local**: `localStorage` skipea el modal en visitas siguientes (mismo patrón que BC gate)

## Phase 1 — Backend

- [ ] **Migración** SQL aplicada vía Management API:
  - Tabla `video_views`: `id uuid pk default gen_random_uuid()`, `viewer_email text not null`, `viewer_ip text`, `viewer_country text`, `viewer_region text`, `viewer_city text`, `viewer_user_agent text`, `notification_status text default 'pending'`, `notification_error text`, `created_at timestamptz default now()`
  - Index en `(created_at desc)` para queries de log
  - RLS habilitado, sin políticas (solo service role escribe/lee — replica patrón mínimo de `presentation_views`)
- [ ] **Edge function** `supabase/functions/track-video-view/index.ts`
  - POST público (`--no-verify-jwt`), body `{viewer_email}`, sin slug
  - Valida con `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/`
  - Extrae IP + UA + geolocaliza con ip-api.com (helpers tomados de `track-presentation-view`)
  - INSERT en `video_views` → captura id como `session_id`
  - Dispara async (no bloquea response): Gmail self-note a `rasheed@y.uno` con `getGmailTokenByEmail(supabase, 'rasheed@y.uno')` + `sendGmailMessage` (shared helpers existentes)
  - Subject: `Alguien acaba de ver tu video`, HTML con email/IP/ubicación/UA + CTA a `https://chief.yuno.tools/video`
  - Response: `{session_id}` — mismo contrato que track-presentation-view
- [ ] `supabase functions deploy track-video-view --no-verify-jwt --project-ref arupeqczrxmfkcbjwyad`
- [ ] Aplicar migración vía Management API (`curl` con `SUPABASE_ACCESS_TOKEN`)

## Phase 2 — Frontend

- [ ] **`src/pages/VideoGate.tsx`** componente standalone (sin MainLayout)
  - `useEffect` lee `localStorage.video_viewer_email` → si existe, salta modal y muestra iframe
  - Modal: input `type=email` + botón "Ver video" + error inline + estado loading
  - Submit: `fetch(VITE_SUPABASE_URL + '/functions/v1/track-video-view', { method:'POST', headers:{ apikey: ANON, 'Content-Type':'application/json' }, body: JSON.stringify({viewer_email:email}) })` → on 200: guarda en localStorage + cierra modal + muestra iframe
  - Iframe: `<iframe src="https://www.youtube.com/embed/F5ABZ_1lujo?autoplay=1&rel=0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen />`, contenedor `aspect-video` Tailwind, max-width centrado
  - Styling: dark Yuno-like (fondo `#06070B`, acento `#E0ED80`, fuente Titillium Web — ya cargada por el resto de decks)
- [ ] **`src/App.tsx`**: agregar
  ```tsx
  const VideoGate = lazy(() => import('@/pages/VideoGate'))
  <Route path="/video" element={<Suspense fallback={null}><VideoGate /></Suspense>} />
  ```
  Posición: junto a las otras rutas públicas (`/m/:slug`, `/workshop/:slug`), ANTES del bloque `<Route element={<MainLayout />}>`

## Phase 3 — Verify

- [ ] `npm run dev` → `localhost:5173/video`
  - [ ] Sin localStorage: modal aparece. Email vacío/inválido → error inline. Email válido → modal cierra → iframe carga → video reproduce
  - [ ] Refresh con localStorage hit → no modal, iframe directo
  - [ ] DB: `select viewer_email, viewer_country, viewer_city, notification_status, created_at from video_views order by created_at desc limit 5`
  - [ ] Inbox rasheed@y.uno: llegó "Alguien acaba de ver tu video"
- [ ] `git push origin main` → Railway auto-deploy a `chief.yuno.tools` (NUNCA Vercel — ver memory `feedback_deploy_railway_only`)
- [ ] Smoke prod: abrir `https://chief.yuno.tools/video` desde device limpio

## Cosas que NO voy a hacer

- ❌ Sistema de slugs reusable (user pidió un solo video hardcoded)
- ❌ Reusar `presentations` table (overkill para esto)
- ❌ Bloquear dominios de email
- ❌ UI admin para ver el log — query SQL directo es suficiente
- ❌ Trilingual — copy en español

## Review (post-implementación)

_Pendiente._
