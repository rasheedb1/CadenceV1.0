import HalftoneBg from '../primitives/HalftoneBg'
import Counter from '../primitives/Counter'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'

// Merged Yuno · platform & numbers — replaces the v1 split between "Yuno
// Numbers" and "Platform". Pattern from the bet365 deck's
// "A complete suite · Four pillars · One brain" slide:
//   stats row (4 cards, animated counters) → payment_lifecycle marker →
//   4 pillar columns (Orchestration / Checkout & SDKs / Security & Risk /
//   AI & Intelligence), each with 3 sub-items → Payments Concierge teaser.

const STATS = [
  { n: 460,   suf: '+', label: 'integraciones' },
  { n: 190,   suf: '+', label: 'países' },
  { n: 1000,  suf: '+', label: 'métodos de pago' },
  { n: 180,   suf: '+', label: 'monedas' },
]

const PILLARS = [
  {
    n: '01', name: 'orquestación', tag: 'enrutamos & recuperamos',
    items: [
      { t: 'Orchestration engine',     d: 'cada adquirente, un solo plano de control.' },
      { t: 'Smart Routing',             d: 'decisión por transacción según BIN, hora, país.' },
      { t: 'Monitors & auto-failover',  d: 'el checkout no se cae, siempre.' },
    ],
  },
  {
    n: '02', name: 'checkout & SDKs', tag: 'convertimos en todos lados',
    items: [
      { t: 'Customizable checkout',     d: 'métodos locales, sensación nativa.' },
      { t: 'Subscription management',   d: 'recurrencia, con menos ingeniería.' },
      { t: 'Mobile SDKs',               d: 'una interfaz, iOS + Android.' },
    ],
  },
  {
    n: '03', name: 'seguridad & riesgo', tag: 'protegemos cada tarjeta',
    items: [
      { t: 'PCI Vault Tokenization',    d: 'tokens válidos en todas las redes.' },
      { t: '3DS authentication',        d: 'reduce fraude, sube aprobación.' },
      { t: 'Account updater',           d: 'credenciales siempre frescas.' },
    ],
  },
  {
    n: '04', name: 'AI & inteligencia', tag: 'el cerebro',
    items: [
      { t: 'Analytics',                  d: 'fees, FX, aprobación. Listo para decidir.' },
      { t: 'Reconciliation',             d: 'un solo ledger entre todos los PSPs.' },
      { t: 'Payments Concierge',         d: 'copiloto en lenguaje natural.' },
    ],
  },
]

// eslint-disable-next-line no-unused-vars
export default function SlideYunoNumbers({ pageNum, total, lang = 'es' }) {
  return (
    <div className="slide theme-dark" style={{ position: 'relative', overflow: 'hidden' }}>
      <HalftoneBg color="#3E4FE0" opacity={0.14} density={40} fadeDir="bottom" />

      <SectionLabel color="rgba(255,255,255,0.7)">Yuno · plataforma & números</SectionLabel>

      {/* Title row */}
      <div className="anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, right: 80,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 'clamp(24px, 3vw, 48px)',
      }}>
        <h2 className="t-title t-title-m" style={{
          fontSize: 'clamp(36px, 3.2vw, 60px)', fontWeight: 500,
          letterSpacing: '-1.2px', lineHeight: 1.05, color: '#fff', margin: 0,
          maxWidth: '70%',
        }}>
          Una suite completa · cuatro pilares ·{' '}
          <span data-gradient-text style={{
            backgroundImage: 'linear-gradient(110deg, #3E4FE0 0%, #5967E4 30%, #BDC3F6 68%, #E8EAF5 100%)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text',
            WebkitTextFillColor: 'transparent', color: 'transparent',
            fontWeight: 700,
          }}>un cerebro.</span>
        </h2>
        <p style={{
          fontSize: 'clamp(13px, 1.05vw, 17px)', lineHeight: 1.55,
          color: 'rgba(255,255,255,0.65)', maxWidth: '30%', textAlign: 'right',
          margin: 0,
        }}>
          Diseñado para escalar con tu volumen, con AI que entrega decisiones —
          no solo dashboards.
        </p>
      </div>

      {/* Stats row */}
      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 310, left: 80, right: 80,
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'clamp(14px, 1.2vw, 22px)',
      }}>
        {STATS.map((s, i) => (
          <div key={i} style={{
            padding: 'clamp(20px, 1.6vw, 28px)',
            background: 'rgba(62,79,224,0.10)',
            border: '1px solid rgba(124,137,239,0.32)',
            borderRadius: 16, position: 'relative', overflow: 'hidden',
          }}>
            <HalftoneBg color="#3E4FE0" opacity={0.20} density={26} fadeDir="bottom" />
            <div className="t-number num-tabular" style={{
              position: 'relative',
              fontSize: 'clamp(48px, 4.4vw, 84px)', fontWeight: 300, color: '#7C89EF',
              lineHeight: 0.92, letterSpacing: '-0.04em',
            }}>
              <Counter value={s.n} format={(v) => Math.round(v).toLocaleString()} delay={i * 100} />
              <span style={{ color: 'rgba(124,137,239,0.85)' }}>{s.suf}</span>
            </div>
            <div className="t-label" style={{
              position: 'relative', marginTop: 14,
              fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.65)',
            }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* payment_lifecycle code marker */}
      <div className="anim-in anim-in-3 mono" style={{
        position: 'absolute', top: 488, left: 80, right: 80,
        fontSize: 12, color: 'rgba(124,137,239,0.85)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ color: '#7C89EF' }}>&gt;</span>
        <span>payment_lifecycle</span>
        <span style={{
          flex: 1, height: 1,
          background: 'linear-gradient(90deg, rgba(124,137,239,0.40) 0%, transparent 100%)',
        }} />
      </div>

      {/* 4 pillars grid */}
      <div className="stagger" style={{
        position: 'absolute', top: 520, left: 80, right: 80, height: 322,
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'clamp(12px, 1.1vw, 20px)',
        '--stagger-base': '0.34s', '--stagger-step': '0.08s',
      }}>
        {PILLARS.map((p, i) => (
          <div key={p.n} style={{
            display: 'flex', flexDirection: 'column',
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: 'clamp(14px, 1.2vw, 22px)',
            overflow: 'hidden',
          }}>
            {/* Pillar header */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr',
              gap: 'clamp(10px, 0.9vw, 14px)',
              paddingBottom: 'clamp(10px, 0.9vw, 14px)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              marginBottom: 'clamp(10px, 0.9vw, 14px)',
            }}>
              <span className="mono" style={{
                fontSize: 13, fontWeight: 700, color: 'rgba(124,137,239,0.95)',
                letterSpacing: '0.06em',
              }}>{p.n}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: 'Titillium Web, sans-serif',
                  fontSize: 'clamp(13px, 1.05vw, 17px)', fontWeight: 700,
                  color: '#fff', letterSpacing: '0.06em', textTransform: 'uppercase',
                  lineHeight: 1.1,
                }}>{p.name}</div>
                <div style={{
                  marginTop: 4, fontSize: 11, lineHeight: 1.3,
                  color: 'rgba(255,255,255,0.55)',
                }}>{p.tag}</div>
              </div>
            </div>

            {/* Sub-items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(8px, 0.7vw, 12px)', flex: 1 }}>
              {p.items.map((it, j) => (
                <div key={j} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 6,
                    background: 'rgba(62,79,224,0.15)',
                    border: '1px solid rgba(124,137,239,0.32)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'rgba(189,195,246,0.95)', fontSize: 11, fontWeight: 600,
                    flexShrink: 0, marginTop: 2,
                  }}>{['◇', '◈', '◉', '✦'][i]}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 'clamp(11.5px, 0.95vw, 14.5px)', fontWeight: 600,
                      color: '#fff', lineHeight: 1.25, letterSpacing: '-0.1px',
                    }}>{it.t}</div>
                    <div style={{
                      marginTop: 2,
                      fontSize: 'clamp(10.5px, 0.85vw, 13px)',
                      color: 'rgba(255,255,255,0.55)', lineHeight: 1.4,
                    }}>{it.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Payments Concierge teaser — bottom row */}
      <div className="anim-in anim-in-8" style={{
        position: 'absolute', bottom: 70, left: 80, right: 80,
        padding: 'clamp(14px, 1.2vw, 22px) clamp(20px, 1.8vw, 32px)',
        background: 'rgba(62,79,224,0.10)',
        border: '1px solid rgba(124,137,239,0.30)',
        borderRadius: 14,
        display: 'grid', gridTemplateColumns: '1fr 1.2fr',
        gap: 'clamp(20px, 2vw, 40px)', alignItems: 'center',
      }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '4px 10px', borderRadius: 999,
            background: 'rgba(62,79,224,0.18)',
            border: '1px solid rgba(124,137,239,0.40)',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
            color: 'rgba(189,195,246,0.95)', marginBottom: 10,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: '#E0ED80',
              animation: 'splitPulse 1.8s ease-in-out infinite',
            }} />
            AI · live
          </div>
          <div style={{
            fontFamily: 'Titillium Web, sans-serif',
            fontSize: 'clamp(18px, 1.5vw, 26px)', fontWeight: 700,
            color: '#fff', letterSpacing: '-0.3px', marginBottom: 4,
          }}>Payments Concierge</div>
          <div style={{
            fontSize: 'clamp(11px, 0.95vw, 14px)',
            color: 'rgba(255,255,255,0.65)', lineHeight: 1.5,
          }}>
            Copiloto en lenguaje natural para operaciones de pagos. Preguntá
            cualquier cosa, recibí decisiones — no solo dashboards.
          </div>
        </div>

        {/* Mini chat mock */}
        <div style={{
          background: 'rgba(0,0,0,0.40)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 12,
          padding: 'clamp(10px, 0.9vw, 14px) clamp(12px, 1.1vw, 18px)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(255,255,255,0.18)' }} />
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(255,255,255,0.18)' }} />
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(255,255,255,0.18)' }} />
            </span>
            <span style={{ width: 16, height: 16, borderRadius: 4, background: 'rgba(62,79,224,0.30)', border: '1px solid rgba(124,137,239,0.40)' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.78)' }}>Payments Concierge</span>
          </div>

          <div style={{
            alignSelf: 'flex-end',
            padding: '8px 14px', borderRadius: 14,
            borderBottomRightRadius: 4,
            background: 'var(--yuno-blue)',
            color: '#fff', fontSize: 12, fontWeight: 500,
            maxWidth: '78%',
            animation: 'fadeInUp 0.7s ease-out 1.2s both',
          }}>
            ¿Por qué cayó la aprobación en MX ayer?
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 18, height: 18, borderRadius: 4,
              background: 'linear-gradient(135deg, #3E4FE0, #1227AD)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 10, fontWeight: 700,
            }}>y</span>
            <span className="mono" style={{
              display: 'inline-flex', gap: 4,
              animation: 'fadeInUp 0.7s ease-out 2.0s both',
            }}>
              <Dot delay="0s"   /> <Dot delay="0.2s" /> <Dot delay="0.4s" />
            </span>
          </div>
        </div>
      </div>

      <SlideFooter section="Qué es Yuno" pageNum={pageNum} total={total} logoColor="rgba(255,255,255,0.55)" />
    </div>
  )
}

function Dot({ delay }) {
  return (
    <span style={{
      width: 6, height: 6, borderRadius: '50%',
      background: 'rgba(189,195,246,0.85)',
      animation: `chatDot 1.2s ease-in-out ${delay} infinite`,
    }} />
  )
}
