import { createContext, useContext } from 'react'

// Per-deck theming. Replit (slug === 'replit') gets a Nova-style white
// surface so JP's CEO-bound deck matches the modern Yuno look that
// conciergenova.yuno.tools ships. Every other merchant deck stays on
// the original dark canvas — no global change.
//
// Slides consume a token bundle via `useTheme()`:
//   const t = useTheme()
//   color: t.ink                  // primary text
//   color: t.inkSecondary         // body copy
//   background: t.bgElevated      // cards / panels
//   border: `1px solid ${t.borderDefault}`
//
// Brand accents (yuno blue ramp) stay the same in both themes — only
// neutrals and surfaces flip. That keeps the gradient titles, button
// fills, and chart colors recognizably Yuno regardless of theme.

const accents = {
  accent: '#3E4FE0',
  accentDeep: '#1726A6',
  accentMid: '#5967E4',
  accentSoft: '#7C89EF',
  accentPale: '#BDC3F6',
  success: '#16A34A',
  warning: '#EA580C',
}

const dark = {
  ...accents,
  isDark: true,
  isLight: false,
  bg: '#000000',
  bgStage: '#05060B',
  bgElevated: '#282A30',
  ink: 'rgba(255, 255, 255, 0.92)',
  inkStrong: '#FFFFFF',
  inkSecondary: 'rgba(255, 255, 255, 0.72)',
  inkMuted: 'rgba(255, 255, 255, 0.48)',
  inkFaint: 'rgba(255, 255, 255, 0.24)',
  surface0: 'rgba(255, 255, 255, 0.03)',
  surface1: 'rgba(255, 255, 255, 0.06)',
  surface2: 'rgba(255, 255, 255, 0.10)',
  surface3: 'rgba(255, 255, 255, 0.14)',
  borderSubtle: 'rgba(255, 255, 255, 0.06)',
  borderDefault: 'rgba(255, 255, 255, 0.10)',
  borderStrong: 'rgba(255, 255, 255, 0.18)',
  borderAccent: 'rgba(62, 79, 224, 0.45)',
  // Decorative
  cardGradient:
    'linear-gradient(160deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.55) 100%)',
  cardGradientAccent:
    'linear-gradient(160deg, rgba(62,79,224,0.10) 0%, rgba(0,0,0,0.55) 100%)',
  cardShadow: 'none',
  // Beam rule (1px horizontal accent line) base + traveling beam
  beamBase:
    'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 100%)',
  beam:
    'linear-gradient(90deg, transparent 0%, rgba(221,227,251,0.55) 50%, transparent 100%)',
  // Logo treatment for SlideBase wordmark (white SVG)
  logoFilter: 'none',
  logoOpacity: 0.85,
  // SectionLabel pill in SlideBase
  sectionLabelBg: 'rgba(255, 255, 255, 0.03)',
  sectionLabelBorder: 'rgba(255, 255, 255, 0.06)',
  sectionLabelText: 'rgba(255, 255, 255, 0.48)',
  // Globe / orb background visibility
  orbVisible: true,
  // Founder photo / merchant logo treatment hooks
  // (slides may invert merchant logos via `filter: brightness(0) invert(1)`
  // for dark; in light they should stay as-is)
  invertLogos: true,
}

const light = {
  ...accents,
  isDark: false,
  isLight: true,
  bg: '#F8F9FC',
  bgStage: '#F8F9FC',
  bgElevated: '#FFFFFF',
  ink: '#1E2030',
  inkStrong: '#0F1020',
  inkSecondary: 'rgba(30, 32, 48, 0.74)',
  inkMuted: 'rgba(30, 32, 48, 0.56)',
  inkFaint: 'rgba(30, 32, 48, 0.36)',
  surface0: 'rgba(30, 32, 48, 0.03)',
  surface1: 'rgba(30, 32, 48, 0.05)',
  surface2: 'rgba(30, 32, 48, 0.08)',
  surface3: 'rgba(30, 32, 48, 0.12)',
  borderSubtle: 'rgba(30, 32, 48, 0.08)',
  borderDefault: 'rgba(30, 32, 48, 0.12)',
  borderStrong: 'rgba(30, 32, 48, 0.20)',
  borderAccent: 'rgba(62, 79, 224, 0.40)',
  cardGradient: '#FFFFFF',
  cardGradientAccent:
    'linear-gradient(160deg, rgba(62,79,224,0.05) 0%, rgba(255,255,255,1) 100%)',
  cardShadow:
    '0 1px 3px rgba(30, 32, 48, 0.04), 0 8px 24px rgba(30, 32, 48, 0.04)',
  beamBase:
    'linear-gradient(90deg, rgba(30,32,48,0.18) 0%, rgba(30,32,48,0) 100%)',
  beam:
    'linear-gradient(90deg, transparent 0%, rgba(62,79,224,0.55) 50%, transparent 100%)',
  // White SVG wordmark → flatten to black on light surface
  logoFilter: 'brightness(0)',
  logoOpacity: 0.92,
  sectionLabelBg: 'rgba(30, 32, 48, 0.04)',
  sectionLabelBorder: 'rgba(30, 32, 48, 0.10)',
  sectionLabelText: 'rgba(30, 32, 48, 0.62)',
  orbVisible: false,
  invertLogos: false,
}

export const THEMES = { dark, light }

const ThemeContext = createContext(dark)

export function ThemeProvider({ theme = 'dark', children }) {
  const value = THEMES[theme] || dark
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
