// PricingViewer — mini-deck focalizado en pricing (7 slides).
// Reusa la mayor parte del shell de WorkshopViewer pero con una lista
// reducida específica para la propuesta comercial: Cover → CNP → CP →
// Productos incluidos → Add-ons 3DS+Conciliación → NOVA+Concierge → Cierre.
//
// Cada slide root lleva data-slide-root para los primitives (Counter),
// y data-deck-active para que los keyframes anim-in se disparen en cada
// visita de slide (no solo al mount inicial).
import { useState, useEffect, useCallback, useRef } from 'react'

import SlidePricingCover from './slides/SlidePricingCover'
import SlideYunoCost from './slides/SlideYunoCost'
import SlidePricingPOS from './slides/SlidePricingPOS'
import SlideIncludedFeatures from './slides/SlideIncludedFeatures'
import SlideYunoExtras from './slides/SlideYunoExtras'
import SlideNovaConcierge from './slides/SlideNovaConcierge'
import SlideTeam from './slides/SlideTeam'

const BG_FOR = {
  light:           '#FFFFFF',
  lilac:           '#E8EAF5',
  dark:            '#282A30',
  blue:            '#3E4FE0',
  gradient:        '#000000',
  'blue-gradient': '#3E4FE0',
}

const ALL_SLIDES = [
  { Component: SlidePricingCover,    label: 'Portada',                bg: 'gradient' },
  { Component: SlideYunoCost,        label: 'Pricing · Ecommerce',    bg: 'dark' },
  { Component: SlidePricingPOS,      label: 'Pricing · POS',          bg: 'dark' },
  { Component: SlideIncludedFeatures,label: 'Productos incluidos',    bg: 'dark' },
  { Component: SlideYunoExtras,      label: 'Add-ons · 3DS + concil.',bg: 'dark' },
  { Component: SlideNovaConcierge,   label: 'NOVA + Concierge',       bg: 'dark' },
  { Component: SlideTeam,            label: 'Equipo',                 bg: 'light' },
]

const styles = {
  container: {
    width: '100vw', height: '100vh',
    display: 'flex', flexDirection: 'column',
    background: '#000', position: 'relative',
    overflow: 'hidden',
  },
  slideArea: {
    flex: 1, position: 'relative', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  slideStack: {
    width: '1920px', height: '1080px',
    position: 'relative', transformOrigin: 'center center',
    flexShrink: 0, overflow: 'hidden',
  },
  slideWrapper: {
    position: 'absolute', inset: 0,
    transition: 'transform 0.5s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.35s ease-out',
  },
  controls: {
    height: '60px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 28px',
    background: 'rgba(0,0,0,0.85)',
    borderTop: '1px solid rgba(255,255,255,0.05)',
    flexShrink: 0,
    backdropFilter: 'blur(24px)',
    position: 'relative', zIndex: 10,
  },
  progressBar: {
    position: 'absolute', top: 0, left: 0, height: '2px',
    background: 'linear-gradient(90deg, #3E4FE0 0%, #5967E4 50%, #BDC3F6 100%)',
    transition: 'width 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
    boxShadow: '0 0 12px rgba(62,79,224,0.4)',
  },
  leftGroup: { display: 'flex', alignItems: 'center', gap: '16px' },
  clientLabel: { display: 'flex', alignItems: 'center', gap: '10px' },
  clientName: { fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.1px', fontFamily: 'Titillium Web, sans-serif' },
  navGroup: {
    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
    display: 'flex', alignItems: 'center', gap: '16px', zIndex: 1,
  },
  navBtn: {
    width: '36px', height: '36px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px', color: 'rgba(255,255,255,0.8)', fontSize: '18px', cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  rightGroup: { display: 'flex', alignItems: 'center', gap: '12px' },
  slideCount: {
    fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.9)',
    letterSpacing: '0.5px', fontVariantNumeric: 'tabular-nums',
    minWidth: '72px', textAlign: 'center', fontFamily: 'Titillium Web, sans-serif',
  },
  slideCountFaded: { color: 'rgba(255,255,255,0.3)', fontWeight: 400 },
  slideLabel: {
    fontSize: '10.5px', fontWeight: 700, color: 'rgba(255,255,255,0.55)',
    letterSpacing: '1.2px', textTransform: 'uppercase',
    padding: '6px 12px',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: '8px', fontFamily: 'Titillium Web, sans-serif',
  },
  fullscreenBtn: {
    width: '36px', height: '36px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '10px', color: 'rgba(255,255,255,0.6)', fontSize: '14px',
    cursor: 'pointer', transition: 'all 0.15s ease',
  },
  dots: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '4px 8px',
    background: 'rgba(255,255,255,0.03)', borderRadius: '100px',
    border: '1px solid rgba(255,255,255,0.05)',
  },
  dot: {
    width: '6px', height: '6px', borderRadius: '50%',
    background: 'rgba(255,255,255,0.2)', cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  dotActive: {
    width: '20px', borderRadius: '3px',
    background: 'linear-gradient(90deg, #3E4FE0 0%, #5967E4 100%)',
    boxShadow: '0 0 10px rgba(62,79,224,0.5)',
  },
}

export default function PricingViewer({ data, onBack, shared = false }) {
  const SLIDES = ALL_SLIDES
  const initialSlide = (() => {
    if (typeof window === 'undefined') return 0
    const raw = new URLSearchParams(window.location.search).get('slide')
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 1) return Math.min(n, SLIDES.length) - 1
    return 0
  })()
  const [current, setCurrent] = useState(initialSlide)
  const [direction, setDirection] = useState('next')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [stageScale, setStageScale] = useState(1)
  const containerRef = useRef(null)
  const slideAreaRef = useRef(null)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const total = SLIDES.length

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

  const goTo = useCallback((idx) => {
    setCurrent((c) => {
      if (idx === c) return c
      setDirection(idx > c ? 'next' : 'prev')
      return idx
    })
  }, [])
  const next = useCallback(() => {
    setCurrent((c) => {
      const newC = Math.min(c + 1, total - 1)
      if (newC !== c) setDirection('next')
      return newC
    })
  }, [total])
  const prev = useCallback(() => {
    setCurrent((c) => {
      const newC = Math.max(c - 1, 0)
      if (newC !== c) setDirection('prev')
      return newC
    })
  }, [])

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
      const t = e.target
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      if (typing) return
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen() }
      if (e.key === 'Escape') {
        if (document.fullscreenElement) setIsFullscreen(false)
        else onBack && onBack()
      }
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1
        if (idx < total) goTo(idx)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [next, prev, onBack, toggleFullscreen, goTo, total])

  const { Component: SlideComponent, label: slideLabel, bg: slideBgKey } = SLIDES[current]
  const progressPercent = ((current + 1) / total) * 100
  const backdrop = BG_FOR[slideBgKey] || '#06070B'

  const lang = (data && data.LANGUAGE) || 'es'
  const currency = (data && data.CURRENCY) || 'USD'

  return (
    <div ref={containerRef} style={{
      ...styles.container,
      background: backdrop,
      transition: 'background 0.4s ease-out',
    }}>
      <div ref={slideAreaRef} style={styles.slideArea} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div style={{ ...styles.slideStack, background: backdrop, transform: `scale(${stageScale})` }}>
          <div
            key={current}
            data-slide-root
            data-deck-active
            style={{
              ...styles.slideWrapper,
              animation: `${direction === 'next' ? 'slideInRight' : 'slideInLeft'} 0.5s cubic-bezier(0.32, 0.72, 0, 1)`,
            }}
          >
            <SlideComponent data={data} pageNum={current + 1} total={total} shared={shared} lang={lang} currency={currency} />
          </div>
        </div>
      </div>

      <div style={styles.controls}>
        <div style={{ ...styles.progressBar, width: `${progressPercent}%` }} />
        <div style={styles.leftGroup}>
          <div style={styles.clientLabel}>
            <span style={styles.clientName}>{data.CLIENT_NAME}</span>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>×</span>
            <span style={styles.clientName}>yuno</span>
          </div>
        </div>

        <div style={styles.navGroup}>
          <button style={{ ...styles.navBtn, opacity: current === 0 ? 0.3 : 1 }} onClick={prev} disabled={current === 0}>‹</button>
          <div style={styles.dots}>
            {SLIDES.map((_, i) => (
              <div key={i} style={{ ...styles.dot, ...(i === current ? styles.dotActive : {}) }} onClick={() => goTo(i)} />
            ))}
          </div>
          <button style={{ ...styles.navBtn, opacity: current === total - 1 ? 0.3 : 1 }} onClick={next} disabled={current === total - 1}>›</button>
        </div>

        <div style={styles.rightGroup}>
          <span style={styles.slideLabel}>{slideLabel}</span>
          <span style={styles.slideCount}>
            {String(current + 1).padStart(2, '0')}
            <span style={styles.slideCountFaded}> / {String(total).padStart(2, '0')}</span>
          </span>
          <button style={styles.fullscreenBtn} onClick={toggleFullscreen} title="Fullscreen (F)">⛶</button>
        </div>
      </div>
    </div>
  )
}
