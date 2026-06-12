// Route wrapper for /m/:slug — the Stripe Sessions style deck.
// Mounted in src/App.tsx without the chief sidebar/layout (full-bleed).
//
// Reads the slug from the URL, fetches merchants_ss content from Supabase,
// adapts the row to the flat slide payload, then mounts SlideViewer.
// Public-read RLS (see migration 142) means logged-out visitors hitting a
// cold link see the deck without an auth bounce.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import SlideViewer from './components/SlideViewer'
import { fetchMerchantContent, toSlideData } from './lib/supabase'
import defaultData from './data/_default.json'

import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import './App.css'

export default function SSDeckRoute() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let cancelled = false
    if (!slug) {
      setStatus('not-found')
      return
    }
    fetchMerchantContent(slug).then((row) => {
      if (cancelled) return
      if (!row) {
        setStatus('not-found')
        return
      }
      const adapted = toSlideData(row)
      setData({ ...defaultData, ...adapted, MODE: row.mode || 'merchant' })
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
    return <FullPageMessage primary="Deck not found" secondary={`No deck for slug "${slug}".`} />
  }
  if (status === 'error') {
    return <FullPageMessage primary="Failed to load deck" secondary="Try refreshing." />
  }

  return <SlideViewer data={data} shared onBack={() => {}} />
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
