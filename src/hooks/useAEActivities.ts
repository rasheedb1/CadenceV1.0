import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import type { AEActivity, AEActivityType, AEActivitySource, AEActionItem, AEParticipant } from '@/types/account-executive'
import { toast } from 'sonner'

// ── Activities for a specific account ──
export function useAEActivities(accountId: string | undefined) {
  const { orgId } = useOrg()

  return useQuery({
    queryKey: ['ae-activities', accountId],
    queryFn: async () => {
      if (!orgId || !accountId) return []
      const { data, error } = await supabase
        .from('ae_activities')
        .select('*')
        .eq('org_id', orgId)
        .eq('ae_account_id', accountId)
        .order('occurred_at', { ascending: false })
      if (error) throw error
      return (data || []).map(row => ({
        ...row,
        action_items: (row.action_items as AEActionItem[]) || [],
        participants: (row.participants as AEParticipant[]) || [],
      })) as AEActivity[]
    },
    enabled: !!orgId && !!accountId,
  })
}

// ── All recent activities for current user (for dashboard feed) ──
export function useAERecentActivities(limit = 10) {
  const { orgId } = useOrg()
  const { user } = useAuth()

  return useQuery({
    queryKey: ['ae-activities-recent', orgId, user?.id],
    queryFn: async () => {
      if (!orgId || !user) return []
      const { data, error } = await supabase
        .from('ae_activities')
        .select('*')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .order('occurred_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data || []).map(row => ({
        ...row,
        action_items: (row.action_items as AEActionItem[]) || [],
        participants: (row.participants as AEParticipant[]) || [],
      })) as AEActivity[]
    },
    enabled: !!orgId && !!user,
  })
}

// ── Activity mutations ──
export function useAEActivityMutations() {
  const { orgId } = useOrg()
  const { user } = useAuth()
  const qc = useQueryClient()

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ae-activities'] })
    qc.invalidateQueries({ queryKey: ['ae-activities-recent'] })
  }

  const createActivity = useMutation({
    mutationFn: async (input: {
      ae_account_id?: string
      type: AEActivityType
      source: AEActivitySource
      title: string
      occurred_at: string
      summary?: string
      action_items?: AEActionItem[]
      participants?: AEParticipant[]
      duration_seconds?: number
      external_id?: string
    }) => {
      if (!orgId || !user) throw new Error('No org/user')
      const { data, error } = await supabase
        .from('ae_activities')
        .insert({
          org_id: orgId,
          user_id: user.id,
          ae_account_id: input.ae_account_id || null,
          type: input.type,
          source: input.source,
          title: input.title,
          occurred_at: input.occurred_at,
          summary: input.summary || null,
          action_items: input.action_items || [],
          participants: input.participants || [],
          duration_seconds: input.duration_seconds || null,
          external_id: input.external_id || null,
        })
        .select()
        .single()
      if (error) throw error
      return data as AEActivity
    },
    onSuccess: () => {
      invalidate()
      toast.success('Activity logged')
    },
    onError: (e: Error) => toast.error('Failed to log activity: ' + e.message),
  })

  const deleteActivity = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ae_activities').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
    },
    onError: (e: Error) => toast.error('Failed to delete activity: ' + e.message),
  })

  return { createActivity, deleteActivity }
}
