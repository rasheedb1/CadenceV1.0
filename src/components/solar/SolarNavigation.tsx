import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, type Variants } from 'motion/react'
import { useAgents } from '@/contexts/AgentContext'

/* ── Types ──────────────────────────────────────────────────────────────── */

interface Planet {
  id: string
  label: string
  icon: string
  href: string
  color: string
  glow: string
  size: number
  orbit: number       // 0, 1, or 2
  startAngle: number  // degrees
  description: string
}

/* ── Data ───────────────────────────────────────────────────────────────── */

const ORBIT_RADII = [200]
const ORBIT_DURATIONS = [120] // seconds

const PLANETS: Planet[] = [
  { id: 'outreach', label: 'Chief Outreach', icon: '🚀', href: '/dashboard', color: '#6366F1', glow: 'rgba(99,102,241,0.5)', size: 76, orbit: 0, startAngle: 270, description: 'Ventas, cadencias, leads, templates, inbox' },
  { id: 'account-exec', label: 'Account Executive', icon: '🎯', href: '/account-executive', color: '#E11D48', glow: 'rgba(225,29,72,0.5)', size: 76, orbit: 0, startAngle: 30, description: 'Gestión de cuentas y calendario' },
  { id: 'agents', label: 'Agentes IA', icon: '🤖', href: '/agents', color: '#A855F7', glow: 'rgba(168,85,247,0.5)', size: 76, orbit: 0, startAngle: 150, description: 'Configura agentes y ve su actividad en vivo' },
  { id: 'presentaciones', label: 'Presentaciones', icon: '📊', href: '/presentaciones', color: '#0891B2', glow: 'rgba(6,182,212,0.5)', size: 76, orbit: 0, startAngle: 330, description: 'Business case decks generados por Chief, compartibles por URL pública' },
]

/* ── Variants ───────────────────────────────────────────────────────────── */

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.25 } },
}

const planetVariants: Variants = {
  hidden: { opacity: 0, scale: 0 },
  visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 20 } },
}

const sunVariants: Variants = {
  hidden: { opacity: 0, scale: 0 },
  visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 200, damping: 15, delay: 0.1 } },
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function SolarNavigation() {
  const navigate = useNavigate()
  const { agents } = useAgents()
  const activeAgents = agents.filter(a => a.status === 'active').length

  const viewSize = ORBIT_RADII[ORBIT_RADII.length - 1] * 2 + 140
  const center = viewSize / 2

  // Stable star positions — computed once via seeded PRNG so they don't shuffle on re-render
  const stars = useMemo(() => {
    let seed = 42
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    return Array.from({ length: 30 }, () => ({
      x: rand() * viewSize,
      y: rand() * viewSize,
      size: 1 + rand() * 2,
      duration: 2 + rand() * 3,
      delay: rand() * 2,
    }))
  }, [viewSize])

  return (
    <motion.div
      className="relative mx-auto"
      style={{ width: viewSize, height: viewSize, maxWidth: '100%', aspectRatio: '1' }}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Orbit rings ──────────────────────────────────────────────── */}
      {ORBIT_RADII.map((r, i) => (
        <motion.div
          key={`orbit-${i}`}
          className="absolute rounded-full border border-border/20 pointer-events-none"
          style={{ width: r * 2, height: r * 2, left: center - r, top: center - r }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 + i * 0.1, duration: 0.5 }}
        />
      ))}

      {/* ── Stars (decorative dots — stable positions) ───────────────── */}
      {stars.map((star, i) => (
        <motion.div
          key={`star-${i}`}
          className="absolute rounded-full bg-foreground/10 pointer-events-none"
          style={{ width: star.size, height: star.size, left: star.x, top: star.y }}
          animate={{ opacity: [0.15, 0.5, 0.15] }}
          transition={{ duration: star.duration, repeat: Infinity, delay: star.delay }}
        />
      ))}

      {/* ── Sun (Chief) ──────────────────────────────────────────────── */}
      <motion.button
        className="absolute z-20 flex items-center justify-center border-0 bg-transparent p-0 cursor-pointer"
        style={{ width: 100, height: 100, left: center - 50, top: center - 50 }}
        variants={sunVariants}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => navigate('/dashboard')}
        aria-label="Chief"
      >
        {/* Pulse */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Body */}
        <div
          className="relative flex h-full w-full items-center justify-center rounded-full text-white font-heading font-bold text-3xl"
          style={{
            background: 'linear-gradient(135deg, #4338CA, #6366F1, #818CF8)',
            boxShadow: '0 0 30px rgba(99,102,241,0.5), 0 0 60px rgba(99,102,241,0.2)',
          }}
        >
          C
        </div>

        {/* Active agents badge — shown on the sun */}
        {activeAgents > 0 && (
          <motion.span
            className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-green-500 px-1.5 text-xs font-bold text-white z-30"
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {activeAgents}
          </motion.span>
        )}
      </motion.button>

      {/* ── Orbit containers (rotate) with Planets ───────────────────── */}
      {ORBIT_RADII.map((r, orbitIdx) => {
        const planetsInOrbit = PLANETS.filter(p => p.orbit === orbitIdx)
        const duration = ORBIT_DURATIONS[orbitIdx]

        return (
          <motion.div
            key={`orbit-group-${orbitIdx}`}
            className="absolute pointer-events-none solar-orbit"
            style={{
              width: r * 2,
              height: r * 2,
              left: center - r,
              top: center - r,
              '--orbit-duration': `${duration}s`,
            } as React.CSSProperties}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 + orbitIdx * 0.15 }}
          >
            {planetsInOrbit.map((planet) => {
              const angle = (planet.startAngle * Math.PI) / 180
              // Position relative to the orbit container's center
              const px = r + r * Math.cos(angle) - planet.size / 2
              const py = r + r * Math.sin(angle) - planet.size / 2

              return (
                <motion.div
                  key={planet.id}
                  className="absolute z-10 group pointer-events-auto"
                  style={{ width: planet.size, height: planet.size, left: px, top: py }}
                  variants={planetVariants}
                >
                  {/* Counter-rotate wrapper so content stays upright */}
                  <div
                    className="solar-counter-rotate h-full w-full"
                    style={{ '--orbit-duration': `${duration}s` } as React.CSSProperties}
                  >
                    <motion.button
                      className="relative flex h-full w-full items-center justify-center rounded-full cursor-pointer border-0 p-0"
                      style={{
                        background: `linear-gradient(135deg, ${planet.color}, ${planet.color}cc)`,
                        boxShadow: `0 0 12px ${planet.glow}`,
                      }}
                      whileHover={{ scale: 1.2, boxShadow: `0 0 25px ${planet.glow}, 0 0 50px ${planet.glow}` }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => navigate(planet.href)}
                      aria-label={planet.label}
                    >
                      <span className="select-none" style={{ fontSize: planet.size * 0.4 }}>
                        {planet.icon}
                      </span>

                      {/* Agent count badge */}
                      {planet.id === 'agents' && activeAgents > 0 && (
                        <motion.span
                          className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-bold text-white"
                          animate={{ scale: [1, 1.15, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          {activeAgents}
                        </motion.span>
                      )}
                    </motion.button>

                    {/* Tooltip */}
                    <div
                      className="pointer-events-none absolute left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30"
                      style={{ top: planet.size + 8 }}
                    >
                      <div className="whitespace-nowrap rounded-lg bg-popover px-3 py-2 text-sm shadow-lg border border-border">
                        <div className="font-heading font-semibold text-popover-foreground">{planet.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 max-w-[180px] whitespace-normal">{planet.description}</div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )
      })}
    </motion.div>
  )
}
