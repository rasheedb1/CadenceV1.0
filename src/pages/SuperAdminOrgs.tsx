import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Building2, Plus, Search, Copy, Check, Users, ExternalLink, Settings, X } from 'lucide-react'
import { toast } from 'sonner'
import { type OrgPlan, PLAN_LABELS, PLAN_COLORS } from '@/types/organization'
import { Navigate } from 'react-router-dom'
import { Switch } from '@/components/ui/switch'
import { DEFAULT_FEATURE_FLAGS, FEATURE_FLAG_LABELS, FEATURE_FLAG_GROUPS } from '@/types/feature-flags'
import type { OrgFeatureFlags, FeatureFlagKey } from '@/types/feature-flags'

interface OrgRow {
  id: string
  name: string
  slug: string
  plan: OrgPlan
  is_active: boolean
  created_at: string
  member_count: number
  feature_flags: Record<string, boolean>
}

interface InvitationRow {
  id: string
  email: string
  role: string
  token: string
  status: string
  created_at: string
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function SuperAdminOrgs() {
  const { isSuperAdmin } = useAuth()
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Create org dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newPlan, setNewPlan] = useState<OrgPlan>('starter')
  const [creating, setCreating] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ link: string | null; memberAdded: boolean } | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)

  // Detail/edit dialog
  const [selectedOrg, setSelectedOrg] = useState<OrgRow | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [editPlan, setEditPlan] = useState<OrgPlan>('free')
  const [editActive, setEditActive] = useState(true)
  const [savingEdit, setSavingEdit] = useState(false)
  const [orgMembers, setOrgMembers] = useState<{ id: string; user_id: string; role: string; feature_flags: Record<string, boolean>; profiles: { full_name: string | null } | null }[]>([])
  const [editingMemberFlags, setEditingMemberFlags] = useState<string | null>(null) // member id being edited
  const [memberFlagsEdit, setMemberFlagsEdit] = useState<Partial<OrgFeatureFlags>>({})
  const [orgInvitations, setOrgInvitations] = useState<InvitationRow[]>([])

  // Feature flags
  const [editFlags, setEditFlags] = useState<OrgFeatureFlags>({ ...DEFAULT_FEATURE_FLAGS })
  const [savingFlags, setSavingFlags] = useState(false)

  // Invite within detail
  const [detailInviteRole, setDetailInviteRole] = useState('admin')
  const [detailInviting, setDetailInviting] = useState(false)

  const fetchOrgs = useCallback(async () => {
    setLoading(true)
    // Fetch all orgs with member counts
    const { data: orgsData } = await supabase
      .from('organizations')
      .select('id, name, slug, plan, is_active, created_at, feature_flags')
      .order('created_at', { ascending: false })

    if (orgsData) {
      // Get member counts
      const { data: counts } = await supabase
        .from('organization_members')
        .select('org_id')

      const countMap: Record<string, number> = {}
      counts?.forEach((row: { org_id: string }) => {
        countMap[row.org_id] = (countMap[row.org_id] || 0) + 1
      })

      setOrgs(
        orgsData.map((o) => ({
          ...o,
          plan: o.plan as OrgPlan,
          member_count: countMap[o.id] || 0,
          feature_flags: (o.feature_flags as Record<string, boolean>) || {},
        }))
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (isSuperAdmin) fetchOrgs()
  }, [isSuperAdmin, fetchOrgs])

  const handleCreate = async () => {
    if (!newName.trim() || !newSlug.trim()) return
    setCreating(true)
    setInviteResult(null)

    try {
      const { data, error } = await supabase.functions.invoke('admin-create-org', {
        body: {
          name: newName.trim(),
          slug: newSlug.trim().toLowerCase(),
          plan: newPlan,
          adminRole: 'admin',
        },
      })

      if (error) throw error

      toast.success(`Organization "${newName}" created`)
      setInviteResult({
        link: data.inviteLink || null,
        memberAdded: false,
      })
      fetchOrgs()
    } catch {
      toast.error('Failed to create organization')
    } finally {
      setCreating(false)
    }
  }

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link)
    setCopiedLink(true)
    toast.success('Invite link copied')
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const openDetail = async (org: OrgRow) => {
    setSelectedOrg(org)
    setEditPlan(org.plan)
    setEditActive(org.is_active)
    setEditFlags({ ...DEFAULT_FEATURE_FLAGS, ...org.feature_flags })
    setDetailOpen(true)

    // Fetch members and invitations
    const [membersRes, invitesRes] = await Promise.all([
      supabase
        .from('organization_members')
        .select('id, user_id, role, feature_flags, profiles(full_name)')
        .eq('org_id', org.id),
      supabase
        .from('organization_invitations')
        .select('id, email, role, token, status, created_at')
        .eq('org_id', org.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ])

    setOrgMembers(
      (membersRes.data || []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        user_id: m.user_id as string,
        role: m.role as string,
        feature_flags: (m.feature_flags as Record<string, boolean>) || {},
        profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles,
      }))
    )
    setEditingMemberFlags(null)
    setOrgInvitations((invitesRes.data as InvitationRow[]) || [])
  }

  const handleSaveEdit = async () => {
    if (!selectedOrg) return
    setSavingEdit(true)
    const updates: Record<string, unknown> = { plan: editPlan, is_active: editActive }
    if (editPlan !== selectedOrg.plan && editPlan !== 'free') {
      updates.plan_started_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', selectedOrg.id)

    if (error) {
      toast.error('Failed to update organization')
    } else {
      toast.success('Organization updated')
      fetchOrgs()
      setSelectedOrg({ ...selectedOrg, plan: editPlan, is_active: editActive })
    }
    setSavingEdit(false)
  }

  const handleSaveFlags = async () => {
    if (!selectedOrg) return
    setSavingFlags(true)

    // Only store flags that differ from defaults (compact storage)
    const stored: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(editFlags)) {
      if (value !== DEFAULT_FEATURE_FLAGS[key as FeatureFlagKey]) {
        stored[key] = value
      }
    }

    const { error } = await supabase
      .from('organizations')
      .update({ feature_flags: stored })
      .eq('id', selectedOrg.id)

    if (error) {
      toast.error('Failed to save feature flags')
    } else {
      toast.success('Feature flags updated')
      setSelectedOrg({ ...selectedOrg, feature_flags: stored })
      fetchOrgs()
    }
    setSavingFlags(false)
  }

  const toggleFlag = (flag: FeatureFlagKey) => {
    setEditFlags(prev => ({ ...prev, [flag]: !prev[flag] }))
  }

  const openMemberFlags = (member: typeof orgMembers[0]) => {
    setEditingMemberFlags(member.id)
    setMemberFlagsEdit({ ...member.feature_flags })
  }

  const setMemberFlagValue = (flag: FeatureFlagKey, value: boolean) => {
    setMemberFlagsEdit(prev => ({ ...prev, [flag]: value }))
  }

  const clearMemberFlag = (flag: FeatureFlagKey) => {
    setMemberFlagsEdit(prev => {
      const next = { ...prev }
      delete next[flag]
      return next
    })
  }

  const handleSaveMemberFlags = async (memberId: string) => {
    const { error } = await supabase
      .from('organization_members')
      .update({ feature_flags: memberFlagsEdit })
      .eq('id', memberId)

    if (error) {
      toast.error('Failed to save user flags')
    } else {
      toast.success('User flags updated')
      // Update local state
      setOrgMembers(prev =>
        prev.map(m => m.id === memberId ? { ...m, feature_flags: { ...memberFlagsEdit } as Record<string, boolean> } : m)
      )
      setEditingMemberFlags(null)
    }
  }

  const handleDetailInvite = async () => {
    if (!selectedOrg) return
    setDetailInviting(true)

    const currentUser = (await supabase.auth.getUser()).data.user

    // Create invitation without email — the link is the invitation
    const { data: inv, error: invErr } = await supabase
      .from('organization_invitations')
      .insert({
        org_id: selectedOrg.id,
        role: detailInviteRole,
        invited_by: currentUser?.id,
      })
      .select('token')
      .single()

    if (invErr) {
      toast.error('Failed to create invitation: ' + invErr.message)
    } else {
      const link = `https://laiky-cadence.vercel.app/invite/${inv.token}`
      navigator.clipboard.writeText(link)
      toast.success('Invite link copied to clipboard!')
    }

    setDetailInviting(false)

    // Refresh
    openDetail(selectedOrg)
  }

  if (!isSuperAdmin) {
    return <Navigate to="/" replace />
  }

  const filtered = search
    ? orgs.filter(
        (o) =>
          o.name.toLowerCase().includes(search.toLowerCase()) ||
          o.slug.toLowerCase().includes(search.toLowerCase())
      )
    : orgs

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-[28px] font-bold tracking-tight font-heading">Super Admin</h1>
        <p className="text-muted-foreground">Manage all organizations</p>
      </div>

      <div className="max-w-5xl space-y-6">
        {/* Actions bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search organizations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setInviteResult(null) }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Organization
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Organization</DialogTitle>
                <DialogDescription>
                  Create a new organization for a client. An invite link will be generated automatically.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Organization Name</Label>
                  <Input
                    placeholder="Acme Corp"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value)
                      setNewSlug(slugify(e.target.value))
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input
                    placeholder="acme-corp"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">URL identifier, must be unique</p>
                </div>
                <div className="space-y-2">
                  <Label>Plan</Label>
                  <Select value={newPlan} onValueChange={(v) => setNewPlan(v as OrgPlan)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="starter">Starter</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {inviteResult?.link && (
                  <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
                    <CardContent className="pt-4 space-y-2">
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">
                        Organization created! Share this invite link:
                      </p>
                      <div className="flex items-center gap-2">
                        <Input value={inviteResult.link} readOnly className="text-xs font-mono" />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleCopyLink(inviteResult.link!)}
                        >
                          {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Anyone with this link can create an account and join as admin.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setCreateOpen(false); setInviteResult(null) }}>
                  {inviteResult ? 'Done' : 'Cancel'}
                </Button>
                {!inviteResult && (
                  <Button onClick={handleCreate} disabled={creating || !newName.trim() || !newSlug.trim()}>
                    {creating ? 'Creating...' : 'Create'}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Organizations</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{orgs.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{orgs.filter((o) => o.is_active).length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Paid Plans</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{orgs.filter((o) => o.plan !== 'free').length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No organizations found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{org.name}</p>
                          <p className="text-xs text-muted-foreground">{org.slug}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={PLAN_COLORS[org.plan]}>
                          {PLAN_LABELS[org.plan]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {org.member_count}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={org.is_active ? 'default' : 'secondary'}>
                          {org.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(org.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openDetail(org)}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {selectedOrg?.name}
            </DialogTitle>
            <DialogDescription>{selectedOrg?.slug}</DialogDescription>
          </DialogHeader>

          {selectedOrg && (
            <div className="space-y-6 py-2">
              {/* Edit Plan & Status */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Plan</Label>
                  <Select value={editPlan} onValueChange={(v) => setEditPlan(v as OrgPlan)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="starter">Starter</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={editActive ? 'active' : 'inactive'} onValueChange={(v) => setEditActive(v === 'active')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(editPlan !== selectedOrg.plan || editActive !== selectedOrg.is_active) && (
                <Button onClick={handleSaveEdit} disabled={savingEdit} size="sm">
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </Button>
              )}

              {/* Feature Flags */}
              <div className="space-y-4">
                <Label className="text-sm font-medium">Feature Flags</Label>
                {FEATURE_FLAG_GROUPS.map((group) => {
                  const parentOff = group.parentFlag ? !editFlags[group.parentFlag] : false
                  return (
                    <div key={group.label} className={parentOff ? 'opacity-50' : ''}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        {group.label}
                        {parentOff && <span className="ml-1 normal-case font-normal">(section disabled)</span>}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {group.flags.map((flag) => (
                          <div
                            key={flag}
                            className="flex items-center justify-between rounded-md border px-3 py-2"
                          >
                            <span className="text-sm">{FEATURE_FLAG_LABELS[flag]}</span>
                            <Switch
                              checked={editFlags[flag]}
                              onCheckedChange={() => toggleFlag(flag)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
                <Button onClick={handleSaveFlags} disabled={savingFlags} size="sm">
                  {savingFlags ? 'Saving...' : 'Save Flags'}
                </Button>
              </div>

              {/* Members */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Members ({orgMembers.length})</Label>
                <div className="divide-y rounded-md border">
                  {orgMembers.map((m) => {
                    const hasOverrides = Object.keys(m.feature_flags).length > 0
                    const isEditing = editingMemberFlags === m.id
                    return (
                      <div key={m.id}>
                        <div className="flex items-center justify-between px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{m.profiles?.full_name || m.user_id.slice(0, 8)}</span>
                            {hasOverrides && (
                              <Badge variant="outline" className="text-xs">
                                {Object.keys(m.feature_flags).length} overrides
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{m.role}</Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => isEditing ? setEditingMemberFlags(null) : openMemberFlags(m)}
                              title="User feature flags"
                            >
                              {isEditing ? <X className="h-3.5 w-3.5" /> : <Settings className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </div>
                        {isEditing && (
                          <div className="px-3 pb-3 space-y-3 bg-muted/30">
                            <p className="text-xs text-muted-foreground pt-1">
                              Override flags for this user. Empty = inherits from org.
                            </p>
                            {FEATURE_FLAG_GROUPS.map((group) => (
                              <div key={group.label}>
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                  {group.label}
                                </p>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {group.flags.map((flag) => {
                                    const hasOverride = flag in memberFlagsEdit
                                    const orgValue = editFlags[flag]
                                    const effectiveValue = hasOverride ? memberFlagsEdit[flag]! : orgValue
                                    return (
                                      <div
                                        key={flag}
                                        className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs ${
                                          hasOverride ? 'border-primary/50 bg-primary/5' : 'border-border'
                                        }`}
                                      >
                                        <span className={hasOverride ? 'font-medium' : 'text-muted-foreground'}>
                                          {FEATURE_FLAG_LABELS[flag]}
                                        </span>
                                        <div className="flex items-center gap-1">
                                          {hasOverride && (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-5 w-5"
                                              onClick={() => clearMemberFlag(flag)}
                                              title="Remove override (inherit from org)"
                                            >
                                              <X className="h-3 w-3" />
                                            </Button>
                                          )}
                                          <Switch
                                            checked={effectiveValue}
                                            onCheckedChange={(checked) => setMemberFlagValue(flag, checked)}
                                            className="scale-75"
                                          />
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                            <Button size="sm" onClick={() => handleSaveMemberFlags(m.id)}>
                              Save User Flags
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {orgMembers.length === 0 && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No members yet</p>
                  )}
                </div>
              </div>

              {/* Pending Invitations */}
              {orgInvitations.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Pending Invitations</Label>
                  <div className="divide-y rounded-md border">
                    {orgInvitations.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm text-muted-foreground">
                          {inv.email || 'Open invite link'}
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">{inv.role}</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              navigator.clipboard.writeText(`https://laiky-cadence.vercel.app/invite/${inv.token}`)
                              toast.success('Link copied')
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generate invite link */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Generate Invite Link</Label>
                <div className="flex gap-2">
                  <Select value={detailInviteRole} onValueChange={setDetailInviteRole}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleDetailInvite}
                    disabled={detailInviting}
                    size="sm"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {detailInviting ? '...' : 'Generate & Copy Link'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share this link with anyone — they'll create an account and join automatically.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
