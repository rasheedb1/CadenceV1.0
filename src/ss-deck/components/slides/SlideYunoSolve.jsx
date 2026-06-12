import { useState, useRef, useLayoutEffect } from 'react'
import {
  ArrowsClockwise,
  ArrowsSplit,
  Globe,
  SquaresFour,
} from '@phosphor-icons/react'
import SlideBase from './SlideBase'
import BeamRule from '../BeamRule'
import { useTheme } from '../../lib/theme'
import { getCopy } from '../../lib/copy'

// Capability icons — one per slot (01–04). Phosphor bold weight to match
// the rest of the deck. Slots map to Yuno's default 4-capability pattern:
// routing, cascade recovery, local APMs, unified dashboard.
const CAP_ICONS = {
  '01': ArrowsSplit,       // Smart routing
  '02': ArrowsClockwise,   // Cascade / failover
  '03': Globe,             // Local methods
  '04': SquaresFour,       // Unified dashboard
}

function CapIconSvg({ num }) {
  const Glyph = CAP_ICONS[num]
  if (!Glyph) return null
  return <Glyph size="100%" weight="regular" aria-hidden />
}

// Build a rectilinear "PCB trace" path from (x1,y1) down to a horizontal bus
// at midY, then over to x2, then down to y2. Quadratic-rounded corners so
// the elbows look like a real circuit trace, not a hard 90° angle.
function rectiPath(x1, y1, x2, y2, midY) {
  const dx = x2 - x1
  if (Math.abs(dx) < 1) {
    return `M ${x1} ${y1} L ${x2} ${y2}`
  }
  const sign = dx > 0 ? 1 : -1
  const maxR = Math.min(Math.abs(dx) / 2, midY - y1, y2 - midY) - 1
  const r = Math.max(0, Math.min(10, maxR))
  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${midY - r}`,
    `Q ${x1} ${midY} ${x1 + sign * r} ${midY}`,
    `L ${x2 - sign * r} ${midY}`,
    `Q ${x2} ${midY} ${x2} ${midY + r}`,
    `L ${x2} ${y2}`,
  ].join(' ')
}

function ArchitectureStack({ merchantName, merchantLogo, isTileLogo, psps, styles, theme, t }) {
  const chips = Array.isArray(psps)
    ? psps.slice(0, 4).map((p) => (typeof p === 'string' ? p : p.name)).filter(Boolean)
    : []

  const containerRef = useRef(null)
  const merchantRef = useRef(null)
  const yunoRef = useRef(null)
  const chipRefs = useRef([])
  const [geom, setGeom] = useState(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    const merchant = merchantRef.current
    const yuno = yunoRef.current
    if (!container || !merchant || !yuno) return
    const measure = () => {
      const cb = container.getBoundingClientRect()
      if (!cb.width || !cb.height) return
      const rel = (box) => ({
        cx: box.left - cb.left + box.width / 2,
        top: box.top - cb.top,
        bottom: box.bottom - cb.top,
      })
      const chipEls = chipRefs.current.filter(Boolean)
      setGeom({
        width: cb.width,
        height: cb.height,
        merchant: rel(merchant.getBoundingClientRect()),
        yuno: rel(yuno.getBoundingClientRect()),
        chips: chipEls.map((el) => rel(el.getBoundingClientRect())),
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(container)
    return () => ro.disconnect()
  }, [chips.length, merchantName])

  const paths = []
  if (geom) {
    const { merchant: m, yuno: y, chips: cps } = geom
    paths.push(`M ${m.cx} ${m.bottom} L ${y.cx} ${y.top}`)
    if (cps.length > 0) {
      // Single shared "bus" Y for all chip drops so they look like real
      // traces routed off a horizontal trace, not independent S-curves.
      // Bus sits close to Yuno-bottom (0.35) so the vertical drop to each
      // PSP is long and the curve doesn't kiss the chip top.
      const busY = y.bottom + (cps[0].top - y.bottom) * 0.35
      // Stop drops short of the chip top so the stroke doesn't visually
      // bleed over the chip's border — leaves a clean air gap between
      // the trace end and the chip.
      const CHIP_GAP = 8
      for (const c of cps) {
        paths.push(rectiPath(y.cx, y.bottom, c.cx, c.top - CHIP_GAP, busY))
      }
    }
  }

  // Trace stroke: keep the brand-blue ramp in both themes so the circuit
  // reads as Yuno energy. On light, deepen the base trace slightly so the
  // wiring stays visible against white.
  const traceBase = theme.isLight ? 'rgba(62,79,224,0.42)' : 'rgba(124,137,239,0.28)'
  const traceBeam = theme.isLight ? theme.accent : '#DDE3FB'

  return (
    <div ref={containerRef} style={styles.archStack}>
      {geom && (
        <svg
          style={styles.circuitOverlay}
          width={geom.width}
          height={geom.height}
          viewBox={`0 0 ${geom.width} ${geom.height}`}
          aria-hidden
        >
          <defs>
            <filter id="circuitGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="0.9" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {paths.map((d, i) => {
            const dur = 5.6 + (i % 3) * 0.6
            const delay = -((i * 0.5) % dur)
            return (
              <g key={i}>
                {/* base trace — always-on dim line so the wiring is visible */}
                <path
                  d={d}
                  fill="none"
                  stroke={traceBase}
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
                {/* energy beam — short bright dash slides along the path
                    via stroke-dashoffset, glow filter for the "current"
                    feel. pathLength=100 normalizes regardless of geometry. */}
                <path
                  d={d}
                  pathLength="100"
                  fill="none"
                  stroke={traceBeam}
                  strokeWidth="0.7"
                  strokeLinecap="round"
                  strokeDasharray="28 72"
                  filter="url(#circuitGlow)"
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

      <div ref={merchantRef} style={styles.archMerchant}>
        {merchantLogo ? (
          <img src={merchantLogo} alt={merchantName} style={isTileLogo ? styles.archMerchantLogoTile : styles.archMerchantLogo} />
        ) : (
          <span style={styles.archMerchantText}>{merchantName}</span>
        )}
      </div>

      <div ref={yunoRef} style={styles.archYunoBlock}>
        <div style={styles.archYunoTitleRow}>
          {/* Yuno block is solid blue in both themes, so the white SVG
              wordmark works for dark + light. No filter swap needed. */}
          <img src="/ss-deck-assets/assets/yuno-wordmark-white.svg" alt="Yuno" style={styles.archYunoWordmark} />
          <span style={styles.archYunoTitle}>orchestration</span>
        </div>
        <div style={styles.archYunoFeatures}>
          {[
            'Smart Routing',
            'Vault',
            'Reconciliation',
            'Payouts',
            'Subscriptions',
            'Tokenization',
            'Fraud',
            'KYC/KYB',
          ].map((f) => (
            <span key={f} style={styles.archFeaturePill}>{f}</span>
          ))}
        </div>
      </div>

      <div className="stagger" style={{
        ...styles.archPspsRow,
        // Dynamic column count so the row always fills the bus width regardless
        // of how many PSPs the AE picked. Total = chips + 1 "+460 providers" tile.
        // With 5 chips + tile = 6 cols (was repeat(5, 1fr) which left a gap);
        // with 2 chips + tile = 3 cols (was leaving 2 empty cols on the right).
        gridTemplateColumns: `repeat(${chips.length + 1}, 1fr)`,
        '--stagger-base': '0.45s', '--stagger-step': '0.06s',
      }}>
        {chips.map((p, i) => (
          <div
            key={p}
            ref={(el) => { chipRefs.current[i] = el }}
            style={styles.archPspChip}
          >
            {p}
          </div>
        ))}
        <div
          ref={(el) => { chipRefs.current[chips.length] = el }}
          style={{
            ...styles.archPspChip,
            ...styles.archPspChipMore,
            ...(chips.length === 0 ? { padding: '24px 32px', minHeight: '64px' } : {}),
          }}
        >
          <span
            style={{
              ...styles.archPspChipMoreNum,
              ...(chips.length === 0 ? { fontSize: '22px' } : {}),
            }}
          >
            {t('yunoSolve.more_providers')}
          </span>
          {chips.length > 0 && (
            <span style={styles.archPspChipMoreLabel}>{t('yunoSolve.more_label')}</span>
          )}
        </div>
      </div>
      <div style={styles.archIllustrativeNote}>&gt; {t('yunoSolve.arch_illustrative')}</div>
    </div>
  )
}

function CapCard({ num, title, desc, styles, theme, t }) {
  const [flipped, setFlipped] = useState(false)
  const [hover, setHover] = useState(false)

  // Hover tints differ per theme. On dark the original code lifted the card
  // with an accent-tinted wash; on light we keep the same accent ramp but
  // lean on a softer pale fill so the card stays bright.
  const hoverBg = theme.isLight ? 'rgba(62,79,224,0.05)' : 'rgba(62,79,224,0.08)'
  const hoverBorder = theme.isLight ? 'rgba(62,79,224,0.30)' : 'rgba(62,79,224,0.25)'

  // Rest border = capFace's original border. We inherit it via spread; only
  // override on hover so we don't drift away from the dark-mode 0.08 hairline.
  const frontFace = {
    ...styles.capFace,
    ...(hover && !flipped
      ? { background: hoverBg, borderColor: hoverBorder }
      : null),
  }

  return (
    <div
      style={styles.capCardWrapper}
      onClick={() => setFlipped((f) => !f)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setFlipped((f) => !f)
        }
      }}
    >
      <div
        style={{
          ...styles.capCardInner,
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        <div style={frontFace}>
          <div style={styles.capIcon}>
            <CapIconSvg num={num} />
          </div>
          <div style={styles.capContent}>
            <span style={styles.capTitle}>{title}</span>
          </div>
          <span style={styles.capFlipHint}>{num} &middot; {t ? t('yunoSolve.flip_hint') : 'tap'}</span>
        </div>

        <div data-cap-back style={{ ...styles.capFace, ...styles.capFaceBack }}>
          <p style={styles.capDesc}>{desc}</p>
        </div>
      </div>
    </div>
  )
}

export default function SlideYunoSolve({ data }) {
  const theme = useTheme()
  const lang = data?.LANGUAGE || 'en'
  const t = (key) => getCopy(lang, key)

  // Px-based sizing throughout: the slide lives inside a 1920x1080 stage that
  // scales via transform, so vw-based clamps would double-scale and drift.
  // Typography follows brandbook rules (minus the Titillium font swap):
  // titles lowercase, labels/chips UPPERCASE SemiBold, left-aligned.
  const styles = {
    body: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      minHeight: 0,
    },
    title: {
      fontFamily: 'var(--font-display)',
      // Matches slides 6/7 — deck-wide title reference size. Title wraps
      // to two lines at this size, which is intentional.
      fontSize: 'clamp(28px, 2.7vw, 52px)',
      fontWeight: 500,
      letterSpacing: '-1.2px',
      lineHeight: 1.1,
      // Dark used #fff for the H2; light uses the deep ink token.
      color: theme.isLight ? theme.ink : '#fff',
      margin: 0,
      marginBottom: 'clamp(24px, 2.2vw, 40px)',
    },
    accent: theme.isLight
      ? {
          background: `linear-gradient(135deg, ${theme.accentDeep} 0%, ${theme.accent} 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }
      : {
          background: 'linear-gradient(110deg, #3E4FE0 0%, #5967E4 30%, #BDC3F6 68%, #E8EAF5 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        },
    monoKicker: {
      fontFamily: 'var(--font-mono)',
      fontSize: '14px',
      fontWeight: 500,
      letterSpacing: '0.4px',
      // Preserve dark's original 0.42 alpha; light uses inkMuted token.
      color: theme.isLight ? theme.inkMuted : 'rgba(255,255,255,0.42)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    monoKickerCaret: { color: theme.isLight ? theme.accent : 'rgba(124,137,239,0.9)' },
    monoKickerRule: {
      flex: 1,
      height: '1px',
      background: theme.beamBase,
    },
    mainRow: {
      flex: 1,
      display: 'flex',
      gap: '32px',
      minHeight: 0,
    },

    // --- LEFT: architecture (single dominant card, stacked layers, no lines) ---
    leftPanel: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
    },
    architectureCard: {
      flex: 1,
      // Light: accent-pale wash on white card. Dark: original navy gradient.
      background: theme.isLight ? theme.cardGradientAccent : 'linear-gradient(135deg, rgba(62,79,224,0.10) 0%, rgba(0,0,0,0.55) 100%)',
      // Dark uses the original 0.08 hairline (between borderSubtle/Default);
      // light leans on the token so the card edge stays consistent with
      // sibling cards in the deck.
      border: theme.isLight ? `1px solid ${theme.borderSubtle}` : '1px solid rgba(255,255,255,0.08)',
      borderRadius: '16px',
      padding: '28px',
      display: 'flex',
      flexDirection: 'column',
      gap: '18px',
      position: 'relative',
      overflow: 'hidden',
      backdropFilter: theme.isLight ? 'none' : 'blur(10px)',
      minHeight: 0,
      boxShadow: theme.cardShadow,
    },
    archHeaderRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    archLabel: {
      fontSize: '12px',
      fontWeight: 600,
      letterSpacing: '2px',
      textTransform: 'uppercase',
      color: theme.isLight ? theme.accent : 'rgba(124,137,239,0.9)',
      marginBottom: '6px',
    },
    archTitle: {
      fontFamily: 'var(--font-display)',
      fontSize: '28px',
      fontWeight: 600,
      // Dark used pure white #fff (slightly punchier than the ink token);
      // light uses ink which is the deep navy.
      color: theme.isLight ? theme.ink : '#fff',
      letterSpacing: '-0.3px',
    },
    archBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      background: theme.isLight ? 'rgba(62,79,224,0.10)' : 'rgba(62,79,224,0.18)',
      // Dark preserves the original 0.55-alpha accent border; light uses
      // the borderAccent token (slightly softer 0.40 alpha).
      border: theme.isLight ? `1px solid ${theme.borderAccent}` : '1px solid rgba(89,103,228,0.55)',
      borderRadius: '100px',
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '1.8px',
      textTransform: 'uppercase',
      color: theme.isLight ? theme.accentDeep : '#8D98F0',
    },
    archBadgeDot: {
      width: '7px',
      height: '7px',
      borderRadius: '50%',
      background: theme.isLight ? theme.accent : '#5967E4',
      boxShadow: theme.isLight ? '0 0 8px rgba(62,79,224,0.55)' : '0 0 8px rgba(89,103,228,0.9)',
    },

    // The stacked architecture. Merchant → Yuno → PSPs connected by animated
    // SVG circuit lines drawn in an absolute-positioned overlay. `position:
    // relative` roots that overlay; `justify-content: center` shifts the
    // stack a bit down from the card header so the diagram breathes.
    archStack: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: '46px',
      justifyContent: 'space-between',
      minHeight: 0,
      position: 'relative',
      paddingTop: '6px',
      paddingBottom: '2px',
    },
    circuitOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 2,
    },
    archMerchant: {
      alignSelf: 'center',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px 26px',
      background: theme.surface1,
      // Dark uses the original 0.14 hairline (between borderDefault/Strong);
      // light snaps to borderDefault so the merchant tile reads cleanly on
      // the white architecture card.
      border: theme.isLight ? `1px solid ${theme.borderDefault}` : '1px solid rgba(255,255,255,0.14)',
      borderRadius: '12px',
      minHeight: '52px',
      minWidth: '220px',
    },
    archMerchantLogo: {
      height: '26px',
      maxWidth: '160px',
      objectFit: 'contain',
      // Dark: recolor merchant logos to white via brightness(0)+invert(1).
      // Light: most assets are white-on-transparent (built for the dark
      // canvas), so 'none' would leave them invisible on the white tile;
      // brightness(0) flattens them to black silhouettes that read.
      filter: theme.invertLogos ? 'brightness(0) invert(1)' : 'brightness(0)',
    },
    // Tile-glyph boost for merchants like Bold One whose mark is a compact
    // 2-letter glyph instead of a wordmark.
    archMerchantLogoTile: {
      height: '44px',
      maxWidth: '80px',
      objectFit: 'contain',
      filter: theme.invertLogos ? 'brightness(0) invert(1)' : 'brightness(0)',
    },
    archMerchantText: {
      fontSize: '20px',
      fontWeight: 600,
      // Dark used pure #fff; light uses the ink token.
      color: theme.isLight ? theme.ink : '#fff',
      letterSpacing: '-0.2px',
    },
    archYunoBlock: {
      padding: '10px 20px',
      // Light: solid accent ramp tile so Yuno reads as the brand center.
      // Dark: the original translucent gradient + ambient glow.
      background: theme.isLight
        ? `linear-gradient(135deg, ${theme.accentDeep} 0%, ${theme.accent} 100%)`
        : 'linear-gradient(135deg, rgba(62,79,224,0.28) 0%, rgba(89,103,228,0.18) 100%)',
      border: theme.isLight ? `1px solid ${theme.accent}` : '1px solid rgba(62,79,224,0.5)',
      borderRadius: '12px',
      boxShadow: theme.isLight
        ? '0 8px 24px rgba(62,79,224,0.20)'
        : '0 0 40px rgba(62,79,224,0.28), inset 0 1px 0 rgba(255,255,255,0.1)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      alignItems: 'center',
      animation: 'glow 3s ease-in-out infinite',
    },
    archYunoTitleRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    },
    archYunoWordmark: {
      height: '22px',
      width: 'auto',
      flexShrink: 0,
      // Yuno tile is solid blue in light theme too, so the wordmark stays
      // white-on-blue in both themes. No filter swap needed.
      filter: 'brightness(0) invert(1)',
      display: 'block',
    },
    archYunoTitle: {
      fontFamily: 'var(--font-display)',
      fontSize: '20px',
      fontWeight: 500,
      // Yuno block has a solid blue background in both themes, so the
      // title text is always white.
      color: '#fff',
      letterSpacing: '-0.3px',
      textTransform: 'lowercase',
    },
    archYunoFeatures: {
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: '6px',
    },
    archFeaturePill: {
      fontFamily: 'var(--font-mono)',
      padding: '4px 9px',
      // Pills sit on the Yuno block. On dark that block is a translucent
      // navy gradient → keep the original soft white wash so pills read.
      // On light the Yuno block is solid blue → bump to a slightly stronger
      // white wash so pills stay legible on the saturated accent fill.
      background: theme.isLight ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)',
      border: theme.isLight ? '1px solid rgba(255,255,255,0.30)' : '1px solid rgba(255,255,255,0.12)',
      borderRadius: '100px',
      fontSize: '10px',
      fontWeight: 500,
      letterSpacing: '0.2px',
      color: theme.isLight ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.78)',
      whiteSpace: 'nowrap',
    },
    archPspsLabel: {
      fontSize: '11px',
      fontWeight: 600,
      letterSpacing: '2px',
      textTransform: 'uppercase',
      color: theme.inkMuted,
      textAlign: 'center',
      marginTop: '2px',
    },
    archPspsRow: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: '8px',
      // Pushes the PSP chips lower so the drop lines from the bus have
      // room to read as distinct traces landing on the chips, rather than
      // terminating right at the chip's top border.
      marginTop: 'clamp(30px, 2.6vw, 54px)',
    },
    archIllustrativeNote: {
      fontFamily: 'var(--font-mono)',
      fontSize: '9.5px',
      fontWeight: 500,
      letterSpacing: '0.3px',
      // Preserve dark's original 0.28 alpha (sits between inkFaint/Muted);
      // on light, lean on the inkFaint token for the same air-quote feel.
      color: theme.isLight ? theme.inkFaint : 'rgba(255,255,255,0.28)',
      marginTop: '6px',
      textAlign: 'left',
      alignSelf: 'stretch',
      width: '100%',
    },
    archPspChip: {
      padding: '10px 6px',
      // Dark: deep matte chip. Light: white surface with subtle border so
      // chips read as crisp tiles on the pale architecture card.
      background: theme.isLight ? theme.bgElevated : 'rgba(0,0,0,0.5)',
      // Dark uses borderDefault (0.10) — matches the original 0.1 hairline.
      border: `1px solid ${theme.borderDefault}`,
      borderRadius: '10px',
      fontSize: '11.5px',
      fontWeight: 600,
      // Dark preserved the original 0.82 chip text alpha; light goes ink.
      color: theme.isLight ? theme.ink : 'rgba(255,255,255,0.82)',
      textAlign: 'center',
      letterSpacing: '1.2px',
      textTransform: 'uppercase',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '44px',
      lineHeight: 1.2,
      boxShadow: theme.isLight ? '0 1px 2px rgba(30,32,48,0.04)' : 'none',
    },
    archPspChipMore: {
      background: theme.isLight
        ? `linear-gradient(135deg, ${theme.accentDeep} 0%, ${theme.accent} 100%)`
        : 'linear-gradient(135deg, rgba(62,79,224,0.32) 0%, rgba(89,103,228,0.18) 100%)',
      border: theme.isLight ? `1px solid ${theme.accent}` : '1px solid rgba(62,79,224,0.55)',
      color: '#fff',
      flexDirection: 'column',
      gap: '2px',
      letterSpacing: '0.3px',
      boxShadow: theme.isLight
        ? '0 6px 18px rgba(62,79,224,0.22)'
        : '0 0 18px rgba(62,79,224,0.25)',
    },
    archPspChipMoreNum: {
      fontFamily: 'var(--font-display)',
      fontSize: '15px',
      fontWeight: 700,
      color: '#fff',
      letterSpacing: '-0.2px',
      lineHeight: 1,
    },
    archPspChipMoreLabel: {
      fontSize: '8.5px',
      fontWeight: 600,
      letterSpacing: '1.4px',
      // Sits on the +460 accent chip in both themes — keep the pale-blue
      // label readable on the brand fill.
      color: 'rgba(189,195,246,0.9)',
      textTransform: 'uppercase',
    },

    // --- RIGHT: capabilities ---
    capabilitiesMark: {
      width: '28px',
      height: '28px',
      opacity: 0.55,
      pointerEvents: 'none',
      userSelect: 'none',
      flexShrink: 0,
      // The asset is a white SVG; flatten to dark on light surfaces so it
      // reads as the same subtle watermark.
      filter: theme.isLight ? 'brightness(0)' : 'none',
    },
    rightPanel: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      minHeight: 0,
      padding: '24px 8px',
    },
    capList: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      minHeight: 0,
    },
    // Flip card: click to toggle front (icon + title) and back (description).
    // The wrapper owns flex sizing + perspective; the inner element rotates
    // in 3D; the two faces are absolutely positioned with backface hidden.
    capCardWrapper: {
      flex: 1,
      position: 'relative',
      perspective: '1400px',
      cursor: 'pointer',
      minHeight: 0,
    },
    capCardInner: {
      position: 'relative',
      width: '100%',
      height: '100%',
      transition: 'transform 0.55s cubic-bezier(0.4, 0.1, 0.2, 1)',
      transformStyle: 'preserve-3d',
    },
    capFace: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      gap: '18px',
      padding: '20px 24px',
      // Light: white card with subtle shadow. Dark: faint white wash.
      background: theme.isLight ? theme.bgElevated : theme.surface0,
      // Preserve the original 0.08 hairline on dark (between subtle/default
      // tokens); use the subtle token on light.
      border: theme.isLight ? `1px solid ${theme.borderSubtle}` : '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      alignItems: 'center',
      transition: 'all 0.25s ease',
      overflow: 'hidden',
      WebkitBackfaceVisibility: 'hidden',
      backfaceVisibility: 'hidden',
      boxShadow: theme.cardShadow,
    },
    // Back face: holds the description. On dark we keep the original
    // accent-tinted gradient (gives the back a different feel from front);
    // on light we keep the same white card so the flip just swaps content,
    // not surface — adding a soft accent border instead so the eye still
    // registers the flip as state change.
    capFaceBack: {
      transform: 'rotateY(180deg)',
      background: theme.isLight
        ? theme.cardGradientAccent
        : 'linear-gradient(135deg, rgba(62,79,224,0.12) 0%, rgba(0,0,0,0.6) 100%)',
      // Dark preserves the original 0.28 accent hairline; light uses the
      // borderAccent token so the back face still announces the flip.
      border: theme.isLight ? `1px solid ${theme.borderAccent}` : '1px solid rgba(62,79,224,0.28)',
      alignItems: 'flex-start',
      flexDirection: 'column',
      justifyContent: 'center',
    },
    capIcon: {
      width: '48px',
      height: '48px',
      color: theme.isLight ? theme.accent : 'rgba(255,255,255,0.42)',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    capContent: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    },
    capTitle: {
      fontSize: '22px',
      fontWeight: 600,
      // Dark used #fff; light uses ink.
      color: theme.isLight ? theme.ink : '#fff',
      letterSpacing: '-0.2px',
      lineHeight: 1.2,
    },
    capFlipHint: {
      fontFamily: 'var(--font-mono)',
      fontSize: '10.5px',
      fontWeight: 700,
      letterSpacing: '1.4px',
      textTransform: 'uppercase',
      color: theme.isLight ? theme.accent : 'rgba(189,195,246,0.85)',
      flexShrink: 0,
      marginLeft: '12px',
    },
    capDesc: {
      fontSize: '15px',
      fontWeight: 400,
      lineHeight: 1.5,
      // Preserve dark's original 0.82 alpha; light uses inkSecondary token.
      color: theme.isLight ? theme.inkSecondary : 'rgba(255,255,255,0.82)',
      margin: 0,
    },

    // --- BOTTOM: expected impact ---
    impactSection: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    },
    bottomLabel: {
      fontSize: '13px',
      fontWeight: 600,
      letterSpacing: '2px',
      textTransform: 'uppercase',
      color: theme.isLight ? theme.accentDeep : 'rgba(189,195,246,0.78)',
    },
    impactCards: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '16px',
    },
    bottomCard: {
      background: theme.isLight ? theme.bgElevated : theme.surface0,
      // Preserve the original 0.08 hairline on dark; light uses the token.
      border: theme.isLight ? `1px solid ${theme.borderSubtle}` : '1px solid rgba(255,255,255,0.08)',
      borderRadius: '14px',
      padding: '24px 28px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      boxShadow: theme.cardShadow,
    },
    bottomNumber: {
      fontFamily: 'var(--font-display)',
      fontSize: '48px',
      fontWeight: 800,
      background: theme.isLight
        ? `linear-gradient(135deg, ${theme.accentDeep} 0%, ${theme.accent} 100%)`
        : 'linear-gradient(135deg, #3E4FE0 0%, #5967E4 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      letterSpacing: '-1px',
      lineHeight: 1.05,
      fontVariantNumeric: 'tabular-nums',
    },
    bottomText: {
      fontSize: '16px',
      fontWeight: 500,
      // Preserve dark's original 0.78 alpha; light uses inkSecondary token.
      color: theme.isLight ? theme.inkSecondary : 'rgba(255,255,255,0.78)',
      lineHeight: 1.35,
      textTransform: 'lowercase',
    },
    bottomSource: {
      fontFamily: 'var(--font-mono)',
      fontSize: '10.5px',
      fontWeight: 500,
      letterSpacing: '0.3px',
      // Preserve dark's original 0.32 alpha; light uses inkMuted for parity.
      color: theme.isLight ? theme.inkMuted : 'rgba(255,255,255,0.32)',
      marginTop: '8px',
      textAlign: 'left',
    },
  }

  const caps = [
    { num: '01', title: data.CAPABILITY_1_TITLE, desc: data.CAPABILITY_1_DESC },
    { num: '02', title: data.CAPABILITY_2_TITLE, desc: data.CAPABILITY_2_DESC },
    { num: '03', title: data.CAPABILITY_3_TITLE, desc: data.CAPABILITY_3_DESC },
    { num: '04', title: data.CAPABILITY_4_TITLE, desc: data.CAPABILITY_4_DESC },
  ]

  const isBanking = data?.MODE === 'banking'
  const isPartner = data?.MODE === 'partner'
  const sectionLabel = isBanking ? t('section.banking_vertical')
    : isPartner ? t('section.partner_solve_section')
    : `${t('section.merchant_solve_section')} ${data.COMPANY_NAME}`
  return (
    <SlideBase
      section={sectionLabel}
      slideNumber={4}
    >
      <h2 style={styles.title}>
        {isBanking ? (
          <>
            {t('yunoSolve.title_banking_lead')} <span style={styles.accent}>{t('yunoSolve.title_banking_accent')}</span>
          </>
        ) : (
          <>
            {t('yunoSolve.title_merchant_lead')} <span style={styles.accent}>{t('yunoSolve.title_merchant_accent')}</span>
          </>
        )}
      </h2>

      <div style={styles.body}>
        <div style={styles.monoKicker}>
          <span style={styles.monoKickerCaret}>&gt;</span>
          {isBanking ? t('yunoSolve.kicker_banking') : t('yunoSolve.kicker_merchant')}
          <BeamRule delay={1.5} base={theme.beamBase} beam={theme.beam} />
        </div>

        <div style={styles.mainRow}>
          <div style={styles.leftPanel}>
            <div className="reveal" style={{ ...styles.architectureCard, '--reveal-delay': '0.1s' }}>
              <div style={styles.archHeaderRow}>
                <div>
                  <div style={styles.archLabel}>
                    {isBanking ? t('yunoSolve.arch_label_banking')
                      : isPartner ? t('yunoSolve.arch_label_partner')
                      : t('yunoSolve.arch_label_merchant')}
                  </div>
                  <div style={styles.archTitle}>
                    {isBanking ? t('yunoSolve.arch_title_banking')
                      : isPartner ? t('yunoSolve.arch_title_partner')
                      : `${t('yunoSolve.arch_title_merchant_pre')} ${data.COMPANY_NAME}`}
                  </div>
                </div>
                <div style={styles.archBadge}>
                  <span style={styles.archBadgeDot} />
                  {isBanking ? t('yunoSolve.arch_badge_banking') : t('yunoSolve.arch_badge_live')}
                </div>
              </div>
              <ArchitectureStack
                merchantName={isPartner ? 'Merchant' : data.COMPANY_NAME}
                merchantLogo={isPartner ? null : (data.COMPANY_LOGO_MONO || data.COMPANY_LOGO)}
                isTileLogo={!isPartner && Boolean(data.COMPANY_LOGO_MONO)}
                psps={isPartner || isBanking ? [] : (Array.isArray(data.PSPS) ? data.PSPS.slice(0, 4) : [])}
                styles={styles}
                theme={theme}
                t={t}
              />
            </div>
          </div>

          <div style={styles.rightPanel}>
            <div style={styles.archHeaderRow}>
              <div>
                <div style={styles.archLabel}>{t('yunoSolve.capabilities_eyebrow')}</div>
                <div style={styles.archTitle}>{t('yunoSolve.capabilities_title')}</div>
              </div>
              <img src="/ss-deck-assets/assets/yuno-mark-white.svg" alt="" style={styles.capabilitiesMark} aria-hidden />
            </div>
            <div className="stagger" style={{ ...styles.capList, '--stagger-base': '0.3s', '--stagger-step': '0.09s' }}>
              {caps.map((c) => (
                <CapCard key={c.num} num={c.num} title={c.title} desc={c.desc} styles={styles} theme={theme} t={t} />
              ))}
            </div>
          </div>
        </div>

        <div style={styles.impactSection}>
          <span style={styles.bottomLabel}>{t('yunoSolve.expected_impact')}</span>
          <div className="stagger" style={{ ...styles.impactCards, '--stagger-base': '0.7s', '--stagger-step': '0.06s' }}>
            {[
              { n: '+3–8%',  l: t('yunoSolve.impact_auth_uplift') },
              { n: '20–30%', l: t('yunoSolve.impact_decline_recovery') },
              { n: t('yunoSolve.impact_weeks'), l: t('yunoSolve.impact_to_markets') },
              { n: '1',      l: t('yunoSolve.impact_integration') },
            ].map((s) => (
              <div key={s.l} style={styles.bottomCard}>
                <div style={styles.bottomNumber}>{s.n}</div>
                <div style={styles.bottomText}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={styles.bottomSource}>&gt; {t('yunoSolve.impact_source')}</div>
        </div>
      </div>
    </SlideBase>
  )
}
