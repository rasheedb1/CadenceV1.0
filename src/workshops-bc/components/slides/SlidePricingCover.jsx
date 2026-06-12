// SlidePricingCover — portada para el mini-deck de pricing focalizado.
// Reutiliza el tratamiento visual del cover de workshop (gradient + halftone
// + co-brand) pero con copy específico para la propuesta comercial.
import HalftoneBg from '../primitives/HalftoneBg'
import OrbHalftone from '../primitives/OrbHalftone'
import { YunoLogo, ClientLogoMark } from '../primitives/Chrome'

const COPY = {
  tagline: { es: 'Propuesta comercial', en: 'Commercial proposal', pt: 'Proposta comercial' },
  hero:    { es: 'Pricing · Yuno', en: 'Pricing · Yuno', pt: 'Pricing · Yuno' },
  titleLine1: { es: 'todo el costo', en: 'every cost line', pt: 'todo o custo' },
  titleLine2: { es: 'sobre la mesa para', en: 'on the table for', pt: 'sobre a mesa para' },
  preparedFor: { es: 'preparado para', en: 'prepared for', pt: 'preparado para' },
  footerLine: { es: 'commercial proposal · pricing', en: 'commercial proposal · pricing', pt: 'proposta comercial · pricing' },
}

export default function SlidePricingCover({ data, pageNum, total, lang = 'es' }) {
  const name = data?.CLIENT_NAME || 'cliente'
  const logoUrl = data?.CLIENT_LOGO || null
  const dateLabel = data?.WORKSHOP_DATE || new Date().toLocaleDateString(
    lang === 'pt' ? 'pt-BR' : lang === 'en' ? 'en-US' : 'es-MX',
    { day: 'numeric', month: 'long', year: 'numeric' },
  )
  const pick = (k) => COPY[k][lang] || COPY[k].en

  return (
    <div className="slide theme-gradient">
      <HalftoneBg color="#3E4FE0" opacity={0.35} density={42} fadeDir="left" style={{ left: '40%' }} animated />
      <OrbHalftone size={950} x="80%" y="50%" color="#5967E4" style={{ opacity: 0.8 }} />

      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: '50%',
        width: 1, background: 'rgba(255,255,255,0.06)',
      }} />

      <div style={{ position: 'absolute', top: 64, left: 80, display: 'flex', alignItems: 'center', gap: 18 }}
           className="anim-in anim-in-1">
        <YunoLogo size={28} color="#fff" />
        <span style={{ opacity: 0.3, fontSize: 26, fontWeight: 300, color: '#fff' }}>×</span>
        <ClientLogoMark name={name} logoUrl={logoUrl} color="#fff" size={22} />
      </div>

      <div style={{ position: 'absolute', top: 64, right: 80 }} className="anim-in anim-in-2">
        <div className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.55)', textAlign: 'right' }}>
          {pick('tagline')}
        </div>
        <div className="t-caption" style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8, textAlign: 'right' }}>
          {dateLabel}
        </div>
      </div>

      <div style={{ position: 'absolute', left: 80, bottom: 200, maxWidth: 1300 }}>
        <div className="t-subtitle-alt anim-in anim-in-3" style={{ color: '#E0ED80', marginBottom: 40 }}>
          {pick('hero')}
        </div>
        <h1 className="t-title anim-in anim-in-4" style={{
          fontSize: 132, fontWeight: 200, color: '#fff',
          lineHeight: 0.96, letterSpacing: '-0.025em',
        }}>
          {pick('titleLine1')}
          <br/>
          <span style={{ fontWeight: 200, color: 'rgba(255,255,255,0.6)' }}>{pick('titleLine2')}</span>
          <br/>
          <span style={{ color: '#BDC3F6' }}>{name}.</span>
        </h1>
      </div>

      <div style={{
        position: 'absolute', bottom: 64, left: 80, right: 80,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 600,
        letterSpacing: '0.14em', textTransform: 'uppercase',
      }} className="anim-in anim-in-5">
        <div>{pick('preparedFor')} <span style={{ color: '#fff' }}>{name}</span></div>
        <div style={{ display: 'flex', gap: 32 }}>
          <span>{pick('footerLine')}</span>
          <span style={{ opacity: 0.35 }}>·</span>
          <span>{String(pageNum).padStart(2, '0')} / {total}</span>
        </div>
      </div>
    </div>
  )
}
