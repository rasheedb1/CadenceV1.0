import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type AuthView = 'default' | 'forgot-password' | 'reset-password'

export function Auth() {
  const { user, profile, signIn, signUp, resetPassword, updatePassword, isRecoveryMode } = useAuth()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [view, setView] = useState<AuthView>('default')

  // Check for invite token from URL param or localStorage (signup flow)
  const inviteToken = searchParams.get('invite') || localStorage.getItem('pendingInviteToken')

  // Show reset password form when arriving via recovery link
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
    // If there's a pending invite, redirect back to the invite page
    if (inviteToken) {
      localStorage.removeItem('pendingInviteToken')
      return <Navigate to={`/invite/${inviteToken}`} replace />
    }
    if (profile && !profile.onboarding_completed) {
      return <Navigate to="/onboarding" replace />
    }
    return <Navigate to="/" replace />
  }

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccessMessage(null)

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string

    const { error } = await resetPassword(email)
    if (error) {
      setError(error.message)
    } else {
      setSuccessMessage('Check your email for a password reset link')
    }
    setLoading(false)
  }

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const { error } = await signIn(email, password)
    if (error) {
      setError(error.message)
    }
    setLoading(false)
  }

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const fullName = formData.get('fullName') as string

    const { error } = await signUp(email, password, fullName)
    if (error) {
      setError(error.message)
    } else {
      // Store invite token so we can redirect after email confirmation
      if (inviteToken) {
        localStorage.setItem('pendingInviteToken', inviteToken)
      }
      setError('Check your email to confirm your account')
    }
    setLoading(false)
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
          <CardTitle className="text-2xl font-heading">Chief</CardTitle>
          <CardDescription>Sales automation platform</CardDescription>
        </CardHeader>
        <CardContent>
          {view === 'forgot-password' ? (
            <div className="space-y-4">
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                {successMessage && <p className="text-sm text-green-600">{successMessage}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>
              </form>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => { setView('default'); setError(null); setSuccessMessage(null) }}
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <>
              {inviteToken && (
                <div className="mb-4 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
                  <p className="text-sm text-blue-700 dark:text-blue-400 text-center">
                    Create an account to accept your invitation
                  </p>
                </div>
              )}
              <Tabs defaultValue={inviteToken ? 'signup' : 'signin'}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign In</TabsTrigger>
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>

                <TabsContent value="signin">
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signin-email">Email</Label>
                      <Input
                        id="signin-email"
                        name="email"
                        type="email"
                        placeholder="you@example.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signin-password">Password</Label>
                      <Input
                        id="signin-password"
                        name="password"
                        type="password"
                        placeholder="••••••••"
                        required
                      />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? 'Signing in...' : 'Sign In'}
                    </Button>
                    <button
                      type="button"
                      className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => { setView('forgot-password'); setError(null) }}
                    >
                      Forgot your password?
                    </button>
                  </form>
                </TabsContent>

                <TabsContent value="signup">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full Name</Label>
                      <Input
                        id="signup-name"
                        name="fullName"
                        type="text"
                        placeholder="Juan Pérez"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        name="email"
                        type="email"
                        placeholder="you@example.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input
                        id="signup-password"
                        name="password"
                        type="password"
                        placeholder="••••••••"
                        minLength={6}
                        required
                      />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? 'Creating account...' : 'Create Account'}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
