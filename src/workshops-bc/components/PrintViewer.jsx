// PrintViewer — Puppeteer-target version of WorkshopViewer. Each slide root
// carries data-deck-active so anim-in keyframes fire (and Counter animates
// to its final value); then we set window.__PDF_READY__ after RAF×2 so
// capture sees settled DOM. Keep this list in lockstep with WorkshopViewer.
import SlideCover from './slides/SlideCover'
import SlideAgenda from './slides/SlideAgenda'
import SlideSectionYuno from './slides/SlideSectionYuno'
import SlideYunoNumbers from './slides/SlideYunoNumbers'
import SlideLogoWall from './slides/SlideLogoWall'
import SlideTeamLeaders from './slides/SlideTeamLeaders'
import SlideSectionCases from './slides/SlideSectionCases'
import SlideCaseInDrive from './slides/SlideCaseInDrive'
import SlideCaseRappi from './slides/SlideCaseRappi'
import SlideCaseLivelo from './slides/SlideCaseLivelo'
import SlideCaseMcDonalds from './slides/SlideCaseMcDonalds'
import SlideSectionCoppel from './slides/SlideSectionCoppel'
import SlideStack from './slides/SlideStack'
import SlideVolumes from './slides/SlideVolumes'
import SlideLeversOverview from './slides/SlideLeversOverview'
import SlideLeverRouting from './slides/SlideLeverRouting'
import SlideLeverMDR from './slides/SlideLeverMDR'
import SlideLeverAntifraud from './slides/SlideLeverAntifraud'
import SlideLeverMonitors from './slides/SlideLeverMonitors'
import SlideBusinessCaseRecap from './slides/SlideBusinessCaseRecap'
import SlidePerVerticalResult from './slides/SlidePerVerticalResult'
import SlideYunoCost from './slides/SlideYunoCost'
import SlideYunoExtras from './slides/SlideYunoExtras'
import SlideSectionAI from './slides/SlideSectionAI'
import SlideNova from './slides/SlideNova'
import SlideConcierge from './slides/SlideConcierge'
import SlideSectionPOS from './slides/SlideSectionPOS'
import SlidePOSFlow from './slides/SlidePOSFlow'
import SlidePOSBeforeAfter from './slides/SlidePOSBeforeAfter'
import SlidePOSApms from './slides/SlidePOSApms'
import SlideTeam from './slides/SlideTeam'

const ALL_SLIDES = [
  SlideCover, SlideAgenda, SlideSectionYuno, SlideYunoNumbers,
  SlideLogoWall, SlideTeamLeaders, SlideSectionCases, SlideCaseInDrive, SlideCaseRappi,
  SlideCaseLivelo, SlideCaseMcDonalds, SlideSectionCoppel, SlideStack, SlideVolumes,
  SlideLeversOverview, SlideLeverRouting, SlideLeverMDR, SlideLeverAntifraud,
  SlideLeverMonitors, SlideBusinessCaseRecap, SlidePerVerticalResult, SlideYunoCost,
  SlideYunoExtras,
  SlideSectionAI, SlideNova, SlideConcierge,
  SlideSectionPOS, SlidePOSFlow, SlidePOSBeforeAfter, SlidePOSApms,
  SlideTeam,
]

export default function PrintViewer({ data }) {
  // Mirror WorkshopViewer's conditional slides so the PDF matches the
  // live deck: drop the antifraud lever when the client has no AF layer,
  // the 3DS + reconciliation add-ons when yuno_extras_enabled=false, and
  // the per-vertical recap when there's only 0-1 verticals.
  const inputs = data?.INPUTS || {}
  const afNow = Number(inputs.current_antifraud_per_attempt) || 0
  const afNew = Number(inputs.target_antifraud_per_attempt) || 0
  const hasAntifraud = afNow > 0 || afNew > 0
  const extrasEnabled = inputs.yuno_extras_enabled !== false
  const multiVertical = (Array.isArray(inputs.verticals) ? inputs.verticals.length : 0) > 1
  const SLIDES = ALL_SLIDES.filter((Component) =>
    (hasAntifraud || Component !== SlideLeverAntifraud) &&
    (extrasEnabled || Component !== SlideYunoExtras) &&
    (multiVertical || Component !== SlidePerVerticalResult))
  const total = SLIDES.length
  const lang = (data && data.LANGUAGE) || 'es'
  const currency = (data && data.CURRENCY) || 'USD'
  return (
    <div data-pdf-root style={{ background: '#06070B' }}>
      {SLIDES.map((Component, i) => (
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
