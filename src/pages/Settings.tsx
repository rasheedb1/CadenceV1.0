import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, XCircle, ExternalLink, Mail, Brain } from 'lucide-react'
import { useLinkedInConnection } from '@/hooks/useLinkedInConnection'
import { useGmailConnection } from '@/hooks/useGmailConnection'

const LLM_MODELS: Record<string, { label: string; models: { value: string; label: string }[] }> = {
  openai: {
    label: 'OpenAI',
    models: [
      { value: 'gpt-5.2', label: 'GPT-5.2 Thinking' },
      { value: 'gpt-5.1', label: 'GPT-5.1' },
      { value: 'gpt-5', label: 'GPT-5' },
      { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
      { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'o3-mini', label: 'o3 Mini' },
    ],
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    models: [
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
      { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
      { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5 (Legacy)' },
    ],
  },
}

export function Settings() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const linkedin = useLinkedInConnection()
  const gmail = useGmailConnection()

  // LLM settings
  const [llmProvider, setLlmProvider] = useState('openai')
  const [llmModel, setLlmModel] = useState('gpt-4o')
  const [llmLoading, setLlmLoading] = useState(false)
  const [llmSaved, setLlmSaved] = useState(false)
  const [llmMessage, setLlmMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Load LLM settings from DB
  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('profiles')
      .select('llm_provider, llm_model')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setLlmProvider(data.llm_provider || 'openai')
          setLlmModel(data.llm_model || 'gpt-4o')
        }
      })
  }, [user?.id])

  const handleSaveLLM = async () => {
    if (!user?.id) return
    setLlmLoading(true)
    setLlmMessage(null)
    const { error } = await supabase
      .from('profiles')
      .update({ llm_provider: llmProvider, llm_model: llmModel })
      .eq('user_id', user.id)

    if (error) {
      setLlmMessage({ type: 'error', text: error.message })
    } else {
      setLlmSaved(true)
      setLlmMessage({ type: 'success', text: 'AI provider settings saved' })
      setTimeout(() => setLlmSaved(false), 2000)
    }
    setLlmLoading(false)
  }

  const handleProviderChange = (provider: string) => {
    setLlmProvider(provider)
    // Reset model to provider's first model
    const firstModel = LLM_MODELS[provider]?.models[0]?.value
    if (firstModel) setLlmModel(firstModel)
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
        <h1 className="text-[28px] font-bold tracking-tight font-heading">Settings</h1>
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
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Provider
            </CardTitle>
            <CardDescription>Choose which AI model powers your message generation and research</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <select
                value={llmProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {Object.entries(LLM_MODELS).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <select
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {LLM_MODELS[llmProvider]?.models.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            {llmMessage && (
              <p className={`text-sm ${llmMessage.type === 'success' ? 'text-green-600' : 'text-destructive'}`}>
                {llmMessage.text}
              </p>
            )}
            <Button onClick={handleSaveLLM} disabled={llmLoading}>
              {llmLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : llmSaved ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Saved
                </>
              ) : (
                'Save AI Settings'
              )}
            </Button>
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
                  {linkedin.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : linkedin.status.isConnected ? (
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
                {linkedin.status.isConnected && linkedin.status.connectedAt && (
                  <p className="text-xs text-muted-foreground">
                    Connected on {formatDate(linkedin.status.connectedAt)}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {linkedin.status.isConnected ? (
                  <Button
                    variant="outline"
                    onClick={linkedin.disconnect}
                    disabled={linkedin.actionLoading}
                  >
                    {linkedin.actionLoading ? (
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
                    onClick={linkedin.connect}
                    disabled={linkedin.actionLoading || linkedin.isLoading}
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
              </div>
            </div>
            {linkedin.message && (
              <p
                className={`text-sm ${
                  linkedin.message.type === 'success' ? 'text-green-600' : 'text-destructive'
                }`}
              >
                {linkedin.message.text}
              </p>
            )}

            <Separator />

            {/* Gmail Integration */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">Gmail</p>
                  {gmail.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : gmail.status.isConnected ? (
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
                  Connect your Gmail account for email automation
                </p>
                {gmail.status.isConnected && gmail.status.connectedAt && (
                  <p className="text-xs text-muted-foreground">
                    Connected on {formatDate(gmail.status.connectedAt)}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {gmail.status.isConnected ? (
                  <Button
                    variant="outline"
                    onClick={gmail.disconnect}
                    disabled={gmail.actionLoading}
                  >
                    {gmail.actionLoading ? (
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
                    onClick={gmail.connect}
                    disabled={gmail.actionLoading || gmail.isLoading}
                  >
                    {gmail.actionLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-2" />
                        Connect Gmail
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
            {gmail.message && (
              <p
                className={`text-sm ${
                  gmail.message.type === 'success' ? 'text-green-600' : 'text-destructive'
                }`}
              >
                {gmail.message.text}
              </p>
            )}

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
