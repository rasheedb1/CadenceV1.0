/**
 * PPTX Slide Parser — Extended
 *
 * Parses a PPTX blob and returns detailed slide data:
 * - Shape positions/sizes in EMU (not fractions)
 * - Text run properties: font size (hundredths-pt), bold, italic, color
 * - Paragraph alignment
 * - Shape background fill color
 */
import JSZip from 'jszip'
import { supabase } from '@/integrations/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TextRun {
  text: string
  /** Font size in hundredths-of-point (e.g. 2400 = 24pt) */
  fontSize?: number
  bold?: boolean
  italic?: boolean
  /** 6-char hex color without #, e.g. "FF0000" */
  color?: string
}

export interface SlideParagraph {
  runs: TextRun[]
  /** Text alignment from <a:pPr algn="..."> */
  align?: 'l' | 'ctr' | 'r' | 'just'
}

export interface ParsedShape {
  /** Shape XML id for position updates */
  id: string
  /** Position in EMU */
  xEmu: number
  yEmu: number
  /** Size in EMU */
  wEmu: number
  hEmu: number
  paragraphs: SlideParagraph[]
  /** Background fill hex (e.g. "4472C4"), if set */
  fillHex?: string
}

export interface ParsedSlide {
  /** 1-based slide index */
  index: number
  /** Slide dimensions in EMU */
  slideWEmu: number
  slideHEmu: number
  shapes: ParsedShape[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xD;/g, '\n')
}

function extractSrgbColor(xml: string): string | undefined {
  const m = xml.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/)
  return m ? m[1].toUpperCase() : undefined
}

// ── Shape parser ──────────────────────────────────────────────────────────────

function parseShapeXml(spXml: string): ParsedShape | null {
  // Shape id from <p:cNvPr id="...">
  const idM = spXml.match(/<p:cNvPr[^>]+\bid="(\d+)"/)
  const id = idM ? idM[1] : `auto_${Math.random().toString(36).slice(2, 8)}`

  // Position and size
  let xEmu = 0, yEmu = 0, wEmu = 9144000, hEmu = 685800
  const xfrmM = spXml.match(/<a:xfrm[^>]*>([\s\S]*?)<\/a:xfrm>/)
  if (xfrmM) {
    const offM = xfrmM[1].match(/<a:off x="(\d+)" y="(\d+)"/)
    const extM = xfrmM[1].match(/<a:ext cx="(\d+)" cy="(\d+)"/)
    if (offM) { xEmu = +offM[1]; yEmu = +offM[2] }
    if (extM) { wEmu = +extM[1]; hEmu = +extM[2] }
  }

  // Shape fill color
  let fillHex: string | undefined
  const spPrM = spXml.match(/<p:spPr[^>]*>([\s\S]*?)<\/p:spPr>/)
  if (spPrM) {
    const sfM = spPrM[1].match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)
    if (sfM) fillHex = extractSrgbColor(sfM[1])
  }

  // Text body
  const txBodyM = spXml.match(/<p:txBody[^>]*>([\s\S]*?)<\/p:txBody>/)
  if (!txBodyM) return null

  const paragraphs: SlideParagraph[] = []
  const paraMatches = [...txBodyM[1].matchAll(/<a:p[^>]*>([\s\S]*?)<\/a:p>/g)]

  for (const pm of paraMatches) {
    const paraXml = pm[1]

    // Paragraph alignment
    let align: SlideParagraph['align']
    const pPrM = paraXml.match(/<a:pPr[^>]*>|<a:pPr[^/]*\/>/)
    if (pPrM) {
      const algnM = pPrM[0].match(/\balgn="([^"]+)"/)
      if (algnM) align = algnM[1] as SlideParagraph['align']
    }

    const runs: TextRun[] = []

    // Process <a:r> runs
    for (const rm of [...paraXml.matchAll(/<a:r[^>]*>([\s\S]*?)<\/a:r>/g)]) {
      const runXml = rm[1]

      // Text content
      const tM = runXml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/)
      if (!tM) continue
      const text = decodeXml(tM[1])
      if (!text) continue

      const run: TextRun = { text }

      // Run properties: <a:rPr .../> or <a:rPr ...>...</a:rPr>
      const rPrSelfM = runXml.match(/<a:rPr([^>]*)\/>/)
      const rPrOpenM = runXml.match(/<a:rPr([^>]*)>([\s\S]*?)<\/a:rPr>/)

      const rPrAttrs = rPrSelfM ? rPrSelfM[1] : rPrOpenM ? rPrOpenM[1] : ''
      const rPrInner = rPrOpenM ? rPrOpenM[2] : ''

      if (rPrAttrs || rPrInner) {
        const szM = rPrAttrs.match(/\bsz="(\d+)"/)
        if (szM) run.fontSize = +szM[1]

        const bM = rPrAttrs.match(/\bb="([01])"/)
        if (bM) run.bold = bM[1] === '1'

        const iM = rPrAttrs.match(/\bi="([01])"/)
        if (iM) run.italic = iM[1] === '1'

        if (rPrInner) {
          const sfM = rPrInner.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)
          if (sfM) run.color = extractSrgbColor(sfM[1])
        }
      }

      runs.push(run)
    }

    if (runs.length > 0) {
      paragraphs.push({ runs, align })
    }
  }

  if (paragraphs.length === 0) return null

  return { id, xEmu, yEmu, wEmu, hEmu, paragraphs, fillHex }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function parsePptxSlides(blob: Blob): Promise<ParsedSlide[]> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())

  let slideWEmu = 12192000
  let slideHEmu = 6858000
  const presFile = zip.files['ppt/presentation.xml']
  if (presFile) {
    const xml = await presFile.async('string')
    const m = xml.match(/<p:sldSz[^>]+cx="(\d+)"[^>]+cy="(\d+)"/)
    if (m) { slideWEmu = +m[1]; slideHEmu = +m[2] }
  }

  const entries: [number, JSZip.JSZipObject][] = []
  for (const [path, f] of Object.entries(zip.files)) {
    const m = path.match(/^ppt\/slides\/slide(\d+)\.xml$/)
    if (m) entries.push([+m[1], f])
  }
  entries.sort((a, b) => a[0] - b[0])

  const slides: ParsedSlide[] = []
  for (const [idx, entry] of entries) {
    const xml = await entry.async('string')
    const shapes: ParsedShape[] = []

    for (const sm of [...xml.matchAll(/<p:sp[ >][\s\S]*?<\/p:sp>/g)]) {
      const shape = parseShapeXml(sm[0])
      if (shape) shapes.push(shape)
    }

    slides.push({ index: idx, slideWEmu, slideHEmu, shapes })
  }

  return slides
}

// ── Position update utility ───────────────────────────────────────────────────

export function updateShapePositionInXml(
  xml: string,
  shapeId: string,
  xEmu: number,
  yEmu: number,
): string {
  const idPattern = new RegExp(`<p:cNvPr[^>]*\\bid="${shapeId}"`)
  const idMatch = idPattern.exec(xml)
  if (!idMatch) return xml

  const spStart = xml.lastIndexOf('<p:sp', idMatch.index)
  if (spStart === -1) return xml

  const spEnd = xml.indexOf('</p:sp>', idMatch.index) + '</p:sp>'.length
  if (spEnd < '</p:sp>'.length) return xml

  const block = xml.slice(spStart, spEnd)
  const updated = block.replace(
    /<a:off x="\d+" y="\d+"/,
    `<a:off x="${Math.round(xEmu)}" y="${Math.round(yEmu)}"`,
  )
  return xml.slice(0, spStart) + updated + xml.slice(spEnd)
}

/**
 * Download PPTX from Supabase Storage, update shape positions, re-upload.
 */
export async function saveShapePositionsToStorage(
  storagePath: string,
  slideIndex: number,
  updates: Array<{ shapeId: string; xEmu: number; yEmu: number }>,
): Promise<void> {
  const { data: blob, error } = await supabase.storage.from('bc-templates').download(storagePath)
  if (error) throw error

  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const xmlPath = `ppt/slides/slide${slideIndex}.xml`
  const slideFile = zip.files[xmlPath]
  if (!slideFile) throw new Error(`Slide ${slideIndex} not found in PPTX`)

  let xml = await slideFile.async('string')
  for (const { shapeId, xEmu, yEmu } of updates) {
    xml = updateShapePositionInXml(xml, shapeId, xEmu, yEmu)
  }

  zip.file(xmlPath, xml)
  const newBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  })

  const { error: uploadErr } = await supabase.storage.from('bc-templates').upload(storagePath, newBlob, {
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    upsert: true,
  })
  if (uploadErr) throw uploadErr
}
