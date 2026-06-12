import { ArrowsSplit, Bank, Plug } from '@phosphor-icons/react'
import SlideBase from './SlideBase'
import BeamRule from '../BeamRule'
import { getCopy } from '../../lib/copy'

// Concept primer: orchestration in plain language. Two big ideas on the
// left ("single API into the whole ecosystem" + "traffic controller for
// every transaction"), an SVG flow diagram on the right that shows the
// bank → orchestrator → many-PSPs fan-out with the three routing
// criteria called out. Designed so a reader who's never seen
// orchestration before walks away with the mental model in one slide.

const CONCEPTS = [
  {
    title: 'Single API into the whole payments ecosystem',
    icon: Plug,
    body: 'The bank makes one connection to the orchestration platform. Every PSP, wallet, scheme, and local rail flows through it. No new contracts to sign per provider.',
    accent: 'one connection',
  },
  {
    title: 'Traffic controller picking the best route per transaction',
    icon: ArrowsSplit,
    body: 'Each transaction routes to the provider most likely to approve it at the lowest cost. Static gateway rules become dynamic decisions on every payment.',
    accent: 'dynamic decisions on every payment',
  },
]

const ROUTING_CRITERIA = [
  { label: 'Cheapest', tone: 'rgba(124,137,239,0.95)' },
  { label: 'Highest approval', tone: 'rgba(189,195,246,0.95)' },
  { label: 'Fastest', tone: 'rgba(124,137,239,0.95)' },
]

const styles = {
  body: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '1fr 1.05fr',
    gap: 'clamp(20px, 1.8vw, 36px)',
    minHeight: 0,
  },
  monoKicker: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(10px, 0.78vw, 13px)',
    fontWeight: 500,
    letterSpacing: '0.4px',
    color: 'rgba(255,255,255,0.42)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: 'clamp(6px, 0.6vw, 10px)',
  },
  monoKickerCaret: { color: 'rgba(124,137,239,0.9)' },
  titleRow: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 'clamp(20px, 2vw, 40px)',
    marginBottom: 'clamp(18px, 1.6vw, 32px)',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(28px, 2.7vw, 52px)',
    fontWeight: 500,
    letterSpacing: '-1.2px',
    lineHeight: 1.1,
    color: '#fff',
    margin: 0,
    maxWidth: '74%',
  },
  titleAccent: {
    backgroundImage: 'linear-gradient(135deg, #5967E4 0%, #BDC3F6 55%, #3E4FE0 100%)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
    fontWeight: 700,
  },
  subtitle: {
    fontSize: 'clamp(14px, 1.05vw, 19px)',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: '0.01em',
    lineHeight: 1.5,
    margin: 0,
    maxWidth: '38%',
    textAlign: 'right',
  },
  conceptColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(14px, 1.2vw, 24px)',
    minHeight: 0,
  },
  card: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(12px, 1vw, 18px)',
    padding: 'clamp(22px, 1.8vw, 36px) clamp(22px, 1.8vw, 32px)',
    background: 'linear-gradient(160deg, rgba(62,79,224,0.07) 0%, rgba(0,0,0,0.55) 100%)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '18px',
    backdropFilter: 'blur(12px)',
    minHeight: 0,
  },
  cardHead: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '12px',
  },
  cardKicker: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(10px, 0.78vw, 13px)',
    fontWeight: 700,
    letterSpacing: '1.6px',
    textTransform: 'uppercase',
    color: 'rgba(124,137,239,0.85)',
  },
  cardIcon: {
    width: 'clamp(32px, 2.4vw, 44px)',
    height: 'clamp(32px, 2.4vw, 44px)',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, rgba(62,79,224,0.18) 0%, rgba(89,103,228,0.08) 100%)',
    border: '1px solid rgba(124,137,239,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(189,195,246,0.95)',
    flexShrink: 0,
  },
  cardTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(22px, 1.75vw, 32px)',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '-0.4px',
    lineHeight: 1.18,
  },
  cardBody: {
    fontSize: 'clamp(14px, 1.12vw, 20px)',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.66)',
    lineHeight: 1.55,
    margin: 0,
  },
  cardBodyAccent: {
    color: '#fff',
    fontWeight: 600,
  },
  // Right column, diagram. Outer frame mimics the diagnosticCard
  // styling so it reads as a sister block to the concept cards.
  diagramFrame: {
    background: 'linear-gradient(135deg, rgba(62,79,224,0.06) 0%, rgba(0,0,0,0.6) 100%)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '18px',
    padding: 'clamp(22px, 1.8vw, 34px)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(14px, 1.2vw, 22px)',
    minHeight: 0,
  },
  diagramHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
  },
  diagramKicker: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(10px, 0.78vw, 13px)',
    fontWeight: 700,
    letterSpacing: '1.6px',
    textTransform: 'uppercase',
    color: 'rgba(124,137,239,0.85)',
  },
  diagramTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(18px, 1.45vw, 26px)',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '-0.3px',
    lineHeight: 1.18,
    marginTop: 'clamp(4px, 0.4vw, 8px)',
  },
  diagramSvg: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 0,
    display: 'block',
  },
  criteriaRow: {
    display: 'flex',
    justifyContent: 'space-around',
    gap: 'clamp(10px, 1vw, 18px)',
    paddingTop: 'clamp(8px, 0.7vw, 14px)',
    borderTop: '1px solid rgba(255,255,255,0.08)',
  },
  criteriaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: 'clamp(12px, 0.95vw, 16px)',
    fontWeight: 600,
    color: '#fff',
    letterSpacing: '0.01em',
  },
  criteriaDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    boxShadow: '0 0 8px currentColor',
  },
}

// Inline SVG flow: bank node at top → orchestrator middle → fan-out to
// 4 PSP-shaped chips. Beam animations live inside the path styles. Pure
// SVG so it scales cleanly inside the diagramFrame.
function OrchestrationFlow() {
  const stroke = 'rgba(124,137,239,0.6)'
  const beamStroke = '#DDE3FB'
  return (
    <svg
      style={styles.diagramSvg}
      viewBox="0 0 400 220"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <filter id="orchBeamGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="orchHubFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5967E4" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#3E4FE0" stopOpacity="0.18" />
        </linearGradient>
        <linearGradient id="orchBankFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3E4FE0" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#1B2150" stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {/* bank box */}
      <rect x="155" y="6" width="90" height="32" rx="8" fill="url(#orchBankFill)" stroke="rgba(124,137,239,0.55)" strokeWidth="1" />
      <text x="200" y="26" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff" style={{ fontFamily: 'var(--font-display)' }}>
        Your Bank
      </text>

      {/* bank → orchestrator vertical line + beam */}
      <line x1="200" y1="38" x2="200" y2="84" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <line x1="200" y1="38" x2="200" y2="84" stroke={beamStroke} strokeWidth="0.7" pathLength="100" strokeDasharray="14 86" filter="url(#orchBeamGlow)" vectorEffect="non-scaling-stroke" strokeLinecap="round">
        <animate attributeName="stroke-dashoffset" from="0" to="-100" dur="3.6s" repeatCount="indefinite" />
      </line>

      {/* orchestrator hub */}
      <rect x="120" y="86" width="160" height="40" rx="10" fill="url(#orchHubFill)" stroke="rgba(124,137,239,0.7)" strokeWidth="1.2" />
      <text x="200" y="104" textAnchor="middle" fontSize="9" fontWeight="700" fill="rgba(189,195,246,0.95)" letterSpacing="2" style={{ fontFamily: 'var(--font-mono)' }}>
        ORCHESTRATION
      </text>
      <text x="200" y="118" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" style={{ fontFamily: 'var(--font-display)' }}>
        One API · One control plane
      </text>

      {/* trunk + drop bus */}
      <line x1="200" y1="126" x2="200" y2="148" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <line x1="60" y1="148" x2="340" y2="148" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx="200" cy="148" r="2.4" fill={stroke} />

      {/* 4 drop lines */}
      {[60, 153, 247, 340].map((x) => (
        <line key={x} x1={x} y1="148" x2={x} y2="170" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}

      {/* 4 PSP chips */}
      {[
        { x: 60, label: 'PSP 1' },
        { x: 153, label: 'PSP 2' },
        { x: 247, label: 'PSP 3' },
        { x: 340, label: 'PSP n' },
      ].map(({ x, label }) => (
        <g key={label}>
          <rect x={x - 28} y="170" width="56" height="26" rx="6" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.18)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <text x={x} y="187" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" style={{ fontFamily: 'var(--font-display)' }}>
            {label}
          </text>
        </g>
      ))}

      {/* beams cascading down each drop */}
      {[60, 153, 247, 340].map((x, i) => (
        <line
          key={`beam-${x}`}
          x1={x}
          y1="148"
          x2={x}
          y2="170"
          stroke={beamStroke}
          strokeWidth="0.7"
          pathLength="100"
          strokeDasharray="12 88"
          filter="url(#orchBeamGlow)"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          fill="none"
        >
          <animate attributeName="stroke-dashoffset" from="0" to="-100" dur="4.4s" begin={`${-i * 1.0}s`} repeatCount="indefinite" />
        </line>
      ))}

      {/* hub → bus beam */}
      <line x1="200" y1="126" x2="200" y2="148" stroke={beamStroke} strokeWidth="0.7" pathLength="100" strokeDasharray="14 86" filter="url(#orchBeamGlow)" vectorEffect="non-scaling-stroke" strokeLinecap="round">
        <animate attributeName="stroke-dashoffset" from="0" to="-100" dur="3.2s" repeatCount="indefinite" />
      </line>
    </svg>
  )
}

export default function SlideWhatIsOrchestration({ data } = {}) {
  const lang = data?.LANGUAGE || 'en'
  return (
    <SlideBase section={getCopy(lang, 'section.market_context')} slideNumber={4}>
      <div style={styles.monoKicker}>
        <span style={styles.monoKickerCaret}>&gt;</span>
        what_is_orchestration
        <BeamRule />
      </div>

      <div style={styles.titleRow}>
        <h2 style={styles.title}>
          One layer above every payment provider,{' '}
          <span style={styles.titleAccent}>chosen for each transaction</span>
        </h2>
        <p style={styles.subtitle}>
          Two ideas in one platform: one connection in, the smartest path out
          on every payment.
        </p>
      </div>

      <div style={styles.body}>
        <div className="stagger" style={{ ...styles.conceptColumn, '--stagger-base': '0.2s', '--stagger-step': '0.14s' }}>
          {CONCEPTS.map((c) => {
            const Icon = c.icon
            // Only inline-bold the accent when it actually appears in
            // the body; otherwise render the body untouched so the
            // accent text doesn't get tacked on at the end.
            const hasAccent = c.accent && c.body.includes(c.accent)
            const parts = hasAccent ? c.body.split(c.accent) : [c.body]
            return (
              <div key={c.title} className="border-beam" style={{ ...styles.card, '--beam-duration': '24s' }}>
                <div style={styles.cardHead}>
                  <span style={styles.cardIcon}>
                    <Icon size="60%" weight="regular" aria-hidden />
                  </span>
                </div>
                <div style={styles.cardTitle}>{c.title}</div>
                <p style={styles.cardBody}>
                  {parts[0]}
                  {hasAccent && <span style={styles.cardBodyAccent}>{c.accent}</span>}
                  {hasAccent && parts[1]}
                </p>
              </div>
            )
          })}
        </div>

        <div className="reveal border-beam" style={{ ...styles.diagramFrame, '--beam-duration': '24s', '--reveal-delay': '0.35s' }}>
          <div style={styles.diagramHead}>
            <div>
              <div style={styles.diagramKicker}>Transaction flow</div>
              <div style={styles.diagramTitle}>Many providers, one decision</div>
            </div>
            <Bank size={22} weight="regular" color="rgba(124,137,239,0.9)" aria-hidden />
          </div>

          <OrchestrationFlow />

          <div style={styles.criteriaRow}>
            {ROUTING_CRITERIA.map((c) => (
              <div key={c.label} style={styles.criteriaItem}>
                <span style={{ ...styles.criteriaDot, background: c.tone, color: c.tone }} />
                {c.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </SlideBase>
  )
}
