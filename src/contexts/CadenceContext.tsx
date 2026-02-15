import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './AuthContext'
import {
  callEdgeFunction,
  type BulkCreateSchedulesRequest,
  type BulkCreateSchedulesResponse,
} from '@/lib/edge-functions'
import type { Cadence, Lead, CadenceStep, Template } from '@/types'

interface ExecuteStepParams {
  leadId: string
  stepId: string
  cadenceId: string
  message?: string
  subject?: string
  postUrl?: string
}

interface ExecuteStepResult {
  success: boolean
  alreadyConnected?: boolean
}

interface CadenceContextType {
  cadences: Cadence[]
  leads: Lead[]
  templates: Template[]
  isLoading: boolean
  createCadence: (name: string, description?: string) => Promise<Cadence | null>
  updateCadence: (id: string, data: Partial<Cadence>) => Promise<void>
  deleteCadence: (id: string) => Promise<void>
  createStep: (step: Omit<CadenceStep, 'id' | 'created_at' | 'updated_at'>) => Promise<CadenceStep | null>
  updateStep: (id: string, data: Partial<CadenceStep>) => Promise<void>
  deleteStep: (id: string) => Promise<void>
  createLead: (lead: Omit<Lead, 'id' | 'created_at' | 'updated_at'>) => Promise<Lead | null>
  updateLead: (id: string, data: Partial<Lead>) => Promise<void>
  deleteLead: (id: string) => Promise<void>
  assignLeadToCadence: (leadId: string, cadenceId: string, startingStepId?: string) => Promise<void>
  removeLeadFromCadence: (leadId: string) => Promise<void>
  createTemplate: (template: { name: string; step_type: string; subject_template?: string | null; body_template: string }) => Promise<Template | null>
  updateTemplate: (id: string, data: Partial<Template>) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  sendAllForCadence: (cadenceId: string) => Promise<void>
  executeStepForLead: (params: ExecuteStepParams) => Promise<ExecuteStepResult>
  markStepDoneForLead: (leadId: string, stepId: string, cadenceId: string) => Promise<void>
  moveLeadToNextStep: (leadId: string, cadenceId: string) => Promise<void>
  getLeadDayInCadence: (lead: Lead) => number
}

const CadenceContext = createContext<CadenceContextType | undefined>(undefined)

// Ensure user profile exists before operations that require it
async function ensureProfileExists(userId: string): Promise<void> {
  // Check if profile exists
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('user_id', userId)
    .single()

  if (!existingProfile) {
    // Create profile if it doesn't exist
    const { error } = await supabase
      .from('profiles')
      .insert({ user_id: userId, full_name: '' })

    if (error && error.code !== '23505') {
      // Ignore unique constraint violations (profile already exists)
      throw new Error(`Failed to create profile: ${error.message}`)
    }
  }
}

export function CadenceProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth()
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
      // Fetch leads with their cadence_leads relationship to get cadence info
      const { data, error } = await supabase
        .from('leads')
        .select('*, cadence_leads(cadence_id, current_step_id, status)')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error

      // Map the results to include cadence info at the lead level for UI compatibility
      return (data || []).map((lead) => {
        const leadData = lead as Record<string, unknown>
        const cadenceLeads = leadData.cadence_leads as Array<Record<string, unknown>> | null
        const cadenceLead = cadenceLeads && cadenceLeads.length > 0 ? cadenceLeads[0] : null

        // Destructure to remove cadence_leads from the result
        const { cadence_leads: _, ...leadWithoutRelation } = leadData

        return {
          ...leadWithoutRelation,
          cadence_id: cadenceLead?.cadence_id as string | null ?? null,
          current_step_id: cadenceLead?.current_step_id as string | null ?? null,
          status: cadenceLead?.status as string | null ?? null,
        } as Lead
      })
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
    mutationFn: async ({ name }: { name: string; description?: string }) => {
      if (!user) throw new Error('Not authenticated')

      // Ensure profile exists before creating cadence
      await ensureProfileExists(user.id)

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
      if (!user) throw new Error('Not authenticated')

      // Ensure owner_id is set from current user
      const stepData = {
        ...step,
        owner_id: user.id,
      }

      const { data, error } = await supabase.from('cadence_steps').insert(stepData).select().single()
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
      // Ensure profile exists before creating lead
      await ensureProfileExists(lead.owner_id)

      // Extract only the fields that exist in the leads table
      // (cadence_id, current_step_id, status are in cadence_leads table, not leads)
      const leadData = {
        owner_id: lead.owner_id,
        first_name: lead.first_name,
        last_name: lead.last_name,
        email: lead.email,
        linkedin_url: lead.linkedin_url,
        company: lead.company,
        title: lead.title,
        phone: lead.phone,
        timezone: lead.timezone,
      }

      const { data, error } = await supabase.from('leads').insert(leadData).select().single()
      if (error) throw error
      return data as Lead
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })

  const updateLeadMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Lead> }) => {
      // Extract only the fields that exist in the leads table
      // (cadence_id, current_step_id, status are in cadence_leads table, not leads)
      const { cadence_id, current_step_id, status, user_id, ...leadData } = data
      const { error } = await supabase.from('leads').update(leadData).eq('id', id)
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

  const createTemplateMutation = useMutation({
    mutationFn: async (template: { name: string; step_type: string; subject_template?: string | null; body_template: string }) => {
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('templates')
        .insert({
          owner_id: user.id,
          name: template.name,
          step_type: template.step_type,
          subject_template: template.subject_template || null,
          body_template: template.body_template,
        })
        .select()
        .single()
      if (error) throw error
      return data as Template
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  })

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Template> }) => {
      const { error } = await supabase.from('templates').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  })

  return (
    <CadenceContext.Provider
      value={{
        cadences,
        leads,
        templates,
        isLoading: cadencesLoading || leadsLoading,
        createCadence: async (name, description) => createCadenceMutation.mutateAsync({ name, description }),
        updateCadence: async (id, data) => updateCadenceMutation.mutateAsync({ id, data }),
        deleteCadence: async (id) => deleteCadenceMutation.mutateAsync(id),
        createStep: async (step) => createStepMutation.mutateAsync(step),
        updateStep: async (id, data) => updateStepMutation.mutateAsync({ id, data }),
        deleteStep: async (id) => deleteStepMutation.mutateAsync(id),
        createLead: async (lead) => createLeadMutation.mutateAsync(lead),
        updateLead: async (id, data) => updateLeadMutation.mutateAsync({ id, data }),
        deleteLead: async (id) => deleteLeadMutation.mutateAsync(id),
        assignLeadToCadence: async (leadId, cadenceId, startingStepId) => {
          if (!user) throw new Error('Not authenticated')

          // Find the first step if no starting step is provided
          const cadence = cadences.find((c) => c.id === cadenceId)
          const sortedSteps = [...(cadence?.steps || [])].sort((a, b) => {
            if (a.day_offset !== b.day_offset) return a.day_offset - b.day_offset
            return a.order_in_day - b.order_in_day
          })
          const firstStepId = startingStepId || sortedSteps[0]?.id || null

          // Insert or update in cadence_leads table
          const { error } = await supabase
            .from('cadence_leads')
            .upsert({
              lead_id: leadId,
              cadence_id: cadenceId,
              owner_id: user.id,
              current_step_id: firstStepId,
              status: 'active',
            }, {
              onConflict: 'lead_id,cadence_id',
            })

          if (error) throw error

          // Invalidate queries to refresh data
          queryClient.invalidateQueries({ queryKey: ['leads'] })
          queryClient.invalidateQueries({ queryKey: ['cadence-leads-direct'] })
        },
        removeLeadFromCadence: async (leadId) => {
          // Update status in cadence_leads table
          const { error } = await supabase
            .from('cadence_leads')
            .update({ status: 'paused', current_step_id: null })
            .eq('lead_id', leadId)

          if (error) throw error

          queryClient.invalidateQueries({ queryKey: ['leads'] })
          queryClient.invalidateQueries({ queryKey: ['cadence-leads-direct'] })
        },
        executeStepForLead: async ({ leadId, stepId, cadenceId, message, subject, postUrl }): Promise<ExecuteStepResult> => {
          if (!session?.access_token) {
            throw new Error('Not authenticated')
          }

          const cadence = cadences.find((c) => c.id === cadenceId)
          const step = cadence?.steps?.find((s) => s.id === stepId)
          const lead = leads.find((l) => l.id === leadId)

          if (!step || !lead) {
            throw new Error('Step or lead not found')
          }

          let result: ExecuteStepResult = { success: true }

          // Execute based on step type
          switch (step.step_type) {
            case 'linkedin_message':
              await callEdgeFunction(
                'linkedin-send-message',
                { leadId, message: message || '' },
                session.access_token
              )
              break
            case 'linkedin_connect': {
              const response = await callEdgeFunction<{ success: boolean; alreadyConnected?: boolean }>(
                'linkedin-send-connection',
                { leadId, message: message || undefined },
                session.access_token
              )
              result = {
                success: true,
                alreadyConnected: response.alreadyConnected || false,
              }
              break
            }
            case 'linkedin_like':
              await callEdgeFunction(
                'linkedin-like-post',
                { leadId, postUrl: postUrl || (step.config_json as Record<string, unknown>)?.postUrl || '' },
                session.access_token
              )
              break
            case 'linkedin_comment':
              await callEdgeFunction(
                'linkedin-comment',
                { leadId, postUrl: postUrl || (step.config_json as Record<string, unknown>)?.postUrl || '', comment: message || '' },
                session.access_token
              )
              break
            case 'send_email': {
              // Convert plain text line breaks to HTML for proper email formatting
              const htmlBody = (message || '')
                .split('\n\n')
                .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
                .join('')
              await callEdgeFunction(
                'send-email',
                { leadId, body: htmlBody, subject: subject || (step.config_json as Record<string, unknown>)?.subject || 'No subject' },
                session.access_token
              )
              break
            }
            // Manual steps (whatsapp, cold_call, task) just get marked as done
            default:
              break
          }

          queryClient.invalidateQueries({ queryKey: ['leads'] })
          queryClient.invalidateQueries({ queryKey: ['cadence-leads-direct'] })
          queryClient.invalidateQueries({ queryKey: ['activity-log'] })

          return result
        },
        markStepDoneForLead: async (leadId, stepId, cadenceId) => {
          // Find the next step and move the lead
          const cadence = cadences.find((c) => c.id === cadenceId)
          const sortedSteps = [...(cadence?.steps || [])].sort((a, b) => {
            if (a.day_offset !== b.day_offset) return a.day_offset - b.day_offset
            return a.order_in_day - b.order_in_day
          })

          const currentIndex = sortedSteps.findIndex((s) => s.id === stepId)
          const nextStep = sortedSteps[currentIndex + 1]

          if (nextStep) {
            // Move to next step in cadence_leads table
            const { error } = await supabase
              .from('cadence_leads')
              .update({ current_step_id: nextStep.id })
              .eq('lead_id', leadId)
              .eq('cadence_id', cadenceId)

            if (error) throw error
          } else {
            // No more steps, mark as completed in cadence_leads table
            const { error } = await supabase
              .from('cadence_leads')
              .update({ current_step_id: null, status: 'completed' })
              .eq('lead_id', leadId)
              .eq('cadence_id', cadenceId)

            if (error) throw error
          }

          queryClient.invalidateQueries({ queryKey: ['leads'] })
          queryClient.invalidateQueries({ queryKey: ['cadence-leads-direct'] })
        },
        moveLeadToNextStep: async (leadId, cadenceId) => {
          const lead = leads.find((l) => l.id === leadId)
          if (!lead?.current_step_id) return

          const cadence = cadences.find((c) => c.id === cadenceId)
          const sortedSteps = [...(cadence?.steps || [])].sort((a, b) => {
            if (a.day_offset !== b.day_offset) return a.day_offset - b.day_offset
            return a.order_in_day - b.order_in_day
          })

          const currentIndex = sortedSteps.findIndex((s) => s.id === lead.current_step_id)
          const nextStep = sortedSteps[currentIndex + 1]

          if (nextStep) {
            const { error } = await supabase
              .from('cadence_leads')
              .update({ current_step_id: nextStep.id })
              .eq('lead_id', leadId)
              .eq('cadence_id', cadenceId)

            if (error) throw error
          } else {
            const { error } = await supabase
              .from('cadence_leads')
              .update({ current_step_id: null, status: 'completed' })
              .eq('lead_id', leadId)
              .eq('cadence_id', cadenceId)

            if (error) throw error
          }

          queryClient.invalidateQueries({ queryKey: ['leads'] })
          queryClient.invalidateQueries({ queryKey: ['cadence-leads-direct'] })
        },
        getLeadDayInCadence: (lead) => {
          if (!lead.created_at) return 0
          const createdAt = new Date(lead.created_at)
          const now = new Date()
          const diffTime = Math.abs(now.getTime() - createdAt.getTime())
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
          return diffDays
        },
        createTemplate: async (template) => createTemplateMutation.mutateAsync(template),
        updateTemplate: async (id, data) => updateTemplateMutation.mutateAsync({ id, data }),
        deleteTemplate: async (id) => deleteTemplateMutation.mutateAsync(id),
        sendAllForCadence: async (cadenceId: string) => {
          if (!user || !session?.access_token) {
            throw new Error('Not authenticated')
          }

          // Find the cadence and its first step
          const cadence = cadences.find((c) => c.id === cadenceId)
          if (!cadence) {
            throw new Error('Cadence not found')
          }

          const sortedSteps = [...(cadence.steps || [])].sort((a, b) => {
            if (a.day_offset !== b.day_offset) return a.day_offset - b.day_offset
            return a.order_in_day - b.order_in_day
          })

          if (sortedSteps.length === 0) {
            throw new Error('Cadence has no steps')
          }

          const firstStep = sortedSteps[0]

          // Find all active leads in this cadence
          const cadenceLeads = leads.filter(
            (lead) => lead.cadence_id === cadenceId && lead.status === 'active'
          )

          if (cadenceLeads.length === 0) {
            throw new Error('No active leads in this cadence')
          }

          // Create staggered schedules (5 seconds apart)
          const now = new Date()
          const STAGGER_INTERVAL_MS = 5000 // 5 seconds between each lead

          const schedules: BulkCreateSchedulesRequest['schedules'] = cadenceLeads.map(
            (lead, index) => {
              const scheduledAt = new Date(now.getTime() + index * STAGGER_INTERVAL_MS)
              return {
                cadenceId,
                cadenceStepId: firstStep.id,
                leadId: lead.id,
                scheduledAt: scheduledAt.toISOString(),
                timezone: lead.timezone || 'UTC',
              }
            }
          )

          // Call the Edge Function to create all schedules
          await callEdgeFunction<BulkCreateSchedulesResponse>(
            'bulk-create-schedules',
            { schedules },
            session.access_token
          )

          // Invalidate queries to refresh the data
          queryClient.invalidateQueries({ queryKey: ['leads'] })
          queryClient.invalidateQueries({ queryKey: ['schedules'] })
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
