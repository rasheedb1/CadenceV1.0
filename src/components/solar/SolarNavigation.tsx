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

const ORBIT_RADII = [140, 230, 310]
const ORBIT_DURATIONS = [90, 120, 160] // seconds

const PLANETS: Planet[] = [
  // Orbit 0 — core apps
  { id: 'outreach', label: 'Outreach', icon: '🚀', href: '/dashboard', color: '#6366F1', glow: 'rgba(99,102,241,0.4)', size: 64, orbit: 0, startAngle: 0, description: 'Cadencias, prospectos y ventas' },
  { id: 'agents', label: 'Agentes IA', icon: '🤖', href: '/agents', color: '#A855F7', glow: 'rgba(168,85,247,0.4)', size: 64, orbit: 0, startAngle: 120, description: 'Crea y gestiona agentes autónomos' },
  { id: 'mission-control', label: 'Control de Misión', icon: '🛰️', href: '/mission-control', color: '#10B981', glow: 'rgba(16,185,129,0.4)', size: 64, orbit: 0, startAngle: 240, description: 'Actividad en tiempo real' },
  // Orbit 1 — tools
  { id: 'leads', label: 'Leads', icon: '👥', href: '/leads', color: '#F59E0B', glow: 'rgba(245,158,11,0.35)', size: 52, orbit: 1, startAngle: 30, description: 'Pipeline y gestión de leads' },
  { id: 'research', label: 'Investigación', icon: '🔍', href: '/company-research', color: '#06B6D4', glow: 'rgba(6,182,212,0.35)', size: 52, orbit: 1, startAngle: 102, description: 'Research de empresas' },
  { id: 'cadences', label: 'Cadencias', icon: '🔄', href: '/cadences', color: '#EC4899', glow: 'rgba(236,72,153,0.35)', size: 52, orbit: 1, startAngle: 174, description: 'Secuencias automatizadas' },
  { id: 'business-cases', label: 'Business Cases', icon: '💼', href: '/business-cases', color: '#8B5CF6', glow: 'rgba(139,92,246,0.35)', size: 52, orbit: 1, startAngle: 246, description: 'Propuestas de valor' },
  { id: 'inbox', label: 'Inbox', icon: '💬', href: '/inbox', color: '#14B8A6', glow: 'rgba(20,184,166,0.35)', size: 52, orbit: 1, startAngle: 318, description: 'Bandeja de LinkedIn' },
  // Orbit 2 — config
  { id: 'settings', label: 'Configuración', icon: '⚙️', href: '/settings', color: '#64748B', glow: 'rgba(100,116,139,0.3)', size: 42, orbit: 2, startAngle: 60, description: 'Ajustes de cuenta' },
  { id: 'templates', label: 'Templates', icon: '📝', href: '/templates', color: '#78716C', glow: 'rgba(120,113,108,0.3)', size: 42, orbit: 2, startAngle: 180, description: 'Plantillas de mensajes' },
  { id: 'prompts', label: 'AI Prompts', icon: '🧠', href: '/ai-prompts', color: '#7C3AED', glow: 'rgba(124,58,237,0.3)', size: 42, orbit: 2, startAngle: 300, description: 'Prompts personalizados' },
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

  const viewSize = ORBIT_RADII[2] * 2 + 100
  const center = viewSize / 2

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

      {/* ── Stars (decorative dots) ──────────────────────────────────── */}
      {Array.from({ length: 30 }).map((_, i) => {
        const sx = Math.random() * viewSize
        const sy = Math.random() * viewSize
        const ss = 1 + Math.random() * 2
        return (
          <motion.div
            key={`star-${i}`}
            className="absolute rounded-full bg-foreground/10 pointer-events-none"
            style={{ width: ss, height: ss, left: sx, top: sy }}
            animate={{ opacity: [0.15, 0.5, 0.15] }}
            transition={{ duration: 2 + Math.random() * 3, repeat: Infinity, delay: Math.random() * 2 }}
          />
        )
      })}

      {/* ── Sun ──────────────────────────────────────────────────────── */}
      <motion.button
        className="absolute z-20 flex items-center justify-center border-0 bg-transparent p-0 cursor-pointer"
        style={{ width: 88, height: 88, left: center - 44, top: center - 44 }}
        variants={sunVariants}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => navigate('/dashboard')}
        aria-label="Chief — Ir al dashboard"
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
          className="relative flex h-full w-full items-center justify-center rounded-full text-white font-heading font-bold text-2xl"
          style={{
            background: 'linear-gradient(135deg, #4338CA, #6366F1, #818CF8)',
            boxShadow: '0 0 30px rgba(99,102,241,0.5), 0 0 60px rgba(99,102,241,0.2)',
          }}
        >
          C
        </div>
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
