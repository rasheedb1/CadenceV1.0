import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { callEdgeFunction } from '@/lib/edge-functions'

export interface GmailConnectionStatus {
  isConnected: boolean
  accountId: string | null
  connectedAt: string | null
}

interface UseGmailConnectionOptions {
  redirectPath?: string
}

// Read and clean URL params once at module level so they survive re-renders
function readOAuthCallback(): 'success' | 'failed' | 'cancelled' | null {
  const urlParams = new URLSearchParams(window.location.search)
  const status = urlParams.get('gmail_status')
  if (status === 'success' || status === 'failed' || status === 'cancelled') {
    window.history.replaceState({}, '', window.location.pathname)
    return status
  }
  return null
}

const pendingCallback = readOAuthCallback()

export function useGmailConnection(options: UseGmailConnectionOptions = {}) {
  const { user, session } = useAuth()
  const [status, setStatus] = useState<GmailConnectionStatus>({
    isConnected: false,
    accountId: null,
    connectedAt: null,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const callbackProcessed = useRef(false)

  const fetchStatus = useCallback(async () => {
    if (!user) return

    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('unipile_accounts')
        .select('account_id, connected_at, status')
        .eq('user_id', user.id)
        .eq('provider', 'EMAIL')
        .eq('status', 'active')
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching Gmail status:', error)
      }

      setStatus({
        isConnected: !!data,
        accountId: data?.account_id || null,
        connectedAt: data?.connected_at || null,
      })
    } catch (error) {
      console.error('Error fetching Gmail status:', error)
    } finally {
      setIsLoading(false)
    }
  }, [user])

  // Fetch on mount (skip if we have a pending OAuth callback)
  useEffect(() => {
    if (!pendingCallback || callbackProcessed.current) {
      fetchStatus()
    }
  }, [fetchStatus])

  // Process OAuth callback once session is ready
  useEffect(() => {
    if (callbackProcessed.current) return
    if (!session?.access_token) return

    if (pendingCallback === 'success') {
      callbackProcessed.current = true
      setMessage({ type: 'success', text: 'Verificando conexion de Gmail...' })
      setIsLoading(true)

      const checkConnection = async () => {
        try {
          // Retry with increasing delays — Google OAuth provisioning can take 30-60s
          // Schedule: 2s, 4s, 6s, 8s, 8s, 8s, 8s, 8s, 8s, 8s = ~68s total window
          const delays = [0, 2000, 4000, 6000, 8000, 8000, 8000, 8000, 8000, 8000]

          for (let attempt = 0; attempt < delays.length; attempt++) {
            if (attempt > 0) {
              setMessage({ type: 'success', text: `Verificando conexion de Gmail... (intento ${attempt + 1})` })
              await new Promise(resolve => setTimeout(resolve, delays[attempt]))
            }

            const response = await callEdgeFunction<{
              success: boolean
              isConnected: boolean
              accountId?: string
              connectedAt?: string
              debug?: { totalAccounts: number; accountTypes: string[]; potentialGmailAccounts: number }
            }>('check-gmail-connection', {}, session.access_token)

            console.log(`Gmail check attempt ${attempt + 1}:`, response)

            if (response.success && response.isConnected) {
              setStatus({
                isConnected: true,
                accountId: response.accountId || null,
                connectedAt: response.connectedAt || null,
              })
              setMessage({ type: 'success', text: 'Gmail conectado exitosamente!' })
              setIsLoading(false)
              return
            }
          }

          setIsLoading(false)
          setMessage({
            type: 'error',
            text: 'No se pudo verificar la conexion de Gmail. La cuenta puede tardar unos minutos en aparecer. Recarga la pagina en un momento.',
          })
        } catch (error) {
          console.error('Error checking Gmail connection:', error)
          setMessage({ type: 'error', text: 'Error verificando la conexion. Recarga la pagina.' })
          setIsLoading(false)
        }
      }

      checkConnection()
    } else if (pendingCallback === 'failed') {
      callbackProcessed.current = true
      setMessage({ type: 'error', text: 'Fallo la conexion de Gmail. Intenta de nuevo.' })
      fetchStatus()
    } else if (pendingCallback === 'cancelled') {
      callbackProcessed.current = true
      setMessage({ type: 'error', text: 'La conexion de Gmail fue cancelada.' })
      fetchStatus()
    }
  }, [session?.access_token, fetchStatus])

  const connect = async () => {
    if (!session?.access_token) {
      setMessage({ type: 'error', text: 'Debes estar logueado para conectar Gmail.' })
      return
    }

    setActionLoading(true)
    setMessage(null)

    try {
      const redirectUrl = options.redirectPath
        ? window.location.origin + options.redirectPath
        : window.location.origin + window.location.pathname

      const response = await callEdgeFunction<{
        success: boolean
        authUrl: string
        expiresOn: string
      }>(
        'connect-gmail',
        {
          successRedirectUrl: `${redirectUrl}?gmail_status=success`,
          failureRedirectUrl: `${redirectUrl}?gmail_status=failed`,
        },
        session.access_token
      )

      if (response.success && response.authUrl) {
        window.location.href = response.authUrl
      } else {
        setMessage({ type: 'error', text: 'No se pudo crear el link de autenticacion.' })
      }
    } catch (error) {
      console.error('Error connecting Gmail:', error)
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Fallo la conexion de Gmail.',
      })
    } finally {
      setActionLoading(false)
    }
  }

  const disconnect = async () => {
    if (!session?.access_token) {
      setMessage({ type: 'error', text: 'Debes estar logueado para desconectar Gmail.' })
      return
    }

    if (!window.confirm('Estas seguro de que quieres desconectar tu cuenta de Gmail? Esto detendra el envio automatico de emails.')) {
      return
    }

    setActionLoading(true)
    setMessage(null)

    try {
      // Directly update the database to disconnect
      const { error } = await supabase
        .from('unipile_accounts')
        .update({
          status: 'disconnected',
          disconnected_at: new Date().toISOString(),
        })
        .eq('user_id', user!.id)
        .eq('provider', 'EMAIL')

      if (error) {
        setMessage({ type: 'error', text: 'No se pudo desconectar Gmail.' })
      } else {
        setStatus({ isConnected: false, accountId: null, connectedAt: null })
        setMessage({ type: 'success', text: 'Gmail desconectado exitosamente.' })
      }
    } catch (error) {
      console.error('Error disconnecting Gmail:', error)
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Fallo la desconexion de Gmail.',
      })
    } finally {
      setActionLoading(false)
    }
  }

  return {
    status,
    isLoading,
    actionLoading,
    message,
    setMessage,
    connect,
    disconnect,
    refetch: fetchStatus,
  }
}
