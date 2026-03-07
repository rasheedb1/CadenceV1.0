/**
 * Browser-side PPTX generation using pptxgenjs.
 * Called from Business Cases pages to download a .pptx file.
 */
import PptxGenJS from 'pptxgenjs'
import type { BusinessCase, BusinessCaseTemplate, BcSlide } from '@/types/business-cases'

// ── Slide layout helpers ──────────────────────────────────────────────────────

const BRAND_BLUE   = '2563EB'
const BRAND_DARK   = '0F172A'
const TEXT_GRAY    = '64748B'
const BG_WHITE     = 'FFFFFF'

function addCoverSlide(prs: PptxGenJS, slide: BcSlide, content: Record<string, string>, companyName: string) {
  const s = prs.addSlide()
  s.background = { color: BRAND_DARK }

  const title = content[`${slide.slide_number}_title`] || slide.title
  const subtitle = content[`${slide.slide_number}_subtitle`] || companyName

  s.addText(title, {
    x: 0.5, y: 2.0, w: 9, h: 1.5,
    fontSize: 36, bold: true, color: BG_WHITE,
    fontFace: 'Calibri', align: 'center',
  })
  s.addText(subtitle, {
    x: 0.5, y: 3.6, w: 9, h: 0.8,
    fontSize: 20, color: 'CBD5E1',
    fontFace: 'Calibri', align: 'center',
  })
}

function addTitleOnlySlide(prs: PptxGenJS, slide: BcSlide, content: Record<string, string>) {
  const s = prs.addSlide()
  s.background = { color: BG_WHITE }

  const title = content[`${slide.slide_number}_title`] || slide.title
  s.addText(title, {
    x: 0.5, y: 0.4, w: 9, h: 1.0,
    fontSize: 28, bold: true, color: BRAND_DARK,
    fontFace: 'Calibri',
  })

  const body = content[`${slide.slide_number}_body`] || slide.fixed_content || ''
  if (body) {
    s.addText(body, {
      x: 0.5, y: 1.6, w: 9, h: 4.5,
      fontSize: 14, color: TEXT_GRAY,
      fontFace: 'Calibri', valign: 'top', wrap: true,
    })
  }
}

function addTitleAndBodySlide(prs: PptxGenJS, slide: BcSlide, content: Record<string, string>) {
  const s = prs.addSlide()
  s.background = { color: BG_WHITE }

  // Title
  const title = content[`${slide.slide_number}_title`] || slide.title
  s.addText(title, {
    x: 0.5, y: 0.3, w: 9, h: 0.9,
    fontSize: 24, bold: true, color: BRAND_DARK, fontFace: 'Calibri',
  })
  // Divider line
  s.addShape(prs.ShapeType.rect, {
    x: 0.5, y: 1.25, w: 9, h: 0.04, fill: { color: BRAND_BLUE },
  })

  // Collect field values in sort order
  const bodyParts: string[] = []
  for (const field of slide.fields.sort((a, b) => a.sort_order - b.sort_order)) {
    const val = content[`${slide.slide_number}_${field.key}`] || field.fallback_default || ''
    if (val) {
      if (field.name) bodyParts.push(`${field.name}: ${val}`)
      else bodyParts.push(val)
    }
  }

  // Fixed content
  if (slide.fixed_content) bodyParts.unshift(slide.fixed_content)

  s.addText(bodyParts.join('\n\n'), {
    x: 0.5, y: 1.4, w: 9, h: 4.7,
    fontSize: 13, color: BRAND_DARK, fontFace: 'Calibri',
    valign: 'top', wrap: true,
  })
}

function addBulletsSlide(prs: PptxGenJS, slide: BcSlide, content: Record<string, string>) {
  const s = prs.addSlide()
  s.background = { color: BG_WHITE }

  const title = content[`${slide.slide_number}_title`] || slide.title
  s.addText(title, {
    x: 0.5, y: 0.3, w: 9, h: 0.9,
    fontSize: 24, bold: true, color: BRAND_DARK, fontFace: 'Calibri',
  })
  s.addShape(prs.ShapeType.rect, {
    x: 0.5, y: 1.25, w: 9, h: 0.04, fill: { color: BRAND_BLUE },
  })

  // Collect bullet items
  const bullets: string[] = []
  for (const field of slide.fields.sort((a, b) => a.sort_order - b.sort_order)) {
    const val = content[`${slide.slide_number}_${field.key}`]
    if (!val) continue
    if (field.output_type === 'list') {
      // May be newline-separated or comma-separated
      const items = val.includes('\n') ? val.split('\n') : val.split(',')
      bullets.push(...items.map((i) => i.trim()).filter(Boolean))
    } else {
      bullets.push(val.trim())
    }
  }
  if (slide.fixed_content) bullets.unshift(slide.fixed_content)

  if (bullets.length === 0) {
    s.addText('—', { x: 0.5, y: 1.5, w: 9, h: 4.0, fontSize: 13, color: TEXT_GRAY, fontFace: 'Calibri' })
    return
  }

  s.addText(
    bullets.map((b) => ({ text: b, options: { bullet: { type: 'bullet' }, paraSpaceAfter: 4 } })),
    { x: 0.6, y: 1.45, w: 8.8, h: 4.7, fontSize: 13, color: BRAND_DARK, fontFace: 'Calibri', valign: 'top' },
  )
}

function addTwoColumnsSlide(prs: PptxGenJS, slide: BcSlide, content: Record<string, string>) {
  const s = prs.addSlide()
  s.background = { color: BG_WHITE }

  const title = content[`${slide.slide_number}_title`] || slide.title
  s.addText(title, {
    x: 0.5, y: 0.3, w: 9, h: 0.9,
    fontSize: 24, bold: true, color: BRAND_DARK, fontFace: 'Calibri',
  })
  s.addShape(prs.ShapeType.rect, {
    x: 0.5, y: 1.25, w: 9, h: 0.04, fill: { color: BRAND_BLUE },
  })

  const sortedFields = slide.fields.sort((a, b) => a.sort_order - b.sort_order)
  const left = sortedFields.filter((_, i) => i % 2 === 0)
  const right = sortedFields.filter((_, i) => i % 2 === 1)

  const renderCol = (fields: typeof sortedFields, x: number) => {
    const parts: string[] = []
    for (const field of fields) {
      const val = content[`${slide.slide_number}_${field.key}`] || field.fallback_default || ''
      if (val) parts.push(`${field.name}:\n${val}`)
    }
    s.addText(parts.join('\n\n'), {
      x, y: 1.45, w: 4.3, h: 4.7,
      fontSize: 12, color: BRAND_DARK, fontFace: 'Calibri', valign: 'top', wrap: true,
    })
  }

  renderCol(left, 0.5)
  renderCol(right, 5.2)
}

function addBigNumberSlide(prs: PptxGenJS, slide: BcSlide, content: Record<string, string>) {
  const s = prs.addSlide()
  s.background = { color: BRAND_DARK }

  const title = content[`${slide.slide_number}_title`] || slide.title
  s.addText(title, {
    x: 0.5, y: 0.4, w: 9, h: 0.8,
    fontSize: 18, color: 'CBD5E1', fontFace: 'Calibri', align: 'center',
  })

  // Big number = first numeric/text field
  const primaryField = slide.fields[0]
  const bigNum = primaryField ? (content[`${slide.slide_number}_${primaryField.key}`] || '—') : '—'
  s.addText(bigNum, {
    x: 0.5, y: 1.4, w: 9, h: 2.0,
    fontSize: 72, bold: true, color: BG_WHITE, fontFace: 'Calibri', align: 'center',
  })

  // Supporting text from remaining fields
  const supportParts = slide.fields.slice(1).map((f) => content[`${slide.slide_number}_${f.key}`] || '').filter(Boolean)
  if (supportParts.length > 0) {
    s.addText(supportParts.join('  •  '), {
      x: 0.5, y: 3.6, w: 9, h: 0.8,
      fontSize: 16, color: 'CBD5E1', fontFace: 'Calibri', align: 'center',
    })
  }

  if (slide.fixed_content) {
    s.addText(slide.fixed_content, {
      x: 0.5, y: 4.5, w: 9, h: 1.0,
      fontSize: 12, color: '94A3B8', fontFace: 'Calibri', align: 'center',
    })
  }
}

function addGenericSlide(prs: PptxGenJS, slide: BcSlide, content: Record<string, string>) {
  // Fallback
  addTitleAndBodySlide(prs, slide, content)
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function downloadBusinessCasePptx(
  bc: BusinessCase,
  template: BusinessCaseTemplate,
  content: Record<string, string>,
): Promise<void> {
  const prs = new PptxGenJS()
  prs.layout = 'LAYOUT_WIDE'

  // Set metadata
  prs.title = `${bc.company_name} — Business Case`
  prs.company = 'Laiky AI'

  for (const slide of template.slide_structure.sort((a, b) => a.slide_number - b.slide_number)) {
    switch (slide.layout) {
      case 'cover':
        addCoverSlide(prs, slide, content, bc.company_name)
        break
      case 'title_only':
        addTitleOnlySlide(prs, slide, content)
        break
      case 'title_and_bullets':
        addBulletsSlide(prs, slide, content)
        break
      case 'two_columns':
        addTwoColumnsSlide(prs, slide, content)
        break
      case 'big_number':
        addBigNumberSlide(prs, slide, content)
        break
      case 'title_and_body':
      case 'comparison_table':
      default:
        addGenericSlide(prs, slide, content)
        break
    }
  }

  const filename = `${bc.company_name.replace(/[^a-zA-Z0-9 _-]/g, '')}_BusinessCase.pptx`
  await prs.writeFile({ fileName: filename })
}
