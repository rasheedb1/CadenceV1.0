import HalftoneBg from '../primitives/HalftoneBg'
import OrbHalftone from '../primitives/OrbHalftone'
import { YunoLogo, ClientLogoMark } from '../primitives/Chrome'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

export default function SlideCover({ data, pageNum, total, lang = 'es' }) {
  const t = (path) => tr(STRINGS, lang, path)
  const name = data?.CLIENT_NAME || t('cover.defaultClient')
  const logoUrl = data?.CLIENT_LOGO || null
  const workshopDate = data?.WORKSHOP_DATE || t('cover.defaultDate')
  return (
    <div className="slide theme-gradient">
      <HalftoneBg color="#3E4FE0" opacity={0.35} density={42} fadeDir="left" style={{ left: '40%' }} animated />
      <OrbHalftone size={950} x="80%" y="50%" color="#5967E4" style={{ opacity: 0.8 }} />

      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: '50%',
        width: 1, background: 'rgba(255,255,255,0.06)',
      }} />

      {/* co-brand */}
      <div style={{ position: 'absolute', top: 64, left: 80, display: 'flex', alignItems: 'center', gap: 18 }}
           className="anim-in anim-in-1">
        <YunoLogo size={28} color="#fff" />
        <span style={{ opacity: 0.3, fontSize: 26, fontWeight: 300, color: '#fff' }}>×</span>
        <ClientLogoMark name={name} logoUrl={logoUrl} color="#fff" size={22} />
      </div>

      <div style={{ position: 'absolute', top: 64, right: 80 }} className="anim-in anim-in-2">
        <div className="t-subtitle-alt" style={{ color: 'rgba(255,255,255,0.55)', textAlign: 'right' }}>
          {t('cover.tagline')}
        </div>
        <div className="t-caption" style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8, textAlign: 'right' }}>
          {workshopDate}
        </div>
      </div>

      <div style={{ position: 'absolute', left: 80, bottom: 200, maxWidth: 1300 }}>
        <div className="t-subtitle-alt anim-in anim-in-3" style={{ color: '#E0ED80', marginBottom: 40 }}>
          {t('cover.hero')}
        </div>
        <h1 className="t-title anim-in anim-in-4" style={{
          fontSize: 132, fontWeight: 200, color: '#fff',
          lineHeight: 0.96, letterSpacing: '-0.025em',
        }}>
          {t('cover.titleLine1')}
          <br/>
          <span style={{ fontWeight: 200, color: 'rgba(255,255,255,0.6)' }}>{t('cover.titleLine2')}</span>
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
        <div>{t('cover.preparedFor')} <span style={{ color: '#fff' }}>{name}</span></div>
        <div style={{ display: 'flex', gap: 32 }}>
          <span>{t('cover.footerLine')}</span>
          <span style={{ opacity: 0.35 }}>·</span>
          <span>{String(pageNum).padStart(2, '0')} / {total}</span>
        </div>
      </div>
    </div>
  )
}
