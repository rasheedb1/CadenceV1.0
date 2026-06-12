import { Cpu, Lightning, Stack } from '@phosphor-icons/react'
import SlideBase from './SlideBase'
import BeamRule from '../BeamRule'
import { getCopy } from '../../lib/copy'

// Banking-mode era timeline: three eras of payments infrastructure,
// laid out as discrete chips per era so each step in the progression
// reads as its own beat. Each column stacks four pieces:
//   1. Header chip, kicker, dates, era name (and "We are here" pill on
//      the active era).
//   2. Key Features label.
//   3. A vertical stack of feature chips, one per bullet.
//   4. Customer behaviour panel, slightly heavier block at the bottom.
// Animation cascades left → right across columns and top → bottom inside
// each column, so the reader's eye is led through the timeline.

const ERAS = [
  {
    kicker: '01 · Mainframe',
    range: '1980 – 2005',
    name: 'Mainframe era',
    icon: Stack,
    features: [
      'Infrastructure built for banks, not merchants',
      'Limited APIs and slow integrations',
      'High reliability, low adaptability',
    ],
    customer: 'In-store card usage. Consumer expectations centred on reliability, not speed or UX.',
    current: false,
  },
  {
    kicker: '02 · Full-stack PSP',
    range: '2005 – 2020',
    name: 'Full-stack PSP era',
    icon: Lightning,
    features: [
      'Single integration for global payment methods',
      'Tokenization, fraud tools, routing optimization',
      'PSPs aggregate acquiring; expansion simplifies for merchants',
    ],
    customer: 'E-commerce and mobile. Expectations rise around frictionless checkout and method choice.',
    current: false,
  },
  {
    kicker: '03 · Orchestration',
    range: '2020 – present',
    name: 'Orchestration era',
    icon: Cpu,
    features: [
      'Merchant-controlled multi-acquirer setups',
      'Intelligent routing across acquirers and processors',
      'Improved resilience, cost efficiency, and approval rates',
      'Direct merchant-to-core-infrastructure relationship',
    ],
    customer: 'Near-instant, fail-proof payments. Multi-device, omnichannel, global shopping patterns.',
    current: true,
  },
]

const styles = {
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    gap: 'clamp(16px, 1.5vw, 28px)',
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
    marginBottom: 'clamp(14px, 1.4vw, 28px)',
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
    fontSize: 'clamp(15px, 1.15vw, 21px)',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: '0.01em',
    lineHeight: 1.5,
    margin: 0,
    maxWidth: '36%',
    textAlign: 'right',
  },
  columnRow: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'clamp(14px, 1.3vw, 26px)',
    minHeight: 0,
  },
  column: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(10px, 0.85vw, 16px)',
    minHeight: 0,
    opacity: 0.7,
  },
  columnCurrent: {
    opacity: 1,
  },
  // Header chip, era kicker, dates, and big era name. Sits at the top
  // of each column.
  headerChip: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(6px, 0.5vw, 10px)',
    padding: 'clamp(18px, 1.5vw, 28px) clamp(20px, 1.7vw, 30px)',
    background: 'linear-gradient(160deg, rgba(62,79,224,0.08) 0%, rgba(0,0,0,0.55) 100%)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px',
    backdropFilter: 'blur(10px)',
  },
  headerChipCurrent: {
    background: 'linear-gradient(160deg, rgba(62,79,224,0.2) 0%, rgba(0,0,0,0.55) 100%)',
    border: '1px solid rgba(124,137,239,0.5)',
    boxShadow: '0 0 40px rgba(62,79,224,0.25), inset 0 0 60px rgba(62,79,224,0.06)',
  },
  headerHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  headerKicker: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(12px, 0.95vw, 16px)',
    fontWeight: 700,
    letterSpacing: '1.8px',
    textTransform: 'uppercase',
    color: 'rgba(124,137,239,0.95)',
  },
  headerIcon: {
    width: 'clamp(34px, 2.5vw, 46px)',
    height: 'clamp(34px, 2.5vw, 46px)',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, rgba(62,79,224,0.18) 0%, rgba(89,103,228,0.08) 100%)',
    border: '1px solid rgba(124,137,239,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(189,195,246,0.95)',
    flexShrink: 0,
  },
  headerRange: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(13px, 1.02vw, 17px)',
    fontWeight: 500,
    letterSpacing: '0.5px',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 'clamp(4px, 0.4vw, 8px)',
  },
  headerName: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(24px, 2vw, 38px)',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '-0.6px',
    lineHeight: 1.1,
  },
  headerNameAccent: {
    backgroundImage: 'linear-gradient(135deg, #BDC3F6 0%, #5967E4 100%)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  },
  livePill: {
    position: 'absolute',
    top: 'clamp(14px, 1.2vw, 22px)',
    right: 'clamp(14px, 1.2vw, 22px)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    padding: 'clamp(5px, 0.45vw, 9px) clamp(11px, 0.95vw, 16px)',
    background: 'rgba(74,222,128,0.1)',
    border: '1px solid rgba(74,222,128,0.3)',
    borderRadius: '100px',
    fontSize: 'clamp(10px, 0.8vw, 13px)',
    fontWeight: 700,
    letterSpacing: '1.4px',
    textTransform: 'uppercase',
    color: '#4ade80',
    zIndex: 2,
  },
  liveDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#4ade80',
    boxShadow: '0 0 8px rgba(74,222,128,0.7)',
    animation: 'pulse 2s infinite',
  },
  // Section label between header chip and feature chips.
  sectionLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(11px, 0.85vw, 14px)',
    fontWeight: 700,
    letterSpacing: '1.8px',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    paddingLeft: 'clamp(4px, 0.4vw, 8px)',
    marginTop: 'clamp(4px, 0.4vw, 8px)',
  },
  // Vertical stack of one-line feature chips.
  featuresStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(7px, 0.6vw, 12px)',
  },
  featureChip: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'clamp(10px, 0.8vw, 14px)',
    padding: 'clamp(12px, 1vw, 18px) clamp(16px, 1.3vw, 22px)',
    background: 'linear-gradient(160deg, rgba(255,255,255,0.025) 0%, rgba(0,0,0,0.4) 100%)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '10px',
    fontSize: 'clamp(15px, 1.18vw, 21px)',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 1.4,
  },
  featureChipCurrent: {
    background: 'linear-gradient(160deg, rgba(62,79,224,0.1) 0%, rgba(0,0,0,0.4) 100%)',
    border: '1px solid rgba(124,137,239,0.28)',
    color: '#fff',
  },
  featureBullet: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'rgba(124,137,239,0.7)',
    flexShrink: 0,
    marginTop: '9px',
  },
  featureBulletCurrent: {
    background: 'rgba(189,195,246,1)',
    boxShadow: '0 0 8px rgba(124,137,239,0.7)',
  },
  // Customer-behaviour box, bigger panel that anchors the column.
  customerBox: {
    marginTop: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(8px, 0.7vw, 12px)',
    padding: 'clamp(18px, 1.5vw, 28px) clamp(20px, 1.7vw, 30px)',
    background: 'linear-gradient(160deg, rgba(62,79,224,0.06) 0%, rgba(0,0,0,0.55) 100%)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px',
    backdropFilter: 'blur(10px)',
  },
  customerBoxCurrent: {
    background: 'linear-gradient(160deg, rgba(62,79,224,0.14) 0%, rgba(0,0,0,0.55) 100%)',
    border: '1px solid rgba(124,137,239,0.32)',
  },
  customerLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(11px, 0.85vw, 14px)',
    fontWeight: 700,
    letterSpacing: '1.8px',
    textTransform: 'uppercase',
    color: 'rgba(124,137,239,0.85)',
  },
  customerCopy: {
    fontSize: 'clamp(15px, 1.18vw, 21px)',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 1.5,
    margin: 0,
    fontStyle: 'italic',
  },
}

export default function SlideOrchestrationEra({ data } = {}) {
  const lang = data?.LANGUAGE || 'en'
  return (
    <SlideBase section={getCopy(lang, 'section.market_context')} slideNumber={3}>
      <div style={styles.monoKicker}>
        <span style={styles.monoKickerCaret}>&gt;</span>
        market_stage
        <BeamRule />
      </div>

      <div style={styles.titleRow}>
        <h2 style={styles.title}>
          Payments has entered the{' '}
          <span style={styles.titleAccent}>orchestration era</span>
        </h2>
        <p style={styles.subtitle}>
          Each phase changed who owns the merchant relationship. The bank that
          masters this one keeps it.
        </p>
      </div>

      <div style={styles.columnRow}>
        {ERAS.map((era, eraIdx) => {
          const Icon = era.icon
          // Per-column cascade: each column starts a beat after the
          // previous one (0.18s offset), and items inside step every
          // 0.1s. Reads as a left-to-right sweep with each column
          // unfolding top-down.
          const colBase = 0.18 + eraIdx * 0.22
          const itemDelay = (i) => `${colBase + i * 0.1}s`
          return (
            <div
              key={era.name}
              style={{ ...styles.column, ...(era.current ? styles.columnCurrent : {}) }}
            >
              <div
                className="reveal"
                style={{
                  ...styles.headerChip,
                  ...(era.current ? styles.headerChipCurrent : {}),
                  '--reveal-delay': itemDelay(0),
                }}
              >
                {era.current && (
                  <span style={styles.livePill}>
                    <span style={styles.liveDot} />
                    We are here
                  </span>
                )}
                <div style={styles.headerHead}>
                  <span style={styles.headerKicker}>{era.kicker}</span>
                  {!era.current && (
                    <span style={styles.headerIcon}>
                      <Icon size="60%" weight="regular" aria-hidden />
                    </span>
                  )}
                </div>
                <div style={styles.headerRange}>{era.range}</div>
                <div style={{ ...styles.headerName, ...(era.current ? styles.headerNameAccent : {}) }}>
                  {era.name}
                </div>
              </div>

              <div className="reveal" style={{ ...styles.sectionLabel, '--reveal-delay': itemDelay(1) }}>
                Key features
              </div>

              <div style={styles.featuresStack}>
                {era.features.map((f, fIdx) => (
                  <div
                    key={f}
                    className="reveal"
                    style={{
                      ...styles.featureChip,
                      ...(era.current ? styles.featureChipCurrent : {}),
                      '--reveal-delay': itemDelay(2 + fIdx),
                    }}
                  >
                    <span
                      style={{
                        ...styles.featureBullet,
                        ...(era.current ? styles.featureBulletCurrent : {}),
                      }}
                    />
                    <span>{f}</span>
                  </div>
                ))}
              </div>

              <div
                className="reveal"
                style={{
                  ...styles.customerBox,
                  ...(era.current ? styles.customerBoxCurrent : {}),
                  '--reveal-delay': itemDelay(2 + era.features.length),
                }}
              >
                <span style={styles.customerLabel}>Customer behaviour</span>
                <p style={styles.customerCopy}>“{era.customer}”</p>
              </div>
            </div>
          )
        })}
      </div>
    </SlideBase>
  )
}
