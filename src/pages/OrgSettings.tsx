import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useOrg } from '@/contexts/OrgContext'
import { usePermissions } from '@/hooks/usePermissions'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Save } from 'lucide-react'
import { toast } from 'sonner'

export function OrgSettings() {
  const { org, refreshOrgs } = useOrg()
  const perms = usePermissions()
  const [name, setName] = useState(org?.name || '')
  const [saving, setSaving] = useState(false)

  if (!org) return null

  const canEdit = perms.org_settings_edit

  const handleSave = async () => {
    if (!canEdit || !name.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ name: name.trim() })
        .eq('id', org.id)

      if (error) throw error
      refreshOrgs()
      toast.success('Organization updated')
    } catch {
      toast.error('Failed to update organization')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-[28px] font-bold tracking-tight font-heading">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
        <div className="flex gap-2 mt-4">
          <Link to="/settings" className="px-3 py-1.5 text-sm font-medium rounded-md text-muted-foreground hover:bg-accent">
            Account
          </Link>
          <Link to="/settings/organization" className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground">
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
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            General
          </CardTitle>
          <CardDescription>Basic organization information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input value={org.slug} disabled className="text-muted-foreground" />
            <p className="text-xs text-muted-foreground">URL identifier, cannot be changed</p>
          </div>
          <div className="space-y-2">
            <Label>Organization ID</Label>
            <Input value={org.id} disabled className="text-muted-foreground font-mono text-xs" />
          </div>
          {canEdit && (
            <Button onClick={handleSave} disabled={saving || name === org.name}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
