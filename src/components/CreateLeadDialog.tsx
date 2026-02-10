import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useCadence } from '@/contexts/CadenceContext'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { AlertTriangle } from 'lucide-react'
import type { Lead } from '@/types'

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

interface CreateLeadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preSelectedCadenceId?: string
  onLeadCreated?: (lead: Lead) => void
}

export function CreateLeadDialog({
  open,
  onOpenChange,
  preSelectedCadenceId,
  onLeadCreated,
}: CreateLeadDialogProps) {
  const { user } = useAuth()
  const { leads, cadences, createLead, updateLead, assignLeadToCadence } = useCadence()

  const [formData, setFormData] = useState<LeadFormData>(initialFormData)
  const [selectedCadenceId, setSelectedCadenceId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false)
  const [duplicateLead, setDuplicateLead] = useState<Lead | null>(null)
  const [pendingLeadData, setPendingLeadData] = useState<LeadFormData | null>(null)

  // Reset form when dialog opens/closes or preSelectedCadenceId changes
  useEffect(() => {
    if (open) {
      setFormData(initialFormData)
      setSelectedCadenceId(preSelectedCadenceId || '')
      setDuplicateLead(null)
      setPendingLeadData(null)
    }
  }, [open, preSelectedCadenceId])

  // Check for duplicate email in same cadence
  const checkDuplicate = (email: string, cadenceId: string): Lead | null => {
    if (!email || !cadenceId) return null
    return (
      leads.find(
        (lead) =>
          lead.email?.toLowerCase() === email.toLowerCase() && lead.cadence_id === cadenceId
      ) || null
    )
  }

  const handleSave = async () => {
    if (!user || !formData.first_name || !formData.last_name || !formData.email) return

    // Check for duplicate if cadence is selected
    if (selectedCadenceId && selectedCadenceId !== 'none') {
      const duplicate = checkDuplicate(formData.email, selectedCadenceId)
      if (duplicate) {
        setDuplicateLead(duplicate)
        setPendingLeadData(formData)
        setIsDuplicateDialogOpen(true)
        return
      }
    }

    await performSave(formData)
  }

  const performSave = async (data: LeadFormData) => {
    if (!user) return
    setSaving(true)

    try {
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

      if (newLead && onLeadCreated) {
        onLeadCreated(newLead)
      }

      toast.success('Lead created successfully')
      onOpenChange(false)
    } catch (error) {
      console.error('Error creating lead:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create lead')
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
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const handleCancelDuplicate = () => {
    setIsDuplicateDialogOpen(false)
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
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
              <Select
                value={selectedCadenceId}
                onValueChange={setSelectedCadenceId}
                disabled={!!preSelectedCadenceId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a cadence (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {!preSelectedCadenceId && <SelectItem value="none">-- No cadence --</SelectItem>}
                  {cadences
                    .filter((c) => c.status === 'active')
                    .map((cadence) => (
                      <SelectItem key={cadence.id} value={cadence.id}>
                        {cadence.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {preSelectedCadenceId && (
                <p className="text-xs text-muted-foreground">
                  Lead will be added to this cadence automatically.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !isFormValid}>
              {saving ? 'Creating...' : 'Create Lead'}
            </Button>
          </DialogFooter>
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
    </>
  )
}
