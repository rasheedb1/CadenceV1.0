import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { supabase } from '@/integrations/supabase/client'

export interface GmailConnectionStatus {
  isConnected: boolean
  email: string | null
  connectedAt: string | null
}

export function useGmailConnection() {
  const { user, session } = useAuth()
  const { orgId } = useOrg()
  const [status, setStatus] = useState<GmailConnectionStatus>({
    isConnected: false,
    email: null,
    connectedAt: null,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!user?.id || !orgId) return
    setIsLoading(true)
    try {
      const { data } = await supabase
        .from('ae_integrations')
        .select('config, connected_at')
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .eq('provider', 'gmail')
        .single()

      if (data) {
        const cfg = data.config as { email?: string | null } | null
        setStatus({
          isConnected: true,
          email: cfg?.email || null,
          connectedAt: data.connected_at || null,
        })
      } else {
        setStatus({ isConnected: false, email: null, connectedAt: null })
      }
    } catch {
      setStatus({ isConnected: false, email: null, connectedAt: null })
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, orgId])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const connect = async () => {
    if (!session?.access_token) {
      setMessage({ type: 'error', text: 'Debes estar logueado para conectar Gmail.' })
      return
    }
    setActionLoading(true)
    setMessage(null)
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ae-google-oauth`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      )
      const data = await resp.json()
      if (data.url) {
        // Store origin so AccountExecutive can redirect back here after OAuth
        sessionStorage.setItem('gmailOAuthOrigin', window.location.pathname)
        window.location.href = data.url
      } else {
        setMessage({ type: 'error', text: data.error || 'No se pudo iniciar la conexión con Google.' })
        setActionLoading(false)
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Error iniciando la conexión con Google.' })
      setActionLoading(false)
    }
  }

  const disconnect = async () => {
    if (!user?.id || !orgId) return
    if (!window.confirm('¿Desconectar Gmail? Los emails del cadence dejarán de enviarse.')) return
    setActionLoading(true)
    setMessage(null)
    try {
      await supabase
        .from('ae_integrations')
        .delete()
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .eq('provider', 'gmail')
      setStatus({ isConnected: false, email: null, connectedAt: null })
      setMessage({ type: 'success', text: 'Gmail desconectado.' })
    } catch {
      setMessage({ type: 'error', text: 'No se pudo desconectar Gmail.' })
    } finally {
      setActionLoading(false)
    }
  }

  return { status, isLoading, actionLoading, message, setMessage, connect, disconnect, refetch: fetchStatus }
}
