import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './AuthContext'
import type { Cadence, Lead, CadenceStep, Template } from '@/types'

interface CadenceContextType {
  cadences: Cadence[]
  leads: Lead[]
  templates: Template[]
  isLoading: boolean
  createCadence: (name: string) => Promise<Cadence | null>
  updateCadence: (id: string, data: Partial<Cadence>) => Promise<void>
  deleteCadence: (id: string) => Promise<void>
  createStep: (step: Omit<CadenceStep, 'id' | 'created_at' | 'updated_at'>) => Promise<CadenceStep | null>
  updateStep: (id: string, data: Partial<CadenceStep>) => Promise<void>
  deleteStep: (id: string) => Promise<void>
  createLead: (lead: Omit<Lead, 'id' | 'created_at' | 'updated_at'>) => Promise<Lead | null>
  updateLead: (id: string, data: Partial<Lead>) => Promise<void>
  deleteLead: (id: string) => Promise<void>
  assignLeadToCadence: (leadId: string, cadenceId: string) => Promise<void>
  removeLeadFromCadence: (leadId: string) => Promise<void>
}

const CadenceContext = createContext<CadenceContextType | undefined>(undefined)

export function CadenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data: cadences = [], isLoading: cadencesLoading } = useQuery({
    queryKey: ['cadences', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('cadences')
        .select('*, cadence_steps(*)')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((c: Record<string, unknown>) => ({
        ...c,
        steps: c.cadence_steps
      })) as Cadence[]
    },
    enabled: !!user,
  })

  const { data: leads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ['leads', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as Lead[]
    },
    enabled: !!user,
  })

  const { data: templates = [] } = useQuery({
    queryKey: ['templates', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as Template[]
    },
    enabled: !!user,
  })

  const createCadenceMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('cadences')
        .insert({ name, owner_id: user.id, status: 'draft' })
        .select()
        .single()
      if (error) throw error
      return data as Cadence
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cadences'] }),
  })

  const updateCadenceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Cadence> }) => {
      const { error } = await supabase.from('cadences').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cadences'] }),
  })

  const deleteCadenceMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cadences').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cadences'] }),
  })

  const createStepMutation = useMutation({
    mutationFn: async (step: Omit<CadenceStep, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase.from('cadence_steps').insert(step).select().single()
      if (error) throw error
      return data as CadenceStep
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cadences'] }),
  })

  const updateStepMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CadenceStep> }) => {
      const { error } = await supabase.from('cadence_steps').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cadences'] }),
  })

  const deleteStepMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cadence_steps').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cadences'] }),
  })

  const createLeadMutation = useMutation({
    mutationFn: async (lead: Omit<Lead, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase.from('leads').insert(lead).select().single()
      if (error) throw error
      return data as Lead
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })

  const updateLeadMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Lead> }) => {
      const { error } = await supabase.from('leads').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })

  const deleteLeadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('leads').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })

  return (
    <CadenceContext.Provider
      value={{
        cadences,
        leads,
        templates,
        isLoading: cadencesLoading || leadsLoading,
        createCadence: async (name) => createCadenceMutation.mutateAsync(name),
        updateCadence: async (id, data) => updateCadenceMutation.mutateAsync({ id, data }),
        deleteCadence: async (id) => deleteCadenceMutation.mutateAsync(id),
        createStep: async (step) => createStepMutation.mutateAsync(step),
        updateStep: async (id, data) => updateStepMutation.mutateAsync({ id, data }),
        deleteStep: async (id) => deleteStepMutation.mutateAsync(id),
        createLead: async (lead) => createLeadMutation.mutateAsync(lead),
        updateLead: async (id, data) => updateLeadMutation.mutateAsync({ id, data }),
        deleteLead: async (id) => deleteLeadMutation.mutateAsync(id),
        assignLeadToCadence: async (leadId, cadenceId) => {
          await updateLeadMutation.mutateAsync({ id: leadId, data: { cadence_id: cadenceId, status: 'active' } })
        },
        removeLeadFromCadence: async (leadId) => {
          await updateLeadMutation.mutateAsync({ id: leadId, data: { cadence_id: null, current_step_id: null, status: 'pending' } })
        },
      }}
    >
      {children}
    </CadenceContext.Provider>
  )
}

export function useCadence() {
  const context = useContext(CadenceContext)
  if (context === undefined) {
    throw new Error('useCadence must be used within a CadenceProvider')
  }
  return context
}
