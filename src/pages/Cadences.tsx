import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCadence } from '@/contexts/CadenceContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { Plus, Workflow, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function Cadences() {
  const navigate = useNavigate()
  const { cadences, isLoading, createCadence, deleteCadence } = useCadence()
  const [newCadenceName, setNewCadenceName] = useState('')
  const [newCadenceDescription, setNewCadenceDescription] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!newCadenceName.trim()) return
    setCreating(true)
    try {
      const cadence = await createCadence(newCadenceName, newCadenceDescription)
      setIsCreateOpen(false)
      setNewCadenceName('')
      setNewCadenceDescription('')
      if (cadence) {
        navigate(`/cadences/${cadence.id}`)
      }
    } catch (error) {
      console.error('Failed to create cadence:', error)
      alert(error instanceof Error ? error.message : 'Failed to create cadence. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this cadence?')) {
      await deleteCadence(id)
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
          <h1 className="text-3xl font-semibold tracking-tight">Cadences</h1>
          <p className="text-muted-foreground">Manage your sales sequences</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Cadence
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Cadence</DialogTitle>
              <DialogDescription>
                Give your cadence a name to get started
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="cadence-name">Cadence Name</Label>
                <Input
                  id="cadence-name"
                  value={newCadenceName}
                  onChange={(e) => setNewCadenceName(e.target.value)}
                  placeholder="e.g., Enterprise Outreach"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cadence-description">Description (optional)</Label>
                <Input
                  id="cadence-description"
                  value={newCadenceDescription}
                  onChange={(e) => setNewCadenceDescription(e.target.value)}
                  placeholder="e.g., Multi-touch outreach for enterprise accounts"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating || !newCadenceName.trim()}>
                {creating ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {cadences.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Workflow className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-medium">No cadences yet</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Create your first cadence to start automating your outreach
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Cadence
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cadences.map((cadence) => (
            <Card
              key={cadence.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => navigate(`/cadences/${cadence.id}`)}
            >
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{cadence.name}</CardTitle>
                  <CardDescription>
                    {cadence.steps?.length || 0} steps
                  </CardDescription>
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
                        navigate(`/cadences/${cadence.id}`)
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(cadence.id)
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Badge variant={cadence.status === 'active' ? 'default' : 'secondary'}>
                    {cadence.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {new Date(cadence.created_at).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
