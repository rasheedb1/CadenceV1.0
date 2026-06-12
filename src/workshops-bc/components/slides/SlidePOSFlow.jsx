// SlidePOSFlow — 5-step horizontal flow showing what happens when a
// payment goes through a Yuno-SDK-embedded BanCoppel terminal. Style
// adapted from the in-store payments reference deck: dark canvas,
// equal-width cards, chevron arrows between them, Yuno SDK card
// highlighted in solid yuno-blue. Six benefit pills along the bottom.

import { useEffect, useState } from 'react'
import { User, Smartphone, Zap, Landmark, Building2, CheckCircle2, TrendingDown, GitBranch, ShieldCheck, Database, FileCheck2 } from 'lucide-react'
import HalftoneBg from '../primitives/HalftoneBg'
import OrbHalftone from '../primitives/OrbHalftone'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'
import { tr } from '../../../lib/i18n'
import { STRINGS } from '../../lib/i18n'

const STEP_SHAPES = [
  { Icon: User,       titleKey: 'pos.flow.stepCustomer',  descKey: 'pos.flow.stepCustomerDesc' },
  { Icon: Smartphone, titleKey: 'pos.flow.stepTerminal',  descKey: 'pos.flow.stepTerminalDesc' },
  { Icon: Zap,        titleKey: 'pos.flow.stepSdk',       descKey: 'pos.flow.stepSdkDesc', highlight: true },
  { Icon: Landmark,   titleKey: 'pos.flow.stepAcquirer',  descKey: 'pos.flow.stepAcquirerDesc' },
  { Icon: Building2,  titleKey: 'pos.flow.stepSwitch',    descKey: 'pos.flow.stepSwitchDesc' },
]

const BENEFIT_SHAPES = [
  { Icon: GitBranch,     labelKey: 'pos.flow.benefitMultiAcq' },
  { Icon: TrendingDown,  labelKey: 'pos.flow.benefitCostRed' },
  { Icon: ShieldCheck,   labelKey: 'pos.flow.benefitNoSinglePSP' },
  { Icon: CheckCircle2,  labelKey: 'pos.flow.benefitStability' },
  { Icon: Database,      labelKey: 'pos.flow.benefitDataUnified' },
  { Icon: FileCheck2,    labelKey: 'pos.flow.benefitReconciliation' },
]

function StepCard({ step, anim, lang }) {
  const t = (path) => tr(STRINGS, lang, path)
  const { Icon, titleKey, descKey, highlight } = step
  const title = t(titleKey)
  const desc = t(descKey)
  return (
    <div className={anim} style={{
      flex: 1,
      minWidth: 0,
      padding: '32px 22px',
      borderRadius: 18,
      background: highlight
        ? 'linear-gradient(160deg, var(--yuno-blue) 0%, var(--yuno-blue-deep) 100%)'
        : 'rgba(255,255,255,0.04)',
      border: `1px solid ${highlight ? 'var(--yuno-blue-light)' : 'rgba(255,255,255,0.10)'}`,
      boxShadow: highlight
        ? '0 18px 50px rgba(62,79,224,0.40)'
        : '0 8px 22px rgba(40,42,48,0.18)',
      display: 'flex', flexDirection: 'column', gap: 18,
      animation: highlight ? 'posHighlightBreathe 2.8s ease-in-out infinite' : undefined,
    }}>
      <div style={{
        width: 70, height: 70, borderRadius: 14,
        background: highlight ? 'rgba(255,255,255,0.16)' : 'rgba(62,79,224,0.14)',
        border: `1px solid ${highlight ? 'rgba(255,255,255,0.30)' : 'rgba(62,79,224,0.40)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: highlight ? '#fff' : '#BDC3F6',
      }}>
        <Icon size={32} strokeWidth={1.6} />
      </div>
      <div>
        <div className="t-label" style={{
          color: highlight ? 'rgba(255,255,255,0.78)' : '#BDC3F6',
          fontSize: 11, letterSpacing: '0.16em', marginBottom: 10,
        }}>
          {title}
        </div>
        <div style={{
          fontSize: 16, lineHeight: 1.45,
          color: highlight ? '#fff' : 'rgba(255,255,255,0.78)',
        }}>{desc}</div>
      </div>
    </div>
  )
}

function Chevron({ live }) {
  // A bigger arrow-button between cards, mirrors the reference deck.
  return (
    <div style={{
      flexShrink: 0,
      width: 36, height: 36, borderRadius: '50%',
      background: live ? 'var(--yuno-blue)' : 'rgba(62,79,224,0.30)',
      border: `1px solid ${live ? 'var(--yuno-blue-light)' : 'rgba(62,79,224,0.40)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: 18, fontWeight: 700,
      boxShadow: live ? '0 4px 14px rgba(62,79,224,0.40)' : 'none',
    }}>›</div>
  )
}

function useChevronPulse() {
  // Drives a wave of "live" chevrons across the row every ~3.6s
  const [active, setActive] = useState(-1)
  useEffect(() => {
    let i = 0
    const tick = () => {
      setActive(i)
      i = (i + 1) % 6  // 4 chevrons + 2 idle steps to give it a beat
    }
    tick()
    const id = setInterval(tick, 600)
    return () => clearInterval(id)
  }, [])
  return active
}

export default function SlidePOSFlow({ data, pageNum, total, lang = 'es' }) {
  const t = (path) => tr(STRINGS, lang, path)
  const name = data?.CLIENT_NAME || t('pos.flow.defaultClient')
  const liveChevron = useChevronPulse()

  return (
    <div className="slide theme-dark">
      <style>{`
        @keyframes posHighlightBreathe {
          0%, 100% { box-shadow: 0 18px 50px rgba(62,79,224,0.40); }
          50%      { box-shadow: 0 22px 60px rgba(62,79,224,0.60), 0 0 0 6px rgba(62,79,224,0.10); }
        }
      `}</style>

      <HalftoneBg color="#3E4FE0" opacity={0.14} density={36} fadeDir="bottom" />
      <OrbHalftone size={800} x="10%" y="78%" color="#3E4FE0" style={{ opacity: 0.32 }} />

      <SectionLabel color="rgba(255,255,255,0.7)">{t('pos.flow.sectionLabel')}</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1500, color: '#fff',
      }}>
        {t('pos.flow.titleLead')}
        <br/>
        {t('pos.flow.titleConnector')} <span style={{ color: '#BDC3F6' }}>{t('pos.flow.titleAccent')}</span>
      </h2>

      <div className="anim-in anim-in-2" style={{
        position: 'absolute', top: 340, left: 80, maxWidth: 1300,
        fontSize: 18, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5,
      }}>
        {t('pos.flow.body').replace('{name}', name)}
      </div>

      {/* 5-step flow */}
      <div style={{
        position: 'absolute', top: 460, left: 80, right: 80,
        display: 'flex', alignItems: 'stretch', gap: 14,
      }}>
        {STEP_SHAPES.flatMap((s, i) => {
          const card = <StepCard key={`s-${i}`} step={s} anim={`anim-in anim-in-${i + 3}`} lang={lang} />
          if (i === STEP_SHAPES.length - 1) return [card]
          return [
            card,
            <div key={`c-${i}`} style={{ display: 'flex', alignItems: 'center' }}>
              <Chevron live={liveChevron === i} />
            </div>,
          ]
        })}
      </div>

      {/* Benefit pills */}
      <div className="anim-in anim-in-8" style={{
        position: 'absolute', bottom: 90, left: 80, right: 80,
        display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12,
      }}>
        {BENEFIT_SHAPES.map((b) => {
          const { Icon } = b
          const label = t(b.labelKey)
          return (
            <div key={b.labelKey} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 14px', borderRadius: 10,
              background: 'rgba(62,79,224,0.08)',
              border: '1px solid rgba(62,79,224,0.30)',
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: 7,
                background: 'rgba(62,79,224,0.14)',
                border: '1px solid rgba(62,79,224,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#BDC3F6', flexShrink: 0,
              }}>
                <Icon size={14} strokeWidth={1.8} />
              </span>
              <span style={{ fontSize: 12, color: '#fff', lineHeight: 1.3, fontWeight: 500 }}>
                {label}
              </span>
            </div>
          )
        })}
      </div>

      <SlideFooter section={t('pos.flow.footerSection')} pageNum={pageNum} total={total} logoColor="rgba(255,255,255,0.55)" />
    </div>
  )
}
