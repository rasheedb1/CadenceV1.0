import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import type { ICPProfile, BuyerPersona } from '@/types/account-mapping'
import type { ICPBuilderData } from '@/types/icp-builder'
import { toast } from 'sonner'

// ── List all ICP profiles for the current org ──
export function useICPProfiles() {
  const { orgId } = useOrg()

  return useQuery({
    queryKey: ['icp-profiles', orgId],
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await supabase
        .from('icp_profiles')
        .select('*, buyer_personas(id)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((p: Record<string, unknown>) => ({
        ...p,
        persona_count: Array.isArray(p.buyer_personas) ? p.buyer_personas.length : 0,
      })) as (ICPProfile & { persona_count: number })[]
    },
    enabled: !!orgId,
  })
}

// ── Single ICP profile with full personas ──
export function useICPProfile(id: string | undefined) {
  const { orgId } = useOrg()

  return useQuery({
    queryKey: ['icp-profile', id],
    queryFn: async () => {
      if (!id || !orgId) return null
      const { data, error } = await supabase
        .from('icp_profiles')
        .select('*, buyer_personas(*)')
        .eq('id', id)
        .eq('org_id', orgId)
        .single()
      if (error) throw error
      return data as ICPProfile
    },
    enabled: !!id && !!orgId,
  })
}

// ── Count account maps using each profile ──
export function useICPProfileUsage() {
  const { orgId } = useOrg()

  return useQuery({
    queryKey: ['icp-profile-usage', orgId],
    queryFn: async () => {
      if (!orgId) return new Map<string, number>()
      const { data, error } = await supabase
        .from('account_maps')
        .select('icp_profile_id')
        .eq('org_id', orgId)
        .not('icp_profile_id', 'is', null)
      if (error) throw error
      const counts = new Map<string, number>()
      for (const row of data || []) {
        const pid = row.icp_profile_id as string
        counts.set(pid, (counts.get(pid) || 0) + 1)
      }
      return counts
    },
    enabled: !!orgId,
  })
}

// ── Mutations ──
export function useICPProfileMutations() {
  const { orgId } = useOrg()
  const { user } = useAuth()
  const qc = useQueryClient()

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['icp-profiles'] })
    qc.invalidateQueries({ queryKey: ['icp-profile'] })
    qc.invalidateQueries({ queryKey: ['account-maps'] })
  }

  const createProfile = useMutation({
    mutationFn: async (input: { name: string; description?: string; builder_data?: ICPBuilderData }) => {
      if (!orgId || !user) throw new Error('No org/user')
      const { data, error } = await supabase
        .from('icp_profiles')
        .insert({
          org_id: orgId,
          owner_id: user.id,
          name: input.name,
          description: input.description || null,
          builder_data: input.builder_data || {},
        })
        .select()
        .single()
      if (error) throw error
      return data as ICPProfile
    },
    onSuccess: () => {
      invalidate()
      toast.success('ICP Profile created')
    },
    onError: (e) => toast.error('Failed to create ICP Profile: ' + e.message),
  })

  const updateProfile = useMutation({
    mutationFn: async (input: { id: string } & Partial<Pick<ICPProfile, 'name' | 'description' | 'builder_data' | 'discover_min_companies' | 'discover_max_companies'>>) => {
      const { id, ...updates } = input
      const { error } = await supabase
        .from('icp_profiles')
        .update(updates)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
    },
    onError: (e) => toast.error('Failed to update ICP Profile: ' + e.message),
  })

  const deleteProfile = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('icp_profiles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      toast.success('ICP Profile deleted')
    },
    onError: (e) => toast.error('Failed to delete ICP Profile: ' + e.message),
  })

  // Persona CRUD within a profile
  const addPersona = useMutation({
    mutationFn: async (persona: Omit<BuyerPersona, 'id' | 'created_at' | 'updated_at' | 'org_id' | 'account_map_id'> & { icp_profile_id: string }) => {
      if (!orgId) throw new Error('No org')
      const { data, error } = await supabase
        .from('buyer_personas')
        .insert({ ...persona, org_id: orgId, account_map_id: null })
        .select()
        .single()
      if (error) throw error
      return data as BuyerPersona
    },
    onSuccess: () => invalidate(),
    onError: (e) => toast.error('Failed to add persona: ' + e.message),
  })

  const updatePersona = useMutation({
    mutationFn: async (input: { id: string } & Partial<BuyerPersona>) => {
      const { id, ...updates } = input
      const { error } = await supabase
        .from('buyer_personas')
        .update(updates)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
    onError: (e) => toast.error('Failed to update persona: ' + e.message),
  })

  const deletePersona = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('buyer_personas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
    onError: (e) => toast.error('Failed to delete persona: ' + e.message),
  })

  // Link an ICP profile to an account map
  const linkProfileToMap = useMutation({
    mutationFn: async ({ accountMapId, icpProfileId }: { accountMapId: string; icpProfileId: string | null }) => {
      const { error } = await supabase
        .from('account_maps')
        .update({ icp_profile_id: icpProfileId })
        .eq('id', accountMapId)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['icp-profile-usage'] })
    },
  })

  // Convert inline ICP data to a reusable profile
  const convertInlineICP = useMutation({
    mutationFn: async (accountMapId: string) => {
      if (!orgId || !user) throw new Error('No org/user')
      // Load the account map's inline data
      const { data: am, error: amErr } = await supabase
        .from('account_maps')
        .select('name, icp_description, filters_json, discover_min_companies, discover_max_companies')
        .eq('id', accountMapId)
        .single()
      if (amErr || !am) throw new Error('Account map not found')

      // Create the profile
      const builderData = (am.filters_json as Record<string, unknown>)?.icp_builder_data || {}
      const { data: profile, error: pErr } = await supabase
        .from('icp_profiles')
        .insert({
          org_id: orgId,
          owner_id: user.id,
          name: am.name,
          description: am.icp_description,
          builder_data: builderData,
          discover_min_companies: am.discover_min_companies,
          discover_max_companies: am.discover_max_companies,
        })
        .select()
        .single()
      if (pErr || !profile) throw new Error('Failed to create profile')

      // Migrate existing personas to the new profile
      await supabase
        .from('buyer_personas')
        .update({ icp_profile_id: profile.id })
        .eq('account_map_id', accountMapId)
        .is('icp_profile_id', null)

      // Link the account map
      await supabase
        .from('account_maps')
        .update({ icp_profile_id: profile.id })
        .eq('id', accountMapId)

      return profile as ICPProfile
    },
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['icp-profile-usage'] })
      toast.success('ICP Profile created from account map data')
    },
    onError: (e) => toast.error('Failed to convert: ' + e.message),
  })

  return {
    createProfile,
    updateProfile,
    deleteProfile,
    addPersona,
    updatePersona,
    deletePersona,
    linkProfileToMap,
    convertInlineICP,
  }
}
