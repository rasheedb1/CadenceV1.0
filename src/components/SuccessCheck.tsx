import { motion } from 'motion/react'

/**
 * Micro-animation #8: Animated success checkmark with circle draw + check pop.
 */
interface SuccessCheckProps {
  size?: number
}

export function SuccessCheck({ size = 48 }: SuccessCheckProps) {
  const r = size / 2 - 3
  const circumference = 2 * Math.PI * r

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      initial="hidden"
      animate="visible"
    >
      {/* Circle */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        className="text-green-500"
        strokeDasharray={circumference}
        variants={{
          hidden: { strokeDashoffset: circumference, opacity: 0 },
          visible: {
            strokeDashoffset: 0,
            opacity: 1,
            transition: { duration: 0.6, ease: 'easeOut' },
          },
        }}
      />
      {/* Checkmark */}
      <motion.path
        d={`M${size * 0.28} ${size * 0.5} L${size * 0.44} ${size * 0.65} L${size * 0.72} ${size * 0.35}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-green-500"
        variants={{
          hidden: { pathLength: 0, opacity: 0 },
          visible: {
            pathLength: 1,
            opacity: 1,
            transition: { duration: 0.4, delay: 0.4, ease: 'easeOut' },
          },
        }}
      />
    </motion.svg>
  )
}
