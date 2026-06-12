// SlideYunoCost — cierra la sección de business case mostrando lo que cuesta
// usar Yuno y cuál es el beneficio neto. Layout:
//   LEFT  — pricing structure (SaaS + tabla escalonada per-tx)
//   RIGHT — desglose del costo anual para este cliente + beneficio neto + ROI
// La idea es que el AE pueda pasar uno a uno: aquí cobramos esto, tu volumen
// cae en estos escalones, te cuesta X al año, te entrega Y al año, neto Z.
import HalftoneBg from '../primitives/HalftoneBg'
import OrbHalftone from '../primitives/OrbHalftone'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'
import { fmtMoney, fmtNum } from '../../lib/format'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'
import { deriveLocalBC } from '../../lib/bcLocal'

const DEFAULT_TIERS = [
  { limit_tx: 250_000,   rate_local: 0.72 },
  { limit_tx: 500_000,   rate_local: 0.63 },
  { limit_tx: 750_000,   rate_local: 0.54 },
  { limit_tx: 1_000_000, rate_local: 0.45 },
  { limit_tx: Infinity,  rate_local: 0.36 },
]

// Negotiated discount applied to EVERY tier — default 10% (Coppel-style).
// Override via `inputs.yuno_tier_discount_pct` (0 = no discount, e.g. BCI
// where tier rates are already the final negotiated rate).
const DEFAULT_TIER_DISCOUNT_PCT = 0.10

// Minimum-transactional commercial commitment for Coppel: ramps month-by-
// month from 150K approved tx (Sep) to 1.1M (month 6, Feb). Linear step.
// Override via `inputs.yuno_min_tx_ramp_enabled = false` to show a single
// flat minimum (BCI: flat 100K, no ramp).
const MIN_TX_RAMP_START = 150_000
const MIN_TX_RAMP_END = 1_100_000
const MIN_TX_RAMP_MONTHS_COUNT = 6
const MIN_TX_RAMP_FIRST_MONTH_IDX = 8 // 0=Jan, 8=Sep — feeds Intl monthLabel

function tierLabel(t, prev) {
  const lo = prev.toLocaleString('es-MX')
  const hi = Number.isFinite(t.limit_tx) ? t.limit_tx.toLocaleString('es-MX') : '∞'
  return Number.isFinite(t.limit_tx) ? `${lo}–${hi}` : `${lo}+`
}

export default function SlideYunoCost({ data, pageNum, total, lang = 'es', currency: currencyProp }) {
  const t = (path) => tr(STRINGS, lang, path)
  const inputs = data?.INPUTS || {}
  const bc = data?.BUSINESS_CASE || {}
  const currency = currencyProp || inputs.currency || bc.currency || 'MXN'
  const m = (v, opts) => fmtMoney(v, currency, lang, opts)
  const cs = currency === 'EUR' ? '€' : '$'

  // Pricing inputs (con fallbacks a la rate card de MX retail-ecommerce)
  const saasMonthlyUsd = Number(inputs.yuno_saas_monthly_usd) || 5_000
  const fx = Number(bc.usd_to_local_fx) || Number(inputs.usd_to_local_fx) || 18
  const minTxMonthly = Number(bc.yuno_min_tx_monthly) || Number(inputs.yuno_min_tx_monthly) || 200_000
  const tiers = Array.isArray(inputs.yuno_pricing_tiers) && inputs.yuno_pricing_tiers.length > 0
    ? inputs.yuno_pricing_tiers
    : DEFAULT_TIERS

  // Configurable feature flags (per-slug overrides)
  const tierDiscountPct = inputs.yuno_tier_discount_pct != null
    ? Number(inputs.yuno_tier_discount_pct)
    : DEFAULT_TIER_DISCOUNT_PCT
  const minTxRampEnabled = inputs.yuno_min_tx_ramp_enabled !== false  // default true
  const offerTitleOverride = typeof inputs.yuno_credit_offer_title === 'string' ? inputs.yuno_credit_offer_title : null
  const offerBodyOverride = typeof inputs.yuno_credit_offer_body === 'string' ? inputs.yuno_credit_offer_body : null
  const promoBannerEnabled = inputs.yuno_credit_promo_enabled !== false  // default true

  // SaaS — exact same as BC math
  const saasMonthlyLocal = Number(bc.yuno_saas_monthly_local) || saasMonthlyUsd * fx
  const saasAnnualLocal  = Number(bc.yuno_saas_annual_local)  || saasMonthlyLocal * 12
  const tierBreakdown    = Array.isArray(bc.yuno_pricing_tier_breakdown) ? bc.yuno_pricing_tier_breakdown : []
  const meetsMin         = Boolean(bc.yuno_meets_minimum ?? true)

  // Apply −10% to every tier (including the last). listRate = stored
  // (or default) rate; appliedRate = listRate × (1 − discount). Recompute
  // the subtotal per row using the existing tx volume from the BC
  // breakdown so the slide reflects the negotiated price without re-
  // running the math.
  const tierRows = tiers.map((tierDef, i) => {
    const prev = i === 0 ? 0 : tiers[i - 1].limit_tx
    const stored = tierBreakdown[i]
    const tx = stored ? Number(stored.tx) : 0
    const listRate = stored ? Number(stored.rate_local) : tierDef.rate_local
    const appliedRate = listRate * (1 - tierDiscountPct)
    const subtotal = tx * appliedRate
    return { i, prev, tierDef, tx, listRate, appliedRate, discounted: tierDiscountPct > 0, subtotal, active: tx > 0 }
  })

  // Min-tx ramp: linear interpolate from start→end over MONTHS_COUNT
  // points. Locale-aware month label via Intl so es/en/pt render correctly.
  const monthFmt = new Intl.DateTimeFormat(
    lang === 'pt' ? 'pt-BR' : lang === 'en' ? 'en-US' : 'es-MX',
    { month: 'short' },
  )
  const minTxRamp = Array.from({ length: MIN_TX_RAMP_MONTHS_COUNT }, (_, idx) => {
    const ratio = MIN_TX_RAMP_MONTHS_COUNT > 1 ? idx / (MIN_TX_RAMP_MONTHS_COUNT - 1) : 1
    const tx = Math.round(MIN_TX_RAMP_START + (MIN_TX_RAMP_END - MIN_TX_RAMP_START) * ratio)
    const monthIdx = (MIN_TX_RAMP_FIRST_MONTH_IDX + idx) % 12
    const label = monthFmt.format(new Date(2026, monthIdx, 1)).replace('.', '')
    return { monthIdx, label, tx }
  })
  const minTxRampStart = minTxRamp[0].tx
  const minTxRampEnd = minTxRamp[minTxRamp.length - 1].tx
  const perTxMonthly = tierRows.reduce((s, r) => s + r.subtotal, 0)
  const perTxAnnual = perTxMonthly * 12
  const yunoCostAnnual = saasAnnualLocal + perTxAnnual

  // Valor entregado por Yuno + beneficio neto. totalValue se recomputa
  // via deriveLocalBC para arreglar el bug de currency-mix en el math
  // file (ops/recon estaban en USD, savings en local → suma sin sentido).
  // El netBenefit + ROI se calculan contra el costo Yuno descontado.
  const totalValue = deriveLocalBC(data).totalAnnualValue
  const netBenefit = totalValue - yunoCostAnnual
  const roi = yunoCostAnnual > 0 ? totalValue / yunoCostAnnual : 0

  // Monthly approved tx (sum across verticals)
  const bcVerticals = Array.isArray(bc.verticals) ? bc.verticals : []
  const monthlyApproved = bcVerticals.reduce((s, v) => s + (Number(v.annual_approved) || 0), 0) / 12

  return (
    <div className="slide theme-dark">
      <HalftoneBg color="#3E4FE0" opacity={0.14} density={36} fadeDir="top" />
      <OrbHalftone size={760} x="92%" y="20%" color="#E0ED80" style={{ opacity: 0.20 }} />

      <SectionLabel color="rgba(255,255,255,0.7)">{t('yunoCost.sectionLabel')}</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1100, color: '#fff',
      }}>
        {t('yunoCost.titleLead')}
        <br/>
        {t('yunoCost.titleConnector')} <span style={{ color: '#E0ED80' }}>{t('yunoCost.titleAccent')}</span>
      </h2>

      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 320, left: 80, fontSize: 16,
        color: 'rgba(255,255,255,0.65)', maxWidth: 880, lineHeight: 1.5,
      }}>
        {t('yunoCost.bodyLead')} <strong style={{ color: '#fff' }}>{t('yunoCost.bodyMonthlySaaS')}</strong> {t('yunoCost.bodyPlus')}{' '}
        <strong style={{ color: '#fff' }}>{t('yunoCost.bodyPerTx')}</strong>{' '}
        {t('yunoCost.bodyTail')}
        {minTxRampEnabled && (<>
          {' '}
          {t('yunoCost.minRampInlineTemplate')
            .replace('{start}', fmtNum(minTxRampStart, lang))
            .replace('{end}', fmtNum(minTxRampEnd, lang))}
        </>)}
      </div>

      {/* LEFT — pricing structure */}
      <div className="anim-in anim-in-3" style={{
        position: 'absolute', top: 405, left: 80, width: 880, bottom: 90,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {/* SaaS card — MXN-only (precio fijo mensual + anual) */}
        <div style={{
          padding: '18px 22px', borderRadius: 14,
          background: 'rgba(62,79,224,0.10)',
          border: '1px solid rgba(124,137,239,0.40)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div className="t-label" style={{ color: '#BDC3F6', fontSize: 10, marginBottom: 4 }}>
              {t('yunoCost.saasLabel')}
            </div>
            <div style={{
              fontFamily: 'Titillium Web', fontWeight: 700, fontSize: 24,
              color: '#fff', letterSpacing: '-0.02em',
            }}>{t('yunoCost.saasMonthlyLocalTemplate')
              .replace('{curr}', currency)
              .replace('{amount}', Math.round(saasMonthlyLocal).toLocaleString('es-MX'))}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="t-label" style={{ color: '#BDC3F6', fontSize: 10, marginBottom: 4 }}>
              {t('yunoCost.annualLabel')}
            </div>
            <div className="num-tabular" style={{
              fontSize: 32, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em',
            }}>{m(saasAnnualLocal)}</div>
          </div>
        </div>

        {/* Tier table — list rate (tachado) + descuento −10% en tiers 1..n-1 */}
        <div style={{
          padding: '18px 22px', borderRadius: 14,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 12, gap: 12,
          }}>
            <div className="t-label" style={{ color: '#BDC3F6', fontSize: 10 }}>
              {t('yunoCost.perTxTableLabel')}
            </div>
            {tierDiscountPct > 0 && (
              <div style={{
                padding: '3px 10px', borderRadius: 999,
                background: 'rgba(224,237,128,0.15)',
                border: '1px solid rgba(224,237,128,0.45)',
                fontSize: 10, fontWeight: 700, color: '#E0ED80',
                letterSpacing: '0.10em', textTransform: 'uppercase',
              }}>{t('yunoCost.discountBadgeAll')}</div>
            )}
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr 140px 90px 130px',
            fontSize: 10, color: 'rgba(255,255,255,0.45)',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.08)',
            gap: 12,
          }}>
            <span>#</span><span>{t('yunoCost.colTier')}</span>
            <span style={{ textAlign: 'right' }}>{t('yunoCost.colRate')}</span>
            <span style={{ textAlign: 'right' }}>{t('yunoCost.colTxUsed')}</span>
            <span style={{ textAlign: 'right' }}>{t('yunoCost.colSubtotal')}</span>
          </div>
          {tierRows.map((row) => (
            <div key={row.i} style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr 140px 90px 130px',
              gap: 12, padding: '8px 0',
              borderBottom: row.i < tierRows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              color: row.active ? '#fff' : 'rgba(255,255,255,0.45)',
              fontSize: 13, alignItems: 'center',
            }}>
              <span className="mono" style={{ fontSize: 10, opacity: 0.55 }}>{String(row.i + 1).padStart(2, '0')}</span>
              <span>{tierLabel(row.tierDef, row.prev)} {tr(STRINGS, lang, 'yunoCost.tierTxSuffix')}</span>
              <span className="num-tabular" style={{
                textAlign: 'right', fontWeight: 600,
                display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 8,
              }}>
                {row.discounted && (
                  <span style={{
                    fontSize: 11, color: 'rgba(255,255,255,0.35)',
                    textDecoration: 'line-through', fontWeight: 400,
                  }}>{cs}{row.listRate.toFixed(2)}</span>
                )}
                <span style={{ color: row.active ? '#E0ED80' : 'inherit' }}>
                  {cs}{row.appliedRate.toFixed(3)}
                </span>
              </span>
              <span className="num-tabular" style={{ textAlign: 'right' }}>
                {row.active ? fmtNum(row.tx, lang) : '—'}
              </span>
              <span className="num-tabular" style={{ textAlign: 'right', fontWeight: row.active ? 600 : 400 }}>
                {row.active ? m(row.subtotal) : '—'}
              </span>
            </div>
          ))}
          <div style={{
            marginTop: 10, paddingTop: 10,
            borderTop: '1px solid rgba(255,255,255,0.14)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          }}>
            <div>
              <span className="t-label" style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>
                {t('yunoCost.perTxMonthlyTotalLabel')}
              </span>
              <span style={{ marginLeft: 12, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                {t('yunoCost.monthlyApprovedTemplate').replace('{n}', fmtNum(Math.round(monthlyApproved), lang))}
                {!meetsMin && (
                  <span style={{ color: '#FB923C', marginLeft: 8 }}>
                    {t('yunoCost.belowMinimumTemplate').replace('{n}', fmtNum(minTxMonthly, lang))}
                  </span>
                )}
              </span>
            </div>
            <span className="num-tabular" style={{
              fontSize: 24, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em',
            }}>{m(perTxMonthly)}</span>
          </div>
          {/* Ejemplo de cálculo — multiplicación por tier que llega al total */}
          {tierRows.some((r) => r.active) && (
            <div className="mono" style={{
              marginTop: 10, paddingTop: 10,
              borderTop: '1px dashed rgba(255,255,255,0.10)',
              fontSize: 10.5, color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.55, letterSpacing: '0.01em',
            }}>
              <div style={{ color: 'rgba(189,195,246,0.85)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
                {t('yunoCost.formulaLabel')}
              </div>
              {tierRows.filter((r) => r.active).map((r, idx, arr) => (
                <span key={r.i}>
                  <span style={{ color: '#E0ED80' }}>{cs}{r.appliedRate.toFixed(3)}</span>
                  {' × '}
                  <span style={{ color: '#fff' }}>{fmtNum(r.tx, lang)}</span>
                  {idx < arr.length - 1 ? '  +  ' : ''}
                </span>
              ))}
              {'  =  '}
              <span style={{ color: '#fff', fontWeight: 700 }}>{m(perTxMonthly)}/mes</span>
            </div>
          )}
        </div>

        {/* Mínimo transaccional — Coppel default: ramp 6 meses 150K→1.1M.
            BCI default: flat 100K (override `inputs.yuno_min_tx_ramp_enabled = false`). */}
        <div style={{
          padding: '14px 18px', borderRadius: 14,
          background: 'rgba(62,79,224,0.06)',
          border: '1px solid rgba(124,137,239,0.25)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            <div className="t-label" style={{ color: '#BDC3F6', fontSize: 10 }}>
              {minTxRampEnabled ? t('yunoCost.minRampLabel') : t('yunoCost.minFlatLabel')}
            </div>
            <div className="mono" style={{
              fontSize: 10, color: 'rgba(255,255,255,0.55)',
              letterSpacing: '0.10em', textTransform: 'uppercase',
            }}>
              {minTxRampEnabled
                ? `${fmtNum(minTxRampStart, lang)} → ${fmtNum(minTxRampEnd, lang)}`
                : `${fmtNum(minTxMonthly, lang)} ${lang === 'es' ? 'tx/mes' : lang === 'pt' ? 'tx/mês' : 'tx/mo'}`}
            </div>
          </div>
          {!minTxRampEnabled && (
            <div style={{
              padding: '10px 0', textAlign: 'center',
              fontSize: 14, color: 'rgba(255,255,255,0.85)',
              fontFamily: 'Titillium Web', fontWeight: 600,
            }}>
              {lang === 'es' && `mínimo único: ${fmtNum(minTxMonthly, lang)} tx aprobadas / mes`}
              {lang === 'en' && `flat minimum: ${fmtNum(minTxMonthly, lang)} approved tx / month`}
              {lang === 'pt' && `mínimo fixo: ${fmtNum(minTxMonthly, lang)} tx aprovadas / mês`}
            </div>
          )}
          {minTxRampEnabled && (<>

          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${minTxRamp.length}, 1fr)`,
            gap: 6, alignItems: 'end', height: 36,
          }}>
            {minTxRamp.map((r, idx) => {
              const heightPct = (r.tx / minTxRampEnd) * 100
              const isLast = idx === minTxRamp.length - 1
              return (
                <div key={r.monthIdx} style={{
                  display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                  height: '100%',
                }}>
                  <div style={{
                    width: '100%', height: `${heightPct}%`, borderRadius: 4,
                    background: isLast
                      ? 'linear-gradient(180deg, #E0ED80 0%, rgba(224,237,128,0.45) 100%)'
                      : 'linear-gradient(180deg, rgba(124,137,239,0.85) 0%, rgba(124,137,239,0.30) 100%)',
                    border: isLast ? '1px solid rgba(224,237,128,0.65)' : '1px solid rgba(124,137,239,0.45)',
                  }} />
                </div>
              )
            })}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${minTxRamp.length}, 1fr)`,
            gap: 6, marginTop: 6,
          }}>
            {minTxRamp.map((r, idx) => {
              const isLast = idx === minTxRamp.length - 1
              const compact = r.tx >= 1_000_000
                ? `${(r.tx / 1_000_000).toFixed(1)}M`
                : `${Math.round(r.tx / 1_000)}K`
              return (
                <div key={r.monthIdx} style={{ textAlign: 'center', lineHeight: 1.2 }}>
                  <div className="num-tabular" style={{
                    fontSize: 11, fontWeight: 700,
                    color: isLast ? '#E0ED80' : '#fff', letterSpacing: '-0.01em',
                  }}>{compact}</div>
                  <div className="t-label" style={{
                    fontSize: 8, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', marginTop: 1,
                  }}>{r.label}</div>
                </div>
              )
            })}
          </div>
          </>)}
        </div>
      </div>

      {/* RIGHT — total cost + net benefit */}
      <div className="anim-in anim-in-4" style={{
        position: 'absolute', top: 320, right: 80, width: 760, bottom: 110,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {/* Costo Yuno anual */}
        <div style={{
          padding: '20px 24px', borderRadius: 14,
          background: 'rgba(62,79,224,0.18)',
          border: '1px solid rgba(124,137,239,0.45)',
        }}>
          <div className="t-label" style={{ color: '#BDC3F6', marginBottom: 8 }}>
            {t('yunoCost.yunoCostAnnualLabel')}
          </div>
          <div className="num-tabular" style={{
            fontSize: 56, fontWeight: 200, color: '#fff',
            letterSpacing: '-0.03em', lineHeight: 1,
          }}>{m(yunoCostAnnual, { decimals: 1 })}</div>
          <div style={{
            marginTop: 14, display: 'flex', justifyContent: 'space-between',
            paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.14)',
          }}>
            <div>
              <div className="t-label" style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
                {t('yunoCost.saasYearLabel')}
              </div>
              <div className="num-tabular" style={{ fontSize: 20, fontWeight: 400, color: '#fff' }}>
                {m(saasAnnualLocal)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="t-label" style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
                {t('yunoCost.perTxYearLabel')}
              </div>
              <div className="num-tabular" style={{ fontSize: 20, fontWeight: 400, color: '#fff' }}>
                {m(perTxAnnual)}
              </div>
            </div>
          </div>
        </div>

        {/* Crédito 100% — banner promocional. La idea es que se lea
            inmediatamente después del costo: "te cuesta X, PERO durante
            este periodo pagas $0". Configurable via inputs.yuno_credit_*. */}
        {promoBannerEnabled && (
        <div style={{
          padding: '16px 20px', borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(224,237,128,0.22) 0%, rgba(224,237,128,0.06) 100%)',
          border: '1.5px solid rgba(224,237,128,0.55)',
          display: 'flex', alignItems: 'center', gap: 18,
          boxShadow: '0 6px 20px rgba(224,237,128,0.10)',
        }}>
          <div style={{
            minWidth: 86, height: 60, borderRadius: 12,
            background: 'rgba(224,237,128,0.28)',
            border: '1px solid rgba(224,237,128,0.65)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, gap: 2,
          }}>
            <span className="num-tabular" style={{
              fontSize: 26, fontWeight: 300, color: '#E0ED80',
              letterSpacing: '-0.03em', lineHeight: 1,
            }}>100%</span>
            <span className="t-label" style={{
              fontSize: 8, color: 'rgba(224,237,128,0.85)',
              letterSpacing: '0.14em',
            }}>{t('yunoCost.creditBadge')}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div className="t-label" style={{
              color: '#E0ED80', fontSize: 10, marginBottom: 4,
            }}>{t('yunoCost.offerLabel')}</div>
            <div style={{
              fontFamily: 'Titillium Web', fontWeight: 700, fontSize: 16,
              color: '#fff', letterSpacing: '-0.01em', lineHeight: 1.25,
            }}>
              {offerTitleOverride || t('yunoCost.offerTitle')}
            </div>
            <div style={{
              marginTop: 6, fontSize: 11.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.4,
            }}>
              {offerBodyOverride || t('yunoCost.offerBody')}
            </div>
          </div>
        </div>
        )}

        {/* Valor entregado */}
        <div style={{
          padding: '16px 24px', borderRadius: 14,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.10)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <div>
            <div className="t-label" style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
              {t('yunoCost.valueDeliveredLabel')}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
              {t('yunoCost.valueDeliveredCaption')}
            </div>
          </div>
          <span className="num-tabular" style={{
            fontSize: 32, fontWeight: 300, color: '#BDC3F6', letterSpacing: '-0.02em',
          }}>{m(totalValue, { decimals: 1 })}</span>
        </div>

        {/* Beneficio neto */}
        <div style={{
          padding: '18px 24px', borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(224,237,128,0.18) 0%, rgba(62,79,224,0.18) 100%)',
          border: '1px solid rgba(224,237,128,0.45)',
          flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          <div className="t-label" style={{ color: '#E0ED80', marginBottom: 6 }}>
            {t('yunoCost.netBenefitLabel')}
          </div>
          <div className="num-tabular" data-gradient-text style={{
            fontSize: 68, fontWeight: 200,
            background: 'linear-gradient(135deg, #FFFFFF 0%, #E0ED80 100%)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.04em', lineHeight: 0.95,
          }}>{m(netBenefit, { decimals: 1 })}</div>
          <div style={{
            marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
              {t('yunoCost.netBenefitDelta')}
            </div>
            <div className="num-tabular" style={{
              padding: '6px 14px', borderRadius: 999,
              background: 'rgba(224,237,128,0.20)',
              border: '1px solid rgba(224,237,128,0.45)',
              fontSize: 17, fontWeight: 700, color: '#E0ED80',
              letterSpacing: '-0.01em',
            }}>{t('yunoCost.roiBadge').replace('{x}', roi.toFixed(1))}</div>
          </div>
          <div className="mono" style={{
            marginTop: 12, paddingTop: 12,
            borderTop: '1px solid rgba(255,255,255,0.10)',
            fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5,
          }}>
            {m(totalValue, { decimals: 1 })} − {m(yunoCostAnnual, { decimals: 1 })} = {m(netBenefit, { decimals: 1 })}
          </div>
        </div>
      </div>

      <SlideFooter section={t('yunoCost.footerSection')} pageNum={pageNum} total={total} logoColor="rgba(255,255,255,0.55)" />
    </div>
  )
}
