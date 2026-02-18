import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, AlertCircle, Globe, Newspaper } from 'lucide-react'
import type { EnrichmentStatus } from '@/types/enrichment'

interface EnrichmentBadgeProps {
  status: EnrichmentStatus
  hasWebsite?: boolean
  hasNews?: boolean
}

export function EnrichmentBadge({ status, hasWebsite, hasNews }: EnrichmentBadgeProps) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
          Pending
        </Badge>
      )
    case 'enriching':
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-600 border-blue-300">
          <Loader2 className="mr-0.5 h-2.5 w-2.5 animate-spin" />
          Enriching...
        </Badge>
      )
    case 'enriched':
      return (
        <span className="inline-flex items-center gap-1">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-600 border-green-300">
            <CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />
            Enriched
          </Badge>
          {hasWebsite && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0">
              <Globe className="mr-0.5 h-2.5 w-2.5" />
              Web
            </Badge>
          )}
          {hasNews && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0">
              <Newspaper className="mr-0.5 h-2.5 w-2.5" />
              News
            </Badge>
          )}
        </span>
      )
    case 'error':
      return (
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          <AlertCircle className="mr-0.5 h-2.5 w-2.5" />
          Failed
        </Badge>
      )
  }
}
