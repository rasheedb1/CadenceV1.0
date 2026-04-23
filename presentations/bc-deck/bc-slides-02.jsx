/* Business Case Deck — Slides 13-24 */

function BCSlide13() {
  return (
    <div className="slide theme-ink-hero" data-screen-label="13 Section: Business Case">
      <div className="ink-grid" />
      <OrbHalftone size={900} color="#E0ED80" x="20%" y="40%" style={{ opacity: 0.35 }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
        <div className="section-glyph anim-in">03</div>
        <h2 className="t-title anim-in anim-in-2" style={{ fontSize: 108, fontWeight: 300, color: '#fff' }}>The business case</h2>
      </div>
      <SlideFooter section="the business case" pageNum={13} total={26} />
    </div>
  );
}

function BCSlide14({ data }) {
  const rows = [
    { label: 'annual TPV', value: fmtMoney(data.tpv) },
    { label: 'avg ticket size', value: '$' + data.avgTicket },
    { label: 'current approval rate', value: fmtPct(data.currentApproval) },
    { label: 'current blended MDR', value: fmtPct(data.currentMDR, 2) },
    { label: 'active markets', value: String(data.activeMarkets) },
    { label: 'payment methods', value: String(data.currentAPMs) },
    { label: 'gross margin', value: fmtPct(data.grossMargin, 0) },
  ];
  return (
    <div className="slide theme-ink" data-screen-label="14 Assumptions">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / the business case</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>Starting line</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 48 }}>
          <div>
            <div className="t-label anim-in" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>assumptions</div>
            {rows.map((r, i) => (
              <div key={i} className={'anim-in anim-in-' + (i + 1)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)' }}>{r.label}</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#fff', letterSpacing: '-0.01em' }}>{r.value}</div>
              </div>
            ))}
          </div>
          <div className="anim-in anim-in-8" style={{ background: 'rgba(140,153,255,0.06)', border: '1px solid rgba(140,153,255,0.12)', borderRadius: 16, padding: 32, alignSelf: 'start' }}>
            <div className="t-label" style={{ color: '#8C99FF', marginBottom: 16 }}>guardrails</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8 }}>
              {'\u2022'} All projections use base case (P50) estimates<br/>
              {'\u2022'} Approval lift benchmarked against Yuno client portfolio<br/>
              {'\u2022'} MDR savings validated with processor market rates<br/>
              {'\u2022'} Ops savings based on Yuno implementation data<br/>
              {'\u2022'} No value attributed to fraud reduction
            </div>
          </div>
        </div>
      </div>
      <SlideFooter section="the business case" pageNum={14} total={26} />
    </div>
  );
}

function BCSlide15({ data }) {
  const currentApproval = data.currentApproval;
  const targetApproval = data.targetApproval;
  const incrTPV = data.incrTPV_approvals;
  const incrMargin = data.L1;
  const approvalLiftPp = data.approvalLiftPp;
  const grossMarginPct = data.grossMargin;
  const lineData = [
    { name: 'with Yuno', color: '#E0ED80', points: [
      { x: 0, y: currentApproval, label: 'day 0' }, { x: 15, y: currentApproval + 1.2, label: '' },
      { x: 30, y: currentApproval + 3.1, label: 'day 30' }, { x: 45, y: currentApproval + 4.6, label: '' },
      { x: 60, y: currentApproval + 5.9, label: 'day 60' }, { x: 75, y: currentApproval + 6.8, label: '' },
      { x: 90, y: targetApproval, label: 'day 90' },
    ]},
    { name: 'without Yuno', color: 'rgba(255,255,255,0.25)', dashed: true, points: [
      { x: 0, y: currentApproval, label: '' }, { x: 15, y: currentApproval + 0.1, label: '' },
      { x: 30, y: currentApproval + 0.2, label: '' }, { x: 45, y: currentApproval + 0.2, label: '' },
      { x: 60, y: currentApproval + 0.3, label: '' }, { x: 75, y: currentApproval + 0.3, label: '' },
      { x: 90, y: currentApproval + 0.3, label: '' },
    ]},
  ];
  return (
    <div className="slide theme-ink-2" data-screen-label="15 Lever 1: Approvals">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / lever 01</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 56, fontWeight: 300, color: '#fff', marginBottom: 8 }}>Lever 01: approvals</h2>
        <div className="t-subtitle-alt anim-in anim-in-1" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 40 }}>smart routing + retries + network tokens</div>
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <KPI label="current approval" value={fmtPct(currentApproval)} style={{}} />
            <KPI label="target approval" value={fmtPct(targetApproval)} sub={"+" + approvalLiftPp + "pp with Yuno"} style={{}} />
            <KPI label="incremental TPV" value={fmtMoney(incrTPV)} style={{}} />
            <KPI label="incremental margin" value={fmtMoney(incrMargin)} sub={"@ " + grossMarginPct + "% gross margin"} style={{}} />
            <div className="anim-in anim-in-6" style={{ background: 'rgba(224,237,128,0.06)', border: '1px solid rgba(224,237,128,0.12)', borderRadius: 10, padding: '14px 18px', marginTop: 8 }}>
              <div className="t-label" style={{ color: '#E0ED80', marginBottom: 6 }}>proof point</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>inDrive achieved +90% approval rate with Yuno smart routing in LATAM</div>
            </div>
          </div>
          <div className="anim-in anim-in-3">
            <LineChart series={lineData} width={900} height={380} yMax={Math.ceil(targetApproval + 3)} yMin={Math.floor(currentApproval - 2)} />
          </div>
        </div>
      </div>
      <SlideFooter section="the business case" pageNum={16} total={26} />
    </div>
  );
}

function BCSlide16({ data }) {
  const currentMDRPct = data.currentMDR;
  const targetMDRPct = data.targetMDR;
  const mdrReductionBps = data.mdrReductionBps;
  const savings = data.L2;
  const breakdown = [
    { name: 'interchange optimization', bps: 18, pct: 47 },
    { name: 'multi-acquirer arbitrage', bps: 12, pct: 32 },
    { name: 'cross-border reduction', bps: 6, pct: 16 },
    { name: 'scheme fee optimization', bps: 2, pct: 5 },
  ];
  return (
    <div className="slide theme-ink" data-screen-label="16 Lever 2: MDR">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / lever 02</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 56, fontWeight: 300, color: '#fff', marginBottom: 8 }}>Lever 02: MDR optimization</h2>
        <div className="t-subtitle-alt anim-in anim-in-1" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 40 }}>multi-acquirer routing + local processing + scheme optimization</div>
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <KPI label="current blended MDR" value={fmtPct(currentMDRPct, 2)} />
            <KPI label="target blended MDR" value={fmtPct(targetMDRPct, 2)} sub={'\u2212' + mdrReductionBps + ' bps with Yuno'} />
            <KPI label="annual savings" value={fmtMoney(savings)} />
          </div>
          <div className="anim-in anim-in-3">
            <div className="t-label" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>savings breakdown</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {breakdown.map((b, i) => (
                <div key={i} className={'anim-in anim-in-' + (i + 3)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 15, color: '#fff' }}>{b.name}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#E0ED80' }}>{'\u2212'}{b.bps} bps</div>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: b.pct + '%', height: '100%', background: 'linear-gradient(90deg, #8C99FF, #6B7BFF)', borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <SlideFooter section="the business case" pageNum={17} total={26} />
    </div>
  );
}

function BCSlide17({ data }) {
  const incrTPV = data.incrTPV_apms;
  const incrMargin = data.L3;
  const apmUpliftPct = data.apmUpliftPct;
  const newAPMsAdded = data.newAPMsAdded;
  const grossMarginPct = data.grossMargin;
  const regions = [
    { name: 'brazil', methods: 'PIX, Boleto', color: '#E0ED80' },
    { name: 'india', methods: 'UPI, Paytm, PhonePe', color: '#8C99FF' },
    { name: 'mexico', methods: 'OXXO, SPEI, CoDi', color: '#E0ED80' },
    { name: 'gulf', methods: 'mada, KNET, Fawry', color: '#8C99FF' },
    { name: 'europe', methods: 'iDEAL, Bancontact, BLIK', color: '#E0ED80' },
    { name: 'SE asia', methods: 'GCash, GrabPay, DANA', color: '#8C99FF' },
  ];
  return (
    <div className="slide theme-ink-2" data-screen-label="17 Lever 3: APMs">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / lever 03</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 56, fontWeight: 300, color: '#fff', marginBottom: 8 }}>Lever 03: alternative payment methods</h2>
        <div className="t-subtitle-alt anim-in anim-in-1" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 40 }}>activate local methods across every market from one integration</div>
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <KPI label="new methods activated" value={"+" + newAPMsAdded} />
            <KPI label="conversion uplift" value={"+" + apmUpliftPct + "%"} sub="varies by market" />
            <KPI label="incremental TPV" value={fmtMoney(incrTPV)} />
            <KPI label="incremental margin" value={fmtMoney(incrMargin)} sub={"@ " + grossMarginPct + "% gross margin"} />
          </div>
          <div className="anim-in anim-in-3">
            <div className="t-label" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>regional activation map</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {regions.map((r, i) => (
                <div key={i} className={'anim-in anim-in-' + (i + 3)} style={{ padding: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: r.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{r.name}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{r.methods}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <SlideFooter section="the business case" pageNum={18} total={26} />
    </div>
  );
}

function BCSlide18({ data }) {
  return (
    <div className="slide theme-ink" data-screen-label="18 Lever 4: Ops">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / lever 04</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 56, fontWeight: 300, color: '#fff', marginBottom: 8 }}>Lever 04: operational savings</h2>
        <div className="t-subtitle-alt anim-in anim-in-1" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 40 }}>consolidate providers, automate reconciliation, reduce headcount</div>
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <KPI label="FTE freed" value={String(data.fteFreed)} sub="payments ops & engineering" />
            <KPI label="avoided build cost" value={fmtMoney((data.buildVsBuy.maintenance.build - data.buildVsBuy.maintenance.yuno) / 3, { decimals: 1 })} sub="per year in engineering" />
            <KPI label="reconciliation automated" value="80%" sub="vs. manual matching today" />
          </div>
          <div className="anim-in anim-in-3">
            <div className="t-label" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>build vs. buy: 3-year TCO</div>
            <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'rgba(255,255,255,0.04)', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="t-label" style={{ color: 'rgba(255,255,255,0.4)' }}></div>
                <div className="t-label" style={{ color: '#FF6A6A', textAlign: 'center' }}>build in-house</div>
                <div className="t-label" style={{ color: '#E0ED80', textAlign: 'center' }}>yuno</div>
              </div>
              {[
                { label: 'integration', build: data.buildVsBuy.integration.build, yuno: 0, yunoNote: 'bundled' },
                { label: 'maintenance', build: data.buildVsBuy.maintenance.build, yuno: 0, yunoNote: 'bundled' },
                { label: 'saas platform (3yr)', build: data.buildVsBuy.ops.build, yuno: data.saasAnnualFee * 3 },
                { label: 'transaction fees (3yr)', build: data.buildVsBuy.compliance.build, yuno: data.txAnnualFee * 3 },
                ...(Number(data.reconciliationAnnualFee) > 0 ? [{ label: 'reconciliation (3yr)', build: 0, buildNote: 'n/a', yuno: data.reconciliationAnnualFee * 3 }] : []),
              ].map((r, i) => (
                <div key={i} className={'anim-in anim-in-' + (i + 4)} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>{r.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>{r.buildNote ? <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, fontWeight: 500 }}>{r.buildNote}</span> : fmtMoney(r.build, { decimals: 1 })}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#E0ED80', textAlign: 'center' }}>{r.yunoNote ? <span style={{ color: 'rgba(224,237,128,0.55)', fontSize: 13, fontWeight: 500 }}>{r.yunoNote}</span> : fmtMoney(r.yuno, { decimals: 1 })}</div>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '18px 20px', background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>3yr total</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#FF6A6A', textAlign: 'center' }}>{fmtMoney(data.buildTotal3yr, { decimals: 1 })}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#E0ED80', textAlign: 'center' }}>{fmtMoney(data.yunoAnnualFee * 3, { decimals: 1 })}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <SlideFooter section="the business case" pageNum={19} total={26} />
    </div>
  );
}

function BCSlide19({ data }) {
  const total = data.netAnnualGain;
  const fee = data.yunoAnnualFee;
  const wfData = [
    { kind: 'base', value: 0.001, label: 'baseline|status quo' },
    { kind: 'gain', value: data.L1, label: 'approvals|+' + data.approvalLiftPp + 'pp' },
    { kind: 'gain', value: data.L2, label: 'MDR|\u2212' + data.mdrReductionBps + ' bps' },
    { kind: 'gain', value: data.L3, label: 'new APMs|+' + data.apmUpliftPct + '% TPV' },
    { kind: 'gain', value: data.L4, label: 'ops savings|build\u2013buy' },
    { kind: 'cost', value: fee, label: 'yuno fee|platform + tx' },
    { kind: 'total', value: total, label: 'net gain|year one' },
  ];
  const conservative = data.conservative, optimistic = data.optimistic;
  return (
    <div className="slide theme-ink-hero" data-screen-label="19 Waterfall">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / business case</SectionLabel>
      <div style={{ position: 'absolute', top: 140, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 16 }}>The stack, stacked.</h2>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <Waterfall data={wfData} width={1500} height={400} />
        </div>
        <div className="roi-frame anim-in" style={{ marginTop: 32 }}>
          <div className="inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>conservative</div>
              <div style={{ fontSize: 28, fontWeight: 300, color: 'rgba(255,255,255,0.7)' }}>{fmtMoney(conservative, { decimals: 1 })}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="t-subtitle-alt" style={{ color: 'rgba(224,237,128,0.9)', marginBottom: 4 }}>base case</div>
              <div style={{ fontSize: 48, fontWeight: 300, color: '#fff' }}><Counter value={total} delay={600} format={(v) => fmtMoney(v, { decimals: 1 })} /></div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>optimistic</div>
              <div style={{ fontSize: 28, fontWeight: 300, color: 'rgba(255,255,255,0.7)' }}>{fmtMoney(optimistic, { decimals: 1 })}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>ROI yr 1</div>
              <div style={{ fontSize: 36, fontWeight: 300, color: '#fff' }}>{(total / fee).toFixed(1)}x</div>
            </div>
          </div>
        </div>
      </div>
      <SlideFooter section="the business case" pageNum={20} total={26} />
    </div>
  );
}

function BCSlide20({ data }) {
  const isTiered = data.pricingModel === 'tiered';
  return (
    <div className="slide theme-ink-2" data-screen-label="20 Pricing">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">04 / pricing</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>Pricing</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginBottom: 32 }}>
          {/* Card 1: per-approved-tx rate */}
          <div className="anim-in anim-in-1" style={{ padding: 32, borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="t-label" style={{ color: '#8C99FF', marginBottom: 16 }}>per approved transaction</div>
            {!isTiered && (
              <React.Fragment>
                <div style={{ fontSize: 52, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em', marginBottom: 8 }}>${Number(data.ratePerTx).toFixed(2)}<span style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>/approved tx</span></div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>flat rate across all volume</div>
              </React.Fragment>
            )}
            {isTiered && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {data.rateTiers.map((t, i) => {
                  const prev = i === 0 ? 0 : data.rateTiers[i-1].upToTx;
                  const capLabel = (t.upToTx === Infinity || t.upToTx == null) ? '>' + fmtNum(prev) : fmtNum(prev) + '–' + fmtNum(t.upToTx);
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{capLabel} tx</div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>${Number(t.ratePerTx).toFixed(2)}/tx</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* Card 2: reconciliation fee (if set) OR minimum commitment */}
          <div className="anim-in anim-in-2" style={{ padding: 32, borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {Number(data.reconciliationFee) > 0 ? (
              <React.Fragment>
                <div className="t-label" style={{ color: '#8C99FF', marginBottom: 16 }}>reconciliation product</div>
                <div style={{ fontSize: 52, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em', marginBottom: 8 }}>{fmtMoney(data.reconciliationFee, { decimals: 0 })}<span style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>/mo</span></div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{fmtMoney(Number(data.reconciliationFee) * 12, { decimals: 0 })} /year</div>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <div className="t-label" style={{ color: '#8C99FF', marginBottom: 16 }}>minimum commitment</div>
                <div style={{ fontSize: 52, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em', marginBottom: 8 }}>{fmtNum(data.minTxAnnual)}<span style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}> tx/yr</span></div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{'≈'} {fmtMoney(data.minCommitFee, { decimals: 1 })} equivalent</div>
              </React.Fragment>
            )}
          </div>
          {/* Card 3: SaaS fee */}
          <div className="anim-in anim-in-3" style={{ padding: 32, borderRadius: 16, background: 'rgba(224,237,128,0.06)', border: '1.5px solid rgba(224,237,128,0.25)' }}>
            <div className="t-label" style={{ color: '#E0ED80', marginBottom: 16 }}>saas platform fee</div>
            <div style={{ fontSize: 52, fontWeight: 300, color: '#E0ED80', letterSpacing: '-0.02em', marginBottom: 8 }}>{fmtMoney(data.monthlySaaS, { decimals: 0 })}<span style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>/mo</span></div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{fmtMoney(data.saasAnnualFee, { decimals: 0 })} /year</div>
          </div>
        </div>
        {/* Your estimate */}
        <div className="anim-in anim-in-5" style={{ background: 'rgba(140,153,255,0.06)', border: '1px solid rgba(140,153,255,0.12)', borderRadius: 12, padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="t-label" style={{ color: '#8C99FF' }}>your estimate {'·'} {fmtNum(data.numActualTx)} annual transactions</div>
            <div style={{ fontSize: 32, fontWeight: 300, color: '#fff' }}>{fmtMoney(data.yunoAnnualFee, { decimals: 2 })}<span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}> /yr</span></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.55)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
            <span>actual tx fee: {fmtMoney(data.actualTxFee, { decimals: 2 })}</span>
            <span>min commit: {fmtMoney(data.minCommitFee, { decimals: 2 })}</span>
            <span style={{ color: '#E0ED80' }}>tx annual (max): {fmtMoney(data.txAnnualFee, { decimals: 2 })}</span>
            <span>+ saas: {fmtMoney(data.saasAnnualFee, { decimals: 2 })}</span>
            {Number(data.reconciliationAnnualFee) > 0 && <span>+ reconciliation: {fmtMoney(data.reconciliationAnnualFee, { decimals: 2 })}</span>}
          </div>
        </div>
      </div>
      <SlideFooter section="pricing" pageNum={21} total={26} />
    </div>
  );
}

function BCSlide21() {
  const cases = [
    { company: 'inDrive', stat: '+90%', label: 'approval rate', quote: '"Yuno\u2019s smart routing took our LATAM approvals from 68% to over 90% in under 60 days."', role: 'Head of Payments' },
    { company: "mcdonald's", stat: '\u221232%', label: 'false declines', quote: '"We reduced false declines by a third while maintaining fraud rates below 0.1%."', role: 'VP Digital Payments' },
    { company: 'rappi', stat: '0', label: 'integration time', quote: '"We were live with 8 new providers in 3 weeks. Previously that would have taken 6+ months each."', role: 'CTO' },
  ];
  return (
    <div className="slide theme-ink" data-screen-label="21 Case Studies">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">04 / proof points</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>Case studies</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {cases.map((c, i) => (
            <div key={i} className={'glass-card anim-in anim-in-' + (i + 1)} style={{ padding: 36, borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', textTransform: 'lowercase', marginBottom: 16 }}>{c.company}</div>
              <div style={{ fontSize: 52, fontWeight: 300, color: '#E0ED80', letterSpacing: '-0.02em', marginBottom: 4 }}>{c.stat}</div>
              <div className="t-label" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>{c.label}</div>
              <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic', lineHeight: 1.6, flex: 1 }}>{c.quote}</div>
              <div className="t-label" style={{ color: 'rgba(255,255,255,0.35)', marginTop: 16 }}>{'\u2014'} {c.role}, {c.company}</div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter section="proof points" pageNum={23} total={26} />
    </div>
  );
}

function BCSlide22() {
  const phases = [
    { num: '01', days: '1\u201314', name: 'discovery', tasks: ['technical audit', 'routing strategy', 'provider mapping', 'integration plan'] },
    { num: '02', days: '15\u201345', name: 'integration', tasks: ['API integration', 'checkout SDK', 'vault migration', 'UAT testing'] },
    { num: '03', days: '46\u201375', name: 'soft launch', tasks: ['5% traffic routing', 'A/B approval testing', 'monitoring setup', 'optimize rules'] },
    { num: '04', days: '76\u201390', name: 'full cutover', tasks: ['100% traffic migration', 'legacy decommission', 'team training', 'go-live review'] },
  ];
  return (
    <div className="slide theme-ink-2" data-screen-label="22 Implementation">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">05 / the plan</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>90 days to production</h2>
        {/* Timeline dots */}
        <div className="anim-in anim-in-1" style={{ display: 'flex', alignItems: 'center', marginBottom: 40, padding: '0 40px' }}>
          {phases.map((p, i) => (
            <React.Fragment key={i}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', background: i === phases.length - 1 ? '#E0ED80' : '#8C99FF', flexShrink: 0 }} />
              {i < phases.length - 1 && <div style={{ flex: 1, height: 2, background: 'rgba(140,153,255,0.25)' }} />}
            </React.Fragment>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
          {phases.map((p, i) => (
            <div key={i} className={'anim-in anim-in-' + (i + 2)} style={{ padding: 28, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#8C99FF', letterSpacing: '0.1em' }}>{p.num}</span>
                <span className="t-label" style={{ color: 'rgba(255,255,255,0.35)' }}>days {p.days}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>{p.name}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {p.tasks.map((t, j) => <div key={j} style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />{t}</div>)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter section="the plan" pageNum={24} total={26} />
    </div>
  );
}

function BCSlide23() {
  const objections = [
    { q: '"what if approval lift underperforms?"', a: 'Contractual performance guarantee: if approval rates don\u2019t improve by at least 3pp in 90 days, exit with no penalty.' },
    { q: '"we want to keep our current acquirers"', a: 'Yuno is an orchestrator, not a replacement. Keep all existing acquirers \u2014 we add intelligence on top.' },
    { q: '"adding a layer increases PCI scope"', a: 'Yuno is PCI DSS Level 1 certified. Our vault removes PCI scope from your systems, reducing your compliance burden.' },
    { q: '"what about vendor lock-in?"', a: 'Yuno uses standard card-on-file tokens. You can migrate tokens out at any time. No proprietary formats.' },
    { q: '"what if Yuno goes down?"', a: '99.99% uptime SLA backed by financial credits. Architecture uses multi-region failover with <120ms latency.' },
    { q: '"our roadmap is already packed"', a: 'Single API integration: 2\u20133 engineering weeks. Yuno SDK handles checkout, vault, routing \u2014 net reduction in your backlog.' },
  ];
  return (
    <div className="slide theme-ink" data-screen-label="23 Risk & Objections">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">05 / the plan</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>Risk + objections</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {objections.map((o, i) => (
            <div key={i} className={'anim-in anim-in-' + (i + 1)} style={{ padding: 24, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 10 }}>{o.q}</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{o.a}</div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter section="the plan" pageNum={25} total={26} />
    </div>
  );
}

function BCSlide24({ data }) {
  const total = data.netAnnualGain;
  return (
    <div className="slide theme-ink-hero" data-screen-label="24 Close">
      <div className="ink-grid" />
      <OrbHalftone size={1200} color="#E0ED80" x="85%" y="30%" style={{ opacity: 0.25 }} />
      <OrbHalftone size={800} color="#6B7BFF" x="15%" y="80%" style={{ opacity: 0.35 }} />
      <div style={{ position: 'absolute', top: 64, left: 80 }}><YunoLogo size="md" /></div>
      <div style={{ position: 'absolute', top: '42%', left: 80, right: 80, transform: 'translateY(-50%)' }}>
        <div className="t-subtitle-alt anim-in" style={{ color: 'rgba(140,153,255,0.95)', marginBottom: 32 }}>the ask</div>
        <h1 className="t-title anim-in anim-in-2" style={{ fontSize: 128, fontWeight: 200, letterSpacing: '-0.03em', lineHeight: 0.95, marginBottom: 40, color: '#fff' }}>
          Unlock{' '}<span style={{ background: 'linear-gradient(120deg, #E0ED80 0%, #8C99FF 60%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{fmtMoney(total, { decimals: 1 })}</span><br/>in year one.
        </h1>
        <div className="t-body-l anim-in anim-in-3" style={{ fontSize: 22, color: 'rgba(255,255,255,0.68)', textTransform: 'none', maxWidth: 1000, marginBottom: 48 }}>
          Sign a mutual NDA this week. Technical workshop next week. First transaction through Yuno inside 30 days.
        </div>
        <div className="anim-in anim-in-4" style={{ display: 'flex', gap: 16, marginBottom: 56 }}>
          <button style={{ background: '#E0ED80', color: '#0a0a1a', border: 'none', borderRadius: 10, padding: '16px 36px', fontSize: 16, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em' }}>schedule technical workshop</button>
          <button style={{ background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '16px 36px', fontSize: 16, fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em' }}>download proposal</button>
        </div>
        <div className="anim-in anim-in-5" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff' }}>CG</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>Carol Grunberg</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Chief Business Officer {'\u00B7'} carol@yuno.co</div>
          </div>
        </div>
      </div>
      <SlideFooter section="close" pageNum={26} total={26} />
    </div>
  );
}

/* ============================================================
   BCSlide14B — Country-level breakdown (between 14 and 15)
   Reads data.countries: [{ code, name, tx, mdrBps?, avgTicket?, note? }]
   Falls back to global data.currentMDRBps / data.avgTicket per row.
   ============================================================ */
function BCSlide14B({ data }) {
  const globalAvgTkt = Number(data.avgTicket) || 0;
  const globalMdrBps = Number(data.currentMDRBps) || 0;
  const rawCountries = Array.isArray(data.countries) ? data.countries : [];

  const rows = rawCountries
    .filter((c) => c && Number(c.tx) > 0)
    .map((c) => {
      const avgTkt = Number(c.avgTicket) > 0 ? Number(c.avgTicket) : globalAvgTkt;
      const mdrBps = Number(c.mdrBps) > 0 ? Number(c.mdrBps) : globalMdrBps;
      const tx = Number(c.tx);
      const countryTpv = tx * avgTkt;
      const mdrPaid = countryTpv * (mdrBps / 10000);
      const code = String(c.code || c.name || '—').slice(0, 3).toUpperCase();
      const name = String(c.name || c.code || '—').toLowerCase();
      const note = c.note ? String(c.note) : '';
      return { code, name, tx, tkt: avgTkt, mdrBps, countryTpv, mdrPaid, note };
    });

  const totals = {
    tpv: rows.reduce((a, r) => a + r.countryTpv, 0),
    tx: rows.reduce((a, r) => a + r.tx, 0),
    mdrPaid: rows.reduce((a, r) => a + r.mdrPaid, 0),
  };
  const avgTktBlended = totals.tx > 0 ? totals.tpv / totals.tx : 0;
  const blendedBps = totals.tpv > 0 ? (totals.mdrPaid / totals.tpv) * 10000 : 0;

  const fmtCompactNum = (n) => {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
    return Math.round(n).toLocaleString();
  };

  const empty = rows.length === 0;

  return (
    <div className="slide theme-ink-2" data-screen-label="14b Country Breakdown">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / business case · current state</SectionLabel>
      <div style={{ position: 'absolute', top: 180, left: 80, right: 80, bottom: 110 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 56, alignItems: 'start' }}>

          <div>
            <div className="glow-chip anim-in" style={{ marginBottom: 24 }}>
              <span className="dot" />today · by country
            </div>
            <h2 className="t-title anim-in anim-in-1" style={{
              fontSize: 64, fontWeight: 300, letterSpacing: '-0.02em',
              color: '#fff', marginBottom: 18, lineHeight: 1.02,
            }}>
              where the volume<br/>lives today.
            </h2>
            <div className="t-body-l" style={{
              fontSize: 18, color: 'rgba(255,255,255,0.6)',
              marginBottom: 36, textTransform: 'none', maxWidth: 620,
            }}>
              annual transactions, MDR paid and average ticket per country — your current payments baseline before Yuno.
            </div>
            <div className="anim-in anim-in-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
              <KPI label="total transactions / yr" value={fmtCompactNum(totals.tx)} sub={`across ${rows.length} market${rows.length === 1 ? '' : 's'}`} />
              <KPI label="blended avg ticket" value={`$${avgTktBlended.toFixed(0)}`} sub="weighted by TPV" />
              <KPI
                label="total MDR paid / yr"
                value={<span style={{ color: '#FF8A5B' }}>{fmtMoney(totals.mdrPaid)}</span>}
                sub={`${blendedBps.toFixed(0)} bps blended`}
              />
              <KPI label="total TPV" value={fmtMoney(totals.tpv)} sub="sum of per-country" />
            </div>
          </div>

          <div className="card-dark anim-in anim-in-3" style={{ padding: 28 }}>
            <div className="t-subtitle-alt" style={{ color: 'rgba(140,153,255,0.9)', marginBottom: 18 }}>
              current state · per country
            </div>
            {empty ? (
              <div style={{
                padding: 36, textAlign: 'center',
                color: 'rgba(255,255,255,0.5)', fontSize: 14,
              }}>
                no country breakdown provided — add per-country transactions to populate this slide.
              </div>
            ) : (
              <table className="bc-table" style={{ fontSize: 14 }}>
                <thead>
                  <tr>
                    <th>market</th>
                    <th style={{ textAlign: 'right' }}>transactions</th>
                    <th style={{ textAlign: 'right' }}>avg ticket</th>
                    <th style={{ textAlign: 'right' }}>MDR paid</th>
                    <th style={{ textAlign: 'right' }}>bps</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                            color: 'rgba(140,153,255,0.95)',
                            padding: '3px 7px',
                            border: '1px solid rgba(140,153,255,0.35)',
                            borderRadius: 4,
                            background: 'rgba(107,123,255,0.08)',
                          }}>{r.code}</span>
                          <span style={{ fontSize: 15, color: '#fff', textTransform: 'capitalize' }}>{r.name}</span>
                        </div>
                      </td>
                      <td className="num" style={{ padding: '12px 16px', fontSize: 15 }}>{fmtCompactNum(r.tx)}</td>
                      <td className="num" style={{ padding: '12px 16px', fontSize: 15, color: 'rgba(255,255,255,0.75)' }}>${Math.round(r.tkt)}</td>
                      <td className="num" style={{ padding: '12px 16px', fontSize: 15, color: '#FF8A5B' }}>{fmtMoney(r.mdrPaid)}</td>
                      <td className="num" style={{ padding: '12px 16px', fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>{Math.round(r.mdrBps)}</td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td style={{ padding: '16px' }}>total · blended</td>
                    <td className="num" style={{ padding: '16px' }}>{fmtCompactNum(totals.tx)}</td>
                    <td className="num" style={{ padding: '16px' }}>${avgTktBlended.toFixed(0)}</td>
                    <td className="num" style={{ padding: '16px', color: '#FF8A5B' }}>{fmtMoney(totals.mdrPaid)}</td>
                    <td className="num" style={{ padding: '16px' }}>{blendedBps.toFixed(0)}</td>
                  </tr>
                </tbody>
              </table>
            )}
            {!empty && (
              <div style={{
                marginTop: 20, padding: '14px 18px',
                background: 'rgba(255,138,91,0.06)',
                border: '1px solid rgba(255,138,91,0.25)',
                borderRadius: 12,
                display: 'flex', alignItems: 'center', gap: 16,
              }}>
                <div style={{
                  fontSize: 11, color: 'rgba(255,138,91,0.95)',
                  textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 700,
                }}>today's cost</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)' }}>
                  {fmtMoney(totals.mdrPaid)} leaving the business every year in MDR — before we touch a single routing rule.
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
      <SlideFooter section="03 / business case" pageNum={15} total={26} logoColor="rgba(255,255,255,0.5)" />
    </div>
  );
}

/* ============================================================
   BCSlide20B — Pay vs. Gain (between 20 and 21)
   Uses data computed by computeData() (no hardcoded rates / levers).
   ============================================================ */
function BCSlide20B({ data }) {
  const yunoAnnualCost = Number(data.yunoAnnualFee) || 0;
  const txPerYear = Math.round(Number(data.numActualTx) || 0);
  const saasAnnualFee = Number(data.saasAnnualFee) || 0;
  const txAnnualFee = Number(data.txAnnualFee) || 0;
  const saasMonthly = Number(data.monthlySaaS) || 0;
  const blendedPerTx = txPerYear > 0 ? txAnnualFee / txPerYear : 0;

  const L1 = Number(data.L1) || 0;
  const L2 = Number(data.L2) || 0;
  const L3 = Number(data.L3) || 0;
  const L4 = Number(data.L4) || 0;
  const grossGain = Number(data.grossGain) || (L1 + L2 + L3 + L4);
  const netGain = Number(data.netAnnualGain) || (grossGain - yunoAnnualCost);
  const roi = yunoAnnualCost > 0 ? grossGain / yunoAnnualCost : 0;
  const paybackMonths = Number(data.paybackMonths) || 0;

  const approvalLiftPp = Number(data.approvalLiftPp) || 0;
  const mdrReductionBps = Number(data.mdrReductionBps) || 0;
  const apmUpliftPct = Number(data.apmUpliftPct) || 0;
  const grossMarginPct = Number(data.grossMargin) || 0;

  const benefits = [
    { label: 'approval uplift',    value: L1, note: `+${approvalLiftPp.toFixed(1)}pp · margin ${grossMarginPct}% on recovered TPV` },
    { label: 'MDR reduction',      value: L2, note: `−${Math.round(mdrReductionBps)} bps · savings on TPV` },
    { label: 'new APMs activated', value: L3, note: `+${apmUpliftPct}% TPV · margin on new rails` },
    { label: 'operations savings', value: L4, note: 'build→buy · FTEs freed + compliance' },
  ];

  const pricingLabel = data.pricingModel === 'tiered' ? 'tiered · blended' : 'flat rate';
  const paybackLabel = paybackMonths > 0 && paybackMonths < 1
    ? `${Math.round(paybackMonths * 30)} days`
    : paybackMonths > 0
      ? `${paybackMonths.toFixed(1)} mo`
      : '—';

  return (
    <div className="slide theme-ink-hero" data-screen-label="20b Pay vs Gain">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">04 / pricing · value exchange</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80, bottom: 110 }}>

        <h2 className="t-title anim-in" style={{
          fontSize: 64, fontWeight: 300, letterSpacing: '-0.02em',
          color: '#fff', marginBottom: 14,
        }}>
          what you pay <span style={{ color: 'rgba(255,255,255,0.45)' }}>vs.</span> what you get.
        </h2>
        <div className="t-body-l" style={{
          fontSize: 19, color: 'rgba(255,255,255,0.6)',
          marginBottom: 36, textTransform: 'none',
        }}>
          simple math: the invoice on the left, the return on the right — every year.
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 60px 1.35fr',
          gap: 24,
          alignItems: 'stretch',
        }}>

          <div className="card-dark anim-in anim-in-1" style={{
            padding: 34,
            borderColor: 'rgba(255,138,91,0.28)',
            background: 'linear-gradient(180deg, rgba(255,138,91,0.06), rgba(255,138,91,0.01))',
          }}>
            <div className="t-subtitle-alt" style={{ color: 'rgba(255,138,91,0.95)', marginBottom: 14 }}>
              what you pay yuno
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 28 }}>
              annual cost · {pricingLabel} + fixed SaaS
            </div>

            <div style={{
              marginBottom: 22, paddingBottom: 22,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{
                fontSize: 12, color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase', letterSpacing: '0.14em',
                fontWeight: 600, marginBottom: 10,
              }}>per-transaction fee</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 8 }}>
                <div style={{ fontSize: 36, color: '#fff', fontWeight: 300 }}>${blendedPerTx.toFixed(3)}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>× approved tx</div>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                {txPerYear.toLocaleString()} tx / yr →{' '}
                <span style={{ color: '#FF8A5B', fontWeight: 500 }}>{fmtMoney(txAnnualFee)}</span>
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <div style={{
                fontSize: 12, color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase', letterSpacing: '0.14em',
                fontWeight: 600, marginBottom: 10,
              }}>saas platform · fixed</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 8 }}>
                <div style={{ fontSize: 36, color: '#fff', fontWeight: 300 }}>{fmtMoney(saasMonthly)}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>/ month</div>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                12 months →{' '}
                <span style={{ color: '#FF8A5B', fontWeight: 500 }}>{fmtMoney(saasAnnualFee)}</span>
              </div>
            </div>

            <div style={{
              padding: '20px 22px',
              borderRadius: 14,
              background: 'rgba(255,138,91,0.1)',
              border: '1px solid rgba(255,138,91,0.35)',
            }}>
              <div style={{
                fontSize: 11, color: 'rgba(255,138,91,0.95)',
                textTransform: 'uppercase', letterSpacing: '0.16em',
                fontWeight: 700, marginBottom: 8,
              }}>total annual cost</div>
              <div style={{
                fontSize: 48, color: '#FF8A5B',
                fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1,
              }}>
                {fmtMoney(yunoAnnualCost)}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>
                ≈ {fmtMoney(yunoAnnualCost / 12)} / month all-in
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center', gap: 18,
          }}>
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase', letterSpacing: '0.18em',
              fontWeight: 700,
              writingMode: 'vertical-rl', transform: 'rotate(180deg)',
            }}>returns</div>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'linear-gradient(135deg, #8C99FF, #2A3BC9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 28px rgba(140,153,255,0.5)',
              color: '#fff', fontSize: 22, fontWeight: 300,
            }}>→</div>
            <div style={{
              fontSize: 34, fontWeight: 200, color: '#E0ED80',
              letterSpacing: '-0.02em',
            }}>
              {roi.toFixed(0)}×
            </div>
            <div style={{
              fontSize: 10, color: 'rgba(224,237,128,0.9)',
              textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700,
            }}>ROI</div>
          </div>

          <div className="card-dark anim-in anim-in-2" style={{
            padding: 34,
            borderColor: 'rgba(140,153,255,0.35)',
            background: 'linear-gradient(180deg, rgba(107,123,255,0.08), rgba(107,123,255,0.015))',
          }}>
            <div className="t-subtitle-alt" style={{ color: 'rgba(140,153,255,0.95)', marginBottom: 14 }}>
              what yuno returns
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 24 }}>
              annual gross value · four stacked levers
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 26 }}>
              {benefits.map((b, i) => {
                const pct = grossGain > 0 ? (b.value / grossGain) * 100 : 0;
                return (
                  <div key={i}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'baseline', marginBottom: 6,
                    }}>
                      <span style={{ fontSize: 14, color: '#fff', fontWeight: 500 }}>{b.label}</span>
                      <span style={{
                        fontSize: 18, color: '#E0ED80',
                        fontWeight: 400, letterSpacing: '-0.01em',
                      }}>+{fmtMoney(b.value)}</span>
                    </div>
                    <div className="meter" style={{ height: 6 }}>
                      <span style={{ width: pct + '%', animationDelay: `${i * 120}ms` }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>
                      {b.note}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
              padding: '20px 22px',
              borderRadius: 14,
              background: 'rgba(107,123,255,0.12)',
              border: '1px solid rgba(140,153,255,0.4)',
            }}>
              <div>
                <div style={{
                  fontSize: 10, color: 'rgba(140,153,255,0.95)',
                  textTransform: 'uppercase', letterSpacing: '0.16em',
                  fontWeight: 700, marginBottom: 6,
                }}>gross annual gain</div>
                <div style={{
                  fontSize: 36, color: '#fff', fontWeight: 300,
                  letterSpacing: '-0.02em', lineHeight: 1,
                }}>
                  {fmtMoney(grossGain)}
                </div>
              </div>
              <div>
                <div style={{
                  fontSize: 10, color: 'rgba(224,237,128,0.95)',
                  textTransform: 'uppercase', letterSpacing: '0.16em',
                  fontWeight: 700, marginBottom: 6,
                }}>net of yuno fee</div>
                <div style={{
                  fontSize: 36, color: '#E0ED80', fontWeight: 300,
                  letterSpacing: '-0.02em', lineHeight: 1,
                }}>
                  {fmtMoney(netGain)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="anim-in anim-in-4" style={{
          marginTop: 28,
          padding: '20px 28px',
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.02)',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: 24,
        }}>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', maxWidth: 900 }}>
            For every <span style={{ color: '#FF8A5B', fontWeight: 600 }}>$1</span> paid to Yuno, you recover{' '}
            <span style={{ color: '#E0ED80', fontWeight: 600 }}>${roi.toFixed(0)}</span>{' '}
            in approvals, MDR savings, new rails and operations — net of our fee.
          </div>
          <div style={{ display: 'flex', gap: 32 }}>
            <div>
              <div style={{
                fontSize: 10, color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 600,
              }}>payback</div>
              <div style={{ fontSize: 22, color: '#fff', fontWeight: 300 }}>{paybackLabel}</div>
            </div>
            <div>
              <div style={{
                fontSize: 10, color: 'rgba(224,237,128,0.9)',
                textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 600,
              }}>year-one net</div>
              <div style={{ fontSize: 22, color: '#E0ED80', fontWeight: 300 }}>{fmtMoney(netGain)}</div>
            </div>
          </div>
        </div>

      </div>
      <SlideFooter section="04 / pricing" pageNum={22} total={26} logoColor="rgba(255,255,255,0.5)" />
    </div>
  );
}

Object.assign(window, { BCSlide13, BCSlide14, BCSlide14B, BCSlide15, BCSlide16, BCSlide17, BCSlide18, BCSlide19, BCSlide20, BCSlide20B, BCSlide21, BCSlide22, BCSlide23, BCSlide24 });
