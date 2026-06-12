import { useMemo, useState } from 'react'
import { useCadenceFlowMetrics, type FlowStep } from '@/hooks/useCadenceFlowMetrics'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Workflow } from 'lucide-react'
import { CadenceFlowStepCard } from './CadenceFlowStepCard'
import { CadenceFlowStepDialog } from './CadenceFlowStepDialog'
import { getStepTypeLabel } from './flowStepHelpers'

type Props = {
  cadenceId: string
  daysWindow?: number
}

function HowItWorks({ steps, cadenceName }: { steps: FlowStep[]; cadenceName: string }) {
  const summary = useMemo(() => {
    if (steps.length === 0) return ''
    const days = Array.from(new Set(steps.map((s) => s.day_offset))).sort((a, b) => a - b)
    const parts = days.map((d) => {
      const dayLabels = steps
        .filter((s) => s.day_offset === d)
        .map((s) => getStepTypeLabel(s.step_type))
        .join(' + ')
      return `Day ${d}: ${dayLabels}`
    })
    return parts.join(' → ')
  }, [steps])

  return (
    <Card className="border-dashed bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Workflow className="size-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Cómo funciona “{cadenceName}”</h3>
          <p className="mt-1 text-xs text-muted-foreground">{summary || '—'}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Cada card de abajo muestra qué se ejecutó, qué falló y cómo está calificando Carlos (QA)
            ese touch. Click en una card para ver el detalle de los últimos leads ejecutados.
          </p>
        </div>
      </div>
    </Card>
  )
}

function TimelineSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-20 animate-pulse rounded-md border border-dashed bg-muted/30" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-28 animate-pulse rounded-lg bg-muted/50" />
          {i < 4 && <div className="ml-5 h-4 w-px bg-border" />}
        </div>
      ))}
    </div>
  )
}

export function CadenceFlowTimeline({ cadenceId, daysWindow = 30 }: Props) {
  const { data, isLoading, isError, error } = useCadenceFlowMetrics(cadenceId, daysWindow)
  const [openStepId, setOpenStepId] = useState<string | null>(null)

  if (isLoading) return <TimelineSkeleton />
  if (isError) {
    return (
      <Card className="border-destructive/40 bg-destructive/5 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="size-5 text-destructive" />
          <div>
            <h3 className="font-semibold">No se pudieron cargar las métricas</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>
      </Card>
    )
  }
  if (!data) return null

  const openStep = data.steps.find((s) => s.step_id === openStepId) ?? null

  return (
    <div className="space-y-4">
      <HowItWorks steps={data.steps} cadenceName={data.cadence.name} />

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {data.cadence.total_steps} steps · {data.cadence.total_days} días · ventana últimos{' '}
          {data.days_window}d
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          {data.cadence.status}
        </Badge>
      </div>

      {data.steps.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Esta cadencia no tiene steps aún.
        </Card>
      ) : (
        <ol className="relative space-y-3">
          {data.steps.map((step, i) => (
            <li key={step.step_id} className="relative">
              <CadenceFlowStepCard step={step} onClick={() => setOpenStepId(step.step_id)} />
              {i < data.steps.length - 1 && (
                <div
                  aria-hidden
                  className="ml-8 h-4 w-px bg-gradient-to-b from-border to-transparent"
                />
              )}
            </li>
          ))}
        </ol>
      )}

      <CadenceFlowStepDialog
        step={openStep}
        open={!!openStepId}
        onOpenChange={(open) => !open && setOpenStepId(null)}
      />
    </div>
  )
}
