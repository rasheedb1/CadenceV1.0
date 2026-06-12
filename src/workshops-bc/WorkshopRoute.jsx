// Route wrapper for /workshop/:slug — Yuno Workshops BC deck.
// Public-read RLS (migration 145) so cold-link sharing with workshop attendees
// works without an auth bounce. Mounted full-bleed (no Chief sidebar).
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import WorkshopViewer from './components/WorkshopViewer'
import { fetchWorkshopContent, toSlideData } from './lib/supabase'

import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import '../ss-deck/App.css'

export default function WorkshopRoute() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')

  // The route mounts at root level (no MainLayout). The app's body bg is
  // the light dashboard color (#FAFBFC) — if it leaks through any gap
  // around the WorkshopViewer, it shows as a bright strip. Force the body
  // to black for the workshop lifecycle, reset on unmount.
  useEffect(() => {
    const prevBg = document.body.style.background
    const prevOverflow = document.body.style.overflow
    document.body.style.background = '#000'
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.background = prevBg
      document.body.style.overflow = prevOverflow
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!slug) {
      setStatus('not-found')
      return
    }
    fetchWorkshopContent(slug).then((row) => {
      if (cancelled) return
      if (!row) {
        setStatus('not-found')
        return
      }
      setData(toSlideData(row))
      setStatus('ready')
    }).catch(() => {
      if (!cancelled) setStatus('error')
    })
    return () => { cancelled = true }
  }, [slug])

  if (status === 'loading') {
    return <FullPageMessage primary="Loading deck…" />
  }
  if (status === 'not-found') {
    return <FullPageMessage primary="Workshop not found" secondary={`No workshop deck for slug "${slug}".`} />
  }
  if (status === 'error') {
    return <FullPageMessage primary="Failed to load deck" secondary="Try refreshing." />
  }

  return <WorkshopViewer data={data} shared onBack={() => {}} />
}

function FullPageMessage({ primary, secondary }) {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#000',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font), system-ui, sans-serif',
      gap: '12px',
    }}>
      <div style={{ fontSize: '20px', fontWeight: 600 }}>{primary}</div>
      {secondary && <div style={{ fontSize: '14px', opacity: 0.6 }}>{secondary}</div>}
    </div>
  )
}
