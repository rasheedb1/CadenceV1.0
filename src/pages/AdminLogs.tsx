import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  Search,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react'
import { format } from 'date-fns'

const PAGE_SIZE = 20

const ACTION_TYPES = [
  { value: 'all', label: 'All Actions' },
  { value: 'linkedin_message_sent', label: 'LinkedIn Message' },
  { value: 'linkedin_connect', label: 'LinkedIn Connect' },
  { value: 'linkedin_like', label: 'LinkedIn Like' },
  { value: 'linkedin_comment', label: 'LinkedIn Comment' },
  { value: 'email_sent', label: 'Email Sent' },
  { value: 'lead_created', label: 'Lead Created' },
  { value: 'cadence_started', label: 'Cadence Started' },
  { value: 'step_executed', label: 'Step Executed' },
]

const STATUS_TYPES = [
  { value: 'all', label: 'All Statuses' },
  { value: 'ok', label: 'Success' },
  { value: 'failed', label: 'Failed' },
]

interface ActivityLog {
  id: string
  action: string
  status: 'ok' | 'failed'
  created_at: string
  details: Record<string, unknown> | null
  lead_id: string | null
  cadence_id: string | null
  leads: { first_name: string; last_name: string } | null
  cadences: { name: string } | null
}

export function AdminLogs() {
  const { user } = useAuth()
  const [page, setPage] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin-logs', user?.id, page, searchQuery, actionFilter, statusFilter, dateFrom, dateTo],
    queryFn: async () => {
      if (!user?.id) return { logs: [], total: 0 }

      let query = supabase
        .from('activity_log')
        .select(
          `
          id,
          action,
          status,
          created_at,
          details,
          lead_id,
          cadence_id,
          leads:lead_id (
            first_name,
            last_name
          ),
          cadences:cadence_id (
            name
          )
        `,
          { count: 'exact' }
        )
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      // Apply action filter
      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter)
      }

      // Apply status filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      // Apply date filters
      if (dateFrom) {
        query = query.gte('created_at', `${dateFrom}T00:00:00`)
      }
      if (dateTo) {
        query = query.lte('created_at', `${dateTo}T23:59:59`)
      }

      const { data: logs, error, count } = await query

      if (error) {
        console.error('Error fetching activity logs:', error)
        return { logs: [], total: 0 }
      }

      // Filter by lead name client-side (Supabase doesn't support join filtering easily)
      // Transform the data to match ActivityLog interface
      let filteredLogs = (logs || []).map((log) => {
        const leadsData = log.leads as unknown
        const cadencesData = log.cadences as unknown
        return {
          ...log,
          leads: Array.isArray(leadsData) && leadsData.length > 0
            ? leadsData[0] as { first_name: string; last_name: string }
            : leadsData as { first_name: string; last_name: string } | null,
          cadences: Array.isArray(cadencesData) && cadencesData.length > 0
            ? cadencesData[0] as { name: string }
            : cadencesData as { name: string } | null,
        }
      }) as ActivityLog[]
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        filteredLogs = filteredLogs.filter((log) => {
          const leadName = log.leads
            ? `${log.leads.first_name} ${log.leads.last_name}`.toLowerCase()
            : ''
          const cadenceName = log.cadences?.name?.toLowerCase() || ''
          return leadName.includes(query) || cadenceName.includes(query) || log.action.includes(query)
        })
      }

      return { logs: filteredLogs, total: count || 0 }
    },
    enabled: !!user?.id,
  })

  const totalPages = Math.ceil((data?.total || 0) / PAGE_SIZE)

  const formatAction = (action: string) => {
    return action
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const getActionBadgeVariant = (action: string) => {
    if (action.includes('linkedin')) return 'info'
    if (action.includes('email')) return 'default'
    if (action.includes('failed')) return 'destructive'
    return 'secondary'
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <Link to="/admin" className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Admin
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Activity Logs</h1>
        <p className="text-muted-foreground">View and filter all system activity</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by lead or cadence..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPage(0)
                }}
                className="pl-9"
              />
            </div>

            <Select
              value={actionFilter}
              onValueChange={(value) => {
                setActionFilter(value)
                setPage(0)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Action type" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value)
                setPage(0)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              placeholder="From date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(0)
              }}
            />

            <Input
              type="date"
              placeholder="To date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(0)
              }}
            />
          </div>

          {(searchQuery || actionFilter !== 'all' || statusFilter !== 'all' || dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-4"
              onClick={() => {
                setSearchQuery('')
                setActionFilter('all')
                setStatusFilter('all')
                setDateFrom('')
                setDateTo('')
                setPage(0)
              }}
            >
              Clear Filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Logs ({data?.total || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : !data?.logs || data.logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-medium">No logs found</h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery || actionFilter !== 'all' || statusFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Activity will appear here as you use the system'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left text-sm text-muted-foreground">
                      <th className="pb-3 font-medium">Timestamp</th>
                      <th className="pb-3 font-medium">Action</th>
                      <th className="pb-3 font-medium">Lead</th>
                      <th className="pb-3 font-medium">Cadence</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.logs.map((log) => (
                      <tr key={log.id} className="text-sm">
                        <td className="py-3 pr-4">
                          <div>
                            <p className="font-medium">
                              {format(new Date(log.created_at), 'MMM d, yyyy')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(log.created_at), 'HH:mm:ss')}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant={getActionBadgeVariant(log.action)}>
                            {formatAction(log.action)}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4">
                          {log.leads ? (
                            <span>
                              {log.leads.first_name} {log.leads.last_name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {log.cadences?.name || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            {log.status === 'ok' ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            <Badge variant={log.status === 'ok' ? 'success' : 'destructive'}>
                              {log.status === 'ok' ? 'Success' : 'Failed'}
                            </Badge>
                          </div>
                        </td>
                        <td className="py-3">
                          {log.details ? (
                            <pre className="max-w-xs truncate text-xs text-muted-foreground">
                              {JSON.stringify(log.details, null, 2).slice(0, 100)}
                              {JSON.stringify(log.details).length > 100 && '...'}
                            </pre>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {page * PAGE_SIZE + 1} to{' '}
                    {Math.min((page + 1) * PAGE_SIZE, data.total)} of {data.total} entries
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0 || isFetching}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1 || isFetching}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
