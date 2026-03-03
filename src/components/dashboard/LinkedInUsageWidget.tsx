import { useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { startOfWeek, endOfWeek, startOfMonth, format } from 'date-fns'
import { MessageSquare, UserPlus, ThumbsUp, Mail, Linkedin } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { supabase } from '@/integrations/supabase/client'

const LINKEDIN_LIMITS = {
  linkedin_message: { label: 'Mensajes', softLimit: 100, hardLimit: 120 },
  linkedin_connect: { label: 'Conexiones', softLimit: 110, hardLimit: 130 },
  likes_comments: { label: 'Likes + Comments', softLimit: 650, hardLimit: 800 },
  sales_navigator_inmail: { label: 'InMail', softLimit: 120, hardLimit: 140 },
} as const

type LimitKey = keyof typeof LINKEDIN_LIMITS

const LIMIT_ICONS: Record<LimitKey, React.ComponentType<{ className?: string }>> = {
  linkedin_message: MessageSquare,
  linkedin_connect: UserPlus,
  likes_comments: ThumbsUp,
  sales_navigator_inmail: MessageSquare,
}

function countByType(rows: { cadence_steps: { step_type: string } | null }[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    const t = row.cadence_steps?.step_type
    if (t) counts[t] = (counts[t] || 0) + 1
  }
  return counts
}

function getLikesComments(counts: Record<string, number>): number {
  return (counts['linkedin_like'] || 0) + (counts['linkedin_comment'] || 0)
}

function getCountForKey(key: LimitKey, counts: Record<string, number>): number {
  if (key === 'likes_comments') return getLikesComments(counts)
  return counts[key] || 0
}

export function LinkedInUsageWidget() {
  const { user } = useAuth()
  const { orgId } = useOrg()
  const notificationSentRef = useRef(false)

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), [])
  const weekEnd = useMemo(() => endOfWeek(new Date(), { weekStartsOn: 1 }), [])
  const monthStart = useMemo(() => startOfMonth(new Date()), [])

  const { data: weeklyRows = [], isFetching: isFetchingWeekly } = useQuery({
    queryKey: ['linkedin-usage-weekly', orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await supabase
        .from('schedules')
        .select('cadence_steps(step_type), updated_at')
        .eq('org_id', orgId)
        .eq('status', 'executed')
        .gte('updated_at', weekStart.toISOString())
        .lte('updated_at', weekEnd.toISOString())
        .limit(2000)
      if (error) {
        console.error('Error fetching weekly LinkedIn usage:', error)
        return []
      }
      return (data || []) as unknown as { cadence_steps: { step_type: string } | null; updated_at: string }[]
    },
    enabled: !!orgId,
  })

  const { data: monthlyRows = [], isFetching: isFetchingMonthly } = useQuery({
    queryKey: ['linkedin-usage-monthly', orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await supabase
        .from('schedules')
        .select('cadence_steps(step_type)')
        .eq('org_id', orgId)
        .eq('status', 'executed')
        .gte('updated_at', monthStart.toISOString())
        .limit(5000)
      if (error) {
        console.error('Error fetching monthly LinkedIn usage:', error)
        return []
      }
      return (data || []) as unknown as { cadence_steps: { step_type: string } | null }[]
    },
    enabled: !!orgId,
  })

  const weekCounts = useMemo(() => countByType(weeklyRows), [weeklyRows])
  const monthlyCounts = useMemo(() => countByType(monthlyRows), [monthlyRows])

  const isFetching = isFetchingWeekly || isFetchingMonthly

  useEffect(() => {
    if (!user || !orgId || notificationSentRef.current) return
    if (weeklyRows.length === 0 && !isFetchingWeekly) return

    const checkAndNotify = async () => {
      notificationSentRef.current = true

      const limitKeys: LimitKey[] = ['linkedin_message', 'linkedin_connect', 'likes_comments']

      for (const key of limitKeys) {
        const { hardLimit, label } = LINKEDIN_LIMITS[key]
        const count = getCountForKey(key, weekCounts)

        if (count < hardLimit) continue

        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('org_id', orgId)
          .eq('owner_id', user.id)
          .gte('created_at', weekStart.toISOString())
          .filter('metadata->>isLinkedInLimitWarning', 'eq', 'true')
          .filter('metadata->>limitType', 'eq', key)
          .limit(1)

        if (existing && existing.length > 0) continue

        await supabase.from('notifications').insert({
          owner_id: user.id,
          org_id: orgId,
          type: 'step_failed',
          title: `⚠️ Límite de LinkedIn alcanzado: ${label}`,
          body: `Llegaste a ${count}/${hardLimit} ${label} esta semana. Para proteger tu cuenta de LinkedIn, detén los envíos hasta el próximo lunes.`,
          channel: 'linkedin',
          is_read: false,
          metadata: {
            isLinkedInLimitWarning: true,
            limitType: key,
            count,
            limit: hardLimit,
          },
        })
      }
    }

    checkAndNotify()
  }, [weekCounts, user, orgId, weekStart, isFetchingWeekly])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Linkedin className="h-4 w-4 text-[#0A66C2]" />
          LinkedIn Usage — Semana actual
          <span className="text-xs text-muted-foreground font-normal ml-auto">
            {format(weekStart, 'd MMM')} – {format(weekEnd, 'd MMM')}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isFetching && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Actualizando...
          </div>
        )}

        {(Object.entries(LINKEDIN_LIMITS) as [LimitKey, typeof LINKEDIN_LIMITS[LimitKey]][]).map(
          ([key, { label, softLimit, hardLimit }]) => {
            const count = getCountForKey(key, weekCounts)
            const pct = Math.min((count / hardLimit) * 100, 100)
            const isOver = count >= hardLimit
            const isWarning = count >= softLimit && !isOver
            const Icon = LIMIT_ICONS[key]

            const progressClass = isOver
              ? '[&>div]:bg-red-500'
              : isWarning
              ? '[&>div]:bg-amber-500'
              : '[&>div]:bg-green-500'

            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Icon className="h-3 w-3" />
                    {label}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium tabular-nums">
                      {count}
                      <span className="text-muted-foreground font-normal">/{hardLimit}</span>
                    </span>
                    {isOver && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                        LÍMITE ALCANZADO
                      </Badge>
                    )}
                    {isWarning && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4 border-amber-400 text-amber-600 dark:text-amber-400"
                      >
                        ⚠️ {count}/{hardLimit}
                      </Badge>
                    )}
                  </div>
                </div>
                <Progress
                  value={pct}
                  className={progressClass}
                />
              </div>
            )
          }
        )}

        {/* Email count — no limit */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span className="flex items-center gap-1.5">
            <Mail className="h-3 w-3" />
            Email enviados
          </span>
          <span className="font-medium text-foreground">{weekCounts['send_email'] || 0}</span>
        </div>

        <Separator className="my-1" />

        {/* Monthly summary */}
        <div className="text-xs text-muted-foreground">
          Este mes:{' '}
          <span className="font-medium text-foreground">{monthlyCounts['linkedin_message'] || 0}</span> mensajes{' '}
          ·{' '}
          <span className="font-medium text-foreground">{monthlyCounts['linkedin_connect'] || 0}</span> conexiones{' '}
          ·{' '}
          <span className="font-medium text-foreground">{getLikesComments(monthlyCounts)}</span> likes/comments
        </div>
      </CardContent>
    </Card>
  )
}
