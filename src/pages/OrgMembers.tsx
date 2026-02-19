import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Users, UserPlus, Copy, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ROLE_LABELS, type OrgRole } from '@/types/permissions'

interface MemberRow {
  id: string
  user_id: string
  role: OrgRole
  joined_at: string
  profiles: { full_name: string | null } | null
  email?: string
}

interface InvitationRow {
  id: string
  email: string | null
  role: string
  token: string
  status: string
  created_at: string
}

export function OrgMembers() {
  const { org, orgId } = useOrg()
  const { user } = useAuth()
  const perms = usePermissions()
  const [members, setMembers] = useState<MemberRow[]>([])
  const [invitations, setInvitations] = useState<InvitationRow[]>([])
  const [inviteRole, setInviteRole] = useState<OrgRole>('member')
  const [inviting, setInviting] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    if (!orgId) return
    setLoading(true)

    const [membersRes, invitesRes] = await Promise.all([
      supabase
        .from('organization_members')
        .select('id, user_id, role, joined_at, profiles(full_name)')
        .eq('org_id', orgId)
        .order('joined_at'),
      supabase
        .from('organization_invitations')
        .select('id, email, role, token, status, created_at')
        .eq('org_id', orgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ])

    if (membersRes.data) {
      // Fetch emails from auth.users via edge function or profile
      setMembers(membersRes.data as unknown as MemberRow[])
    }
    if (invitesRes.data) {
      setInvitations(invitesRes.data as InvitationRow[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [orgId])

  const handleInvite = async () => {
    if (!orgId || !user) return
    setInviting(true)
    try {
      const { data: inv, error } = await supabase
        .from('organization_invitations')
        .insert({
          org_id: orgId,
          role: inviteRole,
          invited_by: user.id,
        })
        .select('token')
        .single()

      if (error) throw error
      const link = `https://laiky-cadence.vercel.app/invite/${inv.token}`
      navigator.clipboard.writeText(link)
      toast.success('Invite link copied to clipboard!')
      fetchData()
    } catch {
      toast.error('Failed to create invitation')
    } finally {
      setInviting(false)
    }
  }

  const handleRoleChange = async (memberId: string, newRole: OrgRole) => {
    const { error } = await supabase
      .from('organization_members')
      .update({ role: newRole })
      .eq('id', memberId)

    if (error) {
      toast.error('Failed to update role')
    } else {
      toast.success('Role updated')
      fetchData()
    }
  }

  const handleRemoveMember = async (memberId: string, memberUserId: string) => {
    if (memberUserId === user?.id) {
      toast.error('You cannot remove yourself')
      return
    }
    const { error } = await supabase
      .from('organization_members')
      .delete()
      .eq('id', memberId)

    if (error) {
      toast.error('Failed to remove member')
    } else {
      toast.success('Member removed')
      fetchData()
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    const { error } = await supabase
      .from('organization_invitations')
      .update({ status: 'revoked' })
      .eq('id', inviteId)

    if (error) {
      toast.error('Failed to revoke invitation')
    } else {
      toast.success('Invitation revoked')
      fetchData()
    }
  }

  const roleBadgeColor: Record<OrgRole, string> = {
    admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    member: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    viewer: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  }

  if (!org) return null

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-[28px] font-bold tracking-tight font-heading">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
        <div className="flex gap-2 mt-4">
          <Link to="/settings" className="px-3 py-1.5 text-sm font-medium rounded-md text-muted-foreground hover:bg-accent">
            Account
          </Link>
          <Link to="/settings/organization" className="px-3 py-1.5 text-sm font-medium rounded-md text-muted-foreground hover:bg-accent">
            Organization
          </Link>
          <Link to="/settings/members" className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground">
            Members
          </Link>
        </div>
      </div>

      <div className="max-w-3xl space-y-6">

      {/* Invite section */}
      {perms.members_invite && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5" />
              Invite Member
            </CardTitle>
            <CardDescription>Generate a link to invite someone to the organization</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Select value={inviteRole} onValueChange={v => setInviteRole(v as OrgRole)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  {perms.members_manage_roles && (
                    <SelectItem value="admin">Admin</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button onClick={handleInvite} disabled={inviting}>
                <Copy className="h-4 w-4 mr-2" />
                {inviting ? 'Generating...' : 'Generate & Copy Link'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Members ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : (
            <div className="divide-y">
              {members.map(member => (
                <div key={member.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
                      {(member.profiles?.full_name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {member.profiles?.full_name || 'Unknown'}
                        {member.user_id === user?.id && (
                          <span className="text-muted-foreground ml-1">(you)</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Joined {new Date(member.joined_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {perms.members_manage_roles && member.user_id !== user?.id ? (
                      <Select
                        value={member.role}
                        onValueChange={v => handleRoleChange(member.id, v as OrgRole)}
                      >
                        <SelectTrigger className="w-[120px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary" className={roleBadgeColor[member.role]}>
                        {ROLE_LABELS[member.role]}
                      </Badge>
                    )}
                    {perms.members_remove && member.user_id !== user?.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700"
                        onClick={() => handleRemoveMember(member.id, member.user_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pending Invitations ({invitations.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {invitations.map(inv => (
                <div key={inv.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{inv.email || 'Open invite link'}</p>
                    <p className="text-xs text-muted-foreground">
                      Invited as {inv.role} on {new Date(inv.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        navigator.clipboard.writeText(`https://laiky-cadence.vercel.app/invite/${inv.token}`)
                        toast.success('Link copied')
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500"
                      onClick={() => handleRevokeInvite(inv.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  )
}
