import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { ChartLineDown, Receipt } from '@phosphor-icons/react'
import SlideBase from './SlideBase'
import { useTheme } from '../../lib/theme'
import { getCopy } from '../../lib/copy'

// Six provider categories that Yuno unifies behind one platform. Matches the
// Juan Pablo keynote visual, minus the Latin America flag strip (we want
// this slide agnostic) and minus the "future" right-rail (we only keep the
// present-state observations + the bottom cost stats, per call feedback).
// Each provider is either a plain name (renders as a text pill) or an
// object with { name, logo } (renders the logo inverted to white). Logos
// live in /public/logos/providers/ and /public/company-logos/ — we use
// whichever is already available. Missing logos gracefully fall back to
// the name-only pill so the row still balances visually.
// Each category has a `layout` that controls how its provider logos arrange
// around the box, mimicking a loose "connection cloud":
//   - 'top-cloud'  : logos float above the box (top-row categories)
//   - 'side'       : logos sit tight next to the box (middle-row categories)
//   - 'side-bottom': half the logos sit beside the box, the rest below it
//                    (bottom-row categories)
// Unified category layout: each row renders its 3 provider logos in a
// single inline row ABOVE the category box. Same structure for all six
// categories so the diagram reads as a clean ordered ecosystem instead of
// three competing layouts.
const CATEGORIES_LEFT = [
  { label: 'Processors / PSPs', providers: [
    { name: 'Stripe',   logo: '/ss-deck-assets/company-logos/stripe.png' },
    { name: 'PayPal',   logo: '/ss-deck-assets/company-logos/paypal.png' },
    { name: 'Worldpay', logo: '/ss-deck-assets/company-logos/worldpay.png' },
  ]},
  { label: 'BaaS Providers', providers: [
    { name: 'Green Dot', logo: '/ss-deck-assets/logos/providers/green-dot.svg' },
    { name: 'Mambu',     logo: '/ss-deck-assets/logos/providers/mambu.png' },
    { name: 'Galileo',   logo: '/ss-deck-assets/logos/providers/galileo.png' },
  ]},
  { label: 'KYC / KYB Providers', providers: [
    { name: 'Jumio',    logo: '/ss-deck-assets/logos/providers/jumio.png' },
    { name: 'Onfido',   logo: '/ss-deck-assets/logos/providers/onfido.png' },
    { name: 'Persona',  logo: '/ss-deck-assets/logos/providers/persona.png' },
  ]},
]

const CATEGORIES_RIGHT = [
  { label: 'Fraud Providers', providers: [
    { name: 'Sift',         logo: '/ss-deck-assets/logos/providers/sift.png' },
    { name: 'Kount',        logo: '/ss-deck-assets/logos/providers/kount.png' },
    { name: 'Riskified',    logo: '/ss-deck-assets/logos/providers/riskified.png' },
  ]},
  { label: 'Tax Calculation', providers: [
    { name: 'Avalara',  logo: '/ss-deck-assets/logos/providers/avalara.svg' },
    { name: 'Vertex',   logo: '/ss-deck-assets/logos/providers/vertex.png' },
    { name: 'Sovos',    logo: '/ss-deck-assets/logos/providers/sovos.svg' },
  ]},
  { label: 'Payout Providers', providers: [
    { name: 'Wise',         logo: '/ss-deck-assets/logos/providers/wise.svg' },
    { name: 'Payoneer',     logo: '/ss-deck-assets/logos/providers/payoneer.png' },
    { name: 'Thunes',       logo: '/ss-deck-assets/logos/providers/thunes.png' },
  ]},
]

// Per-logo optical-size adjustments. Most logos render at the uniform
// base size set in ProviderLogoImg below; this map only overrides the
// outliers where a logo's aspect ratio makes it look visually heavier
// or lighter than its neighbors at the shared size. Default = 1.0.
// Banking-mode swap: BaaS isn't a category a bank wants to see (Green Dot
// / Mambu read as core-banking competitors), so we replace the BaaS slot
// with Pay-by-Bank — banks' own rail and a category they actively want to
// own. Merchant + partner modes keep the original BaaS lineup.
const PAY_BY_BANK_CATEGORY = { label: 'Pay-by-Bank', providers: [
  { name: 'Plaid',     logo: '/ss-deck-assets/logos/providers/plaid.png' },
  { name: 'TrueLayer', logo: '/ss-deck-assets/logos/providers/truelayer.png' },
  { name: 'Trustly',   logo: '/ss-deck-assets/logos/providers/trustly.png' },
]}

const LOGO_SCALES = {
  visa:    0.85,  // chunky bold serif — too heavy at default
  persona: 1.15,  // tall asterisk-and-bar — needs a small lift to read
  galileo: 1.1,   // square G mark sits smaller than surrounding wordmarks
}

// Decorative isometric stack: 8 glowing layered slabs viewed from a slight
// 3D angle. Echoes the capabilities-stack reference image she sent. Pure
// SVG, sits behind the bullets at low opacity. Top slab is brightest, the
// rest fade down so the stack reads as energy emerging from a base.
function ObservationsBackdrop() {
  const slabCount = 17
  const slabH = 18           // front-face height
  const slabGap = 26         // vertical step between slabs
  const skewX = 28           // isometric run on the top face
  const slabW = 220          // width of front face
  const baseY = 470          // y of bottom slab front-top edge
  return (
    <svg
      viewBox="0 0 460 540"
      preserveAspectRatio="xMidYMid meet"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        opacity: 0.55,
      }}
      aria-hidden
    >
      <defs>
        <linearGradient id="slabFront" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#5967E4" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#1B2150" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="slabTop" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"  stopColor="#BDC3F6" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#3E4FE0" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="slabSide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#3E4FE0" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#0A0E2A" stopOpacity="0.05" />
        </linearGradient>
        <radialGradient id="bgGlow" cx="0.7" cy="0.85" r="0.9">
          <stop offset="0%"  stopColor="#3E4FE0" stopOpacity="0.18" />
          <stop offset="60%" stopColor="#3E4FE0" stopOpacity="0" />
        </radialGradient>
        <filter id="slabGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>

      <rect x="0" y="0" width="460" height="540" fill="url(#bgGlow)" />

      <g transform="translate(120 0)">
        {Array.from({ length: slabCount }).map((_, i) => {
          const idx = slabCount - 1 - i      // 0 = top
          const y = baseY - i * slabGap
          const fade = 0.35 + (idx / (slabCount - 1)) * 0.65
          return (
            <g key={i} opacity={fade}>
              {/* right side face */}
              <polygon
                points={`${slabW},${y} ${slabW + skewX},${y - skewX * 0.45} ${slabW + skewX},${y + slabH - skewX * 0.45} ${slabW},${y + slabH}`}
                fill="url(#slabSide)"
                stroke="rgba(124,137,239,0.35)"
                strokeWidth="0.6"
              />
              {/* top face */}
              <polygon
                points={`0,${y} ${slabW},${y} ${slabW + skewX},${y - skewX * 0.45} ${skewX},${y - skewX * 0.45}`}
                fill="url(#slabTop)"
                stroke="rgba(189,195,246,0.55)"
                strokeWidth="0.6"
              />
              {/* front face */}
              <rect
                x="0" y={y} width={slabW} height={slabH}
                fill="url(#slabFront)"
                stroke="rgba(124,137,239,0.45)"
                strokeWidth="0.6"
              />
              {/* top edge highlight */}
              <line
                x1="0" y1={y} x2={slabW} y2={y}
                stroke="#DDE3FB"
                strokeOpacity={0.35 + (idx / (slabCount - 1)) * 0.4}
                strokeWidth="0.8"
                filter="url(#slabGlow)"
              />
            </g>
          )
        })}
      </g>
    </svg>
  )
}

function buildObservations(styles) {
  return {
    merchant: [
      {
        render: () => (
          <>Each market has different <span style={styles.observationStrong}>providers</span>, <span style={styles.observationStrong}>local
            rails</span>, <span style={styles.observationStrong}>regulations</span>, and{' '}
            <span style={styles.observationStrong}>fraud patterns</span></>
        ),
      },
      {
        render: () => (
          <><span style={styles.observationStrong}>Long chains of intermediaries</span> just to reach{' '}
            <span style={styles.observationStrong}>local wallets and methods</span></>
        ),
      },
      {
        render: () => (
          <><span style={styles.observationStrong}>Every new market</span> implies{' '}
            <span style={styles.observationStrong}>months of integrations</span> for your team</>
        ),
      },
    ],
    // Partner version: reframes the three observations as the reasons a
    // partner (APM, PSP, fraud, consulting, acquirer) wins by plugging into
    // Yuno's merchant footprint rather than selling one merchant at a time.
    partner: [
      {
        render: () => (
          <><span style={styles.observationStrong}>2,000+ enterprise merchants</span> already run
            on Yuno. One integration activates your solution across all of them.</>
        ),
      },
      {
        render: () => (
          <>Stop prospecting cold. Yuno’s sales team delivers{' '}
            <span style={styles.observationStrong}>pre-qualified warm introductions</span>{' '}
            from live enterprise deals.</>
        ),
      },
      {
        render: () => (
          <>Yuno carries the{' '}
            <span style={styles.observationStrong}>sandbox, certification, go-live, and
            maintenance</span>. You keep pricing, contract, and the customer.</>
        ),
      },
    ],
    // Banking version: the three observations are benefits the bank inherits
    // by plugging into Yuno. Each line reads as something the bank executive
    // underlines — reach, regional expansion, brand control.
    banking: [
      {
        render: () => (
          <>Your merchants gain <span style={styles.observationStrong}>1,000+ payment methods</span>{' '}
            and <span style={styles.observationStrong}>460+ integrations</span> without touching a
            single new API.</>
        ),
      },
      {
        render: () => (
          <>Extend your perimeter across <span style={styles.observationStrong}>LATAM, APAC, and
            MEA</span> on day one, under your brand.</>
        ),
      },
      {
        render: () => (
          <>Keep the <span style={styles.observationStrong}>customer relationship</span>, the{' '}
            <span style={styles.observationStrong}>brand</span>, and the commercials. Yuno is the
            engine underneath.</>
        ),
      },
    ],
  }
}

function buildStats(styles) {
  return {
    merchant: [
      {
        number: '$1–2M',
        render: () => (<>cost to <span style={styles.statTextStrong}>set up and manage</span> each direct PSP connection</>),
        icon: <Receipt size={20} weight="regular" aria-hidden />,
      },
      {
        number: '$118B',
        render: () => (<>lost annually to <span style={styles.statTextStrong}>failed payments</span> industry-wide</>),
        icon: <ChartLineDown size={20} weight="regular" aria-hidden />,
      },
    ],
    // Partner stats read as the distribution and volume a partner gains
    // the moment it is live inside Yuno's catalog.
    partner: [
      {
        number: '2,000+',
        render: () => (<><span style={styles.statTextStrong}>enterprise merchants</span> live on Yuno, one-click activation for your solution</>),
        icon: <Receipt size={20} weight="regular" aria-hidden />,
      },
      {
        number: '$80B+',
        render: () => (<><span style={styles.statTextStrong}>TPV per year</span> routed through Yuno, ready to flow through your rails</>),
        icon: <ChartLineDown size={20} weight="regular" aria-hidden />,
      },
    ],
    // Banking stats read as the scale the bank inherits the moment it plugs
    // in — coverage and reach, not competitive commentary.
    banking: [
      {
        number: '460+',
        render: () => (<><span style={styles.statTextStrong}>integrations</span> ready to ship under your brand, no new contracts to sign</>),
        icon: <ChartLineDown size={20} weight="regular" aria-hidden />,
      },
      {
        number: '1,000+',
        render: () => (<><span style={styles.statTextStrong}>local methods</span> from Pix to UPI to mada, live in your merchants’ checkouts</>),
        icon: <Receipt size={20} weight="regular" aria-hidden />,
      },
    ],
  }
}

function providerSlug(logoPath) {
  // "/ss-deck-assets/logos/providers/visanet.png" → "visanet"
  const base = logoPath.split('/').pop() || ''
  return base.replace(/\.[^.]+$/, '').toLowerCase()
}

function ProviderLogoImg({ name, logo, styles }) {
  const scale = LOGO_SCALES[providerSlug(logo)] ?? 1
  // Uniform base size across all 18 provider logos. Bigger than before
  // so the marks read clearly at presentation scale. The per-slug scale
  // in LOGO_SCALES nudges outliers up/down so none reads as a dwarf or
  // a giant next to its neighbors.
  const height   = `clamp(${28 * scale}px, ${2.4 * scale}vw, ${40 * scale}px)`
  const maxWidth = `clamp(${76 * scale}px, ${6.6 * scale}vw, ${110 * scale}px)`
  return (
    <img src={logo} alt={name} style={{ ...styles.providerLogo, height, maxWidth }} />
  )
}

function renderProviderPill(p, styles) {
  if (p.logo) {
    return <ProviderLogoImg name={p.name} logo={p.logo} styles={styles} />
  }
  return <span style={styles.providerPill}>{p.name}</span>
}

// Single unified layout: logos sit in a tidy inline row ABOVE the
// category box, justified toward the merchant side of the column so the
// box and its logos cluster together and the circuit line has a clean
// short connection to the center. Works the same for every category.
function CategoryGroup({ category, side, boxRef, styles }) {
  const isRight = side === 'right'
  const innerJustify = isRight ? 'flex-start' : 'flex-end'
  return (
    <div style={styles.categoryGroup}>
      <div style={{ ...styles.pillsRow, justifyContent: innerJustify }}>
        {category.providers.map((p) => (
          <div key={p.name}>{renderProviderPill(p, styles)}</div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: innerJustify }}>
        <div ref={boxRef} style={styles.categoryBox}>{category.label}</div>
      </div>
    </div>
  )
}

export default function SlideInfrastructure({ data }) {
  const theme = useTheme()
  const lang = data?.LANGUAGE || 'en'
  const t = (key) => getCopy(lang, key)
  const diagramRef = useRef(null)
  const centerRef = useRef(null)
  const leftRefs = useRef([])
  const rightRefs = useRef([])
  const [geom, setGeom] = useState(null)
  const isBanking = data?.MODE === 'banking'
  const isPartner = data?.MODE === 'partner'
  const isGenericBanking = isBanking && data?.IS_GENERIC === true
  // Generic Banking deck reframes the diagram around the bank's
  // merchants, so the center node reads "Merchant" instead of the
  // "Your Bank" placeholder. Specific bank decks keep the bank logo
  // / name as the centerpiece.
  const centerLabel = isGenericBanking ? 'Merchant' : data.COMPANY_NAME
  // Banks don't want BaaS in the lineup — see PAY_BY_BANK_CATEGORY note.
  const leftCategories = isBanking
    ? CATEGORIES_LEFT.map((c) => c.label === 'BaaS Providers' ? PAY_BY_BANK_CATEGORY : c)
    : CATEGORIES_LEFT

  // Logo inversion strategy: dark mode forces colored logos to white via
  // `brightness(0) invert(1)`; light mode flattens them to black via
  // `brightness(0)` so they read on the white surface.
  const logoFilter = theme.invertLogos ? 'brightness(0) invert(1)' : 'brightness(0)'

  // Title accent gradient: on dark, the original light-blue→white sweep
  // pops on black. On light, swap to a deeper blue ramp so the gradient
  // text stays legible on the white surface (mirrors SlideReplitBenefits).
  const titleAccentGradient = theme.isLight
    ? `linear-gradient(135deg, ${theme.accentDeep} 0%, ${theme.accent} 100%)`
    : 'linear-gradient(110deg, #3E4FE0 0%, #5967E4 30%, #BDC3F6 68%, #E8EAF5 100%)'

  // Dashed observation divider: dark uses translucent white; light uses
  // translucent dark ink so it reads on the white card.
  const observationDividerImage = theme.isLight
    ? 'repeating-linear-gradient(90deg, rgba(30,32,48,0.22) 0 6px, transparent 6px 12px)'
    : 'repeating-linear-gradient(90deg, rgba(255,255,255,0.22) 0 6px, transparent 6px 12px)'

  // Center node glow: heavy blue halo on dark canvas; on light the same
  // halo becomes a much subtler tint so it doesn't blow out the white
  // card behind it.
  const centerNodeShadow = theme.isLight
    ? '0 0 18px rgba(62,79,224,0.16), inset 0 1px 0 rgba(255,255,255,0.6)'
    : '0 0 34px rgba(62,79,224,0.32), inset 0 1px 0 rgba(255,255,255,0.1)'

  // Center node fill: dark uses a translucent blue gradient over black;
  // light uses a soft blue-tinted card surface so it still reads as the
  // focal point without going neon.
  const centerNodeBg = theme.isLight
    ? `linear-gradient(135deg, ${theme.accentPale} 0%, #FFFFFF 100%)`
    : 'linear-gradient(135deg, rgba(62,79,224,0.34) 0%, rgba(89,103,228,0.18) 100%)'

  // Stat number gradient: keep the bright Yuno ramp on dark; on light
  // use the deeper accent ramp so the big numbers are legible on the
  // light card surface.
  const statNumberGradient = theme.isLight
    ? `linear-gradient(135deg, ${theme.accentDeep} 0%, ${theme.accent} 100%)`
    : 'linear-gradient(135deg, #BDC3F6 0%, #5967E4 55%, #3E4FE0 100%)'

  const styles = {
    body: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(10px, 0.9vw, 18px)',
      minHeight: 0,
    },
    title: {
      fontFamily: 'var(--font-display)',
      // Matches slides 6/7 (GlobalPresence, Leadership) — the reference
      // for title size across the deck. Title wraps to two lines at this
      // size, which is intentional. Max capped low enough that the diagram
      // + statsRow below it don't get squeezed at the 1920px PDF viewport.
      fontSize: 'clamp(28px, 2.5vw, 42px)',
      fontWeight: 500,
      letterSpacing: '-1.2px',
      lineHeight: 1.1,
      color: theme.inkStrong,
      margin: 0,
      marginBottom: 'clamp(20px, 1.6vw, 28px)',
      maxWidth: '100%',
    },
    titleAccent: {
      backgroundImage: titleAccentGradient,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      color: 'transparent',
    },

    // ---------- Main content row: diagram (left) + observations (right) ----------
    contentRow: {
      flex: 1,
      display: 'grid',
      gridTemplateColumns: '1.9fr 1fr',
      gap: 'clamp(20px, 1.8vw, 36px)',
      minHeight: 0,
    },

    diagramCard: {
      background: theme.cardGradientAccent,
      border: `1px solid ${theme.borderSubtle}`,
      borderRadius: '16px',
      padding: 'clamp(6px, 0.55vw, 12px) clamp(20px, 1.8vw, 36px)',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      minHeight: 0,
      boxShadow: theme.cardShadow,
    },
    // SVG overlay that draws connection traces from each of the six category
    // boxes into the central merchant node. Sits above the card background
    // (zIndex: 1) but below the clickable/hoverable content so the category
    // labels and provider pills read first.
    diagramLinesSvg: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 1,
    },

    diagramGrid: {
      flex: 1,
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center',
      // Moderate horizontal runway: enough for traces to draw a visible
      // horizontal segment after the tight corner curves, without stealing
      // so much space that the outer provider pills overflow the card.
      gap: 'clamp(28px, 2.4vw, 52px)',
      width: '100%',
      position: 'relative',
      zIndex: 2,
    },
    diagramColumn: {
      flex: 1,
      alignSelf: 'stretch',
      display: 'flex',
      flexDirection: 'column',
      // Spread the 3 category groups: top group anchors at the column
      // top, bottom group at the column bottom, middle group centers
      // between them. The `gap` enforces a minimum vertical distance
      // BETWEEN groups so the logos of one group can never kiss the box
      // of the group above/below — justify-content: space-between alone
      // would let them collapse when the card height runs short.
      justifyContent: 'space-between',
      gap: 'clamp(44px, 3.6vw, 76px)',
    },

    // ---------- Category group (one of six) ----------
    // Each category is a small layout unit built around its box. The box is
    // the anchor (lines connect to box.right / box.left), and the provider
    // logos float around it as a loose "connection cloud":
    //   - 'top-cloud'  : logos wrap above the box
    //   - 'side'       : logos pack tight against the inner side of the box
    //   - 'side-bottom': half the logos sit beside the box, the rest below
    // Each group occupies an equal share of column height (flex: 1) and
    // centers its box vertically — that's what keeps the boxes on the left
    // column at the same y as their right-column counterparts.
    categoryGroup: {
      // Natural content height — the column's space-between spreads the
      // 3 groups to top / middle / bottom anchors, so the group itself
      // doesn't need to stretch. Fixing the height to auto prevents the
      // box and its logos from drifting vertically as the column flexes.
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(10px, 0.9vw, 18px)',
      minWidth: 0,
    },
    // Clean inline row of 3 logos above the category box. Wraps only when
    // the column gets too narrow; no random staggered offsets — the goal
    // is a tidy ordered ecosystem, not a cloud.
    pillsRow: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      rowGap: 'clamp(6px, 0.6vw, 12px)',
      columnGap: 'clamp(14px, 1.25vw, 24px)',
      minWidth: 0,
    },
    providerPill: {
      fontSize: 'clamp(10px, 0.75vw, 12.5px)',
      fontWeight: 500,
      letterSpacing: '0.2px',
      color: theme.inkMuted,
      whiteSpace: 'nowrap',
    },
    providerLogo: {
      // Base geometry only — actual height / maxWidth are scaled per-logo
      // in ProviderLogo() below, because the source PNGs have very different
      // amounts of whitespace around the mark. Scales normalize the optical
      // size so none of them reads as a dwarf next to the others.
      objectFit: 'contain',
      filter: logoFilter,
      opacity: 0.78,
      display: 'block',
      flexShrink: 0,
    },
    categoryBox: {
      flex: '0 0 auto',
      padding: 'clamp(10px, 0.9vw, 15px) clamp(14px, 1.2vw, 20px)',
      background: theme.isLight ? 'rgba(62,79,224,0.06)' : 'rgba(62,79,224,0.14)',
      // Direct accent literal preserves the original 0.42 alpha on dark
      // exactly; on light theme.borderAccent is a bit softer which suits
      // the white surface.
      border: theme.isLight
        ? `1px solid ${theme.borderAccent}`
        : '1px solid rgba(62,79,224,0.42)',
      borderRadius: '10px',
      fontSize: 'clamp(13px, 1.05vw, 17px)',
      fontWeight: 700,
      color: theme.inkStrong,
      letterSpacing: '0.2px',
      whiteSpace: 'nowrap',
      textAlign: 'center',
      minWidth: 'clamp(150px, 13.5vw, 215px)',
    },

    // ---------- Center merchant node ----------
    centerNode: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'clamp(14px, 1.3vw, 24px) clamp(20px, 1.8vw, 38px)',
      background: centerNodeBg,
      // Center node carries a stronger accent border on dark (the original
      // 0.55) so it reads as the focal point. Light uses the standard
      // borderAccent token which sits cleanly on the white card.
      border: theme.isLight
        ? `1px solid ${theme.borderAccent}`
        : '1px solid rgba(62,79,224,0.55)',
      borderRadius: '12px',
      boxShadow: centerNodeShadow,
      minHeight: 'clamp(64px, 5.2vw, 96px)',
      minWidth: 'clamp(134px, 11.5vw, 194px)',
      animation: 'glow 3s ease-in-out infinite',
    },
    centerLogo: {
      height: 'clamp(30px, 2.7vw, 50px)',
      maxWidth: 'clamp(134px, 11.8vw, 210px)',
      objectFit: 'contain',
      filter: logoFilter,
      display: 'block',
    },
    // Tile-type merchant (COMPANY_LOGO_MONO present): compact glyph like
    // "BO" reads much smaller than a wordmark at the same height, so scale
    // up ~60% so the mark visually matches a wordmark merchant's weight.
    centerLogoTile: {
      height: 'clamp(52px, 4.6vw, 86px)',
      maxWidth: 'clamp(110px, 9.6vw, 180px)',
      objectFit: 'contain',
      filter: logoFilter,
      display: 'block',
    },
    centerText: {
      fontFamily: 'var(--font-display)',
      fontSize: 'clamp(26px, 2.3vw, 42px)',
      fontWeight: 700,
      color: theme.inkStrong,
      letterSpacing: '-0.4px',
    },

    // ---------- Right: observations ----------
    observationsCard: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      padding: 'clamp(48px, 4.4vw, 84px) clamp(40px, 3.6vw, 64px)',
      background: theme.isLight ? theme.bgElevated : 'rgba(255,255,255,0.015)',
      border: `1px solid ${theme.borderSubtle}`,
      borderRadius: '16px',
      justifyContent: 'center',
      minHeight: 0,
      overflow: 'hidden',
      boxShadow: theme.cardShadow,
    },
    // Decorative isometric layered slabs that float in the background of the
    // observations card, echoing the capabilities-stack visual language
    // without competing with the bullet text. Pure SVG, low opacity, sits
    // behind a semantic content layer (zIndex 1).
    observationsBg: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 0,
    },
    observationsList: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(18px, 1.6vw, 28px)',
    },
    observationItem: {
      display: 'flex',
      alignItems: 'flex-start',
    },
    // Techy dashed divider between bullets: a short dash pattern rendered
    // as a repeating gradient so it reads as a thin seam, not a solid line.
    // Matches the mono-kicker aesthetic elsewhere in the deck.
    observationDivider: {
      height: '1px',
      backgroundImage: observationDividerImage,
      opacity: 0.7,
    },
    observationText: {
      fontSize: 'clamp(20px, 1.7vw, 30px)',
      lineHeight: 1.35,
      color: theme.inkSecondary,
      margin: 0,
    },
    observationStrong: {
      color: theme.inkStrong,
      fontWeight: 700,
    },

    // ---------- Bottom stats row ----------
    statsRow: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 'clamp(14px, 1.2vw, 22px)',
    },
    statCard: {
      display: 'flex',
      alignItems: 'center',
      gap: 'clamp(14px, 1.2vw, 22px)',
      // Compact vertical padding so the row fits below the diagram at the
      // 1920px PDF viewport without forcing contentRow to overflow above.
      padding: 'clamp(10px, 0.8vw, 14px) clamp(20px, 1.7vw, 30px)',
      background: theme.cardGradientAccent,
      border: `1px solid ${theme.borderSubtle}`,
      borderRadius: '14px',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: theme.cardShadow,
    },
    statNumber: {
      fontFamily: 'var(--font-display)',
      fontSize: 'clamp(32px, 2.7vw, 46px)',
      fontWeight: 700,
      letterSpacing: '-1.5px',
      lineHeight: 1,
      fontVariantNumeric: 'tabular-nums',
      backgroundImage: statNumberGradient,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      color: 'transparent',
      flexShrink: 0,
    },
    statText: {
      fontSize: 'clamp(16px, 1.35vw, 22px)',
      lineHeight: 1.4,
      color: theme.inkSecondary,
      fontWeight: 500,
      margin: 0,
    },
    statTextStrong: {
      color: theme.inkStrong,
      fontWeight: 700,
    },
    statIcon: {
      position: 'absolute',
      right: 'clamp(16px, 1.4vw, 24px)',
      top: 'clamp(14px, 1.2vw, 20px)',
      color: theme.inkFaint,
    },
  }

  const OBSERVATIONS_BY_MODE = buildObservations(styles)
  const STATS_BY_MODE = buildStats(styles)
  const OBSERVATIONS = isBanking ? OBSERVATIONS_BY_MODE.banking
    : isPartner ? OBSERVATIONS_BY_MODE.partner
    : OBSERVATIONS_BY_MODE.merchant
  const STATS = isBanking ? STATS_BY_MODE.banking
    : isPartner ? STATS_BY_MODE.partner
    : STATS_BY_MODE.merchant

  useLayoutEffect(() => {
    const container = diagramRef.current
    const center = centerRef.current
    if (!container || !center) return
    const measure = () => {
      const cb = container.getBoundingClientRect()
      if (!cb.width || !cb.height) return
      const rel = (el) => {
        const b = el.getBoundingClientRect()
        return {
          top: b.top - cb.top,
          bottom: b.bottom - cb.top,
          left: b.left - cb.left,
          right: b.right - cb.left,
          cy: b.top - cb.top + b.height / 2,
        }
      }
      setGeom({
        width: cb.width,
        height: cb.height,
        center: rel(center),
        left: leftRefs.current.filter(Boolean).map(rel),
        right: rightRefs.current.filter(Boolean).map(rel),
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(container)
    return () => ro.disconnect()
  }, [data.COMPANY_LOGO, data.COMPANY_NAME])

  // Build trace paths as rectilinear PCB routes: horizontal out of each
  // category box, vertical turn at the midpoint, horizontal into the
  // merchant. Rounded corners (Q arcs) at each elbow keep the traces
  // reading as real circuit-board routing rather than hard 90° breaks.
  const pcbPath = (x1, y1, x2, y2) => {
    const dy = y2 - y1
    const dx = x2 - x1
    if (Math.abs(dy) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`
    const midX = (x1 + x2) / 2
    const ySign = dy > 0 ? 1 : -1
    const xSign = dx > 0 ? 1 : -1
    const r = Math.max(
      0,
      Math.min(6, Math.abs(dy) / 2, Math.abs(midX - x1), Math.abs(x2 - midX)),
    )
    return [
      `M ${x1} ${y1}`,
      `L ${midX - xSign * r} ${y1}`,
      `Q ${midX} ${y1} ${midX} ${y1 + ySign * r}`,
      `L ${midX} ${y2 - ySign * r}`,
      `Q ${midX} ${y2} ${midX + xSign * r} ${y2}`,
      `L ${x2} ${y2}`,
    ].join(' ')
  }

  const paths = []
  if (geom) {
    const { center, left, right } = geom
    // Overlap the line endpoints a few px into both the category boxes and
    // the center node — the boxes have soft semi-transparent borders, so
    // ending the trace right at the bbox edge leaves a visible seam. The
    // small overlap guarantees a clean visual connection on every row.
    // Tiny overlap (2px) lets the trace just kiss the border of the
    // category box and the merchant node without visibly tunneling
    // inside them. Bigger overlaps read as lines slicing through the
    // boxes — the goal here is clean flush connections.
    const OVERLAP = 2
    for (const box of left) {
      paths.push(pcbPath(box.right - OVERLAP, box.cy, center.left + OVERLAP, center.cy))
    }
    for (const box of right) {
      paths.push(pcbPath(center.right - OVERLAP, center.cy, box.left + OVERLAP, box.cy))
    }
  }

  return (
    <SlideBase section={t('section.about_yuno')} slideNumber={2}>
      <div className="stagger" style={{ ...styles.body, '--stagger-base': '0.1s', '--stagger-step': '0.1s' }}>
        <h2 style={styles.title}>
          {isBanking ? (
            <>
              One platform, your whole merchant portfolio,{' '}
              <span style={styles.titleAccent}>global from day one</span>
            </>
          ) : isPartner ? (
            <>
              One integration, one catalog,{' '}
              <span style={styles.titleAccent}>every enterprise merchant Yuno reaches</span>
            </>
          ) : (
            <>
              Yuno brought it all together.{' '}
              <span style={styles.titleAccent}>one platform, global financial infrastructure at scale</span>
            </>
          )}
        </h2>

        <div style={styles.contentRow}>
          <div ref={diagramRef} className="reveal border-beam" style={{ ...styles.diagramCard, '--reveal-delay': '0.25s', '--beam-duration': '22s' }}>
            {geom && (
              <svg
                style={styles.diagramLinesSvg}
                width={geom.width}
                height={geom.height}
                viewBox={`0 0 ${geom.width} ${geom.height}`}
                aria-hidden
              >
                <defs>
                  <filter id="infraBeamGlow" x="-80%" y="-80%" width="260%" height="260%">
                    <feGaussianBlur stdDeviation="0.9" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {paths.map((d, i) => {
                  const dur = 5.8 + (i % 3) * 0.5
                  const delay = -((i * 0.45) % dur)
                  return (
                    <g key={i}>
                      <path d={d} fill="none" stroke="rgba(124,137,239,0.65)" strokeWidth="1.4" strokeLinecap="round" />
                      <path
                        d={d}
                        pathLength="100"
                        fill="none"
                        stroke="#DDE3FB"
                        strokeWidth="0.45"
                        strokeLinecap="round"
                        strokeDasharray="22 78"
                        filter="url(#infraBeamGlow)"
                      >
                        <animate
                          attributeName="stroke-dashoffset"
                          from="0"
                          to="-100"
                          dur={`${dur}s`}
                          begin={`${delay}s`}
                          repeatCount="indefinite"
                        />
                      </path>
                    </g>
                  )
                })}
              </svg>
            )}
            <div style={styles.diagramGrid}>
              <div style={styles.diagramColumn}>
                {leftCategories.map((cat, i) => (
                  <CategoryGroup
                    key={cat.label}
                    category={cat}
                    side="left"
                    boxRef={(el) => { leftRefs.current[i] = el }}
                    styles={styles}
                  />
                ))}
              </div>
              <div ref={centerRef} style={styles.centerNode}>
                {isPartner ? (
                  <img
                    src="/ss-deck-assets/assets/yuno-wordmark-white.svg"
                    alt="Yuno"
                    style={styles.centerLogo}
                  />
                ) : !isGenericBanking && data.COMPANY_LOGO ? (
                  <img
                    src={data.COMPANY_LOGO_MONO || data.COMPANY_LOGO}
                    alt={data.COMPANY_NAME}
                    style={data.COMPANY_LOGO_MONO ? styles.centerLogoTile : styles.centerLogo}
                  />
                ) : (
                  <span style={styles.centerText}>{centerLabel}</span>
                )}
              </div>
              <div style={styles.diagramColumn}>
                {CATEGORIES_RIGHT.map((cat, i) => (
                  <CategoryGroup
                    key={cat.label}
                    category={cat}
                    side="right"
                    boxRef={(el) => { rightRefs.current[i] = el }}
                    styles={styles}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="border-beam" style={{ ...styles.observationsCard, '--beam-duration': '20s', '--beam-delay': '-6s' }}>
            <ObservationsBackdrop />
            <div className="stagger" style={{ ...styles.observationsList, '--stagger-base': '0.5s', '--stagger-step': '0.12s' }}>
              {OBSERVATIONS.map((obs, i) => (
                <Fragment key={i}>
                  <div style={styles.observationItem}>
                    <p style={styles.observationText}>{obs.render()}</p>
                  </div>
                  {i < OBSERVATIONS.length - 1 && (
                    <div style={styles.observationDivider} aria-hidden />
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        </div>

        <div className="stagger" style={{ ...styles.statsRow, '--stagger-base': '0.85s', '--stagger-step': '0.12s' }}>
          {STATS.map((s, i) => (
            <div
              key={i}
              className="border-beam"
              style={{ ...styles.statCard, '--beam-duration': '24s', '--beam-delay': `${-i * 4}s` }}
            >
              <span style={styles.statNumber}>{s.number}</span>
              <p style={styles.statText}>{s.render()}</p>
              <span style={styles.statIcon}>{s.icon}</span>
            </div>
          ))}
        </div>
      </div>
    </SlideBase>
  )
}
