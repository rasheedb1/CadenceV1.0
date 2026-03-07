/**
 * PPTX Slide Parser — Full fidelity with master/layout inheritance
 *
 * Parses ALL visible PPTX shape types including shapes from slide master and layout:
 *  - Text shapes (p:sp with txBody)
 *  - Rect shapes (p:sp without text, but with fill/stroke)
 *  - Image shapes (p:pic) — extracted from ZIP as data URLs
 *  - Table shapes (p:graphicFrame + a:tbl)
 *  - Group shapes (p:grpSp) — children with coordinate transform
 *  - Gradient fills (a:gradFill) — rendered as midpoint stop color
 *  - Theme/scheme colors resolved from ppt/theme/theme1.xml
 *  - Slide master and layout non-placeholder shapes (logos, backgrounds, etc.)
 *
 * Shape positions/sizes in EMU.
 * Text run properties: font size (hundredths-pt), bold, italic, color.
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
  align?: 'l' | 'ctr' | 'r' | 'just'
}

export interface ParsedTableCell {
  paragraphs: SlideParagraph[]
  fillHex?: string
  /** Number of columns this cell spans */
  gridSpan?: number
  /** Number of rows this cell spans */
  rowSpan?: number
  /** True = continuation of vertical merge (don't render) */
  vMerge?: boolean
  /** True = continuation of horizontal merge (don't render) */
  hMerge?: boolean
}

export interface ParsedTableRow {
  heightEmu: number
  cells: ParsedTableCell[]
}

export type ShapeKind = 'text' | 'rect' | 'image' | 'table'

export interface ParsedShape {
  kind: ShapeKind
  id: string
  xEmu: number
  yEmu: number
  wEmu: number
  hEmu: number
  /** Text paragraphs (for kind=text) */
  paragraphs: SlideParagraph[]
  /** Solid or gradient-approximated fill hex color */
  fillHex?: string
  /** Outline/stroke color hex */
  strokeHex?: string
  /** Outline width in EMU (12700 = 1pt) */
  strokeWidthEmu?: number
  /** Base64 data URL for kind=image */
  imageDataUrl?: string
  /** Rows for kind=table */
  tableRows?: ParsedTableRow[]
  /** Column widths in EMU for kind=table */
  colWidthsEmu?: number[]
}

export interface ParsedSlide {
  index: number
  slideWEmu: number
  slideHEmu: number
  shapes: ParsedShape[]
  /** Slide background fill hex (solid or gradient approximation), if set */
  backgroundHex?: string
}

// ── Path utilities ─────────────────────────────────────────────────────────────

function resolvePath(baseDir: string, target: string): string {
  if (!target) return ''
  if (target.startsWith('/')) return target.slice(1)
  const dir = baseDir.endsWith('/') ? baseDir : `${baseDir}/`
  const parts = `${dir}${target}`.split('/')
  const resolved: string[] = []
  for (const p of parts) {
    if (p === '..') resolved.pop()
    else if (p !== '.') resolved.push(p)
  }
  return resolved.join('/')
}

function xmlDir(xmlPath: string): string {
  return xmlPath.slice(0, xmlPath.lastIndexOf('/') + 1)
}

// ── Relationship file reader ───────────────────────────────────────────────────

async function readRels(xmlPath: string, zip: JSZip): Promise<Map<string, string>> {
  const dir = xmlDir(xmlPath)
  const name = xmlPath.slice(xmlPath.lastIndexOf('/') + 1)
  const relsPath = `${dir}_rels/${name}.rels`
  const file = zip.files[relsPath]
  const map = new Map<string, string>()
  if (!file) return map
  const xml = await file.async('string')
  for (const m of xml.matchAll(/<Relationship\b[^>]+\bId="([^"]+)"[^>]+\bTarget="([^"]+)"/g)) {
    map.set(m[1], m[2])
  }
  return map
}

// ── Theme color loader ─────────────────────────────────────────────────────────

async function loadThemeColors(zip: JSZip): Promise<Map<string, string>> {
  const colors = new Map<string, string>()
  for (const path of Object.keys(zip.files)) {
    if (!path.match(/^ppt\/theme\/theme\d+\.xml$/)) continue
    const xml = await zip.files[path].async('string')
    const clrSchemeM = xml.match(/<a:clrScheme[^>]*>([\s\S]*?)<\/a:clrScheme>/)
    if (!clrSchemeM) continue
    const clrXml = clrSchemeM[1]
    for (const name of ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) {
      const m = clrXml.match(new RegExp(`<a:${name}[^>]*>([\\s\\S]*?)<\\/a:${name}>`))
      if (!m) continue
      const srgb = m[1].match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/)
      if (srgb) { colors.set(name, srgb[1].toUpperCase()); continue }
      const sysClr = m[1].match(/<a:sysClr[^>]+lastClr="([0-9A-Fa-f]{6})"/)
      if (sysClr) colors.set(name, sysClr[1].toUpperCase())
    }
    break // Only load first theme file
  }
  return colors
}

// ── XML helpers ────────────────────────────────────────────────────────────────

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xD;/g, '\n')
}

/** Extract a color from a color XML fragment, resolving scheme/theme colors */
function extractColor(xml: string, themeColors?: Map<string, string>): string | undefined {
  // Direct hex sRGB color
  const srgb = xml.match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/)
  if (srgb) return srgb[1].toUpperCase()
  // System color with lastClr fallback
  const sys = xml.match(/<a:sysClr[^>]+lastClr="([0-9A-Fa-f]{6})"/)
  if (sys) return sys[1].toUpperCase()
  // Scheme/theme color (accent1, dk1, lt1, etc.)
  if (themeColors) {
    const scheme = xml.match(/<a:schemeClr val="([^"]+)"/)
    if (scheme) return themeColors.get(scheme[1])
  }
  return undefined
}

/** Extract fill color from a fill XML fragment (handles solid + gradient) */
function extractFillHex(xml: string, themeColors: Map<string, string>): string | undefined {
  if (xml.includes('<a:noFill')) return undefined
  // Solid fill
  const sfM = xml.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)
  if (sfM) return extractColor(sfM[1], themeColors)
  // Gradient fill — use midpoint stop as approximation
  const gfM = xml.match(/<a:gradFill>([\s\S]*?)<\/a:gradFill>/)
  if (gfM) {
    const stops = [...gfM[1].matchAll(/<a:gs\b[^>]*>([\s\S]*?)<\/a:gs>/g)]
    if (stops.length > 0) {
      const mid = stops[Math.floor(stops.length / 2)]
      return extractColor(mid[1], themeColors)
    }
  }
  return undefined
}

/** Extract background fill hex from any slide/layout/master XML */
function extractBackgroundHex(xml: string, themeColors: Map<string, string>): string | undefined {
  const bgM = xml.match(/<p:bg[^>]*>([\s\S]*?)<\/p:bg>/)
  if (!bgM) return undefined
  return extractFillHex(bgM[1], themeColors)
}

// ── Shared: paragraph parser ──────────────────────────────────────────────────

function parseParagraphs(txBodyXml: string, themeColors: Map<string, string>): SlideParagraph[] {
  const paragraphs: SlideParagraph[] = []

  for (const pm of txBodyXml.matchAll(/<a:p[^>]*>([\s\S]*?)<\/a:p>/g)) {
    const paraXml = pm[1]

    let align: SlideParagraph['align']
    const pPrM = paraXml.match(/<a:pPr[^>]*>|<a:pPr[^/]*\/>/)
    if (pPrM) {
      const algnM = pPrM[0].match(/\balgn="([^"]+)"/)
      if (algnM) align = algnM[1] as SlideParagraph['align']
    }

    const runs: TextRun[] = []

    for (const rm of paraXml.matchAll(/<a:r[^>]*>([\s\S]*?)<\/a:r>/g)) {
      const runXml = rm[1]
      const tM = runXml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/)
      if (!tM) continue
      const text = decodeXml(tM[1])
      if (!text) continue

      const run: TextRun = { text }

      const rPrSelfM = runXml.match(/<a:rPr([^>]*)\/>/)
      const rPrOpenM = runXml.match(/<a:rPr([^>]*)>([\s\S]*?)<\/a:rPr>/)
      const rPrAttrs = rPrSelfM ? rPrSelfM[1] : rPrOpenM ? rPrOpenM[1] : ''
      const rPrInner = rPrOpenM ? rPrOpenM[2] : ''

      if (rPrAttrs) {
        const szM = rPrAttrs.match(/\bsz="(\d+)"/)
        if (szM) run.fontSize = +szM[1]
        const bM = rPrAttrs.match(/\bb="([01])"/)
        if (bM) run.bold = bM[1] === '1'
        const iM = rPrAttrs.match(/\bi="([01])"/)
        if (iM) run.italic = iM[1] === '1'
      }
      if (rPrInner) {
        const sfM = rPrInner.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)
        if (sfM) run.color = extractColor(sfM[1], themeColors)
        else {
          // Scheme color in rPr
          const scM = rPrInner.match(/<a:schemeClr val="([^"]+)"/)
          if (scM) run.color = themeColors.get(scM[1])
        }
      }

      runs.push(run)
    }

    if (runs.length > 0) paragraphs.push({ runs, align })
  }

  return paragraphs
}

// ── Shared: transform parser ───────────────────────────────────────────────────

function parseXfrm(xml: string): { xEmu: number; yEmu: number; wEmu: number; hEmu: number } {
  let xEmu = 0, yEmu = 0, wEmu = 9144000, hEmu = 685800
  // Matches both <a:xfrm> (in p:spPr) and <p:xfrm> (in p:graphicFrame)
  const xfrmM = xml.match(/<[ap]:xfrm[^>]*>([\s\S]*?)<\/[ap]:xfrm>/)
  if (xfrmM) {
    const offM = xfrmM[1].match(/<a:off x="(-?\d+)" y="(-?\d+)"/)
    const extM = xfrmM[1].match(/<a:ext cx="(\d+)" cy="(\d+)"/)
    if (offM) { xEmu = +offM[1]; yEmu = +offM[2] }
    if (extM) { wEmu = +extM[1]; hEmu = +extM[2] }
  }
  return { xEmu, yEmu, wEmu, hEmu }
}

// ── Group shape coordinate transform ──────────────────────────────────────────

interface GroupTransform {
  gx: number; gy: number   // group offset on slide
  gw: number; gh: number   // group extent on slide
  chx: number; chy: number // child coordinate origin
  chw: number; chh: number // child coordinate space size
}

function parseGroupXfrm(grpSpXml: string): GroupTransform | null {
  const grpSpPrM = grpSpXml.match(/<p:grpSpPr[^>]*>([\s\S]*?)<\/p:grpSpPr>/)
  if (!grpSpPrM) return null
  const xfrmM = grpSpPrM[1].match(/<a:xfrm[^>]*>([\s\S]*?)<\/a:xfrm>/)
  if (!xfrmM) return null
  const offM = xfrmM[1].match(/<a:off x="(-?\d+)" y="(-?\d+)"/)
  const extM = xfrmM[1].match(/<a:ext cx="(\d+)" cy="(\d+)"/)
  const chOffM = xfrmM[1].match(/<a:chOff x="(-?\d+)" y="(-?\d+)"/)
  const chExtM = xfrmM[1].match(/<a:chExt cx="(\d+)" cy="(\d+)"/)
  if (!offM || !extM || !chOffM || !chExtM) return null
  const gw = +extM[1], gh = +extM[2]
  const chw = +chExtM[1], chh = +chExtM[2]
  if (!chw || !chh) return null
  return {
    gx: +offM[1], gy: +offM[2], gw, gh,
    chx: +chOffM[1], chy: +chOffM[2], chw, chh,
  }
}

function applyGroupTransform(shape: ParsedShape, gt: GroupTransform): ParsedShape {
  const scaleX = gt.gw / gt.chw
  const scaleY = gt.gh / gt.chh
  return {
    ...shape,
    xEmu: gt.gx + (shape.xEmu - gt.chx) * scaleX,
    yEmu: gt.gy + (shape.yEmu - gt.chy) * scaleY,
    wEmu: shape.wEmu * scaleX,
    hEmu: shape.hEmu * scaleY,
  }
}

// ── Text / Rect shape (p:sp) ──────────────────────────────────────────────────

function parseSpXml(spXml: string, themeColors: Map<string, string>): ParsedShape | null {
  const idM = spXml.match(/<p:cNvPr[^>]+\bid="(\d+)"/)
  const id = idM ? idM[1] : `sp_${Math.random().toString(36).slice(2, 8)}`

  const { xEmu, yEmu, wEmu, hEmu } = parseXfrm(spXml)

  const spPrM = spXml.match(/<p:spPr[^>]*>([\s\S]*?)<\/p:spPr>/)
  const fillHex = spPrM ? extractFillHex(spPrM[1], themeColors) : undefined

  // Stroke
  let strokeHex: string | undefined
  let strokeWidthEmu: number | undefined
  if (spPrM) {
    const lnM = spPrM[1].match(/<a:ln\b([^>]*)>([\s\S]*?)<\/a:ln>/)
    if (lnM) {
      const wM = lnM[1].match(/\bw="(\d+)"/)
      if (wM) strokeWidthEmu = +wM[1]
      const sfM = lnM[2].match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)
      if (sfM) strokeHex = extractColor(sfM[1], themeColors)
    }
  }

  // Text
  const txBodyM = spXml.match(/<p:txBody[^>]*>([\s\S]*?)<\/p:txBody>/)
  const paragraphs = txBodyM ? parseParagraphs(txBodyM[1], themeColors) : []

  if (paragraphs.length === 0 && !fillHex && !strokeHex) return null

  const kind: ShapeKind = paragraphs.length > 0 ? 'text' : 'rect'
  return { kind, id, xEmu, yEmu, wEmu, hEmu, paragraphs, fillHex, strokeHex, strokeWidthEmu }
}

// ── Image shape (p:pic) ───────────────────────────────────────────────────────

async function parsePicXml(
  picXml: string,
  relsMap: Map<string, string>,
  zip: JSZip,
  xmlPath: string,
): Promise<ParsedShape | null> {
  const idM = picXml.match(/<p:cNvPr[^>]+\bid="(\d+)"/)
  const id = idM ? idM[1] : `pic_${Math.random().toString(36).slice(2, 8)}`

  const { xEmu, yEmu, wEmu, hEmu } = parseXfrm(picXml)

  const rIdM = picXml.match(/r:embed="([^"]+)"/)
  if (!rIdM) return null

  const relTarget = relsMap.get(rIdM[1])
  if (!relTarget) return null

  // Resolve relative path from XML file's directory
  const normalized = resolvePath(xmlDir(xmlPath), relTarget)
  const imgFile = zip.files[normalized]
  if (!imgFile) return null

  const base64 = await imgFile.async('base64')
  const ext = normalized.split('.').pop()?.toLowerCase() ?? 'png'
  const mime =
    ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
    ext === 'gif' ? 'image/gif' :
    ext === 'svg' ? 'image/svg+xml' :
    'image/png'

  return {
    kind: 'image',
    id, xEmu, yEmu, wEmu, hEmu,
    paragraphs: [],
    imageDataUrl: `data:${mime};base64,${base64}`,
  }
}

// ── Table shape (p:graphicFrame + a:tbl) ──────────────────────────────────────

function parseTableXml(gfXml: string, themeColors: Map<string, string>): ParsedShape | null {
  const idM = gfXml.match(/<p:cNvPr[^>]+\bid="(\d+)"/)
  const id = idM ? idM[1] : `tbl_${Math.random().toString(36).slice(2, 8)}`

  const { xEmu, yEmu, wEmu, hEmu } = parseXfrm(gfXml)

  const tblM = gfXml.match(/<a:tbl[^>]*>([\s\S]*?)<\/a:tbl>/)
  if (!tblM) return null

  const tblXml = tblM[1]

  // Column widths from a:tblGrid
  const colWidthsEmu: number[] = []
  const gridM = tblXml.match(/<a:tblGrid[^>]*>([\s\S]*?)<\/a:tblGrid>/)
  if (gridM) {
    for (const cm of gridM[1].matchAll(/<a:gridCol\b[^>]*\bw="(\d+)"/g)) {
      colWidthsEmu.push(+cm[1])
    }
  }

  // Rows
  const tableRows: ParsedTableRow[] = []
  for (const trM of tblXml.matchAll(/<a:tr\b([^>]*)>([\s\S]*?)<\/a:tr>/g)) {
    const hM = trM[1].match(/\bh="(\d+)"/)
    const heightEmu = hM ? +hM[1] : 500000

    const cells: ParsedTableCell[] = []
    for (const tcM of trM[2].matchAll(/<a:tc\b([^>]*)>([\s\S]*?)<\/a:tc>/g)) {
      const tcAttrs = tcM[1]
      const tcContent = tcM[2]

      const gridSpanM = tcAttrs.match(/\bgridSpan="(\d+)"/)
      const rowSpanM = tcAttrs.match(/\browSpan="(\d+)"/)
      const vMergeM = tcAttrs.match(/\bvMerge="(\d+)"/)
      const hMergeM = tcAttrs.match(/\bhMerge="(\d+)"/)

      // Cell fill
      let fillHex: string | undefined
      const tcPrM = tcContent.match(/<a:tcPr\b[^>]*>([\s\S]*?)<\/a:tcPr>/)
      if (tcPrM) fillHex = extractFillHex(tcPrM[1], themeColors)

      const txBodyM = tcContent.match(/<a:txBody[^>]*>([\s\S]*?)<\/a:txBody>/)
      const paragraphs = txBodyM ? parseParagraphs(txBodyM[1], themeColors) : []

      cells.push({
        paragraphs,
        fillHex,
        gridSpan: gridSpanM ? +gridSpanM[1] : undefined,
        rowSpan: rowSpanM ? +rowSpanM[1] : undefined,
        vMerge: !!vMergeM,
        hMerge: !!hMergeM,
      })
    }

    tableRows.push({ heightEmu, cells })
  }

  if (tableRows.length === 0) return null
  return { kind: 'table', id, xEmu, yEmu, wEmu, hEmu, paragraphs: [], tableRows, colWidthsEmu }
}

// ── Generic shape extractor ────────────────────────────────────────────────────

/**
 * Extract all visible shapes from a slide/layout/master XML.
 * @param skipPlaceholders When true, skip <p:sp> containing <p:ph> (used for master/layout)
 */
async function extractShapesFromXml(
  xml: string,
  zip: JSZip,
  relsMap: Map<string, string>,
  xmlPath: string,
  skipPlaceholders: boolean,
  themeColors: Map<string, string>,
): Promise<ParsedShape[]> {
  const shapes: ParsedShape[] = []

  // Strip group subtrees first so we don't double-count shapes inside groups
  const xmlNoGroups = xml.replace(/<p:grpSp\b[\s\S]*?<\/p:grpSp>/g, '')

  // Text/Rect shapes (p:sp)
  for (const sm of xmlNoGroups.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
    if (skipPlaceholders && sm[0].includes('<p:ph')) continue
    const shape = parseSpXml(sm[0], themeColors)
    if (shape) shapes.push(shape)
  }

  // Image shapes (p:pic)
  for (const pm of xmlNoGroups.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)) {
    const shape = await parsePicXml(pm[0], relsMap, zip, xmlPath)
    if (shape) shapes.push(shape)
  }

  // Table shapes (p:graphicFrame)
  for (const gm of xmlNoGroups.matchAll(/<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g)) {
    if (!gm[0].includes('<a:tbl')) continue
    const shape = parseTableXml(gm[0], themeColors)
    if (shape) shapes.push(shape)
  }

  // Group shapes (p:grpSp) — recursively extract children with coordinate transform
  for (const grpM of xml.matchAll(/<p:grpSp\b[\s\S]*?<\/p:grpSp>/g)) {
    const gt = parseGroupXfrm(grpM[0])
    // Inner content = everything after the grpSpPr block
    const afterGrpSpPr = grpM[0].match(/<\/p:grpSpPr>([\s\S]*)$/)
    if (!afterGrpSpPr) continue
    const innerXml = afterGrpSpPr[1].replace(/<\/p:grpSp>\s*$/, '')
    const innerShapes = await extractShapesFromXml(innerXml, zip, relsMap, xmlPath, skipPlaceholders, themeColors)
    if (gt) {
      for (const s of innerShapes) shapes.push(applyGroupTransform(s, gt))
    } else {
      shapes.push(...innerShapes)
    }
  }

  return shapes
}

// ── Inherited shapes loader (slide layout + slide master) ─────────────────────

/**
 * Load non-placeholder shapes from the slide layout and slide master.
 * These are always-visible decorative elements: company logos, colored bars, etc.
 * Render ORDER: master shapes (bottom) → layout shapes → slide shapes (top)
 */
async function loadInheritedShapes(
  slideXmlPath: string,
  slideRelsMap: Map<string, string>,
  zip: JSZip,
  themeColors: Map<string, string>,
): Promise<{ shapes: ParsedShape[]; backgroundHex?: string }> {
  // Find layout path from slide rels
  let layoutPath: string | undefined
  for (const target of slideRelsMap.values()) {
    if (target.toLowerCase().includes('slidelayout')) {
      layoutPath = resolvePath(xmlDir(slideXmlPath), target)
      break
    }
  }
  if (!layoutPath) return { shapes: [] }

  const layoutFile = zip.files[layoutPath]
  if (!layoutFile) return { shapes: [] }
  const layoutXml = await layoutFile.async('string')
  const layoutRelsMap = await readRels(layoutPath, zip)

  // Find master path from layout rels
  let masterPath: string | undefined
  for (const target of layoutRelsMap.values()) {
    if (target.toLowerCase().includes('slidemaster')) {
      masterPath = resolvePath(xmlDir(layoutPath), target)
      break
    }
  }

  let masterShapes: ParsedShape[] = []
  let masterBg: string | undefined

  if (masterPath) {
    const masterFile = zip.files[masterPath]
    if (masterFile) {
      const masterXml = await masterFile.async('string')
      const masterRelsMap = await readRels(masterPath, zip)
      masterBg = extractBackgroundHex(masterXml, themeColors)
      // skipPlaceholders=true: only load decorative non-placeholder shapes from master
      masterShapes = await extractShapesFromXml(masterXml, zip, masterRelsMap, masterPath, true, themeColors)
    }
  }

  const layoutBg = extractBackgroundHex(layoutXml, themeColors)
  // skipPlaceholders=true: only load decorative non-placeholder shapes from layout
  const layoutShapes = await extractShapesFromXml(layoutXml, zip, layoutRelsMap, layoutPath, true, themeColors)

  return {
    shapes: [...masterShapes, ...layoutShapes],
    backgroundHex: layoutBg ?? masterBg,
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function parsePptxSlides(blob: Blob): Promise<ParsedSlide[]> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())

  // Load theme colors for scheme color resolution
  const themeColors = await loadThemeColors(zip)

  // Slide dimensions from presentation.xml
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
    const xmlPath = `ppt/slides/slide${idx}.xml`
    const xml = await entry.async('string')
    const relsMap = await readRels(xmlPath, zip)

    // Load master + layout decorative shapes (always-visible background elements)
    const { shapes: inheritedShapes, backgroundHex: inheritedBg } =
      await loadInheritedShapes(xmlPath, relsMap, zip, themeColors)

    // Slide's own background overrides master/layout background
    const backgroundHex = extractBackgroundHex(xml, themeColors) ?? inheritedBg

    // Parse slide's own shapes (keep all, including placeholders with content)
    const slideShapes = await extractShapesFromXml(xml, zip, relsMap, xmlPath, false, themeColors)

    // Render order: inherited shapes first (bottom), slide shapes on top
    const shapes = [...inheritedShapes, ...slideShapes]

    slides.push({ index: idx, slideWEmu, slideHEmu, shapes, backgroundHex })
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
    /<a:off x="-?\d+" y="-?\d+"/,
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
