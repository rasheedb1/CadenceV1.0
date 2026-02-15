import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
} from 'lucide-react'
import type { AppNotification } from '@/types'

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
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [actionTakenIds, setActionTakenIds] = useState<Set<string>>(new Set())
  const [processingId, setProcessingId] = useState<string | null>(null)

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const { data, error } = await supabase
        .from('notifications')
        .select('*, lead:leads(first_name, last_name, company), cadence:cadences(name)')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data || []) as AppNotification[]
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  })

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
        .eq('owner_id', user.id)
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
      // Get cadence_lead to find current_step_id
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

      // Resume: set status back to 'scheduled'
      await supabase
        .from('cadence_leads')
        .update({ status: 'scheduled', updated_at: new Date().toISOString() })
        .eq('lead_id', notification.lead_id)
        .eq('cadence_id', notification.cadence_id)

      // Create a new schedule for the current step (5 min from now)
      const scheduleAt = new Date()
      scheduleAt.setMinutes(scheduleAt.getMinutes() + 5)

      await supabase.from('schedules').insert({
        cadence_id: notification.cadence_id,
        cadence_step_id: cadenceLead.current_step_id,
        lead_id: notification.lead_id,
        owner_id: user.id,
        scheduled_at: scheduleAt.toISOString(),
        timezone: 'UTC',
        status: 'scheduled',
      })

      // Mark notification as actioned
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

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight font-heading">Notificaciones</h1>
          <p className="text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} notificacion${unreadCount !== 1 ? 'es' : ''} sin leer`
              : 'No hay notificaciones sin leer'}
          </p>
        </div>
        {unreadCount > 0 && (
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
                      {/* Action buttons for reply notifications */}
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
                      {/* Show action taken label */}
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
    </div>
  )
}
