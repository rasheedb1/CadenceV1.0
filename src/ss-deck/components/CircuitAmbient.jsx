// Subtle ambient circuit overlay used behind the content slides (Diagnostic
// through Leadership). A handful of thin PCB-style traces sit near the stage
// corners; each one fires a short glowing dash every ~10–15 s so the slides
// feel alive without pulling focus. Matches the YunoSolve circuit beam
// language but far dimmer / slower.
//
// Rendered at stage scale (viewBox 1920×1080, preserveAspectRatio slice),
// so stroke widths and glow sizes stay consistent with the rest of the
// deck regardless of viewport size.

const TRACES = [
  { d: 'M 80 140 L 80 320 L 340 320', dur: 13 },
  { d: 'M 1840 120 L 1840 300 L 1580 300', dur: 15 },
  { d: 'M 60 920 L 300 920 L 300 760', dur: 12 },
  { d: 'M 1860 940 L 1620 940 L 1620 780', dur: 14 },
  { d: 'M 960 40 L 960 160', dur: 11 },
]

const overlayStyle = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  zIndex: 0,
}

export default function CircuitAmbient() {
  return (
    <svg
      style={overlayStyle}
      viewBox="0 0 1920 1080"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <filter id="ambientCircuitGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {TRACES.map((t, i) => {
        const begin = -((i * 2.4) % t.dur)
        return (
          <g key={i}>
            <path
              d={t.d}
              fill="none"
              stroke="rgba(124,137,239,0.07)"
              strokeWidth="1"
              strokeLinecap="round"
            />
            <path
              d={t.d}
              pathLength="100"
              fill="none"
              stroke="rgba(221,227,251,0.55)"
              strokeWidth="1"
              strokeLinecap="round"
              strokeDasharray="6 94"
              filter="url(#ambientCircuitGlow)"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="0"
                to="-100"
                dur={`${t.dur}s`}
                begin={`${begin}s`}
                repeatCount="indefinite"
              />
            </path>
          </g>
        )
      })}
    </svg>
  )
}
