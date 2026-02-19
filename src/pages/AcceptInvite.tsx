import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, XCircle } from 'lucide-react'
import { toast } from 'sonner'

interface InvitationData {
  id: string
  org_id: string
  email: string | null
  role: string
  status: string
  expires_at: string
  org_name: string | null
}

export function AcceptInvite() {
  const { token } = useParams<{ token: string }>()
  const { user } = useAuth()
  const { refreshOrgs, switchOrg } = useOrg()
  const navigate = useNavigate()
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return

    const fetchInvitation = async () => {
      // Use SECURITY DEFINER function — works even without auth
      const { data, error: fetchError } = await supabase
        .rpc('get_invitation_by_token', { p_token: token })

      if (fetchError || !data || data.length === 0) {
        setError('Invitation not found or invalid')
        setLoading(false)
        return
      }

      const inv = data[0] as InvitationData

      if (inv.status !== 'pending') {
        setError(`This invitation has already been ${inv.status}`)
        setLoading(false)
        return
      }

      if (new Date(inv.expires_at) < new Date()) {
        setError('This invitation has expired')
        setLoading(false)
        return
      }

      setInvitation(inv)
      setLoading(false)
    }

    fetchInvitation()
  }, [token])

  // If user is not logged in and invitation is valid, redirect to auth
  useEffect(() => {
    if (!loading && !user && invitation) {
      localStorage.setItem('pendingInviteToken', token!)
      navigate(`/auth?invite=${token}`)
    }
  }, [loading, user, invitation, token, navigate])

  // If user is already a member of this org, skip straight to the org
  useEffect(() => {
    if (!user || !invitation) return

    const checkMembership = async () => {
      const { data } = await supabase
        .from('organization_members')
        .select('id')
        .eq('org_id', invitation.org_id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (data) {
        // Already a member — mark invitation accepted and redirect
        await supabase
          .from('organization_invitations')
          .update({ status: 'accepted', accepted_at: new Date().toISOString(), email: user.email })
          .eq('id', invitation.id)
          .eq('status', 'pending')

        refreshOrgs()
        await switchOrg(invitation.org_id)
        localStorage.removeItem('pendingInviteToken')
        toast.info(`You're already a member of ${invitation.org_name || 'this organization'}`)
        navigate('/')
      }
    }

    checkMembership()
  }, [user, invitation])

  const handleAccept = async () => {
    if (!invitation || !user) return

    setAccepting(true)
    try {
      // Add user to org
      const { error: memberError } = await supabase
        .from('organization_members')
        .insert({
          org_id: invitation.org_id,
          user_id: user.id,
          role: invitation.role,
        })

      if (memberError) {
        if (memberError.code === '23505') {
          toast.info('You are already a member of this organization')
        } else {
          throw memberError
        }
      }

      // Mark invitation as accepted and store which email used it
      await supabase
        .from('organization_invitations')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          email: user.email,
        })
        .eq('id', invitation.id)

      // Switch to the new org
      refreshOrgs()
      await switchOrg(invitation.org_id)
      localStorage.removeItem('pendingInviteToken')
      toast.success(`Joined ${invitation.org_name || 'organization'}`)
      navigate('/')
    } catch (err) {
      toast.error('Failed to accept invitation')
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 p-8">
            <XCircle className="h-12 w-12 text-red-500" />
            <p className="text-center text-muted-foreground">{error}</p>
            <Button onClick={() => navigate('/')}>Go to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!invitation) return null

  // User is logged in — show accept/decline
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle>Join {invitation.org_name || 'Organization'}</CardTitle>
          <CardDescription>
            You've been invited to join as a <strong>{invitation.role}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="w-full"
            onClick={handleAccept}
            disabled={accepting}
          >
            {accepting ? 'Joining...' : 'Accept Invitation'}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate('/')}
          >
            Decline
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
