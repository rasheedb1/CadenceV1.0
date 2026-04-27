/* Business Case Deck — Slides 01-12 (ES) */

function BCSlide01({ data }) {
  return (
    <div className="slide theme-ink-hero" data-screen-label="01 Hero">
      <div className="ink-grid" />
      <OrbHalftone size={1100} color="#6B7BFF" x="78%" y="42%" style={{ opacity: 0.55 }} />
      <div style={{ position: 'absolute', top: 64, left: 80, display: 'flex', alignItems: 'center', gap: 16 }}>
        <YunoLogo size="md" />
        <span style={{ opacity: 0.35 }}>{'·'}</span>
        <span className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.55)' }}>business case</span>
      </div>
      <div style={{ position: 'absolute', top: 64, right: 80 }}>
        <span className="glow-chip anim-in"><span className="dot" />confidencial {'·'} {data.clientName}</span>
      </div>
      <div style={{ position: 'absolute', left: 80, bottom: 220, maxWidth: 1400 }}>
        <div className="t-subtitle-alt anim-in anim-in-1" style={{ color: 'rgba(255,255,255,0.65)', marginBottom: 40 }}>
          preparado para {data.clientName} {'·'} {data.date}
        </div>
        <h1 className="t-title anim-in anim-in-2" style={{ fontSize: 180, fontWeight: 200, lineHeight: 0.9, letterSpacing: '-0.03em', marginBottom: 28 }}>
          Pagos como<br/>
          <span style={{ background: 'linear-gradient(120deg, #E0ED80 0%, #8C99FF 55%, #6B7BFF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ventaja competitiva.
          </span>
        </h1>
        <div className="t-body-l anim-in anim-in-4" style={{ maxWidth: 820, color: 'rgba(255,255,255,0.72)', fontSize: 26, textTransform: 'none' }}>
          Un caso cuantificado para orquestar el stack global de pagos de {data.clientName} con Yuno.
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 80, left: 80, right: 80, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', gap: 64 }}>
          <div>
            <div className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>uplift neto proyectado</div>
            <div style={{ fontSize: 36, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em' }}>
              <Counter value={data.netAnnualGain} delay={300} format={(v) => fmtMoney(v, { decimals: 1 })} />
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, marginLeft: 10 }}>/ año</span>
            </div>
          </div>
          <div>
            <div className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>time-to-value</div>
            <div style={{ fontSize: 36, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em' }}>90<span style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)' }}> días</span></div>
          </div>
        </div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>01 / 18</div>
      </div>
    </div>
  );
}

function BCSlide02({ data }) {
  const total = data.netAnnualGain;
  const fee = data.yunoAnnualFee;
  const cards = [
    { icon: '↑', label: 'tasa de aprobación', value: '+' + data.approvalLiftPp + 'pp', color: '#E0ED80' },
    { icon: '↓', label: 'ahorro de MDR', value: '−' + data.mdrReductionBps + ' bps', color: '#8C99FF' },
    { icon: '+', label: 'nuevos APMs', value: '+' + data.newAPMsAdded, color: '#E0ED80' },
    { icon: '×', label: 'esfuerzo de integración', value: '−' + data.integrationReductionPct + '%', color: '#FF6A6A' },
  ];
  return (
    <div className="slide theme-ink-2" data-screen-label="02 Resumen Ejecutivo">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">resumen ejecutivo</SectionLabel>
      <div style={{ position: 'absolute', top: 140, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>Resumen ejecutivo</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginBottom: 48 }}>
          {cards.map((c, i) => (
            <div key={i} className={'glass-card anim-in anim-in-' + (i + 1)} style={{ padding: 32, borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 28, marginBottom: 8, color: c.color }}>{c.icon}</div>
              <div className="t-label" style={{ color: 'rgba(255,255,255,0.55)', marginBottom: 8 }}>{c.label}</div>
              <div style={{ fontSize: 40, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em' }}>{c.value}</div>
            </div>
          ))}
        </div>
        <div className="roi-frame anim-in anim-in-5" style={{ padding: 40 }}>
          <div className="inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="t-subtitle-alt" style={{ color: 'rgba(224,237,128,0.9)', marginBottom: 8 }}>ganancia neta anual</div>
              <div style={{ fontSize: 64, fontWeight: 300, color: '#fff' }}>
                <Counter value={total} delay={400} format={(v) => fmtMoney(v, { decimals: 1 })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 56 }}>
              <div>
                <div className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>payback</div>
                <div style={{ fontSize: 32, fontWeight: 300, color: '#fff' }}>{'∼'}{Math.max(1, Math.ceil(data.paybackMonths))} {Math.max(1, Math.ceil(data.paybackMonths)) === 1 ? 'mes' : 'meses'}</div>
              </div>
              <div>
                <div className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>ROI año 1</div>
                <div style={{ fontSize: 32, fontWeight: 300, color: '#fff' }}>{(total / fee).toFixed(1)}x</div>
              </div>
              <div>
                <div className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>VPN 3 años</div>
                <div style={{ fontSize: 32, fontWeight: 300, color: '#fff' }}>{fmtMoney(data.npv3yr, { decimals: 1 })}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <SlideFooter section="resumen ejecutivo" pageNum={2} total={18} />
    </div>
  );
}

function BCSlide03({ data }) {
  const items = [
    { num: '01', title: 'el problema', sub: 'costos de fragmentación', time: '3 min' },
    { num: '02', title: 'la plataforma', sub: 'yuno en un vistazo', time: '6 min' },
    { num: '03', title: 'el business case', sub: 'cuatro palancas de valor', time: '12 min' },
    { num: '04', title: 'pricing', sub: 'tiers y estimación', time: '4 min' },
    { num: '05', title: 'el plan', sub: '90 días a producción', time: '5 min' },
  ];
  return (
    <div className="slide theme-ink" data-screen-label="03 Agenda">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">agenda</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>Agenda</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {items.map((item, i) => (
            <div key={i} className={'anim-in anim-in-' + (i + 1)} style={{ display: 'flex', alignItems: 'center', padding: '28px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ width: 80, fontSize: 14, fontWeight: 700, color: '#8C99FF', letterSpacing: '0.1em' }}>{item.num}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 28, fontWeight: 300, color: '#fff' }}>{item.title}</div>
                <div className="t-label" style={{ color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{item.sub}</div>
              </div>
              <div className="t-label" style={{ color: 'rgba(255,255,255,0.35)' }}>{item.time}</div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter section="agenda" pageNum={3} total={18} />
    </div>
  );
}

function BCSlide04() {
  return (
    <div className="slide theme-ink-hero" data-screen-label="04 Sección: El Problema">
      <div className="ink-grid" />
      <OrbHalftone size={900} color="#FF6A6A" x="75%" y="55%" style={{ opacity: 0.3 }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
        <div className="section-glyph anim-in">01</div>
        <h2 className="t-title anim-in anim-in-2" style={{ fontSize: 108, fontWeight: 300, color: '#fff' }}>El problema</h2>
      </div>
      <SlideFooter section="el problema" pageNum={4} total={18} />
    </div>
  );
}

function BCSlide05({ data }) {
  const onePointValue = data.valuePerPp;
  const cards = [
    { value: '−15%', label: 'fuga de ingresos', sub: 'por enrutamiento subóptimo y rechazos falsos en providers fragmentados', color: '#FF6A6A' },
    { value: '$443B', label: 'rechazos falsos globales', sub: 'los merchants pierden más por rechazos falsos que por fraude mismo', color: '#FF6A6A' },
    { value: '6–9 mo', label: 'por cada nuevo provider', sub: 'integración, certificación y go-live por cada PSP adicional', color: '#FF6A6A' },
  ];
  return (
    <div className="slide theme-ink-2" data-screen-label="05 Costo de la Fragmentación">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">01 / el problema</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>El costo de la fragmentación</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginBottom: 48 }}>
          {cards.map((c, i) => (
            <div key={i} className={'glass-card anim-in anim-in-' + (i + 1)} style={{ padding: 36, borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 48, fontWeight: 300, color: c.color, marginBottom: 12, letterSpacing: '-0.02em' }}>{c.value}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{c.label}</div>
              <div className="t-body-l" style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, textTransform: 'none' }}>{c.sub}</div>
            </div>
          ))}
        </div>
        <div className="anim-in anim-in-5" style={{ background: 'rgba(224,237,128,0.06)', border: '1px solid rgba(224,237,128,0.15)', borderRadius: 16, padding: '28px 36px', display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#E0ED80', letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>para {data.clientName}</div>
          <div style={{ width: 1, height: 32, background: 'rgba(224,237,128,0.2)' }} />
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16 }}>
            cada 1pp de aumento en aprobación = <span style={{ color: '#E0ED80', fontWeight: 600 }}>{fmtMoney(onePointValue)}</span> en margen incremental
          </div>
        </div>
      </div>
      <SlideFooter section="el problema" pageNum={5} total={18} />
    </div>
  );
}

function BCSlide06({ data }) {
  const todayProviders = (data.todayProviders && data.todayProviders.length) ? data.todayProviders : ['stripe', 'adyen', 'dlocal', 'checkout.com', 'worldpay', 'paypal', 'mercado pago', 'payu', 'rapyd', 'cybersource', 'braintree', 'fiserv'];
  const providerCount = todayProviders.length;
  return (
    <div className="slide theme-ink" data-screen-label="06 Tu Stack Hoy">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">01 / el problema</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>Tu stack hoy</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: 24, alignItems: 'start' }}>
          {/* Hoy */}
          <div className="anim-in anim-in-1" style={{ background: 'rgba(255,106,106,0.06)', border: '1px solid rgba(255,106,106,0.15)', borderRadius: 16, padding: 36 }}>
            <div className="t-label" style={{ color: '#FF6A6A', marginBottom: 20 }}>hoy {'·'} fragmentado</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
              {todayProviders.map((p, i) => <div key={i} className="prov-pill" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 14px', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{p}</div>)}
            </div>
            <div style={{ display: 'flex', gap: 32 }}>
              <div><div className="t-label" style={{ color: 'rgba(255,255,255,0.4)' }}>providers</div><div style={{ fontSize: 28, fontWeight: 300, color: '#fff' }}>{providerCount}</div></div>
              <div><div className="t-label" style={{ color: 'rgba(255,255,255,0.4)' }}>integraciones</div><div style={{ fontSize: 28, fontWeight: 300, color: '#fff' }}>{providerCount}</div></div>
              <div><div className="t-label" style={{ color: 'rgba(255,255,255,0.4)' }}>dashboards</div><div style={{ fontSize: 28, fontWeight: 300, color: '#fff' }}>{providerCount}</div></div>
            </div>
          </div>
          {/* Flecha */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 120 }}>
            <div className="anim-in anim-in-3" style={{ fontSize: 32, color: 'rgba(255,255,255,0.3)' }}>{'→'}</div>
          </div>
          {/* Mañana */}
          <div className="anim-in anim-in-4" style={{ background: 'rgba(224,237,128,0.06)', border: '1px solid rgba(224,237,128,0.15)', borderRadius: 16, padding: 36 }}>
            <div className="t-label" style={{ color: '#E0ED80', marginBottom: 20 }}>mañana {'·'} yuno</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <YunoLogo size="lg" color="#E0ED80" />
              <span className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.5)' }}>1 API {'·'} 1 dashboard {'·'} todos los providers</span>
            </div>
            <div style={{ display: 'flex', gap: 32 }}>
              <div><div className="t-label" style={{ color: 'rgba(255,255,255,0.4)' }}>integración</div><div style={{ fontSize: 28, fontWeight: 300, color: '#E0ED80' }}>1</div></div>
              <div><div className="t-label" style={{ color: 'rgba(255,255,255,0.4)' }}>dashboard</div><div style={{ fontSize: 28, fontWeight: 300, color: '#E0ED80' }}>1</div></div>
              <div><div className="t-label" style={{ color: 'rgba(255,255,255,0.4)' }}>providers</div><div style={{ fontSize: 28, fontWeight: 300, color: '#E0ED80' }}>300+</div></div>
            </div>
          </div>
        </div>
      </div>
      <SlideFooter section="el problema" pageNum={6} total={18} />
    </div>
  );
}

function BCSlide07() {
  return (
    <div className="slide theme-ink-hero" data-screen-label="07 Sección: La Plataforma">
      <div className="ink-grid" />
      <OrbHalftone size={900} color="#6B7BFF" x="80%" y="60%" style={{ opacity: 0.45 }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
        <div className="section-glyph anim-in">02</div>
        <h2 className="t-title anim-in anim-in-2" style={{ fontSize: 108, fontWeight: 300, color: '#fff' }}>La plataforma</h2>
      </div>
      <SlideFooter section="la plataforma" pageNum={7} total={18} />
    </div>
  );
}

function BCSlide08() {
  const stats = [
    { value: '1.000+', label: 'métodos de pago', color: '#E0ED80' },
    { value: '200+', label: 'países y territorios', color: '#8C99FF' },
    { value: '90%', label: 'tasa de aprobación promedio', color: '#E0ED80' },
    { value: '+7–10%', label: 'lift de aprobación vs. PSP único', color: '#8C99FF' },
  ];
  const logos = ["mcdonald's", 'uber', 'rappi', 'inDrive', 'cabify', 'betterfly', 'nuvei', 'kushki', 'yape', 'bold'];
  return (
    <div className="slide theme-ink" data-screen-label="08 Yuno en un Vistazo">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">02 / la plataforma</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>Yuno en un vistazo</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginBottom: 56 }}>
          {stats.map((s, i) => (
            <div key={i} className={'anim-in anim-in-' + (i + 1)} style={{ textAlign: 'center' }}>
              <div className="num-hero-sm shimmer" style={{ color: s.color, fontSize: 52, fontWeight: 300, letterSpacing: '-0.02em' }}>{s.value}</div>
              <div className="t-label" style={{ color: 'rgba(255,255,255,0.55)', marginTop: 8 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div className="anim-in anim-in-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 36 }}>
          <div className="t-label" style={{ color: 'rgba(255,255,255,0.35)', marginBottom: 20, textAlign: 'center' }}>confían en nosotros</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
            {logos.map((l, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 22px', fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: '-0.01em' }}>{l}</div>
            ))}
          </div>
        </div>
      </div>
      <SlideFooter section="la plataforma" pageNum={8} total={18} />
    </div>
  );
}

function BCSlide09() {
  const pins = [
    { lat: 40.7, lng: -74, size: 'lg' }, { lat: 19.4, lng: -99.1, size: 'lg' }, { lat: -23.5, lng: -46.6, size: 'lg' },
    { lat: -34.6, lng: -58.4 }, { lat: 4.7, lng: -74.1 }, { lat: -12, lng: -77 }, { lat: 10.5, lng: -66.9 },
    { lat: 51.5, lng: -0.1, size: 'lg' }, { lat: 48.9, lng: 2.35 }, { lat: 52.5, lng: 13.4 }, { lat: 40.4, lng: -3.7 },
    { lat: 55.8, lng: 37.6 }, { lat: 25.2, lng: 55.3 }, { lat: 24.5, lng: 54.7 },
    { lat: 19, lng: 73, size: 'lg' }, { lat: 1.35, lng: 103.8 }, { lat: 35.7, lng: 139.7 },
    { lat: -33.9, lng: 151.2 }, { lat: 37.6, lng: 127 }, { lat: 13.8, lng: 100.5 },
  ];
  const regions = [
    { name: 'LATAM', apms: 'PIX, OXXO, PSE, Nequi, Mercado Pago' },
    { name: 'EMEA', apms: 'iDEAL, Bancontact, MB WAY, Klarna, SEPA' },
    { name: 'APAC', apms: 'UPI, GCash, GrabPay, LINE Pay, Alipay+' },
  ];
  return (
    <div className="slide theme-ink" data-screen-label="09 Presencia Global">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">02 / la plataforma</SectionLabel>
      <div style={{ position: 'absolute', top: 140, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 56, fontWeight: 300, color: '#fff', marginBottom: 24 }}>Una plataforma. cada mercado.</h2>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <WorldMap pins={pins} style={{ transform: 'scale(0.82)', transformOrigin: 'top center' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 16 }}>
          {regions.map((r, i) => (
            <div key={i} className={'anim-in anim-in-' + (i + 5)} style={{ textAlign: 'center' }}>
              <div className="t-label" style={{ color: '#8C99FF', marginBottom: 6 }}>{r.name}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{r.apms}</div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter section="la plataforma" pageNum={9} total={18} />
    </div>
  );
}

function BCSlide10() {
  const products = [
    { name: 'smart routing', desc: 'selección de provider impulsada por IA por transacción', icon: '⚔' },
    { name: 'dynamic routing', desc: 'failover y reintentos en tiempo real entre acquirers', icon: '⇄' },
    { name: 'checkout', desc: 'UI drop-in con 1.000+ métodos de pago', icon: '☐' },
    { name: 'vault', desc: 'tokenización y almacenamiento de tarjetas PCI compliant', icon: '⚿' },
    { name: 'monitores', desc: 'alertas en tiempo real de aprobación, latencia, errores', icon: '⌖' },
    { name: 'suscripciones', desc: 'facturación recurrente, dunning, gestión de planes', icon: '↻' },
    { name: 'payouts', desc: 'desembolsos masivos a 40+ países', icon: '⇨' },
    { name: 'conciliación', desc: 'matching automatizado entre todos los providers', icon: '≡' },
  ];
  return (
    <div className="slide theme-ink-2" data-screen-label="10 Suite de Producto">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">02 / la plataforma</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>La suite</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
          {products.map((p, i) => (
            <div key={i} className={'glass-card anim-in anim-in-' + (i + 1)} style={{ padding: 28, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.5 }}>{p.icon}</div>
              <div style={{ fontSize: 17, fontWeight: 600, color: '#fff', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{p.name}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{p.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter section="la plataforma" pageNum={9} total={18} />
    </div>
  );
}

function BCSlide11({ data }) {
  const steps = [
    { num: '01', name: 'checkout', desc: 'el cliente inicia el pago' },
    { num: '02', name: 'risk engine', desc: 'scoring de fraude y decisión de 3DS' },
    { num: '03', name: 'smart routing', desc: 'IA selecciona el acquirer óptimo' },
    { num: '04', name: 'reintentos', desc: 'failover automático en soft declines' },
    { num: '05', name: 'vault', desc: 'tokeniza y guarda credenciales' },
    { num: '06', name: 'conciliación', desc: 'match settlements con órdenes' },
  ];
  const stats = [
    { value: '<120ms', label: 'latencia mediana' },
    { value: '99,99%', label: 'uptime SLA' },
    { value: data.fteToday + ' FTE → ' + data.fteTarget, label: 'equipo de payments ops' },
  ];
  return (
    <div className="slide theme-ink" data-screen-label="11 Arquitectura">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">02 / la plataforma</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>Cómo fluye una transacción</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 48 }}>
          {steps.map((s, i) => (
            <React.Fragment key={i}>
              <div className={'anim-in anim-in-' + (i + 1)} style={{ flex: 1, textAlign: 'center', padding: '24px 8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8C99FF', letterSpacing: '0.1em', marginBottom: 8 }}>{s.num}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{s.desc}</div>
              </div>
              {i < steps.length - 1 && <div style={{ width: 32, textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 18 }}>{'→'}</div>}
            </React.Fragment>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {stats.map((s, i) => (
            <div key={i} className={'anim-in anim-in-' + (i + 7)} style={{ textAlign: 'center', padding: 24, background: 'rgba(224,237,128,0.04)', border: '1px solid rgba(224,237,128,0.1)', borderRadius: 12 }}>
              <div style={{ fontSize: 36, fontWeight: 300, color: '#E0ED80', letterSpacing: '-0.02em' }}>{s.value}</div>
              <div className="t-label" style={{ color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter section="la plataforma" pageNum={11} total={18} />
    </div>
  );
}

function BCSlide12() {
  const certs = [
    { name: 'PCI DSS 4.0', desc: 'Service Provider Nivel 1' },
    { name: 'ISO 27001', desc: 'Gestión de Seguridad de la Información' },
    { name: 'SOC 2 Type II', desc: 'Seguridad y Disponibilidad' },
    { name: 'GDPR', desc: 'Protección de Datos UE' },
  ];
  const fraud = [
    { name: 'network tokens', desc: 'tokenización card-on-file con schemes para mayor aprobación y menor fraude' },
    { name: '3DS adaptativo', desc: 'motor de exenciones inteligente: SCA solo cuando se necesita, sin fricción cuando es seguro' },
    { name: 'orquestación anti-fraude', desc: 'integra Kount, Signifyd, Riskified, o el scoring nativo de Yuno' },
    { name: 'reglas de riesgo', desc: 'reglas personalizadas por mercado, BIN, monto, velocidad — sin código' },
  ];
  return (
    <div className="slide theme-ink-2" data-screen-label="12 Seguridad">
      <div className="ink-grid" />
      <SectionLabel color="rgba(255,255,255,0.6)">02 / la plataforma</SectionLabel>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 64, fontWeight: 300, color: '#fff', marginBottom: 48 }}>Seguridad enterprise</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>
          {/* Certificaciones */}
          <div className="anim-in anim-in-1">
            <div className="t-label" style={{ color: '#8C99FF', marginBottom: 20 }}>certificaciones</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {certs.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#8C99FF' }} />
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{c.name}</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{c.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Toolkit anti-fraude */}
          <div className="anim-in anim-in-3">
            <div className="t-label" style={{ color: '#E0ED80', marginBottom: 20 }}>toolkit de prevención de fraude</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {fraud.map((f, i) => (
                <div key={i} style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{f.name}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <SlideFooter section="la plataforma" pageNum={12} total={18} />
    </div>
  );
}

Object.assign(window, { BCSlide01, BCSlide02, BCSlide03, BCSlide04, BCSlide05, BCSlide06, BCSlide07, BCSlide08, BCSlide09, BCSlide10, BCSlide11, BCSlide12 });
