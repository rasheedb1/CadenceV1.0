import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '@/integrations/supabase/client'
import { useAgents, type Agent, type AgentTier, type AgentAvailability, type AgentTask, type AgentMessage, type AgentTaskV2, type AgentCheckin } from '@/contexts/AgentContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Bot, Plus, MoreVertical, Trash2, Loader2, ChevronDown,
  LayoutGrid, Network, Cpu, Crown, UserCog, User,
  Circle, Zap, AlertTriangle, WifiOff, Home, Moon, Sun,
  Radio, ListTodo, BarChart3, CheckCircle, XCircle, Clock, MessageSquare,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'

// ── Constants ────────────────────────────────────────────────────────

const ROLE_TEMPLATES: Record<string, { skills: string[]; description: string }> = {
  sales: {
    skills: ['buscar_prospectos', 'crear_cadencia', 'enviar_mensaje', 'enviar_email', 'investigar_empresa', 'enriquecer_prospectos', 'gestionar_leads', 'business_case', 'ver_actividad', 'ver_metricas', 'ver_notificaciones', 'ver_cadencia_detalle', 'ver_conexiones', 'ver_programacion', 'ver_calendario', 'buscar_slots_disponibles', 'crear_evento_calendario'],
    description: 'Vendedor completo: prospecta, investiga, envia mensajes, gestiona cadencias',
  },
  ux_designer: {
    skills: ['web_research', 'investigar_empresa'],
    description: 'UX/UI: investiga referencias, diseña interfaces, audita experiencia',
  },
  cpo: {
    skills: ['investigar_empresa', 'gestionar_leads', 'ver_actividad', 'ver_metricas', 'business_case'],
    description: 'Producto: investiga mercado, analiza metricas, genera business cases',
  },
  developer: {
    skills: ['ver_actividad', 'ver_metricas'],
    description: 'Dev: acceso a metricas y actividad para debugging',
  },
  cfo: {
    skills: ['ver_metricas', 'ver_actividad', 'business_case'],
    description: 'Finanzas: metricas, actividad, business cases',
  },
  hr: {
    skills: ['buscar_prospectos', 'enviar_email', 'ver_calendario', 'buscar_slots_disponibles', 'crear_evento_calendario'],
    description: 'RRHH: buscar personas, enviar emails, gestionar calendario',
  },
  marketing: {
    skills: ['investigar_empresa', 'descubrir_empresas', 'business_case', 'ver_metricas'],
    description: 'Marketing: investigar empresas, descubrir mercado, generar contenido',
  },
  custom: { skills: [], description: 'Selecciona skills manualmente' },
}

const ROLE_OPTIONS = [
  { value: 'sales', label: 'Sales' },
  { value: 'ux_designer', label: 'UX Designer' },
  { value: 'cpo', label: 'CPO / Product' },
  { value: 'developer', label: 'Developer' },
  { value: 'cfo', label: 'CFO / Finance' },
  { value: 'hr', label: 'HR' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'custom', label: 'Custom' },
]

const MODEL_OPTIONS = [
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'anthropic', badge: 'Opus', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic', badge: 'Sonnet', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'anthropic', badge: 'Haiku', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300' },
]

const TIER_OPTIONS: { value: AgentTier; label: string; icon: typeof Crown }[] = [
  { value: 'manager', label: 'Manager', icon: Crown },
  { value: 'team_lead', label: 'Team Lead', icon: UserCog },
  { value: 'worker', label: 'Worker', icon: User },
]

const CAPABILITY_OPTIONS = [
  { value: 'code', label: 'Programar' },
  { value: 'research', label: 'Investigar' },
  { value: 'design', label: 'Diseño UX/UI' },
  { value: 'outreach', label: 'Outreach / Ventas' },
  { value: 'data', label: 'Análisis de datos' },
  { value: 'ops', label: 'Operaciones' },
  { value: 'writing', label: 'Redacción' },
  { value: 'strategy', label: 'Estrategia' },
]

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  deploying: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  paused: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

const AVAILABILITY_CONFIG: Record<AgentAvailability, { label: string; color: string; icon: typeof Circle }> = {
  available: { label: 'Disponible', color: 'text-green-500', icon: Circle },
  working: { label: 'Trabajando', color: 'text-blue-500', icon: Zap },
  blocked: { label: 'Bloqueado', color: 'text-red-500', icon: AlertTriangle },
  on_project: { label: 'En proyecto', color: 'text-amber-500', icon: Cpu },
  offline: { label: 'Offline', color: 'text-gray-400', icon: WifiOff },
}

function getModelBadge(model: string) {
  return MODEL_OPTIONS.find(m => m.value === model) || { badge: model?.split('-')[1] || 'LLM', color: 'bg-gray-100 text-gray-700' }
}

// ── Org Chart View ───────────────────────────────────────────────────

function OrgChartNode({ agent, allAgents, onNavigate, level = 0 }: {
  agent: Agent
  allAgents: Agent[]
  onNavigate: (id: string) => void
  level?: number
}) {
  const children = allAgents.filter(a => a.parent_agent_id === agent.id)
  const availConfig = AVAILABILITY_CONFIG[agent.availability] || AVAILABILITY_CONFIG.offline
  const AvailIcon = availConfig.icon
  const modelInfo = getModelBadge(agent.model)
  const TierIcon = TIER_OPTIONS.find(t => t.value === agent.tier)?.icon || User

  return (
    <div className="flex flex-col items-center">
      <motion.div
        className="cursor-pointer"
        whileHover={{ scale: 1.03, y: -2 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        onClick={() => onNavigate(agent.id)}
      >
        <Card className={`w-56 border-2 transition-colors ${
          agent.tier === 'manager' ? 'border-purple-300 dark:border-purple-700' :
          agent.tier === 'team_lead' ? 'border-blue-300 dark:border-blue-700' :
          'border-border'
        }`}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                agent.tier === 'manager' ? 'bg-purple-100 dark:bg-purple-900' :
                agent.tier === 'team_lead' ? 'bg-blue-100 dark:bg-blue-900' :
                'bg-muted'
              }`}>
                <TierIcon className={`h-4 w-4 ${
                  agent.tier === 'manager' ? 'text-purple-600' :
                  agent.tier === 'team_lead' ? 'text-blue-600' :
                  'text-muted-foreground'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{agent.name}</p>
                <p className="text-xs text-muted-foreground truncate">{ROLE_OPTIONS.find(r => r.value === agent.role)?.label || agent.role}</p>
              </div>
              <AvailIcon className={`h-3 w-3 ${availConfig.color} shrink-0`} fill="currentColor" />
            </div>
            <div className="flex gap-1 flex-wrap">
              <Badge className={`text-[10px] px-1.5 py-0 ${modelInfo.color}`}>{modelInfo.badge}</Badge>
              {agent.team && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{agent.team}</Badge>}
              <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[agent.status] || STATUS_COLORS.draft}`}>{agent.status}</Badge>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {children.length > 0 && (
        <>
          <div className="w-px h-6 bg-border" />
          <div className="flex gap-6 items-start relative">
            {children.length > 1 && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px bg-border"
                style={{ width: `calc(100% - 14rem)` }} />
            )}
            {children.map(child => (
              <div key={child.id} className="flex flex-col items-center">
                <div className="w-px h-6 bg-border" />
                <OrgChartNode agent={child} allAgents={allAgents} onNavigate={onNavigate} level={level + 1} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function OrgChartView({ agents, onNavigate }: { agents: Agent[]; onNavigate: (id: string) => void }) {
  // Root agents = no parent
  const roots = agents.filter(a => !a.parent_agent_id)
  // Agents with parents that point to non-existent agents are also roots
  const rootsWithOrphans = [
    ...roots,
    ...agents.filter(a => a.parent_agent_id && !agents.find(p => p.id === a.parent_agent_id)),
  ]
  const uniqueRoots = [...new Map(rootsWithOrphans.map(a => [a.id, a])).values()]

  if (uniqueRoots.length === 0) return <p className="text-center text-muted-foreground py-12">No hay agentes</p>

  return (
    <div className="overflow-x-auto pb-8">
      <div className="flex gap-12 justify-center pt-4 min-w-fit px-8">
        {uniqueRoots.map(agent => (
          <OrgChartNode key={agent.id} agent={agent} allAgents={agents} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  )
}

// ── Grid View (improved) ─────────────────────────────────────────────

function GridView({ agents, onNavigate, onDelete, deleting }: {
  agents: Agent[]
  onNavigate: (id: string) => void
  onDelete: (id: string, e: React.MouseEvent) => void
  deleting: string | null
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent, idx) => {
        const availConfig = AVAILABILITY_CONFIG[agent.availability] || AVAILABILITY_CONFIG.offline
        const AvailIcon = availConfig.icon
        const modelInfo = getModelBadge(agent.model)
        const TierIcon = TIER_OPTIONS.find(t => t.value === agent.tier)?.icon || User

        return (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 * idx, duration: 0.3, ease: 'easeOut' }}
          >
            <motion.div whileHover={{ scale: 1.02, y: -3 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => onNavigate(agent.id)}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${
                      agent.tier === 'manager' ? 'bg-purple-100 dark:bg-purple-900' :
                      agent.tier === 'team_lead' ? 'bg-blue-100 dark:bg-blue-900' :
                      'bg-muted'
                    }`}>
                      <TierIcon className={`h-5 w-5 ${
                        agent.tier === 'manager' ? 'text-purple-600' :
                        agent.tier === 'team_lead' ? 'text-blue-600' :
                        'text-muted-foreground'
                      }`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate">{agent.name}</CardTitle>
                      <CardDescription className="truncate">{agent.description || ROLE_OPTIONS.find(r => r.value === agent.role)?.label || agent.role}</CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-destructive" disabled={deleting === agent.id} onClick={e => onDelete(agent.id, e)}>
                        <Trash2 className="mr-2 h-4 w-4" />Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    <Badge className={`text-[10px] px-1.5 py-0 ${modelInfo.color}`}>{modelInfo.badge}</Badge>
                    <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[agent.status] || STATUS_COLORS.draft}`}>
                      {agent.status === 'active' && (
                        <motion.span
                          className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1"
                          animate={{ opacity: [1, 0.3, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        />
                      )}
                      {agent.status}
                    </Badge>
                    {agent.team && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{agent.team}</Badge>}
                    {agent.tier !== 'worker' && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {agent.tier === 'manager' ? 'Manager' : 'Team Lead'}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs">
                      <AvailIcon className={`h-3 w-3 ${availConfig.color}`} fill="currentColor" />
                      <span className="text-muted-foreground">{availConfig.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{agent.agent_skills?.length || 0} skills</span>
                  </div>
                  {agent.capabilities?.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-2">
                      {agent.capabilities.slice(0, 3).map(cap => (
                        <span key={cap} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{cap}</span>
                      ))}
                      {agent.capabilities.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{agent.capabilities.length - 3}</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )
      })}
    </div>
  )
}

// ── Mission Control: Live Activity Feed ──────────────────────────────

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
  id: string; type: 'task' | 'message' | 'activity'; agent_name: string; agent_id: string
  content: string; detail: string; status?: string; timestamp: string
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return `${Math.floor(diff / 1000)}s`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  return `${Math.floor(diff / 86400000)}d`
}

function ActivityView({ agents, checkins, respondToCheckin }: {
  agents: Agent[]; checkins: AgentCheckin[]
  respondToCheckin: (id: string, status: 'approved' | 'rejected', feedback?: string) => Promise<void>
}) {
  const { getAgentTasks, getAgentMessages } = useAgents()
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([])
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)

  const [, setTick] = useState(0)
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 10000); return () => clearInterval(id) }, [])

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
        .eq('org_id', orgId).order('created_at', { ascending: false }).limit(200)
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

  useEffect(() => {
    const channel = supabase.channel('agents-activity')
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'agent_tasks' }, (payload) => {
      const task = payload.new as AgentTask
      if (!task?.agent_id) return
      const agent = agents.find(a => a.id === task.agent_id)
      setLiveEvents(prev => [{ id: `task-${task.id}-${Date.now()}`, type: 'task' as const, agent_name: agent?.name || 'Agent',
        agent_id: task.agent_id, content: task.instruction?.substring(0, 2000) || '', detail: task.status,
        status: task.status, timestamp: task.completed_at || task.created_at }, ...prev].slice(0, 300))
    })
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_messages' }, (payload) => {
      const msg = payload.new as AgentMessage
      const from = agents.find(a => a.id === msg.from_agent_id)
      const to = agents.find(a => a.id === msg.to_agent_id)
      setLiveEvents(prev => [{ id: `msg-${msg.id}-${Date.now()}`, type: 'message' as const, agent_name: from?.name || 'Chief',
        agent_id: msg.from_agent_id || '', content: typeof msg.content === 'string' ? msg.content.substring(0, 2000) : 'Message',
        detail: `→ ${to?.name || 'Chief'}`, timestamp: msg.created_at }, ...prev].slice(0, 300))
    })
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_activity_events' }, (payload) => {
      const evt = payload.new as { agent_id: string; event_type: string; tool_name: string; content: string; created_at: string }
      const agent = agents.find(a => a.id === evt.agent_id)
      const icon = evt.tool_name ? (TOOL_ICONS[evt.tool_name] || '⚡') : '⚡'
      setLiveEvents(prev => [{ id: `evt-${Date.now()}`, type: 'activity' as const, agent_name: agent?.name || 'Agent',
        agent_id: evt.agent_id, content: `${icon} ${evt.tool_name || evt.event_type}: ${evt.content?.substring(0, 300) || ''}`,
        detail: evt.event_type, status: evt.event_type === 'tool_call' ? 'in_progress' : 'completed',
        timestamp: evt.created_at }, ...prev].slice(0, 300))
    })
    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [agents])

  const pendingCheckins = checkins.filter(c => c.needs_approval && c.status === 'sent')

  return (
    <div className="space-y-4">
      {pendingCheckins.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">⏳ Check-ins pendientes</p>
            {pendingCheckins.slice(0, 5).map(c => {
              const agent = agents.find(a => a.id === c.agent_id)
              return (
                <div key={c.id} className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium">{agent?.name || 'Agente'}: </span>
                    <span className="text-xs text-muted-foreground">{c.summary?.substring(0, 80)}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => respondToCheckin(c.id, 'rejected')}>✗</Button>
                    <Button size="sm" className="h-6 px-2 text-[10px]" onClick={() => respondToCheckin(c.id, 'approved')}>✓</Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-green-500" />Actividad en Vivo
            <Badge variant="outline" className="ml-auto bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1 animate-pulse" />EN VIVO
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {liveEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bot className="h-8 w-8 mb-2 opacity-50" /><p className="text-sm">Sin actividad aún</p>
            </div>
          ) : (
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {liveEvents.slice(0, 100).map(event => {
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
        </CardContent>
      </Card>
    </div>
  )
}

// ── Mission Control: Kanban ──────────────────────────────────────────

const KANBAN_COLUMNS = [
  { key: 'backlog', label: 'Backlog', icon: Circle },
  { key: 'ready', label: 'Ready', icon: Clock },
  { key: 'claimed,in_progress', label: 'En progreso', icon: Zap },
  { key: 'review', label: 'Review', icon: AlertTriangle },
  { key: 'done', label: 'Done', icon: CheckCircle },
]

function KanbanView({ tasks, agents }: { tasks: AgentTaskV2[]; agents: Agent[] }) {
  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-fit">
        {KANBAN_COLUMNS.map(col => {
          const statuses = col.key.split(',')
          const colTasks = tasks.filter(t => statuses.includes(t.status))
          const Icon = col.icon
          return (
            <div key={col.key} className="w-72 flex flex-col shrink-0">
              <div className="flex items-center gap-2 mb-3 px-1">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{col.label}</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">{colTasks.length}</Badge>
              </div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
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
                                <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${agent.tier === 'manager' ? 'bg-purple-100 text-purple-600' : agent.tier === 'team_lead' ? 'bg-blue-100 text-blue-600' : 'bg-muted text-muted-foreground'}`}>{agent.name[0]}</div>
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

// ── Mission Control: Performance ─────────────────────────────────────

interface AgentBudget {
  agent_id: string
  cost_usd: number          // all-time
  tokens_used: number       // all-time
  cost_usd_today: number    // today only
  tokens_used_today: number
  max_cost_usd_today: number
  max_cost_per_task: number
  day_started_at: string
}

function PerformanceView({ agents, tasksV2 }: { agents: Agent[]; tasksV2: AgentTaskV2[] }) {
  const [budgets, setBudgets] = useState<AgentBudget[]>([])

  // Fetch real budget data from agent_budgets table
  useEffect(() => {
    let mounted = true
    const fetchBudgets = async () => {
      const { data } = await supabase
        .from('agent_budgets')
        .select('agent_id,cost_usd,tokens_used,cost_usd_today,tokens_used_today,max_cost_usd_today,max_cost_per_task,day_started_at')
      if (mounted && data) setBudgets(data as AgentBudget[])
    }
    fetchBudgets()
    const interval = setInterval(fetchBudgets, 10000) // refresh every 10s
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  const agentStats = useMemo(() => {
    return agents.map(a => {
      const tasks = tasksV2.filter(t => t.assigned_agent_id === a.id)
      const done = tasks.filter(t => t.status === 'done').length
      const failed = tasks.filter(t => t.status === 'failed').length
      const total = done + failed
      // REAL cost data from agent_budgets (not summed from tasks which had bug)
      const budget = budgets.find(b => b.agent_id === a.id)
      const costToday = Number(budget?.cost_usd_today || 0)
      const costAllTime = Number(budget?.cost_usd || 0)
      const tokensToday = Number(budget?.tokens_used_today || 0)
      const tokensAllTime = Number(budget?.tokens_used || 0)
      const dailyCap = Number(budget?.max_cost_usd_today || 5)
      const capPct = dailyCap > 0 ? Math.round((costToday / dailyCap) * 100) : 0
      return {
        ...a, done, failed, total,
        successRate: total > 0 ? Math.round((done / total) * 100) : 0,
        costToday, costAllTime, tokensToday, tokensAllTime, dailyCap, capPct,
        inProgress: tasks.filter(t => t.status === 'in_progress' || t.status === 'claimed').length,
        backlog: tasks.filter(t => t.status === 'ready' || t.status === 'backlog').length,
      }
    }).sort((a, b) => b.done - a.done)
  }, [agents, tasksV2, budgets])

  const totals = useMemo(() => ({
    done: agentStats.reduce((a, s) => a + s.done, 0),
    failed: agentStats.reduce((a, s) => a + s.failed, 0),
    tokensToday: agentStats.reduce((a, s) => a + s.tokensToday, 0),
    tokensAllTime: agentStats.reduce((a, s) => a + s.tokensAllTime, 0),
    costToday: agentStats.reduce((a, s) => a + s.costToday, 0),
    costAllTime: agentStats.reduce((a, s) => a + s.costAllTime, 0),
    dailyCap: agentStats.reduce((a, s) => a + s.dailyCap, 0),
  }), [agentStats])

  const orgCapPct = totals.dailyCap > 0 ? Math.round((totals.costToday / totals.dailyCap) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Real-time spend cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-green-600">{totals.done}</p>
            <p className="text-xs text-muted-foreground mt-1">Tareas completadas</p>
          </CardContent>
        </Card>
        <Card className={orgCapPct >= 80 ? 'border-red-500' : orgCapPct >= 50 ? 'border-amber-500' : ''}>
          <CardContent className="pt-6 text-center">
            <p className={`text-3xl font-bold ${orgCapPct >= 80 ? 'text-red-600' : orgCapPct >= 50 ? 'text-amber-600' : 'text-blue-600'}`}>
              ${totals.costToday.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Gastado hoy</p>
            <p className="text-[10px] text-muted-foreground mt-1">Cap: ${totals.dailyCap.toFixed(0)} ({orgCapPct}%)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold">${totals.costAllTime.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">Gasto total acumulado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold">{totals.tokensToday.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Tokens hoy</p>
            <p className="text-[10px] text-muted-foreground mt-1">{(totals.tokensAllTime / 1000).toFixed(0)}K acumulados</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-agent table — REAL cost data from agent_budgets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Costos reales por agente</span>
            <span className="text-[10px] font-normal text-muted-foreground">Datos en vivo desde agent_budgets · refresh 10s</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Agente</th>
                  <th className="pb-2 font-medium">Modelo</th>
                  <th className="pb-2 font-medium text-center">Done</th>
                  <th className="pb-2 font-medium text-center">In Progress</th>
                  <th className="pb-2 font-medium text-right">$ Hoy</th>
                  <th className="pb-2 font-medium text-center">% Cap</th>
                  <th className="pb-2 font-medium text-right">$ Total</th>
                  <th className="pb-2 font-medium text-right">Tokens hoy</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {agentStats.map(a => {
                  const TierIcon = a.tier === 'manager' ? Crown : a.tier === 'team_lead' ? UserCog : User
                  const modelBadge = (a.model || '').includes('opus') ? 'opus' : (a.model || '').includes('haiku') ? 'haiku' : (a.model || '').includes('sonnet') ? 'sonnet' : '?'
                  const modelColor = modelBadge === 'opus' ? 'bg-purple-100 text-purple-700' : modelBadge === 'haiku' ? 'bg-green-100 text-green-700' : modelBadge === 'sonnet' ? 'bg-blue-100 text-blue-700' : ''
                  return (
                    <tr key={a.id} className="hover:bg-muted/30">
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <TierIcon className={`h-3.5 w-3.5 ${a.tier === 'manager' ? 'text-purple-500' : a.tier === 'team_lead' ? 'text-blue-500' : 'text-gray-400'}`} />
                          <span className="font-medium">{a.name}</span>
                        </div>
                      </td>
                      <td><Badge variant="secondary" className={`text-[10px] ${modelColor}`}>{modelBadge}</Badge></td>
                      <td className="text-center font-medium text-green-600">{a.done}</td>
                      <td className="text-center text-blue-600">{a.inProgress}</td>
                      <td className="text-right font-medium tabular-nums">${a.costToday.toFixed(4)}</td>
                      <td className="text-center">
                        <span className={`font-medium ${a.capPct >= 80 ? 'text-red-600' : a.capPct >= 50 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {a.capPct}%
                        </span>
                      </td>
                      <td className="text-right text-muted-foreground tabular-nums">${a.costAllTime.toFixed(2)}</td>
                      <td className="text-right text-muted-foreground tabular-nums">{a.tokensToday.toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">
            💡 Cap diario por agente: ${agentStats[0]?.dailyCap.toFixed(0) || '5'} · Reset cada 24h · Hard stop al 100%
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────

export function Agents() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { agents, isLoading, createAgent, deleteAgent, skillRegistry, tasksV2, checkins, respondToCheckin } = useAgents()
  const [viewMode, setViewMode] = useState<'grid' | 'org' | 'activity' | 'kanban' | 'performance'>('grid')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [description, setDescription] = useState('')
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [model, setModel] = useState('claude-sonnet-4-6')
  const [temperature, setTemperature] = useState(0.7)
  const [team, setTeam] = useState('')
  const [tier, setTier] = useState<AgentTier>('worker')
  const [parentAgentId, setParentAgentId] = useState('')
  const [capabilities, setCapabilities] = useState<string[]>([])

  // Teams derived from existing agents
  const existingTeams = useMemo(() => {
    const teams = new Set(agents.map(a => a.team).filter(Boolean) as string[])
    return Array.from(teams).sort()
  }, [agents])

  // Potential parent agents (team_leads and managers)
  const potentialParents = useMemo(() =>
    agents.filter(a => a.tier === 'team_lead' || a.tier === 'manager'),
  [agents])

  useEffect(() => {
    if (role && ROLE_TEMPLATES[role]) {
      setSelectedSkills(ROLE_TEMPLATES[role].skills)
      if (!description) setDescription(ROLE_TEMPLATES[role].description)
    }
  }, [role])

  const toggleSkill = (skillName: string) => {
    setSelectedSkills(prev =>
      prev.includes(skillName) ? prev.filter(s => s !== skillName) : [...prev, skillName]
    )
  }

  const toggleCapability = (cap: string) => {
    setCapabilities(prev =>
      prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
    )
  }

  const resetForm = () => {
    setName(''); setRole(''); setDescription(''); setSelectedSkills([])
    setModel('claude-sonnet-4-6'); setTemperature(0.7); setTeam('')
    setTier('worker'); setParentAgentId(''); setCapabilities([])
    setSkillsOpen(false)
  }

  const handleCreate = async () => {
    if (!name || !role) return
    setCreating(true)
    try {
      const agent = await createAgent(name, role, description, selectedSkills, {
        model,
        model_provider: MODEL_OPTIONS.find(m => m.value === model)?.provider || 'anthropic',
        temperature,
        team: team || undefined,
        tier,
        parent_agent_id: parentAgentId || undefined,
        capabilities,
      } as Partial<Agent>)
      if (agent) {
        setIsCreateOpen(false)
        resetForm()
      }
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleting(id)
    try { await deleteAgent(id) } finally { setDeleting(null) }
  }

  const skillsByCategory = skillRegistry
    .filter(s => !s.is_system)
    .reduce((acc, s) => {
      if (!acc[s.category]) acc[s.category] = []
      acc[s.category].push(s)
      return acc
    }, {} as Record<string, typeof skillRegistry>)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* App Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent transition-colors"
              title="Volver al inicio"
            >
              <Home className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-purple-500" />
              <span className="font-heading font-semibold text-lg">Agentes IA</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <span className="text-sm text-muted-foreground">{user?.email}</span>
          </div>
        </div>
      </header>

      <motion.div
        className="max-w-7xl mx-auto p-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
      {/* Content Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight font-heading">Agentes IA</h1>
          <p className="text-muted-foreground mt-1">
            {agents.length} agentes &middot; {agents.filter(a => a.availability === 'available').length} disponibles &middot; {agents.filter(a => a.availability === 'working').length} trabajando
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={viewMode} onValueChange={v => setViewMode(v as typeof viewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="grid" className="h-6 px-2 text-xs"><LayoutGrid className="h-3.5 w-3.5 mr-1" />Grid</TabsTrigger>
              <TabsTrigger value="org" className="h-6 px-2 text-xs"><Network className="h-3.5 w-3.5 mr-1" />Org</TabsTrigger>
              <TabsTrigger value="activity" className="h-6 px-2 text-xs"><Radio className="h-3.5 w-3.5 mr-1" />Actividad</TabsTrigger>
              <TabsTrigger value="kanban" className="h-6 px-2 text-xs"><ListTodo className="h-3.5 w-3.5 mr-1" />Kanban</TabsTrigger>
              <TabsTrigger value="performance" className="h-6 px-2 text-xs"><BarChart3 className="h-3.5 w-3.5 mr-1" />Rendimiento</TabsTrigger>
            </TabsList>
          </Tabs>
          <Dialog open={isCreateOpen} onOpenChange={v => { setIsCreateOpen(v); if (!v) resetForm() }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Crear Agente</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Crear Agente</DialogTitle>
                <DialogDescription>Configura un nuevo miembro de tu equipo AI</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* Name + Role row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="agent-name">Nombre</Label>
                    <Input id="agent-name" placeholder="ej. Sofia" value={name} onChange={e => setName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Rol</Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Descripción</Label>
                  <Textarea placeholder="¿Qué debería hacer este agente?" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
                </div>

                {/* Model + Temperature */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Modelo LLM</Label>
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MODEL_OPTIONS.map(m => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Temperatura: {temperature}</Label>
                    <Slider
                      value={[temperature]}
                      onValueChange={v => setTemperature(v[0])}
                      min={0} max={1} step={0.1}
                      className="mt-2"
                    />
                  </div>
                </div>

                {/* Tier + Team */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Nivel</Label>
                    <Select value={tier} onValueChange={v => setTier(v as AgentTier)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIER_OPTIONS.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Equipo</Label>
                    <Input
                      placeholder="ej. sales, product"
                      value={team}
                      onChange={e => setTeam(e.target.value)}
                      list="team-suggestions"
                    />
                    <datalist id="team-suggestions">
                      {existingTeams.map(t => <option key={t} value={t} />)}
                    </datalist>
                  </div>
                </div>

                {/* Parent Agent */}
                {potentialParents.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Reporta a</Label>
                    <Select value={parentAgentId} onValueChange={setParentAgentId}>
                      <SelectTrigger><SelectValue placeholder="Sin jefe (reporta a Chief)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin jefe (reporta a Chief)</SelectItem>
                        {potentialParents.map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.name} ({a.tier})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Capabilities */}
                <div className="space-y-1.5">
                  <Label>Capacidades</Label>
                  <div className="flex flex-wrap gap-2">
                    {CAPABILITY_OPTIONS.map(cap => (
                      <label key={cap.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <Checkbox
                          checked={capabilities.includes(cap.value)}
                          onCheckedChange={() => toggleCapability(cap.value)}
                        />
                        {cap.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Skills */}
                <div>
                  <Button variant="outline" size="sm" className="w-full justify-between" type="button" onClick={() => setSkillsOpen(!skillsOpen)}>
                    Skills ({selectedSkills.length} seleccionados)
                    <ChevronDown className={`h-4 w-4 transition-transform ${skillsOpen ? 'rotate-180' : ''}`} />
                  </Button>
                  {skillsOpen && (
                    <div className="mt-2 space-y-3 max-h-[200px] overflow-y-auto border rounded-md p-3">
                      {Object.entries(skillsByCategory).map(([category, skills]) => (
                        <div key={category}>
                          <p className="text-xs font-medium text-muted-foreground uppercase mb-1">{category}</p>
                          <div className="space-y-0.5">
                            {skills.map(skill => (
                              <label key={skill.name} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                                <Checkbox checked={selectedSkills.includes(skill.name)} onCheckedChange={() => toggleSkill(skill.name)} />
                                <span className="flex-1 text-xs">{skill.display_name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setIsCreateOpen(false); resetForm() }}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={creating || !name || !role}>
                  {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creando...</> : 'Crear Agente'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Content */}
      {agents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Bot className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Aún no hay agentes</h3>
            <p className="text-muted-foreground text-sm mb-4">Crea tu primer agente de IA para comenzar</p>
            <Button onClick={() => setIsCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Crear Agente</Button>
          </CardContent>
        </Card>
      ) : viewMode === 'org' ? (
        <OrgChartView agents={agents} onNavigate={id => navigate(`/agents/${id}`)} />
      ) : viewMode === 'activity' ? (
        <ActivityView agents={agents} checkins={checkins} respondToCheckin={respondToCheckin} />
      ) : viewMode === 'kanban' ? (
        <KanbanView tasks={tasksV2} agents={agents} />
      ) : viewMode === 'performance' ? (
        <PerformanceView agents={agents} tasksV2={tasksV2} />
      ) : (
        <GridView
          agents={agents}
          onNavigate={id => navigate(`/agents/${id}`)}
          onDelete={handleDelete}
          deleting={deleting}
        />
      )}
    </motion.div>
    </div>
  )
}
