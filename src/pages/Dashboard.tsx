import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Fade, Zoom } from 'react-awesome-reveal'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { useCadence } from '@/contexts/CadenceContext'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { useMode } from '@/contexts/ModeContext'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Workflow,
  Users,
  MessageSquare,
  TrendingUp,
  Plus,
  Upload,
  ArrowRight,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  UserPlus,
  ThumbsUp,
  MessageCircle,
  Mail,
  Phone,
  ClipboardList,
  Activity,
  Reply,
  Eye,
  Star,
  Target,
} from 'lucide-react'
import { LinkedInUsageWidget } from '@/components/dashboard/LinkedInUsageWidget'
import { AgentsWidget } from '@/components/dashboard/AgentsWidget'

/* ── Micro-animation #7: Hover-glow card wrapper ─────────────────────── */
function GlowCard({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <motion.div
      className={cn('relative group', className)}
      whileHover={{ scale: 1.015, boxShadow: '0 0 24px rgba(99,102,241,0.15)' }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={onClick}
    >
      {children}
    </motion.div>
  )
}

/* ── Micro-animation #8: Counting number animation ───────────────────── */
function AnimatedNumber({ value }: { value: number | string }) {
  const numVal = typeof value === 'string' ? parseInt(value) || 0 : value
  const [display, setDisplay] = useState(0)
  const ref = useRef<number>(0)

  useEffect(() => {
    const start = ref.current
    const end = numVal
    if (start === end) { setDisplay(end); return }
    const duration = 600
    const startTime = performance.now()
    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // easeOutCubic
      setDisplay(Math.round(start + (end - start) * eased))
      if (progress < 1) requestAnimationFrame(animate)
      else ref.current = end
    }
    requestAnimationFrame(animate)
  }, [numVal])

  return <>{typeof value === 'string' && value.includes('%') ? `${display}%` : display}</>
}
import type { Cadence, ActivityLogEntry, StepType } from '@/types'
import { STEP_TYPE_CONFIG, CADENCE_LEAD_STATUS_CONFIG } from '@/types'

// Step icons mapping
const STEP_ICONS: Record<StepType, React.ComponentType<{ className?: string }>> = {
  linkedin_message: MessageSquare,
  linkedin_connect: UserPlus,
  linkedin_like: ThumbsUp,
  linkedin_comment: MessageCircle,
  send_email: Mail,
  email_reply: Reply,
  whatsapp: Phone,
  cold_call: Phone,
  task: ClipboardList,
  linkedin_profile_view: Eye,
}

// Action icons mapping
const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  linkedin_message: MessageSquare,
  linkedin_connect: UserPlus,
  linkedin_like: ThumbsUp,
  linkedin_comment: MessageCircle,
  send_email: Mail,
  whatsapp: Phone,
  cold_call: Phone,
  task: ClipboardList,
  lead_created: Users,
  lead_assigned: Workflow,
  cadence_activated: Workflow,
  default: Activity,
}

export function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { orgId } = useOrg()
  const { setMode } = useMode()
  const { cadences, leads, isLoading } = useCadence()

  const [selectedCadence, setSelectedCadence] = useState<Cadence | null>(null)
  const [isCadenceDetailOpen, setIsCadenceDetailOpen] = useState(false)
  const [activityListRef] = useAutoAnimate()

  // Fetch activity logs
  const { data: activityLogs = [] } = useQuery({
    queryKey: ['activity-logs', orgId, user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('org_id', orgId!)
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) {
        console.error('Error fetching activity logs:', error)
        return []
      }
      return (data || []) as ActivityLogEntry[]
    },
    enabled: !!user && !!orgId,
  })

  // Calculate stats
  const activeCadences = cadences.filter((c) => c.status === 'active').length
  const activeLeads = leads.filter((l) => l.status === 'active').length
  const pendingLeads = leads.filter((l) => l.status === 'pending').length
  const totalLeads = activeLeads + pendingLeads

  // Calculate messages sent this week
  const oneWeekAgo = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() - 7)
    return date.toISOString()
  }, [])

  const messagesSentThisWeek = useMemo(() => {
    return activityLogs.filter(
      (log) =>
        log.created_at >= oneWeekAgo &&
        (log.action === 'linkedin_message' ||
          log.action === 'send_email') &&
        log.status === 'ok'
    ).length
  }, [activityLogs, oneWeekAgo])

  // Calculate response rate
  const responseRate = useMemo(() => {
    const messageActions = activityLogs.filter(
      (log) =>
        log.action === 'linkedin_message' ||
        log.action === 'send_email'
    )
    const successfulMessages = messageActions.filter((log) => log.status === 'ok').length
    const totalMessages = messageActions.length

    if (totalMessages === 0) return '0%'
    const rate = Math.round((successfulMessages / totalMessages) * 100)
    return `${rate}%`
  }, [activityLogs])

  // Get per-cadence statistics
  const getCadenceStats = (cadence: Cadence) => {
    const cadenceLeads = leads.filter((l) => l.cadence_id === cadence.id)
    const cadenceActivities = activityLogs.filter((log) => log.cadence_id === cadence.id)

    const messagesSent = cadenceActivities.filter(
      (log) =>
        (log.action === 'linkedin_message' ||
          log.action === 'send_email') &&
        log.status === 'ok'
    ).length

    const connectionsSent = cadenceActivities.filter(
      (log) => log.action === 'linkedin_connect' && log.status === 'ok'
    ).length

    const likesComments = cadenceActivities.filter(
      (log) =>
        (log.action === 'linkedin_like' || log.action === 'linkedin_comment') &&
        log.status === 'ok'
    ).length

    const successfulActions = cadenceActivities.filter((log) => log.status === 'ok').length
    const totalActions = cadenceActivities.length
    const successRate =
      totalActions > 0 ? Math.round((successfulActions / totalActions) * 100) : 0

    // Get leads at each step
    const leadsPerStep: Record<string, number> = {}
    cadence.steps?.forEach((step) => {
      leadsPerStep[step.id] = cadenceLeads.filter(
        (l) => l.current_step_id === step.id
      ).length
    })

    return {
      totalLeads: cadenceLeads.length,
      activeLeads: cadenceLeads.filter((l) => l.status === 'active').length,
      messagesSent,
      connectionsSent,
      likesComments,
      successRate,
      leadsPerStep,
    }
  }

  // Recent activities (last 10)
  const recentActivities = activityLogs.slice(0, 10)

  // Get lead name by ID
  const getLeadName = (leadId: string | null) => {
    if (!leadId) return 'Lead Desconocido'
    const lead = leads.find((l) => l.id === leadId)
    return lead ? `${lead.first_name} ${lead.last_name}` : 'Lead Desconocido'
  }

  // Get cadence name by ID
  const getCadenceName = (cadenceId: string | null) => {
    if (!cadenceId) return null
    const cadence = cadences.find((c) => c.id === cadenceId)
    return cadence?.name || null
  }

  // Format action for display
  const formatAction = (action: string) => {
    const actionMap: Record<string, string> = {
      linkedin_message: 'Mensaje LinkedIn',
      linkedin_connect: 'Solicitud de Conexión',
      linkedin_like: 'Like en LinkedIn',
      linkedin_comment: 'Comentario LinkedIn',
      send_email: 'Email',
      whatsapp: 'WhatsApp',
      cold_call: 'Llamada en Frío',
      task: 'Tarea',
      lead_created: 'Lead Creado',
      lead_assigned: 'Lead Asignado',
      cadence_activated: 'Cadencia Activada',
    }
    return actionMap[action] || action.replace(/_/g, ' ')
  }

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Ahora mismo'
    if (diffMins < 60) return `hace ${diffMins}m`
    if (diffHours < 24) return `hace ${diffHours}h`
    if (diffDays < 7) return `hace ${diffDays}d`
    return date.toLocaleDateString()
  }

  // Handle cadence click
  const handleCadenceClick = (cadence: Cadence) => {
    setSelectedCadence(cadence)
    setIsCadenceDetailOpen(true)
  }

  // Stats cards configuration
  const stats = [
    {
      title: 'Cadencias Activas',
      value: activeCadences,
      total: cadences.length,
      icon: Workflow,
      description: 'Secuencias en ejecución',
      onClick: () => navigate('/cadences'),
    },
    {
      title: 'Total Leads',
      value: totalLeads,
      icon: Users,
      description: `${activeLeads} activos, ${pendingLeads} pendientes`,
      onClick: () => navigate('/leads'),
    },
    {
      title: 'Mensajes Enviados',
      value: messagesSentThisWeek,
      icon: MessageSquare,
      description: 'Esta semana',
      onClick: () => navigate('/admin/logs'),
    },
    {
      title: 'Tasa de Respuesta',
      value: responseRate,
      icon: TrendingUp,
      description: 'Promedio entre cadencias',
      onClick: () => navigate('/admin/metrics'),
    },
  ]

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <motion.div
      className="p-8"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {/* ── World Switcher ─────────────────────────────────────────────── */}
      <div className="mb-8 grid grid-cols-2 gap-4">
        {/* SDR / Prospecting — active world */}
        <div className="flex items-center gap-4 rounded-xl border-2 border-primary/25 bg-primary/5 p-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Target className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm">SDR / Prospección</p>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">Activo</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Cadencias, leads, mapeo de cuentas, outreach</p>
          </div>
        </div>

        {/* Account Executive — switch to AE mode */}
        <div
          className="flex cursor-pointer items-center gap-4 rounded-xl border-2 border-border hover:border-amber-400/60 hover:bg-amber-50/40 dark:hover:bg-amber-900/10 p-5 transition-all group"
          onClick={() => { setMode('ae'); navigate('/account-executive') }}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted group-hover:bg-amber-100/60 dark:group-hover:bg-amber-900/20 transition-colors">
            <Star className="h-6 w-6 text-muted-foreground group-hover:text-amber-500 transition-colors" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm group-hover:text-amber-600 transition-colors">Ejecutivo de Cuenta</p>
            <p className="text-xs text-muted-foreground mt-0.5">Llamadas, calendario, seguimiento por email</p>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-amber-500 shrink-0 transition-colors" />
        </div>
      </div>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight font-heading">Dashboard</h1>
          <p className="text-muted-foreground">Resumen de tu automatización de ventas</p>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/leads')}>
            <Upload className="mr-2 h-4 w-4" />
            Importar Leads
          </Button>
          <Button onClick={() => navigate('/cadences')}>
            <Plus className="mr-2 h-4 w-4" />
            Crear Cadencia
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.08, duration: 0.35, ease: 'easeOut' }}
          >
          <GlowCard onClick={stat.onClick}>
          <Card
            className={cn(
              'cursor-pointer transition-shadow hover:shadow-md',
              index === 0 && 'featured-card-gradient text-white border-0'
            )}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className={cn("text-sm font-medium", index === 0 ? "text-white/80" : "text-muted-foreground")}>
                {stat.title}
              </CardTitle>
              <stat.icon className={cn("h-4 w-4", index === 0 ? "text-white/80" : "text-muted-foreground")} />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", index === 0 && "text-white")}>
                <AnimatedNumber value={stat.value} />
                {stat.total !== undefined && (
                  <span className={cn("text-sm font-normal", index === 0 ? "text-white/70" : "text-muted-foreground")}>
                    /{stat.total}
                  </span>
                )}
              </div>
              <p className={cn("text-xs", index === 0 ? "text-white/70" : "text-muted-foreground")}>{stat.description}</p>
            </CardContent>
          </Card>
          </GlowCard>
          </motion.div>
        ))}
      </div>

      {/* ── Agentes IA — Hero Section ──────────────────────────────── */}
      <Fade triggerOnce duration={500} className="mt-6">
        <AgentsWidget />
      </Fade>

      {/* LinkedIn Usage */}
      <div className="mt-6">
        <Zoom triggerOnce duration={400} delay={100}>
          <LinkedInUsageWidget />
        </Zoom>
      </div>

      {/* Quick Links */}
      <div className="mt-6 flex gap-4">
        <Button variant="link" className="p-0" onClick={() => navigate('/cadences')}>
          Ver Todas las Cadencias
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
        <Button variant="link" className="p-0" onClick={() => navigate('/leads')}>
          Ver Todos los Leads
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
        <Button variant="link" className="p-0" onClick={() => navigate('/inbox')}>
          Inbox LinkedIn
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
        <Button variant="link" className="p-0" onClick={() => navigate('/outreach')}>
          Actividad de Outreach
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Recent Cadences */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Cadencias Recientes</CardTitle>
              <CardDescription>Haz clic para ver detalles y estadísticas</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/cadences')}>
              Ver Todas
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {cadences.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Workflow className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="mb-2 text-sm text-muted-foreground">Aún no hay cadencias</p>
                <Button onClick={() => navigate('/cadences')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Crear Primera Cadencia
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {cadences.slice(0, 5).map((cadence) => {
                  const stats = getCadenceStats(cadence)
                  return (
                    <div
                      key={cadence.id}
                      className="flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50"
                      onClick={() => handleCadenceClick(cadence)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{cadence.name}</p>
                          <Badge
                            variant={cadence.status === 'active' ? 'default' : 'secondary'}
                          >
                            {cadence.status}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{cadence.steps?.length || 0} pasos</span>
                          <span>{stats.activeLeads} leads activos</span>
                          <span>{stats.messagesSent} mensajes enviados</span>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity Feed */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Actividad Reciente</CardTitle>
              <CardDescription>Últimas 10 acciones en todas las cadencias</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/logs')}>
              Ver Todo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Activity className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Aún no hay actividad</p>
                <p className="text-xs text-muted-foreground mt-1">
                  La actividad aparecerá aquí cuando empieces a usar cadencias
                </p>
              </div>
            ) : (
              <div className="relative">
              <ScrollArea className="h-[400px]">
                <div ref={activityListRef} className="space-y-3 pb-6">
                  {recentActivities.map((activity) => {
                    const ActionIcon =
                      ACTION_ICONS[activity.action] || ACTION_ICONS.default
                    const cadenceName = getCadenceName(activity.cadence_id)

                    return (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50"
                        onClick={() => {
                          if (activity.cadence_id) {
                            const cadence = cadences.find(
                              (c) => c.id === activity.cadence_id
                            )
                            if (cadence) {
                              navigate(`/cadences/${cadence.id}`)
                            }
                          }
                        }}
                      >
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full ${
                            activity.status === 'ok'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                              : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                          }`}
                        >
                          <ActionIcon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">
                              {formatAction(activity.action)}
                            </p>
                            {activity.status === 'ok' ? (
                              <CheckCircle className="h-3 w-3 text-green-600" />
                            ) : (
                              <XCircle className="h-3 w-3 text-red-600" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {getLeadName(activity.lead_id)}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(activity.created_at)}
                            </span>
                            {cadenceName && (
                              <>
                                <span className="text-muted-foreground">|</span>
                                <span className="text-xs text-muted-foreground truncate">
                                  {cadenceName}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-card to-transparent" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Leads */}
      <div className="mt-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Leads Recientes</CardTitle>
              <CardDescription>Últimos contactos agregados</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/leads')}>
              Ver Todo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Users className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="mb-2 text-sm text-muted-foreground">Aún no hay leads</p>
                <Button onClick={() => navigate('/leads')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar Primer Lead
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left text-sm text-muted-foreground">
                      <th className="pb-3 font-medium">Nombre</th>
                      <th className="pb-3 font-medium">Empresa</th>
                      <th className="pb-3 font-medium">Cadencia</th>
                      <th className="pb-3 font-medium">Estado</th>
                      <th className="pb-3 font-medium">Agregado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {leads.slice(0, 5).map((lead) => {
                      const cadence = cadences.find((c) => c.id === lead.cadence_id)
                      return (
                        <tr
                          key={lead.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate('/leads')}
                        >
                          <td className="py-3">
                            <p className="font-medium">
                              {lead.first_name} {lead.last_name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {lead.email || 'Sin email'}
                            </p>
                          </td>
                          <td className="py-3 text-sm">
                            {lead.company || '-'}
                          </td>
                          <td className="py-3 text-sm">
                            {cadence ? (
                              <Badge variant="outline">{cadence.name}</Badge>
                            ) : (
                              <span className="text-muted-foreground">Sin asignar</span>
                            )}
                          </td>
                          <td className="py-3">
                            <Badge
                              variant={
                                lead.status === 'active'
                                  ? 'default'
                                  : lead.status === 'failed'
                                  ? 'destructive'
                                  : lead.status === 'completed'
                                  ? 'secondary'
                                  : 'outline'
                              }
                            >
                              {CADENCE_LEAD_STATUS_CONFIG[lead.status || 'pending']?.label ||
                                lead.status}
                            </Badge>
                          </td>
                          <td className="py-3 text-sm text-muted-foreground">
                            {new Date(lead.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cadence Detail Dialog */}
      <Dialog open={isCadenceDetailOpen} onOpenChange={setIsCadenceDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  {selectedCadence?.name}
                  <Badge
                    variant={
                      selectedCadence?.status === 'active' ? 'default' : 'secondary'
                    }
                  >
                    {selectedCadence?.status}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {selectedCadence?.description || 'Detalles y estadísticas de la cadencia'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedCadence && (
            <div className="flex-1 overflow-y-auto space-y-6 py-4">
              {/* Cadence Stats */}
              {(() => {
                const stats = getCadenceStats(selectedCadence)
                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-2xl font-bold">{stats.totalLeads}</p>
                        <p className="text-xs text-muted-foreground">Total Leads</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-2xl font-bold">{stats.messagesSent}</p>
                        <p className="text-xs text-muted-foreground">Mensajes Enviados</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-2xl font-bold">{stats.connectionsSent}</p>
                        <p className="text-xs text-muted-foreground">Conexiones</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-2xl font-bold">{stats.successRate}%</p>
                        <p className="text-xs text-muted-foreground">Tasa de Éxito</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-xl font-bold">{stats.likesComments}</p>
                        <p className="text-xs text-muted-foreground">Likes/Comentarios</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-xl font-bold">{stats.activeLeads}</p>
                        <p className="text-xs text-muted-foreground">Leads Activos</p>
                      </div>
                    </div>

                    {/* Steps with Lead Counts */}
                    <div>
                      <h3 className="font-medium mb-3"> Pasos ({selectedCadence.steps?.length || 0})</h3>
                      {selectedCadence.steps && selectedCadence.steps.length > 0 ? (
                        <div className="space-y-2">
                          {[...selectedCadence.steps]
                            .sort((a, b) => {
                              if (a.day_offset !== b.day_offset)
                                return a.day_offset - b.day_offset
                              return a.order_in_day - b.order_in_day
                            })
                            .map((step, index) => {
                              const Icon = STEP_ICONS[step.step_type]
                              const config = STEP_TYPE_CONFIG[step.step_type]
                              const leadsAtStep = stats.leadsPerStep[step.id] || 0

                              return (
                                <div
                                  key={step.id}
                                  className="flex items-center gap-3 rounded-lg border p-3"
                                >
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-medium">
                                    {index + 1}
                                  </div>
                                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                                    <Icon className="h-4 w-4" />
                                  </div>
                                  <div className="flex-1">
                                    <p className="font-medium text-sm">{step.step_label}</p>
                                    <p className="text-xs text-muted-foreground">
                                      Día {step.day_offset} | {config.channel}
                                    </p>
                                  </div>
                                  <Badge variant="outline">
                                    {leadsAtStep} leads
                                  </Badge>
                                </div>
                              )
                            })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Aún no hay pasos definidos
                        </p>
                      )}
                    </div>
                  </>
                )
              })()}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsCadenceDetailOpen(false)}
            >
              Cerrar
            </Button>
            <Button
              onClick={() => {
                if (selectedCadence) {
                  navigate(`/cadences/${selectedCadence.id}`)
                }
              }}
            >
              Editar Cadencia
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
