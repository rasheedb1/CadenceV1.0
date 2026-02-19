import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { useCadence } from '@/contexts/CadenceContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  MessageSquare,
  CheckCircle,
  XCircle,
  Activity,
  BarChart3,
  FileText,
  Workflow,
  TrendingUp,
} from 'lucide-react'

export function Admin() {
  const { user } = useAuth()
  const { orgId } = useOrg()
  const { cadences } = useCadence()

  // Fetch total messages sent from activity_log
  const { data: messageStats, isLoading: loadingMessages } = useQuery({
    queryKey: ['admin-message-stats', orgId],
    queryFn: async () => {
      if (!user?.id) return { total: 0, success: 0, failed: 0 }

      const { data: logs, error } = await supabase
        .from('activity_log')
        .select('status, action')
        .eq('org_id', orgId!)
        .in('action', ['linkedin_message_sent', 'email_sent', 'linkedin_connect', 'linkedin_like', 'linkedin_comment'])

      if (error) {
        console.error('Error fetching message stats:', error)
        return { total: 0, success: 0, failed: 0 }
      }

      const total = logs?.length || 0
      const success = logs?.filter((l) => l.status === 'ok').length || 0
      const failed = logs?.filter((l) => l.status === 'failed').length || 0

      return { total, success, failed }
    },
    enabled: !!user?.id && !!orgId,
  })

  // Fetch recent activity
  const { data: recentActivity, isLoading: loadingActivity } = useQuery({
    queryKey: ['admin-recent-activity', orgId],
    queryFn: async () => {
      if (!user?.id) return []

      const { data, error } = await supabase
        .from('activity_log')
        .select(`
          id,
          action,
          status,
          created_at,
          details,
          lead_id,
          leads:lead_id (
            first_name,
            last_name
          )
        `)
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(5)

      if (error) {
        console.error('Error fetching recent activity:', error)
        return []
      }

      return data || []
    },
    enabled: !!user?.id && !!orgId,
  })

  // Fetch weekly stats summary
  const { data: weeklyStats, isLoading: loadingWeekly } = useQuery({
    queryKey: ['admin-weekly-stats', orgId],
    queryFn: async () => {
      if (!user?.id) return null

      const { data, error } = await supabase
        .from('weekly_message_stats')
        .select('*')
        .eq('org_id', orgId!)
        .order('week_start', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching weekly stats:', error)
        return null
      }

      return data
    },
    enabled: !!user?.id && !!orgId,
  })

  const activeCadences = cadences.filter((c) => c.status === 'active').length
  const successRate = messageStats?.total
    ? Math.round((messageStats.success / messageStats.total) * 100)
    : 0

  const stats = [
    {
      title: 'Total Messages Sent',
      value: messageStats?.total || 0,
      icon: MessageSquare,
      description: 'All time',
      color: 'text-blue-500',
    },
    {
      title: 'Success Rate',
      value: `${successRate}%`,
      icon: TrendingUp,
      description: `${messageStats?.success || 0} successful`,
      color: 'text-green-500',
    },
    {
      title: 'Failed Messages',
      value: messageStats?.failed || 0,
      icon: XCircle,
      description: 'Needs attention',
      color: 'text-red-500',
    },
    {
      title: 'Active Cadences',
      value: activeCadences,
      icon: Workflow,
      description: `${cadences.length} total`,
      color: 'text-purple-500',
    },
  ]

  const quickLinks = [
    {
      title: 'Activity Logs',
      description: 'View all system activity and actions',
      icon: FileText,
      href: '/admin/logs',
    },
    {
      title: 'Analytics',
      description: 'Charts and metrics over time',
      icon: BarChart3,
      href: '/admin/metrics',
    },
  ]

  const isLoading = loadingMessages || loadingActivity || loadingWeekly

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-[28px] font-bold tracking-tight font-heading">Admin Dashboard</h1>
        <p className="text-muted-foreground">System overview and administration</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Links */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">Quick Links</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {quickLinks.map((link) => (
            <Link key={link.href} to={link.href}>
              <Card className="cursor-pointer transition-colors hover:bg-muted/50">
                <CardHeader className="flex flex-row items-center gap-4">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <link.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{link.title}</CardTitle>
                    <CardDescription>{link.description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity & Weekly Summary */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest system actions</CardDescription>
          </CardHeader>
          <CardContent>
            {!recentActivity || recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet</p>
            ) : (
              <div className="space-y-4">
                {recentActivity.map((activity) => {
                  const leadsData = activity.leads as unknown
                  const lead = Array.isArray(leadsData) && leadsData.length > 0
                    ? leadsData[0] as { first_name: string; last_name: string }
                    : leadsData as { first_name: string; last_name: string } | null
                  return (
                    <div key={activity.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {activity.status === 'ok' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <div>
                          <p className="text-sm font-medium">
                            {activity.action.replace(/_/g, ' ')}
                          </p>
                          {lead && (
                            <p className="text-xs text-muted-foreground">
                              {lead.first_name} {lead.last_name}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge variant={activity.status === 'ok' ? 'success' : 'destructive'}>
                        {activity.status}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="mt-4">
              <Link to="/admin/logs">
                <Button variant="outline" size="sm" className="w-full">
                  View All Logs
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              This Week Summary
            </CardTitle>
            <CardDescription>
              {weeklyStats?.week_start
                ? `Week of ${new Date(weeklyStats.week_start).toLocaleDateString()}`
                : 'Current week'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!weeklyStats ? (
              <p className="text-sm text-muted-foreground">No data for this week yet</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">LinkedIn Messages</span>
                  <span className="font-medium">{weeklyStats.linkedin_sent}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Sales Navigator</span>
                  <span className="font-medium">{weeklyStats.sales_navigator_sent}</span>
                </div>
                {weeklyStats.sales_navigator_credit_errors > 0 && (
                  <div className="flex items-center justify-between text-red-500">
                    <span className="text-sm">Credit Errors</span>
                    <span className="font-medium">{weeklyStats.sales_navigator_credit_errors}</span>
                  </div>
                )}
              </div>
            )}
            <div className="mt-4">
              <Link to="/admin/metrics">
                <Button variant="outline" size="sm" className="w-full">
                  View Detailed Metrics
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
