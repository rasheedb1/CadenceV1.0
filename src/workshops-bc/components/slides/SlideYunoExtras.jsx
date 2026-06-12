// SlideYunoExtras — pricing add-ons que NO van dentro del costo base de
// Yuno (S22): 3DS Yuno per-attempt + conciliación (transaccional + bancaria
// + producto standalone). El estilo replica S22 (dark + halftone + orb)
// para que se lea como continuación natural del costo Yuno.
//
// Conciliación se presenta con precio tachado (antes 100k → 90k MXN/mes)
// para resaltar la rebaja, mismo lenguaje visual del descuento en tiers.
import HalftoneBg from '../primitives/HalftoneBg'
import OrbHalftone from '../primitives/OrbHalftone'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'
import { fmtMoney, fmtNum } from '../../lib/format'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

const THREEDS_PER_ATTEMPT_LOCAL     = 0.27
const THREEDS_PER_ATTEMPT_LOCAL_OLD = 0.63
// Solo una fracción del tráfico pasa por 3DS (típicamente los segmentos
// de mayor riesgo o donde el adquirente lo exige). Para Coppel asumimos
// 5% como baseline conservador del proyecto.
const THREEDS_SHARE_OF_ATTEMPTS_PCT = 5
const RECON_MONTHLY_LOCAL_NEW       = 90_000
const RECON_MONTHLY_LOCAL_OLD       = 100_000

export default function SlideYunoExtras({ data, pageNum, total, lang = 'es', currency: currencyProp }) {
  const t = (path) => tr(STRINGS, lang, path)
  const inputs = data?.INPUTS || {}
  const bc = data?.BUSINESS_CASE || {}
  // Estos add-ons cotizan en moneda local (MXN), no en la moneda de display
  // del deck (que puede venir como USD por default de migración 147).
  const localCurrency = inputs.currency || bc.currency || currencyProp || 'MXN'
  const m = (v, opts) => fmtMoney(v, localCurrency, lang, opts)

  // 3DS — solo el {share}% de los intentos anuales pasa por 3DS
  const annualAttempts = Number(bc.annual_attempts) || 0
  const threedsRate = Number(inputs.yuno_3ds_per_attempt_local) || THREEDS_PER_ATTEMPT_LOCAL
  const threedsRateOld = Number(inputs.yuno_3ds_per_attempt_local_prev) || THREEDS_PER_ATTEMPT_LOCAL_OLD
  const threedsSharePct = Number(inputs.yuno_3ds_share_of_attempts_pct) || THREEDS_SHARE_OF_ATTEMPTS_PCT
  const threedsAttemptsAnnual = annualAttempts * (threedsSharePct / 100)
  const threedsAnnual = threedsAttemptsAnnual * threedsRate
  const threedsMonthly = threedsAnnual / 12

  // Conciliación — pricing fijo mensual con rebaja vs precio anterior.
  // Set `inputs.yuno_reconciliation_monthly_local = 0` to hide the recon
  // block entirely (BCI: incluido, no se cobra como add-on).
  const reconRaw = inputs.yuno_reconciliation_monthly_local
  const reconNew = (typeof reconRaw === 'number' ? reconRaw : Number(reconRaw)) || RECON_MONTHLY_LOCAL_NEW
  const hasReconciliation = reconRaw === undefined || reconRaw === null
    ? true
    : Number(reconRaw) > 0
  const reconOld = Number(inputs.yuno_reconciliation_monthly_local_prev) || RECON_MONTHLY_LOCAL_OLD
  const reconAnnualNew = reconNew * 12
  const reconSavingsMonthly = Math.max(0, reconOld - reconNew)

  const extrasMonthlyTotal = threedsMonthly + (hasReconciliation ? reconNew : 0)
  const extrasAnnualTotal = threedsAnnual + (hasReconciliation ? reconAnnualNew : 0)

  return (
    <div className="slide theme-dark">
      <HalftoneBg color="#3E4FE0" opacity={0.14} density={36} fadeDir="top" />
      <OrbHalftone size={760} x="92%" y="20%" color="#E0ED80" style={{ opacity: 0.20 }} />

      <SectionLabel color="rgba(255,255,255,0.7)">{t('yunoExtras.sectionLabel')}</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1100, color: '#fff',
      }}>
        {t('yunoExtras.titleLead')}
        <br/>
        {t('yunoExtras.titleConnector')} <span style={{ color: '#E0ED80' }}>{t('yunoExtras.titleAccent')}</span>
      </h2>

      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 320, left: 80, fontSize: 16,
        color: 'rgba(255,255,255,0.65)', maxWidth: 1000, lineHeight: 1.5,
      }}>
        {t('yunoExtras.body')}
      </div>

      {/* LEFT — 3DS de Yuno (full-width when reconciliation is hidden) */}
      <div className="anim-in anim-in-3" style={{
        position: 'absolute', top: 420, left: 80,
        width: hasReconciliation ? 820 : undefined,
        right: hasReconciliation ? undefined : 80,
        bottom: 150,
        padding: '28px 30px', borderRadius: 18,
        background: 'rgba(62,79,224,0.10)',
        border: '1px solid rgba(124,137,239,0.40)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="t-label" style={{ color: '#BDC3F6', fontSize: 11 }}>
            {t('yunoExtras.threedsLabel')}
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: 999,
            background: 'rgba(224,237,128,0.15)', border: '1px solid rgba(224,237,128,0.45)',
            fontSize: 10, fontWeight: 700, color: '#E0ED80', letterSpacing: '0.10em', textTransform: 'uppercase',
          }}>{t('yunoExtras.threedsDiscountTag')
            .replace('{old}', threedsRateOld.toFixed(2))
            .replace('{new}', threedsRate.toFixed(2))}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <span className="num-tabular" style={{
            fontSize: 26, color: 'rgba(255,255,255,0.40)',
            textDecoration: 'line-through', fontWeight: 400, letterSpacing: '-0.01em',
          }}>{threedsRateOld.toFixed(2)} MXN</span>
          <div style={{
            fontFamily: 'Titillium Web', fontWeight: 200, fontSize: 64,
            color: '#fff', letterSpacing: '-0.03em', lineHeight: 1,
          }}>
            <span className="num-tabular">{threedsRate.toFixed(2)}</span>
            <span style={{ fontSize: 22, marginLeft: 10, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.04em' }}>
              MXN
            </span>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
          {t('yunoExtras.threedsUnit')}
        </div>

        <div style={{
          marginTop: 22, padding: '14px 16px', borderRadius: 12,
          background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div className="t-label" style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', marginBottom: 8 }}>
            {t('yunoExtras.threedsProjectedLabel')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                {t('yunoExtras.threedsShareTemplate')
                  .replace('{share}', threedsSharePct.toString())
                  .replace('{total}', fmtNum(Math.round(annualAttempts), lang))
                  .replace('{eligible}', fmtNum(Math.round(threedsAttemptsAnnual), lang))}
              </div>
              <div className="mono" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
                {fmtNum(Math.round(threedsAttemptsAnnual), lang)} × {threedsRate.toFixed(2)} MXN
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="num-tabular" style={{ fontSize: 26, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em' }}>
                {m(threedsAnnual)}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                {t('yunoExtras.annualSuffix')}
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{
          marginTop: 18, padding: '12px 14px', borderRadius: 10,
          background: 'rgba(189,195,246,0.06)', border: '1px solid rgba(189,195,246,0.16)',
          fontSize: 11.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5,
        }}>
          {t('yunoExtras.threedsNote')}
        </div>
      </div>

      {/* RIGHT — Conciliación (oculto cuando recon=0) */}
      {hasReconciliation && (
      <div className="anim-in anim-in-4" style={{
        position: 'absolute', top: 420, right: 80, width: 820, bottom: 150,
        padding: '28px 30px', borderRadius: 18,
        background: 'linear-gradient(135deg, rgba(224,237,128,0.12) 0%, rgba(62,79,224,0.10) 100%)',
        border: '1px solid rgba(224,237,128,0.40)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="t-label" style={{ color: '#E0ED80', fontSize: 11 }}>
            {t('yunoExtras.reconLabel')}
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: 999,
            background: 'rgba(224,237,128,0.15)', border: '1px solid rgba(224,237,128,0.45)',
            fontSize: 10, fontWeight: 700, color: '#E0ED80', letterSpacing: '0.10em', textTransform: 'uppercase',
          }}>{t('yunoExtras.reconDiscountTag').replace('{amount}', m(reconSavingsMonthly, { decimals: 0 }))}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, flexWrap: 'wrap' }}>
          <div className="num-tabular" style={{
            fontSize: 22, color: 'rgba(255,255,255,0.40)',
            textDecoration: 'line-through', fontWeight: 400, letterSpacing: '-0.01em',
          }}>{m(reconOld)}</div>
          <div style={{
            fontFamily: 'Titillium Web', fontWeight: 200, fontSize: 64,
            color: '#fff', letterSpacing: '-0.03em', lineHeight: 1,
          }}>
            <span className="num-tabular">{m(reconNew, { decimals: 0 })}</span>
          </div>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', alignSelf: 'flex-end', marginBottom: 8 }}>
            {t('yunoExtras.reconUnit')}
          </span>
        </div>

        <div style={{
          marginTop: 20, padding: '14px 16px', borderRadius: 12,
          background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16,
        }}>
          <div>
            <div className="t-label" style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
              {t('yunoExtras.reconAnnualLabel')}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
              {m(reconNew, { decimals: 0 })} × 12
            </div>
          </div>
          <div className="num-tabular" style={{
            fontSize: 26, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em',
          }}>{m(reconAnnualNew, { decimals: 1 })}</div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="t-label" style={{ fontSize: 9, color: 'rgba(224,237,128,0.85)', marginBottom: 10, letterSpacing: '0.14em' }}>
            {t('yunoExtras.reconIncludesLabel')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['reconIncludeTransactional', 'reconIncludeBanking', 'reconIncludeStandalone'].map((key) => (
              <div key={key} style={{
                padding: '10px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 6,
                  background: 'rgba(224,237,128,0.20)', border: '1px solid rgba(224,237,128,0.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: '#E0ED80', fontWeight: 700,
                }}>✓</span>
                <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>
                  {t(`yunoExtras.${key}`)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1 }} />
      </div>
      )}

      {/* Bottom strip — total add-ons mensual + anual */}
      <div className="anim-in anim-in-5" style={{
        position: 'absolute', bottom: 56, left: 80, right: 80,
        padding: '12px 22px', borderRadius: 12,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div className="t-label" style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10 }}>
          {t('yunoExtras.totalLabel')}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
          <div style={{ textAlign: 'right' }}>
            <div className="t-label" style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', marginBottom: 2 }}>
              {t('yunoExtras.monthlySuffix')}
            </div>
            <div className="num-tabular" style={{ fontSize: 18, fontWeight: 400, color: '#fff', letterSpacing: '-0.02em' }}>
              {m(extrasMonthlyTotal, { decimals: 1 })}
            </div>
          </div>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>·</span>
          <div style={{ textAlign: 'right' }}>
            <div className="t-label" style={{ fontSize: 9, color: 'rgba(224,237,128,0.85)', marginBottom: 2 }}>
              {t('yunoExtras.annualSuffix')}
            </div>
            <div className="num-tabular" style={{ fontSize: 22, fontWeight: 400, color: '#E0ED80', letterSpacing: '-0.02em' }}>
              {m(extrasAnnualTotal, { decimals: 1 })}
            </div>
          </div>
        </div>
      </div>

      <SlideFooter section={t('yunoExtras.footerSection')} pageNum={pageNum} total={total} logoColor="rgba(255,255,255,0.55)" />
    </div>
  )
}
