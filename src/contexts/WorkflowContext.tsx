import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './AuthContext'
import { useOrg } from './OrgContext'
import type { Workflow, WorkflowGraph, WorkflowRun, WorkflowEventLog } from '@/types/workflow'

interface WorkflowContextType {
  workflows: Workflow[]
  isLoading: boolean
  createWorkflow: (name: string) => Promise<Workflow | null>
  updateWorkflow: (id: string, data: Partial<Workflow>) => Promise<void>
  deleteWorkflow: (id: string) => Promise<void>
  saveGraph: (id: string, graphJson: WorkflowGraph) => Promise<void>
  activateWorkflow: (id: string) => Promise<void>
  pauseWorkflow: (id: string) => Promise<void>
  getWorkflowRuns: (workflowId: string) => WorkflowRun[]
  getWorkflowEventLog: (runId: string) => WorkflowEventLog[]
  enrollLeads: (workflowId: string, leadIds: string[]) => Promise<void>
}

const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined)

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { orgId } = useOrg()
  const queryClient = useQueryClient()

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ['workflows', orgId],
    queryFn: async () => {
      if (!user || !orgId) return []
      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as Workflow[]
    },
    enabled: !!user && !!orgId,
  })

  const createWorkflowMutation = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      if (!user || !orgId) throw new Error('Not authenticated')

      const defaultGraph: WorkflowGraph = {
        nodes: [
          {
            id: 'trigger-1',
            type: 'trigger_manual',
            position: { x: 250, y: 50 },
            data: { label: 'Manual Trigger' },
          },
        ],
        edges: [],
      }

      const { data, error } = await supabase
        .from('workflows')
        .insert({
          name,
          owner_id: user.id,
          org_id: orgId,
          status: 'draft',
          graph_json: defaultGraph,
          trigger_type: 'manual',
        })
        .select()
        .single()
      if (error) throw error
      return data as Workflow
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
  })

  const updateWorkflowMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Workflow> }) => {
      const { error } = await supabase.from('workflows').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
  })

  const deleteWorkflowMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workflows').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
  })

  const saveGraphMutation = useMutation({
    mutationFn: async ({ id, graphJson }: { id: string; graphJson: WorkflowGraph }) => {
      const { error } = await supabase
        .from('workflows')
        .update({ graph_json: graphJson })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
  })

  const enrollLeadsMutation = useMutation({
    mutationFn: async ({ workflowId, leadIds }: { workflowId: string; leadIds: string[] }) => {
      if (!user || !orgId) throw new Error('Not authenticated')

      const workflow = workflows.find((w) => w.id === workflowId)
      if (!workflow) throw new Error('Workflow not found')

      const triggerNode = workflow.graph_json.nodes.find((n) =>
        n.type?.startsWith('trigger_')
      )
      if (!triggerNode) throw new Error('Workflow has no trigger node')

      // Find the first node after the trigger
      const outgoingEdge = workflow.graph_json.edges.find(
        (e) => e.source === triggerNode.id
      )
      const firstNodeId = outgoingEdge?.target || triggerNode.id

      const runs = leadIds.map((leadId) => ({
        workflow_id: workflowId,
        lead_id: leadId,
        owner_id: user.id,
        org_id: orgId,
        current_node_id: firstNodeId,
        status: 'running' as const,
      }))

      const { error } = await supabase.from('workflow_runs').upsert(runs, {
        onConflict: 'workflow_id,lead_id',
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-runs'] })
    },
  })

  // Workflow runs query — returns cached data for a workflow
  const { data: allRuns = [] } = useQuery({
    queryKey: ['workflow-runs', orgId],
    queryFn: async () => {
      if (!user || !orgId) return []
      const { data, error } = await supabase
        .from('workflow_runs')
        .select('*')
        .eq('org_id', orgId)
        .order('started_at', { ascending: false })
      if (error) throw error
      return (data || []) as WorkflowRun[]
    },
    enabled: !!user && !!orgId,
  })

  const { data: allEventLogs = [] } = useQuery({
    queryKey: ['workflow-event-log', orgId],
    queryFn: async () => {
      if (!user || !orgId) return []
      const { data, error } = await supabase
        .from('workflow_event_log')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data || []) as WorkflowEventLog[]
    },
    enabled: !!user && !!orgId,
  })

  return (
    <WorkflowContext.Provider
      value={{
        workflows,
        isLoading,
        createWorkflow: async (name) => createWorkflowMutation.mutateAsync({ name }),
        updateWorkflow: async (id, data) => updateWorkflowMutation.mutateAsync({ id, data }),
        deleteWorkflow: async (id) => deleteWorkflowMutation.mutateAsync(id),
        saveGraph: async (id, graphJson) => saveGraphMutation.mutateAsync({ id, graphJson }),
        activateWorkflow: async (id) =>
          updateWorkflowMutation.mutateAsync({ id, data: { status: 'active' } }),
        pauseWorkflow: async (id) =>
          updateWorkflowMutation.mutateAsync({ id, data: { status: 'paused' } }),
        getWorkflowRuns: (workflowId) =>
          allRuns.filter((r) => r.workflow_id === workflowId),
        getWorkflowEventLog: (runId) =>
          allEventLogs.filter((e) => e.workflow_run_id === runId),
        enrollLeads: async (workflowId, leadIds) =>
          enrollLeadsMutation.mutateAsync({ workflowId, leadIds }),
      }}
    >
      {children}
    </WorkflowContext.Provider>
  )
}

export function useWorkflow() {
  const context = useContext(WorkflowContext)
  if (context === undefined) {
    throw new Error('useWorkflow must be used within a WorkflowProvider')
  }
  return context
}
