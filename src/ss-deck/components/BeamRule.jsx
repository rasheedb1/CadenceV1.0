// Horizontal 1px rule with a bright beam that slides across, pauses, then
// repeats. Drop-in replacement for the static linear-gradient rule used
// next to section kickers ("> payment_topology ———").
//
// The base gradient stays as-is so the rule still reads when the beam is
// off-screen; the beam is a narrow centered highlight that travels via
// keyframed translateX (see `beamSlide` in index.css). Pass `base`/`beam`
// to match a different rule tint (e.g. Leadership's lavender sectionRule).

const DEFAULT_BASE =
  'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 100%)'

const DEFAULT_BEAM =
  'linear-gradient(90deg, transparent 0%, rgba(221,227,251,0.55) 50%, transparent 100%)'

export default function BeamRule({
  base = DEFAULT_BASE,
  beam = DEFAULT_BEAM,
  duration = 16,
  delay = 0,
  width = '24%',
  style,
}) {
  return (
    <span
      aria-hidden
      style={{
        flex: 1,
        height: '1px',
        background: base,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width,
          background: beam,
          animation: `beamSlide ${duration}s linear infinite`,
          animationDelay: `${delay}s`,
          willChange: 'transform',
        }}
      />
    </span>
  )
}
