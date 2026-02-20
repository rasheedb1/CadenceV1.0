import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import type { SenderPersona } from '@/lib/edge-functions'
import { toast } from 'sonner'

export function useSenderPersona() {
  const { user } = useAuth()
  const { orgId } = useOrg()
  const queryClient = useQueryClient()

  const { data: persona, isLoading } = useQuery({
    queryKey: ['sender-persona', user?.id, orgId],
    queryFn: async () => {
      if (!user || !orgId) return null
      const { data, error } = await supabase
        .from('sender_personas')
        .select('*')
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return (data as SenderPersona) || null
    },
    enabled: !!user && !!orgId,
  })

  const saveMutation = useMutation({
    mutationFn: async (form: Omit<SenderPersona, 'id' | 'user_id' | 'org_id' | 'created_at' | 'updated_at'>) => {
      if (!user || !orgId) throw new Error('Not authenticated')

      const payload = {
        user_id: user.id,
        org_id: orgId,
        full_name: form.full_name,
        role: form.role,
        company: form.company,
        value_proposition: form.value_proposition,
        credibility: form.credibility || '',
        communication_style: form.communication_style,
        signature: form.signature || '',
        updated_at: new Date().toISOString(),
      }

      if (persona?.id) {
        const { error } = await supabase
          .from('sender_personas')
          .update(payload)
          .eq('id', persona.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('sender_personas')
          .insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sender-persona'] })
      toast.success('Perfil de remitente guardado')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al guardar perfil'),
  })

  return {
    persona,
    isLoading,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  }
}
