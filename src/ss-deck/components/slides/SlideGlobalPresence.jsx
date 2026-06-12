import SlideBase from './SlideBase'
import BeamRule from '../BeamRule'
import offices from '../../data/offices.generated.json'
import { useTheme } from '../../lib/theme'
import { getCopy } from '../../lib/copy'

// Office list grouped by region for the sidebar. Labels on the map itself
// are omitted per the Plaid/Mercury pattern — dense clusters like London/
// Paris/Madrid can't be labeled in place without leader lines, and the
// sidebar reads faster at presentation distance.
// Region/city labels are localized at render time inside the component below.
// City names stay in their canonical English/local form (Mexico City stays
// Mexico City — translating to "Ciudad de México" would mean re-rendering
// the asset map labels too; we keep the city list as proper-noun-flavored).
const REGIONS = [
  { key: 'region_americas',    cities: ['New York', 'Miami', 'Mexico City', 'Bogota', 'Sao Paulo', 'Buenos Aires'] },
  { key: 'region_europe',      cities: ['London', 'Paris', 'Madrid', 'Oporto', 'Warsaw'] },
  { key: 'region_middle_east', cities: ['Dubai', 'Doha'] },
  { key: 'region_apac',        cities: ['Shanghai', 'Singapore'] },
]

export default function SlideGlobalPresence({ data }) {
  const theme = useTheme()
  const lang = data?.LANGUAGE || 'en'
  const t = (key) => getCopy(lang, key)
  const STATS = [
    { n: '15+', l: t('globalPresence.stat_offices') },
    { n: '4',   l: t('globalPresence.stat_continents') },
    { n: '24/7', l: t('globalPresence.stat_coverage') },
  ]

  // Map coastline stroke. On dark, full white reads against the orb
  // gradient. On light, we want the continents to read as a soft neutral
  // wash against the white surface — borderStrong gives ~0.20 ink, the
  // same weight as the dark version's 0.78 white once you account for
  // contrast. The world-map.svg uses currentColor for its strokes/fills,
  // so this single value drives both coastlines and any continent fill.
  // Light: full-strength Yuno brand blue. world-map.svg strokes off
  // currentColor (asset edited from "#FFFFFF" → "currentColor"). Soft
  // tints like accentSoft (#7C89EF) and the original low-alpha dark ink
  // were both reading as nearly-invisible against #F8F9FC, so we sit
  // on the brand accent at full opacity. Pin pulse rings stack on top
  // and stay readable against the continent strokes.
  const mapColor = theme.isLight ? theme.accent : 'rgba(255,255,255,0.78)'

  // Pulse ring: keep the blue tint in both themes so the pin animation
  // stays Yuno-branded. Slightly stronger on light so it reads against
  // the lighter map.
  const pulseBorder = theme.isLight
    ? 'rgba(62,79,224,0.55)'
    : 'rgba(124,137,239,0.7)'

  const styles = {
    body: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(14px, 1.4vw, 26px)',
      minHeight: 0,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: '24px',
    },
    headerLeft: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    },
    monoKicker: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'clamp(10px, 0.78vw, 13px)',
      fontWeight: 500,
      letterSpacing: '0.4px',
      color: theme.inkMuted,
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    },
    monoKickerCaret: {
      color: theme.accentSoft,
    },
    title: {
      fontFamily: 'var(--font-display)',
      fontSize: 'clamp(28px, 2.7vw, 52px)',
      fontWeight: 500,
      letterSpacing: '-1.2px',
      lineHeight: 1.1,
      color: theme.ink,
      margin: 0,
      marginBottom: 'clamp(14px, 1.5vw, 28px)',
    },
    titleAccent: {
      background: theme.isLight
        ? `linear-gradient(135deg, ${theme.accentDeep} 0%, ${theme.accent} 100%)`
        : `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accentPale} 50%, ${theme.accentPale} 100%)`,
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
    },
    subtitle: {
      fontSize: 'clamp(12px, 0.95vw, 16px)',
      fontWeight: 400,
      color: theme.inkSecondary,
      maxWidth: '480px',
      lineHeight: 1.55,
      marginTop: '6px',
    },
    statsRow: {
      display: 'flex',
      gap: 'clamp(18px, 1.8vw, 36px)',
    },
    statItem: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
    },
    statNumber: {
      fontFamily: 'var(--font-display)',
      fontSize: 'clamp(32px, 3.2vw, 62px)',
      fontWeight: 800,
      background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accentMid} 100%)`,
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      letterSpacing: '-1px',
      lineHeight: 1.05,
      fontVariantNumeric: 'tabular-nums',
    },
    statLabel: {
      fontSize: '18px',
      fontWeight: 600,
      color: theme.inkSecondary,
      textTransform: 'uppercase',
      letterSpacing: '1.8px',
      marginTop: '8px',
    },
    // Map + sidebar list. No container border, no rounded bg, no shadow — the
    // map floats on the slide canvas. Plaid / Mercury pattern.
    mapRow: {
      flex: 1,
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, 22%)',
      gap: 'clamp(24px, 2.4vw, 48px)',
      alignItems: 'center',
      minHeight: 0,
    },
    mapInner: {
      position: 'relative',
      width: '100%',
      aspectRatio: '2 / 1',
      // `color` drives the coastline stroke (and any continent fill)
      // via currentColor in the SVG. Dark: full-ish white to punch
      // through the orb. Light: dark-ink at borderStrong opacity so
      // the continents read as a quiet neutral wash on the white
      // surface, not a heavy block.
      color: mapColor,
    },
    mapImage: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      pointerEvents: 'none',
    },
    dotWrap: {
      position: 'absolute',
      width: 0,
      height: 0,
      pointerEvents: 'none',
    },
    dotCore: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 'clamp(12px, 0.95vw, 18px)',
      height: 'clamp(12px, 0.95vw, 18px)',
      transform: 'translate(-50%, -50%)',
      borderRadius: '50%',
      background: theme.accentMid,
      boxShadow: '0 0 0 4px rgba(89,103,228,0.25)',
      zIndex: 2,
    },
    dotPulse: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 'clamp(28px, 2.1vw, 40px)',
      height: 'clamp(28px, 2.1vw, 40px)',
      borderRadius: '50%',
      border: `1.5px solid ${pulseBorder}`,
      animation: 'pulseRing 2.6s ease-out infinite',
      pointerEvents: 'none',
      zIndex: 1,
    },
    // Sidebar: regions as column blocks. Uppercase tracked label + city list.
    sidebar: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'clamp(12px, 1.1vw, 20px)',
      alignSelf: 'stretch',
      justifyContent: 'center',
      paddingLeft: 'clamp(16px, 1.2vw, 24px)',
      borderLeft: `1px solid ${theme.borderSubtle}`,
    },
    regionBlock: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    },
    regionLabel: {
      fontSize: '18px',
      fontWeight: 700,
      letterSpacing: '2.4px',
      textTransform: 'uppercase',
      color: theme.isLight ? theme.accent : 'rgba(189,195,246,0.9)',
      marginBottom: '8px',
    },
    cityList: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      fontSize: '15px',
      fontWeight: 500,
      color: theme.ink,
      lineHeight: 1.4,
    },
  }

  return (
    <SlideBase section={t('section.about_yuno')} slideNumber={6}>
      <div className="stagger" style={{ ...styles.body, '--stagger-base': '0.1s', '--stagger-step': '0.12s' }}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <h2 style={styles.title}>
              {t('globalPresence.title_lead')} <span style={styles.titleAccent}>{t('globalPresence.title_accent')}</span>
            </h2>
            <p style={styles.subtitle}>
              {t('globalPresence.subtitle')}
            </p>
          </div>
          <div className="stagger" style={{ ...styles.statsRow, '--stagger-base': '0.3s', '--stagger-step': '0.08s' }}>
            {STATS.map((s) => (
              <div key={s.l} style={styles.statItem}>
                <span style={styles.statNumber}>{s.n}</span>
                <span style={styles.statLabel}>{s.l}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.monoKicker}>
          <span style={styles.monoKickerCaret}>&gt;</span>
          {t('globalPresence.kicker')}
          <BeamRule delay={4.5} base={theme.beamBase} beam={theme.beam} />
        </div>

        <div style={styles.mapRow}>
          <div style={styles.mapInner}>
            {theme.isLight ? (
              // SVG paths use stroke="#FFFFFF" hardcoded (so the dark
              // canvas always reads white). Light theme can't override
              // that via CSS color because the SVG, loaded through an
              // <img>, lives in its own document. Render as a masked
              // div instead — alpha from the SVG strokes clips a solid
              // theme.accent fill so the continents render in Yuno
              // blue without touching the asset.
              <div
                aria-hidden
                style={{
                  ...styles.mapImage,
                  backgroundColor: theme.accent,
                  WebkitMaskImage: 'url(/ss-deck-assets/world-map.svg)',
                  maskImage: 'url(/ss-deck-assets/world-map.svg)',
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                }}
              />
            ) : (
              <img src="/ss-deck-assets/world-map.svg" alt="" style={styles.mapImage} />
            )}
            {offices.map((o, i) => (
              <div
                key={o.city}
                style={{ ...styles.dotWrap, left: `${o.x}%`, top: `${o.y}%` }}
                aria-label={o.city}
              >
                <div
                  data-map-pulse
                  style={{
                    ...styles.dotPulse,
                    animationDelay: `${(i % 6) * 0.42}s`,
                  }}
                />
                <div style={styles.dotCore} />
              </div>
            ))}
          </div>

          <div className="stagger" style={{ ...styles.sidebar, '--stagger-base': '0.55s', '--stagger-step': '0.1s' }}>
            {REGIONS.map((r) => (
              <div key={r.key} style={styles.regionBlock}>
                <span style={styles.regionLabel}>{t(`globalPresence.${r.key}`)}</span>
                <div style={styles.cityList}>
                  {r.cities.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SlideBase>
  )
}
