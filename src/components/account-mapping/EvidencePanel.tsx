import { useState } from 'react'
import { ChevronDown, ChevronUp, Globe, Newspaper, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CompanyEnrichment } from '@/types/enrichment'

interface EvidencePanelProps {
  enrichment?: CompanyEnrichment
  expanded: boolean
  onToggle: () => void
}

export function EvidencePanel({ enrichment, expanded, onToggle }: EvidencePanelProps) {
  const [showFullMarkdown, setShowFullMarkdown] = useState(false)

  if (!enrichment) return null

  const hasWebsite = enrichment.websiteData?.success
  const hasNews = enrichment.newsData?.success && enrichment.newsData.articles.length > 0

  if (!hasWebsite && !hasNews) return null

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? 'Hide Evidence' : 'View Evidence'}
      </button>

      {expanded && (
        <div
          className="mt-1.5 rounded-md border border-dashed p-2.5 space-y-3 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Website Data */}
          {hasWebsite && (
            <div>
              <div className="flex items-center gap-1 font-medium text-muted-foreground mb-1">
                <Globe className="h-3 w-3" />
                Website Data
              </div>
              {enrichment.websiteData.metadata?.title && (
                <p className="font-medium">{enrichment.websiteData.metadata.title}</p>
              )}
              {enrichment.websiteData.metadata?.description && (
                <p className="text-muted-foreground">{enrichment.websiteData.metadata.description}</p>
              )}
              {enrichment.websiteData.markdown && (
                <div className="mt-1 rounded bg-muted/50 p-2 text-[11px] leading-relaxed">
                  <p className="whitespace-pre-wrap">
                    {showFullMarkdown
                      ? enrichment.websiteData.markdown.substring(0, 1500)
                      : enrichment.websiteData.markdown.substring(0, 300)}
                    {enrichment.websiteData.markdown.length > 300 && !showFullMarkdown && '...'}
                  </p>
                  {enrichment.websiteData.markdown.length > 300 && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-[10px]"
                      onClick={() => setShowFullMarkdown(!showFullMarkdown)}
                    >
                      {showFullMarkdown ? 'Show less' : 'Read more'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* News Data */}
          {hasNews && (
            <div>
              <div className="flex items-center gap-1 font-medium text-muted-foreground mb-1">
                <Newspaper className="h-3 w-3" />
                Recent News ({enrichment.newsData.articles.length})
              </div>
              <ul className="space-y-1.5">
                {enrichment.newsData.articles.map((article, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                    <div className="min-w-0">
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary hover:underline inline-flex items-center gap-0.5"
                      >
                        {article.title}
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                      </a>
                      {article.description && (
                        <p className="text-muted-foreground line-clamp-2">{article.description}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
