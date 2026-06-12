// Route wrapper for /m/:slug/pdf — used by the Railway bridge Puppeteer
// PDF renderer. Same data fetch as SSDeckRoute, but stacks all slides at
// native 1920x1080 with no chrome, and flips window.__PDF_READY__ once
// the slides paint so the capturer knows when to call page.pdf().
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import PrintViewer from './components/PrintViewer'
import { fetchMerchantContent, toSlideData } from './lib/supabase'
import defaultData from './data/_default.json'

import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import './App.css'

export default function SSDeckPrintRoute() {
  const { slug } = useParams()
  const [data, setData] = useState(null)

  useEffect(() => {
    // Print stylesheet hook — html/body/#root default to height:100% +
    // overflow:hidden, which clips everything past slide 1. The CSS hook
    // (see App.css) flips those to height:auto + overflow:visible so the
    // stacked slides flow past the viewport for Chromium to paginate.
    document.documentElement.dataset.printMode = 'true'
    let cancelled = false
    fetchMerchantContent(slug).then((row) => {
      if (cancelled || !row) return
      const adapted = toSlideData(row)
      setData({ ...defaultData, ...adapted, MODE: row.mode || 'merchant' })
    })
    return () => { cancelled = true }
  }, [slug])

  useEffect(() => {
    if (!data) return
    // Two animation frames after data lands gives reveal/animate-in CSS
    // one tick to settle. Puppeteer waits on this flag before page.pdf().
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.__PDF_READY__ = true
    }))
  }, [data])

  if (!data) return null
  return <PrintViewer data={data} />
}
