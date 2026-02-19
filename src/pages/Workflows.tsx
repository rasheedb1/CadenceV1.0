import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkflow } from '@/contexts/WorkflowContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Plus, GitBranch, MoreVertical, Pencil, Trash2, Play, Pause } from 'lucide-react'
import { PermissionGate } from '@/components/PermissionGate'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { WORKFLOW_STATUS_CONFIG } from '@/types/workflow'

export function Workflows() {
  const navigate = useNavigate()
  const { workflows, isLoading, createWorkflow, deleteWorkflow, activateWorkflow, pauseWorkflow } = useWorkflow()
  const [newWorkflowName, setNewWorkflowName] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!newWorkflowName.trim()) return
    setCreating(true)
    try {
      const workflow = await createWorkflow(newWorkflowName)
      setIsCreateOpen(false)
      setNewWorkflowName('')
      if (workflow) {
        navigate(`/workflows/${workflow.id}`)
      }
    } catch (error) {
      console.error('Failed to create workflow:', error)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this workflow?')) {
      await deleteWorkflow(id)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight font-heading">Workflows</h1>
          <p className="text-muted-foreground">Build conditional LinkedIn automation flows</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <PermissionGate permission="workflows_create">
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Workflow
              </Button>
            </DialogTrigger>
          </PermissionGate>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Workflow</DialogTitle>
              <DialogDescription>
                Give your workflow a name to get started
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="workflow-name">Workflow Name</Label>
                <Input
                  id="workflow-name"
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  placeholder="e.g., Connection + Follow-up Flow"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating || !newWorkflowName.trim()}>
                {creating ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {workflows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GitBranch className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-medium">No workflows yet</h3>
            <p className="mb-4 text-sm text-muted-foreground text-center max-w-md">
              Create your first workflow to build conditional LinkedIn automation flows with branching logic
            </p>
            <PermissionGate permission="workflows_create">
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Workflow
              </Button>
            </PermissionGate>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workflows.map((workflow) => {
            const nodeCount = workflow.graph_json?.nodes?.length || 0
            const statusConfig = WORKFLOW_STATUS_CONFIG[workflow.status]
            return (
              <Card
                key={workflow.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/workflows/${workflow.id}`)}
              >
                <CardHeader className="flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{workflow.name}</CardTitle>
                    <CardDescription>
                      {nodeCount} node{nodeCount !== 1 ? 's' : ''}
                      {workflow.description ? ` — ${workflow.description}` : ''}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/workflows/${workflow.id}`)
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      {workflow.status === 'draft' || workflow.status === 'paused' ? (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            activateWorkflow(workflow.id)
                          }}
                        >
                          <Play className="mr-2 h-4 w-4" />
                          Activate
                        </DropdownMenuItem>
                      ) : workflow.status === 'active' ? (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            pauseWorkflow(workflow.id)
                          }}
                        >
                          <Pause className="mr-2 h-4 w-4" />
                          Pause
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(workflow.id)
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <Badge variant={workflow.status === 'active' ? 'default' : 'secondary'}>
                      {statusConfig.label}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {new Date(workflow.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
