/**
 * PPTX Text Substitutor
 *
 * Downloads a PPTX from Supabase Storage, substitutes all {{variable}}
 * placeholders with provided values, and returns the modified PPTX as a Blob
 * ready for download.
 *
 * Strategy: work at the paragraph (<a:p>) level.
 * 1. Join all text from all runs in the paragraph.
 * 2. If the full text contains a placeholder, substitute it.
 * 3. Put the full substituted text in the first text run, clear others.
 * This handles placeholders split across multiple XML runs.
 */
import JSZip from 'jszip'

// ── XML helpers ───────────────────────────────────────────────────────────────

function encodeXmlEntities(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

// ── Paragraph-level substitution ──────────────────────────────────────────────

function substituteInParagraph(paragraphXml: string, substitutions: Record<string, string>): string {
  // Collect text from all runs
  const runMatches = [...paragraphXml.matchAll(/<a:r[^>]*>[\s\S]*?<\/a:r>/g)]
  if (runMatches.length === 0) return paragraphXml

  const allText = runMatches
    .map((r) => {
      const t = r[0].match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/)
      return t ? decodeXmlEntities(t[1]) : ''
    })
    .join('')

  // Apply all substitutions
  let substituted = allText
  let changed = false
  for (const [key, value] of Object.entries(substitutions)) {
    const placeholder = `{{${key}}}`
    if (substituted.includes(placeholder)) {
      substituted = substituted.split(placeholder).join(value)
      changed = true
    }
  }

  if (!changed) return paragraphXml

  // Reconstruct: put full substituted text in first run, clear rest
  let firstRun = true
  let result = paragraphXml

  result = result.replace(/<a:r[^>]*>[\s\S]*?<\/a:r>/g, (runXml) => {
    if (firstRun) {
      firstRun = false
      // Replace text content of this run with the full substituted text
      return runXml.replace(
        /(<a:t[^>]*>)([\s\S]*?)(<\/a:t>)/,
        (_m, open, _content, close) => `${open}${encodeXmlEntities(substituted)}${close}`,
      )
    }
    // Wipe text in subsequent runs (keep formatting tags like a:rPr)
    return runXml.replace(
      /(<a:t[^>]*>)([\s\S]*?)(<\/a:t>)/,
      (_m, open, _content, close) => `${open}${close}`,
    )
  })

  return result
}

// ── Slide XML substitutor ─────────────────────────────────────────────────────

function substituteSlideXml(xml: string, substitutions: Record<string, string>): string {
  return xml.replace(/<a:p[^>]*>[\s\S]*?<\/a:p>/g, (para) =>
    substituteInParagraph(para, substitutions),
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Download a PPTX template from Supabase Storage, substitute all
 * {{variable}} placeholders with the provided values, and return the
 * modified PPTX as a Blob.
 *
 * @param templateBlob  The raw PPTX file (from supabase.storage.download)
 * @param substitutions Map of variable key → replacement value
 *                      Keys should NOT include {{ }} brackets.
 */
export async function substitutePptx(
  templateBlob: Blob,
  substitutions: Record<string, string>,
): Promise<Blob> {
  const buffer = await templateBlob.arrayBuffer()
  const zip = await JSZip.loadAsync(buffer)

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (!path.match(/^ppt\/slides\/slide\d+\.xml$/)) continue

    const xml = await zipEntry.async('string')
    const modified = substituteSlideXml(xml, substitutions)
    zip.file(path, modified)
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  })
}
