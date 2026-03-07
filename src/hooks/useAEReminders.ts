import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import type { AEReminder } from '@/types/account-executive'
import { toast } from 'sonner'

// ── All reminders for current user ──
export function useAEReminders() {
  const { orgId } = useOrg()
  const { user } = useAuth()

  return useQuery({
    queryKey: ['ae-reminders', orgId, user?.id],
    queryFn: async () => {
      if (!orgId || !user) return []
      const { data, error } = await supabase
        .from('ae_reminders')
        .select('*')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .eq('completed', false)
        .order('due_at', { ascending: true })
      if (error) throw error
      return (data || []) as AEReminder[]
    },
    enabled: !!orgId && !!user,
  })
}

// ── Reminders for a specific account ──
export function useAEAccountReminders(accountId: string | undefined) {
  const { orgId } = useOrg()

  return useQuery({
    queryKey: ['ae-reminders-account', accountId],
    queryFn: async () => {
      if (!orgId || !accountId) return []
      const { data, error } = await supabase
        .from('ae_reminders')
        .select('*')
        .eq('org_id', orgId)
        .eq('ae_account_id', accountId)
        .order('due_at', { ascending: true })
      if (error) throw error
      return (data || []) as AEReminder[]
    },
    enabled: !!orgId && !!accountId,
  })
}

// ── Reminder mutations ──
export function useAEReminderMutations() {
  const { orgId } = useOrg()
  const { user } = useAuth()
  const qc = useQueryClient()

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ae-reminders'] })
    qc.invalidateQueries({ queryKey: ['ae-reminders-account'] })
  }

  const createReminder = useMutation({
    mutationFn: async (input: {
      title: string
      due_at: string
      ae_account_id?: string
      activity_id?: string
      description?: string
      source?: string
    }) => {
      if (!orgId || !user) throw new Error('No org/user')
      const { data, error } = await supabase
        .from('ae_reminders')
        .insert({
          org_id: orgId,
          user_id: user.id,
          title: input.title,
          due_at: input.due_at,
          ae_account_id: input.ae_account_id || null,
          activity_id: input.activity_id || null,
          description: input.description || null,
          source: input.source || 'manual',
        })
        .select()
        .single()
      if (error) throw error
      return data as AEReminder
    },
    onSuccess: () => {
      invalidate()
      toast.success('Reminder created')
    },
    onError: (e: Error) => toast.error('Failed to create reminder: ' + e.message),
  })

  const completeReminder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ae_reminders')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('Reminder completed')
    },
    onError: (e: Error) => toast.error('Failed to complete reminder: ' + e.message),
  })

  const deleteReminder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ae_reminders').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error('Failed to delete reminder: ' + e.message),
  })

  return { createReminder, completeReminder, deleteReminder }
}
