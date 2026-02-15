import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useLinkedInConnection } from '@/hooks/useLinkedInConnection'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  CheckCircle2,
  ExternalLink,
  Workflow,
  Users,
  Sparkles,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'

type Step = 'welcome' | 'linkedin' | 'ready'

export function Onboarding() {
  const { user, profile, loading, completeOnboarding } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('welcome')
  const [skippedLinkedIn, setSkippedLinkedIn] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const linkedin = useLinkedInConnection({ redirectPath: '/onboarding' })

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  if (profile?.onboarding_completed) {
    return <Navigate to="/" replace />
  }

  const userName = user.user_metadata?.full_name?.split(' ')[0] || 'there'

  const handleFinish = async () => {
    setFinishing(true)
    await completeOnboarding()
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        {/* Progress indicator */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {(['welcome', 'linkedin', 'ready'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  s === step
                    ? 'bg-primary'
                    : (['welcome', 'linkedin', 'ready'].indexOf(s) <
                      ['welcome', 'linkedin', 'ready'].indexOf(step))
                    ? 'bg-primary/50'
                    : 'bg-muted'
                }`}
              />
              {i < 2 && <div className="h-px w-8 bg-muted" />}
            </div>
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 'welcome' && (
          <Card>
            <CardContent className="pt-8 pb-8 text-center space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Welcome, {userName}!
                </h1>
                <p className="text-muted-foreground mt-2">
                  Let's get you set up with Laiky Cadence
                </p>
              </div>

              <div className="grid gap-4 text-left">
                <div className="flex items-start gap-3 p-3 rounded-lg border">
                  <div className="mt-0.5 rounded-md bg-primary/10 p-2">
                    <Workflow className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Build Multi-Step Cadences</p>
                    <p className="text-sm text-muted-foreground">
                      Create automated outreach sequences with LinkedIn, email, and more
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg border">
                  <div className="mt-0.5 rounded-md bg-primary/10 p-2">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Manage Your Leads</p>
                    <p className="text-sm text-muted-foreground">
                      Import, organize, and track your prospects in one place
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg border">
                  <div className="mt-0.5 rounded-md bg-primary/10 p-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">AI-Powered Messages</p>
                    <p className="text-sm text-muted-foreground">
                      Generate personalized messages using AI research and your tone
                    </p>
                  </div>
                </div>
              </div>

              <Button size="lg" className="w-full" onClick={() => setStep('linkedin')}>
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Connect LinkedIn */}
        {step === 'linkedin' && (
          <Card>
            <CardContent className="pt-8 pb-8 text-center space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Connect Your LinkedIn
                </h1>
                <p className="text-muted-foreground mt-2">
                  Required to send messages, connections, and engage with posts
                </p>
              </div>

              <div className="py-4">
                {linkedin.isLoading ? (
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Checking connection...</span>
                  </div>
                ) : linkedin.status.isConnected ? (
                  <div className="flex flex-col items-center gap-3">
                    <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-base px-4 py-1.5">
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      LinkedIn Connected
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      Your LinkedIn account is ready to use
                    </p>
                  </div>
                ) : (
                  <Button
                    size="lg"
                    variant="default"
                    className="w-full max-w-xs"
                    onClick={linkedin.connect}
                    disabled={linkedin.actionLoading}
                  >
                    {linkedin.actionLoading ? (
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

                {linkedin.message && (
                  <p
                    className={`text-sm mt-3 ${
                      linkedin.message.type === 'success' ? 'text-green-600' : 'text-destructive'
                    }`}
                  >
                    {linkedin.message.text}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    if (!linkedin.status.isConnected) {
                      setSkippedLinkedIn(true)
                    }
                    setStep('ready')
                  }}
                  disabled={linkedin.actionLoading}
                >
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>

                {!linkedin.status.isConnected && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => {
                      setSkippedLinkedIn(true)
                      setStep('ready')
                    }}
                  >
                    Skip for now
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: You're Ready */}
        {step === 'ready' && (
          <Card>
            <CardContent className="pt-8 pb-8 text-center space-y-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  You're All Set!
                </h1>
                <p className="text-muted-foreground mt-2">
                  Here's what you can do next
                </p>
              </div>

              {skippedLinkedIn && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950 text-left">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-600 dark:text-yellow-400 shrink-0" />
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    You skipped LinkedIn connection. You can connect it later from{' '}
                    <span className="font-medium">Settings</span> to enable LinkedIn automation.
                  </p>
                </div>
              )}

              <div className="space-y-3 text-left text-sm">
                <div className="flex items-center gap-2 p-2 rounded border">
                  <span className="font-medium text-muted-foreground w-5 text-center">1</span>
                  <span>Create your first cadence with outreach steps</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded border">
                  <span className="font-medium text-muted-foreground w-5 text-center">2</span>
                  <span>Import leads and assign them to your cadence</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded border">
                  <span className="font-medium text-muted-foreground w-5 text-center">3</span>
                  <span>Use AI to generate personalized messages</span>
                </div>
              </div>

              <Button
                size="lg"
                className="w-full"
                onClick={handleFinish}
                disabled={finishing}
              >
                {finishing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  'Go to Dashboard'
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
