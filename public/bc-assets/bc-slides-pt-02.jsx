/* Business Case Deck — Slides 13-24 (PT) */

function DownloadPdfButton({ clientName }) {
  const [state, setState] = React.useState('idle'); // idle | loading | error
  const baseStyle = { background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '16px 36px', fontSize: 16, fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: 'inherit' };
  const onClick = async (e) => {
    e.preventDefault();
    if (state === 'loading') return;
    const slug = window.BC_TRACKING && window.BC_TRACKING.slug;
    if (!slug) { setState('error'); return; }
    setState('loading');
    try {
      const r = await fetch(`https://bridge.yuno.tools/api/bc/${slug}/pdf`, { credentials: 'omit' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(clientName || 'business-case').replace(/[^\w\s.-]/g, '').replace(/\s+/g, '-')}-business-case.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setState('idle');
    } catch (err) {
      console.error('[bc-pdf] download failed', err);
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  };
  const label = state === 'loading' ? 'gerando PDF…' : state === 'error' ? 'tentar novamente' : 'baixar PDF';
  return <button onClick={onClick} disabled={state === 'loading'} style={{ ...baseStyle, opacity: state === 'loading' ? 0.7 : 1, cursor: state === 'loading' ? 'wait' : 'pointer' }}>{label}</button>;
}

function BCSlide13() {
  return (
    <div className="slide theme-ink-hero" data-screen-label="13 Seção: Business Case">
      <div className="ink-grid" />
      <OrbHalftone size={900} color="#E0ED80" x="20%" y="40%" style={{ opacity: 0.35 }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
        <div className="section-glyph anim-in">03</div>
        <h2 className="t-title anim-in anim-in-2" style={{ fontSize: 108, fontWeight: 300, color: '#fff' }}>O business case</h2>
      </div>
      <SlideFooter section="o business case" pageNum={10} total={18} />
    </div>
  );
}

function BCSlide14({ data }) {
  setBCCurrency(data.currency);
  const rows = [
    { label: 'TPV anual', value: fmtMoney(data.tpv) },
    { label: 'ticket médio', value: '$' + data.avgTicket },
    { label: 'taxa de aprovação atual', value: fmtPct(data.currentApproval) },
    { label: 'MDR misto atual', value: fmtPct(data.currentMDR, 2) },
    { label: 'mercados ativos', value: String(data.activeMarkets) },
    { label: 'métodos de pagamento', value: String(data.currentAPMs) },
    { label: 'margem bruta', value: fmtPct(data.grossMargin, 0) },
  ];
  return (
    <div className="slide theme-ink" data-screen-label="14 Premissas">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / o business case</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>Ponto de partida</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 48 }}>
          <div>
            <div className="t-label anim-in" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>premissas / dados compartilhados</div>
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
              {'•'} Todas as projeções usam estimativas do caso base (P50)<br/>
              {'•'} Lift de aprovação benchmarked contra o portfólio de clientes Yuno<br/>
              {'•'} Economia de MDR validada com taxas de mercado de processadoras<br/>
              {'•'} Economia operacional baseada em dados de implementação Yuno<br/>
              {'•'} Não atribuímos valor à redução de fraude
            </div>
          </div>
        </div>
      </div>
      <SlideFooter section="o business case" pageNum={11} total={18} />
    </div>
  );
}

function BCSlide15({ data }) {
  setBCCurrency(data.currency);
  const currentApproval = data.currentApproval;
  const targetApproval = data.targetApproval;
  const incrTPV = data.incrTPV_approvals;
  const incrMargin = data.L1;
  const approvalLiftPp = data.approvalLiftPp;
  const grossMarginPct = data.grossMargin;
  const lineData = [
    { name: 'com Yuno', color: '#E0ED80', points: [
      { x: 0, y: currentApproval, label: 'dia 0' }, { x: 15, y: currentApproval + 1.2, label: '' },
      { x: 30, y: currentApproval + 3.1, label: 'dia 30' }, { x: 45, y: currentApproval + 4.6, label: '' },
      { x: 60, y: currentApproval + 5.9, label: 'dia 60' }, { x: 75, y: currentApproval + 6.8, label: '' },
      { x: 90, y: targetApproval, label: 'dia 90' },
    ]},
    { name: 'sem Yuno', color: 'rgba(255,255,255,0.25)', dashed: true, points: [
      { x: 0, y: currentApproval, label: '' }, { x: 15, y: currentApproval + 0.1, label: '' },
      { x: 30, y: currentApproval + 0.2, label: '' }, { x: 45, y: currentApproval + 0.2, label: '' },
      { x: 60, y: currentApproval + 0.3, label: '' }, { x: 75, y: currentApproval + 0.3, label: '' },
      { x: 90, y: currentApproval + 0.3, label: '' },
    ]},
  ];
  return (
    <div className="slide theme-ink-2" data-screen-label="15 Alavanca 1: Aprovações">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / alavanca 01</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 56, fontWeight: 300, color: '#fff', marginBottom: 8 }}>Alavanca 01: aprovações</h2>
        <div className="t-subtitle-alt anim-in anim-in-1" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 40 }}>smart routing + retentativas + network tokens</div>
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <KPI label="aprovação atual" value={fmtPct(currentApproval)} style={{}} />
            <KPI label="aprovação alvo" value={fmtPct(targetApproval)} sub={"+" + approvalLiftPp + "pp com Yuno"} style={{}} />
            <KPI label="TPV incremental" value={fmtMoney(incrTPV)} style={{}} />
            <KPI label="margem incremental" value={fmtMoney(incrMargin)} sub={"@ " + grossMarginPct + "% margem bruta"} style={{}} />
            <div className="anim-in anim-in-6" style={{ background: 'rgba(224,237,128,0.06)', border: '1px solid rgba(224,237,128,0.12)', borderRadius: 10, padding: '14px 18px', marginTop: 8 }}>
              <div className="t-label" style={{ color: '#E0ED80', marginBottom: 6 }}>proof point</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>inDrive alcançou +90% de taxa de aprovação com Yuno smart routing na LATAM</div>
            </div>
          </div>
          <div className="anim-in anim-in-3">
            <LineChart series={lineData} width={900} height={380} yMax={Math.ceil(targetApproval + 3)} yMin={Math.floor(currentApproval - 2)} />
          </div>
        </div>
      </div>
      <SlideFooter section="o business case" pageNum={13} total={18} />
    </div>
  );
}

function BCSlide16({ data }) {
  setBCCurrency(data.currency);
  const currentMDRPct = data.currentMDR;
  const targetMDRPct = data.targetMDR;
  const mdrReductionBps = data.mdrReductionBps;
  const savings = data.L2;
  const breakdown = [
    { name: 'otimização de interchange', bps: 21, pct: 55 },
    { name: 'arbitragem multi-acquirer', bps: 14, pct: 37 },
    { name: 'otimização de scheme fees', bps: 3, pct: 8 },
  ];
  return (
    <div className="slide theme-ink" data-screen-label="16 Alavanca 2: MDR">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / alavanca 02</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 56, fontWeight: 300, color: '#fff', marginBottom: 8 }}>Alavanca 02: otimização de MDR</h2>
        <div className="t-subtitle-alt anim-in anim-in-1" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 40 }}>taxa de desconto · routing multi-acquirer + processamento local + otimização de scheme</div>
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <KPI label="MDR misto atual" value={fmtPct(currentMDRPct, 2)} />
            <KPI label="MDR misto alvo" value={fmtPct(targetMDRPct, 2)} sub={'−' + mdrReductionBps + ' bps com Yuno'} />
            <KPI label="economia anual" value={fmtMoney(savings)} />
          </div>
          <div className="anim-in anim-in-3">
            <div className="t-label" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>composição da economia</div>
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
      <SlideFooter section="o business case" pageNum={14} total={18} />
    </div>
  );
}

function BCSlide17({ data }) {
  setBCCurrency(data.currency);
  const incrTPV = data.incrTPV_apms;
  const incrMargin = data.L3;
  const apmUpliftPct = data.apmUpliftPct;
  const newAPMsAdded = data.newAPMsAdded;
  const grossMarginPct = data.grossMargin;
  const regions = [
    { name: 'brasil', methods: 'PIX, Boleto', color: '#E0ED80' },
    { name: 'índia', methods: 'UPI, Paytm, PhonePe', color: '#8C99FF' },
    { name: 'méxico', methods: 'OXXO, SPEI, CoDi', color: '#E0ED80' },
    { name: 'golfo', methods: 'mada, KNET, Fawry', color: '#8C99FF' },
    { name: 'europa', methods: 'iDEAL, Bancontact, BLIK', color: '#E0ED80' },
    { name: 'sudeste asiático', methods: 'GCash, GrabPay, DANA', color: '#8C99FF' },
  ];
  return (
    <div className="slide theme-ink-2" data-screen-label="17 Alavanca 3: APMs">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / alavanca 03</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 56, fontWeight: 300, color: '#fff', marginBottom: 8 }}>Alavanca 03: métodos de pagamento alternativos</h2>
        <div className="t-subtitle-alt anim-in anim-in-1" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 40 }}>ative métodos locais em cada mercado com uma única integração</div>
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <KPI label="novos métodos ativados" value={"+" + newAPMsAdded} />
            <KPI label="uplift de conversão" value={"+" + apmUpliftPct + "%"} sub="varia por mercado" />
            <KPI label="TPV incremental" value={fmtMoney(incrTPV)} />
            <KPI label="margem incremental" value={fmtMoney(incrMargin)} sub={"@ " + grossMarginPct + "% margem bruta"} />
          </div>
          <div className="anim-in anim-in-3">
            <div className="t-label" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>mapa de ativação regional</div>
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
      <SlideFooter section="o business case" pageNum={18} total={18} />
    </div>
  );
}

function BCSlide18({ data }) {
  setBCCurrency(data.currency);
  const nInt = Number(data.numNewIntegrations) || 0;
  const intBuild = Number(data.integrationCostBuild) || 0;
  const ttmMonths = Number(data.timeToMarketMonthsSaved) || 0;
  const reconOther = Number(data.reconciliationCostOtherAnnual) || 0;
  const reconYuno = Number(data.reconciliationCostYunoAnnual) || 0;
  const rows = [
    { label: nInt > 0 ? 'integração (' + nInt + ' providers · 3 meses cada)' : 'integração', build: intBuild, yuno: 0, yunoNote: 'incluído' },
    { label: 'reconciliação (anual)', build: reconOther, yuno: reconYuno, yunoNote: reconYuno === 0 ? 'incluído' : undefined },
  ];
  const buildTotal1yr = rows.reduce((a, r) => a + Number(r.build || 0), 0);
  const yunoTotal1yr = rows.reduce((a, r) => a + (r.yunoNote === 'incluído' ? 0 : Number(r.yuno || 0)), 0);
  return (
    <div className="slide theme-ink" data-screen-label="Alavanca 3: Operações">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / alavanca 03</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 56, fontWeight: 300, color: '#fff', marginBottom: 8 }}>Alavanca 03: economia operacional</h2>
        <div className="t-subtitle-alt anim-in anim-in-1" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 40 }}>consolida providers, automatiza reconciliação, acelera time-to-market</div>
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <KPI label="FTE liberados" value={String(data.fteFreed)} sub="payments ops e engenharia" />
            <KPI label="time-to-market economizado" value={ttmMonths + ' mo'} sub={nInt > 0 ? nInt + ' novos providers · 3 meses cada' : 'mais rápido do que construir in-house'} />
            <KPI label="reconciliação automatizada" value="80%" sub="vs. matching manual atual" />
          </div>
          <div className="anim-in anim-in-3">
            <div className="t-label" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>comparação em 1 ano</div>
            <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', background: 'rgba(255,255,255,0.04)', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="t-label" style={{ color: 'rgba(255,255,255,0.4)' }}></div>
                <div className="t-label" style={{ color: '#FF6A6A', textAlign: 'center' }}>build / outros providers</div>
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
                <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>total 1 ano</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#FF6A6A', textAlign: 'center' }}>{fmtMoney(buildTotal1yr, { decimals: 1 })}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#E0ED80', textAlign: 'center' }}>{fmtMoney(yunoTotal1yr, { decimals: 1 })}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <SlideFooter section="o business case" pageNum={15} total={18} />
    </div>
  );
}

function BCSlide19({ data }) {
  setBCCurrency(data.currency);
  const total = data.netAnnualGain;
  const fee = data.yunoAnnualFee;
  const wfData = [
    { kind: 'base', value: 0.001, label: 'baseline|status quo' },
    { kind: 'gain', value: data.L1, label: 'aprovações|+' + data.approvalLiftPp + 'pp' },
    { kind: 'gain', value: data.L2, label: 'MDR|−' + data.mdrReductionBps + ' bps' },
    { kind: 'gain', value: data.L3, label: 'novos APMs|+' + data.apmUpliftPct + '% TPV' },
    { kind: 'gain', value: data.L4, label: 'economia ops|build–buy' },
    { kind: 'cost', value: fee, label: 'fee yuno|plataforma + tx' },
    { kind: 'total', value: total, label: 'ganho líquido|ano um' },
  ];
  const conservative = data.conservative, optimistic = data.optimistic;
  return (
    <div className="slide theme-ink-hero" data-screen-label="19 Waterfall">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / business case</SectionLabel>
      <div style={{ position: 'absolute', top: 140, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 16 }}>O stack, somado.</h2>
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
              <div className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>otimista</div>
              <div style={{ fontSize: 28, fontWeight: 300, color: 'rgba(255,255,255,0.7)' }}>{fmtMoney(optimistic, { decimals: 1 })}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>ROI ano 1</div>
              <div style={{ fontSize: 36, fontWeight: 300, color: '#fff' }}>{(total / fee).toFixed(1)}x</div>
            </div>
          </div>
        </div>
      </div>
      <SlideFooter section="o business case" pageNum={20} total={18} />
    </div>
  );
}

function BCSlide20({ data }) {
  setBCCurrency(data.currency);
  const model = data.pricingModel === 'flat'
    ? 'flat'
    : data.pricingModel === 'tiers' ? 'tiers' : 'tramos';
  const tierSubLabel = model === 'tramos'
    ? 'acumulado · cada faixa cobra sua taxa'
    : 'todo o volume na taxa do bracket';
  return (
    <div className="slide theme-ink-2" data-screen-label="20 Pricing">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">04 / pricing</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <div className="anim-in" style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 48, flexWrap: 'wrap' }}>
          <h2 className="t-title" style={{ fontSize: 64, fontWeight: 300, color: '#fff' }}>Pricing</h2>
          <span style={{ fontSize: 12, color: '#8C99FF', letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase', padding: '6px 14px', borderRadius: 999, border: '1px solid rgba(140,153,255,0.35)', background: 'rgba(140,153,255,0.08)' }}>
            valores em {data.currency || 'USD'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginBottom: 32 }}>
          {/* Card 1: taxa por tx aprovada */}
          <div className="anim-in anim-in-1" style={{ padding: 32, borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="t-label" style={{ color: '#8C99FF', marginBottom: 16 }}>por transação aprovada</div>
            {model === 'flat' && (
              <React.Fragment>
                <div style={{ fontSize: 52, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em', marginBottom: 8 }}>${fmtRate(data.ratePerTx)}<span style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>/tx aprovada</span></div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>taxa flat em todo o volume</div>
              </React.Fragment>
            )}
            {model !== 'flat' && (
              <React.Fragment>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  {data.rateTiers.map((t, i) => {
                    const prevMonthly = i === 0 ? 0 : Math.round(data.rateTiers[i-1].upToTx / 12);
                    const upToMonthly = (t.upToTx === Infinity || t.upToTx == null) ? null : Math.round(t.upToTx / 12);
                    const capLabel = upToMonthly == null ? '>' + fmtNum(prevMonthly) : fmtNum(prevMonthly) + '–' + fmtNum(upToMonthly);
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{capLabel} tx/mês</div>
                        <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>${fmtRate(t.ratePerTx)}/tx</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 12, fontStyle: 'italic' }}>{tierSubLabel}</div>
              </React.Fragment>
            )}
          </div>
          {/* Card 2: fee de reconciliação (se tiver) ou compromisso mínimo */}
          <div className="anim-in anim-in-2" style={{ padding: 32, borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {Number(data.reconciliationFee) > 0 ? (
              <React.Fragment>
                <div className="t-label" style={{ color: '#8C99FF', marginBottom: 16 }}>produto de reconciliação</div>
                <div style={{ fontSize: 52, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em', marginBottom: 8 }}>{fmtMoney(data.reconciliationFee, { decimals: 0 })}<span style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>/mês</span></div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>fee mensal fixo</div>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <div className="t-label" style={{ color: '#8C99FF', marginBottom: 16 }}>compromisso mínimo</div>
                <div style={{ fontSize: 52, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em', marginBottom: 8 }}>{fmtNum(Math.round(Number(data.minTxAnnual) / 12))}<span style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}> tx/mês</span></div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{'≈'} {fmtMoney(Number(data.minCommitFee) / 12, { decimals: 1 })} /mês equivalente</div>
                <div style={{ fontSize: 12, color: '#8C99FF', marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(140,153,255,0.15)', fontWeight: 600, letterSpacing: '0.02em' }}>+ reconciliação: incluído no pricing</div>
              </React.Fragment>
            )}
          </div>
          {/* Card 3: SaaS fee */}
          <div className="anim-in anim-in-3" style={{ padding: 32, borderRadius: 16, background: 'rgba(224,237,128,0.06)', border: '1.5px solid rgba(224,237,128,0.25)' }}>
            <div className="t-label" style={{ color: '#E0ED80', marginBottom: 16 }}>fee de plataforma SaaS</div>
            <div style={{ fontSize: 52, fontWeight: 300, color: '#E0ED80', letterSpacing: '-0.02em', marginBottom: 8 }}>{fmtMoney(data.monthlySaaS)}<span style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>/mês</span></div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>plataforma + suporte 24/7</div>
          </div>
        </div>
        {/* Sua estimativa */}
        <div className="anim-in anim-in-5" style={{ background: 'rgba(140,153,255,0.06)', border: '1px solid rgba(140,153,255,0.12)', borderRadius: 12, padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="t-label" style={{ color: '#8C99FF' }}>sua estimativa {'·'} {fmtNum(Number(data.numActualTx) / 12)} transações / mês</div>
            <div style={{ fontSize: 32, fontWeight: 300, color: '#fff' }}>{fmtMoney(Number(data.yunoAnnualFee) / 12, { decimals: 2 })}<span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}> /mês</span></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.55)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
            <span>fee real de tx: {fmtMoney(Number(data.actualTxFee) / 12, { decimals: 2 })}</span>
            <span>compromisso mín: {fmtMoney(Number(data.minCommitFee) / 12, { decimals: 2 })}</span>
            <span style={{ color: '#E0ED80' }}>tx (máx): {fmtMoney(Number(data.txAnnualFee) / 12, { decimals: 2 })}</span>
            <span>+ saas: {fmtMoney(Number(data.saasAnnualFee) / 12, { decimals: 2 })}</span>
            {Number(data.reconciliationAnnualFee) > 0 && <span>+ reconciliação: {fmtMoney(Number(data.reconciliationAnnualFee) / 12, { decimals: 2 })}</span>}
          </div>
        </div>
      </div>
      <SlideFooter section="pricing" pageNum={16} total={18} />
    </div>
  );
}

/* BCSlide20C — Serviços adicionais com preços. */
function BCSlide20C({ data }) {
  setBCCurrency(data.currency);
  const t = getServiceI18n(data.locale || 'pt');
  const cur = data.currency || 'USD';
  const cfg = (data.additionalServices && typeof data.additionalServices === 'object') ? data.additionalServices : {};
  return (
    <div className="slide theme-ink-2" data-screen-label="20C Serviços adicionais">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">04 / pricing · adicionais</SectionLabel>
      <div style={{ position: 'absolute', top: 130, left: 80, right: 80, bottom: 80, display: 'flex', flexDirection: 'column' }}>
        <div className="anim-in" style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 28, flexWrap: 'wrap' }}>
          <h2 className="t-title" style={{ fontSize: 56, fontWeight: 300, color: '#fff' }}>{t.title}</h2>
          <span style={{ fontSize: 12, color: '#8C99FF', letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase', padding: '6px 14px', borderRadius: 999, border: '1px solid rgba(140,153,255,0.35)', background: 'rgba(140,153,255,0.08)' }}>
            {t.valuesIn} {cur}
          </span>
        </div>
        <div className="anim-in anim-in-1" style={{ display: 'grid', gridTemplateColumns: '320px 1fr 220px', gap: 0, padding: '14px 24px', borderRadius: 12, background: 'rgba(140,153,255,0.06)', border: '1px solid rgba(140,153,255,0.12)', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: '#8C99FF', letterSpacing: '0.16em', fontWeight: 700, textTransform: 'uppercase' }}>{t.colService}</span>
          <span style={{ fontSize: 11, color: '#8C99FF', letterSpacing: '0.16em', fontWeight: 700, textTransform: 'uppercase' }}>{t.colDefinition}</span>
          <span style={{ fontSize: 11, color: '#8C99FF', letterSpacing: '0.16em', fontWeight: 700, textTransform: 'uppercase', textAlign: 'right' }}>{t.colPrice}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {ADDITIONAL_SERVICES.map((svc, i) => {
            const item = cfg[svc.id] || {};
            const enabled = item.enabled !== false;
            const price = (item.price != null && Number.isFinite(Number(item.price))) ? Number(item.price) : svc.defaultPrice;
            const itemI18n = (t.items && t.items[svc.id]) || { name: svc.id, desc: '' };
            return (
              <div key={svc.id} className={'anim-in anim-in-' + Math.min(8, i + 2)} style={{ display: 'grid', gridTemplateColumns: '320px 1fr 220px', alignItems: 'center', gap: 0, padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 17, fontWeight: 600, color: '#fff' }}>{itemI18n.name}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, paddingRight: 24 }}>{itemI18n.desc}</div>
                <div style={{ textAlign: 'right' }}>
                  {enabled ? (
                    <span style={{ fontSize: 22, fontWeight: 600, color: '#E0ED80', letterSpacing: '-0.01em' }}>{fmtPriceRate(price)}<span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>/tx</span></span>
                  ) : (
                    <span style={{ fontSize: 12, color: '#8C99FF', letterSpacing: '0.14em', fontWeight: 700, textTransform: 'uppercase', padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(140,153,255,0.35)', background: 'rgba(140,153,255,0.08)' }}>{t.included}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <SlideFooter section="pricing" pageNum={17} total={18} />
    </div>
  );
}

function BCSlide21() {
  const cases = [
    { company: 'inDrive', stat: '+90%', label: 'taxa de aprovação', quote: '"O smart routing da Yuno levou nossas aprovações na LATAM de 68% para mais de 90% em menos de 60 dias."', role: 'Head of Payments' },
    { company: "mcdonald's", stat: '−32%', label: 'recusas falsas', quote: '"Reduzimos as recusas falsas em um terço mantendo as taxas de fraude abaixo de 0,1%."', role: 'VP Digital Payments' },
    { company: 'rappi', stat: '0', label: 'tempo de integração', quote: '"Entramos no ar com 8 novos providers em 3 semanas. Antes teria levado 6+ meses cada um."', role: 'CTO' },
  ];
  return (
    <div className="slide theme-ink" data-screen-label="21 Casos de Estudo">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">04 / proof points</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>Casos de estudo</h2>
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
    { num: '01', days: '1–14', name: 'discovery', tasks: ['auditoria técnica', 'estratégia de routing', 'mapeamento de providers', 'plano de integração'] },
    { num: '02', days: '15–45', name: 'integração', tasks: ['integração de API', 'checkout SDK', 'migração do vault', 'UAT testing'] },
    { num: '03', days: '46–75', name: 'soft launch', tasks: ['5% do tráfego', 'A/B testing de aprovação', 'setup de monitoramento', 'otimizar regras'] },
    { num: '04', days: '76–90', name: 'cutover total', tasks: ['migração 100% do tráfego', 'descomissionar legado', 'treinamento do time', 'review de go-live'] },
  ];
  return (
    <div className="slide theme-ink-2" data-screen-label="22 Implementação">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">05 / o plano</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>90 dias até produção</h2>
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
                <span className="t-label" style={{ color: 'rgba(255,255,255,0.35)' }}>dias {p.days}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>{p.name}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {p.tasks.map((t, j) => <div key={j} style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />{t}</div>)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter section="o plano" pageNum={24} total={18} />
    </div>
  );
}

function BCSlide23() {
  const objections = [
    { q: '"e se o lift de aprovação não acontecer?"', a: 'Garantia contratual: se as taxas de aprovação não melhorarem ao menos 3pp em 90 dias, você sai sem penalidade.' },
    { q: '"queremos manter nossos acquirers atuais"', a: 'A Yuno é um orquestrador, não um substituto. Mantenha todos os seus acquirers atuais — adicionamos inteligência por cima.' },
    { q: '"adicionar uma camada aumenta o escopo de PCI"', a: 'A Yuno tem certificação PCI DSS Level 1. Nosso vault tira o escopo de PCI dos seus sistemas, reduzindo sua carga de compliance.' },
    { q: '"e quanto a vendor lock-in?"', a: 'A Yuno usa tokens card-on-file padrão. Você pode migrar tokens para fora a qualquer momento. Sem formatos proprietários.' },
    { q: '"e se a Yuno cair?"', a: 'SLA de uptime 99,99% respaldado por créditos financeiros. Arquitetura com failover multi-região e <120ms de latência.' },
    { q: '"nosso roadmap já está cheio"', a: 'Integração de uma única API: 2–3 semanas de engenharia. O SDK da Yuno cuida de checkout, vault, routing — redução líquida no seu backlog.' },
  ];
  return (
    <div className="slide theme-ink" data-screen-label="23 Riscos e Objeções">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">05 / o plano</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>Riscos + objeções</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {objections.map((o, i) => (
            <div key={i} className={'anim-in anim-in-' + (i + 1)} style={{ padding: 24, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 10 }}>{o.q}</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{o.a}</div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter section="o plano" pageNum={25} total={18} />
    </div>
  );
}

function BCSlide24({ data }) {
  setBCCurrency(data.currency);
  const total = data.netAnnualGain;
  return (
    <div className="slide theme-ink-hero" data-screen-label="24 Cierre">
      <div className="ink-grid" />
      <OrbHalftone size={1200} color="#E0ED80" x="85%" y="30%" style={{ opacity: 0.25 }} />
      <OrbHalftone size={800} color="#6B7BFF" x="15%" y="80%" style={{ opacity: 0.35 }} />
      <div style={{ position: 'absolute', top: 64, left: 80 }}><YunoLogo size="md" /></div>
      <div style={{ position: 'absolute', top: '42%', left: 80, right: 80, transform: 'translateY(-50%)' }}>
        <div className="t-subtitle-alt anim-in" style={{ color: 'rgba(140,153,255,0.95)', marginBottom: 32 }}>a proposta</div>
        <h1 className="t-title anim-in anim-in-2" style={{ fontSize: 128, fontWeight: 200, letterSpacing: '-0.03em', lineHeight: 0.95, marginBottom: 40, color: '#fff' }}>
          Desbloqueie{' '}<span style={{ background: 'linear-gradient(120deg, #E0ED80 0%, #8C99FF 60%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{fmtMoney(total, { decimals: 1 })}</span><br/>no ano um.
        </h1>
        <div className="t-body-l anim-in anim-in-3" style={{ fontSize: 22, color: 'rgba(255,255,255,0.68)', textTransform: 'none', maxWidth: 1000, marginBottom: 48 }}>
          Vamos assinar um NDA mútuo esta semana. Workshop técnico na próxima semana. Primeira transação pela Yuno em menos de 30 dias.
        </div>
        <div className="anim-in anim-in-4 no-print" style={{ display: 'flex', gap: 16, marginBottom: 56 }}>
          <a href={data.bookingUrl || `mailto:${data.salesEmail}?subject=${encodeURIComponent('Workshop técnico · ' + (data.clientName || 'Yuno'))}`} target="_blank" rel="noopener noreferrer" style={{ background: '#E0ED80', color: '#0a0a1a', border: 'none', borderRadius: 10, padding: '16px 36px', fontSize: 16, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em', textDecoration: 'none', display: 'inline-block' }}>agendar workshop técnico</a>
          <DownloadPdfButton clientName={data.clientName} />
          <noscript><a href={`https://bridge.yuno.tools/api/bc/${(window.BC_TRACKING && window.BC_TRACKING.slug) || ''}/pdf`} download>baixar PDF</a></noscript>
        </div>
        <div className="anim-in anim-in-5" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff' }}>{data.salesInitials || 'CG'}</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{data.salesName || 'Carol Grunberg'}</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{data.salesTitle || 'Chief Business Officer'} {'·'} {data.salesEmail || 'carol@yuno.co'}</div>
          </div>
        </div>
      </div>
      <SlideFooter section="encerramento" pageNum={18} total={18} />
    </div>
  );
}

/* ============================================================
   BCSlide14B — Detalhamento por país (entre 14 e 15)
   Lê data.countries: [{ code, name, tx, mdrBps?, avgTicket?, note? }]
   Cai para data.currentMDRBps / data.avgTicket global por linha.
   ============================================================ */
function BCSlide14B({ data }) {
  setBCCurrency(data.currency);
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
    <div className="slide theme-ink-2" data-screen-label="14b Detalhamento por País">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">03 / business case · estado atual</SectionLabel>
      <div style={{ position: 'absolute', top: 180, left: 80, right: 80, bottom: 110 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 56, alignItems: 'start' }}>

          <div>
            <div className="glow-chip anim-in" style={{ marginBottom: 24 }}>
              <span className="dot" />hoje · por país
            </div>
            <h2 className="t-title anim-in anim-in-1" style={{
              fontSize: 64, fontWeight: 300, letterSpacing: '-0.02em',
              color: '#fff', marginBottom: 18, lineHeight: 1.02,
            }}>
              onde vive o<br/>volume hoje.
            </h2>
            <div className="t-body-l" style={{
              fontSize: 18, color: 'rgba(255,255,255,0.6)',
              marginBottom: 36, textTransform: 'none', maxWidth: 620,
            }}>
              transações anuais, MDR pago e ticket médio por país — sua baseline de pagamentos atual antes da Yuno.
            </div>
            <div className="anim-in anim-in-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
              <KPI label="transações totais / ano" value={fmtCompactNum(totals.tx)} sub={`em ${rows.length} mercado${rows.length === 1 ? '' : 's'}`} />
              <KPI label="ticket médio misto" value={`$${avgTktBlended.toFixed(0)}`} sub="ponderado por TPV" />
              <KPI
                label="MDR total pago / ano"
                value={<span style={{ color: '#FF8A5B' }}>{fmtMoney(totals.mdrPaid)}</span>}
                sub={`${blendedBps.toFixed(0)} bps misto`}
              />
              <KPI label="TPV total" value={fmtMoney(totals.tpv)} sub="soma por país" />
            </div>
          </div>

          <div className="card-dark anim-in anim-in-3" style={{ padding: 28 }}>
            <div className="t-subtitle-alt" style={{ color: 'rgba(140,153,255,0.9)', marginBottom: 18 }}>
              estado atual · por país
            </div>
            {empty ? (
              <div style={{
                padding: 36, textAlign: 'center',
                color: 'rgba(255,255,255,0.5)', fontSize: 14,
              }}>
                detalhamento por país não fornecido — adicione transações por país para preencher este slide.
              </div>
            ) : (
              <table className="bc-table" style={{ fontSize: 14 }}>
                <thead>
                  <tr>
                    <th>mercado</th>
                    <th style={{ textAlign: 'right' }}>transações</th>
                    <th style={{ textAlign: 'right' }}>ticket médio</th>
                    <th style={{ textAlign: 'right' }}>MDR pago</th>
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
                    <td style={{ padding: '16px' }}>total · misto</td>
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
                }}>custo atual</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)' }}>
                  {fmtMoney(totals.mdrPaid)} saindo do negócio todo ano em MDR — antes de mexer em uma única regra de routing.
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
   BCSlide20B — Pagamento vs. Retorno (entre 20 e 21)
   Usa data calculada por computeData() (sem taxas / alavancas hardcoded).
   ============================================================ */
function BCSlide20B({ data }) {
  setBCCurrency(data.currency);
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
    ? `${nInt} integrações evitadas + delta de reconciliação · ${ttmMonths} meses mais rápido`
    : 'custo de integração evitado + delta de reconciliação';
  const benefits = [
    { label: 'uplift de aprovação',  value: L1, note: `+${approvalLiftPp.toFixed(1)}pp · margem ${grossMarginPct}% sobre TPV recuperado` },
    { label: 'redução de MDR',       value: L2, note: `−${Math.round(mdrReductionBps)} bps · economia sobre TPV` },
    { label: 'economia operacional', value: L3, note: opsNote },
  ];

  const pricingLabel = data.pricingModel === 'tramos' || data.pricingModel === 'tiered'
    ? 'tramos · misto'
    : data.pricingModel === 'tiers'
      ? 'tiers · por volume'
      : 'taxa flat';
  const paybackLabel = paybackMonths > 0 && paybackMonths < 1
    ? `${Math.round(paybackMonths * 30)} dias`
    : paybackMonths > 0
      ? `${paybackMonths.toFixed(1)} mo`
      : '—';

  return (
    <div className="slide theme-ink-hero" data-screen-label="20b Pagamento vs Retorno">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">04 / pricing · troca de valor</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80, bottom: 110 }}>

        <h2 className="t-title anim-in" style={{
          fontSize: 64, fontWeight: 300, letterSpacing: '-0.02em',
          color: '#fff', marginBottom: 14,
        }}>
          o que você paga <span style={{ color: 'rgba(255,255,255,0.45)' }}>vs.</span> o que você recebe.
        </h2>
        <div className="t-body-l" style={{
          fontSize: 19, color: 'rgba(255,255,255,0.6)',
          marginBottom: 36, textTransform: 'none',
        }}>
          matemática simples: a fatura à esquerda, o retorno à direita — todo ano.
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
              o que você paga à yuno
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 28 }}>
              custo anual · {pricingLabel} + SaaS fixo
            </div>

            <div style={{
              marginBottom: 22, paddingBottom: 22,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{
                fontSize: 12, color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase', letterSpacing: '0.14em',
                fontWeight: 600, marginBottom: 10,
              }}>fee por transação</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 8 }}>
                <div style={{ fontSize: 36, color: '#fff', fontWeight: 300 }}>${blendedPerTx.toFixed(3)}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>× tx aprovadas</div>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                {txPerYear.toLocaleString()} tx / ano →{' '}
                <span style={{ color: '#FF8A5B', fontWeight: 500 }}>{fmtMoney(txAnnualFee)}</span>
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <div style={{
                fontSize: 12, color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase', letterSpacing: '0.14em',
                fontWeight: 600, marginBottom: 10,
              }}>plataforma SaaS · fixo</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 8 }}>
                <div style={{ fontSize: 36, color: '#fff', fontWeight: 300 }}>{fmtMoney(saasMonthly)}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>/ mês</div>
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
              }}>custo anual total</div>
              <div style={{
                fontSize: 48, color: '#FF8A5B',
                fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1,
              }}>
                {fmtMoney(yunoAnnualCost)}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>
                ≈ {fmtMoney(yunoAnnualCost / 12)} / mês all-in
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
              o que a yuno devolve
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 24 }}>
              valor bruto anual · três alavancas empilhadas
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 26 }}>
              {benefits.map((b, i) => {
                const pct = grossGain > 0 ? Math.max(0, Math.min(100, (b.value / grossGain) * 100)) : 0;
                const isNegative = b.value < 0;
                return (
                  <div key={i}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'baseline', marginBottom: 6,
                    }}>
                      <span style={{ fontSize: 14, color: '#fff', fontWeight: 500 }}>{b.label}</span>
                      <span style={{
                        fontSize: 18, color: isNegative ? '#FF8A5B' : '#E0ED80',
                        fontWeight: 400, letterSpacing: '-0.01em',
                      }}>{isNegative ? '−' : '+'}{fmtMoney(Math.abs(b.value))}</span>
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
                }}>ganho bruto anual</div>
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
                }}>líquido do fee yuno</div>
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
            Para cada <span style={{ color: '#FF8A5B', fontWeight: 600 }}>$1</span> pago à Yuno, você recupera{' '}
            <span style={{ color: '#E0ED80', fontWeight: 600 }}>${roi.toFixed(0)}</span>{' '}
            em aprovações, economia de MDR e operações — líquido do nosso fee.
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
              }}>líquido ano um</div>
              <div style={{ fontSize: 22, color: '#E0ED80', fontWeight: 300 }}>{fmtMoney(netGain)}</div>
            </div>
          </div>
        </div>

      </div>
      <SlideFooter section="04 / pricing" pageNum={17} total={18} logoColor="rgba(255,255,255,0.5)" />
    </div>
  );
}

Object.assign(window, { BCSlide13, BCSlide14, BCSlide14B, BCSlide15, BCSlide16, BCSlide17, BCSlide18, BCSlide19, BCSlide20, BCSlide20B, BCSlide20C, BCSlide21, BCSlide22, BCSlide23, BCSlide24 });
