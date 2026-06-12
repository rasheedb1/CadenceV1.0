import { useState } from 'react'
import { useTheme } from '../../lib/theme'
import { getCopy } from '../../lib/copy'

export default function SlideCTA({ data }) {
  const theme = useTheme()
  const lang = data?.LANGUAGE || 'en'
  const t = (key) => getCopy(lang, key)
  const [copied, setCopied] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [copyHovering, setCopyHovering] = useState(false)

  const deckUrl = data?.COMPANY_SLUG
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/m/${encodeURIComponent(data.COMPANY_SLUG)}`
    : (typeof window !== 'undefined' ? window.location.href : '')

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(deckUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Fallback for browsers / contexts without clipboard API access:
      // select the URL in a hidden input so the user can ⌘C manually.
      const ta = document.createElement('textarea')
      ta.value = deckUrl
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* noop */ }
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  const styles = {
    slide: {
      width: '100%',
      height: '100%',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'var(--font)',
    },
    bg: {
      position: 'absolute',
      inset: 0,
      background: theme.isLight
        ? `radial-gradient(ellipse at 30% 70%, rgba(62,79,224,0.08) 0%, ${theme.bg} 45%, ${theme.bg} 100%)`
        : 'radial-gradient(ellipse at 30% 70%, #1726A6 0%, #000000 40%, #000000 100%)',
    },
    orb1: {
      position: 'absolute',
      bottom: '-30%',
      left: '-15%',
      width: '70vw',
      height: '70vw',
      borderRadius: '50%',
      background: theme.isLight
        ? 'radial-gradient(circle, rgba(62,79,224,0.10) 0%, transparent 60%)'
        : 'radial-gradient(circle, rgba(62,79,224,0.2) 0%, transparent 60%)',
      filter: 'blur(80px)',
      animation: 'float 12s ease-in-out infinite',
    },
    orb2: {
      position: 'absolute',
      top: '-20%',
      right: '-15%',
      width: '50vw',
      height: '50vw',
      borderRadius: '50%',
      background: theme.isLight
        ? 'radial-gradient(circle, rgba(62,79,224,0.08) 0%, transparent 60%)'
        : 'radial-gradient(circle, rgba(62,79,224,0.15) 0%, transparent 60%)',
      filter: 'blur(80px)',
      animation: 'float 14s ease-in-out infinite reverse',
    },
    stripe1: {
      position: 'absolute',
      bottom: '-30%',
      left: '-8%',
      width: '42%',
      height: '160%',
      background: theme.isLight
        ? 'linear-gradient(160deg, rgba(62,79,224,0.06) 0%, rgba(189,195,246,0.03) 100%)'
        : 'linear-gradient(160deg, rgba(62,79,224,0.12) 0%, rgba(189,195,246,0.06) 100%)',
      transform: 'rotate(-20deg)',
      borderRadius: '80px',
    },
    stripe2: {
      position: 'absolute',
      bottom: '-20%',
      left: '8%',
      width: '25%',
      height: '140%',
      background: theme.isLight
        ? 'linear-gradient(160deg, rgba(30,32,48,0.03) 0%, transparent 100%)'
        : 'linear-gradient(160deg, rgba(255,255,255,0.05) 0%, transparent 100%)',
      transform: 'rotate(-20deg)',
      borderRadius: '80px',
    },
    // Closing brand wordmark — sits in the lower-right as a "signed by Yuno"
    // moment on the final slide. Opposite the slide counter (lower-left) so
    // they balance without stacking. Higher opacity than the cover/solution
    // watermarks because this is the brand sign-off, not atmospheric accent.
    closingWordmark: {
      position: 'absolute',
      right: 'clamp(36px, 4.8%, 90px)',
      bottom: 'clamp(22px, 2.8%, 44px)',
      width: 'clamp(110px, 9vw, 170px)',
      height: 'auto',
      opacity: 0.6,
      pointerEvents: 'none',
      userSelect: 'none',
      zIndex: 2,
    },
    content: {
      position: 'relative',
      zIndex: 1,
      width: '100%',
      height: '100%',
      padding: 'clamp(32px, 4%, 72px) clamp(40px, 5%, 96px) clamp(60px, 6.5%, 100px)',
      display: 'flex',
      flexDirection: 'column',
    },
    topRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionLabel: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '10px',
      padding: '7px 16px',
      background: theme.sectionLabelBg,
      border: `1px solid ${theme.sectionLabelBorder}`,
      borderRadius: '100px',
      fontSize: 'clamp(9px, 0.72vw, 11.5px)',
      fontWeight: 700,
      letterSpacing: '1.8px',
      textTransform: 'uppercase',
      color: theme.sectionLabelText,
      backdropFilter: 'blur(12px)',
    },
    sectionDot: {
      width: '5px',
      height: '5px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #3E4FE0 0%, #BDC3F6 100%)',
    },
    yunoLogo: {
      height: 'clamp(16px, 1.5vw, 26px)',
      opacity: theme.logoOpacity,
      filter: theme.logoFilter,
    },
    main: {
      flex: 1,
      display: 'flex',
      gap: '4%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 'clamp(20px, 2vw, 40px)',
    },
    left: {
      flex: 'none',
      maxWidth: '900px',
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(18px, 2vw, 32px)',
    },
    actionRow: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 'clamp(10px, 0.9vw, 16px)',
      marginTop: 'clamp(28px, 2.4vw, 44px)',
    },
    copyLinkBtn: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '12px',
      padding: 'clamp(14px, 1.2vw, 20px) clamp(22px, 1.8vw, 32px)',
      background: 'linear-gradient(135deg, #3E4FE0 0%, #5967E4 100%)',
      border: '1px solid rgba(124,137,239,0.6)',
      borderRadius: '14px',
      color: '#fff',
      fontSize: 'clamp(14px, 1.05vw, 17px)',
      fontWeight: 700,
      fontFamily: 'var(--font)',
      letterSpacing: '0.2px',
      cursor: 'pointer',
      transition: 'all 0.2s',
      boxShadow: '0 4px 20px rgba(62,79,224,0.32)',
    },
    title: {
      fontFamily: 'var(--font-display)',
      fontSize: 'clamp(40px, 4.2vw, 82px)',
      fontWeight: 500,
      letterSpacing: '-1.5px',
      lineHeight: 1.05,
      color: theme.ink,
    },
    accent: theme.isLight
      ? {
          background: `linear-gradient(135deg, ${theme.accentDeep} 0%, ${theme.accent} 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          color: 'transparent',
          fontWeight: 700,
        }
      : {
          background: 'linear-gradient(135deg, #3E4FE0 0%, #5967E4 50%, #BDC3F6 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundSize: '200% 200%',
          animation: 'gradientShift 8s ease-in-out infinite',
        },
    subtitle: {
      fontSize: 'clamp(18px, 1.5vw, 26px)',
      fontWeight: 400,
      lineHeight: 1.5,
      color: theme.inkSecondary,
      maxWidth: '95%',
    },
    stats: {
      display: 'flex',
      gap: 'clamp(20px, 2vw, 40px)',
      marginTop: 'clamp(10px, 1vw, 16px)',
    },
    stat: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    },
    statNum: {
      fontFamily: 'var(--font-display)',
      fontSize: 'clamp(26px, 2.5vw, 46px)',
      fontWeight: 700,
      color: theme.ink,
      letterSpacing: '-0.8px',
      lineHeight: 1,
      fontVariantNumeric: 'tabular-nums',
    },
    statLabel: {
      fontSize: 'clamp(11px, 0.82vw, 14px)',
      fontWeight: 600,
      color: theme.inkSecondary,
      letterSpacing: '1.4px',
      textTransform: 'uppercase',
      marginTop: '8px',
    },
    // "Download deck" anchor sits next to the "Copy link" CTA in the
    // action row below the stats. Outline style so the filled gradient
    // "Copy link" reads as the primary action — copy + send is the
    // common path; PDF download is the fallback for users who want a
    // local file.
    // Schedule-demo anchor — sized smaller than the primary Copy/Download
    // buttons so it reads as a tertiary CTA. Rendered as <a> (not button) so
    // Chromium's page.pdf() preserves the link annotation in the exported PDF.
    scheduleDemo: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: 'clamp(10px, 0.85vw, 14px) clamp(16px, 1.3vw, 22px)',
      background: 'linear-gradient(135deg, rgba(62,79,224,0.92) 0%, rgba(89,103,228,0.92) 100%)',
      border: '1px solid rgba(124,137,239,0.6)',
      borderRadius: '12px',
      color: '#fff',
      fontSize: 'clamp(12px, 0.9vw, 14px)',
      fontWeight: 700,
      fontFamily: 'var(--font)',
      letterSpacing: '0.2px',
      textDecoration: 'none',
      cursor: 'pointer',
      transition: 'all 0.2s',
      boxShadow: '0 3px 14px rgba(62,79,224,0.28)',
    },
    downloadDeck: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '12px',
      padding: 'clamp(14px, 1.2vw, 20px) clamp(22px, 1.8vw, 32px)',
      background: 'rgba(62,79,224,0.08)',
      border: '1px solid rgba(124,137,239,0.45)',
      borderRadius: '14px',
      color: theme.isLight ? theme.accentDeep : '#fff',
      fontSize: 'clamp(14px, 1.05vw, 17px)',
      fontWeight: 700,
      fontFamily: 'var(--font)',
      letterSpacing: '0.2px',
      textDecoration: 'none',
      cursor: 'pointer',
      transition: 'all 0.2s',
      boxShadow: '0 4px 20px rgba(62,79,224,0.18)',
    },
    slideNumber: {
      position: 'absolute',
      bottom: 'clamp(18px, 2.4%, 40px)',
      left: 'clamp(36px, 4.8%, 90px)',
      fontSize: 'clamp(10px, 0.72vw, 12px)',
      fontWeight: 700,
      color: theme.inkFaint,
      fontVariantNumeric: 'tabular-nums',
      letterSpacing: '1.5px',
    },
  }

  return (
    <div style={styles.slide}>
      <div style={styles.bg} />
      <div style={styles.orb1} />
      <div style={styles.orb2} />
      <div style={styles.stripe1} />
      <div style={styles.stripe2} />

      <div className="slide-enter" style={styles.content}>
        <div style={styles.topRow}>
          <span style={styles.sectionLabel}>
            <span style={styles.sectionDot} />
            {t('section.next_steps')}
          </span>
          <img src="/ss-deck-assets/assets/yuno-logo-white.svg" alt="Yuno" style={styles.yunoLogo} />
        </div>

        <div style={styles.main}>
          <div
            className="stagger"
            style={{
              ...styles.left,
              '--stagger-base': '0.15s',
              '--stagger-step': '0.12s',
            }}
          >
            <h2 style={styles.title}>
              {data?.MODE === 'banking' ? (
                <>
                  {t('cta.title_banking_lead')}{' '}
                  <span style={styles.accent}>{t('cta.title_banking_accent')}</span>
                </>
              ) : data?.MODE === 'partner' ? (
                <>
                  {t('cta.title_partner_lead')}{' '}
                  <span style={styles.accent}>{t('cta.title_partner_accent')}</span>
                </>
              ) : (
                <>
                  {t('cta.title_merchant_lead')}{' '}
                  <span style={styles.accent}>{t('cta.title_merchant_accent')}</span>
                </>
              )}
            </h2>
            <p style={styles.subtitle}>
              {data?.MODE === 'banking' ? (
                <>{t('cta.subtitle_banking')}</>
              ) : data?.MODE === 'partner' ? (
                <>{t('cta.subtitle_partner_pre')} <strong style={{ color: theme.ink }}>{data.COMPANY_NAME}</strong> {t('cta.subtitle_partner_post')}</>
              ) : (
                <>{t('cta.subtitle_merchant_pre')} <strong style={{ color: theme.ink }}>{data.COMPANY_NAME}</strong>{t('cta.subtitle_merchant_post')}</>
              )}
            </p>
            <div className="stagger" style={{ ...styles.stats, '--stagger-base': '0.42s', '--stagger-step': '0.08s' }}>
              {(data?.MODE === 'banking'
                ? [
                    { n: '+8pp', l: t('cta.stat_banking_auth') },
                    { n: '27',   l: t('cta.stat_banking_apms') },
                    { n: '21',   l: t('cta.stat_banking_countries') },
                  ]
                : data?.MODE === 'partner'
                ? [
                    { n: '2,000+', l: t('cta.stat_partner_merchants') },
                    { n: '$80B+',  l: t('cta.stat_partner_tpv') },
                    { n: t('cta.stat_weeks'), l: t('cta.stat_partner_activate') },
                  ]
                : [
                    { n: '+3–8%', l: t('cta.stat_auth_uplift') },
                    { n: '25%+',  l: t('cta.stat_declines_recovered') },
                    { n: t('cta.stat_weeks'), l: t('cta.stat_to_launch') },
                  ]
              ).map((s) => (
                <div key={s.l} style={styles.stat}>
                  <div style={styles.statNum}>{s.n}</div>
                  <div style={styles.statLabel}>{s.l}</div>
                </div>
              ))}
            </div>

            <div style={styles.actionRow}>
              {/* Schedule a demo — anchor (not button) so the link annotation
                  survives Chromium's page.pdf() export and the merchant can
                  click straight through from the printed PDF. */}
              <a
                href="https://y.uno/book-a-demo"
                target="_blank"
                rel="noopener noreferrer"
                style={styles.scheduleDemo}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 5px 18px rgba(62,79,224,0.42)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 3px 14px rgba(62,79,224,0.28)'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>{t('cta.schedule_demo')}</span>
              </a>
              <button
                type="button"
                onClick={handleCopyLink}
                style={{
                  ...styles.copyLinkBtn,
                  transform: copyHovering ? 'scale(1.02)' : 'scale(1)',
                  boxShadow: copyHovering
                    ? '0 8px 32px rgba(62,79,224,0.5)'
                    : '0 4px 20px rgba(62,79,224,0.32)',
                }}
                onMouseEnter={() => setCopyHovering(true)}
                onMouseLeave={() => setCopyHovering(false)}
              >
                {copied ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{t('cta.link_copied')}</span>
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    <span>{t('cta.copy_link')}</span>
                  </>
                )}
              </button>

              {data?.COMPANY_SLUG && (
                <a
                  data-download-deck
                  href={`https://bridge.yuno.tools/api/m/${encodeURIComponent(data.COMPANY_SLUG)}/pdf`}
                  download={`Yuno-${data.COMPANY_NAME || data.COMPANY_SLUG}-deck.pdf`}
                  style={{
                    ...styles.downloadDeck,
                    transform: hovering ? 'scale(1.02)' : 'scale(1)',
                  }}
                  onMouseEnter={(e) => {
                    setHovering(true)
                    e.currentTarget.style.background = 'rgba(62,79,224,0.18)'
                    e.currentTarget.style.borderColor = 'rgba(124,137,239,0.75)'
                  }}
                  onMouseLeave={(e) => {
                    setHovering(false)
                    e.currentTarget.style.background = 'rgba(62,79,224,0.08)'
                    e.currentTarget.style.borderColor = 'rgba(124,137,239,0.45)'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>{t('cta.download_pdf')}</span>
                </a>
              )}
            </div>
            {(data?.VENDOR_NAME || data?.VENDOR_TITLE) && (
              <div style={{
                marginTop: 'clamp(20px, 1.8vw, 32px)',
                paddingTop: 'clamp(16px, 1.4vw, 26px)',
                borderTop: `1px solid ${theme.borderSubtle || 'rgba(255,255,255,0.12)'}`,
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'clamp(9px, 0.7vw, 11px)',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: theme.inkMuted,
                  marginBottom: 4,
                }}>{t('cta.prepared_by') || 'Prepared by'}</span>
                {data.VENDOR_NAME && (
                  <span style={{
                    fontSize: 'clamp(15px, 1.15vw, 19px)',
                    fontWeight: 600,
                    color: theme.inkStrong || theme.ink,
                    lineHeight: 1.15,
                  }}>{data.VENDOR_NAME}</span>
                )}
                {data.VENDOR_TITLE && (
                  <span style={{
                    fontSize: 'clamp(12px, 0.9vw, 14px)',
                    color: theme.inkSecondary,
                    letterSpacing: '0.02em',
                  }}>{data.VENDOR_TITLE}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Hardcoded "09 / 09" reflects the original 9-slide cut. Replit
          (light theme) renders 12 slides total, so the viewer paints
          the canonical auto-numbered overlay instead. */}
      {!theme.isLight && <div style={styles.slideNumber}>09 / 09</div>}
    </div>
  )
}
