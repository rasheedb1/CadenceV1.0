import HalftoneBg from '../primitives/HalftoneBg'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'
import { fmtPct, fmtMoney, fmtNum } from '../../lib/format'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

// Card explícita por componente per-intento (antifraude / gateway).
// Mismo patrón que SlideLeverMDR.MethodCard para que ambas palancas
// se lean igual: header con rate (hoy → yuno), tres columnas de
// costo-hoy / costo-yuno / ahorro.
function MethodCard({ accent, title, rateFrom, rateTo, rateUnit, costNow, costNew, savings, formula, lang = 'es' }) {
  const t = (path) => tr(STRINGS, lang, path)
  return (
    <div style={{
      flex: 1,
      padding: '18px 22px',
      background: '#fff',
      border: '1px solid rgba(40,42,48,0.10)',
      borderRadius: 14,
      display: 'flex', flexDirection: 'column', gap: 12,
      boxShadow: '0 4px 18px rgba(40,42,48,0.05)',
      position: 'relative', overflow: 'hidden',
    }}>
      <span aria-hidden style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, width: 3,
        background: `linear-gradient(180deg, ${accent}cc 0%, ${accent}00 100%)`,
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div className="t-label" style={{ fontSize: 10, color: 'var(--gray-alt)', marginBottom: 4 }}>
            {rateUnit}
          </div>
          <div style={{
            fontFamily: 'Titillium Web', fontWeight: 700, fontSize: 18,
            color: 'var(--unity-black)', letterSpacing: '-0.02em',
          }}>{title}</div>
        </div>
        <div className="num-tabular" style={{
          fontSize: 16, fontWeight: 500, color: accent,
        }}>
          <span style={{
            color: 'var(--gray-alt)', textDecoration: 'line-through',
            textDecorationThickness: 1, marginRight: 8, fontWeight: 400,
          }}>{rateFrom}</span>
          {rateTo}
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        borderTop: '1px solid rgba(40,42,48,0.08)', paddingTop: 12,
      }}>
        <div>
          <div className="t-label" style={{ fontSize: 9, color: 'var(--gray-alt)', marginBottom: 4 }}>
            {t('leverAntifraud.cardCostTodayLabel')}
          </div>
          <div className="num-tabular" style={{
            fontSize: 22, fontWeight: 400, color: 'var(--unity-black)',
            letterSpacing: '-0.02em', lineHeight: 1,
          }}>{costNow}</div>
        </div>
        <div>
          <div className="t-label" style={{ fontSize: 9, color: 'var(--gray-alt)', marginBottom: 4 }}>
            {t('leverAntifraud.cardCostNewLabel')}
          </div>
          <div className="num-tabular" style={{
            fontSize: 22, fontWeight: 400, color: 'var(--gray-alt)',
            letterSpacing: '-0.02em', lineHeight: 1,
          }}>{costNew}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="t-label" style={{ fontSize: 9, color: accent, marginBottom: 4 }}>
            {t('leverAntifraud.cardSavingsLabel')}
          </div>
          <div className="num-tabular" style={{
            fontSize: 24, fontWeight: 600, color: accent,
            letterSpacing: '-0.02em', lineHeight: 1,
          }}>{savings}</div>
        </div>
      </div>

      {formula && (
        <div className="mono" style={{
          fontSize: 10, color: 'var(--gray-alt)', letterSpacing: '0.02em',
          paddingTop: 6, borderTop: '1px dashed rgba(40,42,48,0.10)',
        }}>{formula}</div>
      )}
    </div>
  )
}

export default function SlideLeverAntifraud({ data, pageNum, total, lang = 'es', currency: currencyProp }) {
  const t = (path) => tr(STRINGS, lang, path)
  const inputs = data?.INPUTS || {}
  const bc = data?.BUSINESS_CASE || {}
  const currency = currencyProp || inputs.currency || bc.currency || 'USD'
  const m = (v, opts) => fmtMoney(v, currency, lang, opts)
  const cs = currency === 'EUR' ? '€' : '$'

  const afNow = Number(inputs.current_antifraud_per_attempt) || 0.04
  const afNew = Number(inputs.target_antifraud_per_attempt) || 0.03
  const gwNow = Number(inputs.current_gateway_per_attempt) || 0
  const gwNew = Number(inputs.target_gateway_per_attempt) || 0
  const hasGateway = gwNow > 0

  const approvalNow = Number(inputs.current_approval_rate_pct) || 82
  const annualAttempts = Number(bc.annual_attempts) || 0
  const annualApproved = Number(bc.annual_approved_tx) || 0
  const antifraudSavings = Number(bc.antifraud_savings_annual_usd) || 0
  const gatewaySavings = Number(bc.gateway_savings_annual) || 0
  const combinedSavings = antifraudSavings + gatewaySavings

  // Costos actuales — sumados across verticals desde bc.verticals[]
  const bcVerticals = Array.isArray(bc.verticals) ? bc.verticals : []
  const costAfNow = bcVerticals.reduce((s, v) => s + (Number(v.cost_antifraud_current) || 0), 0)
                  || (annualAttempts * afNow)
  const costGwNow = bcVerticals.reduce((s, v) => s + (Number(v.cost_gateway_current) || 0), 0)
                  || (annualAttempts * gwNow)
  const costAfNew = Math.max(0, costAfNow - antifraudSavings)
  const costGwNew = Math.max(0, costGwNow - gatewaySavings)

  return (
    <div className="slide theme-light">
      <SectionLabel>{t('leverAntifraud.sectionLabel')}</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1400,
        color: 'var(--unity-black)',
      }}>
        {t('leverAntifraud.titleLead')}
        <br/>
        <span style={{ color: 'var(--yuno-blue)' }}>{t('leverAntifraud.titleAccent')}</span>
      </h2>

      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 360, left: 80, fontSize: 18,
        color: 'var(--gray-alt)', maxWidth: 720, lineHeight: 1.5,
      }}>
        {t('leverAntifraud.body')} <strong>{t('leverAntifraud.bodyAttemptsBold')}</strong> {t('leverAntifraud.bodyDeclinesNote')}
        {' '}{t('leverAntifraud.bodyGatewayCharged')} <strong>{t('leverAntifraud.bodyApprovedBold')}</strong>.
        {' '}{t('leverAntifraud.bodyApprovalLead').replace('{rate}', fmtPct(approvalNow, 1, lang))}{' '}
        <strong>{t('leverAntifraud.bodyAttemptsCountBold').replace('{n}', fmtNum(Math.round(annualAttempts / 1e6), lang))}</strong>
        {' '}{t('leverAntifraud.bodyApprovedCountSuffix').replace('{n}', fmtNum(Math.round(annualApproved / 1e6), lang))}
        {hasGateway && ' ' + t('leverAntifraud.bodyGatewayClose')}
      </div>

      {/* Left side — explainer card with intentos breakdown */}
      <div className="anim-in anim-in-3" style={{
        position: 'absolute', top: 540, left: 80, right: 720, bottom: 110,
        padding: 28, background: 'var(--harmony-lilac)', borderRadius: 16,
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <div className="t-label" style={{ color: 'var(--unity-black)' }}>
          {t('leverAntifraud.panelLabel')}
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18,
        }}>
          <div style={{
            padding: 20, background: '#fff', borderRadius: 12,
            border: '1px solid rgba(40,42,48,0.08)',
          }}>
            <div className="t-label" style={{ fontSize: 10, color: 'var(--gray-alt)', marginBottom: 8 }}>
              {t('leverAntifraud.attemptsYearLabel')}
            </div>
            <div className="num-tabular" style={{
              fontSize: 38, fontWeight: 300, color: 'var(--unity-black)',
              letterSpacing: '-0.03em', lineHeight: 1,
            }}>{fmtNum(Math.round(annualAttempts / 1e6), lang)}M</div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--gray-alt)' }}>
              {t('leverAntifraud.attemptsCaption')}
            </div>
          </div>
          <div style={{
            padding: 20, background: '#fff', borderRadius: 12,
            border: '1px solid rgba(40,42,48,0.08)',
          }}>
            <div className="t-label" style={{ fontSize: 10, color: 'var(--gray-alt)', marginBottom: 8 }}>
              {t('leverAntifraud.approvedYearLabel')}
            </div>
            <div className="num-tabular" style={{
              fontSize: 38, fontWeight: 300, color: 'var(--yuno-blue)',
              letterSpacing: '-0.03em', lineHeight: 1,
            }}>{fmtNum(Math.round(annualApproved / 1e6), lang)}M</div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--gray-alt)' }}>
              {fmtPct(approvalNow, 1, lang)} {t('leverAntifraud.approvalRateLabel')}
            </div>
          </div>
        </div>
        <div style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(62,79,224,0.10)',
          border: '1px solid rgba(62,79,224,0.30)',
          fontSize: 12, color: 'var(--yuno-blue-deep)', lineHeight: 1.5,
        }}>
          {t('leverAntifraud.cascadeNote')}
          {hasGateway && ' ' + t('leverAntifraud.gatewayNote')}
        </div>
      </div>

      {/* Right column — stacked sections per componente (AF / Gateway)
          + total al fondo. Costo hoy + ahorro explícitos en cada card. */}
      <div className="anim-in anim-in-4" style={{
        position: 'absolute', top: 360, right: 80, width: 580, bottom: 110,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <MethodCard
          accent="#FB923C"
          title={t('leverAntifraud.cardTitleAntifraud')}
          rateFrom={`${cs}${afNow.toFixed(2)}`}
          rateTo={`${cs}${afNew.toFixed(2)}`}
          rateUnit={t('leverAntifraud.rateUnitPerAttempt')}
          costNow={m(costAfNow)}
          costNew={m(costAfNew)}
          savings={m(antifraudSavings)}
          formula={`intentos × (${cs}${afNow.toFixed(2)} − ${cs}${afNew.toFixed(2)})`}
          lang={lang}
        />
        {hasGateway && (
          <MethodCard
            accent="#3E4FE0"
            title={t('leverAntifraud.cardTitleGateway')}
            rateFrom={`${cs}${gwNow.toFixed(2)}`}
            rateTo={gwNew === 0 ? t('leverAntifraud.gatewayIncluded') : `${cs}${gwNew.toFixed(2)}`}
            rateUnit={t('leverAntifraud.rateUnitPerApproved')}
            costNow={m(costGwNow)}
            costNew={m(costGwNew)}
            savings={m(gatewaySavings)}
            formula={gwNew === 0
              ? t('leverAntifraud.gatewayFormulaSaved').replace('{cs}', cs).replace('{gwNow}', gwNow.toFixed(2))
              : `aprobadas × (${cs}${gwNow.toFixed(2)} − ${cs}${gwNew.toFixed(2)})`}
            lang={lang}
          />
        )}
        <div style={{
          padding: '12px 18px', borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(224,237,128,0.18), rgba(62,79,224,0.18))',
          border: '1px solid rgba(224,237,128,0.40)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <span className="t-label" style={{ color: 'var(--unity-black)', fontSize: 11 }}>
            {hasGateway ? t('leverAntifraud.totalSavingsAFGatewayLabel') : t('leverAntifraud.totalSavingsAFLabel')}
          </span>
          <span className="num-tabular" style={{
            fontSize: 34, fontWeight: 300, color: 'var(--yuno-blue-deep)',
            letterSpacing: '-0.02em',
          }}>{m(combinedSavings)}</span>
        </div>
      </div>

      <SlideFooter section={t('leverAntifraud.footerSection')} pageNum={pageNum} total={total} />
    </div>
  )
}
