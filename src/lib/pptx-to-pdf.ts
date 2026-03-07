/**
 * PPTX → PDF converter (browser-side)
 *
 * Renders parsed slide data to canvas (Canvas 2D API) and compiles into a PDF.
 * Handles text, rect, image, and table shapes.
 */
import { jsPDF } from 'jspdf'
import type { ParsedSlide } from './pptx-slide-parser'

const DPI = 96
const PT_PER_PX = 72 / 96
const SCALE = 2 // 2× for retina quality

async function drawSlideToCanvas(slide: ParsedSlide, canvas: HTMLCanvasElement): Promise<void> {
  const slideWPx = (slide.slideWEmu / 914400) * DPI * SCALE
  const slideHPx = (slide.slideHEmu / 914400) * DPI * SCALE

  canvas.width = slideWPx
  canvas.height = slideHPx

  const ctx = canvas.getContext('2d')!

  // Background
  ctx.fillStyle = slide.backgroundHex ? `#${slide.backgroundHex}` : '#FFFFFF'
  ctx.fillRect(0, 0, slideWPx, slideHPx)

  for (const shape of slide.shapes) {
    const x = (shape.xEmu / slide.slideWEmu) * slideWPx
    const y = (shape.yEmu / slide.slideHEmu) * slideHPx
    const w = (shape.wEmu / slide.slideWEmu) * slideWPx
    const h = (shape.hEmu / slide.slideHEmu) * slideHPx

    // Image
    if (shape.kind === 'image' && shape.imageDataUrl) {
      await new Promise<void>((resolve) => {
        const img = new Image()
        img.onload = () => { ctx.drawImage(img, x, y, w, h); resolve() }
        img.onerror = () => resolve()
        img.src = shape.imageDataUrl!
      })
      continue
    }

    // Rect / fill
    if (shape.fillHex) {
      ctx.fillStyle = `#${shape.fillHex}`
      ctx.fillRect(x, y, w, h)
    }

    // Stroke
    if (shape.strokeHex && shape.strokeWidthEmu) {
      const lineW = Math.max(0.5, (shape.strokeWidthEmu / 12700) * SCALE)
      ctx.strokeStyle = `#${shape.strokeHex}`
      ctx.lineWidth = lineW
      ctx.strokeRect(x + lineW / 2, y + lineW / 2, w - lineW, h - lineW)
    }

    // Table
    if (shape.kind === 'table' && shape.tableRows) {
      const totalRowH = shape.tableRows.reduce((s, r) => s + r.heightEmu, 0) || shape.hEmu
      const colWidths: number[] = shape.colWidthsEmu?.length
        ? shape.colWidthsEmu.map((cw) => (cw / shape.wEmu) * w)
        : Array(shape.tableRows[0]?.cells.length ?? 1).fill(w / (shape.tableRows[0]?.cells.length ?? 1))

      let cellY = y
      for (const row of shape.tableRows) {
        const cellH = (row.heightEmu / totalRowH) * h
        let cellX = x
        for (let ci = 0; ci < row.cells.length; ci++) {
          const cell = row.cells[ci]
          if (cell.vMerge || cell.hMerge) { cellX += colWidths[ci] ?? 0; continue }
          const cellW = colWidths[ci] ?? w

          if (cell.fillHex) {
            ctx.fillStyle = `#${cell.fillHex}`
            ctx.fillRect(cellX, cellY, cellW, cellH)
          }
          // Cell border
          ctx.strokeStyle = '#D1D5DB'
          ctx.lineWidth = Math.max(0.5, SCALE * 0.5)
          ctx.strokeRect(cellX, cellY, cellW, cellH)

          // Cell text
          ctx.textBaseline = 'top'
          let textY = cellY + 2 * SCALE
          for (const para of cell.paragraphs) {
            textY = drawParaOnCanvas(ctx, para, cellX + 2 * SCALE, cellY + 2 * SCALE, cellW - 4 * SCALE, textY)
          }
          cellX += cellW
        }
        cellY += cellH
      }
      continue
    }

    // Text
    if (shape.kind === 'text') {
      ctx.textBaseline = 'top'
      let textY = y + 2 * SCALE
      for (const para of shape.paragraphs) {
        textY = drawParaOnCanvas(ctx, para, x + 2 * SCALE, y + 2 * SCALE, w - 4 * SCALE, textY)
      }
    }
  }
}

function drawParaOnCanvas(
  ctx: CanvasRenderingContext2D,
  para: import('./pptx-slide-parser').SlideParagraph,
  baseX: number,
  _baseY: number,
  maxW: number,
  curY: number,
): number {
  let lineH = 14 * SCALE
  let runX = baseX

  for (const run of para.runs) {
    const sizePx = run.fontSize ? (run.fontSize / 100) * (96 / 72) * SCALE : 12 * SCALE
    lineH = Math.max(lineH, sizePx * 1.3)
    const weight = run.bold ? 'bold' : 'normal'
    const style = run.italic ? 'italic' : 'normal'
    ctx.font = `${style} ${weight} ${sizePx}px Arial, sans-serif`
    ctx.fillStyle = run.color ? `#${run.color}` : '#000000'

    // Strip {{ }} variable markers for clean PDF
    const text = run.text.replace(/\{\{([^}]*)\}\}/g, '$1')

    if (para.align === 'ctr') {
      ctx.textAlign = 'center'
      ctx.fillText(text, baseX + maxW / 2, curY, maxW)
    } else if (para.align === 'r') {
      ctx.textAlign = 'right'
      ctx.fillText(text, baseX + maxW, curY, maxW)
    } else {
      ctx.textAlign = 'left'
      ctx.fillText(text, runX, curY, Math.max(1, baseX + maxW - runX))
      runX += ctx.measureText(text).width
    }
  }

  return curY + lineH
}

/**
 * Render parsed slides into a PDF and trigger browser download.
 */
export async function downloadSlidesAsPdf(slides: ParsedSlide[], filename: string): Promise<void> {
  if (slides.length === 0) throw new Error('No slides to render')

  const first = slides[0]
  const wPx = (first.slideWEmu / 914400) * DPI
  const hPx = (first.slideHEmu / 914400) * DPI
  const wPt = wPx * PT_PER_PX
  const hPt = hPx * PT_PER_PX

  const pdf = new jsPDF({
    orientation: wPt >= hPt ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [wPt, hPt],
  })

  const canvas = document.createElement('canvas')

  for (let i = 0; i < slides.length; i++) {
    if (i > 0) pdf.addPage([wPt, hPt])
    await drawSlideToCanvas(slides[i], canvas)
    const imgData = canvas.toDataURL('image/jpeg', 0.92)
    pdf.addImage(imgData, 'JPEG', 0, 0, wPt, hPt)
  }

  pdf.save(`${filename}.pdf`)
}
