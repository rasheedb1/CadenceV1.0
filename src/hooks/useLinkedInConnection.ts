import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { callEdgeFunction } from '@/lib/edge-functions'
import type { ConnectLinkedInResponse, DisconnectLinkedInResponse } from '@/lib/edge-functions'

export interface LinkedInConnectionStatus {
  isConnected: boolean
  accountId: string | null
  connectedAt: string | null
}

interface UseLinkedInConnectionOptions {
  /** Path to redirect back to after OAuth (defaults to current page) */
  redirectPath?: string
}

// Read and clean URL params once at module level so they survive re-renders
function readOAuthCallback(): 'success' | 'failed' | 'cancelled' | null {
  const urlParams = new URLSearchParams(window.location.search)
  const status = urlParams.get('linkedin_status')
  if (status === 'success' || status === 'failed' || status === 'cancelled') {
    // Clean URL immediately so it doesn't re-trigger on navigation
    window.history.replaceState({}, '', window.location.pathname)
    return status
  }
  return null
}

const pendingCallback = readOAuthCallback()

export function useLinkedInConnection(options: UseLinkedInConnectionOptions = {}) {
  const { user, session } = useAuth()
  const [status, setStatus] = useState<LinkedInConnectionStatus>({
    isConnected: false,
    accountId: null,
    connectedAt: null,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const callbackProcessed = useRef(false)

  // Fetch LinkedIn connection status from DB
  const fetchStatus = useCallback(async () => {
    if (!user) return

    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('unipile_accounts')
        .select('account_id, connected_at, status')
        .eq('user_id', user.id)
        .eq('provider', 'LINKEDIN')
        .eq('status', 'active')
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching LinkedIn status:', error)
      }

      setStatus({
        isConnected: !!data,
        accountId: data?.account_id || null,
        connectedAt: data?.connected_at || null,
      })
    } catch (error) {
      console.error('Error fetching LinkedIn status:', error)
    } finally {
      setIsLoading(false)
    }
  }, [user])

  // Fetch on mount (skip if we have a pending OAuth callback — that flow will handle it)
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
      setMessage({ type: 'success', text: 'Verifying LinkedIn connection...' })
      setIsLoading(true)

      const checkConnection = async () => {
        try {
          const response = await callEdgeFunction<{
            success: boolean
            isConnected: boolean
            accountId?: string
            connectedAt?: string
            source?: string
          }>('check-linkedin-connection', {}, session.access_token)

          if (response.success && response.isConnected) {
            setStatus({
              isConnected: true,
              accountId: response.accountId || null,
              connectedAt: response.connectedAt || null,
            })
            setMessage({ type: 'success', text: 'LinkedIn account connected successfully!' })
            setIsLoading(false)
            return
          }

          // Retry with delays — Unipile may take time to provision
          for (let attempt = 1; attempt <= 5; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 3000))

            const retryResponse = await callEdgeFunction<{
              success: boolean
              isConnected: boolean
              accountId?: string
              connectedAt?: string
            }>('check-linkedin-connection', {}, session.access_token)

            if (retryResponse.success && retryResponse.isConnected) {
              setStatus({
                isConnected: true,
                accountId: retryResponse.accountId || null,
                connectedAt: retryResponse.connectedAt || null,
              })
              setMessage({ type: 'success', text: 'LinkedIn account connected successfully!' })
              setIsLoading(false)
              return
            }
          }

          // All retries exhausted
          setIsLoading(false)
          setMessage({
            type: 'error',
            text: 'LinkedIn connection could not be verified. Please try again or contact support.',
          })
        } catch (error) {
          console.error('Error checking LinkedIn connection:', error)
          setMessage({ type: 'error', text: 'Error verifying connection. Please refresh the page.' })
          setIsLoading(false)
        }
      }

      checkConnection()
    } else if (pendingCallback === 'failed') {
      callbackProcessed.current = true
      setMessage({ type: 'error', text: 'Failed to connect LinkedIn account. Please try again.' })
      fetchStatus()
    } else if (pendingCallback === 'cancelled') {
      callbackProcessed.current = true
      setMessage({ type: 'error', text: 'LinkedIn connection was cancelled.' })
      fetchStatus()
    }
  }, [session?.access_token, fetchStatus])

  const connect = async () => {
    if (!session?.access_token) {
      setMessage({ type: 'error', text: 'You must be logged in to connect LinkedIn.' })
      return
    }

    setActionLoading(true)
    setMessage(null)

    try {
      const redirectUrl = options.redirectPath
        ? window.location.origin + options.redirectPath
        : window.location.origin + window.location.pathname

      const response = await callEdgeFunction<ConnectLinkedInResponse>(
        'connect-linkedin',
        {
          successRedirectUrl: `${redirectUrl}?linkedin_status=success`,
          failureRedirectUrl: `${redirectUrl}?linkedin_status=failed`,
        },
        session.access_token
      )

      if (response.success && response.authUrl) {
        window.location.href = response.authUrl
      } else {
        setMessage({ type: 'error', text: 'Failed to create auth link. Please try again.' })
      }
    } catch (error) {
      console.error('Error connecting LinkedIn:', error)
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to connect LinkedIn. Please try again.',
      })
    } finally {
      setActionLoading(false)
    }
  }

  const disconnect = async () => {
    if (!session?.access_token) {
      setMessage({ type: 'error', text: 'You must be logged in to disconnect LinkedIn.' })
      return
    }

    if (!window.confirm('Are you sure you want to disconnect your LinkedIn account? This will stop all LinkedIn automation.')) {
      return
    }

    setActionLoading(true)
    setMessage(null)

    try {
      const response = await callEdgeFunction<DisconnectLinkedInResponse>(
        'disconnect-linkedin',
        {},
        session.access_token
      )

      if (response.success) {
        setStatus({ isConnected: false, accountId: null, connectedAt: null })
        setMessage({ type: 'success', text: 'LinkedIn account disconnected successfully.' })
      } else {
        setMessage({ type: 'error', text: 'Failed to disconnect LinkedIn. Please try again.' })
      }
    } catch (error) {
      console.error('Error disconnecting LinkedIn:', error)
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to disconnect LinkedIn. Please try again.',
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
