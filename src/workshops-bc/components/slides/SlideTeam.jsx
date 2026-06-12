import { useState } from 'react'
import { SectionLabel, SlideFooter } from '../primitives/Chrome'

const TEAM_PHOTO_VERSION = '2026-04-24-5'
const v = (url) => `${url}?v=${TEAM_PHOTO_VERSION}`

const DEFAULT_TEAM = [
  {
    name: 'Rasheed Bayter',
    role: 'Director Comercial LATAM',
    email: 'rasheed@y.uno',
    photo: v('/ss-deck-assets/team/rasheed-bayter.png'),
    bio: 'Lidera la relación comercial con clientes enterprise en la región. Ex-Rappi, especialista en orquestación de pagos para retail y QSR.',
  },
  {
    name: 'Mauricio Schwartzmann',
    role: 'Chief Banking & Financial Institutions Officer',
    email: 'ms@y.uno',
    photo: v('/ss-deck-assets/team/mauricio-schwartzmann.png'),
    bio: 'Owner de la estrategia con bancos, adquirentes y FIs. Diseña los esquemas de pricing y los partnerships que reducen el MDR del cliente.',
  },
]

// Avatar circle — renders the photo cropped to a circle; falls back to the
// person's initials on a Yuno-blue gradient if the photo URL doesn't load
// (asset missing, network drop, etc.). The CSS already clips with
// borderRadius: 50% + overflow: hidden, so any rectangular photo lands as
// a clean circle without preprocessing.
function Avatar({ name, photo }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('')

  if (!photo || failed) {
    return (
      <div style={{
        width: 88, height: 88, borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--yuno-blue), var(--yuno-blue-deep))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 28, fontWeight: 700,
        fontFamily: 'Titillium Web, sans-serif', letterSpacing: '-0.02em',
        marginBottom: 24, position: 'relative', overflow: 'hidden',
      }}>
        {initials}
        <span style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '1px dashed rgba(255,255,255,0.35)',
        }} />
      </div>
    )
  }

  return (
    <div style={{
      width: 88, height: 88, borderRadius: '50%',
      background: 'rgba(62,79,224,0.06)',
      marginBottom: 24, position: 'relative', overflow: 'hidden',
      flexShrink: 0,
    }}>
      <img
        src={photo} alt={name}
        onError={() => setFailed(true)}
        style={{
          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
        }}
      />
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        border: '1px solid rgba(62,79,224,0.20)',
        pointerEvents: 'none',
      }} />
    </div>
  )
}

// eslint-disable-next-line no-unused-vars
export default function SlideTeam({ data, pageNum, total, lang = 'es' }) {
  // Use attendees with side==='yuno' if provided, fallback to defaults.
  // Supports 1 or 2 Yuno team members — single member renders centered.
  const attendees = Array.isArray(data?.ATTENDEES) ? data.ATTENDEES : []
  const yunoTeam = attendees.filter((a) => a.side === 'yuno')
  const team = (yunoTeam.length >= 1 ? yunoTeam.slice(0, 2) : DEFAULT_TEAM).map((m, i) => ({
    name: m.name,
    role: m.role,
    email: m.email || DEFAULT_TEAM[i]?.email || '—',
    photo: m.photo || DEFAULT_TEAM[i]?.photo,
    bio: m.bio || DEFAULT_TEAM[i]?.bio || '',
  }))
  const isSingle = team.length === 1

  return (
    <div className="slide theme-light">
      <SectionLabel>Resumen · equipo asignado</SectionLabel>

      <h2 className="t-title t-title-m anim-in anim-in-1" style={{
        position: 'absolute', top: 130, left: 80, maxWidth: 1400,
        color: 'var(--unity-black)',
      }}>
        el equipo que estará
        <br/>
        en <span style={{ color: 'var(--yuno-blue)' }}>cada paso del proceso.</span>
      </h2>

      <div style={{
        position: 'absolute', top: 380, left: 80, right: 80, bottom: 200,
        display: 'grid',
        gridTemplateColumns: isSingle ? 'minmax(0, 720px)' : 'repeat(2, 1fr)',
        justifyContent: isSingle ? 'center' : 'stretch',
        gap: 28,
      }}>
        {team.map((m, i) => (
          <div key={i} className={`anim-in anim-in-${i + 2}`} style={{
            padding: 36, background: '#fff',
            border: '1px solid rgba(40,42,48,0.10)', borderRadius: 18,
            display: 'flex', flexDirection: 'column',
          }}>
            <Avatar name={m.name} photo={m.photo} />

            <div style={{
              fontSize: 32, fontWeight: 400, color: 'var(--unity-black)',
              letterSpacing: '-0.01em', marginBottom: 6,
            }}>{m.name}</div>
            <div className="t-label" style={{ color: 'var(--yuno-blue)', fontSize: 12, marginBottom: 18 }}>
              {m.role}
            </div>
            <div style={{ fontSize: 15, color: 'var(--gray-alt)', lineHeight: 1.55, marginBottom: 24, flex: 1 }}>
              {m.bio}
            </div>
            <div style={{
              paddingTop: 18, borderTop: '1px solid rgba(40,42,48,0.10)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span className="mono" style={{ fontSize: 13, color: 'var(--unity-black)', fontWeight: 500 }}>
                {m.email}
              </span>
              <span className="t-label" style={{ fontSize: 10, color: 'var(--security-gray)' }}>
                contacto directo
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="anim-in anim-in-4" style={{
        position: 'absolute', bottom: 100, left: 80, right: 80,
        padding: '20px 32px', background: 'var(--harmony-lilac)',
        borderRadius: 12, display: 'flex', gap: 28, alignItems: 'center',
      }}>
        <div className="t-label" style={{ color: 'var(--yuno-blue)', minWidth: 200 }}>
          equipo extendido
        </div>
        <div style={{ fontSize: 13, color: 'var(--gray-alt)', lineHeight: 1.5, flex: 1 }}>
          solutions engineering · onboarding manager · customer success · 24/7 support · risk & compliance.
          Cada cliente enterprise tiene un equipo dedicado durante onboarding y operación.
        </div>
      </div>

      <SlideFooter section="Resumen" pageNum={pageNum} total={total} />
    </div>
  )
}
