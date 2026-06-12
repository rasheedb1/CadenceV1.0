// Palanca 04 · operaciones — formerly Monitors.
// Quantifies two operational savings that show up when payments consolidate
// through Yuno:
//   1. Dev cost avoided per new acquirer integration (one-time)
//   2. Reconciliation cost avoided by collapsing N settlement files into one
// Defaults are sized for Coppel (6 integrations · BBVA+EVO consolidation ·
// $10k/mo recon) but every number is overrideable through BCInputs.
import HalftoneBg from '../primitives/HalftoneBg'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'
import { fmtMoney, fmtNum } from '../../lib/format'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'
import { deriveLocalBC } from '../../lib/bcLocal'

// Per-team USD benchmark — shares the same proportions as Coppel's real
// engineering org cost (Engineering >> Banking >> Product/Fraud).
const DEV_TEAMS = [
  { name: 'Engineering',        cost: 6300 },
  { name: 'Banking & Payments', cost: 1575 },
  { name: 'Product',            cost: 1350 },
  { name: 'Fraud / Risk',       cost: 1350 },
  { name: 'Compliance',         cost: 900  },
  { name: 'Treasury',           cost: 810  },
  { name: 'Finance',            cost: 675  },
]

export default function SlideLeverMonitors({ data, pageNum, total, lang = 'es', currency: currencyProp }) {
  const t = (path) => tr(STRINGS, lang, path)
  const inputs = data?.INPUTS || {}
  // bcLocal centralizes the USD→local FX conversion + total recompute so
  // every slide uses the same numbers (avoids the legacy bug where dev +
  // recon savings were stored as USD and never converted for MXN decks).
  const local = deriveLocalBC(data)
  const currency = currencyProp || local.currency || 'USD'
  const m = (v, opts) => fmtMoney(v, currency, lang, opts)
  const cs = currency === 'EUR' ? '€' : '$'

  const { integrations, devMonthsPerInt, devMonthlyLocal,
          reconMonthlyLocal, perIntegrationLocal, devOneTimeLocal,
          reconAnnualLocal, operationalYear1Local: year1, engMonthsSaved } = local
  const acquirersConsolidated = Array.isArray(inputs.acquirers_consolidated) && inputs.acquirers_consolidated.length
    ? inputs.acquirers_consolidated
    : (Array.isArray(inputs.current_acquirers) ? inputs.current_acquirers.slice(0, 2) : ['BBVA', 'EVO'])

  // DEV_TEAMS is a USD-priced benchmark. Scale it to local currency so
  // the per-team breakdown adds up to devMonthlyLocal.
  const devTeamsBaseTotalUsd = DEV_TEAMS.reduce((s, t) => s + t.cost, 0)
  const teamScale = devMonthlyLocal / devTeamsBaseTotalUsd
  const teams = DEV_TEAMS.map((t) => ({ ...t, cost: t.cost * teamScale }))
  const devMonthly = devMonthlyLocal
  const perIntegration = perIntegrationLocal
  const devOneTime = devOneTimeLocal
  const reconMonthly = reconMonthlyLocal
  const reconAnnual = reconAnnualLocal

  return (
    <div className="slide theme-light">
      <SectionLabel>{t('leverMonitors.sectionLabel')}</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1400,
        color: 'var(--unity-black)',
      }}>
        {t('leverMonitors.titleLead')}
        <br/>
        <span style={{ color: 'var(--yuno-blue)' }}>{t('leverMonitors.titleAccent')}</span>
      </h2>

      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 360, left: 80, fontSize: 18,
        color: 'var(--gray-alt)', maxWidth: 760, lineHeight: 1.5,
      }}>
        {t('leverMonitors.bodyLead')} <strong style={{ color: 'var(--unity-black)' }}>{t('leverMonitors.bodyIntegrationsBold').replace('{n}', integrations)}</strong>{' '}
        {t('leverMonitors.bodyTail').replace('{acquirers}', acquirersConsolidated.join(' + '))}
      </div>

      {/* Tabla de costos por equipo — left card */}
      <div className="anim-in anim-in-3" style={{
        position: 'absolute', top: 520, left: 80, right: 720, bottom: 110,
        padding: 32, background: 'var(--harmony-lilac)', borderRadius: 16,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 18,
        }}>
          <span className="t-label" style={{ color: 'var(--unity-black)' }}>
            {t('leverMonitors.panelLabel')}
          </span>
          <span className="mono" style={{
            fontSize: 10, color: 'var(--gray-alt)',
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            {t('leverMonitors.panelCaption')}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 110px 130px',
            fontSize: 10, color: 'var(--gray-alt)', letterSpacing: '0.12em',
            textTransform: 'uppercase', paddingBottom: 8,
            borderBottom: '1px solid rgba(40,42,48,0.10)',
          }}>
            <span>{t('leverMonitors.colTeam')}</span>
            <span style={{ textAlign: 'right' }}>{t('leverMonitors.colPerMonth')}</span>
            <span style={{ textAlign: 'right' }}>{t('leverMonitors.colMonthsTemplate').replace('{n}', devMonthsPerInt)}</span>
          </div>

          {teams.map((t) => (
            <div key={t.name} style={{
              display: 'grid', gridTemplateColumns: '1fr 110px 130px',
              alignItems: 'center', padding: '7px 0',
              borderBottom: '1px solid rgba(40,42,48,0.06)',
              fontSize: 14, color: 'var(--unity-black)',
            }}>
              <span style={{ fontWeight: 500 }}>{t.name}</span>
              <span className="num-tabular" style={{ textAlign: 'right', color: 'var(--gray-alt)' }}>
                {cs}{Math.round(t.cost).toLocaleString('es-MX')}
              </span>
              <span className="num-tabular" style={{ textAlign: 'right', fontWeight: 600 }}>
                {cs}{Math.round(t.cost * devMonthsPerInt).toLocaleString('es-MX')}
              </span>
            </div>
          ))}

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 110px 130px',
            alignItems: 'center', padding: '10px 0 4px',
            marginTop: 4, borderTop: '1px solid rgba(40,42,48,0.18)',
            fontSize: 14, color: 'var(--unity-black)', fontWeight: 700,
          }}>
            <span>{t('leverMonitors.totalPerIntegration')}</span>
            <span className="num-tabular" style={{ textAlign: 'right' }}>
              {cs}{Math.round(devMonthly).toLocaleString('es-MX')}
            </span>
            <span className="num-tabular" style={{ textAlign: 'right', color: 'var(--yuno-blue)' }}>
              {cs}{Math.round(perIntegration).toLocaleString('es-MX')}
            </span>
          </div>
        </div>

        <div style={{
          marginTop: 16, padding: '12px 16px', borderRadius: 10,
          background: 'rgba(62,79,224,0.10)',
          border: '1px solid rgba(62,79,224,0.30)',
          fontSize: 13, color: 'var(--yuno-blue-deep)', lineHeight: 1.5,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
        }}>
          <span>
            {t('leverMonitors.avoidedDevTemplate')
              .replace('{n}', integrations)
              .replace('{amount}', `${cs}${Math.round(perIntegration).toLocaleString('es-MX')}`)
              .replace('{total}', `${cs}${Math.round(devOneTime).toLocaleString('es-MX')}`)}
          </span>
          <span className="mono" style={{
            fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            {t('leverMonitors.oneTimeLabel')}
          </span>
        </div>
      </div>

      {/* Card derecha — dev one-time + reconciliación anual */}
      <div className="anim-in anim-in-4" style={{
        position: 'absolute', top: 360, right: 80, width: 580, bottom: 110,
        padding: 36, background: 'var(--unity-black)', color: '#fff',
        borderRadius: 18, overflow: 'hidden',
      }}>
        <HalftoneBg color="#3E4FE0" opacity={0.45} density={22} fadeDir="bottom" />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="t-label" style={{ color: '#E0ED80', marginBottom: 12 }}>
            {t('leverMonitors.panelYear1Label')}
          </div>
          <div className="num-tabular" style={{
            fontSize: 88, fontWeight: 200, color: '#fff',
            letterSpacing: '-0.04em', lineHeight: 1,
          }}>
            {m(year1, { decimals: 0 })}
          </div>
          <div style={{ marginTop: 12, fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
            {t('leverMonitors.panelYear1Caption').replace('{curr}', currency)}
          </div>

          <div style={{
            marginTop: 28, paddingTop: 22, borderTop: '1px solid rgba(255,255,255,0.14)',
            display: 'flex', flexDirection: 'column', gap: 22,
          }}>
            <div>
              <div className="t-label" style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
                {t('leverMonitors.devOneTimeLabel')}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span className="num-tabular" style={{ fontSize: 34, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em' }}>
                  {m(devOneTime, { decimals: 0 })}
                </span>
                <span style={{ fontSize: 12, color: '#BDC3F6' }}>
                  {t('leverMonitors.engMonthsSavedTemplate').replace('{n}', fmtNum(engMonthsSaved, lang))}
                </span>
              </div>
            </div>

            <div>
              <div className="t-label" style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
                {t('leverMonitors.reconAnnualLabel')}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span className="num-tabular" style={{ fontSize: 34, fontWeight: 300, color: '#E0ED80', letterSpacing: '-0.02em' }}>
                  {m(reconAnnual, { decimals: 0 })}
                </span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                  {t('leverMonitors.perMonthCaption').replace('{amount}', `${cs}${Math.round(reconMonthly).toLocaleString('es-MX')}`)}
                </span>
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                {t('leverMonitors.consolidatedTemplate').replace('{acquirers}', acquirersConsolidated.join(' + '))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 18, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
            <span className="mono" style={{ color: '#BDC3F6' }}>
              {integrations} × {cs}{Math.round(perIntegration).toLocaleString('es-MX')} + {cs}{Math.round(reconMonthly).toLocaleString('es-MX')} × 12
            </span>
          </div>
        </div>
      </div>

      <SlideFooter section={t('leverMonitors.footerSection')} pageNum={pageNum} total={total} />
    </div>
  )
}
