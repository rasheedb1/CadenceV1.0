import { useState } from 'react'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/contexts/AuthContext'
import { Building2, ChevronDown, Plus, Check } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function OrgSwitcher() {
  const { org, allOrgs, switchOrg, createOrg } = useOrg()
  const { isSuperAdmin } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!newOrgName.trim()) return
    setCreating(true)
    try {
      await createOrg(newOrgName.trim())
      setNewOrgName('')
      setShowCreate(false)
    } catch {
      // Error handling via toast in context
    } finally {
      setCreating(false)
    }
  }

  if (!org) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-accent/50 transition-colors">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm font-semibold shrink-0">
              {org.logo_url ? (
                <img src={org.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <Building2 className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{org.name}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[240px]">
          {allOrgs.map((o) => (
            <DropdownMenuItem
              key={o.id}
              onClick={() => switchOrg(o.id)}
              className="flex items-center gap-2"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary shrink-0">
                <Building2 className="h-3.5 w-3.5" />
              </div>
              <span className="flex-1 truncate">{o.name}</span>
              {o.id === org.id && <Check className="h-4 w-4 text-primary shrink-0" />}
            </DropdownMenuItem>
          ))}
          {isSuperAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create organization
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Organization name"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newOrgName.trim()}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
