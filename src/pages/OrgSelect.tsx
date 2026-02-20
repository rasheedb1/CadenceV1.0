import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Plus, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

export function OrgSelect() {
  const { user } = useAuth()
  const { allOrgs, switchOrg, createOrg, isLoading } = useOrg()
  const navigate = useNavigate()
  const [newOrgName, setNewOrgName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  if (!user) {
    navigate('/auth')
    return null
  }

  const handleSelectOrg = async (orgId: string) => {
    await switchOrg(orgId)
    navigate('/')
  }

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return
    setCreating(true)
    try {
      await createOrg(newOrgName.trim())
      toast.success('Organization created')
      navigate('/')
    } catch (err) {
      toast.error('Failed to create organization')
    } finally {
      setCreating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Welcome to Closr</h1>
          <p className="text-muted-foreground mt-2">
            {allOrgs.length > 0
              ? 'Select an organization or create a new one'
              : 'Create your first organization to get started'}
          </p>
        </div>

        {allOrgs.length > 0 && (
          <div className="space-y-3">
            {allOrgs.map(org => (
              <Card
                key={org.id}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleSelectOrg(org.id)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{org.name}</p>
                      <p className="text-xs text-muted-foreground">{org.slug}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {showCreate || allOrgs.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Create Organization</CardTitle>
              <CardDescription>
                Set up a new workspace for your team
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Organization name"
                value={newOrgName}
                onChange={e => setNewOrgName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateOrg()}
              />
              <div className="flex gap-2">
                {allOrgs.length > 0 && (
                  <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>
                    Cancel
                  </Button>
                )}
                <Button
                  className="flex-1"
                  onClick={handleCreateOrg}
                  disabled={!newOrgName.trim() || creating}
                >
                  {creating ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Create new organization
          </Button>
        )}
      </div>
    </div>
  )
}
