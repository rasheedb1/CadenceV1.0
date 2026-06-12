// yuno-one-click-render
// =============================================================================
// Public endpoint que sirve el deck Yuno (One-Click + Conciliación) para un slug.
// Accessed via Railway express proxy at chief.yuno.tools/one-click/<slug> →
// esta función con ?slug=<slug>.
//
// El template hace referencia a los JSX/CSS en /yuno-one-click-assets/* (served
// by Railway static middleware desde public/yuno-one-click-assets/). El deck
// data se inyecta inline como window.DECK_DEFAULTS.
//
// Estructura de 23 slides (2 productos en 1 deck):
//   01 Cover (dual product) · 02 Agenda
//   ── Bloque Yuno One-Click ──
//   03 Section divider · 04 Friction tax · 05 What is + Shared-token network hero
//   06 UX flow (first-time + returning) · 07 Under the hood · 08 Anchor merchants
//   09 Network-effect math · 10 Cross-merchant scenarios
//   11 4 razones · 12 Per-merchant TPV uplift
//   ── Bloque Yuno Conciliación ──
//   13 Section divider · 14 The reconciliation pain · 15 3 productos en uno
//   16 Conciliación Transaccional · 17 Conciliación Bancaria · 18 Conciliación Standalone
//   19 Métricas deep-dive · 20 Dashboard unificado · 21 Insights accionables
//   22 Impacto per-merchant
//   ── Cierre ──
//   23 CTA
// =============================================================================

import { createSupabaseClient } from '../_shared/supabase.ts'

const CACHE_SECONDS = 60

function html(status: number, body: string, cacheSeconds = CACHE_SECONDS): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': `public, max-age=${cacheSeconds}`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function notFoundPage(slug: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Not found</title>
<style>body{font:14px/1.5 -apple-system,Segoe UI,sans-serif;max-width:680px;margin:60px auto;padding:0 20px;color:#28282E}h1{font-weight:300}</style>
</head><body><h1>Deck no encontrado</h1>
<p>No hay deck de Yuno One-Click para el slug <code>${escapeHtml(slug)}</code>.</p>
<p>Puede haber expirado o no existir.</p>
</body></html>`
}

const DECK_DEFAULTS_TOKEN_OPEN = '/*__DECK_DEFAULTS_OPEN__*/'
const DECK_DEFAULTS_TOKEN_CLOSE = '/*__DECK_DEFAULTS_CLOSE__*/'

// JSX bust: bump this whenever the bundled /yuno-one-click-assets/*.jsx assets change
// so the deck never serves a stale cached file from the Railway edge.
const JSX_VER = '20260520-v8-pdf-button'

const TEMPLATE = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920" />
<title>__CLIENT_NAME__ · Yuno One-Click</title>
<meta name="robots" content="noindex,nofollow" />
<link rel="icon" type="image/png" sizes="32x32" href="/bc-assets/yuno-favicon-32.png" />
<link rel="icon" type="image/png" sizes="256x256" href="/bc-assets/yuno-favicon.png" />
<link rel="apple-touch-icon" href="/bc-assets/yuno-favicon.png" />
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource-variable/geist@5.2.8/index.css" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource-variable/geist-mono@5.2.7/index.css" />
<link rel="stylesheet" href="/yuno-one-click-assets/styles.css?v=__JSX_VER__" />
</head>
<body class="__BODY_CLASS__">

<deck-stage width="1920" height="1080">
  <section id="root-container" style="background:#0c0d10;"></section>
</deck-stage>

<script>
  window.DECK_DEFAULTS = ${DECK_DEFAULTS_TOKEN_OPEN}null${DECK_DEFAULTS_TOKEN_CLOSE};
  /* Slug + print-mode flag injected by the edge function. The DownloadPdfButton
     on the close slide reads YUNO_OC_TRACKING.slug to build the bridge URL. */
  window.YUNO_OC_TRACKING = /*YUNO_OC_TRACKING_PLACEHOLDER*/null/*/YUNO_OC_TRACKING_PLACEHOLDER*/;
</script>

<script src="/sdr-bc-assets/deck-stage.js?v=__JSX_VER__"></script>
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>

<script type="text/babel" src="/yuno-one-click-assets/components.jsx?v=__JSX_VER__"></script>
<script type="text/babel" src="/yuno-one-click-assets/slides-01-context.jsx?v=__JSX_VER__"></script>
<script type="text/babel" src="/yuno-one-click-assets/slides-02-conciliacion.jsx?v=__JSX_VER__"></script>

<script type="text/babel">
const { useState, useEffect } = React;

function useDeckData() {
  const data = window.DECK_DEFAULTS || {};
  return {
    clientName: data.clientName,
    docType: data.docType || 'Yuno One-Click',
    date: data.date,
    preparedBy: data.preparedBy,
    contact: {
      name: data.contactName,
      title: data.contactTitle,
      email: data.contactEmail,
      phone: data.contactPhone,
    },
    ...data,
  };
}

const DATA_EVENT = 'yuno-oc-deck-data';

function SlideShell({ render, onMount }) {
  const [data, setData] = useState(window.__yunoOcDeckData || window.DECK_DEFAULTS || {});
  useEffect(() => {
    const onUpdate = (e) => setData(e.detail);
    window.addEventListener(DATA_EVENT, onUpdate);
    if (typeof onMount === 'function') onMount();
    return () => window.removeEventListener(DATA_EVENT, onUpdate);
  }, []);
  return render(data);
}

function Controller() {
  const data = useDeckData();
  useEffect(() => {
    window.__yunoOcDeckData = data;
    window.dispatchEvent(new CustomEvent(DATA_EVENT, { detail: data }));
  }, [data]);
  return null;
}

const stage = document.querySelector('deck-stage');
document.getElementById('root-container').remove();

// 23-slide structure: 2 productos en 1 deck (One-Click + Conciliación)
const slideBuilders = [
  // Apertura
  (d) => <Slide01Cover data={d} />,
  (d) => <Slide02Agenda data={d} />,
  // Bloque Yuno One-Click (10)
  (d) => <Slide03OcSection data={d} />,
  (d) => <Slide04FrictionTax data={d} />,
  (d) => <Slide05NetworkHero data={d} />,
  (d) => <Slide06UxFlow data={d} />,
  (d) => <Slide07UnderTheHood data={d} />,
  (d) => <Slide08AnchorMerchants data={d} />,
  (d) => <Slide10CrossMerchantScenarios data={d} />,
  (d) => <Slide11FourReasons data={d} />,
  (d) => <Slide12PerMerchantTpv data={d} />,
  // Bloque Yuno Conciliación (10)
  (d) => <Slide13ConSection data={d} />,
  (d) => <Slide14ConPain data={d} />,
  (d) => <Slide15ConThree data={d} />,
  (d) => <Slide16ConTransaccional data={d} />,
  (d) => <Slide17ConBancaria data={d} />,
  (d) => <Slide18ConStandalone data={d} />,
  (d) => <Slide19ConMetrics data={d} />,
  (d) => <Slide20ConDashboard data={d} />,
  (d) => <Slide21ConInsights data={d} />,
  (d) => <Slide22ConImpact data={d} />,
  // Cierre
  (d) => <Slide23Cta data={d} />,
];

// Headless PDF capture flips this to true once every slide has mounted, fonts
// are ready, and we've waited two animation frames for first paint.
window.__bcReady = false;
let __mountedCount = 0;
const __totalSlides = slideBuilders.length;
const __onSlideMount = () => {
  __mountedCount++;
  if (__mountedCount < __totalSlides) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(async () => {
      try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
      } catch (e) { /* fonts API missing → fall through */ }
      window.__bcReady = true;
    });
  });
};

slideBuilders.forEach((builder) => {
  const node = document.createElement('section');
  stage.appendChild(node);
  ReactDOM.createRoot(node).render(<SlideShell render={builder} onMount={__onSlideMount} />);
});

const ctrlHost = document.createElement('div');
ctrlHost.style.display = 'none';
document.body.appendChild(ctrlHost);
ReactDOM.createRoot(ctrlHost).render(<Controller />);
</script>

</body>
</html>`

// HMAC-SHA256(slug, secret) → hex, first 16 chars. Mirrors sdr-bc-render so the
// bridge can reuse BC_PRINT_SECRET for the PDF endpoint.
async function verifyPrintToken(slug: string, providedToken: string, secret: string): Promise<boolean> {
  if (!providedToken || !secret) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(slug))
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
  const expected = hex.slice(0, 16)
  if (expected.length !== providedToken.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ providedToken.charCodeAt(i)
  }
  return mismatch === 0
}

function renderDeck(p: {
  client_name: string
  slug: string
  defaults: Record<string, unknown>
  printMode: boolean
}): string {
  const safeDefaults = JSON.stringify(p.defaults ?? {})
    .replace(/<\/script/gi, '<\\/script')
  const tracking = JSON.stringify({ slug: p.slug, printMode: p.printMode })
    .replace(/<\/script/gi, '<\\/script')
  return TEMPLATE
    .replace(/__CLIENT_NAME__/g, escapeHtml(p.client_name))
    .replace(/__JSX_VER__/g, JSX_VER)
    .replace(/__BODY_CLASS__/g, p.printMode ? 'bc-print' : '')
    .replace(
      `${DECK_DEFAULTS_TOKEN_OPEN}null${DECK_DEFAULTS_TOKEN_CLOSE}`,
      `${DECK_DEFAULTS_TOKEN_OPEN}${safeDefaults}${DECK_DEFAULTS_TOKEN_CLOSE}`,
    )
    .replace(
      '/*YUNO_OC_TRACKING_PLACEHOLDER*/null/*/YUNO_OC_TRACKING_PLACEHOLDER*/',
      tracking,
    )
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const slug = url.searchParams.get('slug') || ''
  if (!slug) return html(400, '<h1>Missing slug</h1>')

  const printToken = url.searchParams.get('print') || ''
  const printSecret = Deno.env.get('BC_PRINT_SECRET') || ''
  const printMode = printToken
    ? await verifyPrintToken(slug, printToken, printSecret)
    : false

  const supabase = createSupabaseClient()
  const { data: row, error } = await supabase
    .from('presentations')
    .select('client_name, slug, defaults, expires_at, archived, kind')
    .eq('slug', slug)
    .eq('kind', 'yuno_one_click')
    .maybeSingle()

  if (error) {
    console.error('yuno-one-click-render lookup error:', error.message)
    return html(500, '<h1>Lookup failed</h1>')
  }
  if (!row || row.archived) return html(404, notFoundPage(slug))
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return html(410, notFoundPage(slug))
  }

  return html(200, renderDeck({
    client_name: row.client_name,
    slug: row.slug,
    defaults: (row.defaults as Record<string, unknown>) || {},
    printMode,
  }))
})
