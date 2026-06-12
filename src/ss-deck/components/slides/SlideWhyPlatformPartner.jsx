import { ArrowRight, Stack, Wrench } from '@phosphor-icons/react'
import SlideBase from './SlideBase'
import BeamRule from '../BeamRule'
import { getCopy } from '../../lib/copy'

// Banking-mode argument slide: a side-by-side that frames orchestration
// as work that has to live ABOVE individual gateways, which is why a
// platform partner moves faster than an in-house build. Reads as
// "constraints" → "solution" rather than as a takedown of the bank's
// engineering org. Each side is a vertically-stacked card list with
// matching slot heights so the rows align across the column gap.

const CONSTRAINTS = [
  {
    title: 'Routing sits above every gateway',
    body: 'Cost optimization, smart routing, and APM activation cannot be solved from inside any one provider; every gateway only sees its own rails.',
  },
  {
    title: 'Engineering capacity does not scale to merchant speed',
    body: 'Hiring engineers to wire integrations one-by-one across markets cannot match the activation cadence merchants now expect.',
  },
  {
    title: 'Maintenance debt grows with every connection',
    body: '15-30 integrations drain IT capacity. 70-80% of payment budgets go to maintenance instead of new revenue surfaces.',
  },
]

const SOLUTIONS = [
  {
    title: 'A neutral layer above your existing stack',
    body: 'Orchestration sits on top of the gateways the bank already runs. Nothing replaced; intelligence added on top, with routing, recovery, and APMs unified.',
  },
  {
    title: 'One platform absorbs the integration work',
    body: '1,000+ payment methods and 460+ providers pre-connected. New methods activate by configuration, not engineering. Days, not months.',
  },
  {
    title: 'Live in 6-12 weeks, bank-grade from day one',
    body: 'PCI-DSS Level 1, SOC2 Type II, 99.99% uptime. White-label, non-custodial: settlement still flows directly to the bank.',
  },
]

const styles = {
  body: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    gap: 'clamp(18px, 1.6vw, 32px)',
    minHeight: 0,
    alignItems: 'stretch',
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
    marginBottom: 'clamp(16px, 1.6vw, 32px)',
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
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(12px, 1.1vw, 22px)',
    minHeight: 0,
  },
  columnHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'clamp(14px, 1.2vw, 20px)',
    padding: 'clamp(20px, 1.7vw, 32px) clamp(22px, 1.9vw, 34px)',
    background: 'linear-gradient(135deg, rgba(62,79,224,0.06) 0%, rgba(0,0,0,0.4) 100%)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px',
  },
  columnHeaderRight: {
    background: 'linear-gradient(135deg, rgba(62,79,224,0.18) 0%, rgba(0,0,0,0.4) 100%)',
    border: '1px solid rgba(124,137,239,0.4)',
    boxShadow: '0 0 30px rgba(62,79,224,0.12)',
  },
  columnHeaderIcon: {
    width: 'clamp(40px, 2.9vw, 56px)',
    height: 'clamp(40px, 2.9vw, 56px)',
    borderRadius: '10px',
    background: 'rgba(124,137,239,0.18)',
    border: '1px solid rgba(124,137,239,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(189,195,246,0.95)',
    flexShrink: 0,
  },
  columnHeaderTextStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(3px, 0.3vw, 6px)',
  },
  columnKicker: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(11px, 0.85vw, 14px)',
    fontWeight: 700,
    letterSpacing: '1.6px',
    textTransform: 'uppercase',
    color: 'rgba(124,137,239,0.95)',
  },
  columnTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(22px, 1.9vw, 34px)',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '-0.5px',
    lineHeight: 1.18,
  },
  cardList: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(10px, 0.85vw, 16px)',
    minHeight: 0,
  },
  card: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 'clamp(5px, 0.4vw, 8px)',
    padding: 'clamp(12px, 1vw, 18px) clamp(16px, 1.35vw, 22px)',
    background: 'linear-gradient(160deg, rgba(255,255,255,0.025) 0%, rgba(0,0,0,0.45) 100%)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '12px',
    minHeight: 0,
  },
  cardSolution: {
    background: 'linear-gradient(160deg, rgba(62,79,224,0.08) 0%, rgba(0,0,0,0.5) 100%)',
    border: '1px solid rgba(124,137,239,0.25)',
  },
  cardTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(18px, 1.42vw, 26px)',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '-0.3px',
    lineHeight: 1.2,
  },
  cardBody: {
    fontSize: 'clamp(13.5px, 1.08vw, 19px)',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 1.5,
    margin: 0,
  },
  // Connector column, arrow glyph + faint vertical rule that visually
  // converts the constraints into the solutions.
  connector: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'clamp(10px, 0.9vw, 18px)',
    paddingTop: 'clamp(60px, 5vw, 100px)',
  },
  connectorIcon: {
    width: 'clamp(36px, 2.6vw, 52px)',
    height: 'clamp(36px, 2.6vw, 52px)',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, rgba(62,79,224,0.4) 0%, rgba(89,103,228,0.18) 100%)',
    border: '1px solid rgba(124,137,239,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    boxShadow: '0 0 24px rgba(62,79,224,0.3)',
  },
  connectorRule: {
    width: '1px',
    flex: 1,
    background:
      'linear-gradient(180deg, rgba(124,137,239,0.1) 0%, rgba(124,137,239,0.4) 50%, rgba(124,137,239,0.1) 100%)',
  },
  connectorLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(9px, 0.7vw, 11.5px)',
    fontWeight: 700,
    letterSpacing: '1.6px',
    textTransform: 'uppercase',
    color: 'rgba(124,137,239,0.85)',
    writingMode: 'vertical-rl',
    transform: 'rotate(180deg)',
  },
}

export default function SlideWhyPlatformPartner({ data } = {}) {
  const lang = data?.LANGUAGE || 'en'
  return (
    <SlideBase section={getCopy(lang, 'section.market_context')} slideNumber={5}>
      <div style={styles.monoKicker}>
        <span style={styles.monoKickerCaret}>&gt;</span>
        why_a_platform
        <BeamRule />
      </div>

      <div style={styles.titleRow}>
        <h2 style={styles.title}>
          A platform partner moves faster than{' '}
          <span style={styles.titleAccent}>a fresh internal build</span>
        </h2>
        <p style={styles.subtitle}>
          Orchestration is work that lives above any single gateway. The fastest
          path to it is plugging in, not building it twice.
        </p>
      </div>

      <div style={styles.body}>
        <div className="stagger" style={{ ...styles.column, '--stagger-base': '0.18s', '--stagger-step': '0.1s' }}>
          <div style={styles.columnHeader}>
            <span style={styles.columnHeaderIcon}>
              <Wrench size="60%" weight="regular" aria-hidden />
            </span>
            <div style={styles.columnHeaderTextStack}>
              <span style={styles.columnKicker}>The reality today</span>
              <span style={styles.columnTitle}>Why building it alone is slow</span>
            </div>
          </div>
          <div style={styles.cardList}>
            {CONSTRAINTS.map((c) => (
              <div key={c.title} style={styles.card}>
                <div style={styles.cardTitle}>{c.title}</div>
                <p style={styles.cardBody}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="reveal" style={{ ...styles.connector, '--reveal-delay': '0.5s' }}>
          <span style={styles.connectorIcon}>
            <ArrowRight size="55%" weight="bold" aria-hidden />
          </span>
          <span style={styles.connectorRule} />
          <span style={styles.connectorLabel}>becomes</span>
          <span style={styles.connectorRule} />
        </div>

        <div className="stagger" style={{ ...styles.column, '--stagger-base': '0.42s', '--stagger-step': '0.1s' }}>
          <div style={{ ...styles.columnHeader, ...styles.columnHeaderRight }}>
            <span style={styles.columnHeaderIcon}>
              <Stack size="60%" weight="regular" aria-hidden />
            </span>
            <div style={styles.columnHeaderTextStack}>
              <span style={styles.columnKicker}>The platform answer</span>
              <span style={styles.columnTitle}>What an orchestration layer adds</span>
            </div>
          </div>
          <div style={styles.cardList}>
            {SOLUTIONS.map((s) => (
              <div key={s.title} className="border-beam" style={{ ...styles.card, ...styles.cardSolution, '--beam-duration': '26s' }}>
                <div style={styles.cardTitle}>{s.title}</div>
                <p style={styles.cardBody}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SlideBase>
  )
}
