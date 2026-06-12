import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const ERROR_MESSAGES: Record<string, string> = {
  domain_restricted: 'Access is restricted to @y.uno and @yuno.co Google Workspace accounts.',
  oauth_error: 'Sign in with Google failed. Please try again.',
  oauth_timeout: 'Sign in took too long. Please try again.',
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

export function Auth() {
  const { user, profile, signInWithGoogle, updatePassword, isRecoveryMode } = useAuth()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const errorParam = searchParams.get('error')
  const errorBanner = errorParam ? ERROR_MESSAGES[errorParam] ?? ERROR_MESSAGES.oauth_error : null

  const inviteToken = searchParams.get('invite') || localStorage.getItem('pendingInviteToken')

  if (isRecoveryMode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-[10px] logo-gradient text-white text-lg font-bold">
                C
              </div>
            </div>
            <CardTitle className="text-2xl font-heading">New Password</CardTitle>
            <CardDescription>Enter your new password</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                setLoading(true)
                setError(null)
                const formData = new FormData(e.currentTarget)
                const password = formData.get('password') as string
                const confirmPassword = formData.get('confirmPassword') as string
                if (password !== confirmPassword) {
                  setError('Passwords do not match')
                  setLoading(false)
                  return
                }
                if (password.length < 6) {
                  setError('Password must be at least 6 characters')
                  setLoading(false)
                  return
                }
                const { error } = await updatePassword(password)
                if (error) {
                  setError(error.message)
                } else {
                  setSuccessMessage('Password updated! Redirecting...')
                }
                setLoading(false)
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input id="new-password" name="password" type="password" placeholder="••••••••" minLength={6} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input id="confirm-password" name="confirmPassword" type="password" placeholder="••••••••" minLength={6} required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {successMessage && <p className="text-sm text-green-600">{successMessage}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (user) {
    if (inviteToken) {
      localStorage.removeItem('pendingInviteToken')
      return <Navigate to={`/invite/${inviteToken}`} replace />
    }
    if (profile && !profile.onboarding_completed) {
      return <Navigate to="/onboarding" replace />
    }
    return <Navigate to="/" replace />
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError(null)
    if (inviteToken) {
      localStorage.setItem('pendingInviteToken', inviteToken)
    }
    const { error } = await signInWithGoogle()
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-[10px] logo-gradient text-white text-lg font-bold">
              C
            </div>
          </div>
          <CardTitle className="text-2xl font-heading">Sign in to Chief</CardTitle>
          <CardDescription>Yuno Workspace accounts only</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {inviteToken && (
            <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
              <p className="text-sm text-blue-700 dark:text-blue-400 text-center">
                Sign in to accept your invitation
              </p>
            </div>
          )}

          {errorBanner && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3">
              <p className="text-sm text-destructive text-center">{errorBanner}</p>
            </div>
          )}

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          <Button
            type="button"
            variant="outline"
            className="w-full gap-3"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            <GoogleIcon />
            {loading ? 'Redirecting to Google...' : 'Continue with Google'}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Only @y.uno and @yuno.co accounts can sign in.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
