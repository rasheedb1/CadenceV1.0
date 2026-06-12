import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Check, TriangleAlert, MinusCircle } from 'lucide-react'
import type { FlowStep } from '@/hooks/useCadenceFlowMetrics'
import {
  formatRelative,
  getStepTypeLabel,
  StepIcon,
  statusTone,
  toneClasses,
} from './flowStepHelpers'

type Props = {
  step: FlowStep
  onClick?: () => void
}

function MetricTile({
  label,
  value,
  tone,
  help,
}: {
  label: string
  value: number | string
  tone: 'success' | 'danger' | 'warning' | 'info' | 'muted'
  help: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`rounded-md border px-3 py-2 ${toneClasses(tone)} cursor-help`}
        >
          <div className="text-2xl font-semibold leading-none">{value}</div>
          <div className="mt-1 text-[11px] uppercase tracking-wide opacity-80">{label}</div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs">
        {help}
      </TooltipContent>
    </Tooltip>
  )
}

export function CadenceFlowStepCard({ step, onClick }: Props) {
  const carlosPassing =
    step.carlos.threshold != null &&
    step.carlos.avg_score_30d != null &&
    step.carlos.avg_score_30d >= step.carlos.threshold

  const carlosStatusIcon = step.carlos.avg_score_30d == null ? (
    <MinusCircle className="size-4 text-muted-foreground" />
  ) : carlosPassing ? (
    <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
  ) : (
    <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" />
  )

  const successPct =
    step.metrics.success_rate != null ? `${Math.round(step.metrics.success_rate * 100)}%` : '—'

  return (
    <TooltipProvider delayDuration={200}>
      <Card
        className="cursor-pointer p-5 transition-all hover:border-primary/40 hover:shadow-md"
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onClick?.()
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <StepIcon stepType={step.step_type} className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-mono text-xs">
                  Day {step.day_offset}
                </Badge>
                <span className="text-sm text-muted-foreground">{getStepTypeLabel(step.step_type)}</span>
              </div>
              <h3 className="mt-1 text-base font-semibold">{step.step_label}</h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {step.skill && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs">
                    {step.skill.display_name}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="text-xs">Skill que ejecuta este step</TooltipContent>
              </Tooltip>
            )}
            {step.signal_allocation && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs">
                    {step.signal_allocation}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  Value prop / signal asignado a este touch
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
          <MetricTile
            label="Scheduled"
            value={step.metrics.scheduled}
            tone="info"
            help="Instancias en estado pending o generated esperando ejecución"
          />
          <MetricTile
            label="Sent"
            value={step.metrics.executed}
            tone="success"
            help="Mensajes / tareas ejecutadas con éxito en los últimos 30 días"
          />
          <MetricTile
            label="Failed"
            value={step.metrics.failed}
            tone="danger"
            help="Intentos que terminaron en error (provider rechazó, sin permisos, etc)"
          />
          <MetricTile
            label="Skipped"
            value={step.metrics.skipped}
            tone="warning"
            help="Saltados por Carlos por no superar min_acceptable o por estado del lead"
          />
          <MetricTile
            label="Success"
            value={successPct}
            tone={step.metrics.success_rate == null ? 'muted' : step.metrics.success_rate >= 0.9 ? 'success' : 'warning'}
            help="Sent / (Sent + Failed) — qué % de intentos terminaron OK"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            {carlosStatusIcon}
            <span className="text-muted-foreground">Carlos:</span>
            <span className="font-medium">
              {step.carlos.avg_score_30d != null ? step.carlos.avg_score_30d.toFixed(1) : '—'}
            </span>
            <span className="text-muted-foreground">/ threshold</span>
            <span className="font-medium">
              {step.carlos.threshold != null ? step.carlos.threshold.toFixed(1) : '—'}
            </span>
            <span className="text-muted-foreground">({step.carlos.samples} evaluaciones)</span>
          </div>

          {step.recent_runs.length > 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-muted-foreground">Últimas:</span>
              <div className="flex gap-1">
                {step.recent_runs.slice(0, 5).map((run) => (
                  <Tooltip key={run.instance_id}>
                    <TooltipTrigger asChild>
                      <span
                        className={`inline-block size-2.5 rounded-full border ${toneClasses(statusTone(run.status))}`}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <div className="font-medium">{run.lead_name}</div>
                      {run.company && <div className="text-muted-foreground">{run.company}</div>}
                      <div className="mt-1">
                        {run.status} · {formatRelative(run.updated_at)}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </TooltipProvider>
  )
}
