import { SectionLabel, SlideFooter } from '../primitives/Chrome'
import { fmtMoney, fmtNum, fmtPct, fmtTxCompact } from '../../lib/format'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

export default function SlideVolumes({ data, pageNum, total, lang = 'es', currency: currencyProp }) {
  const t = (path) => tr(STRINGS, lang, path)
  const inputs = data?.INPUTS || {}
  const bc = data?.BUSINESS_CASE || {}
  const currency = currencyProp || inputs.currency || bc.currency || 'USD'
  const m = (v, opts) => fmtMoney(v, currency, lang, opts)

  const monthlyTx = Number(inputs.monthly_transactions) || 0
  const avgTicket = Number(inputs.avg_ticket_usd) || 0
  const approvalNow = Number(inputs.current_approval_rate_pct) || 82
  const creditMdrNow = Number(inputs.current_credit_mdr_pct) || Number(inputs.current_mdr_pct) || 2.37
  const debitMdrNow = Number(inputs.current_debit_mdr_per_tx) || 0
  // Débito como % sobre TPV (BCI Seguros CL) — cambia solo el caption; el
  // costo ya viene correcto de bc.verticals (engine pct-aware)
  const debitMdrPctNow = Number(inputs.current_debit_mdr_pct) || 0
  const debitPctMode = debitMdrPctNow > 0
  // Explicit 0 = "client pays no antifraud" (BCI) — a bare `|| 0.80` fell
  // back to the Coppel benchmark and fabricated ~$1.5M/yr of AF cost in
  // the strip + total-cost banner. Only default when the input is absent.
  const afNow = inputs.current_antifraud_per_attempt != null
    ? (Number(inputs.current_antifraud_per_attempt) || 0)
    : 0.80
  const gwNow = Number(inputs.current_gateway_per_attempt) || 0

  const annualTPV = Number(bc.tpv_annual_usd) || (monthlyTx * avgTicket * 12)
  const annualAttempts = Number(bc.annual_attempts) || (monthlyTx * 12) / (approvalNow / 100)
  const annualApproved = Number(bc.annual_approved_tx) || (monthlyTx * 12)
  const annualMDRCredit = Number(bc.verticals?.reduce?.((s, v) => s + (Number(v.cost_mdr_credit_current) || 0), 0)) || (annualTPV * (creditMdrNow / 100))
  const annualMDRDebit = Number(bc.verticals?.reduce?.((s, v) => s + (Number(v.cost_mdr_debit_current) || 0), 0)) || 0
  const annualMDRCost = annualMDRCredit + annualMDRDebit
  const annualAFCost = annualAttempts * afNow
  const annualGWCost = annualApproved * gwNow  // gateway is per-approved-tx

  const verticals = Array.isArray(inputs.verticals) ? inputs.verticals : []
  const bcVerticals = Array.isArray(bc.verticals) ? bc.verticals : []

  // Merge inputs verticals with BC verticals to get a complete row per vertical.
  const merged = verticals.map((v) => {
    const bcRow = bcVerticals.find((b) => b.id === v.id) || {}
    return {
      ...v,
      annual_tpv: Number(bcRow.annual_tpv) || (v.monthly_tx * v.avg_ticket * 12),
      credit_mix_pct: Number(bcRow.credit_mix_pct ?? v.credit_mix_pct) || 0,
    }
  })

  // Single-vertical mode (BCI Seguros): the per-vertical card would repeat
  // the aggregate strip 1:1 (same tx/mo + same annual TPV), so we skip the
  // card row and surface its only unique datum (avg ticket) as an extra
  // strip column instead. The AF + gateway column also drops when the
  // client pays neither — a "$0 · $0.00/intento" column is noise.
  const single = merged.length === 1
  const hasAfCost = afNow > 0 || gwNow > 0
  const aggCols = [
    {
      v: fmtTxCompact(monthlyTx),
      l: t('volumes.aggApprovedLabel'),
      s: merged.length > 0 ? `${merged.map(x => x.name.toLowerCase().split(' ')[0]).join(' + ')}` : t('volumes.aggApprovedCaptionFallback'),
    },
    single && {
      v: `$${Number(merged[0].avg_ticket).toLocaleString('es-MX')}`,
      l: t('volumes.cardTicketLabel'),
      s: t('volumes.aggTicketCaption'),
    },
    {
      v: m(annualTPV),
      l: t('volumes.aggTPVAnnualLabel'),
      s: t('volumes.aggTPVAnnualCaption').replace('{curr}', currency),
    },
    {
      v: m(annualMDRCost),
      l: t('volumes.aggMDRLabel'),
      s: debitPctMode
        ? t('volumes.aggMDRCaptionPct')
            .replace('{mdr}', fmtPct(creditMdrNow, 2, lang))
            .replace('{debit}', fmtPct(debitMdrPctNow, 2, lang))
        : t('volumes.aggMDRCaption')
            .replace('{mdr}', fmtPct(creditMdrNow, 2, lang))
            .replace('{curr}', currency)
            .replace('{debit}', debitMdrNow.toFixed(2)),
    },
    hasAfCost && {
      v: m(annualAFCost + annualGWCost),
      l: t('volumes.aggAFGatewayLabel'),
      s: t('volumes.aggAFGatewayCaption')
        .replaceAll('{curr}', currency)
        .replace('{af}', afNow.toFixed(2))
        .replace('{gw}', gwNow.toFixed(2)),
    },
  ].filter(Boolean)

  return (
    <div className="slide theme-light">
      <SectionLabel>{t('volumes.sectionLabel')}</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1500,
        color: 'var(--unity-black)',
      }}>
        {t('volumes.titleLead')}
        <br/>
        <span style={{ color: 'var(--yuno-blue)' }}>{t('volumes.titleAccent')}</span>
      </h2>

      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 350, left: 80, fontSize: 18,
        color: 'var(--gray-alt)', maxWidth: 1000, lineHeight: 1.5,
      }}>
        {t('volumes.bodyLead')} <strong style={{ color: 'var(--unity-black)' }}>{t('volumes.bodyCurrencyTemplate').replace('{curr}', currency)}</strong>
      </div>

      {/* Per-vertical cards — only when there are 2+ verticals to compare
          (single-vertical decks fold the ticket into the aggregate strip) */}
      {merged.length > 1 && (
        <div style={{
          position: 'absolute', top: 440, left: 80, right: 80,
          display: 'grid', gridTemplateColumns: `repeat(${merged.length}, 1fr)`, gap: 24,
        }}>
          {merged.map((v, i) => (
            <div key={v.id} className={`anim-in anim-in-${i + 3}`} style={{
              padding: 26, borderRadius: 16,
              background: 'var(--harmony-lilac)',
              border: '1px solid rgba(40,42,48,0.06)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
                <span style={{
                  fontFamily: 'Titillium Web', fontWeight: 700, fontSize: 22,
                  color: 'var(--unity-black)', letterSpacing: '-0.02em',
                }}>{v.name}</span>
                <span className="t-label" style={{ fontSize: 10, color: 'var(--gray-alt)' }}>
                  {t('volumes.cardVerticalLabel').replace('{n}', String(i + 1).padStart(2, '0'))}
                </span>
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                borderTop: '1px solid rgba(40,42,48,0.10)',
                paddingTop: 16,
              }}>
                <div>
                  <div className="t-number num-tabular" style={{
                    fontSize: 48, fontWeight: 200, color: 'var(--yuno-blue)',
                    lineHeight: 0.95, letterSpacing: '-0.03em',
                  }}>
                    {v.monthly_tx >= 1e6
                      ? (v.monthly_tx / 1e6).toFixed(2) + 'M'
                      : (v.monthly_tx / 1e3).toFixed(0) + 'K'}
                  </div>
                  <div className="t-label" style={{ marginTop: 8, fontSize: 10, color: 'var(--unity-black)' }}>
                    {t('volumes.cardMonthlyTxLabel')}
                  </div>
                </div>
                <div>
                  <div className="t-number num-tabular" style={{
                    fontSize: 48, fontWeight: 200, color: 'var(--yuno-blue)',
                    lineHeight: 0.95, letterSpacing: '-0.03em',
                  }}>
                    ${Number(v.avg_ticket).toLocaleString('es-MX')}
                  </div>
                  <div className="t-label" style={{ marginTop: 8, fontSize: 10, color: 'var(--unity-black)' }}>
                    {t('volumes.cardTicketLabel')}
                  </div>
                </div>
                <div>
                  <div className="t-number num-tabular" style={{
                    fontSize: 48, fontWeight: 200, color: 'var(--yuno-blue-deep)',
                    lineHeight: 0.95, letterSpacing: '-0.03em',
                  }}>
                    {m(v.annual_tpv)}
                  </div>
                  <div className="t-label" style={{ marginTop: 8, fontSize: 10, color: 'var(--unity-black)' }}>
                    {t('volumes.cardAnnualTPVLabel')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Aggregate strip — totals across all verticals */}
      <div className="anim-in anim-in-6" style={{
        position: 'absolute',
        top: merged.length > 1 ? 700 : 500,
        left: 80, right: 80,
        display: 'grid', gridTemplateColumns: `repeat(${aggCols.length}, 1fr)`,
        borderTop: '1px solid rgba(40,42,48,0.15)',
        borderBottom: '1px solid rgba(40,42,48,0.15)',
        paddingTop: 20, paddingBottom: 20,
      }}>
        {aggCols.map((k, i) => (
          <div key={i} className={`anim-in anim-in-${i + 3}`} style={{
            borderRight: i < aggCols.length - 1 ? '1px solid rgba(40,42,48,0.10)' : 'none',
            paddingLeft: i === 0 ? 0 : 22, paddingRight: 22,
          }}>
            <div className="t-number num-tabular" style={{
              fontSize: 48, fontWeight: 200, color: 'var(--yuno-blue)',
              lineHeight: 0.95, letterSpacing: '-0.04em',
            }}>{k.v}</div>
            <div className="t-label" style={{ marginTop: 12, fontSize: 11, color: 'var(--unity-black)' }}>{k.l}</div>
            <div className="t-caption" style={{ marginTop: 6, fontSize: 11 }}>{k.s}</div>
          </div>
        ))}
      </div>

      {/* TOTAL costo de pagos — suma MDR + AF + Gateway. Banner highlighted
          en azul para que sea la nota dominante de la slide. */}
      <div className="anim-in anim-in-7" style={{
        position: 'absolute',
        bottom: 100, left: 80, right: 80,
        padding: '22px 32px', borderRadius: 14,
        background: 'linear-gradient(120deg, var(--yuno-blue) 0%, var(--yuno-blue-deep) 100%)',
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 8px 24px rgba(62,79,224,0.20)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="t-label" style={{
            color: 'rgba(255,255,255,0.75)', fontSize: 11, letterSpacing: '0.14em',
          }}>
            {t('volumes.totalCostBannerLabel')}
          </span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
            {hasAfCost ? t('volumes.totalCostBannerCaption') : t('volumes.totalCostBannerCaptionMdrOnly')}
          </span>
          {hasAfCost && (
            <span className="mono" style={{
              marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.50)',
            }}>
              {t('volumes.totalCostBreakdown')
                .replace('{mdr}', m(annualMDRCost, { decimals: 1 }))
                .replace('{af}', m(annualAFCost, { decimals: 1 }))
                .replace('{gw}', m(annualGWCost, { decimals: 1 }))}
            </span>
          )}
        </div>
        <span className="num-tabular" style={{
          fontSize: 72, fontWeight: 200, color: '#fff',
          letterSpacing: '-0.04em', lineHeight: 1,
        }}>{m(annualMDRCost + annualAFCost + annualGWCost, { decimals: 1 })}</span>
      </div>


      <SlideFooter section={t('volumes.footerSection')} pageNum={pageNum} total={total} />
    </div>
  )
}
