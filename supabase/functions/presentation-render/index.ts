// Edge function: presentation-render
// Public endpoint that serves a business case deck HTML for a given slug.
// Accessed via Railway express proxy at chief.yuno.tools/bc/<slug> → this function with ?slug=<slug>.
// Template is embedded inline to avoid external-fetch dependency on the frontend deploy.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PLACEHOLDER_OPEN = '/*BC_DEFAULTS_PLACEHOLDER*/'
const PLACEHOLDER_CLOSE = '/*/BC_DEFAULTS_PLACEHOLDER*/'

// Deck template (embedded at build time from public/bc-assets/template.html).
// References /bc-assets/*.jsx, *.css served by the Railway frontend on chief.yuno.tools.
const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920" />
<title>__CLIENT_NAME__ · Yuno Business Case</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@200;300;400;500;600;700;900&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/bc-assets/styles.css" />
<link rel="stylesheet" href="/bc-assets/styles-bc.css" />
</head>
<body>

<deck-stage width="1920" height="1080">
  <section id="root-container" style="background:#06070B;"></section>
</deck-stage>

<script>
  /* BC_DEFAULTS injected by the edge function */
  window.BC_DEFAULTS = /*BC_DEFAULTS_PLACEHOLDER*/null/*/BC_DEFAULTS_PLACEHOLDER*/;
</script>

<script src="/bc-assets/deck-stage.js"></script>
<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" crossorigin="anonymous"></script>

<script type="text/babel" src="/bc-assets/components.jsx"></script>
<script type="text/babel" src="/bc-assets/bc-components.jsx"></script>
<script type="text/babel" src="/bc-assets/bc-slides-01.jsx"></script>
<script type="text/babel" src="/bc-assets/bc-slides-02.jsx"></script>

<script type="text/babel">
const { useState, useEffect } = React;

const DATA_EVENT = 'yuno-bc-data';

function computeTieredFee(tx, tiers) {
  if (!tiers || !tiers.length) return 0;
  let fee = 0, remaining = tx, prev = 0;
  for (const t of tiers) {
    if (remaining <= 0) break;
    const cap = t.upToTx === Infinity || t.upToTx == null ? remaining : Math.max(0, t.upToTx - prev);
    const take = Math.min(remaining, cap);
    fee += take * Number(t.ratePerTx);
    remaining -= take;
    prev = t.upToTx;
  }
  return fee;
}

function computeData(raw) {
  const d = { ...(window.BC_DEFAULTS || {}), ...raw };
  const tpv = Number(d.tpv);
  const avgTicket = Number(d.avgTicket);
  const currentApproval = Number(d.currentApproval);
  const currentMDR = Number(d.currentMDR);
  const currentMDRBps = currentMDR * 100;
  const grossMarginPct = Number(d.grossMargin);
  const grossMargin = grossMarginPct / 100;
  const currentProviders = Number(d.currentProviders);
  const activeMarkets = Number(d.activeMarkets);
  const currentAPMs = Number(d.currentAPMs);
  const fteToday = Number(d.fteToday);
  const fteTarget = Number(d.fteTarget);
  const approvalLiftPp = Number(d.approvalLiftPp);
  const mdrReductionBps = Number(d.mdrReductionBps);
  const apmUpliftPct = Number(d.apmUpliftPct);
  const newAPMsAdded = Number(d.newAPMsAdded);
  const integrationReductionPct = Number(d.integrationReductionPct);
  const opsSavings = Number(d.opsSavings);

  const numActualTx = avgTicket > 0 ? tpv / avgTicket : 0;

  const incrTPV_approvals = tpv * (approvalLiftPp / 100);
  const L1 = incrTPV_approvals * grossMargin;
  const targetApproval = currentApproval + approvalLiftPp;

  const L2 = tpv * (mdrReductionBps / 10000);
  const targetMDRBps = currentMDRBps - mdrReductionBps;
  const targetMDR = targetMDRBps / 100;

  // APM uplift kept for backward compat (slide removed) — not summed into grossGain anymore.
  const incrTPV_apms = tpv * (apmUpliftPct / 100);
  const apmMarginGain = incrTPV_apms * grossMargin;

  let actualTxFee, minCommitFee;
  if (d.pricingModel === 'tiered') {
    actualTxFee = computeTieredFee(numActualTx, d.rateTiers);
    minCommitFee = computeTieredFee(Number(d.minTxAnnual), d.rateTiers);
  } else {
    const rate = Number(d.ratePerTx);
    actualTxFee = numActualTx * rate;
    minCommitFee = Number(d.minTxAnnual) * rate;
  }
  const saasAnnualFee = Number(d.monthlySaaS) * 12;
  const txAnnualFee = Math.max(actualTxFee, minCommitFee);
  const reconciliationFee = Number(d.reconciliationFee) > 0 ? Number(d.reconciliationFee) : 0;
  const reconciliationAnnualFee = reconciliationFee * 12;
  const yunoAnnualFee = txAnnualFee + saasAnnualFee + reconciliationAnnualFee;

  // Lever 03 — operational savings (replaces old Lever 03 APMs + Lever 04 opsSavings benchmark).
  // Year-1: integration cost avoided + reconciliation annual delta vs. market.
  const numNewIntegrations = Math.max(0, Math.round(Number(d.numNewIntegrations) || 0));
  const integrationMonthsPerProvider = 3;
  const integrationCostPerMonth = 10000;
  const integrationCostBuild = numNewIntegrations * integrationMonthsPerProvider * integrationCostPerMonth;
  const timeToMarketMonthsSaved = numNewIntegrations * integrationMonthsPerProvider;
  const reconciliationMarketPerMonth = 10000;
  const reconciliationCostOtherAnnual = reconciliationMarketPerMonth * 12;
  const reconciliationCostYunoAnnual = reconciliationAnnualFee;
  const reconciliationAnnualSavings = reconciliationCostOtherAnnual - reconciliationCostYunoAnnual;
  const L3 = integrationCostBuild + reconciliationAnnualSavings;
  const L4 = 0;

  const grossGain = L1 + L2 + L3;
  const netAnnualGain = grossGain - yunoAnnualFee;

  const roiYr1 = yunoAnnualFee > 0 ? netAnnualGain / yunoAnnualFee : 0;
  const paybackMonths = netAnnualGain > 0 ? yunoAnnualFee / (netAnnualGain / 12) : 0;
  const npv3yr = netAnnualGain * Number(d.npvMultiplier);
  const conservative = netAnnualGain * Number(d.conservativeMult);
  const optimistic = netAnnualGain * Number(d.optimisticMult);

  const cm = d.costModel || {};
  const buildVsBuy = {
    integration: {
      build: currentProviders * (cm.integrationPerProvider || 200000),
      yuno: cm.yunoIntegration || 100000,
    },
    maintenance: {
      build: currentProviders * (cm.maintenancePerProvider3yr || 400000),
      yuno: cm.yunoMaintenance3yr || 200000,
    },
    ops: {
      build: fteToday * (cm.fteCostYr || 250000) * 3,
      yuno: fteTarget * (cm.fteCostYr || 250000) * 3,
    },
    compliance: {
      build: activeMarkets * (cm.compliancePerMarket || 45000),
      yuno: cm.yunoCompliance || 100000,
    },
  };
  const buildTotal3yr = buildVsBuy.integration.build + buildVsBuy.maintenance.build + buildVsBuy.ops.build + buildVsBuy.compliance.build;
  const yunoTotal3yr = buildVsBuy.integration.yuno + buildVsBuy.maintenance.yuno + buildVsBuy.ops.yuno + buildVsBuy.compliance.yuno;

  const valuePerPp = tpv * 0.01 * grossMargin;
  const fteFreed = fteToday - fteTarget;

  // Salesperson identity for the close slide — overridable via defaults.
  const salesName = (typeof d.salesName === 'string' && d.salesName.trim()) ? d.salesName.trim() : 'Carol Grunberg';
  const salesTitle = (typeof d.salesTitle === 'string' && d.salesTitle.trim()) ? d.salesTitle.trim() : 'Chief Business Officer';
  const salesEmail = (typeof d.salesEmail === 'string' && d.salesEmail.trim()) ? d.salesEmail.trim() : 'carol@yuno.co';
  const salesInitials = (() => {
    const parts = salesName.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  })();

  return {
    clientName: d.clientName || 'Client',
    date: d.date || '',
    tpv, avgTicket,
    countries: Array.isArray(d.countries) ? d.countries : [],
    currentApproval, currentMDR, currentMDRBps,
    grossMargin: grossMarginPct, grossMarginFrac: grossMargin,
    activeMarkets, currentAPMs, currentProviders,
    fteToday, fteTarget,
    todayProviders: Array.isArray(d.todayProviders) ? d.todayProviders : [],
    approvalLiftPp, mdrReductionBps, apmUpliftPct,
    newAPMsAdded, integrationReductionPct, opsSavings,
    salesName, salesTitle, salesEmail, salesInitials,
    pricingModel: d.pricingModel, ratePerTx: d.ratePerTx,
    rateTiers: d.rateTiers, minTxAnnual: d.minTxAnnual, monthlySaaS: d.monthlySaaS,
    conservativeMult: d.conservativeMult, optimisticMult: d.optimisticMult, npvMultiplier: d.npvMultiplier,
    costModel: d.costModel,
    numActualTx,
    incrTPV_approvals, incrTPV_apms,
    L1, L2, L3, L4,
    targetApproval, targetMDR, targetMDRBps,
    actualTxFee, minCommitFee, saasAnnualFee, txAnnualFee,
    reconciliationFee, reconciliationAnnualFee, yunoAnnualFee,
    grossGain, netAnnualGain,
    roiYr1, paybackMonths, npv3yr, conservative, optimistic,
    buildVsBuy, buildTotal3yr, yunoTotal3yr,
    valuePerPp, fteFreed,
    numNewIntegrations, integrationCostBuild, timeToMarketMonthsSaved,
    reconciliationCostOtherAnnual, reconciliationCostYunoAnnual,
  };
}

function SlideShell({ render }) {
  const [data] = useState(window.__bcData || computeData(window.BC_DEFAULTS || {}));
  return render(data);
}

const stage = document.querySelector('deck-stage');
document.getElementById('root-container').remove();

window.__bcData = computeData(window.BC_DEFAULTS || {});

const slideBuilders = [
  (d) => <BCSlide01 data={d} />,
  (d) => <BCSlide02 data={d} />,
  (d) => <BCSlide03 data={d} />,
  (d) => <BCSlide04 />,
  (d) => <BCSlide05 data={d} />,
  (d) => <BCSlide06 data={d} />,
  (d) => <BCSlide07 />,
  (d) => <BCSlide08 />,
  (d) => <BCSlide10 />,
  (d) => <BCSlide13 />,
  (d) => <BCSlide14 data={d} />,
  (d) => <BCSlide14B data={d} />,
  (d) => <BCSlide15 data={d} />,
  (d) => <BCSlide16 data={d} />,
  (d) => <BCSlide18 data={d} />,
  (d) => <BCSlide20 data={d} />,
  (d) => <BCSlide20B data={d} />,
  (d) => <BCSlide24 data={d} />,
];

slideBuilders.forEach((builder) => {
  const node = document.createElement('section');
  stage.appendChild(node);
  ReactDOM.createRoot(node).render(<SlideShell render={builder} />);
});
</script>

</body>
</html>
`

function htmlResponse(html, status = 200, opts = {}) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Expired/not-found responses must not be cached by CDNs (regeneration scenario).
      'Cache-Control': opts.noStore ? 'no-store' : 'public, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

// Proper HTML entity escape — strips nothing, escapes known dangerous chars.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function expiredHtml(clientName) {
  const safeName = escapeHtml(clientName || '')
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><title>Link expired · Yuno</title><link href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@200;300;400;600&display=swap" rel="stylesheet" /><style>body{margin:0;font-family:'Titillium Web',sans-serif;background:radial-gradient(ellipse at 50% 0%,#1A1F35 0%,#06070B 60%);color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center}.card{max-width:520px;padding:48px 40px;text-align:center}.eyebrow{font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(140,153,255,0.9);font-weight:700;margin-bottom:24px}h1{font-size:48px;font-weight:200;letter-spacing:-0.02em;margin:0 0 20px}p{font-size:17px;line-height:1.55;color:rgba(255,255,255,0.68);margin:0 0 32px}a{color:#E0ED80;text-decoration:none;border-bottom:1px solid rgba(224,237,128,0.35);padding-bottom:2px;font-weight:600}</style></head><body><div class="card"><div class="eyebrow">· link expired</div><h1>This deck is no longer available</h1><p>The business case for ${safeName || 'this client'} has expired. Ask your Yuno contact to regenerate it.</p><a href="https://chief.yuno.tools/presentaciones">View active presentations →</a></div></body></html>`
}

function notFoundHtml() {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Not found</title><style>body{margin:0;font-family:system-ui,sans-serif;background:#06070B;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}.c{text-align:center;padding:40px}h1{font-weight:200;font-size:64px;margin:0}p{color:rgba(255,255,255,0.5)}</style></head><body><div class="c"><h1>404</h1><p>No presentation found for this link.</p></div></body></html>'
}

Deno.serve(async (req) => {
  const reqId = crypto.randomUUID().slice(0, 8)  // opaque log correlator
  const url = new URL(req.url)
  const slug = url.searchParams.get('slug') || url.pathname.split('/').filter(Boolean).pop() || ''

  if (!slug) return htmlResponse(notFoundHtml(), 404, { noStore: true })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY_FULL') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error(`render[${reqId}]: missing supabase env`)
    return htmlResponse(notFoundHtml(), 500, { noStore: true })
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: row, error } = await supabase
    .from('presentations')
    .select('slug, client_name, defaults, expires_at, archived')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.error(`render[${reqId}]: db lookup error`)
    return htmlResponse(notFoundHtml(), 500, { noStore: true })
  }
  if (!row) return htmlResponse(notFoundHtml(), 404, { noStore: true })
  if (row.archived) return htmlResponse(expiredHtml(row.client_name), 410, { noStore: true })

  const now = new Date()
  const expiresAt = new Date(row.expires_at)
  if (expiresAt <= now) {
    // Lazy-archive with guard: .eq('archived', false) so concurrent requests no-op after
    // the first archives the row (avoids redundant writes + trigger firing).
    await supabase
      .from('presentations')
      .update({ archived: true })
      .eq('slug', slug)
      .eq('archived', false)
    return htmlResponse(expiredHtml(row.client_name), 410, { noStore: true })
  }

  // Belt-and-suspenders: the column is NOT NULL, but a malformed row shouldn't
  // render "null" as BC_DEFAULTS and cascade NaN through every calc on the client.
  if (!row.defaults || typeof row.defaults !== 'object') {
    console.error(`render[${reqId}]: row.defaults malformed for slug=${slug}`)
    return htmlResponse(notFoundHtml(), 500, { noStore: true })
  }

  // JSON-in-script escape:
  //  - `<` and `-->`  : prevent </script> and comment break-out
  //  - U+2028/U+2029  : JS line terminators that JSON.stringify leaves raw; they
  //                     can break out of a JS string in older parsers.
  const defaultsJson = JSON.stringify(row.defaults)
    .replace(/</g, '\\u003c')
    .replace(/-->/g, '--\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

  const openIdx = TEMPLATE.indexOf(PLACEHOLDER_OPEN)
  const closeIdx = TEMPLATE.indexOf(PLACEHOLDER_CLOSE)
  if (openIdx === -1 || closeIdx === -1 || closeIdx < openIdx) {
    console.error(`render[${reqId}]: template placeholder missing`)
    return new Response('Template misconfigured', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }
  const before = TEMPLATE.slice(0, openIdx)
  const after = TEMPLATE.slice(closeIdx + PLACEHOLDER_CLOSE.length)
  const injected = before + defaultsJson + after

  // __CLIENT_NAME__ is in <title>; HTML-escape properly (not strip-escape).
  const safeTitle = escapeHtml(row.client_name || 'Yuno')
  const finalHtml = injected.replace('__CLIENT_NAME__', safeTitle)

  return htmlResponse(finalHtml)
})
