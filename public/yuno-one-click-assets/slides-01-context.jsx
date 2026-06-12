/* ============================================================
   Yuno Dual-Product Deck — Slides 01-12
   Nova-light · español default · audiencia merchant prospect CXO

   01 Cover · 02 Agenda
   ── Bloque Yuno One-Click ──
   03 Section divider · 04 Friction tax · 05 What is + Shared-token network hero
   06 UX flow (first-time + returning) · 07 Under the hood · 08 Anchor merchants
   09 Network-effect math · 10 Cross-merchant scenarios
   11 4 razones · 12 Per-merchant TPV uplift

   (Slides 13-23 viven en slides-02-conciliacion.jsx — bloque Conciliación + CTA)

   Política: cero mención de competidores. Voz: tuteo neutro LATAM.
   ============================================================ */

const OC_FOOTER = 'YUNO · ONE-CLICK + CONCILIACIÓN';
const OC_TOTAL = 22;

// =============================================================================
// Slide 01 — Cover (dual product)
// =============================================================================
function Slide01Cover({ data }) {
  const clientName = data.clientName || '{{merchant}}';
  return (
    <div className="slide theme-dark" data-screen-label="01 Cover" style={{
      background: 'var(--bg-section)',
      color: 'var(--white)',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      <div style={{
        position: 'absolute', top: '-10%', right: '-15%', width: '70%', height: '120%',
        background: 'radial-gradient(circle at 50% 50%, rgba(62,79,224,0.28) 0%, rgba(62,79,224,0) 60%)',
        animation: 'orbDrift 20s ease-in-out infinite', pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 2 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lime)' }} />
          yuno · one-click + conciliación
        </span>
        <YunoLogo size="lg" color="var(--white)" />
      </div>

      <div className="stagger" style={{ position: 'relative', zIndex: 2, maxWidth: '78%' }}>
        <MonoKicker beam beamProps={{ width: '20%' }} style={{ color: 'rgba(255,255,255,0.65)' }}>
          dos productos · una propuesta
        </MonoKicker>
        <h1 style={{
          fontSize: 96, fontWeight: 300, lineHeight: 1, letterSpacing: '-0.04em',
          marginTop: 24, marginBottom: 28, color: 'var(--white)',
        }}>
          Convierte tu checkout en revenue,<br />
          <span style={{ color: 'var(--accent-soft)' }}>y tu back-office en certeza.</span>
        </h1>
        <p style={{
          fontSize: 22, lineHeight: 1.45, fontWeight: 300, color: 'rgba(255,255,255,0.78)',
          maxWidth: 880,
        }}>
          Una propuesta a medida para <strong style={{ color: 'var(--white)', fontWeight: 500 }}>{clientName}</strong>:
          Yuno One-Click (wallet shopper-centric construido sobre los principales merchants de LATAM) + Yuno Conciliación (transaccional, bancaria y standalone).
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', zIndex: 2 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          {data.date || new Date().getFullYear()} · preparado por {data.preparedBy || 'Yuno'}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          01 / {String(OC_TOTAL).padStart(2, '0')}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Slide 02 — Agenda (3 items, dual product)
// =============================================================================
function Slide02Agenda({ data }) {
  const items = [
    { n: '01', label: 'Yuno One-Click', sub: 'El wallet shopper-centric de la red Yuno · per-merchant TPV uplift' },
    { n: '02', label: 'Yuno Conciliación', sub: 'Transaccional · Bancaria · Standalone — un solo lugar de verdad' },
    { n: '03', label: 'Próximos pasos', sub: 'Workshop + activación' },
  ];
  return (
    <div className="slide theme-light" data-screen-label="02 Agenda">
      <SlideChrome section="agenda" pageNum={2} total={OC_TOTAL} footer={OC_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>agenda</MonoKicker>
        <h2 style={{ fontSize: 80, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 16, marginBottom: 64, color: 'var(--ink-strong)', lineHeight: 1.02 }}>
          Dos productos para destrabar<br />el revenue y la certeza de {data.clientName || 'tu operación'}.
        </h2>
        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1 }}>
          {items.map((it, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '100px 1fr auto', gap: 40, alignItems: 'center',
              padding: '28px 0', borderBottom: i < items.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--ink-muted)' }}>{it.n}</span>
              <div>
                <div style={{ fontSize: 34, fontWeight: 500, color: 'var(--ink-strong)' }}>{it.label}</div>
                <div style={{ fontSize: 16, color: 'var(--ink-secondary)', marginTop: 6 }}>{it.sub}</div>
              </div>
              <BeamRule duration={20} delay={i * 0.5} width="14%" style={{ width: 220, flex: 'none' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Slide 03 — Section divider: Producto 01 · Yuno One-Click
// =============================================================================
function Slide03OcSection({ data }) {
  return (
    <div className="slide theme-dark" data-screen-label="03 Section · One-Click" style={{
      background: 'var(--bg-section)', color: 'var(--white)',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <div style={{ position: 'absolute', top: 64, left: 96, right: 96, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.55)' }}>
          producto 01 · yuno one-click
        </span>
        <YunoLogo size="md" color="rgba(255,255,255,0.65)" />
      </div>
      <div className="stagger" style={{ maxWidth: '82%' }}>
        <MonoKicker beam style={{ color: 'rgba(255,255,255,0.65)' }}>{'> yuno one-click'}</MonoKicker>
        <h2 style={{ fontSize: 100, fontWeight: 300, lineHeight: 1, letterSpacing: '-0.04em', marginTop: 24, color: 'var(--white)' }}>
          Imagina que una tarjeta guardada en Rappi <span style={{ color: 'var(--accent-soft)' }}>también pague en McDonald's, Coppel y Avianca.</span>
        </h2>
      </div>
      <div style={{ position: 'absolute', bottom: 64, left: 96, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
        03 / {String(OC_TOTAL).padStart(2, '0')}
      </div>
    </div>
  );
}

// =============================================================================
// Slide 04 — Friction tax (per merchant industry)
// =============================================================================
function Slide04FrictionTax({ data }) {
  const abandonment = data.friction_abandonment_pct || 75;
  const formFields = data.friction_form_fields || 11;
  const mobileShare = data.friction_mobile_share_pct || 78;
  const industry = data.industry || 'Retail';

  return (
    <div className="slide theme-light" data-screen-label="04 Friction tax">
      <SlideChrome section="one-click · problema" pageNum={4} total={OC_TOTAL} footer={OC_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>{'> el costo de la fricción'}</MonoKicker>
        <h2 style={{ fontSize: 60, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 16, marginBottom: 12, color: 'var(--ink-strong)', maxWidth: '82%' }}>
          La industria <span style={{ color: 'var(--accent)' }}>{industry}</span> pierde la mayoría de sus checkouts antes del pago.
        </h2>
        <p style={{ fontSize: 18, color: 'var(--ink-secondary)', marginBottom: 40, maxWidth: 760 }}>
          Cada campo extra cuesta conversión. Cada vez que el cliente vuelve a ingresar su tarjeta, hay una nueva oportunidad de abandonar.
        </p>

        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28, marginTop: 'auto' }}>
          <div className="card-nova card-hero" style={{ padding: '40px 36px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)' }}>
              checkout abandonment
            </div>
            <div style={{ fontSize: 96, fontWeight: 300, color: 'var(--white)', letterSpacing: '-0.04em', lineHeight: 1, marginTop: 16 }}>
              {abandonment}<span style={{ fontSize: 56, marginLeft: 4 }}>%</span>
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', marginTop: 20 }}>
              promedio de carritos abandonados en {industry} a nivel global.
            </div>
          </div>
          <div className="card-nova" style={{ padding: '40px 36px' }}>
            <div className="mono-kicker">{'> campos en mobile checkout'}</div>
            <div style={{ fontSize: 96, fontWeight: 300, color: 'var(--accent)', letterSpacing: '-0.04em', lineHeight: 1, marginTop: 16 }}>
              {formFields}
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-secondary)', marginTop: 20 }}>
              campos promedio que el cliente debe llenar — cada uno baja la conversión.
            </div>
          </div>
          <div className="card-nova" style={{ padding: '40px 36px' }}>
            <div className="mono-kicker">{'> tráfico mobile'}</div>
            <div style={{ fontSize: 96, fontWeight: 300, color: 'var(--accent)', letterSpacing: '-0.04em', lineHeight: 1, marginTop: 16 }}>
              {mobileShare}<span style={{ fontSize: 56, marginLeft: 4 }}>%</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-secondary)', marginTop: 20 }}>
              del checkout sucede en mobile — donde el costo de la fricción se multiplica.
            </div>
          </div>
        </div>
        <div style={{ marginTop: 24, fontSize: 12, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>
          benchmarks orientativos · baymard institute, statista · LATAM mobile-first
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Slide 05 — What is + Shared-token network HERO (combinado)
// =============================================================================
function Slide05NetworkHero({ data }) {
  const clientName = data.clientName || 'tu merchant';
  const anchors = [
    { name: 'Rappi',        src: '/sdr-bc-assets/logos/rappi.svg',         angle: 0 },
    { name: "McDonald's",   src: '/ss-deck-assets/trusted/mcdonalds.png',  angle: 60 },
    { name: 'Uber',         src: '/ss-deck-assets/trusted/uber.png',       angle: 120 },
    { name: 'Open English', src: '/sdr-bc-assets/logos/open-english.png',  angle: 180 },
    { name: 'inDrive',      src: '/sdr-bc-assets/logos/indrive.svg',       angle: 240 },
    { name: 'Livelo',       src: '/sdr-bc-assets/logos/livelo.svg',        angle: 300 },
  ];
  const radius = 240;
  const stageW = radius * 2 + 280;
  const stageH = radius * 2 + 60;
  const cx = radius + 140;
  const cy = radius + 30;
  return (
    <div className="slide theme-light" data-screen-label="05 Network Hero">
      <SlideChrome section="one-click · producto" pageNum={5} total={OC_TOTAL} footer={OC_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>{'> qué es yuno one-click'}</MonoKicker>
        <h2 style={{ fontSize: 54, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 16, marginBottom: 12, color: 'var(--ink-strong)', maxWidth: 1200, lineHeight: 1.04 }}>
          El wallet <span style={{ color: 'var(--accent)' }}>shopper-centric</span> que construiremos con la red Yuno.
        </h2>
        <p style={{ fontSize: 18, color: 'var(--ink-secondary)', maxWidth: 880, marginBottom: 8 }}>
          Las tarjetas no viven en cada merchant — viven en la red. Una vez activado, el shopper enrola una vez en cualquier merchant Yuno y paga one-tap en cualquier otro, incluyendo {clientName}.
        </p>

        <div style={{ flex: 1, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: stageW, height: stageH }}>
            <svg
              width={stageW} height={stageH} viewBox={`0 0 ${stageW} ${stageH}`}
              style={{ position: 'absolute', inset: 0, display: 'block' }}
            >
              {anchors.map((a, i) => {
                const rad = (a.angle * Math.PI) / 180;
                const x = cx + Math.cos(rad) * radius;
                const y = cy + Math.sin(rad) * radius;
                return (
                  <line key={'l' + i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(62,79,224,0.35)" strokeWidth={1.2} strokeDasharray="4 6" />
                );
              })}
              <circle cx={cx} cy={cy} r={108} fill="var(--accent)" />
              <circle cx={cx} cy={cy} r={128} fill="none" stroke="rgba(62,79,224,0.25)" strokeWidth={1.5} />
              <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--white)" fontSize={22} fontWeight={500} fontFamily="var(--font)">
                Yuno Vault
              </text>
              <text x={cx} y={cy + 22} textAnchor="middle" fill="rgba(255,255,255,0.82)" fontSize={12} fontFamily="var(--font-mono)">
                PCI L1 · EMVCo
              </text>
            </svg>
            {anchors.map((a, i) => {
              const rad = (a.angle * Math.PI) / 180;
              const x = cx + Math.cos(rad) * radius - 60;
              const y = cy + Math.sin(rad) * radius - 30;
              return (
                <div key={'a' + i} style={{
                  position: 'absolute', left: x, top: y, width: 120, height: 60,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--white)', borderRadius: 14,
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--card-shadow)',
                  padding: 12,
                }}>
                  <img src={a.src} alt={a.name} style={{ maxWidth: '100%', maxHeight: 32, objectFit: 'contain' }} />
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-faint)' }}>
          6 candidatos destacados · 12 marcas tier-1 LATAM identificadas como posibles anchor merchants
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Slide 06 — UX flow (first-time + returning, 2 columnas)
// =============================================================================
function Slide06UxFlow({ data }) {
  const clientName = data.clientName || 'tu merchant';
  return (
    <div className="slide theme-light" data-screen-label="06 UX Flow">
      <SlideChrome section="one-click · UX" pageNum={6} total={OC_TOTAL} footer={OC_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>{'> el flow completo, dos momentos'}</MonoKicker>
        <h2 style={{ fontSize: 52, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 16, marginBottom: 8, color: 'var(--ink-strong)' }}>
          Un enrolamiento, infinitos checkouts. <span style={{ color: 'var(--accent)' }}>1.8s end-to-end.</span>
        </h2>
        <p style={{ fontSize: 16, color: 'var(--ink-secondary)', maxWidth: 880, marginBottom: 28 }}>
          Una vez que el shopper opta-in (1 minuto), queda reconocido en toda la red — incluyendo {clientName}.
        </p>

        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, flex: 1 }}>
          {/* First-time */}
          <div className="card-nova" style={{ padding: 28, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
              primera vez en la red
            </div>
            <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--ink-strong)', marginTop: 12, marginBottom: 18 }}>
              Enrolamiento (1 minuto)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
              {[
                { n: '1', t: 'Checkout normal', b: 'Cliente ingresa email + tarjeta + dirección.' },
                { n: '2', t: 'Opt-in modal', b: '"Pagá one-click en miles de tiendas Yuno la próxima vez."' },
                { n: '3', t: 'OTP confirm', b: 'Tarjeta se network-tokeniza y queda en el Yuno Vault.' },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px', background: 'var(--harmony-lilac)', borderRadius: 10 }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', color: 'var(--white)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flex: 'none' }}>
                    {s.n}
                  </span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink-strong)' }}>{s.t}</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-secondary)', marginTop: 2 }}>{s.b}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Returning */}
          <div className="card-nova card-hero" style={{ padding: 28, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)' }}>
              regresa a la red · el momento mágico
            </div>
            <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--white)', marginTop: 12, marginBottom: 18 }}>
              One tap (1.8s)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
              {[
                { n: '1', t: 'Email reconocido', b: `Yuno detecta que el shopper ya está en la red — incluyendo si nunca compró antes en ${clientName}.` },
                { n: '2', t: 'Confirma tarjeta', b: 'Modal: "Pagá con VISA •• 4242 de tu red Yuno". Un tap.' },
                { n: '3', t: 'Auth con TRID propio', b: `Cryptograma único generado, autorización con TRID de ${clientName} — soberanía total.` },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px', background: 'rgba(255,255,255,0.10)', borderRadius: 10 }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--lime)', color: 'var(--ink-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flex: 'none' }}>
                    {s.n}
                  </span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--white)' }}>{s.t}</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 2 }}>{s.b}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Slide 07 — Under the hood (arquitectura)
// =============================================================================
function Slide07UnderTheHood({ data }) {
  const steps = [
    { label: 'Identity', body: 'Email + OTP + passkey', sub: 'shopper-centric · revocable' },
    { label: 'Yuno Vault', body: 'PCI DSS Level 1', sub: 'PAR · consent record' },
    { label: 'Network Tokens', body: 'EMVCo Visa/MC/Amex', sub: 'auto-updater · lifecycle' },
    { label: 'TRID per-merchant', body: 'Cryptograma único', sub: 'per-tx · ligado al merchant' },
    { label: 'Auth uplift', body: '+2-5 pp', sub: 'Visa & MC documentado' },
  ];
  return (
    <div className="slide theme-light" data-screen-label="07 Under the hood">
      <SlideChrome section="one-click · arquitectura" pageNum={7} total={OC_TOTAL} footer={OC_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>{'> bajo el capó'}</MonoKicker>
        <h2 style={{ fontSize: 54, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 16, marginBottom: 12, color: 'var(--ink-strong)' }}>
          Vault shopper-centric, network tokens EMVCo, <span style={{ color: 'var(--accent)' }}>TRID por merchant.</span>
        </h2>
        <p style={{ fontSize: 16, color: 'var(--ink-secondary)', maxWidth: 880, marginBottom: 40 }}>
          PCI Level 1 ya operativo. El opt-in expreso del shopper habilita legalmente el vault compartido en LATAM. Cada autorización lleva el TRID del merchant que la origina — soberanía total sobre tus datos.
        </p>

        <div className="stagger" style={{ display: 'flex', gap: 16, alignItems: 'stretch', flex: 1 }}>
          {steps.map((s, i) => (
            <React.Fragment key={i}>
              <div className="card-nova" style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                  capa {String(i + 1).padStart(2, '0')}
                </div>
                <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--ink-strong)', marginTop: 14 }}>{s.label}</div>
                <div style={{ fontSize: 16, color: 'var(--ink)', marginTop: 14, fontWeight: 500 }}>{s.body}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 'auto', paddingTop: 16, fontFamily: 'var(--font-mono)' }}>{s.sub}</div>
              </div>
              {i < steps.length - 1 && (
                <div style={{ display: 'flex', alignItems: 'center', color: 'var(--accent)' }}>
                  <span style={{ fontSize: 32, fontWeight: 300 }}>→</span>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Slide 08 — Anchor merchants LogoWall (12 Yuno-verified)
// =============================================================================
function Slide08AnchorMerchants({ data }) {
  const merchants = [
    { name: 'Rappi',        type: 'logo', src: '/sdr-bc-assets/logos/rappi.svg' },
    { name: "McDonald's",   type: 'logo', src: '/ss-deck-assets/trusted/mcdonalds.png' },
    { name: 'Uber',         type: 'logo', src: '/ss-deck-assets/trusted/uber.png' },
    { name: 'inDrive',      type: 'logo', src: '/sdr-bc-assets/logos/indrive.svg' },
    { name: 'Open English', type: 'logo', src: '/sdr-bc-assets/logos/open-english.png' },
    { name: 'Livelo',       type: 'logo', src: '/sdr-bc-assets/logos/livelo.svg' },
    { name: 'Reserva',      type: 'logo', src: '/ss-deck-assets/trusted/reserva.png' },
    { name: 'SpaceX',       type: 'logo', src: '/sdr-bc-assets/logos/spacex.svg' },
    { name: 'Avianca',      type: 'wordmark',
      wordStyle: { fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em', color: '#D31920', fontFamily: 'var(--font)' } },
    { name: 'Viva Aerobus', type: 'wordmark',
      wordStyle: { fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', color: '#27A05A', fontFamily: 'var(--font)' } },
    { name: 'Xcaret',       type: 'wordmark',
      wordStyle: { fontSize: 26, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-strong)', fontFamily: 'var(--font)' } },
    { name: 'Smartfit',     type: 'wordmark',
      wordStyle: { fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink-strong)', fontFamily: 'var(--font)' } },
  ];
  return (
    <div className="slide theme-light" data-screen-label="08 Anchor merchants">
      <SlideChrome section="one-click · red" pageNum={8} total={OC_TOTAL} footer={OC_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>{'> candidatos para anchor merchants'}</MonoKicker>
        <h2 style={{ fontSize: 58, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 16, marginBottom: 12, color: 'var(--ink-strong)', maxWidth: 1240 }}>
          12 marcas tier-1 LATAM <span style={{ color: 'var(--accent)' }}>candidatas a anchor merchants</span> de la red.
        </h2>
        <p style={{ fontSize: 17, color: 'var(--ink-secondary)', maxWidth: 880, marginBottom: 32 }}>
          Marcas con tráfico masivo identificadas como posibles anchors. Activarlas es el primer paso para construir la red one-click y multiplicar el valor para {data.clientName || 'tu merchant'} desde el inicio.
        </p>

        <div className="stagger" style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, flex: 1, alignContent: 'center',
        }}>
          {merchants.map((m, i) => (
            <div key={i} className="card-nova" style={{
              padding: '28px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              minHeight: 96,
            }}>
              {m.type === 'logo'
                ? <img src={m.src} alt={m.name} style={{ maxWidth: '85%', maxHeight: 52, objectFit: 'contain' }} />
                : <span style={m.wordStyle}>{m.name}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Slide 09 — Cross-merchant scenarios (era slide 10)
// =============================================================================
function Slide10CrossMerchantScenarios({ data }) {
  const scenarios = Array.isArray(data.cross_merchant_scenarios) && data.cross_merchant_scenarios.length > 0
    ? data.cross_merchant_scenarios
    : [
        { shopper_persona: 'Returning shopper', origin_merchant: 'Merchant A', destination_merchant: 'Merchant B',
          vignette: 'Cliente compra en un merchant de la red. Días después entra a otro — su tarjeta ya está lista.' },
      ];
  return (
    <div className="slide theme-light" data-screen-label="10 Cross-merchant scenarios">
      <SlideChrome section="one-click · escenarios" pageNum={9} total={OC_TOTAL} footer={OC_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>{'> cross-merchant scenarios'}</MonoKicker>
        <h2 style={{ fontSize: 54, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 16, marginBottom: 12, color: 'var(--ink-strong)' }}>
          Esto es lo que vive un shopper de la red <span style={{ color: 'var(--accent)' }}>cada semana.</span>
        </h2>
        <p style={{ fontSize: 17, color: 'var(--ink-secondary)', maxWidth: 880, marginBottom: 36 }}>
          Tres escenarios reales en {data.country_iso || 'LATAM'} — el mismo shopper, distintos merchants, cero re-ingreso de tarjeta.
        </p>

        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28, flex: 1 }}>
          {scenarios.map((s, i) => (
            <div key={i} className="card-nova" style={{ padding: 32, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                escenario · {String(i + 1).padStart(2, '0')}
              </div>
              <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--ink-strong)', marginTop: 16 }}>
                {s.shopper_persona}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '12px 14px', background: 'var(--harmony-lilac)', borderRadius: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-strong)' }}>{s.origin_merchant}</span>
                <span style={{ fontSize: 18, color: 'var(--accent)' }}>→</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-strong)' }}>{s.destination_merchant}</span>
              </div>
              <div style={{ fontSize: 15, color: 'var(--ink-secondary)', marginTop: 18, lineHeight: 1.55, flex: 1 }}>
                {s.vignette}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-muted)', marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                one tap · sin re-ingreso
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Slide 10 — 4 razones diferenciales (era slide 11)
// =============================================================================
function Slide11FourReasons({ data }) {
  const reasons = [
    { n: '01', title: 'Red de merchants ancla en LATAM',
      body: 'Tier-1 ya en producción procesando tx hoy. Masa crítica desde día 1 — no años de venta B2B.' },
    { n: '02', title: 'Default-on, sin fee adicional al merchant',
      body: 'Incluido en tu contrato Yuno actual. Monetización vía smart routing, antifraude, FX, auth optimization.' },
    { n: '03', title: 'Network tokens EMVCo + APMs locales',
      body: 'Visa/MC/Amex network tokens nativos + PIX, PSE, CoDi, OXXO, Nequi, DaviPlata. Auth uplift +2-5pp documentado.' },
    { n: '04', title: 'Compliant en 5+ países LATAM',
      body: 'PCI L1 + opt-in expreso revocable del shopper. MX, BR, CO, CL, PE — convenios y arquitectura listos.' },
  ];
  return (
    <div className="slide theme-light" data-screen-label="11 4 razones">
      <SlideChrome section="one-click · por qué" pageNum={10} total={OC_TOTAL} footer={OC_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>{'> 4 razones para activarlo hoy'}</MonoKicker>
        <h2 style={{ fontSize: 56, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 16, marginBottom: 36, color: 'var(--ink-strong)' }}>
          Por qué Yuno One-Click es <span style={{ color: 'var(--accent)' }}>la decisión correcta</span> para {data.clientName || 'tu merchant'}.
        </h2>

        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, flex: 1 }}>
          {reasons.map((r, i) => (
            <div key={i} className="card-nova" style={{ padding: 32, display: 'flex', gap: 22, alignItems: 'flex-start' }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 300, color: 'var(--accent)',
                background: 'var(--harmony-lilac)', padding: '12px 16px', borderRadius: 12, lineHeight: 1,
                flex: 'none',
              }}>
                {r.n}
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--ink-strong)', lineHeight: 1.2 }}>{r.title}</div>
                <div style={{ fontSize: 15, color: 'var(--ink-secondary)', marginTop: 10, lineHeight: 1.6 }}>{r.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Slide 11 — Business case calculo aterrizado (era slide 12)
// =============================================================================
function Slide12PerMerchantTpv({ data }) {
  const clientName = data.clientName || 'tu merchant';
  const uplift = data.annual_uplift_usd_m_fmt || data.annual_uplift_usd_m || '—';
  const oneClickShare = data.one_click_share_pct || 10;
  const approvalUplift = data.approval_uplift_pct || 5;
  const monthlyVisits = data.monthly_visits_fmt || '—';
  const ticket = data.avg_ticket_usd || '—';
  const annualTx = data.annual_tx_fmt || '—';
  const oneClickTx = data.one_click_tx_fmt || '—';
  const additionalApprovedTx = data.additional_approved_tx_fmt || '—';
  const txSource = data.tx_source || 'similarweb_estimate';
  const workshopMonthlyTx = data.workshop_monthly_tx_fmt;
  const fromWorkshop = txSource === 'workshop' && workshopMonthlyTx;

  return (
    <div className="slide theme-light" data-screen-label="11 Business case aterrizado">
      <SlideChrome section="one-click · business case" pageNum={11} total={OC_TOTAL} footer={OC_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>{'> calculo aterrizado · paso a paso'}</MonoKicker>
        <h2 style={{ fontSize: 52, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 16, marginBottom: 12, color: 'var(--ink-strong)' }}>
          El revenue que <span style={{ color: 'var(--accent)' }}>{clientName}</span> deja de perder, paso por paso.
        </h2>
        <p style={{ fontSize: 16, color: 'var(--ink-secondary)', maxWidth: 920, marginBottom: 24 }}>
          Supuestos conservadores: <strong>10% del tráfico</strong> adopta One-Click el primer año · <strong>+5pp de approval rate</strong> sobre esas tx. Math defendible — un CFO la puede auditar línea por línea.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 32, flex: 1 }}>
          <div className="card-nova" style={{ padding: 32, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="mono-kicker">{'> el cálculo'}</div>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px',
                background: fromWorkshop ? 'rgba(22,163,74,0.10)' : 'rgba(234,88,12,0.10)',
                color: fromWorkshop ? '#16A34A' : '#EA580C',
                borderRadius: 100,
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                {fromWorkshop ? 'datos del workshop' : 'estimación (similarweb)'}
              </span>
            </div>
            <table style={{ width: '100%', marginTop: 18, borderCollapse: 'collapse' }}>
              <tbody style={{ fontSize: 15 }}>
                {fromWorkshop ? (
                  <>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '14px 0', color: 'var(--ink-secondary)' }}>Tx mensuales (workshop)</td>
                      <td style={{ padding: '14px 0', textAlign: 'right', fontWeight: 500, color: 'var(--ink-strong)' }}>{workshopMonthlyTx}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '14px 0', color: 'var(--ink-secondary)' }}>× 12 meses</td>
                      <td style={{ padding: '14px 0', textAlign: 'right', fontWeight: 500, color: 'var(--ink-strong)' }}>{annualTx} tx/año</td>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '14px 0', color: 'var(--ink-secondary)' }}>Visitas/mes (SimilarWeb)</td>
                      <td style={{ padding: '14px 0', textAlign: 'right', fontWeight: 500, color: 'var(--ink-strong)' }}>{monthlyVisits}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '14px 0', color: 'var(--ink-secondary)' }}>× 12 meses × 7% conversión</td>
                      <td style={{ padding: '14px 0', textAlign: 'right', fontWeight: 500, color: 'var(--ink-strong)' }}>{annualTx} tx/año</td>
                    </tr>
                  </>
                )}
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '14px 0', color: 'var(--ink-secondary)' }}>× {oneClickShare}% que adopta One-Click</td>
                  <td style={{ padding: '14px 0', textAlign: 'right', fontWeight: 500, color: 'var(--ink-strong)' }}>{oneClickTx} tx one-click</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '14px 0', color: 'var(--ink-secondary)' }}>× +{approvalUplift}pp approval uplift</td>
                  <td style={{ padding: '14px 0', textAlign: 'right', fontWeight: 500, color: 'var(--accent)' }}>{additionalApprovedTx} tx adicionales</td>
                </tr>
                <tr>
                  <td style={{ padding: '14px 0', color: 'var(--ink-secondary)' }}>× ${ticket} avg ticket{fromWorkshop ? ' (workshop)' : ''}</td>
                  <td style={{ padding: '14px 0', textAlign: 'right', fontWeight: 600, color: 'var(--accent)', fontSize: 17 }}>= ${uplift}M USD/año</td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: 'auto', paddingTop: 18, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-muted)' }}>
              fórmula: {fromWorkshop ? 'tx_mensuales × 12' : 'visitas × 12 × 7%'} × 10% × 5% × ticket
            </div>
          </div>

          <div className="card-nova card-hero" style={{ padding: 32, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.72)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              revenue recuperado anual
            </div>
            <div style={{ fontSize: 120, fontWeight: 300, color: 'var(--white)', letterSpacing: '-0.05em', lineHeight: 1, marginTop: 16, overflow: 'hidden' }}>
              ${uplift}<span style={{ fontSize: 52, marginLeft: 4 }}>M</span>
            </div>
            <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', marginTop: 20, lineHeight: 1.55 }}>
              USD anuales que {clientName} deja de perder por checkouts no aprobados.
            </div>
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.18)', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.6)' }}>
              + horas y $ recuperados con Conciliación (cuantificable en workshop)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Expose slides on window scope
window.Slide01Cover = Slide01Cover;
window.Slide02Agenda = Slide02Agenda;
window.Slide03OcSection = Slide03OcSection;
window.Slide04FrictionTax = Slide04FrictionTax;
window.Slide05NetworkHero = Slide05NetworkHero;
window.Slide06UxFlow = Slide06UxFlow;
window.Slide07UnderTheHood = Slide07UnderTheHood;
window.Slide08AnchorMerchants = Slide08AnchorMerchants;
window.Slide10CrossMerchantScenarios = Slide10CrossMerchantScenarios;
window.Slide11FourReasons = Slide11FourReasons;
window.Slide12PerMerchantTpv = Slide12PerMerchantTpv;
