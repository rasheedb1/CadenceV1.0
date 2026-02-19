import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { callEdgeFunction } from '@/lib/edge-functions'

export interface SalesforceMatch {
  query: string
  match_type: 'domain' | 'name'
  sf_account_name: string
  has_active_opportunities: boolean
  active_opportunities_count: number
  total_pipeline_value: number
  latest_opportunity: {
    name: string | null
    stage: string | null
    amount: number | null
    close_date: string | null
    owner: string | null
  } | null
}

interface CheckResult {
  matches: SalesforceMatch[]
  unmatched_domains: string[]
  unmatched_names: string[]
}

// Check a list of domains/company names against Salesforce cached data
export function useSalesforceCheck(
  domains?: string[],
  companyNames?: string[],
  enabled = true
) {
  const { session } = useAuth()
  const { orgId } = useOrg()

  const queryKey = ['salesforce-check', orgId, domains?.join(','), companyNames?.join(',')]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<CheckResult> => {
      if (!session?.access_token) return { matches: [], unmatched_domains: [], unmatched_names: [] }

      return callEdgeFunction<CheckResult>(
        'salesforce-check-accounts',
        {
          domains: domains || [],
          company_names: companyNames || [],
        },
        session.access_token
      )
    },
    enabled: enabled && !!orgId && !!session?.access_token && ((domains && domains.length > 0) || (companyNames && companyNames.length > 0)),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Helper: check if a specific domain or company name is in the pipeline
  const isInPipeline = (domainOrName: string): SalesforceMatch | null => {
    if (!data?.matches) return null
    const lower = domainOrName.toLowerCase().replace(/^www\./, '')
    return data.matches.find(
      m => m.query.toLowerCase() === lower || m.sf_account_name.toLowerCase().includes(lower)
    ) || null
  }

  return {
    matches: data?.matches || [],
    unmatchedDomains: data?.unmatched_domains || [],
    unmatchedNames: data?.unmatched_names || [],
    isLoading,
    isInPipeline,
  }
}
