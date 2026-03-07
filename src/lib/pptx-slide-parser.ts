/**
 * PPTX Slide Parser
 *
 * Downloads a PPTX blob (which is a ZIP) and extracts slide shapes with
 * their approximate positions so we can render a visual preview.
 *
 * We only extract text-bearing shapes (<p:sp> with <p:txBody>).
 * Position is returned as 0-1 fractions relative to slide dimensions.
 */
import JSZip from 'jszip'

export interface SlideShape {
  id: string
  /** Position as fraction of slide width/height (0–1) */
  x: number
  y: number
  w: number
  h: number
  /** Each paragraph's full text (runs joined) */
  textLines: string[]
}

export interface ParsedSlide {
  /** 1-based slide number */
  index: number
  shapes: SlideShape[]
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

export async function parsePptxSlides(blob: Blob): Promise<ParsedSlide[]> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())

  // Read slide dimensions from presentation.xml (default widescreen 13.33×7.5 in)
  let slideW = 12192000
  let slideH = 6858000
  const presFile = zip.files['ppt/presentation.xml']
  if (presFile) {
    const xml = await presFile.async('string')
    const m = xml.match(/<p:sldSz[^>]+cx="(\d+)"[^>]+cy="(\d+)"/)
    if (m) { slideW = +m[1]; slideH = +m[2] }
  }

  // Collect slide files sorted by their ordinal number
  const entries: [number, JSZip.JSZipObject][] = []
  for (const [path, f] of Object.entries(zip.files)) {
    const m = path.match(/^ppt\/slides\/slide(\d+)\.xml$/)
    if (m) entries.push([+m[1], f])
  }
  entries.sort((a, b) => a[0] - b[0])

  const slides: ParsedSlide[] = []

  for (const [idx, entry] of entries) {
    const xml = await entry.async('string')
    const shapes: SlideShape[] = []

    // Match each <p:sp> shape block
    const spMatches = [...xml.matchAll(/<p:sp[ >][\s\S]*?<\/p:sp>/g)]

    for (let i = 0; i < spMatches.length; i++) {
      const sp = spMatches[i][0]
      if (!sp.includes('<p:txBody>')) continue

      // Parse transform (position + size)
      let x = 0, y = 0, w = 1, h = 0.05
      const xfrmM = sp.match(/<a:xfrm[^>]*>([\s\S]*?)<\/a:xfrm>/)
      if (xfrmM) {
        const offM = xfrmM[1].match(/<a:off x="(\d+)" y="(\d+)"/)
        const extM = xfrmM[1].match(/<a:ext cx="(\d+)" cy="(\d+)"/)
        if (offM) { x = +offM[1] / slideW; y = +offM[2] / slideH }
        if (extM) { w = +extM[1] / slideW; h = +extM[2] / slideH }
      }

      // Extract paragraph text (joining all <a:t> runs)
      const lines: string[] = []
      for (const pm of [...sp.matchAll(/<a:p[^>]*>([\s\S]*?)<\/a:p>/g)]) {
        const text = [...pm[1].matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
          .map(r => decodeXml(r[1]))
          .join('')
        if (text.trim()) lines.push(text)
      }

      if (lines.length > 0) {
        shapes.push({ id: `${idx}-${i}`, x, y, w, h, textLines: lines })
      }
    }

    slides.push({ index: idx, shapes })
  }

  return slides
}
