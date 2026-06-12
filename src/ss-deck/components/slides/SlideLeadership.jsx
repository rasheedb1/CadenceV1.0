import SlideBase from './SlideBase'
import BeamRule from '../BeamRule'
import { useTheme } from '../../lib/theme'
import { FOUNDERS, LEADERS, PEDIGREE_LOGOS, LOGO_SCALES, LOGO_BASELINE_NUDGE } from './SlideLeadership.data'
import { getCopy } from '../../lib/copy'

const LAVENDER_BASE =
  'linear-gradient(90deg, rgba(189,195,246,0.22) 0%, rgba(189,195,246,0) 100%)'

function SectionHeader({ children, beamDelay = 0, styles }) {
  return (
    <div style={styles.sectionHeader}>
      <span style={styles.sectionDot} />
      <span style={styles.sectionLabel}>{children}</span>
      <BeamRule base={LAVENDER_BASE} delay={beamDelay} />
    </div>
  )
}

function PersonCard({ p, founder, style, styles }) {
  const photoStyle = founder
    ? { ...styles.photo, ...styles.photoFounder }
    : styles.photo
  return (
    <div style={{ ...styles.card, ...style }}>
      <div style={styles.photoWrap}>
        <img src={p.photo} alt={p.name} style={photoStyle} />
        {founder ? (
          <span data-mask-ring style={styles.photoRing} aria-hidden />
        ) : (
          <span style={styles.photoRingSubtle} aria-hidden />
        )}
      </div>
      <div style={styles.meta}>
        <div style={styles.name}>{p.name}</div>
        <div style={styles.role}>{p.role}</div>
        {founder && p.pedigreeLabel ? (
          <div style={styles.pedigreeLabel}>{p.pedigreeLabel}</div>
        ) : null}
      </div>
    </div>
  )
}

function StripLogo({ name, styles }) {
  const scale = LOGO_SCALES[name] ?? 1
  const h = `clamp(${24 * scale}px, ${2.3 * scale}vw, ${40 * scale}px)`
  // Wide wordmarks hit the maxWidth cap before reaching natural height —
  // they need a relaxed cap so they read at the same optical size as
  // the others. Worldline's canvas is 9.85:1 (very flat), so it sits in
  // the extra-wide tier with an even higher cap.
  const WIDE = new Set(['checkout'])
  const EXTRA_WIDE = new Set(['worldline'])
  const nudge = LOGO_BASELINE_NUDGE[name] ?? 0
  let maxWidth = 'clamp(112px, 10.4vw, 182px)'
  if (EXTRA_WIDE.has(name)) maxWidth = 'clamp(208px, 20vw, 365px)'
  else if (WIDE.has(name)) maxWidth = 'clamp(156px, 14.8vw, 260px)'
  return (
    <img
      className="pedigree-logo"
      src={`/ss-deck-assets/company-logos/${name}.png`}
      alt={name}
      style={{
        ...styles.stripLogo,
        height: h,
        maxWidth,
        // marginTop (not transform) so the per-logo nudge doesn't clash
        // with the .pedigree-logo:hover transform defined in index.css.
        ...(nudge ? { marginTop: `${nudge}px` } : {}),
      }}
    />
  )
}

export default function SlideLeadership({ data }) {
  const isBanking = data?.MODE === 'banking'
  const theme = useTheme()
  const lang = data?.LANGUAGE || 'en'
  const t = (key) => getCopy(lang, key)

  const styles = {
    // ---------- Title block ----------
    titleBlock: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 'clamp(24px, 3vw, 48px)',
      marginBottom: 'clamp(32px, 3.6vw, 64px)',
    },
    title: {
      fontFamily: 'var(--font-display)',
      fontSize: 'clamp(28px, 2.7vw, 52px)',
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

    // ---------- Body ----------
    body: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(24px, 2.4vw, 44px)',
      minHeight: 0,
    },

    // ---------- Section header ----------
    sectionHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      marginBottom: 'clamp(10px, 1vw, 18px)',
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
    sectionRule: {
      flex: 1,
      height: '1px',
      background: 'linear-gradient(90deg, rgba(189,195,246,0.22) 0%, rgba(189,195,246,0) 100%)',
    },

    // ---------- Founders row ----------
    foundersRow: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 'clamp(20px, 2vw, 40px)',
      maxWidth: '46%',
    },

    // ---------- Leadership grid ----------
    // 14 virtual columns, each card spans 2. 13 leaders ⇒ row 1 has 7 cards
    // (cols 1–14, fills the row), row 2 has 6 cards shifted to start at col 2
    // (cols 2–13) leaving col 1 + col 14 as half-column gutters — the shorter
    // row stays visually centered without changing per-card width.
    leadersGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(14, 1fr)',
      gap: 'clamp(16px, 1.5vw, 30px) clamp(16px, 1.5vw, 30px)',
    },
    // Each person card spans 2 columns of the 14-col track.
    cardSpan: {
      gridColumn: 'span 2',
      minWidth: 0,
    },
    // 8th card (first of row 2) explicitly starts at col 2 and spans 2.
    // Using the shorthand with both start + span because a standalone
    // gridColumnStart was overriding the span from cardSpan and collapsing
    // this card to 1 col (causing "Juan Manuel Rebull" to clip).
    secondRowStart: {
      gridColumn: '2 / span 2',
    },

    // ---------- Person card ----------
    card: {
      display: 'flex',
      gap: 'clamp(12px, 1.1vw, 18px)',
      alignItems: 'flex-start',
      minWidth: 0,
    },
    photoWrap: {
      position: 'relative',
      flexShrink: 0,
    },
    photo: {
      width: 'clamp(64px, 5vw, 92px)',
      height: 'clamp(64px, 5vw, 92px)',
      borderRadius: '50%',
      objectFit: 'cover',
      background: theme.surface1,
      display: 'block',
    },
    photoFounder: {
      width: 'clamp(76px, 5.9vw, 108px)',
      height: 'clamp(76px, 5.9vw, 108px)',
    },
    photoRing: {
      position: 'absolute',
      inset: '-3px',
      borderRadius: '50%',
      padding: '2px',
      background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accentMid} 55%, ${theme.accentPale} 100%)`,
      WebkitMask:
        'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
      WebkitMaskComposite: 'xor',
      maskComposite: 'exclude',
      pointerEvents: 'none',
    },
    photoRingSubtle: {
      position: 'absolute',
      inset: '-1px',
      borderRadius: '50%',
      border: `1px solid ${theme.borderSubtle}`,
      pointerEvents: 'none',
    },
    meta: {
      display: 'flex',
      flexDirection: 'column',
      gap: '3px',
      minWidth: 0,
      paddingTop: '2px',
      flex: 1,
    },
    name: {
      fontSize: 'clamp(14px, 1.15vw, 18.5px)',
      fontWeight: 700,
      color: theme.ink,
      lineHeight: 1.2,
      letterSpacing: '0px',
      wordBreak: 'normal',
      hyphens: 'none',
    },
    role: {
      fontSize: 'clamp(12px, 0.95vw, 15.5px)',
      fontWeight: 400,
      color: theme.inkSecondary,
      lineHeight: 1.4,
    },
    pedigreeLabel: {
      fontSize: 'clamp(11px, 0.85vw, 14px)',
      fontWeight: 600,
      color: theme.isLight ? theme.accentDeep : 'rgba(189,195,246,0.82)',
      lineHeight: 1.4,
      marginTop: '3px',
      letterSpacing: '0.2px',
    },

    // ---------- Pedigree strip (bottom) ----------
    // marginTop:auto pushes the strip to the bottom of the flex-column body
    // when there's vertical slack (fullscreen / presentation mode), and
    // collapses to 0 when content is already tight (windowed). That keeps
    // the windowed view from overflowing while filling the tall-viewport gap.
    pedigreeStrip: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(14px, 1.2vw, 22px)',
      padding: 'clamp(22px, 2.1vw, 38px) clamp(24px, 2.4vw, 42px)',
      background: theme.isLight
        ? theme.bgElevated
        : 'linear-gradient(180deg, rgba(62,79,224,0.05) 0%, rgba(62,79,224,0.02) 100%)',
      border: `1px solid ${theme.isLight ? theme.borderDefault : 'rgba(62,79,224,0.12)'}`,
      borderRadius: '14px',
      marginTop: 'auto',
      boxShadow: theme.cardShadow,
    },
    pedigreeStripHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: 'clamp(10px, 0.9vw, 14px)',
    },
    pedigreeStripLabel: {
      fontSize: 'clamp(12px, 0.95vw, 15px)',
      fontWeight: 700,
      letterSpacing: '2px',
      textTransform: 'uppercase',
      color: theme.isLight ? theme.accentDeep : 'rgba(189,195,246,0.82)',
    },
    // Small Yuno dot-grid mark as a decorative accent next to the
    // "We've been there" label. Subtle brand signature on the pedigree row.
    pedigreeMark: {
      width: 'clamp(16px, 1.3vw, 22px)',
      height: 'clamp(16px, 1.3vw, 22px)',
      opacity: theme.isLight ? 0.85 : 0.55,
      pointerEvents: 'none',
      userSelect: 'none',
      flexShrink: 0,
      filter: theme.isLight ? 'brightness(0)' : 'none',
    },
    pedigreeStripLogos: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(14px, 1.3vw, 24px)',
    },
    pedigreeStripLogosRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'clamp(12px, 1.2vw, 24px)',
      flexWrap: 'nowrap',
    },
    stripLogo: {
      objectFit: 'contain',
      opacity: theme.isLight ? 0.88 : 0.78,
      // Pedigree logos arrive as black-on-transparent (or white-on-transparent)
      // PNGs; force them to a single tone matched to the surface — white on
      // dark, black on light — so the row reads as a unified silhouette set.
      filter: theme.invertLogos ? 'brightness(0) invert(1)' : 'brightness(0)',
      flex: '0 1 auto',
      minWidth: 0,
      transition:
        'opacity 280ms cubic-bezier(0.16, 1, 0.3, 1),' +
        'transform 320ms cubic-bezier(0.16, 1, 0.3, 1),' +
        'filter 280ms cubic-bezier(0.16, 1, 0.3, 1)',
      cursor: 'default',
      willChange: 'transform, opacity',
    },
  }

  return (
    <SlideBase section={t('section.about_yuno')} slideNumber={7}>
      <div className="reveal" style={{ ...styles.titleBlock, '--reveal-delay': '0.05s' }}>
        <h2 style={styles.title}>
          {isBanking ? (
            <>
              {t('leadership.title_banking_lead')}{' '}
              <span style={styles.titleAccent}>{t('leadership.title_banking_accent')}</span>
            </>
          ) : (
            <>
              {t('leadership.title_merchant_lead')} <span style={styles.titleAccent}>{t('leadership.title_merchant_accent')}</span> {t('leadership.title_merchant_post')}
            </>
          )}
        </h2>
        <p style={styles.tagline}>
          <span style={styles.taglineEmph}>{t('leadership.tagline_pre')}</span> {t('leadership.tagline_body')}{' '}
          {isBanking ? t('leadership.tagline_banking') : t('leadership.tagline_merchant')}
        </p>
      </div>

      <div style={styles.body}>
        <section className="reveal" style={{ '--reveal-delay': '0.2s' }}>
          <SectionHeader beamDelay={0} styles={styles}>{t('leadership.section_founders')}</SectionHeader>
          <div className="stagger" style={{ ...styles.foundersRow, '--stagger-base': '0.3s', '--stagger-step': '0.1s' }}>
            {FOUNDERS.map((p) => (
              <PersonCard key={p.name} p={p} founder styles={styles} />
            ))}
          </div>
        </section>

        <section className="reveal" style={{ '--reveal-delay': '0.45s' }}>
          <SectionHeader beamDelay={4.5} styles={styles}>{t('leadership.section_leaders')}</SectionHeader>
          <div className="stagger" style={{ ...styles.leadersGrid, '--stagger-base': '0.55s', '--stagger-step': '0.04s' }}>
            {LEADERS.map((p, i) => (
              <PersonCard
                key={p.name}
                p={p}
                styles={styles}
                style={{
                  ...styles.cardSpan,
                  ...(i === 7 ? styles.secondRowStart : {}),
                }}
              />
            ))}
          </div>
        </section>

        <div className="reveal" style={{ ...styles.pedigreeStrip, '--reveal-delay': '1.1s' }}>
          <div style={styles.pedigreeStripHeader}>
            <img src="/ss-deck-assets/assets/yuno-mark-white.svg" alt="" style={styles.pedigreeMark} aria-hidden />
            <div style={styles.pedigreeStripLabel}>{t('leadership.pedigree_label')}</div>
          </div>
          <div style={styles.pedigreeStripLogos}>
            <div className="pedigree-logos-row" style={styles.pedigreeStripLogosRow}>
              {PEDIGREE_LOGOS.slice(0, Math.ceil(PEDIGREE_LOGOS.length / 2)).map((l) => (
                <StripLogo key={l} name={l} styles={styles} />
              ))}
            </div>
            <div className="pedigree-logos-row" style={styles.pedigreeStripLogosRow}>
              {PEDIGREE_LOGOS.slice(Math.ceil(PEDIGREE_LOGOS.length / 2)).map((l) => (
                <StripLogo key={l} name={l} styles={styles} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </SlideBase>
  )
}
