import { motion } from 'motion/react'

/**
 * Micro-animation #7: Skeleton loader with shimmer wave effect.
 */
interface SkeletonPulseProps {
  className?: string
  lines?: number
}

export function SkeletonPulse({ className = '', lines = 3 }: SkeletonPulseProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <motion.div
          key={i}
          className="h-4 rounded-md bg-muted"
          style={{ width: `${85 - i * 15}%` }}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}
