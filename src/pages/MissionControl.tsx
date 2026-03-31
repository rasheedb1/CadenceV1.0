import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ReactFlow, Background, Position } from '@xyflow/react'
import type { Node, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { supabase } from '@/integrations/supabase/client'
import { useAgents, type AgentTask, type AgentMessage, type AgentTaskV2, type AgentCheckin } from '@/contexts/AgentContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TabsList, TabsTrigger, Tabs } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Home, Zap, MessageSquare, CheckCircle, XCircle, Clock, Bot, Filter,
  Moon, Sun, BarChart3, ListTodo, Radio, Crown, UserCog, User,
  Circle, AlertTriangle,
} from 'lucide-react'

// ── Constants ────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = { manager: '#a855f7', team_lead: '#3b82f6', worker: '#6b7280' }
const AVAILABILITY_LABELS: Record<string, string> = { available: 'disponible', working: 'trabajando', blocked: 'bloqueado', on_project: 'en proyecto', offline: 'offline' }

const TOOL_ICONS: Record<string, string> = {
  web_research: '🔍', buscar_prospectos: '🎯', investigar_empresa: '🏢', enviar_mensaje: '📨',
  enviar_email: '📧', crear_cadencia: '🔄', business_case: '💼', gestionar_leads: '👥',
  comunicar_agente: '💬', registrar_aprendizaje: '🧠', ver_metricas: '📊',
  claim_task: '📋', work_on_task: '⚡', complete_task: '✅', checkin: '📋',
}

const TASK_V2_STATUS_COLORS: Record<string, string> = {
  backlog: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  ready: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  claimed: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200',
  review: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  done: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
}

interface LiveEvent {
  id: string
  type: 'task' | 'message' | 'activity'
  agent_name: string
  agent_id: string
  content: string
  detail: string
  status?: string
  timestamp: string
}

function useInterval(ms: number) {
  const [, setTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), ms); return () => clearInterval(id) }, [ms])
}

// ── Flow View ────────────────────────────────────────────────────

function FlowView({ agents, nodes, edges, filteredEvents, expandedEvent, setExpandedEvent, timeAgo, respondToCheckin, checkins }: {
  agents: ReturnType<typeof useAgents>['agents']
  nodes: Node[]; edges: Edge[]
  filteredEvents: LiveEvent[]
  expandedEvent: string | null
  setExpandedEvent: (id: string | null) => void
  timeAgo: (ts: string) => string
  respondToCheckin: (id: string, status: 'approved' | 'rejected', feedback?: string) => Promise<void>
  checkins: AgentCheckin[]
}) {
  const pendingCheckins = checkins.filter(c => c.needs_approval && c.status === 'sent')

  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 border-r">
        <ReactFlow nodes={nodes} edges={edges} fitView panOnDrag zoomOnScroll
          proOptions={{ hideAttribution: true }} style={{ background: 'var(--background)' }}>
          <Background color="var(--border)" gap={24} size={1} />
        </ReactFlow>
      </div>

      <div className="w-[400px] flex flex-col min-h-0">
        {/* Pending check-ins */}
        {pendingCheckins.length > 0 && (
          <div className="border-b bg-amber-50/50 dark:bg-amber-950/20 px-4 py-2 shrink-0">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">⏳ Check-ins pendientes</p>
            {pendingCheckins.slice(0, 3).map(c => {
              const agent = agents.find(a => a.id === c.agent_id)
              return (
                <div key={c.id} className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium">{agent?.name || 'Agente'}: </span>
                    <span className="text-xs text-muted-foreground">{c.summary?.substring(0, 60)}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => respondToCheckin(c.id, 'rejected')}>✗</Button>
                    <Button size="sm" className="h-6 px-2 text-[10px]" onClick={() => respondToCheckin(c.id, 'approved')}>✓</Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="px-4 py-3 border-b shrink-0">
          <h2 className="font-medium text-sm flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-amber-500" />Actividad en Vivo</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Bot className="h-8 w-8 mb-2 opacity-50" /><p className="text-sm">Sin actividad aún</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredEvents.map(event => {
                const isRecent = Date.now() - new Date(event.timestamp).getTime() < 120000
                const isActivity = event.type === 'activity'
                const isTask = event.type === 'task'
                return (
                  <div key={event.id} className={`px-4 py-3 cursor-pointer transition-all ${isRecent ? 'bg-amber-50/50 dark:bg-amber-950/20' : 'hover:bg-muted/30'}`}
                    onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}>
                    <div className="flex items-start gap-2.5">
                      <div className={`mt-0.5 shrink-0 ${isActivity ? 'text-purple-500' : isTask ? (event.status === 'completed' || event.status === 'done' ? 'text-green-500' : event.status === 'failed' ? 'text-red-500' : 'text-blue-500') : 'text-amber-500'}`}>
                        {isActivity ? <Zap className="h-3.5 w-3.5" /> : isTask ? (event.status === 'completed' || event.status === 'done' ? <CheckCircle className="h-3.5 w-3.5" /> : event.status === 'failed' ? <XCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />) : <MessageSquare className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-xs">{event.agent_name}</span>
                          {event.status && <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">{event.status}</Badge>}
                          {isRecent && <span className="text-[9px] text-amber-600 font-medium">NUEVO</span>}
                        </div>
                        <p className={`text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap ${expandedEvent === event.id ? '' : 'line-clamp-2'}`}>{event.content}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(event.timestamp)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Kanban View ──────────────────────────────────────────────────

const KANBAN_COLUMNS = [
  { key: 'backlog', label: 'Backlog', icon: Circle },
  { key: 'ready', label: 'Ready', icon: Clock },
  { key: 'claimed,in_progress', label: 'En progreso', icon: Zap },
  { key: 'review', label: 'Review', icon: AlertTriangle },
  { key: 'done', label: 'Done', icon: CheckCircle },
]

function KanbanView({ tasks, agents }: { tasks: AgentTaskV2[]; agents: ReturnType<typeof useAgents>['agents'] }) {
  return (
    <div className="flex-1 overflow-x-auto p-4">
      <div className="flex gap-4 min-w-fit h-full">
        {KANBAN_COLUMNS.map(col => {
          const statuses = col.key.split(',')
          const colTasks = tasks.filter(t => statuses.includes(t.status))
          const Icon = col.icon
          return (
            <div key={col.key} className="w-72 flex flex-col min-h-0 shrink-0">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{col.label}</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">{colTasks.length}</Badge>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2">
                {colTasks.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Vacío</div>
                ) : colTasks.map(task => {
                  const agent = agents.find(a => a.id === task.assigned_agent_id)
                  return (
                    <Card key={task.id} className="shadow-sm">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <p className="text-sm font-medium line-clamp-2">{task.title}</p>
                          <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${TASK_V2_STATUS_COLORS[task.status] || ''}`}>P{task.priority}</Badge>
                        </div>
                        {task.description && <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{task.description}</p>}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {agent ? (
                              <>
                                <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${
                                  agent.tier === 'manager' ? 'bg-purple-100 text-purple-600' :
                                  agent.tier === 'team_lead' ? 'bg-blue-100 text-blue-600' :
                                  'bg-muted text-muted-foreground'
                                }`}>
                                  {agent.name[0]}
                                </div>
                                <span className="text-[10px] text-muted-foreground">{agent.name}</span>
                              </>
                            ) : <span className="text-[10px] text-muted-foreground">Sin asignar</span>}
                          </div>
                          <span className="text-[10px] text-muted-foreground">{task.task_type}</span>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Performance View ─────────────────────────────────────────────

function PerformanceView({ agents, tasksV2 }: { agents: ReturnType<typeof useAgents>['agents']; tasksV2: AgentTaskV2[] }) {
  const agentStats = useMemo(() => {
    return agents.map(a => {
      const tasks = tasksV2.filter(t => t.assigned_agent_id === a.id)
      const done = tasks.filter(t => t.status === 'done').length
      const failed = tasks.filter(t => t.status === 'failed').length
      const total = done + failed
      const tokens = tasks.reduce((acc, t) => acc + (t.tokens_used || 0), 0)
      const cost = tasks.reduce((acc, t) => acc + Number(t.cost_usd || 0), 0)
      return {
        ...a, done, failed, total, successRate: total > 0 ? Math.round((done / total) * 100) : 0,
        tokens, cost, inProgress: tasks.filter(t => t.status === 'in_progress' || t.status === 'claimed').length,
        backlog: tasks.filter(t => t.status === 'ready' || t.status === 'backlog').length,
      }
    }).sort((a, b) => b.done - a.done)
  }, [agents, tasksV2])

  const totals = useMemo(() => ({
    done: agentStats.reduce((a, s) => a + s.done, 0),
    failed: agentStats.reduce((a, s) => a + s.failed, 0),
    tokens: agentStats.reduce((a, s) => a + s.tokens, 0),
    cost: agentStats.reduce((a, s) => a + s.cost, 0),
  }), [agentStats])

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-green-600">{totals.done}</p><p className="text-xs text-muted-foreground mt-1">Completadas</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-red-600">{totals.failed}</p><p className="text-xs text-muted-foreground mt-1">Fallidas</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold">{totals.tokens.toLocaleString()}</p><p className="text-xs text-muted-foreground mt-1">Tokens totales</p></CardContent></Card>
        <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold">${totals.cost.toFixed(2)}</p><p className="text-xs text-muted-foreground mt-1">Costo total</p></CardContent></Card>
      </div>

      {/* Per-agent table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Rendimiento por agente</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Agente</th>
                  <th className="pb-2 font-medium">Modelo</th>
                  <th className="pb-2 font-medium">Equipo</th>
                  <th className="pb-2 font-medium text-center">Completadas</th>
                  <th className="pb-2 font-medium text-center">Fallidas</th>
                  <th className="pb-2 font-medium text-center">Success %</th>
                  <th className="pb-2 font-medium text-center">En progreso</th>
                  <th className="pb-2 font-medium text-right">Tokens</th>
                  <th className="pb-2 font-medium text-right">Costo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {agentStats.map(a => {
                  const TierIcon = a.tier === 'manager' ? Crown : a.tier === 'team_lead' ? UserCog : User
                  const modelBadge = (a.model || '').split('-')[1] || '?'
                  return (
                    <tr key={a.id} className="hover:bg-muted/30">
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <TierIcon className={`h-3.5 w-3.5 ${a.tier === 'manager' ? 'text-purple-500' : a.tier === 'team_lead' ? 'text-blue-500' : 'text-gray-400'}`} />
                          <span className="font-medium">{a.name}</span>
                        </div>
                      </td>
                      <td><Badge variant="secondary" className="text-[10px]">{modelBadge}</Badge></td>
                      <td className="text-muted-foreground">{a.team || '—'}</td>
                      <td className="text-center font-medium text-green-600">{a.done}</td>
                      <td className="text-center font-medium text-red-600">{a.failed}</td>
                      <td className="text-center">
                        <span className={`font-medium ${a.successRate >= 80 ? 'text-green-600' : a.successRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                          {a.successRate}%
                        </span>
                      </td>
                      <td className="text-center text-blue-600">{a.inProgress}</td>
                      <td className="text-right text-muted-foreground">{a.tokens.toLocaleString()}</td>
                      <td className="text-right text-muted-foreground">${a.cost.toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────

export function MissionControl() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { agents, getAgentTasks, getAgentMessages, tasksV2, checkins, respondToCheckin, getAgentTasksV2 } = useAgents()
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([])
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<string>('flow')

  useInterval(10000)

  // Load events
  useEffect(() => {
    if (!agents.length) return
    const orgId = agents[0]?.org_id || ''
    const seenIds = new Set<string>()

    async function loadAllEvents() {
      const events: LiveEvent[] = []
      for (const agent of agents) {
        for (const task of getAgentTasks(agent.id).slice(0, 10)) {
          const id = `task-${task.id}`
          if (seenIds.has(id)) continue; seenIds.add(id)
          events.push({ id, type: 'task', agent_name: agent.name, agent_id: agent.id,
            content: task.instruction?.substring(0, 2000) || '', detail: task.status, status: task.status,
            timestamp: task.completed_at || task.created_at })
        }
      }
      for (const agent of agents) {
        for (const msg of getAgentMessages(agent.id).slice(0, 50)) {
          const id = `msg-${msg.id}`
          if (seenIds.has(id)) continue; seenIds.add(id)
          const from = agents.find(a => a.id === msg.from_agent_id)
          const to = agents.find(a => a.id === msg.to_agent_id)
          events.push({ id, type: 'message', agent_name: from?.name || 'Chief',
            agent_id: msg.from_agent_id || '', content: typeof msg.content === 'string' ? msg.content : 'Message',
            detail: `→ ${to?.name || 'Chief'}`, timestamp: msg.created_at })
        }
      }
      const { data: actEvents } = await supabase
        .from('agent_activity_events')
        .select('agent_id, event_type, tool_name, content, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (actEvents) {
        for (const evt of actEvents) {
          const id = `evt-${evt.created_at}`
          if (seenIds.has(id)) continue; seenIds.add(id)
          const agent = agents.find(a => a.id === evt.agent_id)
          const icon = evt.tool_name ? (TOOL_ICONS[evt.tool_name] || '⚡') : '⚡'
          events.push({ id, type: 'activity', agent_name: agent?.name || 'Agent',
            agent_id: evt.agent_id, content: `${icon} ${evt.tool_name || evt.event_type}: ${evt.content?.substring(0, 500) || ''}`,
            detail: evt.event_type, status: evt.event_type === 'tool_call' ? 'in_progress' : 'completed',
            timestamp: evt.created_at })
        }
      }
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      setLiveEvents(events.slice(0, 300))
    }
    loadAllEvents()
  }, [agents, getAgentTasks, getAgentMessages])

  // Realtime
  useEffect(() => {
    const channel = supabase.channel('mc-v4')
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'agent_tasks' }, (payload) => {
      const task = payload.new as AgentTask
      if (!task?.agent_id) return
      const agent = agents.find(a => a.id === task.agent_id)
      setLiveEvents(prev => [{ id: `task-${task.id}-${Date.now()}`, type: 'task' as const, agent_name: agent?.name || 'Agent',
        agent_id: task.agent_id, content: task.instruction?.substring(0, 2000) || '', detail: task.status,
        status: task.status, timestamp: task.completed_at || task.created_at }, ...prev].slice(0, 50))
    })
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_messages' }, (payload) => {
      const msg = payload.new as AgentMessage
      const from = agents.find(a => a.id === msg.from_agent_id)
      const to = agents.find(a => a.id === msg.to_agent_id)
      setLiveEvents(prev => [{ id: `msg-${msg.id}-${Date.now()}`, type: 'message' as const, agent_name: from?.name || 'Chief',
        agent_id: msg.from_agent_id || '', content: typeof msg.content === 'string' ? msg.content.substring(0, 2000) : 'Message',
        detail: `→ ${to?.name || 'Chief'}`, timestamp: msg.created_at }, ...prev].slice(0, 50))
    })
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_activity_events' }, (payload) => {
      const evt = payload.new as { agent_id: string; event_type: string; tool_name: string; content: string; created_at: string }
      const agent = agents.find(a => a.id === evt.agent_id)
      const icon = evt.tool_name ? (TOOL_ICONS[evt.tool_name] || '⚡') : '⚡'
      setLiveEvents(prev => [{ id: `evt-${Date.now()}`, type: 'activity' as const, agent_name: agent?.name || 'Agent',
        agent_id: evt.agent_id, content: `${icon} ${evt.tool_name || evt.event_type}: ${evt.content?.substring(0, 300) || ''}`,
        detail: evt.event_type, status: evt.event_type === 'tool_call' ? 'in_progress' : 'completed',
        timestamp: evt.created_at }, ...prev].slice(0, 50))
    })
    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [agents])

  // Build flow nodes with hierarchy
  const { nodes, edges } = useMemo(() => {
    const activeAgents = agents.filter(a => a.status !== 'destroyed')
    const centerX = 350, centerY = 220, radius = 200

    const flowNodes: Node[] = [{
      id: 'chief', position: { x: centerX, y: centerY },
      data: { label: '⚡ Chief\nOrquestador' },
      style: {
        background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: 'white',
        border: 'none', borderRadius: '16px', padding: '14px 24px',
        fontSize: '13px', fontWeight: 600, textAlign: 'center' as const, whiteSpace: 'pre-line' as const,
        boxShadow: '0 4px 20px rgba(99, 102, 241, 0.35)',
      },
      sourcePosition: Position.Bottom, targetPosition: Position.Top,
    }]

    activeAgents.forEach((agent, i) => {
      const angle = (2 * Math.PI * i) / activeAgents.length - Math.PI / 2
      const tierColor = TIER_COLORS[agent.tier] || '#6b7280'
      const isWorking = agent.availability === 'working'
      const isBlocked = agent.availability === 'blocked'
      const modelBadge = (agent.model || '').split('-')[1] || ''
      const tierIcon = agent.tier === 'manager' ? '👑' : agent.tier === 'team_lead' ? '⭐' : ''
      const availIcon = isWorking ? '🔵' : isBlocked ? '🔴' : '🟢'

      const v2Tasks = getAgentTasksV2(agent.id)
      const activeTask = v2Tasks.find(t => t.status === 'in_progress' || t.status === 'claimed')
      const taskPreview = activeTask ? `📋 ${activeTask.title.substring(0, 35)}…` : ''

      const label = `${tierIcon}${agent.name}\n${agent.role} · ${modelBadge}\n${availIcon} ${AVAILABILITY_LABELS[agent.availability] || agent.availability}${agent.team ? ` · ${agent.team}` : ''}${taskPreview ? `\n${taskPreview}` : ''}`

      flowNodes.push({
        id: agent.id, position: { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) },
        data: { label },
        style: {
          background: `${tierColor}10`, border: `2px solid ${tierColor}`,
          borderRadius: '14px', padding: '12px 18px', fontSize: '11px', fontWeight: 500,
          textAlign: 'center' as const, whiteSpace: 'pre-line' as const,
          boxShadow: isWorking ? `0 0 20px ${tierColor}40` : `0 2px 8px ${tierColor}10`,
        },
        sourcePosition: Position.Top, targetPosition: Position.Bottom,
      })
    })

    const flowEdges: Edge[] = []
    // Hierarchy edges (parent → child)
    activeAgents.forEach(agent => {
      const parent = agent.parent_agent_id && activeAgents.find(a => a.id === agent.parent_agent_id)
      const source = parent ? parent.id : 'chief'
      const isWorking = agent.availability === 'working'
      flowEdges.push({
        id: `hier-${source}-${agent.id}`, source, target: agent.id,
        animated: isWorking,
        style: { stroke: isWorking ? TIER_COLORS[agent.tier] || '#6366f1' : `${TIER_COLORS[agent.tier] || '#6366f1'}30`, strokeWidth: isWorking ? 2.5 : 1.5 },
      })
    })

    return { nodes: flowNodes, edges: flowEdges }
  }, [agents, getAgentTasksV2])

  const roles = useMemo(() => Array.from(new Set(agents.filter(a => a.status !== 'destroyed').map(a => a.role))).sort(), [agents])
  const filteredAgentIds = useMemo(() => roleFilter === 'all' ? new Set(agents.map(a => a.id)) : new Set(agents.filter(a => a.role === roleFilter).map(a => a.id)), [agents, roleFilter])
  const filteredEvents = useMemo(() => roleFilter === 'all' ? liveEvents : liveEvents.filter(e => filteredAgentIds.has(e.agent_id)), [liveEvents, roleFilter, filteredAgentIds])

  // Stats
  const v2Done = tasksV2.filter(t => t.status === 'done').length
  const v2Failed = tasksV2.filter(t => t.status === 'failed').length
  const v2InProgress = tasksV2.filter(t => t.status === 'in_progress' || t.status === 'claimed').length
  const v2Ready = tasksV2.filter(t => t.status === 'ready' || t.status === 'backlog').length
  const pendingCheckins = checkins.filter(c => c.needs_approval && c.status === 'sent').length

  const timeAgo = useCallback((ts: string) => {
    const diff = Date.now() - new Date(ts).getTime()
    if (diff < 60000) return `${Math.floor(diff / 1000)}s`
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    return `${Math.floor(diff / 86400000)}d`
  }, [])

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="border-b bg-background/95 backdrop-blur shrink-0">
        <div className="px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}><Home className="h-4 w-4" /></Button>
            <h1 className="font-heading font-semibold text-lg">Control de Misión</h1>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />EN VIVO
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="h-8">
                <TabsTrigger value="flow" className="h-6 px-2.5 text-xs"><Radio className="h-3 w-3 mr-1" />Flow</TabsTrigger>
                <TabsTrigger value="kanban" className="h-6 px-2.5 text-xs"><ListTodo className="h-3 w-3 mr-1" />Kanban</TabsTrigger>
                <TabsTrigger value="performance" className="h-6 px-2.5 text-xs"><BarChart3 className="h-3 w-3 mr-1" />Rendimiento</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los roles</SelectItem>
                {roles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <button onClick={toggleTheme} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition-colors">
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <span className="text-xs text-muted-foreground">{agents.filter(a => a.status === 'active').length} activos</span>
          </div>
        </div>
      </header>

      {/* Stats bar */}
      <div className="border-b px-6 py-2 flex items-center gap-6 shrink-0 bg-muted/30">
        <div className="flex items-center gap-1.5 text-sm"><CheckCircle className="h-3.5 w-3.5 text-green-500" /><span className="font-medium">{v2Done}</span><span className="text-muted-foreground">completadas</span></div>
        <div className="flex items-center gap-1.5 text-sm"><Zap className="h-3.5 w-3.5 text-blue-500" /><span className="font-medium">{v2InProgress}</span><span className="text-muted-foreground">en progreso</span></div>
        <div className="flex items-center gap-1.5 text-sm"><Clock className="h-3.5 w-3.5 text-yellow-500" /><span className="font-medium">{v2Ready}</span><span className="text-muted-foreground">pendientes</span></div>
        <div className="flex items-center gap-1.5 text-sm"><XCircle className="h-3.5 w-3.5 text-red-500" /><span className="font-medium">{v2Failed}</span><span className="text-muted-foreground">fallidas</span></div>
        {pendingCheckins > 0 && (
          <div className="flex items-center gap-1.5 text-sm"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /><span className="font-medium text-amber-600">{pendingCheckins}</span><span className="text-muted-foreground">check-ins</span></div>
        )}
        <div className="flex items-center gap-1.5 text-sm ml-auto"><Bot className="h-3.5 w-3.5" /><span className="text-muted-foreground">{agents.filter(a => a.availability === 'working').length} trabajando, {agents.filter(a => a.availability === 'available').length} libres</span></div>
      </div>

      {/* Content */}
      {activeTab === 'flow' && (
        <FlowView agents={agents} nodes={nodes} edges={edges}
          filteredEvents={filteredEvents} expandedEvent={expandedEvent}
          setExpandedEvent={setExpandedEvent} timeAgo={timeAgo}
          respondToCheckin={respondToCheckin} checkins={checkins} />
      )}
      {activeTab === 'kanban' && <KanbanView tasks={tasksV2} agents={agents} />}
      {activeTab === 'performance' && <PerformanceView agents={agents} tasksV2={tasksV2} />}
    </div>
  )
}
