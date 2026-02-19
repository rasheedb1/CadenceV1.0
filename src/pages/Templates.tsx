import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  FileText,
  Pencil,
  Trash2,
  Copy,
  MessageSquare,
  Mail,
  Linkedin,
} from 'lucide-react'
import { toast } from 'sonner'
import { PermissionGate } from '@/components/PermissionGate'

interface Template {
  id: string
  name: string
  step_type: 'send_email' | 'send_email_business_case' | 'linkedin_message' | 'linkedin_connect' | 'linkedin_like' | 'linkedin_comment' | 'whatsapp_message' | 'call_manual'
  subject_template: string | null
  body_template: string
  owner_id: string
  created_at: string
  updated_at: string
}

// Map step types to channels for display
const STEP_TYPE_TO_CHANNEL: Record<string, 'linkedin' | 'email' | 'whatsapp' | 'phone'> = {
  send_email: 'email',
  send_email_business_case: 'email',
  linkedin_message: 'linkedin',
  linkedin_connect: 'linkedin',
  linkedin_like: 'linkedin',
  linkedin_comment: 'linkedin',
  whatsapp_message: 'whatsapp',
  call_manual: 'phone',
}

const STEP_TYPES = [
  { value: 'linkedin_message', label: 'LinkedIn Message', icon: MessageSquare, channel: 'linkedin' },
  { value: 'linkedin_connect', label: 'LinkedIn Connect', icon: Linkedin, channel: 'linkedin' },
  { value: 'send_email', label: 'Email', icon: Mail, channel: 'email' },
  { value: 'send_email_business_case', label: 'Business Case Email', icon: Mail, channel: 'email' },
  { value: 'whatsapp_message', label: 'WhatsApp', icon: MessageSquare, channel: 'whatsapp' },
] as const

const VARIABLES = [
  { name: '{{first_name}}', description: 'Lead\'s first name' },
  { name: '{{last_name}}', description: 'Lead\'s last name' },
  { name: '{{company}}', description: 'Lead\'s company' },
  { name: '{{title}}', description: 'Lead\'s job title' },
  { name: '{{email}}', description: 'Lead\'s email address' },
  { name: '{{linkedin_url}}', description: 'Lead\'s LinkedIn profile URL' },
]

export function Templates() {
  const { user } = useAuth()
  const { orgId } = useOrg()
  const queryClient = useQueryClient()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    type: 'linkedin_message' as Template['step_type'],
    subject: '',
    body: '',
  })
  const createBodyTextareaRef = useRef<HTMLTextAreaElement>(null)
  const editBodyTextareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates', orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return []

      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching templates:', error)
        return []
      }

      return (data || []) as Template[]
    },
    enabled: !!user && !!orgId,
  })

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!user?.id) throw new Error('Not authenticated')

      const isEmailType = data.type === 'send_email' || data.type === 'send_email_business_case'

      const { error } = await supabase.from('templates').insert({
        name: data.name,
        step_type: data.type,
        subject_template: isEmailType ? data.subject : null,
        body_template: data.body,
        owner_id: user.id,
        org_id: orgId!,
      })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success('Template created successfully')
      setIsCreateOpen(false)
      resetForm()
    },
    onError: (error) => {
      toast.error(`Failed to create template: ${error.message}`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      if (!user?.id) throw new Error('Not authenticated')

      const isEmailType = data.type === 'send_email' || data.type === 'send_email_business_case'

      const { error } = await supabase
        .from('templates')
        .update({
          name: data.name,
          step_type: data.type,
          subject_template: isEmailType ? data.subject : null,
          body_template: data.body,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('org_id', orgId!)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success('Template updated successfully')
      setIsEditOpen(false)
      setEditingTemplate(null)
      resetForm()
    },
    onError: (error) => {
      toast.error(`Failed to update template: ${error.message}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('templates')
        .delete()
        .eq('id', id)
        .eq('org_id', orgId!)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success('Template deleted')
    },
    onError: (error) => {
      toast.error(`Failed to delete template: ${error.message}`)
    },
  })

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'linkedin_message',
      subject: '',
      body: '',
    })
  }

  const openEditDialog = (template: Template) => {
    setEditingTemplate(template)
    setFormData({
      name: template.name,
      type: template.step_type,
      subject: template.subject_template || '',
      body: template.body_template,
    })
    setIsEditOpen(true)
  }

  const insertVariable = (variable: string, isEdit: boolean = false) => {
    const textareaRef = isEdit ? editBodyTextareaRef : createBodyTextareaRef
    const textarea = textareaRef.current

    if (!textarea) {
      // Fallback: append to end if textarea ref not available
      setFormData((prev) => ({
        ...prev,
        body: prev.body + variable,
      }))
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentValue = formData.body
    const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end)

    setFormData((prev) => ({
      ...prev,
      body: newValue,
    }))

    // Restore cursor position after the inserted variable
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + variable.length, start + variable.length)
    }, 0)
  }

  const copyTemplate = (template: Template) => {
    navigator.clipboard.writeText(template.body_template)
    toast.success('Template copied to clipboard')
  }

  const getTypeIcon = (type: string) => {
    const found = STEP_TYPES.find((t) => t.value === type)
    return found?.icon || FileText
  }

  const getTypeColor = (type: string) => {
    const channel = STEP_TYPE_TO_CHANNEL[type]
    switch (channel) {
      case 'linkedin':
        return 'bg-blue-500/10 text-blue-500'
      case 'email':
        return 'bg-red-500/10 text-red-500'
      case 'whatsapp':
        return 'bg-green-500/10 text-green-500'
      case 'phone':
        return 'bg-orange-500/10 text-orange-500'
      default:
        return 'bg-gray-500/10 text-gray-500'
    }
  }

  const getTypeLabel = (type: string) => {
    const found = STEP_TYPES.find((t) => t.value === type)
    return found?.label || type
  }

  const isEmailType = (type: string) => {
    return type === 'send_email' || type === 'send_email_business_case'
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
          <h1 className="text-[28px] font-bold tracking-tight font-heading">Templates</h1>
          <p className="text-muted-foreground">
            Create reusable message templates with dynamic variables
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <PermissionGate permission="templates_create">
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                New Template
              </Button>
            </DialogTrigger>
          </PermissionGate>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Template</DialogTitle>
              <DialogDescription>
                Create a reusable message template with dynamic variables
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Template Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g., Initial Outreach"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="type">Template Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      type: value as Template['step_type'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STEP_TYPES.map((stepType) => (
                      <SelectItem key={stepType.value} value={stepType.value}>
                        <div className="flex items-center gap-2">
                          <stepType.icon className="h-4 w-4" />
                          {stepType.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isEmailType(formData.type) && (
                <div className="grid gap-2">
                  <Label htmlFor="subject">Subject Line</Label>
                  <Input
                    id="subject"
                    value={formData.subject}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, subject: e.target.value }))
                    }
                    placeholder="e.g., Quick question, {{first_name}}"
                  />
                </div>
              )}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="body">Message Body</Label>
                  <span className="text-xs text-muted-foreground">
                    Click variables below to insert at cursor
                  </span>
                </div>
                <Textarea
                  id="body"
                  ref={createBodyTextareaRef}
                  value={formData.body}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, body: e.target.value }))
                  }
                  placeholder="Hi {{first_name}}, I noticed you work at {{company}}..."
                  rows={6}
                />
                <div className="flex flex-wrap gap-2">
                  {VARIABLES.map((variable) => (
                    <Button
                      key={variable.name}
                      variant="outline"
                      size="sm"
                      onClick={() => insertVariable(variable.name, false)}
                      title={variable.description}
                    >
                      {variable.name}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.name || !formData.body || createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Template'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>Update your message template</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Template Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-type">Template Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    type: value as Template['step_type'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STEP_TYPES.map((stepType) => (
                    <SelectItem key={stepType.value} value={stepType.value}>
                      <div className="flex items-center gap-2">
                        <stepType.icon className="h-4 w-4" />
                        {stepType.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isEmailType(formData.type) && (
              <div className="grid gap-2">
                <Label htmlFor="edit-subject">Subject Line</Label>
                <Input
                  id="edit-subject"
                  value={formData.subject}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, subject: e.target.value }))
                  }
                />
              </div>
            )}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-body">Message Body</Label>
                <span className="text-xs text-muted-foreground">
                  Click variables below to insert at cursor
                </span>
              </div>
              <Textarea
                id="edit-body"
                ref={editBodyTextareaRef}
                value={formData.body}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, body: e.target.value }))
                }
                rows={6}
              />
              <div className="flex flex-wrap gap-2">
                {VARIABLES.map((variable) => (
                  <Button
                    key={variable.name}
                    variant="outline"
                    size="sm"
                    onClick={() => insertVariable(variable.name, true)}
                    title={variable.description}
                  >
                    {variable.name}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                editingTemplate &&
                updateMutation.mutate({ id: editingTemplate.id, data: formData })
              }
              disabled={!formData.name || !formData.body || updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Templates Grid */}
      {!templates || templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-medium">No templates yet</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Create your first template to speed up your outreach
            </p>
            <PermissionGate permission="templates_create">
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Template
              </Button>
            </PermissionGate>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const Icon = getTypeIcon(template.step_type)
            return (
              <Card key={template.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`rounded-lg p-2 ${getTypeColor(template.step_type)}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{template.name}</CardTitle>
                        <CardDescription>
                          {getTypeLabel(template.step_type)}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  {template.subject_template && (
                    <div className="mb-2">
                      <Badge variant="outline" className="text-xs">
                        Subject: {template.subject_template}
                      </Badge>
                    </div>
                  )}
                  <p className="mb-4 flex-1 text-sm text-muted-foreground line-clamp-4">
                    {template.body_template}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEditDialog(template)}
                    >
                      <Pencil className="mr-2 h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyTemplate(template)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this template?')) {
                          deleteMutation.mutate(template.id)
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
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
