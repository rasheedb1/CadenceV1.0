// Shared section divider — used by S03 (Yuno), S07 (Cases), S12 (Coppel), S20 (AI).
// Blue-gradient or dark theme, halftone bg + orb, giant section number,
// big lowercase title with one word in --lime, subtitle.
import HalftoneBg from '../primitives/HalftoneBg'
import OrbHalftone from '../primitives/OrbHalftone'
import { YunoLogo, SlideFooter, ClientLogoMark } from '../primitives/Chrome'

export default function SectionDivider({
  theme = 'blue-gradient',
  sectionNumber,
  titleLead,
  titleAccent,
  subtitle,
  pageNum,
  total,
  showClientLock = false,
  clientName,
  haltoneColor = '#fff',
  haltoneOpacity = 0.12,
  orbColor = '#BDC3F6',
  orbOpacity = 0.55,
  footerSection = 'Agenda',
}) {
  return (
    <div className={`slide theme-${theme}`}>
      <HalftoneBg color={haltoneColor} opacity={haltoneOpacity} density={32} fadeDir="top" animated />
      <OrbHalftone size={1000} x="85%" y="20%" color={orbColor} style={{ opacity: orbOpacity }} />

      <div style={{
        position: 'absolute', top: 64, left: 80,
        display: 'flex', alignItems: 'center', gap: 18,
      }} className="anim-in anim-in-1">
        <YunoLogo size={24} color="#fff" />
        {showClientLock && clientName && (
          <>
            <span style={{ opacity: 0.3, fontSize: 22, color: '#fff' }}>×</span>
            <ClientLogoMark name={clientName} color="#fff" size={18} />
          </>
        )}
      </div>

      <div style={{ position: 'absolute', bottom: 140, left: 80, maxWidth: 1500 }}>
        <div className="t-number anim-in anim-in-2" style={{
          fontSize: 240, fontWeight: 200, color: 'rgba(255,255,255,0.20)',
          letterSpacing: '-0.05em', lineHeight: 0.8, marginBottom: 16,
        }}>{sectionNumber}</div>

        <h2 className="t-title anim-in anim-in-3" style={{
          fontSize: 128, fontWeight: 200, color: '#fff',
          lineHeight: 0.98, letterSpacing: '-0.02em',
        }}>
          {titleLead} <span style={{ color: '#E0ED80' }}>{titleAccent}</span>
        </h2>

        {subtitle && (
          <div className="anim-in anim-in-4" style={{
            marginTop: 32, color: 'rgba(255,255,255,0.7)',
            fontSize: 22, maxWidth: 1000, lineHeight: 1.5,
          }}>
            {subtitle}
          </div>
        )}
      </div>

      <SlideFooter section={footerSection} pageNum={pageNum} total={total} logoColor="rgba(255,255,255,0.55)" />
    </div>
  )
}
