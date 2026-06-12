// SlideIncludedFeatures — lista de productos que vienen INCLUIDOS en el
// costo de orquestación (sin cargo adicional). Cierra la conversación
// "what's bundled vs what's optional" del pricing deck.
import HalftoneBg from '../primitives/HalftoneBg'
import OrbHalftone from '../primitives/OrbHalftone'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'

const COPY = {
  sectionLabel:  { es: 'Productos incluidos · sin cargo adicional', en: 'Included products · no extra charge', pt: 'Produtos incluídos · sem custo adicional' },
  footerSection: { es: 'Productos incluidos', en: 'Included products', pt: 'Produtos incluídos' },
  titleLead:     { es: 'Lo que ya está', en: "What's already", pt: 'O que já está' },
  titleAccent:   { es: 'incluido en la orquestación.', en: 'included in the orchestration.', pt: 'incluído na orquestração.' },
  body: {
    es: 'Todos los módulos a continuación vienen activados desde el día uno como parte del costo de orquestación. No se cobra por separado, no se cobra por uso, no requieren activación adicional.',
    en: 'All modules below come activated from day one as part of the orchestration cost. Not billed separately, not billed per use, no extra activation required.',
    pt: 'Todos os módulos abaixo já vêm ativados desde o primeiro dia como parte do custo de orquestação. Sem cobrança separada, sem cobrança por uso, sem ativação adicional.',
  },
  bundledLabel:  { es: 'incluido', en: 'included', pt: 'incluído' },
  footerNote: {
    es: 'Implementación, integraciones nuevas a proveedores y customer success están cubiertos durante toda la vida del contrato — no son cargos de onboarding one-time.',
    en: 'Implementation, new vendor integrations and customer success are covered for the lifetime of the contract — not one-time onboarding fees.',
    pt: 'Implementação, novas integrações com fornecedores e customer success estão cobertos durante toda a vida do contrato — não são taxas one-time de onboarding.',
  },
}

const FEATURES = [
  {
    key: 'fraud_tx',
    es: { name: 'Transacciones de fraude', desc: 'Marcado de transacciones sospechosas + acciones automáticas sin costo per-tx adicional.' },
    en: { name: 'Fraud transactions',       desc: 'Suspicious-transaction flagging + automatic actions with no extra per-tx cost.' },
    pt: { name: 'Transações de fraude',     desc: 'Marcação de transações suspeitas + ações automáticas sem custo per-tx adicional.' },
  },
  {
    key: '3ds_third_party',
    es: { name: '3DS de terceros',          desc: 'Cybersource, Nuvei y otros proveedores 3DS externos integrados sin cargo extra.' },
    en: { name: 'Third-party 3DS',          desc: 'Cybersource, Nuvei and other external 3DS providers integrated at no extra cost.' },
    pt: { name: '3DS de terceiros',         desc: 'Cybersource, Nuvei e outros provedores 3DS externos integrados sem custo extra.' },
  },
  {
    key: 'monitors',
    es: { name: 'Herramienta Monitors',     desc: 'Alertas en tiempo real sobre transacciones, aprobaciones y disponibilidad de adquirentes.' },
    en: { name: 'Monitors tool',            desc: 'Real-time alerts on transactions, approvals and acquirer availability.' },
    pt: { name: 'Ferramenta Monitors',      desc: 'Alertas em tempo real sobre transações, aprovações e disponibilidade de adquirentes.' },
  },
  {
    key: 'risk_conditions',
    es: { name: 'Risk Conditions',          desc: 'Motor de reglas para condicionar ruteo y antifraude por BIN, monto, país, hora.' },
    en: { name: 'Risk Conditions',          desc: 'Rules engine to condition routing and antifraud by BIN, amount, country, time.' },
    pt: { name: 'Risk Conditions',          desc: 'Motor de regras para condicionar roteamento e antifraude por BIN, valor, país, hora.' },
  },
  {
    key: 'implementation',
    es: { name: 'Implementación y onboarding', desc: 'Solutions engineering + project management durante todo el go-live.' },
    en: { name: 'Implementation & onboarding', desc: 'Solutions engineering + project management throughout go-live.' },
    pt: { name: 'Implementação e onboarding',  desc: 'Solutions engineering + project management durante todo o go-live.' },
  },
  {
    key: 'new_integrations',
    es: { name: 'Integraciones nuevas',     desc: 'Nuevos adquirentes, APMs o gateways durante el contrato sin facturación extra.' },
    en: { name: 'New integrations',         desc: 'New acquirers, APMs or gateways during the contract with no extra billing.' },
    pt: { name: 'Novas integrações',        desc: 'Novos adquirentes, APMs ou gateways durante o contrato sem cobrança extra.' },
  },
  {
    key: 'customer_success',
    es: { name: 'Consultoría técnica · CS', desc: 'Customer Success + technical advisory dedicado durante toda la vida del contrato.' },
    en: { name: 'Technical advisory · CS',  desc: 'Customer Success + dedicated technical advisory for the lifetime of the contract.' },
    pt: { name: 'Consultoria técnica · CS', desc: 'Customer Success + technical advisory dedicado durante toda a vida do contrato.' },
  },
]

export default function SlideIncludedFeatures({ pageNum, total, lang = 'es' }) {
  const pick = (k) => COPY[k][lang] || COPY[k].en

  return (
    <div className="slide theme-dark">
      <HalftoneBg color="#3E4FE0" opacity={0.12} density={36} fadeDir="top" />
      <OrbHalftone size={760} x="92%" y="20%" color="#E0ED80" style={{ opacity: 0.18 }} />

      <SectionLabel color="rgba(255,255,255,0.7)">{pick('sectionLabel')}</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1300, color: '#fff',
      }}>
        {pick('titleLead')}
        <br/>
        <span style={{ color: '#E0ED80' }}>{pick('titleAccent')}</span>
      </h2>

      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 320, left: 80, right: 80, fontSize: 16,
        color: 'rgba(255,255,255,0.65)', maxWidth: 1300, lineHeight: 1.5,
      }}>
        {pick('body')}
      </div>

      <div className="anim-in anim-in-3" style={{
        position: 'absolute', top: 430, left: 80, right: 80, bottom: 170,
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
        gridAutoRows: 'min-content', gap: 12,
      }}>
        {FEATURES.map((f) => {
          const tr = f[lang] || f.en
          return (
            <div key={f.key} style={{
              padding: '14px 18px', borderRadius: 12,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.10)',
              display: 'flex', alignItems: 'flex-start', gap: 14,
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'rgba(224,237,128,0.18)',
                border: '1px solid rgba(224,237,128,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: '#E0ED80', flexShrink: 0,
              }}>✓</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'Titillium Web, sans-serif', fontWeight: 700,
                  fontSize: 16, color: '#fff', letterSpacing: '-0.01em', marginBottom: 4,
                }}>
                  {tr.name}
                </div>
                <div style={{
                  fontSize: 12, color: 'rgba(255,255,255,0.62)', lineHeight: 1.45,
                }}>
                  {tr.desc}
                </div>
              </div>
              <span className="t-label" style={{
                fontSize: 9, color: 'rgba(224,237,128,0.85)',
                letterSpacing: '0.14em', whiteSpace: 'nowrap',
                alignSelf: 'flex-start', marginTop: 4,
              }}>
                {pick('bundledLabel')}
              </span>
            </div>
          )
        })}
      </div>

      <div className="anim-in anim-in-4" style={{
        position: 'absolute', bottom: 80, left: 80, right: 80,
        padding: '14px 22px', borderRadius: 12,
        background: 'rgba(62,79,224,0.10)',
        border: '1px solid rgba(124,137,239,0.30)',
        fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.5,
      }}>
        {pick('footerNote')}
      </div>

      <SlideFooter section={pick('footerSection')} pageNum={pageNum} total={total} logoColor="rgba(255,255,255,0.55)" />
    </div>
  )
}
