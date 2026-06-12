import { useState } from 'react'
import HalftoneBg from '../primitives/HalftoneBg'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'

// Logo wall — same customer + investor logo set as ss-deck SlideTrustedBy
// so every logo is an image (no text fallbacks). 5×2 customer grid +
// 1×6 investor strip — pattern matches the bet365 reference exactly.
//
// All assets live under /ss-deck-assets/trusted/ and ship with the ss-deck
// build, so no new image work needed.

const CUSTOMERS = [
  { name: 'Whop',          slug: 'whop',           ext: 'png' },
  { name: "McDonald's",    slug: 'mcdonalds',      ext: 'png' },
  { name: 'Uber',          slug: 'uber',           ext: 'png' },
  { name: 'Crypto.com',    slug: 'crypto-com',     ext: 'png' },
  { name: 'Samsung',       slug: 'samsung',        ext: 'png' },
  { name: 'inDrive',       slug: 'indrive',        ext: 'svg' },
  { name: 'Ant Group',     slug: 'ant-group',      ext: 'png' },
  { name: 'Rappi',         slug: 'rappi',          ext: 'png' },
  { name: 'GoFundMe',      slug: 'gofundme',       ext: 'png' },
  { name: 'NetEase Games', slug: 'netease-games',  ext: 'png' },
]

const INVESTORS = [
  { name: 'Kaszek',                slug: 'kaszek',                ext: 'png' },
  { name: 'DST Global',            slug: 'dst-global',            ext: 'png' },
  { name: 'Tiger Global',          slug: 'tiger-global',          ext: 'png' },
  { name: 'Andreessen Horowitz',   slug: 'andreessen-horowitz',   ext: 'png' },
  { name: 'Monashees',             slug: 'monashees',             ext: 'png' },
  { name: 'Global Paytech Ventures', slug: 'global-paytech-ventures', ext: 'png' },
]

function LogoImg({ slug, ext, name, max, opacity = 0.92 }) {
  const [failed, setFailed] = useState(false)
  if (!slug || failed) {
    return (
      <span style={{
        fontFamily: 'Titillium Web, sans-serif',
        fontSize: 'clamp(20px, 1.9vw, 32px)',
        fontWeight: 700,
        color: 'rgba(255,255,255,0.85)',
        letterSpacing: '-0.02em',
        textTransform: 'lowercase',
        opacity,
        textAlign: 'center',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}>{name}</span>
    )
  }
  return (
    <img
      src={`/ss-deck-assets/trusted/${slug}.${ext}`}
      alt={name}
      onError={() => setFailed(true)}
      style={{
        maxHeight: max?.h || '52%',
        maxWidth: max?.w || '72%',
        objectFit: 'contain',
        filter: 'brightness(0) invert(1)',
        opacity,
      }}
    />
  )
}

// eslint-disable-next-line no-unused-vars
export default function SlideLogoWall({ pageNum, total, lang = 'es' }) {
  return (
    <div className="slide theme-dark" style={{ position: 'relative', overflow: 'hidden' }}>
      <HalftoneBg color="#3E4FE0" opacity={0.16} density={36} fadeDir="bottom" />

      <SectionLabel color="rgba(255,255,255,0.7)">Yuno · marcas y respaldo</SectionLabel>

      {/* Title block */}
      <div className="anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, right: 80,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 'clamp(24px, 3vw, 48px)',
      }}>
        <h2 className="t-title t-title-m" style={{
          fontSize: 'clamp(36px, 3.2vw, 60px)', fontWeight: 500,
          letterSpacing: '-1.2px', lineHeight: 1.05, color: '#fff',
          margin: 0, maxWidth: '64%',
        }}>
          Marcas líderes confían,
          <br/>
          <span data-gradient-text style={{
            backgroundImage: 'linear-gradient(110deg, #3E4FE0 0%, #5967E4 30%, #BDC3F6 68%, #E8EAF5 100%)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text',
            WebkitTextFillColor: 'transparent', color: 'transparent',
            fontWeight: 700,
          }}>fondos top-tier respaldan.</span>
        </h2>
        <p style={{
          fontSize: 'clamp(13px, 1.05vw, 17px)', lineHeight: 1.55,
          color: 'rgba(255,255,255,0.7)', maxWidth: '34%', textAlign: 'right',
          fontWeight: 400, margin: 0,
        }}>
          De retailers globales a las firmas de venture más respetadas — Yuno
          es la plataforma sobre la que los builders apuestan.
        </p>
      </div>

      {/* Body — customers grid + investors strip */}
      <div style={{
        position: 'absolute', top: 320, left: 80, right: 80, bottom: 100,
        display: 'flex', flexDirection: 'column',
        gap: 'clamp(20px, 1.8vw, 32px)',
      }}>
        {/* Customers section */}
        <div className="anim-in anim-in-2" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <SectionHeader>Nuestros clientes</SectionHeader>
          <div className="stagger" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gridTemplateRows: 'repeat(2, 1fr)',
            gap: 'clamp(10px, 1vw, 16px)',
            flex: 1, minHeight: 0,
            '--stagger-base': '0.20s', '--stagger-step': '0.04s',
          }}>
            {CUSTOMERS.map((c) => (
              <div key={c.name} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12,
                padding: 'clamp(10px, 0.9vw, 16px)',
                minHeight: 0, minWidth: 0, overflow: 'hidden',
                transition: 'all 0.3s ease',
              }}>
                <LogoImg {...c} />
              </div>
            ))}
          </div>
        </div>

        {/* Investors strip */}
        <div className="anim-in anim-in-4" style={{ flexShrink: 0 }}>
          <SectionHeader>Respaldo · inversionistas</SectionHeader>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-evenly',
            gap: 'clamp(24px, 2.4vw, 52px)',
            padding: 'clamp(18px, 1.6vw, 30px) clamp(20px, 2vw, 38px)',
            background: 'linear-gradient(180deg, rgba(62,79,224,0.06) 0%, rgba(62,79,224,0.02) 100%)',
            border: '1px solid rgba(62,79,224,0.18)',
            borderRadius: 14,
          }}>
            {INVESTORS.map((inv) => (
              <LogoImg
                key={inv.name}
                {...inv}
                max={{ h: 'clamp(26px, 2.2vw, 40px)', w: 'clamp(110px, 10vw, 180px)' }}
                opacity={0.78}
              />
            ))}
          </div>
        </div>
      </div>

      <SlideFooter section="Qué es Yuno" pageNum={pageNum} total={total} logoColor="rgba(255,255,255,0.55)" />
    </div>
  )
}

function SectionHeader({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      marginBottom: 'clamp(10px, 1vw, 16px)',
      flexShrink: 0,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: 'linear-gradient(135deg, #3E4FE0 0%, #BDC3F6 100%)',
        boxShadow: '0 0 6px rgba(62,79,224,0.6)',
      }} />
      <span style={{
        fontFamily: 'Titillium Web, sans-serif',
        fontSize: 'clamp(11px, 0.88vw, 14px)',
        fontWeight: 700, letterSpacing: '1.8px', textTransform: 'uppercase',
        color: 'rgba(189,195,246,0.92)',
      }}>{children}</span>
    </div>
  )
}
