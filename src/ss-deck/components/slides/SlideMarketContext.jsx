import { Bank, ChartLineUp, Database, Stack } from '@phosphor-icons/react'
import SlideBase from './SlideBase'
import BeamRule from '../BeamRule'
import { getCopy } from '../../lib/copy'

// Banking-mode market-context slide: three forces every bank executive
// is already feeling, framed as the reason orchestration moved from a
// merchant trend into a banking infrastructure decision. Layout mirrors
// the three-card observation pattern used on Infrastructure but with a
// stat-led card (giant number, kicker, supporting copy) so the figures
// land before the prose. Stays banking-specific: no merchant pains, no
// per-stack diagnostic, just the macro forces.

const FORCES = [
  {
    kicker: '01 · Acquiring at risk',
    title: 'Merchant acquiring is under threat',
    icon: ChartLineUp,
    stat: '9.3×',
    statLabel: 'Stripe TPV growth in five years',
    body: 'PSPs are capturing merchant share at a pace bank acquiring lines have not matched. 40% of merchants plan to switch payment providers within 18 months.',
    accents: ['9.3×', '40%'],
  },
  {
    kicker: '02 · Data without leverage',
    title: 'Data rich, insight poor',
    icon: Database,
    stat: '1 stack',
    statLabel: 'Per gateway, with no unifying layer',
    body: 'Banks sit on transaction data across multiple gateways but have no unified layer to extract value. Fintechs are turning the same data into routing intelligence, fraud prevention, and merchant insights.',
    accents: ['no unified layer'],
  },
  {
    kicker: '03 · Build cost crisis',
    title: 'Ecosystem fragmentation',
    icon: Stack,
    stat: '70-80%',
    statLabel: 'Of payments budget spent on maintenance',
    body: '15-30 integrations drain IT capacity. Multi-market banks face the challenge multiplied: separate stacks, separate PSPs, separate experiences per country.',
    accents: ['15-30 integrations', '70-80%'],
  },
]

const styles = {
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    gap: 'clamp(18px, 1.8vw, 36px)',
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
  monoKickerCaret: {
    color: 'rgba(124,137,239,0.9)',
  },
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
    fontSize: 'clamp(14px, 1.05vw, 19px)',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: '0.01em',
    lineHeight: 1.5,
    margin: 0,
    maxWidth: '36%',
    textAlign: 'right',
  },
  cardRow: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'clamp(14px, 1.3vw, 26px)',
    minHeight: 0,
  },
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(14px, 1.2vw, 22px)',
    padding: 'clamp(22px, 1.8vw, 36px) clamp(22px, 1.8vw, 34px) clamp(26px, 2.2vw, 40px)',
    background: 'linear-gradient(160deg, rgba(62,79,224,0.07) 0%, rgba(0,0,0,0.55) 100%)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '18px',
    backdropFilter: 'blur(12px)',
    overflow: 'hidden',
    minHeight: 0,
  },
  cardKickerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
  },
  cardKicker: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(9px, 0.72vw, 12px)',
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
  cardStat: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(40px, 4vw, 76px)',
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '-2px',
    backgroundImage: 'linear-gradient(135deg, #BDC3F6 0%, #5967E4 100%)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  },
  cardStatLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(10px, 0.75vw, 13px)',
    fontWeight: 500,
    letterSpacing: '0.6px',
    color: 'rgba(255,255,255,0.5)',
    marginTop: 'clamp(6px, 0.55vw, 10px)',
    lineHeight: 1.4,
  },
  cardDivider: {
    height: '1px',
    background:
      'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)',
    margin: 'clamp(2px, 0.3vw, 6px) 0',
  },
  cardTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(20px, 1.6vw, 28px)',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '-0.3px',
    lineHeight: 1.2,
  },
  cardBody: {
    fontSize: 'clamp(16px, 1.3vw, 23px)',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 1.55,
    letterSpacing: '0.01em',
    margin: 0,
  },
  cardBodyAccent: {
    color: '#fff',
    fontWeight: 600,
  },
  // Bottom-anchored signal: ties the three forces to the orchestration
  // narrative without naming Yuno yet (the rest of the deck does that).
  cta: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(11px, 0.85vw, 14px)',
    fontWeight: 500,
    letterSpacing: '0.4px',
    color: 'rgba(255,255,255,0.55)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: 'clamp(2px, 0.4vw, 6px)',
  },
  ctaCaret: {
    color: 'rgba(124,137,239,0.9)',
  },
  ctaAccent: {
    color: '#fff',
    fontWeight: 600,
  },
}

// Wraps each accented substring in the body copy in white-bold so the
// numbers and key clauses pop without authors having to hand-split the
// copy into <strong> spans. Falls back to plain text if no accents.
function HighlightedBody({ text, accents = [] }) {
  if (!accents.length) return <p style={styles.cardBody}>{text}</p>
  const pattern = new RegExp(
    `(${accents.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'g',
  )
  const parts = text.split(pattern)
  return (
    <p style={styles.cardBody}>
      {parts.map((p, i) =>
        accents.includes(p) ? (
          <span key={i} style={styles.cardBodyAccent}>{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  )
}

export default function SlideMarketContext({ data } = {}) {
  const lang = data?.LANGUAGE || 'en'
  return (
    <SlideBase section={getCopy(lang, 'section.market_context')} slideNumber={2}>
      <div style={styles.monoKicker}>
        <span style={styles.monoKickerCaret}>&gt;</span>
        why_now
        <BeamRule />
      </div>

      <div style={styles.titleRow}>
        <h2 style={styles.title}>
          Three forces reshaping{' '}
          <span style={styles.titleAccent}>banking payments</span>
        </h2>
        <p style={styles.subtitle}>
          Each one already shows up on your P&amp;L. Together they pull the
          merchant relationship away from the bank.
        </p>
      </div>

      <div style={styles.body}>
        <div
          className="stagger"
          style={{
            ...styles.cardRow,
            '--stagger-base': '0.2s',
            '--stagger-step': '0.12s',
          }}
        >
          {FORCES.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.title} className="border-beam" style={{ ...styles.card, '--beam-duration': '22s' }}>
                <div style={styles.cardKickerRow}>
                  <span style={styles.cardKicker}>{f.kicker}</span>
                  <span style={styles.cardIcon}>
                    <Icon size="60%" weight="regular" aria-hidden />
                  </span>
                </div>

                <div>
                  <div style={styles.cardStat}>{f.stat}</div>
                  <div style={styles.cardStatLabel}>{f.statLabel}</div>
                </div>

                <div style={styles.cardDivider} />

                <div style={styles.cardTitle}>{f.title}</div>
                <HighlightedBody text={f.body} accents={f.accents} />
              </div>
            )
          })}
        </div>

        <div style={styles.cta}>
          <span style={styles.ctaCaret}>&gt;</span>
          <Bank size={18} weight="regular" aria-hidden />
          <span>
            Banks that <span style={styles.ctaAccent}>own the orchestration layer</span>{' '}
            keep the merchant relationship and the economics that come with it.
          </span>
        </div>
      </div>
    </SlideBase>
  )
}
