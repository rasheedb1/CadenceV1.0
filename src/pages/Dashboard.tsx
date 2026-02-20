import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { useCadence } from '@/contexts/CadenceContext'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
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
} from 'lucide-react'
import type { Cadence, ActivityLogEntry, StepType } from '@/types'
import { STEP_TYPE_CONFIG, CADENCE_LEAD_STATUS_CONFIG } from '@/types'

// Step icons mapping
const STEP_ICONS: Record<StepType, React.ComponentType<{ className?: string }>> = {
  linkedin_message: MessageSquare,
  linkedin_connect: UserPlus,
  linkedin_like: ThumbsUp,
  linkedin_comment: MessageCircle,
  send_email: Mail,
  whatsapp: Phone,
  cold_call: Phone,
  task: ClipboardList,
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
  const { cadences, leads, isLoading } = useCadence()

  const [selectedCadence, setSelectedCadence] = useState<Cadence | null>(null)
  const [isCadenceDetailOpen, setIsCadenceDetailOpen] = useState(false)

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
    if (!leadId) return 'Unknown Lead'
    const lead = leads.find((l) => l.id === leadId)
    return lead ? `${lead.first_name} ${lead.last_name}` : 'Unknown Lead'
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
      linkedin_message: 'LinkedIn Message',
      linkedin_connect: 'Connection Request',
      linkedin_like: 'LinkedIn Like',
      linkedin_comment: 'LinkedIn Comment',
      send_email: 'Email',
      whatsapp: 'WhatsApp',
      cold_call: 'Cold Call',
      task: 'Task',
      lead_created: 'Lead Created',
      lead_assigned: 'Lead Assigned',
      cadence_activated: 'Cadence Activated',
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

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
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
      title: 'Active Cadences',
      value: activeCadences,
      total: cadences.length,
      icon: Workflow,
      description: 'Running sequences',
      onClick: () => navigate('/cadences'),
    },
    {
      title: 'Total Leads',
      value: totalLeads,
      icon: Users,
      description: `${activeLeads} active, ${pendingLeads} pending`,
      onClick: () => navigate('/leads'),
    },
    {
      title: 'Messages Sent',
      value: messagesSentThisWeek,
      icon: MessageSquare,
      description: 'This week',
      onClick: () => navigate('/admin/logs'),
    },
    {
      title: 'Response Rate',
      value: responseRate,
      icon: TrendingUp,
      description: 'Average across cadences',
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
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight font-heading">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your sales automation</p>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/leads')}>
            <Upload className="mr-2 h-4 w-4" />
            Import Leads
          </Button>
          <Button onClick={() => navigate('/cadences')}>
            <Plus className="mr-2 h-4 w-4" />
            Create Cadence
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Card
            key={stat.title}
            className={cn(
              'cursor-pointer transition-shadow hover:shadow-md',
              index === 0 && 'featured-card-gradient text-white border-0'
            )}
            onClick={stat.onClick}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className={cn("text-sm font-medium", index === 0 ? "text-white/80" : "text-muted-foreground")}>
                {stat.title}
              </CardTitle>
              <stat.icon className={cn("h-4 w-4", index === 0 ? "text-white/80" : "text-muted-foreground")} />
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-bold", index === 0 && "text-white")}>
                {stat.value}
                {stat.total !== undefined && (
                  <span className={cn("text-sm font-normal", index === 0 ? "text-white/70" : "text-muted-foreground")}>
                    /{stat.total}
                  </span>
                )}
              </div>
              <p className={cn("text-xs", index === 0 ? "text-white/70" : "text-muted-foreground")}>{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Links */}
      <div className="mt-6 flex gap-4">
        <Button variant="link" className="p-0" onClick={() => navigate('/cadences')}>
          View All Cadences
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
        <Button variant="link" className="p-0" onClick={() => navigate('/leads')}>
          View All Leads
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
        <Button variant="link" className="p-0" onClick={() => navigate('/inbox')}>
          LinkedIn Inbox
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Recent Cadences */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Cadences</CardTitle>
              <CardDescription>Click to view details and statistics</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/cadences')}>
              View All
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {cadences.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Workflow className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="mb-2 text-sm text-muted-foreground">No cadences yet</p>
                <Button onClick={() => navigate('/cadences')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Cadence
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
                          <span>{cadence.steps?.length || 0} steps</span>
                          <span>{stats.activeLeads} active leads</span>
                          <span>{stats.messagesSent} messages sent</span>
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
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Last 10 actions across all cadences</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/logs')}>
              View All
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Activity className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No activity yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Activity will appear here when you start using cadences
                </p>
              </div>
            ) : (
              <div className="relative">
              <ScrollArea className="h-[400px]">
                <div className="space-y-3 pb-6">
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
              <CardTitle>Recent Leads</CardTitle>
              <CardDescription>Latest added contacts</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/leads')}>
              View All
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Users className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="mb-2 text-sm text-muted-foreground">No leads yet</p>
                <Button onClick={() => navigate('/leads')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Your First Lead
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left text-sm text-muted-foreground">
                      <th className="pb-3 font-medium">Name</th>
                      <th className="pb-3 font-medium">Company</th>
                      <th className="pb-3 font-medium">Cadence</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Added</th>
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
                              {lead.email || 'No email'}
                            </p>
                          </td>
                          <td className="py-3 text-sm">
                            {lead.company || '-'}
                          </td>
                          <td className="py-3 text-sm">
                            {cadence ? (
                              <Badge variant="outline">{cadence.name}</Badge>
                            ) : (
                              <span className="text-muted-foreground">Not assigned</span>
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
                  {selectedCadence?.description || 'Cadence details and statistics'}
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
                        <p className="text-xs text-muted-foreground">Messages Sent</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-2xl font-bold">{stats.connectionsSent}</p>
                        <p className="text-xs text-muted-foreground">Connections</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-2xl font-bold">{stats.successRate}%</p>
                        <p className="text-xs text-muted-foreground">Success Rate</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-xl font-bold">{stats.likesComments}</p>
                        <p className="text-xs text-muted-foreground">Likes/Comments</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-xl font-bold">{stats.activeLeads}</p>
                        <p className="text-xs text-muted-foreground">Active Leads</p>
                      </div>
                    </div>

                    {/* Steps with Lead Counts */}
                    <div>
                      <h3 className="font-medium mb-3">Steps ({selectedCadence.steps?.length || 0})</h3>
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
                                      Day {step.day_offset} | {config.channel}
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
                          No steps defined yet
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
              Close
            </Button>
            <Button
              onClick={() => {
                if (selectedCadence) {
                  navigate(`/cadences/${selectedCadence.id}`)
                }
              }}
            >
              Edit Cadence
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
