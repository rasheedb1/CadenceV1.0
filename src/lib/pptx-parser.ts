/**
 * PPTX Variable Parser
 *
 * Reads an uploaded .pptx file (which is a ZIP) and extracts all
 * {{variable}} and {{AI: instruction}} placeholders from slide XML.
 *
 * Handles cases where placeholders are split across multiple XML text runs
 * by joining all text within a paragraph before scanning.
 */
import JSZip from 'jszip'
import type { DetectedVariable } from '@/types/business-cases'

// ── Auto-variable mapping (variable name → lead field key) ────────────────────

export const AUTO_VARIABLE_MAP: Record<string, string> = {
  // Company
  empresa: 'company',
  compania: 'company',
  company: 'company',
  organization: 'company',
  organizacion: 'company',
  cuenta: 'company',
  account: 'company',
  // Contact name
  nombre: 'contact_name',
  name: 'contact_name',
  contacto: 'contact_name',
  contact: 'contact_name',
  full_name: 'contact_name',
  nombre_completo: 'contact_name',
  // First / last name
  first_name: 'first_name',
  nombre_propio: 'first_name',
  last_name: 'last_name',
  apellido: 'last_name',
  // Title
  titulo: 'title',
  title: 'title',
  cargo: 'title',
  puesto: 'title',
  position: 'title',
  role: 'title',
  // Email
  email: 'email',
  correo: 'email',
  // Phone
  phone: 'phone',
  telefono: 'phone',
  // Website
  website: 'website',
  sitio_web: 'website',
  web: 'website',
  // Industry
  industria: 'industry',
  industry: 'industry',
  sector: 'industry',
  // Date
  fecha: 'date',
  date: 'date',
  today: 'date',
  hoy: 'date',
}

// ── Helper: extract concatenated text from all <a:t> inside a paragraph ───────

function getParagraphText(paragraphXml: string): string {
  const matches = [...paragraphXml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
  return matches.map((m) => decodeXmlEntities(m[1])).join('')
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Parse all {{...}} placeholders from a PPTX file.
 * Returns deduplicated list of DetectedVariable objects.
 */
export async function parsePptxVariables(file: File): Promise<DetectedVariable[]> {
  const buffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buffer)
  const variableMap = new Map<string, DetectedVariable>()

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    // Only process slide XML files (not relationships, notes, etc.)
    if (!path.match(/^ppt\/slides\/slide\d+\.xml$/)) continue

    const xml = await zipEntry.async('string')

    // Process paragraph by paragraph to handle split runs
    const paragraphs = [...xml.matchAll(/<a:p[^>]*>[\s\S]*?<\/a:p>/g)]
    for (const para of paragraphs) {
      const text = getParagraphText(para[0])

      // Find all {{...}} in the full paragraph text
      const matches = [...text.matchAll(/\{\{([^}]+)\}\}/g)]
      for (const match of matches) {
        const raw = match[0]
        const inner = match[1].trim()

        if (variableMap.has(inner)) continue

        // Detect AI variables: {{AI: instruction}} or {{AI instruction}}
        const aiMatch = inner.match(/^AI[:\s]+(.+)$/i)
        if (aiMatch) {
          const instruction = aiMatch[1].trim()
          variableMap.set(inner, {
            key: inner,
            raw,
            type: 'ai',
            instruction,
          })
        } else {
          // Auto variable — try to map to a lead field
          const normalizedKey = inner.toLowerCase().replace(/\s+/g, '_')
          const fieldKey = AUTO_VARIABLE_MAP[normalizedKey] || normalizedKey
          variableMap.set(inner, {
            key: inner,
            raw,
            type: 'auto',
            field_key: fieldKey,
          })
        }
      }
    }
  }

  return [...variableMap.values()]
}
