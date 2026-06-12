import { useEffect, useRef, useState } from 'react'

// Animates a number from `start` -> `value` when the parent slide becomes
// active (via data-deck-active attribute). MutationObserver watches the
// containing slide so the count restarts on each slide visit.
export default function Counter({
  value,
  duration = 1200,
  format = (v) => v,
  prefix = '',
  suffix = '',
  start = 0,
  delay = 0,
}) {
  const [display, setDisplay] = useState(start)
  const spanRef = useRef(null)
  const hasAnimated = useRef(false)

  useEffect(() => {
    const tick = () => {
      if (!spanRef.current) return
      const slide = spanRef.current.closest('[data-slide-root]')
      if (slide && slide.hasAttribute('data-deck-active') && !hasAnimated.current) {
        hasAnimated.current = true
        setTimeout(() => {
          const startT = performance.now()
          const step = (t) => {
            const p = Math.min(1, (t - startT) / duration)
            const eased = 1 - Math.pow(1 - p, 3)
            setDisplay(start + (value - start) * eased)
            if (p < 1) requestAnimationFrame(step)
            else setDisplay(value)
          }
          requestAnimationFrame(step)
        }, delay)
      } else if (slide && !slide.hasAttribute('data-deck-active')) {
        hasAnimated.current = false
        setDisplay(start)
      }
    }
    tick()
    const slide = spanRef.current?.closest('[data-slide-root]')
    if (!slide) return
    const obs = new MutationObserver(tick)
    obs.observe(slide, { attributes: true, attributeFilter: ['data-deck-active'] })
    return () => obs.disconnect()
  }, [value, duration, start, delay])

  return (
    <span ref={spanRef}>
      {prefix}{format(display)}{suffix}
    </span>
  )
}
