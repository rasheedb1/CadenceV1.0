// Route wrapper for /pricing/:slug/pdf — usado por el bridge Puppeteer
// para capturar el mini-deck de pricing en PDF. Mismo patrón que
// WorkshopPrintRoute pero con PricingPrintViewer (7 slides).
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import PricingPrintViewer from './components/PricingPrintViewer'
import { fetchWorkshopContent, toSlideData } from './lib/supabase'

import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import '../ss-deck/App.css'

export default function PricingPrintRoute() {
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
    // Mismo timing que WorkshopPrintRoute — esperar ~2200ms tras render
    // para que las animaciones anim-in (920ms delay + 700ms duration)
    // terminen antes de que Puppeteer dispare page.pdf().
    const t = setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.__PDF_READY__ = true
      }))
    }, 2200)
    return () => clearTimeout(t)
  }, [data])

  if (!data) return null
  return <PricingPrintViewer data={data} />
}
