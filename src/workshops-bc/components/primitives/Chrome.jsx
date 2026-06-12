// Yuno wordmark + section label + footer — the chrome around every slide.

export function YunoLogo({ size = 'md', color = 'currentColor', style = {} }) {
  const sizes = { sm: 18, md: 22, lg: 44, xl: 72 }
  const fs = typeof size === 'number' ? size : sizes[size] || 22
  return (
    <span
      className="yuno-logo"
      style={{
        fontFamily: 'Titillium Web, sans-serif',
        fontSize: fs,
        color,
        fontWeight: 700,
        letterSpacing: '-0.04em',
        textTransform: 'lowercase',
        display: 'inline-flex',
        alignItems: 'center',
        lineHeight: 1,
        ...style,
      }}
    >
      yuno
    </span>
  )
}

export function SectionLabel({ children, color = 'currentColor' }) {
  return (
    <div
      className="t-subtitle-alt"
      style={{
        position: 'absolute',
        top: 64,
        left: 80,
        color,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontFamily: 'Titillium Web, sans-serif',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.16em',
        fontSize: 12,
      }}
    >
      <span style={{ width: 24, height: 1, background: 'currentColor', opacity: 0.5 }} />
      {children}
    </div>
  )
}

export function SlideFooter({ section, pageNum, total = 26, logoColor }) {
  return (
    <div className="slide-footer">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <YunoLogo size={14} color={logoColor || 'currentColor'} />
        <span style={{ opacity: 0.6 }}>·</span>
        <span>{section}</span>
      </div>
      <div className="slide-pagenum">
        {String(pageNum).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </div>
    </div>
  )
}

// Brand mark for the client. Resolution order:
//   1. logoUrl (any image URL the deck data carries) → render <img>, no chrome
//   2. Known brand → render the built-in vector mark (e.g. Coppel)
//   3. Fallback → dashed box with the name
export function ClientLogoMark({ name = 'client', logoUrl, color = 'currentColor', size = 44 }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        style={{ height: size * 1.5, maxWidth: 320, objectFit: 'contain', display: 'inline-block' }}
      />
    )
  }
  const slug = name.toLowerCase().trim()
  if (slug === 'coppel') return <CoppelMark color={color} size={size} />
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      fontFamily: 'Titillium Web, sans-serif',
      fontWeight: 700,
      fontSize: size,
      letterSpacing: '-0.03em',
      textTransform: 'lowercase',
      color,
      padding: '4px 16px',
      border: '1.5px dashed currentColor',
      borderRadius: 8,
      opacity: 0.8,
    }}>
      {name}
    </span>
  )
}

// Coppel official-feel mark: 1 big + 2 smaller yellow dots + "Coppel"
// wordmark. `color` drives the wordmark so it adapts to dark/light themes
// (yellow dots stay yellow — they are the brand signal). `size` is the
// reference font-size so the mark scales with surrounding type.
function CoppelMark({ color = '#fff', size = 44 }) {
  const big = Math.round(size * 1.05)
  const sm = Math.round(size * 0.52)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}>
      <span style={{
        width: big, height: big, borderRadius: '50%',
        background: '#FFCD00', display: 'inline-block',
      }} />
      <span style={{
        width: sm, height: sm, borderRadius: '50%',
        background: '#FFCD00', display: 'inline-block',
        marginLeft: Math.round(size * 0.08),
      }} />
      <span style={{
        width: sm, height: sm, borderRadius: '50%',
        background: '#FFCD00', display: 'inline-block',
        marginLeft: Math.round(size * 0.08),
      }} />
      <span style={{
        marginLeft: Math.round(size * 0.22),
        fontFamily: 'Titillium Web, sans-serif',
        fontWeight: 700,
        fontSize: Math.round(size * 1.25),
        letterSpacing: '-0.025em',
        color,
        lineHeight: 1,
      }}>Coppel</span>
    </span>
  )
}
