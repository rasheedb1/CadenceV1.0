/* ============================================================
   Yuno × Yape — Caso de Negocio (15 slides) · ES
   One-shot static deck served at chief.yuno.tools/yape
   Depends on components.jsx (YunoLogo, HalftoneBg, OrbHalftone,
   SectionLabel, SlideFooter, Counter).
   ============================================================ */

// -------------------------------------------------
// Slide 01 — Portada
// -------------------------------------------------
function YapeS01Cover({ data }) {
  return (
    <div className="slide theme-gradient" data-screen-label="01 Portada">
      <HalftoneBg color="#3E4FE0" opacity={0.32} density={42} fadeDir="left" style={{ left: '40%' }} animated />
      <OrbHalftone size={900} x="78%" y="50%" color="#5967E4" style={{ opacity: 0.8 }} />

      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.06)' }} />

      <div style={{ position: 'absolute', top: 64, left: 80, display: 'flex', alignItems: 'center', gap: 16 }} className="anim-in anim-in-1">
        <YunoLogo size={28} color="#fff" />
        <span style={{ opacity: 0.3, fontSize: 28, fontWeight: 300 }}>+</span>
        <img src="/bc-assets/logos/yape.svg" alt="Yape" style={{ height: 36, display: 'block' }} />
      </div>

      <div style={{ position: 'absolute', top: 64, right: 80 }} className="anim-in anim-in-2">
        <div className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.55)', textAlign: 'right' }}>
          {data.docType || 'Caso de Negocio · Alianza'}
        </div>
        <div className="t-caption" style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8, textAlign: 'right' }}>
          {data.date || '2026'} · confidencial
        </div>
      </div>

      <div style={{ position: 'absolute', left: 80, bottom: 200, maxWidth: 1300 }}>
        <div className="t-subtitle-alt anim-in anim-in-3" style={{ color: '#E0ED80', marginBottom: 40 }}>
          Integración de PSPs · Alianza Whitelabel
        </div>
        <h1 className="t-title t-title-xl anim-in anim-in-4" style={{ color: '#fff' }}>
          Acelera <span style={{ color: '#BDC3F6' }}>5×</span> el
          <br/>
          <span style={{ fontWeight: 200, color: 'rgba(255,255,255,0.65)' }}>onboarding de PSPs</span>
          <br/>
          para Yape.
        </h1>
      </div>

      <div style={{
        position: 'absolute', bottom: 64, left: 80, right: 80,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600,
        letterSpacing: '0.14em', textTransform: 'uppercase',
      }} className="anim-in anim-in-5">
        <div>Preparado para <span style={{ color: '#fff' }}>Yape</span></div>
        <div style={{ display: 'flex', gap: 32 }}>
          <span>{data.preparedBy || 'Yuno Sales Strategy'}</span>
          <span style={{ opacity: 0.35 }}>·</span>
          <span>01 / 15</span>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------
// Slide 02 — Agenda
// -------------------------------------------------
function YapeS02Agenda() {
  const items = [
    { n: '01', title: 'La oportunidad',         pages: 'slides 03–05' },
    { n: '02', title: 'La solución Yuno',       pages: 'slides 06–08' },
    { n: '03', title: 'El análisis económico',  pages: 'slides 09–15' },
  ];
  return (
    <div className="slide theme-light" data-screen-label="02 Agenda">
      <SectionLabel>Agenda</SectionLabel>
      <div style={{ position: 'absolute', top: 180, left: 80, right: 80, bottom: 120, display: 'grid', gridTemplateColumns: '380px 1fr', gap: 80 }}>
        <div>
          <h2 className="t-title t-title-m anim-in anim-in-1" style={{ color: 'var(--unity-black)' }}>
            Qué vamos a<br/>cubrir hoy.
          </h2>
          <div className="t-caption anim-in anim-in-2" style={{ marginTop: 32, fontSize: 14, lineHeight: 1.6, maxWidth: 320 }}>
            Un caso de negocio basado en datos para escalar la capacidad de Yape de integrar PSPs, con Yuno como socio whitelabel.
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(40,42,48,0.15)' }}>
          {items.map((it, i) => (
            <div key={it.n} className={`anim-in anim-in-${i + 3}`} style={{
              display: 'grid', gridTemplateColumns: '100px 1fr 200px',
              alignItems: 'center', padding: '40px 0',
              borderBottom: '1px solid rgba(40,42,48,0.15)', gap: 40,
            }}>
              <div className="t-number" style={{ fontSize: 72, fontWeight: 200, color: 'var(--yuno-blue)', letterSpacing: '-0.04em' }}>{it.n}</div>
              <div className="t-title t-title-s" style={{ color: 'var(--unity-black)' }}>{it.title}</div>
              <div className="t-caption" style={{ textAlign: 'right', fontSize: 12 }}>{it.pages}</div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter section="Agenda" pageNum={2} total={15} />
    </div>
  );
}

// -------------------------------------------------
// Slide 03 — Sección: La Oportunidad
// -------------------------------------------------
function YapeS03Section() {
  return (
    <div className="slide theme-blue-gradient" data-screen-label="03 Sección · Oportunidad">
      <HalftoneBg color="#fff" opacity={0.12} density={32} fadeDir="top" animated />
      <OrbHalftone size={1000} x="85%" y="20%" color="#BDC3F6" style={{ opacity: 0.6 }} />
      <div style={{ position: 'absolute', top: 64, left: 80 }} className="anim-in anim-in-1">
        <YunoLogo size={24} color="#fff" />
      </div>
      <div style={{ position: 'absolute', bottom: 140, left: 80, maxWidth: 1500 }}>
        <div className="t-number anim-in anim-in-2" style={{ fontSize: 240, fontWeight: 200, color: 'rgba(255,255,255,0.2)', letterSpacing: '-0.05em', lineHeight: 0.8, marginBottom: 16 }}>01</div>
        <h2 className="t-title anim-in anim-in-3" style={{ fontSize: 120, fontWeight: 200, color: '#fff', lineHeight: 0.98, letterSpacing: '-0.02em' }}>
          La oportunidad.
        </h2>
        <div className="anim-in anim-in-4" style={{ marginTop: 28, color: 'rgba(255,255,255,0.7)', fontSize: 22, maxWidth: 950, lineHeight: 1.5 }}>
          Por qué la demanda de PSPs supera la capacidad de onboarding de Yape — y cuánto volumen se pierde por esto.
        </div>
      </div>
      <SlideFooter section="Agenda" pageNum={3} total={15} logoColor="rgba(255,255,255,0.55)" />
    </div>
  );
}

// -------------------------------------------------
// Slide 04 — Cuello de botella
// -------------------------------------------------
function YapeS04Bottleneck() {
  return (
    <div className="slide theme-light" data-screen-label="04 Cuello de botella">
      <SectionLabel>Oportunidad · Estado actual</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{ position: 'absolute', top: 130, left: 80, color: 'var(--unity-black)', maxWidth: 1400 }}>
        Yape solo puede integrar <span style={{ color: 'var(--yuno-blue)' }}>3 PSPs por trimestre</span>
        <br/>
        — y la demanda es mucho mayor.
      </h2>

      <div style={{
        position: 'absolute', top: 340, left: 80, right: 80, bottom: 140,
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 28,
      }}>
        <div className="anim-in anim-in-2" style={{
          padding: 36, background: '#fff', border: '1px solid rgba(40,42,48,0.1)',
          borderRadius: 16, borderLeft: '3px solid var(--yuno-blue)',
        }}>
          <div className="t-label" style={{ color: 'var(--yuno-blue)', marginBottom: 12, fontSize: 11 }}>01 · Causa raíz</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--unity-black)', lineHeight: 1.25, marginBottom: 16 }}>
            La capacidad de soporte es la restricción
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--gray-alt)' }}>
            Cada integración de PSP requiere acompañamiento técnico profundo del equipo de integraciones de Yape. La capacidad actual: ~3 PSPs por trimestre.
          </div>
        </div>

        <div className="anim-in anim-in-3" style={{
          padding: 36, background: '#fff', border: '1px solid rgba(40,42,48,0.1)',
          borderRadius: 16, borderLeft: '3px solid var(--yuno-blue)',
        }}>
          <div className="t-label" style={{ color: 'var(--yuno-blue)', marginBottom: 12, fontSize: 11 }}>02 · Efecto</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--unity-black)', lineHeight: 1.25, marginBottom: 16 }}>
            Una fila larga de PSPs esperando
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--gray-alt)' }}>
            Los PSPs en Perú quieren Yape en el checkout para ganar comercios. La fila crece trimestre a trimestre y queda volumen sobre la mesa mientras los PSPs esperan su turno.
          </div>
        </div>

        <div className="anim-in anim-in-4" style={{
          padding: 36, background: 'var(--unity-black)', color: '#fff',
          borderRadius: 16, position: 'relative', overflow: 'hidden',
        }}>
          <HalftoneBg color="#3E4FE0" opacity={0.4} density={22} fadeDir="bottom" />
          <div className="t-label" style={{ color: '#E0ED80', position: 'relative', marginBottom: 12, fontSize: 11 }}>03 · El costo</div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 24 }}>
            <div className="t-number" style={{ fontSize: 96, fontWeight: 200, color: '#fff', lineHeight: 0.9, letterSpacing: '-0.04em' }}>
              <Counter value={56} format={v => Math.round(v)} delay={300} />
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
              PSPs<br/>no integrados<br/>por año
            </div>
          </div>
          <div style={{ position: 'relative', marginTop: 28, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.15)', fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
            17 PSPs/trim. de demanda potencial − 3 PSPs/trim. de capacidad actual = <strong style={{ color: '#E0ED80' }}>14 PSPs/trim.</strong> que quedan esperando.
          </div>
        </div>
      </div>

      <SlideFooter section="Oportunidad" pageNum={4} total={15} />
    </div>
  );
}

// -------------------------------------------------
// Slide 05 — Dimensionamiento
// -------------------------------------------------
function YapeS05Gap() {
  const quarters = [
    { q: 'T1', current: 3,  withYuno: 17 },
    { q: 'T2', current: 6,  withYuno: 34 },
    { q: 'T3', current: 9,  withYuno: 51 },
    { q: 'T4', current: 12, withYuno: 68 },
  ];
  const max = 68;
  return (
    <div className="slide theme-lilac" data-screen-label="05 Dimensionamiento">
      <SectionLabel>Oportunidad · Dimensionamiento</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{ position: 'absolute', top: 130, left: 80, color: 'var(--unity-black)', maxWidth: 1500 }}>
        De <span style={{ color: 'var(--security-gray)' }}>12 PSPs/año</span> a <span style={{ color: 'var(--yuno-blue)' }}>68 PSPs/año</span>.
      </h2>

      <div className="t-caption anim-in anim-in-2" style={{ position: 'absolute', top: 230, left: 80, fontSize: 15, color: 'var(--gray-alt)', maxWidth: 1100 }}>
        PSPs acumulados en vivo sobre Yape durante el Año 1 — ritmo actual vs. el mismo equipo apalancado por la capa whitelabel de Yuno.
      </div>

      <div style={{ position: 'absolute', top: 360, left: 80, right: 540, bottom: 130 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, height: '100%', alignItems: 'end' }}>
          {quarters.map((q, i) => {
            const cH = (q.current / max) * 100;
            const yH = (q.withYuno / max) * 100;
            return (
              <div key={q.q} className={`anim-in anim-in-${i + 2}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8, height: '100%' }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'end', gap: 10 }}>
                  <div style={{ flex: 1, height: `${cH}%`, background: 'var(--security-gray)', borderRadius: '6px 6px 0 0', position: 'relative' }}>
                    <span style={{ position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)', fontSize: 14, fontWeight: 700, color: 'var(--unity-black)' }}>{q.current}</span>
                  </div>
                  <div style={{ flex: 1, height: `${yH}%`, background: 'var(--yuno-blue)', borderRadius: '6px 6px 0 0', position: 'relative' }}>
                    <span style={{ position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)', fontSize: 14, fontWeight: 700, color: 'var(--yuno-blue)' }}>{q.withYuno}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--security-gray)', paddingTop: 12, borderTop: '1px solid rgba(40,42,48,0.15)' }}>
                  {q.q}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ position: 'absolute', top: -36, right: 0, display: 'flex', gap: 24, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 12, height: 12, background: 'var(--security-gray)', borderRadius: 3 }} /> Ritmo actual
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 12, height: 12, background: 'var(--yuno-blue)', borderRadius: 3 }} /> Con Yuno
          </span>
        </div>
      </div>

      <div className="anim-in anim-in-6" style={{
        position: 'absolute', top: 360, right: 80, width: 420, bottom: 130,
        padding: 36, background: 'var(--yuno-blue)', color: '#fff',
        borderRadius: 16, overflow: 'hidden',
      }}>
        <HalftoneBg color="#fff" opacity={0.1} density={26} fadeDir="bottom" />
        <div className="t-label" style={{ color: '#E0ED80', position: 'relative' }}>Resultado Año 1</div>
        <div style={{ position: 'relative', marginTop: 28, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div className="t-number" style={{ fontSize: 64, fontWeight: 200, letterSpacing: '-0.04em', lineHeight: 1 }}>
              <Counter value={5.7} duration={1400} format={v => v.toFixed(1)} delay={400} />×
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 8, lineHeight: 1.5 }}>
              Más PSPs en vivo al final del Año 1
            </div>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.15)' }} />
          <div>
            <div className="t-number" style={{ fontSize: 64, fontWeight: 200, letterSpacing: '-0.04em', lineHeight: 1 }}>
              +<Counter value={56} format={v => Math.round(v)} delay={500} />
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 8, lineHeight: 1.5 }}>
              PSPs adicionales integrados en el Año 1
            </div>
          </div>
        </div>
      </div>

      <SlideFooter section="Oportunidad" pageNum={5} total={15} />
    </div>
  );
}

// -------------------------------------------------
// Slide 06 — Sección: La Solución
// -------------------------------------------------
function YapeS06Section() {
  return (
    <div className="slide theme-dark" data-screen-label="06 Sección · Solución">
      <HalftoneBg color="#3E4FE0" opacity={0.7} density={28} fadeDir="top" animated />
      <OrbHalftone size={1200} x="15%" y="85%" color="#3E4FE0" style={{ opacity: 0.6 }} />
      <div style={{ position: 'absolute', top: 64, left: 80 }} className="anim-in anim-in-1">
        <YunoLogo size={24} color="#fff" />
      </div>
      <div style={{ position: 'absolute', bottom: 140, left: 80, maxWidth: 1500 }}>
        <div className="t-number anim-in anim-in-2" style={{ fontSize: 240, fontWeight: 200, color: 'rgba(255,255,255,0.18)', letterSpacing: '-0.05em', lineHeight: 0.8, marginBottom: 16 }}>02</div>
        <h2 className="t-title anim-in anim-in-3" style={{ fontSize: 120, fontWeight: 200, color: '#fff', lineHeight: 0.98, letterSpacing: '-0.02em' }}>
          La solución <span style={{ color: '#E0ED80' }}>Yuno</span>.
        </h2>
        <div className="anim-in anim-in-4" style={{ marginTop: 28, color: 'rgba(255,255,255,0.7)', fontSize: 22, maxWidth: 950, lineHeight: 1.5 }}>
          Yuno se convierte en la interfaz técnica con la que se integran los PSPs — una capa whitelabel que abstrae al equipo de soporte de Yape.
        </div>
      </div>
      <SlideFooter section="Agenda" pageNum={6} total={15} logoColor="rgba(255,255,255,0.55)" />
    </div>
  );
}

// -------------------------------------------------
// Slide 07 — Arquitectura
// -------------------------------------------------
function YapeS07Architecture() {
  const psps = ['PSP 1','PSP 2','PSP 3','PSP 4','PSP 5','PSP 6','PSP 7','+ N…'];
  return (
    <div className="slide theme-light" data-screen-label="07 Arquitectura">
      <SectionLabel>Solución · Cómo funciona</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{ position: 'absolute', top: 130, left: 80, color: 'var(--unity-black)', maxWidth: 1500 }}>
        Una integración con Yape. <span style={{ color: 'var(--yuno-blue)' }}>PSPs ilimitados encima.</span>
      </h2>

      <div style={{ position: 'absolute', top: 340, left: 80, right: 80, bottom: 200 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 200px 1fr', gap: 32, height: '100%', alignItems: 'center' }}>

          <div className="anim-in anim-in-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {psps.map((p, i) => (
              <div key={i} style={{
                padding: '14px 16px', background: '#fff', border: '1px solid rgba(40,42,48,0.12)',
                borderRadius: 10, fontSize: 14, fontWeight: 600, color: 'var(--unity-black)',
                textAlign: 'center',
              }}>{p}</div>
            ))}
          </div>

          <div className="anim-in anim-in-3" style={{
            padding: 32, background: 'var(--yuno-blue)', color: '#fff',
            borderRadius: 16, textAlign: 'center', position: 'relative', overflow: 'hidden',
          }}>
            <HalftoneBg color="#fff" opacity={0.12} density={22} fadeDir="bottom" />
            <YunoLogo size={36} color="#fff" style={{ position: 'relative' }} />
            <div style={{ position: 'relative', marginTop: 14, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#E0ED80' }}>
              Capa whitelabel
            </div>
            <div style={{ position: 'relative', marginTop: 12, fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,0.85)' }}>
              API única · onboarding de PSPs · soporte L1/L2 · monitoreo
            </div>
          </div>

          <div className="anim-in anim-in-4" style={{
            padding: 32, background: 'var(--unity-black)', color: '#fff',
            borderRadius: 16, textAlign: 'center', position: 'relative', overflow: 'hidden',
          }}>
            <HalftoneBg color="#3E4FE0" opacity={0.45} density={20} fadeDir="bottom" />
            <div style={{ position: 'relative', fontSize: 36, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em' }}>
              Yape
            </div>
            <div style={{ position: 'relative', marginTop: 14, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#E0ED80' }}>
              Wallet
            </div>
            <div style={{ position: 'relative', marginTop: 12, fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,0.85)' }}>
              Una sola integración estable con Yuno
            </div>
          </div>

          <div className="anim-in anim-in-5" style={{ padding: 24, border: '1px dashed rgba(40,42,48,0.25)', borderRadius: 12, textAlign: 'center' }}>
            <div className="t-label" style={{ color: 'var(--security-gray)', marginBottom: 8 }}>Usuarios finales</div>
            <div style={{ fontSize: 14, color: 'var(--gray-alt)', lineHeight: 1.5 }}>
              Millones de usuarios Yape transaccionando con comercios de los PSPs
            </div>
          </div>
        </div>
      </div>

      <div className="anim-in anim-in-6" style={{
        position: 'absolute', bottom: 100, left: 80, right: 80,
        padding: '20px 32px', background: 'var(--harmony-lilac)',
        borderRadius: 12, display: 'flex', gap: 32, alignItems: 'center',
      }}>
        <div className="t-label" style={{ color: 'var(--yuno-blue)', minWidth: 160 }}>Lo que gana Yape</div>
        <div style={{ display: 'flex', gap: 32, flex: 1, fontSize: 13, color: 'var(--gray-alt)', lineHeight: 1.5 }}>
          <span>· Sin headcount adicional</span>
          <span>· Onboarding de PSPs end-to-end vía Yuno</span>
          <span>· La API de Yape se mantiene estable</span>
        </div>
      </div>

      <SlideFooter section="Solución" pageNum={7} total={15} />
    </div>
  );
}

// -------------------------------------------------
// Slide 08 — Cambio operativo
// -------------------------------------------------
function YapeS08OpShift() {
  const rows = [
    { label: 'Ritmo de onboarding de PSPs',        today: '3 PSPs/trimestre',         withY: '17 PSPs/trimestre' },
    { label: 'Tiempo de integración por PSP',      today: '8–12 semanas',             withY: '2–4 semanas' },
    { label: 'Esfuerzo de ingeniería/soporte Yape', today: 'Equipo completo por PSP',  withY: 'Una sola relación con Yuno' },
    { label: 'Soporte L1/L2 a los PSPs',           today: 'Equipo de integraciones Yape', withY: 'Soporte Yuno 24/7' },
    { label: 'Monitoreo e incidentes',             today: 'Visibilidad por PSP',      withY: 'Dashboard unificado' },
    { label: 'Time-to-revenue',                    today: '6+ meses por PSP',         withY: '4–6 semanas por PSP' },
  ];
  return (
    <div className="slide theme-light" data-screen-label="08 Cambio operativo">
      <SectionLabel>Solución · Modelo Operativo</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{ position: 'absolute', top: 130, left: 80, color: 'var(--unity-black)', maxWidth: 1400 }}>
        Qué cambia para el <span style={{ color: 'var(--yuno-blue)' }}>equipo de Yape</span>.
      </h2>

      <div style={{ position: 'absolute', top: 300, left: 80, right: 80, bottom: 130 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24,
          padding: '16px 0', borderBottom: '1px solid rgba(40,42,48,0.25)',
        }}>
          <div className="t-label" style={{ color: 'var(--security-gray)' }}>Capacidad</div>
          <div className="t-label" style={{ color: 'var(--security-gray)' }}>Hoy</div>
          <div className="t-label" style={{ color: 'var(--yuno-blue)' }}>Con Yuno</div>
        </div>

        {rows.map((r, i) => (
          <div key={i} className={`anim-in anim-in-${(i % 5) + 2}`} style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24,
            padding: '22px 0', borderBottom: '1px solid rgba(40,42,48,0.08)', alignItems: 'center',
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--unity-black)' }}>{r.label}</div>
            <div style={{ fontSize: 15, color: 'var(--security-gray)' }}>{r.today}</div>
            <div style={{ fontSize: 15, color: 'var(--yuno-blue)', fontWeight: 600 }}>{r.withY}</div>
          </div>
        ))}
      </div>

      <SlideFooter section="Solución" pageNum={8} total={15} />
    </div>
  );
}

// -------------------------------------------------
// Slide 09 — Sección: El Análisis Económico
// -------------------------------------------------
function YapeS09Section() {
  return (
    <div className="slide theme-dark" data-screen-label="09 Sección · Análisis Económico">
      <HalftoneBg color="#E0ED80" opacity={0.25} density={30} fadeDir="bottom" animated />
      <OrbHalftone size={1100} x="80%" y="75%" color="#3E4FE0" style={{ opacity: 0.7 }} />
      <div style={{ position: 'absolute', top: 64, left: 80 }} className="anim-in anim-in-1">
        <YunoLogo size={24} color="#fff" />
      </div>
      <div style={{ position: 'absolute', bottom: 140, left: 80, maxWidth: 1500 }}>
        <div className="t-number anim-in anim-in-2" style={{ fontSize: 240, fontWeight: 200, color: 'rgba(255,255,255,0.18)', letterSpacing: '-0.05em', lineHeight: 0.8, marginBottom: 16 }}>03</div>
        <h2 className="t-title anim-in anim-in-3" style={{ fontSize: 120, fontWeight: 200, color: '#fff', lineHeight: 0.98, letterSpacing: '-0.02em' }}>
          El análisis económico.
        </h2>
        <div className="anim-in anim-in-4" style={{ marginTop: 28, color: 'rgba(255,255,255,0.7)', fontSize: 22, maxWidth: 950, lineHeight: 1.5 }}>
          Supuestos de volumen, ingresos incrementales de Yape, modelo de pricing de Yuno y ROI neto para Yape.
        </div>
      </div>
      <SlideFooter section="Agenda" pageNum={9} total={15} logoColor="rgba(255,255,255,0.55)" />
    </div>
  );
}

// -------------------------------------------------
// Slide 10 — Modelo de volumen
// -------------------------------------------------
function YapeS10Volume() {
  const inputs = [
    { label: 'Ticket promedio',          value: '$40',      sub: 'USD por transacción' },
    { label: 'Tx por PSP / mes',         value: '100,000',  sub: 'Estabilizado post-ramp' },
    { label: 'TPV por PSP / mes',        value: '$4.0 M',   sub: '$48 M anualizado' },
    { label: 'Take rate Yape',           value: '1.0%',     sub: 'Fee promedio asumido sobre TPV' },
  ];
  return (
    <div className="slide theme-lilac" data-screen-label="10 Modelo de volumen">
      <SectionLabel>Economía · Modelo de volumen</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{ position: 'absolute', top: 130, left: 80, color: 'var(--unity-black)', maxWidth: 1400 }}>
        El modelo de volumen.
      </h2>
      <div className="t-caption anim-in anim-in-2" style={{ position: 'absolute', top: 230, left: 80, fontSize: 15, color: 'var(--gray-alt)', maxWidth: 1100 }}>
        Todos los números aguas abajo se derivan de estos cuatro supuestos.
      </div>

      <div style={{ position: 'absolute', top: 340, left: 80, right: 80, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {inputs.map((it, i) => (
          <div key={i} className={`anim-in anim-in-${i + 3}`} style={{
            padding: 32, background: '#fff', border: '1px solid rgba(40,42,48,0.1)',
            borderRadius: 16, minHeight: 220, display: 'flex', flexDirection: 'column',
          }}>
            <div className="t-label" style={{ color: 'var(--security-gray)', marginBottom: 12, fontSize: 10 }}>0{i+1}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--unity-black)', marginBottom: 16 }}>{it.label}</div>
            <div className="t-number" style={{ fontSize: 48, fontWeight: 300, color: 'var(--yuno-blue)', letterSpacing: '-0.03em', lineHeight: 1, marginTop: 'auto' }}>
              {it.value}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-alt)', marginTop: 12 }}>{it.sub}</div>
          </div>
        ))}
      </div>

      <div className="anim-in anim-in-7" style={{
        position: 'absolute', bottom: 130, left: 80, right: 80, padding: '28px 36px',
        background: 'var(--unity-black)', color: '#fff', borderRadius: 16, overflow: 'hidden',
      }}>
        <HalftoneBg color="#3E4FE0" opacity={0.35} density={22} fadeDir="right" />
        <div className="t-label" style={{ color: '#E0ED80', position: 'relative', marginBottom: 18 }}>Derivados · Matemática cohort Año 1</div>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32 }}>
          <div>
            <div className="t-number" style={{ fontSize: 36, fontWeight: 300, lineHeight: 1 }}>510</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>PSP-meses activos en Y1 (con Yuno)</div>
          </div>
          <div>
            <div className="t-number" style={{ fontSize: 36, fontWeight: 300, lineHeight: 1 }}>51 M</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>Transacciones procesadas en Y1</div>
          </div>
          <div>
            <div className="t-number" style={{ fontSize: 36, fontWeight: 300, lineHeight: 1, color: '#E0ED80' }}>$2.04 B</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>TPV total a través de Yape en Y1</div>
          </div>
          <div>
            <div className="t-number" style={{ fontSize: 36, fontWeight: 300, lineHeight: 1, color: '#E0ED80' }}>$1.68 B</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>TPV incremental vs baseline</div>
          </div>
        </div>
      </div>

      <SlideFooter section="Economía" pageNum={10} total={15} />
    </div>
  );
}

// -------------------------------------------------
// Slide 11 — Uplift de ingresos Yape
// -------------------------------------------------
function YapeS11RevenueUplift() {
  const rows = [
    { metric: 'PSPs integrados',           baseline: '12',        withY: '68',        delta: '+56' },
    { metric: 'PSP-meses activos',         baseline: '90',        withY: '510',       delta: '+420' },
    { metric: 'Transacciones',             baseline: '9.0 M',     withY: '51.0 M',    delta: '+42.0 M' },
    { metric: 'TPV procesado',             baseline: '$360 M',    withY: '$2,040 M',  delta: '+$1,680 M' },
    { metric: 'Ingresos Yape (take 1%)',   baseline: '$3.6 M',    withY: '$20.4 M',   delta: '+$16.8 M' },
  ];
  return (
    <div className="slide theme-light" data-screen-label="11 Uplift de ingresos">
      <SectionLabel>Economía · Ingresos Yape</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{ position: 'absolute', top: 130, left: 80, color: 'var(--unity-black)', maxWidth: 1500 }}>
        Yape captura <span style={{ color: 'var(--yuno-blue)' }}>+$16.8 M</span> de ingresos incrementales en Y1.
      </h2>

      <div style={{ position: 'absolute', top: 320, left: 80, right: 80, bottom: 130, display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 48 }}>
        <div className="anim-in anim-in-2">
          <div className="t-label" style={{ color: 'var(--security-gray)', marginBottom: 20 }}>
            Año 1 · Ritmo actual vs Con Yuno
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
            <thead>
              <tr>
                {['Métrica', 'Ritmo actual', 'Con Yuno', 'Δ Incremental'].map((h, i) => (
                  <th key={i} style={{
                    textAlign: 'left', padding: '14px 8px', fontSize: 10, fontWeight: 600,
                    letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--security-gray)',
                    borderBottom: '1px solid rgba(40,42,48,0.25)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isLast = i === rows.length - 1;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(40,42,48,0.08)', background: isLast ? 'var(--harmony-lilac)' : 'transparent' }}>
                    <td style={{ padding: '18px 8px', fontSize: 15, fontWeight: isLast ? 700 : 600, color: 'var(--unity-black)' }}>{r.metric}</td>
                    <td style={{ padding: '18px 8px', color: 'var(--security-gray)' }} className="t-number">{r.baseline}</td>
                    <td style={{ padding: '18px 8px', color: 'var(--unity-black)', fontWeight: 600 }} className="t-number">{r.withY}</td>
                    <td style={{ padding: '18px 8px', color: 'var(--yuno-blue)', fontWeight: 700 }} className="t-number">{r.delta}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="t-caption" style={{ marginTop: 18, fontSize: 11 }}>
            Matemática cohort: 17 PSPs integrados por trimestre (T1→T4) activos durante 12/9/6/3 meses → 510 PSP-meses. Baseline asume 3 PSPs/trimestre.
          </div>
        </div>

        <div className="anim-in anim-in-3" style={{
          padding: 40, background: 'var(--yuno-blue)', color: '#fff',
          borderRadius: 20, position: 'relative', overflow: 'hidden',
        }}>
          <HalftoneBg color="#fff" opacity={0.1} density={26} fadeDir="bottom" />
          <div className="t-label" style={{ color: '#E0ED80', position: 'relative' }}>Proyección Año 2</div>
          <div style={{ position: 'relative', marginTop: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <div className="t-number" style={{ fontSize: 56, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1 }}>
                $5.3 B
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 8, lineHeight: 1.5 }}>
                TPV Y2 — 68 PSPs carry-over + 68 nuevos
              </div>
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.15)' }} />
            <div>
              <div className="t-number" style={{ fontSize: 56, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1 }}>
                +$43.7 M
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 8, lineHeight: 1.5 }}>
                Ingresos incrementales Yape Y2 vs baseline
              </div>
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.15)' }} />
            <div>
              <div className="t-number" style={{ fontSize: 56, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1, color: '#E0ED80' }}>
                +$60.5 M
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 8, lineHeight: 1.5 }}>
                Ingresos incrementales acumulados Y1+Y2
              </div>
            </div>
          </div>
        </div>
      </div>

      <SlideFooter section="Economía" pageNum={11} total={15} />
    </div>
  );
}

// -------------------------------------------------
// Slide 12 — Pricing de la alianza (SaaS único)
// -------------------------------------------------
function YapeS12Pricing() {
  const tiers = [
    { label: 'Floor mensual',  value: '$6,000',  unit: '/ mes',
      note: 'Aplica desde el día 1 de la alianza, independientemente de cuántos PSPs estén activos.' },
    { label: 'Cap mensual',    value: '$35,000', unit: '/ mes',
      note: 'Una vez superado, los PSPs adicionales no incrementan el fee — Yape captura todo el upside.' },
  ];
  return (
    <div className="slide theme-light" data-screen-label="12 Pricing de la alianza">
      <SectionLabel>Economía · Modelo de Pricing</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{ position: 'absolute', top: 130, left: 80, color: 'var(--unity-black)', maxWidth: 1500 }}>
        Un <span style={{ color: 'var(--yuno-blue)' }}>SaaS fee simple</span>, con piso y techo predecibles.
      </h2>

      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 320, left: 80, right: 80,
        padding: 48, background: '#fff', border: '1px solid rgba(40,42,48,0.1)', borderRadius: 16,
        display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: 40, alignItems: 'stretch',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="t-label" style={{ fontSize: 10, color: 'var(--security-gray)' }}>Tarifa base</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--unity-black)', lineHeight: 1.25 }}>
            SaaS — por nuevo PSP integrado
          </div>
          <div className="t-number" style={{
            fontSize: 32, fontWeight: 600, color: 'var(--yuno-blue)',
            padding: '16px 22px', background: 'var(--harmony-lilac)',
            borderRadius: 10, alignSelf: 'flex-start',
          }}>
            $3,000 / PSP / mes
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li style={{ fontSize: 13, color: 'var(--gray-alt)', lineHeight: 1.45 }}>· Ingresos recurrentes predecibles para Yape</li>
            <li style={{ fontSize: 13, color: 'var(--gray-alt)', lineHeight: 1.45 }}>· Independiente de la volatilidad transaccional</li>
            <li style={{ fontSize: 13, color: 'var(--gray-alt)', lineHeight: 1.45 }}>· Fácil de presupuestar y escalar con la alianza</li>
          </ul>
        </div>

        {tiers.map((t, i) => (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column', gap: 16,
            borderLeft: '1px solid rgba(40,42,48,0.08)', paddingLeft: 32,
          }}>
            <div className="t-label" style={{ fontSize: 10, color: 'var(--security-gray)' }}>{t.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div className="t-number" style={{ fontSize: 36, fontWeight: 600, color: 'var(--yuno-blue)' }}>{t.value}</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--gray-alt)' }}>{t.unit}</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--gray-alt)', lineHeight: 1.5 }}>{t.note}</div>
          </div>
        ))}
      </div>

      <div className="anim-in anim-in-5" style={{
        position: 'absolute', bottom: 100, left: 80, right: 80,
        padding: '16px 32px', background: 'var(--harmony-lilac)',
        borderRadius: 12, fontSize: 14, color: 'var(--gray-alt)',
      }}>
        Un solo modelo: <strong style={{ color: 'var(--yuno-blue)' }}>SaaS predecible</strong> con piso para cubrir setup y techo para que Yape capture el upside del crecimiento sin tope de volumen.
      </div>

      <SlideFooter section="Economía" pageNum={12} total={15} />
    </div>
  );
}

// -------------------------------------------------
// Slide 13 — Cómo se aplica el pricing en la alianza
// -------------------------------------------------
function YapeS13Hybrid() {
  const tiers = [
    { psps: '1 PSP',     calc: '$3K × 1 = $3K · floor activa',   fee: '$6,000',  state: 'floor' },
    { psps: '2 PSPs',    calc: '$3K × 2 = $6K',                  fee: '$6,000',  state: 'floor' },
    { psps: '6 PSPs',    calc: '$3K × 6 = $18K',                 fee: '$18,000', state: 'lineal' },
    { psps: '12 PSPs',   calc: '$3K × 12 = $36K · cap activa',   fee: '$35,000', state: 'cap' },
    { psps: '34 PSPs',   calc: 'cap',                            fee: '$35,000', state: 'cap' },
    { psps: '68+ PSPs',  calc: 'cap',                            fee: '$35,000', state: 'cap' },
  ];
  const stateColor = { floor: 'var(--security-gray)', lineal: 'var(--yuno-blue)', cap: 'var(--unity-black)' };
  const stateLabel = { floor: 'Floor', lineal: 'Lineal', cap: 'Cap' };
  return (
    <div className="slide theme-lilac" data-screen-label="13 Pricing aplicado">
      <SectionLabel>Economía · Pricing Aplicado</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{ position: 'absolute', top: 130, left: 80, color: 'var(--unity-black)', maxWidth: 1400 }}>
        Cómo se <span style={{ color: 'var(--yuno-blue)' }}>aplica el pricing</span>.
      </h2>
      <div className="t-caption anim-in anim-in-2" style={{ position: 'absolute', top: 230, left: 80, fontSize: 15, color: 'var(--gray-alt)', maxWidth: 1100 }}>
        El cap se activa al 12º PSP — desde ese punto Yape captura todo el upside del crecimiento sin que el fee suba.
      </div>

      <div style={{ position: 'absolute', top: 340, left: 80, right: 80, bottom: 130, display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 48 }}>
        <div className="anim-in anim-in-3">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {['PSPs activos', 'Cálculo', 'Fee mensual', 'Régimen'].map((h, i) => (
                  <th key={i} style={{
                    textAlign: 'left', padding: '12px 8px', fontSize: 10, fontWeight: 600,
                    letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--security-gray)',
                    borderBottom: '1px solid rgba(40,42,48,0.25)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tiers.map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(40,42,48,0.08)' }}>
                  <td style={{ padding: '16px 8px', fontSize: 15, fontWeight: 600, color: 'var(--unity-black)' }} className="t-number">{t.psps}</td>
                  <td style={{ padding: '16px 8px', fontSize: 13, color: 'var(--gray-alt)' }} className="t-number">{t.calc}</td>
                  <td style={{ padding: '16px 8px', fontWeight: 700, color: stateColor[t.state] }} className="t-number">{t.fee}</td>
                  <td style={{ padding: '16px 8px' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
                      background: t.state === 'cap' ? 'var(--harmony-lilac)' : (t.state === 'floor' ? 'rgba(40,42,48,0.06)' : 'rgba(62,79,224,0.1)'),
                      color: stateColor[t.state], textTransform: 'uppercase', letterSpacing: '0.1em',
                    }}>{stateLabel[t.state]}</span>
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '20px 8px', fontWeight: 700, fontSize: 15, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }} colSpan={2}>Fee anual Yuno a Yape · Y1 = Y2 (cap binding)</td>
                <td style={{ padding: '20px 8px', fontWeight: 700, color: 'var(--yuno-blue)', fontSize: 16 }} className="t-number">$0.42 M / año</td>
                <td style={{ padding: '20px 8px', fontWeight: 700, color: 'var(--yuno-blue)', fontSize: 16, borderTopRightRadius: 8, borderBottomRightRadius: 8 }} className="t-number">$0.84 M Y1+Y2</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="anim-in anim-in-4" style={{
          padding: 40, background: 'var(--unity-black)', color: '#fff',
          borderRadius: 20, position: 'relative', overflow: 'hidden',
        }}>
          <HalftoneBg color="#3E4FE0" opacity={0.4} density={22} fadeDir="bottom" />
          <div className="t-label" style={{ color: '#E0ED80', position: 'relative' }}>Por qué este modelo funciona</div>
          <div style={{ position: 'relative', marginTop: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: 'rgba(255,255,255,0.85)' }}>
              <strong style={{ color: '#fff' }}>Floor $6K/mes</strong> cubre el costo de plataforma y soporte de Yuno desde el día 1 — sirve la fase de pilotaje con 1–2 PSPs sin negociaciones extra.
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.12)' }} />
            <div style={{ fontSize: 14, lineHeight: 1.5, color: 'rgba(255,255,255,0.85)' }}>
              <strong style={{ color: '#fff' }}>Lineal $3K/PSP</strong> alinea el fee con el ramp real — Yape solo paga más cuando integra más PSPs en producción.
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.12)' }} />
            <div style={{ fontSize: 14, lineHeight: 1.5, color: 'rgba(255,255,255,0.85)' }}>
              <strong style={{ color: '#fff' }}>Cap $35K/mes</strong> se activa al 12º PSP — todo el upside de volumen, transacciones y nuevos PSPs queda íntegro para Yape.
            </div>
          </div>
        </div>
      </div>

      <SlideFooter section="Economía" pageNum={13} total={15} />
    </div>
  );
}

// -------------------------------------------------
// Slide 14 — ROI y beneficio neto
// -------------------------------------------------
function YapeS14ROI() {
  return (
    <div className="slide theme-light" data-screen-label="14 ROI">
      <SectionLabel>Economía · Beneficio Neto</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{ position: 'absolute', top: 130, left: 80, color: 'var(--unity-black)', maxWidth: 1500 }}>
        Yape obtiene <span style={{ color: 'var(--yuno-blue)' }}>$59.7 M</span> netos en Y1+Y2 — payback en <span style={{ color: 'var(--yuno-blue)' }}>&lt;1 mes</span>.
      </h2>

      <div style={{ position: 'absolute', top: 320, left: 80, right: 80, bottom: 200 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }} className="anim-in anim-in-2">
          <thead>
            <tr>
              {['', 'Año 1', 'Año 2', 'Total Y1+Y2'].map((h, i) => (
                <th key={i} style={{
                  textAlign: i === 0 ? 'left' : 'right', padding: '14px 12px', fontSize: 11, fontWeight: 600,
                  letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--security-gray)',
                  borderBottom: '1px solid rgba(40,42,48,0.25)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid rgba(40,42,48,0.08)' }}>
              <td style={{ padding: '20px 12px', fontSize: 15, fontWeight: 600 }}>Ingresos incrementales Yape</td>
              <td style={{ padding: '20px 12px', textAlign: 'right', fontWeight: 600 }} className="t-number">+$16.8 M</td>
              <td style={{ padding: '20px 12px', textAlign: 'right', fontWeight: 600 }} className="t-number">+$43.7 M</td>
              <td style={{ padding: '20px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--unity-black)' }} className="t-number">+$60.5 M</td>
            </tr>
            <tr style={{ borderBottom: '1px solid rgba(40,42,48,0.08)' }}>
              <td style={{ padding: '20px 12px', fontSize: 15, fontWeight: 600 }}>Fees Yuno (SaaS con cap $35K/mes)</td>
              <td style={{ padding: '20px 12px', textAlign: 'right', color: 'var(--security-gray)' }} className="t-number">−$0.42 M</td>
              <td style={{ padding: '20px 12px', textAlign: 'right', color: 'var(--security-gray)' }} className="t-number">−$0.42 M</td>
              <td style={{ padding: '20px 12px', textAlign: 'right', color: 'var(--security-gray)' }} className="t-number">−$0.84 M</td>
            </tr>
            <tr style={{ background: 'var(--harmony-lilac)' }}>
              <td style={{ padding: '24px 12px', fontWeight: 700, fontSize: 16, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }}>Beneficio neto para Yape</td>
              <td style={{ padding: '24px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--yuno-blue)', fontSize: 18 }} className="t-number">$16.38 M</td>
              <td style={{ padding: '24px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--yuno-blue)', fontSize: 18 }} className="t-number">$43.28 M</td>
              <td style={{ padding: '24px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--yuno-blue)', fontSize: 18, borderTopRightRadius: 8, borderBottomRightRadius: 8 }} className="t-number">$59.66 M</td>
            </tr>
            <tr>
              <td style={{ padding: '20px 12px', fontSize: 14, color: 'var(--gray-alt)' }}>Yape recibe por cada $1 pagado a Yuno</td>
              <td style={{ padding: '20px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--yuno-blue)' }} className="t-number">$39</td>
              <td style={{ padding: '20px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--yuno-blue)' }} className="t-number">$103</td>
              <td style={{ padding: '20px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--yuno-blue)' }} className="t-number">$71</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="anim-in anim-in-3" style={{
        position: 'absolute', bottom: 100, left: 80, right: 80,
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
      }}>
        <div style={{ padding: 24, background: 'var(--yuno-blue)', color: '#fff', borderRadius: 14, position: 'relative', overflow: 'hidden' }}>
          <HalftoneBg color="#fff" opacity={0.1} density={22} fadeDir="bottom" />
          <div className="t-label" style={{ color: '#E0ED80', position: 'relative', marginBottom: 8 }}>Período de payback</div>
          <div className="t-number" style={{ fontSize: 48, fontWeight: 300, position: 'relative', lineHeight: 1 }}>
            &lt;1 <span style={{ fontSize: 18, opacity: 0.8 }}>mes</span>
          </div>
        </div>
        <div style={{ padding: 24, background: 'var(--yuno-blue)', color: '#fff', borderRadius: 14, position: 'relative', overflow: 'hidden' }}>
          <HalftoneBg color="#fff" opacity={0.1} density={22} fadeDir="bottom" />
          <div className="t-label" style={{ color: '#E0ED80', position: 'relative', marginBottom: 8 }}>Multiplier Y1+Y2</div>
          <div className="t-number" style={{ fontSize: 48, fontWeight: 300, position: 'relative', lineHeight: 1 }}>71×</div>
        </div>
        <div style={{ padding: 24, background: 'var(--unity-black)', color: '#fff', borderRadius: 14, position: 'relative', overflow: 'hidden' }}>
          <HalftoneBg color="#3E4FE0" opacity={0.4} density={22} fadeDir="bottom" />
          <div className="t-label" style={{ color: '#E0ED80', position: 'relative', marginBottom: 8 }}>Beneficio neto Y1+Y2</div>
          <div className="t-number" style={{ fontSize: 48, fontWeight: 300, position: 'relative', lineHeight: 1, color: '#E0ED80' }}>$59.7 M</div>
        </div>
      </div>

      <SlideFooter section="Economía" pageNum={14} total={15} />
    </div>
  );
}

// -------------------------------------------------
// Slide 15 — Cierre, roadmap y contacto
// -------------------------------------------------
function YapeS15Closing({ data }) {
  const phases = [
    { week: 'Semana 1–2',  title: 'Alineamiento comercial',     detail: 'Firma de MOU, cierre de tiers de pricing, definición de SLAs' },
    { week: 'Semana 3–6',  title: 'Integración Yuno ↔ Yape',     detail: 'Build de API única, certificación, sandbox' },
    { week: 'Semana 7–10', title: 'Primera cohorte de PSPs',     detail: 'Onboarding piloto (3–5 PSPs) sobre la capa Yuno' },
    { week: 'Semana 11+',  title: 'Escala a 17 PSPs/trimestre',  detail: 'Ramp de cohortes, expansión de soporte, GTM conjunto' },
  ];
  const contact = data.contact || {};
  return (
    <div className="slide theme-dark" data-screen-label="15 Cierre">
      <HalftoneBg color="#3E4FE0" opacity={0.4} density={28} fadeDir="bottom" animated />
      <OrbHalftone size={1100} x="85%" y="20%" color="#5967E4" style={{ opacity: 0.55 }} />

      <div style={{ position: 'absolute', top: 64, left: 80 }} className="anim-in anim-in-1">
        <YunoLogo size={24} color="#fff" />
      </div>
      <div style={{ position: 'absolute', top: 64, right: 80, textAlign: 'right' }} className="anim-in anim-in-2">
        <div className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.55)' }}>Preparado para Yape</div>
      </div>

      <div style={{ position: 'absolute', top: 160, left: 80, right: 80 }}>
        <div className="t-subtitle-alt anim-in anim-in-2" style={{ color: '#E0ED80', marginBottom: 24 }}>
          Roadmap y Próximos pasos
        </div>
        <h2 className="t-title anim-in anim-in-3" style={{ fontSize: 96, fontWeight: 200, color: '#fff', lineHeight: 0.98, letterSpacing: '-0.02em', maxWidth: 1400 }}>
          Crezcamos <span style={{ color: '#BDC3F6' }}>juntos.</span>
        </h2>
      </div>

      <div style={{
        position: 'absolute', top: 460, left: 80, right: 80,
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
      }}>
        {phases.map((p, i) => (
          <div key={i} className={`anim-in anim-in-${i + 4}`} style={{
            padding: 24, background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14,
          }}>
            <div className="t-label" style={{ color: '#E0ED80', marginBottom: 10, fontSize: 10 }}>{p.week}</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#fff', lineHeight: 1.25, marginBottom: 10 }}>{p.title}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{p.detail}</div>
          </div>
        ))}
      </div>

      <div className="anim-in anim-in-8" style={{
        position: 'absolute', bottom: 100, left: 80, right: 80,
        padding: '28px 36px', borderRadius: 18, background: 'var(--yuno-blue)',
        color: '#fff', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 48,
        overflow: 'hidden',
      }}>
        <HalftoneBg color="#E0ED80" opacity={0.12} density={20} fadeDir="right" />
        <div style={{ position: 'relative' }}>
          <div className="t-label" style={{ color: '#E0ED80', marginBottom: 8 }}>Resultado estimado (Y1+Y2)</div>
          <div className="t-number" style={{ fontSize: 60, fontWeight: 200, letterSpacing: '-0.04em', lineHeight: 1 }}>
            $59.7 M<span style={{ fontSize: 18, marginLeft: 8, opacity: 0.7 }}>beneficio neto · payback &lt;1 mes</span>
          </div>
        </div>
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
          <div className="t-label" style={{ color: '#E0ED80' }}>Tu punto de contacto</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#fff' }}>{contact.name || 'Rasheed Bayter'}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{contact.title || 'Director Comercial Latam'}</div>
          <div style={{ fontSize: 13, color: '#E0ED80', marginTop: 4 }}>{contact.email || 'rasheed@y.uno'} · y.uno</div>
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: 40, left: 80, right: 80,
        display: 'flex', justifyContent: 'space-between',
        fontSize: 11, fontWeight: 600, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', zIndex: 10,
      }}>
        <span>y.uno · Financial Infrastructure on a Global Scale</span>
        <span>15 / 15</span>
      </div>
    </div>
  );
}

Object.assign(window, {
  YapeS01Cover, YapeS02Agenda,
  YapeS03Section, YapeS04Bottleneck, YapeS05Gap,
  YapeS06Section, YapeS07Architecture, YapeS08OpShift,
  YapeS09Section, YapeS10Volume, YapeS11RevenueUplift,
  YapeS12Pricing, YapeS13Hybrid, YapeS14ROI, YapeS15Closing,
});
