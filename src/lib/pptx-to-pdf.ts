/**
 * PPTX → PDF converter (browser-side)
 *
 * Takes parsed slide data (from parsePptxSlides) and renders each slide
 * to a canvas using Canvas 2D API, then compiles them into a PDF with jsPDF.
 *
 * No html2canvas needed — we draw directly using Canvas 2D.
 */
import { jsPDF } from 'jspdf'
import type { ParsedSlide } from './pptx-slide-parser'

const DPI = 96 // screen pixels per inch
const PT_PER_PX = 72 / 96 // PDF points per screen pixel

function alignToCanvasTextAlign(align?: string): CanvasTextAlign {
  if (align === 'ctr') return 'center'
  if (align === 'r') return 'right'
  return 'left'
}

function drawSlideToCanvas(slide: ParsedSlide, canvas: HTMLCanvasElement): void {
  const slideWPx = (slide.slideWEmu / 914400) * DPI
  const slideHPx = (slide.slideHEmu / 914400) * DPI

  canvas.width = slideWPx * 2 // 2× for retina-quality PDF
  canvas.height = slideHPx * 2

  const ctx = canvas.getContext('2d')!
  const scale = 2 // 2× retina scale

  // White background
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (const shape of slide.shapes) {
    const x = (shape.xEmu / slide.slideWEmu) * slideWPx * scale
    const y = (shape.yEmu / slide.slideHEmu) * slideHPx * scale
    const w = (shape.wEmu / slide.slideWEmu) * slideWPx * scale
    const h = (shape.hEmu / slide.slideHEmu) * slideHPx * scale

    // Shape fill
    if (shape.fillHex) {
      ctx.fillStyle = `#${shape.fillHex}`
      ctx.fillRect(x, y, w, h)
    }

    // Text rendering
    const PAD = 4 * scale
    let curY = y + PAD

    for (const para of shape.paragraphs) {
      const align = alignToCanvasTextAlign(para.align)
      const anchorX =
        para.align === 'ctr' ? x + w / 2 : para.align === 'r' ? x + w - PAD : x + PAD

      // Calculate line height from max font size in paragraph
      let lineHeightPx = 14 * scale
      if (para.runs.length > 0) {
        const maxSz = Math.max(
          ...para.runs.map((r) => (r.fontSize ? (r.fontSize / 100) * (96 / 72) : 12)),
        )
        lineHeightPx = maxSz * scale * 1.3
      }

      // Draw each run on the same line (runs share a paragraph)
      let inlineX = x + PAD
      ctx.textBaseline = 'top'

      for (const run of para.runs) {
        const fontSizePx = run.fontSize ? (run.fontSize / 100) * (96 / 72) * scale : 12 * scale
        const weight = run.bold ? 'bold' : 'normal'
        const style = run.italic ? 'italic' : 'normal'
        ctx.font = `${style} ${weight} ${fontSizePx}px Arial, sans-serif`
        ctx.fillStyle = run.color ? `#${run.color}` : '#000000'
        ctx.textAlign = align

        // Strip {{ }} markers from text for clean PDF output
        const text = run.text.replace(/\{\{[^}]*\}\}/g, (m) => m.slice(2, -2))

        if (align === 'left') {
          ctx.fillText(text, inlineX, curY)
          inlineX += ctx.measureText(text).width
        } else {
          ctx.fillText(text, anchorX, curY)
        }
      }

      curY += lineHeightPx
    }
  }
}

/**
 * Renders parsed slides to a PDF and triggers browser download.
 *
 * @param slides   Parsed slide data from parsePptxSlides()
 * @param filename Download file name (without .pdf extension)
 */
export async function downloadSlidesAsPdf(slides: ParsedSlide[], filename: string): Promise<void> {
  if (slides.length === 0) throw new Error('No slides to render')

  const firstSlide = slides[0]
  const slideWPx = (firstSlide.slideWEmu / 914400) * DPI
  const slideHPx = (firstSlide.slideHEmu / 914400) * DPI

  // PDF page size in points
  const wPt = slideWPx * PT_PER_PX
  const hPt = slideHPx * PT_PER_PX

  const pdf = new jsPDF({
    orientation: wPt >= hPt ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [wPt, hPt],
  })

  const canvas = document.createElement('canvas')

  for (let i = 0; i < slides.length; i++) {
    if (i > 0) pdf.addPage([wPt, hPt])

    drawSlideToCanvas(slides[i], canvas)

    const imgData = canvas.toDataURL('image/jpeg', 0.9)
    pdf.addImage(imgData, 'JPEG', 0, 0, wPt, hPt)
  }

  pdf.save(`${filename}.pdf`)
}
