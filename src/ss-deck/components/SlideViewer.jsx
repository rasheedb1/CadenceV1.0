import { useState, useEffect, useCallback, useRef } from 'react'
import SlideCover from './slides/SlideCover'
import SlideMarketContext from './slides/SlideMarketContext'
import SlideOrchestrationEra from './slides/SlideOrchestrationEra'
import SlideWhatIsOrchestration from './slides/SlideWhatIsOrchestration'
import SlideWhyPlatformPartner from './slides/SlideWhyPlatformPartner'
import SlideBeyondOrchestration from './slides/SlideBeyondOrchestration'
import SlideValueLevers from './slides/SlideValueLevers'
import SlideWhiteLabelPromise from './slides/SlideWhiteLabelPromise'
import SlideInfrastructure from './slides/SlideInfrastructure'
import SlideDiagnostic from './slides/SlideDiagnostic'
import SlideYunoSolve from './slides/SlideYunoSolve'
import SlideReplitGoingGlobal from './slides/SlideReplitGoingGlobal'
import SlideReplitBenefits from './slides/SlideReplitBenefits'
import SlideDashboard from './slides/SlideDashboard'
import SlideProductSuite from './slides/SlideProductSuite'
import SlideGlobalPresence from './slides/SlideGlobalPresence'
import SlideLeadership from './slides/SlideLeadership'
import SlideTrustedBy from './slides/SlideTrustedBy'
import SlideCTA from './slides/SlideCTA'
import OrbBackground from './OrbBackground'
import { ThemeProvider, useTheme } from '../lib/theme'

// Slugs whose deck flips to the Nova-style light surface. Everyone else
// stays on the original dark canvas. Replit is the launch case: JP is
// sending that deck personally to the CEO and wants it visually
// separated from the generic merchant deck.
const LIGHT_THEME_SLUGS = new Set(['replit'])

// `atmospheric: true` keeps the dense OrbBackground glow — only the cover
// uses it. Every other slide gets no ambient background effect; per-slide
// beams (kicker BeamRule, card borders, diagram lines) handle the
// animated feel instead of invented corner traces.
//
// Partner mode skips Diagnostic: that slide was the per-merchant deep-dive
// hook ("we understand your stack"), which doesn't translate to a partner
// audience that spans consultancies, networks, wallets, and processors. The
// partner narrative leads with what Yuno IS and what we deliver to merchants.
//
// Banking mode skips both Diagnostic and The Solve: those two were authored
// against a per-merchant fragmented-stack diagnosis and a merchant-shaped
// "this is how we fix it" answer. Banks read those slides as off-target.
// The banking-specific intro slides (orchestration era, value levers, etc.)
// live ahead of the Yuno explainer slides instead.
const ALL_SLIDES = [
  { Component: SlideCover, label: 'Cover', atmospheric: true },
  // Six banking-only intro slides scoped to the generic Banking vertical
  // deck (synthetic "Banking" dropdown entry). Specific-bank decks (BMO,
  // Banco Azteca, etc.) skip these for now while the copy iterates;
  // they'll be opened up once the message is dialed in. Order tells the
  // storyline: problem → era → concept → why-platform → economics →
  // trust-close, then About-Yuno explainer slides take over.
  { Component: SlideMarketContext, label: 'Market Context', onlyForGenericBanking: true },
  { Component: SlideOrchestrationEra, label: 'Orchestration Era', onlyForGenericBanking: true },
  { Component: SlideWhatIsOrchestration, label: 'What is Orchestration', onlyForGenericBanking: true },
  { Component: SlideWhyPlatformPartner, label: 'Why a Platform Partner', onlyForGenericBanking: true },
  { Component: SlideBeyondOrchestration, label: 'Beyond Orchestration', onlyForGenericBanking: true },
  { Component: SlideValueLevers, label: 'Value Levers', onlyForGenericBanking: true },
  { Component: SlideWhiteLabelPromise, label: 'White-label Promise', onlyForGenericBanking: true },
  { Component: SlideInfrastructure, label: 'Infrastructure' },
  { Component: SlideDiagnostic, label: 'Diagnostic', skipForModes: ['partner', 'banking'] },
  { Component: SlideYunoSolve, label: 'The Solve', skipForModes: ['banking'] },
  // Replit-only setup + emphasis pair. The deck goes from JP straight to
  // Replit's CEO, so we run two custom slides after the generic Solve:
  //   1) Going Global frames what Replit is trying to do (grow paying
  //      users globally) and shows that no single MoR covers it, with
  //      Ebanx vs dLocal mini-cards as the proof.
  //   2) Why Yuno answers that with the three-card argument naming
  //      Ebanx and the swap-insurance angle.
  // Other merchants skip both entirely.
  { Component: SlideReplitGoingGlobal, label: 'Going Global', onlyForSlugs: ['replit'] },
  { Component: SlideReplitBenefits, label: 'Why Yuno', onlyForSlugs: ['replit'] },
  { Component: SlideProductSuite, label: 'Product Suite' },
  { Component: SlideDashboard, label: 'Dashboard' },
  { Component: SlideGlobalPresence, label: 'Global Presence' },
  { Component: SlideLeadership, label: 'Leadership' },
  { Component: SlideTrustedBy, label: 'Trusted By' },
  { Component: SlideCTA, label: 'CTA' },
]

function buildSlides(mode, { isGenericBanking = false, slug = null } = {}) {
  const filtered = ALL_SLIDES.filter((s) => {
    if (s.skipForModes?.includes(mode)) return false
    if (s.onlyForModes && !s.onlyForModes.includes(mode)) return false
    if (s.onlyForGenericBanking && !isGenericBanking) return false
    if (s.onlyForSlugs && !s.onlyForSlugs.includes(slug)) return false
    return true
  })
  // Replit storyline reorder: Going Global (frames the problem of
  // reaching paying users globally) lands BEFORE The Solve (Yuno's
  // platform answer), so the deck reads diagnose → frame → solve →
  // Replit-specific benefits. Default order keeps The Solve first
  // for every other merchant.
  if (slug === 'replit') {
    const i = filtered.findIndex((s) => s.Component === SlideYunoSolve)
    const j = filtered.findIndex((s) => s.Component === SlideReplitGoingGlobal)
    if (i !== -1 && j !== -1) {
      const swapped = filtered.slice()
      ;[swapped[i], swapped[j]] = [swapped[j], swapped[i]]
      return swapped
    }
  }
  return filtered
}

const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#000000',
    position: 'relative',
  },
  slideArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Fixed-size 1920×1080 stage, scaled to fit the viewport. Slides size type
  // with clamp(..vw..) — without a fixed stage, a tall/short browser window
  // produces different scale than fullscreen and cards overflow. Scaling the
  // whole stage makes preview pixel-identical to presentation. Background
  // color is set per-render from the active theme so the Replit (light)
  // deck doesn't sit on a dark stage that bleeds through transparent slides.
  slideStack: {
    width: '1920px',
    height: '1080px',
    position: 'relative',
    transformOrigin: 'center center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  slideWrapper: {
    position: 'absolute',
    inset: 0,
    transition: 'transform 0.5s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.35s ease-out',
  },
  // Auto-numbered slide badge for Replit (light theme). Mirrors the
  // legacy SlideBase slideNumber position so it lands in the same
  // bottom-left corner the deck has always used.
  stageSlideNumber: {
    position: 'absolute',
    bottom: 'clamp(18px, 2.4%, 40px)',
    left: 'clamp(36px, 4.8%, 90px)',
    fontSize: 'clamp(10px, 0.72vw, 12px)',
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '1.5px',
    pointerEvents: 'none',
    zIndex: 4,
  },
  controls: {
    height: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 28px',
    background: 'rgba(0,0,0,0.85)',
    borderTop: '1px solid rgba(255,255,255,0.05)',
    flexShrink: 0,
    backdropFilter: 'blur(24px)',
    position: 'relative',
    zIndex: 10,
  },
  progressBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '2px',
    background: 'linear-gradient(90deg, #3E4FE0 0%, #5967E4 50%, #BDC3F6 100%)',
    transition: 'width 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
    boxShadow: '0 0 12px rgba(62,79,224,0.4)',
  },
  leftGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.6)',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font)',
    cursor: 'pointer',
    padding: '8px 14px',
    borderRadius: '10px',
    transition: 'all 0.15s ease',
    letterSpacing: '0.1px',
  },
  merchantLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  merchantLogo: {
    height: '18px',
    maxWidth: '110px',
    objectFit: 'contain',
    display: 'block',
    opacity: 0.9,
  },
  merchantName: {
    fontSize: '13px',
    fontWeight: 700,
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: '-0.1px',
  },
  navGroup: {
    // Pinned to the horizontal center of the controls bar so it doesn't
    // drift when the left (merchant logo) or right (slide label) groups
    // change width between slides.
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    zIndex: 1,
  },
  slideCount: {
    fontFamily: 'var(--font-display)',
    fontSize: '13px',
    fontWeight: 700,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: '0.5px',
    fontVariantNumeric: 'tabular-nums',
    minWidth: '72px',
    textAlign: 'center',
  },
  slideCountFaded: {
    color: 'rgba(255,255,255,0.3)',
    fontWeight: 400,
  },
  navBtn: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px',
    color: 'rgba(255,255,255,0.8)',
    fontSize: '18px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'all 0.15s ease',
  },
  rightGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  slideLabel: {
    fontSize: '10.5px',
    fontWeight: 700,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: '1.2px',
    textTransform: 'uppercase',
    padding: '6px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: '8px',
  },
  fullscreenBtn: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '10px',
    color: 'rgba(255,255,255,0.6)',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  // Dot indicator strip
  dots: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '100px',
    border: '1px solid rgba(255,255,255,0.05)',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.2)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  dotActive: {
    width: '20px',
    borderRadius: '3px',
    background: 'linear-gradient(90deg, #3E4FE0 0%, #5967E4 100%)',
    boxShadow: '0 0 10px rgba(62,79,224,0.5)',
  },
  // Hint overlay (shown on first load)
  hintOverlay: {
    position: 'absolute',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '10px 22px',
    background: 'rgba(0,0,0,0.75)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '100px',
    fontSize: '12px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.7)',
    backdropFilter: 'blur(24px)',
    zIndex: 20,
    boxShadow: '0 10px 36px rgba(0,0,0,0.4)',
    animation: 'fadeInUp 0.6s ease-out 0.8s both',
  },
  hintKey: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '22px',
    height: '22px',
    padding: '0 6px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '6px',
    fontFamily: 'var(--font-display)',
    fontSize: '11px',
    fontWeight: 700,
    color: '#fff',
    margin: '0 4px',
  },
  hintItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  },
  hintDivider: {
    width: '1px',
    height: '14px',
    background: 'rgba(255,255,255,0.1)',
  },
  // Rotate-your-phone overlay for portrait-mobile users. Sits above
  // everything, semi-opaque so the deck is faintly visible behind it.
  // Dismissable so users with rotation lock can still page through.
  rotateOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '24px',
    padding: '32px',
    textAlign: 'center',
    background: 'rgba(0,0,0,0.92)',
    backdropFilter: 'blur(20px)',
    color: 'rgba(255,255,255,0.92)',
  },
  rotateIcon: {
    width: '88px',
    height: '88px',
    borderRadius: '20px',
    background: 'linear-gradient(135deg, rgba(62,79,224,0.2) 0%, rgba(89,103,228,0.1) 100%)',
    border: '1px solid rgba(62,79,224,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 32px rgba(62,79,224,0.25)',
    animation: 'rotateHint 2.4s ease-in-out infinite',
  },
  rotateTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '22px',
    fontWeight: 700,
    letterSpacing: '-0.4px',
    lineHeight: 1.25,
    maxWidth: '320px',
  },
  rotateSubtitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.6)',
    maxWidth: '300px',
    lineHeight: 1.5,
  },
  rotateDismiss: {
    marginTop: '12px',
    padding: '12px 24px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '12px',
    color: 'rgba(255,255,255,0.78)',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font)',
    letterSpacing: '0.2px',
    cursor: 'pointer',
  },
}

export default function SlideViewer({ data, onBack, shared = false }) {
  const themeName = LIGHT_THEME_SLUGS.has(data?.COMPANY_SLUG) ? 'light' : 'dark'
  return (
    <ThemeProvider theme={themeName}>
      <SlideViewerInner data={data} onBack={onBack} shared={shared} />
    </ThemeProvider>
  )
}

function SlideViewerInner({ data, onBack, shared = false }) {
  const theme = useTheme()
  const SLIDES = buildSlides(data?.MODE, {
    isGenericBanking: data?.MODE === 'banking' && data?.IS_GENERIC === true,
    slug: data?.COMPANY_SLUG,
  })
  // ?slide=N in the URL jumps straight to slide N (1-indexed) on first
  // render. Handy for tooling (e.g. static HTML snapshot captures) and for
  // sharing a deep link to a specific slide. Out-of-range values are
  // clamped back to slide 1.
  const initialSlide = (() => {
    if (typeof window === 'undefined') return 0
    const raw = new URLSearchParams(window.location.search).get('slide')
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 1) return Math.min(n, SLIDES.length) - 1
    return 0
  })()
  const [current, setCurrent] = useState(initialSlide)
  const [previous, setPrevious] = useState(0)
  const [direction, setDirection] = useState('next')
  const [showHint, setShowHint] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [stageScale, setStageScale] = useState(1)
  // Portrait phones can't render a 16:9 stage at any useful size — overlay
  // a rotation hint instead of letting the deck shrink to a strip.
  const [needsRotate, setNeedsRotate] = useState(false)
  const [rotateDismissed, setRotateDismissed] = useState(false)
  const containerRef = useRef(null)
  const slideAreaRef = useRef(null)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const total = SLIDES.length

  // Fit the 1920x1080 stage into whatever space slideArea has. ResizeObserver
  // reruns on window resize and on fullscreen toggle so preview and
  // presentation render identically.
  useEffect(() => {
    const el = slideAreaRef.current
    if (!el) return
    const fit = () => {
      const { width, height } = el.getBoundingClientRect()
      if (!width || !height) return
      setStageScale(Math.min(width / 1920, height / 1080))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Detect a small portrait viewport (phones held normally) and prompt the
  // user to rotate. Re-checks on resize + orientationchange. Threshold of
  // 700px shorter side covers iPhone 16 Pro Max in portrait without firing
  // on tablets in landscape.
  useEffect(() => {
    const check = () => {
      const isPortrait = window.innerHeight > window.innerWidth
      const isSmall = Math.min(window.innerWidth, window.innerHeight) < 700
      setNeedsRotate(isPortrait && isSmall)
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  const goTo = useCallback((idx) => {
    setCurrent((c) => {
      if (idx === c) return c
      setDirection(idx > c ? 'next' : 'prev')
      setPrevious(c)
      return idx
    })
    setShowHint(false)
  }, [])

  const next = useCallback(() => {
    setCurrent((c) => {
      const newC = Math.min(c + 1, total - 1)
      if (newC !== c) {
        setDirection('next')
        setPrevious(c)
      }
      return newC
    })
    setShowHint(false)
  }, [total])

  const prev = useCallback(() => {
    setCurrent((c) => {
      const newC = Math.max(c - 1, 0)
      if (newC !== c) {
        setDirection('prev')
        setPrevious(c)
      }
      return newC
    })
    setShowHint(false)
  }, [])

  // Touch swipe on the slide area. Horizontal-dominant swipe with a 60px
  // threshold flips slides; vertical-dominant gestures are left alone so
  // form fields on the CTA stay scrollable.
  const onTouchStart = useCallback((e) => {
    const t = e.touches[0]
    touchStartX.current = t.clientX
    touchStartY.current = t.clientY
  }, [])
  const onTouchEnd = useCallback((e) => {
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStartX.current
    const dy = t.clientY - touchStartY.current
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return
    if (dx < 0) next()
    else prev()
  }, [next, prev])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.()
      setIsFullscreen(false)
    }
  }, [])

  useEffect(() => {
    const handler = (e) => {
      // Skip slide-navigation shortcuts when the user is typing in a form
      // field — otherwise space (advance) and digits (jump to slide) steal
      // input from the CTA slide's name/email fields.
      const t = e.target
      const typing =
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      if (typing) return

      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen() }
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          setIsFullscreen(false)
        } else {
          onBack()
        }
      }
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1
        if (idx < total) goTo(idx)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [next, prev, onBack, toggleFullscreen, goTo, total])

  // Auto-hide hint after 5s
  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 5000)
    return () => clearTimeout(t)
  }, [])

  const { Component: SlideComponent, label: slideLabel, atmospheric } = SLIDES[current]

  const progressPercent = ((current + 1) / total) * 100

  return (
    <div ref={containerRef} style={styles.container}>
      <div
        ref={slideAreaRef}
        style={styles.slideArea}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div style={{ ...styles.slideStack, background: theme.bgStage, transform: `scale(${stageScale})` }}>
          {atmospheric && theme.orbVisible && <OrbBackground />}
          <div
            key={current}
            style={{
              ...styles.slideWrapper,
              animation: `${direction === 'next' ? 'slideInRight' : 'slideInLeft'} 0.5s cubic-bezier(0.32, 0.72, 0, 1)`,
            }}
          >
            <SlideComponent data={data} shared={shared} />
          </div>

          {/* Replit auto-numbering. The deck filters in two extra slides
              (Going Global, Why Yuno) on top of the shared base, so the
              hardcoded "/ 09" markers from the original cut don't fit.
              SlideBase + SlideCTA suppress their own numbers on light
              and we paint a single canonical "NN / TT" badge here, fed
              by the live SLIDES list so the count is always honest. */}
          {theme.isLight && (
            <div style={{ ...styles.stageSlideNumber, color: theme.inkFaint }}>
              {String(current + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </div>
          )}
        </div>

        {showHint && !needsRotate && (
          <div style={styles.hintOverlay}>
            <div style={styles.hintItem}>
              <span style={styles.hintKey}>←</span>
              <span style={styles.hintKey}>→</span>
              <span>Navigate</span>
            </div>
            <div style={styles.hintDivider} />
            <div style={styles.hintItem}>
              <span style={styles.hintKey}>F</span>
              <span>Fullscreen</span>
            </div>
            <div style={styles.hintDivider} />
            <div style={styles.hintItem}>
              <span style={styles.hintKey}>1</span>
              <span>–</span>
              <span style={styles.hintKey}>9</span>
              <span>Jump</span>
            </div>
          </div>
        )}

        {needsRotate && !rotateDismissed && (
          <div style={styles.rotateOverlay}>
            <div style={styles.rotateIcon} aria-hidden>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(189,195,246,0.95)' }}>
                <rect x="5" y="2" width="14" height="20" rx="2.5" />
                <path d="M11 18.5h2" />
                <path d="M19 9l3 3-3 3" />
              </svg>
            </div>
            <div style={styles.rotateTitle}>Rotate your phone for the full experience</div>
            <div style={styles.rotateSubtitle}>This deck is built for landscape, the same way it shows on a screen at the meeting.</div>
            <button style={styles.rotateDismiss} onClick={() => setRotateDismissed(true)}>
              View anyway
            </button>
          </div>
        )}
      </div>

      <div style={styles.controls}>
        <div style={{ ...styles.progressBar, width: `${progressPercent}%` }} />

        <div style={styles.leftGroup}>
          {!shared && (
            <button
              style={styles.backBtn}
              onClick={onBack}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.9)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.55)'
              }}
            >
              <span style={{ fontSize: '14px' }}>←</span>
              <span>Back</span>
            </button>
          )}

          <div style={styles.merchantLabel}>
            {data.COMPANY_LOGO ? (
              <img src={data.COMPANY_LOGO} alt={data.COMPANY_NAME} style={styles.merchantLogo} />
            ) : (
              <span style={styles.merchantName}>{data.COMPANY_NAME}</span>
            )}
          </div>
        </div>

        <div style={styles.navGroup}>
          <button
            style={{ ...styles.navBtn, opacity: current === 0 ? 0.3 : 1 }}
            onClick={prev}
            disabled={current === 0}
            onMouseEnter={(e) => {
              if (current !== 0) e.currentTarget.style.background = 'rgba(62,79,224,0.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            }}
          >
            ‹
          </button>

          <div style={styles.dots}>
            {SLIDES.map((_, i) => (
              <div
                key={i}
                style={{
                  ...styles.dot,
                  ...(i === current ? styles.dotActive : {}),
                }}
                onClick={() => goTo(i)}
              />
            ))}
          </div>

          <button
            style={{ ...styles.navBtn, opacity: current === total - 1 ? 0.3 : 1 }}
            onClick={next}
            disabled={current === total - 1}
            onMouseEnter={(e) => {
              if (current !== total - 1) e.currentTarget.style.background = 'rgba(62,79,224,0.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            }}
          >
            ›
          </button>
        </div>

        <div style={styles.rightGroup}>
          <span style={styles.slideCount}>
            {String(current + 1).padStart(2, '0')}
            <span style={styles.slideCountFaded}> / {String(total).padStart(2, '0')}</span>
          </span>
          <button
            style={styles.fullscreenBtn}
            onClick={toggleFullscreen}
            title="Fullscreen (F)"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.9)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
            }}
          >
            {isFullscreen ? '⛶' : '⛶'}
          </button>
        </div>
      </div>
    </div>
  )
}
