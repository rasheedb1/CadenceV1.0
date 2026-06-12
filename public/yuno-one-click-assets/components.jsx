/* ============================================================
   Yuno SDR Business Case Deck — Shared Components
   Nova-light redesign (2026-05-14)

   Public exports (set on window so slides-01-context.jsx and
   slides-02-business-case.jsx can find them without imports):
     // New (Nova-light)
     BeamRule          — animated 1px rule + sliding light beam
     MonoKicker        — > caret + lowercase mono label + BeamRule
     SlideChrome       — top section pill + wordmark + page num + footer
     StatCard          — number + label, used inside cards
     // Legacy (kept so any old reference still resolves)
     YunoLogo, YunoSymbol, HalftoneBg, OrbHalftone,
     SlideFooter, SectionLabel, Counter, Placeholder,
     CornerTicks, ClientLogoMark
   ============================================================ */

const { useState, useEffect, useRef, useMemo } = React;

// =============================================================================
// Yuno wordmark — Geist-flavored bold lockup, "yuno" lowercase
// =============================================================================
function YunoLogo({ size = 'md', color = 'currentColor', style = {} }) {
  const sizes = { sm: 20, md: 26, lg: 44, xl: 72 };
  const fs = typeof size === 'number' ? size : (sizes[size] || 26);
  return (
    <span
      className="yuno-logo"
      style={{
        fontSize: fs,
        color,
        fontFamily: 'var(--font)',
        fontWeight: 800,
        letterSpacing: '-0.05em',
        textTransform: 'lowercase',
        ...style,
      }}
    >
      yuno
    </span>
  );
}

// =============================================================================
// BeamRule — 1px rule with a bright beam that slides across.
// Ported from yuno-payments/yuno-sales-pitch-maker src/components/BeamRule.jsx.
// Drop next to section kickers and titles. Animation pauses off-screen for ~60%
// of the cycle so it reads as "alive but quiet" rather than a constant stream.
// =============================================================================
function BeamRule({ duration = 16, delay = 0, width = '28%', base, beam, style = {} }) {
  return (
    <span
      aria-hidden
      style={{
        flex: 1,
        height: 1,
        position: 'relative',
        overflow: 'hidden',
        background: base || 'var(--beam-base)',
        ...style,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: width,
          background: beam || 'var(--beam-bright)',
          animation: 'beamSlide ' + duration + 's linear infinite',
          animationDelay: delay + 's',
          willChange: 'transform',
        }}
      />
    </span>
  );
}

// =============================================================================
// MonoKicker — > caret + lowercase mono label + optional BeamRule
// The signature pattern from pitch-maker that sits above titles.
// Pass `beam={false}` to skip the trailing rule.
// =============================================================================
function MonoKicker({ children, beam = true, beamDelay = 1.5, beamProps = {}, style = {} }) {
  return (
    <div className="mono-kicker" style={style}>
      <span className="caret">{'>'}</span>
      <span>{children}</span>
      {beam && <BeamRule delay={beamDelay} {...beamProps} />}
    </div>
  );
}

// =============================================================================
// SlideChrome — top-bar (section pill + wordmark) + bottom page num + footer.
// Every redesigned slide wraps its body in this for consistent wayfinding.
// =============================================================================
function SlideChrome({ section, pageNum, total = 28, footer = 'YUNO · SDR Business Case' }) {
  return (
    <>
      <div className="slide-topbar">
        <span className="section-pill"><span className="dot" />{section}</span>
        <span className="yuno-wordmark">yuno</span>
      </div>
      <div className="slide-pagenum">
        {String(pageNum).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </div>
      <div className="slide-footer-text">{footer}</div>
    </>
  );
}

// =============================================================================
// StatCard — number + label + optional sub-line. Use inside .card-nova.
// =============================================================================
function StatCard({ value, label, sub, color = 'var(--accent)', size = 64 }) {
  return (
    <div>
      <div
        className="t-number"
        style={{
          fontSize: size,
          fontWeight: 300,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          color,
        }}
      >
        {value}
      </div>
      <div
        className="t-label"
        style={{ marginTop: 12, color: 'var(--ink-muted)' }}
      >
        {label}
      </div>
      {sub && (
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// LEGACY components — kept so any reference in old code still resolves.
// New slides should prefer the Nova-light primitives above.
// =============================================================================

// Dot-matrix Y symbol (legacy brandbook)
function YunoSymbol({ size = 40, color = 'currentColor' }) {
  const grid = [
    [1,1,0,1,1],
    [0,1,0,1,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
  ];
  const cell = size / 5;
  const r = cell * 0.32;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill={color}>
      {grid.map((row, y) =>
        row.map((v, x) =>
          v ? (
            <circle key={`${x}-${y}`} cx={x * cell + cell / 2} cy={y * cell + cell / 2} r={r} />
          ) : null
        )
      )}
    </svg>
  );
}

// Halftone dot background (still used by some slides for decorative depth)
function HalftoneBg({
  color = '#3E4FE0',
  opacity = 0.5,
  density = 40,
  fadeDir = 'bottom',
  style = {},
  animated = false,
}) {
  const id = useMemo(() => `halftone-${Math.random().toString(36).slice(2, 9)}`, []);
  const fade =
    fadeDir === 'bottom' ? 'linear-gradient(to bottom, #000 0%, transparent 100%)' :
    fadeDir === 'top' ? 'linear-gradient(to top, #000 0%, transparent 100%)' :
    fadeDir === 'left' ? 'linear-gradient(to left, #000 0%, transparent 100%)' :
    fadeDir === 'right' ? 'linear-gradient(to right, #000 0%, transparent 100%)' :
    fadeDir === 'radial' ? 'radial-gradient(circle at center, #000 0%, transparent 80%)' :
    null;

  return (
    <div
      className={'halftone-bg' + (animated ? ' halftone-drift' : '')}
      style={{
        opacity,
        maskImage: fade || undefined,
        WebkitMaskImage: fade || undefined,
        ...style,
      }}
    >
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={id} x="0" y="0" width={density} height={density} patternUnits="userSpaceOnUse">
            <circle cx={density/2} cy={density/2} r={density*0.12} fill={color} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
    </div>
  );
}

// Orb halftone — kept for legacy hero slides
function OrbHalftone({ size = 800, color = '#3E4FE0', x = '60%', y = '40%', style = {} }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        width: size,
        height: size,
        pointerEvents: 'none',
        ...style,
      }}
    >
      <div style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        background: `radial-gradient(circle at 50% 50%, ${color}66 0%, ${color}00 60%)`,
        filter: 'blur(20px)',
      }} />
      <HalftoneBg
        color={color}
        density={22}
        opacity={0.9}
        fadeDir="radial"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          overflow: 'hidden',
        }}
      />
    </div>
  );
}

// Legacy slide footer (kept so any old slide reference still resolves)
function SlideFooter({ section, pageNum, total = 28, logoColor }) {
  return (
    <div className="slide-footer export-hidden">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <YunoLogo size="sm" color={logoColor || 'currentColor'} />
        <span style={{ opacity: 0.5 }}>·</span>
        <span>{section}</span>
      </div>
      <div className="slide-pagenum" style={{ position: 'static', color: 'inherit', fontFamily: 'var(--font-mono)' }}>
        {String(pageNum).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </div>
    </div>
  );
}

// Legacy section label (kept so any old slide reference still resolves)
function SectionLabel({ children, color = 'currentColor' }) {
  return (
    <div className="t-subtitle-alt"
      style={{
        position: 'absolute',
        top: 64,
        left: 96,
        color,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: 'var(--accent)',
      }} />
      {children}
    </div>
  );
}

// =============================================================================
// Counter — animate a number 0 → target on slide activation.
// Print-mode safe (jumps straight to final value when body.bc-print is set).
// =============================================================================
function Counter({ value, duration = 1200, format = (v) => v, prefix = '', suffix = '', start = 0, delay = 0 }) {
  const isPrintMode = typeof document !== 'undefined'
    && document.body
    && document.body.classList.contains('bc-print');
  const [display, setDisplay] = useState(isPrintMode ? value : start);
  const slideRef = useRef(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (isPrintMode) {
      setDisplay(value);
      return;
    }
    const tick = () => {
      if (!slideRef.current) return;
      const slide = slideRef.current.closest('[data-deck-slide]');
      if (slide && slide.hasAttribute('data-deck-active') && !hasAnimated.current) {
        hasAnimated.current = true;
        setTimeout(() => {
          const startT = performance.now();
          const animate = (t) => {
            const p = Math.min(1, (t - startT) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setDisplay(start + (value - start) * eased);
            if (p < 1) requestAnimationFrame(animate);
            else setDisplay(value);
          };
          requestAnimationFrame(animate);
        }, delay);
      } else if (slide && !slide.hasAttribute('data-deck-active')) {
        hasAnimated.current = false;
        setDisplay(start);
      }
    };
    tick();
    const obs = new MutationObserver(tick);
    const slide = slideRef.current && slideRef.current.closest('[data-deck-slide]');
    if (slide) obs.observe(slide, { attributes: true, attributeFilter: ['data-deck-active'] });
    return () => obs.disconnect();
  }, [value, duration, start, delay, isPrintMode]);

  return (
    <span ref={slideRef}>
      {prefix}{format(display)}{suffix}
    </span>
  );
}

// Placeholder / CornerTicks / ClientLogoMark — kept for legacy
function Placeholder({ label = 'image', style = {}, aspect }) {
  return (
    <div
      style={{
        position: 'relative',
        background: `repeating-linear-gradient(
          45deg,
          rgba(62,79,224,0.06),
          rgba(62,79,224,0.06) 10px,
          rgba(62,79,224,0.03) 10px,
          rgba(62,79,224,0.03) 20px
        )`,
        border: '1px dashed rgba(62,79,224,0.35)',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(62,79,224,0.6)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        aspectRatio: aspect,
        ...style,
      }}
    >
      {label}
    </div>
  );
}

function CornerTicks({ color = 'currentColor', opacity = 0.25, size = 20, margin = 64 }) {
  const tick = (pos) => ({ position: 'absolute', width: size, height: 1, background: color, opacity, ...pos });
  const tickV = (pos) => ({ position: 'absolute', width: 1, height: size, background: color, opacity, ...pos });
  return (
    <>
      <div style={tick({ top: margin, left: margin })} />
      <div style={tickV({ top: margin, left: margin })} />
      <div style={tick({ top: margin, right: margin })} />
      <div style={tickV({ top: margin, right: margin })} />
      <div style={tick({ bottom: margin, left: margin })} />
      <div style={tickV({ bottom: margin - size + 1, left: margin })} />
      <div style={tick({ bottom: margin, right: margin })} />
      <div style={tickV({ bottom: margin - size + 1, right: margin })} />
    </>
  );
}

function ClientLogoMark({ name = 'client', color = 'currentColor', size = 32 }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      fontFamily: 'var(--font)',
      fontWeight: 600,
      fontSize: size,
      letterSpacing: '-0.02em',
      textTransform: 'capitalize',
      color,
      opacity: 0.95,
    }}>
      {name}
    </span>
  );
}

// =============================================================================
// Export for the rest of the deck
// =============================================================================
Object.assign(window, {
  // Nova-light primitives
  BeamRule,
  MonoKicker,
  SlideChrome,
  StatCard,
  // Legacy / shared
  YunoLogo,
  YunoSymbol,
  HalftoneBg,
  OrbHalftone,
  SlideFooter,
  SectionLabel,
  Counter,
  Placeholder,
  CornerTicks,
  ClientLogoMark,
});
