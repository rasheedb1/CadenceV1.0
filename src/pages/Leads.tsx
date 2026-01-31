import { useState } from 'react'
import { useCadence } from '@/contexts/CadenceContext'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, Search, MoreVertical, Trash2, Play, Pause, Users } from 'lucide-react'
import { LEAD_STATUS_CONFIG, type LeadStatus } from '@/types'

export function Leads() {
  const { user } = useAuth()
  const { leads, cadences, isLoading, createLead, updateLead, deleteLead, assignLeadToCadence, removeLeadFromCadence } = useCadence()

  const [searchQuery, setSearchQuery] = useState('')
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false)
  const [isAssignOpen, setIsAssignOpen] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [newLead, setNewLead] = useState({
    first_name: '',
    last_name: '',
    email: '',
    company: '',
    title: '',
    linkedin_url: '',
    phone: '',
  })

  const filteredLeads = leads.filter((lead) => {
    const query = searchQuery.toLowerCase()
    return (
      lead.first_name.toLowerCase().includes(query) ||
      lead.last_name.toLowerCase().includes(query) ||
      lead.email?.toLowerCase().includes(query) ||
      lead.company?.toLowerCase().includes(query)
    )
  })

  const handleAddLead = async () => {
    if (!user || !newLead.first_name || !newLead.last_name) return
    setSaving(true)

    await createLead({
      owner_id: user.id,
      first_name: newLead.first_name,
      last_name: newLead.last_name,
      email: newLead.email || null,
      company: newLead.company || null,
      title: newLead.title || null,
      linkedin_url: newLead.linkedin_url || null,
      phone: newLead.phone || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })

    setSaving(false)
    setIsAddLeadOpen(false)
    setNewLead({
      first_name: '',
      last_name: '',
      email: '',
      company: '',
      title: '',
      linkedin_url: '',
      phone: '',
    })
  }

  const handleDeleteLead = async (id: string) => {
    if (confirm('Are you sure you want to delete this lead?')) {
      await deleteLead(id)
    }
  }

  const handlePauseLead = async (id: string) => {
    await updateLead(id, { status: 'paused' })
  }

  const handleResumeLead = async (id: string) => {
    await updateLead(id, { status: 'active' })
  }

  const openAssignDialog = (leadId: string) => {
    setSelectedLeadId(leadId)
    setIsAssignOpen(true)
  }

  const handleAssign = async (cadenceId: string) => {
    if (!selectedLeadId) return
    await assignLeadToCadence(selectedLeadId, cadenceId)
    setIsAssignOpen(false)
    setSelectedLeadId(null)
  }

  const handleRemoveFromCadence = async (leadId: string) => {
    await removeLeadFromCadence(leadId)
  }

  const getStatusBadgeVariant = (status: LeadStatus) => {
    switch (status) {
      case 'active':
        return 'success'
      case 'failed':
        return 'destructive'
      case 'paused':
        return 'secondary'
      case 'sent':
        return 'info'
      default:
        return 'outline'
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
          <h1 className="text-3xl font-semibold tracking-tight">Leads</h1>
          <p className="text-muted-foreground">Manage your contacts and prospects</p>
        </div>
        <Button onClick={() => setIsAddLeadOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Lead
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Leads ({leads.length})</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Users className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-medium">No leads found</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                {searchQuery ? 'Try a different search' : 'Add your first lead to get started'}
              </p>
              {!searchQuery && (
                <Button onClick={() => setIsAddLeadOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Lead
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Company</th>
                    <th className="pb-3 font-medium">Email</th>
                    <th className="pb-3 font-medium">Cadence</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredLeads.map((lead) => {
                    const cadence = cadences.find((c) => c.id === lead.cadence_id)
                    return (
                      <tr key={lead.id} className="text-sm">
                        <td className="py-3">
                          <div>
                            <p className="font-medium">
                              {lead.first_name} {lead.last_name}
                            </p>
                            {lead.title && (
                              <p className="text-muted-foreground">{lead.title}</p>
                            )}
                          </div>
                        </td>
                        <td className="py-3">{lead.company || '-'}</td>
                        <td className="py-3">{lead.email || '-'}</td>
                        <td className="py-3">
                          {cadence ? (
                            <span className="text-sm">{cadence.name}</span>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openAssignDialog(lead.id)}
                            >
                              Assign
                            </Button>
                          )}
                        </td>
                        <td className="py-3">
                          <Badge variant={getStatusBadgeVariant(lead.status || 'pending') as 'default'}>
                            {LEAD_STATUS_CONFIG[lead.status || 'pending'].label}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!lead.cadence_id ? (
                                <DropdownMenuItem onClick={() => openAssignDialog(lead.id)}>
                                  <Play className="mr-2 h-4 w-4" />
                                  Assign to Cadence
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => handleRemoveFromCadence(lead.id)}>
                                  <Pause className="mr-2 h-4 w-4" />
                                  Remove from Cadence
                                </DropdownMenuItem>
                              )}
                              {lead.status === 'active' && lead.cadence_id && (
                                <DropdownMenuItem onClick={() => handlePauseLead(lead.id)}>
                                  <Pause className="mr-2 h-4 w-4" />
                                  Pause
                                </DropdownMenuItem>
                              )}
                              {lead.status === 'paused' && lead.cadence_id && (
                                <DropdownMenuItem onClick={() => handleResumeLead(lead.id)}>
                                  <Play className="mr-2 h-4 w-4" />
                                  Resume
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleDeleteLead(lead.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isAddLeadOpen} onOpenChange={setIsAddLeadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Lead</DialogTitle>
            <DialogDescription>Enter the lead's information</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input
                  value={newLead.first_name}
                  onChange={(e) => setNewLead((prev) => ({ ...prev, first_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name *</Label>
                <Input
                  value={newLead.last_name}
                  onChange={(e) => setNewLead((prev) => ({ ...prev, last_name: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={newLead.email}
                onChange={(e) => setNewLead((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company</Label>
                <Input
                  value={newLead.company}
                  onChange={(e) => setNewLead((prev) => ({ ...prev, company: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={newLead.title}
                  onChange={(e) => setNewLead((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>LinkedIn URL</Label>
              <Input
                value={newLead.linkedin_url}
                onChange={(e) => setNewLead((prev) => ({ ...prev, linkedin_url: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={newLead.phone}
                onChange={(e) => setNewLead((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddLeadOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddLead}
              disabled={saving || !newLead.first_name || !newLead.last_name}
            >
              {saving ? 'Adding...' : 'Add Lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to Cadence</DialogTitle>
            <DialogDescription>Select a cadence for this lead</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select onValueChange={handleAssign}>
              <SelectTrigger>
                <SelectValue placeholder="Select a cadence" />
              </SelectTrigger>
              <SelectContent>
                {cadences
                  .filter((c) => c.status === 'active')
                  .map((cadence) => (
                    <SelectItem key={cadence.id} value={cadence.id}>
                      {cadence.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {cadences.filter((c) => c.status === 'active').length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                No active cadences available. Activate a cadence first.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
