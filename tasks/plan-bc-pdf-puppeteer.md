# Plan — BC "Download PDF" via server-side Puppeteer

## Problema

El botón **DOWNLOAD PDF** en la última slide del business case (chief.yuno.tools/bc/<slug>) hoy llama `window.print()`. Resultado: PDF roto — títulos cortados ("Payments as" sin terminar), fondos en blanco, números en `$0` porque imprime antes de que React monte, márgenes equivocados porque Chrome reescala 1920px → Letter/A4.

## Solución

Generar el PDF server-side con Chromium headless en el `Twilio_Bridge_Chief` (Railway). Mismo HTML que se ve en pantalla, esperamos a que React + fonts terminen, output a 1920×1080 exactos.

---

## Tasks

### 1. Edge function `presentation-render` — preparar el HTML para captura

- [ ] Añadir `window.__bcReady = false` antes de los `slideBuilders.forEach(...)` en el template
- [ ] Después del último `ReactDOM.createRoot().render(...)`, esperar `requestAnimationFrame × 2` + `document.fonts.ready`, luego `window.__bcReady = true`
- [ ] Aceptar `?print=<token>` en el querystring:
  - Token = `HMAC-SHA256(slug, BC_PRINT_SECRET)` (hex, primeros 16 chars)
  - Token válido → ocultar el `bc-gate`, saltar tracking de view/dwell, mostrar la deck inmediato
  - Token inválido o ausente → comportamiento actual (gate + tracking)
- [ ] Inyectar `slug` en `BC_DEFAULTS` para que el botón pueda construir su URL
- [ ] Añadir env var `BC_PRINT_SECRET` al edge function

**Archivo:** `supabase/functions/presentation-render/index.ts`

### 2. Endpoint `/api/bc/:slug/pdf` en el bridge

- [ ] `GET /api/bc/:slug/pdf` en `openclaw/bridge/server.js`:
  - Validar slug en `presentations` (no archived, no expired) → si no, 404
  - `token = HMAC-SHA256(slug, BC_PRINT_SECRET)` hex 16 chars
  - Lanzar (o reusar) browser Puppeteer
  - `page.goto('https://chief.yuno.tools/bc/<slug>?print=<token>', { waitUntil: 'networkidle0' })`
  - `page.waitForFunction('window.__bcReady === true', { timeout: 30000 })`
  - `page.pdf({ width: 1920, height: 1080, printBackground: true, preferCSSPageSize: true })`
  - Devolver `application/pdf` con `Content-Disposition: attachment; filename="<client>-business-case.pdf"`
- [ ] Cachear browser en variable global (cold-start ~3-5s, lo pagamos una vez)
- [ ] Cleanup: `page.close()` siempre en `finally`
- [ ] Logging: slug, ms totales, success/error (sin PII)

### 3. Dependencias del bridge

- [ ] `npm install puppeteer-core @sparticuz/chromium` en `openclaw/bridge/package.json`
  - `@sparticuz/chromium` = build slim de Chromium para containers Linux (~50MB vs ~170MB)
  - `puppeteer-core` no descarga Chromium propio; usa el que le pasemos
- [ ] Actualizar `openclaw/bridge/Dockerfile`:
  - Apt-install: `libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2`

### 4. Frontend — botón

- [ ] `public/bc-assets/bc-slides-02.jsx` (BCSlide24, línea ~497):
  - Reemplazar `<button onClick={() => window.print()}>` por
    `<a href={\`https://bridge.yuno.tools/api/bc/${data.slug}/pdf\`} download>download PDF</a>`
  - Exponer `slug` desde `BC_DEFAULTS.slug` en `computeData()`
- [ ] Mismo cambio en `public/bc-assets/bc-slides-es-02.jsx`

### 5. Env vars

- [ ] Generar `BC_PRINT_SECRET` (32 bytes hex)
- [ ] Setear en:
  - Supabase: `npx supabase secrets set BC_PRINT_SECRET=...`
  - Railway service `Twilio_Bridge_Chief`

### 6. Deploy + verificación

- [ ] `git push origin main` → auto-deploy FrontEndChief + Twilio_Bridge_Chief
- [ ] `supabase functions deploy presentation-render --no-verify-jwt --project-ref arupeqczrxmfkcbjwyad`
- [ ] `curl https://bridge.yuno.tools/api/bc/<slug-real>/pdf -o test.pdf` → abrir y validar:
  - 18 páginas a 1920×1080
  - Fondos / gradientes / dot pattern visibles
  - Números reales (no `$0`)
  - Todos los textos completos
- [ ] Probar el botón en chief.yuno.tools/bc/<slug-real> en Chrome + Safari
- [ ] Slug inexistente / expirado → 404 limpio
- [ ] Sin `?print=<token>` el gate sigue activo (no rompimos el gate)

---

## Riesgos / decisiones

- **Tamaño del image bridge:** `@sparticuz/chromium` suma ~80MB. OK (Railway permite 8GB).
- **Cold start:** primer PDF ~3-5s. Browser cacheado → PDFs siguientes <5s totales.
- **Concurrencia:** un browser, una page por request. Si hay >5 PDFs simultáneos podemos hacer pool — no V1.
- **Email gate:** bypass key (`?print=<HMAC>`) sólo la conoce el bridge. No se puede saltar manualmente.
- **Tracking de views:** skipped en print mode — el AE no quiere ver views falsos cada vez que se descarga el PDF.

## Archivos a tocar

- `supabase/functions/presentation-render/index.ts`
- `openclaw/bridge/server.js`
- `openclaw/bridge/package.json`
- `openclaw/bridge/Dockerfile`
- `public/bc-assets/bc-slides-02.jsx`
- `public/bc-assets/bc-slides-es-02.jsx`

## Estimado

~1.5h código + 30min deploy/testing.
