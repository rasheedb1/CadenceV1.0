import { useMemo } from 'react'

// SVG halftone dot pattern with optional directional fade (mask).
// Ported from Claude Design handoff (yuno-bdm-ppt-pricing).
export default function HalftoneBg({
  color = '#3E4FE0',
  opacity = 0.5,
  density = 40,
  fadeDir = 'bottom', // 'top' | 'bottom' | 'left' | 'right' | 'radial' | 'none'
  animated = false,
  style = {},
}) {
  const id = useMemo(() => `halftone-${Math.random().toString(36).slice(2, 9)}`, [])
  const fade =
    fadeDir === 'bottom' ? 'linear-gradient(to bottom, #000 0%, transparent 100%)' :
    fadeDir === 'top'    ? 'linear-gradient(to top, #000 0%, transparent 100%)' :
    fadeDir === 'left'   ? 'linear-gradient(to left, #000 0%, transparent 100%)' :
    fadeDir === 'right'  ? 'linear-gradient(to right, #000 0%, transparent 100%)' :
    fadeDir === 'radial' ? 'radial-gradient(circle at center, #000 0%, transparent 80%)' :
    null
  return (
    <div
      className={'halftone-bg' + (animated ? ' halftone-drift' : '')}
      style={{
        opacity,
        WebkitMaskImage: fade || undefined,
        maskImage: fade || undefined,
        ...style,
      }}
    >
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={id} x="0" y="0" width={density} height={density} patternUnits="userSpaceOnUse">
            <circle cx={density / 2} cy={density / 2} r={density * 0.12} fill={color} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
    </div>
  )
}
