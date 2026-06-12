// SlidePerVerticalResult — sits right after SlideBusinessCaseRecap.
// 3-column layout: Retail · Abonos · TOTAL. Each column lists
// the 4 palancas with their $ value, an apportioned share of ops
// (proportional to tx volume so each vertical gets its complete BC),
// and a subtotal at the bottom. The TOTAL column is the lime-accented
// punchline that the audience reads last.

import HalftoneBg from '../primitives/HalftoneBg'
import OrbHalftone from '../primitives/OrbHalftone'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'
import { fmtMoney, fmtTxCompact } from '../../lib/format'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'
import { deriveLocalBC } from '../../lib/bcLocal'

// LEVERS_META preserved for legacy reference; current cards build labels via tr() inline.
// eslint-disable-next-line no-unused-vars
const LEVERS_META = [
  { key: 'incremental_revenue', label: 'Smart Routing',       sub: 'revenue capturado'       },
  { key: 'mdr_savings',         label: 'MDR consolidado',     sub: 'ahorro en tasa descuento' },
  { key: 'antifraud_savings',   label: 'Antifraude',          sub: 'ahorro por intento'      },
  { key: 'ops_share',           label: 'Operaciones',         sub: 'dev + conciliación · share' },
]

function Pill({ children, color }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '5px 12px', borderRadius: 999,
      background: `${color}18`,
      border: `1px solid ${color}55`,
      color, fontSize: 10, fontWeight: 700,
      letterSpacing: '0.18em', textTransform: 'uppercase',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%', background: color,
      }} />
      {children}
    </span>
  )
}

function VerticalColumn({ heading, color, accent, rows, subtotal, currency, lang = 'es', highlight = false }) {
  const t = (path) => tr(STRINGS, lang, path)
  return (
    <div style={{
      padding: '24px 24px 28px',
      background: highlight
        ? 'linear-gradient(160deg, rgba(224,237,128,0.10) 0%, rgba(62,79,224,0.08) 100%)'
        : 'rgba(255,255,255,0.03)',
      border: `1px solid ${highlight ? 'rgba(224,237,128,0.30)' : 'rgba(255,255,255,0.10)'}`,
      borderRadius: 16,
      display: 'flex', flexDirection: 'column', gap: 16,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Accent rail on the left edge */}
      <span aria-hidden style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, width: 3,
        background: `linear-gradient(180deg, ${accent}cc 0%, ${accent}00 100%)`,
      }} />

      <div>
        <Pill color={accent}>{heading.kicker}</Pill>
        <div style={{
          marginTop: 12,
          fontFamily: 'Titillium Web', fontWeight: 700, fontSize: 22,
          color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1,
        }}>
          {heading.title}
        </div>
        {heading.sub && (
          <div className="num-tabular" style={{
            marginTop: 4, fontSize: 11,
            color: 'rgba(255,255,255,0.55)',
            fontFamily: 'Geist Mono, ui-monospace, monospace',
          }}>{heading.sub}</div>
        )}
      </div>

      {/* Lever rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((r) => (
          <div key={r.key} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                {r.label}
              </span>
              <span style={{
                fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2,
                letterSpacing: '0.02em',
              }}>{r.sub}</span>
            </div>
            <span className="num-tabular" style={{
              fontSize: 18, fontWeight: 500, color: highlight ? '#E0ED80' : '#fff',
              letterSpacing: '-0.01em', textAlign: 'right',
            }}>
              {r.value != null ? `+${fmtMoney(r.value, currency, lang)}` : '—'}
            </span>
          </div>
        ))}
      </div>

      {/* Subtotal */}
      <div style={{
        marginTop: 'auto',
        padding: '14px 16px', borderRadius: 12,
        background: highlight
          ? 'linear-gradient(160deg, rgba(224,237,128,0.18) 0%, rgba(62,79,224,0.18) 100%)'
          : 'rgba(62,79,224,0.08)',
        border: `1px solid ${highlight ? 'rgba(224,237,128,0.45)' : 'rgba(62,79,224,0.30)'}`,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <span className="t-label" style={{
          color: highlight ? '#E0ED80' : '#BDC3F6',
          fontSize: 9, letterSpacing: '0.18em',
        }}>{highlight ? t('perVerticalResult.totalAnnualLabel') : t('perVerticalResult.subtotalLabel')}</span>
        <span className="num-tabular" data-gradient-text={highlight ? '' : undefined} style={{
          fontFamily: 'Titillium Web', fontWeight: 200,
          fontSize: highlight ? 52 : 40, color: '#fff',
          letterSpacing: '-0.03em', lineHeight: 1,
          ...(highlight ? {
            background: 'linear-gradient(135deg, #FFFFFF 0%, #E0ED80 100%)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          } : {}),
        }}>
          {fmtMoney(subtotal, currency, lang, { decimals: 1 })}
        </span>
      </div>
    </div>
  )
}

export default function SlidePerVerticalResult({ data, pageNum, total, lang = 'es', currency: currencyProp }) {
  const t = (path) => tr(STRINGS, lang, path)
  const inputs = data?.INPUTS || {}
  const bc = data?.BUSINESS_CASE || {}
  const local = deriveLocalBC(data)
  const currency = currencyProp || local.currency || 'USD'

  const inputVerticals = Array.isArray(inputs.verticals) ? inputs.verticals : []
  const bcVerticals = Array.isArray(bc.verticals) ? bc.verticals : []

  // AF + gateway row drops out when the client has neither (BCI Seguros) —
  // a "+$0" row is noise. Sub label switches to "%" wording in pct-mode.
  const hasAfLever = (Number(inputs.current_antifraud_per_attempt) || 0) > 0
    || (Number(inputs.target_antifraud_per_attempt) || 0) > 0
    || (Number(inputs.current_gateway_per_attempt) || 0) > 0
    || (Number(inputs.target_gateway_per_attempt) || 0) > 0
  const debitPctMode = (Number(inputs.current_debit_mdr_pct) || 0) > 0
  const mdrSubKey = debitPctMode ? 'perVerticalResult.leverMDRSubPct' : 'perVerticalResult.leverMDRSub'

  // Ops total in LOCAL currency (so the per-vertical apportion is correct).
  const opsYear1 = local.operationalYear1Local

  // Per-vertical math (merge inputs.verticals + bc.verticals by id).
  const totalTx = inputVerticals.reduce((s, v) => s + (Number(v.monthly_tx) || 0), 0)

  const merged = inputVerticals.map((iv) => {
    const bcRow = bcVerticals.find((b) => b.id === iv.id) || {}
    const txShare = totalTx > 0 ? (Number(iv.monthly_tx) || 0) / totalTx : 0
    const opsShare = opsYear1 * txShare
    const incRev = Number(bcRow.incremental_revenue) || 0
    const mdrSav = Number(bcRow.mdr_savings) || 0
    const afSav  = Number(bcRow.antifraud_savings) || 0
    const gwSav  = Number(bcRow.gateway_savings) || 0
    const afCombined = afSav + gwSav
    const subtotal = incRev + mdrSav + afCombined + opsShare
    return {
      ...iv,
      ...bcRow,
      tx_share: txShare,
      ops_share: opsShare,
      af_combined: afCombined,
      subtotal,
    }
  })

  const totalIncRev = merged.reduce((s, v) => s + (Number(v.incremental_revenue) || 0), 0)
  const totalMdrSav = merged.reduce((s, v) => s + (Number(v.mdr_savings) || 0), 0)
  const totalAfSav  = merged.reduce((s, v) => s + (Number(v.af_combined) || 0), 0)
  const totalSubtotal = merged.reduce((s, v) => s + v.subtotal, 0)

  return (
    <div className="slide theme-dark">
      <HalftoneBg color="#3E4FE0" opacity={0.12} density={36} fadeDir="top" />
      <OrbHalftone size={700} x="92%" y="18%" color="#E0ED80" style={{ opacity: 0.18 }} />

      <SectionLabel color="rgba(255,255,255,0.7)">{t('perVerticalResult.sectionLabel')}</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1300, color: '#fff',
      }}>
        {t('perVerticalResult.titleLead')}
        <br/>
        <span style={{ color: '#E0ED80' }}>{t('perVerticalResult.titleAccent')}</span>
      </h2>

      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 290, left: 80, right: 80,
        fontSize: 16, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5, maxWidth: 1100,
      }}>
        {t('perVerticalResult.body')}
      </div>

      {/* 3-column grid: Retail | Banca | TOTAL */}
      <div style={{
        position: 'absolute', top: 380, left: 80, right: 80, bottom: 110,
        display: 'grid',
        gridTemplateColumns: `repeat(${merged.length}, 1fr) 1.05fr`,
        gap: 18,
      }}>
        {merged.map((v, i) => {
          const accent = i === 0 ? '#7C89EF' : '#38ADFF'
          return (
            <div key={v.id} className={`anim-in anim-in-${i + 3}`}>
              <VerticalColumn
                heading={{
                  kicker: t('perVerticalResult.verticalKickerTemplate').replace('{n}', i + 1),
                  title: v.name,
                  sub: t('perVerticalResult.verticalSubTemplate')
                    .replace('{tx}', fmtTxCompact(v.monthly_tx))
                    .replace('{pct}', Math.round(v.tx_share * 100)),
                }}
                color={accent}
                accent={accent}
                currency={currency}
                lang={lang}
                rows={[
                  { key: 'routing', label: t('perVerticalResult.leverRoutingLabel'), sub: t('perVerticalResult.leverRoutingSub'), value: v.incremental_revenue },
                  { key: 'mdr',     label: t('perVerticalResult.leverMDRLabel'),     sub: t(mdrSubKey),                           value: v.mdr_savings },
                  hasAfLever && { key: 'af', label: t('perVerticalResult.leverAFLabel'), sub: t('perVerticalResult.leverAFSub'),  value: v.af_combined },
                  { key: 'ops',     label: t('perVerticalResult.leverOpsLabel'),     sub: t('perVerticalResult.leverOpsSubTemplate').replace('{pct}', Math.round(v.tx_share * 100)), value: v.ops_share },
                ].filter(Boolean)}
                subtotal={v.subtotal}
              />
            </div>
          )
        })}

        {/* TOTAL column */}
        <div className="anim-in anim-in-5">
          <VerticalColumn
            heading={{
              kicker: merged.map((v) => (v.name || '').toLowerCase().split(' ')[0]).join(' + ') || t('perVerticalResult.totalKickerFallback'),
              title: t('perVerticalResult.totalTitle'),
              sub: t('perVerticalResult.totalSubTemplate').replace('{tx}', fmtTxCompact(totalTx)),
            }}
            color="#E0ED80"
            accent="#E0ED80"
            currency={currency}
            lang={lang}
            rows={[
              { key: 'routing', label: t('perVerticalResult.leverRoutingLabel'), sub: t('perVerticalResult.leverRoutingSub'), value: totalIncRev },
              { key: 'mdr',     label: t('perVerticalResult.leverMDRLabel'),     sub: t(mdrSubKey),                           value: totalMdrSav },
              hasAfLever && { key: 'af', label: t('perVerticalResult.leverAFLabel'), sub: t('perVerticalResult.leverAFSub'),  value: totalAfSav  },
              { key: 'ops',     label: t('perVerticalResult.leverOpsLabel'),     sub: t('perVerticalResult.leverOpsSubTotal'), value: opsYear1   },
            ].filter(Boolean)}
            subtotal={totalSubtotal}
            highlight
          />
        </div>
      </div>

      <SlideFooter section={t('perVerticalResult.footerSection')} pageNum={pageNum} total={total} logoColor="rgba(255,255,255,0.55)" />
    </div>
  )
}
