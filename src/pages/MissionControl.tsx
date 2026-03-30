import { useState, useEffect, useCallback, useMemo } from 'react'
import { PageTransition } from '@/components/PageTransition'
import { useNavigate } from 'react-router-dom'
import { ReactFlow, Background, Position } from '@xyflow/react'
import type { Node, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { supabase } from '@/integrations/supabase/client'
import { useAgents, type AgentTask, type AgentMessage } from '@/contexts/AgentContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Home, Zap, MessageSquare, CheckCircle, XCircle, Clock, Bot, Filter } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e', draft: '#9ca3af', deploying: '#eab308', paused: '#f97316', error: '#ef4444',
}

const TOOL_ICONS: Record<string, string> = {
  web_research: '🔍', buscar_prospectos: '🎯', investigar_empresa: '🏢', enviar_mensaje: '📨',
  enviar_email: '📧', crear_cadencia: '🔄', business_case: '💼', gestionar_leads: '👥',
  comunicar_agente: '💬', registrar_aprendizaje: '🧠', ver_metricas: '📊',
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

export function MissionControl() {
  const navigate = useNavigate()
  const { agents, getAgentTasks, getAgentMessages } = useAgents()
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([])
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<string>('all')

  useInterval(10000)

  // Build initial events
  useEffect(() => {
    const events: LiveEvent[] = []
    for (const agent of agents) {
      for (const task of getAgentTasks(agent.id).slice(0, 5)) {
        events.push({ id: `task-${task.id}`, type: 'task' as const, agent_name: agent.name, agent_id: agent.id,
          content: task.instruction.substring(0, 500), detail: task.status, status: task.status,
          timestamp: task.completed_at || task.created_at })
      }
      for (const msg of getAgentMessages(agent.id).slice(0, 10)) {
        const from = agents.find(a => a.id === msg.from_agent_id)
        const to = agents.find(a => a.id === msg.to_agent_id)
        events.push({ id: `msg-${msg.id}`, type: 'message' as const, agent_name: from?.name || 'Chief',
          agent_id: msg.from_agent_id || '', content: typeof msg.content === 'string' ? msg.content.substring(0, 500) : 'Message',
          detail: `→ ${to?.name || 'Chief'}`, timestamp: msg.created_at })
      }
    }
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    setLiveEvents(events.slice(0, 50))
  }, [agents, getAgentTasks, getAgentMessages])

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase.channel('mc-v3')
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'agent_tasks' }, (payload) => {
      const task = payload.new as AgentTask
      if (!task?.agent_id) return
      const agent = agents.find(a => a.id === task.agent_id)
      setLiveEvents(prev => [{ id: `task-${task.id}-${Date.now()}`, type: 'task' as const, agent_name: agent?.name || 'Agent',
        agent_id: task.agent_id, content: task.instruction?.substring(0, 500) || '', detail: task.status,
        status: task.status, timestamp: task.completed_at || task.created_at }, ...prev].slice(0, 50))
    })
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_messages' }, (payload) => {
      const msg = payload.new as AgentMessage
      const from = agents.find(a => a.id === msg.from_agent_id)
      const to = agents.find(a => a.id === msg.to_agent_id)
      setLiveEvents(prev => [{ id: `msg-${msg.id}-${Date.now()}`, type: 'message' as const, agent_name: from?.name || 'Chief',
        agent_id: msg.from_agent_id || '', content: typeof msg.content === 'string' ? msg.content.substring(0, 500) : 'Message',
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

  // Build nodes and edges
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
      const color = STATUS_COLORS[agent.status] || '#9ca3af'
      const tasks = getAgentTasks(agent.id)
      const isWorking = tasks.some(t => t.status === 'in_progress')
      const recentMsgs = getAgentMessages(agent.id).filter(m => Date.now() - new Date(m.created_at).getTime() < 120000)

      // Find recent tool
      let toolIcon = ''
      if (isWorking || recentMsgs.length > 0) {
        const latestTask = tasks.find(t => Date.now() - new Date(t.completed_at || t.created_at).getTime() < 120000)
        if (latestTask) {
          for (const [tool, icon] of Object.entries(TOOL_ICONS)) {
            if (latestTask.instruction.toLowerCase().includes(tool.replace('_', ' '))) { toolIcon = icon; break }
          }
        }
        if (recentMsgs.length > 0 && !toolIcon) toolIcon = '💬'
      }

      const statusDot = isWorking ? '🟢' : agent.status === 'active' ? '🟢' : '⚪'
      const activeTask = tasks.find(t => t.status === 'in_progress')
      const taskPreview = activeTask ? activeTask.instruction.substring(0, 40) + (activeTask.instruction.length > 40 ? '…' : '') : ''
      const label = `${toolIcon ? toolIcon + ' ' : ''}${agent.name}\n${agent.role}\n${statusDot} ${isWorking ? 'trabajando...' : ({'active':'activo','draft':'borrador','deploying':'desplegando','paused':'pausado','error':'error'}[agent.status] || agent.status)}${taskPreview ? `\n📋 ${taskPreview}` : ''}`

      flowNodes.push({
        id: agent.id, position: { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) },
        data: { label },
        style: {
          background: `${color}10`, border: `2px solid ${color}`, borderRadius: '14px',
          padding: '12px 18px', fontSize: '11px', fontWeight: 500, textAlign: 'center' as const,
          whiteSpace: 'pre-line' as const,
          boxShadow: isWorking ? `0 0 20px ${color}40, 0 0 40px ${color}15` : `0 2px 8px ${color}10`,
          transition: 'box-shadow 0.3s, border-color 0.3s',
        },
        sourcePosition: Position.Top, targetPosition: Position.Bottom,
      })
    })

    // Edges
    const flowEdges: Edge[] = activeAgents.map(agent => {
      const isWorking = getAgentTasks(agent.id).some(t => t.status === 'in_progress')
      return {
        id: `chief-${agent.id}`, source: 'chief', target: agent.id,
        animated: isWorking,
        style: { stroke: isWorking ? '#6366f1' : '#6366f125', strokeWidth: isWorking ? 2.5 : 1.5 },
      }
    })

    // Agent-to-agent edges
    const pairs = new Map<string, boolean>()
    for (const agent of activeAgents) {
      for (const msg of getAgentMessages(agent.id)) {
        if (msg.from_agent_id && msg.to_agent_id && msg.from_agent_id !== msg.to_agent_id) {
          const key = [msg.from_agent_id, msg.to_agent_id].sort().join('-')
          const recent = Date.now() - new Date(msg.created_at).getTime() < 120000
          if (!pairs.has(key) || recent) pairs.set(key, recent || (pairs.get(key) ?? false))
        }
      }
    }
    for (const [key, recent] of pairs) {
      const [src, tgt] = key.split('-')
      flowEdges.push({
        id: `a2a-${key}`, source: src, target: tgt,
        animated: recent,
        style: { stroke: recent ? '#f59e0b' : '#f59e0b25', strokeWidth: recent ? 2 : 1, strokeDasharray: '6 4' },
        label: recent ? '💬' : '',
        labelStyle: { fontSize: '12px' },
      })
    }

    return { nodes: flowNodes, edges: flowEdges }
  }, [agents, getAgentTasks, getAgentMessages, liveEvents])

  // Unique roles for filter
  const roles = useMemo(() => {
    const r = new Set(agents.filter(a => a.status !== 'destroyed').map(a => a.role))
    return Array.from(r).sort()
  }, [agents])

  // Filtered agents by role
  const filteredAgentIds = useMemo(() => {
    if (roleFilter === 'all') return new Set(agents.map(a => a.id))
    return new Set(agents.filter(a => a.role === roleFilter).map(a => a.id))
  }, [agents, roleFilter])

  // Filtered events
  const filteredEvents = useMemo(() => {
    if (roleFilter === 'all') return liveEvents
    return liveEvents.filter(e => filteredAgentIds.has(e.agent_id))
  }, [liveEvents, roleFilter, filteredAgentIds])

  // Stats
  const allTasks = agents.filter(a => filteredAgentIds.has(a.id)).flatMap(a => getAgentTasks(a.id))
  const completedTasks = allTasks.filter(t => t.status === 'completed').length
  const failedTasks = allTasks.filter(t => t.status === 'failed').length
  const inProgressTasks = allTasks.filter(t => t.status === 'in_progress').length
  const allMessages = agents.filter(a => filteredAgentIds.has(a.id)).flatMap(a => getAgentMessages(a.id))

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
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <Filter className="h-3 w-3 mr-1.5" />
                <SelectValue placeholder="Todos los roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los roles</SelectItem>
                {roles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><Bot className="h-4 w-4" />{agents.filter(a => a.status === 'active').length} activos</div>
          </div>
        </div>
      </header>

      <div className="border-b px-6 py-2 flex items-center gap-6 shrink-0 bg-muted/30">
        <div className="flex items-center gap-1.5 text-sm"><CheckCircle className="h-3.5 w-3.5 text-green-500" /><span className="font-medium">{completedTasks}</span><span className="text-muted-foreground">completadas</span></div>
        <div className="flex items-center gap-1.5 text-sm"><Clock className="h-3.5 w-3.5 text-blue-500" /><span className="font-medium">{inProgressTasks}</span><span className="text-muted-foreground">en progreso</span></div>
        <div className="flex items-center gap-1.5 text-sm"><XCircle className="h-3.5 w-3.5 text-red-500" /><span className="font-medium">{failedTasks}</span><span className="text-muted-foreground">fallidas</span></div>
        <div className="flex items-center gap-1.5 text-sm"><MessageSquare className="h-3.5 w-3.5 text-amber-500" /><span className="font-medium">{allMessages.length}</span><span className="text-muted-foreground">mensajes</span></div>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 border-r">
          <ReactFlow nodes={nodes} edges={edges} fitView panOnDrag zoomOnScroll
            proOptions={{ hideAttribution: true }} style={{ background: 'var(--background)' }}>
            <Background color="var(--border)" gap={24} size={1} />
          </ReactFlow>
        </div>

        <div className="w-[400px] flex flex-col min-h-0">
          <div className="px-4 py-3 border-b shrink-0">
            <h2 className="font-medium text-sm flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-amber-500" />Actividad en Vivo</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Bot className="h-8 w-8 mb-2 opacity-50" /><p className="text-sm">{roleFilter !== 'all' ? `Sin actividad para agentes ${roleFilter}` : 'Sin actividad aún'}</p>
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
                        <div className={`mt-0.5 shrink-0 ${isActivity ? 'text-purple-500' : isTask ? (event.status === 'completed' ? 'text-green-500' : event.status === 'failed' ? 'text-red-500' : 'text-blue-500') : 'text-amber-500'}`}>
                          {isActivity ? <Zap className="h-3.5 w-3.5" /> : isTask ? (event.status === 'completed' ? <CheckCircle className="h-3.5 w-3.5" /> : event.status === 'failed' ? <XCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />) : <MessageSquare className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-xs">{event.agent_name}</span>
                            {event.status && <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">{event.status}</Badge>}
                            {!isTask && !isActivity && <span className="text-[10px] text-muted-foreground">{event.detail}</span>}
                            {isRecent && <span className="text-[9px] text-amber-600 font-medium">NUEVO</span>}
                          </div>
                          <p className={`text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap ${expandedEvent === event.id ? '' : 'line-clamp-3'}`}>{event.content}</p>
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
    </div>
  )
}
