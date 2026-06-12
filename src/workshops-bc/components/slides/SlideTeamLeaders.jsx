import HalftoneBg from '../primitives/HalftoneBg'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'

// "World-class, merchant-first team" — full Yuno leadership grid.
// Ported from ss-deck SlideLeadership.jsx + SlideLeadership.data.js so the
// founders, leaders, and pedigree logos match. Workshop deck theme: dark
// canvas + halftone bg + Titillium, but the team data + photo URLs are
// shared with ss-deck (under /ss-deck-assets/team/).

const TEAM_PHOTO_VERSION = '2026-04-24-5'
const v = (url) => `${url}?v=${TEAM_PHOTO_VERSION}`

const FOUNDERS = [
  {
    photo: v('/ss-deck-assets/team/juan-pablo-ortega.png'),
    name: 'Juan Pablo Ortega',
    role: 'Co-founder & CEO',
    pedigreeLabel: 'Founder of Rappi',
  },
  {
    photo: v('/ss-deck-assets/team/julian-nunez.png'),
    name: 'Julián Nuñez',
    role: 'Co-founder & COO',
    pedigreeLabel: 'Rappi Early Employee',
  },
]

const LEADERS = [
  { photo: v('/ss-deck-assets/team/justo-benetti.png'),         name: 'Justo Benetti',         role: 'Chief Revenue Officer' },
  { photo: v('/ss-deck-assets/team/mauricio-schwartzmann.png'), name: 'Mau Schwartzmann',      role: 'Chief Banking & FI Officer' },
  { photo: v('/ss-deck-assets/team/chee-beh.png'),              name: 'Chee Beh',              role: 'General Manager, APAC' },
  { photo: v('/ss-deck-assets/team/walter-campos.png'),         name: 'Walter Campos',         role: 'General Manager, LatAm' },
  { photo: v('/ss-deck-assets/team/briana-gargurevich.png'),    name: 'Briana Gargurevich',    role: 'VP, Global Sales North America' },
  { photo: v('/ss-deck-assets/team/melissa-pottenger.png'),     name: 'Melissa Pottenger',     role: 'VP, Enterprise Growth NA' },
  { photo: v('/ss-deck-assets/team/marco-santarelli.png'),      name: 'Marco Santarelli',      role: 'VP of Engineering' },
  { photo: v('/ss-deck-assets/team/juan-manuel-rebull.png'),    name: 'Juan Manuel Rebull',    role: 'SVP of Engineering' },
  { photo: v('/ss-deck-assets/team/simon-martinez.png'),        name: 'Simon Martinez',        role: 'Head of AI Solutions' },
  { photo: v('/ss-deck-assets/team/daniel-rebelo.png'),         name: 'Daniel Rebelo',         role: 'Global Head of Customer Success' },
  { photo: v('/ss-deck-assets/team/martin-mexia.png'),          name: 'Martin Mexia',          role: 'Head of Product' },
  { photo: v('/ss-deck-assets/team/christo-papadopoulos.png'),  name: 'Christo Papadopoulos',  role: 'Head of Data' },
  { photo: v('/ss-deck-assets/team/daniela-reyes.png'),         name: 'Daniela Reyes',         role: 'Global Head of Partnerships' },
]

// Pedigree strip — companies the team scaled payments at before Yuno.
// Ordered for recognizability (consumer-facing brands first).
const PEDIGREE_LOGOS = [
  'stripe', 'mastercard', 'visa', 'jpmorgan', 'citi', 'paypal', 'adyen',
  'checkout', 'uber', 'rappi', 'worldpay', 'fis', 'dlocal', 'revolut',
  'nuvei', 'accenture', 'worldline', 'ntt-data',
]

const LOGO_SCALES = {
  mastercard: 1.55, adyen: 1.35, rappi: 1.2, paypal: 1.05, jpmorgan: 1.1,
  stripe: 1.0, uber: 1.0, dlocal: 1.0, worldpay: 1.0, revolut: 1.0, nuvei: 1.0,
  visa: 1.0, citi: 1.1, checkout: 0.95, fis: 1.3, accenture: 0.95, worldline: 0.95,
  'ntt-data': 1.1,
}

// eslint-disable-next-line no-unused-vars
export default function SlideTeamLeaders({ pageNum, total, lang = 'es' }) {
  return (
    <div className="slide theme-dark" style={{ position: 'relative', overflow: 'hidden' }}>
      <HalftoneBg color="#3E4FE0" opacity={0.12} density={42} fadeDir="bottom" />

      <SectionLabel color="rgba(255,255,255,0.7)">Yuno · equipo</SectionLabel>

      {/* Title row */}
      <div className="anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, right: 80,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 'clamp(24px, 3vw, 48px)',
      }}>
        <h2 className="t-title t-title-m" style={{
          fontSize: 'clamp(34px, 3vw, 56px)', fontWeight: 500,
          letterSpacing: '-1.2px', lineHeight: 1.08, color: '#fff',
          margin: 0, maxWidth: '70%',
        }}>
          Equipo world-class,{' '}
          <span data-gradient-text style={{
            backgroundImage: 'linear-gradient(110deg, #3E4FE0 0%, #5967E4 30%, #BDC3F6 68%, #E8EAF5 100%)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text',
            WebkitTextFillColor: 'transparent', color: 'transparent',
            fontWeight: 700,
          }}>merchant-first</span>{' '}
          construido por operadores globales de pagos.
        </h2>
        <p style={{
          fontSize: 'clamp(13px, 1.05vw, 17px)', lineHeight: 1.55,
          color: 'rgba(255,255,255,0.65)', maxWidth: '28%', textAlign: 'right',
          margin: 0,
        }}>
          <strong style={{ color: '#fff', fontWeight: 700 }}>15 operadores</strong> que
          escalaron pagos en las marcas más confiables del mundo — hoy
          construyendo una sola plataforma para merchants.
        </p>
      </div>

      {/* Body */}
      <div style={{
        position: 'absolute', top: 290, left: 80, right: 80, bottom: 70,
        display: 'flex', flexDirection: 'column',
        gap: 'clamp(18px, 1.6vw, 28px)',
        minHeight: 0,
      }}>
        {/* Founders */}
        <section className="anim-in anim-in-2">
          <SectionHeader>Founders</SectionHeader>
          <div className="stagger" style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 'clamp(20px, 2vw, 36px)', maxWidth: '46%',
            '--stagger-base': '0.25s', '--stagger-step': '0.08s',
          }}>
            {FOUNDERS.map((p) => (
              <PersonCard key={p.name} p={p} founder />
            ))}
          </div>
        </section>

        {/* Leaders */}
        <section className="anim-in anim-in-3" style={{ flex: '1 1 auto', minHeight: 0 }}>
          <SectionHeader>Leadership team</SectionHeader>
          <div className="stagger" style={{
            display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)',
            gap: 'clamp(12px, 1.2vw, 22px) clamp(12px, 1.2vw, 22px)',
            '--stagger-base': '0.35s', '--stagger-step': '0.03s',
          }}>
            {LEADERS.map((p, i) => (
              <div key={p.name} style={{
                gridColumn: i === 7 ? '2 / span 2' : 'span 2',
                minWidth: 0,
              }}>
                <PersonCard p={p} />
              </div>
            ))}
          </div>
        </section>

        {/* Pedigree strip — "we've been there. all of it." */}
        <div className="anim-in anim-in-7" style={{
          marginTop: 'auto',
          padding: 'clamp(16px, 1.4vw, 24px) clamp(20px, 1.9vw, 34px)',
          background: 'linear-gradient(180deg, rgba(62,79,224,0.06) 0%, rgba(62,79,224,0.02) 100%)',
          border: '1px solid rgba(62,79,224,0.18)',
          borderRadius: 14,
          display: 'flex', flexDirection: 'column', gap: 'clamp(12px, 1vw, 18px)',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 'clamp(10px, 0.9vw, 14px)',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'linear-gradient(135deg, #3E4FE0 0%, #BDC3F6 100%)',
              boxShadow: '0 0 8px rgba(62,79,224,0.55)',
            }} />
            <span style={{
              fontFamily: 'Titillium Web, sans-serif',
              fontSize: 'clamp(11px, 0.9vw, 14px)', fontWeight: 700,
              letterSpacing: '2px', textTransform: 'uppercase',
              color: 'rgba(189,195,246,0.85)',
            }}>We've been there. All of it.</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(10px, 1vw, 18px)' }}>
            <PedigreeRow logos={PEDIGREE_LOGOS.slice(0, 9)} />
            <PedigreeRow logos={PEDIGREE_LOGOS.slice(9)} />
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
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: 'linear-gradient(135deg, #3E4FE0 0%, #BDC3F6 100%)',
        boxShadow: '0 0 6px rgba(62,79,224,0.6)',
      }} />
      <span style={{
        fontFamily: 'Titillium Web, sans-serif',
        fontSize: 'clamp(11px, 0.9vw, 14px)', fontWeight: 700,
        letterSpacing: '1.8px', textTransform: 'uppercase',
        color: 'rgba(189,195,246,0.92)',
      }}>{children}</span>
      <span style={{
        flex: 1, height: 1,
        background: 'linear-gradient(90deg, rgba(189,195,246,0.22) 0%, rgba(189,195,246,0) 100%)',
      }} />
    </div>
  )
}

function PersonCard({ p, founder = false }) {
  const photoSize = founder ? 'clamp(72px, 5.4vw, 96px)' : 'clamp(54px, 4.2vw, 76px)'
  return (
    <div style={{
      display: 'flex', gap: 'clamp(10px, 1vw, 16px)',
      alignItems: 'flex-start', minWidth: 0,
    }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <img
          src={p.photo} alt={p.name}
          style={{
            width: photoSize, height: photoSize, borderRadius: '50%',
            objectFit: 'cover', background: 'rgba(255,255,255,0.06)',
            display: 'block',
          }}
        />
        {founder ? (
          <span aria-hidden data-mask-ring style={{
            position: 'absolute', inset: -3, borderRadius: '50%',
            padding: 2,
            background: 'linear-gradient(135deg, #3E4FE0 0%, #5967E4 55%, #BDC3F6 100%)',
            WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
            pointerEvents: 'none',
          }} />
        ) : (
          <span aria-hidden style={{
            position: 'absolute', inset: -1, borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.10)',
            pointerEvents: 'none',
          }} />
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, paddingTop: 2, flex: 1 }}>
        <div style={{
          fontFamily: 'Titillium Web, sans-serif',
          fontSize: founder ? 'clamp(15px, 1.2vw, 19px)' : 'clamp(12px, 0.95vw, 15px)',
          fontWeight: 700, color: '#fff', lineHeight: 1.2,
        }}>{p.name}</div>
        <div style={{
          fontSize: founder ? 'clamp(12px, 0.95vw, 15px)' : 'clamp(10.5px, 0.85vw, 13px)',
          fontWeight: 400, color: 'rgba(255,255,255,0.65)', lineHeight: 1.4,
        }}>{p.role}</div>
        {founder && p.pedigreeLabel && (
          <div style={{
            fontSize: 'clamp(11px, 0.85vw, 13.5px)', fontWeight: 600,
            color: 'rgba(189,195,246,0.82)', lineHeight: 1.4,
            marginTop: 3, letterSpacing: '0.2px',
          }}>{p.pedigreeLabel}</div>
        )}
      </div>
    </div>
  )
}

function PedigreeRow({ logos }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 'clamp(10px, 1vw, 18px)', flexWrap: 'nowrap',
    }}>
      {logos.map((name) => {
        const scale = LOGO_SCALES[name] ?? 1
        const isExtraWide = name === 'worldline'
        const isWide = name === 'checkout'
        const h = `clamp(${20 * scale}px, ${1.9 * scale}vw, ${32 * scale}px)`
        const maxWidth = isExtraWide
          ? 'clamp(180px, 16vw, 300px)'
          : isWide ? 'clamp(140px, 12vw, 220px)'
          : 'clamp(96px, 8.6vw, 150px)'
        return (
          <img key={name}
            src={`/ss-deck-assets/company-logos/${name}.png`}
            alt={name}
            style={{
              height: h, maxWidth, objectFit: 'contain',
              opacity: 0.78,
              filter: 'brightness(0) invert(1)',
              flex: '0 1 auto', minWidth: 0,
            }}
          />
        )
      })}
    </div>
  )
}
