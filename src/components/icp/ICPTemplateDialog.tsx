import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Trash2, Download, Save, Loader2 } from 'lucide-react'
import type { ICPTemplate } from '@/types/account-mapping'
import type { ICPBuilderData } from '@/types/icp-builder'
import { isICPBuilderPopulated } from '@/lib/icp-prompt-builder'

type DialogView = 'list' | 'save'

interface ICPTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: ICPTemplate[]
  currentData: ICPBuilderData
  onSave: (name: string, description: string | null, data: ICPBuilderData) => Promise<ICPTemplate | null>
  onDelete: (id: string) => Promise<void>
  onLoad: (data: ICPBuilderData) => void
}

export function ICPTemplateDialog({
  open,
  onOpenChange,
  templates,
  currentData,
  onSave,
  onDelete,
  onLoad,
}: ICPTemplateDialogProps) {
  const [view, setView] = useState<DialogView>('list')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const canSave = isICPBuilderPopulated(currentData)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSave(name.trim(), description.trim() || null, currentData)
      setName('')
      setDescription('')
      setView('list')
    } catch (err) {
      console.error('Failed to save template:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await onDelete(id)
    } catch (err) {
      console.error('Failed to delete template:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const handleLoad = (template: ICPTemplate) => {
    onLoad(template.builder_data)
    onOpenChange(false)
  }

  const countFields = (data: ICPBuilderData): number => {
    let count = 0
    if (data.companyDescription) count++
    if (data.productCategory) count++
    count += data.existingCustomers.length
    count += data.businessModels.length
    count += data.industries.length
    count += data.companySizes.length
    count += data.companyStages.length
    count += data.targetRegions.length
    count += data.digitalPresence.length
    count += data.techSignals.length
    count += data.buyingSignals.length
    count += data.exclusionCriteria.length
    return count
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {view === 'save' ? 'Save as Template' : 'ICP Templates'}
          </DialogTitle>
          <DialogDescription>
            {view === 'save'
              ? 'Save your current ICP configuration for reuse.'
              : 'Load a saved template or save your current configuration.'}
          </DialogDescription>
        </DialogHeader>

        {view === 'save' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., LatAm Fintech B2B"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Targeting fintech companies in Latin America..."
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setView('list')}>
                Back
              </Button>
              <Button onClick={handleSave} disabled={saving || !name.trim()}>
                {saving ? (
                  <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="mr-1 h-4 w-4" /> Save Template</>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Save current config button */}
            {canSave && (
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setView('save')}
              >
                <Save className="mr-2 h-4 w-4" />
                Save current configuration as template
              </Button>
            )}

            {/* Template list */}
            {templates.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No templates saved yet. Fill in the guided builder and save your configuration.
              </p>
            ) : (
              <div className="max-h-[300px] overflow-y-auto rounded-md border divide-y">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleLoad(template)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{template.name}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {countFields(template.builder_data)} fields
                        </Badge>
                      </div>
                      {template.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {template.description}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(template.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-primary"
                        onClick={(e) => { e.stopPropagation(); handleLoad(template) }}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleDelete(template.id) }}
                        disabled={deletingId === template.id}
                      >
                        {deletingId === template.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
