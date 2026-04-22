// Frontend server (Railway): serves the Vite build + proxies /bc/:slug to the
// presentation-render edge function on Supabase. Node 22+ (built-in fetch).

import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, 'dist')
const PORT = Number(process.env.PORT) || 3000

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://arupeqczrxmfkcbjwyad.supabase.co'
const RENDER_FN_URL = `${SUPABASE_URL}/functions/v1/presentation-render`

const app = express()
app.disable('x-powered-by')

// Proxy /bc/:slug → presentation-render edge function. Keeps chief.yuno.tools/bc/<slug>
// as the user-visible URL instead of exposing the Supabase functions URL.
const BC_PROXY_TIMEOUT_MS = 20_000
app.get('/bc/:slug', async (req, res) => {
  const slug = req.params.slug
  // Match the real slug shape emitted by presentation-create: slugify()-<6char>. Min 8 chars.
  if (!/^[a-z0-9][a-z0-9-]{6,63}$/.test(slug)) {
    return res.status(400).type('text/plain').send('Invalid slug format')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BC_PROXY_TIMEOUT_MS)
  try {
    const resp = await fetch(`${RENDER_FN_URL}?slug=${encodeURIComponent(slug)}`, {
      headers: { 'User-Agent': 'chief-frontend/1.0' },
      signal: controller.signal,
    })
    const body = await resp.text()
    res.status(resp.status)
    res.set('Content-Type', resp.headers.get('content-type') || 'text/html; charset=utf-8')
    res.set('Cache-Control', resp.headers.get('cache-control') || 'public, max-age=60')
    res.set('X-Content-Type-Options', 'nosniff')
    res.send(body)
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return res.status(504).type('text/plain').send('Deck render timed out')
    }
    console.error('Proxy error:', err && err.message ? err.message : String(err))
    res.status(502).type('text/plain').send('Upstream unavailable')
  } finally {
    clearTimeout(timer)
  }
})

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
  console.log(`BC render proxy: /bc/:slug → ${RENDER_FN_URL}`)
})
