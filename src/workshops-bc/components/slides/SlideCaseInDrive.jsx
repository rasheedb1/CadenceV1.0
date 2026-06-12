import HalftoneBg from '../primitives/HalftoneBg'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

const STAT_NUMBERS = [
  { n: '90',   suf: '%' },
  { n: '+4.5', suf: '%' },
  { n: '10',   suf: '' },
  { n: '-30',  suf: ' bps' },
]

export default function SlideCaseInDrive({ pageNum, total, lang = 'es' }) {
  const t = (path) => tr(STRINGS, lang, path)
  const stats = STRINGS.caseInDrive.stats.map((s, i) => ({
    n: STAT_NUMBERS[i].n,
    suf: STAT_NUMBERS[i].suf,
    label: s.label[lang] || s.label.en,
  }))
  const actions = STRINGS.caseInDrive.actions.map((a) => a[lang] || a.en)

  return (
    <div className="slide theme-light">
      <SectionLabel>{t('caseInDrive.sectionLabel')}</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1300,
        color: 'var(--unity-black)',
      }}>
        {t('caseInDrive.headlineLead')}
        <br/>
        <span style={{ color: 'var(--yuno-blue)' }}>{t('caseInDrive.headlineAccent')}</span>
      </h2>

      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 350, left: 80, fontSize: 18,
        color: 'var(--gray-alt)', maxWidth: 720, lineHeight: 1.5,
      }}>
        {t('caseInDrive.body')}
      </div>

      <div style={{
        position: 'absolute', top: 540, left: 80, right: 760,
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18,
      }}>
        {stats.map((s, i) => (
          <div key={i} className={`anim-in anim-in-${i + 3}`} style={{
            padding: 26, background: 'var(--harmony-lilac)', borderRadius: 14,
          }}>
            <div className="t-number num-tabular" style={{
              fontSize: 64, fontWeight: 300, color: 'var(--yuno-blue)',
              lineHeight: 1, letterSpacing: '-0.03em',
            }}>
              {s.n}<span style={{ color: 'var(--yuno-blue-light)' }}>{s.suf}</span>
            </div>
            <div className="t-label" style={{ marginTop: 10, fontSize: 11, color: 'var(--unity-black)' }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="case-tile anim-in anim-in-4" style={{
        position: 'absolute', top: 350, right: 80, width: 620, bottom: 110,
      }}>
        <HalftoneBg color="#3E4FE0" opacity={0.4} density={22} fadeDir="bottom" />
        <div style={{ position: 'relative' }}>
          <div className="t-label" style={{ color: '#E0ED80', marginBottom: 18 }}>
            {t('caseInDrive.actionsHeader')}
          </div>
          <ul style={{
            listStyle: 'none', padding: 0, margin: 0,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            {actions.map((it, i) => (
              <li key={i} style={{
                fontSize: 17, color: 'rgba(255,255,255,0.92)',
                lineHeight: 1.45, paddingLeft: 18, position: 'relative',
              }}>
                <span style={{
                  position: 'absolute', left: 0, top: 11, width: 8, height: 1,
                  background: '#E0ED80',
                }} />
                {it}
              </li>
            ))}
          </ul>

          <div style={{
            marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.14)',
            fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5,
          }}>
            {t('caseInDrive.quote')}
            <div style={{ marginTop: 12, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
              {t('caseInDrive.attribution')}
            </div>
          </div>
        </div>
      </div>

      <SlideFooter section={t('caseInDrive.footerSection')} pageNum={pageNum} total={total} />
    </div>
  )
}
