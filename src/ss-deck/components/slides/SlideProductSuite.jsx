import { useState } from 'react'
import {
  ArrowsCounterClockwise,
  ArrowsLeftRight,
  ArrowsSplit,
  ChartLineUp,
  CreditCard,
  DeviceMobile,
  Repeat,
  ShareNetwork,
  ShieldCheck,
  SlidersHorizontal,
  Waveform,
} from '@phosphor-icons/react'
import SlideBase from './SlideBase'
import BeamRule from '../BeamRule'
import { useTheme } from '../../lib/theme'
import { getCopy } from '../../lib/copy'

// Phosphor Icons, bold weight — single source of truth across the deck so
// every slide renders glyphs with the same stroke and rounding.
const ICONS = {
  orchestration:  ShareNetwork,
  smartRouting:   ArrowsSplit,
  monitor:        Waveform,
  customize:      SlidersHorizontal,
  subscription:   Repeat,
  mobile:         DeviceMobile,
  tokens:         CreditCard,
  auth:           ShieldCheck,
  accountUpdater: ArrowsCounterClockwise,
  reconciliation: ArrowsLeftRight,
  chart:          ChartLineUp,
}

function Icon({ name, size = 22, style }) {
  const Glyph = ICONS[name]
  if (!Glyph) return null
  return <Glyph size={size} weight="regular" style={style} aria-hidden />
}

const PLATFORM_STATS = [
  { n: '460+', l: 'Integrations' },
  { n: '190+', l: 'Countries' },
  { n: '1,000+', l: 'Methods' },
  { n: '180+', l: 'Currencies' },
]

const PILLARS = [
  {
    name: 'Orchestration',
    tagline: 'Route & recover',
    color: '#3E4FE0',
    soft: 'rgba(62,79,224,0.12)',
    border: 'rgba(62,79,224,0.3)',
    items: [
      { title: 'Orchestration engine',    desc: 'Every provider, one control plane.', icon: 'orchestration' },
      { title: 'Smart routing',           desc: 'Per-transaction decisioning.',       icon: 'smartRouting'  },
      { title: 'Monitors & auto-failover', desc: 'Checkout stays live, always.',      icon: 'monitor'       },
    ],
  },
  {
    name: 'Checkout & SDKs',
    tagline: 'Convert everywhere',
    color: '#5967E4',
    soft: 'rgba(89,103,228,0.12)',
    border: 'rgba(89,103,228,0.3)',
    items: [
      { title: 'Customizable checkout',    desc: 'Local methods, native feel.',            icon: 'customize'    },
      { title: 'Subscription management',  desc: 'Recurring, with less engineering.',      icon: 'subscription' },
      { title: 'Mobile SDKs',              desc: 'One interface, iOS + Android.',          icon: 'mobile'       },
    ],
  },
  {
    name: 'Security & Risk',
    tagline: 'Protect every card',
    color: '#5967E4',
    soft: 'rgba(89,103,228,0.12)',
    border: 'rgba(89,103,228,0.3)',
    items: [
      { title: 'PCI Vault Tokenization', desc: 'Stay valid across networks.', icon: 'tokens'      },
      { title: '3DS authentication', desc: 'Reduce fraud, lift auth.',    icon: 'auth'           },
      { title: 'Account updater',   desc: 'Credentials always fresh.',    icon: 'accountUpdater' },
    ],
  },
]

const AI_PILLAR = {
  name: 'AI & Intelligence',
  tagline: 'The brain',
  color: '#BDC3F6',
  soft: 'rgba(124,137,239,0.12)',
  border: 'rgba(124,137,239,0.35)',
  items: [
    { title: 'Analytics',      desc: 'Fees, FX, approvals. Decision-ready.', icon: 'chart'          },
    { title: 'Reconciliation', desc: 'One ledger across every PSP.',          icon: 'reconciliation' },
  ],
}

function PillarHeader({ pillar, index, styles }) {
  const num = String(index + 1).padStart(2, '0')
  return (
    <div
      style={{
        ...styles.pillarHead,
        background: pillar.soft,
        border: `1px solid ${pillar.border}`,
      }}
    >
      <span style={{ ...styles.pillarNumber, color: pillar.color }}>{num}</span>
      <div style={styles.pillarMeta}>
        <span style={styles.pillarName}>{pillar.name}</span>
        <span style={styles.pillarTagline}>{pillar.tagline}</span>
      </div>
    </div>
  )
}

function PillarItem({ item, color, soft, border, styles, theme }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      style={{
        ...styles.item,
        background: hover ? (theme.isLight ? theme.surface0 : 'rgba(255,255,255,0.015)') : 'transparent',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        style={{
          ...styles.itemIconWrap,
          background: hover ? soft : (theme.isLight ? theme.surface1 : 'rgba(255,255,255,0.04)'),
          border: hover ? `1px solid ${border}` : `1px solid ${theme.borderSubtle}`,
          color: hover ? color : theme.inkSecondary,
        }}
      >
        <Icon name={item.icon} size="62%" stroke={1.7} />
      </div>
      <div style={styles.itemBody}>
        <span style={styles.itemTitle}>{item.title}</span>
        <p style={styles.itemDesc}>{item.desc}</p>
      </div>
    </div>
  )
}

function PaymentsConciergeHero({ styles, theme, t }) {
  return (
    <div style={styles.heroCard}>
      <div style={styles.heroHeader}>
        <div style={styles.heroDots}>
          <div style={{ ...styles.heroDot, background: 'rgba(124,137,239,0.35)' }} />
          <div style={{ ...styles.heroDot, background: 'rgba(124,137,239,0.55)' }} />
          <div style={{ ...styles.heroDot, background: '#5967E4' }} />
        </div>
        <div style={styles.heroHeaderLabel}>
          <img
            src="/ss-deck-assets/logos/pc-logomark.svg"
            alt=""
            style={{
              ...styles.heroHeaderMark,
              filter: theme.isLight ? 'none' : 'brightness(0) invert(1)',
            }}
          />
          <span style={styles.heroHeaderText}>{t ? t('productSuite.pc_title') : 'Payments Concierge'}</span>
        </div>
      </div>

      <div style={styles.heroBody}>
        <div data-pc-row="user" style={styles.heroUserRow}>
          <div style={styles.heroUserBubble}>
            {t ? t('productSuite.pc_user_msg') : 'Why did EU auth rate drop yesterday?'}
          </div>
        </div>

        <div
          data-pc-row="typing-1"
          style={{
            ...styles.heroAiRow,
            animation: 'pcTyping 14s ease-in-out infinite',
          }}
        >
          <div style={styles.heroAvatar}>
            <img
              src="/ss-deck-assets/logos/pc-logomark.svg"
              alt=""
              style={{
                ...styles.heroAvatarMark,
                filter: theme.isLight ? 'none' : 'brightness(0) invert(1)',
              }}
            />
          </div>
          <div style={styles.heroTypingBubble}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  ...styles.heroTypingDot,
                  animation: `pcTypingDot 1.1s ease-in-out ${i * 0.15}s infinite`,
                }}
              />
            ))}
          </div>
        </div>

        <div
          data-pc-row="ai-1"
          style={{
            ...styles.heroAiRow,
            position: 'absolute',
            left: 'clamp(11px, 0.95vw, 14px)',
            right: 'clamp(11px, 0.95vw, 14px)',
            bottom: 'clamp(10px, 0.9vw, 14px)',
            animation: 'pcAiBubble 14s ease-in-out infinite',
          }}
        >
          <div style={styles.heroAvatar}>
            <img
              src="/ss-deck-assets/logos/pc-logomark.svg"
              alt=""
              style={{
                ...styles.heroAvatarMark,
                filter: theme.isLight ? 'none' : 'brightness(0) invert(1)',
              }}
            />
          </div>
          <div style={styles.heroAiBubble}>
            <span style={styles.heroAiBubbleAccent}>−1.8pp</span> {t ? t('productSuite.pc_ai_pre') : 'vs 7-day avg. Driver:'}
            {' '}<span style={styles.heroAiBubbleAccent}>{t ? t('productSuite.pc_ai_driver') : '3DS challenge spike'}</span>{' '}
            {t ? t('productSuite.pc_ai_post') : 'on Visa EU.'}
          </div>
        </div>

        {/* Second turn — typing #2 + AI #2 share the same absolute
            bottom slot as AI #1, cycling in sequence within the same
            container footprint. */}
        <div
          data-pc-row="typing-2"
          style={{
            ...styles.heroAiRow,
            position: 'absolute',
            left: 'clamp(11px, 0.95vw, 14px)',
            right: 'clamp(11px, 0.95vw, 14px)',
            bottom: 'clamp(10px, 0.9vw, 14px)',
            animation: 'pcTyping2 14s ease-in-out infinite',
          }}
        >
          <div style={styles.heroAvatar}>
            <img
              src="/ss-deck-assets/logos/pc-logomark.svg"
              alt=""
              style={{
                ...styles.heroAvatarMark,
                filter: theme.isLight ? 'none' : 'brightness(0) invert(1)',
              }}
            />
          </div>
          <div style={styles.heroTypingBubble}>
            {[0, 1, 2].map((i) => (
              <div
                key={`t2-${i}`}
                style={{
                  ...styles.heroTypingDot,
                  animation: `pcTypingDot 1.1s ease-in-out ${i * 0.15}s infinite`,
                }}
              />
            ))}
          </div>
        </div>

        <div
          data-pc-row="ai-2"
          style={{
            ...styles.heroAiRow,
            position: 'absolute',
            left: 'clamp(11px, 0.95vw, 14px)',
            right: 'clamp(11px, 0.95vw, 14px)',
            bottom: 'clamp(10px, 0.9vw, 14px)',
            animation: 'pcAiBubble2 14s ease-in-out infinite',
          }}
        >
          <div style={styles.heroAvatar}>
            <img
              src="/ss-deck-assets/logos/pc-logomark.svg"
              alt=""
              style={{
                ...styles.heroAvatarMark,
                filter: theme.isLight ? 'none' : 'brightness(0) invert(1)',
              }}
            />
          </div>
          <div style={styles.heroAiBubble}>
            {t ? t('productSuite.pc_ai_recommend') : 'Want me to recommend some actions to take?'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SlideProductSuite({ data }) {
  const theme = useTheme()
  const lang = data?.LANGUAGE || 'en'
  const t = (key) => getCopy(lang, key)
  // Localized pillar + stat lookup. Keys reference src/ss-deck/lib/copy.js;
  // the static PILLARS / AI_PILLAR / PLATFORM_STATS constants up top stay
  // for their non-text fields (colors, soft/border tokens, icon names) and
  // we substitute the visible strings via these maps so layout is unchanged.
  const tStats = [
    { n: '460+',   l: t('productSuite.stat_integrations') },
    { n: '190+',   l: t('productSuite.stat_countries') },
    { n: '1,000+', l: t('productSuite.stat_methods') },
    { n: '180+',   l: t('productSuite.stat_currencies') },
  ]
  const pillarText = {
    Orchestration:     { name: t('productSuite.pillar_orchestration_name'), tagline: t('productSuite.pillar_orchestration_tag') },
    'Checkout & SDKs': { name: t('productSuite.pillar_checkout_name'),       tagline: t('productSuite.pillar_checkout_tag') },
    'Security & Risk': { name: t('productSuite.pillar_security_name'),       tagline: t('productSuite.pillar_security_tag') },
    'AI & Intelligence': { name: t('productSuite.pillar_ai_name'),           tagline: t('productSuite.pillar_ai_tag') },
  }
  // Map original item titles (used as React keys) to localized {title,desc}.
  const itemText = {
    'Orchestration engine':    { title: t('productSuite.item_orchestration_engine'),    desc: t('productSuite.item_orchestration_engine_desc') },
    'Smart routing':           { title: t('productSuite.item_smart_routing'),           desc: t('productSuite.item_smart_routing_desc') },
    'Monitors & auto-failover': { title: t('productSuite.item_monitors'),               desc: t('productSuite.item_monitors_desc') },
    'Customizable checkout':   { title: t('productSuite.item_customizable_checkout'),   desc: t('productSuite.item_customizable_checkout_desc') },
    'Subscription management': { title: t('productSuite.item_subscription'),            desc: t('productSuite.item_subscription_desc') },
    'Mobile SDKs':             { title: t('productSuite.item_mobile_sdk'),              desc: t('productSuite.item_mobile_sdk_desc') },
    'PCI Vault Tokenization':  { title: t('productSuite.item_pci_vault'),               desc: t('productSuite.item_pci_vault_desc') },
    '3DS authentication':      { title: t('productSuite.item_3ds'),                     desc: t('productSuite.item_3ds_desc') },
    'Account updater':         { title: t('productSuite.item_account_updater'),         desc: t('productSuite.item_account_updater_desc') },
    'Analytics':               { title: t('productSuite.item_analytics'),               desc: t('productSuite.item_analytics_desc') },
    'Reconciliation':          { title: t('productSuite.item_reconciliation'),          desc: t('productSuite.item_reconciliation_desc') },
  }
  const localize = (pillar) => ({
    ...pillar,
    name: pillarText[pillar.name]?.name ?? pillar.name,
    tagline: pillarText[pillar.name]?.tagline ?? pillar.tagline,
    items: pillar.items.map((it) => ({
      ...it,
      title: itemText[it.title]?.title ?? it.title,
      desc: itemText[it.title]?.desc ?? it.desc,
    })),
  })
  const tPillars = PILLARS.map(localize)
  const tAiPillar = localize(AI_PILLAR)

  const styles = {
    body: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(14px, 1.3vw, 24px)',
      minHeight: 0,
      position: 'relative',
    },
    // Chevron cascade lives in its own row between the pillar grid and
    // the Payments Concierge card, so its distance from the AI column's
    // last item and from the Concierge box can be tuned independently.
    // Same 4-column template as the grid above so the arrow sits exactly
    // under the AI pillar.
    aiArrowRow: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 'clamp(14px, 1.3vw, 26px)',
      marginTop: 'clamp(90px, 7vw, 140px)',
      marginBottom: 'clamp(36px, 3vw, 60px)',
      pointerEvents: 'none',
    },
    aiArrow: {
      gridColumn: '4 / 5',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      // Visual-only nudge down so the cascade lands just above the
      // Payments Concierge card instead of crossing the Reconciliation
      // card. Layout math of the surrounding flex column stays
      // unchanged — transform doesn't affect sibling positions.
      transform: 'translateY(clamp(44px, 3.6vw, 72px))',
    },
    aiArrowSvg: {
      width: '100%',
      height: 'auto',
      display: 'block',
    },
    titleRow: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 'clamp(20px, 2vw, 40px)',
      marginBottom: 'clamp(16px, 1.6vw, 32px)',
    },
    title: {
      fontFamily: 'var(--font-display)',
      // Matches slides 6/7 — deck-wide title reference size. May wrap.
      fontSize: 'clamp(28px, 2.7vw, 52px)',
      fontWeight: 500,
      letterSpacing: '-1.2px',
      lineHeight: 1.1,
      color: theme.ink,
      margin: 0,
      maxWidth: '100%',
    },
    titleAccent: {
      backgroundImage: theme.isLight
        ? `linear-gradient(135deg, ${theme.accentDeep} 0%, ${theme.accent} 100%)`
        : 'linear-gradient(135deg, #5967E4 0%, #BDC3F6 55%, #3E4FE0 100%)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      color: 'transparent',
    },
    subtitle: {
      fontSize: 'clamp(15px, 1.12vw, 20px)',
      fontWeight: 400,
      color: theme.inkSecondary,
      lineHeight: 1.55,
      maxWidth: 'clamp(280px, 28vw, 460px)',
      textAlign: 'right',
    },

    // Techie mono kicker — describes the visual below, reinforces the
    // developer/coding aesthetic without competing with the title.
    monoKicker: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'clamp(11px, 0.85vw, 14px)',
      fontWeight: 500,
      letterSpacing: '0.4px',
      color: theme.inkMuted,
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    },
    monoKickerCaret: {
      color: theme.isLight ? theme.accent : 'rgba(124,137,239,0.9)',
    },
    monoKickerRule: {
      flex: 1,
      height: '1px',
      background: theme.beamBase,
    },

    // ---------- Scale strip: thin row of 4 platform stats carried over
    // from the old About Yuno slide, sits above the pillars grid.
    statsStrip: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 'clamp(12px, 1.1vw, 20px)',
    },
    statCard: {
      background: theme.isLight
        ? '#FFFFFF'
        : 'linear-gradient(135deg, rgba(62,79,224,0.14) 0%, rgba(62,79,224,0.05) 100%)',
      border: theme.isLight
        ? `1px solid ${theme.borderDefault}`
        : '1px solid rgba(62,79,224,0.22)',
      borderRadius: '14px',
      padding: 'clamp(16px, 1.5vw, 28px) clamp(18px, 1.6vw, 32px)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      boxShadow: theme.cardShadow,
    },
    statNumber: {
      fontFamily: 'var(--font-display)',
      fontSize: 'clamp(34px, 3.2vw, 60px)',
      fontWeight: 800,
      letterSpacing: '-1px',
      lineHeight: 1.05,
      fontVariantNumeric: 'tabular-nums',
      background: `linear-gradient(135deg, ${theme.accentDeep} 0%, ${theme.accent} 100%)`,
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
    },
    statLabel: {
      fontSize: 'clamp(10.5px, 0.8vw, 13px)',
      fontWeight: 600,
      color: theme.inkSecondary,
      letterSpacing: '1.5px',
      textTransform: 'uppercase',
    },

    // ---------- Grid ----------
    grid: {
      flex: 1,
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 'clamp(14px, 1.3vw, 26px)',
      minHeight: 0,
    },
    column: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(8px, 0.75vw, 14px)',
      minHeight: 0,
      position: 'relative',
    },

    // ---------- Pillar header - numbered kicker replaces the old icon box.
    // "01 · Orchestration" reinforces the "four pillars" framing and the
    // developer/mono aesthetic already used in `> payment_lifecycle`.
    pillarHead: {
      display: 'flex',
      alignItems: 'center',
      gap: 'clamp(12px, 1.05vw, 16px)',
      padding: 'clamp(16px, 1.4vw, 22px) clamp(18px, 1.6vw, 28px)',
      borderRadius: '12px',
      position: 'relative',
      overflow: 'hidden',
    },
    pillarNumber: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'clamp(13px, 1.05vw, 17px)',
      fontWeight: 600,
      letterSpacing: '0.5px',
      flexShrink: 0,
      fontVariantNumeric: 'tabular-nums',
      lineHeight: 1,
    },
    pillarMeta: {
      display: 'flex',
      flexDirection: 'column',
      gap: '3px',
      minWidth: 0,
      flex: 1,
    },
    pillarName: {
      fontSize: 'clamp(12px, 0.95vw, 15.5px)',
      fontWeight: 700,
      letterSpacing: '1.6px',
      textTransform: 'uppercase',
      color: theme.ink,
      lineHeight: 1.2,
    },
    pillarTagline: {
      fontSize: 'clamp(10.5px, 0.82vw, 13.5px)',
      fontWeight: 500,
      letterSpacing: '0.2px',
      color: theme.inkMuted,
      lineHeight: 1.2,
    },

    // ---------- Minimal item (hairline-separated, no card chrome) ----------
    itemsList: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      gap: 'clamp(6px, 0.55vw, 10px)',
    },
    item: {
      flex: '0 0 auto',
      display: 'flex',
      alignItems: 'center',
      gap: 'clamp(12px, 1vw, 16px)',
      padding: 'clamp(9px, 0.75vw, 13px) clamp(10px, 0.85vw, 14px)',
      borderRadius: '10px',
      background: theme.isLight ? theme.surface0 : 'rgba(255,255,255,0.02)',
      border: `1px solid ${theme.borderSubtle}`,
      transition: 'all 0.25s ease',
      position: 'relative',
      minHeight: 0,
    },
    itemIconWrap: {
      width: 'clamp(30px, 2.3vw, 38px)',
      height: 'clamp(30px, 2.3vw, 38px)',
      borderRadius: '9px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      transition: 'all 0.25s ease',
    },
    itemBody: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      minWidth: 0,
      flex: 1,
    },
    itemTitle: {
      fontSize: 'clamp(15px, 1.18vw, 19.5px)',
      fontWeight: 600,
      color: theme.ink,
      letterSpacing: '-0.1px',
      lineHeight: 1.25,
    },
    itemDesc: {
      fontSize: 'clamp(12.5px, 0.95vw, 15.5px)',
      fontWeight: 400,
      lineHeight: 1.45,
      color: theme.inkSecondary,
    },

    // ---------- AI column - hero treatment ----------
    aiColumn: {
      position: 'relative',
    },
    aiGlow: {
      position: 'absolute',
      inset: '-4% -8% -6% -8%',
      background: theme.isLight
        ? 'radial-gradient(ellipse at 65% 28%, rgba(62,79,224,0.08) 0%, rgba(62,79,224,0.03) 35%, transparent 68%)'
        : 'radial-gradient(ellipse at 65% 28%, rgba(124,137,239,0.14) 0%, rgba(89,103,228,0.06) 35%, transparent 68%)',
      filter: 'blur(20px)',
      pointerEvents: 'none',
      zIndex: 0,
    },
    // Payments Concierge - flagship card modeled on yuno.tools: macOS-style
    // traffic-light header, conversation body with user bubble (Yuno blue,
    // right) → typing dots → AI bubble (dark, left) with PC logomark avatar.
    // Animation cycles on a 10s loop so the slide reads as a live chat.
    heroCard: {
      flex: '0 0 auto',
      position: 'relative',
      borderRadius: '14px',
      background: theme.isLight ? theme.bgElevated : 'rgba(12,14,28,0.6)',
      border: theme.isLight
        ? `1px solid ${theme.borderDefault}`
        : '1px solid rgba(124,137,239,0.18)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      boxShadow: theme.cardShadow,
    },
    heroHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: 'clamp(8px, 0.7vw, 12px)',
      padding: 'clamp(8px, 0.7vw, 11px) clamp(11px, 0.95vw, 14px)',
      borderBottom: `1px solid ${theme.borderSubtle}`,
      background: theme.isLight ? theme.surface0 : 'rgba(255,255,255,0.015)',
    },
    heroDots: {
      display: 'flex',
      gap: '5px',
    },
    heroDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
    },
    heroHeaderLabel: {
      display: 'flex',
      alignItems: 'center',
      gap: '7px',
      marginLeft: '4px',
    },
    heroHeaderMark: {
      width: '16px',
      height: '16px',
      filter: theme.isLight ? 'none' : 'brightness(0) invert(1)',
      opacity: 0.85,
    },
    heroHeaderText: {
      fontSize: 'clamp(10.5px, 0.78vw, 12.5px)',
      fontWeight: 600,
      color: theme.inkSecondary,
      letterSpacing: '0.1px',
    },
    heroBody: {
      padding: 'clamp(10px, 0.9vw, 14px) clamp(11px, 0.95vw, 14px)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(7px, 0.6vw, 10px)',
      minHeight: 'clamp(100px, 9vw, 150px)',
      position: 'relative',
    },
    heroUserRow: {
      display: 'flex',
      justifyContent: 'flex-end',
      opacity: 0,
      animation: 'pcUserBubble 14s ease-in-out infinite',
    },
    heroUserBubble: {
      maxWidth: '88%',
      padding: 'clamp(7px, 0.6vw, 10px) clamp(10px, 0.85vw, 13px)',
      borderRadius: '13px 13px 4px 13px',
      background: 'linear-gradient(135deg, #3E4FE0 0%, #5967E4 100%)',
      fontSize: 'clamp(11px, 0.85vw, 13px)',
      fontWeight: 500,
      lineHeight: 1.35,
      color: '#fff',
      boxShadow: '0 4px 14px rgba(62,79,224,0.24)',
    },
    heroAiRow: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '8px',
      opacity: 0,
    },
    heroAvatar: {
      width: 'clamp(22px, 1.8vw, 28px)',
      height: 'clamp(22px, 1.8vw, 28px)',
      borderRadius: '8px',
      background: 'rgba(62,79,224,0.18)',
      border: '1px solid rgba(124,137,239,0.32)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      color: '#BDC3F6',
    },
    heroAvatarMark: {
      width: '72%',
      height: '72%',
      filter: theme.isLight ? 'none' : 'brightness(0) invert(1)',
      opacity: 0.9,
    },
    heroTypingBubble: {
      padding: '6px 12px',
      borderRadius: '13px 13px 13px 4px',
      background: theme.isLight ? theme.surface1 : 'rgba(255,255,255,0.05)',
      border: `1px solid ${theme.borderDefault}`,
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    },
    heroTypingDot: {
      width: '5px',
      height: '5px',
      borderRadius: '50%',
      background: theme.isLight ? theme.accent : '#BDC3F6',
    },
    heroAiBubble: {
      padding: 'clamp(7px, 0.6vw, 10px) clamp(10px, 0.85vw, 13px)',
      borderRadius: '13px 13px 13px 4px',
      background: theme.isLight ? theme.surface1 : 'rgba(255,255,255,0.05)',
      border: `1px solid ${theme.borderDefault}`,
      fontSize: 'clamp(11px, 0.85vw, 13px)',
      fontWeight: 400,
      lineHeight: 1.4,
      color: theme.ink,
      maxWidth: '88%',
    },
    heroAiBubbleAccent: {
      color: theme.isLight ? theme.accentDeep : '#BDC3F6',
      fontWeight: 600,
    },

    // ---------- Payments Concierge hero section (spans below the grid) ----------
    // Lives as its own row below the 4-column pillar grid, separated by a
    // hairline. Left side: eyebrow + title + description; right side: the
    // animated chat card. Wide rectangle fills the empty bottom-left so the
    // slide silhouette stays balanced.
    pcSection: {
      marginTop: 'clamp(6px, 0.6vw, 12px)',
      position: 'relative',
      zIndex: 1,
    },
    pcCard: {
      display: 'grid',
      gridTemplateColumns: 'minmax(260px, 1fr) minmax(340px, 1.1fr)',
      gap: 'clamp(20px, 2vw, 40px)',
      padding: 'clamp(16px, 1.3vw, 24px)',
      background: theme.isLight
        ? theme.cardGradientAccent
        : 'linear-gradient(135deg, rgba(124,137,239,0.10) 0%, rgba(62,79,224,0.04) 100%)',
      border: theme.isLight
        ? `1px solid ${theme.borderDefault}`
        : '1px solid rgba(124,137,239,0.22)',
      borderRadius: '14px',
      alignItems: 'start',
      boxShadow: theme.cardShadow,
    },
    pcInfo: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(14px, 1.4vw, 24px)',
    },
    pcEyebrow: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '7px',
      padding: '5px 11px',
      borderRadius: '100px',
      background: theme.isLight ? 'rgba(62,79,224,0.08)' : 'rgba(124,137,239,0.14)',
      border: theme.isLight
        ? '1px solid rgba(62,79,224,0.30)'
        : '1px solid rgba(124,137,239,0.4)',
      fontSize: 'clamp(9.5px, 0.7vw, 11.5px)',
      fontWeight: 700,
      letterSpacing: '1.6px',
      textTransform: 'uppercase',
      color: theme.isLight ? theme.accentDeep : '#FDE4F0',
      alignSelf: 'flex-start',
    },
    pcEyebrowDot: {
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #BDC3F6 0%, #3E4FE0 100%)',
      boxShadow: '0 0 8px rgba(124,137,239,0.9)',
    },
    pcTitle: {
      fontFamily: 'var(--font-display)',
      fontSize: 'clamp(24px, 2vw, 36px)',
      fontWeight: 600,
      letterSpacing: '-0.5px',
      lineHeight: 1.08,
      color: theme.ink,
      margin: 0,
    },
    pcDescription: {
      fontSize: 'clamp(13px, 0.98vw, 16px)',
      color: theme.inkSecondary,
      lineHeight: 1.5,
      margin: 0,
      maxWidth: 'clamp(280px, 28vw, 480px)',
    },
  }

  return (
    <SlideBase section={t('section.about_yuno_platform')} slideNumber={5}>
      <div className="stagger" style={{ ...styles.body, '--stagger-base': '0.1s', '--stagger-step': '0.1s' }}>
        <div style={styles.titleRow}>
          <h2 style={styles.title}>
            {t('productSuite.title_lead')}{' '}
            <span style={styles.titleAccent}>{t('productSuite.title_accent')}</span>
          </h2>
          <p style={styles.subtitle}>
            {t('productSuite.subtitle')}
          </p>
        </div>

        <div className="stagger" style={{ ...styles.statsStrip, '--stagger-base': '0.3s', '--stagger-step': '0.08s' }}>
          {tStats.map((s) => (
            <div key={s.l} style={styles.statCard}>
              <div style={styles.statNumber}>{s.n}</div>
              <div style={styles.statLabel}>{s.l}</div>
            </div>
          ))}
        </div>

        <div style={styles.monoKicker}>
          <span style={styles.monoKickerCaret}>&gt;</span>
          {t('productSuite.kicker')}
          <BeamRule delay={3} base={theme.beamBase} beam={theme.beam} />
        </div>

        <div className="stagger" style={{ ...styles.grid, '--stagger-base': '0.55s', '--stagger-step': '0.1s' }}>
          {tPillars.map((pillar, idx) => (
            <div key={pillar.name} style={styles.column}>
              <PillarHeader pillar={pillar} index={idx} styles={styles} />
              <div style={styles.itemsList}>
                {pillar.items.map((item) => (
                  <PillarItem
                    key={item.title}
                    item={item}
                    color={pillar.color}
                    soft={pillar.soft}
                    border={pillar.border}
                    styles={styles}
                    theme={theme}
                  />
                ))}
              </div>
            </div>
          ))}

          <div style={{ ...styles.column, ...styles.aiColumn }}>
            <div style={styles.aiGlow} aria-hidden />
            <PillarHeader pillar={tAiPillar} index={3} styles={styles} />
            <div style={styles.itemsList}>
              {tAiPillar.items.map((item) => (
                <PillarItem
                  key={item.title}
                  item={item}
                  color={tAiPillar.color}
                  soft={tAiPillar.soft}
                  border={tAiPillar.border}
                  styles={styles}
                  theme={theme}
                />
              ))}
            </div>
          </div>
        </div>

        <div style={styles.aiArrowRow} aria-hidden>
          <div style={styles.aiArrow}>
            <svg
              style={styles.aiArrowSvg}
              viewBox="0 0 100 14"
              preserveAspectRatio="none"
            >
              <polygon points="0,0 100,0 50,3" fill="#7C89EF" opacity="0.55" />
              <polygon points="0,5 100,5 50,8" fill="#7C89EF" opacity="0.3" />
              <polygon points="0,10 100,10 50,13" fill="#7C89EF" opacity="0.14" />
            </svg>
          </div>
        </div>

        <div className="reveal" style={{ ...styles.pcSection, '--reveal-delay': '0.9s' }}>
          <div style={styles.pcCard}>
            <div style={styles.pcInfo}>
              <span style={styles.pcEyebrow}>
                <span style={styles.pcEyebrowDot} />
                {t('productSuite.pc_eyebrow')}
              </span>
              <h3 style={styles.pcTitle}>{t('productSuite.pc_title')}</h3>
              <p style={styles.pcDescription}>
                {t('productSuite.pc_description')}
              </p>
            </div>
            <PaymentsConciergeHero styles={styles} theme={theme} t={t} />
          </div>
        </div>
      </div>
    </SlideBase>
  )
}
