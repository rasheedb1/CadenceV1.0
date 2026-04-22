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

// Proxy /bc/:slug → presentation-render edge function (keeps URL clean on chief.yuno.tools)
app.get('/bc/:slug', async (req, res) => {
  const slug = req.params.slug
  if (!/^[a-z0-9-]{3,64}$/i.test(slug)) {
    return res.status(400).type('text/plain').send('Invalid slug format')
  }
  try {
    const resp = await fetch(`${RENDER_FN_URL}?slug=${encodeURIComponent(slug)}`, {
      headers: {
        'User-Agent': 'chief-frontend/1.0',
      },
    })
    const body = await resp.text()
    res.status(resp.status)
    res.set('Content-Type', resp.headers.get('content-type') || 'text/html; charset=utf-8')
    res.set('Cache-Control', resp.headers.get('cache-control') || 'public, max-age=60')
    res.send(body)
  } catch (err) {
    console.error('Proxy error:', err)
    res.status(502).type('text/plain').send('Upstream unavailable')
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
