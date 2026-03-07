import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import type { AEAccount, AEAccountStage } from '@/types/account-executive'
import { toast } from 'sonner'

// ── List all AE accounts (for current org, current user as owner) ──
export function useAEAccounts() {
  const { orgId } = useOrg()
  const { user } = useAuth()

  return useQuery({
    queryKey: ['ae-accounts', orgId, user?.id],
    queryFn: async () => {
      if (!orgId || !user) return []
      const { data, error } = await supabase
        .from('ae_accounts')
        .select('*')
        .eq('org_id', orgId)
        .eq('owner_user_id', user.id)
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as AEAccount[]
    },
    enabled: !!orgId && !!user,
  })
}

// ── Single AE account ──
export function useAEAccount(id: string | undefined) {
  const { orgId } = useOrg()

  return useQuery({
    queryKey: ['ae-account', id],
    queryFn: async () => {
      if (!id || !orgId) return null
      const { data, error } = await supabase
        .from('ae_accounts')
        .select('*')
        .eq('id', id)
        .eq('org_id', orgId)
        .single()
      if (error) throw error
      return data as AEAccount
    },
    enabled: !!id && !!orgId,
  })
}

// ── Account CRUD mutations ──
export function useAEAccountMutations() {
  const { orgId } = useOrg()
  const { user } = useAuth()
  const qc = useQueryClient()

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ae-accounts'] })
    qc.invalidateQueries({ queryKey: ['ae-account'] })
  }

  const createAccount = useMutation({
    mutationFn: async (input: {
      name: string
      domain?: string
      industry?: string
      contract_value?: number
      currency?: string
      renewal_date?: string
      health_score?: number
      stage?: AEAccountStage
      notes?: string
      gong_account_id?: string
    }) => {
      if (!orgId || !user) throw new Error('No org/user')
      const { data, error } = await supabase
        .from('ae_accounts')
        .insert({
          org_id: orgId,
          owner_user_id: user.id,
          name: input.name,
          domain: input.domain || null,
          industry: input.industry || null,
          contract_value: input.contract_value ?? null,
          currency: input.currency || 'USD',
          renewal_date: input.renewal_date || null,
          health_score: input.health_score ?? 70,
          stage: input.stage || 'active',
          notes: input.notes || null,
          gong_account_id: input.gong_account_id || null,
        })
        .select()
        .single()
      if (error) throw error
      return data as AEAccount
    },
    onSuccess: () => {
      invalidate()
      toast.success('Account created')
    },
    onError: (e: Error) => toast.error('Failed to create account: ' + e.message),
  })

  const updateAccount = useMutation({
    mutationFn: async (input: { id: string } & Partial<Omit<AEAccount, 'id' | 'org_id' | 'owner_user_id' | 'created_at' | 'updated_at'>>) => {
      const { id, ...updates } = input
      const { error } = await supabase
        .from('ae_accounts')
        .update(updates)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error('Failed to update account: ' + e.message),
  })

  const deleteAccount = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ae_accounts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('Account deleted')
    },
    onError: (e: Error) => toast.error('Failed to delete account: ' + e.message),
  })

  return { createAccount, updateAccount, deleteAccount }
}
