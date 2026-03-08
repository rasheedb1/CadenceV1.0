import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './AuthContext'
import { useOrg } from './OrgContext'
import { callEdgeFunction } from '@/lib/edge-functions'
import type { BusinessCaseTemplate, BusinessCase, BcSlide, DetectedVariable } from '@/types/business-cases'

// ── Context Interface ──────────────────────────────────────────────────────────

interface BusinessCasesContextType {
  templates: BusinessCaseTemplate[]
  cases: BusinessCase[]
  isLoadingTemplates: boolean
  isLoadingCases: boolean
  // AI-structured template
  createTemplate: (data: {
    name: string
    description?: string
    generation_prompt?: string
    slide_structure: BcSlide[]
  }) => Promise<BusinessCaseTemplate | null>
  // PPTX upload template
  uploadPptxTemplate: (data: {
    file: File
    name: string
    description?: string
    detectedVariables: DetectedVariable[]
  }) => Promise<BusinessCaseTemplate | null>
  updateTemplate: (id: string, data: Partial<BusinessCaseTemplate>) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  deleteCase: (id: string) => Promise<void>
  updateCaseContent: (id: string, editedContent: Record<string, string>) => Promise<void>
  // Generation
  generateStructure: (prompt: string, slideCount: number, language: string) => Promise<BcSlide[]>
  generateCase: (templateId: string, leadId: string) => Promise<BusinessCase>
  generatePptxContent: (templateId: string, leadId: string) => Promise<{
    businessCaseId: string
    content: Record<string, string>
    signals: Array<{ name: string; summary: string; sourceUrl?: string }>
  }>
  // PPTX file download from storage
  downloadPptxTemplate: (storagePath: string) => Promise<Blob>
}

const BusinessCasesContext = createContext<BusinessCasesContextType | undefined>(undefined)

export function BusinessCasesProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth()
  const { orgId } = useOrg()
  const queryClient = useQueryClient()

  // ── Fetch templates ──
  const { data: templates = [], isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['bc-templates', orgId],
    queryFn: async () => {
      if (!user || !orgId) return []
      const { data, error } = await supabase
        .from('business_case_templates')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as BusinessCaseTemplate[]
    },
    enabled: !!user && !!orgId,
  })

  // ── Fetch cases (with template) ──
  const { data: cases = [], isLoading: isLoadingCases } = useQuery({
    queryKey: ['bc-cases', orgId],
    queryFn: async () => {
      if (!user || !orgId) return []
      const { data, error } = await supabase
        .from('business_cases')
        .select('*, template:business_case_templates(id, name, template_type, slide_structure, source, description, generation_prompt, is_active, pptx_storage_path, detected_variables, created_by, created_at, updated_at, org_id)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as BusinessCase[]
    },
    enabled: !!user && !!orgId,
  })

  // ── Create AI-structured template ──
  const createTemplateMutation = useMutation({
    mutationFn: async (data: {
      name: string
      description?: string
      generation_prompt?: string
      slide_structure: BcSlide[]
    }) => {
      if (!user || !orgId) throw new Error('Not authenticated')
      const { data: template, error } = await supabase
        .from('business_case_templates')
        .insert({
          org_id: orgId,
          name: data.name,
          description: data.description || null,
          generation_prompt: data.generation_prompt || null,
          slide_structure: data.slide_structure,
          source: 'ai_generated',
          template_type: 'ai_structured',
          created_by: user.id,
        })
        .select()
        .single()
      if (error) throw error
      return template as BusinessCaseTemplate
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bc-templates'] }),
  })

  // ── Upload PPTX template ──
  const uploadPptxTemplateMutation = useMutation({
    mutationFn: async (data: {
      file: File
      name: string
      description?: string
      detectedVariables: DetectedVariable[]
    }) => {
      if (!user || !orgId) throw new Error('Not authenticated')

      // 1. Create DB record first to get an ID
      const { data: template, error: insertErr } = await supabase
        .from('business_case_templates')
        .insert({
          org_id: orgId,
          name: data.name,
          description: data.description || null,
          source: 'user_uploaded',
          template_type: 'uploaded_pptx',
          slide_structure: [],
          detected_variables: data.detectedVariables,
          created_by: user.id,
        })
        .select()
        .single()
      if (insertErr || !template) throw insertErr || new Error('Failed to create template record')

      // 2. Upload PPTX to storage
      const storagePath = `${orgId}/${template.id}.pptx`
      const { error: uploadErr } = await supabase.storage
        .from('bc-templates')
        .upload(storagePath, data.file, {
          contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          upsert: true,
        })
      if (uploadErr) throw uploadErr

      // 3. Update record with storage path
      const { data: updated, error: updateErr } = await supabase
        .from('business_case_templates')
        .update({ pptx_storage_path: storagePath, updated_at: new Date().toISOString() })
        .eq('id', template.id)
        .select()
        .single()
      if (updateErr) throw updateErr
      // Kick off thumbnail generation non-blocking (best-effort)
      supabase.functions.invoke('generate-slide-thumbnails', {
        body: { template_id: template.id },
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['bc-templates'] })
      }).catch(() => { /* ignore — SlidePanel will show button as fallback */ })
      return updated as BusinessCaseTemplate
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bc-templates'] }),
  })

  // ── Update template ──
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BusinessCaseTemplate> }) => {
      const { error } = await supabase
        .from('business_case_templates')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bc-templates'] }),
  })

  // ── Delete template ──
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      // Also delete from storage if it's a PPTX template
      const template = templates.find((t) => t.id === id)
      if (template?.pptx_storage_path) {
        await supabase.storage.from('bc-templates').remove([template.pptx_storage_path])
      }
      const { error } = await supabase
        .from('business_case_templates')
        .delete()
        .eq('id', id)
        .eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bc-templates'] }),
  })

  // ── Delete case ──
  const deleteCaseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('business_cases')
        .delete()
        .eq('id', id)
        .eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bc-cases'] }),
  })

  // ── Update case content ──
  const updateCaseContentMutation = useMutation({
    mutationFn: async ({ id, editedContent }: { id: string; editedContent: Record<string, string> }) => {
      const { error } = await supabase
        .from('business_cases')
        .update({
          edited_content: editedContent,
          status: 'edited',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bc-cases'] }),
  })

  // ── Generate slide structure ──
  const generateStructure = async (prompt: string, slideCount: number, language: string): Promise<BcSlide[]> => {
    if (!session?.access_token) throw new Error('Not authenticated')
    const result = await callEdgeFunction<{ slides: BcSlide[] }>(
      'generate-bc-structure',
      { description: prompt, slideCount, language },
      session.access_token,
    )
    return result.slides
  }

  // ── Generate business case (AI-structured template) ──
  const generateCase = async (templateId: string, leadId: string): Promise<BusinessCase> => {
    if (!session?.access_token) throw new Error('Not authenticated')
    const result = await callEdgeFunction<BusinessCase>(
      'generate-business-case',
      { templateId, leadId },
      session.access_token,
      { timeoutMs: 120000 },
    )
    queryClient.invalidateQueries({ queryKey: ['bc-cases'] })
    return result
  }

  // ── Generate PPTX content (uploaded_pptx template) ──
  const generatePptxContent = async (templateId: string, leadId: string) => {
    if (!session?.access_token) throw new Error('Not authenticated')
    const result = await callEdgeFunction<{
      businessCaseId: string
      content: Record<string, string>
      signals: Array<{ name: string; summary: string; sourceUrl?: string }>
    }>(
      'generate-bc-pptx-content',
      { templateId, leadId },
      session.access_token,
      { timeoutMs: 120000 },
    )
    queryClient.invalidateQueries({ queryKey: ['bc-cases'] })
    return result
  }

  // ── Download PPTX template from storage ──
  const downloadPptxTemplate = async (storagePath: string): Promise<Blob> => {
    const { data, error } = await supabase.storage.from('bc-templates').download(storagePath)
    if (error || !data) throw error || new Error('Failed to download template')
    return data
  }

  return (
    <BusinessCasesContext.Provider
      value={{
        templates,
        cases,
        isLoadingTemplates,
        isLoadingCases,
        createTemplate: async (data) => createTemplateMutation.mutateAsync(data),
        uploadPptxTemplate: async (data) => uploadPptxTemplateMutation.mutateAsync(data),
        updateTemplate: async (id, data) => updateTemplateMutation.mutateAsync({ id, data }),
        deleteTemplate: async (id) => deleteTemplateMutation.mutateAsync(id),
        deleteCase: async (id) => deleteCaseMutation.mutateAsync(id),
        updateCaseContent: async (id, editedContent) => updateCaseContentMutation.mutateAsync({ id, editedContent }),
        generateStructure,
        generateCase,
        generatePptxContent,
        downloadPptxTemplate,
      }}
    >
      {children}
    </BusinessCasesContext.Provider>
  )
}

export function useBusinessCases() {
  const context = useContext(BusinessCasesContext)
  if (context === undefined) {
    throw new Error('useBusinessCases must be used within a BusinessCasesProvider')
  }
  return context
}
