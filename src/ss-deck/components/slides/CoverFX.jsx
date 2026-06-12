import { useEffect, useRef } from 'react'

// High-end cover slide FX:
//   - ParticlesField: ~50 ambient particles across the full cover, 3 parallax
//     layers, Canvas 2D + requestAnimationFrame.
//   - GlobeHalo: glow stack + SVG orbital rings, centered on the globe.
//
// Motion is disabled when prefers-reduced-motion is set (static particles,
// static rings).

const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// ---------- ParticlesField ----------
// Full-cover ambient dust. Three parallax layers, wrap-around at edges.
function ParticlesField({ count = 50 }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0, h = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      w = rect.width; h = rect.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    // 3 parallax layers: near / mid / far. Near ones are bigger, brighter,
    // faster; far ones are tiny, dim, slow.
    const layers = [
      { share: 0.20, size: [2.0, 2.8], op: 0.16, vel: 14 },
      { share: 0.40, size: [1.1, 1.7], op: 0.09, vel: 10 },
      { share: 0.40, size: [0.5, 0.9], op: 0.05, vel: 5  },
    ]
    const particles = []
    for (const L of layers) {
      const n = Math.round(count * L.share)
      for (let i = 0; i < n; i++) {
        const [minS, maxS] = L.size
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: minS + Math.random() * (maxS - minS),
          op: L.op * (0.7 + Math.random() * 0.3),
          vx: (Math.random() - 0.5) * L.vel / 60,
          vy: (Math.random() - 0.5) * L.vel / 60 * 0.4,
        })
      }
    }

    const still = reducedMotion()
    let raf
    const frame = () => {
      ctx.clearRect(0, 0, w, h)
      for (const p of particles) {
        if (!still) {
          p.x += p.vx
          p.y += p.vy
          if (p.x > w + 4) p.x = -4
          else if (p.x < -4) p.x = w + 4
          if (p.y > h + 4) p.y = -4
          else if (p.y < -4) p.y = h + 4
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${p.op})`
        ctx.fill()
      }
      if (!still) raf = requestAnimationFrame(frame)
    }
    frame()

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [count])

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}

// ---------- GlobeHalo ----------
// A bounding container perfectly mirroring the globe's position/size, so all
// children (glows, rings) are automatically aligned to the globe center via
// `top/left: 50%; transform: translate(-50%,-50%)`.
//
// The globe <img> is passed in as `children` so it renders in the same layer
// stack and can't drift apart from the halo.
export function GlobeHalo({ children }) {
  const container = {
    position: 'absolute',
    top: '-14%',
    right: '-10%',
    width: '62vw',
    height: '62vw',
    pointerEvents: 'none',
  }

  // Glows stacked back-to-front, each centered on the globe center.
  const outerGlow = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '165%',
    height: '165%',
    transform: 'translate(-50%, -50%)',
    background:
      'radial-gradient(closest-side, rgba(62,79,224,0.28) 0%, rgba(23,38,166,0.14) 40%, transparent 72%)',
    filter: 'blur(140px)',
    pointerEvents: 'none',
    zIndex: 0,
  }
  const innerGlow = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '82%',
    height: '82%',
    transform: 'translate(-50%, -50%)',
    background:
      'radial-gradient(closest-side, rgba(62,79,224,0.55) 0%, rgba(62,79,224,0.22) 40%, transparent 75%)',
    filter: 'blur(48px)',
    mixBlendMode: 'screen',
    pointerEvents: 'none',
    zIndex: 1,
  }

  // Orbital rings — SVG overflowing the container so the outer ring
  // fits. Wrapper opacity knocks the stack down so it reads as ambient
  // atmosphere instead of competing with the title text. Wrapper sized
  // tighter than before so the outermost ring doesn't crowd the cover
  // title on the left.
  const ringsWrap = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '145%',
    height: '145%',
    transform: 'translate(-50%, -50%)',
    overflow: 'visible',
    pointerEvents: 'none',
    zIndex: 2,
    opacity: 0.55,
  }

  return (
    <div style={container} aria-hidden>
      <div style={outerGlow} />
      <div style={innerGlow} />

      <svg style={ringsWrap} viewBox="0 0 200 200">
        <defs>
          {/* Wide, soft gradient that peaks around 40% offset and fades
              smoothly on both sides. Applied to a full-circle stroke
              that's then rotated via CSS so the brightest arc sweeps
              around the orbit — no sharp dashed "comet" overlay, just
              a gentle shimmer that rides the ring itself. */}
          <linearGradient id="cover-ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#BDC3F6" stopOpacity="0"    />
            <stop offset="20%"  stopColor="#BDC3F6" stopOpacity="0.18" />
            <stop offset="45%"  stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="70%"  stopColor="#BDC3F6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#BDC3F6" stopOpacity="0"    />
          </linearGradient>
        </defs>
        {/* Ring 1 — innermost, 14s period. The rotating gradient on the
            ring itself creates a soft light arc that travels along the
            orbit without any hard dashed accent. */}
        <g style={{ transformOrigin: '100px 100px', animation: 'coverRingSpin1 14s linear infinite' }}>
          <circle cx="100" cy="100" r="58" fill="none"
            stroke="url(#cover-ring-grad)" strokeWidth="0.7" strokeLinecap="round" />
        </g>
        {/* Ring 2 — mid, 18s reverse. */}
        <g style={{ transformOrigin: '100px 100px', animation: 'coverRingSpin2 18s linear infinite reverse' }}>
          <circle cx="100" cy="100" r="72" fill="none"
            stroke="url(#cover-ring-grad)" strokeWidth="0.6" strokeLinecap="round" />
        </g>
        {/* Ring 3 — outermost, 26s. Tighter radius so it stays clear
            of the cover title on the left half of the slide. */}
        <g style={{ transformOrigin: '100px 100px', animation: 'coverRingSpin3 26s linear infinite' }}>
          <circle cx="100" cy="100" r="86" fill="none"
            stroke="url(#cover-ring-grad)" strokeWidth="0.55" strokeOpacity="0.7" strokeLinecap="round" />
        </g>
      </svg>

      {children}
    </div>
  )
}

export function CoverParticles() {
  return <ParticlesField count={28} />
}
