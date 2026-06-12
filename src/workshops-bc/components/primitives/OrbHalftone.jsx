import HalftoneBg from './HalftoneBg'

// Radial glow + halftone dots — hero decoration for section dividers and cover.
export default function OrbHalftone({ size = 800, color = '#3E4FE0', x = '60%', y = '40%', style = {} }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x, top: y,
        transform: 'translate(-50%, -50%)',
        width: size, height: size,
        pointerEvents: 'none',
        ...style,
      }}
    >
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: `radial-gradient(circle at 50% 50%, ${color}66 0%, ${color}00 60%)`,
        filter: 'blur(20px)',
      }} />
      <HalftoneBg
        color={color}
        density={22}
        opacity={0.9}
        fadeDir="radial"
        style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%', overflow: 'hidden',
        }}
      />
    </div>
  )
}
