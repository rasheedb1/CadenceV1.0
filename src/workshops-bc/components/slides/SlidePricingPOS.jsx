// SlidePricingPOS — pricing por transacción aprobada para Card Present
// (terminales físicas / orquestación POS). Same table structure que el
// CNP (S22). Estos son los rates FINALES de la última propuesta a Coppel,
// tomados directo del RFP — no llevan descuento adicional (el −10% de
// CNP fue una negociación específica de e-commerce, no aplica a POS):
//   0–250k: $0.60 · 250k–500k: $0.50 · 500k–750k: $0.40
//   750k–1M: $0.30 · 1M+: $0.20  (todos MXN)
import HalftoneBg from '../primitives/HalftoneBg'
import OrbHalftone from '../primitives/OrbHalftone'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'

const POS_TIERS = [
  { limit_tx: 250_000,    rate: 0.60 },
  { limit_tx: 500_000,    rate: 0.50 },
  { limit_tx: 750_000,    rate: 0.40 },
  { limit_tx: 1_000_000,  rate: 0.30 },
  { limit_tx: Infinity,   rate: 0.20 },
]

const COPY = {
  sectionLabel:  { es: 'Pricing · Card Present (POS)', en: 'Pricing · Card Present (POS)', pt: 'Pricing · Card Present (POS)' },
  footerSection: { es: 'Pricing · POS',                en: 'Pricing · POS',                 pt: 'Pricing · POS' },
  titleLead:     { es: 'Costo por transacción', en: 'Cost per transaction',          pt: 'Custo por transação' },
  titleAccent:   { es: 'en terminales físicas.', en: 'on physical terminals.',         pt: 'em terminais físicos.' },
  body: {
    es: 'Orquestación de transacciones Card Present (POS) con el mismo modelo escalonado de e-commerce — el escalón aplica al volumen restante una vez superado. Sin cargo fijo adicional, solo costo per-tx.',
    en: 'Card Present (POS) transaction orchestration with the same tiered model as e-commerce — each tier applies to the remaining volume once exceeded. No additional fixed fee, just per-tx cost.',
    pt: 'Orquestração de transações Card Present (POS) com o mesmo modelo escalonado de e-commerce — cada camada se aplica ao volume restante após ultrapassada. Sem taxa fixa adicional, apenas custo per-tx.',
  },
  tableLabel:    { es: 'costo por transacción aprobada · pos', en: 'cost per approved transaction · pos', pt: 'custo por transação aprovada · pos' },
  colTier:       { es: 'escalón mensual',  en: 'monthly tier',  pt: 'camada mensal' },
  colRate:       { es: 'rate · MXN',       en: 'rate · MXN',    pt: 'rate · MXN' },
  tierTxSuffix:  { es: 'tx',               en: 'tx',            pt: 'tx' },
  noteLabel:     { es: 'modelo de pricing', en: 'pricing model', pt: 'modelo de pricing' },
  noteBody: {
    es: 'Mismo concepto escalonado que e-commerce: el rate de cada escalón aplica solo al volumen dentro de ese tramo. A mayor volumen mensual, menor rate marginal.',
    en: 'Same tiered concept as e-commerce: each tier rate applies only to the volume within that band. Higher monthly volume means lower marginal rate.',
    pt: 'Mesmo conceito escalonado de e-commerce: o rate de cada camada se aplica apenas ao volume dentro daquela faixa. Quanto maior o volume mensal, menor o rate marginal.',
  },
}

function tierLabel(tier, prev) {
  const lo = prev.toLocaleString('es-MX')
  const hi = Number.isFinite(tier.limit_tx) ? tier.limit_tx.toLocaleString('es-MX') : '∞'
  return Number.isFinite(tier.limit_tx) ? `${lo}–${hi}` : `${lo}+`
}

export default function SlidePricingPOS({ pageNum, total, lang = 'es' }) {
  const pick = (k) => COPY[k][lang] || COPY[k].en

  return (
    <div className="slide theme-dark">
      <HalftoneBg color="#3E4FE0" opacity={0.14} density={36} fadeDir="top" />
      <OrbHalftone size={760} x="92%" y="20%" color="#7C89EF" style={{ opacity: 0.20 }} />

      <SectionLabel color="rgba(255,255,255,0.7)">{pick('sectionLabel')}</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1300, color: '#fff',
      }}>
        {pick('titleLead')}
        <br/>
        <span style={{ color: '#BDC3F6' }}>{pick('titleAccent')}</span>
      </h2>

      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 320, left: 80, right: 80, fontSize: 16,
        color: 'rgba(255,255,255,0.65)', maxWidth: 1100, lineHeight: 1.5,
      }}>
        {pick('body')}
      </div>

      <div className="anim-in anim-in-3" style={{
        position: 'absolute', top: 440, left: 80, right: 80, bottom: 200,
        padding: '28px 32px', borderRadius: 18,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.10)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div className="t-label" style={{ color: '#BDC3F6', fontSize: 11, marginBottom: 18 }}>
          {pick('tableLabel')}
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr 180px',
          fontSize: 10, color: 'rgba(255,255,255,0.45)',
          letterSpacing: '0.12em', textTransform: 'uppercase',
          paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)',
          gap: 12,
        }}>
          <span>#</span>
          <span>{pick('colTier')}</span>
          <span style={{ textAlign: 'right' }}>{pick('colRate')}</span>
        </div>

        {POS_TIERS.map((tier, i) => {
          const prev = i === 0 ? 0 : POS_TIERS[i - 1].limit_tx
          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr 180px',
              gap: 12, padding: '14px 0',
              borderBottom: i < POS_TIERS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              color: '#fff', fontSize: 16, alignItems: 'center',
            }}>
              <span className="mono" style={{ fontSize: 11, opacity: 0.5 }}>{String(i + 1).padStart(2, '0')}</span>
              <span>{tierLabel(tier, prev)} {pick('tierTxSuffix')}</span>
              <span className="num-tabular" style={{
                textAlign: 'right', fontWeight: 700, fontSize: 22,
                color: '#E0ED80', letterSpacing: '-0.02em',
              }}>
                ${tier.rate.toFixed(2)} MXN
              </span>
            </div>
          )
        })}
      </div>

      <div className="anim-in anim-in-4" style={{
        position: 'absolute', bottom: 80, left: 80, right: 80,
        padding: '16px 22px', borderRadius: 12,
        background: 'rgba(62,79,224,0.10)',
        border: '1px solid rgba(124,137,239,0.30)',
        display: 'flex', alignItems: 'center', gap: 18,
      }}>
        <div className="t-label" style={{ color: '#BDC3F6', minWidth: 160, fontSize: 10 }}>
          {pick('noteLabel')}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5, flex: 1 }}>
          {pick('noteBody')}
        </div>
      </div>

      <SlideFooter section={pick('footerSection')} pageNum={pageNum} total={total} logoColor="rgba(255,255,255,0.55)" />
    </div>
  )
}
