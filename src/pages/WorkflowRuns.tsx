import { useParams, useNavigate } from 'react-router-dom'
import { useWorkflow } from '@/contexts/WorkflowContext'
import { useCadence } from '@/contexts/CadenceContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft } from 'lucide-react'
import { WORKFLOW_RUN_STATUS_CONFIG } from '@/types/workflow'

export function WorkflowRuns() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { workflows, getWorkflowRuns } = useWorkflow()
  const { leads } = useCadence()

  const workflow = workflows.find((w) => w.id === id)
  const runs = id ? getWorkflowRuns(id) : []

  if (!workflow) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Workflow not found</p>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <Button variant="ghost" className="mb-4" onClick={() => navigate(`/workflows/${id}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Builder
        </Button>
        <h1 className="text-[28px] font-bold tracking-tight font-heading">{workflow.name} — Runs</h1>
        <p className="text-muted-foreground">
          {runs.length} lead{runs.length !== 1 ? 's' : ''} enrolled
        </p>
      </div>

      {runs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No leads enrolled in this workflow yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => {
            const lead = leads.find((l) => l.id === run.lead_id)
            const statusConfig = WORKFLOW_RUN_STATUS_CONFIG[run.status]
            const currentNode = workflow.graph_json.nodes.find(
              (n) => n.id === run.current_node_id
            )

            return (
              <Card key={run.id}>
                <CardHeader className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {lead ? `${lead.first_name} ${lead.last_name}` : 'Unknown Lead'}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Current: {(currentNode?.data?.label as string) || run.current_node_id || 'Completed'}
                        {run.waiting_for_event && ` (waiting for ${run.waiting_for_event})`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={run.status === 'completed' ? 'default' : 'secondary'}>
                        {statusConfig.label}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {new Date(run.started_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
