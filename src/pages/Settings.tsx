import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, XCircle, ExternalLink, Mail, Brain, Calendar, RefreshCw } from 'lucide-react'
import { useLinkedInConnection } from '@/hooks/useLinkedInConnection'
import { useGmailConnection } from '@/hooks/useGmailConnection'
import { SalesforceConnection } from '@/components/salesforce/SalesforceConnection'
import { useAccountExecutive } from '@/contexts/AccountExecutiveContext'

const CLAUDE_MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Recommended)' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Most Capable)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Fastest)' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
]

export function Settings() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const linkedin = useLinkedInConnection()
  const gmail = useGmailConnection()

  const { integrations, saveGongCredentials, disconnectIntegration, isSyncingGong, syncGong, syncCalendar, isSyncingCalendar } = useAccountExecutive()

  const [gongKey, setGongKey] = useState('')
  const [gongSecret, setGongSecret] = useState('')
  const [gongSaving, setGongSaving] = useState(false)

  const gongIntegration = integrations.find(i => i.provider === 'gong')

  const handleSaveGong = async () => {
    if (!gongKey.trim() || !gongSecret.trim()) return
    setGongSaving(true)
    try {
      await saveGongCredentials(gongKey.trim(), gongSecret.trim())
      setGongKey('')
      setGongSecret('')
    } finally {
      setGongSaving(false)
    }
  }

  // LLM settings
  const [llmModel, setLlmModel] = useState('claude-sonnet-4-6')
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
          // Normalize: if user had OpenAI configured, reset to Claude defaults
          const provider = data.llm_provider
          const model = data.llm_model
          if (provider === 'anthropic' && model) {
            setLlmModel(CLAUDE_MODELS.some(m => m.value === model) ? model : 'claude-sonnet-4-6')
          } else {
            // Legacy OpenAI or unset — default to Claude Sonnet
            setLlmModel('claude-sonnet-4-6')
          }
        }
      })
  }, [user?.id])

  const handleSaveLLM = async () => {
    if (!user?.id) return
    setLlmLoading(true)
    setLlmMessage(null)
    const { error } = await supabase
      .from('profiles')
      .update({ llm_provider: 'anthropic', llm_model: llmModel })
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
        <div className="flex gap-2 mt-4">
          <Link to="/settings" className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground">
            Account
          </Link>
          <Link to="/settings/organization" className="px-3 py-1.5 text-sm font-medium rounded-md text-muted-foreground hover:bg-accent">
            Organization
          </Link>
          <Link to="/settings/members" className="px-3 py-1.5 text-sm font-medium rounded-md text-muted-foreground hover:bg-accent">
            Members
          </Link>
        </div>
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
              <Label>Claude Model</Label>
              <select
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Powered by Anthropic. Sonnet 4.6 is the best balance of speed and quality.</p>
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

            {/* Salesforce Integration */}
            <SalesforceConnection />

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

        <Card>
          <CardHeader>
            <CardTitle>Account Executive</CardTitle>
            <CardDescription>Connect Gong and sync your calendar to power your AE workspace</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Gong */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-orange-100 text-orange-600 text-xs font-bold">G</span>
                    Gong
                  </p>
                  <p className="text-sm text-muted-foreground">Sync call recordings and transcripts</p>
                </div>
                <div className="flex items-center gap-2">
                  {gongIntegration ? (
                    <>
                      <Badge className="bg-green-100 text-green-800 border-0 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />Connected
                      </Badge>
                      <Button size="sm" variant="outline" onClick={() => syncGong()} disabled={isSyncingGong}>
                        {isSyncingGong ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                        Sync now
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => disconnectIntegration('gong')}>Disconnect</Button>
                    </>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-600 border-0 text-xs">
                      <XCircle className="h-3 w-3 mr-1" />Not connected
                    </Badge>
                  )}
                </div>
              </div>
              {!gongIntegration && (
                <div className="space-y-2 pl-0">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Gong Access Key</Label>
                      <Input
                        type="password"
                        placeholder="Access Key"
                        value={gongKey}
                        onChange={e => setGongKey(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Gong Access Key Secret</Label>
                      <Input
                        type="password"
                        placeholder="Secret"
                        value={gongSecret}
                        onChange={e => setGongSecret(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button size="sm" onClick={handleSaveGong} disabled={!gongKey.trim() || !gongSecret.trim() || gongSaving}>
                    {gongSaving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    Connect Gong
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Find your API credentials in Gong → Company Settings → API.
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Calendar via Unipile */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  Calendar (Google / Microsoft)
                </p>
                <p className="text-sm text-muted-foreground">
                  Synced via your Unipile-connected email account — no extra login needed
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-50 text-blue-700 border-0 text-xs">
                  Via Unipile
                </Badge>
                <Button size="sm" variant="outline" onClick={() => syncCalendar()} disabled={isSyncingCalendar}>
                  {isSyncingCalendar
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Syncing...</>
                    : <><RefreshCw className="h-3.5 w-3.5 mr-1" />Sync Calendar</>}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
