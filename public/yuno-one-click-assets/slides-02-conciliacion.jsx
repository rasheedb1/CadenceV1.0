/* ============================================================
   Yuno Dual-Product Deck — Slides 13-23 (Conciliación + CTA)
   Nova-light · español default · audiencia merchant prospect CXO

   13 Section divider · 14 The reconciliation pain
   15 3 productos en uno (Transaccional · Bancaria · Standalone overview)
   16 Conciliación Transaccional · 17 Conciliación Bancaria
   18 Conciliación Standalone · 19 Métricas deep-dive
   20 Dashboard unificado · 21 Insights accionables
   22 Impacto per-merchant
   23 CTA (cierre dual-product)

   (Slides 01-12 viven en slides-01-context.jsx)

   Política: cero mención de competidores. Voz: tuteo neutro LATAM.
   ============================================================ */

const CON_FOOTER = 'YUNO · ONE-CLICK + CONCILIACIÓN';
const CON_TOTAL = 22;

// =============================================================================
// ProductLabel — eyebrow visible arriba del H2 en cada slide de Conciliación.
// "Yuno Conciliación" (parent product) en accent + subsection MUCHO más grande
// y prominente (ink-strong, 30px) para que el usuario sepa inmediatamente
// qué variante del producto está viendo.
//   dark=true → slides theme-dark (section divider)
// =============================================================================
function ProductLabel({ subsection, dark = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 14, marginBottom: 8, flexWrap: 'wrap' }}>
      <span style={{
        fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em',
        color: dark ? 'var(--lime)' : 'var(--accent)',
        fontFamily: 'var(--font)',
      }}>
        Yuno Conciliación
      </span>
      {subsection && (
        <>
          <span style={{
            fontSize: 26, lineHeight: 1, color: dark ? 'rgba(255,255,255,0.40)' : 'var(--ink-faint)',
            fontWeight: 300,
          }}>
            ·
          </span>
          <span style={{
            fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em',
            color: dark ? 'var(--white)' : 'var(--ink-strong)',
            fontFamily: 'var(--font)',
            lineHeight: 1.05,
          }}>
            {subsection}
          </span>
        </>
      )}
    </div>
  );
}

// =============================================================================
// Slide 13 — Section divider: Producto 02 · Yuno Conciliación
// =============================================================================
function Slide13ConSection({ data }) {
  return (
    <div className="slide theme-dark" data-screen-label="13 Section · Conciliación" style={{
      background: 'var(--bg-section)', color: 'var(--white)',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <div style={{ position: 'absolute', top: 64, left: 96, right: 96, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.55)' }}>
          producto 02 · yuno conciliación
        </span>
        <YunoLogo size="md" color="rgba(255,255,255,0.65)" />
      </div>
      <div className="stagger" style={{ maxWidth: '85%' }}>
        <MonoKicker beam style={{ color: 'rgba(255,255,255,0.65)' }}>{'> producto 02'}</MonoKicker>
        <div style={{ fontSize: 56, fontWeight: 600, color: 'var(--lime)', marginTop: 22, marginBottom: 4, fontFamily: 'var(--font)', letterSpacing: '-0.02em', lineHeight: 1 }}>
          Yuno Conciliación
        </div>
        <h2 style={{ fontSize: 76, fontWeight: 300, lineHeight: 1.05, letterSpacing: '-0.04em', marginTop: 18, color: 'var(--white)' }}>
          Una sola verdad para tus liquidaciones, <span style={{ color: 'var(--accent-soft)' }}>tu banco y todo lo que pasa fuera de Yuno.</span>
        </h2>
      </div>
      <div style={{ position: 'absolute', bottom: 64, left: 96, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
        12 / {String(CON_TOTAL).padStart(2, '0')}
      </div>
    </div>
  );
}

// =============================================================================
// Slide 14 — The reconciliation pain
// =============================================================================
function Slide14ConPain({ data }) {
  return (
    <div className="slide theme-light" data-screen-label="14 Reconciliation pain">
      <SlideChrome section="conciliación · problema" pageNum={13} total={CON_TOTAL} footer={CON_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>{'> el dolor de conciliar'}</MonoKicker>
        <ProductLabel subsection="El problema" />
        <h2 style={{ fontSize: 54, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 4, marginBottom: 12, color: 'var(--ink-strong)', maxWidth: '85%' }}>
          Cada adquirente envía su archivo a su manera. <span style={{ color: 'var(--accent)' }}>Tu finance team lo paga en horas.</span>
        </h2>
        <p style={{ fontSize: 17, color: 'var(--ink-secondary)', maxWidth: 880, marginBottom: 40 }}>
          Conciliación manual = formatos distintos, comisiones opacas, cruces a mano contra el banco, y discrepancias que se descubren demasiado tarde.
        </p>

        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28, marginTop: 'auto' }}>
          <div className="card-nova card-hero" style={{ padding: '40px 36px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)' }}>
              formatos distintos
            </div>
            <div style={{ fontSize: 96, fontWeight: 300, color: 'var(--white)', letterSpacing: '-0.04em', lineHeight: 1, marginTop: 16 }}>
              10<span style={{ fontSize: 56, marginLeft: 4 }}>+</span>
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', marginTop: 20 }}>
              formatos diferentes de archivos de liquidación entre adquirentes y APMs.
            </div>
          </div>
          <div className="card-nova" style={{ padding: '40px 36px' }}>
            <div className="mono-kicker">{'> horas/mes finance team'}</div>
            <div style={{ fontSize: 96, fontWeight: 300, color: 'var(--accent)', letterSpacing: '-0.04em', lineHeight: 1, marginTop: 16 }}>
              80<span style={{ fontSize: 56, marginLeft: 4 }}>+</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-secondary)', marginTop: 20 }}>
              en conciliación manual de archivos vs transacciones vs banco (mid-size merchant LATAM).
            </div>
          </div>
          <div className="card-nova" style={{ padding: '40px 36px' }}>
            <div className="mono-kicker">{'> tx con discrepancias'}</div>
            <div style={{ fontSize: 96, fontWeight: 300, color: 'var(--accent)', letterSpacing: '-0.04em', lineHeight: 1, marginTop: 16 }}>
              5–15<span style={{ fontSize: 56, marginLeft: 4 }}>%</span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-secondary)', marginTop: 20 }}>
              no detectadas a tiempo — comisiones cobradas de más, liquidaciones que nunca llegaron.
            </div>
          </div>
        </div>
        <div style={{ marginTop: 24, fontSize: 12, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>
          benchmarks orientativos · industry · LATAM mid-market e-commerce
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Slide 15 — 3 productos en uno (overview)
// =============================================================================
function Slide15ConThree({ data }) {
  const products = [
    {
      n: '01', tag: 'transaccional',
      title: 'Conciliación Transaccional',
      body: 'Todos los archivos de liquidación de tus adquirentes — leídos, normalizados y cruzados contra las tx que pasaron por Yuno. Un archivo único, formato estándar, con comisiones desglosadas.',
      kicker: 'archivos de liquidación + tx Yuno',
    },
    {
      n: '02', tag: 'bancaria',
      title: 'Conciliación Bancaria',
      body: 'Subes la información bancaria del merchant — extractos, depósitos. El archivo unificado de liquidación se cruza contra el banco para confirmar que lo prometido es lo que efectivamente llegó.',
      kicker: 'archivo unificado vs banco',
    },
    {
      n: '03', tag: 'standalone',
      title: 'Conciliación Standalone',
      body: 'Para transacciones que NO pasan por Yuno — POS físico, métodos locales, payment apps. Yuno jala las liquidaciones del proveedor automáticamente y todo queda conciliado contra tu sistema y tu banco.',
      kicker: 'tx fuera de Yuno · vista unificada',
    },
  ];
  return (
    <div className="slide theme-light" data-screen-label="15 3 productos en uno">
      <SlideChrome section="conciliación · producto" pageNum={14} total={CON_TOTAL} footer={CON_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>{'> tres productos en uno'}</MonoKicker>
        <ProductLabel subsection="3 productos en uno" />
        <h2 style={{ fontSize: 50, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 4, marginBottom: 12, color: 'var(--ink-strong)' }}>
          Tres capas que se montan una sobre otra. <span style={{ color: 'var(--accent)' }}>Una sola fuente de verdad.</span>
        </h2>
        <p style={{ fontSize: 17, color: 'var(--ink-secondary)', maxWidth: 880, marginBottom: 36 }}>
          Activa una, dos o las tres. Cada producto resuelve un nivel distinto de incertidumbre operacional.
        </p>

        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, flex: 1 }}>
          {products.map((p, i) => (
            <div key={i} className="card-nova" style={{ padding: 30, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 300, color: 'var(--accent)',
                  background: 'var(--harmony-lilac)', padding: '8px 14px', borderRadius: 10, lineHeight: 1,
                }}>{p.n}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
                  {p.tag}
                </div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--ink-strong)', marginTop: 18, lineHeight: 1.2 }}>
                {p.title}
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-secondary)', marginTop: 14, lineHeight: 1.6, flex: 1 }}>
                {p.body}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                {'> ' + p.kicker}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Helpers — flow diagram primitivos (animados vía CSS keyframes en styles.css)
// =============================================================================
function FlowStep({ num, label, sub, accent = false, width = 220 }) {
  // accent=true → engine-colored card (used for highlighted inputs like auto-fetched)
  return (
    <div className="flow-input" style={{
      width,
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 16px',
      background: accent ? 'var(--accent)' : 'var(--white)',
      color: accent ? 'var(--white)' : 'var(--ink-strong)',
      borderRadius: 12,
      border: '1px solid ' + (accent ? 'var(--accent-deep)' : 'var(--border-subtle)'),
      boxShadow: accent ? '0 4px 14px rgba(62,79,224,0.20)' : 'var(--card-shadow)',
    }}>
      <span style={{
        width: 26, height: 26, borderRadius: '50%',
        background: accent ? 'rgba(255,255,255,0.20)' : 'var(--harmony-lilac)',
        color: accent ? 'var(--white)' : 'var(--accent)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, flex: 'none',
        fontFamily: 'var(--font-mono)',
      }}>{num}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>{label}</div>
        {sub && (
          <div style={{
            fontSize: 11,
            color: accent ? 'rgba(255,255,255,0.78)' : 'var(--ink-muted)',
            fontFamily: 'var(--font-mono)', marginTop: 2,
          }}>{sub}</div>
        )}
      </div>
    </div>
  );
}

function FlowArrow({ width = 56, dir = 'right' }) {
  // Inline SVG arrow with animated dashed line. dir='right' is default; dir='converge'
  // is just visual — the line is still horizontal, but the marker pinches.
  return (
    <svg width={width} height="32" viewBox={`0 0 ${width} 32`} style={{ flex: 'none' }} aria-hidden>
      <defs>
        <marker id={'flow-arrowhead-' + width} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--accent)" />
        </marker>
      </defs>
      <line
        x1="0" y1="16" x2={width - 10} y2="16"
        stroke="var(--accent)" strokeWidth="1.8"
        className="flow-arrow-line"
        markerEnd={`url(#flow-arrowhead-${width})`}
      />
    </svg>
  );
}

function FlowEngine({ title, subtitle, width = 200 }) {
  return (
    <div className="flow-engine" style={{
      width,
      padding: '24px 22px',
      background: 'linear-gradient(135deg, var(--accent-deep) 0%, var(--accent) 100%)',
      color: 'var(--white)',
      borderRadius: 16, textAlign: 'center',
      border: '1px solid var(--accent-deep)',
      flex: 'none',
    }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.78 }}>
        yuno
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, marginTop: 8, lineHeight: 1.15 }}>{title}</div>
      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', marginTop: 10, opacity: 0.85, letterSpacing: '0.04em' }}>{subtitle}</div>
    </div>
  );
}

function FlowOutput({ title, children, width = 240 }) {
  return (
    <div className="flow-output" style={{
      width,
      padding: '20px 22px',
      background: 'var(--white)',
      border: '2px solid var(--accent)',
      borderRadius: 14,
      boxShadow: 'var(--card-shadow)',
      flex: 'none',
    }}>
      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
        {title}
      </div>
      <div style={{ marginTop: 12 }}>
        {children}
      </div>
    </div>
  );
}

function FlowDataRow({ children, status }) {
  // status: 'ok' | 'warn' | 'err' | undefined
  const colors = { ok: '#16A34A', warn: '#EA580C', err: '#DC2626' };
  const dot = colors[status];
  return (
    <div style={{
      fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink)',
      padding: '5px 8px', background: 'var(--harmony-lilac)', borderRadius: 5,
      marginTop: 6, display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flex: 'none' }} />}
      <span>{children}</span>
    </div>
  );
}

// =============================================================================
// Slide 16 — Conciliación Transaccional (detail)
// =============================================================================
function Slide16ConTransaccional({ data }) {
  return (
    <div className="slide theme-light" data-screen-label="16 Con Transaccional">
      <SlideChrome section="conciliación · transaccional" pageNum={15} total={CON_TOTAL} footer={CON_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>{'> el detalle'}</MonoKicker>
        <ProductLabel subsection="Transaccional" />
        <h2 style={{ fontSize: 50, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 4, marginBottom: 12, color: 'var(--ink-strong)' }}>
          Diez formatos entran. <span style={{ color: 'var(--accent)' }}>Un archivo único sale.</span>
        </h2>
        <p style={{ fontSize: 16, color: 'var(--ink-secondary)', maxWidth: 880, marginBottom: 32 }}>
          Cada adquirente y cada APM envía sus liquidaciones en su propio formato. Yuno los lee todos, los cruza contra las transacciones que pasaron por su orquestador, y entrega un archivo único en formato estándar — con comisiones desglosadas por método, marca y país.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 32, flex: 1 }}>
          {/* Left: bullets */}
          <div className="card-nova" style={{ padding: 30, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="mono-kicker">{'> qué hace'}</div>
            {[
              { t: 'Ingesta multi-formato', b: 'CSV, XLSX, fixed-width, XML, JSON — todos los adquirentes y APMs LATAM normalizados.' },
              { t: 'Match contra Yuno tx', b: 'Cada línea del archivo se cruza contra la tx original que pasó por el orquestador.' },
              { t: 'Comisiones desglosadas', b: 'MDR, interchange, scheme fees, IVA, retenciones — todo separado y trazable.' },
              { t: 'Archivo único, formato estándar', b: 'Salida normalizada lista para tu ERP, contabilidad o data warehouse.' },
            ].map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--lime)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginTop: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-strong)' }}>✓</span>
                </span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-strong)' }}>{it.t}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-secondary)', marginTop: 2, lineHeight: 1.5 }}>{it.b}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Right: flow diagram — animado */}
          <div className="card-nova" style={{ padding: 30, display: 'flex', flexDirection: 'column' }}>
            <div className="mono-kicker">{'> el flow'}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, flex: 1, minHeight: 320 }}>
              {/* Step 1: Inputs (4 adquirentes) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <FlowStep num="1" label="Cielo" sub="archivo CSV" width={186} />
                <FlowStep num="2" label="Stripe" sub="archivo JSON" width={186} />
                <FlowStep num="3" label="PayU" sub="archivo XLSX" width={186} />
                <FlowStep num="4" label="PIX (BR)" sub="archivo XML" width={186} />
              </div>
              <FlowArrow width={50} />
              {/* Step 2: Engine */}
              <FlowEngine
                title={<>Engine de<br />Conciliación</>}
                subtitle="match · normalize"
                width={180}
              />
              <FlowArrow width={50} />
              {/* Step 3: Output unified file */}
              <FlowOutput title="unified.csv" width={230}>
                <FlowDataRow>tx_id · merchant · psp</FlowDataRow>
                <FlowDataRow>amount · mdr · fees</FlowDataRow>
                <FlowDataRow>currency · país · brand</FlowDataRow>
                <FlowDataRow>net_settled · status</FlowDataRow>
              </FlowOutput>
            </div>
            <div style={{ marginTop: 18, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-muted)', textAlign: 'center' }}>
              N adquirentes · N formatos → 1 archivo · formato estándar · 1 fuente de verdad
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Slide 17 — Conciliación Bancaria (detail)
// =============================================================================
function Slide17ConBancaria({ data }) {
  return (
    <div className="slide theme-light" data-screen-label="17 Con Bancaria">
      <SlideChrome section="conciliación · bancaria" pageNum={16} total={CON_TOTAL} footer={CON_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>{'> el detalle'}</MonoKicker>
        <ProductLabel subsection="Bancaria" />
        <h2 style={{ fontSize: 50, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 4, marginBottom: 12, color: 'var(--ink-strong)' }}>
          Lo que el adquirente promete liquidar <span style={{ color: 'var(--accent)' }}>vs lo que llega a tu banco.</span>
        </h2>
        <p style={{ fontSize: 16, color: 'var(--ink-secondary)', maxWidth: 880, marginBottom: 32 }}>
          Subes los extractos bancarios del merchant. Yuno cruza el archivo unificado de liquidaciones contra los depósitos reales — y te muestra exactamente qué fue, qué no fue y dónde está la diferencia.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 32, flex: 1 }}>
          <div className="card-nova" style={{ padding: 30, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="mono-kicker">{'> qué hace'}</div>
            {[
              { t: 'Upload de extractos', b: 'CSV o conexión directa con el banco (open banking donde está disponible).' },
              { t: 'Match líquido-a-líquido', b: 'Cada batch de liquidación se cruza contra los depósitos reales del banco.' },
              { t: 'Detección de gaps', b: 'Identifica qué liquidaciones prometidas NO llegaron — y cuándo.' },
              { t: 'Trazabilidad fee-by-fee', b: 'Reconcilia hasta el nivel de comisión individual: MDR, scheme fee, IVA.' },
            ].map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--lime)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginTop: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-strong)' }}>✓</span>
                </span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-strong)' }}>{it.t}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-secondary)', marginTop: 2, lineHeight: 1.5 }}>{it.b}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="card-nova" style={{ padding: 30, display: 'flex', flexDirection: 'column' }}>
            <div className="mono-kicker">{'> el flow'}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, flex: 1, minHeight: 280 }}>
              {/* Step 1: 2 inputs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <FlowStep num="1" label="Archivo unificado" sub="output Transaccional" accent width={210} />
                <FlowStep num="2" label="Extracto bancario" sub="upload del merchant" width={210} />
              </div>
              <FlowArrow width={56} />
              {/* Step 2: Engine */}
              <FlowEngine
                title={<>Match<br />Engine</>}
                subtitle="monto · fecha · referencia"
                width={180}
              />
              <FlowArrow width={56} />
              {/* Step 3: Match report con colores */}
              <FlowOutput title="match report" width={210}>
                <FlowDataRow status="ok">conciliado · 94%</FlowDataRow>
                <FlowDataRow status="warn">pending T+1 · 4%</FlowDataRow>
                <FlowDataRow status="err">unmatched · 2%</FlowDataRow>
              </FlowOutput>
            </div>
            <div style={{ marginTop: 18, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-muted)', textAlign: 'center' }}>
              lo que el adquirente prometió liquidar · vs lo que efectivamente llegó al banco
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Slide 18 — Conciliación Standalone (detail)
// =============================================================================
function Slide18ConStandalone({ data }) {
  return (
    <div className="slide theme-light" data-screen-label="18 Con Standalone">
      <SlideChrome section="conciliación · standalone" pageNum={17} total={CON_TOTAL} footer={CON_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>{'> el detalle'}</MonoKicker>
        <ProductLabel subsection="Standalone" />
        <h2 style={{ fontSize: 50, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 4, marginBottom: 12, color: 'var(--ink-strong)' }}>
          Para todo lo que <span style={{ color: 'var(--accent)' }}>NO pasa por Yuno.</span>
        </h2>
        <p style={{ fontSize: 16, color: 'var(--ink-secondary)', maxWidth: 980, marginBottom: 32 }}>
          POS físico, métodos locales, payment apps de terceros, agregadores que no orquestas con Yuno — todo en una sola vista. Yuno se conecta automáticamente con los proveedores para jalar sus archivos de liquidación, los cruza contra tu información transaccional y tus extractos bancarios. Una sola fuente de verdad para todas tus transacciones, pasen por donde pasen.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: 32, flex: 1 }}>
          <div className="card-nova" style={{ padding: 30, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="mono-kicker">{'> qué resuelve'}</div>
            {[
              { t: 'Transacciones off-Yuno', b: 'POS físico, cash, MercadoPago directo, payment apps — todo lo que no pasa por el orquestador.' },
              { t: 'Auto-fetch de proveedores', b: 'Yuno se conecta directo con los proveedores para descargar sus archivos automáticamente.' },
              { t: 'Upload tu data transaccional', b: 'POS exports, sistemas legacy, ERPs — todo entra al engine de conciliación.' },
              { t: 'Cruz triple', b: 'Tx (tuya) + liquidación (proveedor) + extracto (banco) — en un solo lugar.' },
              { t: 'Cero blind spots', b: 'Aunque uses 8 PSPs distintos, todos quedan reconciliados en la misma vista.' },
            ].map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--lime)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginTop: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-strong)' }}>✓</span>
                </span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-strong)' }}>{it.t}</div>
                  <div style={{ fontSize: 13, color: 'var(--ink-secondary)', marginTop: 2, lineHeight: 1.5 }}>{it.b}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="card-nova" style={{ padding: 30, display: 'flex', flexDirection: 'column' }}>
            <div className="mono-kicker">{'> el flow triple'}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, flex: 1, minHeight: 300 }}>
              {/* Step 1: 3 inputs (triple) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <FlowStep num="1" label="Tx off-Yuno" sub="POS · cash · apps" width={210} />
                <FlowStep num="2" label="Liquidaciones" sub="auto-fetch del proveedor" accent width={210} />
                <FlowStep num="3" label="Extracto bancario" sub="upload del merchant" width={210} />
              </div>
              <FlowArrow width={56} />
              {/* Step 2: Engine triple-match */}
              <FlowEngine
                title={<>Standalone<br />Engine</>}
                subtitle="triple-match"
                width={180}
              />
              <FlowArrow width={56} />
              {/* Step 3: Vista unificada */}
              <FlowOutput title="vista unificada" width={220}>
                <FlowDataRow status="ok">todas las tx · cualquier rail</FlowDataRow>
                <FlowDataRow status="ok">alertas tempranas</FlowDataRow>
                <FlowDataRow status="ok">drill-down + métricas</FlowDataRow>
                <FlowDataRow>export · API · DWH</FlowDataRow>
              </FlowOutput>
            </div>
            <div style={{ marginTop: 18, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-muted)', textAlign: 'center' }}>
              también funciona si no usas Yuno One-Click ni el orquestador — es producto independiente.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Slide 19 — Métricas deep-dive (dimensiones de análisis)
// =============================================================================
function Slide19ConMetrics({ data }) {
  const dimensions = [
    { label: 'BIN', sub: 'rangos completos por issuer' },
    { label: 'Marca de tarjeta', sub: 'Visa · MC · Amex · Elo · Hiper' },
    { label: 'Tipo', sub: 'crédito · débito · prepago' },
    { label: 'Método de pago', sub: 'card · PIX · OXXO · PSE · CoDi' },
    { label: 'País', sub: 'origen del shopper' },
    { label: 'Moneda', sub: 'transacción + settlement' },
    { label: 'Adquirente', sub: 'por procesador' },
    { label: 'Vertical / categoría', sub: 'configurable por merchant' },
    { label: 'Status conciliación', sub: 'matched · pending · gap' },
    { label: 'Tiempo de settlement', sub: 'T+0 · T+1 · T+N' },
    { label: 'MDR efectivo', sub: 'real cobrado vs negociado' },
    { label: 'Lat./long. terminal', sub: 'para POS físico (standalone)' },
  ];
  return (
    <div className="slide theme-light" data-screen-label="19 Métricas deep-dive">
      <SlideChrome section="conciliación · métricas" pageNum={18} total={CON_TOTAL} footer={CON_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>{'> 12 dimensiones de análisis'}</MonoKicker>
        <ProductLabel subsection="Métricas" />
        <h2 style={{ fontSize: 50, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 4, marginBottom: 12, color: 'var(--ink-strong)' }}>
          Drill-down hasta donde lo necesites. <span style={{ color: 'var(--accent)' }}>Sin queries, sin SQL.</span>
        </h2>
        <p style={{ fontSize: 17, color: 'var(--ink-secondary)', maxWidth: 880, marginBottom: 36 }}>
          Todas las transacciones conciliadas (o no) son segmentables por las dimensiones que importan a tu finance team y a tu ops team.
        </p>

        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, flex: 1, alignContent: 'flex-start' }}>
          {dimensions.map((d, i) => (
            <div key={i} className="card-nova" style={{ padding: '20px 22px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                dim · {String(i + 1).padStart(2, '0')}
              </div>
              <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--ink-strong)', marginTop: 8 }}>
                {d.label}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                {d.sub}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20, fontSize: 12, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>
          combiná filtros en cascada · exportá a CSV / API · alimentá tu DWH
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Slide 20 — Dashboard unificado (mockup)
// =============================================================================
function Slide20ConDashboard({ data }) {
  return (
    <div className="slide theme-light" data-screen-label="20 Dashboard">
      <SlideChrome section="conciliación · dashboard" pageNum={19} total={CON_TOTAL} footer={CON_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>{'> dashboard unificado'}</MonoKicker>
        <ProductLabel subsection="Dashboard" />
        <h2 style={{ fontSize: 50, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 4, marginBottom: 12, color: 'var(--ink-strong)' }}>
          Una vista, todo el ciclo. <span style={{ color: 'var(--accent)' }}>De la tx al banco.</span>
        </h2>
        <p style={{ fontSize: 16, color: 'var(--ink-secondary)', maxWidth: 880, marginBottom: 28 }}>
          Reemplaza spreadsheets, queries a tu DWH y emails al equipo de adquirentes. El estado de cada tx — desde que se cobra hasta que llega al banco — vive acá.
        </p>

        {/* Dashboard mockup */}
        <div className="card-nova" style={{ padding: 0, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Top KPI strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderBottom: '1px solid var(--border-subtle)' }}>
            {[
              { label: 'conciliado', value: '94.6%', color: '#16A34A' },
              { label: 'pending T+1', value: '3.8%', color: '#EA580C' },
              { label: 'unmatched', value: '1.6%', color: '#DC2626' },
              { label: 'gap detectado', value: '$ 42.1K', color: 'var(--accent)' },
            ].map((k, i) => (
              <div key={i} style={{
                padding: '20px 24px',
                borderRight: i < 3 ? '1px solid var(--border-subtle)' : 'none',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
                  {k.label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 500, color: k.color, marginTop: 6, letterSpacing: '-0.02em' }}>
                  {k.value}
                </div>
              </div>
            ))}
          </div>

          {/* Filter chips */}
          <div style={{ display: 'flex', gap: 8, padding: '14px 24px', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 8 }}>filtros:</span>
            {['adquirente: cielo', 'marca: visa', 'país: BR', 'fecha: nov 1–7', 'status: unmatched'].map((chip, i) => (
              <span key={i} style={{
                padding: '6px 12px', background: 'var(--harmony-lilac)', borderRadius: 100,
                fontSize: 12, color: 'var(--ink)', fontFamily: 'var(--font-mono)',
              }}>{chip}</span>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>+ agregar filtro</span>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(30,32,48,0.02)' }}>
                  {['Status', 'Tx ID', 'Adquirente', 'Monto', 'MDR', 'Net', 'Fecha tx', 'Settlement', 'Banco'].map((h, i) => (
                    <th key={i} style={{ padding: '14px 16px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { status: '✓', sc: '#16A34A', id: 'tx_8a4f...', acq: 'Cielo', amt: '$1,200.00', mdr: '$24.00', net: '$1,176.00', dt: 'nov 03', set: 'nov 04', bk: 'nov 05 ✓' },
                  { status: '✓', sc: '#16A34A', id: 'tx_91b2...', acq: 'Stripe', amt: '$ 480.00', mdr: '$13.90', net: '$ 466.10', dt: 'nov 04', set: 'nov 05', bk: 'nov 06 ✓' },
                  { status: '⚠', sc: '#EA580C', id: 'tx_7c3e...', acq: 'PayU', amt: '$2,300.00', mdr: '$46.00', net: '$2,254.00', dt: 'nov 04', set: '—', bk: 'pending' },
                  { status: '✗', sc: '#DC2626', id: 'tx_5f1a...', acq: 'Cielo', amt: '$ 890.00', mdr: '$17.80', net: '$ 872.20', dt: 'nov 05', set: 'nov 06', bk: 'gap $7.20' },
                  { status: '✓', sc: '#16A34A', id: 'tx_2d8e...', acq: 'PIX',    amt: '$ 350.00', mdr: '$0.99', net: '$ 349.01', dt: 'nov 06', set: 'nov 06', bk: 'nov 06 ✓' },
                  { status: '⚠', sc: '#EA580C', id: 'tx_4b9a...', acq: 'Stripe', amt: '$1,100.00', mdr: '$31.90', net: '$1,068.10', dt: 'nov 06', set: '—', bk: 'pending' },
                ].map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '12px 16px', color: row.sc, fontWeight: 700, fontSize: 16 }}>{row.status}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-secondary)' }}>{row.id}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--ink-strong)' }}>{row.acq}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'left', fontFamily: 'var(--font-mono)', color: 'var(--ink-strong)' }}>{row.amt}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', color: 'var(--ink-secondary)' }}>{row.mdr}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', color: 'var(--ink-strong)', fontWeight: 500 }}>{row.net}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--ink-secondary)' }}>{row.dt}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--ink-secondary)' }}>{row.set}</td>
                    <td style={{ padding: '12px 16px', color: row.bk.startsWith('gap') ? '#DC2626' : (row.bk === 'pending' ? '#EA580C' : 'var(--ink)') }}>{row.bk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Slide 21 — Insights accionables (early detection)
// =============================================================================
function Slide21ConInsights({ data }) {
  const insights = [
    {
      severity: 'alto',
      sev_color: '#DC2626',
      title: 'Cielo: liquidación T+1 atrasada',
      finding: 'Cielo no liquidó $48,200 USD de la batch del martes — esperado el jueves, hoy es viernes.',
      action: 'Abrí ticket con account manager de Cielo. Yuno ya tiene la evidencia pre-armada.',
    },
    {
      severity: 'medio',
      sev_color: '#EA580C',
      title: 'BIN range Visa BR: 12% sin match',
      finding: '12% de las tx con BIN 411111-411199 (Banco do Brasil) quedaron sin match en los últimos 7 días.',
      action: 'Revisá flow 3DS de ese issuer — patrón concentrado sugiere problema de configuración.',
    },
    {
      severity: 'bajo',
      sev_color: '#16A34A',
      title: 'MDR efectivo > MDR negociado',
      finding: 'Promedio MDR cobrado por Stripe en septiembre: 2.94% vs 2.85% negociado. Gap acumulado $1,180.',
      action: 'Disputá con account manager — Yuno exporta el reporte CSV con tx detalladas.',
    },
  ];
  return (
    <div className="slide theme-light" data-screen-label="21 Insights">
      <SlideChrome section="conciliación · insights" pageNum={20} total={CON_TOTAL} footer={CON_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>{'> insights accionables'}</MonoKicker>
        <ProductLabel subsection="Insights accionables" />
        <h2 style={{ fontSize: 50, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 4, marginBottom: 12, color: 'var(--ink-strong)' }}>
          Detección temprana, <span style={{ color: 'var(--accent)' }}>con la evidencia pre-armada.</span>
        </h2>
        <p style={{ fontSize: 16, color: 'var(--ink-secondary)', maxWidth: 880, marginBottom: 36 }}>
          Yuno no te dice "hay un problema" y te deja con la duda. Cada alerta viene con qué pasó, dónde y qué accionable tomar.
        </p>

        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, flex: 1 }}>
          {insights.map((it, i) => (
            <div key={i} className="card-nova" style={{ padding: 28, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: it.sev_color }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: it.sev_color, fontWeight: 600 }}>
                  severidad {it.severity}
                </span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--ink-strong)', marginTop: 14, lineHeight: 1.25 }}>
                {it.title}
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-secondary)', marginTop: 14, lineHeight: 1.55, flex: 1 }}>
                {it.finding}
              </div>
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>
                  accionable
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>
                  {it.action}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Slide 22 — Per-merchant impact (4 stat cards)
// =============================================================================
function Slide22ConImpact({ data }) {
  return (
    <div className="slide theme-light" data-screen-label="22 Per-merchant impact">
      <SlideChrome section="conciliación · impacto" pageNum={21} total={CON_TOTAL} footer={CON_FOOTER} />
      <div style={{ paddingBottom: 56, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MonoKicker beam>{'> impacto para tu operación'}</MonoKicker>
        <ProductLabel subsection="Impacto" />
        <h2 style={{ fontSize: 52, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 4, marginBottom: 12, color: 'var(--ink-strong)' }}>
          Lo que cambia para {data.clientName || 'tu finance team'} <span style={{ color: 'var(--accent)' }}>el primer mes.</span>
        </h2>
        <p style={{ fontSize: 17, color: 'var(--ink-secondary)', maxWidth: 880, marginBottom: 40 }}>
          Cifras conservadoras basadas en cohort de merchants Yuno mid-market. Tu mileage puede variar — por arriba en la mayoría de los casos.
        </p>

        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginTop: 'auto' }}>
          <div className="card-nova card-hero" style={{ padding: '36px 28px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)' }}>
              horas ahorradas / mes
            </div>
            <div style={{ fontSize: 84, fontWeight: 300, color: 'var(--white)', letterSpacing: '-0.04em', lineHeight: 1, marginTop: 16 }}>
              60<span style={{ fontSize: 40 }}>+</span>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 18 }}>
              vs spreadsheet + cruz manual del finance team
            </div>
          </div>
          <div className="card-nova" style={{ padding: '36px 28px' }}>
            <div className="mono-kicker">{'> month-end close'}</div>
            <div style={{ fontSize: 84, fontWeight: 300, color: 'var(--accent)', letterSpacing: '-0.04em', lineHeight: 1, marginTop: 16 }}>
              8d → 1d
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-secondary)', marginTop: 18 }}>
              tiempo para cerrar la conciliación del mes
            </div>
          </div>
          <div className="card-nova" style={{ padding: '36px 28px' }}>
            <div className="mono-kicker">{'> $ recuperados / año'}</div>
            <div style={{ fontSize: 84, fontWeight: 300, color: 'var(--accent)', letterSpacing: '-0.04em', lineHeight: 1, marginTop: 16 }}>
              0.3–1.2<span style={{ fontSize: 40 }}>%</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-secondary)', marginTop: 18 }}>
              del TPV — gaps de liquidación + MDR mal aplicado + scheme fees
            </div>
          </div>
          <div className="card-nova" style={{ padding: '36px 28px' }}>
            <div className="mono-kicker">{'> blind spots eliminados'}</div>
            <div style={{ fontSize: 84, fontWeight: 300, color: 'var(--accent)', letterSpacing: '-0.04em', lineHeight: 1, marginTop: 16 }}>
              100<span style={{ fontSize: 40 }}>%</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-secondary)', marginTop: 18 }}>
              todas las tx (Yuno + off-Yuno) en una sola vista
            </div>
          </div>
        </div>
        <div style={{ marginTop: 24, fontSize: 12, color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)' }}>
          benchmarks orientativos · cohort merchants Yuno mid-market LATAM · no contractual
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Slide 23 — CTA (cierre dual-product)
// =============================================================================
function Slide23Cta({ data }) {
  const clientName = data.clientName || 'tu merchant';
  const uplift = data.annual_uplift_usd_m_fmt || '—';
  const contactName = data.contactName || data.vendor_name || 'Yuno Sales Team';
  const contactTitle = data.contactTitle || data.vendor_title || 'Sales Strategy';
  const contactEmail = data.contactEmail || data.vendor_email || 'sales@y.uno';
  const contactPhone = data.contactPhone || data.vendor_phone || '';
  const demoUrl = data.vendor_demo_url || '';
  return (
    <div className="slide theme-dark" data-screen-label="23 CTA" style={{
      background: 'var(--bg-section)', color: 'var(--white)',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      <div style={{
        position: 'absolute', top: '-10%', right: '-20%', width: '70%', height: '120%',
        background: 'radial-gradient(circle at 50% 50%, rgba(62,79,224,0.25) 0%, rgba(62,79,224,0) 60%)',
        animation: 'orbDrift 20s ease-in-out infinite', pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 2 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.55)' }}>
          próximos pasos · cierre
        </span>
        <YunoLogo size="lg" color="var(--white)" />
      </div>

      <div className="stagger" style={{ position: 'relative', zIndex: 2 }}>
        <MonoKicker beam style={{ color: 'rgba(255,255,255,0.65)' }}>{'> ready to unlock'}</MonoKicker>
        <h2 style={{ fontSize: 68, fontWeight: 300, lineHeight: 1, letterSpacing: '-0.03em', marginTop: 18, marginBottom: 32, color: 'var(--white)' }}>
          Activa Yuno One-Click + Conciliación<br />en {clientName}.
        </h2>

        <div style={{ display: 'flex', gap: 56, alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              upside one-click · anual
            </div>
            <div style={{ fontSize: 96, fontWeight: 300, color: 'var(--lime)', letterSpacing: '-0.04em', lineHeight: 1, marginTop: 12 }}>
              ${uplift}<span style={{ fontSize: 44, marginLeft: 4 }}>M</span>
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 10, maxWidth: 360, lineHeight: 1.5 }}>
              + horas ahorradas y $ recuperados con Conciliación (cuantificable en workshop).
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, paddingBottom: 24 }}>
            <a
              href={demoUrl || `mailto:${contactEmail}?subject=${encodeURIComponent('Yuno One-Click + Conciliación · ' + clientName)}`}
              target={demoUrl ? '_blank' : undefined}
              rel={demoUrl ? 'noopener noreferrer' : undefined}
              style={{
                padding: '18px 32px', borderRadius: 14, background: 'var(--lime)', color: 'var(--ink-strong)',
                fontSize: 16, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
              }}
            >
              {demoUrl ? 'Agendar workshop →' : 'Hablemos →'}
            </a>
            {(() => {
              const slug = (typeof window !== 'undefined' && window.YUNO_OC_TRACKING && window.YUNO_OC_TRACKING.slug) || null;
              const pdfUrl = slug ? `https://bridge.yuno.tools/api/one-click/${slug}/pdf` : null;
              return (
                <a
                  href={pdfUrl || `mailto:${contactEmail}?subject=${encodeURIComponent('Yuno One-Click + Conciliación · ' + clientName)}`}
                  target={pdfUrl ? '_blank' : undefined}
                  rel={pdfUrl ? 'noopener noreferrer' : undefined}
                  style={{
                    padding: '18px 32px', borderRadius: 14, background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.35)', color: 'var(--white)',
                    fontSize: 16, fontWeight: 500, textDecoration: 'none',
                  }}
                >
                  {pdfUrl ? 'Descargar PDF' : 'Compartir feedback'}
                </a>
              );
            })()}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', zIndex: 2 }}>
        <div className="card-nova" style={{
          padding: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 14, color: 'var(--white)', minWidth: 340,
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            tu contacto en yuno
          </div>
          <div style={{ fontSize: 20, fontWeight: 500, marginTop: 12 }}>{contactName}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{contactTitle}</div>
          <div style={{ marginTop: 12, fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{contactEmail}</div>
          {contactPhone && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>{contactPhone}</div>}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
          22 / {String(CON_TOTAL).padStart(2, '0')}
        </div>
      </div>
    </div>
  );
}

// Expose slides on window scope
window.Slide13ConSection = Slide13ConSection;
window.Slide14ConPain = Slide14ConPain;
window.Slide15ConThree = Slide15ConThree;
window.Slide16ConTransaccional = Slide16ConTransaccional;
window.Slide17ConBancaria = Slide17ConBancaria;
window.Slide18ConStandalone = Slide18ConStandalone;
window.Slide19ConMetrics = Slide19ConMetrics;
window.Slide20ConDashboard = Slide20ConDashboard;
window.Slide21ConInsights = Slide21ConInsights;
window.Slide22ConImpact = Slide22ConImpact;
window.Slide23Cta = Slide23Cta;
