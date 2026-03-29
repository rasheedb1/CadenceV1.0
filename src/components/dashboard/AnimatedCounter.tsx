import { useEffect, useState } from 'react'
import { motion, useSpring, useTransform } from 'motion/react'

/**
 * Micro-animation #3: Animated number counter that rolls up from 0.
 */
interface AnimatedCounterProps {
  value: number
  duration?: number
  className?: string
}

export function AnimatedCounter({ value, duration = 1.2, className }: AnimatedCounterProps) {
  const spring = useSpring(0, { duration: duration * 1000 })
  const display = useTransform(spring, (v) => Math.round(v))
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    spring.set(value)
  }, [spring, value])

  useEffect(() => {
    const unsub = display.on('change', (v) => setDisplayValue(v))
    return unsub
  }, [display])

  return (
    <motion.span className={className}>
      {displayValue}
    </motion.span>
  )
}
