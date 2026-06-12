// Ambient orbs rendered once inside the 1920x1080 stage so they're part of
// the slide canvas and scale identically in preview and fullscreen. Three
// orbs (brand indigo + adjacent violet + cyan accent), screen-blended, with
// translate+scale loops at offset phases. Blur lives on the wrapper per
// Chrome's guidance so only the wrapper gets a repaint layer.
const ORBS = [
  { color: '#3E4FE0', size: 1250, top: '-25%', left: '-20%', dur: 44, delay: 0,   opacity: 0.65 },
  { color: '#6B5BFF', size: 1450, top: '35%',  left: '60%',  dur: 58, delay: -22, opacity: 0.55 },
  { color: '#38ADFF', size: 820,  top: '12%',  left: '48%',  dur: 38, delay: -11, opacity: 0.28 },
]

const styles = {
  wrap: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: 0,
    filter: 'blur(110px)',
    willChange: 'transform',
  },
  orb: {
    position: 'absolute',
    borderRadius: '50%',
    mixBlendMode: 'screen',
    animationName: 'ambientOrbDrift',
    animationTimingFunction: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)',
    animationIterationCount: 'infinite',
    willChange: 'transform',
  },
}

export default function OrbBackground() {
  return (
    <div aria-hidden style={styles.wrap}>
      {ORBS.map((o, i) => (
        <div
          key={i}
          style={{
            ...styles.orb,
            width: `${o.size}px`,
            height: `${o.size}px`,
            top: o.top,
            left: o.left,
            opacity: o.opacity,
            background: `radial-gradient(circle at 50% 50%, ${o.color} 0%, ${o.color}00 65%)`,
            animationDuration: `${o.dur}s`,
            animationDelay: `${o.delay}s`,
            ['--orb-scale']: o.scale,
          }}
        />
      ))}
    </div>
  )
}
