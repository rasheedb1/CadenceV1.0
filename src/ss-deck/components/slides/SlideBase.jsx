import { useTheme } from '../../lib/theme'

// Per-slide chrome shared by every deck slide: section pill (top-left),
// Yuno wordmark (top-right), inner padding, optional slide number.
//
// Reads the active theme from context. Replit decks ship with theme
// 'light' (Nova-style white surface, dark ink, blue accents); every
// other merchant deck stays on the original dark canvas. The wordmark
// is a single-color white SVG, so on light the rendered img gets
// `filter: brightness(0)` to read as black without needing a
// duplicate asset.

export default function SlideBase({ section, slideNumber, children, customBg, theme: themeOverride }) {
  const theme = useTheme()
  // `theme` prop still supported for explicit override (legacy callers).
  const isLight = themeOverride === 'light' || (!themeOverride && theme.isLight)

  const styles = {
    slide: {
      width: '100%',
      height: '100%',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'var(--font)',
      background: isLight ? theme.bg : 'transparent',
      color: theme.ink,
    },
    content: {
      position: 'relative',
      zIndex: 1,
      width: '100%',
      height: '100%',
      padding: 'clamp(28px, 3.6%, 64px) clamp(36px, 4.8%, 90px) clamp(56px, 6.2%, 92px)',
      display: 'flex',
      flexDirection: 'column',
    },
    topBar: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 'clamp(20px, 2.4%, 44px)',
    },
    sectionLabel: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '10px',
      padding: '7px 16px',
      background: isLight ? theme.surface0 : 'var(--surface-0)',
      border: `1px solid ${isLight ? theme.borderSubtle : 'var(--border-subtle)'}`,
      borderRadius: '100px',
      fontSize: 'clamp(9px, 0.72vw, 11.5px)',
      fontWeight: 700,
      letterSpacing: '1.8px',
      textTransform: 'uppercase',
      color: isLight ? theme.inkMuted : 'var(--text-muted)',
      backdropFilter: 'blur(12px)',
    },
    sectionDot: {
      width: '5px',
      height: '5px',
      borderRadius: '50%',
      background: theme.accent,
    },
    yunoLogo: {
      height: 'clamp(16px, 1.5vw, 26px)',
      opacity: theme.logoOpacity,
      filter: theme.logoFilter,
    },
    slideNumber: {
      position: 'absolute',
      bottom: 'clamp(18px, 2.4%, 40px)',
      left: 'clamp(36px, 4.8%, 90px)',
      fontSize: 'clamp(10px, 0.72vw, 12px)',
      fontWeight: 700,
      color: theme.inkFaint,
      fontFamily: 'var(--font-mono)',
      fontVariantNumeric: 'tabular-nums',
      letterSpacing: '1.5px',
    },
  }

  const slideStyle = {
    ...styles.slide,
    ...(customBg ? { background: customBg } : {}),
  }

  return (
    <div style={slideStyle}>
      <div className="slide-enter" style={styles.content}>
        <div style={styles.topBar}>
          <span style={styles.sectionLabel}>
            <span style={styles.sectionDot} />
            {section}
          </span>
          <img src="/ss-deck-assets/assets/yuno-logo-white.svg" alt="Yuno" style={styles.yunoLogo} />
        </div>
        {children}
      </div>
      {/* SlideBase renders its own slide number only on the dark deck.
          The hardcoded values (slideNumber={2}, slideNumber={6}, etc.)
          were authored for the original 9-slide cut and don't match the
          12-slide Replit deck. SlideViewer/PrintViewer paint a single
          auto-numbered overlay for Replit instead. */}
      {slideNumber && !isLight && (
        <div style={styles.slideNumber}>
          {String(slideNumber).padStart(2, '0')} / 09
        </div>
      )}
    </div>
  )
}
