import type { SalesforceMatch } from '@/hooks/useSalesforceCheck'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface SalesforceBadgeProps {
  match: SalesforceMatch | null
  compact?: boolean
}

export function SalesforceBadge({ match, compact = false }: SalesforceBadgeProps) {
  if (!match || !match.has_active_opportunities) return null

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '-'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
  }

  const opp = match.latest_opportunity

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 text-xs">
              SF Pipeline
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium">{match.sf_account_name}</p>
              <p className="text-xs">
                {match.active_opportunities_count} active opp{match.active_opportunities_count > 1 ? 's' : ''} &middot; {formatCurrency(match.total_pipeline_value)}
              </p>
              {opp && (
                <p className="text-xs text-muted-foreground">
                  Latest: {opp.name} ({opp.stage}) {opp.close_date && `— closes ${opp.close_date}`}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
        In Pipeline
      </Badge>
      <span className="text-xs text-muted-foreground">
        {match.active_opportunities_count} opp{match.active_opportunities_count > 1 ? 's' : ''} &middot; {formatCurrency(match.total_pipeline_value)}
      </span>
    </div>
  )
}
