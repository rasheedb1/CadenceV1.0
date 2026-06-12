import HalftoneBg from '../primitives/HalftoneBg'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

const STAT_NUMBERS = [
  { n: '6',   suf: '×' },
  { n: '80',  suf: '%' },
  { n: '20',  suf: '+' },
  { n: '< 1', suf: 's' },
]

export default function SlideCaseRappi({ pageNum, total, lang = 'es' }) {
  const t = (path) => tr(STRINGS, lang, path)
  const stats = STRINGS.caseRappi.stats.map((s, i) => ({
    n: STAT_NUMBERS[i].n,
    suf: STAT_NUMBERS[i].suf,
    label: s.label[lang] || s.label.en,
  }))
  // Replace the bolded "Monitors" word inside body copy via split. The PT/EN
  // glossary keeps "Monitors" verbatim across all languages.
  const monitorsWord = t('caseRappi.bodyMonitorsWord')
  const bodyParts = t('caseRappi.body').split(monitorsWord)

  return (
    <div className="slide theme-dark">
      <HalftoneBg color="#3E4FE0" opacity={0.16} density={32} />

      <SectionLabel color="rgba(255,255,255,0.7)">{t('caseRappi.sectionLabel')}</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1500, color: '#fff',
      }}>
        {t('caseRappi.headlineLead')}
        <br/>
        <span style={{ color: '#E0ED80' }}>{t('caseRappi.headlineAccent')}</span>
      </h2>

      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 350, left: 80, fontSize: 18,
        color: 'rgba(255,255,255,0.7)', maxWidth: 760, lineHeight: 1.5,
      }}>
        {bodyParts.length > 1 ? (
          <>
            {bodyParts[0]}
            <strong style={{ color: '#fff', fontWeight: 600 }}>{monitorsWord}</strong>
            {bodyParts[1]}
          </>
        ) : (
          bodyParts[0]
        )}
      </div>

      <div style={{
        position: 'absolute', top: 600, left: 80, right: 760,
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18,
      }}>
        {stats.map((s, i) => (
          <div key={i} className={`anim-in anim-in-${i + 3}`} style={{
            padding: 22, background: 'rgba(255,255,255,0.05)', borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.10)',
          }}>
            <div className="t-number num-tabular" style={{
              fontSize: 56, fontWeight: 300, color: '#fff',
              lineHeight: 1, letterSpacing: '-0.03em',
            }}>
              {s.n}<span style={{ color: 'var(--yuno-blue-light)' }}>{s.suf}</span>
            </div>
            <div className="t-label" style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="anim-in anim-in-4" style={{
        position: 'absolute', top: 350, right: 80, width: 620, bottom: 110,
        padding: 40, background: 'rgba(62,79,224,0.12)',
        border: '1px solid rgba(124,137,239,0.40)', borderRadius: 18,
      }}>
        <div className="t-label" style={{ color: '#BDC3F6', marginBottom: 18 }}>
          {t('caseRappi.quoteHeader')}
        </div>
        <div style={{ fontSize: 22, lineHeight: 1.45, color: '#fff', fontWeight: 400 }}>
          {t('caseRappi.quote')}
        </div>
        <div style={{
          marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.10)',
          fontSize: 14, color: 'rgba(255,255,255,0.70)', lineHeight: 1.5,
        }}>
          {t('caseRappi.follow')}
        </div>
        <div style={{
          marginTop: 28, fontSize: 11, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)',
        }}>
          {t('caseRappi.attribution')}
        </div>
      </div>

      <SlideFooter section={t('caseRappi.footerSection')} pageNum={pageNum} total={total} logoColor="rgba(255,255,255,0.55)" />
    </div>
  )
}
