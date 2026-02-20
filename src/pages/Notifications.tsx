import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Bell,
  CheckCheck,
  MessageSquare,
  Mail,
  Zap,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  UserMinus,
  Play,
  Pause,
  Loader2,
  Eye,
  ListTodo,
  UserPlus,
  ThumbsUp,
  MessageCircle,
  Phone,
  PhoneCall,
  ClipboardList,
  Clock,
} from 'lucide-react'
import type { AppNotification } from '@/types'
import { STEP_TYPE_CONFIG, type StepType } from '@/types'

// ── Notification config ──

const NOTIFICATION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  reply_detected: MessageSquare,
  cadence_completed: CheckCircle,
  step_failed: AlertTriangle,
  automation_started: Zap,
  email_opened: Eye,
  message_read: CheckCheck,
}

const NOTIFICATION_COLORS: Record<string, string> = {
  reply_detected: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cadence_completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  step_failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  automation_started: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  email_opened: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  message_read: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}

// ── Step type config for Tasks ──

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  linkedin_message: MessageSquare,
  linkedin_connect: UserPlus,
  linkedin_like: ThumbsUp,
  linkedin_comment: MessageCircle,
  send_email: Mail,
  whatsapp: Phone,
  cold_call: PhoneCall,
  task: ClipboardList,
}

const STEP_COLOR_CLASSES: Record<string, string> = {
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  cyan: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  teal: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
}

// ── Types ──

interface TodayTask {
  id: string
  cadence_id: string
  cadence_step_id: string
  lead_id: string
  scheduled_at: string
  status: string
  lead: { id: string; first_name: string; last_name: string; company: string | null; title: string | null } | null
  cadence_step: { id: string; step_type: string; step_label: string; day_offset: number } | null
  cadence: { id: string; name: string } | null
}

// ── Helpers ──

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'hace un momento'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `hace ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  return `hace ${days}d`
}

export function Notifications() {
  const { user } = useAuth()
  const { orgId } = useOrg()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [actionTakenIds, setActionTakenIds] = useState<Set<string>>(new Set())
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'tareas' | 'actividad'>('tareas')

  // ── Notifications query ──

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', orgId],
    queryFn: async () => {
      if (!user?.id) return []
      const { data, error } = await supabase
        .from('notifications')
        .select('*, lead:leads(first_name, last_name, company), cadence:cadences(name)')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data || []) as AppNotification[]
    },
    enabled: !!user?.id && !!orgId,
    refetchInterval: 30000,
  })

  // ── Today's tasks query ──

  const { data: todayTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['today-tasks', orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return []

      // End of today (browser local time) — we include overdue items too
      const now = new Date()
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

      const { data, error } = await supabase
        .from('schedules')
        .select(`
          id, cadence_id, cadence_step_id, lead_id, scheduled_at, status,
          lead:leads(id, first_name, last_name, company, title),
          cadence_step:cadence_steps(id, step_type, step_label, day_offset),
          cadence:cadences(id, name)
        `)
        .eq('org_id', orgId)
        .eq('status', 'scheduled')
        .lt('scheduled_at', endOfDay.toISOString())
        .order('scheduled_at', { ascending: true })

      if (error) throw error
      return (data || []) as unknown as TodayTask[]
    },
    enabled: !!user?.id && !!orgId,
    refetchInterval: 30000,
  })

  // Split overdue vs today
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const overdueTasks = todayTasks.filter(t => new Date(t.scheduled_at) < startOfDay)
  const todayOnlyTasks = todayTasks.filter(t => new Date(t.scheduled_at) >= startOfDay)

  // ── Mutations ──

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('org_id', orgId!)
        .eq('is_read', false)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })

  const unreadCount = notifications.filter((n) => !n.is_read).length

  // ── Reply notification action handlers ──

  const handleRemoveFromCadence = async (notification: AppNotification) => {
    if (!notification.lead_id || !notification.cadence_id) return
    setProcessingId(notification.id)
    try {
      await supabase
        .from('cadence_leads')
        .update({ status: 'replied', updated_at: new Date().toISOString() })
        .eq('lead_id', notification.lead_id)
        .eq('cadence_id', notification.cadence_id)

      await supabase
        .from('notifications')
        .update({
          is_read: true,
          metadata: { ...(notification.metadata as Record<string, unknown>), action_taken: 'removed' },
        })
        .eq('id', notification.id)

      setActionTakenIds((prev) => new Set(prev).add(notification.id))
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['cadences'] })
      toast.success('Lead removido de la cadencia')
    } catch {
      toast.error('Error al remover lead')
    } finally {
      setProcessingId(null)
    }
  }

  const handleResumeInCadence = async (notification: AppNotification) => {
    if (!notification.lead_id || !notification.cadence_id || !user?.id) return
    setProcessingId(notification.id)
    try {
      const { data: cadenceLead } = await supabase
        .from('cadence_leads')
        .select('current_step_id')
        .eq('lead_id', notification.lead_id)
        .eq('cadence_id', notification.cadence_id)
        .single()

      if (!cadenceLead?.current_step_id) {
        toast.error('No se encontro el step actual del lead')
        setProcessingId(null)
        return
      }

      await supabase
        .from('cadence_leads')
        .update({ status: 'scheduled', updated_at: new Date().toISOString() })
        .eq('lead_id', notification.lead_id)
        .eq('cadence_id', notification.cadence_id)

      const scheduleAt = new Date()
      scheduleAt.setMinutes(scheduleAt.getMinutes() + 5)

      await supabase.from('schedules').insert({
        cadence_id: notification.cadence_id,
        cadence_step_id: cadenceLead.current_step_id,
        lead_id: notification.lead_id,
        owner_id: user.id,
        org_id: orgId!,
        scheduled_at: scheduleAt.toISOString(),
        timezone: 'UTC',
        status: 'scheduled',
      })

      await supabase
        .from('notifications')
        .update({
          is_read: true,
          metadata: { ...(notification.metadata as Record<string, unknown>), action_taken: 'resumed' },
        })
        .eq('id', notification.id)

      setActionTakenIds((prev) => new Set(prev).add(notification.id))
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['cadences'] })
      toast.success('Lead reactivado en la cadencia')
    } catch {
      toast.error('Error al reactivar lead')
    } finally {
      setProcessingId(null)
    }
  }

  const handleKeepPaused = async (notification: AppNotification) => {
    setProcessingId(notification.id)
    try {
      await supabase
        .from('notifications')
        .update({
          is_read: true,
          metadata: { ...(notification.metadata as Record<string, unknown>), action_taken: 'paused' },
        })
        .eq('id', notification.id)

      setActionTakenIds((prev) => new Set(prev).add(notification.id))
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      toast.success('Lead se mantiene pausado')
    } catch {
      toast.error('Error al actualizar')
    } finally {
      setProcessingId(null)
    }
  }

  const handleNotificationClick = (notification: AppNotification) => {
    if (!notification.is_read) {
      markReadMutation.mutate(notification.id)
    }
    if (notification.type === 'reply_detected' && notification.channel === 'linkedin') {
      navigate('/inbox')
    } else if (notification.type === 'message_read') {
      navigate('/inbox')
    } else if (notification.cadence_id) {
      navigate(`/cadences/${notification.cadence_id}`)
    }
  }

  // ── Render helpers ──

  const renderTaskItem = (task: TodayTask, isOverdue: boolean) => {
    const stepType = task.cadence_step?.step_type as StepType | undefined
    const stepConfig = stepType ? STEP_TYPE_CONFIG[stepType] : null
    const StepIcon = STEP_ICONS[stepType || ''] || Clock
    const colorClass = STEP_COLOR_CLASSES[stepConfig?.color || 'gray'] || STEP_COLOR_CLASSES.gray
    const scheduledDate = new Date(task.scheduled_at)
    const formattedTime = scheduledDate.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })

    return (
      <div
        key={task.id}
        className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={() => navigate(`/cadences/${task.cadence_id}`)}
      >
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${colorClass}`}>
          <StepIcon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {task.lead ? `${task.lead.first_name} ${task.lead.last_name}` : 'Lead desconocido'}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            {task.lead?.company && (
              <span className="text-xs text-muted-foreground truncate">{task.lead.company}</span>
            )}
            {task.lead?.company && task.lead?.title && (
              <span className="text-xs text-muted-foreground">·</span>
            )}
            {task.lead?.title && (
              <span className="text-xs text-muted-foreground truncate">{task.lead.title}</span>
            )}
          </div>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          {task.cadence_step?.step_label || stepConfig?.label || 'Step'}
        </Badge>
        <span className={`text-xs shrink-0 w-20 text-right ${isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
          {isOverdue ? 'Atrasado' : formattedTime}
        </span>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight font-heading">Notificaciones</h1>
          <p className="text-muted-foreground">
            {activeTab === 'tareas'
              ? todayTasks.length > 0
                ? `${todayTasks.length} tarea${todayTasks.length !== 1 ? 's' : ''} pendiente${todayTasks.length !== 1 ? 's' : ''}${overdueTasks.length > 0 ? ` (${overdueTasks.length} atrasada${overdueTasks.length !== 1 ? 's' : ''})` : ''}`
                : 'No hay tareas pendientes'
              : unreadCount > 0
                ? `${unreadCount} notificacion${unreadCount !== 1 ? 'es' : ''} sin leer`
                : 'No hay notificaciones sin leer'}
          </p>
        </div>
        {activeTab === 'actividad' && unreadCount > 0 && (
          <Button
            variant="outline"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            Marcar todas como leidas
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'tareas' | 'actividad')}>
        <TabsList>
          <TabsTrigger value="tareas" className="gap-1.5">
            <ListTodo className="h-4 w-4" />
            Tareas
            {todayTasks.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1 h-5 px-1.5">
                {todayTasks.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="actividad" className="gap-1.5">
            <Bell className="h-4 w-4" />
            Actividad
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-xs ml-1 h-5 px-1.5">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Tareas Tab ── */}
        <TabsContent value="tareas" className="mt-4">
          {tasksLoading ? (
            <div className="py-12 text-center">
              <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Cargando tareas del dia...</p>
            </div>
          ) : todayTasks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ListTodo className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No hay tareas para hoy</h3>
                <p className="text-muted-foreground">
                  Cuando programes una cadencia con pasos automatizados, las tareas del dia apareceran aqui.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Overdue section */}
              {overdueTasks.length > 0 && (
                <Card className="border-red-200 dark:border-red-900/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-red-600 dark:text-red-400">
                      <AlertTriangle className="h-4 w-4" />
                      Atrasadas ({overdueTasks.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {overdueTasks.map((task) => renderTaskItem(task, true))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Today's tasks grouped by cadence */}
              {(() => {
                const todayByCadence = todayOnlyTasks.reduce<Record<string, { cadenceName: string; cadenceId: string; tasks: TodayTask[] }>>(
                  (acc, task) => {
                    const key = task.cadence_id
                    if (!acc[key]) {
                      acc[key] = {
                        cadenceName: task.cadence?.name || 'Cadencia desconocida',
                        cadenceId: task.cadence_id,
                        tasks: [],
                      }
                    }
                    acc[key].tasks.push(task)
                    return acc
                  },
                  {}
                )

                return Object.values(todayByCadence).map((group) => (
                  <Card key={group.cadenceId}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-violet-500" />
                          {group.cadenceName}
                          <Badge variant="secondary" className="text-xs">
                            {group.tasks.length} lead{group.tasks.length !== 1 ? 's' : ''}
                          </Badge>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => navigate(`/cadences/${group.cadenceId}`)}
                        >
                          <ExternalLink className="mr-1 h-3 w-3" />
                          Ver cadencia
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {group.tasks.map((task) => renderTaskItem(task, false))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              })()}
            </div>
          )}
        </TabsContent>

        {/* ── Actividad Tab ── */}
        <TabsContent value="actividad" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Actividad Reciente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-12 text-center">
                  <p className="text-muted-foreground">Cargando notificaciones...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    No hay notificaciones aun. Cuando un lead responda o un evento importante ocurra, aparecera aqui.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {notifications.map((notification) => {
                    const Icon = NOTIFICATION_ICONS[notification.type] || Bell
                    const colorClass = NOTIFICATION_COLORS[notification.type] || 'bg-gray-100 text-gray-700'
                    const metadata = notification.metadata as Record<string, unknown>
                    const replyPreview = metadata?.reply_preview as string | undefined
                    const actionTaken = metadata?.action_taken as string | undefined
                    const openCount = metadata?.open_count as number | undefined
                    const messagePreview = metadata?.message_preview as string | undefined
                    const showActions =
                      notification.type === 'reply_detected' &&
                      !actionTaken &&
                      !actionTakenIds.has(notification.id)

                    return (
                      <div
                        key={notification.id}
                        className={`flex items-start gap-4 rounded-lg border p-4 cursor-pointer transition-colors hover:bg-muted/50 ${
                          !notification.is_read ? 'bg-accent/30 border-primary/20' : ''
                        }`}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${colorClass}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`text-sm ${!notification.is_read ? 'font-semibold' : 'font-medium'}`}>
                              {notification.title}
                            </p>
                            {!notification.is_read && (
                              <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                            )}
                          </div>
                          {notification.body && (
                            <p className="text-sm text-muted-foreground mt-1">{notification.body}</p>
                          )}
                          {replyPreview && (
                            <div className="mt-2 rounded bg-muted p-2">
                              <p className="text-xs text-muted-foreground italic">
                                "{replyPreview}"
                              </p>
                            </div>
                          )}
                          {notification.type === 'email_opened' && openCount && openCount > 1 && (
                            <Badge variant="secondary" className="mt-1 text-xs">
                              <Eye className="mr-1 h-3 w-3" />
                              Abierto {openCount} veces
                            </Badge>
                          )}
                          {notification.type === 'message_read' && messagePreview && (
                            <div className="mt-2 rounded bg-muted p-2">
                              <p className="text-xs text-muted-foreground italic">
                                "{messagePreview}"
                              </p>
                            </div>
                          )}
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {timeAgo(notification.created_at)}
                            </span>
                            {notification.channel && (
                              <Badge variant="outline" className="text-xs">
                                {notification.channel === 'linkedin' ? (
                                  <><MessageSquare className="mr-1 h-3 w-3" /> LinkedIn</>
                                ) : notification.channel === 'email' ? (
                                  <><Mail className="mr-1 h-3 w-3" /> Email</>
                                ) : (
                                  notification.channel
                                )}
                              </Badge>
                            )}
                            {notification.cadence && (
                              <Badge variant="secondary" className="text-xs">
                                {(notification.cadence as { name: string }).name}
                              </Badge>
                            )}
                            {notification.type === 'reply_detected' && (
                              <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                                <ExternalLink className="mr-1 h-3 w-3" />
                                Ver en inbox
                              </Badge>
                            )}
                          </div>
                          {showActions && (
                            <div
                              className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="destructive"
                                size="sm"
                                className="text-xs h-7"
                                disabled={processingId === notification.id}
                                onClick={() => handleRemoveFromCadence(notification)}
                              >
                                <UserMinus className="mr-1 h-3 w-3" />
                                Sacar de cadencia
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7"
                                disabled={processingId === notification.id}
                                onClick={() => handleResumeInCadence(notification)}
                              >
                                <Play className="mr-1 h-3 w-3" />
                                Continuar en cadencia
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="text-xs h-7"
                                disabled={processingId === notification.id}
                                onClick={() => handleKeepPaused(notification)}
                              >
                                <Pause className="mr-1 h-3 w-3" />
                                Mantener pausado
                              </Button>
                              {processingId === notification.id && (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              )}
                            </div>
                          )}
                          {(actionTaken || actionTakenIds.has(notification.id)) && notification.type === 'reply_detected' && (
                            <div className="mt-2">
                              <Badge variant="outline" className="text-xs">
                                {actionTaken === 'removed' ? 'Removido de cadencia' :
                                 actionTaken === 'resumed' ? 'Continuado en cadencia' :
                                 actionTaken === 'paused' ? 'Mantenido pausado' :
                                 'Accion tomada'}
                              </Badge>
                            </div>
                          )}
                        </div>
                        {!notification.is_read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              markReadMutation.mutate(notification.id)
                            }}
                          >
                            <CheckCheck className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
