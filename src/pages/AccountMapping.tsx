import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccountMapping } from '@/contexts/AccountMappingContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Plus, Target, MoreVertical, Pencil, Trash2, Building2, Users, UserSearch } from 'lucide-react'
import { PermissionGate } from '@/components/PermissionGate'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function AccountMapping() {
  const navigate = useNavigate()
  const { accountMaps, isLoading, createAccountMap, deleteAccountMap } = useAccountMapping()
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const map = await createAccountMap(newName, newDescription)
      setIsCreateOpen(false)
      setNewName('')
      setNewDescription('')
      if (map) {
        navigate(`/account-mapping/${map.id}`)
      }
    } catch (error) {
      console.error('Failed to create account map:', error)
      alert(error instanceof Error ? error.message : 'Failed to create account map.')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this account map and all its data?')) {
      await deleteAccountMap(id)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight font-heading">Account Mapping</h1>
          <p className="text-muted-foreground">Define your ICP, find prospects, and build target lists</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <PermissionGate permission="account_mapping_create">
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Account Map
              </Button>
            </DialogTrigger>
          </PermissionGate>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Account Map</DialogTitle>
              <DialogDescription>
                Define a new Ideal Customer Profile to target
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="map-name">Name</Label>
                <Input
                  id="map-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Enterprise Fintech"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="map-description">Description (optional)</Label>
                <Input
                  id="map-description"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="e.g., Companies processing $1B+ in payments"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {accountMaps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-medium">No account maps yet</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Create your first account map to define your ICP and find prospects
            </p>
            <PermissionGate permission="account_mapping_create">
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Account Map
              </Button>
            </PermissionGate>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accountMaps.map((map) => {
            const companyCount = map.account_map_companies?.length || 0
            const prospectCount = map.prospects?.length || 0
            const personaCount = map.buyer_personas?.length || 0

            return (
              <Card
                key={map.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/account-mapping/${map.id}`)}
              >
                <CardHeader className="flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{map.name}</CardTitle>
                    {map.description && (
                      <CardDescription className="mt-1">{map.description}</CardDescription>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/account-mapping/${map.id}`)
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(map.id)
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {companyCount} {companyCount === 1 ? 'company' : 'companies'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {personaCount} {personaCount === 1 ? 'persona' : 'personas'}
                    </span>
                    <span className="flex items-center gap-1">
                      <UserSearch className="h-3.5 w-3.5" />
                      {prospectCount} {prospectCount === 1 ? 'prospect' : 'prospects'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
