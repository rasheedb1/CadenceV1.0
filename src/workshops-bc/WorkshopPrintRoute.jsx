// Route wrapper for /workshop/:slug/pdf — used by the Railway bridge
// Puppeteer PDF renderer. Same data fetch as WorkshopRoute, stacked at
// native 1920x1080 with no chrome, flips window.__PDF_READY__ once paint
// settles so the capturer knows when to call page.pdf().
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import PrintViewer from './components/PrintViewer'
import { fetchWorkshopContent, toSlideData } from './lib/supabase'

import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import '../ss-deck/App.css'

export default function WorkshopPrintRoute() {
  const { slug } = useParams()
  const [data, setData] = useState(null)

  useEffect(() => {
    document.documentElement.dataset.printMode = 'true'
    let cancelled = false
    fetchWorkshopContent(slug).then((row) => {
      if (cancelled || !row) return
      setData(toSlideData(row))
    })
    return () => { cancelled = true }
  }, [slug])

  useEffect(() => {
    if (!data) return
    // anim-in entrance: delays hasta 920ms + duration 700ms = ~1620ms.
    // Esperamos ~2200ms tras render para que cada slide termine su entrada
    // antes de que el capturer Puppeteer haga page.pdf(), si no las cards
    // salen a mitad de animación (cortadas / con blur residual).
    const t = setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.__PDF_READY__ = true
      }))
    }, 2200)
    return () => clearTimeout(t)
  }, [data])

  if (!data) return null
  return <PrintViewer data={data} />
}
