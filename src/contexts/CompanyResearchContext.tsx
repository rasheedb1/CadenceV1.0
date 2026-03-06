import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './AuthContext'
import { useOrg } from './OrgContext'

// ── Types ──

export interface ResearchProject {
  id: string
  org_id: string
  owner_id: string
  name: string
  description: string | null
  research_prompt: string
  auto_trigger_enabled: boolean
  auto_trigger_account_map_ids: string[]
  status: 'active' | 'paused' | 'archived'
  created_at: string
  updated_at: string
  // Computed (from join)
  company_count?: number
  completed_count?: number
}

export interface ResearchProjectCompany {
  id: string
  org_id: string
  owner_id: string
  research_project_id: string
  company_id: string | null
  company_name: string
  company_website: string | null
  company_industry: string | null
  company_location: string | null
  status: 'pending' | 'researching' | 'completed' | 'failed'
  research_content: string | null
  research_summary: string | null
  research_sources: Array<{ url: string; title: string; type?: string; snippet?: string }>
  research_metadata: Record<string, unknown>
  quality_score: number | null
  error_message: string | null
  retry_count: number
  source: 'manual' | 'auto_trigger' | 'bulk_import'
  queued_at: string
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

interface CompanyResearchContextType {
  // Projects
  projects: ResearchProject[]
  isLoadingProjects: boolean
  createProject: (data: { name: string; description?: string; research_prompt: string; auto_trigger_enabled?: boolean; auto_trigger_account_map_ids?: string[] }) => Promise<ResearchProject | null>
  updateProject: (id: string, data: Partial<Pick<ResearchProject, 'name' | 'description' | 'research_prompt' | 'auto_trigger_enabled' | 'auto_trigger_account_map_ids' | 'status'>>) => Promise<void>
  deleteProject: (id: string) => Promise<void>

  // Companies in a project
  getProjectCompanies: (projectId: string) => ResearchProjectCompany[]
  isLoadingCompanies: (projectId: string) => boolean
  addCompanyToProject: (projectId: string, company: { company_name: string; company_website?: string; company_industry?: string; company_location?: string; company_id?: string }) => Promise<void>
  removeCompanyFromProject: (companyResearchId: string) => Promise<void>

  // Research execution (fire-and-forget — returns quickly, polling tracks progress)
  runResearch: (researchProjectCompanyId: string, llmModel?: string) => Promise<void>
  runAllPending: (projectId: string, llmModel?: string) => Promise<void>
  resetStuckResearch: (researchProjectCompanyId: string) => Promise<void>
}

const CompanyResearchContext = createContext<CompanyResearchContextType | undefined>(undefined)

export function CompanyResearchProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth()
  const { orgId } = useOrg()
  const queryClient = useQueryClient()

  // ── Fetch projects ──
  const { data: projects = [], isLoading: isLoadingProjects } = useQuery({
    queryKey: ['research-projects', orgId],
    queryFn: async () => {
      if (!user || !orgId) return []
      const { data, error } = await supabase
        .from('research_projects')
        .select('*')
        .eq('org_id', orgId)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
      if (error) throw error

      const projectIds = (data || []).map(p => p.id)
      if (projectIds.length === 0) return data || []

      const { data: counts } = await supabase
        .from('research_project_companies')
        .select('research_project_id, status')
        .eq('org_id', orgId)
        .in('research_project_id', projectIds)

      const countMap: Record<string, { total: number; completed: number }> = {}
      for (const c of counts || []) {
        if (!countMap[c.research_project_id]) countMap[c.research_project_id] = { total: 0, completed: 0 }
        countMap[c.research_project_id].total++
        if (c.status === 'completed') countMap[c.research_project_id].completed++
      }

      return (data || []).map(p => ({
        ...p,
        company_count: countMap[p.id]?.total || 0,
        completed_count: countMap[p.id]?.completed || 0,
      }))
    },
    enabled: !!user && !!orgId,
  })

  // ── Create project ──
  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; research_prompt: string; auto_trigger_enabled?: boolean; auto_trigger_account_map_ids?: string[] }) => {
      if (!user || !orgId) throw new Error('Not authenticated')
      const { data: project, error } = await supabase
        .from('research_projects')
        .insert({
          org_id: orgId,
          owner_id: user.id,
          name: data.name,
          description: data.description || null,
          research_prompt: data.research_prompt,
          auto_trigger_enabled: data.auto_trigger_enabled || false,
          auto_trigger_account_map_ids: data.auto_trigger_account_map_ids || [],
        })
        .select()
        .single()
      if (error) throw error
      return project
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['research-projects'] }),
  })

  // ── Update project ──
  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const { error } = await supabase
        .from('research_projects')
        .update(data)
        .eq('id', id)
        .eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['research-projects'] }),
  })

  // ── Delete project ──
  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('research_projects')
        .delete()
        .eq('id', id)
        .eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['research-projects'] }),
  })

  // ── Add company to project ──
  const addCompanyMutation = useMutation({
    mutationFn: async ({ projectId, company }: { projectId: string; company: { company_name: string; company_website?: string; company_industry?: string; company_location?: string; company_id?: string } }) => {
      if (!user || !orgId) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('research_project_companies')
        .insert({
          org_id: orgId,
          owner_id: user.id,
          research_project_id: projectId,
          company_id: company.company_id || null,
          company_name: company.company_name,
          company_website: company.company_website || null,
          company_industry: company.company_industry || null,
          company_location: company.company_location || null,
          status: 'pending',
          source: 'manual',
        })
      if (error) throw error
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['research-project-companies', projectId] })
      queryClient.invalidateQueries({ queryKey: ['research-projects'] })
    },
  })

  // ── Remove company from project ──
  const removeCompanyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('research_project_companies')
        .delete()
        .eq('id', id)
        .eq('org_id', orgId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-project-companies'] })
      queryClient.invalidateQueries({ queryKey: ['research-projects'] })
    },
  })

  // ── Run research (fire-and-forget — function runs in background) ──
  const runResearch = async (researchProjectCompanyId: string, llmModel?: string): Promise<void> => {
    if (!session?.access_token) throw new Error('Not authenticated')

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: ['research-project-companies'] })
      queryClient.invalidateQueries({ queryKey: ['all-researched-companies'] })
      queryClient.invalidateQueries({ queryKey: ['research-projects'] })
    }

    // Recursive continuation — handles N phases (gather → synth-part1 → synth-part2)
    // Each edge function invocation gets a fresh 150s Supabase budget.
    const callEdgeFunction = (depth: number): Promise<void> => {
      if (depth > 5) {
        console.error('[Research] Max continuation depth reached')
        invalidateAll()
        return Promise.resolve()
      }

      return fetch(`${supabaseUrl}/functions/v1/company-research`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session!.access_token}`,
        },
        body: JSON.stringify({ researchProjectCompanyId, ...(llmModel ? { llm_model: llmModel } : {}) }),
      })
        .then(async (resp) => {
          if (!resp.ok) {
            const text = await resp.text().catch(() => '')
            console.error(`[Research] Phase ${depth} error: ${resp.status}`, text)
            invalidateAll()
            return
          }
          try {
            const data = await resp.json()
            if (data.needsContinuation) {
              console.log(`[Research] Phase ${depth} done (needsContinuation), starting phase ${depth + 1}...`)
              return callEdgeFunction(depth + 1)
            }
            console.log(`[Research] Complete after ${depth + 1} phase(s)`)
          } catch {
            console.log(`[Research] Phase ${depth} completed (no JSON body)`)
          }
          invalidateAll()
        })
        .catch((err) => {
          console.error(`[Research] Phase ${depth} fetch error:`, err)
          invalidateAll()
        })
    }

    // Fire first call (gather phase) — runs in background
    callEdgeFunction(0)

    // Wait briefly for the function to mark status as 'researching' in DB
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Invalidate to pick up 'researching' status; polling handles the rest
    queryClient.invalidateQueries({ queryKey: ['research-project-companies'] })
    queryClient.invalidateQueries({ queryKey: ['all-researched-companies'] })
  }

  // ── Reset stuck research ──
  const resetStuckResearch = async (researchProjectCompanyId: string) => {
    if (!user || !orgId) throw new Error('Not authenticated')
    const { error } = await supabase
      .from('research_project_companies')
      .update({
        status: 'pending',
        error_message: null,
        started_at: null,
      })
      .eq('id', researchProjectCompanyId)
      .eq('org_id', orgId)
    if (error) throw error
    queryClient.invalidateQueries({ queryKey: ['research-project-companies'] })
    queryClient.invalidateQueries({ queryKey: ['all-researched-companies'] })
  }

  // ── Run all pending ──
  const runAllPending = async (projectId: string, llmModel?: string) => {
    if (!session?.access_token) throw new Error('Not authenticated')
    const { data: pending } = await supabase
      .from('research_project_companies')
      .select('id')
      .eq('research_project_id', projectId)
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .order('queued_at', { ascending: true })

    if (!pending || pending.length === 0) return

    // Fire all research requests (they return immediately now)
    for (const item of pending) {
      try {
        await runResearch(item.id, llmModel)
      } catch (err) {
        console.error(`Research start failed for ${item.id}:`, err)
      }
    }
  }

  return (
    <CompanyResearchContext.Provider
      value={{
        projects,
        isLoadingProjects,
        createProject: async (data) => createProjectMutation.mutateAsync(data),
        updateProject: async (id, data) => updateProjectMutation.mutateAsync({ id, data }),
        deleteProject: async (id) => deleteProjectMutation.mutateAsync(id),
        getProjectCompanies: () => [],
        isLoadingCompanies: () => false,
        addCompanyToProject: async (projectId, company) => addCompanyMutation.mutateAsync({ projectId, company }),
        removeCompanyFromProject: async (id) => removeCompanyMutation.mutateAsync(id),
        runResearch,
        runAllPending,
        resetStuckResearch,
      }}
    >
      {children}
    </CompanyResearchContext.Provider>
  )
}

export function useCompanyResearch() {
  const context = useContext(CompanyResearchContext)
  if (context === undefined) {
    throw new Error('useCompanyResearch must be used within a CompanyResearchProvider')
  }
  return context
}

/**
 * Hook for fetching companies within a specific research project.
 * Polls every 5s while any company is in 'researching' status.
 */
export function useResearchProjectCompanies(projectId: string | undefined) {
  const { user } = useAuth()
  const { orgId } = useOrg()

  return useQuery({
    queryKey: ['research-project-companies', projectId],
    queryFn: async () => {
      if (!user || !orgId || !projectId) return []
      const { data, error } = await supabase
        .from('research_project_companies')
        .select('*')
        .eq('research_project_id', projectId)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as ResearchProjectCompany[]
    },
    enabled: !!user && !!orgId && !!projectId,
    // Poll every 5s while any company is actively being researched
    refetchInterval: (query) => {
      const companies = query.state.data
      if (!companies) return false
      const hasResearching = companies.some(c => c.status === 'researching')
      return hasResearching ? 5000 : false
    },
  })
}

/**
 * Hook for fetching ALL researched companies across ALL projects in the org.
 * Polls every 5s while any company is in 'researching' status.
 */
export interface ResearchedCompanyWithProject extends ResearchProjectCompany {
  project_name?: string
  researcher_name?: string
}

export function useAllResearchedCompanies() {
  const { user } = useAuth()
  const { orgId } = useOrg()

  return useQuery({
    queryKey: ['all-researched-companies', orgId],
    queryFn: async () => {
      if (!user || !orgId) return []

      const { data, error } = await supabase
        .from('research_project_companies')
        .select('*')
        .eq('org_id', orgId)
        .order('completed_at', { ascending: false, nullsFirst: false })

      if (error) throw error
      if (!data || data.length === 0) return []

      const projectIds = [...new Set(data.map(d => d.research_project_id))]
      const { data: projectRows } = await supabase
        .from('research_projects')
        .select('id, name')
        .in('id', projectIds)

      const projectNameMap: Record<string, string> = {}
      for (const p of projectRows || []) {
        projectNameMap[p.id] = p.name
      }

      const ownerIds = [...new Set(data.map(d => d.owner_id))]
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', ownerIds)

      const ownerNameMap: Record<string, string> = {}
      for (const p of profileRows || []) {
        ownerNameMap[p.user_id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown'
      }

      return data.map(d => ({
        ...d,
        project_name: projectNameMap[d.research_project_id] || 'Unknown Project',
        researcher_name: ownerNameMap[d.owner_id] || 'Unknown',
      })) as ResearchedCompanyWithProject[]
    },
    enabled: !!user && !!orgId,
    // Poll every 5s while any company is researching
    refetchInterval: (query) => {
      const companies = query.state.data
      if (!companies) return false
      const hasResearching = companies.some(c => c.status === 'researching')
      return hasResearching ? 5000 : false
    },
  })
}
