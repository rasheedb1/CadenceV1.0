import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react'
import { callEdgeFunction } from '@/lib/edge-functions'

interface LinkedInConnectionStatus {
  isConnected: boolean
  accountId: string | null
  connectedAt: string | null
}

interface ConnectLinkedInResponse {
  success: boolean
  authUrl: string
  expiresOn: string
}

interface DisconnectLinkedInResponse {
  success: boolean
  message: string
}

export function Settings() {
  const { user, session } = useAuth()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // LinkedIn connection state
  const [linkedInStatus, setLinkedInStatus] = useState<LinkedInConnectionStatus>({
    isConnected: false,
    accountId: null,
    connectedAt: null,
  })
  const [linkedInLoading, setLinkedInLoading] = useState(true)
  const [linkedInActionLoading, setLinkedInActionLoading] = useState(false)
  const [linkedInMessage, setLinkedInMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Fetch LinkedIn connection status
  const fetchLinkedInStatus = useCallback(async () => {
    if (!user) return

    setLinkedInLoading(true)
    try {
      // Query the unipile_accounts table for LinkedIn connection
      const { data, error } = await supabase
        .from('unipile_accounts')
        .select('account_id, connected_at, status')
        .eq('user_id', user.id)
        .eq('provider', 'LINKEDIN')
        .eq('status', 'active')
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "no rows returned" which is expected if not connected
        console.error('Error fetching LinkedIn status:', error)
      }

      setLinkedInStatus({
        isConnected: !!data,
        accountId: data?.account_id || null,
        connectedAt: data?.connected_at || null,
      })
    } catch (error) {
      console.error('Error fetching LinkedIn status:', error)
    } finally {
      setLinkedInLoading(false)
    }
  }, [user])

  // Fetch LinkedIn connection status on mount
  useEffect(() => {
    fetchLinkedInStatus()
  }, [fetchLinkedInStatus])

  // Check URL for connection callback status
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const linkedinStatusParam = urlParams.get('linkedin_status')

    if (linkedinStatusParam === 'success') {
      setLinkedInMessage({ type: 'success', text: 'Verifying LinkedIn connection...' })
      // Clean up URL immediately
      window.history.replaceState({}, '', window.location.pathname)

      // Call the check-linkedin-connection endpoint which polls Unipile directly
      // This is a fallback since the webhook may not fire reliably
      const checkConnection = async () => {
        if (!session?.access_token) {
          setLinkedInLoading(false)
          setLinkedInMessage({ type: 'error', text: 'Session expired. Please log in again.' })
          return
        }

        try {
          console.log('Calling check-linkedin-connection to verify OAuth result...')
          const response = await callEdgeFunction<{
            success: boolean
            isConnected: boolean
            accountId?: string
            connectedAt?: string
            source?: string
            error?: string
          }>('check-linkedin-connection', {}, session.access_token)

          console.log('Check connection response:', response)

          if (response.success && response.isConnected) {
            setLinkedInStatus({
              isConnected: true,
              accountId: response.accountId || null,
              connectedAt: response.connectedAt || null,
            })
            setLinkedInMessage({
              type: 'success',
              text: `LinkedIn account connected successfully! (via ${response.source || 'direct check'})`
            })
          } else {
            // Connection not found - maybe Unipile takes time
            console.log('Connection not found on first check, retrying...')
            // Retry a few times with delays
            let attempts = 0
            const maxAttempts = 3

            const retryCheck = async () => {
              await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds
              attempts++

              const retryResponse = await callEdgeFunction<{
                success: boolean
                isConnected: boolean
                accountId?: string
                connectedAt?: string
                source?: string
              }>('check-linkedin-connection', {}, session.access_token)

              console.log(`Retry ${attempts} response:`, retryResponse)

              if (retryResponse.success && retryResponse.isConnected) {
                setLinkedInStatus({
                  isConnected: true,
                  accountId: retryResponse.accountId || null,
                  connectedAt: retryResponse.connectedAt || null,
                })
                setLinkedInMessage({ type: 'success', text: 'LinkedIn account connected successfully!' })
                setLinkedInLoading(false)
              } else if (attempts < maxAttempts) {
                retryCheck()
              } else {
                setLinkedInLoading(false)
                setLinkedInMessage({
                  type: 'error',
                  text: 'LinkedIn connection could not be verified. Please try again or contact support.'
                })
              }
            }

            retryCheck()
            return // Don't set loading false yet, retrying
          }
        } catch (error) {
          console.error('Error checking LinkedIn connection:', error)
          setLinkedInMessage({
            type: 'error',
            text: 'Error verifying connection. Please refresh the page.'
          })
        }

        setLinkedInLoading(false)
      }

      setLinkedInLoading(true)
      checkConnection()
    } else if (linkedinStatusParam === 'failed') {
      setLinkedInMessage({ type: 'error', text: 'Failed to connect LinkedIn account. Please try again.' })
      window.history.replaceState({}, '', window.location.pathname)
    } else if (linkedinStatusParam === 'cancelled') {
      setLinkedInMessage({ type: 'error', text: 'LinkedIn connection was cancelled.' })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [user?.id, session?.access_token])

  const handleConnectLinkedIn = async () => {
    if (!session?.access_token) {
      setLinkedInMessage({ type: 'error', text: 'You must be logged in to connect LinkedIn.' })
      return
    }

    setLinkedInActionLoading(true)
    setLinkedInMessage(null)

    try {
      // Get the current page URL for redirect after auth
      const currentUrl = window.location.origin + window.location.pathname

      const response = await callEdgeFunction<ConnectLinkedInResponse>(
        'connect-linkedin',
        {
          successRedirectUrl: `${currentUrl}?linkedin_status=success`,
          failureRedirectUrl: `${currentUrl}?linkedin_status=failed`,
        },
        session.access_token
      )

      if (response.success && response.authUrl) {
        // Redirect to Unipile hosted auth page
        window.location.href = response.authUrl
      } else {
        setLinkedInMessage({ type: 'error', text: 'Failed to create auth link. Please try again.' })
      }
    } catch (error) {
      console.error('Error connecting LinkedIn:', error)
      setLinkedInMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to connect LinkedIn. Please try again.',
      })
    } finally {
      setLinkedInActionLoading(false)
    }
  }

  const handleDisconnectLinkedIn = async () => {
    if (!session?.access_token) {
      setLinkedInMessage({ type: 'error', text: 'You must be logged in to disconnect LinkedIn.' })
      return
    }

    // Confirm with user
    if (!window.confirm('Are you sure you want to disconnect your LinkedIn account? This will stop all LinkedIn automation.')) {
      return
    }

    setLinkedInActionLoading(true)
    setLinkedInMessage(null)

    try {
      const response = await callEdgeFunction<DisconnectLinkedInResponse>(
        'disconnect-linkedin',
        {},
        session.access_token
      )

      if (response.success) {
        setLinkedInStatus({
          isConnected: false,
          accountId: null,
          connectedAt: null,
        })
        setLinkedInMessage({ type: 'success', text: 'LinkedIn account disconnected successfully.' })
      } else {
        setLinkedInMessage({ type: 'error', text: 'Failed to disconnect LinkedIn. Please try again.' })
      }
    } catch (error) {
      console.error('Error disconnecting LinkedIn:', error)
      setLinkedInMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to disconnect LinkedIn. Please try again.',
      })
    } finally {
      setLinkedInActionLoading(false)
    }
  }

  const handleUpdatePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const formData = new FormData(e.currentTarget)
    const newPassword = formData.get('newPassword') as string
    const confirmPassword = formData.get('confirmPassword') as string

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' })
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: 'Password updated successfully' })
      e.currentTarget.reset()
    }
    setLoading(false)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return ''
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>Your account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>User ID</Label>
              <Input value={user?.id || ''} disabled />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your password</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  minLength={6}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  minLength={6}
                  required
                />
              </div>
              {message && (
                <p
                  className={`text-sm ${
                    message.type === 'success' ? 'text-green-600' : 'text-destructive'
                  }`}
                >
                  {message.text}
                </p>
              )}
              <Button type="submit" disabled={loading}>
                {loading ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>Connect external services</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* LinkedIn Integration */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">LinkedIn</p>
                  {linkedInLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : linkedInStatus.isConnected ? (
                    <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <XCircle className="h-3 w-3 mr-1" />
                      Not Connected
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Connect your LinkedIn account for automation
                </p>
                {linkedInStatus.isConnected && linkedInStatus.connectedAt && (
                  <p className="text-xs text-muted-foreground">
                    Connected on {formatDate(linkedInStatus.connectedAt)}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {linkedInStatus.isConnected ? (
                  <Button
                    variant="outline"
                    onClick={handleDisconnectLinkedIn}
                    disabled={linkedInActionLoading}
                  >
                    {linkedInActionLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Disconnecting...
                      </>
                    ) : (
                      'Disconnect'
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    onClick={handleConnectLinkedIn}
                    disabled={linkedInActionLoading || linkedInLoading}
                  >
                    {linkedInActionLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Connect LinkedIn
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
            {linkedInMessage && (
              <p
                className={`text-sm ${
                  linkedInMessage.type === 'success' ? 'text-green-600' : 'text-destructive'
                }`}
              >
                {linkedInMessage.text}
              </p>
            )}

            <Separator />

            {/* Email Integration - Coming Soon */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Email (SMTP)</p>
                <p className="text-sm text-muted-foreground">Configure email sending</p>
              </div>
              <Button variant="outline" disabled>
                Coming Soon
              </Button>
            </div>

            <Separator />

            {/* WhatsApp Integration - Coming Soon */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">WhatsApp</p>
                <p className="text-sm text-muted-foreground">Connect WhatsApp Business</p>
              </div>
              <Button variant="outline" disabled>
                Coming Soon
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
