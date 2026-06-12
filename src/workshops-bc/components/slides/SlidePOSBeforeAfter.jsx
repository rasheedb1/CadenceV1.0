// SlidePOSBeforeAfter — top half: today's BanCoppel terminal flow.
// Bottom half: same flow with Yuno SDK in the middle, fanning out to
// multiple acquirers + switches. Light theme. Yuno-blue accents on the
// "after" half, gray-alt muted accents on the "before" half.
//
// Animations:
// - wave of chevrons walks left-to-right on each row (top row slow +
//   muted, bottom row fast + yuno-blue) so the eye reads flow direction
// - one of the 4 fanout acquirers is highlighted at a time, rotating
//   every ~900ms so the routing-decision behavior reads visually
// - one of the 2 switches is highlighted at a time, in sync with the
//   acquirer rotation
// - Yuno SDK card breathes via yunoFlowBreathe
// - both header strip dots pulse (bottom strong, top slow + muted)

import { useEffect, useState } from 'react'
import { Smartphone, Landmark, Building2 } from 'lucide-react'
import { SectionLabel, SlideFooter, YunoLogo } from '../primitives/Chrome'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

function FlowNode({ Icon, name, sub, variant = 'default', big = false }) {
  const styles = {
    default: {
      bg: '#fff',
      border: 'rgba(40,42,48,0.10)',
      shadow: '0 4px 14px rgba(40,42,48,0.06)',
      iconBg: 'rgba(40,42,48,0.06)',
      iconBd: 'rgba(40,42,48,0.12)',
      iconColor: 'var(--gray-alt)',
      titleColor: 'var(--unity-black)',
      subColor: 'var(--gray-alt)',
    },
    muted: {
      bg: '#fff',
      border: 'rgba(40,42,48,0.10)',
      shadow: 'none',
      iconBg: 'rgba(40,42,48,0.04)',
      iconBd: 'rgba(40,42,48,0.10)',
      iconColor: 'var(--gray-alt)',
      titleColor: 'var(--unity-black)',
      subColor: 'var(--gray-alt)',
    },
    primary: {
      bg: 'linear-gradient(135deg, var(--yuno-blue) 0%, var(--yuno-blue-deep) 100%)',
      border: 'var(--yuno-blue-deep)',
      shadow: '0 12px 36px rgba(62,79,224,0.30)',
      iconBg: 'rgba(255,255,255,0.16)',
      iconBd: 'rgba(255,255,255,0.30)',
      iconColor: '#fff',
      titleColor: '#fff',
      subColor: 'rgba(255,255,255,0.80)',
    },
    active: {
      bg: '#fff',
      border: 'var(--yuno-blue)',
      shadow: '0 8px 24px rgba(62,79,224,0.18)',
      iconBg: 'rgba(62,79,224,0.10)',
      iconBd: 'rgba(62,79,224,0.35)',
      iconColor: 'var(--yuno-blue)',
      titleColor: 'var(--unity-black)',
      subColor: 'var(--gray-alt)',
    },
  }
  const s = styles[variant]
  return (
    <div style={{
      flex: big ? '0 0 240px' : '0 0 200px',
      padding: '16px 18px',
      borderRadius: 14,
      background: s.bg,
      border: `1px solid ${s.border}`,
      boxShadow: s.shadow,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      position: 'relative', zIndex: 1,
    }}>
      {Icon && (
        <div style={{
          width: 42, height: 42, borderRadius: 10,
          background: s.iconBg, border: `1px solid ${s.iconBd}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: s.iconColor,
        }}>
          <Icon size={20} strokeWidth={1.8} />
        </div>
      )}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'Titillium Web', fontWeight: 700, fontSize: 16,
          color: s.titleColor, letterSpacing: '-0.02em', lineHeight: 1.15,
        }}>{name}</div>
        {sub && (
          <div className="num-tabular" style={{
            marginTop: 4, fontSize: 11,
            color: s.subColor,
            fontFamily: 'Geist Mono, ui-monospace, monospace',
          }}>{sub}</div>
        )}
      </div>
    </div>
  )
}

function YunoFlowNode() {
  return (
    <div style={{
      flex: '0 0 200px',
      padding: '16px 18px',
      borderRadius: 14,
      background: 'linear-gradient(135deg, var(--yuno-blue) 0%, var(--yuno-blue-deep) 100%)',
      border: '1px solid var(--yuno-blue-deep)',
      boxShadow: '0 12px 36px rgba(62,79,224,0.32)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      animation: 'yunoFlowBreathe 2.4s ease-in-out infinite',
      position: 'relative', zIndex: 2,
    }}>
      {/* Soft outer halo ring */}
      <span aria-hidden style={{
        position: 'absolute', inset: -10, borderRadius: 22,
        background: 'radial-gradient(circle at 50% 50%, rgba(62,79,224,0.35) 0%, rgba(62,79,224,0) 60%)',
        animation: 'yunoFlowHalo 2.4s ease-in-out infinite',
        zIndex: -1,
      }} />

      <div style={{
        width: 42, height: 42, borderRadius: 10,
        background: 'rgba(255,255,255,0.18)',
        border: '1px solid rgba(255,255,255,0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <YunoLogo size={18} color="#fff" />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'Titillium Web', fontWeight: 700, fontSize: 16,
          color: '#fff', letterSpacing: '-0.02em',
        }}>Yuno SDK</div>
        <div style={{
          marginTop: 4, fontSize: 11,
          color: 'rgba(255,255,255,0.80)',
          fontFamily: 'Geist Mono, ui-monospace, monospace',
        }}>orquestación · 1 punto</div>
      </div>
    </div>
  )
}

// Animated arrow — chevron + sliding 1px beam underneath. `live` makes
// the chevron blue + the beam pop; otherwise it's muted gray.
function AnimatedArrow({ live, beamDelay = '0s' }) {
  return (
    <div style={{
      position: 'relative',
      flexShrink: 0, padding: '0 8px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    }}>
      <span style={{
        fontSize: 28, fontWeight: 400,
        color: live ? 'var(--yuno-blue)' : 'rgba(40,42,48,0.30)',
        transition: 'color 0.35s ease, transform 0.35s ease',
        transform: live ? 'scale(1.18)' : 'scale(1)',
        filter: live ? 'drop-shadow(0 0 6px rgba(62,79,224,0.55))' : 'none',
        lineHeight: 1,
      }}>›</span>
      <div style={{
        width: 28, height: 2, borderRadius: 1, overflow: 'hidden',
        background: live ? 'rgba(62,79,224,0.12)' : 'rgba(40,42,48,0.06)',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '40%', height: '100%',
          background: live
            ? 'linear-gradient(90deg, transparent, var(--yuno-blue), transparent)'
            : 'linear-gradient(90deg, transparent, var(--gray-alt), transparent)',
          animation: `posBeamSlide ${live ? '1.4s' : '3.2s'} ease-in-out infinite`,
          animationDelay: beamDelay,
        }} />
      </div>
    </div>
  )
}

function FanoutPill({ label, active }) {
  return (
    <div style={{
      position: 'relative',
      padding: '10px 14px', borderRadius: 10,
      background: '#fff',
      border: `1px solid ${active ? '#9CB22A' : 'rgba(62,79,224,0.35)'}`,
      fontFamily: 'Titillium Web', fontSize: 14, fontWeight: 700,
      color: 'var(--unity-black)', letterSpacing: '-0.01em',
      boxShadow: active
        ? '0 4px 16px rgba(224,237,128,0.45), 0 0 0 3px rgba(224,237,128,0.20)'
        : '0 4px 12px rgba(62,79,224,0.10)',
      textAlign: 'center',
      transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
    }}>
      {active && (
        <span aria-hidden style={{
          position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
          width: 5, height: 5, borderRadius: '50%',
          background: '#9CB22A',
          animation: 'splitPulseWin 1.4s ease-in-out infinite',
        }} />
      )}
      {label}
    </div>
  )
}

// Rotates the "active" index across N items every `period` ms.
function useRotatingActive(n, period = 900) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % n), period)
    return () => clearInterval(id)
  }, [n, period])
  return i
}

// A wave that walks across N chevrons. Returns the index that's
// currently "live", or -1 when the wave is between cycles.
function useChevronWave(n, stepMs = 500, restMs = 1200) {
  const [active, setActive] = useState(0)
  useEffect(() => {
    let i = 0
    let timer
    const tick = () => {
      setActive(i)
      if (i < n - 1) {
        i++
        timer = setTimeout(tick, stepMs)
      } else {
        timer = setTimeout(() => {
          setActive(-1)
          timer = setTimeout(() => { i = 0; tick() }, 200)
        }, restMs)
      }
    }
    tick()
    return () => clearTimeout(timer)
  }, [n, stepMs, restMs])
  return active
}

// eslint-disable-next-line no-unused-vars
export default function SlidePOSBeforeAfter({ data, pageNum, total, lang = 'es' }) {
  const name = data?.CLIENT_NAME || 'BanCoppel'
  const ACQS = ['Getnet', 'BBVA', 'EVO', 'Banamex']
  const SWITCHES = ['Prosa', 'EGlobal']

  // Bottom row has 4 arrows; rotating wave across them
  const bottomChevron = useChevronWave(4, 450, 900)
  // Top row has 3 arrows; same wave, slower
  const topChevron = useChevronWave(3, 800, 2000)
  // Rotating active acquirer/switch in the fanout
  const activeAcq = useRotatingActive(ACQS.length, 900)
  // Switch active follows acquirer parity (Prosa for 0/2, EGlobal for 1/3)
  const activeSwitch = activeAcq % 2

  return (
    <div className="slide theme-light">
      <style>{`
        @keyframes yunoFlowBreathe {
          0%, 100% { box-shadow: 0 12px 36px rgba(62,79,224,0.32); }
          50%      { box-shadow: 0 18px 48px rgba(62,79,224,0.52), 0 0 0 6px rgba(62,79,224,0.10); }
        }
        @keyframes yunoFlowHalo {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.06); }
        }
        @keyframes posBeamSlide {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(300%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>

      <SectionLabel>POS · antes / con Yuno</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1500,
        color: 'var(--unity-black)',
      }}>
        Un solo SDK desbloquea
        <br/>
        <span style={{ color: 'var(--yuno-blue)' }}>multi-adquirencia en la terminal.</span>
      </h2>

      {/* ── BEFORE row ───────────────────────────────── */}
      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 380, left: 80, right: 80,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 999,
            background: 'rgba(40,42,48,0.05)',
            border: '1px solid rgba(40,42,48,0.15)',
            color: 'var(--gray-alt)', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%', background: 'var(--gray-alt)',
              animation: 'splitPulse 4s ease-in-out infinite',
            }} />
            hoy · single chain
          </span>
          <span style={{ fontSize: 13, color: 'var(--gray-alt)', fontStyle: 'italic' }}>
            la terminal solo puede hablarle a un adquirente
          </span>
        </div>
        <div style={{
          padding: 24, borderRadius: 14,
          background: 'rgba(40,42,48,0.03)',
          border: '1px solid rgba(40,42,48,0.10)',
          display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
        }}>
          <FlowNode Icon={Smartphone}  name={`Terminal ${name}`} sub="POS BanCoppel" variant="muted" />
          <AnimatedArrow live={topChevron === 0} beamDelay="0s" />
          <FlowNode Icon={Landmark}    name="BBVA"      sub="adquirente único" variant="muted" />
          <AnimatedArrow live={topChevron === 1} beamDelay="0.4s" />
          <FlowNode Icon={Building2}   name="EGlobal"   sub="switch BBVA"      variant="muted" />
          <AnimatedArrow live={topChevron === 2} beamDelay="0.8s" />
          <FlowNode Icon={Building2}   name="Emisor"    sub="banco del cliente" variant="muted" />
        </div>
      </div>

      {/* ── AFTER row ────────────────────────────────── */}
      <div className="anim-in anim-in-3" style={{
        position: 'absolute', top: 660, left: 80, right: 80,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 999,
            background: 'rgba(62,79,224,0.08)',
            border: '1px solid rgba(62,79,224,0.35)',
            color: 'var(--yuno-blue)', fontSize: 10, fontWeight: 700,
            letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%', background: 'var(--yuno-blue)',
              animation: 'splitPulseWin 1.4s ease-in-out infinite',
            }} />
            con Yuno · multi-adquirencia
          </span>
          <span style={{ fontSize: 13, color: 'var(--gray-alt)', fontStyle: 'italic' }}>
            un SDK · cualquier adquirente · cualquier switch
          </span>
        </div>
        <div style={{
          position: 'relative',
          padding: 24, borderRadius: 14,
          background: 'rgba(62,79,224,0.05)',
          border: '1px solid rgba(62,79,224,0.25)',
          display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
          overflow: 'hidden',
        }}>
          <FlowNode Icon={Smartphone} name={`Terminal ${name}`} sub="POS BanCoppel" variant="active" />
          <AnimatedArrow live={bottomChevron === 0} beamDelay="0s" />
          <YunoFlowNode />
          <AnimatedArrow live={bottomChevron === 1} beamDelay="0.15s" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ACQS.map((a, i) => (
              <FanoutPill key={a} label={a} active={activeAcq === i} />
            ))}
          </div>
          <AnimatedArrow live={bottomChevron === 2} beamDelay="0.30s" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SWITCHES.map((s, i) => (
              <FanoutPill key={s} label={s} active={activeSwitch === i} />
            ))}
          </div>
          <AnimatedArrow live={bottomChevron === 3} beamDelay="0.45s" />
          <FlowNode Icon={Building2} name="Emisor" sub="banco del cliente" />
        </div>
      </div>

      <SlideFooter section="Orquestación POS" pageNum={pageNum} total={total} />
    </div>
  )
}
