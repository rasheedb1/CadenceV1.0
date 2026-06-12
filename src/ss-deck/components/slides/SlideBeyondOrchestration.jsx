import {
  CursorClick,
  DeviceMobile,
  Fingerprint,
  ShieldCheck,
  Storefront,
  Vault,
} from '@phosphor-icons/react'
import SlideBase from './SlideBase'
import BeamRule from '../BeamRule'
import { getCopy } from '../../lib/copy'

// Banking-mode "what's on top of orchestration" slide. Lives right
// after Why a Platform Partner so the reader has just heard the case
// for plugging into a platform, this slide answers "what does the
// platform actually carry beyond routing?". Six conversion / UX /
// security capabilities laid out in a 3×2 grid, mirroring the source
// deck's structure but rebuilt in the Yuno aesthetic (lavender chips,
// gradient title accent, mono kicker, border-beam cards).

const CAPABILITIES = [
  {
    label: 'Integrated checkout',
    icon: Storefront,
    body: 'Hosted checkout with embedded payment methods, fraud checks, and consumer authentication in one merchant-branded surface. Not a redirect.',
  },
  {
    label: 'Tokenization',
    icon: Vault,
    body: 'Network token provisioning and lifecycle management. Credentials vaulted, rotated, and routed without raw card data touching the merchant.',
  },
  {
    label: 'Click to Pay',
    icon: CursorClick,
    body: "Mastercard's Click to Pay integrated natively into Yuno's checkout. One-click recognition, no manual card entry.",
  },
  {
    label: 'Passkeys',
    icon: Fingerprint,
    body: 'Biometric authentication replacing passwords. Click to Pay with Passkey, fingerprint or face confirms payment.',
  },
  {
    label: '3D Secure',
    icon: ShieldCheck,
    body: 'EMV 3D Secure integrated into the checkout flow for frictionless, risk-based authentication.',
  },
  {
    label: 'Tap to Pay',
    icon: DeviceMobile,
    body: 'In-person acceptance turning any device into a terminal. New acceptance points without traditional hardware.',
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
  // 3 columns × 2 rows. gridAutoRows ensures rows match heights so the
  // grid reads as a clean tile arrangement.
  grid: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridAutoRows: '1fr',
    gap: 'clamp(14px, 1.2vw, 24px)',
    minHeight: 0,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(12px, 1vw, 18px)',
    padding: 'clamp(20px, 1.7vw, 32px) clamp(22px, 1.8vw, 30px)',
    background: 'linear-gradient(160deg, rgba(62,79,224,0.07) 0%, rgba(0,0,0,0.55) 100%)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '16px',
    backdropFilter: 'blur(12px)',
    minHeight: 0,
    overflow: 'hidden',
  },
  cardIcon: {
    width: 'clamp(40px, 2.9vw, 56px)',
    height: 'clamp(40px, 2.9vw, 56px)',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, rgba(62,79,224,0.22) 0%, rgba(89,103,228,0.1) 100%)',
    border: '1px solid rgba(124,137,239,0.32)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(189,195,246,0.95)',
    flexShrink: 0,
  },
  cardLabel: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(20px, 1.6vw, 30px)',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '-0.4px',
    lineHeight: 1.18,
  },
  cardBody: {
    fontSize: 'clamp(14.5px, 1.18vw, 21px)',
    fontWeight: 400,
    color: 'rgba(255,255,255,0.68)',
    lineHeight: 1.5,
    margin: 0,
  },
  // Anchored caption beneath the grid restating the slide thesis in
  // mono so the reader leaves with the differentiation phrase.
  caption: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(11px, 0.85vw, 14px)',
    fontWeight: 500,
    letterSpacing: '0.4px',
    color: 'rgba(255,255,255,0.5)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  captionCaret: { color: 'rgba(124,137,239,0.9)' },
  captionAccent: {
    color: '#fff',
    fontWeight: 600,
  },
}

export default function SlideBeyondOrchestration({ data } = {}) {
  const lang = data?.LANGUAGE || 'en'
  // Section uses a Yuno-specific label; reuse about_yuno_platform for parity.
  return (
    <SlideBase section={getCopy(lang, 'section.about_yuno_platform')} slideNumber={6}>
      <div style={styles.monoKicker}>
        <span style={styles.monoKickerCaret}>&gt;</span>
        beyond_orchestration
        <BeamRule />
      </div>

      <div style={styles.titleRow}>
        <h2 style={styles.title}>
          Yuno&rsquo;s payment infrastructure{' '}
          <span style={styles.titleAccent}>goes far beyond standard orchestration</span>
        </h2>
        <p style={styles.subtitle}>
          Conversion, UX, and security primitives built into the same platform,
          so the bank lands on Yuno once and inherits the rest.
        </p>
      </div>

      <div style={styles.body}>
        <div
          className="stagger"
          style={{
            ...styles.grid,
            '--stagger-base': '0.18s',
            '--stagger-step': '0.08s',
          }}
        >
          {CAPABILITIES.map((c) => {
            const Icon = c.icon
            return (
              <div
                key={c.label}
                className="border-beam"
                style={{ ...styles.card, '--beam-duration': '26s' }}
              >
                <span style={styles.cardIcon}>
                  <Icon size="60%" weight="regular" aria-hidden />
                </span>
                <div style={styles.cardLabel}>{c.label}</div>
                <p style={styles.cardBody}>{c.body}</p>
              </div>
            )
          })}
        </div>

        <div className="reveal" style={{ ...styles.caption, '--reveal-delay': '0.85s' }}>
          <span style={styles.captionCaret}>&gt;</span>
          <span>
            Routing is the entry point.{' '}
            <span style={styles.captionAccent}>
              Checkout, identity, and acceptance ship with it.
            </span>
          </span>
        </div>
      </div>
    </SlideBase>
  )
}
