// PricingPrintViewer — versión stack-print del PricingViewer (7 slides
// renderizadas a 1920×1080 con pageBreakAfter para Puppeteer).
import SlidePricingCover from './slides/SlidePricingCover'
import SlideYunoCost from './slides/SlideYunoCost'
import SlidePricingPOS from './slides/SlidePricingPOS'
import SlideIncludedFeatures from './slides/SlideIncludedFeatures'
import SlideYunoExtras from './slides/SlideYunoExtras'
import SlideNovaConcierge from './slides/SlideNovaConcierge'
import SlideTeam from './slides/SlideTeam'

const ALL_SLIDES = [
  SlidePricingCover,
  SlideYunoCost,
  SlidePricingPOS,
  SlideIncludedFeatures,
  SlideYunoExtras,
  SlideNovaConcierge,
  SlideTeam,
]

export default function PricingPrintViewer({ data }) {
  const total = ALL_SLIDES.length
  const lang = (data && data.LANGUAGE) || 'es'
  const currency = (data && data.CURRENCY) || 'USD'
  return (
    <div data-pdf-root style={{ background: '#06070B' }}>
      {ALL_SLIDES.map((Component, i) => (
        <div
          key={i}
          data-slide-root
          data-deck-active
          style={{
            width: '1920px', height: '1080px',
            position: 'relative', overflow: 'hidden',
            background: '#06070B',
            pageBreakAfter: 'always', breakAfter: 'page',
          }}
        >
          <Component data={data} pageNum={i + 1} total={total} shared lang={lang} currency={currency} />
        </div>
      ))}
    </div>
  )
}
