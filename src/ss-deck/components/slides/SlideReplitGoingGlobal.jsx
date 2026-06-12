import {
  Globe,
  CreditCard,
  ChartLineUp,
  CheckCircle,
  XCircle,
} from '@phosphor-icons/react'
import SlideBase from './SlideBase'
import BeamRule from '../BeamRule'
import { getCopy } from '../../lib/copy'

// Replit-only setup slide. Frames what Replit is actually trying to do
// (grow paying users globally on the path to $1B ARR), explains why a
// single MoR can never cover it, and uses two small comparison cards
// (Ebanx vs dLocal) to show the coverage gap is real even between
// best-in-class MoRs. Sits right before SlideReplitBenefits so the
// next slide can answer "OK, so what would actually work?" with the
// Yuno argument. By design, Yuno's dashboard is NOT named here; that
// belongs to the benefits slide.
//
// Light theme: Replit deck only. Mirrors the Nova / Payments Concierge
// surface (#F8F9FC canvas, #1E2030 ink, blue accents) so the deck JP
// is sending personally to Replit's CEO matches the modern Yuno surface
// the rest of the company is shipping.

const NEEDS = [
  {
    icon: Globe,
    kicker: '01 · Local everywhere',
    title: 'Every local provider, in every market',
    body: "UPI in India. Pix in Brazil. MoMo in Vietnam. Interac in Canada. SEPA in France. The next paying user already pays in their local currency, with their local method. The stack has to follow them, not the other way around.",
  },
  {
    icon: CreditCard,
    kicker: '02 · Wallets are table stakes',
    title: 'The wallets every modern checkout needs',
    body: "Apple Pay, Google Pay, PayPal: not optional in 2026. Every market expects them, conversion drops without them, and not every MoR ships them. Coverage is the floor, not the ceiling.",
  },
  {
    icon: ChartLineUp,
    kicker: '03 · One holistic view',
    title: 'A single global view across every PSP',
    body: "Authorization rates, settlements, retries, FX, chargebacks, all rolled up across every provider and every market. Without one holistic view, every new market multiplies ops cost instead of revenue.",
  },
]

const COMPARISON = {
  intro: "And one MoR alone will not get there.",
  ebanx: {
    name: 'Ebanx',
    subtitle: 'Direct integration',
    rows: [
      { ok: true, text: '~29 markets, LatAm core (Brazil, Mexico, Colombia)' },
      { ok: false, text: 'No Apple Pay, Google Pay, or PayPal in catalog' },
      { ok: false, text: 'Limited reach in APAC, Africa, Middle East' },
      { ok: false, text: 'New regions need a separate MoR contract' },
    ],
  },
  dlocal: {
    name: 'dLocal',
    subtitle: 'Direct integration',
    rows: [
      { ok: true, text: '40+ emerging markets across LatAm, Africa, APAC, Middle East' },
      { ok: true, text: 'Local methods country by country' },
      { ok: false, text: 'Still card-only in many markets, wallets selective' },
      { ok: false, text: 'Single-provider stack with no built-in failover' },
    ],
  },
  caption: "Even between best-in-class MoRs, no single one covers paying users everywhere.",
}

// Nova / Payments Concierge tints, scoped to this slide. Keep colors
// here instead of leaking into the global token sheet so the rest of
// the deck remains dark for every other merchant.
const INK = '#1E2030'
const INK_SECONDARY = 'rgba(30, 32, 48, 0.72)'
const INK_MUTED = 'rgba(30, 32, 48, 0.56)'
const INK_FAINT = 'rgba(30, 32, 48, 0.42)'
const ACCENT = '#3E4FE0'
const ACCENT_DEEP = '#1726A6'
const BORDER = 'rgba(30, 32, 48, 0.10)'
const BORDER_SOFT = 'rgba(30, 32, 48, 0.06)'

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
    marginBottom: 'clamp(18px, 1.6vw, 32px)',
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
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 'clamp(28px, 2.4vw, 48px)',
    minHeight: 0,
    paddingBottom: 'clamp(8px, 0.8vw, 16px)',
  },
  needsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'clamp(14px, 1.3vw, 26px)',
  },
  needCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(14px, 1.1vw, 22px)',
    padding: 'clamp(26px, 2.1vw, 40px) clamp(24px, 1.9vw, 34px)',
    background: '#FFFFFF',
    border: `1px solid ${BORDER}`,
    borderRadius: '16px',
    boxShadow: '0 1px 3px rgba(30, 32, 48, 0.04), 0 8px 24px rgba(30, 32, 48, 0.04)',
  },
  needHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 'clamp(12px, 1vw, 16px)',
  },
  needIcon: {
    width: 'clamp(42px, 3vw, 56px)',
    height: 'clamp(42px, 3vw, 56px)',
    borderRadius: '12px',
    background: 'rgba(62, 79, 224, 0.08)',
    border: '1px solid rgba(62, 79, 224, 0.18)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: ACCENT,
    flexShrink: 0,
  },
  needKicker: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(11px, 0.85vw, 14px)',
    fontWeight: 700,
    letterSpacing: '1.6px',
    textTransform: 'uppercase',
    color: ACCENT,
  },
  needTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(20px, 1.6vw, 28px)',
    fontWeight: 700,
    color: INK,
    letterSpacing: '-0.3px',
    lineHeight: 1.2,
  },
  needBody: {
    fontSize: 'clamp(14px, 1.15vw, 19px)',
    fontWeight: 400,
    color: INK_SECONDARY,
    lineHeight: 1.55,
    margin: 0,
  },
  // Comparison block: header line + two side-by-side mini cards.
  comparisonWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(14px, 1.1vw, 22px)',
  },
  comparisonHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'clamp(12px, 1vw, 16px)',
  },
  comparisonHeaderLabel: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(12px, 0.95vw, 16px)',
    fontWeight: 700,
    letterSpacing: '1.6px',
    textTransform: 'uppercase',
    color: ACCENT,
    whiteSpace: 'nowrap',
  },
  comparisonRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 'clamp(14px, 1.2vw, 24px)',
  },
  miniCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(12px, 1vw, 18px)',
    padding: 'clamp(22px, 1.7vw, 32px) clamp(22px, 1.7vw, 32px)',
    background: '#FFFFFF',
    border: `1px solid ${BORDER}`,
    borderRadius: '14px',
    boxShadow: '0 1px 3px rgba(30, 32, 48, 0.04), 0 6px 18px rgba(30, 32, 48, 0.03)',
  },
  miniHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '12px',
  },
  miniName: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(22px, 1.85vw, 32px)',
    fontWeight: 700,
    color: INK,
    letterSpacing: '-0.3px',
  },
  miniSubtitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(10.5px, 0.82vw, 13.5px)',
    fontWeight: 700,
    letterSpacing: '1.4px',
    textTransform: 'uppercase',
    color: INK_FAINT,
  },
  miniRowList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(8px, 0.7vw, 14px)',
  },
  miniRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'clamp(10px, 0.85vw, 14px)',
    fontSize: 'clamp(14px, 1.1vw, 18px)',
    color: INK_SECONDARY,
    lineHeight: 1.45,
  },
  miniRowIcon: {
    flexShrink: 0,
    marginTop: '3px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniRowIconOk: { color: '#16A34A' },
  miniRowIconBad: { color: '#EA580C' },
  caption: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(13px, 1vw, 17px)',
    fontWeight: 500,
    letterSpacing: '0.3px',
    color: INK_MUTED,
    textAlign: 'center',
    margin: 0,
  },
}

// BeamRule colors tuned for the light surface: dark base, blue beam.
const BEAM_BASE_LIGHT =
  'linear-gradient(90deg, rgba(30, 32, 48, 0.18) 0%, rgba(30, 32, 48, 0) 100%)'
const BEAM_LIGHT =
  'linear-gradient(90deg, transparent 0%, rgba(62, 79, 224, 0.55) 50%, transparent 100%)'

export default function SlideReplitGoingGlobal({ data } = {}) {
  const lang = data?.LANGUAGE || 'en'
  return (
    <SlideBase section={getCopy(lang, 'replit.going_global_section')}>
      <div style={styles.monoKicker}>
        <span style={styles.monoKickerCaret}>&gt;</span>
        replit_global_growth
        <BeamRule base={BEAM_BASE_LIGHT} beam={BEAM_LIGHT} />
      </div>

      <div style={styles.titleRow}>
        <h2 style={styles.title}>
          Going global means more than{' '}
          <span style={styles.titleAccent}>any single partner can deliver</span>
        </h2>
        <p style={styles.subtitle}>
          Replit is on a $1B ARR path.{' '}
          <span style={styles.subtitleEmph}>That growth lives in markets a single MoR cannot reach.</span>
        </p>
      </div>

      <div style={styles.body}>
        <div className="stagger" style={{ ...styles.needsRow, '--stagger-base': '0.18s', '--stagger-step': '0.1s' }}>
          {NEEDS.map((n) => {
            const Icon = n.icon
            return (
              <div key={n.title} style={styles.needCard}>
                <div style={styles.needHead}>
                  <span style={styles.needIcon}>
                    <Icon size="58%" weight="regular" aria-hidden />
                  </span>
                  <span style={styles.needKicker}>{n.kicker}</span>
                </div>
                <div style={styles.needTitle}>{n.title}</div>
                <p style={styles.needBody}>{n.body}</p>
              </div>
            )
          })}
        </div>

        <div className="reveal" style={{ ...styles.comparisonWrap, '--reveal-delay': '0.55s' }}>
          <div style={styles.comparisonHeader}>
            <span style={styles.comparisonHeaderLabel}>{COMPARISON.intro}</span>
            <BeamRule base={BEAM_BASE_LIGHT} beam={BEAM_LIGHT} />
          </div>
          <div style={styles.comparisonRow}>
            {[COMPARISON.ebanx, COMPARISON.dlocal].map((m) => (
              <div key={m.name} style={styles.miniCard}>
                <div style={styles.miniHead}>
                  <span style={styles.miniName}>{m.name}</span>
                  <span style={styles.miniSubtitle}>{m.subtitle}</span>
                </div>
                <div style={styles.miniRowList}>
                  {m.rows.map((r, idx) => {
                    const Glyph = r.ok ? CheckCircle : XCircle
                    return (
                      <div key={idx} style={styles.miniRow}>
                        <span
                          style={{
                            ...styles.miniRowIcon,
                            ...(r.ok ? styles.miniRowIconOk : styles.miniRowIconBad),
                          }}
                        >
                          <Glyph size="20" weight="fill" aria-hidden />
                        </span>
                        <span>{r.text}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <p style={styles.caption}>{COMPARISON.caption}</p>
        </div>
      </div>
    </SlideBase>
  )
}
