// Edge function: presentation-render
// Public endpoint that serves a business case deck HTML for a given slug.
// Accessed via Railway express proxy at chief.yuno.tools/bc/<slug> → this function with ?slug=<slug>.
// Template is embedded inline to avoid external-fetch dependency on the frontend deploy.
//
// Print mode (bypass for server-side PDF generation):
//   ?print=<HMAC-SHA256(slug, BC_PRINT_SECRET) hex first 16 chars>
//   When the token validates, the deck renders without the email gate and skips
//   view/dwell tracking. Used by the bridge's Puppeteer PDF endpoint.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PLACEHOLDER_OPEN = '/*BC_DEFAULTS_PLACEHOLDER*/'
const PLACEHOLDER_CLOSE = '/*/BC_DEFAULTS_PLACEHOLDER*/'
const TRACKING_PLACEHOLDER_OPEN = '/*BC_TRACKING_PLACEHOLDER*/'
const TRACKING_PLACEHOLDER_CLOSE = '/*/BC_TRACKING_PLACEHOLDER*/'
// Bumped whenever we ship JSX changes — busts the 1h cache on bc-assets/*.jsx.
const JSX_VER = '20260504-additional-services'

// Deck template (embedded at build time from public/bc-assets/template.html).
// References /bc-assets/*.jsx, *.css served by the Railway frontend on chief.yuno.tools.
const TEMPLATE = `<!DOCTYPE html>
<html lang="__HTML_LANG__">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920" />
<title>__CLIENT_NAME__ · Yuno Business Case</title>
<link rel="icon" type="image/png" sizes="32x32" href="/bc-assets/yuno-favicon-32.png" />
<link rel="icon" type="image/png" sizes="256x256" href="/bc-assets/yuno-favicon.png" />
<link rel="apple-touch-icon" href="/bc-assets/yuno-favicon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@200;300;400;500;600;700;900&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/bc-assets/styles.css" />
<link rel="stylesheet" href="/bc-assets/styles-bc.css" />
<style id="bc-gate-styles">
  .bc-gate-overlay{position:fixed;inset:0;z-index:99999;background:radial-gradient(ellipse at 50% 0%,#1A1F35 0%,#06070B 60%);display:flex;align-items:center;justify-content:center;font-family:'Titillium Web',-apple-system,sans-serif;animation:bcGateFadeIn 0.3s ease}
  .bc-gate-overlay.bc-gate-hidden{opacity:0;pointer-events:none;transition:opacity 0.4s ease}
  @keyframes bcGateFadeIn{from{opacity:0}to{opacity:1}}
  .bc-gate-card{width:90%;max-width:480px;padding:48px 40px;text-align:center;background:rgba(255,255,255,0.02);border:1px solid rgba(140,153,255,0.12);border-radius:16px;backdrop-filter:blur(8px)}
  .bc-gate-logo{width:48px;height:48px;margin-bottom:28px}
  .bc-gate-eyebrow{font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(140,153,255,0.9);font-weight:700;margin-bottom:18px}
  .bc-gate-title{font-size:32px;font-weight:200;letter-spacing:-0.02em;color:#fff;margin:0 0 14px;line-height:1.2}
  .bc-gate-subtitle{font-size:15px;line-height:1.55;color:rgba(255,255,255,0.6);margin:0 0 32px}
  .bc-gate-form{display:flex;flex-direction:column;gap:12px}
  .bc-gate-input{width:100%;box-sizing:border-box;padding:14px 16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:10px;color:#fff;font-family:inherit;font-size:15px;transition:border-color 0.2s,background 0.2s;outline:none}
  .bc-gate-input::placeholder{color:rgba(255,255,255,0.35)}
  .bc-gate-input:focus{border-color:#3E4FE0;background:rgba(62,79,224,0.06)}
  .bc-gate-input:disabled{opacity:0.5;cursor:not-allowed}
  .bc-gate-submit{padding:14px 16px;background:#E0ED80;color:#06070B;font-family:inherit;font-size:15px;font-weight:600;border:none;border-radius:10px;cursor:pointer;transition:transform 0.15s,box-shadow 0.2s}
  .bc-gate-submit:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 20px rgba(224,237,128,0.18)}
  .bc-gate-submit:disabled{opacity:0.5;cursor:wait}
  .bc-gate-error{font-size:13px;color:#FF8A8A;margin:14px 0 0;min-height:18px}
  .bc-gate-footer{margin-top:24px;font-size:11px;color:rgba(255,255,255,0.32);letter-spacing:0.04em}
  /* Print mode: gate hidden + stage shown immediately, before any JS runs.
     Server adds class="bc-print" on <body> only when the HMAC bypass is valid. */
  body.bc-print #bc-gate{display:none !important}
  body.bc-print deck-stage{visibility:visible !important}
</style>
</head>
<body class="__BODY_CLASS__">

<div id="bc-gate" class="bc-gate-overlay" role="dialog" aria-modal="true">
  <div class="bc-gate-card">
    <img class="bc-gate-logo" src="/bc-assets/yuno-favicon.png" alt="Yuno" />
    <div class="bc-gate-eyebrow" id="bc-gate-eyebrow">__GATE_EYEBROW__</div>
    <h1 class="bc-gate-title" id="bc-gate-title">__GATE_TITLE__</h1>
    <p class="bc-gate-subtitle" id="bc-gate-subtitle">__GATE_SUBTITLE__</p>
    <form class="bc-gate-form" id="bc-gate-form" autocomplete="on">
      <input type="email" class="bc-gate-input" id="bc-gate-email" placeholder="__GATE_PLACEHOLDER__" required autocomplete="email" />
      <button type="submit" class="bc-gate-submit" id="bc-gate-submit">__GATE_CTA__</button>
    </form>
    <p class="bc-gate-error" id="bc-gate-error" aria-live="polite"></p>
    <p class="bc-gate-footer">__GATE_FOOTER__</p>
  </div>
</div>

<deck-stage width="1920" height="1080" style="visibility:hidden">
  <section id="root-container" style="background:#06070B;"></section>
</deck-stage>

<script>
  /* BC_DEFAULTS injected by the edge function */
  window.BC_DEFAULTS = /*BC_DEFAULTS_PLACEHOLDER*/null/*/BC_DEFAULTS_PLACEHOLDER*/;
  /* BC_TRACKING injected by the edge function */
  window.BC_TRACKING = /*BC_TRACKING_PLACEHOLDER*/null/*/BC_TRACKING_PLACEHOLDER*/;
</script>

<script>
(function(){
  var cfg = window.BC_TRACKING || {};
  if (!cfg.slug || !cfg.apiBase) return;
  // Print mode: server validated the HMAC bypass. Show the deck without the gate
  // and skip all tracking — the bridge captures this for PDF generation, not a real visit.
  if (cfg.printMode) {
    var pgate = document.getElementById('bc-gate');
    if (pgate && pgate.parentNode) pgate.parentNode.removeChild(pgate);
    var pstage = document.querySelector('deck-stage');
    if (pstage) pstage.style.visibility = 'visible';
    return;
  }
  var slug = cfg.slug;
  var apiBase = cfg.apiBase;
  var copy = cfg.copy || {};
  var anonKey = cfg.anonKey || '';
  var STORAGE_KEY = 'bc_viewer_email_' + slug;
  var SESSION_KEY = 'bc_session_id_' + slug;

  var gate = document.getElementById('bc-gate');
  var stage = document.querySelector('deck-stage');
  var form = document.getElementById('bc-gate-form');
  var input = document.getElementById('bc-gate-email');
  var submit = document.getElementById('bc-gate-submit');
  var errorEl = document.getElementById('bc-gate-error');
  var EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

  var sessionId = null;
  var trackUrl = apiBase + '/functions/v1/track-presentation-view';
  var slideUrl = apiBase + '/functions/v1/track-presentation-slide';

  function postJson(url, body, useBeacon){
    var payload = JSON.stringify(body);
    if (useBeacon && navigator.sendBeacon){
      try {
        // text/plain avoids the CORS preflight that application/json triggers,
        // which sendBeacon can't await. Server reads body as text and JSON.parses.
        var blob = new Blob([payload], {type:'text/plain;charset=UTF-8'});
        return navigator.sendBeacon(url, blob);
      } catch(e){}
    }
    return fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':anonKey,'Authorization':'Bearer '+anonKey},
      body:payload,
      keepalive: !!useBeacon,
    }).then(function(r){ return r.ok ? r.json() : Promise.reject(r); });
  }

  function hideGate(){
    if (!gate) return;
    gate.classList.add('bc-gate-hidden');
    if (stage) stage.style.visibility = 'visible';
    setTimeout(function(){ if (gate && gate.parentNode) gate.parentNode.removeChild(gate); }, 500);
    initSlideTracker();
  }

  function trackView(email, opts){
    opts = opts || {};
    return postJson(trackUrl, {slug:slug, viewer_email:email}).then(function(resp){
      if (resp && resp.session_id){
        sessionId = resp.session_id;
        try { localStorage.setItem(STORAGE_KEY, email); localStorage.setItem(SESSION_KEY, resp.session_id); } catch(e){}
      }
      return resp;
    });
  }

  function showError(msg){ if (errorEl) errorEl.textContent = msg || ''; }

  if (form){
    form.addEventListener('submit', function(ev){
      ev.preventDefault();
      var email = (input.value || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)){ showError(copy.errInvalid || 'Invalid email'); return; }
      showError('');
      submit.disabled = true; input.disabled = true;
      trackView(email).then(function(){
        hideGate();
      }).catch(function(){
        submit.disabled = false; input.disabled = false;
        showError(copy.errNetwork || 'Could not save your email. Try again.');
      });
    });
  }

  // If email already provided in this browser, skip the modal but still track this visit.
  try {
    var storedEmail = localStorage.getItem(STORAGE_KEY);
    if (storedEmail && EMAIL_RE.test(storedEmail)){
      trackView(storedEmail).then(hideGate).catch(function(){ /* if tracking fails, still show deck so user isn't blocked */ hideGate(); });
    }
  } catch(e){}

  // ── slide tracker ────────────────────────────────────────────────────
  function initSlideTracker(){
    if (!stage || !sessionId) return;
    var currentSlide = 0;
    var lastTick = Date.now();
    var paused = document.visibilityState === 'hidden';
    var pending = {}; // slide_index → accumulated dwell_ms
    var FLUSH_INTERVAL_MS = 15000;
    var MIN_FLUSH_MS = 500;

    function accumulate(){
      if (paused) return;
      var now = Date.now();
      var delta = now - lastTick;
      lastTick = now;
      if (delta < MIN_FLUSH_MS) return;
      pending[currentSlide] = (pending[currentSlide] || 0) + delta;
    }

    function flush(useBeacon){
      accumulate();
      var events = [];
      for (var k in pending){
        if (Object.prototype.hasOwnProperty.call(pending, k) && pending[k] > 0){
          events.push({slide_index: parseInt(k,10), dwell_ms: pending[k]});
        }
      }
      if (!events.length) return;
      pending = {};
      postJson(slideUrl, {session_id: sessionId, events: events}, useBeacon);
    }

    stage.addEventListener('slidechange', function(ev){
      accumulate();
      var detail = ev.detail || {};
      if (typeof detail.index === 'number') currentSlide = detail.index;
      lastTick = Date.now();
    });

    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState === 'hidden'){
        accumulate();
        paused = true;
        flush(true);
      } else {
        paused = false;
        lastTick = Date.now();
      }
    });

    window.addEventListener('pagehide', function(){ flush(true); });
    window.addEventListener('beforeunload', function(){ flush(true); });
    setInterval(function(){ flush(false); }, FLUSH_INTERVAL_MS);
  }
})();
</script>

<script src="/bc-assets/deck-stage.js"></script>
<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" crossorigin="anonymous"></script>

<script type="text/babel" src="/bc-assets/components.jsx?v=__JSX_VER__"></script>
<script type="text/babel" src="/bc-assets/bc-components.jsx?v=__JSX_VER__"></script>
<script type="text/babel" src="/bc-assets/bc-slides__SLIDES_VARIANT__-01.jsx?v=__JSX_VER__"></script>
<script type="text/babel" src="/bc-assets/bc-slides__SLIDES_VARIANT__-02.jsx?v=__JSX_VER__"></script>

<script type="text/babel">
const { useState, useEffect } = React;

const DATA_EVENT = 'yuno-bc-data';

function computeTramosFee(tx, tiers) {
  // Stacked / progressive: each tier charges its own rate for the slice of tx that falls in it.
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

function computeTiersFee(tx, tiers) {
  // Whole-volume by bracket: charge tx × the rate of the bracket where tx falls.
  if (!tiers || !tiers.length) return 0;
  for (const t of tiers) {
    if (t.upToTx === Infinity || t.upToTx == null || tx <= t.upToTx) {
      return tx * Number(t.ratePerTx);
    }
  }
  // Fallback: tx exceeded all capped tiers and there's no unlimited tier — use last rate.
  return tx * Number(tiers[tiers.length - 1].ratePerTx);
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

  // grossUpByApproval (opt-in per deck): TPV is post-approval volume, so the
  // incremental from +Xpp approval is computed over attempted volume (tpv / currentApproval).
  // Default (flag off) keeps the legacy conservative formula so existing decks don't shift.
  const grossUpByApproval = !!d.grossUpByApproval && currentApproval > 0;
  const incrTPV_approvals = grossUpByApproval
    ? (tpv / (currentApproval / 100)) * (approvalLiftPp / 100)
    : tpv * (approvalLiftPp / 100);
  const L1 = incrTPV_approvals * grossMargin;
  const targetApproval = currentApproval + approvalLiftPp;

  const L2 = tpv * (mdrReductionBps / 10000);
  const targetMDRBps = currentMDRBps - mdrReductionBps;
  const targetMDR = targetMDRBps / 100;

  // APM uplift kept for backward compat (slide removed) — not summed into grossGain anymore.
  const incrTPV_apms = tpv * (apmUpliftPct / 100);
  const apmMarginGain = incrTPV_apms * grossMargin;

  // Normalize legacy 'tiered' → 'tramos' so all downstream code (incl. slides) reads canonical value.
  const pricingModel = d.pricingModel === 'tiered' ? 'tramos' : d.pricingModel;
  let actualTxFee, minCommitFee;
  if (pricingModel === 'tramos') {
    actualTxFee = computeTramosFee(numActualTx, d.rateTiers);
    minCommitFee = computeTramosFee(Number(d.minTxAnnual), d.rateTiers);
  } else if (pricingModel === 'tiers') {
    actualTxFee = computeTiersFee(numActualTx, d.rateTiers);
    minCommitFee = computeTiersFee(Number(d.minTxAnnual), d.rateTiers);
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
  // Floor at 0: if Yuno's reconciliation fee exceeds market benchmark, the deck
  // shouldn't show "negative savings" — that breaks the L3 visualization and
  // misleads the reader. Treat parity as zero benefit instead.
  const reconciliationAnnualSavings = Math.max(0, reconciliationCostOtherAnnual - reconciliationCostYunoAnnual);
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
    locale: d.locale || 'en',
    currency: d.currency || 'USD',
    additionalServices: (d.additionalServices && typeof d.additionalServices === 'object') ? d.additionalServices : {},
    date: d.date || '',
    bookingUrl: typeof d.bookingUrl === 'string' && d.bookingUrl ? d.bookingUrl : null,
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
    pricingModel, ratePerTx: d.ratePerTx,
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

function SlideShell({ render, onMount }) {
  const [data] = useState(window.__bcData || computeData(window.BC_DEFAULTS || {}));
  useEffect(() => { if (onMount) onMount(); }, []);
  return render(data);
}

const stage = document.querySelector('deck-stage');
document.getElementById('root-container').remove();

window.__bcData = computeData(window.BC_DEFAULTS || {});

// Signal for headless PDF generation: true when all slides have mounted,
// fonts have loaded, and we've waited two animation frames for first paint.
window.__bcReady = false;

const slideBuilders = [
  (d) => <BCSlide01 data={d} />,
  (d) => <BCSlide02 data={d} />,
  (d) => <BCSlide03 data={d} />,
  (d) => <BCSlide04 />,
  (d) => <BCSlide05 data={d} />,
  (d) => <BCSlide06 data={d} />,
  (d) => <BCSlide07 />,
  (d) => <BCSlide08 />,
  (d) => <BCSlide09 />,
  (d) => <BCSlide13 />,
  (d) => <BCSlide14 data={d} />,
  (d) => <BCSlide14B data={d} />,
  (d) => <BCSlide15 data={d} />,
  (d) => <BCSlide16 data={d} />,
  (d) => <BCSlide18 data={d} />,
  (d) => <BCSlide20 data={d} />,
  (d) => <BCSlide20C data={d} />,
  (d) => <BCSlide20B data={d} />,
  (d) => <BCSlide24 data={d} />,
];

let __mountedCount = 0;
const __totalSlides = slideBuilders.length;
const __onSlideMount = () => {
  __mountedCount++;
  if (__mountedCount < __totalSlides) return;
  // Wait for first paint of the last slide, then for fonts, then for one more
  // paint before flipping the ready flag — Puppeteer waits on this.
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

const GATE_COPY = {
  en: {
    eyebrow: 'BUSINESS CASE',
    title: 'Welcome 👋',
    subtitle: 'Share your email to access the proposal.',
    placeholder: 'you@company.com',
    cta: 'Continue',
    footer: 'Yuno may track your visit to this proposal.',
    errInvalid: 'Please enter a valid email.',
    errNetwork: 'Could not save your email. Please try again.',
  },
  es: {
    eyebrow: 'BUSINESS CASE',
    title: 'Bienvenido 👋',
    subtitle: 'Compártenos tu correo para acceder a la propuesta.',
    placeholder: 'tu@empresa.com',
    cta: 'Continuar',
    footer: 'Yuno puede registrar tu visita a esta propuesta.',
    errInvalid: 'Ingresa un correo válido.',
    errNetwork: 'No pudimos guardar tu correo. Intenta de nuevo.',
  },
  pt: {
    eyebrow: 'BUSINESS CASE',
    title: 'Bem-vindo 👋',
    subtitle: 'Compartilhe seu e-mail para acessar a proposta.',
    placeholder: 'voce@empresa.com',
    cta: 'Continuar',
    footer: 'A Yuno pode registrar sua visita a esta proposta.',
    errInvalid: 'Informe um e-mail válido.',
    errNetwork: 'Não conseguimos salvar seu e-mail. Tente novamente.',
  },
}

const EXPIRED_COPY = {
  en: {
    title: 'Link expired · Yuno',
    eyebrow: '· link expired',
    heading: 'This deck is no longer available',
    body: (name) => `The business case for ${name || 'this client'} has expired. Ask your Yuno contact to regenerate it.`,
    cta: 'View active presentations →',
  },
  es: {
    title: 'Enlace expirado · Yuno',
    eyebrow: '· enlace expirado',
    heading: 'Esta presentación ya no está disponible',
    body: (name) => `El business case de ${name || 'este cliente'} ha expirado. Pídele a tu contacto en Yuno que lo regenere.`,
    cta: 'Ver presentaciones activas →',
  },
  pt: {
    title: 'Link expirado · Yuno',
    eyebrow: '· link expirado',
    heading: 'Este deck não está mais disponível',
    body: (name) => `O business case de ${name || 'este cliente'} expirou. Peça ao seu contato na Yuno para gerá-lo novamente.`,
    cta: 'Ver apresentações ativas →',
  },
}

function expiredHtml(clientName, locale = 'en') {
  const safeName = escapeHtml(clientName || '')
  const localeKey = locale === 'es' || locale === 'pt' ? locale : 'en'
  const t = EXPIRED_COPY[localeKey]
  return `<!DOCTYPE html><html lang="${localeKey}"><head><meta charset="UTF-8" /><title>${t.title}</title><link rel="icon" type="image/png" sizes="32x32" href="/bc-assets/yuno-favicon-32.png" /><link rel="icon" type="image/png" sizes="256x256" href="/bc-assets/yuno-favicon.png" /><link href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@200;300;400;600&display=swap" rel="stylesheet" /><style>body{margin:0;font-family:'Titillium Web',sans-serif;background:radial-gradient(ellipse at 50% 0%,#1A1F35 0%,#06070B 60%);color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center}.card{max-width:520px;padding:48px 40px;text-align:center}.eyebrow{font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(140,153,255,0.9);font-weight:700;margin-bottom:24px}h1{font-size:48px;font-weight:200;letter-spacing:-0.02em;margin:0 0 20px}p{font-size:17px;line-height:1.55;color:rgba(255,255,255,0.68);margin:0 0 32px}a{color:#E0ED80;text-decoration:none;border-bottom:1px solid rgba(224,237,128,0.35);padding-bottom:2px;font-weight:600}</style></head><body><div class="card"><div class="eyebrow">${t.eyebrow}</div><h1>${t.heading}</h1><p>${t.body(safeName)}</p><a href="https://chief.yuno.tools/presentaciones">${t.cta}</a></div></body></html>`
}

function notFoundHtml() {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Not found</title><link rel="icon" type="image/png" sizes="32x32" href="/bc-assets/yuno-favicon-32.png" /><link rel="icon" type="image/png" sizes="256x256" href="/bc-assets/yuno-favicon.png" /><style>body{margin:0;font-family:system-ui,sans-serif;background:#06070B;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}.c{text-align:center;padding:40px}h1{font-weight:200;font-size:64px;margin:0}p{color:rgba(255,255,255,0.5)}</style></head><body><div class="c"><h1>404</h1><p>No presentation found for this link.</p></div></body></html>'
}

// HMAC-SHA256(slug, secret) → hex, first 16 chars. Constant-time compare on input.
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

Deno.serve(async (req) => {
  const reqId = crypto.randomUUID().slice(0, 8)  // opaque log correlator
  const url = new URL(req.url)
  const slug = url.searchParams.get('slug') || url.pathname.split('/').filter(Boolean).pop() || ''

  if (!slug) return htmlResponse(notFoundHtml(), 404, { noStore: true })

  // Print mode: bridge requests the deck with ?print=<HMAC(slug)> for headless capture.
  // When the token validates, we skip the email gate + tracking. Invalid/absent → behave normally.
  const printToken = url.searchParams.get('print') || ''
  const printSecret = Deno.env.get('BC_PRINT_SECRET') || ''
  const printMode = printToken
    ? await verifyPrintToken(slug, printToken, printSecret)
    : false

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
    .select('slug, client_name, defaults, expires_at, archived, created_by_email, created_by, org_id')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.error(`render[${reqId}]: db lookup error`)
    return htmlResponse(notFoundHtml(), 500, { noStore: true })
  }
  if (!row) return htmlResponse(notFoundHtml(), 404, { noStore: true })

  // Locale lives inside `defaults` (no schema migration required).
  // Older rows without it fall back to 'en' so they keep rendering identically.
  const rawLocale = (row.defaults && typeof row.defaults === 'object') ? row.defaults.locale : null
  const locale = rawLocale === 'es' || rawLocale === 'pt' ? rawLocale : 'en'

  if (row.archived) return htmlResponse(expiredHtml(row.client_name, locale), 410, { noStore: true })

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
    return htmlResponse(expiredHtml(row.client_name, locale), 410, { noStore: true })
  }

  // Belt-and-suspenders: the column is NOT NULL, but a malformed row shouldn't
  // render "null" as BC_DEFAULTS and cascade NaN through every calc on the client.
  if (!row.defaults || typeof row.defaults !== 'object') {
    console.error(`render[${reqId}]: row.defaults malformed for slug=${slug}`)
    return htmlResponse(notFoundHtml(), 500, { noStore: true })
  }

  // Resolve the close-slide booking URL fresh on every render so AEs can update
  // it once and have all their existing decks pick it up. Prefer the (org, user)
  // pair that created the BC; fall back to the email match for older rows that
  // pre-date created_by being populated.
  let bookingUrl: string | null = null
  let aeQuery = supabase
    .from('ae_integrations')
    .select('config')
    .eq('provider', 'google_calendar')
    .limit(1)
  if (row.created_by && row.org_id) {
    aeQuery = aeQuery.eq('user_id', row.created_by).eq('org_id', row.org_id)
  } else if (row.created_by_email) {
    aeQuery = aeQuery.ilike('config->>email', row.created_by_email)
  } else {
    aeQuery = aeQuery.eq('id', '00000000-0000-0000-0000-000000000000') // no-op
  }
  const { data: aeRows } = await aeQuery
  const raw = (aeRows?.[0]?.config as Record<string, unknown> | undefined)?.booking_url
  if (typeof raw === 'string' && /^https?:\/\//i.test(raw.trim())) {
    bookingUrl = raw.trim()
  }
  // Inject as a top-level key on defaults so the slide can read data.bookingUrl.
  const defaultsWithBooking = { ...(row.defaults as Record<string, unknown>), bookingUrl }

  // JSON-in-script escape:
  //  - `<` and `-->`  : prevent </script> and comment break-out
  //  - U+2028/U+2029  : JS line terminators that JSON.stringify leaves raw; they
  //                     can break out of a JS string in older parsers.
  const defaultsJson = JSON.stringify(defaultsWithBooking)
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

  // BC_TRACKING placeholder — tracker config used by the email gate + slide-dwell logger.
  // Anon key is needed because edge-function gateway adds Authorization checks; --no-verify-jwt
  // bypasses verification but the gateway still requires the bearer header to be present.
  const trackingCfg = {
    slug: row.slug,
    apiBase: supabaseUrl,
    anonKey: Deno.env.get('SUPABASE_ANON_KEY') || '',
    copy: GATE_COPY[locale],
    printMode,
  }
  const trackingJson = JSON.stringify(trackingCfg)
    .replace(/</g, '\\u003c')
    .replace(/-->/g, '--\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

  const tOpenIdx = injected.indexOf(TRACKING_PLACEHOLDER_OPEN)
  const tCloseIdx = injected.indexOf(TRACKING_PLACEHOLDER_CLOSE)
  if (tOpenIdx === -1 || tCloseIdx === -1 || tCloseIdx < tOpenIdx) {
    console.error(`render[${reqId}]: tracking placeholder missing`)
    return new Response('Template misconfigured', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }
  const tBefore = injected.slice(0, tOpenIdx)
  const tAfter = injected.slice(tCloseIdx + TRACKING_PLACEHOLDER_CLOSE.length)
  const withTracking = tBefore + trackingJson + tAfter

  // __CLIENT_NAME__ is in <title>; HTML-escape properly (not strip-escape).
  // __SLIDES_VARIANT__ picks the slide bundle: '' = English (untouched original),
  // '-es' = Spanish fork, '-pt' = Portuguese fork. __HTML_LANG__ matches.
  const safeTitle = escapeHtml(row.client_name || 'Yuno')
  const slidesVariant = locale === 'es' ? '-es' : locale === 'pt' ? '-pt' : ''
  const gateCopy = GATE_COPY[locale]
  const finalHtml = withTracking
    .replace('__CLIENT_NAME__', safeTitle)
    .replaceAll('__SLIDES_VARIANT__', slidesVariant)
    .replaceAll('__JSX_VER__', JSX_VER)
    .replace('__HTML_LANG__', locale)
    .replace('__BODY_CLASS__', printMode ? 'bc-print' : '')
    .replace('__GATE_EYEBROW__', escapeHtml(gateCopy.eyebrow))
    .replace('__GATE_TITLE__', escapeHtml(gateCopy.title))
    .replace('__GATE_SUBTITLE__', escapeHtml(gateCopy.subtitle))
    .replace('__GATE_PLACEHOLDER__', escapeHtml(gateCopy.placeholder))
    .replace('__GATE_CTA__', escapeHtml(gateCopy.cta))
    .replace('__GATE_FOOTER__', escapeHtml(gateCopy.footer))

  // Print-mode responses bypass the email gate; never let a CDN cache them.
  return htmlResponse(finalHtml, 200, { noStore: printMode })
})
