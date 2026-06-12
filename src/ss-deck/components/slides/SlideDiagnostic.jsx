import { useMemo, useState } from 'react'
import {
  ArrowsSplit,
  CurrencyDollar,
  Globe,
  Graph,
  SquaresFour,
} from '@phosphor-icons/react'
import SlideBase from './SlideBase'
import BeamRule from '../BeamRule'
import { useTheme } from '../../lib/theme'
import { getCopy, getPainTag } from '../../lib/copy'

// Capability chips shown below the PSPs inside the diagnostic card. List
// mirrors the six ecosystem categories from the Infrastructure keynote
// slide (minus Processors/PSPs, which is already represented by the
// topology chips above), plus Subscriptions as a Yuno product capability.
// `matches` lets one chip light up when any of several underlying keys
// are in the merchant's capabilities_live array — used so KYC and KYB
// collapse into a single "KYC/KYB" chip without losing per-key fidelity
// in the data.
const CAPABILITY_DEFS_MERCHANT = [
  { key: 'payouts',       label: 'Payouts' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'tokenization',  label: 'Tokenization' },
  { key: 'fraud',         label: 'Fraud' },
  { key: 'kyc_kyb',       label: 'KYC/KYB', matches: ['kyc', 'kyb'] },
  { key: 'baas',          label: 'BaaS' },
  { key: 'tax',           label: 'Tax' },
]

// Banking version — the capability row reframes the same stack as
// white-label building blocks. None light up as "live" for banking
// mode; the whole row is opportunity space Yuno can fill.
const CAPABILITY_DEFS_BANKING = [
  { key: 'white-label',   label: 'White-Label' },
  { key: 'multi-tenant',  label: 'Multi-Tenant' },
  { key: 'reconciliation', label: 'Reconciliation' },
  { key: 'vault',         label: 'Vault' },
  { key: 'kyc_kyb',       label: 'KYC/KYB' },
  { key: 'tax',           label: 'Tax' },
  { key: 'baas',          label: 'BaaS' },
]

// Partner version — the capability row mirrors the ecosystem categories
// Yuno's catalog spans, framed as the neighbors this partner gets plugged
// in next to. "Live" lights up the categories the partner already has a
// direct integration with today; "Missing" surfaces the rest as adjacent
// catalog space they unlock by joining.
const CAPABILITY_DEFS_PARTNER = [
  { key: 'processors',    label: 'Processors' },
  { key: 'fraud',         label: 'Fraud' },
  { key: 'tax',           label: 'Tax' },
  { key: 'kyc_kyb',       label: 'KYC/KYB', matches: ['kyc', 'kyb'] },
  { key: 'baas',          label: 'BaaS' },
  { key: 'payouts',       label: 'Payouts' },
  { key: 'tokenization',  label: 'Tokenization' },
]

// 5 Phosphor icons — themes cover the broad categories every merchant
// pain list falls into, in order: infrastructure/dependency,
// global/cross-border, coverage/methods, routing/performance, cost.
// Bold weight for consistency with the rest of the deck's glyphs.
const PAIN_ICON_GLYPHS = [
  Graph,          // 01 Fragmentation (multi-PSP, disconnected topology)
  Globe,          // 02 Global / cross-border
  SquaresFour,    // 03 Coverage / methods grid
  ArrowsSplit,    // 04 Routing / flow
  CurrencyDollar, // 05 Cost / margin drag
]

function PainIcon({ i }) {
  const Glyph = PAIN_ICON_GLYPHS[i]
  if (!Glyph) return null
  return <Glyph size="100%" weight="regular" aria-hidden />
}

// Keyword-based taxonomy: title → { tag, desc, severity 0..1 }.
// Merchant-specific pain titles are authored case-by-case, but the
// underlying failure mode almost always falls into one of these 7
// buckets, so we derive the supporting copy from the title rather than
// require a `pain_descs` column in Supabase for all 207 merchants.
const PAIN_TAXONOMY = [
  { match: /outage|downtime|availab|uptime|single.?point|resilience|failover/i,
    tag: 'RESILIENCE', severity: 0.95,
    desc: 'A single-provider failure cascades into checkout downtime with no automatic fallback path.' },
  { match: /cross.?border|fx|foreign|international|currency|non.?usd/i,
    tag: 'CROSS-BORDER', severity: 0.9,
    desc: 'Foreign-issuer declines spike on international BINs without smart failover to a local acquirer.' },
  { match: /routing|orchestrat|multi.?psp|single.?psp|acquirer|provider|processor|fragment|stack/i,
    tag: 'ROUTING', severity: 0.88,
    desc: 'Static PSP rules can’t react to BIN, issuer health, or time-of-day, leaving auth uplift on the table.' },
  { match: /churn|recurring|retry|subscription|lifetime|ltv|recovery/i,
    tag: 'RECOVERY', severity: 0.82,
    desc: 'Failed recurring charges and soft declines silently erode lifetime value month after month.' },
  { match: /decline|auth.?loss|auth.?rate|approval|success.?rate/i,
    tag: 'AUTH RATE', severity: 0.85,
    desc: 'Every declined transaction is one retry, one issuer signal, one missed revenue moment, gone.' },
  { match: /apm|method|coverage|wallet|pix|upi|oxxo|local|localiz|card.?only|blik/i,
    tag: 'COVERAGE', severity: 0.75,
    desc: 'Missing local methods at checkout push shoppers to competitors who localized first.' },
  { match: /3ds|fraud|risk|chargeback|dispute|compliance|security|tokeniz/i,
    tag: 'SECURITY', severity: 0.7,
    desc: 'Unmanaged 3DS flows and fraud rules erode legitimate auth and invite chargebacks.' },
  { match: /reconcil|settle|finance|ledger|close|ops|operational/i,
    tag: 'OPERATIONS', severity: 0.6,
    desc: 'One reconciliation per PSP, per country, per currency. Finance teams close books on lag, not on time.' },
]
const DEFAULT_TAXONOMY = {
  tag: 'PAYMENTS', severity: 0.6,
  desc: 'A recurring failure mode in global payment stacks that quietly erodes authorization, margin, or time-to-market.',
}

function classifyPain(title) {
  if (!title) return DEFAULT_TAXONOMY
  for (const t of PAIN_TAXONOMY) if (t.match.test(title)) return t
  return DEFAULT_TAXONOMY
}

function PainCard({ p, i, styles, theme }) {
  const [hover, setHover] = useState(false)
  const cls = classifyPain(p.title)
  const desc = p.desc || cls.desc
  const accent = `rgba(62,79,224,${(0.35 + cls.severity * 0.5).toFixed(2)})`
  const num = String(i + 1).padStart(2, '0')
  // Staircase indent — card 0 pushed furthest left (narrowest), card 4
  // flush to the right edge (widest). Creates a half-pyramid with a
  // triangular empty region in the top-RIGHT of the column where the
  // "Analyzing stack" badge sits.
  const indentPct = (4 - i) * 7
  const baseBg = theme.isLight
    ? theme.bgElevated
    : 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.015) 100%)'
  const hoverBg = theme.isLight ? 'rgba(62,79,224,0.05)' : 'rgba(62,79,224,0.05)'
  const baseBorder = theme.borderSubtle
  const hoverBorder = 'rgba(62,79,224,0.2)'
  return (
    <div
      className="border-beam"
      style={{
        ...styles.painCard,
        marginRight: `${indentPct}%`,
        background: hover ? hoverBg : baseBg,
        borderColor: hover ? hoverBorder : baseBorder,
        borderLeftColor: accent,
        transform: hover ? 'translateX(-3px)' : 'translateX(0)',
        '--beam-delay': `${-i * 1.6}s`,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={styles.painIndex}>{num}</div>
      <div style={styles.painIcon}>
        <PainIcon i={i} />
      </div>
      <div style={styles.painBody}>
        <span style={styles.painTitle}>{p.title}</span>
        <p style={styles.painDesc}>{desc}</p>
      </div>
    </div>
  )
}

function TopologyLines({ count = 4, styles, theme }) {
  // Architecture diagram traces. On dark, lavender lines on near-black read
  // fine. On light, lavender disappears against white — swap to a darker
  // border tone so the topology stays legible. The animated beam keeps a
  // brand-blue tint in both themes; on light it lives on a darker stem so
  // it still pops.
  const stroke = theme.isLight ? theme.borderStrong : 'rgba(124,137,239,0.55)'
  const beamStroke = theme.isLight ? theme.accent : '#DDE3FB'
  const lineProps = {
    stroke,
    strokeWidth: '1.2',
    vectorEffect: 'non-scaling-stroke',
    strokeLinecap: 'round',
  }
  // Each drop line gets a faint bright beam sliding toward the PSP box via
  // stroke-dashoffset on pathLength=100. Staggered so the drops fire in
  // a rolling wave instead of in unison.
  const beamProps = {
    stroke: beamStroke,
    strokeWidth: '0.7',
    vectorEffect: 'non-scaling-stroke',
    strokeLinecap: 'round',
    pathLength: '100',
    strokeDasharray: '10 90',
    fill: 'none',
    filter: 'url(#topoBeamGlow)',
  }
  // Drop x-positions derived from a `repeat(count, 1fr)` grid so the lines
  // land exactly at each chip's horizontal center, regardless of how many
  // PSPs are real. Edge guard keeps single-PSP view centered under merchant.
  const n = Math.max(1, count)
  const cellW = 400 / n
  const drops = Array.from({ length: n }, (_, i) => cellW * (i + 0.5))
  const busX1 = drops[0]
  const busX2 = drops[drops.length - 1]
  return (
    <svg style={styles.topologyLines} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 400 40">
      <defs>
        <filter id="topoBeamGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.9" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* base tree — stem, trunk, drops */}
      <line x1="200" y1="0" x2="200" y2="18" {...lineProps} />
      {n > 1 && <line x1={busX1} y1="18" x2={busX2} y2="18" {...lineProps} />}
      {drops.map((x) => (
        <line key={x} x1={x} y1="18" x2={x} y2="40" {...lineProps} />
      ))}
      <circle cx="200" cy="18" r="2.2" fill={stroke} vectorEffect="non-scaling-stroke" />
      {/* beams flowing down each drop toward its PSP */}
      {drops.map((x, i) => (
        <line key={`beam-${x}`} x1={x} y1="18" x2={x} y2="40" {...beamProps}>
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-100"
            dur="5.5s"
            begin={`${-i * 1.3}s`}
            repeatCount="indefinite"
          />
        </line>
      ))}
      {/* beam flowing from merchant down to the trunk junction */}
      <line x1="200" y1="0" x2="200" y2="18" {...beamProps}>
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to="-100"
          dur="4s"
          repeatCount="indefinite"
        />
      </line>
    </svg>
  )
}

export default function SlideDiagnostic({ data }) {
  const theme = useTheme()
  const isBanking = data?.MODE === 'banking'
  const isPartner = data?.MODE === 'partner'
  const lang = data?.LANGUAGE || 'en'
  const t = (key) => getCopy(lang, key)
  const sectionLabel = isBanking ? t('section.banking_vertical')
    : isPartner ? t('section.partner_program')
    : t('section.payments_diagnostic')
  const CAPABILITY_DEFS = isBanking ? CAPABILITY_DEFS_BANKING
    : isPartner ? CAPABILITY_DEFS_PARTNER
    : CAPABILITY_DEFS_MERCHANT
  const pains = [
    { num: '01', title: data.PAIN_1_TITLE, tag: data.PAIN_1_TAG, desc: data.PAIN_1_DESC },
    { num: '02', title: data.PAIN_2_TITLE, tag: data.PAIN_2_TAG, desc: data.PAIN_2_DESC },
    { num: '03', title: data.PAIN_3_TITLE, tag: data.PAIN_3_TAG, desc: data.PAIN_3_DESC },
    { num: '04', title: data.PAIN_4_TITLE, tag: data.PAIN_4_TAG, desc: data.PAIN_4_DESC },
    { num: '05', title: data.PAIN_5_TITLE, tag: data.PAIN_5_TAG, desc: data.PAIN_5_DESC },
  ]

  // Render only the PSPs that came from research. If a merchant has 2,
  // 3, or 4 entries in Supabase, render that many chips. No filler
  // padding — the topology should reflect ground truth, not a default
  // four-box layout.
  const psps = useMemo(() => {
    const arr = Array.isArray(data.PSPS) ? data.PSPS : []
    return arr
      .map((p) => (typeof p === 'string' ? { name: p } : p))
      .filter((p) => p && p.name)
      .slice(0, 4)
  }, [data.PSPS])

  // Capability live-set: slugs in CAPABILITIES_LIVE render as green "live"
  // chips, everything else renders as a gray "upsell" chip. Accept a couple
  // of spelling variants so Supabase / JSON shapes are forgiving.
  const liveSet = useMemo(() => {
    const raw = data.CAPABILITIES_LIVE || data.capabilities_live || []
    return new Set((Array.isArray(raw) ? raw : []).map((s) => String(s).toLowerCase()))
  }, [data.CAPABILITIES_LIVE, data.capabilities_live])

  const styles = {
    body: {
      flex: 1,
      display: 'flex',
      gap: '3%',
      minHeight: 0,
    },
    left: {
      flex: 1.05,
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(7px, 0.65vw, 12px)',
      position: 'relative',
      // Top buffer aligns the first pain card with the "Diagnostic / Today's
      // topology" heading on the right (offset = right-column monoKicker +
      // gap + diagnosticCard padding-top).
      paddingTop: 'clamp(48px, 4.5vw, 76px)',
    },
    // "Analyzing stack" badge sits in the (now right-side) pains column at the
    // same vertical position as the "Diagnostic / Today's topology" heading on
    // the left, anchored to the triangular gap on the top-RIGHT created by the
    // staircase indent of card 01 (now indented from the right).
    runningBadge: {
      position: 'absolute',
      top: 'clamp(48px, 4.5vw, 76px)',
      right: 'clamp(6px, 0.8vw, 14px)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '7px',
      padding: 'clamp(5px, 0.45vw, 8px) clamp(9px, 0.8vw, 14px)',
      background: 'rgba(251,146,60,0.12)',
      border: '1px solid rgba(251,146,60,0.38)',
      borderRadius: '100px',
      fontSize: 'clamp(9px, 0.68vw, 11.5px)',
      fontWeight: 700,
      letterSpacing: '1.2px',
      textTransform: 'uppercase',
      color: '#FB923C',
      boxShadow: '0 0 20px rgba(251,146,60,0.12)',
      zIndex: 0,
    },
    runningDot: {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: '#FB923C',
      animation: 'pulseStrong 1.8s ease-in-out infinite',
    },
    title: {
      fontFamily: 'var(--font-display)',
      // Matches slides 6/7 — deck-wide title reference size.
      fontSize: 'clamp(28px, 2.7vw, 52px)',
      fontWeight: 500,
      letterSpacing: '-1.2px',
      lineHeight: 1.1,
      color: theme.ink,
      margin: 0,
      marginBottom: 'clamp(28px, 2.6vw, 48px)',
    },
    // Accent half of the slide title — matches the gradient used on Cover,
    // Product Suite, and Global Presence titles so the emphasized phrase
    // reads the same across the deck.
    titleAccent: {
      backgroundImage: theme.isLight
        ? `linear-gradient(135deg, ${theme.accentDeep} 0%, ${theme.accent} 100%)`
        : 'linear-gradient(135deg, #5967E4 0%, #BDC3F6 55%, #3E4FE0 100%)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      color: 'transparent',
      fontWeight: 700,
    },
    monoKicker: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'clamp(10px, 0.78vw, 13px)',
      fontWeight: 500,
      letterSpacing: '0.4px',
      color: theme.inkMuted,
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      marginBottom: 'clamp(6px, 0.6vw, 10px)',
    },
    monoKickerCaret: {
      color: theme.isLight ? theme.accent : 'rgba(124,137,239,0.9)',
    },
    monoKickerRule: {
      flex: 1,
      height: '1px',
      background: theme.beamBase,
    },
    painCard: {
      flex: 1,
      display: 'grid',
      gridTemplateColumns: 'auto auto 1fr',
      alignItems: 'center',
      gap: 'clamp(12px, 1vw, 18px)',
      padding: 'clamp(10px, 0.85vw, 15px) clamp(14px, 1.2vw, 22px)',
      background: theme.isLight
        ? theme.bgElevated
        : 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.015) 100%)',
      border: `1px solid ${theme.borderSubtle}`,
      borderLeft: `3px solid ${theme.borderAccent}`,
      borderRadius: '12px',
      transition: 'all 0.25s ease',
      minHeight: 0,
      position: 'relative',
      overflow: 'hidden',
      zIndex: 1,
      boxShadow: theme.cardShadow,
    },
    painIndex: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'clamp(22px, 2vw, 36px)',
      fontWeight: 700,
      color: theme.isLight ? theme.accent : 'rgba(180,189,255,0.95)',
      letterSpacing: '-0.03em',
      display: 'flex',
      alignItems: 'baseline',
      gap: '3px',
      flexShrink: 0,
      lineHeight: 1,
    },
    // Standalone filled-silhouette icon, no container box. Sits on the card
    // bg directly so the visual weight comes from the glyph itself.
    painIcon: {
      width: 'clamp(34px, 2.7vw, 48px)',
      height: 'clamp(34px, 2.7vw, 48px)',
      color: theme.inkMuted,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    painBody: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(3px, 0.3vw, 6px)',
      minWidth: 0,
    },
    painTitle: {
      fontSize: 'clamp(14px, 1.1vw, 20px)',
      fontWeight: 700,
      color: theme.ink,
      letterSpacing: '-0.2px',
      lineHeight: 1.15,
      minWidth: 0,
    },
    painDesc: {
      fontSize: 'clamp(10.5px, 0.82vw, 13.5px)',
      fontWeight: 400,
      color: theme.inkMuted,
      lineHeight: 1.4,
      margin: 0,
      letterSpacing: '0.01em',
    },
    right: {
      flex: 0.95,
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(8px, 0.8vw, 14px)',
    },
    diagnosticCard: {
      flex: 1,
      background: theme.isLight
        ? theme.cardGradientAccent
        : 'linear-gradient(135deg, rgba(62,79,224,0.06) 0%, rgba(0,0,0,0.6) 100%)',
      border: `1px solid ${theme.isLight ? theme.borderDefault : 'rgba(255,255,255,0.08)'}`,
      borderRadius: '14px',
      padding: 'clamp(16px, 1.35vw, 26px)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(10px, 0.9vw, 18px)',
      backdropFilter: theme.isLight ? 'none' : 'blur(10px)',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: theme.cardShadow,
    },
    diagHeaderRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    diagHeaderLeft: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(6px, 0.5vw, 10px)',
    },
    diagLabel: {
      fontSize: 'clamp(10px, 0.75vw, 13px)',
      fontWeight: 700,
      letterSpacing: '1.6px',
      textTransform: 'uppercase',
      color: theme.isLight ? theme.accent : 'rgba(124,137,239,0.9)',
    },
    diagTitle: {
      fontFamily: 'var(--font-display)',
      fontSize: 'clamp(20px, 1.6vw, 30px)',
      fontWeight: 700,
      color: theme.ink,
      letterSpacing: '-0.3px',
    },
    liveBadge: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: 'clamp(6px, 0.5vw, 9px) clamp(12px, 1vw, 18px)',
      background: 'rgba(74,222,128,0.1)',
      border: '1px solid rgba(74,222,128,0.25)',
      borderRadius: '100px',
      fontSize: 'clamp(10px, 0.8vw, 14px)',
      fontWeight: 700,
      letterSpacing: '1.2px',
      textTransform: 'uppercase',
      color: theme.isLight ? '#16A34A' : '#4ade80',
    },
    liveDot: {
      width: '7px',
      height: '7px',
      borderRadius: '50%',
      background: theme.isLight ? '#16A34A' : '#4ade80',
      boxShadow: '0 0 10px rgba(74,222,128,0.7)',
      animation: 'pulse 2s infinite',
    },
    // TOPOLOGY DIAGRAM — natural height, hugs the header. Methods section
    // sits tight below (tight grouping + divider as the "but…" contrast).
    topology: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: '0',
      paddingBottom: '0',
    },
    merchantNode: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'clamp(12px, 1.1vw, 22px) clamp(28px, 2.3vw, 44px)',
      minHeight: 'clamp(58px, 4.8vw, 82px)',
      background: theme.isLight
        ? 'linear-gradient(135deg, rgba(62,79,224,0.10) 0%, rgba(89,103,228,0.06) 100%)'
        : 'linear-gradient(135deg, rgba(62,79,224,0.2) 0%, rgba(89,103,228,0.15) 100%)',
      border: `1px solid ${theme.borderAccent}`,
      borderRadius: '12px',
      boxShadow: theme.isLight
        ? '0 0 24px rgba(62,79,224,0.10)'
        : '0 0 24px rgba(62,79,224,0.3)',
    },
    merchantLogo: {
      height: 'clamp(32px, 2.8vw, 52px)',
      maxWidth: 'clamp(200px, 17vw, 280px)',
      objectFit: 'contain',
      display: 'block',
      filter: theme.invertLogos ? 'brightness(0) invert(1)' : 'brightness(0)',
    },
    // Tile-type merchant boost: compact-glyph marks render at ~160% the
    // height of wordmarks so the silhouette weight lines up.
    merchantLogoTile: {
      height: 'clamp(52px, 4.5vw, 84px)',
      maxWidth: 'clamp(120px, 10vw, 170px)',
      objectFit: 'contain',
      display: 'block',
      filter: theme.invertLogos ? 'brightness(0) invert(1)' : 'brightness(0)',
    },
    merchantNodeText: {
      fontSize: 'clamp(26px, 2.3vw, 40px)',
      fontWeight: 700,
      color: theme.ink,
      letterSpacing: '-0.3px',
    },
    topologyLines: {
      width: '100%',
      height: 'clamp(28px, 2.6vw, 44px)',
      display: 'block',
      margin: 'clamp(6px, 0.5vw, 10px) 0 clamp(4px, 0.3vw, 6px)',
      pointerEvents: 'none',
    },
    pspRow: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 'clamp(6px, 0.5vw, 10px)',
      width: '100%',
    },
    illustrativeNote: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'clamp(8px, 0.6vw, 10px)',
      fontWeight: 500,
      letterSpacing: '0.3px',
      color: theme.inkFaint,
      marginTop: 'clamp(6px, 0.5vw, 10px)',
      textAlign: 'left',
      // Parent topology flex column uses alignItems:center, which would
      // otherwise collapse this div to content-width and center it.
      // Stretching wins back full width so textAlign:left actually reads.
      alignSelf: 'stretch',
      width: '100%',
    },
    pspCard: {
      background: theme.isLight ? theme.surface1 : 'rgba(0,0,0,0.8)',
      border: `1px solid ${theme.borderDefault}`,
      borderRadius: '10px',
      padding: 'clamp(10px, 0.85vw, 16px) clamp(10px, 0.8vw, 14px)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(4px, 0.35vw, 7px)',
      alignItems: 'center',
      textAlign: 'center',
      justifyContent: 'center',
      minHeight: 'clamp(56px, 4.6vw, 82px)',
    },
    pspName: {
      fontFamily: 'var(--font-display)',
      fontSize: 'clamp(17px, 1.5vw, 28px)',
      fontWeight: 700,
      color: theme.ink,
      letterSpacing: '-0.4px',
      lineHeight: 1.08,
    },
    pspRole: {
      fontSize: 'clamp(10px, 0.78vw, 14px)',
      fontWeight: 500,
      color: theme.inkMuted,
      lineHeight: 1.3,
    },
    divider: {
      height: '1px',
      background: theme.isLight
        ? `linear-gradient(90deg, transparent 0%, ${theme.borderDefault} 50%, transparent 100%)`
        : 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
      margin: 'clamp(4px, 0.3vw, 6px) 0',
    },
    methodsSection: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(10px, 0.85vw, 16px)',
    },
    methodsHeaderRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    methodsLabel: {
      fontSize: 'clamp(11px, 0.85vw, 15px)',
      fontWeight: 700,
      letterSpacing: '1.6px',
      textTransform: 'uppercase',
      color: theme.isLight ? theme.accent : 'rgba(124,137,239,0.9)',
    },
    methodsHint: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: 'clamp(11px, 0.82vw, 14px)',
      fontWeight: 600,
      color: theme.inkMuted,
    },
    warningDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: '#FB923C',
      boxShadow: '0 0 10px rgba(251,146,60,0.75)',
      animation: 'pulse 2s infinite',
      flexShrink: 0,
    },
    methodsGrid: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 'clamp(8px, 0.65vw, 12px)',
    },
    methodPill: {
      padding: 'clamp(10px, 0.8vw, 15px) clamp(14px, 1.1vw, 20px)',
      background: theme.isLight ? 'rgba(62,79,224,0.05)' : 'rgba(124,137,239,0.06)',
      border: `1px solid ${theme.isLight ? 'rgba(62,79,224,0.20)' : 'rgba(124,137,239,0.22)'}`,
      borderRadius: '10px',
      fontSize: 'clamp(12px, 0.95vw, 16px)',
      fontWeight: 600,
      color: theme.ink,
      letterSpacing: '0px',
    },
    methodPillMethod: {
      color: theme.ink,
    },
    methodPillSep: {
      color: theme.isLight ? 'rgba(62,79,224,0.5)' : 'rgba(124,137,239,0.5)',
      margin: '0 4px',
    },

    // ---------- Capability chips (live vs upsell) ----------
    // Row of 4 capability indicators below the PSPs inside the topology card:
    // green dot = merchant has it live today, gray dot = upsell opportunity
    // for Yuno. Voice-over sells it on stage; here the color just signals it.
    capabilitiesSection: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(8px, 0.7vw, 12px)',
    },
    capabilitiesHeaderRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    capabilitiesLabel: {
      fontSize: 'clamp(11px, 0.85vw, 15px)',
      fontWeight: 700,
      letterSpacing: '1.6px',
      textTransform: 'uppercase',
      color: theme.isLight ? theme.accent : 'rgba(124,137,239,0.9)',
    },
    capabilitiesLegend: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '14px',
      fontSize: 'clamp(9px, 0.66vw, 11px)',
      fontWeight: 600,
      letterSpacing: '1.2px',
      textTransform: 'uppercase',
      color: theme.inkMuted,
    },
    capabilitiesLegendItem: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
    },
    capabilitiesGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gap: 'clamp(5px, 0.45vw, 9px)',
    },
    capChip: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'clamp(6px, 0.55vw, 9px)',
      // Padding matches methodPill below so both chip rows share one silhouette.
      padding: 'clamp(10px, 0.8vw, 15px) clamp(14px, 1.1vw, 20px)',
      borderRadius: '10px',
    },
    capChipLive: {
      background: 'rgba(74,222,128,0.08)',
      border: `1px solid ${theme.isLight ? 'rgba(22,163,74,0.32)' : 'rgba(74,222,128,0.28)'}`,
    },
    capChipOff: {
      background: theme.surface0,
      border: `1px solid ${theme.borderSubtle}`,
    },
    capChipDot: {
      width: '7px',
      height: '7px',
      borderRadius: '50%',
      flexShrink: 0,
    },
    capChipDotLive: {
      background: theme.isLight ? '#16A34A' : '#4ade80',
      boxShadow: '0 0 8px rgba(74,222,128,0.7)',
    },
    capChipDotOff: {
      background: theme.inkFaint,
    },
    capChipLabel: {
      fontSize: 'clamp(12px, 0.95vw, 16px)',
      fontWeight: 600,
      letterSpacing: '0px',
      whiteSpace: 'nowrap',
    },
    capChipLabelLive: {
      color: theme.ink,
    },
    capChipLabelOff: {
      color: theme.inkMuted,
    },
  }

  return (
    <SlideBase section={sectionLabel} slideNumber={3}>
      <h2 style={styles.title}>
        {isBanking ? (
          <>
            {t('diagnostic.title_banking_lead')}{' '}
            <span style={styles.titleAccent}>{t('diagnostic.title_banking_accent')}</span>
          </>
        ) : isPartner ? (
          <>
            {t('diagnostic.title_partner_lead')}{' '}
            <span style={styles.titleAccent}>{data.COMPANY_NAME}</span>{' '}
            {t('diagnostic.title_partner_post')}
          </>
        ) : (
          <>
            {t('diagnostic.title_merchant_lead')}{' '}
            <span style={styles.titleAccent}>{t('diagnostic.title_merchant_accent').replace('{name}', data.COMPANY_NAME || '')}</span>
          </>
        )}
      </h2>

      <div style={styles.body}>
        <div style={styles.right}>
          <div style={styles.monoKicker}>
            <span style={styles.monoKickerCaret}>&gt;</span>
            {t('diagnostic.kicker')}
            <BeamRule base={theme.beamBase} beam={theme.beam} />
          </div>
          <div
            className="border-beam reveal"
            style={{ ...styles.diagnosticCard, '--beam-duration': '24s', '--reveal-delay': '0.25s' }}
          >
            <div style={styles.diagHeaderRow}>
              <div style={styles.diagHeaderLeft}>
                <div style={styles.diagLabel}>{isBanking ? t('diagnostic.diag_label_banking') : isPartner ? t('diagnostic.diag_label_partner') : t('diagnostic.diag_label_merchant')}</div>
                <div style={styles.diagTitle}>{isBanking ? t('diagnostic.diag_title_banking') : isPartner ? t('diagnostic.diag_title_partner') : t('diagnostic.diag_title_merchant')}</div>
              </div>
              <div style={styles.liveBadge}>
                <div style={styles.liveDot} />
                <span>{t('diagnostic.live_badge')}</span>
              </div>
            </div>

            <div style={styles.topology}>
              <div style={styles.merchantNode}>
                {data.COMPANY_LOGO ? (
                  <img
                    src={data.COMPANY_LOGO_MONO || data.COMPANY_LOGO}
                    alt={data.COMPANY_NAME}
                    style={data.COMPANY_LOGO_MONO ? styles.merchantLogoTile : styles.merchantLogo}
                  />
                ) : (
                  <span style={styles.merchantNodeText}>{data.COMPANY_NAME}</span>
                )}
              </div>

              {psps.length > 0 ? (
                <>
                  <TopologyLines count={psps.length} styles={styles} theme={theme} />
                  <div className="stagger" style={{ ...styles.pspRow, gridTemplateColumns: `repeat(${psps.length}, 1fr)`, '--stagger-base': '0.55s', '--stagger-step': '0.06s' }}>
                    {psps.map((psp) => (
                      <div key={psp.name} style={styles.pspCard}>
                        <span style={styles.pspName}>{psp.name}</span>
                        {data.SHOW_PSP_ROLES && psp.role && (
                          <span style={styles.pspRole}>{psp.role}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={styles.illustrativeNote}>
                    &gt; {data.PSPS_DISCLAIMER || t('diagnostic.illustrative_note')}
                  </div>
                </>
              ) : (
                <>
                  <TopologyLines count={1} styles={styles} theme={theme} />
                  <div className="stagger" style={{ ...styles.pspRow, gridTemplateColumns: '1fr', '--stagger-base': '0.55s', '--stagger-step': '0.06s' }}>
                    <div style={styles.pspCard}>
                      <span style={{ ...styles.pspName, opacity: 0.6, fontStyle: 'italic', fontWeight: 500 }}>
                        {t('diagnostic.no_psps_disclosed')}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {!isBanking && (
              <>
                <div style={styles.divider} />

                <div style={styles.capabilitiesSection}>
                  <div style={styles.capabilitiesHeaderRow}>
                    <span style={styles.capabilitiesLabel}>{isPartner ? t('diagnostic.capability_label_partner') : t('diagnostic.capability_label_merchant')}</span>
                    <span style={styles.capabilitiesLegend}>
                      <span style={styles.capabilitiesLegendItem}>
                        <span style={{ ...styles.capChipDot, ...styles.capChipDotLive }} />
                        {t('diagnostic.legend_live')}
                      </span>
                      <span style={styles.capabilitiesLegendItem}>
                        <span style={{ ...styles.capChipDot, ...styles.capChipDotOff }} />
                        {t('diagnostic.legend_missing')}
                      </span>
                    </span>
                  </div>
                  <div style={styles.capabilitiesGrid}>
                    {CAPABILITY_DEFS.map((cap) => {
                      const live = cap.matches
                        ? cap.matches.some((k) => liveSet.has(k))
                        : liveSet.has(cap.key)
                      return (
                        <div
                          key={cap.key}
                          style={{
                            ...styles.capChip,
                            ...(live ? styles.capChipLive : styles.capChipOff),
                          }}
                        >
                          <span
                            style={{
                              ...styles.capChipDot,
                              ...(live ? styles.capChipDotLive : styles.capChipDotOff),
                            }}
                          />
                          <span
                            style={{
                              ...styles.capChipLabel,
                              ...(live ? styles.capChipLabelLive : styles.capChipLabelOff),
                            }}
                          >
                            {cap.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}

            <div style={styles.divider} />

            <div style={styles.methodsSection}>
              <div style={styles.methodsHeaderRow}>
                <span style={styles.methodsLabel}>
                  {isBanking ? t('diagnostic.methods_label_banking')
                    : isPartner ? t('diagnostic.methods_label_partner')
                    : t('diagnostic.methods_label_merchant')}
                </span>
              </div>
              <div className="stagger" style={{ ...styles.methodsGrid, '--stagger-base': '0.9s', '--stagger-step': '0.04s' }}>
                {(data.LOCAL_METHODS_MISSING || []).map((m, i) => (
                  <span key={i} style={styles.methodPill}>
                    <span style={styles.methodPillMethod}>{m.method}</span>
                    <span style={styles.methodPillSep}>·</span>
                    {m.market}
                  </span>
                ))}
              </div>
              <div style={styles.illustrativeNote}>&gt; {t('diagnostic.non_exhaustive')}</div>
            </div>
          </div>
        </div>

        <div className="stagger" style={{ ...styles.left, '--stagger-base': '0.1s', '--stagger-step': '0.08s' }}>
          <div style={styles.runningBadge}>
            <div style={styles.runningDot} />
            <span>{t('diagnostic.analyzing_stack')}</span>
          </div>
          {pains.map((p, i) => (
            <PainCard key={p.num} p={p} i={i} styles={styles} theme={theme} />
          ))}
        </div>
      </div>
    </SlideBase>
  )
}
