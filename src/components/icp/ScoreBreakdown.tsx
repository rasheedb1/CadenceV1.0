import { ChevronDown } from 'lucide-react'
import { SCORE_CATEGORIES } from '@/lib/icp-constants'
import { cn } from '@/lib/utils'

interface ScoreBreakdownProps {
  breakdown: Record<string, number>
  expanded: boolean
  onToggle: () => void
}

const BAR_COLORS: Record<string, string> = {
  high: 'bg-green-500',
  medium: 'bg-yellow-500',
  low: 'bg-red-400',
}

function getBarColor(score: number): string {
  if (score >= 8) return BAR_COLORS.high
  if (score >= 5) return BAR_COLORS.medium
  return BAR_COLORS.low
}

export function ScoreBreakdown({ breakdown, expanded, onToggle }: ScoreBreakdownProps) {
  if (!breakdown || Object.keys(breakdown).length === 0) return null

  return (
    <div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        Score Details
        <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1" onClick={(e) => e.stopPropagation()}>
          {SCORE_CATEGORIES.map(({ key, label }) => {
            const score = breakdown[key] ?? 0
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-24 truncate">{label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', getBarColor(score))}
                    style={{ width: `${score * 10}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground w-4 text-right">{score}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
