// Cover slide. The globe composition is now assembled inside GlobeHalo so
// the central glow, orbital rings, and pulse dots are perfectly centered on
// the globe (was drifting in the old planet1-based design). Ambient
// particles drift across the whole cover for atmospheric depth.
import { GlobeHalo, CoverParticles } from './CoverFX'
import { useTheme } from '../../lib/theme'
import { getCopy } from '../../lib/copy'

// Merchant logos whose asset is dark/colored and disappears on the cover's
// black background. Forced to white via brightness(0)+invert(1) so they
// read as clearly as the rest. Matched case-insensitively by COMPANY_NAME
// so a rename elsewhere in the data doesn't silently break the mapping.
const DARK_LOGO_MERCHANTS = new Set([
  'hostinger',
  'united airlines',
  'wayfair',
])
const WHITE_LOGO_FILTER = 'brightness(0) invert(1)'

// Merchant logos whose asset bundles an icon/decoration alongside the
// wordmark (so when scaled to the default lockup height, the wordmark
// portion reads visually smaller than the Yuno mark beside it). Render
// these at a larger height in the lockup so the wordmark matches Yuno.
const LOGO_HEIGHT_BUMP_MERCHANTS = new Set([
  'bulgaria air',
])

export default function SlideCover({ data }) {
  const theme = useTheme()
  const isLight = theme.isLight
  const lang = data?.LANGUAGE || 'en'
  const t = (key) => getCopy(lang, key)

  const styles = {
    slide: {
      width: '100%',
      height: '100%',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'var(--font)',
      background: theme.bg,
    },
    // The globe asset is a white wireframe on transparent, designed
    // for the dark canvas with `screen` blending. On dark we render
    // it as an <img> with the original setup. On light, the image's
    // bright pixels would either disappear or hue-rotate into magenta,
    // so we instead use the asset as a CSS mask over a solid Yuno-blue
    // div. That gives a clean, exact `theme.accent` tint without any
    // filter approximation.
    globeDecor: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      opacity: 0.58,
      mixBlendMode: 'screen',
      pointerEvents: 'none',
      objectFit: 'contain',
      zIndex: 2,
    },
    globeMask: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      backgroundColor: theme.accent,
      WebkitMaskImage: 'url(/ss-deck-assets/assets/embellishments/globe.png)',
      maskImage: 'url(/ss-deck-assets/assets/embellishments/globe.png)',
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
      opacity: 0.55,
      pointerEvents: 'none',
      zIndex: 2,
    },
    wordmarkWatermark: {
      position: 'absolute',
      right: 'clamp(-40px, -1.5vw, -20px)',
      bottom: 'clamp(60px, 7vw, 110px)',
      width: 'clamp(320px, 34vw, 620px)',
      height: 'auto',
      opacity: 0.06,
      pointerEvents: 'none',
      userSelect: 'none',
    },
    content: {
      position: 'relative',
      zIndex: 5,
      width: '100%',
      height: '100%',
      padding: 'clamp(32px, 4%, 72px) clamp(40px, 5%, 96px) clamp(44px, 5%, 80px)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    },
    topRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 'clamp(14px, 1.2vw, 22px)',
      lineHeight: 1,
    },
    yunoLogo: {
      // The cover sits on top of the GlobeHalo's outerGlow (a wide
      // rgba(62,79,224,0.28) blur that reaches across the canvas), so
      // a 0.92-opacity logo reads as a faint blue-tinted shape. Lock
      // the cover wordmark to opacity 1 + brightness(0) on light so it
      // lands as solid black, regardless of the ambient glow tint.
      height: 'clamp(20px, 1.8vw, 32px)',
      display: 'block',
      opacity: isLight ? 1 : theme.logoOpacity,
      filter: isLight ? 'brightness(0)' : theme.logoFilter,
    },
    coBrandSep: {
      width: '1px',
      height: 'clamp(20px, 1.8vw, 32px)',
      background: isLight ? 'rgba(30,32,48,0.22)' : 'rgba(255,255,255,0.32)',
    },
    coBrandLogo: {
      height: 'clamp(20px, 1.8vw, 32px)',
      width: 'auto',
      maxWidth: 'clamp(140px, 14vw, 260px)',
      objectFit: 'contain',
      display: 'block',
    },
    coBrandLogoBumped: {
      height: 'clamp(34px, 3vw, 54px)',
      width: 'auto',
      maxWidth: 'clamp(180px, 18vw, 320px)',
      objectFit: 'contain',
      display: 'block',
    },
    coBrandMark: {
      fontSize: 'clamp(20px, 1.8vw, 32px)',
      fontWeight: 700,
      letterSpacing: '-0.2px',
      lineHeight: 1,
      color: isLight ? theme.ink : 'rgba(255,255,255,0.92)',
    },
    topCluster: {
      display: 'flex',
      flexDirection: 'column',
    },
    middle: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      maxWidth: '82%',
      gap: 'clamp(20px, 2.4vw, 40px)',
    },
    title: {
      fontFamily: 'var(--font-display)',
      fontSize: 'clamp(44px, 5vw, 92px)',
      fontWeight: 400,
      letterSpacing: '-2px',
      lineHeight: 1.02,
      color: isLight ? theme.ink : '#fff',
      margin: 0,
      maxWidth: '62%',
    },
    titleStrong: {
      fontWeight: 700,
      backgroundImage: isLight
        ? `linear-gradient(135deg, ${theme.accentDeep} 0%, ${theme.accent} 100%)`
        : 'linear-gradient(135deg, #5967E4 0%, #BDC3F6 55%, #3E4FE0 100%)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      color: 'transparent',
    },
    subtitle: {
      fontSize: 'clamp(15px, 1.25vw, 21px)',
      fontWeight: 400,
      lineHeight: 1.55,
      color: theme.inkSecondary,
      maxWidth: '640px',
      margin: 0,
    },
    companyNameInline: {
      color: theme.ink,
      fontWeight: 600,
    },
    bottom: {
      display: 'flex',
      justifyContent: 'flex-end',
      alignItems: 'flex-end',
    },
    location: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'clamp(10px, 0.78vw, 13px)',
      fontWeight: 500,
      letterSpacing: '1.4px',
      textTransform: 'uppercase',
      color: theme.inkMuted,
    },
    confidential: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'clamp(9px, 0.62vw, 11px)',
      fontWeight: 500,
      letterSpacing: '1.4px',
      textTransform: 'uppercase',
      color: theme.inkFaint,
    },
  }

  // Light cover skips the white particle field (invisible on white) and
  // the heavy radial glows (designed to bloom against black). The globe
  // image stays so the cover still has a focal motif, just dimmer.
  return (
    <div style={styles.slide}>
      {!isLight && <CoverParticles />}
      <GlobeHalo>
        {isLight ? (
          <div style={styles.globeMask} aria-hidden />
        ) : (
          <img src="/ss-deck-assets/assets/embellishments/globe.png" alt="" style={styles.globeDecor} aria-hidden />
        )}
      </GlobeHalo>

      <div className="slide-enter" style={styles.content}>
        <div style={styles.topCluster}>
          <div style={styles.topRow}>
            <img src="/ss-deck-assets/assets/yuno-logo-white.svg" alt="Yuno" style={styles.yunoLogo} />
            {data.MODE === 'banking' && data.COMPANY_NAME === 'Your Bank' ? null : (() => {
              const nameLower = (data.COMPANY_NAME || '').toLowerCase()
              const bumped = LOGO_HEIGHT_BUMP_MERCHANTS.has(nameLower)
              const logoBoxStyle = bumped ? styles.coBrandLogoBumped : styles.coBrandLogo
              return (
                <>
                  <div style={styles.coBrandSep} aria-hidden />
                  {data.COMPANY_LOGO ? (
                    isLight ? (
                      <div
                        role="img"
                        aria-label={data.COMPANY_NAME}
                        style={{
                          ...logoBoxStyle,
                          width: bumped ? 'clamp(180px, 18vw, 320px)' : 'clamp(140px, 14vw, 260px)',
                          backgroundColor: theme.accent,
                          WebkitMaskImage: `url(${data.COMPANY_LOGO})`,
                          maskImage: `url(${data.COMPANY_LOGO})`,
                          WebkitMaskRepeat: 'no-repeat',
                          maskRepeat: 'no-repeat',
                          WebkitMaskSize: 'contain',
                          maskSize: 'contain',
                          WebkitMaskPosition: 'left center',
                          maskPosition: 'left center',
                        }}
                      />
                    ) : (
                      <img
                        src={data.COMPANY_LOGO}
                        alt={data.COMPANY_NAME}
                        style={{
                          ...logoBoxStyle,
                          ...(DARK_LOGO_MERCHANTS.has(nameLower)
                            ? { filter: WHITE_LOGO_FILTER }
                            : {}),
                        }}
                      />
                    )
                  ) : (
                    <span style={styles.coBrandMark}>{data.COMPANY_NAME}</span>
                  )}
                </>
              )
            })()}
          </div>
        </div>

        <div className="stagger" style={{ ...styles.middle, '--stagger-base': '0.42s', '--stagger-step': '0.15s' }}>
          <h1 style={styles.title}>
            {t('cover.title_lead')}{' '}
            <span style={styles.titleStrong}>{t('cover.title_accent')}</span>
          </h1>

          {data.MODE === 'banking' ? (
            <p style={styles.subtitle}>{t('cover.subtitle_banking')}</p>
          ) : data.MODE === 'partner' ? (
            <p style={styles.subtitle}>
              {t('cover.subtitle_partner_pre')}{' '}
              <span style={styles.titleStrong}>{t('cover.subtitle_partner_accent')}</span>{' '}
              {t('cover.subtitle_partner_post')}
            </p>
          ) : (
            <p style={styles.subtitle}>
              {t('cover.subtitle_merchant_pre')}{' '}
              <span style={styles.companyNameInline}>{data.COMPANY_NAME}</span>{' '}
              {t('cover.subtitle_merchant_post')}
            </p>
          )}
        </div>

        <div style={styles.bottom}>
          {(data.VENDOR_NAME || data.VENDOR_TITLE) && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              marginRight: 'auto',
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'clamp(9px, 0.7vw, 11px)',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: theme.inkMuted,
                marginBottom: 6,
              }}>{t('cover.prepared_by') || 'Prepared by'}</span>
              {data.VENDOR_NAME && (
                <span style={{
                  fontSize: 'clamp(14px, 1.1vw, 18px)',
                  fontWeight: 600,
                  color: theme.inkStrong || theme.ink,
                  lineHeight: 1.1,
                }}>{data.VENDOR_NAME}</span>
              )}
              {data.VENDOR_TITLE && (
                <span style={{
                  fontSize: 'clamp(11px, 0.85vw, 13px)',
                  color: theme.inkSecondary,
                  marginTop: 3,
                  letterSpacing: '0.02em',
                }}>{data.VENDOR_TITLE}</span>
              )}
            </div>
          )}
          <span style={styles.confidential}>{t('cover.confidential')}</span>
        </div>
      </div>
    </div>
  )
}
