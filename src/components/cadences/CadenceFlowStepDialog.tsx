import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { FlowStep } from '@/hooks/useCadenceFlowMetrics'
import { formatRelative, getStepTypeLabel, StepIcon, statusTone, toneClasses } from './flowStepHelpers'

type Props = {
  step: FlowStep | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CadenceFlowStepDialog({ step, open, onOpenChange }: Props) {
  if (!step) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <StepIcon stepType={step.step_type} className="size-4" />
            </div>
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono text-xs">
                  Day {step.day_offset}
                </Badge>
                {step.step_label}
              </DialogTitle>
              <DialogDescription>
                {getStepTypeLabel(step.step_type)}
                {step.skill ? ` · ${step.skill.display_name}` : ''}
                {step.signal_allocation ? ` · ${step.signal_allocation}` : ''}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Config
            </h4>
            <ul className="mt-2 space-y-1 text-sm">
              <li className="flex items-center justify-between">
                <span>AI prompt</span>
                <Badge variant={step.config.has_ai_prompt ? 'default' : 'outline'} className="text-xs">
                  {step.config.has_ai_prompt ? 'configured' : 'none'}
                </Badge>
              </li>
              <li className="flex items-center justify-between">
                <span>Research prompt</span>
                <Badge variant={step.config.has_research_prompt ? 'default' : 'outline'} className="text-xs">
                  {step.config.has_research_prompt ? 'configured' : 'none'}
                </Badge>
              </li>
              <li className="flex items-center justify-between">
                <span>Message template</span>
                <Badge variant={step.config.has_template ? 'default' : 'outline'} className="text-xs">
                  {step.config.has_template ? 'configured' : 'none'}
                </Badge>
              </li>
            </ul>
          </section>

          <Separator />

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Carlos (QA)
            </h4>
            <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Threshold</div>
                <div className="text-lg font-semibold">
                  {step.carlos.threshold != null ? step.carlos.threshold.toFixed(1) : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Avg score 30d</div>
                <div className="text-lg font-semibold">
                  {step.carlos.avg_score_30d != null ? step.carlos.avg_score_30d.toFixed(2) : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Min acceptable</div>
                <div className="text-lg font-semibold">
                  {step.carlos.min_acceptable != null ? step.carlos.min_acceptable.toFixed(1) : '—'}
                </div>
              </div>
              <div className="col-span-3 text-xs text-muted-foreground">
                Basado en {step.carlos.samples} evaluaciones · max_attempts ={' '}
                {step.carlos.max_attempts ?? '—'}
              </div>
            </div>
          </section>

          <Separator />

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Últimas ejecuciones
            </h4>
            {step.recent_runs.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Aún no se ha ejecutado este step.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {step.recent_runs.map((run) => (
                  <li
                    key={run.instance_id}
                    className="flex items-center justify-between rounded-md border border-border/60 bg-card/50 px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{run.lead_name}</div>
                      {run.company && (
                        <div className="text-xs text-muted-foreground">{run.company}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge
                        variant="outline"
                        className={`${toneClasses(statusTone(run.status))} font-mono`}
                      >
                        {run.status}
                      </Badge>
                      <span className="text-muted-foreground">{formatRelative(run.updated_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
