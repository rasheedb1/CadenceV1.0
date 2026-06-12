import { useState } from 'react'
import SlideBase from './SlideBase'
import BeamRule from '../BeamRule'
import { useTheme } from '../../lib/theme'
import { getCopy } from '../../lib/copy'

const LAVENDER_BASE =
  'linear-gradient(90deg, rgba(189,195,246,0.22) 0%, rgba(189,195,246,0) 100%)'

// First half of the merchant roster shown in the corporate deck. `slug`
// resolves to /trusted/<slug>.<ext> (ext defaults to png); if the file
// 404s the entry falls back to a styled text wordmark using the `style`
// overrides. Logos are rendered white-on-dark via a CSS invert filter,
// matching the pedigree strip pattern in SlideLeadership.
const MERCHANTS = [
  { name: 'Whop',          slug: 'whop',           style: { fontWeight: 700, letterSpacing: '4px', textTransform: 'uppercase', fontSize: '0.9em' } },
  { name: 'McDonald’s',    slug: 'mcdonalds',      style: { fontWeight: 800, letterSpacing: '-0.5px' } },
  { name: 'Uber',          slug: 'uber',           style: { fontWeight: 800, letterSpacing: '-0.4px' } },
  { name: 'Crypto.com',    slug: 'crypto-com',     style: { fontWeight: 700, letterSpacing: '-0.4px', fontSize: '0.88em' } },
  { name: 'Samsung',       slug: 'samsung',        style: { fontWeight: 800, letterSpacing: '-0.3px' } },
  { name: 'inDrive',       slug: 'indrive',        ext: 'svg', style: { fontWeight: 700, letterSpacing: '-0.3px', fontSize: '0.9em' } },
  { name: 'Ant Group',     slug: 'ant-group',      style: { fontWeight: 700, letterSpacing: '-0.2px' } },
  { name: 'Rappi',         slug: 'rappi',          style: { fontWeight: 800, letterSpacing: '-0.4px', fontStyle: 'italic' } },
  { name: 'GoFundMe',      slug: 'gofundme',       style: { fontWeight: 700, letterSpacing: '-0.3px', fontSize: '0.9em' } },
  { name: 'NetEase Games', slug: 'netease-games',  style: { fontWeight: 700, letterSpacing: '-0.2px', fontSize: '0.88em' } },
]

// `imgStyle` per-investor overrides the default investorImg sizing —
// stacked logos (icon-on-top wordmarks) need a taller cap to read at the
// same optical weight as the single-line wordmarks.
const INVESTORS = [
  { name: 'KASZEK',                  slug: 'kaszek',                  style: { fontWeight: 700, letterSpacing: '4px', fontSize: '0.95em' } },
  { name: 'DST GLOBAL',              slug: 'dst-global',              style: { fontWeight: 800, letterSpacing: '0.5px' } },
  { name: 'TIGERGLOBAL',             slug: 'tiger-global',            style: { fontWeight: 700, letterSpacing: '1px' } },
  { name: 'andreessen.horowitz',     slug: 'andreessen-horowitz',     style: { fontWeight: 600, letterSpacing: '-0.2px', fontSize: '0.82em' } },
  { name: 'monashees+',              slug: 'monashees',               style: { fontWeight: 600, letterSpacing: '-0.2px', fontStyle: 'italic' } },
  { name: 'Global PayTech Ventures', slug: 'global-paytech-ventures', imgStyle: { height: 'clamp(46px, 4.2vw, 76px)', maxWidth: 'clamp(110px, 10vw, 180px)' }, style: { fontWeight: 600, letterSpacing: '0.4px', fontSize: '0.78em', textTransform: 'uppercase' } },
]

// Logo with text fallback. onError fires when /trusted/<slug>.png 404s,
// flipping to the styled text wordmark — same behaviour as the rest of
// the deck for missing merchant logos.
function LogoOrText({ slug, ext = 'png', name, style, imgStyle, imgStyleOverride, textStyle }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span style={{ ...textStyle, ...style }}>{name}</span>
  return (
    <img
      src={`/ss-deck-assets/trusted/${slug}.${ext}`}
      alt={name}
      style={{ ...imgStyle, ...imgStyleOverride }}
      onError={() => setFailed(true)}
    />
  )
}

function SectionHeader({ children, beamDelay = 0, styles }) {
  return (
    <div style={styles.sectionHeader}>
      <span style={styles.sectionDot} />
      <span style={styles.sectionLabel}>{children}</span>
      <BeamRule base={LAVENDER_BASE} delay={beamDelay} />
    </div>
  )
}

export default function SlideTrustedBy({ data }) {
  const theme = useTheme()
  const lang = data?.LANGUAGE || 'en'
  const t = (key) => getCopy(lang, key)

  const styles = {
    // ---------- Title ----------
    titleBlock: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 'clamp(24px, 3vw, 48px)',
      marginBottom: 'clamp(20px, 2.2vw, 36px)',
      flexShrink: 0,
    },
    title: {
      fontFamily: 'var(--font-display)',
      fontSize: 'clamp(26px, 2.4vw, 46px)',
      fontWeight: 500,
      letterSpacing: '-1.2px',
      lineHeight: 1.1,
      color: theme.ink,
      margin: 0,
      maxWidth: '64%',
    },
    titleAccent: {
      backgroundImage: theme.isLight
        ? `linear-gradient(135deg, ${theme.accentDeep} 0%, ${theme.accent} 100%)`
        : 'linear-gradient(110deg, #3E4FE0 0%, #5967E4 30%, #BDC3F6 68%, #E8EAF5 100%)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      color: 'transparent',
    },
    tagline: {
      fontSize: 'clamp(13px, 1.05vw, 17px)',
      lineHeight: 1.55,
      color: theme.inkSecondary,
      maxWidth: '34%',
      textAlign: 'right',
      fontWeight: 400,
    },
    taglineEmph: {
      color: theme.inkStrong,
      fontWeight: 700,
    },

    body: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(20px, 2vw, 36px)',
      minHeight: 0,
    },
    // Wraps the merchant header + grid as a flex-column item so the grid's
    // flex:1 actually fills the remaining body height. Without this wrapper
    // the grid sized to content and pushed the investor strip off-stage.
    merchantSection: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
    },

    // ---------- Section header (reused pattern from Leadership) ----------
    sectionHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      marginBottom: 'clamp(12px, 1.1vw, 18px)',
      flexShrink: 0,
    },
    sectionDot: {
      width: '5px',
      height: '5px',
      borderRadius: '50%',
      background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accentPale} 100%)`,
      boxShadow: '0 0 6px rgba(62,79,224,0.6)',
      flexShrink: 0,
    },
    sectionLabel: {
      fontSize: 'clamp(12px, 0.95vw, 15.5px)',
      fontWeight: 700,
      letterSpacing: '1.8px',
      textTransform: 'uppercase',
      color: theme.isLight ? theme.accentDeep : 'rgba(189,195,246,0.92)',
    },

    // ---------- Merchant grid ----------
    merchantGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gridTemplateRows: 'repeat(2, 1fr)',
      gap: 'clamp(12px, 1.1vw, 20px)',
      flex: 1,
      minHeight: 0,
    },
    merchantTile: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: theme.isLight ? theme.bgElevated : 'rgba(255,255,255,0.025)',
      border: `1px solid ${theme.borderSubtle}`,
      borderRadius: '14px',
      padding: 'clamp(10px, 0.9vw, 18px)',
      minHeight: 0,
      minWidth: 0,
      overflow: 'hidden',
      boxShadow: theme.cardShadow,
    },
    merchantImg: {
      maxWidth: '72%',
      maxHeight: '52%',
      width: 'auto',
      height: 'auto',
      objectFit: 'contain',
      display: 'block',
      // Logos ship as white-on-transparent or black-on-transparent PNGs;
      // unify them to a single silhouette tone matched to the surface.
      filter: theme.invertLogos ? 'brightness(0) invert(1)' : 'brightness(0)',
      opacity: theme.isLight ? 0.88 : 0.92,
    },
    merchantText: {
      fontFamily: 'var(--font-display)',
      fontSize: 'clamp(20px, 1.9vw, 36px)',
      color: theme.ink,
      lineHeight: 1,
      textAlign: 'center',
      whiteSpace: 'nowrap',
    },

    // ---------- Investor section ----------
    // flexShrink: 0 keeps it visible — without it the merchant grid above
    // squeezes the strip off-stage on shorter viewports.
    investorSection: {
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
    },
    investorStrip: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(14px, 1.2vw, 22px)',
      padding: 'clamp(20px, 1.9vw, 34px) clamp(24px, 2.4vw, 42px)',
      background: theme.isLight
        ? theme.bgElevated
        : 'linear-gradient(180deg, rgba(62,79,224,0.05) 0%, rgba(62,79,224,0.02) 100%)',
      border: `1px solid ${theme.isLight ? theme.borderDefault : 'rgba(62,79,224,0.12)'}`,
      borderRadius: '14px',
      boxShadow: theme.cardShadow,
    },
    investorRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'clamp(36px, 3.6vw, 72px)',
      flexWrap: 'nowrap',
    },
    investorImg: {
      height: 'clamp(28px, 2.4vw, 44px)',
      maxWidth: 'clamp(120px, 11vw, 200px)',
      objectFit: 'contain',
      display: 'block',
      filter: theme.invertLogos ? 'brightness(0) invert(1)' : 'brightness(0)',
      opacity: theme.isLight ? 0.78 : 0.82,
    },
    investorText: {
      fontFamily: 'var(--font-display)',
      fontSize: 'clamp(20px, 1.85vw, 34px)',
      color: theme.inkSecondary,
      lineHeight: 1,
      whiteSpace: 'nowrap',
    },
  }

  return (
    <SlideBase section={t('section.about_yuno')} slideNumber={8}>
      <div className="reveal" style={{ ...styles.titleBlock, '--reveal-delay': '0.05s' }}>
        <h2 style={styles.title}>
          {t('trustedBy.title_lead')}{' '}
          <span style={styles.titleAccent}>{t('trustedBy.title_accent')}</span>
        </h2>
        <p style={styles.tagline}>
          {t('trustedBy.tagline_pre')}{' '}
          <span style={styles.taglineEmph}>{t('trustedBy.tagline_emph')}</span>
        </p>
      </div>

      <div style={styles.body}>
        <div className="reveal" style={{ ...styles.merchantSection, '--reveal-delay': '0.18s' }}>
          <SectionHeader beamDelay={0} styles={styles}>{t('trustedBy.section_customers')}</SectionHeader>
          <div
            className="stagger"
            style={{
              ...styles.merchantGrid,
              '--stagger-base': '0.28s',
              '--stagger-step': '0.05s',
            }}
          >
            {MERCHANTS.map((m) => (
              <div key={m.slug} style={styles.merchantTile}>
                <LogoOrText
                  slug={m.slug}
                  ext={m.ext}
                  name={m.name}
                  style={m.style}
                  imgStyle={styles.merchantImg}
                  textStyle={styles.merchantText}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="reveal" style={{ ...styles.investorSection, '--reveal-delay': '0.85s' }}>
          <SectionHeader beamDelay={4} styles={styles}>{t('trustedBy.section_investors')}</SectionHeader>
          <div style={styles.investorStrip}>
            <div
              className="stagger"
              style={{
                ...styles.investorRow,
                '--stagger-base': '1s',
                '--stagger-step': '0.08s',
              }}
            >
              {INVESTORS.map((inv) => (
                <LogoOrText
                  key={inv.slug}
                  slug={inv.slug}
                  ext={inv.ext}
                  name={inv.name}
                  style={inv.style}
                  imgStyle={styles.investorImg}
                  imgStyleOverride={inv.imgStyle}
                  textStyle={styles.investorText}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </SlideBase>
  )
}
