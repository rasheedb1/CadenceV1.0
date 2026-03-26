import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAgents, type AgentTask } from '@/contexts/AgentContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Bot, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  deploying: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  paused: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

export function AgentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { agents, updateAgent, getAgentTasks } = useAgents()
  const agent = agents.find(a => a.id === id)
  const tasks = id ? getAgentTasks(id) : []

  const [editingSoulMd, setEditingSoulMd] = useState(false)
  const [soulMd, setSoulMd] = useState('')
  const [saving, setSaving] = useState(false)

  if (!agent) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-medium mb-2">Agent not found</h2>
          <Button variant="outline" onClick={() => navigate('/agents')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Agents
          </Button>
        </div>
      </div>
    )
  }

  const handleSaveSoulMd = async () => {
    setSaving(true)
    try {
      await updateAgent(agent.id, { soul_md: soulMd } as never)
      setEditingSoulMd(false)
      toast.success('Agent configuration saved')
    } catch {
      toast.error('Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/agents')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-[28px] font-bold tracking-tight font-heading">{agent.name}</h1>
            <Badge variant="outline">{agent.role}</Badge>
            <Badge className={STATUS_COLORS[agent.status]}>{agent.status}</Badge>
          </div>
          {agent.description && (
            <p className="text-muted-foreground mt-1">{agent.description}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className={STATUS_COLORS[agent.status]}>{agent.status}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Role</span>
                  <span>{agent.role}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{new Date(agent.created_at).toLocaleDateString()}</span>
                </div>
                {agent.railway_url && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Railway URL</span>
                    <span className="text-xs truncate max-w-[200px]">{agent.railway_url}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Skills ({agent.agent_skills?.length || 0})</CardTitle>
              </CardHeader>
              <CardContent>
                {agent.agent_skills?.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {agent.agent_skills.map(skill => (
                      <Badge key={skill.id} variant="secondary" className="text-xs">
                        {skill.skill_name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No skills assigned</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Soul MD Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Personality (SOUL.md)</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-[300px] whitespace-pre-wrap">
                {agent.soul_md}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="mt-4">
          {tasks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground text-sm">No tasks yet. Delegate tasks via WhatsApp or the dashboard.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {tasks.map((task: AgentTask) => (
                <Card key={task.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{task.instruction}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={TASK_STATUS_COLORS[task.status] || ''} variant="secondary">
                            {task.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {task.delegated_by} &middot; {new Date(task.created_at).toLocaleString()}
                          </span>
                        </div>
                        {task.result && (
                          <pre className="text-xs bg-muted p-2 rounded mt-2 max-h-[100px] overflow-auto whitespace-pre-wrap">
                            {typeof task.result === 'string' ? task.result : JSON.stringify(task.result, null, 2)}
                          </pre>
                        )}
                        {task.error && (
                          <p className="text-xs text-destructive mt-1">{task.error}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Config Tab */}
        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Agent Personality (SOUL.md)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {editingSoulMd ? (
                <>
                  <Textarea
                    value={soulMd}
                    onChange={e => setSoulMd(e.target.value)}
                    rows={20}
                    className="font-mono text-xs"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleSaveSoulMd} disabled={saving}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Save
                    </Button>
                    <Button variant="outline" onClick={() => setEditingSoulMd(false)}>Cancel</Button>
                  </div>
                </>
              ) : (
                <>
                  <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-[400px] whitespace-pre-wrap">
                    {agent.soul_md}
                  </pre>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSoulMd(agent.soul_md)
                      setEditingSoulMd(true)
                    }}
                  >
                    Edit Personality
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
