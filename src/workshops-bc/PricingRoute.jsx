// PricingRoute — /pricing/:slug. Mini-deck focalizado en pricing.
// Reusa el row de workshops_bc (mismas inputs/business_case que el
// workshop deck) — solo cambia la vista (PricingViewer, 7 slides
// específicas) sin tocar la data.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import PricingViewer from './components/PricingViewer'
import { fetchWorkshopContent, toSlideData } from './lib/supabase'

import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import '../ss-deck/App.css'

export default function PricingRoute() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')

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
    return <FullPageMessage primary="Loading pricing deck…" />
  }
  if (status === 'not-found') {
    return <FullPageMessage primary="Pricing deck not found" secondary={`No row for slug "${slug}".`} />
  }
  if (status === 'error') {
    return <FullPageMessage primary="Failed to load pricing deck" secondary="Try refreshing." />
  }

  return <PricingViewer data={data} shared onBack={() => {}} />
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
