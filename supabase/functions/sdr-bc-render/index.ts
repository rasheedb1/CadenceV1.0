// sdr-bc-render
// =============================================================================
// Public endpoint that serves the SDR Business Case deck for a given slug.
// Accessed via Railway express proxy at chief.yuno.tools/sdr-bc/<slug> → this
// function with ?slug=<slug>.
//
// Template references the JSX/CSS assets at /sdr-bc-assets/* (served by the
// Railway static middleware from public/sdr-bc-assets/). The deck data is
// injected inline as window.DECK_DEFAULTS — same model as presentation-render.
//
// Slide list is dynamic: only regions in data.regions_rendered ship their
// Tabs/Cards/APMs/Dev slides, so an SDR-BC for a LATAM-only client never
// shows an empty EMEA section.
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
</head><body><h1>Deck not found</h1>
<p>No SDR Business Case found for slug <code>${escapeHtml(slug)}</code>.</p>
<p>It may have expired (90-day TTL) or never existed.</p>
</body></html>`
}

const DECK_DEFAULTS_TOKEN_OPEN = '/*__DECK_DEFAULTS_OPEN__*/'
const DECK_DEFAULTS_TOKEN_CLOSE = '/*__DECK_DEFAULTS_CLOSE__*/'

// JSX bust: bump this whenever the bundled /sdr-bc-assets/*.jsx assets change
// so the deck never serves a stale cached file from the Railway edge.
const JSX_VER = '20260610-equal-earth-map-pins'

// Inline template. References /sdr-bc-assets/* and replaces the dev tweak
// panel + the hard-coded slideBuilders list with a runtime-driven one.
const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920" />
<title>__CLIENT_NAME__ · Yuno SDR Business Case</title>
<meta name="robots" content="noindex,nofollow" />
<link rel="icon" type="image/png" sizes="32x32" href="/bc-assets/yuno-favicon-32.png" />
<link rel="icon" type="image/png" sizes="256x256" href="/bc-assets/yuno-favicon.png" />
<link rel="apple-touch-icon" href="/bc-assets/yuno-favicon.png" />
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource-variable/geist@5.2.8/index.css" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource-variable/geist-mono@5.2.7/index.css" />
<link rel="stylesheet" href="/sdr-bc-assets/styles.css?v=__JSX_VER__" />
</head>
<body class="__BODY_CLASS__">

<deck-stage width="1920" height="1080">
  <section id="root-container" style="background:#0c0d10;"></section>
</deck-stage>

<script>
  window.DECK_DEFAULTS = ${DECK_DEFAULTS_TOKEN_OPEN}null${DECK_DEFAULTS_TOKEN_CLOSE};
  /* Slug + print-mode flag injected by the edge function. The DownloadPdfButton
     on the close slide reads SDR_BC_TRACKING.slug to build the bridge URL. */
  window.SDR_BC_TRACKING = /*SDR_BC_TRACKING_PLACEHOLDER*/null/*/SDR_BC_TRACKING_PLACEHOLDER*/;
</script>

<script src="/sdr-bc-assets/deck-stage.js?v=__JSX_VER__"></script>
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>

<script src="/sdr-bc-assets/sdr-bc-i18n.js?v=__JSX_VER__"></script>
<script type="text/babel" src="/sdr-bc-assets/components.jsx?v=__JSX_VER__"></script>
<script type="text/babel" src="/sdr-bc-assets/slides-01-context.jsx?v=__JSX_VER__"></script>
<script type="text/babel" src="/sdr-bc-assets/slides-02-business-case.jsx?v=__JSX_VER__"></script>

<script type="text/babel">
const { useState, useEffect } = React;

function useDeckData() {
  const data = window.DECK_DEFAULTS || {};
  // Multilingual surface: lang + currency live on data (persisted by
  // sdr-bc-generate in defaults JSONB). Default to en/USD when missing so the
  // legacy English decks generated before mig 147 still render unchanged.
  const lang = (data.language === 'es' || data.language === 'pt' || data.language === 'en')
    ? data.language : 'en';
  const currency = typeof data.currency === 'string' && data.currency
    ? data.currency : 'USD';
  return {
    clientName: data.clientName,
    docType: data.docType,
    date: data.date,
    preparedBy: data.preparedBy,
    contact: {
      name: data.contactName,
      title: data.contactTitle,
      email: data.contactEmail,
      phone: data.contactPhone,
    },
    // pass-through for everything else slides need:
    markets_geo: data.markets_geo,
    lang,
    currency,
    // per-region card rows + totals are read directly from data via dynamic keys
    ...data,
    // Re-stamp lang/currency *after* spread so the resolved values win over the
    // raw possibly-missing fields above (defensive — if data.language is unset
    // the spread above carried 'undefined' otherwise).
    language: lang,
  };
}

const DATA_EVENT = 'yuno-deck-data';

function SlideShell({ render, onMount }) {
  const [data, setData] = useState(window.__yunoDeckData || window.DECK_DEFAULTS || {});
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
    window.__yunoDeckData = data;
    window.dispatchEvent(new CustomEvent(DATA_EVENT, { detail: data }));
  }, [data]);
  return null;
}

const stage = document.querySelector('deck-stage');
document.getElementById('root-container').remove();

// Region order matches the deck design (us → lat → ema → apa). For each region
// rendered, append Tabs + Cards + APMs + Dev. Regions absent from the data
// (e.g. SimilarWeb saw no traffic above 1% share) are skipped entirely.
const REGION_DEFS = [
  { region: 'us',  label: 'North America', activeIdx: 0 },
  { region: 'lat', label: 'LATAM',         activeIdx: 1 },
  { region: 'ema', label: 'EMEA',          activeIdx: 2 },
  { region: 'apa', label: 'APAC',          activeIdx: 3 },
];

const dd = window.DECK_DEFAULTS || {};
const renderedRegions = Array.isArray(dd.regions_rendered) && dd.regions_rendered.length > 0
  ? dd.regions_rendered.map(r => r.region)
  : REGION_DEFS.map(r => r.region); // fall back to all regions if missing
const regionsToShow = REGION_DEFS.filter(r => renderedRegions.includes(r.region));

let pageNum = 1;
const slideBuilders = [
  (d) => <Slide01Cover data={d} />,
  (d) => <Slide02Agenda data={d} />,
  // Section dividers + simple slides now receive a data prop so they can pick up
  // data.language / data.currency for i18n. Math + content unchanged.
  (d) => <Slide03ContextSection data={d} />,
  (d) => <Slide04ClientStack data={d} />,
  (d) => <Slide05Geography data={d} />,
  (d) => <Slide06Orchestration data={d} />,
  (d) => <Slide06WhyYunoSection data={d} />,
  (d) => <Slide07YunoOverview data={d} />,
  (d) => <Slide08Trust data={d} />,
  (d) => <Slide09BCSection data={d} />,
  (d) => <Slide10Levers data={d} />,
];
pageNum = slideBuilders.length;

for (const r of regionsToShow) {
  const tabsPage  = ++pageNum;
  const cardsPage = ++pageNum;
  const apmsPage  = ++pageNum;
  const devPage   = ++pageNum;
  slideBuilders.push((d) => <RegionTabsSlide activeKey={r.region} pageNum={tabsPage} data={d} />);
  slideBuilders.push((d) => <RegionCardsSlide region={r.region} regionLabel={r.label} pageNum={cardsPage} data={d} />);
  slideBuilders.push((d) => <RegionApmsSlide  region={r.region} regionLabel={r.label} pageNum={apmsPage}  data={d} />);
  slideBuilders.push((d) => <RegionDevSlide   region={r.region} regionLabel={r.label} pageNum={devPage}   data={d} />);
}

slideBuilders.push((d) => <Slide27Total data={d} />);

// Headless PDF capture flips this to true once every slide has mounted, fonts
// are ready, and we've waited two animation frames for first paint. The bridge
// (openclaw/bridge/server.js → /api/sdr-bc/:slug/pdf) waits on it before
// invoking page.pdf(). Mirrors the __bcReady contract used by presentation-render.
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

// HMAC-SHA256(slug, secret) → hex, first 16 chars. Constant-time compare on
// input. Mirrors the bypass used by presentation-render so the bridge can use
// one BC_PRINT_SECRET for both BC + SDR-BC.
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
    // Defensive: avoid the JSON closing the <script> early.
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
      '/*SDR_BC_TRACKING_PLACEHOLDER*/null/*/SDR_BC_TRACKING_PLACEHOLDER*/',
      tracking,
    )
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const slug = url.searchParams.get('slug') || ''
  if (!slug) return html(400, '<h1>Missing slug</h1>')

  // Print mode: bridge requests the deck with ?print=<HMAC(slug)> for headless
  // PDF capture. When the token validates, the deck renders without animations
  // (CSS @media print + body.bc-print) and the bridge can call page.pdf().
  // Invalid/absent token → behave normally.
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
    .eq('kind', 'sdr_bc')
    .maybeSingle()

  if (error) {
    console.error('sdr-bc-render lookup error:', error.message)
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
