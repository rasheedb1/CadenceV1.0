import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  Mail,
  Linkedin,
} from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { format, subWeeks, startOfWeek } from 'date-fns'

const TIME_RANGES = [
  { value: '4', label: 'Last 4 weeks' },
  { value: '8', label: 'Last 8 weeks' },
  { value: '12', label: 'Last 12 weeks' },
  { value: '26', label: 'Last 6 months' },
]

const COLORS = {
  linkedin: '#0077B5',
  email: '#EA4335',
  salesNavigator: '#00A0DC',
  success: '#22c55e',
  failed: '#ef4444',
}

export function AdminMetrics() {
  const { user } = useAuth()
  const [timeRange, setTimeRange] = useState('8')

  // Fetch weekly message stats
  const { data: weeklyStats, isLoading: loadingWeekly } = useQuery({
    queryKey: ['admin-metrics-weekly', user?.id, timeRange],
    queryFn: async () => {
      if (!user?.id) return []

      const weeksAgo = subWeeks(new Date(), parseInt(timeRange))
      const startDate = format(startOfWeek(weeksAgo, { weekStartsOn: 1 }), 'yyyy-MM-dd')

      const { data, error } = await supabase
        .from('weekly_message_stats')
        .select('*')
        .eq('owner_id', user.id)
        .gte('week_start', startDate)
        .order('week_start', { ascending: true })

      if (error) {
        console.error('Error fetching weekly stats:', error)
        return []
      }

      return data || []
    },
    enabled: !!user?.id,
  })

  // Fetch activity stats by action type
  const { data: activityStats, isLoading: loadingActivity } = useQuery({
    queryKey: ['admin-metrics-activity', user?.id, timeRange],
    queryFn: async () => {
      if (!user?.id) return { byAction: [], byStatus: { success: 0, failed: 0 }, dailyActivity: [] }

      const weeksAgo = subWeeks(new Date(), parseInt(timeRange))
      const startDate = format(weeksAgo, 'yyyy-MM-dd')

      const { data: logs, error } = await supabase
        .from('activity_log')
        .select('action, status, created_at')
        .eq('owner_id', user.id)
        .gte('created_at', `${startDate}T00:00:00`)

      if (error) {
        console.error('Error fetching activity stats:', error)
        return { byAction: [], byStatus: { success: 0, failed: 0 }, dailyActivity: [] }
      }

      // Group by action type
      const actionCounts: Record<string, number> = {}
      let successCount = 0
      let failedCount = 0
      const dailyCounts: Record<string, { date: string; linkedin: number; email: number; other: number }> = {}

      logs?.forEach((log) => {
        // Count by action
        actionCounts[log.action] = (actionCounts[log.action] || 0) + 1

        // Count by status
        if (log.status === 'ok') successCount++
        else failedCount++

        // Count by day and channel
        const date = format(new Date(log.created_at), 'yyyy-MM-dd')
        if (!dailyCounts[date]) {
          dailyCounts[date] = { date, linkedin: 0, email: 0, other: 0 }
        }
        if (log.action.includes('linkedin')) {
          dailyCounts[date].linkedin++
        } else if (log.action.includes('email')) {
          dailyCounts[date].email++
        } else {
          dailyCounts[date].other++
        }
      })

      const byAction = Object.entries(actionCounts)
        .map(([action, count]) => ({
          action: action
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' '),
          count,
          fill: action.includes('linkedin') ? COLORS.linkedin : action.includes('email') ? COLORS.email : '#8884d8',
        }))
        .sort((a, b) => b.count - a.count)

      const dailyActivity = Object.values(dailyCounts)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          ...d,
          date: format(new Date(d.date), 'MMM d'),
        }))

      return {
        byAction,
        byStatus: { success: successCount, failed: failedCount },
        dailyActivity,
      }
    },
    enabled: !!user?.id,
  })

  // Prepare weekly chart data
  const weeklyChartData = weeklyStats?.map((stat) => ({
    week: format(new Date(stat.week_start), 'MMM d'),
    linkedin: stat.linkedin_sent,
    salesNavigator: stat.sales_navigator_sent,
    errors: stat.sales_navigator_credit_errors,
    total: stat.linkedin_sent + stat.sales_navigator_sent,
  })) || []

  // Calculate totals and trends
  const totalLinkedIn = weeklyStats?.reduce((sum, s) => sum + s.linkedin_sent, 0) || 0
  const totalSalesNav = weeklyStats?.reduce((sum, s) => sum + s.sales_navigator_sent, 0) || 0
  const totalErrors = weeklyStats?.reduce((sum, s) => sum + s.sales_navigator_credit_errors, 0) || 0

  // Calculate week-over-week trend
  const lastWeek = weeklyStats?.[weeklyStats.length - 1]
  const prevWeek = weeklyStats?.[weeklyStats.length - 2]
  const weekTrend = lastWeek && prevWeek
    ? ((lastWeek.linkedin_sent + lastWeek.sales_navigator_sent) - (prevWeek.linkedin_sent + prevWeek.sales_navigator_sent))
    : 0

  const isLoading = loadingWeekly || loadingActivity

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
          <Link to="/admin" className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Admin
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">Message statistics and performance metrics</p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_RANGES.map((range) => (
              <SelectItem key={range.value} value={range.value}>
                {range.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Stats */}
      <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Messages
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLinkedIn + totalSalesNav}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              {weekTrend >= 0 ? (
                <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
              ) : (
                <TrendingDown className="mr-1 h-3 w-3 text-red-500" />
              )}
              <span className={weekTrend >= 0 ? 'text-green-500' : 'text-red-500'}>
                {weekTrend >= 0 ? '+' : ''}{weekTrend}
              </span>
              <span className="ml-1">vs last week</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              LinkedIn Messages
            </CardTitle>
            <Linkedin className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLinkedIn}</div>
            <p className="text-xs text-muted-foreground">Direct messages</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sales Navigator
            </CardTitle>
            <Mail className="h-4 w-4 text-cyan-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSalesNav}</div>
            <p className="text-xs text-muted-foreground">InMail messages</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Success Rate
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activityStats?.byStatus
                ? Math.round(
                    (activityStats.byStatus.success /
                      (activityStats.byStatus.success + activityStats.byStatus.failed || 1)) *
                      100
                  )
                : 0}
              %
            </div>
            <p className="text-xs text-muted-foreground">
              {activityStats?.byStatus.success || 0} successful actions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Messages Over Time */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Messages Sent Over Time</CardTitle>
            <CardDescription>Weekly message volume by channel</CardDescription>
          </CardHeader>
          <CardContent>
            {weeklyChartData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                No data available for the selected time range
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={weeklyChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="linkedin"
                    name="LinkedIn"
                    stroke={COLORS.linkedin}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="salesNavigator"
                    name="Sales Navigator"
                    stroke={COLORS.salesNavigator}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Success vs Failure */}
        <Card>
          <CardHeader>
            <CardTitle>Success vs Failure</CardTitle>
            <CardDescription>Action outcomes breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {!activityStats?.byStatus ||
            (activityStats.byStatus.success === 0 && activityStats.byStatus.failed === 0) ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                No activity data available
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Success', value: activityStats.byStatus.success, fill: COLORS.success },
                        { name: 'Failed', value: activityStats.byStatus.failed, fill: COLORS.failed },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      <Cell fill={COLORS.success} />
                      <Cell fill={COLORS.failed} />
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS.success }} />
                    <span className="text-sm">Success ({activityStats.byStatus.success})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS.failed }} />
                    <span className="text-sm">Failed ({activityStats.byStatus.failed})</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity by Action Type */}
        <Card>
          <CardHeader>
            <CardTitle>Activity by Type</CardTitle>
            <CardDescription>Actions performed by category</CardDescription>
          </CardHeader>
          <CardContent>
            {!activityStats?.byAction || activityStats.byAction.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                No activity data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={activityStats.byAction.slice(0, 6)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis dataKey="action" type="category" width={120} className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="count" name="Actions" radius={[0, 4, 4, 0]}>
                    {activityStats.byAction.slice(0, 6).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Daily Activity */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Daily Activity</CardTitle>
            <CardDescription>LinkedIn vs Email activity by day</CardDescription>
          </CardHeader>
          <CardContent>
            {!activityStats?.dailyActivity || activityStats.dailyActivity.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                No daily activity data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={activityStats.dailyActivity}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="linkedin" name="LinkedIn" stackId="a" fill={COLORS.linkedin} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="email" name="Email" stackId="a" fill={COLORS.email} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Credit Errors Warning */}
      {totalErrors > 0 && (
        <Card className="mt-6 border-yellow-500/50 bg-yellow-500/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-700">
              <TrendingDown className="h-5 w-5" />
              Credit Errors Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-yellow-700">
              You have encountered {totalErrors} Sales Navigator credit error(s) in the selected period.
              This may indicate you've reached your InMail limit.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
