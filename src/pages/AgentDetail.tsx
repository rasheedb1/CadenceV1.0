import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { useAgents, type AgentTask, type AgentLearning, type AgentMessage, type AgentTaskV2, type AgentCheckin } from '@/contexts/AgentContext'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ArrowLeft, Bot, Save, Loader2, Trash2, Brain, MessageSquare, Clock, Activity,
  Home, Moon, Sun, Cpu, Crown, UserCog, User, BarChart3, ListTodo, Settings,
  CheckCircle, XCircle, Circle, Zap, ChevronRight, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { AgentSkillsPanel } from '@/components/agents/AgentSkillsPanel'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  deploying: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  paused: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700', in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700', failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
  backlog: 'bg-gray-100 text-gray-600', ready: 'bg-yellow-100 text-yellow-700',
  claimed: 'bg-blue-100 text-blue-600', review: 'bg-purple-100 text-purple-700',
  done: 'bg-green-100 text-green-700',
}

const MODEL_OPTIONS = [
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6', badge: 'Opus', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', badge: 'Sonnet', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', badge: 'Haiku', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300' },
]

const CAPABILITY_OPTIONS = [
  { value: 'code', label: 'Programar' }, { value: 'research', label: 'Investigar' },
  { value: 'design', label: 'Diseño UX/UI' }, { value: 'outreach', label: 'Outreach / Ventas' },
  { value: 'data', label: 'Análisis de datos' }, { value: 'ops', label: 'Operaciones' },
  { value: 'writing', label: 'Redacción' }, { value: 'strategy', label: 'Estrategia' },
]

function getModelBadge(model: string) {
  return MODEL_OPTIONS.find(m => m.value === model) || { badge: model?.split('-')[1] || 'LLM', color: 'bg-gray-100 text-gray-700' }
}

export function AgentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const {
    agents, updateAgent, getAgentTasks, getAgentTasksV2,
    getAgentLearnings, deleteAgentLearning, getAgentMessages, getAgentCheckins,
    getTeamMembers, respondToCheckin,
  } = useAgents()

  const agent = agents.find(a => a.id === id)
  const tasks = id ? getAgentTasks(id) : []
  const tasksV2 = id ? getAgentTasksV2(id) : []
  const learnings = id ? getAgentLearnings(id) : []
  const messages = id ? getAgentMessages(id) : []
  const checkins = id ? getAgentCheckins(id) : []
  const teamMembers = id ? getTeamMembers(id) : []
  const parentAgent = agent?.parent_agent_id ? agents.find(a => a.id === agent.parent_agent_id) : null

  const [editingSoulMd, setEditingSoulMd] = useState(false)
  const [soulMd, setSoulMd] = useState('')
  const [saving, setSaving] = useState(false)
  // savingSkills removed — handled inside AgentSkillsPanel

  // Config edit state
  const [editingConfig, setEditingConfig] = useState(false)
  const [configModel, setConfigModel] = useState(agent?.model || 'claude-sonnet-4-6')
  const [configTemp, setConfigTemp] = useState(agent?.temperature || 0.7)
  const [configMaxTokens, setConfigMaxTokens] = useState(agent?.max_tokens || 4096)
  const [configCapabilities, setConfigCapabilities] = useState<string[]>(agent?.capabilities || [])

  if (!agent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-medium mb-2">Agente no encontrado</h2>
          <Button variant="outline" onClick={() => navigate('/agents')}><ArrowLeft className="mr-2 h-4 w-4" />Volver a Agentes</Button>
        </div>
      </div>
    )
  }

  // agentSkillNames removed — handled inside AgentSkillsPanel
  const modelInfo = getModelBadge(agent.model)
  const TierIcon = agent.tier === 'manager' ? Crown : agent.tier === 'team_lead' ? UserCog : User

  const handleSaveSoulMd = async () => {
    setSaving(true)
    try {
      await updateAgent(agent.id, { soul_md: soulMd } as never)
      setEditingSoulMd(false)
      toast.success('Personalidad guardada')
    } catch { toast.error('Error al guardar') } finally { setSaving(false) }
  }

  const handleSaveConfig = async () => {
    setSaving(true)
    try {
      await updateAgent(agent.id, {
        model: configModel, temperature: configTemp,
        max_tokens: configMaxTokens, capabilities: configCapabilities,
      } as never)
      setEditingConfig(false)
      toast.success('Configuración guardada')
    } catch { toast.error('Error al guardar') } finally { setSaving(false) }
  }

  // handleToggleSkill removed — handled inside AgentSkillsPanel

  const handleRespondCheckin = async (checkinId: string, status: 'approved' | 'rejected') => {
    try {
      await respondToCheckin(checkinId, status)
      toast.success(status === 'approved' ? 'Check-in aprobado' : 'Check-in rechazado')
    } catch { toast.error('Error') }
  }

  // skillsByCategory removed — handled inside AgentSkillsPanel

  const learningsByCategory = learnings.reduce((acc, l) => { if (!acc[l.category]) acc[l.category] = []; acc[l.category].push(l); return acc }, {} as Record<string, AgentLearning[]>)

  // Stats
  const completedTasks = tasksV2.filter(t => t.status === 'done').length
  const failedTasks = tasksV2.filter(t => t.status === 'failed').length
  const inProgressTasks = tasksV2.filter(t => t.status === 'in_progress' || t.status === 'claimed').length
  const totalTokens = tasksV2.reduce((acc, t) => acc + (t.tokens_used || 0), 0)

  return (
    <div className="min-h-screen bg-background">
      {/* App Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent transition-colors" title="Inicio">
              <Home className="h-4 w-4" />
            </button>
            <button onClick={() => navigate('/agents')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Bot className="h-4 w-4" /> Agentes
            </button>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-semibold text-sm">{agent.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition-colors">
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <span className="text-sm text-muted-foreground">{user?.email}</span>
          </div>
        </div>
      </header>

      <motion.div className="max-w-7xl mx-auto p-8" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {/* Agent Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
            agent.tier === 'manager' ? 'bg-purple-100 dark:bg-purple-900' :
            agent.tier === 'team_lead' ? 'bg-blue-100 dark:bg-blue-900' : 'bg-muted'
          }`}>
            <TierIcon className={`h-7 w-7 ${
              agent.tier === 'manager' ? 'text-purple-600' :
              agent.tier === 'team_lead' ? 'text-blue-600' : 'text-muted-foreground'
            }`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-[28px] font-bold tracking-tight font-heading">{agent.name}</h1>
              <Badge className={modelInfo.color}>{modelInfo.badge}</Badge>
              <Badge className={STATUS_COLORS[agent.status]}>{agent.status}</Badge>
              {agent.team && <Badge variant="outline">{agent.team}</Badge>}
            </div>
            <p className="text-muted-foreground mt-0.5">{agent.description || agent.role}</p>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview"><Cpu className="h-3.5 w-3.5 mr-1.5" />General</TabsTrigger>
            <TabsTrigger value="workload"><ListTodo className="h-3.5 w-3.5 mr-1.5" />Workload ({inProgressTasks + tasksV2.filter(t => t.status === 'ready' || t.status === 'backlog').length})</TabsTrigger>
            <TabsTrigger value="performance"><BarChart3 className="h-3.5 w-3.5 mr-1.5" />Rendimiento</TabsTrigger>
            <TabsTrigger value="skills"><Sparkles className="h-3.5 w-3.5 mr-1" />Skills & Integraciones</TabsTrigger>
            <TabsTrigger value="learnings">Aprendizajes ({learnings.length})</TabsTrigger>
            <TabsTrigger value="messages">Mensajes ({messages.length})</TabsTrigger>
            <TabsTrigger value="config"><Settings className="h-3.5 w-3.5 mr-1.5" />Config</TabsTrigger>
          </TabsList>

          {/* ── Overview ─────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            {/* Active Task Banner */}
            {tasks.filter(t => t.status === 'in_progress').map(activeTask => (
              <Card key={activeTask.id} className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30">
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-3">
                    <Activity className="h-5 w-5 text-blue-500 animate-pulse mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Trabajando en tarea</span>
                        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-[10px]">
                          <Clock className="h-2.5 w-2.5 mr-1" />
                          {activeTask.started_at ? `${Math.round((Date.now() - new Date(activeTask.started_at).getTime()) / 1000)}s` : '...'}
                        </Badge>
                      </div>
                      <p className="text-sm">{activeTask.instruction}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Pending Check-ins */}
            {checkins.filter(c => c.needs_approval && c.status === 'sent').map(checkin => (
              <Card key={checkin.id} className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30">
                <CardContent className="py-4 px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-1">Check-in pendiente</p>
                      <p className="text-sm">{checkin.summary}</p>
                      {checkin.next_steps && <p className="text-xs text-muted-foreground mt-1">Siguiente: {checkin.next_steps}</p>}
                      {checkin.blockers && <p className="text-xs text-red-600 mt-1">Bloqueado: {checkin.blockers}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => handleRespondCheckin(checkin.id, 'rejected')}>Rechazar</Button>
                      <Button size="sm" onClick={() => handleRespondCheckin(checkin.id, 'approved')}>Aprobar</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            <div className="grid gap-4 md:grid-cols-3">
              {/* Details */}
              <Card>
                <CardHeader><CardTitle className="text-sm font-medium">Detalles</CardTitle></CardHeader>
                <CardContent className="space-y-2.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Estado</span><Badge className={STATUS_COLORS[agent.status]}>{agent.status}</Badge></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Modelo</span><Badge className={modelInfo.color}>{modelInfo.badge}</Badge></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Nivel</span><span>{agent.tier}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Equipo</span><span>{agent.team || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Temperatura</span><span>{agent.temperature}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Creado</span><span>{new Date(agent.created_at).toLocaleDateString()}</span></div>
                </CardContent>
              </Card>

              {/* Hierarchy */}
              <Card>
                <CardHeader><CardTitle className="text-sm font-medium">Jerarquía</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">Reporta a</span>
                    {parentAgent ? (
                      <button className="flex items-center gap-2 mt-1 hover:bg-muted/50 rounded p-1 -ml-1 w-full text-left" onClick={() => navigate(`/agents/${parentAgent.id}`)}>
                        <Crown className="h-3.5 w-3.5 text-purple-500" />
                        <span className="text-sm font-medium">{parentAgent.name}</span>
                      </button>
                    ) : <p className="text-sm mt-1 text-muted-foreground">Chief (directo)</p>}
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Reportes directos ({teamMembers.length})</span>
                    {teamMembers.length > 0 ? teamMembers.map(m => (
                      <button key={m.id} className="flex items-center gap-2 mt-1 hover:bg-muted/50 rounded p-1 -ml-1 w-full text-left" onClick={() => navigate(`/agents/${m.id}`)}>
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">{m.name}</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">{m.role}</Badge>
                      </button>
                    )) : <p className="text-sm mt-1 text-muted-foreground">Ninguno</p>}
                  </div>
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card>
                <CardHeader><CardTitle className="text-sm font-medium">Métricas rápidas</CardTitle></CardHeader>
                <CardContent className="space-y-2.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Tareas completadas</span><span className="font-semibold text-green-600">{completedTasks}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tareas fallidas</span><span className="font-semibold text-red-600">{failedTasks}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">En progreso</span><span className="font-semibold text-blue-600">{inProgressTasks}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tokens usados</span><span>{totalTokens.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Skills</span><span>{agent.agent_skills?.length || 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Capabilities</span><span>{agent.capabilities?.length || 0}</span></div>
                </CardContent>
              </Card>
            </div>

            {/* Capabilities */}
            {agent.capabilities?.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm font-medium">Capacidades</CardTitle></CardHeader>
                <CardContent><div className="flex gap-2 flex-wrap">{agent.capabilities.map(c => <Badge key={c} variant="secondary">{c}</Badge>)}</div></CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Workload ─────────────────────────────────────── */}
          <TabsContent value="workload" className="mt-4">
            {tasksV2.length === 0 && tasks.length === 0 ? (
              <Card><CardContent className="flex flex-col items-center justify-center py-12"><ListTodo className="h-8 w-8 text-muted-foreground mb-2" /><p className="text-muted-foreground text-sm">Sin tareas asignadas</p></CardContent></Card>
            ) : (
              <div className="space-y-2">
                {/* v2 tasks first */}
                {tasksV2.map((task: AgentTaskV2) => (
                  <Card key={task.id}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 shrink-0">
                          {task.status === 'done' ? <CheckCircle className="h-4 w-4 text-green-500" /> :
                           task.status === 'failed' ? <XCircle className="h-4 w-4 text-red-500" /> :
                           task.status === 'in_progress' || task.status === 'claimed' ? <Zap className="h-4 w-4 text-blue-500" /> :
                           <Circle className="h-4 w-4 text-gray-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium">{task.title}</p>
                            <Badge className={`text-[10px] ${TASK_STATUS_COLORS[task.status] || ''}`}>{task.status}</Badge>
                            <Badge variant="outline" className="text-[10px]">P{task.priority}</Badge>
                          </div>
                          {task.description && <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>}
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{task.task_type}</span>
                            {task.tokens_used > 0 && <span>{task.tokens_used.toLocaleString()} tokens</span>}
                            {task.completed_at && <span>Completada {new Date(task.completed_at).toLocaleString()}</span>}
                          </div>
                          {task.error && <p className="text-xs text-destructive mt-1">{task.error}</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {/* Legacy tasks */}
                {tasks.map((task: AgentTask) => (
                  <Card key={task.id}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 shrink-0">
                          {task.status === 'completed' ? <CheckCircle className="h-4 w-4 text-green-500" /> :
                           task.status === 'failed' ? <XCircle className="h-4 w-4 text-red-500" /> :
                           task.status === 'in_progress' ? <Zap className="h-4 w-4 text-blue-500" /> :
                           <Circle className="h-4 w-4 text-gray-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{task.instruction}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={`text-[10px] ${TASK_STATUS_COLORS[task.status] || ''}`}>{task.status}</Badge>
                            <span className="text-xs text-muted-foreground">{task.delegated_by} &middot; {new Date(task.created_at).toLocaleString()}</span>
                          </div>
                          {task.error && <p className="text-xs text-destructive mt-1">{task.error}</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Performance ──────────────────────────────────── */}
          <TabsContent value="performance" className="mt-4">
            <div className="grid gap-4 md:grid-cols-4 mb-4">
              <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-green-600">{completedTasks}</p><p className="text-xs text-muted-foreground mt-1">Completadas</p></CardContent></Card>
              <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-red-600">{failedTasks}</p><p className="text-xs text-muted-foreground mt-1">Fallidas</p></CardContent></Card>
              <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold">{completedTasks + failedTasks > 0 ? Math.round((completedTasks / (completedTasks + failedTasks)) * 100) : 0}%</p><p className="text-xs text-muted-foreground mt-1">Success Rate</p></CardContent></Card>
              <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold">{totalTokens.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Tokens usados</p></CardContent></Card>
            </div>

            {/* Check-in history */}
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Historial de Check-ins ({checkins.length})</CardTitle></CardHeader>
              <CardContent>
                {checkins.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin check-ins aún</p>
                ) : (
                  <div className="space-y-3">
                    {checkins.slice(0, 10).map((c: AgentCheckin) => (
                      <div key={c.id} className="flex items-start gap-3 text-sm">
                        <Badge variant={c.status === 'approved' ? 'default' : c.status === 'rejected' ? 'destructive' : 'secondary'} className="text-[10px] mt-0.5">{c.status}</Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{c.summary}</p>
                          {c.feedback && <p className="text-xs text-muted-foreground mt-0.5">Feedback: {c.feedback}</p>}
                          <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Skills ───────────────────────────────────────── */}
          <TabsContent value="skills" className="mt-4">
            <AgentSkillsPanel
              agent={{ id: agent.id, org_id: agent.org_id, capabilities: agent.capabilities || [], soul_md: agent.soul_md || '', model: agent.model }}
              onUpdate={async (updates) => { await updateAgent(agent.id, updates as never) }}
            />
          </TabsContent>

          {/* ── Learnings ────────────────────────────────────── */}
          <TabsContent value="learnings" className="mt-4">
            {learnings.length === 0 ? (
              <Card><CardContent className="flex flex-col items-center justify-center py-12"><Brain className="h-8 w-8 text-muted-foreground mb-2" /><p className="text-muted-foreground text-sm">Sin aprendizajes aún</p></CardContent></Card>
            ) : (
              <div className="space-y-4">
                {Object.entries(learningsByCategory).map(([category, items]) => (
                  <Card key={category}>
                    <CardHeader><CardTitle className="text-sm font-medium uppercase">{category} ({items.length})</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {items.map((l: AgentLearning) => (
                        <div key={l.id} className="flex items-start gap-2 group">
                          <p className="text-sm flex-1">{l.learning}</p>
                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0" onClick={() => deleteAgentLearning(l.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Messages ─────────────────────────────────────── */}
          <TabsContent value="messages" className="mt-4">
            {messages.length === 0 ? (
              <Card><CardContent className="flex flex-col items-center justify-center py-12"><MessageSquare className="h-8 w-8 text-muted-foreground mb-2" /><p className="text-muted-foreground text-sm">Sin mensajes aún</p></CardContent></Card>
            ) : (
              <div className="space-y-2">
                {messages.map((msg: AgentMessage) => (
                  <Card key={msg.id}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={msg.role === 'user' ? 'default' : 'secondary'} className="text-xs">{msg.role}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {msg.from_agent_id ? agents.find(a => a.id === msg.from_agent_id)?.name || 'Agent' : 'Chief'}
                          {msg.to_agent_id ? ` → ${agents.find(a => a.id === msg.to_agent_id)?.name || 'Agent'}` : ''}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">{new Date(msg.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Config ───────────────────────────────────────── */}
          <TabsContent value="config" className="mt-4 space-y-4">
            {/* Model & LLM Config */}
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Configuración LLM</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {editingConfig ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Modelo</Label>
                        <Select value={configModel} onValueChange={setConfigModel}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{MODEL_OPTIONS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Temperatura: {configTemp}</Label>
                        <Slider value={[configTemp]} onValueChange={v => setConfigTemp(v[0])} min={0} max={1} step={0.1} className="mt-2" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Max Tokens</Label>
                      <Input type="number" value={configMaxTokens} onChange={e => setConfigMaxTokens(parseInt(e.target.value) || 4096)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Capacidades</Label>
                      <div className="flex flex-wrap gap-2">
                        {CAPABILITY_OPTIONS.map(cap => (
                          <label key={cap.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <Checkbox checked={configCapabilities.includes(cap.value)} onCheckedChange={() => setConfigCapabilities(prev => prev.includes(cap.value) ? prev.filter(c => c !== cap.value) : [...prev, cap.value])} />
                            {cap.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSaveConfig} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Guardar</Button>
                      <Button variant="outline" onClick={() => setEditingConfig(false)}>Cancelar</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-muted-foreground">Modelo:</span> <Badge className={modelInfo.color}>{modelInfo.badge}</Badge></div>
                      <div><span className="text-muted-foreground">Temperatura:</span> {agent.temperature}</div>
                      <div><span className="text-muted-foreground">Max Tokens:</span> {agent.max_tokens}</div>
                      <div><span className="text-muted-foreground">Capabilities:</span> {agent.capabilities?.join(', ') || '—'}</div>
                    </div>
                    <Button variant="outline" onClick={() => { setConfigModel(agent.model); setConfigTemp(agent.temperature); setConfigMaxTokens(agent.max_tokens); setConfigCapabilities(agent.capabilities || []); setEditingConfig(true) }}>Editar Config</Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Soul.md */}
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Personalidad (SOUL.md)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {editingSoulMd ? (
                  <>
                    <Textarea value={soulMd} onChange={e => setSoulMd(e.target.value)} rows={16} className="font-mono text-xs" />
                    <div className="flex gap-2">
                      <Button onClick={handleSaveSoulMd} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Guardar</Button>
                      <Button variant="outline" onClick={() => setEditingSoulMd(false)}>Cancelar</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-[300px] whitespace-pre-wrap">{agent.soul_md}</pre>
                    <Button variant="outline" onClick={() => { setSoulMd(agent.soul_md); setEditingSoulMd(true) }}>Editar Personalidad</Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  )
}
