import {
  ArrowsClockwise,
  PlugsConnected,
  SquaresFour,
} from '@phosphor-icons/react'
import SlideBase from './SlideBase'
import BeamRule from '../BeamRule'
import { getCopy } from '../../lib/copy'

// Replit-only emphasis slide. JP is sending the deck personally to
// Replit's CEO, so this is the one slide that names Ebanx by name and
// argues, in three beats, why integrating via Yuno beats integrating
// Ebanx (or any MoR) point-to-point. The three beats mirror Isabella's
// brief verbatim: (1) one integration unlocks every MoR, (2) one
// dashboard across Stripe + Razorpay + Ebanx, (3) MoR swap insurance
// (toggle the integration off, no sunk cost). Slide list filters this
// in only when COMPANY_SLUG === 'replit'.
//
// Light theme: matches the Nova / Payments Concierge surface so the
// Replit deck reads as the modern Yuno look. Other merchants stay on
// the dark canvas.

const BENEFITS = [
  {
    icon: PlugsConnected,
    kicker: '01 · One integration',
    title: 'Ebanx covers a slice. Yuno covers the rest',
    body: "Ebanx is strong in LatAm: Brazil, Mexico, Colombia, a handful more. The wallets every modern checkout needs (Apple Pay, Google Pay, PayPal) aren't in its catalog. India, Vietnam, China, Pakistan, the UK need other providers entirely. Yuno ships Ebanx for what it covers, plus those wallets, dLocal, PayU, Razorpay, Stripe, and 460+ providers for everywhere it doesn't.",
    punchline: 'Ebanx + every market and wallet it doesn’t ship, on day one',
  },
  {
    icon: SquaresFour,
    kicker: '02 · One dashboard, plug and play',
    title: 'Every PSP, every market, in a single holistic view',
    body: "Yuno's dashboard surfaces every provider, every method, every market side by side. Authorization rates, retries, settlements, FX, chargebacks across Stripe, Razorpay, Ebanx, and the other 460+ in the catalog, all in one console. No reconciling three vendor portals, no stitched-together reports, no engineering build. Plug in, see everything, act on it the day you go live.",
    punchline: 'Everything in one place, plug and play from day one',
  },
  {
    icon: ArrowsClockwise,
    kicker: '03 · MoR swap insurance',
    title: 'If Ebanx slips, disconnect it. Connect anyone else',
    body: "Direct Ebanx contract: if pricing degrades, service slips, or coverage breaks, you're locked in until you re-engineer the next MoR. With Yuno: disconnect Ebanx, route LatAm volume through dLocal or PayU via dashboard toggle. No re-integration, no developer downtime, no integration sunk cost. Switch off, switch on.",
    punchline: 'Switch off, switch on. No huge integration losses',
  },
]

const FOOTER_STATS = [
  { n: '460+', l: 'providers · 1 integration' },
  { n: '190+', l: 'countries on a single dashboard' },
  { n: 'Toggle', l: 'to swap MoR · 0 sprints' },
  { n: '$1B', l: 'ARR target · 0 integration debt' },
]

// Nova / Payments Concierge tints, scoped to this slide.
const INK = '#1E2030'
const INK_SECONDARY = 'rgba(30, 32, 48, 0.74)'
const INK_MUTED = 'rgba(30, 32, 48, 0.56)'
const INK_FAINT = 'rgba(30, 32, 48, 0.42)'
const ACCENT = '#3E4FE0'
const ACCENT_DEEP = '#1726A6'
const BORDER = 'rgba(30, 32, 48, 0.10)'

const styles = {
  monoKicker: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(10px, 0.78vw, 13px)',
    fontWeight: 500,
    letterSpacing: '0.4px',
    color: INK_FAINT,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: 'clamp(6px, 0.6vw, 10px)',
  },
  monoKickerCaret: { color: ACCENT },
  titleRow: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 'clamp(20px, 2vw, 40px)',
    marginBottom: 'clamp(20px, 2vw, 40px)',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(28px, 2.7vw, 52px)',
    fontWeight: 500,
    letterSpacing: '-1.2px',
    lineHeight: 1.1,
    color: INK,
    margin: 0,
    maxWidth: '70%',
  },
  titleAccent: {
    backgroundImage: `linear-gradient(135deg, ${ACCENT_DEEP} 0%, ${ACCENT} 100%)`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
    fontWeight: 700,
  },
  subtitle: {
    fontSize: 'clamp(13px, 1.05vw, 19px)',
    fontWeight: 400,
    color: INK_MUTED,
    lineHeight: 1.55,
    margin: 0,
    maxWidth: '32%',
    textAlign: 'right',
  },
  subtitleEmph: {
    color: INK,
    fontWeight: 700,
  },
  body: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'clamp(16px, 1.4vw, 28px)',
    minHeight: 0,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(16px, 1.3vw, 26px)',
    padding: 'clamp(24px, 2vw, 38px) clamp(22px, 1.9vw, 34px)',
    background: '#FFFFFF',
    border: `1px solid ${BORDER}`,
    borderRadius: '16px',
    minHeight: 0,
    boxShadow: '0 1px 3px rgba(30, 32, 48, 0.04), 0 10px 28px rgba(30, 32, 48, 0.05)',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 'clamp(12px, 1vw, 18px)',
  },
  cardIcon: {
    width: 'clamp(40px, 3vw, 56px)',
    height: 'clamp(40px, 3vw, 56px)',
    borderRadius: '12px',
    background: 'rgba(62, 79, 224, 0.08)',
    border: '1px solid rgba(62, 79, 224, 0.20)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: ACCENT,
    flexShrink: 0,
  },
  cardKicker: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(10.5px, 0.78vw, 13px)',
    fontWeight: 700,
    letterSpacing: '1.6px',
    textTransform: 'uppercase',
    color: ACCENT,
  },
  cardTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(19px, 1.55vw, 28px)',
    fontWeight: 700,
    color: INK,
    letterSpacing: '-0.4px',
    lineHeight: 1.18,
  },
  cardBody: {
    fontSize: 'clamp(15.5px, 1.25vw, 22px)',
    fontWeight: 400,
    color: INK_SECONDARY,
    lineHeight: 1.5,
    margin: 0,
  },
  cardPunchlineWrap: {
    marginTop: 'auto',
    paddingTop: 'clamp(12px, 1vw, 18px)',
    borderTop: `1px solid ${BORDER}`,
  },
  cardPunchline: {
    fontSize: 'clamp(14.5px, 1.18vw, 20px)',
    fontWeight: 700,
    letterSpacing: '-0.1px',
    lineHeight: 1.35,
    backgroundImage: `linear-gradient(110deg, ${ACCENT_DEEP} 0%, ${ACCENT} 60%, ${ACCENT_DEEP} 100%)`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  },
  // Footer stat strip: anchors the slide with Replit-specific scale
  // numbers so the argument lands with stakes attached.
  footer: {
    marginTop: 'clamp(18px, 1.6vw, 32px)',
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 'clamp(14px, 1.2vw, 24px)',
    padding: 'clamp(18px, 1.5vw, 28px) clamp(22px, 1.9vw, 34px)',
    background: '#FFFFFF',
    border: `1px solid ${BORDER}`,
    borderRadius: '14px',
    boxShadow: '0 1px 2px rgba(30, 32, 48, 0.03)',
  },
  statBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(4px, 0.35vw, 7px)',
  },
  statNum: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(24px, 2.2vw, 42px)',
    fontWeight: 700,
    letterSpacing: '-0.8px',
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
    backgroundImage: `linear-gradient(135deg, ${ACCENT_DEEP} 0%, ${ACCENT} 100%)`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  },
  statLabel: {
    fontSize: 'clamp(10.5px, 0.82vw, 13.5px)',
    fontWeight: 600,
    color: INK_SECONDARY,
    letterSpacing: '0.4px',
    lineHeight: 1.35,
  },
}

export default function SlideReplitBenefits({ data } = {}) {
  const lang = data?.LANGUAGE || 'en'
  return (
    <SlideBase section={getCopy(lang, 'replit.why_yuno_section')}>
      <div style={styles.monoKicker}>
        <span style={styles.monoKickerCaret}>&gt;</span>
        why_yuno_for_replit
        <BeamRule
          base={'linear-gradient(90deg, rgba(30, 32, 48, 0.18) 0%, rgba(30, 32, 48, 0) 100%)'}
          beam={'linear-gradient(90deg, transparent 0%, rgba(62, 79, 224, 0.55) 50%, transparent 100%)'}
        />
      </div>

      <div style={styles.titleRow}>
        <h2 style={styles.title}>
          Why integrating via Yuno{' '}
          <span style={styles.titleAccent}>beats Ebanx direct</span>
        </h2>
        <p style={styles.subtitle}>
          Three reasons going through one platform unlocks more than{' '}
          <span style={styles.subtitleEmph}>going point-to-point with each MoR</span>
        </p>
      </div>

      <div className="stagger" style={{ ...styles.body, '--stagger-base': '0.18s', '--stagger-step': '0.1s' }}>
        {BENEFITS.map((b) => {
          const Icon = b.icon
          return (
            <div key={b.title} style={styles.card}>
              <div style={styles.cardHead}>
                <span style={styles.cardIcon}>
                  <Icon size="58%" weight="regular" aria-hidden />
                </span>
                <span style={styles.cardKicker}>{b.kicker}</span>
              </div>
              <div style={styles.cardTitle}>{b.title}</div>
              <p style={styles.cardBody}>{b.body}</p>
              <div style={styles.cardPunchlineWrap}>
                <span style={styles.cardPunchline}>{b.punchline}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="reveal" style={{ ...styles.footer, '--reveal-delay': '0.7s' }}>
        {FOOTER_STATS.map((s) => (
          <div key={s.l} style={styles.statBlock}>
            <div style={styles.statNum}>{s.n}</div>
            <div style={styles.statLabel}>{s.l}</div>
          </div>
        ))}
      </div>
    </SlideBase>
  )
}
