import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Lightbulb, Loader2, Check, Sparkles } from 'lucide-react'
import type { ICPInsight } from '@/types/account-mapping'
import type { ICPBuilderData } from '@/types/icp-builder'

interface SmartICPInsightsProps {
  accountMapId: string
  builderData: ICPBuilderData
  feedbackCount: number
  onApplyInsight: (field: keyof ICPBuilderData, operation: 'add' | 'remove', value: string) => void
  onAnalyze: (accountMapId: string) => Promise<ICPInsight[]>
}

const CONFIDENCE_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'secondary' }> = {
  high: { label: 'High', variant: 'success' },
  medium: { label: 'Medium', variant: 'warning' },
  low: { label: 'Low', variant: 'secondary' },
}

export function SmartICPInsights({
  accountMapId,
  builderData,
  feedbackCount,
  onApplyInsight,
  onAnalyze,
}: SmartICPInsightsProps) {
  const [insights, setInsights] = useState<ICPInsight[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [appliedActions, setAppliedActions] = useState<Set<number>>(new Set())
  const [hasAnalyzed, setHasAnalyzed] = useState(false)

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setAppliedActions(new Set())
    try {
      const result = await onAnalyze(accountMapId)
      setInsights(result)
      setHasAnalyzed(true)
    } catch (err) {
      console.error('Failed to analyze feedback:', err)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleApply = (insight: ICPInsight, index: number) => {
    if (!insight.action) return
    const field = insight.action.field as keyof ICPBuilderData
    onApplyInsight(field, insight.action.operation, insight.action.value)
    setAppliedActions(prev => new Set(prev).add(index))
  }

  // Check if an action has already been applied by looking at builder data
  const isAlreadyInBuilder = (insight: ICPInsight): boolean => {
    if (!insight.action) return false
    const field = insight.action.field as keyof ICPBuilderData
    const currentValue = builderData[field]
    if (Array.isArray(currentValue)) {
      if (insight.action.operation === 'add') {
        return currentValue.includes(insight.action.value)
      }
      return !currentValue.includes(insight.action.value)
    }
    return false
  }

  if (feedbackCount === 0) {
    return (
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lightbulb className="h-4 w-4" />
            <span>Discover companies and give feedback to unlock AI insights.</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Smart ICP Insights
            <Badge variant="secondary" className="text-[10px] ml-1">
              {feedbackCount} ratings
            </Badge>
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="h-7 text-xs"
          >
            {analyzing ? (
              <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Analyzing...</>
            ) : (
              <><Lightbulb className="mr-1 h-3 w-3" /> {hasAnalyzed ? 'Re-analyze' : 'Analyze'}</>
            )}
          </Button>
        </div>
      </CardHeader>
      {hasAnalyzed && (
        <CardContent className="px-4 pb-3">
          {insights.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">
              Not enough feedback patterns detected yet. Rate more companies to get better insights.
            </p>
          ) : (
            <div className="space-y-2">
              {insights.map((insight, i) => {
                const conf = CONFIDENCE_CONFIG[insight.confidence] || CONFIDENCE_CONFIG.low
                const applied = appliedActions.has(i)
                const alreadyInBuilder = isAlreadyInBuilder(insight)
                return (
                  <div key={i} className="rounded-md border p-2.5 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {insight.category}
                          </Badge>
                          <Badge variant={conf.variant} className="text-[10px] px-1.5 py-0">
                            {conf.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-foreground">{insight.insight}</p>
                        <p className="text-xs text-primary/80 mt-0.5">{insight.suggestion}</p>
                      </div>
                      {insight.action && (
                        <Button
                          variant={applied || alreadyInBuilder ? 'ghost' : 'outline'}
                          size="sm"
                          className="h-6 text-[10px] shrink-0"
                          onClick={() => handleApply(insight, i)}
                          disabled={applied || alreadyInBuilder}
                        >
                          {applied || alreadyInBuilder ? (
                            <><Check className="mr-0.5 h-3 w-3" /> Applied</>
                          ) : (
                            'Apply'
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
