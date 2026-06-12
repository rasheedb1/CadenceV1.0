// SlideStack — side-by-side comparison of current point-to-point stack
// vs the Yuno-orchestrated version. Light theme, Yuno-blue accents only.
//
// LEFT  (sin Yuno):  Coppel → Cybersource → BBVA + EVO   (muted, static)
// RIGHT (con Yuno):  Coppel → Yuno bar → Cybersource + Riskified
//                         → junction → 5 acquirers w/ fallback cascade
//
// Right-side wires all carry an animated stroke-dashoffset beam plus a
// circular "payment packet" that travels through the canonical happy
// path (Coppel → Yuno → Cybersource → first acquirer) every 7s, so the
// audience reads the flow visually rather than parsing it cognitively.
// Acquirer cards reuse the S16 PSP-status pattern: ✓ approve / ⚠ decline
// → next / ✕ error, with a pulsing fallback caret in Yuno-blue.

import { SectionLabel, SlideFooter, YunoLogo } from '../primitives/Chrome'
import { fmtPct, fmtNum } from '../../lib/format'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

const NODE_H = 76

// ── Tree-area geometry (1760 wide × 640 tall, origin at top-left) ───
const LEFT_CX  = 430
const RIGHT_CX = 1330

// Right tree antifraud cards
const AF_W = 180
const CYB_CX = RIGHT_CX - 100
const RSK_CX = RIGHT_CX + 100

// Right tree acquirer cards (5)
const RIGHT_ACQ_W = 152
const RIGHT_ACQ_STEP = 170 // w+gap
const RIGHT_ACQ_CENTERS = [-2, -1, 0, 1, 2].map((i) => RIGHT_CX + i * RIGHT_ACQ_STEP)

// Left tree
const LEFT_NODE_W = 240
const LEFT_ACQ_W = 200
const LEFT_ACQ_CENTERS = [LEFT_CX - 130, LEFT_CX + 130]

// Right tree
const RIGHT_NODE_W = 240
const YUNO_BAR_X   = 920
const YUNO_BAR_W   = 820

// Vertical levels (top edges)
const Y_PILL       = 0
const Y_COPPEL     = 40
const Y_COPPEL_B   = Y_COPPEL + NODE_H            // 116
const Y_YUNO       = 180
const Y_YUNO_B     = Y_YUNO + NODE_H              // 256
const Y_AF         = 320
const Y_AF_B       = Y_AF + NODE_H                // 396
const Y_JUNCTION   = 425                          // where two AFs meet
const Y_SPLIT_BAR  = 445                          // horizontal split to 5 acqs
const Y_ACQ        = 460
const ACQ_H_LEFT   = 96
const ACQ_H_RIGHT  = 140                          // taller to fit S16-style rows

// ── Node primitives ────────────────────────────────────────────────

function Node({ x, y, w, h = NODE_H, name, sub, variant = 'default', breathe = false }) {
  const styles = {
    default: {
      bg: '#fff',
      border: 'rgba(40,42,48,0.12)',
      shadow: '0 4px 14px rgba(40,42,48,0.06)',
      titleColor: 'var(--unity-black)',
      subColor: 'var(--gray-alt)',
    },
    muted: {
      bg: '#fff',
      border: 'rgba(40,42,48,0.10)',
      shadow: 'none',
      titleColor: 'var(--unity-black)',
      subColor: 'var(--gray-alt)',
    },
  }
  const s = styles[variant]
  return (
    <div style={{
      position: 'absolute',
      left: x, top: y, width: w, height: h,
      background: s.bg,
      border: `1px solid ${s.border}`,
      borderRadius: 12,
      boxShadow: s.shadow,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center',
      padding: '0 18px',
      animation: breathe ? 'nodeBreathe 2.6s ease-in-out infinite' : undefined,
    }}>
      <div style={{
        fontFamily: 'Titillium Web', fontWeight: 700,
        fontSize: 20, color: s.titleColor,
        letterSpacing: '-0.02em', lineHeight: 1.1,
      }}>{name}</div>
      {sub && (
        <div className="num-tabular" style={{
          fontFamily: 'Geist Mono, ui-monospace, monospace',
          fontSize: 11, color: s.subColor,
          marginTop: 4, letterSpacing: '0.02em',
        }}>{sub}</div>
      )}
    </div>
  )
}

function YunoBar({ x, y, w, lang = 'es' }) {
  const orchLabel = tr(STRINGS, lang, 'stack.roleOrchestration')
  const caps = STRINGS.stack.capabilities.map((c) => c[lang] || c.en)
  return (
    <div style={{
      position: 'absolute',
      left: x, top: y, width: w, height: NODE_H,
      background: 'linear-gradient(135deg, var(--yuno-blue) 0%, var(--yuno-blue-deep) 100%)',
      border: '1px solid var(--yuno-blue-deep)',
      borderRadius: 12,
      display: 'flex', alignItems: 'center', gap: 18,
      padding: '0 22px',
      animation: 'yunoBarBreathe 3.2s ease-in-out infinite',
    }}>
      <YunoLogo size={20} color="#fff" />
      <span style={{
        fontFamily: 'Titillium Web', fontWeight: 400, fontSize: 14,
        color: 'rgba(255,255,255,0.85)', letterSpacing: '0.02em',
      }}>{orchLabel}</span>
      <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {caps.map((cap) => (
          <span key={cap} style={{
            padding: '4px 10px', borderRadius: 999,
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.20)',
            fontSize: 10, fontWeight: 600,
            color: '#fff', letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
          }}>{cap}</span>
        ))}
      </div>
    </div>
  )
}

function PlainAcquirerCard({ x, y, w, role, name }) {
  return (
    <div style={{
      position: 'absolute',
      left: x, top: y, width: w, height: ACQ_H_LEFT,
      background: '#fff',
      border: '1px solid rgba(40,42,48,0.10)',
      borderRadius: 10,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center',
      padding: '0 10px',
      boxShadow: '0 4px 14px rgba(40,42,48,0.06)',
    }}>
      {role && (
        <div className="t-label" style={{
          fontSize: 9, color: 'var(--gray-alt)',
          letterSpacing: '0.16em', marginBottom: 4,
        }}>{role}</div>
      )}
      <div style={{
        fontFamily: 'Titillium Web', fontWeight: 700,
        fontSize: 17, color: 'var(--unity-black)',
        letterSpacing: '-0.02em', lineHeight: 1,
      }}>{name}</div>
    </div>
  )
}

// Right-side acquirer card with S16-style ✓ / ⚠ / ✕ rows.
function PspAcquirerCard({ x, y, w, role, name, cascadeDelay = '0s', lang = 'es' }) {
  const lApprove  = tr(STRINGS, lang, 'stack.statusApprove')
  const lFallback = tr(STRINGS, lang, 'stack.statusFallback')
  const lError    = tr(STRINGS, lang, 'stack.statusError')
  return (
    <div style={{
      position: 'absolute',
      left: x, top: y, width: w, height: ACQ_H_RIGHT,
      background: '#fff',
      border: '1px solid rgba(40,42,48,0.10)',
      borderRadius: 10,
      padding: '12px 12px',
      boxShadow: '0 6px 18px rgba(62,79,224,0.10)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div className="t-label" style={{
        fontSize: 8, color: 'var(--yuno-blue)',
        letterSpacing: '0.16em', textAlign: 'center',
      }}>{role}</div>
      <div style={{
        fontFamily: 'Titillium Web', fontWeight: 700,
        fontSize: 16, color: 'var(--unity-black)',
        letterSpacing: '-0.02em', lineHeight: 1, textAlign: 'center',
      }}>{name}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
        <StatusRow icon="✓" label={lApprove}  color="#16A34A" />
        <StatusRow icon="⚠" label={lFallback} color="var(--yuno-blue)" active delay={cascadeDelay} />
        <StatusRow icon="✕" label={lError}    color="rgba(40,42,48,0.30)" />
      </div>
    </div>
  )
}

function StatusRow({ icon, label, color, active = false, delay = '0s' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 6, fontSize: 9, color: 'var(--gray-alt)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{
          width: 11, height: 11, borderRadius: '50%',
          background: '#fff',
          border: `1px solid ${color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color, fontSize: 7, fontWeight: 700, flexShrink: 0,
        }}>{icon}</span>
        <span>{label}</span>
      </div>
      {active ? (
        <span style={{
          width: 14, height: 14, borderRadius: 3,
          background: 'rgba(62,79,224,0.14)',
          border: '1px solid rgba(62,79,224,0.45)',
          color: 'var(--yuno-blue)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, lineHeight: 1,
          animation: 'cascadeCaretPulseBlue 2.2s ease-in-out infinite',
          animationDelay: delay,
        }}>›</span>
      ) : (
        <span style={{
          width: 10, height: 10, borderRadius: 3,
          background: 'rgba(40,42,48,0.04)', border: '1px solid rgba(40,42,48,0.10)',
        }} />
      )}
    </div>
  )
}

function HeaderPill({ x, y, w, label, accent }) {
  return (
    <div style={{
      position: 'absolute',
      left: x, top: y, width: w,
      display: 'flex', justifyContent: 'center',
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 14px', borderRadius: 999,
        background: `${accent}14`,
        border: `1px solid ${accent}55`,
        color: accent, fontSize: 10, fontWeight: 700,
        letterSpacing: '0.18em', textTransform: 'uppercase',
      }}>
        <span style={{
          width: 5, height: 5, borderRadius: '50%', background: accent,
        }} />
        {label}
      </span>
    </div>
  )
}

// ── Wire layer ─────────────────────────────────────────────────────
// Renders ALL the tree connectors as one SVG so endpoints stay
// pixel-aligned with the absolutely-positioned nodes. Every right-side
// wire carries an animated stroke-dashoffset beam (yuno-blue) so the
// flow reads as live. A single "payment packet" circle travels the
// happy-path Coppel → Yuno → Cybersource → BBVA on a 7-second loop.

function TreeWires({ hasAntifraud = true }) {
  const muted = 'rgba(40,42,48,0.22)'
  const stroke = 'rgba(62,79,224,0.55)'
  const beam = '#7C89EF'

  // Canonical happy-path for the packet animation
  const packetPath = [
    `M ${RIGHT_CX},${Y_COPPEL_B}`,                        // exit Coppel
    `V ${Y_YUNO}`,                                        // enter Yuno bar
    `V ${Y_YUNO_B}`,                                      // through Yuno
    `V 290`,                                              // down to AF split level
    `H ${CYB_CX}`,                                        // over to Cybersource column
    `V ${Y_AF}`,                                          // enter Cybersource
    `V ${Y_AF_B}`,                                        // through Cybersource
    `V ${Y_JUNCTION - 10}`,                               // out to junction approach
    `H ${RIGHT_CX}`,                                      // join junction
    `V ${Y_JUNCTION}`,
    `V ${Y_SPLIT_BAR}`,                                   // down to split bar
    `H ${RIGHT_ACQ_CENTERS[0]}`,                          // over to BBVA column
    `V ${Y_ACQ}`,                                         // into BBVA card
  ].join(' ')

  // Each right-side segment (so we can stagger beam timings)
  const rightWires = [
    // Coppel → Yuno bar
    { d: `M ${RIGHT_CX},${Y_COPPEL_B} V ${Y_YUNO}`, dur: 2.4, delay: 0 },
    // Yuno bar → AF split level
    { d: `M ${RIGHT_CX},${Y_YUNO_B} V 290`, dur: 1.4, delay: -0.3 },
    // AF split horizontal: 290 from CYB_CX to RSK_CX
    { d: `M ${CYB_CX},290 H ${RSK_CX}`, dur: 2.2, delay: -0.5 },
    // 290 → Cybersource top
    { d: `M ${CYB_CX},290 V ${Y_AF}`, dur: 1.4, delay: -0.7 },
    // 290 → Riskified top
    { d: `M ${RSK_CX},290 V ${Y_AF}`, dur: 1.4, delay: -0.9 },
    // Cybersource bottom → junction
    { d: `M ${CYB_CX},${Y_AF_B} V ${Y_JUNCTION - 10} H ${RIGHT_CX} V ${Y_JUNCTION}`, dur: 2.4, delay: -1.1 },
    // Riskified bottom → junction
    { d: `M ${RSK_CX},${Y_AF_B} V ${Y_JUNCTION - 10} H ${RIGHT_CX} V ${Y_JUNCTION}`, dur: 2.4, delay: -1.4 },
    // Junction → split bar
    { d: `M ${RIGHT_CX},${Y_JUNCTION} V ${Y_SPLIT_BAR}`, dur: 1.2, delay: -1.6 },
    // Split bar horizontal across all acquirers
    {
      d: `M ${RIGHT_ACQ_CENTERS[0]},${Y_SPLIT_BAR} H ${RIGHT_ACQ_CENTERS[RIGHT_ACQ_CENTERS.length - 1]}`,
      dur: 2.8, delay: -1.8,
    },
    // 5 verticals from split bar down to acquirer card tops
    ...RIGHT_ACQ_CENTERS.map((cx, i) => ({
      d: `M ${cx},${Y_SPLIT_BAR} V ${Y_ACQ}`,
      dur: 1.0, delay: -2.0 - i * 0.08,
    })),
  ]

  return (
    <svg
      width="1760" height="640" viewBox="0 0 1760 640"
      style={{
        position: 'absolute', left: 0, top: 0,
        pointerEvents: 'none', overflow: 'visible',
      }}
    >
      <defs>
        <filter id="stackBeamGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1" result="b" />
          <feMerge>
            <feMergeNode in="b" /><feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="packetGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(189,195,246,0.95)" />
          <stop offset="100%" stopColor="rgba(189,195,246,0)" />
        </radialGradient>
      </defs>

      {/* ── LEFT TREE (sin Yuno) — muted, no animation ── */}
      {hasAntifraud ? (
        <>
          <line x1={LEFT_CX} y1={Y_COPPEL_B} x2={LEFT_CX} y2={Y_AF}
            stroke={muted} strokeWidth="1.5" />
          <line x1={LEFT_CX} y1={Y_AF_B}     x2={LEFT_CX} y2={Y_SPLIT_BAR}
            stroke={muted} strokeWidth="1.5" />
        </>
      ) : (
        // No AF middleman — client connects directly to the split bar.
        <line x1={LEFT_CX} y1={Y_COPPEL_B} x2={LEFT_CX} y2={Y_SPLIT_BAR}
          stroke={muted} strokeWidth="1.5" />
      )}
      <line x1={LEFT_ACQ_CENTERS[0]} y1={Y_SPLIT_BAR}
            x2={LEFT_ACQ_CENTERS[1]} y2={Y_SPLIT_BAR}
        stroke={muted} strokeWidth="1.5" />
      {LEFT_ACQ_CENTERS.map((cx, i) => (
        <line key={`L-${i}`} x1={cx} y1={Y_SPLIT_BAR} x2={cx} y2={Y_ACQ}
          stroke={muted} strokeWidth="1.5" />
      ))}
      <circle cx={LEFT_CX} cy={Y_SPLIT_BAR} r="2.5" fill={muted} />

      {/* Left "static" beam — slow, single, low-opacity to hint it works */}
      <line x1={LEFT_CX} y1={Y_COPPEL_B} x2={LEFT_CX} y2={hasAntifraud ? Y_AF : Y_SPLIT_BAR}
        stroke={muted} strokeWidth="2" strokeLinecap="round"
        pathLength="100" strokeDasharray="14 86" opacity="0.7">
        <animate attributeName="stroke-dashoffset" from="0" to="-100" dur="6s" repeatCount="indefinite" />
      </line>

      {/* ── RIGHT TREE (con Yuno) — animated beams ── */}
      {rightWires.map((w, i) => (
        <g key={`R-${i}`}>
          <path d={w.d} fill="none" stroke={stroke} strokeWidth="1.5" />
          <path d={w.d} fill="none" stroke={beam} strokeWidth="2.5"
            strokeLinecap="round" pathLength="100" strokeDasharray="22 78"
            filter="url(#stackBeamGlow)">
            <animate attributeName="stroke-dashoffset"
              from="0" to="-100"
              dur={`${w.dur}s`} begin={`${w.delay}s`}
              repeatCount="indefinite" />
          </path>
        </g>
      ))}

      {/* Junction dot — pulses at the center where AFs converge */}
      <circle cx={RIGHT_CX} cy={Y_JUNCTION} r="5"
        fill="var(--yuno-blue)" filter="url(#stackBeamGlow)">
        <animate attributeName="r" values="4;6;4" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;1;0.6" dur="2.4s" repeatCount="indefinite" />
      </circle>

      {/* Payment packet — travels happy path on a 7s loop */}
      <circle r="9" fill="url(#packetGlow)">
        <animateMotion dur="7s" repeatCount="indefinite" path={packetPath} />
      </circle>
      <circle r="4" fill="#fff" stroke="var(--yuno-blue)" strokeWidth="2">
        <animateMotion dur="7s" repeatCount="indefinite" path={packetPath} />
      </circle>
    </svg>
  )
}

// ── Slide ─────────────────────────────────────────────────────────

export default function SlideStack({ data, pageNum, total, lang = 'es' }) {
  const t = (path) => tr(STRINGS, lang, path)
  const name = data?.CLIENT_NAME || t('stack.defaultClient')
  const inputs = data?.INPUTS || {}
  const acquirers = Array.isArray(inputs.current_acquirers) ? inputs.current_acquirers : []
  // hasAntifraud: only render the AF middleman node if the client actually
  // has one. BCI Seguros pays direct to acquirers — no AF layer.
  const antifraudRaw = inputs.current_antifraud
  const hasAntifraud = typeof antifraudRaw === 'string' && antifraudRaw.trim().length > 0
  const antifraud = hasAntifraud ? antifraudRaw : null
  const afNow = Number(inputs.current_antifraud_per_attempt) || 0
  const approvalNow = Number(inputs.current_approval_rate_pct) || 82
  const mdrNow = Number(inputs.current_credit_mdr_pct) || Number(inputs.current_mdr_pct) || 1.60
  const monthlyTx = Number(inputs.monthly_transactions) || 2_800_000

  const acqPrimary = acquirers[0] || 'BBVA'
  const acqSecondary = acquirers[1] || 'EVO'
  const RIGHT_ACQS = [acqPrimary, acqSecondary, 'Getnet', 'Banamex', 'Banorte']

  return (
    <div className="slide theme-light">
      {/* Local keyframes for this slide's animations */}
      <style>{`
        @keyframes cascadeCaretPulseBlue {
          0%, 100% { opacity: 0.75; box-shadow: 0 0 0 rgba(62,79,224,0); }
          50%      { opacity: 1;    box-shadow: 0 0 8px rgba(62,79,224,0.55); }
        }
        @keyframes nodeBreathe {
          0%, 100% { box-shadow: 0 4px 14px rgba(40,42,48,0.06), 0 0 0 0 rgba(62,79,224,0); }
          50%      { box-shadow: 0 6px 22px rgba(62,79,224,0.16), 0 0 0 4px rgba(62,79,224,0.06); }
        }
        @keyframes yunoBarBreathe {
          0%, 100% { box-shadow: 0 10px 30px rgba(62,79,224,0.30); }
          50%      { box-shadow: 0 14px 40px rgba(62,79,224,0.42), 0 0 0 6px rgba(62,79,224,0.08); }
        }
      `}</style>

      <SectionLabel>{t('stack.sectionLabel')}</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1500,
        color: 'var(--unity-black)',
      }}>
        {t('stack.headlineLeadTemplate').replace('{name}', name)}
        <br/>
        {t('stack.withYunoLead')} <span style={{ color: 'var(--yuno-blue)' }}>{t('stack.headlineAccent')}</span>
      </h2>

      {/* Vertical divider between left and right trees */}
      <div className="anim-in anim-in-2" aria-hidden style={{
        position: 'absolute', left: 960, top: 310, bottom: 130, width: 1,
        background: 'linear-gradient(180deg, rgba(40,42,48,0) 0%, rgba(40,42,48,0.10) 20%, rgba(40,42,48,0.10) 80%, rgba(40,42,48,0) 100%)',
      }} />

      {/* Tree area */}
      <div style={{
        position: 'absolute', top: 320, left: 80, width: 1760, height: 640,
      }}>
        <TreeWires hasAntifraud={hasAntifraud} />

        {/* ── LEFT TREE (sin Yuno) ── */}
        <div className="anim-in anim-in-3">
          <HeaderPill x={0} y={Y_PILL} w={880} label={t('stack.pillBefore')} accent="var(--gray-alt)" />
          <Node
            x={LEFT_CX - LEFT_NODE_W / 2} y={Y_COPPEL} w={LEFT_NODE_W}
            name={name}
            sub={`${(monthlyTx / 1e6).toFixed(1)}M ${t('stack.txPerMonth')} · ${fmtPct(approvalNow, 1, lang)}`}
            variant="muted"
          />
          {hasAntifraud && (
            <Node
              x={LEFT_CX - LEFT_NODE_W / 2} y={Y_AF} w={LEFT_NODE_W}
              name={antifraud}
              sub={t('stack.afPerAttempt').replace('${af}', afNow.toFixed(2))}
              variant="muted"
            />
          )}
          {LEFT_ACQ_CENTERS.map((cx, i) => (
            <PlainAcquirerCard
              key={`la-${i}`}
              x={cx - LEFT_ACQ_W / 2} y={Y_ACQ} w={LEFT_ACQ_W}
              role={i === 0 ? t('stack.rolePrimary') : t('stack.roleSecondary')}
              name={i === 0 ? acqPrimary : acqSecondary}
            />
          ))}
        </div>

        {/* ── RIGHT TREE (con Yuno) ── */}
        <div className="anim-in anim-in-4">
          <HeaderPill x={880} y={Y_PILL} w={880} label={t('stack.pillAfter')} accent="var(--yuno-blue)" />
          <Node
            x={RIGHT_CX - RIGHT_NODE_W / 2} y={Y_COPPEL} w={RIGHT_NODE_W}
            name={name}
            sub={`${(monthlyTx / 1e6).toFixed(1)}M ${t('stack.txPerMonth')}`}
            breathe
          />
          <YunoBar x={YUNO_BAR_X} y={Y_YUNO} w={YUNO_BAR_W} lang={lang} />
          <Node
            x={CYB_CX - AF_W / 2} y={Y_AF} w={AF_W}
            name="Cybersource"
            sub={t('stack.afFirstRound')}
            breathe
          />
          <Node
            x={RSK_CX - AF_W / 2} y={Y_AF} w={AF_W}
            name="Riskified"
            sub={t('stack.afCascade')}
            breathe
          />
          {RIGHT_ACQ_CENTERS.map((cx, i) => (
            <PspAcquirerCard
              key={`ra-${i}`}
              x={cx - RIGHT_ACQ_W / 2} y={Y_ACQ} w={RIGHT_ACQ_W}
              role={i < 2 ? t('stack.roleIntegrated') : t('stack.roleNewViaYuno')}
              name={RIGHT_ACQS[i]}
              cascadeDelay={`${i * 0.3}s`}
              lang={lang}
            />
          ))}
        </div>
      </div>

      {/* Comparison strip */}
      <div className="anim-in anim-in-5" style={{
        position: 'absolute', bottom: 70, left: 80, right: 80,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24,
      }}>
        <div style={{
          padding: '14px 20px', borderRadius: 10,
          background: 'rgba(40,42,48,0.04)',
          border: '1px solid rgba(40,42,48,0.10)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span className="t-label" style={{ color: 'var(--gray-alt)' }}>{t('stack.today')}</span>
          <span style={{ fontSize: 13, color: 'var(--gray-alt)', lineHeight: 1.4 }}>
            {hasAntifraud
              ? t('stack.summaryBefore')
                  .replace('{mdr}', fmtPct(mdrNow, 2, lang))
                  .replace('{af}', afNow.toFixed(2))
              : `2 PSPs · ${lang === 'es' ? 'sin ruteo' : lang === 'pt' ? 'sem roteamento' : 'no routing'} · ${fmtPct(mdrNow, 2, lang)} MDR`}
          </span>
        </div>
        <div style={{
          padding: '14px 20px', borderRadius: 10,
          background: 'rgba(62,79,224,0.06)',
          border: '1px solid rgba(62,79,224,0.30)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span className="t-label" style={{ color: 'var(--yuno-blue)' }}>{t('stack.withYuno')}</span>
          <span style={{ fontSize: 13, color: 'var(--unity-black)', lineHeight: 1.4 }}>
            {t('stack.summaryAfter').replace('{txAnnualM}', fmtNum(Math.round(monthlyTx * 12 / 1e6), lang))}
          </span>
        </div>
      </div>

      <SlideFooter section={t('stack.footerSection')} pageNum={pageNum} total={total} />
    </div>
  )
}
