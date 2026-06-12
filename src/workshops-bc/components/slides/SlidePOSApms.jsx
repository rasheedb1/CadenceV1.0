// SlidePOSApms — Yuno SDK enables alternative payment methods (APMs)
// to be displayed and processed directly inside the BanCoppel terminal,
// without any firmware change. Left half explains; right half shows a
// stylized terminal screen rendering a CoDi QR.

import { QrCode, Smartphone, CreditCard, Wallet, Building2 } from 'lucide-react'
import HalftoneBg from '../primitives/HalftoneBg'
import OrbHalftone from '../primitives/OrbHalftone'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'

const APMS = [
  {
    Icon: QrCode,
    name: 'CoDi',
    sub: 'QR generado en la terminal · Banxico',
    primary: true,
  },
  {
    Icon: Wallet,
    name: 'Mercado Pago',
    sub: 'wallet · QR dinámico',
  },
  {
    Icon: Smartphone,
    name: 'SPEI con QR',
    sub: 'tarjetas no, cuentas sí',
  },
  {
    Icon: CreditCard,
    name: 'BNPL / cuotas',
    sub: 'Aplazo, Kueski, Mercado Crédito',
  },
]

// Builds a flat array of booleans (on/off) for an n×n QR-style matrix.
// Reproduces the canonical visual structure of a Version-3 QR code:
//   - 3 finder patterns (7×7) at top-left, top-right, bottom-left
//   - 1-module-wide separator (white) around each finder
//   - timing patterns (alternating modules on row 6 and column 6)
//   - 1 alignment pattern (5×5) near the bottom-right
//   - data area filled with a deterministic pseudo-random pattern so
//     the same QR renders identically on every paint.
function buildQrModules(n = 25) {
  const m = Array.from({ length: n }, () => Array(n).fill(false))

  // Finder pattern: 7×7 with black outer ring + 3×3 black center.
  const drawFinder = (r, c) => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        const onOuter = i === 0 || i === 6 || j === 0 || j === 6
        const onCenter = i >= 2 && i <= 4 && j >= 2 && j <= 4
        m[r + i][c + j] = onOuter || onCenter
      }
    }
  }
  drawFinder(0, 0)
  drawFinder(0, n - 7)
  drawFinder(n - 7, 0)

  // Timing patterns — alternating modules between finders on row 6 / col 6.
  for (let k = 8; k < n - 8; k++) {
    m[6][k] = k % 2 === 0
    m[k][6] = k % 2 === 0
  }

  // Alignment pattern (5×5) typically at (n-9, n-9) for Version 2+
  const ar = n - 9
  const ac = n - 9
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const onOuter = i === 0 || i === 4 || j === 0 || j === 4
      const onCenter = i === 2 && j === 2
      m[ar + i][ac + j] = onOuter || onCenter
    }
  }

  // Dark module — fixed black square at (n-8, 8), a real QR feature.
  m[n - 8][8] = true

  // Pseudo-random data area. Skip reserved regions (finders + their
  // separators + timing patterns + alignment area + format/version bits).
  const inFinder = (r, c) => (
    (r < 8 && c < 8) ||
    (r < 8 && c >= n - 8) ||
    (r >= n - 8 && c < 8)
  )
  const inAlignment = (r, c) => (
    r >= ar && r <= ar + 4 && c >= ac && c <= ac + 4
  )
  const inTiming = (r, c) => r === 6 || c === 6

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (inFinder(r, c) || inAlignment(r, c) || inTiming(r, c)) continue
      // LCG-flavored pseudo-random — stable per (r,c).
      const s = (r * 1103515245 + c * 12345 + 17) >>> 0
      m[r][c] = ((s ^ (s >>> 7)) & 0xFF) > 110
    }
  }

  return m.flat()
}

// Stylized terminal device — used as the visual anchor on the right.
function TerminalMock() {
  return (
    <div style={{
      position: 'relative',
      width: 380, height: 540,
      borderRadius: 28,
      background: 'linear-gradient(160deg, #1A1D24 0%, #0E1014 100%)',
      border: '1px solid rgba(255,255,255,0.10)',
      boxShadow: '0 30px 80px rgba(40,42,48,0.45), 0 0 0 6px rgba(62,79,224,0.08)',
      padding: 16,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* device top bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '4px 10px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        marginBottom: 12,
      }}>
        <span className="mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.14em' }}>
          BANCOPPEL · POS
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: '#E0ED80' }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%', background: '#E0ED80',
            animation: 'splitPulseWin 1.6s ease-in-out infinite',
          }} />
          YUNO SDK
        </span>
      </div>

      {/* screen body */}
      <div style={{
        flex: 1, borderRadius: 18,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: 22,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="t-label" style={{ color: '#BDC3F6', fontSize: 9, marginBottom: 6 }}>
            paga con codi
          </div>
          <div className="num-tabular" style={{
            fontFamily: 'Geist Mono, ui-monospace, monospace',
            fontSize: 26, fontWeight: 300, color: '#fff', letterSpacing: '-0.02em',
          }}>
            $1,490.<span style={{ color: 'rgba(255,255,255,0.5)' }}>00</span>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            MXN · pedido #82130
          </div>
        </div>

        {/* Fake QR — 25×25 modules with real finder/timing/alignment patterns
            so it reads as a believable CoDi/SPEI code at glance. Built once
            per render via buildQrModules(); modules tile with no gap. */}
        <div style={{
          alignSelf: 'center',
          width: 220, height: 220, padding: 10, borderRadius: 14,
          background: '#fff',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.10), 0 18px 40px rgba(62,79,224,0.35)',
          animation: 'qrShimmer 4s ease-in-out infinite',
        }}>
          <div style={{
            width: '100%', height: '100%',
            display: 'grid',
            gridTemplateColumns: 'repeat(25, 1fr)',
            gridTemplateRows: 'repeat(25, 1fr)',
            gap: 0,
          }}>
            {buildQrModules(25).map((on, i) => (
              <span key={i} style={{
                background: on ? '#0E1014' : 'transparent',
              }} />
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999,
            background: 'rgba(224,237,128,0.14)',
            border: '1px solid rgba(224,237,128,0.40)',
            color: '#E0ED80', fontSize: 9, fontWeight: 700,
            letterSpacing: '0.16em', textTransform: 'uppercase',
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%', background: '#E0ED80',
              animation: 'splitPulseWin 1.6s ease-in-out infinite',
            }} />
            esperando escaneo · spei
          </div>
        </div>
      </div>

      {/* device bottom (speaker/handle) */}
      <div style={{
        marginTop: 10, height: 4, borderRadius: 2,
        background: 'rgba(255,255,255,0.10)', alignSelf: 'center', width: 80,
      }} />
    </div>
  )
}

// eslint-disable-next-line no-unused-vars
export default function SlidePOSApms({ data, pageNum, total, lang = 'es' }) {
  const name = data?.CLIENT_NAME || 'BanCoppel'

  return (
    <div className="slide theme-dark">
      <style>{`
        @keyframes qrShimmer {
          0%, 100% { box-shadow: 0 0 0 1px rgba(255,255,255,0.10), 0 18px 40px rgba(62,79,224,0.35); }
          50%      { box-shadow: 0 0 0 1px rgba(255,255,255,0.25), 0 22px 56px rgba(62,79,224,0.55); }
        }
      `}</style>

      <HalftoneBg color="#3E4FE0" opacity={0.14} density={36} fadeDir="bottom" />
      <OrbHalftone size={760} x="78%" y="74%" color="#3E4FE0" style={{ opacity: 0.45 }} />

      <SectionLabel color="rgba(255,255,255,0.7)">POS · APMs en terminal</SectionLabel>

      {/* Left column — copy + benefits */}
      <div style={{
        position: 'absolute', top: 130, left: 80, width: 980,
      }}>
        <h2 className="t-title t-title-m anim-in anim-in-1" style={{
          color: '#fff', maxWidth: 980,
        }}>
          La terminal también
          <br/>
          acepta <span style={{ color: '#BDC3F6' }}>CoDi, BNPL y wallets</span>
          <br/>
          — sin tocar el firmware.
        </h2>

        <div className="anim-in anim-in-2" style={{
          marginTop: 36, fontSize: 18, color: 'rgba(255,255,255,0.72)',
          lineHeight: 1.55, maxWidth: 880,
        }}>
          El SDK de Yuno corre dentro de la terminal de {name} y puede
          desplegar nuevos métodos en pantalla: genera un QR de CoDi
          contra Banxico, cobra con SPEI, ofrece BNPL en cuotas o un
          wallet — todo desde el mismo dispositivo, con la misma
          tokenización y reglas de fraude del checkout online.
        </div>

        {/* APM grid */}
        <div className="anim-in anim-in-3" style={{
          marginTop: 56,
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14,
        }}>
          {APMS.map((a) => {
            const { Icon } = a
            return (
              <div key={a.name} style={{
                padding: '18px 22px', borderRadius: 14,
                background: a.primary
                  ? 'linear-gradient(160deg, rgba(62,79,224,0.18) 0%, rgba(62,79,224,0.04) 100%)'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${a.primary ? 'rgba(124,137,239,0.45)' : 'rgba(255,255,255,0.10)'}`,
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10,
                  background: a.primary ? 'rgba(62,79,224,0.28)' : 'rgba(62,79,224,0.14)',
                  border: `1px solid ${a.primary ? 'rgba(189,195,246,0.45)' : 'rgba(62,79,224,0.35)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: a.primary ? '#fff' : '#BDC3F6', flexShrink: 0,
                }}>
                  <Icon size={20} strokeWidth={1.8} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'Titillium Web', fontWeight: 700, fontSize: 18,
                    color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.15,
                  }}>{a.name}</div>
                  <div style={{
                    marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.62)',
                  }}>{a.sub}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Note strip */}
        <div className="anim-in anim-in-7" style={{
          marginTop: 28, padding: '14px 20px', borderRadius: 10,
          background: 'rgba(224,237,128,0.06)',
          border: '1px solid rgba(224,237,128,0.30)',
          fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.5,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <Building2 size={18} color="#E0ED80" strokeWidth={1.8} />
          <span>
            En México, los APMs vía CoDi/SPEI tienen costos por transacción
            menores que tarjetas — cada peso movido a APMs reduce el MDR efectivo.
          </span>
        </div>
      </div>

      {/* Right column — terminal mockup */}
      <div className="anim-in anim-in-4" style={{
        position: 'absolute', top: 200, right: 140,
      }}>
        <TerminalMock />
      </div>

      <SlideFooter section="Orquestación POS" pageNum={pageNum} total={total} logoColor="rgba(255,255,255,0.55)" />
    </div>
  )
}
