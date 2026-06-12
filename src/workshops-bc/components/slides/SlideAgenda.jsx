import { SectionLabel, SlideFooter } from '../primitives/Chrome'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

export default function SlideAgenda({ data, pageNum, total, lang = 'es' }) {
  const t = (path) => tr(STRINGS, lang, path)
  const name = data?.CLIENT_NAME || t('agenda.defaultClient')
  // Items array: each item has lang-keyed title and pages. We hand-pick via tr().
  const items = STRINGS.agenda.items.map((it) => ({
    n: it.n,
    title: it.title?.[lang] || it.title?.en || '',
    pages: it.pages?.[lang] || it.pages?.en || '',
  }))
  // The heading uses a literal "\n" — split into JSX so the existing
  // two-line typography stays put across languages.
  const heading = t('agenda.heading')
  const [headingLine1, headingLine2] = String(heading).split('\n')

  return (
    <div className="slide theme-light">
      <SectionLabel>{t('agenda.sectionLabel')}</SectionLabel>

      <div style={{
        position: 'absolute', top: 170, left: 80, right: 80, bottom: 120,
        display: 'grid', gridTemplateColumns: '420px 1fr', gap: 80,
      }}>
        <div>
          <h2 className="t-title t-title-m anim-in anim-in-1" style={{ color: 'var(--unity-black)' }}>
            {headingLine1}<br/>{headingLine2}
          </h2>
          <div className="anim-in anim-in-2" style={{
            marginTop: 32, fontSize: 16, lineHeight: 1.6, maxWidth: 340,
            color: 'var(--gray-alt)',
          }}>
            {t('agenda.intro').replace('{name}', name)}
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(40,42,48,0.15)' }}>
          {items.map((it, i) => (
            <div key={it.n} className={`anim-in anim-in-${i + 3}`} style={{
              display: 'grid', gridTemplateColumns: '120px 1fr 200px',
              alignItems: 'center', padding: '32px 0',
              borderBottom: '1px solid rgba(40,42,48,0.15)', gap: 40,
            }}>
              <div className="t-number" style={{
                fontSize: 64, fontWeight: 200,
                color: 'var(--yuno-blue)', letterSpacing: '-0.04em',
              }}>{it.n}</div>
              <div className="t-title" style={{ fontSize: 38, fontWeight: 400, color: 'var(--unity-black)' }}>
                {it.title}
              </div>
              <div className="t-caption" style={{ textAlign: 'right', fontSize: 12 }}>
                {it.pages}
              </div>
            </div>
          ))}
        </div>
      </div>

      <SlideFooter section={t('agenda.sectionLabel')} pageNum={pageNum} total={total} />
    </div>
  )
}
