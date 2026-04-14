import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useWorkflow } from '@/contexts/WorkflowContext'
import { useCadence } from '@/contexts/CadenceContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Bot, CheckCircle, XCircle, Clock, AlertTriangle, Loader2 } from 'lucide-react'
import { WORKFLOW_RUN_STATUS_CONFIG } from '@/types/workflow'

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  running: Loader2,
  waiting: Clock,
  completed: CheckCircle,
  failed: XCircle,
  paused: AlertTriangle,
}

export function WorkflowRuns() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const isAgentMode = location.pathname.startsWith('/agents/workflows')
  const basePath = isAgentMode ? '/agents/workflows' : '/workflows'
  const { workflows, getWorkflowRuns, getWorkflowEventLog } = useWorkflow()
  const { leads } = useCadence()

  const workflow = workflows.find((w) => w.id === id)
  const runs = id ? getWorkflowRuns(id) : []

  if (!workflow) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Workflow no encontrado</p>
      </div>
    )
  }

  return (
    <div className={isAgentMode ? 'min-h-screen bg-background' : ''}>
      {isAgentMode && (
        <div className="border-b bg-background/95 backdrop-blur px-6 py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(`${basePath}/${id}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Builder
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bot className="h-4 w-4" />
            <span>Agent Workflows</span>
            <span>/</span>
            <span className="text-foreground font-medium">{workflow.name}</span>
            <span>/</span>
            <span className="text-foreground font-medium">Runs</span>
          </div>
        </div>
      )}
      <div className="p-8">
        {!isAgentMode && (
          <Button variant="ghost" className="mb-4" onClick={() => navigate(`${basePath}/${id}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Builder
          </Button>
        )}
        <div className="mb-8">
          <h1 className="text-[28px] font-bold tracking-tight font-heading">{workflow.name} — Runs</h1>
          <p className="text-muted-foreground">
            {runs.length} run{runs.length !== 1 ? 's' : ''} {isAgentMode ? 'ejecutados' : 'enrolled'}
          </p>
        </div>

        {runs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground">
                {isAgentMode ? 'No hay ejecuciones aún. Activa el workflow para empezar.' : 'Sin leads asignados a este workflow aún'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {runs.map((run) => {
              const lead = !isAgentMode ? leads.find((l) => l.id === run.lead_id) : null
              const statusConfig = WORKFLOW_RUN_STATUS_CONFIG[run.status]
              const StatusIcon = STATUS_ICONS[run.status] || Clock
              const currentNode = workflow.graph_json.nodes.find(
                (n) => n.id === run.current_node_id
              )
              const eventLog = getWorkflowEventLog(run.id)
              const context = run.context_json as Record<string, unknown> || {}
              const startTime = new Date(run.started_at)
              const duration = run.status === 'completed'
                ? Math.round((new Date(run.updated_at).getTime() - startTime.getTime()) / 1000)
                : null

              return (
                <Card key={run.id}>
                  <CardHeader className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <StatusIcon className={`h-5 w-5 ${
                          run.status === 'completed' ? 'text-emerald-500' :
                          run.status === 'failed' ? 'text-red-500' :
                          run.status === 'running' ? 'text-blue-500 animate-spin' :
                          'text-amber-500'
                        }`} />
                        <div>
                          <CardTitle className="text-base">
                            {isAgentMode
                              ? `Run ${run.id.substring(0, 8)}`
                              : lead ? `${lead.first_name} ${lead.last_name}` : 'Unknown Lead'
                            }
                          </CardTitle>
                          <p className="text-sm text-muted-foreground">
                            {run.status === 'completed'
                              ? `Completado${duration ? ` en ${duration}s` : ''}`
                              : `En: ${(currentNode?.data?.label as string) || run.current_node_id || '—'}`
                            }
                            {run.waiting_for_event && ` · Esperando ${run.waiting_for_event}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={run.status === 'completed' ? 'default' : 'secondary'}>
                          {statusConfig.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {startTime.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  {/* Event log timeline for agent workflows */}
                  {isAgentMode && Array.isArray(eventLog) && eventLog.length > 0 ? (
                    <CardContent className="pt-0 pb-4">
                      <div className="border-t pt-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Steps</p>
                        <div className="flex flex-wrap gap-2">
                          {eventLog.map((evt: { node_id: string; action: string; status: string }, i: number) => {
                            const evtNode = workflow.graph_json.nodes.find(n => n.id === evt.node_id)
                            return (
                              <div key={i} className="flex items-center gap-1.5 text-xs bg-muted/50 rounded px-2 py-1">
                                {evt.status === 'success'
                                  ? <CheckCircle className="h-3 w-3 text-emerald-500" />
                                  : <XCircle className="h-3 w-3 text-red-500" />
                                }
                                <span>{(evtNode?.data?.label as string) || evt.node_id}</span>
                                <span className="text-muted-foreground">({evt.action})</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </CardContent>
                  ) : null}
                  {/* Context preview for agent workflows */}
                  {isAgentMode && context.last_task_result ? (
                    <CardContent className="pt-0 pb-4">
                      <div className="border-t pt-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Last result</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {typeof context.last_task_result === 'object'
                            ? ((context.last_task_result as Record<string, unknown>).summary as string || JSON.stringify(context.last_task_result)).substring(0, 200)
                            : String(context.last_task_result).substring(0, 200)
                          }
                        </p>
                      </div>
                    </CardContent>
                  ) : null}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
