/* Business Case Deck — Slides 01-12 (ES) */

function BCSlide01({ data }) {
  setBCCurrency(data.currency);
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
  setBCCurrency(data.currency);
  const total = data.netAnnualGain;
  const fee = data.yunoAnnualFee;
  const cards = [
    { icon: '↑', label: 'tasa de aprobación', value: '+' + data.approvalLiftPp + 'pp', color: '#E0ED80' },
    { icon: '↓', label: 'MDR · tasa de descuento', value: '−' + data.mdrReductionBps + ' bps', color: '#8C99FF' },
    { icon: '+', label: 'cobertura APMs', value: '+' + data.newAPMsAdded + ' países', color: '#E0ED80' },
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
  setBCCurrency(data.currency);
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
  setBCCurrency(data.currency);
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
  setBCCurrency(data.currency);
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
    { value: '460+', label: 'integraciones' },
    { value: '190+', label: 'países' },
    { value: '1.000+', label: 'métodos' },
    { value: '180+', label: 'monedas' },
  ];
  const pillars = [
    { num: '01', name: 'orquestación', tag: 'enrutar y recuperar', items: [
      { name: 'motor de orquestación', sub: 'cada proveedor, un solo plano de control.' },
      { name: 'enrutamiento inteligente', sub: 'decisión por transacción.' },
      { name: 'monitores y respaldo automático', sub: 'el checkout siempre en vivo.' },
    ]},
    { num: '02', name: 'checkout & sdks', tag: 'convierte donde sea', items: [
      { name: 'checkout personalizable', sub: 'métodos locales con experiencia nativa.' },
      { name: 'gestión de suscripciones', sub: 'recurrencia con menos ingeniería.' },
      { name: 'sdks móvil', sub: 'una interfaz, iOS + Android.' },
    ]},
    { num: '03', name: 'seguridad y riesgo', tag: 'protege cada tarjeta', items: [
      { name: 'tokenización PCI', sub: 'tokens válidos en todas las redes.' },
      { name: 'autenticación 3DS', sub: 'menos fraude, más aprobación.' },
      { name: 'actualizador de cuentas', sub: 'credenciales siempre frescas.' },
    ]},
    { num: '04', name: 'ia e inteligencia', tag: 'el cerebro', items: [
      { name: 'analítica', sub: 'comisiones, FX, aprobaciones. listo para decidir.' },
      { name: 'conciliación', sub: 'un registro sobre cada PSP.' },
    ]},
  ];
  return (
    <div className="slide theme-ink-2" data-screen-label="08 La Plataforma">
      <div className="ink-grid" />
      <div style={{ position: 'absolute', top: 56, left: 80 }}>
        <span className="glow-chip"><span className="dot" />sobre yuno {'·'} plataforma</span>
      </div>
      <div style={{ position: 'absolute', top: 60, right: 80, maxWidth: 360, textAlign: 'right', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.55 }}>
        Diseñado para crecer con tu volumen, con IA que entrega decisiones — no solo paneles.
      </div>
      <div style={{ position: 'absolute', top: 130, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 56, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em', marginBottom: 28, lineHeight: 1.05 }}>
          Una solución completa {'·'} cuatro pilares {'·'}{' '}
          <span style={{ background: 'linear-gradient(120deg, #E0ED80 0%, #8C99FF 60%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>un cerebro.</span>
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
          {stats.map((s, i) => (
            <div key={i} className={'anim-in anim-in-' + (i + 1)} style={{ padding: '20px 24px', borderRadius: 14, background: 'rgba(140,153,255,0.05)', border: '1px solid rgba(140,153,255,0.15)' }}>
              <div style={{ fontSize: 56, fontWeight: 200, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1 }}>{s.value}</div>
              <div className="t-label" style={{ color: 'rgba(255,255,255,0.55)', marginTop: 10 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div className="anim-in anim-in-3" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: 'rgba(140,153,255,0.85)', fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace", letterSpacing: '0.04em' }}>{'>'} ciclo_de_pago</span>
          <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(140,153,255,0.25), rgba(255,255,255,0.04))' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
          {pillars.map((p, i) => (
            <div key={i} className={'anim-in anim-in-' + (i + 4)}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#8C99FF', letterSpacing: '0.1em' }}>{p.num}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{p.name}</span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>{p.tag}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {p.items.map((it, j) => (
                  <div key={j} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(140,153,255,0.12)', border: '1px solid rgba(140,153,255,0.2)', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 2 }}>{it.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{it.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="anim-in anim-in-8" style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 28, padding: 24, borderRadius: 14, border: '1px solid rgba(224,237,128,0.2)', background: 'linear-gradient(180deg, rgba(224,237,128,0.05), rgba(224,237,128,0.01))' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#E0ED80', boxShadow: '0 0 12px #E0ED80', animation: 'pulseDot 2.2s ease-in-out infinite' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#E0ED80', letterSpacing: '0.18em' }}>IA {'·'} EN VIVO</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 400, color: '#fff', marginBottom: 8, letterSpacing: '-0.01em' }}>Concierge de Pagos</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55, maxWidth: 320 }}>
              Copiloto en lenguaje natural para operaciones de pagos. Pregunta cualquier cosa y recibe decisiones — no solo paneles.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'flex-end', minHeight: 130, paddingLeft: 16, borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#FF8A5B' }} />
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#E0ED80' }} />
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#8C99FF' }} />
              <span style={{ marginLeft: 6, letterSpacing: '0.04em' }}>{'✨'} Concierge de Pagos</span>
            </div>
            <div className="chat-msg-user" style={{ alignSelf: 'flex-end', maxWidth: '78%', padding: '10px 14px', borderRadius: '14px 14px 4px 14px', background: 'rgba(140,153,255,0.18)', border: '1px solid rgba(140,153,255,0.32)', fontSize: 13, color: '#fff', lineHeight: 1.45 }}>
              ¿Por qué bajó la tasa de aprobación en EU ayer?
            </div>
            <div className="chat-typing" style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="chat-dot" /><span className="chat-dot" /><span className="chat-dot" />
            </div>
            <div className="chat-msg-agent" style={{ alignSelf: 'flex-start', maxWidth: '88%', padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
              El emisor ABC declinó 12% más entre 14:00–18:00 en DE/FR. Reruteo al emisor XYZ por 24h — proyección: +2.8pp en aprobación.
            </div>
          </div>
        </div>
      </div>
      <SlideFooter section="la plataforma" pageNum={8} total={18} />
    </div>
  );
}

function BCSlide09() {
  const customers = [
    [
      { name: 'TESLA', logo: '/bc-assets/logos/tesla.svg', logoH: 70 },
      { name: "McDonald’s", logo: '/bc-assets/logos/mcdonalds.svg', logoH: 80 },
      { name: 'Uber', logo: '/bc-assets/logos/uber.svg', logoH: 60 },
      { name: 'SpaceX', logo: '/bc-assets/logos/spacex.svg', logoH: 56 },
      { name: 'SAMSUNG', logo: '/bc-assets/logos/samsung.svg', logoH: 60 },
    ],
    [
      { name: 'Qatar Airways', logo: '/bc-assets/logos/qatarairways.svg', logoH: 80 },
      { name: 'betterfly', style: { fontFamily: "'Titillium Web', sans-serif", fontWeight: 500, fontSize: 32, letterSpacing: '-0.01em', fontStyle: 'italic' } },
      { name: 'Rappi', logo: '/bc-assets/logos/rappi.svg', logoH: 64 },
      { name: 'gofundme', logo: '/bc-assets/logos/gofundme.svg', logoH: 64 },
      { name: 'NetEase Games', style: { fontFamily: "'Titillium Web', sans-serif", fontWeight: 700, fontSize: 24, letterSpacing: '0.02em' } },
    ],
  ];
  const investors = [
    { name: 'KASZEK', size: 22 },
    { name: 'DST Global', logo: '/bc-assets/logos/dst-global.svg', logoH: 44 },
    { name: 'TIGER GLOBAL', size: 22 },
    { name: 'a16z', logo: '/bc-assets/logos/a16z.svg', logoH: 36 },
    { name: 'monashees', size: 22 },
    { name: 'globalpay tech', size: 18 },
  ];
  return (
    <div className="slide theme-ink" data-screen-label="09 Clientes e Inversionistas">
      <div className="ink-grid" />
      <div style={{ position: 'absolute', top: 56, left: 80 }}>
        <span className="glow-chip"><span className="dot" />sobre yuno</span>
      </div>
      <div style={{ position: 'absolute', top: 60, right: 80, maxWidth: 360, textAlign: 'right', fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55 }}>
        Desde merchants globales hasta las firmas de venture más respetadas, <span style={{ color: '#fff', fontWeight: 600 }}>Yuno es la plataforma que los builders eligen.</span>
      </div>
      <div style={{ position: 'absolute', top: 130, left: 80, right: 80 }}>
        <h2 className="t-title anim-in" style={{ fontSize: 52, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em', marginBottom: 32, lineHeight: 1.05, maxWidth: 1300 }}>
          Líderes globales nos eligen,{' '}
          <span style={{ background: 'linear-gradient(120deg, #8C99FF 0%, #6B7BFF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>respaldados por inversionistas</span> world-class
        </h2>
        <div className="anim-in anim-in-1" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: 'rgba(140,153,255,0.85)', letterSpacing: '0.16em', fontWeight: 700 }}>{'·'} NUESTROS CLIENTES</span>
          <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(140,153,255,0.25), rgba(255,255,255,0.04))' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 36 }}>
          {customers.map((row, ri) => (
            <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
              {row.map((c, ci) => (
                <div key={ci} className={'anim-in anim-in-' + Math.min(8, ri * 5 + ci + 1)} style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  {c.logo ? (
                    <img src={c.logo} alt={c.name} style={{ height: c.logoH || 60, maxWidth: '88%', filter: 'brightness(0) invert(1)', opacity: 0.92, objectFit: 'contain' }} />
                  ) : (
                    <span style={{ color: 'rgba(255,255,255,0.95)', ...c.style }}>{c.name}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="anim-in anim-in-7" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: 'rgba(140,153,255,0.85)', letterSpacing: '0.16em', fontWeight: 700 }}>{'·'} RESPALDADOS POR INVERSIONISTAS WORLD-CLASS</span>
          <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(140,153,255,0.25), rgba(255,255,255,0.04))' }} />
        </div>
        <div className="anim-in anim-in-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14, padding: '24px 32px', borderRadius: 14, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {investors.map((inv, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {inv.logo ? (
                <img src={inv.logo} alt={inv.name} style={{ height: inv.logoH || 36, maxWidth: '90%', filter: 'brightness(0) invert(1)', opacity: 0.88, objectFit: 'contain' }} />
              ) : (
                <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: inv.size, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{inv.name}</span>
              )}
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
  setBCCurrency(data.currency);
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
