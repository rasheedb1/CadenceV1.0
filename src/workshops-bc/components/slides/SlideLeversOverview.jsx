import HalftoneBg from '../primitives/HalftoneBg'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'
import { fmtPct, fmtMoney } from '../../lib/format'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'
import { deriveLocalBC } from '../../lib/bcLocal'

export default function SlideLeversOverview({ data, pageNum, total, lang = 'es', currency: currencyProp }) {
  const t = (path) => tr(STRINGS, lang, path)
  const inputs = data?.INPUTS || {}
  const local = deriveLocalBC(data)
  const currency = currencyProp || local.currency || 'USD'
  const m = (v, opts) => fmtMoney(v, currency, lang, opts)
  const cs = currency === 'EUR' ? '€' : '$'
  const approvalNow = Number(inputs.current_approval_rate_pct) || 82
  const approvalNew = Number(inputs.target_approval_rate_pct) || 85
  const creditMdrNow = Number(inputs.current_credit_mdr_pct) || Number(inputs.current_mdr_pct) || 2.37
  const creditMdrNew = Number(inputs.target_credit_mdr_pct) || Number(inputs.target_mdr_pct) || 2.10
  const debitMdrNow = Number(inputs.current_debit_mdr_per_tx) || 0
  const debitMdrNew = Number(inputs.target_debit_mdr_per_tx) || 0
  // Debit MDR as % of TPV (BCI-style). Takes precedence over per-tx when set.
  const debitMdrPctNow = Number(inputs.current_debit_mdr_pct) || 0
  const debitMdrPctNew = Number(inputs.target_debit_mdr_pct) || 0
  const debitPctMode = debitMdrPctNow > 0
  const hasDebit = debitPctMode || debitMdrNow > 0
  const afNow = Number(inputs.current_antifraud_per_attempt) || 0
  const afNew = Number(inputs.target_antifraud_per_attempt) || 0
  const hasAntifraud = afNow > 0 || afNew > 0
  const gwNow = Number(inputs.current_gateway_per_attempt) || 0
  const gwNew = Number(inputs.target_gateway_per_attempt) || 0
  const hasGateway = gwNow > 0
  const integrations = local.integrations
  const opsYear1 = local.operationalYear1Local

  const lv = STRINGS.leversOverview.levers
  const pickL = (node) => (node && (node[lang] || node.en)) || ''

  // Build levers list dynamically based on which inputs apply.
  // Numbering is assigned in-order so it stays sequential when cards
  // drop out (e.g. BCI Seguros has no antifraud → 01·routing 02·mdr credit
  // 03·mdr débito 04·operaciones, no 05).
  const debitCard = hasDebit && {
    tag: pickL(lv.mdrDebit.tag),
    t: pickL(debitPctMode ? lv.mdrDebitPct.t : lv.mdrDebit.t),
    from: debitPctMode ? fmtPct(debitMdrPctNow, 2, lang) : cs + debitMdrNow.toFixed(2),
    to:   debitPctMode ? fmtPct(debitMdrPctNew, 2, lang) : cs + debitMdrNew.toFixed(2),
    delta: debitPctMode
      ? '-' + (debitMdrPctNow - debitMdrPctNew).toFixed(2) + 'pp'
      : '-' + cs + (debitMdrNow - debitMdrNew).toFixed(2) + '/tx',
    desc: pickL(debitPctMode ? lv.mdrDebitPct.desc : lv.mdrDebit.desc),
  }
  const afCard = hasAntifraud && {
    tag: pickL(lv.antifraud.tag), t: pickL(lv.antifraud.t),
    from: cs + afNow.toFixed(2), to: cs + afNew.toFixed(2),
    delta: '-' + cs + (afNow - afNew).toFixed(2),
    desc: pickL(lv.antifraud.desc),
  }
  const gwCard = hasGateway && {
    tag: pickL(lv.gateway.tag), t: pickL(lv.gateway.t),
    from: cs + gwNow.toFixed(2), to: gwNew === 0 ? pickL(lv.gateway.saved) : cs + gwNew.toFixed(2),
    delta: '-' + cs + (gwNow - gwNew).toFixed(2),
    desc: pickL(lv.gateway.desc),
  }
  const LEVERS = [
    {
      tag: pickL(lv.smartRouting.tag), t: pickL(lv.smartRouting.t),
      from: fmtPct(approvalNow, 1, lang), to: fmtPct(approvalNew, 1, lang),
      delta: '+' + (approvalNew - approvalNow).toFixed(1) + 'pp',
      desc: pickL(lv.smartRouting.desc),
      featured: true,
    },
    {
      tag: pickL(lv.mdrCredit.tag), t: pickL(lv.mdrCredit.t),
      from: fmtPct(creditMdrNow, 2, lang), to: fmtPct(creditMdrNew, 2, lang),
      delta: '-' + (creditMdrNow - creditMdrNew).toFixed(2) + 'pp',
      desc: pickL(lv.mdrCredit.desc),
    },
    debitCard,
    afCard,
    gwCard,
    {
      tag: pickL(lv.operations.tag), t: pickL(lv.operations.t),
      from: pickL(lv.operations.integrationsTemplate).replace('{n}', integrations),
      to: pickL(lv.operations.oneStack),
      delta: '+' + m(opsYear1, { decimals: 0 }),
      desc: pickL(lv.operations.desc),
    },
  ].filter(Boolean).map((card, i) => ({
    ...card,
    n: String(i + 1).padStart(2, '0'),
  }))

  // Grid layout: 3 cols × 2 rows si hay 5-6 cards, 2×2 si hay 4 (legacy).
  const gridCols = LEVERS.length >= 5 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)'
  const gridRows = 'repeat(2, 1fr)'
  const compact = LEVERS.length >= 5

  return (
    <div className="slide theme-dark">
      <HalftoneBg color="#3E4FE0" opacity={0.18} density={36} fadeDir="bottom" />

      <SectionLabel color="rgba(255,255,255,0.7)">{t('leversOverview.sectionLabel')}</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1500, color: '#fff',
      }}>
        {t('leversOverview.titleLead')}
        <br/>
        <span style={{ color: '#BDC3F6' }}>{t('leversOverview.titleAccent')}</span>
      </h2>

      <div style={{
        position: 'absolute', top: 360, left: 80, right: 80, bottom: 110,
        display: 'grid', gridTemplateColumns: gridCols,
        gridTemplateRows: gridRows, gap: compact ? 16 : 22,
      }}>
        {LEVERS.map((l, i) => (
          <div key={i} className={`anim-in anim-in-${i + 2}`} style={{
            padding: compact ? 22 : 32, borderRadius: 14,
            background: l.featured ? 'rgba(62,79,224,0.16)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${l.featured ? 'rgba(124,137,239,0.45)' : 'rgba(255,255,255,0.10)'}`,
            position: 'relative', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: compact ? 12 : 18, gap: 10 }}>
              <span className="mono" style={{
                fontSize: compact ? 10 : 12, color: 'rgba(255,255,255,0.4)',
                letterSpacing: '0.14em', textTransform: 'uppercase',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{l.n} · {l.tag}</span>
              <span style={{
                padding: compact ? '3px 9px' : '4px 12px', borderRadius: 999,
                background: 'rgba(224,237,128,0.15)',
                border: '1px solid rgba(224,237,128,0.40)',
                fontSize: compact ? 10 : 12, fontWeight: 600, color: '#E0ED80',
                letterSpacing: '0.04em', whiteSpace: 'nowrap', flexShrink: 0,
              }}>{l.delta}</span>
            </div>
            <div style={{
              fontSize: compact ? 11 : 14, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.6)', marginBottom: compact ? 10 : 14,
            }}>{l.t}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: compact ? 10 : 18, marginBottom: compact ? 12 : 18, flexWrap: 'wrap' }}>
              <span className="num-tabular" style={{
                fontSize: compact ? 32 : 56, fontWeight: 300, color: 'rgba(255,255,255,0.45)',
                letterSpacing: '-0.03em', textDecoration: 'line-through',
                textDecorationColor: 'rgba(255,255,255,0.25)', textDecorationThickness: 1,
              }}>{l.from}</span>
              <span style={{ fontSize: compact ? 18 : 28, color: 'rgba(255,255,255,0.4)' }}>→</span>
              <span className="num-tabular" style={{
                fontSize: compact ? 44 : 72, fontWeight: 300, color: '#fff', letterSpacing: '-0.03em',
              }}>{l.to}</span>
            </div>
            <div style={{
              fontSize: compact ? 12 : 14, color: 'rgba(255,255,255,0.7)',
              lineHeight: 1.5, marginTop: 'auto',
            }}>{l.desc}</div>
          </div>
        ))}
      </div>

      <SlideFooter section={t('leversOverview.footerSection')} pageNum={pageNum} total={total} logoColor="rgba(255,255,255,0.55)" />
    </div>
  )
}
