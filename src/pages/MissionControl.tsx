import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ReactFlow, Background, Position } from '@xyflow/react'
import type { Node, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { supabase } from '@/integrations/supabase/client'
import { useAgents, type AgentTask, type AgentMessage } from '@/contexts/AgentContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Home, Zap, MessageSquare, CheckCircle, XCircle, Clock, Bot } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  draft: '#9ca3af',
  deploying: '#eab308',
  paused: '#f97316',
  error: '#ef4444',
}

const TASK_STATUS_ICONS: Record<string, typeof CheckCircle> = {
  completed: CheckCircle,
  failed: XCircle,
  in_progress: Clock,
  pending: Clock,
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
}

export function MissionControl() {
  const navigate = useNavigate()
  const { agents, getAgentTasks, getAgentMessages } = useAgents()
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([])

  // Build initial events from existing data
  useEffect(() => {
    const events: LiveEvent[] = []

    // Add recent tasks
    for (const agent of agents) {
      const tasks = getAgentTasks(agent.id)
      for (const task of tasks.slice(0, 5)) {
        events.push({
          id: `task-${task.id}`,
          type: 'task' as const,
          agent_name: agent.name,
          agent_id: agent.id,
          content: task.instruction.substring(0, 120),
          detail: task.status,
          status: task.status,
          timestamp: task.completed_at || task.created_at,
        })
      }

      // Add recent messages
      const msgs = getAgentMessages(agent.id)
      for (const msg of msgs.slice(0, 5)) {
        const fromAgent = agents.find(a => a.id === msg.from_agent_id)
        const toAgent = agents.find(a => a.id === msg.to_agent_id)
        events.push({
          id: `msg-${msg.id}`,
          type: 'message' as const,
          agent_name: fromAgent?.name || 'Chief',
          agent_id: msg.from_agent_id || '',
          content: typeof msg.content === 'string' ? msg.content.substring(0, 120) : 'Message',
          detail: `→ ${toAgent?.name || 'Chief'}`,
          timestamp: msg.created_at,
        })
      }
    }

    // Sort by time, most recent first
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    setLiveEvents(events.slice(0, 30))
  }, [agents, getAgentTasks, getAgentMessages])

  // Supabase Realtime subscriptions
  useEffect(() => {
    const channel = supabase.channel('mission-control')

    // Listen for new tasks
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_tasks' }, (payload) => {
      const task = payload.new as AgentTask
      const agent = agents.find(a => a.id === task.agent_id)
      setLiveEvents(prev => [{
        id: `task-${task.id}-${Date.now()}`,
        type: 'task' as const,
        agent_name: agent?.name || 'Agent',
        agent_id: task.agent_id,
        content: task.instruction.substring(0, 120),
        detail: task.status,
        status: task.status,
        timestamp: task.created_at,
      }, ...prev].slice(0, 50))
    })

    // Listen for task updates
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'agent_tasks' }, (payload) => {
      const task = payload.new as AgentTask
      const agent = agents.find(a => a.id === task.agent_id)
      setLiveEvents(prev => [{
        id: `task-update-${task.id}-${Date.now()}`,
        type: 'task' as const,
        agent_name: agent?.name || 'Agent',
        agent_id: task.agent_id,
        content: task.instruction.substring(0, 120),
        detail: task.status,
        status: task.status,
        timestamp: task.completed_at || task.created_at,
      }, ...prev].slice(0, 50))
    })

    // Listen for new messages
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_messages' }, (payload) => {
      const msg = payload.new as AgentMessage
      const fromAgent = agents.find(a => a.id === msg.from_agent_id)
      const toAgent = agents.find(a => a.id === msg.to_agent_id)
      setLiveEvents(prev => [{
        id: `msg-${msg.id}-${Date.now()}`,
        type: 'message' as const,
        agent_name: fromAgent?.name || 'Chief',
        agent_id: msg.from_agent_id || '',
        content: typeof msg.content === 'string' ? msg.content.substring(0, 120) : 'Message',
        detail: `→ ${toAgent?.name || 'Chief'}`,
        timestamp: msg.created_at,
      }, ...prev].slice(0, 50))
    })

    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [agents])

  // Build React Flow nodes and edges
  const { nodes, edges } = useMemo(() => {
    const activeAgents = agents.filter(a => a.status !== 'destroyed')
    const centerX = 300
    const centerY = 200

    // Chief node in center
    const flowNodes: Node[] = [{
      id: 'chief',
      position: { x: centerX, y: centerY },
      data: { label: 'Chief (Orchestrator)' },
      style: {
        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
        color: 'white',
        border: 'none',
        borderRadius: '12px',
        padding: '12px 20px',
        fontSize: '13px',
        fontWeight: 600,
        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    }]

    // Agent nodes around Chief
    const radius = 180
    activeAgents.forEach((agent, i) => {
      const angle = (2 * Math.PI * i) / activeAgents.length - Math.PI / 2
      const x = centerX + radius * Math.cos(angle)
      const y = centerY + radius * Math.sin(angle)
      const color = STATUS_COLORS[agent.status] || '#9ca3af'

      const recentTasks = getAgentTasks(agent.id)
      const isWorking = recentTasks.some(t => t.status === 'in_progress')

      flowNodes.push({
        id: agent.id,
        position: { x, y },
        data: { label: `${agent.name}\n${agent.role}` },
        style: {
          background: `${color}15`,
          border: `2px solid ${color}`,
          borderRadius: '12px',
          padding: '10px 16px',
          fontSize: '12px',
          fontWeight: 500,
          textAlign: 'center' as const,
          boxShadow: isWorking ? `0 0 12px ${color}40` : 'none',
          animation: isWorking ? 'pulse 2s ease-in-out infinite' : 'none',
          whiteSpace: 'pre-line' as const,
        },
        sourcePosition: Position.Top,
        targetPosition: Position.Bottom,
      })
    })

    // Edges: Chief → each agent
    const flowEdges: Edge[] = activeAgents.map(agent => ({
      id: `chief-${agent.id}`,
      source: 'chief',
      target: agent.id,
      style: { stroke: '#6366f140', strokeWidth: 1.5 },
      animated: getAgentTasks(agent.id).some(t => t.status === 'in_progress'),
    }))

    // Edges: agent-to-agent (from messages)
    const messagePairs = new Set<string>()
    for (const agent of activeAgents) {
      const msgs = getAgentMessages(agent.id)
      for (const msg of msgs) {
        if (msg.from_agent_id && msg.to_agent_id && msg.from_agent_id !== msg.to_agent_id) {
          const pair = [msg.from_agent_id, msg.to_agent_id].sort().join('-')
          if (!messagePairs.has(pair)) {
            messagePairs.add(pair)
            flowEdges.push({
              id: `a2a-${pair}`,
              source: msg.from_agent_id,
              target: msg.to_agent_id,
              style: { stroke: '#f59e0b80', strokeWidth: 2, strokeDasharray: '5 5' },
              label: '💬',
              labelStyle: { fontSize: '10px' },
            })
          }
        }
      }
    }

    return { nodes: flowNodes, edges: flowEdges }
  }, [agents, getAgentTasks, getAgentMessages])

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
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <Home className="h-4 w-4" />
            </Button>
            <h1 className="font-heading font-semibold text-lg">Mission Control</h1>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
              LIVE
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Bot className="h-4 w-4" />
              {agents.filter(a => a.status === 'active').length} active
            </div>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="border-b px-6 py-2 flex items-center gap-6 shrink-0 bg-muted/30">
        <div className="flex items-center gap-1.5 text-sm">
          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
          <span className="font-medium">{completedTasks}</span>
          <span className="text-muted-foreground">completed</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <Clock className="h-3.5 w-3.5 text-blue-500" />
          <span className="font-medium">{inProgressTasks}</span>
          <span className="text-muted-foreground">in progress</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <XCircle className="h-3.5 w-3.5 text-red-500" />
          <span className="font-medium">{failedTasks}</span>
          <span className="text-muted-foreground">failed</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
          <span className="font-medium">{allMessages.length}</span>
          <span className="text-muted-foreground">messages</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Agent Graph */}
        <div className="flex-1 border-r">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            panOnDrag
            zoomOnScroll
            proOptions={{ hideAttribution: true }}
            style={{ background: 'var(--background)' }}
          >
            <Background color="var(--border)" gap={20} size={1} />
          </ReactFlow>
        </div>

        {/* Live Feed */}
        <div className="w-[380px] flex flex-col min-h-0">
          <div className="px-4 py-3 border-b shrink-0">
            <h2 className="font-medium text-sm flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              Live Activity
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {liveEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Bot className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No activity yet</p>
                <p className="text-xs">Events will appear here in real-time</p>
              </div>
            ) : (
              <div className="divide-y">
                {liveEvents.map((event) => {
                  const StatusIcon = event.status ? (TASK_STATUS_ICONS[event.status] || Clock) : MessageSquare
                  const isTask = event.type === 'task'
                  return (
                    <div key={event.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start gap-2.5">
                        <div className={`mt-0.5 shrink-0 ${isTask ? (event.status === 'completed' ? 'text-green-500' : event.status === 'failed' ? 'text-red-500' : 'text-blue-500') : 'text-amber-500'}`}>
                          {isTask ? <StatusIcon className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-xs">{event.agent_name}</span>
                            {event.status && (
                              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">{event.status}</Badge>
                            )}
                            {!isTask && (
                              <span className="text-[10px] text-muted-foreground">{event.detail}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{event.content}</p>
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
