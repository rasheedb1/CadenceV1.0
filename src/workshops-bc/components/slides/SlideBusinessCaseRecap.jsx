// SlideBusinessCaseRecap — mid-deck summary that closes the 4-palanca section.
// Sits right after Palanca 04 · operaciones and before Sección · AI so the
// audience sees the full business-case math in one frame before pivoting
// to the AI block. Each palanca card shows: value won + delta (from→to) +
// the exact formula with the numbers plugged in.

import HalftoneBg from '../primitives/HalftoneBg'
import OrbHalftone from '../primitives/OrbHalftone'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'
import { fmtMoney, fmtPct, fmtNum, fmtTxCompact } from '../../lib/format'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'
import { deriveLocalBC } from '../../lib/bcLocal'

const PALANCAS_META = [
  { n: '01', key: 'routing',   color: '#7C89EF', labelKey: 'businessCaseRecap.leverNameRouting' },
  { n: '02', key: 'mdr',       color: '#38ADFF', labelKey: 'businessCaseRecap.leverNameMDR' },
  { n: '03', key: 'antifraud', color: '#FB923C', labelKey: 'businessCaseRecap.leverNameAntifraud' },
  { n: '04', key: 'ops',       color: '#E0ED80', labelKey: 'businessCaseRecap.leverNameOps' },
]

function ArrowDelta({ from, to, accent }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '5px 12px', borderRadius: 999,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.10)',
      fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
      letterSpacing: '0.02em',
    }}>
      <span style={{ color: 'rgba(255,255,255,0.55)' }}>{from}</span>
      <span style={{ color: accent, fontSize: 13 }}>→</span>
      <span style={{ color: accent, fontWeight: 700 }}>{to}</span>
    </div>
  )
}

function PalancaCard({ meta, value, deltaFrom, deltaTo, deltaLabel, formula, breakdown, anim, lang = 'es', style }) {
  const t = (path) => tr(STRINGS, lang, path)
  return (
    <div className={anim} style={{
      position: 'relative',
      padding: '22px 24px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: 14,
      display: 'flex', flexDirection: 'column', gap: 14,
      overflow: 'hidden',
      ...style,
    }}>
      {/* Accent rail on the left edge */}
      <span aria-hidden style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, width: 3,
        background: `linear-gradient(180deg, ${meta.color}cc 0%, ${meta.color}00 100%)`,
      }} />

      {/* Header — number + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 22, borderRadius: 6,
          background: `${meta.color}22`,
          border: `1px solid ${meta.color}55`,
          fontFamily: 'Geist Mono, ui-monospace, monospace',
          fontSize: 11, fontWeight: 700, color: meta.color,
        }}>{meta.n}</span>
        <span className="t-label" style={{
          color: 'rgba(255,255,255,0.85)', fontSize: 11,
        }}>{t(meta.labelKey)}</span>
      </div>

      {/* Value row — big $ + delta pill */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 16,
      }}>
        <div className="num-tabular" style={{
          fontSize: 56, fontWeight: 200, color: '#fff',
          letterSpacing: '-0.035em', lineHeight: 0.95,
        }}>{value}</div>
        <ArrowDelta from={deltaFrom} to={deltaTo} accent={meta.color} />
      </div>

      <div style={{
        fontSize: 12, color: 'rgba(255,255,255,0.55)',
        marginTop: -8,
      }}>{deltaLabel}</div>

      {/* Per-vertical contribution chips (optional) */}
      {breakdown && breakdown.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
        }}>
          {breakdown.map((b) => (
            <span key={b.label} style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 6,
              padding: '4px 9px', borderRadius: 999,
              background: `${meta.color}10`,
              border: `1px solid ${meta.color}33`,
              fontSize: 10, color: 'rgba(255,255,255,0.78)',
              letterSpacing: '0.02em',
            }}>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>{b.label}</span>
              <span className="num-tabular" style={{
                color: '#fff', fontWeight: 700, fontSize: 11,
              }}>{b.value}</span>
            </span>
          ))}
        </div>
      )}

      {/* Formula in mono — how we got to the number */}
      <div style={{
        marginTop: 'auto', paddingTop: 12,
        borderTop: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div className="t-label" style={{
          fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 6,
          letterSpacing: '0.16em',
        }}>{t('businessCaseRecap.calculationLabel')}</div>
        <div className="mono" style={{
          fontSize: 12, color: '#BDC3F6', lineHeight: 1.5,
          letterSpacing: '-0.005em',
        }}>{formula}</div>
      </div>
    </div>
  )
}

export default function SlideBusinessCaseRecap({ data, pageNum, total, lang = 'es', currency: currencyProp }) {
  const t = (path) => tr(STRINGS, lang, path)
  const inputs = data?.INPUTS || {}
  const bc = data?.BUSINESS_CASE || {}
  const local = deriveLocalBC(data)
  const currency = currencyProp || local.currency || 'USD'
  const m = (v, opts) => fmtMoney(v, currency, lang, opts)
  const cs = currency === 'EUR' ? '€' : '$'

  // INPUTS — avg_ticket: prefer per-vertical weighted average when set
  // (Coppel inputs avg_ticket per vertical in MXN; top-level avg_ticket_usd
  // is an orphan 110 USD that would render as "$110 MXN" if used).
  const monthlyTx     = Number(inputs.monthly_transactions) || 0
  const inputVerticals = Array.isArray(inputs.verticals) ? inputs.verticals : []
  const avgTicket = (() => {
    if (inputVerticals.length > 0) {
      const tot = inputVerticals.reduce((s, v) => s + (Number(v.monthly_tx) || 0), 0)
      if (tot > 0) {
        return inputVerticals.reduce((s, v) => s + (Number(v.avg_ticket) || 0) * (Number(v.monthly_tx) || 0), 0) / tot
      }
    }
    const fallbackUsd = Number(inputs.avg_ticket_usd) || 0
    return local.isUSD ? fallbackUsd : fallbackUsd * local.usdToLocal
  })()
  const approvalNow   = Number(inputs.current_approval_rate_pct) || 0
  const approvalNew   = Number(inputs.target_approval_rate_pct) || approvalNow
  const creditMdrNow  = Number(inputs.current_credit_mdr_pct) || Number(inputs.current_mdr_pct) || 0
  const creditMdrNew  = Number(inputs.target_credit_mdr_pct) || Number(inputs.target_mdr_pct) || creditMdrNow
  const debitMdrNow   = Number(inputs.current_debit_mdr_per_tx) || 0
  const debitMdrNew   = Number(inputs.target_debit_mdr_per_tx) || 0
  // Débito como % sobre TPV (BCI Seguros CL) — toma precedencia sobre $/tx
  const debitMdrPctNow = Number(inputs.current_debit_mdr_pct) || 0
  const debitMdrPctNew = Number(inputs.target_debit_mdr_pct) || 0
  const debitPctMode  = debitMdrPctNow > 0
  const hasDebit      = debitPctMode || debitMdrNow > 0
  const afNow         = Number(inputs.current_antifraud_per_attempt) || 0
  const afNew         = Number(inputs.target_antifraud_per_attempt) || afNow
  const gwNow         = Number(inputs.current_gateway_per_attempt) || 0
  const gwNew         = Number(inputs.target_gateway_per_attempt) || 0
  const hasGateway    = gwNow > 0

  // BUSINESS CASE — use local helper for ops + totals (bypass broken USD
  // sums in stored bc.direct_savings_annual_usd / total_annual_value_usd).
  const takeRate          = (Number(bc.take_rate_pct) || 15) / 100
  const incTPV            = Number(bc.incremental_tpv_annual_usd) || 0
  const incTx             = Number(bc.incremental_approved_tx_annual) || 0
  const annualAttempts    = Number(bc.annual_attempts) || (monthlyTx * 12)
  const tpvAnnual         = Number(bc.tpv_annual_usd) || 0
  const { integrations, devMonthsPerInt, reconMonthlyLocal: reconMonthly,
          perIntegrationLocal: perIntegration, devOneTimeLocal: devOneTime,
          reconAnnualLocal: reconAnnual, operationalYear1Local: operationalYear1,
          mdrSavings, mdrCreditSavings, mdrDebitSavings,
          antifraudSavings, gatewaySavings, incrementalRevenue: incRevenue,
          directSavings, totalAnnualValue: totalValue } = local
  const afCombinedSavings = antifraudSavings + gatewaySavings

  // ── Per-vertical contribution (rendered as chips on each palanca card) ──
  const bcVerticals = Array.isArray(bc.verticals) ? bc.verticals : []
  const breakdownFor = (field) => bcVerticals.length > 0
    ? bcVerticals.map((v) => ({ label: v.name.split(' ')[0].toLowerCase(), value: m(Number(v[field]) || 0) }))
    : null

  // ── Palanca data ──────────────────────────────────────────────
  const palancas = [
    {
      meta: PALANCAS_META[0],
      value: `+${m(incRevenue, { decimals: 1 })}`,
      deltaFrom: fmtPct(approvalNow, 1, lang),
      deltaTo: fmtPct(approvalNew, 1, lang),
      deltaLabel: t('businessCaseRecap.extraTxTemplate').replace('{n}', fmtNum(incTx, lang)),
      breakdown: breakdownFor('incremental_revenue'),
      formula: (
        <>
          {t('businessCaseRecap.routingFormula')}<br/>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>= </span>
          {fmtNum(Math.round(annualAttempts / 1e6), lang)}M × ({fmtPct(approvalNew, 1, lang)} − {fmtPct(approvalNow, 1, lang)})
          {' '}× {cs}{Math.round(avgTicket).toLocaleString('es-MX')} × {Math.round(takeRate * 100)}%
        </>
      ),
    },
    {
      meta: PALANCAS_META[1],
      value: `+${m(mdrSavings, { decimals: 1 })}`,
      deltaFrom: hasDebit
        ? `${fmtPct(creditMdrNow, 2, lang)} · ${debitPctMode ? fmtPct(debitMdrPctNow, 2, lang) : cs + debitMdrNow.toFixed(2)}`
        : fmtPct(creditMdrNow, 2, lang),
      deltaTo: hasDebit
        ? `${fmtPct(creditMdrNew, 2, lang)} · ${debitPctMode ? fmtPct(debitMdrPctNew, 2, lang) : cs + debitMdrNew.toFixed(2)}`
        : fmtPct(creditMdrNew, 2, lang),
      deltaLabel: hasDebit
        ? (debitPctMode ? t('businessCaseRecap.mdrDeltaLabelDebitPct') : t('businessCaseRecap.mdrDeltaLabelDebit'))
        : t('businessCaseRecap.mdrDeltaLabelBlended'),
      breakdown: breakdownFor('mdr_savings'),
      formula: hasDebit ? (
        <>
          {debitPctMode
            ? t('businessCaseRecap.mdrFormulaDebitPct')
            : t('businessCaseRecap.mdrFormulaDebit').replace('{cs}', cs)}<br/>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>= </span>
          {t('businessCaseRecap.mdrBreakdownDebit')
            .replace('{credit}', m(mdrCreditSavings, { decimals: 1 }))
            .replace('{debit}', m(mdrDebitSavings, { decimals: 1 }))}
        </>
      ) : (
        <>
          {t('businessCaseRecap.mdrFormulaBlended')}<br/>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>= </span>
          {m(tpvAnnual, { decimals: 1 })} × ({fmtPct(creditMdrNow, 2, lang)} − {fmtPct(creditMdrNew, 2, lang)})
        </>
      ),
    },
    // AF + gateway card drops out entirely when the client has neither
    // (BCI Seguros pays acquirers directly) — a "+$0" card is noise.
    (afNow > 0 || afNew > 0 || gwNow > 0 || gwNew > 0) && {
      meta: PALANCAS_META[2],
      value: `+${m(afCombinedSavings, { decimals: 1 })}`,
      deltaFrom: hasGateway ? `${cs}${(afNow + gwNow).toFixed(2)}` : `${cs}${afNow.toFixed(2)}`,
      deltaTo:   hasGateway ? `${cs}${(afNew + gwNew).toFixed(2)}` : `${cs}${afNew.toFixed(2)}`,
      deltaLabel: hasGateway
        ? t('businessCaseRecap.antifraudDeltaLabelDebit')
        : t('businessCaseRecap.antifraudDeltaLabel'),
      breakdown: breakdownFor('antifraud_savings'),
      formula: hasGateway ? (
        <>
          {t('businessCaseRecap.antifraudFormulaGateway')}<br/>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>= </span>
          {t('businessCaseRecap.antifraudBreakdownGateway')
            .replace('{af}', m(antifraudSavings, { decimals: 1 }))
            .replace('{gw}', m(gatewaySavings, { decimals: 1 }))}
        </>
      ) : (
        <>
          {t('businessCaseRecap.antifraudFormula')}<br/>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>= </span>
          {fmtNum(Math.round(annualAttempts / 1e6), lang)}M × ({cs}{afNow.toFixed(2)} − {cs}{afNew.toFixed(2)})
        </>
      ),
    },
    {
      meta: PALANCAS_META[3],
      value: `+${m(operationalYear1, { decimals: 1 })}`,
      deltaFrom: t('businessCaseRecap.opsDeltaFrom').replace('{n}', integrations),
      deltaTo:   t('businessCaseRecap.opsDeltaTo'),
      // When recon savings are explicitly 0 (BCI Seguros) the label and
      // formula only claim the dev component — no phantom "$10K × 12".
      deltaLabel: reconAnnual > 0
        ? t('businessCaseRecap.opsDeltaLabel')
        : t('businessCaseRecap.opsDeltaLabelDevOnly'),
      breakdown: null, // ops is single-bucket, not per-vertical
      formula: (
        <>
          {reconAnnual > 0 ? t('businessCaseRecap.opsFormula') : t('businessCaseRecap.opsFormulaDevOnly')}<br/>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>= </span>
          {m(devOneTime, { decimals: 1 })}{' '}
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>
            {t('businessCaseRecap.opsIntegrationsHint')
              .replace('{n}', integrations)
              .replace('{amount}', m(perIntegration, { decimals: 0 }))}
          </span>
          {reconAnnual > 0 && (
            <>
              {' + '}
              {m(reconAnnual, { decimals: 1 })}{' '}
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                {t('businessCaseRecap.opsReconHint').replace('{amount}', m(reconMonthly, { decimals: 0 }))}
              </span>
            </>
          )}
        </>
      ),
    },
  ].filter(Boolean).map((p, i) => ({
    ...p,
    // Renumber sequentially after the filter so a dropped AF card doesn't
    // leave a gap (01 · 02 · 04) — mirrors SlideLeversOverview.
    meta: { ...p.meta, n: String(i + 1).padStart(2, '0') },
  }))

  return (
    <div className="slide theme-dark">
      <HalftoneBg color="#3E4FE0" opacity={0.14} density={36} fadeDir="top" />
      <OrbHalftone size={760} x="92%" y="20%" color="#3E4FE0" style={{ opacity: 0.35 }} />

      <SectionLabel color="rgba(255,255,255,0.7)">{t('businessCaseRecap.sectionLabel')}</SectionLabel>

      {/* Title row */}
      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1100, color: '#fff',
      }}>
        {t('businessCaseRecap.titleLead')}
        <br/>
        {t('businessCaseRecap.titleOne')} <span style={{ color: '#E0ED80' }}>{t('businessCaseRecap.titleAccent')}</span>
      </h2>

      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 130, right: 80, width: 480,
        textAlign: 'right',
      }}>
        <div className="t-label" style={{ color: 'rgba(255,255,255,0.55)', marginBottom: 10 }}>
          {t('businessCaseRecap.totalImpactLabel')}
        </div>
        <div className="num-tabular" data-gradient-text style={{
          fontSize: 96, fontWeight: 200,
          background: 'linear-gradient(135deg, #FFFFFF 0%, #E0ED80 100%)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '-0.04em', lineHeight: 0.95,
        }}>
          {m(totalValue, { decimals: 1 })}
        </div>
        <div style={{
          marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.45)',
          display: 'flex', justifyContent: 'flex-end', gap: 6,
          fontFamily: 'Geist Mono, ui-monospace, monospace',
          letterSpacing: '0.14em', textTransform: 'uppercase',
        }}>{t('businessCaseRecap.currencyLabel').replace('{curr}', currency)}</div>
        <div style={{
          marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.55)',
          display: 'flex', justifyContent: 'flex-end', gap: 16,
        }}>
          <span>{t('businessCaseRecap.revenueLabel')} <strong style={{ color: '#fff' }}>{m(incRevenue, { decimals: 1 })}</strong></span>
          <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
          <span>{t('businessCaseRecap.savingsLabel')} <strong style={{ color: '#E0ED80' }}>{m(directSavings, { decimals: 1 })}</strong></span>
        </div>
      </div>

      {/* 4 palanca cards — 2×2 grid full width */}
      <div style={{
        position: 'absolute', top: 380, left: 80, right: 80, bottom: 170,
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gridTemplateRows: 'repeat(2, 1fr)',
        gap: 18,
      }}>
        {palancas.map((p, i) => (
          <PalancaCard
            key={p.meta.key}
            meta={p.meta}
            value={p.value}
            deltaFrom={p.deltaFrom}
            deltaTo={p.deltaTo}
            deltaLabel={p.deltaLabel}
            formula={p.formula}
            breakdown={p.breakdown}
            anim={`anim-in anim-in-${i + 3}`}
            lang={lang}
            // Odd count (3 cards · no AF lever): last card spans the full
            // bottom row so the 2×2 grid doesn't show an empty cell.
            style={palancas.length % 2 === 1 && i === palancas.length - 1 ? { gridColumn: '1 / -1' } : undefined}
          />
        ))}
      </div>

      {/* Base assumptions strip */}
      <div className="anim-in anim-in-7" style={{
        position: 'absolute', bottom: 80, left: 80, right: 80,
        padding: '14px 22px', borderRadius: 12,
        background: 'rgba(62,79,224,0.08)',
        border: '1px solid rgba(62,79,224,0.25)',
        display: 'flex', alignItems: 'center', gap: 24,
        flexWrap: 'wrap',
      }}>
        <div className="t-label" style={{ color: '#BDC3F6', letterSpacing: '0.14em' }}>
          {t('businessCaseRecap.baseLabel')}
        </div>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)' }}>
          <strong className="num-tabular" style={{ color: '#fff' }}>
            {fmtTxCompact(monthlyTx)}
          </strong> {t('businessCaseRecap.baseTxPerMonth')}
        </span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)' }}>
          {t('businessCaseRecap.baseTicket')}{' '}
          <strong className="num-tabular" style={{ color: '#fff' }}>
            {cs}{Math.round(avgTicket).toLocaleString('es-MX')}
          </strong>
        </span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)' }}>
          {t('businessCaseRecap.baseAnnualTPV')}{' '}
          <strong className="num-tabular" style={{ color: '#fff' }}>
            {m(tpvAnnual, { decimals: 1 })}
          </strong>
        </span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)' }}>
          {t('businessCaseRecap.baseTakeRate')}{' '}
          <strong className="num-tabular" style={{ color: '#fff' }}>
            {Math.round(takeRate * 100)}%
          </strong>
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 12, color: 'rgba(255,255,255,0.55)',
          fontStyle: 'italic',
        }}>
          {t('businessCaseRecap.baseConservative')}
        </span>
      </div>

      <SlideFooter section={t('businessCaseRecap.footerSection')} pageNum={pageNum} total={total} logoColor="rgba(255,255,255,0.55)" />
    </div>
  )
}
