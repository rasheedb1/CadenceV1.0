// placeholder-guard.ts
// =============================================================================
// LAST LINE OF DEFENSE — scans outgoing message text (email body, subject,
// LinkedIn DM/note/comment) for unsubstituted template placeholders.
//
// Examples it MUST catch:
//   - "Hi {{first_name}}" / "Hi {first_name}" / "Hi [first_name]"
//   - "I work with {{company}}" / "{{Company Name}}" / "[Your Company]"
//   - "{{bc_url}}" / "[BC_URL]"  (URLs that didn't get substituted)
//   - "<recipient_name>" / "<%first_name%>" / "${first_name}"
//   - "[insert metric]" / "[YOUR NUMBER]" / "[Rappi + McDonald's]"
//   - "XXX" / "TBD" / "TODO" / "FIXME" / "placeholder"
//
// Used at outgoing boundary in:
//   - send-email
//   - linkedin-send-message
//   - linkedin-send-connection
//   - linkedin-comment
//   - chief-supervise-message (Carlos QA layer)
// =============================================================================

export type PlaceholderPattern =
  | 'mustache'         // {{first_name}}
  | 'single_brace'     // {first_name}
  | 'square_bracket'   // [first_name] or [BC_URL] or [insert metric]
  | 'angle_bracket'    // <first_name>
  | 'erb'              // <%first_name%>
  | 'js_template'      // ${first_name}
  | 'placeholder_word' // XXX, TBD, TODO, FIXME, placeholder

export interface PlaceholderHit {
  pattern: PlaceholderPattern
  match: string
  index: number
  context: string
}

const RULES: Array<{ name: PlaceholderPattern; regex: RegExp }> = [
  { name: 'mustache', regex: /\{\{[^{}]{1,80}\}\}/g },
  { name: 'single_brace', regex: /\{[a-zA-Z_][\w. ]{0,50}\}/g },
  { name: 'square_bracket', regex: /\[[a-zA-Z][a-zA-Z0-9_ \-+&',.]{1,58}\]/g },
  { name: 'angle_bracket', regex: /<[a-z][a-z_]{2,30}>/g },
  { name: 'erb', regex: /<%[^%]{1,60}%>/g },
  { name: 'js_template', regex: /\$\{[^{}]{1,60}\}/g },
  { name: 'placeholder_word', regex: /\b(XXX|YYY|ZZZ|TBD|FIXME|TODO|PLACEHOLDER)\b/g },
]

const WHITELIST = new Set<string>([])

const HTML_TAGS = new Set<string>([
  'div', 'span', 'br', 'hr', 'img', 'pre', 'code', 'sub', 'sup', 'wbr',
  'ins', 'del', 'kbd', 'var', 'cite', 'abbr', 'time', 'mark', 'ruby',
  'rt', 'rp', 'bdo', 'bdi', 'data', 'meter', 'menu', 'main', 'nav',
  'section', 'article', 'aside', 'header', 'footer', 'figure',
  'figcaption', 'details', 'summary', 'dialog', 'progress', 'output',
  'option', 'optgroup', 'fieldset', 'legend', 'label', 'select', 'input',
  'button', 'datalist', 'textarea', 'form', 'table', 'thead', 'tbody',
  'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'iframe', 'embed',
  'object', 'param', 'source', 'track', 'video', 'audio', 'canvas',
  'noscript', 'script', 'style', 'link', 'meta', 'base', 'head', 'body',
  'html', 'title', 'address', 'blockquote',
])

export function scanForPlaceholders(text: string | null | undefined): PlaceholderHit[] {
  if (!text || typeof text !== 'string' || text.length === 0) return []

  const hits: PlaceholderHit[] = []
  for (const rule of RULES) {
    rule.regex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = rule.regex.exec(text)) !== null) {
      if (WHITELIST.has(m[0])) continue
      if (rule.name === 'angle_bracket') {
        const inner = m[0].slice(1, -1).toLowerCase()
        if (HTML_TAGS.has(inner)) continue
      }
      hits.push({
        pattern: rule.name,
        match: m[0],
        index: m.index,
        context: text.slice(Math.max(0, m.index - 25), Math.min(text.length, m.index + m[0].length + 25)),
      })
    }
  }
  return hits
}

export interface MultiScanHit extends PlaceholderHit {
  field: string
}

export function scanFields(fields: Record<string, string | null | undefined>): MultiScanHit[] {
  const all: MultiScanHit[] = []
  for (const [field, text] of Object.entries(fields)) {
    const hits = scanForPlaceholders(text)
    for (const h of hits) all.push({ ...h, field })
  }
  return all
}

export function summarizeHits(hits: MultiScanHit[]): string {
  if (hits.length === 0) return 'no placeholders detected'
  return hits.map(h =>
    `[${h.field}] ${h.pattern}="${h.match}" near "..${h.context}.."`
  ).join(' | ')
}
