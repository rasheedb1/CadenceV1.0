import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { supabase } from '@/integrations/supabase/client'
import { callEdgeFunction } from '@/lib/edge-functions'
import { toast } from 'sonner'

export interface SalesforceConnectionStatus {
  isConnected: boolean
  sfUsername: string | null
  instanceUrl: string | null
  lastSyncAt: string | null
  lastError: string | null
}

export function useSalesforceConnection() {
  const { session } = useAuth()
  const { orgId } = useOrg()
  const queryClient = useQueryClient()
  const [actionLoading, setActionLoading] = useState(false)

  const { data: status, isLoading } = useQuery({
    queryKey: ['salesforce-connection', orgId],
    queryFn: async (): Promise<SalesforceConnectionStatus> => {
      const { data, error } = await supabase
        .from('salesforce_connections')
        .select('sf_username, instance_url, last_sync_at, last_error, is_active')
        .eq('org_id', orgId!)
        .eq('is_active', true)
        .maybeSingle()

      if (error || !data) {
        return { isConnected: false, sfUsername: null, instanceUrl: null, lastSyncAt: null, lastError: null }
      }

      return {
        isConnected: true,
        sfUsername: data.sf_username,
        instanceUrl: data.instance_url,
        lastSyncAt: data.last_sync_at,
        lastError: data.last_error,
      }
    },
    enabled: !!orgId,
  })

  const connect = useCallback(async () => {
    if (!session?.access_token) return
    setActionLoading(true)
    try {
      const result = await callEdgeFunction<{ authUrl: string }>(
        'salesforce-auth',
        {},
        session.access_token
      )
      // Redirect to Salesforce OAuth
      window.location.href = result.authUrl
    } catch (err) {
      toast.error('Failed to initiate Salesforce connection')
      console.error('Salesforce connect error:', err)
      setActionLoading(false)
    }
  }, [session?.access_token])

  const disconnect = useCallback(async () => {
    if (!session?.access_token) return
    setActionLoading(true)
    try {
      await callEdgeFunction('salesforce-disconnect', {}, session.access_token)
      queryClient.invalidateQueries({ queryKey: ['salesforce-connection'] })
      queryClient.invalidateQueries({ queryKey: ['salesforce-check'] })
      toast.success('Salesforce disconnected')
    } catch (err) {
      toast.error('Failed to disconnect Salesforce')
      console.error('Salesforce disconnect error:', err)
    } finally {
      setActionLoading(false)
    }
  }, [session?.access_token, queryClient])

  const sync = useCallback(async () => {
    if (!session?.access_token) return
    setActionLoading(true)
    try {
      const result = await callEdgeFunction<{ accountsCount: number; opportunitiesCount: number }>(
        'salesforce-sync',
        {},
        session.access_token
      )
      queryClient.invalidateQueries({ queryKey: ['salesforce-connection'] })
      queryClient.invalidateQueries({ queryKey: ['salesforce-check'] })
      toast.success(`Synced ${result.accountsCount} accounts with ${result.opportunitiesCount} opportunities`)
    } catch (err) {
      toast.error('Failed to sync Salesforce data')
      console.error('Salesforce sync error:', err)
    } finally {
      setActionLoading(false)
    }
  }, [session?.access_token, queryClient])

  return {
    status: status || { isConnected: false, sfUsername: null, instanceUrl: null, lastSyncAt: null, lastError: null },
    isLoading,
    actionLoading,
    connect,
    disconnect,
    sync,
  }
}
