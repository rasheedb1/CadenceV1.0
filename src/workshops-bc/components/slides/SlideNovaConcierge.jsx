// SlideNovaConcierge — dos add-ons opcionales que se cobran por uso, NO
// como cargo fijo. Cada uno tiene su lógica propia:
//   LEFT  · NOVA AI — recuperación de pagos declinados por voz/WhatsApp,
//                     billing per-minuto / per-conversación
//   RIGHT · Payment Concierge — agente de soporte de pagos para usuarios.
//                     Tier ramp: mes 1 = $1K USD, mes 2 = $2K, mes 3+ = $3K
//                     (flat desde mes 3). Por uso, NO depende de cantidad
//                     de conversaciones ni de usuarios.
import HalftoneBg from '../primitives/HalftoneBg'
import OrbHalftone from '../primitives/OrbHalftone'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'

const FX_DEFAULT = 18 // MXN per USD

const PAYMENT_CONCIERGE_RAMP_USD = [1_000, 2_000, 3_000] // mes 1, mes 2, mes 3+
const NOVA_VOICE_PER_MINUTE_MXN = 9.2
const NOVA_WHATSAPP_PER_CONV_MXN = 5.5

const COPY = {
  sectionLabel:  { es: 'Pricing · Add-ons por uso', en: 'Pricing · Usage add-ons', pt: 'Pricing · Add-ons por uso' },
  footerSection: { es: 'NOVA · Payment Concierge', en: 'NOVA · Payment Concierge', pt: 'NOVA · Payment Concierge' },
  titleLead:     { es: 'AI nativo · pagas solo por',  en: 'Native AI · you only pay for', pt: 'AI nativa · você só paga' },
  titleAccent:   { es: 'lo que se ejecuta.',          en: 'what gets executed.',           pt: 'pelo que se executa.' },
  body: {
    es: 'Dos módulos AI opcionales que se activan a demanda. Ambos cobran por uso — sin cargo si no se ejecuta, sin pisos transaccionales mínimos, sin tope por cantidad de usuarios o conversaciones.',
    en: 'Two optional AI modules activated on demand. Both bill per use — no charge if not executed, no minimum transactional floors, no caps on number of users or conversations.',
    pt: 'Dois módulos AI opcionais ativados sob demanda. Ambos cobram por uso — sem cobrança se não executar, sem pisos transacionais mínimos, sem teto por número de usuários ou conversas.',
  },

  // LEFT — NOVA
  novaLabel:     { es: 'NOVA AI · recuperación de declinados', en: 'NOVA AI · declined payment recovery', pt: 'NOVA AI · recuperação de recusados' },
  novaTag:       { es: 'opcional · por uso', en: 'optional · per use', pt: 'opcional · por uso' },
  novaIntro: {
    es: 'Agente de IA que contacta proactivamente a los usuarios con pagos declinados para recuperar la transacción. Cobramos solo sobre las interacciones activadas — declines no atendidos, costo $0.',
    en: 'AI agent that proactively contacts users with declined payments to recover the transaction. We bill only on activated interactions — non-attended declines, $0 cost.',
    pt: 'Agente de IA que contata proativamente usuários com pagamentos recusados para recuperar a transação. Cobramos apenas sobre interações ativadas — recusas não atendidas, custo $0.',
  },
  novaVoiceLabel:    { es: 'llamada de voz IA', en: 'AI voice call', pt: 'chamada de voz IA' },
  novaVoiceUnit:     { es: 'por minuto', en: 'per minute', pt: 'por minuto' },
  novaWhatsAppLabel: { es: 'WhatsApp', en: 'WhatsApp', pt: 'WhatsApp' },
  novaWhatsAppUnit:  { es: 'por conversación activa de 24h', en: 'per 24h active conversation', pt: 'por conversa ativa de 24h' },

  // RIGHT — Payment Concierge
  conciergeLabel: { es: 'Payment Concierge · soporte pagos', en: 'Payment Concierge · payments support', pt: 'Payment Concierge · suporte pagamentos' },
  conciergeTag:   { es: 'opcional · ramp 3 meses', en: 'optional · 3-month ramp', pt: 'opcional · ramp 3 meses' },
  conciergeIntro: {
    es: 'Agente de soporte de pagos que arranca con pricing escalonado los primeros 3 meses para alinear el costo con la curva de adopción. Desde el mes 3, el precio queda flat — sin importar cantidad de conversaciones creadas ni cantidad de usuarios activos.',
    en: 'Payments support agent with tiered pricing the first 3 months to align cost with adoption curve. From month 3, price stays flat — regardless of conversations created or active users.',
    pt: 'Agente de suporte de pagamentos com pricing escalonado nos primeiros 3 meses para alinhar custo à curva de adoção. A partir do mês 3, o preço fica flat — independentemente de conversas criadas ou usuários ativos.',
  },
  conciergeMonthLabels: {
    es: ['mes 1', 'mes 2', 'mes 3+'],
    en: ['month 1', 'month 2', 'month 3+'],
    pt: ['mês 1', 'mês 2', 'mês 3+'],
  },
  conciergeActivation: {
    es: 'Se activa apenas el cliente lo empieza a usar — antes del primer uso, costo $0.',
    en: 'Activates only when the client starts using it — before first use, $0 cost.',
    pt: 'Ativa apenas quando o cliente começa a usar — antes do primeiro uso, custo $0.',
  },
  conciergeNote: {
    es: 'Cobro por uso — independiente del número de conversaciones generadas y del número de usuarios atendidos en el mes.',
    en: 'Per-use billing — independent of conversations generated and users served in the month.',
    pt: 'Cobrança por uso — independente do número de conversas geradas e usuários atendidos no mês.',
  },

  // Bottom strip
  bottomLabel:    { es: 'modelo · ambos add-ons', en: 'model · both add-ons', pt: 'modelo · ambos add-ons' },
  bottomBody: {
    es: 'Ambos se cotizan por separado del costo base de orquestación. Se activan únicamente cuando el cliente decide habilitarlos — sin pisos, sin minimums, sin cargos si no se usan.',
    en: 'Both are quoted separately from the orchestration base cost. Activated only when the client enables them — no floors, no minimums, no charges if not used.',
    pt: 'Ambos são cotados separadamente do custo base de orquestração. Ativados apenas quando o cliente decide habilitá-los — sem pisos, sem mínimos, sem cobranças se não forem usados.',
  },
}

function fmtMxnK(amount, decimals = 0) {
  // Compact MXN formatting: $54K / $1.0M-style
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000)     return `$${Math.round(amount / 1_000)}K`
  return `$${amount.toFixed(decimals)}`
}

export default function SlideNovaConcierge({ data, pageNum, total, lang = 'es' }) {
  const pick = (k) => COPY[k][lang] || COPY[k].en
  const inputs = data?.INPUTS || {}
  const bc = data?.BUSINESS_CASE || {}
  const fx = Number(bc.usd_to_local_fx) || Number(inputs.usd_to_local_fx) || FX_DEFAULT

  const conciergeRampMxn = PAYMENT_CONCIERGE_RAMP_USD.map((u) => u * fx)
  const conciergeMonthLabels = COPY.conciergeMonthLabels[lang] || COPY.conciergeMonthLabels.en

  return (
    <div className="slide theme-dark">
      <HalftoneBg color="#3E4FE0" opacity={0.14} density={36} fadeDir="top" />
      <OrbHalftone size={760} x="92%" y="20%" color="#E0ED80" style={{ opacity: 0.20 }} />

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

      {/* LEFT — NOVA */}
      <div className="anim-in anim-in-3" style={{
        position: 'absolute', top: 430, left: 80, width: 820, bottom: 160,
        padding: '24px 28px', borderRadius: 18,
        background: 'rgba(62,79,224,0.10)',
        border: '1px solid rgba(124,137,239,0.40)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="t-label" style={{ color: '#BDC3F6', fontSize: 11 }}>
            {pick('novaLabel')}
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: 999,
            background: 'rgba(189,195,246,0.14)', border: '1px solid rgba(189,195,246,0.30)',
            fontSize: 10, fontWeight: 700, color: '#BDC3F6', letterSpacing: '0.10em', textTransform: 'uppercase',
          }}>{pick('novaTag')}</div>
        </div>

        <div style={{
          fontSize: 12.5, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5,
          marginTop: 6, marginBottom: 18,
        }}>
          {pick('novaIntro')}
        </div>

        {/* Voice */}
        <div style={{
          padding: '14px 16px', borderRadius: 12,
          background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)',
          marginBottom: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <div>
              <div className="t-label" style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
                {pick('novaVoiceLabel')}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                {pick('novaVoiceUnit')}
              </div>
            </div>
            <div className="num-tabular" style={{
              fontFamily: 'Titillium Web', fontWeight: 200, fontSize: 36,
              color: '#fff', letterSpacing: '-0.02em', lineHeight: 1,
            }}>
              ${NOVA_VOICE_PER_MINUTE_MXN.toFixed(1)}{' '}
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.04em' }}>
                MXN
              </span>
            </div>
          </div>
        </div>

        {/* WhatsApp */}
        <div style={{
          padding: '14px 16px', borderRadius: 12,
          background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <div>
              <div className="t-label" style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
                {pick('novaWhatsAppLabel')}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                {pick('novaWhatsAppUnit')}
              </div>
            </div>
            <div className="num-tabular" style={{
              fontFamily: 'Titillium Web', fontWeight: 200, fontSize: 36,
              color: '#fff', letterSpacing: '-0.02em', lineHeight: 1,
            }}>
              ${NOVA_WHATSAPP_PER_CONV_MXN.toFixed(1)}{' '}
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.04em' }}>
                MXN
              </span>
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />
      </div>

      {/* RIGHT — Payment Concierge */}
      <div className="anim-in anim-in-4" style={{
        position: 'absolute', top: 430, right: 80, width: 820, bottom: 160,
        padding: '24px 28px', borderRadius: 18,
        background: 'linear-gradient(135deg, rgba(224,237,128,0.12) 0%, rgba(62,79,224,0.10) 100%)',
        border: '1px solid rgba(224,237,128,0.40)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="t-label" style={{ color: '#E0ED80', fontSize: 11 }}>
            {pick('conciergeLabel')}
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: 999,
            background: 'rgba(224,237,128,0.15)', border: '1px solid rgba(224,237,128,0.45)',
            fontSize: 10, fontWeight: 700, color: '#E0ED80', letterSpacing: '0.10em', textTransform: 'uppercase',
          }}>{pick('conciergeTag')}</div>
        </div>

        <div style={{
          fontSize: 12.5, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5,
          marginTop: 6, marginBottom: 16,
        }}>
          {pick('conciergeIntro')}
        </div>

        {/* Ramp 3 meses */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {conciergeRampMxn.map((mxn, i) => {
            const isFlat = i === conciergeRampMxn.length - 1
            return (
              <div key={i} style={{
                padding: '14px 12px', borderRadius: 12,
                background: isFlat
                  ? 'linear-gradient(180deg, rgba(224,237,128,0.18) 0%, rgba(224,237,128,0.04) 100%)'
                  : 'rgba(0,0,0,0.25)',
                border: isFlat ? '1px solid rgba(224,237,128,0.55)' : '1px solid rgba(255,255,255,0.08)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <div className="t-label" style={{
                  fontSize: 9, color: isFlat ? '#E0ED80' : 'rgba(255,255,255,0.55)',
                  letterSpacing: '0.14em',
                }}>
                  {conciergeMonthLabels[i]}
                </div>
                <div className="num-tabular" style={{
                  fontFamily: 'Titillium Web', fontWeight: 300, fontSize: 30,
                  color: isFlat ? '#fff' : '#fff', letterSpacing: '-0.02em', lineHeight: 1,
                  marginTop: 4,
                }}>
                  {fmtMxnK(mxn)}
                </div>
                <div className="mono" style={{
                  fontSize: 9.5, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.04em',
                }}>
                  ≡ USD {PAYMENT_CONCIERGE_RAMP_USD[i].toLocaleString()}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{
          marginTop: 14, padding: '10px 14px', borderRadius: 10,
          background: 'rgba(224,237,128,0.08)', border: '1px solid rgba(224,237,128,0.30)',
          fontSize: 11.5, color: 'rgba(255,255,255,0.78)', lineHeight: 1.45,
        }}>
          {pick('conciergeActivation')}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 10,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          fontSize: 11, color: 'rgba(255,255,255,0.62)', lineHeight: 1.45,
        }}>
          {pick('conciergeNote')}
        </div>
      </div>

      {/* Bottom strip — model summary */}
      <div className="anim-in anim-in-5" style={{
        position: 'absolute', bottom: 80, left: 80, right: 80,
        padding: '14px 22px', borderRadius: 12,
        background: 'rgba(62,79,224,0.10)',
        border: '1px solid rgba(124,137,239,0.30)',
        display: 'flex', alignItems: 'center', gap: 18,
      }}>
        <div className="t-label" style={{ color: '#BDC3F6', minWidth: 160, fontSize: 10 }}>
          {pick('bottomLabel')}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.5, flex: 1 }}>
          {pick('bottomBody')}
        </div>
      </div>

      <SlideFooter section={pick('footerSection')} pageNum={pageNum} total={total} logoColor="rgba(255,255,255,0.55)" />
    </div>
  )
}
