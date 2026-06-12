// Frontend server (Railway): serves the Vite build + proxies /bc/:slug and
// /sdr-bc/:slug to their respective edge functions on Supabase. Node 22+
// (built-in fetch).

import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, 'dist')
const PORT = Number(process.env.PORT) || 3000

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://arupeqczrxmfkcbjwyad.supabase.co'
const RENDER_FN_URL = `${SUPABASE_URL}/functions/v1/presentation-render`
const SDR_BC_RENDER_FN_URL = `${SUPABASE_URL}/functions/v1/sdr-bc-render`
const YUNO_OC_RENDER_FN_URL = `${SUPABASE_URL}/functions/v1/yuno-one-click-render`

const app = express()
app.disable('x-powered-by')

const BC_PROXY_TIMEOUT_MS = 20_000

// Slug shape emitted by presentation-create / sdr-bc-generate: slugify()-<6char>.
// Min 8 chars. Reused for both BC families.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{6,63}$/

function proxyToRenderFn(req, res, upstreamUrl, label) {
  const slug = req.params.slug
  if (!SLUG_RE.test(slug)) {
    return res.status(400).type('text/plain').send('Invalid slug format')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BC_PROXY_TIMEOUT_MS)
  // Forward the original request's query params (e.g. ?print=<HMAC>) — only `slug`
  // gets injected/overridden because it comes from the path, not the query.
  const upstreamQs = new URLSearchParams(req.query)
  upstreamQs.set('slug', slug)
  return fetch(`${upstreamUrl}?${upstreamQs.toString()}`, {
    headers: { 'User-Agent': 'chief-frontend/1.0' },
    signal: controller.signal,
  })
    .then(async (resp) => {
      const body = await resp.text()
      res.status(resp.status)
      // Render endpoints always return HTML (ok / not-found / expired / error pages).
      // Hardcode instead of forwarding upstream's header — pass-through was landing as
      // text/plain at the Railway edge, which combined with nosniff shows deck source.
      res.type('text/html; charset=utf-8')
      res.set('Cache-Control', resp.headers.get('cache-control') || 'public, max-age=60')
      res.set('X-Content-Type-Options', 'nosniff')
      res.send(body)
    })
    .catch((err) => {
      if (err && err.name === 'AbortError') {
        return res.status(504).type('text/plain').send('Deck render timed out')
      }
      console.error(`${label} proxy error:`, err && err.message ? err.message : String(err))
      res.status(502).type('text/plain').send('Upstream unavailable')
    })
    .finally(() => clearTimeout(timer))
}

// Proxy /bc/:slug → presentation-render edge function. Keeps chief.yuno.tools/bc/<slug>
// as the user-visible URL instead of exposing the Supabase functions URL.
app.get('/bc/:slug', (req, res) => proxyToRenderFn(req, res, RENDER_FN_URL, 'BC'))

// Proxy /sdr-bc/:slug → sdr-bc-render edge function (SDR Business Case).
// Render endpoint ships in the APMs-slide phase; until then this proxies through
// and the upstream returns a stub.
app.get('/sdr-bc/:slug', (req, res) => proxyToRenderFn(req, res, SDR_BC_RENDER_FN_URL, 'SDR-BC'))

// Proxy /one-click/:slug → yuno-one-click-render edge function (Yuno One-Click product deck).
// kind='yuno_one_click' rows in presentations table. Per-merchant deck rendered server-side.
app.get('/one-click/:slug', (req, res) => proxyToRenderFn(req, res, YUNO_OC_RENDER_FN_URL, 'YUNO-OC'))

// One-shot static deck: Yuno × Yape partnership business case.
// Lives at public/yape.html. No DB, no slug, no email gate.
app.get('/yape', (_req, res) => res.sendFile(path.join(DIST, 'yape.html')))

// Static assets (Vite build output + anything in public/)
app.use(express.static(DIST, {
  index: false,
  maxAge: '1h',
  etag: true,
}))

// SPA fallback: every other route serves index.html so React Router handles it client-side
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Frontend listening on :${PORT}`)
  console.log(`BC render proxy:     /bc/:slug         → ${RENDER_FN_URL}`)
  console.log(`SDR-BC render proxy: /sdr-bc/:slug     → ${SDR_BC_RENDER_FN_URL}`)
  console.log(`Yuno OC render proxy: /one-click/:slug → ${YUNO_OC_RENDER_FN_URL}`)
})
