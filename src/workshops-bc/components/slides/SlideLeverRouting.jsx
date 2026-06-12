import HalftoneBg from '../primitives/HalftoneBg'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'
import { fmtPct, fmtMoney, fmtNum } from '../../lib/format'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

// Dashboard-style routing mock (left) + impact card (right).
// Pattern from the bet365 deck's "One dashboard, every PSP, one click" slide:
//   conditions → split (50/50) → primary PSPs → fallback PSPs
// 4 PSP cards in a 2×2 grid:
//   - Stage 1 (left col): client's CURRENT acquirers (the inputs)
//   - Stage 2 (right col): Yuno-introduced fallback acquirers
// Cascade flow: each Stage 1 card's Declined row pipes to its row's Stage 2
// "Succeeded" entry — animated decline retry between paired acquirers.

// Country-mapped fallback acquirers. These are the names that appear in
// Stage 2 (the "Yuno brings these new partners" message). Each region's
// pair is realistic — the client recognizes them as legitimate alternatives
// to whoever they're using today. Fallbacks to generic A/B for unmapped
// countries so the slide still renders sanely.
const FALLBACK_BY_COUNTRY = {
  MX: ['Banorte', 'Citibanamex'],
  BR: ['Stone',   'PagSeguro'],
  AR: ['Mercado Pago', 'Naranja'],
  CO: ['Bancolombia',  'Davivienda'],
  PE: ['Niubiz',       'Izipay'],
  CL: ['Transbank',    'Webpay'],
}

export default function SlideLeverRouting({ data, pageNum, total, lang = 'es', currency: currencyProp }) {
  const t = (path) => tr(STRINGS, lang, path)
  const inputs = data?.INPUTS || {}
  const bc = data?.BUSINESS_CASE || {}
  const currency = currencyProp || inputs.currency || bc.currency || 'USD'
  const m = (v, opts) => fmtMoney(v, currency, lang, opts)
  const cs = currency === 'EUR' ? '€' : '$'
  const country = data?.COUNTRY || 'MX'
  const approvalNow = Number(inputs.current_approval_rate_pct) || 82
  const approvalNew = Number(inputs.target_approval_rate_pct) || 85
  const avgTicket = Number(inputs.avg_ticket_usd) || 110
  const takeRate = (Number(bc.take_rate_pct) || 15) / 100
  const incRevenue = Number(bc.incremental_revenue_annual_usd) || 0
  const incTPV = Number(bc.incremental_tpv_annual_usd) || 0
  const incTx = Number(bc.incremental_approved_tx_annual) || 0

  const acquirers = Array.isArray(inputs.current_acquirers) ? inputs.current_acquirers : []
  const acqPrimary = acquirers[0] || 'BBVA'
  const acqSecondary = acquirers[1] || 'EVO'

  const [fb1Name, fb2Name] = FALLBACK_BY_COUNTRY[country] || [t('leverRouting.fallbackAcqA'), t('leverRouting.fallbackAcqB')]

  // Stage 1 — client's current acquirers (gets the traffic first).
  const stage1 = [
    { name: acqPrimary,   score: 86, flashDelay: '0s'   },
    { name: acqSecondary, score: 78, flashDelay: '1.6s' },
  ]
  // Stage 2 — Yuno-introduced fallbacks. Higher success rate = the value prop.
  const stage2 = [
    { name: fb1Name, score: 91, winner: true, flashDelay: '0.4s' },
    { name: fb2Name, score: 89, winner: true, flashDelay: '2.0s' },
  ]

  return (
    <div className="slide theme-light">
      <SectionLabel>{t('leverRouting.sectionLabel')}</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1300,
        color: 'var(--unity-black)',
      }}>
        {t('leverRouting.fromToTemplate').replace('{from}', fmtPct(approvalNow, 1, lang)).replace('{to}', fmtPct(approvalNew, 1, lang))}
        <br/>
        {t('leverRouting.titleApprovalConnector')} <span style={{ color: 'var(--yuno-blue)' }}>{t('leverRouting.titleApprovalWord')}</span>
      </h2>

      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 360, left: 80, fontSize: 18,
        color: 'var(--gray-alt)', maxWidth: 720, lineHeight: 1.5,
      }}>
        {t('leverRouting.body')}
      </div>

      {/* Dashboard mock — window chrome + route header + 4-PSP routing topology */}
      <div className="anim-in anim-in-3" style={{
        position: 'absolute', top: 560, left: 80, right: 720, bottom: 110,
        background: '#0E1014', borderRadius: 14,
        border: '1px solid rgba(40,42,48,0.20)',
        boxShadow: '0 24px 60px rgba(40,42,48,0.18)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        {/* Window chrome */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#FF5F57' }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#FEBC2E' }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#28C840' }} />
          </div>
          <div className="mono" style={{
            fontSize: 11, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em',
          }}>dashboard.y.uno</div>
          <div style={{ width: 33 }} />
        </div>

        {/* Route header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'rgba(255,255,255,0.9)' }}>
            <span style={{ color: 'rgba(255,255,255,0.45)' }}>Route name:</span>
            <span style={{ fontWeight: 600 }}>Smart routing · {country}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, color: 'rgba(224,237,128,0.85)' }}>★</span>
            <span style={{
              padding: '5px 10px', borderRadius: 6,
              background: 'rgba(62,79,224,0.20)', border: '1px solid rgba(124,137,239,0.40)',
              fontSize: 10, fontWeight: 600, color: '#BDC3F6', letterSpacing: '0.04em',
            }}>+ add condition</span>
          </div>
        </div>

        {/* Body — conditions | hub connector | PSP area (2×2 grid) */}
        <div style={{
          flex: 1, padding: '16px 20px',
          display: 'grid', gridTemplateColumns: '0.7fr 64px 1.3fr', gap: 0,
          alignItems: 'stretch', position: 'relative',
        }}>
          {/* Conditions column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
            <ConditionCard label="Card BIN"  op="One of"
              chips={['272028', '551689', '477191', '+180']} />
            <ConditionCard label="Currency"  op="Equal"
              chips={[country === 'BR' ? 'BRL' : country === 'AR' ? 'ARS' : country === 'CO' ? 'COP' : country === 'PE' ? 'PEN' : country === 'CL' ? 'CLP' : 'MXN']} />
            <ConditionCard label="Country"   op="Equal"
              chips={[country]} />
          </div>

          {/* Hub-to-primary connector — 50/50 split to the 2 primary PSPs */}
          <div style={{ position: 'relative' }}>
            <svg
              width="100%" height="100%"
              viewBox="0 0 64 308" preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            >
              <defs>
                <filter id="routingBeamGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="0.6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" /><feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(189,195,246,0.7)" />
                  <stop offset="100%" stopColor="rgba(189,195,246,0)" />
                </radialGradient>
              </defs>

              {/* Hub node — breathing glow */}
              <circle cx="32" cy="154" r="9" fill="url(#hubGlow)">
                <animate attributeName="r" values="7;10;7" dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;1;0.6" dur="3s" repeatCount="indefinite" />
              </circle>
              <circle cx="32" cy="154" r="3.5" fill="#BDC3F6" />

              {/* Feeders: 3 conditions → hub */}
              {[
                { d: 'M0,55  C16,55  16,154 32,154', dur: 2.6, delay: -0.0 },
                { d: 'M0,154 L32,154',                dur: 2.2, delay: -0.8 },
                { d: 'M0,253 C16,253 16,154 32,154', dur: 2.6, delay: -1.6 },
              ].map((p, i) => (
                <g key={`feed-${i}`}>
                  <path d={p.d} fill="none" stroke="rgba(124,137,239,0.35)" strokeWidth="1" strokeLinecap="round" />
                  <path d={p.d} fill="none" stroke="#7C89EF" strokeWidth="1.8" strokeLinecap="round"
                    pathLength="100" strokeDasharray="24 76"
                    filter="url(#routingBeamGlow)" opacity="0.85">
                    <animate attributeName="stroke-dashoffset" from="0" to="-100"
                      dur={`${p.dur}s`} begin={`${p.delay}s`} repeatCount="indefinite" />
                  </path>
                </g>
              ))}

              {/* Hub → 2 primary PSPs (50/50 split, top & bottom of stage-1 column) */}
              {[
                { d: 'M32,154 C48,154 48,98  64,98',  dur: 2.4, delay: -0.4 },
                { d: 'M32,154 C48,154 48,210 64,210', dur: 2.4, delay: -1.2 },
              ].map((p, i) => (
                <g key={`out-${i}`}>
                  <path d={p.d} fill="none" stroke="rgba(124,137,239,0.30)" strokeWidth="1.2" strokeLinecap="round" />
                  <path d={p.d} fill="none" stroke="#7C89EF" strokeWidth="1.8" strokeLinecap="round"
                    pathLength="100" strokeDasharray="28 72"
                    filter="url(#routingBeamGlow)">
                    <animate attributeName="stroke-dashoffset" from="0" to="-100"
                      dur={`${p.dur}s`} begin={`${p.delay}s`} repeatCount="indefinite" />
                  </path>
                </g>
              ))}
            </svg>

            {/* 50/50 split labels */}
            <span style={{ ...splitLabel, top: '30%', animation: 'splitPulse 3s ease-in-out infinite' }}>50%</span>
            <span style={{ ...splitLabel, top: '68%', animation: 'splitPulse 3s ease-in-out 0.5s infinite' }}>50%</span>
          </div>

          {/* PSP area — 2x2 grid with column headers + middle fallback gutter */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 80px 1fr',
            gridTemplateRows: 'auto 1fr',
            rowGap: 12, columnGap: 0,
            position: 'relative',
          }}>
            {/* Column headers — row 1 */}
            <div style={colHeader}>{t('leverRouting.columnHeaderCurrent')}</div>
            <div />
            <div style={{ ...colHeader, color: 'rgba(224,237,128,0.80)' }}>{t('leverRouting.columnHeaderFallback')}</div>

            {/* Stage 1 column — current acquirers */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
              {stage1.map((p) => (
                <PspCard key={p.name} {...p} winner={false} />
              ))}
            </div>

            {/* Fallback cascade gutter — animated wires between paired cards */}
            <div style={{ position: 'relative' }}>
              <FallbackCascade />
            </div>

            {/* Stage 2 column — Yuno-introduced fallbacks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
              {stage2.map((p) => (
                <PspCard key={p.name} {...p} winner />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Impact card (right) */}
      <div className="anim-in anim-in-4" style={{
        position: 'absolute', top: 360, right: 80, width: 580, bottom: 110,
        padding: 40, background: 'var(--unity-black)', color: '#fff',
        borderRadius: 18, overflow: 'hidden',
      }}>
        <HalftoneBg color="#3E4FE0" opacity={0.45} density={22} fadeDir="bottom" />
        <div style={{ position: 'relative' }}>
          <div className="t-label" style={{ color: '#E0ED80', marginBottom: 14 }}>{t('leverRouting.impactLabel')}</div>
          <div className="num-tabular" style={{
            fontSize: 84, fontWeight: 200, color: '#fff',
            letterSpacing: '-0.04em', lineHeight: 1,
          }}>
            +{m(incRevenue, { decimals: 1 })}
          </div>
          <div style={{ marginTop: 14, fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
            {t('leverRouting.impactCaptionTemplate')
              .replace('{take}', Math.round(takeRate * 100))
              .replace('{tpv}', m(incTPV, { decimals: 1 }))
              .replace('{curr}', currency)}
          </div>
          <div style={{ marginTop: 28, paddingTop: 22, borderTop: '1px solid rgba(255,255,255,0.14)' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
              {t('leverRouting.calculationLabel')}<br/>
              <span className="mono" style={{ color: '#BDC3F6', fontSize: 13 }}>
                {t('leverRouting.formulaInline')
                  .replace('{to}', fmtPct(approvalNew, 1, lang))
                  .replace('{from}', fmtPct(approvalNow, 1, lang))
                  .replace('{curr}', cs)
                  .replace('{ticket}', Math.round(avgTicket).toLocaleString('es-MX'))
                  .replace('{take}', Math.round(takeRate * 100))}
              </span>
            </div>
            <div style={{ marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
              {t('leverRouting.extraApprovedTemplate').replace('{n}', fmtNum(incTx, lang))}
              {' '}{t('leverRouting.extraFollow')}
            </div>
          </div>
        </div>
      </div>

      <SlideFooter section={t('leverRouting.footerSection')} pageNum={pageNum} total={total} />
    </div>
  )
}

// ── styling helpers ────────────────────────────────────────────────────────

const splitLabel = {
  position: 'absolute', left: '50%', transform: 'translate(-50%, -50%)',
  padding: '3px 8px', borderRadius: 999,
  background: 'rgba(124,137,239,0.14)', border: '1px solid rgba(124,137,239,0.35)',
  fontFamily: 'Geist Mono, ui-monospace, Menlo, monospace',
  fontSize: 10, fontWeight: 600, color: '#BDC3F6',
  letterSpacing: '0.04em',
}

const colHeader = {
  fontFamily: 'Titillium Web, sans-serif',
  fontSize: 10, fontWeight: 700,
  color: 'rgba(255,255,255,0.45)',
  letterSpacing: '0.14em', textTransform: 'uppercase',
  paddingLeft: 4,
}

// ── condition card (left column) ───────────────────────────────────────────

function ConditionCard({ label, op, chips }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 14, height: 14, borderRadius: 3, background: 'rgba(124,137,239,0.18)', border: '1px solid rgba(124,137,239,0.30)' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5 }}>
        <span style={{
          padding: '2px 8px', borderRadius: 5,
          background: 'rgba(62,79,224,0.20)', border: '1px solid rgba(124,137,239,0.40)',
          fontSize: 10, fontWeight: 600, color: '#BDC3F6',
        }}>{op}</span>
        {chips.map((c, i) => (
          <span key={i} style={{
            padding: '2px 8px', borderRadius: 5,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.80)',
            fontFamily: 'Geist Mono, ui-monospace, Menlo, monospace',
          }}>{c}</span>
        ))}
      </div>
    </div>
  )
}

// ── PSP card (stage 1 + stage 2) ───────────────────────────────────────────

function PspCard({ name, score, winner, flashDelay = '0s' }) {
  return (
    <div style={{
      position: 'relative',
      background: winner ? 'rgba(62,79,224,0.18)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${winner ? 'rgba(124,137,239,0.55)' : 'rgba(255,255,255,0.10)'}`,
      borderRadius: 10, padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 8,
      boxShadow: winner ? '0 0 0 1px rgba(224,237,128,0.20), 0 8px 20px rgba(62,79,224,0.18)' : 'none',
      animation: winner ? 'winnerBreathe 2.4s ease-in-out infinite' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 18, height: 18, borderRadius: 4,
            background: winner ? '#E0ED80' : 'rgba(124,137,239,0.30)',
            color: winner ? '#0E1014' : '#BDC3F6',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800,
          }}>{name[0]}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{name}</span>
        </div>
        <span className="num-tabular" style={{
          fontSize: 12, fontWeight: 700,
          color: winner ? '#E0ED80' : 'rgba(255,255,255,0.55)',
          animation: `${winner ? 'scoreFlashWin' : 'scoreFlash'} 4.8s ease-in-out ${flashDelay} infinite`,
        }}>{score}%</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <PspRow label="Succeeded" state="ok"   active={false} />
        <PspRow label="Declined"  state="warn" active={!winner /* stage-1 declines pipe to fallback */} />
        <PspRow label="Error"     state="err"  active={false} />
      </div>
    </div>
  )
}

function PspRow({ label, state, active = false }) {
  const dot =
    state === 'ok'   ? { color: '#22C55E', glyph: '✓' } :
    state === 'warn' ? { color: '#FB923C', glyph: '⊘' } :
                       { color: '#EF4444', glyph: '✕' }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: 10, color: 'rgba(255,255,255,0.70)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          width: 11, height: 11, borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${dot.color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: dot.color, fontSize: 7, fontWeight: 700,
        }}>{dot.glyph}</span>
        <span>{label}</span>
      </div>
      {active ? (
        // "Exits to fallback" — orange caret, same vocabulary as ss-deck.
        <span style={{
          width: 14, height: 14, borderRadius: 3,
          background: 'rgba(251,146,60,0.18)',
          border: '1px solid rgba(251,146,60,0.50)',
          color: '#FB923C',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, lineHeight: 1,
          animation: 'activeCaretPulse 2.2s ease-in-out infinite',
        }}>›</span>
      ) : (
        <span style={{
          width: 10, height: 10, borderRadius: 3,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        }} />
      )}
    </div>
  )
}

// ── fallback cascade SVG ───────────────────────────────────────────────────
// Sits between Stage 1 and Stage 2 columns. Each row of cards (top/bottom)
// gets its own decline-retry wire: Stage 1 card's Declined row → Stage 2
// card's Succeeded row. Beam slides slower than the main cascade (3.0s vs
// 2.4s) so the retry reads as a "rarer event" than the primary flow.
function FallbackCascade() {
  return (
    <svg
      width="100%" height="100%"
      viewBox="0 0 80 280" preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
    >
      <defs>
        <filter id="fallbackBeamGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.7" result="b" />
          <feMerge>
            <feMergeNode in="b" /><feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Top row: Stage-1 top card (decline) → Stage-2 top card (succeeded) */}
      <FallbackPath y1={99}  y2={84}  delay={-0.0} dur={3.0} />
      {/* Bottom row: Stage-1 bottom card (decline) → Stage-2 bottom card (succeeded) */}
      <FallbackPath y1={203} y2={188} delay={-1.5} dur={3.0} />

      {/* Bonus: Error → fallback parallel paths, dimmer + slower, so the
          error path also visibly routes through (matches bet365 behavior). */}
      <FallbackPath y1={114} y2={114} delay={-0.6} dur={3.6} opacity={0.45} />
      <FallbackPath y1={218} y2={218} delay={-2.1} dur={3.6} opacity={0.45} />
    </svg>
  )
}

function FallbackPath({ y1, y2, delay, dur, opacity = 1 }) {
  // Cubic bezier that bows gently in the 80-unit-wide gutter.
  // Control points at x=40 produce a smooth S-curve when y1 ≠ y2,
  // or a flat horizontal when y1 = y2.
  const d = `M 0,${y1} C 40,${y1} 40,${y2} 80,${y2}`
  return (
    <g style={{ opacity }}>
      <path d={d} fill="none" stroke="rgba(251,146,60,0.28)" strokeWidth="1.2" strokeLinecap="round" />
      <path d={d} fill="none" stroke="#FB923C" strokeWidth="2"
        strokeLinecap="round" pathLength="100" strokeDasharray="30 70"
        filter="url(#fallbackBeamGlow)">
        <animate attributeName="stroke-dashoffset" from="0" to="-100"
          dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
      </path>
      {/* Source dot — pulses at the path origin */}
      <circle cx="1" cy={y1} r="1.6" fill="#FB923C" filter="url(#fallbackBeamGlow)">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="2.4s" repeatCount="indefinite" />
      </circle>
    </g>
  )
}
