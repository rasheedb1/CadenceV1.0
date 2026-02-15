import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, XCircle, ExternalLink, Mail } from 'lucide-react'
import { useLinkedInConnection } from '@/hooks/useLinkedInConnection'
import { useGmailConnection } from '@/hooks/useGmailConnection'

export function Settings() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const linkedin = useLinkedInConnection()
  const gmail = useGmailConnection()

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
