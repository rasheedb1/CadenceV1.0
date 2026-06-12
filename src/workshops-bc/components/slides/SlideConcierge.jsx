import { useEffect, useState } from 'react'
import { Activity, Workflow, Receipt, BarChart3 } from 'lucide-react'
import HalftoneBg from '../primitives/HalftoneBg'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

// Payments Concierge — Yuno's autonomous AI agent for payment ops.
// Launched at HumanX 2026-04-06. Channels: Slack / WhatsApp / Telegram / WeChat.
// JP Ortega photo shared with SlideTeamLeaders for consistency.

const JP_PHOTO = '/ss-deck-assets/team/juan-pablo-ortega.png?v=2026-04-24-5'

const CHANNELS = ['Slack', 'WhatsApp', 'Telegram', 'WeChat']

const CAPABILITY_ICONS = [Activity, Workflow, Receipt, BarChart3]
const CAPABILITY_KEYS = [
  { titleKey: 'concierge.capAnomalyTitle',  bodyKey: 'concierge.capAnomalyBody'  },
  { titleKey: 'concierge.capOptimizeTitle', bodyKey: 'concierge.capOptimizeBody' },
  { titleKey: 'concierge.capCostsTitle',    bodyKey: 'concierge.capCostsBody'    },
  { titleKey: 'concierge.capReportsTitle',  bodyKey: 'concierge.capReportsBody'  },
]

// Live chat sequencing — each step pauses for `dwell` ms before the next.
// Total cycle ≈ 14.3s, then loops.
const CHAT_STEPS = [
  { dwell:  800 },  // 0 → 1: initial empty pause
  { dwell: 1400 },  // 1 → 2: user msg 1 visible briefly
  { dwell: 2200 },  // 2 → 3: bot typing dots
  { dwell: 3200 },  // 3 → 4: bot msg 1 (auth rates + reco) on screen
  { dwell: 1200 },  // 4 → 5: user msg 2 visible briefly
  { dwell: 1500 },  // 5 → 6: bot typing dots
  { dwell: 4000 },  // 6 → 0: final state held, then loop
]

function ChannelPill({ name }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 12px', borderRadius: 999,
      background: 'rgba(62,79,224,0.08)',
      border: '1px solid rgba(62,79,224,0.30)',
      fontSize: 11, fontWeight: 600, color: 'var(--yuno-blue)',
      letterSpacing: '0.04em',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: 'var(--yuno-blue)',
      }} />
      {name}
    </span>
  )
}

function ChatHeader({ name, lang }) {
  const t = (path) => tr(STRINGS, lang, path)
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: 18, position: 'relative',
    }}>
      <div className="mono" style={{
        fontSize: 11, color: 'rgba(255,255,255,0.55)',
        letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>
        {t('concierge.chatHeaderTemplate').replace('{name}', name.toLowerCase())}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 11, fontWeight: 600, color: '#E0ED80',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: '#E0ED80',
          animation: 'splitPulseWin 1.6s ease-in-out infinite',
        }} />
        {t('concierge.chatAlwaysOn')}
      </div>
    </div>
  )
}

function Avatar({ kind }) {
  if (kind === 'user') {
    return (
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em',
        flexShrink: 0,
      }}>R</div>
    )
  }
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 8,
      background: 'linear-gradient(135deg, var(--yuno-blue), var(--yuno-blue-deep))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>y</div>
  )
}

function ChatMsg({ kind, who, time, children }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '32px 1fr', gap: 12,
      animation: 'animIn 480ms cubic-bezier(.22,.8,.22,1) both',
    }}>
      <Avatar kind={kind} />
      <div>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4,
        }}>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: kind === 'user' ? '#fff' : '#BDC3F6',
          }}>{who}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{time}</span>
        </div>
        <div style={{
          fontSize: 13, color: 'rgba(255,255,255,0.88)', lineHeight: 1.5,
        }}>{children}</div>
      </div>
    </div>
  )
}

function TypingMsg() {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '32px 1fr', gap: 12,
      animation: 'animIn 280ms cubic-bezier(.22,.8,.22,1) both',
    }}>
      <Avatar kind="bot" />
      <div style={{
        alignSelf: 'center', display: 'inline-flex', alignItems: 'center',
        gap: 5, padding: '8px 12px', borderRadius: 12,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.10)',
        width: 'fit-content',
      }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'rgba(255,255,255,0.7)',
            animation: `chatDot 1.2s ease-in-out infinite`,
            animationDelay: `${i * 0.18}s`,
          }} />
        ))}
      </div>
    </div>
  )
}

function AuthRateBar({ name, rate, color = 'var(--yuno-blue)', delay = 0 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 10px', borderRadius: 8,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', minWidth: 72 }}>{name}</span>
      <div style={{
        flex: 1, height: 5, borderRadius: 3, overflow: 'hidden',
        background: 'rgba(255,255,255,0.10)',
      }}>
        <div style={{
          width: `${rate}%`, height: '100%', background: color,
          animation: `barFill 700ms cubic-bezier(.22,.8,.22,1) both`,
          animationDelay: `${delay}ms`,
          transformOrigin: 'left center',
        }} />
      </div>
      <span className="num-tabular" style={{
        fontSize: 11, fontWeight: 700, color: '#fff', minWidth: 32, textAlign: 'right',
      }}>{rate}%</span>
    </div>
  )
}

function useChatLoop() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => {
      setStep((s) => (s + 1) % CHAT_STEPS.length)
    }, CHAT_STEPS[step].dwell)
    return () => clearTimeout(t)
  }, [step])
  return step
}

export default function SlideConcierge({ data, pageNum, total, lang = 'es' }) {
  const t = (path) => tr(STRINGS, lang, path)
  const name = data?.CLIENT_NAME || 'cliente'
  const step = useChatLoop()
  // step semantics:
  //  0 = blank
  //  1 = user msg 1
  //  2 = + typing dots
  //  3 = + bot msg 1 (replaces typing)
  //  4 = + user msg 2
  //  5 = + typing dots 2
  //  6 = + bot msg 2 (replaces typing)

  return (
    <div className="slide theme-light">
      {/* Inline keyframe for the auth-rate bar fill */}
      <style>{`
        @keyframes barFill {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
      `}</style>

      <SectionLabel>{t('concierge.sectionLabel')}</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1100,
        color: 'var(--unity-black)',
      }}>
        {t('concierge.titleLead')}
        <br/>
        {t('concierge.titleConnector')} <span style={{ color: 'var(--yuno-blue)' }}>{t('concierge.titleChannels1')}</span>
        <br/>
        <span style={{ color: 'var(--yuno-blue)' }}>{t('concierge.titleChannels2')}</span>
      </h2>

      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 410, left: 80,
        display: 'flex', gap: 8, flexWrap: 'wrap',
      }}>
        {CHANNELS.map((c) => <ChannelPill key={c} name={c} />)}
      </div>

      <div className="anim-in anim-in-3" style={{
        position: 'absolute', top: 470, left: 80, fontSize: 17,
        color: 'var(--gray-alt)', maxWidth: 1080, lineHeight: 1.5,
      }}>
        {t('concierge.body')}
      </div>

      {/* 4 capability cards — 1×4 row with lucide icons in Yuno-blue */}
      <div style={{
        position: 'absolute', top: 580, left: 80, width: 1100,
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14,
      }}>
        {CAPABILITY_KEYS.map((c, i) => {
          const Icon = CAPABILITY_ICONS[i]
          const title = t(c.titleKey)
          const desc = t(c.bodyKey)
          return (
            <div key={c.titleKey} className={`anim-in anim-in-${i + 4}`} style={{
              padding: 18, background: 'var(--harmony-lilac)', borderRadius: 12,
              minHeight: 160,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'rgba(62,79,224,0.10)',
                border: '1px solid rgba(62,79,224,0.30)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--yuno-blue)', marginBottom: 12,
              }}>
                <Icon size={18} strokeWidth={2} />
              </div>
              <div style={{
                fontSize: 14, fontWeight: 600, color: 'var(--unity-black)',
                marginBottom: 6,
              }}>{title}</div>
              <div style={{
                fontSize: 12, color: 'var(--gray-alt)', lineHeight: 1.5,
              }}>{desc}</div>
            </div>
          )
        })}
      </div>

      {/* JP Ortega quote — CEO of Yuno (real photo from team set) */}
      <div className="anim-in anim-in-8" style={{
        position: 'absolute', bottom: 90, left: 80, width: 1100,
        padding: '16px 22px',
        background: 'rgba(40,42,48,0.04)',
        border: '1px solid rgba(40,42,48,0.10)',
        borderRadius: 10,
        display: 'flex', alignItems: 'center', gap: 18,
      }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <img
            src={JP_PHOTO}
            alt="Juan Pablo Ortega"
            style={{
              width: 56, height: 56, borderRadius: '50%',
              objectFit: 'cover', display: 'block',
              background: 'rgba(62,79,224,0.10)',
            }}
          />
          <span aria-hidden style={{
            position: 'absolute', inset: -2, borderRadius: '50%',
            padding: 2,
            background: 'linear-gradient(135deg, #3E4FE0 0%, #5967E4 55%, #BDC3F6 100%)',
            WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
            pointerEvents: 'none',
          }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 13.5, lineHeight: 1.45, color: 'var(--unity-black)',
            fontStyle: 'italic',
          }}>
            {t('concierge.jpQuote')}
          </div>
          <div className="t-label" style={{
            marginTop: 5, color: 'var(--gray-alt)', letterSpacing: '0.14em', fontSize: 10,
          }}>
            {t('concierge.jpAttribution')}
          </div>
        </div>
      </div>

      {/* Right column — Live Slack chat with looping animation */}
      <div className="anim-in anim-in-3" style={{
        position: 'absolute', top: 130, right: 80, width: 620, bottom: 90,
        padding: 26, background: 'var(--unity-black)', borderRadius: 18,
        color: '#fff', overflow: 'hidden',
      }}>
        <HalftoneBg color="#3E4FE0" opacity={0.10} density={28} fadeDir="bottom" />
        <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <ChatHeader name={name} lang={lang} />

          <div style={{
            display: 'flex', flexDirection: 'column', gap: 14, flex: 1,
            overflow: 'hidden',
          }}>
            {/* 1. User asks (step >= 1) */}
            {step >= 1 && (
              <ChatMsg kind="user" who={t('concierge.chatUserName')} time={t('concierge.chatUserTimestamp1')}>
                {t('concierge.chatUserQ1')}
              </ChatMsg>
            )}

            {/* 2. Bot typing (step === 2 only — replaced by msg 1 at step 3) */}
            {step === 2 && <TypingMsg />}

            {/* 3. Bot msg 1: auth rates + recommendation (step >= 3) */}
            {step >= 3 && (
              <ChatMsg kind="bot" who={t('concierge.chatBotName')} time={t('concierge.chatUserTimestamp1')}>
                <div style={{ marginBottom: 10 }}>
                  {t('concierge.chatBotAuthLead')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  <AuthRateBar name="Evo"        rate={82} color="#FB923C" delay={120} />
                  <AuthRateBar name="BBVA"       rate={83} color="var(--yuno-blue-light)" delay={260} />
                  <AuthRateBar name="Evo + BBVA" rate={86} color="#E0ED80" delay={400} />
                </div>
                <div style={{ color: 'rgba(255,255,255,0.78)' }}>
                  {t('concierge.chatBotReco')} <strong style={{ color: '#fff' }}>{t('concierge.chatBotRecoBold')}</strong>{' '}
                  {t('concierge.chatBotRecoTail')}{' '}
                  <strong style={{ color: '#E0ED80' }}>{t('concierge.chatBotRecoUplift')}</strong> {t('concierge.chatBotRecoClose')}
                </div>
              </ChatMsg>
            )}

            {/* 4. User approves (step >= 4) */}
            {step >= 4 && (
              <ChatMsg kind="user" who={t('concierge.chatUserName')} time={t('concierge.chatUserTimestamp2')}>
                {t('concierge.chatUserQ2')}
              </ChatMsg>
            )}

            {/* 5. Bot typing (step === 5 only) */}
            {step === 5 && <TypingMsg />}

            {/* 6. Bot final confirmation (step >= 6) */}
            {step >= 6 && (
              <ChatMsg kind="bot" who={t('concierge.chatBotName')} time={t('concierge.chatUserTimestamp2')}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '4px 10px', borderRadius: 999,
                  background: 'rgba(224,237,128,0.15)',
                  border: '1px solid rgba(224,237,128,0.45)',
                  color: '#E0ED80', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  marginBottom: 8,
                }}>
                  <span>✓</span> {t('concierge.chatBotApplied')}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {t('concierge.chatBotAppliedDetail')}{' '}
                  <strong style={{ color: '#E0ED80' }}>86%</strong>{t('concierge.chatBotAppliedTail')}
                </div>
              </ChatMsg>
            )}
          </div>

          <div style={{
            marginTop: 14, paddingTop: 12,
            borderTop: '1px solid rgba(255,255,255,0.10)',
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 11, color: 'rgba(255,255,255,0.45)',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.35)',
            }} />
            {t('concierge.chatAudit')}
          </div>
        </div>
      </div>

      <SlideFooter section={t('concierge.footerSection')} pageNum={pageNum} total={total} />
    </div>
  )
}
