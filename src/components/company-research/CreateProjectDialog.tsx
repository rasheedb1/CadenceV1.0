import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import type { ResearchProject } from '@/contexts/CompanyResearchContext'

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: { name: string; description?: string; research_prompt: string; auto_trigger_enabled?: boolean }) => Promise<void>
  editProject?: ResearchProject | null
}

export function CreateProjectDialog({ open, onOpenChange, onSubmit, editProject }: CreateProjectDialogProps) {
  const [name, setName] = useState(editProject?.name || '')
  const [description, setDescription] = useState(editProject?.description || '')
  const [researchPrompt, setResearchPrompt] = useState(editProject?.research_prompt || '')
  const [autoTrigger, setAutoTrigger] = useState(editProject?.auto_trigger_enabled || false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim() || !researchPrompt.trim()) return
    setIsSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        research_prompt: researchPrompt.trim(),
        auto_trigger_enabled: autoTrigger,
      })
      onOpenChange(false)
      setName('')
      setDescription('')
      setResearchPrompt('')
      setAutoTrigger(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editProject ? 'Edit Research Project' : 'New Research Project'}</DialogTitle>
          <DialogDescription>
            Create a research project with a custom prompt. Companies added to this project will be researched based on your prompt.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Project Name</Label>
            <Input
              id="name"
              placeholder="e.g., Enterprise SaaS Target Analysis"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              placeholder="Brief description of the research objective"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="prompt">Research Prompt</Label>
            <p className="text-xs text-muted-foreground">
              This prompt will guide the AI research for every company in this project. Be as detailed as possible.
            </p>
            <Textarea
              id="prompt"
              placeholder="Describe what you want to research about each company. For example: Analyze the company's product offering, pricing model, target market, recent funding rounds, key decision makers, competitive advantages, technology stack, and any recent news or press releases. Focus on identifying potential pain points that our solution could address..."
              value={researchPrompt}
              onChange={(e) => setResearchPrompt(e.target.value)}
              rows={10}
              className="min-h-[200px] resize-y"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label>Auto-trigger from Account Mapping</Label>
              <p className="text-xs text-muted-foreground">
                Automatically queue new companies discovered in Account Mapping for research
              </p>
            </div>
            <Switch
              checked={autoTrigger}
              onCheckedChange={setAutoTrigger}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !researchPrompt.trim() || isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editProject ? 'Save Changes' : 'Create Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
