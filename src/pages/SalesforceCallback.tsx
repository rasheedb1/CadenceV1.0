import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { callEdgeFunction } from '@/lib/edge-functions'
import { toast } from 'sonner'

export function SalesforceCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    if (error) {
      setStatus('error')
      setErrorMsg(errorDescription || error)
      toast.error(`Salesforce connection failed: ${errorDescription || error}`)
      setTimeout(() => navigate('/settings'), 3000)
      return
    }

    if (!code || !session?.access_token) {
      setStatus('error')
      setErrorMsg('Missing authorization code')
      setTimeout(() => navigate('/settings'), 3000)
      return
    }

    const exchangeCode = async () => {
      try {
        await callEdgeFunction('salesforce-callback', { code, state }, session.access_token)
        toast.success('Salesforce connected successfully!')

        // Trigger initial sync
        try {
          await callEdgeFunction('salesforce-sync', {}, session.access_token)
          toast.success('Initial Salesforce data sync complete')
        } catch {
          // Non-critical — user can sync manually later
          console.warn('Initial sync failed, user can sync manually')
        }

        navigate('/settings')
      } catch (err) {
        console.error('Salesforce callback error:', err)
        setStatus('error')
        setErrorMsg(err instanceof Error ? err.message : 'Failed to complete connection')
        toast.error('Failed to connect Salesforce')
        setTimeout(() => navigate('/settings'), 3000)
      }
    }

    exchangeCode()
  }, [searchParams, session?.access_token, navigate])

  return (
    <div className="flex h-screen items-center justify-center">
      {status === 'loading' ? (
        <div className="text-center space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-muted-foreground">Connecting Salesforce...</p>
        </div>
      ) : (
        <div className="text-center space-y-4">
          <p className="text-red-500">{errorMsg}</p>
          <p className="text-sm text-muted-foreground">Redirecting to Settings...</p>
        </div>
      )}
    </div>
  )
}
