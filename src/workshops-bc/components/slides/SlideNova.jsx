import { TrendingUp, LifeBuoy, LineChart } from 'lucide-react'
import HalftoneBg from '../primitives/HalftoneBg'
import OrbHalftone from '../primitives/OrbHalftone'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

const CAPABILITY_ICONS = [TrendingUp, LifeBuoy, LineChart]
const CAPABILITY_KEYS = [
  { titleKey: 'nova.capRevenueTitle',  bodyKey: 'nova.capRevenueBody'  },
  { titleKey: 'nova.capSupportTitle',  bodyKey: 'nova.capSupportBody'  },
  { titleKey: 'nova.capInsightsTitle', bodyKey: 'nova.capInsightsBody' },
]

const STAT_SHAPES = [
  { n: '75',   suf: '%', labelKey: 'nova.statRecoveredLabel' },
  { n: '70',   suf: '+', labelKey: 'nova.statLanguagesLabel' },
  { n: '200',  suf: '+', labelKey: 'nova.statCountriesLabel' },
  { n: '24/7', suf: '',  labelKey: 'nova.statAlwaysOnLabel' },
  { n: '0',    suf: '',  labelKey: 'nova.statNoDevLabel' },
]

function Bubble({ side, text }) {
  if (side === 'result') {
    return (
      <div style={{
        alignSelf: 'center', padding: '8px 16px', borderRadius: 999,
        background: 'rgba(224,237,128,0.15)', border: '1px solid rgba(224,237,128,0.45)',
        color: '#E0ED80', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
      }}>{text}</div>
    )
  }
  const isUser = side === 'user'
  return (
    <div style={{
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      maxWidth: '85%',
      padding: '12px 16px', borderRadius: 14,
      background: isUser ? 'var(--yuno-blue)' : 'rgba(255,255,255,0.10)',
      color: '#fff', fontSize: 14, lineHeight: 1.45,
      borderBottomRightRadius: isUser ? 4 : 14,
      borderBottomLeftRadius: isUser ? 14 : 4,
    }}>{text}</div>
  )
}

function ChannelPill({ icon, label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 999,
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.14)',
      fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.78)',
    }}>
      <span aria-hidden style={{ fontSize: 11 }}>{icon}</span>
      {label}
    </span>
  )
}

export default function SlideNova({ data, pageNum, total, lang = 'es' }) {
  const t = (path) => tr(STRINGS, lang, path)
  const name = data?.CLIENT_NAME || t('nova.defaultClient')
  return (
    <div className="slide theme-dark">
      <HalftoneBg color="#3E4FE0" opacity={0.14} density={32} />
      <OrbHalftone size={760} x="88%" y="82%" color="#3E4FE0" style={{ opacity: 0.5 }} />

      <SectionLabel color="rgba(255,255,255,0.7)">{t('nova.sectionLabel')}</SectionLabel>

      {/* "Conoce a NOVA AI" pill — mirrors product.y.uno/nova hero */}
      <div className="anim-in anim-in-1" style={{
        position: 'absolute', top: 120, left: 80,
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '8px 16px', borderRadius: 999,
        background: 'rgba(124,137,239,0.10)',
        border: '1px solid rgba(124,137,239,0.35)',
        color: '#BDC3F6',
        fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
      }}>
        <span aria-hidden style={{ fontSize: 12, color: '#E0ED80' }}>✦</span>
        {t('nova.pillLabel')}
      </div>

      {/* Hero headline — NOVA web copy */}
      <h2 className="t-title t-title-m anim-in anim-in-2" style={{
        position: 'absolute', top: 178, left: 80, maxWidth: 1080, color: '#fff',
      }}>
        {t('nova.heroLead')}{' '}
        <span style={{ color: '#BDC3F6' }}>{t('nova.heroAccent1')}</span>
        <span style={{ color: 'rgba(255,255,255,0.55)' }}>{t('nova.heroDash')}</span>
        <span style={{ color: '#E0ED80' }}>{t('nova.heroAccent2')}</span>
      </h2>

      {/* Subhead — straight from NOVA hero subline */}
      <div className="anim-in anim-in-3" style={{
        position: 'absolute', top: 358, left: 80, maxWidth: 1060,
        fontSize: 19, lineHeight: 1.5, color: 'rgba(255,255,255,0.72)',
      }}>
        {t('nova.heroSubhead')}
      </div>

      {/* Three capability cards */}
      <div style={{
        position: 'absolute', top: 502, left: 80, width: 1100,
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20,
      }}>
        {CAPABILITY_KEYS.map((c, i) => {
          const Icon = CAPABILITY_ICONS[i]
          const title = t(c.titleKey)
          const desc = t(c.bodyKey)
          return (
            <div key={c.titleKey} className={`anim-in anim-in-${i + 4}`} style={{
              padding: 24,
              background: 'linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.35) 100%)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 16,
              minHeight: 230,
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'rgba(62,79,224,0.14)',
                border: '1px solid rgba(62,79,224,0.40)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#BDC3F6',
              }}>
                <Icon size={20} strokeWidth={1.8} />
              </div>
              <div className="t-title" style={{
                fontSize: 22, fontWeight: 500, color: '#fff', lineHeight: 1.15,
              }}>{title}</div>
              <div style={{
                fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,0.62)',
              }}>{desc}</div>
            </div>
          )
        })}
      </div>

      {/* Rappi · Benante quote — verified customer proof */}
      <div className="anim-in anim-in-7" style={{
        position: 'absolute', top: 768, left: 80, width: 1100,
        padding: '18px 22px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 18,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 8,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Titillium Web', fontWeight: 700, fontSize: 14, color: '#fff',
          letterSpacing: '-0.02em',
        }}>rappi</div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 15, lineHeight: 1.45, color: 'rgba(255,255,255,0.86)',
            fontStyle: 'italic',
          }}>
            {t('nova.rappiQuote')}
          </div>
          <div className="t-label" style={{
            marginTop: 6, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.14em',
          }}>
            {t('nova.rappiAttribution')}
          </div>
        </div>
      </div>

      {/* Right column — Conversation example */}
      <div className="anim-in anim-in-3" style={{
        position: 'absolute', top: 120, right: 80, width: 620, bottom: 110,
        padding: 28,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16,
        }}>
          <div className="t-label" style={{ color: '#E0ED80' }}>{t('nova.conversationExampleLabel')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <ChannelPill icon="💬" label={t('nova.chatChannelWhatsapp')} />
            <ChannelPill icon="📞" label={t('nova.chatChannelVoice')} />
          </div>
        </div>

        <div className="mono" style={{
          fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.14em',
          textTransform: 'uppercase', marginBottom: 14,
        }}>
          {t('nova.chatHeaderTagline')}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
          <Bubble side="nova" text={t('nova.chatNovaIntroTemplate').replace('{name}', name)} />
          <Bubble side="user" text={t('nova.chatUserAccept')} />
          <Bubble side="nova" text={t('nova.chatNovaConfirm')} />
          <Bubble side="result" text={t('nova.chatRecoveredPill')} />
          <Bubble side="user" text={t('nova.chatThanks')} />
        </div>

        <div style={{
          marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.10)',
          fontSize: 11.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5,
        }}>
          {t('nova.chatFooter')}
        </div>
      </div>

      {/* Bottom metrics strip — 5 pieces inline */}
      <div className="anim-in anim-in-8" style={{
        position: 'absolute', bottom: 70, left: 80, width: 1100,
        display: 'flex', alignItems: 'flex-end', gap: 28,
        paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.10)',
      }}>
        {STAT_SHAPES.map((s, i) => (
          <div key={i} style={{
            flex: i === STAT_SHAPES.length - 1 ? '1.4' : '1',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div className="t-number num-tabular" style={{
              fontSize: 32, fontWeight: 300, color: '#fff',
              lineHeight: 1, letterSpacing: '-0.03em',
            }}>
              {s.n}<span style={{ color: 'var(--yuno-blue-light)' }}>{s.suf}</span>
            </div>
            <div className="t-label" style={{
              fontSize: 10, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em',
            }}>{t(s.labelKey)}</div>
          </div>
        ))}
      </div>

      <SlideFooter section={t('nova.footerSection')} pageNum={pageNum} total={total} logoColor="rgba(255,255,255,0.55)" />
    </div>
  )
}
