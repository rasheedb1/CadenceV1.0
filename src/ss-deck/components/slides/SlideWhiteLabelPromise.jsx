import {
  CheckCircle,
  EyeSlash,
  Lock,
  PaintBrush,
  Pulse,
  ShieldCheck,
  Vault,
} from '@phosphor-icons/react'
import SlideBase from './SlideBase'
import BeamRule from '../BeamRule'
import { getCopy } from '../../lib/copy'

// Banking-mode trust closer: six guarantee chips that read as the
// reassurance a bank's risk and procurement teams scan for. Two-row
// layout (3×2) with a left rail callout block that frames the promise
// in plain language. Designed to sit late in the storyline so the
// reader leaves the deck with the trust points top of mind.

const PROMISES = [
  {
    icon: PaintBrush,
    label: '100% bank-branded',
    body: 'Merchants only ever see your portal, your domain, your name. Yuno is the engine underneath, never the surface.',
  },
  {
    icon: Vault,
    label: 'Settlement direct to the bank',
    body: 'Money flows from acquirers into your accounts. The orchestrator handles routing decisions, not funds.',
  },
  {
    icon: EyeSlash,
    label: 'Non-custodial by design',
    body: 'Yuno never takes custody of merchant funds. Zero counterparty risk added to your balance sheet.',
  },
  {
    icon: Pulse,
    label: '99.99% uptime SLA',
    body: 'Active-active infrastructure across regions. Designed for bank-grade availability, not best effort.',
  },
  {
    icon: ShieldCheck,
    label: 'PCI-DSS Level 1 · SOC 2 Type II',
    body: 'Highest tier of card-data certification, audited annually. Plus regional data-residency on request.',
  },
  {
    icon: Lock,
    label: 'Live in 6-12 weeks',
    body: 'From contract to first transaction. Existing gateways connect via API; smart routing is on from day one.',
  },
]

const styles = {
  body: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '0.95fr 1.7fr',
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
    fontSize: 'clamp(16px, 1.22vw, 22px)',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: '0.01em',
    lineHeight: 1.5,
    margin: 0,
    maxWidth: '38%',
    textAlign: 'right',
  },
  // Left framing block, a single statement card that anchors the row of
  // chips on the right. Mirrors the SlideInfrastructure observation card
  // pattern but stripped to the essential promise + supporting bullets.
  framingCard: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(14px, 1.2vw, 22px)',
    padding: 'clamp(24px, 2vw, 38px)',
    background: 'linear-gradient(160deg, rgba(62,79,224,0.14) 0%, rgba(0,0,0,0.55) 100%)',
    border: '1px solid rgba(124,137,239,0.32)',
    borderRadius: '18px',
    backdropFilter: 'blur(12px)',
    overflow: 'hidden',
    minHeight: 0,
  },
  framingKicker: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(13px, 1.05vw, 17px)',
    fontWeight: 700,
    letterSpacing: '1.8px',
    textTransform: 'uppercase',
    color: 'rgba(124,137,239,0.95)',
  },
  framingHeadline: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(24px, 2vw, 40px)',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '-0.6px',
    lineHeight: 1.18,
    margin: 0,
  },
  framingHeadlineAccent: {
    backgroundImage: 'linear-gradient(135deg, #BDC3F6 0%, #5967E4 100%)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  },
  framingBody: {
    fontSize: 'clamp(15px, 1.2vw, 21px)',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 1.5,
    margin: 0,
  },
  framingDivider: {
    height: '1px',
    background:
      'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)',
    margin: 'clamp(2px, 0.3vw, 6px) 0',
  },
  framingPointRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'clamp(8px, 0.7vw, 12px)',
  },
  framingPointIcon: {
    width: 'clamp(20px, 1.4vw, 24px)',
    height: 'clamp(20px, 1.4vw, 24px)',
    borderRadius: '50%',
    background: 'rgba(74,222,128,0.16)',
    border: '1px solid rgba(74,222,128,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#4ade80',
    flexShrink: 0,
    marginTop: '2px',
  },
  framingPointText: {
    fontSize: 'clamp(15px, 1.2vw, 21px)',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 1.5,
  },
  // Right rail, 3×2 grid of promise chips.
  promiseGrid: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridAutoRows: '1fr',
    gap: 'clamp(12px, 1.1vw, 22px)',
    minHeight: 0,
  },
  promise: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(10px, 0.9vw, 16px)',
    padding: 'clamp(18px, 1.5vw, 28px) clamp(18px, 1.5vw, 26px)',
    background: 'linear-gradient(160deg, rgba(62,79,224,0.06) 0%, rgba(0,0,0,0.5) 100%)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px',
    backdropFilter: 'blur(10px)',
  },
  promiseIcon: {
    width: 'clamp(34px, 2.6vw, 48px)',
    height: 'clamp(34px, 2.6vw, 48px)',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, rgba(62,79,224,0.18) 0%, rgba(89,103,228,0.08) 100%)',
    border: '1px solid rgba(124,137,239,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(189,195,246,0.95)',
    flexShrink: 0,
  },
  promiseLabel: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(19px, 1.5vw, 28px)',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '-0.3px',
    lineHeight: 1.2,
  },
  promiseBody: {
    fontSize: 'clamp(14.5px, 1.18vw, 21px)',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 1.5,
    margin: 0,
  },
}

export default function SlideWhiteLabelPromise({ data } = {}) {
  const lang = data?.LANGUAGE || 'en'
  return (
    <SlideBase section={getCopy(lang, 'section.white_label_promise')} slideNumber={7}>
      <div style={styles.monoKicker}>
        <span style={styles.monoKickerCaret}>&gt;</span>
        the_promise
        <BeamRule />
      </div>

      <div style={styles.titleRow}>
        <h2 style={styles.title}>
          You keep the customer, the brand, and the balance sheet.{' '}
          <span style={styles.titleAccent}>Yuno powers the rails.</span>
        </h2>
        <p style={styles.subtitle}>
          White-label, non-custodial, bank-grade. Six guarantees your risk team
          can sign off on before procurement opens the deck.
        </p>
      </div>

      <div style={styles.body}>
        <div className="reveal border-beam" style={{ ...styles.framingCard, '--beam-duration': '26s', '--reveal-delay': '0.18s' }}>
          <span style={styles.framingKicker}>White-label · non-custodial</span>
          <h3 style={styles.framingHeadline}>
            The bank stays in front of the merchant.{' '}
            <span style={styles.framingHeadlineAccent}>
              Yuno never enters the picture.
            </span>
          </h3>
          <p style={styles.framingBody}>
            Onboarding, pricing, settlement, support, branding, all yours. The
            orchestration layer makes routing and APM decisions in the
            background, with no visibility, no contract, no relationship leaking
            to the merchant.
          </p>

          <div style={styles.framingDivider} />

          {[
            'Merchant only ever sees your portal',
            'Settlement flows directly to your accounts',
            'Compliance and audit trail in your jurisdiction',
          ].map((point) => (
            <div key={point} style={styles.framingPointRow}>
              <span style={styles.framingPointIcon}>
                <CheckCircle size="80%" weight="regular" aria-hidden />
              </span>
              <span style={styles.framingPointText}>{point}</span>
            </div>
          ))}
        </div>

        <div className="stagger" style={{ ...styles.promiseGrid, '--stagger-base': '0.32s', '--stagger-step': '0.07s' }}>
          {PROMISES.map((p) => {
            const Icon = p.icon
            return (
              <div key={p.label} style={styles.promise}>
                <span style={styles.promiseIcon}>
                  <Icon size="60%" weight="regular" aria-hidden />
                </span>
                <div style={styles.promiseLabel}>{p.label}</div>
                <p style={styles.promiseBody}>{p.body}</p>
              </div>
            )
          })}
        </div>
      </div>
    </SlideBase>
  )
}
