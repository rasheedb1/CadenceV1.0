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

export function ResearchReportView({ company, onRerun, isRerunning }: ResearchReportViewProps) {
  const [showSources, setShowSources] = useState(false)

  const metadata = company.research_metadata || {}

  return (
    <div className="space-y-4">
      {/* Summary */}
      {company.research_summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Executive Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{company.research_summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Full Report */}
      {company.research_content && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Full Research Report</CardTitle>
            <div className="flex items-center gap-2">
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
                <Badge variant="outline" className="text-xs">
                  {metadata.llm_model}
                </Badge>
              )}
              {onRerun && (
                <Button size="sm" variant="outline" onClick={onRerun} disabled={isRerunning}>
                  {isRerunning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                  Re-run
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div
              className="prose prose-sm dark:prose-invert max-w-none text-sm"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(company.research_content) }}
            />
          </CardContent>
        </Card>
      )}

      {/* Sources */}
      {company.research_sources && company.research_sources.length > 0 && (
        <Card>
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowSources(!showSources)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Sources ({company.research_sources.length})</CardTitle>
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
                      <ExternalLink className="h-3 w-3" />
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

/**
 * Simple markdown-to-HTML renderer for research reports.
 * Handles headers, bold, italic, lists, links, and line breaks.
 */
function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links [text](url)
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">$1</a>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr />')
    // Line breaks (double newline = paragraph)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br />')

  return `<p>${html}</p>`
}
