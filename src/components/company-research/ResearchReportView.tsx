import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronDown, ChevronUp, ExternalLink, Clock, Star, RefreshCw, Loader2 } from 'lucide-react'
import type { ResearchProjectCompany } from '@/contexts/CompanyResearchContext'

interface ResearchReportViewProps {
  company: ResearchProjectCompany
  onRerun?: () => void
  isRerunning?: boolean
}

// ─── Section parser ────────────────────────────────────────────────────────────

interface Section {
  title: string   // empty string = preamble (content before first ## header)
  content: string
}

function parseSections(text: string): Section[] {
  const lines = text.split('\n')
  const sections: Section[] = []
  let currentTitle = ''
  let currentLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('## ') && !line.startsWith('### ')) {
      if (currentLines.some(l => l.trim()) || currentTitle) {
        sections.push({ title: currentTitle, content: currentLines.join('\n') })
      }
      currentTitle = line.slice(3).trim()
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }

  if (currentLines.some(l => l.trim()) || currentTitle) {
    sections.push({ title: currentTitle, content: currentLines.join('\n') })
  }

  return sections
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ResearchReportView({ company, onRerun, isRerunning }: ResearchReportViewProps) {
  const [openSections, setOpenSections] = useState<Set<number>>(new Set([0]))
  const [showSources, setShowSources] = useState(false)
  const metadata = company.research_metadata || {}

  const sections = company.research_content ? parseSections(company.research_content) : []
  const namedSections = sections.filter(s => s.title !== '')

  const toggleSection = (idx: number) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const expandAll = () => setOpenSections(new Set(sections.map((_, i) => i)))
  const collapseAll = () => setOpenSections(new Set())

  return (
    <div className="space-y-3">
      {/* Header bar */}
      {company.research_content && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {company.quality_score && (
              <Badge variant={company.quality_score >= 7 ? 'default' : 'secondary'} className="gap-1">
                <Star className="h-3 w-3" />
                {company.quality_score}/10
              </Badge>
            )}
            {typeof metadata.total_time_ms === 'number' && (
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                {`${Math.round(metadata.total_time_ms / 1000)}s`}
              </Badge>
            )}
            {typeof metadata.llm_model === 'string' && (
              <Badge variant="outline" className="text-xs hidden sm:flex">
                {metadata.llm_model}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {namedSections.length > 0 && (
              <>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  onClick={expandAll}
                >
                  Expand all
                </button>
                <span className="text-muted-foreground text-xs">·</span>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  onClick={collapseAll}
                >
                  Collapse all
                </button>
              </>
            )}
            {onRerun && (
              <Button size="sm" variant="outline" onClick={onRerun} disabled={isRerunning}>
                {isRerunning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                Re-run
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Report sections */}
      {sections.length > 0 && (
        <div className="space-y-2">
          {sections.map((section, idx) => {
            const isPreamble = section.title === ''
            const isOpen = openSections.has(idx)

            if (isPreamble) {
              return (
                <div
                  key={idx}
                  className="research-report text-sm leading-relaxed px-1"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(section.content) }}
                />
              )
            }

            return (
              <div key={idx} className="border rounded-lg overflow-hidden bg-background">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                  onClick={() => toggleSection(idx)}
                >
                  <span className="font-semibold text-sm">{section.title}</span>
                  {isOpen
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  }
                </button>
                {isOpen && (
                  <div className="border-t px-4 py-3 bg-muted/10">
                    <div
                      className="research-report text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(section.content) }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Sources */}
      {company.research_sources && company.research_sources.length > 0 && (
        <Card className="mt-2">
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowSources(!showSources)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Sources ({company.research_sources.length})
              </CardTitle>
              {showSources ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardHeader>
          {showSources && (
            <CardContent>
              <ul className="space-y-2">
                {company.research_sources.map((source, idx) => (
                  <li key={idx} className="text-sm">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {source.title || source.url}
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                    {source.snippet && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{source.snippet}</p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}

      {/* Error */}
      {company.status === 'failed' && company.error_message && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">{company.error_message}</p>
            {onRerun && (
              <Button size="sm" variant="outline" className="mt-2" onClick={onRerun} disabled={isRerunning}>
                {isRerunning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                Retry
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inline(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">$1</a>')
}

function parseTableRow(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1)
    .map(cell => cell.trim())
}

function isSeparatorRow(line: string): boolean {
  return /^\|[\s\-:|]+\|/.test(line)
}

function renderMarkdown(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // ── Code block ────────────────────────────────────────────
    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(esc(lines[i]))
        i++
      }
      out.push(`<pre class="bg-muted rounded-md p-3 my-3 overflow-x-auto text-xs font-mono leading-relaxed border"><code>${codeLines.join('\n')}</code></pre>`)
      i++
      continue
    }

    // ── Table ─────────────────────────────────────────────────
    if (line.startsWith('|') && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const headerCells = parseTableRow(line)
      i += 2
      const bodyRows: string[][] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        bodyRows.push(parseTableRow(lines[i]))
        i++
      }
      out.push(`
        <div class="overflow-x-auto my-3 rounded-md border">
          <table class="w-full text-xs border-collapse">
            <thead class="bg-muted/60">
              <tr>${headerCells.map(h => `<th class="px-3 py-2 text-left font-semibold text-foreground border-b whitespace-nowrap">${inline(esc(h))}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${bodyRows.map((row, ri) => `<tr class="${ri % 2 === 1 ? 'bg-muted/20' : ''}">${row.map(c => `<td class="px-3 py-1.5 border-b border-border/50 align-top">${inline(esc(c))}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>`)
      continue
    }

    // ── H3 ────────────────────────────────────────────────────
    if (line.startsWith('### ') && !line.startsWith('#### ')) {
      out.push(`<h3 class="text-sm font-semibold mt-4 mb-1.5 text-foreground">${inline(esc(line.slice(4)))}</h3>`)
      i++; continue
    }

    // ── H4 ────────────────────────────────────────────────────
    if (line.startsWith('#### ')) {
      out.push(`<h4 class="text-sm font-medium mt-3 mb-1 text-muted-foreground uppercase tracking-wide">${inline(esc(line.slice(5)))}</h4>`)
      i++; continue
    }

    // ── Blockquote ────────────────────────────────────────────
    if (line.startsWith('> ')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(inline(esc(lines[i].slice(2))))
        i++
      }
      const isWarning = quoteLines.some(l => l.includes('⚠') || l.includes('MANUAL') || l.includes('Important') || l.includes('INFERENCE'))
      const style = isWarning
        ? 'border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/20 pl-3 pr-3 py-2 my-2 rounded-r-md text-xs text-amber-800 dark:text-amber-300'
        : 'border-l-4 border-primary/30 pl-3 py-1.5 my-2 text-sm text-muted-foreground italic'
      out.push(`<div class="${style}">${quoteLines.join('<br />')}</div>`)
      continue
    }

    // ── Horizontal rule ───────────────────────────────────────
    if (line.match(/^[-*]{3,}$/)) {
      out.push('<hr class="my-4 border-border" />')
      i++; continue
    }

    // ── Unordered list ────────────────────────────────────────
    if (line.match(/^[-*•] /)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^[-*•] /)) {
        items.push(`<li class="ml-1">${inline(esc(lines[i].replace(/^[-*•] /, '')))}</li>`)
        i++
      }
      out.push(`<ul class="list-disc list-outside pl-5 my-2 space-y-0.5 text-sm">${items.join('')}</ul>`)
      continue
    }

    // ── Ordered list ──────────────────────────────────────────
    if (line.match(/^\d+[.)]\s/)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^\d+[.)]\s/)) {
        items.push(`<li class="ml-1">${inline(esc(lines[i].replace(/^\d+[.)]\s/, '')))}</li>`)
        i++
      }
      out.push(`<ol class="list-decimal list-outside pl-5 my-2 space-y-0.5 text-sm">${items.join('')}</ol>`)
      continue
    }

    // ── Empty line ────────────────────────────────────────────
    if (line.trim() === '') {
      i++; continue
    }

    // ── Paragraph ─────────────────────────────────────────────
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('>') &&
      !lines[i].startsWith('|') &&
      !lines[i].match(/^[-*•] /) &&
      !lines[i].match(/^\d+[.)]\s/) &&
      !lines[i].startsWith('```') &&
      !lines[i].match(/^[-*]{3,}$/)
    ) {
      paraLines.push(inline(esc(lines[i])))
      i++
    }
    if (paraLines.length > 0) {
      out.push(`<p class="my-2 leading-relaxed">${paraLines.join('<br />')}</p>`)
    }
  }

  return out.join('\n')
}
