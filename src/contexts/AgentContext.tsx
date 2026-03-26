import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './AuthContext'
import { useOrg } from './OrgContext'

export interface AgentSkill {
  id: string
  agent_id: string
  skill_name: string
  skill_config: Record<string, unknown>
  enabled: boolean
  created_at: string
}

export interface Agent {
  id: string
  org_id: string
  name: string
  role: string
  description: string | null
  soul_md: string
  status: 'draft' | 'deploying' | 'active' | 'paused' | 'error' | 'destroyed'
  railway_service_id: string | null
  railway_url: string | null
  config: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
  agent_skills: AgentSkill[]
}

export interface AgentTask {
  id: string
  org_id: string
  agent_id: string
  delegated_by: string
  instruction: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

interface AgentContextType {
  agents: Agent[]
  isLoading: boolean
  createAgent: (name: string, role: string, description: string) => Promise<Agent | null>
  updateAgent: (id: string, updates: Partial<Agent>) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
  getAgentTasks: (agentId: string) => AgentTask[]
}

const AgentContext = createContext<AgentContextType | undefined>(undefined)

function generateSoulMd(name: string, role: string, description: string): string {
  return `# ${name}

## Identidad
Eres **${name}**, un agente AI con el rol de **${role}** dentro de la organización.
${description ? `\n${description}\n` : ''}

## Idioma
- Español es tu idioma principal. Si el usuario escribe en inglés, responde en inglés.

## Personalidad
- Profesional y directo.
- Eficiente — vas al grano.
- Proactivo — sugieres siguientes pasos.

## Reglas
- Sé directo, eficiente y profesional.
- Reporta resultados de forma concisa.
- Siempre necesitas org_id para operaciones con datos.
- Nunca expongas tokens, keys o IDs internos al usuario.`
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { orgId } = useOrg()
  const queryClient = useQueryClient()

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents', orgId],
    queryFn: async () => {
      if (!user || !orgId) return []
      const { data, error } = await supabase
        .from('agents')
        .select('*, agent_skills(*)')
        .eq('org_id', orgId)
        .neq('status', 'destroyed')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as Agent[]
    },
    enabled: !!user && !!orgId,
  })

  // Tasks query — fetches all tasks for the org
  const { data: allTasks = [] } = useQuery({
    queryKey: ['agent-tasks', orgId],
    queryFn: async () => {
      if (!user || !orgId) return []
      const { data, error } = await supabase
        .from('agent_tasks')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data || []) as AgentTask[]
    },
    enabled: !!user && !!orgId,
  })

  const createAgentMutation = useMutation({
    mutationFn: async ({ name, role, description }: { name: string; role: string; description: string }) => {
      if (!user || !orgId) throw new Error('Not authenticated')
      const soulMd = generateSoulMd(name, role, description)
      const { data, error } = await supabase.functions.invoke('manage-agent', {
        method: 'POST',
        body: { org_id: orgId, name, role, description, soul_md: soulMd, created_by: user.id },
      })
      if (error) throw error
      return data.agent as Agent
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  })

  const updateAgentMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Agent> }) => {
      const { error } = await supabase.functions.invoke('manage-agent', {
        method: 'PATCH',
        body: { agent_id: id, updates },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  })

  const deleteAgentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke('manage-agent', {
        method: 'DELETE',
        body: { agent_id: id },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  })

  const getAgentTasks = (agentId: string) => allTasks.filter(t => t.agent_id === agentId)

  return (
    <AgentContext.Provider
      value={{
        agents,
        isLoading,
        createAgent: async (name, role, description) => createAgentMutation.mutateAsync({ name, role, description }),
        updateAgent: async (id, updates) => updateAgentMutation.mutateAsync({ id, updates }),
        deleteAgent: async (id) => deleteAgentMutation.mutateAsync(id),
        getAgentTasks,
      }}
    >
      {children}
    </AgentContext.Provider>
  )
}

export function useAgents() {
  const context = useContext(AgentContext)
  if (context === undefined) {
    throw new Error('useAgents must be used within an AgentProvider')
  }
  return context
}
