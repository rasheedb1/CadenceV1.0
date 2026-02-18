import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './AuthContext'
import { callEdgeFunction } from '@/lib/edge-functions'
import type {
  AccountMap,
  AccountMapCompany,
  BuyerPersona,
  ICPTemplate,
  FeedbackType,
  ICPInsight,
  TierKeywords,
  TierSeniority,
  OutreachStrategy,
} from '@/types/account-mapping'
import type { ICPBuilderData } from '@/types/icp-builder'
import type { EnrichCompanyResponse, ReEvaluateResponse, CompanyEnrichment } from '@/types/enrichment'
import type { CompanyRegistryEntry, RegistryType, ExclusionStats } from '@/types/registry'
import { EXCLUSION_TYPES } from '@/types/registry'
import { normalizeCompanyName } from '@/lib/company-normalize'

// ── Search Sales Navigator types ──

export interface SearchSalesNavigatorParams {
  accountMapId: string
  keywords?: string
  companyNames?: string[]
  titleKeywords?: string[]
  location?: string
  seniority?: string[]
  companySizeMin?: string
  companySizeMax?: string
  limit?: number
  cursor?: string
}

export interface SalesNavResult {
  firstName: string
  lastName: string
  title: string | null
  company: string | null
  linkedinUrl: string | null
  linkedinProviderId: string | null
  headline: string | null
  location: string | null
}

export interface SearchSalesNavigatorResponse {
  success: boolean
  results: SalesNavResult[]
  cursor: string | null
  hasMore: boolean
  total: number
}

// ── Enrich types ──

export interface EnrichProspectResponse {
  success: boolean
  enrichment: {
    emails_found: string[]
    phones_found: string[]
  }
  bestEmailMatch: string | null
  bestPhoneMatch: string | null
}

// ── Discover ICP types ──

export type FitCategory = 'high' | 'medium' | 'low'

export const FIT_CATEGORY_CONFIG: Record<FitCategory, { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
  high: { label: 'High Fit', variant: 'success' },
  medium: { label: 'Medium Fit', variant: 'warning' },
  low: { label: 'Low Fit', variant: 'destructive' },
}

export interface DiscoveredCompany {
  company_name: string
  industry: string | null
  company_size: string | null
  website: string | null
  location: string | null
  description: string | null
  relevance_reason: string | null
  relevance_score: number
  fit_category: FitCategory
  score_breakdown?: Record<string, number>
}

export interface DiscoverICPResponse {
  success: boolean
  companies: DiscoveredCompany[]
  excludedCompanies?: Array<{ company_name: string; reason: string }>
  queriesUsed: string[]
  totalSearchResults: number
  message?: string
}

// ── Suggested Buyer Persona types ──

export interface SuggestedPersona {
  name: string
  title_keywords: string[]
  seniority: string
  department: string
  reasoning: string
  // Adaptive fields (v2)
  description?: string
  role_in_buying_committee?: string
  departments?: string[]
  title_keywords_by_tier?: TierKeywords
  seniority_by_tier?: TierSeniority
}

// ── Context type ──

interface AccountMappingContextType {
  accountMaps: AccountMap[]
  isLoading: boolean
  // Account Maps CRUD
  createAccountMap: (name: string, description?: string) => Promise<AccountMap | null>
  updateAccountMap: (id: string, data: Partial<AccountMap>) => Promise<void>
  deleteAccountMap: (id: string) => Promise<void>
  // ICP polish + discover
  polishICPDescription: (description: string) => Promise<string>
  discoverICPCompanies: (icpDescription: string, min: number, max: number) => Promise<DiscoverICPResponse>
  // Companies CRUD
  addCompany: (company: Omit<AccountMapCompany, 'id' | 'created_at' | 'updated_at'>) => Promise<AccountMapCompany | null>
  updateCompany: (id: string, data: Partial<AccountMapCompany>) => Promise<void>
  deleteCompany: (id: string) => Promise<void>
  // Buyer Personas CRUD
  addPersona: (persona: Omit<BuyerPersona, 'id' | 'created_at' | 'updated_at'>) => Promise<BuyerPersona | null>
  updatePersona: (id: string, data: Partial<BuyerPersona>) => Promise<void>
  deletePersona: (id: string) => Promise<void>
  // Prospects
  saveProspects: (accountMapId: string, companyId: string | null, prospects: SalesNavResult[], options?: { personaId?: string; buyingRole?: string; searchMetadata?: Record<string, unknown> }) => Promise<number>
  saveProspectsBatch: (accountMapId: string, companyId: string | null, prospects: SalesNavResult[], options?: { personaId?: string; buyingRole?: string; searchMetadata?: Record<string, unknown> }) => Promise<number>
  refreshAccountMaps: () => void
  deleteProspect: (id: string) => Promise<void>
  // Edge function wrappers
  searchSalesNavigator: (params: SearchSalesNavigatorParams) => Promise<SearchSalesNavigatorResponse>
  enrichProspect: (prospectId: string, companyWebsite: string) => Promise<EnrichProspectResponse>
  // Promote to lead
  promoteProspectToLead: (prospectId: string, cadenceId?: string) => Promise<{ leadId: string; duplicate: boolean }>
  bulkPromoteProspects: (prospectIds: string[], cadenceId?: string) => Promise<{ promoted: number; duplicates: number }>
  // ICP Templates
  icpTemplates: ICPTemplate[]
  saveTemplate: (name: string, description: string | null, builderData: ICPBuilderData) => Promise<ICPTemplate | null>
  deleteTemplate: (id: string) => Promise<void>
  // ICP Feedback
  submitFeedback: (accountMapId: string, companyName: string, feedback: FeedbackType, discoveryData?: Record<string, unknown>) => Promise<void>
  deleteFeedback: (accountMapId: string, companyName: string) => Promise<void>
  getFeedbackForMap: (accountMapId: string) => Promise<Record<string, FeedbackType>>
  // Smart ICP Insights
  getSmartICPInsights: (accountMapId: string) => Promise<ICPInsight[]>
  // Buyer Persona Suggestions
  suggestBuyerPersonas: (accountMapId: string) => Promise<SuggestedPersona[]>
  suggestPersonaTitles: (params: { productCategory: string; companyDescription: string; buyingRole: string; personaDescription: string }) => Promise<{ tiers: TierKeywords; seniority: TierSeniority }>
  // Company Enrichment (Firecrawl)
  enrichCompany: (companyName: string, website?: string | null) => Promise<EnrichCompanyResponse>
  reEvaluateCompanies: (icpDescription: string, companies: Array<DiscoveredCompany & { enrichment?: CompanyEnrichment }>) => Promise<ReEvaluateResponse>
  // Company Registry
  companyRegistry: CompanyRegistryEntry[]
  registryLoading: boolean
  addRegistryEntry: (entry: { company_name_display: string; registry_type: RegistryType; source?: string; website?: string | null; industry?: string | null; company_size?: string | null; location?: string | null; exclusion_reason?: string | null }) => Promise<CompanyRegistryEntry | null>
  addRegistryEntries: (entries: Array<{ company_name_display: string; registry_type: RegistryType; source?: string; website?: string | null; industry?: string | null; exclusion_reason?: string | null }>) => Promise<number>
  updateRegistryEntry: (id: string, data: Partial<CompanyRegistryEntry>) => Promise<void>
  deleteRegistryEntry: (id: string) => Promise<void>
  getExclusionNames: () => string[]
  getExclusionStats: () => ExclusionStats
  // AI Prospect Validation
  validateProspects: (accountMapId: string, companyId: string, productDescription: string, productCategory: string) => Promise<{ validated: number; total: number }>
  skipProspect: (prospectId: string, reason?: string) => Promise<void>
  unskipProspect: (prospectId: string) => Promise<void>
  // Outreach Strategy
  getOutreachStrategy: (accountMapId: string, companyId: string, productDescription: string, productCategory: string) => Promise<OutreachStrategy | null>
}

const AccountMappingContext = createContext<AccountMappingContextType | undefined>(undefined)

export function AccountMappingProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth()
  const queryClient = useQueryClient()

  // ── Queries ──

  const { data: accountMaps = [], isLoading } = useQuery({
    queryKey: ['account-maps', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('account_maps')
        .select('*, account_map_companies(*), buyer_personas(*), prospects(*)')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as AccountMap[]
    },
    enabled: !!user,
  })

  // ── Account Maps CRUD ──

  const createAccountMapMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('account_maps')
        .insert({
          owner_id: user.id,
          name,
          description: description || null,
          filters_json: { industry: [], company_size: [], location: [], seniority: [], keywords: [], title_keywords: [] },
        })
        .select()
        .single()
      if (error) throw error
      return data as AccountMap
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account-maps'] }),
  })

  const updateAccountMapMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AccountMap> }) => {
      const { error } = await supabase.from('account_maps').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account-maps'] }),
  })

  const deleteAccountMapMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('account_maps').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account-maps'] }),
  })

  // ── Companies CRUD ──

  const addCompanyMutation = useMutation({
    mutationFn: async (company: Omit<AccountMapCompany, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('account_map_companies')
        .insert(company)
        .select()
        .single()
      if (error) throw error
      return data as AccountMapCompany
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account-maps'] }),
  })

  const updateCompanyMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<AccountMapCompany> }) => {
      const { error } = await supabase.from('account_map_companies').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account-maps'] }),
  })

  const deleteCompanyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('account_map_companies').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account-maps'] }),
  })

  // ── Buyer Personas CRUD ──

  const addPersonaMutation = useMutation({
    mutationFn: async (persona: Omit<BuyerPersona, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('buyer_personas')
        .insert(persona)
        .select()
        .single()
      if (error) throw error
      return data as BuyerPersona
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account-maps'] }),
  })

  const updatePersonaMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BuyerPersona> }) => {
      const { error } = await supabase.from('buyer_personas').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account-maps'] }),
  })

  const deletePersonaMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('buyer_personas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account-maps'] }),
  })

  // ── Prospects ──

  const deleteProspectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('prospects').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account-maps'] }),
  })

  // ── ICP Templates ──

  const { data: icpTemplates = [] } = useQuery({
    queryKey: ['icp-templates', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('icp_templates')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as ICPTemplate[]
    },
    enabled: !!user,
  })

  // ── Company Registry ──

  const { data: companyRegistry = [], isLoading: registryLoading } = useQuery({
    queryKey: ['company-registry', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('company_registry')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as CompanyRegistryEntry[]
    },
    enabled: !!user,
  })

  const addRegistryEntryMutation = useMutation({
    mutationFn: async (entry: { company_name_display: string; registry_type: RegistryType; source?: string; website?: string | null; industry?: string | null; company_size?: string | null; location?: string | null; exclusion_reason?: string | null }) => {
      if (!user) throw new Error('Not authenticated')
      const normalized = normalizeCompanyName(entry.company_name_display)
      if (!normalized) throw new Error('Company name is required')
      const { data, error } = await supabase
        .from('company_registry')
        .upsert({
          owner_id: user.id,
          company_name: normalized,
          company_name_display: entry.company_name_display.trim(),
          registry_type: entry.registry_type,
          source: entry.source || 'manual',
          website: entry.website || null,
          industry: entry.industry || null,
          company_size: entry.company_size || null,
          location: entry.location || null,
          exclusion_reason: entry.exclusion_reason || null,
        }, { onConflict: 'owner_id,company_name' })
        .select()
        .single()
      if (error) throw error
      return data as CompanyRegistryEntry
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company-registry'] }),
  })

  const updateRegistryEntryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CompanyRegistryEntry> }) => {
      const { error } = await supabase.from('company_registry').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company-registry'] }),
  })

  const deleteRegistryEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('company_registry').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company-registry'] }),
  })

  const saveTemplateMutation = useMutation({
    mutationFn: async ({ name, description, builderData }: { name: string; description: string | null; builderData: ICPBuilderData }) => {
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('icp_templates')
        .insert({ owner_id: user.id, name, description, builder_data: builderData })
        .select()
        .single()
      if (error) throw error
      return data as ICPTemplate
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['icp-templates'] }),
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('icp_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['icp-templates'] }),
  })

  return (
    <AccountMappingContext.Provider
      value={{
        accountMaps,
        isLoading,

        // Account Maps
        createAccountMap: async (name, description) =>
          createAccountMapMutation.mutateAsync({ name, description }),
        updateAccountMap: async (id, data) =>
          updateAccountMapMutation.mutateAsync({ id, data }),
        deleteAccountMap: async (id) =>
          deleteAccountMapMutation.mutateAsync(id),

        // Polish ICP description
        polishICPDescription: async (description) => {
          if (!session?.access_token) throw new Error('Not authenticated')
          const result = await callEdgeFunction<{ success: boolean; polishedPrompt: string }>(
            'ai-polish-prompt',
            { description, promptType: 'icp', language: 'es' },
            session.access_token
          )
          return result.polishedPrompt
        },

        // Discover ICP companies (with exclusion filtering)
        discoverICPCompanies: async (icpDescription, min, max) => {
          if (!session?.access_token) throw new Error('Not authenticated')
          // Gather exclusion names from registry (customers, competitors, DNC)
          const excludedCompanyNames = companyRegistry
            .filter(e => (EXCLUSION_TYPES as string[]).includes(e.registry_type))
            .map(e => e.company_name_display)
          return callEdgeFunction<DiscoverICPResponse>(
            'discover-icp-companies',
            { icpDescription, minCompanies: min, maxCompanies: max, excludedCompanies: excludedCompanyNames },
            session.access_token
          )
        },

        // Companies
        addCompany: async (company) =>
          addCompanyMutation.mutateAsync(company),
        updateCompany: async (id, data) =>
          updateCompanyMutation.mutateAsync({ id, data }),
        deleteCompany: async (id) =>
          deleteCompanyMutation.mutateAsync(id),

        // Personas
        addPersona: async (persona) =>
          addPersonaMutation.mutateAsync(persona),
        updatePersona: async (id, data) =>
          updatePersonaMutation.mutateAsync({ id, data }),
        deletePersona: async (id) =>
          deletePersonaMutation.mutateAsync(id),

        // Prospects: bulk save from search results
        saveProspects: async (accountMapId, companyId, prospects, options) => {
          if (!user) throw new Error('Not authenticated')
          const rows = prospects.map((p) => ({
            account_map_id: accountMapId,
            company_id: companyId,
            owner_id: user.id,
            first_name: p.firstName,
            last_name: p.lastName,
            title: p.title,
            company: p.company,
            linkedin_url: p.linkedinUrl,
            linkedin_provider_id: p.linkedinProviderId,
            headline: p.headline,
            location: p.location,
            source: 'sales_navigator' as const,
            status: 'new' as const,
            persona_id: options?.personaId || null,
            buying_role: options?.buyingRole || null,
            search_metadata: options?.searchMetadata || null,
          }))
          const { error } = await supabase.from('prospects').insert(rows)
          if (error) throw error
          queryClient.invalidateQueries({ queryKey: ['account-maps'] })
          return rows.length
        },

        // Batch variant: saves without invalidating React Query (for batch loop performance)
        saveProspectsBatch: async (accountMapId, companyId, prospects, options) => {
          if (!user) throw new Error('Not authenticated')
          const rows = prospects.map((p) => ({
            account_map_id: accountMapId,
            company_id: companyId,
            owner_id: user.id,
            first_name: p.firstName,
            last_name: p.lastName,
            title: p.title,
            company: p.company,
            linkedin_url: p.linkedinUrl,
            linkedin_provider_id: p.linkedinProviderId,
            headline: p.headline,
            location: p.location,
            source: 'sales_navigator' as const,
            status: 'new' as const,
            persona_id: options?.personaId || null,
            buying_role: options?.buyingRole || null,
            search_metadata: options?.searchMetadata || null,
          }))
          const { error } = await supabase.from('prospects').insert(rows)
          if (error) throw error
          return rows.length
        },

        // Manual refresh after batch operations
        refreshAccountMaps: () => {
          queryClient.invalidateQueries({ queryKey: ['account-maps'] })
        },

        deleteProspect: async (id) =>
          deleteProspectMutation.mutateAsync(id),

        // Edge function: Sales Navigator search
        searchSalesNavigator: async (params) => {
          if (!session?.access_token) throw new Error('Not authenticated')
          return callEdgeFunction<SearchSalesNavigatorResponse>(
            'search-sales-navigator',
            {
              accountMapId: params.accountMapId,
              keywords: params.keywords,
              companyNames: params.companyNames,
              titleKeywords: params.titleKeywords,
              location: params.location,
              seniority: params.seniority,
              companySizeMin: params.companySizeMin,
              companySizeMax: params.companySizeMax,
              limit: params.limit,
              cursor: params.cursor,
            },
            session.access_token
          )
        },

        // Edge function: Enrich prospect
        enrichProspect: async (prospectId, companyWebsite) => {
          if (!session?.access_token) throw new Error('Not authenticated')
          const result = await callEdgeFunction<EnrichProspectResponse>(
            'enrich-prospect',
            { prospectId, companyWebsite },
            session.access_token
          )
          queryClient.invalidateQueries({ queryKey: ['account-maps'] })
          return result
        },

        // Promote prospect → lead
        promoteProspectToLead: async (prospectId, cadenceId) => {
          if (!user) throw new Error('Not authenticated')

          // Fetch the prospect
          const { data: prospect, error: pErr } = await supabase
            .from('prospects')
            .select('*')
            .eq('id', prospectId)
            .eq('owner_id', user.id)
            .single()
          if (pErr || !prospect) throw new Error('Prospect not found')

          // Check for duplicate leads (same linkedin_url or email)
          let duplicate = false
          if (prospect.linkedin_url) {
            const { data: existing } = await supabase
              .from('leads')
              .select('id')
              .eq('owner_id', user.id)
              .eq('linkedin_url', prospect.linkedin_url)
              .limit(1)
            if (existing && existing.length > 0) duplicate = true
          }
          if (!duplicate && prospect.email) {
            const { data: existing } = await supabase
              .from('leads')
              .select('id')
              .eq('owner_id', user.id)
              .eq('email', prospect.email)
              .limit(1)
            if (existing && existing.length > 0) duplicate = true
          }

          // Insert into leads
          const { data: newLead, error: leadErr } = await supabase
            .from('leads')
            .insert({
              owner_id: user.id,
              first_name: prospect.first_name,
              last_name: prospect.last_name,
              email: prospect.email,
              phone: prospect.phone,
              title: prospect.title,
              company: prospect.company,
              linkedin_url: prospect.linkedin_url,
            })
            .select('id')
            .single()
          if (leadErr) throw leadErr

          // Update prospect status
          await supabase
            .from('prospects')
            .update({ status: 'promoted', promoted_lead_id: newLead.id })
            .eq('id', prospectId)

          // If cadenceId provided, assign lead to cadence
          if (cadenceId) {
            const { data: cadence } = await supabase
              .from('cadences')
              .select('*, cadence_steps(*)')
              .eq('id', cadenceId)
              .single()

            if (cadence) {
              const steps = (cadence.cadence_steps || []) as Array<{ id: string; day_offset: number; order_in_day: number }>
              const sorted = [...steps].sort((a, b) => {
                if (a.day_offset !== b.day_offset) return a.day_offset - b.day_offset
                return a.order_in_day - b.order_in_day
              })
              const firstStepId = sorted[0]?.id || null

              await supabase.from('cadence_leads').insert({
                lead_id: newLead.id,
                cadence_id: cadenceId,
                owner_id: user.id,
                current_step_id: firstStepId,
                status: 'active',
              })
            }
          }

          queryClient.invalidateQueries({ queryKey: ['account-maps'] })
          queryClient.invalidateQueries({ queryKey: ['leads'] })

          return { leadId: newLead.id, duplicate }
        },

        // Bulk promote
        bulkPromoteProspects: async (prospectIds, cadenceId) => {
          if (!user) throw new Error('Not authenticated')
          let promoted = 0
          let duplicates = 0

          for (const pid of prospectIds) {
            try {
              const result = await (async () => {
                // Inline promote logic for each
                const { data: prospect } = await supabase
                  .from('prospects')
                  .select('*')
                  .eq('id', pid)
                  .eq('owner_id', user.id)
                  .single()
                if (!prospect) return null

                // Skip already promoted
                if (prospect.status === 'promoted') return null

                let isDuplicate = false
                if (prospect.linkedin_url) {
                  const { data: existing } = await supabase
                    .from('leads')
                    .select('id')
                    .eq('owner_id', user.id)
                    .eq('linkedin_url', prospect.linkedin_url)
                    .limit(1)
                  if (existing && existing.length > 0) isDuplicate = true
                }
                if (!isDuplicate && prospect.email) {
                  const { data: existing } = await supabase
                    .from('leads')
                    .select('id')
                    .eq('owner_id', user.id)
                    .eq('email', prospect.email)
                    .limit(1)
                  if (existing && existing.length > 0) isDuplicate = true
                }

                const { data: newLead, error: leadErr } = await supabase
                  .from('leads')
                  .insert({
                    owner_id: user.id,
                    first_name: prospect.first_name,
                    last_name: prospect.last_name,
                    email: prospect.email,
                    phone: prospect.phone,
                    title: prospect.title,
                    company: prospect.company,
                    linkedin_url: prospect.linkedin_url,
                  })
                  .select('id')
                  .single()
                if (leadErr) throw leadErr

                await supabase
                  .from('prospects')
                  .update({ status: 'promoted', promoted_lead_id: newLead.id })
                  .eq('id', pid)

                if (cadenceId) {
                  const { data: cadence } = await supabase
                    .from('cadences')
                    .select('*, cadence_steps(*)')
                    .eq('id', cadenceId)
                    .single()
                  if (cadence) {
                    const steps = (cadence.cadence_steps || []) as Array<{ id: string; day_offset: number; order_in_day: number }>
                    const sorted = [...steps].sort((a, b) => {
                      if (a.day_offset !== b.day_offset) return a.day_offset - b.day_offset
                      return a.order_in_day - b.order_in_day
                    })
                    await supabase.from('cadence_leads').insert({
                      lead_id: newLead.id,
                      cadence_id: cadenceId,
                      owner_id: user.id,
                      current_step_id: sorted[0]?.id || null,
                      status: 'active',
                    })
                  }
                }

                return { isDuplicate }
              })()

              if (result) {
                promoted++
                if (result.isDuplicate) duplicates++
              }
            } catch (err) {
              console.error(`Failed to promote prospect ${pid}:`, err)
            }
          }

          queryClient.invalidateQueries({ queryKey: ['account-maps'] })
          queryClient.invalidateQueries({ queryKey: ['leads'] })

          return { promoted, duplicates }
        },

        // ICP Templates
        icpTemplates,
        saveTemplate: async (name, description, builderData) =>
          saveTemplateMutation.mutateAsync({ name, description, builderData }),
        deleteTemplate: async (id) =>
          deleteTemplateMutation.mutateAsync(id),

        // ICP Feedback
        submitFeedback: async (accountMapId, companyName, feedback, discoveryData) => {
          if (!user) throw new Error('Not authenticated')
          const { error } = await supabase
            .from('icp_discovery_feedback')
            .upsert(
              {
                account_map_id: accountMapId,
                owner_id: user.id,
                company_name: companyName,
                feedback,
                discovery_data: discoveryData || null,
              },
              { onConflict: 'account_map_id,company_name,owner_id' }
            )
          if (error) throw error
        },

        deleteFeedback: async (accountMapId, companyName) => {
          if (!user) throw new Error('Not authenticated')
          const { error } = await supabase
            .from('icp_discovery_feedback')
            .delete()
            .eq('account_map_id', accountMapId)
            .eq('company_name', companyName)
            .eq('owner_id', user.id)
          if (error) throw error
        },

        getFeedbackForMap: async (accountMapId) => {
          if (!user) throw new Error('Not authenticated')
          const { data, error } = await supabase
            .from('icp_discovery_feedback')
            .select('company_name, feedback')
            .eq('account_map_id', accountMapId)
            .eq('owner_id', user.id)
          if (error) throw error
          const map: Record<string, FeedbackType> = {}
          for (const row of data || []) {
            map[row.company_name] = row.feedback as FeedbackType
          }
          return map
        },

        // Smart ICP Insights
        getSmartICPInsights: async (accountMapId) => {
          if (!session?.access_token) throw new Error('Not authenticated')
          const result = await callEdgeFunction<{ success: boolean; insights: ICPInsight[] }>(
            'analyze-icp-feedback',
            { accountMapId },
            session.access_token
          )
          return result.insights
        },

        // Buyer Persona Suggestions
        suggestBuyerPersonas: async (accountMapId) => {
          if (!session?.access_token) throw new Error('Not authenticated')
          const result = await callEdgeFunction<{ success: boolean; personas: SuggestedPersona[] }>(
            'suggest-buyer-personas',
            { accountMapId },
            session.access_token
          )
          return result.personas
        },

        suggestPersonaTitles: async (params) => {
          if (!session?.access_token) throw new Error('Not authenticated')
          return callEdgeFunction<{ success: boolean; tiers: TierKeywords; seniority: TierSeniority }>(
            'suggest-persona-titles',
            params,
            session.access_token
          )
        },

        // Company Enrichment (Firecrawl)
        enrichCompany: async (companyName, website) => {
          if (!session?.access_token) throw new Error('Not authenticated')
          return callEdgeFunction<EnrichCompanyResponse>(
            'enrich-company',
            { companyName, website },
            session.access_token
          )
        },
        reEvaluateCompanies: async (icpDescription, companies) => {
          if (!session?.access_token) throw new Error('Not authenticated')
          return callEdgeFunction<ReEvaluateResponse>(
            're-evaluate-companies',
            { icpDescription, companies },
            session.access_token
          )
        },

        // AI Prospect Validation
        validateProspects: async (accountMapId, companyId, productDescription, productCategory) => {
          if (!session?.access_token) throw new Error('Not authenticated')
          const result = await callEdgeFunction<{ success: boolean; validated: number; total: number }>(
            'validate-prospects',
            { accountMapId, companyId, productDescription, productCategory },
            session.access_token
          )
          queryClient.invalidateQueries({ queryKey: ['account-maps'] })
          return { validated: result.validated, total: result.total }
        },
        skipProspect: async (prospectId, reason) => {
          if (!user) throw new Error('Not authenticated')
          const { error } = await supabase
            .from('prospects')
            .update({ skipped: true, skip_reason: reason || null })
            .eq('id', prospectId)
            .eq('owner_id', user.id)
          if (error) throw error
          queryClient.invalidateQueries({ queryKey: ['account-maps'] })
        },
        unskipProspect: async (prospectId) => {
          if (!user) throw new Error('Not authenticated')
          const { error } = await supabase
            .from('prospects')
            .update({ skipped: false, skip_reason: null })
            .eq('id', prospectId)
            .eq('owner_id', user.id)
          if (error) throw error
          queryClient.invalidateQueries({ queryKey: ['account-maps'] })
        },
        // Outreach Strategy
        getOutreachStrategy: async (accountMapId, companyId, productDescription, productCategory) => {
          if (!session?.access_token) throw new Error('Not authenticated')
          const result = await callEdgeFunction<{ success: boolean; strategy: OutreachStrategy | null }>(
            'suggest-outreach-strategy',
            { accountMapId, companyId, productDescription, productCategory },
            session.access_token
          )
          return result.strategy || null
        },

        // Company Registry
        companyRegistry,
        registryLoading,
        addRegistryEntry: async (entry) =>
          addRegistryEntryMutation.mutateAsync(entry),
        addRegistryEntries: async (entries) => {
          if (!user) throw new Error('Not authenticated')
          const rows = entries.map(e => ({
            owner_id: user.id,
            company_name: normalizeCompanyName(e.company_name_display),
            company_name_display: e.company_name_display.trim(),
            registry_type: e.registry_type,
            source: e.source || 'csv_import',
            website: e.website || null,
            industry: e.industry || null,
            exclusion_reason: e.exclusion_reason || null,
          }))
          const { error } = await supabase
            .from('company_registry')
            .upsert(rows, { onConflict: 'owner_id,company_name' })
          if (error) throw error
          queryClient.invalidateQueries({ queryKey: ['company-registry'] })
          return rows.length
        },
        updateRegistryEntry: async (id, data) =>
          updateRegistryEntryMutation.mutateAsync({ id, data }),
        deleteRegistryEntry: async (id) =>
          deleteRegistryEntryMutation.mutateAsync(id),
        getExclusionNames: () =>
          companyRegistry
            .filter(e => (EXCLUSION_TYPES as string[]).includes(e.registry_type))
            .map(e => e.company_name_display),
        getExclusionStats: () => {
          const exclusions = companyRegistry.filter(e => (EXCLUSION_TYPES as string[]).includes(e.registry_type))
          const byType: Partial<Record<RegistryType, number>> = {}
          for (const e of exclusions) {
            byType[e.registry_type] = (byType[e.registry_type] || 0) + 1
          }
          return { total: exclusions.length, byType }
        },
      }}
    >
      {children}
    </AccountMappingContext.Provider>
  )
}

export function useAccountMapping() {
  const context = useContext(AccountMappingContext)
  if (context === undefined) {
    throw new Error('useAccountMapping must be used within an AccountMappingProvider')
  }
  return context
}
