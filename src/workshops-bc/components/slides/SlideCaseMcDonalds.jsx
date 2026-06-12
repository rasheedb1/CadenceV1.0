import HalftoneBg from '../primitives/HalftoneBg'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

const STAT_NUMBERS = [
  { n: '21',  suf: '' },
  { n: '27',  suf: '' },
  { n: '+4',  suf: 'pp' },
  { n: '1',   suf: ' API' },
]

export default function SlideCaseMcDonalds({ data, pageNum, total, lang = 'es' }) {
  const t = (path) => tr(STRINGS, lang, path)
  const clientName = data?.CLIENT_NAME || t('caseMcDonalds.defaultClient')
  const stats = STRINGS.caseMcDonalds.stats.map((s, i) => ({
    n: STAT_NUMBERS[i].n,
    suf: STAT_NUMBERS[i].suf,
    label: s.label[lang] || s.label.en,
  }))

  return (
    <div className="slide theme-dark">
      <HalftoneBg color="#3E4FE0" opacity={0.16} density={32} />

      <SectionLabel color="rgba(255,255,255,0.7)">{t('caseMcDonalds.sectionLabel')}</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1500, color: '#fff',
      }}>
        {t('caseMcDonalds.headlineLead')}
        <br/>
        <span style={{ color: '#BDC3F6' }}>{t('caseMcDonalds.headlineAccent')}</span>
      </h2>

      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 350, left: 80, fontSize: 18,
        color: 'rgba(255,255,255,0.7)', maxWidth: 760, lineHeight: 1.5,
      }}>
        {t('caseMcDonalds.body')}
      </div>

      <div style={{
        position: 'absolute', top: 580, left: 80, right: 760,
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
        padding: 40, background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18,
      }}>
        <div className="t-label" style={{ color: '#E0ED80', marginBottom: 18 }}>
          {t('caseMcDonalds.insightHeader')}
        </div>
        <div style={{ fontSize: 19, lineHeight: 1.5, color: 'rgba(255,255,255,0.92)', fontWeight: 400 }}>
          {t('caseMcDonalds.insight')}
          <br/><br/>
          {t('caseMcDonalds.insightCloseTemplate').replace('{name}', clientName)}
        </div>
      </div>

      <SlideFooter section={t('caseMcDonalds.footerSection')} pageNum={pageNum} total={total} logoColor="rgba(255,255,255,0.55)" />
    </div>
  )
}
