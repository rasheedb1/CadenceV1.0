import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ReactFlow, Background, Position, Handle, BaseEdge, getStraightPath } from '@xyflow/react'
import type { Node, Edge, NodeProps, EdgeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { supabase } from '@/integrations/supabase/client'
import { useAgents, type AgentTask, type AgentMessage } from '@/contexts/AgentContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Home, Zap, MessageSquare, CheckCircle, XCircle, Clock, Bot } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e', draft: '#9ca3af', deploying: '#eab308', paused: '#f97316', error: '#ef4444',
}

const TOOL_ICONS: Record<string, string> = {
  web_research: '🔍', buscar_prospectos: '🎯', investigar_empresa: '🏢', enviar_mensaje: '📨',
  enviar_email: '📧', crear_cadencia: '🔄', business_case: '💼', gestionar_leads: '👥',
  comunicar_agente: '💬', registrar_aprendizaje: '🧠', ver_metricas: '📊', capturar_pantalla: '📸',
  ver_actividad: '📋', ver_calendario: '📅',
}

interface LiveEvent {
  id: string
  type: 'task' | 'message'
  agent_name: string
  agent_id: string
  content: string
  detail: string
  status?: string
  timestamp: string
  tool?: string
}

function useInterval(ms: number) {
  const [, setTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), ms); return () => clearInterval(id) }, [ms])
}

// =====================================================
// CUSTOM ANIMATED NODE
// =====================================================

interface AgentNodeData {
  name: string
  role: string
  status: string
  isWorking: boolean
  recentTool: string | null
  lastActive: string | null
  messageCount: number
  [key: string]: unknown
}

const AgentNode = memo(({ data }: NodeProps<Node<AgentNodeData>>) => {
  const { name, role, status, isWorking, recentTool, lastActive, messageCount } = data
  const color = STATUS_COLORS[status] || '#9ca3af'

  return (
    <div className={`relative ${isWorking ? 'animate-pulse' : ''}`}>
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0" />

      {/* Glow ring when working */}
      {isWorking && (
        <div
          className="absolute -inset-3 rounded-2xl opacity-30 animate-ping"
          style={{ background: color, animationDuration: '2s' }}
        />
      )}

      {/* Tool badge */}
      {recentTool && TOOL_ICONS[recentTool] && (
        <div className="absolute -top-3 -right-3 z-10 bg-white dark:bg-gray-900 rounded-full w-7 h-7 flex items-center justify-center text-sm shadow-lg border-2 animate-bounce" style={{ borderColor: color, animationDuration: '1s' }}>
          {TOOL_ICONS[recentTool]}
        </div>
      )}

      {/* Message count badge */}
      {messageCount > 0 && (
        <div className="absolute -top-2 -left-2 z-10 bg-amber-500 text-white rounded-full min-w-[20px] h-5 flex items-center justify-center text-[10px] font-bold shadow px-1">
          {messageCount}
        </div>
      )}

      {/* Node body */}
      <div
        className="rounded-xl px-5 py-3 text-center transition-all duration-300 min-w-[120px]"
        style={{
          background: `${color}12`,
          border: `2px solid ${color}`,
          boxShadow: isWorking ? `0 0 20px ${color}50, 0 0 40px ${color}20` : `0 2px 8px ${color}15`,
        }}
      >
        <div className="font-semibold text-[13px]">{name}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{role}</div>

        {/* Status indicator */}
        <div className="flex items-center justify-center gap-1 mt-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{
            background: color,
            animation: isWorking ? 'pulse 1s ease-in-out infinite' : 'none',
          }} />
          <span className="text-[9px]" style={{ color }}>
            {isWorking ? 'working...' : status}
          </span>
        </div>

        {/* Last active */}
        {lastActive && (
          <div className="text-[8px] text-muted-foreground/60 mt-1">
            {lastActive}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0" />
    </div>
  )
})
AgentNode.displayName = 'AgentNode'

// Chief orchestrator node
const ChiefNode = memo(({ data }: NodeProps) => {
  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0" />
      <div className="rounded-2xl px-6 py-4 text-center" style={{
        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
        boxShadow: '0 4px 20px rgba(99, 102, 241, 0.35), 0 0 40px rgba(99, 102, 241, 0.1)',
      }}>
        <div className="text-white font-bold text-sm">{String(data.label)}</div>
        <div className="text-blue-100 text-[10px] mt-0.5">Orchestrator</div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0" />
    </div>
  )
})
ChiefNode.displayName = 'ChiefNode'

// Animated edge with particle
const AnimatedEdge = memo(({ id, sourceX, sourceY, targetX, targetY, style, data }: EdgeProps) => {
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  const isActive = (data as Record<string, unknown>)?.active as boolean

  return (
    <>
      <BaseEdge id={id} path={path} style={{ ...style, strokeWidth: isActive ? 2.5 : 1.5, transition: 'all 0.3s' }} />
      {isActive && (
        <circle r="4" fill="#f59e0b">
          <animateMotion dur="1.5s" repeatCount="indefinite" path={path} />
        </circle>
      )}
    </>
  )
})
AnimatedEdge.displayName = 'AnimatedEdge'

const nodeTypes = { agent: AgentNode, chief: ChiefNode }
const edgeTypes = { animated: AnimatedEdge }

// =====================================================
// MISSION CONTROL
// =====================================================

export function MissionControl() {
  const navigate = useNavigate()
  const { agents, getAgentTasks, getAgentMessages } = useAgents()
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([])
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)

  useInterval(10000) // Refresh time-ago

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
    const channel = supabase.channel('mission-control-v2')
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
    // Real-time tool usage events
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_activity_events' }, (payload) => {
      const evt = payload.new as { agent_id: string; event_type: string; tool_name: string; content: string; created_at: string }
      const agent = agents.find(a => a.id === evt.agent_id)
      const icon = evt.tool_name ? (TOOL_ICONS[evt.tool_name] || '⚡') : '⚡'
      setLiveEvents(prev => [{ id: `evt-${Date.now()}`, type: 'task' as const, agent_name: agent?.name || 'Agent',
        agent_id: evt.agent_id, content: `${icon} ${evt.event_type}: ${evt.tool_name || ''} ${evt.content?.substring(0, 200) || ''}`,
        detail: evt.event_type, status: evt.event_type === 'tool_call' ? 'in_progress' : 'completed',
        tool: evt.tool_name, timestamp: evt.created_at }, ...prev].slice(0, 50))
    })
    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [agents])

  // Determine recent activity per agent (last 2 min)
  const recentActivity = useMemo(() => {
    const twoMinAgo = Date.now() - 120000
    const activity: Record<string, { isWorking: boolean; recentTool: string | null; lastActive: string | null; recentMessages: number }> = {}

    for (const agent of agents) {
      const tasks = getAgentTasks(agent.id)
      const msgs = getAgentMessages(agent.id)
      const isWorking = tasks.some(t => t.status === 'in_progress')
      const recentMsgs = msgs.filter(m => new Date(m.created_at).getTime() > twoMinAgo)

      // Find most recent tool used (from task instruction keywords)
      let recentTool: string | null = null
      const latestTask = tasks.find(t => new Date(t.completed_at || t.created_at).getTime() > twoMinAgo)
      if (latestTask) {
        for (const [tool] of Object.entries(TOOL_ICONS)) {
          if (latestTask.instruction.toLowerCase().includes(tool.replace('_', ' '))) { recentTool = tool; break }
        }
      }
      if (recentMsgs.length > 0 && !recentTool) recentTool = 'comunicar_agente'

      const lastEvent = [...tasks.map(t => t.completed_at || t.created_at), ...msgs.map(m => m.created_at)]
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]

      activity[agent.id] = { isWorking, recentTool: isWorking || recentMsgs.length > 0 ? recentTool : null,
        lastActive: lastEvent ? timeAgo(lastEvent) : null, recentMessages: recentMsgs.length }
    }
    return activity
  }, [agents, getAgentTasks, getAgentMessages, liveEvents])

  // Build nodes and edges
  const { nodes, edges } = useMemo(() => {
    const activeAgents = agents.filter(a => a.status !== 'destroyed')
    const centerX = 350, centerY = 220

    const flowNodes: Node[] = [{
      id: 'chief', type: 'chief', position: { x: centerX, y: centerY },
      data: { label: 'Chief' },
    }]

    const radius = 200
    activeAgents.forEach((agent, i) => {
      const angle = (2 * Math.PI * i) / activeAgents.length - Math.PI / 2
      const act = recentActivity[agent.id] || { isWorking: false, recentTool: null, lastActive: null, recentMessages: 0 }
      flowNodes.push({
        id: agent.id, type: 'agent',
        position: { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) },
        data: { name: agent.name, role: agent.role, status: agent.status,
          isWorking: act.isWorking, recentTool: act.recentTool,
          lastActive: act.lastActive, messageCount: act.recentMessages } as AgentNodeData,
      })
    })

    // Edges
    const twoMinAgo = Date.now() - 120000
    const flowEdges: Edge[] = activeAgents.map(agent => {
      const act = recentActivity[agent.id]
      return {
        id: `chief-${agent.id}`, source: 'chief', target: agent.id, type: 'animated',
        style: { stroke: act?.isWorking ? '#6366f1' : '#6366f130' },
        data: { active: act?.isWorking },
      }
    })

    // Agent-to-agent edges
    const pairs = new Map<string, { count: number; recent: boolean }>()
    for (const agent of activeAgents) {
      for (const msg of getAgentMessages(agent.id)) {
        if (msg.from_agent_id && msg.to_agent_id && msg.from_agent_id !== msg.to_agent_id) {
          const key = [msg.from_agent_id, msg.to_agent_id].sort().join('-')
          const existing = pairs.get(key) || { count: 0, recent: false }
          existing.count++
          if (new Date(msg.created_at).getTime() > twoMinAgo) existing.recent = true
          pairs.set(key, existing)
        }
      }
    }
    for (const [key, { recent }] of pairs) {
      const [src, tgt] = key.split('-')
      flowEdges.push({
        id: `a2a-${key}`, source: src, target: tgt, type: 'animated',
        style: { stroke: recent ? '#f59e0b' : '#f59e0b30', strokeDasharray: '6 4' },
        data: { active: recent },
      })
    }

    return { nodes: flowNodes, edges: flowEdges }
  }, [agents, recentActivity, getAgentMessages])

  // Stats
  const allTasks = agents.flatMap(a => getAgentTasks(a.id))
  const completedTasks = allTasks.filter(t => t.status === 'completed').length
  const failedTasks = allTasks.filter(t => t.status === 'failed').length
  const inProgressTasks = allTasks.filter(t => t.status === 'in_progress').length
  const allMessages = agents.flatMap(a => getAgentMessages(a.id))

  const timeAgo = useCallback((ts: string) => {
    const diff = Date.now() - new Date(ts).getTime()
    if (diff < 60000) return `${Math.floor(diff / 1000)}s`
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    return `${Math.floor(diff / 86400000)}d`
  }, [])

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur shrink-0">
        <div className="px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}><Home className="h-4 w-4" /></Button>
            <h1 className="font-heading font-semibold text-lg">Mission Control</h1>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />LIVE
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground"><Bot className="h-4 w-4" />{agents.filter(a => a.status === 'active').length} active</div>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="border-b px-6 py-2 flex items-center gap-6 shrink-0 bg-muted/30">
        <div className="flex items-center gap-1.5 text-sm"><CheckCircle className="h-3.5 w-3.5 text-green-500" /><span className="font-medium">{completedTasks}</span><span className="text-muted-foreground">completed</span></div>
        <div className="flex items-center gap-1.5 text-sm"><Clock className="h-3.5 w-3.5 text-blue-500" /><span className="font-medium">{inProgressTasks}</span><span className="text-muted-foreground">in progress</span></div>
        <div className="flex items-center gap-1.5 text-sm"><XCircle className="h-3.5 w-3.5 text-red-500" /><span className="font-medium">{failedTasks}</span><span className="text-muted-foreground">failed</span></div>
        <div className="flex items-center gap-1.5 text-sm"><MessageSquare className="h-3.5 w-3.5 text-amber-500" /><span className="font-medium">{allMessages.length}</span><span className="text-muted-foreground">messages</span></div>
      </div>

      {/* Main */}
      <div className="flex-1 flex min-h-0">
        {/* Graph */}
        <div className="flex-1 border-r">
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            fitView panOnDrag zoomOnScroll proOptions={{ hideAttribution: true }}
            style={{ background: 'var(--background)' }}>
            <Background color="var(--border)" gap={24} size={1} />
          </ReactFlow>
        </div>

        {/* Feed */}
        <div className="w-[400px] flex flex-col min-h-0">
          <div className="px-4 py-3 border-b shrink-0">
            <h2 className="font-medium text-sm flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber-500" />Live Activity
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {liveEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Bot className="h-8 w-8 mb-2 opacity-50" /><p className="text-sm">No activity yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {liveEvents.map((event) => {
                  const isTask = event.type === 'task'
                  const isRecent = Date.now() - new Date(event.timestamp).getTime() < 120000
                  return (
                    <div key={event.id} className={`px-4 py-3 cursor-pointer transition-all ${isRecent ? 'bg-amber-50/50 dark:bg-amber-950/20' : 'hover:bg-muted/30'}`}
                      onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}>
                      <div className="flex items-start gap-2.5">
                        <div className={`mt-0.5 shrink-0 ${isTask ? (event.status === 'completed' ? 'text-green-500' : event.status === 'failed' ? 'text-red-500' : 'text-blue-500') : 'text-amber-500'}`}>
                          {isTask ? (event.status === 'completed' ? <CheckCircle className="h-3.5 w-3.5" /> : event.status === 'failed' ? <XCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />) : <MessageSquare className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-xs">{event.agent_name}</span>
                            {event.status && <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">{event.status}</Badge>}
                            {!isTask && <span className="text-[10px] text-muted-foreground">{event.detail}</span>}
                            {isRecent && <span className="text-[9px] text-amber-600 font-medium">NEW</span>}
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
