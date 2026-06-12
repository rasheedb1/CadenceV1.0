/* ============================================================
   Yuno SDR Business Case Deck — Slides 9-27
   Nova-light redesign (2026-05-14) · trilingual 2026-05-18

   09 Section · BC · 10 Levers
   11-14 NA tabs / cards / APMs / dev   (or skipped if data.regions_rendered omits)
   15-18 LATAM
   19-22 EMEA
   23-26 APAC
   27 The Proposal (CTA)

   Every `data[KEY]` falls back to a `{{KEY}}` literal so the
   template.html dev view still shows the contract names. Math
   is upstream in sdr-bc-generate — these slides only surface
   pre-computed fields. Language: data.language (en default);
   currency: data.currency (USD default). See slides-01-context.jsx
   for the i18n helper plumbing notes.
   ============================================================ */

// Resolver — picks the active language from data.language with safe fallback.
function pickLangBC(data) {
  const l = data && data.language;
  return (l === 'es' || l === 'pt' || l === 'en') ? l : 'en';
}

// =============================================================================
// Slide 09 — Section · Business Case
// =============================================================================
function Slide09BCSection({ data }) {
  const lang = pickLangBC(data);
  return (
    <SectionDivider
      index="03"
      title={window.tr(lang, 's09.title')}
      subtitle={window.tr(lang, 's09.subtitle')}
      pageNum={10}
      lang={lang}
    />
  );
}

// =============================================================================
// Slide 10 — Four levers summary
// =============================================================================
function Slide10Levers({ data }) {
  const lang = pickLangBC(data);
  // Suffix on monetary metrics ("/yr" en, "/año" es, "/ano" pt). Currency
  // symbol stays "$" — the underlying *_M strings from the edge function are
  // already short-form (e.g. "24.5") and currency-symbol-free, and currency
  // conversion is explicitly out of scope per plan-presentations-multilingual.
  const suffix = window.tr(lang, 's10.per_year_suffix');
  const m = (key) => `$${data[key] || `{{${key}}}`}M${suffix}`;
  const commercial  = window.tr(lang, 's10.categories.commercial');
  const operational = window.tr(lang, 's10.categories.operational');
  const levers = [
    {
      n: '01', category: commercial,
      title:  window.tr(lang, 's10.levers.ar_uplift.title'),
      bullet: window.tr(lang, 's10.levers.ar_uplift.bullet'),
      detail: window.tr(lang, 's10.levers.ar_uplift.detail'),
      metric: m('TOTAL_ARUPTOT'),
    },
    {
      n: '02', category: commercial,
      title:  window.tr(lang, 's10.levers.apms.title'),
      bullet: window.tr(lang, 's10.levers.apms.bullet'),
      detail: window.tr(lang, 's10.levers.apms.detail'),
      metric: m('TOTAL_APMUPT'),
    },
    {
      n: '03', category: commercial,
      title:  window.tr(lang, 's10.levers.mdr.title'),
      bullet: window.tr(lang, 's10.levers.mdr.bullet'),
      detail: window.tr(lang, 's10.levers.mdr.detail'),
      metric: m('TOTAL_COST_REDTOT'),
    },
    {
      n: '04', category: operational,
      title:  window.tr(lang, 's10.levers.dev.title'),
      bullet: window.tr(lang, 's10.levers.dev.bullet'),
      detail: window.tr(lang, 's10.levers.dev.detail'),
      metric: m('TOTAL_DEV_SAVINGS'),
    },
  ];
  const grandTotal = data.GRAND_TOTAL || '{{GRAND_TOTAL}}';
  const tpvBase    = data.TPV_BASE    || '{{TPV_BASE}}';
  const clientName = data.clientName  || '{{client}}';

  return (
    <div className="slide theme-light" data-screen-label="10 Levers Summary">
      <SlideChrome section={window.tr(lang, 'common.business_case')} pageNum={11} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 36 }}>
          <div>
            <MonoKicker beam={false} style={{ marginBottom: 14 }}>{window.tr(lang, 's10.mono_kicker')}</MonoKicker>
            <h2 className="t-title t-title-m">
              {window.tr(lang, 's10.title_head')}<span className="accent">{window.tr(lang, 's10.title_accent')}</span>{window.tr(lang, 's10.title_tail')}
            </h2>
          </div>
          <p className="t-body" style={{ maxWidth: 420, textAlign: 'right', color: 'var(--ink-secondary)' }}>
            {window.tr(lang, 's10.subtitle')}
          </p>
        </div>

        <MonoKicker beam beamDelay={1.5}>{window.tr(lang, 's10.mono_breakdown')}</MonoKicker>

        {/* 4-card row */}
        <div className="stagger" style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18,
          '--stagger-base': '0.15s', '--stagger-step': '0.08s',
        }}>
          {levers.map((l, i) => (
            <div key={i} className="card-nova" style={{
              padding: 28, minHeight: 360, display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600,
                  color: 'var(--accent)', letterSpacing: '0.04em',
                }}>{l.n}</span>
                <span className="t-label" style={{ fontSize: 10, color: 'var(--ink-faint)' }}>{l.category}</span>
              </div>
              <div style={{
                fontSize: 22, fontWeight: 600, color: 'var(--ink-strong)',
                marginBottom: 10, lineHeight: 1.2, letterSpacing: '-0.01em',
              }}>{l.title}</div>
              <div style={{
                fontSize: 14, color: 'var(--accent)', fontWeight: 600,
                marginBottom: 10, lineHeight: 1.4,
              }}>{l.bullet}</div>
              <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink-secondary)' }}>{l.detail}</div>
              <div style={{
                marginTop: 'auto', paddingTop: 18,
                borderTop: '1px solid var(--border-subtle)',
              }}>
                <div className="t-label" style={{ color: 'var(--ink-muted)', marginBottom: 4, fontSize: 10 }}>{window.tr(lang, 's10.impact_label')}</div>
                <div className="t-number" style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent)' }}>{l.metric}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Grand total strip — hero card with border-beam */}
        <div className="card-nova card-hero border-beam" style={{
          flexShrink: 0, padding: '24px 36px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div className="t-label" style={{ color: 'var(--lime)', marginBottom: 4 }}>
              {window.tr(lang, 's10.hero_label')}
            </div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)' }}>
              {window.tr(lang, 's10.hero_desc')}
            </div>
          </div>
          <div className="t-number" style={{ fontSize: 56, fontWeight: 300, color: '#fff' }}>
            ${grandTotal}M{suffix}
          </div>
        </div>

        <div className="t-caption" style={{ flexShrink: 0, fontSize: 11, color: 'var(--ink-muted)' }}>
          {window.trf(lang, 's10.caption', { tpvBase, clientName })}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Region tabs slide — entry point for each region's 4-slide block
// =============================================================================
function RegionTabsSlide({ active, activeKey, pageNum, data }) {
  const lang = pickLangBC(data);
  // Region labels come from window.SDR_BC_REGION_LBL — same mapping as the
  // server-side REGION_LABELS_I18N constant so tab labels stay in sync with
  // the persisted regions_rendered entries.
  const regionLbl = window.SDR_BC_REGION_LBL && window.SDR_BC_REGION_LBL[lang] || window.SDR_BC_REGION_LBL?.en || {};
  const ALL_REGIONS = [
    { key: 'us',  label: regionLbl.us  || 'North America' },
    { key: 'lat', label: regionLbl.lat || 'LATAM' },
    { key: 'ema', label: regionLbl.ema || 'EMEA' },
    { key: 'apa', label: regionLbl.apa || 'APAC' },
  ];
  const renderedKeys = Array.isArray(data?.regions_rendered) && data.regions_rendered.length > 0
    ? data.regions_rendered.map(r => r.region)
    : ALL_REGIONS.map(r => r.key);
  const regions = ALL_REGIONS.filter(r => renderedKeys.includes(r.key));

  const activeIdx = activeKey
    ? Math.max(0, regions.findIndex(r => r.key === activeKey))
    : (typeof active === 'number' ? active : 0);
  const activeLabel = regions[activeIdx]?.label || regions[0]?.label || '';

  return (
    <div className="slide theme-light" data-screen-label={`${String(pageNum).padStart(2,'0')} Region · ${activeLabel}`}>
      <SlideChrome section={`${window.tr(lang, 'sRegion.section_prefix')}${activeLabel}`} pageNum={pageNum} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <MonoKicker beam beamDelay={1.5} style={{ marginBottom: 36 }}>
          {window.trf(lang, regions.length === 1 ? 'sRegion.mono_kicker_one' : 'sRegion.mono_kicker_many', { n: regions.length })}
        </MonoKicker>

        <div className="stagger" style={{
          display: 'flex', flexDirection: 'column', gap: 18,
          '--stagger-base': '0.2s', '--stagger-step': '0.08s',
        }}>
          {regions.map((r, i) => (
            <div key={r.key} className="card-nova" style={{
              padding: '24px 36px',
              display: 'flex', alignItems: 'center', gap: 32,
              background: i === activeIdx ? 'linear-gradient(160deg, rgba(62,79,224,0.06) 0%, rgba(255,255,255,1) 70%)' : 'var(--bg-elevated)',
              borderColor: i === activeIdx ? 'rgba(62,79,224,0.30)' : 'var(--border-subtle)',
              transition: 'all 400ms ease',
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: i === activeIdx ? 'var(--accent)' : 'var(--border-default)',
                boxShadow: i === activeIdx ? '0 0 0 6px rgba(62,79,224,0.14), 0 0 18px rgba(62,79,224,0.45)' : 'none',
                flexShrink: 0,
              }} />
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: i === activeIdx ? 80 : 56,
                fontWeight: i === activeIdx ? 600 : 300,
                letterSpacing: '-0.03em', lineHeight: 1,
                color: i === activeIdx ? 'var(--ink-strong)' : 'var(--ink-faint)',
                transition: 'all 400ms ease',
              }}>
                {r.label}
              </div>
              {i === activeIdx && (
                <div style={{
                  marginLeft: 'auto',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13, fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--accent)',
                }}>
                  {window.tr(lang, 'sRegion.in_focus')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Region cards slide — table of country-level cards math + hero conclusion
// =============================================================================
function RegionCardsSlide({ region, regionLabel, pageNum, data }) {
  const lang = pickLangBC(data);
  const key = region.toUpperCase();
  // Resolve the i18n-aware region label from the central dict so the slide
  // header, page label, and title all agree even when the dispatcher passes
  // the English label hard-coded.
  const regionLblMap = window.SDR_BC_REGION_LBL?.[lang] || window.SDR_BC_REGION_LBL?.en || {};
  const localizedRegion = regionLblMap[region] || regionLabel;
  const rows = data[`${region}_cards_rows`] || [1, 2, 3, 4, 5].map(i => ({
    country: `{{${key}_country${i}}}`,
    iso:     '',
    tpv:    `{{${key}_TPV${i}}}`,
    ar:     `{{${key}_ARUP${i}}}`,
    dtpv:   `{{${key}_TPVUP${i}}}`,
    cost:   `{{${key}_COST_RED${i}}}`,
  }));
  const tpvTot     = data[`${key}_TPV_TOT`]     || `{{${key}_TPV_TOT}}`;
  const tpvUpT     = data[`${key}_TPVUPT`]      || `{{${key}_TPVUPT}}`;
  const costRedTot = data[`${key}_COST_REDTOT`] || `{{${key}_COST_REDTOT}}`;
  const revenueUp  = data[`${key}_REVENUEUP`]   || `{{${key}_REVENUEUP}}`;
  const takeRate   = data.industry_take_rate_pct || 11;

  return (
    <div className="slide theme-light" data-screen-label={`${String(pageNum).padStart(2,'0')} ${localizedRegion} · Cards`}>
      <SlideChrome section={`${window.tr(lang, 'sRegion.section_prefix')}${localizedRegion}`} pageNum={pageNum} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 36 }}>
          <div>
            <MonoKicker beam={false} style={{ marginBottom: 14 }}>{window.trf(lang, 'sCards.mono_kicker', { region })}</MonoKicker>
            <h2 className="t-title t-title-m">
              {window.trf(lang, 'sCards.title_region_head', { regionLabel: localizedRegion })}<span className="accent">{window.tr(lang, 'sCards.title_accent')}</span>{window.tr(lang, 'sCards.title_tail')}
            </h2>
          </div>
          <p className="t-body" style={{ maxWidth: 420, textAlign: 'right', color: 'var(--ink-secondary)' }}>
            {window.trf(lang, rows.length === 1 ? 'sCards.subtitle_lead_one' : 'sCards.subtitle_lead_many', { n: rows.length })}
            <strong style={{ color: 'var(--ink-strong)' }}>{window.tr(lang, 'sCards.subtitle_strong_ar')}</strong>{window.tr(lang, 'sCards.subtitle_and')}
            <strong style={{ color: 'var(--ink-strong)' }}> {window.tr(lang, 'sCards.subtitle_strong_cost')}</strong>{window.tr(lang, 'sCards.subtitle_tail')}
          </p>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 28, minHeight: 0 }}>
          {/* Left: table */}
          <div className="card-nova" style={{ display: 'flex', flexDirection: 'column', padding: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />
              <span className="t-label" style={{ color: 'var(--accent-deep)' }}>{window.tr(lang, 'sCards.key_markets_label')}</span>
              <BeamRule delay={3} />
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
              <thead>
                <tr>
                  {[
                    window.tr(lang, 'sCards.th_market'),
                    window.tr(lang, 'sCards.th_tpv'),
                    window.tr(lang, 'sCards.th_d_ar'),
                    window.tr(lang, 'sCards.th_d_tpv'),
                    window.tr(lang, 'sCards.th_cost_red'),
                  ].map((h, i) => (
                    <th key={i} style={{
                      textAlign: i === 0 ? 'left' : 'right',
                      padding: '12px 8px', fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.14em', textTransform: 'uppercase',
                      color: 'var(--ink-muted)',
                      borderBottom: '1px solid var(--border-default)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '18px 8px', fontSize: 16, fontWeight: 600, color: 'var(--ink-strong)' }}>
                      {r.iso && (
                        <span style={{
                          display: 'inline-block', width: 32,
                          fontFamily: 'var(--font-mono)', fontSize: 11,
                          color: 'var(--ink-muted)', fontWeight: 500,
                        }}>{r.iso}</span>
                      )}
                      {r.country}
                    </td>
                    <td className="t-number" style={{ padding: '18px 8px', textAlign: 'right', color: 'var(--ink)' }}>${r.tpv}M</td>
                    <td style={{ padding: '18px 8px', textAlign: 'right', color: 'var(--accent)', fontWeight: 600 }}>{r.ar}pp</td>
                    <td className="t-number" style={{ padding: '18px 8px', textAlign: 'right', color: 'var(--ink)' }}>${r.dtpv}M</td>
                    <td className="t-number" style={{ padding: '18px 8px', textAlign: 'right', color: 'var(--ink)' }}>${r.cost}M</td>
                  </tr>
                ))}
                <tr style={{ background: 'rgba(62,79,224,0.05)' }}>
                  <td style={{ padding: '20px 8px', fontWeight: 700, color: 'var(--ink-strong)', borderRadius: '10px 0 0 10px' }}>{window.tr(lang, 'sCards.total_row')}</td>
                  <td className="t-number" style={{ padding: '20px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--ink-strong)' }}>${tpvTot}M</td>
                  <td style={{ padding: '20px 8px', textAlign: 'right', color: 'var(--ink-muted)' }}>—</td>
                  <td className="t-number" style={{ padding: '20px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>${tpvUpT}M</td>
                  <td className="t-number" style={{ padding: '20px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)', borderRadius: '0 10px 10px 0' }}>${costRedTot}M</td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: 'auto', paddingTop: 18, fontSize: 11, color: 'var(--ink-muted)', lineHeight: 1.6 }}>
              {window.tr(lang, 'sCards.table_footer')}
            </div>
          </div>

          {/* Right: hero conclusion with border-beam */}
          <div className="card-nova card-hero border-beam" style={{ padding: 36, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--lime)' }} />
              <span className="t-label" style={{ color: 'var(--lime)' }}>{window.tr(lang, 'sCards.conclusions_label')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, flex: 1 }}>
              <div>
                <div className="t-number" style={{ fontSize: 56, fontWeight: 300, lineHeight: 1, color: '#fff' }}>
                  ${costRedTot}<span style={{ fontSize: 22, opacity: 0.7, marginLeft: 6 }}>M</span>
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 8, lineHeight: 1.5 }}>
                  {window.tr(lang, 'sCards.conclusions_cost_desc')}
                </div>
              </div>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.18)' }} />
              <div>
                <div className="t-number" style={{ fontSize: 56, fontWeight: 300, lineHeight: 1, color: '#fff' }}>
                  ${tpvUpT}<span style={{ fontSize: 22, opacity: 0.7, marginLeft: 6 }}>M</span>
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 8, lineHeight: 1.5 }}>
                  {window.tr(lang, 'sCards.conclusions_tpv_desc')}
                </div>
              </div>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.18)' }} />
              <div>
                <div className="t-number" style={{ fontSize: 56, fontWeight: 300, lineHeight: 1, color: '#fff' }}>
                  ${revenueUp}<span style={{ fontSize: 22, opacity: 0.7, marginLeft: 6 }}>M</span>
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 8, lineHeight: 1.5 }}>
                  {window.trf(lang, 'sCards.conclusions_revenue_desc', { takeRate })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Region APMs slide
// =============================================================================
function RegionApmsSlide({ region, regionLabel, pageNum, data }) {
  const lang = pickLangBC(data);
  const regionLblMap = window.SDR_BC_REGION_LBL?.[lang] || window.SDR_BC_REGION_LBL?.en || {};
  const localizedRegion = regionLblMap[region] || regionLabel;
  const key = region.toUpperCase();
  const rows = data[`${region}_apms_rows`] || [1, 2, 3, 4, 5].map(i => ({
    country: `{{${key}_country${i}}}`,
    iso:     '',
    apms:    `{{${key}_APM_COUNTRY${i}}}`,
    dtpv:    `{{${key}_APMUP${i}}}`,
    cost:    `{{${key}_COST_APMRED${i}}}`,
  }));
  // Replace any "already covered" English fallback strings emitted by the
  // edge function with the localized variant. The edge function always emits
  // English ("— (already covered)") because translation lives client-side.
  const alreadyCovered = window.tr(lang, 'sApms.already_covered');
  const localizedRows = rows.map(r => (
    typeof r.apms === 'string' && r.apms === '— (already covered)'
      ? { ...r, apms: alreadyCovered }
      : r
  ));
  const apmUpT     = data[`${key}_APMUPT`]         || `{{${key}_APMUPT}}`;
  const apmCostTot = data[`${key}_COST_APMREDTOT`] || `{{${key}_COST_APMREDTOT}}`;

  return (
    <div className="slide theme-light" data-screen-label={`${String(pageNum).padStart(2,'0')} ${localizedRegion} · APMs`}>
      <SlideChrome section={`${window.tr(lang, 'sRegion.section_prefix')}${localizedRegion}`} pageNum={pageNum} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 36 }}>
          <div>
            <MonoKicker beam={false} style={{ marginBottom: 14 }}>{window.trf(lang, 'sApms.mono_kicker', { region })}</MonoKicker>
            <h2 className="t-title t-title-m">
              {window.trf(lang, 'sApms.title_region_head', { regionLabel: localizedRegion })}<span className="accent">{window.tr(lang, 'sApms.title_accent')}</span>{window.tr(lang, 'sApms.title_tail')}
            </h2>
          </div>
          <p className="t-body" style={{ maxWidth: 420, textAlign: 'right', color: 'var(--ink-secondary)' }}>
            {window.tr(lang, 'sApms.subtitle')}
          </p>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 28, minHeight: 0 }}>
          {/* Left: table */}
          <div className="card-nova" style={{ display: 'flex', flexDirection: 'column', padding: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />
              <span className="t-label" style={{ color: 'var(--accent-deep)' }}>{window.tr(lang, 'sApms.proposed_label')}</span>
              <BeamRule delay={2.5} />
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
              <thead>
                <tr>
                  {[
                    window.tr(lang, 'sApms.th_market'),
                    window.tr(lang, 'sApms.th_proposed_apms'),
                    window.tr(lang, 'sApms.th_d_tpv'),
                    window.tr(lang, 'sApms.th_cost_red'),
                  ].map((h, i) => (
                    <th key={i} style={{
                      textAlign: i === 0 ? 'left' : (i === 1 ? 'left' : 'right'),
                      padding: '12px 8px', fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.14em', textTransform: 'uppercase',
                      color: 'var(--ink-muted)',
                      borderBottom: '1px solid var(--border-default)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {localizedRows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '16px 8px', fontSize: 15, fontWeight: 600, color: 'var(--ink-strong)' }}>
                      {r.iso && (
                        <span style={{
                          display: 'inline-block', width: 32,
                          fontFamily: 'var(--font-mono)', fontSize: 11,
                          color: 'var(--ink-muted)', fontWeight: 500,
                        }}>{r.iso}</span>
                      )}
                      {r.country}
                    </td>
                    <td style={{ padding: '16px 8px', fontSize: 13, color: 'var(--ink-secondary)', lineHeight: 1.4 }}>{r.apms}</td>
                    <td className="t-number" style={{ padding: '16px 8px', textAlign: 'right', color: 'var(--ink)' }}>${r.dtpv}M</td>
                    <td className="t-number" style={{ padding: '16px 8px', textAlign: 'right', color: 'var(--ink)' }}>${r.cost}M</td>
                  </tr>
                ))}
                <tr style={{ background: 'rgba(62,79,224,0.05)' }}>
                  <td style={{ padding: '18px 8px', fontWeight: 700, color: 'var(--ink-strong)', borderRadius: '10px 0 0 10px' }}>{window.tr(lang, 'sApms.total_row')}</td>
                  <td style={{ padding: '18px 8px' }} />
                  <td className="t-number" style={{ padding: '18px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>${apmUpT}M</td>
                  <td className="t-number" style={{ padding: '18px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)', borderRadius: '0 10px 10px 0' }}>${apmCostTot}M</td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: 'auto', paddingTop: 18, fontSize: 11, color: 'var(--ink-muted)', lineHeight: 1.6 }}>
              {window.tr(lang, 'sApms.table_footer')}
            </div>
          </div>

          {/* Right: dark conclusion card */}
          <div className="card-nova card-dark border-beam" style={{ padding: 36, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--lime)' }} />
              <span className="t-label" style={{ color: 'var(--lime)' }}>{window.tr(lang, 'sApms.conclusions_label')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28, flex: 1 }}>
              <div>
                <div className="t-number" style={{ fontSize: 60, fontWeight: 300, lineHeight: 1, color: '#fff' }}>
                  ${apmUpT}<span style={{ fontSize: 22, opacity: 0.7, marginLeft: 6 }}>M</span>
                </div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.72)', marginTop: 10, lineHeight: 1.5 }}>
                  {window.tr(lang, 'sApms.conclusions_tpv_desc')}
                </div>
              </div>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.14)' }} />
              <div>
                <div className="t-number" style={{ fontSize: 60, fontWeight: 300, lineHeight: 1, color: 'var(--lime)' }}>
                  ${apmCostTot}<span style={{ fontSize: 22, opacity: 0.7, marginLeft: 6 }}>M</span>
                </div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.72)', marginTop: 10, lineHeight: 1.5 }}>
                  {window.tr(lang, 'sApms.conclusions_cost_desc')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Region Dev slide — team integration cost + savings conclusion
// =============================================================================
function RegionDevSlide({ region, regionLabel, pageNum, data }) {
  const lang = pickLangBC(data);
  const regionLblMap = window.SDR_BC_REGION_LBL?.[lang] || window.SDR_BC_REGION_LBL?.en || {};
  const localizedRegion = regionLblMap[region] || regionLabel;
  const key = region.toUpperCase();
  const rawRows = data[`${region}_dev_rows`] || [
    { team: 'Product',            m: 2250,  i: 6750,  all: null },
    { team: 'Engineering',        m: 10500, i: 31500, all: null },
    { team: 'Fraud/Risk',         m: 2250,  i: 6750,  all: null },
    { team: 'Treasury',           m: 1350,  i: 4050,  all: null },
    { team: 'Compliance',         m: 1500,  i: 4500,  all: null },
    { team: 'Finance',            m: 1125,  i: 3375,  all: null },
    { team: 'Banking & Payments', m: 2625,  i: 7875,  all: null },
  ];
  // Localise team names — the edge function emits the English canonical names
  // (Product, Engineering, …) since those are also the dict keys.
  const teamNameMap = window.SDR_BC_I18N?.sDev?.teams || {};
  const teams = rawRows.map((r, i) => {
    const en = r.team || r.t;
    const localizedNode = teamNameMap[en];
    const t = (localizedNode && (localizedNode[lang] || localizedNode.en)) || en;
    return {
      t,
      m: r.m,
      i: r.i,
      all: typeof r.all === 'number' ? r.all : null,
      _idx: i,
    };
  });
  const totalM = teams.reduce((a, b) => a + (b.m || 0), 0);
  const totalI = teams.reduce((a, b) => a + (b.i || 0), 0);
  const totalAll = teams.every(t => typeof t.all === 'number')
    ? teams.reduce((a, b) => a + b.all, 0)
    : null;
  const devSavingsTot = data[`${key}_DEV_SAVINGSTOT`] || `{{${key}_DEV_SAVINGSTOT}}`;
  // The edge function emits time as "12 mo" or "2.5 yrs" (English unit suffix).
  // Swap the suffix for the localised one when language != en.
  let devTime = data[`${key}_DEV_TIME`] || `{{${key}_DEV_TIME}}`;
  if (typeof devTime === 'string' && lang !== 'en') {
    devTime = devTime
      .replace(/\bmo\b/, window.tr(lang, 'sDev.time_months_short'))
      .replace(/\byrs\b/, window.tr(lang, 'sDev.time_years_short'));
  }
  // Build assumptions caption — split shows X APMs + Y PSPs when the region has
  // any market without local entity (Yuno covers the local PSP for those).
  const numApmsInteg = data[`${key}_DEV_NUM_APMS_INTEG`];
  const numPspsInteg = data[`${key}_DEV_NUM_PSPS_INTEG`];
  const hasAssumptionsTokens = typeof numApmsInteg === 'number';
  const assumptionsText = hasAssumptionsTokens
    ? (numPspsInteg > 0
        ? window.trf(lang, 'sDev.assumptions_apms_psps', { apms: numApmsInteg, psps: numPspsInteg })
        : window.trf(lang, 'sDev.assumptions_apms_only', { apms: numApmsInteg }))
    : null;

  return (
    <div className="slide theme-light" data-screen-label={`${String(pageNum).padStart(2,'0')} ${localizedRegion} · Dev`}>
      <SlideChrome section={`${window.tr(lang, 'sRegion.section_prefix')}${localizedRegion}`} pageNum={pageNum} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 36 }}>
          <div>
            <MonoKicker beam={false} style={{ marginBottom: 14 }}>{window.trf(lang, 'sDev.mono_kicker', { region })}</MonoKicker>
            <h2 className="t-title t-title-m">
              {window.trf(lang, 'sDev.title_region_head', { regionLabel: localizedRegion })}<span className="accent">{window.tr(lang, 'sDev.title_accent')}</span>{window.tr(lang, 'sDev.title_tail')}
            </h2>
          </div>
          <p className="t-body" style={{ maxWidth: 420, textAlign: 'right', color: 'var(--ink-secondary)' }}>
            {window.tr(lang, 'sDev.subtitle')}
          </p>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 28, minHeight: 0 }}>
          {/* Left: team table */}
          <div className="card-nova" style={{ display: 'flex', flexDirection: 'column', padding: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />
              <span className="t-label" style={{ color: 'var(--accent-deep)' }}>{window.tr(lang, 'sDev.teams_label')}</span>
              <BeamRule delay={2.5} />
            </div>
            {assumptionsText && (
              <div style={{
                marginBottom: 14,
                padding: '10px 14px',
                background: 'rgba(62,79,224,0.06)',
                borderLeft: '2px solid var(--accent)',
                borderRadius: '0 8px 8px 0',
                fontSize: 12,
                lineHeight: 1.5,
                color: 'var(--ink-secondary)',
              }}>
                <span style={{ fontWeight: 700, color: 'var(--accent-deep)', marginRight: 6 }}>
                  {window.tr(lang, 'sDev.assumptions_label')}:
                </span>
                {assumptionsText}
              </div>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  {[
                    window.tr(lang, 'sDev.th_team'),
                    window.tr(lang, 'sDev.th_cost_month'),
                    window.tr(lang, 'sDev.th_per_integ'),
                    window.tr(lang, 'sDev.th_all_integ'),
                  ].map((h, i) => (
                    <th key={i} style={{
                      textAlign: i === 0 ? 'left' : 'right',
                      padding: '12px 8px', fontSize: 10, fontWeight: 700,
                      letterSpacing: '0.14em', textTransform: 'uppercase',
                      color: 'var(--ink-muted)',
                      borderBottom: '1px solid var(--border-default)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teams.map((t, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '13px 8px', fontSize: 14, fontWeight: 600, color: 'var(--ink-strong)' }}>{t.t}</td>
                    <td className="t-number" style={{ padding: '13px 8px', textAlign: 'right', color: 'var(--ink)' }}>${t.m.toLocaleString()}</td>
                    <td className="t-number" style={{ padding: '13px 8px', textAlign: 'right', color: 'var(--ink)' }}>${t.i.toLocaleString()}</td>
                    <td className="t-number" style={{ padding: '13px 8px', textAlign: 'right', color: 'var(--ink)' }}>
                      {t.all === null ? `\${{${key}_DEV_SAVINGS${i+1}}}` : `$${t.all.toLocaleString()}`}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: 'rgba(62,79,224,0.05)' }}>
                  <td style={{ padding: '16px 8px', fontWeight: 700, color: 'var(--ink-strong)', borderRadius: '10px 0 0 10px' }}>{window.tr(lang, 'sDev.total_row')}</td>
                  <td className="t-number" style={{ padding: '16px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--ink-strong)' }}>${totalM.toLocaleString()}</td>
                  <td className="t-number" style={{ padding: '16px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--ink-strong)' }}>${totalI.toLocaleString()}</td>
                  <td className="t-number" style={{ padding: '16px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)', borderRadius: '0 10px 10px 0' }}>
                    {totalAll === null ? `\${{${key}_DEV_ALL_INTEG_TOT}}` : `$${totalAll.toLocaleString()}`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Right: hero conclusion */}
          <div className="card-nova card-hero border-beam" style={{ padding: 36, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--lime)' }} />
              <span className="t-label" style={{ color: 'var(--lime)' }}>{window.tr(lang, 'sDev.conclusions_label')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28, flex: 1 }}>
              <div>
                <div className="t-number" style={{ fontSize: 60, fontWeight: 300, lineHeight: 1, color: '#fff' }}>
                  ${devSavingsTot}<span style={{ fontSize: 22, opacity: 0.7, marginLeft: 6 }}>M</span>
                </div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', marginTop: 10, lineHeight: 1.5 }}>
                  {window.tr(lang, 'sDev.conclusions_savings_desc')}
                </div>
              </div>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.18)' }} />
              <div>
                <div className="t-number" style={{ fontSize: 60, fontWeight: 300, lineHeight: 1, color: 'var(--lime)' }}>
                  {devTime}
                </div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', marginTop: 10, lineHeight: 1.5 }}>
                  {window.tr(lang, 'sDev.conclusions_time_desc')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PDF download button — unchanged contract (uses window.SDR_BC_TRACKING.slug)
// =============================================================================
function SdrBcDownloadPdfButton({ clientName, lang }) {
  const l = (lang === 'es' || lang === 'pt' || lang === 'en') ? lang : 'en';
  const [state, setState] = React.useState('idle'); // idle | loading | error
  const baseStyle = {
    background: 'transparent',
    color: '#fff',
    border: '1.5px solid rgba(224, 237, 128, 0.55)',
    borderRadius: 12,
    padding: '14px 28px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    fontFamily: 'inherit',
  };
  const onClick = async (e) => {
    e.preventDefault();
    if (state === 'loading') return;
    const slug = window.SDR_BC_TRACKING && window.SDR_BC_TRACKING.slug;
    if (!slug) { setState('error'); return; }
    setState('loading');
    try {
      const r = await fetch(`https://bridge.yuno.tools/api/sdr-bc/${slug}/pdf`, { credentials: 'omit' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(clientName || 'sdr-business-case').replace(/[^\w\s.-]/g, '').replace(/\s+/g, '-')}-sdr-business-case.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setState('idle');
    } catch (err) {
      console.error('[sdr-bc-pdf] download failed', err);
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  };
  const label = state === 'loading'
    ? window.tr(l, 's27.pdf_loading')
    : state === 'error'
      ? window.tr(l, 's27.pdf_error')
      : window.tr(l, 's27.pdf_idle');
  return (
    <button
      onClick={onClick}
      disabled={state === 'loading'}
      style={{ ...baseStyle, opacity: state === 'loading' ? 0.7 : 1, cursor: state === 'loading' ? 'wait' : 'pointer' }}
      className="no-print"
    >
      {label}
    </button>
  );
}

// =============================================================================
// Slide 27 — The Proposal (closing CTA)
// =============================================================================
function Slide27Total({ data }) {
  const lang = pickLangBC(data);
  const clientName  = data.clientName  || '{{client}}';
  const grandTotal  = data.GRAND_TOTAL || '{{GRAND_TOTAL}}';
  const vendorName  = data.vendor_name  || (data.contact && data.contact.name)  || 'Yuno Sales Team';
  const vendorTitle = data.vendor_title || (data.contact && data.contact.title) || 'Sales Strategy';
  const vendorEmail = data.vendor_email || (data.contact && data.contact.email) || 'sales@y.uno';
  const vendorPhone = data.vendor_phone || (data.contact && data.contact.phone) || '';
  const demoUrl     = data.vendor_demo_url || '';
  const avatarUrl   = data.vendor_avatar_url || '';

  const initials = String(vendorName)
    .split(/\s+/)
    .filter(s => s && !/^(de|del|la|los|las|von|van|el)$/i.test(s))
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className="slide theme-dark" data-screen-label="27 The Proposal">
      <div style={{
        position: 'absolute', top: '10%', left: '-10%', width: '60%', height: '90%',
        background: 'radial-gradient(circle, rgba(62,79,224,0.30) 0%, rgba(62,79,224,0) 60%)',
        animation: 'orbDrift 24s ease-in-out infinite', pointerEvents: 'none',
      }} />
      <SlideChrome section={window.tr(lang, 'common.the_proposal')} pageNum={28} footer={`${window.tr(lang, 's27.footer_prefix')}${clientName}`} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 5 }}>
        <MonoKicker
          beam beamDelay={1.5}
          beamProps={{ base: 'var(--beam-base-dark)', beam: 'var(--beam-bright-dark)' }}
          style={{ marginBottom: 24, color: 'var(--lime)' }}
        >
          {window.tr(lang, 's27.mono_kicker')}
        </MonoKicker>

        <div className="t-number" style={{
          fontFamily: 'var(--font-display)', fontSize: 200, fontWeight: 200,
          letterSpacing: '-0.05em', lineHeight: 0.95, color: '#fff',
        }}>
          <span style={{
            background: 'var(--title-gradient-dark)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text',
            WebkitTextFillColor: 'transparent', fontWeight: 600,
          }}>{window.trf(lang, 's27.headline_accent', { grandTotal })}</span>{' '}
          <span style={{ fontSize: 80, color: 'rgba(255,255,255,0.6)', fontWeight: 300, letterSpacing: '-0.02em' }}>
            {window.tr(lang, 's27.headline_tail')}
          </span>
        </div>
        <p className="t-body-l" style={{
          marginTop: 32, maxWidth: 1100, lineHeight: 1.5, color: 'rgba(255,255,255,0.78)',
        }}>
          {window.tr(lang, 's27.lead')}<strong style={{ color: '#fff' }}>{window.tr(lang, 's27.lead_strong')}</strong>{window.trf(lang, 's27.lead_tail', { clientName })}
        </p>

        {/* CTA row */}
        <div style={{ marginTop: 36, display: 'flex', gap: 16, alignItems: 'center' }}>
          {demoUrl && (
            <a
              href={demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="no-print"
              style={{
                background: 'var(--lime)',
                color: 'var(--bg-section)',
                borderRadius: 12,
                padding: '16px 32px',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                fontFamily: 'inherit',
              }}
            >
              {window.tr(lang, 's27.cta_workshop')}
            </a>
          )}
          <SdrBcDownloadPdfButton clientName={clientName} lang={lang} />
        </div>
      </div>

      {/* Bottom: contact card */}
      <div style={{ position: 'relative', zIndex: 5, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24 }}>
        <div className="border-beam" style={{
          padding: '24px 32px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 18, backdropFilter: 'blur(10px)',
        }}>
          <div className="t-label" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>
            {window.tr(lang, 's27.next_step_label')}
          </div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500,
            letterSpacing: '-0.02em', lineHeight: 1.15, color: '#fff',
          }}>
            {window.tr(lang, 's27.next_step_body')}
          </div>
        </div>
        <div style={{
          padding: '24px 32px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 18,
          display: 'flex', alignItems: 'center', gap: 18,
        }}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={vendorName}
              style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(224,237,128,0.18)',
              color: 'var(--lime)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700, letterSpacing: '0.04em',
              flexShrink: 0,
            }}>
              {initials || 'Y'}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-label" style={{ color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
              {window.tr(lang, 's27.prepared_by')}
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', letterSpacing: '-0.01em' }}>{vendorName}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
              {vendorTitle ? `${vendorTitle}` : ''}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-pale)', marginTop: 4 }}>
              {vendorEmail}
            </div>
            {vendorPhone && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                {vendorPhone}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Export
// =============================================================================
Object.assign(window, {
  Slide09BCSection, Slide10Levers,
  RegionTabsSlide, RegionCardsSlide, RegionApmsSlide, RegionDevSlide,
  Slide27Total, SdrBcDownloadPdfButton,
});
