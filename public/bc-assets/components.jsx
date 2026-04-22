/* Yuno BDM Deck \u2014 Shared Components */

const { useState, useEffect, useRef, useMemo } = React;

function YunoLogo({ size = 'md', color = 'currentColor', style = {} }) {
  const sizes = { sm: 18, md: 22, lg: 44, xl: 72 };
  const fs = typeof size === 'number' ? size : sizes[size] || 22;
  return (
    <span className="yuno-logo" style={{ fontSize: fs, color, fontWeight: 700, letterSpacing: '-0.04em', ...style }}>
      yuno
    </span>
  );
}

function YunoSymbol({ size = 40, color = 'currentColor' }) {
  const grid = [[1,1,0,1,1],[0,1,0,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]];
  const cell = size / 5;
  const r = cell * 0.32;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill={color}>
      {grid.map((row, y) => row.map((v, x) => v ? <circle key={`${x}-${y}`} cx={x*cell+cell/2} cy={y*cell+cell/2} r={r} /> : null))}
    </svg>
  );
}

function HalftoneBg({ color = '#3E4FE0', opacity = 0.5, density = 40, fadeDir = 'bottom', style = {}, animated = false }) {
  const id = useMemo(() => `halftone-${Math.random().toString(36).slice(2, 9)}`, []);
  const fade =
    fadeDir === 'bottom' ? 'linear-gradient(to bottom, #000 0%, transparent 100%)' :
    fadeDir === 'top' ? 'linear-gradient(to top, #000 0%, transparent 100%)' :
    fadeDir === 'left' ? 'linear-gradient(to left, #000 0%, transparent 100%)' :
    fadeDir === 'right' ? 'linear-gradient(to right, #000 0%, transparent 100%)' :
    fadeDir === 'radial' ? 'radial-gradient(circle at center, #000 0%, transparent 80%)' : null;
  return (
    <div className={'halftone-bg' + (animated ? ' halftone-drift' : '')} style={{ opacity, maskImage: fade || undefined, WebkitMaskImage: fade || undefined, ...style }}>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs><pattern id={id} x="0" y="0" width={density} height={density} patternUnits="userSpaceOnUse"><circle cx={density/2} cy={density/2} r={density*0.12} fill={color} /></pattern></defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
    </div>
  );
}

function OrbHalftone({ size = 800, color = '#3E4FE0', x = '60%', y = '40%', style = {} }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)', width: size, height: size, pointerEvents: 'none', ...style }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle at 50% 50%, ${color}66 0%, ${color}00 60%)`, filter: 'blur(20px)' }} />
      <HalftoneBg color={color} density={22} opacity={0.9} fadeDir="radial" style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden' }} />
    </div>
  );
}

function SlideFooter({ section, pageNum, total = 24, logoColor }) {
  return (
    <div className="slide-footer export-hidden">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <YunoLogo size={14} color={logoColor || 'currentColor'} />
        <span style={{ opacity: 0.6 }}>{'\u00B7'}</span>
        <span>{section}</span>
      </div>
      <div className="slide-pagenum">{String(pageNum).padStart(2, '0')} / {String(total).padStart(2, '0')}</div>
    </div>
  );
}

function SectionLabel({ children, color = 'currentColor' }) {
  return (
    <div className="t-subtitle-alt" style={{ position: 'absolute', top: 64, left: 80, color, display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ width: 24, height: 1, background: 'currentColor', opacity: 0.5 }} />
      {children}
    </div>
  );
}

function Counter({ value, duration = 1200, format = (v) => v, prefix = '', suffix = '', start = 0, delay = 0 }) {
  const [display, setDisplay] = useState(start);
  const slideRef = useRef(null);
  const hasAnimated = useRef(false);
  useEffect(() => {
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
            if (p < 1) requestAnimationFrame(animate); else setDisplay(value);
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
    const slide = slideRef.current?.closest('[data-deck-slide]');
    if (slide) obs.observe(slide, { attributes: true, attributeFilter: ['data-deck-active'] });
    return () => obs.disconnect();
  }, [value, duration, start, delay]);
  return <span ref={slideRef}>{prefix}{format(display)}{suffix}</span>;
}

function Placeholder({ label = 'image', style = {}, aspect }) {
  return (
    <div style={{ position: 'relative', background: 'repeating-linear-gradient(45deg, rgba(62,79,224,0.06), rgba(62,79,224,0.06) 10px, rgba(62,79,224,0.03) 10px, rgba(62,79,224,0.03) 20px)', border: '1px dashed rgba(62,79,224,0.35)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(62,79,224,0.6)', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', aspectRatio: aspect, ...style }}>{label}</div>
  );
}

function CornerTicks({ color = 'currentColor', opacity = 0.25, size = 20, margin = 64 }) {
  const s = { position: 'absolute', width: size, height: size, opacity };
  const bdr = `1.5px solid ${color}`;
  return (
    <>
      <span style={{ ...s, top: margin, left: margin, borderTop: bdr, borderLeft: bdr }} />
      <span style={{ ...s, top: margin, right: margin, borderTop: bdr, borderRight: bdr }} />
      <span style={{ ...s, bottom: margin, left: margin, borderBottom: bdr, borderLeft: bdr }} />
      <span style={{ ...s, bottom: margin, right: margin, borderBottom: bdr, borderRight: bdr }} />
    </>
  );
}

function ClientLogoMark({ name = 'client', color = 'currentColor', size = 44 }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', fontFamily: 'Titillium Web, sans-serif', fontWeight: 700, fontSize: size, letterSpacing: '-0.03em', textTransform: 'lowercase', color, padding: '4px 16px', border: '1.5px dashed currentColor', borderRadius: 8, opacity: 0.8 }}>{name}</span>;
}

Object.assign(window, { YunoLogo, YunoSymbol, HalftoneBg, OrbHalftone, SlideFooter, SectionLabel, Counter, Placeholder, CornerTicks, ClientLogoMark });
