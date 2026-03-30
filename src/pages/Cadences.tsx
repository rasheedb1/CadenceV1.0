import { useState, useRef, useEffect } from 'react'
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
import { Plus, Workflow, MoreVertical, Pencil, Trash2, Copy, Loader2, SquarePen } from 'lucide-react'
import { PermissionGate } from '@/components/PermissionGate'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageTransition } from '@/components/PageTransition'

export function Cadences() {
  const navigate = useNavigate()
  const { cadences, isLoading, createCadence, duplicateCadence, deleteCadence, updateCadence } = useCadence()
  const [newCadenceName, setNewCadenceName] = useState('')
  const [newCadenceDescription, setNewCadenceDescription] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) editInputRef.current?.select()
  }, [editingId])

  const startEdit = (e: React.MouseEvent, id: string, currentName: string) => {
    e.stopPropagation()
    setEditingId(id)
    setEditingName(currentName)
  }

  const commitEdit = async () => {
    if (!editingId) return
    const trimmed = editingName.trim()
    if (trimmed && trimmed !== cadences.find(c => c.id === editingId)?.name) {
      await updateCadence(editingId, { name: trimmed })
    }
    setEditingId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

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
      alert(error instanceof Error ? error.message : 'Error al crear cadencia. Intenta de nuevo.')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`¿Eliminar la cadencia "${name}"?\n\nEsta acción puede revertirse contactando al soporte.`)) {
      try {
        await deleteCadence(id)
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Error al eliminar la cadencia. Inténtalo de nuevo.')
      }
    }
  }

  const handleDuplicate = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setDuplicatingId(id)
    try {
      const copy = await duplicateCadence(id)
      if (copy) navigate(`/cadences/${copy.id}`)
    } catch (err) {
      console.error('Failed to duplicate cadence:', err)
      alert(err instanceof Error ? err.message : 'Error al duplicar cadencia')
    } finally {
      setDuplicatingId(null)
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
    <PageTransition className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight font-heading">Cadences</h1>
          <p className="text-muted-foreground">Manage your sales sequences</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <PermissionGate permission="cadences_create">
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Cadence
              </Button>
            </DialogTrigger>
          </PermissionGate>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nueva Cadencia</DialogTitle>
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
                {creating ? 'Creando...' : 'Crear'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {cadences.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Workflow className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-medium">Sin cadencias aún</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Create your first cadence to start automating your outreach
            </p>
            <PermissionGate permission="cadences_create">
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Cadence
              </Button>
            </PermissionGate>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cadences.map((cadence) => (
            <Card
              key={cadence.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => editingId !== cadence.id && navigate(`/cadences/${cadence.id}`)}
            >
              <CardHeader className="flex flex-row items-start justify-between">
                <div className="flex-1 min-w-0 mr-2">
                  {editingId === cadence.id ? (
                    <Input
                      ref={editInputRef}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      onBlur={commitEdit}
                      className="h-7 text-lg font-semibold px-1 -ml-1"
                    />
                  ) : (
                    <CardTitle
                      className="text-lg cursor-text"
                      onDoubleClick={(e) => startEdit(e, cadence.id, cadence.name)}
                      title="Double-click to rename"
                    >
                      {cadence.name}
                    </CardTitle>
                  )}
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
                    <DropdownMenuItem onClick={(e) => startEdit(e, cadence.id, cadence.name)}>
                      <SquarePen className="mr-2 h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => handleDuplicate(e, cadence.id)}
                      disabled={duplicatingId === cadence.id}
                    >
                      {duplicatingId === cadence.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      {duplicatingId === cadence.id ? 'Duplicating...' : 'Duplicate'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(cadence.id, cadence.name)
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
    </PageTransition>
  )
}
