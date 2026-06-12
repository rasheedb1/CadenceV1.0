import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

export type FlowStep = {
  step_id: string
  day_offset: number
  order_in_day: number
  step_type: string
  step_label: string
  skill: { id: string; name: string; display_name: string } | null
  signal_allocation: string | null
  config: {
    has_ai_prompt: boolean
    has_research_prompt: boolean
    has_template: boolean
  }
  carlos: {
    threshold: number | null
    min_acceptable: number | null
    max_attempts: number | null
    avg_score_30d: number | null
    samples: number
  }
  metrics: {
    scheduled: number
    executed: number
    failed: number
    skipped: number
    success_rate: number | null
  }
  recent_runs: Array<{
    instance_id: string
    lead_id: string
    lead_name: string
    company: string | null
    status: string
    updated_at: string
    carlos_score: number | null
  }>
}

export type CadenceFlowMetrics = {
  cadence: {
    id: string
    name: string
    status: string
    automation_mode: string
    timezone: string
    total_steps: number
    total_days: number
  }
  days_window: number
  steps: FlowStep[]
  generated_at: string
}

export function useCadenceFlowMetrics(cadenceId: string | null | undefined, daysWindow = 30) {
  const { session } = useAuth()
  const token = session?.access_token ?? null

  return useQuery<CadenceFlowMetrics>({
    queryKey: ['cadence-flow-metrics', cadenceId, daysWindow],
    enabled: !!cadenceId && !!token,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('cadence-flow-metrics', {
        method: 'POST',
        body: { cadence_id: cadenceId, days_window: daysWindow },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      return data as CadenceFlowMetrics
    },
  })
}
