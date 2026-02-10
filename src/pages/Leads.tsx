import { useState, useMemo } from 'react'
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
import {
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Play,
  Pause,
  Users,
  Upload,
  Pencil,
  X,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react'
import { ImportLeadsDialog } from '@/components/ImportLeadsDialog'
import { LEAD_STATUS_CONFIG, type LeadStatus, type Lead } from '@/types'

interface LeadFormData {
  first_name: string
  last_name: string
  email: string
  company: string
  title: string
  linkedin_url: string
  phone: string
}

const initialFormData: LeadFormData = {
  first_name: '',
  last_name: '',
  email: '',
  company: '',
  title: '',
  linkedin_url: '',
  phone: '',
}

export function Leads() {
  const { user } = useAuth()
  const {
    leads,
    cadences,
    isLoading,
    createLead,
    updateLead,
    deleteLead,
    assignLeadToCadence,
    removeLeadFromCadence,
  } = useCadence()

  const [searchQuery, setSearchQuery] = useState('')
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false)
  const [isEditLeadOpen, setIsEditLeadOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isAssignOpen, setIsAssignOpen] = useState(false)
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<LeadFormData>(initialFormData)
  const [selectedCadenceId, setSelectedCadenceId] = useState<string>('none')
  const [duplicateLead, setDuplicateLead] = useState<Lead | null>(null)
  const [pendingLeadData, setPendingLeadData] = useState<LeadFormData | null>(null)

  // Filter leads based on search query with partial matching
  const filteredLeads = useMemo(() => {
    if (!searchQuery.trim()) return leads

    const query = searchQuery.toLowerCase().trim()
    return leads.filter((lead) => {
      const fullName = `${lead.first_name} ${lead.last_name}`.toLowerCase()
      return (
        fullName.includes(query) ||
        lead.first_name.toLowerCase().includes(query) ||
        lead.last_name.toLowerCase().includes(query) ||
        lead.email?.toLowerCase().includes(query) ||
        lead.company?.toLowerCase().includes(query) ||
        lead.title?.toLowerCase().includes(query)
      )
    })
  }, [leads, searchQuery])

  // Check for duplicate email in same cadence
  const checkDuplicate = (email: string, cadenceId: string, excludeLeadId?: string): Lead | null => {
    if (!email || !cadenceId) return null
    return leads.find(
      (lead) =>
        lead.email?.toLowerCase() === email.toLowerCase() &&
        lead.cadence_id === cadenceId &&
        lead.id !== excludeLeadId
    ) || null
  }

  const resetForm = () => {
    setFormData(initialFormData)
    setSelectedCadenceId('')
    setDuplicateLead(null)
    setPendingLeadData(null)
  }

  const handleOpenAddLead = () => {
    resetForm()
    setIsAddLeadOpen(true)
  }

  const handleOpenEditLead = (lead: Lead) => {
    setSelectedLeadId(lead.id)
    setFormData({
      first_name: lead.first_name,
      last_name: lead.last_name,
      email: lead.email || '',
      company: lead.company || '',
      title: lead.title || '',
      linkedin_url: lead.linkedin_url || '',
      phone: lead.phone || '',
    })
    setSelectedCadenceId(lead.cadence_id || '')
    setIsEditLeadOpen(true)
  }

  const handleSaveLead = async (isEdit: boolean = false) => {
    if (!user || !formData.first_name || !formData.last_name || !formData.email) return

    // Check for duplicate if cadence is selected
    if (selectedCadenceId && selectedCadenceId !== 'none') {
      const duplicate = checkDuplicate(
        formData.email,
        selectedCadenceId,
        isEdit ? selectedLeadId! : undefined
      )
      if (duplicate) {
        setDuplicateLead(duplicate)
        setPendingLeadData(formData)
        setIsDuplicateDialogOpen(true)
        return
      }
    }

    await performSave(isEdit, formData)
  }

  const performSave = async (isEdit: boolean, data: LeadFormData) => {
    if (!user) return
    setSaving(true)

    try {
      if (isEdit && selectedLeadId) {
        await updateLead(selectedLeadId, {
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email || null,
          company: data.company || null,
          title: data.title || null,
          linkedin_url: data.linkedin_url || null,
          phone: data.phone || null,
        })

        // Update cadence assignment if changed
        const currentLead = leads.find((l) => l.id === selectedLeadId)
        const effectiveCadenceId = selectedCadenceId === 'none' ? null : selectedCadenceId
        if (currentLead?.cadence_id !== effectiveCadenceId) {
          if (effectiveCadenceId) {
            await assignLeadToCadence(selectedLeadId, effectiveCadenceId)
          } else if (currentLead?.cadence_id) {
            await removeLeadFromCadence(selectedLeadId)
          }
        }

        setIsEditLeadOpen(false)
      } else {
        const newLead = await createLead({
          owner_id: user.id,
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email || null,
          company: data.company || null,
          title: data.title || null,
          linkedin_url: data.linkedin_url || null,
          phone: data.phone || null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })

        // Assign to cadence if selected
        if (newLead && selectedCadenceId && selectedCadenceId !== 'none') {
          await assignLeadToCadence(newLead.id, selectedCadenceId)
        }

        setIsAddLeadOpen(false)
      }

      resetForm()
    } finally {
      setSaving(false)
    }
  }

  const handleReplaceDuplicate = async () => {
    if (!duplicateLead || !pendingLeadData) return
    setSaving(true)

    try {
      // Update the existing duplicate with new data
      await updateLead(duplicateLead.id, {
        first_name: pendingLeadData.first_name,
        last_name: pendingLeadData.last_name,
        email: pendingLeadData.email || null,
        company: pendingLeadData.company || null,
        title: pendingLeadData.title || null,
        linkedin_url: pendingLeadData.linkedin_url || null,
        phone: pendingLeadData.phone || null,
      })

      setIsDuplicateDialogOpen(false)
      setIsAddLeadOpen(false)
      setIsEditLeadOpen(false)
      resetForm()
    } finally {
      setSaving(false)
    }
  }

  const handleCancelDuplicate = () => {
    setIsDuplicateDialogOpen(false)
  }

  const handleDeleteLead = async () => {
    if (!leadToDelete) return
    await deleteLead(leadToDelete)
    setIsDeleteConfirmOpen(false)
    setLeadToDelete(null)
  }

  const openDeleteConfirm = (leadId: string) => {
    setLeadToDelete(leadId)
    setIsDeleteConfirmOpen(true)
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

  const clearSearch = () => {
    setSearchQuery('')
  }

  // Validation for required fields
  const isFormValid = !!(
    formData.first_name.trim() &&
    formData.last_name.trim() &&
    formData.email.trim() &&
    formData.company.trim() &&
    formData.title.trim() &&
    formData.linkedin_url.trim()
  )

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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import Leads
          </Button>
          <Button onClick={handleOpenAddLead}>
            <Plus className="mr-2 h-4 w-4" />
            Create Lead
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Leads ({leads.length})</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, company, title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                  onClick={clearSearch}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
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
                <Button onClick={handleOpenAddLead}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Lead
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Email</th>
                    <th className="pb-3 font-medium">Company</th>
                    <th className="pb-3 font-medium">Title</th>
                    <th className="pb-3 font-medium">LinkedIn</th>
                    <th className="pb-3 font-medium">Phone</th>
                    <th className="pb-3 font-medium">Cadence</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredLeads.map((lead) => {
                    const cadence = cadences.find((c) => c.id === lead.cadence_id)
                    return (
                      <tr key={lead.id} className="text-sm">
                        <td className="py-3">
                          <p className="font-medium">
                            {lead.first_name} {lead.last_name}
                          </p>
                        </td>
                        <td className="py-3">{lead.email || '-'}</td>
                        <td className="py-3">{lead.company || '-'}</td>
                        <td className="py-3">{lead.title || '-'}</td>
                        <td className="py-3">
                          {lead.linkedin_url ? (
                            <a
                              href={lead.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              Profile
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-3">{lead.phone || '-'}</td>
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
                          <Badge
                            variant={getStatusBadgeVariant(lead.status || 'pending') as 'default'}
                          >
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
                              <DropdownMenuItem onClick={() => handleOpenEditLead(lead)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
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
                                onClick={() => openDeleteConfirm(lead.id)}
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

      {/* Add Lead Dialog */}
      <Dialog open={isAddLeadOpen} onOpenChange={setIsAddLeadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Lead</DialogTitle>
            <DialogDescription>
              Enter the lead's information. Required fields are marked with *.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input
                  value={formData.first_name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, first_name: e.target.value }))}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name *</Label>
                <Input
                  value={formData.last_name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, last_name: e.target.value }))}
                  placeholder="Doe"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="john@company.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company *</Label>
                <Input
                  value={formData.company}
                  onChange={(e) => setFormData((prev) => ({ ...prev, company: e.target.value }))}
                  placeholder="Acme Inc"
                />
              </div>
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Sales Manager"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>LinkedIn URL *</Label>
              <Input
                value={formData.linkedin_url}
                onChange={(e) => setFormData((prev) => ({ ...prev, linkedin_url: e.target.value }))}
                placeholder="https://linkedin.com/in/johndoe"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div className="space-y-2">
              <Label>Add to Cadence</Label>
              <Select value={selectedCadenceId} onValueChange={setSelectedCadenceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a cadence (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- No cadence --</SelectItem>
                  {cadences
                    .filter((c) => c.status === 'active')
                    .map((cadence) => (
                      <SelectItem key={cadence.id} value={cadence.id}>
                        {cadence.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddLeadOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => handleSaveLead(false)} disabled={saving || !isFormValid}>
              {saving ? 'Creating...' : 'Create Lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Lead Dialog */}
      <Dialog open={isEditLeadOpen} onOpenChange={setIsEditLeadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
            <DialogDescription>
              Update the lead's information. Required fields are marked with *.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input
                  value={formData.first_name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, first_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name *</Label>
                <Input
                  value={formData.last_name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, last_name: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company *</Label>
                <Input
                  value={formData.company}
                  onChange={(e) => setFormData((prev) => ({ ...prev, company: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>LinkedIn URL *</Label>
              <Input
                value={formData.linkedin_url}
                onChange={(e) => setFormData((prev) => ({ ...prev, linkedin_url: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Cadence</Label>
              <Select value={selectedCadenceId} onValueChange={setSelectedCadenceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a cadence (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- No cadence --</SelectItem>
                  {cadences
                    .filter((c) => c.status === 'active')
                    .map((cadence) => (
                      <SelectItem key={cadence.id} value={cadence.id}>
                        {cadence.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditLeadOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => handleSaveLead(true)} disabled={saving || !isFormValid}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign to Cadence Dialog */}
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

      {/* Duplicate Warning Dialog */}
      <Dialog open={isDuplicateDialogOpen} onOpenChange={setIsDuplicateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Duplicate Lead Found
            </DialogTitle>
            <DialogDescription>
              A lead with email "{pendingLeadData?.email}" already exists in this cadence.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {duplicateLead && (
              <div className="rounded-lg border bg-muted/50 p-4">
                <p className="font-medium">
                  {duplicateLead.first_name} {duplicateLead.last_name}
                </p>
                <p className="text-sm text-muted-foreground">{duplicateLead.email}</p>
                <p className="text-sm text-muted-foreground">
                  {duplicateLead.company} - {duplicateLead.title}
                </p>
              </div>
            )}
            <p className="mt-4 text-sm text-muted-foreground">
              Would you like to replace the existing lead with the new information, or cancel?
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelDuplicate}>
              Cancel
            </Button>
            <Button onClick={handleReplaceDuplicate} disabled={saving}>
              {saving ? 'Replacing...' : 'Replace Existing'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete Lead
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this lead? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteLead}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportLeadsDialog open={isImportOpen} onOpenChange={setIsImportOpen} />
    </div>
  )
}
