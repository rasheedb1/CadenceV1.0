/* Business Case Deck — Slides 13-24 (ES) */

function BCSlide13() {
  return (
    <div className="slide theme-ink-hero" data-screen-label="13 Sección: Business Case">
      <div className="ink-grid" />
      <OrbHalftone size={900} color="#E0ED80" x="20%" y="40%" style={{ opacity: 0.35 }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
        <div className="section-glyph anim-in">03</div>
        <h2 className="t-title anim-in anim-in-2" style={{ fontSize: 108, fontWeight: 300, color: '#fff' }}>El business case</h2>
      </div>
      <SlideFooter section="el business case" pageNum={10} total={18} />
    </div>
  );
}

function BCSlide14({ data }) {
  const rows = [
    { label: 'TPV anual', value: fmtMoney(data.tpv) },
    { label: 'ticket promedio', value: '$' + data.avgTicket },
    { label: 'tasa de aprobación actual', value: fmtPct(data.currentApproval) },
    { label: 'MDR mezclado actual', value: fmtPct(data.currentMDR, 2) },
    { label: 'mercados activos', value: String(data.activeMarkets) },
    { label: 'métodos de pago', value: String(data.currentAPMs) },
    { label: 'margen bruto', value: fmtPct(data.grossMargin, 0) },
  ];
  return (
    <div className="slide theme-ink" data-screen-label="14 Supuestos">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / el business case</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>Punto de partida</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 48 }}>
          <div>
            <div className="t-label anim-in" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>supuestos</div>
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
              {'•'} Todas las proyecciones usan estimaciones del caso base (P50)<br/>
              {'•'} Lift de aprobación benchmarked contra el portafolio de clientes Yuno<br/>
              {'•'} Ahorros de MDR validados con tasas de mercado de procesadores<br/>
              {'•'} Ahorros operativos basados en datos de implementación de Yuno<br/>
              {'•'} No se atribuye valor a la reducción de fraude
            </div>
          </div>
        </div>
      </div>
      <SlideFooter section="el business case" pageNum={11} total={18} />
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
    { name: 'con Yuno', color: '#E0ED80', points: [
      { x: 0, y: currentApproval, label: 'día 0' }, { x: 15, y: currentApproval + 1.2, label: '' },
      { x: 30, y: currentApproval + 3.1, label: 'día 30' }, { x: 45, y: currentApproval + 4.6, label: '' },
      { x: 60, y: currentApproval + 5.9, label: 'día 60' }, { x: 75, y: currentApproval + 6.8, label: '' },
      { x: 90, y: targetApproval, label: 'día 90' },
    ]},
    { name: 'sin Yuno', color: 'rgba(255,255,255,0.25)', dashed: true, points: [
      { x: 0, y: currentApproval, label: '' }, { x: 15, y: currentApproval + 0.1, label: '' },
      { x: 30, y: currentApproval + 0.2, label: '' }, { x: 45, y: currentApproval + 0.2, label: '' },
      { x: 60, y: currentApproval + 0.3, label: '' }, { x: 75, y: currentApproval + 0.3, label: '' },
      { x: 90, y: currentApproval + 0.3, label: '' },
    ]},
  ];
  return (
    <div className="slide theme-ink-2" data-screen-label="15 Palanca 1: Aprobaciones">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / palanca 01</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 56, fontWeight: 300, color: '#fff', marginBottom: 8 }}>Palanca 01: aprobaciones</h2>
        <div className="t-subtitle-alt anim-in anim-in-1" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 40 }}>smart routing + reintentos + network tokens</div>
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <KPI label="aprobación actual" value={fmtPct(currentApproval)} style={{}} />
            <KPI label="aprobación objetivo" value={fmtPct(targetApproval)} sub={"+" + approvalLiftPp + "pp con Yuno"} style={{}} />
            <KPI label="TPV incremental" value={fmtMoney(incrTPV)} style={{}} />
            <KPI label="margen incremental" value={fmtMoney(incrMargin)} sub={"@ " + grossMarginPct + "% margen bruto"} style={{}} />
            <div className="anim-in anim-in-6" style={{ background: 'rgba(224,237,128,0.06)', border: '1px solid rgba(224,237,128,0.12)', borderRadius: 10, padding: '14px 18px', marginTop: 8 }}>
              <div className="t-label" style={{ color: '#E0ED80', marginBottom: 6 }}>proof point</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>inDrive logró +90% de tasa de aprobación con Yuno smart routing en LATAM</div>
            </div>
          </div>
          <div className="anim-in anim-in-3">
            <LineChart series={lineData} width={900} height={380} yMax={Math.ceil(targetApproval + 3)} yMin={Math.floor(currentApproval - 2)} />
          </div>
        </div>
      </div>
      <SlideFooter section="el business case" pageNum={13} total={18} />
    </div>
  );
}

function BCSlide16({ data }) {
  const currentMDRPct = data.currentMDR;
  const targetMDRPct = data.targetMDR;
  const mdrReductionBps = data.mdrReductionBps;
  const savings = data.L2;
  const breakdown = [
    { name: 'optimización de interchange', bps: 18, pct: 47 },
    { name: 'arbitraje multi-acquirer', bps: 12, pct: 32 },
    { name: 'reducción cross-border', bps: 6, pct: 16 },
    { name: 'optimización de scheme fees', bps: 2, pct: 5 },
  ];
  return (
    <div className="slide theme-ink" data-screen-label="16 Palanca 2: MDR">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / palanca 02</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 56, fontWeight: 300, color: '#fff', marginBottom: 8 }}>Palanca 02: optimización de MDR</h2>
        <div className="t-subtitle-alt anim-in anim-in-1" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 40 }}>routing multi-acquirer + procesamiento local + optimización de scheme</div>
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <KPI label="MDR mezclado actual" value={fmtPct(currentMDRPct, 2)} />
            <KPI label="MDR mezclado objetivo" value={fmtPct(targetMDRPct, 2)} sub={'−' + mdrReductionBps + ' bps con Yuno'} />
            <KPI label="ahorro anual" value={fmtMoney(savings)} />
          </div>
          <div className="anim-in anim-in-3">
            <div className="t-label" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>desglose de ahorro</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {breakdown.map((b, i) => (
                <div key={i} className={'anim-in anim-in-' + (i + 3)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 15, color: '#fff' }}>{b.name}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#E0ED80' }}>{'−'}{b.bps} bps</div>
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
      <SlideFooter section="el business case" pageNum={14} total={18} />
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
    { name: 'brasil', methods: 'PIX, Boleto', color: '#E0ED80' },
    { name: 'india', methods: 'UPI, Paytm, PhonePe', color: '#8C99FF' },
    { name: 'méxico', methods: 'OXXO, SPEI, CoDi', color: '#E0ED80' },
    { name: 'golfo', methods: 'mada, KNET, Fawry', color: '#8C99FF' },
    { name: 'europa', methods: 'iDEAL, Bancontact, BLIK', color: '#E0ED80' },
    { name: 'SE asia', methods: 'GCash, GrabPay, DANA', color: '#8C99FF' },
  ];
  return (
    <div className="slide theme-ink-2" data-screen-label="17 Palanca 3: APMs">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / palanca 03</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 56, fontWeight: 300, color: '#fff', marginBottom: 8 }}>Palanca 03: métodos de pago alternativos</h2>
        <div className="t-subtitle-alt anim-in anim-in-1" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 40 }}>activa métodos locales en cada mercado desde una sola integración</div>
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <KPI label="nuevos métodos activados" value={"+" + newAPMsAdded} />
            <KPI label="uplift de conversión" value={"+" + apmUpliftPct + "%"} sub="varía por mercado" />
            <KPI label="TPV incremental" value={fmtMoney(incrTPV)} />
            <KPI label="margen incremental" value={fmtMoney(incrMargin)} sub={"@ " + grossMarginPct + "% margen bruto"} />
          </div>
          <div className="anim-in anim-in-3">
            <div className="t-label" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>mapa de activación regional</div>
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
      <SlideFooter section="el business case" pageNum={18} total={18} />
    </div>
  );
}

function BCSlide18({ data }) {
  const nInt = Number(data.numNewIntegrations) || 0;
  const intBuild = Number(data.integrationCostBuild) || 0;
  const ttmMonths = Number(data.timeToMarketMonthsSaved) || 0;
  const reconOther = Number(data.reconciliationCostOtherAnnual) || 0;
  const reconYuno = Number(data.reconciliationCostYunoAnnual) || 0;
  const rows = [
    { label: nInt > 0 ? 'integración (' + nInt + ' providers · 3 meses c/u)' : 'integración', build: intBuild, yuno: 0, yunoNote: 'incluido' },
    { label: 'conciliación (anual)', build: reconOther, yuno: reconYuno, yunoNote: reconYuno === 0 ? 'incluido' : undefined },
  ];
  const buildTotal1yr = rows.reduce((a, r) => a + Number(r.build || 0), 0);
  const yunoTotal1yr = rows.reduce((a, r) => a + (r.yunoNote === 'incluido' ? 0 : Number(r.yuno || 0)), 0);
  return (
    <div className="slide theme-ink" data-screen-label="Palanca 3: Operaciones">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / palanca 03</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 56, fontWeight: 300, color: '#fff', marginBottom: 8 }}>Palanca 03: ahorros operativos</h2>
        <div className="t-subtitle-alt anim-in anim-in-1" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 40 }}>consolida providers, automatiza conciliación, acelera time-to-market</div>
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <KPI label="FTE liberados" value={String(data.fteFreed)} sub="payments ops e ingeniería" />
            <KPI label="time-to-market ahorrado" value={ttmMonths + ' mo'} sub={nInt > 0 ? nInt + ' nuevos providers · 3 meses c/u' : 'más rápido que construir in-house'} />
            <KPI label="conciliación automatizada" value="80%" sub="vs. matching manual actual" />
          </div>
          <div className="anim-in anim-in-3">
            <div className="t-label" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>comparación a 1 año</div>
            <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', background: 'rgba(255,255,255,0.04)', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="t-label" style={{ color: 'rgba(255,255,255,0.4)' }}></div>
                <div className="t-label" style={{ color: '#FF6A6A', textAlign: 'center' }}>build / otros providers</div>
                <div className="t-label" style={{ color: '#E0ED80', textAlign: 'center' }}>yuno</div>
              </div>
              {rows.map((r, i) => (
                <div key={i} className={'anim-in anim-in-' + (i + 4)} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>{r.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>{fmtMoney(r.build, { decimals: 1 })}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#E0ED80', textAlign: 'center' }}>{r.yunoNote ? <span style={{ color: 'rgba(224,237,128,0.55)', fontSize: 13, fontWeight: 500 }}>{r.yunoNote}</span> : fmtMoney(r.yuno, { decimals: 1 })}</div>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', padding: '18px 20px', background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>total 1 año</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#FF6A6A', textAlign: 'center' }}>{fmtMoney(buildTotal1yr, { decimals: 1 })}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#E0ED80', textAlign: 'center' }}>{fmtMoney(yunoTotal1yr, { decimals: 1 })}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <SlideFooter section="el business case" pageNum={15} total={18} />
    </div>
  );
}

function BCSlide19({ data }) {
  const total = data.netAnnualGain;
  const fee = data.yunoAnnualFee;
  const wfData = [
    { kind: 'base', value: 0.001, label: 'baseline|status quo' },
    { kind: 'gain', value: data.L1, label: 'aprobaciones|+' + data.approvalLiftPp + 'pp' },
    { kind: 'gain', value: data.L2, label: 'MDR|−' + data.mdrReductionBps + ' bps' },
    { kind: 'gain', value: data.L3, label: 'nuevos APMs|+' + data.apmUpliftPct + '% TPV' },
    { kind: 'gain', value: data.L4, label: 'ahorros ops|build–buy' },
    { kind: 'cost', value: fee, label: 'fee yuno|plataforma + tx' },
    { kind: 'total', value: total, label: 'ganancia neta|año uno' },
  ];
  const conservative = data.conservative, optimistic = data.optimistic;
  return (
    <div className="slide theme-ink-hero" data-screen-label="19 Waterfall">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / business case</SectionLabel>
      <div style={{ position: 'absolute', top: 140, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 16 }}>El stack, sumado.</h2>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <Waterfall data={wfData} width={1500} height={400} />
        </div>
        <div className="roi-frame anim-in" style={{ marginTop: 32 }}>
          <div className="inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>conservador</div>
              <div style={{ fontSize: 28, fontWeight: 300, color: 'rgba(255,255,255,0.7)' }}>{fmtMoney(conservative, { decimals: 1 })}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="t-subtitle-alt" style={{ color: 'rgba(224,237,128,0.9)', marginBottom: 4 }}>caso base</div>
              <div style={{ fontSize: 48, fontWeight: 300, color: '#fff' }}><Counter value={total} delay={600} format={(v) => fmtMoney(v, { decimals: 1 })} /></div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>optimista</div>
              <div style={{ fontSize: 28, fontWeight: 300, color: 'rgba(255,255,255,0.7)' }}>{fmtMoney(optimistic, { decimals: 1 })}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>ROI año 1</div>
              <div style={{ fontSize: 36, fontWeight: 300, color: '#fff' }}>{(total / fee).toFixed(1)}x</div>
            </div>
          </div>
        </div>
      </div>
      <SlideFooter section="el business case" pageNum={20} total={18} />
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
          {/* Card 1: tasa por tx aprobada */}
          <div className="anim-in anim-in-1" style={{ padding: 32, borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="t-label" style={{ color: '#8C99FF', marginBottom: 16 }}>por transacción aprobada</div>
            {!isTiered && (
              <React.Fragment>
                <div style={{ fontSize: 52, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em', marginBottom: 8 }}>${Number(data.ratePerTx).toFixed(2)}<span style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>/tx aprobada</span></div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>tasa flat en todo el volumen</div>
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
          {/* Card 2: fee de conciliación (si está) o compromiso mínimo */}
          <div className="anim-in anim-in-2" style={{ padding: 32, borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {Number(data.reconciliationFee) > 0 ? (
              <React.Fragment>
                <div className="t-label" style={{ color: '#8C99FF', marginBottom: 16 }}>producto de conciliación</div>
                <div style={{ fontSize: 52, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em', marginBottom: 8 }}>{fmtMoney(data.reconciliationFee, { decimals: 0 })}<span style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>/mes</span></div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{fmtMoney(Number(data.reconciliationFee) * 12, { decimals: 0 })} /año</div>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <div className="t-label" style={{ color: '#8C99FF', marginBottom: 16 }}>compromiso mínimo</div>
                <div style={{ fontSize: 52, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em', marginBottom: 8 }}>{fmtNum(data.minTxAnnual)}<span style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}> tx/año</span></div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{'≈'} {fmtMoney(data.minCommitFee, { decimals: 1 })} equivalente</div>
              </React.Fragment>
            )}
          </div>
          {/* Card 3: SaaS fee */}
          <div className="anim-in anim-in-3" style={{ padding: 32, borderRadius: 16, background: 'rgba(224,237,128,0.06)', border: '1.5px solid rgba(224,237,128,0.25)' }}>
            <div className="t-label" style={{ color: '#E0ED80', marginBottom: 16 }}>fee de plataforma saas</div>
            <div style={{ fontSize: 52, fontWeight: 300, color: '#E0ED80', letterSpacing: '-0.02em', marginBottom: 8 }}>{fmtMoney(data.monthlySaaS, { decimals: 0 })}<span style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>/mes</span></div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{fmtMoney(data.saasAnnualFee, { decimals: 0 })} /año</div>
          </div>
        </div>
        {/* Tu estimación */}
        <div className="anim-in anim-in-5" style={{ background: 'rgba(140,153,255,0.06)', border: '1px solid rgba(140,153,255,0.12)', borderRadius: 12, padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="t-label" style={{ color: '#8C99FF' }}>tu estimación {'·'} {fmtNum(data.numActualTx)} transacciones anuales</div>
            <div style={{ fontSize: 32, fontWeight: 300, color: '#fff' }}>{fmtMoney(data.yunoAnnualFee, { decimals: 2 })}<span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}> /año</span></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.55)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
            <span>fee real de tx: {fmtMoney(data.actualTxFee, { decimals: 2 })}</span>
            <span>compromiso mín: {fmtMoney(data.minCommitFee, { decimals: 2 })}</span>
            <span style={{ color: '#E0ED80' }}>tx anual (máx): {fmtMoney(data.txAnnualFee, { decimals: 2 })}</span>
            <span>+ saas: {fmtMoney(data.saasAnnualFee, { decimals: 2 })}</span>
            {Number(data.reconciliationAnnualFee) > 0 && <span>+ conciliación: {fmtMoney(data.reconciliationAnnualFee, { decimals: 2 })}</span>}
          </div>
        </div>
      </div>
      <SlideFooter section="pricing" pageNum={16} total={18} />
    </div>
  );
}

function BCSlide21() {
  const cases = [
    { company: 'inDrive', stat: '+90%', label: 'tasa de aprobación', quote: '"El smart routing de Yuno llevó nuestras aprobaciones en LATAM de 68% a más de 90% en menos de 60 días."', role: 'Head of Payments' },
    { company: "mcdonald's", stat: '−32%', label: 'rechazos falsos', quote: '"Redujimos los rechazos falsos en un tercio manteniendo tasas de fraude por debajo de 0,1%."', role: 'VP Digital Payments' },
    { company: 'rappi', stat: '0', label: 'tiempo de integración', quote: '"Estuvimos en vivo con 8 nuevos providers en 3 semanas. Antes habría tomado 6+ meses cada uno."', role: 'CTO' },
  ];
  return (
    <div className="slide theme-ink" data-screen-label="21 Casos de Estudio">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">04 / proof points</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>Casos de estudio</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {cases.map((c, i) => (
            <div key={i} className={'glass-card anim-in anim-in-' + (i + 1)} style={{ padding: 36, borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', textTransform: 'lowercase', marginBottom: 16 }}>{c.company}</div>
              <div style={{ fontSize: 52, fontWeight: 300, color: '#E0ED80', letterSpacing: '-0.02em', marginBottom: 4 }}>{c.stat}</div>
              <div className="t-label" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>{c.label}</div>
              <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic', lineHeight: 1.6, flex: 1 }}>{c.quote}</div>
              <div className="t-label" style={{ color: 'rgba(255,255,255,0.35)', marginTop: 16 }}>{'—'} {c.role}, {c.company}</div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter section="proof points" pageNum={23} total={18} />
    </div>
  );
}

function BCSlide22() {
  const phases = [
    { num: '01', days: '1–14', name: 'discovery', tasks: ['auditoría técnica', 'estrategia de routing', 'mapeo de providers', 'plan de integración'] },
    { num: '02', days: '15–45', name: 'integración', tasks: ['integración de API', 'checkout SDK', 'migración de vault', 'UAT testing'] },
    { num: '03', days: '46–75', name: 'soft launch', tasks: ['5% del tráfico', 'A/B testing de aprobación', 'setup de monitoreo', 'optimizar reglas'] },
    { num: '04', days: '76–90', name: 'cutover total', tasks: ['migración 100% del tráfico', 'decomisionar legacy', 'training del equipo', 'review go-live'] },
  ];
  return (
    <div className="slide theme-ink-2" data-screen-label="22 Implementación">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">05 / el plan</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>90 días a producción</h2>
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
                <span className="t-label" style={{ color: 'rgba(255,255,255,0.35)' }}>días {p.days}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>{p.name}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {p.tasks.map((t, j) => <div key={j} style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />{t}</div>)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter section="el plan" pageNum={24} total={18} />
    </div>
  );
}

function BCSlide23() {
  const objections = [
    { q: '"¿qué pasa si el lift de aprobación no rinde?"', a: 'Garantía contractual: si las tasas de aprobación no mejoran al menos 3pp en 90 días, sales sin penalidad.' },
    { q: '"queremos mantener nuestros acquirers actuales"', a: 'Yuno es un orquestador, no un reemplazo. Mantén todos tus acquirers actuales — agregamos inteligencia encima.' },
    { q: '"agregar una capa aumenta el scope de PCI"', a: 'Yuno tiene certificación PCI DSS Level 1. Nuestro vault saca el scope de PCI de tus sistemas, reduciendo tu carga de compliance.' },
    { q: '"¿qué hay del vendor lock-in?"', a: 'Yuno usa tokens card-on-file estándar. Puedes migrar tokens fuera en cualquier momento. Sin formatos propietarios.' },
    { q: '"¿qué pasa si Yuno se cae?"', a: 'SLA de uptime 99,99% respaldado con créditos financieros. Arquitectura con failover multi-región y <120ms de latencia.' },
    { q: '"nuestro roadmap ya está lleno"', a: 'Integración de un solo API: 2–3 semanas de ingeniería. El SDK de Yuno maneja checkout, vault, routing — reducción neta en tu backlog.' },
  ];
  return (
    <div className="slide theme-ink" data-screen-label="23 Riesgos y Objeciones">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">05 / el plan</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>Riesgos + objeciones</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {objections.map((o, i) => (
            <div key={i} className={'anim-in anim-in-' + (i + 1)} style={{ padding: 24, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 10 }}>{o.q}</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{o.a}</div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter section="el plan" pageNum={25} total={18} />
    </div>
  );
}

function BCSlide24({ data }) {
  const total = data.netAnnualGain;
  return (
    <div className="slide theme-ink-hero" data-screen-label="24 Cierre">
      <div className="ink-grid" />
      <OrbHalftone size={1200} color="#E0ED80" x="85%" y="30%" style={{ opacity: 0.25 }} />
      <OrbHalftone size={800} color="#6B7BFF" x="15%" y="80%" style={{ opacity: 0.35 }} />
      <div style={{ position: 'absolute', top: 64, left: 80 }}><YunoLogo size="md" /></div>
      <div style={{ position: 'absolute', top: '42%', left: 80, right: 80, transform: 'translateY(-50%)' }}>
        <div className="t-subtitle-alt anim-in" style={{ color: 'rgba(140,153,255,0.95)', marginBottom: 32 }}>la propuesta</div>
        <h1 className="t-title anim-in anim-in-2" style={{ fontSize: 128, fontWeight: 200, letterSpacing: '-0.03em', lineHeight: 0.95, marginBottom: 40, color: '#fff' }}>
          Desbloquea{' '}<span style={{ background: 'linear-gradient(120deg, #E0ED80 0%, #8C99FF 60%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{fmtMoney(total, { decimals: 1 })}</span><br/>en el año uno.
        </h1>
        <div className="t-body-l anim-in anim-in-3" style={{ fontSize: 22, color: 'rgba(255,255,255,0.68)', textTransform: 'none', maxWidth: 1000, marginBottom: 48 }}>
          Firmemos un NDA mutuo esta semana. Workshop técnico la próxima semana. Primera transacción a través de Yuno en menos de 30 días.
        </div>
        <div className="anim-in anim-in-4 no-print" style={{ display: 'flex', gap: 16, marginBottom: 56 }}>
          <button style={{ background: '#E0ED80', color: '#0a0a1a', border: 'none', borderRadius: 10, padding: '16px 36px', fontSize: 16, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em' }}>agendar workshop técnico</button>
          <button onClick={() => window.print()} style={{ background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '16px 36px', fontSize: 16, fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em' }}>descargar PDF</button>
        </div>
        <div className="anim-in anim-in-5" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff' }}>{data.salesInitials || 'CG'}</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{data.salesName || 'Carol Grunberg'}</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{data.salesTitle || 'Chief Business Officer'} {'·'} {data.salesEmail || 'carol@yuno.co'}</div>
          </div>
        </div>
      </div>
      <SlideFooter section="cierre" pageNum={18} total={18} />
    </div>
  );
}

/* ============================================================
   BCSlide14B — Desglose por país (entre 14 y 15)
   Lee data.countries: [{ code, name, tx, mdrBps?, avgTicket?, note? }]
   Cae a data.currentMDRBps / data.avgTicket global por fila.
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
    <div className="slide theme-ink-2" data-screen-label="14b Desglose por País">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / business case · estado actual</SectionLabel>
      <div style={{ position: 'absolute', top: 180, left: 80, right: 80, bottom: 110 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 56, alignItems: 'start' }}>

          <div>
            <div className="glow-chip anim-in" style={{ marginBottom: 24 }}>
              <span className="dot" />hoy · por país
            </div>
            <h2 className="t-title anim-in anim-in-1" style={{
              fontSize: 64, fontWeight: 300, letterSpacing: '-0.02em',
              color: '#fff', marginBottom: 18, lineHeight: 1.02,
            }}>
              dónde vive el<br/>volumen hoy.
            </h2>
            <div className="t-body-l" style={{
              fontSize: 18, color: 'rgba(255,255,255,0.6)',
              marginBottom: 36, textTransform: 'none', maxWidth: 620,
            }}>
              transacciones anuales, MDR pagado y ticket promedio por país — tu baseline de pagos actual antes de Yuno.
            </div>
            <div className="anim-in anim-in-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
              <KPI label="transacciones totales / año" value={fmtCompactNum(totals.tx)} sub={`en ${rows.length} mercado${rows.length === 1 ? '' : 's'}`} />
              <KPI label="ticket promedio mezclado" value={`$${avgTktBlended.toFixed(0)}`} sub="ponderado por TPV" />
              <KPI
                label="MDR total pagado / año"
                value={<span style={{ color: '#FF8A5B' }}>{fmtMoney(totals.mdrPaid)}</span>}
                sub={`${blendedBps.toFixed(0)} bps mezclado`}
              />
              <KPI label="TPV total" value={fmtMoney(totals.tpv)} sub="suma por país" />
            </div>
          </div>

          <div className="card-dark anim-in anim-in-3" style={{ padding: 28 }}>
            <div className="t-subtitle-alt" style={{ color: 'rgba(140,153,255,0.9)', marginBottom: 18 }}>
              estado actual · por país
            </div>
            {empty ? (
              <div style={{
                padding: 36, textAlign: 'center',
                color: 'rgba(255,255,255,0.5)', fontSize: 14,
              }}>
                no se proporcionó desglose por país — agrega transacciones por país para poblar esta slide.
              </div>
            ) : (
              <table className="bc-table" style={{ fontSize: 14 }}>
                <thead>
                  <tr>
                    <th>mercado</th>
                    <th style={{ textAlign: 'right' }}>transacciones</th>
                    <th style={{ textAlign: 'right' }}>ticket promedio</th>
                    <th style={{ textAlign: 'right' }}>MDR pagado</th>
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
                    <td style={{ padding: '16px' }}>total · mezclado</td>
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
                }}>costo actual</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)' }}>
                  {fmtMoney(totals.mdrPaid)} saliendo del negocio cada año en MDR — antes de tocar una sola regla de routing.
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
      <SlideFooter section="03 / business case" pageNum={12} total={18} logoColor="rgba(255,255,255,0.5)" />
    </div>
  );
}

/* ============================================================
   BCSlide20B — Pago vs. Retorno (entre 20 y 21)
   Usa data calculada por computeData() (sin tasas / palancas hardcoded).
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
  const grossGain = Number(data.grossGain) || (L1 + L2 + L3);
  const netGain = Number(data.netAnnualGain) || (grossGain - yunoAnnualCost);
  const roi = yunoAnnualCost > 0 ? grossGain / yunoAnnualCost : 0;
  const paybackMonths = Number(data.paybackMonths) || 0;

  const approvalLiftPp = Number(data.approvalLiftPp) || 0;
  const mdrReductionBps = Number(data.mdrReductionBps) || 0;
  const nInt = Number(data.numNewIntegrations) || 0;
  const ttmMonths = Number(data.timeToMarketMonthsSaved) || 0;
  const grossMarginPct = Number(data.grossMargin) || 0;

  const opsNote = nInt > 0
    ? `${nInt} integraciones evitadas + delta de conciliación · ${ttmMonths} meses más rápido`
    : 'costo de integración evitado + delta de conciliación';
  const benefits = [
    { label: 'uplift de aprobación',  value: L1, note: `+${approvalLiftPp.toFixed(1)}pp · margen ${grossMarginPct}% sobre TPV recuperado` },
    { label: 'reducción de MDR',      value: L2, note: `−${Math.round(mdrReductionBps)} bps · ahorro sobre TPV` },
    { label: 'ahorros operativos',    value: L3, note: opsNote },
  ];

  const pricingLabel = data.pricingModel === 'tiered' ? 'tiered · mezclado' : 'tasa flat';
  const paybackLabel = paybackMonths > 0 && paybackMonths < 1
    ? `${Math.round(paybackMonths * 30)} días`
    : paybackMonths > 0
      ? `${paybackMonths.toFixed(1)} mo`
      : '—';

  return (
    <div className="slide theme-ink-hero" data-screen-label="20b Pago vs Retorno">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">04 / pricing · intercambio de valor</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80, bottom: 110 }}>

        <h2 className="t-title anim-in" style={{
          fontSize: 64, fontWeight: 300, letterSpacing: '-0.02em',
          color: '#fff', marginBottom: 14,
        }}>
          lo que pagas <span style={{ color: 'rgba(255,255,255,0.45)' }}>vs.</span> lo que obtienes.
        </h2>
        <div className="t-body-l" style={{
          fontSize: 19, color: 'rgba(255,255,255,0.6)',
          marginBottom: 36, textTransform: 'none',
        }}>
          matemática simple: la factura a la izquierda, el retorno a la derecha — cada año.
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
              lo que le pagas a yuno
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 28 }}>
              costo anual · {pricingLabel} + SaaS fijo
            </div>

            <div style={{
              marginBottom: 22, paddingBottom: 22,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{
                fontSize: 12, color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase', letterSpacing: '0.14em',
                fontWeight: 600, marginBottom: 10,
              }}>fee por transacción</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 8 }}>
                <div style={{ fontSize: 36, color: '#fff', fontWeight: 300 }}>${blendedPerTx.toFixed(3)}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>× tx aprobadas</div>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                {txPerYear.toLocaleString()} tx / año →{' '}
                <span style={{ color: '#FF8A5B', fontWeight: 500 }}>{fmtMoney(txAnnualFee)}</span>
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <div style={{
                fontSize: 12, color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase', letterSpacing: '0.14em',
                fontWeight: 600, marginBottom: 10,
              }}>plataforma saas · fijo</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 8 }}>
                <div style={{ fontSize: 36, color: '#fff', fontWeight: 300 }}>{fmtMoney(saasMonthly)}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>/ mes</div>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                12 meses →{' '}
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
              }}>costo anual total</div>
              <div style={{
                fontSize: 48, color: '#FF8A5B',
                fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1,
              }}>
                {fmtMoney(yunoAnnualCost)}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>
                ≈ {fmtMoney(yunoAnnualCost / 12)} / mes all-in
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
            }}>retornos</div>
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
              lo que yuno devuelve
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 24 }}>
              valor bruto anual · tres palancas apiladas
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
                }}>ganancia bruta anual</div>
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
                }}>neto del fee yuno</div>
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
            Por cada <span style={{ color: '#FF8A5B', fontWeight: 600 }}>$1</span> pagado a Yuno, recuperas{' '}
            <span style={{ color: '#E0ED80', fontWeight: 600 }}>${roi.toFixed(0)}</span>{' '}
            en aprobaciones, ahorros de MDR y operaciones — neto de nuestro fee.
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
              }}>neto año uno</div>
              <div style={{ fontSize: 22, color: '#E0ED80', fontWeight: 300 }}>{fmtMoney(netGain)}</div>
            </div>
          </div>
        </div>

      </div>
      <SlideFooter section="04 / pricing" pageNum={17} total={18} logoColor="rgba(255,255,255,0.5)" />
    </div>
  );
}

Object.assign(window, { BCSlide13, BCSlide14, BCSlide14B, BCSlide15, BCSlide16, BCSlide17, BCSlide18, BCSlide19, BCSlide20, BCSlide20B, BCSlide21, BCSlide22, BCSlide23, BCSlide24 });
