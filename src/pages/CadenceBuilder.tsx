import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useCadence } from '@/contexts/CadenceContext'
import { useTestStep } from '@/hooks/useLinkedInActions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Mail,
  MessageSquare,
  UserPlus,
  ThumbsUp,
  MessageCircle,
  Phone,
  PhoneCall,
  Play,
  Send,
  Loader2,
  Settings,
  Users,
  CheckCircle,
  XCircle,
  Briefcase,
  PenSquare,
  ClipboardList,
  AlertTriangle,
  Upload,
} from 'lucide-react'
import { STEP_TYPE_CONFIG, type StepType, type CadenceStep, type Lead } from '@/types'
import { CreateLeadDialog } from '@/components/CreateLeadDialog'
import { ImportLeadsDialog } from '@/components/ImportLeadsDialog'

// Variable buttons for message templates
const VARIABLES = [
  { name: '{{first_name}}', label: 'First Name' },
  { name: '{{last_name}}', label: 'Last Name' },
  { name: '{{company}}', label: 'Company' },
  { name: '{{title}}', label: 'Title' },
  { name: '{{email}}', label: 'Email' },
]

// Step icons mapping
const STEP_ICONS: Record<StepType, React.ComponentType<{ className?: string }>> = {
  linkedin_message: MessageSquare,
  linkedin_connect: UserPlus,
  linkedin_like: ThumbsUp,
  linkedin_comment: MessageCircle,
  value_email: Mail,
  business_case_email: Briefcase,
  create_email: PenSquare,
  whatsapp: Phone,
  cold_call: PhoneCall,
  task: ClipboardList,
}

export function CadenceBuilder() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    cadences,
    leads,
    templates,
    updateCadence,
    createStep,
    updateStep,
    deleteStep,
    executeStepForLead,
    markStepDoneForLead,
    removeLeadFromCadence,
    getLeadDayInCadence,
  } = useCadence()
  const testStepMutation = useTestStep()

  const cadence = cadences.find((c) => c.id === id)
  const steps = cadence?.steps || []
  const cadenceLeads = leads.filter((l) => l.cadence_id === id && l.status === 'active')

  // State for add step dialog
  const [isAddStepOpen, setIsAddStepOpen] = useState(false)
  const [newStep, setNewStep] = useState<{
    step_type: StepType
    step_label: string
    day_offset: number
    message_template: string
    template_id: string
  }>({
    step_type: 'linkedin_message',
    step_label: '',
    day_offset: 0,
    message_template: '',
    template_id: '',
  })
  const [saving, setSaving] = useState(false)
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null)

  // State for edit mode
  const [isEditMode, setIsEditMode] = useState(false)

  // State for test step dialog
  const [isTestStepOpen, setIsTestStepOpen] = useState(false)
  const [testingStepId, setTestingStepId] = useState<string | null>(null)
  const [testStepConfig, setTestStepConfig] = useState<{
    leadId: string
    message: string
    postUrl: string
    comment: string
  }>({
    leadId: '',
    message: '',
    postUrl: '',
    comment: '',
  })
  const [selectedStepForTest, setSelectedStepForTest] = useState<CadenceStep | null>(null)

  // State for send/execute actions
  const [sendingLeadId, setSendingLeadId] = useState<string | null>(null)
  const [sendingAll, setSendingAll] = useState(false)
  const [leadMessages, setLeadMessages] = useState<Record<string, string>>({})

  // State for take out confirmation
  const [takeOutConfirmLead, setTakeOutConfirmLead] = useState<Lead | null>(null)

  // State for lead dialogs
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false)
  const [isImportLeadsOpen, setIsImportLeadsOpen] = useState(false)

  // Reset step label when type changes
  useEffect(() => {
    setNewStep((prev) => ({
      ...prev,
      step_label: STEP_TYPE_CONFIG[prev.step_type].label,
      message_template: '',
      template_id: '',
    }))
  }, [newStep.step_type])

  // Load template content when template is selected
  useEffect(() => {
    if (newStep.template_id && newStep.template_id !== 'none') {
      const template = templates.find((t) => t.id === newStep.template_id)
      if (template) {
        setNewStep((prev) => ({
          ...prev,
          message_template: template.body_template,
        }))
      }
    }
  }, [newStep.template_id, templates])

  if (!cadence) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Cadence not found</p>
      </div>
    )
  }

  // Group steps by day
  const stepsByDay = steps.reduce((acc, step) => {
    const day = step.day_offset
    if (!acc[day]) acc[day] = []
    acc[day].push(step)
    return acc
  }, {} as Record<number, CadenceStep[]>)

  const sortedDays = Object.keys(stepsByDay)
    .map(Number)
    .sort((a, b) => a - b)

  // Group leads by their current step
  const leadsByStep = cadenceLeads.reduce((acc, lead) => {
    const stepId = lead.current_step_id || 'unassigned'
    if (!acc[stepId]) acc[stepId] = []
    acc[stepId].push(lead)
    return acc
  }, {} as Record<string, Lead[]>)

  // Insert variable at cursor position
  const insertVariable = (variable: string) => {
    const textarea = messageTextareaRef.current
    if (!textarea) {
      setNewStep((prev) => ({
        ...prev,
        message_template: prev.message_template + variable,
      }))
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentValue = newStep.message_template
    const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end)

    setNewStep((prev) => ({
      ...prev,
      message_template: newValue,
    }))

    // Restore cursor position after the inserted variable
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + variable.length, start + variable.length)
    }, 0)
  }

  // Render message with variables replaced for preview
  const renderMessagePreview = (message: string, lead?: Lead) => {
    if (!lead) return message
    return message
      .replace(/\{\{first_name\}\}/g, lead.first_name || '')
      .replace(/\{\{last_name\}\}/g, lead.last_name || '')
      .replace(/\{\{company\}\}/g, lead.company || '')
      .replace(/\{\{title\}\}/g, lead.title || '')
      .replace(/\{\{email\}\}/g, lead.email || '')
  }

  const handleAddStep = async () => {
    if (!id) return
    setSaving(true)

    try {
      const daySteps = stepsByDay[newStep.day_offset] || []
      const orderInDay = daySteps.length

      await createStep({
        cadence_id: id,
        owner_id: '', // Will be set by context
        step_type: newStep.step_type,
        step_label: newStep.step_label || STEP_TYPE_CONFIG[newStep.step_type].label,
        day_offset: newStep.day_offset,
        order_in_day: orderInDay,
        config_json: {
          message_template: newStep.message_template,
          template_id: newStep.template_id && newStep.template_id !== 'none' ? newStep.template_id : null,
        },
      })

      setIsAddStepOpen(false)
      setNewStep({
        step_type: 'linkedin_message',
        step_label: '',
        day_offset: 0,
        message_template: '',
        template_id: '',
      })
      toast.success('Step added successfully')
    } catch (error) {
      console.error('Error adding step:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to add step')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteStep = async (stepId: string) => {
    if (confirm('Delete this step?')) {
      await deleteStep(stepId)
      toast.success('Step deleted')
    }
  }

  const handleMoveStep = async (step: CadenceStep, direction: 'up' | 'down') => {
    const daySteps = stepsByDay[step.day_offset].sort((a, b) => a.order_in_day - b.order_in_day)
    const currentIndex = daySteps.findIndex((s) => s.id === step.id)
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

    if (targetIndex < 0 || targetIndex >= daySteps.length) return

    const targetStep = daySteps[targetIndex]

    await Promise.all([
      updateStep(step.id, { order_in_day: targetStep.order_in_day }),
      updateStep(targetStep.id, { order_in_day: step.order_in_day }),
    ])
  }

  const handleUpdateStepDay = async (stepId: string, newDay: number) => {
    const daySteps = stepsByDay[newDay] || []
    await updateStep(stepId, {
      day_offset: newDay,
      order_in_day: daySteps.length,
    })
    toast.success('Step day updated')
  }

  const handleActivate = async () => {
    await updateCadence(id!, { status: 'active' })
    toast.success('Cadence activated')
  }

  const handleDeactivate = async () => {
    await updateCadence(id!, { status: 'draft' })
    toast.success('Cadence deactivated')
  }

  const handleOpenTestStep = (step: CadenceStep) => {
    setSelectedStepForTest(step)
    const config = step.config_json as Record<string, unknown>
    setTestStepConfig({
      leadId: cadenceLeads[0]?.id || '',
      message: (config?.message_template as string) || '',
      postUrl: '',
      comment: '',
    })
    setIsTestStepOpen(true)
  }

  const handleTestStep = async () => {
    if (!selectedStepForTest || !testStepConfig.leadId) {
      toast.error('Please select a lead to test with')
      return
    }

    setTestingStepId(selectedStepForTest.id)

    try {
      await testStepMutation.mutateAsync({
        stepType: selectedStepForTest.step_type,
        leadId: testStepConfig.leadId,
        message: testStepConfig.message || undefined,
        postUrl: testStepConfig.postUrl || undefined,
        comment: testStepConfig.comment || undefined,
      })

      toast.success(`Step "${selectedStepForTest.step_label}" executed successfully!`)
      setIsTestStepOpen(false)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
      toast.error(`Step failed: ${errorMessage}`)
    } finally {
      setTestingStepId(null)
    }
  }

  // Execute step for a single lead
  const handleExecuteStep = async (lead: Lead, step: CadenceStep) => {
    setSendingLeadId(lead.id)
    try {
      const config = step.config_json as Record<string, unknown>
      const messageTemplate = leadMessages[lead.id] || (config?.message_template as string) || ''
      const renderedMessage = renderMessagePreview(messageTemplate, lead)

      if (STEP_TYPE_CONFIG[step.step_type].isManual) {
        // Manual steps just mark as done
        await markStepDoneForLead(lead.id, step.id, cadence.id)
        toast.success(`Marked as done for ${lead.first_name}`)
      } else {
        await executeStepForLead({
          leadId: lead.id,
          stepId: step.id,
          cadenceId: cadence.id,
          message: renderedMessage,
        })
        await markStepDoneForLead(lead.id, step.id, cadence.id)
        toast.success(`Step executed for ${lead.first_name}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
      toast.error(`Failed: ${errorMessage}`)
    } finally {
      setSendingLeadId(null)
    }
  }

  // Execute step for all leads in a step with 3-second delays
  const handleExecuteAllForStep = async (step: CadenceStep) => {
    const leadsInStep = leadsByStep[step.id] || []
    if (leadsInStep.length === 0) {
      toast.error('No leads at this step')
      return
    }

    setSendingAll(true)
    const config = step.config_json as Record<string, unknown>

    for (let i = 0; i < leadsInStep.length; i++) {
      const lead = leadsInStep[i]
      try {
        const messageTemplate = leadMessages[lead.id] || (config?.message_template as string) || ''
        const renderedMessage = renderMessagePreview(messageTemplate, lead)

        if (STEP_TYPE_CONFIG[step.step_type].isManual) {
          await markStepDoneForLead(lead.id, step.id, cadence.id)
        } else {
          await executeStepForLead({
            leadId: lead.id,
            stepId: step.id,
            cadenceId: cadence.id,
            message: renderedMessage,
          })
          await markStepDoneForLead(lead.id, step.id, cadence.id)
        }
        toast.success(`Completed for ${lead.first_name}`)

        // Wait 3 seconds between each lead (except for the last one)
        if (i < leadsInStep.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 3000))
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
        toast.error(`Failed for ${lead.first_name}: ${errorMessage}`)
      }
    }

    setSendingAll(false)
    toast.success('All leads processed')
  }

  // Take lead out of cadence
  const handleTakeOutOfCadence = async (lead: Lead) => {
    setTakeOutConfirmLead(null)
    try {
      await removeLeadFromCadence(lead.id)
      toast.success(`${lead.first_name} removed from cadence`)
    } catch (error) {
      toast.error('Failed to remove lead from cadence')
    }
  }

  // Check if lead can execute step based on day
  const canExecuteStep = (lead: Lead, step: CadenceStep) => {
    if (isEditMode) return true // Edit mode bypasses day restrictions
    const leadDay = getLeadDayInCadence(lead)
    return leadDay >= step.day_offset
  }

  const getRequiredFieldsForStepType = (stepType: StepType): string[] => {
    switch (stepType) {
      case 'linkedin_message':
      case 'value_email':
      case 'business_case_email':
      case 'create_email':
        return ['message']
      case 'linkedin_like':
        return ['postUrl']
      case 'linkedin_comment':
        return ['postUrl', 'comment']
      case 'linkedin_connect':
      case 'whatsapp':
      case 'cold_call':
      case 'task':
        return []
      default:
        return []
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <Button variant="ghost" onClick={() => navigate('/cadences')} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Cadences
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{cadence.name}</h1>
            {cadence.description && (
              <p className="mt-1 text-muted-foreground">{cadence.description}</p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={cadence.status === 'active' ? 'default' : 'secondary'}>
                {cadence.status}
              </Badge>
              <span className="text-sm text-muted-foreground">{steps.length} steps</span>
              <span className="text-sm text-muted-foreground">
                {cadenceLeads.length} active leads
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsImportLeadsOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Import Leads
            </Button>
            <Button variant="outline" onClick={() => setIsAddLeadOpen(true)}>
              <Users className="mr-2 h-4 w-4" />
              Add Lead
            </Button>
            <Button
              variant={isEditMode ? 'default' : 'outline'}
              onClick={() => setIsEditMode(!isEditMode)}
            >
              <Settings className="mr-2 h-4 w-4" />
              {isEditMode ? 'Exit Edit Mode' : 'Edit Cadence'}
            </Button>
            {cadence.status === 'draft' ? (
              <Button onClick={handleActivate} disabled={steps.length === 0}>
                Activate Cadence
              </Button>
            ) : (
              <Button variant="outline" onClick={handleDeactivate}>
                Deactivate
              </Button>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="steps" className="space-y-6">
        <TabsList>
          <TabsTrigger value="steps">Steps</TabsTrigger>
          <TabsTrigger value="leads">
            Leads ({cadenceLeads.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="steps">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Cadence Steps</CardTitle>
                  <Button onClick={() => setIsAddStepOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Step
                  </Button>
                </CardHeader>
                <CardContent>
                  {steps.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-muted-foreground">No steps yet. Add your first step!</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {sortedDays.map((day) => (
                        <div key={day}>
                          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                            Day {day}
                          </h3>
                          <div className="space-y-2">
                            {stepsByDay[day]
                              .sort((a, b) => a.order_in_day - b.order_in_day)
                              .map((step, index) => {
                                const Icon = STEP_ICONS[step.step_type]
                                const config = STEP_TYPE_CONFIG[step.step_type]
                                const stepConfig = step.config_json as Record<string, unknown>
                                const leadsAtStep = leadsByStep[step.id] || []

                                return (
                                  <div
                                    key={step.id}
                                    className={`rounded-lg border p-4 ${leadsAtStep.length > 0 ? 'cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors' : ''}`}
                                    onClick={() => {
                                      if (leadsAtStep.length > 0) {
                                        navigate(`/cadences/${id}/step/${step.id}`)
                                      }
                                    }}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                                        <Icon className="h-5 w-5" />
                                      </div>
                                      <div className="flex-1">
                                        <p className="font-medium">{step.step_label}</p>
                                        <div className="flex items-center gap-2">
                                          <p className="text-sm text-muted-foreground">
                                            {config.channel}
                                          </p>
                                          {config.hasTextBox && (
                                            <Badge variant="outline" className="text-xs">
                                              Has message
                                            </Badge>
                                          )}
                                          {config.isManual && (
                                            <Badge variant="secondary" className="text-xs">
                                              Manual
                                            </Badge>
                                          )}
                                          <Badge
                                            variant={leadsAtStep.length > 0 ? "default" : "outline"}
                                            className={`text-xs ${leadsAtStep.length > 0 ? 'bg-primary' : ''}`}
                                          >
                                            {leadsAtStep.length} leads
                                          </Badge>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                        {isEditMode && (
                                          <Select
                                            value={step.day_offset.toString()}
                                            onValueChange={(value) =>
                                              handleUpdateStepDay(step.id, parseInt(value))
                                            }
                                          >
                                            <SelectTrigger className="w-24">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {Array.from({ length: 31 }, (_, i) => (
                                                <SelectItem key={i} value={i.toString()}>
                                                  Day {i}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        )}
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleOpenTestStep(step)}
                                          disabled={testingStepId === step.id}
                                        >
                                          {testingStepId === step.id ? (
                                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                          ) : (
                                            <Play className="mr-1 h-4 w-4" />
                                          )}
                                          Test
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          disabled={index === 0}
                                          onClick={() => handleMoveStep(step, 'up')}
                                        >
                                          <ChevronUp className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          disabled={index === stepsByDay[day].length - 1}
                                          onClick={() => handleMoveStep(step, 'down')}
                                        >
                                          <ChevronDown className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleDeleteStep(step.id)}
                                        >
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                      </div>
                                    </div>
                                    {config.hasTextBox && typeof stepConfig?.message_template === 'string' && stepConfig.message_template && (
                                      <div className="mt-3 rounded bg-muted p-3">
                                        <p className="text-sm text-muted-foreground">
                                          {stepConfig.message_template.substring(0, 150)}
                                          {stepConfig.message_template.length > 150 && '...'}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Execution Order</CardTitle>
                </CardHeader>
                <CardContent>
                  {steps.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Add steps to see the execution order
                    </p>
                  ) : (
                    <ol className="space-y-2">
                      {sortedDays.flatMap((day) =>
                        stepsByDay[day]
                          .sort((a, b) => a.order_in_day - b.order_in_day)
                          .map((step, index) => (
                            <li key={step.id} className="flex items-center gap-2 text-sm">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                                {sortedDays
                                  .slice(0, sortedDays.indexOf(day))
                                  .reduce((acc, d) => acc + stepsByDay[d].length, 0) +
                                  index +
                                  1}
                              </span>
                              <span>
                                Day {day}: {step.step_label}
                              </span>
                            </li>
                          ))
                      )}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="leads">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Leads by Step
              </CardTitle>
              <CardDescription>
                Manage leads in this cadence and execute steps
              </CardDescription>
            </CardHeader>
            <CardContent>
              {cadenceLeads.length === 0 ? (
                <div className="py-12 text-center">
                  <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    No active leads in this cadence. Add leads using the buttons above.
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Unassigned leads (no current step) */}
                  {leadsByStep['unassigned']?.length > 0 && (
                    <div>
                      <h3 className="mb-4 flex items-center gap-2 font-medium text-muted-foreground">
                        <AlertTriangle className="h-4 w-4" />
                        Unassigned ({leadsByStep['unassigned'].length})
                      </h3>
                      <div className="space-y-2">
                        {leadsByStep['unassigned'].map((lead) => (
                          <div
                            key={lead.id}
                            className="flex items-center justify-between rounded-lg border p-3"
                          >
                            <div>
                              <p className="font-medium">
                                {lead.first_name} {lead.last_name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {lead.company} {lead.title && `- ${lead.title}`}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setTakeOutConfirmLead(lead)}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Leads grouped by step */}
                  {sortedDays.flatMap((day) =>
                    stepsByDay[day]
                      .sort((a, b) => a.order_in_day - b.order_in_day)
                      .map((step) => {
                        const leadsAtStep = leadsByStep[step.id] || []
                        if (leadsAtStep.length === 0) return null

                        const Icon = STEP_ICONS[step.step_type]
                        const config = STEP_TYPE_CONFIG[step.step_type]
                        const stepConfig = step.config_json as Record<string, unknown>
                        const isManual = config.isManual

                        return (
                          <div key={step.id}>
                            <div className="mb-4 flex items-center justify-between">
                              <h3 className="flex items-center gap-2 font-medium">
                                <Icon className="h-4 w-4" />
                                Day {step.day_offset}: {step.step_label} ({leadsAtStep.length})
                              </h3>
                              <Button
                                size="sm"
                                onClick={() => handleExecuteAllForStep(step)}
                                disabled={sendingAll}
                              >
                                {sendingAll ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Processing...
                                  </>
                                ) : isManual ? (
                                  <>
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Done All
                                  </>
                                ) : step.step_type === 'linkedin_connect' ? (
                                  <>
                                    <UserPlus className="mr-2 h-4 w-4" />
                                    Connect All
                                  </>
                                ) : (
                                  <>
                                    <Send className="mr-2 h-4 w-4" />
                                    Send All
                                  </>
                                )}
                              </Button>
                            </div>
                            <div className="space-y-3">
                              {leadsAtStep.map((lead) => {
                                const leadDay = getLeadDayInCadence(lead)
                                const canExecute = canExecuteStep(lead, step)
                                const messageTemplate =
                                  leadMessages[lead.id] ||
                                  (stepConfig?.message_template as string) ||
                                  ''

                                return (
                                  <div
                                    key={lead.id}
                                    className={`rounded-lg border p-4 ${
                                      !canExecute ? 'opacity-60' : ''
                                    }`}
                                  >
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <p className="font-medium">
                                            {lead.first_name} {lead.last_name}
                                          </p>
                                          <Badge variant="outline" className="text-xs">
                                            Day {leadDay}
                                          </Badge>
                                          {!canExecute && (
                                            <Badge variant="secondary" className="text-xs">
                                              Not ready (Day {step.day_offset})
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                          {lead.company} {lead.title && `- ${lead.title}`}
                                        </p>
                                        {lead.email && (
                                          <p className="text-sm text-muted-foreground">
                                            {lead.email}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          onClick={() => handleExecuteStep(lead, step)}
                                          disabled={sendingLeadId === lead.id || (!canExecute && !isEditMode)}
                                        >
                                          {sendingLeadId === lead.id ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          ) : isManual ? (
                                            <CheckCircle className="mr-2 h-4 w-4" />
                                          ) : step.step_type === 'linkedin_connect' ? (
                                            <UserPlus className="mr-2 h-4 w-4" />
                                          ) : (
                                            <Send className="mr-2 h-4 w-4" />
                                          )}
                                          {isManual ? 'Done' : step.step_type === 'linkedin_connect' ? 'Connect' : 'Send'}
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => setTakeOutConfirmLead(lead)}
                                        >
                                          <XCircle className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>

                                    {/* Message editor for steps with text boxes */}
                                    {config.hasTextBox && (
                                      <div className="mt-4 space-y-2">
                                        <Label className="text-sm">
                                          {step.step_type === 'linkedin_connect' ? 'Connection Note (optional)' : 'Message'}
                                        </Label>
                                        <Textarea
                                          value={leadMessages[lead.id] ?? messageTemplate}
                                          onChange={(e) =>
                                            setLeadMessages((prev) => ({
                                              ...prev,
                                              [lead.id]: e.target.value,
                                            }))
                                          }
                                          placeholder={step.step_type === 'linkedin_connect' ? 'Add a note to your connection request (optional)...' : 'Enter message...'}
                                          rows={3}
                                          className="text-sm"
                                        />
                                        <div className="flex flex-wrap gap-1">
                                          {VARIABLES.map((v) => (
                                            <Button
                                              key={v.name}
                                              variant="outline"
                                              size="sm"
                                              className="h-6 px-2 text-xs"
                                              onClick={() => {
                                                const currentMsg =
                                                  leadMessages[lead.id] ?? messageTemplate
                                                setLeadMessages((prev) => ({
                                                  ...prev,
                                                  [lead.id]: currentMsg + v.name,
                                                }))
                                              }}
                                            >
                                              {v.name}
                                            </Button>
                                          ))}
                                        </div>
                                        {/* Preview */}
                                        <div className="rounded bg-muted p-2">
                                          <p className="text-xs text-muted-foreground">Preview:</p>
                                          <p className="text-sm">
                                            {renderMessagePreview(
                                              leadMessages[lead.id] ?? messageTemplate,
                                              lead
                                            )}
                                          </p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Step Dialog */}
      <Dialog open={isAddStepOpen} onOpenChange={setIsAddStepOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Step</DialogTitle>
            <DialogDescription>Configure a new step for your cadence</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Step Type</Label>
                <Select
                  value={newStep.step_type}
                  onValueChange={(value: StepType) =>
                    setNewStep((prev) => ({ ...prev, step_type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STEP_TYPE_CONFIG).map(([type, config]) => (
                      <SelectItem key={type} value={type}>
                        <div className="flex items-center gap-2">
                          {config.label}
                          {config.isManual && (
                            <Badge variant="secondary" className="text-xs">
                              Manual
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Day</Label>
                <Select
                  value={newStep.day_offset.toString()}
                  onValueChange={(value) =>
                    setNewStep((prev) => ({ ...prev, day_offset: parseInt(value) }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 31 }, (_, i) => (
                      <SelectItem key={i} value={i.toString()}>
                        Day {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                value={newStep.step_label}
                onChange={(e) => setNewStep((prev) => ({ ...prev, step_label: e.target.value }))}
                placeholder={STEP_TYPE_CONFIG[newStep.step_type].label}
              />
            </div>

            {/* Template selection for steps with text boxes */}
            {STEP_TYPE_CONFIG[newStep.step_type].hasTextBox && (
              <>
                <div className="space-y-2">
                  <Label>Template (optional)</Label>
                  <Select
                    value={newStep.template_id}
                    onValueChange={(value) =>
                      setNewStep((prev) => ({ ...prev, template_id: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No template</SelectItem>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Message Template</Label>
                    <span className="text-xs text-muted-foreground">
                      Click variables to insert at cursor
                    </span>
                  </div>
                  <Textarea
                    ref={messageTextareaRef}
                    value={newStep.message_template}
                    onChange={(e) =>
                      setNewStep((prev) => ({ ...prev, message_template: e.target.value }))
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
                        onClick={() => insertVariable(variable.name)}
                      >
                        {variable.name}
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddStepOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddStep} disabled={saving}>
              {saving ? 'Adding...' : 'Add Step'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Step Dialog */}
      <Dialog open={isTestStepOpen} onOpenChange={setIsTestStepOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Step</DialogTitle>
            <DialogDescription>
              {selectedStepForTest
                ? `Test "${selectedStepForTest.step_label}" with a lead`
                : 'Configure test parameters'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Lead</Label>
              <Select
                value={testStepConfig.leadId}
                onValueChange={(value) =>
                  setTestStepConfig((prev) => ({ ...prev, leadId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a lead..." />
                </SelectTrigger>
                <SelectContent>
                  {cadenceLeads.length === 0 ? (
                    <SelectItem value="no-leads" disabled>
                      No active leads in this cadence
                    </SelectItem>
                  ) : (
                    cadenceLeads.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>
                        {lead.first_name} {lead.last_name}
                        {lead.company ? ` - ${lead.company}` : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedStepForTest &&
              getRequiredFieldsForStepType(selectedStepForTest.step_type).includes('message') && (
                <div className="space-y-2">
                  <Label>Message</Label>
                  <Textarea
                    value={testStepConfig.message}
                    onChange={(e) =>
                      setTestStepConfig((prev) => ({ ...prev, message: e.target.value }))
                    }
                    placeholder="Enter the message to send..."
                    rows={4}
                  />
                </div>
              )}

            {selectedStepForTest &&
              getRequiredFieldsForStepType(selectedStepForTest.step_type).includes('postUrl') && (
                <div className="space-y-2">
                  <Label>Post URL</Label>
                  <Input
                    value={testStepConfig.postUrl}
                    onChange={(e) =>
                      setTestStepConfig((prev) => ({ ...prev, postUrl: e.target.value }))
                    }
                    placeholder="https://linkedin.com/posts/..."
                  />
                </div>
              )}

            {selectedStepForTest &&
              getRequiredFieldsForStepType(selectedStepForTest.step_type).includes('comment') && (
                <div className="space-y-2">
                  <Label>Comment</Label>
                  <Textarea
                    value={testStepConfig.comment}
                    onChange={(e) =>
                      setTestStepConfig((prev) => ({ ...prev, comment: e.target.value }))
                    }
                    placeholder="Enter your comment..."
                    rows={3}
                  />
                </div>
              )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTestStepOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleTestStep}
              disabled={testStepMutation.isPending || !testStepConfig.leadId}
            >
              {testStepMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Run Test
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Take Out of Cadence Confirmation */}
      <AlertDialog
        open={!!takeOutConfirmLead}
        onOpenChange={() => setTakeOutConfirmLead(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from Cadence</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{' '}
              <strong>
                {takeOutConfirmLead?.first_name} {takeOutConfirmLead?.last_name}
              </strong>{' '}
              from this cadence? They will no longer receive any scheduled outreach from this
              sequence.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => takeOutConfirmLead && handleTakeOutOfCadence(takeOutConfirmLead)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Lead Dialog */}
      <CreateLeadDialog
        open={isAddLeadOpen}
        onOpenChange={setIsAddLeadOpen}
        preSelectedCadenceId={id}
      />

      {/* Import Leads Dialog */}
      <ImportLeadsDialog
        open={isImportLeadsOpen}
        onOpenChange={setIsImportLeadsOpen}
        preSelectedCadenceId={id}
      />
    </div>
  )
}
